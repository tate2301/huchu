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

### Phase 1: Daily Heartbeat (CURRENT)
✅ **Shift Report** - 2-minute mobile-first form for daily operations
✅ **Attendance Tracking** - Daily crew attendance and overtime
✅ **Plant Report** - Processing metrics and downtime tracking
✅ **Gold Control** - Pour recording with 2-person witness rule
✅ **Offline-first PWA** - Works without internet, syncs when connected

### Future Phases
- **Phase 2**: Enhanced plant reporting with downtime analytics
- **Phase 3**: Complete gold chain (dispatch, receipts, reconciliation)
- **Phase 4**: Stores inventory and maintenance management
- **Phase 5**: Compliance automation (permits, inspections, incidents)
- **Phase 6**: Cross-mine analytics dashboards

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/tate2301/huchu.git
cd huchu
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Create .env file with:
DATABASE_URL="postgresql://user:password@localhost:5432/huchu"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

4. Initialize the database:
```bash
npx prisma generate
npx prisma db push
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## 🏛️ Architecture

### Tech Stack
- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **UI Components**: Custom components built with Radix UI primitives
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod validation
- **PWA**: Offline-first with IndexedDB

### Database Schema
The system uses a comprehensive Prisma schema covering:
- Company → Sites → Sections
- Users with role-based access (Owner, Manager, Supervisor, Clerk, Operator)
- Shift Reports with workflow (Draft → Submitted → Verified → Approved)
- Plant Reports with downtime tracking
- Gold Control (Pours, Dispatches, Receipts) with audit trail
- Inventory and Stock Movements
- Equipment and Work Orders
- Compliance (Permits, Inspections, Incidents, Training)

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
npm run dev              # Start dev server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Database
npx prisma generate      # Generate Prisma client
npx prisma db push       # Push schema to database
npx prisma studio        # Open Prisma Studio GUI
npx prisma migrate dev   # Create and apply migrations
```

## 📖 Deployment

### Production Checklist
1. Set up PostgreSQL database
2. Configure environment variables
3. Run database migrations
4. Build the application: `npm run build`
5. Start the server: `npm run start`
6. Configure reverse proxy (nginx/Apache)
7. Set up SSL certificates
8. Configure backups

### Environment Variables
```
DATABASE_URL="postgresql://user:password@localhost:5432/huchu"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="https://yourdomain.com"
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
