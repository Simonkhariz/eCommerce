<?php

declare(strict_types=1);

/**
 * STEP 10 Test Matrix: Kora Verification, Webhooks & Idempotency
 *
 * Test cases:
 * 1. Cryptographic Signature Verification (HMAC SHA-256 over data sub-object)
 * 2. Invalid Webhook Signature Rejection (401 Unauthorized)
 * 3. Valid Webhook Success Event (`charge.success`) -> marks order & payment paid
 * 4. Zero Duplicate Stock Deduction / Grants Invariant
 * 5. Idempotent Duplicate Webhook Handling (`ignored_duplicate`)
 * 6. Wrong Amount Rejection (Amount mismatch tampering guard)
 * 7. Wrong Currency Rejection (Currency mismatch guard)
 * 8. Unmatched Reference Rejection (No ghost orders created)
 * 9. Delayed Bank Transfer / Pending Payment (Kept pending, not marked successful)
 * 10. Out-of-Order Event Handling (`charge.failed` received after confirmed success)
 * 11. Authoritative Backend Transaction Verification (`GET /charges/:reference` mock)
 * 12. Repeated Verification Request (Idempotent cached result)
 * 13. Verification Network Timeout Handling (Retains recoverable pending order)
 * 14. Browser Closed Before Return (Webhook asynchronously finalizes order)
 */

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Services\CheckoutService;
use App\Services\KoraService;

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
echo "STEP 10 TEST MATRIX: KORA WEBHOOKS, VERIFICATION & IDEMPOTENCY\n";
echo "====================================================================\n\n";

$secretKey = Env::get('KORA_SECRET_KEY', 'sk_test_step10_secret_key');

$defaultMockExecutor = function(string $method, string $url, array $headers, ?string $body, int $timeout): array {
    $parsedBody = json_decode((string) $body, true) ?? [];
    return [
        'status_code' => 200,
        'body' => json_encode([
            'status' => true,
            'message' => 'Charge initialized successfully',
            'data' => [
                'reference' => $parsedBody['reference'] ?? 'PAY-MOCK-REF',
                'checkout_url' => 'https://checkout.korapay.com/pay/mock_pay_' . bin2hex(random_bytes(4)),
                'amount' => $parsedBody['amount'] ?? 10000,
                'currency' => 'NGN',
                'status' => 'pending',
            ]
        ]),
        'error' => null,
    ];
};

$koraService = new KoraService($db, $defaultMockExecutor);

// Fetch an active product for fixture
$product = $db->fetchOne("SELECT p.id, v.id as variant_id, v.stock_quantity FROM products p JOIN product_variants v ON p.id = v.product_id WHERE p.status = 'published' AND v.stock_quantity >= 5 LIMIT 1");
$initialStock = (int) $product['stock_quantity'];

// -----------------------------------------------------------------------------
// Helper: Helper to sign payload matching Kora specification
// -----------------------------------------------------------------------------
function signKoraPayload(array $payload, string $key): string {
    $dataJson = json_encode($payload['data'], JSON_UNESCAPED_SLASHES);
    return hash_hmac('sha256', $dataJson, $key);
}

// -----------------------------------------------------------------------------
// TEST 1: Cryptographic Signature Verification
// -----------------------------------------------------------------------------
echo "1. Testing Cryptographic HMAC SHA-256 Webhook Signature Verification...\n";
$samplePayload = [
    'event' => 'charge.success',
    'data' => [
        'reference' => 'PAY-SAMPLE-1234',
        'amount' => 15000.00,
        'currency' => 'NGN',
        'status' => 'success',
    ],
];
$validSig = signKoraPayload($samplePayload, $secretKey);
$rawBody = json_encode($samplePayload);

assertTest($koraService->verifyWebhookSignature($rawBody, $validSig), 'Valid Kora signature passes cryptographic verification');
assertTest(!$koraService->verifyWebhookSignature($rawBody, 'forged_fake_signature_hex_value'), 'Forged signature fails cryptographic verification');
assertTest(!$koraService->verifyWebhookSignature('', $validSig), 'Empty raw body fails signature verification');

