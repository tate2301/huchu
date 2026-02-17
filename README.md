# Huchu Enterprises - Mine Operations System

A lightweight web application for digitizing day-to-day operations across 5 small-scale gold mines in Zimbabwe.

## 🎯 Project Goals

Build one simple web app that managers and clerks actually use every day. Not an ERP. Not a science project. A lightweight system that makes the ore-to-gold-to-cash chain visible, reduces leakage, and produces clean reports when needed.

## 🏗️ What We're Building

This is a mine operating system for 5 sites covering:

- **Daily reality**: What work happened, what got produced, and what blocked us (per shift)
- **Cost control**: Fuel, spares, consumables, and who requested/approved/issued them
- **Gold control**: Pours, storage, dispatch, receipts, and reconciliation
- **People**: Attendance and payroll inputs
- **Compliance hygiene**: Permits, EIA, inspections, incident logs, and quick exports

## 📱 Key Features

### Phase 1: Daily Heartbeat ✅ COMPLETE
- ✅ **Shift Report** - 2-minute mobile-first form for daily operations
- ✅ **Attendance Tracking** - Daily crew attendance and overtime
- ✅ **Plant Report** - Processing metrics and downtime tracking
- ✅ **Gold Control** - Pour recording with 2-person witness rule
- ✅ **Dashboard** - Module navigation and quick stats

### Phase 2: Processing + Downtime ✅ COMPLETE
- ✅ **Downtime Analytics** - Top causes by site with visual rankings
- ✅ **System Status Tracker** - Always-visible progress tracking
- ⭕ Trend Charts (placeholder)
- ⭕ Weekly Reports (pending)

### Phase 3: Gold Control ✅ COMPLETE
- ✅ **Dispatch Manifest** - Chain of custody documentation
- ✅ **Buyer Receipt** - Assay results and payment tracking
- ✅ **Reconciliation View** - Complete pour-to-payment chain
- ✅ **Audit Trail** - Immutable activity log

### Phase 4: Stores + Maintenance 🔧 IN PROGRESS
- ⭕ Inventory Management
- ⭕ Fuel Ledger
- ⭕ Equipment Register
- ⭕ Work Orders

### Phase 5: Compliance ⭕ PENDING
- ⭕ Permit Calendar
- ⭕ Incident Reports
- ⭕ Training Matrix
- ⭕ Audit Exports

### Phase 6: Analytics ⭕ PENDING
- ⭕ Cross-Mine Dashboard
- ⭕ Production Trends
- ⭕ Cost Analysis
- ⭕ Safety Metrics

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- pnpm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/tate2301/huchu.git
cd huchu
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your PostgreSQL connection string
# DATABASE_URL="postgresql://user:password@localhost:5432/huchu_mines"
# NEXTAUTH_SECRET="<generate-with-openssl-rand-base64-32>"
# NEXTAUTH_URL="http://localhost:3000"
# BLOB_READ_WRITE_TOKEN="<vercel-blob-read-write-token>"
```

4. Initialize the database:
```bash
pnpm prisma generate
pnpm prisma db push
```

For detailed database setup instructions, see [DATABASE_SETUP.md](./DATABASE_SETUP.md)

5. Run the development server:
```bash
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

### Default Login (After Seeding)
- **Email**: admin@huchu.com
- **Password**: admin123

## 🏛️ Architecture

### Tech Stack
- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **Authentication**: NextAuth.js with credential provider
- **UI Components**: Custom components built with Radix UI primitives
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod validation
- **PWA**: Offline-first with service workers and IndexedDB

### Database Schema
The system uses a comprehensive Prisma schema covering:
- Company → Sites → Sections (multi-tenant)
- Users with role-based access (Superadmin, Manager, Clerk)
- Shift Reports with workflow (Draft → Submitted → Verified → Approved)
- Plant Reports with downtime tracking
- Gold Control (Pours, Dispatches, Receipts) with audit trail
- Inventory and Stock Movements
- Equipment and Work Orders
- Compliance (Permits, Inspections, Incidents, Training)
- NextAuth models (Account, Session, VerificationToken)

## 📋 UX Principles

### Mobile-First Design
- One main action per screen (no clutter)
- Big touch targets (44px minimum)
- Short forms with smart defaults
- Progressive disclosure (basic → advanced)
- Photos as evidence instead of typing

### Offline Support
- Works without internet
- Saves drafts locally
- Auto-syncs when connected
- Clear sync status indicators

### Speed & Adoption
- Shift report in 2 minutes max
- WhatsApp-friendly exports
- One-page cheat sheets
- Parallel paper tracking during rollout

## 🔒 Security

- Role-based access control (RBAC)
- 2FA for privileged roles (gold + admin)
- Immutable records after approval
- Append-only audit log for sensitive operations
- Corrections tracked, not silent edits

