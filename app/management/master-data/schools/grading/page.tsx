"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ManagementShell } from "@/components/settings/management-shell";
import {
  FormField,
  FormPage,
  SectionAction,
  StatusDot,
  type StatusTone,
} from "@/components/management/ui";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordActions } from "@/components/schools/common/record-actions";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import {
  WINDOW_STATE_LABELS,
  formatDayTime,
  windowScope,
} from "@/components/schools/results/sheet-state";
import {
  GradingSchemeDialog,
  type GradingSchemeFormValues,
} from "@/components/schools/academics/grading-scheme-dialog";
import {
  PublishWindowDialog,
  type PublishWindowFormValues,
} from "@/components/schools/academics/publish-window-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { PublishWindowStatus } from "@/lib/schools/results-v2";
import {
  fetchSchoolsClasses,
  fetchSchoolsTerms,
  type SchoolsClassRecord,
  type SchoolsTermRecord,
} from "@/lib/schools/admin-v2";
import { Plus } from "@/lib/icons";

/**
 * Grading and publishing, as `Grading.dc.html` draws it: a thin centred form
 * page, its boundaries under a heading that carries the count and the verb, and
 * the publishing window under the next one.
 *
 * Three honest differences from the drawing, all of them data rather than
 * taste:
 *
 *   - the board draws **one** publishing window as a pair of date fields. A
 *     school has many — one per term, optionally narrowed to a year group — so
 *     they are a list under their own heading, in the board's own row.
 *   - the board's two switches, "Guardians can see marks" and "Show class
 *     position", have nothing behind them. A publish window carries opens,
 *     closes, scope, status and a note; there is no such setting anywhere in
 *     the model, and a switch that writes nowhere is worse than no switch.
 *   - the board draws Save changes / Cancel. Every write on this page belongs
 *     to one record and commits in that record's own dialog, so a page footer
 *     would be a button that saves nothing. `FormPage` draws no footer unless
 *     it is given something to submit, which is the same rule stated in code.
 *
 * Queries, keys, bodies and invalidations are untouched:
 * `["schools","grading-schemes"]`, `["schools","publish-windows"]`,
 * `["schools","terms"]`, `["schools","classes"]`.
 */

const SCHEMES_KEY = ["schools", "grading-schemes"] as const;
const WINDOWS_KEY = ["schools", "publish-windows"] as const;
const TERMS_KEY = ["schools", "terms"] as const;
const CLASSES_KEY = ["schools", "classes"] as const;

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

/** A `Decimal` crosses JSON as a string; trailing zeros read badly in a column. */
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

const WINDOW_TONE: Record<PublishWindowStatus, StatusTone> = {
  OPEN: "success",
  SCHEDULED: "neutral",
  CLOSED: "neutral",
};

