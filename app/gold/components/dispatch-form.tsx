"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormShell } from "@/components/shared/form-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";
import { goldRoutes } from "@/app/gold/routes";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import { Send, ChevronDown } from "@/lib/icons";

type AvailablePour = {
  id: string;
  pourBarId: string;
  batchCode?: string;
  grossWeight: number;
  valueUsd?: number | null;
  site: { name: string; code: string };
  dispatchCount: number;
};

const STICKY_DEFAULTS = {
  courier: "",
  vehicle: "",
  destination: "",
  sealNumbers: "",
  handedOverById: "",
  receivedBy: "",
};

export function DispatchForm({
  cancelHref,
  newBatchHref,
  employees,
  employeesLoading,
  availablePours,
  mode = "page",
  onSuccess,
  onCancel,
  redirectOnSuccess,
}: {
  cancelHref?: string;
  newBatchHref?: string;
  employees: Array<{ id: string; name: string; employeeId: string }>;
  employeesLoading: boolean;
  availablePours: AvailablePour[];
  mode?: "page" | "modal";
  onSuccess?: () => void;
  onCancel?: () => void;
  redirectOnSuccess?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const shouldRedirect = redirectOnSuccess ?? mode === "page";
  const [quickEntry, setQuickEntry] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [siteFilter, setSiteFilter] = useState<string>("");
  const [batchSearch, setBatchSearch] = useState("");
  const [formData, setFormData] = useState({
    goldPourIds: [] as string[],
    dispatchDate: (() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); })(),
    overrideReason: "",
    notes: "",
    ...STICKY_DEFAULTS,
  });

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        meta: employee.employeeId,
      })),
    [employees],
  );

  const siteOptions = useMemo(() => {
    const seen = new Map<string, { name: string; code: string }>();
    availablePours.forEach((pour) => {
      if (!seen.has(pour.site.code)) seen.set(pour.site.code, pour.site);
    });
    return Array.from(seen.entries()).map(([code, site]) => ({
      value: code,
      label: site.name,
      meta: code,
    }));
  }, [availablePours]);

  const filteredPours = useMemo(() => {
    const needle = batchSearch.trim().toLowerCase();
    return availablePours.filter((pour) => {
      if (siteFilter && pour.site.code !== siteFilter) return false;
      if (needle) {
        const code = (pour.batchCode ?? pour.pourBarId).toLowerCase();
        if (!code.includes(needle) && !pour.site.name.toLowerCase().includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [availablePours, siteFilter, batchSearch]);

  const togglePour = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      goldPourIds: prev.goldPourIds.includes(id)
        ? prev.goldPourIds.filter((existing) => existing !== id)
        : [...prev.goldPourIds, id],
    }));
  };

  const selectAllVisible = () => {
    setFormData((prev) => ({
      ...prev,
      goldPourIds: Array.from(
        new Set([...prev.goldPourIds, ...filteredPours.map((pour) => pour.id)]),
      ),
    }));
  };

  const clearSelected = () => {
    setFormData((prev) => ({ ...prev, goldPourIds: [] }));
  };

  const selectedPours = useMemo(
    () =>
      formData.goldPourIds
        .map((id) => availablePours.find((pour) => pour.id === id))
        .filter((pour): pour is AvailablePour => Boolean(pour)),
    [formData.goldPourIds, availablePours],
  );
  const totalWeight = selectedPours.reduce((sum, pour) => sum + pour.grossWeight, 0);
  const totalValue = selectedPours.reduce((sum, pour) => sum + (pour.valueUsd ?? 0), 0);
  const requiresOverrideReason = selectedPours.some((pour) => pour.dispatchCount > 0);

  const createDispatchMutation = useMutation({
    mutationFn: async (payload: {
      goldPourIds: string[];
      dispatchDate: string;
      courier: string;
      vehicle?: string;
      destination: string;
      sealNumbers: string;
      handedOverById: string;
      receivedBy?: string;
      overrideReason?: string;
      notes?: string;
    }) =>
      fetchJson<{ id: string; createdAt?: string; warnings?: string[] }>("/api/gold/dispatches", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (dispatch, payload) => {
      toast({
        title: `Dispatch recorded (${payload.goldPourIds.length} batch${payload.goldPourIds.length === 1 ? "" : "es"})`,
        description:
          dispatch.warnings && dispatch.warnings.length > 0
            ? dispatch.warnings[0]
            : "Dispatch saved successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["gold-pours"] });
      onSuccess?.();
      if (quickEntry && mode === "modal") {
        // Keep logistics fields, reset batch selection + override reason for the next entry.
        setFormData((prev) => ({
          ...prev,
          goldPourIds: [],
          overrideReason: "",
          notes: "",
        }));
        return;
      }
      if (shouldRedirect) {
        const destination = buildSavedRecordRedirect(goldRoutes.transit.dispatches, {
          createdId: dispatch.id,
          createdAt: dispatch.createdAt ?? payload.dispatchDate,
          source: "gold-dispatch",
        });
        router.push(destination);
      }
    },
  });

  const canSubmit =
    formData.goldPourIds.length > 0 &&
    !!formData.dispatchDate &&
    !!formData.courier &&
    !!formData.destination &&
    !!formData.sealNumbers &&
    !!formData.handedOverById &&
    (!requiresOverrideReason || !!formData.overrideReason.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        title: "Missing details",
        description:
          formData.goldPourIds.length === 0
            ? "Select at least one batch."
            : "Fill all required dispatch fields before saving.",
        variant: "destructive",
      });
      return;
    }
    createDispatchMutation.mutate({
      goldPourIds: formData.goldPourIds,
      dispatchDate: formData.dispatchDate,
      courier: formData.courier.trim(),
      vehicle: formData.vehicle?.trim() || undefined,
      destination: formData.destination.trim(),
      sealNumbers: formData.sealNumbers.trim(),
      handedOverById: formData.handedOverById,
      receivedBy: formData.receivedBy?.trim() || undefined,
      overrideReason: formData.overrideReason?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
    });
  };

  return (
    <FormShell
      variant={mode === "modal" ? "bare" : "page"}
      title={mode === "modal" ? undefined : "Record Dispatch"}
      onSubmit={handleSubmit}
      formClassName="space-y-5"
      requiredHint="Pick batches, courier, destination, seal, handover. Vehicle and notes are optional."
      errors={
        createDispatchMutation.error
          ? [getApiErrorMessage(createDispatchMutation.error)]
          : undefined
      }
      errorTitle="Unable to record dispatch"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (mode === "modal") {
                onCancel?.();
                return;
              }
              router.push(cancelHref ?? goldRoutes.transit.dispatches);
            }}
            className="flex-1 sm:flex-none"
          >
            {mode === "modal" ? "Cancel" : "Back to Dispatches"}
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || createDispatchMutation.isPending}
            className="flex-1 sm:flex-none"
          >
            <Send className="mr-2 h-5 w-5" />
            {createDispatchMutation.isPending
              ? "Recording..."
              : `Save Dispatch${formData.goldPourIds.length > 1 ? ` (${formData.goldPourIds.length})` : ""}`}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Pick the batches travelling together. Logistics apply to the whole trip.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="dispatch-quick-entry"
            checked={quickEntry}
            onCheckedChange={(checked) => setQuickEntry(checked === true)}
          />
          <label htmlFor="dispatch-quick-entry" className="text-sm font-medium cursor-pointer">
            Backfill mode: keep logistics fields after save
          </label>
        </div>
        <span className="text-xs text-muted-foreground">
          For ledger backfill: courier, vehicle, destination & handover stay filled in.
        </span>
      </div>

      <div className="space-y-4">
        {availablePours.length === 0 ? (
          <Alert>
            <AlertTitle>No batches ready for dispatch</AlertTitle>
            <AlertDescription>
              Record a batch before creating a dispatch.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold">
                Batches * ({formData.goldPourIds.length} selected, {Number(totalWeight).toFixed(3)} g, ${Number(totalValue).toFixed(2)})
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-xs text-primary hover:underline"
                >
                  Select all visible
                </button>
                {formData.goldPourIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearSelected}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    router.push(newBatchHref ?? goldRoutes.intake.newPour)
                  }
                  className="text-xs text-primary hover:underline"
                >
                  + New batch
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
              <Input
                autoFocus
                placeholder="Search batches..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
              />
              <SearchableSelect
                value={siteFilter || undefined}
                options={[{ value: "", label: "All sites" }, ...siteOptions]}
                placeholder="Filter by site"
                searchPlaceholder="Search sites..."
                onValueChange={(value) => setSiteFilter(value === "" ? "" : value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {filteredPours.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  No batches match the filters.
                </p>
              ) : (
                filteredPours.map((pour) => {
                  const checked = formData.goldPourIds.includes(pour.id);
                  return (
                    <label
                      key={pour.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 ${checked ? "bg-primary/5" : ""}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePour(pour.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">
                            {pour.batchCode ?? pour.pourBarId}
                          </span>
                          {pour.dispatchCount > 0 ? (
                            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              Re-dispatch
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {pour.site.name} ({pour.site.code})
                        </div>
                      </div>
                      <div className="text-right text-xs whitespace-nowrap">
                        <div className="font-semibold">{Number(pour.grossWeight).toFixed(3)} g</div>
                        <div className="text-muted-foreground">
                          ${Number(pour.valueUsd ?? 0).toFixed(2)}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

        {requiresOverrideReason ? (
          <Alert>
            <AlertTitle>Some batches were already dispatched</AlertTitle>
            <AlertDescription>
              Provide an override reason to continue.
            </AlertDescription>
          </Alert>
        ) : null}

        <div>
          <label className="block text-sm font-semibold mb-2">
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
            <label className="block text-sm font-semibold mb-2">
              Courier *
            </label>
            <Input
              value={formData.courier}
              onChange={(e) => setFormData({ ...formData, courier: e.target.value })}
              placeholder="e.g., SecureTransit Ltd"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">
              Destination *
            </label>
            <Input
              value={formData.destination}
              onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
              placeholder="Buyer name and address"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Seal Numbers *</label>
            <Input
              value={formData.sealNumbers}
              onChange={(e) => setFormData({ ...formData, sealNumbers: e.target.value })}
              placeholder="e.g., S-12345, S-12346"
              required
            />
          </div>
          <SearchableSelect
            label="Handed Over By *"
            value={formData.handedOverById || undefined}
            options={employeeOptions}
            placeholder={
              employeesLoading ? "Loading employees..." : "Pick a clerk or manager"
            }
            searchPlaceholder="Search employees..."
            onValueChange={handleSelectChange("handedOverById")}
          />
        </div>

        <details
          className="group rounded-md border bg-card transition-all"
          open={moreOpen || requiresOverrideReason}
          onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
            <span>More details {requiresOverrideReason ? "(override required)" : null}</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 px-4 pb-4 pt-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Vehicle</label>
                <Input
                  value={formData.vehicle}
                  onChange={(e) => setFormData({ ...formData, vehicle: e.target.value })}
                  placeholder="e.g., ABC-1234"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Received By</label>
                <Input
                  value={formData.receivedBy}
                  onChange={(e) =>
                    setFormData({ ...formData, receivedBy: e.target.value })
                  }
                  placeholder="Courier or buyer rep name"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Anything to flag about this trip..."
              />
            </div>

            {requiresOverrideReason ? (
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Override Reason *
                </label>
                <Textarea
                  value={formData.overrideReason}
                  onChange={(e) =>
                    setFormData({ ...formData, overrideReason: e.target.value })
                  }
                  rows={2}
                  placeholder="Why these already-dispatched batches need to ship again."
                />
                {!formData.overrideReason.trim() ? (
                  <p className="mt-1 text-xs text-destructive">
                    Override reason is required for already-dispatched batches.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>
      </div>
    </FormShell>
  );
}
