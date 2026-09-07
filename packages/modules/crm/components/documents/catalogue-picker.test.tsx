import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CataloguePicker } from "./catalogue-picker";

/**
 * The bug this pins down:
 *
 * `PopoverTrigger asChild` merges `type="button"` onto its child. `type` was
 * not among the props written on the `<Input>` here, so it survived the Slot
 * merge and the description field rendered as `<input type="button">` — a
 * button, which cannot be typed into at all. The value showed as its label,
 * the placeholder was ignored, and the only descriptions that could reach a
 * quote were ones set programmatically: a site-visit prefill or a catalogue
 * pick. Customers reported it as "I can't add my own items".
 *
 * It rendered fine, typechecked fine, and passed every test, because nothing
 * had ever asserted on the emitted element. So this does.
 */
function render(props?: Partial<Parameters<typeof CataloguePicker>[0]>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <CataloguePicker
        value="Aluminium sliding window"
        onChange={() => {}}
        onPick={() => {}}
        placeholder="What are you charging for?"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("CataloguePicker", () => {
  it("renders a text field somebody can type into", () => {
    const html = render();
    expect(html).toContain('type="text"');
    expect(html).not.toContain('type="button"');
  });

  it("keeps the placeholder, which a button input silently drops", () => {
    expect(render()).toContain('placeholder="What are you charging for?"');
  });

  it("shows what was typed as the field's value, not as a label", () => {
    expect(render()).toContain('value="Aluminium sliding window"');
  });

  it("announces itself as a combobox rather than as a dialog trigger", () => {
    // The old markup carried aria-haspopup="dialog" on a text field, which
    // tells a screen reader the wrong thing about what Enter will do.
    const html = render();
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain('aria-haspopup="dialog"');
  });

  it("labels the field for anyone not looking at the column header", () => {
    expect(render({ "aria-label": "Line 2 description" })).toContain(
      'aria-label="Line 2 description"',
    );
  });
});
