"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Kit, Switch } from "@/components/core";
import { FormPage } from "@/components/management/ui";
import { KindMatrix, type KindChange } from "@/components/management/notifications/routing-view";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type UserNotificationPreferences,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { MatrixRow, SentChannel } from "@/lib/inbox/settings";

import styles from "@/components/notifications/inbox.module.css";

type Key = "inAppEnabled" | "emailEnabled" | "webPushEnabled";
type Draft = Record<Key, boolean>;

/**
 * My account → Notifications: where notifications reach you at all, then
 * what you hear about, kind by kind, in the app and by email
 * (`NotificationSetting`, approved 15 Oct). A kind the workspace turned off on
 * a channel (Management → Notifications) cannot be ticked there, and says
 * so. Everything saves as it is changed; there is nothing to submit.
 */
const CHANNELS: Array<{ key: Key; label: string; note: string }> = [
  { key: "inAppEnabled", label: "In the app", note: "The bell and Activity." },
  { key: "emailEnabled", label: "Email", note: "A copy of each one, sent as it happens." },
  { key: "webPushEnabled", label: "Web push", note: "On this browser, when Corelith is closed." },
];

function draftOf(preferences: UserNotificationPreferences | undefined): Draft {
  return {
    inAppEnabled: preferences?.inAppEnabled ?? true,
    emailEnabled: preferences?.emailEnabled ?? true,
    webPushEnabled: preferences?.webPushEnabled ?? false,
  };
}

const KINDS_KEY = ["preferences", "notifications", "kinds"] as const;

export function NotificationPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uid = React.useId();
  const preferences = useQuery({ queryKey: ["preferences", "notifications"], queryFn: fetchNotificationPreferences });
  const kinds = useQuery({ queryKey: KINDS_KEY, queryFn: () => fetchJson<{ kinds: MatrixRow[] }>("/api/notifications/settings") });

  const save = useMutation({
    mutationFn: (change: Partial<Draft>) => updateNotificationPreferences(change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: ["preferences", "notifications"], exact: true });
      const before = queryClient.getQueryData<UserNotificationPreferences>(["preferences", "notifications"]);
      if (before) queryClient.setQueryData(["preferences", "notifications"], { ...before, ...change });
      return { before };
    },
    onError: (error, _change, context) => {
      if (context?.before) queryClient.setQueryData(["preferences", "notifications"], context.before);
      toast({ title: "That setting was not saved", description: getApiErrorMessage(error), variant: "destructive" });
    },
    onSuccess: (next) => queryClient.setQueryData(["preferences", "notifications"], next),
  });

  const change = useMutation({
    mutationFn: (next: KindChange) => fetchJson<{ kinds: MatrixRow[] }>("/api/notifications/settings", { method: "PATCH", body: JSON.stringify(next) }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: KINDS_KEY });
      const before = queryClient.getQueryData<{ kinds: MatrixRow[] }>(KINDS_KEY);
      if (before) {
        queryClient.setQueryData(KINDS_KEY, {
          kinds: before.kinds.map((row) => (row.key === next.kind ? { ...row, on: { ...row.on, [next.channel]: next.enabled } } : row)),
        });
      }
      return { before };
    },
    onSuccess: (next) => queryClient.setQueryData(KINDS_KEY, next),
    onError: (error, _next, context) => {
      if (context?.before) queryClient.setQueryData(KINDS_KEY, context.before);
      toast({ title: "That setting was not saved", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const draft = draftOf(preferences.data);
  const offForAll = (row: MatrixRow, channel: SentChannel) =>
    row.offForAll?.[channel] ? "Your workspace turned this off for everyone" : !draft[channel === "IN_APP" ? "inAppEnabled" : "emailEnabled"] ? "Turned off above" : null;

  let body: React.ReactNode;
  if (preferences.isLoading || kinds.isLoading) {
    body = (
      <div aria-busy="true" aria-label="Loading your notification settings">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div className={styles.skeletonRow} key={index} style={{ gridTemplateColumns: "minmax(0,1fr) 36px" }}>
            <span style={{ width: `${[40, 30, 36, 44, 38, 42][index]}%`, height: 10, borderRadius: 4 }} />
            <span style={{ height: 20, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    );
  } else if (preferences.isError || !preferences.data || kinds.isError || !kinds.data) {
    body = (
      <Empty
        icon="warn"
        title="Your notification settings did not load"
        action={
          <Button
            icon="history"
            onClick={() => {
              void preferences.refetch();
              void kinds.refetch();
            }}
          >
            Try again
          </Button>
        }
      >
        {getApiErrorMessage(preferences.error ?? kinds.error, "Check the connection and try again.")}
      </Empty>
    );
  } else {
    body = (
      <>
        <section aria-labelledby={`${uid}-where`}>
          <h2 id={`${uid}-where`} className={styles.prefHead}>
            Where they reach you
          </h2>
          {CHANNELS.map((row) => {
            const id = `${uid}-${row.key}`;
            return (
              <div className={styles.prefRow} key={row.key}>
                <label htmlFor={id} className={styles.prefText}>
                  <span className={styles.prefLabel}>{row.label}</span>
                  <span className={styles.prefNote}>{row.note}</span>
                </label>
                <Switch id={id} checked={draft[row.key]} onCheckedChange={(checked) => save.mutate({ [row.key]: checked })} />
              </div>
            );
          })}
        </section>
        <section aria-labelledby={`${uid}-what`}>
          <h2 id={`${uid}-what`} className={styles.prefHead}>
            What you hear about
          </h2>
          <p className={styles.prefNote}>Anything you did yourself never notifies you.</p>
          <KindMatrix kinds={kinds.data.kinds} saving={change.isPending} onChange={(next) => change.mutate(next)} disabledWhy={offForAll} />
        </section>
      </>
    );
  }

  return (
    <PreferencesShell>
      <FormPage title="Notifications" width={760}>
        <Kit>{body}</Kit>
      </FormPage>
    </PreferencesShell>
  );
}
