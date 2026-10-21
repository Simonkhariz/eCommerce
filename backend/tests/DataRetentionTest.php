<?php

declare(strict_types=1);

/**
 * Data retention (admin → Data & storage): inactive customers lose their account and the
 * personal details on their orders, money records stay; storage health and the slow-request
 * log; the admin endpoints.
 *
 *   php backend/tests/run.php DataRetention
 */

require __DIR__ . '/support/TestKit.php';

use App\Services\DatabaseCleanup;
use App\Services\MailService;
use App\Services\StorageHealth;
use App\Support\SlowRequestLog;

$t = new TestKit('DataRetention');

$setting = static fn (string $key, string $value) => $t->sql(
    "INSERT INTO `store_settings` (`key_name`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    'ss',
    [$key, $value]
);
$t->cleanup(function () use ($setting): void {
    $setting('retention_customer_days', '0');
    $setting('retention_activity_days', '0');
    $setting('storage_alert_mb', '500');
});

/** A customer account last seen $days ago. */
$account = static function (string $email, int $seenDaysAgo, string $role = 'customer') use ($t): int {
    $id = (int) $t->db->insert(
        "INSERT INTO `users` (`uuid`, `email`, `full_name`, `phone`, `role`, `status`, `email_verified_at`, `last_seen_at`, `created_at`)
         VALUES (UUID(), ?, 'Retention Person', '08000000007', ?, 'active', NOW(), DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY))",
        'ssii',
        [$email, $role, $seenDaysAgo, $seenDaysAgo + 30]
    );
    $t->cleanup(fn () => $t->sql("DELETE FROM `users` WHERE `id` = ?", 'i', [$id]));
    return $id;
};

/** A paid order for $email in $status, last changed $days ago; stock is given back. */
$order = static function (string $email, string $status, int $daysAgo, ?int $userId = null) use ($t): ?int {
    $variant = $t->variant(2);
    if ($variant === null) {
        return null;
    }
    $res = $t->http('POST', '/checkout/orders', [
        'headers' => ['Idempotency-Key: ' . bin2hex(random_bytes(16))],
        'json' => [
            'email' => $email,
            'notes' => 'Leave with the gate man',
            'items' => [['product_id' => (int) $variant['product_id'], 'variant_id' => (int) $variant['variant_id'], 'quantity' => 1]],
            'shipping_address' => ['full_name' => 'Retention Buyer', 'phone' => '08000000008', 'address_line1' => '8 Old Road', 'city' => 'Ikeja', 'state' => 'Lagos', 'country' => 'Nigeria'],
        ],
    ]);
    if ($res['status'] !== 201) {
        return null;
    }
    $oid = (int) $t->scalar("SELECT `id` FROM `orders` WHERE `order_number` = ?", 's', [(string) TestKit::get($res, 'data.order_number')]);
    $t->cleanup(function () use ($t, $oid): void {
        foreach (['refunds', 'shipments', 'payments', 'order_status_history', 'order_items'] as $table) {
            $t->sql("DELETE FROM `{$table}` WHERE `order_id` = ?", 'i', [$oid]);
        }
        $t->sql("DELETE FROM `orders` WHERE `id` = ?", 'i', [$oid]);
    });
    $t->sql(
        "UPDATE `product_variants` v JOIN `order_items` oi ON oi.variant_id = v.id
         SET v.stock_quantity = v.stock_quantity + oi.quantity WHERE oi.order_id = ?",
        'i',
        [$oid]
    );
    $t->sql(
        "INSERT INTO `payments` (`order_id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `verified_at`)
         SELECT `id`, 'kora', ?, `grand_total`, 'NGN', 'successful', DATE_SUB(NOW(), INTERVAL ? DAY) FROM `orders` WHERE `id` = ?",
        'sii',
        ['RET-' . bin2hex(random_bytes(5)), $daysAgo, $oid]
    );
    $t->sql(
        "UPDATE `orders` SET `order_status` = ?, `payment_status` = 'successful', `expires_at` = NULL, `user_id` = ?,
                `created_at` = DATE_SUB(NOW(), INTERVAL ? DAY), `updated_at` = DATE_SUB(NOW(), INTERVAL ? DAY)
         WHERE `id` = ?",
        'siiii',
        [$status, $userId, $daysAgo + 5, $daysAgo, $oid]
    );
    return $oid;
};

