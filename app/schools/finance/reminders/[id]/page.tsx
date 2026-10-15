import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { VaneRemindersContent } from "@/components/schools/fees/vane-reminders-content";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readReminderDraft } from "@/lib/schools/vane-reminders";

/** The fee reminders Vane drafted (PageVaneSchool): tick the families, change the words, send them. */
export default async function VaneRemindersPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const draft = await readReminderDraft(prisma, session.user.companyId, (await params).id);
  if (!draft) notFound();
  return <VaneRemindersContent draft={draft} />;
}
