// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { ButtonGroup } from "./button-group";
import { Chip } from "./chip";
import { CountPill, OnBadge } from "./count-pill";
import { FilterChip } from "./filter-chip";
import { OptionCard, OptionCardGroup } from "./option-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Button", () => {
  it("draws each variant and size", () => {
    expect(renderToStaticMarkup(<Button>Export</Button>)).toBe('<button type="button" class="cx-btn">Export</button>');
    expect(renderToStaticMarkup(<Button variant="primary" size="field">Open shift</Button>)).toContain(
      'class="cx-btn cx-btn--primary cx-btn--field"',
    );
    expect(renderToStaticMarkup(<Button variant="danger">Void sale SALE-31863</Button>)).toContain("cx-btn--danger");
    expect(renderToStaticMarkup(<Button iconOnly aria-label="More actions">⋯</Button>)).toContain("cx-btn--icon");
  });

  it("holds itself while busy", () => {
    const html = renderToStaticMarkup(<Button busy>Save</Button>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("cx-btn__spin");
  });

  it("lends its look to a link", () => {
    const html = renderToStaticMarkup(
      <Button asChild variant="primary">
        <a href="https://example.test/shifts">Shifts</a>
      </Button>,
    );
    expect(html).toBe('<a href="https://example.test/shifts" class="cx-btn cx-btn--primary">Shifts</a>');
  });

  it("joins in a group", () => {
    const html = renderToStaticMarkup(
      <ButtonGroup aria-label="Actions">
        <Button>Print</Button>
      </ButtonGroup>,
    );
    expect(html).toContain('role="group" class="cx-group" aria-label="Actions"');
  });
});

describe("Chip", () => {
  it("is a toggle with its count", () => {
    const html = renderToStaticMarkup(
      <Chip pressed count={48}>
        Beer
      </Chip>,
    );
    expect(html).toBe('<button type="button" aria-pressed="true" class="cx-chip">Beer<span class="cx-chip__count">48</span></button>');
  });
});

describe("CountPill and OnBadge", () => {
  it("draw a count and an on-count", () => {
    expect(renderToStaticMarkup(<CountPill>312</CountPill>)).toBe('<span class="cx-count">312</span>');
    expect(renderToStaticMarkup(<CountPill inTab>3</CountPill>)).toBe('<span class="cx-count cx-count--tab">3</span>');
    expect(renderToStaticMarkup(<OnBadge>1</OnBadge>)).toBe('<span class="cx-badge-on">1</span>');
  });
});

describe("FilterChip", () => {
  it("says its label and answer, and marks itself set away from the default", () => {
    const any = renderToStaticMarkup(<FilterChip label="Till" value="Any" />);
    expect(any).toContain('aria-label="Till: Any"');
    expect(any).toContain('class="cx-filter"');
    const set = renderToStaticMarkup(<FilterChip label="Cashier" value="Chipo Dube" isSet />);
    expect(set).toContain('class="cx-filter is-set"');
    expect(set).toContain('<span class="cx-filter__value">Chipo Dube</span>');
  });
});

describe("OptionCard", () => {
  it("is a radio with its title, description and badge", () => {
    const html = renderToStaticMarkup(
      <OptionCard checked title="Liquor store" description="Age checks, licence hours, deposits." badge="Soon" disabled />,
    );
    expect(html).toContain('role="radio" aria-checked="true" disabled=""');
    expect(html).toContain('<span class="cx-option__title">Liquor store</span><span class="cx-option__badge">Soon</span>');
  });

  it("moves the choice with the arrow keys and skips cards that are not ready", () => {
    const options = [
      { value: "liquor", title: "Liquor store" },
      { value: "pharmacy", title: "Pharmacy", badge: "Soon" },
      { value: "general", title: "General store" },
    ];
    function Harness() {
      const [value, setValue] = useState<string>("liquor");
      return <OptionCardGroup aria-label="Shop type" options={options} value={value} onValueChange={setValue} />;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Harness />));
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
    const first = container.querySelector('[aria-checked="true"]') as HTMLElement;
    expect(first.tabIndex).toBe(0);
    act(() => first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(container.querySelector('[aria-checked="true"]')?.textContent).toBe("General store");
    act(() => root.unmount());
    container.remove();
  });
});
