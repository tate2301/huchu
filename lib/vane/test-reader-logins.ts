import { prisma } from "@/lib/prisma";

/**
 * For tests only: signs Vane's reader in as two test logins that are members
 * of `vane_reader` and `vane_reader_private`. The real roles cannot sign in on
 * a test database (the migration witness checks that); row policies and column
 * grants apply to members, so the logins read exactly as the roles do.
 */
export async function useTestReaderLogins(): Promise<void> {
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_vane_login') THEN
      CREATE ROLE test_vane_login LOGIN PASSWORD 'test_vane_login' IN ROLE vane_reader;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_vane_private_login') THEN
      CREATE ROLE test_vane_private_login LOGIN PASSWORD 'test_vane_private_login' IN ROLE vane_reader_private;
    END IF;
  END $$`);
  process.env.VANE_READER_DATABASE_URL = loginUrl("test_vane_login");
  process.env.VANE_READER_PRIVATE_DATABASE_URL = loginUrl("test_vane_private_login");
}

function loginUrl(role: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.username = role;
  url.password = role;
  return url.toString();
}
