import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DEAL_REGISTER } from "@/lib/crm/registers/defs/deal";
import type { ColumnDef, ViewState } from "@/lib/crm/registers/types";

import { ColumnMenu } from "./column-menu";
import type { RegisterHandle } from "./use-register";

/**
 * A column's header menu, closed, as the table draws it: a caret that names
 * what it opens, a funnel once the column is filtered, and nothing at all on
 * a column with nothing to offer.
 */
function register(state: Partial<ViewState> = {}): RegisterHandle {
  return { def: DEAL_REGISTER, state: { filters: {}, ...state } } as unknown as RegisterHandle;
}

function column(id: string): ColumnDef {
  return DEAL_REGISTER.columns.find((candidate) => candidate.id === id)!;
}

describe("a column's header menu", () => {
  it("opens from a caret named for its column", () => {
    const html = renderToStaticMarkup(<ColumnMenu register={register()} column={column("owner")} />);
    expect(html).toContain('aria-label="Owner: sort, filter or hide"');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("says its column is filtered, without being hovered", () => {
    const html = renderToStaticMarkup(
      <ColumnMenu register={register({ filters: { owner: ["me"] } })} column={column("owner")} />,
    );
    expect(html).toContain('aria-label="Owner: filtered — sort, filter or hide"');
    expect(html).not.toContain("opacity-0");
  });

  it("stays out of a column with nothing to sort, filter or hide", () => {
    const bare: ColumnDef = { id: "name", label: "Deal", kind: "text", required: true };
    expect(renderToStaticMarkup(<ColumnMenu register={register()} column={bare} />)).toBe("");
    // The one column a table cannot hide still sorts.
    expect(renderToStaticMarkup(<ColumnMenu register={register()} column={column("name")} />)).toContain(
      'aria-label="Deal: sort, filter or hide"',
    );
  });
});
