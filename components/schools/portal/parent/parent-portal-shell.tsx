"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useOfflineConnectivity } from "@/hooks/use-offline-connectivity";
import { fetchJson } from "@/lib/api-client";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarCheck,
  ChatCircle,
  Check,
  HelpCircle,
  Home,
  Receipt,
  UserRound,
  WifiOff,
  X,
} from "@/lib/icons";

import { useParentPortal } from "./parent-portal-context";
import "./parent-portal.css";

/**
 * The parent portal's own chrome.
 *
 * A phone app, not the staff dashboard with a different menu — the same decision
 * S-6.36 and S-6.60 made for the pupil and the teacher, and for the same reason: a
 * parent opens this standing at a school gate on a phone, and a sidebar full of
 * modules is not what they need.
 *
 * Four tabs, which are the four reasons a parent opens it: how their child is
 * doing, what is owed, what the school has said, and their own account. Their
 * labels are the parent's words rather than the system's — News, not Notices;
 * You, not Profile — while the routes keep the names the code uses.
 *
 * The child switcher is one small avatar chip in the app bar rather than a row of
 * chips above the content. It applies to every screen (see
 * `parent-portal-context.tsx`), and a switcher that took a line of the screen on
 * all seven of them would cost more than it tells: which child is in view is one
 * glance at the initials, and changing them is one tap.
 */

const TITLES: Record<string, string> = {
  "/portal/parent": "Home",
  "/portal/parent/fees": "School fees",
  "/portal/parent/attendance": "Attendance",
  "/portal/parent/marks": "Marks",
  "/portal/parent/notices": "School news",
  "/portal/parent/messages": "Messages",
  "/portal/parent/profile": "Your details",
  "/portal/parent/help": "Help",
};

/**
 * Where the back arrow goes, per the prototype's own table.
 *
 * The four tabs are not in it. A tab is reached by tapping it, and back from a
 * place you can always get to is an arrow that either does nothing or leaves the
 * portal — which is how the thread view on Messages used to exit the app. Every
 * other screen is opened from exactly one place and returns there.
 */
const BACK: Record<string, string> = {
  "/portal/parent/attendance": "/portal/parent",
  "/portal/parent/marks": "/portal/parent",
  "/portal/parent/messages": "/portal/parent",
  "/portal/parent/help": "/portal/parent/profile",
};

/**
 * A screen's primary action, which belongs in the bar rather than at the foot
 * of a scroll. Messages is the only one so far: the inbox's own "Write to the
 * school" button sat below whatever conversations there were, so a family with
 * a long history had to scroll past it to reach it.
 */
const BAR_ACTION: Record<string, { href: string; label: string }> = {
  "/portal/parent/messages": { href: "/portal/parent/messages?compose=1", label: "Write" },
};

function backTargetOf(pathname: string, search: { get: (key: string) => string | null }) {
  if (pathname.startsWith("/portal/parent/notice/")) return "/portal/parent/notices";
  // A thread and the composer are the inbox with something open on top of it,
  // so back closes what is open rather than leaving Messages altogether.
  if (
    pathname === "/portal/parent/messages" &&
    (search.get("thread") || search.get("compose"))
  ) {
    return "/portal/parent/messages";
  }
  return BACK[pathname] ?? null;
}

const TABS = [
  { href: "/portal/parent", label: "Home", icon: Home },
  { href: "/portal/parent/fees", label: "Fees", icon: Receipt },
  { href: "/portal/parent/notices", label: "News", icon: Bell, badge: true },
  { href: "/portal/parent/profile", label: "You", icon: UserRound },
];

/**
 * The rail that replaces the tabs above 900px, where `components.css` hides
 * them. It is the four tabs plus the screens a phone reaches through Home and
 * You — on a laptop there is room to show them, and a parent who has to guess
 * which tile hides Attendance has no navigation at all.
 */
type RailItem = {
  href: string;
  label: string;
  icon: typeof Home;
  /** Which unread counter, if any, rides on this row. */
  count: "notices" | "messages" | null;
};

const RAIL: RailItem[] = [
  { href: "/portal/parent", label: "Home", icon: Home, count: null },
  { href: "/portal/parent/fees", label: "School fees", icon: Receipt, count: null },
  { href: "/portal/parent/notices", label: "School news", icon: Bell, count: "notices" },
  { href: "/portal/parent/attendance", label: "Attendance", icon: CalendarCheck, count: null },
  { href: "/portal/parent/marks", label: "Marks", icon: BarChart3, count: null },
  { href: "/portal/parent/messages", label: "Messages", icon: ChatCircle, count: "messages" },
  { href: "/portal/parent/profile", label: "Your details", icon: UserRound, count: null },
  { href: "/portal/parent/help", label: "Help", icon: HelpCircle, count: null },
];

