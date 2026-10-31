<?php

declare(strict_types=1);

/**
 * Admin API: dashboard, paginated lists, categories, delivery zones, promotions, banners,
 * settings, system status, newsletter, customers, admin account, and a full order lifecycle
 * (manual payment, shipping, delivery, partial refund, order emails).
 *
 *   php backend/tests/run.php AdminApi
 */

require __DIR__ . '/support/TestKit.php';

$t = new TestKit('AdminApi');
$admin = $t->adminSession('adminapi');
$A = static fn (string $method, string $path, array $opts = []): array
    => $t->http($method, $path, $opts + ['jar' => $admin['jar'], 'csrf' => $admin['csrf']]);
$adminId = $admin['id'];

$t->check('admin login works', true, $admin['csrf'] !== '');

// -----------------------------------------------------------------------------
$t->section('Dashboard');
$t->check('overview 7-day period', 7, TestKit::get($A('GET', '/admin/dashboard/overview?period=7'), 'data.period.days'));
$t->check('overview trend has one point per day', 30, count((array) TestKit::get($A('GET', '/admin/dashboard/overview?period=30'), 'data.trend')));
$t->ok('overview has deltas block', array_key_exists('gross_sales', (array) TestKit::get($A('GET', '/admin/dashboard/overview'), 'data.deltas')));
$t->check('invalid period falls back to 30', 30, TestKit::get($A('GET', '/admin/dashboard/overview?period=5'), 'data.period.days'));

// -----------------------------------------------------------------------------
$t->section('Pagination');
foreach (['inventory', 'inventory/logs', 'customers', 'payments', 'refunds', 'notifications/outbox', 'audit-logs', 'storefront/reviews', 'marketing/subscribers', 'orders'] as $path) {
    $t->check("GET {$path} paginates", 2, TestKit::get($A('GET', "/admin/{$path}?per_page=2"), 'data.pagination.per_page'));
}
$t->ok('audit-logs lists action filter values', is_array(TestKit::get($A('GET', '/admin/audit-logs'), 'data.filters.actions')));

// -----------------------------------------------------------------------------
$t->section('Categories');
$cats = $A('GET', '/admin/categories');
$t->ok('admin category list includes is_active', array_key_exists('is_active', (array) TestKit::get($cats, 'data.0')));
$slug = 'test-cat-' . bin2hex(random_bytes(3));
$res = $A('POST', '/admin/categories', ['json' => ['name' => 'Test Cat', 'slug' => $slug]]);
$t->check('create category', 201, $res['status']);
$cid = (int) TestKit::get($res, 'data.id');
$t->cleanup(fn () => $t->sql("DELETE FROM `categories` WHERE `id` = ?", 'i', [$cid]));
$t->check('duplicate slug refused', 422, $A('POST', '/admin/categories', ['json' => ['name' => 'Test Cat 2', 'slug' => $slug]])['status']);
$t->check('deactivate category', 200, $A('DELETE', "/admin/categories/{$cid}")['status']);
$t->check('hidden category still listed for admin', false, (function () use ($A, $cid) {
    foreach ((array) TestKit::get($A('GET', '/admin/categories'), 'data') as $c) {
        if ((int) $c['id'] === $cid) {
            return (bool) $c['is_active'];
        }
    }
    return null;
})());
$t->check('restore category', 'Category restored.', TestKit::get($A('PUT', "/admin/categories/{$cid}", ['json' => ['is_active' => true]]), 'message'));
$t->check('category actions audited with admin id', 3, (int) $t->scalar(
    "SELECT COUNT(*) FROM `admin_audit_logs` WHERE `entity_type` = 'category' AND `entity_id` = ? AND `admin_id` = ?",
    'si',
    [(string) $cid, $adminId]
));

