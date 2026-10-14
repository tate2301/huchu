/**
 * One bulk request shape for every list:
 *
 *   POST <list endpoint>/bulk  { action, ids, value? }
 *   → { updated, unchanged, skipped, notFound, skippedReason? }
 *
 * It does what the reader may and says what it left alone (SHAPE-10): a rep
 * reassigning twelve people, three of them somebody else's, moves nine and
 * hears why the other three stayed, rather than having the whole batch
 * refused over the three.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { recordEditor } from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

import type { BulkActionKey } from "../types";

export const MAX_BULK_IDS = 500;

export const bulkRequestSchema = z.object({
  action: z.enum(["assign", "status", "archive", "restore"]),
  ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
  /** `assign`: a team member's id, `me`, or null for nobody. `status`: the new status. */
  value: z.string().trim().max(80).nullable().optional(),
  /** `status`: why, for an answer that asks — a lead marked lost. */
  reason: z.string().trim().max(500).optional(),
});

export type BulkRequest = z.infer<typeof bulkRequestSchema>;

export type BulkResult = {
  updated: number;
  unchanged: number;
  skipped: number;
  notFound: number;
  skippedReason?: string;
};

type BulkRow = { id: string; assignedToId?: string | null; archivedAt: Date | null; status?: string };

/** One change, as a list's own update applies it. */
export type BulkChange = {
  action: BulkRequest["action"];
  /** The columns the change sets, for a list whose changes are only columns. */
  data: Record<string, unknown>;
  /** What was asked for: the owner (with `me` resolved) or the status. */
  value: string | null;
  reason?: string;
};

export type BulkActor = { companyId: string; userId: string };

export type RecordBulkSpec<Row extends BulkRow = BulkRow> = {
  noun: { one: string; many: string };
  /** The actions this list's records take. */
  actions: readonly BulkActionKey[];
  /** The records asked for, inside the company. */
  load(companyId: string, ids: string[]): Promise<Row[]>;
  /**
   * Make the change to the rows it changes. Most lists set `change.data`; a
   * list with rules of its own — a lead's stage move promotes it to a deal and
   * writes its history — reads the change instead.
   */
  update(rows: Row[], change: BulkChange, actor: BulkActor): Promise<void>;
  /** `status`: the column, its answers, and the answers that need a reason. */
  status?: { field: string; values: readonly string[]; needsReason?: readonly string[] };
  /**
   * Why an action leaves a record alone however it is asked, or null — a
   * converted lead is not restored beside the deal it became.
   */
  refuse?(row: Row, action: BulkChange["action"]): string | null;
};

/** Why a bulk change was refused outright, with the status the route answers. */
export class BulkRefused extends Error {
  constructor(
    readonly status: 400 | 403,
    message: string,
  ) {
    super(message);
    this.name = "BulkRefused";
  }
}

/** Keeps a list's spec typed by its rows, for the route and Vane's actions to share. */
export function bulkSpec<Row extends BulkRow>(spec: RecordBulkSpec<Row>): RecordBulkSpec<Row> {
  return spec;
}

/**
 * One bulk change, as the signed-in person: a list's bulk route and Vane's
 * approved "assign an owner" both come here. The records a reader may not
 * edit, or that the list's own rules keep as they are, are skipped (and
 * counted, with why), never failed; records already in the asked-for state
 * are counted as unchanged rather than written again.
 */
export async function applyRecordBulk<Row extends BulkRow>(
  spec: RecordBulkSpec<Row>,
  session: AuthenticatedSession,
  body: BulkRequest,
): Promise<BulkResult> {
  const companyId = session.user.companyId;
  if (!spec.actions.includes(body.action)) throw new BulkRefused(400, `${spec.noun.many} cannot be changed that way`);

  let data: Record<string, unknown>;
  let value: string | null = null;
  let same: (row: BulkRow) => boolean;
  switch (body.action) {
    case "assign": {
      const ownerId = body.value === "me" ? session.user.id : body.value || null;
      // A real member of this company, or a bad id would quietly detach
      // every one of these records from anybody.
      if (ownerId) {
        const owner = await prisma.user.findFirst({ where: { id: ownerId, companyId }, select: { id: true } });
        if (!owner) throw new BulkRefused(400, "That person is not on this team");
      }
      data = { assignedToId: ownerId };
      value = ownerId;
      same = (row) => (row.assignedToId ?? null) === ownerId;
      break;
    }
    case "status": {
      if (!spec.status || !body.value || !spec.status.values.includes(body.value)) {
        throw new BulkRefused(400, "That is not a status these records can have");
      }
      if (spec.status.needsReason?.includes(body.value) && !body.reason) {
        throw new BulkRefused(400, "Say why, so the reason stays with the records");
      }
      data = { [spec.status.field]: body.value };
      value = body.value;
      same = (row) => row.status === body.value;
      break;
    }
    case "archive":
      data = { archivedAt: new Date() };
      same = (row) => row.archivedAt !== null;
      break;
    case "restore":
      data = { archivedAt: null };
      same = (row) => row.archivedAt === null;
      break;
  }

  const rows = await spec.load(companyId, [...new Set(body.ids)]);
  const mayEdit = await recordEditor(session);
  const editable = rows.filter((row) => mayEdit(row.assignedToId ?? null));
  if (rows.length > 0 && editable.length === 0) {
    throw new BulkRefused(403, `None of the selected ${spec.noun.many} can be changed by you`);
  }

  // Why each record was left alone: somebody else's, or the list's own rule.
  const reasons = new Set<string>();
  if (editable.length < rows.length) reasons.add("they belong to someone else");
  const allowed = editable.filter((row) => {
    const refusal = spec.refuse?.(row, body.action) ?? null;
    if (refusal) reasons.add(refusal);
    return !refusal;
  });
  const skipped = rows.length - allowed.length;

  const changing = allowed.filter((row) => !same(row));
  if (changing.length > 0) {
    await spec.update(
      changing,
      { action: body.action, data, value, ...(body.reason ? { reason: body.reason } : {}) },
      { companyId, userId: session.user.id },
    );
  }

  return {
    updated: changing.length,
    unchanged: allowed.length - changing.length,
    skipped,
    notFound: body.ids.length - rows.length,
    ...(skipped > 0 ? { skippedReason: [...reasons].join("; ") } : {}),
  };
}

/** The handler for one list's bulk route. */
export function recordBulkHandler<Row extends BulkRow>(spec: RecordBulkSpec<Row>) {
  return async function POST(request: NextRequest) {
    try {
      const sessionResult = await validateSession(request);
      if (sessionResult instanceof NextResponse) return sessionResult;
      const body = bulkRequestSchema.parse(await request.json());
      return successResponse(await applyRecordBulk(spec, sessionResult.session, body));
    } catch (error) {
      if (error instanceof BulkRefused) return errorResponse(error.message, error.status);
      if (error instanceof z.ZodError) return errorResponse("Invalid request", 400, error.issues);
      console.error(`[API] bulk ${spec.noun.many} error:`, error);
      return errorResponse(`Failed to update the selected ${spec.noun.many}`);
    }
  };
}
