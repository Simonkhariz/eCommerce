# Master Next.js Prompt Playbook: E-Commerce Multi-Page Prototyping

This document organizes the **10 unarranged design mockups** in [E-commerce](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce) into a structured user flow and provides the **customized Next.js master prompts** to build the multi-page e-commerce web application.

---

## 🗺️ Design Inventory & Screen Flow Architecture

The `E-commerce` folder contains paired **Desktop (5760px)** and **Mobile (1560px)** screen mockups. We organize them into a seamless 5-stage interactive user journey:

```mermaid
graph TD
    A["🏠 Stage 1: Homepage<br/>Desktop: Homepage-1.png<br/>Mobile: Homepage.png"] -->|Click Category / Browse| B["🛍️ Stage 2: Category Catalog<br/>Desktop: Category Page-1.png<br/>Mobile: Category Page.png"]
    B -->|Click Filter Button (Mobile)| C["⚙️ Stage 2B: Mobile Filters Drawer<br/>Mobile: Filters.png"]
    B -->|Select Product Card| D["🔍 Stage 3: Product Detail Page (PDP)<br/>Desktop: Product Detail Page-1.png<br/>Mobile: Product Detail Page.png"]
    D -->|Add to Cart / View Cart| E["🛒 Stage 4: Shopping Cart Page<br/>Desktop: Cart-1.png<br/>Mobile: Cart.png"]
    E -->|Proceed to Checkout| F["💳 Stage 5: Checkout Flow Modal"]
```

### Screen Pairing & Routing Reference:

