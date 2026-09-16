"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList } from "@corelithzw/react";
import { Badge } from "@/components/schools/common/status-badge";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordCell } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { DataTable } from "@/components/ui/data-table";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  addAlumniUpdate,
  CONSENT_LABELS,
  DESTINATION_LABELS,
  fetchAlumni,
  recordConsent,
  type AlumnusRow,
  type ContactConsent,
  type DestinationKind,
} from "@/lib/schools/leavers-v2";
import { formatSchoolDate } from "@/lib/schools/format";
import { AddTimelineDialog } from "@/components/schools/leavers/add-timeline-dialog";
import { DestinationDialog } from "@/components/schools/leavers/destination-dialog";

/**
 * The alumni register.
 *
 * Contact consent has **three** states and the third is the one that matters:
 * `Not asked` is not a soft no. A nullable boolean would collapse "they said
 * no" and "nobody has asked" into one answer, and a school that could not tell
 * them apart would either pester somebody who refused or never ask anybody at
 * all. That is why `Consent never asked` is a band chip rather than a filter
 * nobody sets.
 *
 * `Destination unknown` is drawn the same way and for the same reason: a
 * register of 1,412 people with 1,121 unknown destinations is not a failure, it
 * is the number that tells a development office where to start.
 */

const CONSENT_OPTIONS: Array<{ value: ContactConsent; label: string }> = [
  { value: "MAY_CONTACT", label: CONSENT_LABELS.MAY_CONTACT },
  { value: "NO_CONTACT", label: CONSENT_LABELS.NO_CONTACT },
  { value: "NOT_ASKED", label: CONSENT_LABELS.NOT_ASKED },
];

