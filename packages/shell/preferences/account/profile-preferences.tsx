"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Card,
  Field,
  Input,
  SaveBar,
  Skeleton,
} from "@corelithzw/react";

import { useToast } from "@corelithzw/ui/components/use-toast";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  fetchPreferencesProfile,
  updatePreferencesProfile,
  type PreferencesProfile,
} from "@corelithzw/platform/preferences/api";

type ProfileDraft = {
  name: string;
  phone: string;
};

function createDraft(profile: PreferencesProfile | undefined): ProfileDraft {
  return {
    name: profile?.name ?? "",
    phone: profile?.phone ?? "",
  };
}

export function ProfilePreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["preferences", "profile"],
    queryFn: fetchPreferencesProfile,
  });

  const [draft, setDraft] = React.useState<ProfileDraft>(() => createDraft(undefined));

  React.useEffect(() => {
    if (profileQuery.data) {
      setDraft(createDraft(profileQuery.data));
    }
  }, [profileQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updatePreferencesProfile,
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your account preferences were saved.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["preferences", "profile"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update profile",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const savedDraft = createDraft(profileQuery.data);
  const dirty = draft.name !== savedDraft.name || draft.phone !== savedDraft.phone;

  if (profileQuery.isLoading) {
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

  if (profileQuery.error || !profileQuery.data) {
    return (
      <Alert tone="danger" title="Unable to load profile">
        {getApiErrorMessage(profileQuery.error)}
      </Alert>
    );
  }

  const profile = profileQuery.data;

  return (
    <>
      <Card title="Account details">
        <div className="settings-section">
          <Field label="Name" required>
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="Phone" description="Used for workspace contact and notifications.">
            <Input
              value={draft.phone}
              onChange={(event) =>
                setDraft((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="No phone number"
            />
          </Field>
          <Field label="Email" description="Email changes are handled by workspace administrators.">
            <Input value={profile.email} readOnly />
          </Field>
          <div className="settings-row">
            <div>
              <div className="t-label-sm">Role</div>
              <p className="t-caption t-muted">Access is controlled by your workspace role.</p>
            </div>
            <Badge tone="outline">{profile.role}</Badge>
          </div>
          <div className="settings-row">
            <div>
              <div className="t-label-sm">Workspace</div>
              <p className="t-caption t-muted">{profile.company.slug}</p>
            </div>
            <span className="t-mono">{profile.company.name}</span>
          </div>
        </div>
      </Card>

      <SaveBar
        dirty={dirty}
        message="Unsaved profile changes — save your account details or discard the draft."
        loading={updateMutation.isPending}
        onDiscard={() => setDraft(savedDraft)}
        onSave={() =>
          updateMutation.mutate({
            name: draft.name.trim(),
            phone: draft.phone.trim() || null,
          })
        }
      />
    </>
  );
}
