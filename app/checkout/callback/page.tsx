'use client';

import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkBadge01Icon, AlertCircleIcon, Clock01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Printer, Download } from 'lucide-react';
import { toJpeg } from 'html-to-image';
import { formatPrice } from '@/lib/currency';
import { API_BASE_URL, ApiError, apiInitializePayment, apiMarkPaymentSent, errorMessage } from '@/lib/api-client';
import { POLL_DELAYS, paymentKeys, paymentOrderQuery, paymentStatusQuery, paymentViewFor, type PaymentView } from '@/lib/payment-queries';
import { LIVE_VERIFY_DELAYS, MAX_RECONNECTS, RECONNECT_MS, isNewerState, openPaymentStream, type LiveState } from '@/lib/live-payment';
import { buildWhatsAppInvoiceUrl, buildWhatsAppMessageUrl, buildWhatsAppReceiptUrl, formatSupportPhone, whatsAppOrderFrom } from '@/lib/whatsapp';
import { useStoreSupport } from '@/lib/use-store-support';
import { useCart } from '@/context/CartContext';
import { clearPendingOrder, markInvoiceSent, saveGuestToken } from '@/lib/pending-order';
import { useGuestToken, useInvoiceSent } from '@/lib/use-order-data';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';

type ViewState = 'checking' | PaymentView | 'error';

const noSubscribe = () => () => {};

function readParam(searchParams: URLSearchParams, keys: string[]): string {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) return value.split('?')[0];
  }
  return '';
}

