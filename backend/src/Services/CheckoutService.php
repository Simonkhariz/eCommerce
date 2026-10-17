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
    public function createOrder(array $input, ?int $userId = null): array
    {
        // 1. Basic validation of contact & customer identity
        $email = trim($input['email'] ?? '');
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid email address is required for order confirmation and receipts.');
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
        return $this->db->transaction(function (Database $db) use (
            $input,
            $userId,
            $email,
            $items,
            $shippingAddress,
            $selectedZone,
            $shippingFee
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

                // Atomically increment promotion usage
                $promoUpdated = $db->executeUpdate(
                    "UPDATE `promotions` SET `used_count` = `used_count` + 1 WHERE `id` = ? AND `used_count` < `max_uses`",
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

            // H. Insert Order
            $orderId = (int) $db->insert(
                "INSERT INTO `orders` (
                    `order_number`, `user_id`, `guest_email`, `guest_access_token_hash`,
                    `shipping_zone_id`, `shipping_zone_snapshot`, `shipping_address_snapshot`,
                    `order_status`, `payment_status`, `currency`, `subtotal`, `discount_amount`,
                    `shipping_fee`, `grand_total`, `applied_promo_code`, `notes`
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'pending', 'NGN', ?, ?, ?, ?, ?, ?)",
                'sississddddss',
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

            // K. Create Pending Payment Record (Kora provider, no direct gateway call in STEP 8)
            $paymentReference = 'PAY-' . $orderNumber . '-' . strtoupper(bin2hex(random_bytes(3)));
            $db->insert(
                "INSERT INTO `payments` (
                    `order_id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `provider_payload_redacted`
                 ) VALUES (?, 'kora', ?, ?, 'NGN', 'pending', ?)",
                'isds',
                [
                    $orderId,
                    $paymentReference,
                    $grandTotal,
                    json_encode([
                        'channel' => 'kora_checkout',
                        'customer_email' => $email,
                        'order_number' => $orderNumber,
                        'initialized' => false,
                        'notes' => 'Awaiting payment initialization',
                    ]),
                ]
            );

            return [
                'order_id' => $orderId,
                'order_number' => $orderNumber,
                'guest_access_token' => $guestAccessToken,
                'guest_email' => $email,
                'user_id' => $userId,
                'status' => 'pending_payment',
                'payment_status' => 'pending',
                'payment_reference' => $paymentReference,
                'currency' => 'NGN',
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'shipping_fee' => $shippingFee,
                'grand_total' => $grandTotal,
                'shipping_zone' => $zoneSnapshot,
                'shipping_address' => $addressSnapshot,
                'items_count' => count($verifiedItems),
                'items' => $verifiedItems,
                'created_at' => date('Y-m-d H:i:s'),
            ];
        });

        // Dispatch order received notification (logs safely to dev mail.log or SMTP)
        try {
            MailService::getInstance()->sendOrderReceived($createdOrder);
        } catch (\Throwable $e) {
            error_log('[MailService Notice] ' . $e->getMessage());
        }

        return $createdOrder;
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

        foreach ($items as $index => $item) {
            $productId = isset($item['product_id']) ? (int) $item['product_id'] : (isset($item['productId']) ? (int) $item['productId'] : 0);
            $variantId = isset($item['variant_id']) ? (int) $item['variant_id'] : (isset($item['variantId']) ? (int) $item['variantId'] : null);
            $quantity = isset($item['quantity']) ? (int) $item['quantity'] : 0;

            if ($productId <= 0) {
                throw new InvalidArgumentException("Item at index {$index} must specify a valid product_id.");
            }

            if ($quantity <= 0 || $quantity > 999) {
                throw new InvalidArgumentException("Invalid quantity '{$quantity}' for product ID {$productId}. Quantity must be between 1 and 999.");
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

            // 2. Fetch or resolve product variant
            $variant = null;
            if ($variantId !== null && $variantId > 0) {
                $variant = $this->db->fetchOne(
                    "SELECT `id`, `product_id`, `sku`, `size`, `color_name`, `color_hex`, `price_override`, `stock_quantity`
                     FROM `product_variants` WHERE `id` = ? AND `product_id` = ?",
                    'ii',
                    [$variantId, $productId]
                );
                if ($variant === null) {
                    throw new InvalidArgumentException("Specified variant ID {$variantId} does not belong to product '{$product['name']}'.");
                }
            } else {
                // If variant_id was omitted, check if size and color were provided, or pick the first available variant
                $size = isset($item['size']) ? trim((string) $item['size']) : '';
                $color = isset($item['color']) ? (is_array($item['color']) ? trim((string) ($item['color']['name'] ?? '')) : trim((string) $item['color'])) : '';

                if ($size !== '' && $color !== '') {
                    $variant = $this->db->fetchOne(
                        "SELECT `id`, `product_id`, `sku`, `size`, `color_name`, `color_hex`, `price_override`, `stock_quantity`
                         FROM `product_variants`
                         WHERE `product_id` = ? AND LOWER(`size`) = LOWER(?) AND LOWER(`color_name`) = LOWER(?)
                         LIMIT 1",
                        'iss',
                        [$productId, $size, $color]
                    );
                }

                if ($variant === null) {
                    // Fall back to first variant of this product
                    $variant = $this->db->fetchOne(
                        "SELECT `id`, `product_id`, `sku`, `size`, `color_name`, `color_hex`, `price_override`, `stock_quantity`
                         FROM `product_variants` WHERE `product_id` = ? ORDER BY `id` ASC LIMIT 1",
                        'i',
                        [$productId]
                    );
                }

                if ($variant === null) {
                    throw new InvalidArgumentException("No purchasable variant found for product '{$product['name']}'.");
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
