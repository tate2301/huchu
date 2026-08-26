"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// The repo's `components/ui/select` is the Radix compound API, which is the
// wrong shape for a four-option picker; its own header says to reach for the DS
// component when a plain options list is all that is wanted.
import { Alert, Button as DsButton, Select as DsSelect } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PageHeading } from "@/components/layout/page-heading";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import {
  CreateButton,
  RecordActions,
  type RecordVerb,
} from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsClasses, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";
import {
  allocateReceiptCredit,
  applySchoolFeeWaiver,
  cancelSchoolFeeRefund,
  discardSchoolFeeInvoice,
  discardSchoolFeeWaiver,
  deleteSchoolFeeStructure,
  fetchSchoolFeeCredits,
  fetchSchoolFeeInvoices,
  fetchSchoolFeeReceipts,
  fetchSchoolFeeRefunds,
  fetchSchoolFeeStructures,
  fetchSchoolFeeWaivers,
  fetchSchoolsFeesSummary,
  fiscaliseSchoolFeeReceipt,
  issueSchoolFeeInvoice,
  paySchoolFeeRefund,
  requestSchoolFeeRefund,
  updateSchoolFeeStructure,
  updateSchoolFeeWaiver,
  voidSchoolFeeReceipt,
  writeOffSchoolFeeInvoice,
  type SchoolFeeCreditRecord,
  type SchoolFeeInvoiceRecord,
  type SchoolFeeReceiptRecord,
  type SchoolFeeRefundRecord,
  type SchoolFeeStructureRecord,
  type SchoolFeeWaiverRecord,
} from "@/lib/schools/fees-v2";

import { BulkGenerateInvoicesDialog } from "./bulk-generate-invoices-dialog";
import { CopyStructureDialog } from "./copy-structure-dialog";
import { InvoicePicker } from "./fee-pickers";
import {
  InvoiceFormDialog,
  ReasonDialog,
  ReceiptFormDialog,
  StructureFormDialog,
  WaiverFormDialog,
} from "./fee-dialogs";
import {
  FiscalBadge,
  InvoiceStatusBadge,
  ReceiptStatusBadge,
  RefundStatusBadge,
  StructureStatusBadge,
  WaiverStatusBadge,
} from "./fee-status";

/**
 * The whole-school fee ledger.
 *
 * Six segments over one set of money, and before this pass most of them were
 * read-only lists with no way out. What changed:
 *
 * **The tab comes from the URL.** `lib/navigation.ts` links Receipts, Refunds
 * and Waivers straight at `?view=…`, and a tab held only in `useState` sent all
 * three to Invoices and lost itself on every refresh. It is pushed back on
 * change, so a bursar can send somebody a link to the refund queue.
 *
 * **Every verb the API already had now has a control.** Issue, write off, void,
 * fiscalise, approve, reject, apply, reverse, activate, archive, edit and
 * discard were nine live endpoints and four unreachable waiver states with
 * nothing anywhere to reach them.
 *
 * **Nothing asks for a UUID.** See `./fee-pickers`.
 *
 * **Every segment filters by year group.** A bursar works one form at a time —
 * that is what `/schools/finance` exists for — and the whole-school view is
 * only useful if it can be narrowed the same way.
 */

type FeesView =
  | "structures"
  | "invoices"
  | "receipts"
  | "credits"
  | "refunds"
  | "waivers";

const VIEWS: FeesView[] = [
  "invoices",
  "receipts",
  "credits",
  "refunds",
  "waivers",
  "structures",
];

function isFeesView(value: string | null): value is FeesView {
  return value !== null && (VIEWS as string[]).includes(value);
}

/**
 * Every list endpoint caps at 100 rows (`getPaginationParams`), so this is the
 * page size rather than a number of our own. Asking for 200 — which this file
 * used to — got 100 and quietly called it the whole school.
 */
const PAGE_LIMIT = 100;

const INVOICE_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "ISSUED", label: "Issued" },
  { value: "PART_PAID", label: "Part paid" },
  { value: "PAID", label: "Paid" },
  { value: "WRITEOFF", label: "Written off" },
  { value: "VOIDED", label: "Voided" },
];

const RECEIPT_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "POSTED", label: "Posted" },
  { value: "VOIDED", label: "Voided" },
];

const WAIVER_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "APPROVED", label: "Approved" },
  { value: "APPLIED", label: "Applied" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REVERSED", label: "Reversed" },
];

const WAIVER_TYPES = [
  { value: "SCHOLARSHIP", label: "Scholarship" },
  { value: "DISCOUNT", label: "Discount" },
  { value: "HARDSHIP", label: "Hardship" },
  { value: "OTHER", label: "Other" },
];

