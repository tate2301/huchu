"use client";

/**
 * One requisition: where it has got to, the one thing to do next, and — once
 * the money is out — what it went on.
 *
 * The notification that tells somebody their request was approved or paid has
 * always pointed here; until now this was a 404. The page answers the three
 * people who open it: the requester ("can I spend it, and have I accounted for
 * it"), the approver ("do I say yes"), and whoever holds the cash ("do I pay
 * it"). Each of them sees one button, the move the requisition can make next
 * and they are allowed to make — never a greyed-out control that exists to be
 * refused.
 *
 * The report is the acquittal. The requester adds what they spent, a line at a
 * time, each with its receipt, and "Account for it" settles the requisition at
 * whatever those lines come to. A figure typed at the end is a figure nobody
 * can check; a column of receipts is one anybody can.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Skeleton } from "@corelithzw/react";
import { FactList, SectionAction, SectionHeading } from "@/components/management/ui";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordPageShell, RecordRelated } from "@/components/records/record-page-shell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { REQUISITION_STATUS } from "@/lib/crm/tones";
import {
  Calendar,
  CalendarCheck,
  Coins,
  FileText,
  Payments,
  Plus,
  Receipt,
  Tag,
  User,
  Wallet,
  Work,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

import { CostEntryFormDialog } from "./cost-entry-form-dialog";
import { CostEntryTable } from "./cost-entry-table";
import {
  CATEGORY_LABELS,
  REQUISITION_STATUS_LABELS,
  formatDate,
  formatMoney,
  payable,
  type Category,
  type CostEntryRow,
  type RequisitionStatus,
} from "./money";

type Person = { id: string; name: string | null } | null;

type Detail = {
  requisition: {
    id: string;
    requisitionNo: string;
    status: RequisitionStatus;
    category: Category;
    purpose: string;
    notes: string | null;
    amount: string;
    approvedAmount: string | null;
    acquittedAmount: string | null;
    currency: string;
    neededBy: string | null;
    createdAt: string;
    submittedAt: string | null;
    approvedAt: string | null;
    disbursedAt: string | null;
    acquittedAt: string | null;
    decisionNote: string | null;
    receiptWaiverNote: string | null;
    project: { id: string; name: string; projectNo: string } | null;
    requestedBy: Person;
    approvedBy: Person;
    disbursedBy: Person;
    receiptsWaivedBy: Person;
    bankAccount: { id: string; name: string } | null;
    costEntries: CostEntryRow[];
  };
  permissions: { isRequester: boolean; mayApprove: boolean; mayDisburse: boolean };
};

type Move = "submit" | "decide" | "disburse" | "acquit" | null;

const STEPS = [
  { id: "asked", label: "Asked" },
  { id: "approved", label: "Approved" },
  { id: "paid", label: "Paid out" },
  { id: "accounted", label: "Accounted for" },
];

/**
 * The step each status is waiting on, 0-based. One past the last step means
 * every step is done — the counter still reads "Accounted for 4/4".
 */
const CURRENT_STEP: Partial<Record<RequisitionStatus, number>> = {
  DRAFT: 0,
  SUBMITTED: 1,
  APPROVED: 2,
  DISBURSED: 3,
  ACQUITTED: 4,
};

function readableDay(value: string | null): string | null {
  return value ? formatDate(value) : null;
}

/** The section's measure, and the line its verb sits on. */
const SECTION_WIDTH = 760;

/** Spend only: a RECEIVED line is the float arriving, not something it bought. */
function accountedFor(entries: CostEntryRow[]): number {
  return entries
    .filter((entry) => entry.direction === "SPENT")
    .reduce((total, entry) => total + Number(entry.amount), 0);
}

/**
 * The one move this viewer can make on this requisition now.
 *
 * Same rules the PATCH enforces, in the same order: nobody approves their own
 * request, paying out is a separate permission from approving, and only the
 * requester — or whoever pays out — accounts for the money.
 */
function nextMove(status: RequisitionStatus, permissions: Detail["permissions"]): Move {
  const { isRequester, mayApprove, mayDisburse } = permissions;
  if (status === "DRAFT" && isRequester) return "submit";
  if (status === "SUBMITTED" && mayApprove && !isRequester) return "decide";
  if (status === "APPROVED" && mayDisburse) return "disburse";
  if (status === "DISBURSED" && (isRequester || mayDisburse)) return "acquit";
  return null;
}

