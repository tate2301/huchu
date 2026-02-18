import Link from "next/link";
import { MasterDataShell } from "@/components/management/master-data/master-data-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const coreManagers = [
  {
    title: "Departments",
    description: "Department reference data for HR and compensation workflows.",
    href: "/management/master-data/hr/departments",
  },
  {
    title: "Job Grades",
    description: "Job grade and rank reference data for HR workflows.",
    href: "/management/master-data/hr/job-grades",
  },
  {
    title: "Sites",
    description: "Site reference data for forms, reports, and operations.",
    href: "/management/master-data/operations/sites",
  },
  {
    title: "Sections",
    description: "Section reference data by site for shift and operations reporting.",
    href: "/management/master-data/operations/sections",
  },
  {
    title: "Downtime Codes",
    description: "Downtime reason code reference data for plant reporting.",
    href: "/management/master-data/operations/downtime-codes",
  },
];

const existingManagers = [
  { title: "Chart of Accounts", href: "/accounting/chart-of-accounts" },
  { title: "Cost Centers", href: "/accounting/cost-centers" },
  { title: "Tax Codes", href: "/accounting/tax" },
  { title: "Currency Rates", href: "/accounting/currency" },
  { title: "Customers", href: "/accounting/sales" },
  { title: "Vendors", href: "/accounting/purchases" },
  { title: "Bank Accounts", href: "/accounting/banking" },
  { title: "Inventory Items", href: "/stores/inventory" },
  { title: "Stock Locations", href: "/stores/inventory" },
  { title: "Equipment Register", href: "/maintenance/equipment" },
  { title: "Cameras", href: "/cctv/cameras" },
  { title: "NVRs", href: "/cctv/nvrs" },
];

export default function MasterDataOverviewPage() {
  return (
    <MasterDataShell
      activeTab="overview"
      title="Master Data Management"
      description="Centralized reference entities for forms and operational workflows."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {coreManagers.map((entry) => (
          <Link key={entry.href} href={entry.href} className="block">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardHeader>
                <CardTitle>{entry.title}</CardTitle>
                <CardDescription>{entry.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Existing Module Managers</CardTitle>
          <CardDescription>
            These entities already provide CRUD operations in module screens and are listed here for centralized
            access.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {existingManagers.map((entry) => (
            <Link key={entry.title} href={entry.href} className="text-sm text-primary hover:underline">
              {entry.title}
            </Link>
          ))}
        </CardContent>
      </Card>
    </MasterDataShell>
  );
}
