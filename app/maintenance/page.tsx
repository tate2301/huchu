import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-red-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-red-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Maintenance</h1>
              <p className="text-red-100 text-sm">Equipment and work orders - Phase 4</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Coming in Phase 4</CardTitle>
            <CardDescription>Equipment register, breakdowns, preventive maintenance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Features: Equipment tracking with QR codes, breakdown logging, work orders, 
              preventive maintenance schedules.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
