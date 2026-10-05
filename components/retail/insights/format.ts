import type { Format } from "@/lib/retail/insights";

const MINUS = "−";

const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** "US$34,918.40", "−US$43.79": full cents, a true minus. */
export function formatMoney(value: number): string {
  const text = `US$${CENTS.format(Math.abs(value))}`;
  return value < 0 ? `${MINUS}${text}` : text;
}

/** A chart's value in its tooltip: whole dollars ("US$412"). */
export function formatWholeMoney(value: number): string {
  const text = `US$${WHOLE.format(Math.abs(value))}`;
  return value < 0 ? `${MINUS}${text}` : text;
}

/** A figure from the Insights API, written the way the page shows it. */
export function formatFigure(value: number, format: Format): string {
  switch (format) {
    case "money":
      return formatMoney(value);
    case "percent":
      return `${value < 0 ? MINUS : ""}${(Math.abs(value) * 100).toFixed(1)}%`;
    case "days":
      return `${Math.round(value)} ${Math.round(value) === 1 ? "day" : "days"}`;
    case "ratio":
      return `${value < 0 ? MINUS : ""}${Math.abs(value).toFixed(1)}`;
    case "count":
      return `${value < 0 ? MINUS : ""}${COUNT.format(Math.abs(value))}`;
  }
}

/** A change against the period before: always signed ("+6.1%", "+US$0.18", "−0.1"). */
export function formatChange(value: number, format: Format): string {
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
  return `${sign}${formatFigure(Math.abs(value), format)}`;
}
