"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  Building2,
  Calendar,
  CalendarCheck,
  ChartLine,
  Clock,
  Funnel,
  Mail,
  MapPin,
  NoteAdd,
  Payments,
  Phone,
  TrendingUp,
  UserRound,
  Users,
} from "@corelithzw/ui/lib/icons";
import { daysSince, dealStageStatus, resolveNextStep } from "@/lib/crm/tones";
import { fetchCrmFieldDefinitions, type CrmFieldDefinitionRecord } from "@/lib/crm/crm-v2";
import { isDealStale } from "@/lib/crm/pipelines";
import { visitItemsToQuotationLines } from "@/lib/crm/site-visits";
import type { CrmDocumentLineInput } from "@/lib/crm/accounting-bridge";

import { ConversationComposer } from "@/components/crm/collaboration/conversation-composer";
import { DocumentList } from "@/components/crm/documents/document-list";
import { formatMoney, invoiceOutstanding } from "@/components/crm/documents/document-types";
import type { LeadDocument } from "@/components/crm/documents/document-types";
import {
  automationTab,
  historyTab,
  paperworkTab,
  tasksTab,
  useRecordComments,
} from "./record-tabs";
import {
  ContactList,
  ContactTally,
  EmailPreview,
  MeetingCard,
  NextInteractionCard,
  type NextInteraction,
  type RailTally,
} from "./record-panels";
import { NextStepButton, NextStepCard } from "./next-step-card";
import { CONTACT_ACTIVITY_KIND } from "@/components/crm/records/event-kind";
import { RecordStory } from "@/components/crm/records/record-story";
import { buildStory } from "@/lib/crm/story";
import { VisitsTab } from "@/components/crm/lead-detail/visits-tab";
import type { LeadActivity, LeadAppointment, LeadFollowUp } from "@/components/crm/lead-detail/lead-types";
import type { LeadFilterOwner } from "@/components/crm/leads/leads-filters";
import { VisitReportSheet, type MeasurementDraft } from "@/components/crm/visits/visit-report-sheet";
import { VisitScheduleSheet } from "@/components/crm/visits/visit-schedule-sheet";
import { useJobsTab } from "@/components/crm/work-orders/jobs-tab";

import { customFieldAttributes } from "@corelithzw/module-records/components/custom-field-attributes";
import { CustomFieldDisplay } from "./custom-field-display";
import { RecordMark } from "@corelithzw/module-records/components/record-mark";
import { DealContactsTab } from "./deal-contacts-tab";
import { RecordAttributes } from "@corelithzw/module-records/components/record-attributes";
import { RelationAttribute } from "./relation-attribute";
import { useAttributeEditor } from "@corelithzw/module-records/components/use-attribute-editor";
import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { DealStageBar, StageChecklist } from "./deal-stage-bar";
import { RailSection, RecordPageShell, RecordRelated } from "@corelithzw/module-records/components/record-page-shell";

import { Stack } from "@corelithzw/react";

const ROLE_LABELS: Record<string, string> = {
  PRIMARY: "Primary contact",
  DECISION_MAKER: "Decision-maker",
  FINANCE: "Finance",
  SITE: "Site contact",
  TECHNICAL: "Technical",
  INFLUENCER: "Influencer",
  REFERRER: "Referrer",
};

type DealDetail = {
  id: string;
  dealNo: string;
  title: string;
  status: "OPEN" | "WON" | "LOST";
  value: number | null;
  currency: string;
  probability: number | null;
  forecastCategory: string;
  expectedCloseDate: string | null;
  stageEnteredAt: string;
  lostReason: string | null;
  avatarUrl: string | null;
  emoji: string | null;
  customFields: Record<string, unknown> | null;
  clientId: string | null;
  client: { id: string; name: string } | null;
  primaryContact: { id: string; fullName: string } | null;
  site: { id: string; name: string; addressLine: string | null; city: string | null } | null;
  assignedTo: { id: string; name: string | null } | null;
  stage: {
    id: string;
    name: string;
    status: "OPEN" | "WON" | "LOST";
    inactivityDays: number | null;
    checklist: Array<{ key: string; label: string }> | null;
  };
  pipeline: {
    id: string;
    name: string;
    stages: Array<{ id: string; name: string; status: "OPEN" | "WON" | "LOST"; position: number }>;
  };
  contacts: Array<{
    id: string;
    role: string;
    person: { id: string; fullName: string; jobTitle: string | null; email: string | null; phone: string | null };
  }>;
  activities: LeadActivity[];
  followUps: LeadFollowUp[];
  appointments: LeadAppointment[];
  documents: LeadDocument[];
};

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

