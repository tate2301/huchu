import { redirect } from "next/navigation";

type StoresPageProps = {
  searchParams?: { view?: string };
};

const viewToRoute: Record<string, string> = {
  dashboard: "/stores/dashboard",
  inventory: "/stores/inventory",
  fuel: "/stores/fuel",
  issue: "/stores/issue",
  receive: "/stores/receive",
};

export default function StoresIndexPage({ searchParams }: StoresPageProps) {
  const view = searchParams?.view;
  if (view && viewToRoute[view]) {
    redirect(viewToRoute[view]);
  }
  redirect("/stores/dashboard");
}
