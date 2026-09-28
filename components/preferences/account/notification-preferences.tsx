"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@corelithzw/react";

import { FormPage } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type UserNotificationPreferences,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Warning } from "@/lib/icons";

import styles from "./account.module.css";

type PreferenceKey = keyof Pick<
  UserNotificationPreferences,
  "inAppEnabled" | "webPushEnabled" | "hrEnabled" | "opsEnabled" | "crmEnabled"
>;

type PreferenceDraft = Record<PreferenceKey, boolean>;

/**
 * Every switch the data has, grouped the way the board groups them.
 *
 * `lib/notifications.ts` defines exactly two delivery channels
 * (`inAppEnabled`, `webPushEnabled`) and exactly three categories — its
 * `NotificationCategory` union is `"HR" | "OPS" | "CRM"`, and
 * `filterRecipientsForCategory` reads one boolean per category. There is no
 * email channel and no per-event flag anywhere in the model, so the board's
 * "Email" group and its one-row-per-event drawing are reproduced as the rows
 * that actually exist. Every channel and every category is covered.
 *
 * The labels are the whole row — rule 1 deleted the sentence that used to sit
 * under each one, all five of which restated the label.
 */
const groups: Array<{ id: string; label: string; rows: Array<{ key: PreferenceKey; label: string }> }> = [
  {
    id: "channels",
    label: "Channels",
    rows: [
      { key: "inAppEnabled", label: "In the app" },
      { key: "webPushEnabled", label: "Web push" },
    ],
  },
  {
    id: "topics",
    label: "Topics",
    rows: [
      { key: "hrEnabled", label: "HR and payroll" },
      { key: "opsEnabled", label: "Operations" },
      { key: "crmEnabled", label: "Sales and CRM" },
    ],
  },
];

const keys = groups.flatMap((group) => group.rows.map((row) => row.key));

function createDraft(preferences: UserNotificationPreferences | undefined): PreferenceDraft {
  return {
    inAppEnabled: preferences?.inAppEnabled ?? true,
    webPushEnabled: preferences?.webPushEnabled ?? false,
    hrEnabled: preferences?.hrEnabled ?? true,
    opsEnabled: preferences?.opsEnabled ?? true,
    crmEnabled: preferences?.crmEnabled ?? true,
  };
}

/**
 * Notifications — `Notifications.dc.html`.
 *
 * The board draws Save/Cancel under the switches, so the switches edit a draft
 * and one submit writes the diff. The mutation, its endpoint and the
 * `["preferences", "notifications"]` key are untouched; only *when* it fires
 * moved, from one request per flick to one request per save.
 *
 * The shell is rendered here rather than by the route, for the reason
 * `app/preferences/profile/page.tsx` gives: `FormPage` has to be a direct
 * child of the surface's grid row, and a route that wraps it adds a second
 * title line and a second inset around a page that already draws both.
 */
export function NotificationPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // One stem for the whole form, so each row can name its own switch without
  // calling a hook inside the map. Declared with the other hooks, above the
  // loading and failure returns, so the hook order never changes.
  const uid = React.useId();
  const preferencesQuery = useQuery({
    queryKey: ["preferences", "notifications"],
    queryFn: fetchNotificationPreferences,
  });

  const [draft, setDraft] = React.useState<PreferenceDraft>(() => createDraft(undefined));

  React.useEffect(() => {
    if (preferencesQuery.data) {
      setDraft(createDraft(preferencesQuery.data));
    }
  }, [preferencesQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (next) => {
      queryClient.setQueryData(["preferences", "notifications"], next);
      toast({
        title: "Notification preferences updated",
        description: "Your notification settings were saved.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to update notifications",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  if (preferencesQuery.isLoading) {
    return (
      <PreferencesShell>
        <FormPage title="Notifications" className={styles.page}>
          <div
            className={styles.skeleton}
            role="status"
            aria-label="Loading your notification settings"
          >
            {[120, 240, 200, 260, 180, 220].map((width, index) => (
              <span
                key={index}
                className={styles.skeletonBar}
                style={{ width: `${width}px` }}
              />
            ))}
          </div>
        </FormPage>
      </PreferencesShell>
    );
  }

  if (preferencesQuery.error || !preferencesQuery.data) {
    return (
      <PreferencesShell>
        <FormPage title="Notifications" className={styles.page}>
          <p className={styles.failure}>
            <Warning />
            {getApiErrorMessage(preferencesQuery.error)}
          </p>
        </FormPage>
      </PreferencesShell>
    );
  }

  const saved = createDraft(preferencesQuery.data);
  const allOff = keys.every((key) => !draft[key]);

  return (
    <PreferencesShell>
      <FormPage
        title="Notifications"
        className={styles.page}
        busy={updateMutation.isPending}
        onCancel={() => setDraft(saved)}
        onSubmit={(event) => {
          event.preventDefault();
          updateMutation.mutate(draft);
        }}
        overflow={
          // Rule 3: the rare verb lives in the overflow. Rule 9: only the one
          // that can do something is drawn.
          <DropdownMenuItem
            onSelect={() =>
              setDraft((current) => {
                const next = { ...current };
                for (const key of keys) next[key] = allOff;
                return next;
              })
            }
          >
            {allOff ? "Turn everything on" : "Turn everything off"}
          </DropdownMenuItem>
        }
      >
        {groups.map((group) => (
          <React.Fragment key={group.id}>
            <h3 className={styles.heading}>{group.label}</h3>
            {group.rows.map((row) => {
              const id = `${uid}-${row.key}`;
              return (
                <div className={styles.row} key={row.key}>
                  {/*
                    A real `<label>`, not a span with `aria-label` on the
                    switch. The board draws the name as static text because a
                    board is a drawing; here the name is the control's only
                    visible label, so it has to be tied to it — that is what
                    makes the whole row name clickable and what lets a screen
                    reader read the switch by the name beside it. `aria-label`
                    would silently override this text, so it is gone rather
                    than duplicated. `cursor-pointer` is a Tailwind utility,
                    which outranks the module's `@layer components`.
                  */}
                  <label htmlFor={id} className={`${styles.rowName} cursor-pointer`}>
                    {row.label}
                  </label>
                  <Switch
                    id={id}
                    checked={draft[row.key]}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [row.key]: event.target.checked,
                      }))
                    }
                  />
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </FormPage>
    </PreferencesShell>
  );
}
