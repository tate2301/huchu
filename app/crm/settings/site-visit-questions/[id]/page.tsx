import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { QuestionSetsRegister } from "@/components/crm/settings/question-sets-register";
import { PageChrome } from "@/components/layout/page-chrome";
import { authOptions } from "@/lib/auth";

/** One section of the site-visit questions, open beside the others. */
export default async function CrmSiteVisitQuestionSetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <CrmPage>
      <PageChrome title="Site visit questions" />
      <QuestionSetsRegister selectedId={id} />
    </CrmPage>
  );
}
