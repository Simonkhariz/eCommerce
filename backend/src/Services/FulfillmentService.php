<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Database;
use InvalidArgumentException;

/**
 * Service managing physical order fulfillment: the order status state machine, stock
 * release on cancellation/expiry, carrier tracking, refunds and their audit trail.
 *
 * Payment confirmation (pending_payment -> paid) is NOT done here; it only happens through
 * PaymentFinalizer so amount checks and idempotency always apply.
 */
class FulfillmentService
{
    private Database $db;

    /**
     * Allowed manual status transitions (current status => permissible targets).
     * 'paid' is set by PaymentFinalizer and 'refunded' by the refund flow, never directly.
     */
    private const ALLOWED_TRANSITIONS = [
        'pending_payment' => ['cancelled'],
        'paid'            => ['processing', 'shipped', 'cancelled', 'refund_pending'],
        'processing'      => ['shipped', 'cancelled', 'refund_pending'],
        'shipped'         => ['delivered', 'returned'],
        'delivered'       => ['completed', 'returned', 'refund_pending'],
        'completed'       => ['returned', 'refund_pending'],
        'returned'        => ['refund_pending'],
        'refund_pending'  => ['delivered', 'completed'], // refund request declined
        'cancelled'       => [],
        'refunded'        => [],
    ];

