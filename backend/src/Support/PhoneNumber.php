<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Phone numbers in the international format WhatsApp needs (wa.me links).
 */
final class PhoneNumber
{
    /**
     * Normalise a number typed in Nigerian local format to "+234...".
     *   0803 123 4567     -> +2348031234567
     *   803 123 4567      -> +2348031234567
     *   +234 0803 123 4567 -> +2348031234567
     *   +44 20 7946 0958  -> +442079460958 (other countries are kept as typed)
     * Returns null when the input cannot be a phone number.
     */
    public static function toInternational(string $raw): ?string
    {
        $raw = trim($raw);
        if ($raw === '' || !preg_match('/^\+?[0-9 ()-]{7,24}$/', $raw)) {
            return null;
        }

        $digits = preg_replace('/\D/', '', $raw) ?? '';
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }

        if (strlen($digits) === 11 && $digits[0] === '0') {
            $digits = '234' . substr($digits, 1);
        } elseif (strlen($digits) === 10 && in_array($digits[0], ['7', '8', '9'], true)) {
            $digits = '234' . $digits;
        } elseif (strlen($digits) === 14 && str_starts_with($digits, '2340')) {
            $digits = '234' . substr($digits, 4);
        }

        if (str_starts_with($digits, '234') && strlen($digits) !== 13) {
            return null;
        }
        if (strlen($digits) < 8 || strlen($digits) > 15) {
            return null;
        }

        return '+' . $digits;
    }
}
