<?php

declare(strict_types=1);

/**
 * Security: sessions, CSRF, magic links, admin access, guest order lookups, uploads,
 * rate limits, CORS and suspended accounts.
 *
 *   php backend/tests/run.php Security
 */

require __DIR__ . '/support/TestKit.php';

use App\Config\Env;

$t = new TestKit('Security');

/** Cookies from a curl (Netscape format) jar file: name => [value, httpOnly]. */
$cookies = static function (string $jarFile): array {
    $out = [];
    foreach (@file($jarFile, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $httpOnly = str_starts_with($line, '#HttpOnly_');
        if ($line === '' || ($line[0] === '#' && !$httpOnly)) {
            continue;
        }
        $parts = explode("\t", $httpOnly ? substr($line, 10) : $line);
        if (count($parts) >= 7) {
            $out[$parts[5]] = ['value' => $parts[6], 'http_only' => $httpOnly];
        }
    }
    return $out;
};

/** Multipart image upload with the admin cookie jar. */
$upload = static function (TestKit $t, string $jar, string $csrf, string $file, string $mime, string $name): int {
    $ch = curl_init($t->api . '/admin/upload-image');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS => ['image' => new CURLFile($file, $mime, $name)],
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-CSRF-Token: ' . $csrf],
        CURLOPT_COOKIEFILE => $t->cookieFile($jar),
        CURLOPT_COOKIEJAR => $t->cookieFile($jar),
    ]);
    curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return $status;
};

$customerCookie = (string) (Env::get('SESSION_COOKIE_NAME', 'shopco_session') ?: 'shopco_session');

// -----------------------------------------------------------------------------
$t->section('Health and the retired dev admin token');
$t->check('health 200', 200, $t->http('GET', '/health')['status']);
$t->check('old X-Dev-Admin-Token header -> 401', 401, $t->http('GET', '/admin/orders', ['headers' => ['X-Dev-Admin-Token: dev_admin_secret_token_12345']])['status']);
$t->check('Bearer dev token -> 401', 401, $t->http('GET', '/admin/orders', ['headers' => ['Authorization: Bearer dev_admin_secret_token_12345']])['status']);

// -----------------------------------------------------------------------------
$t->section('Customer registration: cookie session only');
$custEmail = $t->uniq('t-sec-customer') . '@example.test';
$t->cleanup(function () use ($t, $custEmail): void {
    $t->sql("DELETE FROM `email_outbox` WHERE `recipient_email` = ?", 's', [$custEmail]);
    $t->sql("DELETE FROM `users` WHERE `email` = ?", 's', [$custEmail]);
});
$reg = $t->http('POST', '/auth/register', ['jar' => 'cust', 'json' => ['full_name' => 'Security Customer', 'email' => $custEmail, 'password' => 'CustomerPass123']]);
$t->check('register 201', 201, $reg['status']);
$t->check('register body has no session_token', null, TestKit::get($reg, 'data.session_token'));
$t->ok('register body has csrf_token', (string) TestKit::get($reg, 'data.csrf_token') !== '');
$jar = $cookies($t->cookieFile('cust'));
$t->ok('customer cookie set', isset($jar[$customerCookie]));
$t->ok('customer cookie is HttpOnly', ($jar[$customerCookie]['http_only'] ?? false) === true);
$me = $t->http('GET', '/auth/me', ['jar' => 'cust']);
$t->check('/auth/me with cookie 200', 200, $me['status']);
$csrf = (string) TestKit::get($me, 'data.csrf_token');
$t->check('PUT profile without CSRF -> 403', 403, $t->http('PUT', '/customer/profile', ['jar' => 'cust', 'json' => ['phone' => '08000000000']])['status']);
$t->check('PUT profile with CSRF -> 200', 200, $t->http('PUT', '/customer/profile', ['jar' => 'cust', 'csrf' => $csrf, 'json' => ['phone' => '08000000000']])['status']);
$t->check('customer cookie on an admin endpoint -> 401', 401, $t->http('GET', '/admin/orders', ['jar' => 'cust'])['status']);
$raw = (string) ($jar[$customerCookie]['value'] ?? '');
$t->check('session stored hashed (raw cookie is not a DB id)', 0, (int) $t->scalar("SELECT COUNT(*) FROM `sessions` WHERE `id` = ?", 's', [$raw]));
$t->check('session stored as sha256 of the cookie', 1, (int) $t->scalar("SELECT COUNT(*) FROM `sessions` WHERE `id` = ?", 's', [hash('sha256', $raw)]));

