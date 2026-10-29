import { redirect } from "next/navigation";

type StoresPageProps = {
  searchParams?: Promise<{ view?: string }>;
};

const viewToRoute: Record<string, string> = {
  dashboard: "/retail/stock",
  inventory: "/retail/stock",
  locations: "/retail/stock",
  movements: "/retail/stock/movements",
  catalogue: "/retail/products",
  "price-lists": "/retail/products/price-lists",
  fuel: "/retail/stock",
  issue: "/retail/stock/movements",
  receive: "/retail/buying/deliveries",
};

export default async function StoresIndexPage({ searchParams }: StoresPageProps) {
  const resolvedSearchParams = await searchParams;
  const view = resolvedSearchParams?.view;
  if (view && viewToRoute[view]) {
    redirect(viewToRoute[view]);
  }
  redirect("/retail/stock");
}
