"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
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

const initialLeadForm = { firstName: "", lastName: "", phone: "", email: "", source: "" };
const initialVehicleForm = { make: "", model: "", year: "", color: "", mileage: "", askingPrice: "" };
const initialDealForm = { vehicleId: "", leadId: "", salePrice: "" };

export function CarSalesContent() {
  const [activeView, setActiveView] = useState<CarSalesView>("leads");
  const queryClient = useQueryClient();

  // Lead dialog state
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadForm, setLeadForm] = useState(initialLeadForm);

  // Vehicle dialog state
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(initialVehicleForm);

  // Deal dialog state
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [dealForm, setDealForm] = useState(initialDealForm);

  // Mutations
  const createLeadMutation = useMutation({
    mutationFn: async (payload: typeof leadForm) =>
      fetchJson("/api/v2/autos/leads", {
        method: "POST",
        body: JSON.stringify({
          firstName: payload.firstName,
          lastName: payload.lastName,
          phone: payload.phone,
          email: payload.email || undefined,
          source: payload.source || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autos", "leads", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["autos", "summary"] });
      setLeadForm(initialLeadForm);
      setLeadDialogOpen(false);
    },
  });

  const createVehicleMutation = useMutation({
    mutationFn: async (payload: typeof vehicleForm) =>
      fetchJson("/api/v2/autos/inventory", {
        method: "POST",
        body: JSON.stringify({
          make: payload.make,
          model: payload.model,
          year: Number(payload.year),
          color: payload.color || undefined,
          mileage: payload.mileage ? Number(payload.mileage) : undefined,
          askingPrice: payload.askingPrice ? Number(payload.askingPrice) : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autos", "inventory", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["autos", "summary"] });
      setVehicleForm(initialVehicleForm);
      setVehicleDialogOpen(false);
    },
  });

  const createDealMutation = useMutation({
    mutationFn: async (payload: typeof dealForm) =>
      fetchJson("/api/v2/autos/deals", {
        method: "POST",
        body: JSON.stringify({
          vehicleId: payload.vehicleId,
          leadId: payload.leadId,
          salePrice: payload.salePrice ? Number(payload.salePrice) : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autos", "deals", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["autos", "summary"] });
      setDealForm(initialDealForm);
      setDealDialogOpen(false);
    },
  });

  // Dialog open/close handlers
  const handleLeadDialogOpenChange = (open: boolean) => {
    setLeadDialogOpen(open);
    if (!open) {
      setLeadForm(initialLeadForm);
      createLeadMutation.reset();
    }
  };

  const handleVehicleDialogOpenChange = (open: boolean) => {
    setVehicleDialogOpen(open);
    if (!open) {
      setVehicleForm(initialVehicleForm);
      createVehicleMutation.reset();
    }
  };

  const handleDealDialogOpenChange = (open: boolean) => {
    setDealDialogOpen(open);
    if (!open) {
      setDealForm(initialDealForm);
      createDealMutation.reset();
    }
  };

  // Form submit handlers
  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.firstName || !leadForm.lastName || !leadForm.phone) return;
    createLeadMutation.mutate(leadForm);
  };

  const handleVehicleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.make || !vehicleForm.model || !vehicleForm.year) return;
    createVehicleMutation.mutate(vehicleForm);
  };

  const handleDealSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealForm.vehicleId || !dealForm.leadId) return;
    createDealMutation.mutate(dealForm);
  };

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
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Lead Pipeline</h2>
            <Button size="sm" onClick={() => setLeadDialogOpen(true)}>Add Lead</Button>
          </div>
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
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Vehicle Inventory</h2>
            <Button size="sm" onClick={() => setVehicleDialogOpen(true)}>Add Vehicle</Button>
          </div>
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
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Deals</h2>
            <Button size="sm" onClick={() => setDealDialogOpen(true)}>Add Deal</Button>
          </div>
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

      {/* Add Lead Dialog */}
      <Dialog open={leadDialogOpen} onOpenChange={handleLeadDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLeadSubmit} className="space-y-4">
            {createLeadMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createLeadMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="lead-firstName">First Name *</Label>
              <Input
                id="lead-firstName"
                value={leadForm.firstName}
                onChange={(e) => setLeadForm((f) => ({ ...f, firstName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-lastName">Last Name *</Label>
              <Input
                id="lead-lastName"
                value={leadForm.lastName}
                onChange={(e) => setLeadForm((f) => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-phone">Phone *</Label>
              <Input
                id="lead-phone"
                value={leadForm.phone}
                onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-email">Email</Label>
              <Input
                id="lead-email"
                type="email"
                value={leadForm.email}
                onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-source">Source</Label>
              <Input
                id="lead-source"
                value={leadForm.source}
                onChange={(e) => setLeadForm((f) => ({ ...f, source: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleLeadDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createLeadMutation.isPending}>
                {createLeadMutation.isPending ? "Creating..." : "Create Lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Vehicle Dialog */}
      <Dialog open={vehicleDialogOpen} onOpenChange={handleVehicleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Vehicle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleVehicleSubmit} className="space-y-4">
            {createVehicleMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createVehicleMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="vehicle-make">Make *</Label>
              <Input
                id="vehicle-make"
                value={vehicleForm.make}
                onChange={(e) => setVehicleForm((f) => ({ ...f, make: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-model">Model *</Label>
              <Input
                id="vehicle-model"
                value={vehicleForm.model}
                onChange={(e) => setVehicleForm((f) => ({ ...f, model: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-year">Year *</Label>
              <Input
                id="vehicle-year"
                type="number"
                value={vehicleForm.year}
                onChange={(e) => setVehicleForm((f) => ({ ...f, year: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-color">Color</Label>
              <Input
                id="vehicle-color"
                value={vehicleForm.color}
                onChange={(e) => setVehicleForm((f) => ({ ...f, color: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-mileage">Mileage</Label>
              <Input
                id="vehicle-mileage"
                type="number"
                value={vehicleForm.mileage}
                onChange={(e) => setVehicleForm((f) => ({ ...f, mileage: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-askingPrice">Asking Price</Label>
              <Input
                id="vehicle-askingPrice"
                type="number"
                step="0.01"
                value={vehicleForm.askingPrice}
                onChange={(e) => setVehicleForm((f) => ({ ...f, askingPrice: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleVehicleDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createVehicleMutation.isPending}>
                {createVehicleMutation.isPending ? "Creating..." : "Create Vehicle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Deal Dialog */}
      <Dialog open={dealDialogOpen} onOpenChange={handleDealDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Deal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDealSubmit} className="space-y-4">
            {createDealMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createDealMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="deal-vehicleId">Vehicle *</Label>
              <select
                id="deal-vehicleId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={dealForm.vehicleId}
                onChange={(e) => setDealForm((f) => ({ ...f, vehicleId: e.target.value }))}
                required
              >
                <option value="">Select a vehicle</option>
                {inventory.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.stockNo} — {v.make} {v.model} ({v.year})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deal-leadId">Lead *</Label>
              <select
                id="deal-leadId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={dealForm.leadId}
                onChange={(e) => setDealForm((f) => ({ ...f, leadId: e.target.value }))}
                required
              >
                <option value="">Select a lead</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.leadNo} — {l.customerName} / {l.phone}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deal-salePrice">Sale Price</Label>
              <Input
                id="deal-salePrice"
                type="number"
                step="0.01"
                value={dealForm.salePrice}
                onChange={(e) => setDealForm((f) => ({ ...f, salePrice: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDealDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createDealMutation.isPending}>
                {createDealMutation.isPending ? "Creating..." : "Create Deal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
