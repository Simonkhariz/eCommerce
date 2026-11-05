<?php

declare(strict_types=1);

/**
 * The home page's product rows: the Featured row is what the admin ticks, a product appears only
 * once on the page, and Top Selling only lists what has really sold.
 *
 *   php backend/tests/run.php HomepageRows
 */

require __DIR__ . '/support/TestKit.php';

$t = new TestKit('HomepageRows');

// Start every product from a known state, and put the seed's values back afterwards.
$original = $t->db->fetchAll('SELECT `id`, `is_featured`, `is_flash_deal`, `flash_deal_ends_at`, `units_sold`, `status` FROM `products`');
$t->cleanup(function () use ($t, $original): void {
    foreach ($original as $row) {
        $t->sql(
            'UPDATE `products` SET `is_featured` = ?, `is_flash_deal` = ?, `flash_deal_ends_at` = ?, `units_sold` = ?, `status` = ? WHERE `id` = ?',
            'iisisi',
            [(int) $row['is_featured'], (int) $row['is_flash_deal'], $row['flash_deal_ends_at'], (int) $row['units_sold'], $row['status'], (int) $row['id']]
        );
    }
});
$t->sql("UPDATE `products` SET `is_featured` = 0, `is_flash_deal` = 0, `flash_deal_ends_at` = NULL, `units_sold` = 0, `status` = 'published'");

$ids = array_map('intval', array_column($t->db->fetchAll("SELECT `id` FROM `products` WHERE `product_type` = 'physical' ORDER BY `created_at` DESC, `id` DESC"), 'id'));
$t->ok('the sample catalogue has enough products for this', count($ids) >= 16, (string) count($ids));
$home = static function () use ($t): array {
    $res = $t->http('GET', '/storefront/homepage');
    return (array) TestKit::get($res, 'data');
};
$rowIds = static fn (array $data, string $row): array => array_map('intval', array_column((array) ($data[$row] ?? []), 'id'));
$feature = static fn (array $list) => $t->sql('UPDATE `products` SET `is_featured` = 1 WHERE `id` IN (' . implode(',', array_map('intval', $list)) . ')');
$rows = ['flash_deals', 'featured_products', 'new_arrivals', 'top_selling'];
$noRepeats = static function (array $data) use ($rows, $rowIds): bool {
    $all = [];
    foreach ($rows as $row) {
        $all = array_merge($all, $rowIds($data, $row));
    }
    return count($all) === count(array_unique($all));
};

// -----------------------------------------------------------------------------
$t->section('A new shop: no made-up rows');
$data = $home();
$t->check('nothing ticked: no Featured row', [], $rowIds($data, 'featured_products'));
$t->check('nothing sold: no Top Selling row', [], $rowIds($data, 'top_selling'));
$t->check('New Arrivals still shows the newest 4', array_slice($ids, 0, 4), $rowIds($data, 'new_arrivals'));

// -----------------------------------------------------------------------------
$t->section('The admin decides what is featured');
$admin = $t->adminSession('homepage');
$picked = [$ids[10], $ids[12]];
$feature($picked);
$data = $home();
$t->check('ticked products appear in the Featured row', [$ids[10], $ids[12]], $rowIds($data, 'featured_products'));
$t->ok('whether or not they are new', !array_intersect($picked, array_slice($ids, 0, 4)));

$adminList = (array) TestKit::get($t->http('GET', '/admin/products?per_page=100', ['jar' => $admin['jar']]), 'data');
$ticks = array_column($adminList, 'is_featured', 'id');
$t->check('the admin sees the tick in the product list', [true, false], [(bool) ($ticks[$ids[10]] ?? false), (bool) ($ticks[$ids[11]] ?? true)]);
$t->sql('UPDATE `products` SET `is_featured` = 0 WHERE `id` = ?', 'i', [$ids[12]]);
$t->check('unticking removes it', [$ids[10]], $rowIds($home(), 'featured_products'));