// -----------------------------------------------------------------------------
$t->section('Magic links');
$ml = $t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $custEmail]]);
$t->check('magic-link request 200', 200, $ml['status']);
$t->check('magic-link response has no token', null, TestKit::get($ml, 'data.magic_token'));
$t->ok('response body never contains a token field', !str_contains($ml['body'], 'token'));
$t->check('outbox payload has no raw token', 0, (int) $t->scalar(
    "SELECT COUNT(*) FROM `email_outbox` WHERE `recipient_email` = ? AND (`payload` LIKE '%\"token\":%' OR `payload` LIKE '%auth/verify%')",
    's',
    [$custEmail]
));

$singleEmail = $t->uniq('t-sec-magic') . '@example.test';
$t->cleanup(function () use ($t, $singleEmail): void {
    $t->sql("DELETE FROM `email_outbox` WHERE `recipient_email` = ?", 's', [$singleEmail]);
    $t->sql("DELETE FROM `email_verification_tokens` WHERE `email` = ?", 's', [$singleEmail]);
    $t->sql("DELETE FROM `users` WHERE `email` = ?", 's', [$singleEmail]);
});
$t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $singleEmail]]);
$token = $t->magicLinkToken($singleEmail);
$t->ok('sign-in link delivered to the (test) mail log', $token !== null);
$t->check('magic link verifies once', 200, $t->http('POST', '/auth/customer/verify', ['jar' => 'magic', 'json' => ['token' => (string) $token]])['status']);
$t->check('magic link cannot be reused', 401, $t->http('POST', '/auth/customer/verify', ['json' => ['token' => (string) $token]])['status']);
$t->check('unknown magic token rejected', 401, $t->http('POST', '/auth/customer/verify', ['json' => ['token' => str_repeat('a', 64)]])['status']);

// -----------------------------------------------------------------------------
$t->section('Admin sessions');
$admin = $t->adminSession('sec');
$t->check('magic-link for an admin email: same generic 200', 200, $t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $admin['email']]])['status']);
$t->check('no magic token issued for an admin', 0, (int) $t->scalar("SELECT COUNT(*) FROM `email_verification_tokens` WHERE `email` = ?", 's', [$admin['email']]));
$adminJar = $cookies($t->cookieFile($admin['jar']));
$t->ok('admin login sets the shopco_admin cookie', isset($adminJar['shopco_admin']));
$t->ok('admin login does not set the customer cookie', !isset($adminJar[$customerCookie]));
$t->ok('admin login returned a CSRF token', $admin['csrf'] !== '');
$t->check('/auth/me?scope=admin 200', 200, $t->http('GET', '/auth/me?scope=admin', ['jar' => $admin['jar']])['status']);
$t->check('/auth/me (customer scope) with the admin cookie -> 401', 401, $t->http('GET', '/auth/me', ['jar' => $admin['jar']])['status']);
$t->check('admin GET /admin/orders 200', 200, $t->http('GET', '/admin/orders?per_page=1', ['jar' => $admin['jar']])['status']);
$t->check('admin GET /admin/account 200 (identity resolved)', 200, $t->http('GET', '/admin/account', ['jar' => $admin['jar']])['status']);
$t->check('admin mutation without CSRF -> 403', 403, $t->http('POST', '/admin/categories', ['jar' => $admin['jar'], 'json' => []])['status']);
$t->check('admin mutation with CSRF passes auth (422 validation)', 422, $t->http('POST', '/admin/categories', ['jar' => $admin['jar'], 'csrf' => $admin['csrf'], 'json' => []])['status']);
$t->check('customer CSRF token does not work for admin', 403, $t->http('POST', '/admin/categories', ['jar' => $admin['jar'], 'csrf' => $csrf, 'json' => []])['status']);

