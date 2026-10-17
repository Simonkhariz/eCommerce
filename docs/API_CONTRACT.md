# Shop.co REST API — Contract Specification

> **Version:** 1.0.0  
> **Backend Architecture:** Native PHP 8.2+ with MySQLi  
> **Database:** Local MySQL (XAMPP `shopco_dev`)  
> **Target Currency:** `NGN` (Nigerian Naira `₦`)  
> **Gateway:** Kora (Korapay) Sandbox  

---

## 1. General Principles & Transport

1. **Protocol & Format**: All requests and responses use JSON (`Content-Type: application/json; charset=utf-8`).
2. **Base URL**:
   - Local Development (PHP built-in): `http://localhost:8000/api/v1`
   - Local XAMPP VirtualHost: `http://shop-api.local/api/v1`
   - Configured via frontend environment variable: `NEXT_PUBLIC_API_BASE_URL`.
3. **CORS Protocol**:
   - Strict origin allowlist matching `CORS_ALLOWED_ORIGINS` (default: `http://localhost:3000`).
   - Credentials mode supported (`Access-Control-Allow-Credentials: true`).
   - Browser preflight `OPTIONS` requests receive `204 No Content`.
4. **Mutating Request Validation**:
   - `POST`, `PUT`, `PATCH` requests containing a payload body MUST include the header `Content-Type: application/json`.
   - Omitting this header produces `415 Unsupported Media Type`.
   - Syntactically invalid JSON produces `400 Bad Request` with code `INVALID_JSON`.

---

## 2. Standard Response Envelopes

### 2.1 Success Response Envelope
All successful API responses return HTTP status `200` (or `201` for creation) with the following structure:

```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": { ... },
  "meta": {
    "timestamp": 1792080681,
    "page": 1,
    "per_page": 20,
    "total": 150
  }
}
```

- `success`: Always boolean `true`.
- `message`: User-friendly descriptive summary string.
- `data`: Primary payload (object, array of objects, or null).
- `meta`: Optional pagination, filtering metadata, or execution metrics.

