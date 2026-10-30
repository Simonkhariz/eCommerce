<?php

declare(strict_types=1);

/**
 * Back up the database and the uploaded pictures into one dated folder:
 *
 *   <BACKUP_DIR>/<YYYY-mm-dd_His>/database.sql.gz   (mysqldump, one consistent snapshot)
 *   <BACKUP_DIR>/<YYYY-mm-dd_His>/uploads.tar.gz    (everything in the uploads folder)
 *   <BACKUP_DIR>/<YYYY-mm-dd_His>/manifest.json     (sizes and SHA-256 of both files)
 *
 * BACKUP_DIR defaults to backend/storage/backups. Old backups are never deleted by this script:
 * copy them off the server (another machine, or a separate MinIO/S3 bucket) and remove old ones
 * there. mysqldump is found on PATH, in XAMPP's folder, or at MYSQLDUMP_PATH. The database
 * password is passed in the environment, never on the command line.
 *
 * Usage:
 *   php backend/scripts/backup.php
 *   cron (daily 02:30):  30 2 * * *  php /var/www/shopco/backend/scripts/backup.php
 *
 * Restore (see docs/BACKUPS.md): gunzip < database.sql.gz | mysql <database>, then unpack
 * uploads.tar.gz into the uploads folder.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Storage\LocalStorage;
use App\Storage\Storage;

Env::load(BASE_PATH . '/.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Africa/Lagos') ?: 'Africa/Lagos');

$fail = static function (string $message): never {
    fwrite(STDERR, "[backup] {$message}\n");
    exit(1);
};
// Some hosts build PHP without these; fail before creating anything, with the reason.
if (!function_exists('gzopen')) {
    $fail('PHP\'s zlib extension is not enabled; it is needed to compress the backup.');
}
if (Storage::uploads() instanceof LocalStorage && !class_exists('PharData')) {
    $fail('PHP\'s phar extension is not enabled; it is needed to archive the pictures.');
}

$root = rtrim((string) (Env::get('BACKUP_DIR', '') ?: BASE_PATH . '/storage/backups'), '/\\');
$target = $root . '/' . date('Y-m-d_His');
if (!@mkdir($target, 0750, true) && !is_dir($target)) {
    $fail("Cannot create {$target}.");
}

// 1. Database -----------------------------------------------------------------------------
$mysqldump = (string) Env::get('MYSQLDUMP_PATH', '');
if ($mysqldump === '') {
    $mysqldump = PHP_OS_FAMILY === 'Windows' && is_file('C:/xampp/mysql/bin/mysqldump.exe') ? 'C:/xampp/mysql/bin/mysqldump.exe' : 'mysqldump';
}
$database = (string) Env::get('DB_DATABASE', '');
if ($database === '') {
    $fail('DB_DATABASE is not set.');
}
$command = [
    $mysqldump,
    '--host=' . Env::get('DB_HOST', '127.0.0.1'),
    '--port=' . Env::int('DB_PORT', 3306),
    '--user=' . Env::get('DB_USERNAME', 'root'),
    '--single-transaction',      // one consistent snapshot without locking the shop
    '--quick',
    '--routines',
    '--triggers',
    '--default-character-set=utf8mb4',
    $database,
];
$env = array_merge(getenv(), ['MYSQL_PWD' => (string) Env::get('DB_PASSWORD', '')]);
$process = @proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, BASE_PATH, $env);
if (!is_resource($process)) {
    $fail("Could not start mysqldump ({$mysqldump}). Set MYSQLDUMP_PATH.");
}
$dbFile = "{$target}/database.sql.gz";
$gz = gzopen($dbFile, 'wb6');
$dumped = 0;
while (!feof($pipes[1])) {
    $chunk = fread($pipes[1], 1 << 20);
    if ($chunk === false) {
        break;
    }
    $dumped += strlen($chunk);
    gzwrite($gz, $chunk);
}
gzclose($gz);
$errors = trim((string) stream_get_contents($pipes[2]));
fclose($pipes[1]);
fclose($pipes[2]);
$code = proc_close($process);
if ($code !== 0 || $dumped === 0) {
    @unlink($dbFile);
    $fail("mysqldump failed (exit {$code}): " . mb_substr($errors, 0, 300));
}

// 2. Uploaded pictures ----------------------------------------------------------------------
// On the server's disk they are archived here; in an S3-compatible bucket they are backed up
// with the bucket's own tools (versioning, replication or a mirror to a second bucket).
$storage = Storage::uploads();
$uploads = $storage instanceof LocalStorage ? $storage->root() : null;
$uploadsFile = "{$target}/uploads.tar.gz";
$files = 0;
if ($uploads !== null && is_dir($uploads)) {
    $tarPath = "{$target}/uploads.tar";
    try {
        $tar = new PharData($tarPath);
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploads, FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            /** @var SplFileInfo $file */
            if ($file->isFile()) {
                $tar->addFile($file->getPathname(), str_replace('\\', '/', substr($file->getPathname(), strlen($uploads) + 1)));
                $files++;
            }
        }
        if ($files > 0) {
            $tar->compress(Phar::GZ);
        }
        unset($tar);
        Phar::unlinkArchive($tarPath);
    } catch (Throwable $e) {
        $fail('Could not archive the uploads folder: ' . $e->getMessage());
    }
}

// 3. Manifest -------------------------------------------------------------------------------
$entry = static fn (string $path): ?array => is_file($path)
    ? ['file' => basename($path), 'bytes' => filesize($path), 'sha256' => hash_file('sha256', $path)]
    : null;
$manifest = [
    'created_at' => date('c'),
    'database' => $database,
    'database_dump' => $entry($dbFile),
    'uploads_archive' => $entry($uploadsFile),
    'upload_files' => $files,
    'uploads_storage' => $storage->name(),
];
file_put_contents("{$target}/manifest.json", json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

printf(
    "[%s] backup written to %s: database %.1f KB, %d picture files (%.1f KB)\n",
    date('Y-m-d H:i:s'),
    $target,
    filesize($dbFile) / 1024,
    $files,
    is_file($uploadsFile) ? filesize($uploadsFile) / 1024 : 0
);
if ($uploads === null) {
    printf("[backup] pictures are in %s storage: back them up with the bucket's own tools (not included here)\n", $storage->name());
}
