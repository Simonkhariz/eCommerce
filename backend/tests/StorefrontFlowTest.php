<?php

declare(strict_types=1);

/**
 * Storefront API flows: catalogue, cart check, delivery quotes, guest checkout (idempotent,
 * stock reserved once), payment attempts, magic-link account linking, saved cart/wishlist,
 * reviews, homepage stats, flash-deal expiry and the newsletter.
 *
 *   php backend/tests/run.php StorefrontFlow
 */

require __DIR__ . '/support/TestKit.php';

$t = new TestKit('StorefrontFlow');
$admin = $t->adminSession('store');

$v = $t->variant(3);
if ($v === null) {
    $t->ok('a published variant with stock exists (seed data)', false);
    exit($t->finish());
}
$pid = (int) $v['product_id'];
$vid = (int) $v['variant_id'];
$slug = (string) $v['slug'];
$stock = (int) $v['stock_quantity'];
$price = (float) $v['price'];

$ordersCreated = [];
$emails = [];
$t->cleanup(function () use ($t, &$ordersCreated, &$emails): void {
    foreach ($ordersCreated as $num) {
        $t->sql("DELETE FROM `orders` WHERE `order_number` = ?", 's', [$num]);
    }
    foreach ($emails as $email) {
        $t->sql("DELETE FROM `email_outbox` WHERE `recipient_email` = ?", 's', [$email]);
        $t->sql("DELETE FROM `reviews` WHERE `author_email` = ?", 's', [$email]);
        $t->sql("DELETE FROM `newsletter_subscribers` WHERE `email` = ?", 's', [$email]);
        $t->sql("DELETE FROM `users` WHERE `email` = ?", 's', [$email]);
    }
});

$address = static fn (string $name, string $state, string $city) => [
    'full_name' => $name, 'phone' => '08000000003', 'address_line1' => '3 Test Close', 'city' => $city, 'state' => $state, 'country' => 'Nigeria',
];

// -----------------------------------------------------------------------------
$t->section('Catalogue');
$facets = $t->http('GET', '/catalog/facets');
$t->check('facets 200', 200, $facets['status']);
$t->ok('facets list real sizes', (array) TestKit::get($facets, 'data.sizes') !== []);
$t->ok('facets list categories', (array) TestKit::get($facets, 'data.categories') !== []);
$pdp = $t->http('GET', "/products/{$slug}");
$t->check('product detail 200', 200, $pdp['status']);
$t->ok('product detail has variants', (array) TestKit::get($pdp, 'data.variants') !== []);
$t->check('product detail has no reviews before any are approved', [], TestKit::get($pdp, 'data.reviews') ?? []);
$ratingCountBefore = (int) TestKit::get($pdp, 'data.rating_count');
$approved = (int) $t->scalar("SELECT COUNT(*) FROM `reviews` WHERE `product_id` = ? AND `status` = 'approved'", 'i', [$pid]);
$t->check('product rating count matches its approved reviews (no invented ratings)', $approved, $ratingCountBefore);
$t->check('best-selling sort works', 200, $t->http('GET', '/products?sort=best_selling&per_page=3')['status']);
$t->check('flash deals filter works', 200, $t->http('GET', '/products?flash_deals=1')['status']);
$t->check('unknown product 404', 404, $t->http('GET', '/products/no-such-product-' . getmypid())['status']);