// -----------------------------------------------------------------------------
$t->section('Delivery zones');
$t->check('zone list returns state list', 37, count((array) TestKit::get($A('GET', '/admin/shipping-zones'), 'data.states')));
$t->check('zone with misspelt state refused', 422, $A('POST', '/admin/shipping-zones', ['json' => ['name' => 'Bad', 'code' => 'TBAD', 'fee' => 1000, 'estimated_days' => '2 days', 'states_covered' => ['Lagoss']]])['status']);
$t->check('zone with negative fee refused', 422, $A('POST', '/admin/shipping-zones', ['json' => ['name' => 'Bad', 'code' => 'TBAD', 'fee' => -5, 'estimated_days' => '2 days', 'states_covered' => ['Kano']]])['status']);
$zcode = 'TZ' . strtoupper(bin2hex(random_bytes(3)));
$res = $A('POST', '/admin/shipping-zones', ['json' => ['name' => 'Test Zone', 'code' => $zcode, 'fee' => 2500, 'estimated_days' => '3 days', 'states_covered' => ['Abuja', 'kano'], 'is_active' => false]]);
$t->check('create zone (Abuja normalised to FCT)', ['FCT', 'Kano'], TestKit::get($res, 'data.states_covered'));
$zid = (int) TestKit::get($res, 'data.id');
$t->cleanup(fn () => $t->sql("DELETE FROM `shipping_zones` WHERE `code` = ?", 's', [$zcode]));
$t->check('duplicate zone code refused', 422, $A('POST', '/admin/shipping-zones', ['json' => ['name' => 'Dup', 'code' => $zcode, 'fee' => 1, 'estimated_days' => '1 day', 'states_covered' => ['Kano']]])['status']);
$t->check('update zone fee', 3000, TestKit::get($A('PUT', "/admin/shipping-zones/{$zid}", ['json' => ['fee' => 3000]]), 'data.fee'));
$t->check('delete zone', 200, $A('DELETE', "/admin/shipping-zones/{$zid}")['status']);
$t->check('zone actions audited', 3, (int) $t->scalar("SELECT COUNT(*) FROM `admin_audit_logs` WHERE `entity_type` = 'shipping_zone' AND `entity_id` = ?", 's', [(string) $zid]));

// Delivery fee by quantity: N1,000 covers 2 items, then N500 for each extra item.
$t->check('"items the fee covers" must be 1 or more', 422, $A('POST', '/admin/shipping-zones', ['json' => ['name' => 'Bad', 'code' => 'TBAD', 'fee' => 1000, 'items_included' => 0, 'estimated_days' => '2 days', 'states_covered' => ['Kano']]])['status']);
$qcode = 'TQ' . strtoupper(bin2hex(random_bytes(3)));
$qzone = $A('POST', '/admin/shipping-zones', ['json' => ['name' => 'Quantity Zone', 'code' => $qcode, 'fee' => 1000, 'items_included' => 2, 'extra_item_fee' => 500, 'estimated_days' => '3 days', 'states_covered' => ['Kano']]]);
$t->check('zone saved with its per-item rule', [2, 500.0], [TestKit::get($qzone, 'data.items_included'), (float) TestKit::get($qzone, 'data.extra_item_fee')]);
$qzid = (int) TestKit::get($qzone, 'data.id');
$t->cleanup(fn () => $t->sql("DELETE FROM `shipping_zones` WHERE `code` = ?", 's', [$qcode]));
$qv = $t->variant(5);
if ($qv !== null) {
    $quoteFor = static fn (int $qty): float => (float) TestKit::get($t->http('POST', '/checkout/quote', ['json' => [
        'items' => [['product_id' => (int) $qv['product_id'], 'variant_id' => (int) $qv['variant_id'], 'quantity' => $qty]],
        'shipping_address' => ['state' => 'Kano', 'country' => 'Nigeria'],
        'shipping_zone_id' => $qzid,
    ]]), 'data.shipping_fee');
    $t->check('1 or 2 items: the zone fee', [1000.0, 1000.0], [$quoteFor(1), $quoteFor(2)]);
    $t->check('3 items: + N500, 5 items: + N1,500', [1500.0, 2500.0], [$quoteFor(3), $quoteFor(5)]);
}

