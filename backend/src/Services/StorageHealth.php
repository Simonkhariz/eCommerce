<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Database;
use App\Support\SlowRequestLog;

/**
 * Is the database getting too big, or the site slow? Used by admin → Data & storage, the
 * admin alert bell and the daily clean-up script (which emails the admins about problems).
 *
 * Checks:
 *   size      database size against the admin's limit (storage_alert_mb): warning from 80 %
 *   slow      API requests slower than SLOW_REQUEST_MS in the last 24 hours
 *   queries   time taken by a few typical storefront and admin queries (full report only)
 *   cleanup   the daily clean-up has not run for a week (the scheduled task is missing)
 *   backlog   many old rows waiting to be cleaned up (full report only)
 */
final class StorageHealth
{
    public const ALERT_MB_OPTIONS = [250, 500, 1000, 2000, 5000];
    public const DEFAULT_ALERT_MB = 500;

    private const SLOW_WARNING = 20;
    private const SLOW_CRITICAL = 200;
    private const QUERY_WARNING_MS = 500;
    private const QUERY_CRITICAL_MS = 2000;
    private const CLEANUP_OVERDUE_DAYS = 7;
    private const BACKLOG_WARNING = 10000;

    private Database $db;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
    }

    public function alertMb(): int
    {
        $row = $this->db->fetchOne("SELECT `value` FROM `store_settings` WHERE `key_name` = 'storage_alert_mb'");
        $mb = (int) ($row['value'] ?? 0);
        return in_array($mb, self::ALERT_MB_OPTIONS, true) ? $mb : self::DEFAULT_ALERT_MB;
    }

    /**
     * @param bool $full also time typical queries and count rows waiting for clean-up
     *                   (a little slower; the alert bell uses the quick version)
     * @return array<string, mixed>
     */
    public function report(bool $full = true): array
    {
        $issues = [];

        // --- Size -------------------------------------------------------------------------
        $tables = $this->db->fetchAll(
            "SELECT `TABLE_NAME` AS `name`, COALESCE(`TABLE_ROWS`, 0) AS `rows`,
                    COALESCE(`DATA_LENGTH`, 0) + COALESCE(`INDEX_LENGTH`, 0) AS `bytes`, COALESCE(`DATA_FREE`, 0) AS `free`
             FROM information_schema.`TABLES`
             WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_TYPE` = 'BASE TABLE'
             ORDER BY `bytes` DESC"
        );
        $totalBytes = array_sum(array_map(static fn (array $t): int => (int) $t['bytes'], $tables));
        $alertMb = $this->alertMb();
        $limitBytes = $alertMb * 1024 * 1024;
        $usedPercent = $limitBytes > 0 ? (int) round($totalBytes / $limitBytes * 100) : 0;
        $sizeMb = round($totalBytes / 1048576, 1);
        if ($usedPercent >= 100) {
            $issues[] = $this->issue('critical', 'size', 'The database is over your size limit', "It is {$sizeMb} MB; your alert limit is {$alertMb} MB. Clean up old data below, choose shorter keep periods, or raise the limit if your hosting plan allows it.");
        } elseif ($usedPercent >= 80) {
            $issues[] = $this->issue('warning', 'size', 'The database is getting large', "It is {$sizeMb} MB, {$usedPercent}% of your {$alertMb} MB alert limit.");
        }

        // --- Slow requests (last 24 hours) ------------------------------------------------
        $slow = $this->db->fetchOne(
            "SELECT COALESCE(SUM(`hits`), 0) AS hits, COALESCE(MAX(`max_ms`), 0) AS max_ms
             FROM `api_slow_requests` WHERE `hour_start` >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
        );
        $slowRoutes = $this->db->fetchAll(
            "SELECT `method`, `route`, SUM(`hits`) AS hits, MAX(`max_ms`) AS max_ms, ROUND(SUM(`total_ms`) / SUM(`hits`)) AS avg_ms
             FROM `api_slow_requests` WHERE `hour_start` >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
             GROUP BY `method`, `route` ORDER BY hits DESC, max_ms DESC LIMIT 5"
        );
        $slowHits = (int) ($slow['hits'] ?? 0);
        $thresholdSec = rtrim(rtrim(number_format(SlowRequestLog::thresholdMs() / 1000, 1), '0'), '.');
        if ($slowHits >= self::SLOW_WARNING) {
            $top = $slowRoutes[0] ?? null;
            $issues[] = $this->issue(
                $slowHits >= self::SLOW_CRITICAL ? 'critical' : 'warning',
                'slow',
                'The site has been slow',
                "{$slowHits} requests took longer than {$thresholdSec} s in the last 24 hours"
                . ($top ? " (most often {$top['method']} {$top['route']})" : '') . '.'
            );
        }

        // --- Clean-up schedule ------------------------------------------------------------
        $cleanup = new DatabaseCleanup($this->db);
        $lastRun = $cleanup->lastRun();
        $daysSince = $lastRun ? (int) floor((time() - strtotime((string) $lastRun['at'])) / 86400) : null;
        if ($daysSince === null || $daysSince >= self::CLEANUP_OVERDUE_DAYS) {
            $issues[] = $this->issue(
                'warning',
                'cleanup',
                $daysSince === null ? 'The clean-up has never run' : "The clean-up last ran {$daysSince} days ago",
                'Old data piles up and slows the site. Schedule backend/scripts/cleanup_database.php to run every day, or press “Clean up now”.'
            );
        }

        $report = [
            'database' => [
                'size_bytes' => $totalBytes,
                'alert_mb' => $alertMb,
                'used_percent' => $usedPercent,
                'tables' => array_map(static fn (array $t): array => [
                    'name' => (string) $t['name'],
                    'rows' => (int) $t['rows'],
                    'bytes' => (int) $t['bytes'],
                    'free_bytes' => (int) $t['free'],
                ], $full ? array_slice($tables, 0, 10) : []),
            ],
            'slow_requests' => [
                'threshold_ms' => SlowRequestLog::thresholdMs(),
                'last_24h' => $slowHits,
                'slowest_ms' => (int) ($slow['max_ms'] ?? 0),
                'routes' => $full ? array_map(static fn (array $r): array => [
                    'method' => (string) $r['method'],
                    'route' => (string) $r['route'],
                    'hits' => (int) $r['hits'],
                    'avg_ms' => (int) $r['avg_ms'],
                    'max_ms' => (int) $r['max_ms'],
                ], $slowRoutes) : [],
            ],
            'cleanup' => ['last_run' => $lastRun, 'days_since' => $daysSince],
        ];

        if ($full) {
            // --- Typical queries ----------------------------------------------------------
            $started = microtime(true);
            $this->db->fetchAll("SELECT `id` FROM `products` WHERE `status` = 'published' ORDER BY `created_at` DESC LIMIT 24");
            $this->db->fetchOne("SELECT COUNT(*) AS c FROM `orders` WHERE `created_at` >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
            $this->db->fetchAll("SELECT `id` FROM `orders` ORDER BY `created_at` DESC LIMIT 20");
            $queryMs = (int) round((microtime(true) - $started) * 1000);
            $report['queries'] = ['typical_ms' => $queryMs];
            if ($queryMs >= self::QUERY_WARNING_MS) {
                $issues[] = $this->issue(
                    $queryMs >= self::QUERY_CRITICAL_MS ? 'critical' : 'warning',
                    'queries',
                    'Database queries are slow',
                    "Typical shop queries took {$queryMs} ms (normally under 50 ms). A clean-up helps; if it stays slow, the server may need more memory."
                );
            }

            // --- Rows waiting for clean-up --------------------------------------------------
            $waiting = $cleanup->run(true);
            $waitingRows = array_sum($waiting) - ($waiting['inactive_customers'] ?? 0);
            $report['cleanup']['waiting'] = $waiting;
            if ($waitingRows >= self::BACKLOG_WARNING) {
                $issues[] = $this->issue('warning', 'backlog', 'A lot of old data is waiting to be removed', number_format($waitingRows) . ' old rows can be cleaned up now.');
            }
        }

        $level = 'ok';
        foreach ($issues as $i) {
            if ($i['level'] === 'critical') {
                $level = 'critical';
                break;
            }
            $level = 'warning';
        }

        return ['level' => $level, 'issues' => $issues, 'checked_at' => date('Y-m-d H:i:s')] + $report;
    }

    /** @return array{level: string, code: string, title: string, detail: string} */
    private function issue(string $level, string $code, string $title, string $detail): array
    {
        return compact('level', 'code', 'title', 'detail');
    }
}