function CheckoutCallbackContent() {
  const searchParams = useSearchParams();
  const reference = readParam(searchParams, ['reference', 'paymentReference', 'trxref', 'transactionReference']);
  let orderNumber = readParam(searchParams, ['order', 'order_number']);
  if (!orderNumber && /^(PAY|MNFY)-ORD-/.test(reference)) {
    const parts = reference.split('-');
    orderNumber = parts.length >= 4 ? `ORD-${parts[2]}-${parts[3]}` : '';
  }

  const { completePaidOrder } = useCart();
  const { supportPhone, paymentMethods, livePaymentStatus } = useStoreSupport();

  // Guest access key and "invoice sent", as saved on this device (they update when saved).
  const token = useGuestToken(orderNumber);
  const invoiceSent = useInvoiceSent(orderNumber);
  // The saved access key can only be read once the page is running in the browser; checking
  // before that would ask without it.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [keyInput, setKeyInput] = useState('');
  // The shopper's choice; until they pick, the store's default method.
  const [chosenRetryMethod, setRetryMethod] = useState<string>('');
  const retryMethod = chosenRetryMethod || (paymentMethods.find((m) => m.is_default) || paymentMethods[0])?.id || '';
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isSavingJpeg, setIsSavingJpeg] = useState(false);
  const [awaitingFlash, setAwaitingFlash] = useState(false);
  const celebrated = useRef(false);
  const settled = useRef(false);

  // Payment status (lib/payment-queries.ts). While it is pending the page checks again on the
  // back-off schedule, only while the tab is visible, and once more when the shopper comes
  // back to it. pollBase marks where "Check again" restarted the schedule.
  const [pollBase, setPollBase] = useState(0);
  // Live status (lib/live-payment.ts, docs/SSE_CONTRACT.md), when the server offers it: the
  // stream says the moment the payment is recorded, and the page then asks verify-payment for
  // the full answer. Meanwhile verify-payment (which asks the gateway) runs on a sparser
  // schedule. "failed" means the stream is not usable here: the usual schedule takes over.
  const [live, setLive] = useState<'idle' | 'open' | 'ended' | 'failed'>('idle');
  const [streamRun, setStreamRun] = useState(0);
  const liveMode = livePaymentStatus && live !== 'failed';
  const delays = liveMode ? LIVE_VERIFY_DELAYS : POLL_DELAYS;
  const queryClient = useQueryClient();
  const statusQuery = paymentStatusQuery(orderNumber, token ?? null, reference || null);
  const status = useQuery({
    ...statusQuery,
    enabled: hydrated && !!orderNumber,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || query.state.status === 'error' || paymentViewFor(data) !== 'pending') return false;
      const next = query.state.dataUpdateCount - 1 - pollBase;
      return next >= 0 && next < delays.length ? delays[next] : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) => !!query.state.data && paymentViewFor(query.state.data) === 'pending',
  });
  const result = status.data ?? null;
  // Answers received so far for this question (the page re-renders after each one).
  const answers = queryClient.getQueryState(statusQuery.queryKey)?.dataUpdateCount ?? 0;
  const pollIndex = Math.max(0, answers - 1 - pollBase);
  const checkingAutomatically = live === 'open' || pollIndex < delays.length;
  const isRefreshing = status.isFetching;
  const view: ViewState = !orderNumber
    ? 'error'
    : status.status === 'error'
      ? 'error'
      : result
        ? paymentViewFor(result)
        : 'checking';
  const message = !orderNumber
    ? 'This page is missing the order number. Use "Track order" with your order number and email instead.'
    : status.status === 'error'
      ? status.error instanceof ApiError && status.error.statusCode === 404
        ? 'We could not open this order from this device. Enter the access key from your order confirmation, or use "Track order" with your email.'
        : errorMessage(status.error, 'We could not check the payment right now.')
      : (result?.message ?? null);

  // Receipt details: asked once while the payment is open, and again once it is paid.
  const orderDetails = useQuery({
    ...paymentOrderQuery(orderNumber, token ?? null, view === 'paid' ? 'paid' : 'open'),
    enabled: hydrated && !!orderNumber && (view === 'paid' || view === 'pending' || view === 'failed'),
  });
  const order = orderDetails.data ?? null;
  const paidOrderSettled = view === 'paid' && (orderDetails.isSuccess || orderDetails.isError);

  // Once the payment is verified (and the receipt has loaded or been refused), empty the cart of
  // this order's items, once per order, so reopening this receipt never removes items added
  // later. The order's own items are used for a payment made in the last two days; an older
  // receipt only clears the cart it was placed from (never items bought again since).
  useEffect(() => {
    if (!paidOrderSettled || settled.current) return;
    settled.current = true;
    const paidOrder = orderDetails.data ?? null;
    const paidAtMs = new Date(String(result?.verified_at || paidOrder?.payment?.verified_at || '').replace(' ', 'T')).getTime();
    const recent = Number.isFinite(paidAtMs) && Date.now() - paidAtMs < 2 * 24 * 60 * 60 * 1000;
    completePaidOrder(
      orderNumber,
      recent && paidOrder && Array.isArray(paidOrder.items)
        ? paidOrder.items.map((it) => ({ variant_id: it.variant_id ? Number(it.variant_id) : null, quantity: Number(it.quantity) }))
        : undefined
    );
  }, [paidOrderSettled, orderDetails.data, result?.verified_at, orderNumber, completePaidOrder]);

  useEffect(() => {
    if (view !== 'paid' || celebrated.current) return;
    celebrated.current = true;
    try {
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    } catch {
      // decorative only
    }
  }, [view]);

  // Closed without payment: checkout should start a new order, not resume this one.
  useEffect(() => {
    if (view === 'cancelled') clearPendingOrder(orderNumber);
  }, [view, orderNumber]);

  // The live status stream, while the payment is pending. Each newer state makes the page ask
  // verify-payment once; a dropped stream reconnects up to MAX_RECONNECTS times, and a refused,
  // switched-off or silent one hands over to the usual checks for the rest of the visit.
  const isPending = view === 'pending';
  const liveFailed = live === 'failed';
  useEffect(() => {
    if (!livePaymentStatus || liveFailed || !hydrated || !orderNumber || !isPending) return;
    const controller = new AbortController();
    const key = paymentKeys.status(orderNumber, token ?? null, reference || null);
    let last: LiveState | null = null;
    const onState = (next: LiveState) => {
      if (!isNewerState(last, next)) return;
      const first = last === null;
      last = next;
      // The first message is the state the page already shows, unless it changed meanwhile.
      if (!first || next.status !== 'pending') void queryClient.refetchQueries({ queryKey: key, exact: true });
    };
    const wait = (ms: number) => new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    void (async () => {
      setLive('open');
      for (let drops = 0; ; drops++) {
        const outcome = await openPaymentStream({ baseUrl: API_BASE_URL, orderNumber, token, reference: reference || null, signal: controller.signal, onState });
        if (outcome === 'aborted' || controller.signal.aborted) return;
        if (outcome === 'final' || outcome === 'time_limit') {
          setLive('ended');
          return;
        }
        if (outcome === 'unavailable' || drops >= MAX_RECONNECTS) {
          setLive('failed');
          return;
        }
        await wait(RECONNECT_MS);
        if (controller.signal.aborted) return;
      }
    })();
    return () => controller.abort();
  }, [livePaymentStatus, liveFailed, hydrated, orderNumber, isPending, token, reference, streamRun, queryClient]);

  const checkAgain = async () => {
    if (!orderNumber) return null;
    setPollBase(answers);
    if (live === 'ended') setStreamRun((n) => n + 1);
    return status.refetch();
  };

  // A legacy link carried the guest access key in the URL: keep it on this device only and
  // take it out of the address bar (never trusted beyond reading it once).
  useEffect(() => {
    const legacy = searchParams.get('token');
    if (!orderNumber || !legacy) return;
    saveGuestToken(orderNumber, legacy);
    window.history.replaceState(null, '', `/checkout/callback?order=${encodeURIComponent(orderNumber)}${reference ? `&reference=${encodeURIComponent(reference)}` : ''}`);
  }, [orderNumber, reference, searchParams]);

  const handleRetryPayment = async () => {
    if (!orderNumber || !retryMethod) return;
    setIsRetrying(true);
    setRetryError(null);
    const whatsappTab = retryMethod === 'whatsapp' ? window.open('about:blank', '_blank') : null;
    try {
      const res = await apiInitializePayment(
        orderNumber,
        token,
        `${window.location.origin}/checkout/callback?order=${encodeURIComponent(orderNumber)}`,
        retryMethod
      );
      if (retryMethod === 'whatsapp') {
        const url = buildWhatsAppInvoiceUrl(
          order ? whatsAppOrderFrom(order) : { order_number: orderNumber, grand_total: Number(res.amount) },
          supportPhone
        );
        if (whatsappTab) whatsappTab.location.href = url;
        else window.location.href = url;
        markInvoiceSent(orderNumber);
        setIsRetrying(false);
        return;
      }
      if (!res.checkout_url) throw new Error('The payment provider did not return a checkout page.');
      window.location.href = res.checkout_url;
    } catch (err) {
      whatsappTab?.close();
      setRetryError(errorMessage(err, 'We could not start the payment. Please try another method.'));
      setIsRetrying(false);
    }
  };

  // WhatsApp transfers are confirmed by the store by hand: "Mark as paid" asks the server, which
  // opens the receipt once the store has confirmed, and otherwise says it is still awaited.
  const handleMarkPaid = async () => {
    const answer = await checkAgain();
    const paymentStatus = answer?.isSuccess ? answer.data.status : null;
    if (paymentStatus !== 'successful') {
      // Not confirmed yet: let the store know the transfer was sent (it alerts the admin).
      if (paymentStatus === 'pending') await apiMarkPaymentSent(orderNumber, token).catch(() => null);
      setAwaitingFlash(true);
      setTimeout(() => setAwaitingFlash(false), 3000);
    }
  };

  const handleSaveJpeg = async () => {
    const node = document.getElementById('printable-receipt');
    if (!node) return;
    setIsSavingJpeg(true);
    try {
      const dataUrl = await toJpeg(node, { quality: 0.95, backgroundColor: '#FFFFFF', pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `SHOPCO-Receipt-${orderNumber}.jpeg`;
      link.href = dataUrl;
      link.click();
    } catch {
      setRetryError('Could not create the image. Use Print to save the receipt as a PDF instead.');
    } finally {
      setIsSavingJpeg(false);
    }
  };

  const supportLabel = formatSupportPhone(supportPhone);
  const paidAt = result?.verified_at || order?.payment?.verified_at || null;
  const receiptDate = paidAt || order?.created_at || null;
  const formatDate = (value: string) =>
    new Date(value.replace(' ', 'T')).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const providerName = (p?: string) => (p === 'monnify' ? 'Monnify' : p === 'kora' ? 'Kora' : p === 'manual' ? 'Bank transfer' : p === 'whatsapp' ? 'WhatsApp transfer' : p || 'Payment gateway');

  const retryPanel = (
    <div className="text-left space-y-2 rounded-2xl border border-neutral-200 p-4">
      <p className="text-sm font-semibold text-black">Try paying again</p>
      <p className="text-xs text-neutral-700">Your order and items are still reserved. Choose how you&apos;d like to pay.</p>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Payment method</legend>
        {paymentMethods.length === 0 && (
          <p className="text-sm text-neutral-700" role="status">
            Loading payment methods…
          </p>
        )}
        {paymentMethods.map((m) => (
          <label key={m.id} className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm cursor-pointer has-[:checked]:border-black">
            <input type="radio" name="retry-method" value={m.id} className="accent-black" checked={retryMethod === m.id} onChange={() => setRetryMethod(m.id)} />
            <span>{m.name}</span>
          </label>
        ))}
      </fieldset>
      {retryError && <p role="alert" className="text-sm text-red-700">{retryError}</p>}
      {retryMethod === 'whatsapp' && invoiceSent ? (
        <>
          <button
            type="button"
            onClick={handleMarkPaid}
            disabled={isRefreshing}
            className={`w-full text-white font-semibold py-3 rounded-full text-sm disabled:opacity-60 ${awaitingFlash ? 'bg-amber-600' : 'bg-[#1DA851] hover:bg-[#178a43]'}`}
          >
            {isRefreshing ? 'Checking…' : awaitingFlash ? 'Awaiting confirmation' : 'Mark as paid'}
          </button>
          <button type="button" onClick={handleRetryPayment} disabled={isRetrying} className="w-full text-xs text-neutral-700 underline hover:no-underline disabled:opacity-50">
            Send the invoice again
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleRetryPayment}
          disabled={isRetrying || !retryMethod}
          className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3 rounded-full text-sm disabled:opacity-50"
        >
          {isRetrying ? 'Opening payment…' : retryMethod === 'whatsapp' ? 'Send invoice on WhatsApp' : 'Pay now'}
        </button>
      )}
    </div>
  );

  const awaitingWhatsApp = result?.provider === 'whatsapp';

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-[#F9F9F9]">
      <div className="bg-white rounded-3xl p-6 sm:p-10 max-w-lg w-full border border-neutral-200 shadow-xl text-center space-y-6" aria-live="polite">
        {view === 'checking' && (
          <div className="py-12 space-y-4" role="status">
            <div className="w-14 h-14 border-4 border-black/10 border-t-black rounded-full animate-spin mx-auto" aria-hidden="true" />
            <h1 className="text-xl font-bold text-black">Checking your payment…</h1>
            <p className="text-sm text-neutral-700 max-w-sm mx-auto">We confirm every payment directly with the payment provider.</p>
          </div>
        )}

        {view === 'error' && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={AlertCircleIcon} size={36} aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-extrabold text-black">We couldn&apos;t check this payment</h1>
            <p className="text-sm text-neutral-700 max-w-sm mx-auto">{message}</p>
            {orderNumber && (
              <form
                className="flex gap-2 text-left"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!keyInput) return;
                  saveGuestToken(orderNumber, keyInput); // the saved key becomes `token`, which starts a new check
                }}
              >
                <label htmlFor="access-key" className="sr-only">Order access key</label>
                <input
                  id="access-key"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value.trim())}
                  placeholder="Order access key"
                  className="flex-1 text-sm px-3 py-2 border border-neutral-300 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-black"
                />
                <button type="submit" disabled={!keyInput} className="bg-black text-white text-sm px-4 py-2 rounded-xl disabled:opacity-40">
                  Open
                </button>
              </form>
            )}
            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={() => void checkAgain()} className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3 rounded-full text-sm">
                Try again
              </button>
              <Link href={`/track-order${orderNumber ? `?order=${encodeURIComponent(orderNumber)}` : ''}`} className="w-full bg-neutral-100 hover:bg-neutral-200 font-semibold py-3 rounded-full text-sm">
                Track order with email
              </Link>
            </div>
          </div>
        )}

        {view === 'paid' && (
          <div className="py-4 space-y-5">
            <div id="printable-receipt" className="space-y-4 bg-white p-5 sm:p-7 rounded-3xl border border-neutral-100 shadow-sm">
              <div className="flex items-center justify-between pb-3 text-left">
                <div>
                  <span className="font-black text-lg tracking-tight text-black block">SHOP.CO</span>
                  <span className="text-xs text-neutral-600 uppercase tracking-widest">Payment receipt</span>
                </div>
                {receiptDate && <span className="text-xs text-neutral-600">{formatDate(receiptDate)}</span>}
              </div>

              <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
                <HugeiconsIcon icon={CheckmarkBadge01Icon} size={36} aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-black">Payment confirmed</h1>
                <p className="text-sm text-neutral-700 mt-0.5">
                  Order <strong className="font-mono text-black">{orderNumber}</strong>
                </p>
              </div>

              <div className="bg-[#FAFAFA] rounded-2xl p-4 text-sm text-neutral-700 text-left space-y-3">
                {order && order.items.length > 0 && (
                  <ul className="divide-y divide-neutral-100 max-h-36 overflow-y-auto">
                    {order.items.map((item) => (
                      <li key={item.id} className="py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-black truncate">{item.item_name}</p>
                          <p className="text-xs text-neutral-600">
                            Qty {item.quantity}
                            {item.variant_options?.size ? ` · ${item.variant_options.size}` : ''}
                            {item.variant_options?.color ? ` · ${item.variant_options.color}` : ''}
                          </p>
                        </div>
                        <span className="font-medium text-black shrink-0">{formatPrice(item.line_total)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {order && (
                  <div className="pt-2 border-t border-neutral-200 space-y-1">
                    <div className="flex justify-between"><span>Subtotal</span><span className="text-black">{formatPrice(order.subtotal)}</span></div>
                    {Number(order.discount_amount) > 0 && (
                      <div className="flex justify-between text-emerald-800"><span>Discount</span><span>-{formatPrice(order.discount_amount)}</span></div>
                    )}
                    <div className="flex justify-between"><span>Delivery</span><span className="text-black">{formatPrice(order.shipping_fee)}</span></div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-neutral-200 font-bold text-black">
                  <span>Amount paid</span>
                  <span>{formatPrice(result?.amount ?? order?.grand_total ?? 0)}</span>
                </div>

                <dl className="pt-2 border-t border-neutral-200 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-neutral-600">Reference</dt>
                    <dd className="font-mono text-black truncate max-w-[220px]">{result?.provider_reference}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-neutral-600">Paid with</dt>
                    <dd className="text-black">{providerName(result?.provider)}</dd>
                  </div>
                  {order?.shipping_address_snapshot && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-neutral-600">Deliver to</dt>
                      <dd className="text-black text-right">
                        {order.shipping_address_snapshot.city}, {order.shipping_address_snapshot.state}
                      </dd>
                    </div>
                  )}
                </dl>

                {!order && (
                  <p className="text-xs text-neutral-600">
                    Sign in or use &quot;Track order&quot; with your email to see the full receipt.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Link
                href={`/track-order?order=${encodeURIComponent(orderNumber)}`}
                className="w-full bg-black text-white hover:bg-neutral-800 font-bold py-3.5 rounded-full text-sm shadow-md flex items-center justify-center gap-2"
              >
                <span>Track your order</span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={15} aria-hidden="true" />
              </Link>

              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => window.print()} className="p-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-full" aria-label="Print receipt">
                  <Printer className="w-4 h-4" />
                </button>
                <button type="button" onClick={handleSaveJpeg} disabled={isSavingJpeg} className="p-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-full disabled:opacity-50" aria-label="Save receipt as image">
                  <Download className="w-4 h-4" />
                </button>
                <a
                  href={buildWhatsAppReceiptUrl(
                    {
                      ...(order ? whatsAppOrderFrom(order) : { order_number: orderNumber }),
                      grand_total: Number(result?.amount ?? order?.grand_total ?? 0),
                    },
                    supportPhone
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-neutral-100 hover:bg-neutral-200 text-[#128C7E] rounded-full"
                  aria-label="Send receipt to the store on WhatsApp"
                >
                  <WhatsAppIcon />
                </a>
                <Link href="/category" className="text-sm font-semibold text-neutral-700 hover:text-black pl-2">
                  Continue shopping
                </Link>
              </div>
              {retryError && <p role="alert" className="text-sm text-red-700">{retryError}</p>}
            </div>
          </div>
        )}

        {view === 'pending' && (
          <div className="py-4 space-y-5">
            <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={Clock01Icon} size={36} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-black">
                {result?.status === 'not_started'
                  ? 'Payment not started yet'
                  : awaitingWhatsApp
                    ? 'Awaiting confirmation'
                    : 'Waiting for your payment to clear'}
              </h1>
              <p className="text-sm text-neutral-700 mt-1">Order <strong className="font-mono text-black">{orderNumber}</strong></p>
            </div>
            <p className="text-sm text-neutral-700 max-w-sm mx-auto">
              {awaitingWhatsApp
                ? 'The store confirms WhatsApp transfers by hand. Once they have, tap "Mark as paid" to see your receipt. We will also email you.'
                : message ||
                  (checkingAutomatically
                    ? 'Card payments usually confirm within seconds; bank transfers can take a few minutes. This page updates automatically.'
                    : 'Still processing. Bank transfers can take a few minutes to arrive. You can check again, or come back later: we will email you once it is confirmed.')}
            </p>
            {checkingAutomatically && (
              <p className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-900 rounded-full text-xs font-medium border border-amber-200">
                <span className={`w-2 h-2 rounded-full bg-amber-600 ${isRefreshing ? 'animate-ping' : ''}`} />
                Checking automatically…
              </p>
            )}
            <div className="flex flex-col gap-2.5">
              {awaitingWhatsApp ? (
                <button
                  type="button"
                  onClick={handleMarkPaid}
                  disabled={isRefreshing}
                  className={`w-full text-white font-semibold py-3 rounded-full text-sm disabled:opacity-60 ${awaitingFlash ? 'bg-amber-600' : 'bg-[#1DA851] hover:bg-[#178a43]'}`}
                >
                  {isRefreshing ? 'Checking…' : awaitingFlash ? 'Awaiting confirmation' : 'Mark as paid'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void checkAgain()}
                  disabled={isRefreshing}
                  className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3 rounded-full text-sm disabled:opacity-60"
                >
                  {isRefreshing ? 'Checking…' : 'Check again'}
                </button>
              )}
              {(result?.status === 'not_started' || !checkingAutomatically) && retryPanel}
              <a
                href={buildWhatsAppMessageUrl(`Hello! I paid for order ${orderNumber} (reference ${result?.provider_reference || reference || 'n/a'}) and it is still pending. Can you check?`, supportPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 font-semibold py-3 rounded-full text-sm flex items-center justify-center gap-2"
              >
                <WhatsAppIcon className="w-4 h-4 text-[#128C7E]" />
                <span>Ask the store on WhatsApp ({supportLabel})</span>
              </a>
            </div>
          </div>
        )}

        {view === 'failed' && (
          <div className="py-4 space-y-5">
            <div className="w-16 h-16 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={AlertCircleIcon} size={36} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-black">Payment didn&apos;t go through</h1>
              <p className="text-sm text-neutral-700 mt-1">Order <strong className="font-mono text-black">{orderNumber}</strong></p>
            </div>
            <p className="text-sm text-neutral-700 max-w-sm mx-auto">
              No money was taken for this attempt. Your order is still saved and your items are reserved for a while.
            </p>
            {retryPanel}
            <Link href="/cart" className="block w-full bg-neutral-100 hover:bg-neutral-200 font-semibold py-3 rounded-full text-sm">
              Back to cart
            </Link>
          </div>
        )}

        {view === 'cancelled' && (
          <div className="py-4 space-y-5">
            <div className="w-16 h-16 bg-neutral-100 text-neutral-700 rounded-full flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={Clock01Icon} size={36} aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-extrabold text-black">{awaitingWhatsApp ? 'This order was cancelled' : 'This order has expired'}</h1>
            <p className="text-sm text-neutral-700 max-w-sm mx-auto">
              {awaitingWhatsApp ? (
                <>
                  The store did not receive a transfer for order <strong className="font-mono">{orderNumber}</strong>, so it was
                  cancelled and its items were released. Your cart is still here: place the order again to pay.
                </>
              ) : (
                <>
                  Order <strong className="font-mono">{orderNumber}</strong> wasn&apos;t paid in time, so its items were released. Your cart
                  is still here: place the order again to pay.
                </>
              )}
            </p>
            {awaitingWhatsApp && (
              <a
                href={buildWhatsAppMessageUrl(`Hello! Order ${orderNumber} was cancelled, but I sent the transfer. Here is my bank receipt.`, supportPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 font-semibold py-3 rounded-full text-sm flex items-center justify-center gap-2"
              >
                <WhatsAppIcon className="w-4 h-4 text-[#128C7E]" />
                <span>I sent the transfer: message the store</span>
              </a>
            )}
            <Link
              href="/cart"
              onClick={() => clearPendingOrder(orderNumber)}
              className="block w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3 rounded-full text-sm"
            >
              Go to cart
            </Link>
          </div>
        )}

        {view === 'late' && (
          <div className="py-4 space-y-5">
            <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={AlertCircleIcon} size={36} aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-extrabold text-black">Payment received after the order expired</h1>
            <p className="text-sm text-neutral-700 max-w-sm mx-auto">
              We received your payment for <strong className="font-mono">{orderNumber}</strong>, but the order had already expired.
              The store has been alerted and will refund you or complete the order. You don&apos;t need to pay again.
            </p>
            <a
              href={buildWhatsAppMessageUrl(`Hello! My payment for order ${orderNumber} (reference ${result?.provider_reference || reference}) arrived after the order expired. Please help.`, supportPhone)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 font-semibold py-3 rounded-full text-sm flex items-center justify-center gap-2"
            >
              <WhatsAppIcon className="w-4 h-4 text-[#128C7E]" />
              <span>Contact the store ({supportLabel})</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckoutCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-black/10 border-t-black rounded-full animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading…</span>
        </div>
      }
    >
      <CheckoutCallbackContent />
    </Suspense>
  );
}
