import { InviteForm } from "@/components/admin/sign-in/invite-form";
import { SignInFrame } from "@/components/admin/sign-in/sign-in-frame";
import { findInvite } from "@/lib/operators/manage";

export const metadata = { title: "Choose a password · Corelith admin" };

export default async function OperatorInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const invite = await findInvite(token);
  if (!invite) {
    return (
      <SignInFrame eyebrow="Corelith admin" title="This invite has run out">
        <p className="t-body text-[var(--text-body)]">Each invite works once, for three days. Ask an owner to send you a new one.</p>
      </SignInFrame>
    );
  }
  return (
    <SignInFrame eyebrow={`Invited as ${invite.email}`} title={`Choose a password, ${invite.name.split(" ")[0]}`}>
      <InviteForm token={token} />
    </SignInFrame>
  );
}
