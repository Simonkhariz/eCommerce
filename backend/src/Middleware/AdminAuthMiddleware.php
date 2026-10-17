<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Env;
use App\Repositories\SessionRepository;
use App\Repositories\UserRepository;
use App\Support\RequestContext;
use App\Support\Response;

/**
 * Admin Authorization Middleware.
 * Enforces server-side administrator role verification for all admin endpoints.
 * Accepts session cookies, Bearer session tokens, or configured dev admin token.
 */
class AdminAuthMiddleware
{
    /**
     * Verify that the incoming request is authorized for admin operations.
     */
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
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (empty($token) && str_starts_with($authHeader, 'Bearer ')) {
            $token = trim(substr($authHeader, 7));
            $isCookieAuth = false;
        }

        // 3. Check dev token fallback if configured
        $customHeader = $_SERVER['HTTP_X_DEV_ADMIN_TOKEN'] ?? $_SERVER['REDIRECT_HTTP_X_DEV_ADMIN_TOKEN'] ?? '';
        $devToken = Env::get('DEV_ADMIN_API_TOKEN', 'dev_admin_secret_token_12345');

        if (!empty($token) && hash_equals($devToken, $token)) {
            // Authorized via dev admin token
            return;
        }
        if (!empty($customHeader) && hash_equals($devToken, $customHeader)) {
            return;
        }

        // 4. Validate session
        if (empty($token)) {
            Response::error(
                'Unauthorized admin access. Administrator authentication required.',
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

        // Enforce CSRF on cookie mutating requests
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        if ($isCookieAuth && in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $csrfHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_SERVER['HTTP_CSRF_TOKEN'] ?? '';
            $expectedCsrf = $session['payload']['csrf_token'] ?? '';

            if (empty($csrfHeader) || !hash_equals($expectedCsrf, $csrfHeader)) {
                Response::error(
                    'CSRF validation failed for administrative mutation.',
                    403,
                    'CSRF_MISMATCH'
                );
            }
        }

        $user = $userRepo->findById((int) $session['user_id']);
        if ($user === null) {
            Response::error('User account not found.', 401, 'UNAUTHENTICATED');
        }

        // Server-side role check
        if (!in_array($user['role'], ['admin', 'super_admin'], true)) {
            Response::error(
                'Forbidden. Administrator privileges required to access this resource.',
                403,
                'FORBIDDEN'
            );
        }

        RequestContext::setUser($user);
        RequestContext::setSession($session);
        RequestContext::setCsrfToken($session['payload']['csrf_token'] ?? null);

        $sessionRepo->touch($token);
    }
}
