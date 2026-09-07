import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../permissions";
import { SCHOOL_IMPORT_HANDLERS, SCHOOL_IMPORT_ORDER } from "../../../../import/registry";
import { ImportTooLargeError, stageImportJob } from "../../../../import/service";

import { importPermissionDenial } from "./_guard";

const IMPORT_ENTITIES = SCHOOL_IMPORT_ORDER as [string, ...string[]];

const createSchema = z.object({
  entityType: z.enum(IMPORT_ENTITIES),
  fileName: z.string().trim().min(1).max(255),
  /**
   * The file itself, as text. There is no separate upload step and no blob
   * storage: a school's spreadsheet is a few hundred kilobytes of CSV, and a
   * second round trip buys nothing but a state to get stuck in.
   */
  csvText: z.string().min(1),
});

/** The field descriptors the mapping step needs, without a round trip per entity. */
export const IMPORT_ENTITY_SUMMARY = SCHOOL_IMPORT_ORDER.map((key) => {
  const handler = SCHOOL_IMPORT_HANDLERS[key];
  return {
    key: handler.key,
    label: handler.label,
    order: handler.order,
    dependsOn: handler.dependsOn,
    naturalKey: handler.naturalKey,
    fields: handler.fields,
  };
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);

    const { page, limit, skip } = getPaginationParams(request);

    const where = { companyId: session.user.companyId };
    const [records, total] = await Promise.all([
      prisma.schoolImportJob.findMany({
        where,
        select: {
          id: true,
          entityType: true,
          status: true,
          fileName: true,
          rowsTotal: true,
          rowsCreated: true,
          rowsUpdated: true,
          rowsSkipped: true,
          rowsFailed: true,
          createdAt: true,
          committedAt: true,
          rolledBackAt: true,
          uploadedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.schoolImportJob.count({ where }),
    ]);

    return successResponse({
      ...paginationResponse(records, total, page, limit),
      entities: IMPORT_ENTITY_SUMMARY,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/imports error:", error);
    return errorResponse("Failed to fetch imports");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createSchema.parse(body);
    const entityType = validated.entityType as (typeof SCHOOL_IMPORT_ORDER)[number];

    const denied = importPermissionDenial(session, entityType, "create");
    if (denied) return errorResponse(denied, 403);

    const job = await stageImportJob(prisma, {
      companyId: session.user.companyId,
      entityType,
      fileName: validated.fileName,
      csvText: validated.csvText,
      uploadedById: session.user.id,
    });

    return successResponse(
      {
        id: job.id,
        entityType: job.entityType,
        status: job.status,
        fileName: job.fileName,
        headers: job.headers,
        mapping: job.mapping,
        rowsTotal: job.rowsTotal,
        fields: SCHOOL_IMPORT_HANDLERS[entityType].fields,
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ImportTooLargeError) {
      return errorResponse(error.message, 413);
    }
    console.error("[API] POST /api/v2/schools/imports error:", error);
    return errorResponse("Failed to read that file");
  }
}
