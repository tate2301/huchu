import { prisma } from "@/lib/prisma";

/**
 * When each person was last seen (80-admin 5.1, "Last in"): the latest of
 * their `auth.login.success` (whose actor is the email they signed in with,
 * or their id when they have none), any audit event they are the actor of,
 * and their PIN's `lastUnlockedAt` (the caller adds that). One grouped query
 * each, on the `(companyId, actor, createdAt)` index.
 */
export async function lastSeenFor(
  companyId: string,
  people: Array<{ id: string; email: string | null }>,
): Promise<Map<string, Date>> {
  const seen = new Map<string, Date>();
  if (people.length === 0) return seen;
  const ids = people.map((person) => person.id);
  const emails = people.flatMap((person) => (person.email ? [person.email.toLowerCase()] : []));
  const byEmail = new Map(people.flatMap((person) => (person.email ? [[person.email.toLowerCase(), person.id]] : [])));

  const [signIns, acts] = await Promise.all([
    emails.length
      ? prisma.platformAuditEvent.groupBy({
          by: ["actor"],
          where: { companyId, eventType: "auth.login.success", actor: { in: emails } },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
    prisma.platformAuditEvent.groupBy({
      by: ["actor"],
      where: { companyId, actor: { in: ids } },
      _max: { createdAt: true },
    }),
  ]);

  const note = (id: string | undefined, at: Date | null | undefined) => {
    if (!id || !at) return;
    const known = seen.get(id);
    if (!known || known.getTime() < at.getTime()) seen.set(id, at);
  };
  for (const row of signIns) note(byEmail.get((row.actor ?? "").toLowerCase()), row._max.createdAt);
  for (const row of acts) note(row.actor ?? undefined, row._max.createdAt);
  return seen;
}
