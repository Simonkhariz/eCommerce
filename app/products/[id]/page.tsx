import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetailClient } from '@/components/product/ProductDetailClient';

const BACKEND_ORIGIN = (process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8000').replace(/\/$/, '');

interface ProductMeta {
  name: string;
  description?: string | null;
  primary_image?: string | null;
  images?: Array<{ image_url: string; is_primary?: number | boolean }>;
}

/**
 * Server-side product lookup for metadata and the 404 check (the page itself loads on the client).
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

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const product = await lookupProduct(params.id);
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

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  if ((await lookupProduct(params.id)) === 'missing') notFound();
  return <ProductDetailClient id={decodeURIComponent(params.id)} />;
}
