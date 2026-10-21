<?php

declare(strict_types=1);

/**
 * -----------------------------------------------------------------------------
 * Shop.co E-Commerce REST API Gateway
 * Public Document Root Entry Point
 * -----------------------------------------------------------------------------
 */

$requestStartedAt = microtime(true);

// Define directory constants
define('BASE_PATH', dirname(__DIR__));
define('PUBLIC_PATH', __DIR__);

// Load PSR-4 Autoloader
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Controllers\AdminCatalogController;
use App\Controllers\AdminDataController;
use App\Controllers\AdminDashboardController;
use App\Controllers\AdminOperationsController;
use App\Controllers\AdminOrderController;
use App\Controllers\AdminZoneController;
use App\Controllers\AuthController;
use App\Controllers\CatalogController;
use App\Controllers\CheckoutController;
use App\Controllers\CustomerController;
use App\Controllers\HealthController;
use App\Controllers\PaymentWebhookController;
use App\Controllers\ReviewController;
use App\Controllers\SetupController;
use App\Middleware\AdminAuthMiddleware;
use App\Middleware\CorsMiddleware;
use App\Middleware\CustomerAuthMiddleware;
use App\Middleware\JsonBodyMiddleware;
use App\Support\Cache;
use App\Support\Response;
use App\Support\Router;
use App\Support\SlowRequestLog;

// 1. Load Environment Configuration
Env::load(BASE_PATH . '/.env');

// 2. Configure Global Error & Exception Handling
// Debug detail is never sent to clients in production, even if APP_DEBUG is left on.
$isDebug = Env::bool('APP_DEBUG', false) && !Env::isProduction();

// One clock for PHP and MySQL (Database sets the matching session time_zone).
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Africa/Lagos') ?: 'Africa/Lagos');

error_reporting(E_ALL);
// Warnings must never be echoed into JSON responses; they go to the PHP error log.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ob_start();

set_exception_handler(function (Throwable $e) use ($isDebug): void {
    $logDir = BASE_PATH . '/storage/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }

    $logMessage = sprintf(
        "[%s] %s in %s:%d\nStack Trace:\n%s\n",
        date('Y-m-d H:i:s'),
        $e->getMessage(),
        $e->getFile(),
        $e->getLine(),
        $e->getTraceAsString()
    );
    @file_put_contents($logDir . '/error.log', $logMessage, FILE_APPEND);

    $errorDetails = [];
    if ($isDebug) {
        $errorDetails = [
            'exception' => get_class($e),
            'message' => $e->getMessage(),
            'file' => basename($e->getFile()),
            'line' => $e->getLine(),
        ];
    }

    Response::error(
        $isDebug ? $e->getMessage() : 'An internal server error occurred. Please try again later.',
        500,
        'INTERNAL_SERVER_ERROR',
        $errorDetails
    );
});

// 3. Handle CORS Allowlist & Browser Preflight
CorsMiddleware::handle();

// 4. Validate Content-Type and Parse JSON Body on Mutating Requests
JsonBodyMiddleware::handle();

// 5. Initialize Router and Define Base Routes
$router = new Router();

// Health Check Endpoint
$router->get('/api/v1/health', [HealthController::class, 'check']);

// --- First-Run Admin Onboarding Routes ---
$router->get('/api/v1/setup/status', [SetupController::class, 'getStatus']);
$router->post('/api/v1/setup', [SetupController::class, 'setupStore']);

// --- Authentication Routes ---
$router->post('/api/v1/auth/register', [AuthController::class, 'register']);
$router->post('/api/v1/auth/login', [AuthController::class, 'login']);
$router->post('/api/v1/auth/logout', [AuthController::class, 'logout']);
$router->get('/api/v1/auth/me', [AuthController::class, 'me']);
$router->post('/api/v1/auth/customer/magic-link', [AuthController::class, 'requestMagicLink']);
$router->post('/api/v1/auth/customer/verify', [AuthController::class, 'verifyMagicLink']);

// --- Public Storefront Catalogue Routes ---
$router->get('/api/v1/products', [CatalogController::class, 'index']);
$router->get('/api/v1/products/{idOrSlug}', [CatalogController::class, 'show']);
$router->post('/api/v1/products/{idOrSlug}/reviews', [ReviewController::class, 'create']);
$router->get('/api/v1/categories', [CatalogController::class, 'categories']);
$router->get('/api/v1/catalog/facets', [CatalogController::class, 'facets']);
$router->get('/api/v1/storefront/homepage', [CatalogController::class, 'homepage']);

