"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { useToast } from "@/components/ui/use-toast";
import {
  type BankAccountRecord,
  type PurchaseBillRecord,
  type PurchasePaymentRecord,
  type TaxCodeRecord,
  type VendorRecord,
  fetchBankAccounts,
  fetchPurchaseBills,
  fetchPurchasePayments,
  fetchTaxCodes,
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
  const [activeView, setActiveView] = useState<"vendors" | "bills" | "payments">("vendors");
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [billFormOpen, setBillFormOpen] = useState(false);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [billStatusFilter, setBillStatusFilter] = useState("all");

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
      },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{row.original.phone || "-"}</div>
            <div className="text-xs text-muted-foreground">{row.original.email || ""}</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
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
    },
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => (
        <NumericCell align="left">
          {format(new Date(row.original.billDate), "yyyy-MM-dd")}
        </NumericCell>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "RECEIVED" ? "secondary" : "outline"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "total",
      header: "Total",
      cell: ({ row }) => (
        <NumericCell>{row.original.total.toFixed(2)} {row.original.currency}</NumericCell>
      ),
    },
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
    },
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
      },
      {
        id: "date",
        header: "Paid",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.paidAt), "yyyy-MM-dd")}
          </NumericCell>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => <NumericCell>{row.original.amount.toFixed(2)}</NumericCell>,
      },
      {
        id: "method",
        header: "Method",
        accessorKey: "method",
      },
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
        </div>
      }
    >
      {(vendorsError || billsError || paymentsError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load purchase data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(vendorsError || billsError || paymentsError)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "vendors", label: "Vendors", count: vendors.length },
          { id: "bills", label: "Bills", count: bills.length },
          { id: "payments", label: "Payments", count: payments.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "vendors" | "bills" | "payments")}
        railLabel="Purchase Views"
      >
        <div className={activeView === "vendors" ? "space-y-3" : "hidden"}>
          <DataTable
            data={vendors}
            columns={vendorColumns}
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
            searchPlaceholder="Search payments"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={"No payments found."}
          />
        </div>
      </VerticalDataViews>
      <Sheet open={vendorFormOpen} onOpenChange={setVendorFormOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
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
        <SheetContent className="w-full sm:max-w-5xl p-6 overflow-y-auto">
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Bill Lines</h3>
                <Button type="button" size="sm" variant="outline" onClick={addBillLine}>
                  Add Line
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[120px] text-right">Qty</TableHead>
                    <TableHead className="w-[140px] text-right">Unit Price</TableHead>
                    <TableHead className="w-[180px]">Tax Code</TableHead>
                    <TableHead className="w-[120px] text-right">Tax %</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billLines.map((line, index) => (
                    <TableRow key={`bill-line-${index}`}>
                      <TableCell>
                        <Input
                          value={line.description}
                          onChange={(event) => updateBillLine(index, "description", event.target.value)}
                          placeholder="Service or product"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.quantity}
                          onChange={(event) => updateBillLine(index, "quantity", event.target.value)}
                          className="text-right font-mono"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(event) => updateBillLine(index, "unitPrice", event.target.value)}
                          className="text-right font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.taxCodeId}
                          onValueChange={(value) => updateBillLine(index, "taxCodeId", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No tax</SelectItem>
                            {taxOptions.map((tax: TaxCodeRecord) => (
                              <SelectItem key={tax.id} value={tax.id}>
                                {tax.code} ({tax.rate}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.taxRate}
                          onChange={(event) => updateBillLine(index, "taxRate", event.target.value)}
                          className="text-right font-mono"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {billLines.length > 1 ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeBillLine(index)}>
                            Remove
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            </div>

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
        <SheetContent className="w-full sm:max-w-lg p-6">
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
    </AccountingShell>
  );
}
