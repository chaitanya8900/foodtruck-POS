# Security Policy & Implementation Standards

This document outlines the security architecture, controls, and best practices implemented in the Food Truck POS & QR Self-Ordering Platform.

---

## 🛡️ Implemented Security Controls

### 1. Authentication & Session Management
- **Password Hashing**: Passwords are encrypted using `bcryptjs` with salt rounds (standard 10 rounds).
- **Constant-Time Verification**: Comparison failures use constant-time comparison to prevent timing side-channel attacks.
- **Account Enumeration Defense**: Unified error messages (`Invalid email or password`) are returned for both invalid emails and wrong passwords.
- **Stateful Token Verification**: JWT verification checks the PostgreSQL database to ensure the user exists and is active (`is_active: true`), enabling instant revocation.
- **HTTP-Only Cookies**: JWT authentication tokens can be transferred via `HttpOnly`, `SameSite=Lax`, and `Secure` cookies.

### 2. Network & API Protection
- **Security Headers (Helmet)**: Express applications are shielded with `helmet` to mitigate Clickjacking, XSS, MIME-sniffing, and cross-origin attacks.
- **CORS Restrictiveness**: Cross-Origin Resource Sharing is locked to configured domains (`CORS_ORIGIN`). Wildcards are disallowed in production.
- **Multi-Tier Rate Limiting**:
  - **Auth Rate Limiter**: 15 requests per 15 minutes per IP on `/api/auth/login` to prevent credential stuffing and brute-force attacks.
  - **Public Ordering Limiter**: 100 requests per 5 minutes per IP on `/api/public/orders` to prevent order flooding.
  - **Global API Limiter**: 1500 requests per 15 minutes per IP across all general endpoints.

### 3. Payment Gateway Security (PhonePe)
- **SHA-256 Checksum Calculation**: Request payloads and callbacks are calculated with PhonePe standard salt keys and indexes:
  `SHA256(payloadBase64 + endpoint + saltKey) + "###" + saltIndex`
- **Timing-Safe Signature Verification**: Webhook callbacks are verified using Node.js `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
- **Idempotency Guarantee**: Payment webhooks check existing transaction records to prevent double-crediting or duplicate order confirmation.

### 4. Injection & Data Integrity
- **Parameterized Queries**: All database interactions use Prisma ORM with parameterized SQL queries, completely eliminating SQL injection vectors.
- **Schema Validation**: Every endpoint validates input bodies, URL parameters, and query parameters using strict Zod schemas before reaching service logic.
- **Server-Side Pricing**: Order totals, modifiers, discounts, and taxes are strictly calculated on the server against database price snapshots. Client prices are never trusted.
- **Immutable Snapshots**: Historical orders preserve item names and unit prices in snapshot columns (`item_name_snapshot`, `unit_price_snapshot`) so menu edits never alter past financial records.

### 5. File Upload Protection & Static Assets
- **Binary Magic Bytes Verification**: Image uploads strictly inspect binary signatures (`PNG`: `89 50 4E 47`, `JPEG`: `FF D8 FF`, `WebP`: `RIFF...WEBP`) rather than trusting user-supplied MIME extensions or headers.
- **Strict Format Whitelisting**: Scriptable and vector formats (such as SVG, HTML, PHP, JS) are rejected to eliminate Stored XSS vectors. Only JPG, PNG, and WebP are allowed.
- **Hard Size Boundary**: File uploads enforce an absolute 5MB buffer ceiling.
- **Path Traversal Shield**: File names are generated using cryptographic random tokens and system timestamps (`item_<timestamp>_<rand>.<ext>`) with zero user-supplied directory input.
- **Static Asset Hardening**: Static directory `/uploads` ignores dotfiles, disables directory indexing (`index: false`), and serves `X-Content-Type-Options: nosniff`.

### 6. Information Disclosure & Error Handling
- **Production Error Masking**: Unexpected server exceptions return generic error responses (`Internal server error`) in production environments; stack traces and internal paths are never exposed to clients.
- **Structured Logging**: Logging is handled by `pino` with JSON output in production and redacted sensitive fields.

---

## 🔒 Reporting a Vulnerability

If you discover a potential security vulnerability within this repository, please send an email to `security@foodtruck.com` with reproducible steps.
