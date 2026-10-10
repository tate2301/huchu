import type { InsightPeriod } from "@/lib/retail/insights";

/**
 * The headline at the top of every Insights page: two sentences worked out
 * from the page's own figures. The first states the fact ("US$11,732 taken
 * in the last 30 days across two shops."); the second says what to notice
 * ("Fri 17:00 is the busiest hour; takings are 17% down on the 30 days
 * before."). With too little trade both still read as sentences about the
 * data ("No sales yet today.", "Too few sales in these dates to compare.").
 */
export type Headline = { fact: string; notice: string };

/** Fewer sales than this in the period and a comparison says more about chance than the shop. */
export const FEW_SALES = 10;

/** The window's words a headline needs. */
export type HeadlineWords = {
  period: InsightPeriod | "range";
  /** Today or a one-day range: no weekday before the busiest hour, no "in" before the day before. */
  singleDay: boolean;
  /** "in the last 30 days", "today", "this month". */
  over: string;
  /** "the 30 days before", "the day before", "the month before". */
  beforeWords: string;
};

// ── Words ───────────────────────────────────────────────────────────────────

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "two" up to nine, then figures: "12". */
export function numberWord(value: number) {
  return Number.isInteger(value) && value >= 0 && value < NUMBER_WORDS.length ? NUMBER_WORDS[value] : value.toLocaleString("en-US");
}

