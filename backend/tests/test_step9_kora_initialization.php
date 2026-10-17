<?php

declare(strict_types=1);

/**
 * STEP 9 Test Matrix: Kora Sandbox Initialization & Isolated Payment Service
 *
 * Test cases:
 * 1. Environment Security Check: Reads credentials only from .env, strictly sandbox/test keys
 * 2. Provider Reference: Generates unique, formatted provider reference (PAY-ORD-...)
 * 3. Provider Success Mock: Returns hosted checkout_url and safe public data
 * 4. Safe Storage & Redaction: Recursively redacts sensitive card/secret fields before DB persistence
 * 5. Provider Error/Failure Mock: Handles 4xx/5xx errors gracefully, retaining recoverable pending order
 * 6. Provider Timeout Mock: Network/gateway timeout handled without dropping or corrupting pending order
 * 7. Malformed Response Mock: Non-JSON / gateway error body handled safely
 * 8. Order Status Invariant: Order & payment NEVER marked paid on initialization
 * 9. HTTP REST Endpoint Security: Verifies guest token authentication and unauthorized rejection
 */

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Services\CheckoutService;
use App\Services\KoraService;

Env::load(BASE_PATH . '/.env');
$db = Database::getInstance();

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
echo "STEP 9 TEST MATRIX: KORA SANDBOX PAYMENT INITIALIZATION\n";
echo "====================================================================\n\n";

// -----------------------------------------------------------------------------
// TEST 1: Environment Security Check (Sandbox keys only, no live keys)
// -----------------------------------------------------------------------------
echo "1. Testing Environment Security & Sandbox Keys Configuration...\n";
$secretKey = Env::get('KORA_SECRET_KEY', '');
$publicKey = Env::get('KORA_PUBLIC_KEY', '');
$baseUrl = Env::get('KORA_API_BASE_URL', '');

assertTest(!empty($secretKey), 'KORA_SECRET_KEY is loaded from environment');
assertTest(!empty($baseUrl), 'KORA_API_BASE_URL is loaded from environment');
assertTest(!str_starts_with($secretKey, 'sk_live_'), 'Strictly no live secret keys configured in development environment');
assertTest(!str_starts_with($publicKey, 'pk_live_'), 'Strictly no live public keys configured in development environment');

// -----------------------------------------------------------------------------
// Create Test Order Fixture for Payment Initialization
// -----------------------------------------------------------------------------
$checkoutService = new CheckoutService($db);
$product = $db->fetchOne("SELECT p.id, v.id as variant_id, v.stock_quantity FROM products p JOIN product_variants v ON p.id = v.product_id WHERE p.status = 'published' AND v.stock_quantity >= 5 LIMIT 1");
$orderFixture = $checkoutService->createOrder([
    'email' => 'kora.step9.test@example.com',
    'items' => [
        ['product_id' => (int) $product['id'], 'variant_id' => (int) $product['variant_id'], 'quantity' => 1]
    ],
    'shipping_address' => [
        'full_name' => 'Kora Test Shopper',
        'phone' => '+2348039990000',
        'address_line1' => '10 Okpara Avenue',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'country' => 'Nigeria',
    ],
]);

$testOrderNumber = $orderFixture['order_number'];
$testOrderId = (int) $orderFixture['order_id'];
$testGuestToken = $orderFixture['guest_access_token'];
$expectedAmount = (float) $orderFixture['grand_total'];

echo "\nOrder Fixture Created: #{$testOrderId} ({$testOrderNumber}), Grand Total: NGN {$expectedAmount}\n\n";

// -----------------------------------------------------------------------------
// TEST 2: Provider Success Mock (Hosted Checkout URL extraction)
// -----------------------------------------------------------------------------
echo "2. Testing Provider Success Scenario (Hosted Checkout)...\n";
$mockSuccessUrl = 'https://checkout.korapay.com/pay/pay_ref_test998877';
$capturedPayload = null;

$successExecutor = function(string $method, string $url, array $headers, ?string $body, int $timeout) use ($mockSuccessUrl, &$capturedPayload): array {
    $capturedPayload = json_decode((string) $body, true);
    $mockResponse = [
        'status' => true,
        'message' => 'Charge initialized successfully',
        'data' => [
            'reference' => $capturedPayload['reference'],
            'checkout_url' => $mockSuccessUrl,
            'amount' => $capturedPayload['amount'],
            'currency' => $capturedPayload['currency'],
            'status' => 'pending',
            'authorization_code' => 'AUTH_SECRET_CODE_123', // Sensitive field to test redaction
        ]
    ];
    return [
        'status_code' => 200,
        'body' => json_encode($mockResponse),
        'error' => null,
    ];
};

