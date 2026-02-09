"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Send } from "lucide-react";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { fetchEmployees, fetchShiftReports, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import { buildSavedRecordRedirect } from "@/lib/saved-record";

const toNumber = (value: string) => {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export default function ShiftReportPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    shift: "DAY",
    siteId: searchParams.get("siteId") ?? "",
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
  const [listSiteId, setListSiteId] = useState(searchParams.get("siteId") ?? "all");
  const [listStartDate, setListStartDate] = useState(
    searchParams.get("startDate") ?? format(subDays(new Date(), 6), "yyyy-MM-dd"),
  );
  const [listEndDate, setListEndDate] = useState(
    searchParams.get("endDate") ?? format(new Date(), "yyyy-MM-dd"),
  );
  const shiftReportPdfRef = useRef<HTMLDivElement>(null);

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });
  const activeSiteId = formData.siteId || sites?.[0]?.id || "";

  const {
    data: employeesData,
    isLoading: employeesLoading,
    error: employeesError,
  } = useQuery({
    queryKey: ["employees", "group-leaders"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const activeListSiteId = listSiteId === "all" ? "" : listSiteId;
  const {
    data: shiftReportsData,
    isLoading: shiftReportsLoading,
    error: shiftReportsError,
  } = useQuery({
    queryKey: [
      "shift-reports",
      "list",
      activeListSiteId || "all",
      listStartDate,
      listEndDate,
    ],
    queryFn: () =>
      fetchShiftReports({
        siteId: activeListSiteId || undefined,
        startDate: listStartDate,
        endDate: listEndDate,
        limit: 200,
      }),
    enabled: !!listStartDate && !!listEndDate,
  });

  const groupLeaders = useMemo(
    () => employeesData?.data ?? [],
    [employeesData],
  );
  const shiftReportRecords = useMemo(
    () => shiftReportsData?.data ?? [],
    [shiftReportsData],
  );
  const activeListSiteName =
    listSiteId === "all"
      ? "All sites"
      : sites?.find((site) => site.id === listSiteId)?.name ?? "Selected site";
  const hasGroupLeaders = groupLeaders.length > 0;
  const isExtraction = formData.workType === "EXTRACTION";
  const isHauling = formData.workType === "HAULING";
  const isCrushing = formData.workType === "CRUSHING";
  const isProcessing = formData.workType === "PROCESSING";
  const showWheelbarrows = isExtraction || isHauling;
  const showTonnes = isCrushing || isProcessing;
  const showMetres = isExtraction;

  const shiftReportMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ id: string; createdAt?: string }>("/api/shift-reports", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (report, variables) => {
      toast({
        title: "Shift report submitted",
        description: "Report saved and ready for review.",
        variant: "success",
      });
      localStorage.removeItem("shiftReportDraft");
      const reportDate = String(variables.date ?? "").slice(0, 10);
      const reportSiteId = String(variables.siteId ?? "");
      const destination = buildSavedRecordRedirect(
        "/shift-report",
        {
          createdId: report.id,
          createdAt: report.createdAt,
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
        title: "Unable to submit report",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
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

    if (!activeSiteId || !formData.groupLeaderId) {
      toast({
        title: "Missing details",
        description: "Site and group leader are required.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      date: formData.date,
      shift: formData.shift,
      siteId: activeSiteId,
      groupLeaderId: formData.groupLeaderId,
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

  const error = sitesError || employeesError || shiftReportMutation.error;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSaveDraft}
          disabled={shiftReportMutation.isPending}
        >
          <Save className="h-4 w-4" />
          Save Draft
        </Button>
        <Button
          size="sm"
          type="submit"
          form="shift-report-form"
          disabled={shiftReportMutation.isPending}
        >
          <Send className="h-4 w-4" />
          Submit
        </Button>
      </PageActions>

      <PageHeading
        title="Shift Report"
        description="Quick 2-minute daily entry"
      />
      <PageIntro
        title="Complete this shift report in 3 steps"
        purpose="Step 1: select shift details. Step 2: capture output. Step 3: submit and confirm the saved report."
        nextStep="Start with date, shift, site, and group leader."
      />
      <RecordSavedBanner entityLabel="shift report" />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to submit report</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <form
        id="shift-report-form"
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <Card>
          <CardHeader className="border-b pb-2">
            <CardTitle>Shift Information</CardTitle>
            <CardDescription>Date, shift, and location details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Date *
                </label>
                <Input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Shift *
                </label>
                <Select
                  name="shift"
                  value={formData.shift}
                  onValueChange={handleSelectChange("shift")}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">Day Shift</SelectItem>
                    <SelectItem value="NIGHT">Night Shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Site *
                </label>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Group Leader *
                </label>
                {employeesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    name="groupLeaderId"
                    value={formData.groupLeaderId || undefined}
                    onValueChange={handleSelectChange("groupLeaderId")}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select group leader" />
                    </SelectTrigger>
                    <SelectContent>
                      {hasGroupLeaders ? (
                        groupLeaders.map((leader) => (
                          <SelectItem key={leader.id} value={leader.id}>
                            {leader.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__no_group_leaders__" disabled>
                          No active employees available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Crew Count *
                </label>
                <Input
                  type="number"
                  name="crewCount"
                  value={formData.crewCount}
                  onChange={handleChange}
                  placeholder="Number of workers"
                  min="0"
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Process & Output</CardTitle>
            <CardDescription>
              Extraction - Haulage - Crushing - Processing (gold logged in Gold
              Control)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Process Stage *
              </label>
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
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-3">
                Output Metrics (fill what applies)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {showWheelbarrows && (
                  <div>
                    <label className="block text-sm mb-2">
                      {isHauling ? "Wheelbarrows Hauled" : "Wheelbarrows Mined"}
                    </label>
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
                    <label className="block text-sm mb-2">
                      {isCrushing ? "Tonnes Crushed" : "Tonnes Processed"}
                    </label>
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
                    <label className="block text-sm mb-2">
                      Metres Advanced
                    </label>
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
            <CardDescription>
              Incidents and notes for next shift
            </CardDescription>
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
                <label className="block text-sm font-semibold mb-2">
                  Incident Details *
                </label>
                <Textarea
                  name="incidentNotes"
                  value={formData.incidentNotes}
                  onChange={handleChange}
                  placeholder="Describe what happened..."
                  rows={3}
                  required={formData.hasIncident}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold mb-2">
                Handover Notes
              </label>
              <Textarea
                name="handoverNotes"
                value={formData.handoverNotes}
                onChange={handleChange}
                placeholder="What should the next shift know?"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={shiftReportMutation.isPending}
            className="flex-1"
          >
            <Save className="mr-2 h-5 w-5" />
            Save Draft
          </Button>

          <Button
            type="submit"
            disabled={shiftReportMutation.isPending}
            className="flex-1"
          >
            <Send className="mr-2 h-5 w-5" />
            Submit Report
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Saves offline / Auto-syncs when connected / 2-minute form
        </p>
      </form>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Shift Reports</CardTitle>
              <CardDescription>Review submitted shift reports</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (shiftReportPdfRef.current) {
                  exportElementToPdf(
                    shiftReportPdfRef.current,
                    `shift-reports-${listStartDate}-to-${listEndDate}.pdf`,
                  );
                }
              }}
              disabled={shiftReportsLoading || shiftReportRecords.length === 0}
            >
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {shiftReportsError && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load shift reports</AlertTitle>
              <AlertDescription>
                {getApiErrorMessage(shiftReportsError)}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold mb-2">Site</label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={listSiteId} onValueChange={setListSiteId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sites</SelectItem>
                    {sites?.length ? (
                      sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-sites" disabled>
                        No sites available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Start Date
              </label>
              <Input
                type="date"
                value={listStartDate}
                onChange={(event) => setListStartDate(event.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                End Date
              </label>
              <Input
                type="date"
                value={listEndDate}
                onChange={(event) => setListEndDate(event.target.value)}
              />
            </div>
          </div>

          {shiftReportsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : shiftReportRecords.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No shift reports for this range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-semibold">Date</th>
                    <th className="text-left p-3 font-semibold">Shift</th>
                    <th className="text-left p-3 font-semibold">Site</th>
                    <th className="text-left p-3 font-semibold">Work Type</th>
                    <th className="text-left p-3 font-semibold">Crew</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftReportRecords.map((report) => (
                    <tr key={report.id} className={`border-b ${createdId === report.id ? "bg-[var(--status-success-bg)]" : ""}`}>
                      <td className="p-3">
                        {format(new Date(report.date), "MMM d, yyyy")}
                      </td>
                      <td className="p-3">{report.shift}</td>
                      <td className="p-3">{report.site?.name}</td>
                      <td className="p-3">{report.workType}</td>
                      <td className="p-3">{report.crewCount}</td>
                      <td className="p-3">{report.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="absolute left-[-9999px] top-0">
        <div ref={shiftReportPdfRef}>
          <PdfTemplate
            title="Shift Reports"
            subtitle={`${listStartDate} to ${listEndDate}`}
            meta={[
              { label: "Site", value: activeListSiteName },
              { label: "Total reports", value: String(shiftReportRecords.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Shift</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Work Type</th>
                  <th className="py-2">Crew</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shiftReportRecords.map((report) => (
                  <tr key={report.id} className="border-b border-gray-100">
                    <td className="py-2">{format(new Date(report.date), "MMM d, yyyy")}</td>
                    <td className="py-2">{report.shift}</td>
                    <td className="py-2">{report.site?.name}</td>
                    <td className="py-2">{report.workType}</td>
                    <td className="py-2">{report.crewCount}</td>
                    <td className="py-2">{report.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  );
}
