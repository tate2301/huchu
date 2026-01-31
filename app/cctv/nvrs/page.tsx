"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchSites } from "@/lib/api"
import { NVRsView } from "../views/nvrs"

export default function NVRsPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("")

  // Fetch sites for filtering
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  return (
    <NVRsView 
      sites={sites || []}
      selectedSiteId={selectedSiteId}
      onSiteChange={setSelectedSiteId}
    />
  )
}