// -----------------------------------------------------------------------------
// TEST 2: Webhook Handler Rejects Invalid Signature
// -----------------------------------------------------------------------------
echo "\n2. Testing Webhook Handler Rejection on Invalid Signature...\n";
try {
    $koraService->handleWebhook($rawBody, 'invalid_sig');
    assertTest(false, 'Invalid signature must throw InvalidArgumentException');
} catch (InvalidArgumentException $e) {
    assertTest(str_contains($e->getMessage(), 'signature verification failed'), 'Invalid signature rejected with 401 exception', $e->getMessage());
}

// Verify event was logged as failed in payment_webhook_events
$failedEvent = $db->fetchOne("SELECT signature_valid, processing_result FROM payment_webhook_events WHERE processing_result = 'failed' ORDER BY id DESC LIMIT 1");
assertTest($failedEvent !== null && (int) $failedEvent['signature_valid'] === 0, 'Invalid signature attempt recorded with signature_valid = 0');

// -----------------------------------------------------------------------------
// TEST 3 & 4: Valid Webhook Success Event (`charge.success`) & Zero Stock Rededuction
// -----------------------------------------------------------------------------
echo "\n3. Testing Valid Webhook Success Event & Zero Stock Re-deduction Invariant...\n";
// Create test order
$orderFixture1 = $checkoutService->createOrder([
    'email' => 'webhook.success@example.com',
    'items' => [
        ['product_id' => (int) $product['id'], 'variant_id' => (int) $product['variant_id'], 'quantity' => 2]
    ],
    'shipping_address' => [
        'full_name' => 'Amaka Obi',
        'phone' => '+2348011223344',
        'address_line1' => '20 Independence Layout',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'country' => 'Nigeria',
    ],
]);

$orderNumber1 = $orderFixture1['order_number'];
$orderId1 = (int) $orderFixture1['order_id'];
$grandTotal1 = (float) $orderFixture1['grand_total'];

// Initialize payment session
$initRes1 = $koraService->initializeCheckout($orderNumber1);
$providerRef1 = $initRes1['provider_reference'];

// Check stock right before webhook
$stockBeforeWebhook = (int) $db->fetchOne("SELECT stock_quantity FROM product_variants WHERE id = ?", 'i', [(int) $product['variant_id']])['stock_quantity'];

// Create valid charge.success webhook payload
$webhookSuccessPayload = [
    'event' => 'charge.success',
    'event_id' => 'evt_test_001_' . bin2hex(random_bytes(4)),
    'data' => [
        'reference' => $providerRef1,
        'amount' => $grandTotal1,
        'currency' => 'NGN',
        'status' => 'success',
        'payment_method' => 'card',
        'paid_at' => date('Y-m-d H:i:s'),
    ],
];

$validSuccessSig = signKoraPayload($webhookSuccessPayload, $secretKey);
$resWebhook = $koraService->handleWebhook(json_encode($webhookSuccessPayload), $validSuccessSig);

assertTest($resWebhook['status'] === 'processed', 'Webhook processed successfully');
assertTest($resWebhook['payment_status'] === 'successful', 'Payment status marked as successful');
assertTest($resWebhook['order_status'] === 'paid', 'Order status transitioned to paid');

// Verify DB order and payment states
$dbOrder1 = $db->fetchOne("SELECT order_status, payment_status FROM orders WHERE id = ?", 'i', [$orderId1]);
$dbPayment1 = $db->fetchOne("SELECT status, verified_at, payment_method FROM payments WHERE order_id = ?", 'i', [$orderId1]);

assertTest($dbOrder1['order_status'] === 'paid', 'Order in DB is marked paid');
assertTest($dbOrder1['payment_status'] === 'successful', 'Order payment_status in DB is successful');
assertTest($dbPayment1['status'] === 'successful', 'Payment in DB is marked successful');
assertTest(!empty($dbPayment1['verified_at']), 'Payment verified_at timestamp recorded');

// Zero duplicate stock deduction check: stock must be identical before and after webhook!
$stockAfterWebhook = (int) $db->fetchOne("SELECT stock_quantity FROM product_variants WHERE id = ?", 'i', [(int) $product['variant_id']])['stock_quantity'];
assertTest($stockAfterWebhook === $stockBeforeWebhook, "Zero stock re-deduction: stock remained at {$stockAfterWebhook}");

