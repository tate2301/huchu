import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-teal-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Compliance</h1>
              <p className="text-teal-100 text-sm">Permits, inspections, incidents - Phase 5</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Coming in Phase 5</CardTitle>
            <CardDescription>Safety, environmental, and regulatory compliance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Features: Permit calendar with expiry alerts, incident reporting with photos, 
              training matrix, inspection logs, audit pack exports.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