// -----------------------------------------------------------------------------
$t->section('Cart check and delivery quotes');
$cc = $t->http('POST', '/checkout/cart-check', ['json' => ['variant_ids' => [$vid]]]);
$t->check('cart-check returns the live price', $price, (float) TestKit::get($cc, 'data.lines.0.unit_price'));
$t->check('cart-check returns live stock', $stock, (int) TestKit::get($cc, 'data.lines.0.stock_quantity'));
$quote = fn (string $state) => $t->http('POST', '/checkout/quote', ['json' => [
    'items' => [['product_id' => $pid, 'variant_id' => $vid, 'quantity' => 1]],
    'shipping_address' => ['state' => $state, 'country' => 'Nigeria'],
]]);
$abujaZone = (string) $t->scalar("SELECT `name` FROM `shipping_zones` WHERE `is_active` = 1 AND (JSON_CONTAINS(`states_covered`, '\"FCT\"') OR JSON_CONTAINS(`states_covered`, '\"Abuja\"')) LIMIT 1");
$t->check('FCT resolves to the Abuja zone, not the nationwide fallback', $abujaZone, TestKit::get($quote('FCT'), 'data.shipping_zone.name'));
$t->check('"Federal Capital Territory" is the same place', $abujaZone, TestKit::get($quote('Federal Capital Territory'), 'data.shipping_zone.name'));
$bad = $quote('Lagoss');
$t->check('misspelt state is refused', false, TestKit::get($bad, 'success'));
$t->check('misspelt state -> 422', 422, $bad['status']);

// -----------------------------------------------------------------------------
$t->section('Guest checkout: idempotent, stock reserved once, payment attempt');
$email = $t->uniq('t-store-guest') . '@example.test';
$emails[] = $email;
$key = 'store' . bin2hex(random_bytes(12));
$orderBody = ['email' => $email, 'items' => [['product_id' => $pid, 'variant_id' => $vid, 'quantity' => 1]], 'shipping_address' => $address('Store Flow', 'FCT', 'Garki')];
$first = $t->http('POST', '/checkout/orders', ['headers' => ["Idempotency-Key: {$key}"], 'json' => $orderBody]);
$t->check('order created 201', 201, $first['status']);
$onum = (string) TestKit::get($first, 'data.order_number');
$ordersCreated[] = $onum;
$second = $t->http('POST', '/checkout/orders', ['headers' => ["Idempotency-Key: {$key}"], 'json' => $orderBody]);
$t->check('double submit returns the same order', $onum, TestKit::get($second, 'data.order_number'));
$token = (string) TestKit::get($second, 'data.guest_access_token');
$t->ok('replay issues a usable guest token', $token !== '');
$t->check('stock reserved once', $stock - 1, (int) $t->scalar("SELECT `stock_quantity` FROM `product_variants` WHERE `id` = ?", 'i', [$vid]));
$t->check('one order row for the key', 1, (int) $t->scalar("SELECT COUNT(*) FROM `orders` WHERE `idempotency_key` = ?", 's', [$key]));
$t->check('no variant -> order refused', 422, $t->http('POST', '/checkout/orders', ['json' => ['email' => $email, 'items' => [['product_id' => $pid, 'quantity' => 1]], 'shipping_address' => $address('Store Flow', 'FCT', 'Garki')]])['status']);
$t->check('verify before paying: not_started', 'not_started', TestKit::get($t->http('GET', "/checkout/orders/{$onum}/verify-payment", ['headers' => ["X-Guest-Access-Token: {$token}"]]), 'data.status'));
$t->check('guest token opens the order', 200, $t->http('GET', "/checkout/orders/{$onum}", ['headers' => ["X-Guest-Access-Token: {$token}"]])['status']);
$t->check('full checkout email opens the order', 200, $t->http('GET', "/checkout/orders/{$onum}", ['headers' => ["X-Order-Email: {$email}"]])['status']);
$wa = $t->http('POST', "/checkout/orders/{$onum}/initialize-payment", ['headers' => ["X-Guest-Access-Token: {$token}"], 'json' => ['gateway' => 'whatsapp']]);
$t->check('WhatsApp payment attempt opens', 'whatsapp', TestKit::get($wa, 'data.provider'));
$hours = (int) $t->scalar("SELECT TIMESTAMPDIFF(HOUR, NOW(), `expires_at`) FROM `orders` WHERE `order_number` = ?", 's', [$onum]);
$t->ok('WhatsApp attempt reserves the order for about a day', $hours >= 23, "hours={$hours}");

