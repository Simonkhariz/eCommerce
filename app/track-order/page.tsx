'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  AlertCircle,
  ArrowLeft,
  CreditCard,
  ArrowRight,
  ShieldCheck,
  Copy,
  ExternalLink,
  Check,
  X,
} from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { apiGetOrder, apiInitializePayment } from '@/lib/api-client';
import {
  buildWhatsAppInvoiceUrl,
  SUPPORT_PHONE_FORMATTED,
} from '@/lib/whatsapp';

function WhatsAppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TrackOrderContent() {
  const searchParams = useSearchParams();
  const queryOrder = searchParams.get('order') || searchParams.get('order_number') || '';
  const queryToken = searchParams.get('token') || '';

  const [orderNumber, setOrderNumber] = useState<string>(queryOrder);
  const [verificationInput, setVerificationInput] = useState<string>('');
  const [recentOrderNumber, setRecentOrderNumber] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializingPayment, setIsInitializingPayment] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [selectedGateway, setSelectedGateway] = useState<'kora' | 'monnify' | 'whatsapp'>('kora');
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

  // Check for recent order in browser
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const latest = localStorage.getItem('shopco_latest_order_number');
      if (latest && !queryOrder) {
        setRecentOrderNumber(latest);
      }
    }
  }, [queryOrder]);

  // Main lookup function
  const performLookup = useCallback(
    async (
      ordNum: string,
      verificationOpts?: { token?: string; email?: string }
    ) => {
      const cleanNum = ordNum.trim().toUpperCase();
      if (!cleanNum) {
        setLookupError('Please enter your order reference (e.g. ORD-...) or carrier tracking code (e.g. GIG-..., TRK-...).');
        return;
      }

      setIsLoading(true);
      setLookupError(null);

      // Resolve guest token from explicit parameter or localStorage
      let token = verificationOpts?.token;
      if (!token && typeof window !== 'undefined') {
        token =
          localStorage.getItem(`shopco_guest_token_${cleanNum}`) ||
          (localStorage.getItem('shopco_latest_order_number') === cleanNum
            ? localStorage.getItem('shopco_latest_guest_token') || undefined
            : undefined);
      }

      const finalOpts = {
        token,
        email: verificationOpts?.email,
      };

      try {
        const res = await apiGetOrder(cleanNum, finalOpts);
        setOrder(res);
        setOrderNumber(cleanNum);

        if (token && typeof window !== 'undefined') {
          localStorage.setItem(`shopco_guest_token_${cleanNum}`, token);
        }
      } catch (err: any) {
        setOrder(null);
        setLookupError(
          err.message ||
            'Order not found. Please verify your order number and contact details.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Auto-run if query param present
  useEffect(() => {
    if (queryOrder) {
      performLookup(queryOrder, { token: queryToken || undefined });
    }
  }, [queryOrder, queryToken, performLookup]);

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

  const handleInitiatePayment = async (gatewayOverride?: 'kora' | 'monnify' | 'whatsapp') => {
    if (!order) return;
    const gateway = gatewayOverride || selectedGateway;

    if (gateway === 'whatsapp') {
      if (whatsAppInvoiceUrl) {
        window.open(whatsAppInvoiceUrl, '_blank', 'noopener,noreferrer');
      }
      setShowPaymentModal(false);
      return;
    }

    setIsInitializingPayment(gateway);
    setPaymentError(null);

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
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        throw new Error(`${gateway === 'kora' ? 'Kora' : 'Monnify'} did not return a valid payment URL.`);
      }
    } catch (err: any) {
      setPaymentError(err.message || 'Payment initialization failed. Please retry.');
    } finally {
      setIsInitializingPayment(null);
    }
  };

  const rawStatus = order?.status || order?.order_status || 'pending_payment';
  const isPaid = order?.payment_status === 'successful' || rawStatus === 'paid';

  // Determine stage index
  const getStageIndex = (statusStr: string, paymentStatus: string) => {
    if (statusStr === 'delivered') return 4;
    if (statusStr === 'shipped') return 3;
    if (statusStr === 'processing') return 2;
    if (paymentStatus === 'successful' || statusStr === 'paid') return 1;
    return 0;
  };

  const currentStage = order ? getStageIndex(rawStatus, order.payment_status || '') : 0;

  const steps = [
    { title: 'Order Placed', tooltip: 'Order details recorded and items reserved in warehouse' },
    {
      title: 'Payment Confirmed',
      tooltip: order?.payment?.provider
        ? `Payment verified authoritatively by ${getGatewayDisplayName(order.payment.provider)}`
        : 'Payment verified authoritatively by payment gateway',
    },
    { title: 'Processing', tooltip: 'Quality check and parcel packaging at Enugu Hub' },
    { title: 'In Transit', tooltip: 'Handed over to regional courier for delivery' },
    { title: 'Delivered', tooltip: 'Package handed over and signed' },
  ];

  const whatsAppInvoiceUrl = order
    ? buildWhatsAppInvoiceUrl({
        order_number: order.order_number,
        grand_total: order.grand_total,
        subtotal: order.subtotal,
        shipping_fee: order.shipping_fee,
        discount_amount: order.discount_amount,
        items: order.items,
        guest_email: order.guest_email,
        payment_status: order.payment_status,
        guest_access_token:
          typeof window !== 'undefined'
            ? localStorage.getItem(`shopco_guest_token_${order.order_number}`) || undefined
            : undefined,
        shipping_address: order.shipping_address_snapshot,
      })
    : '';

  return (
    <div className="min-h-screen bg-[#FBFBFB] py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-500 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Store</span>
          </Link>

          <a
            href={`https://wa.me/2349066707079?text=${encodeURIComponent('Hello SHOP.CO Support! I have a question regarding my order.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-colors"
          >
            <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-600" />
            <span>Help: {SUPPORT_PHONE_FORMATTED}</span>
          </a>
        </div>

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black text-black tracking-tight">
            Track Your Package
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 max-w-md mx-auto">
            Check real-time milestone progress and courier status for your order.
          </p>
        </div>

        {/* Recent Order Quick-Track Chip */}
        {!order && recentOrderNumber && (
          <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Recent order: <strong className="font-mono text-black">{recentOrderNumber}</strong>
              </span>
            </div>
            <button
              onClick={() => {
                setOrderNumber(recentOrderNumber);
                performLookup(recentOrderNumber);
              }}
              className="bg-black hover:bg-neutral-800 text-white font-semibold px-4 py-1.5 rounded-full transition-colors shrink-0 flex items-center gap-1"
            >
              <span>Track Now</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Lookup Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-neutral-200 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Order Number or Tracking Number *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="e.g. ORD-20261016-XXXXXX or GIG-LOS-XXXXXX"
                    className="w-full text-sm font-mono px-4 py-3 bg-neutral-50 border border-neutral-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-black uppercase placeholder:normal-case placeholder:font-sans"
                  />
                  <Package className="w-4 h-4 text-neutral-400 absolute right-4 top-3.5" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="track-verification" className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                    Checkout Email
                  </label>
                  <span className="text-[11px] text-neutral-500">Not needed on the device you ordered from</span>
                </div>
                <input
                  id="track-verification"
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
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
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
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Checking Status...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Track Order</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Order Details Display */}
        {order && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Status Banner */}
            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-neutral-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-extrabold text-black font-mono">
                    #{order.order_number}
                  </h2>

                  {/* Clean Status Badge */}
                  {rawStatus === 'delivered' ? (
                    <span className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-900 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span>Delivered</span>
                    </span>
                  ) : rawStatus === 'shipped' ? (
                    <span className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-900 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      <Truck className="w-3.5 h-3.5 text-blue-600" />
                      <span>In Transit</span>
                    </span>
                  ) : isPaid ? (
                    <span className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-900 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Processing Order</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Awaiting Payment</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <span>Placed {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <div className="group relative cursor-pointer inline-flex items-center text-neutral-400 hover:text-black">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover:block z-20 w-48 bg-neutral-900 text-white text-[10px] rounded-xl px-2.5 py-1.5 shadow-lg text-left">
                      Fulfilled via SHOP.CO Regional Logistics Hub in Enugu Central.
                      <div className="absolute top-full left-4 border-4 border-transparent border-t-neutral-900" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {!isPaid ? (
                  <>
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      disabled={Boolean(isInitializingPayment)}
                      className="flex-1 sm:flex-initial bg-black hover:bg-neutral-800 text-white font-bold px-5 py-2.5 rounded-full text-xs transition-all shadow flex items-center justify-center gap-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>{isInitializingPayment ? 'Connecting...' : `Pay Now (${formatPrice(order.grand_total)})`}</span>
                    </button>

                    <a
                      href={whatsAppInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 bg-neutral-100 hover:bg-neutral-200 text-[#25D366] rounded-full transition-colors relative group shrink-0"
                      aria-label="Send invoice to WhatsApp"
                    >
                      <WhatsAppIcon className="w-4 h-4" />
                      <div className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover:block z-20 whitespace-nowrap bg-neutral-900 text-white text-[10px] rounded-lg px-2 py-1 shadow-md">
                        WhatsApp Invoice
                      </div>
                    </a>
                  </>
                ) : (
                  <a
                    href={`https://wa.me/2349066707079?text=${encodeURIComponent(`Hello Support! I am checking on my paid order #${order.order_number}.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold px-4 py-2 rounded-full text-xs transition-colors"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" />
                    <span>WhatsApp Help</span>
                  </a>
                )}
              </div>
            </div>

            {/* Stepper Progress Timeline with Connected Bar */}
            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-neutral-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-black">
                    Delivery Progression
                  </h3>
                  <p className="text-xs text-neutral-400">Step {currentStage + 1} of 5 &bull; {steps[currentStage]?.title}</p>
                </div>

                <div className="group relative cursor-pointer text-neutral-400 hover:text-black">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 16v-4M12 8h.01"/>
                  </svg>
                  <div className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover:block z-20 w-52 bg-neutral-900 text-white text-[10px] rounded-xl px-2.5 py-1.5 shadow-lg text-left">
                    Milestones are updated in real-time as parcels are packaged, scanned, and dispatched.
                    <div className="absolute top-full right-2 border-4 border-transparent border-t-neutral-900" />
                  </div>
                </div>
              </div>

              {/* Connected Visual Progression Bar */}
              <div className="relative pt-2 pb-1">
                {/* Background Line */}
                <div className="hidden sm:block absolute top-6 left-6 right-6 h-1 bg-neutral-100 -translate-y-1/2 z-0" />
                {/* Active Filled Line */}
                <div
                  className="hidden sm:block absolute top-6 left-6 h-1 bg-black -translate-y-1/2 z-0 transition-all duration-500"
                  style={{ width: `calc(${(currentStage / (steps.length - 1)) * 100}% * 0.88)` }}
                />

                {/* Steps */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-2 relative z-10">
                  {steps.map((step, idx) => {
                    const isDone = idx < currentStage;
                    const isCurrent = idx === currentStage;
                    return (
                      <div
                        key={step.title}
                        className="group relative flex sm:flex-col items-center sm:items-center gap-3 sm:gap-2"
                      >
                        {/* Tooltip on Hover */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30 w-44 bg-neutral-900 text-white text-[10px] rounded-xl px-2.5 py-1.5 shadow-lg text-center">
                          {step.tooltip}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
                        </div>

                        {/* Node Circle */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0 ${
                            isCurrent
                              ? 'bg-black text-white ring-4 ring-neutral-200 shadow-sm'
                              : isDone
                              ? 'bg-black text-white'
                              : 'bg-neutral-100 text-neutral-400'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>

                        {/* Label & Description */}
                        <div className="text-left sm:text-center min-w-0">
                          <h4 className={`text-xs font-bold leading-tight truncate ${isCurrent ? 'text-black' : isDone ? 'text-neutral-800' : 'text-neutral-400'}`}>
                            {step.title}
                          </h4>
                          <p className="text-[10px] text-neutral-400 truncate hidden sm:block">
                            {isCurrent ? 'In Progress' : isDone ? 'Completed' : 'Pending'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Courier & Shipment Details Card (if shipment exists) */}
            {order.shipment && (
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/20 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Dispatched via Courier</span>
                        <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 capitalize">
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
                      <span>Track on Courier Site</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                      Tracking Code
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-sm text-neutral-900 select-all truncate">
                        {order.shipment.tracking_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyTracking(order.shipment.tracking_number)}
                        className="p-1.5 hover:bg-neutral-200 rounded-lg text-neutral-600 hover:text-black transition-colors shrink-0"
                        title="Copy Tracking Number"
                      >
                        {copiedTracking ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                      Dispatched On
                    </span>
                    <span className="text-xs font-bold text-neutral-800">
                      {order.shipment.shipped_at
                        ? new Date(order.shipment.shipped_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
                        : 'Scheduled for dispatch'}
                    </span>
                  </div>

                  <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-200">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                      Delivery Status
                    </span>
                    <span className="text-xs font-bold text-neutral-800">
                      {order.shipment.delivered_at
                        ? `Delivered on ${new Date(order.shipment.delivered_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}`
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
                    <Package className="w-4 h-4 text-neutral-500" />
                    <span>Package Items ({order.items?.length || 0})</span>
                  </h3>
                  <span className="text-xs text-neutral-400 font-mono">
                    {order.currency || 'NGN'}
                  </span>
                </div>

                <div className="divide-y divide-neutral-100">
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-neutral-900">{item.item_name}</p>
                        <p className="text-neutral-500 font-mono text-[11px]">
                          Qty: {item.quantity} &bull; SKU: {item.sku}
                        </p>
                      </div>
                      <span className="font-bold text-neutral-900 font-mono">
                        {formatPrice(item.line_total)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-neutral-100 space-y-1.5 text-xs text-neutral-600">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-black">{formatPrice(order.subtotal)}</span>
                  </div>
                  {order.discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount:</span>
                      <span className="font-semibold">-{formatPrice(order.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Delivery ({order.shipping_zone_snapshot?.zone_name || 'Standard'}):</span>
                    <span className="font-semibold text-black">{formatPrice(order.shipping_fee)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-black pt-2 border-t border-neutral-200">
                    <span>Total Amount:</span>
                    <span className="font-mono">{formatPrice(order.grand_total)}</span>
                  </div>
                </div>
              </div>

              {/* Destination & Payment Verification (1 col) */}
              <div className="space-y-6">
                {/* Delivery Destination */}
                <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Destination</span>
                  </h4>
                  <div className="text-xs text-neutral-700 space-y-1">
                    <p className="font-bold text-neutral-900">
                      {order.shipping_address_snapshot?.full_name}
                    </p>
                    <p>{order.shipping_address_snapshot?.address_line1}</p>
                    <p>
                      {order.shipping_address_snapshot?.city}, {order.shipping_address_snapshot?.state}
                    </p>
                    <p className="text-neutral-500 pt-1">Phone: {order.shipping_address_snapshot?.phone}</p>
                  </div>
                </div>

                {/* Payment Status Card */}
                <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                      Payment
                    </h4>
                    <span
                      className={`inline-flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full capitalize ${
                        isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {isPaid ? (
                        <svg className="w-3 h-3 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        <Clock className="w-3 h-3 text-amber-700" />
                      )}
                      <span>{isPaid ? 'Settled' : 'Pending'}</span>
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 pt-1 text-neutral-600">
                    <div className="flex justify-between">
                      <span>Gateway:</span>
                      <span className="font-medium text-black">
                        {getGatewayDisplayName(order.payment?.provider) || (isPaid ? 'Settled' : 'Not Selected')}
                      </span>
                    </div>
                    {order.payment?.provider_reference && (
                      <div className="flex justify-between">
                        <span>Ref:</span>
                        <span className="font-mono text-[11px] text-neutral-700 select-all">
                          {order.payment.provider_reference}
                        </span>
                      </div>
                    )}
                    {order.payment?.verified_at && (
                      <div className="flex justify-between text-[11px]">
                        <span>Verified:</span>
                        <span className="text-neutral-500">
                          {new Date(order.payment.verified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Trust Badge */}
                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200 text-xs text-neutral-500 flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>Buyer Protection active. Direct dispatch from Enugu logistics hub.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment Options Modal */}
        {showPaymentModal && order && !isPaid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade"
              onClick={() => {
                if (!isInitializingPayment) setShowPaymentModal(false);
              }}
            />
            <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl z-10 space-y-5 animate-rise">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-black">Choose Payment Method</h3>
                  <p className="text-xs text-neutral-400 font-mono">
                    Order #{order.order_number} &bull; Total: {formatPrice(order.grand_total)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  disabled={Boolean(isInitializingPayment)}
                  className="p-1.5 hover:bg-neutral-100 rounded-full text-neutral-400 hover:text-black transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {paymentError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="space-y-3">
                {/* Kora Option */}
                <div
                  onClick={() => setSelectedGateway('kora')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                    selectedGateway === 'kora'
                      ? 'border-[#055B5C] bg-[#055B5C]/5 shadow-sm'
                      : 'border-neutral-200 hover:border-neutral-300 bg-white'
                  }`}
                >
                  <div
                    className={`size-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                      selectedGateway === 'kora' ? 'border-[#055B5C]' : 'border-neutral-400'
                    }`}
                  >
                    {selectedGateway === 'kora' && (
                      <div className="size-2 rounded-full bg-[#055B5C]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-black">Kora Checkout</span>
                      <span className="text-[10px] font-semibold bg-[#055B5C]/10 text-[#055B5C] px-2 py-0.5 rounded-full">
                        Card & Bank
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Pay with Debit/Credit Card, Bank Transfer, or Virtual Account. Instant verification.
                    </p>
                  </div>
                </div>

                {/* Monnify Option */}
                <div
                  onClick={() => setSelectedGateway('monnify')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                    selectedGateway === 'monnify'
                      ? 'border-[#002244] bg-[#002244]/5 shadow-sm'
                      : 'border-neutral-200 hover:border-neutral-300 bg-white'
                  }`}
                >
                  <div
                    className={`size-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                      selectedGateway === 'monnify' ? 'border-[#002244]' : 'border-neutral-400'
                    }`}
                  >
                    {selectedGateway === 'monnify' && (
                      <div className="size-2 rounded-full bg-[#002244]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-black">Monnify Gateway</span>
                      <span className="text-[10px] font-semibold bg-[#002244]/10 text-[#002244] px-2 py-0.5 rounded-full">
                        Card & USSD
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Pay via Cards, Bank Transfer, or USSD (*737#, etc.). Instant settlement.
                    </p>
                  </div>
                </div>

                {/* WhatsApp Support Option */}
                <div
                  onClick={() => setSelectedGateway('whatsapp')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                    selectedGateway === 'whatsapp'
                      ? 'border-[#25D366] bg-[#25D366]/5 shadow-sm'
                      : 'border-neutral-200 hover:border-neutral-300 bg-white'
                  }`}
                >
                  <div
                    className={`size-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                      selectedGateway === 'whatsapp' ? 'border-[#25D366]' : 'border-neutral-400'
                    }`}
                  >
                    {selectedGateway === 'whatsapp' && (
                      <div className="size-2 rounded-full bg-[#25D366]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-black">WhatsApp Support</span>
                      <span className="text-[10px] font-semibold bg-[#25D366]/10 text-[#25D366] px-2 py-0.5 rounded-full">
                        Chat Agent
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Chat directly with customer support to pay via bank transfer and confirm receipt manually.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleInitiatePayment()}
                  disabled={Boolean(isInitializingPayment)}
                  className={`w-full py-3.5 rounded-full text-white font-bold text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-2 ${
                    selectedGateway === 'kora'
                      ? 'bg-[#055B5C] hover:bg-[#044748]'
                      : selectedGateway === 'monnify'
                      ? 'bg-[#002244] hover:bg-[#001730]'
                      : 'bg-[#25D366] hover:bg-[#1EBE5D]'
                  } disabled:opacity-60`}
                >
                  {isInitializingPayment ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Opening Payment Gateway...</span>
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
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-black/10 border-t-black rounded-full animate-spin" />
        </div>
      }
    >
      <TrackOrderContent />
    </Suspense>
  );
}
