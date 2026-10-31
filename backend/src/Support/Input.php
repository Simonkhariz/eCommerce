<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Reading text fields from JSON bodies safely. With strict types, trim() on a number or a list
 * throws a TypeError (a 500 instead of a clear 422), so request values go through here first.
 */
final class Input
{
    /**
     * The value as trimmed text: numbers and booleans become text, null becomes $default, and a
     * list or object becomes '' so the usual "required" validation reports it.
     */
    public static function text(mixed $value, string $default = ''): string
    {
        if ($value === null) {
            return trim($default);
        }
        if (is_string($value)) {
            return trim($value);
        }
        if (is_int($value) || is_float($value)) {
            return trim((string) $value);
        }
        if (is_bool($value)) {
            return $value ? '1' : '';
        }
        return '';
    }
}
