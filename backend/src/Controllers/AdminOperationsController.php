<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Env;
use App\Database\Database;
use App\Middleware\JsonBodyMiddleware;
use App\Repositories\ProductRepository;
use App\Repositories\SessionRepository;
use App\Services\AuditService;
use App\Services\FulfillmentService;
use App\Services\MailService;
use App\Services\PaymentMethods;
use App\Support\PhoneNumber;
use App\Support\RateLimiter;
use App\Support\RequestContext;
use App\Support\Response;
use App\Support\SessionCookie;

/**
 * Administrative operations: inventory, customers, payments, refunds, promotions, storefront
 * content, email outbox, audit logs, settings, system status, marketing and the admin profile.
 * Every list endpoint is paginated (?page=&per_page=) and returns {items, pagination}.
 */
class AdminOperationsController
{
    private Database $db;

    /** Store settings the admin can edit, with what each one controls. */
    private const EDITABLE_SETTINGS = [
        'store_name' => 'Store name shown in emails and receipts',
        'store_contact_email' => 'Customer support email (shown at checkout and in emails)',
        'store_contact_phone' => 'Customer support phone',
        'store_whatsapp_phone' => 'WhatsApp number for payments and support. 080…, 070… and 090… numbers are saved as +234…',
        'store_origin_address' => 'Dispatch address (where parcels ship from)',
        'store_origin_city' => 'Dispatch city',
        'store_origin_state' => 'Dispatch state',
    ];

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * @return array{0: int, 1: int, 2: int} page, per_page, offset
     */
    private function paging(int $defaultPerPage = 20): array
    {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($_GET['per_page'] ?? $defaultPerPage)));
        return [$page, $perPage, ($page - 1) * $perPage];
    }

    /**
     * Run a filtered list query with LIMIT/OFFSET plus a matching COUNT(*).
     */
    private function paginate(string $selectSql, string $countSql, string $types, array $params, string $orderBy, string $message, int $defaultPerPage = 20): void
    {
        [$page, $perPage, $offset] = $this->paging($defaultPerPage);
        $total = (int) ($this->db->fetchOne($countSql, $types, $params)['total'] ?? 0);
        $items = $this->db->fetchAll(
            "{$selectSql} ORDER BY {$orderBy} LIMIT ? OFFSET ?",
            $types . 'ii',
            array_merge($params, [$perPage, $offset])
        );
        Response::paginated($items, $total, $page, $perPage, $message);
    }

    private function adminId(): ?int
    {
        $admin = RequestContext::getUser();
        return $admin ? (int) $admin['id'] : null;
    }

    // =========================================================================
    // 1. INVENTORY
    // =========================================================================

    /**
     * GET /api/v1/admin/inventory?filter=all|low_stock|out_of_stock&search=
     */
    public function getInventory(): void
    {
        $filter = $_GET['filter'] ?? 'all';
        $search = trim((string) ($_GET['search'] ?? ''));

        $where = " WHERE v.is_active = 1";
        $types = '';
        $params = [];

        if ($filter === 'low_stock') {
            $where .= " AND v.stock_quantity <= v.low_stock_threshold AND v.stock_quantity > 0";
        } elseif ($filter === 'out_of_stock') {
            $where .= " AND v.stock_quantity = 0";
        }
        if ($search !== '') {
            $where .= " AND (p.name LIKE ? OR v.sku LIKE ?)";
            $types .= 'ss';
            $params[] = "%{$search}%";
            $params[] = "%{$search}%";
        }

        $from = " FROM `product_variants` v JOIN `products` p ON p.id = v.product_id";
        $this->paginate(
            "SELECT v.id, v.product_id, p.name AS product_name, p.slug AS product_slug, p.status AS product_status,
                    v.sku, v.size, v.color_name, v.color_hex, v.stock_quantity, v.low_stock_threshold,
                    v.price_override, p.base_price, v.updated_at" . $from . $where,
            "SELECT COUNT(*) AS total" . $from . $where,
            $types,
            $params,
            "v.stock_quantity ASC, p.name ASC",
            'Inventory stock list retrieved.',
            25
        );
    }

    /**
     * GET /api/v1/admin/inventory/logs?variant_id=
     */
    public function getInventoryLogs(): void
    {
        $where = " WHERE 1=1";
        $types = '';
        $params = [];
        if (!empty($_GET['variant_id'])) {
            $where .= " AND l.variant_id = ?";
            $types .= 'i';
            $params[] = (int) $_GET['variant_id'];
        }

        $from = " FROM `inventory_logs` l
                  JOIN `products` p ON p.id = l.product_id
                  JOIN `product_variants` v ON v.id = l.variant_id
                  LEFT JOIN `users` u ON u.id = l.adjusted_by_user_id";
        $this->paginate(
            "SELECT l.*, p.name AS product_name, v.sku AS variant_sku, v.size, v.color_name, u.full_name AS adjusted_by_name" . $from . $where,
            "SELECT COUNT(*) AS total" . $from . $where,
            $types,
            $params,
            "l.created_at DESC, l.id DESC",
            'Inventory movement logs retrieved.',
            25
        );
    }

    // =========================================================================
    // 2. CUSTOMERS
    // =========================================================================

    /** Money actually received from a customer (verified payments, before refunds). */
    private const PAID_ORDER_CONDITION = "o.payment_status IN ('successful', 'partially_refunded')";

    /**
     * GET /api/v1/admin/customers?search=&status=
     */
    public function listCustomers(): void
    {
        $search = trim((string) ($_GET['search'] ?? ''));
        $status = $_GET['status'] ?? 'all';

        $where = " WHERE u.role = 'customer'";
        $types = '';
        $params = [];
        if (in_array($status, ['active', 'unverified', 'suspended'], true)) {
            $where .= " AND u.status = ?";
            $types .= 's';
            $params[] = $status;
        }
        if ($search !== '') {
            $where .= " AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
            $types .= 'sss';
            array_push($params, "%{$search}%", "%{$search}%", "%{$search}%");
        }

        $this->paginate(
            "SELECT u.id, u.uuid, u.full_name, u.email, u.phone, u.status, u.email_verified_at, u.created_at,
                    (SELECT COUNT(*) FROM `orders` o WHERE o.user_id = u.id) AS total_orders,
                    (SELECT COALESCE(SUM(o.grand_total), 0) FROM `orders` o WHERE o.user_id = u.id AND " . self::PAID_ORDER_CONDITION . ") AS lifetime_spend
             FROM `users` u" . $where,
            "SELECT COUNT(*) AS total FROM `users` u" . $where,
            $types,
            $params,
            "u.created_at DESC",
            'Customers list retrieved.'
        );
    }

    /**
     * GET /api/v1/admin/customers/{id}
     */
    public function getCustomerDetail(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $customer = $this->db->fetchOne(
            "SELECT id, uuid, full_name, email, phone, status, email_verified_at, created_at, updated_at
             FROM `users` WHERE `id` = ? AND `role` = 'customer'",
            'i',
            [$id]
        );
        if (!$customer) {
            Response::error('Customer not found.', 404, 'NOT_FOUND');
        }

        $addresses = $this->db->fetchAll("SELECT * FROM `addresses` WHERE `user_id` = ? ORDER BY is_default DESC, id ASC", 'i', [$id]);
        $orders = $this->db->fetchAll(
            "SELECT id, order_number, grand_total, currency, order_status, payment_status, created_at
             FROM `orders` WHERE `user_id` = ? ORDER BY created_at DESC LIMIT 50",
            'i',
            [$id]
        );
        $summary = $this->db->fetchOne(
            "SELECT COUNT(*) AS total_orders,
                    COALESCE(SUM(CASE WHEN o.payment_status IN ('successful', 'partially_refunded') THEN o.grand_total ELSE 0 END), 0) AS total_spend
             FROM `orders` o WHERE o.user_id = ?",
            'i',
            [$id]
        );

        Response::success([
            'customer' => $customer,
            'summary' => $summary,
            'addresses' => $addresses,
            'orders' => $orders,
        ], 'Customer details retrieved.');
    }

    /**
     * PATCH /api/v1/admin/customers/{id}/status  {status: active|suspended}
     * Suspending also signs the customer out everywhere.
     */
    public function updateCustomerStatus(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $status = (string) (JsonBodyMiddleware::getBody()['status'] ?? '');

        if (!in_array($status, ['active', 'suspended'], true)) {
            Response::error("Status must be 'active' or 'suspended'.", 422, 'INVALID_STATUS');
        }

        $customer = $this->db->fetchOne("SELECT id, status FROM `users` WHERE `id` = ? AND `role` = 'customer'", 'i', [$id]);
        if (!$customer) {
            Response::error('Customer not found.', 404, 'NOT_FOUND');
        }

        $this->db->executeUpdate("UPDATE `users` SET `status` = ? WHERE `id` = ?", 'si', [$status, $id]);
        if ($status === 'suspended') {
            (new SessionRepository())->destroyUserSessions($id);
        }

        AuditService::record($this->adminId(), 'customer.status_update', 'customer', (string) $id, ['status' => $customer['status']], ['status' => $status]);
        Response::success(['id' => $id, 'status' => $status], $status === 'suspended' ? 'Customer suspended and signed out.' : 'Customer reactivated.');
    }

    // =========================================================================
    // 3. PAYMENTS
    // =========================================================================

    /**
     * GET /api/v1/admin/payments?gateway=&status=&search=
     */
    public function listPayments(): void
    {
        $gateway = $_GET['gateway'] ?? 'all';
        $status = $_GET['status'] ?? 'all';
        $search = trim((string) ($_GET['search'] ?? ''));

        $where = " WHERE 1=1";
        $types = '';
        $params = [];
        if ($gateway !== 'all' && $gateway !== '') {
            $where .= " AND p.provider = ?";
            $types .= 's';
            $params[] = $gateway;
        }
        if ($status !== 'all' && $status !== '') {
            $where .= " AND p.status = ?";
            $types .= 's';
            $params[] = $status;
        }
        if ($search !== '') {
            $where .= " AND (p.provider_reference LIKE ? OR o.order_number LIKE ? OR o.guest_email LIKE ?)";
            $types .= 'sss';
            array_push($params, "%{$search}%", "%{$search}%", "%{$search}%");
        }

        $from = " FROM `payments` p
                  LEFT JOIN `orders` o ON o.id = p.order_id
                  LEFT JOIN `users` u ON u.id = o.user_id";
        $this->paginate(
            "SELECT p.id, p.provider_reference AS payment_reference, p.provider AS gateway, p.amount, p.amount_received,
                    p.currency, p.payment_method, p.status, p.verified_at, p.created_at, p.updated_at,
                    o.order_number, o.order_status, o.payment_status AS order_payment_status, o.requires_attention,
                    COALESCE(u.full_name, JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_snapshot, '$.full_name'))) AS customer_name,
                    COALESCE(u.email, o.guest_email) AS customer_email" . $from . $where,
            "SELECT COUNT(*) AS total" . $from . $where,
            $types,
            $params,
            "p.created_at DESC, p.id DESC",
            'Payment transactions retrieved.'
        );
    }

    // =========================================================================
    // 4. REFUNDS
    // =========================================================================

    /**
     * GET /api/v1/admin/refunds?status=
     */
    public function listRefunds(): void
    {
        $status = $_GET['status'] ?? 'all';
        $where = " WHERE 1=1";
        $types = '';
        $params = [];
        if (in_array($status, ['pending', 'completed', 'rejected'], true)) {
            $where .= " AND r.status = ?";
            $types .= 's';
            $params[] = $status;
        }

        $from = " FROM `refunds` r
                  JOIN `orders` o ON o.id = r.order_id
                  JOIN `payments` p ON p.id = r.payment_id
                  LEFT JOIN `users` u ON u.id = o.user_id
                  LEFT JOIN `users` admin_u ON admin_u.id = r.processed_by_user_id";
        $this->paginate(
            "SELECT r.*, o.order_number,
                    COALESCE(u.full_name, JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_snapshot, '$.full_name'))) AS customer_name,
                    COALESCE(u.email, o.guest_email) AS customer_email,
                    p.provider_reference AS payment_reference, p.provider AS gateway,
                    admin_u.full_name AS processed_by_name" . $from . $where,
            "SELECT COUNT(*) AS total" . $from . $where,
            $types,
            $params,
            "r.created_at DESC, r.id DESC",
            'Refund records retrieved.'
        );
    }

    /**
     * GET /api/v1/admin/refunds/eligibility?order_number=
     * What can still be refunded on an order (for the refund form).
     */
    public function refundEligibility(): void
    {
        $orderNumber = trim((string) ($_GET['order_number'] ?? ''));
        $order = $this->db->fetchOne("SELECT id, order_number, order_status, payment_status, grand_total, currency FROM `orders` WHERE `order_number` = ?", 's', [$orderNumber]);
        if (!$order) {
            Response::error('Order not found.', 404, 'ORDER_NOT_FOUND');
        }

        $payment = $this->db->fetchOne(
            "SELECT id, provider, provider_reference, amount FROM `payments`
             WHERE `order_id` = ? AND `status` IN ('successful', 'partially_refunded')
             ORDER BY `verified_at` ASC, `id` ASC LIMIT 1",
            'i',
            [(int) $order['id']]
        );
        $refunded = $payment
            ? $this->db->fetchOne(
                "SELECT COALESCE(SUM(CASE WHEN status = 'completed' THEN amount END), 0) AS completed,
                        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) AS pending
                 FROM `refunds` WHERE `payment_id` = ?",
                'i',
                [(int) $payment['id']]
            )
            : ['completed' => 0, 'pending' => 0];

        $paid = $payment ? (float) $payment['amount'] : 0.0;
        Response::success([
            'order_number' => $order['order_number'],
            'order_status' => $order['order_status'],
            'payment_status' => $order['payment_status'],
            'currency' => $order['currency'],
            'paid_amount' => $paid,
            'refunded_amount' => (float) $refunded['completed'],
            'pending_refund_amount' => (float) $refunded['pending'],
            'refundable_amount' => max(0, round($paid - (float) $refunded['completed'] - (float) $refunded['pending'], 2)),
            'payment_reference' => $payment['provider_reference'] ?? null,
            'gateway' => $payment['provider'] ?? null,
            'can_restock' => in_array($order['order_status'], ['paid', 'processing', 'returned', 'refund_pending'], true),
        ], 'Refund eligibility retrieved.');
    }

    /**
     * POST /api/v1/admin/refunds
     * Record a refund against the order's successful payment. Capped at what was paid
     * (minus earlier refunds). status 'completed' = money already returned via the gateway
     * dashboard or bank; 'pending' = approved, to be completed later.
     */
    public function createRefund(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $orderNumber = trim((string) ($body['order_number'] ?? ''));
        $amount = (float) ($body['amount'] ?? 0);
        $reason = trim((string) ($body['reason'] ?? ''));
        $status = strtolower(trim((string) ($body['status'] ?? 'completed')));
        $restock = filter_var($body['restock'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $providerRef = isset($body['provider_refund_reference']) ? (string) $body['provider_refund_reference'] : null;

        if ($orderNumber === '' || $amount <= 0 || $reason === '') {
            Response::error('Order number, amount, and reason are required.', 422, 'VALIDATION_ERROR');
        }

        $order = $this->db->fetchOne("SELECT `id` FROM `orders` WHERE `order_number` = ?", 's', [$orderNumber]);
        if (!$order) {
            Response::error('Order not found.', 404, 'ORDER_NOT_FOUND');
        }

        try {
            $refund = (new FulfillmentService($this->db))->recordRefund(
                (int) $order['id'], $amount, $reason, $status, $restock, $this->adminId(), $providerRef
            );
            Response::success($refund, $refund['status'] === 'completed'
                ? 'Refund recorded as completed.'
                : 'Refund recorded as pending. Mark it completed once the money has been returned.', 201);
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'INVALID_REFUND');
        }
    }

    /**
     * PATCH /api/v1/admin/refunds/{id}  {status: completed|rejected}
     */
    public function resolveRefund(array $params): void
    {
        $body = JsonBodyMiddleware::getBody();
        try {
            $refund = (new FulfillmentService($this->db))->resolveRefund(
                (int) ($params['id'] ?? 0),
                strtolower(trim((string) ($body['status'] ?? ''))),
                $this->adminId()
            );
            Response::success($refund, "Refund marked {$refund['status']}.");
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'INVALID_REFUND');
        }
    }

    // =========================================================================
    // 5. PROMOTIONS
    // =========================================================================

    public function listPromotions(): void
    {
        $promotions = $this->db->fetchAll("SELECT * FROM `promotions` ORDER BY created_at DESC");
        foreach ($promotions as &$p) {
            $p['is_active'] = (bool) $p['is_active'];
            $p['discount_percent'] = (int) $p['discount_percent'];
            $p['max_uses'] = (int) $p['max_uses'];
            $p['used_count'] = (int) $p['used_count'];
        }
        unset($p);
        Response::success($promotions, 'Promotions list retrieved.');
    }

    /**
     * Validate promotion input. Dates are YYYY-MM-DD; a promotion starts at the beginning of
     * its start day and ends at the end of its expiry day.
     *
     * @return array<string, mixed>
     */
    private function promotionInput(array $body, ?array $existing = null): array
    {
        $code = array_key_exists('code', $body) ? strtoupper(trim((string) $body['code'])) : ($existing['code'] ?? '');
        $description = array_key_exists('description', $body) ? trim((string) $body['description']) : ($existing['description'] ?? '');
        $percent = array_key_exists('discount_percent', $body) ? (int) $body['discount_percent'] : (int) ($existing['discount_percent'] ?? 0);
        $maxUses = array_key_exists('max_uses', $body) ? (int) $body['max_uses'] : (int) ($existing['max_uses'] ?? 0);
        $isActive = array_key_exists('is_active', $body) ? (int) (bool) $body['is_active'] : (int) ($existing['is_active'] ?? 1);

        $date = static function ($value, string $time): ?string {
            if ($value === null || $value === '') {
                return null;
            }
            $ts = strtotime(substr((string) $value, 0, 10) . ' ' . $time);
            return $ts === false ? 'invalid' : date('Y-m-d H:i:s', $ts);
        };
        $startsAt = array_key_exists('starts_at', $body) ? $date($body['starts_at'], '00:00:00') : ($existing['starts_at'] ?? null);
        $expiresAt = array_key_exists('expires_at', $body) ? $date($body['expires_at'], '23:59:59') : ($existing['expires_at'] ?? null);

        $errors = [];
        if (!preg_match('/^[A-Z0-9_-]{3,30}$/', $code)) {
            $errors['code'] = 'Use 3-30 letters, numbers, dashes or underscores.';
        }
        if ($percent < 1 || $percent > 90) {
            $errors['discount_percent'] = 'Discount must be between 1% and 90%.';
        }
        if ($maxUses < 0) {
            $errors['max_uses'] = 'Use 0 for unlimited, or a positive limit.';
        }
        if ($startsAt === 'invalid') {
            $errors['starts_at'] = 'Invalid start date.';
        }
        if ($expiresAt === 'invalid') {
            $errors['expires_at'] = 'Invalid end date.';
        }
        if (empty($errors) && $startsAt && $expiresAt && strtotime($expiresAt) < strtotime($startsAt)) {
            $errors['expires_at'] = 'The end date must be after the start date.';
        }
        if (!empty($errors)) {
            Response::error('Please fix the highlighted fields.', 422, 'VALIDATION_ERROR', $errors);
        }

        return compact('code', 'description', 'percent', 'maxUses', 'isActive', 'startsAt', 'expiresAt');
    }

    public function createPromotion(): void
    {
        $in = $this->promotionInput(JsonBodyMiddleware::getBody());

        if ($this->db->fetchOne("SELECT id FROM `promotions` WHERE `code` = ?", 's', [$in['code']])) {
            Response::error("Promotion code '{$in['code']}' already exists.", 422, 'CODE_EXISTS');
        }

        $id = (int) $this->db->insert(
            "INSERT INTO `promotions` (`code`, `description`, `discount_percent`, `max_uses`, `is_active`, `starts_at`, `expires_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            'ssiiiss',
            [$in['code'], $in['description'], $in['percent'], $in['maxUses'], $in['isActive'], $in['startsAt'], $in['expiresAt']]
        );

        AuditService::record($this->adminId(), 'promotion.create', 'promotion', (string) $id, null, $in);
        Response::success(['id' => $id, 'code' => $in['code']], 'Promotion created.', 201);
    }

    public function updatePromotion(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $promo = $this->db->fetchOne("SELECT * FROM `promotions` WHERE `id` = ?", 'i', [$id]);
        if (!$promo) {
            Response::error('Promotion not found.', 404, 'NOT_FOUND');
        }

        $in = $this->promotionInput(JsonBodyMiddleware::getBody(), $promo);
        if ($in['code'] !== $promo['code'] && $this->db->fetchOne("SELECT id FROM `promotions` WHERE `code` = ? AND id <> ?", 'si', [$in['code'], $id])) {
            Response::error("Promotion code '{$in['code']}' already exists.", 422, 'CODE_EXISTS');
        }

        $this->db->executeUpdate(
            "UPDATE `promotions`
             SET `code` = ?, `description` = ?, `discount_percent` = ?, `max_uses` = ?, `is_active` = ?, `starts_at` = ?, `expires_at` = ?
             WHERE `id` = ?",
            'ssiiissi',
            [$in['code'], $in['description'], $in['percent'], $in['maxUses'], $in['isActive'], $in['startsAt'], $in['expiresAt'], $id]
        );

        AuditService::record($this->adminId(), 'promotion.update', 'promotion', (string) $id, $promo, $in);
        Response::success(['id' => $id], 'Promotion updated.');
    }

    /**
     * DELETE /api/v1/admin/promotions/{id}
     * A code that has been used is deactivated (kept for order history); an unused one is deleted.
     */
    public function deletePromotion(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $promo = $this->db->fetchOne("SELECT * FROM `promotions` WHERE `id` = ?", 'i', [$id]);
        if (!$promo) {
            Response::error('Promotion not found.', 404, 'NOT_FOUND');
        }

        $used = (int) $promo['used_count'] > 0
            || $this->db->fetchOne("SELECT 1 AS x FROM `orders` WHERE `applied_promo_code` = ? LIMIT 1", 's', [$promo['code']]) !== null;

        if ($used) {
            $this->db->executeUpdate("UPDATE `promotions` SET `is_active` = 0 WHERE `id` = ?", 'i', [$id]);
            AuditService::record($this->adminId(), 'promotion.deactivate', 'promotion', (string) $id, $promo, ['is_active' => 0]);
            Response::success(['id' => $id, 'deleted' => false], 'This code has been used on orders, so it was deactivated instead of deleted.');
        }

        $this->db->executeUpdate("DELETE FROM `promotions` WHERE `id` = ?", 'i', [$id]);
        AuditService::record($this->adminId(), 'promotion.delete', 'promotion', (string) $id, $promo, null);
        Response::success(['id' => $id, 'deleted' => true], 'Promotion deleted.');
    }

    // =========================================================================
    // 6. STOREFRONT BANNERS & REVIEWS
    // =========================================================================

    public function listBanners(): void
    {
        Response::success($this->db->fetchAll("SELECT * FROM `banners` ORDER BY display_order ASC, id ASC"), 'Banners retrieved.');
    }

    /**
     * @return array<string, mixed>
     */
    private function bannerInput(array $body, ?array $existing = null): array
    {
        $get = static fn (string $k, $default = '') => array_key_exists($k, $body) ? trim((string) $body[$k]) : ($existing[$k] ?? $default);
        $in = [
            'title' => $get('title'),
            'subtitle' => $get('subtitle'),
            'cta_text' => $get('cta_text', 'Shop Now'),
            'cta_url' => $get('cta_url', '/category'),
            'image_url' => $get('image_url'),
            'is_active' => array_key_exists('is_active', $body) ? (int) (bool) $body['is_active'] : (int) ($existing['is_active'] ?? 1),
            'display_order' => array_key_exists('display_order', $body) ? (int) $body['display_order'] : (int) ($existing['display_order'] ?? 1),
        ];

        $errors = [];
        if ($in['title'] === '') {
            $errors['title'] = 'Title is required.';
        }
        if ($in['image_url'] === '' || !preg_match('#^(/|https://)#', $in['image_url'])) {
            $errors['image_url'] = 'Upload an image or use an https:// image URL.';
        }
        if ($in['cta_url'] !== '' && !preg_match('#^(/(?!/)|https://)#', $in['cta_url'])) {
            $errors['cta_url'] = 'Link must be a store path like /category or an https:// URL.';
        }
        if (!empty($errors)) {
            Response::error('Please fix the highlighted fields.', 422, 'VALIDATION_ERROR', $errors);
        }
        return $in;
    }

    public function createBanner(): void
    {
        $in = $this->bannerInput(JsonBodyMiddleware::getBody());
        $id = (int) $this->db->insert(
            "INSERT INTO `banners` (`title`, `subtitle`, `cta_text`, `cta_url`, `image_url`, `is_active`, `display_order`)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            'sssssii',
            [$in['title'], $in['subtitle'], $in['cta_text'], $in['cta_url'], $in['image_url'], $in['is_active'], $in['display_order']]
        );
        AuditService::record($this->adminId(), 'banner.create', 'banner', (string) $id, null, $in);
        Response::success(['id' => $id], 'Banner created.', 201);
    }

    public function updateBanner(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $banner = $this->db->fetchOne("SELECT * FROM `banners` WHERE `id` = ?", 'i', [$id]);
        if (!$banner) {
            Response::error('Banner not found.', 404, 'NOT_FOUND');
        }
        $in = $this->bannerInput(JsonBodyMiddleware::getBody(), $banner);
        $this->db->executeUpdate(
            "UPDATE `banners` SET `title` = ?, `subtitle` = ?, `cta_text` = ?, `cta_url` = ?, `image_url` = ?, `is_active` = ?, `display_order` = ? WHERE `id` = ?",
            'sssssiii',
            [$in['title'], $in['subtitle'], $in['cta_text'], $in['cta_url'], $in['image_url'], $in['is_active'], $in['display_order'], $id]
        );
        AuditService::record($this->adminId(), 'banner.update', 'banner', (string) $id, $banner, $in);
        Response::success(['id' => $id], 'Banner updated.');
    }

    public function deleteBanner(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $banner = $this->db->fetchOne("SELECT * FROM `banners` WHERE `id` = ?", 'i', [$id]);
        $this->db->executeUpdate("DELETE FROM `banners` WHERE `id` = ?", 'i', [$id]);
        AuditService::record($this->adminId(), 'banner.delete', 'banner', (string) $id, $banner, null);
        Response::success(['id' => $id], 'Banner deleted.');
    }

    public function listReviews(): void
    {
        $status = $_GET['status'] ?? 'all';
        $where = " WHERE 1=1";
        $types = '';
        $params = [];
        if (in_array($status, ['pending', 'approved', 'rejected'], true)) {
            $where .= " AND r.status = ?";
            $types .= 's';
            $params[] = $status;
        }
        $from = " FROM `reviews` r JOIN `products` p ON p.id = r.product_id";
        $this->paginate(
            "SELECT r.*, p.name AS product_name, p.slug AS product_slug" . $from . $where,
            "SELECT COUNT(*) AS total" . $from . $where,
            $types,
            $params,
            "r.created_at DESC",
            'Reviews list retrieved.'
        );
    }

    public function updateReviewStatus(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $status = (string) (JsonBodyMiddleware::getBody()['status'] ?? '');
        if (!in_array($status, ['approved', 'rejected', 'pending'], true)) {
            Response::error('Invalid review status.', 422, 'VALIDATION_ERROR');
        }

        $review = $this->db->fetchOne("SELECT `product_id`, `status` FROM `reviews` WHERE `id` = ?", 'i', [$id]);
        if ($review === null) {
            Response::error('Review not found.', 404, 'NOT_FOUND');
        }

        $this->db->executeUpdate("UPDATE `reviews` SET `status` = ? WHERE `id` = ?", 'si', [$status, $id]);
        // Keep the product's displayed rating in line with its approved reviews.
        (new ProductRepository())->refreshRating((int) $review['product_id']);
        AuditService::record($this->adminId(), 'review.moderate', 'review', (string) $id, ['status' => $review['status']], ['status' => $status]);

        Response::success(['id' => $id, 'status' => $status], "Review {$status}.");
    }

    // =========================================================================
    // 7. EMAIL OUTBOX
    // =========================================================================

    public function listOutbox(): void
    {
        $status = $_GET['status'] ?? 'all';
        $where = " WHERE 1=1";
        $types = '';
        $params = [];
        if (in_array($status, ['pending', 'sent', 'failed'], true)) {
            $where .= " AND `status` = ?";
            $types .= 's';
            $params[] = $status;
        }
        // Payloads can contain customer data; the list shows metadata only.
        $this->paginate(
            "SELECT `id`, `recipient_email`, `subject`, `template`, `status`, `transport`, `attempt_count`, `last_error`, `next_attempt_at`, `created_at`, `sent_at` FROM `email_outbox`" . $where,
            "SELECT COUNT(*) AS total FROM `email_outbox`" . $where,
            $types,
            $params,
            "`created_at` DESC, `id` DESC",
            'Email outbox retrieved.',
            25
        );
    }

    public function retryOutbox(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $result = MailService::getInstance()->retryOutboxItem($id);
        AuditService::record($this->adminId(), 'email.retry', 'email_outbox', (string) $id, null, ['ok' => $result['ok']]);
        if ($result['ok']) {
            Response::success(['id' => $id], $result['message']);
        }
        Response::error($result['message'], 422, 'RETRY_FAILED');
    }

    /**
     * POST /api/v1/admin/notifications/outbox/process
     * Deliver queued emails now (the same work as scripts/process_outbox.php, one batch).
     */
    public function processOutbox(): void
    {
        $summary = MailService::getInstance()->processQueue(50);
        AuditService::record($this->adminId(), 'email.process_queue', 'email_outbox', null, null, $summary);
        $remaining = (int) ($this->db->fetchOne("SELECT COUNT(*) AS c FROM `email_outbox` WHERE `status` = 'pending'")['c'] ?? 0);
        Response::success($summary + ['still_pending' => $remaining], $summary['processed'] === 0
            ? 'Nothing was due to send.'
            : "Processed {$summary['processed']}: {$summary['sent']} sent, {$summary['retrying']} will retry, {$summary['failed']} failed.");
    }

    // =========================================================================
    // 8. AUDIT LOGS
    // =========================================================================

    public function listAuditLogs(): void
    {
        $action = trim((string) ($_GET['action'] ?? ''));
        $entityType = trim((string) ($_GET['entity_type'] ?? ''));

        $where = " WHERE 1=1";
        $types = '';
        $params = [];
        if ($action !== '' && $action !== 'all') {
            $where .= " AND a.action = ?";
            $types .= 's';
            $params[] = $action;
        }
        if ($entityType !== '' && $entityType !== 'all') {
            $where .= " AND a.entity_type = ?";
            $types .= 's';
            $params[] = $entityType;
        }

        [$page, $perPage, $offset] = $this->paging(25);
        $from = " FROM `admin_audit_logs` a LEFT JOIN `users` u ON u.id = a.admin_id";
        $total = (int) $this->db->fetchOne("SELECT COUNT(*) AS total" . $from . $where, $types, $params)['total'];
        $items = $this->db->fetchAll(
            "SELECT a.*, u.full_name AS admin_name, u.email AS admin_email" . $from . $where . " ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?",
            $types . 'ii',
            array_merge($params, [$perPage, $offset])
        );

        Response::success([
            'items' => $items,
            'pagination' => ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'total_pages' => (int) ceil($total / $perPage)],
            'filters' => [
                'actions' => array_column($this->db->fetchAll("SELECT DISTINCT `action` FROM `admin_audit_logs` ORDER BY `action`"), 'action'),
                'entity_types' => array_column($this->db->fetchAll("SELECT DISTINCT `entity_type` FROM `admin_audit_logs` ORDER BY `entity_type`"), 'entity_type'),
            ],
        ], 'Audit logs retrieved.', 200, ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'total_pages' => (int) ceil($total / $perPage)]);
    }

    // =========================================================================
    // 9. STORE SETTINGS
    // =========================================================================

    /**
     * GET /api/v1/admin/settings
     * Editable store details plus read-only configuration (set in backend/.env, never secrets).
     */
    public function getSettings(): void
    {
        $rows = $this->db->fetchAll("SELECT `key_name`, `value` FROM `store_settings`");
        $stored = array_column($rows, 'value', 'key_name');

        $editable = [];
        foreach (self::EDITABLE_SETTINGS as $key => $help) {
            $editable[] = ['key' => $key, 'value' => $stored[$key] ?? '', 'help' => $help];
        }

        Response::success([
            'editable' => $editable,
            'readonly' => [
                'currency' => 'NGN',
                'timezone' => Env::get('APP_TIMEZONE', 'Africa/Lagos'),
                'kora_mode' => self::koraMode(),
                'monnify_mode' => self::monnifyMode(),
                'mail_mode' => self::mailMode(),
                'payment_methods' => PaymentMethods::status($this->db),
                'order_payment_window_minutes' => \App\Services\PaymentAttempts::gatewayWindowMinutes(),
                'manual_payment_window_hours' => (int) (\App\Services\PaymentAttempts::manualWindowMinutes() / 60),
            ],
        ], 'Store settings retrieved.');
    }

    /**
     * PUT /api/v1/admin/settings  {key: value, ...}  (only the editable keys)
     */
    public function updateSettings(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $errors = [];
        $changes = [];

        foreach ($body as $key => $value) {
            if (!array_key_exists($key, self::EDITABLE_SETTINGS)) {
                $errors[$key] = 'This setting cannot be changed here.';
                continue;
            }
            $value = trim((string) $value);
            if (mb_strlen($value) > 255) {
                $errors[$key] = 'Too long (255 characters maximum).';
            } elseif ($key === 'store_contact_email' && $value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                $errors[$key] = 'Enter a valid email address.';
            } elseif (in_array($key, ['store_contact_phone', 'store_whatsapp_phone'], true) && $value !== '' && PhoneNumber::toInternational($value) === null) {
                $errors[$key] = 'Enter a valid phone number, e.g. 0803 123 4567 or +234 803 123 4567.';
            } elseif ($key === 'store_whatsapp_phone' && $value !== '') {
                // Saved as +234... so wa.me links work whether the admin typed 080..., 070... or 090...
                $changes[$key] = PhoneNumber::toInternational($value);
            } elseif ($key === 'store_name' && $value === '') {
                $errors[$key] = 'Store name cannot be empty.';
            } else {
                $changes[$key] = $value;
            }
        }
        if (!empty($errors)) {
            Response::error('Please fix the highlighted settings.', 422, 'VALIDATION_ERROR', $errors);
        }

        $before = array_column(
            $this->db->fetchAll("SELECT `key_name`, `value` FROM `store_settings`"),
            'value',
            'key_name'
        );
        foreach ($changes as $key => $value) {
            $this->db->execute(
                "INSERT INTO `store_settings` (`key_name`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
                'ss',
                [$key, $value]
            );
        }

        AuditService::record(
            $this->adminId(),
            'settings.update',
            'store_settings',
            'global',
            array_intersect_key($before, $changes),
            $changes
        );
        Response::success($changes, 'Settings saved.');
    }

    /**
     * PUT /api/v1/admin/settings/payment-methods  {monnify: bool, kora: bool, whatsapp: bool}
     * Switch checkout payment methods on or off. At least one method must stay available.
     */
    public function updatePaymentMethods(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $before = PaymentMethods::adminSwitches($this->db);
        $after = $before;
        foreach (PaymentMethods::ALL as $method) {
            if (array_key_exists($method, $body)) {
                $after[$method] = filter_var($body[$method], FILTER_VALIDATE_BOOLEAN);
            }
        }

        $available = array_filter(PaymentMethods::ALL, static fn (string $m): bool => $after[$m] && PaymentMethods::serverAllows($m));
        if (count($available) === 0) {
            Response::error('Keep at least one payment method on, or customers cannot pay for orders.', 422, 'VALIDATION_ERROR');
        }

        foreach (PaymentMethods::ALL as $method) {
            if ($after[$method] === $before[$method]) {
                continue;
            }
            $this->db->execute(
                "INSERT INTO `store_settings` (`key_name`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
                'ss',
                [PaymentMethods::settingKey($method), $after[$method] ? '1' : '0']
            );
        }

        if ($after !== $before) {
            AuditService::record($this->adminId(), 'settings.payment_methods', 'store_settings', 'payment_methods', $before, $after);
        }
        Response::success(PaymentMethods::status($this->db), 'Payment methods saved.');
    }

    public static function koraMode(): string
    {
        $key = trim((string) Env::get('KORA_SECRET_KEY', ''));
        return $key === '' ? 'not_configured' : (str_starts_with($key, 'sk_live') ? 'live' : 'sandbox');
    }

    public static function monnifyMode(): string
    {
        if (trim((string) Env::get('MONNIFY_API_KEY', '')) === '' || trim((string) Env::get('MONNIFY_CONTRACT_CODE', '')) === '') {
            return 'not_configured';
        }
        return str_contains((string) Env::get('MONNIFY_API_BASE_URL', 'https://sandbox.monnify.com'), 'sandbox') ? 'sandbox' : 'live';
    }

    public static function mailMode(): string
    {
        return MailService::mode();
    }

    // =========================================================================
    // 10. SYSTEM STATUS
    // =========================================================================

    public function getSystemStatus(): void
    {
        $dbPing = $this->db->ping();
        $uploadDir = dirname(__DIR__, 2) . '/public/uploads';

        $count = fn (string $sql): int => (int) ($this->db->fetchOne($sql)['c'] ?? 0);
        $outbox = $this->db->fetchOne(
            "SELECT COALESCE(SUM(status = 'pending'), 0) AS pending, COALESCE(SUM(status = 'failed'), 0) AS failed FROM `email_outbox`"
        );
        $migrations = $this->db->fetchOne("SELECT COUNT(*) AS c, MAX(filename) AS latest FROM `schema_migrations`");

        $checks = [
            'database' => $dbPing['connected'],
            'uploads_writable' => is_dir($uploadDir) && is_writable($uploadDir),
            'kora' => self::koraMode() !== 'not_configured',
            'monnify' => self::monnifyMode() !== 'not_configured',
        ];

        Response::success([
            'system_health' => $checks['database'] && $checks['uploads_writable'] ? 'healthy' : 'degraded',
            'server_time' => date('Y-m-d H:i:s T'),
            'environment' => Env::isProduction() ? 'production' : 'development',
            'database' => ['connected' => $dbPing['connected'], 'latency_ms' => $dbPing['latency_ms'] ?? null],
            'migrations' => ['applied' => (int) ($migrations['c'] ?? 0), 'latest' => $migrations['latest'] ?? null],
            'storage' => ['uploads_writable' => $checks['uploads_writable']],
            'payments' => ['kora' => self::koraMode(), 'monnify' => self::monnifyMode()],
            'mail' => [
                'mode' => self::mailMode(),
                'outbox_pending' => (int) ($outbox['pending'] ?? 0),
                'outbox_failed' => (int) ($outbox['failed'] ?? 0),
                // A due email older than ~15 minutes means process_outbox.php is not scheduled.
                'oldest_due_minutes' => ($oldest = $this->db->fetchOne("SELECT TIMESTAMPDIFF(MINUTE, MIN(`created_at`), NOW()) AS m FROM `email_outbox` WHERE `status` = 'pending' AND (`next_attempt_at` IS NULL OR `next_attempt_at` <= NOW())")) && $oldest['m'] !== null ? (int) $oldest['m'] : null,
            ],
            'orders' => [
                'needs_attention' => $count("SELECT COUNT(*) AS c FROM `orders` WHERE `requires_attention` = 1"),
                'unpaid_overdue' => $count("SELECT COUNT(*) AS c FROM `orders` WHERE `order_status` = 'pending_payment' AND `expires_at` <= NOW()"),
                'awaiting_fulfilment' => $count("SELECT COUNT(*) AS c FROM `orders` WHERE `order_status` IN ('paid', 'processing')"),
            ],
        ], 'System diagnostics retrieved.');
    }

    // =========================================================================
    // 11. EMAIL MARKETING (opt-in subscribers only)
    // =========================================================================

    public function listMarketingSubscribers(): void
    {
        $status = $_GET['status'] ?? 'active';
        $where = " WHERE 1=1";
        $types = '';
        $params = [];
        if (in_array($status, ['active', 'unsubscribed'], true)) {
            $where .= " AND `status` = ?";
            $types .= 's';
            $params[] = $status;
        }

        [$page, $perPage, $offset] = $this->paging(25);
        $total = (int) $this->db->fetchOne("SELECT COUNT(*) AS total FROM `newsletter_subscribers`" . $where, $types, $params)['total'];
        $items = $this->db->fetchAll(
            "SELECT `id`, `email`, `status`, `source`, `subscribed_at`, `unsubscribed_at` FROM `newsletter_subscribers`" . $where . " ORDER BY `subscribed_at` DESC LIMIT ? OFFSET ?",
            $types . 'ii',
            array_merge($params, [$perPage, $offset])
        );
        $counts = $this->db->fetchOne(
            "SELECT COALESCE(SUM(status = 'active'), 0) AS active, COALESCE(SUM(status = 'unsubscribed'), 0) AS unsubscribed FROM `newsletter_subscribers`"
        );

        $pagination = ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'total_pages' => (int) ceil($total / $perPage)];
        Response::success([
            'items' => $items,
            'pagination' => $pagination,
            'counts' => ['active' => (int) $counts['active'], 'unsubscribed' => (int) $counts['unsubscribed']],
        ], 'Newsletter subscribers retrieved.', 200, $pagination);
    }

    /**
     * POST /api/v1/admin/marketing/broadcast  {subject, content, confirm_recipients}
     * Queues one email per active subscriber, each with its own unsubscribe link.
     * confirm_recipients must equal the current active-subscriber count (the admin confirmed it).
     */
    public function sendMarketingBroadcast(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $subject = trim((string) ($body['subject'] ?? ''));
        $content = trim((string) ($body['content'] ?? ''));

        if ($subject === '' || $content === '') {
            Response::error('Subject and message are required.', 422, 'VALIDATION_ERROR');
        }
        if (mb_strlen($subject) > 150) {
            Response::error('Subject is too long (150 characters maximum).', 422, 'VALIDATION_ERROR');
        }

        $recipients = $this->db->fetchAll("SELECT `email`, `unsubscribe_token` FROM `newsletter_subscribers` WHERE `status` = 'active'");
        if ((int) ($body['confirm_recipients'] ?? -1) !== count($recipients)) {
            Response::error('The subscriber count changed. Review the recipients and confirm again.', 409, 'RECIPIENTS_CHANGED', [
                'active_subscribers' => count($recipients),
            ]);
        }

        $frontend = Env::frontendUrl();
        $mail = MailService::getInstance();
        $this->db->transaction(function () use ($mail, $recipients, $subject, $content, $frontend): void {
            foreach ($recipients as $r) {
                $mail->queueBroadcast($r['email'], $subject, $content, $frontend . '/unsubscribe?token=' . $r['unsubscribe_token']);
            }
        });

        AuditService::record($this->adminId(), 'marketing.broadcast', 'email_campaign', null, null, [
            'subject' => $subject,
            'recipient_count' => count($recipients),
        ]);

        Response::success(
            ['queued_count' => count($recipients), 'mail_mode' => self::mailMode()],
            'Queued for ' . count($recipients) . ' subscribers. The outbox worker sends them in batches.'
        );
    }

    /**
     * POST /api/v1/newsletter/subscribe (public, storefront footer)
     */
    public function subscribeNewsletter(): void
    {
        RateLimiter::attempt('newsletter', RequestContext::clientIp(), 10, 3600);
        $email = strtolower(trim((string) (JsonBodyMiddleware::getBody()['email'] ?? '')));

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Please enter a valid email address.', 422, 'INVALID_EMAIL');
        }

        $this->db->execute(
            "INSERT INTO `newsletter_subscribers` (`email`, `status`, `source`, `unsubscribe_token`)
             VALUES (?, 'active', 'storefront_footer', ?)
             ON DUPLICATE KEY UPDATE `status` = 'active', `unsubscribed_at` = NULL,
                                     `unsubscribe_token` = COALESCE(`unsubscribe_token`, VALUES(`unsubscribe_token`))",
            'ss',
            [$email, bin2hex(random_bytes(16))]
        );

        Response::success(['email' => $email], "You're subscribed. Thanks!");
    }

    /**
     * POST /api/v1/newsletter/unsubscribe  {token} (public, from the link in every newsletter)
     */
    public function unsubscribeNewsletter(): void
    {
        RateLimiter::attempt('newsletter_unsub', RequestContext::clientIp(), 30, 3600);
        $token = trim((string) (JsonBodyMiddleware::getBody()['token'] ?? ''));
        if (!preg_match('/^[a-f0-9]{32}$/', $token)) {
            Response::error('This unsubscribe link is not valid.', 422, 'INVALID_TOKEN');
        }

        $sub = $this->db->fetchOne("SELECT `id`, `email`, `status` FROM `newsletter_subscribers` WHERE `unsubscribe_token` = ?", 's', [$token]);
        if ($sub === null) {
            Response::error('This unsubscribe link is not valid.', 404, 'INVALID_TOKEN');
        }
        if ($sub['status'] !== 'unsubscribed') {
            $this->db->executeUpdate(
                "UPDATE `newsletter_subscribers` SET `status` = 'unsubscribed', `unsubscribed_at` = NOW() WHERE `id` = ?",
                'i',
                [(int) $sub['id']]
            );
        }

        Response::success(['email' => $sub['email']], "You've been unsubscribed.");
    }

    // =========================================================================
    // 12. ADMIN ACCOUNT
    // =========================================================================

    public function getAdminAccount(): void
    {
        $user = $this->db->fetchOne(
            "SELECT id, uuid, email, full_name, phone, role, created_at, updated_at FROM `users` WHERE `id` = ?",
            'i',
            [(int) $this->adminId()]
        );
        Response::success($user, 'Admin account details retrieved.');
    }

    /**
     * PUT /api/v1/admin/account  {full_name, phone, current_password?, new_password?}
     * Changing the password signs out every other admin session.
     */
    public function updateAdminAccount(): void
    {
        $adminId = (int) $this->adminId();
        $body = JsonBodyMiddleware::getBody();
        $user = $this->db->fetchOne("SELECT * FROM `users` WHERE `id` = ?", 'i', [$adminId]);

        $fullName = array_key_exists('full_name', $body) ? trim((string) $body['full_name']) : $user['full_name'];
        $phone = array_key_exists('phone', $body) ? trim((string) $body['phone']) : (string) $user['phone'];
        $currentPassword = (string) ($body['current_password'] ?? '');
        $newPassword = (string) ($body['new_password'] ?? '');

        if ($fullName === '') {
            Response::error('Name cannot be empty.', 422, 'VALIDATION_ERROR', ['full_name' => 'Name cannot be empty.']);
        }

        // Validate the password change before writing anything.
        if ($newPassword !== '') {
            if ($currentPassword === '' || !password_verify($currentPassword, $user['password_hash'] ?? '')) {
                Response::error('Your current password is incorrect.', 422, 'INVALID_CURRENT_PASSWORD', ['current_password' => 'Incorrect password.']);
            }
            if (strlen($newPassword) < 10) {
                Response::error('New password must be at least 10 characters long.', 422, 'PASSWORD_TOO_SHORT', ['new_password' => 'At least 10 characters.']);
            }
        }

        $this->db->executeUpdate("UPDATE `users` SET `full_name` = ?, `phone` = ? WHERE `id` = ?", 'ssi', [$fullName, $phone ?: null, $adminId]);

        $passwordChanged = false;
        if ($newPassword !== '') {
            $this->db->executeUpdate(
                "UPDATE `users` SET `password_hash` = ? WHERE `id` = ?",
                'si',
                [password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]), $adminId]
            );

            // Sign out other admin sessions; keep this one.
            $current = SessionCookie::read(SessionCookie::SCOPE_ADMIN);
            $this->db->execute(
                "DELETE FROM `sessions` WHERE `user_id` = ? AND `id` <> ?",
                'is',
                [$adminId, hash('sha256', (string) $current)]
            );
            $passwordChanged = true;
        }

        AuditService::record(
            $adminId,
            $passwordChanged ? 'admin.password_change' : 'admin.profile_update',
            'admin',
            (string) $adminId,
            ['full_name' => $user['full_name'], 'phone' => $user['phone']],
            ['full_name' => $fullName, 'phone' => $phone]
        );

        Response::success(
            ['id' => $adminId, 'full_name' => $fullName, 'phone' => $phone],
            $passwordChanged ? 'Profile and password updated. Other sessions were signed out.' : 'Profile updated.'
        );
    }
}
