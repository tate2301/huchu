import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";

/**
 * A one-use ticket that signs a user in on another host.
 *
 * Sessions are per host and each workspace lives on its own subdomain, so the
 * page that finishes a signup cannot give its visitor a session for the
 * workspace. It gives them one of these instead. The token is 256 random bits,
 * stored only as its SHA-256, good for two minutes and spent on first use.
 */

export const SESSION_HANDOFF_TTL_MS = 2 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSessionHandoff(
  userId: string,
  now = new Date(),
  options: { signInAsSessionId?: string } = {},
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.sessionHandoff.create({
    data: {
      userId,
      signInAsSessionId: options.signInAsSessionId ?? null,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SESSION_HANDOFF_TTL_MS),
      createdAt: now,
    },
  });
  return token;
}

/**
 * Spend a ticket. Returns the user it was issued to — and, for an operator
 * signing in as that user, the sign-in-as session — or null when the token is
 * unknown, expired or already used. The three are not told apart, because the
 * caller does the same thing for all of them.
 */
export async function consumeSessionHandoff(
  token: string,
  now = new Date(),
): Promise<{ userId: string; signInAsSessionId: string | null } | null> {
  const value = String(token ?? "").trim();
  if (!value) return null;

  const row = await prisma.sessionHandoff.findUnique({
    where: { tokenHash: hashToken(value) },
    select: { id: true, userId: true, signInAsSessionId: true },
  });
  if (!row) return null;

  const spent = await prisma.sessionHandoff.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });

  return spent.count === 1 ? { userId: row.userId, signInAsSessionId: row.signInAsSessionId } : null;
}