$t->sql("UPDATE `products` SET `status` = 'draft' WHERE `id` = ?", 'i', [$ids[10]]);
$t->check('a draft never shows, even when ticked', [], $rowIds($home(), 'featured_products'));
$t->sql("UPDATE `products` SET `status` = 'published' WHERE `id` = ?", 'i', [$ids[10]]);

$feature(array_slice($ids, 0, 12));
$data = $home();
$t->check('at most 4 show, newest first', array_slice($ids, 0, 4), $rowIds($data, 'featured_products'));
$listed = $t->http('GET', '/products?is_featured=1&per_page=50');
$t->check('"View all" lists every ticked product', 12, count((array) (TestKit::get($listed, 'data.items') ?? TestKit::get($listed, 'data'))));
$t->sql('UPDATE `products` SET `is_featured` = 0');

// -----------------------------------------------------------------------------
$t->section('A product appears only once on the page');
$t->sql('UPDATE `products` SET `is_flash_deal` = 1 WHERE `id` = ?', 'i', [$ids[0]]);
$feature([$ids[0], $ids[1]]);
$t->sql('UPDATE `products` SET `units_sold` = 50 WHERE `id` IN (?, ?, ?, ?)', 'iiii', [$ids[0], $ids[1], $ids[2], $ids[9]]);
$data = $home();
$t->check('flash deals come first', [$ids[0]], $rowIds($data, 'flash_deals'));
$t->check('Featured skips what flash deals show', [$ids[1]], $rowIds($data, 'featured_products'));
$t->check('New Arrivals skips what is above it', [$ids[2], $ids[3], $ids[4], $ids[5]], $rowIds($data, 'new_arrivals'));
$t->check('Top Selling shows the seller not shown yet', [$ids[9]], $rowIds($data, 'top_selling'));
$t->ok('no product is in two rows', $noRepeats($data));

$t->sql("UPDATE `products` SET `is_flash_deal` = 1, `flash_deal_ends_at` = '2020-01-01 00:00:00' WHERE `id` = ?", 'i', [$ids[0]]);
$data = $home();
$t->check('a finished deal goes back to the other rows', true, in_array($ids[0], $rowIds($data, 'featured_products'), true));

// -----------------------------------------------------------------------------
$t->section('Every row stops at 4 products');
$t->sql('UPDATE `products` SET `is_featured` = 1, `is_flash_deal` = 1, `flash_deal_ends_at` = NULL, `units_sold` = 5');
$data = $home();
$t->check('flash deals', 4, count($rowIds($data, 'flash_deals')));
$t->check('featured, when more are left', 4, count($rowIds($data, 'featured_products')));
$t->check('new arrivals', 4, count($rowIds($data, 'new_arrivals')));
$t->ok('top selling, however many have sold', count($rowIds($data, 'top_selling')) <= 4 && count($rowIds($data, 'top_selling')) > 0, (string) count($rowIds($data, 'top_selling')));
$t->ok('and still no repeats', $noRepeats($data));

// -----------------------------------------------------------------------------
$t->section('Top Selling is real');
$t->sql('UPDATE `products` SET `is_featured` = 0, `is_flash_deal` = 0, `flash_deal_ends_at` = NULL, `units_sold` = 0');
$t->sql('UPDATE `products` SET `units_sold` = ? WHERE `id` = ?', 'ii', [5, $ids[13]]);
$t->sql('UPDATE `products` SET `units_sold` = ? WHERE `id` = ?', 'ii', [9, $ids[14]]);
$t->sql('UPDATE `products` SET `units_sold` = ? WHERE `id` = ?', 'ii', [7, $ids[15]]);
$t->check('ranked by units sold', [$ids[14], $ids[15], $ids[13]], $rowIds($home(), 'top_selling'));
$t->check('and products with no sales never fill it', 3, count($rowIds($home(), 'top_selling')));

exit($t->finish());