const REFUND_STATUSES = [
  { value: "REQUESTED", label: "Requested" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STRUCTURE_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

const CREDIT_KINDS = [
  { value: "RECEIPT", label: "Overpayment" },
  { value: "INVOICE", label: "Over-settled bill" },
];

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
];

const initialRefundForm = { amount: "", method: "CASH", reason: "", reference: "" };

/** A person, with a face, wherever this screen lists one. */
function StudentCell({
  student,
}: {
  student: { firstName: string; lastName: string; studentNo: string };
}) {
  return (
    <div className="flex items-center gap-2">
      <PersonAvatar firstName={student.firstName} lastName={student.lastName} />
      <div className="min-w-0">
        <div className="truncate font-medium">
          {student.lastName}, {student.firstName}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {student.studentNo}
        </div>
      </div>
    </div>
  );
}

/**
 * "Showing the first 100 of 842" — said out loud rather than left to be
 * discovered. A bursar who cannot see the row they are chasing needs to know
 * whether it is filtered out or simply off the end of the page.
 */
function PageNote({ shown, total, onNarrow }: { shown: number; total: number; onNarrow?: () => void }) {
  if (total <= shown) return null;
  return (
    <Alert
      tone="info"
      actions={
        onNarrow ? (
          <DsButton size="sm" variant="secondary" onClick={onNarrow}>
            Clear the filters
          </DsButton>
        ) : undefined
      }
    >
      Showing the first {shown} of {total}. Narrow with the filters above to see the rest.
    </Alert>
  );
}

export function SchoolsFeesContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  /**
   * The segment IS the URL, rather than a piece of state the URL happens to
   * seed.
   *
   * `lib/navigation.ts` points Receipts, Refunds and Waivers straight at
   * `?view=…`; holding the tab in `useState` sent all three to Invoices, and a
   * refresh lost whichever one you were on. Deriving it means there is one
   * answer to "which tab is open" and no effect keeping two copies in step.
   *
   * `replace` rather than `push`: flicking between six tabs is not six steps
   * back, and a bursar who pressed Back expects to leave the ledger.
   */
  const viewParam = searchParams.get("view");
  const activeView: FeesView = isFeesView(viewParam) ? viewParam : "invoices";

  const changeView = useCallback(
    (next: string) => {
      if (!isFeesView(next)) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /* ── filters, one set per segment ─────────────────────────────────────── */

  const [invoiceClass, setInvoiceClass] = useState("");
  const [invoiceTerm, setInvoiceTerm] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [invoiceDueFrom, setInvoiceDueFrom] = useState("");
  const [invoiceDueTo, setInvoiceDueTo] = useState("");
  const [invoiceMinOutstanding, setInvoiceMinOutstanding] = useState("");

  const [receiptClass, setReceiptClass] = useState("");
  const [receiptStatus, setReceiptStatus] = useState("");
  const [receiptFrom, setReceiptFrom] = useState("");
  const [receiptTo, setReceiptTo] = useState("");

  const [creditClass, setCreditClass] = useState("");
  const [creditKind, setCreditKind] = useState("");

  const [refundClass, setRefundClass] = useState("");
  const [refundStatus, setRefundStatus] = useState("");

  const [waiverClass, setWaiverClass] = useState("");
  const [waiverTerm, setWaiverTerm] = useState("");
  const [waiverStatus, setWaiverStatus] = useState("");
  const [waiverType, setWaiverType] = useState("");

  const [structureClass, setStructureClass] = useState("");
  const [structureTerm, setStructureTerm] = useState("");
  const [structureStatus, setStructureStatus] = useState("");

  const clearInvoiceFilters = () => {
    setInvoiceClass("");
    setInvoiceTerm("");
    setInvoiceStatus("");
    setInvoiceDueFrom("");
    setInvoiceDueTo("");
    setInvoiceMinOutstanding("");
  };

  /* ── the lists that fill the filters ──────────────────────────────────── */

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: PAGE_LIMIT }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "list"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: PAGE_LIMIT }),
  });

  const classOptions = useMemo(
    () =>
      (classesQuery.data?.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    [classesQuery.data],
  );
  const termOptions = useMemo(
    () => (termsQuery.data?.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    [termsQuery.data],
  );

  /* ── the money ────────────────────────────────────────────────────────── */

  const summaryQuery = useQuery({
    queryKey: ["schools", "fees", "summary"],
    queryFn: () => fetchSchoolsFeesSummary(),
  });

  const invoicesQuery = useQuery({
    queryKey: [
      "schools",
      "fees",
      "invoices",
      { invoiceClass, invoiceTerm, invoiceStatus },
    ],
    queryFn: () =>
      fetchSchoolFeeInvoices({
        page: 1,
        limit: PAGE_LIMIT,
        classId: invoiceClass || undefined,
        termId: invoiceTerm || undefined,
        status: (invoiceStatus || undefined) as SchoolFeeInvoiceRecord["status"] | undefined,
      }),
  });

  const receiptsQuery = useQuery({
    queryKey: [
      "schools",
      "fees",
      "receipts",
      { receiptClass, receiptStatus, receiptFrom, receiptTo },
    ],
    queryFn: () =>
      fetchSchoolFeeReceipts({
        page: 1,
        limit: PAGE_LIMIT,
        classId: receiptClass || undefined,
        status: (receiptStatus || undefined) as SchoolFeeReceiptRecord["status"] | undefined,
        from: receiptFrom || undefined,
        to: receiptTo || undefined,
      }),
  });

  const creditsQuery = useQuery({
    queryKey: ["schools", "fees", "credits", { creditClass }],
    queryFn: () =>
      fetchSchoolFeeCredits({
        page: 1,
        limit: PAGE_LIMIT,
        classId: creditClass || undefined,
      }),
  });

  const refundsQuery = useQuery({
    queryKey: ["schools", "fees", "refunds", { refundClass, refundStatus }],
    queryFn: () =>
      fetchSchoolFeeRefunds({
        page: 1,
        limit: PAGE_LIMIT,
        classId: refundClass || undefined,
        status: (refundStatus || undefined) as SchoolFeeRefundRecord["status"] | undefined,
      }),
  });

  const waiversQuery = useQuery({
    queryKey: ["schools", "fees", "waivers", { waiverClass, waiverTerm, waiverStatus }],
    queryFn: () =>
      fetchSchoolFeeWaivers({
        page: 1,
        limit: PAGE_LIMIT,
        classId: waiverClass || undefined,
        termId: waiverTerm || undefined,
        status: (waiverStatus || undefined) as SchoolFeeWaiverRecord["status"] | undefined,
      }),
  });

  const structuresQuery = useQuery({
    queryKey: [
      "schools",
      "fees",
      "structures",
      { structureClass, structureTerm, structureStatus },
    ],
    // `includeLines` is what makes the totals real. Without it the route has no
    // lines to add up and every structure in this table read "$0.00 a term" — a
    // fee sheet that appears to charge nothing, which is worse than no column.
    queryFn: () =>
      fetchSchoolFeeStructures({
        page: 1,
        limit: PAGE_LIMIT,
        includeLines: true,
        classId: structureClass || undefined,
        termId: structureTerm || undefined,
        status: (structureStatus || undefined) as
          | SchoolFeeStructureRecord["status"]
          | undefined,
      }),
  });

  /* ── the rows, after the filters the endpoints cannot take ────────────── */

  const invoices = useMemo(() => {
    const rows = invoicesQuery.data?.data ?? [];
    const minOutstanding = invoiceMinOutstanding ? Number(invoiceMinOutstanding) : null;
    return rows.filter((invoice) => {
      // Money crosses JSON as a number here — `successResponse` serialises every
      // Decimal on the way out — so this is arithmetic, not a string compare.
      if (minOutstanding !== null && invoice.balanceAmount < minOutstanding) return false;
      const due = invoice.dueDate.slice(0, 10);
      if (invoiceDueFrom && due < invoiceDueFrom) return false;
      if (invoiceDueTo && due > invoiceDueTo) return false;
      return true;
    });
  }, [invoicesQuery.data, invoiceMinOutstanding, invoiceDueFrom, invoiceDueTo]);

  const receipts = useMemo(() => receiptsQuery.data?.data ?? [], [receiptsQuery.data]);

  const credits = useMemo(() => {
    const rows = creditsQuery.data?.data ?? [];
    return creditKind ? rows.filter((row) => row.kind === creditKind) : rows;
  }, [creditsQuery.data, creditKind]);

  const refunds = useMemo(() => refundsQuery.data?.data ?? [], [refundsQuery.data]);

  const waivers = useMemo(() => {
    const rows = waiversQuery.data?.data ?? [];
    return waiverType ? rows.filter((row) => row.waiverType === waiverType) : rows;
  }, [waiversQuery.data, waiverType]);

  const structures = useMemo(() => structuresQuery.data?.data ?? [], [structuresQuery.data]);

  /* ── what the verbs open ──────────────────────────────────────────────── */

  const [invoiceDialog, setInvoiceDialog] = useState<{
    open: boolean;
    record: SchoolFeeInvoiceRecord | null;
  }>({ open: false, record: null });
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [waiverDialog, setWaiverDialog] = useState<{
    open: boolean;
    record: SchoolFeeWaiverRecord | null;
  }>({ open: false, record: null });
  const [structureDialog, setStructureDialog] = useState<{
    open: boolean;
    record: SchoolFeeStructureRecord | null;
  }>({ open: false, record: null });
  const [bulkGenerateOpen, setBulkGenerateOpen] = useState(false);
  const [copySource, setCopySource] = useState<SchoolFeeStructureRecord | null>(null);

  const [writeOffTarget, setWriteOffTarget] = useState<SchoolFeeInvoiceRecord | null>(null);
  const [voidTarget, setVoidTarget] = useState<SchoolFeeReceiptRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SchoolFeeWaiverRecord | null>(null);
  const [reverseTarget, setReverseTarget] = useState<SchoolFeeWaiverRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SchoolFeeRefundRecord | null>(null);

  const [creditSource, setCreditSource] = useState<SchoolFeeCreditRecord | null>(null);
  const [allocateInvoiceId, setAllocateInvoiceId] = useState("");
  const [allocateAmount, setAllocateAmount] = useState("");
  const [refundSource, setRefundSource] = useState<SchoolFeeCreditRecord | null>(null);
  const [refundForm, setRefundForm] = useState(initialRefundForm);

  /** Everything on this screen is one pot of money; one invalidation covers it. */
  const invalidateMoney = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["schools", "fees"] });
  }, [queryClient]);

  /* ── the verbs themselves ─────────────────────────────────────────────── */

  const issueInvoice = useMutation({
    mutationFn: (invoiceId: string) => issueSchoolFeeInvoice(invoiceId),
    onSuccess: invalidateMoney,
  });
  const writeOffInvoice = useMutation({
    mutationFn: (input: { invoiceId: string; reason: string }) =>
      writeOffSchoolFeeInvoice(input.invoiceId, input.reason),
    onSuccess: () => {
      invalidateMoney();
      setWriteOffTarget(null);
    },
  });
  const discardInvoice = useMutation({
    mutationFn: (invoiceId: string) => discardSchoolFeeInvoice(invoiceId),
    onSuccess: invalidateMoney,
  });

  const voidReceipt = useMutation({
    mutationFn: (input: { receiptId: string; reason: string }) =>
      voidSchoolFeeReceipt(input.receiptId, input.reason),
    onSuccess: () => {
      invalidateMoney();
      setVoidTarget(null);
    },
  });
  const fiscaliseReceipt = useMutation({
    mutationFn: (receiptId: string) => fiscaliseSchoolFeeReceipt(receiptId),
    onSuccess: invalidateMoney,
  });

  const approveWaiver = useMutation({
    mutationFn: (waiverId: string) => updateSchoolFeeWaiver(waiverId, { status: "APPROVED" }),
    onSuccess: invalidateMoney,
  });
  const rejectWaiver = useMutation({
    mutationFn: (input: { waiverId: string; reason: string }) =>
      updateSchoolFeeWaiver(input.waiverId, { status: "REJECTED", reason: input.reason }),
    onSuccess: () => {
      invalidateMoney();
      setRejectTarget(null);
    },
  });
  const applyWaiver = useMutation({
    mutationFn: (waiverId: string) => applySchoolFeeWaiver(waiverId),
    onSuccess: invalidateMoney,
  });
  const reverseWaiver = useMutation({
    mutationFn: (input: { waiverId: string; reason: string }) =>
      updateSchoolFeeWaiver(input.waiverId, { status: "REVERSED", reason: input.reason }),
    onSuccess: () => {
      invalidateMoney();
      setReverseTarget(null);
    },
  });
  const discardWaiver = useMutation({
    mutationFn: (waiverId: string) => discardSchoolFeeWaiver(waiverId),
    onSuccess: invalidateMoney,
  });

  const setStructureStatusMutation = useMutation({
    mutationFn: (input: {
      structureId: string;
      status: SchoolFeeStructureRecord["status"];
    }) => updateSchoolFeeStructure(input.structureId, { status: input.status }),
    onSuccess: invalidateMoney,
  });
  const deleteStructure = useMutation({
    mutationFn: (structureId: string) => deleteSchoolFeeStructure(structureId),
    onSuccess: invalidateMoney,
  });

  const payRefund = useMutation({
    mutationFn: (refundId: string) => paySchoolFeeRefund(refundId),
    onSuccess: invalidateMoney,
  });
  const cancelRefund = useMutation({
    mutationFn: (input: { refundId: string; reason: string }) =>
      cancelSchoolFeeRefund(input.refundId, input.reason),
    onSuccess: () => {
      invalidateMoney();
      setCancelTarget(null);
    },
  });

  const allocateCredit = useMutation({
    mutationFn: (input: { receiptId: string; invoiceId: string; amount: string }) =>
      allocateReceiptCredit(input.receiptId, [
        {
          invoiceId: input.invoiceId,
          // Left blank, the credit settles the invoice as far as it goes.
          ...(input.amount ? { allocatedAmount: Number(input.amount) } : {}),
        },
      ]),
    onSuccess: () => {
      invalidateMoney();
      setCreditSource(null);
      setAllocateInvoiceId("");
      setAllocateAmount("");
    },
  });

  const requestRefund = useMutation({
    mutationFn: (input: { source: SchoolFeeCreditRecord; form: typeof initialRefundForm }) =>
      requestSchoolFeeRefund({
        ...(input.source.kind === "RECEIPT"
          ? { receiptId: input.source.sourceId }
          : { invoiceId: input.source.sourceId }),
        amount: Number(input.form.amount) || 0,
        method: input.form.method as "CASH",
        reason: input.form.reason,
        reference: input.form.reference || undefined,
      }),
    onSuccess: () => {
      invalidateMoney();
      setRefundSource(null);
      setRefundForm(initialRefundForm);
    },
  });

  /* ── columns ──────────────────────────────────────────────────────────── */

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
        cell: ({ row }) => <StudentCell student={row.original.student} />,
      },
      { id: "term", header: "Term", cell: ({ row }) => row.original.term.name },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
      },
      {
        id: "totalAmount",
        header: "Total",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.totalAmount, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "paidAmount",
        header: "Paid",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.paidAmount, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "balanceAmount",
        header: "Outstanding",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.balanceAmount, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "dueDate",
        header: "Due Date",
        cell: ({ row }) => <NumericCell>{formatSchoolDate(row.original.dueDate)}</NumericCell>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const invoice = row.original;
          const settled =
            invoice.status === "PAID" ||
            invoice.status === "VOIDED" ||
            invoice.status === "WRITEOFF";
          const verbs: RecordVerb[] = [];

          if (invoice.status === "DRAFT") {
            verbs.push({
              label: "Issue",
              action: "issue",
              loading: issueInvoice.isPending,
              confirm: {
                title: `Issue ${invoice.invoiceNo}`,
                description: `${formatSchoolMoney(invoice.totalAmount, invoice.currency)} is added to the family's outstanding balance and the bill is posted to the ledger.`,
                confirmLabel: "Issue it",
              },
              onSelect: () => issueInvoice.mutate(invoice.id),
            });
          }
          verbs.push({
            label: "Edit",
            action: "edit",
            unavailable: settled ? "A settled bill cannot be edited." : undefined,
            onSelect: () => setInvoiceDialog({ open: true, record: invoice }),
          });
          if (invoice.status === "ISSUED" || invoice.status === "PART_PAID") {
            verbs.push({
              label: "Write off",
              action: "write-off",
              tone: "danger",
              onSelect: () => setWriteOffTarget(invoice),
            });
          }
          if (invoice.status === "DRAFT") {
            verbs.push({
              label: "Discard",
              action: "void",
              tone: "danger",
              loading: discardInvoice.isPending,
              confirm: {
                title: `Discard ${invoice.invoiceNo}`,
                description:
                  "The draft is deleted outright and its number is released. Nothing has reached the family, so nothing is withdrawn.",
                confirmLabel: "Discard it",
              },
              onSelect: () => discardInvoice.mutate(invoice.id),
            });
          }

          return (
            <div className="flex items-center justify-end gap-2">
              <RecordActions resource="schools.fees" verbs={verbs} />
              <PrintDocumentButton
                sourceKey="schools.fee.invoice"
                recordId={invoice.id}
                label="Print"
              />
            </div>
          );
        },
      },
    ],
    [issueInvoice, discardInvoice],
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
        cell: ({ row }) => <StudentCell student={row.original.student} />,
      },
      {
        id: "paymentMethod",
        header: "Payment Method",
        cell: ({ row }) => row.original.paymentMethod.replaceAll("_", " "),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <ReceiptStatusBadge status={row.original.status} />,
      },
      {
        id: "amountReceived",
        header: "Received",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.amountReceived, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "amountAllocated",
        header: "Allocated",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.amountAllocated, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "amountUnallocated",
        header: "Unallocated",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.amountUnallocated, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "receiptDate",
        header: "Receipt Date",
        cell: ({ row }) => (
          <NumericCell>{formatSchoolDate(row.original.receiptDate)}</NumericCell>
        ),
      },
      {
        id: "fiscal",
        header: "Fiscal",
        cell: ({ row }) => <FiscalBadge fiscal={row.original.fiscalReceipt} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const receipt = row.original;
          const verbs: RecordVerb[] = [];

          if (receipt.status !== "VOIDED") {
            verbs.push({
              label: "Void",
              action: "void",
              tone: "danger",
              onSelect: () => setVoidTarget(receipt),
            });
            // S-2.7. The fiscal number is what a parent quotes back; a receipt
            // that never reached ZIMRA is re-sent from here rather than from
            // the accounting replay endpoint no bursar can reach.
            verbs.push({
              label: receipt.fiscalReceipt?.fiscalNumber ? "Re-send to ZIMRA" : "Fiscalise",
              action: "issue",
              loading: fiscaliseReceipt.isPending,
              onSelect: () => fiscaliseReceipt.mutate(receipt.id),
            });
          }

          return (
            <div className="flex items-center justify-end gap-2">
              <RecordActions resource="schools.fees" verbs={verbs} />
              <PrintDocumentButton
                sourceKey="schools.fee.receipt"
                recordId={receipt.id}
                label="Print"
              />
            </div>
          );
        },
      },
    ],
    [fiscaliseReceipt],
  );

  const creditColumns = useMemo<ColumnDef<SchoolFeeCreditRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => <StudentCell student={row.original.student} />,
      },
      {
        id: "source",
        header: "From",
        cell: ({ row }) => (
          <div>
            <NumericCell align="left">{row.original.reference}</NumericCell>
            <div className="text-xs text-muted-foreground">
              {row.original.kind === "RECEIPT" ? "Overpayment" : "Over-settled bill"}
            </div>
          </div>
        ),
      },
      {
        id: "credit",
        header: "Credit",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.credit, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "heldForRefund",
        header: "Held for refund",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.heldForRefund, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "available",
        header: "Available",
        cell: ({ row }) => (
          <NumericCell className="font-medium">
            {formatSchoolMoney(row.original.available, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "date",
        header: "Since",
        cell: ({ row }) => <NumericCell>{formatSchoolDate(row.original.date)}</NumericCell>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const credit = row.original;
          const spent = credit.available <= 0;
          const verbs: RecordVerb[] = [];

          // An invoice credit has no receipt to allocate from — it is already
          // sitting on the bill it over-settled. Only a receipt surplus moves.
          if (credit.kind === "RECEIPT") {
            verbs.push({
              label: "Allocate",
              action: "receive-payment",
              unavailable: spent ? "Every cent of this is already spoken for." : undefined,
              onSelect: () => {
                setCreditSource(credit);
                setAllocateInvoiceId("");
                setAllocateAmount("");
              },
            });
          }
          verbs.push({
            label: "Refund",
            action: "refund",
            unavailable: spent ? "Every cent of this is already spoken for." : undefined,
            onSelect: () => {
              setRefundSource(credit);
              setRefundForm({ ...initialRefundForm, amount: credit.available.toFixed(2) });
            },
          });

          return (
            <div className="flex justify-end">
              <RecordActions resource="schools.fees" verbs={verbs} />
            </div>
          );
        },
      },
    ],
    [],
  );

  const refundColumns = useMemo<ColumnDef<SchoolFeeRefundRecord>[]>(
    () => [
      {
        id: "refundNo",
        header: "Refund No",
        cell: ({ row }) => <NumericCell align="left">{row.original.refundNo}</NumericCell>,
      },
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => <StudentCell student={row.original.student} />,
      },
      {
        id: "source",
        header: "From",
        cell: ({ row }) => (
          <NumericCell align="left">
            {row.original.receipt?.receiptNo ?? row.original.invoice?.invoiceNo ?? "—"}
          </NumericCell>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <RefundStatusBadge status={row.original.status} />,
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.amount, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "method",
        header: "Method",
        cell: ({ row }) =>
          PAYMENT_METHODS.find((method) => method.value === row.original.method)?.label ??
          row.original.method,
      },
      {
        id: "refundDate",
        header: "Requested",
        cell: ({ row }) => (
          <NumericCell>{formatSchoolDate(row.original.refundDate)}</NumericCell>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const refund = row.original;
          if (refund.status !== "REQUESTED") {
            return <span className="text-xs text-muted-foreground">No action left</span>;
          }
          return (
            <div className="flex justify-end">
              <RecordActions
                resource="schools.fees"
                verbs={[
                  {
                    label: "Pay",
                    action: "refund",
                    loading: payRefund.isPending,
                    confirm: {
                      title: `Pay ${refund.refundNo}`,
                      description: `${formatSchoolMoney(refund.amount, refund.currency)} leaves the school's account and the credit it was held against is spent.`,
                      confirmLabel: "Pay it",
                    },
                    onSelect: () => payRefund.mutate(refund.id),
                  },
                  {
                    label: "Cancel",
                    action: "refund",
                    tone: "danger",
                    onSelect: () => setCancelTarget(refund),
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [payRefund],
  );

  const waiverColumns = useMemo<ColumnDef<SchoolFeeWaiverRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => <StudentCell student={row.original.student} />,
      },
      {
        id: "waiverType",
        header: "Waiver Type",
        cell: ({ row }) =>
          WAIVER_TYPES.find((type) => type.value === row.original.waiverType)?.label ??
          row.original.waiverType,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <WaiverStatusBadge status={row.original.status} />,
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.amount, row.original.currency)}
          </NumericCell>
        ),
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
        cell: ({ row }) => <NumericCell>{formatSchoolDate(row.original.createdAt)}</NumericCell>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const waiver = row.original;
          const verbs: RecordVerb[] = [];

          if (waiver.status === "DRAFT") {
            verbs.push({
              label: "Approve",
              action: "waive",
              loading: approveWaiver.isPending,
              onSelect: () => approveWaiver.mutate(waiver.id),
            });
          }
          if (waiver.status === "DRAFT" || waiver.status === "APPROVED") {
            verbs.push({
              label: "Apply",
              action: "waive",
              loading: applyWaiver.isPending,
              confirm: {
                title: "Apply this waiver",
                description: `${formatSchoolMoney(waiver.amount, waiver.currency)} comes off ${waiver.invoice ? waiver.invoice.invoiceNo : "the oldest bill still owing for that term"}, and the family owes that much less.`,
                confirmLabel: "Apply it",
              },
              onSelect: () => applyWaiver.mutate(waiver.id),
            });
            verbs.push({
              label: "Reject",
              action: "waive",
              tone: "danger",
              onSelect: () => setRejectTarget(waiver),
            });
          }
          if (waiver.status === "APPLIED") {
            verbs.push({
              label: "Reverse",
              action: "waive",
              tone: "danger",
              onSelect: () => setReverseTarget(waiver),
            });
          }
          verbs.push({
            label: "Edit",
            action: "edit",
            unavailable:
              waiver.status === "DRAFT"
                ? undefined
                : "Only a draft can be re-typed. Reverse it and raise another.",
            onSelect: () => setWaiverDialog({ open: true, record: waiver }),
          });
          if (waiver.status === "DRAFT") {
            verbs.push({
              label: "Discard",
              action: "waive",
              tone: "danger",
              loading: discardWaiver.isPending,
              confirm: {
                title: "Discard this waiver",
                description:
                  "The draft is deleted outright. Nothing has come off a bill, so nothing is put back.",
                confirmLabel: "Discard it",
              },
              onSelect: () => discardWaiver.mutate(waiver.id),
            });
          }

          return (
            <div className="flex justify-end">
              <RecordActions resource="schools.fees" verbs={verbs} />
            </div>
          );
        },
      },
    ],
    [approveWaiver, applyWaiver, discardWaiver],
  );

  const structureColumns = useMemo<ColumnDef<SchoolFeeStructureRecord>[]>(
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
        cell: ({ row }) => <StructureStatusBadge status={row.original.status} />,
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
          <NumericCell>
            {formatSchoolMoney(row.original.totals?.amount ?? 0, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "mandatoryAmount",
        header: "Mandatory Amount",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(
              row.original.totals?.mandatoryAmount ?? 0,
              row.original.currency,
            )}
          </NumericCell>
        ),
      },
      {
        id: "currency",
        header: "Currency",
        cell: ({ row }) => <NumericCell align="left">{row.original.currency}</NumericCell>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const structure = row.original;
          const billed = structure._count.invoices > 0;
          const verbs: RecordVerb[] = [];

          if (structure.status === "DRAFT") {
            verbs.push({
              label: "Activate",
              action: "edit",
              loading: setStructureStatusMutation.isPending,
              confirm: {
                title: `Make ${structure.name} active`,
                description:
                  "Invoices can be raised against it from now on, and it appears in the bulk generator.",
                confirmLabel: "Make it active",
              },
              onSelect: () =>
                setStructureStatusMutation.mutate({
                  structureId: structure.id,
                  status: "ACTIVE",
                }),
            });
          }
          verbs.push({
            label: "Copy to…",
            action: "create",
            onSelect: () => setCopySource(structure),
          });
          verbs.push({
            label: "Edit",
            action: "edit",
            onSelect: () => setStructureDialog({ open: true, record: structure }),
          });
          if (structure.status !== "ARCHIVED") {
            verbs.push({
              label: "Archive",
              action: "edit",
              tone: "warning",
              loading: setStructureStatusMutation.isPending,
              confirm: {
                title: `Archive ${structure.name}`,
                description:
                  "It stops appearing when raising bills. Invoices already quoting it are untouched, and it can be made active again.",
                confirmLabel: "Archive it",
              },
              onSelect: () =>
                setStructureStatusMutation.mutate({
                  structureId: structure.id,
                  status: "ARCHIVED",
                }),
            });
          }
          verbs.push({
            label: "Delete",
            action: "archive",
            tone: "danger",
            loading: deleteStructure.isPending,
            unavailable: billed
              ? "Invoices quote this sheet. Archive it instead."
              : undefined,
            confirm: {
              title: `Delete ${structure.name}`,
              description:
                "The sheet and every line on it are removed for good. No bill quotes it, so nothing else changes.",
              confirmLabel: "Delete it",
            },
            onSelect: () => deleteStructure.mutate(structure.id),
          });

          return (
            <div className="flex justify-end">
              <RecordActions resource="schools.fees" verbs={verbs} />
            </div>
          );
        },
      },
    ],
    [setStructureStatusMutation, deleteStructure],
  );

  /* ── the page ─────────────────────────────────────────────────────────── */

  const summary = summaryQuery.data?.summary;
  const currency = summary?.currency ?? "USD";

  const loadError =
    summaryQuery.error ||
    invoicesQuery.error ||
    receiptsQuery.error ||
    creditsQuery.error ||
    refundsQuery.error ||
    waiversQuery.error ||
    structuresQuery.error;

  const caption = summary
    ? `${formatSchoolMoney(summary.outstandingBalance, currency)} outstanding · ${summary.issuedInvoices} unpaid`
    : undefined;

  /** The primary action belongs to the segment on screen, not to the page. */
  const primaryAction = (() => {
    if (activeView === "invoices") {
      return (
        <CreateButton
          resource="schools.fees"
          label="Create invoice"
          onSelect={() => setInvoiceDialog({ open: true, record: null })}
        />
      );
    }
    if (activeView === "receipts") {
      return (
        <CreateButton
          resource="schools.fees"
          label="Record receipt"
          action="receive-payment"
          onSelect={() => setReceiptDialogOpen(true)}
        />
      );
    }
    if (activeView === "waivers") {
      return (
        <CreateButton
          resource="schools.fees"
          label="New waiver"
          action="waive"
          onSelect={() => setWaiverDialog({ open: true, record: null })}
        />
      );
    }
    if (activeView === "structures") {
      return (
        <CreateButton
          resource="schools.fees"
          label="New fee sheet"
          onSelect={() => setStructureDialog({ open: true, record: null })}
        />
      );
    }
    // Credits and refunds are both raised from a credit row rather than from a
    // blank form: a refund with no named source is the thing S-2.6 refuses.
    return undefined;
  })();

  const secondaryActions =
    activeView === "invoices" ? (
      <Button variant="outline" onClick={() => setBulkGenerateOpen(true)}>
        Bulk generate
      </Button>
    ) : undefined;

  return (
    <div className="space-y-4">
      <PageHeading
        title="Fee ledger"
        description={caption}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
      />

      <PageBand
        chips={[
          {
            label: "Outstanding",
            value: formatSchoolMoney(summary?.outstandingBalance ?? 0, currency),
            tone: "danger",
          },
          // The figure behind this counts ISSUED and PART_PAID — invoices still
          // owing something. It was labelled "Issued Invoices", which read as
          // nought beside three invoices that had been issued and paid.
          { label: "Unpaid invoices", value: summary?.issuedInvoices ?? 0 },
          { label: "Posted receipts", value: summary?.receiptsPosted ?? 0, tone: "success" },
          {
            label: "Applied waivers",
            value: formatSchoolMoney(summary?.waivedAmount ?? 0, currency),
          },
          // S-2.5. Money the school is holding that belongs to families. It sits
          // beside the arrears deliberately: a school can be owed and owing at
          // once, and a bursar chasing the first should see the second.
          {
            label: "Credit on account",
            value: formatSchoolMoney(summary?.creditOnAccount ?? 0, currency),
            tone: "warn",
          },
        ]}
      />

      {loadError ? (
        <LoadError
          what="the fee ledger"
          error={loadError}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["schools", "fees"] })}
        />
      ) : null}

      <VerticalDataViews
        items={[
          {
            id: "invoices",
            label: "Invoices",
            count: invoicesQuery.data?.pagination.total ?? invoices.length,
          },
          {
            id: "receipts",
            label: "Receipts",
            count: receiptsQuery.data?.pagination.total ?? receipts.length,
          },
          {
            id: "credits",
            label: "Credits",
            count: creditsQuery.data?.pagination.total ?? credits.length,
          },
          {
            id: "refunds",
            label: "Refunds",
            count: refundsQuery.data?.pagination.total ?? refunds.length,
          },
          {
            id: "waivers",
            label: "Waivers",
            count: waiversQuery.data?.pagination.total ?? waivers.length,
          },
          {
            id: "structures",
            label: "Fee structures",
            count: structuresQuery.data?.pagination.total ?? structures.length,
          },
        ]}
        value={activeView}
        onValueChange={changeView}
        railLabel="Fee views"
      >
        {/* ── invoices ─────────────────────────────────────────────────── */}
        <div className={activeView === "invoices" ? "space-y-3" : "hidden"}>
          <h2 className="text-section-title">Fee invoices</h2>
          <FilterBar>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={invoiceClass}
              options={classOptions}
              onChange={setInvoiceClass}
            />
            <FilterSelect
              label="Term"
              allLabel="Every term"
              value={invoiceTerm}
              options={termOptions}
              onChange={setInvoiceTerm}
            />
            <FilterSelect
              label="Status"
              allLabel="Any status"
              value={invoiceStatus}
              options={INVOICE_STATUSES}
              onChange={setInvoiceStatus}
            />
            <div className="min-w-0 basis-[150px]">
              <Label htmlFor="invoice-due-from" className="text-sm text-muted-foreground">
                Due from
              </Label>
              <Input
                id="invoice-due-from"
                type="date"
                value={invoiceDueFrom}
                onChange={(event) => setInvoiceDueFrom(event.target.value)}
              />
            </div>
            <div className="min-w-0 basis-[150px]">
              <Label htmlFor="invoice-due-to" className="text-sm text-muted-foreground">
                Due to
              </Label>
              <Input
                id="invoice-due-to"
                type="date"
                value={invoiceDueTo}
                onChange={(event) => setInvoiceDueTo(event.target.value)}
              />
            </div>
            <div className="min-w-0 basis-[150px]">
              <Label htmlFor="invoice-min" className="text-sm text-muted-foreground">
                Owing at least
              </Label>
              <Input
                id="invoice-min"
                type="number"
                step="0.01"
                min="0"
                placeholder="Any amount"
                value={invoiceMinOutstanding}
                onChange={(event) => setInvoiceMinOutstanding(event.target.value)}
              />
            </div>
          </FilterBar>

          <PageNote
            shown={invoices.length}
            total={invoicesQuery.data?.pagination.total ?? invoices.length}
            onNarrow={clearInvoiceFilters}
          />

          <DataTable
            data={invoices}
            columns={invoiceColumns}
            searchPlaceholder="Search invoices"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              invoicesQuery.isPending ? (
                <TableRowsSkeleton
                  columns={[{ width: 120 }, { avatar: true, twoLine: true }, {}, { width: 90 }]}
                />
              ) : invoiceClass || invoiceTerm || invoiceStatus || invoiceDueFrom || invoiceDueTo || invoiceMinOutstanding ? (
                <NothingMatched
                  what="invoices"
                  filters={[
                    classOptions.find((option) => option.value === invoiceClass)?.label ?? "",
                    termOptions.find((option) => option.value === invoiceTerm)?.label ?? "",
                    INVOICE_STATUSES.find((option) => option.value === invoiceStatus)?.label ??
                      "",
                  ]}
                  onClear={clearInvoiceFilters}
                />
              ) : (
                <NothingYet
                  title="No bills raised yet"
                  body="Raise one for a single pupil, or generate a term's worth from a fee sheet."
                  action={
                    <CreateButton
                      resource="schools.fees"
                      label="Create invoice"
                      onSelect={() => setInvoiceDialog({ open: true, record: null })}
                    />
                  }
                />
              )
            }
          />
        </div>

        {/* ── receipts ─────────────────────────────────────────────────── */}
        <div className={activeView === "receipts" ? "space-y-3" : "hidden"}>
          <h2 className="text-section-title">Fee receipts</h2>
          <FilterBar>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={receiptClass}
              options={classOptions}
              onChange={setReceiptClass}
            />
            <FilterSelect
              label="Status"
              allLabel="Any status"
              value={receiptStatus}
              options={RECEIPT_STATUSES}
              onChange={setReceiptStatus}
            />
            <div className="min-w-0 basis-[150px]">
              <Label htmlFor="receipt-from" className="text-sm text-muted-foreground">
                Received from
              </Label>
              <Input
                id="receipt-from"
                type="date"
                value={receiptFrom}
                onChange={(event) => setReceiptFrom(event.target.value)}
              />
            </div>
            <div className="min-w-0 basis-[150px]">
              <Label htmlFor="receipt-to" className="text-sm text-muted-foreground">
                Received to
              </Label>
              <Input
                id="receipt-to"
                type="date"
                value={receiptTo}
                onChange={(event) => setReceiptTo(event.target.value)}
              />
            </div>
          </FilterBar>

          <PageNote
            shown={receipts.length}
            total={receiptsQuery.data?.pagination.total ?? receipts.length}
          />

          <DataTable
            data={receipts}
            columns={receiptColumns}
            searchPlaceholder="Search receipts"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              receiptsQuery.isPending ? (
                <TableRowsSkeleton
                  columns={[{ width: 120 }, { avatar: true, twoLine: true }, {}, { width: 90 }]}
                />
              ) : receiptClass || receiptStatus || receiptFrom || receiptTo ? (
                <NothingMatched
                  what="receipts"
                  onClear={() => {
                    setReceiptClass("");
                    setReceiptStatus("");
                    setReceiptFrom("");
                    setReceiptTo("");
                  }}
                />
              ) : (
                <NothingYet
                  title="No money taken yet"
                  body="A receipt is recorded against the bill it settles."
                  action={
                    <CreateButton
                      resource="schools.fees"
                      label="Record receipt"
                      action="receive-payment"
                      onSelect={() => setReceiptDialogOpen(true)}
                    />
                  }
                />
              )
            }
          />
        </div>

        {/* ── credits ──────────────────────────────────────────────────── */}
        <div className={activeView === "credits" ? "space-y-3" : "hidden"}>
          <h2 className="text-section-title">Credit on account</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Money the school is holding that belongs to families — an overpayment, or a bill
            settled beyond its total. Spend it on another invoice, or hand it back.
          </p>
          <FilterBar>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={creditClass}
              options={classOptions}
              onChange={setCreditClass}
            />
            <FilterSelect
              label="Source"
              allLabel="Either source"
              value={creditKind}
              options={CREDIT_KINDS}
              onChange={setCreditKind}
            />
          </FilterBar>

          {allocateCredit.error ? (
            <SaveError what="The credit" error={allocateCredit.error} />
          ) : null}

          <DataTable
            data={credits}
            columns={creditColumns}
            searchPlaceholder="Search credits"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              creditsQuery.isPending ? (
                <TableRowsSkeleton
                  columns={[{ avatar: true, twoLine: true }, {}, { width: 90 }]}
                />
              ) : creditClass || creditKind ? (
                <NothingMatched
                  what="credits"
                  onClear={() => {
                    setCreditClass("");
                    setCreditKind("");
                  }}
                />
              ) : (
                <NothingYet
                  title="No credit on account"
                  body="Every payment so far has settled a bill exactly."
                />
              )
            }
          />
        </div>

        {/* ── refunds ──────────────────────────────────────────────────── */}
        <div className={activeView === "refunds" ? "space-y-3" : "hidden"}>
          <h2 className="text-section-title">Refunds</h2>
          <FilterBar>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={refundClass}
              options={classOptions}
              onChange={setRefundClass}
            />
            <FilterSelect
              label="Status"
              allLabel="Any status"
              value={refundStatus}
              options={REFUND_STATUSES}
              onChange={setRefundStatus}
            />
          </FilterBar>

          {payRefund.error ? <SaveError what="The refund" error={payRefund.error} /> : null}

          <DataTable
            data={refunds}
            columns={refundColumns}
            searchPlaceholder="Search refunds"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              refundsQuery.isPending ? (
                <TableRowsSkeleton
                  columns={[{ width: 120 }, { avatar: true, twoLine: true }, { width: 90 }]}
                />
              ) : refundClass || refundStatus ? (
                <NothingMatched
                  what="refunds"
                  onClear={() => {
                    setRefundClass("");
                    setRefundStatus("");
                  }}
                />
              ) : (
                <NothingYet
                  title="No refunds"
                  body="A refund is always drawn against a named credit — start one from the Credits tab."
                />
              )
            }
          />
        </div>

        {/* ── waivers ──────────────────────────────────────────────────── */}
        <div className={activeView === "waivers" ? "space-y-3" : "hidden"}>
          <h2 className="text-section-title">Fee waivers</h2>
          <p className="text-sm text-[var(--text-muted)]">
            A waiver is decided, then applied. Nothing comes off a bill until it is applied,
            and an applied one can be reversed if it landed on the wrong invoice.
          </p>
          <FilterBar>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={waiverClass}
              options={classOptions}
              onChange={setWaiverClass}
            />
            <FilterSelect
              label="Term"
              allLabel="Every term"
              value={waiverTerm}
              options={termOptions}
              onChange={setWaiverTerm}
            />
            <FilterSelect
              label="Status"
              allLabel="Any status"
              value={waiverStatus}
              options={WAIVER_STATUSES}
              onChange={setWaiverStatus}
            />
            <FilterSelect
              label="Type"
              allLabel="Any type"
              value={waiverType}
              options={WAIVER_TYPES}
              onChange={setWaiverType}
            />
          </FilterBar>

          <DataTable
            data={waivers}
            columns={waiverColumns}
            searchPlaceholder="Search waivers"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              waiversQuery.isPending ? (
                <TableRowsSkeleton
                  columns={[{ avatar: true, twoLine: true }, {}, { width: 90 }]}
                />
              ) : waiverClass || waiverTerm || waiverStatus || waiverType ? (
                <NothingMatched
                  what="waivers"
                  onClear={() => {
                    setWaiverClass("");
                    setWaiverTerm("");
                    setWaiverStatus("");
                    setWaiverType("");
                  }}
                />
              ) : (
                <NothingYet
                  title="No waivers on file"
                  body="A scholarship, a hardship discount or a one-off reduction all start here."
                  action={
                    <CreateButton
                      resource="schools.fees"
                      label="New waiver"
                      action="waive"
                      onSelect={() => setWaiverDialog({ open: true, record: null })}
                    />
                  }
                />
              )
            }
          />
        </div>

        {/* ── fee structures ───────────────────────────────────────────── */}
        <div className={activeView === "structures" ? "space-y-3" : "hidden"}>
          <h2 className="text-section-title">Fee structures</h2>
          <p className="text-sm text-[var(--text-muted)]">
            A school opens with one fee sheet on the first year group. Copy it up the ladder
            rather than re-typing it — the copies arrive as drafts.
          </p>
          <FilterBar>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={structureClass}
              options={classOptions}
              onChange={setStructureClass}
            />
            <FilterSelect
              label="Term"
              allLabel="Every term"
              value={structureTerm}
              options={termOptions}
              onChange={setStructureTerm}
            />
            <FilterSelect
              label="Status"
              allLabel="Any status"
              value={structureStatus}
              options={STRUCTURE_STATUSES}
              onChange={setStructureStatus}
            />
          </FilterBar>

          {setStructureStatusMutation.error ? (
            <SaveError what="The fee sheet" error={setStructureStatusMutation.error} />
          ) : null}
          {deleteStructure.error ? (
            <SaveError what="The fee sheet" error={deleteStructure.error} />
          ) : null}

          <DataTable
            data={structures}
            columns={structureColumns}
            searchPlaceholder="Search fee structures"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              structuresQuery.isPending ? (
                <TableRowsSkeleton columns={[{ twoLine: true }, {}, { width: 90 }]} />
              ) : structureClass || structureTerm || structureStatus ? (
                <NothingMatched
                  what="fee sheets"
                  onClear={() => {
                    setStructureClass("");
                    setStructureTerm("");
                    setStructureStatus("");
                  }}
                />
              ) : (
                <NothingYet
                  title="No fee sheets yet"
                  body="Price one year group's term, then copy it up the ladder."
                  action={
                    <CreateButton
                      resource="schools.fees"
                      label="New fee sheet"
                      onSelect={() => setStructureDialog({ open: true, record: null })}
                    />
                  }
                />
              )
            }
          />
        </div>
      </VerticalDataViews>

      {/* ── the forms ────────────────────────────────────────────────────── */}

      <InvoiceFormDialog
        open={invoiceDialog.open}
        onOpenChange={(open) => setInvoiceDialog((current) => ({ ...current, open }))}
        invoice={invoiceDialog.record}
      />
      <ReceiptFormDialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen} />
      <WaiverFormDialog
        open={waiverDialog.open}
        onOpenChange={(open) => setWaiverDialog((current) => ({ ...current, open }))}
        waiver={waiverDialog.record}
      />
      <StructureFormDialog
        open={structureDialog.open}
        onOpenChange={(open) => setStructureDialog((current) => ({ ...current, open }))}
        structure={structureDialog.record}
      />
      <BulkGenerateInvoicesDialog open={bulkGenerateOpen} onOpenChange={setBulkGenerateOpen} />
      <CopyStructureDialog
        structure={copySource}
        open={copySource !== null}
        onOpenChange={(open) => {
          if (!open) setCopySource(null);
        }}
      />

      {/* ── the destructive verbs ────────────────────────────────────────── */}

      <ReasonDialog
        open={writeOffTarget !== null}
        onOpenChange={(open) => {
          if (!open) setWriteOffTarget(null);
        }}
        title={writeOffTarget ? `Write off ${writeOffTarget.invoiceNo}` : "Write off"}
        consequence={
          writeOffTarget
            ? `${formatSchoolMoney(writeOffTarget.balanceAmount, writeOffTarget.currency)} stops being owed and is posted to the ledger as a loss. The bill keeps its number and the family is not chased again.`
            : null
        }
        reasonLabel="Reason"
        keepLabel="Keep chasing it"
        confirmLabel="Write it off"
        pendingLabel="Writing off…"
        pending={writeOffInvoice.isPending}
        error={writeOffInvoice.error}
        onConfirm={(reason) =>
          writeOffTarget &&
          writeOffInvoice.mutate({ invoiceId: writeOffTarget.id, reason })
        }
      />

      <ReasonDialog
        open={voidTarget !== null}
        onOpenChange={(open) => {
          if (!open) setVoidTarget(null);
        }}
        title={voidTarget ? `Void ${voidTarget.receiptNo}` : "Void receipt"}
        consequence={
          voidTarget
            ? `${formatSchoolMoney(voidTarget.amountReceived, voidTarget.currency)} is unwound: every invoice this receipt settled goes back to owing, and any surplus stops being credit. This cannot be undone.`
            : null
        }
        reasonLabel="Reason"
        keepLabel="Keep it posted"
        confirmLabel="Void the receipt"
        pendingLabel="Voiding…"
        pending={voidReceipt.isPending}
        error={voidReceipt.error}
        onConfirm={(reason) =>
          voidTarget && voidReceipt.mutate({ receiptId: voidTarget.id, reason })
        }
      />

      <ReasonDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        title="Reject this waiver"
        consequence={
          rejectTarget
            ? `${formatSchoolMoney(rejectTarget.amount, rejectTarget.currency)} will not come off ${rejectTarget.student.firstName} ${rejectTarget.student.lastName}'s bill. The waiver stays on file with the decision on it.`
            : null
        }
        reasonLabel="Reason"
        keepLabel="Leave it open"
        confirmLabel="Reject it"
        pendingLabel="Rejecting…"
        pending={rejectWaiver.isPending}
        error={rejectWaiver.error}
        onConfirm={(reason) =>
          rejectTarget && rejectWaiver.mutate({ waiverId: rejectTarget.id, reason })
        }
      />

      <ReasonDialog
        open={reverseTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReverseTarget(null);
        }}
        title="Reverse this waiver"
        consequence={
          reverseTarget
            ? `${formatSchoolMoney(reverseTarget.amount, reverseTarget.currency)} goes back onto ${reverseTarget.invoice?.invoiceNo ?? "the bill it discounted"}, and the family owes it again.`
            : null
        }
        reasonLabel="Reason"
        keepLabel="Leave it applied"
        confirmLabel="Reverse it"
        pendingLabel="Reversing…"
        pending={reverseWaiver.isPending}
        error={reverseWaiver.error}
        onConfirm={(reason) =>
          reverseTarget && reverseWaiver.mutate({ waiverId: reverseTarget.id, reason })
        }
      />

      <ReasonDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title={cancelTarget ? `Cancel refund ${cancelTarget.refundNo}` : "Cancel refund"}
        consequence={
          cancelTarget
            ? `This releases ${formatSchoolMoney(cancelTarget.amount, cancelTarget.currency)} back to the family's credit.`
            : null
        }
        reasonLabel="Reason"
        keepLabel="Keep it"
        confirmLabel="Cancel refund"
        pendingLabel="Cancelling…"
        pending={cancelRefund.isPending}
        error={cancelRefund.error}
        onConfirm={(reason) =>
          cancelTarget && cancelRefund.mutate({ refundId: cancelTarget.id, reason })
        }
      />

      {/* ── spending and returning a credit ──────────────────────────────── */}

      <RecordDialog
        open={creditSource !== null}
        onOpenChange={(open) => {
          if (!open) setCreditSource(null);
        }}
        title="Allocate credit"
        description={
          creditSource
            ? `${formatSchoolMoney(creditSource.available, creditSource.currency)} from ${creditSource.reference}, held for ${creditSource.student.firstName} ${creditSource.student.lastName}.`
            : undefined
        }
        size="md"
        onSubmit={(event) => {
          event.preventDefault();
          if (!creditSource || !allocateInvoiceId) return;
          allocateCredit.mutate({
            receiptId: creditSource.sourceId,
            invoiceId: allocateInvoiceId,
            amount: allocateAmount,
          });
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCreditSource(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={allocateCredit.isPending}>
              {allocateCredit.isPending ? "Allocating…" : "Allocate"}
            </Button>
          </>
        }
      >
        {allocateCredit.error ? (
          <SaveError what="The credit" error={allocateCredit.error} />
        ) : null}
        <InvoicePicker
          value={allocateInvoiceId}
          onChange={setAllocateInvoiceId}
          studentId={creditSource?.student.id}
          required
        />
        <div className="field">
          <Label htmlFor="allocate-amount">Amount</Label>
          <Input
            id="allocate-amount"
            type="number"
            step="0.01"
            min="0.01"
            max={creditSource?.available ?? undefined}
            value={allocateAmount}
            onChange={(event) => setAllocateAmount(event.target.value)}
            aria-describedby="allocate-amount-help"
          />
          <p
            id="allocate-amount-help"
            className="mt-1 text-[length:var(--type-caption)] text-[color:var(--text-muted)]"
          >
            Leave blank to settle as much of the invoice as the credit covers.
          </p>
        </div>
      </RecordDialog>

      <RecordDialog
        open={refundSource !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRefundSource(null);
            setRefundForm(initialRefundForm);
          }
        }}
        title="Refund credit"
        description={
          refundSource
            ? `${formatSchoolMoney(refundSource.available, refundSource.currency)} available from ${refundSource.reference}. Requesting holds it; it is not paid until you settle the refund.`
            : undefined
        }
        size="md"
        onSubmit={(event) => {
          event.preventDefault();
          if (!refundSource || !refundForm.amount || !refundForm.reason) return;
          requestRefund.mutate({ source: refundSource, form: refundForm });
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRefundSource(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={requestRefund.isPending}>
              {requestRefund.isPending ? "Requesting…" : "Request refund"}
            </Button>
          </>
        }
      >
        {requestRefund.error ? (
          <SaveError what="The refund" error={requestRefund.error} />
        ) : null}
        <div className="field">
          <Label htmlFor="refund-amount">
            Amount <span className="text-[color:var(--tone-danger)]">*</span>
          </Label>
          <Input
            id="refund-amount"
            type="number"
            step="0.01"
            min="0.01"
            max={refundSource?.available ?? undefined}
            value={refundForm.amount}
            onChange={(event) =>
              setRefundForm((form) => ({ ...form, amount: event.target.value }))
            }
            required
          />
        </div>
        <DsSelect
          id="refund-method"
          label="Method"
          value={refundForm.method}
          onChange={(event) =>
            setRefundForm((form) => ({ ...form, method: event.target.value }))
          }
          required
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </DsSelect>
        <div className="field">
          <Label htmlFor="refund-reason">
            Reason <span className="text-[color:var(--tone-danger)]">*</span>
          </Label>
          <Input
            id="refund-reason"
            value={refundForm.reason}
            onChange={(event) =>
              setRefundForm((form) => ({ ...form, reason: event.target.value }))
            }
            required
          />
        </div>
        <div className="field">
          <Label htmlFor="refund-reference">Reference</Label>
          <Input
            id="refund-reference"
            value={refundForm.reference}
            onChange={(event) =>
              setRefundForm((form) => ({ ...form, reference: event.target.value }))
            }
          />
        </div>
      </RecordDialog>

      {/* A verb that failed says so, wherever it was pressed from. */}
      {issueInvoice.error ? (
        <Alert tone="danger" title="The invoice was not issued">
          {getApiErrorMessage(issueInvoice.error)}
        </Alert>
      ) : null}
      {fiscaliseReceipt.error ? (
        <Alert tone="danger" title="The receipt did not reach ZIMRA">
          {getApiErrorMessage(fiscaliseReceipt.error)}
        </Alert>
      ) : null}
      {applyWaiver.error ? (
        <Alert tone="danger" title="The waiver was not applied">
          {getApiErrorMessage(applyWaiver.error)}
        </Alert>
      ) : null}
    </div>
  );
}
