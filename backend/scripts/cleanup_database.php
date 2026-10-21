<?php

declare(strict_types=1);

/**
 * Daily database clean-up and health check.
 *
 * Removes expired sessions and sign-in links, old rate-limit counters, never-paid cancelled
 * orders, abandoned guest carts, old emails and gateway notifications, and (when the admin
 * chose a period) inactive customers' personal details and old activity logs. Money records
 * (order totals, payments, refunds) are never removed. Periods are set in admin → Data &
 * storage (see App\Services\DatabaseCleanup).
 *
 * Afterwards it checks the database size and speed and emails the admins (at most once a week)
 * when something needs attention.
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
use App\Services\MailService;
use App\Services\StorageHealth;

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
    printf("  %-48s %d\n", DatabaseCleanup::LABELS[$rule] ?? str_replace('_', ' ', $rule), $count);
}

if ($dryRun) {
    exit(0);
}

try {
    $health = (new StorageHealth())->report(false);
    echo 'Database health: ' . $health['level'] . "\n";
    foreach ($health['issues'] as $issue) {
        echo "  {$issue['title']}: {$issue['detail']}\n";
    }
    if ($health['level'] !== 'ok') {
        $queued = (new MailService())->sendStorageAlertToAdmins($health);
        if ($queued > 0) {
            echo "  Alert queued for {$queued} admin(s).\n";
        }
    }
} catch (Throwable $e) {
    fwrite(STDERR, '[' . date('Y-m-d H:i:s') . '] Health check failed: ' . $e->getMessage() . "\n");
    exit(1);
}
