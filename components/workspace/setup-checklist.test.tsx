// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SetupChecklist, SetupChecklistSkeleton, type SetupChecklistItem } from "./setup-checklist";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The left card of the Guided board: the state right after onboarding. */
const ITEMS: SetupChecklistItem[] = [
  { key: "shopType", label: "Pick the shop type", why: "Liquor store", done: true, href: "/retail/manage/company", cta: "Pick it" },
  { key: "products", label: "Add your products", why: "137 products, all on sale", done: true, href: "/retail/products?sheet=product-new", cta: "Add products" },
  { key: "till", label: "Pair a till", why: "Front till, CounterMini", done: true, href: "/retail/manage/tills", cta: "Pair a till" },
  { key: "staff", label: "Invite your staff", why: "3 people with PINs", done: true, href: "/retail/manage/people", cta: "Invite" },
  { key: "suppliers", label: "Add your suppliers", why: "So low stock turns into an order in a tap.", done: false, href: "/retail/buying/suppliers?sheet=supplier-new", cta: "Add a supplier" },
  { key: "fiscal", label: "Connect the fiscal device", why: "ZIMRA needs every receipt signed.", done: false, href: "/retail/manage/fiscal", cta: "Connect" },
  { key: "ecocash", label: "Add your EcoCash merchant code", why: "So EcoCash payments confirm on their own.", done: false, href: "/retail/manage/payments", cta: "Add it" },
];

const rowsOf = (html: string) => [...html.matchAll(/<li class="cx-sc__item[^"]*">(.*?)<\/li>/g)].map((match) => match[0]);

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return host;
}

describe("SetupChecklist", () => {
  it("draws the Guided board's card: title, 4 of 7, struck-through done rows with their whys, buttons on the rest", () => {
    const html = renderToStaticMarkup(<SetupChecklist done={4} total={7} items={ITEMS} onHide={() => {}} />);
    expect(html).toMatch(/<h2[^>]*>Finish setting up<\/h2>/);
    expect(html).toContain('<span class="cx-sc__figure">4</span> of <span class="cx-sc__figure">7</span>');
    expect(html).toContain('style="width:57%"');
    expect(html).toContain('aria-valuenow="4"');
    expect(html).toContain("Hide until tomorrow");

    const rows = rowsOf(html);
    expect(rows).toHaveLength(7);
    for (const row of rows.slice(0, 4)) {
      expect(row).toContain("cx-sc__item--done");
      expect(row).toContain("cx-sc__circle--done");
      expect(row).not.toContain("<a ");
    }
    expect(rows[0]).toContain("Pick the shop type");
    expect(rows[0]).toContain("Liquor store");
    expect(rows[1]).toContain("137 products, all on sale");
    expect(rows[2]).toContain("Front till, CounterMini");
    expect(rows[3]).toContain("3 people with PINs");

    expect(rows[4]).toContain('<a class="cx-sc__cta" href="/retail/buying/suppliers?sheet=supplier-new">Add a supplier</a>');
    expect(rows[4]).toContain("So low stock turns into an order in a tap.");
    expect(rows[5]).toContain('<a class="cx-sc__cta" href="/retail/manage/fiscal">Connect</a>');
    expect(rows[5]).toContain("ZIMRA needs every receipt signed.");
    expect(rows[6]).toContain('<a class="cx-sc__cta" href="/retail/manage/payments">Add it</a>');
    expect(rows[6]).toContain("So EcoCash payments confirm on their own.");
    for (const row of rows.slice(4)) expect(row).not.toContain("cx-sc__item--done");

    expect(html).toContain(
      "This card sits at the top of the overview until everything is ticked, then it goes for good. Nothing on it stops you selling.",
    );
  });

  it("draws status circles as pictures when the page cannot tick by hand", () => {
    const html = renderToStaticMarkup(<SetupChecklist done={4} total={7} items={ITEMS} onHide={() => {}} />);
    expect(html).not.toContain("aria-pressed");
    expect(html.match(/role="img" aria-label="Done"/g)).toHaveLength(4);
    expect(html.match(/role="img" aria-label="To do"/g)).toHaveLength(3);
  });

  it("hides on 'Hide until tomorrow'", () => {
    const onHide = vi.fn();
    const node = mount(<SetupChecklist done={4} total={7} items={ITEMS} onHide={onHide} />);
    const hide = [...node.querySelectorAll("button")].find((button) => button.textContent === "Hide until tomorrow")!;
    act(() => hide.click());
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("ticks an open item or a hand-ticked one, never one done by its data", () => {
    const onTick = vi.fn();
    const items = ITEMS.map((item) => (item.key === "staff" ? { ...item, byHand: true } : item));
    const node = mount(<SetupChecklist done={4} total={7} items={items} onHide={() => {}} onTick={onTick} />);
    const toggles = [...node.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
    expect(toggles.map((button) => [button.getAttribute("aria-label"), button.getAttribute("aria-pressed")])).toEqual([
      ["Invite your staff", "true"],
      ["Add your suppliers", "false"],
      ["Connect the fiscal device", "false"],
      ["Add your EcoCash merchant code", "false"],
    ]);
    act(() => toggles[1].click());
    expect(onTick).toHaveBeenCalledWith(expect.objectContaining({ key: "suppliers" }));
  });

  it("loads as a card with seven grey rows", () => {
    const html = renderToStaticMarkup(<SetupChecklistSkeleton />);
    expect(html).toContain('aria-busy="true"');
    expect(rowsOf(html)).toHaveLength(7);
    expect(html).not.toContain("Hide until tomorrow");
  });
});
