/**
 * Currency formatting utilities for Shop.co Storefront
 * Default currency is Nigerian Naira (NGN - ₦) as established in the system blueprint.
 */

export const STORE_CURRENCY = 'NGN';
export const STORE_CURRENCY_SYMBOL = '₦';

/**
 * Format a numeric amount into Nigerian Naira (₦).
 * e.g., 14500 -> "₦14,500"
 */
export function formatPrice(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '₦0';
  }
  const formatted = Math.round(amount).toLocaleString('en-NG');
  return `${STORE_CURRENCY_SYMBOL}${formatted}`;
}

/**
 * Format a numeric amount with optional decimal precision.
 */
export function formatCurrency(amount: number | null | undefined, includeDecimals = false): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '₦0.00';
  }
  if (!includeDecimals) {
    return formatPrice(amount);
  }
  const formatted = amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${STORE_CURRENCY_SYMBOL}${formatted}`;
}
