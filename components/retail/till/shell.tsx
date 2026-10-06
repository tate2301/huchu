"use client";

/**
 * Shell B, chosen 5 October 2026: an icon rail beside the screen. The person at
 * the top opens what is weekly (activity, settings, help, PIN); seven doors for
 * the day's work; Lock at the foot. On a phone the rail is a tab bar.
 *
 * Above every screen: the back office's messages to this till until someone
 * dismisses them (10-setup 5.5), and the stop once the till has been offline
 * longer than the till rules allow. Over it, once each time the drawer goes
 * over the till rules' limit and never over the lock, the cash drop prompt.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import {
  CashRegister,
  ChartBar,
  DotsThree,
  GearSix,
  Key,
  ListChecks,
  Lock,
  LogOut,
  Megaphone,
  PauseCircle,
  Question,
  Receipt,
  ShoppingCart,
  Tag,
  Users,
  Vault,
  WarningCircle,
  X,
} from "@/lib/icons";
import { getPosPortalHref, type PosPortalNavKey } from "@/lib/retail/pos-host";
import { ROLE_WORD } from "./format";
import { useTillLock } from "./lock";
import { Avatar, TillDialog, TillPopover } from "./parts";
import { useSignOut } from "./sign-out";
import { useTill } from "./state";
import type { HeldCart } from "./types";

type Door = { key: PosPortalNavKey; label: string; icon: React.ComponentType<{ className?: string }>; phone?: boolean };

export const DOORS: Door[] = [
  { key: "checkout", label: "Till", icon: ShoppingCart, phone: true },
  { key: "held", label: "Held", icon: PauseCircle, phone: true },
  { key: "history", label: "History", icon: Receipt, phone: true },
  { key: "shift", label: "Shift", icon: CashRegister, phone: true },
  { key: "customers", label: "Customers", icon: Users },
  { key: "price-check", label: "Price check", icon: Tag },
  { key: "reports", label: "Reports", icon: ChartBar },
];

/** What a held sale comes to: its lines after their discounts, less the discount on the whole sale. */
export function heldTotal(cart: HeldCart) {
  const items = cart.cartSnapshot.items ?? [];
  const goods = items.reduce((sum, item) => sum + item.unitPrice * item.quantity - (item.lineDiscountAmount ?? 0), 0);
  return Math.max(goods - Number(cart.cartSnapshot.orderDiscountAmount || "0"), 0);
}

/** This shift's held sales: how many, and what they come to. */
export function useHeldSummary() {
  const { shiftHere } = useTill();
  const query = useQuery({
    queryKey: ["retail-held-carts", shiftHere?.id ?? null],
    enabled: Boolean(shiftHere?.id),
    queryFn: () =>
      fetchJson<{ data: HeldCart[] }>(`/api/v2/retail/pos/held-carts?shiftId=${encodeURIComponent(shiftHere?.id ?? "")}`),
  });
  const held = query.data?.data ?? [];
  return { count: held.length, total: held.reduce((sum, entry) => sum + heldTotal(entry), 0) };
}

/** A menu moves with the arrow keys, Home and End; Tab leaves it. */
function moveInMenu(event: React.KeyboardEvent<HTMLDivElement>) {
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const to =
    event.key === "ArrowDown" ? (at + 1) % items.length
    : event.key === "ArrowUp" ? (at - 1 + items.length) % items.length
    : event.key === "Home" ? 0
    : event.key === "End" ? items.length - 1
    : null;
  if (to === null) return;
  event.preventDefault();
  items[to]?.focus();
}

function isCurrent(pathname: string, href: string, key: PosPortalNavKey) {
  if (key === "checkout") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Who is signed in, their role and shift; the weekly things; lock; sign out. */
export function PersonMenu({ trigger, doors = [] }: { trigger: React.ReactNode; doors?: Door[] }) {
  const { data: session } = useSession();
  const { isPosHost, shiftHere } = useTill();
  const { lock, pinConfigured } = useTillLock();
  const { requestSignOut } = useSignOut();
  const [open, setOpen] = React.useState(false);
  const role = ROLE_WORD[String(session?.user?.role ?? "")] ?? "";
  const go = (key: PosPortalNavKey) => getPosPortalHref(key, isPosHost);
  const close = () => setOpen(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (open) window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  }, [open]);

  return (
    <TillPopover open={open} onOpenChange={setOpen} trigger={trigger} label="You" side="right" size="sm">
      <div ref={menuRef} className="menu is-flat" role="menu" aria-label="You" onKeyDown={moveInMenu}>
        <div className="menu-label">
          {session?.user?.name ?? "You"}
          {role ? ` · ${role}` : ""}
          {shiftHere ? (
            <>
              {" · "}
              <span className="num">{shiftHere.shiftNo}</span>
            </>
          ) : null}
        </div>
        {doors.map((entry) => (
          <Link key={entry.key} className="menu-item" role="menuitem" tabIndex={-1} href={go(entry.key)} onClick={close}>
            <entry.icon className="ic" />
            {entry.label}
          </Link>
        ))}
        {doors.length ? <div className="menu-sep" /> : null}
        <Link className="menu-item" role="menuitem" tabIndex={-1} href={go("activity")} onClick={close}>
          <ListChecks className="ic" />
          My activity
        </Link>
        <Link className="menu-item" role="menuitem" tabIndex={-1} href={go("settings")} onClick={close}>
          <GearSix className="ic" />
          Till settings
        </Link>
        <Link className="menu-item" role="menuitem" tabIndex={-1} href={go("help")} onClick={close}>
          <Question className="ic" />
          Help
        </Link>
        <Link className="menu-item" role="menuitem" tabIndex={-1} href={`${go("settings")}#pin`} onClick={close}>
          <Key className="ic" />
          Change my PIN
        </Link>
        <div className="menu-sep" />
        {pinConfigured ? (
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              close();
              lock();
            }}
          >
            <Lock className="ic" />
            Lock the till
            <span className="kbd">L</span>
          </button>
        ) : null}
        <button
          type="button"
          className="menu-item"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            close();
            requestSignOut();
          }}
        >
          <LogOut className="ic" />
          Sign out
        </button>
      </div>
    </TillPopover>
  );
}

