'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, RefreshIcon, Home01Icon } from '@hugeicons/core-free-icons';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Unhandled Storefront Exception:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-3xl border border-neutral-200 p-8 text-center shadow-lg animate-in fade-in duration-300">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <HugeiconsIcon icon={Alert02Icon} size={32} />
        </div>
        
        <h2 className="font-integral text-2xl text-black mb-2">SOMETHING WENT WRONG</h2>
        
        <p className="text-neutral-600 text-sm mb-6 leading-relaxed">
          An unexpected error occurred while loading this view. You can retry the action or return to the storefront homepage.
        </p>

        {error?.message && (
          <div className="bg-neutral-50 rounded-xl p-3 mb-6 text-left border border-neutral-100">
            <span className="text-[11px] font-mono text-neutral-500 block truncate">
              {error.message}
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-black hover:bg-neutral-800 text-white font-semibold text-sm px-6 py-3 rounded-full transition-all shadow-md"
          >
            <HugeiconsIcon icon={RefreshIcon} size={16} />
            <span>Try Again</span>
          </button>
          
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-neutral-300 hover:bg-neutral-50 text-black font-semibold text-sm px-6 py-3 rounded-full transition-all"
          >
            <HugeiconsIcon icon={Home01Icon} size={16} />
            <span>Storefront Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
