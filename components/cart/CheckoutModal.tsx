'use client';

import React, { useState } from 'react';
import { useCart } from '@/context/CartContext';
import confetti from 'canvas-confetti';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, CheckmarkCircle01Icon } from '@hugeicons/core-free-icons';
import Link from 'next/link';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose }) => {
  const { total, clearCart } = useCart();
  const [step, setStep] = useState<'details' | 'success'>('details');

  const [formData, setFormData] = useState({
    fullName: 'Alex Johnson',
    email: 'alex.johnson@example.com',
    address: '742 Evergreen Terrace',
    city: 'Springfield',
    country: 'United States',
    cardNumber: '4242 •••• •••• 4242',
  });

  if (!isOpen) return null;

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('success');
    clearCart();

    // Trigger celebratory confetti burst
    try {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.log('Confetti triggered', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full z-10 shadow-2xl relative animate-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full text-neutral-400 hover:text-black hover:bg-neutral-100"
          aria-label="Close checkout"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={20} />
        </button>

        {step === 'details' ? (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-neutral-100 rounded-2xl text-black">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-xl text-black">Express Checkout</h3>
                <p className="text-xs text-neutral-500">Fast & Secure 256-Bit SSL Payment</p>
              </div>
            </div>

            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Shipping Address
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <input
                      type="text"
                      required
                      placeholder="Full Name"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full bg-[#F0F0F0] rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="email"
                      required
                      placeholder="Email Address"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-[#F0F0F0] rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      required
                      placeholder="Street Address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full bg-[#F0F0F0] rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="City"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full bg-[#F0F0F0] rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full bg-[#F0F0F0] rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Payment Method
                </h4>
                <div className="bg-[#F0F0F0] rounded-xl p-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs bg-white px-2 py-1 rounded border border-neutral-300">
                      VISA
                    </span>
                    <span className="text-black font-medium">{formData.cardNumber}</span>
                  </div>
                  <span className="text-xs text-neutral-500 font-medium">12/28</span>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-neutral-700">Total Charged:</span>
                  <span className="font-bold text-xl text-black">${total}</span>
                </div>

                <button
                  type="submit"
                  className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-4 rounded-full text-sm transition-colors shadow-lg"
                >
                  Pay & Complete Order (${total})
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={36} className="fill-current" />
            </div>

            <h3 className="font-bold text-2xl text-black">Order Placed Successfully!</h3>

            <p className="text-sm text-neutral-600 max-w-sm mx-auto">
              Thank you for shopping at SHOP.CO. We&apos;ve sent a confirmation email to{' '}
              <strong>{formData.email}</strong> with your tracking number.
            </p>

            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-xs text-neutral-500 text-left max-w-sm mx-auto">
              <p><strong>Order ID:</strong> #{Math.floor(100000 + Math.random() * 900000)}</p>
              <p><strong>Delivery to:</strong> {formData.address}, {formData.city}</p>
              <p><strong>Estimated Arrival:</strong> 2-4 business days</p>
            </div>

            <div className="pt-4">
              <Link
                href="/category"
                onClick={onClose}
                className="inline-block bg-black text-white hover:bg-neutral-800 font-semibold px-8 py-3.5 rounded-full text-sm transition-colors"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
