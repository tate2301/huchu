import { Prisma, type RetailPromotionAudience, type RetailPromotionScope, type RetailPromotionType } from "@prisma/client";
import { z } from "zod";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TARGET_MARGIN } from "@/lib/reports/loaders/retail/price-lists";
import { marginOf, marginTone } from "@/lib/reports/margin";
import { auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { binState, type BinState } from "@/lib/retail/bin";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { centsOf, PRICE_FIGURE_MESSAGE } from "@/lib/retail/prices/figure";
import { harareMoment } from "@/lib/retail/pricing/engine";
import { categoriesUnder } from "@/lib/retail/pricing/snapshot";
import { addDays, dayKey, daysBetween, formatMoney, formatWhen } from "@/lib/workspace/format";

import {
  dayWords,
  ENDS_MESSAGE,
  harareDayStart,
  momentWords,
  NO_END,
  parsePromotionMoment,
  promotionBadge,
  promotionState,
  STARTS_MESSAGE,
  tomorrowStart,
  type PromotionBadge,
  type PromotionState,
} from "./state";
import {
  AUDIENCE_WORDS,
  appliesToWords,
  CODE_MESSAGE,
  CODE_PATTERN,
  codeFromName,
  daysWords,
  KIND_WORDS,
  STACKS_WORDS,
  unitWordOf,
  valueWords,
} from "./words";

/**
 * Promotions (W-17, PRD-09, 20-products 4.8): make one, change its rules,
 * pause, resume, end and duplicate them; and the figures its record and the
 * Promotions list read. The till applies them through the price engine
 * (`applyPromotions`); each discounted sale line keeps `promotionId` and
 * `promotionDiscount`, which every figure here is read from.
 */

type Tx = Prisma.TransactionClient;

export class PromotionRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "PromotionRefusal";
  }
}

const refuse = (field: string, message: string): never => {
  throw new PromotionRefusal(400, message, { [field]: message });
};

export const promotionInput = z.object({
  name: z.string().trim().min(1, "Name is needed.").max(120, "Keep the name to 120 characters."),
  kind: z.enum(["PERCENT", "AMOUNT", "BUY_X_PAY", "FIXED_PRICE"]),
  value: z.string().max(40),
  buyQuantity: z.coerce.number().int("Buy is a whole number.").optional().nullable(),
  appliesTo: z.enum(["EVERYTHING", "CATEGORIES", "PRODUCTS"]).default("EVERYTHING"),
  productIds: z.array(z.string().uuid("Pick one of this shop's products.")).max(500).optional(),
  categoryIds: z.array(z.string().uuid("Pick one of this shop's categories.")).max(100).optional(),
  starts: z.string().max(60),
  ends: z.string().max(60).optional().nullable(),
  audience: z.enum(["EVERYONE", "LOYALTY_MEMBERS", "STAFF"]).default("EVERYONE"),
  stacks: z.boolean().default(false),
  code: z.string().max(60).optional().nullable(),
});
export type PromotionInput = z.infer<typeof promotionInput>;

/** The edit sheet and the rail: any of the above, and the rules only the rail changes. */
export const promotionPatch = z
  .object({
    name: promotionInput.shape.name,
    kind: promotionInput.shape.kind,
    value: promotionInput.shape.value,
    buyQuantity: promotionInput.shape.buyQuantity,
    appliesTo: z.enum(["EVERYTHING", "CATEGORIES", "PRODUCTS"]),
    productIds: promotionInput.shape.productIds,
    categoryIds: promotionInput.shape.categoryIds,
    starts: promotionInput.shape.starts,
    ends: promotionInput.shape.ends,
    audience: z.enum(["EVERYONE", "LOYALTY_MEMBERS", "STAFF"]),
    stacks: z.boolean(),
    code: z.string().max(60),
    minBasket: z.string().max(40).nullable(),
    days: z.array(z.number().int().min(1).max(7)).max(7),
    siteId: z.string().uuid().nullable(),
  })
  .partial();
export type PromotionPatch = z.infer<typeof promotionPatch>;

export const promotionIdsInput = z.object({ ids: z.array(z.string().uuid()).min(1, "Tick at least one.").max(200) });

/* ── Checking what is asked ───────────────────────────────────────────── */

type Rules = {
  name: string;
  kind: RetailPromotionType;
  valueCents: number;
  buyQuantity: number | null;
  scope: RetailPromotionScope;
  productIds: string[];
  categoryIds: string[];
  startsAt: Date;
  endsAt: Date | null;
  audience: RetailPromotionAudience;
  stacks: boolean;
  code: string;
  minBasketCents: number | null;
  daysOfWeek: number[];
  siteId: string | null;
};

