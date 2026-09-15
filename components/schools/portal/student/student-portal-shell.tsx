"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BottomTabItem,
  BottomTabs,
  MobileShell,
  MobileShellBody,
  MobileShellHeader,
} from "@corelithzw/react";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Calendar,
  HelpCircle,
  Home,
  ListBullets,
  MedusaBookOpenIcon,
  Settings2,
  TrendingUp,
  UserRound,
} from "@/lib/icons";
import {
  STUDENT_BAR_ACTIONS_ID,
  useStudentPortal,
} from "./student-portal-context";
import "./student-portal.css";

/**
 * The screen's own title, so the app bar never has to be told twice.
 *
 * The wording is the prototype's, which says "My marks" and "My timetable"
 * rather than "Marks" and "Timetable": on a pupil's phone every screen is about
 * them, and saying so is what makes it feel like their app rather than the
 * school's. Home is the exception — its bar carries the greeting.
 */
const TITLES: Record<string, string> = {
  "/portal/student/timetable": "My timetable",
  "/portal/student/marks": "My marks",
  "/portal/student/homework": "Homework",
  "/portal/student/library": "Library",
  "/portal/student/goals": "My goals",
  "/portal/student/notifications": "Messages",
  "/portal/student/profile": "My profile",
  "/portal/student/settings": "Settings",
  "/portal/student/help": "Help",
};

const TABS = [
  { href: "/portal/student", label: "Home", icon: Home },
  { href: "/portal/student/timetable", label: "Timetable", icon: Calendar },
  { href: "/portal/student/marks", label: "Marks", icon: BarChart3 },
  { href: "/portal/student/profile", label: "Profile", icon: UserRound },
];

/**
 * Where back goes from a screen that is not a tab.
 *
 * The tab it was opened from, not `history.back()`: a pupil who lands on Goals
 * from a message has no history to go back to, and the arrow still has to mean
 * something. Every route that has no tab of its own is in here, which is what
 * makes a missing entry a missing back button rather than a silent one.
 */
const BACK: Record<string, string> = {
  "/portal/student/homework": "/portal/student",
  "/portal/student/library": "/portal/student",
  "/portal/student/notifications": "/portal/student",
  "/portal/student/goals": "/portal/student/marks",
  "/portal/student/help": "/portal/student/profile",
  "/portal/student/settings": "/portal/student/profile",
};

/** The side rail above 900px, where the bottom tabs are hidden. */
const RAIL_MORE = [
  { href: "/portal/student/homework", label: "Homework", icon: ListBullets },
  {
    href: "/portal/student/library",
    label: "Library",
    icon: MedusaBookOpenIcon,
  },
  { href: "/portal/student/goals", label: "My goals", icon: TrendingUp },
  { href: "/portal/student/notifications", label: "Messages", icon: Bell },
  { href: "/portal/student/help", label: "Help", icon: HelpCircle },
  { href: "/portal/student/settings", label: "Settings", icon: Settings2 },
];

/**
 * The student portal's own chrome.
 *
 * A phone app, not a dashboard: an app bar, one screen at a time, and four
 * bottom tabs. The prototype is mobile-first because that is the only device
 * most pupils have, and the design system has a shell for exactly this
 * (`MobileShell` + `BottomTabs`) — the four tabs are the four things a pupil
 * opens the app to do, and everything else is reached from Home.
 *
 * Above 900px the design system hides the bottom tabs, so the same routes
 * stand up as a rail rather than leaving a school's library computer with no
 * navigation at all.
 */
export function StudentPortalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const day = useStudentPortal();

  const name = day.student
    ? `${day.student.firstName} ${day.student.lastName}`
    : "Student";
  // Home's bar carries the greeting, as the prototype's does; every other
  // screen is named after itself.
  const title = day.student
    ? (TITLES[pathname] ?? `Hi, ${day.student.firstName}`)
    : (TITLES[pathname] ?? "Home");
  const back = BACK[pathname] ?? null;
  const unread = day.unread;
  const onMessages = pathname.startsWith("/portal/student/notifications");

  const isActive = (href: string) =>
    href === "/portal/student" ? pathname === href : pathname.startsWith(href);

  return (
    <MobileShell
      lang="en-ZW"
      className={`student-portal${back ? " has-back" : ""}`}
    >
      <nav className="ps-side" aria-label="Sections">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`ps-side-item${isActive(tab.href) ? " on" : ""}`}
            aria-current={isActive(tab.href) ? "page" : undefined}
          >
            <tab.icon className="size-[18px]" aria-hidden />
            {tab.label}
          </Link>
        ))}
        <span className="ps-side-rule" />
        {RAIL_MORE.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`ps-side-item${isActive(item.href) ? " on" : ""}`}
            aria-current={isActive(item.href) ? "page" : undefined}
          >
            <item.icon className="size-[18px]" aria-hidden />
            {item.label}
            {item.href === "/portal/student/notifications" && unread > 0 ? (
              <span className="ps-side-count">{unread}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <MobileShellHeader
        title={title}
        leftAction={
          back ? (
            <Link href={back} aria-label="Back" className="sp-nav-btn">
              <ArrowLeft className="size-[20px]" aria-hidden />
            </Link>
          ) : undefined
        }
        rightAction={
          <span className="sp-appbar-right">
            {/* Whatever screen is open puts its own button here. */}
            <span id={STUDENT_BAR_ACTIONS_ID} className="contents" />
            {onMessages ? null : (
              <Link
                href="/portal/student/notifications"
                aria-label={
                  unread > 0
                    ? `Messages, ${unread} unread`
                    : "Messages, none unread"
                }
                className="sp-nav-btn sp-bell"
              >
                <Bell className="size-[18px]" aria-hidden />
                {unread > 0 ? (
                  <span className="sp-bell-count" aria-hidden>
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>
            )}
            <Link
              href="/portal/student/profile"
              aria-label="Your profile"
              className="sp-nav-btn"
            >
              <PersonAvatar
                name={name}
                src={day.student?.user?.image ?? null}
                size="sm"
              />
            </Link>
          </span>
        }
      />
      <MobileShellBody style={{ padding: 0 }}>
        <div className="sp-page">{children}</div>
      </MobileShellBody>
      <BottomTabs aria-label="Primary">
        {TABS.map((tab) => (
          <BottomTabItem
            key={tab.href}
            active={isActive(tab.href)}
            icon={
              <span className="b-bt-ic">
                <tab.icon className="size-[22px]" aria-hidden />
              </span>
            }
            label={tab.label}
            onClick={() => router.push(tab.href)}
          />
        ))}
      </BottomTabs>
    </MobileShell>
  );
}
