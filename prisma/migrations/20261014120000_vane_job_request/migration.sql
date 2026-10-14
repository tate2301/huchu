-- Give Vane a job keeps the person's whole request (approved 14 Oct). The label stays short for
-- the top bar and Working on; the worker reads the request, and the label only when there is none.
ALTER TABLE "VaneJob" ADD COLUMN "request" TEXT;

-- Vane's reader reaches the new column, as `pnpm vane:reader-sql` prints it.
GRANT SELECT ("request") ON "VaneJob" TO vane_reader;
