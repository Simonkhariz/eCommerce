<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database\Database;
use App\Middleware\JsonBodyMiddleware;
use App\Repositories\AddressRepository;
use App\Repositories\UserRepository;
use App\Support\RequestContext;
use App\Support\Response;

/**
 * Controller handling authenticated customer operations:
 * Profile management, address book, persistent cart and wishlist merging.
 */
class CustomerController
{
    private UserRepository $userRepo;
    private AddressRepository $addressRepo;
    private Database $db;

    public function __construct()
    {
        $this->userRepo = new UserRepository();
        $this->addressRepo = new AddressRepository();
        $this->db = Database::getInstance();
    }

    /**
     * Get the authenticated customer's profile.
     */
    public function getProfile(): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        Response::success(UserRepository::toSafeUser($user), 'Customer profile retrieved.');
    }

    /**
     * Update customer profile (name, phone).
     */
    public function updateProfile(): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $body = JsonBodyMiddleware::getBody();
        $fullName = isset($body['full_name']) ? trim($body['full_name']) : null;
        $phone = isset($body['phone']) ? trim($body['phone']) : null;

        $updates = [];
        if ($fullName !== null && $fullName !== '') {
            $updates['full_name'] = $fullName;
        }
        if ($phone !== null) {
            $updates['phone'] = $phone;
        }

        if (!empty($updates)) {
            $this->userRepo->update((int) $user['id'], $updates);
        }

        $freshUser = $this->userRepo->findById((int) $user['id']);
        Response::success(UserRepository::toSafeUser($freshUser), 'Profile updated successfully.');
    }

    /**
     * List all delivery addresses belonging to the authenticated customer.
     */
    public function getAddresses(): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $addresses = $this->addressRepo->getByUserId((int) $user['id']);
        Response::success($addresses, 'Customer addresses retrieved.');
    }

    /**
     * Add a new delivery address.
     */
    public function createAddress(): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $body = JsonBodyMiddleware::getBody();

        $errors = [];
        if (empty(trim($body['recipient_name'] ?? ''))) {
            $errors['recipient_name'] = 'Recipient name is required.';
        }
        if (empty(trim($body['phone'] ?? ''))) {
            $errors['phone'] = 'Phone number is required.';
        }
        if (empty(trim($body['street_address'] ?? ''))) {
            $errors['street_address'] = 'Street address is required.';
        }
        if (empty(trim($body['city'] ?? ''))) {
            $errors['city'] = 'City is required.';
        }
        if (empty(trim($body['state'] ?? ''))) {
            $errors['state'] = 'State is required.';
        }

        if (!empty($errors)) {
            Response::error('Address validation failed.', 422, 'VALIDATION_ERROR', $errors);
        }

        $addressId = $this->addressRepo->create((int) $user['id'], $body);
        $created = $this->addressRepo->findByIdAndUser($addressId, (int) $user['id']);

        Response::success($created, 'Address added successfully.', 201);
    }

    /**
     * Update an address belonging to the authenticated customer.
     */
    public function updateAddress(array $params): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $addressId = (int) ($params['id'] ?? 0);
        $body = JsonBodyMiddleware::getBody();

        $updated = $this->addressRepo->update($addressId, (int) $user['id'], $body);
        if (!$updated) {
            Response::error('Address not found or access denied.', 404, 'ADDRESS_NOT_FOUND');
        }

        $address = $this->addressRepo->findByIdAndUser($addressId, (int) $user['id']);
        Response::success($address, 'Address updated successfully.');
    }

    /**
     * Delete an address belonging to the customer.
     */
    public function deleteAddress(array $params): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $addressId = (int) ($params['id'] ?? 0);
        $deleted = $this->addressRepo->delete($addressId, (int) $user['id']);
        if (!$deleted) {
            Response::error('Address not found or access denied.', 404, 'ADDRESS_NOT_FOUND');
        }

        Response::success(null, 'Address removed successfully.');
    }

    /**
     * Set a default delivery address.
     */
    public function setDefaultAddress(array $params): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $addressId = (int) ($params['id'] ?? 0);
        $ok = $this->addressRepo->setDefault($addressId, (int) $user['id']);
        if (!$ok) {
            Response::error('Address not found or access denied.', 404, 'ADDRESS_NOT_FOUND');
        }

        Response::success(null, 'Default address updated.');
    }

    /**
     * Merge guest local cart items into customer's persistent database cart.
     */
    public function mergeCart(): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $body = JsonBodyMiddleware::getBody();
        $items = $body['items'] ?? [];

        if (!is_array($items)) {
            Response::error('Invalid items list.', 400, 'BAD_REQUEST');
        }

        $userId = (int) $user['id'];

        // Find or create customer cart
        $cart = $this->db->fetchOne("SELECT id FROM `carts` WHERE `user_id` = ? ORDER BY id DESC LIMIT 1", 'i', [$userId]);
        if ($cart === null) {
            $cartId = (int) $this->db->insert(
                "INSERT INTO `carts` (`user_id`, `currency`) VALUES (?, 'NGN')",
                'i',
                [$userId]
            );
        } else {
            $cartId = (int) $cart['id'];
        }

        // Upsert items into cart_items
        foreach ($items as $item) {
            $variantId = (int) ($item['variant_id'] ?? 0);
            $qty = max(1, (int) ($item['quantity'] ?? 1));

            if ($variantId > 0) {
                // Check if already in cart
                $existingItem = $this->db->fetchOne(
                    "SELECT id, quantity FROM `cart_items` WHERE `cart_id` = ? AND `variant_id` = ? LIMIT 1",
                    'ii',
                    [$cartId, $variantId]
                );

                if ($existingItem !== null) {
                    $newQty = (int) $existingItem['quantity'] + $qty;
                    $this->db->execute(
                        "UPDATE `cart_items` SET `quantity` = ? WHERE `id` = ?",
                        'ii',
                        [$newQty, (int) $existingItem['id']]
                    );
                } else {
                    $this->db->execute(
                        "INSERT INTO `cart_items` (`cart_id`, `variant_id`, `quantity`) VALUES (?, ?, ?)",
                        'iii',
                        [$cartId, $variantId, $qty]
                    );
                }
            }
        }

        // Fetch complete merged cart items
        $mergedItems = $this->db->fetchAll(
            "SELECT ci.id, ci.variant_id, ci.quantity, pv.product_id, pv.size, pv.color_name, pv.sku,
                    COALESCE(pv.price_override, p.base_price) as price, pv.stock_quantity,
                    p.name as product_name, p.slug as product_slug
             FROM `cart_items` ci
             JOIN `product_variants` pv ON pv.id = ci.variant_id
             JOIN `products` p ON p.id = pv.product_id
             WHERE ci.cart_id = ?",
            'i',
            [$cartId]
        );

        Response::success([
            'cart_id' => $cartId,
            'items' => $mergedItems,
            'item_count' => count($mergedItems),
        ], 'Cart merged successfully.');
    }

    /**
     * Merge guest wishlist into customer's persistent database wishlist.
     */
    public function mergeWishlist(): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $body = JsonBodyMiddleware::getBody();
        $productIds = $body['product_ids'] ?? [];

        if (!is_array($productIds)) {
            Response::error('Invalid product IDs list.', 400, 'BAD_REQUEST');
        }

        $userId = (int) $user['id'];

        $wishlist = $this->db->fetchOne("SELECT id FROM `wishlists` WHERE `user_id` = ? LIMIT 1", 'i', [$userId]);
        if ($wishlist === null) {
            $wishlistId = (int) $this->db->insert("INSERT INTO `wishlists` (`user_id`) VALUES (?)", 'i', [$userId]);
        } else {
            $wishlistId = (int) $wishlist['id'];
        }

        foreach ($productIds as $pId) {
            $productId = (int) $pId;
            if ($productId > 0) {
                $this->db->execute(
                    "INSERT IGNORE INTO `wishlist_items` (`wishlist_id`, `product_id`) VALUES (?, ?)",
                    'ii',
                    [$wishlistId, $productId]
                );
            }
        }

        $items = $this->db->fetchAll(
            "SELECT wi.id, wi.product_id, p.name, p.slug, p.base_price, p.status
             FROM `wishlist_items` wi
             JOIN `products` p ON p.id = wi.product_id
             WHERE wi.wishlist_id = ?",
            'i',
            [$wishlistId]
        );

        Response::success([
            'wishlist_id' => $wishlistId,
            'items' => $items,
            'item_count' => count($items),
        ], 'Wishlist merged successfully.');
    }

    /**
     * List all past orders belonging to the authenticated customer.
     * GET /api/v1/customer/orders
     */
    public function getOrders(): void
    {
        $user = RequestContext::getUser();
        if ($user === null) {
            Response::error('Unauthenticated.', 401, 'UNAUTHENTICATED');
        }

        $userId = (int) $user['id'];

        $orders = $this->db->fetchAll(
            "SELECT `id`, `order_number`, `order_status`, `payment_status`, `currency`,
                    `subtotal`, `discount_amount`, `shipping_fee`, `grand_total`,
                    `shipping_address_snapshot`, `created_at`, `updated_at`
             FROM `orders`
             WHERE `user_id` = ?
             ORDER BY `id` DESC",
            'i',
            [$userId]
        );

        foreach ($orders as &$order) {
            $orderId = (int) $order['id'];
            $items = $this->db->fetchAll(
                "SELECT `id`, `product_id`, `variant_id`, `item_name`, `sku`, `unit_price`, `quantity`, `line_total`, `variant_options`
                 FROM `order_items` WHERE `order_id` = ?",
                'i',
                [$orderId]
            );

            foreach ($items as &$item) {
                $item['variant_options'] = is_string($item['variant_options'])
                    ? json_decode($item['variant_options'], true)
                    : $item['variant_options'];
                $item['unit_price'] = (float) $item['unit_price'];
                $item['line_total'] = (float) $item['line_total'];
            }

            $order['shipping_address_snapshot'] = is_string($order['shipping_address_snapshot'])
                ? json_decode($order['shipping_address_snapshot'], true)
                : $order['shipping_address_snapshot'];

            $order['subtotal'] = (float) $order['subtotal'];
            $order['discount_amount'] = (float) $order['discount_amount'];
            $order['shipping_fee'] = (float) $order['shipping_fee'];
            $order['grand_total'] = (float) $order['grand_total'];
            $order['items'] = $items;
            $order['items_count'] = count($items);

            $shipment = $this->db->fetchOne(
                "SELECT `carrier`, `tracking_number`, `tracking_url`, `status`, `shipped_at`, `delivered_at`
                 FROM `shipments` WHERE `order_id` = ? ORDER BY `id` DESC LIMIT 1",
                'i',
                [$orderId]
            );
            $order['shipment'] = $shipment;
        }

        Response::success($orders, 'Customer orders retrieved.');
    }
}
