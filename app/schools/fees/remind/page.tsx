import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { newestReminderDraftId } from "@/lib/schools/vane-reminders";

/**
 * The old Remind families address: the newest fee reminder Vane drafted that
 * waits for a person now has its own page (`/schools/finance/reminders/[id]`,
 * PageVaneSchool). With none waiting, Arrears lists who owes.
 */
export default async function RemindFamiliesRedirect() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const id = await newestReminderDraftId(prisma, session.user.companyId);
  redirect(id ? `/schools/finance/reminders/${id}` : "/schools/finance/arrears");
}
