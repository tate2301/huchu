"use client";

import "@/components/list-frame/list-frame.css";
import "@/components/settings-frame/settings-frame.css";
import "./import-page.css";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

import { PageChrome } from "@/components/layout/page-chrome";
import { useHomeLink } from "@/components/layout/role-refusal";
import { LoadError, Refusal } from "@/components/list-frame/list-states";
import { SettingsAside } from "@/components/settings-frame/settings-aside";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/workspace/button";
import { Tabs } from "@/components/workspace/tabs";
import { CheckCircleSolid, Circle, Download, Loader2 } from "@/lib/icons";
import {
  COLUMNS_READ,
  doneText,
  HOW_MATCHED,
  importedToast,
  importLabel,
  type CommitStep,
  type ImportCounts,
  type ImportField,
  type ImportFix,
  type ImportPage as ImportPageData,
  type ImportRow,
  type ImportTab,
} from "@/lib/retail/import/words";
import { retailPermissionDenial } from "@/lib/retail/permission-matrix";
import { cn } from "@/lib/utils";

/**
 * Import products (W-08, SET-11; board `Import.png`): Template → Upload →
 * Check → Import. The Check step is a worksheet: every flagged cell is an
 * input that saves on blur and the row is checked again; a fixed row stays
 * where it is until the tab changes. Import puts the rows in a batch of 200
 * per call, with the count so far in the steps band; an import left part in
 * reads only, and "Finish the import" puts in the rest. `?id=` keeps the
 * import across a reload; `?from=setup` returns to the setup's tills step
 * once it is in.
 */

const API = "/api/v2/retail/products/import";
const TAB_LABEL: Record<ImportTab, string> = { fix: "Need a fix", new: "New", update: "Will update", done: "Done", all: "All" };
const FIELDS: Array<{ key: ImportField; label: string; mono?: boolean; end?: boolean; placeholder?: string }> = [
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "price", label: "Price", mono: true, end: true, placeholder: "0.00" },
  { key: "barcode", label: "Barcode", mono: true },
];

async function answer<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "That did not work. Try again.");
  return body?.data as T;
}

const pageKey = (id: string, tab: ImportTab) => ["retail-import", id, tab] as const;

export function ImportProductsPage() {
  const { data: session, status } = useSession();
  const home = useHomeLink();
  const user = session?.user as { role?: string | null; supportSessionId?: string | null } | undefined;
  const denial = status === "authenticated" ? retailPermissionDenial({ user: user ?? {} }, "retail.catalog", "create") : null;

  if (status === "loading") return null;
  if (denial) {
    return (
      <>
        <PageChrome title="Import products" backHref="/retail/products" backLabel="Products" />
        <Refusal noun="products" sentence={denial} back={home} />
      </>
    );
  }
  return <ImportFlow />;
}

function ImportFlow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const from = searchParams.get("from");
  const goTo = React.useCallback(
    (next: string | null) => {
      const params = new URLSearchParams();
      if (next) params.set("id", next);
      if (from) params.set("from", from);
      const query = params.toString();
      router.replace(`/retail/products/import${query ? `?${query}` : ""}`);
    },
    [from, router],
  );
  return id ? <CheckStep key={id} id={id} from={from} onRestart={() => goTo(null)} /> : <TemplateStep onUploaded={goTo} />;
}

/* ── Steps band ─────────────────────────────────────────────────────────── */

type StepsAt =
  | { at: "template" }
  | { at: "check"; file: { name: string; rows: number } | null }
  | { at: "import"; file: { name: string; rows: number } | null; progress: string }
  | { at: "imported"; file: { name: string; rows: number } | null; progress: string };

/**
 * Template → Uploaded → Check → Import. Under 720px only the current step
 * shows, with "Step n of 4" before it.
 */
