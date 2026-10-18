import { HomeClient } from '@/components/home/HomeClient';
import type { HomepageData } from '@/lib/api-client';
import { serverApiGet } from '@/lib/server-api';

// Rebuilt at most once a minute; every visitor in between gets the ready-made page.
export const revalidate = 60;

export default async function HomePage() {
  const initial = await serverApiGet<HomepageData>('/storefront/homepage');
  return <HomeClient initial={initial} />;
}
