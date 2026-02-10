"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { NVRForm } from "@/components/cctv/nvr-form";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";

export default function CreateNVRPage() {
  const { data: sites, isLoading, error } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading NVR registration"
        description="Preparing site options and form defaults."
      />
    );
  }

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load NVR registration"
        description={getApiErrorMessage(error)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Register NVR"
        purpose="Add a recorder so cameras can be registered and streamed from the selected site."
        nextStep="Enter network and authentication details, then save."
      />
      <NVRForm mode="create" sites={sites || []} />
    </div>
  );
}
