<?php

declare(strict_types=1);

/**
 * CLI Test Script for 404 Route Not Found
 */

$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/api/v1/non-existent-route';

ob_start();
require __DIR__ . '/../public/index.php';
$output = ob_get_clean();

$json = json_decode($output, true);
if (isset($json['success']) && $json['success'] === false && $json['error']['code'] === 'ROUTE_NOT_FOUND') {
    echo "[PASS] 404 properly handled with code: " . $json['error']['code'] . "\n";
    echo "[PASS] Message: " . $json['error']['message'] . "\n";
    exit(0);
} else {
    echo "[FAIL] Unexpected 404 response: " . $output . "\n";
    exit(1);
}
