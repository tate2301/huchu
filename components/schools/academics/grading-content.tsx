"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, MobileList, MobileListEmpty } from "@corelithzw/react";

import { RecordCell } from "@/components/records/record-table";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordNameCell } from "@/components/schools/common/identity-cell";
import { PageBand } from "@/components/schools/common/page-band";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import {
  WINDOW_STATE_LABELS,
  WINDOW_STATE_OPTIONS,
  WindowStateBadge,
  formatDayTime,
  windowScope,
} from "@/components/schools/results/sheet-state";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
import type { PublishWindowStatus } from "@/lib/schools/results-v2";
import {
  fetchSchoolsClasses,
  fetchSchoolsTerms,
  type SchoolsClassRecord,
  type SchoolsTermRecord,
} from "@/lib/schools/admin-v2";
import {
  GradingSchemeDialog,
  type GradingSchemeFormValues,
} from "./grading-scheme-dialog";
import {
  PublishWindowDialog,
  type PublishWindowFormValues,
} from "./publish-window-dialog";

/**
 * Grade boundaries, and the windows in which results may be published.
 *
 * Two halves of one question — what a mark is called, and when a family gets
 * to read it — and neither had a screen. Grading schemes had a create endpoint
 * and no UI at all; publishing windows could only be opened with a REST
 * client, which in practice meant results either never reached parents or a
 * developer opened the window by hand on the evening of speech day.
 */

type GradingView = "schemes" | "windows";

type GradingBandRecord = {
  id: string;
  grade: string;
  minScore: string | number;
  maxScore: string | number;
  points: number | null;
  remark: string | null;
};

type GradingSchemeRecord = {
  id: string;
  code: string;
  name: string;
  continuousWeight: string | number;
  examWeight: string | number;
  passMark: string | number;
  isDefault: boolean;
  isActive: boolean;
  bands: GradingBandRecord[];
};

/**
 * The same windows the publishing screen lists, so they are named in the same
 * words: `sheet-state.tsx` owns Scheduled, Open and Closed, and this screen
 * used to carry a second copy of all three with its own tones. One enum, one
 * vocabulary — a window that is "Open" here and "Open" there is the same
 * chip, drawn once.
 */
type PublishWindowRecord = {
  id: string;
  openAt: string;
  closeAt: string;
  status: PublishWindowStatus;
  notes: string | null;
  term: { id: string; code: string; name: string };
  class: { id: string; code: string; name: string } | null;
  stream: { id: string; code: string; name: string } | null;
};

/** A `Decimal` crosses JSON as a string; trailing zeros read badly in a table. */
function num(value: string | number) {
  return Number(value);
}

