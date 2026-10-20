import { longDay, money } from "./format";

/**
 * A customer's statement as a WhatsApp message (BkCustomer's Send by WhatsApp). The
 * page opens WhatsApp with it written; the person reads it and presses send there.
 * No database here: the customer page imports it.
 */

export type StatementForMessage = {
  name: string;
  currency: string;
  statement: { from: string; to: string; closing: number; lines: Array<{ date: string; document: string; invoiced: number | null; paid: number | null }> };
};

/** "Statement for Pomona Offices, 1 August to 18 October 2026. …" One line per document, then what is owed. */
export function statementMessage(page: StatementForMessage): string {
  const { statement, currency } = page;
  const lines = statement.lines.map((line) => {
    const amount = line.invoiced !== null ? money(line.invoiced, currency) : line.paid !== null ? `${money(line.paid, currency)} paid` : "";
    return `${line.date}: ${line.document}${amount ? `, ${amount}` : ""}`;
  });
  const owed = statement.closing > 0.005 ? `You owe ${money(statement.closing, currency)}.` : statement.closing < -0.005 ? `${money(-statement.closing, currency)} is on your account.` : "Nothing is owed.";
  return [`Statement for ${page.name}, ${longDay(statement.from)} to ${longDay(statement.to)} ${statement.to.slice(0, 4)}.`, ...lines, owed].join("\n");
}

/** Zimbabwe's numbers as WhatsApp reads them: "077 412 0981" → "263774120981". Null when there is no number. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `263${digits.slice(1)}`;
  return digits;
}

/** The click-to-chat address that opens WhatsApp on that number with the message written. */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
