/**
 * A CRM that has been running for a year.
 *
 * `seed-crm-demo.ts` gives the module six companies and ten leads, which is
 * enough to see that a board draws and not enough to judge anything else: a
 * timeline with two entries does not scroll, a list of six rows never paginates,
 * an approval that nobody ever answered cannot show you what a declined quote
 * looks like. Screens are judged on how they behave when they are full.
 *
 * So this lays down twelve months of trading on top of that: companies and the
 * people at them, leads that arrived and were worked and were won or lost or
 * quietly archived, deals moving through a pipeline, and — the part that
 * matters most for the record pages — several thousand activities, tasks,
 * visits, comments and documents spread across the year rather than all dated
 * today.
 *
 * Deterministic. The generator is a seeded LCG, so two runs produce the same
 * book of business and a screenshot diff means a code change rather than fresh
 * random data. Idempotent by record number.
 *
 * Never point it at production.
 *
 *   npx tsx scripts/seed-crm-year.ts --slug crmdemo
 *   npx tsx scripts/seed-crm-year.ts --slug crmdemo --months 12 --leads 180
 */
import type { CrmActivityType, CrmLeadStage, Prisma } from "@prisma/client";

import { disconnectPrisma, prisma } from "./platform/prisma";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === `--${name}`) return process.argv[index + 1];
    if (argument.startsWith(prefix)) return argument.slice(prefix.length);
  }
  return undefined;
}

/**
 * A seeded generator, so the book of business is the same every run.
 *
 * `Math.random` would mean every screenshot pass produced different figures,
 * and a visual diff could never distinguish "the layout changed" from "the
 * data changed".
 */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const random = makeRandom(20260815);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (probability: number) => random() < probability;

const DAY = 24 * 60 * 60 * 1000;

/**
 * N days back, at a plausible hour of that working day.
 *
 * Subtracting whole days from `Date.now()` gives every row in the year the
 * same time of day — the minute the seed happened to run — and a timeline
 * where forty consecutive events all say "9:06 PM" reads as fake at a glance
 * and hides any bug in how the UI groups by time.
 */
const daysAgo = (count: number) => {
  const date = new Date(Date.now() - count * DAY);
  date.setHours(between(8, 17), between(0, 59), between(0, 59), 0);
  return date;
};
const daysAhead = (count: number) => new Date(Date.now() + count * DAY);

const TRADING_NAMES = [
  "Lux Liqour", "Zambezi Mining Supplies", "Highveld Logistics", "Msasa Property Group",
  "Nyanga Coffee Estate", "Chitungwiza Medical Centre", "Borrowdale Hardware",
  "Kariba Fisheries", "Mutare Timber Works", "Gweru Steel", "Victoria Falls Safaris",
  "Chinhoyi Agrichem", "Bulawayo Bottling", "Ruwa Plastics", "Norton Grain Millers",
  "Marondera Dairy", "Hwange Colliery Services", "Kadoma Textiles", "Bindura Fertiliser",
  "Rusape Transport", "Chegutu Poultry", "Zvishavane Quarry", "Beitbridge Clearing",
  "Kwekwe Engineering", "Shurugwi Platinum Supply", "Masvingo Motors", "Gokwe Cotton Co-op",
  "Banket Irrigation", "Karoi Tobacco Floors", "Mvurwi Seed House", "Chiredzi Sugar Services",
  "Plumtree Freight", "Redcliff Foundry", "Chipinge Tea Estates", "Murewa Builders",
];

const INDUSTRIES = [
  "Retail", "Mining", "Transport", "Property", "Agriculture", "Healthcare",
  "Manufacturing", "Hospitality", "Construction", "Education",
];

const CITIES = [
  "Harare", "Bulawayo", "Mutare", "Gweru", "Kwekwe", "Masvingo", "Chinhoyi",
  "Marondera", "Kadoma", "Bindura", "Victoria Falls", "Chiredzi",
];

const FIRST_NAMES = [
  "Tendai", "Rutendo", "Blessing", "Farai", "Nyasha", "Chipo", "Simba", "Anesu",
  "Tafara", "Rumbidzai", "Takudzwa", "Vimbai", "Tapiwa", "Shamiso", "Munashe",
  "Kudzai", "Panashe", "Tinashe", "Rufaro", "Nokutenda", "Batsirai", "Chiedza",
];

