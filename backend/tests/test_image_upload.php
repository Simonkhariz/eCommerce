<?php

declare(strict_types=1);

$baseUrl = 'http://127.0.0.1:8000/api/v1';
$devToken = 'dev_admin_secret_token_12345';

echo "=== TESTING IMAGE FILE UPLOADS ===\n\n";

// Create a dummy PNG in memory
$tmpPng = tempnam(sys_get_temp_dir(), 'test_img_') . '.png';
$pngBinary = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
file_put_contents($tmpPng, $pngBinary);

$ch = curl_init("{$baseUrl}/admin/upload-image");
$cfile = new \CURLFile($tmpPng, 'image/png', 'sample_product.png');
$data = ['image' => $cfile];

curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Accept: application/json',
    "X-Dev-Admin-Token: {$devToken}",
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
@unlink($tmpPng);

echo "HTTP Code: {$httpCode}\n";
echo "Response: {$response}\n";

$json = json_decode($response, true);
if ($httpCode === 201 && !empty($json['data']['image_url'])) {
    echo "\n[PASS] Image upload successful: {$json['data']['image_url']}\n";
    exit(0);
} else {
    echo "\n[FAIL] Image upload failed!\n";
    exit(1);
}
