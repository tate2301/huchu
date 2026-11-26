"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ciNavIcon } from "@/components/books/icons/nav-icon";
import { ci_handshake } from "@/components/books/icons/glyphs";
import {
  Building2,
  Calendar,
  CalendarCheck,
  ChartLine,
  ChatCircle,
  Checklist,
  Clock,
  FileText,
  Mail,
  MapPin,
  Payments,
  Phone,
  Plus,
  Receipt,
  Tag,
  TrendingUp,
  UserRound,
  Users,
  Work,
} from "@/lib/icons";
import { daysSince, dealStageStatus, resolveNextStep } from "@/lib/crm/tones";
import {
  fetchCrmFieldDefinitions,
  fetchCrmTasks,
  type CrmFieldDefinitionRecord,
  type CrmLeadOwner,
} from "@/lib/crm/crm-v2";
import { isDealStale } from "@/lib/crm/pipelines";
import { visitItemsToQuotationLines } from "@/lib/crm/site-visits";
import type { CrmDocumentLineInput } from "@/lib/crm/accounting-bridge";
import { buildStory } from "@/lib/crm/story";

import {
  ConversationComposer,
  useComposeShortcut,
  type ComposeRequest,
  type ContactKind,
} from "@/components/crm/collaboration/conversation-composer";
import { DocumentList } from "@/components/crm/documents/document-list";
import { useDocumentActions } from "@/components/crm/documents/document-actions";
import { formatMoney, invoiceOutstanding } from "@/components/crm/documents/document-types";
import type { LeadDocument } from "@/components/crm/documents/document-types";
import {
  automationTab,
  historyTab,
  moneyTab,
  paperworkTab,
  tasksTab,
  useRecordComments,
} from "./record-tabs";
import { EmailPreview, MeetingCard } from "./record-panels";
import { NextStepButton, STEP_ICON } from "./next-step-card";
import { NextActionCard, dueText, type NextAction } from "./next-action-card";
import { BillingSection, ContactCounts } from "./details-sections";
import { RecordStory } from "@/components/crm/records/record-story";
import { VisitsTab } from "@/components/crm/lead-detail/visits-tab";
import type { LeadActivity, LeadAppointment, LeadFollowUp } from "@/components/crm/lead-detail/lead-types";
import { VisitReportSheet, type MeasurementDraft } from "@/components/crm/visits/visit-report-sheet";
import { VisitScheduleSheet } from "@/components/crm/visits/visit-schedule-sheet";
import { useJobsTab } from "@/components/crm/work-orders/jobs-tab";
import { StartProjectDialog } from "@/components/crm/money/start-project-dialog";
import { TaskFormSheet } from "@/components/crm/tasks/task-form-sheet";
import { useTaskCompletion } from "@/components/crm/tasks/use-task-completion";

import { customFieldAttributes } from "@/components/records/custom-field-attributes";
import { CustomFieldDisplay } from "./custom-field-display";
import { RecordMark } from "@/components/records/record-mark";
import { DealContactsTab } from "./deal-contacts-tab";
import { RecordAttributes } from "@/components/records/record-attributes";
import { RelationAttribute } from "./relation-attribute";
import { useAttributeEditor } from "@/components/records/use-attribute-editor";
import { EntityLink } from "@/components/records/entity-link";
import { FaceStack } from "@/components/records/face-stack";
import { DealStageBar, StageChecklist } from "./deal-stage-bar";
import { RailSection, RecordPageShell, RecordRelated } from "@/components/records/record-page-shell";

import { RecordGroupsControl } from "@/components/crm/registers/record-groups-control";
import { useListHref } from "@/components/crm/registers/list-href";
import { VaneRecordSection } from "@/components/vane/vane-record-section";

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
  assignedTo: { id: string; name: string | null; image?: string | null } | null;
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
  /** The project this deal became. At most one; empty until it is started. */
  projects: Array<{ id: string; projectNo: string; name: string; status: string }>;
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

