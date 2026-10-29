<?php

declare(strict_types=1);

namespace App\Support;

use App\Config\Env;
use App\Database\Database;

/**
 * The uploads folder, and the picture files in it that nothing uses any more: replaced product
 * photos, banners that were changed, uploads from forms that were never saved. Unused files are
 * only ever listed for the admin to review in Data & storage and removed when the admin confirms
 * the clean-up (with password and emailed code, like every other clean-up); never automatically.
 *
 * UPLOAD_DIR overrides the folder (the test runner points it at a throw-away folder). In testing
 * without it, nothing is listed or removed, so a test can never touch real pictures.
 */
final class UploadFiles
{
    /** Files changed within this time are left alone: an admin may still be filling in a form. */
    private const MIN_AGE_SECONDS = 86400;

    public static function directory(): string
    {
        $override = trim((string) Env::get('UPLOAD_DIR', ''));
        return $override !== '' ? rtrim(str_replace('\\', '/', $override), '/') : BASE_PATH . '/public/uploads';
    }

    /** Listing and removing unused files is off in tests unless they use their own folder. */
    private static function guarded(): bool
    {
        return Env::get('APP_ENV', 'production') === 'testing' && trim((string) Env::get('UPLOAD_DIR', '')) === '';
    }

    /**
     * Paths ("uploads/…") of files older than a day before $asOf that no product, banner,
     * category or store setting refers to, oldest first.
     *
     * @return list<string>
     */
    public static function unused(Database $db, string $asOf): array
    {
        $root = self::directory();
        if (self::guarded() || !is_dir($root)) {
            return [];
        }
        $cutoff = (strtotime($asOf) ?: time()) - self::MIN_AGE_SECONDS;
        $used = self::referenced($db);

        $found = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            /** @var \SplFileInfo $file */
            if (!$file->isFile() || str_starts_with($file->getFilename(), '.')) {
                continue;
            }
            $relative = 'uploads/' . str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));
            if (isset($used['/' . $relative]) || $file->getMTime() > $cutoff) {
                continue;
            }
            $found[$relative] = $file->getMTime();
        }
        asort($found);
        return array_keys($found);
    }

    /**
     * What the admin sees for each file.
     *
     * @param list<string> $paths
     * @return list<array{file: string, size_kb: float, modified: string}>
     */
    public static function describe(array $paths): array
    {
        $out = [];
        foreach ($paths as $path) {
            $full = self::resolve($path);
            if ($full === null) {
                continue;
            }
            $out[] = [
                'file' => '/' . $path,
                'size_kb' => round(filesize($full) / 1024, 1),
                'modified' => date('Y-m-d H:i:s', (int) filemtime($full)),
            ];
        }
        return $out;
    }

    /**
     * Delete the given files (only inside public/uploads). Returns how many were removed.
     *
     * @param list<string> $paths
     */
    public static function delete(array $paths): int
    {
        if (self::guarded()) {
            return 0;
        }
        $removed = 0;
        foreach ($paths as $path) {
            $full = self::resolve($path);
            if ($full !== null && @unlink($full)) {
                $removed++;
            }
        }
        return $removed;
    }

    /** Absolute path for "uploads/…", or null when it is not a file inside the uploads folder. */
    private static function resolve(string $path): ?string
    {
        if (!str_starts_with($path, 'uploads/') || str_contains($path, '..')) {
            return null;
        }
        $root = realpath(self::directory());
        $full = realpath(self::directory() . '/' . substr($path, strlen('uploads/')));
        if ($root === false || $full === false || !is_file($full)) {
            return null;
        }
        $inside = str_starts_with(str_replace('\\', '/', $full), str_replace('\\', '/', $root) . '/');
        return $inside ? $full : null;
    }

    /** @return array<string, true> every "/uploads/…" path the database refers to */
    private static function referenced(Database $db): array
    {
        $values = array_merge(
            array_column($db->fetchAll("SELECT `image_url` AS v FROM `product_images` WHERE `image_url` LIKE '%/uploads/%'"), 'v'),
            array_column($db->fetchAll("SELECT `image_url` AS v FROM `banners` WHERE `image_url` LIKE '%/uploads/%'"), 'v'),
            array_column($db->fetchAll("SELECT `image_url` AS v FROM `categories` WHERE `image_url` LIKE '%/uploads/%'"), 'v'),
            array_column($db->fetchAll("SELECT `value` AS v FROM `store_settings` WHERE `value` LIKE '%/uploads/%'"), 'v'),
        );
        $used = [];
        foreach ($values as $value) {
            if (preg_match_all('#/uploads/[A-Za-z0-9_./-]+#', (string) $value, $m)) {
                foreach ($m[0] as $path) {
                    $used[$path] = true;
                }
            }
        }
        return $used;
    }
}