// --- Checkout, Shipping & Order Placement Routes ---
$router->get('/api/v1/checkout/payment-methods', [CheckoutController::class, 'paymentMethods']);
$router->post('/api/v1/checkout/quote', [CheckoutController::class, 'quote']);
$router->post('/api/v1/checkout/cart-check', [CheckoutController::class, 'cartCheck']);
$router->post('/api/v1/checkout/validate-promo', [CheckoutController::class, 'validatePromo']);
$router->post('/api/v1/checkout/orders', [CheckoutController::class, 'createOrder']);
$router->get('/api/v1/checkout/shipping-zones', [CheckoutController::class, 'shippingZones']);
$router->get('/api/v1/checkout/orders/{orderNumber}', [CheckoutController::class, 'show']);
$router->post('/api/v1/checkout/orders/{orderNumber}/initialize-payment', [CheckoutController::class, 'initializePayment']);
$router->get('/api/v1/checkout/orders/{orderNumber}/verify-payment', [CheckoutController::class, 'verifyPayment']);
$router->post('/api/v1/checkout/orders/{orderNumber}/payment-sent', [CheckoutController::class, 'markPaymentSent']);

// --- Payment Webhook Routes ---
$router->post('/api/v1/webhooks/kora', [PaymentWebhookController::class, 'handleKora']);
$router->post('/api/v1/webhooks/monnify', [PaymentWebhookController::class, 'handleMonnify']);

// --- Protected Customer Routes ---
$customerGuard = [[CustomerAuthMiddleware::class, 'handle']];

$router->get('/api/v1/customer/profile', [CustomerController::class, 'getProfile'], $customerGuard);
$router->put('/api/v1/customer/profile', [CustomerController::class, 'updateProfile'], $customerGuard);
$router->get('/api/v1/customer/addresses', [CustomerController::class, 'getAddresses'], $customerGuard);
$router->post('/api/v1/customer/addresses', [CustomerController::class, 'createAddress'], $customerGuard);
$router->put('/api/v1/customer/addresses/{id}', [CustomerController::class, 'updateAddress'], $customerGuard);
$router->delete('/api/v1/customer/addresses/{id}', [CustomerController::class, 'deleteAddress'], $customerGuard);
$router->post('/api/v1/customer/addresses/{id}/default', [CustomerController::class, 'setDefaultAddress'], $customerGuard);
$router->get('/api/v1/customer/cart', [CustomerController::class, 'getCart'], $customerGuard);
$router->put('/api/v1/customer/cart', [CustomerController::class, 'replaceCart'], $customerGuard);
$router->get('/api/v1/customer/wishlist', [CustomerController::class, 'getWishlist'], $customerGuard);
$router->put('/api/v1/customer/wishlist', [CustomerController::class, 'replaceWishlist'], $customerGuard);
$router->get('/api/v1/customer/orders', [CustomerController::class, 'getOrders'], $customerGuard);

// --- Protected Admin Routes ---
$adminGuard = [[AdminAuthMiddleware::class, 'handle']];

$router->get('/api/v1/admin/products', [AdminCatalogController::class, 'index'], $adminGuard);
$router->post('/api/v1/admin/products', [AdminCatalogController::class, 'createProduct'], $adminGuard);
$router->put('/api/v1/admin/products/{id}', [AdminCatalogController::class, 'updateProduct'], $adminGuard);
$router->patch('/api/v1/admin/products/{id}/status', [AdminCatalogController::class, 'updateStatus'], $adminGuard);
$router->post('/api/v1/admin/products/{id}/digital', [AdminCatalogController::class, 'attachDigitalDeliverable'], $adminGuard);
$router->delete('/api/v1/admin/products/{id}', [AdminCatalogController::class, 'deleteProduct'], $adminGuard);
$router->post('/api/v1/admin/inventory/adjust', [AdminCatalogController::class, 'adjustInventory'], $adminGuard);
$router->post('/api/v1/admin/upload-image', [AdminCatalogController::class, 'uploadImage'], $adminGuard);

