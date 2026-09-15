"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// The repo's `components/ui/select` is the Radix compound API, which is the
// wrong shape for a four-option picker; its own header says to reach for the DS
// component when a plain options list is all that is wanted.
import {
  Alert,
  Chip,
  MobileList,
  MobileListChevron,
  Select as DsSelect,
} from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand, type BandChip } from "@/components/schools/common/page-band";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import { SendNoticeDialog } from "@/components/schools/common/send-notice-dialog";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
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
import { SlidersHorizontal } from "@/lib/icons";
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

import { BulkGenerateInvoicesDialog } from "@/components/schools/fees/bulk-generate-invoices-dialog";
import { CopyStructureDialog } from "@/components/schools/fees/copy-structure-dialog";
import { InvoicePicker } from "@/components/schools/fees/fee-pickers";
import {
  InvoiceFormDialog,
  ReasonDialog,
  ReceiptFormDialog,
  StructureFormDialog,
  WaiverFormDialog,
} from "@/components/schools/fees/fee-dialogs";
import {
  FiscalBadge,
  InvoiceStatusBadge,
  ReceiptStatusBadge,
  RefundStatusBadge,
  StructureStatusBadge,
  WaiverStatusBadge,
} from "@/components/schools/fees/fee-status";
import { useIsMobile } from "@/hooks/use-mobile";

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

/** A `yyyy-mm-dd` filter value as a date the picker can hold, and back. */
function isoToDate(value: string) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

