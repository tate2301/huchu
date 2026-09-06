import { redirect } from "next/navigation";

type StoresPageProps = {
  searchParams?: Promise<{ view?: string }>;
};

const viewToRoute: Record<string, string> = {
  dashboard: "/stores/dashboard",
  inventory: "/stores/inventory",
  locations: "/stores/locations",
  movements: "/stores/movements",
  catalogue: "/stores/catalogue",
  "price-lists": "/stores/price-lists",
  fuel: "/stores/fuel",
  // Both are dialogs now; the movement log is where they open.
  issue: "/stores/movements?record=issue",
  receive: "/stores/movements?record=receive",
};

export default async function StoresIndexPage({ searchParams }: StoresPageProps) {
  const resolvedSearchParams = await searchParams;
  const view = resolvedSearchParams?.view;
  if (view && viewToRoute[view]) {
    redirect(viewToRoute[view]);
  }
  redirect("/stores/dashboard");
}
