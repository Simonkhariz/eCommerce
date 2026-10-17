<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Database;
use App\Repositories\SessionRepository;
use App\Repositories\StoreSettingsRepository;
use App\Repositories\TokenRepository;
use App\Repositories\UserRepository;
use App\Support\Response;

/**
 * Service orchestrating authentication, sessions, security tokens, and customer accounts.
 */
class AuthService
{
    private UserRepository $userRepo;
    private SessionRepository $sessionRepo;
    private TokenRepository $tokenRepo;
    private StoreSettingsRepository $settingsRepo;
    private Database $db;

    public function __construct()
    {
        $this->userRepo = new UserRepository();
        $this->sessionRepo = new SessionRepository();
        $this->tokenRepo = new TokenRepository();
        $this->settingsRepo = new StoreSettingsRepository();
        $this->db = Database::getInstance();
    }

    /**
     * One-time protected setup flow for the single initial admin.
     */
    public function setupStore(array $input, ?string $ip = null, ?string $userAgent = null): array
    {
        if ($this->settingsRepo->isSetupCompleted()) {
            Response::error(
                'First-run admin onboarding is already completed. Public setup is permanently closed.',
                403,
                'SETUP_ALREADY_COMPLETED'
            );
        }

        $name = trim($input['name'] ?? $input['full_name'] ?? '');
        $email = trim(strtolower($input['email'] ?? ''));
        $password = $input['password'] ?? '';
        $storeName = trim($input['store_name'] ?? 'SHOP.CO');
        $originCity = trim($input['origin_city'] ?? 'Enugu');
        $originState = trim($input['origin_state'] ?? 'Enugu');
        $originAddress = trim($input['origin_address'] ?? '12 Okpara Avenue, Independence Layout, Enugu, Nigeria');
        $contactEmail = trim(strtolower($input['contact_email'] ?? $email));
        $contactPhone = trim($input['contact_phone'] ?? '+234 803 000 0000');

        $errors = [];
        if ($name === '') {
            $errors['name'] = 'Admin full name is required.';
        }
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'A valid email address is required.';
        }
        if (strlen($password) < 8) {
            $errors['password'] = 'Password must be at least 8 characters long.';
        }

        if (!empty($errors)) {
            Response::error('Setup validation failed.', 422, 'VALIDATION_ERROR', $errors);
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $createdAdminId = 0;

        $this->db->transaction(function (Database $db) use (
            $name, $email, $passwordHash, $storeName, $originCity, $originState, $originAddress, $contactEmail, $contactPhone, &$createdAdminId
        ) {
            // Insert single admin
            $createdAdminId = (int) $db->insert(
                "INSERT INTO `users` (`uuid`, `email`, `password_hash`, `full_name`, `role`, `status`, `email_verified_at`)
                 VALUES (UUID(), ?, ?, ?, 'admin', 'active', NOW())",
                'sss',
                [$email, $passwordHash, $name]
            );

            // Persist store settings
            $settings = [
                'store_name' => $storeName,
                'store_origin_city' => $originCity,
                'store_origin_state' => $originState,
                'store_origin_address' => $originAddress,
                'store_contact_email' => $contactEmail,
                'store_contact_phone' => $contactPhone,
                'admin_onboarded_email' => $email,
                'is_setup_completed' => '1',
            ];

            foreach ($settings as $key => $val) {
                $db->execute(
                    "INSERT INTO `store_settings` (`key_name`, `value`) VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
                    'ss',
                    [$key, $val]
                );
            }

            // Log setup completion in audit log
            $db->execute(
                "INSERT INTO `admin_audit_logs` (`admin_id`, `action`, `entity_type`, `entity_id`, `after_state`)
                 VALUES (?, 'admin_onboarding_completed', 'system', 'setup', ?)",
                'is',
                [$createdAdminId, json_encode(['email' => $email, 'origin_city' => $originCity, 'origin_state' => $originState])]
            );
        });

        // Create initial authenticated session for newly onboarded admin
        $sessionData = $this->sessionRepo->create($createdAdminId, $ip, $userAgent);
        $this->setSessionCookie($sessionData['token'], strtotime($sessionData['expires_at']));

        $user = $this->userRepo->findById($createdAdminId);

        return [
            'user' => UserRepository::toSafeUser($user),
            'session_token' => $sessionData['token'],
            'csrf_token' => $sessionData['csrf_token'],
            'expires_at' => $sessionData['expires_at'],
        ];
    }

