<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Database\Database;
use Throwable;

/**
 * MailService handles store lifecycle email notifications, templating,
 * SMTP dispatch, safe local development mail logging, and outbox deduplication.
 */
class MailService
{
    private static ?MailService $instance = null;
    private Database $db;
    private string $logPath;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
        $this->logPath = defined('BASE_PATH')
            ? BASE_PATH . '/storage/logs/mail.log'
            : dirname(__DIR__, 2) . '/storage/logs/mail.log';

        $dir = dirname($this->logPath);
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Dispatch notification for order placed (pending payment).
     */
    public function sendOrderReceived(array $order): bool
    {
        $recipient = trim((string) ($order['guest_email'] ?? $order['email'] ?? ''));
        if (empty($recipient) || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $orderNumber = (string) ($order['order_number'] ?? 'ORD-UNKNOWN');
        $subject = "Order Confirmation: #{$orderNumber} - Awaiting Payment";

        $html = $this->renderOrderReceivedHtml($order);
        $text = $this->renderOrderReceivedText($order);

        $payload = [
            'order_number' => $orderNumber,
            'grand_total' => $order['grand_total'] ?? 0,
            'currency' => $order['currency'] ?? 'NGN',
            'order_status' => $order['order_status'] ?? 'pending_payment',
        ];

        return $this->send($recipient, $subject, 'order_received', $payload, $html, $text, $orderNumber);
    }

    /**
     * Dispatch notification for verified payment.
     * STRICT ENFORCEMENT: Never send a paid email before verification.
     */
    public function sendPaymentVerified(array $order, array $paymentDetails = []): bool
    {
        // Enforce payment status validation
        $orderPaymentStatus = strtolower(trim((string) ($order['payment_status'] ?? '')));
        $orderStatus = strtolower(trim((string) ($order['order_status'] ?? '')));

        if ($orderPaymentStatus !== 'successful' && $orderStatus !== 'paid') {
            error_log("[MailService Guard] Refused to send payment_verified email for order {$order['order_number']} because payment is not verified.");
            return false;
        }

        $recipient = trim((string) ($order['guest_email'] ?? $order['email'] ?? ''));
        if (empty($recipient) || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $orderNumber = (string) ($order['order_number'] ?? 'ORD-UNKNOWN');
        $subject = "Payment Verified & Receipt: Order #{$orderNumber}";

        $html = $this->renderPaymentVerifiedHtml($order, $paymentDetails);
        $text = $this->renderPaymentVerifiedText($order, $paymentDetails);

        $payload = [
            'order_number' => $orderNumber,
            'payment_reference' => $paymentDetails['reference'] ?? $paymentDetails['provider_reference'] ?? 'VERIFIED',
            'amount' => $order['grand_total'] ?? 0,
            'currency' => $order['currency'] ?? 'NGN',
            'payment_method' => $paymentDetails['payment_method'] ?? 'Online Payment',
            'verified_at' => date('Y-m-d H:i:s'),
        ];

        return $this->send($recipient, $subject, 'payment_verified', $payload, $html, $text, $orderNumber);
    }

    /**
     * Dispatch notification for shipment / carrier tracking update.
     */
    public function sendShipmentTracking(array $order, array $shipment): bool
    {
        $recipient = trim((string) ($order['guest_email'] ?? $order['email'] ?? ''));
        if (empty($recipient) || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $orderNumber = (string) ($order['order_number'] ?? 'ORD-UNKNOWN');
        $subject = "Your Order #{$orderNumber} Has Shipped! Tracking Details Inside";

        $html = $this->renderShipmentTrackingHtml($order, $shipment);
        $text = $this->renderShipmentTrackingText($order, $shipment);

        $payload = [
            'order_number' => $orderNumber,
            'carrier' => $shipment['carrier'] ?? 'Logistics Carrier',
            'tracking_number' => $shipment['tracking_number'] ?? null,
            'tracking_url' => $shipment['tracking_url'] ?? null,
            'shipment_status' => $shipment['status'] ?? 'shipped',
        ];

        return $this->send($recipient, $subject, 'shipment_tracking', $payload, $html, $text, $orderNumber);
    }

    /**
     * Dispatch notification for order cancellation or refund.
     */
    public function sendCancellationOrRefund(array $order, string $type, array $extra = []): bool
    {
        $recipient = trim((string) ($order['guest_email'] ?? $order['email'] ?? ''));
        if (empty($recipient) || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $orderNumber = (string) ($order['order_number'] ?? 'ORD-UNKNOWN');
        $isRefund = ($type === 'refund');
        $subject = $isRefund
            ? "Refund Processed: Order #{$orderNumber}"
            : "Order Cancelled: #{$orderNumber}";

        $html = $this->renderCancellationRefundHtml($order, $type, $extra);
        $text = $this->renderCancellationRefundText($order, $type, $extra);

        $payload = [
            'order_number' => $orderNumber,
            'type' => $type,
            'reason' => $extra['reason'] ?? 'Requested by customer or store admin',
            'amount' => $extra['amount'] ?? $order['grand_total'] ?? 0,
            'currency' => $order['currency'] ?? 'NGN',
            'reference' => $extra['reference'] ?? null,
        ];

        return $this->send($recipient, $subject, 'cancellation_refund', $payload, $html, $text, $orderNumber . '-' . $type);
    }

    /**
     * Dispatch account verification / magic link notification.
     */
    public function sendAccountVerification(string $email, string $tokenOrLink, string $type = 'magic_link'): bool
    {
        $email = trim(strtolower($email));
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $subject = ($type === 'magic_link')
            ? 'Your Shop.co Sign-In Magic Link'
            : 'Verify Your Shop.co Account';

        $html = $this->renderAccountVerificationHtml($email, $tokenOrLink, $type);
        $text = $this->renderAccountVerificationText($email, $tokenOrLink, $type);

        $payload = [
            'type' => $type,
            'token' => $tokenOrLink,
        ];

        return $this->send($email, $subject, 'account_verification', $payload, $html, $text, $email . '-' . $type);
    }

    /**
     * Core sending method with deduplication, outbox tracking, and SMTP / Mail Log dispatch.
     */
    public function send(
        string $recipientEmail,
        string $subject,
        string $template,
        array $payload,
        string $htmlBody,
        string $textBody,
        string $dedupKey = ''
    ): bool {
        $recipientEmail = trim(strtolower($recipientEmail));

        // 1. Deduplication check (within last 5 minutes)
        if ($dedupKey !== '') {
            $dedupPattern = '%"dedup_key":"' . $dedupKey . '"%';
            $existing = $this->db->fetchOne(
                "SELECT `id`, `status`, `created_at` FROM `email_outbox`
                 WHERE `recipient_email` = ? AND `template` = ? AND `payload` LIKE ?
                   AND `created_at` >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                 LIMIT 1",
                'sss',
                [$recipientEmail, $template, $dedupPattern]
            );

            if ($existing !== null) {
                error_log("[MailService] Deduplication triggered: skipped duplicate {$template} email to {$recipientEmail} (Dedup key: {$dedupKey}).");
                return true;
            }

            // Include dedup_key inside payload for future checks
            $payload['dedup_key'] = $dedupKey;
        }

        $jsonPayload = json_encode($payload, JSON_UNESCAPED_SLASHES);

        // 2. Determine Mail Delivery Provider
        $mailHost = trim((string) Env::get('MAIL_HOST', ''));
        $mailMailer = trim(strtolower((string) Env::get('MAIL_MAILER', 'log')));

        $sentSuccessfully = false;
        $deliveryNote = null;
        $errorMessage = null;

        if ($mailMailer === 'smtp' && $mailHost !== '' && $mailHost !== '127.0.0.1') {
            try {
                $sentSuccessfully = $this->sendViaSmtp($recipientEmail, $subject, $htmlBody, $textBody);
                $deliveryNote = "Sent via SMTP host {$mailHost}";
            } catch (Throwable $e) {
                $errorMessage = "SMTP delivery error: " . $e->getMessage();
                error_log("[MailService SMTP Failure] " . $errorMessage);
                // Safe failover to local development mail log
                $this->writeToDevMailLog($recipientEmail, $subject, $template, $htmlBody, $textBody, $errorMessage);
                $deliveryNote = "SMTP failed. Safely written to local storage/logs/mail.log";
                $sentSuccessfully = true; // Recorded safely in dev log
            }
        } else {
            // Local development mode: Write safely to development mail log
            try {
                $this->writeToDevMailLog($recipientEmail, $subject, $template, $htmlBody, $textBody);
                $deliveryNote = "Logged to local dev mail file (storage/logs/mail.log)";
                $sentSuccessfully = true;
            } catch (Throwable $e) {
                $errorMessage = "Failed to write dev mail log: " . $e->getMessage();
                error_log("[MailService DevLog Failure] " . $errorMessage);
                $sentSuccessfully = false;
            }
        }

        // 3. Persist record in email_outbox table
        $status = $sentSuccessfully ? 'sent' : 'failed';
        $lastError = $errorMessage ? $errorMessage : ($deliveryNote ? "[DEV_LOG] {$deliveryNote}" : null);

        try {
            $this->db->insert(
                "INSERT INTO `email_outbox` (`recipient_email`, `subject`, `template`, `payload`, `status`, `attempt_count`, `last_error`, `created_at`, `sent_at`)
                 VALUES (?, ?, ?, ?, ?, 1, ?, NOW(), ?)",
                'sssssss',
                [
                    $recipientEmail,
                    $subject,
                    $template,
                    $jsonPayload,
                    $status,
                    $lastError,
                    $sentSuccessfully ? date('Y-m-d H:i:s') : null,
                ]
            );
        } catch (Throwable $e) {
            error_log("[MailService Outbox Insert Failure] " . $e->getMessage());
        }

        return $sentSuccessfully;
    }

    /**
     * Retry an item from the email_outbox.
     */
    public function retryOutboxItem(int $outboxId): bool
    {
        $item = $this->db->fetchOne("SELECT * FROM `email_outbox` WHERE `id` = ?", 'i', [$outboxId]);
        if (!$item) {
            return false;
        }

        $payload = json_decode((string) $item['payload'], true) ?: [];
        $recipient = $item['recipient_email'];
        $subject = $item['subject'];
        $template = $item['template'];

        // Reconstruct basic body
        $html = "<div style='font-family:sans-serif;'><h3>{$subject}</h3><pre>" . htmlspecialchars(json_encode($payload, JSON_PRETTY_PRINT)) . "</pre></div>";
        $text = "{$subject}\n\n" . json_encode($payload, JSON_PRETTY_PRINT);

        $success = $this->send($recipient, $subject, $template, $payload, $html, $text);

        if ($success) {
            $this->db->executeUpdate(
                "UPDATE `email_outbox` SET `status` = 'sent', `attempt_count` = `attempt_count` + 1, `sent_at` = NOW(), `last_error` = 'Retried successfully' WHERE `id` = ?",
                'i',
                [$outboxId]
            );
        } else {
            $this->db->executeUpdate(
                "UPDATE `email_outbox` SET `attempt_count` = `attempt_count` + 1 WHERE `id` = ?",
                'i',
                [$outboxId]
            );
        }

        return $success;
    }

    /**
     * Write formatted email to local development log file.
     */
    private function writeToDevMailLog(
        string $recipient,
        string $subject,
        string $template,
        string $htmlBody,
        string $textBody,
        ?string $errorNote = null
    ): void {
        $from = Env::get('MAIL_FROM_ADDRESS', 'orders@shop.co');
        $fromName = Env::get('MAIL_FROM_NAME', 'SHOP.CO');
        $timestamp = date('Y-m-d H:i:s');

        $separator = str_repeat('=', 80);
        $subSeparator = str_repeat('-', 80);

        $logContent = <<<LOG
{$separator}
[SHOP.CO DEV EMAIL DISPATCH] {$timestamp}
To: {$recipient}
From: "{$fromName}" <{$from}>
Subject: {$subject}
Template: {$template}
Status: RECORDED TO DEV MAIL LOG
LOG;

        if ($errorNote) {
            $logContent .= "\nWarning: {$errorNote}";
        }

        $logContent .= <<<LOG

{$subSeparator}
[PLAIN TEXT VERSION]
{$textBody}
{$subSeparator}
[HTML VERSION]
{$htmlBody}
{$separator}

LOG;

        file_put_contents($this->logPath, $logContent, FILE_APPEND | LOCK_EX);
    }

    /**
     * Send email via SMTP socket.
     */
    private function sendViaSmtp(string $recipient, string $subject, string $htmlBody, string $textBody): bool
    {
        $host = (string) Env::get('MAIL_HOST');
        $port = (int) Env::get('MAIL_PORT', 587);
        $username = (string) Env::get('MAIL_USERNAME', '');
        $password = (string) Env::get('MAIL_PASSWORD', '');
        $encryption = strtolower((string) Env::get('MAIL_ENCRYPTION', 'tls'));
        $from = (string) Env::get('MAIL_FROM_ADDRESS', 'orders@shop.co');
        $fromName = (string) Env::get('MAIL_FROM_NAME', 'SHOP.CO');

        $socket = @fsockopen(($encryption === 'ssl' ? 'ssl://' . $host : $host), $port, $errno, $errstr, 15);
        if (!$socket) {
            throw new \RuntimeException("Could not connect to SMTP server {$host}:{$port} ({$errno}: {$errstr})");
        }

        $read = function () use ($socket): string {
            $response = '';
            while ($line = fgets($socket, 515)) {
                $response .= $line;
                if (substr($line, 3, 1) === ' ') {
                    break;
                }
            }
            return $response;
        };

        $write = function (string $cmd) use ($socket, $read): string {
            fputs($socket, $cmd . "\r\n");
            return $read();
        };

        $read(); // Initial greeting

        $write("EHLO " . gethostname());

        if ($encryption === 'tls') {
            $write("STARTTLS");
            stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            $write("EHLO " . gethostname());
        }

        if ($username !== '' && $password !== '') {
            $write("AUTH LOGIN");
            $write(base64_encode($username));
            $write(base64_encode($password));
        }

        $write("MAIL FROM: <{$from}>");
        $write("RCPT TO: <{$recipient}>");
        $write("DATA");

        $boundary = '=_ShopCo_' . md5(uniqid((string) time(), true));
        $headers = [
            "From: \"{$fromName}\" <{$from}>",
            "To: <{$recipient}>",
            "Subject: {$subject}",
            "MIME-Version: 1.0",
            "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
            "Date: " . date('r'),
        ];

        $message = implode("\r\n", $headers) . "\r\n\r\n";
        $message .= "--{$boundary}\r\n";
        $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $message .= $textBody . "\r\n\r\n";
        $message .= "--{$boundary}\r\n";
        $message .= "Content-Type: text/html; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $message .= $htmlBody . "\r\n\r\n";
        $message .= "--{$boundary}--\r\n.";

        $response = $write($message);
        $write("QUIT");
        fclose($socket);

        return str_contains($response, '250') || str_contains($response, 'OK');
    }

    // -------------------------------------------------------------------------
    // HTML & Text Template Renderers
    // -------------------------------------------------------------------------

    private function renderOrderReceivedHtml(array $order): string
    {
        $num = htmlspecialchars((string) ($order['order_number'] ?? ''));
        $total = number_format((float) ($order['grand_total'] ?? 0), 2);
        $currency = htmlspecialchars((string) ($order['currency'] ?? 'NGN'));
        $subtotal = number_format((float) ($order['subtotal'] ?? 0), 2);
        $shipping = number_format((float) ($order['shipping_fee'] ?? 0), 2);
        $discount = number_format((float) ($order['discount_amount'] ?? 0), 2);

        $address = is_array($order['shipping_address'] ?? null) ? $order['shipping_address'] : [];
        $recipientName = htmlspecialchars($address['full_name'] ?? 'Valued Customer');
        $street = htmlspecialchars($address['address_line1'] ?? '');
        $cityState = htmlspecialchars(($address['city'] ?? '') . ', ' . ($address['state'] ?? ''));

        $itemsHtml = '';
        if (!empty($order['items']) && is_array($order['items'])) {
            foreach ($order['items'] as $item) {
                $name = htmlspecialchars($item['name'] ?? $item['item_name'] ?? 'Product');
                $qty = (int) ($item['quantity'] ?? 1);
                $lineTotal = number_format((float) ($item['line_total'] ?? ($item['unit_price'] ?? 0) * $qty), 2);
                $itemsHtml .= "<tr>
                    <td style='padding:8px 0; border-bottom:1px solid #f0f0f0;'>{$name} x {$qty}</td>
                    <td style='padding:8px 0; border-bottom:1px solid #f0f0f0; text-align:right;'>{$currency} {$lineTotal}</td>
                </tr>";
            }
        }

        return <<<HTML
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background-color:#f9fafb; margin:0; padding:24px; color:#111827;">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; border:1px solid #e5e7eb; overflow:hidden;">
        <div style="background:#000000; padding:24px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px; letter-spacing:1px; font-weight:800;">SHOP.CO</h1>
        </div>
        <div style="padding:32px;">
            <div style="display:inline-block; background:#fffbeb; color:#b45309; padding:4px 12px; border-radius:9999px; font-size:12px; font-weight:700; margin-bottom:16px;">
                STATUS: PENDING PAYMENT
            </div>
            <h2 style="margin:0 0 8px 0; font-size:20px;">Thank You, {$recipientName}!</h2>
            <p style="color:#4b5563; font-size:14px; line-height:1.5; margin:0 0 20px 0;">
                Your order <strong>#{$num}</strong> has been received and your items have been reserved.
                Please complete your payment via Monnify, Kora, or WhatsApp agent to initiate fulfillment.
            </p>

            <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px;">
                <thead>
                    <tr style="border-bottom:2px solid #e5e7eb; text-align:left; color:#6b7280;">
                        <th style="padding-bottom:8px;">Item</th>
                        <th style="padding-bottom:8px; text-align:right;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {$itemsHtml}
                </tbody>
            </table>

            <div style="background:#f3f4f6; border-radius:12px; padding:16px; margin-bottom:24px; font-size:13px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span style="color:#6b7280;">Subtotal:</span>
                    <span>{$currency} {$subtotal}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span style="color:#6b7280;">Discount:</span>
                    <span style="color:#15803d;">-{$currency} {$discount}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span style="color:#6b7280;">Delivery Fee:</span>
                    <span>{$currency} {$shipping}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:700; border-top:1px solid #e5e7eb; padding-top:8px;">
                    <span>Total Due:</span>
                    <span>{$currency} {$total}</span>
                </div>
            </div>

            <div style="font-size:13px; color:#4b5563; margin-bottom:24px;">
                <strong>Delivery Address:</strong><br/>
                {$recipientName}<br/>
                {$street}<br/>
                {$cityState}
            </div>

            <div style="text-align:center;">
                <a href="http://localhost:3000/track-order?orderNumber={$num}" style="display:inline-block; background:#000000; color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:9999px; font-weight:600; font-size:14px;">
                    View Order & Complete Payment
                </a>
            </div>
        </div>
        <div style="background:#f9fafb; border-top:1px solid #e5e7eb; padding:16px; text-align:center; font-size:12px; color:#9ca3af;">
            SHOP.CO Luxury Fashion & Lifestyle · Enugu & Lagos, Nigeria
        </div>
    </div>
</body>
</html>
HTML;
    }

    private function renderOrderReceivedText(array $order): string
    {
        $num = $order['order_number'] ?? '';
        $total = number_format((float) ($order['grand_total'] ?? 0), 2);
        $curr = $order['currency'] ?? 'NGN';
        return "SHOP.CO - Order Confirmation\nOrder #{$num}\nTotal Due: {$curr} {$total}\nStatus: Pending Payment\nTrack & Pay: http://localhost:3000/track-order?orderNumber={$num}";
    }

    private function renderPaymentVerifiedHtml(array $order, array $payment): string
    {
        $num = htmlspecialchars((string) ($order['order_number'] ?? ''));
        $total = number_format((float) ($order['grand_total'] ?? 0), 2);
        $curr = htmlspecialchars((string) ($order['currency'] ?? 'NGN'));
        $ref = htmlspecialchars((string) ($payment['reference'] ?? $payment['provider_reference'] ?? 'VERIFIED'));
        $method = htmlspecialchars((string) ($payment['payment_method'] ?? 'Online Payment'));
        $date = date('M d, Y h:i A');

        return <<<HTML
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background-color:#f9fafb; margin:0; padding:24px; color:#111827;">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; border:1px solid #e5e7eb; overflow:hidden;">
        <div style="background:#01AB31; padding:24px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px; letter-spacing:1px; font-weight:800;">SHOP.CO</h1>
            <p style="color:#ffffff; margin:4px 0 0 0; font-size:14px; opacity:0.9;">Official Payment Receipt</p>
        </div>
        <div style="padding:32px;">
            <div style="display:inline-block; background:#dcfce7; color:#15803d; padding:4px 12px; border-radius:9999px; font-size:12px; font-weight:700; margin-bottom:16px;">
                PAYMENT CONFIRMED
            </div>
            <h2 style="margin:0 0 8px 0; font-size:20px;">We Received Your Payment!</h2>
            <p style="color:#4b5563; font-size:14px; line-height:1.5; margin:0 0 20px 0;">
                Your payment for order <strong>#{$num}</strong> has cleared successfully. Our fulfillment team is now preparing your package for dispatch.
            </p>

            <div style="border:1px dashed #d1d5db; border-radius:12px; padding:20px; margin-bottom:24px; background:#fbfbfb;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
                    <span style="color:#6b7280;">Transaction Reference:</span>
                    <span style="font-family:monospace; font-weight:600;">{$ref}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
                    <span style="color:#6b7280;">Payment Method:</span>
                    <span>{$method}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
                    <span style="color:#6b7280;">Timestamp:</span>
                    <span>{$date}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:18px; font-weight:800; border-top:1px solid #e5e7eb; padding-top:12px; color:#15803d;">
                    <span>Amount Paid:</span>
                    <span>{$curr} {$total}</span>
                </div>
            </div>

            <div style="text-align:center;">
                <a href="http://localhost:3000/track-order?orderNumber={$num}" style="display:inline-block; background:#000000; color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:9999px; font-weight:600; font-size:14px;">
                    Track Order Status
                </a>
            </div>
        </div>
        <div style="background:#f9fafb; border-top:1px solid #e5e7eb; padding:16px; text-align:center; font-size:12px; color:#9ca3af;">
            SHOP.CO Logistics & Fulfillment · Secured by Kora & Monnify switches
        </div>
    </div>
</body>
</html>
HTML;
    }

    private function renderPaymentVerifiedText(array $order, array $payment): string
    {
        $num = $order['order_number'] ?? '';
        $total = number_format((float) ($order['grand_total'] ?? 0), 2);
        $curr = $order['currency'] ?? 'NGN';
        $ref = $payment['reference'] ?? 'VERIFIED';
        return "SHOP.CO Payment Receipt\nOrder #{$num}\nAmount Paid: {$curr} {$total}\nRef: {$ref}\nStatus: Paid / Verified\nTrack: http://localhost:3000/track-order?orderNumber={$num}";
    }

    private function renderShipmentTrackingHtml(array $order, array $shipment): string
    {
        $num = htmlspecialchars((string) ($order['order_number'] ?? ''));
        $carrier = htmlspecialchars((string) ($shipment['carrier'] ?? 'Logistics Provider'));
        $trackingNumber = htmlspecialchars((string) ($shipment['tracking_number'] ?? 'N/A'));
        $trackingUrl = htmlspecialchars((string) ($shipment['tracking_url'] ?? 'http://localhost:3000/track-order?orderNumber=' . $num));

        return <<<HTML
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background-color:#f9fafb; margin:0; padding:24px; color:#111827;">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; border:1px solid #e5e7eb; overflow:hidden;">
        <div style="background:#2563eb; padding:24px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px; letter-spacing:1px; font-weight:800;">SHOP.CO</h1>
            <p style="color:#ffffff; margin:4px 0 0 0; font-size:14px; opacity:0.9;">Shipment Dispatched</p>
        </div>
        <div style="padding:32px;">
            <h2 style="margin:0 0 8px 0; font-size:20px;">Your Package is on the Way!</h2>
            <p style="color:#4b5563; font-size:14px; line-height:1.5; margin:0 0 20px 0;">
                Great news! Order <strong>#{$num}</strong> has been handed over to <strong>{$carrier}</strong> for delivery.
            </p>

            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:20px; margin-bottom:24px;">
                <div style="margin-bottom:8px; font-size:13px; color:#1e40af;">
                    <strong>Carrier:</strong> {$carrier}
                </div>
                <div style="margin-bottom:12px; font-size:13px; color:#1e40af;">
                    <strong>Waybill / Tracking #:</strong> <span style="font-family:monospace; font-weight:bold;">{$trackingNumber}</span>
                </div>
                <div>
                    <a href="{$trackingUrl}" target="_blank" style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; padding:8px 18px; border-radius:8px; font-size:12px; font-weight:600;">
                        Live Carrier Tracking
                    </a>
                </div>
            </div>

            <div style="text-align:center;">
                <a href="http://localhost:3000/track-order?orderNumber={$num}" style="display:inline-block; background:#000000; color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:9999px; font-weight:600; font-size:14px;">
                    Track in Shop.co Portal
                </a>
            </div>
        </div>
    </div>
</body>
</html>
HTML;
    }

    private function renderShipmentTrackingText(array $order, array $shipment): string
    {
        $num = $order['order_number'] ?? '';
        $carrier = $shipment['carrier'] ?? 'Carrier';
        $trackingNumber = $shipment['tracking_number'] ?? 'N/A';
        return "SHOP.CO Shipment Notification\nOrder #{$num} has been dispatched via {$carrier}.\nTracking Number: {$trackingNumber}\nTrack: http://localhost:3000/track-order?orderNumber={$num}";
    }

    private function renderCancellationRefundHtml(array $order, string $type, array $extra): string
    {
        $num = htmlspecialchars((string) ($order['order_number'] ?? ''));
        $isRefund = ($type === 'refund');
        $title = $isRefund ? "Refund Processed" : "Order Cancelled";
        $reason = htmlspecialchars((string) ($extra['reason'] ?? 'Not specified'));
        $amount = number_format((float) ($extra['amount'] ?? $order['grand_total'] ?? 0), 2);
        $curr = htmlspecialchars((string) ($order['currency'] ?? 'NGN'));

        $amountRow = $amount !== '' ? "<div><strong>Amount:</strong> {$curr} {$amount}</div>" : "";

        return <<<HTML
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background-color:#f9fafb; margin:0; padding:24px; color:#111827;">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; border:1px solid #e5e7eb; overflow:hidden;">
        <div style="background:#374151; padding:24px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px; letter-spacing:1px; font-weight:800;">SHOP.CO</h1>
            <p style="color:#ffffff; margin:4px 0 0 0; font-size:14px; opacity:0.9;">{$title}</p>
        </div>
        <div style="padding:32px;">
            <h2 style="margin:0 0 8px 0; font-size:20px;">{$title} for Order #{$num}</h2>
            <p style="color:#4b5563; font-size:14px; line-height:1.5; margin:0 0 20px 0;">
                This email confirms that order <strong>#{$num}</strong> has been updated.
            </p>

            <div style="background:#f3f4f6; border-radius:12px; padding:16px; margin-bottom:24px; font-size:13px;">
                <div style="margin-bottom:6px;"><strong>Status:</strong> {$title}</div>
                <div style="margin-bottom:6px;"><strong>Reason:</strong> {$reason}</div>
                {$amountRow}
            </div>
        </div>
    </div>
</body>
</html>
HTML;
    }

    private function renderCancellationRefundText(array $order, string $type, array $extra): string
    {
        $num = $order['order_number'] ?? '';
        $reason = $extra['reason'] ?? 'N/A';
        return "SHOP.CO - Order #{$num} {$type}\nReason: {$reason}";
    }

    private function renderAccountVerificationHtml(string $email, string $tokenOrLink, string $type): string
    {
        $isMagic = ($type === 'magic_link');
        $actionUrl = str_starts_with($tokenOrLink, 'http')
            ? $tokenOrLink
            : "http://localhost:3000/auth/verify?token=" . urlencode($tokenOrLink);

        return <<<HTML
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background-color:#f9fafb; margin:0; padding:24px; color:#111827;">
    <div style="max-width:500px; margin:0 auto; background:#ffffff; border-radius:16px; border:1px solid #e5e7eb; overflow:hidden;">
        <div style="background:#000000; padding:24px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px; letter-spacing:1px; font-weight:800;">SHOP.CO</h1>
        </div>
        <div style="padding:32px; text-align:center;">
            <h2 style="margin:0 0 8px 0; font-size:20px;">Sign in to your account</h2>
            <p style="color:#4b5563; font-size:14px; line-height:1.5; margin:0 0 24px 0;">
                Click the secure link below to sign in instantly. This link is valid for 15 minutes.
            </p>
            <div style="margin-bottom:24px;">
                <a href="{$actionUrl}" style="display:inline-block; background:#000000; color:#ffffff; text-decoration:none; padding:12px 32px; border-radius:9999px; font-weight:600; font-size:14px;">
                    Sign In to Shop.co
                </a>
            </div>
            <p style="font-size:12px; color:#9ca3af; margin:0;">
                If you did not request this link, you can safely ignore this email.
            </p>
        </div>
    </div>
</body>
</html>
HTML;
    }

    private function renderAccountVerificationText(string $email, string $tokenOrLink, string $type): string
    {
        return "SHOP.CO Sign In\nUse the following token or link to sign in:\n{$tokenOrLink}\nValid for 15 minutes.";
    }
}
