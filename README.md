# 🍕 Gourmet Pizza Delivery & Real-Time Kitchen Tracking Platform

> **Oasis Infobyte Web Development and Designing Internship (OIBSIP) — Level 3 Project**  
> Full-Stack Artisanal Pizza Ordering, Customizer Engine, Live WebSocket Tracking, Inventory Control & Razorpay Checkout.

[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4-black?logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socket.io)](https://socket.io/)
[![Razorpay](https://img.shields.io/badge/Razorpay-Payment%20Gateway-0C2340?logo=razorpay)](https://razorpay.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Overview

The **Gourmet Pizza Delivery Platform** is a production-grade, full-stack web application crafted to deliver an intuitive consumer ordering experience paired with a robust administrative back-office. Designed with an official **Zomato-inspired light aesthetic**, the platform allows customers to choose from chef-curated signature pizzas or build bespoke creations across a 4-step ingredient pipeline with live pricing.

Orders are processed via **Razorpay** with server-side HMAC-SHA256 signature verification, immediately triggering atomic inventory decrements. Customers track their pizza in real-time through an interactive visual stepper powered by **Socket.io** as kitchen admins transition orders from prep to delivery.

---

## ✨ Key Features

### 🍕 Customer Experience
- **Interactive 4-Step Pizza Customizer**:
  1. **Crust Base**: Thin Crust, Cheese Burst, Classic Hand-Tossed, Pan, Gluten-Free.
  2. **Signature Sauces**: Classic Marinara, Spicy Peri-Peri, Creamy Garlic Alfredo, Smoky BBQ, Basil Pesto.
  3. **Cheese Varieties**: Mozzarella, Cheddar Blend, Smoked Gouda, Ricotta, Vegan Mozzarella.
  4. **Gourmet Veggies**: Bell Peppers, Black Olives, Jalapeños, Earthy Mushrooms, Crisp Onions, Sweet Corn, Baby Spinach.
- **Dynamic Price Engine**: Live calculation based on base selection and toppings count with clear itemized bill summaries.
- **Curated Menu**: Pre-configured signature pizzas with quick add-to-cart functionality.
- **Secure Authentication**: Customer registration, email verification, password reset, and JWT session handling.

### ⚡ Real-Time Tracking & Kitchen Operations
- **Live WebSocket Event Bus**: Dual-channel updates (`order_status_updated`, `new_order_placed`, `inventory_updated`).
- **Interactive Stepper**: Visual tracking through 4 sequential stages:
  - 📋 *Order Received* ➔ 👨‍🍳 *In Kitchen* ➔ 🛵 *Sent to Delivery* ➔ 🎉 *Delivered*
- **Real-Time Email Verification Reflection**: Registration window automatically updates the moment email verification is clicked on any device.

### 🛡️ Admin Dashboard & Inventory Management
- **Live Stock Monitor**: Real-time view of inventory counts across all bases, sauces, cheeses, and toppings.
- **Instant Restock Controls**: Inline modal allowing administrators to replenish stock or adjust alert thresholds.
- **Automated Low-Stock Alerts**: Scheduled background cron service (`node-cron`) evaluating stock against thresholds (<20 units) and dispatching automated Nodemailer email notifications.
- **Order Pipeline Manager**: Admin interface to inspect incoming orders, customer details, and transition statuses with audit trails.

### 💳 Payments & Security
- **Razorpay Integration**: Test mode checkout handling order initiation, modal rendering, and cryptographic payment confirmation.
- **Role-Based Access Control (RBAC)**: Strict segregation between consumer accounts (`role: user`) and administrative portals (`role: admin`).
- **Zero Exposure**: Sensitive passwords and secrets protected via environment variables.

---

## 🏗️ Architecture & Tech Stack

### Frontend (`client/`)
- **Library**: React 18 (Hooks, Context API)
- **Tooling**: Vite (fast HMR and optimized production bundles)
- **Routing**: React Router DOM v6 with route guards
- **Styling**: Single consolidated `theme.css` driven by CSS custom properties (Zomato Crimson `#e23744`, crisp cards, clean typography)
- **Icons**: Lucide React
- **Real-Time Client**: Socket.io Client

### Backend (`server/`)
- **Runtime**: Node.js & Express
- **Database**: MongoDB Atlas with Mongoose ODM
- **Real-Time Server**: Socket.io attached to Node HTTP server
- **Scheduler**: Node-Cron (hourly stock monitoring)
- **Mailer**: Nodemailer with SMTP transport
- **Security**: JSON Web Tokens (JWT), bcryptjs password hashing, HMAC-SHA256 signature verification, CORS

### Testing Suite (`e2e_tests/` & `server/tests/`)
- **E2E Opaque-Box Framework**: 276 automated test cases covering 4 tiers (Feature coverage, Boundaries, Pairwise combinations, Real-world flows).
- **Backend Test Suite**: 127 Jest unit and integration tests covering auth, inventory, and payment contracts.

---

## 📁 Repository Structure

```
OIBSIP-WebDev-L3--Pizza-Delivery-Full-Stack-Application/
├── client/                     # React + Vite Frontend
│   ├── public/                 # Static assets & _redirects (SPA routing)
│   ├── src/
│   │   ├── components/         # Navbar, Stepper, Protected Routes
│   │   ├── context/            # AuthContext, CartContext, SocketContext
│   │   ├── pages/              # Home, Customizer, Tracking, Admin, Auth
│   │   ├── services/           # api.js fetch wrapper, socket.js client
│   │   └── styles/             # theme.css design tokens
│   ├── package.json
│   └── vite.config.js
├── server/                     # Node.js + Express Backend
│   ├── config/                 # db.js connection & DNS fallback
│   ├── controllers/            # auth, inventory, order, pizza controllers
│   ├── middleware/             # authMiddleware, errorMiddleware
│   ├── models/                 # User, Inventory, Order, Pizza Mongoose models
│   ├── routes/                 # Express API routes
│   ├── seed/                   # Catalog & default admin seeder
│   ├── services/               # emailService, cronService, razorpayService
│   ├── socket/                 # socket.js event handlers & room broadcasting
│   ├── server.js               # Express application entrypoint
│   └── package.json
├── e2e_tests/                  # 4-Tier Automated Test Framework (276 tests)
│   ├── runner.js               # CLI test runner
│   ├── tier1_features/         # Happy-path feature tests
│   ├── tier2_boundaries/       # Edge cases and negative tests
│   ├── tier3_pairwise/         # Cross-feature interaction tests
│   └── tier4_scenarios/        # Real-world lifecycle tests
├── .gitignore                  # Comprehensive secret & build protection
└── README.md                   # Project documentation
```

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) (v9+)
- A [MongoDB Atlas](https://www.mongodb.com/) account (or local MongoDB instance)

### 1. Clone the Repository
```bash
git clone https://github.com/AmirRazaRangrez/OIBSIP-WebDev-L3--Pizza-Delivery-Full-Stack-Application.git
cd OIBSIP-WebDev-L3--Pizza-Delivery-Full-Stack-Application
```

### 2. Configure Backend Environment
Create a `.env` file inside the `server/` folder using `server/.env.example` as a reference:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your values:
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_super_secret_jwt_key
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
EMAIL_FROM="Zomato Pizza" <your_email@gmail.com>
```

### 3. Install & Start Backend
```bash
cd server
npm install
npm start
```
*The server will start on `http://localhost:5000`. On first run, it automatically seeds 20 inventory items, 4 signature pizzas, and a default admin account (`admin@pizzadelivery.com` / `Admin@123456`).*

### 4. Install & Start Frontend
Open a new terminal window:
```bash
cd client
npm install
npm run dev
```
*The frontend Vite dev server will be active on `http://localhost:3000` with automatic proxying to the backend.*

---

## 🧪 Running Automated Tests

Run the complete 276-test E2E opaque-box suite:
```bash
node e2e_tests/runner.js
```

Run backend unit and integration tests:
```bash
npm --prefix server test
```

---

## 🌐 Production Deployment Guide

This project is architected for clean monorepo deployment:

### 1. Backend on [Render.com](https://render.com/)
- Create a new **Web Service** pointing to this repository.
- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- Set the environment variables listed in `server/.env.example`.

### 2. Frontend on [Cloudflare Pages](https://pages.cloudflare.com/)
- Create a new **Pages application** pointing to this repository.
- **Root Directory**: `client`
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Build Output Directory**: `dist`
- **Environment Variable**: `VITE_BACKEND_URL=https://your-backend.onrender.com`

---

## 👤 Author

**Amir Raza Rangrez**
- **GitHub**: [@AmirRazaRangrez](https://github.com/AmirRazaRangrez)
- **Role**: Full-Stack Web Development Intern
- **Program**: Oasis Infobyte Internship (OIBSIP) — Web Development & Designing

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free for educational and commercial exploration.

