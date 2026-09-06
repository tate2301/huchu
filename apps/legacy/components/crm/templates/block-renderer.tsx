"use client";

import { useState, type ReactNode } from "react";

import { Input } from "@corelithzw/ui/components/input";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { Label } from "@corelithzw/ui/components/label";
import { resolveVariables, type VariableValues } from "@/lib/crm/template-variables";
import type { Block, LeafBlock } from "@/lib/crm/blocks";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * A template, drawn.
 *
 * The same component renders the editor's preview, the public form somebody
 * fills in, and the finished document a customer reads — because a builder
 * whose preview is a different component from its output is a builder that
 * lies, and the lie is only discovered by a customer.
 *
 * `mode` decides whether an input block is a control or a filled-in value.
 * Everything else is identical, which is the point.
 */

export type RenderMode = "preview" | "fill" | "read";

export type BlockRendererContext = {
  mode: RenderMode;
  /** What the variables resolve to. Sample values in preview. */
  values: VariableValues;
  /** Answers, when filling in or reading back a form. */
  answers?: Record<string, unknown>;
  onAnswer?: (key: string, value: unknown) => void;
  /** Line items and totals, for a quote or an invoice. */
  lines?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate?: number | null;
    total: number;
  }>;
  totals?: { subtotal: number; tax: number; total: number; paid?: number };
  currency?: string;
  /** Rows for a table block, keyed by the block's source. */
  tables?: Record<string, Array<Record<string, string>>>;
  brandingLogoUrl?: string | null;
  /**
   * Where a file question posts its file. What a file answer stores is the URL
   * the upload landed at, so without somewhere to put it a file question can
   * only ever be decorative.
   */
  uploadUrl?: string;
};

function money(value: number, currency: string): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

function Fill({ text, context }: { text: string; context: BlockRendererContext }) {
  return <>{resolveVariables(text, context.values)}</>;
}

/**
 * A file question.
 *
 * Separate from the other inputs because a file input cannot be controlled —
 * setting `value` from `event.target.value` was writing "C:\fakepath\x.pdf"
 * into the answer and React was refusing the assignment anyway, so a file
 * question collected a made-up string and never a file. The real shape is:
 * post the file, keep the URL it landed at, show what was attached.
 */
function FileAnswer({
  id,
  value,
  readOnly,
  uploadUrl,
  onChange,
}: {
  id: string;
  value: string | null;
  readOnly: boolean;
  uploadUrl?: string;
  onChange: (next: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (readOnly || !uploadUrl) {
    return value ? (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-[var(--action-primary-bg)] underline"
      >
        {fileNameFrom(value)}
      </a>
    ) : (
      <p className="text-sm text-[var(--text-subtle)]">No file</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {value ? (
        <div className="flex items-center gap-2">
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--action-primary-bg)] underline"
          >
            {fileNameFrom(value)}
          </a>
          <button
            type="button"
            className="text-sm text-[var(--text-muted)] underline"
            onClick={() => onChange(null)}
          >
            Remove
          </button>
        </div>
      ) : null}

      <input
        id={id}
        type="file"
        disabled={busy}
        className="block w-full text-sm file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-[var(--border)] file:bg-[var(--surface-subtle)] file:px-3 file:py-1.5 file:text-sm"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          // The input is cleared either way: what it holds is a picking
          // gesture, not the answer, and leaving it filled makes a failed
          // upload look like a successful one.
          event.target.value = "";
          if (!file) return;

          setBusy(true);
          setError(null);
          try {
            const body = new FormData();
            body.append("file", file);
            const response = await fetch(uploadUrl, { method: "POST", body });
            const payload = (await response.json()) as {
              ok?: boolean;
              url?: string;
              data?: { url?: string };
              error?: string;
            };
            const url = payload.url ?? payload.data?.url;
            if (!response.ok || !url) throw new Error(payload.error ?? "Upload failed");
            onChange(url);
          } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />

      {busy ? <p className="text-sm text-[var(--text-subtle)]">Uploading…</p> : null}
      {error ? <p className="text-sm text-[var(--status-danger-text)]">{error}</p> : null}
    </div>
  );
}

/** The last path segment, which is as close to a filename as a blob URL gets. */
function fileNameFrom(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1)) || "Attached file";
  } catch {
    return "Attached file";
  }
}