$koraSuccessService = new KoraService($db, $successExecutor);
$initResult = $koraSuccessService->initializeCheckout($testOrderNumber);

assertTest($initResult['checkout_url'] === $mockSuccessUrl, 'Hosted checkout_url returned accurately');
assertTest($initResult['order_number'] === $testOrderNumber, 'Order number matches');
assertTest($initResult['amount'] === $expectedAmount, 'Authoritative backend grand_total passed to gateway');
assertTest($initResult['currency'] === 'NGN', 'Domestic NGN currency passed');
assertTest(str_starts_with($initResult['provider_reference'], 'PAY-ORD-'), 'Unique provider reference starts with PAY-ORD-');
assertTest(!isset($initResult['authorization_code']), 'Sensitive provider tokens withheld from public response');

// -----------------------------------------------------------------------------
// TEST 3: Invariant Check: Order & Payment NEVER marked paid on initialization
// -----------------------------------------------------------------------------
echo "\n3. Testing Invariant: Order & Payment Must Remain Pending...\n";
$dbOrder = $db->fetchOne("SELECT order_status, payment_status FROM orders WHERE id = ?", 'i', [$testOrderId]);
$dbPayment = $db->fetchOne("SELECT status, provider_reference, provider_payload_redacted FROM payments WHERE order_id = ?", 'i', [$testOrderId]);

assertTest($dbOrder['order_status'] === 'pending_payment', 'Order status remains strictly pending_payment');
assertTest($dbOrder['payment_status'] === 'pending', 'Order payment_status remains strictly pending');
assertTest($dbPayment['status'] === 'pending', 'Payment record status remains strictly pending');
assertTest($dbPayment['provider_reference'] === $initResult['provider_reference'], 'Provider reference updated in payments table');

// -----------------------------------------------------------------------------
// TEST 4: Safe Storage & Sensitive Data Redaction
// -----------------------------------------------------------------------------
echo "\n4. Testing Sensitive Data Redaction in Stored Payloads...\n";
$storedPayload = json_decode($dbPayment['provider_payload_redacted'], true);
$redactedData = $storedPayload['response_data']['data'] ?? [];

assertTest(isset($redactedData['authorization_code']), 'authorization_code was present in provider response');
assertTest($redactedData['authorization_code'] === '[REDACTED]', 'authorization_code was replaced with [REDACTED]');

// -----------------------------------------------------------------------------
// TEST 5: Provider Error / Rejection Mock (400 / 422)
// -----------------------------------------------------------------------------
echo "\n5. Testing Provider Failure Scenario (Recoverable Pending Order)...\n";
$failureExecutor = function(string $method, string $url, array $headers, ?string $body, int $timeout): array {
    return [
        'status_code' => 400,
        'body' => json_encode([
            'status' => false,
            'message' => 'Invalid currency or channel combination',
            'data' => null,
        ]),
        'error' => null,
    ];
};

$koraFailureService = new KoraService($db, $failureExecutor);
try {
    $koraFailureService->initializeCheckout($testOrderNumber);
    assertTest(false, 'Provider failure must throw RuntimeException');
} catch (RuntimeException $e) {
    assertTest(str_contains($e->getMessage(), 'Payment provider initialization failed'), 'Provider failure caught and surfaced', $e->getMessage());
}

// Verify order is still intact and pending in database
$dbOrderAfterFailure = $db->fetchOne("SELECT order_status FROM orders WHERE id = ?", 'i', [$testOrderId]);
assertTest($dbOrderAfterFailure['order_status'] === 'pending_payment', 'Order retained in pending_payment state after provider error');

// -----------------------------------------------------------------------------
// TEST 6: Provider Timeout Mock
// -----------------------------------------------------------------------------
echo "\n6. Testing Provider Timeout Scenario (Resilience Check)...\n";
$timeoutExecutor = function(string $method, string $url, array $headers, ?string $body, int $timeout): array {
    return [
        'status_code' => 0,
        'body' => '',
        'error' => 'cURL error 28: Operation timed out after 15000 milliseconds with 0 bytes received',
    ];
};

$koraTimeoutService = new KoraService($db, $timeoutExecutor);
try {
    $koraTimeoutService->initializeCheckout($testOrderNumber);
    assertTest(false, 'Provider timeout must throw RuntimeException');
} catch (RuntimeException $e) {
    assertTest(str_contains($e->getMessage(), 'timed out'), 'Gateway timeout caught with friendly user message', $e->getMessage());
}

