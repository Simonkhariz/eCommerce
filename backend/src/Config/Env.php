<?php

declare(strict_types=1);

namespace App\Config;

/**
 * Environment configuration loader and accessor.
 * Reads key-value pairs from .env without external dependencies.
 */
class Env
{
    /** @var array<string, string> */
    private static array $vars = [];

    private static bool $loaded = false;

    /**
     * Load environment variables from a file.
     */
    public static function load(string $filePath): void
    {
        if (self::$loaded && !empty(self::$vars)) {
            return;
        }

        if (!file_exists($filePath) || !is_readable($filePath)) {
            return;
        }

        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);

            // Ignore comments and empty lines
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            // Must contain an equals sign
            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }

            $name = trim(substr($line, 0, $pos));
            $value = trim(substr($line, $pos + 1));

            // Strip enclosing quotes if present
            if (
                (str_starts_with($value, '"') && str_ends_with($value, '"')) ||
                (str_starts_with($value, "'") && str_ends_with($value, "'"))
            ) {
                $value = substr($value, 1, -1);
            }

            self::$vars[$name] = $value;
            $_ENV[$name] = $value;
            putenv("{$name}={$value}");
        }

        self::$loaded = true;
    }

    /**
     * Get a string environment variable with fallback.
     */
    public static function get(string $key, ?string $default = null): ?string
    {
        if (array_key_exists($key, self::$vars)) {
            return self::$vars[$key];
        }

        $envValue = getenv($key);
        if ($envValue !== false) {
            return $envValue;
        }

        return $default;
    }

    /**
     * Get a boolean environment variable.
     */
    public static function bool(string $key, bool $default = false): bool
    {
        $val = self::get($key);
        if ($val === null) {
            return $default;
        }

        $lower = strtolower(trim($val));
        return in_array($lower, ['true', '1', 'yes', 'on'], true);
    }

    /**
     * Get an integer environment variable.
     */
    public static function int(string $key, int $default = 0): int
    {
        $val = self::get($key);
        if ($val === null) {
            return $default;
        }

        return (int) $val;
    }

    /**
     * Return all loaded variables (useful for debugging, without secrets).
     *
     * @return array<string, string>
     */
    public static function all(): array
    {
        return self::$vars;
    }
}
