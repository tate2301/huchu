import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { BoardingHostelsContent } from "@/components/schools/boarding/boarding-hostels-content";
import { authOptions } from "@/lib/auth";

/**
 * A boarding house and everything in it.
 *
 * `?hostel=` is read here rather than in the component so a link from an
 * allocation row lands on the right house on the first paint — a client that
 * seeds itself from the query string after mounting shows the wrong house for
 * a frame, which on this screen means the wrong beds.
 */
export default async function BoardingHostelsPage({
  searchParams,
}: {
  searchParams: Promise<{ hostel?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { hostel } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <BoardingHostelsContent initialHostelId={hostel} />
    </div>
  );
}
