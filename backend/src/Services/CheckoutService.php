<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Database;
use RuntimeException;
use InvalidArgumentException;

/**
 * Service orchestrating server-side checkout quotation, shipping zone resolution,
 * inventory reservation, safe financial calculation, and transactional order creation.
 */
class CheckoutService
{
    private const MAX_LINES = 30;
    private const MAX_QUANTITY_PER_LINE = 20;

    private Database $db;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
    }

    /**
     * Compute a server-side verified checkout quote.
     * Evaluates real-time product prices, variant stock, active shipping zone fees,
     * and valid promotional discounts.
     *
     * @param array $input Payload containing items, shipping_address, shipping_zone_id, coupon_code
     * @return array Calculated breakdown with verified items, subtotal, discount, shipping, grand total
     */
    public function getQuote(array $input): array
    {
        $items = $input['items'] ?? [];
        if (!is_array($items) || empty($items)) {
            throw new InvalidArgumentException('Cart is empty. At least one item is required to generate a checkout quote.');
        }

        // 1. Verify and price all items from MySQL
        $verifiedItems = $this->verifyAndPriceItems($items);

        // 2. Compute subtotal
        $subtotal = 0.0;
        foreach ($verifiedItems as $item) {
            $subtotal += $item['line_total'];
        }
        $subtotal = round($subtotal, 2);

        // 3. Resolve shipping destination zone and fee
        $shippingAddress = $input['shipping_address'] ?? null;
        $requestedZoneId = isset($input['shipping_zone_id']) ? (int) $input['shipping_zone_id'] : null;

        $shippingResolution = null;
        $shippingFee = 0.0;

        if (is_array($shippingAddress) && !empty($shippingAddress['state'])) {
            $shippingResolution = $this->resolveShippingZone($shippingAddress, $requestedZoneId);
            $shippingFee = (float) $shippingResolution['selected_zone']['fee'];
        }

        // 4. Validate and apply coupon if provided
        $couponCode = isset($input['coupon_code']) ? trim((string) $input['coupon_code']) : '';
        $promoResult = null;
        $discountAmount = 0.0;

        if ($couponCode !== '') {
            $promoResult = $this->evaluateCoupon($couponCode, $subtotal);
            $discountAmount = $promoResult['discount_amount'];
        }

        // 5. Safe Grand Total Calculation
        $grandTotal = round(max(0.0, $subtotal - $discountAmount + $shippingFee), 2);

        // 6. Fetch store origin for reference
        $origin = $this->getStoreOrigin();

        return [
            'currency' => 'NGN',
            'items' => $verifiedItems,
            'items_count' => count($verifiedItems),
            'total_quantity' => array_sum(array_column($verifiedItems, 'quantity')),
            'subtotal' => $subtotal,
            'discount_amount' => $discountAmount,
            'shipping_fee' => $shippingFee,
            'grand_total' => $grandTotal,
            'applied_coupon' => $promoResult ? $promoResult['coupon'] : null,
            'shipping_zone' => $shippingResolution ? $shippingResolution['selected_zone'] : null,
            'eligible_zones' => $shippingResolution ? $shippingResolution['eligible_zones'] : [],
            'origin' => $origin,
        ];
    }

    /**
     * Create an order in MySQL inside an atomic database transaction.
     * Enforces the documented Immediate Atomic Reservation Policy for inventory,
     * validates all customer/guest details, shipping address, and persists snapshots.
     *
     * @param array $input Order payload
     * @param int|null $userId Authenticated user ID (or null for guest)
     * @return array Created order details including public order number and guest token
     */
    public function createOrder(array $input, ?int $userId = null, ?string $idempotencyKey = null): array
    {
        // Release stock held by abandoned orders before reserving more (cheap, bounded).
        try {
            (new FulfillmentService($this->db))->expireOverdueOrders(20);
        } catch (\Throwable $e) {
            error_log('[Order Expiry Sweep] ' . $e->getMessage());
        }

        // 1. Basic validation of contact & customer identity
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid email address is required for order confirmation and receipts.');
        }

        // A repeated submission (double click, retry after a dropped response) returns the same order.
        $idempotencyKey = $idempotencyKey !== null ? trim($idempotencyKey) : null;
        if ($idempotencyKey !== null && !preg_match('/^[A-Za-z0-9_\-]{16,64}$/', $idempotencyKey)) {
            $idempotencyKey = null;
        }
        if ($idempotencyKey !== null) {
            $replay = $this->replayIdempotentOrder($idempotencyKey, $email);
            if ($replay !== null) {
                return $replay;
            }
        }

        $items = $input['items'] ?? [];
        if (!is_array($items) || empty($items)) {
            throw new InvalidArgumentException('Cart is empty. Order cannot be placed without items.');
        }

        // 2. Physical delivery address is mandatory for all orders
        $shippingAddress = $input['shipping_address'] ?? null;
        if (!is_array($shippingAddress)) {
            throw new InvalidArgumentException('Delivery address is required for all orders.');
        }
        $this->validateShippingAddressFields($shippingAddress);

        // 3. Resolve and revalidate destination shipping zone
        $requestedZoneId = isset($input['shipping_zone_id']) ? (int) $input['shipping_zone_id'] : null;
        $shippingResolution = $this->resolveShippingZone($shippingAddress, $requestedZoneId);
        $selectedZone = $shippingResolution['selected_zone'];
        $shippingFee = (float) $selectedZone['fee'];

        // 4. Execute transactional order creation with atomic inventory decrement
        try {
            $createdOrder = $this->db->transaction(function (Database $db) use (
                $input,
                $userId,
                $email,
                $items,
                $shippingAddress,
                $selectedZone,
                $shippingFee,
                $idempotencyKey
            ): array {
                // A. Re-verify items and load lock-safe current pricing
                $verifiedItems = $this->verifyAndPriceItems($items);

                $subtotal = 0.0;
                foreach ($verifiedItems as $item) {
                    $subtotal += $item['line_total'];
                }
                $subtotal = round($subtotal, 2);

                // B. Validate and apply coupon inside transaction
                $couponCode = isset($input['coupon_code']) ? trim((string) $input['coupon_code']) : '';
                $promoId = null;
                $appliedPromoCode = null;
                $discountAmount = 0.0;

                if ($couponCode !== '') {
                    $promoResult = $this->evaluateCoupon($couponCode, $subtotal);
                    $promoId = (int) $promoResult['coupon']['id'];
                    $appliedPromoCode = $promoResult['coupon']['code'];
                    $discountAmount = $promoResult['discount_amount'];

                    // Atomically count this order's promotion use (once; released again if the order
                    // is cancelled or expires). max_uses = 0 means unlimited.
                    $promoUpdated = $db->executeUpdate(
                        "UPDATE `promotions` SET `used_count` = `used_count` + 1
                         WHERE `id` = ? AND (`max_uses` = 0 OR `used_count` < `max_uses`)",
                        'i',
                        [$promoId]
                    );
                    if ($promoUpdated === 0) {
                        throw new RuntimeException("Promotion code '{$appliedPromoCode}' reached its maximum usage limit during checkout.");
                    }
                }

                // C. Calculate final grand total
                $grandTotal = round(max(0.0, $subtotal - $discountAmount + $shippingFee), 2);

                // D. ATOMIC INVENTORY RESERVATION POLICY
                // We decrement variant stock atomically using conditional WHERE stock_quantity >= requested.
                // Under MySQL InnoDB, this acquires row-level exclusive locks and guarantees
                // no negative stock and zero concurrent overselling.
                foreach ($verifiedItems as $item) {
                    $variantId = $item['variant_id'];
                    $qty = $item['quantity'];

                    $affectedRows = $db->executeUpdate(
                        "UPDATE `product_variants` 
                         SET `stock_quantity` = `stock_quantity` - ? 
                         WHERE `id` = ? AND `stock_quantity` >= ?",
                        'iii',
                        [$qty, $variantId, $qty]
                    );

                    if ($affectedRows === 0) {
                        // Fetch latest actual stock for error message
                        $latestStock = $db->fetchOne("SELECT `stock_quantity`, `sku` FROM `product_variants` WHERE `id` = ?", 'i', [$variantId]);
                        $sku = $latestStock['sku'] ?? $item['sku'];
                        $available = $latestStock['stock_quantity'] ?? 0;
                        throw new RuntimeException("Insufficient stock for item '{$item['name']}' ({$sku}). Requested: {$qty}, Available: {$available}.");
                    }
                }

                // E. Generate unique public order number (ORD-YYYYMMDD-XXXXXX)
                $orderNumber = $this->generateUniqueOrderNumber($db);

                // F. Generate high-entropy guest access token (32 random bytes = 256 bits)
                $guestAccessToken = bin2hex(random_bytes(32));
                $guestAccessTokenHash = hash('sha256', $guestAccessToken);

                // G. Prepare snapshots
                $origin = $this->getStoreOrigin();
                $zoneSnapshot = [
                    'id' => (int) $selectedZone['id'],
                    'name' => $selectedZone['name'],
                    'code' => $selectedZone['code'],
                    'fee' => (float) $selectedZone['fee'],
                    'estimated_days' => $selectedZone['estimated_days'],
                    'origin' => $origin,
                ];

                $addressSnapshot = [
                    'full_name' => trim($shippingAddress['full_name'] ?? ''),
                    'phone' => trim($shippingAddress['phone'] ?? ''),
                    'address_line1' => trim($shippingAddress['address_line1'] ?? ''),
                    'address_line2' => trim($shippingAddress['address_line2'] ?? ''),
                    'city' => trim($shippingAddress['city'] ?? ''),
                    'state' => trim($shippingAddress['state'] ?? ''),
                    'postal_code' => trim($shippingAddress['postal_code'] ?? ''),
                    'country' => trim($shippingAddress['country'] ?? 'Nigeria'),
                ];

                $notes = isset($input['notes']) ? trim((string) $input['notes']) : null;

                // H. Insert Order (stock stays reserved until expires_at unless the order is paid)
                $orderId = (int) $db->insert(
                    "INSERT INTO `orders` (
                        `order_number`, `user_id`, `guest_email`, `guest_access_token_hash`,
                        `shipping_zone_id`, `shipping_zone_snapshot`, `shipping_address_snapshot`,
                        `order_status`, `payment_status`, `currency`, `subtotal`, `discount_amount`,
                        `shipping_fee`, `grand_total`, `applied_promo_code`, `notes`, `expires_at`, `idempotency_key`
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'pending', 'NGN', ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)",
                    'sississddddssis',
                    [
                        $orderNumber,
                        $userId,
                        $email,
                        $guestAccessTokenHash,
                        (int) $selectedZone['id'],
                        json_encode($zoneSnapshot),
                        json_encode($addressSnapshot),
                        $subtotal,
                        $discountAmount,
                        $shippingFee,
                        $grandTotal,
                        $appliedPromoCode,
                        $notes,
                        PaymentAttempts::gatewayWindowMinutes(),
                        $idempotencyKey,
                    ]
                );

                // I. Insert Order Items snapshots
                foreach ($verifiedItems as $item) {
                    $db->insert(
                        "INSERT INTO `order_items` (
                            `order_id`, `product_id`, `variant_id`, `product_type`,
                            `item_name`, `sku`, `variant_options`, `unit_price`, `quantity`, `line_total`
                         ) VALUES (?, ?, ?, 'physical', ?, ?, ?, ?, ?, ?)",
                        'iiisssdid',
                        [
                            $orderId,
                            $item['product_id'],
                            $item['variant_id'],
                            $item['name'],
                            $item['sku'],
                            json_encode($item['variant_options']),
                            $item['unit_price'],
                            $item['quantity'],
                            $item['line_total'],
                        ]
                    );
                }

                // J. Insert initial Order Status History record
                $db->insert(
                    "INSERT INTO `order_status_history` (`order_id`, `previous_status`, `new_status`, `comment`, `changed_by_user_id`)
                     VALUES (?, '', 'pending_payment', 'Order created. Inventory reserved. Pending payment verification.', ?)",
                    'ii',
                    [$orderId, $userId]
                );

                // K. No payment row yet: each gateway attempt creates its own when it starts
                //    (POST /checkout/orders/{n}/initialize-payment).
                $expiresRow = $db->fetchOne("SELECT `expires_at`, `created_at` FROM `orders` WHERE `id` = ?", 'i', [$orderId]);

                $createdOrder = [
                    'order_id' => $orderId,
                    'order_number' => $orderNumber,
                    'guest_access_token' => $guestAccessToken,
                    'guest_email' => $email,
                    'status' => 'pending_payment',
                    'payment_status' => 'pending',
                    'currency' => 'NGN',
                    'subtotal' => $subtotal,
                    'discount_amount' => $discountAmount,
                    'shipping_fee' => $shippingFee,
                    'grand_total' => $grandTotal,
                    'shipping_zone' => $zoneSnapshot,
                    'shipping_address' => $addressSnapshot,
                    'items_count' => count($verifiedItems),
                    'items' => $verifiedItems,
                    'expires_at' => $expiresRow['expires_at'] ?? null,
                    'created_at' => $expiresRow['created_at'] ?? date('Y-m-d H:i:s'),
                ];

                // Order-received email goes out only once the order is committed.
                $db->afterCommit(static function () use ($createdOrder): void {
                    MailService::getInstance()->sendOrderReceived($createdOrder);
                });

                return $createdOrder;
            });
        } catch (\mysqli_sql_exception $e) {
            // Two concurrent submissions with the same idempotency key: the loser replays the winner.
            if ($idempotencyKey !== null && $e->getCode() === 1062 && str_contains($e->getMessage(), 'idempotency')) {
                $replay = $this->replayIdempotentOrder($idempotencyKey, $email);
                if ($replay !== null) {
                    return $replay;
                }
            }
            throw $e;
        }

        return $createdOrder;
    }

    /**
     * Return the order previously created with this idempotency key, issuing a fresh guest
     * access token (only the hash is stored, so the original token cannot be re-sent).
     */
    private function replayIdempotentOrder(string $idempotencyKey, string $email): ?array
    {
        $order = $this->db->fetchOne("SELECT * FROM `orders` WHERE `idempotency_key` = ?", 's', [$idempotencyKey]);
        if ($order === null) {
            return null;
        }
        if (strtolower((string) $order['guest_email']) !== $email) {
            throw new InvalidArgumentException('This checkout session was already used for a different order. Please refresh and try again.');
        }

        $guestAccessToken = bin2hex(random_bytes(32));
        $this->db->executeUpdate(
            "UPDATE `orders` SET `guest_access_token_hash` = ? WHERE `id` = ?",
            'si',
            [hash('sha256', $guestAccessToken), (int) $order['id']]
        );

        $items = $this->db->fetchAll(
            "SELECT `product_id`, `variant_id`, `item_name` AS `name`, `sku`, `variant_options`, `unit_price`, `quantity`, `line_total`
             FROM `order_items` WHERE `order_id` = ?",
            'i',
            [(int) $order['id']]
        );
        foreach ($items as &$item) {
            $item['variant_options'] = json_decode((string) $item['variant_options'], true);
            $item['unit_price'] = (float) $item['unit_price'];
            $item['line_total'] = (float) $item['line_total'];
            $item['quantity'] = (int) $item['quantity'];
        }
        unset($item);

        return [
            'order_id' => (int) $order['id'],
            'order_number' => $order['order_number'],
            'guest_access_token' => $guestAccessToken,
            'guest_email' => $order['guest_email'],
            'status' => $order['order_status'],
            'payment_status' => $order['payment_status'],
            'currency' => $order['currency'],
            'subtotal' => (float) $order['subtotal'],
            'discount_amount' => (float) $order['discount_amount'],
            'shipping_fee' => (float) $order['shipping_fee'],
            'grand_total' => (float) $order['grand_total'],
            'shipping_zone' => json_decode((string) $order['shipping_zone_snapshot'], true),
            'shipping_address' => json_decode((string) $order['shipping_address_snapshot'], true),
            'items_count' => count($items),
            'items' => $items,
            'expires_at' => $order['expires_at'],
            'created_at' => $order['created_at'],
            'replayed' => true,
        ];
    }

    /**
     * Verify items against MySQL products and variants.
     * Enforces published status, loads real database prices, verifies variants,
     * and calculates line totals.
     *
     * @param array $items Raw items from request
     * @return array Array of validated item details
     */
    private function verifyAndPriceItems(array $items): array
    {
        $verified = [];

        if (count($items) > self::MAX_LINES) {
            throw new InvalidArgumentException('Too many different items in one order (maximum ' . self::MAX_LINES . ').');
        }

        foreach ($items as $index => $item) {
            $productId = isset($item['product_id']) ? (int) $item['product_id'] : (isset($item['productId']) ? (int) $item['productId'] : 0);
            $variantId = isset($item['variant_id']) ? (int) $item['variant_id'] : (isset($item['variantId']) ? (int) $item['variantId'] : null);
            $quantity = isset($item['quantity']) ? (int) $item['quantity'] : 0;

            if ($productId <= 0) {
                throw new InvalidArgumentException("Item at index {$index} must specify a valid product_id.");
            }

            if ($quantity <= 0 || $quantity > self::MAX_QUANTITY_PER_LINE) {
                throw new InvalidArgumentException("Invalid quantity '{$quantity}' for product ID {$productId}. Quantity must be between 1 and " . self::MAX_QUANTITY_PER_LINE . '.');
            }

            // 1. Fetch product from database
            $product = $this->db->fetchOne(
                "SELECT `id`, `name`, `slug`, `status`, `product_type`, `base_price`, `currency`, `sku`
                 FROM `products` WHERE `id` = ?",
                'i',
                [$productId]
            );

            if ($product === null) {
                throw new InvalidArgumentException("Product with ID {$productId} was not found.");
            }

            if ($product['status'] !== 'published') {
                throw new InvalidArgumentException("Product '{$product['name']}' is not available for purchase (status: {$product['status']}).");
            }

            // 2. Resolve the exact variant the customer chose. Never substitute a different one.
            $variantColumns = "`id`, `product_id`, `sku`, `size`, `color_name`, `color_hex`, `price_override`, `stock_quantity`";
            $variant = null;
            if ($variantId !== null && $variantId > 0) {
                $variant = $this->db->fetchOne(
                    "SELECT {$variantColumns} FROM `product_variants` WHERE `id` = ? AND `product_id` = ? AND `is_active` = 1",
                    'ii',
                    [$variantId, $productId]
                );
                if ($variant === null) {
                    throw new InvalidArgumentException("The selected option for '{$product['name']}' is no longer available. Please choose another size or colour.");
                }
            } else {
                // Legacy carts without a variant_id: accept only an exact size + colour match, or a
                // product that has a single option.
                $size = isset($item['size']) ? trim((string) $item['size']) : '';
                $color = isset($item['color']) ? (is_array($item['color']) ? trim((string) ($item['color']['name'] ?? '')) : trim((string) $item['color'])) : '';

                if ($size !== '' && $color !== '') {
                    $variant = $this->db->fetchOne(
                        "SELECT {$variantColumns} FROM `product_variants`
                         WHERE `product_id` = ? AND `is_active` = 1 AND LOWER(`size`) = LOWER(?) AND LOWER(`color_name`) = LOWER(?)
                         LIMIT 1",
                        'iss',
                        [$productId, $size, $color]
                    );
                }

                if ($variant === null) {
                    $activeVariants = $this->db->fetchAll(
                        "SELECT {$variantColumns} FROM `product_variants` WHERE `product_id` = ? AND `is_active` = 1 LIMIT 2",
                        'i',
                        [$productId]
                    );
                    if (count($activeVariants) === 1) {
                        $variant = $activeVariants[0];
                    }
                }

                if ($variant === null) {
                    $chosen = trim($size . ' / ' . $color, ' /');
                    throw new InvalidArgumentException(
                        "Please choose an available size and colour for '{$product['name']}'"
                        . ($chosen !== '' ? " ('{$chosen}' is not offered)." : '.')
                    );
                }
            }

            // 3. Check current available inventory
            $availableStock = (int) $variant['stock_quantity'];
            if ($availableStock < $quantity) {
                throw new RuntimeException("Insufficient stock for '{$product['name']}' ({$variant['sku']}). Only {$availableStock} available, {$quantity} requested.");
            }

            // 4. Safe price resolution: only positive (> 0) price_override overrides the base_price
            $hasOverride = $variant['price_override'] !== null && (float) $variant['price_override'] > 0;
            $unitPrice = $hasOverride ? (float) $variant['price_override'] : (float) $product['base_price'];
            $lineTotal = round($unitPrice * $quantity, 2);

            $verified[] = [
                'product_id' => (int) $product['id'],
                'variant_id' => (int) $variant['id'],
                'name' => $product['name'],
                'slug' => $product['slug'],
                'sku' => $variant['sku'],
                'variant_options' => [
                    'size' => $variant['size'],
                    'color' => $variant['color_name'],
                    'color_hex' => $variant['color_hex'],
                ],
                'unit_price' => $unitPrice,
                'quantity' => $quantity,
                'line_total' => $lineTotal,
                'stock_available' => $availableStock,
            ];
        }

        return $verified;
    }

    /**
     * Resolve delivery address location against active database shipping zones.
     * Prevents arbitrary or invented shipping rates. Returns error if location is unserved.
     * Never silently applies free shipping!
     *
     * @param array $address Destination delivery address
     * @param int|null $requestedZoneId Optional zone identifier picked by customer
     * @return array{selected_zone: array, eligible_zones: array}
     */
    public function resolveShippingZone(array $address, ?int $requestedZoneId = null): array
    {
        $country = trim($address['country'] ?? '');
        $state = trim($address['state'] ?? '');

        if ($state === '') {
            throw new InvalidArgumentException('Destination state is required to calculate shipping.');
        }

        // Domestic Nigeria store policy check
        $validCountryNames = ['nigeria', 'ng', 'nga'];
        if ($country !== '' && !in_array(strtolower($country), $validCountryNames, true)) {
            throw new InvalidArgumentException("Delivery is currently only supported within Nigeria. Country '{$country}' is unserved.");
        }

        // Fetch all active shipping zones configured by store administration
        $allActiveZones = $this->db->fetchAll("SELECT * FROM `shipping_zones` WHERE `is_active` = 1 ORDER BY `id` ASC");
        if (empty($allActiveZones)) {
            throw new RuntimeException('No active delivery destination zones are currently configured by store administration.');
        }

        // Decode states_covered JSON
        $normalizedState = strtolower($state);
        $directMatches = [];
        $wildcardMatches = [];

        foreach ($allActiveZones as $zone) {
            $statesCovered = is_string($zone['states_covered']) ? json_decode($zone['states_covered'], true) : $zone['states_covered'];
            if (!is_array($statesCovered)) {
                $statesCovered = [];
            }

            $zone['fee'] = (float) $zone['fee'];
            $zone['states_covered'] = $statesCovered;

            $hasDirectMatch = false;
            $hasWildcard = false;

            foreach ($statesCovered as $covered) {
                $coveredTrimmed = strtolower(trim((string) $covered));
                if ($coveredTrimmed === '*') {
                    $hasWildcard = true;
                } elseif ($coveredTrimmed === $normalizedState) {
                    $hasDirectMatch = true;
                    break;
                }
            }

            if ($hasDirectMatch) {
                $directMatches[] = $zone;
            } elseif ($hasWildcard) {
                $wildcardMatches[] = $zone;
            }
        }

        // Specific state zones take priority over nationwide wildcard zones
        $eligibleZones = !empty($directMatches) ? $directMatches : $wildcardMatches;

        if (empty($eligibleZones)) {
            throw new InvalidArgumentException("Destination state '{$state}' is currently unserved by our logistics network. Free delivery is never silently applied.");
        }

        // If client specified a zone ID, revalidate that it is an eligible zone
        $selectedZone = null;
        if ($requestedZoneId !== null && $requestedZoneId > 0) {
            foreach ($eligibleZones as $zone) {
                if ((int) $zone['id'] === $requestedZoneId) {
                    $selectedZone = $zone;
                    break;
                }
            }

            if ($selectedZone === null) {
                throw new InvalidArgumentException("Selected shipping zone ID {$requestedZoneId} is not valid for destination state '{$state}'.");
            }
        } else {
            // Default to the first eligible zone
            $selectedZone = $eligibleZones[0];
        }

        return [
            'selected_zone' => $selectedZone,
            'eligible_zones' => $eligibleZones,
        ];
    }

    /**
     * Validate and calculate discount for a promotional coupon code.
     *
     * @param string $couponCode
     * @param float $subtotal
     * @return array{coupon: array, discount_amount: float}
     */
    public function evaluateCoupon(string $couponCode, float $subtotal): array
    {
        $code = strtoupper(trim($couponCode));
        if ($code === '') {
            throw new InvalidArgumentException('Coupon code cannot be empty.');
        }

        $promo = $this->db->fetchOne(
            "SELECT `id`, `code`, `description`, `discount_percent`, `max_uses`, `used_count`, `is_active`, `starts_at`, `expires_at`
             FROM `promotions` WHERE `code` = ?",
            's',
            [$code]
        );

        if ($promo === null || !(bool) $promo['is_active']) {
            throw new InvalidArgumentException("Coupon code '{$code}' is invalid or has been deactivated.");
        }

        // Check usage limits
        $maxUses = (int) $promo['max_uses'];
        $usedCount = (int) $promo['used_count'];
        if ($maxUses > 0 && $usedCount >= $maxUses) {
            throw new InvalidArgumentException("Coupon code '{$code}' has reached its maximum usage limit.");
        }

        // Check start and expiry dates
        $now = time();
        if (!empty($promo['starts_at']) && strtotime((string) $promo['starts_at']) > $now) {
            throw new InvalidArgumentException("Coupon code '{$code}' is not yet active.");
        }
        if (!empty($promo['expires_at']) && strtotime((string) $promo['expires_at']) < $now) {
            throw new InvalidArgumentException("Coupon code '{$code}' has expired.");
        }

        $discountPercent = (int) $promo['discount_percent'];
        $discountAmount = round($subtotal * ($discountPercent / 100.0), 2);
        if ($discountAmount > $subtotal) {
            $discountAmount = $subtotal;
        }

        return [
            'coupon' => [
                'id' => (int) $promo['id'],
                'code' => $promo['code'],
                'description' => $promo['description'],
                'discount_percent' => $discountPercent,
            ],
            'discount_amount' => $discountAmount,
        ];
    }

    /**
     * Validate mandatory fields for physical shipping address.
     */
    private function validateShippingAddressFields(array $address): void
    {
        $requiredFields = [
            'full_name' => 'Full recipient name',
            'phone' => 'Contact phone number',
            'address_line1' => 'Street delivery address',
            'city' => 'City or town',
            'state' => 'Delivery state',
        ];

        $missing = [];
        foreach ($requiredFields as $field => $label) {
            if (empty(trim((string) ($address[$field] ?? '')))) {
                $missing[$field] = "{$label} is required.";
            }
        }

        if (!empty($missing)) {
            $firstMsg = reset($missing);
            throw new InvalidArgumentException("Incomplete shipping address: {$firstMsg}");
        }
    }

    /**
     * Retrieve store origin information from store_settings.
     */
    public function getStoreOrigin(): array
    {
        $settingsRows = $this->db->fetchAll(
            "SELECT `key_name`, `value` FROM `store_settings` 
             WHERE `key_name` IN ('store_name', 'store_origin_city', 'store_origin_state', 'store_origin_address', 'store_contact_phone', 'store_contact_email')"
        );

        $settings = [];
        foreach ($settingsRows as $row) {
            $settings[$row['key_name']] = $row['value'];
        }

        return [
            'store_name' => $settings['store_name'] ?? 'SHOP.CO',
            'origin_city' => $settings['store_origin_city'] ?? 'Enugu',
            'origin_state' => $settings['store_origin_state'] ?? 'Enugu',
            'origin_address' => $settings['store_origin_address'] ?? '12 Okpara Avenue, Independence Layout, Enugu, Nigeria',
            'contact_phone' => $settings['store_contact_phone'] ?? '+234 803 000 0000',
            'contact_email' => $settings['store_contact_email'] ?? 'support@shop.co',
        ];
    }

    /**
     * Generate an unambiguous, unique public order number (ORD-YYYYMMDD-XXXXXX).
     */
    private function generateUniqueOrderNumber(Database $db): string
    {
        $datePart = date('Ymd');
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $randomHex = strtoupper(bin2hex(random_bytes(3))); // 6 hex characters
            $candidate = "ORD-{$datePart}-{$randomHex}";

            $existing = $db->fetchOne("SELECT `id` FROM `orders` WHERE `order_number` = ?", 's', [$candidate]);
            if ($existing === null) {
                return $candidate;
            }
        }

        // Extreme fallback with microtime entropy
        return "ORD-{$datePart}-" . strtoupper(substr(uniqid(), -6));
    }
}