$row = static fn (int $id): ?array => $t->db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [$id]);
$userExists = static fn (int $id): bool => (int) $t->scalar("SELECT COUNT(*) FROM `users` WHERE `id` = ?", 'i', [$id]) === 1;

// -----------------------------------------------------------------------------
$t->section('Settings');
$cleanup = new DatabaseCleanup($t->db);
$t->check('customer records are kept until the admin chooses', 0, $cleanup->settings()['retention_customer_days']);
$t->check('unfinished checkouts: 30 days by default', 30, $cleanup->settings()['retention_unpaid_days']);
$setting('retention_customer_days', '45');
$t->check('a value that is not offered falls back to the default', 0, $cleanup->settings()['retention_customer_days']);

// -----------------------------------------------------------------------------
$t->section('Test customers');
$guestOld = $t->uniq('ret-guest') . '@example.test';     // finished order 120 days ago   -> anonymised
$acctOld = $t->uniq('ret-acct') . '@example.test';       // account unused 200 days       -> deleted
$returning = $t->uniq('ret-back') . '@example.test';     // old order, but bought again    -> kept
$shippedOld = $t->uniq('ret-ship') . '@example.test';    // order still on its way        -> kept
$activeAcct = $t->uniq('ret-active') . '@example.test';  // signed in 10 days ago          -> kept
$flaggedOld = $t->uniq('ret-flag') . '@example.test';    // order flagged for the admin   -> kept
$adminOld = $t->uniq('ret-admin') . '@example.test';     // admin, never removed

$acctOldId = $account($acctOld, 200);
$t->sql(
    "INSERT INTO `addresses` (`user_id`, `recipient_name`, `phone`, `street_address`, `city`, `state`) VALUES (?, 'Retention Person', '08000000007', '9 Saved St', 'Ikeja', 'Lagos')",
    'i',
    [$acctOldId]
);
$activeAcctId = $account($activeAcct, 10);
$adminOldId = $account($adminOld, 400, 'admin');

$orders = [
    'guestOld' => $order($guestOld, 'delivered', 120),
    'acctOld' => $order($acctOld, 'completed', 150, $acctOldId),
    'returningOld' => $order($returning, 'delivered', 200),
    'returningNew' => $order($returning, 'delivered', 10),
    'shippedOld' => $order($shippedOld, 'shipped', 200),
    'activeAcct' => $order($activeAcct, 'delivered', 200, $activeAcctId),
    'flaggedOld' => $order($flaggedOld, 'delivered', 200),
];
$t->ok('test orders placed', !in_array(null, $orders, true));
$t->sql("UPDATE `orders` SET `requires_attention` = 1, `attention_reason` = 'test', `updated_at` = `updated_at` WHERE `id` = ?", 'i', [$orders['flaggedOld']]);
$before = $row($orders['guestOld']);

// -----------------------------------------------------------------------------
$t->section('Preview');
$setting('retention_customer_days', '90');
$preview = $cleanup->run(true);
$t->ok('preview counts at least the two inactive customers', ($preview['inactive_customers'] ?? 0) >= 2, json_encode($preview));
$t->ok('preview counts the account', ($preview['inactive_customer_accounts'] ?? 0) >= 1);
$t->ok('preview changes nothing', $userExists($acctOldId) && $row($orders['guestOld'])['guest_email'] === $guestOld);

// -----------------------------------------------------------------------------
$t->section('Clean-up');
$removed = $cleanup->run(false, 'admin');
$t->ok('inactive customers handled', ($removed['inactive_customers'] ?? 0) >= 2, json_encode($removed));

$g = $row($orders['guestOld']);
$snapshot = json_decode((string) $g['shipping_address_snapshot'], true);
$t->check('guest email removed', '', $g['guest_email']);
$t->check('address keeps only city, state and country', ['city' => 'Ikeja', 'state' => 'Lagos', 'country' => 'Nigeria'], $snapshot);
$t->check('customer note removed', null, $g['notes']);
$t->ok('old guest link no longer opens the order', $g['guest_access_token_hash'] !== $before['guest_access_token_hash']);
$t->ok('removal date recorded', $g['personal_data_removed_at'] !== null);
$t->check('total kept', $before['grand_total'], $g['grand_total']);
$t->check('last-changed date kept (reports use it)', $before['updated_at'], $g['updated_at']);
$t->check('items kept', 1, (int) $t->scalar("SELECT COUNT(*) FROM `order_items` WHERE `order_id` = ?", 'i', [$orders['guestOld']]));
$t->check('payment kept', 1, (int) $t->scalar("SELECT COUNT(*) FROM `payments` WHERE `order_id` = ? AND `status` = 'successful'", 'i', [$orders['guestOld']]));

