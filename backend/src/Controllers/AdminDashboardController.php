<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database\Database;
use App\Services\FulfillmentService;
use App\Support\Response;

/**
 * Controller providing real, database-derived admin KPIs, trends, analytical reports,
 * and authenticated CSV exports.
 * Strict rule: Never count pending or failed payments as completed sales.
 */
class AdminDashboardController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /** Payment rows that represent money actually received (later refunds are subtracted separately). */
    private const RECEIVED_PAYMENT_STATUSES = "'successful', 'partially_refunded', 'refunded'";

    /**
     * GET /api/v1/admin/dashboard/overview?period=7|30|90
     *
     * Sales are verified payments (by verification time) in the period; net sales subtract refunds
     * completed in the period. Each KPI is compared with the period of the same length immediately before.
     * Operational counts (fulfilment queue, attention, stock) are current snapshots.
     */
    public function overview(): void
    {
        // Release stock from abandoned orders first so the stock and queue numbers are current.
        try {
            (new FulfillmentService($this->db))->expireOverdueOrders(50);
        } catch (\Throwable $e) {
            error_log('[Order Expiry Sweep] ' . $e->getMessage());
        }

        $period = (int) ($_GET['period'] ?? 30);
        if (!in_array($period, [7, 30, 90], true)) {
            $period = 30;
        }
        $currentStart = date('Y-m-d 00:00:00', strtotime('-' . ($period - 1) . ' days'));
        $now = date('Y-m-d H:i:s');
        $previousStart = date('Y-m-d 00:00:00', strtotime('-' . (2 * $period - 1) . ' days'));

        $current = $this->periodTotals($currentStart, $now);
        $previous = $this->periodTotals($previousStart, $currentStart);

        $delta = static function (float $now, float $before): ?float {
            if ($before <= 0) {
                return null; // No baseline: the UI shows no comparison instead of a made-up percentage.
            }
            return round((($now - $before) / $before) * 100, 1);
        };

        $count = fn (string $sql): int => (int) ($this->db->fetchOne($sql)['c'] ?? 0);
        $stock = $this->db->fetchOne(
            "SELECT COALESCE(SUM(v.stock_quantity > 0 AND v.stock_quantity <= v.low_stock_threshold), 0) AS low_stock,
                    COALESCE(SUM(v.stock_quantity = 0), 0) AS out_of_stock
             FROM `product_variants` v JOIN `products` p ON p.id = v.product_id
             WHERE v.is_active = 1 AND p.status <> 'archived'"
        );

        // Daily trend across the selected period.
        $salesByDay = array_column($this->db->fetchAll(
            "SELECT DATE(verified_at) AS d, SUM(amount) AS sales, COUNT(DISTINCT order_id) AS paid_orders
             FROM `payments`
             WHERE status IN (" . self::RECEIVED_PAYMENT_STATUSES . ") AND verified_at >= ?
             GROUP BY DATE(verified_at)",
            's',
            [$currentStart]
        ), null, 'd');
        $ordersByDay = array_column($this->db->fetchAll(
            "SELECT DATE(created_at) AS d, COUNT(*) AS orders FROM `orders` WHERE created_at >= ? GROUP BY DATE(created_at)",
            's',
            [$currentStart]
        ), 'orders', 'd');

        $trend = [];
        for ($i = $period - 1; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-{$i} days"));
            $trend[] = [
                'date' => $d,
                'sales' => (float) ($salesByDay[$d]['sales'] ?? 0),
                'paid_orders' => (int) ($salesByDay[$d]['paid_orders'] ?? 0),
                'total_orders' => (int) ($ordersByDay[$d] ?? 0),
            ];
        }

        $recentOrders = $this->db->fetchAll("
            SELECT o.id, o.order_number,
                   COALESCE(u.full_name, JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_snapshot, '$.full_name'))) AS customer_name,
                   COALESCE(u.email, o.guest_email) AS customer_email,
                   o.grand_total AS total_amount, o.currency, o.order_status, o.payment_status, o.requires_attention,
                   p.provider AS payment_method, o.created_at,
                   (SELECT COALESCE(SUM(oi.quantity), 0) FROM `order_items` oi WHERE oi.order_id = o.id) AS items_count
            FROM `orders` o
            LEFT JOIN `users` u ON u.id = o.user_id
            LEFT JOIN `payments` p ON p.id = (SELECT MAX(p2.id) FROM `payments` p2 WHERE p2.order_id = o.id)
            ORDER BY o.created_at DESC
            LIMIT 8
        ");

        $attentionOrders = $this->db->fetchAll("
            SELECT o.order_number, o.order_status, o.payment_status, o.attention_reason, o.grand_total, o.updated_at
            FROM `orders` o
            WHERE o.requires_attention = 1
            ORDER BY o.updated_at DESC
            LIMIT 5
        ");

        $criticalStock = $this->db->fetchAll("
            SELECT v.id, v.sku, v.size, v.color_name, v.stock_quantity, v.low_stock_threshold,
                   p.id AS product_id, p.name AS product_name
            FROM `product_variants` v
            JOIN `products` p ON p.id = v.product_id
            WHERE v.is_active = 1 AND p.status <> 'archived' AND v.stock_quantity <= v.low_stock_threshold
            ORDER BY v.stock_quantity ASC, p.name ASC
            LIMIT 6
        ");

        $topProducts = $this->db->fetchAll(
            "SELECT p.id, p.name, p.slug,
                    SUM(oi.quantity) AS total_units_sold,
                    SUM(oi.line_total) AS total_revenue
             FROM `order_items` oi
             JOIN `products` p ON p.id = oi.product_id
             WHERE oi.order_id IN (
                 SELECT DISTINCT order_id FROM `payments`
                 WHERE status IN (" . self::RECEIVED_PAYMENT_STATUSES . ") AND verified_at >= ?
             )
             GROUP BY p.id, p.name, p.slug
             ORDER BY total_units_sold DESC, total_revenue DESC
             LIMIT 5",
            's',
            [$currentStart]
        );

        // Failed attempts in the last day, and gateway attempts still unconfirmed after 30 minutes
        // on orders that are still open.
        $paymentAlerts = $this->db->fetchAll("
            SELECT p.id, p.provider_reference AS payment_reference, o.order_number, p.provider AS gateway,
                   p.amount, p.status, p.created_at
            FROM `payments` p
            JOIN `orders` o ON o.id = p.order_id
            WHERE (p.status = 'failed' AND p.updated_at >= DATE_SUB(NOW(), INTERVAL 1 DAY))
               OR (p.status = 'pending' AND p.provider IN ('kora', 'monnify')
                   AND p.created_at <= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
                   AND o.order_status = 'pending_payment')
            ORDER BY p.created_at DESC
            LIMIT 5
        ");

        Response::success([
            'period' => [
                'days' => $period,
                'start' => $currentStart,
                'end' => $now,
                'previous_start' => $previousStart,
            ],
            'kpis' => [
                'currency' => 'NGN',
                'gross_sales' => $current['gross'],
                'net_sales' => $current['net'],
                'total_refunded' => $current['refunded'],
                'paid_orders' => $current['paid_orders'],
                'aov' => $current['aov'],
                'total_orders' => $current['orders_placed'],
                'new_customers' => $current['new_customers'],
                'pending_fulfillment' => $count("SELECT COUNT(*) AS c FROM `orders` WHERE `order_status` IN ('paid', 'processing')"),
                'awaiting_payment' => $count("SELECT COUNT(*) AS c FROM `orders` WHERE `order_status` = 'pending_payment' AND (`expires_at` IS NULL OR `expires_at` > NOW())"),
                'needs_attention' => $count("SELECT COUNT(*) AS c FROM `orders` WHERE `requires_attention` = 1"),
                'low_stock_count' => (int) $stock['low_stock'],
                'out_of_stock_count' => (int) $stock['out_of_stock'],
                'total_customers' => $count("SELECT COUNT(*) AS c FROM `users` WHERE `role` = 'customer'"),
            ],
            'deltas' => [
                'gross_sales' => $delta($current['gross'], $previous['gross']),
                'net_sales' => $delta($current['net'], $previous['net']),
                'paid_orders' => $delta($current['paid_orders'], $previous['paid_orders']),
                'aov' => $delta($current['aov'], $previous['aov']),
                'total_orders' => $delta($current['orders_placed'], $previous['orders_placed']),
                'new_customers' => $delta($current['new_customers'], $previous['new_customers']),
            ],
            'trend' => $trend,
            'recent_orders' => $recentOrders,
            'attention_orders' => $attentionOrders,
            'critical_stock' => $criticalStock,
            'top_products' => $topProducts,
            'payment_alerts' => $paymentAlerts,
        ], 'Admin overview retrieved.');
    }

    /**
     * Money and order totals for [start, end).
     *
     * @return array{gross: float, refunded: float, net: float, paid_orders: int, aov: float, orders_placed: int, new_customers: int}
     */
    private function periodTotals(string $start, string $end): array
    {
        $sales = $this->db->fetchOne(
            "SELECT COALESCE(SUM(amount), 0) AS gross, COUNT(DISTINCT order_id) AS paid_orders
             FROM `payments`
             WHERE status IN (" . self::RECEIVED_PAYMENT_STATUSES . ") AND verified_at >= ? AND verified_at < ?",
            'ss',
            [$start, $end]
        );
        $refunded = (float) ($this->db->fetchOne(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM `refunds` WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?",
            'ss',
            [$start, $end]
        )['total'] ?? 0);
        $ordersPlaced = (int) ($this->db->fetchOne(
            "SELECT COUNT(*) AS c FROM `orders` WHERE created_at >= ? AND created_at < ?",
            'ss',
            [$start, $end]
        )['c'] ?? 0);
        $newCustomers = (int) ($this->db->fetchOne(
            "SELECT COUNT(*) AS c FROM `users` WHERE role = 'customer' AND created_at >= ? AND created_at < ?",
            'ss',
            [$start, $end]
        )['c'] ?? 0);

        $gross = round((float) $sales['gross'], 2);
        $paidOrders = (int) $sales['paid_orders'];

        return [
            'gross' => $gross,
            'refunded' => round($refunded, 2),
            'net' => round(max(0, $gross - $refunded), 2),
            'paid_orders' => $paidOrders,
            'aov' => $paidOrders > 0 ? round($gross / $paidOrders, 2) : 0.0,
            'orders_placed' => $ordersPlaced,
            'new_customers' => $newCustomers,
        ];
    }

    /**
     * Resolve date range from query parameters.
     * Supports: 'today', 'yesterday', '7days', '30days', '90days', 'year', 'all', or custom start/end.
     */
    private function resolveDateRange(): array
    {
        $range = $_GET['range'] ?? '30days';
        $startDate = $_GET['start_date'] ?? null;
        $endDate = $_GET['end_date'] ?? null;

        if (!$startDate || !$endDate) {
            switch ($range) {
                case 'today':
                    $startDate = date('Y-m-d 00:00:00');
                    $endDate = date('Y-m-d 23:59:59');
                    break;
                case 'yesterday':
                    $startDate = date('Y-m-d 00:00:00', strtotime('-1 day'));
                    $endDate = date('Y-m-d 23:59:59', strtotime('-1 day'));
                    break;
                case '7days':
                    $startDate = date('Y-m-d 00:00:00', strtotime('-7 days'));
                    $endDate = date('Y-m-d 23:59:59');
                    break;
                case '90days':
                    $startDate = date('Y-m-d 00:00:00', strtotime('-90 days'));
                    $endDate = date('Y-m-d 23:59:59');
                    break;
                case 'year':
                    $startDate = date('Y-01-01 00:00:00');
                    $endDate = date('Y-m-d 23:59:59');
                    break;
                case 'all':
                    $startDate = '2020-01-01 00:00:00';
                    $endDate = date('Y-m-d 23:59:59');
                    break;
                case '30days':
                default:
                    $startDate = date('Y-m-d 00:00:00', strtotime('-30 days'));
                    $endDate = date('Y-m-d 23:59:59');
                    break;
            }
        } else {
            // Ensure full day boundary if time omitted
            if (strlen($startDate) === 10) {
                $startDate .= ' 00:00:00';
            }
            if (strlen($endDate) === 10) {
                $endDate .= ' 23:59:59';
            }
        }

        return [$range, $startDate, $endDate];
    }

    /**
     * GET /api/v1/admin/analytics/report
     * Returns detailed analytics report with configurable date filter, documented formulas,
     * category breakdown, and gateway breakdown.
     */
    public function analyticsReport(): void
    {
        [$range, $startDate, $endDate] = $this->resolveDateRange();

        // 1. Summary metrics within date range
        $summary = $this->db->fetchOne("
            SELECT 
                COALESCE(SUM(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN grand_total ELSE 0 END), 0) AS gross_sales,
                COUNT(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN 1 END) AS paid_orders,
                COUNT(id) AS total_orders
            FROM `orders`
            WHERE created_at BETWEEN ? AND ?
        ", 'ss', [$startDate, $endDate]) ?? ['gross_sales' => 0, 'paid_orders' => 0, 'total_orders' => 0];

        $grossSales = (float) $summary['gross_sales'];
        $paidOrders = (int) $summary['paid_orders'];
        $totalOrders = (int) $summary['total_orders'];

        // 2. Refunds in date range
        $refundRow = $this->db->fetchOne("
            SELECT COALESCE(SUM(amount), 0) AS total_refunded, COUNT(id) AS refund_count
            FROM `refunds`
            WHERE status = 'completed' AND created_at BETWEEN ? AND ?
        ", 'ss', [$startDate, $endDate]) ?? ['total_refunded' => 0, 'refund_count' => 0];
        $totalRefunded = (float) $refundRow['total_refunded'];
        $refundCount = (int) $refundRow['refund_count'];

        // 3. Units Sold in date range
        $unitsRow = $this->db->fetchOne("
            SELECT COALESCE(SUM(oi.quantity), 0) AS total_units
            FROM `order_items` oi
            JOIN `orders` o ON o.id = oi.order_id
            WHERE (o.payment_status = 'successful' OR o.order_status IN ('paid', 'processing', 'shipped', 'delivered'))
              AND o.created_at BETWEEN ? AND ?
        ", 'ss', [$startDate, $endDate]) ?? ['total_units' => 0];
        $totalUnits = (int) $unitsRow['total_units'];

        // 4. Pending Fulfillment
        $pendingRow = $this->db->fetchOne("
            SELECT COUNT(*) AS total
            FROM `orders`
            WHERE `order_status` IN ('paid', 'processing')
              AND created_at BETWEEN ? AND ?
        ", 'ss', [$startDate, $endDate]) ?? ['total' => 0];
        $pendingFulfillment = (int) $pendingRow['total'];

        // Derived financial KPIs
        $aov = $paidOrders > 0 ? round($grossSales / $paidOrders, 2) : 0.0;
        $netSales = max(0, $grossSales - $totalRefunded);
        $conversionRate = $totalOrders > 0 ? round(($paidOrders / $totalOrders) * 100, 2) : 0.0;

        // 5. Repeat Customer Rate within range
        $repeatRow = $this->db->fetchOne("
            SELECT 
                COUNT(CASE WHEN paid_count >= 2 THEN 1 END) AS repeat_customers,
                COUNT(*) AS total_paying_customers
            FROM (
                SELECT COALESCE(user_id, guest_email) AS customer_key, COUNT(id) AS paid_count
                FROM `orders`
                WHERE (payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered'))
                  AND created_at BETWEEN ? AND ?
                GROUP BY customer_key
            ) customer_stats
        ", 'ss', [$startDate, $endDate]) ?? ['repeat_customers' => 0, 'total_paying_customers' => 0];

        $repeatCustomers = (int) ($repeatRow['repeat_customers'] ?? 0);
        $totalPayingCustomers = (int) ($repeatRow['total_paying_customers'] ?? 0);
        $repeatCustomerRate = $totalPayingCustomers > 0 ? round(($repeatCustomers / $totalPayingCustomers) * 100, 2) : 0.0;

        // 6. Daily breakdown within range
        $dailyRows = $this->db->fetchAll("
            SELECT 
                DATE(created_at) AS date,
                COUNT(id) AS orders_count,
                COUNT(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN 1 END) AS paid_count,
                COALESCE(SUM(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN grand_total ELSE 0 END), 0) AS sales
            FROM `orders`
            WHERE created_at BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        ", 'ss', [$startDate, $endDate]);

        // 7. Category breakdown
        $categoryBreakdown = $this->db->fetchAll("
            SELECT 
                COALESCE(c.name, 'Uncategorized') AS category_name,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                COALESCE(SUM(oi.line_total), 0) AS revenue
            FROM `order_items` oi
            JOIN `orders` o ON o.id = oi.order_id
            JOIN `products` p ON p.id = oi.product_id
            LEFT JOIN `categories` c ON c.id = p.category_id
            WHERE (o.payment_status = 'successful' OR o.order_status IN ('paid', 'processing', 'shipped', 'delivered'))
              AND o.created_at BETWEEN ? AND ?
            GROUP BY c.id, c.name
            ORDER BY revenue DESC
        ", 'ss', [$startDate, $endDate]);

        // 8. Gateway breakdown
        $gatewayBreakdown = $this->db->fetchAll("
            SELECT 
                COALESCE(p.provider, 'Pending') AS provider_name,
                COUNT(DISTINCT o.id) AS total_attempts,
                COUNT(DISTINCT CASE WHEN o.payment_status = 'successful' OR o.order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN o.id END) AS successful_count,
                COALESCE(SUM(CASE WHEN o.payment_status = 'successful' OR o.order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN o.grand_total ELSE 0 END), 0) AS total_volume
            FROM `orders` o
            LEFT JOIN `payments` p ON p.order_id = o.id
            WHERE o.created_at BETWEEN ? AND ?
            GROUP BY p.provider
        ", 'ss', [$startDate, $endDate]);

        // Documented Operational Formulas for Auditability
        $formulas = [
            'gross_sales' => 'SUM(grand_total) for all orders where payment_status = "successful" OR order_status IN ("paid", "processing", "shipped", "delivered"). Pending payments strictly excluded.',
            'net_sales' => 'MAX(0, gross_sales - total_refunded). Reflects actual retained revenue.',
            'total_refunded' => 'SUM(amount) from completed refunds records within the date filter.',
            'aov' => 'gross_sales / paid_orders (Average revenue generated per paid transaction).',
            'conversion_rate' => '(paid_orders / total_orders) * 100 (Percentage of placed checkout orders that cleared payment).',
            'repeat_customer_rate' => '(customers_with_2+_paid_orders / total_paying_customers) * 100 within date window.',
            'total_units_sold' => 'SUM(order_items.quantity) from physical items in verified paid orders.',
            'pending_fulfillment' => 'COUNT(orders) where order_status IN ("paid", "processing") requiring physical packaging and dispatch.',
            'reconciliation_rule' => 'All dashboard and analytics figures are derived directly from transactional MySQL records. No mock or static figures are presented as live.'
        ];

        Response::success([
            'filters' => [
                'range' => $range,
                'start_date' => $startDate,
                'end_date' => $endDate
            ],
            'summary' => [
                'gross_sales' => $grossSales,
                'net_sales' => $netSales,
                'total_refunded' => $totalRefunded,
                'refund_count' => $refundCount,
                'aov' => $aov,
                'total_orders' => $totalOrders,
                'paid_orders' => $paidOrders,
                'conversion_rate' => $conversionRate,
                'repeat_customer_rate' => $repeatCustomerRate,
                'total_units_sold' => $totalUnits,
                'pending_fulfillment' => $pendingFulfillment,
                'currency' => 'NGN'
            ],
            'daily_breakdown' => $dailyRows,
            'category_breakdown' => $categoryBreakdown,
            'gateway_breakdown' => $gatewayBreakdown,
            'formulas' => $formulas
        ], 'Analytics report generated successfully.');
    }

    /**
     * GET /api/v1/admin/analytics/export
     * Stream authenticated CSV export of analytics report (KPI summary, daily sales, category breakdown).
     * Protected by AdminAuthMiddleware. Enforces anti-CSV injection sanitization.
     */
    public function exportCsv(): void
    {
        [$range, $startDate, $endDate] = $this->resolveDateRange();

        $summary = $this->db->fetchOne("
            SELECT 
                COALESCE(SUM(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN grand_total ELSE 0 END), 0) AS gross_sales,
                COUNT(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN 1 END) AS paid_orders,
                COUNT(id) AS total_orders
            FROM `orders`
            WHERE created_at BETWEEN ? AND ?
        ", 'ss', [$startDate, $endDate]) ?? ['gross_sales' => 0, 'paid_orders' => 0, 'total_orders' => 0];

        $refundRow = $this->db->fetchOne("
            SELECT COALESCE(SUM(amount), 0) AS total_refunded, COUNT(id) AS refund_count
            FROM `refunds`
            WHERE status = 'completed' AND created_at BETWEEN ? AND ?
        ", 'ss', [$startDate, $endDate]) ?? ['total_refunded' => 0, 'refund_count' => 0];

        $unitsRow = $this->db->fetchOne("
            SELECT COALESCE(SUM(oi.quantity), 0) AS total_units
            FROM `order_items` oi
            JOIN `orders` o ON o.id = oi.order_id
            WHERE (o.payment_status = 'successful' OR o.order_status IN ('paid', 'processing', 'shipped', 'delivered'))
              AND o.created_at BETWEEN ? AND ?
        ", 'ss', [$startDate, $endDate]) ?? ['total_units' => 0];

        $dailyRows = $this->db->fetchAll("
            SELECT 
                DATE(created_at) AS date,
                COUNT(id) AS orders_count,
                COUNT(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN 1 END) AS paid_count,
                COALESCE(SUM(CASE WHEN payment_status = 'successful' OR order_status IN ('paid', 'processing', 'shipped', 'delivered') THEN grand_total ELSE 0 END), 0) AS sales
            FROM `orders`
            WHERE created_at BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        ", 'ss', [$startDate, $endDate]);

        $categoryBreakdown = $this->db->fetchAll("
            SELECT 
                COALESCE(c.name, 'Uncategorized') AS category_name,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                COALESCE(SUM(oi.line_total), 0) AS revenue
            FROM `order_items` oi
            JOIN `orders` o ON o.id = oi.order_id
            JOIN `products` p ON p.id = oi.product_id
            LEFT JOIN `categories` c ON c.id = p.category_id
            WHERE (o.payment_status = 'successful' OR o.order_status IN ('paid', 'processing', 'shipped', 'delivered'))
              AND o.created_at BETWEEN ? AND ?
            GROUP BY c.id, c.name
            ORDER BY revenue DESC
        ", 'ss', [$startDate, $endDate]);

        $gross = (float) $summary['gross_sales'];
        $paid = (int) $summary['paid_orders'];
        $total = (int) $summary['total_orders'];
        $refund = (float) $refundRow['total_refunded'];
        $net = max(0, $gross - $refund);
        $aov = $paid > 0 ? round($gross / $paid, 2) : 0.0;
        $units = (int) $unitsRow['total_units'];

        // Output CSV
        $filename = 'shopco-analytics-' . $range . '-' . date('Ymd-His') . '.csv';
        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');

        $out = fopen('php://output', 'w');
        // Add UTF-8 BOM for Excel compatibility
        fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));

        fputcsv($out, ['SHOP.CO FINANCIAL & OPERATIONAL ANALYTICS REPORT']);
        fputcsv($out, ['Generated At', date('Y-m-d H:i:s')]);
        fputcsv($out, ['Filter Range', $range]);
        fputcsv($out, ['Date From', $startDate]);
        fputcsv($out, ['Date To', $endDate]);
        fputcsv($out, []);

        fputcsv($out, ['KEY FINANCIAL METRICS', 'VALUE (NGN / COUNT)']);
        fputcsv($out, ['Gross Sales (Verified Paid)', number_format($gross, 2)]);
        fputcsv($out, ['Completed Refunds', number_format($refund, 2)]);
        fputcsv($out, ['Net Retained Sales', number_format($net, 2)]);
        fputcsv($out, ['Total Orders Initiated', (string) $total]);
        fputcsv($out, ['Paid Settled Orders', (string) $paid]);
        fputcsv($out, ['Average Order Value (AOV)', number_format($aov, 2)]);
        fputcsv($out, ['Total Physical Units Sold', (string) $units]);
        fputcsv($out, ['Order Payment Conversion Rate', ($total > 0 ? round(($paid / $total) * 100, 2) : 0) . '%']);
        fputcsv($out, []);

        fputcsv($out, ['DAILY SETTLEMENT BREAKDOWN']);
        fputcsv($out, ['Date', 'Total Orders', 'Paid Orders', 'Sales Volume (NGN)']);
        foreach ($dailyRows as $d) {
            fputcsv($out, [
                $this->sanitizeCsvCell($d['date']),
                (string) $d['orders_count'],
                (string) $d['paid_count'],
                number_format((float) $d['sales'], 2)
            ]);
        }
        fputcsv($out, []);

        fputcsv($out, ['CATEGORY PERFORMANCE BREAKDOWN']);
        fputcsv($out, ['Category Name', 'Order Count', 'Units Sold', 'Revenue (NGN)']);
        foreach ($categoryBreakdown as $c) {
            fputcsv($out, [
                $this->sanitizeCsvCell($c['category_name']),
                (string) $c['order_count'],
                (string) $c['units_sold'],
                number_format((float) $c['revenue'], 2)
            ]);
        }

        fclose($out);
        exit;
    }

    /**
     * GET /api/v1/admin/orders/export
     * Stream authenticated CSV export of filtered orders list.
     * Enforces anti-CSV injection sanitization and NEVER exposes passwords or tokens.
     */
    public function exportOrdersCsv(): void
    {
        [$range, $startDate, $endDate] = $this->resolveDateRange();

        $status = $_GET['status'] ?? 'all';
        $paymentStatus = $_GET['payment_status'] ?? 'all';

        $sql = "
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
                o.grand_total,
                (SELECT COUNT(*) FROM `order_items` oi WHERE oi.order_id = o.id) AS items_count,
                JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_snapshot, '$.state')) AS destination_state,
                JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_snapshot, '$.city')) AS destination_city
            FROM `orders` o
            LEFT JOIN `users` u ON u.id = o.user_id
            LEFT JOIN `payments` p ON p.order_id = o.id AND p.id = (SELECT MAX(p2.id) FROM `payments` p2 WHERE p2.order_id = o.id)
            WHERE o.created_at BETWEEN ? AND ?
        ";

        $types = 'ss';
        $params = [$startDate, $endDate];

        if ($status !== 'all') {
            $sql .= " AND o.order_status = ?";
            $types .= 's';
            $params[] = $status;
        }

        if ($paymentStatus !== 'all') {
            $sql .= " AND o.payment_status = ?";
            $types .= 's';
            $params[] = $paymentStatus;
        }

        $sql .= " ORDER BY o.created_at DESC";

        $orders = $this->db->fetchAll($sql, $types, $params);

        $filename = 'shopco-orders-export-' . date('Ymd-His') . '.csv';
        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');

        $out = fopen('php://output', 'w');
        // Add UTF-8 BOM
        fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));

        // Header row
        fputcsv($out, [
            'Order Number',
            'Order Date',
            'Customer Name',
            'Customer Email',
            'Order Status',
            'Payment Status',
            'Payment Gateway',
            'Transaction Ref',
            'Currency',
            'Items Count',
            'Subtotal',
            'Delivery Fee',
            'Discount Amount',
            'Grand Total',
            'Destination State',
            'Destination City'
        ]);

        foreach ($orders as $row) {
            fputcsv($out, [
                $this->sanitizeCsvCell($row['order_number']),
                $this->sanitizeCsvCell($row['created_at']),
                $this->sanitizeCsvCell($row['customer_name']),
                $this->sanitizeCsvCell($row['customer_email']),
                $this->sanitizeCsvCell($row['order_status']),
                $this->sanitizeCsvCell($row['payment_status']),
                $this->sanitizeCsvCell($row['payment_gateway'] ?? 'N/A'),
                $this->sanitizeCsvCell($row['transaction_reference'] ?? 'N/A'),
                $this->sanitizeCsvCell($row['currency']),
                (string) $row['items_count'],
                number_format((float) $row['subtotal'], 2),
                number_format((float) $row['shipping_fee'], 2),
                number_format((float) $row['discount_amount'], 2),
                number_format((float) $row['grand_total'], 2),
                $this->sanitizeCsvCell($row['destination_state'] ?? 'N/A'),
                $this->sanitizeCsvCell($row['destination_city'] ?? 'N/A')
            ]);
        }

        fclose($out);
        exit;
    }

    /**
     * Prevent CSV formula injection by prepending single quote if cell starts with =, +, -, @, \t, or \r.
     */
    private function sanitizeCsvCell(mixed $value): string
    {
        $str = (string) ($value ?? '');
        if ($str !== '' && in_array($str[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
            return "'" . $str;
        }
        return $str;
    }
}