/** The channel each of the panel's Call / Email / Message buttons opens. */
const QUICK_CONTACT: Array<{ kind: ContactKind; label: string; icon: typeof Phone }> = [
  { kind: "CALL", label: "Call", icon: Phone },
  { kind: "EMAIL", label: "Email", icon: Mail },
  { kind: "WHATSAPP", label: "Message", icon: ChatCircle },
];

export function DealDetailPage({ dealId }: { dealId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const { data: session } = useSession();
  const listHref = useListHref("DEAL");
  const currentUserId = session?.user?.id;

  const [tab, setTab] = useState("timeline");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [startProjectOpen, setStartProjectOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [reportFor, setReportFor] = useState<LeadAppointment | null>(null);
  const [quotationPrefill, setQuotationPrefill] = useState<CrmDocumentLineInput[] | undefined>();
  const [compose, setCompose] = useState<ComposeRequest | null>(null);

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
    queryFn: () => fetchJson<{ data: CrmLeadOwner[] }>("/api/v2/crm/team"),
  });
  const fieldsQuery = useQuery({
    queryKey: ["crm", "field-definitions", "DEAL"],
    queryFn: () => fetchCrmFieldDefinitions("DEAL"),
  });
  // The same list, under the same key, as the Tasks section — so a task ticked
  // off there leaves the next-action queue here, and the other way round.
  const taskRecord = useMemo(() => ({ dealId }), [dealId]);
  const tasksQuery = useQuery({
    queryKey: ["crm-tasks", "record", taskRecord],
    queryFn: () => fetchCrmTasks({ ...taskRecord, queue: "ALL", limit: 100 }),
  });
  const completion = useTaskCompletion({ currentUserId });

  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);
  // Comments join the story rather than sitting in a section of their own.
  const comments = useRecordComments({ kind: "deal", id: dealId });
  const definitions: CrmFieldDefinitionRecord[] = fieldsQuery.data?.data ?? [];
  const deal = dealQuery.data;
  const project = deal?.projects?.[0] ?? null;

  // Quote, Invoice, Record payment and Remind are pressed from the header, the
  // figures, the next action and the panel — one set of sheets for all of them.
  const money = useDocumentActions({
    basePath: `/api/v2/crm/deals/${dealId}`,
    currency: deal?.currency ?? "USD",
  });

  /** Open the composer, on the conversation, ready for this. */
  const openComposer = useCallback((mode: ComposeRequest["mode"], kind?: ContactKind) => {
    setTab("timeline");
    setCompose({ mode, kind, nonce: Date.now() });
  }, []);
  useComposeShortcut(useCallback(() => openComposer("COMMENT"), [openComposer]));

  // The work the deal has turned into. Raising one is the same act wherever it
  // is pressed from — the bar's next step, the actions menu, or the section
  // itself — so there is one sheet, and afterwards the section it landed in
  // opens. Called above the early returns, because a hook must be.
  const jobs = useJobsTab({
    ref: { kind: "deal", id: dealId },
    currentUserId,
    // Once the deal is a project, its jobs are raised inside that project.
    links: {
      clientId: deal?.clientId,
      siteId: deal?.site?.id,
      project: project ? { id: project.id, label: `${project.projectNo} — ${project.name}` } : null,
    },
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
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
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

  const openTasks = (tasksQuery.data?.data ?? [])
    .filter((task) => task.status === "OPEN")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const nextVisit = deal.appointments.find((visit) => visit.status === "SCHEDULED");

  const contactActivities = deal.activities.filter((activity) =>
    ["CALL", "EMAIL", "WHATSAPP", "MEETING", "NOTE"].includes(activity.type),
  );
  const lastContactAt = contactActivities[0]?.occurredAt;

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
   * The one obvious next move, chosen from where the deal actually is.
   *
   * `resolveNextStep` decides it for the bar and for the head of the
   * next-action queue alike, so the two cannot recommend different things —
   * and a lead, which is the same sale before conversion, gets the same ladder.
   */
  const nextStep = resolveNextStep({
    kind: "deal",
    stage: deal.status,
    daysSinceContact: daysSince(lastContactAt),
    scheduled: Boolean(openTasks[0] || nextVisit),
    visitBooked: Boolean(nextVisit),
    visitDone: deal.appointments.some((visit) => visit.status === "COMPLETED"),
    quoteSent: Boolean(latestQuote),
    quoteAnswered: Boolean(latestQuote?.approval?.respondedAt),
    owed: totalOutstanding > 0,
    hasProject: Boolean(project),
  });

  // Quoting needs somebody to bill. The button stays visible and says why it
  // cannot be pressed, rather than the page silently offering something else.
  const noCompany = !deal.clientId;
  const stepBlocked = nextStep?.action === "quote" && noCompany;

  const takeNextStep = () => {
    switch (nextStep?.action) {
      case "visit":
        setScheduleOpen(true);
        return;
      case "project":
        setStartProjectOpen(true);
        return;
      case "open-project":
        if (project) router.push(`/crm/projects/${project.id}`);
        return;
      case "job":
        jobs.raise();
        return;
      case "quote":
        money.create("quotation");
        return;
      case "payment":
        if (openInvoices[0]) money.openPayment(openInvoices[0]);
        else setTab("documents");
        return;
      case "chase":
        setTab("documents");
        return;
      default:
        // A call is booked as a follow-up with a date on it.
        setTaskOpen(true);
    }
  };

  // What the next step is about, in the record's own references.
  const stepMeta = (() => {
    if (nextStep?.action === "payment" && openInvoices[0]?.invoice) {
      const invoice = openInvoices[0].invoice;
      return `${invoice.invoiceNumber} · ${formatMoney(invoiceOutstanding(invoice), deal.currency)} not collected`;
    }
    return nextStep?.reason ?? null;
  })();

  const nextActions: NextAction[] = [
    ...(nextStep
      ? [
          {
            id: `step-${nextStep.action}`,
            icon: STEP_ICON[nextStep.action],
            title: nextStep.label,
            meta: stepMeta,
            due: nextStep.urgent ? "Now" : null,
            urgent: nextStep.urgent || stale,
            act: {
              label: nextStep.label,
              onAct: takeNextStep,
              disabled: stepBlocked,
              disabledReason: "Attach a company before quoting",
            },
          },
        ]
      : []),
    ...openTasks.map((task) => {
      const due = dueText(task.dueAt);
      return {
        id: task.id,
        icon: Checklist,
        title: task.title,
        meta: task.assignedTo?.name ?? null,
        due: due.text,
        urgent: due.late,
        act: { label: "Open", onAct: () => setTab("tasks") },
        onDone: () => completion.toggle(task),
      };
    }),
  ];

  const people = [
    ...(deal.assignedTo ? [{ id: deal.assignedTo.id, name: deal.assignedTo.name, image: deal.assignedTo.image }] : []),
    ...deal.contacts.map((contact) => ({ id: contact.person.id, name: contact.person.fullName })),
  ];

  return (
    <>
      <RecordPageShell
        icon={ciNavIcon(ci_handshake)}
        toolbar={
          <>
            {people.length > 0 ? <FaceStack people={people} /> : null}
            <span className="rec-bgroup-joined">
              <Button
                size="sm"
                variant="secondary"
                disabled={noCompany}
                title={noCompany ? "Attach a company before quoting" : "New quotation"}
                onClick={() => money.create("quotation")}
              >
                <FileText className="size-4" aria-hidden="true" />
                Quote
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={noCompany}
                title={noCompany ? "Attach a company before invoicing" : "New invoice"}
                onClick={() => money.create("invoice")}
              >
                <Receipt className="size-4" aria-hidden="true" />
                Invoice
              </Button>
              <Button size="sm" variant="secondary" title="New task" onClick={() => setTaskOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Task
              </Button>
            </span>
          </>
        }
        backHref={listHref}
        backLabel="Deals"
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
            items={[
              ...(deal.clientId && deal.client
                ? [
                    {
                      href: `/crm/companies/${deal.clientId}`,
                      label: deal.client.name,
                      dot: "bg-[var(--brand)]",
                    },
                  ]
                : []),
              ...(project
                ? [
                    {
                      href: `/crm/projects/${project.id}`,
                      label: project.name,
                      dot: "bg-[var(--badge-ok-fg)]",
                    },
                  ]
                : []),
            ]}
          />
        }
        stage={
          <DealStageBar
            dealId={dealId}
            stages={deal.pipeline.stages}
            currentStageId={deal.stage.id}
            pipelineName={deal.pipeline.name}
          />
        }
        // The chip is labelled with the *stage*, so it is coloured by the
        // stage, not by the deal's outcome.
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
        kpis={[
          {
            label: "Deal value",
            icon: <Payments />,
            value: deal.value == null ? "—" : formatMoney(deal.value, deal.currency),
            sub:
              deal.probability != null
                ? `${deal.probability}% probability · ${deal.forecastCategory.replace("_", " ").toLowerCase()}`
                : deal.stage.name,
          },
          {
            label: "Latest quote",
            icon: <FileText />,
            value: latestQuote ? formatMoney(latestQuote.amount, latestQuote.currency) : "—",
            sub: latestQuote ? latestQuote.quotation?.quotationNumber ?? "Quotation sent" : "Not quoted yet",
          },
          {
            label: "Outstanding",
            icon: <Receipt />,
            value: formatMoney(totalOutstanding, deal.currency),
            tone: totalOutstanding > 0 ? "warn" : "default",
            sub: `${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`,
            action:
              openInvoices[0] != null
                ? { label: "Record payment", onClick: () => money.openPayment(openInvoices[0]) }
                : null,
          },
          {
            label: "Open tasks and visits",
            icon: <CalendarCheck />,
            value: String(openTasks.length + (nextVisit ? 1 : 0)),
            tone: openTasks.some((task) => dueText(task.dueAt).late) ? "warn" : "default",
            sub: `${deal.appointments.length} visit${deal.appointments.length === 1 ? "" : "s"} total`,
            action: { label: "Book visit", onClick: () => setScheduleOpen(true) },
          },
        ]}
        primaryAction={
          nextStep ? (
            <NextStepButton
              step={nextStep}
              onAct={takeNextStep}
              disabled={stepBlocked}
              disabledReason="Attach a company before quoting"
            />
          ) : null
        }
        actions={[
          { label: "Schedule a site visit", onSelect: () => setScheduleOpen(true) },
          // Offered before the deal is won as well: a customer who has said
          // yes on the phone is work somebody wants to start planning.
          ...(project
            ? []
            : [{ label: "Start the project", onSelect: () => setStartProjectOpen(true) }]),
          { label: "Raise a job", onSelect: jobs.raise },
          { label: "Open money", onSelect: () => setTab("documents") },
        ]}
        activeTab={tab}
        quickActions={QUICK_CONTACT.map((entry) => {
          const Icon = entry.icon;
          return (
            <Button
              key={entry.kind}
              size="sm"
              variant="secondary"
              onClick={() => openComposer("CONTACT", entry.kind)}
            >
              <Icon className="size-4" aria-hidden="true" />
              {entry.label}
            </Button>
          );
        })}
        railHead={
          <>
            {deal.lostReason ? (
              <RailSection title="Why it was lost">
                <p className="text-sm text-[var(--status-error-text)]">{deal.lostReason}</p>
              </RailSection>
            ) : null}
            <BillingSection
              documents={deal.documents}
              currency={deal.currency}
              onOpen={() => setTab("documents")}
              onRecordPayment={money.openPayment}
              onRemind={money.openEmail}
              onQuote={noCompany ? undefined : () => money.create("quotation")}
            />
          </>
        }
        attributes={
          <RecordAttributes
            attributes={[
              {
                id: "value",
                label: "Value",
                icon: Payments,
                placeholder: "Not sized",
                // The figure the whole record is about, so it is drawn as one.
                tone: "money",
                ...edit.numeric("value", deal.value),
                // A bare "9800" beside a deal in a workspace that bills in two
                // currencies is a number you have to go and check. Editing
                // still opens on the raw figure.
                formatted:
                  deal.value == null ? null : formatMoney(deal.value, deal.currency),
              },
              // Stage is deliberately not a property row: the stage menu in the
              // app bar is the control for it, and it gates on the stage's
              // requirements and asks for a reason on the way to Lost.
              {
                id: "owner",
                label: "Owner",
                icon: UserRound,
                placeholder: "Unassigned",
                // Red when nobody owns it: a deal that is nobody's job is the
                // commonest reason one goes quiet.
                tone: deal.assignedTo ? "strong" : "alert",
                ...edit.choice(
                  "assignedToId",
                  deal.assignedTo?.id ?? null,
                  owners.map((member) => ({
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
                placeholder: "Not set",
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
                placeholder: "Not scored",
                ...edit.numeric("probability", deal.probability),
                formatted: deal.probability == null ? null : `${deal.probability}%`,
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
                id: "groups",
                label: "Groups",
                icon: Tag,
                display: <RecordGroupsControl entity="DEAL" recordId={deal.id} />,
              },
              {
                id: "project",
                label: "Project",
                icon: Work,
                // Not editable here: a deal has one project, started once, and
                // its own page is where it is changed.
                display: project ? (
                  <EntityLink href={`/crm/projects/${project.id}`}>{project.name}</EntityLink>
                ) : undefined,
                value: project ? project.name : null,
                placeholder: "Not started",
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
            value: "timeline",
            label: "Conversation",
            icon: Clock,
            content: (
              <div className="rec-conv space-y-4">
                <NextActionCard actions={nextActions} onNewTask={() => setTaskOpen(true)} />
                <ConversationComposer target={{ kind: "deal", id: dealId }} request={compose} />
                <RecordStory
                  filterable
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
          moneyTab({
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
          paperworkTab({
            ref: { kind: "deal", id: dealId },
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
            count: openTasks.length,
            attention: openTasks.some((task) => dueText(task.dueAt).late),
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
            {deal.stage.checklist && deal.stage.checklist.length > 0 ? (
              <StageChecklist
                title={`${deal.stage.name} checklist`}
                checklist={deal.stage.checklist}
              />
            ) : null}

            <ContactCounts
              counts={[
                {
                  key: "call",
                  label: "Calls",
                  value: deal.activities.filter((activity) => activity.type === "CALL").length,
                  onLog: () => openComposer("CONTACT", "CALL"),
                },
                {
                  key: "email",
                  label: "Emails",
                  value: deal.activities.filter((activity) => activity.type === "EMAIL").length,
                  onLog: () => openComposer("CONTACT", "EMAIL"),
                },
                {
                  key: "note",
                  label: "Notes",
                  value:
                    comments.length +
                    deal.activities.filter((activity) => activity.type === "NOTE").length,
                  onLog: () => openComposer("COMMENT"),
                },
              ]}
            />

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

            <RailSection title="Last email">
              <EmailPreview message={lastEmail} />
              {lastEmail ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => openComposer("CONTACT", "EMAIL")}
                >
                  <Mail className="size-4" aria-hidden="true" />
                  Log a reply
                </Button>
              ) : null}
            </RailSection>

            <VaneRecordSection type="CrmDeal" id={dealId} noun="deal" />

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
        onCompleted={(items, drafted) => {
          // What the forms drafted from the measurements first, then anything
          // measured item by item.
          const lines = [...drafted, ...draftsToLines(items)];
          if (lines.length === 0 || !deal.clientId) return;
          setQuotationPrefill(lines);
          setTab("documents");
          toast({
            title: "Ready to quote",
            description: `${lines.length} line${lines.length === 1 ? "" : "s"} from the visit carried into a new quotation.`,
          });
        }}
      />

      <TaskFormSheet
        open={taskOpen}
        onOpenChange={setTaskOpen}
        record={taskRecord}
        currentUserId={currentUserId}
        onCreated={() => setTaskOpen(false)}
      />

      {jobs.sheet}
      {money.surfaces}
      {completion.dialogs}

      <StartProjectDialog
        open={startProjectOpen}
        onOpenChange={setStartProjectOpen}
        deal={{
          id: deal.id,
          title: deal.title,
          value: deal.value,
          currency: deal.currency,
          ownerId: deal.assignedTo?.id ?? null,
        }}
      />
    </>
  );
}
