<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Database\Database;
use App\Services\MailService;
use InvalidArgumentException;
use RuntimeException;

/**
 * Isolated payment service integrating Kora (Korapay) Hosted Checkout,
 * Server-Side Authoritative Transaction Verification, and Cryptographic Webhook Handling.
 *
 * Enforces:
 * - Credentials loaded exclusively from backend environment variables
 * - Idempotent, unique provider reference generation
 * - Backend-calculated amount & currency enforcement (never browser values)
 * - Safe response recording with recursive redaction of sensitive credentials/card data
 * - Cryptographic HMAC SHA-256 signature verification over Kora's payload `data` object
 * - Database transactional locking, deduplication, and atomic order status transitions
 * - Resilient timeout and error handling retaining recoverable pending orders
 * - Orders remain pending on initialization (never marked paid until verified)
 */
class KoraService
{
    private Database $db;
    private string $baseUrl;
    private string $secretKey;
    private string $publicKey;
    private string $webhookSecret;
    private string $notificationUrl;
    private string $defaultRedirectUrl;

    /**
     * Optional custom HTTP executor for mock testing.
     * Signature: function(string $method, string $url, array $headers, ?string $body, int $timeout): array
     * Returns: ['status_code' => int, 'body' => string, 'error' => ?string]
     *
     * @var (callable(string, string, array, ?string, int): array)|null
     */
    private $httpExecutor = null;

    public function __construct(?Database $db = null, ?callable $httpExecutor = null)
    {
        $this->db = $db ?? Database::getInstance();
        $this->httpExecutor = $httpExecutor;

        // 1. Strictly read credentials from backend environment
        $this->baseUrl = rtrim(Env::get('KORA_API_BASE_URL', 'https://api.korapay.com/merchant/api/v1'), '/');
        $this->secretKey = trim(Env::get('KORA_SECRET_KEY', ''));
        $this->publicKey = trim(Env::get('KORA_PUBLIC_KEY', ''));
        $this->webhookSecret = trim(Env::get('KORA_WEBHOOK_SECRET', ''));

        $appUrl = rtrim(Env::get('APP_URL', 'http://localhost:8000'), '/');
        $this->notificationUrl = "{$appUrl}/api/v1/webhooks/kora";

        $frontendUrl = 'http://localhost:3000';
        $this->defaultRedirectUrl = "{$frontendUrl}/checkout/callback";
    }

