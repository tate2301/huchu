/**
 * A shop's sources — lists and report faces — read for a custom report the
 * way they are exported: under the list's own check, with the report's dates
 * as the list's period.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchListExport = vi.fn();
const fetchReport = vi.fn();
vi.mock("@/lib/reports/request", () => ({ fetchListExport: (...args: unknown[]) => fetchListExport(...args), fetchReport: (...args: unknown[]) => fetchReport(...args) }));
vi.mock("@/lib/api-utils", async (original) => ({
  ...(await original<typeof import("@/lib/api-utils")>()),
  validateSession: async () => ({ session: { user: { id: "u", companyId: "c", role: "MANAGER", enabledFeatures: [] } } }),
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://x/api/v2/reports/sources/rows", { method: "POST", body: JSON.stringify(body) }) as never);

describe("a shop's sources in a custom report", () => {
  beforeEach(() => {
    fetchListExport.mockReset();
    fetchReport.mockReset();
  });

  it("reads a report face as its export, with the report's dates as its period", async () => {
    fetchListExport.mockResolvedValue({ ordered: [{ id: "1", item: "Castle Lite", revenue: 12 }] });
    const response = await post({ keys: ["retail-items-sold"], params: { from: "2026-09-01", to: "2026-09-30" } });
    const body = await response.json();
    expect(body.sources["retail-items-sold"].rows).toEqual([{ id: "1", item: "Castle Lite", revenue: 12 }]);
    const [, key, query] = fetchListExport.mock.calls[0]!;
    expect(key).toBe("retail-items-sold");
    expect(query).toMatchObject({ face: "report", page: 1 });
    expect(Object.values(query.filters)).toContain("2026-09-01..2026-09-30");
    expect(fetchReport).not.toHaveBeenCalled();
  });

  it("answers a list this person may not read as missing, not as rows", async () => {
    fetchListExport.mockResolvedValue({ status: 403, error: "Your role cannot view payments" });
    const body = await (await post({ keys: ["retail-payments"], params: {} })).json();
    expect(body).toMatchObject({ sources: {}, missing: ["retail-payments"] });
  });
});
