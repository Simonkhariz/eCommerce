<?php

declare(strict_types=1);

/**
 * Release stock held by unpaid orders whose payment window has passed.
 *
 * For each overdue order that has an open Kora/Monnify attempt, the gateway is asked for
 * the final status first, so a payment completed at the last minute is applied instead of
 * the order being cancelled. Everything else is cancelled and its stock and promo use
 * released exactly once (safe to run concurrently or repeatedly).
 *
 * The API also runs a small sweep automatically whenever an order is placed or the admin
 * order list is opened; schedule this script so stock is released even when the store is quiet.
 *
 * Usage:
 *   php backend/scripts/expire_pending_orders.php            (check gateways, then expire)
 *   php backend/scripts/expire_pending_orders.php --no-gateway-check
 *
 * Windows Task Scheduler (every 10 minutes):
 *   schtasks /Create /SC MINUTE /MO 10 /TN "ShopCo Expire Orders" ^
 *     /TR "C:\xampp\php\php.exe C:\path\to\E-commerce\backend\scripts\expire_pending_orders.php"
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Services\FulfillmentService;
use App\Services\KoraService;
use App\Services\MonnifyService;

Env::load(BASE_PATH . '/.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Africa/Lagos') ?: 'Africa/Lagos');

$checkGateways = !in_array('--no-gateway-check', $argv, true);
$db = Database::getInstance();
$fulfillment = new FulfillmentService($db);

$overdue = $db->fetchAll(
    "SELECT `id`, `order_number` FROM `orders`
     WHERE `order_status` = 'pending_payment' AND `expires_at` IS NOT NULL AND `expires_at` <= NOW()
     ORDER BY `expires_at` ASC LIMIT 500"
);

echo sprintf("[%s] %d overdue unpaid order(s) found.\n", date('Y-m-d H:i:s'), count($overdue));

$paid = 0;
$expired = 0;

foreach ($overdue as $order) {
    if ($checkGateways) {
        $attempts = $db->fetchAll(
            "SELECT `provider`, `provider_reference` FROM `payments`
             WHERE `order_id` = ? AND `status` = 'pending' AND `provider` IN ('kora', 'monnify')",
            'i',
            [(int) $order['id']]
        );
        foreach ($attempts as $attempt) {
            try {
                $service = $attempt['provider'] === 'kora' ? new KoraService($db) : new MonnifyService($db);
                $service->verifyTransaction($attempt['provider_reference']);
            } catch (Throwable $e) {
                echo "  ! {$order['order_number']}: could not check {$attempt['provider']} ({$e->getMessage()})\n";
            }
        }

        $status = $db->fetchOne("SELECT `order_status` FROM `orders` WHERE `id` = ?", 'i', [(int) $order['id']]);
        if (($status['order_status'] ?? '') !== 'pending_payment') {
            echo "  ✓ {$order['order_number']}: payment confirmed by gateway; not expired.\n";
            $paid++;
            continue;
        }
    }

    try {
        if ($fulfillment->expireOrder((int) $order['id'])) {
            echo "  - {$order['order_number']}: expired, stock released.\n";
            $expired++;
        }
    } catch (Throwable $e) {
        echo "  ! {$order['order_number']}: {$e->getMessage()}\n";
    }
}

echo "Done. Expired: {$expired}. Paid at the last minute: {$paid}.\n";