// -----------------------------------------------------------------------------
$t->section('Promotions');
$pcode = 'TP' . strtoupper(bin2hex(random_bytes(3)));
$t->cleanup(fn () => $t->sql("DELETE FROM `promotions` WHERE `code` = ?", 's', [$pcode]));
$t->check('end before start refused', 422, $A('POST', '/admin/promotions', ['json' => ['code' => $pcode, 'description' => 't', 'discount_percent' => 10, 'starts_at' => '2099-12-10', 'expires_at' => '2099-12-01']])['status']);
$t->check('95% discount refused', 422, $A('POST', '/admin/promotions', ['json' => ['code' => $pcode, 'description' => 't', 'discount_percent' => 95]])['status']);
$res = $A('POST', '/admin/promotions', ['json' => ['code' => $pcode, 'description' => 't', 'discount_percent' => 10, 'max_uses' => 0, 'starts_at' => '2099-12-01', 'expires_at' => '2099-12-31']]);
$t->check('create promotion with dates', 201, $res['status']);
$promoId = (int) TestKit::get($res, 'data.id');
$t->check('expiry stored as end of day', '2099-12-31 23:59:59', $t->scalar("SELECT `expires_at` FROM `promotions` WHERE `id` = ?", 'i', [$promoId]));
$A('PUT', "/admin/promotions/{$promoId}", ['json' => ['expires_at' => '2100-01-15']]);
$t->check('update expiry is saved', '2100-01-15 23:59:59', $t->scalar("SELECT `expires_at` FROM `promotions` WHERE `id` = ?", 'i', [$promoId]));
$t->check('not-yet-started code refused at checkout', false, TestKit::get($t->http('POST', '/checkout/validate-promo', ['json' => ['code' => $pcode, 'subtotal' => 10000]]), 'success'));
$t->check('unused promotion is deleted', true, TestKit::get($A('DELETE', "/admin/promotions/{$promoId}"), 'data.deleted'));

// Coupon rules: a fixed amount off, a minimum order, a cap on a percentage.
$fixed = 'TF' . strtoupper(bin2hex(random_bytes(3)));
$capped = 'TC' . strtoupper(bin2hex(random_bytes(3)));
$t->cleanup(fn () => $t->sql("DELETE FROM `promotions` WHERE `code` IN (?, ?)", 'ss', [$fixed, $capped]));
$t->check('a fixed code needs an amount', 422, $A('POST', '/admin/promotions', ['json' => ['code' => $fixed, 'description' => 't', 'discount_type' => 'fixed']])['status']);
$t->check('a fixed amount above the minimum order is refused', 422, $A('POST', '/admin/promotions', ['json' => ['code' => $fixed, 'description' => 't', 'discount_type' => 'fixed', 'discount_amount' => 25000, 'min_order_amount' => 20000]])['status']);
$t->check('create "N5,000 off orders of N20,000+"', 201, $A('POST', '/admin/promotions', ['json' => ['code' => $fixed, 'description' => 'Five off', 'discount_type' => 'fixed', 'discount_amount' => 5000, 'min_order_amount' => 20000]])['status']);
$t->check('create "10% off, at most N1,000"', 201, $A('POST', '/admin/promotions', ['json' => ['code' => $capped, 'description' => 'Ten capped', 'discount_type' => 'percent', 'discount_percent' => 10, 'max_discount_amount' => 1000]])['status']);
$list = (array) TestKit::get($A('GET', '/admin/promotions?per_page=100'), 'data.items');
$labels = array_column($list, 'label', 'code');
$t->check('admin list describes each code', ['₦5,000 off on orders of ₦20,000+', '10% off (up to ₦1,000)'], [$labels[$fixed] ?? null, $labels[$capped] ?? null]);
$promoCheck = static fn (string $code, float $subtotal): array => $t->http('POST', '/checkout/validate-promo', ['json' => ['code' => $code, 'subtotal' => $subtotal]]);
$below = $promoCheck($fixed, 15000);
$t->check('below the minimum: refused, saying how much more to add', [422, true], [$below['status'], str_contains((string) TestKit::get($below, 'error.message'), 'Add ₦5,000.00 more')]);
$t->check('at the minimum: N5,000 off', 5000.0, (float) TestKit::get($promoCheck($fixed, 20000), 'data.discount_amount'));
$t->check('10% of N50,000 is capped at N1,000', 1000.0, (float) TestKit::get($promoCheck($capped, 50000), 'data.discount_amount'));
$t->check('10% of N5,000 is N500 (under the cap)', 500.0, (float) TestKit::get($promoCheck($capped, 5000), 'data.discount_amount'));
$t->check('a fixed code never takes off more than the items cost', 0, (int) $t->scalar("SELECT COUNT(*) FROM `promotions` WHERE `code` = ? AND `discount_amount` > `min_order_amount`", 's', [$fixed]));
$fixedId = (int) $t->scalar("SELECT `id` FROM `promotions` WHERE `code` = ?", 's', [$fixed]);
$A('PUT', "/admin/promotions/{$fixedId}", ['json' => ['min_order_amount' => '']]);
$t->check('clearing the minimum saves it as none', null, $t->scalar("SELECT `min_order_amount` FROM `promotions` WHERE `id` = ?", 'i', [$fixedId]));
$t->check('the homepage shows the wording', true, in_array('₦5,000 off', array_column((array) TestKit::get($t->http('GET', '/storefront/homepage'), 'data.promotions'), 'label'), true));

