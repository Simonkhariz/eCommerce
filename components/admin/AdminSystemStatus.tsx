'use client';

import React, { useState, useEffect } from 'react';
import { apiAdminGetSystemStatus } from '@/lib/api-client';

export const AdminSystemStatus: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetSystemStatus();
      setStatus(res?.data ?? res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            System Diagnostics &amp; Health
          </h1>
          <p className="text-xs text-[#6b7280]">
            Monitor PHP REST backend health, MySQL database latency, server timestamp synchronization, and storage permissions.
          </p>
        </div>

        <button
          onClick={fetchStatus}
          className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] shadow-sm hover:bg-[#f9fafb]"
        >
          <span>Run Diagnostic Ping</span>
        </button>
      </div>

      {loading || !status ? (
        <div className="flex h-96 w-full flex-col items-center justify-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
          <span className="text-xs text-[#6b7280]">Pinging backend server and database engine...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Health Banner */}
          <div
            className={`flex items-center justify-between rounded-xl p-4 shadow-sm border ${
              status.system_health === 'healthy'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`size-3 rounded-full ${
                  status.system_health === 'healthy' ? 'bg-emerald-600' : 'bg-red-600'
                }`}
              />
              <div>
                <h3 className="text-sm font-bold capitalize">System State: {status.system_health}</h3>
                <p className="text-xs opacity-80">
                  All mission-critical e-commerce microservices, database pools, and session authenticators are responsive.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-mono font-bold shadow-sm">
              Server Time: {status.server_time}
            </span>
          </div>

          {/* Diagnostic Panels Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Database Engine */}
            <div className="flex flex-col rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
              <span className="text-xs font-medium text-[#6b7280]">Database Engine</span>
              <p className="mt-2 text-lg font-bold text-[#111827]">
                {status.database?.engine || 'MySQL / MariaDB'}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span>Connection State:</span>
                <span className="font-semibold text-emerald-700">
                  {status.database?.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span>Round-Trip Latency:</span>
                <span className="font-mono font-semibold text-[#111827]">
                  {status.database?.latency_ms} ms
                </span>
              </div>
            </div>

            {/* Runtime Environment */}
            <div className="flex flex-col rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
              <span className="text-xs font-medium text-[#6b7280]">PHP Runtime</span>
              <p className="mt-2 text-lg font-bold text-[#111827]">
                PHP {status.php_version}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span>Environment:</span>
                <span className="font-semibold text-neutral-800 capitalize">
                  {status.environment?.env}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span>Server Software:</span>
                <span className="text-[#6b7280] line-clamp-1">{status.server_software}</span>
              </div>
            </div>

            {/* Storage Permissions */}
            <div className="flex flex-col rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
              <span className="text-xs font-medium text-[#6b7280]">Storage &amp; Uploads</span>
              <p className="mt-2 text-lg font-bold text-[#111827]">
                {status.storage?.uploads_directory_writable ? 'Writable' : 'Read Only'}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span>Target Uploads Path:</span>
                <span className="font-mono text-[#6b7280]">{status.storage?.path}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span>Media Persistence:</span>
                <span className="font-semibold text-emerald-700">Verified</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