| Page / Route | Desktop Screen File | Mobile Screen File | Key UI Elements & Layout |
| :--- | :--- | :--- | :--- |
| **Home** (`/`) | [Homepage-1.png](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce/design/Homepage-1.png) | [Homepage.png](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce/design/Homepage.png) | Hero promo carousel, Category icon grid, Flash Deals countdown, Curated Collections, Value props banner, Footer. |
| **Catalog** (`/category`) | [Category Page-1.png](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce/design/Category%20Page-1.png) | [Category Page.png](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce/design/Category%20Page.png) | Hero category banner, Sorting dropdown (`Price`, `Rating`, `Newest`), Desktop Left Filter Sidebar, 3-4 Col Product Grid, Mobile Sticky Filter Bar. |
| **Filter Modal** (`/category#filters`) | *(Embedded in Sidebar)* | [Filters.png](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce/design/Filters.png) | Mobile bottom-sheet / slide-over drawer: Price range slider, Brand checkboxes, Color swatches, Rating pills, Apply button. |
| **Product Detail** (`/products/[id]`) | [Product Detail Page-1.png](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce/design/Product%20Detail%20Page-1.png) | [Product Detail Page.png](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce/design/Product%20Detail%20Page.png) | Multi-thumbnail image gallery, Size & Color chips, Stock counter, Add to Cart / Buy Now buttons, Product specs accordion, Customer Reviews list, Related items. |
| **Cart** (`/cart`) | [Cart-1.png](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce/design/Cart-1.png) | [Cart.png](file:///C:/Users/smnkh/Desktop/E-templates/E-commerce/design/Cart.png) | Line item cards (quantity +/- and delete), Promo code input, Order Summary box (Subtotal, Shipping, Discount, Total), Sticky Mobile Checkout Bar. |

---

## 🚀 Option 1: The Master "All-in-One" Next.js Mega-Prompt for E-Commerce

Use this prompt to build the entire multi-page Next.js e-commerce application from the `E-commerce` folder:

```markdown
You are a Lead Frontend Engineer building a multi-page e-commerce web application using Next.js (App Router), TypeScript, and Tailwind CSS.
Convert the design screens located in `E-commerce/` into a fully responsive, interactive web application.

### DESIGN SCREEN MAPPING
The folder contains both Desktop (`*-1.png`) and Mobile (`*.png`) designs. You must implement the exact responsive layout for each route:
1. **Home (`app/page.tsx`)**: Matches `Homepage-1.png` (Desktop) and `Homepage.png` (Mobile).
2. **Category / Catalog (`app/category/page.tsx`)**: Matches `Category Page-1.png` (Desktop Sidebar) and `Category Page.png` (Mobile Grid).
3. **Mobile Filters Drawer (`components/catalog/FilterDrawer.tsx`)**: Matches `Filters.png`.
4. **Product Detail (`app/products/[id]/page.tsx`)**: Matches `Product Detail Page-1.png` (Desktop) and `Product Detail Page.png` (Mobile PDP).
5. **Cart (`app/cart/page.tsx`)**: Matches `Cart-1.png` (Desktop Summary) and `Cart.png` (Mobile Summary).

### TECH STACK & ARCHITECTURE
- **Framework**: Next.js 14/15 App Router (`app/`)
- **Language**: TypeScript (Strict typing for `Product`, `Category`, `CartItem`, `FilterState`)
- **Styling**: Tailwind CSS (extract exact design tokens: Primary brand color, dark neutrals, pill badges)
- **Icons**: Lucide React (`lucide-react`) or better recent icon library.
- **State**: React Context (`CartContext`) for global cart items, count, quantities, and subtotal
- **Images**: `next/image` with curated high-resolution photography from Unsplash CDN (NO low-res dummy images or clipped crops)

### PROJECT DIRECTORY STRUCTURE
```
├── app/
│   ├── layout.tsx                  # Root layout: Header, Footer, CartProvider, Toast
│   ├── page.tsx                    # Homepage (Hero, Categories, Flash Deals, Collections)
│   ├── category/
│   │   └── page.tsx                # Catalog page (Search, Sort, Sidebar Filters, Product Grid)
│   ├── products/
│   │   └── [id]/
│   │       └── page.tsx            # Dynamic PDP (Gallery, Variants, Specs, Add to Cart)
│   └── cart/
│       └── page.tsx                # Full Cart Page (Line items, Promo code, Order Summary)
├── components/
│   ├── layout/
│   │   ├── Header.tsx              # Top bar, search input, category nav, cart badge
│   │   ├── Footer.tsx              # Responsive footer with newsletter signup
│   │   └── MobileNav.tsx           # Sticky bottom navigation bar for mobile
│   ├── home/
│   │   ├── HeroBanner.tsx          # Promotional carousel/grid
│   │   ├── CategoryGrid.tsx        # Icon/image category cards
│   │   └── FlashDeals.tsx          # Discounted product slider with countdown timer
│   ├── catalog/
│   │   ├── FilterSidebar.tsx       # Desktop filter panel (Price, Brand, Size, Color)
│   │   ├── FilterDrawer.tsx        # Mobile slide-over drawer matching Filters.png
│   │   └── ProductGrid.tsx         # Responsive 2-col (mobile) / 4-col (desktop) grid
│   ├── product/
│   │   ├── ImageGallery.tsx        # Multi-angle preview with thumbnail selector
│   │   ├── VariantSelector.tsx     # Size buttons, color swatches, quantity stepper
│   │   └── ReviewList.tsx          # Customer ratings & feedback
│   └── cart/
│       ├── CartItemList.tsx        # Editable line items (Qty stepper, delete)
│       └── OrderSummary.tsx        # Subtotal, shipping, promo code, checkout button
├── context/
│   └── CartContext.tsx             # Global cart state & actions
├── data/
│   └── mockData.ts                 # Full typed catalog with rich specs & high-res Unsplash images
├── types/
│   └── index.ts                    # TypeScript interfaces
└── public/images/                  # Curated visual assets
```

### CRITICAL REQUIREMENTS & DELIGHTERS
1. **Curated High-Resolution Photography**: Use high-res fashion, electronics, and lifestyle product photography from Unsplash (clean studio backgrounds).
2. **Interactive Flows**:
   - Filter products in real time by price, category, color, and rating.
   - Dynamic variant selection (clicking color/size updates the active choice).
   - "Add to Cart" increments the header badge, shows a floating toast notification, and updates the cart calculation.
   - Full cart management on `/cart` with coupon code validation (e.g. `PANTO10` for 10% off).
3. **Responsive Parity**: Ensure mobile views match `Homepage.png`, `Category Page.png`, `Filters.png`, `Product Detail Page.png`, and `Cart.png` pixel-for-pixel with touch-friendly controls.

Proceed step-by-step: set up routes and types, source the high-res assets, build the modular components for each screen, wire up the cart and filter state, and verify with `npm run build`.
```

---

## 🛠️ Option 2: Step-by-Step Multi-Turn Next.js Sequence for E-Commerce

If executing turn-by-turn:

### 🔹 Turn 1: Project Setup, Types & Multi-Route Architecture
```markdown
Initialize the Next.js App Router structure for the E-Commerce project:
1. Configure `package.json`, `tailwind.config.ts`, and `types/index.ts`.
2. Define strict TypeScript models for `Product`, `Category`, `FilterOptions`, `CartItem`, and `Review`.
3. Set up routes: `/` (Home), `/category` (Catalog), `/products/[id]` (PDP), and `/cart` (Cart).
```

### 🔹 Turn 2: Mock Catalog Data & High-Res Sourcing
```markdown
1. Create `data/mockData.ts` with 12+ realistic products across multiple categories (e.g. Apparel, Electronics, Footwear, Accessories).
2. Sourcing curated high-res Unsplash CDN images for each product, hero banner, and category icon.
3. Build `context/CartContext.tsx` managing cart items, quantities, add/remove functions, and coupon calculations.
```

### 🔹 Turn 3: Homepage (`Homepage-1.png` & `Homepage.png`)
```markdown
Build `app/page.tsx` and its components:
1. `Header.tsx`: Search bar with instant autocomplete, category dropdowns, wishlist, and cart counter.
2. `HeroBanner.tsx`: Hero promotion matching `Homepage-1.png` / `Homepage.png`.
3. `CategoryGrid.tsx`: Visual category links.
4. `FlashDeals.tsx`: Product cards with discount badges, star ratings, and quick add buttons.
5. `Footer.tsx`: Multi-column footer.
```

### 🔹 Turn 4: Category Page & Mobile Filters (`Category Page-1.png`, `Category Page.png`, `Filters.png`)
```markdown
Build `app/category/page.tsx`:
1. `FilterSidebar.tsx`: Desktop sticky left filter sidebar (price range slider, category checkboxes, color swatches).
2. `FilterDrawer.tsx`: Mobile filter modal matching `Filters.png` with bottom apply/reset actions.
3. `ProductGrid.tsx`: Responsive product cards with sorting controls (Low to High, High to Low, Top Rated).
```

### 🔹 Turn 5: Product Detail Page (`Product Detail Page-1.png` & `Product Detail Page.png`)
```markdown
Build `app/products/[id]/page.tsx`:
1. `ImageGallery.tsx`: Interactive multi-image gallery with thumbnail selection and zoom.
2. `VariantSelector.tsx`: Color swatches, size buttons (S, M, L, XL), quantity increment/decrement.
3. Sticky mobile bottom bar with "Add to Cart" and "Buy Now" buttons.
4. Product specifications accordion and customer reviews section.
```

### 🔹 Turn 6: Shopping Cart Page (`Cart-1.png` & `Cart.png`) & Verification
```markdown
Build `app/cart/page.tsx`:
1. Line-item list with thumbnail, variant details, quantity adjustment, and removal button.
2. `OrderSummary.tsx`: Subtotal, shipping calculation, promo code input, and checkout CTA.
3. Run `npm run build` / type-check to ensure zero errors across all 4 routes.
```