### 2.2 Error Response Envelope
All client or server errors return an appropriate HTTP status code (`400`, `401`, `403`, `404`, `405`, `415`, `422`, `500`) with this structure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The provided delivery location is outside our current coverage zone.",
    "details": {
      "state": "Selected state is not currently served."
    }
  }
}
```

- `success`: Always boolean `false`.
- `error.code`: Machine-readable, uppercase token.
- `error.message`: Human-readable explanation.
- `error.details`: Optional field-level validation errors or context.
- **Security Rule**: Errors NEVER disclose raw SQL syntax, database server credentials, filesystem paths, or internal stack traces.

---

## 3. Standard Error Codes & Status Mapping

| HTTP Status | Error Code (`error.code`) | Description / Trigger Scenario |
| :--- | :--- | :--- |
| `400 Bad Request` | `BAD_REQUEST` | Malformed parameters or invalid payload structure. |
| `400 Bad Request` | `INVALID_JSON` | Body could not be parsed as valid JSON. |
| `401 Unauthorized` | `UNAUTHENTICATED` | Missing or expired customer/admin session token. |
| `403 Forbidden` | `ACCESS_DENIED` | Authenticated customer attempting to view another user's order or access admin route. |
| `404 Not Found` | `ROUTE_NOT_FOUND` | The requested endpoint URI does not exist. |
| `404 Not Found` | `RESOURCE_NOT_FOUND` | Product, order, or category ID was not found in the database. |
| `405 Method Not Allowed` | `METHOD_NOT_ALLOWED` | HTTP verb not permitted for route (e.g. `POST` to a `GET` endpoint). |
| `415 Unsupported Media` | `UNSUPPORTED_MEDIA_TYPE` | Missing `Content-Type: application/json` on mutating request. |
| `422 Unprocessable Entity`| `VALIDATION_ERROR` | Request syntax is valid, but fails business rules (e.g. negative quantity, invalid email). |
| `422 Unprocessable Entity`| `OUT_OF_STOCK` | Product variant inventory is insufficient to satisfy requested quantity. |
| `422 Unprocessable Entity`| `UNSERVED_LOCATION` | Shipping address does not match any configured delivery zone. |
| `500 Internal Error` | `INTERNAL_SERVER_ERROR` | Unhandled database or runtime exception (logged internally, redacted externally). |
| `503 Service Unavailable`| `SERVICE_UNAVAILABLE` | Database is unreachable or external payment gateway timeout. |

---

## 4. Implemented Endpoint Specification

### `GET /api/v1/health`
Checks the operational health of the REST API, PHP runtime, store origin configuration, and MySQL connectivity.

- **Method**: `GET`
- **Authentication**: None (Public)
- **Response**:
```json
{
  "success": true,
  "message": "System is fully operational.",
  "data": {
    "status": "healthy",
    "service": "Shop.co REST API",
    "version": "1.0.0",
    "environment": "development",
    "timestamp": 1792080681,
    "php_version": "8.2.12",
    "store": {
      "currency": "NGN",
      "origin": { "city": "Enugu", "state": "Enugu" }
    },
    "database": {
      "connected": true,
      "database": "shopco_dev",
      "latency_ms": 3.26
    }
  }
}
```

---

### `GET /api/v1/products`
Returns filterable, searchable, and paginated published products.

- **Method**: `GET`
- **Authentication**: None (Public)
- **Query Parameters**:
  - `category` (string, optional): Category slug or ID (e.g. `t-shirts`).
  - `search` / `q` (string, optional): Keyword search across product name, description, dress style.
  - `min_price` (numeric, optional): Minimum price in NGN.
  - `max_price` (numeric, optional): Maximum price in NGN.
  - `dress_style` / `style` (string, optional): e.g. `Casual`, `Formal`, `Party`, `Gym`.
  - `product_type` (string, optional): `physical` (physical products only).
  - `sort` (string, optional): `newest` (default), `price_asc`, `price_desc`, `rating`, `popular`.
  - `page` (integer, optional): Page number (default: `1`).
  - `per_page` / `limit` (integer, optional): Items per page (default: `12`, max: `100`).

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Products retrieved successfully.",
  "data": [
    {
      "id": 1,
      "uuid": "prod-uuid-001",
      "name": "Gradient Graphic T-shirt",
      "slug": "gradient-graphic-tshirt",
      "description": "This graphic t-shirt is perfect for any casual occasion.",
      "product_type": "physical",
      "base_price": 14500.0,
      "original_price": 24200.0,
      "currency": "NGN",
      "sku": "SKU-TSHIRT-GRAD",
      "rating_avg": 4.5,
      "rating_count": 42,
      "is_featured": true,
      "is_flash_deal": true,
      "dress_style": "Casual",
      "category_id": 1,
      "category_name": "T-Shirts",
      "category_slug": "t-shirts",
      "primary_image": "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=80",
      "total_stock": 70,
      "in_stock": true,
      "discount_percent": 40
    }
  ],
  "meta": {
    "total": 4,
    "page": 1,
    "per_page": 12,
    "total_pages": 1
  }
}
```

---

### `GET /api/v1/products/{idOrSlug}`
Fetches full details for a single published product, including full image galleries, variant inventory, and color/size options.

- **Method**: `GET`
- **Authentication**: None (Public)
- **Path Parameters**: `idOrSlug` — Product ID, UUID, or URL slug (e.g. `gradient-graphic-tshirt` or `1`).

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Product details retrieved successfully.",
  "data": {
    "id": 1,
    "uuid": "prod-uuid-001",
    "name": "Gradient Graphic T-shirt",
    "slug": "gradient-graphic-tshirt",
    "description": "Crafted from 100% breathable heavyweight cotton.",
    "product_type": "physical",
    "base_price": 14500.0,
    "original_price": 24200.0,
    "currency": "NGN",
    "sku": "SKU-TSHIRT-GRAD",
    "rating_avg": 4.5,
    "rating_count": 42,
    "dress_style": "Casual",
    "category_name": "T-Shirts",
    "category_slug": "t-shirts",
    "images": [
      {
        "id": 1,
        "image_url": "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=80",
        "alt_text": "Gradient Graphic T-shirt Front",
        "is_primary": 1
      }
    ],
    "variants": [
      {
        "id": 1,
        "sku": "SKU-TSHIRT-GRAD-M-WHT",
        "size": "Medium",
        "color_name": "White",
        "color_hex": "#FFFFFF",
        "price_override": null,
        "stock_quantity": 25,
        "in_stock": true
      }
    ],
    "available_colors": [
      { "name": "White", "hex": "#FFFFFF" }
    ],
    "available_sizes": ["Medium", "Large", "X-Large"]
  }
}
```

---

### `GET /api/v1/categories`
Lists all active categories with product counts.

- **Method**: `GET`
- **Authentication**: None (Public)

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Categories retrieved successfully.",
  "data": [
    {
      "id": 1,
      "name": "T-Shirts",
      "slug": "t-shirts",
      "description": "Casual streetwear and premium graphic tees.",
      "image_url": "/images/products/tshirts.jpg",
      "display_order": 1,
      "product_count": 1
    }
  ]
}
```

