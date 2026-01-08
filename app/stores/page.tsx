import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Package, Fuel, AlertTriangle } from "lucide-react"

export default function StoresPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-orange-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-orange-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Stores & Fuel</h1>
              <p className="text-orange-100 text-sm">Inventory management - Phase 4</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Coming in Phase 4</CardTitle>
            <CardDescription>Stores, fuel ledger, and inventory tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 border rounded-lg">
                <Package className="h-8 w-8 text-orange-600" />
                <div>
                  <div className="font-medium">Stock on Hand</div>
                  <div className="text-sm text-gray-600">Current inventory</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 border rounded-lg">
                <Fuel className="h-8 w-8 text-orange-600" />
                <div>
                  <div className="font-medium">Fuel Ledger</div>
                  <div className="text-sm text-gray-600">Track diesel usage</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 border rounded-lg">
                <AlertTriangle className="h-8 w-8 text-orange-600" />
                <div>
                  <div className="font-medium">Reorder Alerts</div>
                  <div className="text-sm text-gray-600">Low stock warnings</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
