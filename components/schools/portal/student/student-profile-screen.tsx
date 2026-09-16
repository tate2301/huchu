"use client";

import Link from "next/link";
import { Callout, EmptyState } from "@corelithzw/react";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  Bell,
  ChevronRight,
  HelpCircle,
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
    body: "Your sign-in and what you are told about",
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
 * The card is the screen. The demo repeats the same four facts underneath it as
 * an editable contact list; here they are the school's record — printed on
 * registers, mark sheets and reports — so they are said once, on the card, and
 * the callout names who changes them. A child cannot edit their own name into a
 * report card, and a list of greyed-out inputs saying so is a worse answer than
 * one line telling them who to ask.
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
    : "Not in a class yet";

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

      <div className="mt-3">
        <Callout tone="info" title="Something here is wrong">
          Tell your form teacher or the school office. They hold the record this
          app reads from, so fixing it there fixes it on your report too.
        </Callout>
      </div>
    </div>
  );
}
