'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { apiGetCustomerOrders } from '@/lib/api-client';
import { formatPrice } from '@/lib/currency';
import {
  Package,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  ArrowLeft,
  Search,
} from 'lucide-react';

export default function CustomerOrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    apiGetCustomerOrders()
      .then((data) => {
        setOrders(data || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load order history.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [user, authLoading]);

  return (
    <div className="min-h-screen bg-[#FBFBFB] py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-500 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Storefront</span>
          </Link>

          <Link
            href="/track-order"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-black hover:underline"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Track Guest Order</span>
          </Link>
        </div>

        {/* Header */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-neutral-100 rounded-full text-xs font-semibold text-neutral-800 mb-2">
                <Package className="w-3.5 h-3.5" />
                <span>Customer Portal</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-black">My Order History</h1>
              <p className="text-xs sm:text-sm text-neutral-500 mt-1">
                {user ? `Signed in as ${user.email}` : 'Track and manage your store orders.'}
              </p>
            </div>

            <Link
              href="/track-order"
              className="bg-black text-white hover:bg-neutral-800 font-semibold px-5 py-2.5 rounded-full text-xs transition-colors shrink-0 flex items-center justify-center gap-2"
            >
              <span>Instant Order Lookup</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Content Section */}
        {isLoading || authLoading ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-neutral-100 shadow-sm space-y-3">
            <div className="w-10 h-10 border-3 border-black/10 border-t-black rounded-full animate-spin mx-auto" />
            <p className="text-xs text-neutral-500 font-medium">Loading your orders...</p>
          </div>
        ) : !user ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-neutral-100 shadow-sm space-y-4">
            <div className="w-16 h-16 bg-neutral-100 text-neutral-700 rounded-full flex items-center justify-center mx-auto">
              <Package className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-black">Guest or Signed Out</h2>
              <p className="text-xs sm:text-sm text-neutral-500 max-w-md mx-auto mt-1">
                If you placed an order as a guest, use your order number and email or access key to track it.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/track-order"
                className="bg-black text-white hover:bg-neutral-800 font-semibold px-6 py-3 rounded-full text-xs transition-colors"
              >
                Track Guest Order
              </Link>
            </div>
          </div>
        ) : error ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-red-100 shadow-sm space-y-3">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-sm font-semibold text-red-800">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-black text-xs font-semibold rounded-full transition-colors"
            >
              Retry
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-neutral-100 shadow-sm space-y-4">
            <div className="w-14 h-14 bg-neutral-100 text-neutral-400 rounded-full flex items-center justify-center mx-auto">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-black">No Orders Yet</h2>
              <p className="text-xs text-neutral-500 mt-1">
                You haven&apos;t placed any orders with this account yet.
              </p>
            </div>
            <Link
              href="/"
              className="inline-block bg-black text-white hover:bg-neutral-800 font-semibold px-6 py-2.5 rounded-full text-xs transition-colors"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((ord) => {
              const isPaid = ord.payment_status === 'successful' || ord.order_status === 'paid';
              return (
                <div
                  key={ord.id || ord.order_number}
                  className="bg-white rounded-3xl p-5 sm:p-6 border border-neutral-100 shadow-sm hover:border-neutral-200 transition-all space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-black">
                          {ord.order_number}
                        </span>
                        {ord.order_status === 'delivered' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Delivered</span>
                          </span>
                        ) : ord.order_status === 'shipped' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            <Truck className="w-3 h-3 text-blue-600" />
                            <span>In Transit</span>
                          </span>
                        ) : isPaid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Paid</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending Payment</span>
                          </span>
                        )}
                        {ord.shipment && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                            <Truck className="w-3 h-3 text-neutral-500" />
                            <span>{ord.shipment.carrier}: {ord.shipment.tracking_number}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        Placed on {new Date(ord.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-neutral-400">Total Amount</p>
                      <p className="font-extrabold text-base text-black font-mono">
                        {formatPrice(ord.grand_total)}
                      </p>
                    </div>
                  </div>

                  {/* Items summary */}
                  {ord.items && ord.items.length > 0 && (
                    <div className="divide-y divide-neutral-50 text-xs">
                      {ord.items.map((it: any, idx: number) => (
                        <div key={idx} className="py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 pr-2">
                            <p className="font-medium text-black truncate">{it.item_name || it.name}</p>
                            <p className="text-[11px] text-neutral-400">
                              Qty: {it.quantity}
                              {it.variant_options?.size ? ` · Size: ${it.variant_options.size}` : ''}
                            </p>
                          </div>
                          <span className="font-mono text-neutral-700 shrink-0">
                            {formatPrice(it.line_total || it.unit_price * it.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-100">
                    <span className="text-[11px] text-neutral-500">
                      Deliver to: <strong className="text-black font-medium">{ord.shipping_address_snapshot?.city}, {ord.shipping_address_snapshot?.state}</strong>
                    </span>

                    <Link
                      href={`/track-order?order=${encodeURIComponent(ord.order_number)}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-black hover:underline"
                    >
                      <Truck className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Track & View Invoice</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
