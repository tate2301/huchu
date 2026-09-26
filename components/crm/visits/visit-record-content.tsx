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
  ColumnFigure,
  ColumnList,
  ColumnName,
  FactList,
  SectionHeading,
  StatusDot,
} from "@/components/management/ui";
import { formatDate } from "@/components/crm/money/money";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordPageShell, RecordRelated, type RecordAction } from "@/components/records/record-page-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatDimensions } from "@/lib/crm/site-visits";
import { VISIT_STATUS_LABELS, VISIT_TONE } from "@/lib/crm/tones";
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

/** The section's measure. */
const WIDTH = 760;

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
      icon={MapPin}
      backHref="/crm/appointments"
      backLabel="Site visits"
      title={visit.title}
      reference={visit.appointmentNo}
      subtitle={about?.label}
      // Rule 5: booked and done are what a visit is; the band speaks for the
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
      bandValue={when(visit.scheduledStart)}
      primaryAction={
        mayEdit && visit.status !== "CANCELLED" ? (
          <Button variant={writtenUp ? "secondary" : "primary"} onClick={() => setWriting(true)}>
            {writtenUp ? "Edit the report" : "Write it up"}
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
            <div style={{ maxWidth: WIDTH }}>
              {visit.siteConditions || visit.reportNotes || visit.outcomeNotes ? (
                <section aria-labelledby="visit-notes">
                  <SectionHeading maxWidth={WIDTH} className="mt-0">
                    <span id="visit-notes">What they found</span>
                  </SectionHeading>
                  <div className="space-y-2 text-sm text-[var(--text-strong)]">
                    {[visit.siteConditions, visit.reportNotes, visit.outcomeNotes]
                      .filter((text): text is string => Boolean(text))
                      .map((text) => (
                        <p key={text} className="whitespace-pre-line">
                          {text}
                        </p>
                      ))}
                  </div>
                </section>
              ) : null}

              <section aria-labelledby="visit-checklist">
                <SectionHeading
                  count={checklist.filter((item) => item.checked).length}
                  maxWidth={WIDTH}
                  className={visit.siteConditions || visit.reportNotes || visit.outcomeNotes ? undefined : "mt-0"}
                >
                  <span id="visit-checklist">Checklist</span>
                </SectionHeading>
                <ColumnList
                  label="Checklist"
                  maxWidth={WIDTH}
                  empty={writtenUp ? "No checklist on this visit." : "Not written up yet."}
                  columns={[
                    { id: "item", label: "Item" },
                    { id: "done", label: "Done", align: "end" },
                  ]}
                  rows={checklist.map((item) => ({
                    id: item.key,
                    cells: {
                      item: <ColumnName name={item.label} meta={item.notes ?? undefined} />,
                      done: item.checked ? (
                        <StatusDot tone="success" label="Done" />
                      ) : (
                        <ColumnFigure tone="muted">—</ColumnFigure>
                      ),
                    },
                  }))}
                />
              </section>

              <section aria-labelledby="visit-measurements">
                <SectionHeading count={visit.visitItems.length} maxWidth={WIDTH}>
                  <span id="visit-measurements">Measurements</span>
                </SectionHeading>
                <ColumnList
                  label="Measurements"
                  maxWidth={WIDTH}
                  empty="Nothing measured."
                  columns={[
                    { id: "item", label: "Item" },
                    { id: "size", label: "Size", hideBelow: "sm" },
                    { id: "quantity", label: "Qty", align: "end" },
                  ]}
                  rows={visit.visitItems.map((item) => ({
                    id: item.id,
                    cells: {
                      item: (
                        <ColumnName
                          name={item.description}
                          meta={[item.category, item.specNotes].filter(Boolean).join(" · ") || undefined}
                        />
                      ),
                      size: <ColumnFigure tone="muted">{formatDimensions(item) ?? "—"}</ColumnFigure>,
                      quantity: (
                        <ColumnFigure>
                          {item.quantity}
                          {item.unit ? ` ${item.unit}` : ""}
                        </ColumnFigure>
                      ),
                    },
                  }))}
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
              <div style={{ maxWidth: WIDTH }}>
                {visit.sections.map((section, index) => (
                  <section key={section.id} aria-labelledby={`visit-section-${section.id}`}>
                    <SectionHeading
                      count={section.answers.length}
                      maxWidth={WIDTH}
                      className={index === 0 ? "mt-0" : undefined}
                    >
                      <span id={`visit-section-${section.id}`}>{section.name}</span>
                    </SectionHeading>
                    <FactList
                      maxWidth={WIDTH}
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
              <section aria-labelledby="visit-photos" style={{ maxWidth: WIDTH }}>
                <SectionHeading count={visit.visitPhotos.length} maxWidth={WIDTH} className="mt-0">
                  <span id="visit-photos">Photos</span>
                </SectionHeading>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {visit.visitPhotos.map((photo) => (
                    <li key={photo.id} className="space-y-1">
                      <a href={photo.url} target="_blank" rel="noreferrer" className="block">
                        {photo.contentType.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a stored upload, shown as taken
                          <img
                            src={photo.url}
                            alt={photo.caption ?? photo.fileName ?? "Site photo"}
                            className="aspect-[4/3] w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover"
                          />
                        ) : (
                          <span className="flex aspect-[4/3] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-sm text-[var(--text-muted)]">
                            {photo.fileName ?? "Document"}
                          </span>
                        )}
                      </a>
                      {photo.latitude !== null && photo.longitude !== null ? (
                        <p className="font-mono text-sm tabular-nums text-[var(--text-muted)]">
                          {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
                        </p>
                      ) : (
                        <StatusDot tone="warn" label="No location" />
                      )}
                      {photo.capturedAt ? (
                        <p className="font-mono text-sm tabular-nums text-[var(--text-muted)]">{when(photo.capturedAt)}</p>
                      ) : null}
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
              <section aria-labelledby="visit-follow-ups" style={{ maxWidth: WIDTH }}>
                <SectionHeading count={visit.followUps.length} maxWidth={WIDTH} className="mt-0">
                  <span id="visit-follow-ups">Follow-ups</span>
                </SectionHeading>
                <ColumnList
                  label="Follow-ups"
                  maxWidth={WIDTH}
                  columns={[
                    { id: "follow-up", label: "Follow-up" },
                    { id: "due", label: "Due", align: "end" },
                  ]}
                  rows={visit.followUps.map((followUp) => ({
                    id: followUp.id,
                    cells: {
                      "follow-up": (
                        <ColumnName
                          name={followUp.title}
                          meta={followUp.status === "PENDING" ? undefined : followUp.status === "COMPLETED" ? "Done" : "Cancelled"}
                          href={`/crm/follow-ups/${followUp.id}`}
                        />
                      ),
                      due: <ColumnFigure tone="muted">{formatDate(followUp.dueAt)}</ColumnFigure>,
                    },
                  }))}
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
