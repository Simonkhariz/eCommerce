import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetailClient } from '@/components/product/ProductDetailClient';
import type { ApiProductDetail } from '@/lib/api-client';

const BACKEND_ORIGIN = (process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8000').replace(/\/$/, '');

type ProductMeta = ApiProductDetail & {
  images?: Array<{ image_url: string; is_primary?: number | boolean }>;
};

/**
 * Server-side product lookup, shared by the metadata and the page (Next.js runs the fetch once),
 * so the page is sent with the product already in it; the client then refreshes stock.
 * Returns 'missing' only when the API says the product does not exist; network errors return null.
 */
async function lookupProduct(idOrSlug: string): Promise<ProductMeta | 'missing' | null> {
  try {
    const res = await fetch(`${BACKEND_ORIGIN}/api/v1/products/${encodeURIComponent(idOrSlug)}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });
    if (res.status === 404) return 'missing';
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: ProductMeta };
    return json.success && json.data ? json.data : null;
  } catch {
    return null;
  }
}

function summarise(text: string | null | undefined, max = 155): string | undefined {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await lookupProduct(id);
  if (!product || product === 'missing') {
    return { title: 'Product | SHOP.CO' };
  }

  const description = summarise(product.description);
  const primary =
    product.images?.find((img) => img.is_primary === true || img.is_primary === 1)?.image_url ??
    product.images?.[0]?.image_url ??
    product.primary_image ??
    null;
  // Relative image paths need a metadataBase to become absolute; only share absolute https images.
  const ogImage = primary && /^https:\/\//i.test(primary) ? primary : null;

  return {
    title: `${product.name} | SHOP.CO`,
    description,
    openGraph: {
      title: product.name,
      description,
      type: 'website',
      ...(ogImage ? { images: [{ url: ogImage, alt: product.name }] } : {}),
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await lookupProduct(id);
  if (product === 'missing') notFound();
  return <ProductDetailClient id={decodeURIComponent(id)} initial={product} />;
}