function initialsOf(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function ParentPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const { guardian, child, children: household, selectChild, unreadNotices } = useParentPortal();
  const { isOffline } = useOfflineConnectivity();
  /**
   * The switcher sheet, remembered with the route it was opened on.
   *
   * A sheet left open across a route change is a sheet a parent has to dismiss
   * before they can read the screen they asked for. Deriving "still open" from
   * the current path closes it on any navigation — including the back button —
   * without an effect that sets state and re-renders.
   */
  const [switcher, setSwitcher] = useState({ open: false, at: pathname });
  const switcherOpen = switcher.open && switcher.at === pathname;
  const setSwitcherOpen = (open: boolean) => setSwitcher({ open, at: pathname });

  /**
   * The inbox, for the bell. Same query key as the Messages screen, so the pip
   * and the list it points at are the same fetch rather than two, and reading a
   * thread clears the pip without a second round trip.
   */
  const inbox = useQuery({
    queryKey: ["portal", "parent", "messages"],
    queryFn: () =>
      fetchJson<{ threads: Array<{ id: string; unread: boolean }> }>(
        "/api/v2/schools/portal/parent/messages",
      ),
    enabled: Boolean(guardian),
  });
  const unreadMessages = (inbox.data?.threads ?? []).filter((row) => row.unread).length;
  const waiting = unreadNotices + unreadMessages;

  const title = pathname.startsWith("/portal/parent/notice/")
    ? "School news"
    : (TITLES[pathname] ?? "Home");
  const backTarget = backTargetOf(pathname, search);
  // Nothing to write about while a thread or the composer is already open.
  const barAction = backTarget === pathname ? undefined : BAR_ACTION[pathname];
  const isActive = (href: string) =>
    href === "/portal/parent" ? pathname === href : pathname.startsWith(href);

  // en-ZW rather than the browser default: the dates, the money and the
  // school's own English are Zimbabwean, and a screen reader should say them
  // that way.
  return (
    <div className="pa-shell" lang="en-ZW">
      <aside className="pa-side">
        <div className="ps-section-h">{guardian ? `${guardian.firstName}'s portal` : "Portal"}</div>
        <nav aria-label="Primary">
          {RAIL.map((item) => {
            const count =
              item.count === "notices"
                ? unreadNotices
                : item.count === "messages"
                  ? unreadMessages
                  : 0;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "active" : undefined}
                {...(active ? { "aria-current": "page" as const } : {})}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
                {count > 0 ? <span className="ct">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="pa-main">
        <header className="pa-bar">
          {backTarget ? (
            <button
              type="button"
              className="back"
              aria-label="Back"
              onClick={() => router.push(backTarget)}
            >
              <ArrowLeft className="size-[18px]" aria-hidden />
            </button>
          ) : null}
          {/* The screen's name, and only that. The prototype's bar greets the
              parent because it sits under the demo site's own chrome; here the
              bar is the app's one bar, and Home's greeting block below already
              says hello — saying it twice is a wasted line on a phone. */}
          <h1>{title}</h1>
          <div className="actions">
            {child ? (
              <button
                type="button"
                className="child-btn"
                onClick={() => setSwitcherOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={switcherOpen}
                aria-label={
                  household.length > 1
                    ? `Viewing ${child.firstName}. Switch child.`
                    : `Viewing ${child.firstName}`
                }
              >
                <span className="av" aria-hidden>
                  {initialsOf(child.firstName, child.lastName)}
                </span>
                {child.firstName}
              </button>
            ) : null}
            {barAction ? (
              <Link href={barAction.href} className="bar-primary">
                {barAction.label}
              </Link>
            ) : null}
            {/* One pip for everything waiting. A parent does not hold "news" and
                "messages" apart in their head — they hold "is there something
                for me", and a bell that stays clean while a teacher's reply sits
                unread is a bell they stop trusting. */}
            <Link
              href="/portal/parent/notices"
              className="bell"
              aria-label={waiting > 0 ? `School news, ${waiting} waiting` : "School news"}
            >
              <Bell className="size-[18px]" aria-hidden />
              {waiting > 0 ? <span className="pip" aria-hidden /> : null}
            </Link>
          </div>
        </header>

        {isOffline ? (
          <div className="pa-offline" role="status">
            <WifiOff className="size-4" aria-hidden />
            Working offline — what you see was last loaded while you had signal.
          </div>
        ) : null}

        <main className="pa-body">{children}</main>

        <nav className="b-bottom-tabs" aria-label="Primary">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <button
                key={tab.href}
                type="button"
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => router.push(tab.href)}
              >
                <span className="b-bt-ic">
                  <tab.icon className="size-[22px]" aria-hidden />
                </span>
                {tab.label}
                {tab.badge && unreadNotices > 0 ? (
                  <span className="b-bt-badge">{unreadNotices}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {/* The switcher itself. One sheet, listing every child, with the one in
          view marked — the same act as tapping a row on the You screen. */}
      {switcherOpen ? (
        <div
          className="x-bs-scrim open pp-scrim"
          role="presentation"
          onClick={() => setSwitcherOpen(false)}
        >
          <div
            className="x-bottom-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Switch child"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="x-bs-grab" />
            <div className="x-bs-head">
              <h3>Switch child</h3>
              <button
                type="button"
                className="x-bs-close"
                aria-label="Close"
                onClick={() => setSwitcherOpen(false)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="x-bs-body">
              <p className="sheet-lede">
                Pick which child you want to look at. Fees, school day, marks and news will all
                change.
              </p>
              {household.map((candidate) => {
                const on = candidate.id === child?.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className={on ? "picker-row on" : "picker-row"}
                    aria-pressed={on}
                    onClick={() => {
                      selectChild(candidate.id);
                      setSwitcherOpen(false);
                    }}
                  >
                    <span className="av" aria-hidden>
                      {initialsOf(candidate.firstName, candidate.lastName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="nm block">
                        {candidate.firstName} {candidate.lastName}
                      </span>
                      <span className="sb block">
                        {[candidate.currentClass?.name, candidate.currentStream?.name]
                          .filter(Boolean)
                          .join(" · ") || "No class yet"}
                      </span>
                    </span>
                    <Check className="chk size-[18px]" aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