// -----------------------------------------------------------------------------
$t->section('Uploads');
$tmp = sys_get_temp_dir() . '/shopco-sec-' . getmypid();
@mkdir($tmp);
file_put_contents("{$tmp}/x.svg", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
file_put_contents("{$tmp}/fake.png", "<?php echo 'not an image'; ?>");
$t->check('SVG upload rejected 422', 422, $upload($t, $admin['jar'], $admin['csrf'], "{$tmp}/x.svg", 'image/svg+xml', 'x.svg'));
$t->check('PHP disguised as PNG rejected 422', 422, $upload($t, $admin['jar'], $admin['csrf'], "{$tmp}/fake.png", 'image/png', 'fake.png'));
// A real 1x1 PNG (no GD needed).
file_put_contents("{$tmp}/ok.png", base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
$t->check('upload without CSRF -> 403', 403, $upload($t, $admin['jar'], '', "{$tmp}/ok.png", 'image/png', 'ok.png'));
array_map('unlink', glob("{$tmp}/*") ?: []);
@rmdir($tmp);

// -----------------------------------------------------------------------------
$t->section('Guest order lookup');
$v = $t->variant(3);
$guestEmail = $t->uniq('t-sec-guest') . '@example.test';
$order = $t->http('POST', '/checkout/orders', [
    'headers' => ['Idempotency-Key: sec' . bin2hex(random_bytes(10))],
    'json' => [
        'email' => $guestEmail,
        'items' => [['product_id' => (int) $v['product_id'], 'variant_id' => (int) $v['variant_id'], 'quantity' => 1]],
        'shipping_address' => ['full_name' => 'Security Guest', 'phone' => '08012345678', 'address_line1' => '1 Test Road', 'city' => 'Enugu', 'state' => 'Enugu', 'country' => 'Nigeria'],
    ],
]);
$t->check('guest order created', 201, $order['status']);
$onum = (string) TestKit::get($order, 'data.order_number');
$gtoken = (string) TestKit::get($order, 'data.guest_access_token');
$t->cleanup(function () use ($t, $onum, $guestEmail): void {
    $t->sql("DELETE FROM `orders` WHERE `order_number` = ?", 's', [$onum]);
    $t->sql("DELETE FROM `email_outbox` WHERE `recipient_email` = ?", 's', [$guestEmail]);
});

$noProof = $t->http('GET', "/checkout/orders/{$onum}");
$t->check('lookup without proof -> 404', 404, $noProof['status']);
$t->check('lookup with the wrong email -> 404', 404, $t->http('GET', "/checkout/orders/{$onum}", ['headers' => ['X-Order-Email: nobody@example.test']])['status']);
$t->check('phone number no longer authorizes -> 404', 404, $t->http('GET', "/checkout/orders/{$onum}?phone=08012345678")['status']);
$t->check('last 7 phone digits no longer authorize -> 404', 404, $t->http('GET', "/checkout/orders/{$onum}?phone=2345678")['status']);
$withEmail = $t->http('GET', "/checkout/orders/{$onum}", ['headers' => ["X-Order-Email: {$guestEmail}"]]);
$t->check('lookup with the full checkout email -> 200', 200, $withEmail['status']);
$t->check('email lookup is case-insensitive', 200, $t->http('GET', "/checkout/orders/{$onum}", ['headers' => ['X-Order-Email: ' . strtoupper($guestEmail)]])['status']);
$t->check('response hides user_id', false, array_key_exists('user_id', (array) TestKit::get($withEmail, 'data')));
$t->check('response hides the guest token hash', false, array_key_exists('guest_access_token_hash', (array) TestKit::get($withEmail, 'data')));
$t->check('response hides the idempotency key', false, array_key_exists('idempotency_key', (array) TestKit::get($withEmail, 'data')));
$t->check('guest access token opens the order', 200, $t->http('GET', "/checkout/orders/{$onum}", ['headers' => ["X-Guest-Access-Token: {$gtoken}"]])['status']);
$t->check('a wrong guest token -> 404', 404, $t->http('GET', "/checkout/orders/{$onum}", ['headers' => ['X-Guest-Access-Token: ' . str_repeat('0', 64)]])['status']);
$unknown = $t->http('GET', '/checkout/orders/ORD-00000000-NOPE00', ['headers' => ["X-Order-Email: {$guestEmail}"]]);
$t->check('unknown order -> 404', 404, $unknown['status']);
$t->check('unknown and unauthorized orders get the same message', TestKit::get($noProof, 'error.message'), TestKit::get($unknown, 'error.message'));

// Pay and ship it, then try the courier tracking number on its own.
$paid = $t->http('POST', "/admin/orders/{$onum}/confirm-payment", ['jar' => $admin['jar'], 'csrf' => $admin['csrf'], 'json' => ['reference' => 'SEC-' . bin2hex(random_bytes(4))]]);
$t->check('admin records a manual payment', 200, $paid['status']);
$tracking = 'TRK' . strtoupper(bin2hex(random_bytes(5)));
$shipped = $t->http('POST', "/admin/orders/{$onum}/shipment", ['jar' => $admin['jar'], 'csrf' => $admin['csrf'], 'json' => ['carrier' => 'GIG Logistics', 'tracking_number' => $tracking, 'status' => 'in_transit']]);
$t->check('admin ships the order', 200, $shipped['status']);
$t->check('tracking number alone does not open the order -> 404', 404, $t->http('GET', "/checkout/orders/{$tracking}")['status']);
$t->check('tracking number plus the checkout email -> 200', 200, $t->http('GET', "/checkout/orders/{$tracking}", ['headers' => ["X-Order-Email: {$guestEmail}"]])['status']);

$t->section('Payment redirect is locked to the storefront');
$t->check('initialize-payment without proof -> 404', 404, $t->http('POST', "/checkout/orders/{$onum}/initialize-payment", ['json' => ['gateway' => 'kora', 'redirect_url' => 'https://evil.example/steal']])['status']);

// -----------------------------------------------------------------------------
$t->section('Suspended customers');
$suspEmail = $t->uniq('t-sec-suspended') . '@example.test';
$t->cleanup(function () use ($t, $suspEmail): void {
    $t->sql("DELETE FROM `users` WHERE `email` = ?", 's', [$suspEmail]);
});
$t->check('second customer registers', 201, $t->http('POST', '/auth/register', ['jar' => 'susp', 'json' => ['full_name' => 'Suspended Person', 'email' => $suspEmail, 'password' => 'SuspendedPass123']])['status']);
$t->sql("UPDATE `users` SET `status` = 'suspended' WHERE `email` = ?", 's', [$suspEmail]);
$t->check('existing session stops working once suspended', 401, $t->http('GET', '/auth/me', ['jar' => 'susp'])['status']);
$t->check('suspended customer cannot sign in', 403, $t->http('POST', '/auth/login', ['json' => ['email' => $suspEmail, 'password' => 'SuspendedPass123']])['status']);
$t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $suspEmail]]);
$t->check('suspended customer gets no sign-in link', null, $t->magicLinkToken($suspEmail));

