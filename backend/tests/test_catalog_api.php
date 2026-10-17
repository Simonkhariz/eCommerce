<?php

declare(strict_types=1);

/**
 * Automated Test Suite for Catalogue API & Admin CRUD
 */

function runRequest(string $method, string $uri, ?array $body = null, array $headers = []): array
{
    $_SERVER['REQUEST_METHOD'] = $method;
    $_SERVER['REQUEST_URI'] = $uri;

    // Reset headers
    unset($_SERVER['HTTP_CONTENT_TYPE'], $_SERVER['CONTENT_TYPE'], $_SERVER['HTTP_AUTHORIZATION'], $_SERVER['HTTP_X_DEV_ADMIN_TOKEN']);

    foreach ($headers as $k => $v) {
        $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $k));
        if (strtolower($k) === 'content-type') {
            $_SERVER['CONTENT_TYPE'] = $v;
            $_SERVER['HTTP_CONTENT_TYPE'] = $v;
        } else {
            $_SERVER[$serverKey] = $v;
        }
    }

    // Write body to php://input simulation stream
    if ($body !== null) {
        $_SERVER['CONTENT_TYPE'] = 'application/json';
        $_SERVER['HTTP_CONTENT_TYPE'] = 'application/json';
        $jsonBody = json_encode($body);
        $stream = fopen('php://temp', 'w+');
        fwrite($stream, $jsonBody);
        rewind($stream);
        // Note: php://input cannot be reassigned directly in CLI easily, so we set via temporary override or mock
    }

    ob_start();
    try {
        require __DIR__ . '/../public/index.php';
    } catch (\Throwable $e) {
        // Exit is called in Response::json
    }
    $raw = ob_get_clean();
    $decoded = json_decode($raw, true);

    return [
        'status' => http_response_code(),
        'body' => $decoded,
        'raw' => $raw,
    ];
}

echo "========================================================\n";
echo " Catalogue REST API Test Suite\n";
echo "========================================================\n\n";

$passed = 0;
$failed = 0;

$assertTest = function (bool $condition, string $title) use (&$passed, &$failed): void {
    if ($condition) {
        echo "  [PASS] {$title}\n";
        $passed++;
    } else {
        echo "  [FAIL] {$title}\n";
        $failed++;
    }
};

// TEST 1: GET /api/v1/products
$res1 = runRequest('GET', '/api/v1/products');
$assertTest($res1['body']['success'] === true, 'GET /api/v1/products returns success=true');
$assertTest(isset($res1['body']['meta']['total']) && $res1['body']['meta']['total'] >= 4, 'Catalogue returns at least 4 seeded products');
$assertTest(!empty($res1['body']['data'][0]['currency']) && $res1['body']['data'][0]['currency'] === 'NGN', 'Products are priced in NGN currency');

// TEST 2: Category Filter GET /api/v1/products?category=t-shirts
$res2 = runRequest('GET', '/api/v1/products?category=t-shirts');
$assertTest($res2['body']['success'] === true, 'GET /api/v1/products?category=t-shirts returns success=true');
$assertTest(count($res2['body']['data']) >= 1, 'Returns t-shirts category products');

// TEST 3: Product Detail by Slug GET /api/v1/products/gradient-graphic-tshirt
$res3 = runRequest('GET', '/api/v1/products/gradient-graphic-tshirt');
$assertTest($res3['body']['success'] === true, 'GET /api/v1/products/gradient-graphic-tshirt returns success=true');
$assertTest(!empty($res3['body']['data']['images']), 'Product detail includes images list');
$assertTest(!empty($res3['body']['data']['variants']), 'Product detail includes variants list');
$assertTest(!empty($res3['body']['data']['available_colors']), 'Product detail includes color swatches');
$assertTest(!empty($res3['body']['data']['available_sizes']), 'Product detail includes size pills');

// TEST 4: Physical Product Detail Type Verification
$res4 = runRequest('GET', '/api/v1/products/shopco-digital-lookbook-2026');
$assertTest($res4['body']['success'] === true, 'GET /api/v1/products/shopco-digital-lookbook-2026 returns success=true');
$assertTest($res4['body']['data']['product_type'] === 'physical', 'Product type is physical');

// TEST 5: GET /api/v1/categories
$res5 = runRequest('GET', '/api/v1/categories');
$assertTest($res5['body']['success'] === true, 'GET /api/v1/categories returns success=true');
$assertTest(count($res5['body']['data']) >= 6, 'Returns 6 active categories');
$assertTest(isset($res5['body']['data'][0]['product_count']), 'Categories include product_count');

// TEST 6: GET /api/v1/storefront/homepage
$res6 = runRequest('GET', '/api/v1/storefront/homepage');
$assertTest($res6['body']['success'] === true, 'GET /api/v1/storefront/homepage returns success=true');
$assertTest(isset($res6['body']['data']['featured_products']), 'Homepage includes featured_products');
$assertTest(isset($res6['body']['data']['flash_deals']), 'Homepage includes flash_deals');
$assertTest(isset($res6['body']['data']['new_arrivals']), 'Homepage includes new_arrivals');
$assertTest(isset($res6['body']['data']['promotions']), 'Homepage includes active promotions');

// TEST 7: Admin Unauthorized Rejection POST /api/v1/admin/products without token
$res7 = runRequest('POST', '/api/v1/admin/products');
$assertTest($res7['body']['success'] === false && $res7['body']['error']['code'] === 'UNAUTHENTICATED', 'Admin endpoint rejects request without auth token (401 UNAUTHENTICATED)');

// TEST 8: Non-existent product 404
$res8 = runRequest('GET', '/api/v1/products/non-existent-product-slug-xyz');
$assertTest($res8['body']['success'] === false && $res8['body']['error']['code'] === 'RESOURCE_NOT_FOUND', '404 RESOURCE_NOT_FOUND for non-existent product');

echo "\n========================================================\n";
echo " Results: {$passed} Passed, {$failed} Failed\n";
echo "========================================================\n";

exit($failed > 0 ? 1 : 0);
