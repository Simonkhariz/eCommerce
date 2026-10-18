/**
 * Public API reads made by the Next.js server while it builds a page, so pages arrive with
 * their content instead of loading it in the browser afterwards. Responses are reused for
 * `revalidate` seconds. Any failure returns null and the page falls back to loading in the
 * browser, so a slow or offline API never breaks the page.
 */
const BACKEND_ORIGIN = (process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8000').replace(/\/$/, '');

export async function serverApiGet<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_ORIGIN}/api/v1${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: T };
    return json.success && json.data !== undefined ? json.data : null;
  } catch {
    return null;
  }
}
