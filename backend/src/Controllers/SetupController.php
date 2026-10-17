<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\JsonBodyMiddleware;
use App\Repositories\StoreSettingsRepository;
use App\Services\AuthService;
use App\Support\Response;

/**
 * Controller managing one-time first-run administrator onboarding.
 */
class SetupController
{
    private AuthService $authService;
    private StoreSettingsRepository $settingsRepo;

    public function __construct()
    {
        $this->authService = new AuthService();
        $this->settingsRepo = new StoreSettingsRepository();
    }

    /**
     * Check if first-run setup is completed or open.
     */
    public function getStatus(): void
    {
        $isCompleted = $this->settingsRepo->isSetupCompleted();
        $settings = $this->settingsRepo->getAll();

        Response::success([
            'is_setup_completed' => $isCompleted,
            'store_name' => $settings['store_name'] ?? 'SHOP.CO',
            'store_origin' => [
                'city' => $settings['store_origin_city'] ?? 'Enugu',
                'state' => $settings['store_origin_state'] ?? 'Enugu',
                'address' => $settings['store_origin_address'] ?? '12 Okpara Avenue, Independence Layout, Enugu, Nigeria',
            ],
            'contact_email' => $settings['store_contact_email'] ?? 'support@shop.co',
        ], 'Store setup status retrieved.');
    }

    /**
     * Perform initial admin onboarding and lock setup.
     */
    public function setupStore(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

        $result = $this->authService->setupStore($body, $ip, $userAgent);

        Response::success($result, 'Administrator onboarding completed successfully. Setup is now locked.', 201);
    }
}
