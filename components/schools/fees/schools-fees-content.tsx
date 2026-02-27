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
          <h2 className="text-section-title">Fee Invoices</h2>
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
          <h2 className="text-section-title">Fee Receipts</h2>
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
    </div>
  );
}
