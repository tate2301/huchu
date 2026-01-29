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

export default function PourFormPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    pourBarId: `PB-${Date.now().toString().slice(-6)}`,
    pourDate: new Date().toISOString().slice(0, 16),
    site: "",
    grossWeight: "",
    estimatedPurity: "",
    witness1: "",
    witness2: "",
    storageLocation: "",
    notes: "",
  });

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Pour recorded:", formData);
    alert(
      "Pour recorded successfully!\n\nIn production:\n- Immutable record created\n- Witnesses notified\n- Audit log entry added",
    );
    router.push("/gold");
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeading title="Gold Control" description="Record Pour" />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/gold")}
        >
          ← Back to Menu
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Pour Details</CardTitle>
            <CardDescription>
              All fields required for gold pour record
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Pour/Bar ID *
                </label>
                <Input
                  value={formData.pourBarId}
                  onChange={(e) =>
                    setFormData({ ...formData, pourBarId: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Pour Date/Time *
                </label>
                <Input
                  type="datetime-local"
                  value={formData.pourDate}
                  onChange={(e) =>
                    setFormData({ ...formData, pourDate: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Site *</label>
              <Select
                name="site"
                value={formData.site || undefined}
                onValueChange={handleSelectChange("site")}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select site..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="site1">Mine Site 1</SelectItem>
                  <SelectItem value="site2">Mine Site 2</SelectItem>
                  <SelectItem value="site3">Mine Site 3</SelectItem>
                  <SelectItem value="site4">Mine Site 4</SelectItem>
                  <SelectItem value="site5">Mine Site 5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Gross Weight (grams) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.grossWeight}
                  onChange={(e) =>
                    setFormData({ ...formData, grossWeight: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Estimated Purity (%)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  max="100"
                  value={formData.estimatedPurity}
                  onChange={(e) =>
                    setFormData({ ...formData, estimatedPurity: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-yellow-600" />
                2-Person Witness Rule
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Witness 1 *
                  </label>
                  <Input
                    value={formData.witness1}
                    onChange={(e) =>
                      setFormData({ ...formData, witness1: e.target.value })
                    }
                    placeholder="Full name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Witness 2 *
                  </label>
                  <Input
                    value={formData.witness2}
                    onChange={(e) =>
                      setFormData({ ...formData, witness2: e.target.value })
                    }
                    placeholder="Full name"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Storage Location *
              </label>
              <Input
                value={formData.storageLocation}
                onChange={(e) =>
                  setFormData({ ...formData, storageLocation: e.target.value })
                }
                placeholder="e.g., Safe 1, Vault A"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={2}
                placeholder="Additional observations..."
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" size="lg">
          <Send className="mr-2 h-5 w-5" />
          Record Pour (Immutable)
        </Button>
      </form>
    </div>
  );
}
