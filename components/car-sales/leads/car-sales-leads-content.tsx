"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchAutosLeads, type AutosLead } from "@/lib/autos/autos-v2";

function leadStatusBadge(status: AutosLead["status"]) {
  if (status === "NEW") return <Badge variant="outline">New</Badge>;
  if (status === "QUALIFIED") return <Badge variant="secondary">Qualified</Badge>;
  if (status === "NEGOTIATION") return <Badge variant="secondary">Negotiation</Badge>;
  if (status === "WON") return <Badge variant="secondary">Won</Badge>;
  if (status === "LOST") return <Badge variant="destructive">Lost</Badge>;
  return <Badge variant="destructive">Canceled</Badge>;
}

function formatMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CarSalesLeadsContent() {
  const leadsQuery = useQuery({
    queryKey: ["autos", "leads", "page"],
    queryFn: () => fetchAutosLeads({ page: 1, limit: 250 }),
  });

  const rows = useMemo(() => leadsQuery.data?.data ?? [], [leadsQuery.data]);

  const columns = useMemo<ColumnDef<AutosLead>[]>(
    () => [
      {
        id: "lead",
        header: "Lead",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.leadNo}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.customerName} / {row.original.phone}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => leadStatusBadge(row.original.status),
      },
      {
        id: "interest",
        header: "Vehicle Interest",
        cell: ({ row }) => row.original.vehicleInterest || "-",
      },
      {
        id: "budget",
        header: "Budget Range",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.budgetMin !== null || row.original.budgetMax !== null
              ? `${formatMoney(row.original.budgetMin)} - ${formatMoney(row.original.budgetMax)}`
              : "-"}
          </NumericCell>
        ),
      },
      {
        id: "assigned",
        header: "Assigned To",
        cell: ({ row }) => row.original.assignedTo?.name || "-",
      },
      {
        id: "deals",
        header: "Deals",
        cell: ({ row }) => <NumericCell>{row.original._count.deals}</NumericCell>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {leadsQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load leads</AlertTitle>
          <AlertDescription>{getApiErrorMessage(leadsQuery.error)}</AlertDescription>
        </Alert>
      ) : null}
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search leads"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={leadsQuery.isLoading ? "Loading leads..." : "No leads found."}
      />
    </div>
  );
}