function Steps(props: StepsAt) {
  const done = (label: React.ReactNode, current = false) => (
    <li className={cn("cx-im-step cx-im-step--done", current && "is-current")}>
      <CheckCircleSolid className="cx-im-step__mark" style={{ color: "var(--ok)" }} aria-hidden="true" />
      {label}
    </li>
  );
  const now = (n: number, label: React.ReactNode) => (
    <li className="cx-im-step cx-im-step--now is-current" aria-current="step">
      <span className="cx-im-step__num">{n}</span>
      {label}
    </li>
  );
  const sep = <li aria-hidden="true" className="cx-im-sep" />;
  const later = (label: string) => (
    <li className="cx-im-step">
      <Circle weight="regular" className="cx-im-step__mark" aria-hidden="true" />
      {label}
    </li>
  );
  const file = "file" in props && props.file ? props.file : null;
  const uploaded = (
    <span>
      Uploaded <span className="cx-im-mono">{file ? `${file.name}, ${file.rows} rows` : "…"}</span>
    </span>
  );
  const n = props.at === "template" ? 1 : props.at === "check" ? 3 : 4;
  return (
    <ol className="cx-im-steps" aria-label="Steps">
      <li className="cx-im-steps__count" aria-hidden="true">
        Step {n} of 4
      </li>
      {props.at === "template" ? (
        <>
          {now(1, "Template")}
          {sep}
          {later("Upload")}
          {sep}
          {later("Check")}
          {sep}
          {later("Import")}
        </>
      ) : (
        <>
          {done("Template")}
          {sep}
          {done(uploaded)}
          {sep}
          {props.at === "check" ? now(3, "Check") : done("Check")}
          {sep}
          {props.at === "check" ? later("Import") : null}
          {props.at === "import" ? now(4, <span className="cx-im-mono">{props.progress}</span>) : null}
          {props.at === "imported" ? done(<span className="cx-im-mono">{props.progress}</span>, true) : null}
        </>
      )}
    </ol>
  );
}

/* ── Template and Upload ───────────────────────────────────────────────── */

function TemplateStep({ onUploaded }: { onUploaded: (id: string) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.set("file", file);
      return answer<{ id: string }>(await fetch(API, { method: "POST", body }));
    },
    onSuccess: (data) => onUploaded(data.id),
  });
  const send = (file: File | undefined) => {
    if (file && !upload.isPending) upload.mutate(file);
  };

  return (
    <div className="cx-im">
      <PageChrome title="Import products" backHref="/retail/products" backLabel="Products" />
      <Steps at="template" />
      <div className="cx-im-body">
        <div className="cx-im-main cx-im-start">
          <section className="cx-im-block">
            <h2>Download the template</h2>
            <p>{COLUMNS_READ}</p>
            <div>
              <Button asChild size="field">
                <a href={`${API}/template`} download>
                  <Download className="size-3.5" aria-hidden="true" />
                  Download the template
                </a>
              </Button>
            </div>
          </section>
          <section className="cx-im-block">
            <h2>Upload it</h2>
            <div
              className={cn("cx-im-drop", over && "is-over")}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setOver(false);
                send(event.dataTransfer.files[0]);
              }}
            >
              {upload.isPending ? (
                <span className="cx-im-drop__line" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Reading {upload.variables?.name}…
                </span>
              ) : (
                <>
                  <span className="cx-im-drop__line">
                    Drop the spreadsheet here, or{" "}
                    <button type="button" className="cx-im-link" onClick={() => input.current?.click()}>
                      choose a file
                    </button>
                  </span>
                  <span className="cx-im-drop__hint">.xlsx or .csv, up to 5,000 rows</span>
                </>
              )}
              <input
                ref={input}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(event) => {
                  send(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
            {upload.isError ? (
              <p className="cx-im-error" role="alert">
                {upload.error.message}
              </p>
            ) : null}
          </section>
        </div>
        <SettingsAside sections={[{ title: "How rows are matched", text: HOW_MATCHED }]} />
      </div>
    </div>
  );
}