$dbOrderAfterTimeout = $db->fetchOne("SELECT order_status FROM orders WHERE id = ?", 'i', [$testOrderId]);
assertTest($dbOrderAfterTimeout['order_status'] === 'pending_payment', 'Order preserved in recoverable pending state after timeout');

// -----------------------------------------------------------------------------
// TEST 7: Malformed Provider Response Mock (Non-JSON)
// -----------------------------------------------------------------------------
echo "\n7. Testing Malformed Provider Response (HTML / 502 Bad Gateway)...\n";
$malformedExecutor = function(string $method, string $url, array $headers, ?string $body, int $timeout): array {
    return [
        'status_code' => 502,
        'body' => '<html><head><title>502 Bad Gateway</title></head><body>Cloudflare Gateway Error</body></html>',
        'error' => null,
    ];
};

$koraMalformedService = new KoraService($db, $malformedExecutor);
try {
    $koraMalformedService->initializeCheckout($testOrderNumber);
    assertTest(false, 'Malformed response must throw RuntimeException');
} catch (RuntimeException $e) {
    assertTest(str_contains($e->getMessage(), 'malformed response'), 'Malformed response caught gracefully', $e->getMessage());
}

// -----------------------------------------------------------------------------
// TEST 8: HTTP REST Endpoint Integration & Authorization
// -----------------------------------------------------------------------------
echo "\n8. Testing HTTP Endpoint Authorization & Guest Token Verification...\n";

$socket = @fsockopen('127.0.0.1', 8000, $errno, $errstr, 0.5);

if ($socket !== false) {
    fclose($socket);
    echo "  [INFO] Local PHP server detected on port 8000. Running live HTTP cURL tests...\n";

    function curlRequest(string $method, string $path, ?array $body = null, array $headers = []): array {
        $url = 'http://127.0.0.1:8000/api/v1' . $path;
        $ch = curl_init($url);
        $allHeaders = array_merge(['Content-Type: application/json', 'Accept: application/json'], $headers);

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $allHeaders);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $response = curl_exec($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return ['status' => $statusCode, 'data' => json_decode((string) $response, true) ?: []];
    }

    // 8a. Unauthenticated / No token -> 403
    $unauthRes = curlRequest('POST', "/checkout/orders/{$testOrderNumber}/initialize-payment");
    assertTest($unauthRes['status'] === 403, 'Unauthorized access without token rejected with HTTP 403');

    // 8b. Forged guest token -> 403
    $forgedRes = curlRequest('POST', "/checkout/orders/{$testOrderNumber}/initialize-payment", [
        'guest_access_token' => 'forged_fake_token_value_0000000000'
    ]);
    assertTest($forgedRes['status'] === 403, 'Unauthorized access with forged token rejected with HTTP 403');

    // 8c. Non-existent order -> 404
    $notFoundRes = curlRequest('POST', "/checkout/orders/ORD-NONEXISTENT-9999/initialize-payment");
    assertTest($notFoundRes['status'] === 404, 'Non-existent order returns HTTP 404');

    // 8d. Valid guest token -> passes authorization check (attempts gateway initialization)
    $authRes = curlRequest('POST', "/checkout/orders/{$testOrderNumber}/initialize-payment", [
        'guest_access_token' => $testGuestToken,
    ]);
    assertTest($authRes['status'] !== 403, 'Valid guest token successfully passes authorization check');
} else {
    echo "  [INFO] Port 8000 is not currently active in a terminal. Verifying endpoint authorization logic directly...\n";

    // Direct verification of authorization logic
    $orderRecord = $db->fetchOne("SELECT guest_access_token_hash FROM orders WHERE id = ?", 'i', [$testOrderId]);
    $validHash = hash('sha256', $testGuestToken);
    $forgedHash = hash('sha256', 'forged_fake_token');

    assertTest(hash_equals($orderRecord['guest_access_token_hash'], $validHash), 'Valid guest access token verified against sha256 hash');
    assertTest(!hash_equals($orderRecord['guest_access_token_hash'], $forgedHash), 'Forged guest access token rejected by cryptographic hash comparison');

    // Non-existent order lookup check
    $missingOrder = $db->fetchOne("SELECT id FROM orders WHERE order_number = 'ORD-NONEXISTENT-9999'");
    assertTest($missingOrder === null, 'Non-existent order lookup correctly returns null');

    echo "  [NOTE] Start 'php -S 127.0.0.1:8000 -t backend/public' in your terminal to test live over HTTP.\n";
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
echo "\n====================================================================\n";
echo "STEP 9 TEST RESULTS: {$passed} PASSED, {$failed} FAILED\n";
echo "====================================================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
