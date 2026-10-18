<?php

declare(strict_types=1);

/**
 * Reporting, exports, email outbox endpoints and the audit log.
 *
 * Builds its own data in the test database: a paid order with a completed partial refund and a
 * paid-then-cancelled order (refund owed), then checks that the analytics report, the overview
 * and the CSV exports agree with the database.
 *
 *   php backend/tests/run.php Reporting
 */

require __DIR__ . '/support/TestKit.php';

$t = new TestKit('Reporting');
$admin = $t->adminSession('reporting');
$adminId = $admin['id'];
$A = static fn (string $method, string $path, array $opts = []): array
    => $t->http($method, $path, $opts + ['jar' => $admin['jar'], 'csrf' => $admin['csrf']]);

/** Place a guest order for one unit and return [order_number, grand_total, order_id, email]. */
$placeOrder = static function () use ($t): ?array {
    $variant = $t->variant(2);
    if ($variant === null) {
        return null;
    }
    $email = $t->uniq('rep') . '@example.test';
    $res = $t->http('POST', '/checkout/orders', [
        'headers' => ['Idempotency-Key: ' . bin2hex(random_bytes(16))],
        'json' => [
            'email' => $email,
            'items' => [['product_id' => (int) $variant['product_id'], 'variant_id' => (int) $variant['variant_id'], 'quantity' => 1]],
            'shipping_address' => ['full_name' => 'Report Buyer', 'phone' => '08000000005', 'address_line1' => '5 Test Close', 'city' => 'Ikeja', 'state' => 'Lagos', 'country' => 'Nigeria'],
        ],
    ]);
    if ($res['status'] !== 201) {
        return null;
    }
    $onum = (string) TestKit::get($res, 'data.order_number');
    $oid = (int) $t->scalar("SELECT `id` FROM `orders` WHERE `order_number` = ?", 's', [$onum]);
    $t->cleanup(function () use ($t, $oid, $email): void {
        foreach (['refunds', 'shipments', 'payments', 'order_status_history', 'order_items'] as $table) {
            $t->sql("DELETE FROM `{$table}` WHERE `order_id` = ?", 'i', [$oid]);
        }
        $t->sql("DELETE FROM `orders` WHERE `id` = ?", 'i', [$oid]);
        $t->sql("DELETE FROM `email_outbox` WHERE `recipient_email` = ?", 's', [$email]);
    });
    return [$onum, (float) TestKit::get($res, 'data.grand_total'), $oid, $email];
};

// -----------------------------------------------------------------------------
$t->section('Audit');
$t->check('admin sign-in is audited', 1, (int) $t->scalar("SELECT COUNT(*) FROM `admin_audit_logs` WHERE `admin_id` = ? AND `action` = 'admin.login'", 'i', [$adminId]));
$t->check('no upper-case legacy action names', 0, (int) $t->scalar("SELECT COUNT(*) FROM `admin_audit_logs` WHERE BINARY `action` <> BINARY LOWER(`action`)"));

// -----------------------------------------------------------------------------
$t->section('Test data: paid order with partial refund, paid-then-cancelled order');
$paid = $placeOrder();
$cancelled = $placeOrder();
$t->ok('orders placed', $paid !== null && $cancelled !== null);
if ($paid !== null && $cancelled !== null) {
    [$paidNum, $paidTotal] = $paid;
    [$cancNum] = $cancelled;
    $t->check('paid order confirmed', 200, $A('POST', "/admin/orders/{$paidNum}/confirm-payment", ['json' => ['reference' => 'BANK-' . bin2hex(random_bytes(4))]])['status']);
    $t->check('partial refund completed', 201, $A('POST', '/admin/refunds', ['json' => ['order_number' => $paidNum, 'amount' => round($paidTotal / 4, 2), 'reason' => 'Report test', 'status' => 'completed', 'restock' => false]])['status']);
    $t->check('second order confirmed', 200, $A('POST', "/admin/orders/{$cancNum}/confirm-payment", ['json' => ['reference' => 'BANK-' . bin2hex(random_bytes(4))]])['status']);
    $t->check('second order cancelled after payment', 200, $A('PATCH', "/admin/orders/{$cancNum}/status", ['json' => ['status' => 'cancelled', 'comment' => 'Report test']])['status']);
}

