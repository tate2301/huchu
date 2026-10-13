/**
 * Give a local or staging workspace something for Vane's pages to show: the
 * cards, the plan, the jobs and the morning's work the Vane boards draw for
 * Floorcode. For looking at `/vane` and the panel without running Claude.
 *
 *   npx tsx scripts/seed-vane-demo.ts --slug floorcode
 *
 * Idempotent: it removes what it wrote last time (jobs keyed `demo:`, and the
 * cards and plan that hang off them) before writing again. Never point it at
 * production.
 */
import { disconnectPrisma, prisma } from "./platform/prisma";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const minutesAgo = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);

async function main() {
  const slug = readArg("slug");
  if (!slug) throw new Error("--slug is required.");
  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!company) throw new Error(`No workspace ${slug}.`);
  const companyId = company.id;
  const now = new Date();

  // What the last run wrote.
  const old = await prisma.vaneJob.findMany({ where: { companyId, key: { startsWith: "demo:" } }, select: { id: true } });
  await prisma.vaneItem.deleteMany({ where: { companyId, jobId: { in: old.map((job) => job.id) } } });
  await prisma.vanePlan.deleteMany({ where: { companyId, title: { in: ["VAT for September", "P2 and NSSA for September"] } } });
  await prisma.vaneJob.deleteMany({ where: { companyId, key: { startsWith: "demo:" } } });

  await prisma.vaneSettings.upsert({ where: { companyId }, create: { companyId }, update: { paused: false } });

  const job = (key: string, label: string, data: Record<string, unknown> = {}) =>
    prisma.vaneJob.create({
      data: { companyId, key: `demo:${key}`, kind: "demo", label, trigger: "NIGHTLY", status: "DONE", ...data },
    });

  // The morning's work, finished.
  const nightly = await job("nightly", "Looking over the workspace", {
    startedAt: minutesAgo(now, 200),
    finishedAt: minutesAgo(now, 190),
    result: "Matched 3 bank lines",
    tools: [{ name: "run_sql", ms: 120, ok: true }],
  });
  const finished: Array<[string, number]> = [
    ["Drafted 3 reminders", 186],
    ["Wrote this week's insights", 184],
    ["Wrote the Borrowdale Brooke invoice", 172],
    ["Checked 14 quotes against the price list", 164],
  ];
  for (const [text, ago] of finished) {
    await job(`done:${ago}`, text, { startedAt: minutesAgo(now, ago + 1), finishedAt: minutesAgo(now, ago), result: text });
  }

  // What it is on now.
  await job("running:cbz", "Reading the CBZ statement Rudo uploaded", {
    status: "RUNNING",
    trigger: "PERSON",
    startedAt: minutesAgo(now, 2),
    progressDone: 38,
    progressTotal: 61,
  });
  await job("queued:vat", "Finding VAT numbers on 2 receipts", { status: "QUEUED", trigger: "SCHEDULE", runAfter: now });

  const card = (data: {
    kind: "ISSUE" | "SUGGESTION";
    sourceModule: string;
    headline: string;
    body: string;
    action: Record<string, unknown>;
    minutes: number;
  }) =>
    prisma.vaneItem.create({
      data: {
        companyId,
        jobId: nightly.id,
        kind: data.kind,
        sourceModule: data.sourceModule,
        headline: data.headline,
        body: data.body,
        action: data.action,
        readFrom: [{ table: "SalesInvoice", rows: 3, about: "past their terms" }],
        sql: 'SELECT "number", "total" FROM "SalesInvoice" WHERE "status" = \'OVERDUE\'',
        createdAt: minutesAgo(now, data.minutes),
      },
    });

  await card({
    kind: "SUGGESTION",
    sourceModule: "books",
    headline: "3 invoices are overdue, $2,480.00.",
    body: "Chisipite Dental is later than they usually pay. Let's send the 3 reminders I drafted.",
    action: { type: "send", label: "Send 3 reminders", shortcut: "S", target: "/books/invoices?view=overdue", also: { label: "Read them first", target: "/books/invoices?view=overdue" } },
    minutes: 186,
  });
  await card({
    kind: "SUGGESTION",
    sourceModule: "crm",
    headline: "Pomona Offices' quote has waited since Tuesday.",
    body: "Kuda measured 212.40 m² of concrete. The quote is drafted at $8,930.00. Let's send it before the weekend.",
    action: { type: "send", label: "Send the quote", target: "/crm/quotes", also: { label: "Open it", target: "/crm/quotes" } },
    minutes: 187,
  });
  await card({
    kind: "ISSUE",
    sourceModule: "retail",
    headline: "Monday's cash-up was short again.",
    body: "$12.00 on Till 1, the third time since August, each time on the morning shift. Let's go through that shift's cash sales.",
    action: { type: "review", label: "Show the sales", target: "/retail/sales" },
    minutes: 188,
  });
  await card({
    kind: "SUGGESTION",
    sourceModule: "crm",
    headline: "A deal was won 4 days ago with no invoice.",
    body: "Borrowdale Brooke Clinic. I wrote the invoice from the accepted quote, $6,400.00. Let's check it and send it.",
    action: { type: "open", label: "Open the invoice", target: "/books/invoices" },
    minutes: 189,
  });
  await card({
    kind: "SUGGESTION",
    sourceModule: "reports",
    headline: "You narrow the Monday board by fitter every week.",
    body: "I wrote a by-fitter question that answers it in one table. Let's add it to the board.",
    action: { type: "open", label: "Add to the board", target: "/reports" },
    minutes: 190,
  });

  // What James set aside, and why.
  const james = await prisma.user.findFirst({ where: { companyId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const setAside: Array<[string, string, string, number]> = [
    ["retail", "Monday's cash-up was short, $12.00", "Already done", 8],
    ["crm", "Quote for Mrs T. Gumbo has waited 3 days", "Not mine", 11],
    ["books", "Fuel spend is up 18% on September", "Wrong", 15],
  ];
  for (const [sourceModule, headline, reason, daysAgo] of setAside) {
    await prisma.vaneItem.create({
      data: {
        companyId,
        jobId: nightly.id,
        kind: "SUGGESTION",
        sourceModule,
        headline,
        body: "Let's look at it.",
        action: { type: "open", label: "Open it", target: "/vane" },
        status: "MUTED",
        mutedReason: reason,
        resolvedAt: minutesAgo(now, daysAgo * 24 * 60),
        resolvedById: james?.id,
        createdAt: minutesAgo(now, daysAgo * 24 * 60 + 60),
      },
    });
  }

  await prisma.vanePlan.create({
    data: {
      companyId,
      title: "P2 and NSSA for September",
      status: "DONE",
      doneAt: minutesAgo(now, 4 * 24 * 60),
      createdAt: minutesAgo(now, 12 * 24 * 60),
      steps: {
        create: [
          { position: 1, label: "Work out P2 from the September run", owner: "VANE", status: "DONE" },
          { position: 2, label: "File P2 and the NSSA schedule", owner: "PERSON", status: "DONE" },
        ],
      },
    },
  });

  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 25));
  await prisma.vanePlan.create({
    data: {
      companyId,
      title: "VAT for September",
      dueOn: due,
      steps: {
        create: [
          { position: 1, label: "Match the CBZ lines since Friday", owner: "VANE", status: "DONE", progressLabel: "3 of 4", doneAt: minutesAgo(now, 190) },
          { position: 2, label: "Find VAT numbers on 2 receipts", owner: "VANE", status: "NOW" },
          { position: 3, label: "Check the return Vane drafted", owner: "PERSON" },
          { position: 4, label: "File the return on ZIMRA's portal", owner: "PERSON" },
        ],
      },
    },
  });

  console.log(`Vane's demo work is in ${company.name}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
