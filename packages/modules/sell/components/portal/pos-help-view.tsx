"use client";

/**
 * Help and keyboard shortcuts.
 *
 * S-7.6, contract surface 17. Written for the shop's own staff on their first
 * trading day, which is the actual audience — not for a developer.
 *
 * ── Every shortcut here is one the code really binds ───────────────────────
 *
 * Read off the `keydown` handler in `pos-checkout-view.tsx` and the search
 * input's own `onKeyDown`, not off the prototype. A help screen that lists a
 * key which does nothing is worse than no help screen: the cashier presses it,
 * nothing happens, and now they distrust the rest of the page too.
 *
 * That cuts both ways — the "no shortcut for Charge" note below is there
 * because its absence is deliberate, and somebody looking for it deserves to
 * be told it is missing on purpose rather than left hunting.
 */

import type { ReactNode } from "react";

import {
  Clock,
  CloudOff,
  Coins,
  Keyboard,
  Lock,
  Package,
  Payments,
  Receipt,
  Search,
} from "@corelithzw/ui/lib/icons";
import type { LucideIcon } from "@corelithzw/ui/lib/icons";

import { PosPanel, PosPanelHeader } from "./pos-primitives";

/** A key as it looks on the keyboard. */
function Key({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex min-w-[1.9rem] items-center justify-center rounded-md border px-2 py-1 font-mono text-[11px] font-bold"
      style={{
        background: "var(--pos-key-bg)",
        borderColor: "var(--pos-key-border)",
        boxShadow: "0 2px 0 var(--pos-key-shadow)",
        color: "var(--pos-key-text)",
      }}
    >
      {children}
    </kbd>
  );
}

function Shortcut({ keys, does }: { keys: ReactNode; does: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--edge-subtle)] py-2.5 last:border-b-0">
      <span className="flex shrink-0 items-center gap-1">{keys}</span>
      <span className="min-w-0 text-right text-sm leading-5 text-[var(--text-strong)]">{does}</span>
    </div>
  );
}

function Job({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--edge-subtle)] py-3 last:border-b-0">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-bold text-[var(--text-strong)]">{title}</div>
        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{children}</p>
      </div>
    </div>
  );
}

