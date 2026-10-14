/**
 * Development only: Vane's drafts (PageVaneDraft, PageVaneRetail), written
 * the way a job writes them, for checking the pages without a key to Claude.
 *
 *   pnpm exec tsx --env-file=.env scripts/vane-draft-seed.ts invoice [workspace-slug]   (default: floorcode)
 *   pnpm exec tsx --env-file=.env scripts/vane-draft-seed.ts orders  [workspace-slug]   (default: acme)
 *
 * invoice: the customer accepts one of the workspace's sent quotes for a won
 * deal through its approval link (`respondToApproval`), then Vane's `draft`
 * tool drafts its invoice and `propose_item` raises the card about it, as a
 * job would. orders: Vane drafts one reorder per usual supplier from the
 * products below their reorder point and raises the card with its sends to
 * approve. Nothing is issued or sent: that stays a person's. It refuses to
 * run in production.
 */
import { prisma } from "@/lib/prisma";
import { respondToApproval } from "@/lib/crm/approvals";
import { callTool } from "@/lib/vane/tools";

if (process.env.NODE_ENV === "production") throw new Error("The draft seed is for development only.");

async function companyOf(slug: string) {
  const company = await prisma.company.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!company) throw new Error(`There is no workspace ${slug}.`);
  return company;
}

async function tool(companyId: string, name: string, input: unknown) {
  const result = await callTool({ companyId, jobId: null }, name, input);
  if (!result.ok) throw new Error(`${name}: ${result.content}`);
  return JSON.parse(result.content) as Record<string, unknown>;
}

const money = (amount: number) => `$${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function invoice(slug: string) {
  const company = await companyOf(slug);
  // A sent quote on a won deal, not invoiced yet, still waiting on the customer.
  const doc = await prisma.crmLeadDocument.findFirst({
    where: {
      companyId: company.id,
      type: "QUOTATION",
      deal: { wonAt: { not: null } },
      quotation: { status: "SENT", invoicesRaised: { none: {} } },
      approval: { status: "PENDING" },
    },
    orderBy: { deal: { wonAt: "desc" } },
    select: {
      approval: { select: { token: true } },
      deal: { select: { dealNo: true } },
      quotation: { select: { id: true, quotationNumber: true, updatedAt: true, customerId: true, customer: { select: { name: true } } } },
    },
  });
  if (!doc?.quotation || !doc.approval) throw new Error(`${company.name} has no sent quote on a won deal waiting for its customer.`);
  const quote = doc.quotation;

  await respondToApproval({ token: doc.approval.token, action: "APPROVE", name: quote.customer.name, stamp: quote.updatedAt.toISOString() });
  // As Claude would: the customer's usual terms when they have any (the tool reads them), else 21 days.
  const usual = await prisma.salesInvoice.count({ where: { companyId: company.id, customerId: quote.customerId, status: { in: ["ISSUED", "PAID"] }, dueDate: { not: null } } });
  const draft = { quotationId: quote.id, ...(usual === 0 ? { dueInDays: 21 } : {}) };
  const drafted = (await tool(company.id, "draft", { type: "invoice", invoice: draft })) as { id: string; number: string; total: number; target: string };
  await tool(company.id, "propose_item", {
    kind: "SUGGESTION",
    sourceModule: "books",
    headline: `${quote.quotationNumber} was accepted. I drafted its invoice, ${drafted.number}.`,
    body: `${money(drafted.total)} to ${quote.customer.name}, line for line from the quote, due on their usual terms after you issue it. Let’s check it and issue it.`,
    action: { type: "open", label: "Open the draft", target: drafted.target, shortcut: "S" },
    subjectType: "SalesInvoice",
    subjectId: drafted.id,
    sql: `SELECT "quotationNumber", "status", "total" FROM "SalesQuotation" WHERE "id" = '${quote.id}'`,
    readFrom: [
      { table: "SalesQuotation", rows: 1, about: `${quote.quotationNumber}, accepted` },
      { table: "SalesInvoice", rows: 0, about: "already raised from it" },
    ],
  });
  console.log(`Drafted ${drafted.number} from ${quote.quotationNumber} (${doc.deal?.dealNo ?? "no deal"}): ${drafted.target}`);
}

const command = process.argv[2];
const slug = process.argv[3];

(command === "invoice" ? invoice(slug ?? "floorcode") : Promise.reject(new Error("Say what to draft: invoice or orders.")))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
