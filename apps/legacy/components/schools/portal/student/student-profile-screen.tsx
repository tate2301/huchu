"use client";

import Link from "next/link";
import { Badge, Callout, EmptyState } from "@corelithzw/react";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  Bell,
  Calendar,
  ChevronRight,
  MedusaAcademicCapIcon,
  HelpCircle,
  Home,
  Info,
  Mail,
  Settings2,
  TrendingUp,
} from "@/lib/icons";
import { useStudentPortal } from "./student-portal-context";

/** Where the rest of the pupil's own account lives. */
const ELSEWHERE = [
  {
    href: "/portal/student/goals",
    label: "My goals",
    body: "What you are aiming for in each subject",
    icon: TrendingUp,
  },
  {
    href: "/portal/student/notifications",
    label: "Messages",
    body: "What the school has sent you",
    icon: Bell,
  },
  {
    href: "/portal/student/settings",
    label: "Settings",
    body: "Alerts, theme and your PIN",
    icon: Settings2,
  },
  {
    href: "/portal/student/help",
    label: "Help",
    body: "How this app works",
    icon: HelpCircle,
  },
];

/**
 * Fields the school owns, and why each one is theirs rather than the pupil's.
 *
 * The demo puts an edit pencil in the app bar and a contact list under it —
 * email, phone, guardian, home address — all of them editable. Two problems
 * with that here. The product does not store a pupil's phone or address at all,
 * so those rows would be invented; and the ones it does store are the school's
 * record, printed on registers, mark sheets and reports. A child changing their
 * own name on a phone would change what a report card says.
 *
 * Naming the owner is more use than a greyed-out input: it tells the pupil who
 * to go and ask.
 */
const SCHOOL_OWNED = [
  {
    field: "Your name",
    owner: "School office",
    why: "It goes on the register, your marks and your report, so it follows the school's record and not this app.",
  },
  {
    field: "Student number",
    owner: "School office",
    why: "Given to you once when you joined. It is how everything in the school finds your record.",
  },
  {
    field: "Year group and stream",
    owner: "School office",
    why: "It decides your timetable and who teaches you. It changes when the office moves you.",
  },
  {
    field: "Boarding or day",
    owner: "School office",
    why: "Set by the boarding house, because it decides where you sleep and who is looking after you.",
  },
  {
    field: "Sign-in email",
    owner: "School office",
    why: "It is how you sign in. Changing it would change the account, so an adult has to do it.",
  },
];

/**
 * Who the pupil is, as the school holds it.
 *
 * There is no fetch on this screen and no skeleton: the portal layout reads the
 * pupil's own record on the server, from the signed-in account rather than
 * anything the URL says, and hands it down. That also means there is no error
 * state to render — nothing here can fail on its own. The one condition worth
 * rendering is an account that was never linked to a pupil, because that is
 * real, it happens on the day an invite is claimed wrongly, and it has a next
 * step: ask the office.
 *
 * The face is the pupil's own, drawn by `PersonAvatar` so the same child is the
 * same colour here as on the register their teacher takes.
 */
export function StudentProfileScreen() {
  const { student, term } = useStudentPortal();

  if (!student) {
    return (
      <EmptyState
        title="This account is not linked to a pupil"
        body="Ask the school office to link your sign-in to your student record. Until they do, there is no profile to show."
      />
    );
  }

  const name = `${student.firstName} ${student.lastName}`;
  const yearGroup = student.currentClass
    ? `${student.currentClass.name}${student.currentStream ? ` ${student.currentStream.name}` : ""}`
    : "Not in a year group yet";

  const facts: Array<{
    label: string;
    value: string;
    mono?: boolean;
    icon: typeof Info;
  }> = [
    { label: "Student number", value: student.studentNo, mono: true, icon: Info },
    { label: "Year group", value: yearGroup, icon: MedusaAcademicCapIcon },
    {
      label: "Boarding",
      value: student.isBoarding ? "Boarder" : "Day pupil",
      icon: Home,
    },
    { label: "Term", value: term?.name ?? "No term running", icon: Calendar },
    {
      label: "Sign-in email",
      value: student.user?.email ?? "No portal account linked",
      mono: Boolean(student.user?.email),
      icon: Mail,
    },
  ];

  return (
    <div className="flex flex-col">
      {/* The prototype's ID card: the pupil's own face and number on the portal's
          identity colour, so the screen opens with something that is theirs. */}
      <div className="sp-id-card">
        <div className="sp-id-top">
          <PersonAvatar
            firstName={student.firstName}
            lastName={student.lastName}
            src={student.user?.image ?? null}
            size="lg"
          />
          <div className="min-w-0">
            <div className="sp-id-nm truncate">{name}</div>
            <div className="sp-id-sb truncate">
              {[yearGroup, term?.name].filter(Boolean).join(" · ")}
            </div>
            <div className="sp-id-pills">
              <span className="sp-id-pill">{student.studentNo}</span>
              <span className="sp-id-pill">
                {student.isBoarding ? "Boarder" : "Day pupil"}
              </span>
            </div>
          </div>
        </div>
        <div className="sp-id-stats">
          <div>
            <div className="sp-id-stat-l">Year group</div>
            <div className="sp-id-stat-v">
              {student.currentClass?.name ?? "Not set"}
            </div>
          </div>
          <div>
            <div className="sp-id-stat-l">Stream</div>
            <div className="sp-id-stat-v">
              {student.currentStream?.name ?? "—"}
            </div>
          </div>
          <div>
            <div className="sp-id-stat-l">Term</div>
            <div className="sp-id-stat-v">{term?.name ?? "None"}</div>
          </div>
        </div>
      </div>

      <div className="sp-psh">Your details</div>
      <div className="sp-list">
        {facts.map((fact) => (
          <div key={fact.label} className="sp-list-row">
            <span className="sp-ic-tile">
              <fact.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="block min-w-0">
              <span
                className={`sp-lr-nm block truncate${fact.mono ? " font-[family-name:var(--font-mono)] tabular-nums" : ""}`}
              >
                {fact.value}
              </span>
              <span className="sp-lr-sb block truncate">{fact.label}</span>
            </span>
            <span />
          </div>
        ))}
      </div>

      <div className="sp-psh">More</div>
      <div className="sp-list">
        {ELSEWHERE.map((item) => (
          <Link key={item.href} href={item.href} className="sp-list-row">
            <span className="sp-ic-tile">
              <item.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="block min-w-0">
              <span className="sp-lr-nm block truncate">{item.label}</span>
              <span className="sp-lr-sb block truncate">{item.body}</span>
            </span>
            <span className="sp-lr-chev">
              <ChevronRight className="size-4" aria-hidden />
            </span>
          </Link>
        ))}
      </div>

      <div className="sp-psh">Held by the school</div>
      <div className="sp-group">
        {SCHOOL_OWNED.map((row) => (
          <div key={row.field} className="sp-setting-row">
            <span className="sp-sr-body">
              <span className="flex flex-wrap items-center gap-2">
                <span className="sp-sr-nm">{row.field}</span>
                <Badge tone="outline">{row.owner}</Badge>
              </span>
              <span className="sp-sr-sb block">{row.why}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Callout tone="info" title="Something here is wrong">
          Tell your form teacher or the school office. They hold the record this
          app reads from, so fixing it there fixes it on your report too.
        </Callout>
      </div>
    </div>
  );
}
