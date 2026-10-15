"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Icon } from "@/components/core";
import { RoutingPageView, type KindChange, type RoutingData } from "@/components/management/notifications/routing-view";
import { KitPage, OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";

const QUERY_KEY = ["notifications", "routing"] as const;

/** Management → Notifications: each kind on each channel for the workspace, saved as it is ticked. */
export function RoutingSettings() {
  const client = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => fetchJson<RoutingData>("/api/notifications/routing") });

  const quiet = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      fetchJson("/api/vane/settings", { method: "PATCH", body: JSON.stringify({ quietFrom: from, quietTo: to }) }),
    onMutate: async ({ from, to }) => {
      await client.cancelQueries({ queryKey: QUERY_KEY });
      const before = client.getQueryData<RoutingData>(QUERY_KEY);
      if (before) client.setQueryData<RoutingData>(QUERY_KEY, { ...before, quiet: { from, to } });
      return { before };
    },
    onError: (error, _change, context) => {
      if (context?.before) client.setQueryData(QUERY_KEY, context.before);
      toast({ title: "Quiet hours did not change", description: getApiErrorMessage(error), variant: "destructive" });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: QUERY_KEY });
      void client.invalidateQueries({ queryKey: ["vane"] });
    },
  });

  const change = useMutation({
    mutationFn: (next: KindChange) => fetchJson<RoutingData>("/api/notifications/routing", { method: "PATCH", body: JSON.stringify(next) }),
    onMutate: async (next) => {
      await client.cancelQueries({ queryKey: QUERY_KEY });
      const before = client.getQueryData<RoutingData>(QUERY_KEY);
      if (before) {
        client.setQueryData<RoutingData>(QUERY_KEY, {
          ...before,
          kinds: before.kinds.map((row) => (row.key === next.kind ? { ...row, on: { ...row.on, [next.channel]: next.enabled } } : row)),
        });
      }
      return { before };
    },
    onSuccess: (view) => client.setQueryData(QUERY_KEY, view),
    onError: (error, _next, context) => {
      if (context?.before) client.setQueryData(QUERY_KEY, context.before);
      toast({ title: "That setting was not saved", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  let body: React.ReactNode;
  if (query.data) {
    body = (
      <RoutingPageView
        data={query.data}
        saving={quiet.isPending || change.isPending}
        onChange={(next) => change.mutate(next)}
        onQuiet={(from, to) => quiet.mutate({ from, to })}
      />
    );
  } else if (query.isError) {
    const refused = query.error instanceof ApiError && query.error.status === 403;
    body = (
      <KitPage title="Notifications" mark={<Icon name="bell" />} width={1120}>
        <Empty
          icon={refused ? "lock" : "warn"}
          title={refused ? "Only managers and owners see who hears about what" : "Who hears about what did not load"}
          action={
            refused ? null : (
              <Button icon="history" onClick={() => void query.refetch()}>
                Try again
              </Button>
            )
          }
        >
          {refused ? "Your own notifications are in My account, under Notifications." : getApiErrorMessage(query.error, "Check the connection and try again.")}
        </Empty>
      </KitPage>
    );
  } else {
    body = (
      <KitPage title="Notifications" mark={<Icon name="bell" />} width={1120}>
        <div aria-busy="true" aria-label="Loading who hears about what" style={{ display: "grid", gap: 16 }}>
          <div className="skeleton" style={{ height: 56, maxWidth: 720 }} />
          <div className="skeleton" style={{ height: 360 }} />
          <div className="skeleton" style={{ height: 72 }} />
        </div>
      </KitPage>
    );
  }

  return (
    <ManagementShell>
      <OwnsChrome>{body}</OwnsChrome>
    </ManagementShell>
  );
}
