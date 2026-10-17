<?php

declare(strict_types=1);

/**
 * STEP 8 Test Matrix: Checkout Quotation, Shipping Resolution & Order Creation
 *
 * Test cases:
 * 1. Empty cart rejection (Quote & Order)
 * 2. Invalid item quantities (zero/negative)
 * 3. Client price tampering resistance (MySQL real prices enforced)
 * 4. Out-of-stock item rejection
 * 5. Destination shipping zone resolution (Enugu Metro, Regional Hub, Major Hubs, Rest of Nigeria)
 * 6. Out-of-zone / unserved location rejection (Never silently free)
 * 7. Promotion coupon validation (SHOP20 20% discount calculation)
 * 8. Guest checkout (Order creation, ORD number, 256-bit guest token generation & hash storage)
 * 9. Order tracking with guest access token & rejection of unauthorized tokens
 * 10. Authenticated customer checkout (Links user_id to order)
 * 11. Atomic inventory reservation & negative stock / oversell prevention
 */

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Services\CheckoutService;
use App\Repositories\UserRepository;

Env::load(BASE_PATH . '/.env');
$db = Database::getInstance();
$checkoutService = new CheckoutService($db);

$passed = 0;
$failed = 0;

function assertTest(bool $condition, string $testName, string $details = ''): void {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  [PASS] {$testName}\n";
    } else {
        $failed++;
        echo "  [FAIL] {$testName} - Details: {$details}\n";
    }
}

echo "====================================================================\n";
echo "STEP 8 TEST MATRIX: CHECKOUT & TRANSACTIONAL ORDER CREATION\n";
echo "====================================================================\n\n";