function FieldBlock({
  block,
  context,
}: {
  block: Extract<Block, { type: "field" }>;
  context: BlockRendererContext;
}) {
  const value = context.answers?.[block.key];
  const readOnly = context.mode !== "fill";

  const label = (
    <Label htmlFor={`field-${block.id}`}>
      {block.label || "Untitled question"}
      {block.required ? <span className="text-[var(--status-error-text)]"> *</span> : null}
    </Label>
  );

  // In read mode a question is a fact, not a disabled control. A greyed-out
  // input is a promise the reader can edit it once they find the right button.
  if (context.mode === "read") {
    return (
      <div className="space-y-0.5">
        <p className="text-sm text-[var(--text-muted)]">{block.label}</p>
        <p className="text-sm">
          {value === undefined || value === null || value === ""
            ? "—"
            : Array.isArray(value)
              ? value.join(", ")
              : String(value)}
        </p>
      </div>
    );
  }

  const help = block.help ? (
    <p className="text-sm text-[var(--text-muted)]">{block.help}</p>
  ) : null;

  function set(next: unknown) {
    context.onAnswer?.(block.key, next);
  }

  return (
    <div className="space-y-1.5">
      {label}
      {block.fieldType === "longText" ? (
        <Textarea
          id={`field-${block.id}`}
          rows={4}
          disabled={readOnly}
          placeholder={block.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => set(event.target.value)}
        />
      ) : block.fieldType === "select" ? (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(next) => set(next)}
        >
          <SelectTrigger id={`field-${block.id}`} disabled={readOnly}>
            <SelectValue placeholder={block.placeholder ?? "Pick one"} />
          </SelectTrigger>
          <SelectContent>
            {(block.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : block.fieldType === "multiSelect" ? (
        <div className="space-y-1.5">
          {(block.options ?? []).map((option) => {
            const selected = Array.isArray(value) && value.includes(option);
            return (
              <label key={option} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected}
                  disabled={readOnly}
                  onCheckedChange={() => {
                    const current = Array.isArray(value) ? (value as string[]) : [];
                    set(
                      selected
                        ? current.filter((entry) => entry !== option)
                        : [...current, option],
                    );
                  }}
                />
                {option}
              </label>
            );
          })}
        </div>
      ) : block.fieldType === "checkbox" ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value === true}
            disabled={readOnly}
            onCheckedChange={(next) => set(next === true)}
          />
          {block.placeholder ?? "Yes"}
        </label>
      ) : block.fieldType === "file" ? (
        <FileAnswer
          id={`field-${block.id}`}
          value={typeof value === "string" ? value : null}
          readOnly={readOnly}
          uploadUrl={context.uploadUrl}
          onChange={set}
        />
      ) : (
        <Input
          id={`field-${block.id}`}
          type={
            block.fieldType === "number"
              ? "number"
              : block.fieldType === "email"
                ? "email"
                : block.fieldType === "phone"
                  ? "tel"
                  : block.fieldType === "date"
                    ? "date"
                    : "text"
          }
          disabled={readOnly}
          placeholder={block.placeholder}
          value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
          onChange={(event) =>
            set(
              block.fieldType === "number"
                ? Number(event.target.value) || 0
                : event.target.value,
            )
          }
        />
      )}
      {help}
    </div>
  );
}

