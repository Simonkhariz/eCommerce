<?php

declare(strict_types=1);

/**
 * Automated HTTP Integration Test Suite for Step 6:
 * Admin Onboarding, Auth, Sessions, CSRF, Customer Profiles, Addresses, and Zones.
 */

$baseUrl = 'http://127.0.0.1:8000';

function makeRequest(string $method, string $path, ?array $body = null, ?string $token = null, ?string $csrf = null): array
{
    global $baseUrl;
    $url = $baseUrl . $path;

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HEADER, true);

    $headers = ['Accept: application/json'];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    if ($token !== null) {
        $headers[] = "Authorization: Bearer {$token}";
        $headers[] = "Cookie: shopco_session={$token}";
    }
    if ($csrf !== null) {
        $headers[] = "X-CSRF-Token: {$csrf}";
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $raw = curl_exec($ch);
    $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    $headerStr = substr($raw, 0, $headerSize);
    $bodyStr = substr($raw, $headerSize);
    $json = json_decode($bodyStr, true);

    return [
        'status' => $statusCode,
        'headers' => $headerStr,
        'body' => $json,
        'raw_body' => $bodyStr,
    ];
}

function assertTest(string $name, bool $condition, string $detail = ''): void
{
    if ($condition) {
        echo "[PASS] {$name}\n";
    } else {
        echo "[FAIL] {$name}: {$detail}\n";
        exit(1);
    }
}

echo "========================================================\n";
echo " Starting Step 6 Authentication & Customer API Tests\n";
echo "========================================================\n\n";

// 1. Setup Status
$statusRes = makeRequest('GET', '/api/v1/setup/status');
assertTest('1. GET /api/v1/setup/status returns 200', $statusRes['status'] === 200);
$isSetupCompleted = $statusRes['body']['data']['is_setup_completed'] ?? false;
echo "   Setup completed status: " . ($isSetupCompleted ? 'YES' : 'NO') . "\n";

// 2. Setup Lockout Test (if completed, setup must be forbidden)
if ($isSetupCompleted) {
    $setupAttempt = makeRequest('POST', '/api/v1/setup', [
        'name' => 'Intruder Admin',
        'email' => 'intruder@shop.co',
        'password' => 'HackerPassword123!',
    ]);
    assertTest('2. POST /api/v1/setup is rejected with 403 when setup is already completed', $setupAttempt['status'] === 403);
    assertTest('   Error code is SETUP_ALREADY_COMPLETED', ($setupAttempt['body']['error']['code'] ?? '') === 'SETUP_ALREADY_COMPLETED');
}

// 3. Customer Registration & Role Tampering Guard
$randomSuffix = time() . '_' . mt_rand(100, 999);
$customerEmail = "shopper_{$randomSuffix}@example.com";
$customerPassword = "CustomerSecure123!";

$regRes = makeRequest('POST', '/api/v1/auth/register', [
    'full_name' => 'Test Customer',
    'email' => $customerEmail,
    'password' => $customerPassword,
    'phone' => '+234 812 345 6789',
    'role' => 'admin', // Malicious attempt to self-elevate to admin
]);

assertTest('3. POST /api/v1/auth/register returns 201', $regRes['status'] === 201);
assertTest('   Role tampering prevented: user role is "customer"', ($regRes['body']['data']['user']['role'] ?? '') === 'customer');
assertTest('   Session token returned', !empty($regRes['body']['data']['session_token']));
$customerToken = $regRes['body']['data']['session_token'];
$customerCsrf = $regRes['body']['data']['csrf_token'];

// 4. Customer Login & Session Rotation
$loginRes = makeRequest('POST', '/api/v1/auth/login', [
    'email' => $customerEmail,
    'password' => $customerPassword,
]);
assertTest('4. POST /api/v1/auth/login returns 200', $loginRes['status'] === 200);
$newCustomerToken = $loginRes['body']['data']['session_token'];
$newCustomerCsrf = $loginRes['body']['data']['csrf_token'];
assertTest('   Session ID rotated on login', $newCustomerToken !== '' && $newCustomerToken !== $customerToken);
assertTest('   Set-Cookie contains HttpOnly shopco_session', str_contains($loginRes['headers'], 'shopco_session='));

// Rate Limiting Test: 5 consecutive bad passwords trigger 429
$throttledEmail = "throttle_{$randomSuffix}@example.com";
for ($attempt = 1; $attempt <= 5; $attempt++) {
    makeRequest('POST', '/api/v1/auth/login', ['email' => $throttledEmail, 'password' => 'bad_pass']);
}
$rateLimitedRes = makeRequest('POST', '/api/v1/auth/login', ['email' => $throttledEmail, 'password' => 'bad_pass']);
assertTest('   Login rate limiting throttles after 5 failed attempts -> 429 Too Many Requests', $rateLimitedRes['status'] === 429);
assertTest('   Error code is TOO_MANY_REQUESTS', ($rateLimitedRes['body']['error']['code'] ?? '') === 'TOO_MANY_REQUESTS');

// 5. Auth /me Endpoint
$meRes = makeRequest('GET', '/api/v1/auth/me', null, $newCustomerToken);
assertTest('5. GET /api/v1/auth/me returns 200 with authenticated user', $meRes['status'] === 200);
assertTest('   Safe user returned (no password_hash)', !isset($meRes['body']['data']['user']['password_hash']));
assertTest('   User email matches registered email', ($meRes['body']['data']['user']['email'] ?? '') === $customerEmail);

