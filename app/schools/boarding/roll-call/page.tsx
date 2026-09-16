import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { RollCallContent } from "@/components/schools/boarding/roll-call-content";
import { authOptions } from "@/lib/auth";

/**
 * Tonight's roll call.
 *
 * A rail entry of its own rather than a view inside a house, because it is the
 * one thing in boarding that happens at a fixed time every night and is the
 * reason somebody opens this module at nine o'clock.
 *
 * The heading lives inside the content component: the page's one primary
 * action is "Sign the register off", which is gated on the signed-in person's
 * grants and refused while anybody is still unaccounted for — and neither of
 * those is a question a server component can answer.
 */
export default async function RollCallPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <RollCallContent />
    </div>
  );
}