const LAST_NAMES = [
  "Moyo", "Chikafu", "Ncube", "Dube", "Mutsvangwa", "Marange", "Nyathi", "Gwena",
  "Sibanda", "Mhlanga", "Chirwa", "Makoni", "Zhou", "Mangwiro", "Chinamasa",
  "Muponda", "Ziyambi", "Nyoni", "Mabhena", "Chademana",
];

const JOB_TITLES = [
  "Operations Director", "Finance Manager", "Procurement Lead", "Site Manager",
  "Managing Director", "Estate Manager", "IT Lead", "Head of Retail",
  "General Manager", "Financial Controller", "Stores Supervisor", "Plant Manager",
];

const SOURCES = [
  "Referral", "Website", "Trade show", "Cold call", "Inbound email",
  "LinkedIn", "Existing customer", "Partner", "Walk-in",
];

const LEAD_STAGES: CrmLeadStage[] = [
  "NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT", "QUOTED", "INVOICED", "WON", "LOST",
];

const WORK = [
  "stock control rollout", "weighbridge integration", "fleet tracking", "payroll migration",
  "point-of-sale refresh", "CCTV expansion", "site survey", "inventory count",
  "billing portal", "workshop scheduling", "fuel monitoring", "asset register",
  "compliance pack", "reporting dashboard", "second-site rollout", "handheld scanners",
];

const NOTE_BODIES = [
  "Rang to confirm the scope. They want the second branch included from the start.",
  "Left a voicemail — will try again on Thursday.",
  "Sent the revised pricing across. Waiting on their finance sign-off.",
  "Met on site. The yard is bigger than the drawing suggested, so add a second reader.",
  "They asked whether we can phase the payment over two quarters.",
  "Procurement have gone quiet since the budget freeze.",
  "Good call — they are ready to move once the new depot opens.",
  "Asked for references from another mining client before they commit.",
  "Follow-up after the demo: the reporting is what sold it.",
  "They are comparing us against an incumbent supplier on price alone.",
  "Confirmed the go-live date. Training booked for the week before.",
  "Chased the signed order. Their MD is travelling until the 14th.",
  "Walked their ops lead through the handheld workflow. No objections.",
  "They want a trial at one branch before committing the group.",
  "Their IT will not open the firewall for the sync — needs a call with us.",
  "Quote resent with the training line itemised, as they asked.",
  "Site is further out than we priced. Travel needs adding.",
  "Spoke to the FD directly. The number is fine, the timing is not.",
  "They have had a bad experience with a similar rollout. Go carefully.",
  "Warehouse manager is the real decision maker here, not procurement.",
  "Agreed a deposit of 40% and the balance on commissioning.",
  "Deferred to next quarter — capex is frozen until the audit closes.",
  "Wants the scanners bundled rather than billed separately.",
  "Introduced to their second site. Same setup, same problems.",
  "Sent the reference pack. Two of the names are on their board.",
  "They pushed back on the licence term. Offered 24 months instead of 36.",
  "Delivery slipped a week; told them before they noticed.",
  "Everything signed. Kickoff booked for the first Monday of the month.",
];

const COMMENT_BODIES = [
  "Worth pushing on this one — they have budget this quarter.",
  "@team heads up, their finance manager wants the quote in USD not ZWL.",
  "I have seen this pattern before. They will ask for a discount at the last minute.",
  "Handing this over while I am on leave. Everything is in the timeline.",
  "Careful with the pricing here, we underquoted the last job at this site.",
  "Nice work getting the site visit booked so quickly.",
];

const TASK_TITLES = [
  "Call about the branch count", "Send the revised quote", "Book the site visit",
  "Chase the signed order", "Confirm the go-live date", "Write the handover note",
  "Check the delivery address", "Follow up on the demo", "Prepare the reference pack",
  "Re-quote with the phased option", "Confirm the training dates", "Close the loop with finance",
];

const ACTIVITY_TYPES: CrmActivityType[] = ["NOTE", "CALL", "EMAIL", "WHATSAPP", "MEETING"];

