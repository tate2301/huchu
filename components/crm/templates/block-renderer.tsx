"use client";

import type { ReactNode } from "react";

import { FieldInput } from "@/components/forms/field-input";
import { resolveVariables, type VariableValues } from "@/lib/crm/template-variables";
import type { Block, LeafBlock } from "@/lib/crm/blocks";
import { cn } from "@/lib/utils";

import styles from "./document.module.css";

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
/** A question, drawn by the one input every form in the app uses. */
function FieldBlock({
  block,
  context,
}: {
  block: Extract<Block, { type: "field" }>;
  context: BlockRendererContext;
}) {
  const { field } = block;
  return (
    <FieldInput
      field={field}
      mode={context.mode}
      idPrefix={`field-${block.id}`}
      value={context.answers?.[field.key]}
      onChange={(value) => context.onAnswer?.(field.key, value)}
      uploadUrl={context.uploadUrl}
    />
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
        <Tag className={block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3}>
          <Fill text={block.text} context={context} />
        </Tag>
      );
    }

    case "text":
      return (
        <p className={styles.text}>
          <Fill text={block.text} context={context} />
        </p>
      );

    case "field":
      return <FieldBlock block={block} context={context} />;

    case "divider":
      return <hr className={styles.rule} />;

    case "spacer":
      return (
        <div
          aria-hidden="true"
          style={{ height: block.size === "sm" ? 8 : block.size === "lg" ? 40 : 20 }}
        />
      );

    case "image": {
      const src =
        block.source === "branding.logo" ? context.brandingLogoUrl : block.url ?? null;
      if (!src) {
        return (
          <p className={styles.muted}>
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
          className={styles.image}
        />
      );
    }

    case "table": {
      const rows = context.tables?.[block.source] ?? [];
      if (block.columns.length === 0) {
        return (
          <p className={styles.muted}>This table has no columns yet.</p>
        );
      }
      return (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {block.columns.map((column) => (
                  <th key={column.key} scope="col" className={styles.th}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={block.columns.length} className={styles.tdEmpty}>
                    {context.mode === "preview" ? "Rows appear here" : "Nothing to show"}
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={index}>
                    {block.columns.map((column) => (
                      <td key={column.key} className={styles.td}>
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
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.th}>
                  Item
                </th>
                <th scope="col" className={styles.th}>
                  Qty
                </th>
                <th scope="col" className={styles.th}>
                  Rate
                </th>
                {block.showTax ? (
                  <th scope="col" className={styles.th}>
                    Tax
                  </th>
                ) : null}
                <th scope="col" className={styles.th}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={block.showTax ? 5 : 4} className={styles.tdEmpty}>
                    The document&apos;s lines appear here
                  </td>
                </tr>
              ) : (
                lines.map((line, index) => (
                  <tr key={index}>
                    <td className={styles.td}>{line.description}</td>
                    <td className={cn(styles.td, styles.tdNum)}>{line.quantity}</td>
                    <td className={cn(styles.td, styles.tdNum)}>
                      {money(line.unitPrice, currency)}
                    </td>
                    {block.showTax ? (
                      <td className={cn(styles.td, styles.tdNum)}>
                        {line.taxRate ? `${line.taxRate}%` : "—"}
                      </td>
                    ) : null}
                    <td className={cn(styles.td, styles.tdNum, styles.tdAmount)}>
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
        <div className={styles.totals}>
          <dl className={styles.totalsStack}>
            <div className={styles.totalsRow}>
              <dt>Subtotal</dt>
              <dd>{money(totals.subtotal, currency)}</dd>
            </div>
            {block.showTax ? (
              <div className={styles.totalsRow}>
                <dt>Tax</dt>
                <dd>{money(totals.tax, currency)}</dd>
              </div>
            ) : null}
            <div className={styles.totalsGrand}>
              <dt>{`Total ${currency}`}</dt>
              <dd>{money(totals.total, currency)}</dd>
            </div>
            {block.showPaid ? (
              <div className={styles.totalsRow}>
                <dt>Paid</dt>
                <dd>{money(totals.paid ?? 0, currency)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      );
    }

    case "signature":
      return (
        <div
          className={cn(styles.signatures, block.party === "both" && styles.signaturesPair)}
        >
          {(block.party === "both" ? ["customer", "us"] : [block.party]).map((party) => (
            <div key={party} className={styles.signature}>
              <div className={styles.signatureLine} />
              <p className={styles.signatureLabel}>
                {party === "us" ? "For the company" : block.label}
              </p>
            </div>
          ))}
        </div>
      );

    case "terms":
      return (
        <div className={styles.terms}>
          <span className={styles.micro}>Terms</span>
          <p className={styles.termsText}>
            <Fill text={block.text} context={context} />
          </p>
        </div>
      );

    case "columns":
      return (
        <div className={styles.columns}>
          <div className={styles.column}>
            {block.left.map((child: LeafBlock) => (
              <BlockBody key={child.id} block={child} context={context} />
            ))}
          </div>
          <div className={styles.column}>
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
    return <p className={cn(styles.empty, className)}>Nothing here yet.</p>;
  }

  return (
    <div className={cn(styles.doc, className)}>
      {blocks.map((block) => (
        <BlockBody key={block.id} block={block} context={context} />
      ))}
    </div>
  );
}
