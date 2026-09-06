"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, StatCard } from "@corelithzw/react";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { guessMapping, parseCsv, type CsvTable } from "@/lib/crm/csv";
import {
  IMPORT_FIELDS,
  columnPreview,
  mappingWarnings,
  type ImportEntity,
} from "@/lib/crm/import";
import {
  commitCrmImport,
  previewCrmImport,
  type CrmImportPreview,
} from "@/lib/crm/crm-v2";
import { cn } from "@corelithzw/ui/lib/utils";

const ENTITY_LABELS: Record<ImportEntity, string> = {
  PERSON: "People",
  COMPANY: "Companies",
  LEAD: "Leads",
};

const NONE = "__none__";

/**
 * Import in three steps: pick the file, say which column is which, look at
 * what would happen. Nothing is written until the last button, because an
 * import that writes first and reports afterwards leaves somebody reconciling
 * four thousand rows by hand.
 */
export function ImportWizard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [entity, setEntity] = useState<ImportEntity>("PERSON");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [onDuplicate, setOnDuplicate] = useState<"SKIP" | "UPDATE">("SKIP");
  const [preview, setPreview] = useState<CrmImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      setError("That file has no columns.");
      return;
    }
    setError(null);
    setCsv(text);
    setFileName(file.name);
    setTable(parsed);
    setMapping(guessMapping(parsed.headers, IMPORT_FIELDS[entity]));
    setPreview(null);
  };

  const changeEntity = (next: ImportEntity) => {
    setEntity(next);
    setPreview(null);
    if (table) setMapping(guessMapping(table.headers, IMPORT_FIELDS[next]));
  };

  const dryRun = useMutation({
    mutationFn: () => previewCrmImport({ entity, mapping, onDuplicate, csv }),
    onSuccess: (result) => {
      setPreview(result);
      setError(null);
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const commit = useMutation({
    mutationFn: () => commitCrmImport({ entity, mapping, onDuplicate, csv }),
    onSuccess: (result) => {
      const { created, updated, failed } = result;
      toast({
        title: `Imported ${created + updated} record${created + updated === 1 ? "" : "s"}`,
        description: failed.length ? `${failed.length} row(s) couldn't be saved.` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      setPreview(null);
      setTable(null);
      setCsv("");
      setFileName("");
      if (failed.length) {
        setError(
          `Rows that failed: ${failed.map((row) => `${row.line} (${row.message})`).join("; ")}`,
        );
      }
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const requiredMissing = IMPORT_FIELDS[entity]
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label);

  return (
    <div className="space-y-5">
      {error ? (
        <Alert tone="danger" title="Import problem">
          {error}
        </Alert>
      ) : null}

      <section className="space-y-3 rounded-[var(--card-radius)] border border-[var(--border)] p-4">
        <h2 className="text-base font-semibold text-[var(--text-strong)]">1. What are you importing?</h2>
        {/* Both controls fill the width on a phone. `items-end` on a wrapping
            row left the file picker hanging off the end of a half-width select
            with a native "No file chosen" beside it, which at 390px is a
            control you have to aim at. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1.5">
            <Label>Record type</Label>
            <Select value={entity} onValueChange={(value) => changeEntity(value as ImportEntity)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-file">CSV file</Label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm file:mr-3 file:min-h-9 file:rounded-[var(--radius-sm)] file:border file:border-[var(--border)] file:bg-[var(--surface-subtle)] file:px-3 file:text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
          </div>
        </div>
        {table ? (
          <p className="text-sm text-[var(--text-muted)]">
            {fileName} · {table.rows.length} row{table.rows.length === 1 ? "" : "s"} ·{" "}
            {table.headers.length} column{table.headers.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </section>

      {table ? (
        <section className="space-y-3 rounded-[var(--card-radius)] border border-[var(--border)] p-4">
          <h2 className="text-base font-semibold text-[var(--text-strong)]">2. Which column is which?</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Guessed from the headers. Change anything that looks wrong — a wrong
            guess applied silently is worse than no guess at all.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS[entity].map((field) => {
              const header = mapping[field.key];
              const preview = header ? columnPreview(table, header) : null;
              const warnings = preview ? mappingWarnings(field.key, preview) : [];

              return (
                <div key={field.key} className="space-y-1.5">
                  <Label>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <Select
                    value={mapping[field.key] ?? NONE}
                    onValueChange={(value) =>
                      setMapping((previous) => {
                        const next = { ...previous };
                        if (value === NONE) delete next[field.key];
                        else next[field.key] = value;
                        return next;
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not imported" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not imported</SelectItem>
                      {table.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* The values, not just the column name. A guess that is right
                      nine times in ten is the kind that gets waved through on
                      the tenth. */}
                  {preview ? (
                    <div className="space-y-0.5">
                      {preview.samples.length > 0 ? (
                        <p className="truncate text-sm text-[var(--text-muted)]">
                          {preview.samples.join(" · ")}
                          {preview.distinct > preview.samples.length
                            ? ` … ${preview.distinct} distinct`
                            : ""}
                        </p>
                      ) : null}
                      {warnings.map((warning) => (
                        <p
                          key={warning}
                          className="text-sm font-medium text-[var(--status-warning-fg)]"
                        >
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Columns in the file that nothing is reading. Not an error — most
              exports carry more than anybody wants — but the one thing you
              cannot see from a list of destinations. */}
          {table.headers.filter((header) => !Object.values(mapping).includes(header))
            .length > 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Not imported:{" "}
              {table.headers
                .filter((header) => !Object.values(mapping).includes(header))
                .join(", ")}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label>When a row matches something already here</Label>
            <Select
              value={onDuplicate}
              onValueChange={(value) => setOnDuplicate(value as "SKIP" | "UPDATE")}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SKIP">Leave the existing record alone</SelectItem>
                <SelectItem value="UPDATE">Update it with the file&apos;s values</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {requiredMissing.length ? (
            <p className="text-sm text-[var(--status-error-text)]">
              Still need a column for: {requiredMissing.join(", ")}
            </p>
          ) : null}

          <Button
            type="button"
            disabled={requiredMissing.length > 0 || dryRun.isPending}
            onClick={() => dryRun.mutate()}
          >
            {dryRun.isPending ? "Checking…" : "Check the file"}
          </Button>
        </section>
      ) : null}

      {preview ? (
        <section className="space-y-3 rounded-[var(--card-radius)] border border-[var(--border)] p-4">
          <h2 className="text-base font-semibold text-[var(--text-strong)]">3. What will happen</h2>

          <div className="flex flex-wrap gap-4">
            {(
              [
                ["Create", preview.totals.create, "success"],
                ["Update", preview.totals.update, "brand"],
                ["Skip", preview.totals.skip, "neutral"],
              ] as const
            ).map(([label, count, tone]) => (
              <StatCard key={label} label={label} value={count} tone={tone} />
            ))}
          </div>

          {preview.unmappedHeaders.length ? (
            <Alert tone="warn" title="Columns not being imported">
              {preview.unmappedHeaders.join(", ")}
            </Alert>
          ) : null}

          <div className="scroll-rail max-h-80 overflow-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface-subtle)] text-left">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Row</th>
                  <th className="px-2 py-1.5 font-medium">Action</th>
                  <th className="px-2 py-1.5 font-medium">Record</th>
                  <th className="px-2 py-1.5 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className="border-t border-[var(--border-subtle)]">
                    <td className="px-2 py-1.5 font-mono">{row.line}</td>
                    <td
                      className={cn(
                        "px-2 py-1.5",
                        row.action === "SKIP" ? "text-[var(--text-muted)]" : "",
                      )}
                    >
                      {row.action === "CREATE"
                        ? "Create"
                        : row.action === "UPDATE"
                          ? "Update"
                          : "Skip"}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.matchLabel ??
                        row.values.name ??
                        row.values.title ??
                        [row.values.firstName, row.values.lastName].filter(Boolean).join(" ") ??
                        "—"}
                    </td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">
                      {row.issues.map((issue) => issue.message).join("; ") ||
                        (row.matchId ? "Already here" : "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.rowCount > preview.rows.length ? (
            <p className="text-sm text-[var(--text-muted)]">
              Showing the first {preview.rows.length} of {preview.rowCount} rows. All of them will
              be imported.
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              disabled={
                commit.isPending || preview.totals.create + preview.totals.update === 0
              }
              onClick={() => commit.mutate()}
            >
              {commit.isPending
                ? "Importing…"
                : `Import ${preview.totals.create + preview.totals.update} record${
                    preview.totals.create + preview.totals.update === 1 ? "" : "s"
                  }`}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPreview(null)}>
              Back to mapping
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
