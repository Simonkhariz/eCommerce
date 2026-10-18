<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Database\Database;
use InvalidArgumentException;

/**
 * Renders outbox payloads into email subject / HTML / plain text.
 *
 * Every value is escaped; layouts use tables (email clients ignore flexbox). Store name and
 * contact details come from store_settings; nothing is invented when a setting is empty.
 * Payloads carry everything a template needs (version 2), so an email can be (re)sent later
 * by the outbox worker without touching the order again.
 */
final class MailTemplates
{
    public const VERSION = 2;

    /** Templates the outbox can render (and therefore retry) from their stored payload. */
    public const RENDERABLE = [
        'order_received',
        'payment_verified',
        'shipment_tracking',
        'order_cancelled',
        'refund_processed',
        'marketing_broadcast',
    ];

    private string $frontendUrl;
    /** @var array{name: string, email: string, phone: string, whatsapp: string} */
    private array $store;

    public function __construct(?Database $db = null)
    {
        $this->frontendUrl = Env::frontendUrl();
        $settings = array_column(($db ?? Database::getInstance())->fetchAll(
            "SELECT `key_name`, `value` FROM `store_settings`
             WHERE `key_name` IN ('store_name', 'store_contact_email', 'store_contact_phone', 'store_whatsapp_phone')"
        ), 'value', 'key_name');

        $this->store = [
            'name' => trim((string) ($settings['store_name'] ?? '')) ?: 'SHOP.CO',
            'email' => trim((string) ($settings['store_contact_email'] ?? '')),
            'phone' => trim((string) ($settings['store_contact_phone'] ?? '')),
            'whatsapp' => trim((string) ($settings['store_whatsapp_phone'] ?? '')) ?: trim((string) Env::get('STORE_WHATSAPP_PHONE', '')),
        ];
    }

    public function storeName(): string
    {
        return $this->store['name'];
    }

    /**
     * @param array<string, mixed> $p Payload
     * @return array{subject: string, html: string, text: string}
     */
    public function render(string $template, array $p): array
    {
        return match ($template) {
            'order_received' => $this->orderReceived($p),
            'payment_verified' => $this->paymentVerified($p),
            'shipment_tracking' => $this->shipmentTracking($p),
            'order_cancelled' => $this->orderCancelled($p),
            'refund_processed' => $this->refundProcessed($p),
            'marketing_broadcast' => $this->marketingBroadcast($p),
            'magic_link' => $this->magicLink($p),
            default => throw new InvalidArgumentException("Unknown email template '{$template}'."),
        };
    }

    // -------------------------------------------------------------------------
    // Templates
    // -------------------------------------------------------------------------

    private function orderReceived(array $p): array
    {
        $num = (string) $p['order_number'];
        $subject = "Order {$num} received – complete your payment";
        $deadline = !empty($p['expires_at']) ? $this->dateTime((string) $p['expires_at']) : null;

        $intro = '<p style="margin:0 0 12px">Hi ' . $this->e($this->firstName($p)) . ',</p>'
            . '<p style="margin:0 0 16px">Thanks for your order <strong>' . $this->e($num) . '</strong>. We have reserved your items'
            . ($deadline ? ' until <strong>' . $this->e($deadline) . '</strong>' : '')
            . '. Your order is confirmed once payment is verified.</p>';

        $html = $this->layout(
            'Order received',
            $intro
            . $this->itemsTable($p)
            . $this->totalsTable($p, 'Total to pay')
            . $this->addressBlock($p)
            . $this->button($this->trackUrl($num), 'View order and pay')
            . '<p style="margin:16px 0 0;color:#6b7280;font-size:13px">To open your order, use this order number with the email you checked out with.</p>'
        );

        $text = "Hi {$this->firstName($p)},\n\n"
            . "Thanks for your order {$num}. We have reserved your items" . ($deadline ? " until {$deadline}" : '') . ".\n"
            . "Your order is confirmed once payment is verified.\n\n"
            . $this->itemsText($p)
            . $this->totalsText($p, 'Total to pay')
            . "\nView order and pay: {$this->trackUrl($num)}\n"
            . $this->footerText();

        return compact('subject', 'html', 'text');
    }

