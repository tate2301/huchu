import { describe, expect, it } from "vitest";

import {
  filterEntries,
  makers,
  readReportsFilter,
  reportBadges,
  reportCounts,
  reportEntries,
  reportsCsv,
  reportsFinding,
  type ReportsHomeData,
} from "./all";


const data: ReportsHomeData = {
  areas: [
    {
      area: "Sales and delivery",
      reports: [{ key: "crm-deals", title: "Pipeline by stage", area: "Sales and delivery", summary: "Open deals and their value, by stage" }],
    },
    {
      area: "Books",
      reports: [
        { key: "books-money-month", title: "Money this month", area: "Books", summary: null },
        { key: "books-owed-by-age", title: "Owed to you, by age", area: "Books", summary: "From Books" },
      ],
    },
  ],
  custom: [
    {
      id: "c1",
      title: "Monday board",
      description: null,
      audience: "EVERYONE",
      mine: true,
      editable: true,
      updatedAt: "2026-10-13T08:00:00.000Z",
      areaSources: [],
      madeBy: "James",
      folder: { id: "f1", name: "Monday meeting" },
      kind: "board",
      area: null,
    },
    {
      id: "c2",
      title: "Fitter pay sheet",
      description: null,
      audience: "EVERYONE",
      mine: false,
      editable: false,
      updatedAt: "2026-09-28T08:00:00.000Z",
      areaSources: [],
      madeBy: "Rudo",
      folder: { id: "f2", name: "Fitters" },
      kind: "table",
      area: null,
    },
  ],
  builtCustom: [{ key: "site-visits", title: "Site visits by fitter", description: "Visits, quotes drafted and accepted", audience: "EVERYONE", area: null }],
  templates: [],
  folders: [
    { id: "f1", name: "Monday meeting", canChange: true },
    { id: "f2", name: "Fitters", canChange: false },
  ],
  financialReports: true,
};

describe("All reports", () => {
  const entries = reportEntries(data);

  it("puts what is made here under ours and what Corelith ships under Corelith, with Make it yours", () => {
    expect(entries.filter((entry) => entry.group === "ours").map((entry) => [entry.title, entry.kind, entry.whose, entry.seenBy])).toEqual([
      ["Monday board", "Board", "yours", "Shared"],
      ["Fitter pay sheet", "Table", "shared", "Shared"],
    ]);
    const corelith = entries.filter((entry) => entry.group === "corelith");
    expect(corelith.map((entry) => entry.title)).toEqual([
      "Pipeline by stage",
      "Money this month",
      "Owed to you, by age",
      "Site visits by fitter",
      "Financial reports",
    ]);
    expect(corelith[0].copy).toEqual({ fromReport: "crm-deals" });
    expect(corelith[3].copy).toEqual({ fromTemplate: "site-visits" });
    expect(corelith[4]).toMatchObject({ href: "/accounting/financial-reports", copy: null });
  });

  it("counts each view and folder, and says so in the finding", () => {
    const counts = reportCounts(entries);
    expect(counts).toMatchObject({ all: 7, yours: 1, shared: 1, corelith: 5, books: 3, folders: { f1: 1, f2: 1 } });
    expect(reportBadges(counts)).toEqual({
      "/reports": "7",
      "/reports?view=yours": "1",
      "/reports?view=shared": "1",
      "/reports?view=corelith": "5",
    });
    expect(reportsFinding(counts)).toEqual({
      fact: "7 reports read this workspace.",
      rest: "1 is yours, 1 is shared with you, 5 come from Corelith, and 3 are kept up to date by Books.",
    });
    expect(reportsFinding(reportCounts([]))).toEqual({ fact: "No reports read this workspace yet.", rest: null });
  });

  it("narrows by view, folder, search, area and maker, ours first", () => {
    const filter = readReportsFilter(new URLSearchParams(""));
    expect(filterEntries(entries, filter).slice(0, 2).map((entry) => entry.id)).toEqual(["c1", "c2"]);
    expect(filterEntries(entries, { ...filter, sort: "oldest" }).slice(0, 2).map((entry) => entry.id)).toEqual(["c2", "c1"]);
    expect(filterEntries(entries, readReportsFilter(new URLSearchParams("view=shared"))).map((entry) => entry.id)).toEqual(["c2"]);
    expect(filterEntries(entries, readReportsFilter(new URLSearchParams("folder=f1"))).map((entry) => entry.id)).toEqual(["c1"]);
    expect(filterEntries(entries, readReportsFilter(new URLSearchParams("q=owed"))).map((entry) => entry.title)).toEqual(["Owed to you, by age"]);
    expect(filterEntries(entries, readReportsFilter(new URLSearchParams("area=Books"))).length).toBe(3);
    expect(filterEntries(entries, readReportsFilter(new URLSearchParams("maker=Rudo"))).map((entry) => entry.id)).toEqual(["c2"]);
    expect(readReportsFilter(new URLSearchParams("view=nonsense")).view).toBe("all");
    expect(makers(entries)).toEqual(["Rudo"]);
  });

  it("exports the list as it is shown", () => {
    expect(reportsCsv(entries.slice(0, 1))).toBe("Report,Kind,Folder,Made by,Changed,Seen by,From\nMonday board,Board,Monday meeting,James,2026-10-13,Shared,This workspace\n");
  });
});
