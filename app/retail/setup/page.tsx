"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Building2, FileText, Package, Scale } from "@/lib/icons";

type SetupRow = {
  area: string;
  description: string;
  destination: string;
  href: string;
};

const SETUP_ROWS: SetupRow[] = [
  {
    area: "Branches and sites",
    description: "Primary operational structure and branch setup.",
    destination: "Management master data",
    href: "/management/master-data",
  },
  {
    area: "Receipts and branding",
    description: "Receipt styling, logos, and customer-facing documents.",
    destination: "Branding",
    href: "/settings/branding",
  },
  {
    area: "Cashier devices",
    description: "Register binding, shift start, and till support.",
    destination: "Shifts",
    href: "/retail/shifts",
  },
  {
    area: "Accounting mapping",
    description: "Posting rules and finance workspace alignment.",
    destination: "Accounting",
    href: "/accounting",
  },
  {
    area: "POS policies",
    description: "Operational controls for selling and branch workflows.",
    destination: "POS policy",
    href: "/retail/setup/pos-policy",
  },
];

export default function RetailSetupPage() {
  const columns: ColumnDef<SetupRow>[] = [
    {
      id: "area",
      header: "Area",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-[var(--text-strong)]">{row.original.area}</div>
          <div className="text-xs text-[var(--text-muted)]">{row.original.description}</div>
        </div>
      ),
    },
    {
      id: "destination",
      header: "Destination",
      cell: ({ row }) => (
        <Link href={row.original.href} className="text-[var(--text-body)] hover:underline">
          {row.original.destination}
        </Link>
      ),
    },
  ];

  return (
    <RetailShell
      title="Setup"
      description="Configure branches, devices, branding, and finance mapping."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/management/master-data">
              <Building2 className="h-4 w-4" />
              Master data
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting">
              <Scale className="h-4 w-4" />
              Accounting
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/branding">
              <FileText className="h-4 w-4" />
              Branding
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/setup/pos-policy">
              <Scale className="h-4 w-4" />
              POS policy
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/shifts">
              <Package className="h-4 w-4" />
              Devices
            </Link>
          </Button>
        </div>
      }
    >
      <DataTable
        data={SETUP_ROWS}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: false }}
        pagination={{ enabled: false, server: false }}
        searchPlaceholder="Search setup areas"
        emptyState="No setup areas defined"
        toolbar={<span className="text-xs text-[var(--text-muted)]">Retail setup entrypoints</span>}
      />
    </RetailShell>
  );
}