    /** Order statuses for which stock is still reserved and must be released on cancellation. */
    private const STOCK_HOLDING_STATUSES = ['pending_payment', 'paid', 'processing'];

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
    }

    /**
     * Determine if a manual status transition is permitted by the state machine.
     */
    public function canTransition(string $fromStatus, string $toStatus): bool
    {
        $from = strtolower(trim($fromStatus));
        $to = strtolower(trim($toStatus));

        if ($from === $to) {
            return true;
        }

        return in_array($to, self::ALLOWED_TRANSITIONS[$from] ?? [], true);
    }

    /**
     * @return string[]
     */
    public function getAllowedTransitions(string $currentStatus): array
    {
        return self::ALLOWED_TRANSITIONS[strtolower(trim($currentStatus))] ?? [];
    }

    /**
     * Admin-driven status change with state machine validation, history and audit trail.
     */
    public function updateOrderStatus(int $orderId, string $newStatus, ?string $comment = null, ?int $adminId = null): array
    {
        $newStatus = strtolower(trim($newStatus));

        if ($newStatus === 'paid') {
            throw new InvalidArgumentException('Payments are confirmed through the gateway or "Confirm payment" (with a transfer reference), not by changing the status.');
        }
        if ($newStatus === 'refunded') {
            throw new InvalidArgumentException('Record a refund to mark an order as refunded.');
        }

        $this->db->transaction(function (Database $db) use ($orderId, $newStatus, $comment, $adminId): void {
            $order = $this->lockOrder($db, $orderId);
            $this->transition($db, $order, $newStatus, $comment, $this->resolveUserId($adminId, $db));
        });

        return $this->loadOrderSnapshot($orderId);
    }

    /**
     * Release an unpaid order whose payment window has passed. Safe to call repeatedly or
     * concurrently: only the call that actually moves pending_payment -> cancelled releases stock.
     *
     * @return bool True if this call expired the order
     */
    public function expireOrder(int $orderId): bool
    {
        return $this->db->transaction(function (Database $db) use ($orderId): bool {
            $order = $db->fetchOne("SELECT * FROM `orders` WHERE `id` = ? FOR UPDATE", 'i', [$orderId]);
            if ($order === null
                || $order['order_status'] !== 'pending_payment'
                || empty($order['expires_at'])
                || strtotime((string) $order['expires_at']) > time()) {
                return false;
            }

            $this->transition($db, $order, 'cancelled', 'Payment window expired. Reserved stock released automatically.', null, false);
            return true;
        });
    }

    /**
     * Expire up to $limit overdue unpaid orders.
     *
     * @return string[] Order numbers that were expired
     */
    public function expireOverdueOrders(int $limit = 50): array
    {
        $candidates = $this->db->fetchAll(
            "SELECT `id`, `order_number` FROM `orders`
             WHERE `order_status` = 'pending_payment' AND `expires_at` IS NOT NULL AND `expires_at` <= NOW()
             ORDER BY `expires_at` ASC LIMIT ?",
            'i',
            [$limit]
        );

        $expired = [];
        foreach ($candidates as $row) {
            if ($this->expireOrder((int) $row['id'])) {
                $expired[] = $row['order_number'];
            }
        }
        return $expired;
    }

    /**
     * Create or update physical shipment details and carrier tracking.
     * Dispatch moves paid/processing orders to 'shipped'; a delivered shipment moves them to 'delivered'.
     *
     * @param array{carrier: string, tracking_number?: string, tracking_url?: string, status?: string, shipped_at?: string, delivered_at?: string} $data
     */
    public function assignShipment(int $orderId, array $data, ?int $adminId = null): array
    {
        $carrier = trim((string) ($data['carrier'] ?? ''));
        if ($carrier === '') {
            throw new InvalidArgumentException("Carrier name is required (e.g. GIG Logistics, DHL Express, FedEx, Speedaf).");
        }

        $trackingNumber = isset($data['tracking_number']) ? (trim((string) $data['tracking_number']) ?: null) : null;
        $trackingUrl = isset($data['tracking_url']) ? (trim((string) $data['tracking_url']) ?: null) : null;
        $shipmentStatus = isset($data['status']) ? trim(strtolower((string) $data['status'])) : 'label_created';
        if ($shipmentStatus === 'shipped') {
            $shipmentStatus = 'in_transit';
        }
        $shippedAt = !empty($data['shipped_at']) ? $this->normalizeDateTime((string) $data['shipped_at'], 'shipped_at') : null;
        $deliveredAt = !empty($data['delivered_at']) ? $this->normalizeDateTime((string) $data['delivered_at'], 'delivered_at') : null;

        if ($trackingUrl !== null && !preg_match('#^https?://#i', $trackingUrl)) {
            throw new InvalidArgumentException('Tracking URL must start with http:// or https://');
        }

        $validStatuses = ['label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned'];
        if (!in_array($shipmentStatus, $validStatuses, true)) {
            throw new InvalidArgumentException("Invalid shipment status '{$shipmentStatus}'. Valid: " . implode(', ', $validStatuses));
        }

        $this->db->transaction(function (Database $db) use (
            $orderId, $carrier, $trackingNumber, $trackingUrl, $shipmentStatus, $shippedAt, $deliveredAt, $adminId
        ): void {
            $adminId = $this->resolveUserId($adminId, $db);
            $order = $this->lockOrder($db, $orderId);

            if (!in_array($order['order_status'], ['paid', 'processing', 'shipped', 'delivered', 'returned'], true)) {
                throw new InvalidArgumentException("Shipments can only be recorded for paid orders (this order is '{$order['order_status']}').");
            }

            $existing = $db->fetchOne("SELECT * FROM `shipments` WHERE `order_id` = ? ORDER BY `id` DESC LIMIT 1", 'i', [$orderId]);

            if ($shippedAt === null && in_array($shipmentStatus, ['picked_up', 'in_transit', 'out_for_delivery', 'delivered'], true)) {
                $shippedAt = date('Y-m-d H:i:s');
            }
            if ($deliveredAt === null && $shipmentStatus === 'delivered') {
                $deliveredAt = date('Y-m-d H:i:s');
            }

            if ($existing !== null) {
                $shipmentId = (int) $existing['id'];
                $db->executeUpdate(
                    "UPDATE `shipments` SET `carrier` = ?, `tracking_number` = ?, `tracking_url` = ?, `status` = ?,
                            `shipped_at` = COALESCE(`shipped_at`, ?), `delivered_at` = COALESCE(?, `delivered_at`), `updated_at` = NOW()
                     WHERE `id` = ?",
                    'ssssssi',
                    [$carrier, $trackingNumber, $trackingUrl, $shipmentStatus, $shippedAt, $deliveredAt, $shipmentId]
                );
            } else {
                $shipmentId = (int) $db->insert(
                    "INSERT INTO `shipments` (`order_id`, `carrier`, `tracking_number`, `tracking_url`, `status`, `shipped_at`, `delivered_at`)
                     VALUES (?, ?, ?, ?, ?, ?, ?)",
                    'issssss',
                    [$orderId, $carrier, $trackingNumber, $trackingUrl, $shipmentStatus, $shippedAt, $deliveredAt]
                );
            }

            $trackingNote = $trackingNumber ? " (Tracking: {$trackingNumber})" : '';
            $dispatched = in_array($shipmentStatus, ['picked_up', 'in_transit', 'out_for_delivery', 'delivered'], true);

            if ($dispatched && in_array($order['order_status'], ['paid', 'processing'], true)) {
                $order = $this->transition($db, $order, 'shipped', "Dispatched with {$carrier}{$trackingNote}.", $adminId);
            }
            if ($shipmentStatus === 'delivered' && $order['order_status'] === 'shipped') {
                $order = $this->transition($db, $order, 'delivered', "Delivered by {$carrier}{$trackingNote}.", $adminId);
            }
            if ($shipmentStatus === 'returned' && in_array($order['order_status'], ['shipped', 'delivered'], true)) {
                $order = $this->transition($db, $order, 'returned', "Parcel returned via {$carrier}{$trackingNote}.", $adminId);
            }

            AuditService::record($adminId, 'shipment.assign', 'order', (string) $orderId, $existing ?: null, [
                'shipment_id' => $shipmentId,
                'carrier' => $carrier,
                'tracking_number' => $trackingNumber,
                'tracking_url' => $trackingUrl,
                'status' => $shipmentStatus,
            ]);

            if ($dispatched) {
                $mailOrder = $order;
                $db->afterCommit(static function () use ($mailOrder, $carrier, $trackingNumber, $trackingUrl, $shipmentStatus): void {
                    MailService::getInstance()->sendShipmentTracking($mailOrder, [
                        'carrier' => $carrier,
                        'tracking_number' => $trackingNumber,
                        'tracking_url' => $trackingUrl,
                        'status' => $shipmentStatus,
                    ]);
                });
            }
        });

        return $this->loadOrderSnapshot($orderId);
    }

    /**
     * Mark an order as delivered. Orders that were never marked shipped pass through 'shipped'
     * first (e.g. local hand delivery), so the history stays truthful.
     */
    public function markDelivered(int $orderId, ?string $comment = null, ?int $adminId = null): array
    {
        $this->db->transaction(function (Database $db) use ($orderId, $comment, $adminId): void {
            $adminId = $this->resolveUserId($adminId, $db);
            $order = $this->lockOrder($db, $orderId);

            if (!in_array($order['order_status'], ['paid', 'processing', 'shipped'], true)) {
                throw new InvalidArgumentException("Only paid or shipped orders can be marked delivered (this order is '{$order['order_status']}').");
            }

            if ($order['order_status'] !== 'shipped') {
                $order = $this->transition($db, $order, 'shipped', 'Handed over for delivery.', $adminId);
            }

            $db->executeUpdate(
                "UPDATE `shipments` SET `status` = 'delivered', `delivered_at` = COALESCE(`delivered_at`, NOW()), `updated_at` = NOW()
                 WHERE `order_id` = ?",
                'i',
                [$orderId]
            );

            $this->transition($db, $order, 'delivered', $comment ?: 'Delivery confirmed.', $adminId);
        });

        return $this->loadOrderSnapshot($orderId);
    }

    /**
     * Record a refund against an order's successful payment.
     * 'completed' means the money has already been returned (e.g. from the gateway dashboard);
     * 'pending' records an approved refund that will be completed later.
     *
     * @return array<string, mixed> The refund row
     */
    public function recordRefund(int $orderId, float $amount, string $reason, string $status, bool $restock, ?int $adminId, ?string $providerRefundReference = null): array
    {
        $providerRefundReference = $providerRefundReference !== null ? (trim($providerRefundReference) ?: null) : null;
        $amount = round($amount, 2);
        $reason = trim($reason);
        if ($amount <= 0) {
            throw new InvalidArgumentException('Refund amount must be greater than zero.');
        }
        if ($reason === '') {
            throw new InvalidArgumentException('A refund reason is required.');
        }
        if (!in_array($status, ['pending', 'completed'], true)) {
            throw new InvalidArgumentException("Refund status must be 'pending' or 'completed'.");
        }

        $refundId = $this->db->transaction(function (Database $db) use ($orderId, $amount, $reason, $status, $restock, $adminId, $providerRefundReference): int {
            $adminId = $this->resolveUserId($adminId, $db);
            $order = $this->lockOrder($db, $orderId);

            $payment = $db->fetchOne(
                "SELECT * FROM `payments` WHERE `order_id` = ? AND `status` IN ('successful', 'partially_refunded')
                 ORDER BY `verified_at` ASC, `id` ASC LIMIT 1 FOR UPDATE",
                'i',
                [$orderId]
            );
            if ($payment === null) {
                throw new InvalidArgumentException('This order has no successful payment to refund.');
            }

            $already = $db->fetchOne(
                "SELECT COALESCE(SUM(`amount`), 0) AS total FROM `refunds` WHERE `payment_id` = ? AND `status` IN ('pending', 'completed')",
                'i',
                [(int) $payment['id']]
            );
            $refundable = round((float) $payment['amount'] - (float) $already['total'], 2);
            if ($amount > $refundable + 0.001) {
                throw new InvalidArgumentException(sprintf(
                    'Refund exceeds the refundable balance. Paid %s, already refunded or pending %s, maximum now %s.',
                    number_format((float) $payment['amount'], 2),
                    number_format((float) $already['total'], 2),
                    number_format(max(0, $refundable), 2)
                ));
            }

            $refundId = (int) $db->insert(
                "INSERT INTO `refunds` (`payment_id`, `order_id`, `provider_refund_reference`, `amount`, `currency`, `reason`, `status`, `restocked`, `processed_by_user_id`)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)",
                'iisdssi',
                [(int) $payment['id'], $orderId, $providerRefundReference, $amount, $payment['currency'], $reason, $adminId]
            );

            AuditService::record($adminId, 'refund.create', 'order', (string) $orderId, null, [
                'refund_id' => $refundId,
                'amount' => $amount,
                'status' => $status,
                'reason' => $reason,
                'restock' => $restock,
            ]);

            if ($status === 'completed') {
                $this->completeRefundLocked($db, $refundId, $restock, $adminId);
            } elseif ($restock) {
                $db->executeUpdate("UPDATE `refunds` SET `restocked` = 2 WHERE `id` = ?", 'i', [$refundId]); // 2 = restock on completion
            }

            return $refundId;
        });

        return $this->db->fetchOne("SELECT * FROM `refunds` WHERE `id` = ?", 'i', [$refundId]);
    }

    /**
     * Complete or reject a pending refund.
     */
    public function resolveRefund(int $refundId, string $newStatus, ?int $adminId): array
    {
        if (!in_array($newStatus, ['completed', 'rejected'], true)) {
            throw new InvalidArgumentException("Refund can only be marked 'completed' or 'rejected'.");
        }

        $this->db->transaction(function (Database $db) use ($refundId, $newStatus, $adminId): void {
            $adminId = $this->resolveUserId($adminId, $db);
            $refund = $db->fetchOne("SELECT * FROM `refunds` WHERE `id` = ? FOR UPDATE", 'i', [$refundId]);
            if ($refund === null) {
                throw new InvalidArgumentException('Refund not found.');
            }
            if ($refund['status'] !== 'pending') {
                throw new InvalidArgumentException("This refund is already {$refund['status']}.");
            }
            $this->lockOrder($db, (int) $refund['order_id']);

            if ($newStatus === 'rejected') {
                $db->executeUpdate("UPDATE `refunds` SET `status` = 'rejected', `restocked` = 0, `processed_by_user_id` = ? WHERE `id` = ?", 'ii', [$adminId, $refundId]);
                AuditService::record($adminId, 'refund.reject', 'order', (string) $refund['order_id'], ['refund_id' => $refundId], ['status' => 'rejected']);
                return;
            }

            $this->completeRefundLocked($db, $refundId, (int) $refund['restocked'] === 2, $adminId);
        });

        return $this->db->fetchOne("SELECT * FROM `refunds` WHERE `id` = ?", 'i', [$refundId]);
    }

    /**
     * Load complete order snapshot with items, status history, payments, refunds and shipment.
     */
    public function loadOrderSnapshot(int $orderId): array
    {
        $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
        if ($order === null) {
            throw new InvalidArgumentException("Order ID {$orderId} not found.");
        }

        unset($order['guest_access_token_hash'], $order['idempotency_key']);

        $order['shipping_zone_snapshot'] = is_string($order['shipping_zone_snapshot'])
            ? json_decode($order['shipping_zone_snapshot'], true)
            : $order['shipping_zone_snapshot'];
        $order['shipping_address_snapshot'] = is_string($order['shipping_address_snapshot'])
            ? json_decode($order['shipping_address_snapshot'], true)
            : $order['shipping_address_snapshot'];

        $order['subtotal'] = (float) $order['subtotal'];
        $order['discount_amount'] = (float) $order['discount_amount'];
        $order['shipping_fee'] = (float) $order['shipping_fee'];
        $order['grand_total'] = (float) $order['grand_total'];
        $order['requires_attention'] = (bool) $order['requires_attention'];
        $order['allowed_transitions'] = $this->getAllowedTransitions($order['order_status']);

        $order['shipment'] = $this->db->fetchOne(
            "SELECT `id`, `carrier`, `tracking_number`, `tracking_url`, `status`, `shipped_at`, `delivered_at`, `created_at`, `updated_at`
             FROM `shipments` WHERE `order_id` = ? ORDER BY `id` DESC LIMIT 1",
            'i',
            [$orderId]
        );

        $items = $this->db->fetchAll(
            "SELECT `id`, `product_id`, `variant_id`, `product_type`, `item_name`, `sku`, `variant_options`, `unit_price`, `quantity`, `line_total`
             FROM `order_items` WHERE `order_id` = ?",
            'i',
            [$orderId]
        );
        foreach ($items as &$it) {
            $it['variant_options'] = is_string($it['variant_options']) ? json_decode($it['variant_options'], true) : $it['variant_options'];
            $it['unit_price'] = (float) $it['unit_price'];
            $it['line_total'] = (float) $it['line_total'];
        }
        unset($it);
        $order['items'] = $items;

        $order['history'] = $this->db->fetchAll(
            "SELECT `previous_status`, `new_status`, `comment`, `changed_by_user_id`, `created_at`
             FROM `order_status_history` WHERE `order_id` = ? ORDER BY `id` ASC",
            'i',
            [$orderId]
        );

        $payments = $this->db->fetchAll(
            "SELECT `id`, `provider`, `provider_reference`, `amount`, `amount_received`, `currency`, `payment_method`, `status`, `verified_at`, `created_at`
             FROM `payments` WHERE `order_id` = ? ORDER BY `id` DESC",
            'i',
            [$orderId]
        );
        $order['payments'] = $payments;
        // Primary payment: the successful one if any, else the latest attempt.
        $order['payment'] = null;
        foreach ($payments as $p) {
            if (in_array($p['status'], ['successful', 'partially_refunded', 'refunded'], true)) {
                $order['payment'] = $p;
                break;
            }
        }
        $order['payment'] = $order['payment'] ?? ($payments[0] ?? null);

        $order['refunds'] = $this->db->fetchAll(
            "SELECT `id`, `amount`, `currency`, `reason`, `status`, `restocked`, `created_at`, `updated_at`
             FROM `refunds` WHERE `order_id` = ? ORDER BY `id` DESC",
            'i',
            [$orderId]
        );

        return $order;
    }

    // -------------------------------------------------------------------------
    // Internals (always called inside a transaction with the order row locked)
    // -------------------------------------------------------------------------

    private function lockOrder(Database $db, int $orderId): array
    {
        $order = $db->fetchOne("SELECT * FROM `orders` WHERE `id` = ? FOR UPDATE", 'i', [$orderId]);
        if ($order === null) {
            throw new InvalidArgumentException("Order ID {$orderId} not found.");
        }
        return $order;
    }

    /**
     * Apply one validated status transition plus its side effects. Returns the updated order row.
     */
    private function transition(Database $db, array $order, string $newStatus, ?string $comment, ?int $adminId, bool $audit = true): array
    {
        $orderId = (int) $order['id'];
        $currentStatus = $order['order_status'];

        if (!$this->canTransition($currentStatus, $newStatus)) {
            $allowed = implode(', ', $this->getAllowedTransitions($currentStatus));
            throw new InvalidArgumentException(
                "Cannot move this order from '{$currentStatus}' to '{$newStatus}'. "
                . ($allowed !== '' ? "Allowed next statuses: {$allowed}." : "'{$currentStatus}' is a final status.")
            );
        }
        if ($currentStatus === $newStatus) {
            return $order;
        }

        $newPaymentStatus = $order['payment_status'];
        $histComment = $comment ?: "Status updated from '{$currentStatus}' to '{$newStatus}'.";

        if ($newStatus === 'cancelled') {
            if (in_array($currentStatus, self::STOCK_HOLDING_STATUSES, true)) {
                $this->releaseReservation($db, $order);
            }

            if ($order['payment_status'] === 'pending' || $order['payment_status'] === 'failed') {
                $newPaymentStatus = 'cancelled';
                $db->executeUpdate(
                    "UPDATE `payments` SET `status` = 'cancelled', `updated_at` = NOW() WHERE `order_id` = ? AND `status` = 'pending'",
                    'i',
                    [$orderId]
                );
            } elseif ($order['payment_status'] === 'successful') {
                $db->executeUpdate(
                    "UPDATE `orders` SET `requires_attention` = 1,
                            `attention_reason` = LEFT(CONCAT_WS(' | ', NULLIF(`attention_reason`, ''), 'Cancelled after payment: record a refund for the customer.'), 500)
                     WHERE `id` = ?",
                    'i',
                    [$orderId]
                );
            }
        }

        $db->executeUpdate(
            "UPDATE `orders` SET `order_status` = ?, `payment_status` = ?,
                    `expires_at` = IF(? = 'pending_payment', `expires_at`, NULL), `updated_at` = NOW()
             WHERE `id` = ?",
            'sssi',
            [$newStatus, $newPaymentStatus, $newStatus, $orderId]
        );

        $db->insert(
            "INSERT INTO `order_status_history` (`order_id`, `previous_status`, `new_status`, `comment`, `changed_by_user_id`)
             VALUES (?, ?, ?, ?, ?)",
            'isssi',
            [$orderId, $currentStatus, $newStatus, $histComment, $adminId]
        );

        if ($audit) {
            AuditService::record(
                $adminId,
                'order.status_update',
                'order',
                (string) $orderId,
                ['order_status' => $currentStatus, 'payment_status' => $order['payment_status']],
                ['order_status' => $newStatus, 'payment_status' => $newPaymentStatus, 'comment' => $histComment]
            );
        }

        $order['order_status'] = $newStatus;
        $order['payment_status'] = $newPaymentStatus;

        if ($newStatus === 'cancelled') {
            $mailOrder = $order;
            $db->afterCommit(static function () use ($mailOrder, $histComment): void {
                MailService::getInstance()->sendCancellationOrRefund($mailOrder, 'cancellation', ['reason' => $histComment]);
            });
        }

        return $order;
    }

    /**
     * Return an order's reserved stock and its promotion use. Called exactly once per order,
     * from the transition that leaves a stock-holding status.
     */
    private function releaseReservation(Database $db, array $order): void
    {
        $items = $db->fetchAll("SELECT `variant_id`, `quantity` FROM `order_items` WHERE `order_id` = ?", 'i', [(int) $order['id']]);
        foreach ($items as $item) {
            if (!empty($item['variant_id'])) {
                $db->executeUpdate(
                    "UPDATE `product_variants` SET `stock_quantity` = `stock_quantity` + ? WHERE `id` = ?",
                    'ii',
                    [(int) $item['quantity'], (int) $item['variant_id']]
                );
            }
        }

        if (!empty($order['applied_promo_code'])) {
            $db->executeUpdate(
                "UPDATE `promotions` SET `used_count` = GREATEST(`used_count` - 1, 0) WHERE `code` = ?",
                's',
                [$order['applied_promo_code']]
            );
        }
    }

    private function completeRefundLocked(Database $db, int $refundId, bool $restock, ?int $adminId): void
    {
        $refund = $db->fetchOne("SELECT * FROM `refunds` WHERE `id` = ?", 'i', [$refundId]);
        $order = $db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [(int) $refund['order_id']]);
        $payment = $db->fetchOne("SELECT * FROM `payments` WHERE `id` = ? FOR UPDATE", 'i', [(int) $refund['payment_id']]);

        $db->executeUpdate(
            "UPDATE `refunds` SET `status` = 'completed', `processed_by_user_id` = ?, `updated_at` = NOW() WHERE `id` = ?",
            'ii',
            [$adminId, $refundId]
        );

        $completed = $db->fetchOne(
            "SELECT COALESCE(SUM(`amount`), 0) AS total FROM `refunds` WHERE `payment_id` = ? AND `status` = 'completed'",
            'i',
            [(int) $payment['id']]
        );
        $fullyRefunded = (float) $completed['total'] >= (float) $payment['amount'] - 0.01;
        $refundStatus = $fullyRefunded ? 'refunded' : 'partially_refunded';

        $db->executeUpdate("UPDATE `payments` SET `status` = ?, `updated_at` = NOW() WHERE `id` = ?", 'si', [$refundStatus, (int) $payment['id']]);

        $previousStatus = $order['order_status'];
        $newOrderStatus = ($fullyRefunded && $previousStatus !== 'cancelled') ? 'refunded' : $previousStatus;

        // Put goods back on sale only for a full refund where the items are not with the customer
        // (unshipped, returned, or a refund request the admin chose to restock).
        $restocked = 0;
        if ($restock && $fullyRefunded && in_array($previousStatus, ['paid', 'processing', 'returned', 'refund_pending'], true)) {
            $this->releaseReservation($db, ['id' => $order['id'], 'applied_promo_code' => null]);
            $restocked = 1;
        }
        $db->executeUpdate("UPDATE `refunds` SET `restocked` = ? WHERE `id` = ?", 'ii', [$restocked, $refundId]);

        $db->executeUpdate(
            "UPDATE `orders` SET `order_status` = ?, `payment_status` = ?,
                    `requires_attention` = IF(?, 0, `requires_attention`), `updated_at` = NOW()
             WHERE `id` = ?",
            'ssii',
            [$newOrderStatus, $refundStatus, $fullyRefunded ? 1 : 0, (int) $order['id']]
        );

        $db->insert(
            "INSERT INTO `order_status_history` (`order_id`, `previous_status`, `new_status`, `comment`, `changed_by_user_id`)
             VALUES (?, ?, ?, ?, ?)",
            'isssi',
            [
                (int) $order['id'],
                $previousStatus,
                $newOrderStatus,
                sprintf('Refund of %s %s completed%s. Reason: %s', $refund['currency'], number_format((float) $refund['amount'], 2), $restocked ? ' and items restocked' : '', $refund['reason']),
                $adminId,
            ]
        );

        AuditService::record($adminId, 'refund.complete', 'order', (string) $order['id'], [
            'order_status' => $previousStatus,
            'payment_status' => $order['payment_status'],
        ], [
            'refund_id' => $refundId,
            'order_status' => $newOrderStatus,
            'payment_status' => $refundStatus,
            'restocked' => (bool) $restocked,
        ]);

        $mailOrder = array_merge($order, ['order_status' => $newOrderStatus, 'payment_status' => $refundStatus]);
        $reason = (string) $refund['reason'];
        $db->afterCommit(static function () use ($mailOrder, $reason): void {
            MailService::getInstance()->sendCancellationOrRefund($mailOrder, 'refund', ['reason' => $reason]);
        });
    }

    private function normalizeDateTime(string $value, string $field): string
    {
        $ts = strtotime($value);
        if ($ts === false || $ts > time() + 86400) {
            throw new InvalidArgumentException("Invalid {$field}: use a real date that is not in the future.");
        }
        return date('Y-m-d H:i:s', $ts);
    }

    /**
     * Resolve admin user ID against database to prevent foreign key constraint violations.
     */
    private function resolveUserId(?int $userId, Database $db): ?int
    {
        if ($userId === null || $userId <= 0) {
            return null;
        }
        $exists = $db->fetchOne("SELECT `id` FROM `users` WHERE `id` = ? LIMIT 1", 'i', [$userId]);
        return $exists !== null ? (int) $exists['id'] : null;
    }
}
