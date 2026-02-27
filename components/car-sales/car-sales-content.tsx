"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchAutosDeals,
  fetchAutosInventory,
  fetchAutosLeads,
  fetchAutosSummary,
  type AutosDeal,
  type AutosLead,
  type AutosVehicle,
} from "@/lib/autos/autos-v2";

type CarSalesView = "leads" | "inventory" | "deals";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function formatMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function leadStatusBadge(status: AutosLead["status"]) {
  if (status === "NEW") return <Badge variant="outline">New</Badge>;
  if (status === "QUALIFIED") return <Badge variant="secondary">Qualified</Badge>;
  if (status === "NEGOTIATION") return <Badge variant="secondary">Negotiation</Badge>;
  if (status === "WON") return <Badge variant="secondary">Won</Badge>;
  if (status === "LOST") return <Badge variant="destructive">Lost</Badge>;
  return <Badge variant="destructive">Canceled</Badge>;
}

function vehicleStatusBadge(status: AutosVehicle["status"]) {
  if (status === "IN_STOCK") return <Badge variant="outline">In Stock</Badge>;
  if (status === "RESERVED") return <Badge variant="secondary">Reserved</Badge>;
  if (status === "SOLD") return <Badge variant="secondary">Sold</Badge>;
  return <Badge variant="destructive">Delivered</Badge>;
}

function dealStatusBadge(status: AutosDeal["status"]) {
  if (status === "QUOTED") return <Badge variant="outline">Quoted</Badge>;
  if (status === "RESERVED") return <Badge variant="secondary">Reserved</Badge>;
  if (status === "CONTRACTED") return <Badge variant="secondary">Contracted</Badge>;
  if (status === "DELIVERY_READY") return <Badge variant="secondary">Delivery Ready</Badge>;
  if (status === "DELIVERED") return <Badge variant="outline">Delivered</Badge>;
  if (status === "DRAFT") return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="destructive">{status}</Badge>;
}

export function CarSalesContent() {
  const [activeView, setActiveView] = useState<CarSalesView>("leads");

  const summaryQuery = useQuery({
    queryKey: ["autos", "summary"],
    queryFn: () => fetchAutosSummary(),
  });
  const leadsQuery = useQuery({
    queryKey: ["autos", "leads", "dashboard"],
    queryFn: () => fetchAutosLeads({ page: 1, limit: 200 }),
  });
  const inventoryQuery = useQuery({
    queryKey: ["autos", "inventory", "dashboard"],
    queryFn: () => fetchAutosInventory({ page: 1, limit: 200 }),
  });
  const dealsQuery = useQuery({
    queryKey: ["autos", "deals", "dashboard"],
    queryFn: () => fetchAutosDeals({ page: 1, limit: 200 }),
  });

  const leads = useMemo(() => leadsQuery.data?.data ?? [], [leadsQuery.data]);
  const inventory = useMemo(
    () => inventoryQuery.data?.data ?? [],
    [inventoryQuery.data],
  );
  const deals = useMemo(() => dealsQuery.data?.data ?? [], [dealsQuery.data]);

  const leadsColumns = useMemo<ColumnDef<AutosLead>[]>(
    () => [
      {
        id: "leadNo",
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
        id: "deals",
        header: "Deals",
        cell: ({ row }) => <NumericCell>{row.original._count.deals}</NumericCell>,
      },
      {
        id: "updated",
        header: "Updated",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.updatedAt)}</NumericCell>,
      },
    ],
    [],
  );

  const inventoryColumns = useMemo<ColumnDef<AutosVehicle>[]>(
    () => [
      {
        id: "stockNo",
        header: "Vehicle",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.stockNo}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.make} {row.original.model} ({row.original.year})
            </div>
          </div>
        ),
      },
      {
        id: "vin",
        header: "VIN",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.vin}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => vehicleStatusBadge(row.original.status),
      },
      {
        id: "listing",
        header: "Listing Price",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.listingPrice)}</NumericCell>,
      },
      {
        id: "floor",
        header: "Approval Floor",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.minApprovalPrice)}</NumericCell>,
      },
      {
        id: "deals",
        header: "Deals",
        cell: ({ row }) => <NumericCell>{row.original._count.deals}</NumericCell>,
      },
    ],
    [],
  );

  const dealsColumns = useMemo<ColumnDef<AutosDeal>[]>(
    () => [
      {
        id: "dealNo",
        header: "Deal",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.dealNo}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.customerName} / {row.original.customerPhone}
            </div>
          </div>
        ),
      },
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.vehicle.stockNo}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.vehicle.make} {row.original.vehicle.model} ({row.original.vehicle.year})
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => dealStatusBadge(row.original.status),
      },
      {
        id: "net",
        header: "Net",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.netAmount)}</NumericCell>,
      },
      {
        id: "paid",
        header: "Paid",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.paidAmount)}</NumericCell>,
      },
      {
        id: "balance",
        header: "Balance",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.balanceAmount)}</NumericCell>,
      },
      {
        id: "reservedUntil",
        header: "Reserved Until",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.reservedUntil)}</NumericCell>,
      },
    ],
    [],
  );

  const hasError = summaryQuery.error || leadsQuery.error || inventoryQuery.error || dealsQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load car sales dashboard</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(summaryQuery.error || leadsQuery.error || inventoryQuery.error || dealsQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-8">
        <div>
          <h2 className="text-sm font-semibold">Leads</h2>
          <p className="font-mono tabular-nums">{summaryQuery.data?.summary.leads ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Qualified</h2>
          <p className="font-mono tabular-nums">
            {summaryQuery.data?.summary.qualifiedLeads ?? 0}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Stock</h2>
          <p className="font-mono tabular-nums">
            {summaryQuery.data?.summary.vehiclesInStock ?? 0}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Reserved Vehicles</h2>
          <p className="font-mono tabular-nums">
            {summaryQuery.data?.summary.vehiclesReserved ?? 0}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Active Deals</h2>
          <p className="font-mono tabular-nums">
            {summaryQuery.data?.summary.activeDeals ?? 0}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Contracted</h2>
          <p className="font-mono tabular-nums">
            {summaryQuery.data?.summary.contractedDeals ?? 0}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Payments</h2>
          <p className="font-mono tabular-nums">
            {summaryQuery.data?.summary.paymentsPosted ?? 0}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Pipeline Net</h2>
          <p className="font-mono tabular-nums">
            {formatMoney(summaryQuery.data?.summary.pipelineNetAmount ?? 0)}
          </p>
        </div>
      </section>

      <VerticalDataViews
        items={[
          { id: "leads", label: "Leads", count: leads.length },
          { id: "inventory", label: "Vehicle Inventory", count: inventory.length },
          { id: "deals", label: "Deals", count: deals.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as CarSalesView)}
        railLabel="Car Sales Views"
      >
        <div className={activeView === "leads" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Lead Pipeline</h2>
          <DataTable
            data={leads}
            columns={leadsColumns}
            searchPlaceholder="Search leads"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={leadsQuery.isLoading ? "Loading leads..." : "No leads available."}
          />
        </div>

        <div className={activeView === "inventory" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Vehicle Inventory</h2>
          <DataTable
            data={inventory}
            columns={inventoryColumns}
            searchPlaceholder="Search vehicles"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              inventoryQuery.isLoading ? "Loading vehicles..." : "No vehicles in inventory."
            }
          />
        </div>

        <div className={activeView === "deals" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Deals</h2>
          <DataTable
            data={deals}
            columns={dealsColumns}
            searchPlaceholder="Search deals"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={dealsQuery.isLoading ? "Loading deals..." : "No deals available."}
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}
