"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchCameras, fetchNVRs, fetchCCTVEvents, fetchSites } from "@/lib/api"
import { DashboardView } from "../views/dashboard"

export default function DashboardPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("")

  // Fetch sites for filtering
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  // Fetch stats for dashboard
  const { data: camerasData } = useQuery({
    queryKey: ["cameras", selectedSiteId],
    queryFn: () => fetchCameras({ siteId: selectedSiteId || undefined, limit: 100 }),
  })

  const { data: nvrsData } = useQuery({
    queryKey: ["nvrs", selectedSiteId],
    queryFn: () => fetchNVRs({ siteId: selectedSiteId || undefined }),
  })

  const { data: eventsData } = useQuery({
    queryKey: ["cctv-events", selectedSiteId],
    queryFn: () => fetchCCTVEvents({ isAcknowledged: false, limit: 10 }),
  })

  const cameras = camerasData?.data || []
  const nvrs = nvrsData?.data || []
  const events = eventsData?.data || []

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
