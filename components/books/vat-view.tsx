"use client";

import * as React from "react";

import { Button, Icon } from "@/components/core";
import { money } from "@/lib/books/format";
import type { VatState, VatView } from "@/lib/books/vat";

const STATUS: Record<VatState, { cls: string; label: string }> = {
  draft: { cls: "status status-warning", label: "Draft" },
  reviewed: { cls: "status status-info", label: "Reviewed" },
  finalised: { cls: "status status-info", label: "Finalised" },
  filed: { cls: "status status-success", label: "Filed" },
  void: { cls: "status", label: "Void" },
};

/** The next step on a return, as its one primary: Mark reviewed, Finalise, Mark filed. */
const NEXT: Partial<Record<VatState, { action: "review" | "finalize" | "file"; label: string }>> = {
  draft: { action: "review", label: "Mark reviewed" },
  reviewed: { action: "finalize", label: "Finalise" },
  finalised: { action: "file", label: "Mark filed" },
};

/**
 * Books → VAT returns (PageBooksVat): the finding, every return with what went
 * out and came in, and the chosen one's boxes with its next step.
 */
export function VatPageView({
  data,
  onSelect,
  onStep,
  onRefresh,
  csvHref,
  busy = false,
}: {
  data: VatView;
  onSelect: (id: string) => void;
  onStep: (action: "review" | "finalize" | "file") => void;
  onRefresh: () => void;
  csvHref: string | null;
  busy?: boolean;
}) {
  const selected = data.selected;
  const next = selected ? NEXT[selected.state] : undefined;
  return (
    <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
      <div className="kbody">
        <div className="finding">
          <p className="lede-figure">
            {data.finding.fact}
            {data.finding.rest ? <span className="q"> {data.finding.rest}</span> : null}
          </p>
        </div>
        {data.rows.length === 0 ? null : (
          <div className="wt" style={{ flex: "none" }}>
            <table className="table" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Category</th>
                  <th className="num">Output VAT</th>
                  <th className="num">Input VAT</th>
                  <th className="num">Net</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.id}
                    aria-selected={row.id === selected?.id || undefined}
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelect(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onSelect(row.id);
                    }}
                  >
                    <td>
                      <span className="cell-lead">{row.period}</span>
                    </td>
                    <td className="muted">{row.category}</td>
                    <td className="num">{money(row.output)}</td>
                    <td className="num">{money(row.input)}</td>
                    <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                      {money(row.net)}
                    </td>
                    <td>
                      <span className={STATUS[row.state].cls}>{STATUS[row.state].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selected ? (
          <>
            <div className="group-head" style={{ paddingTop: 24 }}>
              <h2>{selected.title}</h2>
            </div>
            <p className="muted" style={{ padding: "0 24px 12px" }}>
              {selected.meta}
            </p>
            <div className="wt" style={{ flex: "none" }}>
              <table className="table" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 140 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Box</th>
                    <th className="num">Rate</th>
                    <th className="num">Value</th>
                    <th className="num">VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.boxes.map((box, index) => (
                    <tr key={index}>
                      <td>{box.label}</td>
                      <td className="num">{`${box.rate}%`}</td>
                      <td className="num">{money(box.value)}</td>
                      <td className="num">{money(box.vat)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="tot">
                    <td>{selected.netLabel}</td>
                    <td className="num" />
                    <td className="num" />
                    <td className="num">{money(Math.abs(selected.net))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 24px" }}>
              <span className="muted" style={{ flex: 1 }}>
                {selected.note}
              </span>
              {selected.state === "draft" || selected.state === "reviewed" ? (
                <Button icon="history" disabled={busy} onClick={onRefresh}>
                  Refresh
                </Button>
              ) : null}
              {csvHref ? (
                <a className="btn" href={csvHref} download>
                  <Icon name="export" />
                  VAT-7 CSV
                </a>
              ) : null}
              {next ? (
                <Button variant="primary" shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={() => onStep(next.action)}>
                  {next.label}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
