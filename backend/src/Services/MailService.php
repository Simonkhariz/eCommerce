<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Database\Database;
use Throwable;

/**
 * Store email, outbox first.
 *
 * Every email is a row in `email_outbox` whose payload holds everything needed to render it
 * (MailTemplates). Transactional emails get one immediate delivery attempt (they are queued from
 * afterCommit callbacks, so never inside an open transaction); anything that fails, and every
 * newsletter, is delivered by backend/scripts/process_outbox.php with retries and backoff.
 *
 * Status is honest: 'sent' only when the SMTP server accepted the message or, in log mode, when it
 * was written to storage/logs/mail.log (transport = 'log', shown as "logged only" in the admin).
 *
 * Sign-in links are the exception: the raw token is never stored, so they are delivered
 * immediately and the outbox row keeps only a fingerprint (they cannot be re-sent).
 */
class MailService
{
    public const MAX_ATTEMPTS = 5;
    /** Minutes to wait after attempt N fails (index = attempts so far). */
    private const BACKOFF_MINUTES = [1 => 1, 2 => 5, 3 => 15, 4 => 60];
    /** How long a worker owns a row while delivering it. */
    private const LEASE_MINUTES = 10;

    private static ?MailService $instance = null;
    private Database $db;
    private string $logPath;
    private ?MailTemplates $templates = null;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
        $base = defined('BASE_PATH') ? BASE_PATH : dirname(__DIR__, 2);
        // MAIL_LOG_PATH (relative to backend/) lets tests keep their own log.
        $this->logPath = $base . '/' . ltrim((string) (Env::get('MAIL_LOG_PATH', 'storage/logs/mail.log') ?: 'storage/logs/mail.log'), '/');
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /** Templates are built once per request (they read the store settings). */
    private function templates(): MailTemplates
    {
        return $this->templates ??= new MailTemplates($this->db);
    }

    public static function mode(): string
    {
        return SmtpTransport::isConfigured() ? 'smtp' : 'log_only';
    }

    // =========================================================================
    // Order emails (called from afterCommit callbacks)
    // =========================================================================

    public function sendOrderReceived(array $order): bool
    {
        $payload = $this->orderPayload((string) ($order['order_number'] ?? ''));
        if ($payload === null) {
            return false;
        }
        return $this->queue($payload['recipient'], 'order_received', $payload['data'], 'order_received:' . $payload['data']['order_number']);
    }

    /**
     * Receipt. Only for orders whose payment is verified (guard kept from the original design).
     */
    public function sendPaymentVerified(array $order, array $paymentDetails = []): bool
    {
        $payload = $this->orderPayload((string) ($order['order_number'] ?? ''));
        if ($payload === null) {
            return false;
        }
        $data = $payload['data'];
        if (!in_array($data['payment_status'], ['successful', 'partially_refunded'], true)) {
            error_log("[MailService] Refused payment_verified email for {$data['order_number']}: payment is not verified.");
            return false;
        }

        $payment = $this->db->fetchOne(
            "SELECT `provider`, `provider_reference`, `amount`, `amount_received`, `payment_method`, `verified_at`
             FROM `payments` WHERE `order_id` = ? AND `status` IN ('successful', 'partially_refunded')
             ORDER BY `verified_at` ASC, `id` ASC LIMIT 1",
            'i',
            [$data['order_id']]
        );
        $provider = (string) ($payment['provider'] ?? '');
        $label = ['kora' => 'Kora', 'monnify' => 'Monnify', 'whatsapp' => 'Bank transfer', 'manual' => 'Bank transfer'][$provider] ?? ucfirst($provider);
        $method = trim(str_replace('_', ' ', (string) ($payment['payment_method'] ?? '')));

        $data['payment_reference'] = (string) ($payment['provider_reference'] ?? $paymentDetails['reference'] ?? '');
        $data['payment_label'] = trim($label . ($method !== '' && strcasecmp($method, $label) !== 0 ? ' · ' . $method : ''));
        $data['amount_paid'] = (float) ($payment['amount_received'] ?? $payment['amount'] ?? $data['grand_total']);
        $data['verified_at'] = $payment['verified_at'] ?? null;

        return $this->queue($payload['recipient'], 'payment_verified', $data, 'payment_verified:' . $data['order_number']);
    }

