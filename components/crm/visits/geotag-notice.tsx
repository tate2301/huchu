"use client";

import { useQuery } from "@tanstack/react-query";

import { Alert, Button } from "@corelithzw/react";
import { fetchJson } from "@/lib/api-client";
import { ExternalLink, MapPin } from "@/lib/icons";
import { DEFAULT_FIELD_CAMERA_APP, resolveFieldCamera, type FieldCamera } from "@/lib/crm/geotag";

export type FieldCameraResponse = {
  data: FieldCamera & { configured: { appName: string | null; appUrl: string | null } };
  canEdit: boolean;
};

export const FIELD_CAMERA_QUERY_KEY = ["crm", "field-camera"] as const;

export function useFieldCamera({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: FIELD_CAMERA_QUERY_KEY,
    queryFn: () => fetchJson<FieldCameraResponse>("/api/v2/crm/settings/field-camera"),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

/** The notice itself, for a camera already decided — the settings preview draws this. */
export function FieldCameraNotice({ camera, className }: { camera: FieldCamera; className?: string }) {
  return (
    <Alert
      tone="info"
      className={className}
      icon={<MapPin aria-hidden="true" />}
      title="Upload geotagged photos only"
      actions={
        // `asChild` hands the button's look to the link and drops its icon
        // slots, so the mark that says "this leaves the app" rides inside.
        <Button asChild variant="secondary" size="sm">
          <a href={camera.storeUrl} target="_blank" rel="noopener noreferrer">
            Get {camera.appName}
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </Button>
      }
    >
      We recommend {camera.appName} for accurate location stamps.
    </Alert>
  );
}

/**
 * The standing instruction wherever site photos are taken: geotag them, and
 * with which app.
 *
 * It is a notice rather than a rule the upload enforces. A photo with no
 * location is still accepted and tagged as such, because losing the picture
 * of the damage is worse than having it without coordinates — so the moment
 * to fix the camera is before the visit, which is where this sits.
 *
 * The app is the tenant's choice, from settings. Until that answer arrives
 * nothing is drawn rather than the default, so a tenant that chose another
 * app never sees ours flash up first; if it cannot be fetched, the default
 * stands, because the advice to geotag is true either way.
 */
export function GeotagNotice({ className }: { className?: string }) {
  const query = useFieldCamera();
  if (query.isLoading) return null;

  const camera =
    query.data?.data ??
    resolveFieldCamera({ fieldCameraAppName: DEFAULT_FIELD_CAMERA_APP, fieldCameraAppUrl: null });

  return <FieldCameraNotice camera={camera} className={className} />;
}
