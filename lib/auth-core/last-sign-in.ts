import { prisma } from "@/lib/prisma";

/**
 * When somebody last signed in, read from the ledger rather than a column.
 *
 * `User` has no `lastSeenAt` and deliberately does not get one: a column like
 * that has to be written on every request to stay true, and the truth is
 * already recorded. `logAuthEvent` (`lib/auth-core/events.ts`) writes a
 * `PlatformAuditEvent` on every successful sign-in — both the credentials
 * strategy and the admin magic link — with `actor` set to the normalised
 * lowercase email and `createdAt` set by the database. `@@index([eventType,
 * createdAt])` is already on the model, so these reads are indexed.
 *
 * Two things this is honest about:
 *
 *   - It is last **sign-in**, not last seen. A session can stay open for a
 *     fortnight; nothing here knows that. Screens label it accordingly.
 *   - The stored event type is `auth.login.success`. `USER.LOGIN` is a display
 *     name the boards draw in the trail's mono chip; nothing writes that
 *     literal, and matching on it would return nothing forever.
 */
export const LOGIN_SUCCESS_EVENT = "auth.login.success";

/**
 * The record page's read: one indexed `findFirst` for the person being looked
 * at. Returns null when they have never signed in — which the register draws
 * as "Never signed in" rather than as a blank.
 */
export async function findLastSignInAt(input: {
  companyId: string;
  email: string;
}): Promise<Date | null> {
  const event = await prisma.platformAuditEvent.findFirst({
    where: {
      companyId: input.companyId,
      eventType: LOGIN_SUCCESS_EVENT,
      actor: input.email.trim().toLowerCase(),
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return event?.createdAt ?? null;
}

/**
 * The register's read: **one** query for the whole page, not one per row.
 *
 * A `findFirst` per user would be 25 round trips to draw one list, and the list
 * is paged — so it would be 25 every time somebody types in the search box. A
 * `groupBy` over the page's own emails is a single grouped index scan and
 * returns the same answer.
 *
 * Keyed by the normalised email because that is what `actor` holds; callers
 * pass `User.email`, which the credentials strategy lowercases before it
 * writes. An email the ledger has never seen is simply absent from the map.
 */
export async function findLastSignInByEmail(input: {
  companyId: string;
  emails: string[];
}): Promise<Map<string, Date>> {
  const normalised = Array.from(
    new Set(input.emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  );
  if (normalised.length === 0) return new Map();

  const rows = await prisma.platformAuditEvent.groupBy({
    by: ["actor"],
    where: {
      companyId: input.companyId,
      eventType: LOGIN_SUCCESS_EVENT,
      actor: { in: normalised },
    },
    _max: { createdAt: true },
  });

  const byEmail = new Map<string, Date>();
  for (const row of rows) {
    const at = row._max.createdAt;
    if (row.actor && at) byEmail.set(row.actor, at);
  }
  return byEmail;
}
