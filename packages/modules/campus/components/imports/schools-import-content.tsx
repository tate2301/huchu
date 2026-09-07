"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@corelithzw/ui/components/card";
import { FilterBar, FilterSelect } from "../common/filter-select";
import { RecordActions } from "../common/record-actions";
import { useSchoolAccess } from "../common/use-school-access";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  StatsSkeleton,
  TableRowsSkeleton,
} from "../common/states";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { StepProgress } from "@corelithzw/ui/components/step-progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@corelithzw/ui/components/table";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
};

type EntitySummary = {
  key: string;
  label: string;
  order: number;
  dependsOn: string[];
  naturalKey: string;
  fields: ImportField[];
};

type JobSummary = {
  id: string;
  entityType: string;
  status: string;
  fileName: string;
  rowsTotal: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
  createdAt: string;
  committedAt: string | null;
  rolledBackAt: string | null;
  uploadedBy: { id: string; name: string | null; email: string } | null;
};

type StagedJob = {
  id: string;
  entityType: string;
  status: string;
  fileName: string;
  headers: string[];
  mapping: Record<string, string>;
  rowsTotal: number;
  fields: ImportField[];
};

type RowIssue = { field: string; message: string };

type DryRun = {
  jobId: string;
  entityType: string;
  totals: { create: number; update: number; skip: number };
  rejected: { lineNo: number; issues: RowIssue[]; values: Record<string, string> }[];
  unmappedHeaders: string[];
  blockers: string[];
};

type CommitResult = {
  jobId: string;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  anomalies: number;
};

/** The two entity types `_guard.ts` puts behind the fees permission as well. */
const MONEY_ENTITIES = new Set(["FEE_STRUCTURE", "OPENING_BALANCE"]);

const STEPS = [
  { id: "choose", label: "Choose and upload" },
  { id: "map", label: "Check the columns" },
  { id: "check", label: "Check the data" },
  { id: "done", label: "Import" },
];

/** The column a message is about, in the words the registrar's file uses. */
function fieldLabel(fields: ImportField[], key: string): string {
  if (key === "_row") return "The row";
  return fields.find((field) => field.key === key)?.label ?? key;
}

/**
 * When an import ran, to the minute.
 *
 * `formatSchoolDate` gives "3 August 2026", which is the right format for a
 * date of birth and the wrong one here: a registrar loads classes, then
 * students, then guardians before break, and three rows all reading "3 August
 * 2026" cannot be told apart — which matters, because Undo works newest first
 * and the wrong row undoes the wrong load. "3 Aug 09:14" is the form the
 * canvas draws and the shortest one that distinguishes them.
 *
 * Locale-pinned for the same reason `lib/schools/format.ts` pins its own: the
 * server and the browser must render the same string or hydration tears.
 */
const IMPORT_STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function importedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  // en-GB renders "3 Aug, 09:14"; the canvas has no comma between the two.
  return IMPORT_STAMP.format(date).replace(",", "");
}

/**
 * What a past import loaded, named the way the picker names it.
 *
 * The registry is the authority — `Parents and guardians`, `Opening balances`,
 * `Fee structures` — and it is already on the wire beside the history rows.
 * Falling back to the enum only matters for a job whose entity type has since
 * been retired from the registry.
 */
function entityLabel(entities: EntitySummary[], key: string): string {
  return (
    entities.find((candidate) => candidate.key === key)?.label ??
    key.replace(/_/g, " ").toLowerCase()
  );
}

