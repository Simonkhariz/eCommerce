<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\JsonBodyMiddleware;
use App\Repositories\CategoryRepository;
use App\Repositories\ProductRepository;
use App\Services\AuditService;
use App\Support\Response;
use App\Validators\CategoryValidator;
use App\Validators\ProductValidator;

/**
 * Admin Catalogue Management Controller.
 * Handles product and category CRUD operations, inventory adjustments,
 * status changes, and private digital deliverable metadata behind administrative authorization.
 */
class AdminCatalogController
{
    private ProductRepository $productRepo;
    private CategoryRepository $categoryRepo;

    public function __construct()
    {
        $this->productRepo = new ProductRepository();
        $this->categoryRepo = new CategoryRepository();
    }

    /**
     * GET /api/v1/admin/products
     * List all products with advanced filtering (status, inventory, category, search) and pagination.
     */
    public function index(): void
    {
        $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
        $perPage = isset($_GET['per_page']) ? (int) $_GET['per_page'] : 15;

        $filters = [
            'status' => $_GET['status'] ?? 'all',
            'product_type' => $_GET['product_type'] ?? 'all',
            'inventory' => $_GET['inventory'] ?? 'all',
            'category' => $_GET['category'] ?? 'all',
            'search' => $_GET['search'] ?? '',
            'sort' => $_GET['sort'] ?? 'newest',
        ];

        $result = $this->productRepo->listForAdmin($filters, $page, $perPage);
        Response::success(
            $result['items'],
            'Admin products retrieved successfully.',
            200,
            $result['pagination']
        );
    }

    /**
     * POST /api/v1/admin/products
     * Create a new product with optional variants, images, and private digital metadata.
     */
    public function createProduct(): void
    {
        $body = JsonBodyMiddleware::getBody();

        // Auto-generate SKU based on product details if omitted or blank
        if (empty($body['sku'])) {
            $body['sku'] = ProductRepository::generateSku($body);
        }

        // Auto-generate variant SKUs if omitted
        if (!empty($body['variants']) && is_array($body['variants'])) {
            foreach ($body['variants'] as $idx => &$varItem) {
                if (empty($varItem['sku'])) {
                    $varItem['sku'] = ProductRepository::generateVariantSku(
                        $body['sku'],
                        $varItem['color_name'] ?? 'Default',
                        $varItem['size'] ?? 'Standard',
                        $idx + 1
                    );
                }
            }
            unset($varItem);
        }

        $errors = ProductValidator::validate($body);
        if (!empty($errors)) {
            Response::error('Validation failed for new product.', 422, 'VALIDATION_ERROR', $errors);
        }

        $variants = $body['variants'] ?? [];
        $images = $body['images'] ?? [];

        try {
            $productId = $this->productRepo->create($body, $variants, $images);
            $created = $this->productRepo->findDetail((string) $productId, true);

            AuditService::record(null, 'PRODUCT_CREATED', 'product', (string) $productId, null, [
                'name' => $body['name'],
                'sku' => $body['sku'],
                'price' => $body['base_price'],
                'status' => $body['status'] ?? 'published',
            ]);

            Response::success(
                $created,
                'Product created successfully.',
                201
            );
        } catch (\Throwable $e) {
            error_log('[Admin Product Create Failed] ' . $e->getMessage());
            Response::error('Failed to create product: ' . $e->getMessage(), 400, 'PRODUCT_CREATE_FAILED');
        }
    }

