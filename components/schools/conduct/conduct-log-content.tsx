"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, MobileList } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordCell } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { ClassFilter } from "@/components/schools/common/class-filter";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import { DataTable } from "@/components/ui/data-table";
import { getApiErrorMessage } from "@/lib/api-client";
import { Download } from "@/lib/icons";
import { recordType } from "@/lib/records/registry";
import {
  fetchConductCategories,
  fetchConductLog,
  fetchConductRepeats,
  markHomeNotNeeded,
  tellHome,
  type IncidentRow,
  type RepeatRow,
} from "@/lib/schools/conduct-v2";
import { formatSchoolDayShort, formatSchoolDayTime } from "@/lib/schools/format";
import { IncidentFormDialog } from "@/components/schools/conduct/incident-form-dialog";
import { TellHomeDialog } from "@/components/schools/conduct/tell-home-dialog";

/**
 * The behaviour log.
 *
 * Rudo Makoni, Deputy Head, at 07:40 on a Friday before the bell. She is not
 * reading the log; she is looking for the two rows that are unfinished — the
 * one with nobody's decision on it and the one whose parents have not been
 * rung.
 *
 * That is why `Home told` is a column that draws a **button** where the answer
 * is missing. *"The parent was never informed"* is the sentence this page
 * exists to prevent, and a blank cell prevents nothing.
 *
 * `Three or more` is a tab rather than a second table underneath the log,
 * because it is a second subject: one row per pupil, not one row per incident.
 * Sharing a screen meant the four filters and the `X of Y` count governed the
 * top half of it and said nothing about the bottom half. It keeps its own
 * query as well, so a failure there does not take the log down with it.
 */

type ConductTab = "log" | "repeats";

const SANCTION_OPTIONS = [
  { value: "decided", label: "Decided" },
  { value: "undecided", label: "Not decided" },
];

const HOME_OPTIONS = [
  { value: "told", label: "Told" },
  { value: "not-told", label: "Not told" },
  { value: "not-needed", label: "Not needed" },
];

function toneBadge(tone: "PLAIN" | "WARN" | "BAD", label: string) {
  return (
    <Badge tone={tone === "BAD" ? "danger" : tone === "WARN" ? "warn" : "neutral"}>
      {label}
    </Badge>
  );
}