    /**
     * Customer registration. Roles cannot be chosen via public registration.
     */
    public function registerCustomer(array $input, ?string $ip = null, ?string $userAgent = null): array
    {
        $name = trim($input['full_name'] ?? $input['name'] ?? '');
        $email = trim(strtolower($input['email'] ?? ''));
        $password = $input['password'] ?? '';
        $phone = isset($input['phone']) ? trim($input['phone']) : null;

        $errors = [];
        if ($name === '') {
            $errors['full_name'] = 'Full name is required.';
        }
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'A valid email address is required.';
        }
        if (strlen($password) < 8) {
            $errors['password'] = 'Password must be at least 8 characters long.';
        }

        if (!empty($errors)) {
            Response::error('Registration validation failed.', 422, 'VALIDATION_ERROR', $errors);
        }

        $existing = $this->userRepo->findByEmail($email);
        if ($existing !== null) {
            Response::error('An account with this email address already exists.', 409, 'EMAIL_ALREADY_EXISTS');
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $userId = $this->userRepo->create([
            'email' => $email,
            'password_hash' => $passwordHash,
            'full_name' => $name,
            'phone' => $phone,
            'role' => 'customer', // strictly customer
            'status' => 'active',
            'email_verified_at' => null,
        ]);

        // Generate email verification token
        $verifyToken = $this->tokenRepo->create($email, 'email_verify', $userId, 60);

        // Create session
        $sessionData = $this->sessionRepo->create($userId, $ip, $userAgent);
        $this->setSessionCookie($sessionData['token'], strtotime($sessionData['expires_at']));

        $user = $this->userRepo->findById($userId);

        return [
            'user' => UserRepository::toSafeUser($user),
            'session_token' => $sessionData['token'],
            'csrf_token' => $sessionData['csrf_token'],
            'expires_at' => $sessionData['expires_at'],
            'verification_token' => $verifyToken, // Useful for local dev & testing
        ];
    }

    /**
     * Standard password-based login for customers and administrators.
     */
    public function login(string $email, string $password, ?string $ip = null, ?string $userAgent = null): array
    {
        $email = trim(strtolower($email));
        $this->checkRateLimit($ip, $email);

        $user = $this->userRepo->findByEmail($email);
        if ($user === null || empty($user['password_hash']) || !password_verify($password, $user['password_hash'])) {
            $this->recordFailedAttempt($ip, $email);
            Response::error('Invalid email or password credentials.', 401, 'INVALID_CREDENTIALS');
        }

        if ($user['status'] === 'suspended') {
            Response::error('Account has been suspended. Please contact customer support.', 403, 'ACCOUNT_SUSPENDED');
        }

        // Clear failures upon successful authentication
        $this->clearFailedAttempts($ip, $email);

        // Rotate session ID upon login
        $oldToken = $_COOKIE['shopco_session'] ?? null;
        if (!empty($oldToken)) {
            $sessionData = $this->sessionRepo->rotate($oldToken, (int) $user['id'], $ip, $userAgent);
        } else {
            $sessionData = $this->sessionRepo->create((int) $user['id'], $ip, $userAgent);
        }

        $this->setSessionCookie($sessionData['token'], strtotime($sessionData['expires_at']));

        return [
            'user' => UserRepository::toSafeUser($user),
            'session_token' => $sessionData['token'],
            'csrf_token' => $sessionData['csrf_token'],
            'expires_at' => $sessionData['expires_at'],
        ];
    }

