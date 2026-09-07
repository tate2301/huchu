"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { CrmLeadStage } from "@corelithzw/db";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  Clock,
  Funnel,
  Mail,
  NoteAdd,
  Payments,
  Phone,
  Tag,
  TrendingUp,
  User,
  UserRound,
} from "@corelithzw/ui/lib/icons";
import { daysSince, resolveNextStep } from "../../tones";
import {
  fetchCrmFieldDefinitions,
  updateCrmLeadStage,
  type CrmFieldDefinitionRecord,
} from "../../crm-v2";
import { visitItemsToQuotationLines } from "../../site-visits";
import type { CrmDocumentLineInput } from "../../accounting-bridge";

import { DocumentList } from "../documents/document-list";
import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { formatMoney, invoiceOutstanding } from "../documents/document-types";
import { LeadFormSheet } from "../leads/lead-form-sheet";
import type { LeadFilterOwner } from "../leads/leads-filters";
import { LostReasonDialog } from "../leads/lost-reason-dialog";
import {
  CRM_STAGE_LABELS,
  CRM_STAGE_STATUS,
  formatLeadValue,
} from "../leads/stage-config";
import { ConversationComposer } from "../collaboration/conversation-composer";
import { ConvertLeadSheet } from "../leads/convert-lead-sheet";
import { VisitReportSheet, type MeasurementDraft } from "../visits/visit-report-sheet";
import { VisitScheduleSheet } from "../visits/visit-schedule-sheet";

import {
  automationTab,
  historyTab,
  paperworkTab,
  tasksTab,
  useRecordComments,
} from "../records/record-tabs";
import {
  ContactList,
  ContactTally,
  EmailPreview,
  MeetingCard,
  NextInteractionCard,
  type NextInteraction,
  type RailTally,
} from "../records/record-panels";
import { NextStepCard } from "../records/next-step-card";
import { CONTACT_ACTIVITY_KIND } from "../records/event-kind";
import { RecordStory } from "../records/record-story";
import { customFieldAttributes } from "@corelithzw/module-records/components/custom-field-attributes";
import { RecordAttributes } from "@corelithzw/module-records/components/record-attributes";
// RailSection comes from the shell rather than being redefined here: this
// file had its own copy, which is why the rail on a lead kept its frames
// when every other record lost theirs.
import { RailSection, RecordPageShell, RecordRelated } from "@corelithzw/module-records/components/record-page-shell";
import { RelationAttribute } from "../records/relation-attribute";
import { useAttributeEditor } from "@corelithzw/module-records/components/use-attribute-editor";
import { buildStory } from "../../story";
import { AttributesPanel } from "./attributes-panel";
import { StageProgress } from "./stage-progress";
import { VisitsTab } from "./visits-tab";
import { LeadScoreCard } from "./lead-score-card";
import type { LeadAppointment, LeadDetail } from "./lead-types";

/** Measurements captured on site, shaped into quotation lines for the builder. */
function draftsToLines(drafts: MeasurementDraft[]): CrmDocumentLineInput[] {
  return visitItemsToQuotationLines(
    drafts.map((draft) => ({
      category: draft.category || null,
      description: draft.description,
      quantity: Number(draft.quantity) || 1,
      widthMm: draft.widthMm ? Number(draft.widthMm) : null,
      heightMm: draft.heightMm ? Number(draft.heightMm) : null,
      depthMm: draft.depthMm ? Number(draft.depthMm) : null,
      specNotes: draft.specNotes || null,
      unitPrice: draft.unitPrice ? Number(draft.unitPrice) : null,
    })),
  );
}

