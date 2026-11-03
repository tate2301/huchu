"use client";

/**
 * One site visit, on a page of its own.
 *
 * A visit is two things at two times: before, who is going where and for
 * what; after, what they brought back. The page is laid out for the after,
 * because that is when it gets opened — the checklist and the measurements
 * first, then the answers to the visit's questions, then the photos with
 * where and when each was taken, since a photo with no location is one
 * somebody will ask about.
 *
 * Writing it up is the report dialog the list already opens, so a visit is
 * written up the same way from anywhere. What else can happen to a visit —
 * done, a no-show, called off — is in the menu, for whoever is going.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Skeleton } from "@corelithzw/react";
import {
  FactList,
  SectionHeading,
  StatusDot,
} from "@/components/management/ui";
import {
  RecordTable,
  type RecordTableColumn,
  RecordTableName,
  RecordCell,
} from "@/components/records/record-table";
import { formatDate } from "@/components/crm/money/money";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordPageShell, RecordRelated, type RecordAction } from "@/components/records/record-page-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatDimensions } from "@/lib/crm/site-visits";
import { VISIT_STATUS_LABELS, VISIT_TONE } from "@/lib/crm/tones";
import { ciNavIcon } from "@/components/books/icons/nav-icon";
import { ci_site_visit } from "@/components/books/icons/glyphs";
import {
  Calendar,
  CalendarCheck,
  Checklist,
  ClipboardText,
  Funnel,
  MapPin,
  PhotoCamera,
  Tag,
  User,
} from "@/lib/icons";

import { VisitReportSheet } from "./visit-report-sheet";

type Answer = {
  id: string;
  questionLabel: string;
  questionType: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  valueOptions: string[];
  valueDate: string | null;
  notes: string | null;
  notApplicable: boolean;
};

type Visit = {
  id: string;
  appointmentNo: string;
  title: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  scheduledStart: string;
  scheduledEnd: string | null;
  location: string | null;
  outcomeNotes: string | null;
  completedAt: string | null;
  checklist: Array<{ key: string; label: string; checked: boolean; notes?: string | null }> | null;
  siteConditions: string | null;
  reportNotes: string | null;
  reportCompletedAt: string | null;
  assignedTo: { id: string; name: string | null };
  createdBy: { id: string; name: string | null } | null;
  lead: { id: string; leadNo: string; title: string | null } | null;
  deal: { id: string; dealNo: string; title: string } | null;
  client: { id: string; name: string } | null;
  site: { id: string; name: string; addressLine: string | null } | null;
  visitItems: Array<{
    id: string;
    category: string | null;
    description: string;
    quantity: number;
    unit: string | null;
    widthMm: number | null;
    heightMm: number | null;
    depthMm: number | null;
    specNotes: string | null;
  }>;
  visitPhotos: Array<{
    id: string;
    url: string;
    fileName: string | null;
    contentType: string;
    caption: string | null;
    latitude: number | null;
    longitude: number | null;
    capturedAt: string | null;
  }>;
  sections: Array<{ id: string; name: string; kind: string; answers: Answer[] }>;
  followUps: Array<{ id: string; title: string; dueAt: string; status: string }>;
};

type ChecklistRow = {
  id: string;
  key: string;
  label: string;
  checked: boolean;
  notes?: string | null;
};

const CHECKLIST_COLUMNS: RecordTableColumn<ChecklistRow>[] = [
  {
    id: "item",
    label: "Item",
    cell: (item) => (
      <RecordTableName
        title={item.label}
        subtitle={item.notes ?? undefined}
      />
    ),
  },
  {
    id: "done",
    label: "Done",
    width: "6rem",
    align: "end",
    cell: (item) =>
      item.checked ? (
        <StatusDot tone="success" label="Done" />
      ) : (
        <span className="font-mono text-sm text-[var(--color-ink-3)]">—</span>
      ),
  },
];

/** An answer as somebody would say it. */
function answerText(answer: Answer): string {
  if (answer.notApplicable) return "Not applicable";
  const value =
    answer.valueText ??
    (answer.valueNumber !== null ? String(answer.valueNumber) : null) ??
    (answer.valueBool !== null ? (answer.valueBool ? "Yes" : "No") : null) ??
    (answer.valueOptions.length > 0 ? answer.valueOptions.join(", ") : null) ??
    (answer.valueDate ? formatDate(answer.valueDate) : null);
  const text = value ?? "Not answered";
  return answer.notes ? `${text} — ${answer.notes}` : text;
}

