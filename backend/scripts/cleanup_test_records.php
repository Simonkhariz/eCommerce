<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/autoload.php';
require_once __DIR__ . '/../src/Config/Env.php';

use App\Config\Env;
use App\Database\Database;

Env::load(__DIR__ . '/../.env');
$db = Database::getInstance();

// 1. Delete test products created by test suites
$db->execute("DELETE FROM products WHERE sku LIKE 'TEST-STEP7-%' OR sku LIKE 'HTTP-STEP7-%' OR name LIKE '%Test%'");

// 2. Also check if any product images point to non-existent test images
$testImages = $db->fetchAll("SELECT id, image_url FROM product_images WHERE image_url LIKE '%test-http%' OR image_url LIKE '%test-1%'");
foreach ($testImages as $img) {
    $db->execute("DELETE FROM product_images WHERE id = ?", "i", [(int)$img['id']]);
}

echo "Database cleaned up successfully. Test products and dummy image paths removed.\n";
