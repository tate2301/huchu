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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type IntakeItem = {
  id: string;
  itemName: string;
  description: string | null;
  condition: "new" | "good" | "fair" | "poor";
  category: string | null;
  estimatedValue: number | null;
  source: "donation" | "purchase";
  receivedDate: string;
  createdAt: string;
};

type CatalogItem = {
  id: string;
  itemName: string;
  description: string | null;
  condition: "new" | "good" | "fair" | "poor";
  category: string | null;
  price: number | null;
  status: "available" | "sold" | "reserved";
  createdAt: string;
};

type SaleRecord = {
  id: string;
  itemId: string;
  itemName?: string;
  customerName: string;
  salePrice: number;
  paymentMethod: "cash" | "card" | "mobile";
  saleDate: string;
  createdAt: string;
};

type ThriftView = "intake" | "catalog" | "sales";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

function conditionBadge(condition: string) {
  if (condition === "new") return <Badge variant="secondary">New</Badge>;
  if (condition === "good") return <Badge variant="outline">Good</Badge>;
  if (condition === "fair") return <Badge variant="outline">Fair</Badge>;
  return <Badge variant="destructive">Poor</Badge>;
}

function catalogStatusBadge(status: string) {
  if (status === "available") return <Badge variant="secondary">Available</Badge>;
  if (status === "reserved") return <Badge variant="outline">Reserved</Badge>;
  return <Badge variant="destructive">Sold</Badge>;
}

function sourceBadge(source: string) {
  if (source === "donation") return <Badge variant="secondary">Donation</Badge>;
  return <Badge variant="outline">Purchase</Badge>;
}

function paymentBadge(method: string) {
  if (method === "cash") return <Badge variant="secondary">Cash</Badge>;
  if (method === "card") return <Badge variant="outline">Card</Badge>;
  return <Badge variant="outline">Mobile</Badge>;
}

/* ------------------------------------------------------------------ */
/*  Initial form states                                                */
/* ------------------------------------------------------------------ */

const initialIntakeForm = {
  itemName: "",
  description: "",
  condition: "good" as const,
  category: "",
  estimatedValue: "",
  source: "donation" as const,
  receivedDate: new Date().toISOString().slice(0, 10),
};

const initialCatalogForm = {
  itemName: "",
  description: "",
  condition: "good" as const,
  category: "",
  price: "",
  status: "available" as const,
};

