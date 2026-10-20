'use client';

/**
 * Shared admin UI: dialogs, confirmations, toasts, pagination, page headers, status pills,
 * form fields and loading / empty / error states. Every admin screen uses these instead of
 * window.alert / window.confirm or hand-rolled overlays.
 */

import React, { createContext, useCallback, useContext, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, RefreshCw, X } from 'lucide-react';
import type { StatusTone } from '@/lib/order-status';
import type { PaginationMeta } from '@/lib/admin-api';
import { ApiError } from '@/lib/api-client';

// =============================================================================
// Buttons
// =============================================================================

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[#111827] text-white hover:bg-black border border-[#111827]',
  secondary: 'bg-white text-[#1f2937] border border-[#d1d5db] hover:bg-[#f9fafb]',
  danger: 'bg-red-600 text-white border border-red-600 hover:bg-red-700',
  ghost: 'bg-transparent text-[#374151] border border-transparent hover:bg-black/[0.04]',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, disabled, className = '', children, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/50 disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-[13px]'
      } ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

// =============================================================================
// Modal (role="dialog", Escape closes, focus moves in and is restored, Tab is trapped)
// =============================================================================

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Block closing (e.g. while a request is in flight). */
  busy?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, description, children, footer, size = 'md', busy = false }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Escape always uses the latest onClose / busy without re-running the focus effect.
  const closeOnEscape = useEffectEvent((): boolean => {
    if (busy) return false;
    onClose();
    return true;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape()) {
        e.stopPropagation();
      }
      if (e.key === 'Tab' && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`animate-rise relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl ${width}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#f3f4f6] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[#111827]">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-1 text-[13px] text-[#6b7280]">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-m-2 rounded-md p-2 text-[#6b7280] outline-none hover:bg-black/[0.05] hover:text-[#111827] focus-visible:ring-[3px] focus-visible:ring-[#9ca3af]/50 disabled:opacity-40"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-[#f3f4f6] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// =============================================================================
// Confirm dialog (promise based): const ok = await confirm({...})
// =============================================================================

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  );

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>{pending?.cancelLabel ?? 'Cancel'}</Button>
            <Button data-autofocus variant={pending?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
              {pending?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {pending?.message && <div className="text-[13px] leading-relaxed text-[#374151]">{pending.message}</div>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <AdminUiProvider>');
  return ctx;
}

// =============================================================================
// Toasts
// =============================================================================

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
    },
    [dismiss]
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-[13px] text-[#1f2937] shadow-lg sm:w-96"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : t.kind === 'error' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden="true" />
            )}
            <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-m-0.5 rounded p-0.5 text-[#9ca3af] hover:text-[#111827]"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <AdminUiProvider>');
  return ctx;
}

/** Set by AdminUiProvider: how redirectIfSignedOut navigates (Next's router). */
let navigateTo: ((href: string) => void) | null = null;

export function AdminUiProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    navigateTo = (href) => router.replace(href);
    return () => {
      navigateTo = null;
    };
  }, [router]);

  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * If the admin session has expired (401), send the admin to the login page and return true.
 * Call it in catch blocks of admin actions so an expired session never looks like a broken screen.
 */
export function redirectIfSignedOut(err: unknown): boolean {
  if (err instanceof ApiError && err.statusCode === 401 && typeof window !== 'undefined' && navigateTo) {
    const next = window.location.pathname + window.location.search;
    navigateTo(`/admin/login?next=${encodeURIComponent(next)}&expired=1`);
    return true;
  }
  return false;
}

/**
 * List filters kept in the URL query string (so reloads, back/forward and shared links keep them).
 * `defaults` lists every key the screen uses; values equal to the default are left out of the URL.
 * Changing any filter other than `page` resets `page` to 1.
 */
export function useUrlFilters<K extends string>(defaults: Record<K, string>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = {} as Record<K, string>;
  (Object.keys(defaults) as K[]).forEach((key) => {
    values[key] = searchParams?.get(key) ?? defaults[key];
  });

  const defaultsRef = useRef(defaults);
  const set = useCallback(
    (changes: Partial<Record<K, string>>) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      const touchesOtherThanPage = Object.keys(changes).some((k) => k !== 'page');
      Object.entries(changes).forEach(([key, value]) => {
        const v = value as string | undefined;
        if (v === undefined || v === '' || v === defaultsRef.current[key as K]) next.delete(key);
        else next.set(key, v);
      });
      if (touchesOtherThanPage && !('page' in changes)) next.delete('page');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return [values, set] as const;
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Text for a list's search box, written to the URL filters (`search`) once typing pauses.
 * The box follows the URL too, so Back and Forward show the search that page was for.
 */
export function useSearchBox(search: string, setFilters: (changes: { search: string }) => void, delayMs = 300) {
  const [text, setText] = useState(search);
  const [shownFor, setShownFor] = useState(search);
  if (search !== shownFor) {
    setShownFor(search);
    // Our own update (a trimmed copy of the text) leaves the box alone, so a space typed
    // between words is not removed mid-typing.
    if (search !== text.trim()) setText(search);
  }
  const debounced = useDebouncedValue(text, delayMs);
  const apply = useEffectEvent((value: string) => {
    if (value.trim() !== search) setFilters({ search: value.trim() });
  });
  useEffect(() => {
    apply(debounced);
  }, [debounced]);
  return [text, setText] as const;
}

/**
 * Load data for a screen and reload when `deps` change. Out-of-order responses are ignored.
 * Returns data, loading, error and a reload() for retry buttons and after mutations.
 */
export function useAdminData<T>(loader: () => Promise<T>, deps: React.DependencyList) {
  // The latest loader, read only when a request starts (never during render).
  const loaderRef = useRef(loader);
  useLayoutEffect(() => {
    loaderRef.current = loader;
  });

  // One request per dependency set (plain values: filters, page...) and per reload().
  const depsKey = JSON.stringify(deps);
  const [reloads, setReloads] = useState(0);
  const [result, setResult] = useState<{ key: string | null; reloads: number; data: T | null; error: string | null }>({
    key: null,
    reloads: 0,
    data: null,
    error: null,
  });
  const waiting = useRef<Array<() => void>>([]);

  useEffect(() => {
    let current = true;
    loaderRef
      .current()
      .then(
        (data) => {
          if (current) setResult({ key: depsKey, reloads, data, error: null });
        },
        (err) => {
          if (redirectIfSignedOut(err) || !current) return;
          const error = err instanceof Error ? err.message : 'Could not load this page.';
          setResult((prev) => ({ key: depsKey, reloads, data: prev.data, error }));
        }
      )
      .finally(() => {
        if (!current) return;
        const done = waiting.current;
        waiting.current = [];
        done.forEach((resolve) => resolve());
      });
    // A newer request (filters changed, reload) makes this one's answer irrelevant.
    return () => {
      current = false;
    };
  }, [depsKey, reloads]);

  // Loading until the answer for the current filters and reload count has arrived; the last
  // data stays on screen meanwhile.
  const loading = result.key !== depsKey || result.reloads !== reloads;

  const setData = useCallback((update: React.SetStateAction<T | null>) => {
    setResult((prev) => ({ ...prev, data: typeof update === 'function' ? (update as (p: T | null) => T | null)(prev.data) : update }));
  }, []);

  /** Load again (retry buttons, after changes); resolves once the new data is in. */
  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiting.current.push(resolve);
        setReloads((n) => n + 1);
      }),
    []
  );

  return { data: result.data, setData, loading, error: loading ? null : result.error, reload };
}

// =============================================================================
// Layout pieces
// =============================================================================

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-medium tracking-tight text-[#1f2937]">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-[#6b7280]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  // Same card frame as the overview: a muted, hatched frame with the title in it and the
  // content on a white panel inside.
  return (
    <section className={`relative min-w-0 overflow-clip rounded-xl bg-[#f6f6f6] p-1 shadow-[inset_0_0_0_0.8px_#e5e7eb] ${className}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[url('/admin/card-pattern.svg')] bg-[length:1639px_560px] bg-[position:center_top] bg-no-repeat"
      />
      {(title || actions) && (
        <div className="relative flex min-h-[36px] flex-wrap items-center justify-between gap-2 px-2 py-1.5">
          {title && <h2 className="text-sm font-medium text-[#4b5563]">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`relative overflow-hidden rounded-[10px] border-[0.8px] border-[#e5e7eb] bg-white ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** A filter bar that wraps on small screens. */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>;
}

const STATUS_DOT: Record<StatusTone, string> = {
  amber: 'bg-[#f59e0b]',
  blue: 'bg-[#3b82f6]',
  green: 'bg-[#10b981]',
  neutral: 'bg-[#9ca3af]',
  red: 'bg-[#ef4444]',
};

/** Status badge in the overview's style: a coloured dot on a white badge. */
export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium ${
        tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-[#e5e7eb] bg-white text-[#374151]'
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 px-4 py-12 text-[13px] text-[#6b7280]">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
      <p className="text-[13px] font-semibold text-[#111827]">{title}</p>
      {description && <p className="max-w-md text-[13px] text-[#6b7280]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <AlertTriangle className="size-5 text-red-600" aria-hidden="true" />
      <p className="max-w-md text-[13px] text-[#374151]">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

/** Loading / error / empty / content switch for a list or panel body. */
export function DataState({
  loading,
  error,
  empty,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  children,
  hasData,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  /** When true, keep showing current content while a refresh runs. */
  hasData?: boolean;
  children: React.ReactNode;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !hasData) return <LoadingState />;
  if (empty) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>{children}</div>;
}

// =============================================================================
// Tables
// =============================================================================

/** Horizontally scrollable table wrapper with consistent cell styles. */
/**
 * When the table does not fit (phones, tablets, a narrow window), each row becomes a card
 * with the column name beside every value (see `.admin-table` in globals.css). The column
 * names are copied from the header cells, so screens only write an ordinary table.
 */
export function Table({ children, minWidth = 720 }: { children: React.ReactNode; minWidth?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const labelCells = () => {
      const labels = Array.from(wrap.querySelectorAll('thead th')).map((th) => {
        const text = th.textContent?.trim() ?? '';
        // A header that is only visually hidden ("Actions") gets no label on the card.
        const hidden = th.querySelector('.sr-only')?.textContent?.trim();
        return hidden && hidden === text ? '' : text;
      });
      wrap.querySelectorAll('tbody tr').forEach((tr) => {
        let column = 0;
        Array.from(tr.children).forEach((cell) => {
          const span = (cell as HTMLTableCellElement).colSpan || 1;
          const label = span > 1 ? '' : labels[column] ?? '';
          if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
          column += span;
        });
      });
    };
    // Cards whenever the table would not fit: narrower than its minimum width, or content
    // wider than the space (a long email, an action button). The width the table needed is
    // remembered, so it only turns back into a table once there is room for it. (Measuring
    // right after switching is unreliable: browsers settle a table's width a frame later.)
    let stacked = false;
    let needed = minWidth;
    const layout = () => {
      const width = wrap.clientWidth;
      if (!stacked) {
        if (width < minWidth || wrap.scrollWidth > width + 1) {
          needed = Math.max(minWidth, wrap.scrollWidth);
          stacked = true;
          wrap.setAttribute('data-stacked', '');
        }
      } else if (width >= needed) {
        // Try the table again; the size observer re-checks it once it has been laid out.
        stacked = false;
        wrap.removeAttribute('data-stacked');
      }
    };
    labelCells();
    layout();

    // Rows change when data loads, pages change or a row expands: the content may now fit.
    const rows = new MutationObserver(() => {
      labelCells();
      needed = minWidth;
      layout();
    });
    rows.observe(wrap, { childList: true, subtree: true, characterData: true });
    // The space changes (window, sidebar) or the content's width does (web fonts, images).
    const size = new ResizeObserver(layout);
    size.observe(wrap);
    const table = wrap.querySelector('table');
    if (table) size.observe(table);
    document.fonts?.addEventListener('loadingdone', layout);
    return () => {
      rows.disconnect();
      size.disconnect();
      document.fonts?.removeEventListener('loadingdone', layout);
    };
  }, [minWidth]);

  return (
    // `relative` keeps visually-hidden labels inside the scroll area; without it they are
    // positioned against the page and make phones zoom out to the table's full width.
    <div ref={wrapRef} className="admin-table relative w-full overflow-x-auto">
      <table
        className="w-full border-collapse text-left text-[13px] [&_td]:border-t [&_td]:border-[#f3f4f6] [&_td]:px-4 [&_td]:py-2.5 [&_td]:align-middle [&_th]:whitespace-nowrap [&_th]:bg-[#f9fafb] [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-[13px] [&_th]:font-normal [&_th]:text-[#4b5563]"
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

// =============================================================================
// Pagination
// =============================================================================

/**
 * Page through a short list the API returns in full (categories, banners, delivery zones),
 * so no admin table renders an unlimited number of rows.
 */
export function useClientPagination<T>(items: T[], perPage = 20) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  // Deleting the last row of the last page shows the page before it.
  const current = Math.min(page, totalPages);

  return {
    pageItems: items.slice((current - 1) * perPage, current * perPage),
    meta: { page: current, per_page: perPage, total: items.length, total_pages: totalPages } as PaginationMeta,
    setPage,
  };
}

export function Pagination({ meta, onPage }: { meta: PaginationMeta | null | undefined; onPage: (page: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const { page, per_page, total, total_pages } = meta;
  const from = (page - 1) * per_page + 1;
  const to = Math.min(total, page * per_page);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f3f4f6] px-4 py-2.5 text-xs text-[#6b7280]">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <span className="px-1 tabular-nums">
          Page {page} of {Math.max(1, total_pages)}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= total_pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

// =============================================================================
// Form fields
// =============================================================================

const INPUT_CLASS =
  'w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-[13px] text-[#111827] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#6b7280] focus:shadow-[0_0_0_3px_rgba(156,163,175,0.25)] disabled:bg-[#f9fafb] disabled:text-[#6b7280] aria-[invalid=true]:border-red-400';

export const inputClass = INPUT_CLASS;

interface FieldProps {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode;
}

/** Label + control + hint/error, wired with htmlFor / aria-describedby. */
export function Field({ label, hint, error, required, className = '', children }: FieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-[#374151]">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? descId : undefined })}
      {error ? (
        <p id={descId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="mt-1 text-xs text-[#6b7280]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_CLASS} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${INPUT_CLASS} min-h-[88px] ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${INPUT_CLASS} pr-8 ${props.className ?? ''}`} />;
}

/** Compact select for toolbars, with a visually hidden label. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-[#d1d5db] bg-white px-2.5 pr-8 text-[13px] text-[#111827] outline-none focus:border-[#6b7280] focus:shadow-[0_0_0_3px_rgba(156,163,175,0.25)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const id = useId();
  return (
    <div className="min-w-[200px] flex-1 sm:max-w-xs">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-[#d1d5db] bg-white px-3 text-[13px] text-[#111827] outline-none placeholder:text-[#9ca3af] focus:border-[#6b7280] focus:shadow-[0_0_0_3px_rgba(156,163,175,0.25)]"
      />
    </div>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-[#d1d5db] accent-[#111827]"
      />
      <label htmlFor={id} className="text-[13px] text-[#1f2937]">
        {label}
        {hint && <span className="block text-xs text-[#6b7280]">{hint}</span>}
      </label>
    </div>
  );
}

/** Small key/value list for detail panels. */
export function DetailList({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-[#6b7280]">{item.label}</dt>
          <dd className="mt-0.5 break-words text-[#111827]">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger'; children: React.ReactNode }) {
  const styles =
    tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-900'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-blue-200 bg-blue-50 text-blue-900';
  return <div className={`rounded-lg border px-3 py-2 text-[13px] leading-relaxed ${styles}`}>{children}</div>;
}
