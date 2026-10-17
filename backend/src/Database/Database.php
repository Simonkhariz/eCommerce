<?php

declare(strict_types=1);

namespace App\Database;

use App\Config\Env;
use mysqli;
use mysqli_stmt;
use RuntimeException;
use Throwable;

/**
 * Singleton database wrapper providing managed MySQLi connections,
 * prepared statement execution, and transaction lifecycle.
 */
class Database
{
    private static ?Database $instance = null;
    private ?mysqli $connection = null;

    private function __construct()
    {
    }

    /**
     * Get the singleton Database instance.
     */
    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Retrieve the active MySQLi connection, initializing if necessary.
     */
    public function getConnection(): mysqli
    {
        if ($this->connection !== null && @$this->connection->ping()) {
            return $this->connection;
        }

        $host = Env::get('DB_HOST', '127.0.0.1');
        $port = Env::int('DB_PORT', 3306);
        $database = Env::get('DB_DATABASE', 'shopco_dev');
        $username = Env::get('DB_USERNAME', 'root');
        $password = Env::get('DB_PASSWORD', '');

        // Report all mysqli errors as exceptions
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        try {
            $conn = new mysqli($host, $username, $password, $database, $port);
            $conn->set_charset('utf8mb4');
            $this->connection = $conn;
            return $this->connection;
        } catch (Throwable $e) {
            // Log full exception internally, but never leak credentials to the caller
            error_log(sprintf('[DB Connection Failure] %s in %s:%d', $e->getMessage(), $e->getFile(), $e->getLine()));
            throw new RuntimeException('Database connection failed. Please ensure MySQL is running in XAMPP.', 500);
        }
    }

    /**
     * Check database connectivity for the health check endpoint.
     *
     * @return array{connected: bool, database: string, latency_ms?: float, error?: string}
     */
    public function ping(): array
    {
        $start = microtime(true);
        try {
            $conn = $this->getConnection();
            $latency = round((microtime(true) - $start) * 1000, 2);
            $dbName = Env::get('DB_DATABASE', 'shopco_dev');

            return [
                'connected' => true,
                'database' => $dbName,
                'latency_ms' => $latency,
            ];
        } catch (Throwable $e) {
            return [
                'connected' => false,
                'database' => Env::get('DB_DATABASE', 'shopco_dev'),
                'error' => 'Database unreachable (check XAMPP MySQL service)',
            ];
        }
    }

    /**
     * Execute a prepared statement with parameterized bindings.
     *
     * Example:
     *   $db->execute("UPDATE products SET stock = ? WHERE id = ?", "is", [15, "prod-123"]);
     *
     * @param string $sql SQL query with ? placeholders
     * @param string $types Type string e.g. "s" (string), "i" (int), "d" (double), "b" (blob)
     * @param array<int, mixed> $params Array of parameters matching types
     */
    public function execute(string $sql, string $types = '', array $params = []): mysqli_stmt
    {
        $conn = $this->getConnection();
        $stmt = $conn->prepare($sql);

        if (!$stmt) {
            error_log(sprintf('[DB Prepare Failed] Query: %s Error: %s', $sql, $conn->error));
            throw new RuntimeException('Failed to prepare database statement.', 500);
        }

        if ($types !== '' && !empty($params)) {
            $stmt->bind_param($types, ...$params);
        }

        $stmt->execute();
        return $stmt;
    }

    /**
     * Execute an UPDATE/DELETE/INSERT statement and return number of affected rows.
     */
    public function executeUpdate(string $sql, string $types = '', array $params = []): int
    {
        $stmt = $this->execute($sql, $types, $params);
        $affected = $stmt->affected_rows;
        $stmt->close();
        return $affected;
    }

    /**
     * Fetch all rows from a parameterized query.
     *
     * @return array<int, array<string, mixed>>
     */
    public function fetchAll(string $sql, string $types = '', array $params = []): array
    {
        $stmt = $this->execute($sql, $types, $params);
        $result = $stmt->get_result();

        if ($result === false) {
            $stmt->close();
            return [];
        }

        $rows = $result->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /**
     * Fetch a single row from a parameterized query.
     *
     * @return array<string, mixed>|null
     */
    public function fetchOne(string $sql, string $types = '', array $params = []): ?array
    {
        $stmt = $this->execute($sql, $types, $params);
        $result = $stmt->get_result();

        if ($result === false) {
            $stmt->close();
            return null;
        }

        $row = $result->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /**
     * Insert a record and return the generated auto-increment ID.
     */
    public function insert(string $sql, string $types = '', array $params = []): int|string
    {
        $stmt = $this->execute($sql, $types, $params);
        $insertId = $this->getConnection()->insert_id;
        $stmt->close();
        return $insertId;
    }

    /**
     * Execute a callback inside an atomic MySQL transaction with automatic rollback on failure.
     *
     * @template T
     * @param callable(Database): T $callback
     * @return T
     */
    public function transaction(callable $callback): mixed
    {
        $conn = $this->getConnection();
        $conn->begin_transaction();

        try {
            $result = $callback($this);
            $conn->commit();
            return $result;
        } catch (Throwable $e) {
            $conn->rollback();
            error_log(sprintf('[Transaction Rollback] Error: %s', $e->getMessage()));
            throw $e;
        }
    }
}