// -----------------------------------------------------------------------------
// TEST 5: Idempotent Duplicate Webhook Handling
// -----------------------------------------------------------------------------
echo "\n5. Testing Webhook Deduplication & Idempotency...\n";
// Send the exact same webhook payload again
$duplicateRes = $koraService->handleWebhook(json_encode($webhookSuccessPayload), $validSuccessSig);

assertTest($duplicateRes['status'] === 'ignored_duplicate', 'Duplicate webhook identified and returned ignored_duplicate');

// Count status history entries: must only have 1 'paid' entry, never duplicates
$paidHistoryCount = (int) $db->fetchOne("SELECT COUNT(*) as c FROM order_status_history WHERE order_id = ? AND new_status = 'paid'", 'i', [$orderId1])['c'];
assertTest($paidHistoryCount === 1, 'Order status history contains exactly 1 transition to paid (no duplicate records)');

// -----------------------------------------------------------------------------
// TEST 6: Wrong Amount Rejection (Amount Tampering Guard)
// -----------------------------------------------------------------------------
echo "\n6. Testing Tampered Webhook Amount Rejection...\n";
$orderFixture2 = $checkoutService->createOrder([
    'email' => 'tamper.amount@example.com',
    'items' => [['product_id' => (int) $product['id'], 'variant_id' => (int) $product['variant_id'], 'quantity' => 1]],
    'shipping_address' => ['full_name' => 'Tester', 'phone' => '+2348000000000', 'address_line1' => '1 Rd', 'city' => 'Enugu', 'state' => 'Enugu', 'country' => 'Nigeria'],
]);
$initRes2 = $koraService->initializeCheckout($orderFixture2['order_number']);

$tamperedAmountPayload = [
    'event' => 'charge.success',
    'event_id' => 'evt_tamper_amt_' . bin2hex(random_bytes(3)),
    'data' => [
        'reference' => $initRes2['provider_reference'],
        'amount' => 500.00, // Deliberately wrong amount
        'currency' => 'NGN',
        'status' => 'success',
    ]
];
$tamperedSig = signKoraPayload($tamperedAmountPayload, $secretKey);

try {
    $koraService->handleWebhook(json_encode($tamperedAmountPayload), $tamperedSig);
    assertTest(false, 'Amount mismatch must throw RuntimeException');
} catch (RuntimeException $e) {
    assertTest(str_contains($e->getMessage(), 'amount mismatch'), 'Tampered amount rejected', $e->getMessage());
}

// Order must remain pending
$dbOrder2 = $db->fetchOne("SELECT order_status FROM orders WHERE id = ?", 'i', [(int) $orderFixture2['order_id']]);
assertTest($dbOrder2['order_status'] === 'pending_payment', 'Order remains in pending_payment after amount mismatch');

// -----------------------------------------------------------------------------
// TEST 7: Wrong Currency Rejection
// -----------------------------------------------------------------------------
echo "\n7. Testing Currency Mismatch Rejection...\n";
$tamperedCurrencyPayload = [
    'event' => 'charge.success',
    'event_id' => 'evt_tamper_curr_' . bin2hex(random_bytes(3)),
    'data' => [
        'reference' => $initRes2['provider_reference'],
        'amount' => (float) $orderFixture2['grand_total'],
        'currency' => 'USD', // Deliberately wrong currency
        'status' => 'success',
    ]
];
$tamperedCurrSig = signKoraPayload($tamperedCurrencyPayload, $secretKey);

try {
    $koraService->handleWebhook(json_encode($tamperedCurrencyPayload), $tamperedCurrSig);
    assertTest(false, 'Currency mismatch must throw RuntimeException');
} catch (RuntimeException $e) {
    assertTest(str_contains($e->getMessage(), 'currency mismatch'), 'Currency mismatch rejected', $e->getMessage());
}

// -----------------------------------------------------------------------------
// TEST 8: Unmatched Reference Rejection (No Ghost Orders)
// -----------------------------------------------------------------------------
echo "\n8. Testing Unmatched Reference Rejection...\n";
$unmatchedPayload = [
    'event' => 'charge.success',
    'event_id' => 'evt_unmatched_' . bin2hex(random_bytes(3)),
    'data' => [
        'reference' => 'PAY-NONEXISTENT-ORDER-9999',
        'amount' => 50000.00,
        'currency' => 'NGN',
        'status' => 'success',
    ]
];
$unmatchedSig = signKoraPayload($unmatchedPayload, $secretKey);