export function DealDetailPage({ dealId }: { dealId: string }) {
  const { toast } = useToast();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const [tab, setTab] = useState("timeline");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reportFor, setReportFor] = useState<LeadAppointment | null>(null);
  const [quotationPrefill, setQuotationPrefill] = useState<CrmDocumentLineInput[] | undefined>();

  const dealQuery = useQuery({
    queryKey: ["crm", "deal", dealId],
    queryFn: () => fetchJson<DealDetail>(`/api/v2/crm/deals/${dealId}`),
  });
  const edit = useAttributeEditor({
    path: `/api/v2/crm/deals/${dealId}`,
    invalidate: [["crm", "deal", dealId], ["crm", "deals"]],
  });
  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: LeadFilterOwner[] }>("/api/v2/crm/team"),
  });
  const fieldsQuery = useQuery({
    queryKey: ["crm", "field-definitions", "DEAL"],
    queryFn: () => fetchCrmFieldDefinitions("DEAL"),
  });

  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);
  // Comments join the story rather than sitting in a section of their own.
  const comments = useRecordComments({ kind: "deal", id: dealId });
  const definitions: CrmFieldDefinitionRecord[] = fieldsQuery.data?.data ?? [];
  const deal = dealQuery.data;

  // The work the deal has turned into. Raising one is the same act wherever it
  // is pressed from — the bar's next step, the actions menu, or the section
  // itself — so there is one sheet, and afterwards the section it landed in
  // opens. Called above the early returns, because a hook must be.
  const jobs = useJobsTab({
    ref: { kind: "deal", id: dealId },
    currentUserId,
    links: { clientId: deal?.clientId, siteId: deal?.site?.id },
    defaultTitle: deal?.title,
    quotationDocuments: (deal?.documents ?? [])
      .filter((doc) => doc.type === "QUOTATION" && doc.quotation)
      .map((doc) => ({
        id: doc.id,
        label: `${doc.quotation!.quotationNumber}${doc.version > 1 ? ` (v${doc.version})` : ""}`,
      })),
    onRaised: () => setTab("jobs"),
  });

  if (dealQuery.isLoading) {
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

  if (dealQuery.error || !deal) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Deal not found</AlertTitle>
        <AlertDescription>
          {dealQuery.error ? getApiErrorMessage(dealQuery.error) : "It may have been deleted."}
        </AlertDescription>
      </Alert>
    );
  }

  const openTasks = deal.followUps.filter((task) => task.status === "PENDING");
  const nextTask = openTasks[0];
  const nextVisit = deal.appointments.find((visit) => visit.status === "SCHEDULED");

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
      candidates.sort(
        (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
      )[0] ?? null
    );
  })();

  // Every kind of contact, newest first — not calls only. The panel is titled
  // "contact so far", and showing three calls under a strip that counts five
  // kinds made a record whose last month was all email read as silent.
  const recentContact = deal.activities
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
  // were. A deal nobody has rung has an empty contact list, which reads as
  // "nothing to show" rather than as the reason it is going nowhere.
  const contactTallies: RailTally[] = [
    {
      label: "Calls logged",
      value: deal.activities.filter((activity) => activity.type === "CALL").length,
      icon: Phone,
    },
    {
      label: "Emails sent",
      value: deal.activities.filter((activity) => activity.type === "EMAIL").length,
      icon: Mail,
    },
    {
      label: "Notes left",
      value: deal.activities.filter((activity) => activity.type === "NOTE").length,
      icon: NoteAdd,
    },
  ];

  const lastEmail = (() => {
    const found = deal.activities.find((activity) => activity.type === "EMAIL");
    return found
      ? { id: found.id, subject: found.subject, body: found.body, at: found.occurredAt }
      : null;
  })();
  const openInvoices = deal.documents.filter(
    (doc) => doc.type === "INVOICE" && doc.invoice && invoiceOutstanding(doc.invoice) > 0,
  );
  const totalOutstanding = openInvoices.reduce(
    (sum, doc) => sum + (doc.invoice ? invoiceOutstanding(doc.invoice) : 0),
    0,
  );
  const stale = isDealStale(
    { stageEnteredAt: deal.stageEnteredAt, status: deal.status },
    { inactivityDays: deal.stage.inactivityDays, status: deal.stage.status },
  );

  const latestQuote = deal.documents.find((doc) => doc.type === "QUOTATION");

  // Where this stage sits among the ones a deal can be worked in, which is all
  // a configurable pipeline can tell us about how far along it is.
  const openStages = deal.pipeline.stages
    .filter((stage) => stage.status === "OPEN")
    .sort((a, b) => a.position - b.position);
  const stagePosition = openStages.findIndex((stage) => stage.id === deal.stage.id);

  /**
   * The one obvious next action, chosen from where the deal actually is.
   *
   * This page used to chain the decision inline, off document and visit
   * counts, and the rail underneath it said "Nothing scheduled" with nothing
   * to press. Both now come out of `resolveNextStep`, so the bar and the rail
   * cannot end up recommending different things — and a lead, which is the
   * same sale before conversion, gets the same ladder.
   */
  const nextStep = resolveNextStep({
    kind: "deal",
    stage: deal.status,
    daysSinceContact: daysSince(recentContact[0]?.at),
    scheduled: Boolean(nextInteraction),
    visitBooked: Boolean(nextVisit),
    visitDone: deal.appointments.some((visit) => visit.status === "COMPLETED"),
    quoteSent: Boolean(latestQuote),
    quoteAnswered: Boolean(latestQuote?.approval?.respondedAt),
    owed: totalOutstanding > 0,
  });

  // Quoting needs somebody to bill. The button stays visible and says why it
  // cannot be pressed, rather than the page silently offering something else.
  const stepBlocked = nextStep?.action === "quote" && !deal.clientId;

  const takeNextStep = () => {
    switch (nextStep?.action) {
      case "visit":
        setScheduleOpen(true);
        return;
      case "job":
        jobs.raise();
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

  const primaryAction = nextStep ? (
    <NextStepButton
      step={nextStep}
      onAct={takeNextStep}
      disabled={stepBlocked}
      disabledReason="Attach a company before quoting"
    />
  ) : null;

  return (
    <>
      <RecordPageShell
      icon={Funnel}
        backHref="/crm/deals"
        backLabel="All deals"
        leading={
          <RecordMark
            kind="deal"
            name={deal.title}
            emoji={deal.emoji}
            avatarUrl={deal.avatarUrl}
            size="md"
          />
        }
        title={deal.title}
      onTitleCommit={(next) => edit.save.mutate({ title: next })}
        reference={deal.dealNo}
        related={
          <RecordRelated
            items={
              deal.clientId && deal.client
                ? [
                    {
                      href: `/crm/companies/${deal.clientId}`,
                      label: deal.client.name,
                      dot: "bg-[var(--brand)]",
                    },
                  ]
                : []
            }
          />
        }
        bandValue={deal.value == null ? undefined : formatMoney(deal.value, deal.currency)}
        beforeTabs={
          <DealStageBar
            compact
            dealId={dealId}
            stages={deal.pipeline.stages}
            currentStageId={deal.stage.id}
            checklist={deal.stage.checklist}
            pipelineName={deal.pipeline.name}
          />
        }
        // The chip is labelled with the *stage*, so it is coloured by the
        // stage. Coloured by the deal's outcome instead, as it was, every open
        // deal in the pipeline wore one hue whether it was a first phone call
        // or a signed quote waiting on a deposit.
        status={{
          label: deal.stage.name,
          status: dealStageStatus(deal.stage.status, stagePosition, openStages.length),
        }}
        subtitle={
          <>
            <EntityLink
              href={deal.clientId ? `/crm/companies/${deal.clientId}` : null}
              muted
            >
              {deal.client?.name ?? "No company"}
            </EntityLink>
            {" · "}
            <EntityLink
              href={deal.assignedTo ? `/crm/reps/${deal.assignedTo.id}` : null}
              muted
            >
              {deal.assignedTo?.name ?? "Unassigned"}
            </EntityLink>
            {stale ? " · going cold" : ""}
          </>
        }
        primaryAction={primaryAction}
        actions={[
          { label: "Schedule a site visit", onSelect: () => setScheduleOpen(true) },
          { label: "Raise a job", onSelect: jobs.raise },
          { label: "Open documents", onSelect: () => setTab("documents") },
        ]}
        activeTab={tab}
        attributes={
          <RecordAttributes
            attributes={[
              {
                id: "value",
                label: "Value",
                icon: Payments,
                placeholder: "Not sized",
                // The figure the whole record is about, so it is drawn as one:
                // mono and heavy, in the strongest ink on the page. `mono`
                // alone made it the same weight and colour as a phone number.
                tone: "money",
                ...edit.numeric("value", deal.value),
                // A bare "9800" beside a deal in a workspace that bills in two
                // currencies is a number you have to go and check. Editing
                // still opens on the raw figure.
                formatted:
                  deal.value == null ? null : formatMoney(deal.value, deal.currency),
              },
              // Stage is deliberately not a property row. `DealStageBar` in
              // the rail below is the control for it, and it is the richer one
              // — it gates on the stage's checklist and asks for a reason on
              // the way to Lost. A second, plainer editor up here would route
              // around both, and two ways to move a deal is how a pipeline
              // stops meaning anything.
              {
                id: "owner",
                label: "Owner",
                icon: UserRound,
                placeholder: "Unassigned",
                // Red when nobody owns it. A deal that is nobody's job is the
                // single commonest reason one goes quiet, and it was reading
                // as faint grey — the same ink as a field nobody has filled in
                // because nobody needed to.
                tone: deal.assignedTo ? "strong" : "alert",
                // A choice, not a label: who owns a deal is the property that
                // changes most and was the one you could not change from here.
                ...edit.choice(
                  "assignedToId",
                  deal.assignedTo?.id ?? null,
                  (teamQuery.data?.data ?? []).map((member) => ({
                    value: member.id,
                    label: member.name ?? "Unnamed",
                  })),
                  "Leave unassigned",
                ),
              },
              {
                id: "company",
                label: "Company",
                icon: Building2,
                // The same blue a company wears in the table beside this one.
                // Left off when there is nothing linked, so the picker's own
                // placeholder stays the quiet grey a placeholder should be.
                tone: deal.client ? "link" : undefined,
                display: (
                  <RelationAttribute
                    value={deal.client?.name ?? null}
                    href={deal.client ? `/crm/companies/${deal.client.id}` : null}
                    types={["COMPANY"]}
                    placeholder="No company"
                    searchPlaceholder="Search companies"
                    onPick={(record) => edit.save.mutate({ clientId: record.id })}
                    onClear={() => edit.save.mutate({ clientId: null })}
                  />
                ),
              },
              {
                id: "close",
                label: "Expected close",
                icon: Calendar,
                kind: "date" as const,
                placeholder: "No date set",
                // The stored value is an ISO instant and the editor wants a
                // calendar day, so the row opens on the day and reads back as
                // the reader's own format.
                value: deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : null,
                formatted: deal.expectedCloseDate
                  ? new Date(deal.expectedCloseDate).toLocaleDateString()
                  : null,
                onCommit: (next: string) =>
                  edit.save.mutate({ expectedCloseDate: next.trim() === "" ? null : next }),
              },
              {
                id: "probability",
                label: "Likelihood",
                icon: TrendingUp,
                mono: true,
                placeholder: "0",
                ...edit.numeric("probability", deal.probability),
              },
              {
                id: "forecast",
                label: "Forecast",
                icon: ChartLine,
                ...edit.choice("forecastCategory", deal.forecastCategory, [
                  { value: "PIPELINE", label: "Pipeline" },
                  { value: "BEST_CASE", label: "Best case" },
                  { value: "COMMIT", label: "Commit" },
                  { value: "CLOSED", label: "Closed" },
                ]),
              },
              {
                id: "site",
                label: "Site",
                icon: MapPin,
                tone: deal.site ? "link" : undefined,
                display: (
                  <RelationAttribute
                    value={deal.site?.name ?? null}
                    href={deal.site ? `/crm/sites/${deal.site.id}` : null}
                    types={["SITE"]}
                    placeholder="No site"
                    searchPlaceholder="Search sites"
                    onPick={(record) => edit.save.mutate({ siteId: record.id })}
                    onClear={() => edit.save.mutate({ siteId: null })}
                  />
                ),
              },
              ...customFieldAttributes({
                definitions,
                values: deal.customFields,
                onCommit: (key, value) =>
                  edit.save.mutate({ customFields: { [key]: value } }),
              }),
            ]}
          />
        }
        onTabChange={setTab}
        tabs={[
          {
            // Named Overview: on a phone the summary renders above it, and the
            // two read as one thing — what this deal is worth and what is
            // next, then what has actually happened to it.
            value: "timeline",
            label: "Conversation",
            icon: Clock,
            content: (
              <div className="space-y-4">
                <ConversationComposer target={{ kind: "deal", id: dealId }} />
                <RecordStory
                  events={buildStory({
                    activities: deal.activities,
                    tasks: deal.followUps,
                    visits: deal.appointments,
                    documents: deal.documents,
                    comments,
                    createdLabel: `Deal ${deal.dealNo} opened`,
                  })}
                  emptyMessage="Nothing has happened on this deal yet."
                />
              </div>
            ),
          },
          paperworkTab({
            ref: { kind: "deal", id: dealId },
            documentCount: deal.documents.length,
            documents: (
              <DocumentList
                basePath={`/api/v2/crm/deals/${dealId}`}
                currency={deal.currency}
                documents={deal.documents}
                canCreate={Boolean(deal.clientId)}
                prefillLines={quotationPrefill}
                onPrefillConsumed={() => setQuotationPrefill(undefined)}
              />
            ),
          }),
          // A job follows the paperwork: it is what the quote turns into.
          jobs.tab,
          {
            value: "people",
            label: "People",
            icon: Users,
            count: deal.contacts.length,
            content: <DealContactsTab dealId={dealId} contacts={deal.contacts} />,
          },
          {
            value: "visits",
            label: "Visits",
            icon: CalendarCheck,
            count: deal.appointments.length,
            attention: deal.appointments.some(
              (visit) =>
                visit.status === "SCHEDULED" && new Date(visit.scheduledStart) < new Date(),
            ),
            content: (
              <VisitsTab
                appointments={deal.appointments}
                onSchedule={() => setScheduleOpen(true)}
                onOpenReport={setReportFor}
              />
            ),
          },
          {
            ...tasksTab({ ref: { kind: "deal", id: dealId }, currentUserId }),
            count: deal.followUps.filter((task) => task.status === "PENDING").length,
            attention: deal.followUps.some(
              (task) => task.status === "PENDING" && new Date(task.dueAt) < new Date(),
            ),
          },
          automationTab({ ref: { kind: "deal", id: dealId } }),
          historyTab({
            ref: { kind: "deal", id: dealId },
            entity: "DEAL",
            activities: deal.activities,
          }),
        ]}
        rail={
          <>
            {deal.lostReason ? (
              <RailSection title="Why it was lost">
                <p className="text-sm text-[var(--status-error-text)]">{deal.lostReason}</p>
              </RailSection>
            ) : null}

            {/* The stage control itself is in the band now — see `beforeTabs`.
                What stays here is the stage's checklist, which is a stack and
                has nowhere to go in a 44px row. */}
            {deal.stage.checklist && deal.stage.checklist.length > 0 ? (
              <RailSection title="At this stage">
                <StageChecklist checklist={deal.stage.checklist} />
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
                <NextStepCard
                  step={nextStep}
                  onAct={takeNextStep}
                  disabled={stepBlocked}
                  disabledReason="Attach a company before quoting"
                />
              ) : nextInteraction ? null : (
                <p className="text-sm text-[var(--text-muted)]">
                  This deal is closed. Nothing is due on it.
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

            {deal.site ? (
              <RailSection title="Site">
                <p className="text-sm">
                  <EntityLink href={`/crm/sites/${deal.site.id}`}>{deal.site.name}</EntityLink>
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  {[deal.site.addressLine, deal.site.city].filter(Boolean).join(", ")}
                </p>
              </RailSection>
            ) : null}

            {totalOutstanding > 0 ? (
              <RailSection title="Billing">
                <p className="text-sm text-[var(--status-warning-text)]">
                  {formatMoney(totalOutstanding, deal.currency)} outstanding across{" "}
                  {openInvoices.length} invoice{openInvoices.length === 1 ? "" : "s"}
                </p>
              </RailSection>
            ) : null}

            {deal.contacts.length > 0 ? (
              <RailSection title="Contacts">
                <Stack as="ul" gap="xs">
                  {deal.contacts.map((contact) => (
                    <li key={contact.id} className="flex items-center justify-between gap-2 text-sm">
                      <EntityLink
                        href={`/crm/people/${contact.person.id}`}
                        className="min-w-0 truncate"
                      >
                        {contact.person.fullName}
                      </EntityLink>
                      <Badge variant="outline" className="shrink-0 text-sm">
                        {ROLE_LABELS[contact.role] ?? contact.role}
                      </Badge>
                    </li>
                  ))}
                </Stack>
              </RailSection>
            ) : null}

            <CustomFieldDisplay definitions={definitions} values={deal.customFields} />
          </>
        }
      />

      <VisitScheduleSheet
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        subject={{ dealId, clientId: deal.clientId, siteId: deal.site?.id ?? null }}
        defaultLocation={
          [deal.site?.addressLine, deal.site?.city].filter(Boolean).join(", ") || null
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
          if (lines.length === 0 || !deal.clientId) return;
          setQuotationPrefill(lines);
          setTab("documents");
          toast({
            title: "Ready to quote",
            description: `${lines.length} measured item${lines.length === 1 ? "" : "s"} carried into a new quotation.`,
          });
        }}
      />

      {jobs.sheet}
    </>
  );
}
