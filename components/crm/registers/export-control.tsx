"use client";

import { useState } from "react";

import { SegmentedControl } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { runDocumentExport, type DocumentExportFormat } from "@/lib/documents/export-client";
import { ChevronDown, Download } from "@/lib/icons";
import { cn } from "@/lib/utils";

import type { RegisterHandle } from "./use-register";

const FORMATS: Array<{ value: DocumentExportFormat; label: string }> = [
  { value: "xlsx", label: "Excel" },
  { value: "csv", label: "CSV" },
  { value: "pdf", label: "PDF" },
];

function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--surface-subtle)]">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-[var(--brand-strong)]" />
      {children}
    </label>
  );
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Export the list, or the rows ticked in it.
 *
 * Three questions and a button that says what it will do: which rows (the
 * ticked ones, when there are any, else every row the filters select), which
 * format, which columns (as on screen, in their order, or every column the
 * list has). The file is built on the server from the same query the rows
 * came from, so what was on screen is what arrives.
 */
export function RegisterExport({ register }: { register: RegisterHandle }) {
  const { def } = register;
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"selected" | "all" | null>(null);
  const [format, setFormat] = useState<DocumentExportFormat>("xlsx");
  const [columns, setColumns] = useState<"screen" | "all">("screen");
  const [status, setStatus] = useState<string | null>(null);

  const selected = register.selection.ids.length;
  const rows = selected > 0 && scope !== "all" ? "selected" : "all";
  const count = rows === "selected" ? selected : register.total;
  const noun = count === 1 ? def.noun.one : def.noun.many;

  const run = async () => {
    setStatus("Preparing…");
    try {
      await runDocumentExport(
        {
          endpoint: `/api/v2/crm/registers/${def.key.toLowerCase()}/export`,
          sourceKey: `crm.register.${def.key.toLowerCase()}`,
          target: "LIST",
          format,
          filters: register.exportFilters(),
          ids: rows === "selected" ? register.selection.ids : undefined,
          columns: columns === "screen" ? register.columns.visible : register.columns.all.map((column) => column.id),
          title: `${capitalise(def.noun.many)} - ${register.view.name}`,
          idempotencyKey: crypto.randomUUID(),
        },
        {
          timeoutMs: 10 * 60_000,
          onStatus: (next) =>
            setStatus(next === "queued" || next === "processing" ? "Building the file…" : next === "downloading" ? "Downloading…" : null),
        },
      );
      setOpen(false);
    } catch (error) {
      toast({
        title: "Could not export",
        description: error instanceof Error ? error.message : "The export failed.",
        variant: "destructive",
      });
    } finally {
      setStatus(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Download className="size-4" aria-hidden="true" />
          <span className="max-sm:not-sr-only sr-only 2xl:not-sr-only">Export</span>
          {selected > 0 ? <span className="font-mono text-sm tabular-nums">{selected}</span> : null}
          <ChevronDown className="size-3 text-[var(--text-subtle)]" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="space-y-3 p-3">
          {selected > 0 ? (
            <fieldset>
              <legend className="acct-col-head mb-1 px-2">Rows</legend>
              <Choice name="export-rows" checked={rows === "selected"} onChange={() => setScope("selected")}>
                The <span className="font-mono tabular-nums">{selected}</span> selected
              </Choice>
              <Choice name="export-rows" checked={rows === "all"} onChange={() => setScope("all")}>
                All <span className="font-mono tabular-nums">{register.total.toLocaleString("en-US")}</span> matching
              </Choice>
            </fieldset>
          ) : null}

          <div>
            <p className="acct-col-head mb-1.5 px-2">Format</p>
            <SegmentedControl<DocumentExportFormat>
              value={format}
              onValueChange={setFormat}
              aria-label="File format"
              size="sm"
              options={FORMATS}
            />
          </div>

          <fieldset>
            <legend className="acct-col-head mb-1 px-2">Columns</legend>
            <Choice name="export-columns" checked={columns === "screen"} onChange={() => setColumns("screen")}>
              As on screen <span className="text-[var(--text-muted)]">({register.columns.visible.length})</span>
            </Choice>
            <Choice name="export-columns" checked={columns === "all"} onChange={() => setColumns("all")}>
              Every column <span className="text-[var(--text-muted)]">({register.columns.all.length})</span>
            </Choice>
          </fieldset>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-3 py-2">
          <span className={cn("text-sm text-[var(--text-muted)]", !status && "invisible")} aria-live="polite">
            {status ?? "…"}
          </span>
          <Button type="button" variant="primary" size="sm" onClick={run} disabled={Boolean(status) || count === 0}>
            Export <span className="font-mono tabular-nums">{count.toLocaleString("en-US")}</span> {noun}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
