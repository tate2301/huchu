import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { money, sumMoney } from "@/lib/schools/money";

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  includeLines: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const structureLineSchema = z.object({
  feeCode: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(200),
  amount: z.number().finite().min(0),
  isMandatory: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  currency: z.string().trim().min(1).max(10).default("USD"),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  lines: z.array(structureLineSchema).min(1),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { page, limit, skip } = getPaginationParams(request);
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      includeLines: searchParams.get("includeLines") ?? undefined,
    });

    const where: Prisma.SchoolFeeStructureWhereInput = { companyId };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { class: { name: { contains: query.search, mode: "insensitive" } } },
        { class: { code: { contains: query.search, mode: "insensitive" } } },
        { term: { name: { contains: query.search, mode: "insensitive" } } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.termId) where.termId = query.termId;
    if (query.classId) where.classId = query.classId;

    const include = query.includeLines
      ? ({
          term: { select: { id: true, code: true, name: true } },
          class: { select: { id: true, code: true, name: true } },
          lines: { orderBy: [{ sortOrder: "asc" }, { feeCode: "asc" }] },
          _count: { select: { lines: true, invoices: true } },
        } satisfies Prisma.SchoolFeeStructureInclude)
      : ({
          term: { select: { id: true, code: true, name: true } },
          class: { select: { id: true, code: true, name: true } },
          _count: { select: { lines: true, invoices: true } },
        } satisfies Prisma.SchoolFeeStructureInclude);

    const [records, total] = await Promise.all([
      prisma.schoolFeeStructure.findMany({
        where,
        include,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolFeeStructure.count({ where }),
    ]);

    const data = records.map((record) => {
      const lines =
        "lines" in record && Array.isArray(record.lines) ? record.lines : [];
      return {
        ...record,
        // Post S-2.1 Float→Decimal: `line.amount` is a `Prisma.Decimal`, and
        // `successResponse` turns these back into numbers on the way out.
        totals: {
          amount: sumMoney(lines.map((line) => line.amount)),
          mandatoryAmount: sumMoney(
            lines.filter((line) => line.isMandatory).map((line) => line.amount),
          ),
        },
      };
    });

    return successResponse(paginationResponse(data, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/fees/structures error:", error);
    return errorResponse("Failed to fetch fee structures");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createSchema.parse(body);

    const [term, schoolClass] = await Promise.all([
      prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      }),
      prisma.schoolClass.findFirst({
        where: { id: validated.classId, companyId },
        select: { id: true },
      }),
    ]);

    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!schoolClass) return errorResponse("Invalid class for this company", 400);

    const feeCodes = validated.lines.map((line) => line.feeCode.toUpperCase());
    if (new Set(feeCodes).size !== feeCodes.length) {
      return errorResponse("Duplicate fee codes in structure lines are not allowed", 400);
    }

    const structure = await prisma.schoolFeeStructure.create({
      data: {
        companyId,
        name: validated.name,
        termId: validated.termId,
        classId: validated.classId,
        currency: validated.currency.toUpperCase(),
        status: validated.status ?? "DRAFT",
        notes: validated.notes ?? null,
        lines: {
          create: validated.lines.map((line, index) => ({
            companyId,
            feeCode: line.feeCode.toUpperCase(),
            description: line.description,
            amount: money(line.amount),
            isMandatory: line.isMandatory ?? true,
            sortOrder: line.sortOrder ?? index,
          })),
        },
      },
      include: {
        term: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, code: true, name: true } },
        lines: { orderBy: [{ sortOrder: "asc" }, { feeCode: "asc" }] },
        _count: { select: { lines: true, invoices: true } },
      },
    });

    return successResponse(structure, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return errorResponse("A fee structure with this name already exists for class and term", 409);
    }
    console.error("[API] POST /api/v2/schools/fees/structures error:", error);
    return errorResponse("Failed to create fee structure");
  }
}
