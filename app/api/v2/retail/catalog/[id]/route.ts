import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markActivityFailed } from "@/lib/activity/context";
import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { prisma } from "@/lib/prisma";
import { upsertShelfListing } from "@/lib/retail/shelf-listing";
import { auditRecordEdited } from "@/lib/retail/audit";
import { canRetailSessionDo, requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { loadProductRecord, PRODUCT_FIELDS, productBefore, productChanges } from "@/lib/retail/product-record";
import { productDetailFields, productDetailsProblem, productDetailWrites } from "@/lib/retail/product-details";
import { ensureInventoryItemAccess, requireRetailSession } from "../../_helpers";

/**
 * One shelf line. `{id}` is a `Product.id` from S-4b.
 *
 * This is the endpoint both editable screens write to: the catalogue dialog and
 * the pricing table. It writes `Product` and the `ProductPrice` on the tenant's
 * `RETAIL` shelf list — the same rows the till reads its price out of — so an
 * edit here is an edit the counter charges, which is the whole point of the
 * cutover.
 */
const patchSchema = z.object({
  inventoryItemId: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(80).optional(),
  barcode: z.string().max(80).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  unitPrice: z.number().min(0).optional(),
  compareAtPrice: z.number().min(0).optional().nullable(),
  taxPercent: z.number().min(0).max(100).optional(),
  imageUrl: z.string().url().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  ...productDetailFields,
});

function normalizeSku(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. One line off the range. Same gate as the list it came from.
  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  /*
    R-3.1. The segment, through a schema.

    Prisma is not injectable, so this is not a security fix. It is the
    difference between a 400 naming the parameter and a 404 that reads, to a
    shopkeeper, as "the receipt you are holding is not in the system".
  */
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  // The record page reads a binned product too: it draws the bin banner.
  const record = await loadProductRecord(session.user.companyId, id, retailRoleKey(session));
  if (!record) {
    return errorResponse("Product not found", 404);
  }

  return successResponse(record);
}

/** 400 `{ error, fieldErrors }`: the rail shows the sentence under the field (4.9). */
function fieldErrorResponse(message: string, fieldErrors: Record<string, string>) {
  markActivityFailed();
  return NextResponse.json({ error: message, fieldErrors }, { status: 400 });
}

/** "Price", for a zod issue on `unitPrice`. */
function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (!field || errors[field]) continue;
    const label = PRODUCT_FIELDS[field]?.label ?? "That value";
    errors[field] =
      issue.code === "too_small" && issue.origin === "string"
        ? `${label} is needed.`
        : issue.code === "too_small" || issue.code === "too_big"
          ? `${label} is out of range.`
          : `${label} is not a value this field takes.`;
  }
  return errors;
}

