import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { TemplateLibrary } from "../../components/template-library";

export default async function TemplatesPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <TemplateLibrary />
    </div>
  );
}