const initialSaleForm = {
  itemId: "",
  customerName: "",
  salePrice: "",
  paymentMethod: "cash" as const,
  saleDate: new Date().toISOString().slice(0, 10),
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ThriftDashboardContent() {
  const [activeView, setActiveView] = useState<ThriftView>("intake");
  const queryClient = useQueryClient();

  // Dialog states
  const [intakeDialogOpen, setIntakeDialogOpen] = useState(false);
  const [intakeForm, setIntakeForm] = useState(initialIntakeForm);

  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [catalogForm, setCatalogForm] = useState(initialCatalogForm);

  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [saleForm, setSaleForm] = useState(initialSaleForm);

  /* ---- Mutations ------------------------------------------------- */

  const createIntakeMutation = useMutation({
    mutationFn: async (payload: typeof intakeForm) =>
      fetchJson("/api/v2/thrift/intake", {
        method: "POST",
        body: JSON.stringify({
          itemName: payload.itemName,
          description: payload.description || undefined,
          condition: payload.condition,
          category: payload.category || undefined,
          estimatedValue: payload.estimatedValue ? Number(payload.estimatedValue) : undefined,
          source: payload.source,
          receivedDate: payload.receivedDate,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thrift", "intake"] });
      setIntakeForm(initialIntakeForm);
      setIntakeDialogOpen(false);
    },
  });

  const createCatalogMutation = useMutation({
    mutationFn: async (payload: typeof catalogForm) =>
      fetchJson("/api/v2/thrift/catalog", {
        method: "POST",
        body: JSON.stringify({
          itemName: payload.itemName,
          description: payload.description || undefined,
          condition: payload.condition,
          category: payload.category || undefined,
          price: payload.price ? Number(payload.price) : undefined,
          status: payload.status,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thrift", "catalog"] });
      setCatalogForm(initialCatalogForm);
      setCatalogDialogOpen(false);
    },
  });

  const createSaleMutation = useMutation({
    mutationFn: async (payload: typeof saleForm) =>
      fetchJson("/api/v2/thrift/sales", {
        method: "POST",
        body: JSON.stringify({
          itemId: payload.itemId,
          customerName: payload.customerName,
          salePrice: payload.salePrice ? Number(payload.salePrice) : undefined,
          paymentMethod: payload.paymentMethod,
          saleDate: payload.saleDate,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thrift", "sales"] });
      queryClient.invalidateQueries({ queryKey: ["thrift", "catalog"] });
      setSaleForm(initialSaleForm);
      setSaleDialogOpen(false);
    },
  });

  /* ---- Dialog open/close handlers -------------------------------- */

  const handleIntakeDialogOpenChange = (open: boolean) => {
    setIntakeDialogOpen(open);
    if (!open) {
      setIntakeForm(initialIntakeForm);
      createIntakeMutation.reset();
    }
  };

  const handleCatalogDialogOpenChange = (open: boolean) => {
    setCatalogDialogOpen(open);
    if (!open) {
      setCatalogForm(initialCatalogForm);
      createCatalogMutation.reset();
    }
  };

  const handleSaleDialogOpenChange = (open: boolean) => {
    setSaleDialogOpen(open);
    if (!open) {
      setSaleForm(initialSaleForm);
      createSaleMutation.reset();
    }
  };

  /* ---- Form submit handlers -------------------------------------- */

  const handleIntakeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!intakeForm.itemName) return;
    createIntakeMutation.mutate(intakeForm);
  };

  const handleCatalogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogForm.itemName) return;
    createCatalogMutation.mutate(catalogForm);
  };

  const handleSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleForm.itemId || !saleForm.customerName) return;
    createSaleMutation.mutate(saleForm);
  };

  /* ---- Queries --------------------------------------------------- */

  const intakeQuery = useQuery({
    queryKey: ["thrift", "intake"],
    queryFn: () => fetchJson<{ data: IntakeItem[] }>("/api/v2/thrift/intake"),
  });

  const catalogQuery = useQuery({
    queryKey: ["thrift", "catalog"],
    queryFn: () => fetchJson<{ data: CatalogItem[] }>("/api/v2/thrift/catalog"),
  });

  const salesQuery = useQuery({
    queryKey: ["thrift", "sales"],
    queryFn: () => fetchJson<{ data: SaleRecord[] }>("/api/v2/thrift/sales"),
  });

  const intakeItems = useMemo(() => intakeQuery.data?.data ?? [], [intakeQuery.data]);
  const catalogItems = useMemo(() => catalogQuery.data?.data ?? [], [catalogQuery.data]);
  const salesRecords = useMemo(() => salesQuery.data?.data ?? [], [salesQuery.data]);

  /* ---- Columns --------------------------------------------------- */

  const intakeColumns = useMemo<ColumnDef<IntakeItem>[]>(
    () => [
      {
        id: "itemName",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.itemName}</div>
            {row.original.category ? (
              <div className="text-xs text-muted-foreground">{row.original.category}</div>
            ) : null}
          </div>
        ),
      },
      {
        id: "condition",
        header: "Condition",
        cell: ({ row }) => conditionBadge(row.original.condition),
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => sourceBadge(row.original.source),
      },
      {
        id: "estimatedValue",
        header: "Est. Value",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.estimatedValue)}</NumericCell>,
      },
      {
        id: "receivedDate",
        header: "Received",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.receivedDate)}</NumericCell>,
      },
    ],
    [],
  );

  const catalogColumns = useMemo<ColumnDef<CatalogItem>[]>(
    () => [
      {
        id: "itemName",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.itemName}</div>
            {row.original.category ? (
              <div className="text-xs text-muted-foreground">{row.original.category}</div>
            ) : null}
          </div>
        ),
      },
      {
        id: "condition",
        header: "Condition",
        cell: ({ row }) => conditionBadge(row.original.condition),
      },
      {
        id: "price",
        header: "Price",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.price)}</NumericCell>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => catalogStatusBadge(row.original.status),
      },
      {
        id: "createdAt",
        header: "Added",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.createdAt)}</NumericCell>,
      },
    ],
    [],
  );

  const salesColumns = useMemo<ColumnDef<SaleRecord>[]>(
    () => [
      {
        id: "itemName",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.itemName ?? row.original.itemId}</div>
          </div>
        ),
      },
      {
        id: "customerName",
        header: "Customer",
        cell: ({ row }) => row.original.customerName,
      },
      {
        id: "salePrice",
        header: "Sale Price",
        cell: ({ row }) => <NumericCell>{formatMoney(row.original.salePrice)}</NumericCell>,
      },
      {
        id: "paymentMethod",
        header: "Payment",
        cell: ({ row }) => paymentBadge(row.original.paymentMethod),
      },
      {
        id: "saleDate",
        header: "Sale Date",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.saleDate)}</NumericCell>,
      },
    ],
    [],
  );

  /* ---- Render ---------------------------------------------------- */

  const hasError = intakeQuery.error || catalogQuery.error || salesQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load smart shop data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(intakeQuery.error || catalogQuery.error || salesQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "intake", label: "Intake", count: intakeItems.length },
          { id: "catalog", label: "Catalog", count: catalogItems.length },
          { id: "sales", label: "Sales", count: salesRecords.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as ThriftView)}
        railLabel="Smart Shop Views"
      >
        {/* Intake View */}
        <div className={activeView === "intake" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Item Intake</h2>
            <Button size="sm" onClick={() => setIntakeDialogOpen(true)}>Add Item</Button>
          </div>
          <DataTable
            data={intakeItems}
            columns={intakeColumns}
            searchPlaceholder="Search intake items"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={intakeQuery.isLoading ? "Loading intake items..." : "No intake items yet."}
          />
        </div>

        {/* Catalog View */}
        <div className={activeView === "catalog" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Catalog</h2>
            <Button size="sm" onClick={() => setCatalogDialogOpen(true)}>Add to Catalog</Button>
          </div>
          <DataTable
            data={catalogItems}
            columns={catalogColumns}
            searchPlaceholder="Search catalog"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={catalogQuery.isLoading ? "Loading catalog..." : "No catalog items yet."}
          />
        </div>

        {/* Sales View */}
        <div className={activeView === "sales" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Sales</h2>
            <Button size="sm" onClick={() => setSaleDialogOpen(true)}>Record Sale</Button>
          </div>
          <DataTable
            data={salesRecords}
            columns={salesColumns}
            searchPlaceholder="Search sales"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={salesQuery.isLoading ? "Loading sales..." : "No sales recorded yet."}
          />
        </div>
      </VerticalDataViews>

      {/* Add Intake Item Dialog */}
      <Dialog open={intakeDialogOpen} onOpenChange={handleIntakeDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Intake Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleIntakeSubmit} className="space-y-4">
            {createIntakeMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createIntakeMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="intake-itemName">Item Name *</Label>
              <Input
                id="intake-itemName"
                value={intakeForm.itemName}
                onChange={(e) => setIntakeForm((f) => ({ ...f, itemName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-description">Description</Label>
              <Input
                id="intake-description"
                value={intakeForm.description}
                onChange={(e) => setIntakeForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-condition">Condition *</Label>
              <select
                id="intake-condition"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={intakeForm.condition}
                onChange={(e) =>
                  setIntakeForm((f) => ({
                    ...f,
                    condition: e.target.value as typeof f.condition,
                  }))
                }
                required
              >
                <option value="new">New</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-category">Category</Label>
              <Input
                id="intake-category"
                value={intakeForm.category}
                onChange={(e) => setIntakeForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-estimatedValue">Estimated Value</Label>
              <Input
                id="intake-estimatedValue"
                type="number"
                step="0.01"
                value={intakeForm.estimatedValue}
                onChange={(e) => setIntakeForm((f) => ({ ...f, estimatedValue: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-source">Source *</Label>
              <select
                id="intake-source"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={intakeForm.source}
                onChange={(e) =>
                  setIntakeForm((f) => ({
                    ...f,
                    source: e.target.value as typeof f.source,
                  }))
                }
                required
              >
                <option value="donation">Donation</option>
                <option value="purchase">Purchase</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="intake-receivedDate">Received Date *</Label>
              <Input
                id="intake-receivedDate"
                type="date"
                value={intakeForm.receivedDate}
                onChange={(e) => setIntakeForm((f) => ({ ...f, receivedDate: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleIntakeDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createIntakeMutation.isPending}>
                {createIntakeMutation.isPending ? "Creating..." : "Add Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Catalog Item Dialog */}
      <Dialog open={catalogDialogOpen} onOpenChange={handleCatalogDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Catalog Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCatalogSubmit} className="space-y-4">
            {createCatalogMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createCatalogMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="catalog-itemName">Item Name *</Label>
              <Input
                id="catalog-itemName"
                value={catalogForm.itemName}
                onChange={(e) => setCatalogForm((f) => ({ ...f, itemName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-description">Description</Label>
              <Input
                id="catalog-description"
                value={catalogForm.description}
                onChange={(e) => setCatalogForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-condition">Condition *</Label>
              <select
                id="catalog-condition"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={catalogForm.condition}
                onChange={(e) =>
                  setCatalogForm((f) => ({
                    ...f,
                    condition: e.target.value as typeof f.condition,
                  }))
                }
                required
              >
                <option value="new">New</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-category">Category</Label>
              <Input
                id="catalog-category"
                value={catalogForm.category}
                onChange={(e) => setCatalogForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-price">Price</Label>
              <Input
                id="catalog-price"
                type="number"
                step="0.01"
                value={catalogForm.price}
                onChange={(e) => setCatalogForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-status">Status *</Label>
              <select
                id="catalog-status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={catalogForm.status}
                onChange={(e) =>
                  setCatalogForm((f) => ({
                    ...f,
                    status: e.target.value as typeof f.status,
                  }))
                }
                required
              >
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="sold">Sold</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleCatalogDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCatalogMutation.isPending}>
                {createCatalogMutation.isPending ? "Creating..." : "Add to Catalog"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Sale Dialog */}
      <Dialog open={saleDialogOpen} onOpenChange={handleSaleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Sale</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaleSubmit} className="space-y-4">
            {createSaleMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createSaleMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="sale-itemId">Catalog Item *</Label>
              <select
                id="sale-itemId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={saleForm.itemId}
                onChange={(e) => setSaleForm((f) => ({ ...f, itemId: e.target.value }))}
                required
              >
                <option value="">Select an item</option>
                {catalogItems
                  .filter((item) => item.status === "available")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.itemName} — {formatMoney(item.price)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-customerName">Customer Name *</Label>
              <Input
                id="sale-customerName"
                value={saleForm.customerName}
                onChange={(e) => setSaleForm((f) => ({ ...f, customerName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-salePrice">Sale Price *</Label>
              <Input
                id="sale-salePrice"
                type="number"
                step="0.01"
                value={saleForm.salePrice}
                onChange={(e) => setSaleForm((f) => ({ ...f, salePrice: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-paymentMethod">Payment Method *</Label>
              <select
                id="sale-paymentMethod"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={saleForm.paymentMethod}
                onChange={(e) =>
                  setSaleForm((f) => ({
                    ...f,
                    paymentMethod: e.target.value as typeof f.paymentMethod,
                  }))
                }
                required
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-saleDate">Sale Date *</Label>
              <Input
                id="sale-saleDate"
                type="date"
                value={saleForm.saleDate}
                onChange={(e) => setSaleForm((f) => ({ ...f, saleDate: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleSaleDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSaleMutation.isPending}>
                {createSaleMutation.isPending ? "Recording..." : "Record Sale"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
