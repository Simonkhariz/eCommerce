'use client';

import React, { useState } from 'react';
import { adminGetAccount, adminUpdateAccount, errorMessage, fieldErrors } from '@/lib/admin-api';
import { formatDate, humanize } from '@/lib/admin-format';
import {
  Button,
  DataState,
  DetailList,
  Field,
  PageHeader,
  Panel,
  TextInput,
  redirectIfSignedOut,
  useAdminData,
  useToast,
} from '@/components/admin/ui';

const MIN_PASSWORD = 10;

/**
 * The signed-in administrator's profile and password.
 * Changing the password signs out every other admin session.
 */
export function AdminAccount() {
  const toast = useToast();
  const { data: account, loading, error, reload } = useAdminData(() => adminGetAccount(), []);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [savingPassword, setSavingPassword] = useState(false);

  // Fill the profile form whenever the account (re)loads.
  const [formFor, setFormFor] = useState<typeof account>(null);
  if (account && account !== formFor) {
    setFormFor(account);
    setFullName(account.full_name ?? '');
    setPhone(account.phone ?? '');
  }

  const profileChanged = !!account && (fullName.trim() !== (account.full_name ?? '') || phone.trim() !== (account.phone ?? ''));

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setProfileErrors({ full_name: 'Name cannot be empty.' });
      return;
    }
    setSavingProfile(true);
    setProfileErrors({});
    try {
      const res = await adminUpdateAccount({ full_name: fullName.trim(), phone: phone.trim() });
      toast.success(res.message || 'Profile updated.');
      reload();
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      const fields = fieldErrors(err);
      setProfileErrors(fields);
      if (Object.keys(fields).length === 0) toast.error(errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    const local: Record<string, string> = {};
    if (!currentPassword) local.current_password = 'Enter your current password.';
    if (newPassword.length < MIN_PASSWORD) local.new_password = `Use at least ${MIN_PASSWORD} characters.`;
    if (newPassword !== confirmPassword) local.confirm_password = 'The passwords do not match.';
    setPasswordErrors(local);
    if (Object.keys(local).length > 0) return;

    setSavingPassword(true);
    try {
      // The endpoint updates the profile too, so send the saved profile unchanged.
      const res = await adminUpdateAccount({
        full_name: account.full_name,
        phone: account.phone ?? '',
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success(res.message || 'Password changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      const fields = fieldErrors(err);
      setPasswordErrors(fields);
      if (Object.keys(fields).length === 0) toast.error(errorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="My account" description="Your administrator profile and sign-in password." />

      <DataState loading={loading} error={error} onRetry={reload} hasData={!!account} empty={false}>
        {account && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Profile" bodyClassName="p-4">
              <div className="mb-4">
                <DetailList
                  items={[
                    { label: 'Email (used to sign in)', value: account.email },
                    { label: 'Role', value: humanize(account.role) },
                    { label: 'Member since', value: formatDate(account.created_at) },
                  ]}
                />
              </div>
              <form onSubmit={handleProfile} className="flex flex-col gap-4" noValidate>
                <Field label="Full name" required error={profileErrors.full_name}>
                  {(p) => <TextInput {...p} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />}
                </Field>
                <Field label="Phone" error={profileErrors.phone}>
                  {(p) => <TextInput {...p} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
                </Field>
                <div>
                  <Button type="submit" variant="primary" loading={savingProfile} disabled={!profileChanged}>
                    Save profile
                  </Button>
                </div>
              </form>
            </Panel>

            <Panel title="Change password" bodyClassName="p-4">
              <form onSubmit={handlePassword} className="flex flex-col gap-4" noValidate>
                {/* Hidden username helps password managers pair the new password with this account. */}
                <input type="email" autoComplete="username" value={account.email} readOnly hidden />
                <Field label="Current password" required error={passwordErrors.current_password}>
                  {(p) => (
                    <TextInput {...p} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                  )}
                </Field>
                <Field label="New password" required error={passwordErrors.new_password} hint={`At least ${MIN_PASSWORD} characters.`}>
                  {(p) => <TextInput {...p} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />}
                </Field>
                <Field label="Confirm new password" required error={passwordErrors.confirm_password}>
                  {(p) => (
                    <TextInput {...p} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  )}
                </Field>
                <p className="text-xs text-[#6b7280]">Changing your password signs out every other device where you are signed in to the admin.</p>
                <div>
                  <Button type="submit" variant="primary" loading={savingPassword}>
                    Change password
                  </Button>
                </div>
              </form>
            </Panel>
          </div>
        )}
      </DataState>
    </div>
  );
}
