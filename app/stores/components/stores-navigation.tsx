import { Button } from "@/components/ui/button";
import { Home, Package, Fuel } from "lucide-react";
import Link from "next/link";

type ActiveView = "overview" | "inventory" | "fuel" | null;

interface StoresNavigationProps {
  activeView?: ActiveView;
}

export function StoresNavigation({ activeView }: StoresNavigationProps) {
  return (
    <div className="flex flex-wrap gap-2 border-b pb-2">
      <Link href="/stores">
        <Button
          variant={activeView === "overview" ? "default" : "outline"}
          size="sm"
          className="gap-2"
        >
          <Home className="size-5" />
          Overview
        </Button>
      </Link>
      <Link href="/stores/inventory">
        <Button
          variant={activeView === "inventory" ? "default" : "outline"}
          size="sm"
          className="gap-2"
        >
          <Package className="size-5" />
          Stock on Hand
        </Button>
      </Link>
      <Link href="/stores/fuel">
        <Button
          variant={activeView === "fuel" ? "default" : "outline"}
          size="sm"
          className="gap-2"
        >
          <Fuel className="size-5" />
          Fuel Ledger
        </Button>
      </Link>
    </div>
  );
}
