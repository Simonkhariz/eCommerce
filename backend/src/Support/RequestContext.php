<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Context container for the current request lifecycle.
 * Holds authenticated user, session, and security attributes.
 */
class RequestContext
{
    private static ?array $user = null;
    private static ?array $session = null;
    private static ?string $csrfToken = null;

    public static function setUser(?array $user): void
    {
        self::$user = $user;
    }

    public static function getUser(): ?array
    {
        return self::$user;
    }

    public static function setSession(?array $session): void
    {
        self::$session = $session;
    }

    public static function getSession(): ?array
    {
        return self::$session;
    }

    public static function setCsrfToken(?string $token): void
    {
        self::$csrfToken = $token;
    }

    public static function getCsrfToken(): ?string
    {
        return self::$csrfToken;
    }

    /**
     * Best-effort client IP. X-Forwarded-For is only honoured when the direct peer is a
     * trusted proxy (the Next.js dev/prod server forwarding /api/v1), never from the open internet.
     */
    public static function clientIp(): string
    {
        $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? 'cli');
        $trusted = array_filter(array_map(
            'trim',
            explode(',', (string) \App\Config\Env::get('TRUSTED_PROXIES', '127.0.0.1,::1'))
        ));

        if (in_array($remote, $trusted, true)) {
            $forwarded = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
            $first = trim(explode(',', $forwarded)[0] ?? '');
            if ($first !== '' && filter_var($first, FILTER_VALIDATE_IP)) {
                return $first;
            }
        }

        return $remote;
    }

    public static function userAgent(): ?string
    {
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;
        return is_string($ua) && $ua !== '' ? mb_substr($ua, 0, 500) : null;
    }

    public static function reset(): void
    {
        self::$user = null;
        self::$session = null;
        self::$csrfToken = null;
    }
}
