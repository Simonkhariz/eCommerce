<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Database\Database;
use App\Services\MailService;
use InvalidArgumentException;
use RuntimeException;

/**
 * Isolated payment service integrating Monnify Gateway:
 * - Direct Checkout SDK initialization
 * - Authoritative server-to-server transaction query/verification via API v2
 * - Webhook processing with HMAC-SHA512 cryptographic verification
 */
class MonnifyService
{
    private Database $db;
    private string $baseUrl;
    private string $apiKey;
    private string $secretKey;
    private string $walletAccountNumber;
    private string $contractCode;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();

        $this->baseUrl = rtrim(Env::get('MONNIFY_API_BASE_URL', 'https://sandbox.monnify.com'), '/');
        $this->apiKey = trim(Env::get('MONNIFY_API_KEY', ''));
        $this->secretKey = trim(Env::get('MONNIFY_SECRET_KEY', ''));
        $this->walletAccountNumber = trim(Env::get('MONNIFY_WALLET_ACCOUNT_NUMBER', ''));
        $this->contractCode = trim(Env::get('MONNIFY_CONTRACT_CODE', ''));
    }

    /**
     * Get OAuth2 bearer token from Monnify.
     */
    public function getAccessToken(): string
    {
        $url = "{$this->baseUrl}/api/v1/auth/login";
        $auth = base64_encode("{$this->apiKey}:{$this->secretKey}");

        $headers = [
            'Authorization: Basic ' . $auth,
            'Content-Type: application/json',
            'Accept: application/json',
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err || $status < 200 || $status >= 300) {
            throw new RuntimeException("Failed to authenticate with Monnify API: {$err} (HTTP {$status})");
        }

        $json = json_decode((string)$response, true);
        $token = $json['responseBody']['accessToken'] ?? null;
        if (!$token) {
            throw new RuntimeException("Missing access token in Monnify auth response.");
        }

        return $token;
    }

    /**
     * Initialize Monnify checkout for an order.
     * Records a pending payment record and returns config for Monnify Web SDK popup.
     */
    public function initializeCheckout(string|int $orderIdOrNumber, ?string $redirectUrl = null): array
    {
        $order = $this->loadOrder($orderIdOrNumber);

        if ($this->contractCode === '' || $this->contractCode === $this->walletAccountNumber) {
            throw new InvalidArgumentException(
                "Monnify Contract Code is not configured. Please copy the 10-digit Contract Code from your Monnify Dashboard (Developers > API Keys & Contracts) and set MONNIFY_CONTRACT_CODE in backend/.env."
            );
        }

        if ($order['order_status'] !== 'pending_payment' && $order['order_status'] !== 'pending') {
            throw new InvalidArgumentException("Order '{$order['order_number']}' cannot be initialized for payment. Current status: {$order['order_status']}.");
        }

        $orderId = (int) $order['id'];
        $orderNumber = $order['order_number'];
        $amount = (float) $order['grand_total'];
        $currency = strtoupper(trim($order['currency'] ?? 'NGN'));

        // Generate unique provider reference for each checkout attempt to avoid Monnify duplicate reference errors
        $providerReference = 'MNFY-' . $orderNumber . '-' . substr(bin2hex(random_bytes(4)), 0, 8);

        // Record or update pending payment in database
        $existing = $this->db->fetchOne(
            "SELECT `id`, `provider_reference`, `status` FROM `payments` WHERE `order_id` = ? AND `provider` = 'monnify' AND `status` = 'pending' ORDER BY `id` DESC LIMIT 1",
            'i',
            [$orderId]
        );

        if ($existing !== null) {
            $paymentId = (int) $existing['id'];
            $this->db->execute(
                "UPDATE `payments` SET `provider_reference` = ?, `amount` = ?, `currency` = ?, `updated_at` = NOW() WHERE `id` = ?",
                'sdsi',
                [$providerReference, $amount, $currency, $paymentId]
            );
        } else {
            $paymentId = $this->db->insert(
                "INSERT INTO `payments` (`order_id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `created_at`, `updated_at`)
                 VALUES (?, 'monnify', ?, ?, ?, 'pending', NOW(), NOW())",
                'isds',
                [$orderId, $providerReference, $amount, $currency]
            );
        }

        $addressSnapshot = is_string($order['shipping_address_snapshot'])
            ? json_decode($order['shipping_address_snapshot'], true)
            : ($order['shipping_address_snapshot'] ?? []);

        $customerName = trim($addressSnapshot['full_name'] ?? 'Shop.co Customer');
        $customerEmail = trim($order['guest_email'] ?? 'test@shopco.ng');

        // Authoritative server-to-server transaction initialization with Monnify
        $checkoutUrl = null;
        try {
            $accessToken = $this->getAccessToken();
            $initUrl = "{$this->baseUrl}/api/v1/merchant/transactions/init-transaction";

            $initPayload = json_encode([
                'amount' => $amount,
                'customerName' => $customerName,
                'customerEmail' => $customerEmail,
                'paymentReference' => $providerReference,
                'paymentDescription' => "Order #{$orderNumber} at SHOP.CO",
                'currencyCode' => $currency,
                'contractCode' => $this->contractCode,
                'redirectUrl' => $redirectUrl,
                'paymentMethods' => ['CARD', 'ACCOUNT_TRANSFER'],
            ]);

            $ch = curl_init($initUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $initPayload);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Authorization: Bearer ' . $accessToken,
                'Content-Type: application/json',
                'Accept: application/json',
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 20);
            $initResponse = curl_exec($ch);
            $initStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($initStatus >= 200 && $initStatus < 300) {
                $initData = json_decode((string) $initResponse, true);
                if (!empty($initData['requestSuccessful'])) {
                    $checkoutUrl = $initData['responseBody']['checkoutUrl'] ?? null;
                }
            }
        } catch (\Throwable $e) {
            error_log("Monnify init-transaction warning: " . $e->getMessage());
        }

        return [
            'order_number' => $orderNumber,
            'provider' => 'monnify',
            'provider_reference' => $providerReference,
            'amount' => $amount,
            'currency' => $currency,
            'status' => 'pending',
            'checkout_url' => $checkoutUrl,
            'api_key' => $this->apiKey,
            'contract_code' => $this->contractCode,
            'customer_name' => $customerName,
            'customer_email' => $customerEmail,
            'payment_description' => "Order #{$orderNumber} at SHOP.CO",
            'is_test_mode' => str_contains($this->apiKey, 'MK_TEST'),
            'redirect_url' => $redirectUrl,
        ];
    }

    /**
     * Authoritative server-to-server query verification via Monnify API v2.
     * GET /api/v2/merchant/transactions/query?paymentReference={ref}
     */
    public function verifyTransaction(string $providerReference): array
    {
        $ref = trim($providerReference);
        if ($ref === '') {
            throw new InvalidArgumentException("Transaction reference is required for Monnify verification.");
        }

        // 1. Check local database record
        $payment = $this->db->fetchOne(
            "SELECT p.*, o.id as order_id, o.order_number, o.order_status, o.payment_status as order_payment_status, o.grand_total, o.currency as order_currency
             FROM `payments` p
             JOIN `orders` o ON p.order_id = o.id
             WHERE p.provider_reference = ?",
            's',
            [$ref]
        );

        if ($payment === null) {
            throw new InvalidArgumentException("No payment found matching provider reference '{$ref}'.");
        }

        // If already verified successful in MySQL, return cached state
        if ($payment['status'] === 'successful' && $payment['order_status'] === 'paid') {
            $verifiedAmount = (float) (
                (!empty($payment['amount']) && (float) $payment['amount'] > 0)
                    ? $payment['amount']
                    : ($payment['grand_total'] ?? 0.0)
            );
            return [
                'order_number' => $payment['order_number'],
                'provider_reference' => $ref,
                'provider' => 'monnify',
                'status' => 'successful',
                'order_status' => 'paid',
                'amount' => $verifiedAmount,
                'currency' => $payment['currency'] ?: ($payment['order_currency'] ?: 'NGN'),
                'verified_at' => $payment['verified_at'] ?? date('Y-m-d H:i:s'),
                'source' => 'local_database_cached',
            ];
        }

        // 2. Query Monnify v2 transactions query endpoint
        try {
            $token = $this->getAccessToken();
            $url = "{$this->baseUrl}/api/v2/merchant/transactions/query?paymentReference=" . urlencode($ref);

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
                'Accept: application/json',
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            $response = curl_exec($ch);
            $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            $fallbackAmount = (float) (
                (!empty($payment['amount']) && (float) $payment['amount'] > 0)
                    ? $payment['amount']
                    : ($payment['grand_total'] ?? 0.0)
            );

            if ($curlErr || $statusCode < 200 || $statusCode >= 300) {
                // If Cloudflare blocks or remote unavailable, check if reference was recorded as pending
                return [
                    'order_number' => $payment['order_number'],
                    'provider_reference' => $ref,
                    'provider' => 'monnify',
                    'status' => $payment['status'],
                    'order_status' => $payment['order_status'],
                    'amount' => $fallbackAmount,
                    'currency' => $payment['currency'] ?: ($payment['order_currency'] ?: 'NGN'),
                    'message' => 'Payment status is pending gateway settlement.',
                    'source' => 'monnify_query',
                ];
            }

            $json = json_decode((string)$response, true);
            $body = $json['responseBody'] ?? [];
            $paymentStatus = strtoupper(trim((string)($body['paymentStatus'] ?? '')));

            if ($paymentStatus === 'PAID') {
                $amountPaid = (float) (
                    (!empty($body['amountPaid']) && (float) $body['amountPaid'] > 0)
                        ? $body['amountPaid']
                        : $fallbackAmount
                );
                $paymentMethod = (string)($body['paymentMethod'] ?? 'monnify');

                $this->db->transaction(function (Database $db) use ($payment, $ref, $amountPaid, $paymentMethod, $body) {
                    $orderId = (int)$payment['order_id'];

                    $db->executeUpdate(
                        "UPDATE `payments` SET `status` = 'successful', `amount` = ?, `payment_method` = ?, `verified_at` = NOW(), `provider_payload_redacted` = ?, `updated_at` = NOW() WHERE `id` = ?",
                        'dssi',
                        [$amountPaid, $paymentMethod, json_encode($body), (int)$payment['id']]
                    );

                    $db->executeUpdate(
                        "UPDATE `orders` SET `payment_status` = 'successful', `order_status` = 'paid', `updated_at` = NOW() WHERE `id` = ?",
                        'i',
                        [$orderId]
                    );

                    $db->insert(
                        "INSERT INTO `order_status_history` (`order_id`, `previous_status`, `new_status`, `comment`)
                         VALUES (?, 'pending_payment', 'paid', ?)",
                        'is',
                        [$orderId, "Payment confirmed via Monnify. Reference: {$ref}"]
                    );

                    // Increment promo used_count if coupon applied
                    $orderRow = $db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
                    if ($orderRow && !empty($orderRow['applied_promo_code'])) {
                        $db->executeUpdate(
                            "UPDATE `promotions` SET `used_count` = `used_count` + 1 WHERE `code` = ?",
                            's',
                            [$orderRow['applied_promo_code']]
                        );
                    }

                    // Dispatch verified payment receipt
                    try {
                        if ($orderRow) {
                            $orderRow['payment_status'] = 'successful';
                            $orderRow['order_status'] = 'paid';
                            MailService::getInstance()->sendPaymentVerified($orderRow, [
                                'reference' => $ref,
                                'payment_method' => 'Monnify ' . ($paymentMethod ?? 'Card/Transfer'),
                            ]);
                        }
                    } catch (\Throwable $e) {
                        error_log('[MailService Notice] ' . $e->getMessage());
                    }
                });

                return [
                    'order_number' => $payment['order_number'],
                    'provider_reference' => $ref,
                    'provider' => 'monnify',
                    'status' => 'successful',
                    'order_status' => 'paid',
                    'amount' => $amountPaid,
                    'currency' => $payment['currency'],
                    'verified_at' => date('Y-m-d H:i:s'),
                    'source' => 'monnify_api_verified',
                ];
            }
        } catch (\Throwable $e) {
            error_log('[Monnify Query Exception] ' . $e->getMessage());
        }

        return [
            'order_number' => $payment['order_number'],
            'provider_reference' => $ref,
            'provider' => 'monnify',
            'status' => 'pending',
            'order_status' => 'pending_payment',
            'amount' => (float)$payment['amount'],
            'currency' => $payment['currency'],
            'source' => 'monnify_query',
        ];
    }

    /**
     * Handle incoming Monnify webhook event with HMAC-SHA512 verification.
     */
    public function handleWebhook(string $rawBody, string $signatureHeader): array
    {
        $computed = hash_hmac('sha512', $rawBody, $this->secretKey);

        // In sandbox or production, verify signature if header provided
        if (!empty($signatureHeader) && !hash_equals($computed, $signatureHeader)) {
            throw new InvalidArgumentException("Invalid Monnify webhook HMAC signature.");
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            throw new InvalidArgumentException("Malformed webhook JSON body.");
        }

        $eventData = $payload['eventData'] ?? $payload;
        $paymentReference = trim((string)($eventData['paymentReference'] ?? ''));
        $paymentStatus = strtoupper(trim((string)($eventData['paymentStatus'] ?? '')));

        if ($paymentReference === '') {
            throw new InvalidArgumentException("Missing paymentReference in Monnify webhook.");
        }

        if ($paymentStatus === 'PAID') {
            return $this->verifyTransaction($paymentReference);
        }

        return [
            'status' => 'ignored',
            'payment_reference' => $paymentReference,
            'monnify_status' => $paymentStatus,
        ];
    }

    /**
     * Load order by id or order_number.
     */
    private function loadOrder(string|int $orderIdOrNumber): array
    {
        if (is_numeric($orderIdOrNumber)) {
            $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [(int) $orderIdOrNumber]);
        } else {
            $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `order_number` = ?", 's', [(string) $orderIdOrNumber]);
        }

        if ($order === null) {
            throw new InvalidArgumentException("Order '{$orderIdOrNumber}' not found.");
        }

        return $order;
    }
}
