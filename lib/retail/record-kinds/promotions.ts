import { fetchJson } from "@/lib/api-client";
import { promotionEndAsk } from "@/lib/retail/asks/products";
import type { PromotionView } from "@/lib/retail/promotions/service";
import { dayWords, momentWords } from "@/lib/retail/promotions/state";
import { AUDIENCE_SEG, AUDIENCE_WORDS, DAYS_SEG, STACKS_WORDS, valueWarning } from "@/lib/retail/promotions/words";
import { dayKey, formatCount, formatMoney, formatShortDay } from "@/lib/workspace/format";

import type { Grant, RailGroup, RecordAction, RecordChart, RecordChip, RecordKind, RecordKpi, RecordStep } from "./types";

/**
 * The promotion record kind (PRD-09, 20-products 5.19, `PromotionRecord.png`):
 * where it is between Draft and Ended, what it sold and gave away against
 * the same days before it, units per week with the weeks before it muted, the
 * products it covers and the sales it discounted, and its rules edited in
 * place. Edit rules opens `promotion-edit` over it; Pause and Resume post at
 * once; End now asks first.
 */

export type PromotionRecord = PromotionView & { weeks: Array<{ start: string; units: number; onPromotion: boolean }> };

const VIEW: Grant = ["retail.promotions", "view"];
const UPDATE: Grant = ["retail.promotions", "update"];
const CREATE: Grant = ["retail.promotions", "create"];
const LABELS: Grant[] = [
  ["retail.catalog", "update"],
  ["retail.adjustments", "create"],
];

const promotionUrl = (id: string) => `/api/v2/retail/promotions/${id}`;
const capital = (word: string) => word[0]!.toUpperCase() + word.slice(1);
const unitOf = (promotion: PromotionRecord) => promotion.unitWord ?? "unit";

