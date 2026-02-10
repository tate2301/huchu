"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { NVR, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { NVRForm } from "@/components/cctv/nvr-form";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";

export default function EditNVRPage() {
  const params = useParams<{ id: string }>();
  const nvrId = params.id;

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const {
    data: nvr,
    isLoading: nvrLoading,
    error: nvrError,
  } = useQuery({
    queryKey: ["nvr", nvrId],
    queryFn: () => fetchJson<NVR>(`/api/cctv/nvrs/${nvrId}`),
    enabled: Boolean(nvrId),
  });

  const isLoading = sitesLoading || nvrLoading;
  const pageError = sitesError || nvrError;

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading NVR details"
        description="Fetching recorder configuration for editing."
      />
    );
  }

  if (pageError || !nvr) {
    return (
      <StatusState
        variant="error"
        title="Unable to load NVR"
        description={getApiErrorMessage(pageError || "NVR not found")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Edit NVR"
        purpose="Update recorder network settings and stream integration options."
        nextStep="Apply changes and return to the NVR list."
      />
      <NVRForm mode="edit" sites={sites || []} initialValue={nvr} />
    </div>
  );
}
