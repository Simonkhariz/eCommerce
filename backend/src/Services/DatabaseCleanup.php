<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Database;

/**
 * Removes data the store no longer needs, so the database stays small and personal data is
 * not kept longer than the admin chose (admin → Data & storage). Money records (order totals
 * and items, payments, refunds) are never deleted: tax rules require them to be kept.
 *
 * Retention settings (store_settings, days; 0 = keep):
 *   retention_customer_days  (off)  customers with no sign-in and no order for this long: their
 *                                   account, saved addresses, cart and wishlist are deleted, and
 *                                   the name, phone, email and street address on their finished
 *                                   orders are removed. Anyone with an open order is skipped.
 *   retention_unpaid_days    (30)   cancelled orders that were never paid; abandoned guest carts
 *   retention_message_days   (180)  sent/failed emails and raw payment gateway notifications
 *   retention_activity_days  (off)  admin activity log and stock history
 * Expired sign-in sessions and links, old rate-limit counters and slow-request records older
 * than 30 days are always removed.
 */
final class DatabaseCleanup
{
    /** The choices offered in admin for each setting (days; 0 = keep). */
    public const OPTIONS = [
        'retention_customer_days' => [0, 90, 180, 365, 730],
        'retention_unpaid_days' => [7, 30, 90],
        'retention_message_days' => [90, 180, 365],
        'retention_activity_days' => [0, 365, 730, 1825],
    ];

    public const DEFAULTS = [
        'retention_customer_days' => 0,
        'retention_unpaid_days' => 30,
        'retention_message_days' => 180,
        'retention_activity_days' => 0,
    ];

    /** What each rule removes, for the admin screen and the script output. */
    public const LABELS = [
        'inactive_customers' => 'Inactive customers (personal details removed)',
        'inactive_customer_accounts' => 'Their customer accounts deleted',
        'inactive_customer_orders' => 'Their orders anonymised (totals kept)',
        'expired_sessions' => 'Expired sign-in sessions',
        'used_or_expired_sign_in_links' => 'Used or expired sign-in links',
        'old_rate_limit_counters' => 'Old rate-limit counters',
        'old_slow_request_records' => 'Slow-request records older than 30 days',
        'unpaid_cancelled_orders' => 'Cancelled orders that were never paid',
        'abandoned_guest_carts' => 'Abandoned guest carts',
        'old_emails' => 'Old sent and failed emails',
        'old_gateway_notifications' => 'Old payment gateway notifications',
        'unsubscribed_newsletter_emails' => 'Unsubscribed newsletter addresses',
        'old_admin_activity' => 'Old admin activity log entries',
        'old_stock_history' => 'Old stock history entries',
    ];

    /** An order in one of these states still needs the customer's details. */
    private const OPEN_ORDER_STATES = "'pending_payment', 'paid', 'processing', 'shipped', 'refund_pending'";
    private const LAST_RUN_KEY = 'cleanup_last_run';

