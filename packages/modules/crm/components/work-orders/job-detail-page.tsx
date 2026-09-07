"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Input } from "@corelithzw/ui/components/input";
import { Progress } from "@corelithzw/ui/components/progress";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { RecordAttributes } from "@corelithzw/module-records/components/record-attributes";
import {
  RailSection,
  RecordPageShell,
  RecordRelated,
} from "@corelithzw/module-records/components/record-page-shell";
import { useAttributeEditor } from "@corelithzw/module-records/components/use-attribute-editor";
import { NextStepCard } from "../records/next-step-card";
import { RelationAttribute } from "../records/relation-attribute";
import {
  ConversationComposer,
  type ConversationTarget,
} from "../collaboration/conversation-composer";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { WORK_ORDER_STATUS } from "../../tones";
import { canAskForSignOff } from "../../sign-off";
import { WORK_ORDER_STATUS_LABELS, checklistEditRefusal } from "../../work-orders";
import {
  Building2,
  CalendarCheck,
  Checklist,
  Clock,
  Coins,
  FileText,
  History,
  Lock,
  MapPin,
  Payments,
  Phone,
  ReportProblem,
  Send,
  Tag,
  User,
  Users,
  Wrench,
  XCircle,
} from "@corelithzw/ui/lib/icons";

import {
  JobBlockDialog,
  JobCancelDialog,
  JobCompleteDialog,
  JobScheduleDialog,
} from "./job-action-dialogs";
import { JobChecklist } from "./job-checklist";
import { jobNextStep, type JobAct } from "./job-next-step";
import { JobStageRail } from "./job-stage-rail";
import { jobWindow, type JobInvoicePreview, type JobRecord, type JobStatus } from "./job-types";
import { useJobActions, type InvoiceLineInput } from "./use-job-actions";

/** The stored enum, in the words somebody would say. */
const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * The paperwork rows a job has, as facts rather than as markup.
 *
 * The Documents tab's badge and the tab's own contents were counted
 * separately, so a job whose quote had no deal behind it badged "1" and then
 * said nothing had been raised off it. One list, read twice.
 */
type PaperworkRow = {
  key: string;
  icon: typeof FileText;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
};

function paperworkRows(job: JobRecord): PaperworkRow[] {
  const rows: PaperworkRow[] = [];

  // Only where the quote can actually be opened: the register of documents
  // lives on the deal, so a job carrying a document id and no deal has nowhere
  // to send anybody.
  if (job.documentId && job.deal) {
    rows.push({
      key: "quote",
      icon: FileText,
      title: "Checklist lifted from a quote",
      body: "The lines on this job were copied off it rather than retyped.",
      href: `/crm/deals/${job.deal.id}?section=documents`,
      linkLabel: "Open the deal's paperwork",
    });
  }

  if (job.invoice) {
    rows.push({
      key: "invoice",
      icon: Payments,
      title: job.invoice.invoiceNumber || "Invoice raised",
      body: "Raised from the quantities this job actually completed.",
      href: "/crm/invoices",
      linkLabel: "Open invoices",
    });
  }

  return rows;
}

/**
 * A job, as a record page.
 *
 * This is the answer to "nothing happens after one raises a job". A job used
 * to open a dialog and close again, which meant the one object in the CRM that
 * represents work actually being done was the only object with nowhere to
 * live — no address to send somebody, no history, no way to get from the work
 * to the invoice it earned.
 *
 * Held to the same template as every other record, so the shape is already
 * learned: identity in the band with the lifecycle rail beside it, sections
 * down the left, and the rail on the right carrying the properties, the
 * progress and the single next move.
 */
