<?php

declare(strict_types=1);

/**
 * STEP 8 HTTP Integration Test: End-to-End API verification over HTTP
 */

$baseUrl = 'http://127.0.0.1:8000/api/v1';

$passed = 0;
$failed = 0;

function assertHttp(bool $condition, string $testName, string $details = ''): void {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  [PASS] {$testName}\n";
    } else {
        $failed++;
        echo "  [FAIL] {$testName} - Details: {$details}\n";
    }
}

function request(string $method, string $path, ?array $body = null, array $headers = []): array {
    global $baseUrl;
    $url = $baseUrl . $path;
    $ch = curl_init($url);

    $defaultHeaders = ['Content-Type: application/json', 'Accept: application/json'];
    $allHeaders = array_merge($defaultHeaders, $headers);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $allHeaders);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $response = curl_exec($ch);
    $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $json = json_decode((string) $response, true) ?: [];
    return ['status' => $statusCode, 'data' => $json];
}

echo "====================================================================\n";
echo "STEP 8 HTTP INTEGRATION TESTS (PORT 8000)\n";
echo "====================================================================\n\n";

// 1. GET /checkout/shipping-zones
echo "1. Testing GET /api/v1/checkout/shipping-zones...\n";
$res = request('GET', '/checkout/shipping-zones');
assertHttp($res['status'] === 200, 'HTTP 200 on shipping zones');
assertHttp(!empty($res['data']['data']['zones']), 'Returns active shipping zones');
assertHttp(!empty($res['data']['data']['origin']['origin_city']), 'Returns store origin info');

// 2. POST /checkout/quote with empty cart -> 422
echo "\n2. Testing POST /api/v1/checkout/quote with empty cart...\n";
$res = request('POST', '/checkout/quote', ['items' => []]);
assertHttp($res['status'] === 422, 'Empty cart rejected with HTTP 422');
assertHttp(($res['data']['error']['code'] ?? '') === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

// 3. POST /checkout/quote with valid items & Enugu address
echo "\n3. Testing POST /api/v1/checkout/quote with valid items & Enugu address...\n";
$res = request('POST', '/checkout/quote', [
    'items' => [
        ['product_id' => 1, 'quantity' => 1]
    ],
    'shipping_address' => [
        'full_name' => 'John Doe',
        'phone' => '+2348000000000',
        'address_line1' => '12 Ogui Road',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'country' => 'Nigeria',
    ],
    'coupon_code' => 'SHOP20',
]);
assertHttp($res['status'] === 200, 'Quote generated with HTTP 200');
assertHttp($res['data']['data']['discount_amount'] > 0, 'SHOP20 20% discount computed');
assertHttp($res['data']['data']['shipping_fee'] === 1500.0, 'Enugu Metro shipping fee is 1500');

// 4. POST /checkout/quote with unserved country -> 422
echo "\n4. Testing POST /api/v1/checkout/quote with unserved location...\n";
$res = request('POST', '/checkout/quote', [
    'items' => [
        ['product_id' => 1, 'quantity' => 1]
    ],
    'shipping_address' => [
        'country' => 'Germany',
        'state' => 'Berlin',
    ],
]);
assertHttp($res['status'] === 422, 'Unserved country rejected with 422');

// 5. POST /checkout/orders (Guest order creation)
echo "\n5. Testing POST /api/v1/checkout/orders (Guest order creation)...\n";
$res = request('POST', '/checkout/orders', [
    'email' => 'http.test.guest@example.com',
    'items' => [
        ['product_id' => 1, 'quantity' => 1]
    ],
    'shipping_address' => [
        'full_name' => 'Chioma Nnamdi',
        'phone' => '+234 812 345 6789',
        'address_line1' => '5 Independence Avenue',
        'city' => 'Enugu',
        'state' => 'Enugu',
        'country' => 'Nigeria',
    ],
    'coupon_code' => 'PANTO10',
    'notes' => 'Ring doorbell on delivery',
]);

assertHttp($res['status'] === 201, 'Order created with HTTP 201');
$orderData = $res['data']['data'] ?? [];
$orderNumber = $orderData['order_number'] ?? '';
$guestToken = $orderData['guest_access_token'] ?? '';
assertHttp(!empty($orderNumber), "Order number issued: {$orderNumber}");
assertHttp(!empty($guestToken), 'Guest access token issued');

// 6. GET /checkout/orders/{orderNumber} with guest token
echo "\n6. Testing GET /api/v1/checkout/orders/{orderNumber} with guest access token...\n";
$res = request('GET', "/checkout/orders/{$orderNumber}?token={$guestToken}");
assertHttp($res['status'] === 200, 'Order retrieved with valid guest token');
assertHttp($res['data']['data']['order_number'] === $orderNumber, 'Order number matches');
assertHttp(empty($res['data']['data']['guest_access_token_hash']), 'Guest token hash is redacted from public output');

// 7. GET /checkout/orders/{orderNumber} with INVALID token -> 403
echo "\n7. Testing GET /api/v1/checkout/orders/{orderNumber} with unauthorized token...\n";
$res = request('GET', "/checkout/orders/{$orderNumber}?token=invalid_forged_token");
assertHttp($res['status'] === 403, 'Unauthorized access rejected with HTTP 403');

echo "\n====================================================================\n";
echo "STEP 8 HTTP RESULTS: {$passed} PASSED, {$failed} FAILED\n";
echo "====================================================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
