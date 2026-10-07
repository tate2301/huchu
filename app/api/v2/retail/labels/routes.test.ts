import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import { defaultListFor } from "@/lib/retail/products/test-fixtures";

/**
 * Print shelf labels (PRD-06, W-20), against the test database with only the
 * sign-in faked: who may print, the refusals, the job a till pulls and
 * acknowledges, and the PDF printed here.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

vi.stubEnv("PLATFORM_ROOT_DOMAIN", "apps.localtest.me");

const { POST: print } = await import("./route");
const { GET: pdf } = await import("./[file]/route");
const { GET: pull } = await import("../devices/me/print-jobs/route");
const { POST: done } = await import("../devices/me/print-jobs/[id]/done/route");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const slug = `labels-${stamp}`;
const frontKey = `front-${stamp}`;
const handheldKey = `handheld-${stamp}`;
let companyId = "";
const people: Record<string, string> = {};
const tills: Record<string, string> = {};
const products: string[] = [];

function as(who: "owner" | "manager" | "clerk" | "cashier" | "books") {
  const role = { owner: "SUPERADMIN", manager: "MANAGER", clerk: "STOCK_CLERK", cashier: "CASHIER", books: "FINANCE_OFFICER" }[who];
  validateSessionMock.mockResolvedValue({
    session: { user: { id: people[who], companyId, role, name: who, email: `${who}@labels.test`, enabledFeatures: ["retail.core"] } },
  });
}

async function post(body: unknown) {
  const response = await print(
    new NextRequest("http://localhost/api/v2/retail/labels", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  );
  return { status: response.status, body: await response.json() };
}

const body = (overrides: Record<string, unknown> = {}) => ({
  productIds: products,
  size: "STRIP",
  show: { price: true, was: true, barcode: true },
  copies: 1,
  printer: tills.front,
  ...overrides,
});

const onTill = (
  handler: (request: NextRequest, context: never) => Promise<Response>,
  path: string,
  key: string,
  init: { method?: string; body?: string } = {},
  context?: unknown,
) =>
  handler(
    new NextRequest(`http://pos.${slug}.apps.localtest.me/api/v2/retail/devices/me/${path}`, {
      ...init,
      headers: { host: `pos.${slug}.apps.localtest.me`, cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
    }),
    context as never,
  );

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Labels routes ${stamp}`, slug }, select: { id: true } })).id;
  for (const [who, role] of [
    ["owner", "SUPERADMIN"],
    ["manager", "MANAGER"],
    ["clerk", "STOCK_CLERK"],
    ["cashier", "CASHIER"],
    ["books", "FINANCE_OFFICER"],
  ] as const) {
    people[who] = (
      await prisma.user.create({ data: { companyId, name: `${who} Moyo`, role, email: `${who}-${stamp}@labels.test` }, select: { id: true } })
    ).id;
  }
  const siteId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: `HRE-${stamp}` }, select: { id: true } })).id;
  for (const [key, name, code] of [
    ["front", "Front till", "FRONT"],
    ["back", "Back till", "BACK"],
    ["handheld", "Handheld 1", "HAND"],
  ] as const) {
    tills[key] = (await prisma.retailRegister.create({ data: { companyId, siteId, code, name }, select: { id: true } })).id;
  }
  for (const [register, key] of [
    [tills.front!, frontKey],
    [tills.handheld!, handheldKey],
  ]) {
    await prisma.retailDevice.create({ data: { companyId, registerId: register, kind: "BROWSER", keyHash: hashDeviceKey(key), pairedById: people.owner! } });
  }
  const listId = await defaultListFor(companyId);
  for (const [code, name, price] of [
    ["AMARULA-750", "Amarula Cream 750ml", "18.25"],
    ["CASTLE-340", "Castle Lager 340ml", "1.20"],
    ["COKE-500", "Coca-Cola 500ml", "0.75"],
    ["CHARCOAL-4KG", "Charcoal 4kg", "3.90"],
  ]) {
    const id = (await prisma.product.create({ data: { companyId, code, name, standardPrice: new Prisma.Decimal(price) }, select: { id: true } })).id;
    await prisma.productPrice.create({ data: { companyId, priceListId: listId, productId: id, unitPrice: new Prisma.Decimal(price) } });
    products.push(id);
  }
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("who prints labels", () => {
  it("refuses the cashier and the bookkeeper with the matrix's sentence", async () => {
    for (const who of ["cashier", "books"] as const) {
      as(who);
      expect(await post(body())).toEqual({ status: 403, body: expect.objectContaining({ error: "Your role cannot change products" }) });
    }
    expect(await prisma.retailPrintJob.count({ where: { companyId } })).toBe(0);
  });

  it("lets the stock clerk print, as the owner and the manager do", async () => {
    as("clerk");
    const answer = await post(body({ productIds: [products[0]] }));
    expect(answer).toMatchObject({ status: 202, body: { data: { count: 1, printer: "Front till printer" } } });
    await prisma.retailPrintJob.delete({ where: { id: answer.body.data.jobId } });
  });
});

describe("bad input", () => {
  it("says copies is 1 to 50", async () => {
    as("owner");
    for (const copies of [0, 51, 1.5]) {
      expect(await post(body({ copies }))).toEqual({
        status: 400,
        body: expect.objectContaining({ fieldErrors: expect.objectContaining({ copies: "Copies is 1 to 50." }) }),
      });
    }
  });

  it("prints an A4 sheet here, not on a till printer", async () => {
    as("owner");
    expect(await post(body({ size: "A4" }))).toEqual({
      status: 400,
      body: { error: "A4 sheets print here, not on a till printer.", fieldErrors: { size: "A4 sheets print here, not on a till printer." } },
    });
  });

  it("names a till printer that is not paired", async () => {
    as("owner");
    expect(await post(body({ printer: tills.back }))).toEqual({
      status: 409,
      body: expect.objectContaining({ error: "The back till printer is not paired. Pair it, or print here." }),
    });
    expect(await prisma.retailPrintJob.count({ where: { companyId } })).toBe(0);
  });
});

describe("a till's printer", () => {
  let jobId = "";

  it("queues one job with the four labels, and a line per product in Activity", async () => {
    as("owner");
    const answer = await post(body());
    expect(answer).toMatchObject({ status: 202, body: { data: { count: 4, printer: "Front till printer" } } });
    jobId = answer.body.data.jobId;
    const job = await prisma.retailPrintJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ registerId: tills.front, kind: "LABELS", status: "QUEUED", createdById: people.owner, printedAt: null });
    const payload = job.payload as { size: string; labels: Array<{ name: string; price: string; copies: number }> };
    expect(payload.size).toBe("STRIP");
    expect(payload.labels.map((label) => [label.name, label.price, label.copies])).toEqual([
      ["Amarula Cream 750ml", "US$18.25", 1],
      ["Castle Lager 340ml", "US$1.20", 1],
      ["Charcoal 4kg", "US$3.90", 1],
      ["Coca-Cola 500ml", "US$0.75", 1],
    ]);
    const lines = await prisma.platformAuditEvent.findMany({ where: { companyId, eventType: "RETAIL_LABELS.PRINTED", payloadJson: { contains: jobId } }, select: { entityType: true, entityId: true, payloadJson: true } });
    expect(lines).toHaveLength(4);
    expect(new Set(lines.map((line) => line.entityId))).toEqual(new Set(products));
    expect(lines[0]!.entityType).toBe("Product");
    expect(JSON.parse(lines[0]!.payloadJson ?? "{}")).toMatchObject({ size: "STRIP", copies: 1, printer: "Front till printer" });
  });

  it("is pulled by the front till only", async () => {
    const front = await onTill(pull, "print-jobs", frontKey);
    expect(front.status).toBe(200);
    const jobs = ((await front.json()) as { jobs: Array<{ id: string; kind: string; payload: { labels: unknown[] } }> }).jobs;
    expect(jobs.map((job) => [job.id, job.kind, job.payload.labels.length])).toEqual([[jobId, "LABELS", 4]]);

    const handheld = await onTill(pull, "print-jobs", handheldKey);
    expect(((await handheld.json()) as { jobs: unknown[] }).jobs).toEqual([]);
  });

  it("is marked printed by its own till, and not by another", async () => {
    const context = (id: string) => ({ params: Promise.resolve({ id }) });
    const other = await onTill(done, `print-jobs/${jobId}/done`, handheldKey, { method: "POST", body: JSON.stringify({ ok: true }) }, context(jobId));
    expect(other.status).toBe(404);

    const own = await onTill(done, `print-jobs/${jobId}/done`, frontKey, { method: "POST", body: JSON.stringify({ ok: true }) }, context(jobId));
    expect(own.status).toBe(204);
    expect(await prisma.retailPrintJob.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status: "PRINTED", printedAt: expect.any(Date) });
    const after = await onTill(pull, "print-jobs", frontKey);
    expect(((await after.json()) as { jobs: unknown[] }).jobs).toEqual([]);
  });

  it("is marked failed with what the till says", async () => {
    as("manager");
    const answer = await post(body({ productIds: [products[2]], copies: 2 }));
    expect(answer.body.data.count).toBe(2);
    const id = answer.body.data.jobId;
    const response = await onTill(
      done,
      `print-jobs/${id}/done`,
      frontKey,
      { method: "POST", body: JSON.stringify({ ok: false, error: "Out of labels" }) },
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(204);
    expect(await prisma.retailPrintJob.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "FAILED", error: "Out of labels" });
  });
});

describe("print here", () => {
  it("answers the PDF's address, which opens for the person who printed it only", async () => {
    as("manager");
    const answer = await post(body({ size: "A4", printer: "here", copies: 2 }));
    expect(answer).toMatchObject({ status: 200, body: { data: { count: 8, printer: "here" } } });
    const { jobId, pdfUrl } = answer.body.data as { jobId: string; pdfUrl: string };
    expect(pdfUrl).toBe(`/api/v2/retail/labels/${jobId}.pdf`);
    expect(await prisma.retailPrintJob.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ registerId: null, status: "PRINTED" });

    const open = (file: string) =>
      pdf(new NextRequest(`http://localhost/api/v2/retail/labels/${file}`), { params: Promise.resolve({ file }) });
    as("owner");
    expect((await open(`${jobId}.pdf`)).status).toBe(404);
    as("manager");
    expect((await open("not-a-job.pdf")).status).toBe(404);
    const file = await open(`${jobId}.pdf`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await file.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  }, 60_000);
});
