<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;

Env::load(BASE_PATH . '/.env');

try {
    $db = Database::getInstance();
    $conn = $db->getConnection();
    echo "Connected to MySQL database via MySQLi.\n";

    // 1. Delete digital deliverables
    $conn->query("DELETE FROM digital_deliverables");
    echo "Cleared digital_deliverables table.\n";

    // 2. Remove digital settings from store_settings
    $conn->query("DELETE FROM store_settings WHERE `key_name` IN ('digital_download_expiry_days', 'digital_download_max_count')");
    echo "Removed digital settings from store_settings.\n";

    // 3. Find any digital products
    $res = $conn->query("SELECT id, name, slug FROM products WHERE product_type = 'digital'");
    $digitalProducts = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];

    echo "Found " . count($digitalProducts) . " digital products.\n";
    foreach ($digitalProducts as $p) {
        echo "  - [ID: {$p['id']}] {$p['name']} ({$p['slug']})\n";
    }

    // Convert them to physical
    $conn->query("UPDATE products SET product_type = 'physical' WHERE product_type = 'digital'");
    echo "Updated all products to product_type = 'physical'.\n";

    // 4. Check category 'digital-assets'
    $catRes = $conn->query("SELECT id, name FROM categories WHERE slug = 'digital-assets'");
    $cat = $catRes ? $catRes->fetch_assoc() : null;
    if ($cat) {
        $accRes = $conn->query("SELECT id FROM categories WHERE slug = 'accessories'");
        if ($accRes && $accRes->num_rows > 0) {
            $accId = (int)$accRes->fetch_assoc()['id'];
            $conn->query("UPDATE products SET category_id = {$accId} WHERE category_id = " . (int)$cat['id']);
            $conn->query("DELETE FROM categories WHERE id = " . (int)$cat['id']);
            echo "Merged 'digital-assets' into existing 'accessories' category.\n";
        } else {
            $conn->query("UPDATE categories SET name = 'Accessories', slug = 'accessories', description = 'Belts, sunglasses, bags and streetwear accessories.' WHERE id = " . (int)$cat['id']);
            echo "Renamed category 'digital-assets' to 'accessories'.\n";
        }
    }

    // 5. Update descriptions of any previous digital items to physical merchandise
    $conn->query("UPDATE products SET name = 'Shop.co Fashion Lookbook (Hardcover)', description = 'Premium full-color printed hardcover editorial lookbook and styling handbook.' WHERE slug = 'shopco-digital-lookbook-2026'");
    $conn->query("UPDATE products SET name = 'Streetwear Editorial Print Folio', description = 'Limited edition archival art print folio showcasing streetwear collection.' WHERE slug = 'streetwear-lightroom-presets'");
    $conn->query("UPDATE products SET name = 'Tech Apparel Design Swatch Kit', description = 'Physical fabric and pattern swatch kit for tech apparel designers.' WHERE slug = 'fashion-tech-mockup-kit'");

    echo "\n[SUCCESS] Migration to physical-only catalog completed!\n";

    $summaryRes = $conn->query("SELECT product_type, COUNT(*) as cnt FROM products GROUP BY product_type");
    $summary = $summaryRes ? $summaryRes->fetch_all(MYSQLI_ASSOC) : [];
    print_r($summary);

} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
