import type { CatalogArea } from "@/lib/reports/catalog";
import type { CustomReportSummary } from "@/lib/reports/custom/document";
import type { ReportFolderRecord } from "@/lib/reports/folders";
import type { ReportTemplateRecord } from "@/lib/reports/template-access";

/**
 * Reports → All reports (ReportsAll): every report this person can open, in
 * two groups. "Yours and shared" holds the reports made here (custom reports
 * and the templates saved from Corelith's reports); "From Corelith" holds
 * what the product ships (the registry's reports and the built-in custom
 * reports), each with Make it yours. Views narrow it to Yours, Shared with
 * you or From Corelith, and a folder narrows it to what is filed there.
 * Pure: the page and the panel both read it.
 */

export const REPORT_VIEWS = ["all", "yours", "shared", "corelith"] as const;
export type ReportsView = (typeof REPORT_VIEWS)[number];

export const REPORT_VIEW_LABEL: Record<ReportsView, string> = {
  all: "All reports",
  yours: "Yours",
  shared: "Shared with you",
  corelith: "From Corelith",
};

/** Each view's address: the panel's rows and the page's view menu go to the same place. */
export function viewHref(view: ReportsView): string {
  return view === "all" ? "/reports" : `/reports?view=${view}`;
}

export function folderHref(folderId: string): string {
  return `/reports?folder=${encodeURIComponent(folderId)}`;
}

/** What GET /api/v2/reports answers. */
export type ReportsHomeData = {
  areas: CatalogArea[];
  custom: Array<CustomReportSummary & { area: string | null }>;
  builtCustom: Array<{ key: string; title: string; description: string; audience: "EVERYONE" | "MANAGERS"; area: string | null }>;
  templates: ReportTemplateRecord[];
  folders: ReportFolderRecord[];
  /** Books' Financial reports page, when this person can open it. */
  financialReports: boolean;
};

export type ReportEntry = {
  id: string;
  title: string;
  href: string;
  group: "ours" | "corelith";
  /** Ours only: made by this person, or shared with them. */
  whose: "yours" | "shared" | null;
  /** "Board" (several blocks) or "Table" (one table, or a saved template). */
  kind: "Board" | "Table" | null;
  summary: string | null;
  area: string | null;
  folder: { id: string; name: string } | null;
  madeBy: string | null;
  /** ISO time it last changed; none for what Corelith ships. */
  updatedAt: string | null;
  /** "Shared" or "Only you". */
  seenBy: string | null;
  /** Corelith's: what Make it yours copies into the builder. */
  copy: { fromReport: string } | { fromTemplate: string } | null;
  /** A custom report this person may file in a folder. */
  movable: boolean;
};

const FINANCIAL_REPORTS: ReportEntry = {
  id: "accounting-financial-reports",
  title: "Financial reports",
  href: "/accounting/financial-reports",
  group: "corelith",
  whose: null,
  kind: null,
  summary: "Profit and loss, balance sheet and cash flow, from Books",
  area: "Books",
  folder: null,
  madeBy: null,
  updatedAt: null,
  seenBy: null,
  copy: null,
  movable: false,
};

export function reportEntries(data: ReportsHomeData): ReportEntry[] {
  const custom: ReportEntry[] = data.custom.map((report) => ({
    id: report.id,
    title: report.title,
    href: `/reports/custom/${report.id}`,
    group: "ours",
    whose: report.mine ? "yours" : "shared",
    kind: report.kind === "table" ? "Table" : "Board",
    summary: report.description ?? null,
    area: report.area,
    folder: report.folder,
    madeBy: report.madeBy,
    updatedAt: report.updatedAt,
    seenBy: report.audience === "JUST_ME" ? "Only you" : "Shared",
    copy: null,
    movable: report.editable,
  }));
  const templates: ReportEntry[] = data.templates.map((template) => ({
    id: template.id,
    title: template.name,
    href: `/reports/${template.reportKey}?template=${template.id}`,
    group: "ours",
    whose: template.mine ? "yours" : "shared",
    kind: "Table",
    summary: template.description ?? `On ${template.reportTitle}`,
    area: template.area,
    folder: null,
    madeBy: template.madeBy,
    updatedAt: template.updatedAt,
    seenBy: template.audience === "JUST_ME" ? "Only you" : "Shared",
    copy: null,
    movable: false,
  }));
  const builtIn: ReportEntry[] = data.areas.flatMap((area) =>
    area.reports.map((report) => ({
      id: report.key,
      title: report.title,
      href: `/reports/${report.key}`,
      group: "corelith" as const,
      whose: null,
      kind: null,
      summary: report.summary,
      area: area.area,
      folder: null,
      madeBy: null,
      updatedAt: null,
      seenBy: null,
      copy: { fromReport: report.key },
      movable: false,
    })),
  );
  const built: ReportEntry[] = data.builtCustom.map((report) => ({
    id: `built-${report.key}`,
    title: report.title,
    href: `/reports/built/${report.key}`,
    group: "corelith",
    whose: null,
    kind: null,
    summary: report.description,
    area: report.area,
    folder: null,
    madeBy: null,
    updatedAt: null,
    seenBy: null,
    copy: { fromTemplate: report.key },
    movable: false,
  }));
  return [...custom, ...templates, ...builtIn, ...built, ...(data.financialReports ? [FINANCIAL_REPORTS] : [])];
}