try {
    $koraService->handleWebhook(json_encode($unmatchedPayload), $unmatchedSig);
    assertTest(false, 'Unmatched reference must throw RuntimeException');
} catch (RuntimeException $e) {
    assertTest(str_contains($e->getMessage(), 'No order or payment found'), 'Unmatched reference rejected safely', $e->getMessage());
}

// -----------------------------------------------------------------------------
// TEST 9: Delayed Bank Transfer / Pending Payment (Never Silently Marked Successful)
// -----------------------------------------------------------------------------
echo "\n9. Testing Delayed Bank Transfer Handling (Pending Settlement)...\n";
$pendingPayload = [
    'event' => 'charge.success', // Event says success, but data status is still pending
    'event_id' => 'evt_delayed_bank_' . bin2hex(random_bytes(3)),
    'data' => [
        'reference' => $initRes2['provider_reference'],
        'amount' => (float) $orderFixture2['grand_total'],
        'currency' => 'NGN',
        'status' => 'pending', // Not yet settled!
    ]
];
$pendingSig = signKoraPayload($pendingPayload, $secretKey);

try {
    $koraService->handleWebhook(json_encode($pendingPayload), $pendingSig);
    assertTest(false, 'Non-success data status must not mark order paid');
} catch (RuntimeException $e) {
    assertTest(str_contains($e->getMessage(), 'reported non-successful provider status'), 'Pending bank transfer kept pending and rejected from being marked paid', $e->getMessage());
}

// -----------------------------------------------------------------------------
// TEST 10: Out-of-Order Event Handling (`charge.failed` received after confirmed success)
// -----------------------------------------------------------------------------
echo "\n10. Testing Out-of-Order Event Handling (Failure after Confirmed Success)...\n";
$outOfOrderFailedPayload = [
    'event' => 'charge.failed',
    'event_id' => 'evt_ooo_failed_' . bin2hex(random_bytes(3)),
    'data' => [
        'reference' => $providerRef1, // Order 1 is already paid!
        'amount' => $grandTotal1,
        'currency' => 'NGN',
        'status' => 'failed',
        'reason' => 'Duplicate transaction attempt timed out',
    ]
];
$oooSig = signKoraPayload($outOfOrderFailedPayload, $secretKey);
$oooRes = $koraService->handleWebhook(json_encode($outOfOrderFailedPayload), $oooSig);

assertTest($oooRes['status'] === 'ignored_duplicate', 'Out-of-order failure event ignored on already-paid order');

$dbOrder1Check = $db->fetchOne("SELECT order_status FROM orders WHERE id = ?", 'i', [$orderId1]);
assertTest($dbOrder1Check['order_status'] === 'paid', 'Confirmed order status preserved as paid (not overwritten by delayed failure)');

// -----------------------------------------------------------------------------
// TEST 11: Authoritative Backend Transaction Verification (`GET /charges/:reference` Mock)
// -----------------------------------------------------------------------------
echo "\n11. Testing Authoritative Server-Side Query Verification...\n";
// Create order 3
$orderFixture3 = $checkoutService->createOrder([
    'email' => 'query.verify@example.com',
    'items' => [['product_id' => (int) $product['id'], 'variant_id' => (int) $product['variant_id'], 'quantity' => 1]],
    'shipping_address' => ['full_name' => 'Chidi Okon', 'phone' => '+2348033333333', 'address_line1' => '5 Market Road', 'city' => 'Enugu', 'state' => 'Enugu', 'country' => 'Nigeria'],
]);
$orderNumber3 = $orderFixture3['order_number'];
$initRes3 = $koraService->initializeCheckout($orderNumber3);
$providerRef3 = $initRes3['provider_reference'];

// Mock authoritative GET /charges/:reference returning successful payment
$verifyExecutor = function(string $method, string $url, array $headers, ?string $body, int $timeout) use ($providerRef3, $orderFixture3): array {
    return [
        'status_code' => 200,
        'body' => json_encode([
            'status' => true,
            'message' => 'Charge retrieved successfully',
            'data' => [
                'reference' => $providerRef3,
                'status' => 'success',
                'amount' => (float) $orderFixture3['grand_total'],
                'currency' => 'NGN',
                'payment_method' => 'card',
                'paid_at' => date('Y-m-d H:i:s'),
            ]
        ]),
        'error' => null,
    ];
};

