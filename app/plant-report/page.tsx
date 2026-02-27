"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Save, Send } from "@/lib/icons";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { FieldHelp } from "@/components/shared/field-help";
import { FormShell } from "@/components/shared/form-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { ContextHelp } from "@/components/shared/context-help";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchDowntimeCodes, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";

const toNumber = (value: string) => {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

type DowntimeEvent = {
  downtimeCodeId: string;
  durationHours: string;
  notes: string;
};

type PlantReportDetail = {
  id: string;
  date: string;
  siteId: string;
  tonnesFed?: number | null;
  tonnesProcessed?: number | null;
  runHours?: number | null;
  dieselUsed?: number | null;
  grindingMedia?: number | null;
  reagentsUsed?: number | null;
  waterUsed?: number | null;
  goldRecovered?: number | null;
  notes?: string | null;
  downtimeEvents?: Array<{
    downtimeCodeId: string;
    durationHours: number;
    notes?: string | null;
  }>;
};

export default function PlantReportPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");
  const isEditMode = Boolean(editId);
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const isSuperAdmin = sessionRole === "SUPERADMIN";
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    siteId: searchParams.get("siteId") ?? "",
    tonnesFed: "",
    tonnesProcessed: "",
    runHours: "",
    dieselUsed: "",
    grindingMedia: "",
    reagentsUsed: "",
    waterUsed: "",
    goldRecovered: "",
    notes: "",
  });

  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEvent[]>([]);
  const [hasLoadedEditRecord, setHasLoadedEditRecord] = useState(false);

  const {
    data: editingReport,
    isLoading: editingReportLoading,
    error: editingReportError,
  } = useQuery({
    queryKey: ["plant-report-detail", editId],
    queryFn: () => fetchJson<PlantReportDetail>(`/api/plant-reports/${editId}`),
    enabled: Boolean(isSuperAdmin && editId),
  });

  useEffect(() => {
    if (!editingReport || hasLoadedEditRecord) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate edit form defaults once after async fetch.
    setFormData({
      date: editingReport.date.slice(0, 10),
      siteId: editingReport.siteId,
      tonnesFed: editingReport.tonnesFed != null ? String(editingReport.tonnesFed) : "",
      tonnesProcessed:
        editingReport.tonnesProcessed != null ? String(editingReport.tonnesProcessed) : "",
      runHours: editingReport.runHours != null ? String(editingReport.runHours) : "",
      dieselUsed: editingReport.dieselUsed != null ? String(editingReport.dieselUsed) : "",
      grindingMedia:
        editingReport.grindingMedia != null ? String(editingReport.grindingMedia) : "",
      reagentsUsed: editingReport.reagentsUsed != null ? String(editingReport.reagentsUsed) : "",
      waterUsed: editingReport.waterUsed != null ? String(editingReport.waterUsed) : "",
      goldRecovered:
        editingReport.goldRecovered != null ? String(editingReport.goldRecovered) : "",
      notes: editingReport.notes ?? "",
    });

    setDowntimeEvents(
      (editingReport.downtimeEvents ?? []).map((event) => ({
        downtimeCodeId: event.downtimeCodeId,
        durationHours: String(event.durationHours),
        notes: event.notes ?? "",
      })),
    );
    setHasLoadedEditRecord(true);
  }, [editingReport, hasLoadedEditRecord]);

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
    enabled: isSuperAdmin,
  });

  const activeSiteId = formData.siteId || sites?.[0]?.id || "";

  const {
    data: downtimeCodes,
    isLoading: downtimeLoading,
    error: downtimeError,
  } = useQuery({
    queryKey: ["downtime-codes", activeSiteId],
    queryFn: () => fetchDowntimeCodes({ siteId: activeSiteId, active: true }),
    enabled: Boolean(isSuperAdmin && activeSiteId),
  });

  const plantReportMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      isEditMode && editId
        ? fetchJson<{ id: string; updatedAt?: string }>(`/api/plant-reports/${editId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : fetchJson<{ id: string; createdAt?: string }>("/api/plant-reports", {
            method: "POST",
            body: JSON.stringify(payload),
          }),
    onSuccess: (report, variables) => {
      toast({
        title: isEditMode ? "Plant report updated" : "Plant report submitted",
        description: isEditMode ? "Backfill update has been saved." : "Production report saved successfully.",
        variant: "success",
      });
      localStorage.removeItem("plantReportDraft");
      const reportDate = String(variables.date ?? "").slice(0, 10);
      const reportSiteId = String(variables.siteId ?? "");
      const destination = buildSavedRecordRedirect(
        "/reports/plant",
        {
          createdId: isEditMode && editId ? editId : report.id,
          createdAt:
            ("createdAt" in report && report.createdAt) || reportDate,
          source: "plant-report",
        },
        {
          siteId: reportSiteId,
          startDate: reportDate,
          endDate: reportDate,
        },
      );
      router.push(destination);
    },
    onError: (error) => {
      toast({
        title: isEditMode ? "Unable to update report" : "Unable to submit report",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (field: keyof typeof formData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addDowntime = () => {
    setDowntimeEvents([...downtimeEvents, { downtimeCodeId: "", durationHours: "", notes: "" }]);
  };

  const updateDowntime = (index: number, field: keyof DowntimeEvent, value: string) => {
    const updated = [...downtimeEvents];
    updated[index] = { ...updated[index], [field]: value };
    setDowntimeEvents(updated);
  };

  const removeDowntime = (index: number) => {
    setDowntimeEvents(downtimeEvents.filter((_, i) => i !== index));
  };

  const handleSaveDraft = () => {
    localStorage.setItem(
      "plantReportDraft",
      JSON.stringify({
        ...formData,
        downtimeEvents,
        savedAt: new Date().toISOString(),
      }),
    );
    toast({
      title: "Draft saved",
      description: "Plant report saved locally on this device.",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showEditLoading) return;

    if (!activeSiteId) {
      toast({
        title: "Site required",
        description: "Select a site before submitting.",
        variant: "destructive",
      });
      return;
    }

    const downtimePayload = downtimeEvents
      .filter((event) => event.downtimeCodeId && event.durationHours.trim() !== "")
      .map((event) => ({
        downtimeCodeId: event.downtimeCodeId,
        durationHours: Number(event.durationHours),
        notes: event.notes || undefined,
      }));

    const payload = {
      date: formData.date,
      siteId: activeSiteId,
      tonnesFed: toNumber(formData.tonnesFed),
      tonnesProcessed: toNumber(formData.tonnesProcessed),
      runHours: toNumber(formData.runHours),
      dieselUsed: toNumber(formData.dieselUsed),
      grindingMedia: toNumber(formData.grindingMedia),
      reagentsUsed: toNumber(formData.reagentsUsed),
      waterUsed: toNumber(formData.waterUsed),
      goldRecovered: toNumber(formData.goldRecovered),
      notes: formData.notes || undefined,
      downtimeEvents: downtimePayload.length > 0 ? downtimePayload : undefined,
    };

    plantReportMutation.mutate(payload);
  };

  const totalDowntime = downtimeEvents.reduce((sum, event) => sum + (parseFloat(event.durationHours) || 0), 0);
  const error =
    sitesError || downtimeError || editingReportError || plantReportMutation.error;
  const showEditLoading = isEditMode && editingReportLoading && !hasLoadedEditRecord;

  if (sessionStatus === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeading title="Plant Report" description="Processing and consumables tracking" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageActions>
          <Button size="sm" asChild variant="outline">
            <Link href="/reports/plant">View Plant Reports</Link>
          </Button>
        </PageActions>
        <PageHeading title="Plant Report" description="Processing and consumables tracking" />
        <Alert variant="destructive">
          <AlertTitle>Restricted access</AlertTitle>
          <AlertDescription>
            Only SUPERADMIN can create or backfill plant reports.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isEditMode && editingReportError && !hasLoadedEditRecord) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageActions>
          <Button size="sm" asChild variant="outline">
            <Link href="/reports/plant">Back to Plant Reports</Link>
          </Button>
        </PageActions>
        <PageHeading title="Edit Plant Report" description="Backfill and correct an existing plant report" />
        <Alert variant="destructive">
          <AlertTitle>Unable to load report</AlertTitle>
          <AlertDescription>{getApiErrorMessage(editingReportError)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button size="sm" asChild variant="outline">
          <Link href="/reports/plant">View Plant Reports</Link>
        </Button>
      </PageActions>

      <PageHeading
        title={isEditMode ? "Edit Plant Report" : "Plant Report"}
        description={
          isEditMode
            ? "Backfill and correct an existing plant report"
            : "Processing and consumables tracking"
        }
      />
      <PageIntro
        title="Complete this plant report in 3 steps"
        purpose="Step 1: capture site and production values. Step 2: add downtime and consumables. Step 3: submit and review in history."
        nextStep="Start with date and site under Plant Details."
      />
      <ContextHelp href="/help#plant-report" />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{isEditMode ? "Unable to update report" : "Unable to submit report"}</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {showEditLoading ? <Skeleton className="h-24 w-full" /> : null}

      <FormShell
        title={isEditMode ? "Plant Backfill Form" : "Plant Entry Form"}
        description="Capture production, consumables, and downtime details for this site."
        onSubmit={handleSubmit}
        formClassName="space-y-6"
        requiredHint={
          isEditMode
            ? "Date and site are required. Saving updates this existing report."
            : "Date and site are required. Submitting redirects to Plant Reports with this entry highlighted."
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={plantReportMutation.isPending || showEditLoading}
              className="flex-1 sm:flex-none"
            >
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button
              type="submit"
              disabled={plantReportMutation.isPending || showEditLoading}
              className="flex-1 sm:flex-none"
            >
              <Send className="mr-2 h-4 w-4" />
              {isEditMode ? "Update Report" : "Submit Report"}
            </Button>
          </>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Plant Details</CardTitle>
            <CardDescription>Date and site information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Date *</label>
                <Input type="date" name="date" value={formData.date} onChange={handleChange} required />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">Site *</label>
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    name="siteId"
                    value={activeSiteId || undefined}
                    onValueChange={handleSelectChange("siteId")}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select site..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Production</CardTitle>
            <CardDescription>Tonnes processed and run hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Tonnes Fed</label>
                <Input type="number" name="tonnesFed" value={formData.tonnesFed} onChange={handleChange} placeholder="0" />
                <FieldHelp hint="Enter material fed to the plant during this shift." />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">Tonnes Processed</label>
                <Input
                  type="number"
                  name="tonnesProcessed"
                  value={formData.tonnesProcessed}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">Run Hours</label>
                <Input type="number" name="runHours" value={formData.runHours} onChange={handleChange} placeholder="0" />
                <FieldHelp hint="Total equipment run time in hours." />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consumables</CardTitle>
            <CardDescription>Diesel, media, and reagents used</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Diesel Used (litres)</label>
                <Input type="number" name="dieselUsed" value={formData.dieselUsed} onChange={handleChange} placeholder="0" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">Grinding Media (kg)</label>
                <Input
                  type="number"
                  name="grindingMedia"
                  value={formData.grindingMedia}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">Reagents Used (kg)</label>
                <Input type="number" name="reagentsUsed" value={formData.reagentsUsed} onChange={handleChange} placeholder="0" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">Water Used (m3)</label>
                <Input type="number" name="waterUsed" value={formData.waterUsed} onChange={handleChange} placeholder="0" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Downtime</CardTitle>
            <CardDescription>
              Record any downtime events.{" "}
              <Link href="/management/master-data/operations/downtime-codes" className="text-primary hover:underline">
                Manage codes
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalDowntime > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <span>Total downtime: {totalDowntime} hours</span>
              </div>
            )}

            {downtimeEvents.length === 0 ? (
              <StatusState
                variant="empty"
                title="No downtime events recorded"
                description="Add an event only if a stoppage occurred."
                className="min-h-24"
              />
            ) : (
              <div className="space-y-4">
                {downtimeEvents.map((event, index) => (
                  <div key={index} className="space-y-3 rounded-md border p-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-sm font-semibold">Code</label>
                        {downtimeLoading ? (
                          <Skeleton className="h-9 w-full" />
                        ) : (
                          <Select
                            value={event.downtimeCodeId}
                            onValueChange={(value) => updateDowntime(index, "downtimeCodeId", value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select code" />
                            </SelectTrigger>
                            <SelectContent>
                              {downtimeCodes?.map((code) => (
                                <SelectItem key={code.id} value={code.id}>
                                  {code.code} - {code.description}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold">Hours</label>
                        <Input
                          type="number"
                          value={event.durationHours}
                          onChange={(e) => updateDowntime(index, "durationHours", e.target.value)}
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold">Notes</label>
                        <Input
                          type="text"
                          value={event.notes}
                          onChange={(e) => updateDowntime(index, "notes", e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeDowntime(index)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" onClick={addDowntime} className="w-full">
              + Add Downtime Event
            </Button>
            <FieldHelp hint="Add one row per downtime event with code and duration." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gold Recovered</CardTitle>
            <CardDescription>Only if a pour happened today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Gold Recovered (grams)</label>
                <Input
                  type="number"
                  name="goldRecovered"
                  value={formData.goldRecovered}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Any additional observations or issues..."
              rows={3}
            />
            <FieldHelp hint="Use notes for unusual observations not captured above." />
          </CardContent>
        </Card>
      </FormShell>
    </div>
  );
}