// -----------------------------------------------------------------------------
$t->section('Analytics (all time) agrees with the database');
$report = $A('GET', '/admin/analytics/report?range=all');
$s = (array) TestKit::get($report, 'data.summary');
$dbGross = (float) $t->scalar("SELECT COALESCE(SUM(`amount`), 0) FROM `payments` WHERE `status` IN ('successful', 'partially_refunded', 'refunded') AND `verified_at` IS NOT NULL");
$dbRefunds = (float) $t->scalar("SELECT COALESCE(SUM(`amount`), 0) FROM `refunds` WHERE `status` = 'completed'");
$t->ok('there is revenue to check', $dbGross > 0);
$t->check('gross sales = verified payments', round($dbGross, 2), round((float) ($s['gross_sales'] ?? -1), 2));
$t->check('refunds = completed refunds', round($dbRefunds, 2), round((float) ($s['total_refunded'] ?? -1), 2));
$t->ok('net = gross − refunded − owed', abs((float) ($s['net_sales'] ?? 0) - max(0, (float) ($s['gross_sales'] ?? 0) - (float) ($s['total_refunded'] ?? 0) - (float) ($s['owed_refunds'] ?? 0))) < 0.01);
$data = (array) TestKit::get($report, 'data');
$t->ok('daily sales add up to gross', abs(array_sum(array_column($data['daily_breakdown'] ?? [], 'sales')) - (float) ($s['gross_sales'] ?? 0)) < 0.01);
$t->ok('daily refunds add up to refunded', abs(array_sum(array_column($data['daily_breakdown'] ?? [], 'refunds')) - (float) ($s['total_refunded'] ?? 0)) < 0.01);
$t->ok('gateway volumes add up to gross', abs(array_sum(array_column($data['gateway_breakdown'] ?? [], 'total_volume')) - (float) ($s['gross_sales'] ?? 0)) < 0.01);
$owedNumbers = array_column($data['owed_refunds'] ?? [], 'order_number');
if ($cancelled !== null) {
    $t->ok('cancelled-after-payment order is listed as owed', in_array($cancelled[0], $owedNumbers, true));
}
$t->ok('owed list total matches summary', abs(array_sum(array_map('floatval', array_column($data['owed_refunds'] ?? [], 'owed'))) - (float) ($s['owed_refunds'] ?? 0)) < 0.01);
$t->check('7-day range has exactly 7 days', 7, count((array) TestKit::get($A('GET', '/admin/analytics/report?range=7days'), 'data.daily_breakdown')));
$t->check('custom range includes both end dates', 3, count((array) TestKit::get($A('GET', '/admin/analytics/report?start_date=2026-10-01&end_date=2026-10-03'), 'data.daily_breakdown')));
$t->check('bad custom date refused', 422, $A('GET', '/admin/analytics/report?start_date=2026-13-01&end_date=2026-10-03')['status']);
$t->check('start after end refused', 422, $A('GET', '/admin/analytics/report?start_date=2026-10-05&end_date=2026-10-03')['status']);
$overviewGross = (float) TestKit::get($A('GET', '/admin/dashboard/overview?period=30'), 'data.kpis.gross_sales');
$reportGross = (float) TestKit::get($A('GET', '/admin/analytics/report?range=30days'), 'data.summary.gross_sales');
$t->ok('overview and report agree on 30-day gross', abs($overviewGross - $reportGross) < 0.01, "overview {$overviewGross} vs report {$reportGross}");

// -----------------------------------------------------------------------------
$t->section('CSV exports');
$csv = $A('GET', '/admin/analytics/export?range=all');
$t->check('analytics CSV downloads', 'text/csv; charset=UTF-8', $csv['headers']['content-type'] ?? null);
$t->ok('analytics CSV has the net sales line', (bool) preg_match('/^"Net sales \(NGN\)",/m', $csv['body']));
$countRows = static function (string $body): int {
    $f = fopen('php://memory', 'r+');
    fwrite($f, $body);
    rewind($f);
    $n = -1;
    while (fgetcsv($f) !== false) {
        $n++;
    }
    fclose($f);
    return $n;
};
$orders = $A('GET', '/admin/orders/export');
$t->check('orders CSV downloads', 200, $orders['status']);
$t->check('orders CSV defaults to all dates', (int) $t->scalar("SELECT COUNT(*) FROM `orders`"), $countRows($orders['body']));
$t->check('orders CSV honours status=attention', (int) $t->scalar("SELECT COUNT(*) FROM `orders` WHERE `requires_attention` = 1"), $countRows($A('GET', '/admin/orders/export?status=attention')['body']));
if ($paid !== null) {
    $t->check('orders CSV honours search', 1, $countRows($A('GET', '/admin/orders/export?search=' . urlencode($paid[0]))['body']));
}
$t->check('exports need an admin session', 401, $t->http('GET', '/admin/orders/export')['status']);

// -----------------------------------------------------------------------------
$t->section('Outbox');
$t->check('process endpoint answers', true, TestKit::get($A('POST', '/admin/notifications/outbox/process'), 'success'));
$t->ok('outbox list shows transport', array_key_exists('transport', (array) TestKit::get($A('GET', '/admin/notifications/outbox?per_page=1'), 'data.items.0')));
$cust = $t->uniq('magic') . '@example.test';
$t->cleanup(function () use ($t, $cust): void {
    $t->sql("DELETE FROM `email_verification_tokens` WHERE `email` = ?", 's', [$cust]);
    $t->sql("DELETE FROM `email_outbox` WHERE `recipient_email` = ?", 's', [$cust]);
    $t->sql("DELETE FROM `users` WHERE `email` = ?", 's', [$cust]);
});
$t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $cust]]);
$magic = $t->scalar("SELECT `id` FROM `email_outbox` WHERE `recipient_email` = ? AND `template` = 'magic_link' ORDER BY `id` DESC LIMIT 1", 's', [$cust]);
$t->ok('sign-in email recorded in the outbox', $magic !== null);
if ($magic !== null) {
    $t->check('sign-in link cannot be re-sent', 422, $A('POST', "/admin/notifications/outbox/{$magic}/retry")['status']);
    $t->ok('sign-in token never stored', !str_contains((string) $t->scalar("SELECT `payload` FROM `email_outbox` WHERE `id` = ?", 'i', [(int) $magic]), 'token='));
}
$t->check('legacy broadcasts never pending', 0, (int) $t->scalar("SELECT COUNT(*) FROM `email_outbox` WHERE `template` = 'marketing_broadcast' AND `status` = 'pending' AND JSON_EXTRACT(`payload`, '$.unsubscribe_url') IS NULL"));
$t->ok('system status reports oldest queued email', array_key_exists('oldest_due_minutes', (array) TestKit::get($A('GET', '/admin/system-status'), 'data.mail')));

// -----------------------------------------------------------------------------
$t->section('Sign-out is audited');
$A('POST', '/auth/logout?scope=admin');
$t->check('admin sign-out is audited', 1, (int) $t->scalar("SELECT COUNT(*) FROM `admin_audit_logs` WHERE `admin_id` = ? AND `action` = 'admin.logout'", 'i', [$adminId]));

exit($t->finish());
