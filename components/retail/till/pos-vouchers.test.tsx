// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { priceCart } from "./cart-pricing";
import { VoucherTender } from "./pay-tray";
import type { CartItem, PaymentRow } from "./types";
import { holdsVouchers, voucherPays, VOUCHERS_OFFLINE } from "./vouchers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * FLR-10 (PRD-10, W-18): vouchers at the till. The VOUCHER tender is off
 * offline with the sentence; a check's reason shows in the server's words; a
 * voucher pays what is left on it, the rest another way; gift vouchers sold
 * are paid on top of the goods, never inside their total.
 */

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

const button = (name: RegExp) => [...document.querySelectorAll("button")].find((element) => name.test(element.textContent ?? "")) as HTMLButtonElement | undefined;

/** Types into a controlled input the way a person does. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function answer(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
}

const tender = (props: Partial<React.ComponentProps<typeof VoucherTender>> = {}) => (
  <VoucherTender due={12} offline={false} busy={false} splitAllowed onTake={() => undefined} onSplit={() => undefined} {...props} />
);

describe("the VOUCHER tender", () => {
  it("is off offline, with the sentence", () => {
    mount(tender({ offline: true }));
    expect(document.body.textContent).toContain(VOUCHERS_OFFLINE);
    expect(document.querySelector("input")).toBeNull();
    expect(button(/^Take/)).toBeUndefined();
  });

  it("shows the check's reason in the server's words", async () => {
    const fetchMock = answer({ data: null, usable: false, reason: "It expired on 9 October 2026." });
    vi.stubGlobal("fetch", fetchMock);
    mount(tender());
    const [code, secret] = [...document.querySelectorAll<HTMLInputElement>("input")];
    type(code, "GV-0019");
    type(secret, "K7MQ2X");
    await act(async () => {
      button(/^Check$/)!.click();
    });
    const url = String((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain("/api/v2/retail/pos/vouchers/check?");
    expect(url).toContain("code=GV-0019");
    expect(url).toContain("secret=K7MQ2X");
    expect(document.body.textContent).toContain("It expired on 9 October 2026.");
    expect(button(/^Take/)!.disabled).toBe(true);
  });

  it("pays what is left, and sends the rest another way", async () => {
    vi.stubGlobal(
      "fetch",
      answer({
        data: { code: "GV-0019", kind: "GIFT", left: 7.4, percentOff: null, amountOff: null, usesLeft: null, minSale: null, expiresOn: "2027-10-09", usable: true, reason: null },
        usable: true,
        reason: null,
      }),
    );
    const onSplit = vi.fn<(row: PaymentRow) => void>();
    mount(tender({ onSplit }));
    const [code, secret] = [...document.querySelectorAll<HTMLInputElement>("input")];
    type(code, "GV-0019");
    type(secret, "K7MQ2X");
    await act(async () => {
      button(/^Check$/)!.click();
    });
    expect(document.body.textContent).toContain("US$7.40 left on it");
    act(() => button(/the rest another way/)!.click());
    expect(onSplit).toHaveBeenCalledWith({ tenderType: "VOUCHER", amount: "7.40", reference: "GV-0019", voucherCode: "GV-0019", voucherSecret: "K7MQ2X" });
    expect(voucherPays(7.4, 12)).toBe(7.4);
    expect(voucherPays(25, 12)).toBe(12);
  });
});

describe("gift vouchers sold", () => {
  const coke: CartItem = {
    id: "coke",
    name: "Coca-Cola 2l",
    catalogItemId: "coke",
    category: "Soft drinks",
    quantity: 2,
    unitPrice: 2.5,
    shelfPrice: 2.5,
    priceOfOne: 2.5,
    priceBreaks: [],
    openPrice: false,
    taxPercent: 15.5,
    taxInclusive: true,
    lineDiscountAmount: 0,
    ageRestricted: false,
    returnable: false,
    depositAmount: null,
    depositName: null,
    emptiesBack: 0,
    maxDiscountPercent: null,
    openableCase: null,
  };

  it("sit outside the goods total, and are paid on top", () => {
    const priced = (vouchersSold: Array<{ value: string }>) =>
      priceCart({
        lines: [coke],
        snapshot: null,
        at: new Date("2026-10-12T10:00:00Z"),
        siteId: "site",
        customer: { loyalty: false, staff: false },
        orderDiscountAmount: 0,
        voucher: null,
        vouchersSold,
      });
    const without = priced([]);
    const withOne = priced([{ value: "10.00" }]);
    expect(withOne.goodsTotal).toBe(without.goodsTotal);
    expect(withOne.sale.checkout.taxAmount).toBe(without.sale.checkout.taxAmount);
    expect(withOne.vouchersSoldTotal).toBe(10);
    expect(withOne.amountDue).toBe(Number((without.goodsTotal + 10).toFixed(2)));
  });

  it("make a sale that needs the till online", () => {
    expect(holdsVouchers({ payments: [], vouchersSold: [{ key: "a", value: "10.00" }], discountVoucher: null })).toBe(true);
    const byVoucher: PaymentRow[] = [{ tenderType: "VOUCHER", amount: "5.00", reference: "GV-0019" }];
    const inCash: PaymentRow[] = [{ tenderType: "CASH", amount: "5.00", reference: "" }];
    expect(holdsVouchers({ payments: byVoucher, vouchersSold: [], discountVoucher: null })).toBe(true);
    expect(holdsVouchers({ payments: inCash, vouchersSold: [], discountVoucher: null })).toBe(false);
  });
});
