"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/shared/field-help";
import { FormShell } from "@/components/shared/form-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";
import { goldRoutes } from "@/app/gold/routes";
import { Send, Shield } from "@/lib/icons";
import { SearchableSelect } from "@/app/gold/components/searchable-select";

export function PourForm({
  cancelHref,
  employees,
  employeesLoading,
  sites,
  sitesLoading,
}: {
  cancelHref?: string;
  employees: Array<{ id: string; name: string; employeeId: string }>;
  employeesLoading: boolean;
  sites: Array<{
    id: string;
    name: string;
    code: string;
    location?: string | null;
  }>;
  sitesLoading: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [formData, setFormData] = useState({
    pourDate: new Date().toISOString().slice(0, 16),
    siteId: "",
    grossWeight: "",
    estimatedPurity: "",
    witness1Id: "",
    witness2Id: "",
    storageLocation: "",
    notes: "",
  });

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const siteOptions = useMemo(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: site.name,
        description: site.location ?? undefined,
        meta: site.code,
      })),
    [sites],
  );
  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        meta: employee.employeeId,
      })),
    [employees],
  );

  const createPourMutation = useMutation({
    mutationFn: async (payload: {
      siteId: string;
      pourDate: string;
      grossWeight: number;
      estimatedPurity?: number;
      witness1Id: string;
      witness2Id: string;
      storageLocation: string;
      notes?: string;
    }) =>
      fetchJson<{ id: string; createdAt?: string }>("/api/gold/pours", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (pour, payload) => {
      toast({
        title: "Batch recorded",
        description: "Batch saved and ready for dispatch.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-pours"] });
      const destination = buildSavedRecordRedirect(goldRoutes.intake.pours, {
        createdId: pour.id,
        createdAt: pour.createdAt ?? payload.pourDate,
        source: "gold-pour",
      });
      router.push(destination);
    },
  });

  const grossWeightValue = Number(formData.grossWeight);
  const estimatedPurityValue = formData.estimatedPurity
    ? Number(formData.estimatedPurity)
    : undefined;
  const canSubmit =
    !!formData.pourDate &&
    !!formData.siteId &&
    !!formData.witness1Id &&
    !!formData.witness2Id &&
    !!formData.storageLocation &&
    grossWeightValue > 0 &&
    !Number.isNaN(grossWeightValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        title: "Missing details",
        description: "Fill all required pour details before saving.",
        variant: "destructive",
      });
      return;
    }
    if (formData.witness1Id === formData.witness2Id) {
      toast({
        title: "Witnesses must differ",
        description: "Select two different employees for witness validation.",
        variant: "destructive",
      });
      return;
    }
    createPourMutation.mutate({
      siteId: formData.siteId,
      pourDate: formData.pourDate,
      grossWeight: grossWeightValue,
      estimatedPurity: estimatedPurityValue,
      witness1Id: formData.witness1Id,
      witness2Id: formData.witness2Id,
      storageLocation: formData.storageLocation.trim(),
      notes: formData.notes?.trim() || undefined,
    });
  };

  return (
    <FormShell
      title="Batch Details"
      description="Capture all required fields for this gold batch."
      onSubmit={handleSubmit}
      formClassName="space-y-6"
      requiredHint="Fields marked * are required. Submitting redirects to the batches list with this record highlighted."
      errors={
        createPourMutation.error
          ? [getApiErrorMessage(createPourMutation.error)]
          : undefined
      }
      errorTitle="Unable to record batch"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(cancelHref ?? goldRoutes.intake.pours)}
            className="flex-1 sm:flex-none"
          >
            Back to Batches
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || createPourMutation.isPending}
            className="flex-1 sm:flex-none"
          >
            <Send className="mr-2 h-5 w-5" />
            {createPourMutation.isPending ? "Recording..." : "Save Batch"}
          </Button>
        </>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Batch Details</CardTitle>
          <CardDescription>
            Fill all required fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Batch ID</label>
              <Input
                value="Generated automatically when saved"
                readOnly
                aria-readonly="true"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Batch Date/Time *
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

          <SearchableSelect
            label="Site *"
            value={formData.siteId || undefined}
            options={siteOptions}
            placeholder={sitesLoading ? "Loading sites..." : "Select site"}
            searchPlaceholder="Search sites..."
            onValueChange={handleSelectChange("siteId")}
            onAddOption={() => {
              toast({
                title: "Add new site",
                description: "Sites are managed in admin settings.",
              });
            }}
            addLabel="Request new site"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">
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
              <FieldHelp hint="Capture the measured gross bar weight in grams." />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
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
              <FieldHelp hint="Optional estimated purity from internal checks." />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-yellow-600" />
              2-Person Witness Rule
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchableSelect
                label="Witness 1 *"
                value={formData.witness1Id || undefined}
                options={employeeOptions}
                placeholder={
                  employeesLoading ? "Loading employees..." : "Select employee"
                }
                searchPlaceholder="Search employees..."
                onValueChange={handleSelectChange("witness1Id")}
                onAddOption={() => {
                  router.push("/human-resources");
                }}
                addLabel="Add employee"
              />

              <SearchableSelect
                label="Witness 2 *"
                value={formData.witness2Id || undefined}
                options={employeeOptions}
                placeholder={
                  employeesLoading ? "Loading employees..." : "Select employee"
                }
                searchPlaceholder="Search employees..."
                onValueChange={handleSelectChange("witness2Id")}
                onAddOption={() => {
                  router.push("/human-resources");
                }}
                addLabel="Add employee"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
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
            <FieldHelp hint="Specify exact secure storage location for custody tracking." />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={2}
              placeholder="Additional observations..."
            />
            <FieldHelp hint="Optional notes for unusual conditions or context." />
          </div>
        </CardContent>
      </Card>
    </FormShell>
  );
}
