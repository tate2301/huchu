import type { Metadata } from "next";

import { ClaimPortalAccountContent } from "@corelithzw/module-campus/components/portal/claim-portal-account-content";

export const metadata: Metadata = {
  title: "Set up your portal account",
  robots: { index: false, follow: false },
};

/**
 * Claiming a portal account.
 *
 * Public and unbranded by tenant, because the person opening it has no session
 * and no workspace yet — the token is all they have. Mobile first: this arrives
 * as a WhatsApp link and is opened on a phone.
 */
export default async function ClaimPortalAccountPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ClaimPortalAccountContent token={token} />;
}
