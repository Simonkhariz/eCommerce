<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Env;
use App\Database\Database;
use App\Support\Response;

/**
 * Health check controller reporting system readiness, runtime environment,
 * store configuration, and database connectivity.
 */
class HealthController
{
    /**
     * Handle GET /api/v1/health
     */
    public function check(): void
    {
        $dbStatus = Database::getInstance()->ping();

        $isHealthy = $dbStatus['connected'];

        $data = [
            'status' => $isHealthy ? 'healthy' : 'degraded',
            'service' => Env::get('APP_NAME', 'Shop.co REST API'),
            'version' => '1.0.0',
            'environment' => Env::get('APP_ENV', 'development'),
            'timestamp' => time(),
            'iso_date' => date('c'),
            'php_version' => PHP_VERSION,
            'runtime' => [
                'memory_usage_mb' => round(memory_get_usage(true) / 1024 / 1024, 2),
                'extensions' => [
                    'mysqli' => extension_loaded('mysqli'),
                    'curl' => extension_loaded('curl'),
                    'mbstring' => extension_loaded('mbstring'),
                    'openssl' => extension_loaded('openssl'),
                    'json' => extension_loaded('json'),
                    'fileinfo' => extension_loaded('fileinfo'),
                ],
            ],
            'store' => [
                'currency' => Env::get('STORE_CURRENCY', 'NGN'),
                'origin' => [
                    'city' => Env::get('STORE_ORIGIN_CITY', 'Enugu'),
                    'state' => Env::get('STORE_ORIGIN_STATE', 'Enugu'),
                ],
            ],
            'database' => $dbStatus,
        ];

        Response::success(
            $data,
            $isHealthy ? 'System is fully operational.' : 'System is degraded: Database unreachable.',
            $isHealthy ? 200 : 503
        );
    }
}