export function JobDetailPage({ jobId }: { jobId: string }) {
  const [tab, setTab] = useState("checklist");
  const [dialog, setDialog] = useState<JobAct | "cancel" | null>(null);

  const jobQuery = useQuery({
    queryKey: ["crm", "job", jobId],
    queryFn: () => fetchJson<JobRecord>(`/api/v2/crm/work-orders/${jobId}`),
  });
  const job = jobQuery.data;

  const actions = useJobActions(jobId);

  // Properties write through in place, the same as on every other record. The
  // PATCH route has always taken all of these; nothing was passing them, so a
  // job raised with the wrong address was stuck with it.
  const edit = useAttributeEditor({
    path: `/api/v2/crm/work-orders/${jobId}`,
    invalidate: [
      ["crm", "job", jobId],
      ["crm", "jobs"],
    ],
  });

  // What billing this job would produce, asked for only once it could
  // conceivably happen — a draft job has no completed quantities to price.
  const billingQuery = useQuery({
    queryKey: ["crm", "job", jobId, "invoice-preview"],
    queryFn: () => fetchJson<JobInvoicePreview>(`/api/v2/crm/work-orders/${jobId}/invoice`),
    enabled: job?.status === "COMPLETED",
  });

  if (jobQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (jobQuery.error || !job) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Job not found</AlertTitle>
        <AlertDescription>
          {jobQuery.error ? getApiErrorMessage(jobQuery.error) : "It may have been deleted."}
        </AlertDescription>
      </Alert>
    );
  }

  const when = jobWindow(job.scheduledStart, job.scheduledEnd);
  const next = jobNextStep(job);
  const closed = job.status === "COMPLETED" || job.status === "CANCELLED";

  /** Where a stage in the rail sends you: a move is a form, not a status write. */
  const move = (stage: JobStatus) => {
    if (stage === "SCHEDULED") setDialog("schedule");
    if (stage === "BLOCKED") setDialog("block");
    if (stage === "COMPLETED") setDialog("complete");
    if (stage === "IN_PROGRESS") actions.start.mutate(null);
  };

  const act = (which: JobAct) => {
    // Starting is the one move with nothing to ask: the crew is either there
    // or they are not, and a dialog confirming it is a tap taken on a phone
    // outside a gate for no information.
    if (which === "start") {
      actions.start.mutate(null);
      return;
    }
    if (which === "invoice") {
      actions.invoice.mutate(undefined);
      return;
    }
    setDialog(which);
  };

  const where =
    job.addressLine ?? job.site?.addressLine ?? job.client?.name ?? null;

  const paperwork = paperworkRows(job);

  const subtitle = (
    <>
      {job.client ? (
        <EntityLink href={`/crm/companies/${job.client.id}`} muted>
          {job.client.name}
        </EntityLink>
      ) : null}
      {job.client && job.site ? " · " : null}
      {job.site ? (
        <EntityLink href={`/crm/sites/${job.site.id}`} muted>
          {job.site.name}
        </EntityLink>
      ) : null}
      {!job.client && !job.site ? "Not attached to a customer" : null}
    </>
  );

  /**
   * Where a note about this job goes.
   *
   * A job has no conversation of its own — there is no comment thread against
   * a work order — so the talking happens on the record that is paying for it,
   * which is also where anybody looking for it would go. Named rather than
   * silently redirected: a note that lands somewhere other than where it was
   * typed is worse than no note box at all.
   */
  const talkTo: { target: ConversationTarget; label: string } | null = job.deal
    ? { target: { kind: "deal", id: job.deal.id }, label: job.deal.title }
    : job.client
      ? { target: { kind: "company", id: job.client.id }, label: job.client.name }
      : job.site
        ? { target: { kind: "site", id: job.site.id }, label: job.site.name }
        : null;

  const rail = (
    <>
      {next ? (
        <RailSection title="Up next">
          <NextStepCard
            step={next.step}
            onAct={() => act(next.act)}
            disabled={next.disabled || actions.isPending}
            disabledReason={next.disabledReason}
          />
        </RailSection>
      ) : null}

      {job.status === "BLOCKED" ? (
        <RailSection title="Blocked">
          {/* The warn ink, and the reason in it. A blocked job with the reason
              somewhere else is a job whose state nobody can act on. */}
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--status-warning-border)] bg-[var(--badge-warn-bg)] px-2.5 py-2">
            <ReportProblem
              className="mt-px size-4 shrink-0 text-[var(--badge-warn-fg)]"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--badge-warn-fg)]">
              {job.blockedReason ?? "Stopped, with no reason recorded."}
            </p>
          </div>
        </RailSection>
      ) : null}

      {job.items.length > 0 ? (
        <RailSection title="Progress" meta={`${job.completionPercent}%`}>
          <div className="space-y-2">
            <Progress
              value={job.completionPercent}
              tone={job.completionPercent === 100 ? "success" : "brand"}
              label="How far through the job is"
            />
            <p className="text-sm text-[var(--text-muted)]">
              {job.items.filter((item) => item.completedQuantity >= item.quantity).length} of{" "}
              {job.items.length} done
            </p>
            {job.completionBlockers.length > 0 && job.status !== "COMPLETED" ? (
              <ul className="space-y-0.5 text-sm text-[var(--text-muted)]">
                {job.completionBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </RailSection>
      ) : null}

      {job.invoice ? (
        <RailSection title="Billed">
          {/* Once it is raised the button is gone and the document is here —
              a second "Raise the invoice" beside an invoice number is how a
              customer gets billed twice for one visit. */}
          <div className="space-y-1">
            <Link
              href="/crm/invoices"
              className="block font-mono text-sm font-medium text-[var(--brand-strong)] hover:underline"
            >
              {job.invoice.invoiceNumber || "Invoice raised"}
            </Link>
            <p className="text-sm text-[var(--text-muted)]">
              Raised <ClientDate value={job.invoice.invoicedAt} mode="date" />
            </p>
          </div>
        </RailSection>
      ) : null}

      {/* The customer's own answer, which is a different claim from the crew's
          record of who accepted the work — so it is shown as theirs, whether
          it has come back yet or not. */}
      {job.signOffAt ? (
        <RailSection title="The customer signed">
          <div className="space-y-1 text-sm">
            <p className="font-medium text-[var(--text-strong)]">
              {job.signOffName ?? "Signed"}
            </p>
            <p className="text-[var(--text-muted)]">
              <ClientDate value={job.signOffAt} />
            </p>
            {job.signOffRating ? (
              <p className="text-[var(--text-muted)]">Rated {job.signOffRating} out of 5</p>
            ) : null}
            {job.signOffNotes ? (
              <p className="whitespace-pre-wrap text-[var(--text-muted)]">{job.signOffNotes}</p>
            ) : null}
          </div>
        </RailSection>
      ) : job.signOffToken ? (
        <RailSection title="Waiting on the customer">
          <div className="space-y-2 text-sm">
            <p className="text-[var(--text-muted)]">
              A link is out. Whoever holds it signs on their own phone, without an account —
              and their name is what stands against the work.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={actions.askForSignOff.isPending}
              onClick={() => actions.askForSignOff.mutate()}
            >
              Send a fresh link
            </Button>
            <p className="text-[var(--text-muted)]">
              A fresh link replaces the one already out, which is how you take back a link
              sent to the wrong number.
            </p>
          </div>
        </RailSection>
      ) : null}

      {job.status === "COMPLETED" && job.signedByName ? (
        <RailSection title="Signed off">
          <div className="space-y-1 text-sm">
            <p className="font-medium text-[var(--text-strong)]">{job.signedByName}</p>
            {job.signedAt ? (
              <p className="text-[var(--text-muted)]">
                <ClientDate value={job.signedAt} />
              </p>
            ) : null}
            {job.customerRating ? (
              <p className="text-[var(--text-muted)]">Rated {job.customerRating} out of 5</p>
            ) : null}
            {job.completionNotes ? (
              <p className="whitespace-pre-wrap text-[var(--text-muted)]">
                {job.completionNotes}
              </p>
            ) : null}
          </div>
        </RailSection>
      ) : null}

      {job.accessNotes || job.site?.accessInstructions ? (
        <RailSection title="Getting in">
          <p className="whitespace-pre-wrap text-sm">
            {job.accessNotes ?? job.site?.accessInstructions}
          </p>
        </RailSection>
      ) : null}
    </>
  );

  return (
    <>
      <RecordPageShell
        icon={Wrench}
        backHref="/crm/work-orders"
        backLabel="All jobs"
        title={job.title}
        // The title is what the crew reads on a phone before they set off, so
        // a typo in it is worth being able to fix from the record it is on.
        onTitleCommit={edit.required("title", job.title).onCommit}
        reference={job.workOrderNo}
        status={{
          status: WORK_ORDER_STATUS[job.status] ?? "inactive",
          label: WORK_ORDER_STATUS_LABELS[job.status],
        }}
        subtitle={subtitle}
        bandValue={job.items.length > 0 ? `${job.completionPercent}%` : undefined}
        actions={[
          // Asking the customer to sign is not a stage — the job is still on
          // site while it waits — so it lives here rather than on the rail.
          ...(canAskForSignOff(job.status) && !job.signOffAt
            ? [
                {
                  // A second ask mints a fresh token, which is also how a
                  // link sent to the wrong number is taken back.
                  label: job.signOffToken
                    ? "Send a fresh sign-off link"
                    : "Ask the customer to sign",
                  icon: <Send className="size-4" aria-hidden="true" />,
                  onSelect: () => actions.askForSignOff.mutate(),
                },
              ]
            : []),
          // Cancelling is leaving the path, not a step along it, and the
          // server will only take it from the four states it is reachable
          // from — so the menu offers it exactly when the API would accept it.
          ...(job.allowedTransitions.includes("CANCELLED")
            ? [
                {
                  label: "Cancel the job",
                  icon: <XCircle className="size-4" aria-hidden="true" />,
                  destructive: true,
                  onSelect: () => setDialog("cancel"),
                },
              ]
            : []),
        ]}
        beforeTabs={
          <JobStageRail
            status={job.status}
            allowed={job.allowedTransitions}
            onMove={move}
            disabled={actions.isPending}
          />
        }
        related={
          <RecordRelated
            items={[
              ...(job.deal
                ? [
                    {
                      href: `/crm/deals/${job.deal.id}`,
                      label: job.deal.title,
                      dot: "bg-[var(--brand)]",
                    },
                  ]
                : []),
              ...(job.client
                ? [
                    {
                      href: `/crm/companies/${job.client.id}`,
                      label: job.client.name,
                      dot: "bg-[var(--brand)]",
                    },
                  ]
                : []),
              ...(job.site
                ? [
                    {
                      href: `/crm/sites/${job.site.id}`,
                      label: job.site.name,
                      dot: "bg-[var(--badge-ok-fg)]",
                    },
                  ]
                : []),
            ]}
          />
        }
        attributes={
          <RecordAttributes
            attributes={[
              {
                id: "status",
                label: "Status",
                icon: Tag,
                display: (
                  <StatusChip
                    status={WORK_ORDER_STATUS[job.status] ?? "inactive"}
                    label={WORK_ORDER_STATUS_LABELS[job.status]}
                  />
                ),
              },
              {
                id: "when",
                label: "Window",
                icon: CalendarCheck,
                // Overdue-to-start is the row somebody opened the job to fix,
                // so an unbooked job on a late one is flagged rather than
                // merely blank.
                tone: job.isOverdue ? "alert" : "code",
                value: when,
                placeholder: "Not booked",
              },
              {
                id: "assignee",
                label: "Crew lead",
                icon: User,
                tone: job.assignedTo ? "strong" : "alert",
                value: job.assignedTo?.name ?? null,
                placeholder: "Nobody assigned",
              },
              {
                id: "crew",
                label: "Crew",
                icon: Users,
                value: job.crewIds.length > 0 ? `${job.crewIds.length} on the job` : null,
                placeholder: "Just the lead",
              },
              {
                id: "site",
                label: "Site",
                icon: MapPin,
                display: job.site ? (
                  <EntityLink href={`/crm/sites/${job.site.id}`}>{job.site.name}</EntityLink>
                ) : undefined,
                value: job.site ? job.site.name : null,
                placeholder: "No site named",
              },
              {
                id: "address",
                label: "Address",
                icon: MapPin,
                // Edited as the job's own line, read as wherever the crew is
                // actually going — a job with no address of its own is at the
                // site's, and showing that blank would send nobody anywhere.
                ...edit.text("addressLine", job.addressLine),
                formatted: where,
                placeholder: "No address",
              },
              {
                id: "company",
                label: "Customer",
                icon: Building2,
                display: job.client ? (
                  <EntityLink href={`/crm/companies/${job.client.id}`}>
                    {job.client.name}
                  </EntityLink>
                ) : undefined,
                value: job.client ? job.client.name : null,
                placeholder: "Not attached",
              },
              {
                id: "deal",
                label: "Deal",
                icon: Coins,
                // A job with no deal cannot be invoiced, which makes this
                // blank a problem rather than an omission — and, until it
                // could be set here, a permanent one: a callout logged against
                // a site alone had no way of ever acquiring the deal the
                // invoice route insists on.
                tone: job.deal ? "link" : "alert",
                display: (
                  <RelationAttribute
                    value={job.deal?.title ?? null}
                    href={job.deal ? `/crm/deals/${job.deal.id}` : null}
                    types={["DEAL"]}
                    placeholder="Nothing to bill against"
                    searchPlaceholder="Search deals"
                    onPick={(record) => edit.save.mutate({ dealId: record.id })}
                    onClear={() => edit.save.mutate({ dealId: null })}
                  />
                ),
              },
              {
                id: "contact",
                label: "Ask for",
                icon: User,
                // Two rows rather than "Name · number" in one: joined, there
                // was no way to say which half you were correcting.
                ...edit.text("contactName", job.contactName),
                placeholder: "Nobody named",
              },
              {
                id: "phone",
                label: "Their number",
                icon: Phone,
                mono: true,
                ...edit.text("contactPhone", job.contactPhone),
                placeholder: "No number",
              },
              {
                id: "priority",
                label: "Priority",
                icon: ReportProblem,
                tone: job.priority === "URGENT" || job.priority === "HIGH" ? "alert" : "default",
                ...edit.choice("priority", job.priority, PRIORITY_OPTIONS),
              },
              {
                id: "brief",
                label: "Brief",
                icon: Checklist,
                ...edit.text("description", job.description),
                placeholder: "No brief",
              },
              {
                id: "started",
                label: "Started",
                icon: Clock,
                tone: "code",
                value: job.startedAt,
                formatted: job.startedAt
                  ? new Date(job.startedAt).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null,
                placeholder: "Not started",
              },
              {
                id: "access",
                label: "Getting in",
                icon: Lock,
                // The job's own note is what gets edited; the site's standing
                // instructions are what a reader falls back on.
                ...edit.text("accessNotes", job.accessNotes),
                formatted: job.accessNotes ?? job.site?.accessInstructions ?? null,
                placeholder: "No instructions",
              },
            ]}
          />
        }
        activeTab={tab}
        onTabChange={setTab}
        tabs={[
          {
            value: "checklist",
            label: "Checklist",
            icon: Checklist,
            count: job.items.length,
            attention: job.status === "IN_PROGRESS" && job.completionPercent < 100,
            content: (
              // The brief itself is a property now — it is edited in the
              // standing column with the rest of them, rather than being
              // repeated here as a paragraph nobody could correct.
              <div className="space-y-4">
                <JobChecklist
                  items={job.items}
                  percent={job.completionPercent}
                  readOnly={closed}
                  isSaving={actions.saveProgress.isPending}
                  onCommit={(progress) => actions.saveProgress.mutate(progress)}
                  // The same rule the PATCH route enforces, asked of the same
                  // function — a job raised without a quote had an empty
                  // checklist and no way at all to fill it in.
                  editRefusal={checklistEditRefusal(job.status)}
                  isSavingItems={edit.save.isPending}
                  onSaveItems={(lines) => edit.save.mutate({ items: lines })}
                />
              </div>
            ),
          },
          {
            value: "conversation",
            label: "Conversation",
            icon: Clock,
            content: talkTo ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-muted)]">
                  A job has no thread of its own — notes go on{" "}
                  <span className="font-medium text-[var(--text-body)]">{talkTo.label}</span>,
                  where anybody chasing this work would look for them.
                </p>
                <ConversationComposer target={talkTo.target} />
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                This job is attached to no deal, company or site, so there is nowhere for a
                note about it to live.
              </p>
            ),
          },
          {
            value: "documents",
            label: "Documents",
            icon: FileText,
            // Counted off the rows the tab actually draws, so it can't badge
            // "1" over "Nothing has been raised off this job yet."
            count: paperwork.length,
            content: (
              <JobPaperwork
                job={job}
                rows={paperwork}
                billing={billingQuery.data}
                isPending={actions.invoice.isPending}
                onRaise={(lines) => actions.invoice.mutate(lines ? { lines } : undefined)}
              />
            ),
          },
          {
            value: "history",
            label: "History",
            icon: History,
            content: <JobHistory job={job} />,
          },
        ]}
        rail={rail}
      >
        <JobScheduleDialog
          job={job}
          open={dialog === "schedule"}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
              actions.clearRefusal();
            }
          }}
          isPending={actions.schedule.isPending}
          refusal={actions.refusal}
          onSubmit={(input) =>
            actions.schedule.mutate(input, { onSuccess: () => setDialog(null) })
          }
        />

        <JobBlockDialog
          job={job}
          open={dialog === "block"}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
              actions.clearRefusal();
            }
          }}
          isPending={actions.block.isPending}
          refusal={actions.refusal}
          onSubmit={(reason) =>
            actions.block.mutate(reason, { onSuccess: () => setDialog(null) })
          }
        />

        <JobCancelDialog
          job={job}
          open={dialog === "cancel"}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
              actions.clearRefusal();
            }
          }}
          isPending={actions.cancel.isPending}
          refusal={actions.refusal}
          onSubmit={(reason) =>
            actions.cancel.mutate(reason, { onSuccess: () => setDialog(null) })
          }
        />

        <JobCompleteDialog
          job={job}
          open={dialog === "complete"}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
              actions.clearRefusal();
            }
          }}
          isPending={actions.complete.isPending}
          refusal={actions.refusal}
          onSubmit={(input) =>
            actions.complete.mutate(input, { onSuccess: () => setDialog(null) })
          }
        />
      </RecordPageShell>

      {/* A refusal raised outside a dialog — a start that was too early, an
          invoice the bridge would not raise — has nowhere else to land. */}
      {actions.refusal && dialog === null ? (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
          <Alert variant="destructive">
            <AlertTitle>{actions.refusal.message}</AlertTitle>
            {actions.refusal.blockers.length > 0 || actions.refusal.unpriced.length > 0 ? (
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-5">
                  {actions.refusal.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                  {actions.refusal.unpriced.map((line) => (
                    <li key={line}>No price behind “{line}”</li>
                  ))}
                </ul>
              </AlertDescription>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-2">
              {/* A refusal with a way to comply. "No price behind that line" is
                  answerable — on the Documents section, where the draft
                  invoice's own table takes the missing prices — and an alert
                  whose only control is Dismiss leaves somebody stuck at the
                  last step of the job they just finished. */}
              {actions.refusal.unpriced.length > 0 ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setTab("documents");
                    actions.clearRefusal();
                  }}
                >
                  Put the prices in
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={actions.clearRefusal}>
                Dismiss
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}
    </>
  );
}

/**
 * The job's own paperwork: where the checklist came from, and what it billed.
 *
 * Not the deal's document register — that lives on the deal, and repeating it
 * here would answer a question nobody asked of a job. What a job's paperwork
 * means is the quote it was lifted from and the invoice it earned, plus, while
 * it is still unbilled, what billing it would actually produce.
 */
function JobPaperwork({
  job,
  rows,
  billing,
  isPending,
  onRaise,
}: {
  job: JobRecord;
  rows: PaperworkRow[];
  billing: JobInvoicePreview | undefined;
  isPending: boolean;
  /** Undefined lines means "bill it off the quote"; a list means these prices. */
  onRaise: (lines?: InvoiceLineInput[]) => void;
}) {
  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          Nothing has been raised off this job yet.
        </p>
      ) : (
        <ul className="border-t border-[var(--table-divider)]">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li
                key={row.key}
                className="flex items-start gap-3 border-b border-[var(--table-divider)] py-2.5"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-strong)]">{row.title}</p>
                  <p className="text-sm text-[var(--text-muted)]">{row.body}</p>
                </div>
                <Link
                  href={row.href}
                  className="shrink-0 text-sm text-[var(--brand-strong)] hover:underline"
                >
                  {row.linkLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* What the invoice would say, before anybody commits to sending one,
          and the place the missing half of it gets typed. The server derives
          the draft from the completed quantities and the quote's prices; where
          it cannot price a line it refuses and hands back what it managed —
          which is only useful if there is somewhere to fill in the rest. */}
      {billing && !billing.alreadyInvoiced && !job.invoice ? (
        <JobBilling job={job} billing={billing} isPending={isPending} onRaise={onRaise} />
      ) : null}
    </div>
  );
}

