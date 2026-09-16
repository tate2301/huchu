"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { ListRowsSkeleton, LoadError, RecordNotFound, SaveError } from "@/components/records/states";
import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import { RecordActions } from "@/components/schools/common/record-actions";
import { AwardDetentionDialog } from "@/components/schools/conduct/award-detention-dialog";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PageCaption } from "@/components/schools/records/page-caption";
import { EntityLink } from "@/components/records/entity-link";
import { getApiErrorMessage } from "@/lib/api-client";
import { Check, Clock, Lock } from "@/lib/icons";
import { recordType } from "@/lib/records/registry";
import { addAccount, fetchIncident, type IncidentDetail } from "@/lib/schools/conduct-v2";
import { formatSchoolDate, formatSchoolDayShort, formatSchoolDayTime } from "@/lib/schools/format";
import { AddUpdateDialog } from "@/components/schools/conduct/add-update-dialog";

/**
 * One incident, start to finish.
 *
 * Rudo Makoni on the Friday morning, checking one thing before she sees
 * Tadiwa's mother at pick-up: that the sanction was recorded, that the phone
 * call happened, and that the second detention is on a date somebody has
 * actually booked.
 *
 * ## The violet alert
 *
 * `One pastoral note on Tadiwa is not shown here.` is a refusal that is precise
 * about what it refuses: it says a note exists, names the pupil, and shows
 * nothing else — no author, no date, no band, no body. It renders **identically
 * for a reader who is cleared for the note and one who is not**, because
 * otherwise the presence or absence of detail on a discipline page would be a
 * side channel into the pastoral record. The button beside it navigates; it
 * does not reveal.
 *
 * ## The review spine
 *
 * Five steps, four of them derived from the incident's own timestamps and the
 * fifth from the detention register. Deliberately not a `SchoolConductReviewStep`
 * table: that would keep a second copy of four columns and let them drift. A
 * page that showed only the outcome would hide the fact that the second
 * detention has not been served, which is why the spine stays.
 */

