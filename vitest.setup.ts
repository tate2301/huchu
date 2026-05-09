// Load .env so DATABASE_URL_TEST is available, then override DATABASE_URL
// with the test DB before Prisma creates its pool.
import "dotenv/config";

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
