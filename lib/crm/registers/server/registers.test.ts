/**
 * The people, companies and sites lists, asked through the engine against a
 * real database: every filter narrows what it says, the screen's page, the
 * export's count and the export's scan agree, and ticked ids never reach
 * outside what the reader may see.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { readState } from "../codec";
import type { ViewState } from "../types";
import { companiesRegister } from "./companies";
import { registerContext } from "./context";
import { peopleRegister } from "./people";
import { sitesRegister } from "./sites";
import type { RegisterContext } from "./types";

const SLUG = "register-engine-test";
const OTHER = "register-engine-test-other";

let companyId: string;
let tendai: string;
let rudo: string;
let ctx: RegisterContext;
const ids: Record<string, string> = {};

function state(query: string): ViewState {
  return readState(peopleRegister.def, new URLSearchParams(query)).state;
}

async function names(query: string, as: RegisterContext = ctx) {
  const { rows } = await peopleRegister.page(as, state(query), { skip: 0, take: 50 });
  return rows.map((row) => row.fullName);
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const [company, other] = await Promise.all(
    [SLUG, OTHER].map((slug) => prisma.company.create({ data: { name: slug, slug } })),
  );
  companyId = company.id;
  const users = await Promise.all(
    ["tendai", "rudo"].map((name) =>
      prisma.user.upsert({
        where: { email: `${SLUG}-${name}@example.invalid` },
        update: { companyId, role: "SALES_REP" },
        create: { email: `${SLUG}-${name}@example.invalid`, name, companyId, role: "SALES_REP" },
      }),
    ),
  );
  [tendai, rudo] = users.map((user) => user.id);
  ctx = await registerContext({ id: tendai, role: "SALES_REP", companyId }, "Africa/Harare", new Date("2026-09-27T08:00:00Z"));

  const acme = await prisma.crmClient.create({
    data: { companyId, clientNo: "C-1", name: "Acme Roofing", accountStatus: "ON_HOLD", assignedToId: tendai, city: "Harare" },
  });
  const beta = await prisma.crmClient.create({
    data: { companyId, clientNo: "C-2", name: "Beta Builders", city: "Mutare" },
  });
  ids.acme = acme.id;
  ids.beta = beta.id;

  const person = (data: Record<string, unknown>) =>
    prisma.crmPerson.create({ data: { companyId, ...data } as never });
  ids.anesu = (
    await person({
      personNo: "P-1",
      firstName: "Anesu",
      fullName: "Anesu Dube",
      contactType: "CUSTOMER",
      assignedToId: tendai,
      city: "Harare",
      tags: ["vip"],
      // 00:30 on the 21st in Harare, still the 20th in UTC.
      lastContactedAt: new Date("2026-09-20T22:30:00Z"),
    })
  ).id;
  ids.blessing = (
    await person({
      personNo: "P-2",
      firstName: "Blessing",
      fullName: "Blessing Moyo",
      contactType: "DECISION_MAKER",
      assignedToId: rudo,
      city: "Bulawayo",
      clientId: acme.id,
      lastContactedAt: new Date("2026-09-01T09:00:00Z"),
    })
  ).id;
  ids.chipo = (
    await person({
      personNo: "P-3",
      firstName: "Chipo",
      fullName: "Chipo Ncube",
      contactType: "CUSTOMER",
      city: "Harare",
      archivedAt: new Date("2026-09-10T00:00:00Z"),
    })
  ).id;
  ids.dudzai = (
    await person({ personNo: "P-4", firstName: "Dudzai", fullName: "Dudzai Zhou", contactType: "SUPPLIER_CONTACT" })
  ).id;
  ids.stranger = (
    await prisma.crmPerson.create({
      data: { companyId: other.id, personNo: "P-1", firstName: "Stranger", fullName: "Anesu Stranger" },
    })
  ).id;

  const group = await prisma.crmList.create({
    data: {
      companyId,
      entity: "PERSON",
      name: "Campaign",
      isShared: true,
      createdById: rudo,
      members: { create: [{ companyId, recordId: ids.anesu }, { companyId, recordId: ids.dudzai }] },
    },
  });
  ids.group = group.id;
  const privateGroup = await prisma.crmList.create({
    data: {
      companyId,
      entity: "PERSON",
      name: "Rudo's own",
      isShared: false,
      createdById: rudo,
      members: { create: [{ companyId, recordId: ids.blessing }] },
    },
  });
  ids.privateGroup = privateGroup.id;

  await prisma.crmSite.createMany({
    data: [
      { companyId, siteNo: "S-1", name: "Acme yard", clientId: acme.id, city: "Harare" },
      { companyId, siteNo: "S-2", name: "Beta depot", clientId: beta.id, city: "Mutare" },
    ],
  });
});

afterAll(async () => {
  await prisma.crmList.deleteMany({ where: { companyId } });
  await prisma.crmSite.deleteMany({ where: { companyId } });
  await prisma.crmPerson.deleteMany({ where: { company: { slug: { in: [SLUG, OTHER] } } } });
  await prisma.crmClient.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
});

describe("people", () => {
  it("opens on everyone not archived, A–Z", async () => {
    expect(await names("")).toEqual(["Anesu Dube", "Blessing Moyo", "Dudzai Zhou"]);
  });

  it("reads me and nobody as the reader and no one", async () => {
    expect(await names("owner=me")).toEqual(["Anesu Dube"]);
    expect(await names("owner=none")).toEqual(["Dudzai Zhou"]);
    expect(await names("owner=me,none")).toEqual(["Anesu Dube", "Dudzai Zhou"]);
    expect(await names(`owner=${rudo}`)).toEqual(["Blessing Moyo"]);
  });

  it("shows archived people only in the archived list", async () => {
    expect(await names("type=CUSTOMER")).toEqual(["Anesu Dube"]);
    expect(await names("archived=1")).toEqual(["Chipo Ncube"]);
  });

  it("narrows by company, city, tag and search", async () => {
    expect(await names(`company=${ids.acme}`)).toEqual(["Blessing Moyo"]);
    expect(await names("city=Harare")).toEqual(["Anesu Dube"]);
    expect(await names("tag=vip")).toEqual(["Anesu Dube"]);
    expect(await names("q=moyo")).toEqual(["Blessing Moyo"]);
    // The company's name finds its people.
    expect(await names("q=acme")).toEqual(["Blessing Moyo"]);
  });

  it("narrows to a group, and a group the reader cannot see to nobody", async () => {
    expect(await names(`group=${ids.group}`)).toEqual(["Anesu Dube", "Dudzai Zhou"]);
    expect(await names(`group=${ids.privateGroup}`)).toEqual([]);
  });

  it("reads contact dates in the reader's zone", async () => {
    // The last seven days in Harare run from the 21st; Anesu was contacted
    // just after midnight there, which UTC still calls the 20th.
    expect(await names("contacted=last-7d")).toEqual(["Anesu Dube"]);
    expect(
      await names("contacted=last-7d", { ...ctx, tz: "UTC" }),
    ).toEqual([]);
    expect(await names("contacted=2026-09-01..2026-09-01")).toEqual(["Blessing Moyo"]);
  });

  it("puts the never-contacted first when sorting by longest since contact", async () => {
    expect(await names("sort=contacted")).toEqual(["Dudzai Zhou", "Blessing Moyo", "Anesu Dube"]);
    expect(await names("sort=-contacted")).toEqual(["Anesu Dube", "Blessing Moyo", "Dudzai Zhou"]);
  });

  it("agrees between the page, the count and the scan", async () => {
    const query = state("owner=me,none");
    const { total } = await peopleRegister.page(ctx, query, { skip: 0, take: 1 });
    expect(total).toBe(2);
    expect(await peopleRegister.count(ctx, query)).toBe(2);
    const scanned: string[] = [];
    for await (const batch of peopleRegister.scan(ctx, query, { batch: 1 })) {
      scanned.push(...batch.map((row) => row.fullName));
    }
    expect(scanned).toEqual(["Anesu Dube", "Dudzai Zhou"]);
  });

  it("keeps ticked ids inside the reader's company", async () => {
    const query = state("");
    const { rows } = await peopleRegister.page(ctx, query, { skip: 0, take: 50 }, [ids.anesu, ids.stranger]);
    expect(rows.map((row) => row.fullName)).toEqual(["Anesu Dube"]);
    expect(await peopleRegister.count(ctx, query, [ids.anesu, ids.stranger])).toBe(1);
  });

  it("writes cells in labels and the reader's days", async () => {
    const { rows } = await peopleRegister.page(ctx, state("q=anesu"), { skip: 0, take: 1 });
    expect(peopleRegister.cells(rows[0], ctx)).toMatchObject({
      name: "Anesu Dube",
      ref: "P-1",
      type: "Customer",
      owner: "tendai",
      tags: "vip",
      contacted: "2026-09-21",
      company: null,
    });
  });

  it("offers the cities the other filters leave, ignoring its own", async () => {
    const all = await peopleRegister.facet!(ctx, state(""), "city");
    expect(all.map((option) => option.value)).toEqual(["Bulawayo", "Harare"]);
    const narrowed = await peopleRegister.facet!(ctx, state("city=Harare&owner=me"), "city");
    expect(narrowed.map((option) => option.value)).toEqual(["Harare"]);
    const ignoringItself = await peopleRegister.facet!(ctx, state("city=Harare"), "city");
    expect(ignoringItself.map((option) => option.value)).toEqual(["Bulawayo", "Harare"]);
  });
});

describe("companies", () => {
  it("narrows by account status and owner, and counts their people", async () => {
    const { rows } = await companiesRegister.page(
      ctx,
      readState(companiesRegister.def, new URLSearchParams("status=ON_HOLD&owner=me")).state,
      { skip: 0, take: 50 },
    );
    expect(rows.map((row) => row.name)).toEqual(["Acme Roofing"]);
    expect(companiesRegister.cells(rows[0], ctx)).toMatchObject({
      status: "On hold",
      type: "Customer",
      people: 1,
      location: "Harare",
    });
  });
});

describe("sites", () => {
  it("narrows by company and offers the cities it is in", async () => {
    const byCompany = await sitesRegister.page(
      ctx,
      readState(sitesRegister.def, new URLSearchParams(`company=${ids.beta}`)).state,
      { skip: 0, take: 50 },
    );
    expect(byCompany.rows.map((row) => row.name)).toEqual(["Beta depot"]);
    const cities = await sitesRegister.facet!(ctx, { filters: {} }, "city");
    expect(cities.map((option) => option.value)).toEqual(["Harare", "Mutare"]);
  });

  it("narrows by when a site was added", async () => {
    const today = await sitesRegister.count(
      { ...ctx, now: new Date() },
      readState(sitesRegister.def, new URLSearchParams("created=today")).state,
    );
    expect(today).toBe(2);
    const long_ago = await sitesRegister.count(
      ctx,
      readState(sitesRegister.def, new URLSearchParams("created=..2020-01-01")).state,
    );
    expect(long_ago).toBe(0);
  });
});
