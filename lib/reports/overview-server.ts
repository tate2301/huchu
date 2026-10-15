import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { formatFigure } from "@/components/retail/insights/format";
import { offeredTemplates } from "@/lib/library/reports";
import { prisma } from "@/lib/prisma";
import { readableSources } from "@/lib/reports/custom/sources";
import { listCustomReports } from "@/lib/reports/custom/store";
import { readerOf } from "@/lib/reports/custom/sources";
import {
  between,
  finding,
  num,
  openedMost,
  percentChange,
  plural,
  signed,
  spans,
  sum,
  toneOf,
  type HealthRow,
  type OpenedSource,
  type OverviewKpi,
  type ReportsOverview,
} from "@/lib/reports/overview";
import { resolveParams } from "@/lib/reports/params";
import { getReport } from "@/lib/reports/server";
import { sqlName } from "@/lib/reports/sql/schema";
import { retailTemplates } from "@/lib/reports/templates";
import type { ReportParams, ReportRow } from "@/lib/reports/types";
import { VERTICAL_AREAS, type Vertical } from "@/lib/reports/verticals";
import { insightMoney } from "@/lib/reports/week-insights";
import { loadInsight, type InsightTopic, type Kpi as RetailKpi } from "@/lib/retail/insights";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { collectionsByYearGroup, generateCollectionsReport, generateOccupancyReport } from "@/lib/schools/reports";
import { addDays, formatShortDay, todayIn } from "@/lib/workspace/format";

/**
 * Each vertical's Reports overview, from the rows of the reports it reads.
 * A tile is drawn only for someone who may read the report behind it; the
 * modules' health reads the books, pay and people where the workspace keeps
 * them. Server-only.
 */

type Reader = {
  session: AuthenticatedSession;
  readable: Set<string>;
  today: string;
  now: Date;
};

