/**
 * Admin API client. Every call goes through the same-origin proxy with the admin session
 * cookie and admin CSRF token (see api-client.ts). Lists are paginated: {items, pagination}.
 */

import { API_BASE_URL, ApiError, PaginationMeta, apiRequest, apiRequestFull } from '@/lib/api-client';

export type { PaginationMeta };
export { errorMessage } from '@/lib/api-client';

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(params?: Query): string {
  if (!params) return '';
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    q.set(key, String(value));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

function send<T>(endpoint: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Field errors from a 422 response, keyed by field name. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.details && typeof err.details === 'object') {
    const out: Record<string, string> = {};
    Object.entries(err.details).forEach(([k, v]) => {
      if (typeof v === 'string' && v) out[k] = v;
    });
    return out;
  }
  return {};
}

// =============================================================================
// Orders
// =============================================================================

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'returned'
  | 'refund_pending'
  | 'refunded';

export interface AddressSnapshot {
  full_name?: string;
  phone?: string;
  email?: string;
  address_line1?: string;
  address_line2?: string | null;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string | null;
}

export interface AdminOrderListItem {
  id: number;
  order_number: string;
  user_id: number | null;
  guest_email: string | null;
  /** Account email for signed-in customers, else the checkout email. */
  customer_email?: string | null;
  order_status: OrderStatus;
  payment_status: string;
  currency: string;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  grand_total: number;
  shipping_zone_snapshot: { name?: string; fee?: number; estimated_days?: string } | null;
  shipping_address_snapshot: AddressSnapshot | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  requires_attention: boolean;
  attention_reason: string | null;
  /** The customer tapped "Mark as paid" for a WhatsApp transfer (not a confirmation). */
  customer_marked_paid_at?: string | null;
  /** The customer's name, contact details and street address were removed (Data & storage). */
  personal_data_removed_at?: string | null;
  payment_provider: string | null;
  payment_reference: string | null;
  payment_record_status: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipment_status: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  items_count: number;
  total_quantity: number;
}

export interface AdminOrderPayment {
  id: number;
  provider: string;
  provider_reference: string;
  amount: number | string;
  amount_received: number | string | null;
  currency: string;
  payment_method: string | null;
  status: string;
  verified_at: string | null;
  created_at: string;
}

export interface AdminOrderDetail extends Omit<AdminOrderListItem, 'payment_provider' | 'payment_reference' | 'payment_record_status' | 'carrier' | 'tracking_number' | 'tracking_url' | 'shipment_status' | 'shipped_at' | 'delivered_at' | 'items_count' | 'total_quantity'> {
  notes: string | null;
  applied_promo_code: string | null;
  allowed_transitions: OrderStatus[];
  shipment: {
    id: number;
    carrier: string;
    tracking_number: string | null;
    tracking_url: string | null;
    status: string;
    shipped_at: string | null;
    delivered_at: string | null;
  } | null;
  items: Array<{
    id: number;
    product_id: number | null;
    variant_id: number | null;
    item_name: string;
    sku: string | null;
    variant_options: { size?: string; color?: string; color_name?: string } | null;
    unit_price: number;
    quantity: number;
    line_total: number;
  }>;
  history: Array<{ previous_status: string | null; new_status: string; comment: string | null; changed_by_user_id: number | null; created_at: string }>;
  payments: AdminOrderPayment[];
  payment: AdminOrderPayment | null;
  refunds: Array<{ id: number; amount: number | string; currency: string; reason: string; status: string; restocked: number | boolean; created_at: string; updated_at: string }>;
  audit_logs: Array<{ id: number; action: string; admin_name: string | null; created_at: string }>;
}

export function adminGetOrders(params: { status?: string; search?: string; page?: number; per_page?: number }) {
  return apiRequest<Paginated<AdminOrderListItem>>(`/admin/orders${qs(params)}`);
}

export function adminGetOrder(orderNumber: string) {
  return apiRequest<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(orderNumber)}`);
}

export function adminUpdateOrderStatus(orderNumber: string, status: OrderStatus, comment?: string) {
  return send<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(orderNumber)}/status`, 'PATCH', { status, comment });
}

