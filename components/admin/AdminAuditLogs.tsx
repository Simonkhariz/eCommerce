'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { apiAdminGetAuditLogs } from '@/lib/api-client';

export const AdminAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetAuditLogs();
      const list = Array.isArray(res) ? res : (res as any)?.items || (res as any)?.data || [];
      setLogs(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Security &amp; Operational Audit Logs
          </h1>
          <p className="text-xs text-[#6b7280]">
            Immutable chronological record of administrator mutations across stock, refunds, customer statuses, and system settings.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Audit Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Administrator</th>
              <th className="px-4 py-3">Action Performed</th>
              <th className="px-4 py-3">Target Entity</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f9fafb]">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-xs text-[#6b7280]">
                  Loading security audit trail...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-xs text-[#9ca3af]">
                  No audit log entries recorded yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-[#fbfbfb]">
                  <td className="px-4 py-3 font-mono text-[#6b7280]">
                    {log.created_at ? log.created_at.slice(0, 19) : ''}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#111827]">
                      {log.admin_name || 'System / Dev Admin'}
                    </div>
                    <div className="text-[11px] text-[#9ca3af]">{log.admin_email || 'root'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#111827]">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#4b5563]">
                    <span className="capitalize">{log.entity_type}</span>{' '}
                    <span className="font-mono text-[11px] text-[#9ca3af]">
                      #{log.entity_id || 'global'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[#6b7280]">{log.ip_address}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="rounded-lg border border-[#e5e7eb] px-2.5 py-1 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]"
                    >
                      Inspect Diff
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Inspect Diff Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl animate-fade max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Audit Trail State Inspection</h3>
                <p className="font-mono text-xs text-[#6b7280]">{selectedLog.action}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-black"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#fafafa] p-3 text-xs">
                <div>
                  <span className="text-[#9ca3af]">Actor:</span>{' '}
                  <strong>{selectedLog.admin_name || 'System Admin'}</strong>
                </div>
                <div>
                  <span className="text-[#9ca3af]">IP:</span> {selectedLog.ip_address}
                </div>
                <div>
                  <span className="text-[#9ca3af]">Target Entity:</span> {selectedLog.entity_type} #
                  {selectedLog.entity_id}
                </div>
                <div>
                  <span className="text-[#9ca3af]">Recorded:</span> {selectedLog.created_at}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#374151]">
                  State Snapshot Diff (Before / After)
                </h4>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-red-100 bg-red-50/40 p-3">
                    <span className="text-[11px] font-bold text-red-800 uppercase">
                      Before State
                    </span>
                    <pre className="mt-1 overflow-x-auto text-[11px] font-mono text-red-900 whitespace-pre-wrap">
                      {selectedLog.before_state
                        ? JSON.stringify(
                            typeof selectedLog.before_state === 'string'
                              ? JSON.parse(selectedLog.before_state)
                              : selectedLog.before_state,
                            null,
                            2
                          )
                        : '(null - new entity creation)'}
                    </pre>
                  </div>

                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                    <span className="text-[11px] font-bold text-emerald-800 uppercase">
                      After State
                    </span>
                    <pre className="mt-1 overflow-x-auto text-[11px] font-mono text-emerald-900 whitespace-pre-wrap">
                      {selectedLog.after_state
                        ? JSON.stringify(
                            typeof selectedLog.after_state === 'string'
                              ? JSON.parse(selectedLog.after_state)
                              : selectedLog.after_state,
                            null,
                            2
                          )
                        : '(null - entity deleted)'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
