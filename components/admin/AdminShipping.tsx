'use client';

import React, { useState, useEffect } from 'react';
import {
  apiAdminGetOrders,
  apiAdminAssignShipment,
  apiAdminConfirmDelivery,
} from '@/lib/api-client';
import { AdminIcon } from './AdminIcon';
import { RefreshCw, ExternalLink, X } from 'lucide-react';

export const AdminShipping: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Carrier assignment modal state
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [carrier, setCarrier] = useState('GIG Logistics');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchShipments = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetOrders({
        status: statusFilter,
        search,
      });
      const list = Array.isArray(res) ? res : res?.items || (res as any)?.data || [];
      setOrders(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, [statusFilter, search]);

  const handleOpenAssign = (ord: any) => {
    setSelectedOrder(ord);
    // Real carrier details only: the admin enters what the courier issued.
    setCarrier(ord.carrier || '');
    setTrackingNumber(ord.tracking_number || '');
    setTrackingUrl(ord.tracking_url || '');
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !carrier.trim()) return;

    setSubmitting(true);
    try {
      await apiAdminAssignShipment(selectedOrder.order_number, {
        carrier: carrier.trim(),
        tracking_number: trackingNumber.trim() || undefined,
        tracking_url: trackingUrl.trim() || undefined,
        status: 'in_transit',
      });
      setFeedback(`Carrier ${carrier} and tracking assigned to ${selectedOrder.order_number}. Order marked as Shipped.`);
      setSelectedOrder(null);
      fetchShipments();
    } catch (err: any) {
      alert(err?.message || 'Failed to assign shipment carrier');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDelivered = async (ord: any) => {
    if (!confirm(`Confirm physical parcel delivery for order ${ord.order_number}?`)) return;
    try {
      await apiAdminConfirmDelivery(ord.order_number, 'Delivery confirmed by store admin.');
      setFeedback(`Order ${ord.order_number} delivery confirmed successfully.`);
      fetchShipments();
    } catch (err: any) {
      alert(err?.message || 'Failed to confirm delivery');
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Shipping & Fulfilment Queue
          </h1>
          <p className="text-xs text-[#6b7280]">
            Manage parcel dispatch, assign national carriers & tracking URLs, and confirm successful customer delivery.
          </p>
        </div>

        <button
          onClick={fetchShipments}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="p-0.5 text-emerald-700 hover:text-emerald-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Filters & Search Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search order #, tracking #, or recipient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-72 rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#374151] outline-none"
          >
            <option value="all">All Orders</option>
            <option value="paid">Pending Dispatch (Paid)</option>
            <option value="processing">Processing</option>
            <option value="shipped">In Transit (Shipped)</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
        <span className="text-xs text-[#6b7280]">
          Total in Queue: <strong>{orders.length}</strong>
        </span>
      </div>

      {/* Shipments Table */}
      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
            <tr>
              <th className="px-4 py-3">Order Number</th>
              <th className="px-4 py-3">Recipient & Destination</th>
              <th className="px-4 py-3">Shipping Zone</th>
              <th className="px-4 py-3">Carrier / Tracking</th>
              <th className="px-4 py-3">Fulfillment Status</th>
              <th className="px-4 py-3">Order Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f9fafb]">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#6b7280]">
                  Loading physical shipments queue...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#9ca3af]">
                  No orders found matching the filter criteria.
                </td>
              </tr>
            ) : (
              orders.map((ord) => {
                const isPaid = ord.order_status === 'paid';
                const isProcessing = ord.order_status === 'processing';
                const isShipped = ord.order_status === 'shipped';
                const isDelivered = ord.order_status === 'delivered';
                const addr = ord.shipping_address_snapshot || {};
                const zone = ord.shipping_zone_snapshot || {};

                return (
                  <tr key={ord.id} className="transition-colors hover:bg-[#fbfbfb]">
                    <td className="px-4 py-3 font-mono font-medium text-[#111827]">
                      {ord.order_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#111827]">
                        {addr.full_name || 'Customer'}
                      </div>
                      <div className="text-[11px] text-[#6b7280]">
                        {addr.city ? `${addr.city}, ${addr.state}` : ord.guest_email}
                      </div>
                      <div className="text-[10px] text-[#9ca3af]">{addr.phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-[#374151]">
                        {zone.name || 'Standard Zone'}
                      </span>
                      <div className="text-[10px] text-[#6b7280]">
                        Fee: ₦{Number(ord.shipping_fee || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {ord.carrier ? (
                        <div>
                          <span className="font-semibold text-[#111827]">{ord.carrier}</span>
                          <div className="font-mono text-[11px] text-[#6b7280]">
                            {ord.tracking_number || 'No code'}
                          </div>
                          {ord.tracking_url && (
                            <a
                              href={ord.tracking_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline mt-0.5"
                            >
                              <span>Track Live</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border capitalize ${
                          isDelivered
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                            : isShipped
                            ? 'bg-blue-50 text-blue-700 border-blue-200/60'
                            : isPaid || isProcessing
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
                              : isPaid || isProcessing
                              ? 'bg-purple-600'
                              : 'bg-neutral-400'
                          }`}
                        />
                        <span>{ord.order_status.replace(/_/g, ' ')}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#6b7280]">
                      {ord.created_at ? ord.created_at.slice(0, 16) : ''}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {(isPaid || isProcessing || isShipped) && (
                          <button
                            onClick={() => handleOpenAssign(ord)}
                            title={ord.carrier ? 'Update carrier details & tracking code' : 'Assign carrier & tracking code'}
                            aria-label={ord.carrier ? 'Update Carrier' : 'Assign Carrier'}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 shadow-xs transition-colors"
                          >
                            <AdminIcon name="flow" size={12} />
                            <span>{ord.carrier ? 'Update' : 'Carrier'}</span>
                          </button>
                        )}
                        {isShipped && (
                          <button
                            onClick={() => handleMarkDelivered(ord)}
                            title="Confirm physical customer receipt"
                            aria-label="Confirm Delivery"
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs transition-all"
                          >
                            <AdminIcon name="check-tick" size={12} className="brightness-200" />
                            <span>Delivered</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Assign Carrier & Tracking Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#111827]">
                Assign Physical Parcel Carrier
              </h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-black"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="mt-4 flex flex-col gap-4">
              <div className="rounded-lg bg-[#f9fafb] p-3 text-xs text-[#374151]">
                <p>
                  <strong>Order:</strong> {selectedOrder.order_number}
                </p>
                <p>
                  <strong>Recipient:</strong>{' '}
                  {selectedOrder.shipping_address_snapshot?.full_name || selectedOrder.guest_email}
                </p>
                <p>
                  <strong>Destination:</strong>{' '}
                  {selectedOrder.shipping_address_snapshot?.address_line1},{' '}
                  {selectedOrder.shipping_address_snapshot?.city},{' '}
                  {selectedOrder.shipping_address_snapshot?.state}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Delivery Carrier
                </label>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs outline-none focus:border-black"
                >
                  <option value="GIG Logistics">GIG Logistics</option>
                  <option value="DHL Express Nigeria">DHL Express Nigeria</option>
                  <option value="FedEx Nigeria / Red Star">FedEx Nigeria / Red Star</option>
                  <option value="Speedaf Express">Speedaf Express</option>
                  <option value="Kwik Delivery">Kwik Delivery</option>
                  <option value="In-House Dispatch Courier">In-House Dispatch Courier</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Tracking Code / Waybill Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. GIG-LOS-928192"
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 font-mono text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Tracking URL
                </label>
                <input
                  type="url"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://track.carrier.com/code"
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 font-mono text-xs outline-none focus:border-black"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2 border-t border-[#e5e7eb] pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-xs font-medium text-[#4b5563] hover:bg-[#f9fafb]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
                >
                  {submitting ? 'Dispatching...' : 'Dispatch & Mark Shipped'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
