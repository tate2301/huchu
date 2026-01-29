"use client"

import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { 
  Video, 
  Camera as CameraIcon, 
  AlertCircle, 
  Server,
  Grid3x3,
  Activity,
  Plus,
} from "lucide-react"

import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchCameras, fetchNVRs, fetchCCTVEvents, fetchSites } from "@/lib/api"

import { DashboardView } from "./views/dashboard"
import { CamerasView } from "./views/cameras"
import { EventsView } from "./views/events"
import { NVRsView } from "./views/nvrs"

const cctvViews = ["dashboard", "cameras", "events", "nvrs"] as const
type CCTVView = (typeof cctvViews)[number]

export default function CCTVPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const viewParam = searchParams.get("view")
  const initialView = cctvViews.includes(viewParam as CCTVView)
    ? (viewParam as CCTVView)
    : "dashboard"

  const [activeView, setActiveView] = useState<CCTVView>(initialView)
  const [selectedSiteId, setSelectedSiteId] = useState<string>("")

  const changeView = (view: CCTVView) => {
    setActiveView(view)
    const params = new URLSearchParams(searchParams.toString())
    params.set("view", view)
    router.replace(`/cctv?${params.toString()}`)
  }

  // Fetch sites for filtering
  const { data: sites, isLoading: sitesLoading } = useQuery({
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
    <div className="mx-auto w-full space-y-6">
      <PageHeading 
        title="CCTV Surveillance" 
        description="Monitor cameras, review events, and manage security systems"
      >
        <PageActions>
          {activeView === "cameras" && (
            <Button onClick={() => changeView("cameras")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Camera
            </Button>
          )}
          {activeView === "nvrs" && (
            <Button onClick={() => changeView("nvrs")}>
              <Plus className="mr-2 h-4 w-4" />
              Add NVR
            </Button>
          )}
        </PageActions>
      </PageHeading>

      <Tabs value={activeView} onValueChange={(v) => changeView(v as CCTVView)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">
            <Grid3x3 className="mr-2 h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="cameras">
            <CameraIcon className="mr-2 h-4 w-4" />
            Cameras
          </TabsTrigger>
          <TabsTrigger value="events">
            <AlertCircle className="mr-2 h-4 w-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="nvrs">
            <Server className="mr-2 h-4 w-4" />
            NVRs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 mt-6">
          <DashboardView 
            cameras={cameras}
            nvrs={nvrs}
            events={events}
            sites={sites || []}
            selectedSiteId={selectedSiteId}
            onSiteChange={setSelectedSiteId}
          />
        </TabsContent>

        <TabsContent value="cameras" className="space-y-4 mt-6">
          <CamerasView 
            sites={sites || []}
            selectedSiteId={selectedSiteId}
            onSiteChange={setSelectedSiteId}
          />
        </TabsContent>

        <TabsContent value="events" className="space-y-4 mt-6">
          <EventsView 
            sites={sites || []}
            selectedSiteId={selectedSiteId}
            onSiteChange={setSelectedSiteId}
          />
        </TabsContent>

        <TabsContent value="nvrs" className="space-y-4 mt-6">
          <NVRsView 
            sites={sites || []}
            selectedSiteId={selectedSiteId}
            onSiteChange={setSelectedSiteId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
