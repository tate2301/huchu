// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alcoholVerdict } from "@/lib/retail/licence-hours";

import { AgeCheckDialog, CaseDialog } from "./floor-parts";
import { asksForId, breakOneCase, caseMoment, licenceEyebrow, licenceSentence, NOT_SOLD } from "./moments";
import { ProductTile } from "./tile";
import type { PosCatalogItem } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * FLR-10, the Liquor board's till moments: the age check asks once a sale
 * and "Remove it" takes the line out; outside the licence hours restricted
 * products read "Not sold" and nothing offers a manager's approval; with no
 * singles left and cases in the branch the till asks, and "Open 1 case"
 * breaks one.
 */

// Harare is UTC+2: Monday 12 October 2026 at 22:04, and 07:30.
const MONDAY_2204 = new Date("2026-10-12T20:04:00Z");
const MONDAY_0730 = new Date("2026-10-12T05:30:00Z");
const SUNDAY_1830 = new Date("2026-10-11T16:30:00Z");
const WEEK = [
  ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, alcoholFrom: 8 * 60, alcoholUntil: 22 * 60 })),
  { weekday: 0, alcoholFrom: 10 * 60, alcoholUntil: 18 * 60 },
];

function product(patch: Partial<PosCatalogItem>): PosCatalogItem {
  return {
    id: "castle",
    productId: "castle",
    sku: "CAS-340",
    name: "Castle Lager 340ml",
    barcode: null,
    description: null,
    imageUrl: null,
    ageRestricted: true,
    maxDiscountPercent: null,
    returnable: false,
    depositAmount: null,
    openPrice: false,
    packOf: null,
    packSize: null,
    status: "ACTIVE",
    binnedAt: null,
    unitPrice: 1.2,
    taxPercent: 15.5,
    taxInclusive: true,
    currency: "USD",
    priceListId: null,
    priceSource: "LIST",
    pricedAt: null,
    inventoryItemId: "line",
    siteId: "site",
    categoryId: "beer",
    category: "Beer",
    inventoryItem: { id: "line", itemCode: "CAS-340", name: "Castle Lager 340ml", currentStock: 0, unit: "each", reorderLevel: null },
    openableCase: { productId: "case", name: "Castle Lager, case of 24", unitsPerCase: 24, casesOnHand: 4, breakAtTill: false },
    caseOf: null,
    wasPrice: null,
    priceBreaks: [],
    depositName: null,
    ...patch,
  } as PosCatalogItem;
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === name) as HTMLButtonElement | undefined;

/** A sale as the workbench rings it: the first 18+ line asks, and the answer stands for the sale. */
function Sale({ items }: { items: PosCatalogItem[] }) {
  const [cart, setCart] = React.useState<Array<{ id: string; ageRestricted: boolean }>>([]);
  const [idChecked, setIdChecked] = React.useState(false);
  const [asking, setAsking] = React.useState<PosCatalogItem | null>(null);
  const add = (item: PosCatalogItem) => {
    const ask = asksForId({ ageCheckOn: true, idChecked, cart, item });
    setCart((current) => [...current, { id: item.id, ageRestricted: item.ageRestricted }]);
    if (ask) setAsking(item);
  };
  return (
    <>
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => add(item)}>
          {`Add ${item.name}`}
        </button>
      ))}
      <output data-lines={cart.map((line) => line.id).join(",")} data-checked={String(idChecked)} />
      <AgeCheckDialog
        open={asking !== null}
        eyebrow="Front till · Chipo Dube"
        product={asking?.name ?? ""}
        category={asking?.category ?? null}
        onRemove={() => {
          setCart((current) => current.filter((line) => line.id !== asking?.id));
          setAsking(null);
        }}
        onConfirm={() => {
          setIdChecked(true);
          setAsking(null);
        }}
      />
    </>
  );
}

const lines = () => document.querySelector("output")?.getAttribute("data-lines") ?? "";

describe("the age check (Liquor panel 1)", () => {
  const whisky = product({ id: "jwb", name: "Johnnie Walker Black 750ml", category: "Spirits", categoryId: "spirits" });
  const another = product({ id: "jameson", name: "Jameson 750ml", category: "Spirits", categoryId: "spirits" });

  it("asks once a sale, in the board's words, and a second whisky does not ask", () => {
    mount(<Sale items={[whisky, another]} />);
    act(() => button("Add Johnnie Walker Black 750ml")!.click());
    expect(document.body.textContent).toContain("Check ID: 18 and over");
    expect(document.body.textContent).toContain("Johnnie Walker Black 750ml is in Spirits, which needs an ID check.");
    expect(document.body.textContent).toContain("Front till · Chipo Dube");
    expect(document.body.textContent).toContain("Asked once a sale. Logged with the cashier’s name.");
    act(() => button("18 or over")!.click());
    expect(document.body.textContent).not.toContain("Check ID: 18 and over");

    act(() => button("Add Jameson 750ml")!.click());
    expect(document.body.textContent).not.toContain("Check ID: 18 and over");
    expect(lines()).toBe("jwb,jameson");
    expect(document.querySelector("output")?.getAttribute("data-checked")).toBe("true");
  });

  it("takes the line out on Remove it", () => {
    mount(<Sale items={[whisky]} />);
    act(() => button("Add Johnnie Walker Black 750ml")!.click());
    expect(lines()).toBe("jwb");
    act(() => button("Remove it")!.click());
    expect(lines()).toBe("");
    expect(document.body.textContent).not.toContain("Check ID: 18 and over");
  });

  it("asks again on a new sale, and never while the switch is off", () => {
    expect(asksForId({ ageCheckOn: true, idChecked: false, cart: [], item: whisky })).toBe(true);
    expect(asksForId({ ageCheckOn: true, idChecked: false, cart: [{ ageRestricted: true }], item: whisky })).toBe(false);
    expect(asksForId({ ageCheckOn: false, idChecked: false, cart: [], item: whisky })).toBe(false);
    expect(asksForId({ ageCheckOn: true, idChecked: false, cart: [], item: product({ ageRestricted: false }) })).toBe(false);
  });
});

