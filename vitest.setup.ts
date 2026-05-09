// Override DATABASE_URL with the test DB before Prisma creates its pool.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