// -----------------------------------------------------------------------------
$t->section('CORS');
$evil = $t->http('GET', '/health', ['headers' => ['Origin: https://evil.example']]);
$t->ok('arbitrary origin is not echoed', ($evil['headers']['access-control-allow-origin'] ?? '') !== 'https://evil.example');
$t->ok('arbitrary origin gets no credentials grant', !isset($evil['headers']['access-control-allow-credentials']));
$allowed = trim(explode(',', (string) Env::get('CORS_ALLOWED_ORIGINS', 'http://localhost:3000'))[0]);
if ($allowed !== '') {
    $ok = $t->http('GET', '/health', ['headers' => ["Origin: {$allowed}"]]);
    $t->check('configured storefront origin is allowed', $allowed, $ok['headers']['access-control-allow-origin'] ?? null);
}

// -----------------------------------------------------------------------------
$t->section('Rate limits');
$t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $custEmail]]);
$t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $custEmail]]);
$t->check('4th magic link for one email within 15 minutes -> 429', 429, $t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $custEmail]])['status']);
for ($i = 1; $i <= 5; $i++) {
    $t->http('POST', '/auth/login', ['json' => ['email' => $admin['email'], 'password' => "wrong-{$i}"]]);
}
$t->check('6th login after 5 failures -> 429 (even with the right password)', 429, $t->http('POST', '/auth/login', ['json' => ['email' => $admin['email'], 'password' => $admin['password']]])['status']);

// -----------------------------------------------------------------------------
$t->section('Logout');
$t->check('admin logout 200', 200, $t->http('POST', '/auth/logout?scope=admin', ['jar' => $admin['jar'], 'csrf' => $admin['csrf']])['status']);
$t->check('admin session gone after logout', 401, $t->http('GET', '/auth/me?scope=admin', ['jar' => $admin['jar']])['status']);
$t->check('customer logout 200', 200, $t->http('POST', '/auth/logout', ['jar' => 'cust', 'csrf' => $csrf])['status']);
$t->check('customer session gone after logout', 401, $t->http('GET', '/auth/me', ['jar' => 'cust'])['status']);
$t->check('logged-out session row deleted', 0, (int) $t->scalar("SELECT COUNT(*) FROM `sessions` WHERE `id` = ?", 's', [hash('sha256', $raw)]));

exit($t->finish());
