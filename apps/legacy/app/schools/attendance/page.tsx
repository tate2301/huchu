import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { RegisterOversightContent } from "@/components/schools/attendance/register-oversight-content";
import { authOptions } from "@/lib/auth";

/**
 * The office's view of attendance: which registers are in and which are not.
 * Marking one is a teacher's job and lives in the teacher portal.
 *
 * The name and the one primary action are registered from the client component
 * into the app bar, because the action opens a dialog this file cannot reach.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function SchoolsAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  // `?date=` so a day is a link. "Nobody took a register on the 25th" is a
  // message someone forwards, and forwarding a screen that always opens on
  // today makes the recipient re-find the day being complained about.
  const { date } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <RegisterOversightContent
        initialDate={date && ISO_DATE.test(date) ? date : undefined}
      />
    </div>
  );
}
