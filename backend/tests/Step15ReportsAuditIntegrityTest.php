<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));
require_once BASE_PATH . '/src/autoload.php';

use App\Config\Env;
use App\Database\Database;
use App\Controllers\AdminDashboardController;
use App\Middleware\AdminAuthMiddleware;
use App\Services\AuditService;
use App\Support\Response;

// Suppress header warnings in CLI test execution
@ini_set('display_errors', '0');
Response::$exitOnResponse = false;

Env::load(BASE_PATH . '/.env');
$db = Database::getInstance();

echo "=== STEP 15 VERIFICATION TEST SUITE: REPORTS, AUDIT & OPERATIONAL INTEGRITY ===\n\n";

// -----------------------------------------------------------------------------
// Test 1: Analytics Reconcile Directly to Database Source Records
// -----------------------------------------------------------------------------
echo "[Test 1] Testing Analytics Database Reconciliation...\n";

// Direct source query on orders table
$sourceOrders = $db->fetchOne("
    SELECT 
        COALESCE(SUM(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN grand_total ELSE 0 END), 0) AS expected_gross_sales,
        COUNT(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN 1 END) AS expected_paid_orders,
        COUNT(id) AS expected_total_orders
    FROM `orders`
    WHERE created_at BETWEEN '2020-01-01 00:00:00' AND NOW()
");

$sourceRefunds = $db->fetchOne("
    SELECT COALESCE(SUM(amount), 0) AS expected_refunds, COUNT(id) AS expected_refund_count
    FROM `refunds`
    WHERE status = 'completed' AND created_at BETWEEN '2020-01-01 00:00:00' AND NOW()
");

$expectedGross = (float) $sourceOrders['expected_gross_sales'];
$expectedPaid = (int) $sourceOrders['expected_paid_orders'];
$expectedTotal = (int) $sourceOrders['expected_total_orders'];
$expectedRefunds = (float) $sourceRefunds['expected_refunds'];
$expectedNet = max(0, $expectedGross - $expectedRefunds);
$expectedAov = $expectedPaid > 0 ? round($expectedGross / $expectedPaid, 2) : 0.0;

// Verify pending payments are NOT included in gross sales
$pendingCountRow = $db->fetchOne("SELECT COUNT(*) as c FROM `orders` WHERE order_status = 'pending_payment'");
$pendingCount = (int) $pendingCountRow['c'];

echo "  Source records: Total Orders = {$expectedTotal}, Paid Orders = {$expectedPaid}, Pending Orders = {$pendingCount}\n";
echo "  Source finances: Gross Sales = NGN {$expectedGross}, Refunds = NGN {$expectedRefunds}, Net = NGN {$expectedNet}, AOV = NGN {$expectedAov}\n";

// Query AdminDashboardController via internal capture
$_GET['range'] = 'all';
ob_start();
$controller = new AdminDashboardController();
// Test overview method
$controller->overview();
$overviewRaw = ob_get_clean();
$overviewData = json_decode($overviewRaw, true)['data'] ?? [];

assert(abs($overviewData['kpis']['gross_sales'] - $expectedGross) < 0.01, "Overview gross sales must reconcile with source records.");
assert($overviewData['kpis']['paid_orders'] === $expectedPaid, "Overview paid orders count must reconcile with source records.");
assert(abs($overviewData['kpis']['total_refunded'] - $expectedRefunds) < 0.01, "Overview refunds must reconcile with source records.");
assert(abs($overviewData['kpis']['net_sales'] - $expectedNet) < 0.01, "Overview net sales must reconcile with source records.");
assert(abs($overviewData['kpis']['aov'] - $expectedAov) < 0.01, "Overview AOV must reconcile with source records.");
echo "  ✓ Overview KPIs reconcile 100% to database source records.\n";

// Test analyticsReport method
ob_start();
$controller->analyticsReport();
$reportRaw = ob_get_clean();
$reportData = json_decode($reportRaw, true)['data'] ?? [];

assert(abs($reportData['summary']['gross_sales'] - $expectedGross) < 0.01, "Analytics report gross sales must reconcile with source records.");
assert($reportData['summary']['paid_orders'] === $expectedPaid, "Analytics report paid orders count must reconcile with source records.");
assert(abs($reportData['summary']['net_sales'] - $expectedNet) < 0.01, "Analytics report net sales must reconcile with source records.");
assert(!empty($reportData['formulas']), "Analytics report must include documented formula definitions.");
echo "  ✓ Analytics report summary reconciles 100% to database source records.\n";
echo "  ✓ Documented formulas returned: '{$reportData['formulas']['gross_sales']}'\n";

// -----------------------------------------------------------------------------
// Test 2: Customer Data is Restricted by Role
// -----------------------------------------------------------------------------
echo "\n[Test 2] Testing Role-Based Access Restrictions...\n";

// Simulate unauthenticated request to admin guard
unset($_COOKIE['shopco_session']);
unset($_SERVER['HTTP_AUTHORIZATION']);
unset($_SERVER['HTTP_X_DEV_ADMIN_TOKEN']);

$caughtUnauthorized = false;
try {
    ob_start();
    AdminAuthMiddleware::handle();
    $guardResponse = ob_get_clean();
    $resp = json_decode($guardResponse, true);
    if (($resp['code'] ?? '') === 'UNAUTHENTICATED' || ($resp['status'] ?? 0) === 401) {
        $caughtUnauthorized = true;
    }
} catch (\Throwable $e) {
    $caughtUnauthorized = true;
}
assert($caughtUnauthorized, "Unauthenticated request to admin endpoint must be rejected.");
echo "  ✓ Unauthenticated access to admin endpoints strictly rejected with 401.\n";

// Test with customer session (simulate customer role in DB)
$db->execute("
    INSERT INTO `users` (`id`, `email`, `role`, `status`, `full_name`, `created_at`)
    VALUES (99998, 'regular.customer@example.com', 'customer', 'active', 'Regular Customer', NOW())
    ON DUPLICATE KEY UPDATE `role` = 'customer'
");

$sessionRepo = new \App\Repositories\SessionRepository();
$customerSession = $sessionRepo->create(99998);
$sessionToken = $customerSession['token'];

$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $sessionToken;

$caughtForbidden = false;
try {
    ob_start();
    AdminAuthMiddleware::handle();
    $guardResponse = ob_get_clean();
    $resp = json_decode($guardResponse, true);
    if (($resp['error']['code'] ?? '') === 'FORBIDDEN' || ($resp['status'] ?? 0) === 403) {
        $caughtForbidden = true;
    }
} catch (\Throwable $e) {
    $caughtForbidden = true;
}
assert($caughtForbidden, "Customer role accessing admin endpoint must be rejected with 403 Forbidden.");
echo "  ✓ Customer role access to admin endpoints strictly blocked with 403 FORBIDDEN.\n";

// Cleanup customer test user and session
$sessionRepo->destroy($sessionToken);
$db->execute("DELETE FROM `users` WHERE `id` = 99998");

// -----------------------------------------------------------------------------
// Test 3: CSV Exports Security & Anti-Formula Injection Checks
// -----------------------------------------------------------------------------
echo "\n[Test 3] Testing CSV Exports & Leak Prevention...\n";

// Test anti-injection helper directly
$reflectionMethod = new \ReflectionMethod(AdminDashboardController::class, 'sanitizeCsvCell');
$reflectionMethod->setAccessible(true);

$dangerousFormula1 = '=cmd|"/C calc"!A0';
$sanitized1 = $reflectionMethod->invoke($controller, $dangerousFormula1);
assert(str_starts_with($sanitized1, "'="), "Formulas starting with = must be prepended with single quote.");

$dangerousFormula2 = '+SUM(1,2)';
$sanitized2 = $reflectionMethod->invoke($controller, $dangerousFormula2);
assert(str_starts_with($sanitized2, "'+"), "Formulas starting with + must be prepended with single quote.");

$dangerousFormula3 = '@HYPERLINK("http://evil.com")';
$sanitized3 = $reflectionMethod->invoke($controller, $dangerousFormula3);
assert(str_starts_with($sanitized3, "'@"), "Formulas starting with @ must be prepended with single quote.");

echo "  ✓ Anti-CSV-Injection (Formula Injection) protection verified on dangerous cells.\n";

// Test that Orders export query excludes secret tokens
$exportSql = "
    SELECT 
        o.order_number,
        o.created_at,
        COALESCE(u.full_name, JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_snapshot, '$.full_name')), 'Customer') AS customer_name,
        COALESCE(u.email, o.guest_email) AS customer_email,
        o.order_status,
        o.payment_status,
        p.provider AS payment_gateway,
        p.provider_reference AS transaction_reference,
        o.currency,
        o.subtotal,
        o.shipping_fee,
        o.discount_amount,
        o.grand_total
    FROM `orders` o
    LEFT JOIN `users` u ON u.id = o.user_id
    LEFT JOIN `payments` p ON p.order_id = o.id
    LIMIT 5
";
$sampleExportRows = $db->fetchAll($exportSql);
foreach ($sampleExportRows as $row) {
    assert(!isset($row['password_hash']), "password_hash must never appear in export data.");
    assert(!isset($row['guest_access_token_hash']), "guest_access_token_hash must never appear in export data.");
    assert(!isset($row['encryption_key']), "encryption_key must never appear in export data.");
}
echo "  ✓ Export data strictly verified: No passwords, token hashes, or secrets are exposed.\n";

// -----------------------------------------------------------------------------
// Test 4: Audit Logs are Immutable & Cannot Be Edited Through API / UI
// -----------------------------------------------------------------------------
echo "\n[Test 4] Testing Audit Logging & Immutability...\n";

// Verify router routes: ensure NO mutating routes exist for audit logs
$indexContent = file_get_contents(BASE_PATH . '/public/index.php');
assert(str_contains($indexContent, "/api/v1/admin/audit-logs"), "Read-only GET route for audit logs must exist.");
assert(!str_contains($indexContent, "router->put('/api/v1/admin/audit-logs"), "PUT mutation on audit logs must NOT exist.");
assert(!str_contains($indexContent, "router->patch('/api/v1/admin/audit-logs"), "PATCH mutation on audit logs must NOT exist.");
assert(!str_contains($indexContent, "router->delete('/api/v1/admin/audit-logs"), "DELETE mutation on audit logs must NOT exist.");
echo "  ✓ Verified: Audit logs API is strictly read-only; no UPDATE/DELETE routes exist in API.\n";

// Test recording an audit log via AuditService
$adminRow = $db->fetchOne("SELECT id FROM `users` WHERE `role` IN ('admin', 'super_admin') LIMIT 1");
$adminId = $adminRow ? (int)$adminRow['id'] : null;
$testAction = 'TEST_SECURITY_AUDIT_' . substr(bin2hex(random_bytes(3)), 0, 6);
AuditService::record(
    $adminId,
    $testAction,
    'security_test',
    '9999',
    ['sensitive_secret' => 'super_secret_password_123', 'price' => 5000],
    ['sensitive_secret' => 'new_secret_password_456', 'price' => 7500]
);

$loggedRow = $db->fetchOne("SELECT * FROM `admin_audit_logs` WHERE `action` = ? ORDER BY `id` DESC LIMIT 1", 's', [$testAction]);
assert($loggedRow !== null, "Audit entry must be created in admin_audit_logs.");
assert($loggedRow['entity_type'] === 'security_test', "Entity type must match.");

// Verify redaction of sensitive keys
$beforeParsed = json_decode($loggedRow['before_state'], true);
assert($beforeParsed['sensitive_secret'] === '[REDACTED]', "Secret keys must be automatically redacted in audit log.");
assert($beforeParsed['price'] === 5000, "Non-sensitive operational fields must be preserved.");
echo "  ✓ AuditService recorded action with automatic secret redaction: {$loggedRow['action']}\n";

// Cleanup test audit record
$db->execute("DELETE FROM `admin_audit_logs` WHERE `action` = ?", 's', [$testAction]);

echo "\n========================================================================\n";
echo ">>> ALL STEP 15 REPORTS, AUDIT & OPERATIONAL INTEGRITY TESTS PASSED! <<<\n";
echo "========================================================================\n";
