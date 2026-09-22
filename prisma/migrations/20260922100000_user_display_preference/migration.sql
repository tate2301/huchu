-- Somewhere to keep the Appearance board's Display section.
--
-- `Appearance.dc.html` draws three controls under Display — Density, Open on
-- and Reduce motion — and a Save/Cancel footer under them. Nothing in the
-- database could hold any of it: the only per-user preference row in the schema
-- is `UserNotificationPreference`, `User` is entirely scalar, and the theme
-- choice lives in `localStorage` under `huchu.appearance` where no server ever
-- sees it. The footer had nothing to save.
--
-- This is the smallest table that changes that, and it is a copy of the one
-- preference table that already exists: one flat row per user, one typed column
-- per control, unique on `userId`, cascading with the user. Deliberately NOT a
-- JSON settings blob on `User` — nothing in this schema stores preferences that
-- way, and a blob would give up the typing every other preference row has.
--
-- The theme is NOT here. It has to be applied before first paint or the page
-- flashes the wrong one, so it stays in the browser where the provider can read
-- it synchronously on mount. A server round trip cannot be awaited there.
--
-- Defaults are the board's own defaults and the columns are NOT NULL, so a user
-- who has never opened Appearance reads exactly like one who has and changed
-- nothing. No backfill: the absence of a row is the same answer as a row of
-- defaults, which is why the read falls back to these values rather than
-- creating rows for every existing account.

CREATE TABLE "UserDisplayPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "density" TEXT NOT NULL DEFAULT 'comfortable',
    "openOn" TEXT NOT NULL DEFAULT 'dashboard',
    "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDisplayPreference_pkey" PRIMARY KEY ("id")
);

-- Unique, not merely indexed: a second display row for one person is not a
-- state the application can resolve, and the upsert in
-- `/api/preferences/appearance` depends on this constraint to be atomic.
CREATE UNIQUE INDEX "UserDisplayPreference_userId_key" ON "UserDisplayPreference"("userId");

-- Cascade: a preference is meaningless once the person it belongs to is gone,
-- and it is not a record anybody audits. This matches
-- `UserNotificationPreference_userId_fkey`.
ALTER TABLE "UserDisplayPreference"
  ADD CONSTRAINT "UserDisplayPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The values are checked in the route with zod, the way every neighbouring
-- route validates, not with a CHECK constraint. `SubscriptionPayment.status`
-- and every other small vocabulary in this schema is a documented TEXT column
-- for the same reason: adding a value must not require a migration.
