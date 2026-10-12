import { formatCount } from "@/lib/workspace/format";

/**
 * Filling a message to customers (CUS-06): the text as the owner typed it,
 * with `{first name}` and `{points}` (offers) or a reminder source's own
 * placeholders (`{owed}`, `{overdue}`, `{lay-by}`, `{left}`, `{due}`), made
 * into one person's message. Browser-safe: the sheet checks as the server does.
 */

export const OFFER_PLACEHOLDERS = ["first name", "points"] as const;

const PLACEHOLDER = /\{([^{}]*)\}/g;

const keyOf = (raw: string) => raw.trim().replace(/\s+/g, " ").toLowerCase();

/** "A, B and C". */
export function joinAnd(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The placeholders, braced and joined: "{first name} and {points}". */
export function placeholderWords(allowed: readonly string[]): string {
  return joinAnd(allowed.map((key) => `{${key}}`));
}

/**
 * Their first name: the first word of the name. An initial ("T. Marange")
 * is not a name to greet anyone by, so the whole name stands instead.
 */
export function firstName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  if (/^\p{L}\.?$/u.test(first) && words.length > 1) return words.join(" ");
  return first;
}

/** The values an offer fills for one customer. */
export function offerValues(customer: { name: string; points: number }): Record<string, string> {
  return { "first name": firstName(customer.name), points: formatCount(customer.points) };
}

/** The template with each `{placeholder}` filled; one with no value is left as typed. */
export function renderMessage(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (whole, raw: string) => values[keyOf(raw)] ?? whole);
}

/**
 * Null when every `{…}` in the template is one that fills in; otherwise the
 * sentence that says which do: "Only {first name} and {points} fill in.", or
 * a reminder source's own ("{first name}, {owed} and {overdue} fill in for
 * each account.").
 */
export function placeholderProblem(template: string, allowed: readonly string[], words?: string): string | null {
  const known = new Set(allowed.map(keyOf));
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (!known.has(keyOf(match[1] ?? ""))) return words ?? `Only ${placeholderWords(allowed)} fill in.`;
  }
  return null;
}