    private function paymentVerified(array $p): array
    {
        $num = (string) $p['order_number'];
        $subject = "Payment received for order {$num}";

        $rows = [
            ['Amount paid', $this->money($p['amount_paid'] ?? $p['grand_total'], $p['currency'] ?? 'NGN')],
            ['Paid with', (string) ($p['payment_label'] ?? '')],
            ['Payment reference', (string) ($p['payment_reference'] ?? '')],
            ['Confirmed', !empty($p['verified_at']) ? $this->dateTime((string) $p['verified_at']) : ''],
        ];

        $html = $this->layout(
            'Payment received',
            '<p style="margin:0 0 12px">Hi ' . $this->e($this->firstName($p)) . ',</p>'
            . '<p style="margin:0 0 16px">We have received your payment for order <strong>' . $this->e($num) . '</strong>. We are now preparing it for delivery and will email you the tracking details when it ships.</p>'
            . $this->keyValueTable($rows)
            . $this->itemsTable($p)
            . $this->totalsTable($p, 'Total')
            . $this->addressBlock($p)
            . $this->button($this->trackUrl($num), 'Track your order')
        );

        $text = "Hi {$this->firstName($p)},\n\nWe have received your payment for order {$num}.\n\n"
            . $this->keyValueText($rows) . "\n"
            . $this->itemsText($p)
            . $this->totalsText($p, 'Total')
            . "\nTrack your order: {$this->trackUrl($num)}\n"
            . $this->footerText();

        return compact('subject', 'html', 'text');
    }

    private function shipmentTracking(array $p): array
    {
        $num = (string) $p['order_number'];
        $subject = "Order {$num} has shipped";
        $trackingUrl = (string) ($p['tracking_url'] ?? '');
        $trackingUrl = str_starts_with($trackingUrl, 'https://') ? $trackingUrl : '';

        $rows = [
            ['Courier', (string) ($p['carrier'] ?? '')],
            ['Tracking number', (string) ($p['tracking_number'] ?? '')],
            ['Estimated delivery', (string) ($p['estimated_days'] ?? '')],
        ];

        $html = $this->layout(
            'Your order is on its way',
            '<p style="margin:0 0 12px">Hi ' . $this->e($this->firstName($p)) . ',</p>'
            . '<p style="margin:0 0 16px">Order <strong>' . $this->e($num) . '</strong> has been handed to the courier.</p>'
            . $this->keyValueTable($rows)
            . ($trackingUrl !== '' ? $this->button($trackingUrl, 'Track with the courier') : '')
            . '<p style="margin:16px 0 0"><a href="' . $this->e($this->trackUrl($num)) . '" style="color:#111827">See your order</a></p>'
        );

        $text = "Hi {$this->firstName($p)},\n\nOrder {$num} has been handed to the courier.\n\n"
            . $this->keyValueText($rows)
            . ($trackingUrl !== '' ? "Track with the courier: {$trackingUrl}\n" : '')
            . "See your order: {$this->trackUrl($num)}\n"
            . $this->footerText();

        return compact('subject', 'html', 'text');
    }

