/**
 * Takes a photograph and gives back a URL the shelf can point at.
 *
 * S-7.8. `Product.imageUrl` and the till's rendering of it both predate this;
 * what was missing was any way to fill the column. This is that way, and it is
 * deliberately the only one — the catalogue API accepts an `imageUrl` string,
 * so a shopkeeper *could* paste a link to somebody else's website, and that
 * link breaks the first time the other site reorganises. Uploading puts the
 * bytes somewhere the shop controls.
 *
 * ── Upload and save are two steps, on purpose ──────────────────────────────
 *
 * This returns a URL; it does not touch `Product`. The catalogue form then
 * saves that URL with the rest of the item through the endpoint it already
 * uses. Two round trips instead of one, and worth it: a photograph picked and
 * then abandoned when the shopkeeper cancels the dialog costs an orphaned blob
 * rather than a half-written product, and the item's own validation — SKU
 * collisions, price, the inventory link — stays in one place.
 *
 * Multipart rather than a base64 JSON field: a 2MB photo becomes 2.7MB of
 * base64, and Next's default body-size limits are unkind about it.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";

import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { catalogImagePath, checkCatalogImage } from "@/lib/retail/catalog-image";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  /*
    Photographing the range is a setup act, not a counter one. `retail.catalog`
    `update` is what a manager holds and a cashier does not — `READ_THE_SHELF`
    grants a cashier `view` alone.
  */
  const gate = requireRetailPermission(session, "retail.catalog", "update");
  if (gate) return gate;

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    // Said plainly rather than as a 500. This is a deployment gap, and the
    // person who hits it can do nothing but tell whoever configured the app.
    return errorResponse("Image storage is not configured for this deployment", 503);
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const productId = String(form.get("productId") ?? "").trim();

    if (!(file instanceof File)) {
      return errorResponse("No image was attached", 400);
    }

    /**
     * `productId` is optional, because a photograph can be chosen before the
     * item exists.
     *
     * The catalogue form uploads while the shopkeeper is still filling the
     * dialog in, and on a new item there is nothing to belong to yet. Making
     * them save first and come back to add a picture would be the kind of
     * two-trip workflow nobody does twice.
     *
     * When an id *is* given it must be this tenant's, because the client chose
     * it and it lands in the storage path — without the check one company could
     * write into another's prefix by naming their product. When it is absent
     * nothing client-supplied reaches the path at all, and the company prefix
     * still comes from the session.
     */
    let pathKey: string;
    if (productId) {
      const product = await prisma.product.findFirst({
        where: { id: productId, companyId: session.user.companyId },
        select: { id: true },
      });
      if (!product) {
        return errorResponse("That item is not on this shop's range", 404);
      }
      pathKey = product.id;
    } else {
      pathKey = `new-${randomUUID()}`;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkCatalogImage({ bytes, declaredType: file.type });
    if (!check.ok) {
      return errorResponse(check.error, 400);
    }

    const path = catalogImagePath({
      companyId: session.user.companyId,
      productId: pathKey,
      extension: check.extension,
      now: Date.now(),
    });

    const uploaded = await put(path, new Blob([bytes], { type: check.type }), {
      access: "public",
      /*
        A random suffix, so replacing a photo writes a new object rather than
        overwriting one a cached page may still be showing. The old object is
        left behind; tidying those up is a housekeeping job, not something to
        do on the request that a shopkeeper is waiting on.
      */
      addRandomSuffix: true,
      contentType: check.type,
    });

    return successResponse({ url: uploaded.url, contentType: check.type });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/catalog/image error:", error);
    return errorResponse("That image could not be saved");
  }
}
