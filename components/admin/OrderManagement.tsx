'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  apiAdminGetOrders,
  apiAdminGetOrder,
  apiAdminConfirmPayment,
  apiAdminUpdateOrderStatus,
  apiAdminAssignShipment,
  apiAdminConfirmDelivery,
  apiLogin,
} from '@/lib/api-client';
import { formatPrice } from '@/lib/currency';
import {
  Package,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Truck,
  RefreshCw,
  ExternalLink,
  X,
  CreditCard,
  MessageCircle,
  MapPin,
  Lock,
  LogIn,
  Key,
  Eye,
} from 'lucide-react';

interface ToastMessage {
  type: 'success' | 'error';
  message: string;
}

export function OrderManagement() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Authentication State
  const [authError, setAuthError] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Modals
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [viewDetailModal, setViewDetailModal] = useState(false);
  const [confirmPaymentModal, setConfirmPaymentModal] = useState(false);
  const [shipModal, setShipModal] = useState(false);

  // Action Form States
  const [payReference, setPayReference] = useState('');
  const [payNote, setPayNote] = useState('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  const [carrier, setCarrier] = useState('GIG Logistics');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [isSubmittingShip, setIsSubmittingShip] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetOrders({
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        search: searchQuery.trim() || undefined,
        page,
        per_page: 15,
      });
      const itemsList = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : (res as any)?.data || [];
      setOrders(itemsList);
      setTotalPages(res.meta?.total_pages || 1);
      setTotalCount(res.meta?.total || itemsList.length);
      setAuthError(false);
    } catch (err: any) {
      if (err.message?.includes('Unauthorized') || err.message?.includes('401') || err.message?.includes('403')) {
        setAuthError(true);
      } else {
        showToast('error', err.message || 'Failed to fetch orders.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, searchQuery, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await apiLogin({ email: adminEmail, password: adminPassword });
      setAuthError(false);
      showToast('success', 'Admin session authenticated successfully.');
      loadOrders();
    } catch (err: any) {
      showToast('error', err.message || 'Login failed. Check your admin credentials.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleOpenConfirmPayment = (order: any) => {
    setSelectedOrder(order);
    setPayReference(`TRF-${order.order_number}`);
    setPayNote(`Manual WhatsApp bank transfer verified by admin.`);
    setConfirmPaymentModal(true);
  };

  const handleExecuteConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setIsSubmittingPay(true);
    try {
      await apiAdminConfirmPayment(selectedOrder.order_number, {
        reference: payReference.trim() || undefined,
        note: payNote.trim() || undefined,
      });
      showToast('success', `Payment for ${selectedOrder.order_number} confirmed and marked PAID.`);
      setConfirmPaymentModal(false);
      loadOrders();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to confirm payment.');
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const handleOpenShipModal = (order: any) => {
    setSelectedOrder(order);
    setCarrier(order.carrier || 'GIG Logistics');
    setTrackingNumber(order.tracking_number || `GIG-TRK-${Math.floor(100000 + Math.random() * 900000)}`);
    setTrackingUrl(order.tracking_url || `https://giglogistics.com/track?ref=GIG-TRK`);
    setShipModal(true);
  };

  const handleExecuteShip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setIsSubmittingShip(true);
    try {
      await apiAdminAssignShipment(selectedOrder.order_number, {
        carrier: carrier.trim(),
        tracking_number: trackingNumber.trim() || undefined,
        tracking_url: trackingUrl.trim() || undefined,
        status: 'shipped',
      });
      showToast('success', `Shipment assigned & ${selectedOrder.order_number} marked as SHIPPED.`);
      setShipModal(false);
      loadOrders();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to assign shipment.');
    } finally {
      setIsSubmittingShip(false);
    }
  };

  const handleConfirmDelivered = async (order: any) => {
    if (!confirm(`Confirm delivery for parcel ${order.order_number}?`)) return;
    try {
      await apiAdminConfirmDelivery(order.order_number, 'Delivery confirmed by customer signature.');
      showToast('success', `Order ${order.order_number} marked as DELIVERED.`);
      loadOrders();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to confirm delivery.');
    }
  };

  const handleViewDetail = async (order: any) => {
    try {
      const snap = await apiAdminGetOrder(order.order_number);
      setSelectedOrder(snap);
      setViewDetailModal(true);
    } catch (err: any) {
      showToast('error', err.message || 'Could not load order detail.');
    }
  };

  if (authError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-neutral-200 max-w-md mx-auto my-12 text-center shadow-sm">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-black mb-1">Admin Session Required</h2>
        <p className="text-xs text-neutral-500 mb-6">
          Authorize as an administrator to manage orders, confirm WhatsApp payments, and update shipments.
        </p>
        <form onSubmit={handleAdminLogin} className="w-full space-y-3 text-left">
          <div>
            <label className="text-xs font-semibold text-neutral-700 block mb-1">Admin Email</label>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-700 block mb-1">Admin Password</label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full bg-black text-white hover:bg-neutral-800 font-semibold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 mt-2"
          >
            {isLoggingIn ? (
              <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Authenticate Admin</span>
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold text-white animate-fade ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-neutral-900">Orders & WhatsApp Payment Settlement</h1>
            <span className="text-xs font-mono bg-neutral-100 text-neutral-700 px-2.5 py-0.5 rounded-md font-semibold">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage parcel fulfillment queues, track shipments, and settle manual WhatsApp payments.
          </p>
        </div>

        <button
          onClick={() => loadOrders()}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-200/90 rounded-lg text-xs font-medium text-neutral-700 hover:bg-neutral-50 shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-neutral-200/80 shadow-xs">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'pending_payment', label: 'Awaiting Payment' },
            { id: 'paid', label: 'Paid' },
            { id: 'processing', label: 'Processing' },
            { id: 'shipped', label: 'Shipped' },
            { id: 'delivered', label: 'Delivered' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedStatus(tab.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedStatus === tab.id
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Order # or Email..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full text-xs pl-8 pr-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-neutral-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 text-neutral-500 font-semibold border-b border-neutral-200 uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Order Number</th>
                <th className="py-3 px-4">Customer & Location</th>
                <th className="py-3 px-4">Items / Total</th>
                <th className="py-3 px-4">Payment Status</th>
                <th className="py-3 px-4">Fulfillment Stage</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400">
                    <span className="w-6 h-6 border-2 border-neutral-300 border-t-black rounded-full animate-spin inline-block mr-2" />
                    <span>Loading orders...</span>
                  </td>
                </tr>
              ) : !Array.isArray(orders) || orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400">
                    No orders found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                (Array.isArray(orders) ? orders : []).map((ord) => {
                  const isPaid = ord.order_status === 'paid' || ord.payment_status === 'successful';
                  const isPending = ord.order_status === 'pending_payment';
                  const isShipped = ord.order_status === 'shipped';
                  const isDelivered = ord.order_status === 'delivered';

                  return (
                    <tr key={ord.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-neutral-900">
                        <div>{ord.order_number}</div>
                        <div className="text-[10px] text-neutral-400 font-sans font-normal mt-0.5">
                          {new Date(ord.created_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-neutral-700">
                        <div className="font-semibold text-black">
                          {ord.shipping_address_snapshot?.full_name || 'Customer'}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate max-w-[200px]">
                          {ord.guest_email || ord.shipping_address_snapshot?.phone || 'No contact'}
                        </div>
                        <div className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-2.5 h-2.5" />
                          <span>
                            {ord.shipping_address_snapshot?.city || 'Enugu'}, {ord.shipping_address_snapshot?.state || 'Enugu'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-black font-mono">{formatPrice(ord.grand_total)}</div>
                        <div className="text-[11px] text-neutral-400">
                          {ord.items_count} item{ord.items_count !== 1 ? 's' : ''} ({ord.total_quantity} qty)
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {isPaid ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 w-fit"
                              title={ord.payment_provider ? `Paid via ${ord.payment_provider}` : 'Payment verified'}
                            >
                              <span className="size-1.5 rounded-full bg-emerald-600 shrink-0" />
                              <span>Paid</span>
                            </span>
                            {ord.payment_provider && (
                              <span className="text-[10px] text-neutral-400 capitalize pl-0.5 font-mono">
                                {ord.payment_provider}
                              </span>
                            )}
                          </div>
                        ) : ord.order_status === 'cancelled' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200/60 w-fit">
                            <span className="size-1.5 rounded-full bg-neutral-400 shrink-0" />
                            <span>Cancelled</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60 w-fit">
                            <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span>Pending</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border w-fit ${
                              isDelivered
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                                : isShipped
                                ? 'bg-blue-50 text-blue-700 border-blue-200/60'
                                : isPaid
                                ? 'bg-purple-50 text-purple-700 border-purple-200/60'
                                : 'bg-neutral-50 text-neutral-600 border-neutral-200/60'
                            }`}
                          >
                            <span
                              className={`size-1.5 rounded-full shrink-0 ${
                                isDelivered
                                  ? 'bg-emerald-600'
                                  : isShipped
                                  ? 'bg-blue-600'
                                  : isPaid
                                  ? 'bg-purple-600'
                                  : 'bg-neutral-400'
                              }`}
                            />
                            <span className="capitalize">{ord.order_status.replace(/_/g, ' ')}</span>
                          </span>
                          {ord.carrier && ord.tracking_number && (
                            <div
                              className="text-[10px] text-neutral-400 pl-0.5 font-mono truncate max-w-[130px]"
                              title={`${ord.carrier}: ${ord.tracking_number}`}
                            >
                              {ord.carrier}: {ord.tracking_number}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {/* WhatsApp / Bank Settlement Action Button */}
                          {isPending && (
                            <button
                              onClick={() => handleOpenConfirmPayment(ord)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-lg text-xs font-medium transition-all shadow-xs"
                              title="Confirm WhatsApp / direct bank payment"
                            >
                              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>Settle</span>
                            </button>
                          )}

                          {/* Ship Action */}
                          {(isPaid || ord.order_status === 'processing') && (
                            <button
                              onClick={() => handleOpenShipModal(ord)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-medium transition-all shadow-xs"
                              title="Assign carrier and dispatch order"
                            >
                              <Truck className="w-3.5 h-3.5 shrink-0" />
                              <span>Ship</span>
                            </button>
                          )}

                          {/* Deliver Action */}
                          {isShipped && (
                            <button
                              onClick={() => handleConfirmDelivered(ord)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-all shadow-xs"
                              title="Confirm order delivery"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Deliver</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleViewDetail(ord)}
                            className="inline-flex items-center justify-center size-7 rounded-lg border border-neutral-200/80 bg-white hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900 transition-colors shadow-xs"
                            title="View order details"
                            aria-label="View order details"
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-neutral-100 text-xs text-neutral-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg border border-neutral-200 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded-lg border border-neutral-200 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Settle WhatsApp / Manual Payment */}
      {confirmPaymentModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-neutral-200 shadow-2xl space-y-4 animate-scale">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-[#25D366]" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-black">Confirm WhatsApp Payment</h3>
                  <p className="text-xs text-neutral-500">Order #{selectedOrder.order_number}</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmPaymentModal(false)}
                className="p-1 rounded-full text-neutral-400 hover:text-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-500">Customer:</span>
                <span className="font-semibold text-black">
                  {selectedOrder.shipping_address_snapshot?.full_name || selectedOrder.guest_email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Amount Due:</span>
                <span className="font-mono font-bold text-black text-sm">{formatPrice(selectedOrder.grand_total)}</span>
              </div>
            </div>

            <form onSubmit={handleExecuteConfirmPayment} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1">
                  Bank Reference / Transfer ID
                </label>
                <input
                  type="text"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  placeholder="e.g. GTB-TRF-294829 or WA-CHAT"
                  className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1">
                  Admin Settlement Note (Recorded in Audit Trail)
                </label>
                <textarea
                  rows={2}
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="e.g. Customer sent receipt screenshot via WhatsApp; confirmed credited."
                  className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmPaymentModal(false)}
                  className="w-1/3 py-2.5 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPay}
                  className="w-2/3 py-2.5 rounded-xl bg-black hover:bg-neutral-800 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  {isSubmittingPay ? (
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Mark Paid</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Assign Shipment & Tracking */}
      {shipModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-neutral-200 shadow-2xl space-y-4 animate-scale">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-black">Assign Carrier & Tracking</h3>
                  <p className="text-xs text-neutral-500">Order #{selectedOrder.order_number}</p>
                </div>
              </div>
              <button
                onClick={() => setShipModal(false)}
                className="p-1 rounded-full text-neutral-400 hover:text-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteShip} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1">Carrier Name</label>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black bg-white"
                >
                  <option value="GIG Logistics">GIG Logistics</option>
                  <option value="DHL Express">DHL Express</option>
                  <option value="FedEx Nigeria">FedEx Nigeria</option>
                  <option value="Speedaf Express">Speedaf Express</option>
                  <option value="Kwik Delivery">Kwik Delivery</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1">Tracking Number</label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. GIG-18294829"
                  className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1">Live Tracking URL</label>
                <input
                  type="url"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://track.giglogistics.com/..."
                  className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black text-[11px]"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShipModal(false)}
                  className="w-1/3 py-2.5 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShip}
                  className="w-2/3 py-2.5 rounded-xl bg-black hover:bg-neutral-800 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  {isSubmittingShip ? (
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Truck className="w-4 h-4" />
                      <span>Ship Parcel</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Order Detail Snapshot */}
      {viewDetailModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full border border-neutral-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto animate-scale">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <div>
                <h3 className="font-bold text-base text-black">Order #{selectedOrder.order_number}</h3>
                <span className="text-[11px] text-neutral-400 capitalize">
                  Status: <strong className="text-black">{selectedOrder.order_status}</strong> · Payment:{' '}
                  <strong className="text-black">{selectedOrder.payment_status}</strong>
                </span>
              </div>
              <button
                onClick={() => setViewDetailModal(false)}
                className="p-1 rounded-full text-neutral-400 hover:text-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items Snapshot */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Ordered Products</h4>
              <div className="divide-y divide-neutral-100 bg-neutral-50 p-3 rounded-2xl">
                {selectedOrder.items?.map((item: any, i: number) => (
                  <div key={i} className="py-2 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-semibold text-black">{item.item_name}</p>
                      <p className="text-[10px] text-neutral-400">
                        Qty: {item.quantity} · SKU: {item.sku}
                      </p>
                    </div>
                    <span className="font-mono font-medium text-black">{formatPrice(item.line_total)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="bg-neutral-50 p-3 rounded-2xl text-xs space-y-1.5 text-neutral-600">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="text-black font-medium">{formatPrice(selectedOrder.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery ({selectedOrder.shipping_zone_snapshot?.name || 'Local'}):</span>
                <span className="text-black font-medium">{formatPrice(selectedOrder.shipping_fee)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-black pt-1.5 border-t border-neutral-200">
                <span>Grand Total:</span>
                <span className="font-mono">{formatPrice(selectedOrder.grand_total)}</span>
              </div>
            </div>

            {/* Status History & Audit Logs */}
            {selectedOrder.status_history && (
              <div className="space-y-1.5 pt-1">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Status History</h4>
                <div className="divide-y divide-neutral-100 text-[11px] max-h-36 overflow-y-auto">
                  {selectedOrder.status_history.map((hist: any, i: number) => (
                    <div key={i} className="py-1.5 flex justify-between gap-2">
                      <span className="font-semibold text-black capitalize">{hist.new_status}</span>
                      <span className="text-neutral-500 text-right truncate">{hist.comment}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setViewDetailModal(false)}
                className="w-full py-2.5 rounded-xl bg-black text-white text-xs font-semibold"
              >
                Close Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
