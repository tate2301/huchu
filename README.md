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

### Production Checklist (Vercel + Multitenancy)
1. Set up your production PostgreSQL database.
2. Configure Vercel project domains:
   - `apps.pagka.dev`
   - `*.apps.pagka.dev`
3. Configure DNS records for both root and wildcard to point to Vercel.
4. Set production environment variables in Vercel (see below).
5. Deploy and verify tenant login on subdomains.

### Production Environment Variables (Vercel)
```
DATABASE_URL="postgresql://user:password@localhost:5432/huchu"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="https://apps.pagka.dev"
PLATFORM_ROOT_DOMAIN="apps.pagka.dev"
PLATFORM_ROOT_HOSTS="apps.pagka.dev"
BLOB_READ_WRITE_TOKEN="your-vercel-blob-read-write-token"
```

### Multitenancy Notes
1. Production tenant login URLs use:
   - `https://<tenant-slug>.apps.pagka.dev/login`
2. In strict production mode (`PLATFORM_ROOT_DOMAIN` set), users must log in on their tenant subdomain.
3. Recommended preview behavior:
   - leave `PLATFORM_ROOT_DOMAIN` unset in Preview environments to avoid strict host enforcement during QA.

### Post-Deploy Verification
1. Tenant login works:
   - `https://acme.apps.pagka.dev/login`
2. Cross-tenant login is blocked:
   - ACME user cannot log in on `https://other-tenant.apps.pagka.dev/login`
3. Root login is blocked in strict mode:
   - `https://apps.pagka.dev/login`

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
