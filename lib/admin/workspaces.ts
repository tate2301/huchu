import { WorkspaceProfile, type Prisma, type Vertical, type WorkspaceProduct } from "@prisma/client";
import { cache } from "react";

import { readStanding, STANDINGS, type Standing, type StandingReading } from "@/lib/admin/standing";
import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-core/last-sign-in";
import { getProduct } from "@/lib/platform/products";
import { UNBILLED_ROLES, VERTICAL_ORDER, VERTICALS, verticalCharge } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";

/**
 * Workspaces as the admin portal reads them: the facts a register scans by,
 * gathered in four queries for a whole page, never one per row.
 */

/** What a workspace was set up to run, in the words the portal uses. Facts, not states. */
export const PROFILE_LABEL: Record<WorkspaceProfile, string> = {
  GOLD_MINE: "Gold mine",
  SCRAP_METAL: "Scrap metal",
  SCHOOLS: "School",
  AUTOS: "Car sales",
  // The column still stores the retired name; the enum key is the current one.
  [WorkspaceProfile.RETAIL]: "Retail",
  PAYROLL: "Payroll",
  GENERAL: "General",
};

const WORKSPACE_FIELDS = {
  id: true,
  slug: true,
  name: true,
  product: true,
  workspaceProfile: true,
  tenantStatus: true,
  createdAt: true,
  subscriptions: {
    orderBy: { updatedAt: "desc" },
    take: 1,
    select: {
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      plan: { select: { graceDays: true } },
    },
  },
  // The owner is the first person given the workspace's top role: the one who
  // signed up, or the one an operator set it up for.
  users: {
    where: { role: "SUPERADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { id: true, name: true, email: true, phone: true },
  },
  verticals: { select: { vertical: true } },
  _count: { select: { users: { where: { isActive: true, role: { notIn: [...UNBILLED_ROLES] } } } } },
} satisfies Prisma.CompanySelect;

type CompanyRow = Prisma.CompanyGetPayload<{ select: typeof WORKSPACE_FIELDS }>;

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  product: WorkspaceProduct;
  productName: string;
  profile: string | null;
  /** The verticals it pays for, in the catalogue's order. */
  verticals: Array<{ id: Vertical; label: string }>;
  /** What it pays a month: its verticals at the rate its member count sets. */
  monthly: number;
  /** `Company.tenantStatus`, for what can be done to it. */
  status: string;
  standing: StandingReading;
  members: number;
  owner: { id: string; name: string; email: string | null; phone: string | null } | null;
  lastSignInAt: Date | null;
  createdAt: Date;
};

function toSummary(row: CompanyRow, lastSignInAt: Date | null, now: Date): WorkspaceSummary {
  const subscription = row.subscriptions[0] ?? null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    product: row.product,
    productName: getProduct(row.product).name,
    // A Flare workspace is a CRM whatever its profile says; only Corelith
    // workspaces were set up as one kind of business.
    profile: row.product === "CORELITH" ? PROFILE_LABEL[row.workspaceProfile] : null,
    verticals: VERTICAL_ORDER.filter((id) => row.verticals.some((held) => held.vertical === id)).map((id) => ({
      id,
      label: VERTICALS[id].label,
    })),
    monthly: verticalCharge(row.verticals.length, row._count.users).total,
    status: row.tenantStatus,
    standing: readStanding(
      {
        tenantStatus: row.tenantStatus,
        subscription: subscription
          ? {
              status: subscription.status,
              trialEndsAt: subscription.trialEndsAt,
              currentPeriodEnd: subscription.currentPeriodEnd,
              graceDays: subscription.plan.graceDays,
            }
          : null,
      },
      now,
    ),
    members: row._count.users,
    owner: row.users[0] ?? null,
    lastSignInAt,
    createdAt: row.createdAt,
  };
}

async function lastSignInByCompany(companyIds: string[]) {
  if (companyIds.length === 0) return new Map<string, Date>();
  const rows = await prisma.platformAuditEvent.groupBy({
    by: ["companyId"],
    where: { eventType: LOGIN_SUCCESS_EVENT, companyId: { in: companyIds } },
    _max: { createdAt: true },
  });
  return new Map(rows.flatMap((row) => (row.companyId && row._max.createdAt ? [[row.companyId, row._max.createdAt]] : [])));
}

export type WorkspaceListFilter = {
  q?: string;
  product?: WorkspaceProduct | null;
  standing?: Standing | null;
};

export type WorkspaceList = {
  rows: WorkspaceSummary[];
  /** How many of the search's workspaces stand where, before the tab narrows them. */
  counts: Record<Standing | "All", number>;
};

/**
 * The register. Searched and filtered by product in the database; split by
 * standing after, because standing is read from three tables and a tab's
 * count has to agree with the rows it opens.
 */
export async function listWorkspaces(filter: WorkspaceListFilter, now = new Date()): Promise<WorkspaceList> {
  const q = filter.q?.trim();
  const where: Prisma.CompanyWhereInput = {
    ...(filter.product ? { product: filter.product } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q.toLowerCase() } },
            { users: { some: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }] } } },
          ],
        }
      : {}),
  };
  const companies = await prisma.company.findMany({ where, select: WORKSPACE_FIELDS, orderBy: { name: "asc" } });
  const lastSignIn = await lastSignInByCompany(companies.map((company) => company.id));
  const all = companies
    .map((company) => toSummary(company, lastSignIn.get(company.id) ?? null, now))
    .sort((a, b) => (b.lastSignInAt?.getTime() ?? 0) - (a.lastSignInAt?.getTime() ?? 0));

  const counts = Object.fromEntries([["All", all.length], ...STANDINGS.map((s) => [s, 0])]) as WorkspaceList["counts"];
  for (const row of all) counts[row.standing.standing] += 1;

  return {
    rows: filter.standing ? all.filter((row) => row.standing.standing === filter.standing) : all,
    counts,
  };
}

/**
 * One workspace by its address, or null. The workspace context's only way in.
 * Read once per request: the layout, the page and its title all ask.
 */
export const findWorkspace = cache(async (slug: string): Promise<WorkspaceSummary | null> => {
  const company = await prisma.company.findUnique({ where: { slug }, select: WORKSPACE_FIELDS });
  if (!company) return null;
  const lastSignIn = await lastSignInByCompany([company.id]);
  return toSummary(company, lastSignIn.get(company.id) ?? null, new Date());
});

/** For the switcher: workspaces whose name or address starts with what was typed. */
export async function searchWorkspaces(q: string, take = 8) {
  const term = q.trim();
  return prisma.company.findMany({
    where: term
      ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { slug: { startsWith: term.toLowerCase() } }] }
      : {},
    select: { slug: true, name: true, product: true, workspaceProfile: true },
    orderBy: { name: "asc" },
    take,
  });
}
