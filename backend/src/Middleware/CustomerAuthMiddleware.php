<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Repositories\SessionRepository;
use App\Repositories\UserRepository;
use App\Support\RequestContext;
use App\Support\Response;

/**
 * Customer Authentication Middleware.
 * Resolves session from HTTP-only cookie or Authorization: Bearer header,
 * validates CSRF protection on mutating cookie requests, and isolates customer context.
 */
class CustomerAuthMiddleware
{
    public static function handle(): void
    {
        $sessionRepo = new SessionRepository();
        $userRepo = new UserRepository();

        $token = null;
        $isCookieAuth = false;

        // 1. Check HTTP-only cookie first
        if (!empty($_COOKIE['shopco_session'])) {
            $token = trim($_COOKIE['shopco_session']);
            $isCookieAuth = true;
        }

        // 2. Check Authorization: Bearer header
        if (empty($token)) {
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
            if (str_starts_with($authHeader, 'Bearer ')) {
                $token = trim(substr($authHeader, 7));
                $isCookieAuth = false;
            }
        }

        if (empty($token)) {
            Response::error(
                'Authentication required. Please sign in or provide a valid session token.',
                401,
                'UNAUTHENTICATED'
            );
        }

        $session = $sessionRepo->find($token);
        if ($session === null) {
            Response::error(
                'Session has expired or is invalid. Please sign in again.',
                401,
                'SESSION_EXPIRED'
            );
        }

        // 3. For cookie-authenticated mutating requests (POST, PUT, PATCH, DELETE), enforce CSRF
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        if ($isCookieAuth && in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $csrfHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_SERVER['HTTP_CSRF_TOKEN'] ?? '';
            $expectedCsrf = $session['payload']['csrf_token'] ?? '';

            if (empty($csrfHeader) || !hash_equals($expectedCsrf, $csrfHeader)) {
                Response::error(
                    'CSRF validation failed. Missing or invalid X-CSRF-Token header.',
                    403,
                    'CSRF_MISMATCH'
                );
            }
        }

        // 4. Retrieve complete user details
        $user = $userRepo->findById((int) $session['user_id']);
        if ($user === null || $user['status'] === 'suspended') {
            Response::error('User account is inactive or suspended.', 403, 'FORBIDDEN');
        }

        // Populate context and touch session
        RequestContext::setUser($user);
        RequestContext::setSession($session);
        RequestContext::setCsrfToken($session['payload']['csrf_token'] ?? null);

        $sessionRepo->touch($token);
    }
}
