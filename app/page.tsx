import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { 
  ClipboardList, 
  Factory, 
  Coins, 
  Package, 
  Wrench, 
  Shield,
  Users,
  BarChart3,
  FileText,
  ChevronRight,
  Activity,
  LogOut
} from "lucide-react";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Huchu Enterprises</h1>
              <p className="text-blue-100 text-sm md:text-base mt-1">Mine Operations System</p>
            </div>
            <div className="flex items-center gap-3">
              {session ? (
                <>
                  <div className="hidden md:block text-right mr-2">
                    <div className="text-sm font-medium">{session.user?.name}</div>
                    <div className="text-xs text-blue-200">{(session.user as any)?.role}</div>
                  </div>
                  <Link href="/api/auth/signout">
                    <Button variant="outline" className="text-blue-600 bg-white hover:bg-blue-50">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </Link>
                </>
              ) : (
                <Link href="/login">
                  <Button variant="outline" className="text-blue-600 bg-white hover:bg-blue-50">
                    <Users className="mr-2 h-4 w-4" />
                    Login
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Implementation Status Link */}
        <Link href="/status">
          <Card className="mb-8 cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="h-8 w-8 text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-lg">View Implementation Status</h3>
                    <p className="text-sm text-gray-600">Track progress across all 6 phases</p>
                  </div>
                </div>
                <ChevronRight className="h-6 w-6 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Active Sites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">5</div>
              <p className="text-xs text-gray-500 mt-1">All operational</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Today's Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
              <p className="text-xs text-gray-500 mt-1">Pending submission</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Gold Poured (Week)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0g</div>
              <p className="text-xs text-gray-500 mt-1">No pours yet</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">✓</div>
              <p className="text-xs text-gray-500 mt-1">All systems operational</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Modules */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Daily Operations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Shift Report */}
            <Link href="/shift-report">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <ClipboardList className="h-8 w-8 text-blue-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Shift Report</CardTitle>
                  <CardDescription>
                    2-minute daily shift entry - ore moved, crew, downtime
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            {/* Attendance */}
            <Link href="/attendance">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Users className="h-8 w-8 text-green-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Attendance</CardTitle>
                  <CardDescription>
                    Daily crew attendance tracking and overtime
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            {/* Plant Report */}
            <Link href="/plant-report">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Factory className="h-8 w-8 text-purple-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Plant Report</CardTitle>
                  <CardDescription>
                    Processing, tonnes fed, run hours, consumables
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        {/* High-Value Modules */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Gold & Assets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Gold Control */}
            <Link href="/gold">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-yellow-200 bg-yellow-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Coins className="h-8 w-8 text-yellow-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Gold Control</CardTitle>
                  <CardDescription>
                    Pours, dispatch, receipts - full audit trail
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            {/* Stores */}
            <Link href="/stores">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Package className="h-8 w-8 text-orange-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Stores & Fuel</CardTitle>
                  <CardDescription>
                    Inventory, fuel ledger, reorder alerts
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            {/* Maintenance */}
            <Link href="/maintenance">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Wrench className="h-8 w-8 text-red-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Maintenance</CardTitle>
                  <CardDescription>
                    Equipment, breakdowns, preventive schedule
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        {/* Management & Compliance */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Management & Compliance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Analytics - NEW FOR PHASE 2 */}
            <Link href="/analytics">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-indigo-200 bg-indigo-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <BarChart3 className="h-8 w-8 text-indigo-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Downtime Analytics</CardTitle>
                  <CardDescription>
                    Phase 2: Top causes by site, trends (NEW!)
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            {/* Dashboards */}
            <Link href="/dashboard">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <BarChart3 className="h-8 w-8 text-indigo-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Production Dashboard</CardTitle>
                  <CardDescription>
                    Cross-mine production, costs, trends
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            {/* Compliance */}
            <Link href="/compliance">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Shield className="h-8 w-8 text-teal-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Compliance</CardTitle>
                  <CardDescription>
                    Permits, inspections, incidents, training
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            {/* Reports */}
            <Link href="/reports">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <FileText className="h-8 w-8 text-gray-600" />
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle className="mt-4">Reports</CardTitle>
                  <CardDescription>
                    Export PDFs, CSV, audit packs
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        {/* Getting Started Guide */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle>🚀 Getting Started</CardTitle>
            <CardDescription>
              Welcome to Huchu Mine Operations System
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              <strong>Phase 1 - Daily Heartbeat:</strong> Start with shift reports and attendance at one pilot site.
            </p>
            <p className="text-sm">
              <strong>Quick Tips:</strong>
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside text-gray-600">
              <li>All forms are mobile-first and work offline</li>
              <li>Reports follow submit → verify → approve workflow</li>
              <li>Touch the module cards above to get started</li>
              <li>Data syncs automatically when back online</li>
            </ul>
            <div className="pt-4">
              <Button className="w-full md:w-auto">
                <ClipboardList className="mr-2 h-4 w-4" />
                Enter Your First Shift Report
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600">
          <p>Huchu Enterprises Mine Operations System</p>
          <p className="mt-1">Built for 5 gold mines in Zimbabwe • Phase 1: Daily Operations</p>
        </div>
      </footer>
    </div>
  );
}
