<?php

declare(strict_types=1);

/**
 * -----------------------------------------------------------------------------
 * Step 12 Automated Test Suite:
 * Physical Delivery, Shipping Zones, Fulfillment State Machine, Carrier Tracking & Audit Logs
 * -----------------------------------------------------------------------------
 */

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Services\CheckoutService;
use App\Services\FulfillmentService;
use App\Support\RequestContext;

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

function httpReq(string $method, string $path, ?array $body = null, ?string $token = null): array
{
    $url = 'http://127.0.0.1:8000/api/v1' . $path;
    $ch = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    if ($token !== null) {
        $headers[] = "Authorization: Bearer {$token}";
    }
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $json = is_string($raw) ? json_decode($raw, true) : null;
    return ['code' => $code, 'body' => $json, 'raw' => $raw];
}

echo "====================================================================\n";
echo "STEP 12 — PHYSICAL DELIVERY & ORDER FULFILLMENT TEST SUITE\n";
echo "====================================================================\n\n";

$checkoutService = new CheckoutService($db);
$fulfillmentService = new FulfillmentService($db);
$devAdminToken = Env::get('DEV_ADMIN_API_TOKEN', 'dev_admin_secret_token_12345');

// -----------------------------------------------------------------------------
// 1. Delivery Fee Calculation & Unserved Destination Protection
// -----------------------------------------------------------------------------
echo "1. Delivery fee calculation from configured location zones & unmatched prevention...\n";

// Find active physical variant
$variant = $db->fetchOne(
    "SELECT pv.id as variant_id, pv.product_id, pv.sku, p.base_price, pv.stock_quantity, p.name 
     FROM `product_variants` pv 
     JOIN `products` p ON p.id = pv.product_id 
     WHERE pv.stock_quantity > 10 AND p.status = 'published' 
     LIMIT 1"
);

if (!$variant) {
    echo "  [ERROR] No active physical product variant available for testing.\n";
    exit(1);
}

// Quote with valid zone: Enugu (configured local zone)
$enuguQuote = $checkoutService->getQuote([
    'items' => [['product_id' => (int)$variant['product_id'], 'variant_id' => (int)$variant['variant_id'], 'quantity' => 1]],
    'shipping_address' => [
        'full_name' => 'Chidi Okonkwo',
        'phone' => '08031234567',
        'address_line1' => '12 Independence Layout',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'country' => 'Nigeria'
    ]
]);

assertCondition(
    $enuguQuote['shipping_fee'] > 0 && !empty($enuguQuote['shipping_zone']),
    "Valid location (Enugu) resolves configured delivery zone '{$enuguQuote['shipping_zone']['name']}' with fee: NGN {$enuguQuote['shipping_fee']}"
);

// Quote with invalid/unserved destination must fail and NEVER default to free shipping
$unservedFailed = false;
try {
    $checkoutService->getQuote([
        'items' => [['product_id' => (int)$variant['product_id'], 'variant_id' => (int)$variant['variant_id'], 'quantity' => 1]],
        'shipping_address' => [
            'full_name' => 'Test User',
            'phone' => '08031234567',
            'address_line1' => 'Unknown Nowhere',
            'city' => 'Antarctica City',
            'state' => 'UnknownStateXYZ',
            'country' => 'Antarctica'
        ]
    ]);
} catch (\InvalidArgumentException $e) {
    $unservedFailed = true;
}
assertCondition($unservedFailed, "Unserved location is rejected with 422 validation error and NEVER defaults to free shipping.");

// -----------------------------------------------------------------------------
// 2. Order Placement & Persistence of Applied Zone Snapshot & Fee
// -----------------------------------------------------------------------------
echo "\n2. Order placement persists zone snapshot and authoritative fee...\n";

$guestEmail = 'fulfillment_tester_' . time() . '@example.com';
$orderResult = $checkoutService->createOrder([
    'email' => $guestEmail,
    'shipping_address' => [
        'full_name' => 'Chidi Okonkwo',
        'phone' => '08031234567',
        'address_line1' => '12 Independence Layout',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'country' => 'Nigeria'
    ],
    'items' => [['product_id' => (int)$variant['product_id'], 'variant_id' => (int)$variant['variant_id'], 'quantity' => 2]]
]);

$orderNumber = $orderResult['order_number'];
$guestToken = $orderResult['guest_access_token'];
$orderId = (int)$orderResult['order_id'];

$orderRow = $db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
$zoneSnapshot = json_decode($orderRow['shipping_zone_snapshot'] ?? '{}', true);

assertCondition(!empty($zoneSnapshot['name']), "Order persists shipping_zone_snapshot with zone: '{$zoneSnapshot['name']}'");
assertCondition((float)$orderRow['shipping_fee'] > 0, "Order persists authoritative shipping_fee: NGN {$orderRow['shipping_fee']}");
assertCondition($orderRow['order_status'] === 'pending_payment', "Newly created order initial status is 'pending_payment'");