/** A `datetime-local` input wants local wall-clock, not the ISO Z string. */
function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function GradingContent() {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<GradingView>("schemes");
  const [termFilter, setTermFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [schemeDialogOpen, setSchemeDialogOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<GradingSchemeRecord | null>(null);
  const [windowDialogOpen, setWindowDialogOpen] = useState(false);
  const [editingWindow, setEditingWindow] = useState<PublishWindowRecord | null>(null);

  const schemesQuery = useQuery({
    queryKey: ["schools", "grading-schemes"],
    queryFn: () =>
      fetchJson<{ schemes: GradingSchemeRecord[] }>("/api/v2/schools/grading-schemes"),
  });
  const windowsQuery = useQuery({
    queryKey: ["schools", "publish-windows"],
    queryFn: () =>
      fetchJson<{ data: PublishWindowRecord[] }>(
        "/api/v2/schools/results/publish/windows?limit=200",
      ),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const schemes = useMemo(
    () => schemesQuery.data?.schemes ?? [],
    [schemesQuery.data],
  );
  const windows = useMemo(() => windowsQuery.data?.data ?? [], [windowsQuery.data]);
  const terms = useMemo<SchoolsTermRecord[]>(
    () => termsQuery.data?.data ?? [],
    [termsQuery.data],
  );
  const classes = useMemo<SchoolsClassRecord[]>(
    () => classesQuery.data?.data ?? [],
    [classesQuery.data],
  );

  const visibleWindows = useMemo(
    () =>
      windows.filter((row) => {
        if (termFilter && row.term.id !== termFilter) return false;
        if (classFilter === "__all__" && row.class != null) return false;
        if (classFilter && classFilter !== "__all__" && row.class?.id !== classFilter) {
          return false;
        }
        if (statusFilter && row.status !== statusFilter) return false;
        return true;
      }),
    [windows, termFilter, classFilter, statusFilter],
  );

  function invalidateSchemes() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "grading-schemes"] });
  }
  function invalidateWindows() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "publish-windows"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "results"] });
  }

  const saveScheme = useMutation({
    mutationFn: (values: GradingSchemeFormValues) => {
      const body = JSON.stringify({
        code: values.code.trim(),
        name: values.name.trim(),
        continuousWeight: Number(values.continuousWeight),
        examWeight: Number(values.examWeight),
        passMark: Number(values.passMark),
        isDefault: values.isDefault,
        bands: values.bands.map((band) => ({
          grade: band.grade.trim(),
          minScore: Number(band.minScore),
          maxScore: Number(band.maxScore),
          points: band.points === "" ? null : Number(band.points),
          remark: band.remark.trim() || null,
        })),
      });
      return editingScheme
        ? fetchJson(`/api/v2/schools/grading-schemes/${editingScheme.id}`, {
            method: "PATCH",
            body,
          })
        : fetchJson("/api/v2/schools/grading-schemes", { method: "POST", body });
    },
    onSuccess: () => {
      setSchemeDialogOpen(false);
      setEditingScheme(null);
      invalidateSchemes();
    },
  });

  const makeDefault = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/grading-schemes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      }),
    onSuccess: invalidateSchemes,
  });

  const deleteScheme = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/grading-schemes/${id}`, { method: "DELETE" }),
    onSuccess: invalidateSchemes,
  });

  const saveWindow = useMutation({
    mutationFn: (values: PublishWindowFormValues) => {
      const payload = {
        openAt: new Date(values.openAt).toISOString(),
        closeAt: new Date(values.closeAt).toISOString(),
        classId: values.classId || null,
        streamId: values.streamId || null,
        notes: values.notes.trim() || null,
      };
      return editingWindow
        ? fetchJson(`/api/v2/schools/results/publish/windows/${editingWindow.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : fetchJson("/api/v2/schools/results/publish/windows", {
            method: "POST",
            body: JSON.stringify({ ...payload, termId: values.termId }),
          });
    },
    onSuccess: () => {
      setWindowDialogOpen(false);
      setEditingWindow(null);
      invalidateWindows();
    },
  });

  const setWindowStatus = useMutation({
    mutationFn: (payload: { id: string; status: "OPEN" | "CLOSED" | "SCHEDULED" }) =>
      fetchJson(`/api/v2/schools/results/publish/windows/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: payload.status }),
      }),
    onSuccess: invalidateWindows,
  });

  const schemeColumns = useMemo<ColumnDef<GradingSchemeRecord>[]>(
    () => [
      {
        id: "scheme",
        header: "Scheme",
        // The module's own identity cell rather than a name over a code: this
        // was a local re-creation of it, a half-step off in weight and in the
        // gap under the name from every other register in the module.
        cell: ({ row }) => (
          <RecordNameCell
            kind="document"
            name={row.original.name}
            reference={row.original.code}
          />
        ),
      },
      {
        id: "weights",
        header: "Class work / exam",
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {num(row.original.continuousWeight)} / {num(row.original.examWeight)}
          </span>
        ),
      },
      {
        id: "passMark",
        header: "Pass mark",
        cell: ({ row }) => <NumericCell>{num(row.original.passMark)}</NumericCell>,
      },
      {
        id: "bands",
        header: "Grades",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.bands.map((band) => band.grade).join(" · ") || "-"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {row.original.isDefault ? <Badge tone="brand">Default</Badge> : null}
            <Badge tone={row.original.isActive ? "success" : "neutral"}>
              {row.original.isActive ? "In use" : "Retired"}
            </Badge>
          </div>
        ),
      },
      {
        id: "actions",
        // An affordance, not a field — but the head still needs the cell, or
        // every column below it shifts by one.
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => (
          <RecordActions
            layout="menu"
            // Named for its row: a table of schemes otherwise announces a
            // dozen controls all called the same thing.
            label={`Row actions for ${row.original.name}`}
            resource="schools.academics"
            verbs={[
              ...(row.original.isDefault
                ? []
                : [
                    {
                      label: "Make default",
                      action: "edit" as const,
                      loading: makeDefault.isPending,
                      onSelect: () => makeDefault.mutate(row.original.id),
                    },
                  ]),
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditingScheme(row.original);
                  setSchemeDialogOpen(true);
                },
              },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: deleteScheme.isPending,
                unavailable: row.original.isDefault
                  ? "This is the school's default scheme. Make another one the default first."
                  : undefined,
                confirm: {
                  title: `Delete ${row.original.name}?`,
                  description:
                    "The grade table goes with it. Marks already recorded keep their scores; anything grading against this scheme falls back to the default.",
                  confirmLabel: "Delete the scheme",
                },
                onSelect: () => deleteScheme.mutate(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [deleteScheme, makeDefault],
  );

  const windowColumns = useMemo<ColumnDef<PublishWindowRecord>[]>(
    () => [
      {
        id: "scope",
        header: "Covers",
        // The same cell the publishing screen draws for the same window, and
        // the year group in it is the way to the year group — an office asking
        // "who is this window holding marks back from" is one click away from
        // the answer instead of one search.
        cell: ({ row }) => (
          <RecordNameCell
            kind="class"
            name={windowScope(row.original)}
            href={
              row.original.class ? recordType("CLASS").href(row.original.class.id) : null
            }
            reference={row.original.term.name}
          />
        ),
      },
      {
        id: "opens",
        header: "Opens",
        cell: ({ row }) => (
          <RecordCell kind="date" value={formatDayTime(row.original.openAt)} />
        ),
      },
      {
        id: "closes",
        header: "Closes",
        cell: ({ row }) => (
          <RecordCell kind="date" value={formatDayTime(row.original.closeAt)} />
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <WindowStateBadge status={row.original.status} />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => (
          <RecordActions
            layout="menu"
            label={`Row actions for the ${windowScope(row.original)} window`}
            resource="schools.results"
            verbs={[
              ...(row.original.status === "OPEN"
                ? [
                    {
                      label: "Close",
                      action: "publish" as const,
                      tone: "warning" as const,
                      loading: setWindowStatus.isPending,
                      confirm: {
                        title: "Close this window?",
                        description:
                          "Families stop being able to see the results it covers, from the moment you confirm.",
                        confirmLabel: "Close the window",
                      },
                      onSelect: () =>
                        setWindowStatus.mutate({ id: row.original.id, status: "CLOSED" }),
                    },
                  ]
                : [
                    {
                      label: "Open now",
                      action: "publish" as const,
                      loading: setWindowStatus.isPending,
                      confirm: {
                        title: "Open this window?",
                        description:
                          "Every family the window covers can read those results from the moment you confirm.",
                        confirmLabel: "Open the window",
                      },
                      onSelect: () =>
                        setWindowStatus.mutate({ id: row.original.id, status: "OPEN" }),
                    },
                  ]),
              {
                label: "Edit",
                action: "publish",
                onSelect: () => {
                  setEditingWindow(row.original);
                  setWindowDialogOpen(true);
                },
              },
            ]}
          />
        ),
      },
    ],
    [setWindowStatus],
  );

  const openWindows = windows.filter((row) => row.status === "OPEN").length;
  const defaultScheme = schemes.find((row) => row.isDefault);
  const narrowed = [
    terms.find((term) => term.id === termFilter)?.name,
    classFilter === "__all__"
      ? "The whole school"
      : classes.find((row) => row.id === classFilter)?.name,
    statusFilter ? WINDOW_STATE_LABELS[statusFilter as PublishWindowStatus] : "",
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-4">
      {/* "None" in amber says the school has no default scheme, which is a
          fault somebody has to go and fix; off a query that has not answered
          yet it is an accusation about nothing. Same for the window counts:
          a zero here is only a zero once the windows are in. */}
      <PageBand
        chips={[
          {
            label: "Default scheme",
            value: schemesQuery.isPending ? "—" : (defaultScheme?.name ?? "None"),
            tone: schemesQuery.isPending ? "neutral" : defaultScheme ? "brand" : "warn",
          },
          {
            label: "Windows open now",
            value: windowsQuery.isPending ? "—" : openWindows,
            tone: !windowsQuery.isPending && openWindows > 0 ? "success" : "neutral",
          },
          {
            label: "Windows in all",
            value: windowsQuery.isPending ? "—" : windows.length,
          },
        ]}
      />

      {schemesQuery.error || windowsQuery.error ? (
        <LoadError
          what="grading and publishing"
          error={schemesQuery.error || windowsQuery.error}
          onRetry={() => {
            void schemesQuery.refetch();
            void windowsQuery.refetch();
          }}
        />
      ) : null}

      {/*
        One banner per verb rather than one banner for the screen. "Delete
        refused, the scheme is still the default" and "the window would not
        open" are different problems, and a shared string meant whichever
        failed last overwrote the other.
      */}
      {makeDefault.error ? (
        <SaveError what="The default scheme" error={makeDefault.error} />
      ) : null}
      {deleteScheme.error ? (
        <SaveError what="The grading scheme" error={deleteScheme.error} />
      ) : null}
      {setWindowStatus.error ? (
        <SaveError what="The publishing window" error={setWindowStatus.error} />
      ) : null}

      {!schemesQuery.isLoading && schemes.length > 0 && !defaultScheme ? (
        <Alert tone="warn" title="No scheme is the school's default">
          A mark sheet that names no scheme grades against the default. Until one is
          chosen, those marks come back with a score and no grade.
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          {
            id: "schemes",
            label: "Grading schemes",
            count: schemesQuery.isPending ? undefined : schemes.length,
          },
          {
            id: "windows",
            label: "Publishing windows",
            count: windowsQuery.isPending ? undefined : windows.length,
          },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as GradingView)}
        railLabel="Grading views"
      >
        <div className={activeView === "schemes" ? "space-y-3" : "hidden"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section-title">Grading schemes</h2>
            <CreateButton
              resource="schools.academics"
              label="New grading scheme"
              onSelect={() => {
                setEditingScheme(null);
                setSchemeDialogOpen(true);
              }}
            />
          </div>

          {schemesQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Scheme", "Class work / exam", "Pass mark", "Grades", "Status"]}
              columns={[
                { twoLine: true },
                { width: 130 },
                { width: 90, align: "right" },
                { width: 160 },
                { width: 120, badge: true },
              ]}
              rows={5}
            />
          ) : schemes.length === 0 ? (
            <NothingYet
              title="No grading scheme yet"
              body="A scheme says how a term mark is made up and what each score is called. Report cards come back with scores and no grades until there is one."
            />
          ) : (
            <DataTable
              data={schemes}
              columns={schemeColumns}
              searchPlaceholder="Search schemes"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              mobileListRenderer={({ rows }) => (
                <MobileList>
                  {rows.length === 0 ? (
                    <MobileListEmpty>No schemes matched.</MobileListEmpty>
                  ) : (
                    rows.map(({ row }) => (
                      <MobileList.Row
                        key={row.id}
                        static
                        title={row.name}
                        subtitle={[
                          row.code,
                          `${num(row.continuousWeight)} / ${num(row.examWeight)}`,
                          row.isDefault ? "Default" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ))
                  )}
                </MobileList>
              )}
              emptyState={<NothingMatched what="schemes" />}
            />
          )}
        </div>

        <div className={activeView === "windows" ? "space-y-3" : "hidden"}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <FilterBar>
              <FilterSelect
                label="Term"
                allLabel="Every term"
                value={termFilter}
                options={terms.map((term) => ({
                  value: term.id,
                  label: `${term.name} · ${term.academicYear.name}`,
                }))}
                onChange={setTermFilter}
              />
              <FilterSelect
                label="Year group"
                allLabel="Every year group"
                value={classFilter}
                options={[
                  { value: "__all__", label: "The whole school" },
                  ...classes.map((row) => ({ value: row.id, label: row.name })),
                ]}
                onChange={setClassFilter}
              />
              <FilterSelect
                label="State"
                allLabel="Any state"
                value={statusFilter}
                options={WINDOW_STATE_OPTIONS}
                onChange={setStatusFilter}
              />
            </FilterBar>
            <CreateButton
              resource="schools.results"
              action="publish"
              label="New publishing window"
              unavailable={
                terms.length === 0
                  ? "A window covers a term. Create the term first."
                  : undefined
              }
              onSelect={() => {
                setEditingWindow(null);
                setWindowDialogOpen(true);
              }}
            />
          </div>

          {windowsQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Covers", "Opens", "Closes", "Status"]}
              columns={[
                { twoLine: true },
                { width: 170 },
                { width: 170 },
                { width: 110, badge: true },
              ]}
              rows={6}
            />
          ) : windows.length === 0 ? (
            <NothingYet
              title="No publishing window yet"
              body="Results stay inside the school until a window covering them is open. Create one for the current term to let families read this term's report cards."
            />
          ) : visibleWindows.length === 0 ? (
            <NothingMatched
              what="windows"
              filters={narrowed}
              onClear={() => {
                setTermFilter("");
                setClassFilter("");
                setStatusFilter("");
              }}
            />
          ) : (
            <DataTable
              data={visibleWindows}
              columns={windowColumns}
              searchPlaceholder="Search windows"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              mobileListRenderer={({ rows }) => (
                <MobileList>
                  {rows.length === 0 ? (
                    <MobileListEmpty>No windows matched.</MobileListEmpty>
                  ) : (
                    rows.map(({ row }) => (
                      <MobileList.Row
                        key={row.id}
                        static
                        title={
                          row.class
                            ? `${row.class.name}${row.stream ? ` · ${row.stream.name}` : ""}`
                            : "The whole school"
                        }
                        subtitle={[
                          row.term.name,
                          `${formatDayTime(row.openAt)} → ${formatDayTime(row.closeAt)}`,
                          WINDOW_STATE_LABELS[row.status],
                        ].join(" · ")}
                      />
                    ))
                  )}
                </MobileList>
              )}
              emptyState={<NothingMatched what="windows" />}
            />
          )}
        </div>
      </VerticalDataViews>

      <GradingSchemeDialog
        open={schemeDialogOpen}
        onOpenChange={(open) => {
          setSchemeDialogOpen(open);
          if (!open) {
            setEditingScheme(null);
            saveScheme.reset();
          }
        }}
        initial={
          editingScheme
            ? {
                code: editingScheme.code,
                name: editingScheme.name,
                continuousWeight: String(num(editingScheme.continuousWeight)),
                examWeight: String(num(editingScheme.examWeight)),
                passMark: String(num(editingScheme.passMark)),
                isDefault: editingScheme.isDefault,
                bands: editingScheme.bands.map((band) => ({
                  grade: band.grade,
                  minScore: String(num(band.minScore)),
                  maxScore: String(num(band.maxScore)),
                  points: band.points == null ? "" : String(band.points),
                  remark: band.remark ?? "",
                })),
              }
            : undefined
        }
        isSubmitting={saveScheme.isPending}
        error={saveScheme.error ? getApiErrorMessage(saveScheme.error) : null}
        onSubmit={(values) => saveScheme.mutate(values)}
      />

      <PublishWindowDialog
        open={windowDialogOpen}
        onOpenChange={(open) => {
          setWindowDialogOpen(open);
          if (!open) {
            setEditingWindow(null);
            saveWindow.reset();
          }
        }}
        terms={terms}
        classes={classes}
        initial={
          editingWindow
            ? {
                termId: editingWindow.term.id,
                classId: editingWindow.class?.id ?? "",
                streamId: editingWindow.stream?.id ?? "",
                openAt: toLocalInput(editingWindow.openAt),
                closeAt: toLocalInput(editingWindow.closeAt),
                notes: editingWindow.notes ?? "",
              }
            : undefined
        }
        isSubmitting={saveWindow.isPending}
        error={saveWindow.error ? getApiErrorMessage(saveWindow.error) : null}
        onSubmit={(values) => saveWindow.mutate(values)}
      />
    </div>
  );
}