    /**
     * Initialize a hosted checkout session with Kora for a pending order.
     *
     * @param string|int $orderIdOrNumber Numeric ID or string order_number
     * @param string|null $customRedirectUrl Optional customer return URL
     * @return array Safe public checkout payload (checkout_url, provider_reference, etc.)
     */
    public function initializeCheckout(string|int $orderIdOrNumber, ?string $customRedirectUrl = null): array
    {
        // 1. Load authoritative order directly from database
        $order = $this->loadOrder($orderIdOrNumber);

        if ($order['order_status'] !== 'pending_payment' && $order['order_status'] !== 'pending') {
            throw new InvalidArgumentException("Order '{$order['order_number']}' cannot be initialized for payment. Current status: {$order['order_status']}.");
        }

        $orderId = (int) $order['id'];
        $orderNumber = $order['order_number'];
        $amount = (float) $order['grand_total'];
        $currency = strtoupper(trim($order['currency'] ?? 'NGN'));

        if ($amount <= 0.0) {
            throw new InvalidArgumentException("Invalid order amount for order '{$orderNumber}'. Amount must be greater than zero.");
        }

        if ($currency !== 'NGN') {
            throw new InvalidArgumentException("Unsupported payment currency '{$currency}'. Kora domestic gateway requires NGN.");
        }

        // 2. Resolve customer recipient info from address snapshot
        $addressSnapshot = is_string($order['shipping_address_snapshot'])
            ? json_decode($order['shipping_address_snapshot'], true)
            : ($order['shipping_address_snapshot'] ?? []);

        $customerName = trim($addressSnapshot['full_name'] ?? 'Shop.co Customer');
        $customerEmail = trim($order['guest_email']);

        if ($customerEmail === '' || !filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Valid customer email is required to initialize payment.");
        }

        // 3. Generate unique provider reference (PAY-ORD-YYYYMMDD-XXXXXX-XXXX)
        $providerReference = $this->generateUniqueReference($orderNumber);
        $redirectUrl = $customRedirectUrl ?: $this->defaultRedirectUrl;

        // 4. Check if payment record already exists for this order
        $existingPayment = $this->db->fetchOne("SELECT `id`, `provider_reference`, `status` FROM `payments` WHERE `order_id` = ?", 'i', [$orderId]);

        if ($existingPayment === null) {
            $paymentId = (int) $this->db->insert(
                "INSERT INTO `payments` (`order_id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `provider_payload_redacted`)
                 VALUES (?, 'kora', ?, ?, 'NGN', 'pending', ?)",
                'isds',
                [
                    $orderId,
                    $providerReference,
                    $amount,
                    json_encode(['status' => 'pending_initialization', 'created_at' => date('Y-m-d H:i:s')]),
                ]
            );
        } else {
            $paymentId = (int) $existingPayment['id'];
            // Update provider, reference and keep pending
            $this->db->executeUpdate(
                "UPDATE `payments` SET `provider` = 'kora', `provider_reference` = ?, `amount` = ?, `status` = 'pending' WHERE `id` = ?",
                'sdi',
                [$providerReference, $amount, $paymentId]
            );
        }


        // 5. Construct official Kora charge initialize payload
        $payload = [
            'amount' => $amount,
            'currency' => $currency,
            'reference' => $providerReference,
            'customer' => [
                'name' => $customerName,
                'email' => $customerEmail,
            ],
            'notification_url' => $this->notificationUrl,
            'redirect_url' => $redirectUrl,
            'channels' => ['card', 'bank_transfer'],
            'narration' => "Payment for order {$orderNumber}",
            'metadata' => [
                'order_id' => $orderId,
                'order_number' => $orderNumber,
            ],
        ];

        // 6. Execute request against Kora API
        $endpoint = "{$this->baseUrl}/charges/initialize";
        $headers = [
            'Authorization: Bearer ' . $this->secretKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ];

        $httpResult = $this->executeHttpRequest('POST', $endpoint, $headers, json_encode($payload), 15);

        // 7. Handle network timeouts or connection failures
        if ($httpResult['error'] !== null || $httpResult['status_code'] === 0) {
            $errorMsg = $httpResult['error'] ?? 'Connection to payment gateway timed out.';

            // Persist gateway failure status while safely keeping order in recoverable pending_payment state
            $this->recordPaymentAttempt($paymentId, [
                'error' => 'GATEWAY_TIMEOUT',
                'error_description' => $errorMsg,
                'timestamp' => date('Y-m-d H:i:s'),
                'order_recoverable' => true,
            ]);

            throw new RuntimeException("Payment gateway request timed out. Your order has been preserved as pending; please try again shortly.");
        }

        $statusCode = $httpResult['status_code'];
        $rawResponseBody = $httpResult['body'];
        $responseJson = json_decode($rawResponseBody, true);

        // 8. Handle malformed / non-JSON provider response
        if (!is_array($responseJson)) {
            $this->recordPaymentAttempt($paymentId, [
                'error' => 'MALFORMED_GATEWAY_RESPONSE',
                'http_status' => $statusCode,
                'timestamp' => date('Y-m-d H:i:s'),
                'order_recoverable' => true,
            ]);

            throw new RuntimeException("Received unexpected or malformed response from payment gateway. Order remains pending.");
        }

        // 9. Handle provider HTTP errors (400, 401, 422, 500) or status = false
        $isSuccess = ($statusCode >= 200 && $statusCode < 300) && (!isset($responseJson['status']) || $responseJson['status'] === true);

        if (!$isSuccess) {
            $providerMessage = $responseJson['message'] ?? 'Payment provider rejected checkout initialization.';

            $redactedErrorPayload = $this->redactSensitiveFields($responseJson);
            $this->recordPaymentAttempt($paymentId, [
                'error' => 'PROVIDER_REJECTED',
                'http_status' => $statusCode,
                'provider_message' => $providerMessage,
                'provider_payload' => $redactedErrorPayload,
                'timestamp' => date('Y-m-d H:i:s'),
                'order_recoverable' => true,
            ]);

            throw new RuntimeException("Payment provider initialization failed: {$providerMessage}");
        }

        // 10. Extract checkout URL from response
        $data = $responseJson['data'] ?? [];
        $checkoutUrl = $data['checkout_url'] ?? null;
        $returnedReference = $data['reference'] ?? $providerReference;

        if (empty($checkoutUrl)) {
            $this->recordPaymentAttempt($paymentId, [
                'error' => 'MISSING_CHECKOUT_URL',
                'response' => $this->redactSensitiveFields($responseJson),
                'timestamp' => date('Y-m-d H:i:s'),
            ]);
            throw new RuntimeException("Payment provider did not return a valid hosted checkout URL.");
        }

        // 11. Save provider response safely in MySQL with sensitive data redacted
        // NOTE: Order and Payment status remain strictly 'pending' at initialization!
        $safeResponseData = $this->redactSensitiveFields($responseJson);
        $this->recordPaymentAttempt($paymentId, [
            'initialization_status' => 'initialized',
            'checkout_url' => $checkoutUrl,
            'provider_reference' => $returnedReference,
            'response_data' => $safeResponseData,
            'initialized_at' => date('Y-m-d H:i:s'),
        ]);

        // 12. Return only safe public data to the client
        return [
            'order_number' => $orderNumber,
            'provider' => 'kora',
            'provider_reference' => $returnedReference,
            'checkout_url' => $checkoutUrl,
            'amount' => $amount,
            'currency' => $currency,
            'status' => 'pending',
            'expires_in_minutes' => 60,
        ];
    }

