import { VisitBriefContent } from "@corelithzw/module-crm/components/public/visit-brief-content";

export const dynamic = "force-dynamic";

export default async function PublicVisitBriefPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-neutral-50">
      <VisitBriefContent token={token} />
    </main>
  );
}
