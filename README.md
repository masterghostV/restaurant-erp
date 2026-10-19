# Restaurant ERP & POS SaaS System

A multi-tenant Restaurant ERP and POS system: one piece of software, many independent restaurants, each fully isolated from the others, with a platform-level Site Owner who oversees everything.

- **Backend**: NestJS + Prisma + PostgreSQL
- **Frontend**: Next.js 14 + React + TypeScript + Tailwind CSS
- **Realtime**: Socket.IO (kitchen ↔ waiter ↔ cashier live updates)
- **Auth**: JWT + role-based access control (RBAC)

---

## 1. What this software does

### Core restaurant operations (pre-existing)
- Menu management (categories, items, recipes)
- Real-time order workflow: kitchen → waiter → cashier
- Table management, split billing
- Inventory tracking, suppliers
- Staff attendance / clock-in-out
- Complaints/ticketing system
- Per-restaurant analytics dashboard
- Six staff roles with permission-based access

### Multi-tenant SaaS layer (built in this project's latest round of work)
This is what turns it from "one restaurant's software" into "software you can license to many restaurants."

**1. Site Owner (Super Admin) — platform-level oversight**
A single account that sits above every restaurant, never tied to any one of them.
- Default login: `tomsiteowner` / `tom_owner` (created by `npm run seed:site-owner` — see setup below)
- Can onboard new restaurants, suspend/reactivate any restaurant's access, see every user in the system, and view revenue across the whole platform

**2. Restaurant onboarding & suspension**
- `POST /restaurants/onboard` (Site Owner only) — creates a new restaurant + its first Owner account together
- `PATCH /restaurants/:id/status` (Site Owner only) — set a restaurant to `ACTIVE` or `SUSPENDED`
- Suspension takes effect immediately — even an already-logged-in user of that restaurant is blocked on their very next request, not just their next login

**3. Owner sign-up with email OTP verification**
- `POST /auth/signup-owner` — restaurant owner signs up with email/password/name; a 6-digit code is emailed to them
- `POST /auth/verify-otp` — verifies the code and logs them in
- `POST /auth/resend-otp` — sends a fresh code if needed
- `POST /restaurants/my-restaurant` (Owner only) — once verified, the owner creates their own restaurant
- Public open registration (anyone signing up as anything) has been **removed entirely** — this closed a real security hole where the old system let any visitor register themselves as a Super Admin or as the owner of any restaurant

**4. Auto-generated staff login IDs**
- `POST /staff` — an Owner creates staff (waiters, cashiers, etc.) for their *own* restaurant only; a Site Owner can create staff for any restaurant
- Staff don't need a real email — the system generates a login ID like `raj.waiter@tasty-bites.com` from their name + role + restaurant name, which is what they actually log in with (paired with a password the Owner sets)

**5. Demo / "Quick Login" mode**
- `POST /demo/quick-login` — public, no login needed. A prospective owner can instantly try the software in a private, temporary sandbox restaurant (pre-seeded with sample menu items and tables)
- Each demo session lasts 5 minutes
- A device can only get a **fresh** demo restaurant once every 3 days (revisiting mid-session just logs back into the same one)
- An hourly background job automatically deletes abandoned demo restaurants so they never pile up

**6. Platform-wide revenue oversight**
- `GET /restaurants/overview` (Site Owner only) — every restaurant side by side, with revenue, order counts, staff counts, and status, plus platform-wide totals
- `GET /restaurants/:id/revenue` (Site Owner only) — one restaurant's revenue in detail: all-time total, a day-by-day trend for the last 30 days, and a payment-method breakdown

**7. Table management (Owner or Manager) — so orders reach the kitchen**
- A restaurant's **Owner** or **Manager** adds the dining tables on the new **Tables** page (`/dashboard/tables`): a name/number and how many seats.
- Waiters then see those tables on the **Order Taker** screen. When a waiter sends an order for a table, it appears instantly on that restaurant's **Kitchen KOT** screen.
- New **MANAGER** role: create one from **Staff Management** (it gets a generated login ID like `maya.manager@your-restaurant.com`). A Manager lands on the Tables page after login and can add/delete tables.
- Rules enforced by the server: names must be unique within a restaurant (not case-sensitive); seats must be 1–50; a table that already has orders can't be deleted (set it to RESERVED instead); everyone can only touch their own restaurant's tables.
- **Orders and realtime are now private per restaurant.** Before this change, every live update (new orders, table changes, stock changes, daily sales) was broadcast to every connected screen in every restaurant. They now go only to the restaurant they belong to, and an order can no longer be created with another restaurant's table or menu items. The Site Owner sees live updates for whichever restaurant is selected in their panel.
- **Self-check:** from the `backend` folder run `npx ts-node scripts/check-tables.ts`. It exercises the whole manager → waiter → kitchen flow against a fake in-memory database (it never touches your real data) and should end with `36 passed, 0 failed`.
- Endpoints: `POST /restaurants/tables` (SUPER_ADMIN, OWNER, MANAGER), `GET /restaurants/:restaurantId/tables`, `PUT /restaurants/tables/:id/status`, `DELETE /restaurants/tables/:id` (SUPER_ADMIN, OWNER, MANAGER).

