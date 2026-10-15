import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { saveBundle } from "@/lib/admin/catalogue";
import { catalogueBundles, catalogueFeatures } from "@/lib/admin/features";
import { AdminRefusal } from "@/lib/admin/refusal";
import { getSignedInOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

/**
 * Catalogue › a bundle's sheet. GET: the bundle (`?code=`, none for a new
 * one) and every feature to tick. POST: saves a bundle made here; owners only.
 */
export async function GET(request: NextRequest) {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const code = request.nextUrl.searchParams.get("code");
  const [bundles, features] = await Promise.all([catalogueBundles(), catalogueFeatures()]);
  const bundle = code ? (bundles.find((candidate) => candidate.code === code) ?? null) : null;
  if (code && !bundle) return NextResponse.json({ error: "That bundle is not in the catalogue." }, { status: 404 });
  return NextResponse.json(
    { bundle, features, canEdit: operatorCan(operator.role, "operator.manage") && !bundle?.inCode },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const body = z.object({
  code: z.string().min(1).max(64).optional(),
  name: z.string().max(120),
  description: z.string().max(300).optional(),
  featureKeys: z.array(z.string().min(1).max(120)).max(500),
});

export async function POST(request: Request) {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!operatorCan(operator.role, "operator.manage")) return NextResponse.json({ error: "Only an owner can change the catalogue." }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  try {
    const saved = await saveBundle(operator, parsed.data);
    return NextResponse.json({ ...saved, message: saved.created ? `${parsed.data.name.trim()} made.` : `${parsed.data.name.trim()} saved.` });
  } catch (error) {
    if (error instanceof AdminRefusal) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
