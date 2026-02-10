import Link from "next/link";
import {
  NoteAdd,
  UserCheck,
  type LucideIcon,
} from "@/lib/icons";

import { PageActions } from "@/components/layout/page-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { navSections } from "@/lib/navigation";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type DashboardTileProps = {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  actionLabel: string;
  iconAccentClassName: string;
};

type TileMeta = {
  description: string;
  actionLabel: string;
};

const tileMetaByHref: Record<string, TileMeta> = {
  "/shift-report": {
    description: "Capture shift output, stoppages, and notes.",
    actionLabel: "Submit Report",
  },
  "/reports/shift": {
    description: "Browse submitted shift reports.",
    actionLabel: "View Shift Reports",
  },
  "/attendance": {
    description: "Record crew attendance for the active shift.",
    actionLabel: "Mark Attendance",
  },
  "/reports/attendance": {
    description: "Open attendance records by date and shift.",
    actionLabel: "View Attendance",
  },
  "/plant-report": {
    description: "Log plant throughput and processing metrics.",
    actionLabel: "Submit Plant Report",
  },
  "/reports/plant": {
    description: "Review plant reports and exports.",
    actionLabel: "View Plant Reports",
  },
  "/human-resources": {
    description: "Manage employee records and workforce details.",
    actionLabel: "Manage Employees",
  },
  "/human-resources/payouts": {
    description: "Review and process staff payouts.",
    actionLabel: "Manage Payouts",
  },
  "/human-resources/salaries": {
    description: "Update salary structures and rates.",
    actionLabel: "Edit Salary Setup",
  },
  "/maintenance": {
    description: "Track equipment health and maintenance KPIs.",
    actionLabel: "View Dashboard",
  },
  "/maintenance/equipment": {
    description: "Maintain the equipment master register.",
    actionLabel: "Open Register",
  },
  "/maintenance/work-orders": {
    description: "Create and monitor maintenance work orders.",
    actionLabel: "Open Work Orders",
  },
  "/maintenance/breakdown": {
    description: "Capture new breakdowns and fault details.",
    actionLabel: "Log Breakdown",
  },
  "/maintenance/schedule": {
    description: "Plan preventive maintenance by calendar.",
    actionLabel: "Open PM Schedule",
  },
  "/stores/dashboard": {
    description: "Monitor stock, movement, and fuel summaries.",
    actionLabel: "View Dashboard",
  },
  "/stores/inventory": {
    description: "Review current stock balances by item.",
    actionLabel: "View Stock",
  },
  "/stores/movements": {
    description: "Audit recent inventory and fuel movements.",
    actionLabel: "View Action Log",
  },
  "/stores/fuel": {
    description: "Track fuel receipts, issues, and usage.",
    actionLabel: "Open Fuel Log",
  },
  "/stores/issue": {
    description: "Issue inventory to teams or operations.",
    actionLabel: "Issue Stock",
  },
  "/stores/receive": {
    description: "Record incoming stock into inventory.",
    actionLabel: "Receive Stock",
  },
  "/gold": {
    description: "Oversee custody flow from intake to settlement.",
    actionLabel: "Open Command Center",
  },
  "/gold/intake/pours/new": {
    description: "Log total gold produced for the shift.",
    actionLabel: "Log Gold Output",
  },
  "/gold/transit/dispatches/new": {
    description: "Dispatch bars into controlled transit.",
    actionLabel: "Create Dispatch",
  },
  "/gold/settlement/receipts/new": {
    description: "Confirm settlement receipts from buyers.",
    actionLabel: "Record Receipt",
  },
  "/gold/settlement/payouts": {
    description: "Review payout allocations and approvals.",
    actionLabel: "Review Payouts",
  },
  "/gold/exceptions": {
    description: "Resolve custody exceptions and corrections.",
    actionLabel: "Review Exceptions",
  },
  "/reports/gold-chain": {
    description: "Analyze gold operations and settlement trends.",
    actionLabel: "View Reports",
  },
  "/reports/downtime": {
    description: "Analyze downtime drivers and performance loss.",
    actionLabel: "View Analytics",
  },
  "/dashboard": {
    description: "Track production KPIs across sites.",
    actionLabel: "View Production Dashboard",
  },
  "/compliance": {
    description: "Check compliance status and required actions.",
    actionLabel: "Review Compliance",
  },
  "/cctv": {
    description: "View camera feeds and playback events.",
    actionLabel: "Open CCTV",
  },
  "/reports": {
    description: "Access consolidated operational reports.",
    actionLabel: "Open Reports",
  },
  "/reports/stores-movements": {
    description: "View movement records across stores operations.",
    actionLabel: "Open Stock Movements",
  },
  "/reports/fuel-ledger": {
    description: "Review fuel stock and transaction history.",
    actionLabel: "Open Fuel Ledger",
  },
  "/reports/maintenance-work-orders": {
    description: "Review maintenance work order records.",
    actionLabel: "Open Work Orders",
  },
  "/reports/maintenance-equipment": {
    description: "View equipment service status and schedule.",
    actionLabel: "Open Equipment Service",
  },
  "/reports/gold-receipts": {
    description: "Review gold buyer receipt confirmations.",
    actionLabel: "Open Gold Receipts",
  },
  "/reports/compliance-incidents": {
    description: "View compliance and safety incident logs.",
    actionLabel: "Open Incidents",
  },
  "/reports/cctv-events": {
    description: "Review CCTV event history and severity.",
    actionLabel: "Open CCTV Events",
  },
  "/reports/audit-trails": {
    description: "Track audit trails across stores, gold, and maintenance.",
    actionLabel: "Open Audit Trails",
  },
};

