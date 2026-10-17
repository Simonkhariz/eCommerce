<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database\Database;
use App\Middleware\JsonBodyMiddleware;
use App\Support\RateLimiter;
use App\Support\RequestContext;
use App\Support\Response;
use App\Config\Env;
use App\Services\MailService;
use Throwable;

/**
 * Controller handling remaining Admin operations across all 18 domains:
 * Inventory, Customers, Payments, Refunds, Promotions, Storefront & Reviews,
 * Outbox, Audit Logs, Settings, System Status, Email Marketing, and Admin Profile.
 */
class AdminOperationsController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    // =========================================================================
    // 1. INVENTORY OPERATIONS
    // =========================================================================

    /**
     * GET /api/v1/admin/inventory
     * Stock overview across all product variants with low-stock alerts.
     */
    public function getInventory(): void
    {
        $filter = $_GET['filter'] ?? 'all'; // all, low_stock, out_of_stock
        $search = trim($_GET['search'] ?? '');

        $sql = "
            SELECT 
                v.id,
                v.product_id,
                p.name AS product_name,
                p.slug AS product_slug,
                v.sku,
                v.size,
                v.color_name,
                v.color_hex,
                v.stock_quantity,
                v.low_stock_threshold,
                v.price_override,
                p.base_price,
                v.updated_at
            FROM `product_variants` v
            JOIN `products` p ON p.id = v.product_id
            WHERE 1=1
        ";
        $types = '';
        $params = [];

        if ($filter === 'low_stock') {
            $sql .= " AND v.stock_quantity <= v.low_stock_threshold AND v.stock_quantity > 0";
        } elseif ($filter === 'out_of_stock') {
            $sql .= " AND v.stock_quantity = 0";
        }

        if ($search !== '') {
            $sql .= " AND (p.name LIKE ? OR v.sku LIKE ?)";
            $types .= 'ss';
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        $sql .= " ORDER BY v.stock_quantity ASC, p.name ASC";

        $variants = $this->db->fetchAll($sql, $types, $params);
        Response::success($variants, 'Inventory stock list retrieved.');
    }

    /**
     * POST /api/v1/admin/inventory/adjust
     * Adjust variant stock, write movement to inventory_logs, and audit log.
     */
    public function adjustStock(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $variantId = isset($body['variant_id']) ? (int) $body['variant_id'] : 0;
        $changeAmount = isset($body['change_amount']) ? (int) $body['change_amount'] : 0;
        $reason = trim((string) ($body['reason'] ?? 'Manual stock adjustment'));

        if ($variantId <= 0 || $changeAmount === 0) {
            Response::error('Valid variant_id and non-zero change_amount are required.', 422, 'VALIDATION_ERROR');
        }

        $variant = $this->db->fetchOne("SELECT * FROM `product_variants` WHERE `id` = ?", 'i', [$variantId]);
        if (!$variant) {
            Response::error('Product variant not found.', 404, 'NOT_FOUND');
        }

        $prevStock = (int) $variant['stock_quantity'];
        $newStock = max(0, $prevStock + $changeAmount);

        $admin = RequestContext::getUser();
        $adminId = $admin ? (int) $admin['id'] : null;

        $this->db->executeUpdate("UPDATE `product_variants` SET `stock_quantity` = ? WHERE `id` = ?", 'ii', [$newStock, $variantId]);

        // Insert inventory movement log
        $this->db->execute(
            "INSERT INTO `inventory_logs` (`variant_id`, `product_id`, `previous_stock`, `new_stock`, `change_amount`, `reason`, `adjusted_by_user_id`)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            'iiiiisi',
            [$variantId, (int) $variant['product_id'], $prevStock, $newStock, $changeAmount, $reason, $adminId]
        );

        // Record audit log
        $this->recordAudit(
            $adminId,
            'INVENTORY_ADJUSTED',
            'product_variant',
            (string) $variantId,
            ['stock_quantity' => $prevStock],
            ['stock_quantity' => $newStock, 'reason' => $reason]
        );

        Response::success([
            'variant_id' => $variantId,
            'previous_stock' => $prevStock,
            'new_stock' => $newStock,
            'change_amount' => $changeAmount,
            'reason' => $reason
        ], 'Inventory stock adjusted successfully.');
    }

    /**
     * GET /api/v1/admin/inventory/logs
     * List recent inventory adjustments with reasons.
     */
    public function getInventoryLogs(): void
    {
        $logs = $this->db->fetchAll("
            SELECT 
                l.*,
                p.name AS product_name,
                v.sku AS variant_sku,
                v.size,
                v.color_name,
                u.full_name AS adjusted_by_name
            FROM `inventory_logs` l
            JOIN `products` p ON p.id = l.product_id
            JOIN `product_variants` v ON v.id = l.variant_id
            LEFT JOIN `users` u ON u.id = l.adjusted_by_user_id
            ORDER BY l.created_at DESC
            LIMIT 50
        ");
        Response::success($logs, 'Inventory movement logs retrieved.');
    }

    // =========================================================================
    // 2. CUSTOMER MANAGEMENT
    // =========================================================================

    /**
     * GET /api/v1/admin/customers
     * Search and list customers with lifetime spend and order count.
     */
    public function listCustomers(): void
    {
        $search = trim($_GET['search'] ?? '');
        $status = $_GET['status'] ?? 'all';

        $sql = "
            SELECT 
                u.id,
                u.uuid,
                u.full_name,
                u.email,
                u.phone,
                u.role,
                u.status,
                u.created_at,
                COUNT(o.id) AS total_orders,
                COALESCE(SUM(CASE WHEN o.payment_status = 'successful' OR o.order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN o.grand_total ELSE 0 END), 0) AS lifetime_spend
            FROM `users` u
            LEFT JOIN `orders` o ON o.user_id = u.id
            WHERE u.role = 'customer'
        ";
        $types = '';
        $params = [];

        if ($status !== 'all') {
            $sql .= " AND u.status = ?";
            $types .= 's';
            $params[] = $status;
        }

        if ($search !== '') {
            $sql .= " AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
            $types .= 'sss';
            $params[] = "%$search%";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        $sql .= " GROUP BY u.id, u.uuid, u.full_name, u.email, u.phone, u.role, u.status, u.created_at ORDER BY u.created_at DESC";

        $customers = $this->db->fetchAll($sql, $types, $params);
        Response::success($customers, 'Customers list retrieved.');
    }

    /**
     * GET /api/v1/admin/customers/{id}
     * Customer details including addresses and order history.
     */
    public function getCustomerDetail(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $customer = $this->db->fetchOne("
            SELECT id, uuid, full_name, email, phone, role, status, email_verified_at, created_at, updated_at
            FROM `users`
            WHERE `id` = ? AND `role` = 'customer'
        ", 'i', [$id]);

        if (!$customer) {
            Response::error('Customer not found.', 404, 'NOT_FOUND');
        }

        $addresses = $this->db->fetchAll("SELECT * FROM `addresses` WHERE `user_id` = ?", 'i', [$id]);
        $orders = $this->db->fetchAll("
            SELECT id, order_number, grand_total AS total_amount, currency, order_status, payment_status, created_at
            FROM `orders`
            WHERE `user_id` = ?
            ORDER BY created_at DESC
        ", 'i', [$id]);

        $summary = $this->db->fetchOne("
            SELECT 
                COUNT(id) AS total_orders,
                COALESCE(SUM(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN grand_total ELSE 0 END), 0) AS total_spend
            FROM `orders`
            WHERE `user_id` = ?
        ", 'i', [$id]);

        Response::success([
            'customer' => $customer,
            'summary' => $summary,
            'addresses' => $addresses,
            'orders' => $orders
        ], 'Customer details retrieved.');
    }

    /**
     * PATCH /api/v1/admin/customers/{id}/status
     * Suspend or reactivate customer with audit trail.
     */
    public function updateCustomerStatus(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $body = JsonBodyMiddleware::getBody();
        $status = $body['status'] ?? '';

        if (!in_array($status, ['active', 'suspended', 'unverified'], true)) {
            Response::error('Invalid customer status.', 422, 'INVALID_STATUS');
        }

        $customer = $this->db->fetchOne("SELECT id, status, full_name, email FROM `users` WHERE `id` = ? AND `role` = 'customer'", 'i', [$id]);
        if (!$customer) {
            Response::error('Customer not found.', 404, 'NOT_FOUND');
        }

        $prevStatus = $customer['status'];
        $this->db->executeUpdate("UPDATE `users` SET `status` = ? WHERE `id` = ?", 'si', [$status, $id]);

        $admin = RequestContext::getUser();
        $this->recordAudit(
            $admin ? (int) $admin['id'] : null,
            'CUSTOMER_STATUS_CHANGED',
            'user',
            (string) $id,
            ['status' => $prevStatus],
            ['status' => $status]
        );

        Response::success(['id' => $id, 'status' => $status], "Customer status updated to $status.");
    }

    // =========================================================================
    // 3. PAYMENTS & TRANSACTIONS
    // =========================================================================

    /**
     * GET /api/v1/admin/payments
     * List all payment transactions across Kora, Monnify, and WhatsApp agent.
     */
    public function listPayments(): void
    {
        $gateway = $_GET['gateway'] ?? 'all';
        $status = $_GET['status'] ?? 'all';
        $search = trim($_GET['search'] ?? '');

        $sql = "
            SELECT 
                p.id,
                p.provider_reference AS payment_reference,
                p.provider AS gateway,
                p.provider_reference AS gateway_reference,
                p.amount,
                p.currency,
                p.status,
                p.created_at,
                p.updated_at,
                o.order_number,
                COALESCE(u.full_name, JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_snapshot, '$.full_name')), 'Customer') AS customer_name,
                COALESCE(u.email, o.guest_email) AS customer_email,
                o.payment_status AS order_payment_status
            FROM `payments` p
            LEFT JOIN `orders` o ON o.id = p.order_id
            LEFT JOIN `users` u ON u.id = o.user_id
            WHERE 1=1
        ";
        $types = '';
        $params = [];

        if ($gateway !== 'all') {
            $sql .= " AND p.provider = ?";
            $types .= 's';
            $params[] = $gateway;
        }

        if ($status !== 'all') {
            $sql .= " AND p.status = ?";
            $types .= 's';
            $params[] = $status;
        }

        if ($search !== '') {
            $sql .= " AND (p.provider_reference LIKE ? OR o.order_number LIKE ? OR o.guest_email LIKE ?)";
            $types .= 'sss';
            $params[] = "%$search%";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        $sql .= " ORDER BY p.created_at DESC LIMIT 100";

        $transactions = $this->db->fetchAll($sql, $types, $params);
        Response::success($transactions, 'Payment transactions retrieved.');
    }

    // =========================================================================
    // 4. REFUNDS MANAGEMENT
    // =========================================================================

    /**
     * GET /api/v1/admin/refunds
     * List refund requests and completed records.
     */
    public function listRefunds(): void
    {
        $refunds = $this->db->fetchAll("
            SELECT 
                r.*,
                o.order_number,
                COALESCE(u.full_name, JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_snapshot, '$.full_name')), 'Customer') AS customer_name,
                COALESCE(u.email, o.guest_email) AS customer_email,
                p.provider_reference AS payment_reference,
                p.provider AS gateway,
                admin_u.full_name AS processed_by_name
            FROM `refunds` r
            JOIN `orders` o ON o.id = r.order_id
            JOIN `payments` p ON p.id = r.payment_id
            LEFT JOIN `users` u ON u.id = o.user_id
            LEFT JOIN `users` admin_u ON admin_u.id = r.processed_by_user_id
            ORDER BY r.created_at DESC
        ");
        Response::success($refunds, 'Refund records retrieved.');
    }

    /**
     * POST /api/v1/admin/refunds
     * Record a manual refund or processed provider refund with full audit log.
     */
    public function createRefund(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $orderNumber = trim((string) ($body['order_number'] ?? ''));
        $amount = (float) ($body['amount'] ?? 0);
        $reason = trim((string) ($body['reason'] ?? ''));
        $providerRef = trim((string) ($body['provider_refund_reference'] ?? 'MANUAL-' . strtoupper(substr(uniqid(), 0, 8))));

        if ($orderNumber === '' || $amount <= 0 || $reason === '') {
            Response::error('Order number, amount, and reason are required.', 422, 'VALIDATION_ERROR');
        }

        $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `order_number` = ?", 's', [$orderNumber]);
        if (!$order) {
            Response::error('Order not found.', 404, 'ORDER_NOT_FOUND');
        }

        // Find primary payment
        $payment = $this->db->fetchOne("SELECT * FROM `payments` WHERE `order_id` = ? AND `status` = 'successful' ORDER BY id DESC LIMIT 1", 'i', [(int) $order['id']]);
        if (!$payment) {
            $payment = $this->db->fetchOne("SELECT * FROM `payments` WHERE `order_id` = ? ORDER BY id DESC LIMIT 1", 'i', [(int) $order['id']]);
        }

        if (!$payment) {
            Response::error('No payment record found associated with this order.', 422, 'NO_PAYMENT_FOUND');
        }

        $admin = RequestContext::getUser();
        $adminId = $admin ? (int) $admin['id'] : null;

        $this->db->execute(
            "INSERT INTO `refunds` (`payment_id`, `order_id`, `provider_refund_reference`, `amount`, `currency`, `reason`, `status`, `processed_by_user_id`)
             VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)",
            'iisdssi',
            [(int) $payment['id'], (int) $order['id'], $providerRef, $amount, $order['currency'], $reason, $adminId]
        );

        $refundId = $this->db->lastInsertId();

        // Check if total refunded equals or exceeds order total, update order status to refunded
        $totalRefundedRow = $this->db->fetchOne("SELECT COALESCE(SUM(amount), 0) AS total FROM `refunds` WHERE `order_id` = ? AND `status` = 'completed'", 'i', [(int) $order['id']]);
        if ((float) $totalRefundedRow['total'] >= (float) $order['grand_total']) {
            $this->db->executeUpdate("UPDATE `orders` SET `order_status` = 'refunded' WHERE `id` = ?", 'i', [(int) $order['id']]);
        }

        $this->recordAudit(
            $adminId,
            'REFUND_PROCESSED',
            'refund',
            (string) $refundId,
            null,
            ['order_number' => $orderNumber, 'amount' => $amount, 'reason' => $reason, 'reference' => $providerRef]
        );

        // Dispatch refund email notification
        try {
            MailService::getInstance()->sendCancellationOrRefund($order, 'refund', [
                'amount' => $amount,
                'reason' => $reason,
                'reference' => $providerRef,
            ]);
        } catch (\Throwable $e) {
            error_log('[MailService Notice] ' . $e->getMessage());
        }

        Response::success([
            'refund_id' => $refundId,
            'order_number' => $orderNumber,
            'amount' => $amount,
            'status' => 'completed',
            'reference' => $providerRef
        ], 'Refund processed and audited successfully.');
    }

    // =========================================================================
    // 5. PROMOTIONS & COUPONS
    // =========================================================================

    /**
     * GET /api/v1/admin/promotions
     */
    public function listPromotions(): void
    {
        $promotions = $this->db->fetchAll("SELECT * FROM `promotions` ORDER BY created_at DESC");
        Response::success($promotions, 'Promotions list retrieved.');
    }

    /**
     * POST /api/v1/admin/promotions
     */
    public function createPromotion(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $code = strtoupper(trim((string) ($body['code'] ?? '')));
        $description = trim((string) ($body['description'] ?? ''));
        $discountPercent = (int) ($body['discount_percent'] ?? 10);
        $maxUses = (int) ($body['max_uses'] ?? 100);
        $isActive = isset($body['is_active']) ? (int) (bool) $body['is_active'] : 1;
        $expiresAt = !empty($body['expires_at']) ? $body['expires_at'] : null;

        if ($code === '' || $discountPercent <= 0 || $discountPercent > 100) {
            Response::error('Code and valid discount percentage (1-100) are required.', 422, 'VALIDATION_ERROR');
        }

        $existing = $this->db->fetchOne("SELECT id FROM `promotions` WHERE `code` = ?", 's', [$code]);
        if ($existing) {
            Response::error("Promotion code '$code' already exists.", 422, 'CODE_EXISTS');
        }

        $this->db->execute(
            "INSERT INTO `promotions` (`code`, `description`, `discount_percent`, `max_uses`, `is_active`, `expires_at`)
             VALUES (?, ?, ?, ?, ?, ?)",
            'ssiiis',
            [$code, $description, $discountPercent, $maxUses, $isActive, $expiresAt]
        );

        $id = $this->db->lastInsertId();
        Response::success(['id' => $id, 'code' => $code], 'Promotion created successfully.', 201);
    }

    /**
     * PUT /api/v1/admin/promotions/{id}
     */
    public function updatePromotion(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $body = JsonBodyMiddleware::getBody();

        $promo = $this->db->fetchOne("SELECT * FROM `promotions` WHERE `id` = ?", 'i', [$id]);
        if (!$promo) {
            Response::error('Promotion not found.', 404, 'NOT_FOUND');
        }

        $code = isset($body['code']) ? strtoupper(trim((string) $body['code'])) : $promo['code'];
        $desc = isset($body['description']) ? trim((string) $body['description']) : $promo['description'];
        $pct = isset($body['discount_percent']) ? (int) $body['discount_percent'] : (int) $promo['discount_percent'];
        $max = isset($body['max_uses']) ? (int) $body['max_uses'] : (int) $promo['max_uses'];
        $active = isset($body['is_active']) ? (int) (bool) $body['is_active'] : (int) $promo['is_active'];

        $this->db->executeUpdate(
            "UPDATE `promotions` SET `code` = ?, `description` = ?, `discount_percent` = ?, `max_uses` = ?, `is_active` = ? WHERE `id` = ?",
            'ssiiii',
            [$code, $desc, $pct, $max, $active, $id]
        );

        Response::success(['id' => $id, 'code' => $code, 'is_active' => $active], 'Promotion updated successfully.');
    }

    /**
     * DELETE /api/v1/admin/promotions/{id}
     */
    public function deletePromotion(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $this->db->executeUpdate("DELETE FROM `promotions` WHERE `id` = ?", 'i', [$id]);
        Response::success(['id' => $id], 'Promotion deleted.');
    }

    // =========================================================================
    // 6. STOREFRONT BANNERS & REVIEWS
    // =========================================================================

    public function listBanners(): void
    {
        $banners = $this->db->fetchAll("SELECT * FROM `banners` ORDER BY display_order ASC, id ASC");
        Response::success($banners, 'Banners retrieved.');
    }

    public function createBanner(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $title = trim((string) ($body['title'] ?? ''));
        $subtitle = trim((string) ($body['subtitle'] ?? ''));
        $ctaText = trim((string) ($body['cta_text'] ?? 'Shop Now'));
        $ctaUrl = trim((string) ($body['cta_url'] ?? '/category'));
        $imageUrl = trim((string) ($body['image_url'] ?? ''));
        $isActive = isset($body['is_active']) ? (int) (bool) $body['is_active'] : 1;
        $order = (int) ($body['display_order'] ?? 1);

        if ($title === '' || $imageUrl === '') {
            Response::error('Banner title and image_url are required.', 422, 'VALIDATION_ERROR');
        }

        $this->db->execute(
            "INSERT INTO `banners` (`title`, `subtitle`, `cta_text`, `cta_url`, `image_url`, `is_active`, `display_order`)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            'sssssii',
            [$title, $subtitle, $ctaText, $ctaUrl, $imageUrl, $isActive, $order]
        );

        Response::success(['id' => $this->db->lastInsertId()], 'Banner created successfully.', 201);
    }

    public function updateBanner(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $body = JsonBodyMiddleware::getBody();

        $banner = $this->db->fetchOne("SELECT * FROM `banners` WHERE `id` = ?", 'i', [$id]);
        if (!$banner) {
            Response::error('Banner not found.', 404, 'NOT_FOUND');
        }

        $title = isset($body['title']) ? trim((string) $body['title']) : $banner['title'];
        $subtitle = isset($body['subtitle']) ? trim((string) $body['subtitle']) : $banner['subtitle'];
        $ctaText = isset($body['cta_text']) ? trim((string) $body['cta_text']) : $banner['cta_text'];
        $ctaUrl = isset($body['cta_url']) ? trim((string) $body['cta_url']) : $banner['cta_url'];
        $imageUrl = isset($body['image_url']) ? trim((string) $body['image_url']) : $banner['image_url'];
        $isActive = isset($body['is_active']) ? (int) (bool) $body['is_active'] : (int) $banner['is_active'];
        $order = isset($body['display_order']) ? (int) $body['display_order'] : (int) $banner['display_order'];

        $this->db->executeUpdate(
            "UPDATE `banners` SET `title` = ?, `subtitle` = ?, `cta_text` = ?, `cta_url` = ?, `image_url` = ?, `is_active` = ?, `display_order` = ? WHERE `id` = ?",
            'sssssiii',
            [$title, $subtitle, $ctaText, $ctaUrl, $imageUrl, $isActive, $order, $id]
        );

        Response::success(['id' => $id], 'Banner updated.');
    }

    public function deleteBanner(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $this->db->executeUpdate("DELETE FROM `banners` WHERE `id` = ?", 'i', [$id]);
        Response::success(['id' => $id], 'Banner deleted.');
    }

    public function listReviews(): void
    {
        $status = $_GET['status'] ?? 'all';
        $sql = "
            SELECT 
                r.*,
                p.name AS product_name
            FROM `reviews` r
            JOIN `products` p ON p.id = r.product_id
            WHERE 1=1
        ";
        $types = '';
        $params = [];

        if ($status !== 'all') {
            $sql .= " AND r.status = ?";
            $types .= 's';
            $params[] = $status;
        }

        $sql .= " ORDER BY r.created_at DESC";
        $reviews = $this->db->fetchAll($sql, $types, $params);
        Response::success($reviews, 'Reviews list retrieved.');
    }

    public function updateReviewStatus(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $body = JsonBodyMiddleware::getBody();
        $status = $body['status'] ?? '';

        if (!in_array($status, ['approved', 'rejected', 'pending'], true)) {
            Response::error('Invalid review status.', 422, 'VALIDATION_ERROR');
        }

        $this->db->executeUpdate("UPDATE `reviews` SET `status` = ? WHERE `id` = ?", 'si', [$status, $id]);
        Response::success(['id' => $id, 'status' => $status], "Review status changed to $status.");
    }

    // =========================================================================
    // 7. NOTIFICATIONS & EMAIL OUTBOX
    // =========================================================================

    public function listOutbox(): void
    {
        $status = $_GET['status'] ?? 'all';
        $sql = "SELECT * FROM `email_outbox` WHERE 1=1";
        $types = '';
        $params = [];

        if ($status !== 'all') {
            $sql .= " AND `status` = ?";
            $types .= 's';
            $params[] = $status;
        }

        $sql .= " ORDER BY `created_at` DESC LIMIT 100";
        $outbox = $this->db->fetchAll($sql, $types, $params);
        Response::success($outbox, 'Email outbox queue retrieved.');
    }

    public function retryOutbox(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $success = MailService::getInstance()->retryOutboxItem($id);
        if ($success) {
            Response::success(['id' => $id, 'status' => 'sent'], 'Notification re-dispatched and logged successfully.');
        } else {
            Response::error('Failed to retry notification dispatch.', 500, 'RETRY_FAILED');
        }
    }

    // =========================================================================
    // 8. AUDIT LOGS
    // =========================================================================

    public function listAuditLogs(): void
    {
        $action = $_GET['action'] ?? 'all';
        $entityType = $_GET['entity_type'] ?? 'all';

        $sql = "
            SELECT 
                a.*,
                u.full_name AS admin_name,
                u.email AS admin_email
            FROM `admin_audit_logs` a
            LEFT JOIN `users` u ON u.id = a.admin_id
            WHERE 1=1
        ";
        $types = '';
        $params = [];

        if ($action !== 'all') {
            $sql .= " AND a.action = ?";
            $types .= 's';
            $params[] = $action;
        }

        if ($entityType !== 'all') {
            $sql .= " AND a.entity_type = ?";
            $types .= 's';
            $params[] = $entityType;
        }

        $sql .= " ORDER BY a.created_at DESC LIMIT 100";
        $logs = $this->db->fetchAll($sql, $types, $params);
        Response::success($logs, 'Audit logs retrieved.');
    }

    // =========================================================================
    // 9. STORE SETTINGS
    // =========================================================================

    public function getSettings(): void
    {
        $rows = $this->db->fetchAll("SELECT * FROM `store_settings`");
        $settings = [];
        foreach ($rows as $r) {
            $key = $r['key_name'];
            $val = $r['value'];
            // Protect secrets from being displayed in plaintext
            if (stripos($key, 'secret') !== false || stripos($key, 'key') !== false && stripos($key, 'public') === false) {
                $val = '••••••••••••••••';
            }
            $settings[$key] = $val;
        }

        // Include default operational info if missing
        $defaults = [
            'store_name' => 'SHOP.CO Nigeria',
            'store_email' => 'support@shop.co.ng',
            'store_phone' => '+234 812 345 6789',
            'currency' => 'NGN',
            'currency_symbol' => '₦',
            'timezone' => 'Africa/Lagos',
            'kora_mode' => 'sandbox',
            'monnify_mode' => 'sandbox',
            'whatsapp_phone' => '+234 812 345 6789',
            'shipping_free_threshold' => '100000',
            'tax_rate_percent' => '7.5'
        ];

        foreach ($defaults as $k => $v) {
            if (!isset($settings[$k])) {
                $settings[$k] = $v;
            }
        }

        Response::success($settings, 'Store settings retrieved.');
    }

    public function updateSettings(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $admin = RequestContext::getUser();

        foreach ($body as $k => $v) {
            if (is_string($v) && (stripos($k, 'secret') !== false && $v === '••••••••••••••••')) {
                continue; // Skip masked secrets
            }
            $valStr = is_scalar($v) ? (string) $v : json_encode($v);
            $this->db->execute(
                "INSERT INTO `store_settings` (`key_name`, `value`) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
                'ss',
                [$k, $valStr]
            );
        }

        $this->recordAudit(
            $admin ? (int) $admin['id'] : null,
            'SETTINGS_UPDATED',
            'store_settings',
            'global',
            null,
            $body
        );

        Response::success($body, 'Store settings updated successfully.');
    }

    // =========================================================================
    // 10. SYSTEM STATUS & DIAGNOSTICS
    // =========================================================================

    public function getSystemStatus(): void
    {
        $dbPing = $this->db->ping();
        $uploadDir = dirname(__DIR__, 2) . '/public/uploads';
        $uploadWritable = is_dir($uploadDir) && is_writable($uploadDir);

        $status = [
            'system_health' => $dbPing['connected'] ? 'healthy' : 'degraded',
            'php_version' => PHP_VERSION,
            'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'PHP CLI / Built-in',
            'server_time' => date('Y-m-d H:i:s T'),
            'database' => [
                'connected' => $dbPing['connected'],
                'engine' => 'MySQL / MariaDB',
                'latency_ms' => $dbPing['latency_ms'] ?? 0,
            ],
            'storage' => [
                'uploads_directory_writable' => $uploadWritable,
                'path' => '/public/uploads'
            ],
            'environment' => [
                'env' => Env::get('APP_ENV', 'development'),
                'debug' => Env::bool('APP_DEBUG', true)
            ]
        ];

        Response::success($status, 'System diagnostics retrieved.');
    }

    // =========================================================================
    // 11. EMAIL MARKETING
    // =========================================================================

    public function listMarketingSubscribers(): void
    {
        $subscribers = $this->db->fetchAll("SELECT * FROM `newsletter_subscribers` ORDER BY `subscribed_at` DESC");
        $registeredUsers = $this->db->fetchAll("
            SELECT id, email, full_name, created_at
            FROM `users`
            WHERE `role` = 'customer' AND `status` = 'active'
            ORDER BY created_at DESC
        ");

        Response::success([
            'subscribers' => $subscribers,
            'registered_users' => $registeredUsers,
            'counts' => [
                'subscribers' => count($subscribers),
                'registered_users' => count($registeredUsers)
            ]
        ], 'Marketing audience lists retrieved.');
    }

    public function sendMarketingBroadcast(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $subject = trim((string) ($body['subject'] ?? ''));
        $content = trim((string) ($body['content'] ?? ''));
        $target = $body['target'] ?? 'subscribers'; // subscribers, customers, all

        if ($subject === '' || $content === '') {
            Response::error('Subject and email content are required.', 422, 'VALIDATION_ERROR');
        }

        $recipients = [];
        if ($target === 'subscribers' || $target === 'all') {
            $subs = $this->db->fetchAll("SELECT email FROM `newsletter_subscribers` WHERE `status` = 'active'");
            foreach ($subs as $s) {
                $recipients[] = $s['email'];
            }
        }
        if ($target === 'customers' || $target === 'all') {
            $custs = $this->db->fetchAll("SELECT email FROM `users` WHERE `role` = 'customer' AND `status` = 'active'");
            foreach ($custs as $c) {
                $recipients[] = $c['email'];
            }
        }

        $uniqueRecipients = array_unique(array_filter($recipients));
        $admin = RequestContext::getUser();

        // Queue into email_outbox
        foreach ($uniqueRecipients as $email) {
            $payload = json_encode(['subject' => $subject, 'content' => $content, 'target' => $target]);
            $this->db->execute(
                "INSERT INTO `email_outbox` (`recipient_email`, `subject`, `template`, `payload`, `status`)
                 VALUES (?, ?, 'marketing_broadcast', ?, 'pending')",
                'sss',
                [$email, $subject, $payload]
            );
        }

        $this->recordAudit(
            $admin ? (int) $admin['id'] : null,
            'MARKETING_BROADCAST_QUEUED',
            'email_campaign',
            $subject,
            null,
            ['recipient_count' => count($uniqueRecipients), 'target' => $target]
        );

        Response::success([
            'queued_count' => count($uniqueRecipients),
            'subject' => $subject,
            'target' => $target
        ], "Broadcast successfully queued for " . count($uniqueRecipients) . " recipients.");
    }

    /**
     * Public newsletter subscription endpoint (used by storefront footer).
     */
    public function subscribeNewsletter(): void
    {
        RateLimiter::attempt('newsletter', RequestContext::clientIp(), 10, 3600);
        $body = JsonBodyMiddleware::getBody();
        $email = strtolower(trim((string) ($body['email'] ?? '')));

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email address is required.', 422, 'INVALID_EMAIL');
        }

        $this->db->execute(
            "INSERT INTO `newsletter_subscribers` (`email`, `status`, `source`)
             VALUES (?, 'active', 'storefront_footer')
             ON DUPLICATE KEY UPDATE `status` = 'active'",
            's',
            [$email]
        );

        Response::success(['email' => $email], 'Thank you for subscribing to our newsletter!');
    }

    // =========================================================================
    // 12. ADMIN ACCOUNT PROFILE
    // =========================================================================

    public function getAdminAccount(): void
    {
        $admin = RequestContext::getUser();
        if (!$admin) {
            Response::error('Unauthenticated admin session.', 401, 'UNAUTHORIZED');
        }

        $user = $this->db->fetchOne("SELECT id, uuid, email, full_name, phone, role, created_at, updated_at FROM `users` WHERE `id` = ?", 'i', [(int) $admin['id']]);
        Response::success($user, 'Admin account details retrieved.');
    }

    public function updateAdminAccount(): void
    {
        $admin = RequestContext::getUser();
        if (!$admin) {
            Response::error('Unauthenticated admin session.', 401, 'UNAUTHORIZED');
        }

        $body = JsonBodyMiddleware::getBody();
        $fullName = trim((string) ($body['full_name'] ?? ''));
        $phone = trim((string) ($body['phone'] ?? ''));
        $currentPassword = (string) ($body['current_password'] ?? '');
        $newPassword = (string) ($body['new_password'] ?? '');

        $adminId = (int) $admin['id'];
        $user = $this->db->fetchOne("SELECT * FROM `users` WHERE `id` = ?", 'i', [$adminId]);

        if (!empty($fullName)) {
            $this->db->executeUpdate("UPDATE `users` SET `full_name` = ?, `phone` = ? WHERE `id` = ?", 'ssi', [$fullName, $phone, $adminId]);
        }

        if (!empty($newPassword)) {
            if (empty($currentPassword) || !password_verify($currentPassword, $user['password_hash'] ?? '')) {
                Response::error('Current password verification failed.', 422, 'INVALID_CURRENT_PASSWORD');
            }
            if (strlen($newPassword) < 8) {
                Response::error('New password must be at least 8 characters long.', 422, 'PASSWORD_TOO_SHORT');
            }
            $hash = password_hash($newPassword, PASSWORD_DEFAULT);
            $this->db->executeUpdate("UPDATE `users` SET `password_hash` = ? WHERE `id` = ?", 'si', [$hash, $adminId]);
        }

        $this->recordAudit(
            $adminId,
            'ADMIN_PROFILE_UPDATED',
            'user',
            (string) $adminId,
            ['full_name' => $user['full_name']],
            ['full_name' => $fullName]
        );

        Response::success(['id' => $adminId, 'full_name' => $fullName], 'Admin account updated successfully.');
    }

    // =========================================================================
    // HELPER: AUDIT LOGGING
    // =========================================================================

    private function recordAudit(?int $adminId, string $action, string $entityType, ?string $entityId, ?array $before, ?array $after): void
    {
        try {
            $beforeJson = $before !== null ? json_encode($before) : null;
            $afterJson = $after !== null ? json_encode($after) : null;
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? 'CLI', 0, 500);

            $this->db->execute(
                "INSERT INTO `admin_audit_logs` (`admin_id`, `action`, `entity_type`, `entity_id`, `before_state`, `after_state`, `ip_address`, `user_agent`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                'isssssss',
                [$adminId, $action, $entityType, $entityId, $beforeJson, $afterJson, $ip, $ua]
            );
        } catch (Throwable $e) {
            error_log('[Audit Log Record Failure] ' . $e->getMessage());
        }
    }
}
