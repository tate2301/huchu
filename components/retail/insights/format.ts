import type { Format } from "@/lib/retail/insights";

/** A figure from the Insights API, written the way the page shows it. */
export function formatFigure(value: number, format: Format): string {
  switch (format) {
    case "money":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 }).format(value);
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "days":
      return `${Math.round(value)} ${Math.round(value) === 1 ? "day" : "days"}`;
    case "ratio":
      return value.toFixed(1);
    case "count":
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
  }
}

/** A change against the period before: signed, and in points for a share. */
export function formatChange(value: number, format: Format): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const magnitude = Math.abs(value);
  return format === "percent" ? `${sign}${(magnitude * 100).toFixed(1)}%` : `${sign}${formatFigure(magnitude, format)}`;
}
