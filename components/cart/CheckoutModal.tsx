'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import confetti from 'canvas-confetti';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CheckmarkBadge01Icon,
  CheckmarkCircle01Icon,
  DeliveryTruck01Icon,
  Ticket02Icon,
  AlertCircleIcon,
  Copy01Icon,
  Tick02Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import {
  apiGetCheckoutQuote,
  apiCreateCheckoutOrder,
  apiInitializePayment,
  apiGetPaymentMethods,
  PaymentMethodItem,
  CheckoutQuoteResponse,
  CheckoutOrderResponse,
  ShippingZone,
} from '@/lib/api-client';
import { buildWhatsAppInvoiceUrl, SUPPORT_PHONE_FORMATTED } from '@/lib/whatsapp';

function WhatsAppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NIGERIAN_STATES = [
  'Enugu',
  'Lagos',
  'Abuja (FCT)',
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
];

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose }) => {
  const { items, appliedPromo, clearCart } = useCart();
  const { user, addresses } = useAuth();

  const [step, setStep] = useState<'details' | 'success'>('details');
  const [isQuoting, setIsQuoting] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [quote, setQuote] = useState<CheckoutQuoteResponse | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CheckoutOrderResponse | null>(null);
  const [savedOrderItems, setSavedOrderItems] = useState<any[]>([]);
  const [savedOrderQuote, setSavedOrderQuote] = useState<CheckoutQuoteResponse | null>(null);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [isInitializingPayment, setIsInitializingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Dynamic payment methods list (Monnify is first, Kora is second, Request from WhatsApp is last)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([
    { id: 'monnify', name: 'Monnify', description: 'Pay via Card, Bank Transfer, USSD, or Phone', badge: 'Instant & Secure', is_default: true },
    { id: 'kora', name: 'Kora', description: 'Pay securely with Card, Bank Transfer, or Mobile Money', badge: 'Secure Checkout', is_default: false },
    { id: 'whatsapp', name: 'Request from WhatsApp', description: 'Send your invoice directly to our support team on WhatsApp', badge: 'Manual Support', is_default: false },
  ]);
  const [selectedMethod, setSelectedMethod] = useState<'monnify' | 'kora' | 'whatsapp'>('monnify');


  const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];

  // DEV TESTING PREFILL (Temporary - will be removed after development)
  const [formData, setFormData] = useState({
    fullName: 'Emeka Obi',
    email: 'test@shopco.ng',
    phone: '09066707079',
    address: '12 Chime Avenue, New Haven',
    city: 'Enugu',
    state: 'Enugu',
    notes: 'Please call upon arrival at the gate.',
    selectedZoneId: undefined as number | undefined,
  });

  // Prefill user details if available
  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        fullName: prev.fullName || user.full_name || '',
        email: prev.email || user.email || '',
        phone: prev.phone || user.phone || defaultAddr?.phone || '',
        address: prev.address || defaultAddr?.street_address || '',
        city: prev.city || defaultAddr?.city || '',
        state: prev.state || defaultAddr?.state || 'Enugu',
      }));
    }
  }, [user, defaultAddr]);

  // Transform cart items to API checkout items
  const prepareCheckoutItems = useCallback(() => {
    return items.map((item) => {
      const pid = parseInt(item.productId, 10) || 1;
      return {
        product_id: pid,
        quantity: item.quantity,
        size: typeof item.size === 'string' ? item.size : undefined,
        color: item.color?.name,
      };
    });
  }, [items]);

  // Fetch real-time server quote whenever state, items, or coupon changes
  const fetchQuote = useCallback(async () => {
    if (items.length === 0 || !formData.state) return;

    setIsQuoting(true);
    setQuoteError(null);

    try {
      const checkoutItems = prepareCheckoutItems();
      const quoteData = await apiGetCheckoutQuote({
        items: checkoutItems,
        shipping_address: {
          state: formData.state.replace(' (FCT)', ''),
          country: 'Nigeria',
        },
        shipping_zone_id: formData.selectedZoneId,
        coupon_code: appliedPromo?.code,
      });

      setQuote(quoteData);
      if (quoteData.shipping_zone && !formData.selectedZoneId) {
        setFormData((prev) => ({ ...prev, selectedZoneId: quoteData.shipping_zone?.id }));
      }
    } catch (err: any) {
      setQuote(null);
      setQuoteError(err.message || 'Unable to resolve delivery zone for this location.');
    } finally {
      setIsQuoting(false);
    }
  }, [items, formData.state, formData.selectedZoneId, appliedPromo, prepareCheckoutItems]);

  useEffect(() => {
    if (isOpen) {
      fetchQuote();
    }
  }, [isOpen, fetchQuote]);

  // Fetch store configured payment methods on mount
  useEffect(() => {
    apiGetPaymentMethods()
      .then((res) => {
        if (res?.methods && res.methods.length > 0) {
          setPaymentMethods(res.methods);
          const defaultMethod = res.methods.find((m) => m.is_default) || res.methods[0];
          setSelectedMethod(defaultMethod.id as any);
        }
      })
      .catch((err) => {
        console.warn('Could not load payment methods from backend:', err);
      });
  }, []);

  if (!isOpen) return null;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (items.length === 0) {
      setSubmitError('Your cart is empty.');
      return;
    }

    if (!quote || !quote.shipping_zone) {
      setSubmitError('Please select a valid delivery zone before placing order.');
      return;
    }

    setIsSubmitting(true);

    try {
      const checkoutItems = prepareCheckoutItems();
      const orderData = await apiCreateCheckoutOrder({
        email: formData.email,
        items: checkoutItems,
        shipping_address: {
          full_name: formData.fullName,
          phone: formData.phone,
          address_line1: formData.address,
          city: formData.city,
          state: formData.state.replace(' (FCT)', ''),
          country: 'Nigeria',
        },
        shipping_zone_id: quote.shipping_zone.id,
        coupon_code: appliedPromo?.code,
        notes: formData.notes,
      });

      setSavedOrderItems([...items]);
      setSavedOrderQuote(quote);
      setCreatedOrder(orderData);
      setStep('success');
      clearCart();

      // Persist guest token to localStorage for frictionless payment verification callback
      if (typeof window !== 'undefined' && orderData.guest_access_token) {
        try {
          localStorage.setItem(`shopco_guest_token_${orderData.order_number}`, orderData.guest_access_token);
          localStorage.setItem('shopco_latest_guest_token', orderData.guest_access_token);
          localStorage.setItem('shopco_latest_order_number', orderData.order_number);
        } catch (e) {
          console.warn('Could not persist guest token to localStorage', e);
        }
      }

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (err) {
        console.log('Confetti triggered', err);
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to place order. Please review your cart and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyGuestToken = () => {
    if (createdOrder?.guest_access_token) {
      navigator.clipboard.writeText(createdOrder.guest_access_token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
    }
  };


  // Dynamically load Monnify checkout Web SDK
  const loadMonnifySdk = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error('Window unavailable'));
      if ((window as any).MonnifySDK) return resolve((window as any).MonnifySDK);

      const existingScript = document.querySelector('script[src*="monnify.js"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve((window as any).MonnifySDK));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://sdk.monnify.com/plugin/monnify.js';
      script.async = true;
      script.onload = () => resolve((window as any).MonnifySDK);
      script.onerror = () => reject(new Error('Failed to load Monnify checkout script'));
      document.head.appendChild(script);
    });
  };

  const handlePayOrder = async () => {
    if (!createdOrder) return;
    setIsInitializingPayment(true);
    setPaymentError(null);

    const redirectUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/checkout/callback?order=${encodeURIComponent(createdOrder.order_number)}`
        : undefined;

    // 1. If Request from WhatsApp selected
    if (selectedMethod === 'whatsapp') {
      const url = buildWhatsAppInvoiceUrl({
        order_number: createdOrder.order_number,
        grand_total: createdOrder.grand_total,
        subtotal: createdOrder.subtotal ?? savedOrderQuote?.subtotal,
        shipping_fee: createdOrder.shipping_fee ?? savedOrderQuote?.shipping_fee,
        discount_amount: createdOrder.discount_amount ?? savedOrderQuote?.discount_amount,
        items: savedOrderItems.length > 0 ? savedOrderItems : (createdOrder as any).items,
        guest_email: createdOrder.guest_email,
        payment_status: createdOrder.payment_status,
        guest_access_token: createdOrder.guest_access_token,
        shipping_address: createdOrder.shipping_address,
      });
      window.open(url, '_blank');
      setIsInitializingPayment(false);
      return;
    }

    try {
      const res = await apiInitializePayment(
        createdOrder.order_number,
        createdOrder.guest_access_token,
        redirectUrl,
        selectedMethod
      );

      // 2. If Monnify selected
      if (selectedMethod === 'monnify') {
        // Direct hosted redirect eliminates React Node.removeChild DOM errors and ensures smooth mobile bank transfers
        if (res.checkout_url) {
          window.location.href = res.checkout_url;
          return;
        }

        const monnifySdk = await loadMonnifySdk();
        setIsInitializingPayment(false);

        if (!monnifySdk || typeof monnifySdk.initialize !== 'function') {
          throw new Error('Monnify SDK is not available. Please verify network connection or choose another payment method.');
        }

        if (!res.api_key || !res.contract_code) {
          throw new Error('Monnify credentials are not fully configured in backend/.env (MONNIFY_CONTRACT_CODE is required).');
        }

        monnifySdk.initialize({
          amount: res.amount,
          currency: res.currency || 'NGN',
          reference: res.provider_reference,
          customerFullName: res.customer_name || formData.fullName || 'Valued Customer',
          customerEmail: res.customer_email || formData.email || 'customer@shopco.ng',
          apiKey: res.api_key,
          contractCode: res.contract_code,
          paymentDescription: res.payment_description || `Order #${createdOrder.order_number} at SHOP.CO`,
          isTestMode: res.is_test_mode ?? true,
          onComplete: function (response: any) {
            console.log('Monnify onComplete response:', response);
            setIsInitializingPayment(false);
            const status = String(
              response?.status || response?.paymentStatus || response?.transactionStatus || ''
            ).toUpperCase();

            if (status === 'SUCCESS' || status === 'PAID') {
              window.location.href = `/checkout/callback?order=${encodeURIComponent(createdOrder.order_number)}&reference=${encodeURIComponent(res.provider_reference)}`;
            } else {
              const msg =
                response?.message ||
                response?.responseMessage ||
                (typeof response === 'string' ? response : null) ||
                'Payment was not completed. Please try again or switch to another payment method.';
              setPaymentError(msg);
            }
          },
          onClose: function (data: any) {
            console.log('Monnify checkout closed:', data);
            setIsInitializingPayment(false);
          },
        });
      } else if (selectedMethod === 'kora') {
        // 3. If Kora selected
        if (res.checkout_url) {
          window.location.href = res.checkout_url;
        } else {
          throw new Error('Kora did not return a valid checkout session URL.');
        }
      }
    } catch (err: any) {
      setPaymentError(
        err.message || 'Payment initialization error. Check your sandbox credentials in backend/.env.'
      );
      setIsInitializingPayment(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      {/* Modal Card */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-md w-full z-10 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-black hover:bg-neutral-100 disabled:opacity-50"
          aria-label="Close checkout"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} />
        </button>

        {step === 'details' ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <HugeiconsIcon icon={DeliveryTruck01Icon} size={20} className="text-black" />
              <h3 className="font-bold text-lg text-black">Express Checkout</h3>
            </div>

            {submitError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
                <HugeiconsIcon icon={AlertCircleIcon} size={16} className="shrink-0 mt-0.5 text-red-500" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitOrder} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Johnson"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full bg-[#F0F0F0] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-black placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 08012345678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-[#F0F0F0] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-black placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. alex@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-[#F0F0F0] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-black placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                  Delivery Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="Street address, apartment or suite"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-[#F0F0F0] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-black placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    State
                  </label>
                  <div className="relative">
                    <select
                      value={formData.state}
                      onChange={(e) => {
                        const newState = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          state: newState,
                          selectedZoneId: undefined,
                        }));
                      }}
                      className="w-full bg-[#F0F0F0] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-black font-medium appearance-none focus:outline-none focus:ring-1 focus:ring-black cursor-pointer pr-7"
                    >
                      {NIGERIAN_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-neutral-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ikeja"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full bg-[#F0F0F0] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-black placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>

              {/* Promo Code Summary if applied */}
              {quote?.applied_coupon && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-emerald-800 font-medium">
                  <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Ticket02Icon} size={14} className="text-emerald-600" />
                    <span>Coupon <strong>{quote.applied_coupon.code}</strong></span>
                  </div>
                  <span className="font-bold">-{quote.applied_coupon.discount_percent}%</span>
                </div>
              )}

              {/* Financial Calculation Breakdown */}
              <div className="pt-2.5 border-t border-neutral-100 space-y-1.5 text-xs text-neutral-600">
                <div className="flex justify-between">
                  <span>Subtotal ({quote?.items_count ?? items.length} items)</span>
                  <span className="font-semibold text-black">
                    {formatPrice(quote ? quote.subtotal : items.reduce((acc, i) => acc + i.price * i.quantity, 0))}
                  </span>
                </div>

                {Boolean(quote?.discount_amount) && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount</span>
                    <span className="font-semibold">-{formatPrice(quote?.discount_amount)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span className="font-semibold text-black">
                    {quote?.shipping_zone ? formatPrice(quote.shipping_fee) : (isQuoting ? 'Calculating...' : '...')}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-neutral-200">
                  <span className="font-bold text-black text-sm">Total:</span>
                  <span className="font-black text-lg sm:text-xl text-black">
                    {formatPrice(
                      quote
                        ? quote.grand_total
                        : items.reduce((acc, i) => acc + i.price * i.quantity, 0)
                    )}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isQuoting || !quote?.shipping_zone}
                  className="w-full bg-black text-white hover:bg-neutral-800 disabled:opacity-50 font-bold py-3.5 rounded-full text-xs sm:text-sm transition-all shadow-md mt-2 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <span>Placing Order...</span>
                  ) : (
                    <>
                      <span>Proceed</span>
                      <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="text-center py-2 space-y-4">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm border border-emerald-200">
              <HugeiconsIcon icon={CheckmarkBadge01Icon} size={36} className="text-emerald-600" />
            </div>

            <div>
              <div className="inline-flex items-center px-3 py-0.5 bg-neutral-100 text-neutral-800 rounded-full text-[11px] font-semibold mb-1">
                <span>Official Proforma Invoice</span>
              </div>
              <h3 className="font-extrabold text-xl text-black">Order Placed!</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Ref: <strong className="text-black font-mono">{createdOrder?.order_number}</strong>
              </p>
            </div>

            {/* Itemized Invoice & Calculations Card (Matches Receipt Design) */}
            <div className="bg-[#FAFAFA] rounded-2xl p-4 text-xs text-left space-y-3">
              {/* Items List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-neutral-400 font-bold text-[11px] uppercase tracking-wider">
                  <span>Items Ordered ({savedOrderItems.length || createdOrder?.items_count || 1})</span>
                  <span>Amount</span>
                </div>
                <div className="divide-y divide-neutral-100 max-h-36 overflow-y-auto">
                  {savedOrderItems.map((item, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between">
                      <div className="pr-2 min-w-0">
                        <p className="font-semibold text-black truncate">{item.name}</p>
                        <p className="text-[11px] text-neutral-400">
                          Qty: {item.quantity}{item.size ? ` · Size: ${item.size}` : ''}
                        </p>
                      </div>
                      <span className="font-mono text-black font-medium shrink-0">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="pt-2 border-t border-neutral-200 space-y-1.5 text-neutral-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium text-black">
                    {formatPrice(createdOrder?.subtotal ?? savedOrderQuote?.subtotal ?? 0)}
                  </span>
                </div>

                {Boolean(createdOrder?.discount_amount || savedOrderQuote?.discount_amount) && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount:</span>
                    <span className="font-semibold">
                      -{formatPrice(createdOrder?.discount_amount || savedOrderQuote?.discount_amount || 0)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Delivery:</span>
                  <span className="font-medium text-black">
                    {formatPrice(createdOrder?.shipping_fee ?? savedOrderQuote?.shipping_fee ?? 0)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-neutral-200 text-sm font-bold text-black">
                  <span>Amount Due:</span>
                  <span className="font-black text-base font-mono">
                    {formatPrice(createdOrder?.grand_total ?? savedOrderQuote?.grand_total ?? 0)}
                  </span>
                </div>
              </div>

              {/* Delivery Details */}
              <div className="pt-2 border-t border-neutral-200 flex justify-between items-center text-[11px] text-neutral-500">
                <span>Deliver To:</span>
                <span className="font-medium text-black text-right truncate max-w-[200px]">
                  {createdOrder?.shipping_address?.city}, {createdOrder?.shipping_address?.state}
                </span>
              </div>
            </div>

            {/* Choose Payment Method Dropdown */}
            <div className="text-left space-y-1 pt-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block">
                Choose Payment Method
              </label>
              <div className="relative">
                <select
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value as any)}
                  className="w-full bg-[#F0F0F0] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-black font-semibold appearance-none focus:outline-none focus:ring-1 focus:ring-black cursor-pointer pr-8"
                >
                  {paymentMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.badge})
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-neutral-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {selectedMethod === 'monnify' ? (
                <button
                  onClick={handlePayOrder}
                  disabled={isInitializingPayment}
                  className="w-full bg-[#002244] hover:bg-[#001730] text-white font-bold py-3.5 rounded-full text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {isInitializingPayment ? (
                    <span>Opening Monnify...</span>
                  ) : (
                    <>
                      <span>Pay with Monnify ({formatPrice(createdOrder?.grand_total)})</span>
                      <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
                    </>
                  )}
                </button>
              ) : selectedMethod === 'kora' ? (
                <button
                  onClick={handlePayOrder}
                  disabled={isInitializingPayment}
                  className="w-full bg-[#055B5C] hover:bg-[#044748] text-white font-bold py-3.5 rounded-full text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {isInitializingPayment ? (
                    <span>Connecting to Kora...</span>
                  ) : (
                    <>
                      <span>Pay with Kora ({formatPrice(createdOrder?.grand_total)})</span>
                      <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handlePayOrder}
                  disabled={isInitializingPayment}
                  className="w-full bg-[#25D366] hover:bg-[#20ba59] text-white font-bold py-3.5 rounded-full text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  <WhatsAppIcon className="w-4 h-4 text-white shrink-0" />
                  <span>Send Order via WhatsApp ({formatPrice(createdOrder?.grand_total)})</span>
                </button>
              )}

              {paymentError && (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-left">
                  {paymentError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                {createdOrder && (
                  <a
                    href={buildWhatsAppInvoiceUrl({
                      order_number: createdOrder.order_number,
                      grand_total: createdOrder.grand_total,
                      subtotal: createdOrder.subtotal ?? savedOrderQuote?.subtotal,
                      shipping_fee: createdOrder.shipping_fee ?? savedOrderQuote?.shipping_fee,
                      discount_amount: createdOrder.discount_amount ?? savedOrderQuote?.discount_amount,
                      items: savedOrderItems.length > 0 ? savedOrderItems : (createdOrder as any).items,
                      guest_email: createdOrder.guest_email,
                      payment_status: createdOrder.payment_status,
                      guest_access_token: createdOrder.guest_access_token,
                      shipping_address: createdOrder.shipping_address,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-semibold py-2.5 px-3 rounded-full text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <WhatsAppIcon className="w-4 h-4 text-[#25D366] shrink-0" />
                    <span>WhatsApp Support</span>
                  </a>
                )}

                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold rounded-full text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