$router->get('/api/v1/admin/categories', [AdminCatalogController::class, 'listCategories'], $adminGuard);
$router->post('/api/v1/admin/categories', [AdminCatalogController::class, 'createCategory'], $adminGuard);
$router->put('/api/v1/admin/categories/{id}', [AdminCatalogController::class, 'updateCategory'], $adminGuard);
$router->delete('/api/v1/admin/categories/{id}', [AdminCatalogController::class, 'deleteCategory'], $adminGuard);

$router->get('/api/v1/admin/shipping-zones', [AdminZoneController::class, 'index'], $adminGuard);
$router->get('/api/v1/admin/shipping-zones/{id}', [AdminZoneController::class, 'show'], $adminGuard);
$router->post('/api/v1/admin/shipping-zones', [AdminZoneController::class, 'create'], $adminGuard);
$router->put('/api/v1/admin/shipping-zones/{id}', [AdminZoneController::class, 'update'], $adminGuard);
$router->delete('/api/v1/admin/shipping-zones/{id}', [AdminZoneController::class, 'delete'], $adminGuard);

// --- Public Newsletter Subscription ---
$router->post('/api/v1/newsletter/subscribe', [AdminOperationsController::class, 'subscribeNewsletter']);
$router->post('/api/v1/newsletter/unsubscribe', [AdminOperationsController::class, 'unsubscribeNewsletter']);

// --- Admin Order & Physical Fulfillment Routes ---
$router->get('/api/v1/admin/orders', [AdminOrderController::class, 'index'], $adminGuard);
$router->get('/api/v1/admin/orders/{idOrNumber}', [AdminOrderController::class, 'show'], $adminGuard);
$router->patch('/api/v1/admin/orders/{idOrNumber}/status', [AdminOrderController::class, 'updateStatus'], $adminGuard);
$router->post('/api/v1/admin/orders/{idOrNumber}/confirm-payment', [AdminOrderController::class, 'confirmPayment'], $adminGuard);
$router->post('/api/v1/admin/orders/{idOrNumber}/shipment', [AdminOrderController::class, 'assignShipment'], $adminGuard);
$router->post('/api/v1/admin/orders/{idOrNumber}/delivered', [AdminOrderController::class, 'confirmDelivery'], $adminGuard);

// --- Admin Dashboard & Real Analytics Routes ---
$router->get('/api/v1/admin/dashboard/overview', [AdminDashboardController::class, 'overview'], $adminGuard);
$router->get('/api/v1/admin/analytics/report', [AdminDashboardController::class, 'analyticsReport'], $adminGuard);
$router->get('/api/v1/admin/analytics/export', [AdminDashboardController::class, 'exportCsv'], $adminGuard);
$router->get('/api/v1/admin/orders/export', [AdminDashboardController::class, 'exportOrdersCsv'], $adminGuard);

// --- Admin Operations & Management (18 Domains) ---
$router->get('/api/v1/admin/inventory', [AdminOperationsController::class, 'getInventory'], $adminGuard);
$router->get('/api/v1/admin/inventory/logs', [AdminOperationsController::class, 'getInventoryLogs'], $adminGuard);

$router->get('/api/v1/admin/customers', [AdminOperationsController::class, 'listCustomers'], $adminGuard);
$router->get('/api/v1/admin/customers/{id}', [AdminOperationsController::class, 'getCustomerDetail'], $adminGuard);
$router->patch('/api/v1/admin/customers/{id}/status', [AdminOperationsController::class, 'updateCustomerStatus'], $adminGuard);

$router->get('/api/v1/admin/payments', [AdminOperationsController::class, 'listPayments'], $adminGuard);

$router->get('/api/v1/admin/refunds', [AdminOperationsController::class, 'listRefunds'], $adminGuard);
$router->get('/api/v1/admin/refunds/eligibility', [AdminOperationsController::class, 'refundEligibility'], $adminGuard);
$router->post('/api/v1/admin/refunds', [AdminOperationsController::class, 'createRefund'], $adminGuard);
$router->patch('/api/v1/admin/refunds/{id}', [AdminOperationsController::class, 'resolveRefund'], $adminGuard);

