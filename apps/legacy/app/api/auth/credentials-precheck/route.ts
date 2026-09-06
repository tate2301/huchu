import { NextRequest, NextResponse } from "next/server";
import { getCredentialsPrecheckFailure } from "@/lib/auth-core/credentials-precheck";

export async function GET(request: NextRequest) {
  const failure = await getCredentialsPrecheckFailure(request.headers);

  if (!failure) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    {
      error: failure.error,
      code: failure.code,
      message: failure.message,
    },
    { status: failure.status },
  );
}
