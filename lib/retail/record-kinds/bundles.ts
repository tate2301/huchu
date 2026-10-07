import { fetchJson } from "@/lib/api-client";
import { bundleStopAsk } from "@/lib/retail/asks/products";
import type { BundleView } from "@/lib/retail/bundles/service";
import { shortName } from "@/lib/retail/bundles/words";
import { formatCount, formatDay, formatMoney, formatShortDay, formatSignedCount } from "@/lib/workspace/format";

import type { Grant, RecordAction, RecordChart, RecordChip, RecordKind, RecordKpi } from "./types";

/**
 * The bundle record kind (PRD-08, 20-products 5.16, `BundleRecord.png`): its
 * five figures, bundles sold per week, what is in it, its sales and its
 * changes, and the rail edited in place. Change the bundle opens
 * `bundle-edit` over it; Pause and Put on sale post at once; Stop selling it
 * asks first.
 */

export type BundleRecord = BundleView & { weeks: Array<{ start: string; sold: number }> };

const VIEW: Grant = ["retail.promotions", "view"];
const UPDATE: Grant = ["retail.promotions", "update"];
const CREATE: Grant = ["retail.promotions", "create"];
const LABELS: Grant[] = [
  ["retail.catalog", "update"],
  ["retail.adjustments", "create"],
];

const bundleUrl = (id: string) => `/api/v2/retail/bundles/${id}`;

/** "11.00" → "11.00"; a blank or a word is refused in words. */
function priceText(text: string): string {
  const trimmed = text.trim().replace(/,/g, "").replace(/^US\$\s*/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed) || Number(trimmed) <= 0) throw new Error("Write the price as a figure, like 9.50.");
  return trimmed;
}

