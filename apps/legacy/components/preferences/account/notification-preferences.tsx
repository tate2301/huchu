"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Card, Skeleton, Switch } from "@corelithzw/react";

import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type UserNotificationPreferences,
} from "@/lib/api";

type PreferenceKey = keyof Pick<
  UserNotificationPreferences,
  "inAppEnabled" | "webPushEnabled" | "hrEnabled" | "opsEnabled" | "crmEnabled"
>;

const preferenceRows: Array<{
  key: PreferenceKey;
  label: string;
  description: string;
}> = [
  {
    key: "inAppEnabled",
    label: "In-app notifications",
    description: "Show notification center updates while you work.",
  },
  {
    key: "webPushEnabled",
    label: "Web push",
    description: "Allow browser push notifications when supported.",
  },
  {
    key: "hrEnabled",
    label: "HR and payroll",
    description: "Receive approvals, payroll, compensation, and disbursement updates.",
  },
  {
    key: "opsEnabled",
    label: "Operations",
    description: "Receive incidents, permits, work orders, and operational alerts.",
  },
  {
    key: "crmEnabled",
    label: "Sales and CRM",
    description: "Receive lead assignments, quote decisions, tasks, and mentions.",
  },
];

export function NotificationPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({
    queryKey: ["preferences", "notifications"],
    queryFn: fetchNotificationPreferences,
  });

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
      <Card>
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} variant="text" />
          ))}
        </div>
      </Card>
    );
  }

  if (preferencesQuery.error || !preferencesQuery.data) {
    return (
      <Alert tone="danger" title="Unable to load notifications">
        {getApiErrorMessage(preferencesQuery.error)}
      </Alert>
    );
  }

  const preferences = preferencesQuery.data;

  return (
    <Card title="Notification routing">
      <div className="settings-section">
        {preferenceRows.map((row) => (
          <div className="settings-row" key={row.key}>
            <div>
              <div className="t-label-sm">{row.label}</div>
              <p className="t-caption t-muted">{row.description}</p>
            </div>
            <Switch
              aria-label={row.label}
              checked={preferences[row.key]}
              disabled={updateMutation.isPending}
              onChange={(event) =>
                updateMutation.mutate({ [row.key]: event.target.checked })
              }
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
