"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Input, toast } from "@corelithzw/react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FIELD_CAMERA_QUERY_KEY,
  FieldCameraNotice,
  useFieldCamera,
  type FieldCameraResponse,
} from "@/components/crm/visits/geotag-notice";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { DEFAULT_FIELD_CAMERA_APP, fieldCameraSearchUrl, resolveFieldCamera } from "@/lib/crm/geotag";
import { Info } from "@/lib/icons";

import { SetupNote, SetupPanel } from "./setup-chrome";

/**
 * Which camera app reps are told to take site photos with.
 *
 * A site photo is only evidence if it says where it was taken, and a phone's
 * own camera app leaves the location off often enough — permission denied
 * once, a setting nobody knew about — that "geotag your photos" has to come
 * with an app that stamps every shot. This is where a tenant names that app
 * and where to get it. Nothing else about the visit changes.
 *
 * Both boxes may be left empty, and that is the common case: the default is a
 * real app, and with no link of their own reps get a store search for its
 * name, which keeps working when a listing moves.
 */
export function FieldCameraPanel() {
  const queryClient = useQueryClient();
  const query = useFieldCamera();
  // What the person has typed since the last save; null means "showing what
  // is saved". Derived rather than synced, so a refetch never clobbers typing.
  const [draft, setDraft] = useState<{ appName: string; appUrl: string } | null>(null);

  const configured = query.data?.data.configured;
  const appName = draft?.appName ?? configured?.appName ?? "";
  const appUrl = draft?.appUrl ?? configured?.appUrl ?? "";
  const dirty =
    draft !== null &&
    (draft.appName.trim() !== (configured?.appName ?? "") ||
      draft.appUrl.trim() !== (configured?.appUrl ?? ""));
  const urlError =
    appUrl.trim() && !/^https:\/\/\S+$/i.test(appUrl.trim())
      ? "The link has to start with https://"
      : undefined;

  const save = useMutation({
    mutationFn: () =>
      fetchJson<FieldCameraResponse>("/api/v2/crm/settings/field-camera", {
        method: "PATCH",
        body: JSON.stringify({ appName: appName.trim() || null, appUrl: appUrl.trim() || null }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(FIELD_CAMERA_QUERY_KEY, result);
      setDraft(null);
      toast.success(`Reps are now pointed at ${result.data.appName}`);
    },
    onError: (error) => toast.error("The camera app was not saved", { description: getApiErrorMessage(error) }),
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full max-w-2xl" />;

  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title="The field camera setting would not load" className="max-w-2xl">
        {getApiErrorMessage(query.error)}
      </Alert>
    );
  }

  const canEdit = query.data.canEdit;
  const preview = resolveFieldCamera({
    fieldCameraAppName: appName.trim() || null,
    fieldCameraAppUrl: urlError ? null : appUrl.trim() || null,
  });
  const edit = (patch: Partial<{ appName: string; appUrl: string }>) =>
    setDraft({ appName, appUrl, ...patch });

  return (
    <div className="min-w-0 max-w-2xl space-y-3">
      {/* Rule 1: the placeholders are the defaults, so an empty box needs no
          sentence under it saying what it falls back to. */}
      <SetupPanel title="Camera app">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty && !urlError) save.mutate();
          }}
        >
          <Input
            label="App name"
            value={appName}
            onChange={(event) => edit({ appName: event.target.value })}
            placeholder={DEFAULT_FIELD_CAMERA_APP}
            maxLength={80}
            disabled={!canEdit || save.isPending}
          />
          <Input
            label="Where to get it"
            type="url"
            inputMode="url"
            value={appUrl}
            onChange={(event) => edit({ appUrl: event.target.value })}
            placeholder={fieldCameraSearchUrl(appName.trim() || DEFAULT_FIELD_CAMERA_APP)}
            error={urlError}
            maxLength={500}
            disabled={!canEdit || save.isPending}
          />
          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty || Boolean(urlError)}>
                Save camera app
              </Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Changing this is for somebody with CRM settings access.
            </p>
          )}
        </form>
      </SetupPanel>

      <SetupPanel title="What reps see" hint="on the site-visit list and in every report">
        <FieldCameraNotice camera={preview} />
      </SetupPanel>

      <SetupNote icon={Info}>
        A photo without a location is still accepted. It is marked &ldquo;No location&rdquo; in the
        report and the rep is told straight away, so it can be retaken while they are still on site.
      </SetupNote>
    </div>
  );
}
