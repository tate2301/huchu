import { SignOffContent } from "@corelithzw/module-crm/components/public/sign-off-content";

export const dynamic = "force-dynamic";

export default async function PublicSignOffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-neutral-50">
      <SignOffContent token={token} />
    </main>
  );
}