const RANGES = [
  { key: "3m", label: "3 months" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

function chart(promotion: PromotionRecord, range: string | null): RecordChart {
  const weeks = range === "3m" ? promotion.weeks.slice(-13) : range === "all" ? promotion.weeks : promotion.weeks.slice(-52);
  const unit = unitOf(promotion);
  const every = Math.max(1, Math.ceil(weeks.length / 8));
  return {
    title: `${capital(unit)}s sold per week`,
    unit: "on promotion",
    bars: weeks.map((week, index) => {
      const label = formatShortDay(`${week.start}T12:00:00Z`, "UTC");
      return {
        label: `Week of ${label}`,
        tick: (weeks.length - 1 - index) % every === 0 ? label : "",
        value: week.units,
        text: `${formatCount(week.units)} sold${week.onPromotion ? " on promotion" : ""}`,
        dark: week.onPromotion,
      };
    }),
    tick: (value) => (value === 0 ? "0" : `${formatCount(value)} ${unit}s`),
  };
}

function steps(promotion: PromotionRecord): RecordStep[] {
  const state = promotion.state;
  return [
    { label: "Draft", state: "done" },
    { label: "Scheduled", state: state === "SCHEDULED" ? "now" : "done" },
    { label: "Running", state: state === "RUNNING" || state === "PAUSED" ? "now" : state === "ENDED" ? "done" : "todo" },
    { label: "Ended", state: state === "ENDED" ? "now" : "todo" },
  ];
}

function kpis(promotion: PromotionRecord): RecordKpi[] {
  const f = promotion.figures;
  const scheduled = promotion.state === "SCHEDULED";
  const change = f.soldChange;
  const timing: RecordKpi = scheduled
    ? { label: "Starts in", value: `${formatCount(f.startsInDays)} ${f.startsInDays === 1 ? "day" : "days"}`, note: dayWords(new Date(promotion.startsAt)) }
    : promotion.state === "ENDED"
      ? {
          label: "Ran for",
          value: `${formatCount(f.runningDays)} ${f.runningDays === 1 ? "day" : "days"}`,
          note: `Ended ${dayWords(new Date(promotion.endedAt ?? promotion.endsAt ?? promotion.startsAt))}`,
        }
      : {
          label: "Running for",
          value: `${formatCount(f.runningDays)} ${f.runningDays === 1 ? "day" : "days"}`,
          note: promotion.endsAt ? `Ends ${dayWords(new Date(promotion.endsAt))}` : "No end date",
        };
  return [
    {
      label: "Sold under it",
      value: formatCount(f.soldUnder),
      ...(change === null ? {} : { lead: `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)}%`, leadTone: change >= 0 ? ("ok" as const) : ("bad" as const) }),
      note: change === null ? (scheduled ? "Not started yet" : f.soldUnder === 0 ? "Nothing sold under it yet" : "Nothing sold the days before") : "on the days before",
    },
    {
      label: "Extra takings",
      value: formatMoney(f.extraTakings),
      ...(f.perDollarGiven === null ? {} : { lead: formatMoney(f.perDollarGiven), leadTone: "plain" as const }),
      note: f.perDollarGiven === null ? "Nothing given away yet" : "for each US$1 given",
    },
    {
      label: "Given away",
      value: formatMoney(f.givenAway),
      ...(f.givenEach === null ? {} : { lead: formatMoney(f.givenEach), leadTone: "plain" as const }),
      note: f.givenEach === null ? "Nothing sold under it yet" : `a ${unitOf(promotion)}`,
    },
    // In its scope now; one that sold under it and has since left is counted under it, as its Products tab lists it.
    f.notSold === 0 && f.leftScope > 0
      ? { label: "Products", value: formatCount(f.products), lead: `+${formatCount(f.leftScope)}`, leadTone: "plain" as const, note: "more sold under it" }
      : {
          label: "Products",
          value: formatCount(f.products),
          lead: formatCount(f.notSold),
          leadTone: f.notSold > 0 ? ("warn" as const) : ("plain" as const),
          note: f.notSold === 1 ? "has not sold yet" : "have not sold yet",
        },
    timing,
  ];
}

function chips(promotion: PromotionRecord): RecordChip[] {
  return promotion.state === "PAUSED" ? [{ label: "Paused", tone: "warn" }] : [];
}

/** "2.00" or "10" as typed on the rail; a word is refused in words. */
function valueText(promotion: PromotionRecord) {
  return (text: string) => {
    const trimmed = text.trim().replace(/,/g, "").replace(/^US\$\s*/, "").replace(/%$/, "");
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed) || Number(trimmed) <= 0) {
      throw new Error(promotion.kind === "PERCENT" ? "Write the percent off, like 10." : "Write it as a figure, like 2.00.");
    }
    return trimmed;
  };
}

