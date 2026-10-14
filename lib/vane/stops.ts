import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * Muted's choices (PageVaneMuted): when a person keeps setting aside one
 * kind of card, Vane asks once whether to stop showing it to them. "Stop it
 * for me" hides that kind from their own For you (everyone else still gets
 * it); "Keep showing it" stops the asking. Bring back puts a card back in For
 * you, and shows its kind again. Each is the person's own press, kept per
 * person in `VaneCardChoice`.
 *
 * A card keeps no template, so its kind is where it came from and where its
 * button goes: the module and the action's target, or the button's words
 * when it goes nowhere. The nightly look raises "11 follow-ups are overdue"
 * one day and "12 follow-ups are overdue" the next; both open the follow-ups.
 */

type Db = Pick<PrismaClient, "vaneCardChoice">;

/** Times one kind is set aside in a month before Vane asks. */
export const ASK_AFTER = 3;

type CardLike = { sourceModule: string; action: unknown };

/** A card's kind, as `VaneCardChoice.cardKey` keeps it. */
export function cardKey({ sourceModule, action }: CardLike): string {
  const fields = action && typeof action === "object" ? (action as Record<string, unknown>) : {};
  const target = typeof fields.target === "string" ? fields.target.trim() : "";
  if (target) return `${sourceModule}|target|${target}`;
  const label = typeof fields.label === "string" ? fields.label.trim() : "";
  return `${sourceModule}|label|${label}`;
}

/** The cards of one kind, as a filter on `VaneItem`. */
function kindWhere(key: string): Prisma.VaneItemWhereInput | null {
  const match = /^(.*?)\|(target|label)\|(.*)$/.exec(key);
  if (!match) return null;
  const [, sourceModule, field, value] = match;
  return { sourceModule, action: { path: [field!], equals: value! } };
}

/** The kinds this person stopped. */
export async function stoppedKeys(db: Db, companyId: string, userId: string): Promise<string[]> {
  const rows = await db.vaneCardChoice.findMany({ where: { companyId, userId, stopped: true }, select: { cardKey: true } });
  return rows.map((row) => row.cardKey);
}

/** Leaves out the kinds of card this person stopped: add it to a For you filter. */
export async function notStopped(db: Db, companyId: string, userId: string): Promise<Prisma.VaneItemWhereInput> {
  const kinds = (await stoppedKeys(db, companyId, userId)).flatMap((key) => kindWhere(key) ?? []);
  return kinds.length ? { NOT: kinds } : {};
}

// ---------------------------------------------------------------------------
// The question on Muted: "You set aside … 3 times this month."

export type StopOffer = {
  /** The newest card of the kind set aside, which the choice is made from. */
  itemId: string;
  headline: string;
  times: number;
};

type SetAside = { id: string; headline: string; sourceModule: string; action: unknown; resolvedAt: Date | null };

/**
 * The kind this person set aside most this month, when it is `ASK_AFTER`
 * times or more and they have not answered for it yet. `setAside` is their own
 * set-aside cards, newest first.
 */
export function stopOffer(setAside: SetAside[], answered: ReadonlySet<string>, monthStart: Date): StopOffer | null {
  const kinds = new Map<string, { newest: SetAside; times: number }>();
  for (const item of setAside) {
    if (!item.resolvedAt || item.resolvedAt < monthStart) continue;
    const key = cardKey(item);
    if (answered.has(key)) continue;
    const kind = kinds.get(key);
    if (kind) kind.times += 1;
    else kinds.set(key, { newest: item, times: 1 });
  }
  const most = [...kinds.values()].sort((a, b) => b.times - a.times)[0];
  return most && most.times >= ASK_AFTER ? { itemId: most.newest.id, headline: most.newest.headline, times: most.times } : null;
}

// ---------------------------------------------------------------------------
// A person's presses.

export const chooseSchema = z.object({ stopped: z.boolean() });

type ItemDb = Pick<PrismaClient, "vaneItem" | "vaneCardChoice">;
type Who = { companyId: string; userId: string; audience: Prisma.VaneItemWhereInput };

/** Stop it for me, or Keep showing it, for the kind of a card this person can see. False when the card is not theirs. */
export async function chooseForKind(db: ItemDb, who: Who & { itemId: string; stopped: boolean }): Promise<boolean> {
  const item = await db.vaneItem.findFirst({
    where: { id: who.itemId, companyId: who.companyId, ...who.audience },
    select: { sourceModule: true, action: true },
  });
  if (!item) return false;
  const key = cardKey(item);
  await db.vaneCardChoice.upsert({
    where: { companyId_userId_cardKey: { companyId: who.companyId, userId: who.userId, cardKey: key } },
    create: { companyId: who.companyId, userId: who.userId, cardKey: key, stopped: who.stopped },
    update: { stopped: who.stopped },
  });
  return true;
}

/**
 * Bring back: a set-aside card goes back to For you, its reason cleared, and
 * when this person had stopped its kind, the kind shows again. False when the
 * card is not set aside or not theirs.
 */
export async function bringBack(db: ItemDb, who: Who & { itemId: string }): Promise<boolean> {
  const item = await db.vaneItem.findFirst({
    where: { id: who.itemId, companyId: who.companyId, status: "MUTED", ...who.audience },
    select: { id: true, sourceModule: true, action: true },
  });
  if (!item) return false;
  const { count } = await db.vaneItem.updateMany({
    where: { id: item.id, status: "MUTED" },
    data: { status: "OPEN", mutedReason: null, resolvedAt: null, resolvedById: null },
  });
  if (count === 0) return false;
  await db.vaneCardChoice.deleteMany({
    where: { companyId: who.companyId, userId: who.userId, cardKey: cardKey(item), stopped: true },
  });
  return true;
}