// -----------------------------------------------------------------------------
$t->section('Banners');
$t->check('banner with javascript: link refused', 422, $A('POST', '/admin/storefront/banners', ['json' => ['title' => 'x', 'image_url' => '/uploads/x.jpg', 'cta_url' => 'javascript:alert(1)']])['status']);
$t->check('banner with protocol-relative link refused', 422, $A('POST', '/admin/storefront/banners', ['json' => ['title' => 'x', 'image_url' => '/uploads/x.jpg', 'cta_url' => '//evil.example']])['status']);
$res = $A('POST', '/admin/storefront/banners', ['json' => ['title' => 'Test banner', 'image_url' => '/uploads/x.jpg', 'cta_url' => '/category']]);
$t->check('valid banner created', 201, $res['status']);
$bid = (int) TestKit::get($res, 'data.id');
$t->cleanup(fn () => $t->sql("DELETE FROM `banners` WHERE `id` = ?", 'i', [$bid]));
$t->check('deleting a banner that does not exist -> 404, not "deleted"', 404, $A('DELETE', '/admin/storefront/banners/999999999')['status']);

// -----------------------------------------------------------------------------
$t->section('Settings');
$settings = $A('GET', '/admin/settings');
$t->ok('settings expose editable allowlist', in_array('store_whatsapp_phone', array_column((array) TestKit::get($settings, 'data.editable'), 'key'), true));
$t->ok('settings never expose secrets', !preg_match('/sk_(live|test)|secret/i', $settings['body']));
$t->check('unknown setting refused', 422, $A('PUT', '/admin/settings', ['json' => ['tax_rate' => '7.5']])['status']);
$t->check('bad email refused', 422, $A('PUT', '/admin/settings', ['json' => ['store_contact_email' => 'nope']])['status']);
$oldWa = $t->scalar("SELECT `value` FROM `store_settings` WHERE `key_name` = 'store_whatsapp_phone'");
$t->cleanup(function () use ($t, $oldWa): void {
    if ($oldWa === null) {
        $t->sql("DELETE FROM `store_settings` WHERE `key_name` = 'store_whatsapp_phone'");
    } else {
        $t->sql("UPDATE `store_settings` SET `value` = ? WHERE `key_name` = 'store_whatsapp_phone'", 's', [(string) $oldWa]);
    }
});
$t->check('save WhatsApp number in local format', 200, $A('PUT', '/admin/settings', ['json' => ['store_whatsapp_phone' => '0800 000 0404']])['status']);
$t->check('WhatsApp number is saved as +234 and used at checkout', '+2348000000404', TestKit::get($t->http('GET', '/checkout/payment-methods'), 'data.support_phone'));
$t->check('impossible WhatsApp number refused', 422, $A('PUT', '/admin/settings', ['json' => ['store_whatsapp_phone' => '0800 000']])['status']);

// Brand strip under the homepage banner.
$oldBrands = $t->scalar("SELECT `value` FROM `store_settings` WHERE `key_name` = 'storefront_brands'");
$t->cleanup(function () use ($t, $oldBrands): void {
    if ($oldBrands === null) {
        $t->sql("DELETE FROM `store_settings` WHERE `key_name` = 'storefront_brands'");
    } else {
        $t->sql("UPDATE `store_settings` SET `value` = ? WHERE `key_name` = 'storefront_brands'", 's', [(string) $oldBrands]);
    }
});
$saved = $A('PUT', '/admin/settings', ['json' => ['storefront_brands' => ' Nike,  New   Balance,, nike , Zara ']]);
$t->check('brand list saved tidy (spaces, blanks and repeats removed)', 'Nike, New Balance, Zara', TestKit::get($saved, 'data.storefront_brands'));
$t->check('homepage sends the brand list', ['Nike', 'New Balance', 'Zara'], TestKit::get($t->http('GET', '/storefront/homepage'), 'data.brands'));
$t->check('more than 20 brands refused', 422, $A('PUT', '/admin/settings', ['json' => ['storefront_brands' => implode(',', array_map(fn ($i) => "Brand {$i}", range(1, 21)))]])['status']);
$A('PUT', '/admin/settings', ['json' => ['storefront_brands' => '']]);
$t->check('an empty list hides the strip', [], TestKit::get($t->http('GET', '/storefront/homepage'), 'data.brands'));

