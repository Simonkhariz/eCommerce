<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database\Database;
use App\Middleware\JsonBodyMiddleware;
use App\Support\Response;

/**
 * Controller for administrative configuration of delivery destination zones and shipping fees.
 */
class AdminZoneController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * List all destination shipping zones and fee rates.
     */
    public function index(): void
    {
        $zones = $this->db->fetchAll("SELECT * FROM `shipping_zones` ORDER BY `id` ASC");

        foreach ($zones as &$zone) {
            if (is_string($zone['states_covered'])) {
                $zone['states_covered'] = json_decode($zone['states_covered'], true) ?: [];
            }
            $zone['fee'] = (float) $zone['fee'];
            $zone['is_active'] = (bool) $zone['is_active'];
        }

        Response::success($zones, 'Shipping destination zones retrieved.');
    }

    /**
     * Retrieve single destination zone.
     */
    public function show(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $zone = $this->db->fetchOne("SELECT * FROM `shipping_zones` WHERE `id` = ?", 'i', [$id]);

        if ($zone === null) {
            Response::error('Shipping zone not found.', 404, 'ZONE_NOT_FOUND');
        }

        if (is_string($zone['states_covered'])) {
            $zone['states_covered'] = json_decode($zone['states_covered'], true) ?: [];
        }
        $zone['fee'] = (float) $zone['fee'];
        $zone['is_active'] = (bool) $zone['is_active'];

        Response::success($zone, 'Shipping zone retrieved.');
    }

    /**
     * Create a new destination shipping zone and fee.
     */
    public function create(): void
    {
        $body = JsonBodyMiddleware::getBody();

        $name = trim($body['name'] ?? '');
        $code = trim(strtoupper($body['code'] ?? ''));
        $description = trim($body['description'] ?? '');
        $fee = (float) ($body['fee'] ?? 0.0);
        $estimatedDays = trim($body['estimated_days'] ?? '2-4 business days');
        $statesCovered = $body['states_covered'] ?? ['*'];
        $isActive = isset($body['is_active']) ? ((bool) $body['is_active'] ? 1 : 0) : 1;

        if ($name === '' || $code === '') {
            Response::error('Zone name and unique code are required.', 422, 'VALIDATION_ERROR', [
                'name' => empty($name) ? 'Name is required' : null,
                'code' => empty($code) ? 'Code is required' : null,
            ]);
        }

        $existing = $this->db->fetchOne("SELECT id FROM `shipping_zones` WHERE `code` = ?", 's', [$code]);
        if ($existing !== null) {
            Response::error('A shipping zone with this code already exists.', 409, 'DUPLICATE_ZONE_CODE');
        }

        $statesJson = is_array($statesCovered) ? json_encode($statesCovered) : '["*"]';

        $id = (int) $this->db->insert(
            "INSERT INTO `shipping_zones` (`name`, `code`, `description`, `states_covered`, `fee`, `estimated_days`, `is_active`)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            'ssssdsi',
            [$name, $code, $description, $statesJson, $fee, $estimatedDays, $isActive]
        );

        $created = $this->db->fetchOne("SELECT * FROM `shipping_zones` WHERE `id` = ?", 'i', [$id]);
        $created['states_covered'] = json_decode($created['states_covered'], true) ?: [];
        $created['fee'] = (float) $created['fee'];
        $created['is_active'] = (bool) $created['is_active'];

        Response::success($created, 'Destination shipping zone created.', 201);
    }

    /**
     * Update an existing destination zone and fee.
     */
    public function update(array $params): void
    {
        $id = (int) ($params['id'] ?? 0);
        $existing = $this->db->fetchOne("SELECT id FROM `shipping_zones` WHERE `id` = ?", 'i', [$id]);
        if ($existing === null) {
            Response::error('Shipping zone not found.', 404, 'ZONE_NOT_FOUND');
        }

        $body = JsonBodyMiddleware::getBody();

        $fields = [];
        $types = '';
        $values = [];

        if (array_key_exists('name', $body)) {
            $fields[] = "`name` = ?";
            $types .= 's';
            $values[] = trim($body['name']);
        }
        if (array_key_exists('description', $body)) {
            $fields[] = "`description` = ?";
            $types .= 's';
            $values[] = trim($body['description']);
        }
        if (array_key_exists('fee', $body)) {
            $fields[] = "`fee` = ?";
            $types .= 'd';
            $values[] = (float) $body['fee'];
        }
        if (array_key_exists('estimated_days', $body)) {
            $fields[] = "`estimated_days` = ?";
            $types .= 's';
            $values[] = trim($body['estimated_days']);
        }
        if (array_key_exists('states_covered', $body)) {
            $fields[] = "`states_covered` = ?";
            $types .= 's';
            $values[] = json_encode($body['states_covered']);
        }
        if (array_key_exists('is_active', $body)) {
            $fields[] = "`is_active` = ?";
            $types .= 'i';
            $values[] = $body['is_active'] ? 1 : 0;
        }

        if (!empty($fields)) {
            $sql = "UPDATE `shipping_zones` SET " . implode(', ', $fields) . " WHERE `id` = ?";
            $types .= 'i';
            $values[] = $id;
            $this->db->execute($sql, $types, $values);
        }

        $updated = $this->db->fetchOne("SELECT * FROM `shipping_zones` WHERE `id` = ?", 'i', [$id]);
        $updated['states_covered'] = json_decode($updated['states_covered'], true) ?: [];
        $updated['fee'] = (float) $updated['fee'];
        $updated['is_active'] = (bool) $updated['is_active'];

        Response::success($updated, 'Shipping destination zone updated.');
    }
}
