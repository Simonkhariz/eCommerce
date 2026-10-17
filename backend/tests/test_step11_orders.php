<?php

declare(strict_types=1);

/**
 * -----------------------------------------------------------------------------
 * Step 11 Automated Test Suite:
 * Checkout UI, Payment Return, Customer Order History & Access Control
 * -----------------------------------------------------------------------------
 */

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Services\CheckoutService;
use App\Services\KoraService;
use App\Services\MonnifyService;
use App\Repositories\SessionRepository;
use App\Support\RequestContext;
use App\Controllers\CustomerController;
use App\Controllers\CheckoutController;

Env::load(BASE_PATH . '/.env');
$db = Database::getInstance();

$passed = 0;
$failed = 0;

function assertCondition(bool $condition, string $description): void
{
    global $passed, $failed;
    if ($condition) {
        echo "  [PASS] {$description}\n";
        $passed++;
    } else {
        echo "  [FAIL] {$description}\n";
        $failed++;
    }
}

function httpReq(string $method, string $path, ?array $body = null, ?string $bearerToken = null): array
{
    $url = 'http://127.0.0.1:8000/api/v1' . $path;
    $ch = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    if ($bearerToken !== null) {
        $headers[] = "Authorization: Bearer {$bearerToken}";
    }
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = json_decode((string) $raw, true) ?: [];
    return ['status' => $code, 'body' => $json, 'raw' => $raw];
}

echo "====================================================================\n";
echo "STEP 11 TEST MATRIX: CHECKOUT, CUSTOMER ORDERS & ACCESS SECURITY\n";
echo "====================================================================\n\n";

// Helper: Ensure 2 test customers exist in users table
$user1 = $db->fetchOne("SELECT id, email, full_name FROM users WHERE email = 'test_step11_user1@shopco.ng' LIMIT 1");
if (!$user1) {
    $u1Id = $db->insert(
        "INSERT INTO users (uuid, email, password_hash, full_name, role, status, created_at, updated_at)
         VALUES ('usr-test-11-1', 'test_step11_user1@shopco.ng', 'hash', 'Customer One', 'customer', 'active', NOW(), NOW())",
        's'
    );
    $user1 = ['id' => $u1Id, 'email' => 'test_step11_user1@shopco.ng', 'full_name' => 'Customer One'];
}

$user2 = $db->fetchOne("SELECT id, email, full_name FROM users WHERE email = 'test_step11_user2@shopco.ng' LIMIT 1");
if (!$user2) {
    $u2Id = $db->insert(
        "INSERT INTO users (uuid, email, password_hash, full_name, role, status, created_at, updated_at)
         VALUES ('usr-test-11-2', 'test_step11_user2@shopco.ng', 'hash', 'Customer Two', 'customer', 'active', NOW(), NOW())",
        's'
    );
    $user2 = ['id' => $u2Id, 'email' => 'test_step11_user2@shopco.ng', 'full_name' => 'Customer Two'];
}

// Helper: get a valid physical variant and shipping zone
$variant = $db->fetchOne("SELECT pv.id as variant_id, pv.product_id, pv.sku, p.base_price, pv.stock_quantity FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.stock_quantity >= 5 LIMIT 1");
$zone = $db->fetchOne("SELECT id, name, fee FROM shipping_zones WHERE is_active = 1 LIMIT 1");

if (!$variant || !$zone) {
    echo "Fatal: Missing test product variants or shipping zones in database.\n";
    exit(1);
}

// -----------------------------------------------------------------------------
// Test 1: Guest Checkout Order Creation & High-Entropy Guest Token
// -----------------------------------------------------------------------------
echo "1. Testing Guest Checkout Flow & High-Entropy Token Generation...\n";

$checkoutService = new CheckoutService($db);
$guestPayload = [
    'email' => 'guest_step11@shopco.ng',
    'items' => [
        ['product_id' => (int) $variant['product_id'], 'variant_id' => (int) $variant['variant_id'], 'quantity' => 2]
    ],
    'shipping_address' => [
        'full_name' => 'Guest Shopper',
        'phone' => '08012345678',
        'address_line1' => '10 Market Road',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'country' => 'Nigeria'
    ],
    'shipping_zone_id' => (int) $zone['id'],
    'notes' => 'Please ring bell upon arrival.'
];

$guestOrder = $checkoutService->createOrder($guestPayload, null);

assertCondition(!empty($guestOrder['order_number']), "Order number generated ({$guestOrder['order_number']})");
assertCondition(str_starts_with($guestOrder['order_number'], 'ORD-'), "Order number follows secure public format (ORD-...)");
assertCondition(!empty($guestOrder['guest_access_token']), "High-entropy guest access token generated");
assertCondition(strlen($guestOrder['guest_access_token']) >= 32, "Guest access token has sufficient cryptographic entropy (>= 32 chars)");

