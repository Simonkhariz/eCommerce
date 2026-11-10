import type { Product, ProductColor, ProductVariant } from '@/types';

/** 'available' = in stock, 'sold-out' = offered but no stock, 'unavailable' = not offered in this colour. */
export type OptionState = 'available' | 'sold-out' | 'unavailable';

/** Start on the first option that is actually in stock (else the first option). */
export function firstChoice(product: Product | null | undefined): ProductVariant | undefined {
  const variants = product?.variants ?? [];
  return variants.find((v) => v.stock > 0) ?? variants[0];
}

/** The variant for a colour and size, if the product is made that way. */
export function findVariant(variants: ProductVariant[], color: ProductColor | null, size: string | null): ProductVariant | null {
  return variants.find((v) => v.color.name === color?.name && v.size === size) ?? null;
}

/** Availability of each size in the chosen colour. */
export function sizeStatesFor(sizes: string[], variants: ProductVariant[], color: ProductColor | null): Record<string, OptionState> {
  const states: Record<string, OptionState> = {};
  for (const size of sizes) {
    const v = variants.find((x) => x.size === size && x.color.name === color?.name);
    states[size] = !v ? 'unavailable' : v.stock > 0 ? 'available' : 'sold-out';
  }
  return states;
}

/** The sizes to offer: only those in stock in the chosen colour (sold-out and not-made sizes are left out). */
export function visibleSizes(sizes: string[], states: Record<string, OptionState>): string[] {
  return sizes.filter((size) => states[size] === 'available');
}

/** Whether each colour has any size in stock. */
export function colorStockFor(variants: ProductVariant[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const v of variants) map[v.color.name] = (map[v.color.name] ?? false) || v.stock > 0;
  return map;
}

/**
 * When the colour changes: keep the chosen size if that colour has it in stock. If it does not,
 * no size is chosen (the shopper picks again): swapping M for S behind their back would put the
 * wrong size in the cart. With no size chosen yet, a colour that comes in a single size takes it.
 */
export function sizeAfterColorChange(variants: ProductVariant[], color: ProductColor, size: string | null): string | null {
  const inStock = variants.filter((v) => v.color.name === color.name && v.stock > 0);
  if (inStock.some((v) => v.size === size)) return size;
  return size === null && inStock.length === 1 ? inStock[0].size : null;
}

/** Short stock line under the options. */
export function stockMessageFor(variant: ProductVariant | null, variantCount: number): string | null {
  if (!variant) return variantCount === 0 ? 'This product is not available to order right now.' : 'Choose a size to continue.';
  if (variant.stock === 0) return 'Sold out in this colour and size.';
  if (variant.stock <= 5) return `Only ${variant.stock} left in this size.`;
  return null;
}
