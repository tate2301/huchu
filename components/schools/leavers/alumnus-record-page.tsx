"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import {
  ListRowsSkeleton,
  LoadError,
  RecordNotFound,
  SaveError,
} from "@/components/records/states";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  CONSENT_LABELS,
  DESTINATION_LABELS,
  addAlumniUpdate,
  fetchAlumnus,
  removeHonour,
} from "@/lib/schools/leavers-v2";
import { formatSchoolDate } from "@/lib/schools/format";
import { AddHonourDialog } from "@/components/schools/leavers/add-honour-dialog";
import { AddTimelineDialog } from "@/components/schools/leavers/add-timeline-dialog";

/**
 * One former pupil.
 *
 * Everything on this page except the timeline is read from the records that own
 * it — the exam results, the honours, the conduct line — rather than copied
 * onto the alumnus when the record closed. A grade amended after a remark two
 * years later changes what this page says, and a copy would not.
 *
 * `Contact last confirmed` sits in the property list next to the address it
 * qualifies, because it is what decides whether the development office writes
 * to this person at all. A destination with no date is a rumour, and a date
 * read three lines away from the address it belongs to is easy to miss.
 */
export function AlumnusRecordPage({ alumnusId }: { alumnusId: string }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [honourOpen, setHonourOpen] = useState(false);
  /** The honour being corrected. Null means the dialog is closed. */
  const [editingHonour, setEditingHonour] = useState<{
    id: string;
    kind: string;
    year: number;
    title: string;
    detail: string | null;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "alumni", alumnusId],
    queryFn: () => fetchAlumnus(alumnusId),
  });

  const removeHonourMutation = useMutation({
    mutationFn: (honourId: string) => removeHonour(alumnus?.studentId ?? "", honourId),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "alumni"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const add = useMutation({
    mutationFn: (input: {
      happenedOn: string;
      summary: string;
      documentReference?: string | null;
    }) => addAlumniUpdate(alumnusId, input),
    onSuccess: () => {
      setAddOpen(false);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "alumni"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  if (query.isPending) return <ListRowsSkeleton rows={8} label="Reading the record" />;

  if (query.isError) {
    const message = getApiErrorMessage(query.error);
    if (message.toLowerCase().includes("not on this register")) {
      return (
        <RecordNotFound
          what="That former pupil"
          backHref="/schools/alumni"
          backLabel="Back to the alumni register"
        />
      );
    }
    return (
      <LoadError what="the record" error={query.error} onRetry={() => void query.refetch()} />
    );
  }

  const { alumnus, results, honours, conduct } = query.data;

  return (
    <SchoolsPage width="detail">
      <PageChrome
        title={`${alumnus.firstName} ${alumnus.lastName}`}
        backHref="/schools/alumni"
        backLabel="Alumni"
      >
        <RecordActions
          layout="inline"
          resource="schools.alumni"
          verbs={[
            {
              label: "Add to the timeline",
              action: "record",
              onSelect: () => setAddOpen(true),
            },
            /*
              `SchoolStudentHonour` is read three rows below this, under "Prizes
              and colours", and nothing in the product could write one — so it
              said "None recorded" on every alumnus in every school. Head girl,
              full colours, the accounting prize: it is what somebody writes
              into a reference years later.

              Unavailable where the alumnus has no pupil record behind them: an
              honour hangs off the pupil, because it is won in Form 3 and the
              alumnus row does not exist until they leave.
            */
            {
              label: "Record an honour",
              action: "record",
              onSelect: () => setHonourOpen(true),
              unavailable: alumnus.studentId
                ? undefined
                : "This alumnus was added by hand and has no pupil record to hang an honour on.",
            },
          ]}
        />
      </PageChrome>

      {actionError ? <SaveError what="That update" error={actionError} /> : null}

      {/* The year, the consent and the date contact was last confirmed are facts
          about this one person that do not move while you look at them, so they
          read as properties of the record rather than as a strip of counters
          above it. */}
      <dl className="divide-y divide-[color:var(--border-subtle)]">
        {[
          {
            label: "Class of",
            value: alumnus.classOf,
          },
          {
            label: "Left as",
            value: [alumnus.finalClassName, alumnus.house ? `${alumnus.house} House` : null]
              .filter(Boolean)
              .join(" · ") || "—",
          },
          {
            label: "Where they went",
            value:
              alumnus.destinationKind === "UNKNOWN"
                ? "Unknown"
                : [DESTINATION_LABELS[alumnus.destinationKind], alumnus.destination]
                    .filter(Boolean)
                    .join(" · "),
          },
          {
            label: "Contact",
            value: [alumnus.email, alumnus.phone, alumnus.addressLine]
              .filter(Boolean)
              .join(" · ") || "Nothing on file",
          },
          {
            label: "Last confirmed",
            // Never is worth saying loudly: an address nobody has checked is
            // the reason a development office letter comes back.
            value: alumnus.destinationConfirmedAt ? (
              formatSchoolDate(alumnus.destinationConfirmedAt)
            ) : (
              <Badge tone="warn">Never</Badge>
            ),
          },
          {
            label: "May we write",
            value: (
              <Badge
                tone={
                  alumnus.contactConsent === "MAY_CONTACT"
                    ? "success"
                    : alumnus.contactConsent === "NO_CONTACT"
                      ? "danger"
                      : "warn"
                }
              >
                {CONSENT_LABELS[alumnus.contactConsent]}
              </Badge>
            ),
          },
          {
            label: "Conduct",
            // Read from the conduct tables, not copied. `Clear · two merits`.
            value: conduct.summary,
          },
          {
            label: "Prizes and colours",
            // The count only. The list itself is a section below, because a
            // joined sentence has no row to hang a correction on — which is
            // why `PATCH` and `DELETE` on an honour had nowhere to be called
            // from and were left unbuilt.
            value:
              honours.length === 0
                ? "None recorded"
                : `${honours.length} recorded`,
          },
        ].map((property) => (
          <div key={property.label} className="flex gap-4 py-2">
            <dt className="w-44 shrink-0 text-xs text-[color:var(--text-muted)]">
              {property.label}
            </dt>
            <dd className="min-w-0 flex-1 text-sm">{property.value}</dd>
          </div>
        ))}
      </dl>

      {/*
        Prizes and colours, as rows rather than a sentence.

        They were a joined string in the property list — "2019 Head of House ·
        2019 Full colours" — which reads well and cannot be corrected, because
        there is nothing to click. A prize list is transcribed off a handwritten
        sheet at speech day and then copied into a reference years later, so a
        wrong year matters and somebody has to be able to fix it.
      */}
      {alumnus.studentId ? (
        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
            <span className="text-sm font-semibold text-[color:var(--text-strong)]">
              Prizes and colours
            </span>
            <span className="text-xs text-[color:var(--text-muted)]">
              {honours.length} {honours.length === 1 ? "recorded" : "recorded"}
            </span>
          </h2>
          {honours.length === 0 ? (
            <p className="py-3 text-sm text-[color:var(--text-muted)]">
              Nothing recorded. Head girl, head of house, full colours, a subject prize — this
              is what a leaving reference is written from.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {honours.map((honour) => (
                  <tr key={honour.id} className="border-b border-[color:var(--border-subtle)]">
                    <td className="w-[70px] py-2 font-mono text-xs">{honour.year}</td>
                    <td className="py-2">
                      {honour.title}
                      {honour.detail ? (
                        <span className="block text-xs text-[color:var(--text-muted)]">
                          {honour.detail}
                        </span>
                      ) : null}
                    </td>
                    <td className="w-[44px] py-2">
                      <RecordActions
                        layout="menu"
                        label={`Row actions for ${honour.title}`}
                        resource="schools.students"
                        verbs={[
                          {
                            label: "Correct it",
                            action: "edit",
                            onSelect: () => setEditingHonour(honour),
                          },
                          {
                            label: "Take it off",
                            action: "edit",
                            tone: "danger",
                            loading: removeHonourMutation.isPending,
                            confirm: {
                              title: `Take ${honour.title} off the record?`,
                              description:
                                "It stops appearing on this alumnus and in anything written from their record. Nothing else points at it.",
                              confirmLabel: "Take it off",
                            },
                            onSelect: () => removeHonourMutation.mutate(honour.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
            <span className="text-sm font-semibold text-[color:var(--text-strong)]">
              Public exam results
            </span>
            <span className="text-xs text-[color:var(--text-muted)]">
              {results.length} {results.length === 1 ? "grade" : "grades"}
            </span>
          </h2>
          {results.length === 0 ? (
            <p className="py-3 text-sm text-[color:var(--text-muted)]">
              No public exam grades are recorded against this former pupil.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--text-muted)]">
                  <th className="py-1 font-normal">Subject</th>
                  <th className="w-[110px] py-1 font-normal">Level</th>
                  <th className="w-[70px] py-1 font-normal">Grade</th>
                  <th className="w-[70px] py-1 text-right font-normal">Points</th>
                  <th className="w-[150px] py-1 font-normal">Series</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr
                    key={`${result.examSubject.name}-${index}`}
                    className="border-t border-[color:var(--border-subtle)]"
                  >
                    <td className="py-1.5">{result.examSubject.name}</td>
                    <td className="py-1.5 text-xs text-[color:var(--text-muted)]">
                      {result.series.level === "A_LEVEL"
                        ? "Advanced Level"
                        : result.series.level === "IGCSE"
                          ? "IGCSE"
                          : "Ordinary Level"}
                    </td>
                    <td className="py-1.5">
                      <Badge tone="neutral">{result.grade}</Badge>
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs">
                      {result.points ?? "—"}
                    </td>
                    <td className="py-1.5 text-xs text-[color:var(--text-muted)]">
                      {result.series.name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
            <span className="text-sm font-semibold text-[color:var(--text-strong)]">
              Since school
            </span>
            <span className="text-xs text-[color:var(--text-muted)]">
              {alumnus.updates.length} {alumnus.updates.length === 1 ? "entry" : "entries"}
            </span>
          </h2>
          {alumnus.updates.length === 0 ? (
            <p className="py-3 text-sm text-[color:var(--text-muted)]">
              Nothing has been recorded since they left. A timeline with one line on it is worth
              more than an empty one.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--text-muted)]">
                  <th className="w-[110px] py-1 font-normal">When</th>
                  <th className="py-1 font-normal">What</th>
                  <th className="w-[130px] py-1 font-normal">Reference</th>
                </tr>
              </thead>
              <tbody>
                {alumnus.updates.map((update) => (
                  <tr key={update.id} className="border-t border-[color:var(--border-subtle)]">
                    <td className="py-1.5 font-mono text-xs">
                      {formatSchoolDate(update.happenedOn)}
                    </td>
                    <td className="py-1.5">{update.summary}</td>
                    <td className="py-1.5 font-mono text-xs text-[color:var(--text-muted)]">
                      {update.documentReference ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <AddTimelineDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        name={`${alumnus.firstName} ${alumnus.lastName}`}
        isSaving={add.isPending}
        onSubmit={(values) => add.mutate(values)}
      />

      {alumnus.studentId && editingHonour ? (
        <AddHonourDialog
          // Keyed on the honour, so correcting a second one opens on ITS values
          // rather than the one before it.
          key={editingHonour.id}
          studentId={alumnus.studentId}
          open
          existing={editingHonour}
          onOpenChange={(next) => {
            if (!next) setEditingHonour(null);
          }}
          defaultYear={alumnus.classOf}
          onSaved={() => {
            setEditingHonour(null);
            void queryClient.invalidateQueries({ queryKey: ["schools", "alumni"] });
          }}
        />
      ) : null}

      {alumnus.studentId ? (
        <AddHonourDialog
          // Fresh fields each open: an office recording a leaver's prizes is
          // entering several in a row.
          key={honourOpen ? "open" : "closed"}
          studentId={alumnus.studentId}
          open={honourOpen}
          onOpenChange={setHonourOpen}
          // The year they left is the one most of these were won in or near,
          // and it is the one the office is holding.
          defaultYear={alumnus.classOf}
          onSaved={() =>
            void queryClient.invalidateQueries({ queryKey: ["schools", "alumni", alumnusId] })
          }
        />
      ) : null}
    </SchoolsPage>
  );
}
