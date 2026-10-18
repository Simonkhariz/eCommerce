<?php

declare(strict_types=1);

/**
 * Phase 2 integration test: orders, payments, stock and fulfilment integrity.
 *
 * Runs against the configured database (DB_DATABASE) and, for HTTP checks, the running API
 * (API_URL, default http://127.0.0.1:8000/api/v1). It creates its own category, product,
 * promotion and temporary admin, and deletes everything it created when it finishes.
 *
 * Usage: php backend/tests/PaymentIntegrityTest.php
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Services\CheckoutService;
use App\Services\FulfillmentService;
use App\Services\KoraService;
use App\Services\MonnifyService;
use App\Services\PaymentFinalizer;

Env::load(BASE_PATH . '/.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Africa/Lagos') ?: 'Africa/Lagos');

if (getenv('SHOPCO_ENV_FILE') === false && getenv('ALLOW_DEV_DB') !== '1') {
    fwrite(STDERR, "Run this through php backend/tests/run.php (throw-away database), or set ALLOW_DEV_DB=1 to use the configured database on purpose.
");
    exit(2);
}

$api = rtrim(getenv('API_URL') ?: 'http://127.0.0.1:8000/api/v1', '/');
$db = Database::getInstance();
$pass = 0;
$fail = 0;

function check(string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    if ($ok) {
        $pass++;
        echo "PASS  {$name}\n";
    } else {
        $fail++;
        echo "FAIL  {$name}" . ($detail !== '' ? " ({$detail})" : '') . "\n";
    }
}

function expectThrows(string $name, callable $fn, string $contains = ''): void
{
    try {
        $fn();
        check($name, false, 'no exception');
    } catch (Throwable $e) {
        check($name, $contains === '' || stripos($e->getMessage(), $contains) !== false, $e->getMessage());
    }
}

function http(string $method, string $url, ?string $body = null, array $headers = [], ?string $jar = null): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HEADER => true,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    if ($jar !== null) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $jar);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $jar);
    }
    $raw = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $text = substr($raw, $headerSize);
    return ['status' => $status, 'headers' => substr($raw, 0, $headerSize), 'text' => $text, 'json' => json_decode($text, true)];
}

function orderRow(string $orderNumber): array
{
    return Database::getInstance()->fetchOne("SELECT * FROM `orders` WHERE `order_number` = ?", 's', [$orderNumber]);
}

function stockOf(int $variantId): int
{
    return (int) Database::getInstance()->fetchOne("SELECT `stock_quantity` FROM `product_variants` WHERE `id` = ?", 'i', [$variantId])['stock_quantity'];
}

$stamp = date('His') . bin2hex(random_bytes(2));
$created = ['orders' => [], 'users' => []];
$maxIds = [];
foreach (['admin_audit_logs', 'email_outbox', 'payment_webhook_events', 'inventory_logs'] as $t) {
    $maxIds[$t] = (int) ($db->fetchOne("SELECT COALESCE(MAX(id), 0) AS m FROM `{$t}`")['m']);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
$zone = $db->fetchOne("SELECT * FROM `shipping_zones` WHERE `is_active` = 1 AND JSON_SEARCH(LOWER(`states_covered`), 'one', 'lagos') IS NOT NULL LIMIT 1");
if ($zone === null) {
    fwrite(STDERR, "No active shipping zone covering Lagos; cannot run checkout tests.\n");
    exit(1);
}

$categoryId = (int) $db->insert(
    "INSERT INTO `categories` (`name`, `slug`, `description`, `display_order`, `is_active`) VALUES (?, ?, 'Phase 2 test', 99, 1)",
    'ss',
    ["P2 Test {$stamp}", "p2-test-{$stamp}"]
);
$productId = (int) $db->insert(
    "INSERT INTO `products` (`uuid`, `category_id`, `name`, `slug`, `description`, `product_type`, `status`, `base_price`, `currency`, `sku`)
     VALUES (UUID(), ?, ?, ?, 'Integrity test product', 'physical', 'published', 10000.00, 'NGN', ?)",
    'isss',
    [$categoryId, "P2 Tee {$stamp}", "p2-tee-{$stamp}", "P2-{$stamp}"]
);
$variantA = (int) $db->insert(
    "INSERT INTO `product_variants` (`product_id`, `sku`, `size`, `color_name`, `color_hex`, `stock_quantity`) VALUES (?, ?, 'Medium', 'Black', '#000000', 10)",
    'is',
    [$productId, "P2-{$stamp}-M-BLK"]
);
$variantB = (int) $db->insert(
    "INSERT INTO `product_variants` (`product_id`, `sku`, `size`, `color_name`, `color_hex`, `price_override`, `stock_quantity`) VALUES (?, ?, 'Large', 'White', '#ffffff', 12000.00, 5)",
    'is',
    [$productId, "P2-{$stamp}-L-WHT"]
);
$promoCode = strtoupper("P2UNL{$stamp}");
$db->insert(
    "INSERT INTO `promotions` (`code`, `description`, `discount_percent`, `max_uses`, `used_count`, `is_active`) VALUES (?, 'Unlimited test promo', 10, 0, 0, 1)",
    's',
    [$promoCode]
);

$checkout = new CheckoutService($db);
$fulfillment = new FulfillmentService($db);
$finalizer = new PaymentFinalizer($db);
$koraMock = new KoraService($db, static function (string $method, string $url): array {
    return ['status_code' => 200, 'error' => null, 'body' => json_encode([
        'status' => true,
        'data' => ['checkout_url' => 'https://checkout.korapay.com/test/' . bin2hex(random_bytes(4))],
    ])];
});

$address = ['full_name' => 'Chíoma Test', 'phone' => '08000000000', 'address_line1' => '1 Test Road', 'city' => 'Ikeja', 'state' => 'Lagos', 'country' => 'Nigeria'];

$placeOrder = function (array $items, ?string $key = null, ?string $promo = null) use ($checkout, $address, $zone, $stamp, &$created): array {
    $order = $checkout->createOrder([
        'email' => "p2.buyer.{$stamp}@example.test",
        'items' => $items,
        'shipping_address' => $address,
        'shipping_zone_id' => (int) $zone['id'],
        'coupon_code' => $promo,
    ], null, $key);
    $created['orders'][] = $order['order_number'];
    return $order;
};

try {
    // -----------------------------------------------------------------------
    echo "== Database: nested transactions and after-commit hooks\n";
    $marker = "p2-tx-{$stamp}";
    $afterRan = false;
    $db->transaction(function (Database $tx) use ($marker, &$afterRan): void {
        $tx->execute("INSERT INTO `store_settings` (`key_name`, `value`) VALUES (?, 'outer')", 's', [$marker . '-outer']);
        try {
            $tx->transaction(function (Database $inner) use ($marker): void {
                $inner->execute("INSERT INTO `store_settings` (`key_name`, `value`) VALUES (?, 'inner')", 's', [$marker . '-inner']);
                throw new RuntimeException('inner failure');
            });
        } catch (RuntimeException) {
        }
        $tx->afterCommit(function () use (&$afterRan): void {
            $afterRan = true;
        });
        check('after-commit hook does not run inside the transaction', $afterRan === false);
    });
    check('outer write committed after inner rollback', $db->fetchOne("SELECT 1 AS x FROM `store_settings` WHERE `key_name` = ?", 's', [$marker . '-outer']) !== null);
    check('inner write rolled back to its savepoint', $db->fetchOne("SELECT 1 AS x FROM `store_settings` WHERE `key_name` = ?", 's', [$marker . '-inner']) === null);
    check('after-commit hook ran after commit', $afterRan === true);
    $rolledBackHook = false;
    try {
        $db->transaction(function (Database $tx) use (&$rolledBackHook): void {
            $tx->afterCommit(function () use (&$rolledBackHook): void {
                $rolledBackHook = true;
            });
            throw new RuntimeException('rollback');
        });
    } catch (RuntimeException) {
    }
    check('after-commit hook discarded on rollback', $rolledBackHook === false);
    $db->execute("DELETE FROM `store_settings` WHERE `key_name` LIKE ?", 's', [$marker . '%']);

    // -----------------------------------------------------------------------
    echo "== Checkout: exact variants, idempotency, promos, reservation\n";
    expectThrows('unknown size/colour combination is rejected (no first-variant fallback)', function () use ($placeOrder, $productId): void {
        $placeOrder([['product_id' => $productId, 'size' => 'Large', 'color' => 'Black', 'quantity' => 1]]);
    }, 'not offered');
    expectThrows('quantity above the per-line cap is rejected', function () use ($placeOrder, $productId, $variantA): void {
        $placeOrder([['product_id' => $productId, 'variant_id' => $variantA, 'quantity' => 21]]);
    }, 'between 1 and');

    $key = 'p2key' . bin2hex(random_bytes(12));
    $o1 = $placeOrder([['product_id' => $productId, 'variant_id' => $variantB, 'quantity' => 2]], $key, $promoCode);
    $o1Again = $placeOrder([['product_id' => $productId, 'variant_id' => $variantB, 'quantity' => 2]], $key, $promoCode);
    check('price_override is charged for the chosen variant', abs($o1['subtotal'] - 24000.0) < 0.01, (string) $o1['subtotal']);
    check('same idempotency key returns the same order', $o1['order_number'] === $o1Again['order_number']);
    check('replayed order issues a working fresh guest token', ($o1Again['replayed'] ?? false) === true && strlen($o1Again['guest_access_token']) === 64);
    check('stock reserved once despite the double submit', stockOf($variantB) === 3, (string) stockOf($variantB));
    $promoRow = $db->fetchOne("SELECT `used_count` FROM `promotions` WHERE `code` = ?", 's', [$promoCode]);
    check('unlimited promo (max_uses = 0) usable and counted once', (int) $promoRow['used_count'] === 1, (string) $promoRow['used_count']);
    $row1 = orderRow($o1['order_number']);
    check('order gets a payment window (expires_at)', !empty($row1['expires_at']) && strtotime($row1['expires_at']) > time());
    check('no payment row is created before a gateway attempt', (int) $db->fetchOne("SELECT COUNT(*) c FROM `payments` WHERE `order_id` = ?", 'i', [(int) $row1['id']])['c'] === 0);

    // -----------------------------------------------------------------------
    echo "== Expiry releases stock and promo exactly once\n";
    $db->execute("UPDATE `orders` SET `expires_at` = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE `id` = ?", 'i', [(int) $row1['id']]);
    $expiredNow = $fulfillment->expireOrder((int) $row1['id']);
    $expiredAgain = $fulfillment->expireOrder((int) $row1['id']);
    check('overdue order expires', $expiredNow === true && orderRow($o1['order_number'])['order_status'] === 'cancelled');
    check('second expiry run is a no-op', $expiredAgain === false);
    check('stock released exactly once', stockOf($variantB) === 5, (string) stockOf($variantB));
    $promoRow = $db->fetchOne("SELECT `used_count` FROM `promotions` WHERE `code` = ?", 's', [$promoCode]);
    check('promo use released on expiry', (int) $promoRow['used_count'] === 0, (string) $promoRow['used_count']);
    expectThrows('expired order cannot start a new payment', function () use ($koraMock, $o1): void {
        $koraMock->initializeCheckout($o1['order_number']);
    }, 'cancelled');

    // -----------------------------------------------------------------------
    echo "== Kora: attempts, signed webhooks, idempotency, mismatches\n";
    $o2 = $placeOrder([['product_id' => $productId, 'variant_id' => $variantA, 'quantity' => 1]]);
    $init1 = $koraMock->initializeCheckout($o2['order_number']);
    $init2 = $koraMock->initializeCheckout($o2['order_number']);
    check('each Kora attempt gets its own reference', $init1['provider_reference'] !== $init2['provider_reference']);
    check('earlier attempt reference is preserved', $db->fetchOne("SELECT 1 AS x FROM `payments` WHERE `provider_reference` = ?", 's', [$init1['provider_reference']]) !== null);

    $secret = trim((string) Env::get('KORA_SECRET_KEY', ''));
    $signedKora = function (string $event, string $reference, string $amountLiteral, string $currency, string $status) use ($secret): array {
        // Hand-built JSON: float formatting and non-ASCII text differ from PHP's json_encode,
        // proving the signature is checked over the raw bytes Kora sent.
        $data = '{"reference":"' . $reference . '","status":"' . $status . '","amount":' . $amountLiteral
            . ',"currency":"' . $currency . '","customer":{"name":"Chíoma Test"},"payment_method":"card"}';
        $body = '{"event":"' . $event . '","data":' . $data . '}';
        return [$body, hash_hmac('sha256', $data, $secret)];
    };

    $amountLiteral = number_format((float) $o2['grand_total'], 2, '.', '');
    [$body, $sig] = $signedKora('charge.success', $init2['provider_reference'], $amountLiteral, 'NGN', 'success');
    if ($secret === '') {
        echo "SKIP  Kora webhook HTTP checks (KORA_SECRET_KEY not set)\n";
    } else {
        $bad = http('POST', "{$api}/webhooks/kora", $body, ['Content-Type: application/json', 'x-korapay-signature: ' . str_repeat('0', 64)]);
        check('Kora webhook with a bad signature -> 401', $bad['status'] === 401, (string) $bad['status']);
        $logged = $db->fetchOne("SELECT 1 AS x FROM `payment_webhook_events` WHERE `provider` = 'kora' AND `signature_valid` = 0 AND `id` > ?", 'i', [$maxIds['payment_webhook_events']]);
        check('rejected webhook is recorded (not rolled back)', $logged !== null);

        $ok = http('POST', "{$api}/webhooks/kora", $body, ['Content-Type: application/json', 'x-korapay-signature: ' . $sig]);
        check('signed Kora webhook (raw-byte signature) -> 200', $ok['status'] === 200, $ok['text']);
        check('order marked paid', orderRow($o2['order_number'])['order_status'] === 'paid');
        $dup = http('POST', "{$api}/webhooks/kora", $body, ['Content-Type: application/json', 'x-korapay-signature: ' . $sig]);
        check('duplicate webhook is ignored', ($dup['json']['data']['status'] ?? '') === 'ignored_duplicate', $dup['text']);
    }

    // Same success delivered under a different event key (e.g. the verify path) after the order moved on.
    $fulfillment->updateOrderStatus((int) orderRow($o2['order_number'])['id'], 'processing', 'Packing', null);
    $again = $koraMock->processPaymentEvent('charge.success', [
        'reference' => $init2['provider_reference'], 'status' => 'success', 'amount' => $o2['grand_total'], 'currency' => 'NGN',
    ], 'query:' . $init2['provider_reference'] . ':success', []);
    check('repeat success under another key is a no-op', ($again['outcome'] ?? '') === PaymentFinalizer::OUTCOME_ALREADY_PROCESSED, json_encode($again));
    check('order is NOT moved back to paid', orderRow($o2['order_number'])['order_status'] === 'processing');
    $paidHistory = (int) $db->fetchOne("SELECT COUNT(*) c FROM `order_status_history` WHERE `order_id` = ? AND `new_status` = 'paid'", 'i', [(int) orderRow($o2['order_number'])['id']])['c'];
    check('exactly one paid transition in history', $paidHistory === 1, (string) $paidHistory);

    $dupPay = $koraMock->processPaymentEvent('charge.success', [
        'reference' => $init1['provider_reference'], 'status' => 'success', 'amount' => $o2['grand_total'], 'currency' => 'NGN',
    ], 'test-dup-' . $stamp, []);
    check('second successful attempt is flagged as a duplicate payment', ($dupPay['outcome'] ?? '') === PaymentFinalizer::OUTCOME_DUPLICATE_PAYMENT);
    check('duplicate payment raises the admin attention flag', (int) orderRow($o2['order_number'])['requires_attention'] === 1);

    $o3 = $placeOrder([['product_id' => $productId, 'variant_id' => $variantA, 'quantity' => 1]]);
    $init3 = $koraMock->initializeCheckout($o3['order_number']);
    $under = $koraMock->processPaymentEvent('charge.success', [
        'reference' => $init3['provider_reference'], 'status' => 'success', 'amount' => 10, 'currency' => 'NGN',
    ], 'test-under-' . $stamp, []);
    check('underpayment is not marked paid', ($under['outcome'] ?? '') === PaymentFinalizer::OUTCOME_UNDERPAID && orderRow($o3['order_number'])['order_status'] === 'pending_payment');
    $wrongCur = $koraMock->processPaymentEvent('charge.success', [
        'reference' => $init3['provider_reference'], 'status' => 'success', 'amount' => $o3['grand_total'], 'currency' => 'USD',
    ], 'test-cur-' . $stamp, []);
    check('currency mismatch is rejected', ($wrongCur['outcome'] ?? '') === PaymentFinalizer::OUTCOME_REJECTED && orderRow($o3['order_number'])['order_status'] === 'pending_payment');
    $noCur = $finalizer->finalizeSuccess($init3['provider_reference'], ['amount' => $o3['grand_total'], 'currency' => '', 'label' => 'Test']);
    check('missing currency is rejected', ($noCur['outcome'] ?? '') === PaymentFinalizer::OUTCOME_REJECTED);

    // Late payment for an expired order
    $db->execute("UPDATE `orders` SET `expires_at` = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE `order_number` = ?", 's', [$o3['order_number']]);
    $fulfillment->expireOrder((int) orderRow($o3['order_number'])['id']);
    $stockBeforeLate = stockOf($variantA);
    $late = $finalizer->finalizeSuccess($init3['provider_reference'], ['amount' => $o3['grand_total'], 'currency' => 'NGN', 'label' => 'Kora']);
    check('payment after expiry is recorded as a late payment', ($late['outcome'] ?? '') === PaymentFinalizer::OUTCOME_LATE_PAYMENT);
    check('expired order is not revived', orderRow($o3['order_number'])['order_status'] === 'cancelled');
    check('late payment does not take stock again', stockOf($variantA) === $stockBeforeLate);
    check('late payment flags the order for a refund', (int) orderRow($o3['order_number'])['requires_attention'] === 1);

    // -----------------------------------------------------------------------
    echo "== Monnify: mandatory signature, amounts\n";
    $mSecret = trim((string) Env::get('MONNIFY_SECRET_KEY', ''));
    $o4 = $placeOrder([['product_id' => $productId, 'variant_id' => $variantA, 'quantity' => 1]]);
    $mRef = 'MNFY-' . $o4['order_number'] . '-TEST' . strtoupper(bin2hex(random_bytes(2)));
    $db->insert(
        "INSERT INTO `payments` (`order_id`, `provider`, `provider_reference`, `amount`, `currency`, `status`) VALUES (?, 'monnify', ?, ?, 'NGN', 'pending')",
        'isd',
        [(int) orderRow($o4['order_number'])['id'], $mRef, $o4['grand_total']]
    );
    $mBody = function (string $status, float $paid) use ($mRef): string {
        return json_encode(['eventType' => 'SUCCESSFUL_TRANSACTION', 'eventData' => [
            'transactionReference' => 'MNFY|TEST|' . $mRef . '|' . $status, 'paymentReference' => $mRef,
            'amountPaid' => number_format($paid, 2, '.', ''), 'totalPayable' => $paid, 'paymentStatus' => $status,
            'currency' => 'NGN', 'paymentMethod' => 'ACCOUNT_TRANSFER',
        ]]);
    };
    $unsigned = http('POST', "{$api}/webhooks/monnify", $mBody('PAID', (float) $o4['grand_total']), ['Content-Type: application/json']);
    check('Monnify webhook without a signature -> rejected', in_array($unsigned['status'], [401, 503], true), (string) $unsigned['status']);
    check('unsigned Monnify webhook does not pay the order', orderRow($o4['order_number'])['order_status'] === 'pending_payment');
    if ($mSecret === '') {
        echo "SKIP  signed Monnify checks (MONNIFY_SECRET_KEY not set)\n";
    } else {
        $partial = $mBody('PARTIALLY_PAID', 100.0);
        $pr = http('POST', "{$api}/webhooks/monnify", $partial, ['Content-Type: application/json', 'monnify-signature: ' . hash_hmac('sha512', $partial, $mSecret)]);
        check('Monnify PARTIALLY_PAID is accepted but not marked paid', $pr['status'] === 200 && orderRow($o4['order_number'])['order_status'] === 'pending_payment', $pr['text']);
        $full = $mBody('PAID', (float) $o4['grand_total']);
        $fr = http('POST', "{$api}/webhooks/monnify", $full, ['Content-Type: application/json', 'monnify-signature: ' . hash_hmac('sha512', $full, $mSecret)]);
        check('signed Monnify PAID with the right amount marks the order paid', $fr['status'] === 200 && orderRow($o4['order_number'])['order_status'] === 'paid', $fr['text']);
    }

    // -----------------------------------------------------------------------
    echo "== Fulfilment, refunds and manual payments\n";
    $o5 = $placeOrder([['product_id' => $productId, 'variant_id' => $variantA, 'quantity' => 1]]);
    $o5Id = (int) orderRow($o5['order_number'])['id'];
    expectThrows('shipment rejected for an unpaid order', fn () => $fulfillment->assignShipment($o5Id, ['carrier' => 'GIG', 'status' => 'in_transit']), 'paid orders');
    expectThrows('status endpoint cannot mark an order paid', fn () => $fulfillment->updateOrderStatus($o5Id, 'paid'), 'Confirm payment');
    expectThrows('manual confirmation needs a real reference', fn () => $finalizer->recordManualPayment($o5Id, 'ab', null), 'reference');
    $manual = $finalizer->recordManualPayment($o5Id, "GTB-{$stamp}", null, 'Transfer seen in bank app');
    check('manual confirmation with a reference marks the order paid', $manual['outcome'] === PaymentFinalizer::OUTCOME_PAID && orderRow($o5['order_number'])['order_status'] === 'paid');

    expectThrows('markDelivered on a cancelled order fails without touching shipments', fn () => $fulfillment->markDelivered((int) orderRow($o1['order_number'])['id']), 'Only paid');
    $shipped = $fulfillment->assignShipment($o5Id, ['carrier' => 'GIG Logistics', 'tracking_number' => "GIG-{$stamp}", 'status' => 'shipped']);
    check("legacy 'shipped' shipment status is accepted and ships the order", $shipped['order_status'] === 'shipped' && ($shipped['shipment']['status'] ?? '') === 'in_transit');
    $delivered = $fulfillment->markDelivered($o5Id, 'Handed to customer');
    check('markDelivered moves shipped -> delivered', $delivered['order_status'] === 'delivered');

    expectThrows('refund larger than the payment is rejected', fn () => $fulfillment->recordRefund($o5Id, 999999, 'Too much', 'completed', false, null), 'exceeds');
    expectThrows('refund for an unpaid order is rejected', function () use ($placeOrder, $productId, $variantA, $fulfillment): void {
        $u = $placeOrder([['product_id' => $productId, 'variant_id' => $variantA, 'quantity' => 1]]);
        $fulfillment->recordRefund((int) orderRow($u['order_number'])['id'], 100, 'No payment', 'completed', false, null);
    }, 'no successful payment');
    $half = round($o5['grand_total'] / 2, 2);
    $fulfillment->recordRefund($o5Id, $half, 'Partial goodwill refund', 'completed', false, null);
    check('partial refund -> payment_status partially_refunded', orderRow($o5['order_number'])['payment_status'] === 'partially_refunded');
    $pending = $fulfillment->recordRefund($o5Id, round($o5['grand_total'] - $half, 2), 'Rest of the money', 'pending', false, null);
    check('pending refund does not change totals yet', orderRow($o5['order_number'])['payment_status'] === 'partially_refunded');
    $fulfillment->resolveRefund((int) $pending['id'], 'completed', null);
    $finalRow = orderRow($o5['order_number']);
    check('full refund -> order and payment refunded', $finalRow['order_status'] === 'refunded' && $finalRow['payment_status'] === 'refunded');

    // -----------------------------------------------------------------------
    echo "== Admin HTTP: routes, creates, inventory, variant upsert\n";
    $jar = tempnam(sys_get_temp_dir(), 'p2jar');
    $adminEmail = "p2.admin.{$stamp}@example.test";
    $adminPass = 'P2-Admin-' . bin2hex(random_bytes(6));
    $created['users'][] = $adminEmail;
    $db->insert(
        "INSERT INTO `users` (`uuid`, `email`, `password_hash`, `full_name`, `role`, `status`, `email_verified_at`) VALUES (UUID(), ?, ?, 'P2 Temp Admin', 'admin', 'active', NOW())",
        'ss',
        [$adminEmail, password_hash($adminPass, PASSWORD_BCRYPT)]
    );
    $login = http('POST', "{$api}/auth/login", json_encode(['email' => $adminEmail, 'password' => $adminPass]), ['Content-Type: application/json'], $jar);
    $csrf = $login['json']['data']['csrf_token'] ?? '';
    $h = ['Content-Type: application/json', 'X-CSRF-Token: ' . $csrf];
    check('temporary admin can sign in', $login['status'] === 200, (string) $login['status']);

    $export = http('GET', "{$api}/admin/orders/export", null, [], $jar);
    check('GET /admin/orders/export returns CSV (route no longer shadowed)', $export['status'] === 200 && stripos($export['headers'], 'text/csv') !== false, (string) $export['status']);

    $promo = http('POST', "{$api}/admin/promotions", json_encode(['code' => "P2HTTP{$stamp}", 'description' => 'HTTP test', 'discount_percent' => 5, 'max_uses' => 10, 'is_active' => true]), $h, $jar);
    check('POST /admin/promotions returns 201 with an id (no crash)', $promo['status'] === 201 && !empty($promo['json']['data']['id']), $promo['text']);
    $banner = http('POST', "{$api}/admin/storefront/banners", json_encode(['title' => "P2 {$stamp}", 'image_url' => '/images/hero/african_models_hero.webp', 'is_active' => false]), $h, $jar);
    check('POST /admin/storefront/banners returns 201 with an id', $banner['status'] === 201 && !empty($banner['json']['data']['id']), $banner['text']);

    $adj = http('POST', "{$api}/admin/inventory/adjust", json_encode(['variant_id' => $variantA, 'change_amount' => 3, 'reason' => 'Restock (test)']), $h, $jar);
    check('Inventory screen adjust (change_amount) works', $adj['status'] === 200, $adj['text']);
    $logRow = $db->fetchOne("SELECT * FROM `inventory_logs` WHERE `variant_id` = ? AND `id` > ? ORDER BY id DESC LIMIT 1", 'ii', [$variantA, $maxIds['inventory_logs']]);
    check('adjustment writes an inventory log with the admin as actor', $logRow !== null && !empty($logRow['adjusted_by_user_id']));

    $paidOrderItemVariant = (int) $db->fetchOne("SELECT `variant_id` FROM `order_items` WHERE `order_id` = ? LIMIT 1", 'i', [$o5Id])['variant_id'];
    $currentA = stockOf($variantA);
    $currentB = stockOf($variantB);
    $upd = http('PUT', "{$api}/admin/products/{$productId}", json_encode(['variants' => [
        ['id' => $variantA, 'sku' => "P2-{$stamp}-M-BLK", 'size' => 'Medium', 'color_name' => 'Black', 'color_hex' => '#000000', 'stock_quantity' => $currentA + 1, 'original_stock_quantity' => $currentA],
        ['sku' => "P2-{$stamp}-S-RED", 'size' => 'Small', 'color_name' => 'Red', 'color_hex' => '#ff0000', 'stock_quantity' => 4],
    ]]), $h, $jar);
    check('product update with variants succeeds', $upd['status'] === 200, $upd['text']);
    check('existing variant keeps its id', $db->fetchOne("SELECT 1 AS x FROM `product_variants` WHERE `id` = ? AND `is_active` = 1", 'i', [$variantA]) !== null);
    check('order items still point at their variant', (int) $db->fetchOne("SELECT `variant_id` FROM `order_items` WHERE `order_id` = ? LIMIT 1", 'i', [$o5Id])['variant_id'] === $paidOrderItemVariant);
    check('form stock edit applied via compare-and-set', stockOf($variantA) === $currentA + 1);
    $bRow = $db->fetchOne("SELECT `is_active` FROM `product_variants` WHERE `id` = ?", 'i', [$variantB]);
    check('removed variant with order history is archived, not deleted', $bRow !== null && (int) $bRow['is_active'] === 0);
    $stale = http('PUT', "{$api}/admin/products/{$productId}", json_encode(['variants' => [
        ['id' => $variantA, 'sku' => "P2-{$stamp}-M-BLK", 'size' => 'Medium', 'color_name' => 'Black', 'color_hex' => '#000000', 'stock_quantity' => 50, 'original_stock_quantity' => $currentA],
    ]]), $h, $jar);
    check('stale stock edit is refused (422) instead of overwriting reservations', $stale['status'] === 422, (string) $stale['status']);
    check('stale edit left stock unchanged', stockOf($variantA) === $currentA + 1);
    unset($currentB);

    $toPaid = http('PATCH', "{$api}/admin/orders/{$o5['order_number']}/status", json_encode(['status' => 'paid']), $h, $jar);
    check("PATCH status 'paid' is refused", $toPaid['status'] === 422, (string) $toPaid['status']);

    @unlink($jar);
} catch (Throwable $e) {
    $fail++;
    echo "FAIL  unexpected exception: " . get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine() . "\n";
} finally {
    // -----------------------------------------------------------------------
    echo "== Cleanup\n";
    foreach ($created['orders'] as $num) {
        $db->execute("DELETE FROM `orders` WHERE `order_number` = ?", 's', [$num]);
    }
    $db->execute("DELETE FROM `order_items` WHERE `product_id` = ?", 'i', [$productId ?? 0]);
    $db->execute("DELETE FROM `inventory_logs` WHERE `product_id` = ?", 'i', [$productId ?? 0]);
    $db->execute("DELETE FROM `products` WHERE `id` = ?", 'i', [$productId ?? 0]);
    $db->execute("DELETE FROM `categories` WHERE `id` = ?", 'i', [$categoryId ?? 0]);
    $db->execute("DELETE FROM `promotions` WHERE `code` IN (?, ?)", 'ss', [$promoCode ?? '', "P2HTTP{$stamp}"]);
    $db->execute("DELETE FROM `banners` WHERE `title` = ?", 's', ["P2 {$stamp}"]);
    foreach ($created['users'] as $email) {
        $db->execute("DELETE FROM `users` WHERE `email` = ?", 's', [$email]);
    }
    foreach ($maxIds as $table => $max) {
        $db->execute("DELETE FROM `{$table}` WHERE `id` > ?", 'i', [$max]);
    }
    $db->execute("DELETE FROM `rate_limits`");
    echo "Removed test orders, product, category, promotions, banner, admin and the log rows they created.\n";
}

echo "\nRESULT: {$pass} passed, {$fail} failed\n";
exit($fail > 0 ? 1 : 0);
