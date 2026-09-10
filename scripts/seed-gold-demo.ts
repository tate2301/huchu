/**
 * A gold mine with a quarter behind it.
 *
 *   npx tsx scripts/seed-gold-demo.ts --slug huchu-enterprises
 *   npx tsx scripts/seed-gold-demo.ts --slug huchu-enterprises --days 90 --reset
 *
 * Phase 2.5 of `docs/testing/e2e-plan-2026-09-01.md` — the last of the five,
 * and the one with no prior art. Gold is the founding module of this codebase
 * and, as of 2026-09-01, the least tested through a browser: 19 routes, zero
 * specs, and no seed script at all. Only backfills, which assume the data is
 * already there.
 *
 * ## The shape of a mining week
 *
 * A shift produces ore, and the gold recovered from it is split between the
 * crew and the company — `DEFAULT_50_50` unless somebody overrides the worker
 * weight and says why. That allocation hangs off a `ShiftReport`, which is the
 * operational record the mine keeps anyway; the allocation is the gold ledger's
 * view of the same shift. Recovered gold is poured into a bar, dispatched to a
 * buyer under seal, and comes back as a receipt with an assay.
 *
 * So the chain seeded here is: shift report → allocation → worker shares →
 * pour → dispatch → buyer receipt, with inventory events either side and a
 * price curve underneath all of it.
 *
 * ## Rows that are wrong on purpose
 *
 * The house style, and the reason these screens can be judged at all:
 *
 *   - an allocation still in **DRAFT** and one **SUBMITTED** but not approved,
 *     so the approval queue is not empty
 *   - a split **overridden** away from 50/50, with a reason, so that path renders
 *   - a pour **not yet dispatched**, and a dispatch **not yet receipted** — gold
 *     in transit is the state everyone worries about
 *   - an **inventory deficit** exception open, plus an acknowledged and a
 *     resolved one, so all three statuses are reachable
 *   - a **closed period**, so the period-close guard has something to refuse
 *   - a day with **no price**, so the price-fallback path has a hole to find
 *
 * ## Deterministic
 *
 * Seeded LCG, as in `seed-crm-year.ts` and `seed-school-demo.ts`. Two runs
 * produce the same mine, so a screenshot diff means a code change rather than
 * fresh random data. Idempotent by natural key where one exists; `--reset`
 * clears the gold rows first.
 *
 * Never point it at production.
 */

import "dotenv/config";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

/* ── Arguments ────────────────────────────────────────────────────────── */

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === `--${name}`) return process.argv[index + 1];
    if (argument.startsWith(prefix)) return argument.slice(prefix.length);
  }
  return undefined;
}

const SLUG = (readArg("slug") ?? "huchu-enterprises").trim().toLowerCase();
const DAYS = Number(readArg("days") ?? 90);
const RESET = process.argv.includes("--reset");
const PASSWORD = "GoldDemo123!";

/* ── Deterministic randomness ─────────────────────────────────────────── */

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const random = makeRandom(20260901);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (low: number, high: number) => low + random() * (high - low);
const dec = (value: number, places = 3) => new Prisma.Decimal(value.toFixed(places));

/**
 * Round to the milligram, the precision the Decimal columns actually store.
 *
 * Exists so a figure can be rounded *before* it is split, rather than each
 * part being rounded on its way into `dec()`. See the note at the allocation
 * split for what went wrong when it was not.
 */
const round3 = (value: number) => Number(value.toFixed(3));

/* ── Cast ─────────────────────────────────────────────────────────────── */

const STAFF = [
  { key: "manager", first: "Nyasha", last: "Mudzingwa", role: "MANAGER" as const },
  { key: "clerk", first: "Tapiwa", last: "Chuma", role: "CLERK" as const },
  { key: "geologist", first: "Rudo", last: "Mabvuto", role: "OPERATOR" as const },
];

const CREW_NAMES = [
  "Tonderai Zimba", "Shepherd Mwale", "Lovemore Banda", "Gift Chirwa",
  "Innocent Phiri", "Trymore Ndlovu", "Wellington Mabeza", "Never Sibanda",
  "Prosper Katsande", "Tapfuma Chigwada", "Last Mudimu", "Elias Nyamurundira",
];

const SITES = [
  { code: "SHAFT1", name: "Shaft 1 - Main Reef" },
  { code: "SHAFT2", name: "Shaft 2 - East Reef" },
  { code: "ALLUV", name: "Alluvial Section" },
];