export function AlumniContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [classOf, setClassOf] = useState("");
  const [house, setHouse] = useState("");
  const [destination, setDestination] = useState("");
  const [consent, setConsent] = useState("");
  const [search, setSearch] = useState("");
  const [asking, setAsking] = useState<AlumnusRow | null>(null);
  const [updating, setUpdating] = useState<AlumnusRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const registerQuery = useQuery({
    queryKey: ["schools", "alumni", classOf, house, destination, consent, search],
    queryFn: () =>
      fetchAlumni({
        classOf: classOf ? Number(classOf) : undefined,
        house: house || undefined,
        destinationKind: (destination as DestinationKind) || undefined,
        consent: (consent as ContactConsent) || undefined,
        search: search.trim() || undefined,
      }),
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      happenedOn: string;
      summary: string;
      documentReference?: string | null;
    }) => addAlumniUpdate(input.id, input),
    onSuccess: () => {
      setUpdating(null);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "alumni"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const consentMutation = useMutation({
    mutationFn: (input: { id: string; consent: ContactConsent }) =>
      recordConsent(input.id, input.consent),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "alumni"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const page = registerQuery.data;
  const tallies = page?.tallies;
  const rows = useMemo(() => page?.rows ?? [], [page]);

  const columns = useMemo<ColumnDef<AlumnusRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <PersonCell
            firstName={row.original.firstName}
            lastName={row.original.lastName}
            href={`/schools/alumni/${row.original.id}`}
            reference={row.original.house ?? undefined}
          />
        ),
      },
      {
        id: "classOf",
        header: "Class of",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold">{row.original.classOf}</span>
        ),
      },
      {
        id: "finalClass",
        header: "Last year group",
        cell: ({ row }) => (
          <RecordCell
            value={row.original.finalClassName}
            className="text-[color:var(--text-muted)]"
          />
        ),
      },
      {
        id: "results",
        header: "Results on leaving",
        cell: ({ row }) => {
          const results = row.original.results;
          if (!results) {
            return <span className="text-xs text-[color:var(--text-faint)]">Not recorded</span>;
          }
          return (
            <span className="text-xs">
              {results.passes} at C or better
              <span className="text-[color:var(--text-muted)]"> of {results.grades}</span>
            </span>
          );
        },
      },
      {
        id: "destination",
        header: "Where they went",
        cell: ({ row }) => {
          const alumnus = row.original;
          if (alumnus.destinationKind === "UNKNOWN") {
            return (
              <RecordActions
                layout="inline"
                size="sm"
                resource="schools.alumni"
                verbs={[
                  {
                    label: "Where did they go?",
                    action: "record",
                    onSelect: () => setAsking(alumnus),
                  },
                ]}
              />
            );
          }
          return (
            <span className="block truncate text-sm">
              {DESTINATION_LABELS[alumnus.destinationKind]}
              {alumnus.destination ? ` · ${alumnus.destination}` : ""}
              {alumnus.destinationConfirmedAt ? (
                <span className="block text-[11px] text-[color:var(--text-muted)]">
                  confirmed {formatSchoolDate(alumnus.destinationConfirmedAt)}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "verbs",
        header: () => <span className="sr-only">Row actions</span>,
        // The timeline is the thing this register is for. Adding to it from the
        // list means a development officer who has just had a conversation does
        // not have to open a record to write down what was said.
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RecordActions
              layout="inline"
              size="sm"
              resource="schools.alumni"
              verbs={[
                {
                  label: "Add an update",
                  action: "record",
                  onSelect: () => setUpdating(row.original),
                },
              ]}
            />
          </div>
        ),
      },
      {
        id: "consent",
        header: "Contact consent",
        cell: ({ row }) => {
          const alumnus = row.original;
          if (alumnus.contactConsent === "NOT_ASKED") {
            return (
              <RecordActions
                layout="inline"
                size="sm"
                resource="schools.alumni"
                verbs={[
                  {
                    label: "Ask for consent",
                    action: "record",
                    loading: consentMutation.isPending,
                    onSelect: () =>
                      consentMutation.mutate({ id: alumnus.id, consent: "MAY_CONTACT" }),
                  },
                ]}
              />
            );
          }
          return (
            <Badge tone={alumnus.contactConsent === "MAY_CONTACT" ? "success" : "danger"}>
              {CONSENT_LABELS[alumnus.contactConsent]}
            </Badge>
          );
        },
      },
    ],
    [consentMutation],
  );

  return (
    <SchoolsPage>
      <PageChrome title="Alumni" />

      {actionError ? <SaveError what="That change" error={actionError} /> : null}

      <section className="space-y-2">
        <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
          <span className="text-sm font-semibold text-[color:var(--text-strong)]">
            Everyone who has left
          </span>
          <span className="text-xs text-[color:var(--text-muted)]">
            {page ? `${rows.length} of ${tallies?.onTheRegister ?? rows.length}` : ""}
          </span>
        </h2>

        {registerQuery.error ? (
          <LoadError
            what="the alumni register"
            error={registerQuery.error}
            onRetry={() => void registerQuery.refetch()}
          />
        ) : (
          <>
            <TableControls
              sticky
              search={
                <TableSearch
                  value={search}
                  onChange={setSearch}
                  placeholder="Search former pupils"
                />
              }
              filterCount={activeFilterCount(classOf, house, destination, consent)}
              filters={
                <>
                  <FilterSelect
                    label="Class of"
                    allLabel="Any year"
                    value={classOf}
                    options={(page?.years ?? []).map((year) => ({
                      value: String(year),
                      label: String(year),
                    }))}
                    onChange={setClassOf}
                  />
                  <FilterSelect
                    label="House"
                    allLabel="Any house"
                    value={house}
                    options={(page?.houses ?? []).map((entry) => ({
                      value: entry,
                      label: entry,
                    }))}
                    onChange={setHouse}
                  />
                  <FilterSelect
                    label="Destination"
                    allLabel="Any destination"
                    value={destination}
                    options={(Object.keys(DESTINATION_LABELS) as DestinationKind[]).map(
                      (kind) => ({ value: kind, label: DESTINATION_LABELS[kind] }),
                    )}
                    onChange={setDestination}
                  />
                  <FilterSelect
                    label="Consent"
                    allLabel="Any consent"
                    value={consent}
                    options={CONSENT_OPTIONS}
                    onChange={setConsent}
                  />
                </>
              }
            />

            <DataTable
              data={rows}
              columns={columns}
              pagination={{ enabled: true }}
              features={{ sorting: false, globalFilter: false, pagination: true }}
              mobileListRenderer={({ rows: mobileRows }) => (
                <MobileList>
                  {mobileRows.map(({ row }) => (
                    <MobileList.Row
                      key={row.id}
                      leading={
                        <RecordMark
                          kind="student"
                          name={`${row.firstName} ${row.lastName}`}
                          size="sm"
                        />
                      }
                      title={`${row.lastName}, ${row.firstName}`}
                      subtitle={[
                        `Class of ${row.classOf}`,
                        DESTINATION_LABELS[row.destinationKind],
                        CONSENT_LABELS[row.contactConsent],
                      ].join(" · ")}
                      onClick={() => router.push(`/schools/alumni/${row.id}`)}
                    />
                  ))}
                </MobileList>
              )}
              emptyState={
                registerQuery.isPending ? (
                  <TableRowsSkeleton
                    rows={8}
                    headers={[
                      "Name",
                      "Class of",
                      "Last year group",
                      "Results on leaving",
                      "Where they went",
                      "Contact consent",
                    ]}
                    columns={[
                      { avatar: true, twoLine: true },
                      { width: 80 },
                      { width: 130 },
                      { width: 160 },
                      {},
                      { width: 150, badge: true },
                    ]}
                  />
                ) : classOf || house || destination || consent || search.trim() ? (
                  <NothingMatched
                    what="former pupils"
                    filters={[
                      classOf ? `Class of ${classOf}` : null,
                      house || null,
                      destination ? DESTINATION_LABELS[destination as DestinationKind] : null,
                      consent ? CONSENT_LABELS[consent as ContactConsent] : null,
                    ].filter((entry): entry is string => Boolean(entry))}
                    search={search}
                    onClear={() => {
                      setClassOf("");
                      setHouse("");
                      setDestination("");
                      setConsent("");
                      setSearch("");
                    }}
                  />
                ) : (
                  <NothingYet
                    title="Nobody is on the alumni register yet"
                    body="Closing a leaver's record puts them here. A school's oldest asset is the people who have left it."
                  />
                )
              }
            />
          </>
        )}
      </section>

      {/* The three measures, and the share of the register each covers. It is
          the honest answer to "how much of this do we actually keep". */}
      {tallies ? (
        <section className="space-y-2">
          <h2 className="border-b border-[color:var(--border-subtle)] pb-1.5 text-sm font-semibold text-[color:var(--text-strong)]">
            How much of the register is kept
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--text-muted)]">
                <th className="py-1 font-normal">Measure</th>
                <th className="w-[90px] py-1 text-right font-normal">Count</th>
                <th className="w-[90px] py-1 text-right font-normal">Of</th>
                <th className="w-[180px] py-1 font-normal">Share</th>
              </tr>
            </thead>
            <tbody>
              {tallies.kept.map((row) => {
                const share = row.of > 0 ? Math.round((row.count / row.of) * 100) : 0;
                return (
                  <tr key={row.measure} className="border-t border-[color:var(--border-subtle)]">
                    <td className="py-1.5">{row.measure}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{row.count}</td>
                    <td className="py-1.5 text-right font-mono text-xs text-[color:var(--text-muted)]">
                      {row.of}
                    </td>
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-[7px] w-[120px] overflow-hidden rounded-full bg-[color:var(--surface-muted)]"
                          aria-hidden="true"
                        >
                          <span
                            className="block h-full rounded-full bg-[color:var(--brand)]"
                            style={{ width: `${share}%` }}
                          />
                        </span>
                        <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                          {share}%
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* How much of each leaving year the school can still reach. It decays
          with age, and where it decays is the useful part. */}
      {tallies && tallies.destinationByYear.length > 0 ? (
        <section className="space-y-2">
          <h2 className="border-b border-[color:var(--border-subtle)] pb-1.5 text-sm font-semibold text-[color:var(--text-strong)]">
            Destination recorded, by leaving year
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--text-muted)]">
                <th className="w-[110px] py-1 font-normal">Class of</th>
                <th className="w-[110px] py-1 text-right font-normal">Recorded</th>
                <th className="w-[90px] py-1 text-right font-normal">Of</th>
                <th className="py-1 font-normal">Share</th>
              </tr>
            </thead>
            <tbody>
              {tallies.destinationByYear.map((row) => {
                const share = row.of > 0 ? Math.round((row.recorded / row.of) * 100) : 0;
                return (
                  <tr key={row.classOf} className="border-t border-[color:var(--border-subtle)]">
                    <td className="py-1.5 font-mono text-xs font-semibold">{row.classOf}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{row.recorded}</td>
                    <td className="py-1.5 text-right font-mono text-xs text-[color:var(--text-muted)]">
                      {row.of}
                    </td>
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-[7px] w-[140px] overflow-hidden rounded-full bg-[color:var(--surface-muted)]"
                          aria-hidden="true"
                        >
                          <span
                            className="block h-full rounded-full bg-[color:var(--brand)]"
                            style={{ width: `${share}%` }}
                          />
                        </span>
                        <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                          {share}%
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <AddTimelineDialog
        open={updating != null}
        onOpenChange={(next) => {
          if (!next) setUpdating(null);
        }}
        name={updating ? `${updating.firstName} ${updating.lastName}` : ""}
        isSaving={update.isPending}
        onSubmit={(values) =>
          updating ? update.mutate({ id: updating.id, ...values }) : undefined
        }
      />

      <DestinationDialog
        alumnus={asking}
        onOpenChange={(next) => {
          if (!next) setAsking(null);
        }}
        onSaved={() => {
          setAsking(null);
          void queryClient.invalidateQueries({ queryKey: ["schools", "alumni"] });
        }}
      />
    </SchoolsPage>
  );
}
