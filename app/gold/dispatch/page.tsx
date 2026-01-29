"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Shield } from "lucide-react";
import { mockPours } from "../mock-data";

export default function DispatchFormPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    dispatchId: `DS-${Date.now().toString().slice(-6)}`,
    pourBarId: "",
    dispatchDate: new Date().toISOString().slice(0, 16),
    courier: "",
    vehicle: "",
    destination: "",
    sealNumbers: "",
    handedOverBy: "",
    receivedBy: "",
    notes: "",
  });

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Dispatch recorded:", formData);
    alert(
      "Dispatch manifest created successfully!\n\nChain of custody established.\nBoth parties notified.",
    );
    router.push("/gold");
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeading title="Gold Control" description="Dispatch Manifest" />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/gold")}
        >
          ← Back to Menu
        </Button>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong className="block mb-1">Chain of Custody</strong>
                <p className="text-foreground">
                  This manifest creates an immutable record of gold transfer. Both
                  sender and receiver signatures required.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dispatch Details</CardTitle>
            <CardDescription>
              All fields required for dispatch manifest
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Dispatch ID *
                </label>
                <Input
                  value={formData.dispatchId}
                  onChange={(e) =>
                    setFormData({ ...formData, dispatchId: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Pour/Bar ID *
                </label>
                <Select
                  name="pourBarId"
                  value={formData.pourBarId || undefined}
                  onValueChange={handleSelectChange("pourBarId")}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select pour..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mockPours
                      .filter((p) => p.status === "in-storage")
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.id} ({p.weight}g)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Dispatch Date/Time *
              </label>
              <Input
                type="datetime-local"
                value={formData.dispatchDate}
                onChange={(e) =>
                  setFormData({ ...formData, dispatchDate: e.target.value })
                }
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Courier/Company *
                </label>
                <Input
                  value={formData.courier}
                  onChange={(e) =>
                    setFormData({ ...formData, courier: e.target.value })
                  }
                  placeholder="e.g., SecureTransit Ltd"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Vehicle/Registration
                </label>
                <Input
                  value={formData.vehicle}
                  onChange={(e) =>
                    setFormData({ ...formData, vehicle: e.target.value })
                  }
                  placeholder="e.g., ABC-1234"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Destination *
              </label>
              <Input
                value={formData.destination}
                onChange={(e) =>
                  setFormData({ ...formData, destination: e.target.value })
                }
                placeholder="Buyer name and address"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Seal Numbers *
              </label>
              <Input
                value={formData.sealNumbers}
                onChange={(e) =>
                  setFormData({ ...formData, sealNumbers: e.target.value })
                }
                placeholder="e.g., S-12345, S-12346"
                required
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Handover Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Handed Over By *
                  </label>
                  <Input
                    value={formData.handedOverBy}
                    onChange={(e) =>
                      setFormData({ ...formData, handedOverBy: e.target.value })
                    }
                    placeholder="Your name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Received By
                  </label>
                  <Input
                    value={formData.receivedBy}
                    onChange={(e) =>
                      setFormData({ ...formData, receivedBy: e.target.value })
                    }
                    placeholder="Courier name"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={2}
                placeholder="Additional dispatch notes..."
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" size="lg">
          <Send className="mr-2 h-5 w-5" />
          Create Dispatch Manifest
        </Button>
      </form>
    </div>
  );
}