/**
 * Change one product (W-62, 00-foundations 4.9): one field from the details
 * rail, or several from a sheet. Answers `{ data, changed }` with the record
 * as the page reads it; each changed field writes `RETAIL_RECORD.EDITED` in
 * the transaction that writes it. A binned product answers 409 "Restore it
 * to change it".
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.catalog", "update");
  if (gate) return gate;

  try {
    const path = await parseRetailParams(params, retailIdParams);
    if (path.response) return path.response;
    const { id } = path.data;
    const companyId = session.user.companyId;
    const existing = await loadProductRecord(companyId, id, retailRoleKey(session));
    if (!existing) {
      return errorResponse("Product not found", 404);
    }
    if (existing.binnedAt) {
      return errorResponse("Restore it to change it", 409);
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return fieldErrorResponse("Validation failed", fieldErrorsOf(parsed.error));
    }
    const input = parsed.data;
    if (input.costPrice !== undefined && !canRetailSessionDo(session, "retail.catalog", "view-cost")) {
      return errorResponse("Your role cannot see what the shop pays", 403);
    }

    const detailsProblem = await productDetailsProblem(companyId, input, id);
    if (detailsProblem) {
      const field = input.packOfId !== undefined ? "packOfId" : "categoryId";
      return fieldErrorResponse(detailsProblem, { [field]: detailsProblem });
    }

    let inventoryItemId = existing.inventoryItemId;
    if (input.inventoryItemId && input.inventoryItemId !== existing.inventoryItemId) {
      const inventoryItem = await ensureInventoryItemAccess(companyId, input.inventoryItemId);
      if (!inventoryItem) {
        return fieldErrorResponse("Validation failed", { inventoryItemId: "That stock line is not this shop's." });
      }
      if (inventoryItem.productId && inventoryItem.productId !== existing.productId) {
        return errorResponse("That stock item is already ranged under another product", 409);
      }
      inventoryItemId = inventoryItem.id;
    }

    // What the record will read after the write, for the audit events written with it.
    const before = productBefore(existing);
    const category =
      input.categoryId === undefined
        ? before.category
        : input.categoryId
          ? ((await prisma.retailCategory.findFirst({ where: { id: input.categoryId, companyId }, select: { name: true } }))
              ?.name ?? null)
          : null;
    const sku = input.sku ? normalizeSku(input.sku) : existing.sku;
    const after = {
      ...before,
      ...(input.name !== undefined ? { name: input.name.trim() || existing.name } : {}),
      sku,
      ...(input.barcode !== undefined ? { barcode: input.barcode?.trim() || null } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
      ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice } : {}),
      ...(input.taxPercent !== undefined ? { taxPercent: input.taxPercent } : {}),
      ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
      ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId, category } : {}),
      ...(input.returnable !== undefined ? { returnable: input.returnable } : {}),
      ...(input.depositAmount !== undefined || input.returnable === false
        ? { depositAmount: input.returnable === false ? null : (input.depositAmount ?? null) }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
    };
    const sent = Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined);
    const changed = productChanges(sent, before, after);
    const actor = {
      companyId,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
    };

    await prisma.$transaction(async (tx) => {
      if (inventoryItemId !== existing.inventoryItemId) {
        // The line it used to sell keeps nothing pointing at it, which is what
        // "moved to a different stock row" means.
        await tx.inventoryItem.updateMany({
          where: { id: existing.inventoryItemId, productId: existing.productId },
          data: { productId: null },
        });
      }
      await upsertShelfListing(
        {
          companyId,
          productId: existing.productId,
          sku,
          name: input.name?.trim() || existing.name,
          inventoryItemId,
          // A PATCH that only moves the was-price must not reprice the shelf.
          unitPrice: input.unitPrice ?? existing.unitPrice,
          taxPercent: input.taxPercent ?? existing.taxPercent,
          ...(input.description === undefined ? {} : { description: input.description?.trim() ?? null }),
          ...(input.barcode === undefined ? {} : { barcode: input.barcode?.trim() || null }),
          ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
          ...(input.compareAtPrice === undefined ? {} : { compareAtPrice: input.compareAtPrice }),
          ...(input.status === undefined ? {} : { isActive: input.status === "ACTIVE" }),
          ...productDetailWrites(input),
        },
        tx,
      );
      if (input.reorderLevel !== undefined || input.costPrice !== undefined) {
        await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: {
            ...(input.reorderLevel === undefined ? {} : { minStock: input.reorderLevel }),
            ...(input.costPrice === undefined ? {} : { unitCost: input.costPrice }),
          },
        });
      }
      for (const change of changed) {
        await auditRecordEdited(tx, {
          actor,
          entityType: "Product",
          entityId: existing.productId,
          field: change.field,
          label: change.label,
          from: change.from,
          to: change.to,
          kind: change.kind,
        });
      }
    });

    const data = await loadProductRecord(companyId, existing.productId, retailRoleKey(session));
    return successResponse({
      data: data ?? existing,
      changed: changed.map(({ field, from, to }) => ({ field, from, to })),
    });
  } catch (error) {
    console.error("[API] PATCH /api/v2/retail/catalog/[id] error:", error);
    return errorResponse("Failed to update the product");
  }
}
