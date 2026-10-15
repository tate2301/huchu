/**
 * What Vane shows beside its words: each block is checked before it is kept
 * (links inside the app only), a block that no longer reads is dropped, the
 * `show` tool keeps them on a chat answer and refuses anywhere else, and the
 * panel draws figures, charts, records and sources as themselves.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VaneBlocks } from "@/components/vane/vane-blocks";

import { asBlocks, blockSchema, type VaneBlock } from "./blocks";
import { callTool } from "./tools";

const figures: VaneBlock = { kind: "figures", figures: [{ label: "Overdue", value: "$2,480.00", note: "3 invoices" }] };
const chart: VaneBlock = {
  kind: "chart",
  title: "Won value by month",
  form: "bars",
  unit: "money",
  currency: "USD",
  points: [
    { label: "August", value: 4200 },
    { label: "September", value: 8930 },
  ],
};

describe("Vane's blocks", () => {
  it("keeps links inside the app, and drops what no longer reads", () => {
    expect(blockSchema.safeParse({ kind: "record", title: "Pomona Offices", href: "https://evil.example" }).success).toBe(false);
    expect(blockSchema.safeParse({ kind: "record", title: "Pomona Offices", href: "//evil.example" }).success).toBe(false);
    expect(blockSchema.safeParse({ kind: "record", title: "Pomona Offices", href: "/crm/deals/d1" }).success).toBe(true);
    expect(asBlocks([figures, { kind: "nonsense" }, chart])).toEqual([figures, chart]);
    expect(asBlocks("not a list")).toEqual([]);
  });

  it("are shown on a chat answer, and only there", async () => {
    const blocks: VaneBlock[] = [];
    expect(await callTool({ companyId: "c", jobId: null, blocks }, "show", { blocks: [figures, chart] })).toMatchObject({ ok: true });
    expect(blocks).toEqual([figures, chart]);
    expect(await callTool({ companyId: "c", jobId: null }, "show", { blocks: [figures] })).toMatchObject({ ok: false, content: expect.stringContaining("chat") });
  });

  it("draw as figures, bars with their values, and a record's card linking to it", () => {
    const html = renderToStaticMarkup(
      <VaneBlocks
        blocks={[figures, chart, { kind: "record", title: "Pomona Offices", subtitle: "Carpet tiles", href: "/crm/deals/d1", fields: [{ label: "Value", value: "$8,930.00" }] }]}
      />,
    );
    expect(html).toContain("$2,480.00");
    expect(html).toContain("3 invoices");
    expect(html).toContain("$8,930.00");
    expect(html).toContain('aria-label="Won value by month. August: $4,200.00, September: $8,930.00"');
    expect(html).toContain('href="/crm/deals/d1"');
  });

  it("say a quote that was deleted is gone", () => {
    expect(renderToStaticMarkup(<VaneBlocks blocks={[{ kind: "gone", what: "The quote Vane drafted" }]} />)).toContain("The quote Vane drafted is not here any more.");
  });
});
