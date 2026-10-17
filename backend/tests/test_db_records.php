<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;

Env::load(BASE_PATH . '/.env');
$db = Database::getInstance();

echo "--- DATABASE RECORD VERIFICATION ---\n";

// 1. Admin user
$admin = $db->fetchOne("SELECT id, uuid, email, full_name, role, status FROM users WHERE role = 'admin'");
echo "Admin Account: " . ($admin ? "{$admin['full_name']} ({$admin['email']}) [Role: {$admin['role']}, Status: {$admin['status']}]" : "NONE") . "\n";

// 2. Store Settings
$settings = $db->fetchAll("SELECT key_name, value FROM store_settings WHERE key_name IN ('store_name', 'store_currency', 'store_origin_city', 'is_setup_completed')");
echo "Store Settings:\n";
foreach ($settings as $s) {
    echo "  - {$s['key_name']}: {$s['value']}\n";
}

// 3. Shipping Zones
$zones = $db->fetchAll("SELECT name, code, fee, estimated_days FROM shipping_zones WHERE is_active = 1");
echo "Active Shipping Zones (Origin: Enugu):\n";
foreach ($zones as $z) {
    echo "  - [{$z['code']}] {$z['name']} -> NGN {$z['fee']} ({$z['estimated_days']})\n";
}

// 4. Products
$products = $db->fetchAll("SELECT name, slug, product_type, base_price, currency FROM products");
echo "Products in DB:\n";
foreach ($products as $p) {
    echo "  - [{$p['product_type']}] {$p['name']} -> {$p['currency']} {$p['base_price']}\n";
}

// 5. Audit Log
$logs = $db->fetchAll("SELECT action, entity_type, created_at FROM admin_audit_logs");
echo "Audit Logs: " . count($logs) . " entry/entries found.\n";
foreach ($logs as $l) {
    echo "  - {$l['action']} on {$l['entity_type']} at {$l['created_at']}\n";
}

exit(0);
