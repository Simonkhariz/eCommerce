'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiAdminGetAccount, apiAdminUpdateAccount } from '@/lib/api-client';

export const AdminAccount: React.FC = () => {
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchAccount = async () => {
    setLoading(true);
    try {
      const res = await apiAdminGetAccount();
      const u = res?.data ?? res ?? {};
      setAccount(u);
      setFullName(u.full_name || '');
      setPhone(u.phone || '');
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccount();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (newPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword && newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    setSaving(true);
    try {
      await apiAdminUpdateAccount({
        full_name: fullName.trim(),
        phone: phone.trim(),
        ...(newPassword
          ? { current_password: currentPassword, new_password: newPassword }
          : {}),
      });
      setFeedback('Admin account profile and credentials updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      fetchAccount();
    } catch (err: any) {
      setError(err?.message || 'Failed to update admin account.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 w-full flex-col items-center justify-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
        <span className="text-xs text-[#6b7280]">Loading administrator profile...</span>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Admin Account &amp; Security
          </h1>
          <p className="text-xs text-[#6b7280]">
            Manage single administrative credentials, contact information, and session security.
          </p>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="p-0.5 hover:opacity-75" aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 p-3 text-xs text-red-800">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-0.5 hover:opacity-75" aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Profile Info */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#111827]">Administrator Profile</h2>
          <p className="text-xs text-[#6b7280]">Personal identity and primary administrator role</p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-[#374151]">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151]">Admin Email</label>
              <input
                type="email"
                value={account?.email || ''}
                disabled
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 font-mono text-xs text-[#6b7280] outline-none"
              />
              <span className="text-[10px] text-[#9ca3af]">Protected login email identifier</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151]">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 812 000 0000"
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
              />
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#111827]">Change Security Password</h2>
          <p className="text-xs text-[#6b7280]">
            Leave blank if you do not wish to update your administrator credentials
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-[#374151]">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151]">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151]">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="mt-1 h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-xs outline-none focus:border-black"
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end pb-8">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-6 py-2.5 text-xs font-semibold text-white shadow hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? 'Updating Account...' : 'Save Account Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};
