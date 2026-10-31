<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Database\Database;

/**
 * Live payment status for the payment return page (roadmap Prompt 33, docs/SSE_CONTRACT.md).
 *
 * The stream only watches: it reads the order and its payments with plain autocommit queries,
 * so it can only ever see committed data, and it never confirms a payment or changes an order
 * (every confirmation still goes through PaymentFinalizer). Off unless SSE_ENABLED=true.
 *
 * Each open stream holds one PHP worker and one database connection, so streams are counted in
 * `rate_limits` rows (id "sse:<order>:<visitor>:<random>", window_start = opening time) and
 * capped per order, per visitor and per server. A row counts for the stream's length plus 10 s,
 * so a process that was killed frees its slot on its own.
 */
final class LiveStatus
{
    public const PER_ORDER = 2;
    public const PER_VISITOR = 4;
    private const LOCK = 'shopco_sse_slots';

    public static function enabled(): bool
    {
        return Env::bool('SSE_ENABLED', false);
    }

    /** Streams allowed on this server at once (each holds a PHP worker and a DB connection). */
    public static function maxStreams(): int
    {
        return max(1, Env::int('SSE_MAX_STREAMS', 8));
    }

    /** Stream length: under the storefront proxy's 120 s limit. */
    public static function streamSeconds(): int
    {
        return min(115, max(3, Env::int('SSE_STREAM_SECONDS', 110)));
    }

    public static function heartbeatSeconds(): int
    {
        return min(30, max(1, Env::int('SSE_HEARTBEAT_SECONDS', 15)));
    }

    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::getInstance();
    }

    /**
     * The order's payment state in verify-payment's words: the successful attempt if there is
     * one, else the newest. `id` changes whenever the state does.
     *
     * @return array{id: string, order_number: string, status: string, order_status: string, final: bool}
     */
    public function snapshot(int $orderId): array
    {
        $order = $this->db->fetchOne("SELECT `order_number`, `order_status` FROM `orders` WHERE `id` = ?", 'i', [$orderId]);
        $payment = $this->db->fetchOne(
            "SELECT `id`, `status` FROM `payments` WHERE `order_id` = ?
             ORDER BY (`status` IN ('successful', 'partially_refunded', 'refunded')) DESC, `id` DESC LIMIT 1",
            'i',
            [$orderId]
        );
        $status = $payment === null ? 'not_started' : match ((string) $payment['status']) {
            'successful', 'partially_refunded', 'refunded' => 'successful',
            'failed', 'cancelled' => 'failed',
            default => 'pending',
        };
        $orderStatus = (string) ($order['order_status'] ?? '');

        return [
            'id' => ($payment === null ? '0' : (string) $payment['id']) . '-' . $status . '-' . $orderStatus,
            'order_number' => (string) ($order['order_number'] ?? ''),
            'status' => $status,
            'order_status' => $orderStatus,
            // Nothing more will change for this page: paid, or the order closed.
            'final' => $status === 'successful' || $orderStatus === 'cancelled',
        ];
    }

    /**
     * Take a stream slot for this order and visitor. Returns the slot id, or null when the order,
     * the visitor or the server already has as many streams as allowed.
     */
    public function claimSlot(int $orderId, string $visitor): ?string
    {
        $visitorKey = substr(hash('sha256', $visitor), 0, 16);
        $now = time();
        $since = $now - (self::streamSeconds() + 10);

        $got = $this->db->fetchOne("SELECT GET_LOCK(?, 2) AS got", 's', [self::LOCK]);
        if ((int) ($got['got'] ?? 0) !== 1) {
            return null;
        }
        try {
            $live = fn (string $pattern): int => (int) $this->db->fetchOne(
                "SELECT COUNT(*) AS c FROM `rate_limits` WHERE `id` LIKE ? AND `window_start` > ?",
                'si',
                [$pattern, $since]
            )['c'];
            $server = $live('sse:%');
            $order = $live('sse:' . $orderId . ':%');
            $mine = $live('sse:%:' . $visitorKey . ':%');
            if ($server >= self::maxStreams() || $order >= self::PER_ORDER || $mine >= self::PER_VISITOR) {
                return null;
            }

            $slot = 'sse:' . $orderId . ':' . $visitorKey . ':' . bin2hex(random_bytes(8));
            $this->db->execute("INSERT INTO `rate_limits` (`id`, `hits`, `window_start`) VALUES (?, 1, ?)", 'si', [$slot, $now]);
            // Old slots of finished or killed streams: removed here, as their count has lapsed.
            $this->db->execute("DELETE FROM `rate_limits` WHERE `id` LIKE 'sse:%' AND `window_start` <= ?", 'i', [$since]);
            return $slot;
        } finally {
            $this->db->fetchOne("SELECT RELEASE_LOCK(?) AS released", 's', [self::LOCK]);
        }
    }

    public function releaseSlot(string $slot): void
    {
        $this->db->execute("DELETE FROM `rate_limits` WHERE `id` = ?", 's', [$slot]);
    }
}
