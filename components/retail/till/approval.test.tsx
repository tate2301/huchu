// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { TILL_PIN_LOCKED } from "@/lib/retail/till-pin";

import { useApproval, WRONG_PIN, type TillApprover } from "./approval";
import type { Approver } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The till's approval dialog (FLR-09, C-31): a 409 `needsApprover` opens it
 * with the act's reason, a chip and four digits send the same request again
 * with `approver`, a wrong PIN clears the dots and says so, a locked PIN says
 * ADM-03's sentence, and Cancel sends nothing more.
 */

const APPROVERS: TillApprover[] = [
  { userId: "11111111-1111-4111-8111-111111111111", name: "Rufaro Ndlovu", short: "Rufaro N." },
  { userId: "22222222-2222-4222-8222-222222222222", name: "Tafara Nyathi", short: "Tafara N." },
];

const needsApprover = (extra: Record<string, unknown> = {}) =>
  new ApiError("Refunds over US$20.00 need a manager PIN.", 409, { needsApprover: true, reason: "Refunds over US$20.00 need a manager PIN.", ...extra });

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

/** Mounts a screen whose Go button runs one act through the approval, and keeps what it resolved with. */
function mount(send: (approver: Approver | null) => Promise<string>) {
  const outcome: { value?: string | null; error?: unknown } = {};
  function Screen() {
    const approval = useApproval({ approvers: APPROVERS, reason: "Refund over US$20.00" });
    const go = () =>
      approval.run(send).then(
        (value) => {
          outcome.value = value;
        },
        (error: unknown) => {
          outcome.error = error;
        },
      );
    return (
      <>
        <button type="button" onClick={() => void go()}>
          Go
        </button>
        {approval.dialog}
      </>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Screen />));
  return { outcome, start: () => press("Go") };
}

const dialog = () => document.querySelector('[role="dialog"]');
const button = (name: string) =>
  [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === name || element.getAttribute("aria-label") === name);
async function press(name: string) {
  const target = button(name);
  if (!target) throw new Error(`no button ${name}`);
  await act(async () => target.click());
}
const typePin = async (digits: string) => {
  for (const digit of digits) await press(digit);
};
const dotsOn = () => document.querySelectorAll(".pin i.on").length;

describe("the till's approval dialog", () => {
  it("opens on a 409 needsApprover with the act's reason and re-sends the same act with the chip and PIN", async () => {
    const send = vi.fn(async (approver: Approver | null) => {
      if (!approver) throw needsApprover();
      return "RFD-0045";
    });
    const { outcome, start } = mount(send);
    await start();
    expect(dialog()?.textContent).toContain("A manager has to approve this");
    expect(dialog()?.textContent).toContain("Refund over US$20.00");
    expect(button("Rufaro N.")).toBeTruthy();

    await press("Tafara N.");
    await typePin("2468");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toEqual({ userId: APPROVERS[1]!.userId, pin: "2468" });
    expect(outcome.value).toBe("RFD-0045");
    expect(dialog()).toBeNull();
  });

  it("clears the PIN and says so when it is wrong, and keeps the dialog open for another try", async () => {
    let tries = 0;
    const send = vi.fn(async (approver: Approver | null) => {
      if (!approver) throw needsApprover();
      tries += 1;
      if (tries === 1) throw needsApprover({ fieldErrors: { pin: WRONG_PIN } });
      return "VOID-0012";
    });
    const { outcome, start } = mount(send);
    await start();
    await press("Tafara N.");
    await typePin("1111");
    expect(dialog()?.textContent).toContain(WRONG_PIN);
    expect(dotsOn()).toBe(0);
    expect(document.querySelector(".pin.is-wrong")).toBeTruthy();
    expect(outcome.value).toBeUndefined();

    await typePin("2468");
    expect(outcome.value).toBe("VOID-0012");
  });

  it("says ADM-03's sentence when the approver's PIN is locked, and unpicks them", async () => {
    const send = vi.fn(async (approver: Approver | null) => {
      if (!approver) throw needsApprover();
      throw new ApiError(TILL_PIN_LOCKED, 423);
    });
    const { start } = mount(send);
    await start();
    await press("Tafara N.");
    await typePin("2468");
    expect(dialog()?.textContent).toContain(TILL_PIN_LOCKED);
    expect(button("Tafara N.")?.getAttribute("aria-checked")).toBe("false");
    expect(dotsOn()).toBe(0);
  });

  it("resolves with nothing on Cancel and sends nothing more", async () => {
    const send = vi.fn(async (approver: Approver | null) => {
      if (!approver) throw needsApprover();
      return "never";
    });
    const { outcome, start } = mount(send);
    await start();
    await press("Cancel");
    expect(send).toHaveBeenCalledTimes(1);
    expect(outcome.value).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("goes straight through when no manager is needed, and hands back any other refusal", async () => {
    const through = mount(async () => "SALE-31870");
    await through.start();
    expect(through.outcome.value).toBe("SALE-31870");
    expect(dialog()).toBeNull();
    act(() => root?.unmount());

    const refused = mount(async () => {
      throw new ApiError("Pick a reason from the list.", 400);
    });
    await refused.start();
    expect((refused.outcome.error as Error).message).toBe("Pick a reason from the list.");
  });
});