const STAGES = [
  { name: "Discovery", position: 0, probability: 10, inactivityDays: 7 },
  { name: "Site visit", position: 1, probability: 30, inactivityDays: 10 },
  { name: "Quoted", position: 2, probability: 55, inactivityDays: 14 },
  { name: "Negotiation", position: 3, probability: 75, inactivityDays: 10 },
  { name: "Won", position: 4, probability: 100, inactivityDays: null },
  { name: "Lost", position: 5, probability: 0, inactivityDays: null },
];

async function main() {
  const slug = (readArg("slug") ?? "crmdemo").trim().toLowerCase();
  const months = Number(readArg("months") ?? 12);
  const leadCount = Number(readArg("leads") ?? 180);
  const window = Math.round(months * 30);

  if (/\bprod(uction)?\b/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("DATABASE_URL looks like production. Refusing to seed.");
  }

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`No tenant with slug ${slug}. Seed one first.`);
  const companyId = company.id;

  const users = await prisma.user.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (users.length === 0) throw new Error("The tenant has no active users to own records.");
  const userIds = users.map((user) => user.id);
  const owner = () => pick(userIds);

  // ---- Companies ---------------------------------------------------------
  const clients: string[] = [];
  for (let index = 0; index < TRADING_NAMES.length; index += 1) {
    const name = TRADING_NAMES[index];
    const clientNo = `CRMC-${String(index + 1).padStart(4, "0")}`;
    const city = pick(CITIES);
    const slugged = name.toLowerCase().replace(/[^a-z]+/g, "");
    const client = await prisma.crmClient.upsert({
      where: { companyId_clientNo: { companyId, clientNo } },
      update: { name },
      create: {
        companyId,
        clientNo,
        name,
        industry: pick(INDUSTRIES),
        city,
        country: "Zimbabwe",
        email: `accounts@${slugged}.co.zw`,
        emailNormalized: `accounts@${slugged}.co.zw`,
        phone: `+263 77 ${between(100, 999)} ${between(1000, 9999)}`,
        website: `https://${slugged}.co.zw`,
        addressLine: `${between(1, 240)} ${pick(["Samora Machel", "Sam Nujoma", "Robert Mugabe", "Leopold Takawira"])} Avenue`,
        assignedToId: owner(),
        createdAt: daysAgo(between(window - 30, window)),
      },
      select: { id: true },
    });
    clients.push(client.id);
  }

  // ---- People ------------------------------------------------------------
  const people: Array<{ id: string; clientIndex: number; fullName: string }> = [];
  let personSeq = 0;
  for (let clientIndex = 0; clientIndex < clients.length; clientIndex += 1) {
    for (let n = 0; n < between(2, 5); n += 1) {
      personSeq += 1;
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const fullName = `${first} ${last}`;
      const personNo = `CRMP-${String(personSeq).padStart(4, "0")}`;
      const email = `${first.toLowerCase()}.${last.toLowerCase()}${personSeq}@example.co.zw`;
      const person = await prisma.crmPerson.upsert({
        where: { companyId_personNo: { companyId, personNo } },
        update: { fullName },
        create: {
          companyId,
          personNo,
          firstName: first,
          lastName: last,
          fullName,
          jobTitle: pick(JOB_TITLES),
          email,
          emailNormalized: email,
          phone: `+263 71 ${between(100, 999)} ${between(1000, 9999)}`,
          clientId: clients[clientIndex],
          assignedToId: owner(),
          createdAt: daysAgo(between(1, window)),
        },
        select: { id: true },
      });
      people.push({ id: person.id, clientIndex, fullName });
    }
  }

  // ---- Sites -------------------------------------------------------------
  const sites: Array<{ id: string; clientIndex: number }> = [];
  let siteSeq = 0;
  for (let clientIndex = 0; clientIndex < clients.length; clientIndex += 1) {
    if (!chance(0.6)) continue;
    for (let n = 0; n < between(1, 3); n += 1) {
      siteSeq += 1;
      const siteNo = `CRMS-${String(siteSeq).padStart(4, "0")}`;
      const city = pick(CITIES);
      const site = await prisma.crmSite.upsert({
        where: { companyId_siteNo: { companyId, siteNo } },
        update: {},
        create: {
          companyId,
          siteNo,
          name: `${TRADING_NAMES[clientIndex]} — ${pick(["Depot", "Yard", "Branch", "Warehouse", "Plant"])} ${n + 1}`,
          clientId: clients[clientIndex],
          addressLine: `${between(1, 90)} ${pick(["Industrial", "Airport", "Mutare", "Bulawayo"])} Road`,
          city,
          country: "Zimbabwe",
          accessInstructions: chance(0.5)
            ? "Report to the gatehouse. Hard hat and hi-vis required beyond the weighbridge."
            : null,
          createdAt: daysAgo(between(1, window)),
        },
        select: { id: true },
      });
      sites.push({ id: site.id, clientIndex });
    }
  }

  // ---- Pipeline ----------------------------------------------------------
  const pipeline = await prisma.crmPipeline.upsert({
    where: { companyId_name: { companyId, name: "Sales" } },
    update: { isDefault: true, isActive: true },
    create: { companyId, name: "Sales", isDefault: true, position: 0 },
    select: { id: true },
  });

  const stages = [];
  for (const stage of STAGES) {
    stages.push(
      await prisma.crmPipelineStage.upsert({
        where: { pipelineId_name: { pipelineId: pipeline.id, name: stage.name } },
        update: { position: stage.position, probability: stage.probability },
        create: {
          companyId,
          pipelineId: pipeline.id,
          name: stage.name,
          position: stage.position,
          probability: stage.probability,
          inactivityDays: stage.inactivityDays,
          status: stage.name === "Won" ? "WON" : stage.name === "Lost" ? "LOST" : "OPEN",
        },
        select: { id: true, status: true, name: true },
      }),
    );
  }

  // ---- Leads -------------------------------------------------------------
  //
  // Spread across the year rather than dated today, and weighted the way a real
  // book is: most of the old ones are finished, most of the recent ones are
  // still moving. A third of the finished ones are archived, which is what
  // makes the Archived view worth looking at.
  const leads: Array<{ id: string; clientIndex: number; createdAt: Date; archived: boolean }> = [];
  for (let index = 0; index < leadCount; index += 1) {
    const leadNo = `CRMD-${String(index + 1).padStart(4, "0")}`;
    const age = between(0, window);
    const createdAt = daysAgo(age);
    const clientIndex = between(0, clients.length - 1);
    const contact = people.filter((person) => person.clientIndex === clientIndex)[0];
    // Older leads have had time to finish; recent ones are still in play.
    const settled = age > 60 ? chance(0.8) : chance(0.2);
    const stage: CrmLeadStage = settled
      ? pick(["WON", "LOST"] as CrmLeadStage[])
      : pick(LEAD_STAGES.slice(0, 6));
    const archived = settled && chance(0.4);

    const lead = await prisma.crmLead.upsert({
      where: { companyId_leadNo: { companyId, leadNo } },
      update: { stage, archivedAt: archived ? daysAgo(between(1, age || 1)) : null },
      create: {
        companyId,
        leadNo,
        title: `${TRADING_NAMES[clientIndex]} ${pick(WORK)}`,
        stage,
        estimatedValue: between(8, 460) * 100,
        currency: "USD",
        probability: between(5, 95),
        clientId: clients[clientIndex],
        contactName: contact?.fullName ?? null,
        contactEmail: "buyer@example.co.zw",
        contactPhone: `+263 77 ${between(100, 999)} ${between(1000, 9999)}`,
        source: pick(SOURCES),
        assignedToId: owner(),
        createdById: owner(),
        createdAt,
        firstContactAt: stage === "NEW" ? null : daysAgo(Math.max(0, age - between(1, 4))),
        wonAt: stage === "WON" ? daysAgo(Math.max(0, age - between(5, 30))) : null,
        lostAt: stage === "LOST" ? daysAgo(Math.max(0, age - between(5, 30))) : null,
        lostReason: stage === "LOST" ? pick([
          "Went with an incumbent supplier",
          "Budget pulled for the quarter",
          "Price — we were 20% over",
          "Project shelved after a restructure",
        ]) : null,
        archivedAt: archived ? daysAgo(between(1, Math.max(1, age))) : null,
        archivedById: archived ? owner() : null,
      },
      select: { id: true },
    });
    leads.push({ id: lead.id, clientIndex, createdAt, archived });
  }

  // ---- Deals -------------------------------------------------------------
  const deals: Array<{ id: string; clientIndex: number; createdAt: Date }> = [];
  const dealCount = Math.round(leadCount / 2);
  for (let index = 0; index < dealCount; index += 1) {
    const dealNo = `DEAL-${String(index + 1).padStart(4, "0")}`;
    const age = between(0, window);
    const clientIndex = between(0, clients.length - 1);
    const stage = age > 70 ? pick([stages[4], stages[5]]) : pick(stages.slice(0, 4));
    const contact = people.filter((person) => person.clientIndex === clientIndex)[0];
    const site = sites.filter((entry) => entry.clientIndex === clientIndex)[0];

    const deal = await prisma.crmDeal.upsert({
      where: { companyId_dealNo: { companyId, dealNo } },
      update: { stageId: stage.id, status: stage.status },
      create: {
        companyId,
        dealNo,
        title: `${TRADING_NAMES[clientIndex]} ${pick(WORK)}`,
        pipelineId: pipeline.id,
        stageId: stage.id,
        status: stage.status,
        value: between(20, 900) * 100,
        currency: "USD",
        probability: stage.status === "WON" ? 100 : between(10, 90),
        clientId: clients[clientIndex],
        primaryContactId: contact?.id ?? null,
        siteId: site?.id ?? null,
        expectedCloseDate: stage.status === "OPEN" ? daysAhead(between(-10, 60)) : daysAgo(between(1, age || 1)),
        assignedToId: owner(),
        createdById: owner(),
        createdAt: daysAgo(age),
        stageEnteredAt: daysAgo(between(0, Math.min(age, 30))),
        wonAt: stage.status === "WON" ? daysAgo(between(1, Math.max(1, age))) : null,
        lostAt: stage.status === "LOST" ? daysAgo(between(1, Math.max(1, age))) : null,
        lostReason: stage.status === "LOST" ? "Went with an incumbent supplier" : null,
      },
      select: { id: true },
    });
    deals.push({ id: deal.id, clientIndex, createdAt: daysAgo(age) });

    if (contact) {
      const existing = await prisma.crmDealContact.findFirst({
        where: { companyId, dealId: deal.id, personId: contact.id },
        select: { id: true },
      });
      if (!existing) {
        await prisma.crmDealContact.create({
          data: { companyId, dealId: deal.id, personId: contact.id, role: "PRIMARY" },
        });
      }
    }
  }

  // ---- Activity ----------------------------------------------------------
  //
  // The bulk of it, and the reason this script exists: a record page with two
  // timeline entries tells you nothing about how it reads with eighty.
  const existingActivity = await prisma.crmActivity.count({ where: { companyId } });
  const activityRows: Prisma.CrmActivityCreateManyInput[] = [];
  if (existingActivity < 500) {
    for (const lead of leads) {
      const ageDays = Math.round((Date.now() - lead.createdAt.getTime()) / DAY);
      for (let n = 0; n < between(0, 14); n += 1) {
        const type = pick(ACTIVITY_TYPES);
        const body = pick(NOTE_BODIES);
        activityRows.push({
          companyId,
          type,
          leadId: lead.id,
          clientId: clients[lead.clientIndex],
          subject: body.slice(0, 120),
          body,
          occurredAt: daysAgo(between(0, Math.max(1, ageDays))),
          createdById: owner(),
        });
      }
    }
    for (const deal of deals) {
      const ageDays = Math.round((Date.now() - deal.createdAt.getTime()) / DAY);
      for (let n = 0; n < between(2, 20); n += 1) {
        const body = pick(NOTE_BODIES);
        activityRows.push({
          companyId,
          type: pick(ACTIVITY_TYPES),
          dealId: deal.id,
          clientId: clients[deal.clientIndex],
          subject: body.slice(0, 120),
          body,
          occurredAt: daysAgo(between(0, Math.max(1, ageDays))),
          createdById: owner(),
        });
      }
    }
    // `createMany` in chunks: one statement with twenty thousand rows in it is
    // how a seed script runs out of parameters.
    for (let index = 0; index < activityRows.length; index += 1000) {
      await prisma.crmActivity.createMany({ data: activityRows.slice(index, index + 1000) });
    }
  }

  // ---- Tasks and follow-ups ---------------------------------------------
  const existingTasks = await prisma.crmTask.count({ where: { companyId } });
  if (existingTasks < 100) {
    const taskRows: Prisma.CrmTaskCreateManyInput[] = [];
    for (const deal of deals) {
      for (let n = 0; n < between(0, 4); n += 1) {
        const done = chance(0.55);
        taskRows.push({
          companyId,
          title: pick(TASK_TITLES),
          dueAt: done ? daysAgo(between(1, 120)) : daysAhead(between(-14, 21)),
          dealId: deal.id,
          subjectType: "DEAL" as const,
          subjectId: deal.id,
          assignedToId: owner(),
          status: done ? ("COMPLETED" as const) : ("OPEN" as const),
          completedAt: done ? daysAgo(between(1, 120)) : null,
          priority: chance(0.25) ? ("HIGH" as const) : ("NORMAL" as const),
        });
      }
    }
    for (let index = 0; index < taskRows.length; index += 500) {
      await prisma.crmTask.createMany({ data: taskRows.slice(index, index + 500) });
    }

    const followUpRows: Prisma.CrmFollowUpCreateManyInput[] = [];
    for (const lead of leads) {
      if (!chance(0.4)) continue;
      const done = chance(0.5);
      followUpRows.push({
        companyId,
        title: pick(TASK_TITLES),
        dueAt: done ? daysAgo(between(1, 90)) : daysAhead(between(-10, 20)),
        leadId: lead.id,
        clientId: clients[lead.clientIndex],
        assignedToId: owner(),
        status: done ? ("COMPLETED" as const) : ("PENDING" as const),
        completedAt: done ? daysAgo(between(1, 90)) : null,
      });
    }
    for (let index = 0; index < followUpRows.length; index += 500) {
      await prisma.crmFollowUp.createMany({ data: followUpRows.slice(index, index + 500) });
    }
  }

  // ---- Comments ----------------------------------------------------------
  const existingComments = await prisma.crmComment.count({ where: { companyId } });
  if (existingComments < 50) {
    const commentRows: Prisma.CrmCommentCreateManyInput[] = [];
    for (const deal of deals) {
      for (let n = 0; n < between(0, 3); n += 1) {
        commentRows.push({
          companyId,
          dealId: deal.id,
          body: pick(COMMENT_BODIES),
          createdById: owner(),
          createdAt: daysAgo(between(1, 200)),
        });
      }
    }
    for (const lead of leads.slice(0, 60)) {
      if (!chance(0.5)) continue;
      commentRows.push({
        companyId,
        leadId: lead.id,
        body: pick(COMMENT_BODIES),
        createdById: owner(),
        createdAt: daysAgo(between(1, 200)),
      });
    }
    for (let index = 0; index < commentRows.length; index += 500) {
      await prisma.crmComment.createMany({ data: commentRows.slice(index, index + 500) });
    }
  }

  // ---- Visits ------------------------------------------------------------
  const existingVisits = await prisma.crmAppointment.count({ where: { companyId } });
  if (existingVisits < 40) {
    let visitSeq = existingVisits;
    for (const deal of deals.slice(0, 60)) {
      if (!chance(0.5)) continue;
      visitSeq += 1;
      const past = chance(0.6);
      const site = sites.filter((entry) => entry.clientIndex === deal.clientIndex)[0];
      await prisma.crmAppointment.create({
        data: {
          companyId,
          appointmentNo: `CRMA-${String(visitSeq).padStart(4, "0")}`,
          title: pick(["Site visit", "Scoping visit", "Install survey", "Handover walkthrough"]),
          dealId: deal.id,
          clientId: clients[deal.clientIndex],
          siteId: site?.id ?? null,
          scheduledStart: past ? daysAgo(between(1, 180)) : daysAhead(between(1, 21)),
          // Past and still "scheduled" is the state a record page should be
          // shouting about: somebody went and never wrote it up.
          status: past
            ? chance(0.75)
              ? ("COMPLETED" as const)
              : ("SCHEDULED" as const)
            : ("SCHEDULED" as const),
          location: `${between(1, 90)} Industrial Road`,
          assignedToId: owner(),
        },
      });
    }
  }

  // ---- Paperwork ---------------------------------------------------------
  //
  // A year of trading with no quotes or invoices is not a year of trading, and
  // it leaves the Documents section — approval feedback, deposits, part
  // payments — with nothing to show. Each deal old enough to have been quoted
  // gets a quote; some of those become an invoice; some of those get paid, in
  // full or in part.
  const existingDocs = await prisma.crmLeadDocument.count({ where: { companyId } });
  if (existingDocs < 30) {
    // Sales lives against `Customer`, the CRM against `CrmClient`. The link
    // between them is what lets a quote raised here be recognised over there.
    const customerIds: string[] = [];
    for (let index = 0; index < clients.length; index += 1) {
      const existing = await prisma.crmClient.findUnique({
        where: { id: clients[index] },
        select: { customerId: true, name: true, email: true, phone: true },
      });
      if (existing?.customerId) {
        customerIds.push(existing.customerId);
        continue;
      }
      const customer = await prisma.customer.create({
        data: {
          companyId,
          name: existing?.name ?? TRADING_NAMES[index],
          email: existing?.email ?? null,
          phone: existing?.phone ?? null,
        },
        select: { id: true },
      });
      await prisma.crmClient.update({
        where: { id: clients[index] },
        data: { customerId: customer.id },
      });
      customerIds.push(customer.id);
    }

    let quoteSeq = 0;
    let invoiceSeq = 0;
    let receiptSeq = 0;

    for (const deal of deals) {
      const ageDays = Math.round((Date.now() - deal.createdAt.getTime()) / DAY);
      if (ageDays < 14 || !chance(0.7)) continue;

      const customerId = customerIds[deal.clientIndex];
      const quotedAt = daysAgo(between(Math.max(1, ageDays - 10), ageDays));
      const subTotal = between(15, 780) * 100;
      const taxTotal = Math.round(subTotal * 0.15);
      const total = subTotal + taxTotal;

      quoteSeq += 1;
      const quotation = await prisma.salesQuotation.create({
        data: {
          companyId,
          customerId,
          quotationNumber: `QT-${String(quoteSeq).padStart(5, "0")}`,
          quotationDate: quotedAt,
          validUntil: new Date(quotedAt.getTime() + 30 * DAY),
          status: "SENT",
          currency: "USD",
          subTotal,
          taxTotal,
          total,
          issuedAt: quotedAt,
          issuedById: owner(),
          createdById: owner(),
          createdAt: quotedAt,
          lines: {
            create: [
              {
                description: `${pick(WORK)} — supply and commissioning`,
                quantity: 1,
                unitPrice: subTotal,
                taxRate: 15,
                taxAmount: taxTotal,
                lineTotal: total,
              },
            ],
          },
        },
        select: { id: true },
      });

      const quoteDoc = await prisma.crmLeadDocument.create({
        data: {
          companyId,
          dealId: deal.id,
          type: "QUOTATION",
          quotationId: quotation.id,
          amount: total,
          currency: "USD",
          createdById: owner(),
          createdAt: quotedAt,
        },
        select: { id: true },
      });

      // What the client did with it. Four outcomes, because "sent" and
      // "opened and ignored" are different facts and the panel draws them
      // differently.
      const roll = random();
      const sentAt = new Date(quotedAt.getTime() + between(1, 6) * 3600_000);
      await prisma.crmDocumentApproval.create({
        data: {
          companyId,
          leadDocumentId: quoteDoc.id,
          token: `seed-${quoteDoc.id}`,
          status: roll < 0.45 ? "APPROVED" : roll < 0.6 ? "DECLINED" : "PENDING",
          createdAt: sentAt,
          firstViewedAt: roll < 0.8 ? new Date(sentAt.getTime() + between(1, 72) * 3600_000) : null,
          respondedAt: roll < 0.6 ? new Date(sentAt.getTime() + between(24, 240) * 3600_000) : null,
          responderName: roll < 0.6 ? pick(FIRST_NAMES) + " " + pick(LAST_NAMES) : null,
          responseNote:
            roll < 0.45
              ? pick([
                  "Approved. Please invoice against PO 44821.",
                  "Happy with this — go ahead.",
                  "Approved subject to the training being included.",
                ])
              : roll < 0.6
                ? pick([
                    "Too high against the other bid. Can you revisit the licence line?",
                    "Not this quarter — budget is closed.",
                  ])
                : null,
        },
      });

      // Only approved quotes become invoices, which is what makes the
      // Documents section legible: the money follows the answer.
      if (roll >= 0.45 || !chance(0.8)) continue;

      const invoicedAt = daysAgo(between(0, Math.max(1, ageDays - 12)));
      const deposit = chance(0.4);
      const invoiceTotal = deposit ? Math.round(total * 0.4) : total;
      const paidRoll = random();
      const amountPaid =
        paidRoll < 0.4 ? invoiceTotal : paidRoll < 0.75 ? Math.round(invoiceTotal * 0.5) : 0;

      invoiceSeq += 1;
      const invoice = await prisma.salesInvoice.create({
        data: {
          companyId,
          customerId,
          quotationId: quotation.id,
          invoiceNumber: `INV-${String(invoiceSeq).padStart(5, "0")}`,
          invoiceDate: invoicedAt,
          dueDate: new Date(invoicedAt.getTime() + 30 * DAY),
          status: amountPaid >= invoiceTotal ? "PAID" : "ISSUED",
          currency: "USD",
          subTotal: Math.round(invoiceTotal / 1.15),
          taxTotal: invoiceTotal - Math.round(invoiceTotal / 1.15),
          total: invoiceTotal,
          amountPaid,
          issuedAt: invoicedAt,
          issuedById: owner(),
          createdById: owner(),
          createdAt: invoicedAt,
          lines: {
            create: [
              {
                description: deposit ? "Deposit — 40% on order" : "Supply and commissioning",
                quantity: 1,
                unitPrice: Math.round(invoiceTotal / 1.15),
                taxRate: 15,
                taxAmount: invoiceTotal - Math.round(invoiceTotal / 1.15),
                lineTotal: invoiceTotal,
              },
            ],
          },
        },
        select: { id: true },
      });

      await prisma.crmLeadDocument.create({
        data: {
          companyId,
          dealId: deal.id,
          type: "INVOICE",
          invoiceId: invoice.id,
          amount: invoiceTotal,
          currency: "USD",
          isDeposit: deposit,
          createdById: owner(),
          createdAt: invoicedAt,
        },
      });

      if (amountPaid <= 0) continue;

      receiptSeq += 1;
      const receivedAt = new Date(invoicedAt.getTime() + between(2, 40) * DAY);
      const receipt = await prisma.salesReceipt.create({
        data: {
          companyId,
          invoiceId: invoice.id,
          receiptNumber: `RCT-${String(receiptSeq).padStart(5, "0")}`,
          receivedAt: receivedAt > new Date() ? new Date() : receivedAt,
          amount: amountPaid,
          method: pick(["EFT", "Cash", "Card", "Mobile money"]),
          reference: `REF${between(100000, 999999)}`,
          createdById: owner(),
        },
        select: { id: true },
      });

      await prisma.crmLeadDocument.create({
        data: {
          companyId,
          dealId: deal.id,
          type: "RECEIPT",
          receiptId: receipt.id,
          amount: amountPaid,
          currency: "USD",
          createdById: owner(),
          createdAt: receivedAt > new Date() ? new Date() : receivedAt,
        },
      });
    }
  }

  const counts = {
    tenant: slug,
    companies: clients.length,
    people: people.length,
    sites: sites.length,
    leads: leads.length,
    archivedLeads: leads.filter((lead) => lead.archived).length,
    deals: deals.length,
    activities: await prisma.crmActivity.count({ where: { companyId } }),
    tasks: await prisma.crmTask.count({ where: { companyId } }),
    followUps: await prisma.crmFollowUp.count({ where: { companyId } }),
    comments: await prisma.crmComment.count({ where: { companyId } }),
    visits: await prisma.crmAppointment.count({ where: { companyId } }),
    quotations: await prisma.crmLeadDocument.count({ where: { companyId, type: "QUOTATION" } }),
    invoices: await prisma.crmLeadDocument.count({ where: { companyId, type: "INVOICE" } }),
    receipts: await prisma.crmLeadDocument.count({ where: { companyId, type: "RECEIPT" } }),
  };
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
