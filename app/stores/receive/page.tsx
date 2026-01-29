"use client";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mockInventory } from "../mock-data";
import { StoresNavigation } from "../components/stores-navigation";

export default function ReceivePage() {
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageActions>
        <Link href="/stores/issue">
          <Button size="sm">
            <Minus className="h-4 w-4" />
            Issue Stock
          </Button>
        </Link>
        <Link href="/stores/receive">
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4" />
            Receive Stock
          </Button>
        </Link>
      </PageActions>

      <PageHeading
        title="Receive Stock"
        description="Record new stock receipts"
      />

      <StoresNavigation />

      <Card>
        <CardHeader>
          <CardTitle>Receive Stock</CardTitle>
          <CardDescription>Record new stock receipts</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Date *
                </label>
                <Input
                  type="date"
                  defaultValue={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Site *
                </label>
                <Select defaultValue="site1">
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="site1">Mine Site 1</SelectItem>
                    <SelectItem value="site2">Mine Site 2</SelectItem>
                    <SelectItem value="site3">Mine Site 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Item *
                </label>
                <Select>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mockInventory.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} (Current: {item.currentStock} {item.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Quantity *
                </label>
                <Input type="number" placeholder="e.g., 1500" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Supplier *
                </label>
                <Input placeholder="Supplier name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Invoice/Delivery Number
                </label>
                <Input placeholder="e.g., INV-2401" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Unit Cost
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Cost per unit"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Received By *
                </label>
                <Input placeholder="Your name" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notes</label>
              <Textarea
                placeholder="Delivery notes, condition, etc..."
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <Button className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Submit Receipt
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => router.push("/stores")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
