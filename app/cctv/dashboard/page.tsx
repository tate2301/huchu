"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchCameras, fetchNVRs, fetchCCTVEvents, fetchSites } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { StatusState } from "@/components/shared/status-state"
import { DashboardView } from "../views/dashboard"

export default function DashboardPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("")

  // Fetch sites for filtering
  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  // Fetch stats for dashboard
  const { data: camerasData, isLoading: camerasLoading, error: camerasError } = useQuery({
    queryKey: ["cameras", selectedSiteId],
    queryFn: () => fetchCameras({ siteId: selectedSiteId || undefined, limit: 100 }),
  })

  const { data: nvrsData, isLoading: nvrsLoading, error: nvrsError } = useQuery({
    queryKey: ["nvrs", selectedSiteId],
    queryFn: () => fetchNVRs({ siteId: selectedSiteId || undefined }),
  })

  const { data: eventsData, isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ["cctv-events", selectedSiteId],
    queryFn: () => fetchCCTVEvents({ isAcknowledged: false, limit: 10 }),
  })

  const cameras = camerasData?.data || []
  const nvrs = nvrsData?.data || []
  const selectedSiteName = sites?.find((site) => site.id === selectedSiteId)?.name
  const allEvents = eventsData?.data || []
  const events =
    selectedSiteId && selectedSiteName
      ? allEvents.filter((event) => event.camera?.site?.name === selectedSiteName)
      : allEvents
  const isLoading = sitesLoading || camerasLoading || nvrsLoading || eventsLoading
  const pageError = sitesError || camerasError || nvrsError || eventsError

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading CCTV dashboard"
        description="Getting cameras, NVRs, and security events."
      />
    )
  }

  if (pageError) {
    return (
      <StatusState
        variant="error"
        title="Unable to load CCTV dashboard"
        description={getApiErrorMessage(pageError)}
      />
    )
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
  )
}
