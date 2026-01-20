# Production Deployment Guide

## Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL 14+ database
- Domain with SSL certificate (recommended)

## Environment Setup

1. Copy environment template:
```bash
cp .env.example .env
```

2. Configure required variables in `.env`:

### Database
```
DATABASE_URL="postgresql://username:password@host:port/database?schema=public"
```

### Authentication
```
NEXTAUTH_SECRET="<generate-with: openssl rand -base64 32>"
NEXTAUTH_URL="https://your-domain.com"
```

## Database Setup

1. Install Prisma CLI (if not installed):
```bash
pnpm add -g prisma
```

2. Generate Prisma Client:
```bash
pnpm prisma generate
```

3. Create database schema:
```bash
pnpm prisma db push
```

4. Seed initial data (using Prisma Studio):
```bash
pnpm prisma studio
```

### Required Seed Data

**Company:**
- Create your company record

**Sites:**
- Add all 5 mine sites with unique codes

**Downtime Codes:**
- NO_POWER - No power
- NO_WATER - No water
- EQUIPMENT_BREAKDOWN - Equipment breakdown
- NO_FUEL - No fuel/diesel
- NO_SPARES - No spares/parts
- NO_EXPLOSIVES - No explosives
- NO_GRINDING_MEDIA - No grinding media
- NO_REAGENTS - No reagents/chemicals
- LABOUR_SHORTAGE - Labour shortage
- SECURITY - Security incident
- WEATHER - Weather/flooding
- GEOLOGY - Geology/ground conditions
- OTHER - Other

**Users:**
- Create admin user with SUPERADMIN role
- Create manager and clerk users as needed

Example:
```bash
pnpm create-user --email admin@huchu.com --name "Admin User" --password "admin123" --role superadmin --company-id <company-uuid>
```

## Build and Deploy

### Development
```bash
pnpm install
pnpm dev
```

### Production Build
```bash
pnpm install --prod
pnpm build
pnpm start
```

### Using Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable
RUN pnpm install --prod
COPY . .
RUN pnpm prisma generate
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

## API Endpoints

All API routes require authentication via NextAuth session.

### Shift Reports
- `GET /api/shift-reports` - List reports (paginated)
- `POST /api/shift-reports` - Create report
- `GET /api/shift-reports/[id]` - Get single report
- `PATCH /api/shift-reports/[id]` - Update/workflow action
- `DELETE /api/shift-reports/[id]` - Delete draft report

### Plant Reports
- `GET /api/plant-reports` - List reports
- `POST /api/plant-reports` - Create report with downtime events

### Gold Operations
- `GET /api/gold/pours` - List pours
- `POST /api/gold/pours` - Record pour (requires 2 witnesses)

### Inventory
- `GET /api/inventory/items` - List items
- `POST /api/inventory/items` - Add item
- `POST /api/inventory/movements` - Record movement (issue/receive)

### Equipment & Maintenance
- `GET /api/equipment` - List equipment
- `POST /api/equipment` - Add equipment
- `GET /api/work-orders` - List work orders
- `POST /api/work-orders` - Create work order

### Analytics
- `GET /api/analytics/downtime` - Downtime analysis by site

### Reference Data
- `GET /api/sites` - List sites

## Workflow States

Reports follow this workflow:
1. **DRAFT** - Initial creation, editable
2. **SUBMITTED** - Submitted for review, read-only
3. **VERIFIED** - Verified by manager, locked
4. **APPROVED** - Approved by superadmin, immutable

## Security Features

- Session-based authentication (JWT)
- Role-based access control (3 roles)
- Company-scoped data isolation
- 2-person witness rule for gold operations
- Immutable records after approval
- Audit logging on all operations

## Role Permissions

- **SUPERADMIN**: Full access, can approve all
- **MANAGER**: Can verify and manage operations
- **CLERK**: Can enter data and submit reports

## Performance Optimization

1. Enable database connection pooling
2. Use CDN for static assets
3. Enable Next.js image optimization
4. Configure caching headers
5. Use database indexes (already in schema)

## Monitoring

Monitor these metrics:
- API response times
- Database query performance
- Error rates
- User activity
- Data completeness (daily reports submitted)

## Backup Strategy

1. Daily automated PostgreSQL backups
2. Retain backups for 30 days minimum
3. Test restore procedures monthly
4. Store backups off-site

## Support

For issues:
1. Check application logs
2. Check database connectivity
3. Verify environment variables
4. Review Prisma migrations
5. Check NextAuth configuration

## Production Checklist

- [ ] Database configured and migrated
- [ ] Environment variables set
- [ ] SSL certificate installed
- [ ] Seed data loaded
- [ ] Admin user created
- [ ] Backup strategy implemented
- [ ] Monitoring configured
- [ ] Domain DNS configured
- [ ] Build succeeds
- [ ] Tests pass
- [ ] Performance tested
- [ ] Security audit completed
