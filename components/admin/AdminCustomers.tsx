'use client';

import React, { useState, useEffect } from 'react';
import {
  apiAdminGetCustomers,
  apiAdminGetCustomerDetail,
  apiAdminUpdateCustomerStatus,
} from '@/lib/api-client';
import { AdminIcon } from './AdminIcon';
import { RefreshCw, X } from 'lucide-react';

export const AdminCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Customer Details Modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerDetail, setCustomerDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status Action Confirmation
  const [statusTarget, setStatusTarget] = useState<any | null>(null);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetCustomers({ search, status: statusFilter });
      const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
      setCustomers(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search, statusFilter]);

  const handleOpenDetail = async (id: number) => {
    setSelectedCustomerId(id);
    setDetailLoading(true);
    try {
      const res = await apiAdminGetCustomerDetail(id);
      setCustomerDetail(res?.data ?? res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!statusTarget) return;
    setStatusSubmitting(true);
    try {
      await apiAdminUpdateCustomerStatus(statusTarget.id, newStatus);
      setFeedback(`Customer account ${statusTarget.email} marked as ${newStatus}.`);
      setStatusTarget(null);
      fetchCustomers();
    } catch (err: any) {
      alert(err?.message || 'Failed to update customer status');
    } finally {
      setStatusSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Customer Accounts</h1>
          <p className="text-xs text-[#6b7280]">
            Registered shopper profiles, contact information, lifetime spend, and account suspension controls.
          </p>
        </div>

        <button
          onClick={fetchCustomers}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh List</span>
        </button>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="p-0.5 text-emerald-700 hover:text-emerald-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-72 rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#374151] outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <span className="text-xs text-[#6b7280]">
          Total Customers: <strong>{customers.length}</strong>
        </span>
      </div>

      {/* Customers Table */}
      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Registered Date</th>
              <th className="px-4 py-3">Total Orders</th>
              <th className="px-4 py-3">Lifetime Spend</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f9fafb]">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#6b7280]">
                  Loading customer database...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#9ca3af]">
                  No customers found matching criteria.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-[#fbfbfb]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-full bg-neutral-100 font-bold text-xs text-[#374151]">
                        {c.full_name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <div className="font-semibold text-[#111827]">{c.full_name}</div>
                        <div className="text-[11px] text-[#6b7280]">{c.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#4b5563]">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-[#6b7280]">
                    {c.created_at ? c.created_at.slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#111827]">
                    {c.total_orders} orders
                  </td>
                  <td className="px-4 py-3 font-bold text-[#111827]">
                    ₦{Number(c.lifetime_spend || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border capitalize ${
                        c.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                          : 'bg-rose-50 text-rose-700 border-rose-200/60'
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          c.status === 'active' ? 'bg-emerald-600' : 'bg-rose-600'
                        }`}
                      />
                      <span>{c.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenDetail(c.id)}
                        title={`View profile and orders for ${c.full_name || 'customer'}`}
                        aria-label="View Customer Detail"
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 shadow-xs transition-colors"
                      >
                        <AdminIcon name="user-account" size={12} />
                        <span>Detail</span>
                      </button>
                      <button
                        onClick={() => setStatusTarget(c)}
                        title={c.status === 'active' ? 'Suspend customer account' : 'Reactivate customer account'}
                        aria-label={c.status === 'active' ? 'Suspend' : 'Activate'}
                        className={`inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                          c.status === 'active'
                            ? 'text-rose-600 hover:bg-rose-50'
                            : 'text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        <span>{c.status === 'active' ? 'Suspend' : 'Activate'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl animate-fade max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#111827]">Customer Profile & History</h3>
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-black"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            {detailLoading || !customerDetail ? (
              <div className="py-12 text-center text-xs text-[#6b7280]">
                Loading customer profile...
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-6">
                {/* Profile Card */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#fafafa] p-4">
                  <div>
                    <h4 className="text-sm font-bold text-[#111827]">
                      {customerDetail.customer?.full_name}
                    </h4>
                    <p className="text-xs text-[#6b7280]">{customerDetail.customer?.email}</p>
                    <p className="text-xs text-[#6b7280]">
                      Phone: {customerDetail.customer?.phone || 'Not provided'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[#6b7280]">Lifetime Spend</span>
                    <p className="text-lg font-bold text-[#111827]">
                      ₦{Number(customerDetail.summary?.total_spend || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-[#9ca3af]">
                      {customerDetail.summary?.total_orders || 0} completed orders
                    </p>
                  </div>
                </div>

                {/* Saved Addresses */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#374151]">
                    Saved Shipping Addresses ({customerDetail.addresses?.length || 0})
                  </h4>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {customerDetail.addresses?.length === 0 ? (
                      <p className="text-xs text-[#9ca3af]">No saved addresses found.</p>
                    ) : (
                      customerDetail.addresses?.map((a: any) => (
                        <div
                          key={a.id}
                          className="rounded-lg border border-[#e5e7eb] p-3 text-xs text-[#4b5563]"
                        >
                          <p className="font-semibold text-[#111827]">{a.full_name}</p>
                          <p>{a.address_line1}</p>
                          <p>
                            {a.city}, {a.state}
                          </p>
                          <p className="text-[11px] text-[#6b7280]">Phone: {a.phone}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Orders History */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#374151]">
                    Order History ({customerDetail.orders?.length || 0})
                  </h4>
                  <div className="mt-2 overflow-x-auto rounded-lg border border-[#e5e7eb]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#fafafa] text-[11px] text-[#9ca3af]">
                        <tr>
                          <th className="px-3 py-2">Order</th>
                          <th className="px-3 py-2">Amount</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Payment</th>
                          <th className="px-3 py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f3f4f6]">
                        {customerDetail.orders?.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-xs text-[#9ca3af]">
                              No orders placed yet.
                            </td>
                          </tr>
                        ) : (
                          customerDetail.orders?.map((o: any) => (
                            <tr key={o.id}>
                              <td className="px-3 py-2 font-mono font-medium text-[#111827]">
                                {o.order_number}
                              </td>
                              <td className="px-3 py-2 font-semibold">
                                ₦{Number(o.total_amount).toLocaleString()}
                              </td>
                              <td className="px-3 py-2 capitalize">{o.order_status}</td>
                              <td className="px-3 py-2 capitalize">{o.payment_status}</td>
                              <td className="px-3 py-2 text-[#6b7280]">
                                {o.created_at?.slice(0, 10)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Suspend / Reactivate Confirmation Dialog */}
      {statusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl animate-fade">
            <h3 className="text-base font-bold text-[#111827]">
              {statusTarget.status === 'active' ? 'Suspend Customer Account' : 'Reactivate Account'}
            </h3>
            <p className="mt-2 text-xs text-[#6b7280]">
              Are you sure you want to{' '}
              {statusTarget.status === 'active' ? 'suspend' : 'reactivate'} account{' '}
              <strong>{statusTarget.email}</strong>? Suspended accounts cannot sign in or place orders.
            </p>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatusTarget(null)}
                className="rounded-lg border border-[#e5e7eb] px-3 py-1.5 text-xs font-medium text-[#4b5563] hover:bg-[#f9fafb]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusSubmitting}
                onClick={() =>
                  handleStatusChange(statusTarget.status === 'active' ? 'suspended' : 'active')
                }
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm ${
                  statusTarget.status === 'active'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {statusSubmitting ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