const NEXT_OF_KIN = [
  "Chipo Zimba", "Ruvimbo Mwale", "Tsitsi Banda", "Memory Chirwa",
  "Grace Phiri", "Sarudzai Ndlovu", "Locadia Mabeza", "Plaxedes Sibanda",
  "Miriam Katsande", "Sekai Chigwada", "Netsai Mudimu", "Auxillia Nyamurundira",
];

const VILLAGES = [
  "Zvishavane", "Mberengwa", "Shurugwi", "Gokwe", "Chegutu", "Kadoma",
  "Bindura", "Shamva", "Mazowe", "Guruve", "Mutoko", "Murehwa",
];

const COURIERS = ["Chimwe Secure Logistics", "Zimguard Bullion", "Sable Armoured"];
const DESTINATIONS = ["Fidelity Printers, Harare", "Fidelity Printers, Bulawayo"];

const pad = (value: number, width = 4) => String(value).padStart(width, "0");

/** `n` days before 2026-09-01, fixed so the seed is reproducible. */
function daysBefore(n: number): Date {
  return new Date(Date.UTC(2026, 8, 1) - n * 86_400_000);
}

/* ── Run ──────────────────────────────────────────────────────────────── */

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to seed.");
  }

  const company = await prisma.company.findUnique({
    where: { slug: SLUG },
    select: { id: true, name: true },
  });
  if (!company) {
    throw new Error(
      `No company with slug "${SLUG}". Create the tenant first:\n` +
        `  npx tsx scripts/seed-staging-tenant.ts --slug ${SLUG} ` +
        `--email mine@${SLUG}.test --password '${PASSWORD}' --name 'Huchu Enterprises' --user-name 'Mine Manager'`,
    );
  }
  const companyId = company.id;
  /*
    Say what this tenant *is*. `Company.workspaceProfile` defaults to GENERAL,
    and a GENERAL tenant falls through to inference — which, on a demo tenant
    with the whole product switched on, has nothing to go on. Before this, the
    workspace switcher read "Retail" above every screen of every vertical.
  */
  await prisma.company.update({
    where: { id: companyId },
    data: { workspaceProfile: "GOLD_MINE" },
  });

  console.log(`Seeding ${DAYS} days of mining into ${company.name} (${SLUG})`);

  if (RESET) {
    // Innermost first. Worker shares hang off allocations, receipts off
    // dispatches, dispatches off pours, allocations off shift reports.
    await prisma.goldShiftWorkerShare.deleteMany({
      where: { allocation: { site: { companyId } } },
    });
    await prisma.goldShiftExpense.deleteMany({
      where: { allocation: { site: { companyId } } },
    });
    await prisma.buyerReceipt.deleteMany({ where: { goldPour: { site: { companyId } } } });
    await prisma.goldDispatch.deleteMany({ where: { goldPour: { site: { companyId } } } });
    await prisma.goldPour.deleteMany({ where: { site: { companyId } } });
    await prisma.goldShiftAllocation.deleteMany({ where: { site: { companyId } } });
    await prisma.shiftReport.deleteMany({ where: { site: { companyId } } });
    await prisma.goldInventoryEvent.deleteMany({ where: { companyId } });
    await prisma.goldException.deleteMany({ where: { companyId } });
    await prisma.goldPeriodClose.deleteMany({ where: { companyId } });
    await prisma.goldPrice.deleteMany({ where: { companyId } });
    console.log("  reset: cleared previous gold activity");
  }

  /* ── Staff ────────────────────────────────────────────────────────── */

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users: Record<string, string> = {};
  for (const person of STAFF) {
    const email = `${person.first}.${person.last}@${SLUG}.test`.toLowerCase();
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: `${person.first} ${person.last}`, companyId, isActive: true },
      create: {
        email,
        name: `${person.first} ${person.last}`,
        password: passwordHash,
        role: person.role,
        companyId,
        isActive: true,
      },
      select: { id: true },
    });
    users[person.key] = user.id;
  }
  const managerId = users.manager;
  const clerkId = users.clerk;
  console.log(`  ${STAFF.length} staff`);

  /* ── Sites ────────────────────────────────────────────────────────── */

  const sites: Array<{ id: string; code: string; name: string }> = [];
  for (const site of SITES) {
    const row = await prisma.site.upsert({
      where: { companyId_code: { companyId, code: site.code } },
      update: { name: site.name, isActive: true },
      create: { companyId, code: site.code, name: site.name, isActive: true },
      select: { id: true, code: true, name: true },
    });
    sites.push(row);
  }
  console.log(`  ${sites.length} sites`);

  /* ── Crew ─────────────────────────────────────────────────────────── */

  const crew: Array<{ id: string; name: string }> = [];
  for (let index = 0; index < CREW_NAMES.length; index += 1) {
    const employeeId = `MINE-${pad(index + 1, 3)}`;
    const row = await prisma.employee.upsert({
      where: { companyId_employeeId: { companyId, employeeId } },
      update: { name: CREW_NAMES[index], isActive: true },
      create: {
        companyId,
        employeeId,
        name: CREW_NAMES[index],
        phone: `+2637${Math.floor(between(10_000_000, 99_999_999))}`,
        // All required, and all of them the kind of detail a mine actually
        // holds: an underground crew is registered with next of kin and a
        // village, because somebody has to be told and somebody has to travel.
        nextOfKinName: NEXT_OF_KIN[index % NEXT_OF_KIN.length],
        nextOfKinPhone: `+2637${Math.floor(between(10_000_000, 99_999_999))}`,
        passportPhotoUrl: "",
        villageOfOrigin: VILLAGES[index % VILLAGES.length],
        isActive: true,
      },
      select: { id: true, name: true },
    });
    crew.push(row);
  }
  console.log(`  ${crew.length} crew`);

  /* ── Settings and expense types ───────────────────────────────────── */

  await prisma.goldCompanyConfig.upsert({
    where: { companyId },
    update: {},
    create: {
      companyId,
      defaultSplitMode: "DEFAULT_50_50",
      defaultPayCycleWeeks: 2,
      defaultStorageLocation: "Mine safe - Shaft 1 office",
      defaultEstimatedPurity: dec(0.92, 2),
      liveSpotPriceEnabled: false,
    },
  });

  for (const [index, name] of ["Milling", "Cyanide", "Transport", "Security"].entries()) {
    const existing = await prisma.goldExpenseType.findFirst({
      where: { companyId, name },
      select: { id: true },
    });
    if (!existing) {
      await prisma.goldExpenseType.create({
        data: { companyId, name, sortOrder: index, isActive: true },
      });
    }
  }

  /* ── The price curve ──────────────────────────────────────────────── */

  // One price per day, wandering around $78/g. Day 3 is deliberately missing so
  // the price-fallback path has a hole to fall through.
  let priceCount = 0;
  let spot = 78;
  for (let day = DAYS; day >= 0; day -= 1) {
    if (day === 3) continue;
    spot = Math.max(70, Math.min(88, spot + between(-0.9, 0.9)));
    const effectiveDate = daysBefore(day);
    const existing = await prisma.goldPrice.findFirst({
      where: { companyId, effectiveDate },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.goldPrice.create({
      data: {
        companyId,
        effectiveDate,
        priceUsdPerGram: dec(spot, 2),
        createdById: managerId,
      },
    });
    priceCount += 1;
  }
  console.log(`  ${priceCount} daily prices (day 3 left blank on purpose)`);

  const priceOn = async (date: Date) => {
    const row = await prisma.goldPrice.findFirst({
      where: { companyId, effectiveDate: { lte: date } },
      orderBy: { effectiveDate: "desc" },
      select: { priceUsdPerGram: true },
    });
    return row ? Number(row.priceUsdPerGram) : 80;
  };

  /* ── Shifts, allocations, worker shares ───────────────────────────── */

  let allocationCount = 0;
  let shareCount = 0;
  let draftCount = 0;
  let submittedCount = 0;
  let overrideCount = 0;
  const approved: Array<{ id: string; siteId: string; date: Date; grams: number }> = [];

  for (let day = DAYS; day >= 1; day -= 1) {
    const date = daysBefore(day);
    if (date.getUTCDay() === 0) continue; // Sunday: the mine rests.

    for (const shift of ["DAY", "NIGHT"] as const) {
      const site = sites[(day + (shift === "DAY" ? 0 : 1)) % sites.length];
      const leader = crew[(day + shift.length) % crew.length];
      const price = await priceOn(date);

      const report = await prisma.shiftReport.create({
        data: {
          date,
          shift,
          siteId: site.id,
          groupLeaderId: leader.id,
          crewCount: Math.floor(between(6, 12)),
          workType: pick(["EXTRACTION", "HAULING", "CRUSHING", "PROCESSING"] as const),
          outputTonnes: Number(between(8, 42).toFixed(1)),
          status: "APPROVED",
          createdById: clerkId,
          approvedById: managerId,
          approvedAt: date,
        },
        select: { id: true },
      });

      const total = between(9, 48);
      const net = total - between(0.4, 2.6);

      // Everything is approved as it is created; the two newest are demoted
      // afterwards. Keying this off the day number looked simpler and was
      // wrong — day 2 fell on a Sunday, the loop skips Sundays, and the
      // "awaiting approval" queue came out empty on the first run.
      const workflowStatus = "APPROVED";

      /*
        Round the net *first*, then split the rounded figure — and derive the
        company's share by subtracting rather than by halving again.

        Doing it the obvious way (split the unrounded net, round both halves)
        makes the parts stop summing to the whole: net 25.6953 rounds to
        25.695, each half is 12.84765 which rounds to 12.848, and
        12.848 + 12.848 is 25.696. A milligram of gold that does not exist, on
        69 of 154 shifts. The e2e suite caught it as "worker share plus company
        share must equal net weight", which is exactly the invariant a mine
        cares about: somebody is owed grams that were never poured.

        `app/api/gold/shift-output/route.ts:132` already derives it this way
        (`companyShare = netWeight - workerShare`), so this brings the seed in
        line with the product rather than inventing a rule for it.
      */
      const netRounded = round3(net);

      // One shift in twenty is split away from 50/50, and says why.
      const override = random() < 0.05 && workflowStatus === "APPROVED";
      const workerShare = round3(
        override ? netRounded * between(0.55, 0.65) : netRounded / 2,
      );
      const companyShare = round3(netRounded - workerShare);
      if (override) overrideCount += 1;

      const crewSize = Math.floor(between(4, 9));
      const perWorker = workerShare / crewSize;

      const allocation = await prisma.goldShiftAllocation.create({
        data: {
          date,
          shift,
          siteId: site.id,
          companyId,
          shiftReportId: report.id,
          totalWeight: dec(total),
          // The rounded net, not the raw one: it is what the shares were split
          // from, and a row whose net disagrees with its own parts is the bug
          // this seed just had.
          netWeight: dec(netRounded),
          splitMode: override ? "OVERRIDE_WORKER_WEIGHT" : "DEFAULT_50_50",
          workerShareOverrideWeight: override ? dec(workerShare) : null,
          splitOverrideReason: override
            ? "Crew worked a double after the mill breakdown - agreed with the committee."
            : null,
          workerShareWeight: dec(workerShare),
          companyShareWeight: dec(companyShare),
          perWorkerWeight: dec(perWorker),
          goldPriceUsdPerGram: dec(price, 2),
          goldPriceSource: "CONFIGURED",
          valuationDate: date,
          totalWeightValueUsd: dec(total * price, 2),
          netWeightValueUsd: dec(netRounded * price, 2),
          workerShareValueUsd: dec(workerShare * price, 2),
          companyShareValueUsd: dec(companyShare * price, 2),
          perWorkerValueUsd: dec(perWorker * price, 2),
          payCycleWeeks: 2,
          workflowStatus,
          createdById: clerkId,
          submittedById: clerkId,
          submittedAt: date,
          approvedById: managerId,
          approvedAt: date,
        },
        select: { id: true },
      });
      allocationCount += 1;

      await prisma.goldShiftWorkerShare.createMany({
        data: Array.from({ length: crewSize }, (_, index) => ({
          allocationId: allocation.id,
          employeeId: crew[(index + day) % crew.length].id,
          shareWeight: dec(perWorker),
          shareValueUsd: dec(perWorker * price, 2),
        })),
        skipDuplicates: true,
      });
      shareCount += crewSize;

      await prisma.goldInventoryEvent.create({
        data: {
          companyId,
          siteId: site.id,
          eventDate: date,
          direction: "IN",
          grams: dec(companyShare),
          goldPriceUsdPerGram: dec(price, 2),
          valueUsd: dec(companyShare * price, 2),
          sourceType: "SHIFT_ALLOCATION",
          sourceId: allocation.id,
          createdById: clerkId,
        },
      });

      if (workflowStatus === "APPROVED") {
        approved.push({ id: allocation.id, siteId: site.id, date, grams: companyShare });
      }
    }
  }
  /*
    Leave the newest two mid-workflow, so the approval queue is not an empty
    state. Done here rather than in the loop because "the newest two shifts" is
    a fact about the finished sequence, not about any particular calendar day.
  */
  const newest = await prisma.goldShiftAllocation.findMany({
    where: { siteId: { in: sites.map((site) => site.id) } },
    orderBy: [{ date: "desc" }, { shift: "asc" }],
    take: 2,
    select: { id: true },
  });
  if (newest[0]) {
    await prisma.goldShiftAllocation.update({
      where: { id: newest[0].id },
      data: {
        workflowStatus: "DRAFT",
        submittedById: null,
        submittedAt: null,
        approvedById: null,
        approvedAt: null,
      },
    });
    draftCount += 1;
  }
  if (newest[1]) {
    await prisma.goldShiftAllocation.update({
      where: { id: newest[1].id },
      data: { workflowStatus: "SUBMITTED", approvedById: null, approvedAt: null },
    });
    submittedCount += 1;
  }

  console.log(
    `  ${allocationCount} shift allocations (${draftCount} draft, ${submittedCount} awaiting approval, ` +
      `${overrideCount} split overridden), ${shareCount} worker shares`,
  );

  /* ── Pours, dispatches, receipts ──────────────────────────────────── */

  // A pour gathers roughly a fortnight of company share into one bar.
  let pourCount = 0;
  let dispatchCount = 0;
  let receiptCount = 0;
  const BATCH = 24;

  for (let start = 0; start + BATCH <= approved.length; start += BATCH) {
    const batch = approved.slice(start, start + BATCH);
    const pourDate = batch[batch.length - 1].date;
    const gross = batch.reduce((sum, item) => sum + item.grams, 0);
    const price = await priceOn(pourDate);
    const siteId = batch[0].siteId;
    const index = pourCount + 1;

    const pour = await prisma.goldPour.create({
      data: {
        pourBarId: `BAR-${pad(index, 4)}`,
        pourDate,
        siteId,
        /*
          `companyId` is denormalised onto the gold tables and the screens filter
          on it. Leaving it null does not fail a write — it is nullable — it just
          makes the row invisible, which is worse: the seed reports success and
          the page reports "no records". `scripts/backfill-gold-pour-company-id.ts`
          exists because this has been got wrong before.
        */
        companyId,
        // `GoldPour.sourceType` is `GoldLotSource` (PRODUCTION | PURCHASE_PUBLIC),
        // not the `GoldInventorySourceType` vocabulary used on the events below.
        // Gold recovered from our own shifts is PRODUCTION; PURCHASE_PUBLIC is
        // for material bought in from small-scale miners.
        sourceType: "PRODUCTION",
        createdById: clerkId,
        grossWeight: dec(gross),
        estimatedPurity: dec(between(0.88, 0.95), 3),
        witness1Id: crew[0].id,
        witness2Id: crew[1].id,
        storageLocation: "Mine safe - Shaft 1 office",
        goldPriceUsdPerGram: dec(price, 2),
        valuationDate: pourDate,
        valueUsd: dec(gross * price, 2),
      },
      select: { id: true },
    });
    pourCount += 1;

    await prisma.goldInventoryEvent.create({
      data: {
        companyId,
        siteId,
        eventDate: pourDate,
        direction: "OUT",
        grams: dec(gross),
        goldPriceUsdPerGram: dec(price, 2),
        valueUsd: dec(gross * price, 2),
        sourceType: "POUR",
        sourceId: pour.id,
        createdById: clerkId,
      },
    });

    // The most recent bar stays in the safe: a pour with no dispatch.
    if (start + BATCH * 2 > approved.length) continue;

    const dispatchDate = new Date(pourDate.getTime() + 86_400_000);
    const dispatch = await prisma.goldDispatch.create({
      data: {
        goldPourId: pour.id,
        dispatchDate,
        courier: pick(COURIERS),
        vehicle: `AEK ${Math.floor(between(1000, 9999))}`,
        destination: pick(DESTINATIONS),
        sealNumbers: `SEAL-${pad(index, 5)}`,
        // An Employee, not a User. `GoldDispatch.handedOverBy` relates to
        // Employee — the person who physically handed the bar over at the gate
        // — where `GoldPour.createdBy` relates to User, the person who keyed it
        // in. Passing the manager's user id here is a foreign-key violation,
        // and was: P2003 on the first run.
        handedOverById: crew[2].id,
        companyId,
        goldPriceUsdPerGram: dec(price, 2),
        valuationDate: dispatchDate,
        valueUsd: dec(gross * price, 2),
      },
      select: { id: true },
    });
    dispatchCount += 1;

    // The second-most-recent bar is in transit: dispatched, no receipt yet.
    if (start + BATCH * 3 > approved.length) continue;

    const receiptDate = new Date(dispatchDate.getTime() + 2 * 86_400_000);
    const assay = between(0.9, 0.97);
    await prisma.buyerReceipt.create({
      data: {
        goldPourId: pour.id,
        goldDispatchId: dispatch.id,
        // Same denormalisation as the pour above. Without it the settlement
        // receipts page renders "No sales recorded" over four seeded receipts.
        companyId,
        receiptNumber: `FPR-${pad(index, 6)}`,
        receiptDate,
        assayResult: dec(assay, 4),
        paidAmount: dec(gross * assay * price, 2),
        paymentMethod: "BANK_TRANSFER",
        paymentChannel: "RTGS",
        paymentReference: `TT${Math.floor(between(100000, 999999))}`,
        goldPriceUsdPerGram: dec(price, 2),
        valuationDate: receiptDate,
      },
    });
    receiptCount += 1;
  }
  console.log(
    `  ${pourCount} pours, ${dispatchCount} dispatches, ${receiptCount} buyer receipts ` +
      "(one bar in the safe, one in transit)",
  );

  /* ── Exceptions ───────────────────────────────────────────────────── */

  const exceptions = [
    {
      category: "INVENTORY_DEFICIT" as const,
      severity: "CRITICAL" as const,
      status: "OPEN" as const,
      description:
        "Shaft 2 inventory is 4.812 g short of the sum of its allocations for the fortnight to " +
        `${daysBefore(14).toISOString().slice(0, 10)}. No pour or dispatch accounts for the difference.`,
    },
    {
      category: "WITNESS_MISSING" as const,
      severity: "WARNING" as const,
      status: "ACKNOWLEDGED" as const,
      description: "BAR-0002 was poured with one witness recorded rather than two.",
    },
    {
      category: "EXPENSE_MISMATCH" as const,
      severity: "WARNING" as const,
      status: "RESOLVED" as const,
      description: "Milling expense on the night shift exceeded the shift's recovered weight.",
    },
  ];

  for (const exception of exceptions) {
    const existing = await prisma.goldException.findFirst({
      where: { companyId, description: exception.description },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.goldException.create({
      data: {
        companyId,
        siteId: sites[1].id,
        category: exception.category,
        severity: exception.severity,
        status: exception.status,
        description: exception.description,
        createdById: clerkId,
        acknowledgedById: exception.status === "OPEN" ? null : managerId,
        acknowledgedAt: exception.status === "OPEN" ? null : daysBefore(10),
        resolvedById: exception.status === "RESOLVED" ? managerId : null,
        resolvedAt: exception.status === "RESOLVED" ? daysBefore(8) : null,
      },
    });
  }
  console.log(`  ${exceptions.length} exceptions (one open, one acknowledged, one resolved)`);

  /* ── A closed period ──────────────────────────────────────────────── */

  const periodStart = daysBefore(DAYS);
  const periodEnd = daysBefore(60);
  const closed = await prisma.goldPeriodClose.findFirst({
    where: { companyId, periodStart, periodEnd },
    select: { id: true },
  });
  if (!closed) {
    await prisma.goldPeriodClose.create({
      data: { companyId, periodStart, periodEnd, closedById: managerId, closedAt: daysBefore(59) },
    });
  }
  console.log(
    `  1 closed period (${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)})`,
  );

  /* ── Sign-in card ─────────────────────────────────────────────────── */

  console.log("\nSign in as:");
  for (const person of STAFF) {
    console.log(
      `  ${person.role.padEnd(9)} ${`${person.first}.${person.last}@${SLUG}.test`.toLowerCase()}`,
    );
  }
  console.log(`  password ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
