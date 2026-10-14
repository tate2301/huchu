"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Kit, Switch } from "@/components/core";
import { FormPage } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type UserNotificationPreferences,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

import styles from "@/components/notifications/inbox.module.css";

type Key = "inAppEnabled" | "emailEnabled" | "webPushEnabled" | "hrEnabled" | "opsEnabled" | "crmEnabled";
type Draft = Record<Key, boolean>;

/**
 * Where notifications reach you, then one row per kind of event. A switch
 * saves as it is flicked; there is nothing to submit.
 *
 * The data has the channels once for everything (`inAppEnabled`,
 * `emailEnabled`, `webPushEnabled`) and one switch per kind
 * (`hrEnabled`, `opsEnabled`, `crmEnabled`), not a channel per kind. So the
 * channels are one group and each kind is one switch; an in-app and an email
 * switch on every kind needs a column per kind and channel (see NOTES.md).
 */
const CHANNELS: Array<{ key: Key; label: string; note: string }> = [
  { key: "inAppEnabled", label: "In the app", note: "The bell and Activity." },
  { key: "emailEnabled", label: "Email", note: "A copy of each one, sent as it happens." },
  { key: "webPushEnabled", label: "Web push", note: "On this browser, when Corelith is closed." },
];

const KINDS: Array<{ key: Key; label: string; note: string }> = [
  { key: "hrEnabled", label: "People and payroll", note: "Pay runs, disbursements, leave, incidents and approvals." },
  { key: "opsEnabled", label: "Operations and the shop", note: "Permits, work orders, counts, transfers and tills." },
  { key: "crmEnabled", label: "Sales and CRM", note: "Mentions, comments, leads, tasks, quotes and requisitions." },
];

function draftOf(preferences: UserNotificationPreferences | undefined): Draft {
  return {
    inAppEnabled: preferences?.inAppEnabled ?? true,
    emailEnabled: preferences?.emailEnabled ?? true,
    webPushEnabled: preferences?.webPushEnabled ?? false,
    hrEnabled: preferences?.hrEnabled ?? true,
    opsEnabled: preferences?.opsEnabled ?? true,
    crmEnabled: preferences?.crmEnabled ?? true,
  };
}

export function NotificationPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uid = React.useId();
  const preferences = useQuery({ queryKey: ["preferences", "notifications"], queryFn: fetchNotificationPreferences });

  const save = useMutation({
    mutationFn: (change: Partial<Draft>) => updateNotificationPreferences(change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: ["preferences", "notifications"] });
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

  const draft = draftOf(preferences.data);

  const rows = (items: typeof CHANNELS, disabled = false) =>
    items.map((row) => {
      const id = `${uid}-${row.key}`;
      return (
        <div className={styles.prefRow} key={row.key}>
          <label htmlFor={id} className={styles.prefText}>
            <span className={styles.prefLabel}>{row.label}</span>
            <span className={styles.prefNote}>{row.note}</span>
          </label>
          <Switch id={id} checked={draft[row.key]} disabled={disabled} onCheckedChange={(checked) => save.mutate({ [row.key]: checked })} />
        </div>
      );
    });

  let body: React.ReactNode;
  if (preferences.isLoading) {
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
  } else if (preferences.isError || !preferences.data) {
    body = (
      <Empty
        icon="warn"
        title="Your notification settings did not load"
        action={
          <Button icon="history" onClick={() => void preferences.refetch()}>
            Try again
          </Button>
        }
      >
        {getApiErrorMessage(preferences.error, "Check the connection and try again.")}
      </Empty>
    );
  } else {
    body = (
      <>
        <section aria-labelledby={`${uid}-where`}>
          <h2 id={`${uid}-where`} className={styles.prefHead}>
            Where they reach you
          </h2>
          {rows(CHANNELS)}
        </section>
        <section aria-labelledby={`${uid}-what`}>
          <h2 id={`${uid}-what`} className={styles.prefHead}>
            What you hear about
          </h2>
          {rows(KINDS)}
        </section>
      </>
    );
  }

  return (
    <PreferencesShell>
      <FormPage title="Notifications" width={620}>
        <Kit>{body}</Kit>
      </FormPage>
    </PreferencesShell>
  );
}