---

## 2. Known limitations — read this before you start

- **Frontend screens now exist for all 6 features** (see below), but **none of it has been tested against a live, running database.** Everything was verified by careful code review, full TypeScript compilation, and a complete production `next build` — not by actually clicking through it against real data. Test each flow yourself once it's running before relying on it for anything real.
- **Complaint live-updates are still broadcast to all restaurants.** The complaints table has no restaurant link yet, so those events can't be limited to one restaurant without a database change. Other by-ID endpoints outside orders and tables (menu, inventory, complaints, settings) have not been audited for cross-restaurant access either.
- **Email sending needs real SMTP configured to actually work.** Without `SMTP_HOST` set in `backend/.env`, OTP codes and other emails are printed to the backend's console log instead of being sent — fine for local testing, not fine for real users.
- **New frontend pages, one per feature:**
  - `/register` — Owner sign-up (rewritten; no longer calls the removed `/auth/register`, now calls `/auth/signup-owner`)
  - `/verify-otp` — OTP entry screen
  - `/onboard-restaurant` — self-service restaurant creation for a freshly verified owner
  - `/dashboard/site-owner` — Site Owner panel (onboard restaurants, suspend/activate, revenue overview) — visible only to SUPER_ADMIN
  - `/dashboard/staff` — staff creation panel showing generated login IDs — visible to OWNER and SUPER_ADMIN
  - Quick Login buttons on `/login` — calls `/demo/quick-login`, shows a popup explaining demo mode, and a persistent countdown banner on the dashboard that auto-logs-out when the 5 minutes end

---

## 3. Prerequisites

Install these once per machine:
- **Node.js** 18 or newer — https://nodejs.org
- **PostgreSQL** 14+ — https://www.postgresql.org/download/ (or use Docker, see section 6)
- **Git** (if cloning rather than copying the zip)
- **VS Code** (or any editor) — https://code.visualstudio.com

---

## 4. First-time setup on a new device (VS Code terminal commands)

