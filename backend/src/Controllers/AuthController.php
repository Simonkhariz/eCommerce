<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\JsonBodyMiddleware;
use App\Repositories\SessionRepository;
use App\Repositories\UserRepository;
use App\Services\AuthService;
use App\Support\RequestContext;
use App\Support\Response;

/**
 * Controller handling user registration, authentication, session lifecycle, and magic links.
 */
class AuthController
{
    private AuthService $authService;
    private SessionRepository $sessionRepo;
    private UserRepository $userRepo;

    public function __construct()
    {
        $this->authService = new AuthService();
        $this->sessionRepo = new SessionRepository();
        $this->userRepo = new UserRepository();
    }

    /**
     * Customer registration.
     */
    public function register(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

        $result = $this->authService->registerCustomer($body, $ip, $userAgent);

        Response::success($result, 'Account created successfully.', 201);
    }

    /**
     * Email and password login.
     */
    public function login(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $email = $body['email'] ?? '';
        $password = $body['password'] ?? '';
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

        if (empty($email) || empty($password)) {
            Response::error('Email and password are required.', 422, 'VALIDATION_ERROR', [
                'email' => empty($email) ? 'Email is required.' : null,
                'password' => empty($password) ? 'Password is required.' : null,
            ]);
        }

        $result = $this->authService->login($email, $password, $ip, $userAgent);

        Response::success($result, 'Signed in successfully.');
    }

    /**
     * Terminate active session.
     */
    public function logout(): void
    {
        $token = $_COOKIE['shopco_session'] ?? null;
        if (empty($token)) {
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
            if (str_starts_with($authHeader, 'Bearer ')) {
                $token = trim(substr($authHeader, 7));
            }
        }

        $this->authService->logout($token);

        Response::success(null, 'Signed out successfully.');
    }

    /**
     * Retrieve the currently authenticated user profile and session info.
     */
    public function me(): void
    {
        $token = $_COOKIE['shopco_session'] ?? null;
        if (empty($token)) {
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
            if (str_starts_with($authHeader, 'Bearer ')) {
                $token = trim(substr($authHeader, 7));
            }
        }

        if (empty($token)) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $session = $this->sessionRepo->find($token);
        if ($session === null) {
            Response::error('Session expired or invalid.', 401, 'SESSION_EXPIRED');
        }

        $user = $this->userRepo->findById((int) $session['user_id']);
        if ($user === null) {
            Response::error('User not found.', 404, 'USER_NOT_FOUND');
        }

        Response::success([
            'user' => UserRepository::toSafeUser($user),
            'csrf_token' => $session['payload']['csrf_token'] ?? null,
            'expires_at' => $session['expires_at'],
        ], 'Current user session retrieved.');
    }

    /**
     * Request a passwordless magic sign-in link.
     */
    public function requestMagicLink(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $email = $body['email'] ?? '';

        $result = $this->authService->requestMagicLink($email);

        Response::success($result, 'Magic sign-in link generated.');
    }

    /**
     * Verify a magic sign-in token.
     */
    public function verifyMagicLink(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $token = $body['token'] ?? '';
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

        if (empty($token)) {
            Response::error('Verification token is required.', 422, 'VALIDATION_ERROR', [
                'token' => 'Token cannot be empty.',
            ]);
        }

        $result = $this->authService->verifyMagicLink($token, $ip, $userAgent);

        Response::success($result, 'Magic link verified successfully.');
    }
}