export function PosHelpView() {
  return (
    <div className="space-y-4">
      <PosPanel>
        <PosPanelHeader
          eyebrow="Help"
          title="Working this till"
          description="The keys, the everyday jobs, and what to do when something does not go to plan."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── Keys ───────────────────────────────────────────────── */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <Keyboard className="h-3.5 w-3.5" />
              On a keyboard
            </div>

            <Shortcut keys={<Key>/</Key>} does="Jump to the search box" />
            <Shortcut
              keys={<Key>↵</Key>}
              does="With the search box focused, add the first result to the sale"
            />
            <Shortcut keys={<Key>Esc</Key>} does="Clear the search, or deselect the picked line" />
            <Shortcut
              keys={
                <>
                  <Key>0</Key>
                  <span className="px-0.5 text-[var(--text-muted)]">–</span>
                  <Key>9</Key>
                  <Key>.</Key>
                </>
              }
              does="Type straight into the cash amount, without touching the screen"
            />
            <Shortcut keys={<Key>⌫</Key>} does="Rub out the last digit of the amount" />

            <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
              The number keys only work when you are not already typing in a box — so a customer
              name with a 7 in it still types normally.
            </p>

            {/*
              Stated rather than silently absent. Somebody will look for it.
            */}
            <div className="mt-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
              <p className="text-xs leading-5 text-[var(--text-muted)]">
                There is deliberately <span className="font-semibold">no key for Charge</span>.
                Taking a customer&rsquo;s money is a decision, not a keystroke, so it needs the
                green button.
              </p>
            </div>
          </div>

          {/* ── Barcode scanner ────────────────────────────────────── */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <Search className="h-3.5 w-3.5" />
              With a scanner
            </div>
            <p className="text-sm leading-6 text-[var(--text-muted)]">
              A barcode scanner types the code and presses Enter for you, so scanning an item onto
              the sale needs nothing else — as long as the search box has the cursor in it. It
              starts there when the page opens. If a scan does nothing, press{" "}
              <Key>/</Key> to put the cursor back and scan again.
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              To answer &ldquo;how much is this?&rdquo; without starting a sale, use{" "}
              <span className="font-semibold text-[var(--text-strong)]">Price</span> in the side
              bar and scan there instead.
            </p>
          </div>
        </div>
      </PosPanel>

      {/* ── The everyday jobs ────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PosPanel>
          <PosPanelHeader eyebrow="Every day" title="The usual jobs" />

          <Job icon={Clock} title="Starting the day">
            Open <span className="font-medium">Shift</span>, count the float in the drawer and key
            the amount. Nothing can be sold until a shift is open — that is what ties every sale to
            a person and a drawer.
          </Job>
          <Job icon={Payments} title="Ringing a sale">
            Scan or search each item, pick the tender, key the amount the customer hands over — the
            keypad is always at the bottom right, it never scrolls away — and press Charge. Change
            due appears above the keypad as soon as the amount covers the total.
          </Job>
          <Job icon={Package} title="Putting a sale aside">
            <span className="font-medium">Hold</span> parks the basket under a name so you can
            serve the next customer; <span className="font-medium">Held</span> brings it back. Use
            it when someone goes to fetch one more thing.
          </Job>
          {/*
            Corrected in S-7.7. This used to tell a cashier the buttons were
            there and might ask for a manager's password. `RUN_A_TILL` grants
            neither `refund` nor `void`, so the buttons never render at the
            till, and there is no approval dialog to produce them. Sending
            somebody hunting for a control that cannot appear, with a customer
            waiting, is the worst thing a help screen can do.
          */}
          <Job icon={Receipt} title="Refunding or cancelling">
            You can look a receipt up under <span className="font-medium">History</span>, but
            reversing one is not a till job — the manager does refunds and voids in the back
            office, and the stock and the books move with them. Find the receipt, read the number
            out, and let the manager take it from there.
          </Job>
          <Job icon={Coins} title="Money in or out of the drawer">
            <span className="font-medium">Shift</span> → cash drop when the drawer is getting full,
            or a top-up when you are short of change. Record it as it happens; a drop done from
            memory at closing time is how a drawer comes up short.
          </Job>
          <Job icon={Clock} title="Closing up">
            <span className="font-medium">Shift</span> → cash up. Count the drawer honestly and key
            what is actually there, not what the screen expects. Then take the Z-report from{" "}
            <span className="font-medium">Reports</span>. Once a Z-report is run for a shift it
            cannot be run again with different numbers.
          </Job>
        </PosPanel>

        <PosPanel>
          <PosPanelHeader eyebrow="When it goes wrong" title="Fixing it yourself" />

          <Job icon={CloudOff} title="The internet is down">
            Keep selling. The till stores each sale on the tablet and the top bar shows how many are
            waiting. When the line comes back they go up on their own — check{" "}
            <span className="font-medium">Offline</span> to watch them clear. Do not close the
            browser while any are still queued.
          </Job>
          <Job icon={Lock} title="The screen has locked">
            The till locks itself when it is left alone so the next person cannot see the last
            customer&rsquo;s basket. Key your PIN to get back in — the basket is exactly as you left
            it. Too many wrong tries locks it for a few minutes; that wait cannot be skipped.
          </Job>
          <Job icon={Coins} title="The drawer does not balance">
            Cash up with the real count anyway. The difference is recorded as a variance against
            your shift, which is what lets the shop find where it went. Guessing a number that
            balances destroys the only evidence there is.
          </Job>
          <Job icon={Receipt} title="The receipt did not print">
            Reprint it from <span className="font-medium">History</span>. Printing goes through this
            tablet&rsquo;s own print dialog, so if nothing appears at all it is the tablet&rsquo;s
            printer setting rather than the till.
          </Job>
          <Job icon={Search} title="An item will not scan">
            Search by name or type the code by hand. If it is genuinely not there, the shop has not
            received it into stock yet — the till can only sell what this branch holds. Tell the
            manager rather than ringing it up as something else.
          </Job>
        </PosPanel>
      </div>
    </div>
  );
}