function rail(promotion: PromotionRecord): RailGroup[] {
  const ended = promotion.state === "ENDED";
  const scheduled = promotion.state === "SCHEDULED";
  const edit = <T,>(value: T, when = !ended) => (when ? value : undefined);
  const daysWord = DAYS_SEG.find(([, days]) => days.join() === [...promotion.daysOfWeek].sort().join())?.[0] ?? "Every day";
  const valueShown =
    promotion.kind === "AMOUNT" && promotion.unitWord ? `${promotion.valueLabel} a ${promotion.unitWord}` : promotion.valueLabel;
  return [
    {
      title: "Rules",
      rows: [
        { key: "type", label: "Type", value: promotion.kindLabel },
        {
          key: "value",
          label: "Value",
          value: valueShown,
          mono: true,
          warn: ended ? undefined : (valueWarning(promotion.kind, promotion.value, promotion.scopePrices) ?? undefined),
          edit: edit({
            field: "value",
            type: promotion.kind === "PERCENT" ? ("text" as const) : ("money" as const),
            mono: true,
            initial: promotion.kind === "PERCENT" ? String(promotion.value) : promotion.value.toFixed(2),
            parse: valueText(promotion),
            requires: UPDATE,
          }),
        },
        { key: "applies", label: "Applies to", value: promotion.appliesToLabel },
        {
          key: "basket",
          label: "Basket",
          value: promotion.minBasket === null ? "Any size" : `Over ${formatMoney(promotion.minBasket)}`,
          edit: edit({
            field: "minBasket",
            type: "money" as const,
            initial: promotion.minBasket === null ? "" : promotion.minBasket.toFixed(2),
            parse: (text: string) => text.trim().replace(/^US\$\s*/, "") || null,
            requires: UPDATE,
          }),
        },
        {
          key: "days",
          label: "Days",
          value: promotion.days,
          edit: edit({
            field: "days",
            type: "seg" as const,
            options: DAYS_SEG.map(([label]) => label),
            initial: daysWord,
            parse: (text: string) => DAYS_SEG.find(([label]) => label === text)?.[1] ?? [],
            requires: UPDATE,
          }),
        },
        {
          key: "stacks",
          label: "Stacks",
          value: promotion.stacks ? STACKS_WORDS.yes : STACKS_WORDS.no,
          edit: edit({
            field: "stacks",
            type: "seg" as const,
            options: [STACKS_WORDS.no, STACKS_WORDS.yes],
            initial: promotion.stacks ? STACKS_WORDS.yes : STACKS_WORDS.no,
            parse: (text: string) => text === STACKS_WORDS.yes,
            requires: UPDATE,
          }),
        },
      ],
    },
    {
      title: "When",
      rows: [
        {
          key: "starts",
          label: "Starts",
          value: momentWords(new Date(promotion.startsAt), true),
          mono: true,
          edit: edit(
            { field: "starts", type: "date" as const, initial: dayKey(new Date(promotion.startsAt)), earliest: "today" as const, requires: UPDATE },
            scheduled,
          ),
        },
        {
          key: "ends",
          label: "Ends",
          // Ended by End now: when it was ended, not the end date it never reached.
          value: promotion.endedAt
            ? `Ended ${momentWords(new Date(promotion.endedAt), true)}`
            : promotion.endsAt
              ? momentWords(new Date(promotion.endsAt), true)
              : "No end date",
          mono: Boolean(promotion.endedAt ?? promotion.endsAt),
          edit: edit({
            field: "ends",
            type: "date" as const,
            initial: promotion.endsAt ? dayKey(new Date(promotion.endsAt)) : "",
            earliest: "today" as const,
            clearable: true,
            requires: UPDATE,
          }),
        },
        {
          key: "sites",
          label: "Sites",
          value: promotion.site?.name ?? "All sites",
          edit: edit({
            field: "siteId",
            type: "auto" as const,
            initial: promotion.site?.id ?? "all",
            lookup: {
              noun: "site",
              picked: promotion.site ? { id: promotion.site.id, label: promotion.site.name } : { id: "all", label: "All sites" },
              context: { allSites: true },
            },
            parse: (value: string) => (value && value !== "all" ? value : null),
            requires: UPDATE,
          }),
        },
      ],
    },
    {
      title: "Who",
      rows: [
        {
          key: "customers",
          label: "Customers",
          value: AUDIENCE_WORDS[promotion.audience],
          edit: edit({
            field: "audience",
            type: "seg" as const,
            options: AUDIENCE_SEG.map(([label]) => label),
            initial: AUDIENCE_WORDS[promotion.audience],
            parse: (text: string) => AUDIENCE_SEG.find(([label]) => label === text)?.[1] ?? "EVERYONE",
            requires: UPDATE,
          }),
        },
        { key: "points", label: "Points", value: "Earned on the promotion price" },
        { key: "made-by", label: "Created by", value: promotion.createdBy ?? "Not on record", muted: !promotion.createdBy },
      ],
    },
  ];
}

/** Products' list narrowed to what it covers: its one category, else the promotion's own parent filter. */
const productsHref = (promotion: PromotionRecord) =>
  promotion.scope === "CATEGORIES" && promotion.categories.length === 1
    ? `/retail/products?category=${promotion.categories[0]!.id}`
    : `/retail/products?promotion=${promotion.id}`;

