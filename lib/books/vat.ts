import type { PrismaClient, VatReturnStatus } from "@prisma/client";

import { longDay, money, monthName, shortDay, storedDay } from "./format";

/**
 * Books → VAT returns (design/core-modules/boards/view/PageBooksVat.html):
 * each month's return with what went out and came in, the one still being
 * worked on opened below, and what it needs next: review, finalise, file.
 */

export type VatState = "draft" | "reviewed" | "finalised" | "filed" | "void";

const STATE: Record<VatReturnStatus, VatState> = {
  DRAFT: "draft",
  REVIEWED: "reviewed",
  FINALIZED: "finalised",
  FILED: "filed",
  VOIDED: "void",
};

export type VatRow = {
  id: string;
  /** "September 2026". */
  period: string;
  category: string;
  output: number;
  input: number;
  net: number;
  state: VatState;
};

export type VatDetail = {
  id: string;
  /** "September 2026, VAT-7". */
  title: string;
  /** "General · reviewed by James, 9 Oct". */
  meta: string;
  boxes: Array<{ label: string; rate: number; value: number; vat: number }>;
  net: number;
  /** "Net VAT due to ZIMRA, by 25 October". */
  netLabel: string;
  state: VatState;
  /** What comes next, in a sentence. */
  note: string;
};

export type VatView = {
  finding: { fact: string; rest: string | null };
  rows: VatRow[];
  selected: VatDetail | null;
};

const monthYear = (date: Date) => `${monthName(storedDay(date))} ${date.getUTCFullYear()}`;

/** The return the finding talks about: the oldest not yet filed. */
export function vatFinding(
  open: { month: string; state: VatState; net: number; due: string | null } | null,
  lastFiled: { month: string; filedOn: string | null } | null,
): { fact: string; rest: string | null } {
  if (!open) {
    if (!lastFiled) return { fact: "No VAT return yet.", rest: "Prepare one for the month that closed." };
    return { fact: "Every return is filed.", rest: lastFiled.filedOn ? `${lastFiled.month}'s was filed on ${lastFiled.filedOn}.` : null };
  }
  const where =
    open.state === "draft" ? "is a draft" : open.state === "reviewed" ? "is reviewed, not finalised" : "is finalised, not filed";
  const owed =
    open.net > 0
      ? `${money(open.net)} is due to ZIMRA${open.due ? ` by ${open.due}` : ""}.`
      : open.net < 0
        ? `ZIMRA owes you ${money(-open.net)}.`
        : "Nothing is due.";
  return { fact: `${open.month}'s return ${where}.`, rest: owed };
}

const NOTE: Record<VatState, string> = {
  draft: "Check the figures, then mark it reviewed. Refresh picks up anything posted since.",
  reviewed: "Finalising locks the figures. Mark it filed once ZIMRA has it.",
  finalised: "The figures are locked. Mark it filed once ZIMRA has it.",
  filed: "Filed with ZIMRA.",
  void: "This return was voided.",
};

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
/** A filing category as a word: "GENERAL" → "General", none → "General". */
const category = (value: string | null) => {
  const text = (value || "general").replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

type Db = Pick<PrismaClient, "vatReturn" | "user">;

export async function readVat(db: Db, companyId: string, selectedId?: string | null): Promise<VatView> {
  const returns = await db.vatReturn.findMany({
    where: { companyId },
    orderBy: { periodStart: "desc" },
    take: 36,
    select: {
      id: true,
      periodStart: true,
      status: true,
      filingCategory: true,
      outputTax: true,
      inputTax: true,
      netTax: true,
      paymentDueDate: true,
      returnDueDate: true,
      reviewedById: true,
      reviewedAt: true,
      finalizedById: true,
      finalizedAt: true,
      filedById: true,
      filedAt: true,
      preparedById: true,
      createdAt: true,
    },
  });
  const rows: VatRow[] = returns.map((row) => ({
    id: row.id,
    period: monthYear(row.periodStart),
    category: category(row.filingCategory),
    output: row.outputTax,
    input: row.inputTax,
    net: row.netTax,
    state: STATE[row.status],
  }));

  const open = [...returns].reverse().find((row) => row.status !== "FILED" && row.status !== "VOIDED") ?? null;
  const filed = returns.find((row) => row.status === "FILED") ?? null;
  const due = (row: (typeof returns)[number]) => {
    const date = row.paymentDueDate ?? row.returnDueDate;
    return date ? longDay(storedDay(date)) : null;
  };
  const finding = vatFinding(
    open ? { month: monthName(storedDay(open.periodStart)), state: STATE[open.status], net: open.netTax, due: due(open) } : null,
    filed ? { month: monthName(storedDay(filed.periodStart)), filedOn: filed.filedAt ? longDay(storedDay(filed.filedAt)) : null } : null,
  );

  const chosen = returns.find((row) => row.id === selectedId) ?? open ?? returns[0] ?? null;
  let selected: VatDetail | null = null;
  if (chosen) {
    const [lines, people] = await Promise.all([
      db.vatReturn.findUnique({
        where: { id: chosen.id },
        select: { lines: { select: { name: true, rate: true, taxableAmount: true, outputTax: true, inputTax: true }, orderBy: { code: "asc" } } },
      }),
      db.user.findMany({
        where: { id: { in: [chosen.reviewedById, chosen.finalizedById, chosen.filedById, chosen.preparedById].filter((id): id is string => Boolean(id)) } },
        select: { id: true, name: true },
      }),
    ]);
    const first = (id: string | null) => (people.find((person) => person.id === id)?.name ?? "").split(" ")[0];
    const step =
      chosen.status === "FILED" && chosen.filedAt
        ? `filed by ${first(chosen.filedById)}, ${shortDay(storedDay(chosen.filedAt))}`
        : chosen.status === "FINALIZED" && chosen.finalizedAt
          ? `finalised by ${first(chosen.finalizedById)}, ${shortDay(storedDay(chosen.finalizedAt))}`
          : chosen.status === "REVIEWED" && chosen.reviewedAt
            ? `reviewed by ${first(chosen.reviewedById)}, ${shortDay(storedDay(chosen.reviewedAt))}`
            : `prepared ${shortDay(storedDay(chosen.createdAt))}`;
    const dueOn = due(chosen);
    selected = {
      id: chosen.id,
      title: `${monthYear(chosen.periodStart)}, VAT-7`,
      meta: `${category(chosen.filingCategory)} · ${step.replace(/ by ,/, ",")}`,
      boxes: (lines?.lines ?? []).map((line) => ({
        label: line.outputTax > 0 ? `Output VAT on ${lower(line.name)}` : line.inputTax > 0 ? `Input VAT on ${lower(line.name)}` : line.name,
        rate: line.rate,
        value: line.taxableAmount,
        vat: line.outputTax > 0 ? line.outputTax : line.inputTax,
      })),
      net: chosen.netTax,
      netLabel: chosen.netTax >= 0 ? `Net VAT due to ZIMRA${dueOn ? `, by ${dueOn}` : ""}` : "Net VAT ZIMRA owes you",
      state: STATE[chosen.status],
      note: NOTE[STATE[chosen.status]],
    };
  }
  return { finding, rows, selected };
}
