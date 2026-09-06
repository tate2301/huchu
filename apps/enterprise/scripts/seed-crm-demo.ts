/**
 * Seed a CRM workspace with enough of everything to look at.
 *
 * `seed-staging-tenant.ts` grants the features but leaves the module empty, so
 * every CRM screen renders its empty state and none of them can be judged —
 * which is no use when the thing being changed is how a board, a list or a
 * record page behaves once it has records in it. This fills the module with a
 * small, realistic book of business: companies, the people at them, sites,
 * leads across every stage, a pipeline with deals in it, and the tasks that
 * hang off them.
 *
 * Idempotent by record number — re-running updates rather than duplicating.
 * Never point it at production.
 *
 *   npx tsx scripts/seed-crm-demo.ts --slug crmdemo
 */
import { type CrmLeadStage } from "@corelithzw/db";

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

const days = (count: number) => new Date(Date.now() + count * 24 * 60 * 60 * 1000);

const COMPANIES = [
  { no: "CRMC-0001", name: "Lux Liqour", industry: "Retail", city: "Harare" },
  { no: "CRMC-0002", name: "Zambezi Mining Supplies", industry: "Mining", city: "Kwekwe" },
  { no: "CRMC-0003", name: "Highveld Logistics", industry: "Transport", city: "Bulawayo" },
  { no: "CRMC-0004", name: "Msasa Property Group", industry: "Property", city: "Harare" },
  { no: "CRMC-0005", name: "Nyanga Coffee Estate", industry: "Agriculture", city: "Nyanga" },
  { no: "CRMC-0006", name: "Chitungwiza Medical Centre", industry: "Healthcare", city: "Chitungwiza" },
];

const PEOPLE = [
  { no: "CRMP-0001", first: "Tendai", last: "Moyo", title: "Operations Director", company: 0 },
  { no: "CRMP-0002", first: "Rutendo", last: "Chikafu", title: "Finance Manager", company: 0 },
  { no: "CRMP-0003", first: "Blessing", last: "Ncube", title: "Procurement Lead", company: 1 },
  { no: "CRMP-0004", first: "Farai", last: "Dube", title: "Site Manager", company: 2 },
  { no: "CRMP-0005", first: "Nyasha", last: "Mutsvangwa", title: "Managing Director", company: 3 },
  { no: "CRMP-0006", first: "Chipo", last: "Marange", title: "Estate Manager", company: 4 },
  { no: "CRMP-0007", first: "Simba", last: "Nyathi", title: "IT Lead", company: 5 },
  { no: "CRMP-0008", first: "Anesu", last: "Gwena", title: "Head of Retail", company: 0 },
];

const SITES = [
  { no: "CRMS-0001", name: "Lux Liqour — Borrowdale", company: 0, city: "Harare" },
  { no: "CRMS-0002", name: "Lux Liqour — Avondale", company: 0, city: "Harare" },
  { no: "CRMS-0003", name: "Zambezi Yard 2", company: 1, city: "Kwekwe" },
  { no: "CRMS-0004", name: "Highveld Depot", company: 2, city: "Bulawayo" },
  { no: "CRMS-0005", name: "Msasa Park Block C", company: 3, city: "Harare" },
];

const LEADS: Array<{
  no: string;
  title: string;
  stage: CrmLeadStage;
  value: number;
  company: number;
  source: string;
}> = [
  { no: "CRMD-0001", title: "Deploy Corelith Retail for Lux Liqour", stage: "QUALIFIED", value: 3900, company: 0, source: "Referral" },
  { no: "CRMD-0002", title: "Stock control for Avondale branch", stage: "NEW", value: 1250, company: 0, source: "Website" },
  { no: "CRMD-0003", title: "Weighbridge integration", stage: "CONTACTED", value: 8400, company: 1, source: "Trade show" },
  { no: "CRMD-0004", title: "Fleet tracking rollout", stage: "QUOTED", value: 15600, company: 2, source: "Cold call" },
  { no: "CRMD-0005", title: "Tenant billing portal", stage: "SITE_VISIT", value: 22000, company: 3, source: "Referral" },
  { no: "CRMD-0006", title: "Estate payroll migration", stage: "QUALIFIED", value: 6400, company: 4, source: "Website" },
  { no: "CRMD-0007", title: "Clinic scheduling pilot", stage: "NEW", value: 2800, company: 5, source: "Inbound email" },
  { no: "CRMD-0008", title: "Second-yard stock take", stage: "WON", value: 4700, company: 1, source: "Referral" },
  { no: "CRMD-0009", title: "Depot CCTV expansion", stage: "LOST", value: 9100, company: 2, source: "Cold call" },
  { no: "CRMD-0010", title: "Point-of-sale refresh", stage: "CONTACTED", value: 3300, company: 0, source: "Website" },
];

