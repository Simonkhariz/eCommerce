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
    private static ?string $testDir = null;
    private static ?int $testTtl = null;
    private static ?int $testMaxEntries = null;

    public static function ttl(): int
    {
        if (self::$testTtl !== null) {
            return self::$testTtl;
        }
        if (Env::get('APP_ENV', 'production') === 'testing') {
            return 0;
        }
        return max(0, Env::int('CATALOG_CACHE_SECONDS', 60));
    }

    /**
     * Tests only (CacheTest): a private folder and a fixed lifetime, so the cache itself can be
     * tested without touching storage/cache. $maxEntries also prunes after every write.
     * Passing nulls restores the normal behaviour.
     */
    public static function configureForTests(?string $dir, ?int $ttl, ?int $maxEntries = null): void
    {
        self::$testDir = $dir;
        self::$testTtl = $ttl;
        self::$testMaxEntries = $maxEntries;
        self::$version = null;
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
        if (self::$testMaxEntries !== null || random_int(1, self::PRUNE_EVERY) === 1) {
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
        $dir = self::$testDir ?? BASE_PATH . '/storage/cache';
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

    /**
     * Remove entries from old catalogue versions and stale temporary files, then the oldest
     * entries beyond MAX_ENTRIES, so the folder stays bounded however many different requests
     * arrive (cache files only; they are rebuilt from the database when needed).
     */
    private static function prune(): void
    {
        $cutoff = time() - max(3600, self::ttl() * 10);
        $files = array_merge(glob(self::dir() . '/*.cache') ?: [], glob(self::dir() . '/*.tmp') ?: []);
        $kept = [];
        foreach ($files as $file) {
            $mtime = @filemtime($file);
            if ($mtime === false) {
                continue;
            }
            if ($mtime < $cutoff) {
                @unlink($file);
            } else {
                $kept[$file] = $mtime;
            }
        }
        $max = self::$testMaxEntries ?? self::MAX_ENTRIES;
        if (count($kept) > $max) {
            asort($kept);
            foreach (array_slice(array_keys($kept), 0, count($kept) - $max) as $file) {
                @unlink($file);
            }
        }
    }

    /**
     * Most entries kept. Entries are 8-30 KB (about 65 MB for 5,000); the 4,000-product load
     * test used 822.
     */
    public const MAX_ENTRIES = 5000;
    /** One prune every this many writes. */
    private const PRUNE_EVERY = 200;
}
