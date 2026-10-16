import { NextResponse } from "next/server";
import { z } from "zod";

import { templateSchema } from "@/lib/documents/template-schema";
import { libraryLayoutPreview } from "@/lib/library/layout-preview";
import { OperatorRefusal, requireOperatorFor } from "@/lib/operators/guards";

const body = z.object({ sourceKey: z.string().min(1).max(120), schema: z.unknown() });

/**
 * Library › a printed layout: the page as it prints, drawn for the portal's
 * builder with the source's sample record and a sample letterhead. HTML, for
 * the builder's sandboxed frame.
 */
export async function POST(request: Request) {
  try {
    await requireOperatorFor("library.manage");
  } catch (error) {
    if (error instanceof OperatorRefusal) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  const schema = parsed.success ? templateSchema.safeParse(parsed.data.schema ?? {}) : null;
  if (!parsed.success || !schema?.success) return NextResponse.json({ error: "That layout could not be read." }, { status: 400 });
  return new NextResponse(libraryLayoutPreview(parsed.data.sourceKey, schema.data), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "SAMEORIGIN" },
  });
}
