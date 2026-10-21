import * as React from "react";

import { Kit, KitScreen } from "@/components/core";

/** Money in a sentence: "US$1,240.00", "−US$18.00", "ZiG 12,393.66", "ZAR 1,200.00". */
const MONEY = /([+−-]?(?:US\$|\$|ZiG |[A-Z]{3} )\d[\d,]*\.\d{2})/;

/** A sentence with its money set in tabular figures, as the kit's findings are. */
export function Figures({ text }: { text: string }) {
  const parts = text.split(MONEY);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span className="num" key={index}>
            {part}
          </span>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

/** The finding a Books page opens with: the fact in ink, what is behind it in grey. */
export function BooksFinding({ finding }: { finding: { fact: string; rest: string | null } }) {
  return (
    <div className="finding">
      <p className="lede-figure">
        <Figures text={finding.fact} />
        {finding.rest ? (
          <>
            {" "}
            <span className="q">
              <Figures text={finding.rest} />
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

/**
 * A Books page inside the app's shell: edge to edge under the top bar, with the
 * screen's own rules (`.sc-<slug>`) and the page column (`.mn`) the kit draws.
 */
export function BooksPage({ screen, children }: { screen: string; children: React.ReactNode }) {
  return (
    <Kit className="kit-main">
      <KitScreen slug={screen}>
        <div className="mn">
          {children}
        </div>
      </KitScreen>
    </Kit>
  );
}

/** An amount with its cents muted; a true minus. */
export function Cents({ value, currency }: { value: number; currency: string }) {
  const text = new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
  const cut = text.lastIndexOf(".");
  return (
    <span className="num">
      {value < 0 ? "−" : ""}
      {cut < 0 ? text : text.slice(0, cut)}
      {cut < 0 ? null : <i style={{ fontStyle: "normal", color: "var(--color-muted)" }}>{text.slice(cut)}</i>}
    </span>
  );
}