    private function orderCancelled(array $p): array
    {
        $num = (string) $p['order_number'];
        $subject = "Order {$num} has been cancelled";
        $paid = (bool) ($p['was_paid'] ?? false);
        $reason = trim((string) ($p['reason'] ?? ''));

        $body = $paid
            ? 'Your payment of <strong>' . $this->e($this->money($p['amount_paid'] ?? 0, $p['currency'] ?? 'NGN')) . '</strong> will be refunded. We will email you when the refund has been sent.'
            : 'No payment was taken for this order.';

        $html = $this->layout(
            'Order cancelled',
            '<p style="margin:0 0 12px">Hi ' . $this->e($this->firstName($p)) . ',</p>'
            . '<p style="margin:0 0 12px">Order <strong>' . $this->e($num) . '</strong> has been cancelled.</p>'
            . ($reason !== '' ? '<p style="margin:0 0 12px;color:#4b5563">Reason: ' . $this->e($reason) . '</p>' : '')
            . '<p style="margin:0 0 16px">' . $body . '</p>'
            . $this->contactLine()
        );

        $text = "Hi {$this->firstName($p)},\n\nOrder {$num} has been cancelled.\n"
            . ($reason !== '' ? "Reason: {$reason}\n" : '')
            . ($paid ? "Your payment of {$this->money($p['amount_paid'] ?? 0, $p['currency'] ?? 'NGN')} will be refunded.\n" : "No payment was taken for this order.\n")
            . $this->footerText();

        return compact('subject', 'html', 'text');
    }

    private function refundProcessed(array $p): array
    {
        $num = (string) $p['order_number'];
        $amount = $this->money($p['amount'] ?? 0, $p['currency'] ?? 'NGN');
        $subject = "Refund of {$amount} for order {$num}";
        $reference = trim((string) ($p['refund_reference'] ?? ''));

        $rows = [
            ['Amount refunded', $amount],
            ['Order', $num],
            ['Refund reference', $reference],
        ];

        $html = $this->layout(
            'Refund sent',
            '<p style="margin:0 0 12px">Hi ' . $this->e($this->firstName($p)) . ',</p>'
            . '<p style="margin:0 0 16px">We have sent you a refund. Depending on your bank it can take a few business days to show in your account.</p>'
            . $this->keyValueTable($rows)
            . $this->contactLine()
        );

        $text = "Hi {$this->firstName($p)},\n\nWe have sent you a refund. Depending on your bank it can take a few business days to show in your account.\n\n"
            . $this->keyValueText($rows)
            . $this->footerText();

        return compact('subject', 'html', 'text');
    }

    private function marketingBroadcast(array $p): array
    {
        $subject = (string) $p['subject'];
        $unsubscribe = (string) ($p['unsubscribe_url'] ?? '');
        $content = (string) $p['content'];

        $paragraphs = array_filter(array_map('trim', preg_split("/\R{2,}/", $content) ?: []));
        $htmlBody = '';
        foreach ($paragraphs as $para) {
            $htmlBody .= '<p style="margin:0 0 14px">' . nl2br($this->e($para)) . '</p>';
        }

        $footer = $unsubscribe !== ''
            ? '<p style="margin:16px 0 0;font-size:12px;color:#6b7280">You are receiving this because you subscribed to the ' . $this->e($this->store['name']) . ' newsletter. <a href="' . $this->e($unsubscribe) . '" style="color:#6b7280">Unsubscribe</a></p>'
            : '';

        $html = $this->layout($subject, $htmlBody . $this->button($this->frontendUrl . '/category', 'Visit the store') . $footer);
        $text = $content . "\n\nVisit the store: {$this->frontendUrl}/category\n"
            . ($unsubscribe !== '' ? "\nUnsubscribe: {$unsubscribe}\n" : '')
            . $this->footerText();

        return compact('subject', 'html', 'text');
    }

    private function magicLink(array $p): array
    {
        $link = (string) $p['link'];
        $minutes = (int) ($p['ttl_minutes'] ?? 15);
        $subject = "Your sign-in link for {$this->store['name']}";

        $html = $this->layout(
            'Sign in',
            '<p style="margin:0 0 16px">Use the button below to sign in. The link works once and expires in ' . $minutes . ' minutes.</p>'
            . $this->button($link, 'Sign in')
            . '<p style="margin:16px 0 0;font-size:12px;color:#6b7280">If you did not ask for this, you can ignore this email.</p>'
        );
        $text = "Sign in to {$this->store['name']}:\n{$link}\n\nThe link works once and expires in {$minutes} minutes.\nIf you did not ask for this, you can ignore this email.\n";

        return compact('subject', 'html', 'text');
    }