/**
 * What the invoice would say, with the prices it is missing.
 *
 * The invoice route refuses a job whose completed work it cannot price, and
 * says which lines — expecting the caller to send the prices back. Nothing
 * ever did, so the refusal arrived as an alert with a Dismiss button and the
 * only way out was to go and price the lines on the quote, on another record,
 * and come back. The quantities are the job's own — what was actually
 * completed — and are not editable here: they are the record of what happened,
 * and billing more than was done is a different conversation.
 */
function JobBilling({
  job,
  billing,
  isPending,
  onRaise,
}: {
  job: JobRecord;
  billing: JobInvoicePreview;
  isPending: boolean;
  onRaise: (lines?: InvoiceLineInput[]) => void;
}) {
  // The unpriced lines come back as descriptions only, so their quantities are
  // read off the job — the same `min(done, quoted)` the server bills on.
  const missing = billing.unpriced.map((description) => {
    const item = job.items.find((entry) => entry.description === description);
    return {
      description,
      quantity: item ? Math.min(item.completedQuantity, item.quantity) : 1,
    };
  });

  const [prices, setPrices] = useState<Record<string, string>>({});
  const typed = (description: string) => prices[description] ?? "";
  const priced = missing.every((line) => {
    const value = Number(typed(line.description));
    return typed(line.description).trim() !== "" && Number.isFinite(value) && value >= 0;
  });

  const lines: InvoiceLineInput[] = [
    ...billing.lines,
    ...missing.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: Number(typed(line.description)) || 0,
      taxRate: 0,
    })),
  ];

  const total = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice * (1 + (line.taxRate ?? 0) / 100),
    0,
  );

  if (lines.length === 0) return null;

  const blocked = job.invoiceBlockers.length > 0;

  return (
    <section className="space-y-2">
      <h3 className="acct-rail-heading text-[var(--text-muted)]">What it would bill</h3>

      <ul className="border-t border-[var(--table-divider)]">
        {billing.lines.map((line, index) => (
          <li
            key={`priced-${line.description}-${index}`}
            className="flex items-baseline justify-between gap-3 border-b border-[var(--table-divider)] py-1.5 text-sm"
          >
            <span className="min-w-0 truncate">{line.description}</span>
            <span className="shrink-0 font-mono tabular-nums text-[var(--text-muted)]">
              {line.quantity} × {line.unitPrice.toFixed(2)}
            </span>
          </li>
        ))}

        {missing.map((line) => (
          <li
            key={`unpriced-${line.description}`}
            className="flex items-center justify-between gap-3 border-b border-[var(--table-divider)] py-1.5 text-sm"
          >
            <span className="min-w-0 truncate">{line.description}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-mono tabular-nums text-[var(--text-muted)]">
                {line.quantity} ×
              </span>
              {/* Empty rather than zero. A price box that starts at 0.00 is a
                  discount somebody can send by not noticing it. */}
              <Input
                className="h-8 w-24 text-right font-mono tabular-nums"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`Price for ${line.description}`}
                value={typed(line.description)}
                onChange={(event) =>
                  setPrices((previous) => ({
                    ...previous,
                    [line.description]: event.target.value,
                  }))
                }
              />
            </span>
          </li>
        ))}
      </ul>

      <p className="text-right font-mono text-sm font-bold tabular-nums text-[var(--text-strong)]">
        {billing.currency} {total.toFixed(2)}
      </p>

      {missing.length > 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {missing.length === 1 ? "One line was" : `${missing.length} lines were`} done on site
          with no price on the quote behind {missing.length === 1 ? "it" : "them"}. Put the
          price in here, or price {missing.length === 1 ? "it" : "them"} on the quote and come
          back — either way nothing goes out at nothing.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={isPending || blocked || !priced}
          title={blocked ? job.invoiceBlockers.join(". ") : undefined}
          onClick={() => onRaise(missing.length > 0 ? lines : undefined)}
        >
          {isPending ? "Raising…" : "Raise the invoice"}
        </Button>
        {blocked ? (
          <span className="text-sm text-[var(--text-muted)]">
            {job.invoiceBlockers.join(". ")}
          </span>
        ) : null}
      </div>
    </section>
  );
}