    /**
     * Verify Kora HMAC SHA-256 Webhook Signature.
     * Kora computes HMAC-SHA256 strictly on the payload `data` object, using your Secret Key.
     *
     * @param string $rawBody The raw, untouched HTTP request body
     * @param string $signatureHeader The value from HTTP header x-korapay-signature
     * @return bool True if signature matches cryptographically, false otherwise
     */
    public function verifyWebhookSignature(string $rawBody, string $signatureHeader): bool
    {
        $signature = trim($signatureHeader);
        if ($signature === '' || trim($rawBody) === '') {
            return false;
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload) || !isset($payload['data'])) {
            return false;
        }

        $signingKey = $this->secretKey !== '' ? $this->secretKey : $this->webhookSecret;
        if ($signingKey === '') {
            return false;
        }

        // Official Kora signature format: HMAC-SHA256 on JSON-encoded 'data' object
        $dataJson = json_encode($payload['data'], JSON_UNESCAPED_SLASHES);
        $computedSignature = hash_hmac('sha256', $dataJson, $signingKey);

        return hash_equals($computedSignature, $signature);
    }

    /**
     * Process an incoming Kora webhook notification with signature verification and deduplication.
     *
     * @param string $rawBody Raw HTTP payload
     * @param string $signatureHeader Header x-korapay-signature
     * @return array Processing result
     */
    public function handleWebhook(string $rawBody, string $signatureHeader): array
    {
        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            throw new InvalidArgumentException("Malformed webhook payload. Expected valid JSON.");
        }

        // 1. Signature Verification
        $isValidSignature = $this->verifyWebhookSignature($rawBody, $signatureHeader);
        $eventType = trim((string) ($payload['event'] ?? 'unknown'));
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        $reference = trim((string) ($data['reference'] ?? ''));

        // Generate a deterministic deduplication event reference
        $eventReference = !empty($payload['event_id'])
            ? trim((string) $payload['event_id'])
            : "{$eventType}:{$reference}:" . ($data['status'] ?? 'unknown');

        if (!$isValidSignature) {
            $this->recordWebhookEvent($eventReference, $eventType, 0, 'failed', [
                'error' => 'SIGNATURE_VERIFICATION_FAILED',
                'received_signature' => $signatureHeader,
                'payload' => $this->redactSensitiveFields($payload),
            ]);
            throw new InvalidArgumentException("Webhook signature verification failed.");
        }

        // 2. Delegate to atomic database transaction processor
        return $this->processPaymentEvent($eventType, $data, $eventReference, $payload);
    }

    /**
     * Synchronously verify a transaction against Kora's authoritative verification API.
     * Endpoint: GET https://api.korapay.com/merchant/api/v1/charges/:reference
     *
     * @param string $providerReference The transaction reference string
     * @return array Verified status and order details
     */
    public function verifyTransaction(string $providerReference): array
    {
        $ref = trim($providerReference);
        if ($ref === '') {
            throw new InvalidArgumentException("Transaction reference is required for verification.");
        }

        // 1. Check current database state
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

        // If already verified as successful in MySQL, return authoritative successful state
        if ($payment['status'] === 'successful' && $payment['order_status'] === 'paid') {
            $verifiedAmount = (float) (
                (!empty($payment['amount']) && (float) $payment['amount'] > 0)
                    ? $payment['amount']
                    : ($payment['grand_total'] ?? 0.0)
            );
            return [
                'order_number' => $payment['order_number'],
                'provider_reference' => $ref,
                'status' => 'successful',
                'order_status' => 'paid',
                'amount' => $verifiedAmount,
                'currency' => $payment['currency'] ?: ($payment['order_currency'] ?: 'NGN'),
                'verified_at' => $payment['verified_at'] ?? date('Y-m-d H:i:s'),
                'source' => 'local_database_cached',
            ];
        }

        // 2. Query Kora verification API: GET /charges/:reference
        $url = "{$this->baseUrl}/charges/" . urlencode($ref);
        $headers = [
            'Authorization: Bearer ' . $this->secretKey,
            'Accept: application/json',
        ];

        $httpResult = $this->executeHttpRequest('GET', $url, $headers, null, 15);

        if ($httpResult['error'] !== null || $httpResult['status_code'] === 0) {
            throw new RuntimeException("Verification request to payment gateway timed out. Please retry shortly.");
        }

        $statusCode = $httpResult['status_code'];
        $responseJson = json_decode($httpResult['body'], true);

        if (!is_array($responseJson)) {
            throw new RuntimeException("Received unexpected or malformed response from payment gateway verification endpoint.");
        }

        $isSuccess = ($statusCode >= 200 && $statusCode < 300) && (!isset($responseJson['status']) || $responseJson['status'] === true);

        if (!$isSuccess) {
            $msg = $responseJson['message'] ?? 'Could not retrieve transaction from payment gateway.';
            throw new RuntimeException("Payment gateway verification failed: {$msg}");
        }

        $data = is_array($responseJson['data'] ?? null) ? $responseJson['data'] : [];
        $providerStatus = strtolower(trim((string) ($data['status'] ?? '')));

        if ($providerStatus === 'success' || $providerStatus === 'successful') {
            $eventRef = "query:{$ref}:success";
            $this->processPaymentEvent('charge.success', $data, $eventRef, $responseJson);

            $resolvedAmount = (float) (
                (!empty($data['amount']) && (float) $data['amount'] > 0)
                    ? $data['amount']
                    : ((!empty($payment['amount']) && (float) $payment['amount'] > 0)
                        ? $payment['amount']
                        : ($payment['grand_total'] ?? 0.0))
            );

            return [
                'order_number' => $payment['order_number'],
                'provider_reference' => $ref,
                'status' => 'successful',
                'order_status' => 'paid',
                'amount' => $resolvedAmount,
                'currency' => $data['currency'] ?? $payment['currency'] ?? $payment['order_currency'] ?? 'NGN',
                'verified_at' => date('Y-m-d H:i:s'),
                'source' => 'kora_api_verified',
            ];
        } elseif ($providerStatus === 'failed') {
            $eventRef = "query:{$ref}:failed";
            $this->processPaymentEvent('charge.failed', $data, $eventRef, $responseJson);

            return [
                'order_number' => $payment['order_number'],
                'provider_reference' => $ref,
                'status' => 'failed',
                'order_status' => $payment['order_status'],
                'failure_reason' => $data['reason'] ?? 'Payment was declined by card issuer or bank.',
                'source' => 'kora_api_verified',
            ];
        }

        // Otherwise still pending (e.g. pending bank transfer clearance)
        return [
            'order_number' => $payment['order_number'],
            'provider_reference' => $ref,
            'status' => 'pending',
            'order_status' => 'pending_payment',
            'message' => 'Payment is awaiting settlement (e.g. bank transfer pending clearance).',
            'source' => 'kora_api_verified',
        ];
    }

    /**
     * Atomically process a payment event inside a MySQL transaction.
     * Enforces idempotency, locks rows against concurrency, verifies amount/currency,
     * updates order/payment, and guarantees zero duplicate stock deductions or grants.
     */
    public function processPaymentEvent(string $eventType, array $data, string $eventReference, array $fullPayload): array
    {
        return $this->db->transaction(function (Database $db) use ($eventType, $data, $eventReference, $fullPayload): array {
            // 1. Check for duplicate webhook event reference
            $existingEvent = $db->fetchOne(
                "SELECT `id`, `processing_result` FROM `payment_webhook_events` WHERE `event_reference` = ?",
                's',
                [$eventReference]
            );

            if ($existingEvent !== null && $existingEvent['processing_result'] === 'processed') {
                return [
                    'status' => 'ignored_duplicate',
                    'message' => 'Event already processed idempotently.',
                    'event_reference' => $eventReference,
                ];
            }

            $providerReference = trim((string) ($data['reference'] ?? ''));
            if ($providerReference === '') {
                $this->recordWebhookEvent($eventReference, $eventType, 1, 'failed', [
                    'error' => 'Missing reference in payload',
                    'payload' => $fullPayload,
                ]);
                throw new InvalidArgumentException("Missing transaction reference in payment event data.");
            }

            // 2. Lock payment and related order with SELECT ... FOR UPDATE
            $payment = $db->fetchOne(
                "SELECT p.*, o.id as order_id, o.order_number, o.grand_total, o.currency as order_currency, o.order_status, o.payment_status as order_payment_status
                 FROM `payments` p
                 JOIN `orders` o ON p.order_id = o.id
                 WHERE p.provider_reference = ?
                 FOR UPDATE",
                's',
                [$providerReference]
            );

            if ($payment === null) {
                $this->recordWebhookEvent($eventReference, $eventType, 1, 'unmatched', [
                    'error' => 'No payment matching provider reference',
                    'reference' => $providerReference,
                    'payload' => $fullPayload,
                ]);
                throw new RuntimeException("No order or payment found matching provider reference '{$providerReference}'.");
            }

            $orderId = (int) $payment['order_id'];
            $orderNumber = $payment['order_number'];
            $expectedTotal = (float) $payment['grand_total'];
            $expectedCurrency = strtoupper((string) $payment['order_currency']);

            // 3. Amount & Currency integrity validation
            $actualAmount = isset($data['amount']) ? (float) $data['amount'] : 0.0;
            $actualCurrency = strtoupper(trim((string) ($data['currency'] ?? '')));

            if (abs($actualAmount - $expectedTotal) > 0.01) {
                $this->recordWebhookEvent($eventReference, $eventType, 1, 'failed', [
                    'error' => 'Amount mismatch',
                    'expected_amount' => $expectedTotal,
                    'received_amount' => $actualAmount,
                    'payload' => $fullPayload,
                ]);
                throw new RuntimeException("Payment amount mismatch for order '{$orderNumber}'. Expected: {$expectedTotal}, Received: {$actualAmount}.");
            }

            if ($actualCurrency !== '' && $actualCurrency !== $expectedCurrency) {
                $this->recordWebhookEvent($eventReference, $eventType, 1, 'failed', [
                    'error' => 'Currency mismatch',
                    'expected_currency' => $expectedCurrency,
                    'received_currency' => $actualCurrency,
                    'payload' => $fullPayload,
                ]);
                throw new RuntimeException("Payment currency mismatch for order '{$orderNumber}'. Expected: {$expectedCurrency}, Received: {$actualCurrency}.");
            }

            $paymentMethod = $data['payment_method'] ?? ($data['channel'] ?? 'card');
            $providerStatus = strtolower(trim((string) ($data['status'] ?? '')));
            $safePayload = $this->redactSensitiveFields($fullPayload);

            // 4. Handle event outcomes
            if ($eventType === 'charge.success') {
                // Enforce provider status is actually success/successful
                if ($providerStatus !== 'success' && $providerStatus !== 'successful') {
                    $this->recordWebhookEvent($eventReference, $eventType, 1, 'failed', [
                        'error' => 'Charge event reported non-success provider status',
                        'provider_status' => $providerStatus,
                        'payload' => $fullPayload,
                    ]);
                    throw new RuntimeException("Charge event reported non-successful provider status: '{$providerStatus}'. Order remains pending.");
                }

                // Check if ALREADY paid
                if ($payment['status'] === 'successful' && $payment['order_status'] === 'paid') {
                    $this->recordWebhookEvent($eventReference, $eventType, 1, 'ignored_duplicate', [
                        'message' => 'Order is already marked as paid.',
                        'order_number' => $orderNumber,
                    ]);
                    return [
                        'status' => 'ignored_duplicate',
                        'message' => 'Order is already marked as paid.',
                        'order_number' => $orderNumber,
                    ];
                }

                // Update payments table
                $db->executeUpdate(
                    "UPDATE `payments` SET `status` = 'successful', `payment_method` = ?, `verified_at` = NOW(), `provider_payload_redacted` = ?, `updated_at` = NOW() WHERE `id` = ?",
                    'ssi',
                    [$paymentMethod, json_encode($safePayload), (int) $payment['id']]
                );

                // Update orders table
                $db->executeUpdate(
                    "UPDATE `orders` SET `payment_status` = 'successful', `order_status` = 'paid', `updated_at` = NOW() WHERE `id` = ?",
                    'i',
                    [$orderId]
                );

                // Record status history transition
                $db->insert(
                    "INSERT INTO `order_status_history` (`order_id`, `previous_status`, `new_status`, `comment`)
                     VALUES (?, 'pending_payment', 'paid', ?)",
                    'is',
                    [$orderId, "Payment confirmed via Kora. Reference: {$providerReference}"]
                );

                // Increment promotion usage count if coupon applied
                $orderRow = $db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
                if ($orderRow && !empty($orderRow['applied_promo_code'])) {
                    $db->executeUpdate(
                        "UPDATE `promotions` SET `used_count` = `used_count` + 1 WHERE `code` = ?",
                        's',
                        [$orderRow['applied_promo_code']]
                    );
                }

                // Dispatch verified payment email receipt
                try {
                    if ($orderRow) {
                        $orderRow['payment_status'] = 'successful';
                        $orderRow['order_status'] = 'paid';
                        MailService::getInstance()->sendPaymentVerified($orderRow, [
                            'reference' => $providerReference,
                            'payment_method' => 'Kora ' . ($paymentMethod ?: 'Hosted Checkout'),
                        ]);
                    }
                } catch (\Throwable $e) {
                    error_log('[MailService Notice] ' . $e->getMessage());
                }

                // NOTE on stock: Stock reservation occurred upon order creation (Step 8 policy).
                // Zero duplicate stock deduction is executed.

                $this->recordWebhookEvent($eventReference, $eventType, 1, 'processed', [
                    'order_number' => $orderNumber,
                    'amount' => $actualAmount,
                    'currency' => $actualCurrency,
                    'method' => $paymentMethod,
                ]);

                return [
                    'status' => 'processed',
                    'order_number' => $orderNumber,
                    'payment_status' => 'successful',
                    'order_status' => 'paid',
                    'amount' => $actualAmount,
                ];

            } elseif ($eventType === 'charge.failed') {
                // If payment was already successfully confirmed earlier, ignore out-of-order failed events
                if ($payment['status'] === 'successful' || $payment['order_status'] === 'paid') {
                    $this->recordWebhookEvent($eventReference, $eventType, 1, 'ignored_duplicate', [
                        'message' => 'Out-of-order charge.failed received after successful payment. Ignored.',
                        'order_number' => $orderNumber,
                    ]);
                    return [
                        'status' => 'ignored_duplicate',
                        'message' => 'Out-of-order failure ignored; order already paid.',
                        'order_number' => $orderNumber,
                    ];
                }

                // Update payment status to failed
                $db->executeUpdate(
                    "UPDATE `payments` SET `status` = 'failed', `provider_payload_redacted` = ?, `updated_at` = NOW() WHERE `id` = ?",
                    'si',
                    [json_encode($safePayload), (int) $payment['id']]
                );

                $db->executeUpdate(
                    "UPDATE `orders` SET `payment_status` = 'failed', `updated_at` = NOW() WHERE `id` = ?",
                    'i',
                    [$orderId]
                );

                $failureReason = $data['reason'] ?? ($data['message'] ?? 'Transaction failed or declined.');
                $db->insert(
                    "INSERT INTO `order_status_history` (`order_id`, `previous_status`, `new_status`, `comment`)
                     VALUES (?, 'pending_payment', 'pending_payment', ?)",
                    'is',
                    [$orderId, "Payment attempt failed via Kora: {$failureReason}"]
                );

                $this->recordWebhookEvent($eventReference, $eventType, 1, 'processed', [
                    'order_number' => $orderNumber,
                    'failure_reason' => $failureReason,
                ]);

                return [
                    'status' => 'processed',
                    'order_number' => $orderNumber,
                    'payment_status' => 'failed',
                    'failure_reason' => $failureReason,
                ];
            } else {
                // Unsupported / unknown event type
                $this->recordWebhookEvent($eventReference, $eventType, 1, 'ignored_duplicate', [
                    'message' => "Ignored unsupported event type '{$eventType}'",
                ]);
                return [
                    'status' => 'ignored_duplicate',
                    'message' => "Unsupported event '{$eventType}' ignored.",
                ];
            }
        });
    }

    /**
     * Persist record into payment_webhook_events with upsert semantics.
     */
    public function recordWebhookEvent(string $eventReference, string $eventType, int $signatureValid, string $processingResult, array $metadata): void
    {
        $existing = $this->db->fetchOne("SELECT `id` FROM `payment_webhook_events` WHERE `event_reference` = ?", 's', [$eventReference]);
        $redacted = json_encode($this->redactSensitiveFields($metadata));

        if ($existing !== null) {
            $this->db->executeUpdate(
                "UPDATE `payment_webhook_events` SET `signature_valid` = ?, `processing_result` = ?, `payload_metadata` = ? WHERE `id` = ?",
                'issi',
                [$signatureValid, $processingResult, $redacted, (int) $existing['id']]
            );
        } else {
            $this->db->insert(
                "INSERT INTO `payment_webhook_events` (`provider`, `event_reference`, `event_type`, `signature_valid`, `processing_result`, `payload_metadata`)
                 VALUES ('kora', ?, ?, ?, ?, ?)",
                'ssiss',
                [$eventReference, $eventType, $signatureValid, $processingResult, $redacted]
            );
        }
    }

    /**
     * Load order by numeric ID or alphanumeric order number.
     */
    public function loadOrder(string|int $orderIdOrNumber): array
    {
        if (is_numeric($orderIdOrNumber)) {
            $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [(int) $orderIdOrNumber]);
        } else {
            $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `order_number` = ?", 's', [trim((string) $orderIdOrNumber)]);
        }

        if ($order === null) {
            throw new InvalidArgumentException("Order '{$orderIdOrNumber}' was not found.");
        }

        return $order;
    }

    /**
     * Record sanitized payment response metadata into the payments table.
     */
    private function recordPaymentAttempt(int $paymentId, array $metadata): void
    {
        $sanitizedJson = json_encode($this->redactSensitiveFields($metadata));
        $this->db->executeUpdate(
            "UPDATE `payments` SET `provider_payload_redacted` = ?, `updated_at` = NOW() WHERE `id` = ?",
            'si',
            [$sanitizedJson, $paymentId]
        );
    }

    /**
     * Recursively redacts sensitive credentials, authorization codes, and card details.
     */
    public function redactSensitiveFields(mixed $data): mixed
    {
        if (!is_array($data)) {
            return $data;
        }

        $sensitiveKeys = [
            'secret',
            'secret_key',
            'authorization_code',
            'access_code',
            'token',
            'card_number',
            'pan',
            'cvv',
            'cvv2',
            'pin',
            'password',
            'private_key',
            'encryption_key',
            'x-korapay-signature',
        ];

        $cleaned = [];
        foreach ($data as $key => $value) {
            $lowerKey = strtolower((string) $key);
            $isSensitive = false;

            foreach ($sensitiveKeys as $pattern) {
                if ($lowerKey === $pattern || str_contains($lowerKey, $pattern)) {
                    $isSensitive = true;
                    break;
                }
            }

            if ($isSensitive) {
                $cleaned[$key] = '[REDACTED]';
            } elseif (is_array($value)) {
                $cleaned[$key] = $this->redactSensitiveFields($value);
            } else {
                $cleaned[$key] = $value;
            }
        }

        return $cleaned;
    }

    /**
     * Generate an unambiguous, unique provider reference.
     * Format: PAY-ORD-YYYYMMDD-XXXXXX-XXXX
     */
    private function generateUniqueReference(string $orderNumber): string
    {
        $suffix = strtoupper(bin2hex(random_bytes(2)));
        $cleanOrderNumber = preg_replace('/[^A-Za-z0-9\-]/', '', $orderNumber);
        return "PAY-{$cleanOrderNumber}-{$suffix}";
    }

    /**
     * Execute an HTTP request either via the injected executor (unit testing) or native cURL.
     *
     * @return array{status_code: int, body: string, error: ?string}
     */
    private function executeHttpRequest(string $method, string $url, array $headers, ?string $body, int $timeout): array
    {
        if ($this->httpExecutor !== null) {
            return ($this->httpExecutor)($method, $url, $headers, $body, $timeout);
        }

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $response = curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        return [
            'status_code' => $statusCode,
            'body' => (string) $response,
            'error' => ($error !== '') ? $error : null,
        ];
    }
}
