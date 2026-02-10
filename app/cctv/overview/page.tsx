"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchCameras, fetchCCTVEvents, fetchNVRs, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { StatusState } from "@/components/shared/status-state";
import { DashboardView } from "@/app/cctv/views/dashboard";

export default function CCTVOverviewPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const {
    data: camerasData,
    isLoading: camerasLoading,
    error: camerasError,
  } = useQuery({
    queryKey: ["cameras", "overview", selectedSiteId],
    queryFn: () =>
      fetchCameras({
        siteId: selectedSiteId || undefined,
        limit: 100,
      }),
  });

  const {
    data: nvrsData,
    isLoading: nvrsLoading,
    error: nvrsError,
  } = useQuery({
    queryKey: ["nvrs", "overview", selectedSiteId],
    queryFn: () => fetchNVRs({ siteId: selectedSiteId || undefined, limit: 100 }),
  });

  const {
    data: eventsData,
    isLoading: eventsLoading,
    error: eventsError,
  } = useQuery({
    queryKey: ["cctv-events", "overview", selectedSiteId],
    queryFn: () =>
      fetchCCTVEvents({
        siteId: selectedSiteId || undefined,
        isAcknowledged: false,
        limit: 20,
      }),
  });

  const cameras = camerasData?.data || [];
  const nvrs = nvrsData?.data || [];
  const events = eventsData?.data || [];
  const isLoading = sitesLoading || camerasLoading || nvrsLoading || eventsLoading;
  const pageError = sitesError || camerasError || nvrsError || eventsError;

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading CCTV overview"
        description="Getting camera, recorder, and event status."
      />
    );
  }

  if (pageError) {
    return (
      <StatusState
        variant="error"
        title="Unable to load CCTV overview"
        description={getApiErrorMessage(pageError)}
      />
    );
  }

  return (
    <DashboardView
      cameras={cameras}
      nvrs={nvrs}
      events={events}
      sites={sites || []}
      selectedSiteId={selectedSiteId}
      onSiteChange={setSelectedSiteId}
    />
  );
}
