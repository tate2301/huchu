import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { createJournalEntryFromSource, type PostingContext } from "@/lib/accounting/posting";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { readSettings, saveSettings } from "@/lib/retail/settings";
import { SettingsRefused } from "@/lib/retail/settings/types";

import { SETUP_LOOKUPS } from "@/lib/retail/lookups/setup";
import type { LookupCtx } from "@/lib/retail/lookups/types";

import {
  AccountAddRefused,
  addPostingAccount,
  continueRetailPosting,
  kindOf,
  loadPostingState,
  PostingRefused,
  runRetailPosting,
  savePosting,
  startRetailPosting,
} from "./posting-settings";

/**
 * Posting to the books (SET-09) against a real database: a shop set up from
 * the Zimbabwe retail pack, its role accounts, a sale posted at once or left
 * for the day's run, and the run that posts it.
 */
describe("posting a shop's sales to the books", () => {
  let companyId: string;
  let ownerId: string;
  const accounts = new Map<string, string>();
  const actor = () => ({ companyId, userId: ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });

  let saleNo = 0;
  const sale = (): PostingContext => {
    saleNo += 1;
    return {
      companyId,
      sourceType: "RETAIL_SALE",
      sourceId: `sale-${saleNo}-${Date.now()}`,
      sourceSubtype: "SALE",
      entryDate: new Date(),
      description: `Retail sale S-${saleNo}`,
      createdById: ownerId,
      amount: 11.5,
      netAmount: 10,
      taxAmount: 1.5,
      grossAmount: 11.5,
      currency: "USD",
      payments: [{ tenderType: "CASH", amount: 11.5, currency: "USD" }],
      inventory: { lines: [{ itemName: "Castle Lager 340ml", quantity: 6, unitCost: 1, totalCost: 6 }], totalCost: 6 },
      payload: { depositAmount: 0, changeRoundingKept: 0, changeRoundingGiven: 0 },
    };
  };

  /** A refund or a void: a sale the other way round. */
  const undo = (sourceType: "RETAIL_REFUND" | "RETAIL_VOID"): PostingContext => ({
    ...sale(),
    sourceType,
    sourceSubtype: sourceType === "RETAIL_REFUND" ? "REFUND" : "VOID",
    description: `Retail ${sourceType === "RETAIL_REFUND" ? "refund" : "void"} S-${saleNo}`,
    invertDirection: true,
  });

  /** A count that found 7.10 of stock missing, as the stock count route posts it. */
  const lossCount = (): PostingContext => {
    saleNo += 1;
    return {
      companyId,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId: `count-${saleNo}-${Date.now()}`,
      sourceSubtype: "COUNT_LOSS",
      entryDate: new Date(),
      description: `Retail stock adjustment ADJ-${saleNo}`,
      createdById: ownerId,
      amount: 7.1,
      netAmount: 7.1,
      taxAmount: 0,
      grossAmount: 7.1,
      invertDirection: true,
      inventory: { lines: [{ itemName: "Castle Lager 340ml", quantity: 1, unitCost: 7.1, totalCost: 7.1 }], totalCost: 7.1 },
    };
  };

  /** An entry's lines as "{code} D|C {amount}", sorted, to compare two entries. */
  const linesOf = async (entryId: string) =>
    (
      await prisma.journalLine.findMany({
        where: { entryId },
        select: { debit: true, credit: true, account: { select: { code: true } } },
      })
    )
      .map((line) => `${line.account.code} ${line.debit > 0 ? `D ${line.debit}` : `C ${line.credit}`}`)
      .sort();

  const entryOf = async (sourceId: string | null | undefined) =>
    (await prisma.journalEntry.findFirstOrThrow({ where: { companyId, sourceId: sourceId! }, select: { id: true } })).id;

  const creditTo = async (entryId: string) => {
    const lines = await prisma.journalLine.findMany({
      where: { entryId, credit: { gt: 0 } },
      select: { credit: true, account: { select: { code: true } } },
    });
    return Object.fromEntries(lines.map((line) => [line.account.code, line.credit]));
  };

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    companyId = (
      await prisma.company.create({
        data: { name: `Posting ${stamp}`, slug: `posting-${stamp}` },
        select: { id: true },
      })
    ).id;
    ownerId = (
      await prisma.user.create({
        data: { email: `owner-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId },
        select: { id: true },
      })
    ).id;
    await runAccountingSeedPack({ companyId, mode: "APPLY" });
    for (const row of await prisma.chartOfAccount.findMany({ where: { companyId }, select: { id: true, code: true } })) {
      accounts.set(row.code, row.id);
    }
  }, 60_000);

  afterAll(async () => {
    if (!companyId) return;
    await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
    await destroyProvisionedTenant(companyId);
  });

  it("sets up every role account and the ZiG cash and vouchers accounts from the pack", async () => {
    const roles = await prisma.retailAccountRoleMapping.findMany({
      where: { companyId },
      select: { role: true, account: { select: { code: true } } },
    });
    expect(Object.fromEntries(roles.map((row) => [row.role, row.account.code]))).toEqual({
      SALES: "4000",
      VAT_OUTPUT: "2200",
      COST_OF_SALES: "5000",
      STOCK: "1200",
      BREAKAGE: "5410",
      DEPOSITS_HELD: "2240",
    });
    const lines = await prisma.postingRuleLine.findMany({
      where: { rule: { companyId, sourceType: "RETAIL_SALE" }, accountSource: "ROLE_MAPPING" },
      select: { accountRole: true, accountId: true },
    });
    expect(lines.map((line) => line.accountRole).sort()).toEqual(
      ["COST_OF_SALES", "DEPOSITS_HELD", "SALES", "STOCK", "VAT_OUTPUT"].sort(),
    );
    expect(lines.every((line) => line.accountId === null)).toBe(true);

    const state = await loadPostingState(companyId);
    expect(state.tenders.find((tender) => tender.key === "cashZig")?.account?.label).toBe("1001 Till cash, ZiG");
    expect(state.tenders.find((tender) => tender.key === "vouchers")?.account?.label).toBe("2250 Vouchers issued");
    expect(state.schedule).toBe("END_OF_DAY");
    expect(state.lastRun).toBeNull();
  });

  it("posts with every sale to the role's account, and to the new one once Sales changes", async () => {
    await prisma.$transaction((tx) => savePosting(tx, actor(), { schedule: "EVERY_SALE" }));
    const first = await createJournalEntryFromSource(sale());
    expect(first.entryId).toBeTruthy();
    expect(await creditTo(first.entryId!)).toMatchObject({ "4000": 10, "2200": 1.5, "1200": 6 });

    await prisma.$transaction((tx) =>
      savePosting(tx, actor(), { roles: [{ role: "SALES", accountId: accounts.get("4200")!, field: "sales", label: "Sales" }] }),
    );
    const next = await createJournalEntryFromSource(sale());
    const credits = await creditTo(next.entryId!);
    expect(credits["4200"]).toBe(10);
    expect(credits["4000"]).toBeUndefined();
  });

  it("refuses an account of the wrong type, by field", async () => {
    await expect(
      prisma.$transaction((tx) =>
        savePosting(tx, actor(), { roles: [{ role: "STOCK", accountId: accounts.get("4000")!, field: "stock", label: "Stock" }] }),
      ),
    ).rejects.toThrow(new PostingRefused("4000 Retail Sales Revenue is an income account. Stock needs an asset account.", "stock"));

    const option = { id: accounts.get("1000")!, label: "1000 Till Cash", sub: "Asset" };
    await expect(saveSettings(actor(), "posting", { sales: option })).rejects.toBeInstanceOf(SettingsRefused);
  });

  it("leaves a sale for the day's run at the end of each day, then Post now posts it", async () => {
    await prisma.$transaction((tx) => savePosting(tx, actor(), { schedule: "END_OF_DAY" }));
    const waiting = sale();
    const deferred = await createJournalEntryFromSource(waiting);
    expect(deferred).toMatchObject({ deferred: true, code: "POSTING_DEFERRED" });
    const event = await prisma.accountingIntegrationEvent.findFirst({
      where: { companyId, sourceId: waiting.sourceId },
      select: { status: true, nextRetryAt: true, journalEntryId: true },
    });
    expect(event?.status).toBe("PENDING");
    expect(event?.journalEntryId).toBeNull();
    expect(event!.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.journalEntry.count({ where: { companyId, sourceId: waiting.sourceId } })).toBe(0);

    const run = await runRetailPosting(companyId, "BY_HAND", actor());
    expect(run).toMatchObject({ sales: 1, refunds: 0, deliveries: 0, counts: 0, failed: 0 });
    const posted = await prisma.accountingIntegrationEvent.findFirst({
      where: { companyId, sourceId: waiting.sourceId },
      select: { status: true, journalEntryId: true },
    });
    expect(posted?.status).toBe("POSTED");
    expect(await creditTo(posted!.journalEntryId!)).toMatchObject({ "4200": 10 });

    const page = await readSettings(companyId, "posting", true);
    expect(page?.values.lastPosted).toMatch(/^\d{1,2} \w+, \d{2}:\d{2}\. 1 sale\.$/);
    expect(page?.values.schedule).toBe("At the end of each day");
    expect(
      await prisma.platformAuditEvent.count({ where: { companyId, eventType: "RETAIL_POSTING.RUN", entityId: "posting" } }),
    ).toBe(1);
  });

  it("posts a refund, a void and a loss count left for the day's run the same way round as at once", async () => {
    const make = () => [undo("RETAIL_REFUND"), undo("RETAIL_VOID"), lossCount()];

    await prisma.$transaction((tx) => savePosting(tx, actor(), { schedule: "EVERY_SALE" }));
    const atOnce = make();
    for (const context of atOnce) expect((await createJournalEntryFromSource(context)).entryId).toBeTruthy();

    await prisma.$transaction((tx) => savePosting(tx, actor(), { schedule: "END_OF_DAY" }));
    const later = make();
    for (const context of later) expect(await createJournalEntryFromSource(context)).toMatchObject({ deferred: true });
    const run = await runRetailPosting(companyId, "BY_HAND", actor());
    expect(run).toMatchObject({ sales: 0, refunds: 2, counts: 1, failed: 0 });

    for (const [index, context] of atOnce.entries()) {
      const want = await linesOf(await entryOf(context.sourceId));
      expect(await linesOf(await entryOf(later[index]!.sourceId))).toEqual(want);
    }
    // The refund takes the cash out and the sales back: the sale the other way round.
    const refund = await linesOf(await entryOf(later[0]!.sourceId));
    expect(refund).toContain("1000 C 11.5");
    expect(refund).toContain("4200 D 10");
    // The loss count takes the stock off and books the loss.
    const loss = await linesOf(await entryOf(later[2]!.sourceId));
    expect(loss).toEqual(["1200 C 7.1", "5410 D 7.1"]);
   }, 30_000);

  it("posts a run in slices, in the order the sales were captured, and closes a run cut off", async () => {
    const captured = [sale(), sale(), sale()];
    for (const context of captured) await createJournalEntryFromSource(context);

    const cutOff = await startRetailPosting(companyId, "BY_HAND", actor());
    // No time at all: nothing posts, and the run says what is still waiting.
    const first = await continueRetailPosting(companyId, cutOff, actor(), 0);
    expect(first).toMatchObject({ done: false, waiting: 3, run: { sales: 0 } });

    // Its calls stop; the next Post now closes it where it stopped and starts again.
    const runId = await startRetailPosting(companyId, "BY_HAND", actor());
    expect((await prisma.retailPostingRun.findUniqueOrThrow({ where: { id: cutOff } })).finishedAt).not.toBeNull();
    const done = await continueRetailPosting(companyId, runId, actor(), 60_000);
    expect(done).toMatchObject({ done: true, waiting: 0, run: { sales: 3, failed: 0 } });
    expect(await continueRetailPosting(companyId, runId, actor(), 60_000)).toMatchObject({ done: true });

    const numbers = await Promise.all(
      captured.map(async (context) =>
        (await prisma.journalEntry.findFirstOrThrow({ where: { companyId, sourceId: context.sourceId! } })).entryNumber,
      ),
    );
    expect([...numbers].sort()).toEqual(numbers);

    // Two Post nows at once: each event posts once, in one run or the other.
    const both = [sale(), sale(), sale(), sale()];
    for (const context of both) await createJournalEntryFromSource(context);
    const one = await startRetailPosting(companyId, "BY_HAND", actor());
    const two = await startRetailPosting(companyId, "BY_HAND", actor());
    const [a, b] = await Promise.all([
      continueRetailPosting(companyId, one, actor(), null),
      continueRetailPosting(companyId, two, actor(), null),
    ]);
    expect(a!.run.sales + b!.run.sales).toBe(4);
    expect(a!.run.failed + b!.run.failed).toBe(0);
    expect(await prisma.journalEntry.count({ where: { companyId, sourceId: { in: both.map((context) => context.sourceId!) } } })).toBe(4);

    // A run that found nothing waiting does not move "Last posted".
    await runRetailPosting(companyId, "BY_HAND", actor());
    const state = await loadPostingState(companyId);
    expect(state.lastRun?.sales).toBeGreaterThan(0);
    expect(state.lastRun!.at.getTime()).toBeLessThan(Date.now());
    const empty = await prisma.retailPostingRun.findFirstOrThrow({ where: { companyId }, orderBy: { startedAt: "desc" } });
    expect(empty).toMatchObject({ salesPosted: 0, otherPosted: 0 });
    expect(empty.finishedAt!.getTime()).toBeGreaterThan(state.lastRun!.at.getTime());
   }, 30_000);

  it("refuses a tender that is off and a role the shop does not post", async () => {
    // InnBucks is off until Payments switches it on.
    await expect(
      prisma.$transaction((tx) =>
        savePosting(tx, actor(), {
          tenders: [{ key: "innbucks", accountId: accounts.get("1000")!, field: "innbucks", label: "InnBucks" }],
        }),
      ),
    ).rejects.toThrow(new PostingRefused("InnBucks is off. Switch it on in Payments first.", "innbucks"));
    await expect(
      prisma.$transaction((tx) =>
        savePosting(tx, actor(), {
          roles: [{ role: "DEPOSITS_HELD", accountId: accounts.get("2240")!, field: "deposits", label: "Deposits on empties" }],
        }),
      ),
    ).rejects.toBeInstanceOf(PostingRefused);
    expect(
      await prisma.tenderAccountMapping.count({ where: { companyId, tenderType: "INNBUCKS", clearingAccountId: accounts.get("1000")! } }),
    ).toBe(0);
  });

  it("asks Set up the accounts only for the rates the shop does not have", async () => {
    const { setupPreview } = await import("./posting-settings");
    const before = setupPreview(await runAccountingSeedPack({ companyId, mode: "DRY_RUN" }));
    expect(before.rates.map((rate) => rate.code).sort()).toEqual(["ZAR", "ZWG"]);
    await prisma.currencyRate.create({
      data: { companyId, baseCurrency: "USD", quoteCurrency: "ZWG", rate: 26.8, effectiveDate: new Date() },
    });
    const after = setupPreview(await runAccountingSeedPack({ companyId, mode: "DRY_RUN" }));
    expect(after).toMatchObject({ rates: [{ code: "ZAR", label: "rand" }], nothing: false });
    await prisma.currencyRate.create({
      data: { companyId, baseCurrency: "USD", quoteCurrency: "ZAR", rate: 18.5, effectiveDate: new Date() },
    });
    expect(setupPreview(await runAccountingSeedPack({ companyId, mode: "DRY_RUN" })).nothing).toBe(true);
   }, 30_000);

  it("lists only the accounts of the types a field takes", async () => {
    const lookup = SETUP_LOOKUPS.find((noun) => noun.noun === "account")!;
    const ctx = { companyId } as unknown as LookupCtx;
    const sales = await lookup.search(ctx, "", { types: ["INCOME"] });
    expect(sales.length).toBeGreaterThan(0);
    expect(sales.every((option) => option.sub === "Income")).toBe(true);
    const vouchers = await lookup.search(ctx, "", { types: ["ASSET", "LIABILITY"] });
    expect(new Set(vouchers.map((option) => option.sub))).toEqual(new Set(["Asset", "Liability"]));
  });

  it("adds an account from any account field, once per code", async () => {
    const added = await addPostingAccount(actor(), { codeAndName: "1012 Cash on hand, rand", type: "Asset" });
    expect(added).toMatchObject({ label: "1012 Cash on hand, rand", sub: "Asset" });
    await expect(addPostingAccount(actor(), { codeAndName: "1012 Float", type: "Asset" })).rejects.toMatchObject({
      status: 409,
    });
    await expect(addPostingAccount(actor(), { codeAndName: "Float", type: "Asset" })).rejects.toBeInstanceOf(AccountAddRefused);
    const page = await readSettings(companyId, "posting", true);
    expect(page?.values.checks).toEqual([
      { ok: true, text: "Every tender has an account." },
      { ok: true, text: "VAT is set to 15.5%." },
      { ok: true, text: "Stock is valued at average cost." },
    ]);
  });
});

describe("Set up the accounts, as the dialog lists it", () => {
  it("groups what the pack would add, by name, and says when nothing is missing", async () => {
    const { setupPreview } = await import("./posting-settings");
    const none: string[] = [];
    const empty = {
      missingAccounts: none,
      missingTaxCodes: none,
      missingTaxCategories: none,
      missingTaxTemplates: none,
      missingTaxRules: none,
      missingPostingRules: none,
      missingTenderMappings: none,
      missingRoleMappings: none,
      missingCurrencies: none,
      missingFxQuotes: ["ZWG", "ZAR"],
    };
    const result = (preview: Partial<typeof empty>) =>
      ({ preview: { ...empty, ...preview } }) as unknown as Parameters<typeof setupPreview>[0];
    expect(
      setupPreview(
        result({
          missingAccounts: ["1001", "2250"],
          missingTaxCodes: ["VAT15_5"],
          missingTenderMappings: ["CASH:ZWG", "VOUCHER"],
          missingRoleMappings: ["SALES"],
        }),
      ),
    ).toEqual({
      accounts: ["1001 Till cash, ZiG", "2250 Vouchers issued"],
      vatCodes: ["VAT Standard Rate, 15.5%"],
      tenderAccounts: ["Cash, ZiG", "Vouchers", "Sales"],
      rates: [
        { code: "ZWG", label: "ZiG" },
        { code: "ZAR", label: "rand" },
      ],
      nothing: false,
    });
    // Only the rates are missing: there is still something to add.
    expect(setupPreview(result({}))).toMatchObject({ rates: [{ code: "ZWG" }, { code: "ZAR" }], nothing: false });
    expect(setupPreview(result({ missingFxQuotes: none })).nothing).toBe(true);
  });
});

describe("what a posted event counts as", () => {
  it("counts a stock count as a count, and other adjustments as something else", () => {
    expect(kindOf("RETAIL_STOCK_ADJUSTMENT", "COUNT_LOSS")).toBe("counts");
    expect(kindOf("RETAIL_STOCK_ADJUSTMENT", "COUNT_GAIN")).toBe("counts");
    expect(kindOf("RETAIL_STOCK_ADJUSTMENT", "LOSS")).toBe("other");
    expect(kindOf("RETAIL_VOID", "VOID")).toBe("refunds");
    expect(kindOf("RETAIL_SALE", "SALE")).toBe("sales");
  });
});
