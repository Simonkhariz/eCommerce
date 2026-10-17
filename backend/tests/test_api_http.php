<?php

declare(strict_types=1);

/**
 * End-to-End HTTP Test Runner against the running PHP API Server (http://localhost:8000)
 */

$baseUrl = 'http://127.0.0.1:8000/api/v1';
$devToken = 'dev_admin_secret_token_12345';

function httpCall(string $method, string $url, ?array $body = null, array $headers = []): array
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

    $headerLines = ['Accept: application/json'];
    if ($body !== null) {
        $json = json_encode($body);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        $headerLines[] = 'Content-Type: application/json';
    }

    foreach ($headers as $k => $v) {
        $headerLines[] = "{$k}: {$v}";
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headerLines);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);

    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        return ['status' => 0, 'error' => $error, 'body' => null];
    }

    return [
        'status' => $status,
        'body' => json_decode($raw, true),
        'raw' => $raw,
    ];
}

echo "========================================================\n";
echo " End-to-End HTTP API Test Suite (Target: {$baseUrl})\n";
echo "========================================================\n\n";

$passed = 0;
$failed = 0;

$assert = function (bool $cond, string $name) use (&$passed, &$failed): void {
    if ($cond) {
        echo "  [PASS] {$name}\n";
        $passed++;
    } else {
        echo "  [FAIL] {$name}\n";
        $failed++;
    }
};

// 1. Health Check
$r1 = httpCall('GET', "{$baseUrl}/health");
$assert($r1['status'] === 200, "GET /health status is 200");
$assert($r1['body']['data']['database']['connected'] === true, "Health reports database connected");

// 2. Products List
$r2 = httpCall('GET', "{$baseUrl}/products");
$assert($r2['status'] === 200, "GET /products status is 200");
$assert($r2['body']['meta']['total'] >= 4, "Total products count >= 4");
$assert($r2['body']['data'][0]['currency'] === 'NGN', "Prices formatted in NGN");

// 3. Category Filter
$r3 = httpCall('GET', "{$baseUrl}/products?category=t-shirts");
$assert($r3['status'] === 200, "GET /products?category=t-shirts status is 200");
$assert(count($r3['body']['data']) >= 1, "Category filter returns t-shirts");

// 4. Product Detail (Physical)
$r4 = httpCall('GET', "{$baseUrl}/products/gradient-graphic-tshirt");
$assert($r4['status'] === 200, "GET /products/gradient-graphic-tshirt status is 200");
$assert(!empty($r4['body']['data']['images']), "Product detail contains images array");
$assert(!empty($r4['body']['data']['variants']), "Product detail contains variants array");
$assert(!empty($r4['body']['data']['available_colors']), "Product detail contains available_colors");

// 5. Product Detail (Physical product check)
$r5 = httpCall('GET', "{$baseUrl}/products/shopco-digital-lookbook-2026");
$assert($r5['status'] === 200, "GET /products/shopco-digital-lookbook-2026 status is 200");
$assert($r5['body']['data']['product_type'] === 'physical', "Product is physical only");

// 6. Categories List
$r6 = httpCall('GET', "{$baseUrl}/categories");
$assert($r6['status'] === 200, "GET /categories status is 200");
$assert(count($r6['body']['data']) >= 6, "Categories list count >= 6");

// 7. Storefront Homepage Aggregation
$r7 = httpCall('GET', "{$baseUrl}/storefront/homepage");
$assert($r7['status'] === 200, "GET /storefront/homepage status is 200");
$assert(isset($r7['body']['data']['featured_products']), "Homepage has featured_products");
$assert(isset($r7['body']['data']['promotions']), "Homepage has promotions");

// 8. Admin Guard Check (No token -> 401)
$r8 = httpCall('POST', "{$baseUrl}/admin/products", ['name' => 'Unauthorized Tee']);
$assert($r8['status'] === 401, "POST /admin/products without token returns 401 Unauthorized");

// 9. Admin Product Creation (With X-Dev-Admin-Token -> 201)
$newProductPayload = [
    'name' => 'Automated Test Jacket',
    'slug' => 'automated-test-jacket-' . time(),
    'category_id' => 1,
    'description' => 'Created via end-to-end automated test.',
    'product_type' => 'physical',
    'status' => 'published',
    'base_price' => 38500.00,
    'original_price' => 45000.00,
    'currency' => 'NGN',
    'sku' => 'SKU-TEST-JACKET-' . time(),
    'dress_style' => 'Casual',
    'variants' => [
        [
            'sku' => 'SKU-TEST-JKT-M-' . time(),
            'size' => 'Medium',
            'color_name' => 'Midnight Black',
            'color_hex' => '#000000',
            'stock_quantity' => 15,
        ],
    ],
    'images' => [
        [
            'image_url' => 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=600&q=80',
            'alt_text' => 'Test Jacket Front',
            'is_primary' => 1,
        ],
    ],
];
$r9 = httpCall('POST', "{$baseUrl}/admin/products", $newProductPayload, ['X-Dev-Admin-Token' => $devToken]);
$assert($r9['status'] === 201, "POST /admin/products with token returns 201 Created");
$createdId = $r9['body']['data']['id'] ?? null;
$assert($createdId !== null && $createdId > 0, "Created product returned valid integer ID: {$createdId}");

// 10. Admin Product Update (PUT -> 200)
if ($createdId) {
    $updatePayload = [
        'name' => 'Automated Test Jacket (Updated)',
        'base_price' => 35000.00,
    ];
    $r10 = httpCall('PUT', "{$baseUrl}/admin/products/{$createdId}", $updatePayload, ['X-Dev-Admin-Token' => $devToken]);
    $assert($r10['status'] === 200, "PUT /admin/products/{$createdId} returns 200 OK");
    $assert($r10['body']['data']['base_price'] === 35000.0, "Updated price is reflected");

    // 11. Admin Product Delete/Archive (DELETE -> 200)
    $r11 = httpCall('DELETE', "{$baseUrl}/admin/products/{$createdId}", null, ['X-Dev-Admin-Token' => $devToken]);
    $assert($r11['status'] === 200, "DELETE /admin/products/{$createdId} returns 200 OK");
    $assert($r11['body']['data']['status'] === 'archived', "Product status updated to archived");
}

echo "\n========================================================\n";
echo " Results: {$passed} Passed, {$failed} Failed\n";
echo "========================================================\n";

exit($failed > 0 ? 1 : 0);