Unzip the project, open the folder in VS Code, then open a terminal (`` Ctrl+` `` or Terminal → New Terminal) and run these in order.

### Step 1 — Create the database
```bash
psql -U postgres -c "CREATE DATABASE restaurant_erp;"
```
(On Windows, if `psql` isn't recognized, use the full path, e.g. `& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE restaurant_erp;"` — adjust the version number to match what you installed.)

### Step 2 — Configure backend environment
```bash
cd backend
cp .env.example .env
```
(Windows: `copy .env.example .env`)

Open `backend/.env` in VS Code and set:
```env
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/restaurant_erp?schema=public"
JWT_SECRET="generate-a-long-random-string-here"
PORT=4000

# Optional — only needed for real OTP/notification emails to actually send.
# Without these, emails are logged to the console instead (fine for local dev).
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=no-reply@yourdomain.com

# Only used once by `npm run seed:site-owner` — change before running in production.
SITE_OWNER_LOGIN_ID=tomsiteowner
SITE_OWNER_PASSWORD=tom_owner
SITE_OWNER_NAME=Site Owner
```

To generate a random `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Step 3 — Install backend dependencies and set up the database schema
```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --accept-data-loss
```
Always use these `npm run ...` commands rather than `npx prisma ...`. If the local install is incomplete, `npx` silently downloads the newest Prisma (v7+), which is incompatible with this project's schema (it needs Prisma 5.x). The `--accept-data-loss` flag only skips a confirmation prompt: the changes on a first run just add new columns and a unique constraint.

If you already had users in the database from an earlier version, also mark them as verified (the login now requires verification):
```bash
psql -U postgres -d restaurant_erp -c "UPDATE users SET is_verified = true;"
```

**If `npm install` fails on Windows** with errors about `node-gyp`, Visual Studio, or `bcrypt`: this project uses `bcryptjs` (pure JavaScript) specifically to avoid that, so make sure you're using the latest version of this project. Also keep the project outside OneDrive (for example `C:\projects\restaurant-erp`): OneDrive locks files during install and causes `EPERM` errors.

### Step 4 — Seed the database
```bash
npm run prisma:seed
npm run seed:site-owner
```
`prisma:seed` creates a demo restaurant ("Gourmet Garden Outlet") with sample menu/tables and one demo login per role, all with the password `password123`: `admin@restaurant.com` (platform admin), `owner@restaurant.com`, `manager@restaurant.com`, `cashier@restaurant.com`, `waiter@restaurant.com`, `kitchen@restaurant.com`, `inventory@restaurant.com`, `menu@restaurant.com`. Useful for exploring the core POS features.
`seed:site-owner` creates your platform-level Site Owner account (`tomsiteowner` / `tom_owner`, or whatever you set in `.env`).

### Step 5 — Start the backend
```bash
npm run start:dev
```
Backend runs at `http://localhost:4000`. Swagger API docs are at `http://localhost:4000/api/docs`.

### Step 6 — Configure and start the frontend (in a second terminal)
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:3000`. No `.env` file is required for local development — it defaults to talking to `http://localhost:4000`. If you need to point it elsewhere, create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

---

## 5. Everyday startup (after first-time setup is done)

Two terminals, both from the project root:

**Terminal 1:**
```bash
cd backend
npm run start:dev
```

**Terminal 2:**
```bash
cd frontend
npm run dev
```

Then open `http://localhost:3000`.

---

## 6. Alternative: run everything with Docker

If you'd rather not install PostgreSQL/Node locally:
```bash
docker compose up --build
```
This starts Postgres, the backend, and the frontend together. Backend on port 4000, frontend on port 3000, Postgres on 5432. You'll still need to run the seed commands once, inside the backend container:
```bash
docker exec -it erp-backend npm run prisma:seed
docker exec -it erp-backend npm run seed:site-owner
```

---

## 7. Default accounts after seeding

| Account | Login | Password | Role |
|---|---|---|---|
| Site Owner | `tomsiteowner` | `tom_owner` | SUPER_ADMIN — platform-wide, not tied to any restaurant |
| Demo platform admin | `admin@restaurant.com` | `password123` | SUPER_ADMIN — same level as the Site Owner, from `prisma:seed` |
| Demo Owner | `owner@restaurant.com` | `password123` | OWNER — of the sample demo restaurant from `prisma:seed` |
| Demo Manager | `manager@restaurant.com` | `password123` | MANAGER — only on databases seeded with this version. **Don't re-run `prisma:seed` on an existing database** (it creates a second demo restaurant); create a manager from Staff Management instead. |

Change both passwords before this ever goes near real users.

---

## 8. Full API reference (backend)

### Auth
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/signup-owner` | Public | Owner sign-up, sends OTP |
| POST | `/auth/verify-otp` | Public | Verify OTP, logs in |
| POST | `/auth/resend-otp` | Public | Resend OTP |
| POST | `/auth/login` | Public | Login (email/ID + password) |
| POST | `/auth/forgot-password` | Public | Password reset request |
| POST | `/auth/reset-password` | Public | Complete password reset |

### Demo
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/demo/quick-login` | Public | 5-min isolated demo restaurant |

### Restaurants
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/restaurants/onboard` | SUPER_ADMIN | Create restaurant + owner together |
| POST | `/restaurants/my-restaurant` | OWNER | Self-service: create your own restaurant |
| GET | `/restaurants` | SUPER_ADMIN, OWNER | List restaurants |
| GET | `/restaurants/overview` | SUPER_ADMIN | Platform-wide revenue/activity summary |
| GET | `/restaurants/:id/revenue` | SUPER_ADMIN | One restaurant's revenue detail |
| GET | `/restaurants/:id` | Authenticated | One restaurant's details |
| PUT | `/restaurants/:id` | SUPER_ADMIN, OWNER | Update restaurant details |
| PATCH | `/restaurants/:id/status` | SUPER_ADMIN | Suspend/reactivate |
| DELETE | `/restaurants/:id` | SUPER_ADMIN | Delete a restaurant |

### Users & Staff
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/staff` | SUPER_ADMIN, OWNER | Create staff with an auto-generated login ID |
| GET | `/staff/restaurant/:restaurantId` | SUPER_ADMIN, OWNER | List a restaurant's staff |
| GET | `/users` | SUPER_ADMIN | List every user on the platform |
| GET | `/users/roles` | SUPER_ADMIN, OWNER | List roles/permissions |
| POST | `/users/roles` | SUPER_ADMIN | Create a new role |

*(Menu, orders, inventory, attendance, complaints, and dashboard endpoints are unchanged from the original system — see their respective controller files under `backend/src/` for details.)*

---

## 9. Project structure

```
restaurant-erp/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # All database models
│   │   └── seed.ts             # Demo restaurant + demo owner seeder
│   ├── scripts/
│   │   └── seed-site-owner.ts  # Site Owner account seeder
│   └── src/
│       ├── auth/                # Login, signup, OTP, JWT
│       ├── restaurant/          # Restaurant CRUD, onboarding, revenue
│       ├── users/                # Staff creation, roles
│       ├── demo/                 # Quick Login demo mode
│       ├── mail/                 # Email sending (OTP, notifications)
│       ├── menu/ order/ inventory/ attendance/ complaint/ dashboard/ notification/ settings/ realtime/
├── frontend/
│   └── src/app/                 # Next.js pages (does NOT yet cover the 6 new features)
└── docker-compose.yml
```

---

## 10. What to build next (suggested order)

1. Test every flow above against a real running database — sign up as an owner, verify the OTP, create a restaurant, add staff, try Quick Login, check the Site Owner panel
2. Configure real SMTP so OTP emails actually send
3. Add a "forgot password" path for staff logging in with a generated ID (not just real-email owners)
4. Consider adding pagination to the Site Owner panel's restaurant list once you have more than a handful of restaurants