$t->section('Payment method switches');
$t->cleanup(function () use ($t): void {
    $t->sql("DELETE FROM `store_settings` WHERE `key_name` IN ('payment_monnify_enabled', 'payment_kora_enabled', 'payment_whatsapp_enabled')");
});
$methodIds = fn (): array => array_column((array) TestKit::get($t->http('GET', '/checkout/payment-methods'), 'data.methods'), 'id');
$t->check('switch Kora off', 200, $A('PUT', '/admin/settings/payment-methods', ['json' => ['kora' => false]])['status']);
$t->ok('checkout no longer offers Kora', !in_array('kora', $methodIds(), true));
$t->ok('settings report Kora as switched off', TestKit::get($A('GET', '/admin/settings'), 'data.readonly.payment_methods.kora.enabled') === false);
$t->check('switching every method off is refused', 422, $A('PUT', '/admin/settings/payment-methods', ['json' => ['monnify' => false, 'kora' => false, 'whatsapp' => false]])['status']);
$t->check('switch Kora back on', 200, $A('PUT', '/admin/settings/payment-methods', ['json' => ['kora' => true]])['status']);
$t->ok('checkout offers Kora again', in_array('kora', $methodIds(), true));

// -----------------------------------------------------------------------------
$t->section('System status');
$sys = $A('GET', '/admin/system-status');
$t->ok('system status reports gateways, outbox and orders', TestKit::get($sys, 'data.payments.kora') !== null
    && TestKit::get($sys, 'data.mail.outbox_pending') !== null
    && TestKit::get($sys, 'data.orders.needs_attention') !== null);

// -----------------------------------------------------------------------------
$t->section('Newsletter');
$nemail = $t->uniq('news') . '@example.test';
$t->cleanup(fn () => $t->sql("DELETE FROM `newsletter_subscribers` WHERE `email` = ?", 's', [$nemail]));
$t->check('subscribe', 200, $t->http('POST', '/newsletter/subscribe', ['json' => ['email' => $nemail]])['status']);
$ntoken = (string) $t->scalar("SELECT `unsubscribe_token` FROM `newsletter_subscribers` WHERE `email` = ?", 's', [$nemail]);
$t->check('subscriber gets an unsubscribe token', 32, strlen($ntoken));
$t->check('every subscriber has a token', 0, (int) $t->scalar("SELECT COUNT(*) FROM `newsletter_subscribers` WHERE `unsubscribe_token` IS NULL"));
$active = (int) TestKit::get($A('GET', '/admin/marketing/subscribers'), 'data.counts.active');
$t->check('broadcast refused when the confirmed count is stale', 409, $A('POST', '/admin/marketing/broadcast', ['json' => ['subject' => 'Hi', 'content' => 'Hello', 'confirm_recipients' => $active + 5]])['status']);
$newsSubject = $t->uniq('Newsletter');
$t->cleanup(fn () => $t->sql("DELETE FROM `email_outbox` WHERE `template` = 'marketing_broadcast' AND JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.subject')) = ?", 's', [$newsSubject]));
$first = $A('POST', '/admin/marketing/broadcast', ['json' => ['subject' => $newsSubject, 'content' => 'Hello', 'confirm_recipients' => $active]]);
$t->check('broadcast queued for every active subscriber', [200, $active, 0], [$first['status'], TestKit::get($first, 'data.queued_count'), TestKit::get($first, 'data.already_queued_today')]);
$again = $A('POST', '/admin/marketing/broadcast', ['json' => ['subject' => $newsSubject, 'content' => 'Hello', 'confirm_recipients' => $active]]);
$t->check('sending the same newsletter again the same day queues nobody twice', [200, 0, $active], [$again['status'], TestKit::get($again, 'data.queued_count'), TestKit::get($again, 'data.already_queued_today')]);
$t->check('one email per subscriber', $active, (int) $t->scalar("SELECT COUNT(*) FROM `email_outbox` WHERE `template` = 'marketing_broadcast' AND JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.subject')) = ?", 's', [$newsSubject]));
$t->check('unsubscribe with bad token refused', 404, $t->http('POST', '/newsletter/unsubscribe', ['json' => ['token' => '0123456789abcdef0123456789abcdef']])['status']);
$t->check('unsubscribe', 200, $t->http('POST', '/newsletter/unsubscribe', ['json' => ['token' => $ntoken]])['status']);
$t->check('subscriber marked unsubscribed', 'unsubscribed', $t->scalar("SELECT `status` FROM `newsletter_subscribers` WHERE `email` = ?", 's', [$nemail]));

