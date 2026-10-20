'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  AlertCircle,
  ArrowLeft,
  CreditCard,
  ArrowRight,
  Copy,
  ExternalLink,
  Check,
  X,
} from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { apiGetOrder, apiInitializePayment } from '@/lib/api-client';
import { buildWhatsAppInvoiceUrl, buildWhatsAppMessageUrl, formatSupportPhone } from '@/lib/whatsapp';
import { useStoreSupport } from '@/lib/use-store-support';
import { useLatestOrderNumber } from '@/lib/use-order-data';
import { getOrderStatusDisplay, STATUS_TONE_CLASSES } from '@/lib/order-status';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { Dialog } from '@/components/ui/Dialog';

/** Safari-safe parsing of MySQL "YYYY-MM-DD HH:MM:SS" timestamps. */
function toDate(value: string): Date {
  return new Date(String(value).replace(' ', 'T'));
}

const NOT_FOUND_MESSAGE = 'Order not found. Please verify your order number and contact details.';

/**
 * Fetch an order for the lookup form. Uses the access key given, else the one saved on this
 * device; a key that worked is saved for next time.
 */
async function requestOrder(cleanNum: string, verificationOpts?: { token?: string; email?: string }) {
  let token = verificationOpts?.token;
  if (!token) {
    token =
      localStorage.getItem(`shopco_guest_token_${cleanNum}`) ||
      (localStorage.getItem('shopco_latest_order_number') === cleanNum
        ? localStorage.getItem('shopco_latest_guest_token') || undefined
        : undefined);
  }
  const res = await apiGetOrder(cleanNum, { token, email: verificationOpts?.email });
  if (token) localStorage.setItem(`shopco_guest_token_${cleanNum}`, token);
  return res;
}

