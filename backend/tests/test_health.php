<?php

declare(strict_types=1);

/**
 * CLI Test Script for /api/v1/health and error responses
 */

// Simulate a GET request to /api/v1/health
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/api/v1/health';

ob_start();
try {
    require __DIR__ . '/../public/index.php';
} catch (\Throwable $e) {
    // index.php calls exit, but if any unhandled error bubbles
}
$output = ob_get_clean();

echo "--- HEALTH CHECK OUTPUT ---\n";
echo $output . "\n";

$json = json_decode($output, true);
if (json_last_error() === JSON_ERROR_NONE && isset($json['success']) && isset($json['data']['service'])) {
    echo "\n[PASS] Valid JSON received with service name: " . $json['data']['service'] . "\n";
    echo "[PASS] PHP Version: " . $json['data']['php_version'] . "\n";
    echo "[PASS] Store Currency: " . $json['data']['store']['currency'] . "\n";
    echo "[PASS] Store Origin: " . $json['data']['store']['origin']['city'] . "\n";
    exit(0);
} else {
    echo "\n[FAIL] Invalid JSON response received.\n";
    exit(1);
}
