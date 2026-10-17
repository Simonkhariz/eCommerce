<?php

declare(strict_types=1);

namespace App\Validators;

class CategoryValidator
{
    /**
     * Validate category input data.
     *
     * @param array<string, mixed> $data
     * @return array<string, string>
     */
    public static function validate(array $data, bool $isUpdate = false): array
    {
        $errors = [];

        if (!$isUpdate || array_key_exists('name', $data)) {
            $name = trim((string) ($data['name'] ?? ''));
            if ($name === '' || strlen($name) < 2) {
                $errors['name'] = 'Category name is required (min 2 characters).';
            }
        }

        if (!$isUpdate || array_key_exists('slug', $data)) {
            $slug = trim((string) ($data['slug'] ?? ''));
            if ($slug === '' || !preg_match('/^[a-z0-9\-]+$/', $slug)) {
                $errors['slug'] = 'Valid lowercase URL slug is required.';
            }
        }

        return $errors;
    }
}
