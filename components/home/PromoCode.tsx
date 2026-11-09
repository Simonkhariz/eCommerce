import { ApiPromotion } from '@/lib/api-client';
import { formatPrice } from '@/lib/currency';

/**
 * The advertised offer in a few words: "₦5,000 off orders of ₦30,000+", "10% off orders of
 * ₦20,000+ (up to ₦10,000)". The minimum spend comes before the cap, so on a narrow screen it is
 * the cap that gets cut short.
 */
export function offerText(p: ApiPromotion): string {
  const fixed = p.discount_type === 'fixed';
  const value = Number(p.discount_value ?? p.discount_percent);
  const off = fixed ? `${formatPrice(value)} off` : `${Number(p.discount_percent || value)}% off`;
  const min = Number(p.min_order_amount ?? 0);
  const cap = Number(p.max_discount_amount ?? 0);
  return [off, min > 0 ? `orders of ${formatPrice(min)}+` : 'your order', !fixed && cap > 0 ? `(up to ${formatPrice(cap)})` : '']
    .filter(Boolean)
    .join(' ');
}

/** The code in a dashed coupon outline, then the offer in short, on one line. */
export function PromoCode({ promo, className = '' }: { promo: ApiPromotion; className?: string }) {
  return (
    <p className={`flex max-w-full items-center gap-2 whitespace-nowrap ${className}`} title={promo.label || undefined}>
      <span className="sr-only">Offer: use code</span>
      <span className="shrink-0 rounded-md border border-dashed border-black/40 px-1.5 py-px font-semibold tracking-wider text-black">{promo.code}</span>
      <span className="min-w-0 truncate">{offerText(promo)}</span>
    </p>
  );
}

/**
 * Phones and tablets: a slim strip just under the menu, outside the first screen. There the hero
 * fills the screen and its picture takes whatever height is left, so a code inside the hero shrank
 * the picture, and one on the picture covered it. Hidden on computers, where the code sits above
 * the heading beside the picture instead (HeroBanner).
 */
export function PromoStrip({ promo }: { promo: ApiPromotion | null | undefined }) {
  if (!promo) return null;
  return (
    <div className="border-b border-black/5 bg-white px-4 py-2 sm:px-6 lg:hidden">
      <PromoCode promo={promo} className="mx-auto max-w-7xl justify-center text-xs text-neutral-600 sm:text-sm" />
    </div>
  );
}
