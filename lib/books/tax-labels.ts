import type { DueKind } from "@/lib/books/core/tax-calendar";

/**
 * Tax's words for client components: no database behind them (a client
 * component must never reach `@/lib/prisma`).
 */

export type DueTax = "vat" | "paye" | "wht" | "qpd" | "income";

export const DUE_TAX_OF: Record<DueKind, DueTax> = {
  VAT_RETURN: "vat",
  VAT_PAYMENT: "vat",
  PAYE_RETURN: "paye",
  PAYE_PAYMENT: "paye",
  WHT_RETURN: "wht",
  WHT_PAYMENT: "wht",
  QPD_RETURN: "qpd",
  QPD_PAYMENT: "qpd",
  ITF12C: "income",
};

export const DUE_TAX_LABEL: Record<DueTax | "all", string> = { all: "All", vat: "VAT", paye: "PAYE", wht: "Withholding", qpd: "Provisional tax", income: "Income tax" };

/** A due date as a calendar file (.ics) line set: "Add to my calendar". */
export function dueCalendar(rows: Array<{ date: string; what: string; period: string }>, name = "Tax dates"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (text: string) => text.replace(/[\\,;]/g, (match) => `\\${match}`);
  const events = rows.map((row, index) => {
    const day = row.date.replace(/-/g, "");
    const next = new Date(`${row.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return [
      "BEGIN:VEVENT",
      `UID:books-tax-${day}-${index}@corelith`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`,
      `SUMMARY:${escape(`${row.what}, ${row.period}`)}`,
      "END:VEVENT",
    ].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Corelith//Books//EN", `X-WR-CALNAME:${escape(name)}`, ...events, "END:VCALENDAR", ""].join("\r\n");
}