    /**
     * Passwordless / Magic-Link Sign In request.
     * Generates a single-use token and records in outbox.
     */
    public function requestMagicLink(string $email): array
    {
        $email = trim(strtolower($email));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email address is required.', 422, 'VALIDATION_ERROR', [
                'email' => 'Please provide a valid email address.',
            ]);
        }

        // Find or create lightweight profile for this shopper
        $user = $this->userRepo->findByEmail($email);
        if ($user === null) {
            $namePart = ucfirst(explode('@', $email)[0]);
            $userId = $this->userRepo->create([
                'email' => $email,
                'full_name' => $namePart,
                'role' => 'customer',
                'status' => 'unverified',
            ]);
        } else {
            $userId = (int) $user['id'];
        }

        $rawToken = $this->tokenRepo->create($email, 'magic_link', $userId, 15);

        return [
            'message' => 'Magic sign-in link generated and sent.',
            'email' => $email,
            'magic_token' => $rawToken, // Provided for easy automated test and local dev inspection
            'expires_in_minutes' => 15,
        ];
    }

    /**
     * Verify Magic-Link token and authenticate customer.
     */
    public function verifyMagicLink(string $token, ?string $ip = null, ?string $userAgent = null): array
    {
        $tokenRecord = $this->tokenRepo->verify($token, 'magic_link');
        if ($tokenRecord === null) {
            Response::error('Invalid, expired, or already used magic link.', 401, 'INVALID_MAGIC_LINK');
        }

        $userId = (int) $tokenRecord['user_id'];
        $this->tokenRepo->markUsed((int) $tokenRecord['id']);
        $this->userRepo->markEmailVerified($userId);

        // Rotate session ID
        $oldToken = $_COOKIE['shopco_session'] ?? null;
        if (!empty($oldToken)) {
            $sessionData = $this->sessionRepo->rotate($oldToken, $userId, $ip, $userAgent);
        } else {
            $sessionData = $this->sessionRepo->create($userId, $ip, $userAgent);
        }

        $this->setSessionCookie($sessionData['token'], strtotime($sessionData['expires_at']));
        $user = $this->userRepo->findById($userId);

        return [
            'user' => UserRepository::toSafeUser($user),
            'session_token' => $sessionData['token'],
            'csrf_token' => $sessionData['csrf_token'],
            'expires_at' => $sessionData['expires_at'],
        ];
    }

    /**
     * Terminate active session and clear HTTP cookie.
     */
    public function logout(?string $token): void
    {
        if (!empty($token)) {
            $this->sessionRepo->destroy($token);
        }
        $this->clearSessionCookie();
    }

    /**
     * Set secure HTTP-only SameSite cookie.
     */
    public function setSessionCookie(string $token, int $expiresTimestamp): void
    {
        $isSecure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';

        setcookie('shopco_session', $token, [
            'expires' => $expiresTimestamp,
            'path' => '/',
            'domain' => '',
            'secure' => $isSecure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    /**
     * Expire session cookie.
     */
    public function clearSessionCookie(): void
    {
        setcookie('shopco_session', '', [
            'expires' => time() - 3600,
            'path' => '/',
            'domain' => '',
            'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    /**
     * Validate CSRF token for cookie-authenticated mutating requests.
     */
    public function validateCsrf(string $providedToken, array $session): bool
    {
        $sessionCsrf = $session['payload']['csrf_token'] ?? null;
        if (empty($sessionCsrf) || empty($providedToken)) {
            return false;
        }
        return hash_equals($sessionCsrf, $providedToken);
    }

    /**
     * Login Throttling: Max 5 failed attempts within 15 minutes.
     */
    private function checkRateLimit(?string $ip, string $email): void
    {
        $key = md5(($ip ?? 'cli') . ':' . $email);
        $cacheFile = BASE_PATH . '/storage/framework/rate_limits.json';
        $data = $this->loadRateLimits($cacheFile);

        $now = time();
        $window = 900; // 15 minutes
        $maxAttempts = 5;

        if (isset($data[$key])) {
            $attempts = array_filter($data[$key], fn(int $ts) => ($now - $ts) < $window);
            if (count($attempts) >= $maxAttempts) {
                Response::error(
                    'Too many failed login attempts. Please wait 15 minutes before trying again.',
                    429,
                    'TOO_MANY_REQUESTS',
                    ['retry_after_seconds' => $window - ($now - min($attempts))]
                );
            }
        }
    }

    private function recordFailedAttempt(?string $ip, string $email): void
    {
        $key = md5(($ip ?? 'cli') . ':' . $email);
        $cacheFile = BASE_PATH . '/storage/framework/rate_limits.json';
        $data = $this->loadRateLimits($cacheFile);

        $now = time();
        $window = 900;

        $attempts = isset($data[$key])
            ? array_filter($data[$key], fn(int $ts) => ($now - $ts) < $window)
            : [];

        $attempts[] = $now;
        $data[$key] = array_values($attempts);

        $this->saveRateLimits($cacheFile, $data);
    }

    private function clearFailedAttempts(?string $ip, string $email): void
    {
        $key = md5(($ip ?? 'cli') . ':' . $email);
        $cacheFile = BASE_PATH . '/storage/framework/rate_limits.json';
        $data = $this->loadRateLimits($cacheFile);

        if (isset($data[$key])) {
            unset($data[$key]);
            $this->saveRateLimits($cacheFile, $data);
        }
    }

    private function loadRateLimits(string $file): array
    {
        if (!file_exists($file)) {
            return [];
        }
        $content = @file_get_contents($file);
        if ($content === false) {
            return [];
        }
        return json_decode($content, true) ?: [];
    }

    private function saveRateLimits(string $file, array $data): void
    {
        $dir = dirname($file);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        @file_put_contents($file, json_encode($data));
    }
}