$t->ok('unused account deleted', !$userExists($acctOldId));
$t->check('its saved address went with it', 0, (int) $t->scalar("SELECT COUNT(*) FROM `addresses` WHERE `user_id` = ?", 'i', [$acctOldId]));
$a = $row($orders['acctOld']);
$t->ok('its order is kept, anonymised', $a !== null && $a['user_id'] === null && $a['guest_email'] === '' && $a['personal_data_removed_at'] !== null);

$t->check('customer who bought again keeps the old order details', $returning, $row($orders['returningOld'])['guest_email']);
$t->check('order still on its way is untouched', $shippedOld, $row($orders['shippedOld'])['guest_email']);
$t->ok('recently active account is kept', $userExists($activeAcctId));
$t->check('and its old order keeps the details', $activeAcct, $row($orders['activeAcct'])['guest_email']);
$t->check('order flagged for the admin is untouched', $flaggedOld, $row($orders['flaggedOld'])['guest_email']);
$t->ok('admin account is never removed', $userExists($adminOldId));
$t->check('a second run finds nothing new for these customers', 0, (int) $t->scalar(
    "SELECT COUNT(*) FROM `orders` WHERE `id` IN (?, ?) AND `personal_data_removed_at` IS NULL",
    'ii',
    [$orders['guestOld'], $orders['acctOld']]
));
$t->check('the run is recorded', 'admin', $cleanup->lastRun()['source'] ?? null);

// -----------------------------------------------------------------------------
$t->section('Signing in counts as activity');
$seenEmail = $t->uniq('ret-seen') . '@example.test';
$seenId = $account($seenEmail, 300);
$t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $seenEmail]]);
$link = $t->magicLinkToken($seenEmail);
$t->check('customer signs in', 200, $t->http('POST', '/auth/customer/verify', ['jar' => 'seen', 'json' => ['token' => (string) $link]])['status']);
$t->http('GET', '/auth/me', ['jar' => 'seen']);
$t->ok('last seen is now', (int) $t->scalar("SELECT TIMESTAMPDIFF(MINUTE, `last_seen_at`, NOW()) FROM `users` WHERE `id` = ?", 'i', [$seenId]) < 5);

// -----------------------------------------------------------------------------
$t->section('Slow requests and health');
$t->cleanup(fn () => $t->sql("DELETE FROM `api_slow_requests` WHERE `route` = '/api/v1/test/slow'"));
SlowRequestLog::record('GET', '/api/v1/test/slow', microtime(true) - 2.5);
SlowRequestLog::record('GET', '/api/v1/test/slow', microtime(true) - 3.0);
SlowRequestLog::record('GET', '/api/v1/test/slow', microtime(true));        // fast: not recorded
SlowRequestLog::record('GET', null, microtime(true) - 5.0);                  // unknown route: not recorded
$slow = $t->db->fetchOne("SELECT `hits`, `max_ms` FROM `api_slow_requests` WHERE `route` = '/api/v1/test/slow'");
$t->check('two slow requests counted in one row', 2, (int) ($slow['hits'] ?? 0));
$t->ok('slowest time kept', (int) ($slow['max_ms'] ?? 0) >= 2900);

$health = (new StorageHealth($t->db))->report(true);
$t->ok('health has a level', in_array($health['level'], ['ok', 'warning', 'critical'], true));
$t->ok('database size measured', $health['database']['size_bytes'] > 0);
$t->ok('slow requests in the report', $health['slow_requests']['last_24h'] >= 2);
$t->ok('typical query time measured', isset($health['queries']['typical_ms']));
$t->ok('clean-up ran just now, so no overdue warning', !in_array('cleanup', array_column($health['issues'], 'code'), true));

$setting('storage_alert_mb', '1');
$t->check('an unknown size limit falls back to 500 MB', 500, (new StorageHealth($t->db))->alertMb());

