import { redirect } from "next/navigation";

type StoresPageProps = {
  searchParams?: Promise<{ view?: string }>;
};

const viewToRoute: Record<string, string> = {
  dashboard: "/stores/dashboard",
  inventory: "/stores/inventory",
  movements: "/stores/movements",
  fuel: "/stores/fuel",
  issue: "/stores/issue",
  receive: "/stores/receive",
};

export default async function StoresIndexPage({ searchParams }: StoresPageProps) {
  const resolvedSearchParams = await searchParams;
  const view = resolvedSearchParams?.view;
  if (view && viewToRoute[view]) {
    redirect(viewToRoute[view]);
  }
  redirect("/stores/dashboard");
}
