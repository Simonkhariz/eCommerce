<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Controllers\CheckoutController;
use App\Support\Response;

// Disable exit on response and suppress CLI header warnings
@ini_set('display_errors', '0');
Response::$exitOnResponse = false;

Env::load(BASE_PATH . '/.env');
$db = Database::getInstance();

echo "=== PAYMENT RECEIPT AMOUNT VERIFICATION TEST ===\n\n";

// 1. Pick a paid order with a substantial amount
$paidOrder = $db->fetchOne("
    SELECT o.id, o.order_number, o.grand_total, o.currency, p.provider_reference, p.amount as payment_amount
    FROM `orders` o
    JOIN `payments` p ON p.order_id = o.id
    WHERE o.order_status = 'paid' AND o.payment_status = 'successful' AND o.grand_total > 1000
    ORDER BY o.id DESC LIMIT 1
");

if (!$paidOrder) {
    echo "No paid order found in database, creating a test paid order...\n";
    $testOrderNum = 'ORD-TEST-' . bin2hex(random_bytes(3));
    $orderId = $db->insert("
        INSERT INTO `orders` (`order_number`, `order_status`, `payment_status`, `currency`, `subtotal`, `grand_total`, `shipping_fee`, `created_at`, `updated_at`)
        VALUES (?, 'paid', 'successful', 'NGN', 75000.00, 75000.00, 0.00, NOW(), NOW())
    ", 's', [$testOrderNum]);
    $ref = 'PAY-' . $testOrderNum;
    $db->insert("
        INSERT INTO `payments` (`order_id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `verified_at`, `created_at`, `updated_at`)
        VALUES (?, 'kora', ?, 75000.00, 'NGN', 'successful', NOW(), NOW(), NOW())
    ", 'is', [$orderId, $ref]);
    $paidOrder = [
        'id' => $orderId,
        'order_number' => $testOrderNum,
        'grand_total' => 75000.00,
        'currency' => 'NGN',
        'provider_reference' => $ref,
        'payment_amount' => 75000.00,
    ];
}

$expectedAmount = (float) $paidOrder['grand_total'];
$orderNumber = $paidOrder['order_number'];
$reference = $paidOrder['provider_reference'];

echo "Testing with Paid Order: {$orderNumber}\n";
echo "Expected Paid Amount: NGN " . number_format($expectedAmount, 2) . "\n\n";

// Test verifyPayment endpoint
$_GET['reference'] = $reference;
$controller = new CheckoutController();

ob_start();
$controller->verifyPayment(['orderNumber' => $orderNumber]);
$output = ob_get_clean();

$response = json_decode($output, true);
assert($response !== null, "Response must be valid JSON.");
assert($response['success'] === true, "verifyPayment must return success=true.");

$data = $response['data'];
echo "verifyPayment Response Payload:\n";
echo "  Order Number: {$data['order_number']}\n";
echo "  Status: {$data['status']}\n";
echo "  Provider: {$data['provider']}\n";
echo "  Amount Returned: NGN " . number_format((float) $data['amount'], 2) . "\n";
echo "  Currency Returned: {$data['currency']}\n";

// CRITICAL ASSERTION: Amount must NOT be 0!
assert((float) $data['amount'] > 0, "Returned amount MUST NOT be 0. Returned: " . var_export($data['amount'], true));
assert(abs((float) $data['amount'] - $expectedAmount) < 0.01, "Returned amount must match expected paid amount NGN {$expectedAmount}. Returned: {$data['amount']}");
assert($data['currency'] === 'NGN', "Currency must match NGN.");

echo "\n✓ [PASS] verifyPayment returns authoritative non-zero amount ({$data['amount']})!\n";

// Test show endpoint
ob_start();
$controller->show(['orderNumber' => $orderNumber]);
$showOutput = ob_get_clean();

$showResponse = json_decode($showOutput, true);
assert($showResponse['success'] === true, "show endpoint must succeed.");
$showOrder = $showResponse['data'];

echo "\nshow Endpoint Response Payload:\n";
echo "  Order Grand Total: NGN " . number_format((float) $showOrder['grand_total'], 2) . "\n";
echo "  Payment Amount: NGN " . number_format((float) $showOrder['payment']['amount'], 2) . "\n";

assert((float) $showOrder['payment']['amount'] > 0, "Payment amount in order details MUST NOT be 0.");
assert(abs((float) $showOrder['payment']['amount'] - $expectedAmount) < 0.01, "Payment amount in order details must match expected paid amount.");

echo "✓ [PASS] show endpoint returns non-zero payment amount ({$showOrder['payment']['amount']})!\n";

echo "\n=======================================================\n";
echo ">>> ALL PAYMENT RECEIPT AMOUNT TESTS PASSED CLEANLY! <<<\n";
echo "=======================================================\n";