const MOVE_LABELS: Record<Exclude<Move, null>, string> = {
  submit: "Send for approval",
  decide: "Approve or decline",
  disburse: "Mark paid",
  acquit: "Account for it",
};

export function RequisitionDetailContent({ requisitionId }: { requisitionId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("report");
  const [dialog, setDialog] = useState<Exclude<Move, null> | null>(null);
  const [adding, setAdding] = useState(false);

  const queryKey = ["crm", "requisition", requisitionId];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchJson<Detail>(`/api/v2/crm/requisitions/${requisitionId}`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["crm", "requisitions"] });
    queryClient.invalidateQueries({ queryKey: ["crm", "project"] });
  };

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(`/api/v2/crm/requisitions/${requisitionId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
    onError: (error) =>
      toast({ title: "That did not go through", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const removeLine = useMutation({
    mutationFn: (entryId: string) =>
      fetchJson(`/api/v2/crm/cost-entries?id=${entryId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (error) =>
      toast({ title: "Could not remove that line", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={240} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title="Requisition not found">
        {query.error
          ? getApiErrorMessage(query.error)
          : "It may have been withdrawn, or it is somebody else's."}
      </Alert>
    );
  }

  const { requisition, permissions } = query.data;
  const move = nextMove(requisition.status, permissions);
  const issued = Number(payable(requisition));
  const moneyOut = requisition.status === "DISBURSED" || requisition.status === "ACQUITTED";
  const accounted = accountedFor(requisition.costEntries);
  const missingReceipts = requisition.costEntries.filter(
    (entry) => entry.direction === "SPENT" && !entry.receiptUrl,
  ).length;
  const reportOpen =
    permissions.isRequester &&
    (requisition.status === "APPROVED" || requisition.status === "DISBURSED");
  // The requester can take a mistaken line back out while the report is still
  // open. The server checks it is their own and the day is not closed.
  const canRemoveLines = reportOpen;

  // Withdrawing is leaving the path, not a step along it, so it is offered in
  // the menu rather than as the page's one button — and only where the server
  // would take it.
  const mayCancel =
    (permissions.isRequester && (requisition.status === "DRAFT" || requisition.status === "SUBMITTED")) ||
    (permissions.mayApprove && (requisition.status === "SUBMITTED" || requisition.status === "APPROVED"));

  const attributes: RecordAttribute[] = [
    {
      id: "requester",
      label: "Asked by",
      icon: User,
      display: requisition.requestedBy ? (
        <EntityLink href={`/crm/reps/${requisition.requestedBy.id}`}>
          {requisition.requestedBy.name ?? "Unnamed"}
        </EntityLink>
      ) : undefined,
      value: requisition.requestedBy?.name ?? null,
    },
    {
      id: "project",
      label: "Project",
      icon: Work,
      display: requisition.project ? (
        <EntityLink href={`/crm/projects/${requisition.project.id}`}>{requisition.project.name}</EntityLink>
      ) : undefined,
      value: requisition.project?.name ?? null,
      placeholder: "Not for a project",
    },
    { id: "category", label: "For", icon: Tag, value: CATEGORY_LABELS[requisition.category] },
    {
      id: "asked",
      label: "Asked for",
      icon: Coins,
      tone: "money",
      value: formatMoney(requisition.amount, requisition.currency),
    },
    ...(requisition.approvedAmount !== null
      ? [
          {
            id: "approved-amount",
            label: "Approved for",
            icon: Coins,
            tone: "money" as const,
            value: formatMoney(requisition.approvedAmount, requisition.currency),
          },
        ]
      : []),
    // Nothing here is edited in place, so an empty row would be a blank to
    // read past rather than a field to fill.
    ...(requisition.neededBy
      ? [
          {
            id: "needed",
            label: "Needed by",
            icon: Calendar,
            tone: "code" as const,
            value: readableDay(requisition.neededBy),
          },
        ]
      : []),
    ...(requisition.approvedBy
      ? [
          {
            id: "decided",
            label: requisition.status === "REJECTED" ? "Declined by" : "Approved by",
            icon: CalendarCheck,
            value: [requisition.approvedBy.name, readableDay(requisition.approvedAt)]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []),
    ...(requisition.disbursedBy
      ? [
          {
            id: "paid",
            label: "Paid out by",
            icon: Payments,
            value: [
              requisition.disbursedBy.name,
              readableDay(requisition.disbursedAt),
              requisition.bankAccount?.name ?? "cash",
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []),
    ...(requisition.acquittedAmount !== null
      ? [
          {
            id: "acquitted",
            label: "Accounted for",
            icon: Receipt,
            tone: "money" as const,
            value: formatMoney(requisition.acquittedAmount, requisition.currency),
          },
        ]
      : []),
  ];

  return (
    <>
      <RecordPageShell
        icon={Wallet}
        backHref="/crm/requisitions"
        backLabel="Requisitions"
        title={requisition.purpose}
        reference={requisition.requisitionNo}
        // The steps say where it has got to; the band only carries the two
        // states that leave the path (rule 5).
        status={
          requisition.status === "REJECTED" || requisition.status === "CANCELLED"
            ? { status: REQUISITION_STATUS[requisition.status] ?? "inactive", label: REQUISITION_STATUS_LABELS[requisition.status] }
            : null
        }
        bandValue={formatMoney(payable(requisition), requisition.currency)}
        primaryAction={
          move ? (
            <Button variant="primary" onClick={() => (move === "submit" ? act.mutate({ action: "submit" }) : setDialog(move))}>
              {MOVE_LABELS[move]}
            </Button>
          ) : null
        }
        actions={
          mayCancel
            ? [
                {
                  label: permissions.isRequester ? "Withdraw it" : "Cancel it",
                  destructive: true,
                  onSelect: () => act.mutate({ action: "cancel" }),
                },
              ]
            : undefined
        }
        related={
          <RecordRelated
            items={
              requisition.project
                ? [
                    {
                      href: `/crm/projects/${requisition.project.id}`,
                      label: requisition.project.name,
                      dot: "bg-[var(--badge-ok-fg)]",
                    },
                  ]
                : []
            }
          />
        }
        attributes={<RecordAttributes attributes={attributes} />}
        activeTab={tab}
        onTabChange={setTab}
        tabs={[
          {
            value: "report",
            label: "Report",
            icon: FileText,
            count: requisition.costEntries.length,
            attention: missingReceipts > 0,
            content: (
              <>
                {requisition.status === "REJECTED" || requisition.status === "CANCELLED" ? (
                  requisition.decisionNote ? (
                    <Alert
                      tone={requisition.status === "REJECTED" ? "warn" : "info"}
                      title={REQUISITION_STATUS_LABELS[requisition.status]}
                      className="mb-6"
                    >
                      {requisition.decisionNote}
                    </Alert>
                  ) : null
                ) : (
                  <RequisitionSteps current={CURRENT_STEP[requisition.status] ?? 0} />
                )}

                {/* Only once there is money to account for. Before approval
                    there is nothing issued, and "to return: 400" on a request
                    nobody has said yes to is a figure that is simply untrue. */}
                {moneyOut || requisition.status === "APPROVED" ? (
                  <section aria-labelledby="requisition-money">
                    <SectionHeading maxWidth={SECTION_WIDTH}>
                      <span id="requisition-money">Money</span>
                    </SectionHeading>
                    <FactList
                      align="end"
                      maxWidth={SECTION_WIDTH}
                      labelWidth={200}
                      items={[
                        {
                          label: moneyOut ? "Issued" : "Approved",
                          value: formatMoney(issued, requisition.currency),
                          mono: true,
                        },
                        {
                          label: "Accounted for",
                          value: formatMoney(accounted, requisition.currency),
                          mono: true,
                        },
                        ...(moneyOut
                          ? [
                              {
                                label: issued - accounted < 0 ? "Owed to them" : "To return",
                                value: formatMoney(Math.abs(issued - accounted), requisition.currency),
                                mono: true,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </section>
                ) : null}

                {requisition.receiptWaiverNote ? (
                  <Alert
                    tone="warn"
                    title={`Accepted without every receipt by ${requisition.receiptsWaivedBy?.name ?? "a manager"}`}
                    className="mt-6"
                  >
                    {requisition.receiptWaiverNote}
                  </Alert>
                ) : null}

                <section aria-labelledby="requisition-spend">
                  <SectionHeading
                    count={requisition.costEntries.length}
                    maxWidth={SECTION_WIDTH}
                    action={
                      reportOpen ? (
                        <SectionAction icon={Plus} onClick={() => setAdding(true)}>
                          Add spend
                        </SectionAction>
                      ) : undefined
                    }
                  >
                    <span id="requisition-spend">Spend</span>
                  </SectionHeading>

                  {reportOpen ? (
                    <CostEntryFormDialog
                      open={adding}
                      onOpenChange={setAdding}
                      title={`Add spend to ${requisition.requisitionNo}`}
                      fixed={{
                        direction: "SPENT",
                        currency: requisition.currency,
                        projectId: requisition.project?.id ?? null,
                        requisitionId: requisition.id,
                      }}
                      defaultCategory={requisition.category}
                      submitLabel="Add spend"
                      onSaved={refresh}
                    />
                  ) : null}

                  <CostEntryTable
                    label="Spend"
                    entries={requisition.costEntries}
                    // A requisition's lines are its project's unless one says
                    // otherwise, so the project earns its place only when the
                    // requisition itself was for no project.
                    showProject={!requisition.project}
                    showAgainst={false}
                    showPerson={false}
                    empty="Nothing reported yet."
                    maxWidth={SECTION_WIDTH}
                    onRemove={canRemoveLines ? (entry) => removeLine.mutate(entry.id) : undefined}
                  />
                </section>

                {requisition.notes ? (
                  <section aria-labelledby="requisition-notes">
                    <SectionHeading maxWidth={SECTION_WIDTH}>
                      <span id="requisition-notes">Notes</span>
                    </SectionHeading>
                    <p className="whitespace-pre-line text-sm text-[var(--text-strong)]" style={{ maxWidth: SECTION_WIDTH }}>
                      {requisition.notes}
                    </p>
                  </section>
                ) : null}
              </>
            ),
          },
        ]}
      />

      <DecideDialog
        open={dialog === "decide"}
        onOpenChange={(open) => setDialog(open ? "decide" : null)}
        amount={requisition.amount}
        currency={requisition.currency}
        pending={act.isPending}
        onDecide={(body) => act.mutate({ action: "decide", ...body })}
      />

      <DisburseDialog
        open={dialog === "disburse"}
        onOpenChange={(open) => setDialog(open ? "disburse" : null)}
        amount={payable(requisition)}
        currency={requisition.currency}
        pending={act.isPending}
        onDisburse={(body) => act.mutate({ action: "disburse", ...body })}
      />

      <AcquitDialog
        open={dialog === "acquit"}
        onOpenChange={(open) => setDialog(open ? "acquit" : null)}
        issued={issued}
        accounted={accounted}
        currency={requisition.currency}
        missingReceipts={missingReceipts}
        mayWaive={permissions.mayApprove && !permissions.isRequester}
        pending={act.isPending}
        onAcquit={(body) => act.mutate({ action: "acquit", ...body })}
      />
    </>
  );
}

/**
 * The four steps, all named, with the one it is waiting on marked.
 *
 * Every step is written out rather than only the current one: "Paid out" on
 * its own does not say what comes after it, and the step after is the thing
 * the requester is being asked to do. Done steps carry the healthy dot, the
 * step being waited on the amber one — it is somebody's move — and the rest
 * the grey.
 */
function RequisitionSteps({ current }: { current: number }) {
  return (
    <ol aria-label="Where this requisition has got to" className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {STEPS.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "next";
        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-2 text-sm",
              state === "next" ? "text-[var(--text-muted)]" : "text-[var(--text-strong)]",
              state === "current" && "font-medium",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                state === "done"
                  ? "bg-[var(--tone-success)]"
                  : state === "current"
                    ? "bg-[var(--tone-warn)]"
                    : "bg-[var(--border-strong)]",
              )}
            />
            {step.label}
            {state === "done" ? <span className="sr-only">(done)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Yes, no, or yes to less.
 *
 * An approver who cuts 400 to 250 has approved 250, and every figure after
 * this says 250 — so the cut is a field here rather than a conversation.
 */
function DecideDialog({
  open,
  onOpenChange,
  amount,
  currency,
  pending,
  onDecide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  currency: string;
  pending: boolean;
  onDecide: (body: { approve: boolean; approvedAmount?: number | null; decisionNote?: string | null }) => void;
}) {
  const [cutTo, setCutTo] = useState("");
  const [note, setNote] = useState("");
  const cut = cutTo.trim() === "" ? null : Number(cutTo);
  const cutValid = cut === null || (Number.isFinite(cut) && cut > 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve or decline</AlertDialogTitle>
          <AlertDialogDescription>
            {`They asked for ${formatMoney(amount, currency)}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="decide-cut">Approve a smaller amount</Label>
            <Input
              id="decide-cut"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className="font-mono"
              value={cutTo}
              placeholder={amount}
              onChange={(event) => setCutTo(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="decide-note">A word to them</Label>
            <Textarea id="decide-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => onDecide({ approve: false, decisionNote: note.trim() || null })}
          >
            Decline
          </Button>
          <Button
            variant="primary"
            disabled={pending || !cutValid}
            onClick={() =>
              onDecide({ approve: true, approvedAmount: cut, decisionNote: note.trim() || null })
            }
          >
            {cut === null ? "Approve" : `Approve ${formatMoney(cut, currency)}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type BankAccountOption = { id: string; name: string };

/** Radix refuses `value=""` on an item, and cash is an answer. */
const CASH = "cash";

/** Recording that the money left — from which account, or in cash. */
function DisburseDialog({
  open,
  onOpenChange,
  amount,
  currency,
  pending,
  onDisburse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  currency: string;
  pending: boolean;
  onDisburse: (body: { bankAccountId: string | null }) => void;
}) {
  const [accountId, setAccountId] = useState(CASH);

  // Accounting's own list. A tenant without the accounting module cannot read
  // it, and then the money is recorded as paid in cash, which is what it was.
  const accounts = useQuery({
    queryKey: ["accounting", "bank-accounts", "active"],
    queryFn: () =>
      fetchJson<{ data: BankAccountOption[] }>("/api/accounting/banking/accounts?active=true&limit=50"),
    enabled: open,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const options = accounts.data?.data ?? [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark it paid</AlertDialogTitle>
          <AlertDialogDescription>
            {`${formatMoney(amount, currency)} leaves the business today. The requester can then account for it.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {options.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="disburse-account">Paid from</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="disburse-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CASH}>Cash</SelectItem>
                {options.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => onDisburse({ bankAccountId: accountId === CASH ? null : accountId })}
          >
            Mark paid
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Settling the requisition at what the report comes to.
 *
 * With every receipt in, it is one press. With some missing it is refused, and
 * says how many — unless the viewer is a manager who is not the requester, who
 * can accept them anyway and has to say why.
 */
function AcquitDialog({
  open,
  onOpenChange,
  issued,
  accounted,
  currency,
  missingReceipts,
  mayWaive,
  pending,
  onAcquit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issued: number;
  accounted: number;
  currency: string;
  missingReceipts: number;
  mayWaive: boolean;
  pending: boolean;
  onAcquit: (body: { waiveMissingReceipts?: boolean; waiverNote?: string | null }) => void;
}) {
  const [note, setNote] = useState("");
  const balance = issued - accounted;
  const blocked = missingReceipts > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Account for it</AlertDialogTitle>
          <AlertDialogDescription>
            {balance === 0
              ? `${formatMoney(accounted, currency)} spent, exactly what was issued.`
              : balance > 0
                ? `${formatMoney(accounted, currency)} spent of ${formatMoney(issued, currency)}. ${formatMoney(balance, currency)} comes back as change.`
                : `${formatMoney(accounted, currency)} spent against ${formatMoney(issued, currency)} issued. They are owed ${formatMoney(-balance, currency)}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {blocked ? (
          mayWaive ? (
            <div className="space-y-1.5">
              <Label htmlFor="acquit-waiver">
                {`${missingReceipts} line${missingReceipts === 1 ? " has" : "s have"} no receipt. Why accept ${missingReceipts === 1 ? "it" : "them"} anyway?`}
              </Label>
              <Textarea
                id="acquit-waiver"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="The till at the pump was down; the fuel card statement shows it."
              />
            </div>
          ) : (
            <Alert tone="warn" title="Receipts missing">
              {`${missingReceipts} line${missingReceipts === 1 ? " has" : "s have"} no receipt. Add the photos, or ask a manager to accept them without.`}
            </Alert>
          )
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <Button
            variant="primary"
            disabled={pending || (blocked && (!mayWaive || note.trim() === ""))}
            onClick={() =>
              onAcquit(blocked ? { waiveMissingReceipts: true, waiverNote: note.trim() } : {})
            }
          >
            {blocked ? "Accept without receipts" : "Account for it"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
