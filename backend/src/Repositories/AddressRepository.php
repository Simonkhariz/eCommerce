<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Database;

/**
 * Repository for customer delivery address book management.
 * Strictly scopes all address operations to the authenticated user ID.
 */
class AddressRepository
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * Get all addresses for a specific customer.
     */
    public function getByUserId(int $userId): array
    {
        $sql = "SELECT id, user_id, label, recipient_name, phone, street_address, city, state, country, postal_code, is_default, created_at, updated_at
                FROM `addresses`
                WHERE `user_id` = ?
                ORDER BY `is_default` DESC, `id` DESC";

        return $this->db->fetchAll($sql, 'i', [$userId]);
    }

    /**
     * Find single address ensuring ownership.
     */
    public function findByIdAndUser(int $id, int $userId): ?array
    {
        $sql = "SELECT id, user_id, label, recipient_name, phone, street_address, city, state, country, postal_code, is_default, created_at, updated_at
                FROM `addresses`
                WHERE `id` = ? AND `user_id` = ?
                LIMIT 1";

        return $this->db->fetchOne($sql, 'ii', [$id, $userId]);
    }

    /**
     * Create a new address for the customer.
     */
    public function create(int $userId, array $data): int
    {
        $isDefault = !empty($data['is_default']) ? 1 : 0;

        // If this is the user's first address, make it default automatically
        $existingCount = $this->db->fetchOne("SELECT COUNT(*) AS c FROM `addresses` WHERE `user_id` = ?", 'i', [$userId]);
        if ($existingCount !== null && (int) $existingCount['c'] === 0) {
            $isDefault = 1;
        }

        if ($isDefault === 1) {
            $this->db->execute("UPDATE `addresses` SET `is_default` = 0 WHERE `user_id` = ?", 'i', [$userId]);
        }

        $label = trim($data['label'] ?? 'Home');
        $recipientName = trim($data['recipient_name']);
        $phone = trim($data['phone']);
        $streetAddress = trim($data['street_address']);
        $city = trim($data['city']);
        $state = trim($data['state']);
        $country = trim($data['country'] ?? 'Nigeria');
        $postalCode = isset($data['postal_code']) ? trim($data['postal_code']) : null;

        $sql = "INSERT INTO `addresses` (`user_id`, `label`, `recipient_name`, `phone`, `street_address`, `city`, `state`, `country`, `postal_code`, `is_default`)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        return (int) $this->db->insert(
            $sql,
            'issssssssi',
            [$userId, $label, $recipientName, $phone, $streetAddress, $city, $state, $country, $postalCode, $isDefault]
        );
    }

    /**
     * Update an existing address ensuring ownership.
     */
    public function update(int $id, int $userId, array $data): bool
    {
        $existing = $this->findByIdAndUser($id, $userId);
        if ($existing === null) {
            return false;
        }

        if (!empty($data['is_default'])) {
            $this->db->execute("UPDATE `addresses` SET `is_default` = 0 WHERE `user_id` = ?", 'i', [$userId]);
        }

        $fields = [];
        $types = '';
        $values = [];

        $map = [
            'label' => 's',
            'recipient_name' => 's',
            'phone' => 's',
            'street_address' => 's',
            'city' => 's',
            'state' => 's',
            'country' => 's',
            'postal_code' => 's',
            'is_default' => 'i',
        ];

        foreach ($map as $col => $t) {
            if (array_key_exists($col, $data)) {
                $fields[] = "`{$col}` = ?";
                $types .= $t;
                $values[] = $t === 'i' ? (!empty($data[$col]) ? 1 : 0) : trim((string) $data[$col]);
            }
        }

        if (empty($fields)) {
            return true;
        }

        $sql = "UPDATE `addresses` SET " . implode(', ', $fields) . " WHERE `id` = ? AND `user_id` = ?";
        $types .= 'ii';
        $values[] = $id;
        $values[] = $userId;

        $this->db->execute($sql, $types, $values);
        return true;
    }

    /**
     * Delete an address ensuring ownership.
     */
    public function delete(int $id, int $userId): bool
    {
        $existing = $this->findByIdAndUser($id, $userId);
        if ($existing === null) {
            return false;
        }

        $this->db->execute("DELETE FROM `addresses` WHERE `id` = ? AND `user_id` = ?", 'ii', [$id, $userId]);

        // If the deleted address was default, set the latest remaining address as default
        if ((int) $existing['is_default'] === 1) {
            $latest = $this->db->fetchOne("SELECT id FROM `addresses` WHERE `user_id` = ? ORDER BY id DESC LIMIT 1", 'i', [$userId]);
            if ($latest !== null) {
                $this->db->execute("UPDATE `addresses` SET `is_default` = 1 WHERE `id` = ?", 'i', [(int) $latest['id']]);
            }
        }

        return true;
    }

    /**
     * Set a specific address as default.
     */
    public function setDefault(int $id, int $userId): bool
    {
        $existing = $this->findByIdAndUser($id, $userId);
        if ($existing === null) {
            return false;
        }

        $this->db->execute("UPDATE `addresses` SET `is_default` = 0 WHERE `user_id` = ?", 'i', [$userId]);
        $this->db->execute("UPDATE `addresses` SET `is_default` = 1 WHERE `id` = ? AND `user_id` = ?", 'ii', [$id, $userId]);
        return true;
    }
}
