import Link from "next/link";
import { MasterDataShell } from "@/components/management/master-data/master-data-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const coreManagers = [
  {
    title: "Departments",
    description: "Manage employee department lookups used in HR and compensation.",
    href: "/management/master-data/hr/departments",
  },
  {
    title: "Job Grades",
    description: "Maintain job grade and rank definitions used across HR flows.",
    href: "/management/master-data/hr/job-grades",
  },
  {
    title: "Sites",
    description: "Maintain active sites used by forms, reports, and operations.",
    href: "/management/master-data/operations/sites",
  },
  {
    title: "Sections",
    description: "Maintain sections under sites for shift and operations reporting.",
    href: "/management/master-data/operations/sections",
  },
  {
    title: "Downtime Codes",
    description: "Maintain downtime reason codes used in plant reporting.",
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
      description="Centralize lookup entities used by forms and operational workflows."
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
          <CardTitle>Existing Managers in Modules</CardTitle>
          <CardDescription>
            These entities already have CRUD in module screens and are linked here for centralized access.
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
