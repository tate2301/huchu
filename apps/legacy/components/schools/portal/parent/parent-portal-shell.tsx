"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Bell, Check, Home, Receipt, UserRound, X } from "@/lib/icons";

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

const TABS = [
  { href: "/portal/parent", label: "Home", icon: Home },
  { href: "/portal/parent/fees", label: "Fees", icon: Receipt },
  { href: "/portal/parent/notices", label: "News", icon: Bell, badge: true },
  { href: "/portal/parent/profile", label: "You", icon: UserRound },
];

function initialsOf(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function ParentPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { guardian, child, children: household, selectChild, unreadNotices } = useParentPortal();
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

  const title = TITLES[pathname] ?? "Home";
  const isActive = (href: string) =>
    href === "/portal/parent" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="pa-shell">
      <header className="pa-bar">
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
          <Link
            href="/portal/parent/notices"
            className="bell"
            aria-label={unreadNotices > 0 ? `School news, ${unreadNotices} unread` : "School news"}
          >
            <Bell className="size-[18px]" aria-hidden />
            {unreadNotices > 0 ? <span className="pip" aria-hidden /> : null}
          </Link>
        </div>
      </header>

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
