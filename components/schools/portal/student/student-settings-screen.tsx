"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@corelithzw/react";
import { SaveError } from "@/components/schools/common/states";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type UserNotificationPreferences,
} from "@/lib/api";
import { Bell, ChatCircle, ChevronRight, Mail } from "@/lib/icons";
import { useStudentPortal } from "./student-portal-context";

const PREFERENCES_KEY = ["notifications", "preferences"] as const;

/**
 * Settings, honestly.
 *
 * The prototype's grouped rows are here — small-caps heading, hairline-divided
 * card, leading icon tile, chevron on anything that goes somewhere — because
 * that is the shape a phone's settings screen has and a pupil already knows how
 * to read it.
 *
 * Only what works is on it. The prototype's theme switch, alert cadence and PIN
 * have nowhere to keep a setting yet, so they are not drawn: a switch that
 * silently forgets what it was told costs the reader their trust in the ones
 * that work, and a row greyed out with a note about what the product cannot do
 * yet is the school's problem being explained to a child.
 */
export function StudentSettingsScreen() {
  const { student } = useStudentPortal();
  const queryClient = useQueryClient();

  const preferences = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: fetchNotificationPreferences,
    enabled: Boolean(student),
  });

  const save = useMutation({
    mutationFn: (input: Partial<UserNotificationPreferences>) =>
      updateNotificationPreferences(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(PREFERENCES_KEY, updated);
    },
  });

  const alertsOn = preferences.data?.inAppEnabled ?? true;

  return (
    <div className="flex flex-col">
      {save.error ? <SaveError what="That setting" error={save.error} /> : null}

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
      </div>

      <div className="sp-psh">Alerts</div>
      <div className="sp-group">
        <div className="sp-setting-row">
          <span className="sp-sr-ic">
            <Bell className="size-4" aria-hidden />
          </span>
          <span className="sp-sr-body">
            <span className="sp-sr-nm block">
              Tell me when something arrives
            </span>
            <span className="sp-sr-sb block">
              Marks going up, homework set, notices from the office
            </span>
          </span>
          <Switch
            aria-label="Tell me when something arrives"
            checked={alertsOn}
            disabled={preferences.isPending || save.isPending}
            onChange={(event) =>
              save.mutate({ inAppEnabled: event.target.checked })
            }
          />
        </div>
        <Link href="/portal/student/notifications" className="sp-setting-row">
          <span className="sp-sr-ic">
            <ChatCircle className="size-4" aria-hidden />
          </span>
          <span className="sp-sr-body">
            <span className="sp-sr-nm block">Your messages</span>
            <span className="sp-sr-sb block">
              Everything the school has sent you
            </span>
          </span>
          <span className="sp-sr-chev">
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>
      </div>
    </div>
  );
}