// Verify database state: guest_access_token_hash is stored, never plaintext
$dbOrder = $db->fetchOne("SELECT guest_access_token_hash, order_status, payment_status, grand_total, shipping_fee FROM orders WHERE order_number = ?", 's', [$guestOrder['order_number']]);
assertCondition(!empty($dbOrder['guest_access_token_hash']), "Guest access token hash persisted in database");
assertCondition($dbOrder['guest_access_token_hash'] === hash('sha256', $guestOrder['guest_access_token']), "Token hash matches SHA-256 of plain token");
assertCondition($dbOrder['order_status'] === 'pending_payment', "Initial order status is pending_payment");
assertCondition($dbOrder['payment_status'] === 'pending', "Initial payment status is pending");

// -----------------------------------------------------------------------------
// Test 2: Logged-in Customer Checkout & Association with user_id
// -----------------------------------------------------------------------------
echo "\n2. Testing Logged-in Customer Checkout & Account Association...\n";

$userPayload = [
    'email' => $user1['email'],
    'items' => [
        ['product_id' => (int) $variant['product_id'], 'variant_id' => (int) $variant['variant_id'], 'quantity' => 1]
    ],
    'shipping_address' => [
        'full_name' => 'Customer One',
        'phone' => '08099887766',
        'address_line1' => '42 Independence Layout',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'country' => 'Nigeria'
    ],
    'shipping_zone_id' => (int) $zone['id']
];

$userOrder = $checkoutService->createOrder($userPayload, (int) $user1['id']);

$dbUserOrder = $db->fetchOne("SELECT user_id, guest_email FROM orders WHERE order_number = ?", 's', [$userOrder['order_number']]);
assertCondition((int) $dbUserOrder['user_id'] === (int) $user1['id'], "Order associated with authenticated user_id ({$user1['id']})");
assertCondition($dbUserOrder['guest_email'] === $user1['email'], "Customer email recorded accurately");

// -----------------------------------------------------------------------------
// Test 3: Authoritative Backend Totals (Client Pricing Tampering Prevention)
// -----------------------------------------------------------------------------
echo "\n3. Testing Authoritative Backend Totals & Tampering Prevention...\n";

// Backend calculates totals strictly from database; client passes only variant IDs & quantities
$quote = $checkoutService->getQuote([
    'items' => [
        ['product_id' => (int) $variant['product_id'], 'variant_id' => (int) $variant['variant_id'], 'quantity' => 2]
    ],
    'shipping_address' => [
        'full_name' => 'John Doe',
        'address_line_1' => '123 Main St',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'postal_code' => '400001',
        'phone' => '+2348011112222'
    ],
    'shipping_zone_id' => (int) $zone['id']
]);

$expectedSubtotal = (float) $variant['base_price'] * 2;
$expectedShipping = (float) $zone['fee'];
$expectedGrandTotal = $expectedSubtotal + $expectedShipping;

assertCondition(abs((float)$quote['subtotal'] - $expectedSubtotal) < 0.01, "Authoritative subtotal derived server-side from MySQL price");
assertCondition(abs((float)$quote['shipping_fee'] - $expectedShipping) < 0.01, "Authoritative delivery fee derived server-side from zone rule");
assertCondition(abs((float)$quote['grand_total'] - $expectedGrandTotal) < 0.01, "Grand total strictly equals subtotal + delivery");

// Create active sessions for authenticated HTTP requests
$sessionRepo = new SessionRepository();
$session1 = $sessionRepo->create((int) $user1['id']);
$user1Token = $session1['token'];
$session2 = $sessionRepo->create((int) $user2['id']);
$user2Token = $session2['token'];

// -----------------------------------------------------------------------------
// Test 4: Cross-Customer Access Control (Security Invariant)
// -----------------------------------------------------------------------------
echo "\n4. Testing Cross-Customer Access Control (User 2 accessing User 1's order)...\n";

$res = httpReq('GET', "/checkout/orders/{$userOrder['order_number']}", null, $user2Token);
assertCondition($res['status'] === 403, "Cross-customer access rejected with HTTP 403");
assertCondition(($res['body']['error']['code'] ?? '') === 'FORBIDDEN', "Returns 403 FORBIDDEN on unauthorized cross-customer access");

// -----------------------------------------------------------------------------
// Test 5: Invalid or Expired Guest Token Access Rejection
// -----------------------------------------------------------------------------
echo "\n5. Testing Invalid Guest Token Rejection...\n";

