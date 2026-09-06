import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { RichTextComposer } from "./rich-text-composer";

/**
 * iOS zooms the whole page in when a field under 16px takes focus, and never
 * zooms back out — so a composer at `text-sm` leaves somebody stranded at 1.3×
 * for the rest of the page.
 *
 * `app/globals.css` has a 16px rule for `input`, `select`, `textarea` and
 * `[contenteditable]`, but it cannot reach this element: it lives in
 * `@layer app`, and Tailwind's utilities are a later layer, so any `text-sm`
 * written at the call site wins. The fix has to be at the call site, and this
 * asserts on the emitted element rather than the source because the cascade
 * question is exactly the kind that reads correct and renders wrong.
 */
function editableTag() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RichTextComposer value="" onChange={() => {}} onSubmit={() => {}} />
    </QueryClientProvider>,
  );
  const index = html.indexOf('role="textbox"');
  return html.slice(html.lastIndexOf("<", index), html.indexOf(">", index) + 1);
}

describe("RichTextComposer", () => {
  it("renders the editable at 16px, dropping to 14px only from sm up", () => {
    const tag = editableTag();

    expect(tag).toContain('contentEditable="true"');
    expect(tag).toContain("text-base");
    expect(tag).toContain("sm:text-sm");
  });

  it("carries no unqualified text-sm that would win the cascade back", () => {
    // With the responsive pair removed, nothing resembling `text-sm` should be
    // left — a bare one would apply at every width and undo the fix.
    const remaining = editableTag().replace("text-base", "").replace("sm:text-sm", "");
    expect(remaining).not.toMatch(/\btext-sm\b/);
  });
});