// -----------------------------------------------------------------------------
$t->section('Magic link links guest orders; saved cart and wishlist');
$t->check('magic link requested', 200, $t->http('POST', '/auth/customer/magic-link', ['json' => ['email' => $email]])['status']);
$link = $t->magicLinkToken($email);
$t->ok('magic link delivered to the (test) mail log', $link !== null);
$verify = $t->http('POST', '/auth/customer/verify', ['jar' => 'buyer', 'json' => ['token' => (string) $link]]);
$t->check('magic link verifies', 200, $verify['status']);
$csrf = (string) TestKit::get($verify, 'data.csrf_token');
$t->check('magic link cannot be reused', 401, $t->http('POST', '/auth/customer/verify', ['json' => ['token' => (string) $link]])['status']);
$t->check('guest order now appears under My orders', $onum, TestKit::get($t->http('GET', '/customer/orders', ['jar' => 'buyer']), 'data.0.order_number'));
$saved = $t->http('PUT', '/customer/cart', ['jar' => 'buyer', 'csrf' => $csrf, 'json' => ['items' => [['variant_id' => $vid, 'quantity' => 2], ['variant_id' => 999999, 'quantity' => 1]]]]);
$t->check('save cart 200', 200, $saved['status']);
$t->check('saved cart drops unknown variants', 1, count((array) TestKit::get($saved, 'data.items')));
$t->check('saved cart round-trips', 2, (int) TestKit::get($t->http('GET', '/customer/cart', ['jar' => 'buyer']), 'data.items.0.quantity'));
$t->check('cart quantity capped at 20 per line', 20, (int) TestKit::get($t->http('PUT', '/customer/cart', ['jar' => 'buyer', 'csrf' => $csrf, 'json' => ['items' => [['variant_id' => $vid, 'quantity' => 500]]]]), 'data.items.0.quantity'));
$t->check('save wishlist 200', 200, $t->http('PUT', '/customer/wishlist', ['jar' => 'buyer', 'csrf' => $csrf, 'json' => ['product_ids' => [$pid]]])['status']);
$t->check('wishlist returns product data', $slug, TestKit::get($t->http('GET', '/customer/wishlist', ['jar' => 'buyer']), 'data.products.0.slug'));
$t->check('cart save without CSRF -> 403', 403, $t->http('PUT', '/customer/cart', ['jar' => 'buyer', 'json' => ['items' => []]])['status']);

$t->section('Cancelling releases the stock');
$cancel = $t->http('PATCH', "/admin/orders/{$onum}/status", ['jar' => $admin['jar'], 'csrf' => $admin['csrf'], 'json' => ['status' => 'cancelled', 'comment' => 'Storefront test cleanup']]);
$t->check('admin cancels the unpaid order', 200, $cancel['status']);
$t->check('cancelling restores stock', $stock, (int) $t->scalar("SELECT `stock_quantity` FROM `product_variants` WHERE `id` = ?", 'i', [$vid]));

// -----------------------------------------------------------------------------
$t->section('Reviews: moderated, verified purchase decided by the server');
$buyer = $t->uniq('t-store-reviewer') . '@example.test';
$stranger = $t->uniq('t-store-stranger') . '@example.test';
array_push($emails, $buyer, $stranger);
$paidOrder = $t->http('POST', '/checkout/orders', ['headers' => ['Idempotency-Key: rv' . bin2hex(random_bytes(10))], 'json' => [
    'email' => $buyer, 'items' => [['product_id' => $pid, 'variant_id' => $vid, 'quantity' => 1]], 'shipping_address' => $address('Review Buyer', 'Enugu', 'Enugu'),
]]);
$paidNum = (string) TestKit::get($paidOrder, 'data.order_number');
$ordersCreated[] = $paidNum;
$t->check('buyer order paid (manual confirmation)', 200, $t->http('POST', "/admin/orders/{$paidNum}/confirm-payment", ['jar' => $admin['jar'], 'csrf' => $admin['csrf'], 'json' => ['reference' => 'RV-' . bin2hex(random_bytes(4))]])['status']);

