"use client";

import Link from "next/link";

import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, BarChart3, Camera, CheckCircle2, Clock, Factory, FileCheck, Fuel, Gem, History, Package, Shield, Users, Wrench } from "@/lib/icons";

const reportCards = [
  {
    href: "/reports/shift",
    title: "Shift Reports",
    description: "Submitted shift entries by date, shift, and site.",
    icon: Factory,
  },
  {
    href: "/reports/attendance",
    title: "Attendance",
    description: "Crew attendance records and status trends.",
    icon: Users,
  },
  {
    href: "/reports/plant",
    title: "Plant Reports",
    description: "Plant output, runtime, and downtime history.",
    icon: BarChart3,
  },
  {
    href: "/reports/stores-movements",
    title: "Stock Movements",
    description: "Receipts, issues, adjustments, and transfers.",
    icon: History,
  },
  {
    href: "/reports/fuel-ledger",
    title: "Fuel Ledger",
    description: "Fuel stock and transaction history.",
    icon: Fuel,
  },
  {
    href: "/reports/maintenance-work-orders",
    title: "Work Orders",
    description: "Maintenance workload and completion status.",
    icon: Wrench,
  },
  {
    href: "/reports/maintenance-equipment",
    title: "Equipment Service",
    description: "Equipment register with service status.",
    icon: Package,
  },
  {
    href: "/reports/gold-chain",
    title: "Gold Chain",
    description: "Pour to dispatch to receipt traceability.",
    icon: Gem,
  },
  {
    href: "/reports/gold-receipts",
    title: "Gold Receipts",
    description: "Buyer receipt confirmations and settlement records.",
    icon: CheckCircle2,
  },
  {
    href: "/reports/compliance-incidents",
    title: "Incidents",
    description: "Compliance and safety incident records.",
    icon: Shield,
  },
  {
    href: "/reports/cctv-events",
    title: "CCTV Events",
    description: "Security events and acknowledgements.",
    icon: Camera,
  },
  {
    href: "/reports/audit-trails",
    title: "Audit Trails",
    description: "Operational audit events across modules.",
    icon: FileCheck,
  },
  {
    href: "/reports/downtime",
    title: "Downtime Analytics",
    description: "Top downtime causes, hours, and availability.",
    icon: Clock,
  },
];

export default function ReportsDashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading
        title="Reports"
        description="Use this dashboard to open independent report pages across the platform."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reportCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.href} className="transition-colors hover:border-border">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                >
                  Open report
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

