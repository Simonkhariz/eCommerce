<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Database;
use App\Services\MailService;
use InvalidArgumentException;
use RuntimeException;

/**
 * Service managing physical order fulfillment, carrier tracking assignment,
 * status transition state machine enforcement, and audit logging.
 */
class FulfillmentService
{
    private Database $db;

    /**
     * Allowed status transitions state machine.
     * Maps current order status to array of permissible target statuses.
     */
    private const ALLOWED_TRANSITIONS = [
        'pending_payment' => ['paid', 'cancelled'],
        'paid'            => ['processing', 'shipped', 'cancelled', 'refund_pending', 'refunded'],
        'processing'      => ['shipped', 'cancelled'],
        'shipped'         => ['delivered', 'returned'],
        'delivered'       => ['completed', 'refund_pending', 'returned'],
        'completed'       => ['refund_pending'],
        'cancelled'       => [], // Terminal state
        'refund_pending'  => ['refunded', 'paid'],
        'refunded'        => [], // Terminal state
    ];

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
    }

    /**
     * Determine if a status transition is permitted by the state machine.
     */
    public function canTransition(string $fromStatus, string $toStatus): bool
    {
        $from = strtolower(trim($fromStatus));
        $to = strtolower(trim($toStatus));

        if ($from === $to) {
            return true; // Idempotent same-status
        }

        $allowed = self::ALLOWED_TRANSITIONS[$from] ?? [];
        return in_array($to, $allowed, true);
    }

    /**
     * Get allowed target statuses for a given current status.
     *
     * @return string[]
     */
    public function getAllowedTransitions(string $currentStatus): array
    {
        $current = strtolower(trim($currentStatus));
        return self::ALLOWED_TRANSITIONS[$current] ?? [];
    }

    /**
     * Update order status with strict state machine validation and audit trails.
     */
    public function updateOrderStatus(
        int $orderId,
        string $newStatus,
        ?string $comment = null,
        ?int $adminId = null
    ): array {
        $newStatus = strtolower(trim($newStatus));

        return $this->db->transaction(function (Database $db) use ($orderId, $newStatus, $comment, $adminId) {
            $adminId = $this->resolveUserId($adminId, $db);
            // Lock order for update
            $order = $db->fetchOne("SELECT * FROM `orders` WHERE `id` = ? FOR UPDATE", 'i', [$orderId]);
            if ($order === null) {
                throw new InvalidArgumentException("Order ID {$orderId} not found.");
            }

            $currentStatus = $order['order_status'];

            // Validate transition
            if (!$this->canTransition($currentStatus, $newStatus)) {
                $allowed = implode(', ', $this->getAllowedTransitions($currentStatus));
                $allowedMsg = !empty($allowed) ? "Allowed next statuses: [{$allowed}]." : "Status '{$currentStatus}' is terminal.";
                throw new InvalidArgumentException(
                    "Cannot transition order status from '{$currentStatus}' to '{$newStatus}'. {$allowedMsg}"
                );
            }

            if ($currentStatus === $newStatus) {
                // Idempotent
                return $this->loadOrderSnapshot($orderId);
            }

            $beforeState = json_encode([
                'order_status' => $currentStatus,
                'payment_status' => $order['payment_status'],
            ]);

            $newPaymentStatus = $order['payment_status'];
            if ($newStatus === 'paid') {
                $newPaymentStatus = 'successful';
            }

            // Update order
            $db->executeUpdate(
                "UPDATE `orders` SET `order_status` = ?, `payment_status` = ?, `updated_at` = NOW() WHERE `id` = ?",
                'ssi',
                [$newStatus, $newPaymentStatus, $orderId]
            );

            // Record status history
            $histComment = $comment ?? "Status updated from '{$currentStatus}' to '{$newStatus}' by administrator.";
            $db->insert(
                "INSERT INTO `order_status_history` (`order_id`, `previous_status`, `new_status`, `comment`, `changed_by_user_id`, `created_at`)
                 VALUES (?, ?, ?, ?, ?, NOW())",
                'isssi',
                [$orderId, $currentStatus, $newStatus, $histComment, $adminId]
            );

            // If transitioning to paid, ensure payments record is recorded as successful (e.g. WhatsApp / manual bank transfer)
            if ($newStatus === 'paid') {
                $existingPayment = $db->fetchOne("SELECT `id`, `provider`, `status`, `amount` FROM `payments` WHERE `order_id` = ? ORDER BY (`status` = 'successful') DESC, `id` DESC LIMIT 1", 'i', [$orderId]);
                if ($existingPayment !== null) {
                    $db->executeUpdate(
                        "UPDATE `payments` SET `status` = 'successful', `amount` = COALESCE(NULLIF(`amount`, 0), ?), `payment_method` = COALESCE(`payment_method`, 'manual_whatsapp'), `verified_at` = NOW(), `provider_payload_redacted` = ?, `updated_at` = NOW() WHERE `id` = ?",
                        'dsi',
                        [(float) $order['grand_total'], json_encode(['channel' => 'manual_whatsapp', 'note' => $histComment, 'confirmed_by' => $adminId]), (int) $existingPayment['id']]
                    );
                } else {
                    $ref = 'MANUAL-WA-' . $order['order_number'] . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
                    $db->insert(
                        "INSERT INTO `payments` (`order_id`, `provider`, `provider_reference`, `amount`, `currency`, `payment_method`, `status`, `provider_payload_redacted`, `verified_at`, `created_at`, `updated_at`)
                         VALUES (?, 'whatsapp', ?, ?, ?, 'manual_whatsapp', 'successful', ?, NOW(), NOW(), NOW())",
                        'isdss',
                        [$orderId, $ref, (float) $order['grand_total'], $order['currency'], json_encode(['channel' => 'manual_whatsapp', 'note' => $histComment, 'confirmed_by' => $adminId])]
                    );
                }

                // Increment promo used_count if coupon was applied
                if (!empty($order['applied_promo_code'])) {
                    $db->executeUpdate(
                        "UPDATE `promotions` SET `used_count` = `used_count` + 1 WHERE `code` = ?",
                        's',
                        [$order['applied_promo_code']]
                    );
                }

                // Dispatch verified payment notification
                try {
                    $orderForMail = $order;
                    $orderForMail['order_status'] = 'paid';
                    $orderForMail['payment_status'] = 'successful';
                    MailService::getInstance()->sendPaymentVerified($orderForMail, [
                        'reference' => $existingPayment['provider_reference'] ?? ($ref ?? 'MANUAL-SETTLED'),
                        'payment_method' => 'WhatsApp / Manual Settlement',
                    ]);
                } catch (\Throwable $e) {
                    error_log('[MailService Notice] ' . $e->getMessage());
                }
            } elseif ($newStatus === 'cancelled') {
                // Restore reserved inventory for cancelled order items
                $orderItems = $db->fetchAll("SELECT variant_id, quantity FROM `order_items` WHERE `order_id` = ?", 'i', [$orderId]);
                foreach ($orderItems as $item) {
                    if (!empty($item['variant_id'])) {
                        $db->executeUpdate(
                            "UPDATE `product_variants` SET `stock_quantity` = `stock_quantity` + ? WHERE `id` = ?",
                            'ii',
                            [(int)$item['quantity'], (int)$item['variant_id']]
                        );
                    }
                }

                try {
                    MailService::getInstance()->sendCancellationOrRefund($order, 'cancellation', ['reason' => $histComment]);
                } catch (\Throwable $e) {
                    error_log('[MailService Notice] ' . $e->getMessage());
                }
            } elseif ($newStatus === 'refunded') {
                try {
                    MailService::getInstance()->sendCancellationOrRefund($order, 'refund', ['reason' => $histComment]);
                } catch (\Throwable $e) {
                    error_log('[MailService Notice] ' . $e->getMessage());
                }
            }

            // Record admin audit log
            $afterState = json_encode([
                'order_status' => $newStatus,
                'payment_status' => $newPaymentStatus,
                'comment' => $histComment,
            ]);

            $db->insert(
                "INSERT INTO `admin_audit_logs` (`admin_id`, `action`, `entity_type`, `entity_id`, `before_state`, `after_state`, `ip_address`, `user_agent`, `created_at`)
                 VALUES (?, 'order.status_update', 'order', ?, ?, ?, ?, ?, NOW())",
                'isssss',
                [
                    $adminId,
                    (string) $orderId,
                    $beforeState,
                    $afterState,
                    $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
                    $_SERVER['HTTP_USER_AGENT'] ?? 'CLI/System',
                ]
            );

            return $this->loadOrderSnapshot($orderId);
        });
    }

    /**
     * Create or update physical shipment details and carrier tracking.
     * Automatically transitions eligible orders to 'shipped' upon dispatch.
     *
     * @param array{carrier: string, tracking_number?: string, tracking_url?: string, status?: string, shipped_at?: string, delivered_at?: string} $data
     */
    public function assignShipment(int $orderId, array $data, ?int $adminId = null): array
    {
        $carrier = trim($data['carrier'] ?? '');
        if ($carrier === '') {
            throw new InvalidArgumentException("Carrier name is required (e.g. GIG Logistics, DHL Express, FedEx, Speedaf).");
        }

        $trackingNumber = isset($data['tracking_number']) ? trim((string) $data['tracking_number']) : null;
        $trackingUrl = isset($data['tracking_url']) ? trim((string) $data['tracking_url']) : null;
        $shipmentStatus = isset($data['status']) ? trim(strtolower((string) $data['status'])) : 'label_created';
        $shippedAt = !empty($data['shipped_at']) ? trim((string) $data['shipped_at']) : null;
        $deliveredAt = !empty($data['delivered_at']) ? trim((string) $data['delivered_at']) : null;

        $validStatuses = ['label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned'];
        if (!in_array($shipmentStatus, $validStatuses, true)) {
            throw new InvalidArgumentException("Invalid shipment status '{$shipmentStatus}'. Valid: " . implode(', ', $validStatuses));
        }

        return $this->db->transaction(function (Database $db) use (
            $orderId,
            $carrier,
            $trackingNumber,
            $trackingUrl,
            $shipmentStatus,
            $shippedAt,
            $deliveredAt,
            $adminId
        ) {
            $adminId = $this->resolveUserId($adminId, $db);
            $order = $db->fetchOne("SELECT * FROM `orders` WHERE `id` = ? FOR UPDATE", 'i', [$orderId]);
            if ($order === null) {
                throw new InvalidArgumentException("Order ID {$orderId} not found.");
            }

            // Existing shipment record
            $existing = $db->fetchOne("SELECT * FROM `shipments` WHERE `order_id` = ? ORDER BY `id` DESC LIMIT 1", 'i', [$orderId]);
            $beforeShipment = $existing ? json_encode($existing) : null;

            if ($shippedAt === null && in_array($shipmentStatus, ['picked_up', 'in_transit', 'out_for_delivery', 'delivered'], true)) {
                $shippedAt = date('Y-m-d H:i:s');
            }

            if ($deliveredAt === null && $shipmentStatus === 'delivered') {
                $deliveredAt = date('Y-m-d H:i:s');
            }

            $shipmentId = null;
            if ($existing !== null) {
                $shipmentId = (int) $existing['id'];
                $db->executeUpdate(
                    "UPDATE `shipments` SET `carrier` = ?, `tracking_number` = ?, `tracking_url` = ?, `status` = ?, `shipped_at` = COALESCE(?, `shipped_at`), `delivered_at` = COALESCE(?, `delivered_at`), `updated_at` = NOW()
                     WHERE `id` = ?",
                    'ssssssi',
                    [$carrier, $trackingNumber, $trackingUrl, $shipmentStatus, $shippedAt, $deliveredAt, $shipmentId]
                );
            } else {
                $shipmentId = (int) $db->insert(
                    "INSERT INTO `shipments` (`order_id`, `carrier`, `tracking_number`, `tracking_url`, `status`, `shipped_at`, `delivered_at`, `created_at`, `updated_at`)
                     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
                    'issssss',
                    [$orderId, $carrier, $trackingNumber, $trackingUrl, $shipmentStatus, $shippedAt, $deliveredAt]
                );
            }

            // If shipment is dispatched and order is paid/processing, transition order status to 'shipped'
            $currentOrderStatus = $order['order_status'];
            if ($shipmentStatus === 'delivered') {
                if ($this->canTransition($currentOrderStatus, 'delivered')) {
                    $this->updateOrderStatus(
                        $orderId,
                        'delivered',
                        "Shipment delivered via {$carrier}" . ($trackingNumber ? " (Tracking: {$trackingNumber})" : "") . ".",
                        $adminId
                    );
                }
            } elseif (in_array($shipmentStatus, ['picked_up', 'in_transit', 'out_for_delivery'], true)) {
                if ($currentOrderStatus === 'paid' || $currentOrderStatus === 'processing') {
                    $this->updateOrderStatus(
                        $orderId,
                        'shipped',
                        "Dispatched with {$carrier}" . ($trackingNumber ? " (Tracking: {$trackingNumber})" : "") . ".",
                        $adminId
                    );
                }
            }

            $afterShipment = json_encode($db->fetchOne("SELECT * FROM `shipments` WHERE `id` = ?", 'i', [$shipmentId]));

            // Audit log
            $db->insert(
                "INSERT INTO `admin_audit_logs` (`admin_id`, `action`, `entity_type`, `entity_id`, `before_state`, `after_state`, `ip_address`, `user_agent`, `created_at`)
                 VALUES (?, 'shipment.assign', 'order', ?, ?, ?, ?, ?, NOW())",
                'isssss',
                [
                    $adminId,
                    (string) $orderId,
                    $beforeShipment,
                    $afterShipment,
                    $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
                    $_SERVER['HTTP_USER_AGENT'] ?? 'CLI/System',
                ]
            );

            return $this->loadOrderSnapshot($orderId);
        });

        // Dispatch tracking update notification
        try {
            MailService::getInstance()->sendShipmentTracking($snapshot, [
                'carrier' => $carrier,
                'tracking_number' => $trackingNumber,
                'tracking_url' => $trackingUrl,
                'status' => $shipmentStatus,
            ]);
        } catch (\Throwable $e) {
            error_log('[MailService Notice] ' . $e->getMessage());
        }

        return $snapshot;
    }

    /**
     * Mark an order as delivered with delivery confirmation timestamp.
     */
    public function markDelivered(int $orderId, ?string $comment = null, ?int $adminId = null): array
    {
        return $this->db->transaction(function (Database $db) use ($orderId, $comment, $adminId) {
            // Update shipment status if exists
            $shipment = $db->fetchOne("SELECT * FROM `shipments` WHERE `order_id` = ? ORDER BY `id` DESC LIMIT 1", 'i', [$orderId]);
            if ($shipment !== null) {
                $db->executeUpdate(
                    "UPDATE `shipments` SET `status` = 'delivered', `delivered_at` = COALESCE(`delivered_at`, NOW()), `updated_at` = NOW() WHERE `id` = ?",
                    'i',
                    [(int) $shipment['id']]
                );
            }

            return $this->updateOrderStatus(
                $orderId,
                'delivered',
                $comment ?? 'Delivery confirmed by logistics carrier / recipient.',
                $adminId
            );
        });
    }

    /**
     * Load complete order snapshot with items, status history, payment, and shipment.
     */
    public function loadOrderSnapshot(int $orderId): array
    {
        $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
        if ($order === null) {
            throw new InvalidArgumentException("Order ID {$orderId} not found.");
        }

        unset($order['guest_access_token_hash']);

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

        // Shipment
        $shipment = $this->db->fetchOne(
            "SELECT `id`, `carrier`, `tracking_number`, `tracking_url`, `status`, `shipped_at`, `delivered_at`, `created_at`, `updated_at`
             FROM `shipments` WHERE `order_id` = ? ORDER BY `id` DESC LIMIT 1",
            'i',
            [$orderId]
        );
        $order['shipment'] = $shipment;

        // Items
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
        $order['items'] = $items;

        // Status history
        $history = $this->db->fetchAll(
            "SELECT `previous_status`, `new_status`, `comment`, `changed_by_user_id`, `created_at`
             FROM `order_status_history` WHERE `order_id` = ? ORDER BY `id` ASC",
            'i',
            [$orderId]
        );
        $order['history'] = $history;

        // Payment
        $payment = $this->db->fetchOne(
            "SELECT `id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `verified_at`
             FROM `payments` WHERE `order_id` = ? ORDER BY `id` DESC LIMIT 1",
            'i',
            [$orderId]
        );
        $order['payment'] = $payment;

        return $order;
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
