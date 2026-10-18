<?php

declare(strict_types=1);

namespace App\Support;

use App\Config\Env;

/**
 * Short-lived cache for public catalogue reads (homepage, filters, categories, listing pages),
 * so a busy shop does not run the same queries for every visitor. Files live in
 * storage/cache; no extra server software is needed.
 *
 * Entries are tied to a "catalogue version" that changes after every admin change
 * (index.php bumps it once an admin write has finished), so edits show up straight away.
 * Stock and sales counts can be up to CATALOG_CACHE_SECONDS old; checkout always re-checks
 * live stock and prices. CATALOG_CACHE_SECONDS=0 (and APP_ENV=testing) turns caching off.
 */
final class Cache
{
    private static ?string $version = null;

    public static function ttl(): int
    {
        if (Env::get('APP_ENV', 'production') === 'testing') {
            return 0;
        }
        return max(0, Env::int('CATALOG_CACHE_SECONDS', 60));
    }

    /**
     * Return the cached value for $key, or compute, store and return it.
     * $ttlFactor keeps data that only admin changes affect (filters, categories) longer.
     *
     * @template T
     * @param callable(): T $compute
     * @return T
     */
    public static function remember(string $key, callable $compute, int $ttlFactor = 1): mixed
    {
        $ttl = self::ttl() * max(1, $ttlFactor);
        if ($ttl === 0) {
            return $compute();
        }

        $file = self::dir() . '/' . sha1(self::version() . '|' . $key) . '.cache';
        $raw = @file_get_contents($file);
        if ($raw !== false) {
            $entry = @unserialize($raw, ['allowed_classes' => false]);
            if (is_array($entry) && ($entry['expires'] ?? 0) > time()) {
                return $entry['value'];
            }
        }

        $value = $compute();
        self::write($file, serialize(['expires' => time() + $ttl, 'value' => $value]));
        if (random_int(1, 200) === 1) {
            self::prune();
        }
        return $value;
    }

    /** Invalidate every catalogue entry (called after admin changes). */
    public static function bumpCatalog(): void
    {
        if (self::ttl() === 0) {
            return;
        }
        self::$version = bin2hex(random_bytes(8));
        self::write(self::dir() . '/catalog.version', self::$version);
    }

    private static function version(): string
    {
        if (self::$version === null) {
            $v = @file_get_contents(self::dir() . '/catalog.version');
            self::$version = is_string($v) && $v !== '' ? trim($v) : '0';
        }
        return self::$version;
    }

    private static function dir(): string
    {
        $dir = BASE_PATH . '/storage/cache';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return $dir;
    }

    /** Write via a temporary file and rename, so readers never see half a file. */
    private static function write(string $file, string $contents): void
    {
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, $contents) === false) {
            return;
        }
        if (!@rename($tmp, $file)) {
            @unlink($tmp);
        }
    }

    /** Remove entries from old catalogue versions and stale temporary files. */
    private static function prune(): void
    {
        $cutoff = time() - max(3600, self::ttl() * 10);
        $files = array_merge(glob(self::dir() . '/*.cache') ?: [], glob(self::dir() . '/*.tmp') ?: []);
        foreach ($files as $file) {
            if (@filemtime($file) < $cutoff) {
                @unlink($file);
            }
        }
    }
}
