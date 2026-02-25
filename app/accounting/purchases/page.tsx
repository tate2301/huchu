"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  type DebitNoteRecord,
  type PurchaseBillRecord,
  type PurchasePaymentRecord,
  type PurchaseWriteOffRecord,
  type StatementLineRecord,
  type VendorRecord,
  fetchApAging,
  fetchBankAccounts,
  fetchDebitNotes,
  fetchPurchaseBills,
  fetchPurchasePayments,
  fetchPurchaseWriteOffs,
  fetchTaxCodes,
  fetchVendorStatement,
  fetchVendors,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

const today = format(new Date(), "yyyy-MM-dd");

type BillLineForm = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
  taxRate: string;
};

export default function AccountingPurchasesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<
    "vendors" | "bills" | "payments" | "debit-notes" | "write-offs" | "aging" | "statements"
  >("vendors");
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [billFormOpen, setBillFormOpen] = useState(false);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [debitNoteFormOpen, setDebitNoteFormOpen] = useState(false);
  const [writeOffFormOpen, setWriteOffFormOpen] = useState(false);
  const [billStatusFilter, setBillStatusFilter] = useState("all");
  const [agingAsOf, setAgingAsOf] = useState(today);
  const [statementVendorId, setStatementVendorId] = useState("");
  const [statementStartDate, setStatementStartDate] = useState("");
  const [statementEndDate, setStatementEndDate] = useState("");

  const [vendorForm, setVendorForm] = useState({
    name: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    taxNumber: "",
    vatNumber: "",
    isActive: true,
  });

  const [billForm, setBillForm] = useState({
    vendorId: "",
    billDate: today,
    dueDate: "",
    currency: "USD",
    notes: "",
    receiveNow: "DRAFT",
  });

  const [billLines, setBillLines] = useState<BillLineForm[]>([
    { description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" },
  ]);

  const [paymentForm, setPaymentForm] = useState({
    billId: "",
    paidAt: today,
    amount: "",
    method: "Cash",
    reference: "",
    bankAccountId: "",
  });
  const [debitNoteForm, setDebitNoteForm] = useState({
    billId: "",
    noteDate: today,
    currency: "USD",
    reason: "",
    issueNow: "ISSUED",
  });
  const [debitNoteLines, setDebitNoteLines] = useState<BillLineForm[]>([
    { description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" },
  ]);
  const [writeOffForm, setWriteOffForm] = useState({
    billId: "",
    amount: "",
    reason: "",
  });
  const { data: vendorsData, error: vendorsError } = useQuery({
    queryKey: ["accounting", "purchases", "vendors"],
    queryFn: () => fetchVendors({ limit: 200 }),
  });

  const { data: billsData, error: billsError } = useQuery({
    queryKey: ["accounting", "purchases", "bills"],
    queryFn: () => fetchPurchaseBills({ limit: 200 }),
  });

  const { data: paymentsData, error: paymentsError } = useQuery({
    queryKey: ["accounting", "purchases", "payments"],
    queryFn: () => fetchPurchasePayments({ limit: 200 }),
  });

  const { data: debitNotesData, error: debitNotesError } = useQuery({
    queryKey: ["accounting", "purchases", "debit-notes"],
    queryFn: () => fetchDebitNotes({ limit: 200 }),
  });

  const { data: writeOffsData, error: writeOffsError } = useQuery({
    queryKey: ["accounting", "purchases", "write-offs"],
    queryFn: () => fetchPurchaseWriteOffs({ limit: 200 }),
  });

  const { data: agingReport, isLoading: agingLoading, error: agingError } = useQuery({
    queryKey: ["accounting", "purchases", "aging", agingAsOf],
    queryFn: () => fetchApAging({ asOf: agingAsOf || undefined }),
  });

  const {
    data: statementReport,
    isLoading: statementLoading,
    error: statementError,
  } = useQuery({
    queryKey: ["accounting", "purchases", "statement", statementVendorId, statementStartDate, statementEndDate],
    queryFn: () =>
      fetchVendorStatement({
        vendorId: statementVendorId,
        startDate: statementStartDate || undefined,
        endDate: statementEndDate || undefined,
      }),
    enabled: Boolean(statementVendorId),
  });

  const { data: taxCodes } = useQuery({
    queryKey: ["accounting", "tax"],
    queryFn: fetchTaxCodes,
  });

  const { data: bankAccountsData } = useQuery({
    queryKey: ["accounting", "banking", "accounts"],
    queryFn: () => fetchBankAccounts({ limit: 200, active: true }),
  });

  const vendors = vendorsData?.data ?? [];
  const bills = useMemo(() => billsData?.data ?? [], [billsData]);
  const payments = paymentsData?.data ?? [];
  const debitNotes = debitNotesData?.data ?? [];
  const writeOffs = writeOffsData?.data ?? [];
  const agingRows = agingReport?.rows ?? [];
  const statementLines = statementReport?.lines ?? [];
  const bankAccounts = bankAccountsData?.data ?? [];
  const taxOptions = taxCodes ?? [];

  const filteredBills = useMemo(() => {
    if (billStatusFilter === "all") return bills;
    return bills.filter((bill) => bill.status === billStatusFilter);
  }, [billStatusFilter, bills]);
  const vendorColumns = useMemo<ColumnDef<VendorRecord>[]>(
    () => [
      {
        id: "name",
        header: "Vendor",
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

  const billColumns: ColumnDef<PurchaseBillRecord>[] = [
    {
      id: "number",
      header: "Bill",
      cell: ({ row }) => (
        <div>
          <div className="font-mono">{row.original.billNumber}</div>
          <div className="text-xs text-muted-foreground">{row.original.vendor?.name}</div>
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
          {format(new Date(row.original.billDate), "yyyy-MM-dd")}
        </NumericCell>
      ),
      size: 128,
      minSize: 128,
      maxSize: 128},
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "RECEIVED" ? "secondary" : "outline"}>
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
            (row.original.debitNoteTotal ?? 0) -
            (row.original.writeOffTotal ?? 0);
        return <NumericCell>{balance.toFixed(2)} {row.original.currency}</NumericCell>;
      },
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          {row.original.status === "DRAFT" ? (
            <Button size="sm" onClick={() => receiveMutation.mutate(row.original.id)}>
              Receive Bill
            </Button>
          ) : null}
        </div>
      ),
      size: 108,
      minSize: 108,
      maxSize: 108},
  ];

  const paymentColumns = useMemo<ColumnDef<PurchasePaymentRecord>[]>(
    () => [
      {
        id: "payment",
        header: "Payment",
        cell: ({ row }) => (
          <div>
            <div className="font-mono">{row.original.paymentNumber}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.bill?.billNumber ?? "Unlinked"}
            </div>
          </div>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "date",
        header: "Paid",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.paidAt), "yyyy-MM-dd")}
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

  const debitNoteColumns = useMemo<ColumnDef<DebitNoteRecord>[]>(
    () => [
      {
        id: "note",
        header: "Debit Note",
        cell: ({ row }) => (
          <div>
            <div className="font-mono">{row.original.noteNumber}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.bill?.billNumber ?? "Bill"}
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

  const writeOffColumns = useMemo<ColumnDef<PurchaseWriteOffRecord>[]>(
    () => [
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
        id: "bill",
        header: "Bill",
        cell: ({ row }) => (
          <div>
            <div className="font-mono">{row.original.bill?.billNumber ?? "-"}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.bill?.vendor?.name ?? ""}
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
    ],
    [],
  );

  const agingColumns = useMemo<ColumnDef<AgingRow>[]>(
    () => [
      {
        id: "name",
        header: "Vendor",
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
  const createVendorMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/purchases/vendors", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Vendor created",
        description: "Vendor saved successfully.",
        variant: "success",
      });
      setVendorFormOpen(false);
      setVendorForm({
        name: "",
        contactName: "",
        phone: "",
        email: "",
        address: "",
        taxNumber: "",
        vatNumber: "",
        isActive: true,
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "purchases", "vendors"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create vendor",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createBillMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/purchases/bills", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Bill created",
        description: "Purchase bill saved successfully.",
        variant: "success",
      });
      setBillFormOpen(false);
      setBillForm({
        vendorId: "",
        billDate: today,
        dueDate: "",
        currency: "USD",
        notes: "",
        receiveNow: "DRAFT",
      });
      setBillLines([{ description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" }]);
      queryClient.invalidateQueries({ queryKey: ["accounting", "purchases", "bills"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create bill",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const receiveMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/accounting/purchases/bills/${id}` as const, {
        method: "PATCH",
        body: JSON.stringify({ status: "RECEIVED" }),
      }),
    onSuccess: () => {
      toast({
        title: "Bill received",
        description: "The bill has been received and posted.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "purchases", "bills"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to receive bill",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/purchases/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Payment created",
        description: "Payment saved successfully.",
        variant: "success",
      });
      setPaymentFormOpen(false);
      setPaymentForm({
        billId: "",
        paidAt: today,
        amount: "",
        method: "Cash",
        reference: "",
        bankAccountId: "",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "purchases", "payments"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "purchases", "bills"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create payment",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createDebitNoteMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/purchases/debit-notes", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Debit note created",
        description: "Debit note saved successfully.",
        variant: "success",
      });
      setDebitNoteFormOpen(false);
      setDebitNoteForm({
        billId: "",
        noteDate: today,
        currency: "USD",
        reason: "",
        issueNow: "ISSUED",
      });
      setDebitNoteLines([{ description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" }]);
      queryClient.invalidateQueries({ queryKey: ["accounting", "purchases", "debit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "purchases", "bills"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create debit note",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const createWriteOffMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/purchases/write-offs", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Write-off recorded",
        description: "Purchase write-off saved successfully.",
        variant: "success",
      });
      setWriteOffFormOpen(false);
      setWriteOffForm({ billId: "", amount: "", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["accounting", "purchases", "write-offs"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "purchases", "bills"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to record write-off",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const billTotals = useMemo(() => {
    const subtotal = billLines.reduce(
      (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
      0,
    );
    const taxTotal = billLines.reduce((sum, line) => {
      const rate = Number(line.taxRate) || 0;
      return sum + ((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * rate) / 100;
    }, 0);
    return { subtotal, taxTotal, total: subtotal + taxTotal };
  }, [billLines]);

  const updateBillLine = (index: number, field: keyof BillLineForm, value: string) => {
    setBillLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)),
    );
  };

  const addBillLine = () => {
    setBillLines((prev) => [
      ...prev,
      { description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" },
    ]);
  };

  const removeBillLine = (index: number) => {
    if (billLines.length <= 1) return;
    setBillLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const debitNoteTotals = useMemo(() => {
    const subtotal = debitNoteLines.reduce(
      (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
      0,
    );
    const taxTotal = debitNoteLines.reduce((sum, line) => {
      const rate = Number(line.taxRate) || 0;
      return sum + ((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * rate) / 100;
    }, 0);
    return { subtotal, taxTotal, total: subtotal + taxTotal };
  }, [debitNoteLines]);

  const updateDebitNoteLine = (index: number, field: keyof BillLineForm, value: string) => {
    setDebitNoteLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)),
    );
  };

  const addDebitNoteLine = () => {
    setDebitNoteLines((prev) => [
      ...prev,
      { description: "", quantity: "1", unitPrice: "", taxCodeId: "", taxRate: "" },
    ]);
  };

  const removeDebitNoteLine = (index: number) => {
    if (debitNoteLines.length <= 1) return;
    setDebitNoteLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const submitVendor = (event: React.FormEvent) => {
    event.preventDefault();
    if (!vendorForm.name.trim()) {
      toast({
        title: "Missing name",
        description: "Vendor name is required.",
        variant: "destructive",
      });
      return;
    }

    createVendorMutation.mutate({
      name: vendorForm.name.trim(),
      contactName: vendorForm.contactName.trim() || undefined,
      phone: vendorForm.phone.trim() || undefined,
      email: vendorForm.email.trim() || undefined,
      address: vendorForm.address.trim() || undefined,
      taxNumber: vendorForm.taxNumber.trim() || undefined,
      vatNumber: vendorForm.vatNumber.trim() || undefined,
      isActive: vendorForm.isActive,
    });
  };

  const submitBill = (event: React.FormEvent) => {
    event.preventDefault();

    if (!billForm.vendorId) {
      toast({
        title: "Missing vendor",
        description: "Select a vendor before saving.",
        variant: "destructive",
      });
      return;
    }

    const preparedLines = billLines
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

    createBillMutation.mutate({
      vendorId: billForm.vendorId,
      billDate: billForm.billDate,
      dueDate: billForm.dueDate || undefined,
      currency: billForm.currency || "USD",
      notes: billForm.notes.trim() || undefined,
      receiveNow: billForm.receiveNow === "RECEIVED",
      lines: preparedLines,
    });
  };

  const submitPayment = (event: React.FormEvent) => {
    event.preventDefault();

    if (!paymentForm.paidAt || !paymentForm.amount) {
      toast({
        title: "Missing details",
        description: "Please provide paid date and amount.",
        variant: "destructive",
      });
      return;
    }

    createPaymentMutation.mutate({
      billId: paymentForm.billId || undefined,
      paidAt: paymentForm.paidAt,
      amount: Number(paymentForm.amount),
      method: paymentForm.method,
      reference: paymentForm.reference.trim() || undefined,
      bankAccountId: paymentForm.bankAccountId || undefined,
    });
  };

  const submitDebitNote = (event: React.FormEvent) => {
    event.preventDefault();

    if (!debitNoteForm.billId) {
      toast({
        title: "Missing bill",
        description: "Select a bill before saving the debit note.",
        variant: "destructive",
      });
      return;
    }

    const preparedLines = debitNoteLines
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

    createDebitNoteMutation.mutate({
      billId: debitNoteForm.billId,
      noteDate: debitNoteForm.noteDate,
      currency: debitNoteForm.currency || "USD",
      reason: debitNoteForm.reason.trim() || undefined,
      issueNow: debitNoteForm.issueNow === "ISSUED",
      lines: preparedLines,
    });
  };

  const submitWriteOff = (event: React.FormEvent) => {
    event.preventDefault();

    if (!writeOffForm.billId || !writeOffForm.amount) {
      toast({
        title: "Missing details",
        description: "Select a bill and enter an amount.",
        variant: "destructive",
      });
      return;
    }

    createWriteOffMutation.mutate({
      billId: writeOffForm.billId,
      amount: Number(writeOffForm.amount),
      reason: writeOffForm.reason.trim() || undefined,
    });
  };
  return (
    <AccountingShell
      activeTab="purchases"
      title="Purchases (Accounts Payable)"
      description="Manage vendors, record bills, and track payments."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setVendorFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Vendor
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBillFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Bill
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPaymentFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Payment
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDebitNoteFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Debit Note
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWriteOffFormOpen(true)}>
            <Plus className="mr-2 size-4" />
            Write Off
          </Button>
        </div>
      }
    >
      {(vendorsError || billsError || paymentsError || debitNotesError || writeOffsError || agingError || statementError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load purchase data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              vendorsError ||
                billsError ||
                paymentsError ||
                debitNotesError ||
                writeOffsError ||
                agingError ||
                statementError,
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "vendors", label: "Vendors", count: vendors.length },
          { id: "bills", label: "Bills", count: bills.length },
          { id: "payments", label: "Payments", count: payments.length },
          { id: "debit-notes", label: "Debit Notes", count: debitNotes.length },
          { id: "write-offs", label: "Write-offs", count: writeOffs.length },
          { id: "aging", label: "AP Aging", count: agingRows.length },
          { id: "statements", label: "Statements", count: statementLines.length },
        ]}
        value={activeView}
        onValueChange={(value) =>
          setActiveView(
            value as
              | "vendors"
              | "bills"
              | "payments"
              | "debit-notes"
              | "write-offs"
              | "aging"
              | "statements",
          )
        }
        railLabel="Purchase Views"
      >
        <div className={activeView === "vendors" ? "space-y-3" : "hidden"}>
          <DataTable
            data={vendors}
            columns={vendorColumns}
            groupBy={(row) => (row.isActive ? "Active" : "Inactive")}
            searchPlaceholder="Search vendors"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No vendors found."}
          />
        </div>

        <div className={activeView === "bills" ? "space-y-3" : "hidden"}>
          <DataTable
            data={filteredBills}
            columns={billColumns}
            groupBy="status"
            searchPlaceholder="Search bills"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <Select value={billStatusFilter} onValueChange={setBillStatusFilter}>
                <SelectTrigger size="sm" className="h-8 w-[180px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="RECEIVED">Received</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="VOIDED">Voided</SelectItem>
                </SelectContent>
              </Select>
            }
            emptyState={"No bills found."}
          />
        </div>

        <div className={activeView === "payments" ? "space-y-3" : "hidden"}>
          <DataTable
            data={payments}
            columns={paymentColumns}
            groupBy="method"
            searchPlaceholder="Search payments"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No payments found."}
          />
        </div>

        <div className={activeView === "debit-notes" ? "space-y-3" : "hidden"}>
          <DataTable
            data={debitNotes}
            columns={debitNoteColumns}
            groupBy="status"
            searchPlaceholder="Search debit notes"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No debit notes found."}
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
            searchPlaceholder="Search vendors"
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
            <Card>
              <CardHeader>
                <CardDescription>Opening Balance</CardDescription>
                <CardTitle className="font-mono">
                  {(statementReport?.openingBalance ?? 0).toFixed(2)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Closing Balance</CardDescription>
                <CardTitle className="font-mono">
                  {(statementReport?.closingBalance ?? 0).toFixed(2)}
                </CardTitle>
              </CardHeader>
            </Card>
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
                  value={statementVendorId}
                  onValueChange={(value) => setStatementVendorId(value)}
                >
                  <SelectTrigger size="sm" className="h-8 w-[240px]">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((vendor: VendorRecord) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
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
              statementVendorId
                ? statementLoading
                  ? "Loading statement..."
                  : "No statement lines found."
                : "Select a vendor to view statements."
            }
          />
        </div>
      </VerticalDataViews>
      <Sheet open={vendorFormOpen} onOpenChange={setVendorFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Vendor</SheetTitle>
            <SheetDescription>Capture supplier details for purchasing.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitVendor} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Vendor Name *</label>
              <Input
                value={vendorForm.name}
                onChange={(event) =>
                  setVendorForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Supplier name"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Contact Name</label>
                <Input
                  value={vendorForm.contactName}
                  onChange={(event) =>
                    setVendorForm((prev) => ({ ...prev, contactName: event.target.value }))
                  }
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Phone</label>
                <Input
                  value={vendorForm.phone}
                  onChange={(event) =>
                    setVendorForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  placeholder="+263"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Email</label>
              <Input
                value={vendorForm.email}
                onChange={(event) =>
                  setVendorForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="accounts@supplier.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Address</label>
              <Input
                value={vendorForm.address}
                onChange={(event) =>
                  setVendorForm((prev) => ({ ...prev, address: event.target.value }))
                }
                placeholder="Harare, Zimbabwe"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Tax Number</label>
                <Input
                  value={vendorForm.taxNumber}
                  onChange={(event) =>
                    setVendorForm((prev) => ({ ...prev, taxNumber: event.target.value }))
                  }
                  placeholder="TIN"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">VAT Number</label>
                <Input
                  value={vendorForm.vatNumber}
                  onChange={(event) =>
                    setVendorForm((prev) => ({ ...prev, vatNumber: event.target.value }))
                  }
                  placeholder="VAT"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createVendorMutation.isPending}>
                Save Vendor
              </Button>
              <Button type="button" variant="outline" onClick={() => setVendorFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={billFormOpen} onOpenChange={setBillFormOpen}>
        <SheetContent size="full" className="w-full p-6 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Purchase Bill</SheetTitle>
            <SheetDescription>Record supplier bills and optionally receive them now.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitBill} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="block text-sm font-semibold mb-2">Vendor *</label>
                <Select
                  value={billForm.vendorId}
                  onValueChange={(value) => setBillForm((prev) => ({ ...prev, vendorId: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Bill Date *</label>
                <Input
                  type="date"
                  value={billForm.billDate}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, billDate: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Due Date</label>
                <Input
                  type="date"
                  value={billForm.dueDate}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold mb-2">Currency</label>
                <Input
                  value={billForm.currency}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, currency: event.target.value }))}
                  placeholder="USD"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Receive Status</label>
                <Select
                  value={billForm.receiveNow}
                  onValueChange={(value) => setBillForm((prev) => ({ ...prev, receiveNow: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="RECEIVED">Receive Now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Notes</label>
              <Input
                value={billForm.notes}
                onChange={(event) => setBillForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Optional bill notes"
              />
            </div>

            <AccountingLineItemsListView
              title="Bill Lines"
              lines={billLines}
              taxOptions={taxOptions}
              onAddLine={addBillLine}
              onRemoveLine={removeBillLine}
              onChangeLine={updateBillLine}
              canRemoveLine={() => billLines.length > 1}
              footer={
                <div className="flex justify-end gap-6 text-sm">
                  <span className="text-muted-foreground">
                    Subtotal: <span className="font-mono">{billTotals.subtotal.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Tax: <span className="font-mono">{billTotals.taxTotal.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Total: <span className="font-mono">{billTotals.total.toFixed(2)}</span>
                  </span>
                </div>
              }
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createBillMutation.isPending}>
                Save Bill
              </Button>
              <Button type="button" variant="outline" onClick={() => setBillFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={paymentFormOpen} onOpenChange={setPaymentFormOpen}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>New Payment</SheetTitle>
            <SheetDescription>Record supplier payments against received bills.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitPayment} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Bill (optional)</label>
              <Select
                value={paymentForm.billId}
                onValueChange={(value) => setPaymentForm((prev) => ({ ...prev, billId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select bill" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unlinked payment</SelectItem>
                  {bills.map((bill: PurchaseBillRecord) => (
                    <SelectItem key={bill.id} value={bill.id}>
                      {bill.billNumber} - {bill.vendor?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Paid Date *</label>
                <Input
                  type="date"
                  value={paymentForm.paidAt}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, paidAt: event.target.value }))
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
                  value={paymentForm.amount}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))}
                  className="text-right font-mono"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Method *</label>
                <Input
                  value={paymentForm.method}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, method: event.target.value }))}
                  placeholder="Cash"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Reference</label>
                <Input
                  value={paymentForm.reference}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, reference: event.target.value }))}
                  placeholder="Transaction reference"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Bank Account</label>
              <Select
                value={paymentForm.bankAccountId}
                onValueChange={(value) =>
                  setPaymentForm((prev) => ({ ...prev, bankAccountId: value }))
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
              <Button type="submit" className="flex-1" disabled={createPaymentMutation.isPending}>
                Save Payment
              </Button>
              <Button type="button" variant="outline" onClick={() => setPaymentFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Sheet open={debitNoteFormOpen} onOpenChange={setDebitNoteFormOpen}>
        <SheetContent size="full" className="w-full p-6 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Debit Note</SheetTitle>
            <SheetDescription>Issue a debit note against a purchase bill.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitDebitNote} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="block text-sm font-semibold mb-2">Bill *</label>
                <Select
                  value={debitNoteForm.billId}
                  onValueChange={(value) =>
                    setDebitNoteForm((prev) => ({ ...prev, billId: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select bill" />
                  </SelectTrigger>
                  <SelectContent>
                    {bills.map((bill: PurchaseBillRecord) => (
                      <SelectItem key={bill.id} value={bill.id}>
                        {bill.billNumber} - {bill.vendor?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Note Date *</label>
                <Input
                  type="date"
                  value={debitNoteForm.noteDate}
                  onChange={(event) =>
                    setDebitNoteForm((prev) => ({ ...prev, noteDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Currency</label>
                <Input
                  value={debitNoteForm.currency}
                  onChange={(event) =>
                    setDebitNoteForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                  placeholder="USD"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold mb-2">Issue Status</label>
                <Select
                  value={debitNoteForm.issueNow}
                  onValueChange={(value) =>
                    setDebitNoteForm((prev) => ({ ...prev, issueNow: value }))
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
                value={debitNoteForm.reason}
                onChange={(event) =>
                  setDebitNoteForm((prev) => ({ ...prev, reason: event.target.value }))
                }
                placeholder="Reason for debit"
              />
            </div>
            <AccountingLineItemsListView
              title="Debit Note Lines"
              lines={debitNoteLines}
              taxOptions={taxOptions}
              onAddLine={addDebitNoteLine}
              onRemoveLine={removeDebitNoteLine}
              onChangeLine={updateDebitNoteLine}
              canRemoveLine={() => debitNoteLines.length > 1}
              footer={
                <div className="flex justify-end gap-6 text-sm">
                  <span className="text-muted-foreground">
                    Subtotal: <span className="font-mono">{debitNoteTotals.subtotal.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Tax: <span className="font-mono">{debitNoteTotals.taxTotal.toFixed(2)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Total: <span className="font-mono">{debitNoteTotals.total.toFixed(2)}</span>
                  </span>
                </div>
              }
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createDebitNoteMutation.isPending}>
                Save Debit Note
              </Button>
              <Button type="button" variant="outline" onClick={() => setDebitNoteFormOpen(false)}>
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
            <SheetDescription>Record a write-off against an outstanding bill.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submitWriteOff} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Bill *</label>
              <Select
                value={writeOffForm.billId}
                onValueChange={(value) => setWriteOffForm((prev) => ({ ...prev, billId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select bill" />
                </SelectTrigger>
                <SelectContent>
                  {bills.map((bill: PurchaseBillRecord) => (
                    <SelectItem key={bill.id} value={bill.id}>
                      {bill.billNumber} - {bill.vendor?.name}
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
                  placeholder="Adjustment"
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
