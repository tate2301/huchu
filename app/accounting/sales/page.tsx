"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
import { AccountingLineItemsListView } from "@/components/accounting/listview/accounting-line-items-list-view";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { useToast } from "@/components/ui/use-toast";
import {
  type AgingRow,
  type BankAccountRecord,
  type CreditNoteRecord,
  type CustomerRecord,
  type SalesInvoiceRecord,
  type SalesReceiptRecord,
  type SalesWriteOffRecord,
  type StatementLineRecord,
  fetchArAging,
  fetchBankAccounts,
  fetchCreditNotes,
  fetchCustomerStatement,
  fetchCustomers,
  fetchSalesInvoices,
  fetchSalesReceipts,
  fetchSalesWriteOffs,
  fetchTaxCodes,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Download, Plus, Trash2, XCircle } from "@/lib/icons";

const today = format(new Date(), "yyyy-MM-dd");

type InvoiceLineForm = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
  taxRate: string;
};

export default function AccountingSalesPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const isSuperAdmin = sessionRole === "SUPERADMIN";
  const [activeView, setActiveView] = useState<
    "customers" | "invoices" | "receipts" | "credit-notes" | "write-offs" | "aging" | "statements"
  >("customers");
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [receiptFormOpen, setReceiptFormOpen] = useState(false);
  const [creditNoteFormOpen, setCreditNoteFormOpen] = useState(false);
  const [writeOffFormOpen, setWriteOffFormOpen] = useState(false);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [agingAsOf, setAgingAsOf] = useState(today);
  const [statementCustomerId, setStatementCustomerId] = useState("");
  const [statementStartDate, setStatementStartDate] = useState("");
  const [statementEndDate, setStatementEndDate] = useState("");

  const [customerForm, setCustomerForm] = useState({
    name: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    taxNumber: "",
    vatNumber: "",
    isActive: true,
  });

  const [invoiceForm, setInvoiceForm] = useState({
    customerId: "",
    invoiceDate: today,
    dueDate: "",
    currency: "USD",
    notes: "",
    issueNow: "DRAFT",
  });

  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineForm[]>([
    { description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" },
  ]);

  const [receiptForm, setReceiptForm] = useState({
    invoiceId: "",
    receivedAt: today,
    amount: "",
    method: "Cash",
    reference: "",
    bankAccountId: "",
  });
  const [creditNoteForm, setCreditNoteForm] = useState({
    invoiceId: "",
    noteDate: today,
    currency: "USD",
    reason: "",
    issueNow: "ISSUED",
  });
  const [creditNoteLines, setCreditNoteLines] = useState<InvoiceLineForm[]>([
    { description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" },
  ]);
  const [writeOffForm, setWriteOffForm] = useState({
    invoiceId: "",
    amount: "",
    reason: "",
  });

  useEffect(() => {
    const view = searchParams.get("view");
    if (!view) return;
    const allowed = new Set([
      "customers",
      "invoices",
      "receipts",
      "credit-notes",
      "write-offs",
      "aging",
      "statements",
    ]);
    if (allowed.has(view)) {
      const nextView = view as
        | "customers"
        | "invoices"
        | "receipts"
        | "credit-notes"
        | "write-offs"
        | "aging"
        | "statements";
      const frameId = window.requestAnimationFrame(() => {
        setActiveView(nextView);
      });
      return () => window.cancelAnimationFrame(frameId);
    }
  }, [searchParams]);

  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) return;

    const frameId = window.requestAnimationFrame(() => {
      if (action === "new-customer") {
        setActiveView("customers");
        setCustomerFormOpen(true);
      } else if (action === "new-invoice") {
        setActiveView("invoices");
        setInvoiceFormOpen(true);
      } else if (action === "new-receipt") {
        setActiveView("receipts");
        setReceiptFormOpen(true);
      } else if (action === "new-credit-note") {
        setActiveView("credit-notes");
        setCreditNoteFormOpen(true);
      } else if (action === "new-write-off") {
        setActiveView("write-offs");
        setWriteOffFormOpen(true);
      }
    });

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("action");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });

    return () => window.cancelAnimationFrame(frameId);
  }, [pathname, router, searchParams]);
  const { data: customersData, error: customersError } = useQuery({
    queryKey: ["accounting", "sales", "customers"],
    queryFn: () => fetchCustomers({ limit: 200 }),
  });

  const { data: invoicesData, error: invoicesError } = useQuery({
    queryKey: ["accounting", "sales", "invoices"],
    queryFn: () => fetchSalesInvoices({ limit: 200 }),
  });

  const { data: receiptsData, error: receiptsError } = useQuery({
    queryKey: ["accounting", "sales", "receipts"],
    queryFn: () => fetchSalesReceipts({ limit: 200 }),
  });

  const { data: creditNotesData, error: creditNotesError } = useQuery({
    queryKey: ["accounting", "sales", "credit-notes"],
    queryFn: () => fetchCreditNotes({ limit: 200 }),
  });

  const { data: writeOffsData, error: writeOffsError } = useQuery({
    queryKey: ["accounting", "sales", "write-offs"],
    queryFn: () => fetchSalesWriteOffs({ limit: 200 }),
  });

  const { data: agingReport, isLoading: agingLoading, error: agingError } = useQuery({
    queryKey: ["accounting", "sales", "aging", agingAsOf],
    queryFn: () => fetchArAging({ asOf: agingAsOf || undefined }),
  });

  const {
    data: statementReport,
    isLoading: statementLoading,
    error: statementError,
  } = useQuery({
    queryKey: ["accounting", "sales", "statement", statementCustomerId, statementStartDate, statementEndDate],
    queryFn: () =>
      fetchCustomerStatement({
        customerId: statementCustomerId,
        startDate: statementStartDate || undefined,
        endDate: statementEndDate || undefined,
      }),
    enabled: Boolean(statementCustomerId),
  });

  const { data: taxCodes } = useQuery({
    queryKey: ["accounting", "tax"],
    queryFn: fetchTaxCodes,
  });

  const { data: bankAccountsData } = useQuery({
    queryKey: ["accounting", "banking", "accounts"],
    queryFn: () => fetchBankAccounts({ limit: 200, active: true }),
  });

  const customers = customersData?.data ?? [];
  const invoices = useMemo(() => invoicesData?.data ?? [], [invoicesData]);
  const receipts = receiptsData?.data ?? [];
  const creditNotes = creditNotesData?.data ?? [];
  const writeOffs = writeOffsData?.data ?? [];
  const agingRows = agingReport?.rows ?? [];
  const statementLines = statementReport?.lines ?? [];
  const bankAccounts = bankAccountsData?.data ?? [];
  const taxOptions = taxCodes ?? [];

  const filteredInvoices = useMemo(() => {
    if (invoiceStatusFilter === "all") return invoices;
    return invoices.filter((invoice) => invoice.status === invoiceStatusFilter);
  }, [invoiceStatusFilter, invoices]);
  const customerColumns = useMemo<ColumnDef<CustomerRecord>[]>(
    () => [
      {
        id: "name",
        header: "Customer",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.contactName || "No contact"}
            </div>
          </div>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{row.original.phone || "-"}</div>
            <div className="text-xs text-muted-foreground">{row.original.email || ""}</div>
          </div>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [],
  );

  const invoiceColumns: ColumnDef<SalesInvoiceRecord>[] = [
    {
      id: "number",
      header: "Invoice",
      cell: ({ row }) => (
        <div>
          <div className="font-mono">{row.original.invoiceNumber}</div>
          <div className="text-xs text-muted-foreground">{row.original.customer?.name}</div>
        </div>
      ),
      size: 112,
      minSize: 112,
      maxSize: 112},
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => (
        <NumericCell align="left">
          {format(new Date(row.original.invoiceDate), "yyyy-MM-dd")}
        </NumericCell>
      ),
      size: 128,
      minSize: 128,
      maxSize: 128},
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "ISSUED" ? "secondary" : "outline"}>
          {row.original.status}
        </Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "total",
      header: "Total",
      cell: ({ row }) => (
        <NumericCell>{row.original.total.toFixed(2)} {row.original.currency}</NumericCell>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "balance",
      header: "Balance",
      cell: ({ row }) => {
        const balance =
          row.original.balance ??
          row.original.total -
            (row.original.amountPaid ?? 0) -
            (row.original.creditTotal ?? 0) -
            (row.original.writeOffTotal ?? 0);
        return <NumericCell>{balance.toFixed(2)} {row.original.currency}</NumericCell>;
      },
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "fiscal",
      header: "Fiscal",
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.fiscalStatus ?? "-"}</Badge>
      ),
      size: 280,
      minSize: 220,
      maxSize: 420},
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const printUrl = `/api/accounting/sales/invoices/${row.original.id}/pdf`;
              const nextWindow = window.open(printUrl, "_blank", "noopener,noreferrer");
              if (!nextWindow) {
                window.location.assign(printUrl);
              }
            }}
          >
            <Download className="mr-1 size-4" />
            PDF
          </Button>
          {row.original.status === "DRAFT" ? (
            <Button size="sm" onClick={() => issueMutation.mutate(row.original.id)}>
              Issue Invoice
            </Button>
          ) : null}
          {isSuperAdmin && row.original.status !== "VOIDED" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const confirmed = window.confirm(
                  `Cancel invoice ${row.original.invoiceNumber}? This marks it as VOIDED and reverses posted accounting entries.`,
                );
                if (!confirmed) return;
                cancelInvoiceMutation.mutate(row.original.id);
              }}
              disabled={cancelInvoiceMutation.isPending}
            >
              <XCircle className="mr-1 size-4" />
              Cancel
            </Button>
          ) : null}
        </div>
      ),
      size: 300,
      minSize: 220,
      maxSize: 420},
  ];

  const receiptColumns = useMemo<ColumnDef<SalesReceiptRecord>[]>(
    () => [
      {
        id: "receipt",
        header: "Receipt",
        cell: ({ row }) => (
          <div>
            <div className="font-mono">{row.original.receiptNumber}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.invoice?.invoiceNumber ?? "Unlinked"}
            </div>
          </div>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "date",
        header: "Received",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.receivedAt), "yyyy-MM-dd")}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => <NumericCell>{row.original.amount.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "method",
        header: "Method",
        accessorKey: "method",
        size: 160,
        minSize: 160,
        maxSize: 160},
    ],
    [],
  );

  const creditNoteColumns = useMemo<ColumnDef<CreditNoteRecord>[]>(
    () => [
      {
        id: "note",
        header: "Credit Note",
        cell: ({ row }) => (
          <div>
            <div className="font-mono">{row.original.noteNumber}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.invoice?.invoiceNumber ?? "Invoice"}
            </div>
          </div>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.noteDate), "yyyy-MM-dd")}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "ISSUED" ? "secondary" : "outline"}>
            {row.original.status}
          </Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.total.toFixed(2)} {row.original.currency}
          </NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [],
  );

  const writeOffColumns: ColumnDef<SalesWriteOffRecord>[] = [
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => (
        <NumericCell align="left">
          {format(new Date(row.original.createdAt), "yyyy-MM-dd")}
        </NumericCell>
      ),
      size: 128,
      minSize: 128,
      maxSize: 128},
    {
      id: "invoice",
      header: "Invoice",
      cell: ({ row }) => (
        <div>
          <div className="font-mono">{row.original.invoice?.invoiceNumber ?? "-"}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.invoice?.customer?.name ?? ""}
          </div>
        </div>
      ),
      size: 280,
      minSize: 220,
      maxSize: 420},
    {
      id: "amount",
      header: "Amount",
      cell: ({ row }) => <NumericCell>{row.original.amount.toFixed(2)}</NumericCell>,
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "POSTED" ? "secondary" : "outline"}>
          {row.original.status}
        </Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120},
  ];

  if (isSuperAdmin) {
    writeOffColumns.push({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              const confirmed = window.confirm(
                `Delete write-off record for invoice ${row.original.invoice?.invoiceNumber ?? "-"}? This also removes linked journal and ledger postings.`,
              );
              if (!confirmed) return;
              deleteWriteOffMutation.mutate(row.original.id);
            }}
            disabled={deleteWriteOffMutation.isPending}
          >
            <Trash2 className="mr-1 size-4" />
            Delete
          </Button>
        </div>
      ),
      size: 140,
      minSize: 140,
      maxSize: 160,
    });
  }

  const agingColumns = useMemo<ColumnDef<AgingRow>[]>(
    () => [
      {
        id: "name",
        header: "Customer",
        accessorKey: "name",
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "current",
        header: "Current",
        cell: ({ row }) => <NumericCell>{row.original.current.toFixed(2)}</NumericCell>,
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "days30",
        header: "1-30",
        cell: ({ row }) => <NumericCell>{row.original.days30.toFixed(2)}</NumericCell>,
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "days60",
        header: "31-60",
        cell: ({ row }) => <NumericCell>{row.original.days60.toFixed(2)}</NumericCell>,
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "days90",
        header: "61-90",
        cell: ({ row }) => <NumericCell>{row.original.days90.toFixed(2)}</NumericCell>,
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "days90Plus",
        header: "90+",
        cell: ({ row }) => <NumericCell>{row.original.days90Plus.toFixed(2)}</NumericCell>,
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => <NumericCell>{row.original.total.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [],
  );

  const statementColumns = useMemo<ColumnDef<StatementLineRecord>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">{format(new Date(row.original.date), "yyyy-MM-dd")}</NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "type",
        header: "Type",
        accessorKey: "type",
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "reference",
        header: "Reference",
        accessorKey: "reference",
        cell: ({ row }) => <span className="font-mono">{row.original.reference}</span>,
        size: 112,
        minSize: 112,
        maxSize: 112},
      {
        id: "debit",
        header: "Debit",
        cell: ({ row }) => <NumericCell>{row.original.debit.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "credit",
        header: "Credit",
        cell: ({ row }) => <NumericCell>{row.original.credit.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "balance",
        header: "Balance",
        cell: ({ row }) => <NumericCell>{row.original.balance.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [],
  );
  const createCustomerMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/sales/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Customer created",
        description: "Customer saved successfully.",
        variant: "success",
      });
      setCustomerFormOpen(false);
      setCustomerForm({
        name: "",
        contactName: "",
        phone: "",
        email: "",
        address: "",
        taxNumber: "",
        vatNumber: "",
        isActive: true,
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "customers"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create customer",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/sales/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Invoice created",
        description: "Sales invoice saved successfully.",
        variant: "success",
      });
      setInvoiceFormOpen(false);
      setInvoiceForm({
        customerId: "",
        invoiceDate: today,
        dueDate: "",
        currency: "USD",
        notes: "",
        issueNow: "DRAFT",
      });
      setInvoiceLines([{ description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" }]);
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "invoices"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create invoice",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const issueMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/accounting/sales/invoices/${id}` as const, {
        method: "PATCH",
        body: JSON.stringify({ status: "ISSUED" }),
      }),
    onSuccess: () => {
      toast({
        title: "Invoice issued",
        description: "The invoice has been issued and posted.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "invoices"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to issue invoice",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const cancelInvoiceMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/accounting/sales/invoices/${id}` as const, {
        method: "PATCH",
        body: JSON.stringify({ status: "VOIDED" }),
      }),
    onSuccess: () => {
      toast({
        title: "Invoice cancelled",
        description: "The invoice has been marked as VOIDED.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "invoices"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to cancel invoice",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createReceiptMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/sales/receipts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Receipt created",
        description: "Receipt saved successfully.",
        variant: "success",
      });
      setReceiptFormOpen(false);
      setReceiptForm({
        invoiceId: "",
        receivedAt: today,
        amount: "",
        method: "Cash",
        reference: "",
        bankAccountId: "",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "receipts"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "invoices"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create receipt",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createCreditNoteMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/sales/credit-notes", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Credit note created",
        description: "Credit note saved successfully.",
        variant: "success",
      });
      setCreditNoteFormOpen(false);
      setCreditNoteForm({
        invoiceId: "",
        noteDate: today,
        currency: "USD",
        reason: "",
        issueNow: "ISSUED",
      });
      setCreditNoteLines([{ description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" }]);
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "credit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "invoices"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create credit note",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createWriteOffMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/sales/write-offs", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Write-off recorded",
        description: "Sales write-off saved successfully.",
        variant: "success",
      });
      setWriteOffFormOpen(false);
      setWriteOffForm({ invoiceId: "", amount: "", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "write-offs"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "invoices"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to record write-off",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteWriteOffMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/accounting/sales/write-offs/${id}` as const, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast({
        title: "Write-off deleted",
        description: "Bad debt write-off record and linked postings were deleted.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "write-offs"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "sales", "invoices"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to delete write-off",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const invoiceTotals = useMemo(() => {
    const subtotal = invoiceLines.reduce(
      (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
      0,
    );
    const taxTotal = invoiceLines.reduce((sum, line) => {
      const rate = Number(line.taxRate) || 0;
      return sum + ((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * rate) / 100;
    }, 0);
    return { subtotal, taxTotal, total: subtotal + taxTotal };
  }, [invoiceLines]);

  const updateInvoiceLine = (index: number, field: keyof InvoiceLineForm, value: string) => {
    setInvoiceLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)),
    );
  };

  const addInvoiceLine = () => {
    setInvoiceLines((prev) => [
      ...prev,
      { description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" },
    ]);
  };

  const removeInvoiceLine = (index: number) => {
    if (invoiceLines.length <= 1) return;
    setInvoiceLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const creditNoteTotals = useMemo(() => {
    const subtotal = creditNoteLines.reduce(
      (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
      0,
    );
    const taxTotal = creditNoteLines.reduce((sum, line) => {
      const rate = Number(line.taxRate) || 0;
      return sum + ((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * rate) / 100;
    }, 0);
    return { subtotal, taxTotal, total: subtotal + taxTotal };
  }, [creditNoteLines]);

  const updateCreditNoteLine = (index: number, field: keyof InvoiceLineForm, value: string) => {
    setCreditNoteLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)),
    );
  };

  const addCreditNoteLine = () => {
    setCreditNoteLines((prev) => [
      ...prev,
      { description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" },
    ]);
  };

  const removeCreditNoteLine = (index: number) => {
    if (creditNoteLines.length <= 1) return;
    setCreditNoteLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const submitCustomer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!customerForm.name.trim()) {
      toast({
        title: "Missing name",
        description: "Customer name is required.",
        variant: "destructive",
      });
      return;
    }

    createCustomerMutation.mutate({
      name: customerForm.name.trim(),
      contactName: customerForm.contactName.trim() || undefined,
      phone: customerForm.phone.trim() || undefined,
      email: customerForm.email.trim() || undefined,
      address: customerForm.address.trim() || undefined,
      taxNumber: customerForm.taxNumber.trim() || undefined,
      vatNumber: customerForm.vatNumber.trim() || undefined,
      isActive: customerForm.isActive,
    });
  };

  const submitInvoice = (event: React.FormEvent) => {
    event.preventDefault();

    if (!invoiceForm.customerId) {
      toast({
        title: "Missing customer",
        description: "Select a customer before saving.",
        variant: "destructive",
      });
      return;
    }

    const preparedLines = invoiceLines
      .map((line) => ({
        description: line.description.trim(),
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(line.unitPrice) || 0,
        taxCodeId: line.taxCodeId || undefined,
        taxRate: line.taxRate ? Number(line.taxRate) : undefined,
      }))
      .filter((line) => line.description && line.quantity > 0);

    if (preparedLines.length === 0) {
      toast({
        title: "Missing line items",
        description: "Add at least one valid line item.",
        variant: "destructive",
      });
      return;
    }

    createInvoiceMutation.mutate({
      customerId: invoiceForm.customerId,
      invoiceDate: invoiceForm.invoiceDate,
      dueDate: invoiceForm.dueDate || undefined,
      currency: invoiceForm.currency || "USD",
      notes: invoiceForm.notes.trim() || undefined,
      issueNow: invoiceForm.issueNow === "ISSUED",
      lines: preparedLines,
    });
  };

  const submitReceipt = (event: React.FormEvent) => {
    event.preventDefault();

    if (!receiptForm.receivedAt || !receiptForm.amount) {
      toast({
        title: "Missing details",
        description: "Please provide received date and amount.",
        variant: "destructive",
      });
      return;
    }

    createReceiptMutation.mutate({
      invoiceId: receiptForm.invoiceId || undefined,
      receivedAt: receiptForm.receivedAt,
      amount: Number(receiptForm.amount),
      method: receiptForm.method,
      reference: receiptForm.reference.trim() || undefined,
      bankAccountId: receiptForm.bankAccountId || undefined,
    });
  };

  const submitCreditNote = (event: React.FormEvent) => {
    event.preventDefault();

    if (!creditNoteForm.invoiceId) {
      toast({
        title: "Missing invoice",
        description: "Select an invoice before saving the credit note.",
        variant: "destructive",
      });
      return;
    }

    const preparedLines = creditNoteLines
      .map((line) => ({
        description: line.description.trim(),
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(line.unitPrice) || 0,
        taxCodeId: line.taxCodeId || undefined,
        taxRate: line.taxRate ? Number(line.taxRate) : undefined,
      }))
      .filter((line) => line.description && line.quantity > 0);

    if (preparedLines.length === 0) {
      toast({
        title: "Missing line items",
        description: "Add at least one valid line item.",
        variant: "destructive",
      });
      return;
    }

    createCreditNoteMutation.mutate({
      invoiceId: creditNoteForm.invoiceId,
      noteDate: creditNoteForm.noteDate,
      currency: creditNoteForm.currency || "USD",
      reason: creditNoteForm.reason.trim() || undefined,
      issueNow: creditNoteForm.issueNow === "ISSUED",
      lines: preparedLines,
    });
  };

  const submitWriteOff = (event: React.FormEvent) => {
    event.preventDefault();

    if (!writeOffForm.invoiceId || !writeOffForm.amount) {
      toast({
        title: "Missing details",
        description: "Select an invoice and enter an amount.",
        variant: "destructive",
      });
      return;
    }

    createWriteOffMutation.mutate({
      invoiceId: writeOffForm.invoiceId,
      amount: Number(writeOffForm.amount),
      reason: writeOffForm.reason.trim() || undefined,
    });
  };
  return (
    <AccountingShell
      activeTab="sales"
      title="Sales (Accounts Receivable)"
      description="Manage customers, issue invoices, and record receipts."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setCustomerFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Customer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setInvoiceFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Invoice
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReceiptFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Receipt
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCreditNoteFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Credit Note
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWriteOffFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            Write Off
          </Button>
        </div>
      }
    >
      {(customersError || invoicesError || receiptsError || creditNotesError || writeOffsError || agingError || statementError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load sales data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              customersError ||
                invoicesError ||
                receiptsError ||
                creditNotesError ||
                writeOffsError ||
                agingError ||
                statementError,
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "customers", label: "Customers", count: customers.length },
          { id: "invoices", label: "Invoices", count: invoices.length },
          { id: "receipts", label: "Receipts", count: receipts.length },
          { id: "credit-notes", label: "Credit Notes", count: creditNotes.length },
          { id: "write-offs", label: "Write-offs", count: writeOffs.length },
          { id: "aging", label: "AR Aging", count: agingRows.length },
          { id: "statements", label: "Statements", count: statementLines.length },
        ]}
        value={activeView}
        onValueChange={(value) =>
          setActiveView(
            value as
              | "customers"
              | "invoices"
              | "receipts"
              | "credit-notes"
              | "write-offs"
              | "aging"
              | "statements",
          )
        }
        railLabel="Sales Views"
      >
        <div className={activeView === "customers" ? "space-y-3" : "hidden"}>
          <DataTable
            data={customers}
            columns={customerColumns}
            groupBy={(row) => (row.isActive ? "Active" : "Inactive")}
            searchPlaceholder="Search customers"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No customers found."}
          />
        </div>

        <div className={activeView === "invoices" ? "space-y-3" : "hidden"}>
          <DataTable
            data={filteredInvoices}
            columns={invoiceColumns}
            groupBy="status"
            searchPlaceholder="Search invoices"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <Select value={invoiceStatusFilter} onValueChange={setInvoiceStatusFilter}>
                <SelectTrigger size="sm" className="h-8 w-[180px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ISSUED">Issued</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="VOIDED">Voided</SelectItem>
                </SelectContent>
              </Select>
            }
            emptyState={"No invoices found."}
          />
        </div>

        <div className={activeView === "receipts" ? "space-y-3" : "hidden"}>
          <DataTable
            data={receipts}
            columns={receiptColumns}
            groupBy="method"
            searchPlaceholder="Search receipts"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No receipts found."}
          />
        </div>

        <div className={activeView === "credit-notes" ? "space-y-3" : "hidden"}>
          <DataTable
            data={creditNotes}
            columns={creditNoteColumns}
            groupBy="status"
            searchPlaceholder="Search credit notes"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No credit notes found."}
          />
        </div>

        <div className={activeView === "write-offs" ? "space-y-3" : "hidden"}>
          <DataTable
            data={writeOffs}
            columns={writeOffColumns}
            groupBy="status"
            searchPlaceholder="Search write-offs"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No write-offs found."}
          />
        </div>

        <div className={activeView === "aging" ? "space-y-3" : "hidden"}>
          <DataTable
            data={agingRows}
            columns={agingColumns}
            groupBy={(row) => {
              const buckets = [
                { label: "Current", value: row.current },
                { label: "1-30", value: row.days30 },
                { label: "31-60", value: row.days60 },
                { label: "61-90", value: row.days90 },
                { label: "90+", value: row.days90Plus },
              ];
              return buckets.sort((a, b) => b.value - a.value)[0].label;
            }}
            searchPlaceholder="Search customers"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <Input
                type="date"
                value={agingAsOf}
                onChange={(event) => setAgingAsOf(event.target.value)}
                className="h-8"
              />
            }
            emptyState={agingLoading ? "Loading aging..." : "No aging data found."}
          />
        </div>

        <div className={activeView === "statements" ? "space-y-3" : "hidden"}>
          <div className="grid gap-4 md:grid-cols-2">
            <FrappeStatCard
              label="Opening Balance"
              value={statementReport?.openingBalance ?? 0}
              valueLabel={(statementReport?.openingBalance ?? 0).toFixed(2)}
            />
            <FrappeStatCard
              label="Closing Balance"
              value={statementReport?.closingBalance ?? 0}
              valueLabel={(statementReport?.closingBalance ?? 0).toFixed(2)}
            />
          </div>
          <DataTable
            data={statementLines}
            columns={statementColumns}
            groupBy="type"
            searchPlaceholder="Search statement lines"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={statementCustomerId}
                  onValueChange={(value) => setStatementCustomerId(value)}
                >
                  <SelectTrigger size="sm" className="h-8 w-[240px]">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer: CustomerRecord) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={statementStartDate}
                  onChange={(event) => setStatementStartDate(event.target.value)}
                  className="h-8"
                />
                <Input
                  type="date"
                  value={statementEndDate}
                  onChange={(event) => setStatementEndDate(event.target.value)}
                  className="h-8"
                />
              </div>
            }
            emptyState={
              statementCustomerId
                ? statementLoading
                  ? "Loading statement..."
                  : "No statement lines found."
                : "Select a customer to view statements."
            }
          />
        </div>
      </VerticalDataViews>
      <Sheet open={customerFormOpen} onOpenChange={setCustomerFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Customer</SheetTitle>
            <SheetDescription>Capture customer details for invoicing.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitCustomer} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Customer Name *</label>
              <Input
                value={customerForm.name}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Acme Distribution"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Contact Name</label>
                <Input
                  value={customerForm.contactName}
                  onChange={(event) =>
                    setCustomerForm((prev) => ({ ...prev, contactName: event.target.value }))
                  }
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Phone</label>
                <Input
                  value={customerForm.phone}
                  onChange={(event) =>
                    setCustomerForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  placeholder="+263"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Email</label>
              <Input
                value={customerForm.email}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="billing@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Address</label>
              <Input
                value={customerForm.address}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, address: event.target.value }))
                }
                placeholder="Harare, Zimbabwe"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Tax Number</label>
                <Input
                  value={customerForm.taxNumber}
                  onChange={(event) =>
                    setCustomerForm((prev) => ({ ...prev, taxNumber: event.target.value }))
                  }
                  placeholder="TIN"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">VAT Number</label>
                <Input
                  value={customerForm.vatNumber}
                  onChange={(event) =>
                    setCustomerForm((prev) => ({ ...prev, vatNumber: event.target.value }))
                  }
                  placeholder="VAT"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createCustomerMutation.isPending}>
                Save Customer
              </Button>
              <Button type="button" variant="outline" onClick={() => setCustomerFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={invoiceFormOpen} onOpenChange={setInvoiceFormOpen}>
        <SheetContent size="full" className="w-full p-6 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Sales Invoice</SheetTitle>
            <SheetDescription>Create a customer invoice and optionally issue it now.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitInvoice} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="block text-sm font-semibold mb-2">Customer *</label>
                <Select
                  value={invoiceForm.customerId}
                  onValueChange={(value) =>
                    setInvoiceForm((prev) => ({ ...prev, customerId: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Invoice Date *</label>
                <Input
                  type="date"
                  value={invoiceForm.invoiceDate}
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({ ...prev, invoiceDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Due Date</label>
                <Input
                  type="date"
                  value={invoiceForm.dueDate}
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold mb-2">Currency</label>
                <Input
                  value={invoiceForm.currency}
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                  placeholder="USD"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Issue Status</label>
                <Select
                  value={invoiceForm.issueNow}
                  onValueChange={(value) =>
                    setInvoiceForm((prev) => ({ ...prev, issueNow: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ISSUED">Issue Now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Notes</label>
              <Input
                value={invoiceForm.notes}
                onChange={(event) =>
                  setInvoiceForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Optional invoice notes"
              />
            </div>

            <AccountingLineItemsListView
              title="Invoice Lines"
              lines={invoiceLines}
              taxOptions={taxOptions}
              onAddLine={addInvoiceLine}
              onRemoveLine={removeInvoiceLine}
              onChangeLine={updateInvoiceLine}
              canRemoveLine={() => invoiceLines.length > 1}
              footer={
                <div className="flex justify-end gap-6 text-sm">
                  <span className="text-muted-foreground">
                    Subtotal: <span className="font-mono">{invoiceTotals.subtotal.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Tax: <span className="font-mono">{invoiceTotals.taxTotal.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Total: <span className="font-mono">{invoiceTotals.total.toFixed(2)}</span>
                  </span>
                </div>
              }
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createInvoiceMutation.isPending}>
                Save Invoice
              </Button>
              <Button type="button" variant="outline" onClick={() => setInvoiceFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={receiptFormOpen} onOpenChange={setReceiptFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Receipt</SheetTitle>
            <SheetDescription>Record customer payments against issued invoices.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitReceipt} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Invoice (optional)</label>
              <Select
                value={receiptForm.invoiceId}
                onValueChange={(value) => setReceiptForm((prev) => ({ ...prev, invoiceId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unlinked receipt</SelectItem>
                  {invoices.map((invoice: SalesInvoiceRecord) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} - {invoice.customer?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Received Date *</label>
                <Input
                  type="date"
                  value={receiptForm.receivedAt}
                  onChange={(event) =>
                    setReceiptForm((prev) => ({ ...prev, receivedAt: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Amount *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={receiptForm.amount}
                  onChange={(event) => setReceiptForm((prev) => ({ ...prev, amount: event.target.value }))}
                  className="text-right font-mono"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Method *</label>
                <Input
                  value={receiptForm.method}
                  onChange={(event) => setReceiptForm((prev) => ({ ...prev, method: event.target.value }))}
                  placeholder="Cash"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Reference</label>
                <Input
                  value={receiptForm.reference}
                  onChange={(event) => setReceiptForm((prev) => ({ ...prev, reference: event.target.value }))}
                  placeholder="Transaction reference"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Bank Account</label>
              <Select
                value={receiptForm.bankAccountId}
                onValueChange={(value) =>
                  setReceiptForm((prev) => ({ ...prev, bankAccountId: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not deposited</SelectItem>
                  {bankAccounts.map((account: BankAccountRecord) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createReceiptMutation.isPending}>
                Save Receipt
              </Button>
              <Button type="button" variant="outline" onClick={() => setReceiptFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={creditNoteFormOpen} onOpenChange={setCreditNoteFormOpen}>
        <SheetContent size="full" className="w-full p-6 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Credit Note</SheetTitle>
            <SheetDescription>Issue a credit note against a customer invoice.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitCreditNote} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="block text-sm font-semibold mb-2">Invoice *</label>
                <Select
                  value={creditNoteForm.invoiceId}
                  onValueChange={(value) =>
                    setCreditNoteForm((prev) => ({ ...prev, invoiceId: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.map((invoice: SalesInvoiceRecord) => (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} - {invoice.customer?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Note Date *</label>
                <Input
                  type="date"
                  value={creditNoteForm.noteDate}
                  onChange={(event) =>
                    setCreditNoteForm((prev) => ({ ...prev, noteDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Currency</label>
                <Input
                  value={creditNoteForm.currency}
                  onChange={(event) =>
                    setCreditNoteForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                  placeholder="USD"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold mb-2">Issue Status</label>
                <Select
                  value={creditNoteForm.issueNow}
                  onValueChange={(value) =>
                    setCreditNoteForm((prev) => ({ ...prev, issueNow: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ISSUED">Issue Now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Reason</label>
              <Input
                value={creditNoteForm.reason}
                onChange={(event) =>
                  setCreditNoteForm((prev) => ({ ...prev, reason: event.target.value }))
                }
                placeholder="Reason for credit"
              />
            </div>
            <AccountingLineItemsListView
              title="Credit Note Lines"
              lines={creditNoteLines}
              taxOptions={taxOptions}
              onAddLine={addCreditNoteLine}
              onRemoveLine={removeCreditNoteLine}
              onChangeLine={updateCreditNoteLine}
              canRemoveLine={() => creditNoteLines.length > 1}
              footer={
                <div className="flex justify-end gap-6 text-sm">
                  <span className="text-muted-foreground">
                    Subtotal: <span className="font-mono">{creditNoteTotals.subtotal.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Tax: <span className="font-mono">{creditNoteTotals.taxTotal.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Total: <span className="font-mono">{creditNoteTotals.total.toFixed(2)}</span>
                  </span>
                </div>
              }
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createCreditNoteMutation.isPending}>
                Save Credit Note
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreditNoteFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={writeOffFormOpen} onOpenChange={setWriteOffFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Write-off</SheetTitle>
            <SheetDescription>Record a write-off against an outstanding invoice.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitWriteOff} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Invoice *</label>
              <Select
                value={writeOffForm.invoiceId}
                onValueChange={(value) => setWriteOffForm((prev) => ({ ...prev, invoiceId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((invoice: SalesInvoiceRecord) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} - {invoice.customer?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Amount *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={writeOffForm.amount}
                  onChange={(event) =>
                    setWriteOffForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  className="text-right font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Reason</label>
                <Input
                  value={writeOffForm.reason}
                  onChange={(event) =>
                    setWriteOffForm((prev) => ({ ...prev, reason: event.target.value }))
                  }
                  placeholder="Bad debt"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createWriteOffMutation.isPending}>
                Save Write-off
              </Button>
              <Button type="button" variant="outline" onClick={() => setWriteOffFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </AccountingShell>
  );
}
