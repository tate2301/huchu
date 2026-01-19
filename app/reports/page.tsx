import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

export default function ReportsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-700 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-gray-600 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Reports</h1>
              <p className="text-gray-200 text-sm">Export PDFs, CSV, audit packs</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Export & Reports</CardTitle>
            <CardDescription>Generate reports for any date range</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Features: Daily/weekly/monthly reports, PDF exports, CSV downloads, 
              WhatsApp-friendly summaries, audit pack generation.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
