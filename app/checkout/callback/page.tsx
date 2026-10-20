'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkBadge01Icon, AlertCircleIcon, Clock01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Printer, Download } from 'lucide-react';
import { toJpeg } from 'html-to-image';
import { formatPrice } from '@/lib/currency';
import { apiVerifyPayment, apiGetOrder, apiInitializePayment, apiMarkPaymentSent, PaymentVerificationResponse } from '@/lib/api-client';
import { buildWhatsAppInvoiceUrl, buildWhatsAppMessageUrl, buildWhatsAppReceiptUrl, formatSupportPhone } from '@/lib/whatsapp';
import { useStoreSupport } from '@/lib/use-store-support';
import { useCart } from '@/context/CartContext';
import { clearPendingOrder, markInvoiceSent, readGuestToken, saveGuestToken, wasInvoiceSent } from '@/lib/pending-order';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';

type ViewState = 'checking' | 'paid' | 'pending' | 'failed' | 'cancelled' | 'late' | 'error';

/** Poll delays (ms) while a payment is still settling: about two minutes in total. */
const POLL_DELAYS = [3000, 3000, 5000, 5000, 8000, 10000, 15000, 15000, 20000, 20000, 20000];

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
  const { supportPhone, paymentMethods } = useStoreSupport();

  const [token, setToken] = useState<string | undefined>(undefined);
  const [view, setView] = useState<ViewState>('checking');
  const [result, setResult] = useState<PaymentVerificationResponse | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pollIndex, setPollIndex] = useState(0);
  const [keyInput, setKeyInput] = useState('');
  const [retryMethod, setRetryMethod] = useState<string>('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isSavingJpeg, setIsSavingJpeg] = useState(false);
  const [invoiceSent, setInvoiceSent] = useState(false);
  const [awaitingFlash, setAwaitingFlash] = useState(false);
  const celebrated = useRef(false);

  useEffect(() => {
    if (orderNumber) setInvoiceSent(wasInvoiceSent(orderNumber));
  }, [orderNumber]);

  // Guest access key: from this device (never trust a URL token beyond reading a legacy link once).
  useEffect(() => {
    if (!orderNumber) return;
    const legacy = searchParams.get('token');
    if (legacy) {
      saveGuestToken(orderNumber, legacy);
      window.history.replaceState(null, '', `/checkout/callback?order=${encodeURIComponent(orderNumber)}${reference ? `&reference=${encodeURIComponent(reference)}` : ''}`);
    }
    setToken(readGuestToken(orderNumber) ?? legacy ?? undefined);
  }, [orderNumber, reference, searchParams]);

  const loadOrder = useCallback(
    async (accessToken?: string) => {
      try {
        const data = await apiGetOrder(orderNumber, accessToken ? { token: accessToken } : undefined);
        setOrder(data);
        return data;
      } catch {
        return null; // Receipt details need the access key or sign-in; status still shows.
      }
    },
    [orderNumber]
  );

  const verify = useCallback(
    async (accessToken?: string) => {
      if (!orderNumber) {
        setView('error');
        setMessage('This page is missing the order number. Use "Track order" with your order number and email instead.');
        return;
      }
      setIsRefreshing(true);
      try {
        const res = await apiVerifyPayment(orderNumber, accessToken, reference || undefined);
        setResult(res);
        setMessage(res.message ?? null);
        const orderStatus = String(res.order_status || '');

        if (res.status === 'successful') {
          if (orderStatus === 'cancelled') {
            setView('late');
          } else {
            setView('paid');
            const paidOrder = await loadOrder(accessToken);
            // The cart is emptied only now that payment is verified: the order's items leave it
            // (once per order, so reopening this receipt never removes items added later).
            // The order's own items are used for a payment made in the last two days; an older
            // receipt only clears the cart it was placed from (never items bought again since).
            const paidAtMs = new Date(String(res.verified_at || paidOrder?.payment?.verified_at || '').replace(' ', 'T')).getTime();
            const recent = Number.isFinite(paidAtMs) && Date.now() - paidAtMs < 2 * 24 * 60 * 60 * 1000;
            completePaidOrder(
              orderNumber,
              recent && Array.isArray(paidOrder?.items)
                ? paidOrder.items.map((it: any) => ({ variant_id: it.variant_id ? Number(it.variant_id) : null, quantity: Number(it.quantity) }))
                : undefined
            );
            if (!celebrated.current) {
              celebrated.current = true;
              try {
                confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
              } catch {
                // decorative only
              }
            }
          }
        } else if (orderStatus === 'cancelled') {
          // Closed without payment: checkout should start a new order, not resume this one.
          clearPendingOrder(orderNumber);
          setView('cancelled');
        } else if (res.status === 'failed') {
          setView('failed');
          loadOrder(accessToken);
        } else {
          setView('pending');
          loadOrder(accessToken);
        }
        return res.status;
      } catch (err: any) {
        setView('error');
        setMessage(
          err?.statusCode === 404
            ? 'We could not open this order from this device. Enter the access key from your order confirmation, or use "Track order" with your email.'
            : err?.message || 'We could not check the payment right now.'
        );
        return null;
      } finally {
        setIsRefreshing(false);
      }
    },
    [orderNumber, reference, loadOrder, completePaidOrder]
  );

  // First check once the access key (if any) has been read.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || token === undefined && orderNumber && readGuestToken(orderNumber)) return;
    started.current = true;
    verify(token);
  }, [token, orderNumber, verify]);

  // Background polling with back-off while the payment is settling.
  useEffect(() => {
    if (view !== 'pending' || pollIndex >= POLL_DELAYS.length) return;
    const timer = setTimeout(() => {
      setPollIndex((i) => i + 1);
      verify(token);
    }, POLL_DELAYS[pollIndex]);
    return () => clearTimeout(timer);
  }, [view, pollIndex, verify, token]);

  useEffect(() => {
    if (!retryMethod && paymentMethods.length > 0) {
      setRetryMethod((paymentMethods.find((m) => m.is_default) || paymentMethods[0]).id);
    }
  }, [paymentMethods, retryMethod]);

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
          {
            order_number: orderNumber,
            grand_total: Number(order?.grand_total ?? res.amount),
            subtotal: order ? Number(order.subtotal) : undefined,
            shipping_fee: order ? Number(order.shipping_fee) : undefined,
            discount_amount: order ? Number(order.discount_amount) : undefined,
            items: (order?.items || []).map((it: any) => ({ name: it.item_name, quantity: it.quantity, line_total: it.line_total, size: it.variant_options?.size })),
            shipping_address: order?.shipping_address_snapshot,
          },
          supportPhone
        );
        if (whatsappTab) whatsappTab.location.href = url;
        else window.location.href = url;
        markInvoiceSent(orderNumber);
        setInvoiceSent(true);
        setIsRetrying(false);
        return;
      }
      if (!res.checkout_url) throw new Error('The payment provider did not return a checkout page.');
      window.location.href = res.checkout_url;
    } catch (err: any) {
      whatsappTab?.close();
      setRetryError(err?.message || 'We could not start the payment. Please try another method.');
      setIsRetrying(false);
    }
  };

  // WhatsApp transfers are confirmed by the store by hand: "Mark as paid" asks the server, which
  // opens the receipt once the store has confirmed, and otherwise says it is still awaited.
  const handleMarkPaid = async () => {
    setPollIndex(0);
    const status = await verify(token);
    if (status !== 'successful') {
      // Not confirmed yet: let the store know the transfer was sent (it alerts the admin).
      if (status === 'pending') await apiMarkPaymentSent(orderNumber, token).catch(() => null);
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
                  saveGuestToken(orderNumber, keyInput);
                  setToken(keyInput);
                  verify(keyInput);
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
              <button type="button" onClick={() => verify(token)} className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3 rounded-full text-sm">
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
                {order?.items?.length > 0 && (
                  <ul className="divide-y divide-neutral-100 max-h-36 overflow-y-auto">
                    {order.items.map((item: any) => (
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
                      order_number: orderNumber,
                      grand_total: Number(result?.amount ?? order?.grand_total ?? 0),
                      subtotal: order ? Number(order.subtotal) : undefined,
                      shipping_fee: order ? Number(order.shipping_fee) : undefined,
                      discount_amount: order ? Number(order.discount_amount) : undefined,
                      items: (order?.items || []).map((it: any) => ({ name: it.item_name, quantity: it.quantity, line_total: it.line_total, size: it.variant_options?.size })),
                      shipping_address: order?.shipping_address_snapshot,
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
                  (pollIndex < POLL_DELAYS.length
                    ? 'Card payments usually confirm within seconds; bank transfers can take a few minutes. This page updates automatically.'
                    : 'Still processing. Bank transfers can take a few minutes to arrive. You can check again, or come back later: we will email you once it is confirmed.')}
            </p>
            {pollIndex < POLL_DELAYS.length && (
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
                  onClick={() => {
                    setPollIndex(0);
                    verify(token);
                  }}
                  disabled={isRefreshing}
                  className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3 rounded-full text-sm disabled:opacity-60"
                >
                  {isRefreshing ? 'Checking…' : 'Check again'}
                </button>
              )}
              {(result?.status === 'not_started' || pollIndex >= POLL_DELAYS.length) && retryPanel}
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
