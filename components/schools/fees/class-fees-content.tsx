"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MobileList } from "@corelithzw/react";

import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { PersonCell } from "@/components/schools/common/identity-cell";
import {
  activeFilterCount,
  FilterSelect,
} from "@/components/schools/common/filter-select";
import { TableSearch } from "@/components/schools/common/table-controls";
import { PageBand } from "@/components/schools/common/page-band";
import { RecordActions, type RecordVerb } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";
import {
  discardSchoolFeeInvoice,
  fetchSchoolFeeInvoices,
  issueSchoolFeeInvoice,
  writeOffSchoolFeeInvoice,
  type SchoolFeeInvoiceRecord,
} from "@/lib/schools/fees-v2";

import { InvoiceFormDialog, ReasonDialog, ReceiptFormDialog } from "@/components/schools/fees/fee-dialogs";
import { InvoiceStatusBadge } from "@/components/schools/fees/fee-status";

const STATUS_OPTIONS = [
  { value: "ISSUED", label: "Issued" },
  { value: "PART_PAID", label: "Part paid" },
  { value: "PAID", label: "Paid" },
  { value: "DRAFT", label: "Draft" },
  { value: "WRITEOFF", label: "Written off" },
  { value: "VOIDED", label: "Voided" },
];

/**
 * One year group's fees.
 *
 * A bursar chasing arrears works a form at a time — "who in Form 2 still owes"
 * — not down a list of every invoice in the school. The class filter goes
 * through the student's current class rather than a column on the invoice,
 * because the class belongs to the student and copying it onto the invoice
 * would give two answers the moment a child moves up.
 *
 * The outstanding total leads, because that is the number the conversation is
 * about. Every row now carries the verb that ends the conversation: before
 * this, the only way to take the money you had just rung a parent about was to
 * leave the year group, open the whole-school ledger, and find the invoice
 * again by its number.
 */
