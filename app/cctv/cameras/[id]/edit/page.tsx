"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Camera, fetchNVRs, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CameraForm } from "@/components/cctv/camera-form";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";

export default function EditCameraPage() {
  const params = useParams<{ id: string }>();
  const cameraId = params.id;

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const {
    data: nvrsData,
    isLoading: nvrsLoading,
    error: nvrsError,
  } = useQuery({
    queryKey: ["nvrs", "edit-camera"],
    queryFn: () => fetchNVRs({ includeInactive: true, limit: 300 }),
  });

  const {
    data: camera,
    isLoading: cameraLoading,
    error: cameraError,
  } = useQuery({
    queryKey: ["camera", cameraId],
    queryFn: () => fetchJson<Camera>(`/api/cctv/cameras/${cameraId}`),
    enabled: Boolean(cameraId),
  });

  const isLoading = sitesLoading || nvrsLoading || cameraLoading;
  const pageError = sitesError || nvrsError || cameraError;

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading camera details"
        description="Fetching camera configuration for editing."
      />
    );
  }

  if (pageError || !camera) {
    return (
      <StatusState
        variant="error"
        title="Unable to load camera"
        description={getApiErrorMessage(pageError || "Camera not found")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Edit Camera"
        purpose="Update camera mapping, capabilities, and operational status."
        nextStep="Save changes to return to the camera list with highlight."
      />
      <CameraForm
        mode="edit"
        sites={sites || []}
        nvrs={nvrsData?.data || []}
        initialValue={camera}
      />
    </div>
  );
}
