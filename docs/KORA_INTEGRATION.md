# Kora (Korapay) Sandbox Integration Specification

This document provides the verified integration contract for Kora (formerly Korapay / KoraHQ) payment gateway integration into Shop.co. All details are derived from official Kora developer documentation.

---

## 1. Official Documentation & Source Reference URLs

- **Official Developer Documentation**: [https://docs.korapay.com](https://docs.korapay.com) / [https://korahq.com](https://korahq.com)
- **API Overview & Charges**: `https://docs.korapay.com/docs/charges`
- **Checkout Initialization API**: `POST https://api.korapay.com/merchant/api/v1/charges/initialize`
- **Charge Verification API**: `GET https://api.korapay.com/merchant/api/v1/charges/:reference`
- **Webhooks & Cryptographic Signature**: `https://docs.korapay.com/docs/webhooks`

---

## 2. Environment & Base URLs

| Environment | Base URL | Secret Key Prefix | Public Key Prefix |
| :--- | :--- | :--- | :--- |
| **Sandbox / Test** | `https://api.korapay.com/merchant/api/v1` | `sk_test_...` | `pk_test_...` |
| **Production / Live** | `https://api.korapay.com/merchant/api/v1` | `sk_live_...` | `pk_live_...` |

> **Security Rule**: API credentials must **only** be read from backend environment variables (`.env`). Secrets must never be committed to source control or exposed in frontend code / `NEXT_PUBLIC_*` variables.

---

## 3. Checkout Initialization (Hosted Checkout)

### Endpoint
```http
POST https://api.korapay.com/merchant/api/v1/charges/initialize
```

### Headers
```http
Authorization: Bearer {KORA_SECRET_KEY}
Content-Type: application/json
Accept: application/json
```

### Request Payload Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `reference` | `string` | **Yes** | Unique merchant transaction reference (e.g., `PAY-ORD-YYYYMMDD-XXXXXX-XXXX`). Must be unique across all charges. |
| `amount` | `number` | **Yes** | Real backend-calculated order total (float/decimal, e.g. `14500.00`). Never trust browser-supplied values. |
| `currency` | `string` | **Yes** | Transaction currency. Supported currency for domestic Nigeria: `"NGN"`. |
| `customer` | `object` | **Yes** | Customer details object: `{"name": "...", "email": "..."}`. |
| `customer.name` | `string` | **Yes** | Full name of recipient or customer. |
| `customer.email` | `string` | **Yes** | Customer's valid email address. |
| `notification_url` | `string` | **Yes** | HTTPS Webhook endpoint where Kora delivers asynchronous transaction notifications (`POST /api/v1/webhooks/kora`). |
| `redirect_url` | `string` | *Optional* | URL where the customer is redirected after completing or abandoning checkout. Kora appends `?reference={reference}` to this URL. |
| `channels` | `array` | *Optional* | Permitted payment channels, e.g., `["card", "bank_transfer"]`. |
| `narration` | `string` | *Optional* | Human-readable description (e.g. `"Payment for order ORD-20261016-A1B2C3"`). |
| `metadata` | `object` | *Optional* | Custom merchant metadata (e.g. `{"order_id": 12, "order_number": "ORD-..."}`). |

### Success Response (`200 OK` / `201 Created`)
```json
{
  "status": true,
  "message": "Charge initialized successfully",
  "data": {
    "reference": "PAY-ORD-20261016-A1B2C3-9F8E",
    "checkout_url": "https://checkout.korapay.com/pay/pay_ref_abcdef123456",
    "amount": 14500.00,
    "currency": "NGN",
    "status": "pending"
  }
}
```

### Error Responses (`400`, `401`, `422`, `500`)
```json
{
  "status": false,
  "message": "Validation error: invalid reference or duplicate reference",
  "data": null
}
```

---

## 4. Provider Reference & State Management

1. **Unique Provider Reference**:
   - Format: `PAY-{order_number}-{hex}` (e.g. `PAY-ORD-20261016-D4A121-7B1A`).
   - Stored in MySQL `payments.provider_reference`.
2. **Order & Payment Lifecycle**:
   - Order status: Remains `pending_payment` upon initialization.
   - Payment status: Remains `pending`.
   - **Crucial Rule**: Never mark an order or payment as `paid` or `successful` during initialization! Payment must only be finalized upon cryptographic webhook verification or authoritative query verification.
3. **Safe Storage & Sensitive Data Redaction**:
   - Provider response metadata is persisted in `payments.provider_payload_redacted` as JSON.
   - Any sensitive authorization keys or customer card tokens are redacted before saving.
4. **Resilience & Recoverability**:
   - If Kora API times out (network failure or gateway unavailability), the order is **not deleted**. It remains in a recoverable `pending_payment` state so the customer can retry checkout without re-creating items.

---

## 5. Transaction Verification API

Used to synchronously query transaction status if webhook delivery is delayed or when the customer returns to the redirect URL:

### Endpoint
```http
GET https://api.korapay.com/merchant/api/v1/charges/:reference
```

### Headers
```http
Authorization: Bearer {KORA_SECRET_KEY}
Accept: application/json
```

### Verification Response Schema
```json
{
  "status": true,
  "message": "Charge retrieved successfully",
  "data": {
    "reference": "PAY-ORD-20261016-A1B2C3-9F8E",
    "status": "success",
    "amount": 14500.00,
    "fee": 217.50,
    "currency": "NGN",
    "customer": {
      "name": "Jane Doe",
      "email": "jane@example.com"
    },
    "payment_method": "card",
    "transaction_date": "2026-10-16T12:05:00.000Z"
  }
}
```

---

## 6. Webhook Requirements & HMAC SHA-256 Signature Verification

### Webhook HTTP Details
- **Method**: `POST`
- **Header**: `x-korapay-signature` (in PHP: `$_SERVER['HTTP_X_KORAPAY_SIGNATURE']`)

### Cryptographic Signature Verification Rule
1. Kora computes the HMAC SHA-256 signature **strictly on the `data` sub-object** of the payload, **NOT** on the entire outer body:
   ```php
   $rawInput = file_get_contents('php://input');
   $payload = json_decode($rawInput, true);
   
   // Hash the `data` member exactly as received. Re-encoding with json_encode can change
   // number formatting (14500.00 -> 14500.0) or escape non-ASCII names and break the match.
   $dataJson = KoraService::extractRawJsonMember($rawInput, 'data');
   $expectedSignature = hash_hmac('sha256', $dataJson, $koraSecretKey);
   
   if (!hash_equals($expectedSignature, $_SERVER['HTTP_X_KORAPAY_SIGNATURE'])) {
       // Reject with 401 Unauthorized
   }
   ```
2. **Supported Webhook Events**:
   - `charge.success`: Transaction paid and verified.
   - `charge.failed`: Transaction failed.
3. **Idempotency & Replay Protection**:
   - Store webhook events in `payment_webhook_events` with unique `event_reference`.
   - Prevent duplicate processing or multiple fulfillments of the same order.

---

## 7. Safe Local Webhook Testing Procedure

> [!CAUTION]
> **Security Rule**: Never expose your root XAMPP environment or MySQL database port (3306) directly to the public internet or via default port forwarding. Forward **only** the isolated PHP backend application port (8000) through a secure temporary tunnel when real webhook dispatch is required.

### Method 1: Automated test suite (recommended)
Runs against a throw-away database; nothing is sent to Kora:
```bash
php backend/tests/run.php PaymentIntegrity
```
It covers signatures computed over the raw `data` bytes, bad signatures (401, recorded), duplicate and
replayed webhooks, amount and currency mismatches, late payments on expired orders (flagged, not
revived), duplicate payments, and that a paid order is never moved backwards.

### Method 2: Local HTTP test with curl
While the API runs on `http://127.0.0.1:8000`, sign the **exact bytes** of the `data` object you send
(the API hashes the raw substring, not a re-encoded copy):
```bash
DATA='{"reference":"<payment reference from the payments table>","amount":14500,"currency":"NGN","status":"success"}'
SIG=$(php -r 'echo hash_hmac("sha256", $argv[1], $argv[2]);' "$DATA" "<your KORA_SECRET_KEY>")
curl -X POST http://127.0.0.1:8000/api/v1/webhooks/kora \
  -H "Content-Type: application/json" \
  -H "x-korapay-signature: $SIG" \
  -d "{\"event\":\"charge.success\",\"data\":$DATA}"
```
The amount must equal the order total and the reference must belong to an open payment attempt.

### Method 3: Live Sandbox Webhook Testing via Secure Tunnel
To receive live asynchronous sandbox events dispatched from Kora's cloud dashboard to your local machine:

1. **Start the PHP backend server**:
   ```bash
   php -S 127.0.0.1:8000 -t backend/public
   ```
2. **Launch a secure temporary tunnel** (bind strictly to port 8000 only):
   ```bash
   ngrok http 8000
   ```
   *Or with Cloudflare Tunnel:*
   ```bash
   cloudflared tunnel --url http://127.0.0.1:8000
   ```
3. **Configure Kora Sandbox Webhook**:
   - In your Kora Merchant Dashboard, set the Webhook URL to:
     `https://<your-subdomain>.ngrok-free.app/api/v1/webhooks/kora`
4. **Mandatory Tunnel Teardown**:
   - Immediately when testing is complete, terminate the tunnel process (`Ctrl + C` or `killall ngrok`) to close external public access to your local machine.
   - Do not leave the tunnel running unattended.
