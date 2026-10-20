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

/** Whether each colour has any size in stock. */
export function colorStockFor(variants: ProductVariant[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const v of variants) map[v.color.name] = (map[v.color.name] ?? false) || v.stock > 0;
  return map;
}

/** When the colour changes: keep the size if that colour has it, else its best available size. */
export function sizeAfterColorChange(variants: ProductVariant[], color: ProductColor, size: string | null): string | null {
  const forColor = variants.filter((v) => v.color.name === color.name);
  if (forColor.some((v) => v.size === size)) return size;
  const best = forColor.find((v) => v.stock > 0) ?? forColor[0];
  return best ? best.size : null;
}

/** Short stock line under the options. */
export function stockMessageFor(variant: ProductVariant | null, variantCount: number): string | null {
  if (!variant) return variantCount === 0 ? 'This product is not available to order right now.' : 'Choose an available colour and size.';
  if (variant.stock === 0) return 'Sold out in this colour and size.';
  if (variant.stock <= 5) return `Only ${variant.stock} left in this size.`;
  return null;
}
