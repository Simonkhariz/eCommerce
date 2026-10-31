/**
 * WhatsApp helpers for order invoices (before payment), receipts (after payment) and support.
 * The store's number comes from the backend (STORE_WHATSAPP_PHONE via /checkout/payment-methods);
 * the constant below is only a fallback until that has loaded.
 */

import type { ApiOrder, ApiOrderItem } from '@/lib/api-client';

export const SUPPORT_WHATSAPP_NUMBER = '2349066707079';
export const SUPPORT_PHONE_FORMATTED = '+234 906 670 7079';

/**
 * International digits for wa.me from a number typed in Nigerian local format:
 * "0803 123 4567", "803 123 4567", "+234 0803..." and "+234 803..." all become "2348031234567".
 * Numbers from other countries are kept as typed. Returns '' when there are no digits.
 */
export function normalizePhoneDigits(phone?: string | null): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return `234${digits.slice(1)}`;
  if (digits.length === 10 && /^[789]/.test(digits)) return `234${digits}`;
  if (digits.length === 14 && digits.startsWith('2340')) return `234${digits.slice(4)}`;
  return digits;
}

/** Normalise a configured phone number to wa.me digits (store fallback when none is set). */
export function toWhatsAppDigits(phone?: string | null): string {
  return normalizePhoneDigits(phone) || SUPPORT_WHATSAPP_NUMBER;
}

export interface WhatsAppOrderItem {
  name: string;
  quantity: number;
  price?: number;
  size?: string;
  line_total?: number;
  product_name?: string;
  unit_price?: number;
}

export interface WhatsAppOrderDetails {
  order_number: string;
  grand_total: number;
  subtotal?: number;
  shipping_fee?: number;
  discount_amount?: number;
  items?: WhatsAppOrderItem[];
  guest_email?: string;
  payment_status?: string;
  guest_access_token?: string;
  shipping_address?: {
    full_name?: string;
    phone?: string;
    address_line1?: string;
    city?: string;
    state?: string;
  };
}

/** Order lines as the WhatsApp messages list them. */
export function whatsAppItems(items: ApiOrderItem[] | null | undefined): WhatsAppOrderItem[] {
  return (items ?? []).map((it) => ({
    name: it.item_name,
    quantity: Number(it.quantity),
    line_total: Number(it.line_total),
    size: it.variant_options?.size,
  }));
}

/** Invoice or receipt details for an order from the order lookup. */
export function whatsAppOrderFrom(order: ApiOrder): WhatsAppOrderDetails {
  return {
    order_number: order.order_number,
    grand_total: Number(order.grand_total),
    subtotal: Number(order.subtotal),
    shipping_fee: Number(order.shipping_fee),
    discount_amount: Number(order.discount_amount),
    items: whatsAppItems(order.items),
    guest_email: order.guest_email ?? undefined,
    shipping_address: order.shipping_address_snapshot ?? undefined,
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Proforma Invoice sent BEFORE payment is completed.
 * Includes complete itemized product list, pricing, subtotal, delivery, and total.
 */
export function buildWhatsAppInvoiceUrl(order: WhatsAppOrderDetails, supportPhone?: string | null): string {
  // Only the order number: the store looks the order up by it, and the customer can add any
  // message they like before sending.
  return `https://wa.me/${toWhatsAppDigits(supportPhone)}?text=${encodeURIComponent(order.order_number)}`;
}

/**
 * Receipt message after payment: also only the order number (the store has the details).
 */
export function buildWhatsAppReceiptUrl(order: WhatsAppOrderDetails, supportPhone?: string | null): string {
  return `https://wa.me/${toWhatsAppDigits(supportPhone)}?text=${encodeURIComponent(order.order_number)}`;
}

/**
 * Builds pre-payment trust link for customers who wish to inquire before placing an order.
 */
export function buildWhatsAppPrePaymentHelpUrl(orderNumber?: string, totalAmount?: number, supportPhone?: string | null): string {
  if (orderNumber && totalAmount) {
    return `https://wa.me/${toWhatsAppDigits(supportPhone)}?text=${encodeURIComponent(
      [
        `*SHOP.CO — CUSTOMER INQUIRY*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `Hello Support! I have an inquiry regarding my order:`,
        ``,
        `• *Order Ref:* ${orderNumber}`,
        `• *Amount:* ${formatCurrency(totalAmount)}`,
        ``,
        `Please assist me before I complete payment. Thank you!`,
      ].join('\n')
    )}`;
  }

  return `https://wa.me/${toWhatsAppDigits(supportPhone)}?text=${encodeURIComponent(
    'Hello SHOP.CO Support! I am shopping on your store and have an inquiry.'
  )}`;
}

/** Plain support chat link with a prefilled message. */
export function buildWhatsAppMessageUrl(message: string, supportPhone?: string | null): string {
  return `https://wa.me/${toWhatsAppDigits(supportPhone)}?text=${encodeURIComponent(message)}`;
}

/** Human-readable form of the configured support number. */
export function formatSupportPhone(supportPhone?: string | null): string {
  const digits = toWhatsAppDigits(supportPhone);
  if (digits.startsWith('234') && digits.length === 13) {
    return `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}
