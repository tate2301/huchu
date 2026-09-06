import { ApprovalContent } from "@corelithzw/module-crm/components/public/approval-content";

export const dynamic = "force-dynamic";

export default async function PublicApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-neutral-50">
      <ApprovalContent token={token} />
    </main>
  );
}