/** The back office's messages to this till, and the offline stop: above every screen, until they no longer apply. */
function TillNotes() {
  const { messages, dismissMessage, offlineStop } = useTill();
  return (
    <>
      {offlineStop ? (
        <div className="banner banner-danger" role="alert">
          <WarningCircle className="ic" />
          <span>
            <b className="weight-500">Selling has stopped.</b> {offlineStop}
          </span>
        </div>
      ) : null}
      {messages.map((message) => (
        <div key={message.id} className="banner banner-warning" role="status">
          <Megaphone className="ic" />
          <span className="whitespace-pre-line">
            <b className="weight-500">{message.body}</b>
            {message.from ? ` From ${message.from}.` : ""}
          </span>
          <div className="end">
            <button type="button" className="btn btn-icon" aria-label="Dismiss the message" onClick={() => dismissMessage(message.id)}>
              <X className="ic" />
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * SET-06, W-64. "Ask for a cash drop above": asked once each time the drawer
 * goes over (a reload does not ask again), never over the lock. Either answer
 * counts as asked.
 */
function CashDropPrompt() {
  const router = useRouter();
  const { cashDropPrompt, answerCashDrop, isPosHost } = useTill();
  const { isLocked } = useTillLock();
  return (
    <TillDialog
      open={Boolean(cashDropPrompt) && !isLocked}
      onOpenChange={(open) => {
        if (!open) answerCashDrop();
      }}
      title="Move cash to the safe"
      description={cashDropPrompt ?? undefined}
      foot={
        <>
          <button type="button" className="btn" onClick={answerCashDrop}>
            Later
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              answerCashDrop();
              router.push(`${getPosPortalHref("shift", isPosHost)}?move=drop`);
            }}
          >
            <Vault className="ic" />
            Move cash now
          </button>
        </>
      }
    />
  );
}

export function TillShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { data: session } = useSession();
  const { isPosHost } = useTill();
  const { lock, pinConfigured } = useTillLock();
  const held = useHeldSummary().count;
  const name = session?.user?.name ?? "You";

  // L locks the till, as Help says, from anywhere but a field.
  React.useEffect(() => {
    if (!pinConfigured) return;
    const listen = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')) return;
      if (event.key.toLowerCase() === "l" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        lock();
      }
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, [lock, pinConfigured]);

  const door = (entry: Door, where: "rail" | "tab") => {
    const href = getPosPortalHref(entry.key, isPosHost);
    const Icon = entry.icon;
    const count = entry.key === "held" && held > 0 ? held : null;
    // Waiting to send is reached from the Till, so the Till door stays lit there.
    const current =
      isCurrent(pathname, href, entry.key) ||
      (entry.key === "checkout" && pathname === getPosPortalHref("offline", isPosHost));
    return (
      <Link
        key={entry.key}
        className="nav"
        href={href}
        aria-current={current ? "page" : undefined}
      >
        {count && where === "rail" ? <span className="count">{count}</span> : null}
        <Icon className="ic" />
        <span>{entry.label}</span>
      </Link>
    );
  };

  return (
    <div className="shell-b">
      <nav className="rail-b" aria-label="Till">
        <PersonMenu
          trigger={
            <button type="button" className="who" aria-label={`${name}, open the menu`}>
              <Avatar name={name} image={session?.user?.image} />
            </button>
          }
        />
        {DOORS.map((entry) => door(entry, "rail"))}
        <span className="gap" />
        {pinConfigured ? (
          <button type="button" className="nav" onClick={lock}>
            <Lock className="ic" />
            <span>Lock</span>
          </button>
        ) : null}
      </nav>
      <div className="shell-screen">
        <TillNotes />
        {children}
      </div>
      <CashDropPrompt />
      <nav className="tabbar" aria-label="Till">
        {DOORS.filter((entry) => entry.phone).map((entry) => door(entry, "tab"))}
        <PersonMenu
          doors={DOORS.filter((entry) => !entry.phone)}
          trigger={
            <button type="button" className="nav">
              <DotsThree className="ic" />
              <span>More</span>
            </button>
          }
        />
      </nav>
    </div>
  );
}
