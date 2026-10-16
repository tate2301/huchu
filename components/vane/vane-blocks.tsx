import * as React from "react";
import Link from "next/link";

import { Icon } from "@/components/core";
import type { VaneBlockView, VaneQuoteView } from "@/lib/vane/blocks";

const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const twoPlaces = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function money(value: number, currency = "USD") {
  const body = twoPlaces.format(Math.abs(value));
  return `${value < 0 ? "−" : ""}${currency === "USD" ? "$" : `${currency} `}${body}`;
}

function amount(value: number, unit: "money" | "number" | "percent", currency?: string) {
  if (unit === "money") return money(value, currency);
  if (unit === "percent") return `${plain.format(value)}%`;
  return plain.format(value);
}

const qty = (n: number) => (Number.isInteger(n) ? String(n) : plain.format(n));

function Figures({ block }: { block: Extract<VaneBlockView, { kind: "figures" }> }) {
  return (
    <section className="vb vb-figs" aria-label={block.title ?? "Figures"}>
      {block.title ? <h4 className="vb-h">{block.title}</h4> : null}
      <div className="vb-figs-g">
        {block.figures.map((figure) => (
          <div key={figure.label} className="vb-fig">
            <span className="vb-fig-l">{figure.label}</span>
            <span className="vb-fig-v">{figure.value}</span>
            {figure.note ? <span className="vb-fig-n">{figure.note}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Bars across the panel's width (it is narrow), or a trend line with its first and last points named. */
function Chart({ block }: { block: Extract<VaneBlockView, { kind: "chart" }> }) {
  const values = block.points.map((point) => point.value);
  const top = Math.max(...values.map(Math.abs), 1);
  const say = (value: number) => amount(value, block.unit, block.currency);
  const summary = block.points.map((point) => `${point.label}: ${say(point.value)}`).join(", ");
  if (block.form === "bars") {
    return (
      <figure className="vb vb-chart" aria-label={`${block.title}. ${summary}`}>
        <figcaption className="vb-h">{block.title}</figcaption>
        <div className="vb-bars" aria-hidden="true">
          {block.points.map((point) => (
            <div key={point.label} className="vb-bar">
              <span className="vb-bar-l truncate">{point.label}</span>
              <span className="vb-bar-t">
                <i style={{ width: `${Math.max(2, (Math.abs(point.value) / top) * 100)}%` }} />
              </span>
              <span className="vb-bar-v">{say(point.value)}</span>
            </div>
          ))}
        </div>
      </figure>
    );
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const w = 100;
  const h = 40;
  const at = (index: number) => (index / (values.length - 1)) * w;
  const y = (value: number) => h - ((value - low) / span) * (h - 4) - 2;
  const line = values.map((value, index) => `${index === 0 ? "M" : "L"}${at(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const first = block.points[0]!;
  const last = block.points[block.points.length - 1]!;
  return (
    <figure className="vb vb-chart" aria-label={`${block.title}. ${summary}`}>
      <figcaption className="vb-h">{block.title}</figcaption>
      <svg className="vb-trend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${line} L${w},${h} L0,${h} Z`} className="vb-trend-a" />
        <path d={line} className="vb-trend-l" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="vb-trend-k" aria-hidden="true">
        <span>
          {first.label} <b>{say(first.value)}</b>
        </span>
        <span>
          {last.label} <b>{say(last.value)}</b>
        </span>
      </div>
    </figure>
  );
}

function Record({ block }: { block: Extract<VaneBlockView, { kind: "record" }> }) {
  return (
    <Link href={block.href} className="vb vb-rec">
      <span className="vb-rec-h">
        <b className="truncate">{block.title}</b>
        {block.status ? <span className="pill">{block.status}</span> : null}
        <Icon name="chev" />
      </span>
      {block.subtitle ? <span className="vb-rec-s">{block.subtitle}</span> : null}
      {block.fields.length ? (
        <dl className="vb-rec-f">
          {block.fields.map((field) => (
            <React.Fragment key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
    </Link>
  );
}

/** A quote Vane drafted, as it stands: its lines with where each price came from, its total, and the way to it. */
export function QuoteBlock({ quote }: { quote: VaneQuoteView }) {
  return (
    <section className="vb vb-quote" aria-label={`Quote ${quote.number}`}>
      <header className="vb-quote-h">
        <span className="vb-quote-t">
          <b>{quote.number}</b>
          <span className="muted">{quote.customer}</span>
        </span>
        <span className="pill">{quote.madeByVane && quote.status === "Draft" ? "Vane's draft" : quote.status}</span>
      </header>
      <table className="vb-quote-l">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className="num">
              Qty
            </th>
            <th scope="col" className="num">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((line, index) => (
            <tr key={index}>
              <td>
                <span className="vb-quote-d">{line.description}</span>
                <span className="vb-quote-s">
                  {line.source ? (
                    <Link href={line.source.href} className="link">
                      {line.source.title}
                    </Link>
                  ) : (
                    <span className="vb-warn">
                      <Icon name="warn" /> No price behind it: check it
                    </span>
                  )}
                  <span className="muted"> · {money(line.unitPrice, quote.currency)} each</span>
                </span>
              </td>
              <td className="num">{qty(line.quantity)}</td>
              <td className="num">{money(line.amount, quote.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {quote.taxTotal > 0 ? (
            <tr>
              <td colSpan={2}>VAT</td>
              <td className="num">{money(quote.taxTotal, quote.currency)}</td>
            </tr>
          ) : null}
          <tr>
            <td colSpan={2}>
              <b>Total</b>
            </td>
            <td className="num">
              <b>{money(quote.total, quote.currency)}</b>
            </td>
          </tr>
        </tfoot>
      </table>
      <footer className="vb-quote-f">
        {quote.unpriced > 0 ? (
          <span className="vb-warn">
            <Icon name="warn" /> {quote.unpriced === 1 ? "1 line is" : `${quote.unpriced} lines are`} my estimate
          </span>
        ) : (
          <span className="muted">Every price is from your knowledge</span>
        )}
        <Link href={quote.href} className="btn btn-sm">
          Open the quote
        </Link>
      </footer>
    </section>
  );
}

function Sources({ block }: { block: Extract<VaneBlockView, { kind: "sources" }> }) {
  return (
    <section className="vb vb-src" aria-label="What I went by">
      <h4 className="vb-h">What I went by</h4>
      <ul>
        {block.items.map((item) => (
          <li key={`${item.href}-${item.title}`}>
            <Icon name="docs" />
            <span>
              <Link href={item.href} className="link">
                {item.title}
              </Link>
              {item.note ? <span className="muted"> · {item.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What Vane put in an answer besides its words (the `show` tool): figures, a
 * chart, a record's card, a quote it drafted, and what it went by. A quote
 * since deleted says so.
 */
export function VaneBlocks({ blocks }: { blocks: VaneBlockView[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="vb-list">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "figures":
            return <Figures key={index} block={block} />;
          case "chart":
            return <Chart key={index} block={block} />;
          case "record":
            return <Record key={index} block={block} />;
          case "quote":
            return <QuoteBlock key={index} quote={block} />;
          case "sources":
            return <Sources key={index} block={block} />;
          case "gone":
            return (
              <p key={index} className="vm-read">
                {block.what} is not here any more.
              </p>
            );
        }
      })}
    </div>
  );
}