function Spine({
  detail,
}: {
  detail: IncidentDetail;
}) {
  const { incident, staffById, detention } = detail;
  const who = (id: string | null) => (id ? staffById[id]?.name ?? null : null);
  const role = (id: string | null) => (id ? staffById[id]?.role ?? null : null);

  const steps: Array<{
    title: string;
    when: string | null;
    who: string | null;
    note: string | null;
    done: boolean;
    trailing?: React.ReactNode;
  }> = [
    {
      title: "Reported",
      when: formatSchoolDayTime(incident.reportedAt),
      who: [who(incident.reportedByUserId), role(incident.reportedByUserId)]
        .filter(Boolean)
        .join(" · "),
      note: [incident.location, incident.period ? `period ${incident.period}` : null]
        .filter(Boolean)
        .join(" · ") || null,
      done: true,
    },
    {
      title: "Seen by the head of year",
      when: incident.seenAt ? formatSchoolDayTime(incident.seenAt) : null,
      who: [who(incident.seenByUserId), role(incident.seenByUserId)].filter(Boolean).join(" · "),
      note: null,
      done: Boolean(incident.seenAt),
    },
    {
      title: "Sanction decided",
      when: incident.sanctionDecidedAt ? formatSchoolDayTime(incident.sanctionDecidedAt) : null,
      who: [who(incident.sanctionDecidedByUserId), role(incident.sanctionDecidedByUserId)]
        .filter(Boolean)
        .join(" · "),
      note: incident.sanction,
      done: Boolean(incident.sanction),
    },
    {
      title: "Home told",
      when: incident.homeToldAt ? formatSchoolDayTime(incident.homeToldAt) : null,
      who: who(incident.homeToldByUserId),
      note: incident.homeToldChannel,
      done: Boolean(incident.homeToldAt),
      trailing: incident.homeToldAt ? (
        <Badge tone="success">{incident.homeToldChannel ?? "Told"}</Badge>
      ) : !incident.homeToldNeeded ? (
        <Badge tone="neutral">Not needed</Badge>
      ) : null,
    },
    {
      title: "Detention served",
      when: detention.nextSession ? `due ${formatSchoolDayTime(detention.nextSession.startsAt)}` : null,
      who: detention.nextSession
        ? [detention.nextSession.roomName, detention.nextSession.supervisorName]
            .filter(Boolean)
            .join(" · supervised by ")
        : null,
      note:
        detention.owed > 0
          ? `${detention.served} of ${detention.owed}`
          : // Honest rather than drawn: no detention was awarded, so there is
            // no fifth step to be waiting on.
            "No detention awarded",
      done: detention.owed > 0 ? detention.served >= detention.owed : true,
      trailing:
        detention.nextSession && detention.owed > detention.served ? (
          <Button asChild variant="primary" size="sm">
            <Link href="/schools/conduct/detention">Open the register</Link>
          </Button>
        ) : null,
    },
  ];

  const done = steps.filter((step) => step.done).length;

  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
        <span className="text-sm font-semibold text-[color:var(--text-strong)]">The review</span>
        <span className="text-xs text-[color:var(--text-muted)]">
          {done} of {steps.length} done
        </span>
      </h2>
      <ol className="space-y-0">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex flex-col items-center">
              <span
                className={`flex size-[26px] shrink-0 items-center justify-center rounded-full ${
                  step.done
                    ? "bg-[color:var(--tone-success-soft)] text-[color:var(--tone-success)]"
                    : "bg-[color:var(--tone-warn-soft)] text-[color:var(--tone-warn)]"
                }`}
                aria-hidden="true"
              >
                {step.done ? <Check className="size-3.5" /> : <Clock className="size-3.5" />}
              </span>
              {index < steps.length - 1 ? (
                <span
                  className="w-0.5 flex-1 bg-[color:var(--border-subtle)]"
                  aria-hidden="true"
                />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 pb-4">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-bold text-[color:var(--text-strong)]">
                  {step.title}
                </span>
                {step.when ? (
                  <span className="font-mono text-xs text-[color:var(--text-muted)]">
                    {step.when}
                  </span>
                ) : (
                  <span className="text-xs text-[color:var(--tone-warn)]">Not yet</span>
                )}
                {step.trailing}
              </span>
              {step.who ? (
                <span className="block text-[11px] text-[color:var(--text-muted)]">{step.who}</span>
              ) : null}
              {step.note ? <span className="block text-xs">{step.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ConductIncidentPage({ incidentId }: { incidentId: string }) {
  const queryClient = useQueryClient();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [detentionOpen, setDetentionOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "conduct", "incident", incidentId],
    queryFn: () => fetchIncident(incidentId),
  });

  const update = useMutation({
    mutationFn: (input: { body: string; markSeen: boolean }) =>
      addAccount(incidentId, { authorKind: "STAFF", body: input.body, markSeen: input.markSeen }),
    onSuccess: () => {
      setUpdateOpen(false);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "conduct"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <ListRowsSkeleton rows={10} label="Reading the incident" />
      </div>
    );
  }

  if (query.isError) {
    const message = getApiErrorMessage(query.error);
    if (message.toLowerCase().includes("not on this school")) {
      return (
        <RecordNotFound
          what="That incident"
          backHref="/schools/conduct"
          backLabel="Back to the behaviour log"
        />
      );
    }
    return (
      <LoadError
        what="the incident"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const detail = query.data;
  const { incident } = detail;
  const pupilName = `${incident.student.firstName} ${incident.student.lastName}`;
  const yearGroup = [incident.student.currentClass?.name, incident.student.currentStream?.name]
    .filter(Boolean)
    .join(" ");

  const properties: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: "Pupil",
      value: (
        <EntityLink href={recordType("STUDENT").href(incident.student.id)}>
          {pupilName} · {incident.student.studentNo}
        </EntityLink>
      ),
    },
    { label: "What happened", value: `${incident.category.name} — ${incident.summary}` },
    { label: "Class", value: yearGroup || "—" },
    {
      label: "When",
      value: [
        formatSchoolDate(incident.occurredAt),
        formatSchoolDayTime(incident.occurredAt).split(" ").pop(),
        incident.period ? `period ${incident.period}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    { label: "Where", value: incident.location ?? "—" },
    {
      label: "Reported by",
      value: detail.staffById[incident.reportedByUserId]?.name ?? "—",
    },
    {
      label: "Others involved",
      value:
        incident.participants.length === 0
          ? "Nobody else"
          : incident.participants
              .map(
                (participant) =>
                  `${participant.student.firstName} ${participant.student.lastName} · ${participant.student.studentNo} · ${participant.sanction ?? "no sanction"}`,
              )
              .join("; "),
    },
    { label: "Sanction", value: incident.sanction ?? "Not decided" },
    {
      label: "Home told",
      value:
        detail.homeTold.state === "told"
          ? `${formatSchoolDayTime(detail.homeTold.at)} · ${detail.homeTold.channel ?? "told"}`
          : detail.homeTold.state === "not-needed"
            ? "Not needed"
            : "Not yet",
    },
    {
      label: "Reference",
      value: <span className="font-mono">{incident.reference}</span>,
    },
  ];

  /*
    No band. This is one incident, not the behaviour module, and the four
    numbers a band would carry are all read from the record itself about a
    hundred pixels lower: "Home told" from the property list and the spine's
    fourth step, "Served" and "Next detention" from the spine's fifth step —
    which is fed by the same `detail.detention` helper, so they could never
    have disagreed but could very easily have been read twice — and the term's
    incident count from the heading of the rail beside them, which also says
    the merits the band had no room for.
  */
  return (
    <SchoolsPage width="detail">
      {/* The incident, not the module. The caption carries the identity the
          title does not, and it changes with the record. */}
      <PageChrome
        title={`${incident.category.name} in ${incident.location ?? "school"}`}
        backHref="/schools/conduct"
        backLabel="Behaviour log"
      >
        <span className="flex items-center gap-2">
          <RecordActions
            layout="inline"
            resource="schools.conduct"
            verbs={[
              {
                label: "Add an update",
                action: "create",
                onSelect: () => setUpdateOpen(true),
              },
              /*
                The verb the detention surface was waiting for. Its own empty
                state read "Award a detention from an incident and the pupil
                appears on the register they are serving" — and there was no
                such verb anywhere, so `awardDetention` and its endpoint had no
                caller and the register could never have a name put on it.
              */
              {
                label: "Award a detention",
                action: "create",
                onSelect: () => setDetentionOpen(true),
                /*
                  No availability guard, deliberately.

                  There was one, keyed on `detail.detention.owed > 0` and
                  captioned "already served for this incident". Both halves were
                  wrong: the route calls `detentionStandingFor` WITHOUT an
                  `incidentId`, so those two numbers are the pupil's standing
                  across every incident they have ever had — and the guard
                  therefore refused a detention to any pupil who already owed
                  one for something else. That is the repeat offender, which is
                  the pupil a head of year is most often standing there to
                  award a second detention to.

                  Whether a second detention is right is a judgement, and the
                  page already shows what is owed on the review spine. Offering
                  the verb and letting the reader decide is the honest shape.
                */
              },
            ]}
          />
          {/* The paper copy a head of year takes into the meeting. It sits in
              the bar with the other verbs, the way the pupil and class records
              carry theirs. */}
          <PrintDocumentButton
            sourceKey="schools.class-list"
            filters={{ classId: incident.student.currentClass?.id ?? "" }}
            label="Print for the file"
          />
        </span>
      </PageChrome>

      <PageCaption>
        {pupilName} · {yearGroup} · {formatSchoolDate(incident.occurredAt)}
      </PageCaption>

      {actionError ? <SaveError what="That update" error={actionError} /> : null}

      <dl className="divide-y divide-[color:var(--border-subtle)]">
        {properties.map((property) => (
          <div key={property.label} className="flex gap-4 py-2">
            <dt className="w-40 shrink-0 text-xs text-[color:var(--text-muted)]">
              {property.label}
            </dt>
            <dd className="min-w-0 flex-1 text-sm">{property.value}</dd>
          </div>
        ))}
      </dl>

      {/* The crossing point between the two halves of the page: the discipline
          record is allowed to say a pastoral note EXISTS and is not allowed to
          show it. Violet is the pastoral tone and appears nowhere else here. */}
      {detail.pastoralNoteCount > 0 ? (
        <Alert
          tone="info"
          className="border-[color:var(--accent-violet-border,transparent)] bg-[color:var(--accent-violet-soft,var(--brand-soft))]"
          title={`${detail.pastoralNoteCount === 1 ? "One pastoral note" : `${detail.pastoralNoteCount} pastoral notes`} on ${incident.student.firstName} ${detail.pastoralNoteCount === 1 ? "is" : "are"} not shown here.`}
          actions={
            <Button asChild variant="secondary" size="sm">
              <Link href="/schools/conduct/pastoral">
                <Lock className="size-4" />
                Open pastoral notes
              </Link>
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
              <span className="text-sm font-semibold text-[color:var(--text-strong)]">
                The accounts
              </span>
              <span className="text-xs text-[color:var(--text-muted)]">
                {incident.accounts.length} ·{" "}
                {incident.accounts.length > 0
                  ? `taken ${formatSchoolDayShort(incident.accounts[0].takenAt)}`
                  : "none taken"}
              </span>
            </h2>
            {incident.accounts.length === 0 ? (
              <p className="py-3 text-sm text-[color:var(--text-muted)]">
                Nobody&rsquo;s account has been written down yet. Add an update to record what was
                said.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[color:var(--text-muted)]">
                    <th className="w-48 py-1 font-normal">Who</th>
                    <th className="w-24 py-1 font-normal">When</th>
                    <th className="py-1 font-normal">What they said</th>
                  </tr>
                </thead>
                <tbody>
                  {incident.accounts.map((account) => (
                    <tr
                      key={account.id}
                      className="border-t border-[color:var(--border-subtle)] align-top"
                    >
                      <td className="py-2 pr-3">
                        <span className="block text-[12.5px] font-semibold">
                          {account.authorKind === "STUDENT"
                            ? `${account.authorStudent?.firstName ?? ""} ${account.authorStudent?.lastName ?? ""}`.trim()
                            : (account.authorUserId
                                ? detail.staffById[account.authorUserId]?.name
                                : null) ?? "A member of staff"}
                        </span>
                        <span className="block text-[11px] text-[color:var(--text-muted)]">
                          {account.authorKind === "STUDENT"
                            ? [
                                account.authorStudent?.currentClass?.name,
                                account.authorStudent?.currentStream?.name,
                                "the pupil",
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : (account.authorUserId
                                ? detail.staffById[account.authorUserId]?.role
                                : null) ?? "staff"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-[color:var(--text-muted)]">
                        {formatSchoolDayTime(account.takenAt)}
                      </td>
                      <td className="py-2 text-sm">&ldquo;{account.body}&rdquo;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <Spine detail={detail} />
        </div>

        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
              <span className="text-sm font-semibold text-[color:var(--text-strong)]">
                {incident.student.firstName} this term
              </span>
              <span className="text-xs text-[color:var(--text-muted)]">
                {detail.thisTerm.length} {detail.thisTerm.length === 1 ? "incident" : "incidents"} ·{" "}
                {detail.merits} {detail.merits === 1 ? "merit" : "merits"}
              </span>
            </h2>
            <ul className="divide-y divide-[color:var(--border-subtle)]">
              {detail.thisTerm.map((entry) => {
                const current = entry.id === incident.id;
                return (
                  <li key={entry.id} className="flex items-baseline gap-2 py-2">
                    <span
                      className={`w-14 shrink-0 font-mono text-xs ${current ? "font-bold text-[color:var(--text-strong)]" : "text-[color:var(--text-muted)]"}`}
                    >
                      {formatSchoolDayShort(entry.occurredAt)}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${current ? "font-semibold" : ""}`}>
                      {entry.category.name}
                    </span>
                    <span className="shrink-0">
                      {entry.sanction ? (
                        <span className="text-xs text-[color:var(--text-muted)]">
                          {entry.sanction}
                        </span>
                      ) : (
                        <Badge tone="warn">Not decided</Badge>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* S-12.2, and the whole of it on this canvas. Deliberately not a
              card: a border, a fill and a radius around a quoted extract that
              already has its own. The heading is a hairline; the extract is the
              thing that floats. */}
          {detail.reportCard ? (
            <section className="space-y-2">
              <h2 className="border-b border-[color:var(--border-subtle)] pb-1.5 text-sm font-semibold text-[color:var(--text-strong)]">
                What the report card will say
              </h2>
              <div className="rounded-[9px] border border-[color:var(--border)] bg-[color:var(--surface-base)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                  {detail.reportCard.heading}
                </p>
                <p className="mt-1.5 text-[12.5px]">{detail.reportCard.body}</p>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <AddUpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        pupilName={pupilName}
        isSaving={update.isPending}
        onSubmit={(values) => update.mutate(values)}
      />

      <AwardDetentionDialog
        // Remounted per open so the sittings ticked last time are not still
        // ticked for the next pupil.
        key={detentionOpen ? "open" : "closed"}
        open={detentionOpen}
        onOpenChange={setDetentionOpen}
        studentId={detail.incident.student.id}
        pupilName={pupilName}
        incidentId={detail.incident.id}
        defaultReason={`${detail.incident.category.name} — ${detail.incident.summary}`}
        onAwarded={() => {
          void queryClient.invalidateQueries({
            queryKey: ["schools", "conduct", "incident", incidentId],
          });
          // The register is the thing that changed.
          void queryClient.invalidateQueries({
            queryKey: ["schools", "conduct", "detention"],
          });
        }}
      />
    </SchoolsPage>
  );
}
