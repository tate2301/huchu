import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { TemplateLibrary } from "@/components/templates/template-library";
import { authOptions } from "@/lib/auth";

export default async function TemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <TemplateLibrary />
    </div>
  );
}
