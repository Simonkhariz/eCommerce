'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Mail01Icon, LockPasswordIcon, UserIcon, CallIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    login,
    register,
    requestMagicLink,
  } = useAuth();

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [magicSent, setMagicSent] = useState(false);

  // Status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setMagicSent(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const switchTab = (tab: 'login' | 'register' | 'magic') => {
    resetForm();
    openAuthModal(tab);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await login(email, password);
      resetForm();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await register({ full_name: fullName, email, password, phone: phone || undefined });
      resetForm();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create account. Please check your inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMagicRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await requestMagicLink(email);
      setMagicSent(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to request magic link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade"
        onClick={closeAuthModal}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 z-10 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-6">
          <span className="font-integral text-xl font-bold tracking-tight text-black">SHOP.CO</span>
          <button
            onClick={closeAuthModal}
            className="p-1 text-neutral-400 hover:text-black transition-colors rounded-full"
            aria-label="Close dialog"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-full bg-neutral-100 p-1 mb-6 text-xs sm:text-sm font-medium">
          <button
            type="button"
            onClick={() => switchTab('login')}
            className={`flex-1 py-2 text-center rounded-full transition-all ${
              authModalTab === 'login' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-black'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchTab('register')}
            className={`flex-1 py-2 text-center rounded-full transition-all ${
              authModalTab === 'register' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-black'
            }`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => switchTab('magic')}
            className={`flex-1 py-2 text-center rounded-full transition-all ${
              authModalTab === 'magic' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-black'
            }`}
          >
            Magic Link
          </button>
        </div>

        {/* Alert Messages */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-50 text-red-700 text-xs sm:text-sm font-medium border border-red-100">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 text-xs sm:text-sm font-medium border border-emerald-100 flex items-center gap-2">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* --- 1. SIGN IN FORM --- */}
        {authModalTab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-full bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <span className="absolute left-3.5 top-3.5 text-neutral-400">
                  <HugeiconsIcon icon={Mail01Icon} size={18} />
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-full bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <span className="absolute left-3.5 top-3.5 text-neutral-400">
                  <HugeiconsIcon icon={LockPasswordIcon} size={18} />
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 rounded-full bg-black text-white text-sm font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50 mt-2"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => switchTab('magic')}
                className="text-xs text-neutral-500 hover:text-black hover:underline"
              >
                Prefer passwordless? Use a Magic Sign-In Link
              </button>
            </div>
          </form>
        )}

        {/* --- 2. REGISTER FORM --- */}
        {authModalTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Full Name</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full pl-10 pr-4 py-2.5 rounded-full bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <span className="absolute left-3.5 top-3 text-neutral-400">
                  <HugeiconsIcon icon={UserIcon} size={18} />
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-full bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <span className="absolute left-3.5 top-3 text-neutral-400">
                  <HugeiconsIcon icon={Mail01Icon} size={18} />
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Phone Number (Optional)</label>
              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+234 800 000 0000"
                  className="w-full pl-10 pr-4 py-2.5 rounded-full bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <span className="absolute left-3.5 top-3 text-neutral-400">
                  <HugeiconsIcon icon={CallIcon} size={18} />
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Password (min 8 chars)</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-full bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <span className="absolute left-3.5 top-3 text-neutral-400">
                  <HugeiconsIcon icon={LockPasswordIcon} size={18} />
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 rounded-full bg-black text-white text-sm font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50 mt-2"
            >
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {/* --- 3. MAGIC LINK FORM --- */}
        {authModalTab === 'magic' && (
          <div className="space-y-4">
            {!magicSent ? (
              <form onSubmit={handleMagicRequest} className="space-y-4">
                <p className="text-xs text-neutral-600">
                  Enter your email address to receive a secure, one-click sign-in link. No password required.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Email Address</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-4 py-3 rounded-full bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    />
                    <span className="absolute left-3.5 top-3.5 text-neutral-400">
                      <HugeiconsIcon icon={Mail01Icon} size={18} />
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-6 rounded-full bg-black text-white text-sm font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Sending link...' : 'Send Magic Link'}
                </button>
              </form>
            ) : (
              <div className="space-y-4" role="status" aria-live="polite">
                <div className="p-4 bg-neutral-50 rounded-2xl text-sm text-neutral-700 border border-neutral-200">
                  <p className="font-semibold text-neutral-900 mb-1">Check your inbox</p>
                  <p>
                    If <strong className="text-black">{email}</strong> can receive sign-in links, we&apos;ve just sent one.
                    Open it on this device to sign in. The link works once and expires in 15 minutes.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setMagicSent(false)}
                    className="text-xs text-neutral-600 hover:text-black hover:underline"
                  >
                    Use a different email
                  </button>
                  <span className="text-neutral-300" aria-hidden="true">|</span>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={(e) => handleMagicRequest(e as unknown as React.FormEvent)}
                    className="text-xs text-neutral-600 hover:text-black hover:underline disabled:opacity-50"
                  >
                    {isSubmitting ? 'Sending...' : 'Send another link'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