// -----------------------------------------------------------------------------
$t->section('Refund eligibility');
$t->check('eligibility for unknown order is 404', 404, $A('GET', '/admin/refunds/eligibility?order_number=ORD-NOPE')['status']);

// -----------------------------------------------------------------------------
$t->section('Customers');
$cemail = $t->uniq('cust') . '@example.test';
$cuid = (int) $t->db->insert(
    "INSERT INTO `users` (`uuid`, `email`, `full_name`, `role`, `status`, `email_verified_at`) VALUES (UUID(), ?, 'Test Customer', 'customer', 'active', NOW())",
    's',
    [$cemail]
);
$t->cleanup(fn () => $t->sql("DELETE FROM `users` WHERE `id` = ?", 'i', [$cuid]));
$t->sql(
    "INSERT INTO `sessions` (`id`, `user_id`, `last_activity`, `expires_at`) VALUES (SHA2(?, 256), ?, UNIX_TIMESTAMP(), DATE_ADD(NOW(), INTERVAL 1 DAY))",
    'si',
    [$t->uniq('sess'), $cuid]
);
$t->check('invalid customer status refused', 422, $A('PATCH', "/admin/customers/{$cuid}/status", ['json' => ['status' => 'unverified']])['status']);
$t->check('suspend customer', 200, $A('PATCH', "/admin/customers/{$cuid}/status", ['json' => ['status' => 'suspended']])['status']);
$t->check('suspension signs the customer out', 0, (int) $t->scalar("SELECT COUNT(*) FROM `sessions` WHERE `user_id` = ?", 'i', [$cuid]));
$t->check('customer detail loads', $cemail, TestKit::get($A('GET', "/admin/customers/{$cuid}"), 'data.customer.email'));