    /**
     * Alert the store's admins that a customer marked a WhatsApp transfer as paid.
     * One email per order and admin, however often the customer taps the button.
     * Goes to the active admin accounts, or the store contact email when there are none.
     *
     * @return int Number of emails queued
     */
    public function sendPaymentClaimedToAdmins(string $orderNumber, string $claimedAt): int
    {
        $payload = $this->orderPayload($orderNumber);
        if ($payload === null) {
            return 0;
        }
        $data = $payload['data'];
        $data['claimed_at'] = $claimedAt;

        $recipients = array_column($this->db->fetchAll(
            "SELECT `email` FROM `users` WHERE `role` IN ('admin', 'super_admin') AND `status` = 'active'"
        ), 'email');
        if ($recipients === []) {
            $contact = $this->db->fetchOne("SELECT `value` FROM `store_settings` WHERE `key_name` = 'store_contact_email'");
            $recipients = [trim((string) ($contact['value'] ?? ''))];
        }

        $queued = 0;
        foreach (array_unique(array_map('strtolower', $recipients)) as $email) {
            if ($this->queue($email, 'payment_claimed', $data, "payment_claimed:{$data['order_number']}:{$email}")) {
                $queued++;
            }
        }
        return $queued;
    }

    public function sendShipmentTracking(array $order, array $shipment): bool
    {
        $payload = $this->orderPayload((string) ($order['order_number'] ?? ''));
        if ($payload === null) {
            return false;
        }
        $data = $payload['data'];
        $data['carrier'] = (string) ($shipment['carrier'] ?? '');
        $data['tracking_number'] = (string) ($shipment['tracking_number'] ?? '');
        $data['tracking_url'] = (string) ($shipment['tracking_url'] ?? '');

        return $this->queue(
            $payload['recipient'],
            'shipment_tracking',
            $data,
            'shipment_tracking:' . $data['order_number'] . ':' . $data['tracking_number']
        );
    }

    /**
     * @param string $type 'cancellation' or 'refund'
     * @param array{reason?: string, amount?: float|string, refund_id?: int, reference?: string|null} $extra
     */
    public function sendCancellationOrRefund(array $order, string $type, array $extra = []): bool
    {
        $payload = $this->orderPayload((string) ($order['order_number'] ?? ''));
        if ($payload === null) {
            return false;
        }
        $data = $payload['data'];
        $data['reason'] = trim((string) ($extra['reason'] ?? ''));

        if ($type === 'refund') {
            $data['amount'] = (float) ($extra['amount'] ?? 0);
            $data['refund_reference'] = (string) ($extra['reference'] ?? '');
            $key = 'refund_processed:' . $data['order_number'] . ':' . ($extra['refund_id'] ?? md5(json_encode($extra)));
            return $this->queue($payload['recipient'], 'refund_processed', $data, $key);
        }

        $paid = $this->db->fetchOne(
            "SELECT COALESCE(SUM(`amount`), 0) AS paid FROM `payments`
             WHERE `order_id` = ? AND `status` IN ('successful', 'partially_refunded')",
            'i',
            [$data['order_id']]
        );
        $data['was_paid'] = (float) ($paid['paid'] ?? 0) > 0;
        $data['amount_paid'] = (float) ($paid['paid'] ?? 0);

        return $this->queue($payload['recipient'], 'order_cancelled', $data, 'order_cancelled:' . $data['order_number']);
    }

    // =========================================================================
    // Sign-in links (delivered immediately; the token is never stored)
    // =========================================================================

    public function sendAccountVerification(string $email, string $rawToken, string $type = 'magic_link'): bool
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $link = Env::frontendUrl() . '/auth/verify?token=' . rawurlencode($rawToken);
        $templates = $this->templates();
        $rendered = $templates->render('magic_link', ['link' => $link, 'ttl_minutes' => 15]);
        $fingerprint = substr(hash('sha256', $rawToken), 0, 12);

        [$ok, $transport, $error] = $this->transmit($email, $rendered, $templates->storeName(), 'magic_link');

        try {
            $this->db->insert(
                "INSERT INTO `email_outbox` (`recipient_email`, `subject`, `template`, `dedup_key`, `payload`, `status`, `transport`, `attempt_count`, `last_error`, `sent_at`)
                 VALUES (?, ?, 'magic_link', ?, ?, ?, ?, 1, ?, ?)",
                'ssssssss',
                [
                    $email,
                    $rendered['subject'],
                    'magic_link:' . $fingerprint,
                    json_encode(['v' => MailTemplates::VERSION, 'type' => $type, 'token_fingerprint' => $fingerprint]),
                    $ok ? 'sent' : 'failed',
                    $transport,
                    $error,
                    $ok ? date('Y-m-d H:i:s') : null,
                ]
            );
        } catch (Throwable $e) {
            error_log('[MailService] Could not record sign-in email: ' . $e->getMessage());
        }

