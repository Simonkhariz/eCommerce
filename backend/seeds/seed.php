<?php

declare(strict_types=1);

/**
 * Database Seed Runner for Shop.co
 * Populates categories, products, variants, and Enugu shipping zones.
 */

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;

Env::load(BASE_PATH . '/.env');

$host = Env::get('DB_HOST', '127.0.0.1');
$port = Env::int('DB_PORT', 3306);
$database = Env::get('DB_DATABASE', 'shopco_dev');
$username = Env::get('DB_USERNAME', 'root');
$password = Env::get('DB_PASSWORD', '');

echo "========================================================\n";
echo " Shop.co E-Commerce Seed Runner\n";
echo " Target: {$username}@{$host}:{$port}/{$database}\n";
echo "========================================================\n\n";

$db = new mysqli($host, $username, $password, $database, $port);
if ($db->connect_errno) {
    fwrite(STDERR, "[FATAL] Connection to '{$database}' failed: " . $db->connect_error . "\n");
    exit(1);
}
$db->set_charset('utf8mb4');

$seedFiles = glob(BASE_PATH . '/seeds/[0-9]*.sql');
sort($seedFiles);

if (empty($seedFiles)) {
    echo "[INFO] No seed files found.\n";
    $db->close();
    exit(0);
}

foreach ($seedFiles as $file) {
    $filename = basename($file);
    echo "Executing seed: {$filename}... ";

    $sql = file_get_contents($file);
    if ($sql === false || trim($sql) === '') {
        echo "[SKIPPED - EMPTY]\n";
        continue;
    }

    if ($db->multi_query($sql)) {
        do {
            if ($result = $db->store_result()) {
                $result->free();
            }
        } while ($db->more_results() && $db->next_result());

        if ($db->errno) {
            echo "[FAILED]\n";
            fwrite(STDERR, "  Error in {$filename}: " . $db->error . "\n");
            $db->close();
            exit(1);
        }

        echo "[OK]\n";
    } else {
        echo "[FAILED]\n";
        fwrite(STDERR, "  Error in {$filename}: " . $db->error . "\n");
        $db->close();
        exit(1);
    }
}

// Summary queries
$catCount = $db->query("SELECT COUNT(*) AS c FROM categories")->fetch_assoc()['c'] ?? 0;
$prodCount = $db->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'] ?? 0;
$varCount = $db->query("SELECT COUNT(*) AS c FROM product_variants")->fetch_assoc()['c'] ?? 0;
$zoneCount = $db->query("SELECT COUNT(*) AS c FROM shipping_zones")->fetch_assoc()['c'] ?? 0;

echo "\n[SUCCESS] Seeding complete!\n";
echo "  Categories:     {$catCount}\n";
echo "  Products:       {$prodCount} (physical)\n";
echo "  Variants:       {$varCount}\n";
echo "  Shipping Zones: {$zoneCount} (Origin: Enugu, Nigeria)\n";

$db->close();
exit(0);
