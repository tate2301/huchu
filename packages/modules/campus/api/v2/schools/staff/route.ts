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
import type { EmployeePositionValue } from "@corelithzw/platform/vertical-defaults";

/**
 * The school's non-teaching staff — the bursar, the groundsman, the drivers.
 *
 * They are HR employees carrying the SCHOOLS module assignment, so payroll and
 * leave stay in one place rather than a second staff table. But reading them
 * through `/api/employees` is the wrong door: that route is gated on
 * `hr.employees`, a feature the Schools Suite does not include, and its
 * permission matrix has no row for SCHOOL_ADMIN or REGISTRAR at all — so the
 * office staff this page was built for got a 403 and an empty screen.
 *
 * Same records, asked for as a school asks: `schools.teachers`, which is the
 * resource that already governs who may see the people who work here.
 *
 * Teachers are excluded. They have their own screen, their own profile record
 * and their own assignments; a list that mixed them in would be the staff room,
 * not the office.
 */

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  position: z.string().trim().min(1).optional(),
  departmentId: z.string().uuid().optional(),
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.teachers", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);
    const query = querySchema.parse({
      search: searchParams.get("search") ?? undefined,
      position: searchParams.get("position") ?? undefined,
      departmentId: searchParams.get("departmentId") ?? undefined,
      active: searchParams.get("active") ?? undefined,
    });

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
      // The assignment is what makes somebody the school's rather than the
      // company's. Position says what a person does; this says who they do it
      // for, and only the second answers "show me our staff".
      moduleAssignments: {
        some: { isActive: true, module: "SCHOOLS" },
      },
      position: { not: "TEACHER" },
    };

    if (query.active !== undefined) where.isActive = query.active;
    if (query.position) where.position = query.position;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { employeeId: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: {
          id: true,
          employeeId: true,
          userId: true,
          name: true,
          phone: true,
          nextOfKinName: true,
          nextOfKinPhone: true,
          passportPhotoUrl: true,
          nationalIdNumber: true,
          villageOfOrigin: true,
          jobTitle: true,
          position: true,
          departmentId: true,
          employmentType: true,
          hireDate: true,
          terminationDate: true,
          isActive: true,
          user: {
            select: { id: true, email: true, name: true, role: true, isActive: true },
          },
          moduleAssignments: {
            select: {
              id: true,
              module: true,
              accessRole: true,
              requiresUserAccess: true,
              isPrimary: true,
              isActive: true,
            },
            orderBy: [{ isPrimary: "desc" }, { module: "asc" }],
          },
          department: { select: { id: true, code: true, name: true } },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.employee.count({ where }),
    ]);

    return successResponse(paginationResponse(employees, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/staff error:", error);
    return errorResponse("Failed to fetch the staff list");
  }
}

/**
 * The fields a school office fills in, and no more.
 *
 * Deliberately narrower than the HR employee schema: no pay grade, no
 * compensation template, no user-account creation. Hiring a groundsman should
 * not be a door onto the salary bill, which is exactly why SCHOOL_ADMIN has no
 * row in the HR permission matrix. Payroll stays HR's.
 */
const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  jobTitle: z.string().trim().max(200).nullable().optional(),
  position: z.string().trim().min(1).max(60),
  departmentId: z.string().uuid().nullable().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"]).optional(),
  hireDate: z.string().trim().min(1).optional(),
  nextOfKinName: z.string().trim().min(1).max(200),
  nextOfKinPhone: z.string().trim().min(1).max(40),
  villageOfOrigin: z.string().trim().min(1).max(200),
  nationalIdNumber: z.string().trim().max(100).nullable().optional(),
  passportPhotoUrl: z.string().trim().min(1),
});

const EMPLOYEE_ID_PREFIX = "EMP-";
const EMPLOYEE_ID_PAD = 4;

/** The next free EMP-0000, mirroring how HR numbers its own. */
async function nextEmployeeId(companyId: string) {
  const existing = await prisma.employee.findMany({
    where: { companyId },
    select: { employeeId: true },
  });

  const taken = new Set(existing.map((row) => row.employeeId));
  let highest = 0;
  for (const row of existing) {
    const match = row.employeeId.match(/^EMP-(\d+)$/i);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) highest = Math.max(highest, value);
  }

  let next = highest + 1;
  let candidate = `${EMPLOYEE_ID_PREFIX}${String(next).padStart(EMPLOYEE_ID_PAD, "0")}`;
  while (taken.has(candidate)) {
    next += 1;
    candidate = `${EMPLOYEE_ID_PREFIX}${String(next).padStart(EMPLOYEE_ID_PAD, "0")}`;
  }
  return candidate;
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.teachers", "create");
    if (denied) return errorResponse(denied, 403);

    const validated = createSchema.parse(await request.json());
    if (validated.position === "TEACHER") {
      return errorResponse(
        "A teacher is added under Teaching staff, where their subjects and classes live.",
        400,
      );
    }

    const companyId = session.user.companyId;

    if (validated.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: validated.departmentId, companyId },
        select: { id: true },
      });
      if (!department) return errorResponse("That department is not this school's", 400);
    }

    const employee = await prisma.employee.create({
      data: {
        companyId,
        employeeId: await nextEmployeeId(companyId),
        name: validated.name,
        phone: validated.phone,
        jobTitle: validated.jobTitle ?? undefined,
        position: validated.position as EmployeePositionValue,
        departmentId: validated.departmentId ?? undefined,
        employmentType: validated.employmentType ?? "FULL_TIME",
        hireDate: validated.hireDate ? new Date(validated.hireDate) : undefined,
        nextOfKinName: validated.nextOfKinName,
        nextOfKinPhone: validated.nextOfKinPhone,
        villageOfOrigin: validated.villageOfOrigin,
        nationalIdNumber: validated.nationalIdNumber ?? undefined,
        passportPhotoUrl: validated.passportPhotoUrl,
        // What makes this the school's employee rather than the company's, and
        // what the GET above filters on.
        moduleAssignments: {
          create: [
            { companyId, module: "SCHOOLS", isPrimary: true, isActive: true },
          ],
        },
      },
      select: { id: true, employeeId: true, name: true },
    });

    return successResponse(employee, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/staff error:", error);
    return errorResponse("Failed to add the staff member");
  }
}
