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

export default function ReceiptFormPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    receiptNumber: "",
    dispatchId: "",
    receiptDate: new Date().toISOString().slice(0, 16),
    assayResult: "",
    paidAmount: "",
    paymentMethod: "BANK_TRANSFER",
    paymentChannel: "",
    paymentReference: "",
    notes: "",
  });

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Receipt recorded:", formData);
    alert(
      "Buyer receipt recorded successfully!\n\nReconciliation complete.\nPayment confirmed.",
    );
    router.push("/gold");
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeading title="Gold Control" description="Buyer Receipt" />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/gold")}
        >
          ← Back to Menu
        </Button>

        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong className="block mb-1">Payment Confirmation</strong>
                <p className="text-foreground">
                  Record final assay results and payment details to complete the
                  gold transaction cycle.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buyer Receipt</CardTitle>
            <CardDescription>
              Record assay and payment confirmation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Receipt Number *
                </label>
                <Input
                  value={formData.receiptNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, receiptNumber: e.target.value })
                  }
                  placeholder="e.g., RCP-2026-001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Dispatch ID *
                </label>
                <Select
                  name="dispatchId"
                  value={formData.dispatchId || undefined}
                  onValueChange={handleSelectChange("dispatchId")}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select dispatch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mockPours
                      .filter((p) => p.status === "dispatched")
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
                Receipt Date *
              </label>
              <Input
                type="datetime-local"
                value={formData.receiptDate}
                onChange={(e) =>
                  setFormData({ ...formData, receiptDate: e.target.value })
                }
                required
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Assay Results</h4>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Actual Purity/Fine Weight (grams) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.assayResult}
                  onChange={(e) =>
                    setFormData({ ...formData, assayResult: e.target.value })
                  }
                  placeholder="e.g., 42.35"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  After buyer's assay test
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Payment Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Payment Amount (USD) *
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.paidAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, paidAmount: e.target.value })
                    }
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Payment Method *
                  </label>
                  <Select
                    name="paymentMethod"
                    value={formData.paymentMethod}
                    onValueChange={handleSelectChange("paymentMethod")}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                      <SelectItem value="CRYPTO">Cryptocurrency</SelectItem>
                      <SelectItem value="CHECK">Check</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Payment Channel
                  </label>
                  <Input
                    value={formData.paymentChannel}
                    onChange={(e) =>
                      setFormData({ ...formData, paymentChannel: e.target.value })
                    }
                    placeholder="e.g., Standard Bank, EcoCash"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Payment Reference
                  </label>
                  <Input
                    value={formData.paymentReference}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        paymentReference: e.target.value,
                      })
                    }
                    placeholder="Transaction ID or reference"
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
                placeholder="Additional payment notes..."
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" size="lg">
          <Send className="mr-2 h-5 w-5" />
          Confirm Receipt & Payment
        </Button>
      </form>
    </div>
  );
}