function BlockBody({
  block,
  context,
}: {
  block: Block;
  context: BlockRendererContext;
}): ReactNode {
  const currency = context.currency ?? "USD";

  switch (block.type) {
    case "heading": {
      const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      return (
        <Tag
          className={cn(
            "font-semibold text-[var(--text-strong)]",
            block.level === 1 ? "text-xl" : block.level === 2 ? "text-base" : "text-sm",
          )}
        >
          <Fill text={block.text} context={context} />
        </Tag>
      );
    }

    case "text":
      return (
        <p className="whitespace-pre-wrap text-sm text-[var(--text-body)]">
          <Fill text={block.text} context={context} />
        </p>
      );

    case "field":
      return <FieldBlock block={block} context={context} />;

    case "divider":
      return <hr className="border-[var(--border-subtle)]" />;

    case "spacer":
      return (
        <div
          aria-hidden="true"
          className={block.size === "sm" ? "h-2" : block.size === "lg" ? "h-10" : "h-5"}
        />
      );

    case "image": {
      const src =
        block.source === "branding.logo" ? context.brandingLogoUrl : block.url ?? null;
      if (!src) {
        return (
          <p className="text-sm text-[var(--text-subtle)]">
            {block.source === "branding.logo"
              ? "Your logo goes here — add one under Branding."
              : "No image chosen."}
          </p>
        );
      }
      return (
        // Not next/image: the source is a tenant's own logo or an arbitrary
        // URL, neither of which the image optimiser is configured for.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={block.alt ?? ""}
          style={block.width ? { width: block.width } : undefined}
          className="max-w-full"
        />
      );
    }

    case "table": {
      const rows = context.tables?.[block.source] ?? [];
      if (block.columns.length === 0) {
        return (
          <p className="text-sm text-[var(--text-subtle)]">
            This table has no columns yet.
          </p>
        );
      }
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left">
              <tr>
                {block.columns.map((column) => (
                  <th key={column.key} className="py-1.5 pr-3 font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={block.columns.length}
                    className="py-3 text-center text-[var(--text-muted)]"
                  >
                    {context.mode === "preview" ? "Rows appear here" : "Nothing to show"}
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={index} className="border-b border-[var(--border-subtle)]">
                    {block.columns.map((column) => (
                      <td key={column.key} className="py-1.5 pr-3">
                        {row[column.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      );
    }

    case "lineItems": {
      const lines = context.lines ?? [];
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Description</th>
                <th className="py-1.5 pr-3 text-right font-medium">Qty</th>
                <th className="py-1.5 pr-3 text-right font-medium">Unit</th>
                {block.showTax ? (
                  <th className="py-1.5 pr-3 text-right font-medium">Tax</th>
                ) : null}
                <th className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={block.showTax ? 5 : 4}
                    className="py-3 text-center text-[var(--text-muted)]"
                  >
                    The document&apos;s lines appear here
                  </td>
                </tr>
              ) : (
                lines.map((line, index) => (
                  <tr key={index} className="border-b border-[var(--border-subtle)]">
                    <td className="py-1.5 pr-3">{line.description}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{line.quantity}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {money(line.unitPrice, currency)}
                    </td>
                    {block.showTax ? (
                      <td className="py-1.5 pr-3 text-right font-mono">
                        {line.taxRate ? `${line.taxRate}%` : "—"}
                      </td>
                    ) : null}
                    <td className="py-1.5 text-right font-mono">
                      {money(line.total, currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      );
    }

    case "totals": {
      const totals = context.totals ?? { subtotal: 0, tax: 0, total: 0 };
      return (
        <dl className="ml-auto w-full max-w-64 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Subtotal</dt>
            <dd className="font-mono">{money(totals.subtotal, currency)}</dd>
          </div>
          {block.showTax ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Tax</dt>
              <dd className="font-mono">{money(totals.tax, currency)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-1 font-medium">
            <dt>Total</dt>
            <dd className="font-mono">{money(totals.total, currency)}</dd>
          </div>
          {block.showPaid ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Paid</dt>
              <dd className="font-mono">{money(totals.paid ?? 0, currency)}</dd>
            </div>
          ) : null}
        </dl>
      );
    }

    case "signature":
      return (
        <div className={cn("grid gap-6", block.party === "both" ? "sm:grid-cols-2" : "")}>
          {(block.party === "both" ? ["customer", "us"] : [block.party]).map((party) => (
            <div key={party} className="space-y-1">
              <div className="h-12 border-b border-[var(--border)]" />
              <p className="text-sm text-[var(--text-muted)]">
                {party === "us" ? "For the company" : block.label}
              </p>
            </div>
          ))}
        </div>
      );

    case "terms":
      return (
        <div className="rounded-[var(--radius-md)] bg-[var(--surface-subtle)] p-3">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-muted)]">
            <Fill text={block.text} context={context} />
          </p>
        </div>
      );

    case "columns":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            {block.left.map((child: LeafBlock) => (
              <BlockBody key={child.id} block={child} context={context} />
            ))}
          </div>
          <div className="space-y-3">
            {block.right.map((child: LeafBlock) => (
              <BlockBody key={child.id} block={child} context={context} />
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function BlockRenderer({
  blocks,
  context,
  className,
}: {
  blocks: Block[];
  context: BlockRendererContext;
  className?: string;
}) {
  if (blocks.length === 0) {
    return (
      <p className={cn("py-8 text-center text-sm text-[var(--text-muted)]", className)}>
        Nothing here yet.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block) => (
        <BlockBody key={block.id} block={block} context={context} />
      ))}
    </div>
  );
}
