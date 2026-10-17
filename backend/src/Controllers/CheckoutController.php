<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Env;
use App\Database\Database;
use App\Middleware\JsonBodyMiddleware;
use App\Repositories\SessionRepository;
use App\Repositories\UserRepository;
use App\Services\CheckoutService;
use App\Services\KoraService;
use App\Services\MonnifyService;
use App\Support\RequestContext;
use App\Support\Response;
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
            Response::error('Failed to compute checkout quote: ' . $e->getMessage(), 500, 'INTERNAL_SERVER_ERROR');
        }
    }

    /**
     * Create a pending order and reserve inventory inside a database transaction.
     * POST /api/v1/checkout/orders
     */
    public function createOrder(): void
    {
        $body = JsonBodyMiddleware::getBody();

        // 1. Resolve optional authenticated customer
        $currentUser = $this->resolveOptionalUser();
        $userId = $currentUser ? (int) $currentUser['id'] : null;

        // If email was not explicitly provided in body but user is logged in, use their account email
        if (empty($body['email']) && $currentUser !== null) {
            $body['email'] = $currentUser['email'];
        }

        try {
            $order = $this->checkoutService->createOrder($body, $userId);
            Response::success($order, 'Order placed successfully. Inventory has been reserved.', 201);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'VALIDATION_ERROR');
        } catch (RuntimeException $e) {
            // Check for inventory or promotion conflict
            $code = str_contains($e->getMessage(), 'Insufficient stock') ? 'INSUFFICIENT_STOCK' : 'ORDER_CREATION_FAILED';
            Response::error($e->getMessage(), 409, $code);
        } catch (Throwable $e) {
            error_log('[Order Creation Failure] ' . $e->getMessage());
            Response::error('Failed to place order: ' . $e->getMessage(), 500, 'INTERNAL_SERVER_ERROR');
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

        $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `order_number` = ?", 's', [$lookupCode]);
        $isTrackingLookup = false;

        if ($order === null) {
            // Check if user entered a carrier tracking code (e.g. TRK-..., GIG-..., DHL-...)
            $shipment = $this->db->fetchOne(
                "SELECT * FROM `shipments` WHERE `tracking_number` = ? LIMIT 1",
                's',
                [$lookupCode]
            );
            if ($shipment !== null) {
                $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [(int) $shipment['order_id']]);
                if ($order !== null) {
                    $isTrackingLookup = true;
                }
            }
        }

        if ($order === null) {
            Response::error('Order or carrier tracking reference not found.', 404, 'ORDER_NOT_FOUND');
        }

        // Authorization check: User, Guest Token, or Carrier Tracking Code possession
        $currentUser = $this->resolveOptionalUser();
        $isAuthorized = $isTrackingLookup;

        if ($currentUser !== null && !empty($order['user_id']) && (int) $order['user_id'] === (int) $currentUser['id']) {
            $isAuthorized = true;
        }

        if (!$isAuthorized) {
            $token = $_GET['token'] ?? $_SERVER['HTTP_X_GUEST_ACCESS_TOKEN'] ?? '';
            $token = trim((string) $token);
            if ($token !== '') {
                $tokenHash = hash('sha256', $token);
                if (hash_equals($order['guest_access_token_hash'], $tokenHash)) {
                    $isAuthorized = true;
                }
            }
        }

        // Allow guest tracking verification via matching email, phone, or payment reference
        if (!$isAuthorized) {
            $lookupEmail = trim((string) ($_GET['email'] ?? ''));
            $lookupPhone = trim((string) ($_GET['phone'] ?? ''));
            $lookupRef = trim(urldecode((string) (
                $_GET['reference'] ??
                $_GET['paymentReference'] ??
                $_GET['payment_reference'] ??
                $_GET['transactionReference'] ??
                $_GET['trxref'] ??
                $_SERVER['HTTP_X_PAYMENT_REFERENCE'] ??
                ''
            )));

            if ($lookupEmail !== '' && strcasecmp((string)$order['guest_email'], $lookupEmail) === 0) {
                $isAuthorized = true;
            } elseif ($lookupPhone !== '') {
                $rawAddress = is_string($order['shipping_address_snapshot'])
                    ? json_decode($order['shipping_address_snapshot'], true)
                    : ($order['shipping_address_snapshot'] ?? []);
                $savedDigits = preg_replace('/[^0-9]/', '', (string)($rawAddress['phone'] ?? ''));
                $inputDigits = preg_replace('/[^0-9]/', '', $lookupPhone);

                if (strlen($savedDigits) >= 7 && strlen($inputDigits) >= 7) {
                    $savedTail = substr($savedDigits, -10);
                    $inputTail = substr($inputDigits, -10);
                    if ($savedTail === $inputTail || str_ends_with($savedDigits, $inputDigits) || str_ends_with($inputDigits, $savedDigits)) {
                        $isAuthorized = true;
                    }
                }
            } elseif ($lookupRef !== '') {
                $matchingPayment = $this->db->fetchOne(
                    "SELECT `id` FROM `payments` WHERE `order_id` = ? AND `provider_reference` = ? LIMIT 1",
                    'is',
                    [(int) $order['id'], $lookupRef]
                );
                if ($matchingPayment !== null) {
                    $isAuthorized = true;
                }
            }
        }

        if (!$isAuthorized) {
            Response::error('Unauthorized access. A valid customer session, guest access token, or matching order email/phone is required.', 403, 'FORBIDDEN');
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

        // Fetch Status History
        $history = $this->db->fetchAll(
            "SELECT `previous_status`, `new_status`, `comment`, `created_at`
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

        // Redact internal guest token hash from response
        unset($order['guest_access_token_hash']);

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
     * Store admin can disable any method via environment variables.
     * GET /api/v1/checkout/payment-methods
     */
    public function paymentMethods(): void
    {
        $monnifyEnabled = filter_var(Env::get('PAYMENT_MONNIFY_ENABLED', 'true'), FILTER_VALIDATE_BOOLEAN);
        $koraEnabled = filter_var(Env::get('PAYMENT_KORA_ENABLED', 'true'), FILTER_VALIDATE_BOOLEAN);
        $whatsappEnabled = filter_var(Env::get('PAYMENT_WHATSAPP_ENABLED', 'true'), FILTER_VALIDATE_BOOLEAN);

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
            'support_phone' => Env::get('STORE_WHATSAPP_PHONE', '+234 906 670 7079'),
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

        // Verify permission: customer session or guest token
        $currentUser = $this->resolveOptionalUser();
        $isAuthorized = false;

        if ($currentUser !== null && !empty($order['user_id']) && (int) $order['user_id'] === (int) $currentUser['id']) {
            $isAuthorized = true;
        }

        $body = JsonBodyMiddleware::getBody();
        $token = $_GET['token'] ?? $_SERVER['HTTP_X_GUEST_ACCESS_TOKEN'] ?? ($body['guest_access_token'] ?? '');
        $token = trim((string) $token);

        if (!$isAuthorized && $token !== '') {
            $tokenHash = hash('sha256', $token);
            if (hash_equals($order['guest_access_token_hash'], $tokenHash)) {
                $isAuthorized = true;
            }
        }

        if (!$isAuthorized) {
            Response::error('Unauthorized access. A valid customer session or guest access token is required to initialize payment.', 403, 'FORBIDDEN');
        }

        $redirectUrl = isset($body['redirect_url']) ? trim((string) $body['redirect_url']) : null;
        if (empty($redirectUrl)) {
            $frontendUrl = $_ENV['FRONTEND_URL'] ?? 'http://localhost:3000';
            $redirectUrl = rtrim($frontendUrl, '/') . '/checkout/callback?order=' . urlencode($orderNumber);
            if ($token !== '') {
                $redirectUrl .= '&token=' . urlencode($token);
            }
        } else {
            if ($token !== '' && !str_contains($redirectUrl, 'token=')) {
                $separator = str_contains($redirectUrl, '?') ? '&' : '?';
                $redirectUrl .= $separator . 'token=' . urlencode($token);
            }
            if (!str_contains($redirectUrl, 'order=')) {
                $separator = str_contains($redirectUrl, '?') ? '&' : '?';
                $redirectUrl .= $separator . 'order=' . urlencode($orderNumber);
            }
        }

        $gateway = strtolower(trim((string) ($body['gateway'] ?? 'monnify')));
        if ($gateway !== 'kora' && $gateway !== 'monnify') {
            $gateway = 'monnify';
        }

        try {
            if ($gateway === 'monnify') {
                $monnifyService = new MonnifyService($this->db);
                $result = $monnifyService->initializeCheckout($orderNumber, $redirectUrl);
                Response::success($result, 'Monnify payment session initialized successfully.');
            } else {
                $koraService = new KoraService($this->db);
                $result = $koraService->initializeCheckout($orderNumber, $redirectUrl);
                Response::success($result, 'Kora payment session initialized successfully.');
            }
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'VALIDATION_ERROR');
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 502, 'GATEWAY_ERROR');
        } catch (\Throwable $e) {
            error_log('[Payment Initialization Failure] ' . $e->getMessage());
            Response::error('Payment initialization failed: ' . $e->getMessage(), 500, 'INTERNAL_SERVER_ERROR');
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

        // Authorization check: User session, Guest Token, or valid gateway Payment Reference
        $currentUser = $this->resolveOptionalUser();
        $isAuthorized = false;

        if ($currentUser !== null && !empty($order['user_id']) && (int) $order['user_id'] === (int) $currentUser['id']) {
            $isAuthorized = true;
        }

        if (!$isAuthorized) {
            $token = $_GET['token'] ?? $_SERVER['HTTP_X_GUEST_ACCESS_TOKEN'] ?? '';
            $token = trim((string) $token);
            if ($token !== '') {
                $tokenHash = hash('sha256', $token);
                if (hash_equals($order['guest_access_token_hash'], $tokenHash)) {
                    $isAuthorized = true;
                }
            }
        }

        // Query param or header override reference if provided by gateway return
        $customRef = trim(urldecode((string)(
            $_GET['reference'] ??
            $_GET['paymentReference'] ??
            $_GET['payment_reference'] ??
            $_GET['transactionReference'] ??
            $_GET['trxref'] ??
            $_SERVER['HTTP_X_PAYMENT_REFERENCE'] ??
            ''
        )));

        // Authorize with matching provider reference from official gateway redirect
        if (!$isAuthorized && $customRef !== '') {
            $matchingPayment = $this->db->fetchOne(
                "SELECT `id`, `provider_reference` FROM `payments` WHERE `order_id` = ? AND `provider_reference` = ? LIMIT 1",
                'is',
                [(int) $order['id'], $customRef]
            );
            if ($matchingPayment !== null) {
                $isAuthorized = true;
            }
        }

        if (!$isAuthorized) {
            Response::error('Unauthorized access. A valid customer session, guest access token, or payment reference is required.', 403, 'FORBIDDEN');
        }

        // Retrieve payment record for this order
        $payment = null;

        // 1. If order is already confirmed paid, prioritize the verified successful payment
        if ($order['order_status'] === 'paid' || $order['payment_status'] === 'successful') {
            $payment = $this->db->fetchOne(
                "SELECT `id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `verified_at` FROM `payments` WHERE `order_id` = ? AND `status` = 'successful' ORDER BY `id` DESC LIMIT 1",
                'i',
                [(int) $order['id']]
            );
        }

        // 2. If reference was explicitly provided by gateway redirect, prioritize matching it
        if ($payment === null && $customRef !== '') {
            $payment = $this->db->fetchOne(
                "SELECT `id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `verified_at` FROM `payments` WHERE `order_id` = ? AND `provider_reference` = ? LIMIT 1",
                'is',
                [(int) $order['id'], $customRef]
            );
        }

        // 3. Fallback: prioritize successful payment first, then newest
        if ($payment === null) {
            $payment = $this->db->fetchOne(
                "SELECT `id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `verified_at` FROM `payments` WHERE `order_id` = ? ORDER BY (`status` = 'successful') DESC, `id` DESC LIMIT 1",
                'i',
                [(int) $order['id']]
            );
        }

        if ($payment === null || empty($payment['provider_reference'])) {
            Response::error('No payment session found for this order.', 404, 'PAYMENT_NOT_INITIALIZED');
        }

        // Calculate authoritative verified amount with resilient order grand_total fallback
        $verifiedAmount = (float) (
            (!empty($payment['amount']) && (float) $payment['amount'] > 0)
                ? $payment['amount']
                : ((float) ($order['grand_total'] ?? 0.0))
        );
        $verifiedCurrency = !empty($payment['currency']) ? $payment['currency'] : ($order['currency'] ?? 'NGN');

        try {
            // 1. If payment is already marked successful in MySQL, return verified state immediately
            if ($payment['status'] === 'successful' && ($order['order_status'] === 'paid' || $order['payment_status'] === 'successful')) {
                $result = [
                    'order_number' => $order['order_number'],
                    'provider_reference' => $payment['provider_reference'],
                    'provider' => $payment['provider'],
                    'status' => 'successful',
                    'order_status' => 'paid',
                    'amount' => $verifiedAmount,
                    'currency' => $verifiedCurrency,
                    'verified_at' => $payment['verified_at'] ?? date('Y-m-d H:i:s'),
                    'source' => 'local_database_verified',
                ];
            } else {
                $provider = strtolower(trim((string)$payment['provider']));
                if ($provider === 'monnify') {
                    $monnifyService = new MonnifyService($this->db);
                    $result = $monnifyService->verifyTransaction($payment['provider_reference']);
                } elseif ($provider === 'kora') {
                    $koraService = new KoraService($this->db);
                    $result = $koraService->verifyTransaction($payment['provider_reference']);
                } else {
                    // Manual WhatsApp confirmation
                    $result = [
                        'order_number' => $order['order_number'],
                        'provider_reference' => $payment['provider_reference'],
                        'provider' => $payment['provider'] ?: 'whatsapp',
                        'status' => $payment['status'] === 'successful' ? 'successful' : 'pending',
                        'order_status' => $order['order_status'],
                        'amount' => $verifiedAmount,
                        'currency' => $verifiedCurrency,
                        'verified_at' => $payment['verified_at'] ?? date('Y-m-d H:i:s'),
                        'source' => 'manual_confirmation',
                    ];
                }

                // Ensure returned result from gateway service never has 0 or empty amount
                if (empty($result['amount']) || (float) $result['amount'] <= 0) {
                    $result['amount'] = $verifiedAmount;
                }
                if (empty($result['currency'])) {
                    $result['currency'] = $verifiedCurrency;
                }
            }
            Response::success($result, 'Payment verified successfully.');
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422, 'VALIDATION_ERROR');
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 502, 'GATEWAY_ERROR');
        } catch (\Throwable $e) {
            error_log('[Payment Verification Failure] ' . $e->getMessage());
            Response::error('Payment verification failed: ' . $e->getMessage(), 500, 'INTERNAL_SERVER_ERROR');
        }
    }


    /**
     * Public endpoint to validate a promotion code server-side.
     * Enforces dates, usage limits, and active status. Computes discount safely.
     * POST /api/v1/checkout/validate-promo
     */
    public function validatePromo(): void
    {
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
            Response::error('Failed to validate promotion: ' . $e->getMessage(), 500, 'INTERNAL_SERVER_ERROR');
        }
    }

    /**
     * Resolve optional logged in user from RequestContext or session cookie/header.
     */
    private function resolveOptionalUser(): ?array
    {
        $user = RequestContext::getUser();
        if ($user !== null) {
            return $user;
        }

        $token = null;
        if (!empty($_COOKIE['shopco_session'])) {
            $token = trim($_COOKIE['shopco_session']);
        } elseif (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
            if (str_starts_with($authHeader, 'Bearer ')) {
                $token = trim(substr($authHeader, 7));
            }
        }

        if (!empty($token)) {
            $sessionRepo = new SessionRepository();
            $session = $sessionRepo->find($token);
            if ($session !== null && !empty($session['user_id'])) {
                $userRepo = new UserRepository();
                $foundUser = $userRepo->findById((int) $session['user_id']);
                if ($foundUser !== null && ($foundUser['status'] ?? '') !== 'suspended') {
                    return $foundUser;
                }
            }
        }

        return null;
    }
}