/** "10", "10%" or "10.5" as a percent; null when it is not one. */
function percentOf(text: string): number | null {
  const trimmed = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Every rule a promotion keeps (20-products 4.8), refused under the field it belongs to. */
async function check(tx: Tx, companyId: string, input: Omit<Rules, "valueCents" | "startsAt" | "endsAt" | "code" | "minBasketCents"> & {
  value: string;
  starts: string | Date;
  ends: string | Date | null;
  code: string | null;
  minBasket: string | null;
  self: string | null;
  now: Date;
}): Promise<Rules> {
  const name = input.name.trim();
  if (!name) refuse("name", "Name is needed.");

  let valueCents: number;
  if (input.kind === "PERCENT") {
    const percent = percentOf(input.value);
    if (percent === null) refuse("value", "Write the percent off, like 10.");
    if (percent! <= 0) refuse("value", "Take more than 0% off.");
    if (percent! > 90) refuse("value", "Take at most 90% off.");
    valueCents = Math.round(percent! * 100);
  } else {
    const cents = centsOf(input.value);
    if (cents === null) refuse("value", PRICE_FIGURE_MESSAGE);
    if (cents! <= 0) refuse("value", "Write more than 0.00.");
    valueCents = cents!;
  }

  let buyQuantity: number | null = null;
  if (input.kind === "BUY_X_PAY") {
    buyQuantity = input.buyQuantity ?? null;
    if (buyQuantity === null || buyQuantity < 2 || buyQuantity > 24) refuse("buyQuantity", "Buy is 2 to 24.");
  }

  const productIds = input.scope === "PRODUCTS" ? [...new Set(input.productIds)] : [];
  const categoryIds = input.scope === "CATEGORIES" ? [...new Set(input.categoryIds)] : [];
  if (input.scope === "PRODUCTS") {
    if (productIds.length === 0) refuse("productIds", "Pick the products it applies to.");
    const found = await tx.product.count({ where: { companyId, id: { in: productIds } } });
    if (found !== productIds.length) refuse("productIds", "Pick one of this shop's products.");
  }
  if (input.scope === "CATEGORIES") {
    if (categoryIds.length === 0) refuse("categoryIds", "Pick the categories it applies to.");
    const found = await tx.retailCategory.count({ where: { companyId, id: { in: categoryIds }, archivedAt: null } });
    if (found !== categoryIds.length) refuse("categoryIds", "Pick one of this shop's categories.");
  }

  const startsAt = input.starts instanceof Date ? input.starts : parsePromotionMoment(input.starts, input.now);
  if (!startsAt) refuse("starts", STARTS_MESSAGE);
  let endsAt: Date | null = null;
  if (input.ends instanceof Date) {
    endsAt = input.ends;
  } else {
    const typed = (input.ends ?? "").trim();
    if (typed && typed.toLowerCase() !== NO_END.toLowerCase()) {
      // A day alone (the rail's date picker) ends at the close of that day.
      endsAt = parsePromotionMoment(/^\d{4}-\d{2}-\d{2}$/.test(typed) ? `${typed}T23:59` : typed, input.now);
      if (!endsAt) refuse("ends", ENDS_MESSAGE);
    }
  }
  if (endsAt && endsAt.getTime() <= startsAt!.getTime()) refuse("ends", "It ends before it starts.");

  let minBasketCents: number | null = null;
  if (input.minBasket !== null && input.minBasket.trim() && input.minBasket.trim().toLowerCase() !== "any size") {
    minBasketCents = centsOf(input.minBasket);
    if (minBasketCents === null) refuse("minBasket", PRICE_FIGURE_MESSAGE);
    if (minBasketCents! <= 0) minBasketCents = null;
  }

  const code = (input.code?.trim() || codeFromName(name)).toUpperCase();
  if (!CODE_PATTERN.test(code)) refuse("code", CODE_MESSAGE);
  const taken = await tx.retailPromotion.findFirst({
    where: { companyId, promoCode: code, ...(input.self ? { id: { not: input.self } } : {}) },
    select: { id: true },
  });
  if (taken) refuse("code", `There is already a promotion called ${code}.`);

  if (input.siteId) {
    const site = await tx.site.findFirst({ where: { id: input.siteId, companyId, isActive: true }, select: { id: true } });
    if (!site) refuse("siteId", "Choose one of your open sites.");
  }

  return {
    name,
    kind: input.kind,
    valueCents,
    buyQuantity,
    scope: input.scope,
    productIds,
    categoryIds,
    startsAt: startsAt!,
    endsAt,
    audience: input.audience,
    stacks: input.stacks,
    code,
    minBasketCents,
    daysOfWeek: [...new Set(input.daysOfWeek)].sort(),
    siteId: input.siteId,
  };
}

const money2 = (cents: number) => new Prisma.Decimal(cents).dividedBy(100);
const valueOf = (rules: Pick<Rules, "valueCents">) => money2(rules.valueCents);

/* ── Making one ───────────────────────────────────────────────────────── */

/** "Month-end two for US$5 ciders starts 25 October." or "… is running now." */
export const madeWords = (name: string, startsAt: Date, now: Date) =>
  startsAt.getTime() > now.getTime() ? `${name} starts ${dayWords(startsAt)}.` : `${name} is running now.`;

export async function createPromotion(
  actor: RetailAuditActor,
  input: PromotionInput,
  now: Date = new Date(),
): Promise<{ id: string; message: string }> {
  const { companyId } = actor;
  const made = await prisma.$transaction(async (tx) => {
    const rules = await check(tx, companyId, {
      name: input.name,
      kind: input.kind,
      value: input.value,
      buyQuantity: input.buyQuantity ?? null,
      scope: input.appliesTo,
      productIds: input.productIds ?? [],
      categoryIds: input.categoryIds ?? [],
      starts: input.starts,
      ends: input.ends ?? null,
      audience: input.audience,
      stacks: input.stacks,
      code: input.code ?? null,
      minBasket: null,
      daysOfWeek: [],
      siteId: null,
      self: null,
      now,
    });
    if (rules.endsAt && rules.endsAt.getTime() <= now.getTime()) refuse("ends", "That has passed. Choose when it ends.");
    const promotion = await tx.retailPromotion.create({
      data: {
        companyId,
        promoCode: rules.code,
        name: rules.name,
        type: rules.kind,
        value: valueOf(rules),
        buyQuantity: rules.buyQuantity,
        scope: rules.scope,
        audience: rules.audience,
        stacks: rules.stacks,
        startsAt: rules.startsAt,
        endsAt: rules.endsAt,
        createdById: actor.userId,
        products: { create: rules.productIds.map((productId) => ({ productId })) },
        categories: { create: rules.categoryIds.map((categoryId) => ({ categoryId })) },
      },
      select: { id: true },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.promotionCreated,
      entityType: "RetailPromotion",
      entityId: promotion.id,
      payload: { code: rules.code, name: rules.name, ...(rules.startsAt.getTime() > now.getTime() ? { from: formatWhen(rules.startsAt) } : {}) },
    });
    return { id: promotion.id, rules };
  });
  return { id: made.id, message: madeWords(made.rules.name, made.rules.startsAt, now) };
}

/* ── Changing one ─────────────────────────────────────────────────────── */

const LABELS = {
  name: "Name",
  kind: "Kind",
  value: "Value",
  buyQuantity: "Buy",
  appliesTo: "Applies to",
  starts: "Starts",
  ends: "Ends",
  audience: "Customers",
  stacks: "Stacks",
  code: "Code",
  minBasket: "Basket",
  days: "Days",
  siteId: "Sites",
} as const;

const promotionSelect = {
  id: true,
  promoCode: true,
  name: true,
  type: true,
  value: true,
  buyQuantity: true,
  scope: true,
  minBasket: true,
  daysOfWeek: true,
  fromTime: true,
  toTime: true,
  audience: true,
  stacks: true,
  siteId: true,
  startsAt: true,
  endsAt: true,
  pausedAt: true,
  endedAt: true,
  archivedAt: true,
  createdAt: true,
  site: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  products: { select: { productId: true, product: { select: { name: true } } } },
  categories: { select: { categoryId: true, category: { select: { name: true } } } },
} satisfies Prisma.RetailPromotionSelect;

type PromotionRow = Prisma.RetailPromotionGetPayload<{ select: typeof promotionSelect }>;

/** A rule's value as the sheet shows it: "10" for a percent, "2.00" for money. */
const valueText = (kind: RetailPromotionType, value: Prisma.Decimal) =>
  kind === "PERCENT" ? String(Number(value.toFixed(2))) : value.toFixed(2);

export async function updatePromotion(
  actor: RetailAuditActor,
  id: string,
  patch: PromotionPatch,
  now: Date = new Date(),
): Promise<{ changed: number; name: string; message: string }> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const row = await tx.retailPromotion.findFirst({ where: { id, companyId }, select: promotionSelect });
    if (!row || row.archivedAt) throw new PromotionRefusal(404, "Promotion not found");
    const state = promotionState(row, now);
    if (state === "ENDED") throw new PromotionRefusal(409, "It has ended. Duplicate it to run it again.");
    const started = row.startsAt.getTime() <= now.getTime();
    if (started && patch.starts !== undefined) throw new PromotionRefusal(409, "It has already started. Change when it ends instead.");
    if (started && patch.kind !== undefined && patch.kind !== row.type) {
      throw new PromotionRefusal(400, "A running promotion keeps its kind.", { kind: "A running promotion keeps its kind." });
    }

    const rules = await check(tx, companyId, {
      name: patch.name ?? row.name,
      kind: patch.kind ?? row.type,
      value: patch.value ?? valueText(row.type, row.value),
      buyQuantity: patch.buyQuantity !== undefined ? patch.buyQuantity : row.buyQuantity,
      scope: patch.appliesTo ?? row.scope,
      productIds: patch.productIds ?? row.products.map((entry) => entry.productId),
      categoryIds: patch.categoryIds ?? row.categories.map((entry) => entry.categoryId),
      starts: patch.starts ?? row.startsAt,
      ends: patch.ends !== undefined ? patch.ends : row.endsAt,
      audience: patch.audience ?? row.audience,
      stacks: patch.stacks ?? row.stacks,
      code: patch.code ?? row.promoCode,
      minBasket: patch.minBasket !== undefined ? patch.minBasket : row.minBasket === null ? null : row.minBasket.toFixed(2),
      daysOfWeek: patch.days ?? row.daysOfWeek,
      siteId: patch.siteId !== undefined ? patch.siteId : row.siteId,
      self: id,
      now,
    });
    if (patch.ends !== undefined && rules.endsAt && rules.endsAt.getTime() <= now.getTime()) {
      refuse("ends", "That has passed. End it now instead.");
    }

    const changes: Array<{ field: keyof typeof LABELS; from: string | null; to: string | null }> = [];
    const data: Prisma.RetailPromotionUncheckedUpdateInput = {};
    const note = <K extends keyof typeof LABELS>(field: K, from: string | null, to: string | null) => {
      if (from !== to) changes.push({ field, from, to });
      return from !== to;
    };
    if (note("name", row.name, rules.name)) data.name = rules.name;
    if (note("kind", KIND_WORDS[row.type], KIND_WORDS[rules.kind])) data.type = rules.kind;
    const before = valueWords(row.type, toNumberOrZero(row.value), row.buyQuantity);
    const after = valueWords(rules.kind, rules.valueCents / 100, rules.buyQuantity);
    if (note("value", before, after)) {
      data.value = valueOf(rules);
      data.buyQuantity = rules.buyQuantity;
    }
    const scopeWords = (scope: RetailPromotionScope, products: string[], categories: string[]) =>
      `${scope}:${[...products].sort().join(",")}:${[...categories].sort().join(",")}`;
    const scopeChanged =
      scopeWords(row.scope, row.products.map((entry) => entry.productId), row.categories.map((entry) => entry.categoryId)) !==
      scopeWords(rules.scope, rules.productIds, rules.categoryIds);
    if (scopeChanged) {
      data.scope = rules.scope;
      changes.push({ field: "appliesTo", from: row.scope, to: rules.scope });
    }
    if (note("starts", momentWords(row.startsAt, true), momentWords(rules.startsAt, true))) data.startsAt = rules.startsAt;
    if (note("ends", row.endsAt ? momentWords(row.endsAt, true) : NO_END, rules.endsAt ? momentWords(rules.endsAt, true) : NO_END)) data.endsAt = rules.endsAt;
    if (note("audience", AUDIENCE_WORDS[row.audience], AUDIENCE_WORDS[rules.audience])) data.audience = rules.audience;
    if (note("stacks", row.stacks ? STACKS_WORDS.yes : STACKS_WORDS.no, rules.stacks ? STACKS_WORDS.yes : STACKS_WORDS.no)) data.stacks = rules.stacks;
    if (note("code", row.promoCode, rules.code)) data.promoCode = rules.code;
    const basket = (cents: number | null) => (cents === null ? "Any size" : formatMoney(cents / 100));
    if (note("minBasket", basket(row.minBasket === null ? null : Math.round(toNumberOrZero(row.minBasket) * 100)), basket(rules.minBasketCents))) {
      data.minBasket = rules.minBasketCents === null ? null : money2(rules.minBasketCents);
    }
    if (note("days", daysWords(row.daysOfWeek, row.fromTime, row.toTime), daysWords(rules.daysOfWeek, row.fromTime, row.toTime))) {
      data.daysOfWeek = rules.daysOfWeek;
    }
    if (rules.siteId !== row.siteId) {
      const site = rules.siteId ? await tx.site.findFirst({ where: { id: rules.siteId }, select: { name: true } }) : null;
      changes.push({ field: "siteId", from: row.site?.name ?? "All sites", to: site?.name ?? "All sites" });
      data.siteId = rules.siteId;
    }
    if (changes.length === 0) return { changed: 0, name: row.name, message: "Promotion saved." };

    await tx.retailPromotion.update({ where: { id }, data });
    if (scopeChanged) {
      await tx.retailPromotionProduct.deleteMany({ where: { promotionId: id } });
      await tx.retailPromotionCategory.deleteMany({ where: { promotionId: id } });
      if (rules.productIds.length) await tx.retailPromotionProduct.createMany({ data: rules.productIds.map((productId) => ({ promotionId: id, productId })) });
      if (rules.categoryIds.length) await tx.retailPromotionCategory.createMany({ data: rules.categoryIds.map((categoryId) => ({ promotionId: id, categoryId })) });
    }
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.promotionChanged,
      entityType: "RetailPromotion",
      entityId: id,
      payload: { name: rules.name, changes: changes.map((change) => ({ ...change, label: LABELS[change.field] })) },
    });
    for (const change of changes) {
      await auditRecordEdited(tx, {
        actor,
        entityType: "RetailPromotion",
        entityId: id,
        field: change.field,
        label: LABELS[change.field],
        from: change.from,
        to: change.to,
      });
    }
    return { changed: changes.length, name: rules.name, message: "Promotion saved." };
  });
}