    // -------------------------------------------------------------------------
    // Building blocks
    // -------------------------------------------------------------------------

    private function layout(string $heading, string $body): string
    {
        $name = $this->e($this->store['name']);
        $headingE = $this->e($heading);
        $footer = $this->footerHtml();

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{$headingE}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
      <tr><td style="background:#111827;padding:20px 24px;border-radius:12px 12px 0 0;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:1px">{$name}</td></tr>
      <tr><td style="padding:24px;font-size:15px;line-height:1.5">
        <h1 style="margin:0 0 16px;font-size:20px">{$headingE}</h1>
        {$body}
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">{$footer}</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
    }

    private function footerHtml(): string
    {
        $parts = [$this->e($this->store['name'])];
        if ($this->store['email'] !== '') {
            $parts[] = '<a href="mailto:' . $this->e($this->store['email']) . '" style="color:#6b7280">' . $this->e($this->store['email']) . '</a>';
        }
        if ($this->store['phone'] !== '') {
            $parts[] = $this->e($this->store['phone']);
        }
        return implode(' · ', $parts);
    }

    private function footerText(): string
    {
        $parts = array_filter([$this->store['name'], $this->store['email'], $this->store['phone']]);
        return "\n--\n" . implode(' · ', $parts) . "\n";
    }

    private function contactLine(): string
    {
        $ways = [];
        if ($this->store['email'] !== '') {
            $ways[] = 'email <a href="mailto:' . $this->e($this->store['email']) . '" style="color:#111827">' . $this->e($this->store['email']) . '</a>';
        }
        if ($this->store['whatsapp'] !== '') {
            $ways[] = 'WhatsApp ' . $this->e($this->store['whatsapp']);
        }
        return $ways === [] ? '' : '<p style="margin:0;color:#4b5563">Questions? ' . implode(' or ', $ways) . '.</p>';
    }

    private function button(string $url, string $label): string
    {
        return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0"><tr><td style="background:#111827;border-radius:999px">'
            . '<a href="' . $this->e($url) . '" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">' . $this->e($label) . '</a>'
            . '</td></tr></table>';
    }

    private function itemsTable(array $p): string
    {
        $items = is_array($p['items'] ?? null) ? $p['items'] : [];
        if ($items === []) {
            return '';
        }
        $currency = (string) ($p['currency'] ?? 'NGN');
        $rows = '';
        foreach ($items as $item) {
            $options = trim((string) ($item['options'] ?? ''));
            $rows .= '<tr>'
                . '<td style="padding:8px 0;border-bottom:1px solid #f3f4f6">' . $this->e((string) $item['name'])
                . ($options !== '' ? '<br><span style="color:#6b7280;font-size:13px">' . $this->e($options) . '</span>' : '')
                . '</td>'
                . '<td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:center;white-space:nowrap">× ' . (int) $item['quantity'] . '</td>'
                . '<td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap">' . $this->e($this->money($item['line_total'], $currency)) . '</td>'
                . '</tr>';
        }
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px">' . $rows . '</table>';
    }

    private function itemsText(array $p): string
    {
        $items = is_array($p['items'] ?? null) ? $p['items'] : [];
        $out = '';
        foreach ($items as $item) {
            $options = trim((string) ($item['options'] ?? ''));
            $out .= '- ' . $item['name'] . ($options !== '' ? " ({$options})" : '') . ' x' . (int) $item['quantity']
                . '  ' . $this->money($item['line_total'], (string) ($p['currency'] ?? 'NGN')) . "\n";
        }
        return $out === '' ? '' : $out . "\n";
    }

