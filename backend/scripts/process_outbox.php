<?php

declare(strict_types=1);

/**
 * Deliver queued emails from email_outbox (newsletters, and any order email whose first
 * attempt failed). Failed attempts are retried with backoff (1, 5, 15, 60 minutes) and
 * marked failed after 5 attempts. Safe to run concurrently: each email is claimed first.
 *
 * With MAIL_MAILER=log (the default) emails are written to backend/storage/logs/mail.log
 * instead of being delivered.
 *
 * Usage:
 *   php backend/scripts/process_outbox.php            (one batch of up to 100)
 *   php backend/scripts/process_outbox.php --limit=500
 *
 * Windows Task Scheduler (every 5 minutes):
 *   schtasks /Create /SC MINUTE /MO 5 /TN "ShopCo Send Email" ^
 *     /TR "C:\xampp\php\php.exe C:\path\to\E-commerce\backend\scripts\process_outbox.php"
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Services\MailService;

Env::load(BASE_PATH . '/.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Africa/Lagos') ?: 'Africa/Lagos');

$limit = 100;
foreach ($argv as $arg) {
    if (preg_match('/^--limit=(\d+)$/', $arg, $m)) {
        $limit = max(1, min(500, (int) $m[1]));
    }
}

try {
    $summary = MailService::getInstance()->processQueue($limit);
} catch (Throwable $e) {
    fwrite(STDERR, '[process_outbox] ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

printf(
    "[%s] mode=%s processed=%d sent=%d retrying=%d failed=%d\n",
    date('Y-m-d H:i:s'),
    MailService::mode(),
    $summary['processed'],
    $summary['sent'],
    $summary['retrying'],
    $summary['failed']
);
