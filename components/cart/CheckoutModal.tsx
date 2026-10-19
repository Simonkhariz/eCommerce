'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CheckmarkBadge01Icon,
  DeliveryTruck01Icon,
  Ticket02Icon,
  AlertCircleIcon,
  Copy01Icon,
  Tick02Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons';
import { formatPrice } from '@/lib/currency';
import {
  apiGetCheckoutQuote,
  apiCreateCheckoutOrder,
  apiInitializePayment,
  apiGetOrder,
  apiVerifyPayment,
  apiMarkPaymentSent,
  CheckoutQuoteResponse,
} from '@/lib/api-client';
import { buildWhatsAppInvoiceUrl } from '@/lib/whatsapp';
import { useStoreSupport } from '@/lib/use-store-support';
import {
  cartSignature,
  clearPendingOrder,
  readGuestToken,
  readPendingOrder,
  saveGuestToken,
  markInvoiceSent,
  wasInvoiceSent,
  savePendingOrder,
} from '@/lib/pending-order';
import { NIGERIAN_STATES } from '@/lib/nigeria';
import { Dialog } from '@/components/ui/Dialog';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PaymentMethodId = 'monnify' | 'kora' | 'whatsapp';

/** What the payment step needs, whether the order was just placed or is being resumed. */
interface PayableOrder {
  order_number: string;
  guest_email: string;
  guest_access_token?: string;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  grand_total: number;
  expires_at?: string | null;
  shipping_address: { full_name?: string; phone?: string; address_line1?: string; city?: string; state?: string };
  items: Array<{ name: string; quantity: number; size?: string; line_total?: number; price?: number }>;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const fieldClass =
  'w-full bg-[#F0F0F0] rounded-xl px-3.5 py-2.5 text-sm text-black placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-black';
const labelClass = 'text-xs font-semibold text-neutral-700 block mb-1';

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose }) => {
  const { items, appliedPromo, settlePendingOrder } = useCart();
  const { user, addresses } = useAuth();
  const { supportPhone, paymentMethods } = useStoreSupport();

  const [step, setStep] = useState<'details' | 'payment'>('details');
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quote, setQuote] = useState<CheckoutQuoteResponse | null>(null);
  const [order, setOrder] = useState<PayableOrder | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isInitializingPayment, setIsInitializingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId | null>(null);
  // WhatsApp: once the invoice is sent the button becomes "Mark as paid".
  const [invoiceSent, setInvoiceSent] = useState(false);
  const [isCheckingPaid, setIsCheckingPaid] = useState(false);
  const [awaitingFlash, setAwaitingFlash] = useState(false);
  const [awaitingNote, setAwaitingNote] = useState<string | null>(null);
  const router = useRouter();

  const orderNumber = order?.order_number;
  useEffect(() => {
    setInvoiceSent(orderNumber ? wasInvoiceSent(orderNumber) : false);
    setAwaitingNote(null);
  }, [orderNumber]);

  // One key per checkout attempt: a double click or a retry after a dropped response
  // returns the same order instead of creating (and reserving stock for) a second one.
  const idempotencyKeyRef = useRef<string | null>(null);
  // Only the latest quote request may update the screen.
  const quoteRequestRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    notes: '',
    selectedZoneId: undefined as number | undefined,
  });

  // Prefill from the signed-in customer and their default address (never overwrites typing).
  useEffect(() => {
    if (!user) return;
    setFormData((prev) => ({
      ...prev,
      fullName: prev.fullName || defaultAddr?.recipient_name || user.full_name || '',
      email: prev.email || user.email || '',
      phone: prev.phone || defaultAddr?.phone || user.phone || '',
      address: prev.address || defaultAddr?.street_address || '',
      city: prev.city || defaultAddr?.city || '',
      state: prev.state || (defaultAddr?.state && NIGERIAN_STATES.includes(defaultAddr.state) ? defaultAddr.state : ''),
    }));
  }, [user, defaultAddr]);

  const busy = isSubmitting || isInitializingPayment;

  const handleClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  // Default payment method once the store's methods load.
  useEffect(() => {
    if (!selectedMethod && paymentMethods.length > 0) {
      const def = paymentMethods.find((m) => m.is_default) || paymentMethods[0];
      setSelectedMethod(def.id as PaymentMethodId);
    }
  }, [paymentMethods, selectedMethod]);

  // On open: resume this cart's unpaid order if there is one, otherwise start at the details step.
  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    setPaymentError(null);

    const pending = readPendingOrder();
    if (!pending || pending.cartSignature !== cartSignature(items)) {
      setStep('details');
      setOrder(null);
      return;
    }

    const token = readGuestToken(pending.orderNumber);
    apiGetOrder(pending.orderNumber, token ? { token } : undefined)
      .then((o: any) => {
        if (o.order_status !== 'pending_payment') {
          // Paid meanwhile (e.g. a WhatsApp transfer the store confirmed): take its items out
          // of the cart instead of only forgetting the order.
          setStep('details');
          setOrder(null);
          void settlePendingOrder().then((outcome) => {
            if (outcome === 'paid') {
              router.push(`/checkout/callback?order=${encodeURIComponent(pending.orderNumber)}`);
              onClose();
            } else clearPendingOrder(pending.orderNumber);
          });
          return;
        }
        setOrder({
          order_number: o.order_number,
          guest_email: o.guest_email,
          guest_access_token: token,
          subtotal: Number(o.subtotal),
          discount_amount: Number(o.discount_amount),
          shipping_fee: Number(o.shipping_fee),
          grand_total: Number(o.grand_total),
          expires_at: o.expires_at,
          shipping_address: o.shipping_address_snapshot || {},
          items: (o.items || []).map((it: any) => ({
            name: it.item_name,
            quantity: Number(it.quantity),
            size: it.variant_options?.size,
            line_total: Number(it.line_total),
          })),
        });
        setStep('payment');
      })
      .catch(() => {
        clearPendingOrder(pending.orderNumber);
        setStep('details');
      });
    // Only when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // The Dialog handles Escape, focus trapping and scroll locking. When the step changes,
  // move focus to the first field of the new step (skipping the close button).
  useEffect(() => {
    if (!isOpen) return;
    const firstField = dialogRef.current?.querySelector<HTMLElement>('input, select, button:not([data-close])');
    firstField?.focus({ preventScroll: true });
  }, [isOpen, step, order]);

  const checkoutItems = useCallback(
    () =>
      items.map((item) => ({
        product_id: parseInt(item.productId, 10),
        variant_id: item.variantId,
        quantity: item.quantity,
      })),
    [items]
  );

  // Server quote for the chosen state: authoritative prices, discount and delivery fee.
  const fetchQuote = useCallback(async () => {
    if (items.length === 0 || !formData.state) {
      setQuote(null);
      return;
    }
    const requestId = ++quoteRequestRef.current;
    setIsQuoting(true);
    setQuoteError(null);

    try {
      const quoteData = await apiGetCheckoutQuote({
        items: checkoutItems(),
        shipping_address: { state: formData.state, country: 'Nigeria' },
        shipping_zone_id: formData.selectedZoneId,
        coupon_code: appliedPromo?.code,
      });
      if (requestId !== quoteRequestRef.current) return;
      setQuote(quoteData);
    } catch (err: any) {
      if (requestId !== quoteRequestRef.current) return;
      setQuote(null);
      setQuoteError(err?.message || 'We could not calculate delivery for this address.');
    } finally {
      if (requestId === quoteRequestRef.current) setIsQuoting(false);
    }
  }, [items.length, checkoutItems, formData.state, formData.selectedZoneId, appliedPromo?.code]);

  useEffect(() => {
    if (isOpen && step === 'details') fetchQuote();
  }, [isOpen, step, fetchQuote]);

  if (!isOpen) return null;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (items.length === 0) {
      setSubmitError('Your cart is empty.');
      return;
    }
    if (items.some((i) => typeof i.variantId !== 'number')) {
      setSubmitError('Some items need their size and colour chosen again. Please review your cart.');
      return;
    }
    if (!quote?.shipping_zone) {
      setSubmitError('Choose a delivery state we deliver to before placing your order.');
      return;
    }

    setIsSubmitting(true);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }

    try {
      const placed = await apiCreateCheckoutOrder(
        {
          email: formData.email.trim(),
          items: checkoutItems(),
          shipping_address: {
            full_name: formData.fullName.trim(),
            phone: formData.phone.trim(),
            address_line1: formData.address.trim(),
            city: formData.city.trim(),
            state: formData.state,
            country: 'Nigeria',
          },
          shipping_zone_id: quote.shipping_zone.id,
          coupon_code: appliedPromo?.code,
          notes: formData.notes.trim() || undefined,
        },
        idempotencyKeyRef.current
      );

      idempotencyKeyRef.current = null;
      saveGuestToken(placed.order_number, placed.guest_access_token);
      // The cart stays as it is until payment is verified; remember which order it belongs to.
      savePendingOrder({
        orderNumber: placed.order_number,
        cartSignature: cartSignature(items),
        expiresAt: placed.expires_at ?? null,
        createdAt: placed.created_at,
      });

      setOrder({
        order_number: placed.order_number,
        guest_email: placed.guest_email,
        guest_access_token: placed.guest_access_token,
        subtotal: placed.subtotal,
        discount_amount: placed.discount_amount,
        shipping_fee: placed.shipping_fee,
        grand_total: placed.grand_total,
        expires_at: placed.expires_at,
        shipping_address: placed.shipping_address,
        items: (placed.items || []).map((it: any) => ({
          name: it.name,
          quantity: Number(it.quantity),
          size: it.variant_options?.size,
          line_total: Number(it.line_total),
        })),
      });
      setStep('payment');
    } catch (err: any) {
      setSubmitError(err?.message || 'We could not place your order. Please review your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyGuestToken = async () => {
    if (!order?.guest_access_token) return;
    try {
      await navigator.clipboard.writeText(order.guest_access_token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
    } catch {
      // Clipboard blocked: the key is still visible to copy by hand.
    }
  };

  const whatsappInvoice = order
    ? buildWhatsAppInvoiceUrl(
        {
          order_number: order.order_number,
          grand_total: order.grand_total,
          subtotal: order.subtotal,
          shipping_fee: order.shipping_fee,
          discount_amount: order.discount_amount,
          items: order.items,
          guest_email: order.guest_email,
          shipping_address: order.shipping_address,
        },
        supportPhone
      )
    : '';

  const handlePayOrder = async () => {
    if (!order || !selectedMethod) return;
    setIsInitializingPayment(true);
    setPaymentError(null);

    const redirectUrl = `${window.location.origin}/checkout/callback?order=${encodeURIComponent(order.order_number)}`;
    // Open the WhatsApp tab synchronously (inside the click) so pop-up blockers allow it.
    const whatsappTab = selectedMethod === 'whatsapp' ? window.open('about:blank', '_blank') : null;

    try {
      // Every method starts a server-side payment attempt; for WhatsApp this keeps the stock
      // reserved longer while the customer arranges the transfer.
      const res = await apiInitializePayment(order.order_number, order.guest_access_token, redirectUrl, selectedMethod);

      if (selectedMethod === 'whatsapp') {
        if (whatsappTab) whatsappTab.location.href = whatsappInvoice;
        else window.location.href = whatsappInvoice;
        markInvoiceSent(order.order_number);
        setInvoiceSent(true);
        if (res.expires_at) {
          setOrder((prev) => (prev ? { ...prev, expires_at: res.expires_at } : prev));
        }
        setIsInitializingPayment(false);
        return;
      }

      if (!res.checkout_url) {
        throw new Error('The payment provider did not return a checkout page. Please try again or choose another payment method.');
      }
      window.location.href = res.checkout_url;
    } catch (err: any) {
      whatsappTab?.close();
      setPaymentError(err?.message || 'We could not start the payment. Please try again or choose another payment method.');
      setIsInitializingPayment(false);
    }
  };

  // The store confirms WhatsApp transfers by hand. Once it has, "Mark as paid" opens the
  // receipt (which also empties the cart); until then it says the payment is awaited.
  const handleMarkPaid = async () => {
    if (!order) return;
    setIsCheckingPaid(true);
    setPaymentError(null);
    try {
      const res = await apiVerifyPayment(order.order_number, order.guest_access_token);
      if (res.status === 'successful' || res.order_status === 'cancelled') {
        // The receipt page shows the confirmed payment (or explains an expired order).
        router.push(`/checkout/callback?order=${encodeURIComponent(order.order_number)}`);
        onClose();
        return;
      }
      // Not confirmed yet: let the store know the transfer was sent (it alerts the admin).
      const sent = await apiMarkPaymentSent(order.order_number, order.guest_access_token).catch(() => null);
      if (sent?.expires_at) setOrder((prev) => (prev ? { ...prev, expires_at: sent.expires_at } : prev));
      setAwaitingNote(
        sent?.recorded
          ? 'We have told the store you paid. Once they confirm your transfer, tap "Mark as paid" again to see your receipt.'
          : 'The store has not confirmed your transfer yet. Once they do, tap "Mark as paid" again to see your receipt.'
      );
      setAwaitingFlash(true);
      setTimeout(() => setAwaitingFlash(false), 3000);
    } catch (err: any) {
      setPaymentError(err?.message || 'We could not check the payment right now. Please try again.');
    } finally {
      setIsCheckingPaid(false);
    }
  };

  const startOver = () => {
    if (order) clearPendingOrder(order.order_number);
    setOrder(null);
    setStep('details');
  };

  const expiresLabel = order?.expires_at
    ? new Date(order.expires_at.replace(' ', 'T')).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
    : null;

  const zones = quote?.eligible_zones ?? [];
  const methodAccent: Record<PaymentMethodId, string> = {
    monnify: 'bg-[#002244] hover:bg-[#001730]',
    kora: 'bg-[#055B5C] hover:bg-[#044748]',
    whatsapp: 'bg-[#1DA851] hover:bg-[#178a43]',
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      title={step === 'details' ? 'Checkout: delivery details' : 'Checkout: complete your payment'}
      busy={busy}
      dismissOnBackdrop={!order}
      backdropClassName="bg-black/60 backdrop-blur-sm"
      panelClassName="w-full max-w-md sm:mx-0"
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-t-2xl sm:rounded-3xl p-5 sm:p-6 w-full shadow-2xl relative max-h-[92vh] overflow-y-auto"
        aria-busy={busy || undefined}
      >
        <button
          type="button"
          data-close
          onClick={handleClose}
          disabled={busy}
          className="absolute top-4 right-4 p-2 rounded-full text-neutral-600 hover:text-black hover:bg-neutral-100 disabled:opacity-50"
          aria-label="Close checkout"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} aria-hidden="true" />
        </button>

        {step === 'details' ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <HugeiconsIcon icon={DeliveryTruck01Icon} size={20} className="text-black" aria-hidden="true" />
              <p className="font-bold text-lg text-black" aria-hidden="true">Delivery details</p>
            </div>

            {submitError && (
              <div role="alert" className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm text-red-800">
                <HugeiconsIcon icon={AlertCircleIcon} size={16} className="shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitOrder} className="space-y-3" noValidate={false} aria-describedby="co-required-note">
              <p id="co-required-note" className="text-xs text-neutral-600">
                All fields are required unless marked optional.
              </p>
              <div>
                <label htmlFor="co-name" className={labelClass}>Full name</label>
                <input id="co-name" type="text" required autoComplete="name" value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} className={fieldClass} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="co-phone" className={labelClass}>Phone number</label>
                  <input id="co-phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="080..." value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="co-email" className={labelClass}>Email</label>
                  <input id="co-email" type="email" required autoComplete="email" value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={fieldClass} />
                </div>
              </div>

              <div>
                <label htmlFor="co-address" className={labelClass}>Street address</label>
                <input id="co-address" type="text" required autoComplete="street-address" placeholder="House number, street, area"
                  value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={fieldClass} />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="co-state" className={labelClass}>State</label>
                  <select
                    id="co-state"
                    required
                    aria-describedby="co-delivery-status"
                    value={formData.state}
                    onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value, selectedZoneId: undefined }))}
                    className={`${fieldClass} cursor-pointer`}
                  >
                    <option value="" disabled>Select state</option>
                    {NIGERIAN_STATES.map((st) => (
                      <option key={st} value={st}>{st === 'FCT' ? 'Abuja (FCT)' : st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="co-city" className={labelClass}>City / town</label>
                  <input id="co-city" type="text" required autoComplete="address-level2" value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })} className={fieldClass} />
                </div>
              </div>

              <div>
                <label htmlFor="co-notes" className={labelClass}>Delivery note (optional)</label>
                <input id="co-notes" type="text" maxLength={300} placeholder="e.g. landmark, gate instructions" value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className={fieldClass} />
              </div>

              {/* Delivery zone & fee from the server */}
              <div id="co-delivery-status" aria-live="polite">
                {!formData.state ? (
                  <p className="text-xs text-neutral-600">Choose your state to see the delivery fee.</p>
                ) : isQuoting && !quote ? (
                  <p className="text-xs text-neutral-600">Calculating delivery…</p>
                ) : quoteError ? (
                  <div role="alert" className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
                    {quoteError}
                  </div>
                ) : zones.length > 1 ? (
                  <fieldset className="space-y-1.5">
                    <legend className={labelClass}>Delivery option</legend>
                    {zones.map((z) => (
                      <label key={z.id} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm cursor-pointer has-[:checked]:border-black">
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="zone"
                            className="accent-black"
                            checked={(formData.selectedZoneId ?? quote?.shipping_zone?.id) === z.id}
                            onChange={() => setFormData((prev) => ({ ...prev, selectedZoneId: z.id }))}
                          />
                          <span>{z.name} <span className="text-neutral-600">· {z.estimated_days}</span></span>
                        </span>
                        <span className="font-semibold">{formatPrice(z.fee)}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : quote?.shipping_zone ? (
                  <p className="text-xs text-neutral-700">
                    Delivery to {formData.state === 'FCT' ? 'Abuja (FCT)' : formData.state}: <strong>{quote.shipping_zone.name}</strong> · {quote.shipping_zone.estimated_days}
                  </p>
                ) : null}
              </div>

              {quote?.applied_coupon && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-sm text-emerald-900 font-medium">
                  <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Ticket02Icon} size={14} className="text-emerald-700" aria-hidden="true" />
                    <span>Coupon <strong>{quote.applied_coupon.code}</strong></span>
                  </div>
                  <span className="font-bold">-{quote.applied_coupon.discount_percent}%</span>
                </div>
              )}

              <div className="pt-2.5 border-t border-neutral-100 space-y-1.5 text-sm text-neutral-700">
                <div className="flex justify-between">
                  <span>Subtotal ({quote?.total_quantity ?? items.reduce((n, i) => n + i.quantity, 0)} items)</span>
                  <span className="font-semibold text-black">
                    {formatPrice(quote ? quote.subtotal : items.reduce((acc, i) => acc + i.price * i.quantity, 0))}
                  </span>
                </div>
                {Boolean(quote?.discount_amount) && (
                  <div className="flex justify-between text-red-700">
                    <span>Discount</span>
                    <span className="font-semibold">-{formatPrice(quote?.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span className="font-semibold text-black">
                    {quote?.shipping_zone ? formatPrice(quote.shipping_fee) : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-neutral-200">
                  <span className="font-bold text-black">Total</span>
                  <span className="font-black text-lg sm:text-xl text-black">
                    {quote?.shipping_zone ? formatPrice(quote.grand_total) : '—'}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isQuoting || !quote?.shipping_zone}
                  aria-describedby={!quote?.shipping_zone ? 'co-delivery-status' : undefined}
                  className="w-full bg-black text-white hover:bg-neutral-800 disabled:opacity-50 font-bold py-3.5 rounded-full text-sm transition-all shadow-md mt-2 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <span>Placing order…</span>
                  ) : (
                    <>
                      <span>Continue to payment</span>
                      <HugeiconsIcon icon={ArrowRight01Icon} size={15} aria-hidden="true" />
                    </>
                  )}
                </button>
                <p className="text-xs text-neutral-600 text-center">
                  Your items are reserved for 60 minutes while you pay.
                </p>
              </div>
            </form>
          </div>
        ) : order ? (
          <div className="space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto border border-emerald-200" aria-hidden="true">
                <HugeiconsIcon icon={CheckmarkBadge01Icon} size={28} />
              </div>
              <p className="font-extrabold text-xl text-black mt-2" aria-hidden="true">Complete your payment</p>
              <p className="text-sm text-neutral-700 mt-0.5">
                Order <strong className="font-mono">{order.order_number}</strong> is reserved
                {expiresLabel ? <> until <strong>{expiresLabel}</strong></> : null}.
              </p>
            </div>

            <div className="bg-[#FAFAFA] rounded-2xl p-4 text-sm space-y-3">
              <ul className="divide-y divide-neutral-100 max-h-36 overflow-y-auto">
                {order.items.map((item, idx) => (
                  <li key={`${item.name}-${idx}`} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-black truncate">{item.name}</p>
                      <p className="text-xs text-neutral-600">
                        Qty {item.quantity}{item.size ? ` · ${item.size}` : ''}
                      </p>
                    </div>
                    <span className="font-medium text-black shrink-0">
                      {formatPrice(item.line_total ?? (item.price ?? 0) * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="pt-2 border-t border-neutral-200 space-y-1 text-neutral-700">
                <div className="flex justify-between"><span>Subtotal</span><span className="text-black">{formatPrice(order.subtotal)}</span></div>
                {order.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-800"><span>Discount</span><span>-{formatPrice(order.discount_amount)}</span></div>
                )}
                <div className="flex justify-between"><span>Delivery</span><span className="text-black">{formatPrice(order.shipping_fee)}</span></div>
                <div className="flex justify-between pt-1 border-t border-neutral-200 font-bold text-black">
                  <span>Amount due</span><span>{formatPrice(order.grand_total)}</span>
                </div>
              </div>
            </div>

            {order.guest_access_token && !user && (
              <div className="rounded-2xl border border-neutral-200 p-3 text-xs text-neutral-700 space-y-1.5">
                <p>
                  <strong className="text-black">Your order access key.</strong> It is saved on this device. Keep a copy to track
                  this order elsewhere, or use your order number and email.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg bg-neutral-100 px-2 py-1 font-mono text-xs">{order.guest_access_token}</code>
                  <button
                    type="button"
                    onClick={handleCopyGuestToken}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-2.5 py-1 text-white"
                    aria-label="Copy order access key"
                  >
                    <HugeiconsIcon icon={copiedToken ? Tick02Icon : Copy01Icon} size={12} aria-hidden="true" />
                    <span aria-live="polite">{copiedToken ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1">Payment method</legend>
              {paymentMethods.length === 0 && (
                <p className="text-sm text-neutral-600" role="status">Loading payment methods…</p>
              )}
              {paymentMethods.map((m) => (
                <label
                  key={m.id}
                  className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-3 cursor-pointer has-[:checked]:border-black has-[:checked]:bg-neutral-50"
                >
                  <input
                    type="radio"
                    name="payment-method"
                    value={m.id}
                    className="mt-1 accent-black"
                    aria-describedby={`pm-desc-${m.id}`}
                    checked={selectedMethod === m.id}
                    onChange={() => setSelectedMethod(m.id as PaymentMethodId)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-black">{m.name}</span>
                    <span id={`pm-desc-${m.id}`} className="block text-xs text-neutral-600">{m.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {paymentError && (
              <div role="alert" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                {paymentError}
              </div>
            )}

            {selectedMethod === 'whatsapp' && invoiceSent ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleMarkPaid}
                  disabled={isCheckingPaid || isInitializingPayment}
                  className={`w-full text-white font-bold py-3.5 rounded-full text-sm transition-colors shadow-md disabled:opacity-60 ${
                    awaitingFlash ? 'bg-amber-600' : methodAccent.whatsapp
                  }`}
                >
                  {isCheckingPaid ? 'Checking…' : awaitingFlash ? 'Awaiting confirmation' : 'Mark as paid'}
                </button>
                <p className="text-xs text-neutral-700 text-center" role="status" aria-live="polite">
                  {awaitingNote ?? 'Sent the transfer? Tap "Mark as paid". Your receipt opens once the store confirms it.'}
                </p>
                <button
                  type="button"
                  onClick={handlePayOrder}
                  disabled={busy || isCheckingPaid}
                  className="w-full text-xs text-neutral-700 underline hover:no-underline disabled:opacity-50"
                >
                  {isInitializingPayment ? 'Opening WhatsApp…' : 'Send the invoice again'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePayOrder}
                disabled={isInitializingPayment || !selectedMethod}
                className={`w-full text-white font-bold py-3.5 rounded-full text-sm transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                  selectedMethod ? methodAccent[selectedMethod] : 'bg-black'
                }`}
              >
                {isInitializingPayment ? (
                  <span>Opening secure payment…</span>
                ) : selectedMethod === 'whatsapp' ? (
                  <span>Send invoice on WhatsApp ({formatPrice(order.grand_total)})</span>
                ) : (
                  <>
                    <span>Pay {formatPrice(order.grand_total)}</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} size={15} aria-hidden="true" />
                  </>
                )}
              </button>
            )}

            <div className="flex items-center justify-between gap-2 text-xs">
              <button type="button" onClick={startOver} disabled={busy} className="text-neutral-700 underline hover:no-underline disabled:opacity-50">
                Change delivery details
              </button>
              <button type="button" onClick={handleClose} disabled={busy} className="text-neutral-700 underline hover:no-underline disabled:opacity-50">
                Pay later
              </button>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-neutral-600" role="status">Loading your order…</div>
        )}
      </div>
    </Dialog>
  );
};