---

### `GET /api/v1/storefront/homepage`
Consolidated payload for instant, sub-50ms homepage hydration.

- **Method**: `GET`
- **Authentication**: None (Public)

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Storefront homepage payload retrieved successfully.",
  "data": {
    "featured_products": [ ... ],
    "flash_deals": [ ... ],
    "new_arrivals": [ ... ],
    "top_selling": [ ... ],
    "categories": [ ... ],
    "promotions": [
      {
        "code": "SHOP20",
        "description": "20% off for verified new customers",
        "discount_percent": 20
      }
    ],
    "banners": [ ... ]
  }
}
```

---

### `POST /api/v1/admin/products`
Protected admin endpoint to create a new physical product with variants and images.

- **Method**: `POST`
- **Headers**:
  - `Content-Type: application/json`
  - `X-CSRF-Token: <csrf_token from the admin login or /auth/me?scope=admin response>`
  - Cookie: `shopco_admin` (HTTP-only admin session cookie set by `POST /auth/login`; never readable by JavaScript)
- **Request Body**:
```json
{
  "name": "Heavyweight Vintage Hoodie",
  "slug": "heavyweight-vintage-hoodie",
  "category_id": 4,
  "description": "450gsm brushed cotton fleece.",
  "product_type": "physical",
  "status": "published",
  "base_price": 32000.0,
  "original_price": 40000.0,
  "currency": "NGN",
  "sku": "SKU-HOODIE-VINTAGE",
  "dress_style": "Casual",
  "variants": [
    {
      "sku": "SKU-HOODIE-VINTAGE-L-BLK",
      "size": "Large",
      "color_name": "Washed Black",
      "color_hex": "#1F2937",
      "stock_quantity": 20
    }
  ],
  "images": [
    {
      "image_url": "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80",
      "is_primary": 1
    }
  ]
}
```

#### Success Response (`201 Created`):
```json
{
  "success": true,
  "message": "Product created successfully.",
  "data": {
    "id": 5,
    "name": "Heavyweight Vintage Hoodie",
    "base_price": 32000.0,
    "status": "published"
  }
}
```

---

### `PUT /api/v1/admin/products/{id}` & `DELETE /api/v1/admin/products/{id}`
- `PUT`: Updates product details (`200 OK`).
- `DELETE`: Archives product (`status = 'archived'`) (`200 OK`). Protected behind `AdminAuthMiddleware`.

---

## 5. First-Run Admin Onboarding & Store Origin Specification (Step 6)

### `GET /api/v1/setup/status`
Checks whether initial administrator onboarding has completed and returns public origin details.
- **Access**: Public
- **Response**:
```json
{
  "success": true,
  "message": "Store setup status retrieved.",
  "data": {
    "is_setup_completed": true,
    "store_name": "SHOP.CO",
    "store_origin": {
      "city": "Enugu",
      "state": "Enugu",
      "address": "12 Okpara Avenue, Independence Layout, Enugu, Nigeria"
    },
    "contact_email": "support@shop.co"
  }
}
```

### `POST /api/v1/setup`
One-time protected setup endpoint. Captures initial administrator credentials and origin settings. Once completed or if an admin already exists, permanently returns `403 Forbidden` (`SETUP_ALREADY_COMPLETED`).
- **Reset procedure**: CLI only via `php backend/migrations/reset_admin_setup.php --confirm`.
- **Payload**:
```json
{
  "name": "Achmad Hakim",
  "email": "admin@example.com",
  "password": "SecurePassword123!",
  "store_name": "SHOP.CO",
  "origin_city": "Enugu",
  "origin_state": "Enugu",
  "origin_address": "12 Okpara Avenue, Independence Layout, Enugu, Nigeria",
  "contact_email": "support@shop.co",
  "contact_phone": "+234 803 000 0000"
}
```

---

## 6. Authentication & Session Specification (Step 6)

### `POST /api/v1/auth/register`
Customer registration with `password_hash` (Bcrypt cost 12).
- **Security Rule**: Public registration CANNOT set role; role is strictly forced to `'customer'`.
- Sets secure `HttpOnly`, `SameSite=Lax` cookie `shopco_session` and returns session details.

### `POST /api/v1/auth/login`
Password authentication with brute-force rate limiting (max 5 failed attempts per 15 minutes -> `429 Too Many Requests`).
- Rotates session ID upon login.
- Sets secure `HttpOnly`, `SameSite=Lax` cookie `shopco_session`.

### `POST /api/v1/auth/logout`
Destroys database session and expires `shopco_session` cookie.

### `GET /api/v1/auth/me`
Retrieves the currently authenticated user profile and session CSRF token.
- Returns `401 Unauthenticated` if session is missing or expired.

### `POST /api/v1/auth/customer/magic-link`
Requests passwordless sign-in link. Creates or links lightweight customer profile, stores single-use token in `email_verification_tokens`, and logs to `email_outbox`.

### `POST /api/v1/auth/customer/verify`
Verifies magic link token, sets `email_verified_at`, rotates session, and issues session cookie.

---

## 7. Customer Profile, Address Book & Cart Merging (Step 6)

- `GET /api/v1/customer/profile`: Read customer profile.
- `PUT /api/v1/customer/profile`: Update `full_name`, `phone`.
- `GET /api/v1/customer/addresses`: List customer's saved delivery addresses (strictly isolated to authenticated user ID).
- `POST /api/v1/customer/addresses`: Add new delivery address.
- `PUT /api/v1/customer/addresses/{id}`: Update address.
- `DELETE /api/v1/customer/addresses/{id}`: Delete address.
- `POST /api/v1/customer/addresses/{id}/default`: Set default address.
- `POST /api/v1/cart/merge`: Merges guest cart items into customer's database cart upon sign-in.
- `POST /api/v1/wishlist/merge`: Merges guest wishlist items into customer's database wishlist.

---

## 8. Admin Destination Shipping Zones Specification (Step 6)

Configures destination zones and explicit shipping fees originating from the Enugu store origin.
- `GET /api/v1/admin/shipping-zones`: Lists all destination zones and fees.
- `GET /api/v1/admin/shipping-zones/{id}`: Zone details.
- `POST /api/v1/admin/shipping-zones`: Create new shipping zone.
- `PUT /api/v1/admin/shipping-zones/{id}`: Update zone rates and states.

---

## 9. Upcoming Endpoint Families Roadmap

```
Family                 Endpoints                                          Target Step
───────────────────────────────────────────────────────────────────────────────────────
Checkout & Shipping    POST /api/v1/checkout/quote                        Step 8
                       POST /api/v1/checkout/orders                       Step 8
                       GET  /api/v1/shipping/zones                        Step 8

Kora Payments          POST /api/v1/checkout/initialize-payment           Step 9
                       POST /api/v1/payments/kora/webhook                 Step 10
                       GET  /api/v1/payments/verify/{reference}           Step 10

Orders (Customer)      GET  /api/v1/me/orders                             Step 11
                       GET  /api/v1/me/orders/{orderNumber}               Step 11

Fulfilment & Delivery  GET  /api/v1/downloads/{downloadToken}             Step 12
                       PATCH /api/v1/admin/orders/{id}/shipment           Step 12

Admin Analytics        GET  /api/v1/admin/analytics/overview              Step 13 & 15
                       GET  /api/v1/admin/audit-logs                      Step 15
```
