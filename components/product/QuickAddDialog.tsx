'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { Product, ProductColor } from '@/types';
import { useCart, MAX_QUANTITY_PER_LINE } from '@/context/CartContext';
import { Dialog } from '@/components/ui/Dialog';
import { VariantSelector } from '@/components/product/VariantSelector';
import { formatPrice } from '@/lib/currency';
import { colorStockFor, findVariant, firstChoice, sizeAfterColorChange, sizeStatesFor, stockMessageFor } from '@/lib/variants';

/**
 * Choose a colour and size and add to the cart without leaving the list (a bottom sheet on
 * phones). Opened by a product card when the product comes in more than one option.
 */
export function QuickAddDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const router = useRouter();
  const { addToCart } = useCart();
  const variants = useMemo(() => product.variants ?? [], [product]);
  const start = firstChoice(product);
  const [selectedColor, setSelectedColor] = useState<ProductColor | null>(start?.color ?? null);
  const [selectedSize, setSelectedSize] = useState<string | null>(start?.size ?? null);
  const [quantity, setQuantity] = useState(1);

  const selectedVariant = findVariant(variants, selectedColor, selectedSize);
  const stock = selectedVariant?.stock ?? 0;
  const canPurchase = !!selectedVariant && stock > 0;
  const price = selectedVariant?.price ?? product.price;
  const href = `/products/${product.slug}`;

  const add = () => {
    if (!selectedVariant || !canPurchase) return false;
    addToCart(product, selectedVariant, quantity); // shows the "Added to cart" notice
    onClose();
    return true;
  };

  // Rendered into <body>: product cards sit inside sections that clip fixed overlays
  // (content-visibility on the home page, hover transforms).
  return createPortal(
    <Dialog open onClose={onClose} title={`Add ${product.name} to cart`} panelClassName="w-full max-w-md">
      <div className="relative max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <button
          type="button"
          onClick={onClose}
          data-close
          className="absolute right-3 top-3 rounded-full p-2 text-neutral-600 hover:bg-neutral-100 hover:text-black"
          aria-label="Close"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} aria-hidden="true" />
        </button>

        <div className="mb-5 flex items-center gap-4 pr-8">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#F0EEED]">
            {product.images[0] && <Image src={product.images[0]} alt="" fill sizes="80px" className="object-cover" />}
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 font-bold text-black">{product.name}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-bold text-black">{formatPrice(price)}</span>
              {product.originalPrice && product.originalPrice > price && (
                <span className="text-sm font-semibold text-neutral-600 line-through">
                  <span className="sr-only">Was </span>
                  {formatPrice(product.originalPrice)}
                </span>
              )}
            </p>
          </div>
        </div>

        <VariantSelector
          colors={product.colors}
          sizes={product.sizes}
          selectedColor={selectedColor}
          onSelectColor={(color) => {
            setSelectedColor(color);
            setQuantity(1);
            setSelectedSize(sizeAfterColorChange(variants, color, selectedSize));
          }}
          selectedSize={selectedSize}
          onSelectSize={(size) => {
            setSelectedSize(size);
            setQuantity(1);
          }}
          sizeStates={sizeStatesFor(product.sizes, variants, selectedColor)}
          colorInStock={colorStockFor(variants)}
          quantity={quantity}
          maxQuantity={Math.max(1, Math.min(MAX_QUANTITY_PER_LINE, stock))}
          onQuantityChange={setQuantity}
          canPurchase={canPurchase}
          stockMessage={stockMessageFor(selectedVariant, variants.length)}
          onAddToCart={add}
          onBuyNow={() => {
            if (add()) router.push('/cart');
          }}
        />

        <Link href={href} onClick={onClose} className="mt-4 block text-center text-sm font-semibold text-neutral-700 underline hover:no-underline">
          View full details
        </Link>
      </div>
    </Dialog>,
    document.body
  );
}
