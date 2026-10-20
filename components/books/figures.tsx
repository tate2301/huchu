import * as React from "react";

import { Kit, KitScreen } from "@/components/core";

/** Money in a sentence: "$1,240.00", "−$18.00", "ZWG 12,393.66", "ZAR 1,200.00". */
const MONEY = /([+−-]?(?:US\$|\$|ZWG |[A-Z]{3} )\d[\d,]*\.\d{2})/;

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