// -----------------------------------------------------------------------------
// 3. Failed / Pending Payment State Machine Enforcement
// -----------------------------------------------------------------------------
echo "\n3. Illegal transition rejection for unpaid orders...\n";

// Directly jumping from pending_payment to shipped or delivered must be rejected
$illegalJumpFailed = false;
try {
    $fulfillmentService->updateOrderStatus($orderId, 'shipped', 'Attempting illegal jump before payment');
} catch (\InvalidArgumentException $e) {
    $illegalJumpFailed = true;
}
assertCondition($illegalJumpFailed, "Illegal jump from 'pending_payment' to 'shipped' is rejected by state machine.");

$illegalDeliveryJumpFailed = false;
try {
    $fulfillmentService->markDelivered($orderId, 'Attempting illegal delivery jump');
} catch (\InvalidArgumentException $e) {
    $illegalDeliveryJumpFailed = true;
}
assertCondition($illegalDeliveryJumpFailed, "Illegal jump from 'pending_payment' to 'delivered' is rejected by state machine.");

// -----------------------------------------------------------------------------
// 4. Allowed Status Transitions Lifecycle: pending_payment -> paid -> processing -> shipped -> delivered
// -----------------------------------------------------------------------------
echo "\n4. Sequential allowed status transitions & audit trail...\n";

