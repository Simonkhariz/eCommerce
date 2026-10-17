<?php

declare(strict_types=1);

/**
 * Step 7 Integration Test: Admin Product Management & Inventory Audits
 */

require_once __DIR__ . '/../src/autoload.php';
require_once __DIR__ . '/../src/Config/Env.php';

use App\Config\Env;
use App\Database\Database;
use App\Repositories\AuditLogRepository;
use App\Repositories\ProductRepository;
use App\Validators\ProductValidator;

echo "=== STEP 7: ADMIN PRODUCTS & INVENTORY TEST SUITE ===\n\n";

$db = Database::getInstance();
$productRepo = new ProductRepository();
$auditRepo = new AuditLogRepository();

$passed = 0;
$failed = 0;

function assertCondition(bool $cond, string $msg, &$passed, &$failed): void {
    if ($cond) {
        echo "  [PASS] {$msg}\n";
        $passed++;
    } else {
        echo "  [FAIL] {$msg}\n";
        $failed++;
    }
}

// 1. Test Validator
echo "1. Testing ProductValidator...\n";
$invalidProduct = ['name' => 'Ab', 'slug' => 'invalid slug!', 'base_price' => -10, 'sku' => ''];
$valErrors = ProductValidator::validate($invalidProduct);
assertCondition(isset($valErrors['name']), "Rejects product name < 3 chars", $passed, $failed);
assertCondition(isset($valErrors['slug']), "Rejects invalid slug with spaces or exclamation", $passed, $failed);
assertCondition(isset($valErrors['base_price']), "Rejects negative base price", $passed, $failed);
assertCondition(isset($valErrors['sku']), "Rejects empty SKU", $passed, $failed);

$invalidAdj = ['variant_id' => 0, 'adjustment' => 0, 'reason' => ''];
$adjErrors = ProductValidator::validateInventoryAdjustment($invalidAdj);
assertCondition(isset($adjErrors['variant_id']), "Rejects invalid variant_id", $passed, $failed);
assertCondition(isset($adjErrors['adjustment']), "Rejects zero adjustment", $passed, $failed);
assertCondition(isset($adjErrors['reason']), "Rejects empty adjustment reason", $passed, $failed);

// 2. Test Admin Product Listing
echo "\n2. Testing ProductRepository::listForAdmin...\n";
$listRes = $productRepo->listForAdmin(['status' => 'all'], 1, 10);
assertCondition(isset($listRes['items']) && is_array($listRes['items']), "Returns items array", $passed, $failed);
assertCondition(isset($listRes['pagination']['total']) && $listRes['pagination']['total'] > 0, "Returns positive total count", $passed, $failed);
$first = $listRes['items'][0];
assertCondition(isset($first['variants']) && is_array($first['variants']), "Enriches with variants array", $passed, $failed);
assertCondition(isset($first['images']) && is_array($first['images']), "Enriches with images array", $passed, $failed);
assertCondition(isset($first['total_stock']), "Enriches with total_stock calculation", $passed, $failed);

// 3. Test Product Creation with Variants, Images & Private Digital Deliverable
echo "\n3. Testing Product Creation...\n";
$testSku = 'TEST-STEP7-' . time();
$testSlug = 'test-step7-product-' . time();
$productPayload = [
    'name' => 'Step 7 Test Automated T-Shirt',
    'slug' => $testSlug,
    'description' => 'A test product for step 7 product administration suite.',
    'product_type' => 'physical',
    'status' => 'draft',
    'base_price' => 19500.00,
    'original_price' => 25000.00,
    'sku' => $testSku,
    'dress_style' => 'Casual',
    'is_featured' => 1,
    'is_flash_deal' => 0,
];

$variantsPayload = [
    [
        'sku' => $testSku . '-M-BLK',
        'size' => 'Medium',
        'color_name' => 'Black',
        'color_hex' => '#000000',
        'price_override' => null,
        'stock_quantity' => 25,
        'low_stock_threshold' => 5,
    ],
    [
        'sku' => $testSku . '-L-WHT',
        'size' => 'Large',
        'color_name' => 'White',
        'color_hex' => '#FFFFFF',
        'price_override' => 21000.00,
        'stock_quantity' => 4,
        'low_stock_threshold' => 5,
    ],
];

