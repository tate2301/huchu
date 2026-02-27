"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Send } from "@/lib/icons";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { FieldHelp } from "@/components/shared/field-help";
import { FormShell } from "@/components/shared/form-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { ContextHelp } from "@/components/shared/context-help";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { fetchShiftGroupSchedules, fetchShiftGroups, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";

const toNumber = (value: string) => {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

type ShiftReportDetail = {
  id: string;
  date: string;
  shift: string;
  siteId: string;
  shiftGroupId?: string | null;
  groupLeaderId: string;
  crewCount: number;
  workType: string;
  outputTonnes?: number | null;
  outputTrips?: number | null;
  outputWheelbarrows?: number | null;
  metresAdvanced?: number | null;
  hasIncident: boolean;
  incidentNotes?: string | null;
  handoverNotes?: string | null;
};

export default function ShiftReportPage() {
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
    shift: "SHIFT-1",
    siteId: searchParams.get("siteId") ?? "",
    shiftGroupId: "",
    groupLeaderId: "",
    crewCount: "",
    workType: "EXTRACTION",
    outputTonnes: "",
    outputTrips: "",
    outputWheelbarrows: "",
    metresAdvanced: "",
    hasIncident: false,
    incidentNotes: "",
    handoverNotes: "",
  });
  const [hasLoadedEditRecord, setHasLoadedEditRecord] = useState(false);

  const {
    data: editingReport,
    isLoading: editingReportLoading,
    error: editingReportError,
  } = useQuery({
    queryKey: ["shift-report-detail", editId],
    queryFn: () => fetchJson<ShiftReportDetail>(`/api/shift-reports/${editId}`),
    enabled: Boolean(isSuperAdmin && editId),
  });

  useEffect(() => {
    if (!editingReport || hasLoadedEditRecord) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate edit form defaults once after async fetch.
    setFormData({
      date: editingReport.date.slice(0, 10),
      shift: editingReport.shift,
      siteId: editingReport.siteId,
      shiftGroupId: editingReport.shiftGroupId ?? "",
      groupLeaderId: editingReport.groupLeaderId,
      crewCount: String(editingReport.crewCount),
      workType: editingReport.workType,
      outputTonnes: editingReport.outputTonnes != null ? String(editingReport.outputTonnes) : "",
      outputTrips: editingReport.outputTrips != null ? String(editingReport.outputTrips) : "",
      outputWheelbarrows:
        editingReport.outputWheelbarrows != null
          ? String(editingReport.outputWheelbarrows)
          : "",
      metresAdvanced:
        editingReport.metresAdvanced != null ? String(editingReport.metresAdvanced) : "",
      hasIncident: Boolean(editingReport.hasIncident),
      incidentNotes: editingReport.incidentNotes ?? "",
      handoverNotes: editingReport.handoverNotes ?? "",
    });
    setHasLoadedEditRecord(true);
  }, [editingReport, hasLoadedEditRecord]);

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
    enabled: isSuperAdmin,
  });
  const activeSiteId = formData.siteId || sites?.[0]?.id || "";

  const {
    data: shiftGroupsData,
    isLoading: shiftGroupsLoading,
    error: shiftGroupsError,
  } = useQuery({
    queryKey: ["shift-groups", "shift-report", activeSiteId],
    queryFn: () =>
      fetchShiftGroups({
        siteId: activeSiteId || undefined,
        active: true,
        limit: 300,
      }),
    enabled: Boolean(activeSiteId && isSuperAdmin),
  });
  const shiftGroups = useMemo(() => shiftGroupsData?.data ?? [], [shiftGroupsData]);

  const { data: scheduleData } = useQuery({
    queryKey: ["shift-group-schedules", "shift-report", activeSiteId, formData.date, formData.shift],
    queryFn: () =>
      fetchShiftGroupSchedules({
        siteId: activeSiteId,
        date: formData.date,
        shift: formData.shift,
        limit: 10,
      }),
    enabled: Boolean(activeSiteId && formData.date && formData.shift && isSuperAdmin),
  });

  const scheduledShiftGroupId = scheduleData?.data?.[0]?.shiftGroupId ?? "";
  const effectiveShiftGroupId = formData.shiftGroupId || scheduledShiftGroupId;
  const selectedShiftGroup = useMemo(
    () => shiftGroups.find((group) => group.id === effectiveShiftGroupId),
    [shiftGroups, effectiveShiftGroupId],
  );
  const effectiveGroupLeaderId =
    selectedShiftGroup?.leaderEmployeeId ||
    scheduleData?.data?.[0]?.shiftGroup?.leader?.id ||
    formData.groupLeaderId;

  const shiftGroupOptions = useMemo<SearchableOption[]>(
    () =>
      shiftGroups.map((group) => ({
        value: group.id,
        label: group.name,
        description: `Leader: ${group.leader?.name ?? "Not set"}`,
        meta: group.code || group.site?.code || undefined,
      })),
    [shiftGroups],
  );
  const isExtraction = formData.workType === "EXTRACTION";
  const isHauling = formData.workType === "HAULING";
  const isCrushing = formData.workType === "CRUSHING";
  const isProcessing = formData.workType === "PROCESSING";
  const showWheelbarrows = isExtraction || isHauling;
  const showTonnes = isCrushing || isProcessing;
  const showMetres = isExtraction;

  const shiftReportMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      isEditMode && editId
        ? fetchJson<{ id: string; updatedAt?: string }>(`/api/shift-reports/${editId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : fetchJson<{ id: string; createdAt?: string }>("/api/shift-reports", {
            method: "POST",
            body: JSON.stringify(payload),
          }),
    onSuccess: (report, variables) => {
      toast({
        title: isEditMode ? "Shift report updated" : "Shift report submitted",
        description: isEditMode ? "Backfill update has been saved." : "Report saved and ready for review.",
        variant: "success",
      });
      localStorage.removeItem("shiftReportDraft");
      const reportDate = String(variables.date ?? "").slice(0, 10);
      const reportSiteId = String(variables.siteId ?? "");
      const destination = buildSavedRecordRedirect(
        "/reports/shift",
        {
          createdId: isEditMode && editId ? editId : report.id,
          createdAt:
            ("createdAt" in report && report.createdAt) || reportDate,
          source: "shift-report",
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
    const { name, value, type } = e.target;
    setFormData((prev) => {
      const nextValue = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
      if (name === "date" || name === "shift") {
        return {
          ...prev,
          [name]: nextValue as never,
          shiftGroupId: "",
          groupLeaderId: "",
        };
      }
      return {
        ...prev,
        [name]: nextValue as never,
      };
    });
  };

  const handleSelectChange = (field: keyof typeof formData) => (value: string) => {
    setFormData((prev) => {
      if (field === "siteId" || field === "shift") {
        return {
          ...prev,
          [field]: value,
          shiftGroupId: "",
          groupLeaderId: "",
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleSaveDraft = () => {
    localStorage.setItem(
      "shiftReportDraft",
      JSON.stringify({
        ...formData,
        savedAt: new Date().toISOString(),
      }),
    );
    toast({
      title: "Draft saved",
      description: "Shift report saved locally on this device.",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showEditLoading) return;

    if (!activeSiteId || !effectiveShiftGroupId) {
      toast({
        title: "Missing details",
        description: "Site and shift group are required.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      date: formData.date,
      shift: formData.shift,
      siteId: activeSiteId,
      shiftGroupId: effectiveShiftGroupId,
      groupLeaderId: effectiveGroupLeaderId,
      crewCount: Number(formData.crewCount),
      workType: formData.workType,
      outputTonnes: toNumber(formData.outputTonnes),
      outputTrips: toNumber(formData.outputTrips),
      outputWheelbarrows: toNumber(formData.outputWheelbarrows),
      metresAdvanced: toNumber(formData.metresAdvanced),
      hasIncident: formData.hasIncident,
      incidentNotes: formData.hasIncident ? formData.incidentNotes : undefined,
      handoverNotes: formData.handoverNotes || undefined,
    };

    shiftReportMutation.mutate(payload);
  };

  const error =
    sitesError || shiftGroupsError || editingReportError || shiftReportMutation.error;
  const showEditLoading = isEditMode && editingReportLoading && !hasLoadedEditRecord;

  if (sessionStatus === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeading title="Shift Report" description="Quick 2-minute daily entry" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageActions>
          <Button size="sm" asChild variant="outline">
            <Link href="/reports/shift">View Submitted Reports</Link>
          </Button>
        </PageActions>
        <PageHeading title="Shift Report" description="Quick 2-minute daily entry" />
        <Alert variant="destructive">
          <AlertTitle>Restricted access</AlertTitle>
          <AlertDescription>
            Only SUPERADMIN can create or backfill shift reports.
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
            <Link href="/reports/shift">Back to Shift Reports</Link>
          </Button>
        </PageActions>
        <PageHeading title="Edit Shift Report" description="Backfill and correct an existing shift report" />
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
          <Link href="/reports/shift">View Submitted Reports</Link>
        </Button>
      </PageActions>

      <PageHeading
        title={isEditMode ? "Edit Shift Report" : "Shift Report"}
        description={
          isEditMode
            ? "Backfill and correct an existing shift report"
            : "Quick 2-minute daily entry"
        }
      />
      <PageIntro
        title="Complete this shift report in 3 steps"
        purpose="Step 1: select shift details. Step 2: capture output. Step 3: submit and view the saved report in history."
        nextStep="Start with date, shift, site, and group leader."
      />
      <ContextHelp href="/help#shift-report" />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{isEditMode ? "Unable to update report" : "Unable to submit report"}</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {showEditLoading ? <Skeleton className="h-24 w-full" /> : null}

      <FormShell
        title={isEditMode ? "Shift Backfill Form" : "Shift Entry Form"}
        description="Capture shift details, output, and handover notes."
        onSubmit={handleSubmit}
        formClassName="space-y-6"
        requiredHint={
          isEditMode
            ? "Fields marked * are required. Saving updates this existing report."
            : "Fields marked * are required. Submitting redirects to Shift Reports with this record highlighted."
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={shiftReportMutation.isPending || showEditLoading}
              className="flex-1 sm:flex-none"
            >
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button
              type="submit"
              disabled={shiftReportMutation.isPending || showEditLoading}
              className="flex-1 sm:flex-none"
            >
              <Send className="mr-2 h-4 w-4" />
              {isEditMode ? "Update Report" : "Submit Report"}
            </Button>
          </>
        }
      >
        <Card>
          <CardHeader className="border-b pb-2">
            <CardTitle>Shift Information</CardTitle>
            <CardDescription>Date, shift, and location details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Date *</label>
                <Input type="date" name="date" value={formData.date} onChange={handleChange} required />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">Shift *</label>
                <Input
                  name="shift"
                  value={formData.shift}
                  onChange={handleChange}
                  placeholder="e.g. SHIFT-1, SHIFT-2, SHIFT-3"
                  required
                />
                <FieldHelp hint="Use any shift label used at your site (for example SHIFT-1, SHIFT-2)." />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                {shiftGroupsLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <SearchableSelect
                    label="Shift Group *"
                    value={effectiveShiftGroupId || undefined}
                    options={shiftGroupOptions}
                    placeholder="Search shift group"
                    searchPlaceholder="Search group name or leader..."
                    onValueChange={(value) => {
                      const matched = shiftGroups.find((group) => group.id === value);
                      setFormData((prev) => ({
                        ...prev,
                        shiftGroupId: value,
                        groupLeaderId: matched?.leaderEmployeeId ?? prev.groupLeaderId,
                      }));
                    }}
                    onAddOption={() => router.push("/human-resources/shift-groups")}
                    addLabel="Manage shift groups"
                  />
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Crew Count *</label>
                <Input
                  type="number"
                  name="crewCount"
                  value={formData.crewCount}
                  onChange={handleChange}
                  placeholder="Number of workers"
                  min="0"
                  required
                />
                <FieldHelp hint="Enter the number of crew members who worked this shift." />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Shift Leader (Auto)</label>
              {selectedShiftGroup?.leader?.name ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                  <EmployeeAvatar name={selectedShiftGroup.leader.name} size="sm" />
                  <div>
                    <div className="text-sm font-medium">{selectedShiftGroup.leader.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedShiftGroup.leader.employeeId}
                    </div>
                  </div>
                </div>
              ) : (
                <Input
                  value=""
                  readOnly
                  placeholder="Select a shift group to auto-fill leader"
                />
              )}
              <FieldHelp hint="Group leader is automatically used as shift leader." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Process & Output</CardTitle>
            <CardDescription>
              Extraction - Haulage - Crushing - Processing (gold logged in Gold Control)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Process Stage *</label>
              <Select
                name="workType"
                value={formData.workType}
                onValueChange={handleSelectChange("workType")}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select process stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXTRACTION">Extraction</SelectItem>
                  <SelectItem value="HAULING">Haulage</SelectItem>
                  <SelectItem value="CRUSHING">Crushing</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                </SelectContent>
              </Select>
              <FieldHelp hint="Pick the main process for this report; output fields adjust automatically." />
            </div>

            <div className="border-t pt-4">
              <h4 className="mb-3 text-sm font-semibold">Output Metrics (fill what applies)</h4>
              <FieldHelp hint="Complete only the metrics relevant to the selected process stage." />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {showWheelbarrows && (
                  <div>
                    <label className="mb-2 block text-sm">{isHauling ? "Wheelbarrows Hauled" : "Wheelbarrows Mined"}</label>
                    <Input
                      type="number"
                      name="outputWheelbarrows"
                      value={formData.outputWheelbarrows}
                      onChange={handleChange}
                      placeholder="0"
                    />
                  </div>
                )}

                {showTonnes && (
                  <div>
                    <label className="mb-2 block text-sm">{isCrushing ? "Tonnes Crushed" : "Tonnes Processed"}</label>
                    <Input
                      type="number"
                      name="outputTonnes"
                      value={formData.outputTonnes}
                      onChange={handleChange}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                )}

                {showMetres && (
                  <div>
                    <label className="mb-2 block text-sm">Metres Advanced</label>
                    <Input
                      type="number"
                      name="metresAdvanced"
                      value={formData.metresAdvanced}
                      onChange={handleChange}
                      placeholder="0.0"
                      step="0.1"
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Safety & Handover</CardTitle>
            <CardDescription>Incidents and notes for next shift</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  name="hasIncident"
                  checked={formData.hasIncident}
                  onChange={handleChange}
                  className="h-5 w-5 rounded border-border"
                />
                Incident or near miss occurred
              </label>
            </div>

            {formData.hasIncident && (
              <div>
                <label className="mb-2 block text-sm font-semibold">Incident Details *</label>
                <Textarea
                  name="incidentNotes"
                  value={formData.incidentNotes}
                  onChange={handleChange}
                  placeholder="Describe what happened..."
                  rows={3}
                  required={formData.hasIncident}
                />
                <FieldHelp hint="Include what happened, location, and immediate action taken." />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-semibold">Handover Notes</label>
              <Textarea
                name="handoverNotes"
                value={formData.handoverNotes}
                onChange={handleChange}
                placeholder="What should the next shift know?"
                rows={3}
              />
              <FieldHelp hint="Call out outstanding tasks, hazards, or equipment status." />
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Saves offline / Auto-syncs when connected / 2-minute form
        </p>
      </FormShell>
    </div>
  );
}
