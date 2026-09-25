/**
 * Migration witness for 20260922110000_crm_projects_requisitions_daily_costs.
 *
 * Required by `AGENTS.md`: "Schema change without a migration witness test" is
 * a forbidden pattern. `requisitions.test.ts` exercises the state machine in
 * memory and proves nothing about the database — it passes just as happily
 * against tables that were never created.
 *
 * So this reads `information_schema` and `pg_indexes`. Four properties carry
 * real behaviour and are asserted explicitly rather than left to the schema
 * file:
 *
 *  - `projectId` is NULLABLE on requisitions and cost entries. This is the
 *    whole design, in James's words: "requisition can be for fuel or airtime
 *    and it cannot be for a specific project". A NOT NULL here would either
 *    block those requests or force a fictional project onto them, and a
 *    fictional attribution makes every project's cost figure wrong.
 *  - Money is `numeric(14,2)`. A `double precision` column loses cents, and
 *    cents are the thing a float is reconciled on.
 *  - `logDate` and `reportDate` are `date`, not timestamps. A rep writes up
 *    Tuesday on Wednesday morning, and the entry belongs to Tuesday whatever
 *    time zone the phone was in.
 *  - Deleting a project or a bank account must not delete the record that
 *    money was asked for and handed over. Those are SET NULL; the requester
 *    is RESTRICT, because a requisition with no requester is not a record.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

type ColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
  column_default: string | null;
};

async function columns(table: string): Promise<Map<string, ColumnRow>> {
  const rows = await prisma.$queryRaw<ColumnRow[]>`
    SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function indexes(table: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}
  `;
  return rows.map((row) => row.indexdef);
}

/** The ON DELETE rule for one foreign key, straight from the catalogue. */
async function deleteRule(table: string, constraint: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
    SELECT rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name = rc.constraint_name
     AND tc.constraint_schema = rc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = ${table}
      AND rc.constraint_name = ${constraint}
  `;
  return rows[0]?.delete_rule ?? null;
}

async function enumValues(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name}
    ORDER BY e.enumsortorder
  `;
  return rows.map((row) => row.enumlabel);
}

describe("the tables exist at all", () => {
  it("creates all five", async () => {
    for (const table of [
      "CrmProject",
      "CrmRequisition",
      "CrmDailyLog",
      "CrmDailyCostEntry",
      "CrmDailyReport",
    ]) {
      expect((await columns(table)).size, `${table} is missing`).toBeGreaterThan(0);
    }
  });
});

