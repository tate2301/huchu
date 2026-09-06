"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { accentVar, AppShell, Avatar, NavRail, NavRailGroup } from "@corelithzw/react";
import { NavRailItem } from "@corelithzw/ui/components/nav-rail";
import { useOfflineConnectivity } from "@corelithzw/module-offline/hooks/use-offline-connectivity";
import {
  BarChart3,
  Bell,
  Calendar,
  ChatCircle,
  CheckCircle,
  ClipboardList,
  Clock,
  EditSquare,
  Grid3x3,
  HelpCircle,
  Home,
  Layers,
  ListBullets,
  LogOut,
  Settings2,
  UserRound,
} from "@corelithzw/ui/lib/icons";
import { useTeacherPortal } from "./teacher-portal-context";
import { hueFor, subjectHues } from "./teacher-subject-hues";
import "./teacher-portal.css";

/**
 * Route → page title. The old two-line bar put a category label above the
 * title ("Parents", "Assessment"), which repeated what the rail already says.
 * The bar now spends its one caption line on real context: the active term
 * and the class in view.
 */
const TITLES: Record<string, string> = {
  "/portal/teacher": "Your day",
  "/portal/teacher/attendance": "Mark the register",
  "/portal/teacher/marks": "Enter marks",
  "/portal/teacher/marks-book": "Marks book",
  "/portal/teacher/messages": "Messages",
  "/portal/teacher/timetable": "Your week",
  "/portal/teacher/lessons": "Lesson plans",
  "/portal/teacher/syllabus": "Scheme of work",
  "/portal/teacher/homework": "Homework and tasks",
  "/portal/teacher/files": "Shared files",
  "/portal/teacher/reports": "Reports",
  "/portal/teacher/meetings": "Parent meetings",
  "/portal/teacher/profile": "Your profile",
  "/portal/teacher/settings": "Settings",
  "/portal/teacher/help": "Help",
};

const DAILY = [
  { href: "/portal/teacher", label: "Today", icon: Home },
  { href: "/portal/teacher/attendance", label: "Attendance", icon: CheckCircle },
  { href: "/portal/teacher/marks", label: "Enter marks", icon: EditSquare },
  { href: "/portal/teacher/marks-book", label: "Marks book", icon: Grid3x3 },
  { href: "/portal/teacher/messages", label: "Messages", icon: ChatCircle },
  { href: "/portal/teacher/timetable", label: "Timetable", icon: Calendar },
  { href: "/portal/teacher/lessons", label: "Lesson plans", icon: Layers },
  { href: "/portal/teacher/syllabus", label: "Scheme of work", icon: ListBullets },
];

const MORE = [
  { href: "/portal/teacher/homework", label: "Homework", icon: ListBullets },
  { href: "/portal/teacher/files", label: "Shared files", icon: ClipboardList },
  { href: "/portal/teacher/reports", label: "Reports", icon: BarChart3 },
  { href: "/portal/teacher/meetings", label: "Parent meetings", icon: Clock },
];

const ACCOUNT = [
  { href: "/portal/teacher/profile", label: "Profile", icon: UserRound },
  { href: "/portal/teacher/settings", label: "Settings", icon: Settings2 },
  { href: "/portal/teacher/help", label: "Help", icon: HelpCircle },
];

/**
 * The strip under the bar: the five screens a teacher moves between
 * inside one lesson, promoted out of the rail so they are one tap away
 * from wherever they are. Same routes as the rail — a second way in, not
 * a second place to be.
 */
const TABS = [
  { href: "/portal/teacher", label: "Today", icon: Home },
  { href: "/portal/teacher/marks", label: "Marks", icon: EditSquare },
  { href: "/portal/teacher/messages", label: "Messages", icon: ChatCircle },
  { href: "/portal/teacher/timetable", label: "Timetable", icon: Calendar },
  { href: "/portal/teacher/lessons", label: "Lessons", icon: Layers },
];

/**
 * "Thursday · 6 August 2026", built from two single-field formatters.
 *
 * One combined formatter would be shorter and wrong: Node's ICU writes
 * "Thursday, 6 August" where Chrome's writes "Thursday 6 August", and a
 * client component that renders the difference fails hydration. Formatting
 * each field on its own leaves no separator for the two to disagree about.
 */
const CAPTION_WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const CAPTION_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
function captionDate(date: Date) {
  return `${CAPTION_WEEKDAY.format(date)} · ${CAPTION_DAY.format(date)}`;
}

/**
 * The teacher portal's own chrome.
 *
 * A portal is not the dashboard with a different nav: a teacher signs in on a
 * shared tablet between lessons, and the surface they get is anchored to a
 * class and a term rather than to a module tree. That is SHL·07, and it is
 * why this shell owns its rail instead of borrowing the admin one.
 *
 * The class rail sits above the navigation because it changes what every
 * screen below it means. Picking Form 2A once is what lets Attendance, Enter
 * marks and Lesson plans all agree about whose lesson this is.
 */