    /** @return list<array{0: string, 1: string}> */
    private function totalRows(array $p, string $totalLabel): array
    {
        $c = (string) ($p['currency'] ?? 'NGN');
        $rows = [['Subtotal', $this->money($p['subtotal'] ?? 0, $c)]];
        if ((float) ($p['discount_amount'] ?? 0) > 0) {
            $label = !empty($p['promo_code']) ? "Discount ({$p['promo_code']})" : 'Discount';
            $rows[] = [$label, '−' . $this->money($p['discount_amount'], $c)];
        }
        $delivery = 'Delivery' . (!empty($p['zone_name']) ? " ({$p['zone_name']})" : '');
        $rows[] = [$delivery, $this->money($p['shipping_fee'] ?? 0, $c)];
        $rows[] = [$totalLabel, $this->money($p['grand_total'] ?? 0, $c)];
        return $rows;
    }

    private function totalsTable(array $p, string $totalLabel): string
    {
        $rows = $this->totalRows($p, $totalLabel);
        $html = '';
        $last = count($rows) - 1;
        foreach ($rows as $i => [$label, $value]) {
            $style = $i === $last ? 'padding:8px 0 0;border-top:1px solid #e5e7eb;font-weight:bold;font-size:16px' : 'padding:2px 0;color:#4b5563';
            $html .= '<tr><td style="' . $style . '">' . $this->e($label) . '</td><td style="' . $style . ';text-align:right">' . $this->e($value) . '</td></tr>';
        }
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px">' . $html . '</table>';
    }

    private function totalsText(array $p, string $totalLabel): string
    {
        return $this->keyValueText($this->totalRows($p, $totalLabel));
    }

    /** @param list<array{0: string, 1: string}> $rows */
    private function keyValueTable(array $rows): string
    {
        $html = '';
        foreach ($rows as [$label, $value]) {
            if (trim($value) === '') {
                continue;
            }
            $html .= '<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">' . $this->e($label)
                . '</td><td style="padding:4px 0;font-weight:bold;word-break:break-all">' . $this->e($value) . '</td></tr>';
        }
        return $html === '' ? '' : '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px">' . $html . '</table>';
    }

    /** @param list<array{0: string, 1: string}> $rows */
    private function keyValueText(array $rows): string
    {
        $out = '';
        foreach ($rows as [$label, $value]) {
            if (trim($value) !== '') {
                $out .= "{$label}: {$value}\n";
            }
        }
        return $out;
    }

    private function addressBlock(array $p): string
    {
        $a = is_array($p['address'] ?? null) ? $p['address'] : [];
        $lines = array_filter([
            $a['full_name'] ?? '',
            $a['address_line1'] ?? '',
            $a['address_line2'] ?? '',
            trim(($a['city'] ?? '') . ', ' . ($a['state'] ?? ''), ', '),
            $a['phone'] ?? '',
        ], static fn ($v) => trim((string) $v) !== '');
        if ($lines === []) {
            return '';
        }
        return '<p style="margin:0 0 8px;font-size:14px;color:#4b5563"><strong style="color:#111827">Delivering to</strong><br>'
            . implode('<br>', array_map(fn ($l) => $this->e((string) $l), $lines)) . '</p>';
    }

    private function trackUrl(string $orderNumber): string
    {
        return $this->frontendUrl . '/track-order?order=' . rawurlencode($orderNumber);
    }

    private function firstName(array $p): string
    {
        $name = trim((string) ($p['customer_name'] ?? ''));
        return $name === '' ? 'there' : explode(' ', $name)[0];
    }

    private function money(mixed $amount, string $currency): string
    {
        $symbol = strtoupper($currency) === 'NGN' ? '₦' : strtoupper($currency) . ' ';
        return $symbol . number_format((float) $amount, 2);
    }

    private function dateTime(string $value): string
    {
        $ts = strtotime($value);
        return $ts === false ? $value : date('j M Y, g:i a', $ts);
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