export function SchoolsImportContent() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [entityType, setEntityType] = useState<string>("STUDENT");
  const [job, setJob] = useState<StagedJob | null>(null);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which kind of record the history is narrowed to. Client-side: the list
   *  route takes no entity filter and an import history is a short list. */
  const [historyFilter, setHistoryFilter] = useState("");
  const access = useSchoolAccess();

  const listQuery = useQuery({
    queryKey: ["schools", "imports"],
    queryFn: () =>
      fetchJson<{ data: JobSummary[]; entities: EntitySummary[] }>("/api/v2/schools/imports"),
  });

  const entities = useMemo(() => listQuery.data?.entities ?? [], [listQuery.data]);
  const entity = entities.find((candidate) => candidate.key === entityType) ?? null;

  const stepIndex = committed ? 3 : dryRun ? 2 : job ? 1 : 0;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const csvText = await file.text();
      return fetchJson<StagedJob>("/api/v2/schools/imports", {
        method: "POST",
        body: JSON.stringify({ entityType, fileName: file.name, csvText }),
      });
    },
    onSuccess: (staged) => {
      setJob(staged);
      setDryRun(null);
      setCommitted(null);
      setError(null);
    },
    onError: (cause) => setError(getApiErrorMessage(cause, "That file could not be read")),
  });

  const mappingMutation = useMutation({
    mutationFn: (mapping: Record<string, string>) =>
      fetchJson<{ mapping: Record<string, string> }>(`/api/v2/schools/imports/${job!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ mapping }),
      }),
    onSuccess: (updated) => {
      setJob((current) => (current ? { ...current, mapping: updated.mapping } : current));
      setDryRun(null);
    },
    onError: (cause) => setError(getApiErrorMessage(cause, "That column could not be changed")),
  });

  const dryRunMutation = useMutation({
    mutationFn: () =>
      fetchJson<DryRun>(`/api/v2/schools/imports/${job!.id}/dry-run`, { method: "POST" }),
    onSuccess: (result) => {
      setDryRun(result);
      setError(null);
    },
    onError: (cause) => setError(getApiErrorMessage(cause, "That import could not be checked")),
  });

  const commitMutation = useMutation({
    mutationFn: (acceptWarnings: boolean) =>
      fetchJson<CommitResult>(`/api/v2/schools/imports/${job!.id}/commit`, {
        method: "POST",
        body: JSON.stringify({ acceptWarnings }),
      }),
    onSuccess: (result) => {
      setCommitted(result);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "imports"] });
    },
    onError: (cause) => setError(getApiErrorMessage(cause, "That import could not be completed")),
  });

  const rollbackMutation = useMutation({
    mutationFn: (jobId: string) =>
      fetchJson<{ total: number }>(`/api/v2/schools/imports/${jobId}/rollback`, {
        method: "POST",
      }),
    onSuccess: () => {
      setJob(null);
      setDryRun(null);
      setCommitted(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "imports"] });
    },
    onError: (cause) => setError(getApiErrorMessage(cause, "That import could not be undone")),
  });

  function reset() {
    setJob(null);
    setDryRun(null);
    setCommitted(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  if (listQuery.isPending) {
    return (
      <div className="space-y-4" data-testid="schools-import-loading">
        <StatsSkeleton count={4} />
        <TableRowsSkeleton rows={4} columns={[{}, { width: 140 }, { width: 120 }]} />
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <LoadError
        what="the import screen"
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
      />
    );
  }

  const allHistory = listQuery.data?.data ?? [];
  const history = historyFilter
    ? allHistory.filter((record) => record.entityType === historyFilter)
    : allHistory;

  return (
    <div className="space-y-6" data-testid="schools-import">
      <StepProgress
        steps={STEPS}
        currentStepIndex={stepIndex}
        ariaLabel="Importing school records"
      />

      {error ? <SaveError what="That import" error={error} /> : null}

      {/* ── Step 1: what, and from which file ─────────────────────────── */}
      {!job ? (
        <Card>
          <CardHeader>
            <CardTitle>What are you importing?</CardTitle>
            <CardDescription>
              Load them in this order — a pupil cannot be put in a class that is not here yet,
              and a balance cannot be brought forward for a family the system has not met.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:max-w-sm">
              <div className="space-y-2">
                <Label htmlFor="import-entity">Records</Label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger id="import-entity">
                    <SelectValue placeholder="Choose what to import" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((candidate) => (
                      <SelectItem key={candidate.key} value={candidate.key}>
                        {candidate.order}. {candidate.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {entity ? (
              <div className="space-y-3 rounded-[var(--card-radius)] border border-[var(--border-subtle)] p-4">
                <p className="text-sm text-[var(--text-strong)]">
                  Your file needs a header row with these columns.
                </p>
                <div className="flex flex-wrap gap-2">
                  {entity.fields.map((field) => (
                    <Badge key={field.key} variant={field.required ? "default" : "outline"}>
                      {field.label}
                      {field.required ? " *" : ""}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Re-running this import will recognise records it has already loaded by{" "}
                  <span className="text-[var(--text-strong)]">{entity.naturalKey.toLowerCase()}</span>,
                  so nothing is duplicated.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="import-file">The file, as CSV</Label>
              <input
                ref={fileInput}
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm text-[var(--text-muted)] file:mr-4 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--surface-muted)] file:px-4 file:py-2 file:text-sm file:text-[var(--text-strong)]"
                onChange={(changed) => {
                  const file = changed.target.files?.[0];
                  if (file) uploadMutation.mutate(file);
                }}
              />
              {uploadMutation.isPending ? (
                <p className="text-sm text-[var(--text-muted)]">Reading that file…</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Step 2: is each column what we think it is ────────────────── */}
      {job && !committed ? (
        <Card>
          <CardHeader>
            <CardTitle>Check the columns</CardTitle>
            <CardDescription>
              {job.fileName} — {job.rowsTotal} rows. We have guessed which column is which.
              A wrong guess waved through is worse than no guess, so please look.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {job.fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`map-${field.key}`}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <Select
                    value={job.mapping[field.key] ?? "__none__"}
                    onValueChange={(header) => {
                      const next = { ...job.mapping };
                      if (header === "__none__") delete next[field.key];
                      else next[field.key] = header;
                      setJob({ ...job, mapping: next });
                      mappingMutation.mutate(next);
                    }}
                  >
                    <SelectTrigger id={`map-${field.key}`}>
                      <SelectValue placeholder="Not in this file" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not in this file</SelectItem>
                      {job.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => dryRunMutation.mutate()}
                disabled={dryRunMutation.isPending}
              >
                {dryRunMutation.isPending ? "Checking…" : "Check the data"}
              </Button>
              <Button variant="outline" onClick={reset}>
                Start again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Step 3: THE REPORT. The reason this screen exists. ────────── */}
      {dryRun && !committed ? (
        <Card data-testid="import-dry-run">
          <CardHeader>
            <CardTitle>What this would do</CardTitle>
            <CardDescription>Nothing has been written yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* The commit is the only step that writes, and it writes hundreds
                of records under one button. The whole report dims while it runs
                — including Start again, which would otherwise throw the job away
                from under a commit that is still landing, and the Import button
                itself, which pressed twice loads the file twice. */}
            <SavingOverlay
              saving={commitMutation.isPending}
              label={`Importing ${dryRun.totals.create + dryRun.totals.update} records…`}
            >
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Summary label="To be created" value={dryRun.totals.create} tone="strong" />
                  <Summary label="Already here" value={dryRun.totals.update} tone="muted" />
                  <Summary
                    label="Cannot be imported"
                    value={dryRun.rejected.length}
                    tone={dryRun.rejected.length > 0 ? "bad" : "muted"}
                  />
                </div>

                {dryRun.blockers.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertTitle>A required column is not mapped</AlertTitle>
                    <AlertDescription>{dryRun.blockers.join(". ")}</AlertDescription>
                  </Alert>
                ) : null}

                {dryRun.unmappedHeaders.length > 0 ? (
                  <Alert>
                    <AlertTitle>Columns nothing will read</AlertTitle>
                    <AlertDescription>
                      {dryRun.unmappedHeaders.join(", ")}. Nothing in these will be imported.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {dryRun.rejected.length > 0 ? (
                  <div className="space-y-3" data-testid="import-rejected-rows">
                    <div>
                      <h3 className="text-base font-medium text-[var(--text-strong)]">
                        {dryRun.rejected.length} rows need fixing
                      </h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        The row numbers are the ones in your spreadsheet. Fix them there and
                        upload it again, or import the rest without them.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20">Row</TableHead>
                            <TableHead className="w-40">Column</TableHead>
                            <TableHead>What is wrong</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dryRun.rejected.flatMap((row) =>
                            row.issues.map((issue, index) => (
                              <TableRow key={`${row.lineNo}-${issue.field}-${index}`}>
                                <TableCell className="font-medium text-[var(--text-strong)]">
                                  {index === 0 ? row.lineNo : ""}
                                </TableCell>
                                <TableCell className="text-[var(--text-muted)]">
                                  {fieldLabel(job?.fields ?? [], issue.field)}
                                </TableCell>
                                <TableCell>{issue.message}</TableCell>
                              </TableRow>
                            )),
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertTitle>Every row can be imported</AlertTitle>
                    <AlertDescription>Nothing in this file needs fixing first.</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => commitMutation.mutate(dryRun.rejected.length > 0)}
                    disabled={commitMutation.isPending || dryRun.blockers.length > 0}
                  >
                    {commitMutation.isPending
                      ? "Importing…"
                      : dryRun.rejected.length > 0
                        ? `Import the other ${dryRun.totals.create + dryRun.totals.update}`
                        : `Import ${dryRun.totals.create + dryRun.totals.update} records`}
                  </Button>
                  <Button variant="outline" onClick={reset}>
                    Start again
                  </Button>
                </div>
              </div>
            </SavingOverlay>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Step 4: what happened, and how to take it back ────────────── */}
      {committed && job ? (
        <Card data-testid="import-committed">
          <CardHeader>
            <CardTitle>Imported</CardTitle>
            <CardDescription>{job.fileName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Undoing deletes the records the import created, newest first, and
                it is as long a write as the import was. Same interlock: a
                second Undo while the first is running deletes half a job twice
                and reports the second half as a failure. */}
            <SavingOverlay saving={rollbackMutation.isPending} label="Undoing the import…">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Summary label="Created" value={committed.created} tone="strong" />
                  <Summary label="Updated" value={committed.updated} tone="muted" />
                  <Summary label="Left out" value={committed.skipped} tone="muted" />
                  <Summary
                    label="Failed"
                    value={committed.failed}
                    tone={committed.failed > 0 ? "bad" : "muted"}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={reset}>Import something else</Button>
                  <Button
                    variant="outline"
                    onClick={() => rollbackMutation.mutate(job.id)}
                    disabled={rollbackMutation.isPending}
                  >
                    {rollbackMutation.isPending ? "Undoing…" : "Undo this import"}
                  </Button>
                </div>
              </div>
            </SavingOverlay>
          </CardContent>
        </Card>
      ) : null}

      {/* ── History ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Earlier imports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterBar>
            <FilterSelect
              label="Records"
              allLabel="Everything imported"
              value={historyFilter}
              options={entities.map((candidate) => ({
                value: candidate.key,
                label: candidate.label,
              }))}
              onChange={setHistoryFilter}
            />
          </FilterBar>

          {history.length === 0 ? (
            historyFilter ? (
              // The history is narrowed and empty, which is a filter result and
              // not a school that has never imported. It gets the sentence that
              // says which narrowing did it, and no Import button — nobody asked
              // to start an import from the history card.
              <NothingMatched
                what="imports"
                filters={[
                  entities.find((candidate) => candidate.key === historyFilter)?.label ??
                    historyFilter,
                ]}
                onClear={() => setHistoryFilter("")}
              />
            ) : (
              <NothingYet
                title="Nothing has been imported yet"
                body="Every import is listed here with what it did, so it can be undone later."
              />
            )
          ) : (
            <SavingOverlay saving={rollbackMutation.isPending} label="Undoing the import…">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium text-[var(--text-strong)]">
                          {record.fileName}
                        </TableCell>
                        <TableCell className="text-[var(--text-muted)]">
                          {/*
                            The registry's own name for the kind of record —
                            "Parents and guardians", "Opening balances". The
                            enum lower-cased gave "guardian" and "opening
                            balance", which are not what the picker at the top
                            of this page called them ten minutes earlier.
                          */}
                          {entityLabel(entities, record.entityType)}
                        </TableCell>
                        <TableCell className="font-mono text-[var(--text-muted)] tabular-nums">
                          {importedAt(record.createdAt)}
                        </TableCell>
                        <TableCell>
                          {record.status === "ROLLED_BACK" ? (
                            <Badge variant="outline">Undone</Badge>
                          ) : record.status === "COMMITTED" ? (
                            <span className="text-sm">
                              {/*
                                Both halves, always. "18 created" alone reads as
                                a clean load whether or not anything fell over,
                                so a run that lost fourteen rows looked exactly
                                like one that lost none.
                              */}
                              {record.rowsCreated} created, {record.rowsFailed} failed
                            </span>
                          ) : (
                            <Badge variant="secondary">Not imported</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.status === "COMMITTED" ? (
                            <RecordActions
                              resource="schools.students"
                              verbs={[
                                {
                                  label: "Undo",
                                  action: "create",
                                  tone: "danger",
                                  loading: rollbackMutation.isPending,
                                  // Loading money is the bursar's, so undoing it
                                  // is too — the same split `_guard.ts` makes on
                                  // the way in.
                                  unavailable:
                                    MONEY_ENTITIES.has(record.entityType) &&
                                    !access.can("schools.fees", "create")
                                      ? "This is the bursar to undo."
                                      : undefined,
                                  confirm: {
                                    title: `Undo ${record.fileName}`,
                                    description: `The ${record.rowsCreated} records this import created are removed, newest first. Anything somebody has since added on top of them — a mark, a receipt, a bed — stops the delete rather than being taken with it.`,
                                    confirmLabel: "Undo this import",
                                  },
                                  onSelect: () => rollbackMutation.mutate(record.id),
                                },
                              ]}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SavingOverlay>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "strong" | "muted" | "bad";
}) {
  const colour =
    tone === "bad"
      ? "text-[var(--danger)]"
      : tone === "strong"
        ? "text-[var(--text-strong)]"
        : "text-[var(--text-muted)]";
  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--border-subtle)] p-4">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className={`text-2xl font-semibold ${colour}`}>{value}</p>
    </div>
  );
}