describe("the licence hours (Liquor panel 2)", () => {
  it("says when alcohol stops, and when it starts again", () => {
    expect(licenceSentence(alcoholVerdict(WEEK, MONDAY_2204), MONDAY_2204)).toBe("Alcohol stops at 22:00 on weekdays. Soft drinks and snacks still sell.");
    expect(licenceEyebrow("Front till", MONDAY_2204)).toBe("Front till · Monday 22:04");
    expect(licenceSentence(alcoholVerdict(WEEK, MONDAY_0730), MONDAY_0730)).toBe("Alcohol sells from 08:00. Soft drinks and snacks sell now.");
    expect(licenceSentence(alcoholVerdict(WEEK, SUNDAY_1830), SUNDAY_1830)).toBe(
      "Alcohol stops at 18:00 on Sundays and public holidays. Soft drinks and snacks still sell.",
    );
  });

  it("reads Not sold on a restricted product, repeats the sentence on a tap, and offers no approval", () => {
    const verdict = alcoholVerdict(WEEK, MONDAY_2204);
    expect(verdict.sellable).toBe(false);
    const stoppedUntil = verdict.sellable ? undefined : verdict.startsAt;
    const onAdd = vi.fn();
    const onStopped = vi.fn();
    mount(
      <>
        <ProductTile item={product({ inventoryItem: { id: "l", itemCode: "c", name: "c", currentStock: 30, unit: "each", reorderLevel: null } as PosCatalogItem["inventoryItem"] })} stoppedUntil={stoppedUntil} depositsOn={false} onSale={0} onAdd={onAdd} onStopped={onStopped} />
        <ProductTile
          item={product({ id: "coke", name: "Coca-Cola 2l", ageRestricted: false, unitPrice: 2.5, openableCase: null, inventoryItem: { id: "k", itemCode: "k", name: "k", currentStock: 12, unit: "each", reorderLevel: null } as PosCatalogItem["inventoryItem"] })}
          stoppedUntil={stoppedUntil}
          depositsOn={false}
          onSale={0}
          onAdd={onAdd}
          onStopped={onStopped}
        />
      </>,
    );
    const tiles = [...document.querySelectorAll<HTMLButtonElement>("button.tile")];
    expect(tiles[0].querySelector(".p")?.textContent).toBe(NOT_SOLD);
    expect(tiles[1].querySelector(".p")?.textContent).toContain("US$2.50");
    act(() => tiles[0].click());
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/manager has to approve/i);
    act(() => tiles[1].click());
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("cases and singles (Liquor panel 4)", () => {
  it("asks when singles run out and a case is in, opens at once where the case breaks at the till", () => {
    const castle = product({});
    expect(caseMoment({ casesAndSingles: true, openableCase: castle.openableCase, stock: 0 })).toEqual({ kind: "ask" });
    expect(caseMoment({ casesAndSingles: true, openableCase: { ...castle.openableCase!, breakAtTill: true }, stock: 0 })).toEqual({ kind: "break" });
    expect(caseMoment({ casesAndSingles: true, openableCase: castle.openableCase, stock: 3 })).toEqual({ kind: "none" });
    expect(caseMoment({ casesAndSingles: false, openableCase: castle.openableCase, stock: 0 })).toEqual({ kind: "none" });
    expect(caseMoment({ casesAndSingles: true, openableCase: { ...castle.openableCase!, casesOnHand: 0 }, stock: 0 })).toEqual({ kind: "none" });
  });

  it("breaks one case on Open 1 case, and adds nothing on Not now", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { reference: "BRK-0013", cases: 1, singles: 24, caseOnHand: 3, singleOnHand: 24 } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const opened: number[] = [];
    const notNow = vi.fn();
    mount(
      <CaseDialog
        open
        eyebrow="Front till · Chipo Dube"
        single="Castle Lager 340ml"
        casesOnHand={4}
        unitsPerCase={24}
        busy={false}
        offline={false}
        onNotNow={notNow}
        onOpen={() => void breakOneCase("case", "site").then((onHand) => opened.push(onHand))}
      />,
    );
    expect(document.body.textContent).toContain("No singles left");
    expect(document.body.textContent).toContain("Castle Lager 340ml shows 0 singles but 4 cases. Open a case?");
    expect(document.body.textContent).toContain("1 case off, 24 singles on. Automatic if Break cases at the till is on.");

    await act(async () => {
      button("Open 1 case")!.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v2/retail/stock/case-breaks");
    expect(JSON.parse(String(init.body))).toEqual({ caseProductId: "case", siteId: "site", cases: 1 });
    expect(opened).toEqual([24]);

    act(() => button("Not now")!.click());
    expect(notNow).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
