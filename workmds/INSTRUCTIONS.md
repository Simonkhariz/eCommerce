## Instructions

Use this document with the existing e-commerce project folder. Run **one prompt at a time**. After each step, inspect changes, run checks and manually test before proceeding. The goal is a functional development/demo store with real database operations and Kora sandbox payments, not a static prototype.

Global requirements:
- Preserve the existing Next.js 14 App Router UI and components where practical.
- Frontend: Next.js, React, TypeScript, Tailwind.
- Backend: PHP 8+ REST API with MySQLi; local database via XAMPP/phpMyAdmin.
- Payment provider: Kora/Korapay sandbox first. Read current official docs before coding provider-specific fields/signatures.
- Do not introduce Stripe, Laravel, a second Node backend, Redis or microservices without explicit approval. Redis is explicitly deferred until the core system works.
- Delivery fees are location-based and calculated server-side from configurable delivery zones. Do not invent zone prices; unmatched addresses must not default to free delivery.
- Product scope: Physical products ONLY. There are NO digital products or digital downloads. All products require physical fulfillment, inventory tracking, SKU, and destination delivery zone calculation.
- Demo admin scope is one securely authenticated admin account; do not build multi-staff role management, but retain backend authorization and audit logging.
- Include a protected first-run admin/store onboarding flow that captures admin details and the store origin address, then disable public setup after completion.
- Guest-first shoppers still get a lightweight customer profile tied to a verified email so purchases, order details, saved cart and wishlist can persist. Use secure email verification/magic-link access; never expose history based on email alone.
- Store origin address is captured in onboarding. Admin then configures destination delivery zones and fees based on the store's delivery coverage; do not invent rates or assume the origin address alone determines the fee.
- Delivery & Fulfillment: All orders contain physical items only and require destination address validation, delivery fee calculation from destination zones, and physical shipping status tracking. Digital downloads, digital files, and digital entitlement tokens are strictly excluded from the store.
- Never put secrets in frontend code or `NEXT_PUBLIC_*` variables.
- Never trust browser prices, totals, role, stock or payment status.
- Use prepared statements, server-side validation, secure authentication, role checks, transaction-safe inventory and idempotent payment handling.
- No fake “success” states or dashboard figures. If a page is not implemented, mark it clearly rather than pretending it works.
- Inspect before editing. Avoid unnecessary rewrites. Run checks and stop after each prompt.
- Direct me  on where to check or test what you executed or implemented or built.

---