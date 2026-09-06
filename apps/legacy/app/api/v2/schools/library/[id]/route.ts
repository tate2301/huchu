import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { isUniqueConstraintError } from "../../_helpers";

/**
 * One title in the catalogue.
 *
 * The library could add a book and never correct one: a misspelt author or a
 * shelf mark that changed when the shelves were rearranged had no route behind
 * it. Copies come along for the ride — `addCopyCodes` is how a second-hand
 * donation of four more paperbacks gets recorded, because making a librarian
 * create the title again to add a copy is a step that exists only to serve the
 * schema.
 */
const updateBookSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    author: z.string().trim().max(200).nullable().optional(),
    isbn: z.string().trim().max(30).nullable().optional(),
    publisher: z.string().trim().max(200).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
    shelfMark: z.string().trim().max(60).nullable().optional(),
    /** Accession numbers for copies that have just arrived. */
    addCopyCodes: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const bookSelect = {
  id: true,
  title: true,
  author: true,
  isbn: true,
  publisher: true,
  category: true,
  shelfMark: true,
  copies: {
    where: { isWithdrawn: false },
    select: {
      id: true,
      copyCode: true,
      condition: true,
      loans: {
        where: { returnedAt: null },
        select: {
          id: true,
          dueAt: true,
          student: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { copyCode: "asc" as const },
  },
  _count: { select: { reservations: true } },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid book ID", 400);

    const book = await prisma.schoolBook.findFirst({
      where: { id, companyId: session.user.companyId },
      select: bookSelect,
    });
    if (!book) return errorResponse("Book not found", 404);

    return successResponse(book);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/library/[id] error:", error);
    return errorResponse("Failed to fetch the book");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid book ID", 400);

    const validated = updateBookSchema.parse(await request.json());

    const existing = await prisma.schoolBook.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Book not found", 404);

    const codes = [...new Set((validated.addCopyCodes ?? []).map((code) => code.trim()))];
    if (codes.length > 0) {
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
    }

    const book = await prisma.$transaction(async (tx) => {
      await tx.schoolBook.update({
        where: { id: existing.id },
        data: {
          ...(validated.title !== undefined ? { title: validated.title } : {}),
          ...(validated.author !== undefined ? { author: validated.author } : {}),
          ...(validated.isbn !== undefined ? { isbn: validated.isbn } : {}),
          ...(validated.publisher !== undefined ? { publisher: validated.publisher } : {}),
          ...(validated.category !== undefined ? { category: validated.category } : {}),
          ...(validated.shelfMark !== undefined ? { shelfMark: validated.shelfMark } : {}),
        },
      });

      if (codes.length > 0) {
        await tx.schoolBookCopy.createMany({
          data: codes.map((copyCode) => ({ companyId, bookId: existing.id, copyCode })),
        });
      }

      return tx.schoolBook.findUniqueOrThrow({
        where: { id: existing.id },
        select: bookSelect,
      });
    });

    return successResponse(book);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("That accession number is already in use", 409);
    }
    console.error("[API] PATCH /api/v2/schools/library/[id] error:", error);
    return errorResponse("Failed to update the book");
  }
}

/**
 * Withdraw a title.
 *
 * The copies are marked withdrawn rather than deleted, because the loan history
 * hanging off them is how a school answers "who had it last" about a book that
 * was lost — and a title with a copy still out is not withdrawn, it is missing.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid book ID", 400);

    const existing = await prisma.schoolBook.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Book not found", 404);

    const stillOut = await prisma.schoolBookLoan.count({
      where: { companyId, returnedAt: null, copy: { bookId: existing.id } },
    });
    if (stillOut > 0) {
      return errorResponse(
        `${stillOut} cop${stillOut === 1 ? "y is" : "ies are"} still out. Take them back first.`,
        409,
      );
    }

    const withdrawn = await prisma.schoolBookCopy.updateMany({
      where: { companyId, bookId: existing.id, isWithdrawn: false },
      data: { isWithdrawn: true },
    });

    return successResponse({ id: existing.id, withdrawn: withdrawn.count });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/library/[id] error:", error);
    return errorResponse("Failed to withdraw the book");
  }
}