const STAGES = [
  { name: "Discovery", position: 0, probability: 10, inactivityDays: 7 },
  { name: "Site visit", position: 1, probability: 30, inactivityDays: 10 },
  { name: "Quoted", position: 2, probability: 55, inactivityDays: 14 },
  { name: "Negotiation", position: 3, probability: 75, inactivityDays: 10 },
  { name: "Won", position: 4, probability: 100, inactivityDays: null },
  { name: "Lost", position: 5, probability: 0, inactivityDays: null },
];

const DEALS = [
  { no: "DEAL-0001", title: "Corelith Retail — 4 branches", stage: 2, value: 18400, company: 0, site: 0, contact: 0, close: 12 },
  { no: "DEAL-0002", title: "Weighbridge + stock integration", stage: 1, value: 26500, company: 1, site: 2, contact: 2, close: 26 },
  { no: "DEAL-0003", title: "Fleet telemetry, phase one", stage: 3, value: 41200, company: 2, site: 3, contact: 3, close: 6 },
  { no: "DEAL-0004", title: "Tenant billing portal", stage: 0, value: 9800, company: 3, site: 4, contact: 4, close: 40 },
  { no: "DEAL-0005", title: "Estate payroll and leave", stage: 2, value: 12600, company: 4, site: null, contact: 5, close: 18 },
  { no: "DEAL-0006", title: "Clinic scheduling", stage: 4, value: 7400, company: 5, site: null, contact: 6, close: -3 },
  { no: "DEAL-0007", title: "Avondale expansion", stage: 5, value: 5200, company: 0, site: 1, contact: 7, close: -20 },
];

