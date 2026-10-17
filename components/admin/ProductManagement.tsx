'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AdminProduct,
  ApiCategory,
  PaginationMeta,
  apiGetAdminProducts,
  apiCreateAdminProduct,
  apiUpdateAdminProduct,
  apiUpdateAdminProductStatus,
  apiAdjustInventory,
  apiDeleteAdminProduct,
  apiGetCategories,
  apiUploadProductImage,
  apiLogin,
} from '@/lib/api-client';
import { formatPrice } from '@/lib/currency';
import {
  Package,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Edit,
  Trash2,
  RefreshCw,
  Archive,
  Layers,
  FileText,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Upload,
  Image as ImageIcon,
  Lock,
  LogIn,
  Key,
} from 'lucide-react';

interface ToastMessage {
  type: 'success' | 'error';
  message: string;
}

const DRESS_STYLES = ['Casual', 'Formal', 'Party', 'Gym'];
const STANDARD_SIZES = ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'];

function computeAutoSku(
  name: string,
  categoryId: number | '',
  dressStyle: string,
  categoriesList: ApiCategory[]
): string {
  const cat = categoriesList.find((c) => c.id === categoryId);
  const prefix = cat
    ? cat.slug.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase()
    : dressStyle
    ? dressStyle.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase()
    : 'SHOP';

  const cleanName = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('-')
    .toUpperCase();

  const mid = cleanName || 'ITEM';
  return `${prefix}-${mid}`;
}

