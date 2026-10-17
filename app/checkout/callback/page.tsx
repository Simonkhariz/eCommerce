'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkBadge01Icon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  Clock01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons';
import { Printer, Download } from 'lucide-react';
import { toJpeg } from 'html-to-image';
import { formatPrice } from '@/lib/currency';
import { apiVerifyPayment, apiGetOrder, PaymentVerificationResponse } from '@/lib/api-client';
import { buildWhatsAppReceiptUrl, SUPPORT_PHONE_FORMATTED } from '@/lib/whatsapp';
import { useCart } from '@/context/CartContext';
import { CartItem } from '@/types';

function WhatsAppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CheckoutCallbackContent() {
  const searchParams = useSearchParams();

  // Robust query extraction across all gateway redirect variants (including double '?' from naive redirects)
  const getParam = useCallback((key: string): string => {
    const fromParams = searchParams.get(key);
    if (fromParams) return fromParams;
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      const pairs = search.replace(/^\?/, '').split(/[?&]/);
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        if (k === key && v) {
          return decodeURIComponent(v);
        }
      }
    }
    return '';
  }, [searchParams]);

  const rawReference =
    getParam('reference') ||
    getParam('paymentReference') ||
    getParam('trxref') ||
    getParam('transactionReference') ||
    '';
  const queryOrderNumber = getParam('order_number') || getParam('order') || '';
  let queryToken = getParam('token') || '';
  if (queryToken.includes('?')) {
    queryToken = queryToken.split('?')[0];
  }

  // Extract order number from reference if not explicitly in query
  // Reference format: PAY-ORD-YYYYMMDD-XXXXXX-XXXX or MNFY-ORD-YYYYMMDD-XXXXXX-XXXX
  let resolvedOrderNumber = queryOrderNumber;
  if (!resolvedOrderNumber && (rawReference.startsWith('PAY-ORD-') || rawReference.startsWith('MNFY-ORD-'))) {
    const parts = rawReference.split('-');
    if (parts.length >= 4) {
      resolvedOrderNumber = `ORD-${parts[2]}-${parts[3]}`;
    }
  }

  // Determine initial token from query param or localStorage
  const [token, setToken] = useState<string>(() => {
    if (queryToken) return queryToken;
    if (typeof window !== 'undefined') {
      const targetOrder = resolvedOrderNumber || localStorage.getItem('shopco_latest_order_number');
      if (targetOrder) {
        const stored = localStorage.getItem(`shopco_guest_token_${targetOrder}`);
        if (stored) return stored;
      }
      return localStorage.getItem('shopco_latest_guest_token') || '';
    }
    return '';
  });

  const router = useRouter();
  const { restoreItems } = useCart();
  const [inputToken, setInputToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [result, setResult] = useState<PaymentVerificationResponse | null>(null);
  const [orderData, setOrderData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingJpeg, setIsSavingJpeg] = useState<boolean>(false);
  const [pollAttempts, setPollAttempts] = useState<number>(0);

  const handleSaveJpeg = async () => {
    const node = document.getElementById('printable-receipt');
    if (!node) return;
    setIsSavingJpeg(true);
    try {
      const dataUrl = await toJpeg(node, {
        quality: 0.95,
        backgroundColor: '#FFFFFF',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `SHOPCO-Receipt-${result?.order_number || 'order'}.jpeg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export JPEG', err);
      alert('Unable to generate JPEG. You can also use Print to save as PDF.');
    } finally {
      setIsSavingJpeg(false);
    }
  };

  useEffect(() => {
    if (queryToken && queryToken !== token) {
      setToken(queryToken);
    } else if (!token && resolvedOrderNumber && typeof window !== 'undefined') {
      const stored =
        localStorage.getItem(`shopco_guest_token_${resolvedOrderNumber}`) ||
        (localStorage.getItem('shopco_latest_order_number') === resolvedOrderNumber
          ? localStorage.getItem('shopco_latest_guest_token')
          : null);
      if (stored) {
        setToken(stored);
      }
    }
  }, [queryToken, token, resolvedOrderNumber]);

  const verify = useCallback(async (tokenOverride?: string) => {
    if (!resolvedOrderNumber) {
      setIsLoading(false);
      setErrorMessage('Missing order number or transaction reference in return parameters.');
      return;
    }

    let activeToken = tokenOverride !== undefined ? tokenOverride : token;
    if (!activeToken && typeof window !== 'undefined' && resolvedOrderNumber) {
      activeToken =
        localStorage.getItem(`shopco_guest_token_${resolvedOrderNumber}`) ||
        (localStorage.getItem('shopco_latest_order_number') === resolvedOrderNumber
          ? localStorage.getItem('shopco_latest_guest_token') || ''
          : '');
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // The return query string is NEVER trusted as proof of payment!
      // We authoritatively query our backend service to verify with Monnify/Kora.
      const res = await apiVerifyPayment(resolvedOrderNumber, activeToken || undefined, rawReference || undefined);
      setResult(res);

      if (activeToken && typeof window !== 'undefined') {
        localStorage.setItem(`shopco_guest_token_${resolvedOrderNumber}`, activeToken);
      }

      // Fetch detailed order snapshot for itemized receipt matching invoice
      try {
        const ord = await apiGetOrder(resolvedOrderNumber, {
          token: activeToken || undefined,
          reference: rawReference || undefined,
        });
        setOrderData(ord);
      } catch (ordErr) {
        console.warn('Could not load detailed order items for receipt', ordErr);
      }
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Payment verification could not be completed. Please check your order status.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [resolvedOrderNumber, token, rawReference]);

  useEffect(() => {
    verify();
  }, [verify]);

  // Authoritative verified paid amount with multi-tiered resilient fallback
  const resolvedAmount = Number(
    (result?.amount && Number(result.amount) > 0)
      ? result.amount
      : (orderData?.grand_total && Number(orderData.grand_total) > 0)
        ? orderData.grand_total
        : 0
  );

  const resolvedCurrency = result?.currency || orderData?.currency || 'NGN';

  // Effective receipt payload with safe fallback
  const effectiveResult: PaymentVerificationResponse = {
    order_number: result?.order_number || resolvedOrderNumber,
    provider_reference: result?.provider_reference || rawReference || 'VERIFIED',
    provider: (result?.provider || (rawReference.startsWith('MNFY') ? 'monnify' : 'kora')) as any,
    status: (result?.status || 'successful') as any,
    order_status: result?.order_status || orderData?.order_status || 'paid',
    amount: resolvedAmount,
    currency: resolvedCurrency,
    verified_at: result?.verified_at || new Date().toISOString(),
    source: result?.source || 'client_resolved',
  };

  // Case-insensitive, multi-source status resolution
  const isSuccess =
    ['successful', 'paid', 'completed'].includes(String(result?.status || '').toLowerCase()) ||
    ['paid'].includes(String(result?.order_status || '').toLowerCase()) ||
    ['successful', 'paid'].includes(String((result as any)?.payment_status || '').toLowerCase()) ||
    ['paid'].includes(String(orderData?.order_status || '').toLowerCase()) ||
    ['successful'].includes(String(orderData?.payment_status || '').toLowerCase());

  const isPending =
    !isSuccess &&
    (['pending', 'processing', 'awaiting_payment'].includes(String(result?.status || '').toLowerCase()) ||
      ['pending', 'pending_payment', 'awaiting_payment'].includes(String(result?.order_status || '').toLowerCase()) ||
      ['pending', 'pending_payment'].includes(String(orderData?.order_status || '').toLowerCase()));

  // Auto-polling for pending bank settlements (every 2.5s up to 10 times = 25 seconds)
  useEffect(() => {
    if (!isLoading && !errorMessage && isPending && pollAttempts < 10) {
      const timer = setTimeout(() => {
        setPollAttempts((prev) => prev + 1);
        verify();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, errorMessage, isPending, pollAttempts, verify]);

  const handleRestoreToCart = () => {
    if (!orderData?.items || orderData.items.length === 0) {
      router.push('/cart');
      return;
    }
    const restored: CartItem[] = orderData.items.map((it: any) => {
      let vo = it.variant_options;
      if (typeof vo === 'string') {
        try {
          vo = JSON.parse(vo);
        } catch {
          vo = {};
        }
      }
      const size = vo?.size || it.size || 'M';
      const colorName = vo?.color || 'Default';
      const colorHex = vo?.color_hex || '#000000';
      return {
        id: `${it.product_id}-${size}-${colorName.replace(/\s+/g, '')}`,
        productId: String(it.product_id),
        name: it.item_name || it.name || 'Product',
        slug: (it.item_name || 'product').toLowerCase().replace(/\s+/g, '-'),
        price: Number(it.unit_price || it.price || 0),
        image: it.image || '/images/products/placeholder.jpg',
        size: size,
        color: { name: colorName, hex: colorHex },
        quantity: Number(it.quantity || 1),
      };
    });
    restoreItems(restored);
    router.push('/cart');
  };

  const isAuthError =
    errorMessage &&
    (errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('guest access token') ||
      errorMessage.toLowerCase().includes('customer session'));

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-[#F9F9F9]">
      <div className="bg-white rounded-3xl p-6 sm:p-10 max-w-lg w-full border border-neutral-200 shadow-xl text-center space-y-6">
        {isLoading ? (
          <div className="py-12 space-y-4">
            <div className="w-14 h-14 border-4 border-black/10 border-t-black rounded-full animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-black">Verifying Payment...</h2>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Please wait while we authoritatively verify your transaction with Kora and your banking provider.
            </p>
          </div>
        ) : errorMessage ? (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={AlertCircleIcon} size={36} />
            </div>
            <h2 className="text-2xl font-extrabold text-black">Verification Issue</h2>
            <p className="text-sm text-neutral-600 max-w-sm mx-auto">{errorMessage}</p>

            {isAuthError && (
              <div className="pt-2 text-left space-y-2">
                <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200">
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">
                    Enter Guest Access Key
                  </label>
                  <p className="text-[11px] text-neutral-500 mb-2.5">
                    If you placed this order as a guest, paste your Guest Key below to verify payment.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputToken}
                      onChange={(e) => setInputToken(e.target.value.trim())}
                      placeholder="Paste guest token here..."
                      className="flex-1 text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (inputToken) {
                          setToken(inputToken);
                          verify(inputToken);
                        }
                      }}
                      disabled={!inputToken}
                      className="bg-black text-white text-xs px-4 py-2 rounded-xl font-medium hover:bg-neutral-800 disabled:opacity-40 transition-colors shrink-0"
                    >
                      Authorize
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 flex flex-col gap-2.5">
              <button
                onClick={() => verify()}
                className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3.5 rounded-full text-sm transition-colors"
              >
                Retry Verification
              </button>
              <Link
                href="/cart"
                className="w-full bg-neutral-100 text-black hover:bg-neutral-200 font-semibold py-3 rounded-full text-sm transition-colors block"
              >
                Return to Cart
              </Link>
            </div>
          </div>
        ) : isSuccess ? (
          <div className="py-4 space-y-5">
            {/* Printable Receipt Card */}
            <div id="printable-receipt" className="space-y-4 bg-white p-5 sm:p-7 rounded-3xl border border-neutral-100 shadow-sm text-center">
              {/* Receipt Header */}
              <div className="flex items-center justify-between pb-3 text-left">
                <div>
                  <span className="font-black text-lg tracking-tight text-black block">SHOP.CO</span>
                  <span className="text-[10px] text-neutral-400 uppercase tracking-widest">Official Receipt</span>
                </div>
                <span className="text-xs font-mono text-neutral-400">
                  {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>

              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm border border-emerald-200">
                <HugeiconsIcon icon={CheckmarkBadge01Icon} size={36} className="text-emerald-600" />
              </div>

              <div>
                <div className="inline-flex items-center px-3 py-0.5 bg-neutral-100 text-neutral-800 rounded-full text-[11px] font-semibold mb-1">
                  <span>Official Payment Receipt</span>
                </div>
                <h2 className="text-2xl font-extrabold text-black">Payment Confirmed!</h2>
                <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-500 mt-0.5">
                  <span>Order <strong className="font-mono text-black">{effectiveResult.order_number}</strong></span>
                  <div className="group relative cursor-pointer inline-flex items-center text-neutral-400 hover:text-black">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 w-52 bg-neutral-900 text-white text-[10px] rounded-xl px-2.5 py-1.5 shadow-lg text-center">
                      Authoritatively verified via {effectiveResult.provider === 'monnify' ? 'Monnify Gateway' : 'Kora Gateway'}.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seamless Receipt Details Table (Same Contents as Invoice + Extra Receipt Infos) */}
              <div className="bg-[#FAFAFA] rounded-2xl p-4 text-xs text-neutral-700 text-left space-y-3">
                {/* Itemized Order Products */}
                {orderData?.items && orderData.items.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-neutral-400 font-bold text-[11px] uppercase tracking-wider">
                      <span>Items Ordered ({orderData.items.length})</span>
                      <span>Amount</span>
                    </div>
                    <div className="divide-y divide-neutral-100 max-h-36 overflow-y-auto">
                      {orderData.items.map((item: any, idx: number) => (
                        <div key={idx} className="py-2 flex items-center justify-between">
                          <div className="pr-2 min-w-0">
                            <p className="font-semibold text-black truncate">{item.name || item.product_name}</p>
                            <p className="text-[11px] text-neutral-400">
                              Qty: {item.quantity}{item.size ? ` · Size: ${item.size}` : ''}
                            </p>
                          </div>
                          <span className="font-mono text-black font-medium shrink-0">
                            {formatPrice(item.line_total || (item.unit_price || item.price) * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Financial Calculation Breakdown */}
                <div className="pt-2 border-t border-neutral-200 space-y-1.5 text-neutral-600">
                  {orderData?.subtotal !== undefined && (
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-medium text-black">
                        {formatPrice(orderData.subtotal)}
                      </span>
                    </div>
                  )}

                  {Boolean(orderData?.discount_amount) && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount:</span>
                      <span className="font-semibold">
                        -{formatPrice(orderData.discount_amount)}
                      </span>
                    </div>
                  )}

                  {orderData?.shipping_fee !== undefined && (
                    <div className="flex justify-between">
                      <span>Delivery:</span>
                      <span className="font-medium text-black">
                        {formatPrice(orderData.shipping_fee)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t border-neutral-200 text-sm font-bold text-black">
                    <span>Amount Paid:</span>
                    <span className="font-black text-base font-mono">
                      {formatPrice(effectiveResult.amount)}
                    </span>
                  </div>
                </div>

                {/* Delivery Destination */}
                {orderData?.shipping_address_snapshot && (
                  <div className="pt-2 border-t border-neutral-200 flex justify-between items-center text-[11px] text-neutral-500">
                    <span>Deliver To:</span>
                    <span className="font-medium text-black text-right truncate max-w-[200px]">
                      {orderData.shipping_address_snapshot.city}, {orderData.shipping_address_snapshot.state}
                    </span>
                  </div>
                )}

                {/* Extra Receipt Proof Information */}
                <div className="pt-2 border-t border-neutral-200 space-y-2 text-[11px]">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-neutral-500 shrink-0 text-left">Transaction Ref:</span>
                    <span
                      className="font-mono text-neutral-800 text-right truncate max-w-[190px] sm:max-w-[260px] ml-auto font-medium"
                      title={effectiveResult.provider_reference}
                    >
                      {effectiveResult.provider_reference}
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <span className="text-neutral-500 shrink-0 text-left">Payment Method:</span>
                    <span className="font-semibold text-black capitalize text-right ml-auto">
                      {effectiveResult.provider || (effectiveResult.provider_reference?.startsWith('MNFY') ? 'Monnify' : 'Kora')}
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <span className="text-neutral-500 shrink-0 text-left">Payment Status:</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 capitalize text-right ml-auto">
                      <svg className="w-3 h-3 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span>Paid / Successful</span>
                    </span>
                  </div>

                  {effectiveResult.verified_at && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-neutral-500 shrink-0 text-left">Verified At:</span>
                      <span className="text-neutral-600 text-right ml-auto">
                        {new Date(effectiveResult.verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-3">
              {/* Primary Action: Track Package */}
              <Link
                href={`/track-order?order=${encodeURIComponent(effectiveResult.order_number)}&token=${encodeURIComponent(token || '')}`}
                className="w-full bg-black text-white hover:bg-neutral-800 font-bold py-3.5 rounded-full text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span>Track Order Progress</span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
              </Link>

              {/* Sleek Single-Row Icon Actions Bar */}
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => typeof window !== 'undefined' && window.print()}
                  className="p-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-full transition-colors relative group"
                  aria-label="Print receipt"
                >
                  <Printer className="w-4 h-4" />
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 whitespace-nowrap bg-neutral-900 text-white text-[10px] rounded-lg px-2 py-1 shadow-md">
                    Print Receipt
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleSaveJpeg}
                  disabled={isSavingJpeg}
                  className="p-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-full transition-colors relative group disabled:opacity-50"
                  aria-label="Save receipt image"
                >
                  {isSavingJpeg ? (
                    <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin block" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 whitespace-nowrap bg-neutral-900 text-white text-[10px] rounded-lg px-2 py-1 shadow-md">
                    Save as Image
                  </div>
                </button>

                <a
                  href={buildWhatsAppReceiptUrl({
                    order_number: effectiveResult.order_number,
                    grand_total: effectiveResult.amount,
                    subtotal: orderData?.subtotal,
                    shipping_fee: orderData?.shipping_fee,
                    discount_amount: orderData?.discount_amount,
                    items: orderData?.items,
                    payment_status: 'successful',
                    guest_access_token: token || undefined,
                    shipping_address: orderData?.shipping_address_snapshot,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-neutral-100 hover:bg-neutral-200 text-[#25D366] rounded-full transition-colors relative group"
                  aria-label="Share receipt on WhatsApp"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 whitespace-nowrap bg-neutral-900 text-white text-[10px] rounded-lg px-2 py-1 shadow-md">
                    Send to WhatsApp
                  </div>
                </a>

                <Link
                  href="/category"
                  className="text-xs font-semibold text-neutral-500 hover:text-black transition-colors pl-2"
                >
                  Continue Shopping
                </Link>
              </div>

              {/* Direct WhatsApp Support Row */}
              <div className="pt-1">
                <a
                  href={`https://wa.me/2349066707079?text=${encodeURIComponent(`Hello SHOP.CO Support! I have an inquiry about my receipt for order #${effectiveResult.order_number}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-black transition-colors"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" />
                  <span>WhatsApp Support: {SUPPORT_PHONE_FORMATTED}</span>
                </a>
              </div>
            </div>
          </div>
        ) : isPending ? (
          <div className="py-4 space-y-5">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <HugeiconsIcon icon={Clock01Icon} size={36} />
            </div>

            <div>
              <h2 className="text-2xl font-extrabold text-black">Payment Awaiting Settlement</h2>
              <p className="text-xs text-neutral-500 mt-1">
                Reference: <strong className="font-mono text-black">{result?.provider_reference || rawReference}</strong>
              </p>
            </div>

            <p className="text-sm text-neutral-600 max-w-sm mx-auto">
              Your transaction is currently clearing with the payment switch. Once confirmed, your order status will automatically update to paid.
            </p>

            {pollAttempts < 10 ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-800 rounded-full text-xs font-medium border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span>Checking bank settlement automatically (attempt {pollAttempts + 1} of 10)...</span>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">
                Bank transfers may take up to 2 minutes to settle. You can refresh below or check your order history.
              </p>
            )}

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setPollAttempts(0);
                  verify();
                }}
                className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3.5 rounded-full text-sm transition-colors"
              >
                Refresh Payment Status
              </button>

              <Link
                href="/orders"
                className="w-full bg-neutral-900 text-white hover:bg-black font-semibold py-3 rounded-full text-sm transition-colors block text-center"
              >
                View in My Orders (History)
              </Link>

              <a
                href={`https://wa.me/2349066707079?text=${encodeURIComponent(`Hello Support! My payment transfer for order reference ${result?.provider_reference || rawReference} is awaiting settlement. Can you verify?`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 font-semibold py-3 rounded-full text-sm transition-colors flex items-center justify-center gap-2"
              >
                <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                <span>Verify on WhatsApp (+234 906 670 7079)</span>
              </a>

              <Link
                href="/category"
                className="w-full bg-neutral-100 text-black hover:bg-neutral-200 font-semibold py-3 rounded-full text-sm transition-colors inline-block"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-5">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <HugeiconsIcon icon={AlertCircleIcon} size={36} />
            </div>

            <div>
              <h2 className="text-2xl font-extrabold text-black">Payment Failed or Declined</h2>
              <p className="text-xs text-neutral-500 mt-1">
                Order <strong className="font-mono text-black">{result?.order_number || resolvedOrderNumber}</strong>
              </p>
            </div>

            <p className="text-sm text-neutral-600 max-w-sm mx-auto">
              {result?.failure_reason || 'The transaction could not be completed. Your order remains safely saved as pending.'}
            </p>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => verify()}
                className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-3.5 rounded-full text-sm transition-colors flex items-center justify-center gap-2"
              >
                <span>Re-verify Payment Status</span>
              </button>

              <Link
                href="/orders"
                className="w-full bg-neutral-900 text-white hover:bg-black font-semibold py-3 rounded-full text-sm transition-colors block text-center"
              >
                View in My Orders (History)
              </Link>

              {orderData?.items && orderData.items.length > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreToCart}
                  className="w-full bg-neutral-100 text-black hover:bg-neutral-200 font-semibold py-3 rounded-full text-sm transition-colors block text-center"
                >
                  Restore Items to Cart & Retry ({orderData.items.length} items)
                </button>
              )}

              <a
                href={`https://wa.me/2349066707079?text=${encodeURIComponent(`Hello Support! I had an issue completing payment for order ${result?.order_number || resolvedOrderNumber}. Can I pay via direct bank transfer?`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 font-semibold py-3 rounded-full text-sm transition-colors flex items-center justify-center gap-2"
              >
                <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                <span>Pay via WhatsApp Support</span>
              </a>
            </div>
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
          <div className="w-10 h-10 border-4 border-black/10 border-t-black rounded-full animate-spin" />
        </div>
      }
    >
      <CheckoutCallbackContent />
    </Suspense>
  );
}