// -----------------------------------------------------------------------------
$t->section('Admin endpoints');
$t->check('signed out: 401', 401, $t->http('GET', '/admin/data')['status']);
$admin = $t->adminSession('retention');
$A = static fn (string $method, string $path, array $opts = []): array
    => $t->http($method, $path, $opts + ['jar' => $admin['jar'], 'csrf' => $admin['csrf']]);

$overview = $A('GET', '/admin/data');
$t->check('overview 200', 200, $overview['status']);
$t->check('overview has the saved customer period', 90, TestKit::get($overview, 'data.settings.retention_customer_days'));
$t->ok('overview lists the choices', in_array(365, (array) TestKit::get($overview, 'data.options.retention_customer_days'), true));
$t->ok('overview has the health report', TestKit::get($overview, 'data.health.database.size_bytes') > 0);
$t->ok('overview has what a clean-up would remove', is_array(TestKit::get($overview, 'data.health.cleanup.waiting')));
$t->ok('alert endpoint answers', in_array(TestKit::get($A('GET', '/admin/data/alert'), 'data.level'), ['ok', 'warning', 'critical'], true));

$t->check('a value that is not offered: 422', 422, $A('PUT', '/admin/data/settings', ['json' => ['retention_customer_days' => 45]])['status']);
$t->check('an unknown setting: 422', 422, $A('PUT', '/admin/data/settings', ['json' => ['store_name' => 'x']])['status']);
$saved = $A('PUT', '/admin/data/settings', ['json' => ['retention_customer_days' => 365, 'storage_alert_mb' => 1000]]);
$t->check('valid settings saved', 365, TestKit::get($saved, 'data.retention_customer_days'));
$t->check('size limit saved', 1000, TestKit::get($saved, 'data.storage_alert_mb'));
$t->ok('change is in the audit log', (int) $t->scalar("SELECT COUNT(*) FROM `admin_audit_logs` WHERE `admin_id` = ? AND `action` = 'data_retention.update'", 'i', [$admin['id']]) === 1);
$t->check('settings change needs CSRF', 403, $t->http('PUT', '/admin/data/settings', ['jar' => $admin['jar'], 'json' => ['retention_unpaid_days' => 7]])['status']);

$waitingCustomers = (int) TestKit::get($A('GET', '/admin/data'), 'data.health.cleanup.waiting.inactive_customers');
$t->check('clean-up without the reviewed count: 409', 409, $A('POST', '/admin/data/cleanup', ['json' => []])['status']);
$t->check('clean-up with a stale count: 409', 409, $A('POST', '/admin/data/cleanup', ['json' => ['expected_customers' => $waitingCustomers + 1]])['status']);
$run = $A('POST', '/admin/data/cleanup', ['json' => ['expected_customers' => $waitingCustomers]]);
$t->check('clean-up runs', 200, $run['status']);
$t->ok('clean-up reports what it removed', is_array(TestKit::get($run, 'data.removed')));
$t->ok('clean-up is in the audit log', (int) $t->scalar("SELECT COUNT(*) FROM `admin_audit_logs` WHERE `admin_id` = ? AND `action` = 'data.cleanup'", 'i', [$admin['id']]) === 1);

// -----------------------------------------------------------------------------
$t->section('Alert email to the admins');
$t->cleanup(fn () => $t->sql("DELETE FROM `email_outbox` WHERE `template` = 'storage_alert'"));
$report = ['level' => 'warning', 'issues' => [['level' => 'warning', 'code' => 'size', 'title' => 'The database is getting large', 'detail' => 'It is 420 MB.']]];
$mail = new MailService($t->db);
$t->ok('alert queued for the admins', $mail->sendStorageAlertToAdmins($report) >= 1);
$alertRow = $t->db->fetchOne("SELECT `subject`, `payload` FROM `email_outbox` WHERE `template` = 'storage_alert' AND `recipient_email` = ?", 's', [strtolower($admin['email'])]);
$t->check('subject says what it is about', 'Your store database needs attention', $alertRow['subject'] ?? null);
$t->ok('the problem is in the email', str_contains((string) ($alertRow['payload'] ?? ''), 'getting large'));
$mail->sendStorageAlertToAdmins($report);
$t->check('not sent twice in the same week', 1, (int) $t->scalar("SELECT COUNT(*) FROM `email_outbox` WHERE `template` = 'storage_alert' AND `recipient_email` = ?", 's', [strtolower($admin['email'])]));

exit($t->finish());