$invalid = $t->http('POST', "/products/{$slug}/reviews", ['json' => ['author_name' => '', 'email' => 'x', 'rating' => 9, 'comment' => 'short']]);
$t->check('invalid review -> 422', 422, $invalid['status']);
$t->ok('field errors returned', isset($invalid['json']['error']['details']['rating'], $invalid['json']['error']['details']['comment']));
$strangerReview = $t->http('POST', "/products/{$slug}/reviews", ['json' => ['author_name' => 'Stranger', 'email' => $stranger, 'rating' => 4, 'comment' => 'Looks nice in the photos, honestly.']]);
$t->check('review accepted 201', 201, $strangerReview['status']);
$t->check('review is pending', 'pending', TestKit::get($strangerReview, 'data.status'));
$t->check('no paid order -> not a verified purchase', false, TestKit::get($strangerReview, 'data.verified_purchase'));
$t->check('second review from the same email -> 409', 409, $t->http('POST', "/products/{$slug}/reviews", ['json' => ['author_name' => 'Stranger', 'email' => $stranger, 'rating' => 5, 'comment' => 'Trying to review it twice here.']])['status']);
$buyerReview = $t->http('POST', "/products/{$slug}/reviews", ['json' => ['author_name' => 'Review Buyer', 'email' => strtoupper($buyer), 'rating' => 5, 'comment' => 'Bought it, great quality and fit.']]);
$t->check('paid order for this product -> verified purchase', true, TestKit::get($buyerReview, 'data.verified_purchase'));
$t->check('client cannot force verified (stored flag)', 0, (int) $t->scalar("SELECT `is_verified_purchase` FROM `reviews` WHERE `author_email` = ?", 's', [$stranger]));
$pdpAfter = $t->http('GET', "/products/{$slug}");
$t->check('pending reviews are not shown on the product', 0, count(array_filter((array) TestKit::get($pdpAfter, 'data.reviews'), static fn ($r) => in_array($r['author'] ?? '', ['Stranger', 'Review Buyer'], true))));
$t->check('pending reviews do not change the rating count', $ratingCountBefore, (int) TestKit::get($pdpAfter, 'data.rating_count'));

// -----------------------------------------------------------------------------
$t->section('Homepage numbers are real');
$home = $t->http('GET', '/storefront/homepage');
$t->check('homepage 200', 200, $home['status']);
$t->check('published products = database count', (int) $t->scalar("SELECT COUNT(*) FROM `products` WHERE `status` = 'published' AND `product_type` = 'physical'"), (int) TestKit::get($home, 'data.stats.published_products'));
$t->check('categories = active categories', (int) $t->scalar("SELECT COUNT(*) FROM `categories` WHERE `is_active` = 1"), (int) TestKit::get($home, 'data.stats.categories'));
$hasFallback = (int) $t->scalar("SELECT COUNT(*) FROM `shipping_zones` WHERE `is_active` = 1 AND JSON_CONTAINS(`states_covered`, '\"*\"')") > 0;
if ($hasFallback) {
    $t->check('a nationwide zone means all 37 states are served', 37, (int) TestKit::get($home, 'data.stats.states_served'));
}

