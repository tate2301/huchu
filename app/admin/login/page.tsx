import { redirect } from "next/navigation";

import { PasswordForm } from "@/components/admin/sign-in/password-form";
import { SignInFrame } from "@/components/admin/sign-in/sign-in-frame";
import { getSignedInOperator, safeAdminPath } from "@/lib/operators/guards";

export const metadata = { title: "Sign in · Corelith admin" };

export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const callbackUrl = safeAdminPath((await searchParams).callbackUrl);
  if (await getSignedInOperator()) redirect(callbackUrl);

  return (
    <SignInFrame eyebrow="Corelith admin" title="Sign in">
      <PasswordForm callbackUrl={callbackUrl} />
    </SignInFrame>
  );
}
