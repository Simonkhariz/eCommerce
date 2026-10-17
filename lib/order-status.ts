/**
 * Customer-facing wording for order and payment states, shared by "My orders" and "Track order".
 */

export type StatusTone = 'amber' | 'blue' | 'green' | 'neutral' | 'red';

export interface OrderStatusDisplay {
  label: string;
  tone: StatusTone;
  /** One-line explanation for the customer. */
  description: string;
  /** Whether the customer can still pay for this order. */
  canPay: boolean;
}

function isExpired(expiresAt?: string | null): boolean {
  return !!expiresAt && new Date(expiresAt.replace(' ', 'T')).getTime() <= Date.now();
}

export function getOrderStatusDisplay(
  orderStatus: string,
  paymentStatus?: string | null,
  expiresAt?: string | null
): OrderStatusDisplay {
  switch (orderStatus) {
    case 'pending_payment':
      return isExpired(expiresAt)
        ? { label: 'Payment window closed', tone: 'neutral', description: 'This order was not paid in time and will be cancelled.', canPay: false }
        : {
            label: 'Awaiting payment',
            tone: 'amber',
            description: paymentStatus === 'failed' ? 'The last payment attempt failed. You can try again.' : 'Complete payment to confirm this order.',
            canPay: true,
          };
    case 'paid':
      return { label: 'Paid', tone: 'green', description: 'Payment confirmed. We are preparing your order.', canPay: false };
    case 'processing':
      return { label: 'Processing', tone: 'blue', description: 'Your order is being packed.', canPay: false };
    case 'shipped':
      return { label: 'Shipped', tone: 'blue', description: 'Your order is on its way.', canPay: false };
    case 'delivered':
      return { label: 'Delivered', tone: 'green', description: 'Your order has been delivered.', canPay: false };
    case 'completed':
      return { label: 'Completed', tone: 'green', description: 'This order is complete.', canPay: false };
    case 'returned':
      return { label: 'Returned', tone: 'amber', description: 'The parcel was returned to the store.', canPay: false };
    case 'refund_pending':
      return { label: 'Refund in progress', tone: 'amber', description: 'Your refund is being processed.', canPay: false };
    case 'refunded':
      return { label: 'Refunded', tone: 'neutral', description: 'This order was refunded.', canPay: false };
    case 'cancelled':
      return paymentStatus === 'successful'
        ? { label: 'Cancelled – refund due', tone: 'amber', description: 'This order was cancelled after payment. The store will refund you.', canPay: false }
        : paymentStatus === 'refunded'
          ? { label: 'Cancelled & refunded', tone: 'neutral', description: 'This order was cancelled and refunded.', canPay: false }
          : { label: 'Cancelled', tone: 'neutral', description: 'This order was cancelled. No payment was taken.', canPay: false };
    default:
      return { label: orderStatus.replace(/_/g, ' '), tone: 'neutral', description: '', canPay: false };
  }
}

export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  amber: 'bg-amber-50 text-amber-900 border border-amber-200',
  blue: 'bg-blue-50 text-blue-900 border border-blue-200',
  green: 'bg-emerald-50 text-emerald-900 border border-emerald-200',
  neutral: 'bg-neutral-100 text-neutral-800 border border-neutral-200',
  red: 'bg-red-50 text-red-900 border border-red-200',
};