    /**
     * PUT /api/v1/admin/products/{id}
     * Update an existing product, syncing variants, images, and digital metadata.
     */
    public function updateProduct(array $params): void
    {
        $id = isset($params['id']) ? (int) $params['id'] : 0;
        if ($id <= 0) {
            Response::error('Valid product ID required.', 400, 'BAD_REQUEST');
        }

        $existing = $this->productRepo->findDetail((string) $id, true);
        if (!$existing) {
            Response::error('Product not found.', 404, 'RESOURCE_NOT_FOUND');
        }

        $body = JsonBodyMiddleware::getBody();
        $errors = ProductValidator::validate($body, true);

        if (!empty($errors)) {
            Response::error('Validation failed.', 422, 'VALIDATION_ERROR', $errors);
        }

        $variants = array_key_exists('variants', $body) ? $body['variants'] : null;
        $images = array_key_exists('images', $body) ? $body['images'] : null;

        $mergedData = array_merge($existing, $body);
        $this->productRepo->update($id, $mergedData, $variants, $images);
        $updated = $this->productRepo->findDetail((string) $id, true);

        AuditService::record(null, 'PRODUCT_UPDATED', 'product', (string) $id, [
            'name' => $existing['name'],
            'price' => $existing['base_price'],
            'sku' => $existing['sku'],
        ], [
            'name' => $updated['name'],
            'price' => $updated['base_price'],
            'sku' => $updated['sku'],
        ]);

        Response::success($updated, 'Product updated successfully.');
    }