$res = httpReq('GET', "/checkout/orders/{$guestOrder['order_number']}?token=invalid_tampered_token_xyz_12345");
assertCondition($res['status'] === 403, "Invalid guest token rejected with HTTP 403");
assertCondition(($res['body']['error']['code'] ?? '') === 'FORBIDDEN', "Returns 403 FORBIDDEN on invalid guest token");

// -----------------------------------------------------------------------------
// Test 6: Valid Guest Token Authorization
// -----------------------------------------------------------------------------
echo "\n6. Testing Valid Guest Token Authorization...\n";

$res = httpReq('GET', "/checkout/orders/{$guestOrder['order_number']}?token={$guestOrder['guest_access_token']}");
assertCondition($res['status'] === 200, "Valid guest token returns HTTP 200");
assertCondition(($res['body']['success'] ?? false) === true, "Valid guest token authorized successfully");
assertCondition(($res['body']['data']['order_number'] ?? '') === $guestOrder['order_number'], "Order details match requested guest order");
assertCondition(!isset($res['body']['data']['guest_access_token_hash']), "Internal guest token hash redacted from public payload");
assertCondition(count($res['body']['data']['items'] ?? []) === 1, "Itemized order snapshot returned accurately");

// -----------------------------------------------------------------------------
// Test 7: Rejection of Sequential Order ID Lookup (Anti-enumeration)
// -----------------------------------------------------------------------------
echo "\n7. Testing Anti-Enumeration (Rejection of Sequential Integer IDs)...\n";

$res = httpReq('GET', "/checkout/orders/1");
assertCondition($res['status'] === 404, "Sequential ID '1' rejected with HTTP 404");
assertCondition(($res['body']['error']['code'] ?? '') === 'ORDER_NOT_FOUND', "Returns 404 ORDER_NOT_FOUND when querying integer IDs");

// -----------------------------------------------------------------------------
// Test 8: Authenticated Customer Order History (GET /api/v1/customer/orders)
// -----------------------------------------------------------------------------
echo "\n8. Testing Customer Order History Endpoint (GET /api/v1/customer/orders)...\n";

$res1 = httpReq('GET', "/customer/orders", null, $user1Token);
assertCondition($res1['status'] === 200, "Customer orders endpoint returned HTTP 200");
assertCondition(($res1['body']['success'] ?? false) === true, "Customer orders endpoint returned success");
assertCondition(is_array($res1['body']['data'] ?? null), "Orders returned as array list");

$foundUserOrder = false;
foreach ($res1['body']['data'] ?? [] as $ord) {
    if ($ord['order_number'] === $userOrder['order_number']) {
        $foundUserOrder = true;
        assertCondition($ord['items_count'] >= 1, "Order items count present ({$ord['items_count']})");
        assertCondition(isset($ord['grand_total']), "Grand total present on order history item");
        assertCondition(isset($ord['order_status']), "Order status present on order history item");
    }
}
assertCondition($foundUserOrder, "Authenticated customer order history contains newly placed order ({$userOrder['order_number']})");

// Ensure Customer 2 does not see Customer 1's order in their list
$res2 = httpReq('GET', "/customer/orders", null, $user2Token);
$user2SawUser1Order = false;
foreach ($res2['body']['data'] ?? [] as $ord) {
    if ($ord['order_number'] === $userOrder['order_number']) {
        $user2SawUser1Order = true;
    }
}
assertCondition(!$user2SawUser1Order, "Customer 2 history is isolated and does NOT contain Customer 1's orders");

// -----------------------------------------------------------------------------
// Test 9: Payment Return Verification via Secret Gateway Reference
// -----------------------------------------------------------------------------
echo "\n9. Testing Payment Return Verification via Secret Gateway Reference...\n";

// Initialize a payment session for userOrder to generate a secret reference
$koraService = new KoraService($db);
$initRes = $koraService->initializeCheckout($userOrder['order_number'], 'http://localhost:3000/checkout/callback');
$secretRef = $initRes['provider_reference'];

// Simulate gateway redirect with secret reference, without active session or guest token
$res = httpReq('GET', "/checkout/orders/{$userOrder['order_number']}/verify-payment?reference={$secretRef}");
assertCondition($res['status'] === 200, "Gateway redirect with matching secret reference returns HTTP 200");
assertCondition(($res['body']['success'] ?? false) === true, "Gateway redirect with matching secret reference authorized");
assertCondition(($res['body']['data']['order_number'] ?? '') === $userOrder['order_number'], "Verification response targets correct order");

echo "\n====================================================================\n";
echo "STEP 11 TEST RESULTS: {$passed} PASSED, {$failed} FAILED\n";
echo "====================================================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