/** "US$11,732" from a hundred dollars up; "US$42.50" below it. */
export function headlineMoney(value: number) {
  const amount = Math.abs(value);
  const digits = amount >= 100 ? 0 : 2;
  return `US$${amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function percent(value: number) {
  return `${Math.round(Math.abs(value) * 100)}%`;
}

function percentTenths(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

/** "1 product is", "12 products are". */
function counted(value: number, one: string, many: string) {
  return `${value.toLocaleString("en-US")} ${value === 1 ? one : many}`;
}

function days(value: number) {
  const whole = Math.round(value);
  return `${whole} ${whole === 1 ? "day" : "days"}`;
}

function capital(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The top two things to notice as one sentence: "a; b." */
export function noticeSentence(clauses: ReadonlyArray<string | null | false | undefined>, otherwise: string) {
  const chosen = clauses.filter((clause): clause is string => Boolean(clause)).slice(0, 2);
  return chosen.length > 0 ? `${capital(chosen.join("; "))}.` : otherwise;
}

/** "takings are 17% down on the 30 days before"; null when there is nothing fair to compare with. */
export function changeClause(subject: string, relative: number | null, words: HeadlineWords) {
  if (relative === null) return null;
  if (Math.round(Math.abs(relative) * 100) === 0) return `${subject} level with ${words.beforeWords}`;
  return `${subject} ${percent(relative)} ${relative > 0 ? "up" : "down"} on ${words.beforeWords}`;
}

/** "yet today", "yet this month", "in the last 7 days": after "No sales". */
function noneOver(words: HeadlineWords) {
  return words.period === "today" || words.period === "month" ? `yet ${words.over}` : words.over;
}

/** "in the 30 days before", but "the day before". */
function inBefore(words: HeadlineWords) {
  return words.singleDay ? words.beforeWords : `in ${words.beforeWords}`;
}

/** The second sentence when too little sold to say more. */
export function tooFew(words: HeadlineWords, what = "compare") {
  return `Too few sales in these dates to ${what}.${words.period === "30d" ? "" : " Widen the period."}`;
}

/** The second sentence when nothing sold: what the period before did. */
function beforeTook(words: HeadlineWords, before: number) {
  return before !== 0 ? `${capital(words.beforeWords)} took ${headlineMoney(before)}.` : `Nothing sold ${inBefore(words)} either.`;
}

// ── Sales ───────────────────────────────────────────────────────────────────

export function salesHeadline(input: {
  words: HeadlineWords;
  takings: number;
  baskets: number;
  takingsBefore: number;
  /** The relative change in takings, or null when there is nothing fair to compare with. */
  change: number | null;
  /** The one site the page reads, by name; null for all of them. */
  site: string | null;
  /** The sites that traded, by name, when the business has more than one and the page reads all of them. */
  tradedAt: ReadonlyArray<string>;
  busiest: { day: string; hour: string } | null;
  growing: { name: string; change: number } | null;
}): Headline {
  const { words } = input;
  const where = input.site ? ` at ${input.site}` : input.tradedAt.length > 1 ? ` across ${numberWord(input.tradedAt.length)} shops` : "";
  // One shop of several took it all: say which.
  const allAt = !input.site && input.tradedAt.length === 1 ? `, all at ${input.tradedAt[0]}` : "";
  if (input.baskets <= 0 && input.takings === 0) {
    return { fact: `No sales${input.site ? ` at ${input.site}` : ""} ${noneOver(words)}.`, notice: beforeTook(words, input.takingsBefore) };
  }
  if (input.baskets < FEW_SALES) {
    return {
      fact: `${headlineMoney(input.takings)} taken ${words.over}${where} from ${counted(input.baskets, "sale", "sales")}${allAt}.`,
      notice: tooFew(words),
    };
  }
  const busiest = input.busiest
    ? `${words.singleDay ? "" : `${input.busiest.day} `}${input.busiest.hour}:00 is the busiest hour`
    : null;
  return {
    fact: `${headlineMoney(input.takings)} taken ${words.over}${where}${allAt}.`,
    notice: noticeSentence(
      [
        busiest,
        changeClause("takings are", input.change, words),
        input.growing && input.growing.change > 0 && `${input.growing.name} grew ${percent(input.growing.change)} on ${words.beforeWords}`,
      ],
      `Nothing sold ${inBefore(words)} to compare with.`,
    ),
  };
}

// ── Profit ──────────────────────────────────────────────────────────────────

export function profitHeadline(input: {
  words: HeadlineWords;
  profit: number;
  margin: number;
  revenue: number;
  baskets: number;
  profitBefore: number;
  change: number | null;
  /** The category furthest below the margin it aims for. */
  below: { label: string; margin: number; target: number } | null;
  worst: { name: string; margin: number } | null;
  best: { label: string; margin: number } | null;
}): Headline {
  const { words } = input;
  if (input.baskets <= 0 && input.revenue === 0) {
    return {
      fact: `No sales ${noneOver(words)}.`,
      notice:
        input.profitBefore !== 0
          ? `${capital(words.beforeWords)} made ${headlineMoney(input.profitBefore)} gross profit.`
          : `Nothing sold ${inBefore(words)} either.`,
    };
  }
  const fact =
    input.profit >= 0
      ? `${headlineMoney(input.profit)} gross profit ${words.over}, ${percentTenths(input.margin)} of sales.`
      : `Sales lost ${headlineMoney(input.profit)} ${words.over}: they cost more than they sold for.`;
  if (input.baskets < FEW_SALES) return { fact, notice: tooFew(words) };
  return {
    fact,
    notice: noticeSentence(
      [
        input.below && `${input.below.label} earns ${percentTenths(input.below.margin)}, below the ${percent(input.below.target)} you aim for`,
        changeClause("profit is", input.change, words),
        input.worst && `${input.worst.name} earns the least, ${percentTenths(input.worst.margin)}`,
        input.best && `${input.best.label} earns the best margin, ${percentTenths(input.best.margin)}`,
      ],
      `Nothing sold ${inBefore(words)} to compare with.`,
    ),
  };
}

// ── Products ────────────────────────────────────────────────────────────────

export function productsHeadline(input: {
  words: HeadlineWords;
  /** Products with stock records. */
  products: number;
  /** Of them, how many sold in the period. */
  selling: number;
  idle: { count: number; value: number };
  /** The top 20's share of profit, when more than 20 products made any. */
  top20: number | null;
  out: number;
}): Headline {
  const { words } = input;
  if (input.products === 0) {
    return { fact: "No products on the shelf yet.", notice: "Nothing has been received into stock." };
  }
  return {
    fact:
      input.selling === 0
        ? `None of the ${counted(input.products, "product", "products")} sold ${words.over}.`
        : `${input.selling.toLocaleString("en-US")} of ${counted(input.products, "product", "products")} sold ${words.over}.`,
    notice: noticeSentence(
      [
        input.idle.count > 0 &&
          `${headlineMoney(input.idle.value)} is sitting in ${counted(input.idle.count, "product", "products")} not sold in 60 days`,
        input.top20 !== null && `the top 20 make ${percent(input.top20)} of the profit`,
        input.out > 0 && `${counted(input.out, "product is", "products are")} out of stock`,
        input.selling > 0 &&
          input.selling < input.products &&
          `${counted(input.products - input.selling, "product", "products")} sold nothing ${words.over}`,
      ],
      "Everything on the shelf has sold in the last 60 days.",
    ),
  };
}

// ── Stock ───────────────────────────────────────────────────────────────────

export function stockHeadline(input: {
  words: HeadlineWords;
  value: number;
  /** Days of cover at the period's rate; null when nothing sold. */
  cover: number | null;
  baskets: number;
  aim: number;
  short: { label: string; cover: number } | null;
  heavy: { label: string; cover: number; value: number } | null;
  low: number;
  /** Sales missed with shelves empty; `product` when one product missed them all. */
  missed: { value: number; product: string | null } | null;
}): Headline {
  const { words } = input;
  if (input.value <= 0) {
    return { fact: "No stock on hand.", notice: "Nothing on the shelf to measure cover against." };
  }
  const value = `${headlineMoney(input.value)} of stock at cost`;
  if (input.cover === null || input.baskets < FEW_SALES) {
    return {
      fact: input.cover === null ? `${value}; nothing sold ${words.over}.` : `${value}.`,
      notice: tooFew(words, "measure cover"),
    };
  }
  return {
    fact: `${value}, about ${days(input.cover)} of cover.`,
    notice: noticeSentence(
      [
        input.short && `${input.short.label} has ${days(input.short.cover)} of cover against the ${input.aim} you aim for`,
        input.missed &&
          `about ${headlineMoney(input.missed.value)} of sales were missed with ${input.missed.product ?? "shelves"} empty`,
        input.low > 0 && `${counted(input.low, "product is", "products are")} at or below the reorder level`,
        input.heavy &&
          `${input.heavy.label} has ${days(input.heavy.cover)} of cover, ${headlineMoney(input.heavy.value)} tied up`,
      ],
      "Every category has about the cover you aim for.",
    ),
  };
}

// ── Losses ──────────────────────────────────────────────────────────────────

export function lossesHeadline(input: {
  words: HeadlineWords;
  total: number;
  takings: number;
  /** Baskets sold in the period: under `FEW_SALES` the change on before is left out. */
  baskets: number;
  change: number | null;
  biggest: { label: string; value: number } | null;
  shortest: { name: string; times: number; value: number } | null;
}): Headline {
  const { words } = input;
  if (input.total <= 0) {
    return { fact: `Nothing lost ${words.over}.`, notice: "No count differences, short drawers, refunds or voids." };
  }
  const biggest =
    input.biggest && input.biggest.value > 0
      ? `${input.biggest.value >= input.total - 0.005 ? "all" : "most"} of it is ${input.biggest.label}, ${headlineMoney(input.biggest.value)}`
      : null;
  return {
    fact: `${headlineMoney(input.total)} lost ${words.over}${input.takings > 0 ? `, ${percentTenths(input.total / input.takings)} of takings` : ""}.`,
    notice: noticeSentence(
      [
        biggest,
        input.baskets >= FEW_SALES &&
          input.change !== null &&
          Math.abs(input.change) >= 0.1 &&
          changeClause("losses are", input.change, words),
        input.shortest &&
          `${input.shortest.name} was short ${counted(input.shortest.times, "time", "times")}, ${headlineMoney(input.shortest.value)} in all`,
      ],
      `Nothing stands out against ${words.beforeWords}.`,
    ),
  };
}

// ── Customers ───────────────────────────────────────────────────────────────

export function customersHeadline(input: {
  words: HeadlineWords;
  takings: number;
  baskets: number;
  takingsBefore: number;
  memberShare: number;
  /** A member's basket over a walk-in's, when both bought. */
  ratio: number | null;
  lapsed: number;
  cameBack: number;
}): Headline {
  const { words } = input;
  if (input.baskets <= 0 && input.takings === 0) {
    return { fact: `No sales ${noneOver(words)}.`, notice: beforeTook(words, input.takingsBefore) };
  }
  const fact =
    input.memberShare <= 0
      ? `Every sale ${words.over} was a walk-in.`
      : `Members brought in ${percent(input.memberShare)} of takings ${words.over}.`;
  if (input.baskets < FEW_SALES) return { fact, notice: tooFew(words) };
  return {
    fact,
    notice: noticeSentence(
      [
        input.ratio !== null &&
          (Math.abs(input.ratio - 1) < 0.1
            ? "members spend about what a walk-in does a visit"
            : `members spend ${input.ratio.toFixed(1)} times what a walk-in does a visit`),
        input.lapsed > 0 && `${counted(input.lapsed, "member has", "members have")} not been in for 30 days`,
        input.cameBack > 0 && `${counted(input.cameBack, "member", "members")} came back`,
      ],
      "Every member has been in within 30 days.",
    ),
  };
}

// ── Money ───────────────────────────────────────────────────────────────────

export function moneyHeadline(input: {
  words: HeadlineWords;
  in: number;
  out: number;
  waiting: number;
  /** The week that spent most over what it took. */
  heaviestWeek: string | null;
  onOrder: number;
}): Headline {
  const { words } = input;
  const fact =
    input.in === 0 && input.out === 0
      ? `No money came in or went out ${words.over}.`
      : input.in >= input.out
        ? `${headlineMoney(input.in - input.out)} more came in than went out ${words.over}.`
        : `Spending ran ${headlineMoney(input.out - input.in)} ahead of takings ${words.over}.`;
  return {
    fact,
    notice: noticeSentence(
      [
        input.waiting > 0 && `${counted(input.waiting, "requisition is", "requisitions are")} waiting for a decision`,
        input.heaviestWeek && `the week of ${input.heaviestWeek} spent more than it took`,
        input.onOrder > 0 && `${headlineMoney(input.onOrder)} is on order from suppliers`,
      ],
      "Nothing is waiting to be paid or delivered.",
    ),
  };
}