export function ClassFeesContent({
  classId,
  initialStreamId,
}: {
  classId: string;
  initialStreamId?: string;
}) {
  const queryClient = useQueryClient();

  const [streamFilter, setStreamFilter] = useState(initialStreamId ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [receiptFor, setReceiptFor] = useState<SchoolFeeInvoiceRecord | null>(null);
  const [editing, setEditing] = useState<SchoolFeeInvoiceRecord | null>(null);
  const [writeOffTarget, setWriteOffTarget] = useState<SchoolFeeInvoiceRecord | null>(null);

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });

  const invoicesQuery = useQuery({
    queryKey: ["schools", "fees", "by-class", classId, streamFilter, statusFilter],
    queryFn: () =>
      fetchSchoolFeeInvoices({
        page: 1,
        limit: 100,
        classId,
        streamId: streamFilter || undefined,
        status: (statusFilter || undefined) as SchoolFeeInvoiceRecord["status"] | undefined,
      }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["schools", "fees"] });

  const issue = useMutation({
    mutationFn: (invoiceId: string) => issueSchoolFeeInvoice(invoiceId),
    onSuccess: invalidate,
  });
  const discard = useMutation({
    mutationFn: (invoiceId: string) => discardSchoolFeeInvoice(invoiceId),
    onSuccess: invalidate,
  });
  const writeOff = useMutation({
    mutationFn: (input: { invoiceId: string; reason: string }) =>
      writeOffSchoolFeeInvoice(input.invoiceId, input.reason),
    onSuccess: () => {
      invalidate();
      setWriteOffTarget(null);
    },
  });

  const schoolClass = useMemo(
    () => (classesQuery.data?.data ?? []).find((row) => row.id === classId) ?? null,
    [classesQuery.data, classId],
  );
  const streams = schoolClass?.streams ?? [];

  const invoices = useMemo(() => {
    const rows = invoicesQuery.data?.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (invoice) =>
        invoice.invoiceNo.toLowerCase().includes(term) ||
        invoice.student.studentNo.toLowerCase().includes(term) ||
        `${invoice.student.lastName} ${invoice.student.firstName}`
          .toLowerCase()
          .includes(term),
    );
  }, [invoicesQuery.data, search]);

  // Money crosses JSON as a number — `successResponse` serialises every Decimal
  // on the way out — so this is arithmetic on numbers, not on Decimal strings.
  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.balanceAmount, 0);
  const owing = invoices.filter((invoice) => invoice.balanceAmount > 0).length;
  const settled = invoices.filter(
    (invoice) => invoice.status === "PAID" || invoice.status === "WRITEOFF",
  ).length;

  const filterCount = activeFilterCount(streamFilter, statusFilter, search);
  const clearFilters = () => {
    setStreamFilter("");
    setStatusFilter("");
    setSearch("");
  };

  /*
    The verbs a bill can take, given where it has got to.

    Built once and handed to both arrangements, so the table and the phone list
    cannot drift into offering different things about the same invoice. All of
    them live behind one trigger: three text buttons in a trailing slot is what
    pushed "Take payment" off the right edge at every width, and the one the
    row is waiting for leads the menu instead.
  */
  const rowVerbs = useCallback(
    (invoice: SchoolFeeInvoiceRecord): RecordVerb[] => {
      const settledRow =
        invoice.status === "PAID" ||
        invoice.status === "VOIDED" ||
        invoice.status === "WRITEOFF";
      const verbs: RecordVerb[] = [];

      if (invoice.status === "DRAFT") {
        verbs.push({
          label: "Issue",
          action: "issue",
          loading: issue.isPending,
          confirm: {
            title: `Issue ${invoice.invoiceNo}`,
            description: `${formatSchoolMoney(invoice.totalAmount, invoice.currency)} is added to the family's outstanding balance.`,
            confirmLabel: "Issue it",
          },
          onSelect: () => issue.mutate(invoice.id),
        });
        verbs.push({
          label: "Discard",
          action: "void",
          tone: "danger",
          loading: discard.isPending,
          confirm: {
            title: `Discard ${invoice.invoiceNo}`,
            description:
              "The draft is deleted outright. Nothing has reached the family, so nothing is withdrawn.",
            confirmLabel: "Discard it",
          },
          onSelect: () => discard.mutate(invoice.id),
        });
      }
      if (invoice.balanceAmount > 0 && invoice.status !== "DRAFT") {
        verbs.push({
          label: "Take payment",
          action: "receive-payment",
          onSelect: () => setReceiptFor(invoice),
        });
        verbs.push({
          label: "Write off",
          action: "write-off",
          tone: "danger",
          onSelect: () => setWriteOffTarget(invoice),
        });
      }
      verbs.push({
        label: "Edit",
        action: "edit",
        unavailable: settledRow ? "A settled bill cannot be edited." : undefined,
        onSelect: () => setEditing(invoice),
      });

      return verbs;
    },
    [discard, issue],
  );

  /*
    A table, not a row list.

    The question this screen is opened with is a column question — who in this
    year group still owes, and how much — and a stack of two-line rows cannot
    answer it because the figures never line up. Below `md` it becomes the row
    list it used to be everywhere, because seven columns at 390px is a table
    you have to operate rather than one you can read.
  */
  const columns = useMemo<ColumnDef<SchoolFeeInvoiceRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <PersonCell
            kind="student"
            href={`/schools/students/${row.original.student.id}`}
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            reference={row.original.student.studentNo}
          />
        ),
      },
      {
        id: "invoiceNo",
        header: "Invoice no",
        cell: ({ row }) => <NumericCell align="left">{row.original.invoiceNo}</NumericCell>,
      },
      { id: "term", header: "Term", cell: ({ row }) => row.original.term.name },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
      },
      {
        id: "totalAmount",
        header: "Billed",
        cell: ({ row }) => (
          <NumericCell>
            {formatSchoolMoney(row.original.totalAmount, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "balanceAmount",
        header: "Outstanding",
        cell: ({ row }) => (
          <NumericCell className="font-medium">
            {formatSchoolMoney(row.original.balanceAmount, row.original.currency)}
          </NumericCell>
        ),
      },
      {
        id: "dueDate",
        header: "Due",
        cell: ({ row }) => <NumericCell>{formatSchoolDate(row.original.dueDate)}</NumericCell>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RecordActions
              layout="menu"
              resource="schools.fees"
              label={`Actions for ${row.original.invoiceNo}`}
              verbs={rowVerbs(row.original)}
            />
          </div>
        ),
      },
    ],
    [rowVerbs],
  );

  if (invoicesQuery.error) {
    return (
      <LoadError
        what="this year group's invoices"
        error={invoicesQuery.error}
        onRetry={() => invoicesQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Nothing but dashes until the figures are in. "$ 0.00 outstanding"
          a second before the real total lands is worse than an empty chip: it
          is a number a bursar can act on, and it is wrong. `isPending` rather
          than `isLoading`, because a refetch of a list already on screen is
          not a reason to blank the total. */}
      <PageBand
        chips={[
          {
            label: "Outstanding",
            value: invoicesQuery.isPending ? "—" : formatSchoolMoney(outstanding),
            tone: "danger",
          },
          { label: "Families owing", value: invoicesQuery.isPending ? "—" : owing },
          {
            label: "Settled",
            value: invoicesQuery.isPending ? "—" : settled,
            tone: "success",
          },
        ]}
      />

      {issue.error ? <SaveError what="The invoice" error={issue.error} /> : null}
      {discard.error ? <SaveError what="The draft" error={discard.error} /> : null}

      {/* Good news, said out loud — but the rows stay, because "show me the
          Form 2 bills" is still a reasonable thing to want on a year group
          that has settled. */}
      {!invoicesQuery.isPending && invoices.length > 0 && owing === 0 ? (
        <NothingLeftToDo
          title="This year group is settled"
          body={`All ${invoices.length} invoices are paid or written off.`}
        />
      ) : null}

      <DataTable
        data={invoices}
        columns={columns}
        pagination={{ enabled: true }}
        toolbar={
          <>
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search name, admission or invoice number"
            />
            {streams.length > 0 ? (
              <FilterSelect
                label="Class"
                allLabel="Every class"
                value={streamFilter}
                options={streams.map((stream) => ({ value: stream.id, label: stream.name }))}
                onChange={setStreamFilter}
              />
            ) : null}
            <FilterSelect
              label="Status"
              allLabel="Any status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={setStatusFilter}
            />
            <span className="hidden shrink-0 self-center font-mono text-xs tabular-nums text-[color:var(--text-subtle)] sm:inline">
              {invoices.length}
            </span>
          </>
        }
        mobileListRenderer={({ rows }) => (
          <MobileList>
            {rows.map(({ row }) => (
              <MobileList.Row
                key={row.id}
                static
                leading={
                  <PersonAvatar
                    firstName={row.student.firstName}
                    lastName={row.student.lastName}
                  />
                }
                title={`${row.student.firstName} ${row.student.lastName}`}
                subtitle={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">
                      {row.invoiceNo} · {row.term.name}
                    </span>
                    <InvoiceStatusBadge status={row.status} />
                  </span>
                }
                trailing={
                  <span className="flex items-center gap-2">
                    {/* Stripped of its column head, the outstanding balance is
                        the one figure that still says what the row is about. */}
                    <span className="font-medium tabular-nums">
                      {formatSchoolMoney(row.balanceAmount, row.currency)}
                    </span>
                    <RecordActions
                      layout="menu"
                      resource="schools.fees"
                      label={`Actions for ${row.invoiceNo}`}
                      verbs={rowVerbs(row)}
                    />
                  </span>
                }
              />
            ))}
          </MobileList>
        )}
        emptyState={
          invoicesQuery.isPending ? (
            <TableRowsSkeleton
              headers={["Student", "Invoice no", "Term", "Status", "Outstanding"]}
              columns={[
                { avatar: true, twoLine: true },
                { width: 120 },
                {},
                { badge: true },
                { width: 110, align: "right" },
              ]}
            />
          ) : filterCount > 0 ? (
            <NothingMatched
              what="invoices"
              search={search}
              filters={[
                streams.find((stream) => stream.id === streamFilter)?.name ?? "",
                STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label ?? "",
              ]}
              onClear={clearFilters}
            />
          ) : (
            <NothingYet
              title="Nothing billed to this year group yet"
              body="Generate a term's invoices from its fee sheet on the whole-school ledger."
            />
          )
        }
      />


      <ReceiptFormDialog
        open={receiptFor !== null}
        onOpenChange={(open) => {
          if (!open) setReceiptFor(null);
        }}
        presetInvoiceId={receiptFor?.id}
      />

      <InvoiceFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        invoice={editing}
      />

      <ReasonDialog
        open={writeOffTarget !== null}
        onOpenChange={(open) => {
          if (!open) setWriteOffTarget(null);
        }}
        title={writeOffTarget ? `Write off ${writeOffTarget.invoiceNo}` : "Write off"}
        consequence={
          writeOffTarget
            ? `${formatSchoolMoney(writeOffTarget.balanceAmount, writeOffTarget.currency)} stops being owed and is posted to the ledger as a loss. The family is not chased again.`
            : null
        }
        reasonLabel="Reason"
        keepLabel="Keep chasing it"
        confirmLabel="Write it off"
        pendingLabel="Writing off…"
        pending={writeOff.isPending}
        error={writeOff.error}
        onConfirm={(reason) =>
          writeOffTarget && writeOff.mutate({ invoiceId: writeOffTarget.id, reason })
        }
      />
    </div>
  );
}