## 📊 Key Metrics Tracked

### Daily
- Ore moved per mine/section
- Tonnes processed and plant run hours
- Gold poured and dispatched
- Downtime hours + causes
- Attendance percentage

### Weekly
- Production trends
- Recovery proxy (gold vs tonnes)
- Fuel usage and variance
- Stockout risk
- Top maintenance issues

### Monthly
- Mine-to-market reconciliation
- Cost-per-gram analysis
- Compliance dashboard
- Permit expiries

## 🛠️ Development

### Project Structure
```
/app                    # Next.js app directory
  /shift-report        # Shift reporting module
  /attendance          # Attendance tracking
  /plant-report        # Plant operations
  /gold                # Gold control (high security)
  /stores              # Inventory management
  /maintenance         # Equipment & work orders
  /compliance          # Safety & regulatory
  /dashboard           # Analytics
  /reports             # Exports
/components            # Reusable UI components
  /ui                  # Base UI components
/lib                   # Utilities and helpers
/prisma                # Database schema and migrations
```

### Key Commands

```bash
# Development
pnpm dev                 # Start dev server
pnpm build               # Build for production
pnpm start               # Start production server
pnpm lint                # Run ESLint

# Database
pnpm prisma generate     # Generate Prisma client
pnpm db:prepare:platform # Backfill legacy Company rows for platform tenancy fields
pnpm db:push             # Backfill + push schema to database
pnpm prisma studio       # Open Prisma Studio GUI
pnpm prisma migrate dev  # Create and apply migrations

# User management
pnpm create-user --email user@example.com --name "User Name" --password "securepass" --role manager --company-id <uuid>

# Employee management
pnpm create-employee --employee-id EMP001 --name "Employee Name" --phone "+263..." --next-of-kin-name "Kin Name" --next-of-kin-phone "+263..." --passport-photo-url "https://..." --village-of-origin "Village" --company-id <uuid>
pnpm manage-employees list --company-id <uuid> --active
pnpm manage-employees update --employee-id EMP001 --company-id <uuid> --phone "+263..." --inactive

# Inventory management (consumables)
pnpm manage-inventory create --item-code CON001 --name "Safety gloves" --unit "pairs" --location-id <uuid> --site-id <uuid> --current-stock 20 --min-stock 10
pnpm manage-inventory list --company-id <uuid> --category consumables
pnpm manage-inventory update --item-code CON001 --site-id <uuid> --unit "pair"

# Equipment management
pnpm manage-equipment create --equipment-code EQ001 --name "Crusher 1" --category crusher --site-id <uuid>
pnpm manage-equipment list --company-id <uuid> --active
pnpm manage-equipment update --equipment-code EQ001 --site-id <uuid> --inactive

# Platform management
# Ink TUI app (default)
pnpm platform --actor ops@huchu.com
pnpm platform --actor ops@huchu.com --company-id <uuid>
pnpm platform --actor ops@huchu.com --read-only

# Legacy command mode (kept for automation)
pnpm manage-platform --actor ops@huchu.com
pnpm manage-platform org list --status active
pnpm manage-platform org show --id <uuid>
pnpm manage-platform org suspend --id <uuid> --actor ops@huchu.com --reason "compliance hold"
pnpm manage-platform org activate --id <uuid> --actor ops@huchu.com --reason "restored"

# Ink TUI shortcuts
# Up/Down select, Left/Right pane, Enter action
# / or p command palette, g Organizations, r read-only toggle, q quit
```

## 📖 Deployment

### Production Checklist
1. Set up PostgreSQL database
2. Configure environment variables
3. Run database migrations
4. Build the application: `pnpm build`
5. Start the server: `pnpm start`
6. Configure reverse proxy (nginx/Apache)
7. Set up SSL certificates
8. Configure backups

### Environment Variables
```
DATABASE_URL="postgresql://user:password@localhost:5432/huchu"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="https://yourdomain.com"
BLOB_READ_WRITE_TOKEN="your-vercel-blob-read-write-token"
```

## 🎓 Training & Rollout

### Rollout Strategy
1. Pick 1 pilot mine
2. Identify 1 champion clerk
3. Train supervisor + clerk (30 minutes)
4. Run paper and app in parallel (7-14 days)
5. Daily dashboard review with manager
6. Fix friction fast
7. Official switch when accuracy proven

### Support Materials
- One-page cheat sheets (to be created)
- Video tutorials (to be created)
- WhatsApp support group
- Weekly check-ins during rollout

## 📝 License

Copyright © 2026 Huchu Enterprises. All rights reserved.

## 👥 Contact

**Prepared by**: Christopher Chinyamakobvu  
**Company**: Huchu Enterprises  
**Date**: 08 January 2026

---

**Status**: Phase 1 - Daily Heartbeat Implementation Complete  
**Next**: Deploy to pilot site and gather feedback
