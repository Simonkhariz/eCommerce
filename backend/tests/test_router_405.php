<?php

declare(strict_types=1);

/**
 * CLI Test Script for 405 Method Not Allowed
 */

$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['REQUEST_URI'] = '/api/v1/health';

ob_start();
require __DIR__ . '/../public/index.php';
$output = ob_get_clean();

$json = json_decode($output, true);
if (isset($json['success']) && $json['success'] === false && $json['error']['code'] === 'METHOD_NOT_ALLOWED') {
    echo "[PASS] 405 properly handled with code: " . $json['error']['code'] . "\n";
    echo "[PASS] Message: " . $json['error']['message'] . "\n";
    exit(0);
} else {
    echo "[FAIL] Unexpected 405 response: " . $output . "\n";
    exit(1);
}