export const promotionKind: RecordKind<PromotionRecord> = {
  type: "RetailPromotion",
  back: { label: "Promotions", href: "/retail/products/promotions" },
  queryKey: (id) => ["retail-promotion", id],
  load: async (id) => {
    const [view, chartData] = await Promise.all([
      fetchJson<{ data: PromotionView }>(promotionUrl(id)),
      fetchJson<{ data: { weeks: PromotionRecord["weeks"] } }>(`${promotionUrl(id)}/chart?range=all`),
    ]);
    return { ...view.data, weeks: chartData.data.weeks };
  },
  endpoint: promotionUrl,
  title: (promotion) => promotion.name,
  reference: (promotion) => promotion.code,
  actions: (promotion): RecordAction[] =>
    promotion.state === "ENDED"
      ? [{ key: "duplicate", label: "Duplicate", requires: [CREATE], do: { sheet: "promotion-new", params: { from: promotion.id } } }]
      : [
          { key: "edit", label: "Edit rules", requires: [UPDATE], do: { sheet: "promotion-edit", id: promotion.id } },
          promotion.state === "PAUSED"
            ? {
                key: "resume",
                label: "Resume",
                requires: [UPDATE],
                do: { post: { url: "/api/v2/retail/promotions/resume", body: { ids: [promotion.id] }, done: `${promotion.name} runs again.` } },
              }
            : {
                key: "pause",
                label: "Pause",
                requires: [UPDATE],
                do: {
                  post: { url: "/api/v2/retail/promotions/pause", body: { ids: [promotion.id] }, done: `${promotion.name} is paused. The tills stop applying it.` },
                },
              },
          { key: "duplicate", label: "Duplicate", requires: [CREATE], do: { sheet: "promotion-new", params: { from: promotion.id } } },
        ],
  more: (promotion): RecordAction[] => [
    { key: "pdf", label: "Export as PDF", requires: [VIEW], do: { download: `/api/v2/retail/records/RetailPromotion/${promotion.id}/pdf` } },
    ...(promotion.products.length
      ? [{ key: "labels", label: "Print shelf labels", requires: LABELS, do: { sheet: "labels", params: { ids: promotion.products.map((product) => product.id).join(",") } } }]
      : []),
    ...(promotion.state === "ENDED"
      ? []
      : [
          {
            key: "end",
            label: "End now",
            tone: "bad" as const,
            requires: [UPDATE],
            do: {
              post: { url: "/api/v2/retail/promotions/end", body: { ids: [promotion.id] }, ask: promotionEndAsk(promotion.code), done: `${promotion.name} has ended.` },
            },
          },
        ]),
  ],
  bin: {
    kind: "promotion",
    deleteRight: ["retail.promotions", "delete"],
    state: (promotion) => promotion.bin,
    meanwhile: "Off every till; what it sold and gave away stays.",
  },
  steps,
  chips,
  figure: (promotion) => ({ label: "Given away", value: formatMoney(promotion.figures.givenAway) }),
  kpis,
  chartRanges: { options: RANGES, initial: "12m" },
  chart,
  tabs: [
    {
      key: "products",
      label: "Products",
      source: "retail-promotion-products",
      parent: "promotion",
      allLink: { label: "All products", href: productsHref },
      // The tab's own rows: what it covers, and what sold under it and has since left its scope.
      totalsText: (promotion) => ({
        product: `Σ ${formatCount(promotion.tabCounts.products)} ${promotion.tabCounts.products === 1 ? "product" : "products"}`,
      }),
    },
    {
      key: "sales",
      label: "Sales",
      source: "retail-promotion-sales",
      parent: "promotion",
      allLink: { label: "Every sale", href: () => "/retail/sales" },
    },
    { key: "activity", label: "Changes" },
  ],
  rail,
  invalidates: [["list", "retail-promotions"], ["reports"], ["list", "retail-bin"], ["nav-badges"]],
};