    private Database $db;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
    }

    /**
     * Saved retention settings; a missing or unknown value falls back to the default.
     *
     * @return array<string, int>
     */
    public function settings(): array
    {
        $rows = array_column($this->db->fetchAll(
            "SELECT `key_name`, `value` FROM `store_settings` WHERE `key_name` IN ('" . implode("', '", array_keys(self::DEFAULTS)) . "')"
        ), 'value', 'key_name');

        $out = [];
        foreach (self::DEFAULTS as $key => $default) {
            $value = isset($rows[$key]) && is_numeric($rows[$key]) ? (int) $rows[$key] : $default;
            $out[$key] = in_array($value, self::OPTIONS[$key], true) ? $value : $default;
        }
        return $out;
    }

    /**
     * When the clean-up last ran (by the schedule or an admin) and what it removed.
     *
     * @return array{at: string, source: string, removed: array<string, int>}|null
     */
    public function lastRun(): ?array
    {
        $row = $this->db->fetchOne("SELECT `value` FROM `store_settings` WHERE `key_name` = ?", 's', [self::LAST_RUN_KEY]);
        $data = $row ? json_decode((string) $row['value'], true) : null;
        return is_array($data) && isset($data['at']) ? $data : null;
    }

    /**
     * @param string $source 'schedule' (the daily script) or 'admin'
     * @return array<string, int> rows removed (or that would be removed) per rule
     */
    public function run(bool $dryRun = false, string $source = 'schedule'): array
    {
        $s = $this->settings();
        $customerDays = $s['retention_customer_days'];
        $unpaidDays = $s['retention_unpaid_days'];
        // Emails carry names and addresses, so they never outlive the customer-record period.
        $messageDays = $customerDays > 0 ? min($s['retention_message_days'], $customerDays) : $s['retention_message_days'];
        $activityDays = $s['retention_activity_days'];

        $counts = [];
        if ($customerDays > 0) {
            $counts += $this->inactiveCustomers($customerDays, $dryRun);
        }

        $rules = [
            'expired_sessions' => ["FROM `sessions` WHERE `expires_at` < NOW()", '', []],
            'used_or_expired_sign_in_links' => [
                "FROM `email_verification_tokens`
                 WHERE `expires_at` < DATE_SUB(NOW(), INTERVAL 1 DAY)
                    OR (`used_at` IS NOT NULL AND `used_at` < DATE_SUB(NOW(), INTERVAL 1 DAY))",
                '',
                [],
            ],
            // The longest rate-limit window is one hour; keep a day for safety.
            'old_rate_limit_counters' => ["FROM `rate_limits` WHERE `window_start` < ?", 'i', [time() - 86400]],
            'old_slow_request_records' => ["FROM `api_slow_requests` WHERE `hour_start` < DATE_SUB(NOW(), INTERVAL 30 DAY)", '', []],
            // Never paid, nothing refunded, nothing waiting for the admin; stock was already
            // released when the order was cancelled. Items, history and closed payment
            // attempts are removed with the order (foreign keys cascade).
            'unpaid_cancelled_orders' => [
                "FROM `orders` o
                 WHERE o.`order_status` = 'cancelled'
                   AND o.`requires_attention` = 0
                   AND o.`updated_at` < DATE_SUB(NOW(), INTERVAL ? DAY)
                   AND NOT EXISTS (SELECT 1 FROM `payments` p WHERE p.`order_id` = o.`id`
                                   AND p.`status` IN ('successful', 'partially_refunded', 'refunded'))
                   AND NOT EXISTS (SELECT 1 FROM `refunds` r WHERE r.`order_id` = o.`id`)",
                'i',
                [$unpaidDays],
            ],
            'abandoned_guest_carts' => [
                "FROM `carts` WHERE `user_id` IS NULL AND `updated_at` < DATE_SUB(NOW(), INTERVAL ? DAY)",
                'i',
                [$unpaidDays],
            ],
            'old_emails' => [
                "FROM `email_outbox` WHERE `status` IN ('sent', 'failed') AND `created_at` < DATE_SUB(NOW(), INTERVAL ? DAY)",
                'i',
                [$messageDays],
            ],
            'old_gateway_notifications' => [
                "FROM `payment_webhook_events` WHERE `received_at` < DATE_SUB(NOW(), INTERVAL ? DAY)",
                'i',
                [$s['retention_message_days']],
            ],
        ];
        if ($customerDays > 0) {
            $rules['unsubscribed_newsletter_emails'] = [
                "FROM `newsletter_subscribers` WHERE `status` = 'unsubscribed' AND COALESCE(`unsubscribed_at`, `created_at`) < DATE_SUB(NOW(), INTERVAL ? DAY)",
                'i',
                [$customerDays],
            ];
        }
        if ($activityDays > 0) {
            $rules['old_admin_activity'] = ["FROM `admin_audit_logs` WHERE `created_at` < DATE_SUB(NOW(), INTERVAL ? DAY)", 'i', [$activityDays]];
            $rules['old_stock_history'] = ["FROM `inventory_logs` WHERE `created_at` < DATE_SUB(NOW(), INTERVAL ? DAY)", 'i', [$activityDays]];
        }

        foreach ($rules as $name => [$from, $types, $params]) {
            $alias = str_contains($from, '`orders` o') ? 'o' : null;
            if ($dryRun) {
                $counts[$name] = (int) ($this->db->fetchOne("SELECT COUNT(*) AS c {$from}", $types, $params)['c'] ?? 0);
                continue;
            }
            $counts[$name] = $this->db->executeUpdate(($alias ? "DELETE {$alias} " : 'DELETE ') . $from, $types, $params);
        }

        if (!$dryRun) {
            $this->db->execute(
                "INSERT INTO `store_settings` (`key_name`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
                'ss',
                [self::LAST_RUN_KEY, json_encode(['at' => date('Y-m-d H:i:s'), 'source' => $source, 'removed' => $counts])]
            );
        }

        return $counts;
    }

    /**
     * Customers whose last sign-in, sign-up and order activity are all older than $days and
     * who have nothing open (unpaid, paid but not delivered, flagged, or a refund pending).
     * Their account goes, and their finished orders keep only what the accounts need: items,
     * totals, payments and the delivery city and state.
     *
     * @return array<string, int>
     */
    private function inactiveCustomers(int $days, bool $dryRun): array
    {
        $open = "(o.`order_status` IN (" . self::OPEN_ORDER_STATES . ") OR o.`requires_attention` = 1
                  OR EXISTS (SELECT 1 FROM `refunds` r WHERE r.`order_id` = o.`id` AND r.`status` = 'pending'))";

        // Emails compare without regard to case (utf8mb4_unicode_ci).
        $emails = array_column($this->db->fetchAll(
            "SELECT t.`email` FROM (
                 SELECT u.`email`, COALESCE(u.`last_seen_at`, u.`created_at`) AS `last_at`, 0 AS `open`
                   FROM `users` u WHERE u.`role` = 'customer'
                 UNION ALL
                 SELECT o.`guest_email`, GREATEST(o.`created_at`, o.`updated_at`), {$open}
                   FROM `orders` o WHERE o.`personal_data_removed_at` IS NULL AND o.`guest_email` <> ''
                 UNION ALL
                 SELECT u.`email`, GREATEST(o.`created_at`, o.`updated_at`), {$open}
                   FROM `orders` o JOIN `users` u ON u.`id` = o.`user_id` WHERE o.`personal_data_removed_at` IS NULL
             ) t
             GROUP BY t.`email`
             HAVING MAX(t.`last_at`) < DATE_SUB(NOW(), INTERVAL ? DAY) AND SUM(t.`open`) = 0",
            'i',
            [$days]
        ), 'email');

        $counts = ['inactive_customers' => count($emails), 'inactive_customer_accounts' => 0, 'inactive_customer_orders' => 0];

        foreach (array_chunk($emails, 500) as $chunk) {
            $in = implode(', ', array_fill(0, count($chunk), '?'));
            $types = str_repeat('s', count($chunk));
            $ordersOf = "FROM `orders` o LEFT JOIN `users` u ON u.`id` = o.`user_id`
                         WHERE o.`personal_data_removed_at` IS NULL AND (o.`guest_email` IN ({$in}) OR u.`email` IN ({$in}))";

            if ($dryRun) {
                $counts['inactive_customer_accounts'] += (int) $this->db->fetchOne(
                    "SELECT COUNT(*) AS c FROM `users` WHERE `role` = 'customer' AND `email` IN ({$in})",
                    $types,
                    $chunk
                )['c'];
                $counts['inactive_customer_orders'] += (int) $this->db->fetchOne("SELECT COUNT(*) AS c {$ordersOf}", $types . $types, [...$chunk, ...$chunk])['c'];
                continue;
            }

            $this->db->transaction(function (Database $db) use ($in, $types, $chunk, &$counts): void {
                // updated_at keeps its value: reports date orders by it.
                $counts['inactive_customer_orders'] += $db->executeUpdate(
                    "UPDATE `orders` o LEFT JOIN `users` u ON u.`id` = o.`user_id`
                     SET o.`guest_email` = '',
                         o.`guest_access_token_hash` = SHA2(CONCAT(o.`id`, '|', RAND(), '|', NOW(6)), 256),
                         o.`shipping_address_snapshot` = JSON_OBJECT(
                             'city', JSON_UNQUOTE(JSON_EXTRACT(o.`shipping_address_snapshot`, '$.city')),
                             'state', JSON_UNQUOTE(JSON_EXTRACT(o.`shipping_address_snapshot`, '$.state')),
                             'country', JSON_UNQUOTE(JSON_EXTRACT(o.`shipping_address_snapshot`, '$.country'))),
                         o.`notes` = NULL,
                         o.`idempotency_key` = NULL,
                         o.`user_id` = NULL,
                         o.`personal_data_removed_at` = NOW(),
                         o.`updated_at` = o.`updated_at`
                     WHERE o.`personal_data_removed_at` IS NULL AND (o.`guest_email` IN ({$in}) OR u.`email` IN ({$in}))",
                    $types . $types,
                    [...$chunk, ...$chunk]
                );
                $db->executeUpdate("UPDATE `reviews` SET `author_email` = NULL WHERE `author_email` IN ({$in})", $types, $chunk);
                $db->executeUpdate("DELETE FROM `email_outbox` WHERE `status` IN ('sent', 'failed') AND `recipient_email` IN ({$in})", $types, $chunk);
                // Sessions, sign-in links, addresses, carts and wishlists go with the account.
                $counts['inactive_customer_accounts'] += $db->executeUpdate(
                    "DELETE FROM `users` WHERE `role` = 'customer' AND `email` IN ({$in})",
                    $types,
                    $chunk
                );
            });
        }

        return $counts;
    }
}