export function ConductLogContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ConductTab>("log");
  const [search, setSearch] = useState("");
  const [classValue, setClassValue] = useState<{ classId: string; streamId: string }>({
    classId: "",
    streamId: "",
  });
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sanctionFilter, setSanctionFilter] = useState("");
  const [homeFilter, setHomeFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IncidentRow | null>(null);
  const [telling, setTelling] = useState<IncidentRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["schools", "conduct", "categories"],
    queryFn: () => fetchConductCategories(),
  });

  const logQuery = useQuery({
    queryKey: ["schools", "conduct", "log", classValue.classId, categoryFilter, sanctionFilter, homeFilter, search],
    queryFn: () =>
      fetchConductLog({
        search: search.trim() || undefined,
        categoryId: categoryFilter || undefined,
        sanction: (sanctionFilter as "decided" | "undecided") || undefined,
        home: (homeFilter as "told" | "not-told" | "not-needed") || undefined,
      }),
  });

  const repeatsQuery = useQuery({
    queryKey: ["schools", "conduct", "repeats"],
    queryFn: () => fetchConductRepeats(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "conduct"] });
  };

  const tellMutation = useMutation({
    mutationFn: (input: { id: string; channel: string }) => tellHome(input.id, input.channel),
    onSuccess: () => {
      setTelling(null);
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const notNeededMutation = useMutation({
    mutationFn: (id: string) => markHomeNotNeeded(id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const rows = useMemo(() => {
    const all = logQuery.data?.rows ?? [];
    // The class filter narrows in the browser rather than in the query: the log
    // is a term's log and the endpoint already returns it, so a second round
    // trip to drop rows by year group buys nothing a reader would notice.
    if (!classValue.classId) return all;
    return all.filter((row) => row.student.currentClass?.id === classValue.classId);
  }, [logQuery.data, classValue.classId]);

  const tallies = logQuery.data?.tallies;
  const categories = categoriesQuery.data?.rows ?? [];

  const namedFilters = [
    categories.find((category) => category.id === categoryFilter)?.name,
    SANCTION_OPTIONS.find((option) => option.value === sanctionFilter)?.label,
    HOME_OPTIONS.find((option) => option.value === homeFilter)?.label,
  ].filter((entry): entry is string => Boolean(entry));

  function clearFilters() {
    setCategoryFilter("");
    setSanctionFilter("");
    setHomeFilter("");
    setSearch("");
    setClassValue({ classId: "", streamId: "" });
  }

  const columns = useMemo<ColumnDef<IncidentRow>[]>(
    () => [
      {
        id: "when",
        header: "When",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[color:var(--text-muted)]">
            {formatSchoolDayTime(row.original.occurredAt)}
          </span>
        ),
      },
      {
        id: "pupil",
        header: "Pupil",
        cell: ({ row }) => (
          <PersonCell
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            href={recordType("STUDENT").href(row.original.student.id)}
            reference={row.original.student.studentNo}
          />
        ),
      },
      {
        id: "year",
        header: "Year",
        cell: ({ row }) => (
          <RecordCell
            value={
              [row.original.student.currentClass?.name, row.original.student.currentStream?.name]
                .filter(Boolean)
                .join(" ") || null
            }
            className="text-[color:var(--text-muted)]"
          />
        ),
      },
      {
        id: "what",
        header: "What happened",
        // The badge, then one line of fact. The fact is what a reader decides
        // on; the badge is what lets them find it again.
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2">
            {toneBadge(row.original.category.tone, row.original.category.name)}
            <span className="min-w-0 truncate text-sm">{row.original.summary}</span>
          </span>
        ),
      },
      {
        id: "reportedBy",
        header: "Reported by",
        cell: ({ row }) => (
          <RecordCell
            value={row.original.reportedByName}
            className="text-[color:var(--text-muted)]"
          />
        ),
      },
      {
        id: "sanction",
        header: "Sanction",
        cell: ({ row }) =>
          row.original.sanction ? (
            <span
              className={
                row.original.sanctionTone === "BAD"
                  ? "text-sm text-[color:var(--status-error-text)]"
                  : "text-sm"
              }
            >
              {row.original.sanction}
            </span>
          ) : (
            <Badge tone="warn">Not decided</Badge>
          ),
      },
      {
        id: "home",
        header: "Home told",
        // The page, in one cell. Three shapes: told, not needed, and a button
        // where the gap is. The gap is a button, not a blank.
        cell: ({ row }) => {
          const incident = row.original;
          if (incident.homeToldAt) {
            return (
              <span className="flex items-center gap-2">
                <Badge tone="success">{incident.homeToldChannel ?? "Told"}</Badge>
                <span className="font-mono text-xs text-[color:var(--text-muted)]">
                  {formatSchoolDayTime(incident.homeToldAt)}
                </span>
              </span>
            );
          }
          if (!incident.homeToldNeeded) return <Badge tone="neutral">Not needed</Badge>;
          return (
            <RecordActions
              layout="inline"
              size="sm"
              resource="schools.conduct"
              verbs={[
                {
                  label: "Tell home",
                  action: "tell-home",
                  onSelect: () => setTelling(incident),
                },
              ]}
            />
          );
        },
      },
      {
        id: "verbs",
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => {
          const incident = row.original;
          return (
            <RecordActions
              layout="menu"
              label={`Row actions for ${incident.reference}`}
              resource="schools.conduct"
              verbs={[
                {
                  label: "Open the record",
                  action: "view",
                  onSelect: () => router.push(`/schools/conduct/${incident.id}`),
                },
                {
                  label: "Edit",
                  action: "edit",
                  // The refusal the spec asks for, said on the disabled verb
                  // rather than after the click: a school's record of what a
                  // parent was told has to still be true a year later.
                  unavailable: incident.homeToldAt
                    ? "Home has been told, so the account of this cannot be rewritten. Add an update on the record instead."
                    : undefined,
                  onSelect: () => {
                    setEditing(incident);
                    setFormOpen(true);
                  },
                },
                {
                  label: "Home did not need telling",
                  action: "tell-home",
                  loading: notNeededMutation.isPending,
                  unavailable: incident.homeToldAt
                    ? "Home has already been told."
                    : !incident.homeToldNeeded
                      ? "Already marked as not needed."
                      : undefined,
                  confirm: {
                    title: "Mark this as not needing a call",
                    description:
                      "It stops counting towards Home not told. The incident stays on the log and on the pupil's record.",
                    confirmLabel: "Mark it",
                  },
                  onSelect: () => notNeededMutation.mutate(incident.id),
                },
              ]}
            />
          );
        },
      },
    ],
    [router, notNeededMutation],
  );

  const repeatColumns = useMemo<ColumnDef<RepeatRow>[]>(
    () => [
      {
        id: "pupil",
        header: "Pupil",
        cell: ({ row }) => (
          <PersonCell
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            href={recordType("STUDENT").href(row.original.student.id)}
            reference={row.original.student.studentNo}
          />
        ),
      },
      {
        id: "year",
        header: "Year",
        cell: ({ row }) => (
          <RecordCell
            value={
              [row.original.student.className, row.original.student.streamName]
                .filter(Boolean)
                .join(" ") || null
            }
            className="text-[color:var(--text-muted)]"
          />
        ),
      },
      {
        id: "incidents",
        header: "Incidents",
        // Toned per row, not per count. Three latenesses on the same bus is one
        // fact three times; three of Fighting, Phone and Disruption is not. The
        // rule is in `repeatOffenders` and the tone arrives with the row.
        cell: ({ row }) => toneBadge(row.original.tone, String(row.original.count)),
      },
      {
        id: "whatTheyWere",
        header: "What they were",
        cell: ({ row }) => (
          <span className="block truncate text-sm">{row.original.whatTheyWere}</span>
        ),
      },
      {
        id: "last",
        header: "Last",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[color:var(--text-muted)]">
            {formatSchoolDayShort(row.original.last)}
          </span>
        ),
      },
      {
        id: "verbs",
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(recordType("STUDENT").href(row.original.student.id))}
            >
              Open the record
            </Button>
          </div>
        ),
      },
    ],
    [router],
  );

  const onLog = tab === "log";

  return (
    <SchoolsPage>
      {/* Named once. The rail says Conduct one column left. */}
      <PageChrome title="Behaviour log">
        <CreateButton
          resource="schools.conduct"
          label="Log an incident"
          onSelect={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      </PageChrome>

      {actionError ? <SaveError what="That change" error={actionError} /> : null}

      {/* The search, the four filters and the count belong to the log alone,
          which is why `Three or more` is a tab beside it and not a table under
          it. `No sanction decided` and `Home not told` used to be totals in a
          band above this row; they are what the Sanction and Home told filters
          select, so the way to read either number now is to ask for it — the
          rows come back and the count beside the filters says how many. */}
      <TableControls
        sticky
        tabs={
          <PopulationTabs<ConductTab>
            value={tab}
            onChange={setTab}
            tabs={[
              // How many incidents there are this term is the denominator of
              // `X of Y` below, so the log's tab does not say it a second
              // time. How many pupils are at three or more is read nowhere
              // else, so it is said here.
              { id: "log", label: "The log" },
              { id: "repeats", label: "Three or more", count: tallies?.threeOrMore },
            ]}
          />
        }
        search={
          onLog ? (
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search the behaviour log"
            />
          ) : undefined
        }
        filterCount={
          onLog
            ? activeFilterCount(
                classValue.classId,
                categoryFilter,
                sanctionFilter,
                homeFilter,
              )
            : undefined
        }
        // How many of the term's incidents are in front of you, out of how
        // many there are — which is where `This term` is read now. The repeats
        // tab carries its count on the tab itself, so the row says nothing
        // there rather than counting the wrong table's rows.
        count={
          onLog && !logQuery.isPending
            ? `${rows.length} of ${tallies?.thisTerm ?? rows.length}`
            : null
        }
        filters={
          onLog ? (
            <>
              <ClassFilter
                label="Year group"
                allLabel="Every year group"
                value={classValue}
                onChange={(next) => setClassValue(next)}
              />
              <FilterSelect
                label="What happened"
                allLabel="Anything"
                value={categoryFilter}
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                onChange={setCategoryFilter}
              />
              <FilterSelect
                label="Sanction"
                allLabel="Any sanction"
                value={sanctionFilter}
                options={SANCTION_OPTIONS}
                onChange={setSanctionFilter}
              />
              <FilterSelect
                label="Home told"
                allLabel="Told or not"
                value={homeFilter}
                options={HOME_OPTIONS}
                onChange={setHomeFilter}
              />
            </>
          ) : undefined
        }
        // The log's verb, on the log's control row. It prints what is on
        // screen, so it belongs beside the filters that decided what that is.
        actions={
          onLog ? (
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Download className="size-4" />
              Export the log
            </Button>
          ) : undefined
        }
      />

      {onLog ? (
        logQuery.error ? (
          <LoadError
            what="the behaviour log"
            error={logQuery.error}
            onRetry={() => void logQuery.refetch()}
          />
        ) : (
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
                        name={`${row.student.firstName} ${row.student.lastName}`}
                        size="sm"
                      />
                    }
                    title={`${row.student.lastName}, ${row.student.firstName}`}
                    subtitle={[
                      row.category.name,
                      row.summary,
                      row.homeToldAt ? "Home told" : row.homeToldNeeded ? "Home not told" : "Not needed",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    onClick={() => router.push(`/schools/conduct/${row.id}`)}
                  />
                ))}
              </MobileList>
            )}
            emptyState={
              logQuery.isPending ? (
                <TableRowsSkeleton
                  rows={8}
                  headers={[
                    "When",
                    "Pupil",
                    "Year",
                    "What happened",
                    "Reported by",
                    "Sanction",
                    "Home told",
                    "",
                  ]}
                  columns={[
                    { width: 94 },
                    { avatar: true, twoLine: true },
                    { width: 58 },
                    {},
                    { width: 108 },
                    { width: 140, badge: true },
                    { width: 162, badge: true },
                    { width: 44 },
                  ]}
                />
              ) : namedFilters.length > 0 || search.trim() ? (
                homeFilter === "not-told" ? (
                  // Good news, and a different sentence: the chase list is
                  // empty because the calls were made.
                  <NothingLeftToDo
                    title="Every incident this term has been told home"
                    body="Nothing is waiting on a phone call."
                  />
                ) : (
                  <NothingMatched
                    what="incidents"
                    filters={namedFilters}
                    search={search}
                    onClear={clearFilters}
                  />
                )
              ) : (
                <NothingYet
                  title="Nothing has been logged this term"
                  body="A behaviour log is the record a school is asked for afterwards. Log the first incident and the term's count starts here."
                />
              )
            }
          />
        )
      ) : repeatsQuery.error ? (
        <LoadError
          what="the repeat list"
          error={repeatsQuery.error}
          onRetry={() => void repeatsQuery.refetch()}
        />
      ) : (
        <DataTable
          data={repeatsQuery.data?.rows ?? []}
          columns={repeatColumns}
          features={{ sorting: false, globalFilter: false, pagination: false }}
          emptyState={
            repeatsQuery.isPending ? (
              <TableRowsSkeleton
                rows={4}
                headers={["Pupil", "Year", "Incidents", "What they were", "Last", ""]}
                columns={[
                  { avatar: true, twoLine: true },
                  { width: 64 },
                  { width: 92, badge: true },
                  {},
                  { width: 84 },
                  { width: 132 },
                ]}
              />
            ) : (
              <NothingLeftToDo
                title="Nobody has three or more this term"
                body="Nothing to read here is the answer a deputy head wants from this table."
              />
            )
          }
        />
      )}

      <IncidentFormDialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setEditing(null);
        }}
        incident={editing}
        categories={categories}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          invalidate();
        }}
      />

      <TellHomeDialog
        incident={telling}
        onOpenChange={(next) => {
          if (!next) setTelling(null);
        }}
        isSaving={tellMutation.isPending}
        onConfirm={(channel) =>
          telling ? tellMutation.mutate({ id: telling.id, channel }) : undefined
        }
      />
    </SchoolsPage>
  );
}
