import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { SchoolsBoardingContent } from "../../../components/boarding/schools-boarding-content";

/**
 * The boarding board.
 *
 * The heading moved inside the content component: the page's one primary
 * action is "Allocate a bed", which is gated on the signed-in person's grants
 * and changes with the view they are on, and neither of those is a question a
 * server component can answer.
 */
export default async function SchoolsBoardingPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SchoolsBoardingContent />
    </div>
  );
}
