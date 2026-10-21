/**
 * The records a list showed, in the order it showed them, so a record opened
 * from that list can step to its neighbours (Previous, Next, J and K). A list
 * writes its sequence as the person looks at it; a record opened any other
 * way finds none, and has no stepper.
 */
export type Sequence = {
  /** The list's own address, with its query: where the sequence came from. */
  from: string;
  /** The addresses of the rows loaded, in order. */
  hrefs: string[];
  /** How many records the list has in all, when it knows. */
  total?: number;
};

export type Step = {
  prevHref: string | null;
  nextHref: string | null;
  position: number;
  total: number;
};

export const SEQUENCE_KEY = "seq:last";

const pathOf = (href: string) => href.split("?")[0]?.split("#")[0] ?? href;

export function parseSequence(raw: string | null): Sequence | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Sequence>;
    if (typeof value.from !== "string" || !Array.isArray(value.hrefs)) return null;
    const hrefs = value.hrefs.filter((href): href is string => typeof href === "string");
    return { from: value.from, hrefs, total: typeof value.total === "number" ? value.total : undefined };
  } catch {
    return null;
  }
}

/** Where `href` stands in the sequence, or null when it is not one of its records. */
export function stepAt(sequence: Sequence | null, href: string): Step | null {
  if (!sequence) return null;
  const here = pathOf(href);
  const index = sequence.hrefs.findIndex((entry) => pathOf(entry) === here);
  if (index < 0) return null;
  const total = Math.max(sequence.total ?? 0, sequence.hrefs.length);
  return {
    prevHref: sequence.hrefs[index - 1] ?? null,
    nextHref: sequence.hrefs[index + 1] ?? null,
    position: index + 1,
    total,
  };
}

/** The most rows a sequence keeps: a list that loads thousands should not fill storage. */
export const SEQUENCE_LIMIT = 500;

export function writeSequence(storage: Pick<Storage, "setItem">, sequence: Sequence): void {
  try {
    storage.setItem(SEQUENCE_KEY, JSON.stringify({ ...sequence, hrefs: sequence.hrefs.slice(0, SEQUENCE_LIMIT) }));
  } catch {
    // Storage can be full or blocked: the record simply has no stepper.
  }
}