const RANGES = [
  { key: "3m", label: "3 months" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

function chart(bundle: BundleRecord, range: string | null): RecordChart {
  const weeks = range === "3m" ? bundle.weeks.slice(-13) : range === "all" ? bundle.weeks : bundle.weeks.slice(-52);
  return {
    title: bundle.kind === "FIXED_SET" ? "Bundles sold per week" : "Deals sold per week",
    unit: bundle.site?.name ?? "all sites",
    bars: weeks.map((week, index) => {
      const label = formatShortDay(`${week.start}T12:00:00Z`, "UTC");
      // About eight labels across, the last always.
      const every = Math.max(1, Math.ceil(weeks.length / 8));
      return {
        label: `Week of ${label}`,
        tick: (weeks.length - 1 - index) % every === 0 ? label : "",
        value: week.sold,
        text: `${formatCount(week.sold)} sold`,
      };
    }),
    tick: (value) => (value === 0 ? "0" : `${formatCount(value)} ${bundle.kind === "FIXED_SET" ? "bundles" : "deals"}`),
  };
}

function kpis(bundle: BundleRecord): RecordKpi[] {
  const delta = bundle.sold30 - bundle.soldPrev30;
  return [
    {
      label: "Sold, 30 days",
      value: formatCount(bundle.sold30),
      lead: formatSignedCount(delta),
      leadTone: delta > 0 ? "ok" : delta < 0 ? "bad" : "plain",
      note: "on the month before",
    },
    { label: "Takings", value: formatMoney(bundle.takings30), lead: formatMoney(bundle.price), leadTone: "plain", note: "each" },
    ...(bundle.margin === null
      ? []
      : [
          {
            label: "Margin",
            value: `${bundle.margin.toFixed(1)}%`,
            ...(bundle.marginPerBundle === null ? {} : { lead: formatMoney(bundle.marginPerBundle), leadTone: "plain" as const }),
            note: bundle.marginPerBundle === null ? "Not sold in 30 days" : bundle.kind === "FIXED_SET" ? "a bundle" : "a deal",
          },
        ]),
    bundle.canMake === null
      ? { label: "Can make", value: "—", note: `any ${bundle.buyQuantity ?? 2} from the set` }
      : {
          label: "Can make",
          value: formatCount(bundle.canMake),
          ...(bundle.limitingItem ? { lead: shortName(bundle.limitingItem), leadTone: bundle.canMakeLow ? ("warn" as const) : ("plain" as const) } : {}),
          note: "runs out first",
        },
    { label: "Saves", value: formatMoney(bundle.saves), lead: `${bundle.savesPercent.toFixed(1)}%`, leadTone: "plain", note: "on buying them alone" },
  ];
}

function chips(bundle: BundleRecord): RecordChip[] {
  return [
    { label: bundle.kindLabel, tone: "plain" },
    ...(bundle.canMake !== null && bundle.state === "ON_SALE"
      ? [{ label: `Can make ${formatCount(bundle.canMake)}`, tone: bundle.canMakeLow ? ("warn" as const) : ("plain" as const) }]
      : []),
    ...(bundle.state === "PAUSED" ? [{ label: "Paused", tone: "warn" as const }] : []),
    ...(bundle.state === "STOPPED" ? [{ label: "Stopped", tone: "plain" as const }] : []),
  ];
}

export const bundleKind: RecordKind<BundleRecord> = {
  type: "RetailBundle",
  back: { label: "Bundles and packs", href: "/retail/products/bundles" },
  queryKey: (id) => ["retail-bundle", id],
  load: async (id) => {
    const [view, weeks] = await Promise.all([
      fetchJson<{ data: BundleView }>(bundleUrl(id)),
      fetchJson<{ data: { weeks: BundleRecord["weeks"] } }>(`${bundleUrl(id)}/chart?range=all`),
    ]);
    return { ...view.data, weeks: weeks.data.weeks };
  },
  endpoint: bundleUrl,
  title: (bundle) => bundle.name,
  reference: (bundle) => bundle.code,
  actions: (bundle) =>
    bundle.state === "STOPPED"
      ? [{ key: "labels", label: "Print shelf labels", requires: LABELS, do: { sheet: "labels", params: { bundleIds: bundle.id } } }]
      : [
          { key: "edit", label: "Change the bundle", requires: [UPDATE], do: { sheet: "bundle-edit", id: bundle.id } },
          bundle.state === "PAUSED"
            ? {
                key: "resume",
                label: "Put on sale",
                requires: [UPDATE],
                do: { post: { url: "/api/v2/retail/bundles/resume", body: { ids: [bundle.id] }, done: `${bundle.name} is on sale again.` } },
              }
            : {
                key: "pause",
                label: "Pause",
                requires: [UPDATE],
                do: { post: { url: "/api/v2/retail/bundles/pause", body: { ids: [bundle.id] }, done: `${bundle.name} is paused. The tills stop offering it.` } },
              },
          { key: "labels", label: "Print shelf labels", requires: LABELS, do: { sheet: "labels", params: { bundleIds: bundle.id } } },
        ],
  more: (bundle): RecordAction[] => [
    { key: "pdf", label: "Export as PDF", requires: [VIEW], do: { download: `/api/v2/retail/records/RetailBundle/${bundle.id}/pdf` } },
    { key: "duplicate", label: "Duplicate", requires: [CREATE], do: { sheet: "bundle-new", params: { from: bundle.id, kind: bundle.kind } } },
    ...(bundle.state === "STOPPED"
      ? []
      : [
          {
            key: "stop",
            label: "Stop selling it",
            tone: "bad" as const,
            requires: [UPDATE],
            do: { post: { url: `${bundleUrl(bundle.id)}/stop`, ask: bundleStopAsk(bundle.name), done: `${bundle.name} is off every till.` } },
          },
        ]),
  ],
  bin: {
    kind: "bundle",
    deleteRight: ["retail.promotions", "delete"],
    state: (bundle) => bundle.bin,
    meanwhile: "Off every till; its sales history stays.",
  },
  chips,
  figure: (bundle) => ({ label: "Saves the customer", value: formatMoney(bundle.saves) }),
  kpis,
  chartRanges: { options: RANGES, initial: "12m" },
  chart,
  tabs: [
    {
      key: "items",
      label: "What is in it",
      source: "retail-bundle-items",
      parent: "bundle",
      allLink: { label: "Every sale of it", href: (bundle) => `/retail/sales?bundle=${bundle.id}` },
      totalsText: (bundle) => ({
        product: `Σ ${formatCount(bundle.items.length)} ${bundle.items.length === 1 ? "product" : "products"}`,
        onHand: "",
        ...(bundle.canMake === null ? { makes: "—" } : { makes: formatCount(bundle.canMake) }),
      }),
    },
    {
      key: "sales",
      label: "Sales",
      source: "retail-bundle-sales",
      parent: "bundle",
      allLink: { label: "Every sale of it", href: (bundle) => `/retail/sales?bundle=${bundle.id}` },
    },
    { key: "activity", label: "Changes" },
  ],
  rail: (bundle) => {
    const editable = bundle.state !== "STOPPED";
    const edit = <T,>(value: T) => (editable ? value : undefined);
    return [
      {
        title: "Bundle",
        rows: [
          {
            key: "name",
            label: "Name",
            value: bundle.name,
            edit: edit({
              field: "name",
              type: "text" as const,
              initial: bundle.name,
              parse: (text: string) => {
                if (!text.trim()) throw new Error("Name is needed.");
                return text.trim();
              },
              requires: UPDATE,
            }),
          },
          ...(bundle.kind === "FIXED_SET"
            ? [
                {
                  key: "barcode",
                  label: "Barcode",
                  value: bundle.barcode ?? "None",
                  mono: Boolean(bundle.barcode),
                  muted: !bundle.barcode,
                  edit: edit({
                    field: "barcode",
                    type: "text" as const,
                    mono: true,
                    initial: bundle.barcode ?? "",
                    parse: (text: string) => text.trim() || null,
                    requires: UPDATE,
                  }),
                },
              ]
            : []),
          {
            key: "category",
            label: "Category",
            value: bundle.category?.name ?? "None",
            muted: !bundle.category,
            edit: edit({
              field: "categoryId",
              type: "auto" as const,
              initial: bundle.category?.id ?? "",
              lookup: { noun: "category", picked: bundle.category ? { id: bundle.category.id, label: bundle.category.name } : null },
              parse: (value: string) => value || null,
              requires: UPDATE,
            }),
          },
          {
            key: "price",
            label: bundle.kind === "FIXED_SET" ? "Price" : `${bundle.buyQuantity ?? 2} for`,
            value: formatMoney(bundle.price),
            mono: true,
            edit: edit({ field: "price", type: "money" as const, initial: bundle.price.toFixed(2), parse: priceText, requires: UPDATE }),
          },
        ],
      },
      {
        title: "Selling",
        rows: [
          {
            key: "sites",
            label: "Sites",
            value: bundle.site?.name ?? "All sites",
            edit: edit({
              field: "siteId",
              type: "auto" as const,
              initial: bundle.site?.id ?? "all",
              lookup: {
                noun: "site",
                picked: bundle.site ? { id: bundle.site.id, label: bundle.site.name } : { id: "all", label: "All sites" },
                context: { allSites: true },
              },
              parse: (value: string) => (value && value !== "all" ? value : null),
              requires: UPDATE,
            }),
          },
          {
            key: "till",
            label: "Till button",
            value: bundle.tillButton ? `Yes${bundle.category ? `, under ${bundle.category.name}` : ""}` : "No",
            edit: edit({
              field: "tillButton",
              type: "seg" as const,
              options: ["Yes", "No"],
              initial: bundle.tillButton ? "Yes" : "No",
              parse: (text: string) => text === "Yes",
              requires: UPDATE,
            }),
          },
          { key: "points", label: "Points", value: `Earned on ${formatMoney(bundle.price)}` },
        ],
      },
      {
        title: "Who",
        rows: [
          { key: "made-by", label: "Made by", value: bundle.madeBy ?? "Not on record", muted: !bundle.madeBy },
          { key: "made", label: "Made", value: formatDay(bundle.madeAt), mono: true },
        ],
      },
    ];
  },
  invalidates: [["list", "retail-bundles"], ["reports"], ["list", "retail-bin"]],
};