$router->get('/api/v1/admin/promotions', [AdminOperationsController::class, 'listPromotions'], $adminGuard);
$router->post('/api/v1/admin/promotions', [AdminOperationsController::class, 'createPromotion'], $adminGuard);
$router->put('/api/v1/admin/promotions/{id}', [AdminOperationsController::class, 'updatePromotion'], $adminGuard);
$router->delete('/api/v1/admin/promotions/{id}', [AdminOperationsController::class, 'deletePromotion'], $adminGuard);

$router->get('/api/v1/admin/storefront/banners', [AdminOperationsController::class, 'listBanners'], $adminGuard);
$router->post('/api/v1/admin/storefront/banners', [AdminOperationsController::class, 'createBanner'], $adminGuard);
$router->put('/api/v1/admin/storefront/banners/{id}', [AdminOperationsController::class, 'updateBanner'], $adminGuard);
$router->delete('/api/v1/admin/storefront/banners/{id}', [AdminOperationsController::class, 'deleteBanner'], $adminGuard);

$router->get('/api/v1/admin/storefront/reviews', [AdminOperationsController::class, 'listReviews'], $adminGuard);
$router->patch('/api/v1/admin/storefront/reviews/{id}/status', [AdminOperationsController::class, 'updateReviewStatus'], $adminGuard);

$router->get('/api/v1/admin/notifications/outbox', [AdminOperationsController::class, 'listOutbox'], $adminGuard);
$router->post('/api/v1/admin/notifications/outbox/process', [AdminOperationsController::class, 'processOutbox'], $adminGuard);
$router->post('/api/v1/admin/notifications/outbox/{id}/retry', [AdminOperationsController::class, 'retryOutbox'], $adminGuard);

$router->get('/api/v1/admin/audit-logs', [AdminOperationsController::class, 'listAuditLogs'], $adminGuard);

$router->get('/api/v1/admin/settings', [AdminOperationsController::class, 'getSettings'], $adminGuard);
$router->put('/api/v1/admin/settings', [AdminOperationsController::class, 'updateSettings'], $adminGuard);
$router->put('/api/v1/admin/settings/payment-methods', [AdminOperationsController::class, 'updatePaymentMethods'], $adminGuard);

$router->get('/api/v1/admin/system-status', [AdminOperationsController::class, 'getSystemStatus'], $adminGuard);

$router->get('/api/v1/admin/data', [AdminDataController::class, 'overview'], $adminGuard);
$router->get('/api/v1/admin/data/alert', [AdminDataController::class, 'alert'], $adminGuard);
$router->put('/api/v1/admin/data/settings', [AdminDataController::class, 'updateSettings'], $adminGuard);
$router->post('/api/v1/admin/data/cleanup', [AdminDataController::class, 'runCleanup'], $adminGuard);

$router->get('/api/v1/admin/marketing/subscribers', [AdminOperationsController::class, 'listMarketingSubscribers'], $adminGuard);
$router->post('/api/v1/admin/marketing/broadcast', [AdminOperationsController::class, 'sendMarketingBroadcast'], $adminGuard);

$router->get('/api/v1/admin/account', [AdminOperationsController::class, 'getAdminAccount'], $adminGuard);
$router->put('/api/v1/admin/account', [AdminOperationsController::class, 'updateAdminAccount'], $adminGuard);

// Admin changes (products, categories, banners, reviews, settings...) clear the public
// catalogue cache once the request has finished, so the store shows them straight away.
$requestMethod = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (!in_array($requestMethod, ['GET', 'HEAD', 'OPTIONS'], true) && str_starts_with($requestPath, '/api/v1/admin/')) {
    register_shutdown_function([Cache::class, 'bumpCatalog']);
}

// Slow page loads and checkout calls are counted for the storage health alert. CSV exports
// and admin changes (uploads, sending email) are slow by nature and are left out.
$isExport = str_ends_with($requestPath, '/export');
if (($requestMethod === 'GET' && !$isExport) || ($requestMethod === 'POST' && str_starts_with($requestPath, '/api/v1/checkout/'))) {
    register_shutdown_function(static function () use ($requestMethod, $requestStartedAt): void {
        SlowRequestLog::record($requestMethod, Router::$matchedRoute, $requestStartedAt);
    });
}

// 6. Dispatch Request
$router->dispatch();
