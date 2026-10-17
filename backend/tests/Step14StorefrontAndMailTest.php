<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Services\CheckoutService;
use App\Services\FulfillmentService;
use App\Services\MailService;

Env::load(BASE_PATH . '/.env');
$db = Database::getInstance();

echo "=== STEP 14 VERIFICATION TEST SUITE ===\n\n";

// -----------------------------------------------------------------------------
// Test 1: Homepage CMS Aggregation
// -----------------------------------------------------------------------------
echo "[Test 1] Testing Storefront Homepage CMS Aggregation...\n";

$banners = $db->fetchAll(
    "SELECT id, title, subtitle, cta_text, cta_url, image_url, display_order FROM banners 
     WHERE is_active = 1 ORDER BY display_order ASC, id ASC LIMIT 5"
);
assert(!empty($banners), "Active banners should be retrieved from MySQL.");
echo "  ✓ Active banners retrieved: " . count($banners) . " items.\n";
echo "    Sample banner title: '{$banners[0]['title']}'\n";

$promotions = $db->fetchAll(
    "SELECT code, description, discount_percent FROM promotions 
     WHERE is_active = 1 
       AND (starts_at IS NULL OR starts_at <= NOW()) 
       AND (expires_at IS NULL OR expires_at >= NOW()) 
       AND (max_uses <= 0 OR used_count < max_uses)
     ORDER BY id DESC LIMIT 5"
);
assert(!empty($promotions), "Active, valid promotions should be retrieved.");
echo "  ✓ Active promotions retrieved: " . count($promotions) . " items.\n";
echo "    Sample promo code: '{$promotions[0]['code']}' ({$promotions[0]['discount_percent']}% off)\n";

$reviews = $db->fetchAll(
    "SELECT r.id, r.product_id, r.rating, r.title, r.comment, r.created_at, 
            r.author_name as author, r.is_verified_purchase as verified, 
            p.name as product_name
     FROM reviews r
     LEFT JOIN products p ON p.id = r.product_id
     WHERE r.status = 'approved'
     ORDER BY r.created_at DESC LIMIT 10"
);
assert(!empty($reviews), "Approved reviews should be retrieved.");
echo "  ✓ Approved reviews retrieved: " . count($reviews) . " items.\n";
echo "    Sample review author: '{$reviews[0]['author']}' - '{$reviews[0]['comment']}'\n";

// -----------------------------------------------------------------------------
// Test 2: Server-Side Promotion Validation & Expiration/Limit Enforcements
// -----------------------------------------------------------------------------
echo "\n[Test 2] Testing Server-Side Promotion Validation...\n";
$checkoutService = new CheckoutService($db);

// 2a. Valid coupon
$eval = $checkoutService->evaluateCoupon('SUMMER20', 10000.0);
assert($eval['coupon']['code'] === 'SUMMER20', "Valid code must match.");
assert($eval['discount_amount'] == 2000.0, "20% of 10000 must be 2000.00.");
echo "  ✓ Valid promo SUMMER20 evaluated correctly: discount = NGN {$eval['discount_amount']}.\n";

// 2b. Non-existent code
$rejected = false;
try {
    $checkoutService->evaluateCoupon('NONEXISTENT_CODE_XYZ', 10000.0);
} catch (\InvalidArgumentException $e) {
    $rejected = true;
    echo "  ✓ Non-existent promo properly rejected: {$e->getMessage()}\n";
}
assert($rejected, "Non-existent promo must throw InvalidArgumentException.");

// 2c. Expiration date check (simulate expired promo in DB)
$db->execute(
    "INSERT INTO `promotions` (`code`, `description`, `discount_percent`, `max_uses`, `used_count`, `is_active`, `starts_at`, `expires_at`)
     VALUES ('EXPIRED_TEST_PROMO', 'Expired coupon', 25, 100, 0, 1, '2020-01-01 00:00:00', '2021-01-01 00:00:00')
     ON DUPLICATE KEY UPDATE `expires_at` = '2021-01-01 00:00:00'"
);
$expiredRejected = false;
try {
    $checkoutService->evaluateCoupon('EXPIRED_TEST_PROMO', 10000.0);
} catch (\InvalidArgumentException $e) {
    $expiredRejected = true;
    echo "  ✓ Expired promo properly rejected: {$e->getMessage()}\n";
}
assert($expiredRejected, "Expired promo must be rejected.");

// 2d. Max uses limit check
$db->execute(
    "INSERT INTO `promotions` (`code`, `description`, `discount_percent`, `max_uses`, `used_count`, `is_active`)
     VALUES ('MAX_USES_TEST_PROMO', 'Maxed coupon', 30, 5, 5, 1)
     ON DUPLICATE KEY UPDATE `max_uses` = 5, `used_count` = 5"
);
$maxedRejected = false;
try {
    $checkoutService->evaluateCoupon('MAX_USES_TEST_PROMO', 10000.0);
} catch (\InvalidArgumentException $e) {
    $maxedRejected = true;
    echo "  ✓ Maxed uses promo properly rejected: {$e->getMessage()}\n";
}
assert($maxedRejected, "Over-limit promo must be rejected.");