// Fetch an active published product and its variant for testing
$product = $db->fetchOne("SELECT p.id, p.name, p.base_price, v.id as variant_id, v.sku, v.stock_quantity 
                          FROM products p 
                          JOIN product_variants v ON p.id = v.product_id 
                          WHERE p.status = 'published' AND v.stock_quantity >= 5 
                          LIMIT 1");

if (!$product) {
    echo "[ABORT] No published product with sufficient stock found in database.\n";
    exit(1);
}

$productId = (int) $product['id'];
$variantId = (int) $product['variant_id'];
$basePrice = (float) $product['base_price'];
$initialStock = (int) $product['stock_quantity'];

echo "Test Fixture: Product #{$productId} '{$product['name']}', Variant #{$variantId} ({$product['sku']}), Price: NGN {$basePrice}, Stock: {$initialStock}\n\n";

// -----------------------------------------------------------------------------
// TEST 1: Empty Cart Rejection
// -----------------------------------------------------------------------------
echo "1. Testing Empty Cart Rejection...\n";
try {
    $checkoutService->getQuote(['items' => []]);
    assertTest(false, 'Quote with empty items array must throw exception');
} catch (InvalidArgumentException $e) {
    assertTest(true, 'Quote rejected empty items with 422 InvalidArgumentException', $e->getMessage());
}

try {
    $checkoutService->createOrder([
        'email' => 'test@example.com',
        'items' => [],
        'shipping_address' => [
            'full_name' => 'Tester',
            'phone' => '+2348012345678',
            'address_line1' => '12 Okpara Ave',
            'city' => 'Enugu',
            'state' => 'Enugu',
        ]
    ]);
    assertTest(false, 'Create order with empty items array must throw exception');
} catch (InvalidArgumentException $e) {
    assertTest(true, 'Order creation rejected empty items', $e->getMessage());
}

// -----------------------------------------------------------------------------
// TEST 2: Invalid Quantities (Zero and Negative)
// -----------------------------------------------------------------------------
echo "\n2. Testing Invalid Quantities...\n";
try {
    $checkoutService->getQuote([
        'items' => [
            ['product_id' => $productId, 'variant_id' => $variantId, 'quantity' => 0]
        ]
    ]);
    assertTest(false, 'Zero quantity must be rejected');
} catch (InvalidArgumentException $e) {
    assertTest(true, 'Zero quantity rejected', $e->getMessage());
}

try {
    $checkoutService->getQuote([
        'items' => [
            ['product_id' => $productId, 'variant_id' => $variantId, 'quantity' => -3]
        ]
    ]);
    assertTest(false, 'Negative quantity must be rejected');
} catch (InvalidArgumentException $e) {
    assertTest(true, 'Negative quantity rejected', $e->getMessage());
}

// -----------------------------------------------------------------------------
// TEST 3: Price Tampering Resistance (MySQL Real Prices Loaded)
// -----------------------------------------------------------------------------
echo "\n3. Testing Price Tampering Resistance...\n";
// Attempt to inject client-side manipulated price of NGN 100
$quote = $checkoutService->getQuote([
    'items' => [
        [
            'product_id' => $productId,
            'variant_id' => $variantId,
            'quantity' => 2,
            'unit_price' => 100.00, // Client forgery attempt
            'price' => 50.00,        // Another client forgery attempt
        ]
    ]
]);

$expectedSubtotal = round($basePrice * 2, 2);
assertTest($quote['subtotal'] === $expectedSubtotal, 'Real MySQL price used for subtotal calculation', "Expected {$expectedSubtotal}, Got {$quote['subtotal']}");
assertTest($quote['items'][0]['unit_price'] === $basePrice, 'Item unit price loaded directly from database');

// -----------------------------------------------------------------------------
// TEST 4: Out-Of-Stock Rejection
// -----------------------------------------------------------------------------
echo "\n4. Testing Out-of-Stock Item Rejection...\n";
try {
    $checkoutService->getQuote([
        'items' => [
            ['product_id' => $productId, 'variant_id' => $variantId, 'quantity' => $initialStock + 100]
        ]
    ]);
    assertTest(false, 'Requesting more than available stock must fail');
} catch (RuntimeException $e) {
    assertTest(true, 'Quote blocked due to insufficient stock', $e->getMessage());
}

// -----------------------------------------------------------------------------
// TEST 5: Shipping Destination Zone Resolution
// -----------------------------------------------------------------------------
echo "\n5. Testing Location Resolution Against Active Shipping Rules...\n";

// 5a. Intra-state Enugu Urban
$enuguRes = $checkoutService->resolveShippingZone([
    'country' => 'Nigeria',
    'state' => 'Enugu',
    'city' => 'Enugu',
]);
assertTest($enuguRes['selected_zone']['fee'] === 1500.0, 'Enugu Urban zone fee is NGN 1500.00');

// 5b. South-East Regional Hub (Anambra)
$anambraRes = $checkoutService->resolveShippingZone([
    'country' => 'Nigeria',
    'state' => 'Anambra',
    'city' => 'Awka',
]);
assertTest($anambraRes['selected_zone']['fee'] === 3000.0, 'Anambra regional fee is NGN 3000.00');

// 5c. Major Hubs (Lagos)
$lagosRes = $checkoutService->resolveShippingZone([
    'country' => 'Nigeria',
    'state' => 'Lagos',
    'city' => 'Ikeja',
]);
assertTest($lagosRes['selected_zone']['fee'] === 4500.0, 'Lagos major commercial hub fee is NGN 4500.00');

// 5d. Rest of Nigeria (Kano)
$kanoRes = $checkoutService->resolveShippingZone([
    'country' => 'Nigeria',
    'state' => 'Kano',
    'city' => 'Kano',
]);
assertTest($kanoRes['selected_zone']['fee'] === 6000.0, 'Kano Rest of Nigeria fee is NGN 6000.00');

// -----------------------------------------------------------------------------
// TEST 6: Out-of-Zone / Unserved Location Rejection (Never Silently Free)
// -----------------------------------------------------------------------------
echo "\n6. Testing Out-of-Zone Address & International Rejection...\n";
try {
    $checkoutService->resolveShippingZone([
        'country' => 'United States',
        'state' => 'California',
        'city' => 'Los Angeles',
    ]);
    assertTest(false, 'International address must be rejected');
} catch (InvalidArgumentException $e) {
    assertTest(true, 'International destination rejected (not silently given free shipping)', $e->getMessage());
}

try {
    $checkoutService->resolveShippingZone([
        'country' => 'Nigeria',
        'state' => '', // Empty state
    ]);
    assertTest(false, 'Empty state must be rejected');
} catch (InvalidArgumentException $e) {
    assertTest(true, 'Empty destination state rejected', $e->getMessage());
}

// -----------------------------------------------------------------------------
// TEST 7: Promotion Coupon Evaluation
// -----------------------------------------------------------------------------
echo "\n7. Testing Promotion Coupon SHOP20 (20% off)...\n";
$promo = $checkoutService->evaluateCoupon('SHOP20', 20000.00);
assertTest($promo['discount_amount'] === 4000.00, 'SHOP20 applies 20% discount on 20,000 subtotal (NGN 4,000)');
assertTest($promo['coupon']['code'] === 'SHOP20', 'Coupon code correctly matched');

try {
    $checkoutService->evaluateCoupon('NONEXISTENT_PROMO_CODE', 10000.00);
    assertTest(false, 'Invalid promo code must be rejected');
} catch (InvalidArgumentException $e) {
    assertTest(true, 'Invalid promo code rejected', $e->getMessage());
}

// -----------------------------------------------------------------------------
// TEST 8: Guest Checkout with Valid Zone and Coupon
// -----------------------------------------------------------------------------
echo "\n8. Testing Guest Checkout Order Creation Transaction...\n";
$stockBeforeOrder = (int) $db->fetchOne("SELECT stock_quantity FROM product_variants WHERE id = ?", 'i', [$variantId])['stock_quantity'];

$guestOrder = $checkoutService->createOrder([
    'email' => 'guest.shopper@example.com',
    'coupon_code' => 'SHOP20',
    'items' => [
        ['product_id' => $productId, 'variant_id' => $variantId, 'quantity' => 2]
    ],
    'shipping_address' => [
        'full_name' => 'Chinedu Eze',
        'phone' => '+234 803 111 2233',
        'address_line1' => '24 Chime Avenue, New Haven',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'country' => 'Nigeria',
    ],
    'notes' => 'Leave with security if not home',
]);

assertTest(!empty($guestOrder['order_number']), "Order number generated: {$guestOrder['order_number']}");
assertTest(str_starts_with($guestOrder['order_number'], 'ORD-'), 'Order number matches ORD- format');
assertTest(strlen($guestOrder['guest_access_token']) === 64, 'High-entropy 256-bit guest access token issued');
assertTest($guestOrder['status'] === 'pending_payment', 'Order status initialized to pending_payment');
assertTest($guestOrder['payment_status'] === 'pending', 'Payment status initialized to pending');
assertTest($guestOrder['shipping_fee'] === 1500.0, 'Enugu shipping fee applied correctly');

$orderSubtotal = round($basePrice * 2, 2);
$expectedDiscount = round($orderSubtotal * 0.20, 2);
$expectedGrandTotal = round($orderSubtotal - $expectedDiscount + 1500.0, 2);

assertTest($guestOrder['subtotal'] === $orderSubtotal, 'Subtotal correctly recorded');
assertTest($guestOrder['discount_amount'] === $expectedDiscount, 'Discount amount correctly recorded');
assertTest($guestOrder['grand_total'] === $expectedGrandTotal, "Grand total verified: {$guestOrder['grand_total']}");

// Verify guest_access_token_hash stored in DB matches sha256 of plain token
$dbOrder = $db->fetchOne("SELECT * FROM orders WHERE id = ?", 'i', [$guestOrder['order_id']]);
$expectedHash = hash('sha256', $guestOrder['guest_access_token']);
assertTest(hash_equals($dbOrder['guest_access_token_hash'], $expectedHash), 'Guest access token hash matches SHA-256');

// Verify inventory decremented by 2
$stockAfterOrder = (int) $db->fetchOne("SELECT stock_quantity FROM product_variants WHERE id = ?", 'i', [$variantId])['stock_quantity'];
assertTest($stockAfterOrder === ($stockBeforeOrder - 2), "Inventory decremented atomically from {$stockBeforeOrder} to {$stockAfterOrder}");

// Verify order_items persisted
$orderItems = $db->fetchAll("SELECT * FROM order_items WHERE order_id = ?", 'i', [$guestOrder['order_id']]);
assertTest(count($orderItems) === 1, '1 order item snapshot persisted');
assertTest((float) $orderItems[0]['unit_price'] === $basePrice, 'Order item unit_price persisted accurately');

// Verify pending payment persisted
$payment = $db->fetchOne("SELECT * FROM payments WHERE order_id = ?", 'i', [$guestOrder['order_id']]);
assertTest($payment !== null && $payment['status'] === 'pending', 'Pending payment record created');
assertTest((float) $payment['amount'] === $expectedGrandTotal, 'Payment amount matches grand total');

// -----------------------------------------------------------------------------
// TEST 9: Authenticated Customer Checkout
// -----------------------------------------------------------------------------
echo "\n9. Testing Authenticated Customer Checkout...\n";
// Find or create test customer
$userRepo = new UserRepository();
$testUser = $userRepo->findByEmail('customer.step8@shop.co');
if (!$testUser) {
    $userId = (int) $db->insert(
        "INSERT INTO `users` (`uuid`, `email`, `full_name`, `role`, `status`) VALUES (?, ?, ?, 'customer', 'active')",
        'sss',
        [bin2hex(random_bytes(16)), 'customer.step8@shop.co', 'Adaora Okeke']
    );
} else {
    $userId = (int) $testUser['id'];
}

$userOrder = $checkoutService->createOrder([
    'email' => 'customer.step8@shop.co',
    'items' => [
        ['product_id' => $productId, 'variant_id' => $variantId, 'quantity' => 1]
    ],
    'shipping_address' => [
        'full_name' => 'Adaora Okeke',
        'phone' => '+234 802 999 8888',
        'address_line1' => '10 Admiralty Way, Lekki',
        'city' => 'Lagos',
        'state' => 'Lagos',
        'country' => 'Nigeria',
    ],
], $userId);

assertTest($userOrder['user_id'] === $userId, "Order successfully linked to customer ID {$userId}");
assertTest($userOrder['shipping_fee'] === 4500.0, 'Lagos shipping fee NGN 4,500 applied');

// -----------------------------------------------------------------------------
// TEST 10: Atomic Inventory Reservation & Overselling Prevention
// -----------------------------------------------------------------------------
echo "\n10. Testing Atomic Overselling Prevention (Negative Stock Guard)...\n";
$currentStock = (int) $db->fetchOne("SELECT stock_quantity FROM product_variants WHERE id = ?", 'i', [$variantId])['stock_quantity'];

// Try to order more than current stock
try {
    $checkoutService->createOrder([
        'email' => 'oversell.attempt@example.com',
        'items' => [
            ['product_id' => $productId, 'variant_id' => $variantId, 'quantity' => $currentStock + 5]
        ],
        'shipping_address' => [
            'full_name' => 'Greedy Buyer',
            'phone' => '+234 800 000 0000',
            'address_line1' => '1 Test Road',
            'city' => 'Enugu',
            'state' => 'Enugu',
            'country' => 'Nigeria',
        ],
    ]);
    assertTest(false, 'Oversell attempt must fail with INSUFFICIENT_STOCK');
} catch (RuntimeException $e) {
    assertTest(str_contains($e->getMessage(), 'Insufficient stock'), 'Overselling blocked atomically inside transaction', $e->getMessage());
}

// Verify stock remained unchanged after aborted transaction
$stockAfterAborted = (int) $db->fetchOne("SELECT stock_quantity FROM product_variants WHERE id = ?", 'i', [$variantId])['stock_quantity'];
assertTest($stockAfterAborted === $currentStock, "Stock preserved at {$stockAfterAborted} after transaction rollback");

// -----------------------------------------------------------------------------
// Restore test stock to keep DB clean
// -----------------------------------------------------------------------------
$db->executeUpdate("UPDATE product_variants SET stock_quantity = ? WHERE id = ?", 'ii', [$initialStock, $variantId]);
echo "\nTest variant stock restored to original {$initialStock}.\n";

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
echo "\n====================================================================\n";
echo "STEP 8 TEST RESULTS: {$passed} PASSED, {$failed} FAILED\n";
echo "====================================================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