function dateToIso(value?: Date) {
  if (!value) return "";
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

/** Midnight today, for "is this bill past its due date". */
function todayIso() {
  return dateToIso(new Date());
}

/**
 * Every filter for a view, behind one control.
 *
 * Six of them in a row was the whole first screen of a phone: the ledger
 * opened on its own chrome and not one invoice. The count is what makes the
 * fold safe — a filter you cannot see is a filter you forget is set, and a
 * bursar ringing a family about a bill that is not in the list because Term 1
 * is still selected is the failure this replaces.
 */
/**
 * The filters, inline where there is room and behind one control where there
 * is not.
 *
 * The ledger's six filters pushed the first invoice off the bottom of a phone,
 * which is the fault this fixes. On a desktop there is room for them and
 * hiding them behind a sheet would cost a press for nothing, so the sheet is a
 * phone affordance rather than the layout.
 */
function FilterSheet({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const isPhone = useIsMobile();

  if (!isPhone) {
    return <>{children}</>;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Chip
          type="button"
          selected={count > 0}
          leading={<SlidersHorizontal className="size-3.5" aria-hidden="true" />}
          trailing={count > 0 ? <span className="tabular-nums">{count}</span> : undefined}
        >
          Filter
        </Chip>
      </SheetTrigger>
      {/* A sheet rather than a menu: these controls are selects and date
          popovers of their own, and a menu that closes the moment one of them
          opens is a menu you cannot use. */}
      <SheetContent side="bottom" size="md" className="p-4">
        <SheetHeader className="pb-3 text-left">
          <SheetTitle>Filter</SheetTitle>
        </SheetHeader>
        <div className="stacked-controls flex flex-col items-stretch gap-3">
          {children}
        </div>
      </SheetContent>
    </Sheet>
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
  // Overdue is not a status the ledger stores — it is a bill past its due date
  // with something still on it — so it is a filter here rather than a seventh
  // badge competing with the six the API actually has.
  const [invoiceOverdue, setInvoiceOverdue] = useState(false);

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
    setInvoiceOverdue(false);
  };

  const invoiceFilterCount = [
    invoiceClass,
    invoiceTerm,
    invoiceStatus,
    invoiceDueFrom,
    invoiceDueTo,
    invoiceMinOutstanding,
  ].filter(Boolean).length;

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
    const today = todayIso();
    return rows.filter((invoice) => {
      // Money crosses JSON as a number here — `successResponse` serialises every
      // Decimal on the way out — so this is arithmetic, not a string compare.
      if (minOutstanding !== null && invoice.balanceAmount < minOutstanding) return false;
      const due = invoice.dueDate.slice(0, 10);
      if (invoiceDueFrom && due < invoiceDueFrom) return false;
      if (invoiceDueTo && due > invoiceDueTo) return false;
      if (invoiceOverdue && !(invoice.balanceAmount > 0 && due < today)) return false;
      return true;
    });
  }, [
    invoicesQuery.data,
    invoiceMinOutstanding,
    invoiceDueFrom,
    invoiceDueTo,
    invoiceOverdue,
  ]);

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
  const [receiptDialog, setReceiptDialog] = useState<{
    open: boolean;
    invoiceId?: string;
  }>({ open: false });
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

  /** The invoices a reminder is being written to, from the selection bar. */
  const [remindRows, setRemindRows] = useState<SchoolFeeInvoiceRecord[] | null>(null);
  const clearSelectedInvoices = useRef<(() => void) | null>(null);

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
          /*
            The verb the row is about stays on the row; the rest fold into the
            menu. Rendering all four inline put "Print" — and on a narrower
            window "Write off" too — past the right edge of the table.
          */
          let primary: RecordVerb | null = null;
          const verbs: RecordVerb[] = [];

          if (invoice.status === "DRAFT") {
            primary = {
              label: "Issue",
              action: "issue",
              loading: issueInvoice.isPending,
              confirm: {
                title: `Issue ${invoice.invoiceNo}`,
                description: `${formatSchoolMoney(invoice.totalAmount, invoice.currency)} is added to the family's outstanding balance and the bill is posted to the ledger.`,
                confirmLabel: "Issue it",
              },
              onSelect: () => issueInvoice.mutate(invoice.id),
            };
          }
          if (invoice.status === "ISSUED" || invoice.status === "PART_PAID") {
            primary = {
              label: "Take payment",
              action: "receive-payment",
              onSelect: () => setReceiptDialog({ open: true, invoiceId: invoice.id }),
            };
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
              {primary ? (
                <RecordActions resource="schools.fees" verbs={[primary]} />
              ) : null}
              <RecordActions layout="menu" resource="schools.fees" verbs={verbs} />
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
        cell: ({ row }) =>
          PAYMENT_METHODS.find((method) => method.value === row.original.paymentMethod)
            ?.label ?? row.original.paymentMethod,
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
              <RecordActions layout="menu" resource="schools.fees" verbs={verbs} />
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
              <RecordActions layout="menu" resource="schools.fees" verbs={verbs} />
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
            <div className="flex items-center justify-end gap-2">
              {/* Paying it is why a requested refund is on the screen. */}
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
                ]}
              />
              <RecordActions
                layout="menu"
                resource="schools.fees"
                verbs={[
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
          /*
            A waiver arrives asking for a decision, so the decision stays on the
            row and the other five verbs fold into the menu — six inline buttons
            was the widest cell on the ledger.
          */
          let primary: RecordVerb | null = null;
          const verbs: RecordVerb[] = [];

          if (waiver.status === "DRAFT") {
            primary = {
              label: "Approve",
              action: "waive",
              loading: approveWaiver.isPending,
              onSelect: () => approveWaiver.mutate(waiver.id),
            };
          }
          if (waiver.status === "DRAFT" || waiver.status === "APPROVED") {
            const apply: RecordVerb = {
              label: "Apply",
              action: "waive",
              loading: applyWaiver.isPending,
              confirm: {
                title: "Apply this waiver",
                description: `${formatSchoolMoney(waiver.amount, waiver.currency)} comes off ${waiver.invoice ? waiver.invoice.invoiceNo : "the oldest bill still owing for that term"}, and the family owes that much less.`,
                confirmLabel: "Apply it",
              },
              onSelect: () => applyWaiver.mutate(waiver.id),
            };
            if (primary) {
              verbs.push(apply);
            } else {
              primary = apply;
            }
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
            <div className="flex items-center justify-end gap-2">
              {primary ? (
                <RecordActions resource="schools.fees" verbs={[primary]} />
              ) : null}
              <RecordActions layout="menu" resource="schools.fees" verbs={verbs} />
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
          // A draft sheet exists to be made active; everything else a sheet can
          // have done to it is occasional, so it lives in the menu.
          let primary: RecordVerb | null = null;
          const verbs: RecordVerb[] = [];

          if (structure.status === "DRAFT") {
            primary = {
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
            };
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
            <div className="flex items-center justify-end gap-2">
              {primary ? (
                <RecordActions resource="schools.fees" verbs={[primary]} />
              ) : null}
              <RecordActions layout="menu" resource="schools.fees" verbs={verbs} />
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

  const access = useSchoolAccess();
  const canNotifyFamilies = access.can("schools.reports", "notify-families");
  const canTakePayment = access.can("schools.fees", "receive-payment");

  /*
    Two figures, and the two that belong to the segment on screen. Five chips
    over three rows is what the ledger used to open with on a phone, and none
    of them was about the view underneath.
  */
  const bandChips = useMemo<BandChip[]>(() => {
    if (activeView === "receipts") {
      return [
        { label: "Posted receipts", value: summary?.receiptsPosted ?? 0, tone: "success" },
        {
          label: "Credit on account",
          value: formatSchoolMoney(summary?.creditOnAccount ?? 0, currency),
          tone: "warn",
        },
      ];
    }
    if (activeView === "credits") {
      return [
        {
          label: "Credit on account",
          value: formatSchoolMoney(summary?.creditOnAccount ?? 0, currency),
          tone: "warn",
        },
        {
          label: "Held for refund",
          value: formatSchoolMoney(
            credits.reduce((sum, credit) => sum + credit.heldForRefund, 0),
            currency,
          ),
        },
      ];
    }
    if (activeView === "refunds") {
      const awaiting = refunds.filter((refund) => refund.status === "REQUESTED");
      return [
        { label: "Awaiting payment", value: awaiting.length, tone: "warn" },
        {
          label: "Owed back",
          value: formatSchoolMoney(
            awaiting.reduce((sum, refund) => sum + refund.amount, 0),
            currency,
          ),
        },
      ];
    }
    if (activeView === "waivers") {
      return [
        {
          label: "Applied waivers",
          value: formatSchoolMoney(summary?.waivedAmount ?? 0, currency),
          tone: "success",
        },
        {
          label: "Awaiting a decision",
          value: waivers.filter((waiver) => waiver.status === "DRAFT").length,
          tone: "warn",
        },
      ];
    }
    if (activeView === "structures") {
      return [
        { label: "Active", value: summary?.activeStructures ?? 0, tone: "success" },
        {
          label: "Drafts",
          value: structures.filter((structure) => structure.status === "DRAFT").length,
        },
      ];
    }
    return [
      {
        label: "Outstanding",
        value: formatSchoolMoney(summary?.outstandingBalance ?? 0, currency),
        tone: "danger",
      },
      // The figure behind this counts ISSUED and PART_PAID — invoices still
      // owing something. It was labelled "Issued Invoices", which read as
      // nought beside three invoices that had been issued and paid.
      { label: "Unpaid invoices", value: summary?.issuedInvoices ?? 0 },
    ];
  }, [activeView, credits, currency, refunds, structures, summary, waivers]);

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
          onSelect={() => setReceiptDialog({ open: true })}
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
      {/* The bar names the page; the band carries state. The heading and the
          caption under it were a third and fourth copy of both, and on a phone
          they cost the screen the first invoice was meant to be on. */}
      <PageChrome title="Fee ledger">
        {secondaryActions}
        {primaryAction}
      </PageChrome>

      <PageBand chips={bandChips} />

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
          <div className="flex flex-wrap items-center gap-2">
            <FilterSheet count={invoiceFilterCount}>
              <FilterSelect
                className="min-w-0"
                label="Year group"
                allLabel="Every year group"
                value={invoiceClass}
                options={classOptions}
                onChange={setInvoiceClass}
              />
              <FilterSelect
                className="min-w-0"
                label="Term"
                allLabel="Every term"
                value={invoiceTerm}
                options={termOptions}
                onChange={setInvoiceTerm}
              />
              <FilterSelect
                className="min-w-0"
                label="Status"
                allLabel="Any status"
                value={invoiceStatus}
                options={INVOICE_STATUSES}
                onChange={setInvoiceStatus}
              />
              <DatePicker
                label="Due from"
                placeholder="Any date"
                value={isoToDate(invoiceDueFrom)}
                onChange={(date) => setInvoiceDueFrom(dateToIso(date))}
              />
              <DatePicker
                label="Due to"
                placeholder="Any date"
                value={isoToDate(invoiceDueTo)}
                onChange={(date) => setInvoiceDueTo(dateToIso(date))}
              />
              <div className="field">
                <Label htmlFor="invoice-min">Owing at least</Label>
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
            </FilterSheet>
            <Chip
              type="button"
              aria-pressed={invoiceOverdue}
              selected={invoiceOverdue}
              onClick={() => setInvoiceOverdue((current) => !current)}
            >
              Overdue
            </Chip>
          </div>

          <DataTable
            data={invoices}
            columns={invoiceColumns}
            searchPlaceholder="Search invoices"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            rowSelection={{
              // The one bulk verb the API behind this screen can actually do:
              // `/api/v2/schools/notices` takes a list of pupils. Issuing and
              // printing are still one record at a time.
              bulkActions: ({ selectedRows, clearSelection }) => (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canNotifyFamilies}
                  title={
                    canNotifyFamilies
                      ? undefined
                      : "Writing to families is the office, the bursar or a class teacher to do."
                  }
                  onClick={() => {
                    clearSelectedInvoices.current = clearSelection;
                    setRemindRows(selectedRows);
                  }}
                >
                  Remind the {new Set(selectedRows.map((row) => row.student.id)).size}
                </Button>
              ),
            }}
            mobileListRenderer={({ rows }) => (
              <MobileList>
                {rows.map(({ row }) => {
                  // A bill with nothing on it has nothing to take, and a row
                  // that opens a form the reader may not submit is a chevron
                  // that lies. Both cases render as a flat row.
                  const owing = row.balanceAmount > 0 && row.status !== "DRAFT";
                  const takePayment = owing && canTakePayment;
                  return (
                    <MobileList.Row
                      key={row.id}
                      static={!takePayment}
                      title={`${row.student.lastName}, ${row.student.firstName}`}
                      subtitle={`${row.invoiceNo} · ${row.term.name} · due ${formatSchoolDate(row.dueDate)}`}
                      trailing={
                        <span className="flex items-center gap-2">
                          <span className="font-medium tabular-nums">
                            {formatSchoolMoney(row.balanceAmount, row.currency)}
                          </span>
                          {takePayment ? <MobileListChevron /> : null}
                        </span>
                      }
                      {...(takePayment
                        ? {
                            onClick: () =>
                              setReceiptDialog({ open: true, invoiceId: row.id }),
                          }
                        : {})}
                    />
                  );
                })}
              </MobileList>
            )}
            emptyState={
              invoicesQuery.isPending ? (
                <TableRowsSkeleton
                  columns={[{ width: 120 }, { avatar: true, twoLine: true }, {}, { width: 90 }]}
                />
              ) : invoiceFilterCount > 0 || invoiceOverdue ? (
                <NothingMatched
                  what="invoices"
                  filters={[
                    classOptions.find((option) => option.value === invoiceClass)?.label ?? "",
                    termOptions.find((option) => option.value === invoiceTerm)?.label ?? "",
                    INVOICE_STATUSES.find((option) => option.value === invoiceStatus)?.label ??
                      "",
                    invoiceOverdue ? "Overdue" : "",
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
          <FilterSheet
            count={[receiptClass, receiptStatus, receiptFrom, receiptTo].filter(Boolean).length}
          >
            <FilterSelect
              className="min-w-0"
              label="Year group"
              allLabel="Every year group"
              value={receiptClass}
              options={classOptions}
              onChange={setReceiptClass}
            />
            <FilterSelect
              className="min-w-0"
              label="Status"
              allLabel="Any status"
              value={receiptStatus}
              options={RECEIPT_STATUSES}
              onChange={setReceiptStatus}
            />
            <DatePicker
              label="Received from"
              placeholder="Any date"
              value={isoToDate(receiptFrom)}
              onChange={(date) => setReceiptFrom(dateToIso(date))}
            />
            <DatePicker
              label="Received to"
              placeholder="Any date"
              value={isoToDate(receiptTo)}
              onChange={(date) => setReceiptTo(dateToIso(date))}
            />
          </FilterSheet>

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
                      onSelect={() => setReceiptDialog({ open: true })}
                    />
                  }
                />
              )
            }
          />
        </div>

        {/* ── credits ──────────────────────────────────────────────────── */}
        <div className={activeView === "credits" ? "space-y-3" : "hidden"}>
          <p className="text-sm text-[var(--text-muted)]">
            Money the school is holding that belongs to families — an overpayment, or a bill
            settled beyond its total. Spend it on another invoice, or hand it back.
          </p>
          <FilterSheet count={[creditClass, creditKind].filter(Boolean).length}>
            <FilterSelect
              className="min-w-0"
              label="Year group"
              allLabel="Every year group"
              value={creditClass}
              options={classOptions}
              onChange={setCreditClass}
            />
            <FilterSelect
              className="min-w-0"
              label="Source"
              allLabel="Either source"
              value={creditKind}
              options={CREDIT_KINDS}
              onChange={setCreditKind}
            />
          </FilterSheet>

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
          <FilterSheet count={[refundClass, refundStatus].filter(Boolean).length}>
            <FilterSelect
              className="min-w-0"
              label="Year group"
              allLabel="Every year group"
              value={refundClass}
              options={classOptions}
              onChange={setRefundClass}
            />
            <FilterSelect
              className="min-w-0"
              label="Status"
              allLabel="Any status"
              value={refundStatus}
              options={REFUND_STATUSES}
              onChange={setRefundStatus}
            />
          </FilterSheet>

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
          <p className="text-sm text-[var(--text-muted)]">
            A waiver is decided, then applied. Nothing comes off a bill until it is applied,
            and an applied one can be reversed if it landed on the wrong invoice.
          </p>
          <FilterSheet
            count={[waiverClass, waiverTerm, waiverStatus, waiverType].filter(Boolean).length}
          >
            <FilterSelect
              className="min-w-0"
              label="Year group"
              allLabel="Every year group"
              value={waiverClass}
              options={classOptions}
              onChange={setWaiverClass}
            />
            <FilterSelect
              className="min-w-0"
              label="Term"
              allLabel="Every term"
              value={waiverTerm}
              options={termOptions}
              onChange={setWaiverTerm}
            />
            <FilterSelect
              className="min-w-0"
              label="Status"
              allLabel="Any status"
              value={waiverStatus}
              options={WAIVER_STATUSES}
              onChange={setWaiverStatus}
            />
            <FilterSelect
              className="min-w-0"
              label="Type"
              allLabel="Any type"
              value={waiverType}
              options={WAIVER_TYPES}
              onChange={setWaiverType}
            />
          </FilterSheet>

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
          <p className="text-sm text-[var(--text-muted)]">
            A school opens with one fee sheet on the first year group. Copy it up the ladder
            rather than re-typing it — the copies arrive as drafts.
          </p>
          <FilterSheet
            count={[structureClass, structureTerm, structureStatus].filter(Boolean).length}
          >
            <FilterSelect
              className="min-w-0"
              label="Year group"
              allLabel="Every year group"
              value={structureClass}
              options={classOptions}
              onChange={setStructureClass}
            />
            <FilterSelect
              className="min-w-0"
              label="Term"
              allLabel="Every term"
              value={structureTerm}
              options={termOptions}
              onChange={setStructureTerm}
            />
            <FilterSelect
              className="min-w-0"
              label="Status"
              allLabel="Any status"
              value={structureStatus}
              options={STRUCTURE_STATUSES}
              onChange={setStructureStatus}
            />
          </FilterSheet>

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
      <ReceiptFormDialog
        open={receiptDialog.open}
        onOpenChange={(open) => setReceiptDialog((current) => ({ ...current, open }))}
        presetInvoiceId={receiptDialog.invoiceId}
      />
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

      {remindRows ? (
        <SendNoticeDialog
          open
          onOpenChange={(next) => {
            if (!next) setRemindRows(null);
          }}
          title={`Remind the ${new Set(remindRows.map((row) => row.student.id)).size}`}
          audience={{
            studentIds: Array.from(new Set(remindRows.map((row) => row.student.id))),
            describe: `the families behind the ${remindRows.length} ${
              remindRows.length === 1 ? "bill" : "bills"
            } you picked`,
          }}
          severity="WARNING"
          defaultSubject="School fees outstanding"
          defaultBody="Our records show school fees still outstanding on your child's account. Please settle the balance, or come and see the bursar to arrange terms. Your statement is on the portal."
          sendLabel="Send the reminder"
          onSent={() => {
            clearSelectedInvoices.current?.();
            clearSelectedInvoices.current = null;
          }}
        />
      ) : null}

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
            ? `This releases ${formatSchoolMoney(cancelTarget.amount, cancelTarget.currency)} back to the family’s credit.`
            : null
        }
        reasonLabel="Reason"
        reasonPlaceholder="Family asked for it to stay on account"
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