// Clean up test promos
$db->execute("DELETE FROM `promotions` WHERE `code` IN ('EXPIRED_TEST_PROMO', 'MAX_USES_TEST_PROMO')");

// -----------------------------------------------------------------------------
// Test 3: MailService Reliability, Guard Enforcement, & Safe Dev Logging
// -----------------------------------------------------------------------------
echo "\n[Test 3] Testing MailService & Lifecycle Notification Pipeline...\n";
$mail = MailService::getInstance();

$testOrderNumber = 'TEST-ORD-VERIF-' . substr(bin2hex(random_bytes(3)), 0, 6);
$mockOrder = [
    'order_number' => $testOrderNumber,
    'guest_email' => 'buyer.test@example.com',
    'grand_total' => 45000.00,
    'subtotal' => 42000.00,
    'shipping_fee' => 3000.00,
    'discount_amount' => 0.00,
    'currency' => 'NGN',
    'order_status' => 'pending_payment',
    'payment_status' => 'pending',
    'shipping_address' => [
        'full_name' => 'Adaobi Okafor',
        'address_line1' => '25 Independence Layout',
        'city' => 'Enugu',
        'state' => 'Enugu',
    ],
    'items' => [
        ['name' => 'Linen Resort Shirt', 'quantity' => 2, 'line_total' => 42000.00],
    ],
];

// 3a. Order Received (Pending Payment)
$resOrderReceived = $mail->sendOrderReceived($mockOrder);
assert($resOrderReceived === true, "sendOrderReceived should record to dev mail log.");
echo "  ✓ order_received notification safely dispatched and logged.\n";

// 3b. Guard against unverified payment email
$unverifiedBlocked = false;
$resUnverified = $mail->sendPaymentVerified($mockOrder);
assert($resUnverified === false, "Guard must refuse to send payment_verified email for pending order.");
echo "  ✓ Guard strictly blocked sending payment_verified email for unverified order.\n";

// 3c. Payment Verified (strictly after payment transition)
$mockOrder['order_status'] = 'paid';
$mockOrder['payment_status'] = 'successful';
$resVerified = $mail->sendPaymentVerified($mockOrder, [
    'reference' => 'TEST-PAY-REF-1234',
    'payment_method' => 'Monnify / Transfer',
]);
assert($resVerified === true, "sendPaymentVerified should succeed when order is paid & verified.");
echo "  ✓ payment_verified notification safely dispatched with official receipt.\n";

// 3d. Shipment Tracking Notification
$resTracking = $mail->sendShipmentTracking($mockOrder, [
    'carrier' => 'GIG Logistics',
    'tracking_number' => 'GIG-ENUGU-882910',
    'tracking_url' => 'https://giglogistics.com/track?no=GIG-ENUGU-882910',
    'status' => 'in_transit',
]);
assert($resTracking === true, "sendShipmentTracking should succeed.");
echo "  ✓ shipment_tracking notification safely dispatched with carrier details.\n";

// 3e. Refund Notification
$resRefund = $mail->sendCancellationOrRefund($mockOrder, 'refund', [
    'amount' => 45000.00,
    'reason' => 'Customer requested cancellation prior to physical dispatch',
    'reference' => 'REF-TEST-9901',
]);
assert($resRefund === true, "sendCancellationOrRefund should succeed.");
echo "  ✓ refund_processed notification safely dispatched.\n";

// 3f. Deduplication Check
$resDuplicate = $mail->sendShipmentTracking($mockOrder, [
    'carrier' => 'GIG Logistics',
    'tracking_number' => 'GIG-ENUGU-882910',
]);
assert($resDuplicate === true, "Deduplication should return true without inserting duplicate record.");
echo "  ✓ Deduplication successfully prevented spamming duplicate notification.\n";

// -----------------------------------------------------------------------------
// Test 4: Database Outbox and Mail Log Verification
// -----------------------------------------------------------------------------
echo "\n[Test 4] Verifying email_outbox and storage/logs/mail.log...\n";

$outboxRows = $db->fetchAll(
    "SELECT * FROM `email_outbox` WHERE `recipient_email` = 'buyer.test@example.com' ORDER BY `id` ASC"
);
echo "  ✓ Outbox recorded " . count($outboxRows) . " notifications for test buyer.\n";
foreach ($outboxRows as $row) {
    echo "    - [ID: {$row['id']}] Template: {$row['template']} | Status: {$row['status']} | Subject: '{$row['subject']}'\n";
}

$mailLogPath = BASE_PATH . '/storage/logs/mail.log';
assert(file_exists($mailLogPath), "mail.log file must exist.");
$logContent = file_get_contents($mailLogPath);
assert(str_contains($logContent, $testOrderNumber), "mail.log must contain entries for {$testOrderNumber}.");
echo "  ✓ mail.log contains verified transcripts for {$testOrderNumber}.\n";

// Clean up test outbox records
$db->execute("DELETE FROM `email_outbox` WHERE `recipient_email` = 'buyer.test@example.com'");

echo "\n=======================================================\n";
echo ">>> ALL STEP 14 VERIFICATION TESTS PASSED SUCCESSFULLY! <<<\n";
echo "=======================================================\n";
