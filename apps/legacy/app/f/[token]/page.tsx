import { IntakeFormContent } from "@corelithzw/module-crm/components/public/intake-form-content";
import { PublicTemplateForm } from "@corelithzw/module-documents/components/templates/public-template-form";
import { prisma } from "@corelithzw/db/client";

export const dynamic = "force-dynamic";

/**
 * One public form URL, whichever kind of form is behind it.
 *
 * Intake forms came first and their links are printed on things; block
 * templates are what new forms are built with. Giving the new ones their own
 * path would have meant two public form surfaces and customers holding links
 * that look wrong. So the token decides, and the older shape keeps working
 * until nobody is using it.
 */
export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const template = await prisma.crmTemplate.findFirst({
    where: { publicToken: token, isActive: true, kind: "FORM" },
    select: { id: true },
  });

  return (
    <main className="min-h-screen bg-neutral-50">
      {template ? (
        <PublicTemplateForm token={token} />
      ) : (
        <IntakeFormContent token={token} />
      )}
    </main>
  );
}
