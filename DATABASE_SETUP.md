# Database Setup Guide

This guide explains how to set up the PostgreSQL database for the Huchu Mine Operations System.

## Prerequisites

- PostgreSQL 14 or later
- Node.js 18 or later
- npm or yarn

## Step 1: Install PostgreSQL

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### macOS
```bash
brew install postgresql@14
brew services start postgresql@14
```

### Windows
Download and install from https://www.postgresql.org/download/windows/

## Step 2: Create Database

```bash
# Switch to postgres user (Linux/macOS)
sudo -u postgres psql

# Or connect directly (if configured)
psql -U postgres
```

Then in the PostgreSQL shell:

```sql
-- Create database
CREATE DATABASE huchu_mines;

-- Create user (optional, for production)
CREATE USER huchu_admin WITH ENCRYPTED PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE huchu_mines TO huchu_admin;

-- Exit
\q
```

## Step 3: Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and update the `DATABASE_URL`:

```env
# For local development with postgres user
DATABASE_URL="postgresql://postgres:password@localhost:5432/huchu_mines?schema=public"

# Or with custom user
DATABASE_URL="postgresql://huchu_admin:your_secure_password@localhost:5432/huchu_mines?schema=public"

# Generate a secret for NextAuth
NEXTAUTH_SECRET="<generate-with-openssl-rand-base64-32>"
NEXTAUTH_URL="http://localhost:3000"
```

Generate a secure NextAuth secret:

```bash
openssl rand -base64 32
```

## Step 4: Run Prisma Migrations

```bash
# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# Or use migrations (recommended for production)
npx prisma migrate dev --name init
```

## Step 5: Seed Initial Data (Optional)

Create a seed script or manually add initial data:

```bash
# Open Prisma Studio to add data via GUI
npx prisma studio
```

### Example Seed Data

You should create:

1. **Company**: Huchu Enterprises
2. **Sites**: 5 mine sites with unique codes
3. **Users**: 
   - 1 Owner
   - 1 Manager
   - 2 Supervisors
   - 2 Clerks
4. **Downtime Codes**: Standard codes (power, water, fuel, etc.)

### Sample SQL for Initial Setup

```sql
-- Insert Company
INSERT INTO "Company" (id, name, "createdAt", "updatedAt")
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Huchu Enterprises', NOW(), NOW());

-- Insert Sites
INSERT INTO "Site" (id, name, code, "companyId", "isActive", "measurementUnit", "createdAt", "updatedAt")
VALUES 
  (gen_random_uuid(), 'Mine Site 1', 'SITE1', '550e8400-e29b-41d4-a716-446655440000', true, 'tonnes', NOW(), NOW()),
  (gen_random_uuid(), 'Mine Site 2', 'SITE2', '550e8400-e29b-41d4-a716-446655440000', true, 'tonnes', NOW(), NOW()),
  (gen_random_uuid(), 'Mine Site 3', 'SITE3', '550e8400-e29b-41d4-a716-446655440000', true, 'tonnes', NOW(), NOW()),
  (gen_random_uuid(), 'Mine Site 4', 'SITE4', '550e8400-e29b-41d4-a716-446655440000', true, 'tonnes', NOW(), NOW()),
  (gen_random_uuid(), 'Mine Site 5', 'SITE5', '550e8400-e29b-41d4-a716-446655440000', true, 'tonnes', NOW(), NOW());

-- Insert Admin User (password: admin123 - hashed with bcrypt)
INSERT INTO "User" (id, email, name, password, role, "companyId", "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(), 
  'admin@huchu.com', 
  'Admin User', 
  '$2a$10$K7L8kf5v0F.LxJXQxF3uI.qP5QY4mZ8vH5P7YxJ8K9.L5X7F8Y9Z0', -- bcrypt hash of 'admin123'
  'OWNER', 
  '550e8400-e29b-41d4-a716-446655440000', 
  true, 
  NOW(), 
  NOW()
);

-- Insert Downtime Codes
INSERT INTO "DowntimeCode" (id, code, description, category, "isActive", "createdAt", "updatedAt")
VALUES 
  (gen_random_uuid(), 'NO_POWER', 'No power', 'INFRASTRUCTURE', true, NOW(), NOW()),
  (gen_random_uuid(), 'NO_WATER', 'No water', 'INFRASTRUCTURE', true, NOW(), NOW()),
  (gen_random_uuid(), 'EQUIPMENT_BREAKDOWN', 'Equipment breakdown', 'MECHANICAL', true, NOW(), NOW()),
  (gen_random_uuid(), 'NO_FUEL', 'No fuel/diesel', 'SUPPLY', true, NOW(), NOW()),
  (gen_random_uuid(), 'NO_SPARES', 'No spares/parts', 'SUPPLY', true, NOW(), NOW()),
  (gen_random_uuid(), 'NO_GRINDING_MEDIA', 'No grinding media', 'SUPPLY', true, NOW(), NOW()),
  (gen_random_uuid(), 'LABOUR_SHORTAGE', 'Labour shortage', 'HUMAN', true, NOW(), NOW()),
  (gen_random_uuid(), 'WEATHER', 'Weather/flooding', 'ENVIRONMENTAL', true, NOW(), NOW());
```

## Step 6: Verify Setup

```bash
# Check database connection
npx prisma db pull

# View database in Prisma Studio
npx prisma studio
```

## Step 7: Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000 and log in with your credentials.

## Production Deployment

### Environment Variables for Production

```env
DATABASE_URL="postgresql://user:password@production-host:5432/huchu_mines?schema=public"
NEXTAUTH_SECRET="<long-random-string>"
NEXTAUTH_URL="https://your-production-domain.com"
```

### Security Checklist

- [ ] Use strong database passwords
- [ ] Enable SSL for database connections
- [ ] Use environment variables (never commit credentials)
- [ ] Enable database backups
- [ ] Set up monitoring and alerting
- [ ] Use read replicas for reporting (optional)
- [ ] Enable row-level security (RLS) if needed
- [ ] Regularly update dependencies

## Troubleshooting

### Connection Refused

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check PostgreSQL port
sudo netstat -plnt | grep 5432
```

### Authentication Failed

```bash
# Reset postgres password
sudo -u postgres psql
ALTER USER postgres PASSWORD 'newpassword';
```

### Prisma Client Not Found

```bash
# Regenerate Prisma Client
npx prisma generate
```

### Migration Errors

```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Force push schema
npx prisma db push --force-reset
```

## Backup and Restore

### Backup

```bash
pg_dump -U postgres huchu_mines > backup_$(date +%Y%m%d).sql
```

### Restore

```bash
psql -U postgres huchu_mines < backup_20260109.sql
```

## Performance Tips

1. Create indexes on frequently queried fields (already in schema)
2. Use connection pooling (Prisma handles this)
3. Enable query logging for debugging
4. Monitor slow queries
5. Regular VACUUM and ANALYZE

For more information, see:
- Prisma Documentation: https://www.prisma.io/docs
- PostgreSQL Documentation: https://www.postgresql.org/docs/
- NextAuth Documentation: https://next-auth.js.org/
