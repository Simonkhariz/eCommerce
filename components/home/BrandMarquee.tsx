import { BRAND_LOGOS, brandKey } from '@/lib/brand-logos';

/** Wordmark looks for brands that have no logo in lib/brand-logos.ts. */
const WORDMARK_CLASS: Record<string, string> = {
  gucci: 'font-serif uppercase tracking-[0.28em]',
  calvinklein: 'uppercase font-light tracking-[0.32em]',
  tommyhilfiger: 'uppercase font-bold tracking-[0.12em]',
  levis: 'font-black italic tracking-tight',
  versace: 'font-serif uppercase tracking-[0.3em]',
  prada: 'font-serif uppercase tracking-[0.24em]',
};

function Brand({ name }: { name: string }) {
  const key = brandKey(name);
  const logo = BRAND_LOGOS[key];
  if (logo) {
    const [, , w, h] = logo.viewBox.split(' ').map(Number);
    return (
      <svg
        role="img"
        aria-label={name}
        viewBox={logo.viewBox}
        className="h-7 w-auto shrink-0 fill-current sm:h-9"
        // Very flat wordmarks (ratio over 3:1) are drawn a little shorter so they look the same size.
        style={w / h > 3 ? { height: '1.35rem' } : undefined}
      >
        <path d={logo.path} />
      </svg>
    );
  }
  return (
    <span className={`shrink-0 whitespace-nowrap text-xl sm:text-3xl ${WORDMARK_CLASS[key] ?? 'font-bold uppercase tracking-wide'}`}>
      {name}
    </span>
  );
}

/**
 * Scrolling strip of the brands the store carries (admin Settings → "storefront_brands").
 * Hidden when no brands are set.
 */
export function BrandMarquee({ brands }: { brands?: string[] }) {
  const list = (brands ?? []).map((b) => b.trim()).filter(Boolean);
  if (list.length === 0) return null;
  // Enough copies that one copy is wider than the screen, then the whole set twice for the loop.
  const copy = list.length < 6 ? [...list, ...list, ...list] : list;

  return (
    // !mt-0: sits flush under the hero banner (the home page spaces its other sections).
    <section aria-label="Brands we stock" className="!mt-0 bg-black py-6 text-white sm:py-9">
      <div
        className="marquee overflow-hidden"
        style={{ maskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)' }}
      >
        <ul className="marquee-track flex w-max items-center" style={{ ['--marquee-duration' as string]: `${copy.length * 3.5}s` }}>
          {[0, 1].map((half) =>
            copy.map((name, i) => (
              <li key={`${half}-${i}`} aria-hidden={half === 1 || i >= list.length ? true : undefined} className="flex items-center px-7 sm:px-12">
                <Brand name={name} />
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