const money = insightMoney;
const grams = (value: number) => `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g`;
const hours = (value: number) => `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
const pct = (share: number) => `${Math.round(share * 100)}%`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (date: Date) => MONTHS[Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", month: "numeric" }).format(date)) - 1]!;

/** A report's rows, when this person may read it; null when they may not. */
async function rows(reader: Reader, key: string, params: ReportParams): Promise<ReportRow[] | null> {
  if (!reader.readable.has(key)) return null;
  const report = getReport(key);
  if (!report) return null;
  const { session } = reader;
  const resolved = resolveParams(report.definition.params, params, reader.now);
  const loaded = await report.loader.load({ companyId: session.user.companyId, userId: session.user.id, role: session.user.role }, resolved, "report");
  return loaded.rows;
}

const window = (reader: Reader, days: number) => ({ from: addDays(reader.today, -(days - 1)), to: reader.today });
const before = (reader: Reader, days: number) => ({ from: addDays(reader.today, -(2 * days - 1)), to: addDays(reader.today, -days) });

/* ── Opened most ─────────────────────────────────────────────────────────── */

/**
 * Where opens are not counted (anything but the shop's templates), the
 * vertical's own reports: its areas' reports from Corelith, the built-in
 * custom reports, and the reports made here that read them.
 */
async function verticalReports(reader: Reader, vertical: Vertical, sources: Awaited<ReturnType<typeof readableSources>>): Promise<OpenedSource[]> {
  const { session } = reader;
  const areas = VERTICAL_AREAS[vertical];
  const areaRank = (area: string | null) => {
    const index = area ? areas.indexOf(area) : -1;
    return index < 0 ? areas.length : index;
  };
  const areaOfKey = new Map(sources.map((source) => [source.key, source.area]));
  const areaOfTable = new Map(sources.map((source) => [sqlName(source.key), source.area]));
  const corelith: OpenedSource[] = sources
    .filter((source) => !source.list && !source.report && areas.includes(source.area))
    .map((source) => ({
      id: source.key,
      title: source.title,
      href: `/reports/${source.key}`,
      area: source.area,
      madeBy: null,
      seenBy: "Everyone",
      opens: 0,
      lastOpenedAt: null,
      lastOpenedBy: null,
    }));
  const built: OpenedSource[] = (await offeredTemplates(session, sources))
    .map((template) => ({
      id: `built-${template.key}`,
      title: template.title,
      href: `/reports/built/${template.key}`,
      area: template.reads.map((key) => areaOfKey.get(key)).find(Boolean) ?? null,
      madeBy: null,
      seenBy: template.audience === "MANAGERS" ? ("Managers" as const) : ("Everyone" as const),
      opens: 0,
      lastOpenedAt: null,
      lastOpenedBy: null,
    }))
    .filter((entry) => entry.area !== null && areas.includes(entry.area));
  const custom: OpenedSource[] = (await listCustomReports(readerOf(session))).map((report) => ({
    id: report.id,
    title: report.title,
    href: `/reports/c/${report.id}`,
    area: report.areaSources.map((table) => areaOfTable.get(table)).find(Boolean) ?? null,
    madeBy: report.madeBy,
    seenBy: report.audience === "EVERYONE" ? "Everyone" : report.audience === "MANAGERS" ? "Managers" : "Just you",
    opens: 0,
    lastOpenedAt: null,
    lastOpenedBy: null,
  }));
  // Nothing is counted, so the order is the vertical's: its own areas first.
  return [...corelith, ...built, ...custom].sort((a, b) => areaRank(a.area) - areaRank(b.area) || a.title.localeCompare(b.title));
}

/** The shop's templates, as Reports counts their opens (`ReportTemplateUse`). */
async function retailOpened(reader: Reader): Promise<OpenedSource[]> {
  const { session } = reader;
  const viewer = { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
  const [entries, uses] = await Promise.all([
    retailTemplates(viewer),
    prisma.reportTemplateUse.findMany({
      where: { companyId: viewer.companyId },
      select: { templateRef: true, lastOpenedBy: { select: { name: true } } },
    }),
  ]);
  const by = new Map(uses.map((use) => [use.templateRef, use.lastOpenedBy?.name ?? null]));
  return entries.map((entry) => ({
    id: entry.ref,
    title: entry.name,
    href: `/retail/reports/${entry.ref}`,
    area: entry.area.label,
    madeBy: entry.builtIn ? null : entry.madeBy,
    seenBy: entry.audience === "EVERYONE" ? "Everyone" : entry.audience === "MANAGERS" ? "Managers" : "Just you",
    opens: entry.opens,
    lastOpenedAt: entry.lastOpenedAt,
    lastOpenedBy: by.get(entry.useRef) ?? null,
  }));
}

/* ── How each module is doing: the books, pay and people ─────────────────── */

async function booksHealth(companyId: string, now: Date): Promise<HealthRow | null> {
  const closed = await prisma.accountingPeriod.findFirst({
    where: { companyId, status: "CLOSED" },
    orderBy: { endDate: "desc" },
    select: { endDate: true, closedAt: true },
  });
  const open = await prisma.accountingPeriod.count({ where: { companyId, status: "OPEN", endDate: { lt: now } } });
  if (!closed && open === 0) return null;
  if (!closed) return { module: "Books", icon: "book", state: "Watch", line: `${plural(open, "month")} ended and not closed` };
  const line = `${monthName(closed.endDate)} closed${closed.closedAt ? ` on ${formatShortDay(closed.closedAt)}` : ""}`;
  return open > 0
    ? { module: "Books", icon: "book", state: "Watch", line: `${line}; ${plural(open, "month")} ended and not closed` }
    : { module: "Books", icon: "book", state: "Healthy", line };
}

async function payHealth(companyId: string): Promise<HealthRow | null> {
  const run = await prisma.payrollRun.findFirst({
    where: { companyId },
    orderBy: [{ period: { startDate: "desc" } }, { runNumber: "desc" }],
    select: { status: true, approvedAt: true, period: { select: { startDate: true, dueDate: true } } },
  });
  if (!run) return null;
  const month = monthName(run.period.startDate);
  if (run.status === "DRAFT" || run.status === "SUBMITTED") {
    return { module: "Pay", icon: "money", state: "Watch", line: `${month} run ${run.status === "DRAFT" ? "in draft" : "waiting for approval"}` };
  }
  const late = run.approvedAt && run.approvedAt > run.period.dueDate;
  return { module: "Pay", icon: "money", state: late ? "Watch" : "Healthy", line: `${month} ${late ? `approved after its due day` : "paid on time"}` };
}

async function peopleHealth(companyId: string): Promise<HealthRow | null> {
  const [working, noNssa] = await Promise.all([
    prisma.employee.count({ where: { companyId, isActive: true } }),
    prisma.employee.count({ where: { companyId, isActive: true, nssaNumber: null } }),
  ]);
  if (working === 0) return null;
  return noNssa > 0
    ? { module: "People", icon: "people", state: "Watch", line: `${plural(noNssa, "person", "people")} ${noNssa === 1 ? "has" : "have"} no NSSA number` }
    : { module: "People", icon: "people", state: "Healthy", line: `${plural(working, "person", "people")} working here` };
}

async function storesFacts(companyId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { site: { companyId }, productId: null },
    select: { name: true, currentStock: true, minStock: true, unitCost: true },
  });
  const value = items.reduce((total, item) => total + Number(item.currentStock) * Number(item.unitCost ?? 0), 0);
  const under = items.filter((item) => item.minStock !== null && Number(item.currentStock) < Number(item.minStock));
  return { count: items.length, value, under };
}

function storesHealth(stores: Awaited<ReturnType<typeof storesFacts>>): HealthRow | null {
  if (stores.count === 0) return null;
  const [first] = stores.under;
  if (!first) return { module: "Stores", icon: "stock", state: "Healthy", line: "Everything is above its minimum" };
  return {
    module: "Stores",
    icon: "stock",
    state: "Watch",
    line: stores.under.length === 1 ? `${first.name} is under its minimum` : `${stores.under.length} items are under their minimum`,
  };
}

const present = <T,>(items: Array<T | null>): T[] => items.filter((item): item is T => item !== null);

/* ── Schools ─────────────────────────────────────────────────────────────── */

async function schools(reader: Reader): Promise<Omit<ReportsOverview, "opened" | "opensCounted">> {
  const companyId = reader.session.user.companyId;
  const terms = await prisma.schoolTerm.findMany({
    where: { companyId, startDate: { lte: reader.now } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true },
    take: 7,
  });
  const [term, last] = terms;
  const kpis: OverviewKpi[] = [];
  const sentences: string[] = [];
  let fees: HealthRow | null = null;

  if (term && reader.readable.has("school-fee-balances")) {
    const [collections, byClass] = await Promise.all([
      generateCollectionsReport(companyId),
      collectionsByYearGroup(companyId, { termId: term.id }),
    ]);
    const rate = (termId: string) => {
      const row = collections.find((entry) => entry.termId === termId);
      return row && row.invoiced > 0 ? { share: row.collected / row.invoiced, row } : null;
    };
    const now = rate(term.id);
    const then = last ? rate(last.id) : null;
    const behind = [...byClass].filter((row) => row.invoiced > 0).sort((a, b) => a.collectionRate - b.collectionRate)[0] ?? null;
    if (now) {
      const points = then ? Math.round(now.share * 100) - Math.round(then.share * 100) : null;
      kpis.push({
        label: "Fees",
        value: pct(now.share),
        change: points === null ? null : { text: signed(points, (n) => `${n} ${n === 1 ? "pt" : "pts"}`), tone: toneOf(points) },
        note: points === null ? `of ${term.name} collected` : "on last term",
        href: "/reports/insights/fees",
        bars: [...terms].reverse().map((entry) => rate(entry.id)?.share ?? 0),
      });
      sentences.push(`${pct(now.share)} of ${term.name} fees are in: ${money(now.row.collected)} of ${money(now.row.invoiced)}.`);
      if (behind && behind.collectionRate < 80) sentences.push(`${behind.className} is behind at ${Math.round(behind.collectionRate)}%.`);
    }
    if (behind) {
      fees =
        behind.collectionRate < 80
          ? { module: "Fees", icon: "fees", state: "Watch", line: `${behind.className} is at ${Math.round(behind.collectionRate)}% collected` }
          : { module: "Fees", icon: "fees", state: "Healthy", line: `Every class is at ${Math.floor(behind.collectionRate)}% or more` };
    }
  }

  const marks = await rows(reader, "school-attendance", { from: addDays(reader.today, -48), to: reader.today });
  if (marks) {
    const share = (from: string, to: string) => {
      const inside = between(marks, "date", from, to);
      return inside.length ? inside.filter((row) => row.status === "Present" || row.status === "Late").length / inside.length : null;
    };
    const week = share(addDays(reader.today, -6), reader.today);
    const prior = share(addDays(reader.today, -13), addDays(reader.today, -7));
    if (week !== null) {
      const points = prior === null ? null : Math.round(week * 100) - Math.round(prior * 100);
      kpis.push({
        label: "Attendance",
        value: pct(week),
        change: points === null ? null : { text: signed(points, (n) => `${n} ${n === 1 ? "pt" : "pts"}`), tone: toneOf(points) },
        note: points === null ? "the last 7 days" : "on the week before",
        href: "/reports/school-attendance",
        bars: spans(reader.today, 7, 7, addDays).map((span) => share(span.from, span.to) ?? 0),
      });
      sentences.push(`Attendance was ${pct(week)} in the last 7 days.`);
    }
  }

  // On the roll: every pupil still enrolled, a suspended one too. Fees bills them all, so the
  // tile and Fees count the same pupils.
  const everyone = await rows(reader, "school-roll", { status: "all" });
  const roll = everyone?.filter((row) => row.status === "Active" || row.status === "Suspended") ?? null;
  if (roll) {
    const joined = term ? roll.filter((row) => typeof row.admitted === "string" && row.admitted >= term.startDate.toISOString().slice(0, 10)).length : 0;
    kpis.push({
      label: "Enrolment",
      value: roll.length.toLocaleString("en-US"),
      change: term ? { text: signed(joined, String), tone: toneOf(joined) } : null,
      note: term ? "this term" : "on the roll",
      href: "/reports/school-enrolment",
      bars: [],
    });
  }

  if (reader.readable.has("school-boarding")) {
    const hostels = await generateOccupancyReport(companyId);
    const beds = hostels.reduce((total, hostel) => total + hostel.totalBeds, 0);
    const taken = hostels.reduce((total, hostel) => total + hostel.occupiedBeds, 0);
    if (beds > 0) {
      kpis.push({
        label: "Boarding",
        value: pct(taken / beds),
        change: { text: (beds - taken).toLocaleString("en-US"), tone: "muted" },
        note: beds - taken === 1 ? "bed free" : "beds free",
        href: "/reports/school-boarding",
        bars: hostels.map((hostel) => hostel.occupancyRate),
      });
    }
  }

  const companyHealth = await Promise.all([booksHealth(companyId, reader.now), payHealth(companyId), peopleHealth(companyId)]);
  return { finding: finding(sentences), kpis, health: present([fees, ...companyHealth]) };
}

/* ── A gold mine ─────────────────────────────────────────────────────────── */

async function mine(reader: Reader): Promise<Omit<ReportsOverview, "opened" | "opensCounted">> {
  const companyId = reader.session.user.companyId;
  const kpis: OverviewKpi[] = [];
  const sentences: string[] = [];
  const now = window(reader, 30);
  const prior = before(reader, 30);
  const weeks = spans(reader.today, 7, 7, addDays);

  const plant = await rows(reader, "plant", { from: addDays(reader.today, -59), to: reader.today });
  if (plant) {
    const gold = sum(between(plant, "date", now.from, now.to), "gold");
    const was = sum(between(plant, "date", prior.from, prior.to), "gold");
    const change = percentChange(gold, was);
    kpis.push({
      label: "Production",
      value: grams(gold),
      change: change ? { text: change.text, tone: toneOf(change.value) } : null,
      note: change ? "on 30 days before" : "in 30 days",
      href: "/reports/insights/production",
      bars: weeks.map((span) => sum(between(plant, "date", span.from, span.to), "gold")),
    });
    sentences.push(
      gold > 0
        ? `The mills recovered ${grams(gold)} of gold in the last 30 days${change ? `, ${change.value >= 0 ? `${Math.abs(change.value)}% more` : `${Math.abs(change.value)}% less`}` : ""}.`
        : "No plant report recorded gold in the last 30 days.",
    );
  }

  const downtime = await rows(reader, "downtime", { from: addDays(reader.today, -59), to: reader.today });
  if (downtime) {
    const inside = between(downtime, "date", now.from, now.to);
    const lost = sum(inside, "hours");
    const was = sum(between(downtime, "date", prior.from, prior.to), "hours");
    const difference = Math.round((lost - was) * 10) / 10;
    kpis.push({
      label: "Downtime",
      value: hours(lost),
      change: was > 0 || lost > 0 ? { text: signed(difference, hours), tone: toneOf(difference, true) } : null,
      note: "on 30 days before",
      href: "/reports/downtime",
      bars: weeks.map((span) => sum(between(downtime, "date", span.from, span.to), "hours")),
    });
    const causes = new Map<string, number>();
    for (const row of inside) causes.set(String(row.cause ?? "Other"), (causes.get(String(row.cause ?? "Other")) ?? 0) + num(row.hours));
    const [top] = [...causes].sort(([, a], [, b]) => b - a);
    if (lost > 0 && top) sentences.push(`They lost ${hours(lost)}, ${pct(top[1] / lost)} of it to ${top[0].toLowerCase()}.`);
  }

  let goldHealth: HealthRow | null = null;
  const chain = await rows(reader, "gold-chain", { from: addDays(reader.today, -364), to: reader.today });
  if (chain) {
    const unsold = chain.filter((row) => row.stage !== "Settled");
    const held = sum(unsold, "grams");
    kpis.push({
      label: "Gold",
      value: plural(unsold.length, "bar"),
      change: { text: grams(held), tone: unsold.length > 0 ? "warning" : "muted" },
      note: "not sold",
      href: "/reports/gold-chain",
      bars: weeks.map((span) => between(chain, "poured", span.from, span.to).length),
    });
    if (unsold.length) sentences.push(`${plural(unsold.length, "bar is", "bars are")} poured and not yet sold.`);
    const stale = unsold.filter((row) => typeof row.poured === "string" && row.poured < addDays(reader.today, -14));
    goldHealth = stale.length
      ? { module: "Gold", icon: "gold", state: "Watch", line: `${plural(stale.length, "bar")} poured over 14 days ago, not sold` }
      : { module: "Gold", icon: "gold", state: "Healthy", line: unsold.length ? `${plural(unsold.length, "bar")} on the way to a buyer` : "Every bar is sold" };
  }

  let stores: HealthRow | null = null;
  if (reader.readable.has("stores-movements")) {
    const facts = await storesFacts(companyId);
    if (facts.count > 0) {
      kpis.push({
        label: "Stores",
        value: money(facts.value),
        change: facts.under.length ? { text: String(facts.under.length), tone: "warning" } : null,
        note: facts.under.length ? "under minimum" : "everything above its minimum",
        href: "/reports/stores-movements",
        bars: [],
      });
    }
    stores = storesHealth(facts);
  }

  let safety: HealthRow | null = null;
  const incidents = await rows(reader, "compliance-incidents", { from: addDays(reader.today, -364), to: reader.today });
  if (incidents) {
    const open = incidents.filter((row) => row.status !== "Closed").length;
    safety = open
      ? { module: "Safety", icon: "safety", state: "Watch", line: `${plural(open, "incident")} open` }
      : { module: "Safety", icon: "safety", state: "Healthy", line: "No incident open" };
  }

  return { finding: finding(sentences), kpis, health: present([goldHealth, stores, safety, await payHealth(companyId)]) };
}

/* ── Payroll ─────────────────────────────────────────────────────────────── */

async function pay(reader: Reader): Promise<Omit<ReportsOverview, "opened" | "opensCounted">> {
  const companyId = reader.session.user.companyId;
  const kpis: OverviewKpi[] = [];
  const sentences: string[] = [];
  if (reader.readable.has("payroll-pay")) {
    const runs = await prisma.payrollRun.findMany({
      where: { companyId, status: { not: "REJECTED" } },
      orderBy: [{ period: { startDate: "desc" } }, { runNumber: "desc" }],
      select: {
        id: true,
        grossTotal: true,
        employerCostTotal: true,
        period: { select: { startDate: true } },
        _count: { select: { lineItems: true } },
      },
      take: 7,
    });
    const [run, previous] = runs;
    if (run) {
      // What a run costs the employer: the gross, and the employer's own contributions on top.
      const costOf = (entry: (typeof runs)[number]) => Number(entry.grossTotal) + Number(entry.employerCostTotal);
      const cost = costOf(run);
      const difference = previous ? cost - costOf(previous) : null;
      kpis.push({
        label: "Pay cost",
        value: money(cost),
        change: difference === null ? null : { text: signed(difference, money), tone: toneOf(difference, true) },
        note: difference === null ? monthName(run.period.startDate) : `on ${monthName(previous!.period.startDate)}`,
        href: "/reports/insights/pay-cost",
        bars: [...runs].reverse().map(costOf),
      });
      sentences.push(`${monthName(run.period.startDate)}’s run costs ${money(cost)} for ${plural(run._count.lineItems, "person", "people")}.`);
      if (difference !== null && difference !== 0) sentences.push(`${money(Math.abs(difference))} ${difference > 0 ? "more" : "less"} than ${monthName(previous!.period.startDate)}.`);
      if (reader.readable.has("payroll-statutory")) {
        const statutory = await prisma.payrollLineComponent.aggregate({
          where: { lineItem: { runId: run.id }, statutoryKey: { not: null }, NOT: { statutoryKey: { startsWith: "TAX_CREDIT" } } },
          _sum: { amount: true },
        });
        kpis.push({
          label: "Statutory",
          value: money(Number(statutory._sum.amount ?? 0)),
          change: null,
          note: `PAYE, levies and NSSA for ${monthName(run.period.startDate)}`,
          href: "/reports/payroll-statutory",
          bars: [],
        });
      }
    }
  }
  const health = await Promise.all([payHealth(companyId), peopleHealth(companyId), booksHealth(companyId, reader.now)]);
  return { finding: finding(sentences), kpis, health: present(health) };
}

/* ── A workshop ──────────────────────────────────────────────────────────── */

async function shop(reader: Reader): Promise<Omit<ReportsOverview, "opened" | "opensCounted">> {
  const companyId = reader.session.user.companyId;
  const kpis: OverviewKpi[] = [];
  const sentences: string[] = [];
  let maintenance: HealthRow | null = null;
  const equipment = await rows(reader, "maintenance-equipment", {});
  if (equipment) {
    const overdue = equipment.filter((row) => row.service === "Overdue").length;
    const working = equipment.length - overdue;
    kpis.push({
      label: "Equipment",
      value: `${working} of ${equipment.length}`,
      change: overdue ? { text: String(overdue), tone: "warning" } : null,
      note: overdue ? "past their service" : "every machine in service",
      href: "/reports/maintenance-equipment",
      bars: [],
    });
    sentences.push(`${working} of ${plural(equipment.length, "machine")} are in service.`);
    maintenance = overdue
      ? { module: "Maintenance", icon: "wrench", state: "Watch", line: `${plural(overdue, "machine")} past ${overdue === 1 ? "its" : "their"} service` }
      : { module: "Maintenance", icon: "wrench", state: "Healthy", line: "Every machine is in service" };
  }
  let stores: HealthRow | null = null;
  if (reader.readable.has("stores-movements")) {
    const facts = await storesFacts(companyId);
    if (facts.count > 0) {
      kpis.push({
        label: "Stores",
        value: money(facts.value),
        change: facts.under.length ? { text: String(facts.under.length), tone: "warning" } : null,
        note: facts.under.length ? "under minimum" : "everything above its minimum",
        href: "/reports/stores-movements",
        bars: [],
      });
    }
    stores = storesHealth(facts);
  }
  const health = await Promise.all([booksHealth(companyId, reader.now), peopleHealth(companyId)]);
  return { finding: finding(sentences), kpis, health: present([maintenance, stores, ...health]) };
}

/* ── The shop ────────────────────────────────────────────────────────────── */

const RETAIL_TILES: Array<{ topic: InsightTopic; label: string; kpi: number }> = [
  { topic: "sales", label: "Sales", kpi: 0 },
  { topic: "profit", label: "Profit", kpi: 0 },
  { topic: "products", label: "Products", kpi: 0 },
  { topic: "stock", label: "Stock health", kpi: 1 },
  { topic: "losses", label: "Losses", kpi: 0 },
  { topic: "customers", label: "Customers", kpi: 0 },
  { topic: "money", label: "Money", kpi: 2 },
];

function retailKpi(label: string, topic: InsightTopic, kpi: RetailKpi): OverviewKpi {
  const change = kpi.change;
  return {
    label,
    value: formatFigure(kpi.value, kpi.format).replace(/^(−?)US\$/, "$1$"),
    change: change
      ? {
          text: `${change.value > 0 ? "+" : change.value < 0 ? "−" : ""}${formatFigure(Math.abs(change.value), change.format).replace(/^US\$/, "$")}`,
          tone: change.tone === "good" ? "success" : change.tone === "bad" ? "danger" : "warning",
        }
      : null,
    note: kpi.note ?? (change ? "on the month before" : null),
    href: `/retail/insights/${topic}`,
    bars: [],
  };
}

async function retail(reader: Reader): Promise<Omit<ReportsOverview, "opened" | "opensCounted">> {
  const { session } = reader;
  const companyId = session.user.companyId;
  const may = (topic: InsightTopic) =>
    canRetailRoleDo(session.user.role, topic === "money" ? "retail.money" : "retail.insights", "view");
  const tiles = RETAIL_TILES.filter((tile) => may(tile.topic));
  const insights = new Map(
    await Promise.all(tiles.map(async (tile) => [tile.topic, await loadInsight(companyId, tile.topic, "month", null, reader.now)] as const)),
  );
  const kpis = tiles.flatMap((tile) => {
    const kpi = insights.get(tile.topic)?.kpis[tile.kpi];
    return kpi ? [retailKpi(tile.label, tile.topic, kpi)] : [];
  });
  const sales = insights.get("sales");
  const losses = insights.get("losses");
  const stock = insights.get("stock");

  const short = losses?.kpis.find((kpi) => kpi.label === "Drawer differences");
  const floor: HealthRow | null = losses
    ? short && short.value > 0
      ? { module: "The floor", icon: "floor", state: "Watch", line: `Drawers came up ${money(short.value)} short this month${short.note ? `, ${short.note}` : ""}` }
      : { module: "The floor", icon: "floor", state: "Healthy", line: "Every drawer balanced this month" }
    : null;
  const low = stock?.kpis.find((kpi) => kpi.label === "Running low");
  const stockHealth: HealthRow | null = stock
    ? low && low.value > 0
      ? { module: "Stock", icon: "stock", state: "Watch", line: `${plural(low.value, "product")} running low` }
      : { module: "Stock", icon: "stock", state: "Healthy", line: "Nothing is running low" }
    : null;
  const midnight = new Date(`${reader.today}T00:00:00+02:00`);
  const cashiers = await prisma.retailShift.findMany({
    where: { companyId, openedAt: { gte: midnight } },
    distinct: ["cashierId"],
    select: { cashierId: true },
  });
  const people: HealthRow = { module: "People", icon: "people", state: "Healthy", line: `${plural(cashiers.length, "person", "people")} on the floor today` };

  return {
    finding: sales ? finding([sales.headline.fact, losses?.headline.fact]) : null,
    kpis,
    health: present([floor, stockHealth, await booksHealth(companyId, reader.now), people]),
  };
}

const BUILDERS: Record<Vertical, (reader: Reader) => Promise<Omit<ReportsOverview, "opened" | "opensCounted">>> = {
  retail,
  schools,
  mine,
  pay,
  shop,
};

/** `GET /api/v2/reports/overview`: the vertical's overview for this person. */
export async function loadReportsOverview(session: AuthenticatedSession, vertical: Vertical, now = new Date()): Promise<ReportsOverview> {
  const sources = await readableSources(session);
  const reader: Reader = { session, readable: new Set(sources.map((source) => source.key)), today: todayIn(undefined, now), now };
  const [body, opened] = await Promise.all([
    BUILDERS[vertical](reader),
    vertical === "retail" ? retailOpened(reader) : verticalReports(reader, vertical, sources),
  ]);
  return { ...body, opened: openedMost(opened, now), opensCounted: vertical === "retail" };
}
