import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-indigo-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Analytics Dashboard</h1>
              <p className="text-indigo-100 text-sm">Cross-mine insights - Phase 6</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Coming in Phase 6</CardTitle>
            <CardDescription>Management dashboards and analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Features: Production trends across 5 sites, downtime analysis, fuel usage tracking, 
              cost per gram calculations, safety metrics.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
