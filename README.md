# Food Truck POS, QR Self-Ordering & Kitchen Order Ticket System

A unified, production-ready restaurant management platform built according to the Product Requirements Document (PRD v1.0 + Addendum).

---

## 🏗️ Architecture & Components

The software consists of three interconnected systems:

1. **`backend/`**: Node.js + Express + TypeScript + Prisma ORM + PostgreSQL + Socket.IO API server.
2. **`frontend/`**: React 18 + Vite + TypeScript + Tailwind CSS application containing:
   - **Counter POS**: Touchscreen cashier checkout with 60/40 screen layout, item search, customization modifier selector, cash change calculator, mandatory order-type popup (Dine-In/Takeaway), and auto token generation.
   - **Customer QR Ordering**: Mobile-first responsive app accessed via Table QR code (`/order/t/:qrToken`) with digital menu, customizations, cart review, mandatory Dine-In / Takeaway selection, PhonePe UPI online gateway, or Pay-at-Counter option.
   - **Mobile Orders Dashboard**: Cashier interface with 3 live Socket.IO synchronized queues: *Pending Payment* (Pay at Counter), *Ready to Issue Token* (Prepaid PhonePe UPI), and *Confirmed/Printed*.
   - **Kitchen Dashboard**: Kanban view (*Confirmed*, *Preparing*, *Ready*) for live kitchen ticket fulfillment.
   - **Admin Portal**: Executive statistics, categories, menu items, modifier groups, tables with dynamic QR code generation/downloads, audit trail, date-filtered sales reports, user management, and business settings.
3. **`print-agent/`**: Local background agent running on the food truck hardware, maintaining a Socket.IO connection to the backend to print:
   - **Customer Token / Receipt**: Itemized slip with token number, order type, payment details, cut.
   - **Kitchen Order Ticket (KOT)**: Food preparation ticket with large token number, modifiers, special instructions, auto-cut (excludes private billing details).
   - Includes **Console Printer** mode for testing without physical ESC/POS hardware, as well as Network (TCP/IP) and USB drivers.

---

## 🚀 Quick Start Guide

### Step 1: Start PostgreSQL Database
```bash
docker compose up -d
```
*(Or point `DATABASE_URL` in `backend/.env` to any existing PostgreSQL instance)*

### Step 2: Set Up Backend
```bash
cd backend
npm install
npx prisma db push    # Sync schema to PostgreSQL
npm run prisma:seed   # Seed default food truck, menu, modifiers, tables, and staff
npm run dev           # Starts API server on http://localhost:5001
```

### Step 3: Set Up Frontend
```bash
cd frontend
npm install
npm run dev           # Starts UI on http://localhost:3000
```

### Step 4: Run Print Agent (Optional / Local Hardware)
```bash
cd print-agent
npm install
npm run dev           # Starts print agent in console mode (simulates thermal prints in terminal)
```

---

## 🔑 Default Seed Credentials

- **Admin User**:
  - **Email**: `admin@foodtruck.com`
  - **Password**: `admin123`
  - **Access**: Full Admin Portal, Reports, Settings, Menu & POS
- **Cashier User**:
  - **Email**: `cashier@foodtruck.com`
  - **Password**: `cashier123`
  - **Access**: Counter POS & Mobile Orders Dashboard
- **Kitchen User**:
  - **Email**: `kitchen@foodtruck.com`
  - **Password**: `kitchen123`
  - **Access**: Kitchen Display Board

---

## 📱 QR Code Testing URLs

Once seeded, tables are created with unique QR tokens:
- **Table 01**: `http://localhost:3000/order/t/qr_tbl_01_a9f2e3`
- **Table 02**: `http://localhost:3000/order/t/qr_tbl_02_b8c3d4`
- **Table 03**: `http://localhost:3000/order/t/qr_tbl_03_c7d4e5`
- **Table 04**: `http://localhost:3000/order/t/qr_tbl_04_d6e5f6`

---

## 🛡️ Business Rules Enforced

1. **One QR per Table, Dynamic Order Type**: The QR code identifies the originating table, but the customer explicitly chooses between **Dine-In** and **Takeaway** via a mandatory popup before checkout.
2. **Strict Payment Gate**: Orders with *Pay at Counter* do not receive a token number or print a KOT until the cashier explicitly marks payment confirmed.
3. **Concurrency-Safe Token Generation**: Tokens are generated sequentially via database transaction with `SELECT ... FOR UPDATE` locks on daily sequences (`001`, `002`, etc.) resetting at the configured business reset time.
4. **Independent Print Job Tracking**: Customer Receipt and KOT are individual print jobs. If one succeeds and the other fails, the cashier can reprint either slip independently.
5. **Idempotent Webhooks**: PhonePe payment gateway webhooks prevent duplicate processing and order confirmation replays.
