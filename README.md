# Food Truck POS, QR Self-Ordering & Kitchen Order Ticket System

A unified, production-ready restaurant management platform built with high performance, instant page navigation, and reliable thermal printing workflows.

---

## 🏗️ Architecture & Components

The repository is structured into three specialized components:

1. **`backend/` (API & Real-time Server)**:
   - Built with **Node.js**, **Express.js**, **TypeScript**, **Prisma ORM**, and **Socket.IO**.
   - Database: **Supabase PostgreSQL** (using connection pooler for serverless concurrency).
   - Authentication: **Supabase Auth** & JWT middleware with role-based access control (Admin, Cashier, Kitchen).
   - Payment Integration: **PhonePe UPI** gateway with webhook verification and payment simulation mode.
   - Real-time Events: Socket.IO broadcasts for instantaneous order state changes, token calls, and print job notifications.

2. **`frontend/` (Web Application & Touchscreen POS)**:
   - Built with **React 18**, **Vite**, **TypeScript**, **Tailwind CSS**, and **TanStack React Query**.
   - **Counter POS (`/pos`)**: High-speed touch interface with 60/40 layout, search, category filters, customizable modifiers, cash change return calculator, and token confirmation dialog.
   - **Customer QR Self-Ordering (`/order/t/:qrToken`)**: Mobile-first responsive app with digital menu, live modifiers, cart review, mandatory Dine-In / Takeaway selection, PhonePe UPI payment, or Pay at Counter option.
   - **Mobile Orders Dashboard (`/mobile-orders`)**: Cashier management hub with live queues: *Pending Payments* (Pay at Counter), *Ready to Issue Token* (Prepaid orders), and *Confirmed/Printed*. Includes token modal popup to announce tokens to waiting customers.
   - **Kitchen Display System (`/kitchen`)**: Kanban view (*Confirmed*, *Preparing*, *Ready*) for live kitchen ticket fulfillment with sound alerts.
   - **Admin Portal (`/admin`)**: Analytics, category/menu management with image uploads, modifier groups, tables with dynamic QR code generation/downloads, audit trails, and date-filtered sales reports.

3. **`print-agent/` (Local Thermal Hardware Agent)**:
   - Lightweight local Node.js daemon running on the physical counter machine (PC, Mac, or Raspberry Pi) connected to hardware thermal receipt printers.
   - Maintains a Socket.IO connection with the backend to receive and print jobs:
     - **Customer Token / Receipt**: Itemized slip with token number, order type, and payment details.
     - **Kitchen Order Ticket (KOT)**: Food prep ticket with large token number, modifier choices, and customer notes.
   - Supported modes: **Network (TCP/IP 9100)**, **USB**, and **Console (Terminal simulation)**.

---

## ☁️ Deployment on Vercel (Multi-Service Project)

