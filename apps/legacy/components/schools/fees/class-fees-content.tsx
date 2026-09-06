"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList, MobileListEmpty } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
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
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import { formatSchoolMoney } from "@/lib/schools/format";
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

  const filtered = Boolean(streamFilter || statusFilter || search);
  const clearFilters = () => {
    setStreamFilter("");
    setStatusFilter("");
    setSearch("");
  };

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
      <PageBand
        chips={[
          {
            label: "Outstanding",
            value: formatSchoolMoney(outstanding),
            tone: "danger",
          },
          { label: "Families", value: owing },
          { label: "Settled", value: settled, tone: "success" },
        ]}
      />

      <FilterBar>
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
        <div className="min-w-0 flex-1 basis-[220px] sm:max-w-[280px]">
          <Label htmlFor="class-fees-search" className="text-sm text-muted-foreground">
            Search
          </Label>
          <Input
            id="class-fees-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoices"
          />
        </div>
      </FilterBar>

      {/* Silent about money until the figures are in. Reading
          "$0.00 outstanding across 0 students" a second before the real total
          lands is worse than reading nothing: it is a number a bursar can act on
          and it is wrong. `isPending` rather than `isLoading` — a refetch of a
          list already on screen is not a reason to blank the total. */}
      <p className="text-sm text-muted-foreground">
        {invoicesQuery.isPending ? (
          "Adding up what this year group owes…"
        ) : (
          <>
            <span className="tabular-nums">{formatSchoolMoney(outstanding)}</span> outstanding
            across {owing} student
            {owing === 1 ? "" : "s"}, from {invoices.length} invoice
            {invoices.length === 1 ? "" : "s"}.
          </>
        )}
      </p>

      {/* Good news, said out loud — but the rows stay, because "show me the
          Form 2 bills" is still a reasonable thing to want on a year group
          that has settled. */}
      {!invoicesQuery.isPending && invoices.length > 0 && owing === 0 ? (
        <NothingLeftToDo
          title="This year group is settled"
          body={`All ${invoices.length} invoices are paid or written off.`}
        />
      ) : null}

      {issue.error ? <SaveError what="The invoice" error={issue.error} /> : null}
      {discard.error ? <SaveError what="The draft" error={discard.error} /> : null}

      {invoicesQuery.isPending ? (
        <TableRowsSkeleton columns={[{ avatar: true, twoLine: true }, { width: 90 }]} />
      ) : invoices.length === 0 ? (
        filtered ? (
          <NothingMatched
            what="invoices"
            filters={[
              streams.find((stream) => stream.id === streamFilter)?.name ?? "",
              STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label ?? "",
              search,
            ]}
            onClear={clearFilters}
          />
        ) : (
          <NothingYet
            title="Nothing billed to this year group yet"
            body="Generate a term's invoices from its fee sheet on the whole-school ledger."
          />
        )
      ) : (
        <MobileList>
          {invoices.length === 0 ? (
            <MobileListEmpty>No invoices for this year group yet.</MobileListEmpty>
          ) : (
            invoices.map((invoice) => {
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

              return (
                <MobileList.Row
                  key={invoice.id}
                  static
                  leading={
                    <PersonAvatar
                      firstName={invoice.student.firstName}
                      lastName={invoice.student.lastName}
                    />
                  }
                  title={`${invoice.student.lastName}, ${invoice.student.firstName}`}
                  subtitle={
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span>
                        {invoice.invoiceNo} · {invoice.term.name} ·{" "}
                        <span className="tabular-nums">
                          {formatSchoolMoney(invoice.totalAmount, invoice.currency)}
                        </span>{" "}
                        billed
                        {invoice.balanceAmount > 0
                          ? ` · ${formatSchoolMoney(invoice.balanceAmount, invoice.currency)} outstanding`
                          : ""}
                      </span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </span>
                  }
                  trailing={<RecordActions resource="schools.fees" verbs={verbs} />}
                />
              );
            })
          )}
        </MobileList>
      )}

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