export default function SchoolsGradingMasterDataPage() {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();
  const canEditSchemes = access.can("schools.academics", "edit");
  const canArchiveSchemes = access.can("schools.academics", "archive");
  const canPublish = access.can("schools.results", "publish");

  const [schemeId, setSchemeId] = React.useState<string | null>(null);
  const [schemeDialogOpen, setSchemeDialogOpen] = React.useState(false);
  const [editingScheme, setEditingScheme] = React.useState<GradingSchemeRecord | null>(null);
  const [windowDialogOpen, setWindowDialogOpen] = React.useState(false);
  const [editingWindow, setEditingWindow] = React.useState<PublishWindowRecord | null>(null);

  const schemesQuery = useQuery({
    queryKey: SCHEMES_KEY,
    queryFn: () =>
      fetchJson<{ schemes: GradingSchemeRecord[] }>("/api/v2/schools/grading-schemes"),
  });
  const windowsQuery = useQuery({
    queryKey: WINDOWS_KEY,
    queryFn: () =>
      fetchJson<{ data: PublishWindowRecord[] }>(
        "/api/v2/schools/results/publish/windows?limit=200",
      ),
  });
  const termsQuery = useQuery({
    queryKey: TERMS_KEY,
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const classesQuery = useQuery({
    queryKey: CLASSES_KEY,
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const schemes = React.useMemo(
    () => schemesQuery.data?.schemes ?? [],
    [schemesQuery.data],
  );
  const windows = React.useMemo(() => windowsQuery.data?.data ?? [], [windowsQuery.data]);
  const terms = React.useMemo<SchoolsTermRecord[]>(
    () => termsQuery.data?.data ?? [],
    [termsQuery.data],
  );
  const classes = React.useMemo<SchoolsClassRecord[]>(
    () => classesQuery.data?.data ?? [],
    [classesQuery.data],
  );

  const defaultScheme = schemes.find((row) => row.isDefault);
  const scheme =
    schemes.find((row) => row.id === schemeId) ?? defaultScheme ?? schemes[0] ?? null;

  // Highest band first: a grade table is read from the top mark down.
  const bands = React.useMemo(
    () => (scheme ? [...scheme.bands].sort((a, b) => num(b.maxScore) - num(a.maxScore)) : []),
    [scheme],
  );

  function invalidateSchemes() {
    void queryClient.invalidateQueries({ queryKey: SCHEMES_KEY });
  }
  function invalidateWindows() {
    void queryClient.invalidateQueries({ queryKey: WINDOWS_KEY });
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
    onSuccess: () => {
      setSchemeId(null);
      invalidateSchemes();
    },
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

  const openSchemeEditor = (row: GradingSchemeRecord | null) => {
    setEditingScheme(row);
    setSchemeDialogOpen(true);
  };

  const writeError =
    schemesQuery.error ??
    windowsQuery.error ??
    makeDefault.error ??
    deleteScheme.error ??
    setWindowStatus.error ??
    null;

  const overflow: React.ReactNode[] = [];
  if (canEditSchemes) {
    overflow.push(
      <DropdownMenuItem key="new-scheme" onSelect={() => openSchemeEditor(null)}>
        New grading scheme
      </DropdownMenuItem>,
    );
    if (scheme) {
      overflow.push(
        <DropdownMenuItem key="edit-scheme" onSelect={() => openSchemeEditor(scheme)}>
          Edit the scheme
        </DropdownMenuItem>,
      );
    }
    if (scheme && !scheme.isDefault) {
      overflow.push(
        <DropdownMenuItem
          key="make-default"
          onSelect={() => makeDefault.mutate(scheme.id)}
        >
          Make it the default
        </DropdownMenuItem>,
      );
    }
  }
  // Rule 3: the destructive verb lives in the overflow, and only where it is
  // allowed — the school's default scheme is refused server-side anyway.
  if (canArchiveSchemes && scheme && !scheme.isDefault) {
    overflow.push(
      <DropdownMenuItem
        key="delete-scheme"
        onSelect={async () => {
          const confirmed = await dsConfirm({
            title: `Delete ${scheme.name}?`,
            description:
              "The grade table goes with it. Marks already recorded keep their scores; anything grading against this scheme falls back to the default.",
            confirmLabel: "Delete the scheme",
            variant: "danger",
          });
          if (confirmed) deleteScheme.mutate(scheme.id);
        }}
      >
        Delete the scheme
      </DropdownMenuItem>,
    );
  }

  return (
    <ManagementShell>
      <FormPage
        title="Grading and publishing"
        width={600}
        overflow={overflow.length > 0 ? overflow : undefined}
      >
        {writeError ? <WriteError error={writeError} /> : null}

        {/* A fault, not a decoration: a mark sheet naming no scheme grades
            against the default, so until one is chosen those marks come back
            with a score and no grade. */}
        {!schemesQuery.isLoading && schemes.length > 0 && !defaultScheme ? (
          <Notice tone="warn">No scheme is the school&apos;s default</Notice>
        ) : null}

        {schemes.length > 1 ? (
          <FormField label="Scheme">
            {(id) => (
              <Select
                value={scheme?.id ?? ""}
                onValueChange={(value) => setSchemeId(value)}
              >
                <SelectTrigger id={id} className="h-9 w-full text-[13px] leading-[1.5]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {schemes.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : null}

        <FormSectionHeading
          count={bands.length}
          action={
            canEditSchemes ? (
              <SectionAction icon={Plus} onClick={() => openSchemeEditor(scheme)}>
                Add a boundary
              </SectionAction>
            ) : null
          }
        >
          Grade boundaries
        </FormSectionHeading>

        {schemesQuery.isLoading ? (
          <EmptyLine>Loading the grade table</EmptyLine>
        ) : bands.length === 0 ? (
          <EmptyLine>No grade boundaries</EmptyLine>
        ) : (
          bands.map((band) => (
            <FactRow
              key={band.id}
              label={band.grade}
              value={`${num(band.minScore)} – ${num(band.maxScore)}`}
            />
          ))
        )}

        <FormSectionHeading
          count={windows.length}
          action={
            canPublish && terms.length > 0 ? (
              <SectionAction
                icon={Plus}
                onClick={() => {
                  setEditingWindow(null);
                  setWindowDialogOpen(true);
                }}
              >
                Add a window
              </SectionAction>
            ) : null
          }
        >
          Publishing windows
        </FormSectionHeading>

        {windowsQuery.isLoading ? (
          <EmptyLine>Loading the windows</EmptyLine>
        ) : windows.length === 0 ? (
          <EmptyLine>No publishing window</EmptyLine>
        ) : (
          windows.map((row) => (
            <FactRow
              key={row.id}
              label={`${windowScope(row)} · ${row.term.name}`}
              value={`${formatDayTime(row.openAt)} → ${formatDayTime(row.closeAt)}`}
              trailing={
                <>
                  <StatusDot
                    tone={WINDOW_TONE[row.status]}
                    label={WINDOW_STATE_LABELS[row.status]}
                  />
                  <RecordActions
                    layout="menu"
                    label={`Row actions for the ${windowScope(row)} window`}
                    resource="schools.results"
                    verbs={[
                      ...(row.status === "OPEN"
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
                                setWindowStatus.mutate({ id: row.id, status: "CLOSED" }),
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
                                setWindowStatus.mutate({ id: row.id, status: "OPEN" }),
                            },
                          ]),
                      {
                        label: "Edit",
                        action: "publish",
                        onSelect: () => {
                          setEditingWindow(row);
                          setWindowDialogOpen(true);
                        },
                      },
                    ]}
                  />
                </>
              }
            />
          ))
        )}
      </FormPage>

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
    </ManagementShell>
  );
}

/* ------------------------------------------------------------------ *
 * Local pieces
 *
 * A settings form draws its section headings **bare** — `Account.dc.html`,
 * `Notifications.dc.html`, `Billing.dc.html` and this board all do, and none of
 * them carries the 24px tile the register records use. The shared
 * `SectionHeading` always draws the tile, so the form rung is stated here and
 * reported to the orchestrator as the gap it is.
 * ------------------------------------------------------------------ */

function FormSectionHeading({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "36px 0 12px" }}>
      <h3
        style={{
          margin: 0,
          font: "600 15px/1.35 var(--font-sans)",
          color: "#16181D",
        }}
      >
        {children}
      </h3>
      {typeof count === "number" ? (
        <span
          style={{
            font: "500 11px/1.5 var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
            color: "#5E6573",
          }}
        >
          {count}
        </span>
      ) : null}
      <span style={{ flexGrow: 1 }} />
      {action}
    </div>
  );
}

/**
 * The board's row: a 150px label column, then the figure in mono.
 *
 * Not `RecordList` — that one is the register's row, with a 44px code column
 * and a right-aligned value. This board puts the name in a fixed left column
 * and lets the value run, which is what makes a column of ranges readable.
 *
 * Every row is ruled, the last one included. `RecordList` drops the closing
 * rule because a record's list ends against the record's own whitespace; a
 * form's section ends against the next section's heading, and `Grading.dc.html`
 * draws the rule under the last boundary and under the last window for exactly
 * that reason — it is the edge of the section, not of a row.
 */
function FactRow({
  label,
  value,
  trailing,
}: {
  label: string;
  value: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        minHeight: 44,
        borderBottom: "1px solid #EEF0F4",
      }}
    >
      <span
        style={{
          width: 150,
          flexShrink: 0,
          font: "400 12px/1.45 var(--font-sans)",
          color: "#5E6573",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          flexGrow: 1,
          minWidth: 0,
          font: "500 11px/1.5 var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          color: "#16181D",
        }}
      >
        {value}
      </span>
      {trailing ? (
        <span
          style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}
        >
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, font: "400 13px/1.5 var(--font-sans)", color: "#5E6573" }}>
      {children}
    </p>
  );
}

function Notice({ tone, children }: { tone: "warn"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 34,
        margin: "16px 0 0",
        padding: "0 12px",
        borderRadius: 8,
        background: tone === "warn" ? "#F4E6C5" : "#F1F3F6",
        font: "500 12px/1.4 var(--font-sans)",
        color: tone === "warn" ? "#6B4A12" : "#565C69",
      }}
    >
      {children}
    </p>
  );
}

function WriteError({ error }: { error: unknown }) {
  return (
    <p
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 34,
        margin: "16px 0 0",
        padding: "0 12px",
        borderRadius: 8,
        background: "#F6E2DD",
        font: "500 12px/1.4 var(--font-sans)",
        color: "#7A2419",
      }}
    >
      {getApiErrorMessage(error)}
    </p>
  );
}