// -----------------------------------------------------------------------------
$t->section('Order lifecycle');
$variant = $t->variant(3);
if ($variant === null) {
    $t->ok('a published variant with stock exists', false);
} else {
    $email = $t->uniq('buyer') . '@example.test';
    $res = $t->http('POST', '/checkout/orders', [
        'headers' => ['Idempotency-Key: ' . bin2hex(random_bytes(16))],
        'json' => [
            'email' => $email,
            'items' => [['product_id' => (int) $variant['product_id'], 'variant_id' => (int) $variant['variant_id'], 'quantity' => 1]],
            'shipping_address' => ['full_name' => 'Admin Lifecycle', 'phone' => '08000000004', 'address_line1' => '4 Test Close', 'city' => 'Ikeja', 'state' => 'Lagos', 'country' => 'Nigeria'],
        ],
    ]);
    $t->check('guest order created', 201, $res['status']);
    $onum = (string) TestKit::get($res, 'data.order_number');
    $total = (float) TestKit::get($res, 'data.grand_total');
    $oid = (int) $t->scalar("SELECT `id` FROM `orders` WHERE `order_number` = ?", 's', [$onum]);
    $t->cleanup(function () use ($t, $oid, $email): void {
        foreach (['refunds', 'shipments', 'payments', 'order_status_history', 'order_items'] as $table) {
            $t->sql("DELETE FROM `{$table}` WHERE `order_id` = ?", 'i', [$oid]);
        }
        $t->sql("DELETE FROM `orders` WHERE `id` = ?", 'i', [$oid]);
        $t->sql("DELETE FROM `email_outbox` WHERE `recipient_email` = ?", 's', [$email]);
    });

    $outboxKey = static fn (string $key): int => (int) $t->scalar("SELECT COUNT(*) FROM `email_outbox` WHERE `dedup_key` = ?", 's', [$key]);
    $adminEmail = strtolower($admin['email']);
    $t->check('admins are emailed about the new order', 1, $outboxKey("admin_new_order:{$onum}:{$adminEmail}"));
    $detail = $A('GET', "/admin/orders/{$onum}");
    $t->check('admin sees the new order', 'pending_payment', TestKit::get($detail, 'data.order_status'));
    $t->check('unpaid order can only be cancelled', ['cancelled'], TestKit::get($detail, 'data.allowed_transitions'));
    $t->check('shipping an unpaid order is refused', 422, $A('POST', "/admin/orders/{$onum}/shipment", ['json' => ['carrier' => 'GIG', 'tracking_number' => 'T1', 'status' => 'in_transit']])['status']);
    $t->check('manual payment needs a reference', 422, $A('POST', "/admin/orders/{$onum}/confirm-payment", ['json' => ['reference' => 'ab']])['status']);
    $t->check('record manual payment', 200, $A('POST', "/admin/orders/{$onum}/confirm-payment", ['json' => ['reference' => 'BANK-' . bin2hex(random_bytes(4))]])['status']);
    $detail = $A('GET', "/admin/orders/{$onum}");
    $t->check('order is paid', 'paid', TestKit::get($detail, 'data.order_status'));
    $t->check('admins are emailed that the payment was received', 1, $outboxKey("admin_payment_received:{$onum}:{$adminEmail}"));
    $t->check('paid -> processing', 'processing', TestKit::get($A('PATCH', "/admin/orders/{$onum}/status", ['json' => ['status' => 'processing']]), 'data.order_status'));
    $t->check('the customer is emailed that the order is being prepared', 1, $outboxKey("order_status_update:{$onum}:processing"));
    $t->ok('paid order can be shipped', in_array('shipped', (array) TestKit::get($detail, 'data.allowed_transitions'), true));
    $t->check('PATCH status paid is refused', 422, $A('PATCH', "/admin/orders/{$onum}/status", ['json' => ['status' => 'paid']])['status']);

    $t->check('ship order', 200, $A('POST', "/admin/orders/{$onum}/shipment", ['json' => ['carrier' => 'GIG Logistics', 'tracking_number' => 'TRK' . random_int(1000, 9999), 'tracking_url' => 'https://example.test/track', 'status' => 'in_transit']])['status']);
    $t->check('order is shipped', 'shipped', TestKit::get($A('GET', "/admin/orders/{$onum}"), 'data.order_status'));
    $deliveredRes = $A('POST', "/admin/orders/{$onum}/delivered", ['json' => ['comment' => 'Signed for']]);
    $t->check('mark delivered', 200, $deliveredRes['status']);
    $t->ok('the answer keeps the activity log, including what was just done', count((array) TestKit::get($deliveredRes, 'data.audit_logs')) >= 1);
    $t->check('order is delivered', 'delivered', TestKit::get($A('GET', "/admin/orders/{$onum}"), 'data.order_status'));
    $t->check('the customer is emailed that the order was delivered', 1, $outboxKey("order_status_update:{$onum}:delivered"));
    $t->check('attention filter works', 200, $A('GET', '/admin/orders?status=attention')['status']);
    $t->ok('order list includes customer email', TestKit::get($A('GET', '/admin/orders?search=' . urlencode($onum)), 'data.items.0.customer_email') === $email);

    $elig = $A('GET', '/admin/refunds/eligibility?order_number=' . urlencode($onum));
    $t->check('refundable = amount paid', round($total, 2), round((float) TestKit::get($elig, 'data.refundable_amount'), 2));
    $partial = round($total / 2, 2);
    $res = $A('POST', '/admin/refunds', ['json' => ['order_number' => $onum, 'amount' => $partial, 'reason' => 'Test partial refund', 'status' => 'completed', 'restock' => false]]);
    $t->check('partial refund recorded', 201, $res['status']);
    $t->check('payment is partially refunded', 'partially_refunded', $t->scalar("SELECT `payment_status` FROM `orders` WHERE `id` = ?", 'i', [$oid]));
    $t->check('refund over the remaining amount refused', 422, $A('POST', '/admin/refunds', ['json' => ['order_number' => $onum, 'amount' => $total, 'reason' => 'Too much', 'status' => 'completed', 'restock' => false]])['status']);
    $t->check('remaining refundable shrinks', round($total - $partial, 2), round((float) TestKit::get($A('GET', '/admin/refunds/eligibility?order_number=' . urlencode($onum)), 'data.refundable_amount'), 2));

    // A refund request declined on an order that was never sent: back to processing, so it can ship.
    $email2 = $t->uniq('buyer2') . '@example.test';
    $res2 = $t->http('POST', '/checkout/orders', [
        'headers' => ['Idempotency-Key: ' . bin2hex(random_bytes(16))],
        'json' => [
            'email' => $email2,
            'items' => [['product_id' => (int) $variant['product_id'], 'variant_id' => (int) $variant['variant_id'], 'quantity' => 1]],
            'shipping_address' => ['full_name' => 'Declined Refund', 'phone' => '08000000004', 'address_line1' => '4 Test Close', 'city' => 'Ikeja', 'state' => 'Lagos', 'country' => 'Nigeria'],
        ],
    ]);
    $onum2 = (string) TestKit::get($res2, 'data.order_number');
    $oid2 = (int) $t->scalar("SELECT `id` FROM `orders` WHERE `order_number` = ?", 's', [$onum2]);
    $t->cleanup(function () use ($t, $oid2, $email2): void {
        foreach (['refunds', 'shipments', 'payments', 'order_status_history', 'order_items'] as $table) {
            $t->sql("DELETE FROM `{$table}` WHERE `order_id` = ?", 'i', [$oid2]);
        }
        $t->sql("DELETE FROM `orders` WHERE `id` = ?", 'i', [$oid2]);
        $t->sql("DELETE FROM `email_outbox` WHERE `recipient_email` = ?", 's', [$email2]);
    });
    $A('POST', "/admin/orders/{$onum2}/confirm-payment", ['json' => ['reference' => 'BANK-' . bin2hex(random_bytes(4))]]);
    $t->check('a shipping label can be created before dispatch', 200, $A('POST', "/admin/orders/{$onum2}/shipment", ['json' => ['carrier' => 'GIG Logistics', 'tracking_number' => 'LBL' . random_int(1000, 9999), 'status' => 'label_created']])['status']);
    $pending = $A('PATCH', "/admin/orders/{$onum2}/status", ['json' => ['status' => 'refund_pending', 'comment' => 'Customer asked for a refund']]);
    $t->check('an unsent paid order can be marked refund pending', 'refund_pending', TestKit::get($pending, 'data.order_status'));
    $t->check('declining it offers "processing" (a label alone is not "sent")', ['processing'], TestKit::get($pending, 'data.allowed_transitions'));
    $t->check('"delivered" is refused for an order that was never sent', 422, $A('PATCH', "/admin/orders/{$onum2}/status", ['json' => ['status' => 'delivered']])['status']);
    $t->check('declined: back to processing', 'processing', TestKit::get($A('PATCH', "/admin/orders/{$onum2}/status", ['json' => ['status' => 'processing', 'comment' => 'Refund declined']]), 'data.order_status'));
    $t->check('a declined refund moving the order back sends no "being prepared" email', 0, $outboxKey("order_status_update:{$onum2}:processing"));
    $t->check('and it can now be shipped', 200, $A('POST', "/admin/orders/{$onum2}/shipment", ['json' => ['carrier' => 'GIG Logistics', 'tracking_number' => 'TRK' . random_int(1000, 9999), 'status' => 'in_transit']])['status']);

    $lowOrOut = $A('GET', '/admin/inventory?filter=low_or_out&per_page=100');
    $rows = (array) TestKit::get($lowOrOut, 'data.items');
    $t->ok('"low or sold out" lists sold-out and low variants of products on sale, like the overview counts', $lowOrOut['status'] === 200 && array_reduce($rows, static fn (bool $ok, array $r): bool => $ok && (int) $r['stock_quantity'] <= (int) $r['low_stock_threshold'] && $r['product_status'] !== 'archived', true));

    foreach (['order_received', 'payment_verified', 'shipment_tracking', 'refund_processed'] as $tpl) {
        $row = $t->db->fetchOne("SELECT `status`, `transport` FROM `email_outbox` WHERE `recipient_email` = ? AND `template` = ? ORDER BY `id` DESC LIMIT 1", 'ss', [$email, $tpl]);
        $t->check("{$tpl} email logged", 'sent/log', $row ? "{$row['status']}/{$row['transport']}" : null);
    }
}

// -----------------------------------------------------------------------------
$t->section('Admin account');
$second = 'admin-second-' . $adminId;
$t->http('POST', '/auth/login', ['json' => ['email' => $admin['email'], 'password' => $admin['password']], 'jar' => $second]);
$t->check('wrong current password refused', 422, $A('PUT', '/admin/account', ['json' => ['full_name' => 'Test adminapi', 'current_password' => 'nope', 'new_password' => 'another-long-pass']])['status']);
$t->check('change password', 200, $A('PUT', '/admin/account', ['json' => ['full_name' => 'Test adminapi', 'current_password' => $admin['password'], 'new_password' => $admin['password'] . '-new']])['status']);
$t->check('other admin session signed out', 401, $t->http('GET', '/admin/account', ['jar' => $second])['status']);
$t->check('current session still works', 200, $A('GET', '/admin/account')['status']);

exit($t->finish());