/* ── Pause, resume, end, duplicate ────────────────────────────────────── */

type Move = "pause" | "resume" | "end";

/** Pause (Running or Scheduled), resume (Paused) or end now (anything not ended). Others are left as they are. */
export async function movePromotions(actor: RetailAuditActor, ids: string[], move: Move, now: Date = new Date()): Promise<number> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.retailPromotion.findMany({
      where: { companyId, id: { in: ids }, archivedAt: null },
      select: { id: true, name: true, startsAt: true, endsAt: true, pausedAt: true, endedAt: true },
    });
    let changed = 0;
    for (const row of rows) {
      const state = promotionState(row, now);
      const data: Prisma.RetailPromotionUpdateInput =
        move === "pause" && (state === "RUNNING" || state === "SCHEDULED")
          ? { pausedAt: now }
          : move === "resume" && state === "PAUSED"
            ? { pausedAt: null }
            : move === "end" && state !== "ENDED"
              ? { endedAt: now }
              : {};
      if (Object.keys(data).length === 0) continue;
      await tx.retailPromotion.update({ where: { id: row.id }, data });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType:
          move === "pause"
            ? RETAIL_AUDIT_EVENTS.promotionPaused
            : move === "resume"
              ? RETAIL_AUDIT_EVENTS.promotionResumed
              : RETAIL_AUDIT_EVENTS.promotionEnded,
        entityType: "RetailPromotion",
        entityId: row.id,
        payload: { name: row.name },
      });
      changed += 1;
    }
    return changed;
  });
}

