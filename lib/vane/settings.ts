import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * Management → Vane (design/core-modules/spec/management.md): what it watches,
 * what it does, when it works, and this month against the allowance. No
 * `VaneSettings` row means the defaults the table declares.
 */

/** A product or module Vane can watch, as the workspace has it. */
export type VaneWatchable = {
  key: string;
  name: string;
  detail: string;
  /** A product's own mark (in /brand), or the kit icon a core module uses. */
  mark: { kind: "image"; src: string } | { kind: "icon"; icon: "books" | "reports" | "person" | "grade" | "docs" };
};

const WATCHABLE: Array<VaneWatchable & { feature: string | null }> = [
  { key: "books", name: "Books", detail: "Invoices, payments, the bank and VAT", feature: "accounting.", mark: { kind: "icon", icon: "books" } },
  { key: "crm", name: "CRM", detail: "Customers, deals, site visits and quotes", feature: "crm.", mark: { kind: "image", src: "/brand/flare-mark.svg" } },
  { key: "retail", name: "Tender", detail: "Sales, tills and cash-ups", feature: "retail.", mark: { kind: "image", src: "/brand/tender-mark.svg" } },
  { key: "schools", name: "Schools", detail: "Fees, pupils and their classes", feature: "schools.", mark: { kind: "image", src: "/brand/campus-mark.svg" } },
  { key: "gold", name: "Gold", detail: "Production, dispatches and allocations", feature: "gold.", mark: { kind: "icon", icon: "grade" } },
  { key: "people", name: "People", detail: "Time off, rosters and incidents", feature: "hr.", mark: { kind: "icon", icon: "person" } },
  { key: "reports", name: "Reports", detail: "Every report and the questions behind it", feature: null, mark: { kind: "icon", icon: "reports" } },
];

/** What this workspace runs, in the order the page lists it. Reports is in every workspace. */
export function watchablesFor(enabledFeatures: readonly string[] | undefined): VaneWatchable[] {
  const features = enabledFeatures ?? [];
  return WATCHABLE.filter(
    (entry) => entry.feature === null || features.some((feature) => feature.startsWith(entry.feature as string)),
  ).map((entry) => ({ key: entry.key, name: entry.name, detail: entry.detail, mark: entry.mark }));
}

/** The quiet hours a workspace picks from. */
export const QUIET_HOURS = [
  { from: "20:00", to: "06:00" },
  { from: "18:00", to: "07:00" },
  { from: "22:00", to: "05:00" },
  { from: "00:00", to: "00:00" },
] as const;

export const quietLabel = (from: string, to: string) => (from === to ? "None" : `${from} to ${to}`);

/** Who hears about the issues from each module: role names, as the app's roles. */
export const routingSchema = z.record(z.string(), z.array(z.string()));

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const settingsPatchSchema = z
  .object({
    paused: z.boolean(),
    watches: z.record(z.string(), z.boolean()),
    raiseIssues: z.boolean(),
    plans: z.boolean(),
    drafts: z.boolean(),
    readsPeoplePrivate: z.boolean(),
    quietFrom: hhmm,
    quietTo: hhmm,
    routing: routingSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Say what to change");
export type VaneSettingsPatch = z.infer<typeof settingsPatchSchema>;

export type VaneSettingsView = {
  paused: boolean;
  watches: Record<string, boolean>;
  raiseIssues: boolean;
  plans: boolean;
  drafts: boolean;
  readsPeoplePrivate: boolean;
  quietFrom: string;
  quietTo: string;
  routing: Record<string, string[]>;
  monthlyAllowance: number;
  month: {
    /** Jobs that finished this month: what counts against the allowance. */
    jobs: number;
    issues: number;
    suggestionsTaken: number;
    /** The first day of next month, when the count starts again. */
    resetsOn: string;
  };
  working: boolean;
};

const asRecord = <T>(value: unknown, item: z.ZodType<T>): Record<string, T> => {
  const parsed = z.record(z.string(), item).safeParse(value);
  return parsed.success ? parsed.data : {};
};

/** The start of this month and of the next, in UTC. */
export function monthBounds(now: Date = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, next };
}

export async function readVaneSettings(
  db: Pick<PrismaClient, "vaneSettings" | "vaneJob" | "vaneItem">,
  companyId: string,
  now: Date = new Date(),
): Promise<VaneSettingsView> {
  const { start, next } = monthBounds(now);
  const [row, jobs, issues, suggestionsTaken, running] = await Promise.all([
    db.vaneSettings.findUnique({ where: { companyId } }),
    db.vaneJob.count({ where: { companyId, status: "DONE", finishedAt: { gte: start, lt: next } } }),
    db.vaneItem.count({ where: { companyId, kind: "ISSUE", createdAt: { gte: start, lt: next } } }),
    db.vaneItem.count({
      where: { companyId, kind: "SUGGESTION", status: "DONE", resolvedAt: { gte: start, lt: next } },
    }),
    db.vaneJob.count({ where: { companyId, status: "RUNNING" } }),
  ]);
  return {
    paused: row?.paused ?? false,
    watches: asRecord(row?.watches, z.boolean()),
    raiseIssues: row?.raiseIssues ?? true,
    plans: row?.plans ?? true,
    drafts: row?.drafts ?? true,
    readsPeoplePrivate: row?.readsPeoplePrivate ?? false,
    quietFrom: row?.quietFrom ?? "20:00",
    quietTo: row?.quietTo ?? "06:00",
    routing: asRecord(row?.routing, z.array(z.string())),
    monthlyAllowance: row?.monthlyAllowance ?? 5000,
    month: { jobs, issues, suggestionsTaken, resetsOn: next.toISOString().slice(0, 10) },
    working: running > 0 && !(row?.paused ?? false),
  };
}

/**
 * Writes the fields given. `watches` and `routing` merge into what is there,
 * so turning one module off leaves the others as they were.
 */
export async function updateVaneSettings(
  db: Pick<PrismaClient, "vaneSettings">,
  companyId: string,
  patch: VaneSettingsPatch,
) {
  const current = await db.vaneSettings.findUnique({ where: { companyId }, select: { watches: true, routing: true } });
  const data = {
    ...patch,
    ...(patch.watches ? { watches: { ...asRecord(current?.watches, z.boolean()), ...patch.watches } } : {}),
    ...(patch.routing ? { routing: { ...asRecord(current?.routing, z.array(z.string())), ...patch.routing } } : {}),
  };
  await db.vaneSettings.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
}