export const ProductManagement: React.FC = () => {
  // Products state
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    per_page: 10,
    total: 0,
    total_pages: 1,
  });
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Admin In-Line Login Form State (when 401 occurs)
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginErrorMsg, setLoginErrorMsg] = useState<string | null>(null);

  // Filters state
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [inventoryFilter, setInventoryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  // Stock Adjustment Modal
  const [isStockModalOpen, setIsStockModalOpen] = useState<boolean>(false);
  const [stockProduct, setStockProduct] = useState<AdminProduct | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('restock');
  const [adjustmentNotes, setAdjustmentNotes] = useState<string>('');
  const [stockSubmitting, setStockSubmitting] = useState<boolean>(false);

  // Archive confirmation modal
  const [archiveTarget, setArchiveTarget] = useState<AdminProduct | null>(null);

  // File Upload State
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Fields
  const [formName, setFormName] = useState<string>('');
  const [formSlug, setFormSlug] = useState<string>('');
  const [formCategoryId, setFormCategoryId] = useState<number | ''>('');
  const [formStatus, setFormStatus] = useState<'draft' | 'published' | 'archived'>('published');
  const [formDressStyle, setFormDressStyle] = useState<string>('Casual');
  const [formBasePrice, setFormBasePrice] = useState<string>('');
  const [formOriginalPrice, setFormOriginalPrice] = useState<string>('');
  const [formSku, setFormSku] = useState<string>('');
  const [isSkuCustomized, setIsSkuCustomized] = useState<boolean>(false);
  const [formDescription, setFormDescription] = useState<string>('');
  const [formIsFeatured, setFormIsFeatured] = useState<boolean>(false);
  const [formIsFlashDeal, setFormIsFlashDeal] = useState<boolean>(false);

  // Dynamic Image URLs (and uploaded images)
  const [formImages, setFormImages] = useState<Array<{ image_url: string; alt_text?: string; is_primary: boolean }>>([
    { image_url: '', alt_text: '', is_primary: true },
  ]);

  // Dynamic Variants
  const [formVariants, setFormVariants] = useState<
    Array<{
      id?: number;
      original_stock_quantity?: number;
      sku: string;
      size: string;
      color_name: string;
      color_hex: string;
      price_override: string;
      stock_quantity: string;
      low_stock_threshold: string;
    }>
  >([
    {
      sku: '',
      size: 'Medium',
      color_name: 'Black',
      color_hex: '#000000',
      price_override: '',
      stock_quantity: '20',
      low_stock_threshold: '5',
    },
  ]);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load Categories once
  useEffect(() => {
    apiGetCategories()
      .then((cats) => setCategories(cats))
      .catch((err) => console.error('Failed to load categories', err));
  }, []);

  // Fetch Products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsAuthError(false);
    try {
      const res = await apiGetAdminProducts({
        page: currentPage,
        per_page: 10,
        search: debouncedSearch,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        inventory: inventoryFilter !== 'all' ? inventoryFilter : undefined,
      });
      const itemsList = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setProducts(itemsList);
      setPagination(res?.pagination || { page: 1, per_page: 10, total: itemsList.length, total_pages: 1 });
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch admin products.';
      setError(msg);
      if (
        msg.includes('Unauthorized') ||
        msg.includes('authentication required') ||
        err.statusCode === 401 ||
        err.errorCode === 'UNAUTHENTICATED'
      ) {
        setIsAuthError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, categoryFilter, statusFilter, inventoryFilter]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Handle In-Line Admin Sign-In
  const handleAdminLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoggingIn(true);
    setLoginErrorMsg(null);
    try {
      await apiLogin({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      setToast({ type: 'success', message: 'Administrator authenticated successfully!' });
      setIsAuthError(false);
      setError(null);
      await loadProducts();
    } catch (err: any) {
      setLoginErrorMsg(err.message || 'Sign in failed. Please verify credentials.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Quick Status Toggle
  const handleStatusChange = async (product: AdminProduct, newStatus: 'published' | 'draft' | 'archived') => {
    try {
      await apiUpdateAdminProductStatus(product.id, newStatus);
      setToast({
        type: 'success',
        message: `Product "${product.name}" status updated to ${newStatus}.`,
      });
      loadProducts();
    } catch (err: any) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to update status.',
      });
    }
  };

  // Handle Image File Upload (Multiple supported)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImage(true);
    try {
      const uploadPromises = Array.from(files).map((f) => apiUploadProductImage(f));
      const results = await Promise.all(uploadPromises);

      const newUploaded = results.map((res, i) => ({
        image_url: res.image_url,
        alt_text: formName || 'Product photo',
        is_primary: formImages.filter((img) => img.image_url.trim() !== '').length === 0 && i === 0,
      }));

      // Filter out empty placeholder and append new uploaded images
      setFormImages((prev) => {
        const filtered = prev.filter((img) => img.image_url.trim() !== '');
        return [...filtered, ...newUploaded];
      });

      setToast({
        type: 'success',
        message: `Successfully uploaded ${results.length} image${results.length > 1 ? 's' : ''}!`,
      });
    } catch (err: any) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to upload image.',
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Open Create Modal
  const openCreateModal = () => {
    setIsEditing(false);
    setEditingProductId(null);
    setIsSkuCustomized(false);
    setFormName('');
    setFormSlug('');
    setFormCategoryId(categories[0]?.id || '');
    setFormStatus('published');
    setFormDressStyle('Casual');
    setFormBasePrice('');
    setFormOriginalPrice('');
    setFormSku('');
    setFormDescription('');
    setFormIsFeatured(false);
    setFormIsFlashDeal(false);
    setFormImages([]);
    setFormVariants([
      {
        sku: '',
        size: 'Medium',
        color_name: 'Black',
        color_hex: '#000000',
        price_override: '',
        stock_quantity: '20',
        low_stock_threshold: '5',
      },
    ]);
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (product: AdminProduct) => {
    setIsEditing(true);
    setEditingProductId(product.id);
    setIsSkuCustomized(true);
    setFormName(product.name);
    setFormSlug(product.slug);
    setFormCategoryId(product.category_id || '');
    setFormStatus(product.status);
    setFormDressStyle(product.dress_style || 'Casual');
    setFormBasePrice(String(product.base_price));
    setFormOriginalPrice(product.original_price ? String(product.original_price) : '');
    setFormSku(product.sku);
    setFormDescription(product.description || '');
    setFormIsFeatured(product.is_featured);
    setFormIsFlashDeal(product.is_flash_deal);

    // Images
    if (product.images && product.images.length > 0) {
      setFormImages(
        product.images.map((img) => ({
          image_url: img.image_url,
          alt_text: img.alt_text || '',
          is_primary: Boolean(img.is_primary),
        }))
      );
    } else if (product.primary_image) {
      setFormImages([{ image_url: product.primary_image, alt_text: product.name, is_primary: true }]);
    } else {
      setFormImages([]);
    }

    // Variants
    if (product.variants && product.variants.length > 0) {
      setFormVariants(
        product.variants.map((v) => ({
          id: v.id,
          original_stock_quantity: v.stock_quantity,
          sku: v.sku,
          size: v.size,
          color_name: v.color_name,
          color_hex: v.color_hex,
          price_override: v.price_override ? String(v.price_override) : '',
          stock_quantity: String(v.stock_quantity),
          low_stock_threshold: String(v.low_stock_threshold ?? 5),
        }))
      );
    } else {
      setFormVariants([
        {
          sku: `${product.sku}-STD`,
          size: 'Standard',
          color_name: 'Default',
          color_hex: '#000000',
          price_override: '',
          stock_quantity: '10',
          low_stock_threshold: '5',
        },
      ]);
    }

    setFormErrors({});
    setIsModalOpen(true);
  };

  // Open Inventory Adjustment Modal
  const openStockModal = (product: AdminProduct) => {
    setStockProduct(product);
    setSelectedVariantId(product.variants?.[0]?.id || null);
    setAdjustmentAmount(0);
    setAdjustmentReason('restock');
    setAdjustmentNotes('');
    setIsStockModalOpen(true);
  };

  // Auto-generate slug and SKU from name
  const handleNameChange = (val: string) => {
    setFormName(val);
    if (!isEditing) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormSlug(generated);

      if (!isSkuCustomized) {
        if (val.trim()) {
          setFormSku(computeAutoSku(val, formCategoryId, formDressStyle, categories));
        } else {
          setFormSku('');
        }
      }
    }
  };

  // Submit Product Form (Create / Edit)
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const errors: Record<string, string> = {};
    if (!formName.trim() || formName.trim().length < 3) {
      errors.name = 'Product name must be at least 3 characters.';
    }
    if (!formSlug.trim() || !/^[a-z0-9-]+$/.test(formSlug.trim())) {
      errors.slug = 'Valid slug required (lowercase letters, numbers, hyphens).';
    }
    if (!formBasePrice || Number(formBasePrice) <= 0) {
      errors.base_price = 'Base price must be a positive number.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    // Auto-generate effective SKU from other details if omitted
    const effectiveSku = formSku.trim() || `${computeAutoSku(formName, formCategoryId, formDressStyle, categories)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    setIsSubmitting(true);
    try {
      const payload: any = {
        name: formName.trim(),
        slug: formSlug.trim(),
        category_id: formCategoryId ? Number(formCategoryId) : null,
        product_type: 'physical',
        status: formStatus,
        dress_style: formDressStyle,
        base_price: Number(formBasePrice),
        original_price: formOriginalPrice ? Number(formOriginalPrice) : null,
        sku: effectiveSku,
        description: formDescription.trim(),
        is_featured: formIsFeatured ? 1 : 0,
        is_flash_deal: formIsFlashDeal ? 1 : 0,
        images: formImages
          .filter((img) => img.image_url.trim() !== '')
          .map((img, idx) => ({
            image_url: img.image_url.trim(),
            alt_text: img.alt_text?.trim() || formName.trim(),
            is_primary: idx === 0 ? 1 : img.is_primary ? 1 : 0,
            display_order: idx,
          })),
        variants: formVariants
          .map((v) => ({
            ...(v.id ? { id: v.id, original_stock_quantity: v.original_stock_quantity } : {}),
            sku: v.sku.trim() || `${effectiveSku}-${(v.color_name || 'DEF').replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase()}-${(v.size || 'STD').replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase()}`,
            size: v.size.trim() || 'Standard',
            color_name: v.color_name.trim() || 'Default',
            color_hex: v.color_hex.trim() || '#000000',
            price_override: v.price_override ? Number(v.price_override) : null,
            stock_quantity: Math.max(0, parseInt(v.stock_quantity) || 0),
            low_stock_threshold: Math.max(0, parseInt(v.low_stock_threshold) || 5),
          })),
      };

      if (isEditing && editingProductId) {
        await apiUpdateAdminProduct(editingProductId, payload);
        setToast({ type: 'success', message: 'Product updated successfully.' });
      } else {
        await apiCreateAdminProduct(payload);
        setToast({ type: 'success', message: 'Product created successfully.' });
      }

      setIsModalOpen(false);
      loadProducts();
    } catch (err: any) {
      setToast({
        type: 'error',
        message: err.message || 'Operation failed. Please verify SKU and slug uniqueness.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Inventory Adjustment
  const handleAdjustStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariantId || adjustmentAmount === 0) {
      setToast({ type: 'error', message: 'Please select a variant and a non-zero adjustment amount.' });
      return;
    }

    setStockSubmitting(true);
    try {
      await apiAdjustInventory({
        variant_id: selectedVariantId,
        adjustment: adjustmentAmount,
        reason: adjustmentReason,
        notes: adjustmentNotes.trim() || undefined,
      });

      setToast({
        type: 'success',
        message: `Stock successfully adjusted (${adjustmentAmount > 0 ? '+' : ''}${adjustmentAmount}) with audit record.`,
      });
      setIsStockModalOpen(false);
      loadProducts();
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to adjust stock.' });
    } finally {
      setStockSubmitting(false);
    }
  };

  // Submit Archive Product
  const handleArchiveSubmit = async () => {
    if (!archiveTarget) return;
    try {
      await apiDeleteAdminProduct(archiveTarget.id);
      setToast({ type: 'success', message: `Product "${archiveTarget.name}" archived.` });
      setArchiveTarget(null);
      loadProducts();
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to archive product.' });
    }
  };

  const activeVariant = stockProduct?.variants?.find((v) => v.id === selectedVariantId);
  const projectedStock = activeVariant ? activeVariant.stock_quantity + adjustmentAmount : 0;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Toast Notification */}
      {toast && (
        <div
          role="alert"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 shadow-xl transition-all duration-300 animate-slide-in ${
            toast.type === 'success' ? 'bg-[#1f2937] text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-white shrink-0" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 rounded-lg p-1 text-gray-300 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header and Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1f2937] tracking-tight">Products & Inventory</h2>
          <p className="text-sm text-gray-500">
            Manage catalogue, product variants, inventory audits, and pictures.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadProducts}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            New Product
          </button>
        </div>
      </div>

      {/* Authentication Required In-Line Card */}
      {isAuthError && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md">
              <Lock className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-gray-900">Administrator Authentication Required</h3>
              <p className="mt-1 text-xs text-gray-600 leading-relaxed max-w-2xl">
                Your administrative session is unauthenticated. Please sign in with the store administrator
                account to manage physical products, stock levels, and variants.
              </p>

              {loginErrorMsg && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-100/80 p-2.5 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{loginErrorMsg}</span>
                </div>
              )}

              <form onSubmit={handleAdminLoginSubmit} className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@shop.co"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-black"
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-black"
                />
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow hover:bg-gray-800 disabled:opacity-50"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {isLoggingIn ? 'Signing in...' : 'Sign In as Admin'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, slug..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50/50 py-2 pl-9 pr-3 text-xs text-gray-800 placeholder-gray-400 outline-none focus:border-black focus:bg-white transition"
          />
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-black focus:bg-white transition"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-black focus:bg-white transition"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <select
            value={inventoryFilter}
            onChange={(e) => {
              setInventoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-black focus:bg-white transition"
          >
            <option value="all">All Inventory</option>
            <option value="in_stock">In Stock (&gt; 0)</option>
            <option value="low_stock">Low Stock (≤ threshold)</option>
            <option value="out_of_stock">Out of Stock (0)</option>
          </select>
        </div>
      </div>

      {/* Non-Auth Error Banner */}
      {error && !isAuthError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadProducts}
            className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Products Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8">
            <div className="flex flex-col gap-4 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 last:border-none">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-gray-200 shrink-0" />
                    <div className="flex flex-col gap-2">
                      <div className="h-3.5 w-48 rounded bg-gray-200" />
                      <div className="h-2.5 w-24 rounded bg-gray-100" />
                    </div>
                  </div>
                  <div className="h-4 w-16 rounded bg-gray-200" />
                  <div className="h-4 w-20 rounded bg-gray-200" />
                  <div className="h-4 w-12 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <Package className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-[#1f2937]">No products match criteria</h3>
            <p className="mt-1 text-xs text-gray-500 max-w-sm">
              Try adjusting your search terms or filters, or add a new product to your inventory.
            </p>
            <button
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" />
              Create Product
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50/75 text-gray-500 font-semibold">
                <tr>
                  <th className="py-3 pl-4 pr-3">Product</th>
                  <th className="px-3 py-3">Category / Style</th>
                  <th className="px-3 py-3">Base Price</th>
                  <th className="px-3 py-3">Inventory</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="py-3 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => {
                  const isLow = p.is_low_stock;
                  const isOut = p.total_stock <= 0;

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                      {/* Product Thumbnail + Name */}
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 shrink-0">
                            {p.primary_image ? (
                              <img
                                src={p.primary_image}
                                alt={p.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = '/images/categories/tshirts.webp';
                                }}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-gray-300">
                                <Package className="h-6 w-6" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-gray-900 truncate max-w-[200px]" title={p.name}>
                              {p.name}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-gray-400">
                              <span>SKU: {p.sku}</span>
                              {p.variants_count > 0 && (
                                <>
                                  <span>•</span>
                                  <span>{p.variants_count} variant{p.variants_count > 1 ? 's' : ''}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category & Style */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-gray-700">
                            {p.category_name || 'Uncategorized'}
                          </span>
                          <span className="text-[11px] text-gray-400">{p.dress_style || 'Casual'}</span>
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">{formatPrice(p.base_price)}</span>
                          {p.original_price && p.original_price > p.base_price && (
                            <span className="text-[11px] text-gray-400 line-through">
                              {formatPrice(p.original_price)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Inventory Badge & Quick Adjust */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                              isOut
                                ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                                : isLow
                                ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                            }`}
                          >
                            <span
                              className={`size-1.5 rounded-full shrink-0 ${
                                isOut ? 'bg-rose-600' : isLow ? 'bg-amber-500' : 'bg-emerald-600'
                              }`}
                            />
                            {p.total_stock} in stock
                          </span>
                          <button
                            type="button"
                            onClick={() => openStockModal(p)}
                            title="Adjust inventory with audit trail"
                            className="size-7 inline-flex items-center justify-center rounded-lg border border-neutral-200/80 bg-white hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900 transition-colors shadow-xs"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <select
                          value={p.status}
                          onChange={(e) =>
                            handleStatusChange(p, e.target.value as 'published' | 'draft' | 'archived')
                          }
                          className={`rounded-md border px-2 py-1 text-[11px] font-medium outline-none cursor-pointer transition ${
                            p.status === 'published'
                              ? 'border-emerald-200/80 bg-emerald-50 text-emerald-800'
                              : p.status === 'draft'
                              ? 'border-amber-200/80 bg-amber-50 text-amber-800'
                              : 'border-neutral-200 bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          <option value="published">Published</option>
                          <option value="draft">Draft</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>

                      {/* Actions */}
                      <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            title={`Edit ${p.name} and manage variants`}
                            aria-label="Edit Product"
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-neutral-200/80 bg-white hover:bg-neutral-50 text-xs font-medium text-neutral-700 transition-colors shadow-xs"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchiveTarget(p)}
                            className="size-7 inline-flex items-center justify-center rounded-lg border border-neutral-200/80 bg-white hover:border-red-200 hover:bg-red-50 hover:text-red-600 text-neutral-400 transition-colors shadow-xs"
                            title={`Archive ${p.name}`}
                            aria-label="Archive Product"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination.total > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row">
            <span className="text-xs text-gray-500">
              Showing <span className="font-semibold text-gray-900">{(pagination.page - 1) * pagination.per_page + 1}</span> to{' '}
              <span className="font-semibold text-gray-900">
                {Math.min(pagination.page * pagination.per_page, pagination.total)}
              </span>{' '}
              of <span className="font-semibold text-gray-900">{pagination.total}</span> products
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="px-2 text-xs font-semibold text-gray-600">
                Page {pagination.page} of {pagination.total_pages || 1}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.total_pages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* Product Create / Edit Modal with Image File Upload */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isEditing ? 'Edit Product' : 'Add New Product'}
                </h3>
                <p className="text-xs text-gray-500">
                  Upload pictures, manage variants, pricing, and physical inventory.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleSubmitProduct} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Basic Information</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. Graphic Print Oversized T-Shirt"
                      className={`w-full rounded-lg border px-3 py-2 text-xs outline-none focus:border-black transition ${
                        formErrors.name ? 'border-red-500 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                    {formErrors.name && <p className="mt-1 text-[11px] text-red-500">{formErrors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      URL Slug <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value)}
                      placeholder="e.g. graphic-print-oversized-t-shirt"
                      className={`w-full rounded-lg border px-3 py-2 text-xs outline-none focus:border-black transition ${
                        formErrors.slug ? 'border-red-500 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                    {formErrors.slug && <p className="mt-1 text-[11px] text-red-500">{formErrors.slug}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                    <select
                      value={formCategoryId}
                      onChange={(e) => {
                        const newCat = Number(e.target.value);
                        setFormCategoryId(newCat);
                        if (!isSkuCustomized && !isEditing && formName.trim()) {
                          setFormSku(computeAutoSku(formName, newCat, formDressStyle, categories));
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-black transition"
                    >
                      <option value="">Select Category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Dress Style</label>
                    <select
                      value={formDressStyle}
                      onChange={(e) => {
                        const newStyle = e.target.value;
                        setFormDressStyle(newStyle);
                        if (!isSkuCustomized && !isEditing && formName.trim()) {
                          setFormSku(computeAutoSku(formName, formCategoryId, newStyle, categories));
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-black transition"
                    >
                      {DRESS_STYLES.map((style) => (
                        <option key={style} value={style}>
                          {style}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Product details, fabric, fit, care instructions..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-black transition"
                  />
                </div>
              </div>

              {/* Pricing & SKU */}
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Pricing & Identification</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Base Price (₦) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formBasePrice}
                      onChange={(e) => setFormBasePrice(e.target.value)}
                      placeholder="14500"
                      className={`w-full rounded-lg border px-3 py-2 text-xs outline-none focus:border-black transition ${
                        formErrors.base_price ? 'border-red-500 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                    {formErrors.base_price && (
                      <p className="mt-1 text-[11px] text-red-500">{formErrors.base_price}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Original Price (₦ - Strikethrough)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formOriginalPrice}
                      onChange={(e) => setFormOriginalPrice(e.target.value)}
                      placeholder="18000"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-black transition"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-gray-700">
                        Product SKU <span className="text-[10px] text-gray-400 font-normal">(Auto-generated)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const auto = `${computeAutoSku(formName, formCategoryId, formDressStyle, categories)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                          setFormSku(auto);
                          setIsSkuCustomized(true);
                        }}
                        className="text-[10px] text-blue-600 hover:text-blue-800 font-medium underline"
                      >
                        Regenerate
                      </button>
                    </div>
                    <input
                      type="text"
                      value={formSku}
                      onChange={(e) => {
                        setFormSku(e.target.value);
                        setIsSkuCustomized(true);
                      }}
                      placeholder="e.g. TSH-GRAPHIC-8B3"
                      className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-xs outline-none focus:border-black focus:bg-white transition"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={formIsFeatured}
                      onChange={(e) => setFormIsFeatured(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                    />
                    Featured on Storefront
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={formIsFlashDeal}
                      onChange={(e) => setFormIsFlashDeal(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                    />
                    Flash Deal Spotlight
                  </label>

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs font-medium text-gray-700">Status:</span>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-black"
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft (Unpublished)</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Product Pictures: File Upload + Links */}
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Product Pictures ({formImages.filter((img) => img.image_url.trim() !== '').length})
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Upload photos directly from your device or paste existing image links.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Hidden Native File Input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                      multiple
                      className="hidden"
                      onChange={handleImageUpload}
                    />

                    {/* Upload from Device Button */}
                    <button
                      type="button"
                      disabled={isUploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-gray-800 disabled:opacity-50 transition"
                    >
                      <Upload className={`h-3.5 w-3.5 ${isUploadingImage ? 'animate-bounce' : ''}`} />
                      {isUploadingImage ? 'Uploading...' : 'Upload Photos from Computer'}
                    </button>

                    {/* Add URL Link Button */}
                    <button
                      type="button"
                      onClick={() =>
                        setFormImages([
                          ...formImages,
                          {
                            image_url: '',
                            alt_text: '',
                            is_primary: formImages.filter((i) => i.image_url.trim() !== '').length === 0,
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Link
                    </button>
                  </div>
                </div>

                {/* Uploaded Photos Gallery Preview Grid */}
                {formImages.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {formImages.map((img, idx) => (
                      <div
                        key={idx}
                        className={`group relative flex flex-col overflow-hidden rounded-xl border bg-gray-50 p-2 transition ${
                          img.is_primary ? 'border-black ring-2 ring-black/10' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {/* Image Preview Box */}
                        <div className="relative h-28 w-full overflow-hidden rounded-lg bg-white border border-gray-100 flex items-center justify-center">
                          {img.image_url ? (
                            <img
                              src={img.image_url}
                              alt={img.alt_text || 'Product image'}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = '/images/categories/tshirts.webp';
                              }}
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-gray-300">
                              <ImageIcon className="h-6 w-6" />
                              <span className="text-[10px]">Empty URL</span>
                            </div>
                          )}

                          {img.is_primary && (
                            <span className="absolute left-2 top-2 rounded bg-black px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
                              Primary
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => setFormImages(formImages.filter((_, i) => i !== idx))}
                            className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-gray-500 shadow hover:bg-red-50 hover:text-red-600 transition"
                            title="Remove picture"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* URL input field */}
                        <input
                          type="text"
                          value={img.image_url}
                          onChange={(e) => {
                            const updated = [...formImages];
                            updated[idx].image_url = e.target.value;
                            setFormImages(updated);
                          }}
                          placeholder="/images/... or https://"
                          className="mt-2 w-full rounded border border-gray-200 bg-white px-2 py-1 text-[10px] outline-none focus:border-black"
                        />

                        {/* Set Primary Toggle */}
                        <div className="mt-1.5 flex items-center justify-between">
                          <label className="flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer">
                            <input
                              type="radio"
                              name="primary_image_radio"
                              checked={img.is_primary}
                              onChange={() => {
                                const updated = formImages.map((item, i) => ({
                                  ...item,
                                  is_primary: i === idx,
                                }));
                                setFormImages(updated);
                              }}
                              className="h-3 w-3"
                            />
                            <span>Set as primary</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Variants (Size & Color & Stock) */}
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Variants & Initial Stock ({formVariants.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      setFormVariants([
                        ...formVariants,
                        {
                          sku: '',
                          size: 'Medium',
                          color_name: 'Black',
                          color_hex: '#000000',
                          price_override: '',
                          stock_quantity: '10',
                          low_stock_threshold: '5',
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Variant
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2">Variant SKU</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Color Name</th>
                        <th className="px-3 py-2">Color Hex</th>
                        <th className="px-3 py-2">Price Override (₦)</th>
                        <th className="px-3 py-2">Stock</th>
                        <th className="px-3 py-2">Low-Stock Alert</th>
                        <th className="px-2 py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {formVariants.map((v, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="p-2">
                            <input
                              type="text"
                              value={v.sku}
                              onChange={(e) => {
                                const up = [...formVariants];
                                up[idx].sku = e.target.value;
                                setFormVariants(up);
                              }}
                              placeholder={`${formSku || 'SKU'}-${(v.color_name || 'DEF').replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase()}-${(v.size || 'STD').replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase()}`}
                              className="w-32 rounded border border-gray-200 bg-gray-50/50 px-2 py-1 text-xs outline-none focus:border-black focus:bg-white placeholder-gray-400"
                              title="Variant SKU (auto-generated if left blank)"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={v.size}
                              onChange={(e) => {
                                const up = [...formVariants];
                                up[idx].size = e.target.value;
                                setFormVariants(up);
                              }}
                              className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-black"
                            >
                              {STANDARD_SIZES.map((sz) => (
                                <option key={sz} value={sz}>
                                  {sz}
                                </option>
                              ))}
                              <option value="One Size">One Size</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={v.color_name}
                              onChange={(e) => {
                                const up = [...formVariants];
                                up[idx].color_name = e.target.value;
                                setFormVariants(up);
                              }}
                              placeholder="Navy"
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-black"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="color"
                                value={v.color_hex}
                                onChange={(e) => {
                                  const up = [...formVariants];
                                  up[idx].color_hex = e.target.value;
                                  setFormVariants(up);
                                }}
                                className="h-6 w-6 rounded border-none cursor-pointer"
                              />
                              <span className="text-[10px] font-mono text-gray-500">{v.color_hex}</span>
                            </div>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={v.price_override}
                              onChange={(e) => {
                                const up = [...formVariants];
                                up[idx].price_override = e.target.value;
                                setFormVariants(up);
                              }}
                              placeholder="Optional"
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-black"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={v.stock_quantity}
                              onChange={(e) => {
                                const up = [...formVariants];
                                up[idx].stock_quantity = e.target.value;
                                setFormVariants(up);
                              }}
                              className="w-16 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-black font-semibold"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={v.low_stock_threshold}
                              onChange={(e) => {
                                const up = [...formVariants];
                                up[idx].low_stock_threshold = e.target.value;
                                setFormVariants(up);
                              }}
                              className="w-14 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-black"
                            />
                          </td>
                          <td className="p-2 text-right">
                            {formVariants.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setFormVariants(formVariants.filter((_, i) => i !== idx))}
                                className="rounded p-1 text-gray-400 hover:text-red-500"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>



              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-semibold text-white shadow hover:bg-gray-800 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {isEditing ? 'Save Product Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Inventory Adjustment Modal */}
      {/* ========================================================================= */}
      {isStockModalOpen && stockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade">
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Adjust Inventory</h3>
                <p className="text-xs text-gray-500">{stockProduct.name}</p>
              </div>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustStockSubmit} className="mt-4 space-y-4">
              {/* Variant Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Select Variant</label>
                <select
                  value={selectedVariantId || ''}
                  onChange={(e) => setSelectedVariantId(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-black"
                >
                  {stockProduct.variants?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku} ({v.size} / {v.color_name}) — Current: {v.stock_quantity}
                    </option>
                  ))}
                </select>
              </div>

              {/* Current vs Projected Stock Preview */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                <div>
                  <span className="block text-[11px] text-gray-400">Current Stock</span>
                  <span className="text-base font-bold text-gray-900">{activeVariant?.stock_quantity ?? 0}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-gray-400">Projected Stock</span>
                  <span
                    className={`text-base font-bold ${
                      projectedStock < 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {projectedStock}
                  </span>
                </div>
              </div>

              {/* Adjustment Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Stock Change (+ for restock, - for reduction)
                </label>
                <input
                  type="number"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(parseInt(e.target.value) || 0)}
                  placeholder="+10 or -5"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold outline-none focus:border-black"
                />
              </div>

              {/* Reason Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Adjustment Reason</label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-black"
                >
                  <option value="restock">Restock (Supplier Delivery)</option>
                  <option value="damage">Damaged / Written Off</option>
                  <option value="return">Customer Return</option>
                  <option value="audit_reconciliation">Inventory Audit Reconciliation</option>
                  <option value="manual_adjustment">Manual Correction</option>
                </select>
              </div>

              {/* Internal Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Internal Notes / PO Number (Optional)
                </label>
                <input
                  type="text"
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                  placeholder="e.g. PO-98124, warehouse count"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={stockSubmitting || adjustmentAmount === 0 || projectedStock < 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-gray-800 disabled:opacity-40"
                >
                  {stockSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Archive Confirmation Modal */}
      {/* ========================================================================= */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade">
          <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 mx-auto">
              <Archive className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-center text-sm font-bold text-gray-900">Archive Product?</h3>
            <p className="mt-1 text-center text-xs text-gray-500">
              Are you sure you want to archive <strong className="text-gray-800">{archiveTarget.name}</strong>? It will no longer appear on the public storefront.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setArchiveTarget(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchiveSubmit}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-700"
              >
                Archive Product
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
