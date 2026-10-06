/**
 * Suppliers (40-buying W-29, BUY-01), against the test database: adding one
 * with only a name, the name rule (any case, freed once stopped), the field
 * rules in words, the rep kept in step with the contacts, stopping and buying
 * again (out of every supplier field while stopped), the WhatsApp message and
 * the spreadsheet import.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { searchLookup, type LookupCtx } from "@/lib/retail/lookups";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { importSuppliers } from "./supplier-import";
import {
  addContact,
  contactsOf,
  createSupplier,
  messageSuppliers,
  parseLeadTime,
  removeContact,
  resumeSupplier,
  stopSupplier,
  supplierPhone,
  SupplierRefusal,
  updateSupplier,
  type SupplierInput,
} from "./suppliers";

let shop: TestShop;

const add = (input: SupplierInput) => prisma.$transaction((tx) => createSupplier(tx, shop.manager(), input));
const refusal = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    if (error instanceof SupplierRefusal) return { status: error.status, message: error.message, fieldErrors: error.fieldErrors };
    throw error;
  }
  throw new Error("Expected a refusal");
};
const vendor = (id: string) => prisma.vendor.findUniqueOrThrow({ where: { id } });
const lookupAs = (role: string): LookupCtx => ({ companyId: shop.companyId, userId: shop.managerId, userName: "Tafara Nyathi", session: { user: { role } } });

beforeAll(async () => {
  shop = await makeTestShop("Suppliers");
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailMessage.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.vendorContact.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.vendor.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("the field rules", () => {
  it("groups a Zimbabwean phone however it is typed, and refuses what is not a phone", () => {
    expect(supplierPhone("+263772149080")).toBe("+263 77 214 9080");
    expect(supplierPhone("0772 149 080")).toBe("+263 77 214 9080");
    expect(supplierPhone("12")).toBeNull();
  });

  it("reads a lead time as whole days up to 60", () => {
    expect(parseLeadTime("2")).toBe(2);
    expect(parseLeadTime("2 days")).toBe(2);
    expect(parseLeadTime("two days")).toBeNull();
    expect(parseLeadTime("61")).toBeNull();
  });
});

describe("adding a supplier", () => {
  it("needs only a name: SUP-0001, on delivery, orders on WhatsApp, one audit event", async () => {
    const created = await add({ name: "  Delta   Beverages " });
    expect(created).toMatchObject({ code: "SUP-0001", name: "Delta Beverages" });
    const row = await vendor(created.id);
    expect(row).toMatchObject({ payTermsDays: null, phone: null, whatsapp: null, sendOrdersOnWhatsapp: true, isActive: true, stoppedAt: null });
    expect(row.createdById).toBe(shop.managerId);
    const events = await prisma.platformAuditEvent.findMany({ where: { companyId: shop.companyId, entityId: created.id } });
    expect(events.map((event) => event.eventType)).toEqual(["RETAIL_SUPPLIER.CREATED"]);
  });

  it("keeps the phone grouped, WhatsApp the same, and the terms in days", async () => {
    const created = await add({ name: "Afdis Distillers", phone: "0772149080", pays: "30 days", leadTime: "2 days", minimumOrder: "500", vatNumber: "10023456", bpNumber: "200012345" });
    const row = await vendor(created.id);
    expect(row).toMatchObject({ code: "SUP-0002", phone: "+263 77 214 9080", whatsapp: "+263 77 214 9080", payTermsDays: 30, leadTimeDays: 2, vatNumber: "10023456", taxNumber: "200012345" });
    expect(row.minimumOrder?.toFixed(2)).toBe("500.00");
  });

  it("refuses every wrong field at once, in words, under the sheet's fields", async () => {
    expect(await refusal(add({ name: "Odd", phone: "12", leadTime: "two days", vatNumber: "123", bpNumber: "12345678", email: "nope" }))).toEqual({
      status: 400,
      message: "Validation failed",
      fieldErrors: {
        phone: "Write it as +263 77 123 4567.",
        email: "That is not an email address.",
        lead: "Write it as a number of days, like 2 days.",
        vat: "A VAT number has 8 digits.",
        bp: "A BP number has 9 or 10 digits.",
      },
    });
    expect((await refusal(add({ name: "Odd", leadTime: 61 }))).fieldErrors).toEqual({ lead: "Write it as a number of days, like 2 days." });
    expect((await refusal(add({ name: "  " }))).fieldErrors).toEqual({ name: "Write the supplier's name." });
  });

  it("refuses a key of the wrong shape together with the rules the others break", async () => {
    const body = { name: "x".repeat(121), pays: "Every full moon", phone: "12" } as unknown as SupplierInput;
    expect(await refusal(add(body))).toEqual({
      status: 400,
      message: "Validation failed",
      fieldErrors: { name: "Keep the name to 120 characters.", pays: "Pick how they are paid.", phone: "Write it as +263 77 123 4567." },
    });
  });

  it("refuses a name another supplier has, any case, until that one is stopped", async () => {
    expect(await refusal(add({ name: "delta beverages" }))).toEqual({
      status: 409,
      message: "There is already a supplier called Delta Beverages.",
      fieldErrors: { name: "There is already a supplier called Delta Beverages." },
    });
    const first = await add({ name: "Natbrew" });
    await prisma.$transaction((tx) => stopSupplier(tx, shop.manager(), first.id));
    const second = await add({ name: "NATBREW" });
    expect(second.code).not.toBe(first.code);

    // Buying from the first again would make two of the same name.
    expect(await refusal(prisma.$transaction((tx) => resumeSupplier(tx, shop.manager(), first.id)))).toMatchObject({
      status: 409,
      message: "There is already a supplier called NATBREW. Rename one of them first.",
    });
  });
});

describe("changing a supplier", () => {
  const change = (id: string, patch: unknown) =>
    prisma.$transaction((tx) => updateSupplier(tx, shop.manager(), id, patch as Parameters<typeof updateSupplier>[3]));

  it("refuses a body that changes nothing as a whole, not under a field", async () => {
    const supplier = await add({ name: "Empty Patch Traders" });
    expect(await refusal(change(supplier.id, {}))).toEqual({ status: 400, message: "Change something first.", fieldErrors: null });
    expect(await refusal(change(supplier.id, null))).toEqual({ status: 400, message: "Change something first.", fieldErrors: null });
  });

  it("refuses every wrong key at once, under the body's keys, and saves none", async () => {
    const supplier = await add({ name: "Two Wrongs Traders" });
    expect(await refusal(change(supplier.id, { pays: "Monthly", name: "y".repeat(121), leadTime: "soon" }))).toEqual({
      status: 400,
      message: "Validation failed",
      fieldErrors: {
        pays: "Pick how they are paid.",
        name: "Keep the name to 120 characters.",
        leadTime: "Write it as a number of days, like 2 days.",
      },
    });
    expect(await vendor(supplier.id)).toMatchObject({ name: "Two Wrongs Traders", payTermsDays: null, leadTimeDays: null });
  });
});

describe("finding a supplier by its number", () => {
  it("matches the typed digits however they are spaced, with a leading 0, +263 or neither", async () => {
    const delta = await add({ name: "Delta Landline", phone: "+263 24 270 1600" });
    expect((await vendor(delta.id)).phone).toBe("+263 24 270 1600");
    const found = async (noun: "supplier" | "payee", q: string) => {
      const answer = await searchLookup(lookupAs("MANAGER"), noun, { q });
      return answer.status === 200 ? answer.body.options.map((option) => option.id) : null;
    };
    for (const q of ["2701600", "0242701600", "024 270 1600", "+263 24 270 1600", "263242701600", "270 1600"]) {
      expect(await found("supplier", q), q).toEqual([delta.id]);
      expect(await found("payee", q), q).toEqual([delta.id]);
    }
    // The WhatsApp number finds it too.
    await prisma.vendor.update({ where: { id: delta.id }, data: { whatsapp: "+263 77 999 1234" } });
    expect(await found("supplier", "0779991234")).toEqual([delta.id]);
    expect(await found("supplier", "9999999")).toEqual([]);
  });
});

describe("contacts and the rep", () => {
  it("makes the first Sales rep the rep, follows a make-rep, and clears it when the rep goes", async () => {
    const supplier = await add({ name: "Mutare Wholesalers" });
    const contact = (input: Parameters<typeof addContact>[3]) => prisma.$transaction((tx) => addContact(tx, shop.manager(), supplier.id, input));

    expect((await refusal(contact({ name: "Nobody", sends: "Orders" }))).fieldErrors).toEqual({ phone: "Add a phone or an email so we can reach them." });

    const rep = await contact({ name: "Tinashe Moyo", role: "Sales rep", phone: "0773012290", sends: "Orders" });
    expect(rep).toMatchObject({ isRep: true, phone: "+263 77 301 2290", sends: "Orders" });
    expect((await vendor(supplier.id)).contactName).toBe("Tinashe Moyo");

    // A second Sales rep does not take over while there is one.
    const second = await contact({ name: "Rumbi Chari", role: "Sales rep", email: "rumbi@mutare.test", sends: "Statements" });
    expect(second.isRep).toBe(false);
    expect((await vendor(supplier.id)).contactName).toBe("Tinashe Moyo");

    const changes = await prisma.$transaction((tx) => updateSupplier(tx, shop.manager(), supplier.id, { repContactId: second.id }));
    expect(changes).toEqual([{ field: "repContactId", label: "Rep", from: "Tinashe Moyo", to: "Rumbi Chari" }]);
    expect((await vendor(supplier.id)).contactName).toBe("Rumbi Chari");

    await prisma.$transaction((tx) => removeContact(tx, shop.manager(), supplier.id, second.id));
    expect((await vendor(supplier.id)).contactName).toBeNull();
    expect((await prisma.vendorContact.findUniqueOrThrow({ where: { id: second.id } })).removedAt).not.toBeNull();
  });

  it("knows the rep by name in any case and spacing, the first of two namesakes only", async () => {
    const supplier = await add({ name: "Namesake Supplies" });
    const contact = (input: Parameters<typeof addContact>[3]) => prisma.$transaction((tx) => addContact(tx, shop.manager(), supplier.id, input));
    const first = await contact({ name: "Tinashe Moyo", role: "Sales rep", phone: "0773012290", sends: "Orders" });
    const namesake = await contact({ name: "tinashe  MOYO", role: "Driver", phone: "0773012291", sends: "Nothing" });
    expect(first.isRep).toBe(true);
    expect(namesake.isRep).toBe(false);

    // Kept with other spacing and case, it is still the same rep.
    await prisma.vendor.update({ where: { id: supplier.id }, data: { contactName: " TINASHE MOYO " } });
    const reps = async () => (await contactsOf(shop.companyId, supplier.id)).filter((c) => c.isRep).map((c) => c.id);
    expect(await reps()).toEqual([first.id]);
    const answer = await searchLookup(lookupAs("MANAGER"), "contact", { q: "tinashe", context: { supplierId: supplier.id } });
    expect(answer.status === 200 ? answer.body.options.map((option) => option.label) : null).toEqual(["Tinashe Moyo, rep", "tinashe MOYO"]);

    // Removing the namesake leaves the rep alone; removing the rep clears it.
    await prisma.$transaction((tx) => removeContact(tx, shop.manager(), supplier.id, namesake.id));
    expect((await vendor(supplier.id)).contactName).toBe(" TINASHE MOYO ");
    expect(await reps()).toEqual([first.id]);
    await prisma.$transaction((tx) => removeContact(tx, shop.manager(), supplier.id, first.id));
    expect((await vendor(supplier.id)).contactName).toBeNull();
  });
});

describe("stopping a supplier", () => {
  it("takes it out of the supplier field and puts it back when bought from again", async () => {
    const cool = await add({ name: "CoolTech Repairs" });
    const labels = async () => {
      const answer = await searchLookup(lookupAs("MANAGER"), "supplier", { q: "CoolTech" });
      return answer.status === 200 ? answer.body.options.map((option) => option.label) : null;
    };
    expect(await labels()).toEqual(["CoolTech Repairs"]);

    await prisma.$transaction((tx) => stopSupplier(tx, shop.manager(), cool.id));
    expect(await vendor(cool.id)).toMatchObject({ isActive: false, stoppedById: shop.managerId });
    expect(await labels()).toEqual([]);

    await prisma.$transaction((tx) => resumeSupplier(tx, shop.manager(), cool.id));
    expect(await vendor(cool.id)).toMatchObject({ isActive: true, stoppedAt: null, stoppedById: null });
    expect(await labels()).toEqual(["CoolTech Repairs"]);

    const events = await prisma.platformAuditEvent.findMany({ where: { companyId: shop.companyId, entityId: cool.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((event) => event.eventType)).toEqual(["RETAIL_SUPPLIER.CREATED", "RETAIL_SUPPLIER.STOPPED", "RETAIL_SUPPLIER.RESUMED"]);
  });
});

describe("Message on WhatsApp", () => {
  it("queues one message per supplier with a number and skips the one without", async () => {
    const pamela = await add({ name: "Pamela", phone: "+263 77 555 0101" });
    const silent = await add({ name: "Ice Cold Supplies" });
    const answer = await prisma.$transaction((tx) => messageSuppliers(tx, shop.manager(), { ids: [pamela.id, silent.id], message: "Closed on Monday." }));
    expect(answer).toEqual({ queued: 1, skipped: [{ id: silent.id, name: "Ice Cold Supplies", why: "No WhatsApp number" }] });

    const messages = await prisma.retailMessage.findMany({ where: { companyId: shop.companyId, entityType: "Vendor" } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ channel: "WHATSAPP", to: "+263775550101", template: "supplier-message", direction: "OUT", entityId: pamela.id, status: "QUEUED" });

    expect((await refusal(prisma.$transaction((tx) => messageSuppliers(tx, shop.manager(), { ids: [pamela.id], message: "  " })))).fieldErrors).toEqual({
      message: "Write a message.",
    });
  });
});

describe("Import a spreadsheet", () => {
  const sheet = async (rows: string[][]) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Suppliers");
    for (const row of rows) worksheet.addRow(row);
    const buffer = await workbook.xlsx.writeBuffer();
    return { name: "suppliers.xlsx", bytes: buffer as ArrayBuffer };
  };

  it("adds each good row and skips a duplicate with its row number", async () => {
    const file = await sheet([
      ["Name", "Phone", "Pays", "Lead time"],
      ["Schweppes Zimbabwe", "0772 100 200", "14 days", "3"],
      ["delta beverages", "", "30", ""],
      ["Bon Marche", "", "cash", "1 day"],
    ]);
    expect(await importSuppliers(shop.manager(), file)).toEqual({
      added: 2,
      skipped: [{ row: 3, why: "there is already a supplier called Delta Beverages." }],
    });
    expect((await prisma.vendor.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Schweppes Zimbabwe" } })).payTermsDays).toBe(14);
  });

  it("refuses a file with no Name column", async () => {
    expect(await refusal(importSuppliers(shop.manager(), await sheet([["Phone"], ["0772 100 200"]])))).toMatchObject({
      status: 400,
      message: "That file has no Name column.",
    });
  });
});
