import { redirect } from "next/navigation";

import { movedTo } from "@/lib/books/moved";

/** A custom report moved to `/reports/c/[slug]`; old links keep working. */
export default async function OldCustomReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  redirect(movedTo(`/reports/c/${encodeURIComponent(id)}`, await searchParams));
}