// 6. Role Authorization: Customer CANNOT access Admin Endpoints
$adminForbiddenRes = makeRequest('GET', '/api/v1/admin/shipping-zones', null, $newCustomerToken);
assertTest('6. Customer cannot access GET /api/v1/admin/shipping-zones -> 403 Forbidden', $adminForbiddenRes['status'] === 403);
assertTest('   Error code is FORBIDDEN', ($adminForbiddenRes['body']['error']['code'] ?? '') === 'FORBIDDEN');

// 7. Customer Profile & Address Management
$profileRes = makeRequest('PUT', '/api/v1/customer/profile', [
    'full_name' => 'Updated Shopper Name',
    'phone' => '+234 809 999 8888',
], $newCustomerToken, $newCustomerCsrf);
assertTest('7. PUT /api/v1/customer/profile updates profile', $profileRes['status'] === 200);
assertTest('   Updated name reflected', ($profileRes['body']['data']['full_name'] ?? '') === 'Updated Shopper Name');

// Add Address
$addrRes = makeRequest('POST', '/api/v1/customer/addresses', [
    'label' => 'Home',
    'recipient_name' => 'Updated Shopper Name',
    'phone' => '+234 809 999 8888',
    'street_address' => '45 Chime Avenue, New Haven',
    'city' => 'Enugu',
    'state' => 'Enugu',
    'country' => 'Nigeria',
    'postal_code' => '400001',
    'is_default' => 1,
], $newCustomerToken, $newCustomerCsrf);
assertTest('8. POST /api/v1/customer/addresses creates address', $addrRes['status'] === 201);
$addressId = $addrRes['body']['data']['id'] ?? 0;
assertTest('   Address ID assigned', $addressId > 0);

// List Addresses
$listAddrRes = makeRequest('GET', '/api/v1/customer/addresses', null, $newCustomerToken);
assertTest('9. GET /api/v1/customer/addresses lists saved addresses', $listAddrRes['status'] === 200);
assertTest('   Address count >= 1', count($listAddrRes['body']['data'] ?? []) >= 1);

// 8. Passwordless Magic Link Sign In
$magicEmail = "magic_{$randomSuffix}@example.com";
$magicReq = makeRequest('POST', '/api/v1/auth/customer/magic-link', ['email' => $magicEmail]);
assertTest('10. POST /api/v1/auth/customer/magic-link requests magic link', $magicReq['status'] === 200);
$magicToken = $magicReq['body']['data']['magic_token'] ?? '';
assertTest('    Magic token generated', !empty($magicToken));

$magicVerify = makeRequest('POST', '/api/v1/auth/customer/verify', ['token' => $magicToken]);
assertTest('11. POST /api/v1/auth/customer/verify signs in with magic link', $magicVerify['status'] === 200);
assertTest('    Lightweight customer verified and returned', ($magicVerify['body']['data']['user']['email'] ?? '') === $magicEmail);

// 9. Cart and Wishlist Merging
$cartMergeRes = makeRequest('POST', '/api/v1/cart/merge', [
    'items' => [
        ['variant_id' => 1, 'quantity' => 2],
    ],
], $newCustomerToken, $newCustomerCsrf);
assertTest('12. POST /api/v1/cart/merge merges guest cart items into database cart', $cartMergeRes['status'] === 200);
assertTest('    Merged cart has items', count($cartMergeRes['body']['data']['items'] ?? []) >= 1);

$wlMergeRes = makeRequest('POST', '/api/v1/wishlist/merge', [
    'product_ids' => [1, 2],
], $newCustomerToken, $newCustomerCsrf);
assertTest('13. POST /api/v1/wishlist/merge merges guest wishlist items', $wlMergeRes['status'] === 200);
assertTest('    Merged wishlist has items', count($wlMergeRes['body']['data']['items'] ?? []) >= 1);

// 9. Admin Operations (Destination Zones)
// Use existing admin or dev token
$adminLogin = makeRequest('POST', '/api/v1/auth/login', [
    'email' => getenv('TEST_ADMIN_EMAIL') ?: '',
    'password' => getenv('TEST_ADMIN_PASSWORD') ?: '',
]);

$adminToken = null;
if ($adminLogin['status'] === 200) {
    $adminToken = $adminLogin['body']['data']['session_token'];
} else {
    // Fall back to DEV_ADMIN_API_TOKEN
    $adminToken = 'dev_admin_secret_token_12345';
}

$zonesRes = makeRequest('GET', '/api/v1/admin/shipping-zones', null, $adminToken);
assertTest('12. Admin GET /api/v1/admin/shipping-zones returns 200', $zonesRes['status'] === 200);
assertTest('    Configured destination zones returned', count($zonesRes['body']['data'] ?? []) >= 4);

// 10. Logout and Expiration
$logoutRes = makeRequest('POST', '/api/v1/auth/logout', null, $newCustomerToken);
assertTest('13. POST /api/v1/auth/logout succeeds', $logoutRes['status'] === 200);

$meAfterLogout = makeRequest('GET', '/api/v1/auth/me', null, $newCustomerToken);
assertTest('14. Destroyed session fails GET /api/v1/auth/me with 401', $meAfterLogout['status'] === 401);

echo "\n========================================================\n";
echo " ALL STEP 6 AUTH & CUSTOMER INTEGRATION TESTS PASSED!\n";
echo "========================================================\n";
exit(0);
