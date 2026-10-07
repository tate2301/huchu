import type { AccountType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canSeeRetailCostPrice } from "@/lib/retail/permission-matrix";
import { AccountAddRefused, accountOption, addPostingAccount, postableAccounts } from "@/lib/retail/posting-settings";
import { TYPE_WORDS } from "@/lib/retail/posting-words";
import { PriceListCopyRefusal, copyPriceList } from "@/lib/retail/price-list-copy";
import { suggestSiteCode } from "@/lib/retail/site-words";
import { SiteRefusal, createSite, priceListOptions, siteInput } from "@/lib/retail/sites";

import { LookupFieldErrors, type LookupCtx, type LookupNoun } from "./types";

/**
 * Setup's nouns (10-setup 4.2, C-28): `site`, with its inline add (Name and
 * Address, the rest at their defaults), and `price-list`, whose inline add
 * copies another list.
 */

const actorOf = (ctx: LookupCtx) => ({
  companyId: ctx.companyId,
  userId: ctx.userId,
  userName: ctx.userName,
  userRole: ctx.session.user?.role ?? null,
});

/**
 * Open sites, the default first with the sub "Default". Read by anyone who
 * picks a site in a form: Sites itself, stock, products and tills.
 * `context.exclude` leaves one site out (the other end of a transfer).
 * `context.allSites` puts "All sites" first (`ALL_SITES_ID`, sent as no site).
 */
/** The "All sites" option's id: a field that holds it sends `null`. */
export const ALL_SITES_ID = "all";

const site: LookupNoun = {
  noun: "site",
  read: [
    ["retail.sites", "view"],
    ["retail.stock", "view"],
    ["retail.catalog", "create"],
    ["retail.transfers", "create"],
    ["retail.tills", "view"],
    // A price list's Where (New price list, Edit the rules).
    ["retail.prices", "create"],
  ],
  create: ["retail.sites", "create"],
  quick: [
    { key: "name", label: "Name", placeholder: "" },
    { key: "address", label: "Address", placeholder: "Shop 7, Avondale Shopping Centre, Harare" },
  ],
  async search(ctx, q, context) {
    const exclude = typeof context.exclude === "string" ? context.exclude : null;
    const [sites, profile] = await Promise.all([
      prisma.site.findMany({
        where: {
          companyId: ctx.companyId,
          isActive: true,
          ...(exclude ? { id: { not: exclude } } : {}),
          ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
        },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.retailShopProfile.findUnique({ where: { companyId: ctx.companyId }, select: { defaultSiteId: true } }),
    ]);
    const defaultId = profile?.defaultSiteId ?? null;
    const found = [...sites]
      .sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId))
      .map((row) => ({ id: row.id, label: row.name, sub: row.id === defaultId ? "Default" : null }));
    // `context.allSites` (a price list's Where): "All sites" first, which sends no site.
    const all = context.allSites === true && (!q || "all sites".includes(q.toLowerCase())) ? [{ id: ALL_SITES_ID, label: "All sites", sub: null }] : [];
    return [...all, ...found];
  },
  async add(ctx, fields) {
    const name = (fields.name ?? "").trim();
    if (!name) throw new LookupFieldErrors({ name: "Name is needed." });
    const [codes, lists] = await Promise.all([
      prisma.site.findMany({ where: { companyId: ctx.companyId }, select: { code: true } }),
      priceListOptions(ctx.companyId),
    ]);
    const parsed = siteInput.safeParse({
      name,
      code: suggestSiteCode(name, codes.map((row) => row.code)),
      address: fields.address ?? null,
      places: [{ name: "Shop floor" }],
      priceListId: lists.defaultId,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] === "address" ? "address" : "name";
      throw new LookupFieldErrors({ [field]: issue?.message ?? "Check the name." });
    }
    try {
      const created = await createSite(
        { ...actorOf(ctx), canSeeCost: canSeeRetailCostPrice(ctx.session.user?.role) },
        parsed.data,
      );
      return { id: created.id, label: created.name, sub: null };
    } catch (error) {
      if (error instanceof SiteRefusal) throw new LookupFieldErrors({ name: error.message });
      throw error;
    }
  },
};

/**
 * Price lists, the default first: "Default, 214 products", "96 products";
 * binned ones are not offered. `context.withCost` (New price list's "Start
 * from") adds "Cost" last. The inline add copies another list ("Start from";
 * empty is the default).
 */
const priceList: LookupNoun = {
  noun: "price-list",
  read: [
    ["retail.prices", "view"],
    ["retail.sites", "view"],
    ["retail.tills", "view"],
  ],
  create: ["retail.prices", "create"],
  quick: [
    { key: "name", label: "Name", placeholder: "" },
    { key: "from", label: "Start from", placeholder: "The default list" },
  ],
  async search(ctx, q, context) {
    const needle = q.toLowerCase();
    const { options } = await priceListOptions(ctx.companyId);
    const found = options.map((option) => ({ id: option.id, label: option.name, sub: option.sub }));
    if (context.withCost === true) found.push({ id: "cost", label: "Cost", sub: "What each product costs" });
    return found.filter((option) => !needle || option.label.toLowerCase().includes(needle));
  },
  async add(ctx, fields) {
    const { options, defaultId } = await priceListOptions(ctx.companyId);
    const typed = (fields.from ?? "").trim().toLowerCase();
    const from = typed ? options.find((option) => option.name.toLowerCase() === typed)?.id : defaultId;
    if (!from) throw new LookupFieldErrors({ from: "Start from one of your price lists." });
    try {
      const created = await copyPriceList(actorOf(ctx), { name: fields.name ?? "", fromId: from });
      return {
        id: created.id,
        label: created.name,
        sub: `${created.products} ${created.products === 1 ? "product" : "products"}`,
      };
    } catch (error) {
      if (error instanceof PriceListCopyRefusal) throw new LookupFieldErrors({ [error.field]: error.message });
      throw error;
    }
  },
};

/**
 * The tenant's chart on Posting to the books (SET-09): the active ledger
 * accounts of the types the field takes, "{code} {name}" over its type, in
 * code order. Its inline add is
 * "New account": "Code and name" ("1012 Cash on hand, rand") and "Type".
 */
const account: LookupNoun = {
  noun: "account",
  read: [["retail.posting", "view"]],
  create: ["retail.posting", "update"],
  quick: [
    { key: "codeAndName", label: "Code and name", placeholder: "" },
    { key: "type", label: "Type", placeholder: "Asset, liability, income or expense" },
  ],
  async search(ctx, q, context) {
    const needle = q.trim().toLowerCase();
    // `context.types`: the types the field takes ("Sales": income), so it lists only those.
    const types = Array.isArray(context.types)
      ? context.types.filter((type): type is AccountType => typeof type === "string" && type in TYPE_WORDS)
      : [];
    return (await postableAccounts(ctx.companyId))
      .filter((row) => types.length === 0 || types.includes(row.type))
      .map(accountOption)
      .filter((option) => !needle || option.label.toLowerCase().includes(needle));
  },
  async add(ctx, fields) {
    try {
      return await addPostingAccount(actorOf(ctx), { codeAndName: fields.codeAndName ?? "", type: fields.type ?? "" });
    } catch (error) {
      if (error instanceof AccountAddRefused) throw new LookupFieldErrors(error.fieldErrors);
      throw error;
    }
  },
};

export const SETUP_LOOKUPS: LookupNoun[] = [site, priceList, account];
