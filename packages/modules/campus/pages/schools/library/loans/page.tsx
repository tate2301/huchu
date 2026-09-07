import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { LibraryLoansContent } from "../../../../components/library/library-loans-content";

/**
 * What is out, as its own address.
 *
 * The register was a tab inside the catalogue, which meant the one list anybody
 * needs to send — "here is what your form still has out" — could not be linked
 * to. It is a route now, and `LibraryViews` keeps it reading as the second half
 * of the library rather than a second destination.
 *
 * The heading lives inside the content component: "Lend a book" is gated on the
 * signed-in person's grants, which a server component cannot ask.
 */
export default async function LibraryLoansPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <LibraryLoansContent />
    </div>
  );
}
