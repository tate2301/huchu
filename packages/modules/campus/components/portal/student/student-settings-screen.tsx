"use client";

import Link from "next/link";
import { Alert } from "@corelithzw/react";
import { Bell, ChevronRight, Lock, Mail } from "@corelithzw/ui/lib/icons";
import { useStudentPortal } from "./student-portal-context";

/**
 * Settings, honestly.
 *
 * The prototype's grouped rows are here — small-caps heading, hairline-divided
 * card, leading icon tile, chevron on anything that goes somewhere — because
 * that is the shape a phone's settings screen has and a pupil already knows how
 * to read it.
 *
 * What is *not* here is three of the prototype's controls: a theme switch, a
 * notification cadence and a PIN. Two of the three have nowhere to be stored yet
 * — there is no per-pupil preference table and portal sign-in is a password
 * rather than a PIN — so they are named as not built rather than rendered as
 * switches that forget what you told them. A switch that silently does nothing
 * is worse than no switch, because it costs the reader their trust in the ones
 * that work.
 */
export function StudentSettingsScreen() {
  const { student } = useStudentPortal();

  return (
    <div className="flex flex-col">
      <div className="sp-psh">Your sign-in</div>
      <div className="sp-group">
        <div className="sp-setting-row">
          <span className="sp-sr-ic">
            <Mail className="size-4" aria-hidden />
          </span>
          <span className="sp-sr-body">
            <span className="sp-sr-nm block truncate">
              {student?.user?.email ?? "your school email"}
            </span>
            <span className="sp-sr-sb block">
              The address you sign in with. The school office owns it.
            </span>
          </span>
        </div>
        <Link href="/settings/profile" className="sp-setting-row">
          <span className="sp-sr-ic">
            <Lock className="size-4" aria-hidden />
          </span>
          <span className="sp-sr-body">
            <span className="sp-sr-nm block">Change your password</span>
            <span className="sp-sr-sb block">
              You sign in with a password, not a PIN
            </span>
          </span>
          <span className="sp-sr-chev">
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>
      </div>

      <div className="sp-psh">Notifications</div>
      <div className="sp-group">
        <Link href="/portal/student/notifications" className="sp-setting-row">
          <span className="sp-sr-ic">
            <Bell className="size-4" aria-hidden />
          </span>
          <span className="sp-sr-body">
            <span className="sp-sr-nm block">Your messages</span>
            <span className="sp-sr-sb block">
              You are told when your school publishes something for you
            </span>
          </span>
          <span className="sp-sr-chev">
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>
      </div>

      <div className="mt-3">
        <Alert tone="info" title="Three things from the design are not here yet">
          A PIN instead of a password, choosing how often you are told, and
          picking a theme. All three need somewhere to keep the setting, which the
          school portal does not have yet. They are on the plan rather than
          hidden.
        </Alert>
      </div>
    </div>
  );
}
