<?php

declare(strict_types=1);

/**
 * Step 7 HTTP Test Suite
 * Tests admin authentication, validation, product list, inventory adjustment, and status toggles over HTTP.
 */

$baseUrl = 'http://127.0.0.1:8000/api/v1';
$devToken = 'dev_admin_secret_token_12345';

echo "=== STEP 7: HTTP REST API TEST SUITE ===\n\n";

$passed = 0;
$failed = 0;

function assertHttp(bool $cond, string $msg, &$passed, &$failed): void {
    if ($cond) {
        echo "  [PASS] {$msg}\n";
        $passed++;
    } else {
        echo "  [FAIL] {$msg}\n";
        $failed++;
    }
}

function httpReq(string $method, string $url, ?array $body = null, array $headers = []): array {
    $ch = curl_init($url);
    $allHeaders = ['Accept: application/json'];
    foreach ($headers as $h) {
        $allHeaders[] = $h;
    }

    if ($body !== null) {
        $json = json_encode($body);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        $allHeaders[] = 'Content-Type: application/json';
    }

    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $allHeaders);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);

    $raw = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $decoded = json_decode((string)$raw, true);
    return ['code' => $httpCode, 'body' => $decoded, 'raw' => $raw];
}

// 1. Unauthenticated Request
echo "1. Testing Unauthorized Access...\n";
$unauth = httpReq('GET', "{$baseUrl}/admin/products");
assertHttp($unauth['code'] === 401, "GET /admin/products without token returns 401 Unauthorized", $passed, $failed);

// 2. Authenticated Admin Products Listing
echo "\n2. Testing Authorized GET /admin/products...\n";
$authList = httpReq('GET', "{$baseUrl}/admin/products?per_page=5", null, ["X-Dev-Admin-Token: {$devToken}"]);
assertHttp($authList['code'] === 200, "GET /admin/products returns 200 OK", $passed, $failed);
assertHttp(isset($authList['body']['data']) && is_array($authList['body']['data']), "Response contains products data array", $passed, $failed);
assertHttp(isset($authList['body']['meta']['total']) && $authList['body']['meta']['total'] > 0, "Response contains pagination meta", $passed, $failed);

// 3. Validation failure on invalid product creation
echo "\n3. Testing Product Creation Validation...\n";
$valFail = httpReq('POST', "{$baseUrl}/admin/products", ['name' => 'A'], ["X-Dev-Admin-Token: {$devToken}"]);
assertHttp($valFail['code'] === 422, "POST /admin/products with invalid data returns 422 Unprocessable Entity", $passed, $failed);
assertHttp(isset($valFail['body']['error']['details']['name']), "Returns field-level validation errors", $passed, $failed);

// 4. Test Create, Inventory Adjust, and Status Toggle over HTTP
echo "\n4. Testing Full HTTP Lifecycle...\n";
$testSku = 'HTTP-STEP7-' . time();
$newProd = [
    'name' => 'Step 7 HTTP Test Hoodie',
    'slug' => 'http-step7-hoodie-' . time(),
    'base_price' => 28000,
    'sku' => $testSku,
    'product_type' => 'physical',
    'status' => 'draft',
    'variants' => [
        [
            'sku' => $testSku . '-M',
            'size' => 'Medium',
            'color_name' => 'Black',
            'color_hex' => '#000000',
            'stock_quantity' => 20,
            'low_stock_threshold' => 5,
        ],
    ],
    'images' => [
        ['image_url' => '/images/products/test-http.jpg', 'is_primary' => 1, 'display_order' => 0],
    ],
];

$createRes = httpReq('POST', "{$baseUrl}/admin/products", $newProd, ["X-Dev-Admin-Token: {$devToken}"]);
assertHttp($createRes['code'] === 201, "POST /admin/products returns 201 Created", $passed, $failed);
$createdId = $createRes['body']['data']['id'] ?? 0;
$variantId = $createRes['body']['data']['variants'][0]['id'] ?? 0;
assertHttp($createdId > 0 && $variantId > 0, "Obtained created product and variant IDs", $passed, $failed);

// Adjust inventory via HTTP
$adjustRes = httpReq('POST', "{$baseUrl}/admin/inventory/adjust", [
    'variant_id' => $variantId,
    'adjustment' => 10,
    'reason' => 'restock',
    'notes' => 'HTTP test PO-9090',
], ["X-Dev-Admin-Token: {$devToken}"]);
assertHttp($adjustRes['code'] === 200, "POST /admin/inventory/adjust returns 200 OK", $passed, $failed);
assertHttp(($adjustRes['body']['data']['new_stock'] ?? 0) === 30, "Variant stock successfully updated to 30", $passed, $failed);

// Quick status change via PATCH
$statusRes = httpReq('PATCH', "{$baseUrl}/admin/products/{$createdId}/status", [
    'status' => 'published',
], ["X-Dev-Admin-Token: {$devToken}"]);
assertHttp($statusRes['code'] === 200, "PATCH /admin/products/{id}/status returns 200 OK", $passed, $failed);
assertHttp(($statusRes['body']['data']['status'] ?? '') === 'published', "Status changed to published", $passed, $failed);

// Archive product via DELETE
$deleteRes = httpReq('DELETE', "{$baseUrl}/admin/products/{$createdId}", null, ["X-Dev-Admin-Token: {$devToken}"]);
assertHttp($deleteRes['code'] === 200, "DELETE /admin/products/{id} returns 200 OK", $passed, $failed);

echo "\n============================================\n";
echo "HTTP SUMMARY: Passed: {$passed}, Failed: {$failed}\n";
echo "============================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
