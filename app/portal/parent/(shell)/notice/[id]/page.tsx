import { ParentNoticeDetailScreen } from "@/components/schools/portal/parent/parent-notice-detail-screen";

/** The shell's layout owns the guard and the household — see `(shell)/layout.tsx`. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ParentNoticeDetailScreen noticeId={id} />;
}
