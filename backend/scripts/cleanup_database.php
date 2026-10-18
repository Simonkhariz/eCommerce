<?php

declare(strict_types=1);

/**
 * Daily database clean-up: expired sessions and sign-in links, old rate-limit counters,
 * never-paid cancelled orders, abandoned guest carts, old emails and gateway notifications.
 * Paid orders, refunds, audit logs and stock history are never removed.
 * Retention periods are set in backend/.env (see App\Services\DatabaseCleanup).
 *
 * Usage:
 *   php backend/scripts/cleanup_database.php --dry-run   (only count what would be removed)
 *   php backend/scripts/cleanup_database.php
 *
 * Windows Task Scheduler (daily at 03:00):
 *   schtasks /Create /SC DAILY /ST 03:00 /TN "ShopCo Cleanup" ^
 *     /TR "C:\xampp\php\php.exe C:\path\to\E-commerce\backend\scripts\cleanup_database.php"
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Services\DatabaseCleanup;

Env::load(BASE_PATH . '/.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Africa/Lagos') ?: 'Africa/Lagos');

$dryRun = in_array('--dry-run', $argv, true);

try {
    $counts = (new DatabaseCleanup())->run($dryRun);
} catch (Throwable $e) {
    fwrite(STDERR, '[' . date('Y-m-d H:i:s') . '] Cleanup failed: ' . $e->getMessage() . "\n");
    exit(1);
}

echo '[' . date('Y-m-d H:i:s') . '] ' . ($dryRun ? 'Would remove' : 'Removed') . ":\n";
foreach ($counts as $rule => $count) {
    printf("  %-32s %d\n", str_replace('_', ' ', $rule), $count);
}