$imagesPayload = [
    ['image_url' => '/images/categories/tshirts.webp', 'alt_text' => 'Primary Test View', 'is_primary' => 1, 'display_order' => 0],
    ['image_url' => '/images/categories/shirts.webp', 'alt_text' => 'Secondary Test View', 'is_primary' => 0, 'display_order' => 1],
];

$createdId = $productRepo->create($productPayload, $variantsPayload, $imagesPayload);
assertCondition($createdId > 0, "Created physical product ID {$createdId} successfully", $passed, $failed);

// Fetch created product detail
$detail = $productRepo->findDetail((string) $createdId, true);
assertCondition($detail !== null, "Fetched created product details", $passed, $failed);
assertCondition(count($detail['variants']) === 2, "Inserted exactly 2 variants", $passed, $failed);
assertCondition(count($detail['images']) === 2, "Inserted exactly 2 images", $passed, $failed);
assertCondition($detail['product_type'] === 'physical', "Product is physical only", $passed, $failed);

// 4. Test Stock Adjustment with Audit Trail
echo "\n4. Testing Stock Adjustment & Audit Record...\n";
$variantToAdjust = $detail['variants'][0];
$variantId = (int) $variantToAdjust['id'];
$initialStock = (int) $variantToAdjust['stock_quantity'];

// Restock +15
$adjResult = $productRepo->adjustVariantStock($variantId, 15, 'restock', 'Automated test shipment PO-1001', 1);
assertCondition($adjResult['new_stock'] === $initialStock + 15, "Increased stock by 15 ({$initialStock} -> {$adjResult['new_stock']})", $passed, $failed);

// Check Audit Log entry
$auditLogs = $auditRepo->listForEntity('product_variant', (string) $variantId);
assertCondition(!empty($auditLogs), "Audit record recorded in admin_audit_logs", $passed, $failed);
$latestLog = $auditLogs[0];
assertCondition($latestLog['action'] === 'inventory_adjusted', "Audit action is 'inventory_adjusted'", $passed, $failed);
assertCondition(($latestLog['after_state']['adjustment'] ?? 0) === 15, "Audit after_state captured adjustment (+15)", $passed, $failed);
assertCondition(($latestLog['after_state']['reason'] ?? '') === 'restock', "Audit after_state captured reason ('restock')", $passed, $failed);

// Test negative stock protection
$reducedBelowZero = false;
try {
    $productRepo->adjustVariantStock($variantId, -9999, 'damage', 'Should fail');
} catch (\InvalidArgumentException $e) {
    $reducedBelowZero = true;
}
assertCondition($reducedBelowZero, "Rejects negative stock adjustment below zero", $passed, $failed);

// 5. Test Quick Status Update
echo "\n5. Testing Status Update...\n";
$statusResult = $productRepo->updateStatus($createdId, 'published', 1);
assertCondition($statusResult['status'] === 'published', "Updated status from draft to published", $passed, $failed);

// Check that published product appears in storefront list
$storefrontList = $productRepo->listPublished(['search' => $testSku]);
assertCondition($storefrontList['total'] === 1, "Published product appears on storefront query", $passed, $failed);

// 6. Test Archive / Soft-delete
echo "\n6. Testing Archiving...\n";
$productRepo->delete($createdId);
$archivedCheck = $productRepo->findDetail((string) $createdId, true);
assertCondition($archivedCheck['status'] === 'archived', "Product status is archived", $passed, $failed);

// Check that archived product does NOT appear on storefront
$storefrontAfterArchive = $productRepo->listPublished(['search' => $testSku]);
assertCondition($storefrontAfterArchive['total'] === 0, "Archived product is hidden from storefront", $passed, $failed);

// Cleanup test record
$db->execute("DELETE FROM products WHERE id = ?", "i", [$createdId]);

echo "\n============================================\n";
echo "SUMMARY: Passed: {$passed}, Failed: {$failed}\n";
echo "============================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
