// The repository-root .env, as the hosts read it (a .env beside this package
// wins), then the test database before Prisma creates its pool.
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [path.join(__dirname, ".env"), path.join(__dirname, "../../../.env")], quiet: true });

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
