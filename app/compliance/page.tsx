import { redirect } from "next/navigation";

type ComplianceTab = "permits" | "inspections" | "incidents" | "training";

function toRoute(tab: string | undefined): ComplianceTab {
  if (tab === "inspections" || tab === "incidents" || tab === "training") {
    return tab;
  }
  return "permits";
}

export default function ComplianceIndexPage({
  searchParams,
}: {
  searchParams?: { tab?: string; createdId?: string; createdAt?: string; source?: string };
}) {
  const route = toRoute(searchParams?.tab);
  const params = new URLSearchParams();
  if (searchParams?.createdId) params.set("createdId", searchParams.createdId);
  if (searchParams?.createdAt) params.set("createdAt", searchParams.createdAt);
  if (searchParams?.source) params.set("source", searchParams.source);
  const query = params.toString();
  redirect(query ? `/compliance/${route}?${query}` : `/compliance/${route}`);
}