describe("a requisition need not belong to a project", () => {
  it("leaves CrmRequisition.projectId nullable", async () => {
    const col = (await columns("CrmRequisition")).get("projectId");
    expect(col, "CrmRequisition.projectId is missing").toBeDefined();
    expect(col?.is_nullable).toBe("YES");
  });

  it("leaves CrmDailyCostEntry.projectId nullable", async () => {
    const col = (await columns("CrmDailyCostEntry")).get("projectId");
    expect(col?.is_nullable).toBe("YES");
  });

  it("accepts a fuel requisition with no project", async () => {
    // The in-memory helpers cannot prove this; only the database can.
    const company = await prisma.company.upsert({
      where: { slug: "requisition-schema-test" },
      update: {},
      create: { name: "Requisition Schema Test", slug: "requisition-schema-test" },
    });
    const user = await prisma.user.upsert({
      where: { email: "requisition-schema-test@example.invalid" },
      update: {},
      create: {
        email: "requisition-schema-test@example.invalid",
        name: "Requisition Schema Test",
        companyId: company.id,
        role: "CLERK",
      },
    });

    const requisition = await prisma.crmRequisition.create({
      data: {
        companyId: company.id,
        requisitionNo: "REQ-SCHEMA-TEST-1",
        category: "FUEL",
        purpose: "Diesel for the week",
        amount: "120.50",
        requestedById: user.id,
      },
    });

    expect(requisition.projectId).toBeNull();
    expect(requisition.status).toBe("DRAFT");
    // Cents survive the round trip. They would not through a float column.
    expect(requisition.amount.toString()).toBe("120.5");

    await prisma.crmRequisition.delete({ where: { id: requisition.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.company.delete({ where: { id: company.id } });
  });
});

describe("money is money", () => {
  const moneyColumns: Array<[string, string]> = [
    ["CrmProject", "budget"],
    ["CrmRequisition", "amount"],
    ["CrmRequisition", "approvedAmount"],
    ["CrmRequisition", "acquittedAmount"],
    ["CrmDailyCostEntry", "amount"],
  ];

  it("stores every amount as numeric(14,2)", async () => {
    for (const [table, name] of moneyColumns) {
      const col = (await columns(table)).get(name);
      expect(col, `${table}.${name} is missing`).toBeDefined();
      expect(col?.data_type, `${table}.${name}`).toBe("numeric");
      expect(col?.numeric_precision, `${table}.${name}`).toBe(14);
      expect(col?.numeric_scale, `${table}.${name}`).toBe(2);
    }
  });

  it("leaves a project's budget nullable, because unset is not zero", async () => {
    expect((await columns("CrmProject")).get("budget")?.is_nullable).toBe("YES");
  });

  it("requires an amount on a requisition and on a cost entry", async () => {
    expect((await columns("CrmRequisition")).get("amount")?.is_nullable).toBe("NO");
    expect((await columns("CrmDailyCostEntry")).get("amount")?.is_nullable).toBe("NO");
  });
});

describe("a day is a day", () => {
  it("stores logDate and reportDate as dates, not timestamps", async () => {
    expect((await columns("CrmDailyLog")).get("logDate")?.data_type).toBe("date");
    expect((await columns("CrmDailyReport")).get("reportDate")?.data_type).toBe("date");
  });

  it("allows one log per person per day", async () => {
    const defs = await indexes("CrmDailyLog");
    expect(
      defs.some(
        (def) =>
          def.includes("UNIQUE") &&
          def.includes("companyId") &&
          def.includes("userId") &&
          def.includes("logDate"),
      ),
    ).toBe(true);
  });

  it("allows one report per person per day", async () => {
    const defs = await indexes("CrmDailyReport");
    expect(
      defs.some(
        (def) =>
          def.includes("UNIQUE") &&
          def.includes("userId") &&
          def.includes("reportDate"),
      ),
    ).toBe(true);
  });

  it("makes a replayed offline cost entry land once", async () => {
    // Entries are written in the field. Without this the same entry posted
    // twice on reconnect doubles the day's spend.
    const defs = await indexes("CrmDailyCostEntry");
    expect(
      defs.some((def) => def.includes("UNIQUE") && def.includes("clientEntryId")),
    ).toBe(true);
  });
});

describe("deleting things does not erase the money trail", () => {
  it("nulls a requisition's project rather than deleting the requisition", async () => {
    expect(await deleteRule("CrmRequisition", "CrmRequisition_projectId_fkey")).toBe(
      "SET NULL",
    );
  });

  it("nulls the bank account rather than deleting the requisition", async () => {
    expect(await deleteRule("CrmRequisition", "CrmRequisition_bankAccountId_fkey")).toBe(
      "SET NULL",
    );
  });

  it("refuses to delete a user who has asked for money", async () => {
    // A requisition with no requester is not a record of anything.
    expect(await deleteRule("CrmRequisition", "CrmRequisition_requestedById_fkey")).toBe(
      "RESTRICT",
    );
  });

  it("nulls a cost entry's project rather than losing the cost", async () => {
    expect(await deleteRule("CrmDailyCostEntry", "CrmDailyCostEntry_projectId_fkey")).toBe(
      "SET NULL",
    );
  });

  it("takes a day's entries with the day", async () => {
    // The one place CASCADE is right: an entry has no meaning without its log.
    expect(await deleteRule("CrmDailyCostEntry", "CrmDailyCostEntry_logId_fkey")).toBe(
      "CASCADE",
    );
  });
});

describe("a project reaches the ledger", () => {
  it("carries a cost centre, nullable for the ones raised before it existed", async () => {
    const col = (await columns("CrmProject")).get("costCenterId");
    expect(col, "CrmProject.costCenterId is missing").toBeDefined();
    expect(col?.is_nullable).toBe("YES");
  });

  it("keeps the project when its cost centre goes", async () => {
    expect(await deleteRule("CrmProject", "CrmProject_costCenterId_fkey")).toBe("SET NULL");
  });

  it("names the CRM money flows the ledger can post", async () => {
    const values = await enumValues("AccountingSourceType");
    for (const required of [
      "CRM_REQUISITION_DISBURSEMENT",
      "CRM_REQUISITION_REFUND",
      "CRM_REQUISITION_TOPUP",
      "CRM_COST_ENTRY_SPEND",
      "CRM_COST_ENTRY_RECEIPT",
    ]) {
      expect(values, `${required} is missing`).toContain(required);
    }
  });

  it("lets a posting rule match on what the money was for", async () => {
    expect(await enumValues("PostingRuleConditionField")).toContain("EXPENSE_CATEGORY");
  });
});

describe("the enums the code branches on", () => {
  it("keeps approval, disbursement and acquittal as separate states", async () => {
    expect(await enumValues("CrmRequisitionStatus")).toEqual([
      "DRAFT",
      "SUBMITTED",
      "APPROVED",
      "REJECTED",
      "DISBURSED",
      "ACQUITTED",
      "CANCELLED",
    ]);
  });

  it("carries fuel and airtime as first-class categories", async () => {
    const values = await enumValues("CrmRequisitionCategory");
    expect(values).toContain("FUEL");
    expect(values).toContain("AIRTIME");
  });

  it("records money in and money out", async () => {
    expect(await enumValues("CrmCashDirection")).toEqual(["RECEIVED", "SPENT"]);
  });

  it("defaults a new requisition to a draft", async () => {
    const col = (await columns("CrmRequisition")).get("status");
    expect(col?.is_nullable).toBe("NO");
    expect(col?.column_default).toContain("DRAFT");
  });
});

// Migration witness for 20260925100000_crm_requisition_receipt_waiver.
describe("receipts waived on an acquittal are on the record", () => {
  it("keeps who waived them and why, both optional until somebody does", async () => {
    const cols = await columns("CrmRequisition");
    expect(cols.get("receiptsWaivedById")?.is_nullable).toBe("YES");
    expect(cols.get("receiptWaiverNote")?.is_nullable).toBe("YES");
  });

  it("outlives the account of whoever waived them", async () => {
    expect(await deleteRule("CrmRequisition", "CrmRequisition_receiptsWaivedById_fkey")).toBe(
      "SET NULL",
    );
  });
});
