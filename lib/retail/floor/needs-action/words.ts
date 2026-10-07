/**
 * The words Needs action counts in: "Three drawers short this week",
 * "Chipo Dube twice, Farai Moyo once".
 */

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "three" up to ten, then figures: "12". */
export function countWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < COUNT_WORDS.length ? COUNT_WORDS[n]! : n.toLocaleString("en-US");
}

/** "Three drawers", "One drawer": a title's opening count and its noun. */
export function countTitle(n: number, one: string, many: string): string {
  const word = countWord(n);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${n === 1 ? one : many}`;
}

/** "once", "twice", "three times", then "4 times". */
export function timesWord(n: number): string {
  if (n === 1) return "once";
  if (n === 2) return "twice";
  if (n === 3) return "three times";
  return `${n} times`;
}

/** "Chipo Dube twice, Farai Moyo once": the most often first, then by name. */
export function namesByCount(names: ReadonlyArray<string>): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name} ${timesWord(count)}`)
    .join(", ");
}

/** A sentence as a meta line: no closing full stop. */
export function asMeta(sentence: string): string {
  return sentence.trim().replace(/\.$/, "");
}