// -----------------------------------------------------------------------------
$t->section('Flash deals end when their time is up');
$originalFlash = $t->sql("SELECT `id`, `is_flash_deal`, `flash_deal_ends_at` FROM `products` WHERE `is_flash_deal` = 1 OR `id` = ?", 'i', [$pid]);
$t->cleanup(function () use ($t, $originalFlash, $pid): void {
    $t->sql("UPDATE `products` SET `is_flash_deal` = 0, `flash_deal_ends_at` = NULL WHERE `id` = ?", 'i', [$pid]);
    foreach ($originalFlash as $row) {
        $t->sql("UPDATE `products` SET `is_flash_deal` = ?, `flash_deal_ends_at` = ? WHERE `id` = ?", 'isi', [(int) $row['is_flash_deal'], $row['flash_deal_ends_at'], (int) $row['id']]);
    }
});
$t->sql("UPDATE `products` SET `is_flash_deal` = 0, `flash_deal_ends_at` = NULL WHERE `is_flash_deal` = 1");
$past = date('Y-m-d H:i:s', time() - 3600);
$t->sql("UPDATE `products` SET `is_flash_deal` = 1, `flash_deal_ends_at` = ? WHERE `id` = ?", 'si', [$past, $pid]);
$slugsIn = static fn (array $res, string $path): array => array_column((array) TestKit::get($res, $path), 'slug');
$t->ok('expired deal not in /products?flash_deals=1', !in_array($slug, $slugsIn($t->http('GET', '/products?flash_deals=1&per_page=100'), 'data'), true));
$homeExpired = $t->http('GET', '/storefront/homepage');
$t->ok('expired deal not on the homepage', !in_array($slug, $slugsIn($homeExpired, 'data.flash_deals'), true));
$t->check('no countdown when no live deal has an end', null, TestKit::get($homeExpired, 'data.flash_deals_end_at'));
$future = date('Y-m-d H:i:s', time() + 2 * 86400);
$t->sql("UPDATE `products` SET `flash_deal_ends_at` = ? WHERE `id` = ?", 'si', [$future, $pid]);
$t->ok('live deal listed in /products?flash_deals=1', in_array($slug, $slugsIn($t->http('GET', '/products?flash_deals=1&per_page=100'), 'data'), true));
$homeLive = $t->http('GET', '/storefront/homepage');
$t->ok('live deal on the homepage', in_array($slug, $slugsIn($homeLive, 'data.flash_deals'), true));
$t->check('homepage countdown uses the real end time', $future, TestKit::get($homeLive, 'data.flash_deals_end_at'));

// -----------------------------------------------------------------------------
$t->section('Newsletter');
$sub = $t->uniq('t-store-news') . '@example.test';
$emails[] = $sub;
$t->check('subscribe 200', 200, $t->http('POST', '/newsletter/subscribe', ['json' => ['email' => $sub]])['status']);
$t->check('invalid email refused', 422, $t->http('POST', '/newsletter/subscribe', ['json' => ['email' => 'not-an-email']])['status']);
$unsubToken = (string) $t->scalar("SELECT `unsubscribe_token` FROM `newsletter_subscribers` WHERE `email` = ?", 's', [$sub]);
$t->check('subscriber gets an unsubscribe token', 32, strlen($unsubToken));
$t->check('bad unsubscribe token refused', 404, $t->http('POST', '/newsletter/unsubscribe', ['json' => ['token' => str_repeat('0', 32)]])['status']);
$t->check('unsubscribe 200', 200, $t->http('POST', '/newsletter/unsubscribe', ['json' => ['token' => $unsubToken]])['status']);
$t->check('subscriber marked unsubscribed', 'unsubscribed', $t->scalar("SELECT `status` FROM `newsletter_subscribers` WHERE `email` = ?", 's', [$sub]));
$t->check('subscribing again re-activates', 200, $t->http('POST', '/newsletter/subscribe', ['json' => ['email' => $sub]])['status']);
$t->check('re-activated subscriber is active', 'active', $t->scalar("SELECT `status` FROM `newsletter_subscribers` WHERE `email` = ?", 's', [$sub]));
$t->check('unsubscribe date cleared on re-subscribe', null, $t->scalar("SELECT `unsubscribed_at` FROM `newsletter_subscribers` WHERE `email` = ?", 's', [$sub]));

exit($t->finish());