export function adminAssignShipment(orderNumber: string, data: { carrier: string; tracking_number: string; tracking_url?: string; comment?: string }) {
  return send<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(orderNumber)}/shipment`, 'POST', { ...data, status: 'in_transit' });
}

export function adminConfirmDelivery(orderNumber: string, comment?: string) {
  return send<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(orderNumber)}/delivered`, 'POST', { comment });
}

/** Record a manual (bank transfer / WhatsApp) payment. The bank reference is required. */
export function adminConfirmPayment(orderNumber: string, data: { reference: string; note?: string }) {
  return send<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(orderNumber)}/confirm-payment`, 'POST', data);
}

// =============================================================================
// Dashboard & analytics
// =============================================================================

export interface DashboardOverview {
  period: { days: number; start: string; end: string; previous_start: string };
  kpis: {
    currency: string;
    gross_sales: number;
    net_sales: number;
    total_refunded: number;
    paid_orders: number;
    aov: number;
    total_orders: number;
    new_customers: number;
    pending_fulfillment: number;
    awaiting_payment: number;
    needs_attention: number;
    low_stock_count: number;
    out_of_stock_count: number;
    total_customers: number;
  };
  /** Percentage change vs the previous period; null when there is no baseline. */
  deltas: Record<'gross_sales' | 'net_sales' | 'paid_orders' | 'aov' | 'total_orders' | 'new_customers', number | null>;
  trend: Array<{ date: string; sales: number; paid_orders: number; total_orders: number }>;
  recent_orders: Array<{
    id: number;
    order_number: string;
    customer_name: string | null;
    customer_email: string | null;
    total_amount: number | string;
    currency: string;
    order_status: OrderStatus;
    payment_status: string;
    requires_attention: number | boolean;
    payment_method: string | null;
    created_at: string;
    items_count: number | string;
  }>;
  attention_orders: Array<{ order_number: string; order_status: OrderStatus; payment_status: string; attention_reason: string | null; grand_total: number | string; updated_at: string }>;
  critical_stock: Array<{ id: number; sku: string; size: string; color_name: string; stock_quantity: number | string; low_stock_threshold: number | string; product_id: number; product_name: string }>;
  top_products: Array<{ id: number; name: string; slug: string; total_units_sold: number | string; total_revenue: number | string }>;
  payment_alerts: Array<{ id: number; payment_reference: string; order_number: string; gateway: string; amount: number | string; status: string; created_at: string }>;
}

export function adminGetOverview(period: 7 | 30 | 90) {
  return apiRequest<DashboardOverview>(`/admin/dashboard/overview?period=${period}`);
}

export interface AnalyticsReport {
  filters: { range: string; start_date: string; end_date: string };
  summary: {
    currency: string;
    gross_sales: number;
    total_refunded: number;
    refund_count: number;
    /** Paid then cancelled, not yet refunded: money the store owes back. */
    owed_refunds: number;
    owed_refund_count: number;
    net_sales: number;
    paid_orders: number;
    aov: number;
    total_orders: number;
    conversion_rate: number;
    repeat_customer_rate: number;
    paying_customers: number;
    total_units_sold: number;
    pending_fulfillment: number;
  };
  daily_breakdown: Array<{ date: string; orders_count: number; paid_count: number; sales: number; refunds: number }>;
  category_breakdown: Array<{ category_name: string; order_count: number | string; units_sold: number | string; revenue: number | string }>;
  top_products: Array<{ product_id: number | null; name: string; units_sold: number | string; revenue: number | string }>;
  gateway_breakdown: Array<{ provider_name: string; total_attempts: number; successful_count: number; failed_count: number; total_volume: number }>;
  owed_refunds: Array<{ order_number: string; cancelled_at: string; payment_status: string; paid: number | string; refunded: number | string; owed: number | string }>;
  formulas: Record<string, string>;
}

/** Sales are counted when money is verified; refunds when completed. */
export function adminGetAnalyticsReport(params: { range?: string; start_date?: string; end_date?: string }) {
  return apiRequest<AnalyticsReport>(`/admin/analytics/report${qs(params)}`);
}

/** Download a CSV export with the admin session. */
export async function adminDownloadExport(endpoint: string, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: { Accept: 'text/csv' },
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new ApiError(response.status === 401 ? 'Your admin session has ended. Sign in again.' : 'The export could not be generated.', response.status);
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// =============================================================================
// Inventory
// =============================================================================

export interface InventoryRow {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  product_status: string;
  sku: string;
  size: string;
  color_name: string;
  color_hex: string;
  stock_quantity: number | string;
  low_stock_threshold: number | string;
  price_override: number | string | null;
  base_price: number | string;
  updated_at: string;
}

export interface InventoryLog {
  id: number;
  variant_id: number;
  product_id: number;
  product_name: string;
  variant_sku: string;
  size: string;
  color_name: string;
  previous_stock: number;
  new_stock: number;
  change_amount: number;
  reason: string;
  adjusted_by_name: string | null;
  created_at: string;
}

export function adminGetInventory(params: { filter?: 'all' | 'low_stock' | 'out_of_stock'; search?: string; page?: number; per_page?: number }) {
  return apiRequest<Paginated<InventoryRow>>(`/admin/inventory${qs(params)}`);
}

export function adminGetInventoryLogs(params: { variant_id?: number; page?: number; per_page?: number }) {
  return apiRequest<Paginated<InventoryLog>>(`/admin/inventory/logs${qs(params)}`);
}

export function adminAdjustStock(data: { variant_id: number; change_amount: number; reason: string }) {
  return send<unknown>('/admin/inventory/adjust', 'POST', data);
}

// =============================================================================
// Customers
// =============================================================================

export interface CustomerRow {
  id: number;
  uuid: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'unverified' | 'suspended';
  email_verified_at: string | null;
  created_at: string;
  total_orders: number | string;
  lifetime_spend: number | string;
}

export interface CustomerDetail {
  customer: Omit<CustomerRow, 'total_orders' | 'lifetime_spend'> & { updated_at: string };
  summary: { total_orders: number | string; total_spend: number | string };
  addresses: Array<{ id: number; label: string | null; recipient_name: string; phone: string; street_address: string; city: string; state: string; country: string; postal_code: string | null; is_default: number | boolean }>;
  orders: Array<{ id: number; order_number: string; grand_total: number | string; currency: string; order_status: OrderStatus; payment_status: string; created_at: string }>;
}

export function adminGetCustomers(params: { search?: string; status?: string; page?: number; per_page?: number }) {
  return apiRequest<Paginated<CustomerRow>>(`/admin/customers${qs(params)}`);
}

export function adminGetCustomer(id: number) {
  return apiRequest<CustomerDetail>(`/admin/customers/${id}`);
}

export function adminUpdateCustomerStatus(id: number, status: 'active' | 'suspended') {
  return send<{ id: number; status: string }>(`/admin/customers/${id}/status`, 'PATCH', { status });
}

// =============================================================================
// Payments & refunds
// =============================================================================

export interface PaymentRow {
  id: number;
  payment_reference: string;
  gateway: string;
  amount: number | string;
  amount_received: number | string | null;
  currency: string;
  payment_method: string | null;
  status: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  order_number: string | null;
  order_status: OrderStatus | null;
  order_payment_status: string | null;
  requires_attention: number | boolean | null;
  customer_name: string | null;
  customer_email: string | null;
}

export function adminGetPayments(params: { gateway?: string; status?: string; search?: string; page?: number; per_page?: number }) {
  return apiRequest<Paginated<PaymentRow>>(`/admin/payments${qs(params)}`);
}

export interface RefundRow {
  id: number;
  payment_id: number;
  order_id: number;
  order_number: string;
  amount: number | string;
  currency: string;
  reason: string;
  status: 'pending' | 'completed' | 'rejected';
  restocked: number | boolean;
  provider_refund_reference: string | null;
  customer_name: string | null;
  customer_email: string | null;
  payment_reference: string;
  gateway: string;
  processed_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefundEligibility {
  order_number: string;
  order_status: OrderStatus;
  payment_status: string;
  currency: string;
  paid_amount: number;
  refunded_amount: number;
  pending_refund_amount: number;
  refundable_amount: number;
  payment_reference: string | null;
  gateway: string | null;
  can_restock: boolean;
}

export function adminGetRefunds(params: { status?: string; page?: number; per_page?: number }) {
  return apiRequest<Paginated<RefundRow>>(`/admin/refunds${qs(params)}`);
}

export function adminGetRefundEligibility(orderNumber: string) {
  return apiRequest<RefundEligibility>(`/admin/refunds/eligibility${qs({ order_number: orderNumber })}`);
}

export function adminCreateRefund(data: {
  order_number: string;
  amount: number;
  reason: string;
  status: 'completed' | 'pending';
  restock: boolean;
  provider_refund_reference?: string;
}) {
  return send<RefundRow>('/admin/refunds', 'POST', data);
}

export function adminResolveRefund(id: number, status: 'completed' | 'rejected') {
  return send<RefundRow>(`/admin/refunds/${id}`, 'PATCH', { status });
}

// =============================================================================
// Promotions
// =============================================================================

export interface Promotion {
  id: number;
  code: string;
  description: string;
  discount_percent: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface PromotionInput {
  code: string;
  description: string;
  discount_percent: number;
  /** 0 = unlimited */
  max_uses: number;
  is_active: boolean;
  /** YYYY-MM-DD or null */
  starts_at: string | null;
  /** YYYY-MM-DD or null (the code works until the end of that day) */
  expires_at: string | null;
}

export function adminGetPromotions(params: { page?: number; per_page?: number } = {}) {
  return apiRequest<Paginated<Promotion>>(`/admin/promotions${qs(params)}`);
}

export function adminSavePromotion(id: number | null, data: PromotionInput) {
  return id ? send<{ id: number }>(`/admin/promotions/${id}`, 'PUT', data) : send<{ id: number }>('/admin/promotions', 'POST', data);
}

export function adminDeletePromotion(id: number) {
  return apiRequestFull<{ id: number; deleted: boolean }>(`/admin/promotions/${id}`, { method: 'DELETE' });
}

// =============================================================================
// Storefront: banners & reviews
// =============================================================================

export interface Banner {
  id: number;
  title: string;
  subtitle: string | null;
  cta_text: string | null;
  cta_url: string | null;
  image_url: string;
  is_active: number | boolean;
  display_order: number;
  created_at: string;
}

export type BannerInput = Pick<Banner, 'title' | 'image_url'> & {
  subtitle: string;
  cta_text: string;
  cta_url: string;
  is_active: boolean;
  display_order: number;
};

export interface ReviewRow {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  author_name: string;
  author_email: string | null;
  rating: number;
  title: string | null;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  is_verified_purchase: number | boolean;
  created_at: string;
}

export function adminGetBanners() {
  return apiRequest<Banner[]>('/admin/storefront/banners');
}

export function adminSaveBanner(id: number | null, data: BannerInput) {
  return id ? send<{ id: number }>(`/admin/storefront/banners/${id}`, 'PUT', data) : send<{ id: number }>('/admin/storefront/banners', 'POST', data);
}

export function adminDeleteBanner(id: number) {
  return send<{ id: number }>(`/admin/storefront/banners/${id}`, 'DELETE');
}

export function adminGetReviews(params: { status?: string; page?: number; per_page?: number }) {
  return apiRequest<Paginated<ReviewRow>>(`/admin/storefront/reviews${qs(params)}`);
}

export function adminUpdateReviewStatus(id: number, status: 'approved' | 'rejected' | 'pending') {
  return send<{ id: number; status: string }>(`/admin/storefront/reviews/${id}/status`, 'PATCH', { status });
}

// =============================================================================
// Categories
// =============================================================================

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  product_count: number;
  published_count: number;
}

export function adminGetCategories() {
  return apiRequest<AdminCategory[]>('/admin/categories');
}

export function adminSaveCategory(
  id: number | null,
  data: Partial<{ name: string; slug: string; description: string; image_url: string; display_order: number; is_active: boolean }>
) {
  return id ? send<AdminCategory>(`/admin/categories/${id}`, 'PUT', data) : send<AdminCategory>('/admin/categories', 'POST', data);
}

/** Hides the category from the store (it can be restored). */
export function adminDeactivateCategory(id: number) {
  return send<{ id: number }>(`/admin/categories/${id}`, 'DELETE');
}

// =============================================================================
// Delivery zones
// =============================================================================

export interface ShippingZone {
  id: number;
  name: string;
  code: string;
  description: string | null;
  states_covered: string[];
  fee: number;
  estimated_days: string;
  is_active: boolean;
}

export type ShippingZoneInput = Omit<ShippingZone, 'id'>;

export function adminGetShippingZones() {
  return apiRequest<{ zones: ShippingZone[]; states: string[] }>('/admin/shipping-zones');
}

export function adminSaveShippingZone(id: number | null, data: ShippingZoneInput) {
  return id ? send<ShippingZone>(`/admin/shipping-zones/${id}`, 'PUT', data) : send<ShippingZone>('/admin/shipping-zones', 'POST', data);
}

export function adminDeleteShippingZone(id: number) {
  return send<{ id: number }>(`/admin/shipping-zones/${id}`, 'DELETE');
}

// =============================================================================
// Notifications (email outbox) & audit logs
// =============================================================================

export interface OutboxRow {
  id: number;
  recipient_email: string;
  subject: string;
  template: string;
  status: 'pending' | 'sent' | 'failed';
  /** How it went out: 'smtp' = delivered to the mail server, 'log' = written to the mail log only. */
  transport: 'smtp' | 'log' | null;
  attempt_count: number;
  last_error: string | null;
  /** For pending emails: when the next delivery attempt is due. */
  next_attempt_at: string | null;
  created_at: string;
  sent_at: string | null;
}

export function adminGetOutbox(params: { status?: string; page?: number; per_page?: number }) {
  return apiRequest<Paginated<OutboxRow>>(`/admin/notifications/outbox${qs(params)}`);
}

/** Re-send one email; the server message says whether it was delivered or only logged. */
export function adminRetryOutbox(id: number) {
  return apiRequestFull<{ id: number }>(`/admin/notifications/outbox/${id}/retry`, { method: 'POST' });
}

/** Deliver one batch of queued emails now (same as scripts/process_outbox.php). */
export function adminProcessOutbox() {
  return apiRequestFull<{ processed: number; sent: number; retrying: number; failed: number; still_pending: number }>(
    '/admin/notifications/outbox/process',
    { method: 'POST' }
  );
}

export interface AuditLogRow {
  id: number;
  admin_id: number | null;
  admin_name: string | null;
  admin_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: string | null;
  after_state: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export function adminGetAuditLogs(params: { action?: string; entity_type?: string; page?: number; per_page?: number }) {
  return apiRequest<Paginated<AuditLogRow> & { filters: { actions: string[]; entity_types: string[] } }>(`/admin/audit-logs${qs(params)}`);
}

// =============================================================================
// Settings, system status, account
// =============================================================================

export type PaymentMethodId = 'monnify' | 'kora' | 'whatsapp';

/** enabled = offered at checkout: the admin switch is on and backend/.env allows it. */
export interface PaymentMethodStatus {
  enabled: boolean;
  admin_on: boolean;
  server_allows: boolean;
}

export interface StoreSettings {
  editable: Array<{ key: string; value: string; help: string }>;
  readonly: {
    currency: string;
    timezone: string;
    kora_mode: 'live' | 'sandbox' | 'not_configured';
    monnify_mode: 'live' | 'sandbox' | 'not_configured';
    mail_mode: 'smtp' | 'log_only';
    payment_methods: Record<PaymentMethodId, PaymentMethodStatus>;
    order_payment_window_minutes: number;
    manual_payment_window_hours: number;
  };
}

export function adminGetSettings() {
  return apiRequest<StoreSettings>('/admin/settings');
}

export function adminUpdateSettings(changes: Record<string, string>) {
  return send<Record<string, string>>('/admin/settings', 'PUT', changes);
}

/** Switch checkout payment methods on or off (at least one must stay available). */
export function adminUpdatePaymentMethods(changes: Partial<Record<PaymentMethodId, boolean>>) {
  return send<Record<PaymentMethodId, PaymentMethodStatus>>('/admin/settings/payment-methods', 'PUT', changes);
}

export interface SystemStatus {
  system_health: 'healthy' | 'degraded';
  server_time: string;
  environment: 'production' | 'development';
  database: { connected: boolean; latency_ms: number | null };
  migrations: { applied: number; latest: string | null };
  storage: { uploads_writable: boolean };
  payments: { kora: string; monnify: string };
  /** oldest_due_minutes: age of the oldest email waiting to be sent (null when none); large values mean the outbox worker is not running. */
  mail: { mode: 'smtp' | 'log_only'; outbox_pending: number; outbox_failed: number; oldest_due_minutes: number | null };
  orders: { needs_attention: number; unpaid_overdue: number; awaiting_fulfilment: number };
}

export function adminGetSystemStatus() {
  return apiRequest<SystemStatus>('/admin/system-status');
}

// =============================================================================
// Data & storage (retention and database health)
// =============================================================================

export type RetentionKey = 'retention_customer_days' | 'retention_unpaid_days' | 'retention_message_days' | 'retention_activity_days';
export type DataSettingKey = RetentionKey | 'storage_alert_mb';
export type DataSettings = Record<DataSettingKey, number>;
export type HealthLevel = 'ok' | 'warning' | 'critical';

export interface HealthIssue {
  level: Exclude<HealthLevel, 'ok'>;
  code: 'size' | 'slow' | 'queries' | 'cleanup' | 'backlog';
  title: string;
  detail: string;
}

export interface CleanupRun {
  at: string;
  source: 'schedule' | 'admin';
  removed: Record<string, number>;
}

export interface StorageHealthReport {
  level: HealthLevel;
  issues: HealthIssue[];
  checked_at: string;
  database: {
    size_bytes: number;
    alert_mb: number;
    used_percent: number;
    tables: Array<{ name: string; rows: number; bytes: number; free_bytes: number }>;
  };
  slow_requests: {
    threshold_ms: number;
    last_24h: number;
    slowest_ms: number;
    routes: Array<{ method: string; route: string; hits: number; avg_ms: number; max_ms: number }>;
  };
  queries?: { typical_ms: number };
  cleanup: { last_run: CleanupRun | null; days_since: number | null; waiting?: Record<string, number> };
}

export interface DataOverview {
  settings: DataSettings;
  options: Record<DataSettingKey, number[]>;
  labels: Record<string, string>;
  health: StorageHealthReport;
}

export function adminGetDataOverview() {
  return apiRequest<DataOverview>('/admin/data');
}

export function adminGetStorageAlert() {
  return apiRequest<{ level: HealthLevel; issues: HealthIssue[] }>('/admin/data/alert');
}

export function adminUpdateDataSettings(data: Partial<DataSettings>) {
  return send<DataSettings>('/admin/data/settings', 'PUT', data);
}

export function adminRunCleanup(expectedCustomers: number) {
  return send<{ removed: Record<string, number> }>('/admin/data/cleanup', 'POST', { expected_customers: expectedCustomers });
}

export interface AdminAccount {
  id: number;
  uuid: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export function adminGetAccount() {
  return apiRequest<AdminAccount>('/admin/account');
}

export function adminUpdateAccount(data: { full_name: string; phone: string; current_password?: string; new_password?: string }) {
  return apiRequestFull<{ id: number; full_name: string; phone: string }>('/admin/account', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// =============================================================================
// Marketing (newsletter subscribers only)
// =============================================================================

export interface Subscriber {
  id: number;
  email: string;
  status: 'active' | 'unsubscribed';
  source: string;
  subscribed_at: string;
  unsubscribed_at: string | null;
}

export function adminGetSubscribers(params: { status?: string; page?: number; per_page?: number }) {
  return apiRequest<Paginated<Subscriber> & { counts: { active: number; unsubscribed: number } }>(
    // The server defaults to 'active'; 'any' (not one of its statuses) lists everyone.
    `/admin/marketing/subscribers${qs({ status: params.status === 'all' ? 'any' : params.status ?? 'active', page: params.page, per_page: params.per_page })}`
  );
}

/** confirm_recipients must equal the active-subscriber count the admin saw and confirmed. */
export function adminSendBroadcast(data: { subject: string; content: string; confirm_recipients: number }) {
  return send<{ queued_count: number; mail_mode: string }>('/admin/marketing/broadcast', 'POST', data);
}
