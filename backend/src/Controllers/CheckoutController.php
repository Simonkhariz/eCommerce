<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Env;
use App\Database\Database;
use App\Middleware\JsonBodyMiddleware;
use App\Services\CheckoutService;
use App\Services\KoraService;
use App\Services\MonnifyService;
use App\Services\PaymentAttempts;
use App\Services\PaymentMethods;
use App\Support\RateLimiter;
use App\Support\RequestContext;
use App\Support\Response;
use App\Support\SessionCookie;
use App\Support\SessionGuard;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

/**
 * Controller handling public and authenticated checkout endpoints:
 * - Quote generation with live inventory, promotion and shipping rate validation
 * - Atomic transactional order creation with inventory reservation
 * - Destination shipping zone discovery
 * - Guest/customer order retrieval with token security
 */
class CheckoutController
{
    private CheckoutService $checkoutService;
    private Database $db;

    public function __construct(?CheckoutService $checkoutService = null, ?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
        $this->checkoutService = $checkoutService ?? new CheckoutService($this->db);
    }

    /**
     * Compute a verified checkout quote without creating an order.
     * POST /api/v1/checkout/quote
     */
    public function quote(): void
    {
        RateLimiter::attempt('checkout_quote', RequestContext::clientIp(), 150, 600);
        $body = JsonBodyMiddleware::getBody();

        try {
            $quote = $this->checkoutService->getQuote($body);
            Response::success($quote, 'Checkout quotation generated successfully.');
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'VALIDATION_ERROR');
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 400, 'QUOTE_ERROR');
        } catch (Throwable $e) {
            error_log('[Checkout Quote Failure] ' . $e->getMessage());
            Response::error('We could not calculate your total right now. Please try again.', 500, 'INTERNAL_SERVER_ERROR');
        }
    }

    /**
     * Current price, stock and availability for each cart line, so the cart can show
     * "price changed" / "only N left" / "no longer available" before checkout.
     * POST /api/v1/checkout/cart-check  {variant_ids: number[]}
     */
    public function cartCheck(): void
    {
        RateLimiter::attempt('cart_check', RequestContext::clientIp(), 300, 600);
        $body = JsonBodyMiddleware::getBody();
        $ids = array_slice(array_values(array_unique(array_filter(
            array_map('intval', is_array($body['variant_ids'] ?? null) ? $body['variant_ids'] : []),
            static fn (int $v): bool => $v > 0
        ))), 0, 50);

        if (empty($ids)) {
            Response::success(['lines' => []], 'Nothing to check.');
        }

        $rows = $this->db->fetchAll(
            "SELECT pv.id AS variant_id, pv.product_id, pv.sku, pv.size, pv.color_name, pv.color_hex,
                    COALESCE(NULLIF(pv.price_override, 0), p.base_price) AS unit_price, p.original_price,
                    pv.stock_quantity, p.name AS product_name, p.slug AS product_slug,
                    (pv.is_active = 1 AND p.status = 'published' AND p.product_type = 'physical') AS available
             FROM `product_variants` pv
             JOIN `products` p ON p.id = pv.product_id
             WHERE pv.id IN (" . implode(',', array_fill(0, count($ids), '?')) . ")",
            str_repeat('i', count($ids)),
            $ids
        );

        $lines = [];
        foreach ($rows as $row) {
            $lines[] = [
                'variant_id' => (int) $row['variant_id'],
                'product_id' => (int) $row['product_id'],
                'sku' => $row['sku'],
                'size' => $row['size'],
                'color_name' => $row['color_name'],
                'color_hex' => $row['color_hex'],
                'unit_price' => (float) $row['unit_price'],
                'original_price' => $row['original_price'] !== null ? (float) $row['original_price'] : null,
                'stock_quantity' => max(0, (int) $row['stock_quantity']),
                'product_name' => $row['product_name'],
                'product_slug' => $row['product_slug'],
                'available' => (bool) $row['available'],
            ];
        }

        Response::success(['lines' => $lines], 'Cart lines checked.');
    }

    /**
     * Create a pending order and reserve inventory inside a database transaction.
     * POST /api/v1/checkout/orders
     */
    public function createOrder(): void
    {
        // Order creation reserves stock, so it is throttled per client to stop inventory lock-ups.
        RateLimiter::attempt('checkout_order', RequestContext::clientIp(), 10, 600, 'Too many orders placed from this connection. Please wait a few minutes.');
        $body = JsonBodyMiddleware::getBody();

        // 1. Resolve optional authenticated customer (CSRF enforced when a session is used)
        $currentUser = $this->resolveOptionalUser(true);
        $userId = $currentUser ? (int) $currentUser['id'] : null;

        // If email was not explicitly provided in body but user is logged in, use their account email
        if (empty($body['email']) && $currentUser !== null) {
            $body['email'] = $currentUser['email'];
        }

        try {
            $idempotencyKey = (string) ($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? ($body['idempotency_key'] ?? ''));
            $order = $this->checkoutService->createOrder($body, $userId, $idempotencyKey !== '' ? $idempotencyKey : null);
            Response::success($order, 'Order placed successfully. Inventory has been reserved.', 201);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'VALIDATION_ERROR');
        } catch (\mysqli_sql_exception $e) {
            // Never surface raw SQL errors (mysqli_sql_exception extends RuntimeException).
            error_log('[Order Creation DB Failure] ' . $e->getMessage());
            Response::error('We could not place your order right now. Please try again.', 500, 'INTERNAL_SERVER_ERROR');
        } catch (RuntimeException $e) {
            // Inventory or promotion conflict raised deliberately by CheckoutService
            $code = str_contains($e->getMessage(), 'Insufficient stock') ? 'INSUFFICIENT_STOCK' : 'ORDER_CREATION_FAILED';
            Response::error($e->getMessage(), 409, $code);
        } catch (Throwable $e) {
            error_log('[Order Creation Failure] ' . $e->getMessage());
            Response::error('We could not place your order right now. Please try again.', 500, 'INTERNAL_SERVER_ERROR');
        }
    }

    /**
     * List active destination shipping zones and fees.
     * GET /api/v1/checkout/shipping-zones
     */
    public function shippingZones(): void
    {
        $zones = $this->db->fetchAll("SELECT * FROM `shipping_zones` WHERE `is_active` = 1 ORDER BY `id` ASC");

        foreach ($zones as &$zone) {
            if (is_string($zone['states_covered'])) {
                $zone['states_covered'] = json_decode($zone['states_covered'], true) ?: [];
            }
            $zone['fee'] = (float) $zone['fee'];
            $zone['is_active'] = (bool) $zone['is_active'];
        }
        unset($zone);

        $origin = $this->checkoutService->getStoreOrigin();

        Response::success([
            'zones' => $zones,
            'origin' => $origin,
        ], 'Active shipping zones retrieved.');
    }

    /**
     * Track / retrieve single order details.
     * GET /api/v1/checkout/orders/{orderNumber}
     * Accessible by:
     * - Order customer (when signed in)
     * - Guest customer with valid guest_access_token (via ?token= or X-Guest-Access-Token header)
     */
    public function show(array $params): void
    {
        $lookupCode = trim($params['orderNumber'] ?? '');
        if ($lookupCode === '') {
            Response::error('Order number or tracking code is required.', 422, 'VALIDATION_ERROR');
        }

        $notFound = 'We could not find an order matching those details. Check the order number and the email used at checkout.';

        // Unauthenticated lookups are throttled (failures only) to stop order-number/email guessing.
        $ip = RequestContext::clientIp();
        RateLimiter::guard('order_lookup_fail', $ip, 20, 900, 'Too many unsuccessful lookups. Please wait 15 minutes and try again.');

        $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `order_number` = ?", 's', [$lookupCode]);

        if ($order === null) {
            // A courier tracking number identifies the order, but never authorizes access on its own.
            $shipment = $this->db->fetchOne(
                "SELECT `order_id` FROM `shipments` WHERE `tracking_number` = ? LIMIT 1",
                's',
                [$lookupCode]
            );
            if ($shipment !== null) {
                $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [(int) $shipment['order_id']]);
            }
        }

        if ($order === null || !$this->canViewOrder($order, true)) {
            RateLimiter::hit('order_lookup_fail', $ip, 900);
            Response::error($notFound, 404, 'ORDER_NOT_FOUND');
        }

        // Fetch Order Items
        $items = $this->db->fetchAll(
            "SELECT `id`, `product_id`, `variant_id`, `product_type`, `item_name`, `sku`, `variant_options`, `unit_price`, `quantity`, `line_total`
             FROM `order_items` WHERE `order_id` = ?",
            'i',
            [(int) $order['id']]
        );

        foreach ($items as &$item) {
            $item['variant_options'] = is_string($item['variant_options']) ? json_decode($item['variant_options'], true) : $item['variant_options'];
            $item['unit_price'] = (float) $item['unit_price'];
            $item['line_total'] = (float) $item['line_total'];
        }
        unset($item);

        // Fetch Status History
        $history = $this->db->fetchAll(
            "SELECT `previous_status`, `new_status`, `created_at`
             FROM `order_status_history` WHERE `order_id` = ? ORDER BY `id` ASC",
            'i',
            [(int) $order['id']]
        );

        // Fetch Payment status (prioritize successful payment over pending/failed attempts)
        $payment = $this->db->fetchOne(
            "SELECT `provider`, `provider_reference`, `amount`, `currency`, `status`, `verified_at`
             FROM `payments` WHERE `order_id` = ? ORDER BY (`status` = 'successful') DESC, `id` DESC LIMIT 1",
            'i',
            [(int) $order['id']]
        );

        if ($payment !== null) {
            $payment['amount'] = (float) (
                (!empty($payment['amount']) && (float) $payment['amount'] > 0)
                    ? $payment['amount']
                    : ($order['grand_total'] ?? 0.0)
            );
            $payment['currency'] = !empty($payment['currency']) ? $payment['currency'] : ($order['currency'] ?? 'NGN');
        }

        // Fetch Shipment status
        $shipment = $this->db->fetchOne(
            "SELECT `id`, `carrier`, `tracking_number`, `tracking_url`, `status`, `shipped_at`, `delivered_at`, `created_at`, `updated_at`
             FROM `shipments` WHERE `order_id` = ? ORDER BY `id` DESC LIMIT 1",
            'i',
            [(int) $order['id']]
        );

        // Redact internal fields from the customer-facing response
        unset($order['guest_access_token_hash'], $order['user_id'], $order['idempotency_key'], $order['requires_attention'], $order['attention_reason']);

        $order['shipping_zone_snapshot'] = is_string($order['shipping_zone_snapshot']) ? json_decode($order['shipping_zone_snapshot'], true) : $order['shipping_zone_snapshot'];
        $order['shipping_address_snapshot'] = is_string($order['shipping_address_snapshot']) ? json_decode($order['shipping_address_snapshot'], true) : $order['shipping_address_snapshot'];
        $order['subtotal'] = (float) $order['subtotal'];
        $order['discount_amount'] = (float) $order['discount_amount'];
        $order['shipping_fee'] = (float) $order['shipping_fee'];
        $order['grand_total'] = (float) $order['grand_total'];
        $order['items'] = $items;
        $order['history'] = $history;
        $order['payment'] = $payment;
        $order['shipment'] = $shipment;
        $order['status'] = $order['order_status'] ?? 'pending_payment';

        Response::success($order, 'Order retrieved successfully.');
    }

    /**
     * Get available checkout payment methods configured for this store.
     * Monnify is first, Kora is second, Request from WhatsApp is last.
     * The admin switches methods on or off in Store settings; backend/.env can also disable one.
     * GET /api/v1/checkout/payment-methods
     */
    public function paymentMethods(): void
    {
        $status = PaymentMethods::status($this->db);
        $monnifyEnabled = $status['monnify']['enabled'];
        $koraEnabled = $status['kora']['enabled'];
        $whatsappEnabled = $status['whatsapp']['enabled'];

        $methods = [];

        // 1. Monnify (First)
        if ($monnifyEnabled) {
            $methods[] = [
                'id' => 'monnify',
                'name' => 'Monnify',
                'description' => 'Pay via Card, Bank Transfer, USSD, or Phone',
                'badge' => 'Instant & Secure',
                'is_default' => true,
            ];
        }

        // 2. Kora (Second)
        if ($koraEnabled) {
            $methods[] = [
                'id' => 'kora',
                'name' => 'Kora',
                'description' => 'Pay securely with Card, Bank Transfer, or Mobile Money',
                'badge' => 'Secure Checkout',
                'is_default' => empty($methods),
            ];
        }

        // 3. Request from WhatsApp (Last)
        if ($whatsappEnabled) {
            $methods[] = [
                'id' => 'whatsapp',
                'name' => 'Request from WhatsApp',
                'description' => 'Send your invoice directly to our support team on WhatsApp',
                'badge' => 'Manual Support',
                'is_default' => empty($methods),
            ];
        }

        Response::success([
            'methods' => $methods,
            'support_phone' => CheckoutService::supportWhatsAppPhone(),
        ], 'Payment methods retrieved.');
    }

    /**
     * Initialize payment session (Monnify or Kora) for an order.
     * POST /api/v1/checkout/orders/{orderNumber}/initialize-payment
     */
    public function initializePayment(array $params): void
    {
        $orderNumber = trim($params['orderNumber'] ?? '');
        if ($orderNumber === '') {
            Response::error('Order number is required.', 422, 'VALIDATION_ERROR');
        }

        $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `order_number` = ?", 's', [$orderNumber]);
        if ($order === null) {
            Response::error('Order not found.', 404, 'ORDER_NOT_FOUND');
        }

        RateLimiter::attempt('payment_init', RequestContext::clientIp(), 20, 600);
        $body = JsonBodyMiddleware::getBody();

        if (!$this->canViewOrder($order, false, true, (string) ($body['guest_access_token'] ?? ''))) {
            Response::error('Order not found.', 404, 'ORDER_NOT_FOUND');
        }

        // The return URL is always our own callback page; a client-supplied URL is only accepted
        // when it points back at the storefront (no open redirect). The guest token never goes in it.
        $frontendUrl = Env::frontendUrl();
        $redirectUrl = $frontendUrl . '/checkout/callback?order=' . urlencode($orderNumber);
        $requestedRedirect = trim((string) ($body['redirect_url'] ?? ''));
        if ($requestedRedirect !== '' && str_starts_with($requestedRedirect, $frontendUrl . '/')) {
            $parts = parse_url($requestedRedirect);
            parse_str($parts['query'] ?? '', $query);
            unset($query['token']);
            $query['order'] = $orderNumber;
            $redirectUrl = $frontendUrl . ($parts['path'] ?? '/checkout/callback') . '?' . http_build_query($query);
        }

        $gateway = strtolower(trim((string) ($body['gateway'] ?? '')));
        if (!in_array($gateway, ['kora', 'monnify', 'whatsapp'], true)) {
            Response::error('Choose a payment method: kora, monnify or whatsapp.', 422, 'VALIDATION_ERROR');
        }
        if (!PaymentMethods::isEnabled($gateway, $this->db)) {
            Response::error('That payment method is currently unavailable.', 422, 'PAYMENT_METHOD_DISABLED');
        }

        try {
            if ($gateway === 'monnify') {
                $result = (new MonnifyService($this->db))->initializeCheckout($orderNumber, $redirectUrl);
                Response::success($result, 'Monnify payment session initialized successfully.');
            } elseif ($gateway === 'kora') {
                $result = (new KoraService($this->db))->initializeCheckout($orderNumber, $redirectUrl);
                Response::success($result, 'Kora payment session initialized successfully.');
            } else {
                // Manual transfer arranged over WhatsApp: keep the stock reserved longer while the
                // customer pays; the admin confirms with the real transfer reference.
                $attempts = new PaymentAttempts($this->db);
                $reference = 'WA-' . $orderNumber . '-' . strtoupper(bin2hex(random_bytes(3)));
                $attempts->open($order, 'whatsapp', $reference, PaymentAttempts::manualWindowMinutes());
                $fresh = $this->db->fetchOne("SELECT `expires_at` FROM `orders` WHERE `id` = ?", 'i', [(int) $order['id']]);
                Response::success([
                    'order_number' => $orderNumber,
                    'provider' => 'whatsapp',
                    'provider_reference' => $reference,
                    'amount' => (float) $order['grand_total'],
                    'currency' => $order['currency'],
                    'status' => 'pending',
                    'expires_at' => $fresh['expires_at'] ?? null,
                    'support_phone' => CheckoutService::supportWhatsAppPhone(),
                ], 'Order reserved while you complete payment with our team on WhatsApp.');
            }
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'VALIDATION_ERROR');
        } catch (\RuntimeException $e) {
            error_log('[Payment Initialization Gateway Error] ' . $e->getMessage());
            Response::error($e->getMessage(), 502, 'GATEWAY_ERROR');
        } catch (\Throwable $e) {
            error_log('[Payment Initialization Failure] ' . $e->getMessage());
            Response::error('We could not start the payment right now. Please try again.', 500, 'INTERNAL_SERVER_ERROR');
        }
    }

    /**
     * Authoritatively verify payment status for an order across Monnify and Kora.
     * GET /api/v1/checkout/orders/{orderNumber}/verify-payment
     */
    public function verifyPayment(array $params): void
    {
        $orderNumber = trim($params['orderNumber'] ?? '');
        if ($orderNumber === '') {
            Response::error('Order number is required.', 422, 'VALIDATION_ERROR');
        }

        $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `order_number` = ?", 's', [$orderNumber]);
        if ($order === null) {
            Response::error('Order not found.', 404, 'ORDER_NOT_FOUND');
        }

        RateLimiter::attempt('payment_verify', RequestContext::clientIp(), 240, 600);

        // Query param or header reference provided by the gateway return redirect
        $customRef = trim(urldecode((string)(
            $_GET['reference'] ??
            $_GET['paymentReference'] ??
            $_GET['payment_reference'] ??
            $_GET['transactionReference'] ??
            $_GET['trxref'] ??
            $_SERVER['HTTP_X_PAYMENT_REFERENCE'] ??
            ''
        )));

        // Session owner, guest token, or the exact gateway reference returned on redirect.
        // This endpoint only reveals payment status, never addresses or contact details.
        $isAuthorized = $this->canViewOrder($order, false);
        if (!$isAuthorized && $customRef !== '') {
            $isAuthorized = $this->db->fetchOne(
                "SELECT `id` FROM `payments` WHERE `order_id` = ? AND `provider_reference` = ? LIMIT 1",
                'is',
                [(int) $order['id'], $customRef]
            ) !== null;
        }

        if (!$isAuthorized) {
            Response::error('Order not found.', 404, 'ORDER_NOT_FOUND');
        }

        // Which attempt to check: the exact reference from the gateway redirect, else the
        // successful payment, else the newest attempt.
        $payment = null;
        if ($customRef !== '') {
            $payment = $this->db->fetchOne(
                "SELECT * FROM `payments` WHERE `order_id` = ? AND `provider_reference` = ? LIMIT 1",
                'is',
                [(int) $order['id'], $customRef]
            );
        }
        if ($payment === null) {
            $payment = $this->db->fetchOne(
                "SELECT * FROM `payments` WHERE `order_id` = ?
                 ORDER BY (`status` IN ('successful', 'partially_refunded', 'refunded')) DESC, `id` DESC LIMIT 1",
                'i',
                [(int) $order['id']]
            );
        }

        if ($payment === null) {
            Response::success([
                'order_number' => $order['order_number'],
                'status' => 'not_started',
                'order_status' => $order['order_status'],
                'amount' => (float) $order['grand_total'],
                'currency' => $order['currency'],
                'expires_at' => $order['expires_at'],
                'source' => 'local_database',
            ], 'No payment has been started for this order yet.');
        }

        try {
            $provider = strtolower((string) $payment['provider']);
            if ($payment['status'] === 'pending' && $provider === 'monnify') {
                $result = (new MonnifyService($this->db))->verifyTransaction($payment['provider_reference']);
            } elseif ($payment['status'] === 'pending' && $provider === 'kora') {
                $result = (new KoraService($this->db))->verifyTransaction($payment['provider_reference']);
            } else {
                $result = [
                    'order_number' => $order['order_number'],
                    'provider_reference' => $payment['provider_reference'],
                    'provider' => $provider,
                    'status' => match ($payment['status']) {
                        'successful', 'partially_refunded', 'refunded' => 'successful',
                        'failed', 'cancelled' => 'failed',
                        default => 'pending',
                    },
                    'amount' => (float) $payment['amount'],
                    'currency' => $payment['currency'] ?: $order['currency'],
                    'verified_at' => $payment['verified_at'],
                    'source' => 'local_database',
                ];
            }

            // Always report the order's real current state from the database.
            $fresh = $this->db->fetchOne("SELECT `order_status`, `payment_status`, `expires_at` FROM `orders` WHERE `id` = ?", 'i', [(int) $order['id']]);
            $result['order_status'] = $fresh['order_status'];
            $result['order_payment_status'] = $fresh['payment_status'];
            $result['expires_at'] = $fresh['expires_at'];

            Response::success($result, 'Payment status retrieved.');
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'VALIDATION_ERROR');
        } catch (\RuntimeException $e) {
            // Gateway unreachable: report pending rather than failing the customer's status page.
            error_log('[Payment Verification Gateway Error] ' . $e->getMessage());
            Response::success([
                'order_number' => $order['order_number'],
                'provider_reference' => $payment['provider_reference'],
                'provider' => $payment['provider'],
                'status' => 'pending',
                'order_status' => $order['order_status'],
                'amount' => (float) $payment['amount'],
                'currency' => $payment['currency'] ?: $order['currency'],
                'message' => 'We could not reach the payment provider. Your payment status will update shortly.',
                'source' => 'gateway_unreachable',
            ], 'Payment status pending.');
        } catch (\Throwable $e) {
            error_log('[Payment Verification Failure] ' . $e->getMessage());
            Response::error('We could not check the payment status right now. Please try again shortly.', 500, 'INTERNAL_SERVER_ERROR');
        }
    }


    /**
     * Public endpoint to validate a promotion code server-side.
     * Enforces dates, usage limits, and active status. Computes discount safely.
     * POST /api/v1/checkout/validate-promo
     */
    public function validatePromo(): void
    {
        RateLimiter::attempt('promo_validate', RequestContext::clientIp(), 30, 600, 'Too many promo code attempts. Please wait a few minutes.');
        $body = JsonBodyMiddleware::getBody();
        $code = trim((string) ($body['code'] ?? $body['coupon_code'] ?? ''));
        $subtotal = isset($body['subtotal']) ? (float) $body['subtotal'] : 0.0;

        if ($code === '') {
            Response::error('Coupon code is required.', 422, 'VALIDATION_ERROR');
        }

        try {
            $result = $this->checkoutService->evaluateCoupon($code, $subtotal);
            Response::success([
                'valid' => true,
                'code' => $result['coupon']['code'],
                'discount_percent' => $result['coupon']['discount_percent'],
                'discount_amount' => $result['discount_amount'],
                'description' => $result['coupon']['description'],
            ], "Promo code {$result['coupon']['code']} is valid!");
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'INVALID_PROMOTION');
        } catch (Throwable $e) {
            error_log('[Promo Validation Failure] ' . $e->getMessage());
            Response::error('We could not check that code right now. Please try again.', 500, 'INTERNAL_SERVER_ERROR');
        }
    }

    /**
     * Resolve the optional signed-in customer from the customer session cookie.
     * When a session is used for a state-changing request, its CSRF token must be echoed.
     */
    private function resolveOptionalUser(bool $enforceCsrf = false): ?array
    {
        $user = RequestContext::getUser();
        if ($user !== null) {
            return $user;
        }

        $resolved = SessionGuard::resolve(SessionCookie::SCOPE_CUSTOMER);
        if ($resolved === null) {
            return null;
        }
        if ($enforceCsrf) {
            SessionGuard::enforceCsrf($resolved['session']);
        }
        return $resolved['user'];
    }

    /**
     * Whether the caller may access an order: its signed-in owner, the holder of the
     * guest access token, or (when allowed) someone who knows the full checkout email.
     */
    private function canViewOrder(array $order, bool $allowEmailMatch, bool $enforceCsrf = false, string $bodyToken = ''): bool
    {
        $currentUser = $this->resolveOptionalUser($enforceCsrf);
        if ($currentUser !== null && !empty($order['user_id']) && (int) $order['user_id'] === (int) $currentUser['id']) {
            return true;
        }

        $token = trim((string) ($_SERVER['HTTP_X_GUEST_ACCESS_TOKEN'] ?? $_GET['token'] ?? $bodyToken));
        if ($token !== '' && !empty($order['guest_access_token_hash'])
            && hash_equals((string) $order['guest_access_token_hash'], hash('sha256', $token))) {
            return true;
        }

        if ($allowEmailMatch) {
            $email = strtolower(trim((string) ($_GET['email'] ?? $_SERVER['HTTP_X_ORDER_EMAIL'] ?? '')));
            $orderEmail = strtolower(trim((string) ($order['guest_email'] ?? '')));
            if ($email !== '' && $orderEmail !== '' && hash_equals($orderEmail, $email)) {
                return true;
            }
        }

        return false;
    }
}
