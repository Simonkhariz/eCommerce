<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Database;

/**
 * Repository for managing active authenticated user sessions in MySQL.
 */
class SessionRepository
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * Create a new session record.
     * Generates a 64-character cryptographically random token.
     *
     * @return array{token: string, session: array, csrf_token: string}
     */
    public function create(
        int $userId,
        ?string $ipAddress = null,
        ?string $userAgent = null,
        array $payload = [],
        int $ttlDays = 30
    ): array {
        $token = bin2hex(random_bytes(32));
        $csrfToken = bin2hex(random_bytes(24));
        $payload['csrf_token'] = $csrfToken;

        $lastActivity = time();
        $expiresAt = date('Y-m-d H:i:s', time() + ($ttlDays * 86400));
        $payloadJson = json_encode($payload);

        $sql = "INSERT INTO `sessions` (`id`, `user_id`, `ip_address`, `user_agent`, `payload`, `last_activity`, `expires_at`)
                VALUES (?, ?, ?, ?, ?, ?, ?)";

        $this->db->execute(
            $sql,
            'sisssis',
            [$token, $userId, $ipAddress, $userAgent, $payloadJson, $lastActivity, $expiresAt]
        );

        return [
            'token' => $token,
            'csrf_token' => $csrfToken,
            'expires_at' => $expiresAt,
            'session' => [
                'id' => $token,
                'user_id' => $userId,
                'ip_address' => $ipAddress,
                'user_agent' => $userAgent,
                'last_activity' => $lastActivity,
                'expires_at' => $expiresAt,
                'payload' => $payload,
            ],
        ];
    }

    /**
     * Look up session by token ID and join the associated user record.
     */
    public function find(string $id): ?array
    {
        $sql = "SELECT s.id, s.user_id, s.ip_address, s.user_agent, s.payload, s.last_activity, s.expires_at,
                       u.uuid, u.email, u.full_name, u.phone, u.role, u.status, u.email_verified_at
                FROM `sessions` s
                LEFT JOIN `users` u ON u.id = s.user_id
                WHERE s.id = ? AND s.expires_at > NOW()
                LIMIT 1";

        $row = $this->db->fetchOne($sql, 's', [trim($id)]);
        if ($row === null) {
            return null;
        }

        $payload = [];
        if (!empty($row['payload'])) {
            try {
                $payload = json_decode($row['payload'], true, 512, JSON_THROW_ON_ERROR) ?: [];
            } catch (\Throwable) {
                $payload = [];
            }
        }
        $row['payload'] = $payload;

        return $row;
    }

    /**
     * Rotate session ID upon authentication to prevent session fixation.
     *
     * @return array{token: string, csrf_token: string, expires_at: string}
     */
    public function rotate(string $oldId, int $userId, ?string $ipAddress = null, ?string $userAgent = null): array
    {
        $this->destroy($oldId);
        return $this->create($userId, $ipAddress, $userAgent);
    }

    /**
     * Touch session last_activity.
     */
    public function touch(string $id): void
    {
        $this->db->execute(
            "UPDATE `sessions` SET `last_activity` = ? WHERE `id` = ?",
            'is',
            [time(), $id]
        );
    }

    /**
     * Destroy / delete session.
     */
    public function destroy(string $id): void
    {
        $this->db->execute("DELETE FROM `sessions` WHERE `id` = ?", 's', [$id]);
    }

    /**
     * Destroy all sessions for a specific user.
     */
    public function destroyUserSessions(int $userId): void
    {
        $this->db->execute("DELETE FROM `sessions` WHERE `user_id` = ?", 'i', [$userId]);
    }

    /**
     * Clean expired sessions.
     */
    public function cleanExpired(): void
    {
        $this->db->execute("DELETE FROM `sessions` WHERE `expires_at` < NOW()");
    }
}
