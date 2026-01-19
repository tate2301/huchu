import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SystemStatus } from "@/components/status/system-status";
import { ArrowLeft } from "lucide-react";

export default function StatusPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" className="text-blue-600 bg-white hover:bg-blue-50">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Implementation Status</h1>
              <p className="text-blue-100 text-sm md:text-base mt-1">System Development Progress</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <SystemStatus />
      </main>
    </div>
  );
}
