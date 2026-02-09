"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { 
  Camera as CameraIcon, 
  AlertCircle, 
  Server,
  Grid3x3,
  Plus,
} from "lucide-react"

import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function CCTVLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  
  // Determine active tab from pathname
  const getActiveTab = () => {
    if (pathname.includes("/cameras")) return "cameras"
    if (pathname.includes("/events")) return "events"
    if (pathname.includes("/nvrs")) return "nvrs"
    return "dashboard"
  }

  const activeView = getActiveTab()

  return (
    <div className="mx-auto w-full space-y-6">
      <PageHeading 
        title="CCTV Surveillance" 
        description="Monitor cameras, review events, and manage security systems"
      >
        <PageActions>
          {activeView === "cameras" && (
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Camera
            </Button>
          )}
          {activeView === "nvrs" && (
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add NVR
            </Button>
          )}
        </PageActions>
      </PageHeading>

      <Tabs value={activeView} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard" asChild>
            <Link href="/cctv/dashboard">
              <Grid3x3 className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </TabsTrigger>
          <TabsTrigger value="cameras" asChild>
            <Link href="/cctv/cameras">
              <CameraIcon className="mr-2 h-4 w-4" />
              Cameras
            </Link>
          </TabsTrigger>
          <TabsTrigger value="events" asChild>
            <Link href="/cctv/events">
              <AlertCircle className="mr-2 h-4 w-4" />
              Events
            </Link>
          </TabsTrigger>
          <TabsTrigger value="nvrs" asChild>
            <Link href="/cctv/nvrs">
              <Server className="mr-2 h-4 w-4" />
              NVRs
            </Link>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {children}
        </div>
      </Tabs>
    </div>
  )
}
