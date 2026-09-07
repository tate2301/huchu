import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { WelfareContent } from "../../../../components/boarding/welfare-content";

/**
 * Health, allergies and consent.
 *
 * Under Boarding because that is the band it is sold in and the persona that
 * needs it at two in the morning, but it covers day pupils too — an allergy
 * does not care whether a child sleeps at school.
 *
 * The heading lives inside the content component: its primary action is gated
 * on the signed-in person's grants, which a server component cannot ask.
 */
export default async function WelfarePage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <WelfareContent />
    </div>
  );
}
