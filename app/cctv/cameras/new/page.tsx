"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchNVRs, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { CameraForm } from "@/components/cctv/camera-form";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";

export default function CreateCameraPage() {
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
    queryKey: ["nvrs", "active"],
    queryFn: () => fetchNVRs({ limit: 200 }),
  });

  const isLoading = sitesLoading || nvrsLoading;
  const pageError = sitesError || nvrsError;

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading camera registration"
        description="Preparing camera and recorder options."
      />
    );
  }

  if (pageError) {
    return (
      <StatusState
        variant="error"
        title="Unable to load camera registration"
        description={getApiErrorMessage(pageError)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Register Camera"
        purpose="Add a camera stream source and bind it to a recorder channel."
        nextStep="Choose site and NVR, map channel, then save."
      />
      <CameraForm mode="create" sites={sites || []} nvrs={nvrsData?.data || []} />
    </div>
  );
}
