import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { submitCode } from "@/app/admin/login/actions";
import { CodeForm } from "@/components/admin/sign-in/code-form";
import { SignInFrame } from "@/components/admin/sign-in/sign-in-frame";
import { getSignedInOperator, safeAdminPath } from "@/lib/operators/guards";
import { OPERATOR_COOKIE } from "@/lib/operators/session";
import { findPendingSession } from "@/lib/operators/sign-in";

export const metadata = { title: "Authenticator code · Corelith admin" };

export default async function AdminCodePage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const callbackUrl = safeAdminPath((await searchParams).callbackUrl);
  if (await getSignedInOperator()) redirect(callbackUrl);

  const session = await findPendingSession((await cookies()).get(OPERATOR_COOKIE)?.value);
  if (!session) redirect("/admin/login");
  if (!session.operator.totpConfirmedAt) redirect("/admin/login/set-up");

  return (
    <SignInFrame eyebrow={`Signing in as ${session.operator.email}`} title="Enter the code from your authenticator">
      <CodeForm callbackUrl={callbackUrl} action={submitCode} submitLabel="Sign in" />
    </SignInFrame>
  );
}
