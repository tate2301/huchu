import QRCode from "qrcode";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { confirmSetUp } from "@/app/admin/login/actions";
import { CodeForm } from "@/components/admin/sign-in/code-form";
import { SignInFrame } from "@/components/admin/sign-in/sign-in-frame";
import { getSignedInOperator, safeAdminPath } from "@/lib/operators/guards";
import { OPERATOR_COOKIE } from "@/lib/operators/session";
import { authenticatorToSetUp } from "@/lib/operators/sign-in";
import { formatSecretForTyping } from "@/lib/operators/totp";

export const metadata = { title: "Set up your authenticator · Corelith admin" };

export default async function AdminSetUpPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const callbackUrl = safeAdminPath((await searchParams).callbackUrl);
  if (await getSignedInOperator()) redirect(callbackUrl);

  const setUp = await authenticatorToSetUp((await cookies()).get(OPERATOR_COOKIE)?.value);
  if (!setUp) redirect("/admin/login");

  const qr = await QRCode.toString(setUp.uri, { type: "svg", margin: 0, errorCorrectionLevel: "M" });

  return (
    <SignInFrame eyebrow={`Signing in as ${setUp.email}`} title="Set up your authenticator">
      <ol className="space-y-4 t-body text-[var(--text-body)]">
        <li className="space-y-3">
          <p>
            <span className="font-medium text-[var(--text-strong)]">1. Scan this with your authenticator app.</span>{" "}
            Google Authenticator, 1Password, Authy or any other app that shows six-digit codes.
          </p>
          <div
            role="img"
            aria-label="QR code for your authenticator app"
            className="size-40 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 [&_svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="t-body-sm text-[var(--text-muted)]">
            Cannot scan? Type this key in instead:{" "}
            <span className="font-mono text-[var(--text-strong)] [overflow-wrap:anywhere]">{formatSecretForTyping(setUp.secret)}</span>
          </p>
        </li>
        <li>
          <p>
            <span className="font-medium text-[var(--text-strong)]">2. Enter the code it shows.</span> From then on
            you will need it every time you sign in.
          </p>
        </li>
      </ol>
      <CodeForm callbackUrl={callbackUrl} action={confirmSetUp} submitLabel="Finish setting up" />
    </SignInFrame>
  );
}
