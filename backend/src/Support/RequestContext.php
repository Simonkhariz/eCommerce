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

    public static function reset(): void
    {
        self::$user = null;
        self::$session = null;
        self::$csrfToken = null;
    }
}
