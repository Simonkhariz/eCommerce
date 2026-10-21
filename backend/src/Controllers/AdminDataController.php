<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database\Database;
use App\Middleware\JsonBodyMiddleware;
use App\Services\AuditService;
use App\Services\DatabaseCleanup;
use App\Services\StorageHealth;
use App\Support\RequestContext;
use App\Support\Response;

/**
 * Admin → Data & storage: how long customer data and logs are kept, the database's size and
 * speed, and running the clean-up by hand.
 */
final class AdminDataController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * GET /api/v1/admin/data
     * Retention settings with their choices, the full health report and what a clean-up
     * would remove right now.
     */
    public function overview(): void
    {
        $cleanup = new DatabaseCleanup($this->db);
        $health = new StorageHealth($this->db);

        Response::success([
            'settings' => $cleanup->settings() + ['storage_alert_mb' => $health->alertMb()],
            'options' => DatabaseCleanup::OPTIONS + ['storage_alert_mb' => StorageHealth::ALERT_MB_OPTIONS],
            'labels' => DatabaseCleanup::LABELS,
            'health' => $health->report(true),
        ], 'Data and storage retrieved.');
    }

    /**
     * GET /api/v1/admin/data/alert
     * Quick check for the admin alert bell (no query timing or clean-up count).
     */
    public function alert(): void
    {
        $report = (new StorageHealth($this->db))->report(false);
        Response::success(['level' => $report['level'], 'issues' => $report['issues']], 'Storage alert retrieved.');
    }

    /**
     * PUT /api/v1/admin/data/settings  {retention_customer_days, retention_unpaid_days,
     * retention_message_days, retention_activity_days, storage_alert_mb} (any subset)
     */
    public function updateSettings(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $options = DatabaseCleanup::OPTIONS + ['storage_alert_mb' => StorageHealth::ALERT_MB_OPTIONS];
        $errors = [];
        $changes = [];

        foreach ($body as $key => $value) {
            if (!isset($options[$key])) {
                $errors[$key] = 'This setting cannot be changed here.';
            } elseif (!is_numeric($value) || !in_array((int) $value, $options[$key], true)) {
                $errors[$key] = 'Choose one of the listed options.';
            } else {
                $changes[$key] = (int) $value;
            }
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted settings.', 422, 'VALIDATION_ERROR', $errors);
        }
        if ($changes === []) {
            Response::error('Nothing to save.', 422, 'VALIDATION_ERROR');
        }

        $before = (new DatabaseCleanup($this->db))->settings() + ['storage_alert_mb' => (new StorageHealth($this->db))->alertMb()];
        foreach ($changes as $key => $value) {
            $this->db->execute(
                "INSERT INTO `store_settings` (`key_name`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
                'ss',
                [$key, (string) $value]
            );
        }
        $after = (new DatabaseCleanup($this->db))->settings() + ['storage_alert_mb' => (new StorageHealth($this->db))->alertMb()];

        AuditService::record($this->adminId(), 'data_retention.update', 'store_settings', 'data_retention', $before, $after);
        Response::success($after, 'Data settings saved.');
    }

    /**
     * POST /api/v1/admin/data/cleanup  {expected_customers}
     * Runs the clean-up now. expected_customers is the number of inactive customers the admin
     * saw in the preview; if it has changed, nothing is removed and the admin looks again.
     */
    public function runCleanup(): void
    {
        $body = JsonBodyMiddleware::getBody();
        $cleanup = new DatabaseCleanup($this->db);

        $preview = $cleanup->run(true);
        $customers = (int) ($preview['inactive_customers'] ?? 0);
        if (!isset($body['expected_customers']) || (int) $body['expected_customers'] !== $customers) {
            Response::error(
                "The number of customers to remove has changed (now {$customers}). Review the list again before cleaning up.",
                409,
                'CLEANUP_CHANGED',
                ['inactive_customers' => $customers]
            );
        }

        $removed = $cleanup->run(false, 'admin');
        AuditService::record($this->adminId(), 'data.cleanup', 'database', null, null, ['removed' => $removed]);

        Response::success(['removed' => $removed], 'Clean-up finished.');
    }

    private function adminId(): ?int
    {
        $admin = RequestContext::getUser();
        return $admin ? (int) $admin['id'] : null;
    }
}