// Step A: Payment received -> transition to 'paid'
$fulfillmentService->updateOrderStatus($orderId, 'paid', 'Simulated verified payment receipt', 1);
$statusAfterPay = $db->fetchOne("SELECT `order_status` FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
assertCondition($statusAfterPay['order_status'] === 'paid', "Transition: pending_payment -> paid successful.");

// Step B: Warehouse receives -> transition to 'processing'
$fulfillmentService->updateOrderStatus($orderId, 'processing', 'Warehouse parcel packaging started', 1);
$statusAfterProcessing = $db->fetchOne("SELECT `order_status` FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
assertCondition($statusAfterProcessing['order_status'] === 'processing', "Transition: paid -> processing successful.");

// Step C: Courier dispatch -> assignShipment sets carrier, tracking number/URL, updates status to 'shipped'
$trackingCode = 'GIG-' . strtoupper(bin2hex(random_bytes(5)));
$trackingUrl = 'https://giglogistics.com/track/' . $trackingCode;

$shipmentResult = $fulfillmentService->assignShipment($orderId, [
    'carrier' => 'GIG Logistics',
    'tracking_number' => $trackingCode,
    'tracking_url' => $trackingUrl,
    'status' => 'in_transit'
], 1);

$statusAfterDispatch = $db->fetchOne("SELECT `order_status` FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
assertCondition($statusAfterDispatch['order_status'] === 'shipped', "Carrier assignment automatically advances order status to 'shipped'.");

$savedShipment = $db->fetchOne("SELECT * FROM `shipments` WHERE `order_id` = ?", 'i', [$orderId]);
assertCondition(
    $savedShipment['carrier'] === 'GIG Logistics' && $savedShipment['tracking_number'] === $trackingCode && !empty($savedShipment['shipped_at']),
    "Shipment recorded with carrier 'GIG Logistics', tracking '{$trackingCode}', and shipped_at timestamp."
);

// Step D: Confirm Delivery -> markDelivered sets delivered_at, transitions to 'delivered'
$fulfillmentService->markDelivered($orderId, 'Signed by recipient Chidi Okonkwo at address', 1);
$statusAfterDelivery = $db->fetchOne("SELECT `order_status` FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
$updatedShipment = $db->fetchOne("SELECT * FROM `shipments` WHERE `order_id` = ?", 'i', [$orderId]);

assertCondition($statusAfterDelivery['order_status'] === 'delivered', "Delivery confirmation transitions order status to 'delivered'.");
assertCondition(!empty($updatedShipment['delivered_at']) && $updatedShipment['status'] === 'delivered', "Shipment record updated with delivered_at timestamp and delivered status.");

// -----------------------------------------------------------------------------
// 5. State Machine Invariants: Terminal status re-opening prevention
// -----------------------------------------------------------------------------
echo "\n5. Terminal status re-opening prevention...\n";

$invalidDeliveredJump = false;
try {
    $fulfillmentService->updateOrderStatus($orderId, 'pending_payment', 'Attempting illegal back-transition');
} catch (\InvalidArgumentException $e) {
    $invalidDeliveredJump = true;
}
assertCondition($invalidDeliveredJump, "Reversing terminal 'delivered' status back to 'pending_payment' is rejected.");

// -----------------------------------------------------------------------------
// 6. History and Admin Audit Log Verification
// -----------------------------------------------------------------------------
echo "\n6. Status history and admin audit log persistence...\n";

$historyRecords = $db->fetchAll(
    "SELECT `previous_status`, `new_status`, `comment` FROM `order_status_history` WHERE `order_id` = ? ORDER BY `id` ASC",
    'i',
    [$orderId]
);

assertCondition(count($historyRecords) >= 4, "Status history captured at least 4 transitions (count: " . count($historyRecords) . ")");

$auditLogs = $db->fetchAll(
    "SELECT `action`, `entity_type`, `entity_id` FROM `admin_audit_logs` WHERE `entity_type` = 'order' AND `entity_id` = ? ORDER BY `id` ASC",
    's',
    [(string)$orderId]
);

assertCondition(count($auditLogs) >= 3, "Admin audit trail captured fulfillment operations (count: " . count($auditLogs) . ")");

// -----------------------------------------------------------------------------
// 7. Storefront & Customer API Snapshot Verification
// -----------------------------------------------------------------------------
echo "\n7. Storefront /track-order API returns shipment details...\n";

$pubOrderRes = httpReq('GET', "/checkout/orders/{$orderNumber}?token={$guestToken}");
assertCondition($pubOrderRes['code'] === 200, "GET /checkout/orders/{$orderNumber} returns HTTP 200 with guest token.");
$pubData = $pubOrderRes['body']['data'] ?? [];

assertCondition(
    !empty($pubData['shipment']) && $pubData['shipment']['carrier'] === 'GIG Logistics' && $pubData['shipment']['tracking_number'] === $trackingCode,
    "Public order payload includes active shipment snapshot with carrier '{$pubData['shipment']['carrier']}' and tracking code."
);

// -----------------------------------------------------------------------------
// 8. Admin Fulfillment HTTP API Integration
// -----------------------------------------------------------------------------
echo "\n8. Admin fulfillment HTTP API endpoints...\n";

// List orders in fulfillment queue
$adminListRes = httpReq('GET', '/admin/orders?status=all', null, $devAdminToken);
assertCondition($adminListRes['code'] === 200, "GET /admin/orders returns HTTP 200 with admin authorization.");
assertCondition(!empty($adminListRes['body']['data']['items']), "Fulfillment order queue returns paginated items.");

// Show specific order
$adminShowRes = httpReq('GET', "/admin/orders/{$orderNumber}", null, $devAdminToken);
assertCondition($adminShowRes['code'] === 200, "GET /admin/orders/{$orderNumber} returns HTTP 200 with full snapshot.");
assertCondition(!empty($adminShowRes['body']['data']['audit_logs']), "Admin order detail includes administrative audit trail.");

// Create a new order to test Admin HTTP status transition and shipment assignment via API
$order2 = $checkoutService->createOrder([
    'email' => 'fulfillment_api_tester@example.com',
    'shipping_address' => [
        'full_name' => 'Amina Bello',
        'phone' => '08021112233',
        'address_line1' => 'Plot 4 Wuse Zone 2',
        'city' => 'Abuja',
        'state' => 'Abuja',
        'country' => 'Nigeria'
    ],
    'items' => [['product_id' => (int)$variant['product_id'], 'variant_id' => (int)$variant['variant_id'], 'quantity' => 1]]
]);
$orderNum2 = $order2['order_number'];

// Admin updates status to paid via HTTP
$paidHttp = httpReq('PATCH', "/admin/orders/{$orderNum2}/status", [
    'status' => 'paid',
    'comment' => 'Marked paid by store accountant via admin dashboard'
], $devAdminToken);
assertCondition($paidHttp['code'] === 200, "PATCH /admin/orders/{order}/status successfully sets status to 'paid'.");

// Admin assigns shipment via HTTP
$shipHttp = httpReq('POST', "/admin/orders/{$orderNum2}/shipment", [
    'carrier' => 'DHL Express',
    'tracking_number' => 'DHL-987654321',
    'tracking_url' => 'https://www.dhl.com/track/DHL-987654321',
    'status' => 'in_transit'
], $devAdminToken);
assertCondition($shipHttp['code'] === 200, "POST /admin/orders/{order}/shipment successfully assigns DHL Express tracking.");

// Admin confirms delivery via HTTP
$delivHttp = httpReq('POST', "/admin/orders/{$orderNum2}/delivered", [
    'comment' => 'Package handed to Amina Bello in Abuja'
], $devAdminToken);
assertCondition($delivHttp['code'] === 200, "POST /admin/orders/{order}/delivered successfully confirms parcel delivery.");

// Verify delivered status
$finalCheck = httpReq('GET', "/admin/orders/{$orderNum2}", null, $devAdminToken);
assertCondition(
    $finalCheck['body']['data']['order_status'] === 'delivered',
    "Order #{$orderNum2} authoritatively transitioned to 'delivered' status."
);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
echo "\n====================================================================\n";
echo "STEP 12 TEST SUMMARY: Passed: {$passed} | Failed: {$failed}\n";
echo "====================================================================\n";

if ($failed > 0) {
    exit(1);
}
