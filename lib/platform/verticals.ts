import type { Prisma, UserRole, Vertical } from "@prisma/client";

import type { VerticalProductId } from "@/lib/workspace-products";

/**
 * Verticals and what they cost.
 *
 * A workspace pays for each line of business it runs: one vertical is $39 a
 * month while the workspace has up to five members, and $99 once it has more.
 * Every vertical is charged at the same rate, so two verticals are twice
 * either figure. Features, add-ons and bundles are switched on and off within
 * that; they carry no charge of their own.
 */

export const VERTICAL_RATE = {
  /** Members a workspace has before its verticals step up. */
  includedMembers: 5,
  /** A vertical's monthly charge up to `includedMembers`. */
  small: 39,
  /** A vertical's monthly charge once a workspace has more. */
  large: 99,
  currency: "USD",
} as const;

export type VerticalDefinition = {
  label: string;
  /** The product bundle in `lib/workspace-products.ts` that lays its navigation out. */
  productBundleId: VerticalProductId;
  /** The client template whose bundles and features turn the vertical on (`lib/platform/client-templates.ts`). */
  templateCode: string;
};

export const VERTICALS: Record<Vertical, VerticalDefinition> = {
  GOLD: { label: "Gold operations", productBundleId: "gold-operations", templateCode: "TEMPLATE_GOLD_MINE" },
  SCHOOLS: { label: "Schools", productBundleId: "school-operations", templateCode: "TEMPLATE_SCHOOLS" },
  RETAIL: { label: "Retail", productBundleId: "retail-operations", templateCode: "TEMPLATE_RETAIL" },
  CRM: { label: "Sales and CRM", productBundleId: "crm-sales", templateCode: "TEMPLATE_CRM" },
  WORKSHOP: { label: "Service workshop", productBundleId: "service-workshop", templateCode: "TEMPLATE_TECH_WORKSHOP" },
  PAYROLL: { label: "Payroll services", productBundleId: "payroll-services", templateCode: "TEMPLATE_PAYROLL_BUREAU" },
  GENERAL: { label: "General business", productBundleId: "general-business", templateCode: "TEMPLATE_CORE_STARTER" },
};

export const VERTICAL_ORDER: readonly Vertical[] = ["GOLD", "SCHOOLS", "RETAIL", "CRM", "WORKSHOP", "PAYROLL", "GENERAL"];

/**
 * Who counts as a member for the price: everyone with access to the workspace,
 * except the parents' and students' portal accounts a school hands out.
 */
export const UNBILLED_ROLES: readonly UserRole[] = ["PARENT", "STUDENT"];

/** A billed member, in any workspace. */
export const BILLED_MEMBER = { isActive: true, role: { notIn: [...UNBILLED_ROLES] } } satisfies Prisma.UserWhereInput;

export function billedMemberWhere(companyId: string): Prisma.UserWhereInput {
  return { companyId, ...BILLED_MEMBER };
}

/** One vertical's monthly charge for a workspace of this many members. */
export function verticalRate(members: number): number {
  return members > VERTICAL_RATE.includedMembers ? VERTICAL_RATE.large : VERTICAL_RATE.small;
}

export type VerticalCharge = {
  /** Each vertical's charge at this member count. */
  each: number;
  verticals: number;
  members: number;
  /** Over the included members: every vertical is at the larger rate. */
  over: boolean;
  total: number;
  currency: string;
};

/** What a workspace pays a month: its verticals at the rate its member count sets. */
export function verticalCharge(verticals: number, members: number): VerticalCharge {
  const each = verticalRate(members);
  return {
    each,
    verticals,
    members,
    over: members > VERTICAL_RATE.includedMembers,
    total: each * verticals,
    currency: VERTICAL_RATE.currency,
  };
}

export type VerticalLine = {
  vertical: Vertical;
  label: string;
  /** "Retail, 6 members". */
  detail: string;
  amount: number;
};

export type VerticalPrice = VerticalCharge & {
  /** One line per vertical, in the catalogue's order. */
  lines: VerticalLine[];
  /** What the workspace would pay a month with one more vertical. */
  withOneMore: number;
  /** Why each vertical costs what it does, in a sentence. */
  why: string;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Why a workspace of this many members pays this rate for each vertical. */
export function rateReason(members: number): string {
  const each = verticalRate(members);
  const counted = plural(members, "member", "members");
  return members > VERTICAL_RATE.includedMembers
    ? `${counted}, over the ${VERTICAL_RATE.includedMembers} included, so each vertical is $${each}.`
    : `${counted}, within the ${VERTICAL_RATE.includedMembers} included, so each vertical is $${each}.`;
}

/** A workspace's monthly price, line by line: its verticals at the rate its member count sets. */
export function priceVerticals(held: readonly Vertical[], members: number): VerticalPrice {
  const verticals = VERTICAL_ORDER.filter((vertical) => held.includes(vertical));
  const charge = verticalCharge(verticals.length, members);
  return {
    ...charge,
    lines: verticals.map((vertical) => ({
      vertical,
      label: VERTICALS[vertical].label,
      detail: `${VERTICALS[vertical].label}, ${plural(members, "member", "members")}`,
      amount: charge.each,
    })),
    withOneMore: verticalCharge(verticals.length + 1, members).total,
    why: rateReason(members),
  };
}
