<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Database\Database;

/**
 * Removes data the store no longer needs, so the database stays small and old personal
 * data is not kept longer than necessary. Paid orders, refunds, payments that took money,
 * audit logs and stock history are never touched.
 *
 * Retention (days) comes from backend/.env; 0 switches a rule off:
 *   CLEANUP_UNPAID_ORDER_DAYS   (30)  cancelled orders that were never paid
 *   CLEANUP_GUEST_CART_DAYS     (30)  carts of visitors who never signed in
 *   CLEANUP_EMAIL_OUTBOX_DAYS   (180) sent/failed emails (they contain names and addresses)
 *   CLEANUP_WEBHOOK_EVENT_DAYS  (365) raw payment gateway notifications
 * Expired sign-in sessions, used or expired sign-in links and old rate-limit counters are
 * always removed.
 */
final class DatabaseCleanup
{
    private Database $db;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
    }

    /**
     * @return array<string, int> rows removed (or that would be removed) per rule
     */
    public function run(bool $dryRun = false): array
    {
        $unpaidDays = max(0, Env::int('CLEANUP_UNPAID_ORDER_DAYS', 30));
        $cartDays = max(0, Env::int('CLEANUP_GUEST_CART_DAYS', 30));
        $outboxDays = max(0, Env::int('CLEANUP_EMAIL_OUTBOX_DAYS', 180));
        $webhookDays = max(0, Env::int('CLEANUP_WEBHOOK_EVENT_DAYS', 365));

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
        ];

        if ($unpaidDays > 0) {
            // Never paid, nothing refunded, nothing waiting for the admin; stock was already
            // released when the order was cancelled. Items, history and closed payment
            // attempts are removed with the order (foreign keys cascade).
            $rules['unpaid_cancelled_orders'] = [
                "FROM `orders` o
                 WHERE o.`order_status` = 'cancelled'
                   AND o.`requires_attention` = 0
                   AND o.`updated_at` < DATE_SUB(NOW(), INTERVAL ? DAY)
                   AND NOT EXISTS (SELECT 1 FROM `payments` p WHERE p.`order_id` = o.`id`
                                   AND p.`status` IN ('successful', 'partially_refunded', 'refunded'))
                   AND NOT EXISTS (SELECT 1 FROM `refunds` r WHERE r.`order_id` = o.`id`)",
                'i',
                [$unpaidDays],
            ];
        }
        if ($cartDays > 0) {
            $rules['abandoned_guest_carts'] = [
                "FROM `carts` WHERE `user_id` IS NULL AND `updated_at` < DATE_SUB(NOW(), INTERVAL ? DAY)",
                'i',
                [$cartDays],
            ];
        }
        if ($outboxDays > 0) {
            $rules['old_emails'] = [
                "FROM `email_outbox` WHERE `status` IN ('sent', 'failed') AND `created_at` < DATE_SUB(NOW(), INTERVAL ? DAY)",
                'i',
                [$outboxDays],
            ];
        }
        if ($webhookDays > 0) {
            $rules['old_gateway_notifications'] = [
                "FROM `payment_webhook_events` WHERE `received_at` < DATE_SUB(NOW(), INTERVAL ? DAY)",
                'i',
                [$webhookDays],
            ];
        }

        $counts = [];
        foreach ($rules as $name => [$from, $types, $params]) {
            $alias = str_contains($from, '`orders` o') ? 'o' : null;
            if ($dryRun) {
                $counts[$name] = (int) ($this->db->fetchOne("SELECT COUNT(*) AS c {$from}", $types, $params)['c'] ?? 0);
                continue;
            }
            $counts[$name] = $this->db->executeUpdate(($alias ? "DELETE {$alias} " : 'DELETE ') . $from, $types, $params);
        }

        return $counts;
    }
}
