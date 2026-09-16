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
} from "@/lib/schools/leavers-v2";
import { formatSchoolDate } from "@/lib/schools/format";
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
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "alumni", alumnusId],
    queryFn: () => fetchAlumnus(alumnusId),
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
            value:
              honours.length === 0
                ? "None recorded"
                : honours.map((honour) => `${honour.year} ${honour.title}`).join(" · "),
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
    </SchoolsPage>
  );
}