export function TeacherPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { day, classSubjectId, setClassSubjectId } = useTeacherPortal();
  const { isOffline } = useOfflineConnectivity();

  const teacherName = day.teacher?.user.name ?? "Teacher";
  const subjects = [...new Set((day.classes).map((row) => row.subjectName))];
  const papers = day.workload?.papersToMark ?? 0;
  const selected = day.classes.find((row) => row.classSubjectId === classSubjectId);
  const onToday = pathname === "/portal/teacher";
  /**
   * The bar's two lines: the caption is context — the school day this is, or
   * the class the screen is anchored to — and the title is where the teacher
   * stands. It does not greet them. The prototype's bar does, but that bar
   * sits inside a device frame under the demo site's own chrome; this is the
   * app's single bar, and Today's own heading greets them one line below.
   */
  const now = new Date();
  const title = TITLES[pathname] ?? TITLES["/portal/teacher"];
  const classContext = selected
    ? `${selected.className}${selected.streamName ? ` ${selected.streamName}` : ""} · ${selected.subjectName}`
    : null;
  const caption = (
    onToday
      ? [captionDate(day.onDate ? new Date(`${day.onDate}T00:00:00`) : now), day.term?.name]
      : [classContext, day.term?.name]
  )
    .filter(Boolean)
    .join(" · ");

  /** Subject → hue, the same mapping the timetable grid draws from. */
  const hues = subjectHues(day.classes);

  const isActive = (href: string) =>
    href === "/portal/teacher" ? pathname === href : pathname.startsWith(href);

  const sidebar = (
    <div className="flex min-h-0 flex-col gap-1">
      {/* No brand label. The profile card is the rail's identity: whose
          classes these are is the only heading the portal needs. */}
      <Link href="/portal/teacher/profile" className="te-who">
        <Avatar
          name={teacherName}
          {...(day.teacher?.user.image ? { src: day.teacher.user.image } : {})}
          size="md"
        />
        <span className="min-w-0">
          <span className="nm truncate">{teacherName}</span>
          <span className="sb truncate">
            {subjects.length > 0 ? subjects.join(" · ") : "No classes this term"}
          </span>
        </span>
      </Link>

      <NavRail label="Teacher portal navigation" className="min-h-0 flex-1 overflow-y-auto">
        <NavRailGroup label="My classes">
          {(day.classes).map((row) => (
            <NavRailItem
              key={row.classSubjectId}
              className="te-class-row"
              active={row.classSubjectId === classSubjectId}
              onClick={() => setClassSubjectId(row.classSubjectId)}
              count={row.size}
            >
              <span
                aria-hidden
                className="swatch"
                style={{ background: accentVar(hueFor(hues, row.subjectName), "solid") }}
              />
              <span className="cb">
                <span className="cn">
                  {row.className}
                  {row.streamName ? ` ${row.streamName}` : ""} · {row.subjectName}
                </span>
                <span className="cs">
                  {row.classCode} · {row.size}
                </span>
              </span>
            </NavRailItem>
          ))}
          {day.classes.length === 0 ? (
            <p className="px-3 py-2 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              No classes are assigned to you this term.
            </p>
          ) : null}
        </NavRailGroup>

        <NavRailGroup label="Daily work">
          {DAILY.map((item) => (
            <NavRailItem
              key={item.href}
              to={item.href}
              active={isActive(item.href)}
              icon={<item.icon className="size-4" aria-hidden />}
              {...(item.href === "/portal/teacher/marks" && papers > 0
                ? { count: papers }
                : {})}
            >
              {item.label}
            </NavRailItem>
          ))}
        </NavRailGroup>

        <NavRailGroup label="More">
          {MORE.map((item) => (
            <NavRailItem
              key={item.href}
              to={item.href}
              active={isActive(item.href)}
              icon={<item.icon className="size-4" aria-hidden />}
            >
              {item.label}
            </NavRailItem>
          ))}
        </NavRailGroup>

        <NavRailGroup label="Account">
          {ACCOUNT.map((item) => (
            <NavRailItem
              key={item.href}
              to={item.href}
              active={isActive(item.href)}
              icon={<item.icon className="size-4" aria-hidden />}
            >
              {item.label}
            </NavRailItem>
          ))}
          <NavRailItem
            to="/api/auth/signout"
            icon={<LogOut className="size-4" aria-hidden />}
          >
            Sign out
          </NavRailItem>
        </NavRailGroup>
      </NavRail>
    </div>
  );

  const topbar = (
    <>
      <div className="te-bar">
        <div className="meta">
          {caption ? <div className="crumbs">{caption}</div> : null}
          <h1>{title}</h1>
        </div>
        <span className={isOffline ? "te-chip off" : "te-chip"}>
          <span aria-hidden className="pdot" />
          {isOffline ? "Offline" : "Online"}
        </span>
        <Link href="/portal/teacher/messages" aria-label="Messages" className="te-bell">
          <Bell className="size-4" aria-hidden />
          {papers > 0 ? (
            <span className="ndot" aria-hidden>
              {papers}
            </span>
          ) : null}
        </Link>
      </div>
      <nav className="te-tabs" aria-label="Teacher portal sections">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={isActive(tab.href) ? "tab active" : "tab"}
            {...(isActive(tab.href) ? { "aria-current": "page" as const } : {})}
          >
            <tab.icon className="size-4" aria-hidden />
            {tab.label}
            {tab.href === "/portal/teacher/marks" && papers > 0 ? (
              <span className="bdg">{papers}</span>
            ) : null}
          </Link>
        ))}
      </nav>
    </>
  );

  return (
    <AppShell className="te-portal" sidebar={sidebar} topbar={topbar}>
      {children}
    </AppShell>
  );
}
