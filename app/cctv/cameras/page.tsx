"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchSites } from "@/lib/api"
import { CamerasView } from "../views/cameras"

export default function CamerasPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("")

  // Fetch sites for filtering
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  return (
    <CamerasView 
      sites={sites || []}
      selectedSiteId={selectedSiteId}
      onSiteChange={setSelectedSiteId}
    />
  )
}
