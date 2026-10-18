<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Database\Database;

/**
 * Which payment methods customers can choose at checkout.
 *
 * A method is offered only when both switches are on:
 *  - the server allows it (PAYMENT_<NAME>_ENABLED in backend/.env, default on), and
 *  - the admin has not switched it off in Store settings (store_settings payment_<name>_enabled).
 */
final class PaymentMethods
{
    public const ALL = ['monnify', 'kora', 'whatsapp'];

    public static function settingKey(string $method): string
    {
        return "payment_{$method}_enabled";
    }

    public static function serverAllows(string $method): bool
    {
        return in_array($method, self::ALL, true)
            && filter_var(Env::get('PAYMENT_' . strtoupper($method) . '_ENABLED', 'true'), FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * Admin switches, keyed by method (missing setting = on).
     *
     * @return array<string, bool>
     */
    public static function adminSwitches(?Database $db = null): array
    {
        $db = $db ?? Database::getInstance();
        $rows = $db->fetchAll(
            "SELECT `key_name`, `value` FROM `store_settings`
             WHERE `key_name` IN ('payment_monnify_enabled', 'payment_kora_enabled', 'payment_whatsapp_enabled')"
        );
        $stored = array_column($rows, 'value', 'key_name');

        $switches = [];
        foreach (self::ALL as $method) {
            $switches[$method] = ($stored[self::settingKey($method)] ?? '1') !== '0';
        }
        return $switches;
    }

    public static function isEnabled(string $method, ?Database $db = null): bool
    {
        return self::serverAllows($method) && (self::adminSwitches($db)[$method] ?? false);
    }

    /**
     * Status of every method for the admin screen.
     *
     * @return array<string, array{enabled: bool, admin_on: bool, server_allows: bool}>
     */
    public static function status(?Database $db = null): array
    {
        $switches = self::adminSwitches($db);
        $status = [];
        foreach (self::ALL as $method) {
            $server = self::serverAllows($method);
            $status[$method] = [
                'enabled' => $server && $switches[$method],
                'admin_on' => $switches[$method],
                'server_allows' => $server,
            ];
        }
        return $status;
    }
}
