<?php

declare(strict_types=1);

/**
 * Can this hosting account run Shop.co? Upload this one file to the account's web folder, open it
 * in a browser, read the answer, then DELETE IT. It changes nothing and needs no settings.
 */

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');

$rows = [];
$add = static function (string $what, ?bool $ok, string $detail) use (&$rows): void {
    $rows[] = [$what, $ok, $detail];
};

$add('PHP 8.2 or newer', version_compare(PHP_VERSION, '8.2.0', '>='), PHP_VERSION);
$missing = array_values(array_filter(
    ['mysqli', 'curl', 'mbstring', 'openssl', 'json', 'fileinfo', 'simplexml', 'ctype', 'zlib'],
    static fn (string $e): bool => !extension_loaded($e)
));
$add('PHP extensions', $missing === [], $missing === [] ? 'all present' : 'missing: ' . implode(', ', $missing));

$bytes = static function (string $v): int {
    $n = (int) $v;
    return match (strtolower(substr(trim($v), -1))) { 'g' => $n * 1073741824, 'm' => $n * 1048576, 'k' => $n * 1024, default => $n };
};
$upload = min($bytes((string) ini_get('upload_max_filesize')), $bytes((string) ini_get('post_max_size')));
$add('Picture uploads of 5 MB', $upload >= 5 * 1048576, ini_get('upload_max_filesize') . ' upload, ' . ini_get('post_max_size') . ' form (raise them in cPanel: MultiPHP INI Editor)');
$add('OPcache (speed)', function_exists('opcache_get_status') ? (is_array(@opcache_get_status(false)) ?: null) : null, 'optional; about twice as fast when on');

$outbound = static function (string $url): array {
    if (!function_exists('curl_init')) {
        return [false, 'curl is missing'];
    }
    $c = curl_init($url);
    curl_setopt_array($c, [CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 6]);
    curl_exec($c);
    $code = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    $error = curl_error($c);
    curl_close($c);
    return [$code > 0, $code > 0 ? 'reached' : ('blocked: ' . $error)];
};
foreach (['Cloudflare R2 (pictures)' => 'https://r2.cloudflarestorage.com', 'Resend (email)' => 'https://api.resend.com', 'Kora (payments)' => 'https://api.korapay.com', 'Monnify (payments)' => 'https://api.monnify.com'] as $name => $url) {
    [$ok, $detail] = $outbound($url);
    $add("This host can reach {$name}", $ok, $detail);
}

$disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
$add('Backups with mysqldump', function_exists('proc_open') && !in_array('proc_open', $disabled, true) ? true : null, 'optional; the shop writes the backup itself if not');

$jsCheck = isset($_SERVER['HTTP_COOKIE']) && str_contains((string) $_SERVER['HTTP_COOKIE'], '__test=');
$add('No browser check in front of the site', $jsCheck ? false : null, $jsCheck ? 'a __test cookie suggests one: webhooks and the storefront would be refused' : 'not seen; test it from a server too: curl -i <this page>');

?><!doctype html>
<title>Can this host run Shop.co?</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font:15px system-ui;max-width:760px;margin:24px auto;padding:0 16px">
<h1 style="font-size:20px">Can this host run Shop.co?</h1>
<table style="border-collapse:collapse;width:100%">
<?php foreach ($rows as [$what, $ok, $detail]): ?>
<tr style="border-top:1px solid #ddd">
<td style="padding:6px 8px 6px 0"><?= $ok === null ? 'Check' : ($ok ? 'OK' : '<b style="color:#b00">NO</b>') ?></td>
<td style="padding:6px 8px"><?= htmlspecialchars($what) ?></td>
<td style="padding:6px 0;color:#555"><?= htmlspecialchars($detail) ?></td>
</tr>
<?php endforeach; ?>
</table>
<p>Also look in cPanel for: <b>Setup Node.js App</b> offering Node.js 20.9 or newer, <b>Cron Jobs</b>, <b>MySQL Databases</b>, and <b>Domains</b> or <b>Subdomains</b> (two addresses are needed).</p>
<p><b>Delete this file now.</b></p>
</body>
