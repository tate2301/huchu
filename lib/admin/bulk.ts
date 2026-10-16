import { NextResponse } from "next/server";
import { z } from "zod";

import { AdminRefusal } from "@/lib/admin/refusal";
import { getSignedInOperator, OperatorRefusal, type SignedInOperator } from "@/lib/operators/guards";
import { operatorCan, type OperatorAction } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";

/**
 * A bulk action from an admin list: the ticked ids, each done on its own.
 *
 * One refusal does not stop the rest — suspending forty workspaces where two
 * are already suspended suspends thirty-eight and names the two. Each id is
 * checked again on the server; the page's ticks are only a request.
 */

export type BulkRefused = { id: string; name: string; error: string };
export type BulkOutcome = { done: number; refused: BulkRefused[] };

export const BULK_CAP = 500;

export const bulkBody = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_CAP),
  reason: z.string().max(300).optional(),
});

export type BulkBody = z.infer<typeof bulkBody>;

/** Runs `each` for every id, collecting refusals in words; anything else is a fault and stops the run. */
export async function eachOf<T extends { id: string; name: string }>(
  ids: string[],
  find: (ids: string[]) => Promise<T[]>,
  each: (record: T) => Promise<unknown>,
  noun: string,
): Promise<BulkOutcome> {
  const records = await find(ids);
  const known = new Map(records.map((record) => [record.id, record]));
  const outcome: BulkOutcome = { done: 0, refused: [] };
  for (const id of ids) {
    const record = known.get(id);
    if (!record) {
      outcome.refused.push({ id, name: id, error: `That ${noun} no longer exists.` });
      continue;
    }
    try {
      await each(record);
      outcome.done += 1;
    } catch (error) {
      if (error instanceof AdminRefusal || error instanceof OperatorRefusal) {
        outcome.refused.push({ id, name: record.name, error: error.message });
      } else {
        throw error;
      }
    }
  }
  return outcome;
}

/**
 * A bulk endpoint: the operator, the permission, the body, then `run`. Answers
 * 200 with the outcome while anything was done, and 400 with the first refusal
 * when nothing was, so the confirm dialog shows it and stays open.
 */
export function bulkRoute<B extends z.ZodTypeAny = typeof bulkBody>(
  permission: OperatorAction,
  run: (operator: SignedInOperator, body: z.infer<B>) => Promise<BulkOutcome>,
  schema?: B,
) {
  return async function POST(request: Request) {
    const operator = await getSignedInOperator();
    if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
    if (!operatorCan(operator.role, permission)) {
      return NextResponse.json({ error: "Your role cannot do that." }, { status: 403 });
    }
    const parsed = (schema ?? (bulkBody as unknown as B)).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
    try {
      const outcome = await run(operator, parsed.data);
      if (outcome.done === 0 && outcome.refused.length > 0) {
        const first = outcome.refused[0]!;
        const more = outcome.refused.length > 1 ? ` (and ${outcome.refused.length - 1} more)` : "";
        return NextResponse.json({ error: `${first.name}: ${first.error}${more}`, refused: outcome.refused }, { status: 400 });
      }
      return NextResponse.json(outcome);
    } catch (error) {
      if (error instanceof AdminRefusal || error instanceof OperatorRefusal) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  };
}

/** The workspaces a bulk action names, as the writes take them. */
export async function workspacesByIds(ids: string[]) {
  return prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } });
}
