<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Database\Database;
use InvalidArgumentException;

/**
 * Opens payment attempts for orders.
 *
 * Every attempt (Kora, Monnify, WhatsApp/manual) gets its own `payments` row with its own
 * reference. Earlier references are never overwritten, so a late bank transfer against an
 * older attempt still matches its order (and is handled by PaymentFinalizer).
 */
class PaymentAttempts
{
    private Database $db;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
    }

    /**
     * Minutes an unpaid order keeps its stock reserved after a gateway checkout starts.
     */
    public static function gatewayWindowMinutes(): int
    {
        return max(15, Env::int('ORDER_PAYMENT_WINDOW_MINUTES', 60));
    }

    /**
     * Minutes an unpaid order stays reserved while awaiting a manual/WhatsApp transfer.
     */
    public static function manualWindowMinutes(): int
    {
        return max(60, Env::int('ORDER_MANUAL_PAYMENT_WINDOW_HOURS', 24) * 60);
    }

    /**
     * Ensure the order can still be paid: awaiting payment and inside its payment window.
     */
    public function assertPayable(array $order): void
    {
        if ($order['order_status'] !== 'pending_payment') {
            throw new InvalidArgumentException(
                $order['order_status'] === 'cancelled'
                    ? "Order {$order['order_number']} was cancelled because its payment window expired. Please place a new order."
                    : "Order {$order['order_number']} is no longer awaiting payment (status: {$order['order_status']})."
            );
        }

        if (!empty($order['expires_at']) && strtotime((string) $order['expires_at']) <= time()) {
            throw new InvalidArgumentException(
                "The payment window for order {$order['order_number']} has expired. Please place a new order."
            );
        }
    }

    /**
     * Create a new pending payment row for an attempt and extend the order's reservation.
     *
     * @return int The new payment ID
     */
    public function open(array $order, string $provider, string $reference, int $windowMinutes): int
    {
        return $this->db->transaction(function (Database $db) use ($order, $provider, $reference, $windowMinutes): int {
            $locked = $db->fetchOne("SELECT * FROM `orders` WHERE `id` = ? FOR UPDATE", 'i', [(int) $order['id']]);
            $this->assertPayable($locked);

            $paymentId = (int) $db->insert(
                "INSERT INTO `payments` (`order_id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `provider_payload_redacted`)
                 VALUES (?, ?, ?, ?, ?, 'pending', ?)",
                'issdss',
                [
                    (int) $locked['id'],
                    $provider,
                    $reference,
                    (float) $locked['grand_total'],
                    $locked['currency'],
                    json_encode(['status' => 'initializing', 'created_at' => date('Y-m-d H:i:s')]),
                ]
            );

            // Keep stock reserved long enough to finish this attempt (never shortens an existing window).
            $db->executeUpdate(
                "UPDATE `orders`
                 SET `expires_at` = GREATEST(COALESCE(`expires_at`, NOW()), DATE_ADD(NOW(), INTERVAL ? MINUTE))
                 WHERE `id` = ?",
                'ii',
                [$windowMinutes, (int) $locked['id']]
            );

            return $paymentId;
        });
    }

    /**
     * Store sanitized gateway metadata on a payment attempt.
     */
    public function recordMetadata(int $paymentId, array $metadata): void
    {
        $this->db->executeUpdate(
            "UPDATE `payments` SET `provider_payload_redacted` = ?, `updated_at` = NOW() WHERE `id` = ?",
            'si',
            [json_encode($metadata), $paymentId]
        );
    }
}
