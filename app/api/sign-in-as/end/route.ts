import { NextRequest, NextResponse } from "next/server";

import { validateSession } from "@/lib/api-utils";
import { endSignInAs } from "@/lib/sign-in-as/sessions";

/** The banner's End: the operator signed in as this member ends their own session. */
export async function POST(request: NextRequest) {
  const result = await validateSession(request);
  if (result instanceof NextResponse) return result;
  const signInAs = result.session.user.signInAs;
  if (!signInAs) return NextResponse.json({ error: "This is not a sign-in-as session." }, { status: 409 });
  await endSignInAs(signInAs.id, "OPERATOR", null);
  return NextResponse.json({ ended: true });
}
