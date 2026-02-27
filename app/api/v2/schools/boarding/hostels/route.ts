import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError, normalizeOptionalNullableString } from "../../_helpers";

const hostelQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  genderPolicy: z.string().trim().min(1).optional(),
});

const hostelRoomSchema = z.object({
  code: z.string().trim().min(1).max(40),
  floor: z.string().trim().min(1).max(50).nullable().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  bedCodes: z.array(z.string().trim().min(1).max(40)).optional(),
});

const createHostelSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  genderPolicy: z.string().trim().min(1).max(30).optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  rooms: z.array(hostelRoomSchema).optional(),
});

const hostelInclude = {
  rooms: {
    select: {
      id: true,
      code: true,
      floor: true,
      capacity: true,
      isActive: true,
    },
    orderBy: { code: "asc" },
  },
  beds: {
    select: {
      id: true,
      code: true,
      roomId: true,
      status: true,
      isActive: true,
    },
    orderBy: [{ roomId: "asc" }, { code: "asc" }],
  },
  _count: {
    select: {
      rooms: true,
      beds: true,
      allocations: true,
    },
  },
} satisfies Prisma.SchoolHostelInclude;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = hostelQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
      genderPolicy: searchParams.get("genderPolicy") ?? undefined,
    });

    const where: Prisma.SchoolHostelWhereInput = {
      companyId: session.user.companyId,
    };

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.genderPolicy) where.genderPolicy = query.genderPolicy;

    const [records, total] = await Promise.all([
      prisma.schoolHostel.findMany({
        where,
        include: hostelInclude,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.schoolHostel.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/boarding/hostels error:", error);
    return errorResponse("Failed to fetch hostels");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createHostelSchema.parse(body);
    const companyId = session.user.companyId;

    const rooms = validated.rooms ?? [];
    const normalizedRoomCodes = rooms.map((room) => room.code.trim().toUpperCase());
    if (new Set(normalizedRoomCodes).size !== normalizedRoomCodes.length) {
      return errorResponse("Duplicate room codes are not allowed in one request", 400);
    }

    for (const room of rooms) {
      const bedCodes = (room.bedCodes ?? []).map((bedCode) =>
        bedCode.trim().toUpperCase(),
      );
      if (new Set(bedCodes).size !== bedCodes.length) {
        return errorResponse(`Duplicate bed codes found in room ${room.code}`, 400);
      }
    }

    const hostel = await prisma.$transaction(async (tx) => {
      const createdHostel = await tx.schoolHostel.create({
        data: {
          companyId,
          code: validated.code,
          name: validated.name,
          genderPolicy: validated.genderPolicy ?? "MIXED",
          capacity: validated.capacity ?? null,
          isActive: validated.isActive ?? true,
        },
      });

      for (const room of rooms) {
        const createdRoom = await tx.schoolHostelRoom.create({
          data: {
            companyId,
            hostelId: createdHostel.id,
            code: room.code,
            floor: normalizeOptionalNullableString(room.floor) ?? null,
            capacity: room.capacity ?? null,
            isActive: room.isActive ?? true,
          },
        });

        const bedCodes = room.bedCodes ?? [];
        if (bedCodes.length > 0) {
          await tx.schoolHostelBed.createMany({
            data: bedCodes.map((bedCode) => ({
              companyId,
              hostelId: createdHostel.id,
              roomId: createdRoom.id,
              code: bedCode,
              status: "AVAILABLE",
              isActive: true,
            })),
          });
        }
      }

      return tx.schoolHostel.findUnique({
        where: { id: createdHostel.id },
        include: hostelInclude,
      });
    });

    if (!hostel) {
      return errorResponse("Failed to create hostel", 500);
    }
    return successResponse(hostel, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Hostel/room/bed code already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/boarding/hostels error:", error);
    return errorResponse("Failed to create hostel");
  }
}