    /**
     * PATCH /api/v1/admin/products/{id}/status
     * Quick status change (draft, published, archived) with audit log.
     */
    public function updateStatus(array $params): void
    {
        $id = isset($params['id']) ? (int) $params['id'] : 0;
        if ($id <= 0) {
            Response::error('Valid product ID required.', 400, 'BAD_REQUEST');
        }

        $body = JsonBodyMiddleware::getBody();
        $status = trim((string) ($body['status'] ?? ''));

        if (!in_array($status, ['draft', 'published', 'archived'], true)) {
            Response::error("Invalid status. Allowed values: 'draft', 'published', 'archived'.", 422, 'VALIDATION_ERROR');
        }

        $existing = $this->productRepo->findDetail((string) $id, true);

        try {
            $result = $this->productRepo->updateStatus($id, $status);

            AuditService::record(null, 'PRODUCT_STATUS_CHANGED', 'product', (string) $id, [
                'status' => $existing['status'] ?? null,
            ], [
                'status' => $status,
            ]);

            Response::success($result, "Product status updated to '{$status}'.");
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 400, 'UPDATE_STATUS_FAILED');
        }
    }

    /**
     * POST /api/v1/admin/inventory/adjust
     * Adjust stock quantity for a variant with reason and audit record.
     */
    public function adjustInventory(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $errors = ProductValidator::validateInventoryAdjustment($body);
        if (!empty($errors)) {
            Response::error('Validation failed for inventory adjustment.', 422, 'VALIDATION_ERROR', $errors);
        }

        $variantId = (int) $body['variant_id'];
        $adjustment = (int) $body['adjustment'];
        $reason = trim((string) $body['reason']);
        $notes = !empty($body['notes']) ? trim((string) $body['notes']) : null;

        try {
            $result = $this->productRepo->adjustVariantStock($variantId, $adjustment, $reason, $notes);

            AuditService::record(null, 'INVENTORY_ADJUSTED', 'product_variant', (string) $variantId, null, [
                'adjustment' => $adjustment,
                'reason' => $reason,
                'notes' => $notes,
            ]);

            Response::success($result, 'Inventory adjusted successfully.');
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 400, 'INVENTORY_ADJUSTMENT_FAILED');
        }
    }

    /**
     * POST /api/v1/admin/products/{id}/digital (Disabled)
     */
    public function attachDigitalDeliverable(array $params): void
    {
        Response::error('Digital products are disabled. The store operates exclusively with physical products.', 400, 'DIGITAL_PRODUCTS_DISABLED');
    }

    /**
     * DELETE /api/v1/admin/products/{id}
     * Archive an existing product.
     */
    public function deleteProduct(array $params): void
    {
        $id = isset($params['id']) ? (int) $params['id'] : 0;
        if ($id <= 0) {
            Response::error('Valid product ID required.', 400, 'BAD_REQUEST');
        }

        $this->productRepo->delete($id);

        AuditService::record(null, 'PRODUCT_DELETED', 'product', (string) $id, null, [
            'status' => 'archived',
        ]);

        Response::success(['id' => $id, 'status' => 'archived'], 'Product archived successfully.');
    }

    /**
     * POST /api/v1/admin/categories
     * Create a new category.
     */
    public function createCategory(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $errors = CategoryValidator::validate($body);
        if (!empty($errors)) {
            Response::error('Validation failed for category.', 422, 'VALIDATION_ERROR', $errors);
        }

        try {
            $catId = $this->categoryRepo->create($body);
            $created = $this->categoryRepo->findById($catId);
            Response::success($created, 'Category created successfully.', 201);
        } catch (\Throwable $e) {
            error_log('[Admin Category Create Failed] ' . $e->getMessage());
            Response::error('Failed to create category. Check that category slug is unique.', 400, 'CATEGORY_CREATE_FAILED');
        }
    }

    /**
     * PUT /api/v1/admin/categories/{id}
     * Update an existing category.
     */
    public function updateCategory(array $params): void
    {
        $id = isset($params['id']) ? (int) $params['id'] : 0;
        if ($id <= 0) {
            Response::error('Valid category ID required.', 400, 'BAD_REQUEST');
        }

        $existing = $this->categoryRepo->findById($id);
        if (!$existing) {
            Response::error('Category not found.', 404, 'RESOURCE_NOT_FOUND');
        }

        $body = JsonBodyMiddleware::getBody();
        $errors = CategoryValidator::validate($body, true);
        if (!empty($errors)) {
            Response::error('Validation failed.', 422, 'VALIDATION_ERROR', $errors);
        }

        $mergedData = array_merge($existing, $body);
        $this->categoryRepo->update($id, $mergedData);
        $updated = $this->categoryRepo->findById($id);

        Response::success($updated, 'Category updated successfully.');
    }

    /**
     * DELETE /api/v1/admin/categories/{id}
     * Deactivate a category.
     */
    public function deleteCategory(array $params): void
    {
        $id = isset($params['id']) ? (int) $params['id'] : 0;
        if ($id <= 0) {
            Response::error('Valid category ID required.', 400, 'BAD_REQUEST');
        }

        $this->categoryRepo->delete($id);
        Response::success(['id' => $id, 'is_active' => 0], 'Category deactivated successfully.');
    }

    /**
     * POST /api/v1/admin/upload-image
     * Upload an image file for product photography.
     */
    public function uploadImage(): void
    {
        if (empty($_FILES['image']) || !is_array($_FILES['image'])) {
            Response::error('No image file provided in request. Expected form field "image".', 400, 'NO_FILE_UPLOADED');
        }

        $file = $_FILES['image'];

        if ($file['error'] !== UPLOAD_ERR_OK) {
            Response::error('File upload failed with error code: ' . $file['error'], 400, 'UPLOAD_ERROR');
        }

        $allowedMimes = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/svg+xml' => 'svg',
        ];

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file['tmp_name']);

        if (!isset($allowedMimes[$mime])) {
            Response::error('Invalid image format. Allowed formats: JPEG, PNG, WebP, GIF, SVG.', 422, 'INVALID_IMAGE_TYPE');
        }

        // Limit file size to 10MB
        $maxBytes = 10 * 1024 * 1024;
        if ($file['size'] > $maxBytes) {
            Response::error('Image exceeds maximum permitted file size of 10MB.', 422, 'FILE_TOO_LARGE');
        }

        $extension = $allowedMimes[$mime];
        $safeName = 'prod_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $extension;

        $nextPublicDir = dirname(BASE_PATH) . '/public/images/products';
        if (!is_dir($nextPublicDir)) {
            @mkdir($nextPublicDir, 0777, true);
        }
        $destPath = $nextPublicDir . '/' . $safeName;

        $backendPublicDir = BASE_PATH . '/public/uploads';
        if (!is_dir($backendPublicDir)) {
            @mkdir($backendPublicDir, 0777, true);
        }
        $backupPath = $backendPublicDir . '/' . $safeName;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('Failed to move uploaded file to destination.', 500, 'FILE_SAVE_FAILED');
        }

        @copy($destPath, $backupPath);

        $imageUrl = '/images/products/' . $safeName;

        Response::success([
            'image_url' => $imageUrl,
            'file_name' => $safeName,
            'mime_type' => $mime,
            'size_bytes' => $file['size'],
        ], 'Image uploaded successfully.', 201);
    }
}
