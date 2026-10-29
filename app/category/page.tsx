import { Suspense } from 'react';
import { CatalogClient, type CatalogSeed } from '@/components/catalog/CatalogClient';
import type { ApiProductSummary, CatalogFacets, PaginationMeta } from '@/lib/api-client';
import { buildCatalogUrl, catalogApiParams, parseCatalogParams, productListFrom, productListPath, urlParamsFrom } from '@/lib/catalog-query';
import { serverApiGet, serverApiGetFull } from '@/lib/server-api';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The catalogue is sent with its first results and filter options already in the page, like
 * the home and product pages, instead of loading them in the browser after the scripts run.
 * If the API can't be reached the page still renders and the browser loads them itself.
 */
export default async function CategoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = parseCatalogParams(urlParamsFrom(await searchParams));
  const category = filters.category?.toLowerCase() ?? '';
  const [list, facets] = await Promise.all([
    serverApiGetFull<ApiProductSummary[], Partial<PaginationMeta>>(productListPath(catalogApiParams(filters)), 30),
    serverApiGet<CatalogFacets>(category ? `/catalog/facets?category=${encodeURIComponent(category)}` : '/catalog/facets'),
  ]);

  const seed: CatalogSeed = {
    key: buildCatalogUrl(filters),
    products: list ? productListFrom(list.data, list.meta) : null,
    facets: facets ? { category, facets } : null,
  };

  return (
    <Suspense fallback={<div className="p-12 text-center text-neutral-700">Loading catalogue…</div>}>
      <CatalogClient seed={seed} />
    </Suspense>
  );
}