async function main() {
  const slug = (readArg("slug") ?? "crmdemo").trim().toLowerCase();

  if (/\bprod(uction)?\b/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("DATABASE_URL looks like production. Refusing to seed.");
  }

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`No tenant with slug ${slug}. Seed one first.`);

  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const assignedToId = owner?.id ?? null;

  const clients = [];
  for (const entry of COMPANIES) {
    clients.push(
      await prisma.crmClient.upsert({
        where: { companyId_clientNo: { companyId: company.id, clientNo: entry.no } },
        update: { name: entry.name, industry: entry.industry, city: entry.city },
        create: {
          companyId: company.id,
          clientNo: entry.no,
          name: entry.name,
          industry: entry.industry,
          city: entry.city,
          country: "Zimbabwe",
          email: `hello@${entry.name.toLowerCase().replace(/[^a-z]+/g, "")}.co.zw`,
          phone: "+263 77 000 0000",
          assignedToId,
        },
        select: { id: true },
      }),
    );
  }

  const people = [];
  for (const entry of PEOPLE) {
    const fullName = `${entry.first} ${entry.last}`;
    people.push(
      await prisma.crmPerson.upsert({
        where: { companyId_personNo: { companyId: company.id, personNo: entry.no } },
        update: { fullName, jobTitle: entry.title },
        create: {
          companyId: company.id,
          personNo: entry.no,
          firstName: entry.first,
          lastName: entry.last,
          fullName,
          jobTitle: entry.title,
          email: `${entry.first.toLowerCase()}.${entry.last.toLowerCase()}@example.co.zw`,
          emailNormalized: `${entry.first.toLowerCase()}.${entry.last.toLowerCase()}@example.co.zw`,
          phone: "+263 71 000 0000",
          clientId: clients[entry.company].id,
          assignedToId,
        },
        select: { id: true },
      }),
    );
  }

  const sites = [];
  for (const entry of SITES) {
    sites.push(
      await prisma.crmSite.upsert({
        where: { companyId_siteNo: { companyId: company.id, siteNo: entry.no } },
        update: { name: entry.name },
        create: {
          companyId: company.id,
          siteNo: entry.no,
          name: entry.name,
          clientId: clients[entry.company].id,
          addressLine: "12 Sam Nujoma Street",
          city: entry.city,
          country: "Zimbabwe",
        },
        select: { id: true },
      }),
    );
  }

  for (const entry of LEADS) {
    await prisma.crmLead.upsert({
      where: { companyId_leadNo: { companyId: company.id, leadNo: entry.no } },
      update: { title: entry.title, stage: entry.stage, estimatedValue: entry.value },
      create: {
        companyId: company.id,
        leadNo: entry.no,
        title: entry.title,
        stage: entry.stage,
        estimatedValue: entry.value,
        currency: "USD",
        clientId: clients[entry.company].id,
        contactName: `${PEOPLE[entry.company].first} ${PEOPLE[entry.company].last}`,
        contactEmail: "buyer@example.co.zw",
        contactPhone: "+263 77 123 4567",
        source: entry.source,
        assignedToId,
        firstContactAt: entry.stage === "NEW" ? null : days(-4),
      },
    });
  }

  const pipeline = await prisma.crmPipeline.upsert({
    where: { companyId_name: { companyId: company.id, name: "Sales" } },
    update: { isDefault: true, isActive: true },
    create: { companyId: company.id, name: "Sales", isDefault: true, position: 0 },
    select: { id: true },
  });

  const stages = [];
  for (const stage of STAGES) {
    stages.push(
      await prisma.crmPipelineStage.upsert({
        where: { pipelineId_name: { pipelineId: pipeline.id, name: stage.name } },
        update: { position: stage.position, probability: stage.probability },
        create: {
          companyId: company.id,
          pipelineId: pipeline.id,
          name: stage.name,
          position: stage.position,
          probability: stage.probability,
          inactivityDays: stage.inactivityDays,
          status: stage.name === "Won" ? "WON" : stage.name === "Lost" ? "LOST" : "OPEN",
        },
        select: { id: true, status: true },
      }),
    );
  }

  const deals = [];
  for (const entry of DEALS) {
    const stage = stages[entry.stage];
    deals.push(
      await prisma.crmDeal.upsert({
        where: { companyId_dealNo: { companyId: company.id, dealNo: entry.no } },
        update: { title: entry.title, stageId: stage.id, value: entry.value, status: stage.status },
        create: {
          companyId: company.id,
          dealNo: entry.no,
          title: entry.title,
          pipelineId: pipeline.id,
          stageId: stage.id,
          status: stage.status,
          value: entry.value,
          currency: "USD",
          clientId: clients[entry.company].id,
          primaryContactId: people[entry.contact].id,
          siteId: entry.site === null ? null : sites[entry.site].id,
          expectedCloseDate: days(entry.close),
          assignedToId,
          stageEnteredAt: days(-9),
          wonAt: stage.status === "WON" ? days(-3) : null,
          lostAt: stage.status === "LOST" ? days(-20) : null,
          lostReason: stage.status === "LOST" ? "Went with an incumbent supplier" : null,
        },
        select: { id: true },
      }),
    );
  }

  const taskSpecs = [
    { title: "Call Tendai about the branch count", due: -2, deal: 0 },
    { title: "Send the revised quote", due: 0, deal: 1 },
    { title: "Book the site visit at the depot", due: 1, deal: 2 },
    { title: "Chase the signed order", due: -5, deal: 3 },
    { title: "Confirm go-live date", due: 4, deal: 4 },
    { title: "Write the handover note", due: 7, deal: 5 },
  ];
  const existingTasks = await prisma.crmTask.findMany({
    where: { companyId: company.id, title: { in: taskSpecs.map((task) => task.title) } },
    select: { id: true, title: true },
  });
  for (const spec of taskSpecs) {
    const existing = existingTasks.find((task) => task.title === spec.title);
    const data = {
      companyId: company.id,
      title: spec.title,
      dueAt: days(spec.due),
      dealId: deals[spec.deal].id,
      subjectType: "DEAL" as const,
      subjectId: deals[spec.deal].id,
      assignedToId,
      priority: spec.due < 0 ? ("HIGH" as const) : ("NORMAL" as const),
    };
    if (existing) {
      await prisma.crmTask.update({ where: { id: existing.id }, data });
    } else {
      await prisma.crmTask.create({ data });
    }
  }

  console.log(
    JSON.stringify(
      {
        tenant: slug,
        companies: clients.length,
        people: people.length,
        sites: sites.length,
        leads: LEADS.length,
        deals: deals.length,
        tasks: taskSpecs.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
