import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Field, neededMessage } from "./field";
import { MoneyInput, normaliseMoney } from "./money-input";
import { ReadValue } from "./read-value";
import { addTag, TagsInput } from "./tags-input";
import { TextInput } from "./text-input";

const noop = () => {};

describe("Field", () => {
  it("labels its control, marks it optional and points at its hint", () => {
    const html = renderToStaticMarkup(
      <Field id="name" label="Name" optional hint="What the till and receipts say.">
        {(control) => <TextInput {...control} />}
      </Field>,
    );
    expect(html).toContain('<label class="cx-label" for="name">Name<span class="cx-label__opt"> optional</span></label>');
    expect(html).toContain('id="name" aria-describedby="name-note"');
    expect(html).toContain('<span id="name-note" class="cx-hint">What the till and receipts say.</span>');
  });

  it("shows the error in place of the hint and marks the control invalid", () => {
    const html = renderToStaticMarkup(
      <Field id="name" label="Name" hint="What the till and receipts say." error={neededMessage("Name")}>
        {(control) => <TextInput {...control} />}
      </Field>,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('<span id="name-note" class="cx-error">Name is needed.</span>');
    expect(html).not.toContain("cx-hint");
  });

  it("draws no label for a nolabel field", () => {
    const html = renderToStaticMarkup(
      <Field label="Deposits" nolabel>
        {() => <span />}
      </Field>,
    );
    expect(html).not.toContain("<label");
  });
});

describe("MoneyInput", () => {
  it("writes amounts with two decimals", () => {
    expect(normaliseMoney("1.5")).toBe("1.50");
    expect(normaliseMoney("1,284.6")).toBe("1284.60");
    expect(normaliseMoney(" 7 ")).toBe("7.00");
    expect(normaliseMoney("")).toBe("");
    expect(normaliseMoney("abc")).toBe("abc");
    expect(normaliseMoney("26.8", 4)).toBe("26.80");
    expect(normaliseMoney("26.8125", 4)).toBe("26.8125");
    expect(normaliseMoney("26.81257", 4)).toBe("26.8126");
  });

  it("joins the currency to a decimal input", () => {
    const html = renderToStaticMarkup(<MoneyInput value="1.85" onValueChange={noop} currency="ZiG" aria-label="Price" />);
    expect(html).toContain('<span class="cx-money__cur" aria-hidden="true">ZiG</span>');
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('placeholder="0.00"');
  });
});

describe("ReadValue", () => {
  it("shows a computed value in mono with its tone", () => {
    expect(renderToStaticMarkup(<ReadValue mono tone="ok">25.4%</ReadValue>)).toBe(
      '<div class="cx-read cx-read--mono cx-read--ok">25.4%</div>',
    );
  });
});

describe("TagsInput", () => {
  it("adds a trimmed tag once", () => {
    expect(addTag(["Beer"], " Cider ")).toEqual(["Beer", "Cider"]);
    expect(addTag(["Beer"], "beer")).toEqual(["Beer"]);
    expect(addTag(["Beer"], "  ")).toEqual(["Beer"]);
  });

  it("names each remove button", () => {
    const html = renderToStaticMarkup(<TagsInput value={["Beer", "Cider"]} onValueChange={noop} />);
    expect(html).toContain('aria-label="Remove Cider"');
  });
});
