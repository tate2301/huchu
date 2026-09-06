// Load this app's .env, then the repository-root .env for anything it did not
// set, so DATABASE_URL_TEST is available; then override DATABASE_URL with the
// test database before Prisma creates its pool.
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [path.join(__dirname, ".env"), path.join(__dirname, "../../.env")], quiet: true });

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