/** A free code from "<CODE>-2" up, at most 30 long. */
async function freeCode(tx: Tx, companyId: string, code: string): Promise<string> {
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${code.slice(0, 30 - suffix.length)}${suffix}`;
    if (!(await tx.retailPromotion.findFirst({ where: { companyId, promoCode: candidate }, select: { id: true } }))) return candidate;
  }
  throw new PromotionRefusal(409, "No free code is left for a copy of it.");
}

/** "<name> (copy)", code "<CODE>-2", the same rules, starting tomorrow at 00:00 with no end. */
export async function duplicatePromotions(
  actor: RetailAuditActor,
  ids: string[],
  now: Date = new Date(),
): Promise<Array<{ id: string; name: string }>> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.retailPromotion.findMany({
      where: { companyId, id: { in: ids }, archivedAt: null },
      orderBy: { promoCode: "asc" },
      include: { products: true, categories: true },
    });
    const created: Array<{ id: string; name: string }> = [];
    const startsAt = tomorrowStart(now);
    for (const row of rows) {
      const code = await freeCode(tx, companyId, row.promoCode);
      const name = `${row.name} (copy)`.slice(0, 120);
      const copy = await tx.retailPromotion.create({
        data: {
          companyId,
          promoCode: code,
          name,
          type: row.type,
          value: row.value,
          buyQuantity: row.buyQuantity,
          scope: row.scope,
          minBasket: row.minBasket,
          daysOfWeek: row.daysOfWeek,
          fromTime: row.fromTime,
          toTime: row.toTime,
          audience: row.audience,
          stacks: row.stacks,
          siteId: row.siteId,
          startsAt,
          endsAt: null,
          createdById: actor.userId,
          products: { create: row.products.map((entry) => ({ productId: entry.productId })) },
          categories: { create: row.categories.map((entry) => ({ categoryId: entry.categoryId })) },
        },
        select: { id: true },
      });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.promotionCreated,
        entityType: "RetailPromotion",
        entityId: copy.id,
        payload: { code, name, from: formatWhen(startsAt), copyOf: row.promoCode },
      });
      created.push({ id: copy.id, name });
    }
    return created;
  });
}

/* ── What it applies to, and what it did ──────────────────────────────── */

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The products each promotion covers: its own; or the live ones in its categories and those under them; or every live one. */
async function scopeProducts(companyId: string, rows: PromotionRow[]): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const out = new Map<string, Array<{ id: string; name: string }>>();
  const needLive = rows.some((row) => row.scope !== "PRODUCTS");
  const live = needLive
    ? await prisma.product.findMany({
        where: { companyId, archivedAt: null, isActive: true, packOfId: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, categoryId: true },
      })
    : [];
  const under = rows.some((row) => row.scope === "CATEGORIES") ? await categoriesUnder(companyId) : new Map<string, string[]>();
  for (const row of rows) {
    if (row.scope === "PRODUCTS") {
      out.set(
        row.id,
        row.products.map((entry) => ({ id: entry.productId, name: entry.product.name })).sort((a, b) => a.name.localeCompare(b.name)),
      );
    } else if (row.scope === "CATEGORIES") {
      const ids = new Set(row.categories.flatMap((entry) => under.get(entry.categoryId) ?? [entry.categoryId]));
      out.set(
        row.id,
        live.filter((product) => product.categoryId && ids.has(product.categoryId)).map((product) => ({ id: product.id, name: product.name })),
      );
    } else {
      out.set(row.id, live.map((product) => ({ id: product.id, name: product.name })));
    }
  }
  return out;
}

/** Units, given away and takings under each promotion, per product, from its posted sales' lines. */
async function underLines(companyId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await prisma.retailSaleLine.groupBy({
    by: ["promotionId", "productId"],
    where: { companyId, promotionId: { in: ids }, sale: { status: "POSTED", saleType: "SALE" } },
    _sum: { quantity: true, promotionDiscount: true, lineTotal: true },
  });
  return rows.map((row) => ({
    promotionId: row.promotionId!,
    productId: row.productId,
    units: toNumberOrZero(row._sum.quantity),
    given: toNumberOrZero(row._sum.promotionDiscount),
    takings: toNumberOrZero(row._sum.lineTotal),
  }));
}

/** Units and takings of these products in a stretch of time, from posted sales. */
async function soldBetween(companyId: string, productIds: string[] | null, from: Date, to: Date) {
  if (to.getTime() <= from.getTime() || (productIds && productIds.length === 0)) return { units: 0, takings: 0 };
  const sum = await prisma.retailSaleLine.aggregate({
    where: {
      companyId,
      ...(productIds ? { productId: { in: productIds } } : {}),
      sale: { status: "POSTED", saleType: "SALE", postedAt: { gte: from, lt: to } },
    },
    _sum: { quantity: true, lineTotal: true },
  });
  return { units: toNumberOrZero(sum._sum.quantity), takings: toNumberOrZero(sum._sum.lineTotal) };
}

export type PromotionFigures = {
  soldUnder: number;
  soldBefore: number;
  /** Sold under it against the same days before it started, as a percentage; null with nothing before. */
  soldChange: number | null;
  extraTakings: number;
  givenAway: number;
  perDollarGiven: number | null;
  /** What it gave away on each unit: its amount, or given away ÷ units. */
  givenEach: number | null;
  products: number;
  notSold: number;
  runningDays: number;
  startsInDays: number;
};

/** The moment it stopped running, or now. */
const runEnd = (row: Pick<PromotionRow, "endedAt" | "endsAt">, now: Date) =>
  new Date(Math.min(now.getTime(), row.endedAt?.getTime() ?? Infinity, row.endsAt?.getTime() ?? Infinity));

/* ── The view ─────────────────────────────────────────────────────────── */

export type PromotionView = {
  id: string;
  code: string;
  name: string;
  kind: RetailPromotionType;
  kindLabel: string;
  value: number;
  valueLabel: string;
  buyQuantity: number | null;
  scope: RetailPromotionScope;
  products: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  appliesToLabel: string;
  appliesToShort: string;
  /** The word for one of its units ("bottle"), when its products share one. */
  unitWord: string | null;
  minBasket: number | null;
  daysOfWeek: number[];
  days: string;
  audience: RetailPromotionAudience;
  stacks: boolean;
  site: { id: string; name: string } | null;
  startsAt: string;
  endsAt: string | null;
  pausedAt: string | null;
  endedAt: string | null;
  state: PromotionState;
  badge: PromotionBadge;
  figures: PromotionFigures;
  createdBy: string | null;
  archivedAt: string | null;
  bin: BinState | null;
  tabCounts: { products: number; sales: number; activity: number };
};

export async function loadPromotionViews(
  companyId: string,
  where: { ids?: string[]; includeBinned?: boolean; full?: boolean } = {},
  now: Date = new Date(),
): Promise<PromotionView[]> {
  const rows = await prisma.retailPromotion.findMany({
    where: { companyId, ...(where.ids ? { id: { in: where.ids } } : {}), ...(where.includeBinned ? {} : { archivedAt: null }) },
    orderBy: { startsAt: "desc" },
    select: promotionSelect,
  });
  if (rows.length === 0) return [];
  const [scopes, lines] = await Promise.all([scopeProducts(companyId, rows), underLines(companyId, rows.map((row) => row.id))]);
  const one = where.ids?.length === 1 ? where.ids[0]! : null;
  const [activity, saleCount] = one
    ? await Promise.all([
        prisma.platformAuditEvent.count({ where: { companyId, entityType: "RetailPromotion", entityId: one } }),
        prisma.retailSaleLine.count({ where: { companyId, promotionId: one, sale: { status: "POSTED", saleType: "SALE" } } }),
      ])
    : [0, 0];

  const views: PromotionView[] = [];
  for (const row of rows) {
    const products = scopes.get(row.id) ?? [];
    const own = lines.filter((line) => line.promotionId === row.id);
    const soldUnder = round2(own.reduce((sum, line) => sum + line.units, 0));
    const givenAway = round2(own.reduce((sum, line) => sum + line.given, 0));
    const soldIds = new Set(own.filter((line) => line.units > 0).map((line) => line.productId));
    const state = promotionState(row, now);
    const started = row.startsAt.getTime() <= now.getTime();
    const end = runEnd(row, now);
    const length = started ? Math.max(0, end.getTime() - row.startsAt.getTime()) : 0;
    let soldBefore = 0;
    let extraTakings = 0;
    if (where.full && started) {
      const ids = row.scope === "EVERYTHING" ? null : products.map((product) => product.id);
      const [during, before] = await Promise.all([
        soldBetween(companyId, ids, row.startsAt, end),
        soldBetween(companyId, ids, new Date(row.startsAt.getTime() - length), row.startsAt),
      ]);
      soldBefore = round2(before.units);
      extraTakings = round2(during.takings - before.takings);
    }
    const value = toNumberOrZero(row.value);
    const unitWord = unitWordOf(products.map((product) => product.name));
    const categories = row.categories.map((entry) => ({ id: entry.categoryId, name: entry.category.name }));
    const minBasket = row.minBasket === null ? null : toNumberOrZero(row.minBasket);
    const appliesTo = { scope: row.scope, audience: row.audience, minBasket, categories: categories.map((category) => category.name), products: products.length };
    const today = dayKey(now);
    views.push({
      id: row.id,
      code: row.promoCode,
      name: row.name,
      kind: row.type,
      kindLabel: KIND_WORDS[row.type],
      value,
      valueLabel: valueWords(row.type, value, row.buyQuantity),
      buyQuantity: row.buyQuantity,
      scope: row.scope,
      products,
      categories,
      appliesToLabel: appliesToWords({ ...appliesTo, long: true }),
      appliesToShort: appliesToWords(appliesTo),
      unitWord,
      minBasket,
      daysOfWeek: row.daysOfWeek,
      days: daysWords(row.daysOfWeek, row.fromTime, row.toTime),
      audience: row.audience,
      stacks: row.stacks,
      site: row.site,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      pausedAt: row.pausedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      state,
      badge: promotionBadge(row, now),
      figures: {
        soldUnder,
        soldBefore,
        soldChange: soldBefore > 0 ? Math.round(((soldUnder - soldBefore) / soldBefore) * 100) : null,
        extraTakings,
        givenAway,
        perDollarGiven: givenAway > 0 ? round2(extraTakings / givenAway) : null,
        givenEach: row.type === "AMOUNT" ? value : soldUnder > 0 ? round2(givenAway / soldUnder) : null,
        products: products.length,
        notSold: products.filter((product) => !soldIds.has(product.id)).length,
        runningDays: started ? daysBetween(dayKey(row.startsAt), dayKey(end)) : 0,
        startsInDays: started ? 0 : Math.max(1, daysBetween(today, dayKey(row.startsAt)) - 1),
      },
      createdBy: row.createdBy?.name ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      bin: null,
      tabCounts: { products: products.length, sales: saleCount, activity },
    });
  }
  return views;
}

export async function loadPromotionView(companyId: string, id: string, now: Date = new Date()): Promise<PromotionView | null> {
  const [view] = await loadPromotionViews(companyId, { ids: [id], includeBinned: true, full: true }, now);
  if (!view) return null;
  return { ...view, bin: await binState(companyId, "RetailPromotion", id, view.archivedAt) };
}

/** Each product it covers: its normal price, its price on the promotion, what sold under it, and its margin now. */
export type PromotionProductRow = {
  productId: string;
  name: string;
  normal: number | null;
  onPromotion: number | null;
  sold: number;
  givenAway: number;
  /** Null for a role that may not see cost. */
  margin: number | null;
  marginTone: "warn" | "bad" | null;
  cost: number | null;
};

export async function promotionProductRows(companyId: string, id: string, role: string | null): Promise<PromotionProductRow[] | null> {
  const [view] = await loadPromotionViews(companyId, { ids: [id], includeBinned: true });
  if (!view) return null;
  // What it covers, and anything that sold under it since leaving its scope (archived, moved to another category).
  const lines = await underLines(companyId, [id]);
  const inScope = new Set(view.products.map((product) => product.id));
  const strays = [...new Set(lines.map((line) => line.productId).filter((productId): productId is string => Boolean(productId) && !inScope.has(productId!)))];
  const strayRows = strays.length
    ? await prisma.product.findMany({ where: { companyId, id: { in: strays } }, select: { id: true, name: true } })
    : [];
  const products = [...view.products, ...strayRows];
  const ids = products.map((product) => product.id);
  const seeCost = canRetailRoleDo(role, "retail.catalog", "view-cost");
  const [prices, details] = await Promise.all([
    prisma.productPrice.findMany({
      where: { companyId, productId: { in: ids }, minQuantity: 1, priceList: { isDefault: true, archivedAt: null } },
      select: { productId: true, unitPrice: true },
    }),
    prisma.product.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, costPrice: true, retailCategory: { select: { targetMarginPercent: true } } },
    }),
  ]);
  const priceOf = new Map(prices.map((row) => [row.productId, toNumberOrZero(row.unitPrice)]));
  const detailOf = new Map(details.map((row) => [row.id, row]));
  return products.map((product) => {
    const normal = priceOf.get(product.id) ?? null;
    const onPromotion = normal === null ? null : promotionPrice(view.kind, view.value, view.buyQuantity, normal);
    const detail = detailOf.get(product.id);
    const cost = seeCost && detail?.costPrice ? toNumberOrZero(detail.costPrice) : null;
    const margin = marginOf(onPromotion, cost);
    const target = detail?.retailCategory?.targetMarginPercent ? toNumberOrZero(detail.retailCategory.targetMarginPercent) : DEFAULT_TARGET_MARGIN;
    const own = lines.filter((line) => line.productId === product.id);
    return {
      productId: product.id,
      name: product.name,
      normal,
      onPromotion,
      sold: round2(own.reduce((sum, line) => sum + line.units, 0)),
      givenAway: round2(own.reduce((sum, line) => sum + line.given, 0)),
      margin: seeCost ? margin : null,
      marginTone: seeCost ? marginTone(margin, target, cost !== null && onPromotion !== null && onPromotion < cost) : null,
      cost,
    };
  });
}

/** One unit's price under it: a percent or an amount off, the fixed price when lower, or the "For" over Buy. */
export function promotionPrice(kind: RetailPromotionType, value: number, buyQuantity: number | null, normal: number): number {
  switch (kind) {
    case "PERCENT":
      return round2(normal * (1 - value / 100));
    case "AMOUNT":
      return round2(Math.max(0, normal - value));
    case "FIXED_PRICE":
      return round2(Math.min(normal, value));
    case "BUY_X_PAY":
      return round2(Math.min(normal, value / (buyQuantity ?? 2)));
  }
}

/** Units of its products sold per week, Monday to Sunday on Harare's clock, and whether it ran that week. */
export async function promotionChart(
  companyId: string,
  id: string,
  range: "3m" | "12m" | "all",
  now: Date = new Date(),
): Promise<{ weeks: Array<{ start: string; units: number; onPromotion: boolean }> } | null> {
  const row = await prisma.retailPromotion.findFirst({ where: { id, companyId }, select: promotionSelect });
  if (!row) return null;
  const products = (await scopeProducts(companyId, [row])).get(row.id) ?? [];
  const today = harareMoment(now);
  const monday = addDays(today.day, -(today.weekday - 1));
  const count = range === "3m" ? 13 : range === "12m" ? 52 : 156;
  const first = addDays(monday, -(count - 1) * 7);
  const lines = await prisma.retailSaleLine.findMany({
    where: {
      companyId,
      ...(row.scope === "EVERYTHING" ? {} : { productId: { in: products.map((product) => product.id) } }),
      sale: { status: "POSTED", saleType: "SALE", postedAt: { gte: harareDayStart(first) } },
    },
    select: { quantity: true, sale: { select: { postedAt: true } } },
  });
  const weeks = Array.from({ length: count }, (_, index) => ({ start: addDays(first, index * 7), units: 0, onPromotion: false }));
  for (const line of lines) {
    const day = dayKey(line.sale.postedAt!);
    const index = Math.floor((daysBetween(first, day) - 1) / 7);
    if (index >= 0 && index < weeks.length) weeks[index]!.units += toNumberOrZero(line.quantity);
  }
  const startDay = dayKey(row.startsAt);
  const endDay = dayKey(runEnd(row, now));
  const started = row.startsAt.getTime() <= now.getTime();
  for (const week of weeks) {
    const last = addDays(week.start, 6);
    week.units = round2(week.units);
    week.onPromotion = started && last >= startDay && week.start <= endDay;
  }
  // From the first week anything sold: a record of a new shop does not open on a year of empty bars.
  const firstSold = weeks.findIndex((week) => week.units > 0 || week.onPromotion);
  return { weeks: firstSold > 0 ? weeks.slice(firstSold) : weeks };
}

/** The ids of the products it covers (Products' "All 12 products" link and its labels). */
export async function promotionProductIds(companyId: string, id: string): Promise<string[]> {
  const row = await prisma.retailPromotion.findFirst({ where: { id, companyId }, select: promotionSelect });
  if (!row) return [];
  return ((await scopeProducts(companyId, [row])).get(id) ?? []).map((product) => product.id);
}