function TrackOrderContent() {
  const searchParams = useSearchParams();
  const queryOrder = searchParams.get('order') || searchParams.get('order_number') || '';
  const queryToken = searchParams.get('token') || '';

  const [orderNumber, setOrderNumber] = useState<string>(queryOrder);
  const [verificationInput, setVerificationInput] = useState<string>('');
  // The last order placed on this device, offered when the address names no order.
  const latestOrderNumber = useLatestOrderNumber();
  const recentOrderNumber = queryOrder ? null : latestOrderNumber;

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializingPayment, setIsInitializingPayment] = useState<string | null>(null);
  // null until the shopper opens or closes it; "Pay now" links (?pay=1) open it on arrival.
  const [paymentModalChoice, setShowPaymentModal] = useState<boolean | null>(null);
  const { supportPhone, paymentMethods } = useStoreSupport();
  // The shopper's choice; until they pick, the store's default method.
  const [chosenGateway, setSelectedGateway] = useState<string>('');
  const selectedGateway = chosenGateway || (paymentMethods.find((m) => m.is_default) || paymentMethods[0])?.id || '';
  const wantsToPay = searchParams.get('pay') === '1';
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [copiedTracking, setCopiedTracking] = useState<boolean>(false);

  const handleCopyTracking = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedTracking(true);
      setTimeout(() => setCopiedTracking(false), 2000);
    }
  };

  // Look up an order typed in (or the recent one).
  const performLookup = (ordNum: string, verificationOpts?: { token?: string; email?: string }) => {
    const cleanNum = ordNum.trim().toUpperCase();
    if (!cleanNum) {
      setLookupError('Please enter your order reference (e.g. ORD-...) or carrier tracking code (e.g. GIG-..., TRK-...).');
      return;
    }
    setIsLoading(true);
    setLookupError(null);
    requestOrder(cleanNum, verificationOpts)
      .then(
        (res) => {
          setOrder(res);
          setOrderNumber(cleanNum);
        },
        (err: any) => {
          setOrder(null);
          setLookupError(err?.message || NOT_FOUND_MESSAGE);
        }
      )
      .finally(() => setIsLoading(false));
  };

  // An order in the address (?order=...): show it as loading straight away, then look it up.
  const autoLookupKey = queryOrder ? `${queryOrder}|${queryToken}` : '';
  const [autoLookupFor, setAutoLookupFor] = useState('');
  if (autoLookupKey !== autoLookupFor) {
    setAutoLookupFor(autoLookupKey);
    if (autoLookupKey) {
      setIsLoading(true);
      setLookupError(null);
    }
  }
  useEffect(() => {
    const cleanNum = queryOrder.trim().toUpperCase();
    if (!cleanNum) return;
    let current = true;
    requestOrder(cleanNum, { token: queryToken || undefined })
      .then(
        (res) => {
          if (!current) return;
          setOrder(res);
          setOrderNumber(cleanNum);
        },
        (err: any) => {
          if (!current) return;
          setOrder(null);
          setLookupError(err?.message || NOT_FOUND_MESSAGE);
        }
      )
      .finally(() => current && setIsLoading(false));
    return () => {
      current = false;
    };
  }, [queryOrder, queryToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVerification = verificationInput.trim();

    let email: string | undefined;
    let token: string | undefined;

    if (cleanVerification) {
      if (cleanVerification.includes('@')) {
        email = cleanVerification;
      } else if (cleanVerification.length === 64 && /^[0-9a-fA-F]+$/.test(cleanVerification)) {
        token = cleanVerification;
      } else {
        setLookupError('Enter the email address you used at checkout, or the access key from your order confirmation.');
        return;
      }
    }

    performLookup(orderNumber, { token, email });
  };

  const getGatewayDisplayName = (provider?: string) => {
    if (!provider) return null;
    const p = provider.toLowerCase();
    if (p === 'kora') return 'Kora Hosted Checkout';
    if (p === 'monnify') return 'Monnify Gateway';
    if (p === 'whatsapp' || p === 'manual_whatsapp') return 'WhatsApp Bank Transfer';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };


  const handleInitiatePayment = async (gatewayOverride?: string) => {
    if (!order) return;
    const gateway = gatewayOverride || selectedGateway;

    setIsInitializingPayment(gateway);
    setPaymentError(null);

    // Open the WhatsApp tab inside the click so pop-up blockers allow it; it is pointed at the
    // invoice once the server has reserved the order for a manual transfer.
    const whatsappTab = gateway === 'whatsapp' ? window.open('about:blank', '_blank') : null;

    try {
      const guestToken =
        typeof window !== 'undefined'
          ? localStorage.getItem(`shopco_guest_token_${order.order_number}`) || undefined
          : undefined;

      const redirectUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/checkout/callback?order=${encodeURIComponent(order.order_number)}`
          : undefined;

      const res = await apiInitializePayment(order.order_number, guestToken, redirectUrl, gateway);
      if (gateway === 'whatsapp') {
        if (whatsAppInvoiceUrl && whatsappTab) {
          whatsappTab.location.href = whatsAppInvoiceUrl;
        } else if (whatsAppInvoiceUrl) {
          window.location.assign(whatsAppInvoiceUrl);
        }
        setShowPaymentModal(false);
      } else if (res.checkout_url) {
        window.location.assign(res.checkout_url);
      } else {
        throw new Error(`${gateway === 'kora' ? 'Kora' : 'Monnify'} did not return a valid payment URL.`);
      }
    } catch (err: any) {
      whatsappTab?.close();
      setPaymentError(err.message || 'Payment initialization failed. Please retry.');
    } finally {
      setIsInitializingPayment(null);
    }
  };

  const rawStatus = order?.status || order?.order_status || 'pending_payment';
  const statusDisplay = order ? getOrderStatusDisplay(rawStatus, order.payment_status, order.expires_at) : null;
  const canPay = Boolean(statusDisplay?.canPay);
  const isPaid = ['successful', 'partially_refunded', 'refunded'].includes(order?.payment_status);
  const isOffTrack = ['cancelled', 'returned', 'refund_pending', 'refunded'].includes(rawStatus);

  // "Pay now" from My orders opens the payment options straight away.
  const showPaymentModal = paymentModalChoice ?? (wantsToPay && canPay);

  // Determine stage index
  const getStageIndex = (statusStr: string, paymentStatus: string) => {
    if (statusStr === 'delivered' || statusStr === 'completed') return 4;
    if (statusStr === 'shipped') return 3;
    if (statusStr === 'processing') return 2;
    if (paymentStatus === 'successful' || statusStr === 'paid') return 1;
    return 0;
  };

  const currentStage = order ? getStageIndex(rawStatus, order.payment_status || '') : 0;
  // A delivered order has finished every step, including the last one.
  const isFinished = rawStatus === 'delivered' || rawStatus === 'completed';

  const steps = [
    { title: 'Order placed', tooltip: 'Your order was received and the items reserved.' },
    { title: 'Payment confirmed', tooltip: 'Payment was confirmed with the payment provider.' },
    { title: 'Processing', tooltip: 'Your order is being packed.' },
    { title: 'In transit', tooltip: 'Your parcel is with the courier.' },
    { title: 'Delivered', tooltip: 'Your parcel was delivered.' },
  ];

  const whatsAppInvoiceUrl = order
    ? buildWhatsAppInvoiceUrl(
        {
          order_number: order.order_number,
          grand_total: order.grand_total,
          subtotal: order.subtotal,
          shipping_fee: order.shipping_fee,
          discount_amount: order.discount_amount,
          items: (order.items || []).map((it: any) => ({ name: it.item_name, quantity: it.quantity, line_total: it.line_total, size: it.variant_options?.size })),
          guest_email: order.guest_email,
          shipping_address: order.shipping_address_snapshot,
        },
        supportPhone
      )
    : '';

  return (
    <div className="min-h-screen bg-[#FBFBFB] py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to the store</span>
          </Link>

          <a
            href={buildWhatsAppMessageUrl('Hello! I have a question about my order.', supportPhone)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-colors"
          >
            <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            <span>Help: {formatSupportPhone(supportPhone)}</span>
            <span className="sr-only">on WhatsApp (opens in a new tab)</span>
          </a>
        </div>

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black text-black tracking-tight">
            Track Your Package
          </h1>
          <p className="text-sm text-neutral-700 max-w-md mx-auto">
            See your order&apos;s payment, packing and delivery status.
          </p>
        </div>

        {/* Recent Order Quick-Track Chip */}
        {!order && recentOrderNumber && (
          <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                Recent order: <strong className="font-mono text-black">{recentOrderNumber}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setOrderNumber(recentOrderNumber);
                performLookup(recentOrderNumber);
              }}
              className="bg-black hover:bg-neutral-800 text-white font-semibold px-4 py-1.5 rounded-full transition-colors shrink-0 flex items-center gap-1"
            >
              <span>Track now</span>
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Lookup Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-neutral-200 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="track-order-number" className="block text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Order number or tracking number <span aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <input
                    id="track-order-number"
                    type="text"
                    required
                    aria-invalid={lookupError ? true : undefined}
                    aria-describedby={lookupError ? 'track-lookup-error' : undefined}
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="e.g. ORD-20261016-XXXXXX or GIG-LOS-XXXXXX"
                    className="w-full text-sm font-mono px-4 py-3 bg-neutral-50 border border-neutral-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-black uppercase placeholder:normal-case placeholder:font-sans"
                  />
                  <Package className="w-4 h-4 text-neutral-500 absolute right-4 top-3.5" aria-hidden="true" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="track-verification" className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                    Checkout Email
                  </label>
                  <span id="track-verification-hint" className="text-xs text-neutral-600">Not needed on the device you ordered from</span>
                </div>
                <input
                  id="track-verification"
                  aria-describedby="track-verification-hint"
                  type="text"
                  autoComplete="email"
                  value={verificationInput}
                  onChange={(e) => setVerificationInput(e.target.value)}
                  placeholder="name@example.com (or your access key)"
                  className="w-full text-sm px-4 py-3 bg-neutral-50 border border-neutral-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            {lookupError && (
              <div id="track-lookup-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-sm text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" aria-hidden="true" />
                <span>{lookupError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-black text-white hover:bg-neutral-800 font-bold py-3.5 rounded-full text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  <span>Checking status…</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" aria-hidden="true" />
                  <span>Track order</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Order Details Display */}
        {order && (
          <div className="space-y-6 animate-in fade-in" aria-live="polite">
            {/* Top Status Banner */}
            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-neutral-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-extrabold text-black font-mono">
                    #{order.order_number}
                  </h2>

                  {statusDisplay && (
                    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_TONE_CLASSES[statusDisplay.tone]}`}>
                      {statusDisplay.label}
                    </span>
                  )}
                </div>

                <p className="text-sm text-neutral-700">
                  Placed {toDate(order.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {statusDisplay?.description ? ` · ${statusDisplay.description}` : ''}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {canPay ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(true)}
                      disabled={Boolean(isInitializingPayment)}
                      className="flex-1 sm:flex-initial bg-black hover:bg-neutral-800 text-white font-bold px-5 py-2.5 rounded-full text-xs transition-all shadow flex items-center justify-center gap-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isInitializingPayment ? 'Connecting…' : `Pay now (${formatPrice(order.grand_total)})`}</span>
                    </button>

                    <a
                      href={whatsAppInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 bg-neutral-100 hover:bg-neutral-200 text-[#128C7E] rounded-full transition-colors relative group shrink-0"
                      aria-label="Send the invoice on WhatsApp (opens in a new tab)"
                    >
                      <WhatsAppIcon className="w-4 h-4" aria-hidden="true" />
                      <div aria-hidden="true" className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover:block group-focus-visible:block z-20 whitespace-nowrap bg-neutral-900 text-white text-xs rounded-lg px-2 py-1 shadow-md">
                        WhatsApp Invoice
                      </div>
                    </a>
                  </>
                ) : (
                  <a
                    href={buildWhatsAppMessageUrl(`Hello! I'm checking on my order #${order.order_number}.`, supportPhone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold px-4 py-2 rounded-full text-xs transition-colors"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 text-[#128C7E]" aria-hidden="true" />
                    <span>WhatsApp help</span>
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </div>
            </div>

            {isOffTrack && statusDisplay && (
              <div role="status" className={`rounded-3xl p-5 sm:p-6 ${STATUS_TONE_CLASSES[statusDisplay.tone]}`}>
                <p className="font-bold">{statusDisplay.label}</p>
                <p className="text-sm mt-1">{statusDisplay.description}</p>
              </div>
            )}

            {/* Stepper Progress Timeline with Connected Bar */}
            {!isOffTrack && (
            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-neutral-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-black">
                    Delivery progress
                  </h3>
                  <p className="text-xs text-neutral-600">
                    {isFinished ? 'All steps complete' : `Step ${currentStage + 1} of ${steps.length}`} &bull; {steps[currentStage]?.title}
                  </p>
                </div>

              </div>

              {/* Connected Visual Progression Bar */}
              <div className="relative pt-2 pb-1">
                {/* Background Line */}
                <div aria-hidden="true" className="hidden sm:block absolute top-6 left-6 right-6 h-1 bg-neutral-100 -translate-y-1/2 z-0" />
                {/* Active Filled Line */}
                <div
                  aria-hidden="true"
                  className="hidden sm:block absolute top-6 left-6 h-1 bg-black -translate-y-1/2 z-0 transition-all duration-500"
                  style={{ width: `calc(${(currentStage / (steps.length - 1)) * 100}% * 0.88)` }}
                />

                {/* Steps */}
                <ol className="grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-2 relative z-10" aria-label="Order progress">
                  {steps.map((step, idx) => {
                    const isDone = idx < currentStage || (isFinished && idx === currentStage);
                    const isCurrent = idx === currentStage && !isFinished;
                    return (
                      <li
                        key={step.title}
                        aria-current={isCurrent ? 'step' : undefined}
                        className="group relative flex sm:flex-col items-center sm:items-center gap-3 sm:gap-2"
                      >
                        {/* Tooltip on Hover */}
                        <div aria-hidden="true" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30 w-44 bg-neutral-900 text-white text-xs rounded-xl px-2.5 py-1.5 shadow-lg text-center">
                          {step.tooltip}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
                        </div>

                        {/* Node Circle */}
                        <div
                          aria-hidden="true"
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0 ${
                            isCurrent
                              ? 'bg-black text-white ring-4 ring-neutral-200 shadow-sm'
                              : isDone
                              ? 'bg-black text-white'
                              : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>

                        {/* Label & Description */}
                        <div className="text-left sm:text-center min-w-0">
                          <p className={`text-xs font-bold leading-tight truncate ${isCurrent ? 'text-black' : isDone ? 'text-neutral-800' : 'text-neutral-600'}`}>
                            {step.title}
                          </p>
                          <p className="text-xs text-neutral-600 truncate sm:block">
                            {isCurrent ? 'In progress' : isDone ? 'Done' : 'Not yet'}
                          </p>
                          <p className="sr-only">{step.tooltip}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>

            )}

            {/* Courier & Shipment Details Card (if shipment exists) */}
            {order.shipment && (
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/20 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0" aria-hidden="true">
                      <Truck className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Dispatched by courier</span>
                        <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 capitalize">
                          {order.shipment.status?.replace('_', ' ') || 'In Transit'}
                        </span>
                      </div>
                      <h3 className="text-base font-extrabold text-neutral-900 mt-0.5">
                        {order.shipment.carrier || 'Logistics Courier'}
                      </h3>
                    </div>
                  </div>

                  {order.shipment.tracking_url && (
                    <a
                      href={order.shipment.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full transition-colors shrink-0"
                    >
                      <span>Track on the courier&apos;s site</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-200">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 block mb-1">
                      Tracking code
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-sm text-neutral-900 select-all truncate">
                        {order.shipment.tracking_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyTracking(order.shipment.tracking_number)}
                        className="p-1.5 hover:bg-neutral-200 rounded-lg text-neutral-600 hover:text-black transition-colors shrink-0"
                        title="Copy tracking number"
                        aria-label={copiedTracking ? 'Tracking number copied' : 'Copy tracking number'}
                      >
                        {copiedTracking ? (
                          <Check className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                        ) : (
                          <Copy className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                      <span className="sr-only" role="status">{copiedTracking ? 'Tracking number copied' : ''}</span>
                    </div>
                  </div>

                  <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-200">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 block mb-1">
                      Dispatched on
                    </span>
                    <span className="text-xs font-bold text-neutral-800">
                      {order.shipment.shipped_at
                        ? toDate(order.shipment.shipped_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
                        : 'Scheduled for dispatch'}
                    </span>
                  </div>

                  <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-200">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600 block mb-1">
                      Delivery status
                    </span>
                    <span className="text-xs font-bold text-neutral-800">
                      {order.shipment.delivered_at
                        ? `Delivered on ${toDate(order.shipment.delivered_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}`
                        : order.shipment.status === 'out_for_delivery'
                        ? 'Out for Delivery today'
                        : 'Package in transit'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Breakdown & Destination Columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Order Items (2 cols) */}
              <div className="md:col-span-2 bg-white rounded-3xl p-6 sm:p-7 border border-neutral-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <h3 className="font-bold text-sm text-black flex items-center gap-2">
                    <Package className="w-4 h-4 text-neutral-500" aria-hidden="true" />
                    <span>Items ({order.items?.length || 0})</span>
                  </h3>
                  <span className="text-xs text-neutral-600 font-mono">
                    {order.currency || 'NGN'}
                  </span>
                </div>

                <div className="divide-y divide-neutral-100">
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-bold text-neutral-900">{item.item_name}</p>
                        <p className="text-neutral-600 font-mono text-xs">
                          Qty: {item.quantity} &bull; SKU: {item.sku}
                        </p>
                      </div>
                      <span className="font-bold text-neutral-900 font-mono">
                        {formatPrice(item.line_total)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-neutral-100 space-y-1.5 text-sm text-neutral-600">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-black">{formatPrice(order.subtotal)}</span>
                  </div>
                  {order.discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-800">
                      <span>Discount:</span>
                      <span className="font-semibold">-{formatPrice(order.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Delivery{order.shipping_zone_snapshot?.name ? ` (${order.shipping_zone_snapshot.name})` : ''}:</span>
                    <span className="font-semibold text-black">{formatPrice(order.shipping_fee)}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-black pt-2 border-t border-neutral-200">
                    <span>Total:</span>
                    <span className="font-mono">{formatPrice(order.grand_total)}</span>
                  </div>
                </div>
              </div>

              {/* Destination & Payment Verification (1 col) */}
              <div className="space-y-6">
                {/* Delivery Destination */}
                <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Destination</span>
                  </h4>
                  <div className="text-sm text-neutral-700 space-y-1">
                    <p className="font-bold text-neutral-900">
                      {order.shipping_address_snapshot?.full_name}
                    </p>
                    <p>{order.shipping_address_snapshot?.address_line1}</p>
                    <p>
                      {order.shipping_address_snapshot?.city}, {order.shipping_address_snapshot?.state}
                    </p>
                    <p className="text-neutral-600 pt-1">Phone: {order.shipping_address_snapshot?.phone}</p>
                  </div>
                </div>

                {/* Payment Status Card */}
                <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                      Payment
                    </h4>
                    <span
                      className={`inline-flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full capitalize ${
                        isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {isPaid ? (
                        <svg aria-hidden="true" className="w-3 h-3 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        <Clock className="w-3 h-3 text-amber-700" aria-hidden="true" />
                      )}
                      <span>{isPaid ? 'Paid' : order.payment_status === 'cancelled' ? 'Cancelled' : 'Not paid'}</span>
                    </span>
                  </div>

                  <div className="text-sm space-y-1.5 pt-1 text-neutral-600">
                    <div className="flex justify-between">
                      <span>Gateway:</span>
                      <span className="font-medium text-black">
                        {order.payment?.provider ? getGatewayDisplayName(order.payment.provider) : 'Not started'}
                      </span>
                    </div>
                    {order.payment?.provider_reference && (
                      <div className="flex justify-between">
                        <span>Ref:</span>
                        <span className="font-mono text-xs text-neutral-700 select-all break-all text-right">
                          {order.payment.provider_reference}
                        </span>
                      </div>
                    )}
                    {order.payment?.verified_at && (
                      <div className="flex justify-between text-xs">
                        <span>Verified:</span>
                        <span className="text-neutral-600">
                          {toDate(order.payment.verified_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Payment Options Modal */}
        {order && canPay && (
          <Dialog
            open={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            title="Choose a payment method"
            busy={Boolean(isInitializingPayment)}
            backdropClassName="bg-black/60 backdrop-blur-sm"
            panelClassName="w-full max-w-md"
            describedBy="track-pay-summary"
          >
            <div className="relative w-full bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 animate-rise">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div>
                  <p className="text-base font-bold text-black" aria-hidden="true">Choose a payment method</p>
                  <p id="track-pay-summary" className="text-xs text-neutral-600 font-mono">
                    Order #{order.order_number} &bull; Total: {formatPrice(order.grand_total)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  disabled={Boolean(isInitializingPayment)}
                  aria-label="Close payment options"
                  className="p-1.5 hover:bg-neutral-100 rounded-full text-neutral-600 hover:text-black transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              {paymentError && (
                <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-sm text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
                  <span>{paymentError}</span>
                </div>
              )}

              <fieldset className="space-y-3">
                <legend className="text-xs font-bold uppercase tracking-wider text-neutral-700">Payment method</legend>
                {paymentMethods.length === 0 && (
                  <p className="text-sm text-neutral-700" role="status">
                    Loading payment methods…
                  </p>
                )}
                {paymentMethods.map((m) => (
                  <label
                    key={m.id}
                    className="p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 border-neutral-200 hover:border-neutral-300 has-[:checked]:border-black has-[:checked]:bg-neutral-50"
                  >
                    <input
                      type="radio"
                      name="track-payment-method"
                      value={m.id}
                      className="mt-1 accent-black"
                      aria-describedby={`track-pm-${m.id}`}
                      checked={selectedGateway === m.id}
                      onChange={() => setSelectedGateway(m.id)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-sm text-black">{m.name}</span>
                      <span id={`track-pm-${m.id}`} className="block text-xs text-neutral-700 mt-0.5">{m.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleInitiatePayment()}
                  disabled={Boolean(isInitializingPayment) || !selectedGateway}
                  className={`w-full py-3.5 rounded-full text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 ${
                    selectedGateway === 'kora'
                      ? 'bg-[#055B5C] hover:bg-[#044748]'
                      : selectedGateway === 'monnify'
                      ? 'bg-[#002244] hover:bg-[#001730]'
                      : 'bg-[#1DA851] hover:bg-[#178a43]'
                  } disabled:opacity-60`}
                >
                  {isInitializingPayment ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                      <span>Opening secure payment…</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {selectedGateway === 'kora'
                          ? `Pay with Kora (${formatPrice(order.grand_total)})`
                          : selectedGateway === 'monnify'
                          ? `Pay with Monnify (${formatPrice(order.grand_total)})`
                          : `Continue to WhatsApp (${formatPrice(order.grand_total)})`}
                      </span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </div>
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" role="status">
          <div className="w-10 h-10 border-4 border-black/10 border-t-black rounded-full animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading…</span>
        </div>
      }
    >
      <TrackOrderContent />
    </Suspense>
  );
}
