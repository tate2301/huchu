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
import { Minus, Plus, Home, Package, Fuel } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mockInventory } from "../mock-data";

export default function IssuePage() {
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
        title="Issue Stock"
        description="Issue items to equipment or sections"
      />

      <div className="flex flex-wrap gap-2 border-b pb-2">
        <Link href="/stores">
          <Button variant="outline" size="sm" className="gap-2">
            <Home className="size-5" />
            Overview
          </Button>
        </Link>
        <Link href="/stores/inventory">
          <Button variant="outline" size="sm" className="gap-2">
            <Package className="size-5" />
            Stock on Hand
          </Button>
        </Link>
        <Link href="/stores/fuel">
          <Button variant="outline" size="sm" className="gap-2">
            <Fuel className="size-5" />
            Fuel Ledger
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Issue Stock</CardTitle>
          <CardDescription>
            Issue items to equipment or sections
          </CardDescription>
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
                        {item.name} ({item.currentStock} {item.unit} available)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Quantity *
                </label>
                <Input type="number" placeholder="e.g., 50" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Issued To (Equipment/Section) *
                </label>
                <Input placeholder="e.g., Generator 1, Mill Section" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Requested By *
                </label>
                <Input placeholder="Name or shift" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Approved By
              </label>
              <Input placeholder="Supervisor or manager name" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notes</label>
              <Textarea
                placeholder="Additional information about this issue..."
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <Button className="bg-orange-600 hover:bg-orange-700">
                Submit Issue
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