        return $ok;
    }

    // =========================================================================
    // Newsletter
    // =========================================================================

    /**
     * Queue one newsletter email (delivered by the outbox worker, never inline).
     */
    public function queueBroadcast(string $email, string $subject, string $content, string $unsubscribeUrl): void
    {
        $this->queue($email, 'marketing_broadcast', [
            'subject' => $subject,
            'content' => $content,
            'unsubscribe_url' => $unsubscribeUrl,
        ], null, false);
    }

    // =========================================================================
    // Outbox
    // =========================================================================

    /**
     * Insert an outbox row (skipping exact duplicates) and optionally try to deliver it now.
     * Returns false only when the email could not be queued at all.
     */
    public function queue(string $recipient, string $template, array $data, ?string $dedupKey, bool $deliverNow = true): bool
    {
        $recipient = strtolower(trim($recipient));
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        try {
            if ($dedupKey !== null) {
                $existing = $this->db->fetchOne("SELECT `id` FROM `email_outbox` WHERE `dedup_key` = ? LIMIT 1", 's', [$dedupKey]);
                if ($existing !== null) {
                    return true;
                }
            }

            $data['v'] = MailTemplates::VERSION;
            $subject = $this->templates()->render($template, $data)['subject'];

            $id = (int) $this->db->insert(
                "INSERT INTO `email_outbox` (`recipient_email`, `subject`, `template`, `dedup_key`, `payload`, `status`, `attempt_count`)
                 VALUES (?, ?, ?, ?, ?, 'pending', 0)",
                'sssss',
                [$recipient, mb_substr($subject, 0, 255), $template, $dedupKey, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]
            );
        } catch (Throwable $e) {
            error_log("[MailService] Could not queue {$template} for {$recipient}: " . $e->getMessage());
            return false;
        }

        if ($deliverNow && !$this->db->inTransaction() && filter_var(Env::get('MAIL_SEND_IMMEDIATELY', 'true'), FILTER_VALIDATE_BOOLEAN)) {
            $this->deliver($id);
        }
        return true;
    }

    /**
     * Deliver one outbox row if it is due and nobody else is delivering it.
     *
     * @return array{id: int, status: string, error: string|null}|null null when the row was not due / claimed
     */
    public function deliver(int $id): ?array
    {
        // Claim the row: the conditional update doubles as a lease so two workers never send it twice.
        $claimed = $this->db->executeUpdate(
            "UPDATE `email_outbox`
             SET `next_attempt_at` = DATE_ADD(NOW(), INTERVAL " . self::LEASE_MINUTES . " MINUTE)
             WHERE `id` = ? AND `status` = 'pending' AND (`next_attempt_at` IS NULL OR `next_attempt_at` <= NOW())",
            'i',
            [$id]
        );
        if ($claimed !== 1) {
            return null;
        }

        $row = $this->db->fetchOne("SELECT * FROM `email_outbox` WHERE `id` = ?", 'i', [$id]);
        $payload = json_decode((string) ($row['payload'] ?? ''), true);
        $template = (string) $row['template'];

        if (!is_array($payload) || (int) ($payload['v'] ?? 0) !== MailTemplates::VERSION || !in_array($template, MailTemplates::RENDERABLE, true)) {
            return $this->finish($id, 'failed', null, 'This email was queued by an older version of the store and cannot be rendered.', false);
        }

        if ($template === 'marketing_broadcast') {
            $sub = $this->db->fetchOne("SELECT `status` FROM `newsletter_subscribers` WHERE `email` = ?", 's', [$row['recipient_email']]);
            if (($sub['status'] ?? null) !== 'active') {
                return $this->finish($id, 'failed', null, 'Not sent: the recipient unsubscribed before delivery.', false);
            }
        }

        try {
            $templates = $this->templates();
            $rendered = $templates->render($template, $payload);
        } catch (Throwable $e) {
            error_log("[MailService] Render failed for outbox #{$id}: " . $e->getMessage());
            return $this->finish($id, 'failed', null, 'The email could not be rendered.', false);
        }

        [$ok, $transport, $error] = $this->transmit((string) $row['recipient_email'], $rendered, $templates->storeName(), $template, $payload);

        if ($ok) {
            return $this->finish($id, 'sent', $transport, null, true);
        }

        $attempts = (int) $row['attempt_count'] + 1;
        if ($attempts >= self::MAX_ATTEMPTS) {
            return $this->finish($id, 'failed', $transport, $error, true);
        }

        $this->db->executeUpdate(
            "UPDATE `email_outbox`
             SET `attempt_count` = ?, `last_error` = ?, `transport` = ?,
                 `next_attempt_at` = DATE_ADD(NOW(), INTERVAL ? MINUTE)
             WHERE `id` = ?",
            'issii',
            [$attempts, $error, $transport, self::BACKOFF_MINUTES[$attempts] ?? 60, $id]
        );
        return ['id' => $id, 'status' => 'pending', 'error' => $error];
    }

    /**
     * Deliver due rows (oldest first). Used by scripts/process_outbox.php and the admin "Send now".
     *
     * @return array{processed: int, sent: int, failed: int, retrying: int}
     */
    public function processQueue(int $limit = 50): array
    {
        $ids = array_column($this->db->fetchAll(
            "SELECT `id` FROM `email_outbox`
             WHERE `status` = 'pending' AND (`next_attempt_at` IS NULL OR `next_attempt_at` <= NOW())
             ORDER BY `id` ASC LIMIT ?",
            'i',
            [max(1, min(500, $limit))]
        ), 'id');

        $summary = ['processed' => 0, 'sent' => 0, 'failed' => 0, 'retrying' => 0];
        foreach ($ids as $id) {
            $result = $this->deliver((int) $id);
            if ($result === null) {
                continue;
            }
            $summary['processed']++;
            $key = $result['status'] === 'sent' ? 'sent' : ($result['status'] === 'failed' ? 'failed' : 'retrying');
            $summary[$key]++;
        }
        return $summary;
    }

    /**
     * Admin "Retry" / "Send again": re-render the stored payload and deliver the same row.
     *
     * @return array{ok: bool, message: string}
     */
    public function retryOutboxItem(int $outboxId): array
    {
        $row = $this->db->fetchOne("SELECT `id`, `template`, `payload`, `attempt_count` FROM `email_outbox` WHERE `id` = ?", 'i', [$outboxId]);
        if ($row === null) {
            return ['ok' => false, 'message' => 'Email not found.'];
        }
        if ($row['template'] === 'magic_link' || $row['template'] === 'account_verification') {
            return ['ok' => false, 'message' => 'Sign-in links cannot be re-sent. Ask the customer to request a new link.'];
        }
        $payload = json_decode((string) $row['payload'], true);
        if (!is_array($payload) || (int) ($payload['v'] ?? 0) !== MailTemplates::VERSION || !in_array($row['template'], MailTemplates::RENDERABLE, true)) {
            return ['ok' => false, 'message' => 'This email was created by an older version of the store and cannot be re-sent.'];
        }

        // Give it one more attempt within the limit.
        $this->db->executeUpdate(
            "UPDATE `email_outbox` SET `status` = 'pending', `next_attempt_at` = NULL, `attempt_count` = LEAST(`attempt_count`, ?) WHERE `id` = ?",
            'ii',
            [self::MAX_ATTEMPTS - 1, $outboxId]
        );
        $result = $this->deliver($outboxId);

        return match ($result['status'] ?? null) {
            'sent' => ['ok' => true, 'message' => self::mode() === 'smtp' ? 'Email sent.' : 'Email written to the mail log (SMTP is not configured).'],
            'pending' => ['ok' => false, 'message' => 'Sending failed again; it will be retried automatically. ' . ($result['error'] ?? '')],
            default => ['ok' => false, 'message' => $result['error'] ?? 'The email could not be sent.'],
        };
    }

    // =========================================================================
    // Internals
    // =========================================================================

    /**
     * @param array{subject: string, html: string, text: string} $rendered
     * @return array{0: bool, 1: string, 2: string|null} ok, transport, error
     */
    private function transmit(string $to, array $rendered, string $storeName, string $template, array $payload = []): array
    {
        $headers = [];
        if ($template === 'marketing_broadcast' && !empty($payload['unsubscribe_url'])) {
            $headers['List-Unsubscribe'] = '<' . $payload['unsubscribe_url'] . '>';
        }

        if (SmtpTransport::isConfigured()) {
            try {
                (new SmtpTransport())->send($to, $rendered['subject'], $rendered['html'], $rendered['text'], $storeName, $headers);
                return [true, 'smtp', null];
            } catch (Throwable $e) {
                error_log("[MailService SMTP] {$template} to {$to}: " . $e->getMessage());
                return [false, 'smtp', mb_substr($e->getMessage(), 0, 500)];
            }
        }

        try {
            $this->writeToMailLog($to, $rendered, $template);
            return [true, 'log', null];
        } catch (Throwable $e) {
            return [false, 'log', 'Could not write to storage/logs/mail.log: ' . $e->getMessage()];
        }
    }

    /**
     * @return array{id: int, status: string, error: string|null}
     */
    private function finish(int $id, string $status, ?string $transport, ?string $error, bool $countAttempt): array
    {
        $this->db->executeUpdate(
            "UPDATE `email_outbox`
             SET `status` = ?, `transport` = COALESCE(?, `transport`), `last_error` = ?,
                 `attempt_count` = `attempt_count` + ?, `next_attempt_at` = NULL,
                 `sent_at` = IF(? = 'sent', NOW(), `sent_at`)
             WHERE `id` = ?",
            'sssisi',
            [$status, $transport, $error, $countAttempt ? 1 : 0, $status, $id]
        );
        return ['id' => $id, 'status' => $status, 'error' => $error];
    }

    /**
     * Everything the order templates need, read from the committed order.
     *
     * @return array{recipient: string, data: array<string, mixed>}|null
     */
    private function orderPayload(string $orderNumber): ?array
    {
        if ($orderNumber === '') {
            return null;
        }
        $order = $this->db->fetchOne(
            "SELECT o.*, u.email AS account_email, u.full_name AS account_name
             FROM `orders` o LEFT JOIN `users` u ON u.id = o.user_id
             WHERE o.order_number = ?",
            's',
            [$orderNumber]
        );
        if ($order === null) {
            return null;
        }

        $recipient = trim((string) ($order['guest_email'] ?: $order['account_email'] ?: ''));
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            return null;
        }

        $address = json_decode((string) ($order['shipping_address_snapshot'] ?? ''), true) ?: [];
        $zone = json_decode((string) ($order['shipping_zone_snapshot'] ?? ''), true) ?: [];

        $items = [];
        foreach ($this->db->fetchAll(
            "SELECT `item_name`, `variant_options`, `quantity`, `line_total` FROM `order_items` WHERE `order_id` = ? ORDER BY `id`",
            'i',
            [(int) $order['id']]
        ) as $item) {
            $opts = json_decode((string) ($item['variant_options'] ?? ''), true) ?: [];
            $items[] = [
                'name' => (string) $item['item_name'],
                'options' => implode(' / ', array_filter([$opts['size'] ?? null, $opts['color'] ?? $opts['color_name'] ?? null])),
                'quantity' => (int) $item['quantity'],
                'line_total' => (float) $item['line_total'],
            ];
        }

        return [
            'recipient' => $recipient,
            'data' => [
                'order_id' => (int) $order['id'],
                'order_number' => (string) $order['order_number'],
                'order_status' => (string) $order['order_status'],
                'payment_status' => (string) $order['payment_status'],
                'customer_name' => (string) ($address['full_name'] ?? $order['account_name'] ?? ''),
                'currency' => (string) ($order['currency'] ?: 'NGN'),
                'subtotal' => (float) $order['subtotal'],
                'discount_amount' => (float) $order['discount_amount'],
                'promo_code' => $order['applied_promo_code'] ?? null,
                'shipping_fee' => (float) $order['shipping_fee'],
                'grand_total' => (float) $order['grand_total'],
                'zone_name' => $zone['name'] ?? null,
                'estimated_days' => $zone['estimated_days'] ?? null,
                'expires_at' => $order['expires_at'] ?? null,
                'items' => $items,
                'address' => [
                    'full_name' => $address['full_name'] ?? '',
                    'phone' => $address['phone'] ?? '',
                    'address_line1' => $address['address_line1'] ?? '',
                    'address_line2' => $address['address_line2'] ?? '',
                    'city' => $address['city'] ?? '',
                    'state' => $address['state'] ?? '',
                ],
            ],
        ];
    }

    /**
     * @param array{subject: string, html: string, text: string} $rendered
     */
    private function writeToMailLog(string $to, array $rendered, string $template): void
    {
        $dir = dirname($this->logPath);
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Mail log directory is not writable.');
        }

        $line = str_repeat('=', 80);
        $entry = "{$line}\n"
            . '[' . date('Y-m-d H:i:s') . "] LOGGED ONLY – not delivered (MAIL_MAILER is not smtp)\n"
            . "To: {$to}\nSubject: {$rendered['subject']}\nTemplate: {$template}\n"
            . str_repeat('-', 80) . "\n{$rendered['text']}\n"
            . str_repeat('-', 80) . "\n[HTML]\n{$rendered['html']}\n{$line}\n\n";

        if (@file_put_contents($this->logPath, $entry, FILE_APPEND | LOCK_EX) === false) {
            throw new \RuntimeException('Mail log is not writable.');
        }
    }
}