export function inView(entry: ReportEntry, view: ReportsView): boolean {
  if (view === "all") return true;
  if (view === "corelith") return entry.group === "corelith";
  return entry.whose === view;
}

export type ReportsCounts = Record<ReportsView, number> & { books: number; folders: Record<string, number> };

export function reportCounts(entries: readonly ReportEntry[]): ReportsCounts {
  const folders: Record<string, number> = {};
  for (const entry of entries) if (entry.folder) folders[entry.folder.id] = (folders[entry.folder.id] ?? 0) + 1;
  return {
    all: entries.length,
    yours: entries.filter((entry) => entry.whose === "yours").length,
    shared: entries.filter((entry) => entry.whose === "shared").length,
    corelith: entries.filter((entry) => entry.group === "corelith").length,
    books: entries.filter((entry) => entry.group === "corelith" && entry.area === "Books").length,
    folders,
  };
}

/** The badges beside Reports' panel rows, keyed by each row's address. */
export function reportBadges(counts: ReportsCounts): Record<string, string> {
  const badges: Record<string, string> = {};
  for (const view of REPORT_VIEWS) if (counts[view] > 0) badges[viewHref(view)] = String(counts[view]);
  return badges;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "9 reports read this workspace. 3 are yours, 4 come from Corelith, and 2 are kept up to date by Books." */
export function reportsFinding(counts: ReportsCounts): { fact: string; rest: string | null } {
  if (counts.all === 0) return { fact: "No reports read this workspace yet.", rest: null };
  const fact = `${plural(counts.all, "report reads", "reports read")} this workspace.`;
  const parts: string[] = [];
  if (counts.yours > 0) parts.push(`${counts.yours} ${counts.yours === 1 ? "is" : "are"} yours`);
  if (counts.shared > 0) parts.push(`${counts.shared} ${counts.shared === 1 ? "is" : "are"} shared with you`);
  if (counts.corelith > 0) parts.push(`${counts.corelith} ${counts.corelith === 1 ? "comes" : "come"} from Corelith`);
  if (counts.books > 0) parts.push(`${counts.books} ${counts.books === 1 ? "is" : "are"} kept up to date by Books`);
  if (parts.length === 0) return { fact, rest: null };
  const rest = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  return { fact, rest: `${rest.charAt(0).toUpperCase()}${rest.slice(1)}.` };
}

export type ReportsFilter = {
  view: ReportsView;
  folder: string | null;
  q: string;
  /** An area, or null for every area. */
  area: string | null;
  /** "you", a maker's name, or null for anyone. */
  maker: string | null;
  sort: "newest" | "oldest";
};

export function readReportsFilter(params: { get(name: string): string | null }): ReportsFilter {
  const view = params.get("view");
  return {
    view: REPORT_VIEWS.includes(view as ReportsView) ? (view as ReportsView) : "all",
    folder: params.get("folder") || null,
    q: params.get("q") ?? "",
    area: params.get("area") || null,
    maker: params.get("maker") || null,
    sort: params.get("sort") === "oldest" ? "oldest" : "newest",
  };
}

/** The entries a filter shows: ours newest (or oldest) first, Corelith's by name. */
export function filterEntries(entries: readonly ReportEntry[], filter: ReportsFilter): ReportEntry[] {
  const needle = filter.q.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      inView(entry, filter.view) &&
      (!filter.folder || entry.folder?.id === filter.folder) &&
      (!filter.area || entry.area === filter.area) &&
      (!filter.maker || (filter.maker === "you" ? entry.whose === "yours" : entry.madeBy === filter.maker)) &&
      (!needle || `${entry.title} ${entry.summary ?? ""} ${entry.folder?.name ?? ""}`.toLowerCase().includes(needle)),
  );
  const direction = filter.sort === "newest" ? -1 : 1;
  return shown.sort((left, right) => {
    if (left.group !== right.group) return left.group === "ours" ? -1 : 1;
    if (left.updatedAt && right.updatedAt && left.updatedAt !== right.updatedAt) {
      return left.updatedAt < right.updatedAt ? -direction : direction;
    }
    return left.title.localeCompare(right.title);
  });
}

/** Everyone who made a report shown here, for "Anyone ▾". */
export function makers(entries: readonly ReportEntry[]): string[] {
  return [...new Set(entries.filter((entry) => entry.whose === "shared" && entry.madeBy).map((entry) => entry.madeBy!))].sort();
}

/** The list as it is filtered, for Export. */
export function reportsCsv(entries: readonly ReportEntry[]): string {
  const cell = (value: string | null) => {
    const text = value ?? "";
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [["Report", "Kind", "Folder", "Made by", "Changed", "Seen by", "From"].join(",")];
  for (const entry of entries) {
    lines.push(
      [
        entry.title,
        entry.kind,
        entry.folder?.name ?? null,
        entry.madeBy,
        entry.updatedAt?.slice(0, 10) ?? null,
        entry.seenBy,
        entry.group === "corelith" ? "Corelith" : "This workspace",
      ]
        .map(cell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
