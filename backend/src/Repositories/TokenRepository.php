<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Database;

/**
 * Repository for managing email verification, magic link, and password reset tokens.
 */
class TokenRepository
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * Create a verification / magic link token.
     * Generates a 32-character raw token, stores sha256 hash in DB.
     *
     * @return string The raw token to be delivered to the user
     */
    public function create(string $email, string $type, ?int $userId = null, int $ttlMinutes = 15): string
    {
        $rawToken = bin2hex(random_bytes(16));
        $tokenHash = hash('sha256', $rawToken);
        $expiresAt = date('Y-m-d H:i:s', time() + ($ttlMinutes * 60));

        // Invalidate prior unused tokens of this type for this email
        $this->db->execute(
            "DELETE FROM `email_verification_tokens` WHERE `email` = ? AND `type` = ? AND `used_at` IS NULL",
            'ss',
            [trim(strtolower($email)), $type]
        );

        $sql = "INSERT INTO `email_verification_tokens` (`user_id`, `email`, `token_hash`, `type`, `expires_at`)
                VALUES (?, ?, ?, ?, ?)";

        $this->db->execute(
            $sql,
            'issss',
            [$userId, trim(strtolower($email)), $tokenHash, $type, $expiresAt]
        );

        // Dispatch via MailService (writes to local dev mail.log and records in email_outbox)
        try {
            \App\Services\MailService::getInstance()->sendAccountVerification(
                trim(strtolower($email)),
                $rawToken,
                $type
            );
        } catch (\Throwable $e) {
            error_log('[MailService Notice] ' . $e->getMessage());
        }

        return $rawToken;
    }

    /**
     * Look up and validate a token.
     */
    public function verify(string $rawToken, string $type): ?array
    {
        $tokenHash = hash('sha256', trim($rawToken));

        $sql = "SELECT id, user_id, email, token_hash, type, expires_at, used_at, created_at
                FROM `email_verification_tokens`
                WHERE `token_hash` = ? AND `type` = ? AND `used_at` IS NULL AND `expires_at` > NOW()
                LIMIT 1";

        return $this->db->fetchOne($sql, 'ss', [$tokenHash, $type]);
    }

    /**
     * Mark a token as used.
     */
    public function markUsed(int $id): void
    {
        $this->db->execute(
            "UPDATE `email_verification_tokens` SET `used_at` = NOW() WHERE `id` = ?",
            'i',
            [$id]
        );
    }
}
