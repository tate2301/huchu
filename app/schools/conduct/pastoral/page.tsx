import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PastoralContent } from "@/components/schools/conduct/pastoral-content";
import { authOptions } from "@/lib/auth";

/**
 * Pastoral notes — S-12.3.
 *
 * The route is `/schools/conduct/pastoral` and the sidebar row sits under
 * Welfare, beside Health and welfare. That disagreement between the menu and
 * the address is `conduct.md` open question 1, and it is deliberate rather than
 * accidental: the canvas's argument about the menu — "a pastoral note is not a
 * discipline record; filing it under Conduct would tell every person who opened
 * the menu that it was" — applies to a URL too, and the spec says so. The route
 * is built where the contract draws it; moving it is a rename, and the
 * argument is on the record.
 *
 * Nothing about this page prints or exports. That is not an omission.
 */
export default async function SchoolsPastoralPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PastoralContent />
    </div>
  );
}
