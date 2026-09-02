'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle01Icon, ShoppingBag01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';

export const Toast: React.FC = () => {
  const { toast, hideToast, totalQuantity } = useCart();

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-black text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 border border-neutral-800">
        <div className="p-2 bg-neutral-800 rounded-full text-green-400 shrink-0">
          <HugeiconsIcon icon={CheckmarkCircle01Icon} size={20} className="fill-current" />
        </div>

        {toast.image && (
          <div className="relative w-12 h-12 bg-neutral-900 rounded-lg overflow-hidden shrink-0">
            <Image
              src={toast.image}
              alt={toast.title}
              fill
              className="object-cover"
              sizes="48px"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white">{toast.title}</h4>
          <p className="text-xs text-neutral-300 line-clamp-2 mt-0.5">{toast.message}</p>
          <div className="mt-2 flex items-center gap-3">
            <Link
              href="/cart"
              onClick={hideToast}
              className="text-xs font-semibold underline hover:text-neutral-200 flex items-center gap-1"
            >
              <HugeiconsIcon icon={ShoppingBag01Icon} size={14} />
              <span>View Cart ({totalQuantity})</span>
            </Link>
          </div>
        </div>

        <button
          onClick={hideToast}
          className="text-neutral-400 hover:text-white p-1 rounded-lg transition-colors"
          aria-label="Close notification"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </button>
      </div>
    </div>
  );
};
