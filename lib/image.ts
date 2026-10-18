/**
 * Hosts next/image may resize (must match images.remotePatterns in next.config.mjs).
 * Store images (/images/..., /uploads/...) are always resized for the visitor's screen;
 * a link to any other site is shown as it is, because the image optimiser refuses unknown hosts.
 */
const OPTIMIZED_HOSTS = ['images.unsplash.com', 'images.pexels.com', 'cdn.dummyjson.com'];

export function canOptimizeImage(src: string | null | undefined): boolean {
  if (!src) return false;
  if (src.startsWith('/') && !src.startsWith('//')) return !src.toLowerCase().endsWith('.svg');
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && OPTIMIZED_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}