/* ── Check and Import ─────────────────────────────────────────────────── */

function CheckStep({ id, from, onRestart }: { id: string; from: string | null; onRestart: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<ImportTab>("fix");
  const [progress, setProgress] = React.useState<{ total: number; left: number } | null>(null);
  const key = pageKey(id, tab);
  const nextHref = from === "setup" ? "/retail/setup/tills" : "/retail/products";
  const page = useQuery({
    queryKey: key,
    queryFn: async () => answer<ImportPageData>(await fetch(`${API}/${id}?tab=${tab}`)),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // A change lands in this tab's rows where they are, so a fixed row stays until the tab changes.
  const apply = React.useCallback(
    (rows: ImportRow[], counts: ImportCounts) => {
      queryClient.setQueryData<ImportPageData>(key, (old) => {
        if (!old) return old;
        const changed = new Map(rows.map((row) => [row.id, row]));
        return { ...old, counts, rows: old.rows.map((row) => changed.get(row.id) ?? row) };
      });
      void queryClient.invalidateQueries({ queryKey: ["retail-import", id], refetchType: "none" });
    },
    [id, key, queryClient],
  );

  const edit = useMutation({
    mutationFn: async ({ rowId, field, value }: { rowId: string; field: ImportField; value: string }) =>
      answer<{ row: ImportRow; counts: ImportCounts }>(
        await fetch(`${API}/${id}/rows/${rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        }),
      ),
    onSuccess: (data) => apply([data.row], data.counts),
    onError: (error) => toast({ title: error.message, variant: "destructive" }),
  });
  const fix = useMutation({
    mutationFn: async ({ rowId, fix: kind }: { rowId: string; fix: ImportFix }) =>
      answer<{ rows: ImportRow[]; counts: ImportCounts }>(
        await fetch(`${API}/${id}/fix`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowId, fix: kind }),
        }),
      ),
    onSuccess: (data) => apply(data.rows, data.counts),
    onError: (error) => toast({ title: error.message, variant: "destructive" }),
  });
  const restart = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API}/${id}`, { method: "DELETE" });
      if (!response.ok) await answer(response);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["retail-import", id] });
      onRestart();
    },
    onError: (error) => toast({ title: error.message, variant: "destructive" }),
  });
  // One call per batch of 200, until none are left; the steps band counts them in.
  const commit = useMutation({
    mutationFn: async (total: number) => {
      setProgress({ total, left: total });
      for (;;) {
        const step = await answer<CommitStep>(await fetch(`${API}/${id}/commit`, { method: "POST" }));
        setProgress({ total, left: step.left });
        if (step.left === 0) return step;
      }
    },
    onSuccess: (result) => {
      toast({ title: importedToast(result), variant: "success" });
      for (const queryKey of [["list", "retail-products"], ["list", "retail-stock-on-hand"], ["lookup", "category"], ["lookup", "product"]]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      if (result.refused > 0) {
        // Rows the shop's rules refused at the last moment: shown with their reasons before leaving.
        setTab("done");
        void queryClient.invalidateQueries({ queryKey: ["retail-import", id] });
        return;
      }
      queryClient.removeQueries({ queryKey: ["retail-import", id] });
      router.push(nextHref);
    },
    onError: (error) => {
      toast({ title: error.message, variant: "destructive" });
      void queryClient.invalidateQueries({ queryKey: ["retail-import", id] });
    },
    onSettled: () => setProgress(null),
  });

  const data = page.data;
  // An import thrown away (here or elsewhere) starts again from the template.
  React.useEffect(() => {
    if (data?.status === "DISCARDED") onRestart();
  }, [data, onRestart]);
  React.useEffect(() => {
    if (page.error?.message === "Import not found") onRestart();
  }, [onRestart, page.error]);

  const counts = data?.counts;
  const ok = counts ? counts.new + counts.update : 0;
  const busy = edit.isPending || fix.isPending;
  const status = data?.status ?? "CHECKING";
  const editable = status === "CHECKING" && !commit.isPending;
  const file = data ? { name: data.fileName, rows: data.rowCount } : null;
  const tabs: ImportTab[] = counts && counts.done > 0 ? ["fix", "new", "update", "done", "all"] : ["fix", "new", "update", "all"];

  const steps: StepsAt = progress
    ? { at: "import", file, progress: `Importing ${(progress.total - progress.left).toLocaleString("en-US")} of ${progress.total.toLocaleString("en-US")}` }
    : status === "IMPORTING"
      ? { at: "import", file, progress: `Import, ${counts?.done ?? 0} done and ${ok} to go` }
      : status === "IMPORTED"
        ? { at: "imported", file, progress: "Imported" }
        : { at: "check", file };

  return (
    <div className="cx-im">
      <PageChrome title="Import products" backHref="/retail/products" backLabel="Products">
        {status === "CHECKING" ? (
          <Button onClick={() => restart.mutate()} busy={restart.isPending} disabled={commit.isPending}>
            Start again
          </Button>
        ) : null}
        {status === "IMPORTED" ? (
          <>
            <Button onClick={onRestart}>Import another file</Button>
            <Button variant="primary" onClick={() => router.push(nextHref)}>
              {from === "setup" ? "Go on to tills" : "Go to Products"}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={() => commit.mutate(ok)}
            busy={commit.isPending}
            disabled={!counts || ok === 0 || busy || restart.isPending}
          >
            {status === "IMPORTING" ? "Finish the import" : counts ? importLabel(counts) : "Import"}
          </Button>
        )}
      </PageChrome>
      <Steps {...steps} />
      <div className="cx-im-body">
        <div className="cx-im-main">
          <Tabs
            items={tabs.map((value) => ({
              value,
              label: TAB_LABEL[value],
              count: counts ? counts[value] : undefined,
            }))}
            value={tab}
            onValueChange={setTab}
            panelId="import-rows"
          />
          <div id="import-rows" role="tabpanel" className="cx-im-scroll">
            {page.isError && page.error.message !== "Import not found" ? (
              <LoadError noun="import" message={page.error.message} onRetry={() => void page.refetch()} />
            ) : (
              <RowsTable
                rows={data?.rows ?? null}
                tab={tab}
                editable={editable}
                onEdit={(rowId, field, value) => edit.mutate({ rowId, field, value })}
                onFix={(rowId, kind) => fix.mutate({ rowId, fix: kind })}
                fixing={fix.isPending ? fix.variables?.rowId ?? null : null}
              />
            )}
          </div>
        </div>
        <SettingsAside
          sections={[
            { title: status === "CHECKING" ? "When you import" : "This import", slot: "numbers" },
            { title: "How rows are matched", text: HOW_MATCHED },
            { title: "Columns read", text: COLUMNS_READ },
          ]}
          slots={{
            numbers: counts ? (
              <div className="cx-im-numbers">
                {counts.done > 0 ? (
                  <p>
                    <b>{counts.done}</b> rows done: in Products, or skipped with the reason under Done.
                  </p>
                ) : null}
                {status === "IMPORTED" ? null : (
                  <>
                    <p>
                      <b>{counts.new}</b> new products, on sale at once at {data?.siteName}.
                    </p>
                    <p>
                      <b>{counts.update}</b> products already here get the new price. The old one is kept in their history.
                    </p>
                  </>
                )}
                <p>
                  <b>{counts.fix}</b>{" "}
                  {status === "CHECKING" ? "rows still need a fix. Skip them, or fix them here." : "rows that needed a fix are skipped."}
                </p>
              </div>
            ) : null,
          }}
        />
      </div>
    </div>
  );
}

const EMPTY: Record<ImportTab, string> = {
  fix: "Nothing needs a fix.",
  new: "No new products in this file.",
  update: "No row updates a product already here.",
  done: "No row is in yet.",
  all: "This file has no rows.",
};

function RowsTable({
  rows,
  tab,
  editable,
  onEdit,
  onFix,
  fixing,
}: {
  rows: ImportRow[] | null;
  tab: ImportTab;
  editable: boolean;
  onEdit: (rowId: string, field: ImportField, value: string) => void;
  onFix: (rowId: string, fix: ImportFix) => void;
  fixing: string | null;
}) {
  return (
    <div role="table" aria-label="Rows" className="cx-im-table">
      <div role="row" className="cx-im-g cx-im-head">
        <div role="columnheader">Row</div>
        {FIELDS.map((field) => (
          <div key={field.key} role="columnheader" className={cn(field.end && "is-end")}>
            {field.label}
          </div>
        ))}
        <div role="columnheader">{tab === "fix" ? "What to fix" : "What happens"}</div>
      </div>
      {rows === null ? (
        Array.from({ length: 8 }, (_, index) => (
          <div key={index} role="row" aria-hidden="true" className="cx-im-g cx-im-row">
            {Array.from({ length: 6 }, (__, cell) => (
              <div key={cell}>
                <span className="cx-lf-skel" style={{ display: "block", width: `${40 + ((index * 7 + cell * 13) % 41)}%` }} />
              </div>
            ))}
          </div>
        ))
      ) : rows.length === 0 ? (
        <div className="cx-lf-block" role="status">
          <span className="cx-lf-block__line">{EMPTY[tab]}</span>
        </div>
      ) : (
        rows.map((row) => <RowLine key={row.id} row={row} editable={editable} onEdit={onEdit} onFix={onFix} fixing={fixing === row.id} />)
      )}
    </div>
  );
}

function RowLine({
  row,
  editable,
  onEdit,
  onFix,
  fixing,
}: {
  row: ImportRow;
  editable: boolean;
  onEdit: (rowId: string, field: ImportField, value: string) => void;
  onFix: (rowId: string, fix: ImportFix) => void;
  fixing: boolean;
}) {
  const problem = row.problem;
  return (
    <div role="row" className="cx-im-g cx-im-row">
      <div role="cell" className="cx-im-rowno">
        <span className="cx-im-cardlabel">Row </span>
        {row.rowNo}
      </div>
      {FIELDS.map((field) => {
        const bad = problem?.field === field.key;
        return (
          <label key={field.key} role="cell" className="cx-im-cell">
            <span className="cx-im-cardlabel">{field.label}</span>
            <input
              key={`${row.id}:${field.key}:${row[field.key]}`}
              className={cn("cx-im-input", field.mono && "cx-im-mono", field.end && "is-end", bad && "is-bad")}
              defaultValue={row[field.key]}
              placeholder={field.placeholder}
              readOnly={!editable}
              aria-label={`Row ${row.rowNo} ${field.label.toLowerCase()}`}
              aria-invalid={bad || undefined}
              inputMode={field.key === "price" ? "decimal" : field.key === "barcode" ? "numeric" : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={(event) => {
                const value = event.currentTarget.value;
                if (editable && value.trim() !== row[field.key].trim()) onEdit(row.id, field.key, value);
              }}
            />
          </label>
        );
      })}
      <div role="cell" className="cx-im-what">
        {row.done ? (
          <span className={row.done === "SKIPPED" ? "cx-im-problem" : "cx-im-muted"}>{doneText(row.done, row.matchedName, row.note)}</span>
        ) : problem ? (
          <>
            <span className="cx-im-problem">{problem.text}</span>
            {problem.fix && editable ? (
              <Button className="cx-im-fix" busy={fixing} onClick={() => onFix(row.id, problem.fix!)}>
                {problem.fixLabel}
              </Button>
            ) : null}
          </>
        ) : (
          <span className="cx-im-muted">{row.action === "UPDATE" ? `Updates ${row.matchedName ?? "a product"}` : "New"}</span>
        )}
      </div>
    </div>
  );
}
