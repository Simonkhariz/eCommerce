'use client';

import React, { useState, useEffect } from 'react';
import {
  apiAdminGetInventory,
  apiAdminAdjustStock,
  apiAdminGetInventoryLogs,
} from '@/lib/api-client';
import { AdminIcon } from './AdminIcon';
import { RefreshCw, X } from 'lucide-react';

export const AdminInventory: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'stock' | 'logs'>('stock');
  const [variants, setVariants] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'low_stock' | 'out_of_stock'>('all');
  const [search, setSearch] = useState('');

  // Stock Adjustment Modal State
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [changeAmount, setChangeAmount] = useState<number>(0);
  const [reason, setReason] = useState<string>('Restock / Shipment arrival');
  const [adjusting, setAdjusting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      if (activeTab === 'stock') {
        const res = await apiAdminGetInventory({ filter, search });
        const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
        setVariants(list);
      } else {
        const res = await apiAdminGetInventoryLogs();
        const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
        setLogs(list);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [activeTab, filter, search]);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariant || changeAmount === 0 || !reason.trim()) return;

    setAdjusting(true);
    setActionError(null);
    try {
      await apiAdminAdjustStock({
        variant_id: selectedVariant.id,
        change_amount: changeAmount,
        reason: reason.trim(),
      });
      setActionSuccess(
        `Successfully adjusted ${selectedVariant.sku} stock by ${changeAmount > 0 ? '+' : ''}${changeAmount}.`
      );
      setSelectedVariant(null);
      setChangeAmount(0);
      fetchInventory();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to adjust inventory stock.');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Inventory Management</h1>
          <p className="text-xs text-[#6b7280]">
            Track SKU variant stock levels, enforce reorder thresholds, and log stock adjustments.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center rounded-lg border border-[#e5e7eb] bg-white p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('stock')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'stock'
                ? 'bg-black text-white'
                : 'text-[#4b5563] hover:text-[#111827]'
            }`}
          >
            Live Stock Overview
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'logs'
                ? 'bg-black text-white'
                : 'text-[#4b5563] hover:text-[#111827]'
            }`}
          >
            Movement Audit Logs
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="p-0.5 text-emerald-700 hover:text-emerald-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Live Stock View */}
      {activeTab === 'stock' && (
        <div className="flex flex-col gap-4">
          {/* Filters & Search Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="search"
                placeholder="Search SKU or product..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-64 rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
              />
              <select
                value={filter}
                onChange={(e: any) => setFilter(e.target.value)}
                className="h-8 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#374151] outline-none"
              >
                <option value="all">All Variants</option>
                <option value="low_stock">Low Stock Only</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>

            <button
              onClick={fetchInventory}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Stock</span>
            </button>
          </div>

          {/* Variants Table */}
          <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                <tr>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Variant (Size / Color)</th>
                  <th className="px-4 py-3">Base / Override Price</th>
                  <th className="px-4 py-3">Current Stock</th>
                  <th className="px-4 py-3">Threshold</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f9fafb]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-[#6b7280]">
                      Loading real-time inventory records...
                    </td>
                  </tr>
                ) : variants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-[#9ca3af]">
                      No product variants matching the criteria.
                    </td>
                  </tr>
                ) : (
                  variants.map((v) => {
                    const isOutOfStock = v.stock_quantity === 0;
                    const isLowStock = v.stock_quantity <= v.low_stock_threshold && !isOutOfStock;

                    return (
                      <tr key={v.id} className="transition-colors hover:bg-[#fbfbfb]">
                        <td className="px-4 py-3 font-medium text-[#111827]">
                          {v.product_name}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#4b5563]">{v.sku}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-3.5 rounded-full border border-black/10 shrink-0"
                              style={{ backgroundColor: v.color_hex || '#000' }}
                            />
                            <span>
                              {v.size} · {v.color_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          ₦{Number(v.price_override || v.base_price).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-bold text-sm">
                          <span
                            className={
                              isOutOfStock
                                ? 'text-red-600'
                                : isLowStock
                                ? 'text-amber-600'
                                : 'text-emerald-700'
                            }
                          >
                            {v.stock_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#6b7280]">{v.low_stock_threshold}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                              isOutOfStock
                                ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                                : isLowStock
                                ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                            }`}
                          >
                            <span
                              className={`size-1.5 rounded-full shrink-0 ${
                                isOutOfStock
                                  ? 'bg-rose-600'
                                  : isLowStock
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-600'
                              }`}
                            />
                            <span>
                              {isOutOfStock
                                ? 'Out of Stock'
                                : isLowStock
                                ? 'Low Stock'
                                : 'In Stock'}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedVariant(v);
                              setChangeAmount(0);
                              setActionError(null);
                            }}
                            title={`Adjust warehouse stock for ${v.sku}`}
                            aria-label="Adjust Stock"
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 shadow-xs transition-colors"
                          >
                            <AdminIcon name="timer" size={12} />
                            <span>Adjust</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Movement Logs View */}
      {activeTab === 'logs' && (
        <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Product / SKU</th>
                <th className="px-4 py-3">Prev Stock</th>
                <th className="px-4 py-3">Adjustment</th>
                <th className="px-4 py-3">New Stock</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Adjusted By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f9fafb]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[#6b7280]">
                    Loading stock movement logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[#9ca3af]">
                    No inventory movement records found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-[#fbfbfb]">
                    <td className="px-4 py-3 font-mono text-[#6b7280]">
                      {log.created_at ? log.created_at.slice(0, 16) : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#111827]">{log.product_name}</div>
                      <div className="font-mono text-[11px] text-[#9ca3af]">
                        {log.variant_sku} ({log.size} / {log.color_name})
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#6b7280]">{log.previous_stock}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          log.change_amount > 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {log.change_amount > 0 ? `+${log.change_amount}` : log.change_amount}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-[#111827]">{log.new_stock}</td>
                    <td className="px-4 py-3 text-[#374151]">{log.reason}</td>
                    <td className="px-4 py-3 text-[#6b7280]">
                      {log.adjusted_by_name || 'Admin'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {selectedVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-fade">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <h3 className="text-base font-bold text-[#111827]">Adjust Physical Stock</h3>
              <button
                onClick={() => setSelectedVariant(null)}
                className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-black"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="mt-4 flex flex-col gap-4">
              <div className="rounded-lg bg-[#f9fafb] p-3 text-xs">
                <p className="font-semibold text-[#111827]">{selectedVariant.product_name}</p>
                <p className="text-[11px] text-[#6b7280]">
                  SKU: {selectedVariant.sku} · {selectedVariant.size} / {selectedVariant.color_name}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span>Current Physical Stock:</span>
                  <span className="font-bold text-sm text-black">
                    {selectedVariant.stock_quantity} units
                  </span>
                </div>
              </div>

              {actionError && (
                <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800">
                  {actionError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Change Amount (+ to add, - to deduct)
                </label>
                <input
                  type="number"
                  value={changeAmount || ''}
                  onChange={(e) => setChangeAmount(parseInt(e.target.value, 10) || 0)}
                  placeholder="e.g. 20 or -5"
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm font-semibold outline-none focus:border-black"
                />
                <p className="mt-1 text-[11px] text-[#6b7280]">
                  New stock will be:{' '}
                  <span className="font-bold text-black">
                    {Math.max(0, (selectedVariant.stock_quantity || 0) + changeAmount)} units
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151]">
                  Mandatory Audit Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs outline-none focus:border-black"
                >
                  <option value="Restock / Shipment arrival">Restock / Shipment arrival</option>
                  <option value="Inventory cycle count recount">Inventory cycle count recount</option>
                  <option value="Damaged goods write-off">Damaged goods write-off</option>
                  <option value="Customer return restocked">Customer return restocked</option>
                  <option value="Demo unit allocated">Demo unit allocated</option>
                  <option value="Supplier discrepancy correction">Supplier discrepancy correction</option>
                </select>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2 border-t border-[#e5e7eb] pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedVariant(null)}
                  className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-xs font-medium text-[#4b5563] hover:bg-[#f9fafb]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjusting || changeAmount === 0}
                  className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
                >
                  {adjusting ? 'Saving & Auditing...' : 'Confirm Stock Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