This repository is configured to deploy as a unified **Vercel Multi-Service Project** via [`vercel.json`](file:///Users/chaitanyadasari/Projects/F&B%20Software/vercel.json). Both frontend and backend deploy within a single project under the same custom domain.

### Multi-Service Configuration Overview

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "backend": {
      "root": "backend",
      "framework": "express",
      "entrypoint": "src/index.ts",
      "buildCommand": "npm run build",
      "bindings": [
        {
          "type": "service",
          "service": "frontend",
          "format": "url",
          "env": "FRONTEND_URL"
        }
      ]
    },
    "frontend": {
      "root": "frontend",
      "framework": "vite",
      "buildCommand": "npm run build",
      "outputDirectory": "dist"
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "backend" } },
    { "source": "/uploads/(.*)", "destination": { "service": "backend" } },
    { "source": "/socket.io/(.*)", "destination": { "service": "backend" } },
    { "source": "/(.*)", "destination": { "service": "frontend" } }
  ]
}
```

### Routing & Service Bindings

- **Public Routing**:
  - `/api/(.*)` → Routes directly to the `backend` Express service.
  - `/uploads/(.*)` → Routes to the `backend` static asset handler for menu item pictures.
  - `/socket.io/(.*)` → Routes to the `backend` Socket.IO server.
  - `/(.*)` → Catch-all routes to the `frontend` Vite Single Page Application.
- **Service Binding**:
  - `backend` declares an internal binding to `frontend`. Vercel automatically injects the active frontend URL into `process.env.FRONTEND_URL` for constructing customer QR links and payment redirect URLs.
- **Entrypoint**:
  - `backend` points to `src/index.ts`, allowing Vercel to locate the source TypeScript entrypoint upon cloning.

### Required Environment Variables on Vercel

Configure these environment variables in your Vercel Project Settings (**Settings** → **Environment Variables**):

| Variable | Target Service / Scope | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `backend` | Supabase Session Pooler connection string (`aws-0-[region].pooler.supabase.com:5432/postgres`) |
| `DIRECT_URL` | `backend` | Direct PostgreSQL connection string for Prisma migrations (port 5432) |
| `SUPABASE_URL` | `backend` | Supabase project URL (`https://[PROJECT_REF].supabase.co`) |
| `SUPABASE_ANON_KEY` | `backend` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend` | Supabase service-role secret key (for administrative actions) |
| `JWT_SECRET` | `backend` | Secret key for signing authorization JWTs |
| `JWT_EXPIRES_IN` | `backend` | JWT expiration duration (e.g. `7d`) |
| `PHONEPE_MERCHANT_ID` | `backend` | PhonePe Merchant ID (`PGTESTPAYUAT` for sandbox) |
| `PHONEPE_SALT_KEY` | `backend` | PhonePe Salt Key |
| `PHONEPE_SALT_INDEX` | `backend` | PhonePe Salt Index (e.g. `1`) |
| `PHONEPE_ENV` | `backend` | `UAT` for sandbox testing or `PROD` for live payments |
| `VITE_SUPABASE_URL` | `frontend` | Supabase project URL for frontend client initialization |
| `VITE_SUPABASE_ANON_KEY` | `frontend` | Supabase anon/public key for frontend client initialization |

---

## 💻 Local Development Setup

### 1. Database Setup (Supabase PostgreSQL)
Ensure your Supabase project credentials are set in `backend/.env`. Then run:
```bash
cd backend
npx prisma db push      # Push schema to database
npm run prisma:seed     # Seed default business, staff, menu items, and tables
```

### 2. Start the Backend API Server
```bash
cd backend
npm install
npm run dev             # Starts Express server on http://localhost:5001
```

### 3. Start the Frontend Web App
```bash
cd frontend
npm install
npm run dev             # Starts Vite development server on http://localhost:3000
```

### 4. Run the Print Agent (Local Terminal or Thermal Printer)
The print agent runs on the local computer where the physical thermal printer is attached:
```bash
cd print-agent
npm install
npm run dev             # Connects to backend on localhost:5001 in console simulation mode
```
*To connect to a production Vercel deployment, update `BACKEND_URL=https://your-foodtruck.vercel.app` in `print-agent/.env`.*

---

## 🔑 Default Seed Credentials

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@foodtruck.com` | `admin123` | Full Admin Portal, POS, Kitchen, Reports & Settings |
| **Cashier** | `cashier@foodtruck.com` | `cashier123` | Counter POS & Mobile Orders Dashboard |
| **Kitchen** | `kitchen@foodtruck.com` | `kitchen123` | Kitchen Order Display Board (KDS) |

---

## 📱 QR Code Testing URLs

Once seeded, tables are created with pre-generated QR tokens:
- **Table 01**: `http://localhost:3000/order/t/qr_tbl_01_a9f2e3`
- **Table 02**: `http://localhost:3000/order/t/qr_tbl_02_b8c3d4`
- **Table 03**: `http://localhost:3000/order/t/qr_tbl_03_c7d4e5`
- **Table 04**: `http://localhost:3000/order/t/qr_tbl_04_d6e5f6`

---

## 🛡️ Business Rules & Key Features

1. **Atomic Sequential Token Numbers**: Token sequences (e.g. `#T-001`, `#T-002`) are generated atomically via PostgreSQL `ON CONFLICT ... RETURNING` statements, resetting daily at the configured business reset time (e.g., 04:00 AM).
2. **Order Confirmation & Token Visibility**:
   - **UPI / Prepaid Orders**: When payment confirms, customer mobile devices immediately display their assigned token number (`#T-XXX`). The order arrives in the POS *Ready to Issue Token* queue for the cashier to print the KOT.
   - **Pay at Counter Orders**: Customer receives an Order Reference (`#QR-XXXX`). When customer pays at counter, cashier marks payment confirmed, issuing the token and opening a prominent token completion modal matching the POS screen so the cashier can announce the number.
3. **Split Print Jobs**: Customer Receipt and Kitchen KOT are tracked as separate print jobs. If printer runs out of paper during one job, the other remains unaffected and can be reprinted independently.
4. **Instant 0ms Page Navigation**: Frontend query cache configurations eliminate loading screens and refetch latency when switching between Admin, POS, and Mobile Orders tabs.
