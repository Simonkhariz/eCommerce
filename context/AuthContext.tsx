'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  ApiUser,
  ApiAddress,
  apiGetMe,
  apiLogin,
  apiRegister,
  apiLogout,
  apiRequestMagicLink,
  apiVerifyMagicLink,
  apiGetAddresses,
  apiCreateAddress,
  apiDeleteAddress,
  apiSetDefaultAddress,
  apiUpdateProfile,
  apiMergeCart,
  apiMergeWishlist,
} from '@/lib/api-client';

interface AuthContextType {
  user: ApiUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  addresses: ApiAddress[];
  isAuthModalOpen: boolean;
  authModalTab: 'login' | 'register' | 'magic';
  openAuthModal: (tab?: 'login' | 'register' | 'magic') => void;
  closeAuthModal: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { full_name: string; email: string; password: string; phone?: string }) => Promise<void>;
  requestMagicLink: (email: string) => Promise<{ message: string; magic_token?: string }>;
  verifyMagicLink: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  loadAddresses: () => Promise<void>;
  addAddress: (data: Partial<ApiAddress>) => Promise<ApiAddress>;
  deleteAddress: (id: number) => Promise<void>;
  setDefaultAddress: (id: number) => Promise<void>;
  updateProfile: (data: { full_name?: string; phone?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [addresses, setAddresses] = useState<ApiAddress[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register' | 'magic'>('login');

  const loadAddresses = useCallback(async () => {
    try {
      const data = await apiGetAddresses();
      setAddresses(data);
    } catch {
      setAddresses([]);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiGetMe();
      setUser(res.user);
      if (res.user) {
        loadAddresses();
      }
    } catch {
      setUser(null);
      setAddresses([]);
    } finally {
      setIsLoading(false);
    }
  }, [loadAddresses]);

  // Initial session hydration from HttpOnly cookie
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const openAuthModal = (tab: 'login' | 'register' | 'magic' = 'login') => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const login = async (email: string, password: string) => {
    const res = await apiLogin({ email, password });
    setUser(res.user);
    setIsAuthModalOpen(false);
    loadAddresses();

    // Sync any cart items present in localStorage
    try {
      const savedCart = localStorage.getItem('shopco_cart_guest');
      if (savedCart) {
        const items = JSON.parse(savedCart);
        if (Array.isArray(items) && items.length > 0) {
          const payload = items.map((i: any) => ({
            variant_id: Number(i.variantId || i.id || 1),
            quantity: Number(i.quantity || 1),
          }));
          await apiMergeCart(payload);
        }
      }
    } catch {
      // Non-blocking merge
    }
  };

  const register = async (data: { full_name: string; email: string; password: string; phone?: string }) => {
    const res = await apiRegister(data);
    setUser(res.user);
    setIsAuthModalOpen(false);
    loadAddresses();
  };

  const requestMagicLink = async (email: string) => {
    return apiRequestMagicLink(email);
  };

  const verifyMagicLink = async (token: string) => {
    const res = await apiVerifyMagicLink(token);
    setUser(res.user);
    setIsAuthModalOpen(false);
    loadAddresses();
  };

  const logout = async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setAddresses([]);
    }
  };

  const addAddress = async (data: Partial<ApiAddress>) => {
    const created = await apiCreateAddress(data);
    await loadAddresses();
    return created;
  };

  const deleteAddress = async (id: number) => {
    await apiDeleteAddress(id);
    await loadAddresses();
  };

  const setDefaultAddress = async (id: number) => {
    await apiSetDefaultAddress(id);
    await loadAddresses();
  };

  const updateProfile = async (data: { full_name?: string; phone?: string }) => {
    const updated = await apiUpdateProfile(data);
    setUser(updated);
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAdmin,
        addresses,
        isAuthModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        login,
        register,
        requestMagicLink,
        verifyMagicLink,
        logout,
        refreshUser,
        loadAddresses,
        addAddress,
        deleteAddress,
        setDefaultAddress,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