export function LeadDetailPage({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reportFor, setReportFor] = useState<LeadAppointment | null>(null);
  const [pendingLost, setPendingLost] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [quotationPrefill, setQuotationPrefill] = useState<CrmDocumentLineInput[] | undefined>();
  const [tab, setTab] = useState("timeline");

  const leadQuery = useQuery({
    queryKey: ["crm-lead", leadId],
    queryFn: () => fetchJson<LeadDetail>(`/api/v2/crm/leads/${leadId}`),
  });

  const fieldsQuery = useQuery({
    queryKey: ["crm", "field-definitions", "LEAD"],
    queryFn: () => fetchCrmFieldDefinitions("LEAD"),
  });
  const edit = useAttributeEditor({
    path: `/api/v2/crm/leads/${leadId}`,
    invalidate: [["crm-lead", leadId], ["crm", "leads"]],
  });

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: LeadFilterOwner[] }>("/api/v2/crm/team"),
  });

  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);
  // Comments join the story rather than sitting in a section of their own.
  const comments = useRecordComments({ kind: "lead", id: leadId });
  const definitions: CrmFieldDefinitionRecord[] = fieldsQuery.data?.data ?? [];
  const lead = leadQuery.data;

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      fetchJson(`/api/v2/crm/leads/${leadId}/archive`, {
        method: "POST",
        body: JSON.stringify({ archived }),
      }),
    onSuccess: (_result, archived) => {
      queryClient.invalidateQueries({ queryKey: ["crm-lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "board"] });
      toast({
        title: archived ? "Archived" : "Back in the pipeline",
        description: archived
          ? "It is out of the lists and the board. Restore it from this menu."
          : undefined,
      });
    },
    onError: (error) =>
      toast({
        title: "Could not archive that lead",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const remove = useMutation({
    mutationFn: () => fetchJson(`/api/v2/crm/leads/${leadId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "board"] });
      toast({ title: "Deleted" });
      // Nothing left to look at — the record this page is about is gone.
      router.push("/crm/leads");
    },
    onError: (error) =>
      toast({
        title: "Could not delete that lead",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const setArchived = (archived: boolean) => archive.mutate(archived);

  const confirmDelete = async () => {
    const confirmed = await dsConfirm({
      title: "Delete this lead for good?",
      description:
        "Its calls, notes, visits, tasks and files go with it, and none of it comes back. Archiving keeps the record and takes it out of the pipeline.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (confirmed) remove.mutate();
  };

  const changeStage = useMutation({
    mutationFn: ({ stage, lostReason }: { stage: CrmLeadStage; lostReason?: string }) =>
      updateCrmLeadStage(leadId, stage, lostReason),
    onSuccess: (_result, { stage }) => {
      queryClient.invalidateQueries({ queryKey: ["crm-lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "board"] });
      toast({ title: `Moved to ${CRM_STAGE_LABELS[stage]}` });
    },
    onError: (error) =>
      toast({
        title: "Could not change the stage",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  if (leadQuery.isLoading) {
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

  if (leadQuery.error || !lead) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Lead not found</AlertTitle>
        <AlertDescription>
          {leadQuery.error ? getApiErrorMessage(leadQuery.error) : "It may have been deleted."}
        </AlertDescription>
      </Alert>
    );
  }

  const nextTask = lead.followUps.find((task) => task.status === "PENDING");
  const nextVisit = lead.appointments.find((visit) => visit.status === "SCHEDULED");

  // One "up next" rather than a task card and a visit card each showing their
  // own soonest: the reader's question is what happens next, not what happens
  // next of each kind.
  const nextInteraction: NextInteraction | null = (() => {
    const candidates: NextInteraction[] = [];
    if (nextTask) candidates.push({ kind: "task", title: nextTask.title, at: nextTask.dueAt });
    if (nextVisit) {
      candidates.push({ kind: "visit", title: nextVisit.title, at: nextVisit.scheduledStart });
    }
    return (
      candidates.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0] ?? null
    );
  })();

  // Every kind of contact, newest first — not calls only. The panel is titled
  // "contact so far", and showing three calls under a strip that counts five
  // kinds made a record whose last month was all email read as silent.
  const recentContact = lead.activities
    .filter((activity) => activity.type in CONTACT_ACTIVITY_KIND)
    .slice(0, 6)
    .map((activity) => ({
      id: activity.id,
      at: activity.occurredAt,
      kind: CONTACT_ACTIVITY_KIND[activity.type],
      // The API has always included who logged it; the panel just never asked,
      // so every row in the summary was attributed to "Someone".
      actorName: activity.createdBy?.name ?? null,
      summary: activity.body ?? activity.subject,
    }));

  // How much has actually been done, as opposed to what the last few things
  // were. A lead nobody has rung has an empty contact list, which reads as
  // "nothing to show" rather than as the reason it is going cold.
  const contactTallies: RailTally[] = [
    {
      label: "Calls logged",
      value: lead.activities.filter((activity) => activity.type === "CALL").length,
      icon: Phone,
    },
    {
      label: "Emails sent",
      value: lead.activities.filter((activity) => activity.type === "EMAIL").length,
      icon: Mail,
    },
    {
      label: "Notes left",
      value: lead.activities.filter((activity) => activity.type === "NOTE").length,
      icon: NoteAdd,
    },
  ];

  const lastEmail = (() => {
    const found = lead.activities.find((activity) => activity.type === "EMAIL");
    return found
      ? { id: found.id, subject: found.subject, body: found.body, at: found.occurredAt }
      : null;
  })();
  const openInvoices = lead.documents.filter(
    (doc) => doc.type === "INVOICE" && doc.invoice && invoiceOutstanding(doc.invoice) > 0,
  );
  const totalOutstanding = openInvoices.reduce(
    (sum, doc) => sum + (doc.invoice ? invoiceOutstanding(doc.invoice) : 0),
    0,
  );
  const latestQuote = lead.documents.find((doc) => doc.type === "QUOTATION");

  /**
   * What this lead is actually waiting on.
   *
   * Read off the record rather than off the stage alone: a lead sitting in
   * Qualified with a visit already booked wants a different verb from one
   * nobody has been out to. An archived or converted lead gets no verb at all
   * — there is no next step on a record that has left the pipeline.
   */
  const nextStep = lead.archivedAt
    ? null
    : resolveNextStep({
        kind: "lead",
        stage: lead.stage,
        daysSinceContact: daysSince(recentContact[0]?.at ?? lead.firstContactAt),
        scheduled: Boolean(nextInteraction),
        visitBooked: Boolean(nextVisit),
        visitDone: lead.appointments.some((visit) => visit.status === "COMPLETED"),
        quoteSent: Boolean(latestQuote),
        quoteAnswered: Boolean(latestQuote?.approval?.respondedAt),
        owed: totalOutstanding > 0,
        converted: Boolean(lead.convertedDealId),
      });

  // Where each verb goes. Every one of these is a sheet or a section this page
  // already owns — a button that opens nothing is worse than no button.
  const takeNextStep = () => {
    switch (nextStep?.action) {
      case "visit":
        setScheduleOpen(true);
        return;
      case "convert":
        setConvertOpen(true);
        return;
      case "quote":
      case "chase":
      case "payment":
        setTab("documents");
        return;
      default:
        // A call is booked as a follow-up with a date on it, which is what the
        // tasks section is for.
        setTab("tasks");
    }
  };

  return (
    <RecordPageShell
      icon={Funnel}
      backHref="/crm/leads"
      backLabel="All leads"
      title={lead.title ?? lead.leadNo}
      onTitleCommit={(next) => edit.save.mutate({ title: next })}
      reference={lead.leadNo}
      // An archived lead that looks exactly like a live one is how somebody
      // spends ten minutes working a record that is not in anybody's pipeline.
      // The chip is the first thing read on the page, so it says so there.
      status={
        lead.archivedAt
          ? { status: "inactive", label: lead.convertedAt ? "Converted" : "Archived" }
          : { status: CRM_STAGE_STATUS[lead.stage], label: CRM_STAGE_LABELS[lead.stage] }
      }
      subtitle={
        <>
          <EntityLink href={lead.clientId ? `/crm/companies/${lead.clientId}` : null} muted>
            {lead.client?.name ?? "No client"}
          </EntityLink>
          {" · "}
          {/* An unassigned lead is nobody's job, which is the single most
              common reason one goes quiet. It reads as a warning rather than
              as another grey name. */}
          {lead.assignedTo ? (
            <EntityLink href={`/crm/reps/${lead.assignedTo.id}`} muted>
              {lead.assignedTo.name}
            </EntityLink>
          ) : (
            <span className="font-semibold text-[var(--status-error-text)]">Unassigned</span>
          )}
        </>
      }
      bandValue={formatLeadValue(lead.estimatedValue, lead.currency)}
      related={
        <RecordRelated
          items={[
            lead.clientId && lead.client
              ? {
                  href: `/crm/companies/${lead.clientId}`,
                  label: lead.client.name,
                  dot: "bg-[var(--brand)]",
                }
              : null,
            lead.convertedDealId
              ? {
                  href: `/crm/deals/${lead.convertedDealId}`,
                  label: "The deal it became",
                  dot: "bg-[var(--tone-warn)]",
                }
              : null,
          ].filter((item) => item !== null)}
        />
      }
      primaryAction={
        // Converting is the one thing a qualified lead exists to do — until it
        // has done it. A converted lead is history, and the useful move from
        // here is following the business to where it went, so the bar offers
        // that instead of a verb that would now fail.
        lead.convertedDealId ? (
          <Button asChild size="sm" variant="secondary" className="gap-1.5">
            <Link href={`/crm/deals/${lead.convertedDealId}`}>
              Open the deal
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={() => setConvertOpen(true)}>
            <ArrowRight className="h-3.5 w-3.5" />
            Convert to deal
          </Button>
        )
      }
      actions={[
        { label: "Edit", onSelect: () => setEditOpen(true) },
        { label: "Schedule a visit", onSelect: () => setScheduleOpen(true) },
        // A lead had no ending short of dragging it to Lost, which is a claim
        // about the business. A duplicate or a wrong number is not lost, it is
        // just not wanted — so archiving is offered first, and deleting sits
        // under it for the row that should never have existed.
        lead.archivedAt
          ? { label: "Restore from archive", onSelect: () => setArchived(false) }
          : { label: "Archive", onSelect: () => setArchived(true) },
        {
          label: "Delete",
          destructive: true,
          onSelect: () => confirmDelete(),
        },
      ]}
      attributes={
        // A lead had no property list at all, which is why nothing on it
        // could be corrected without opening the edit form.
        <RecordAttributes
          attributes={[
            {
              id: "value",
              label: "Value",
              icon: Payments,
              // The figure the whole record is about, so it is drawn as one:
              // mono and heavy, in the strongest ink on the page. `mono` alone
              // made it the same weight and colour as a phone number.
              tone: "money",
              placeholder: "Not sized",
              ...edit.numeric("estimatedValue", lead.estimatedValue),
              // With its currency, through the same helper the board and the
              // list use, so one lead's value never reads two ways.
              formatted:
                lead.estimatedValue == null
                  ? null
                  : formatLeadValue(lead.estimatedValue, lead.currency),
            },
            {
              id: "probability",
              label: "Likelihood",
              icon: TrendingUp,
              mono: true,
              placeholder: "Not scored",
              ...edit.numeric("probability", lead.probability),
              // A bare "0" beside the word Likelihood is not a percentage,
              // it is a number nobody can act on — the same rule that makes
              // money carry its currency. Editing still opens on the number.
              formatted: lead.probability == null ? null : `${lead.probability}%`,
            },
            {
              id: "company",
              label: "Company",
              icon: Building2,
              // The same blue a company wears in the table beside this one.
              // Left off when there is nothing linked, so the picker's own
              // placeholder stays the quiet grey a placeholder should be.
              tone: lead.client ? "link" : undefined,
              display: (
                <RelationAttribute
                  value={lead.client?.name ?? null}
                  href={lead.clientId ? `/crm/companies/${lead.clientId}` : null}
                  types={["COMPANY"]}
                  placeholder="No company"
                  searchPlaceholder="Search companies"
                  onPick={(record) => edit.save.mutate({ clientId: record.id })}
                  onClear={() => edit.save.mutate({ clientId: null })}
                />
              ),
            },
            {
              id: "contact",
              label: "Contact",
              icon: User,
              placeholder: "Nobody named",
              ...edit.text("contactName", lead.contactName),
            },
            {
              id: "phone",
              label: "Phone",
              icon: Phone,
              placeholder: "Not recorded",
              // Monospaced, so the digits line up against the numbers in the
              // rows above and below and can be read a group at a time.
              mono: true,
              ...edit.text("contactPhone", lead.contactPhone),
            },
            {
              id: "email",
              label: "Email",
              icon: Mail,
              placeholder: "Not recorded",
              ...edit.text("contactEmail", lead.contactEmail),
            },
            {
              // The canvas puts Owner in the property list, and it is the row
              // it draws red: a lead nobody owns is nobody's job, which is the
              // commonest reason one goes cold. It was only ever in the rail's
              // Details panel, at the bottom of a column, in grey.
              id: "owner",
              label: "Owner",
              icon: UserRound,
              placeholder: "Unassigned",
              tone: lead.assignedTo ? "strong" : "alert",
              ...edit.choice(
                "assignedToId",
                lead.assignedTo?.id ?? null,
                owners.map((member) => ({
                  value: member.id,
                  label: member.name ?? "Unnamed",
                })),
                "Leave unassigned",
              ),
            },
            {
              id: "source",
              label: "Source",
              icon: Tag,
              placeholder: "Not recorded",
              ...edit.text("source", lead.source),
            },
            ...customFieldAttributes({
              definitions,
              values: lead.customFields ?? null,
              onCommit: (key, value) =>
                edit.save.mutate({ customFields: { [key]: value } }),
            }),
          ]}
        />
      }
      beforeTabs={
        <StageProgress
          compact
          stage={lead.stage}
          disabled={changeStage.isPending}
          onChange={(stage) => {
            if (stage === lead.stage) return;
            if (stage === "LOST") {
              setPendingLost(true);
              return;
            }
            changeStage.mutate({ stage });
          }}
        />
      }
      activeTab={tab}
      onTabChange={setTab}
      tabs={[
        {
          // Named Overview, because on a phone the summary is rendered above
          // it and the two read as one thing: what this lead is worth and what
          // is next, then what has actually happened to it.
          value: "timeline",
          label: "Conversation",
          icon: Clock,
          content: (
            <div className="space-y-4">
              <ConversationComposer target={{ kind: "lead", id: leadId }} />
              {/* The whole story, not just the activity table: visits, tasks,
                  documents and the day it arrived, in one order. */}
              <RecordStory
                events={buildStory({
                  activities: lead.activities,
                  tasks: lead.followUps,
                  visits: lead.appointments,
                  documents: lead.documents,
                  // What people said belongs in the same order as what
                  // happened. `buildStory` has always taken comments.
                  comments,
                  createdAt: lead.createdAt,
                  createdLabel: `Lead ${lead.leadNo} came in`,
                })}
                emptyMessage="Nothing has happened on this lead yet. Log a call or a note above to start the trail."
              />
            </div>
          ),
        },
        paperworkTab({
          ref: { kind: "lead", id: leadId },
          documentCount: lead.documents.length,
          documents: (
            <DocumentList
              basePath={`/api/v2/crm/leads/${leadId}`}
              currency={lead.currency}
              documents={lead.documents}
              // A lead with a name to bill can be quoted; the company is
              // created from the contact if there is not one already.
              canCreate={Boolean(lead.clientId || lead.contactName || lead.title)}
              prefillLines={quotationPrefill}
              onPrefillConsumed={() => setQuotationPrefill(undefined)}
            />
          ),
        }),
        {
          value: "visits",
          label: "Visits",
          icon: CalendarCheck,
          count: lead.appointments.length,
          // A visit that has happened and has not been written up is the thing
          // on a lead most likely to be forgotten.
          attention: lead.appointments.some(
            (visit) => visit.status === "SCHEDULED" && new Date(visit.scheduledStart) < new Date(),
          ),
          content: (
            <VisitsTab
              appointments={lead.appointments}
              onSchedule={() => setScheduleOpen(true)}
              onOpenReport={setReportFor}
            />
          ),
        },
        {
          ...tasksTab({ ref: { kind: "lead", id: leadId }, currentUserId }),
          count: lead.followUps.filter((task) => task.status === "PENDING").length,
          attention: lead.followUps.some(
            (task) => task.status === "PENDING" && new Date(task.dueAt) < new Date(),
          ),
        },
        automationTab({ ref: { kind: "lead", id: leadId } }),
        historyTab({
          ref: { kind: "lead", id: leadId },
          entity: "LEAD",
          activities: lead.activities,
        }),
      ]}
      rail={
        <>
          {/* No "Worth" panel here any more.

              The figure is in the band, where it stays in view while the
              conversation scrolls — see `bandValue` below. A copy at the top of
              this column was the same number twice on one screen, and it was
              the copy that scrolled away.

              What is left is the score, which is not a headline but a
              breakdown: a number, a band, and the reasons for both. */}
          {lead.scoreBreakdown ? (
            <RailSection title="How warm">
              <LeadScoreCard score={lead.scoreBreakdown} />
            </RailSection>
          ) : null}

          {/* What is booked, then what to do about it. The card below is the
              record's one call to action; when something *is* booked it is
              still the next move, just without the amber. */}
          <RailSection title="Up next">
            {nextInteraction ? (
              <div className="mb-3">
                <NextInteractionCard interaction={nextInteraction} />
              </div>
            ) : null}
            {nextStep ? (
              <NextStepCard step={nextStep} onAct={takeNextStep} />
            ) : nextInteraction ? null : (
              <p className="text-sm text-[var(--text-muted)]">
                This lead has left the pipeline. Nothing is due on it.
              </p>
            )}
          </RailSection>

          {nextVisit ? (
            <RailSection title="Next visit">
              <MeetingCard
                meeting={{
                  id: nextVisit.id,
                  title: nextVisit.title,
                  scheduledStart: nextVisit.scheduledStart,
                  location: nextVisit.location,
                }}
                action={
                  <Button size="sm" variant="outline" onClick={() => setReportFor(nextVisit)}>
                    Write it up
                  </Button>
                }
              />
            </RailSection>
          ) : null}

          {/* How much, then what — the canvas draws this band as the tally,
              and the list underneath it says who and when. */}
          <RailSection title="Contact so far">
            <div className="mb-3">
              <ContactTally tallies={contactTallies} />
            </div>
            <ContactList contacts={recentContact} />
          </RailSection>

          <RailSection title="Last email">
            <EmailPreview message={lastEmail} />
          </RailSection>

          {lead.documents.length > 0 ? (
            <RailSection title="Billing">
              {latestQuote ? (
                <p className="text-sm">
                  Latest quote{" "}
                  <span className="font-mono">{formatMoney(latestQuote.amount, latestQuote.currency)}</span>
                </p>
              ) : null}
              {totalOutstanding > 0 ? (
                <p className="text-sm text-[var(--status-warning-text)]">
                  {formatMoney(totalOutstanding, lead.currency)} outstanding across{" "}
                  {openInvoices.length} invoice{openInvoices.length === 1 ? "" : "s"}
                </p>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Nothing outstanding.</p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setTab("documents")}
              >
                Open documents
              </Button>
            </RailSection>
          ) : null}

          <RailSection title="Details">
            <AttributesPanel lead={lead} />
          </RailSection>
        </>
      }
    >


      <LeadFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        owners={owners}
        initial={{
          id: lead.id,
          title: lead.title ?? "",
          clientId: lead.clientId ?? "",
          contactName: lead.contactName ?? "",
          contactEmail: lead.contactEmail ?? "",
          contactPhone: lead.contactPhone ?? "",
          stage: lead.stage,
          estimatedValue: lead.estimatedValue !== null ? String(lead.estimatedValue) : "",
          currency: lead.currency,
          probability: lead.probability !== null ? String(lead.probability) : "",
          services: lead.services,
          source: lead.source ?? "",
          sourceChannel: lead.sourceChannel ?? "MANUAL",
          assignedToId: lead.assignedTo?.id ?? "",
        }}
      />

      <VisitScheduleSheet
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        subject={{ leadId, clientId: lead.clientId }}
        defaultLocation={
          [lead.client?.addressLine, lead.client?.city].filter(Boolean).join(", ") || null
        }
        owners={owners}
        currentUserId={currentUserId}
      />

      <VisitReportSheet
        open={Boolean(reportFor)}
        onOpenChange={(next) => (!next ? setReportFor(null) : undefined)}
        appointmentId={reportFor?.id ?? null}
        appointmentNo={reportFor?.appointmentNo}
        onCompleted={(items) => {
          const lines = draftsToLines(items);
          if (lines.length === 0 || !lead.clientId) return;
          // Straight from the site into a priced quotation — the whole point of
          // capturing measurements in a structured form.
          setQuotationPrefill(lines);
          setTab("documents");
          toast({
            title: "Ready to quote",
            description: `${lines.length} measured item${lines.length === 1 ? "" : "s"} carried into a new quotation.`,
          });
        }}
      />

      <ConvertLeadSheet open={convertOpen} onOpenChange={setConvertOpen} leadId={leadId} />

      <LostReasonDialog
        open={pendingLost}
        leadLabel={lead.title ?? lead.leadNo}
        isPending={changeStage.isPending}
        onCancel={() => setPendingLost(false)}
        onConfirm={(reason) =>
          changeStage.mutate(
            { stage: "LOST", lostReason: reason },
            { onSettled: () => setPendingLost(false) },
          )
        }
      />
    </RecordPageShell>
  );
}
