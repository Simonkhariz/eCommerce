<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Standardized JSON response helper for the REST API.
 * Ensures consistent output schemas and prevents credential/stack trace leaks.
 */
class Response
{
    /**
     * Send a standardized success JSON response.
     *
     * @param mixed $data Primary payload (object, list, or scalar)
     * @param string $message Friendly status description
     * @param int $status HTTP status code (default: 200 OK)
     * @param array<string, mixed> $meta Optional metadata (pagination, counts, execution timestamp)
     */
    public static function success(
        mixed $data = null,
        string $message = 'Operation completed successfully.',
        int $status = 200,
        array $meta = []
    ): void {
        $payload = [
            'success' => true,
            'message' => $message,
            'data' => $data,
        ];

        if (!empty($meta)) {
            $payload['meta'] = $meta;
        }

        self::json($payload, $status);
    }

    /**
     * Send a standardized paginated collection JSON response.
     */
    public static function paginated(
        array $items,
        int $total,
        int $page,
        int $perPage,
        string $message = 'List retrieved successfully.'
    ): void {
        $totalPages = (int) ceil($total / max(1, $perPage));
        $meta = [
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => $totalPages,
        ];

        self::success([
            'items' => $items,
            'pagination' => $meta,
        ], $message, 200, $meta);
    }

    /**
     * Send a standardized error JSON response.
     *
     * @param string $message User-safe error description
     * @param int $status HTTP status code (400, 401, 403, 404, 422, 500)
     * @param string $errorCode Machine-readable uppercase error token (e.g. 'VALIDATION_ERROR')
     * @param array<string, mixed> $details Field-level validation issues or safe metadata
     */
    public static function error(
        string $message = 'An unexpected error occurred.',
        int $status = 400,
        string $errorCode = 'BAD_REQUEST',
        array $details = []
    ): void {
        $errorPayload = [
            'code' => $errorCode,
            'message' => $message,
        ];

        if (!empty($details)) {
            $errorPayload['details'] = $details;
        }

        $payload = [
            'success' => false,
            'error' => $errorPayload,
        ];

        self::json($payload, $status);
    }

    /**
     * Output raw JSON with standard HTTP headers and terminate script execution.
     *
     * @param mixed $payload Array or object to encode as JSON
     * @param int $status HTTP status code
     * @param array<string, string> $headers Additional custom HTTP headers
     */
    public static function json(mixed $payload, int $status = 200, array $headers = []): void
    {
        // Discard any buffered stray echo output before emitting clean JSON
        if (ob_get_length()) {
            ob_clean();
        }

        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('X-Frame-Options: DENY');

            foreach ($headers as $key => $value) {
                header("{$key}: {$value}");
            }
        }

        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        if ($json === false) {
            http_response_code(500);
            echo '{"success":false,"error":{"code":"JSON_ENCODE_ERROR","message":"Failed to serialize response payload."}}';
            exit;
        }

        echo $json;
        if (self::$exitOnResponse) {
            exit;
        }
    }

    public static bool $exitOnResponse = true;
}
