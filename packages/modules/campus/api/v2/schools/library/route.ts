import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../permissions";
import { loanRegister } from "../../../../library";

const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
  /** The Monday-morning view: what is out and late. */
  overdueOnly: z.coerce.boolean().optional(),
  studentId: z.string().uuid().optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(200).nullish(),
  isbn: z.string().trim().max(30).nullish(),
  publisher: z.string().trim().max(200).nullish(),
  category: z.string().trim().max(100).nullish(),
  shelfMark: z.string().trim().max(60).nullish(),
  /** Accession numbers, one per physical copy. */
  copyCodes: z.array(z.string().trim().min(1).max(60)).min(1).max(100),
});

/**
 * The catalogue and the loan register together.
 *
 * One call because the issue desk needs both — a librarian searching for a
 * title also wants to know whether it is out — and two round trips to draw one
 * screen is two chances for them to disagree.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const query = querySchema.parse({
      search: new URL(request.url).searchParams.get("search") ?? undefined,
      overdueOnly:
        new URL(request.url).searchParams.get("overdueOnly") ?? undefined,
      studentId: new URL(request.url).searchParams.get("studentId") ?? undefined,
    });

    const [books, loans] = await Promise.all([
      prisma.schoolBook.findMany({
        where: {
          companyId,
          ...(query.search
            ? {
                OR: [
                  { title: { contains: query.search, mode: "insensitive" as const } },
                  { author: { contains: query.search, mode: "insensitive" as const } },
                  { isbn: { contains: query.search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          author: true,
          isbn: true,
          category: true,
          shelfMark: true,
          copies: {
            where: { isWithdrawn: false },
            select: {
              id: true,
              copyCode: true,
              // Only the live loan. A copy's history belongs on the copy's own
              // page, not on every row of the catalogue.
              loans: {
                where: { returnedAt: null },
                select: {
                  id: true,
                  dueAt: true,
                  student: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              },
            },
            orderBy: { copyCode: "asc" },
          },
          _count: { select: { reservations: true } },
        },
        orderBy: { title: "asc" },
        take: 300,
      }),
      loanRegister({
        companyId,
        overdueOnly: query.overdueOnly,
        studentId: query.studentId,
      }),
    ]);

    return successResponse({ books, loans });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/library error:", error);
    return errorResponse("Failed to fetch the library");
  }
}

/**
 * Add a title and its copies in one action.
 *
 * A title with no copies is a catalogue entry nobody can borrow, and making a
 * librarian create the two separately is a step that exists only to serve the
 * schema. The copies go in one transaction with the title so a clash on an
 * accession number leaves neither behind.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = createSchema.parse(await request.json());
    const codes = [...new Set(validated.copyCodes.map((code) => code.trim()))];

    const clash = await prisma.schoolBookCopy.findFirst({
      where: { companyId, copyCode: { in: codes } },
      select: { copyCode: true },
    });
    if (clash) {
      return errorResponse(
        `Accession number ${clash.copyCode} is already on another book`,
        409,
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const book = await tx.schoolBook.create({
        data: {
          companyId,
          title: validated.title,
          author: validated.author ?? null,
          isbn: validated.isbn ?? null,
          publisher: validated.publisher ?? null,
          category: validated.category ?? null,
          shelfMark: validated.shelfMark ?? null,
        },
        select: { id: true, title: true },
      });

      await tx.schoolBookCopy.createMany({
        data: codes.map((copyCode) => ({ companyId, bookId: book.id, copyCode })),
      });

      return book;
    });

    return successResponse({ ...created, copies: codes.length }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/library error:", error);
    return errorResponse("Failed to add the book");
  }
}