$koraQueryService = new KoraService($db, $verifyExecutor);
$verifyResult = $koraQueryService->verifyTransaction($providerRef3);

assertTest($verifyResult['status'] === 'successful', 'Authoritative verification succeeded');
assertTest($verifyResult['order_status'] === 'paid', 'Order status marked as paid via verification');
assertTest($verifyResult['source'] === 'kora_api_verified', 'Verification performed via Kora API');

// -----------------------------------------------------------------------------
// TEST 12: Repeated Verification Request (Idempotent Local Cache / Database Result)
// -----------------------------------------------------------------------------
echo "\n12. Testing Repeated Verification Idempotency...\n";
// Second verification call: since order is already paid, should return local database state without redundant API calls
$repeatedVerify = $koraQueryService->verifyTransaction($providerRef3);
assertTest($repeatedVerify['status'] === 'successful', 'Repeated verify confirms successful status');
assertTest($repeatedVerify['source'] === 'local_database_cached', 'Repeated verification retrieved idempotently from local database');

// -----------------------------------------------------------------------------
// TEST 13: Verification Network Timeout Handling (Preserves Pending Order)
// -----------------------------------------------------------------------------
echo "\n13. Testing Verification Network Timeout Handling...\n";
$timeoutVerifyExecutor = function(string $method, string $url, array $headers, ?string $body, int $timeout): array {
    return [
        'status_code' => 0,
        'body' => '',
        'error' => 'cURL error 28: Connection timed out',
    ];
};

$koraTimeoutService = new KoraService($db, $timeoutVerifyExecutor);
try {
    $koraTimeoutService->verifyTransaction($initRes2['provider_reference']);
    assertTest(false, 'Verification timeout must throw RuntimeException');
} catch (RuntimeException $e) {
    assertTest(str_contains($e->getMessage(), 'timed out'), 'Timeout caught with user-friendly retry message', $e->getMessage());
}

$dbOrder2Check = $db->fetchOne("SELECT order_status FROM orders WHERE id = ?", 'i', [(int) $orderFixture2['order_id']]);
assertTest($dbOrder2Check['order_status'] === 'pending_payment', 'Order preserved in pending_payment state after verification timeout');

// -----------------------------------------------------------------------------
// TEST 14: Browser Closed Before Return (Asynchronous Webhook Finalization)
// -----------------------------------------------------------------------------
echo "\n14. Testing Browser Closed Before Return (Asynchronous Settlement)...\n";
// Even if the customer closes their browser tab without visiting redirect_url,
// the asynchronous webhook must independently and authoritatively mark the order paid
$asyncWebhookPayload = [
    'event' => 'charge.success',
    'event_id' => 'evt_async_browser_closed_' . bin2hex(random_bytes(3)),
    'data' => [
        'reference' => $initRes2['provider_reference'],
        'amount' => (float) $orderFixture2['grand_total'],
        'currency' => 'NGN',
        'status' => 'success',
        'payment_method' => 'bank_transfer',
    ]
];
$asyncSig = signKoraPayload($asyncWebhookPayload, $secretKey);
$asyncRes = $koraService->handleWebhook(json_encode($asyncWebhookPayload), $asyncSig);

assertTest($asyncRes['status'] === 'processed', 'Asynchronous webhook successfully processed');
$dbOrder2Final = $db->fetchOne("SELECT order_status, payment_status FROM orders WHERE id = ?", 'i', [(int) $orderFixture2['order_id']]);
assertTest($dbOrder2Final['order_status'] === 'paid', 'Order successfully finalized as paid without browser visit');
assertTest($dbOrder2Final['payment_status'] === 'successful', 'Payment successfully finalized without browser visit');

// Restore original test variant stock
$db->executeUpdate("UPDATE product_variants SET stock_quantity = ? WHERE id = ?", 'ii', [$initialStock, (int) $product['variant_id']]);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
echo "\n====================================================================\n";
echo "STEP 10 TEST RESULTS: {$passed} PASSED, {$failed} FAILED\n";
echo "====================================================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
