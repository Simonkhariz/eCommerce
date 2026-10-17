<?php

declare(strict_types=1);

/**
 * Database Migration Runner for Shop.co
 * Executes versioned SQL migrations in sequential order.
 */

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;

// Load environment configuration
Env::load(BASE_PATH . '/.env');

$host = Env::get('DB_HOST', '127.0.0.1');
$port = Env::int('DB_PORT', 3306);
$database = Env::get('DB_DATABASE', 'shopco_dev');
$username = Env::get('DB_USERNAME', 'root');
$password = Env::get('DB_PASSWORD', '');

echo "========================================================\n";
echo " Shop.co E-Commerce Database Migration Runner\n";
echo " Target: {$username}@{$host}:{$port}/{$database}\n";
echo "========================================================\n\n";

// 1. Connect without selecting database to ensure database exists
$rootConn = @new mysqli($host, $username, $password, '', $port);
if ($rootConn->connect_errno) {
    fwrite(STDERR, "[FATAL] Unable to connect to MySQL: " . $rootConn->connect_error . "\n");
    fwrite(STDERR, "Please verify that MySQL is started in XAMPP on port {$port}.\n");
    exit(1);
}

// 2. Create database if it does not exist
$createDbSql = "CREATE DATABASE IF NOT EXISTS `{$database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;";
if (!$rootConn->query($createDbSql)) {
    fwrite(STDERR, "[FATAL] Failed to create database '{$database}': " . $rootConn->error . "\n");
    $rootConn->close();
    exit(1);
}
echo "[OK] Database '{$database}' verified/created (utf8mb4_unicode_ci).\n";
$rootConn->close();

// 3. Connect to the target database
$db = new mysqli($host, $username, $password, $database, $port);
if ($db->connect_errno) {
    fwrite(STDERR, "[FATAL] Connection to '{$database}' failed: " . $db->connect_error . "\n");
    exit(1);
}
$db->set_charset('utf8mb4');

// 4. Discover and execute migration files
$migrationFiles = glob(BASE_PATH . '/migrations/[0-9]*.sql');
sort($migrationFiles);

if (empty($migrationFiles)) {
    echo "[INFO] No migration files found in " . BASE_PATH . "/migrations/\n";
    $db->close();
    exit(0);
}

$successCount = 0;
foreach ($migrationFiles as $file) {
    $filename = basename($file);
    echo "Running migration: {$filename}... ";

    $sql = file_get_contents($file);
    if ($sql === false || trim($sql) === '') {
        echo "[SKIPPED - EMPTY]\n";
        continue;
    }

    if ($db->multi_query($sql)) {
        // Flush all multi-query results
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
        $successCount++;
    } else {
        echo "[FAILED]\n";
        fwrite(STDERR, "  Error in {$filename}: " . $db->error . "\n");
        $db->close();
        exit(1);
    }
}

echo "\n[SUCCESS] Successfully applied {$successCount} migration(s) to '{$database}'.\n";

// Count created tables
$res = $db->query("SHOW TABLES");
$tableCount = $res ? $res->num_rows : 0;
echo "[INFO] Total active tables in '{$database}': {$tableCount}\n";

$db->close();
exit(0);
