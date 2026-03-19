import { redirect } from "next/navigation";

type ComplianceTab = "permits" | "inspections" | "incidents" | "training";

function toRoute(tab: string | undefined): ComplianceTab {
  if (tab === "inspections" || tab === "incidents" || tab === "training") {
    return tab;
  }
  return "permits";
}

export default async function ComplianceIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; createdId?: string; createdAt?: string; source?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const route = toRoute(resolvedSearchParams?.tab);
  const params = new URLSearchParams();
  if (resolvedSearchParams?.createdId) params.set("createdId", resolvedSearchParams.createdId);
  if (resolvedSearchParams?.createdAt) params.set("createdAt", resolvedSearchParams.createdAt);
  if (resolvedSearchParams?.source) params.set("source", resolvedSearchParams.source);
  const query = params.toString();
  redirect(query ? `/compliance/${route}?${query}` : `/compliance/${route}`);
}
