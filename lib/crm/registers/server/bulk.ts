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
import { recordEditor } from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

import type { BulkActionKey } from "../types";

export const MAX_BULK_IDS = 500;

export const bulkRequestSchema = z.object({
  action: z.enum(["assign", "status", "archive", "restore"]),
  ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
  /** `assign`: a team member's id, `me`, or null for nobody. `status`: the new status. */
  value: z.string().trim().max(80).nullable().optional(),
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

export type RecordBulkSpec = {
  noun: { one: string; many: string };
  /** The actions this list's records take. */
  actions: readonly BulkActionKey[];
  /** The records asked for, inside the company. */
  load(companyId: string, ids: string[]): Promise<BulkRow[]>;
  update(ids: string[], data: Record<string, unknown>): Promise<void>;
  /** `status`: the column and its answers. */
  status?: { field: string; values: readonly string[] };
};

/**
 * The handler for one list's bulk route. The records a reader may not edit
 * are skipped (and counted), never failed; records already in the asked-for
 * state are counted as unchanged rather than written again.
 */
export function recordBulkHandler(spec: RecordBulkSpec) {
  return async function POST(request: NextRequest) {
    try {
      const sessionResult = await validateSession(request);
      if (sessionResult instanceof NextResponse) return sessionResult;
      const { session } = sessionResult;
      const companyId = session.user.companyId;

      const body = bulkRequestSchema.parse(await request.json());
      if (!spec.actions.includes(body.action)) {
        return errorResponse(`${spec.noun.many} cannot be changed that way`, 400);
      }

      let data: Record<string, unknown>;
      let same: (row: BulkRow) => boolean;
      switch (body.action) {
        case "assign": {
          const ownerId = body.value === "me" ? session.user.id : body.value || null;
          // A real member of this company, or a bad id would quietly detach
          // every one of these records from anybody.
          if (ownerId) {
            const owner = await prisma.user.findFirst({ where: { id: ownerId, companyId }, select: { id: true } });
            if (!owner) return errorResponse("That person is not on this team", 400);
          }
          data = { assignedToId: ownerId };
          same = (row) => (row.assignedToId ?? null) === ownerId;
          break;
        }
        case "status": {
          if (!spec.status || !body.value || !spec.status.values.includes(body.value)) {
            return errorResponse("That is not a status these records can have", 400);
          }
          data = { [spec.status.field]: body.value };
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
      const skipped = rows.length - editable.length;
      if (rows.length > 0 && editable.length === 0) {
        return errorResponse(`None of the selected ${spec.noun.many} can be changed by you`, 403);
      }

      const changing = editable.filter((row) => !same(row));
      if (changing.length > 0) await spec.update(changing.map((row) => row.id), data);

      const result: BulkResult = {
        updated: changing.length,
        unchanged: editable.length - changing.length,
        skipped,
        notFound: body.ids.length - rows.length,
        ...(skipped > 0 ? { skippedReason: "they belong to someone else" } : {}),
      };
      return successResponse(result);
    } catch (error) {
      if (error instanceof z.ZodError) return errorResponse("Invalid request", 400, error.issues);
      console.error(`[API] bulk ${spec.noun.many} error:`, error);
      return errorResponse(`Failed to update the selected ${spec.noun.many}`);
    }
  };
}