/** "25 Sept 2026, 09:30", in the zone it was booked in — the reader's. */
function when(value: string): string {
  const date = new Date(value);
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(value)}, ${time}`;
}

export function VisitRecordContent({ visitId }: { visitId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [writing, setWriting] = useState(false);
  const [tab, setTab] = useState("report");
  // Read once: "not written up" is a judgement made when the page was opened.
  const [now] = useState(() => Date.now());

  const query = useQuery({
    queryKey: ["crm", "appointments", "record", visitId],
    queryFn: () => fetchJson<{ visit: Visit; mayEdit: boolean }>(`/api/v2/crm/appointments/${visitId}`),
  });

  const move = useMutation({
    mutationFn: (status: Visit["status"]) =>
      fetchJson(`/api/v2/crm/appointments/${visitId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, status) => {
      toast({ title: `Visit marked ${VISIT_STATUS_LABELS[status]?.toLowerCase() ?? status}` });
      queryClient.invalidateQueries({ queryKey: ["crm", "appointments"] });
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={320} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title="Site visit not found">
        {query.error ? getApiErrorMessage(query.error) : "It may have been removed."}
      </Alert>
    );
  }

  const { visit, mayEdit } = query.data;
  const about = visit.deal
    ? { href: `/crm/deals/${visit.deal.id}`, label: visit.deal.title, kind: "Deal" }
    : visit.lead
      ? { href: `/crm/leads/${visit.lead.id}`, label: visit.lead.title ?? visit.lead.leadNo, kind: "Lead" }
      : visit.client
        ? { href: `/crm/companies/${visit.client.id}`, label: visit.client.name, kind: "Company" }
        : null;
  const writtenUp = Boolean(visit.reportCompletedAt);
  const overdue =
    visit.status === "SCHEDULED" && !writtenUp && new Date(visit.scheduledStart).getTime() < now;
  const checklist = visit.checklist ?? [];
  const checklistRows = checklist.map((item) => ({ ...item, id: item.key }));
  const unplaced = visit.visitPhotos.filter((photo) => photo.latitude === null || photo.longitude === null);
  const answerCount = visit.sections.reduce((sum, section) => sum + section.answers.length, 0);

  const attributes: RecordAttribute[] = [
    ...(about
      ? [{ id: "about", label: about.kind, icon: Funnel, display: <EntityLink href={about.href}>{about.label}</EntityLink> }]
      : []),
    {
      id: "site",
      label: "Site",
      icon: MapPin,
      display: visit.site ? <EntityLink href={`/crm/sites/${visit.site.id}`}>{visit.site.name}</EntityLink> : undefined,
      value: visit.site?.name ?? visit.location ?? null,
      placeholder: "No site named",
    },
    {
      id: "when",
      label: "When",
      icon: Calendar,
      tone: overdue ? "alert" : "code",
      value: when(visit.scheduledStart),
    },
    {
      id: "going",
      label: "Going",
      icon: User,
      display: <EntityLink href={`/crm/reps/${visit.assignedTo.id}`}>{visit.assignedTo.name ?? "Unnamed"}</EntityLink>,
    },
    {
      id: "status",
      label: "Status",
      icon: Tag,
      display: <StatusDot tone={VISIT_TONE[visit.status] ?? "neutral"} label={VISIT_STATUS_LABELS[visit.status] ?? visit.status} />,
    },
    {
      id: "report",
      label: "Report",
      icon: ClipboardText,
      tone: "code",
      value: visit.reportCompletedAt ? `Written up ${formatDate(visit.reportCompletedAt)}` : null,
      placeholder: "Not written up",
    },
    ...(visit.location && visit.location !== visit.site?.name
      ? [{ id: "location", label: "Where", icon: MapPin, value: visit.location }]
      : []),
    { id: "booked-by", label: "Booked by", icon: User, value: visit.createdBy?.name ?? null, placeholder: "Not recorded" },
  ];

  const menu: RecordAction[] =
    mayEdit && visit.status === "SCHEDULED"
      ? [
          { label: "Mark it done", icon: <CalendarCheck className="size-4" />, onSelect: () => move.mutate("COMPLETED") },
          { label: "They were not there", onSelect: () => move.mutate("NO_SHOW") },
          { label: "Cancel the visit", destructive: true, onSelect: () => move.mutate("CANCELLED") },
        ]
      : [];

  return (
    <RecordPageShell
      icon={ciNavIcon(ci_site_visit)}
      backHref="/crm/appointments"
      backLabel="Site visits"
      title={visit.title}
      reference={visit.appointmentNo}
      subtitle={about?.label}
      // Rule 5: booked and done are what a visit is; the toolbar speaks for the
      // rest — a visit that did not happen, and one that happened unwritten.
      status={
        visit.status === "CANCELLED"
          ? { status: "inactive", label: "Cancelled" }
          : visit.status === "NO_SHOW"
            ? { status: "failing", label: "No show" }
            : overdue
              ? { status: "need_changes", label: "Not written up" }
              : null
      }
      finding={
        overdue
          ? {
              label: "Field report overdue",
              fact: `This visit took place on ${when(visit.scheduledStart)}`,
              rest: "— write up the report and measurements so a quotation can be raised.",
              action: mayEdit
                ? {
                    label: "Write it up →",
                    onClick: () => setWriting(true),
                  }
                : undefined,
              tone: "danger" as const,
            }
          : unplaced.length > 0
            ? {
                label: "Geotag check",
                fact: `${unplaced.length} site photo${unplaced.length === 1 ? " has" : "s have"} no GPS coordinates`,
                rest: "— verify location metadata with the field rep.",
                tone: "warn" as const,
              }
            : null
      }
      kpis={[
        {
          label: "Scheduled for",
          value: formatDate(visit.scheduledStart),
          sub: visit.assignedTo.name ?? "Unassigned",
        },
        {
          label: "Checklist",
          value: checklist.length > 0 ? `${checklist.filter((i) => i.checked).length} / ${checklist.length}` : "—",
          tone: checklist.length > 0 && checklist.every((i) => i.checked) ? "up" : "default",
          sub: writtenUp ? "Report completed" : "Pending write-up",
        },
        {
          label: "Measurements",
          value: String(visit.visitItems.length),
          sub: visit.visitItems.length > 0 ? "Ready for quotation" : "None captured yet",
        },
        {
          label: "Site photos",
          value: String(visit.visitPhotos.length),
          tone: unplaced.length > 0 ? "warn" : "default",
          sub: unplaced.length > 0 ? `${unplaced.length} missing GPS` : "Geotagged",
        },
      ]}
      primaryAction={
        mayEdit && visit.status !== "CANCELLED" ? (
          <Button variant={writtenUp ? "secondary" : "primary"} onClick={() => setWriting(true)}>
            {writtenUp ? "Edit report" : "Write report"}
          </Button>
        ) : null
      }
      actions={menu.length > 0 ? menu : undefined}
      related={
        <RecordRelated
          items={[
            ...(about ? [{ href: about.href, label: about.label }] : []),
            ...(visit.site
              ? [{ href: `/crm/sites/${visit.site.id}`, label: visit.site.name, dot: "bg-[var(--badge-ok-fg)]" }]
              : []),
          ]}
        />
      }
      attributes={<RecordAttributes attributes={attributes} />}
      activeTab={tab}
      onTabChange={setTab}
      tabs={[
        {
          value: "report",
          label: "Report",
          icon: ClipboardText,
          attention: overdue,
          titled: true,
          content: (
            <div className="space-y-8">
              {visit.siteConditions || visit.reportNotes || visit.outcomeNotes ? (
                <section aria-labelledby="visit-notes">
                  <SectionHeading className="mt-0">
                    <span id="visit-notes">What they found</span>
                  </SectionHeading>
                  <div className="space-y-2 text-sm text-[var(--color-ink)]">
                    {[visit.siteConditions, visit.reportNotes, visit.outcomeNotes]
                      .filter((text): text is string => Boolean(text))
                      .map((text) => (
                        <p key={text} className="whitespace-pre-line leading-relaxed">
                          {text}
                        </p>
                      ))}
                  </div>
                </section>
              ) : null}

              <section aria-labelledby="visit-checklist">
                <SectionHeading
                  count={checklist.filter((item) => item.checked).length}
                  className={visit.siteConditions || visit.reportNotes || visit.outcomeNotes ? undefined : "mt-0"}
                >
                  <span id="visit-checklist">Checklist</span>
                </SectionHeading>
                <RecordTable
                  columns={CHECKLIST_COLUMNS}
                  rows={checklistRows}
                  emptyTitle={writtenUp ? "No checklist on this visit." : "Not written up yet."}
                />
              </section>

              <section aria-labelledby="visit-measurements">
                <SectionHeading count={visit.visitItems.length}>
                  <span id="visit-measurements">Measurements</span>
                </SectionHeading>
                <RecordTable
                  columns={[
                    {
                      id: "item",
                      label: "Item",
                      cell: (item) => (
                        <RecordTableName
                          title={item.description}
                          subtitle={[item.category, item.specNotes].filter(Boolean).join(" · ") || undefined}
                        />
                      ),
                    },
                    {
                      id: "size",
                      label: "Size",
                      width: "12rem",
                      cell: (item) => (
                        <RecordCell kind="code" value={formatDimensions(item) ?? "—"} />
                      ),
                    },
                    {
                      id: "quantity",
                      label: "Qty",
                      width: "7rem",
                      align: "end",
                      cell: (item) => (
                        <RecordCell
                          kind="number"
                          value={`${item.quantity}${item.unit ? ` ${item.unit}` : ""}`}
                        />
                      ),
                    },
                  ]}
                  rows={visit.visitItems}
                  emptyTitle="Nothing measured."
                />
              </section>
            </div>
          ),
        },
        {
          value: "answers",
          label: "Answers",
          icon: Checklist,
          count: answerCount,
          titled: true,
          content:
            visit.sections.length > 0 ? (
              <div className="space-y-8">
                {visit.sections.map((section, index) => (
                  <section key={section.id} aria-labelledby={`visit-section-${section.id}`}>
                    <SectionHeading
                      count={section.answers.length}
                      className={index === 0 ? "mt-0" : undefined}
                    >
                      <span id={`visit-section-${section.id}`}>{section.name}</span>
                    </SectionHeading>
                    <FactList
                      labelWidth={240}
                      items={section.answers.map((answer) => ({
                        id: answer.id,
                        label: answer.questionLabel,
                        value: answerText(answer),
                        tone: answer.notApplicable ? ("muted" as const) : undefined,
                      }))}
                    />
                  </section>
                ))}
              </div>
            ) : null,
        },
        {
          value: "photos",
          label: "Photos",
          icon: PhotoCamera,
          count: visit.visitPhotos.length,
          attention: unplaced.length > 0,
          titled: true,
          content:
            visit.visitPhotos.length > 0 ? (
              <section aria-labelledby="visit-photos">
                <SectionHeading count={visit.visitPhotos.length} className="mt-0">
                  <span id="visit-photos">Photos</span>
                </SectionHeading>
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {visit.visitPhotos.map((photo) => (
                    <li key={photo.id} className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
                      <a href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[var(--radius-sm)]">
                        {photo.contentType.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a stored upload, shown as taken
                          <img
                            src={photo.url}
                            alt={photo.caption ?? photo.fileName ?? "Site photo"}
                            className="aspect-[4/3] w-full object-cover transition-transform hover:scale-105"
                          />
                        ) : (
                          <span className="flex aspect-[4/3] items-center justify-center bg-[var(--color-ground)] text-sm text-[var(--color-ink-3)]">
                            {photo.fileName ?? "Document"}
                          </span>
                        )}
                      </a>
                      <div className="space-y-0.5 px-0.5">
                        {photo.latitude !== null && photo.longitude !== null ? (
                          <p className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
                            {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
                          </p>
                        ) : (
                          <StatusDot tone="warn" label="No location" />
                        )}
                        {photo.capturedAt ? (
                          <p className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">{when(photo.capturedAt)}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
        },
        {
          value: "follow-ups",
          label: "Follow-ups",
          icon: CalendarCheck,
          count: visit.followUps.length,
          titled: true,
          content:
            visit.followUps.length > 0 ? (
              <section aria-labelledby="visit-follow-ups">
                <SectionHeading count={visit.followUps.length} className="mt-0">
                  <span id="visit-follow-ups">Follow-ups</span>
                </SectionHeading>
                <RecordTable
                  columns={[
                    {
                      id: "follow-up",
                      label: "Follow-up",
                      cell: (f) => (
                        <RecordTableName
                          title={f.title}
                          subtitle={f.status === "PENDING" ? undefined : f.status === "COMPLETED" ? "Done" : "Cancelled"}
                        />
                      ),
                    },
                    {
                      id: "due",
                      label: "Due",
                      width: "8.5rem",
                      align: "end",
                      cell: (f) => <RecordCell kind="date" value={formatDate(f.dueAt)} />,
                    },
                  ]}
                  rows={visit.followUps}
                  rowHref={(f) => `/crm/tasks/follow-ups/${f.id}`}
                  emptyTitle="No follow-ups recorded."
                />
              </section>
            ) : null,
        },
      ]}
    >
      {writing ? (
        <VisitReportSheet
          open
          onOpenChange={(next) => {
            if (!next) setWriting(false);
          }}
          appointmentId={visit.id}
          appointmentNo={visit.appointmentNo}
        />
      ) : null}
    </RecordPageShell>
  );
}