/**
 * What has happened to this job, out of its own stamps.
 *
 * Deliberately not the activity feed: the trail a job leaves is written onto
 * the deal and the company it touches, so reading it back here would be a
 * search through somebody else's timeline for rows that mention this number.
 * These are the job's own facts, in the order they happened.
 */
function JobHistory({ job }: { job: JobRecord }) {
  const events = [
    { key: "raised", at: job.createdAt, label: `Raised as ${job.workOrderNo}` },
    job.scheduledStart
      ? {
          key: "booked",
          at: job.scheduledStart,
          label: `Booked for ${jobWindow(job.scheduledStart, job.scheduledEnd)}`,
        }
      : null,
    job.startedAt ? { key: "started", at: job.startedAt, label: "Crew on site" } : null,
    job.status === "BLOCKED" && job.blockedReason
      ? { key: "blocked", at: null, label: `Blocked — ${job.blockedReason}` }
      : null,
    job.signedAt
      ? {
          key: "signed",
          at: job.signedAt,
          label: `Signed off by ${job.signedByName ?? "the customer"}`,
        }
      : null,
    job.completedAt ? { key: "done", at: job.completedAt, label: "Completed" } : null,
    job.invoice
      ? {
          key: "billed",
          at: job.invoice.invoicedAt,
          label: `Invoiced as ${job.invoice.invoiceNumber || "an invoice"}`,
        }
      : null,
  ].filter((event): event is NonNullable<typeof event> => event !== null);

  return (
    <ul className="border-t border-[var(--table-divider)]">
      {events.map((event) => (
        <li
          key={event.key}
          className="flex items-baseline justify-between gap-3 border-b border-[var(--table-divider)] py-2 text-sm"
        >
          <span className="min-w-0">{event.label}</span>
          <span className="shrink-0 font-mono tabular-nums text-[var(--text-muted)]">
            {event.at ? <ClientDate value={event.at} /> : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
