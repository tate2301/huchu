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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolFeeInvoices,
  fetchSchoolFeeReceipts,
  fetchSchoolFeeStructures,
  fetchSchoolFeeWaivers,
  fetchSchoolsFeesSummary,
  type SchoolFeeInvoiceRecord,
  type SchoolFeeReceiptRecord,
  type SchoolFeeStructureRecord,
  type SchoolFeeWaiverRecord,
} from "@/lib/schools/fees-v2";

type FeesView = "structures" | "invoices" | "receipts" | "waivers";

const initialInvoiceForm = { studentId: "", termId: "", description: "", amount: "" };
const initialReceiptForm = { invoiceId: "", amount: "", method: "", reference: "" };

function money(value: number) {
  return value.toFixed(2);
}

function dateValue(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function invoiceStatusBadge(status: SchoolFeeInvoiceRecord["status"]) {
  if (status === "ISSUED") return <Badge variant="secondary">Issued</Badge>;
  if (status === "PART_PAID") return <Badge variant="secondary">Part Paid</Badge>;
  if (status === "PAID") return <Badge variant="outline">Paid</Badge>;
  if (status === "VOIDED") return <Badge variant="destructive">Voided</Badge>;
  if (status === "WRITEOFF") return <Badge variant="outline">Write-off</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

function receiptStatusBadge(status: SchoolFeeReceiptRecord["status"]) {
  if (status === "POSTED") return <Badge variant="secondary">Posted</Badge>;
  if (status === "VOIDED") return <Badge variant="destructive">Voided</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

function waiverStatusBadge(status: SchoolFeeWaiverRecord["status"]) {
  if (status === "APPLIED") return <Badge variant="secondary">Applied</Badge>;
  if (status === "APPROVED") return <Badge variant="outline">Approved</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
  if (status === "REVERSED") return <Badge variant="outline">Reversed</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

function structureStatusBadge(status: SchoolFeeStructureRecord["status"]) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "ARCHIVED") return <Badge variant="outline">Archived</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export function SchoolsFeesContent() {
  const [activeView, setActiveView] = useState<FeesView>("invoices");
  const queryClient = useQueryClient();

  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(initialInvoiceForm);

  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState(initialReceiptForm);

  const createInvoiceMutation = useMutation({
    mutationFn: async (payload: typeof invoiceForm) =>
      fetchJson("/api/v2/schools/fees/invoices", {
        method: "POST",
        body: JSON.stringify({
          studentId: payload.studentId,
          termId: payload.termId,
          description: payload.description || undefined,
          amount: parseFloat(payload.amount) || 0,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "fees", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["schools", "fees", "summary"] });
      setInvoiceForm(initialInvoiceForm);
      setInvoiceDialogOpen(false);
    },
  });

  const createReceiptMutation = useMutation({
    mutationFn: async (payload: typeof receiptForm) =>
      fetchJson("/api/v2/schools/fees/receipts", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: payload.invoiceId,
          amount: parseFloat(payload.amount) || 0,
          method: payload.method,
          reference: payload.reference || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "fees", "receipts"] });
      queryClient.invalidateQueries({ queryKey: ["schools", "fees", "summary"] });
      setReceiptForm(initialReceiptForm);
      setReceiptDialogOpen(false);
    },
  });

  const handleInvoiceDialogOpenChange = (open: boolean) => {
    setInvoiceDialogOpen(open);
    if (!open) {
      setInvoiceForm(initialInvoiceForm);
      createInvoiceMutation.reset();
    }
  };

  const handleReceiptDialogOpenChange = (open: boolean) => {
    setReceiptDialogOpen(open);
    if (!open) {
      setReceiptForm(initialReceiptForm);
      createReceiptMutation.reset();
    }
  };

  const handleInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.studentId || !invoiceForm.termId || !invoiceForm.amount) return;
    createInvoiceMutation.mutate(invoiceForm);
  };

  const handleReceiptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptForm.invoiceId || !receiptForm.amount || !receiptForm.method) return;
    createReceiptMutation.mutate(receiptForm);
  };

  const summaryQuery = useQuery({
    queryKey: ["schools", "fees", "summary"],
    queryFn: () => fetchSchoolsFeesSummary(),
  });
  const structuresQuery = useQuery({
    queryKey: ["schools", "fees", "structures"],
    queryFn: () => fetchSchoolFeeStructures({ page: 1, limit: 200 }),
  });
  const invoicesQuery = useQuery({
    queryKey: ["schools", "fees", "invoices"],
    queryFn: () => fetchSchoolFeeInvoices({ page: 1, limit: 200 }),
  });
  const receiptsQuery = useQuery({
    queryKey: ["schools", "fees", "receipts"],
    queryFn: () => fetchSchoolFeeReceipts({ page: 1, limit: 200 }),
  });
  const waiversQuery = useQuery({
    queryKey: ["schools", "fees", "waivers"],
    queryFn: () => fetchSchoolFeeWaivers({ page: 1, limit: 200 }),
  });

  const structures = useMemo(() => structuresQuery.data?.data ?? [], [structuresQuery.data]);
  const invoices = useMemo(() => invoicesQuery.data?.data ?? [], [invoicesQuery.data]);
  const receipts = useMemo(() => receiptsQuery.data?.data ?? [], [receiptsQuery.data]);
  const waivers = useMemo(() => waiversQuery.data?.data ?? [], [waiversQuery.data]);

  const structuresColumns = useMemo<ColumnDef<SchoolFeeStructureRecord>[]>(
    () => [
      {
        id: "name",
        header: "Fee Structure",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.class.name} / {row.original.term.name}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => structureStatusBadge(row.original.status),
      },
      {
        id: "lines",
        header: "Lines",
        cell: ({ row }) => <NumericCell>{row.original._count.lines}</NumericCell>,
      },
      {
        id: "amount",
        header: "Total Amount",
        cell: ({ row }) => (
          <NumericCell>{money(row.original.totals?.amount ?? 0)}</NumericCell>
        ),
      },
      {
        id: "mandatoryAmount",
        header: "Mandatory Amount",
        cell: ({ row }) => (
          <NumericCell>{money(row.original.totals?.mandatoryAmount ?? 0)}</NumericCell>
        ),
      },
      {
        id: "currency",
        header: "Currency",
        cell: ({ row }) => <NumericCell align="left">{row.original.currency}</NumericCell>,
      },
    ],
    [],
  );

  const invoiceColumns = useMemo<ColumnDef<SchoolFeeInvoiceRecord>[]>(
    () => [
      {
        id: "invoiceNo",
        header: "Invoice No",
        cell: ({ row }) => <NumericCell align="left">{row.original.invoiceNo}</NumericCell>,
      },
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.firstName} {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
            </div>
          </div>
        ),
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term.name,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => invoiceStatusBadge(row.original.status),
      },
      {
        id: "totalAmount",
        header: "Total",
        cell: ({ row }) => <NumericCell>{money(row.original.totalAmount)}</NumericCell>,
      },
      {
        id: "paidAmount",
        header: "Paid",
        cell: ({ row }) => <NumericCell>{money(row.original.paidAmount)}</NumericCell>,
      },
      {
        id: "balanceAmount",
        header: "Outstanding",
        cell: ({ row }) => <NumericCell>{money(row.original.balanceAmount)}</NumericCell>,
      },
      {
        id: "dueDate",
        header: "Due Date",
        cell: ({ row }) => <NumericCell>{dateValue(row.original.dueDate)}</NumericCell>,
      },
    ],
    [],
  );

  const receiptColumns = useMemo<ColumnDef<SchoolFeeReceiptRecord>[]>(
    () => [
      {
        id: "receiptNo",
        header: "Receipt No",
        cell: ({ row }) => <NumericCell align="left">{row.original.receiptNo}</NumericCell>,
      },
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.firstName} {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
            </div>
          </div>
        ),
      },
      {
        id: "paymentMethod",
        header: "Payment Method",
        cell: ({ row }) => row.original.paymentMethod.replaceAll("_", " "),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => receiptStatusBadge(row.original.status),
      },
      {
        id: "amountReceived",
        header: "Received",
        cell: ({ row }) => <NumericCell>{money(row.original.amountReceived)}</NumericCell>,
      },
      {
        id: "amountAllocated",
        header: "Allocated",
        cell: ({ row }) => <NumericCell>{money(row.original.amountAllocated)}</NumericCell>,
      },
      {
        id: "amountUnallocated",
        header: "Unallocated",
        cell: ({ row }) => <NumericCell>{money(row.original.amountUnallocated)}</NumericCell>,
      },
      {
        id: "receiptDate",
        header: "Receipt Date",
        cell: ({ row }) => <NumericCell>{dateValue(row.original.receiptDate)}</NumericCell>,
      },
    ],
    [],
  );

  const waiverColumns = useMemo<ColumnDef<SchoolFeeWaiverRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.firstName} {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
            </div>
          </div>
        ),
      },
      {
        id: "waiverType",
        header: "Waiver Type",
        cell: ({ row }) => row.original.waiverType,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => waiverStatusBadge(row.original.status),
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => <NumericCell>{money(row.original.amount)}</NumericCell>,
      },
      {
        id: "invoice",
        header: "Invoice",
        cell: ({ row }) =>
          row.original.invoice ? (
            <NumericCell align="left">{row.original.invoice.invoiceNo}</NumericCell>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          ),
      },
      {
        id: "createdAt",
        header: "Created",
        cell: ({ row }) => <NumericCell>{dateValue(row.original.createdAt)}</NumericCell>,
      },
    ],
    [],
  );

  const summary = summaryQuery.data?.summary;
  const primaryError =
    summaryQuery.error ||
    structuresQuery.error ||
    invoicesQuery.error ||
    receiptsQuery.error ||
    waiversQuery.error;
  const isLoading =
    summaryQuery.isLoading ||
    structuresQuery.isLoading ||
    invoicesQuery.isLoading ||
    receiptsQuery.isLoading ||
    waiversQuery.isLoading;

  return (
    <div className="space-y-4">
      {primaryError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load schools fees data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(primaryError)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-4">
        <div>
          <h2 className="text-sm font-semibold">Outstanding Balance</h2>
          <p className="font-mono tabular-nums">
            {money(summary?.outstandingBalance ?? 0)}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Issued Invoices</h2>
          <p className="font-mono tabular-nums">{summary?.issuedInvoices ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Posted Receipts</h2>
          <p className="font-mono tabular-nums">{summary?.receiptsPosted ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Applied Waivers</h2>
          <p className="font-mono tabular-nums">{money(summary?.waivedAmount ?? 0)}</p>
        </div>
      </section>

      <VerticalDataViews
        items={[
          { id: "invoices", label: "Invoices", count: invoices.length },
          { id: "receipts", label: "Receipts", count: receipts.length },
          { id: "waivers", label: "Waivers", count: waivers.length },
          { id: "structures", label: "Fee Structures", count: structures.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as FeesView)}
        railLabel="Fee Views"
      >
        <div className={activeView === "invoices" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Fee Invoices</h2>
            <Button size="sm" onClick={() => setInvoiceDialogOpen(true)}>
              Create Invoice
            </Button>
          </div>
          <DataTable
            data={invoices}
            columns={invoiceColumns}
            searchPlaceholder="Search invoices"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading fee invoices..." : "No fee invoices found."}
          />
        </div>

        <div className={activeView === "receipts" ? "space-y-2" : "hidden"}>
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">Fee Receipts</h2>
            <Button size="sm" onClick={() => setReceiptDialogOpen(true)}>
              Record Receipt
            </Button>
          </div>
          <DataTable
            data={receipts}
            columns={receiptColumns}
            searchPlaceholder="Search receipts"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading fee receipts..." : "No fee receipts found."}
          />
        </div>

        <div className={activeView === "waivers" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Fee Waivers</h2>
          <DataTable
            data={waivers}
            columns={waiverColumns}
            searchPlaceholder="Search waivers"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading fee waivers..." : "No fee waivers found."}
          />
        </div>

        <div className={activeView === "structures" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Fee Structures</h2>
          <DataTable
            data={structures}
            columns={structuresColumns}
            searchPlaceholder="Search fee structures"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading fee structures..." : "No fee structures found."}
          />
        </div>
      </VerticalDataViews>

      {/* Create Invoice Dialog */}
      <Dialog open={invoiceDialogOpen} onOpenChange={handleInvoiceDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>Enter the invoice details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvoiceSubmit} className="space-y-4">
            {createInvoiceMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createInvoiceMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="invoice-studentId" className="text-sm font-medium">
                Student ID <span className="text-destructive">*</span>
              </label>
              <Input
                id="invoice-studentId"
                value={invoiceForm.studentId}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, studentId: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="invoice-termId" className="text-sm font-medium">
                Term ID <span className="text-destructive">*</span>
              </label>
              <Input
                id="invoice-termId"
                value={invoiceForm.termId}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, termId: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="invoice-description" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="invoice-description"
                value={invoiceForm.description}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="invoice-amount" className="text-sm font-medium">
                Amount <span className="text-destructive">*</span>
              </label>
              <Input
                id="invoice-amount"
                type="number"
                step="0.01"
                value={invoiceForm.amount}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleInvoiceDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createInvoiceMutation.isPending}>
                {createInvoiceMutation.isPending ? "Saving…" : "Create Invoice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Receipt Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={handleReceiptDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Receipt</DialogTitle>
            <DialogDescription>Enter the receipt details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReceiptSubmit} className="space-y-4">
            {createReceiptMutation.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getApiErrorMessage(createReceiptMutation.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="receipt-invoiceId" className="text-sm font-medium">
                Invoice ID <span className="text-destructive">*</span>
              </label>
              <Input
                id="receipt-invoiceId"
                value={receiptForm.invoiceId}
                onChange={(e) => setReceiptForm((f) => ({ ...f, invoiceId: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="receipt-amount" className="text-sm font-medium">
                Amount <span className="text-destructive">*</span>
              </label>
              <Input
                id="receipt-amount"
                type="number"
                step="0.01"
                value={receiptForm.amount}
                onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="receipt-method" className="text-sm font-medium">
                Payment Method <span className="text-destructive">*</span>
              </label>
              <select
                id="receipt-method"
                value={receiptForm.method}
                onChange={(e) => setReceiptForm((f) => ({ ...f, method: e.target.value }))}
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select method</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="receipt-reference" className="text-sm font-medium">
                Reference
              </label>
              <Input
                id="receipt-reference"
                value={receiptForm.reference}
                onChange={(e) => setReceiptForm((f) => ({ ...f, reference: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleReceiptDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createReceiptMutation.isPending}>
                {createReceiptMutation.isPending ? "Saving…" : "Record Receipt"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
