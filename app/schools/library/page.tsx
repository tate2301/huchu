import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LibraryContent } from "@/components/schools/library/library-content";
import { authOptions } from "@/lib/auth";

/**
 * The library, from the issue desk.
 *
 * The heading is inside the content component: "Add a book" is gated on the
 * signed-in person's grants, which a server component cannot ask.
 */
export default async function LibraryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <LibraryContent />
    </div>
  );
}
