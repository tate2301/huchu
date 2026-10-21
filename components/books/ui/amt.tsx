import * as React from "react";

const MINUS = "−";
const whole = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/**
 * An amount as the design sets it (`.amt`): whole units in ink, the cents
 * muted, a true minus. A column names its currency once in its head, so cells
 * leave it out (`currency={null}`); a sentence or a lone figure carries it:
 * "$1,200.00", "ZWG 41,300.00".
 */
export function Amt({
  value,
  currency = "USD",
  signed = false,
  className,
}: {
  value: number;
  /** null in a column whose head names the currency. */
  currency?: string | null;
  /** "+" before money in, as the bank's lines show it. */
  signed?: boolean;
  className?: string;
}) {
  const cents = Math.round(Math.abs(value) * 100);
  const units = whole.format(Math.floor(cents / 100));
  const frac = String(cents % 100).padStart(2, "0");
  const code = currency?.toUpperCase();
  const prefix = code == null ? "" : code === "USD" ? "$" : `${code} `;
  const sign = value < 0 && cents > 0 ? MINUS : signed && cents > 0 ? "+" : "";
  return (
    <span className={className ? `amt ${className}` : "amt"}>
      {sign}
      {prefix}
      {units}
      <i>.{frac}</i>
    </span>
  );
}

/** "—": a cell with nothing in it, as the design writes an empty balance. */
export function None() {
  return <span className="none">—</span>;
}

/** Money in a sentence (a finding, a note): its figures set as amounts. */
const MONEY = /([+−-]?(?:\$|[A-Z]{3} )\d[\d,]*\.\d{2})/;

export function Figures({ text }: { text: string }) {
  const parts = text.split(MONEY);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return <React.Fragment key={index}>{part}</React.Fragment>;
        const dot = part.lastIndexOf(".");
        return (
          <span className="amt" key={index}>
            {part.slice(0, dot)}
            <i>{part.slice(dot)}</i>
          </span>
        );
      })}
    </>
  );
}