const sectionIconAccentById: Record<string, string> = {
  daily: "bg-emerald-100 text-emerald-700 ring-emerald-300",
  reporting: "bg-cyan-100 text-cyan-700 ring-cyan-300",
  hr: "bg-indigo-100 text-indigo-700 ring-indigo-300",
  maintenance: "bg-amber-100 text-amber-700 ring-amber-300",
  stores: "bg-sky-100 text-sky-700 ring-sky-300",
  gold: "bg-yellow-100 text-yellow-700 ring-yellow-300",
  management: "bg-rose-100 text-rose-700 ring-rose-300",
};

function DashboardTile({
  href,
  icon: Icon,
  label,
  description,
  actionLabel,
  iconAccentClassName,
}: DashboardTileProps) {
  return (
    <Card className="h-full border-border/70 transition-colors hover:border-border">
      <CardHeader className="space-y-3 pb-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md ring-1",
            iconAccentClassName,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-sm leading-none">{label}</CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Button asChild variant="outline" className="w-full justify-center">
          <Link href={href}>{actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const sectionOrder = [
    "daily",
    "gold",
    "stores",
    "maintenance",
    "hr",
    "management",
    "reporting",
  ];
  const orderIndex = new Map(
    sectionOrder.map((sectionId, index) => [sectionId, index]),
  );
  const groupedSections = navSections
    .filter((section) => section.id !== "overview")
    .slice()
    .sort((a, b) => {
      const aIndex = orderIndex.get(a.id);
      const bIndex = orderIndex.get(b.id);

      if (aIndex === undefined && bIndex === undefined) {
        return a.title.localeCompare(b.title);
      }
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      return aIndex - bIndex;
    });

  return (
    <div className="space-y-8">
      <PageActions>
        <Link href="/shift-report">
          <Button size="sm">
            <NoteAdd className="h-4 w-4" />
            New Shift Report
          </Button>
        </Link>
        <Link href="/attendance">
          <Button size="sm" variant="outline">
            <UserCheck className="h-4 w-4" />
            Take Attendance
          </Button>
        </Link>
      </PageActions>

      <div className="grid gap-8">
        {groupedSections.map((group) => (
          <div key={group.id}>
            <h2 className="uppercase text-lg text-foreground font-bold mb-1 px-2">
              {group.title}
            </h2>
            {group.description ? (
              <p className="mb-4 px-2 text-sm text-muted-foreground">
                {group.description}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-12">
              {group.items.map((item) => {
                const tileMeta = tileMetaByHref[item.href] ?? {
                  description: `Open ${item.label.toLowerCase()}.`,
                  actionLabel: `Open ${item.label}`,
                };
                return (
                  <DashboardTile
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    description={tileMeta.description}
                    actionLabel={tileMeta.actionLabel}
                    iconAccentClassName={
                      sectionIconAccentById[group.id] ??
                      "bg-slate-100 text-slate-700 ring-slate-300"
                    }
                  />
                );
              })}
            </div>
            <Separator />
          </div>
        ))}
      </div>
    </div>
  );
}
