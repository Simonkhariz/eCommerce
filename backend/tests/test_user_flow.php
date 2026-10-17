<?php
require_once __DIR__ . '/../src/autoload.php';
\App\Config\Env::load(__DIR__ . '/../.env');

$db = \App\Database\Database::getInstance();
$orderNum = 'ORD-20261017-0AC2ED';

// Fetch session for user 16
$session = $db->fetchOne("SELECT id FROM sessions WHERE user_id = 16 ORDER BY id DESC LIMIT 1");
$token = $session ? $session['id'] : '';

echo "Testing verify-payment with Bearer token {$token}...\n";

function doReq($url, $bearer = null, $extraHeaders = []) {
    $ch = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($bearer) {
        $headers[] = "Authorization: Bearer {$bearer}";
    }
    foreach ($extraHeaders as $k => $v) {
        $headers[] = "{$k}: {$v}";
    }
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "HTTP {$code}:\n{$raw}\n\n";
}

$baseUrl = "http://127.0.0.1:8000/api/v1";

echo "1. Verify payment with user session:\n";
doReq("{$baseUrl}/checkout/orders/{$orderNum}/verify-payment", $token);

echo "2. Customer orders list with user session:\n";
doReq("{$baseUrl}/customer/orders", $token);

echo "3. Customer profile with user session:\n";
doReq("{$baseUrl}/customer/profile", $token);
