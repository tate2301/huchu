import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { editFeature } from "@/lib/admin/catalogue";
import { AdminRefusal } from "@/lib/admin/refusal";
import { getSignedInOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";

/** Catalogue › a feature's sheet. GET: the feature (`?key=`). POST: edits one made outside the code; owners only. */
export async function GET(request: NextRequest) {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const feature = await prisma.platformFeature.findUnique({ where: { key }, select: { key: true, name: true, domain: true, defaultEnabled: true } });
  if (!feature) return NextResponse.json({ error: "That feature is not in the catalogue." }, { status: 404 });
  return NextResponse.json({ feature }, { headers: { "Cache-Control": "no-store" } });
}

const body = z.object({
  key: z.string().min(1).max(120),
  name: z.string().max(120),
  domain: z.string().max(40),
  defaultEnabled: z.boolean(),
});

export async function POST(request: Request) {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!operatorCan(operator.role, "operator.manage")) return NextResponse.json({ error: "Only an owner can change the catalogue." }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  try {
    await editFeature(operator, parsed.data.key, parsed.data);
    return NextResponse.json({ message: `${parsed.data.name.trim()} saved.` });
  } catch (error) {
    if (error instanceof AdminRefusal) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
