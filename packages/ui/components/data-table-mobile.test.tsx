import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DataTable } from "./data-table";

/**
 * The defect this pins down:
 *
 * `DataTable` hid its desktop table below `md` only when `mobileCardRenderer`
 * was set. Every `mobileListRenderer` caller therefore rendered the mobile
 * list *and* the full table, stacked, on a phone — the list, then the same
 * records again as an eight-column grid nobody could read.
 */
const DATA = [{ id: "a", name: "Meikles Hotel" }];
const COLUMNS = [{ id: "name", header: "Name", cell: () => "Meikles Hotel" }];

function tableContainerHidden(html: string) {
  // The table lives inside the last container the component renders; a
  // `hidden md:block` anywhere in the markup is that container, since nothing
  // else in a DataTable uses the pair.
  return html.includes("hidden md:block");
}

describe("DataTable mobile renderers", () => {
  it("hides the table below md when a list renderer is given", () => {
    const html = renderToStaticMarkup(
      <DataTable
        data={DATA}
        columns={COLUMNS}
        mobileListRenderer={({ rows }) => <ul>{rows.map(() => null)}</ul>}
      />,
    );
    expect(tableContainerHidden(html)).toBe(true);
  });

  it("still hides it for the card renderer", () => {
    const html = renderToStaticMarkup(
      <DataTable data={DATA} columns={COLUMNS} mobileCardRenderer={() => null} />,
    );
    expect(tableContainerHidden(html)).toBe(true);
  });

  it("leaves the table visible when neither is given", () => {
    const html = renderToStaticMarkup(<DataTable data={DATA} columns={COLUMNS} />);
    expect(tableContainerHidden(html)).toBe(false);
  });
});
