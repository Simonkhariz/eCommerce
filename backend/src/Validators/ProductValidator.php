<?php

declare(strict_types=1);

namespace App\Validators;

class ProductValidator
{
    /**
     * Validate product input data for creation or updates.
     *
     * @param array<string, mixed> $data
     * @return array<string, string> Array of validation error messages keyed by field name
     */
    public static function validate(array $data, bool $isUpdate = false): array
    {
        $errors = [];

        if (!$isUpdate || array_key_exists('name', $data)) {
            $name = trim((string) ($data['name'] ?? ''));
            if ($name === '' || strlen($name) < 3) {
                $errors['name'] = 'Product name is required and must be at least 3 characters.';
            }
        }

        if (!$isUpdate || array_key_exists('slug', $data)) {
            $slug = trim((string) ($data['slug'] ?? ''));
            if ($slug === '' || !preg_match('/^[a-z0-9\-]+$/', $slug)) {
                $errors['slug'] = 'Valid URL slug (lowercase letters, numbers, hyphens) is required.';
            }
        }

        if (!$isUpdate || array_key_exists('base_price', $data)) {
            if (!isset($data['base_price']) || !is_numeric($data['base_price']) || (float) $data['base_price'] <= 0) {
                $errors['base_price'] = 'Base price must be a positive number.';
            }
        }

        if (!$isUpdate || array_key_exists('sku', $data)) {
            $sku = trim((string) ($data['sku'] ?? ''));
            if ($sku === '' || strlen($sku) < 3) {
                $errors['sku'] = 'SKU is required and must be at least 3 characters.';
            }
        }

        if (isset($data['product_type']) && $data['product_type'] !== 'physical') {
            $errors['product_type'] = "Product type must be 'physical'. Digital products are not supported in this store.";
        }

        if (isset($data['status']) && !in_array($data['status'], ['draft', 'published', 'archived'], true)) {
            $errors['status'] = "Status must be 'draft', 'published', or 'archived'.";
        }

        return $errors;
    }

    /**
     * Validate an inventory stock adjustment.
     *
     * @param array<string, mixed> $data
     * @return array<string, string>
     */
    public static function validateInventoryAdjustment(array $data): array
    {
        $errors = [];

        if (empty($data['variant_id']) || !is_numeric($data['variant_id']) || (int) $data['variant_id'] <= 0) {
            $errors['variant_id'] = 'Valid variant ID is required.';
        }

        if (!isset($data['adjustment']) || !is_numeric($data['adjustment']) || (int) $data['adjustment'] === 0) {
            $errors['adjustment'] = 'Adjustment quantity must be a non-zero integer (e.g. +10 or -5).';
        }

        $reason = trim((string) ($data['reason'] ?? ''));
        if ($reason === '') {
            $errors['reason'] = 'Adjustment reason is required (e.g. restock, damage, return, audit_reconciliation).';
        }

        return $errors;
    }

    /**
     * Validate private digital deliverable metadata.
     *
     * @param array<string, mixed> $data
     * @return array<string, string>
     */
    public static function validateDigitalDeliverable(array $data): array
    {
        $errors = [];

        $fileName = trim((string) ($data['file_name'] ?? ''));
        if ($fileName === '' || strlen($fileName) < 3) {
            $errors['file_name'] = 'File name is required (e.g. guide.pdf, presets.zip).';
        }

        if (isset($data['file_size_bytes']) && (!is_numeric($data['file_size_bytes']) || (int) $data['file_size_bytes'] < 0)) {
            $errors['file_size_bytes'] = 'File size in bytes must be a non-negative number.';
        }

        return $errors;
    }
}

