/**
 * WhatsApp helpers for order invoices (before payment), receipts (after payment) and support.
 * The store's number comes from the backend (STORE_WHATSAPP_PHONE via /checkout/payment-methods);
 * the constant below is only a fallback until that has loaded.
 */

export const SUPPORT_WHATSAPP_NUMBER = '2349066707079';
export const SUPPORT_PHONE_FORMATTED = '+234 906 670 7079';

/** Normalise a configured phone number ("+234 906 ...", "0906...") to wa.me digits. */
export function toWhatsAppDigits(phone?: string | null): string {
  const digits = (phone || '').replace(/D/g, '');
  if (!digits) return SUPPORT_WHATSAPP_NUMBER;
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`;
  return digits;
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
  const customerName = order.shipping_address?.full_name || 'Customer';
  const deliveryCity = [order.shipping_address?.city, order.shipping_address?.state]
    .filter(Boolean)
    .join(', ') || 'Nigeria';

  const items = order.items || [];
  const itemsCount = items.reduce((acc, item) => acc + (item.quantity || 1), 0) || items.length;

  const lines: string[] = [
    `*SHOP.CO — PROFORMA INVOICE*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Hello Support! I just placed an order and have my invoice details:`,
    ``,
    `• *Invoice Ref:* ${order.order_number}`,
    `• *Customer:* ${customerName}`,
  ];

  if (items.length > 0) {
    lines.push(``);
    lines.push(`*Items Ordered (${itemsCount}):*`);
    items.forEach((item) => {
      const title = item.name || item.product_name || 'Item';
      const unitPrice = item.price ?? item.unit_price ?? 0;
      const itemPrice = item.line_total ?? (unitPrice * (item.quantity || 1));
      const sizeStr = item.size ? ` · Size: ${item.size}` : '';
      lines.push(``);
      lines.push(`• *${title}*`);
      lines.push(`  Qty: ${item.quantity || 1}${sizeStr}`);
      lines.push(`  ${formatCurrency(itemPrice)}`);
    });
  }

  lines.push(``);
  lines.push(`*Payment Breakdown:*`);
  if (order.subtotal !== undefined) {
    lines.push(`• Subtotal: ${formatCurrency(order.subtotal)}`);
  }
  if (order.discount_amount && order.discount_amount > 0) {
    lines.push(`• Discount: -${formatCurrency(order.discount_amount)}`);
  }
  if (order.shipping_fee !== undefined) {
    lines.push(`• Delivery: ${formatCurrency(order.shipping_fee)}`);
  }
  lines.push(`• *Amount Due:* ${formatCurrency(order.grand_total)}`);
  lines.push(`• Deliver To: ${deliveryCity}`);
  lines.push(`• Payment Status: Awaiting Payment`);

  lines.push(``);
  lines.push(`I would like to verify payment or complete it via direct bank transfer. Please assist me!`);

  return `https://wa.me/${toWhatsAppDigits(supportPhone)}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/**
 * Official Payment Receipt sent AFTER payment is confirmed.
 */
export function buildWhatsAppReceiptUrl(order: WhatsAppOrderDetails, supportPhone?: string | null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // The guest access key is never put in a chat message; the store tracks orders by number.
  const trackingUrl = `${origin}/track-order?order=${encodeURIComponent(order.order_number)}`;

  const customerName = order.shipping_address?.full_name || 'Customer';
  const deliveryCity = [order.shipping_address?.city, order.shipping_address?.state]
    .filter(Boolean)
    .join(', ') || 'Nigeria';

  const items = order.items || [];
  const itemsCount = items.reduce((acc, item) => acc + (item.quantity || 1), 0) || items.length;

  const lines: string[] = [
    `*SHOP.CO — PAYMENT RECEIPT*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Hello Support! My payment has been confirmed:`,
    ``,
    `• *Order Ref:* ${order.order_number}`,
    `• *Customer:* ${customerName}`,
  ];

  if (items.length > 0) {
    lines.push(``);
    lines.push(`*Items Ordered (${itemsCount}):*`);
    items.forEach((item) => {
      const title = item.name || item.product_name || 'Item';
      const unitPrice = item.price ?? item.unit_price ?? 0;
      const itemPrice = item.line_total ?? (unitPrice * (item.quantity || 1));
      const sizeStr = item.size ? ` · Size: ${item.size}` : '';
      lines.push(``);
      lines.push(`• *${title}*`);
      lines.push(`  Qty: ${item.quantity || 1}${sizeStr}`);
      lines.push(`  ${formatCurrency(itemPrice)}`);
    });
  }

  lines.push(``);
  lines.push(`*Payment Breakdown:*`);
  if (order.subtotal !== undefined) {
    lines.push(`• Subtotal: ${formatCurrency(order.subtotal)}`);
  }
  if (order.discount_amount && order.discount_amount > 0) {
    lines.push(`• Discount: -${formatCurrency(order.discount_amount)}`);
  }
  if (order.shipping_fee !== undefined) {
    lines.push(`• Delivery: ${formatCurrency(order.shipping_fee)}`);
  }
  lines.push(`• *Amount Paid:* ${formatCurrency(order.grand_total)}`);
  lines.push(`• Deliver To: ${deliveryCity}`);
  lines.push(`• Payment Status: PAID & VERIFIED`);
  lines.push(`• Tracking Link: ${trackingUrl}`);

  lines.push(``);
  lines.push(`Please provide packaging and courier dispatch updates. Thank you!`);

  return `https://wa.me/${toWhatsAppDigits(supportPhone)}?text=${encodeURIComponent(lines.join('\n'))}`;
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
