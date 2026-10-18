<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database\Database;
use App\Repositories\CategoryRepository;
use App\Repositories\ProductRepository;
use App\Services\CheckoutService;
use App\Support\Cache;
use App\Support\Response;

/**
 * Public Storefront Catalogue Controller.
 * Delivers product listings, dynamic filters, detail pages, categories, and homepage aggregates.
 */
class CatalogController
{
    private ProductRepository $productRepo;
    private CategoryRepository $categoryRepo;

    public function __construct()
    {
        $this->productRepo = new ProductRepository();
        $this->categoryRepo = new CategoryRepository();
    }

    /**
     * GET /api/v1/products
     * Filterable, searchable, and paginated product catalogue.
     */
    public function index(): void
    {
        $filters = [
            'category' => $_GET['category'] ?? $_GET['cat'] ?? null,
            'search' => $_GET['search'] ?? $_GET['q'] ?? null,
            'min_price' => $_GET['min_price'] ?? null,
            'max_price' => $_GET['max_price'] ?? null,
            'dress_style' => $_GET['dress_style'] ?? $_GET['style'] ?? null,
            'color' => $_GET['color'] ?? null,
            'colors' => $_GET['colors'] ?? null,
            'size' => $_GET['size'] ?? null,
            'sizes' => $_GET['sizes'] ?? null,
            'on_sale' => !empty($_GET['on_sale']) || !empty($_GET['onSale']),
            'is_featured' => !empty($_GET['is_featured']) || !empty($_GET['featured']),
            'is_flash_deal' => !empty($_GET['flash_deals']) || !empty($_GET['flashDeals']),
            'product_type' => 'physical',
            'sort' => $_GET['sort'] ?? (!empty($_GET['topSelling']) ? 'best_selling' : 'newest'),
        ];

        $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
        $perPage = isset($_GET['per_page']) ? (int) $_GET['per_page'] : (isset($_GET['limit']) ? (int) $_GET['limit'] : 12);

        // Browsing pages are the same for every visitor; searches vary too much to be worth keeping.
        $load = fn (): array => $this->productRepo->listPublished($filters, $page, $perPage);
        $result = empty($filters['search'])
            ? Cache::remember('products:' . json_encode([$filters, $page, $perPage]), $load)
            : $load();
        Response::cachePublic(30, 120);

        Response::success(
            $result['items'],
            'Products retrieved successfully.',
            200,
            [
                'total' => $result['total'],
                'page' => $result['page'],
                'per_page' => $result['per_page'],
                'total_pages' => $result['total_pages'],
            ]
        );
    }

    /**
     * GET /api/v1/products/{idOrSlug}
     * Full product details including images, variants, and public availability.
     */
    public function show(array $params): void
    {
        $idOrSlug = $params['idOrSlug'] ?? '';
        if (trim($idOrSlug) === '') {
            Response::error('Product identifier is required.', 400, 'BAD_REQUEST');
        }

        $product = $this->productRepo->findDetail($idOrSlug);
        if (!$product) {
            Response::error(
                sprintf("Product '%s' not found or is no longer published.", $idOrSlug),
                404,
                'RESOURCE_NOT_FOUND'
            );
        }

        $product['reviews'] = $this->productRepo->approvedReviews((int) $product['id']);

        // Stock changes often: browsers re-check every time, but get "not modified" when it hasn't.
        Response::cachePublic(0);

        Response::success($product, 'Product details retrieved successfully.');
    }

    /**
     * GET /api/v1/catalog/facets
     * Filter options (categories, colours, sizes, styles, price range) that exist in the catalogue.
     */
    public function facets(): void
    {
        $facets = Cache::remember('facets', function (): array {
            $facets = $this->productRepo->facets();
            $facets['categories'] = $this->categoryRepo->getAllActive();
            return $facets;
        }, 10); // Only admin changes affect these (and they clear the cache).
        Response::cachePublic(60, 300);

        Response::success($facets, 'Catalogue filter options retrieved.');
    }

    /**
     * GET /api/v1/categories
     * List all active categories with product counts.
     */
    public function categories(): void
    {
        $categories = Cache::remember('categories', fn (): array => $this->categoryRepo->getAllActive(), 10);
        Response::cachePublic(60, 300);
        Response::success($categories, 'Categories retrieved successfully.');
    }

    /**
     * GET /api/v1/storefront/homepage
     * Single aggregated payload for fast homepage hydration.
     */
    public function homepage(): void
    {
        $payload = Cache::remember('homepage', fn (): array => $this->homepagePayload());
        Response::cachePublic(60, 300);
        Response::success($payload, 'Storefront homepage payload retrieved successfully.');
    }

    private function homepagePayload(): array
    {
        $featured = $this->productRepo->getFeatured(4);
        $flashDeals = $this->productRepo->getFlashDeals(4);
        $newArrivals = $this->productRepo->getNewArrivals(4);
        $topSelling = $this->productRepo->getTopSelling(4);
        $categories = $this->categoryRepo->getAllActive();

        // Active promotions (validated by date and max_uses) and banners
        $db = Database::getInstance();
        $promotions = $db->fetchAll(
            "SELECT code, description, discount_percent FROM promotions 
             WHERE is_active = 1 
               AND (starts_at IS NULL OR starts_at <= NOW()) 
               AND (expires_at IS NULL OR expires_at >= NOW()) 
               AND (max_uses <= 0 OR used_count < max_uses)
             ORDER BY id DESC LIMIT 5"
        );
        $banners = $db->fetchAll(
            "SELECT id, title, subtitle, cta_text, cta_url, image_url, display_order FROM banners 
             WHERE is_active = 1 ORDER BY display_order ASC, id ASC LIMIT 5"
        );

        // Approved customer testimonials
        $reviews = $db->fetchAll(
            "SELECT r.id, r.product_id, r.rating, r.title, r.comment, r.created_at, 
                    r.author_name as author, r.is_verified_purchase as verified, 
                    p.name as product_name
             FROM reviews r
             LEFT JOIN products p ON p.id = r.product_id
             WHERE r.status = 'approved'
             ORDER BY r.created_at DESC LIMIT 10"
        );

        // Real counts only (shown on the homepage instead of invented marketing numbers).
        $zones = $db->fetchAll("SELECT `states_covered` FROM `shipping_zones` WHERE `is_active` = 1");
        $served = [];
        foreach ($zones as $z) {
            foreach ((array) json_decode((string) $z['states_covered'], true) as $state) {
                $served[$state === '*' ? '*' : (CheckoutService::canonicalState((string) $state) ?? '')] = true;
            }
        }
        unset($served['']);
        $stats = [
            'published_products' => (int) ($db->fetchOne("SELECT COUNT(*) AS c FROM `products` WHERE `status` = 'published' AND `product_type` = 'physical'")['c'] ?? 0),
            'categories' => count($categories),
            'states_served' => isset($served['*']) ? count(CheckoutService::NIGERIAN_STATES) : count($served),
        ];

        // The soonest real end time among the flash deals shown (null = no countdown).
        $flashEnds = array_filter(array_column($flashDeals, 'flash_deal_ends_at'));
        sort($flashEnds);

        return [
            'stats' => $stats,
            'flash_deals_end_at' => $flashEnds[0] ?? null,
            'featured_products' => $featured,
            'flash_deals' => $flashDeals,
            'new_arrivals' => $newArrivals,
            'top_selling' => $topSelling,
            'categories' => $categories,
            'promotions' => $promotions,
            'banners' => $banners,
            'reviews' => $reviews,
        ];
    }
}
