"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { FileText, Plus, Trash2 } from "@/lib/icons";
import { HrShell } from "@/components/human-resources/hr-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  fetchDisciplinaryActions,
  fetchEmployees,
  fetchHrIncidents,
  fetchSites,
  type DisciplinaryActionRecord,
  type EmployeeSummary,
  type HrIncidentRecord,
  type Site,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { hasRole } from "@/lib/roles";

type IncidentForm = {
  employeeId: string;
  siteId: string;
  incidentDate: string;
  category: "MISCONDUCT" | "ATTENDANCE" | "SAFETY_POLICY" | "PERFORMANCE" | "OTHER";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "UNDER_REVIEW" | "CLOSED";
  title: string;
  description: string;
  investigationNotes: string;
};

type ActionForm = {
  incidentId: string;
  employeeId: string;
  actionType: "WARNING" | "PENALTY" | "SUSPENSION" | "TERMINATION" | "OTHER";
  summary: string;
  notes: string;
  effectiveDate: string;
  penaltyAmount: string;
  penaltyCurrency: string;
};

const emptyIncidentForm: IncidentForm = {
  employeeId: "",
  siteId: "",
  incidentDate: format(new Date(), "yyyy-MM-dd"),
  category: "MISCONDUCT",
  severity: "MEDIUM",
  status: "OPEN",
  title: "",
  description: "",
  investigationNotes: "",
};

const emptyActionForm: ActionForm = {
  incidentId: "",
  employeeId: "",
  actionType: "WARNING",
  summary: "",
  notes: "",
  effectiveDate: format(new Date(), "yyyy-MM-dd"),
  penaltyAmount: "",
  penaltyCurrency: "USD",
};

const incidentCategoryOptions = [
  { value: "MISCONDUCT", label: "Misconduct" },
  { value: "ATTENDANCE", label: "Attendance" },
  { value: "SAFETY_POLICY", label: "Safety Policy" },
  { value: "PERFORMANCE", label: "Performance" },
  { value: "OTHER", label: "Other" },
] as const;

const incidentSeverityOptions = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
] as const;

const incidentStatusOptions = [
  { value: "OPEN", label: "Open" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "CLOSED", label: "Closed" },
] as const;

const actionTypeOptions = [
  { value: "WARNING", label: "Warning" },
  { value: "PENALTY", label: "Penalty" },
  { value: "SUSPENSION", label: "Suspension" },
  { value: "TERMINATION", label: "Termination" },
  { value: "OTHER", label: "Other" },
] as const;

const actionStatusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "APPLIED", label: "Applied" },
] as const;

const actionPenaltyStatusOptions = [
  { value: "DEDUCTED", label: "Deducted" },
  { value: "PAID", label: "Paid" },
  { value: "WAIVED", label: "Waived" },
] as const;

function toDateInput(value?: string | null) {
  if (!value) return "";
  try {
    return format(new Date(value), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

function incidentStatusVariant(status: HrIncidentRecord["status"]) {
  if (status === "CLOSED") return "secondary";
  if (status === "UNDER_REVIEW") return "outline";
  return "destructive";
}

function incidentSeverityVariant(severity: HrIncidentRecord["severity"]) {
  if (severity === "CRITICAL" || severity === "HIGH") return "destructive";
  if (severity === "MEDIUM") return "outline";
  return "secondary";
}

function actionStatusVariant(status: DisciplinaryActionRecord["status"]) {
  if (status === "APPROVED" || status === "APPLIED") return "secondary";
  if (status === "REJECTED") return "destructive";
  return "outline";
}

export default function HrIncidentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const incidentIdFromQuery = searchParams.get("incidentId");
  const disciplinaryIdFromQuery = searchParams.get("disciplinaryId");

  const [incidentQuery, setIncidentQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [actionsQuery, setActionsQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [incidentStatusFilter, setIncidentStatusFilter] = useState("ALL");
  const [actionStatusFilter, setActionStatusFilter] = useState("ALL");
  const [activeView, setActiveView] = useState<"incidents" | "actions">("incidents");

  const [incidentEditorOpen, setIncidentEditorOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState<IncidentForm>(emptyIncidentForm);
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);

  const [actionEditorOpen, setActionEditorOpen] = useState(false);
  const [actionForm, setActionForm] = useState<ActionForm>(emptyActionForm);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);

  const [incidentDetailsId, setIncidentDetailsId] = useState<string | null>(incidentIdFromQuery);
  const [actionDetailsId, setActionDetailsId] = useState<string | null>(disciplinaryIdFromQuery);
  const [rejectActionId, setRejectActionId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [applyActionId, setApplyActionId] = useState<string | null>(null);
  const [applyPenaltyStatus, setApplyPenaltyStatus] = useState<"DEDUCTED" | "PAID" | "WAIVED">(
    "DEDUCTED",
  );
  const [applyNote, setApplyNote] = useState("");
  const [deleteIncidentId, setDeleteIncidentId] = useState<string | null>(null);
  const [deleteActionId, setDeleteActionId] = useState<string | null>(null);

  const { data: employeesData, isLoading: employeesLoading, error: employeesError } = useQuery({
    queryKey: ["employees", "hr-incidents"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const { data: sitesData, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites", "hr-incidents"],
    queryFn: () => fetchSites(),
  });

  const { data: incidentsData, isLoading: incidentsLoading, error: incidentsError } = useQuery({
    queryKey: ["hr-incidents", incidentQuery.search, incidentStatusFilter],
    queryFn: () =>
      fetchHrIncidents({
        search: incidentQuery.search?.trim() || undefined,
        status:
          incidentStatusFilter === "ALL"
            ? undefined
            : (incidentStatusFilter as "OPEN" | "UNDER_REVIEW" | "CLOSED"),
        limit: 500,
      }),
  });

  const { data: actionsData, isLoading: actionsLoading, error: actionsError } = useQuery({
    queryKey: ["disciplinary-actions", actionStatusFilter],
    queryFn: () =>
      fetchDisciplinaryActions({
        status:
          actionStatusFilter === "ALL"
            ? undefined
            : (actionStatusFilter as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "APPLIED"),
        limit: 500,
      }),
  });

  const employees = useMemo(() => employeesData?.data ?? [], [employeesData]);
  const sites = useMemo<Site[]>(() => sitesData ?? [], [sitesData]);
  const incidents = useMemo(() => incidentsData?.data ?? [], [incidentsData]);
  const actions = useMemo(() => actionsData?.data ?? [], [actionsData]);
  const incidentLookup = useMemo(() => {
    const map = new Map<string, HrIncidentRecord>();
    incidents.forEach((record) => map.set(record.id, record));
    return map;
  }, [incidents]);

  const { data: incidentDetails, isLoading: incidentDetailsLoading, error: incidentDetailsError } =
    useQuery({
      queryKey: ["hr-incident-details", incidentDetailsId],
      queryFn: () => fetchJson<HrIncidentRecord>(`/api/hr/incidents/${incidentDetailsId}`),
      enabled: Boolean(incidentDetailsId),
    });

  const { data: actionDetails, isLoading: actionDetailsLoading, error: actionDetailsError } =
    useQuery({
      queryKey: ["disciplinary-action-details", actionDetailsId],
      queryFn: () =>
        fetchJson<DisciplinaryActionRecord>(`/api/hr/disciplinary-actions/${actionDetailsId}`),
      enabled: Boolean(actionDetailsId),
    });

  const actionLookup = useMemo(() => {
    const map = new Map<string, DisciplinaryActionRecord>();
    actions.forEach((record) => map.set(record.id, record));
    if (actionDetails) map.set(actionDetails.id, actionDetails);
    return map;
  }, [actions, actionDetails]);

  const summary = useMemo(() => {
    const openIncidents = incidents.filter((item) => item.status !== "CLOSED").length;
    const criticalIncidents = incidents.filter((item) => item.severity === "CRITICAL").length;
    const incidentsWithActions = incidents.filter((item) => (item._count?.actions ?? 0) > 0).length;
    const pendingActionApprovals = actions.filter((item) => item.status === "SUBMITTED").length;
    return { openIncidents, criticalIncidents, incidentsWithActions, pendingActionApprovals };
  }, [incidents, actions]);

  const currentUser = (session?.user ?? {}) as { id?: string; role?: string };
  const canRunApprovals = hasRole(currentUser.role, ["MANAGER", "SUPERADMIN"]);
  const canSelfApprove = currentUser.role === "SUPERADMIN";

  const canApproveOrReject = (item: DisciplinaryActionRecord) =>
    canRunApprovals &&
    (canSelfApprove || !item.submittedById || item.submittedById !== currentUser.id);

  const incidentColumns: ColumnDef<HrIncidentRecord>[] = [
    {
      id: "incident",
      header: "Incident",
      accessorFn: (row) => `${row.title} ${row.category}`,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.title}</div>
          <div className="text-xs text-muted-foreground">{row.original.category}</div>
        </div>
      ),
      size: 280,
      minSize: 220,
      maxSize: 420},
    {
      id: "employee",
      header: "Employee",
      accessorFn: (row) => `${row.employee.name} ${row.employee.employeeId}`,
      cell: ({ row }) => (
        <div>
          <div>{row.original.employee.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.employee.employeeId}</div>
        </div>
      ),
      size: 160,
      minSize: 160,
      maxSize: 160},
    {
      id: "severity",
      header: "Severity",
      accessorKey: "severity",
      cell: ({ row }) => (
        <Badge variant={incidentSeverityVariant(row.original.severity)}>{row.original.severity}</Badge>
      ),
      size: 160,
      minSize: 160,
      maxSize: 160},
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => (
        <Badge variant={incidentStatusVariant(row.original.status)}>{row.original.status}</Badge>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => row.incidentDate,
      cell: ({ row }) => <NumericCell>{format(new Date(row.original.incidentDate), "yyyy-MM-dd")}</NumericCell>,
      size: 128,
      minSize: 128,
      maxSize: 128},
    {
      id: "actionsCount",
      header: "Actions",
      accessorFn: (row) => row._count?.actions ?? 0,
      cell: ({ row }) => <NumericCell>{row.original._count?.actions ?? 0}</NumericCell>,
      size: 108,
      minSize: 108,
      maxSize: 108},
    {
      id: "quickActions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setIncidentDetailsId(row.original.id)}>
            <FileText className="size-4" />
            Details
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openEditIncident(row.original)}
            disabled={!canRunApprovals}
          >
            Edit
          </Button>
          <Button size="sm" onClick={() => openCreateAction(row.original)} disabled={!canRunApprovals}>
            New Action
          </Button>
        </div>
      ),
      size: 160,
      minSize: 160,
      maxSize: 160},
  ];

  const actionColumns: ColumnDef<DisciplinaryActionRecord>[] = [
    {
      id: "action",
      header: "Action",
      accessorFn: (row) => `${row.actionType} ${row.summary}`,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.actionType}</div>
          <div className="text-xs text-muted-foreground">{row.original.summary}</div>
        </div>
      ),
      size: 108,
      minSize: 108,
      maxSize: 108},
    {
      id: "employee",
      header: "Employee",
      accessorFn: (row) => `${row.employee.name} ${row.employee.employeeId}`,
      cell: ({ row }) => (
        <div>
          {row.original.employee.name}
          <div className="text-xs text-muted-foreground">{row.original.employee.employeeId}</div>
        </div>
      ),
      size: 280,
      minSize: 220,
      maxSize: 420},
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => <Badge variant={actionStatusVariant(row.original.status)}>{row.original.status}</Badge>,
      size: 120,
      minSize: 120,
      maxSize: 120},
    {
      id: "penalty",
      header: "Penalty",
      accessorFn: (row) => row.penaltyAmount,
      cell: ({ row }) => (
        <div>
          <NumericCell>
            {row.original.penaltyCurrency} {row.original.penaltyAmount.toFixed(2)}
          </NumericCell>
          <div className="text-xs text-muted-foreground">{row.original.penaltyStatus}</div>
        </div>
      ),
      size: 160,
      minSize: 160,
      maxSize: 160},
    {
      id: "workflow",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setActionDetailsId(row.original.id)}>
            <FileText className="size-4" />
            Details
          </Button>
          {(row.original.status === "DRAFT" || row.original.status === "REJECTED") && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEditAction(row.original)}
                disabled={!canRunApprovals}
              >
                Edit
              </Button>
              <Button size="sm" onClick={() => submitActionMutation.mutate(row.original.id)} disabled={!canRunApprovals}>
                Submit
              </Button>
            </>
          )}
          {row.original.status === "SUBMITTED" && (
            <>
              <Button
                size="sm"
                onClick={() => approveActionMutation.mutate(row.original.id)}
                disabled={!canApproveOrReject(row.original)}
                title={
                  !canApproveOrReject(row.original)
                    ? "Cannot approve your own submission unless you are superadmin."
                    : undefined
                }
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectActionId(row.original.id)}
                disabled={!canApproveOrReject(row.original)}
                title={
                  !canApproveOrReject(row.original)
                    ? "Cannot reject your own submission unless you are superadmin."
                    : undefined
                }
              >
                Reject
              </Button>
            </>
          )}
          {row.original.status === "APPROVED" && (
            <Button size="sm" onClick={() => setApplyActionId(row.original.id)} disabled={!canRunApprovals}>
              Apply
            </Button>
          )}
          {(row.original.status === "DRAFT" || row.original.status === "REJECTED") && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteActionId(row.original.id)}
              disabled={!canRunApprovals}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      ),
      size: 120,
      minSize: 120,
      maxSize: 120},
  ];

  const selectedRejectAction = rejectActionId ? actionLookup.get(rejectActionId) ?? null : null;
  const selectedApplyAction = applyActionId ? actionLookup.get(applyActionId) ?? null : null;
  const selectedDeleteAction = deleteActionId ? actionLookup.get(deleteActionId) ?? null : null;
  const selectedDeleteIncident = deleteIncidentId
    ? incidentLookup.get(deleteIncidentId) ?? (incidentDetails?.id === deleteIncidentId ? incidentDetails : null)
    : null;

  const invalidateHr = () => {
    queryClient.invalidateQueries({ queryKey: ["hr-incidents"] });
    queryClient.invalidateQueries({ queryKey: ["disciplinary-actions"] });
    queryClient.invalidateQueries({ queryKey: ["hr-incident-details"] });
    queryClient.invalidateQueries({ queryKey: ["disciplinary-action-details"] });
    queryClient.invalidateQueries({ queryKey: ["approval-history"] });
  };

  const createIncidentMutation = useMutation({
    mutationFn: async (payload: IncidentForm) =>
      fetchJson("/api/hr/incidents", {
        method: "POST",
        body: JSON.stringify({
          employeeId: payload.employeeId,
          siteId: payload.siteId || undefined,
          incidentDate: payload.incidentDate,
          category: payload.category,
          severity: payload.severity,
          status: payload.status,
          title: payload.title.trim(),
          description: payload.description.trim(),
          investigationNotes: payload.investigationNotes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Incident logged", variant: "success" });
      setIncidentEditorOpen(false);
      setIncidentForm(emptyIncidentForm);
      setEditingIncidentId(null);
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to log incident",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const updateIncidentMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: IncidentForm }) =>
      fetchJson(`/api/hr/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          employeeId: payload.employeeId,
          siteId: payload.siteId || null,
          incidentDate: payload.incidentDate,
          category: payload.category,
          severity: payload.severity,
          status: payload.status,
          title: payload.title.trim(),
          description: payload.description.trim(),
          investigationNotes: payload.investigationNotes.trim() || null,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Incident updated", variant: "success" });
      setIncidentEditorOpen(false);
      setEditingIncidentId(null);
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to update incident",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const deleteIncidentMutation = useMutation({
    mutationFn: async (id: string) => fetchJson(`/api/hr/incidents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Incident deleted", variant: "success" });
      setIncidentDetailsId(null);
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to delete incident",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const createActionMutation = useMutation({
    mutationFn: async (payload: ActionForm) =>
      fetchJson("/api/hr/disciplinary-actions", {
        method: "POST",
        body: JSON.stringify({
          incidentId: payload.incidentId || undefined,
          employeeId: payload.employeeId,
          actionType: payload.actionType,
          summary: payload.summary.trim(),
          notes: payload.notes.trim() || undefined,
          effectiveDate: payload.effectiveDate || undefined,
          penaltyAmount: payload.penaltyAmount ? Number(payload.penaltyAmount) : undefined,
          penaltyCurrency: payload.penaltyCurrency || "USD",
        }),
      }),
    onSuccess: () => {
      toast({ title: "Disciplinary action created", variant: "success" });
      setActionEditorOpen(false);
      setActionForm(emptyActionForm);
      setEditingActionId(null);
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to create disciplinary action",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const updateActionMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ActionForm }) =>
      fetchJson(`/api/hr/disciplinary-actions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          incidentId: payload.incidentId || null,
          employeeId: payload.employeeId,
          actionType: payload.actionType,
          summary: payload.summary.trim(),
          notes: payload.notes.trim() || null,
          effectiveDate: payload.effectiveDate || null,
          penaltyAmount: payload.penaltyAmount ? Number(payload.penaltyAmount) : 0,
          penaltyCurrency: payload.penaltyCurrency || "USD",
        }),
      }),
    onSuccess: () => {
      toast({ title: "Disciplinary action updated", variant: "success" });
      setActionEditorOpen(false);
      setEditingActionId(null);
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to update disciplinary action",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const deleteActionMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/hr/disciplinary-actions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Disciplinary action deleted", variant: "success" });
      setActionDetailsId(null);
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to delete action",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const submitActionMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/hr/disciplinary-actions/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Action submitted", variant: "success" });
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to submit action",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const approveActionMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/hr/disciplinary-actions/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Action approved", variant: "success" });
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to approve action",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const rejectActionMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) =>
      fetchJson(`/api/hr/disciplinary-actions/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      toast({ title: "Action rejected", variant: "success" });
      setRejectActionId(null);
      setRejectNote("");
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to reject action",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const applyActionMutation = useMutation({
    mutationFn: async ({
      id,
      note,
      penaltyStatus,
    }: {
      id: string;
      note?: string;
      penaltyStatus?: "DEDUCTED" | "PAID" | "WAIVED";
    }) =>
      fetchJson(`/api/hr/disciplinary-actions/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({ note, penaltyStatus }),
      }),
    onSuccess: () => {
      toast({ title: "Action applied", variant: "success" });
      setApplyActionId(null);
      setApplyNote("");
      setApplyPenaltyStatus("DEDUCTED");
      invalidateHr();
    },
    onError: (error) =>
      toast({
        title: "Unable to apply action",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const openCreateIncident = () => {
    setEditingIncidentId(null);
    setIncidentForm(emptyIncidentForm);
    setIncidentEditorOpen(true);
  };

  const openEditIncident = (item: HrIncidentRecord) => {
    setEditingIncidentId(item.id);
    setIncidentForm({
      employeeId: item.employeeId,
      siteId: item.siteId ?? "",
      incidentDate: toDateInput(item.incidentDate),
      category: item.category,
      severity: item.severity,
      status: item.status,
      title: item.title,
      description: item.description,
      investigationNotes: item.investigationNotes ?? "",
    });
    setIncidentEditorOpen(true);
  };

  const openCreateAction = (incident?: HrIncidentRecord) => {
    setEditingActionId(null);
    if (!incident) {
      setActionForm(emptyActionForm);
    } else {
      setActionForm({
        ...emptyActionForm,
        incidentId: incident.id,
        employeeId: incident.employeeId,
      });
    }
    setActionEditorOpen(true);
  };

  const openEditAction = (item: DisciplinaryActionRecord) => {
    setEditingActionId(item.id);
    setActionForm({
      incidentId: item.incidentId ?? "",
      employeeId: item.employeeId,
      actionType: item.actionType,
      summary: item.summary,
      notes: item.notes ?? "",
      effectiveDate: toDateInput(item.effectiveDate),
      penaltyAmount: item.penaltyAmount > 0 ? String(item.penaltyAmount) : "",
      penaltyCurrency: item.penaltyCurrency || "USD",
    });
    setActionEditorOpen(true);
  };

  const handleIncidentSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!incidentForm.employeeId || !incidentForm.title.trim() || !incidentForm.description.trim()) {
      toast({ title: "Employee, title and description are required", variant: "destructive" });
      return;
    }
    if (editingIncidentId) {
      updateIncidentMutation.mutate({ id: editingIncidentId, payload: incidentForm });
    } else {
      createIncidentMutation.mutate(incidentForm);
    }
  };

  const handleActionSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!actionForm.employeeId || !actionForm.summary.trim()) {
      toast({ title: "Employee and summary are required", variant: "destructive" });
      return;
    }
    if (editingActionId) {
      updateActionMutation.mutate({ id: editingActionId, payload: actionForm });
    } else {
      createActionMutation.mutate(actionForm);
    }
  };

  const hasError = employeesError || sitesError || incidentsError || actionsError;

  return (
    <HrShell
      activeTab="incidents"
      title="Workforce Incidents"
      description="Manage incidents and disciplinary workflows."
      actions={
        <div className="flex gap-2">
          <Button size="sm" onClick={openCreateIncident} disabled={!canRunApprovals}>
            <Plus className="size-4" />
            Log Incident
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openCreateAction()}
            disabled={!canRunApprovals}
          >
            <Plus className="size-4" />
            New Action
          </Button>
        </div>
      }
    >
      {hasError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load incidents workspace</AlertTitle>
          <AlertDescription>{getApiErrorMessage(hasError)}</AlertDescription>
        </Alert>
      )}

      {!canRunApprovals && (
        <Alert variant="warning">
          <AlertTitle>Read-only mode</AlertTitle>
          <AlertDescription>
            You can view incidents and disciplinary actions, but approvals and edits require manager
            or superadmin access.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Open Incidents</CardDescription>
            <CardTitle>{summary.openIncidents}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Critical Incidents</CardDescription>
            <CardTitle>{summary.criticalIncidents}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Incidents with Actions</CardDescription>
            <CardTitle>{summary.incidentsWithActions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Actions Pending Approval</CardDescription>
            <CardTitle>{summary.pendingActionApprovals}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <VerticalDataViews
        items={[
          { id: "incidents", label: "Incidents", count: incidents.length },
          { id: "actions", label: "Disciplinary Actions", count: actions.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "incidents" | "actions")}
        railLabel="Workforce Views"
      >
        {activeView === "incidents" ? (
          <>
            <header className="section-shell space-y-1">
              <h2 className="text-section-title text-foreground font-bold tracking-tight">Incidents</h2>
              <p className="text-sm text-muted-foreground">
                Log, review, and investigate workforce incidents.
              </p>
            </header>

            {incidentsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : incidents.length === 0 ? (
              <div className="section-shell text-sm text-muted-foreground">No incidents found.</div>
            ) : (
              <DataTable
                data={incidents}
                columns={incidentColumns}
                queryState={incidentQuery}
                onQueryStateChange={(next) => setIncidentQuery((prev) => ({ ...prev, ...next }))}
                searchPlaceholder="Search title or notes"
                searchSubmitLabel="Search"
                toolbar={
                  <Select
                    value={incidentStatusFilter}
                    onValueChange={(value) => {
                      setIncidentStatusFilter(value);
                      setIncidentQuery((prev) => ({ ...prev, page: 1 }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All statuses</SelectItem>
                      {incidentStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
                tableClassName="text-sm"
                pagination={{ enabled: true }}
              />
            )}
          </>
        ) : null}

        {activeView === "actions" ? (
          <>
            <header className="section-shell space-y-1">
              <h2 className="text-section-title text-foreground font-bold tracking-tight">
                Disciplinary Workflow
              </h2>
              <p className="text-sm text-muted-foreground">
                Submit, approve, reject, and apply disciplinary actions.
              </p>
            </header>

            {actionsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : actions.length === 0 ? (
              <div className="section-shell text-sm text-muted-foreground">
                No disciplinary actions found.
              </div>
            ) : (
              <DataTable
                data={actions}
                columns={actionColumns}
                queryState={actionsQuery}
                onQueryStateChange={(next) => setActionsQuery((prev) => ({ ...prev, ...next }))}
                searchPlaceholder="Search action summary or employee"
                searchSubmitLabel="Search"
                toolbar={
                  <Select
                    value={actionStatusFilter}
                    onValueChange={(value) => {
                      setActionStatusFilter(value);
                      setActionsQuery((prev) => ({ ...prev, page: 1 }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All statuses</SelectItem>
                      {actionStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
                tableClassName="text-sm"
                pagination={{ enabled: true }}
              />
            )}
          </>
        ) : null}
      </VerticalDataViews>

      <Dialog open={incidentEditorOpen} onOpenChange={setIncidentEditorOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editingIncidentId ? "Edit Incident" : "Log Incident"}</DialogTitle>
            <DialogDescription>Capture key details with clear labels and structured fields.</DialogDescription>
          </DialogHeader>
          {(employeesLoading || sitesLoading) ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <form className="grid gap-4" onSubmit={handleIncidentSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold">Employee</label>
                  <Select
                    value={incidentForm.employeeId || "none"}
                    onValueChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, employeeId: value === "none" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select employee</SelectItem>
                      {employees.map((employee: EmployeeSummary) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name} ({employee.employeeId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Site</label>
                  <Select
                    value={incidentForm.siteId || "none"}
                    onValueChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, siteId: value === "none" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional site" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No site</SelectItem>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.code} - {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold">Date</label>
                  <Input
                    type="date"
                    value={incidentForm.incidentDate}
                    onChange={(event) => setIncidentForm((prev) => ({ ...prev, incidentDate: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Category</label>
                  <Select
                    value={incidentForm.category}
                    onValueChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, category: value as IncidentForm["category"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {incidentCategoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Severity</label>
                  <Select
                    value={incidentForm.severity}
                    onValueChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, severity: value as IncidentForm["severity"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {incidentSeverityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Status</label>
                  <Select
                    value={incidentForm.status}
                    onValueChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, status: value as IncidentForm["status"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {incidentStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Title</label>
                <Input
                  value={incidentForm.title}
                  onChange={(event) => setIncidentForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Incident headline"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Description</label>
                <Textarea
                  value={incidentForm.description}
                  onChange={(event) => setIncidentForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="What happened?"
                  rows={4}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Investigation Notes</label>
                <Textarea
                  value={incidentForm.investigationNotes}
                  onChange={(event) =>
                    setIncidentForm((prev) => ({ ...prev, investigationNotes: event.target.value }))
                  }
                  placeholder="Optional"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIncidentEditorOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createIncidentMutation.isPending || updateIncidentMutation.isPending}>
                  {editingIncidentId ? "Save Changes" : "Log Incident"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={actionEditorOpen} onOpenChange={setActionEditorOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editingActionId ? "Edit Disciplinary Action" : "Create Disciplinary Action"}</DialogTitle>
            <DialogDescription>Create draft actions and progress them through approvals.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleActionSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Employee</label>
                <Select
                  value={actionForm.employeeId || "none"}
                  onValueChange={(value) =>
                    setActionForm((prev) => ({ ...prev, employeeId: value === "none" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select employee</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name} ({employee.employeeId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Linked Incident</label>
                <Select
                  value={actionForm.incidentId || "none"}
                  onValueChange={(value) => {
                    const incidentId = value === "none" ? "" : value;
                    const incident = incidentId ? incidentLookup.get(incidentId) : null;
                    setActionForm((prev) => ({
                      ...prev,
                      incidentId,
                      employeeId: incident ? incident.employeeId : prev.employeeId,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional link" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked incident</SelectItem>
                    {incidents.map((incident) => (
                      <SelectItem key={incident.id} value={incident.id}>
                        {incident.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold">Action Type</label>
                <Select
                  value={actionForm.actionType}
                  onValueChange={(value) =>
                    setActionForm((prev) => ({ ...prev, actionType: value as ActionForm["actionType"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actionTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Effective Date</label>
                <Input
                  type="date"
                  value={actionForm.effectiveDate}
                  onChange={(event) => setActionForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Penalty Amount</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={actionForm.penaltyAmount}
                  onChange={(event) => setActionForm((prev) => ({ ...prev, penaltyAmount: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Summary</label>
              <Input
                value={actionForm.summary}
                onChange={(event) => setActionForm((prev) => ({ ...prev, summary: event.target.value }))}
                placeholder="Action summary"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Notes</label>
              <Textarea
                value={actionForm.notes}
                onChange={(event) => setActionForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={4}
                placeholder="Optional notes"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setActionEditorOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createActionMutation.isPending || updateActionMutation.isPending}>
                {editingActionId ? "Save Changes" : "Create Action"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(incidentDetailsId)} onOpenChange={(open) => !open && setIncidentDetailsId(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Incident Details</DialogTitle>
            <DialogDescription>Review details and trigger immediate workflow actions.</DialogDescription>
          </DialogHeader>
          {incidentDetailsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : incidentDetailsError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load incident details</AlertTitle>
              <AlertDescription>{getApiErrorMessage(incidentDetailsError)}</AlertDescription>
            </Alert>
          ) : incidentDetails ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4 text-sm">
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <Badge variant={incidentStatusVariant(incidentDetails.status)}>
                    {incidentDetails.status}
                  </Badge>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Severity</div>
                  <Badge variant={incidentSeverityVariant(incidentDetails.severity)}>
                    {incidentDetails.severity}
                  </Badge>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Employee</div>
                  <div className="font-medium">{incidentDetails.employee.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {incidentDetails.employee.employeeId}
                  </div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Incident Date</div>
                  <div>{format(new Date(incidentDetails.incidentDate), "yyyy-MM-dd")}</div>
                </div>
              </div>
              <div className="rounded-md border-0 p-3 shadow-[var(--surface-frame-shadow)]">
                <div className="font-medium">{incidentDetails.title}</div>
                <div className="text-sm text-muted-foreground">{incidentDetails.description}</div>
              </div>

              <div className="rounded-md border-0 p-3 shadow-[var(--surface-frame-shadow)]">
                <div className="text-xs text-muted-foreground">Investigation Notes</div>
                <div className="text-sm">{incidentDetails.investigationNotes || "-"}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Site</div>
                  <div>
                    {incidentDetails.site
                      ? `${incidentDetails.site.code} - ${incidentDetails.site.name}`
                      : "-"}
                  </div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Reported By</div>
                  <div>{incidentDetails.reportedBy?.name ?? "-"}</div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Resolved By</div>
                  <div>{incidentDetails.resolvedBy?.name ?? "-"}</div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => openEditIncident(incidentDetails)}
                  disabled={!canRunApprovals}
                >
                  Edit
                </Button>
                <Button onClick={() => openCreateAction(incidentDetails)} disabled={!canRunApprovals}>
                  Create Action
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteIncidentId(incidentDetails.id)}
                  disabled={!canRunApprovals || (incidentDetails._count?.actions ?? 0) > 0}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No incident details found.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(actionDetailsId)} onOpenChange={(open) => !open && setActionDetailsId(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Disciplinary Action Details</DialogTitle>
            <DialogDescription>Inspect workflow state, then continue actioning.</DialogDescription>
          </DialogHeader>
          {actionDetailsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : actionDetailsError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load action details</AlertTitle>
              <AlertDescription>{getApiErrorMessage(actionDetailsError)}</AlertDescription>
            </Alert>
          ) : actionDetails ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4 text-sm">
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <Badge variant={actionStatusVariant(actionDetails.status)}>
                    {actionDetails.status}
                  </Badge>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Type</div>
                  <div>{actionDetails.actionType}</div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Penalty</div>
                  <div>
                    {actionDetails.penaltyCurrency} {actionDetails.penaltyAmount.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Penalty Status</div>
                  <div>{actionDetails.penaltyStatus}</div>
                </div>
              </div>
              <div className="rounded-md border-0 p-3 shadow-[var(--surface-frame-shadow)]">
                <div className="font-medium">{actionDetails.summary}</div>
                <div className="text-sm text-muted-foreground">{actionDetails.notes || "-"}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Employee</div>
                  <div>{actionDetails.employee.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {actionDetails.employee.employeeId}
                  </div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Linked Incident</div>
                  <div>{actionDetails.incident?.title ?? "-"}</div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Effective Date</div>
                  <div>
                    {actionDetails.effectiveDate
                      ? format(new Date(actionDetails.effectiveDate), "yyyy-MM-dd")
                      : "-"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No disciplinary action details found.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejectActionId)} onOpenChange={(open) => !open && setRejectActionId(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Reject Disciplinary Action</DialogTitle>
            <DialogDescription>Provide a rejection note for audit history and rework.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border-0 p-3 text-sm shadow-[var(--surface-frame-shadow)]">
              <div className="text-xs text-muted-foreground">Action</div>
              <div className="font-medium">{selectedRejectAction?.summary ?? "-"}</div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Rejection Note</label>
              <Textarea
                value={rejectNote}
                onChange={(event) => setRejectNote(event.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Explain why this is rejected"
              />
              <div className="text-xs text-muted-foreground">{rejectNote.length}/1000</div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectActionId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!rejectNote.trim() || rejectNote.length > 1000 || rejectActionMutation.isPending}
                onClick={() => {
                  if (!rejectActionId) return;
                  rejectActionMutation.mutate({ id: rejectActionId, note: rejectNote.trim() });
                }}
              >
                Reject Action
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(applyActionId)} onOpenChange={(open) => !open && setApplyActionId(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Apply Disciplinary Action</DialogTitle>
            <DialogDescription>Record application details and penalty settlement state.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border-0 p-3 text-sm shadow-[var(--surface-frame-shadow)]">
              <div className="text-xs text-muted-foreground">Action</div>
              <div className="font-medium">{selectedApplyAction?.summary ?? "-"}</div>
            </div>
            {(selectedApplyAction?.penaltyAmount ?? 0) > 0 ? (
              <div>
                <label className="mb-2 block text-sm font-semibold">Penalty Status</label>
                <Select
                  value={applyPenaltyStatus}
                  onValueChange={(value) =>
                    setApplyPenaltyStatus(value as "DEDUCTED" | "PAID" | "WAIVED")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actionPenaltyStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <label className="mb-2 block text-sm font-semibold">Application Note</label>
              <Textarea
                value={applyNote}
                onChange={(event) => setApplyNote(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Optional note"
              />
              <div className="text-xs text-muted-foreground">{applyNote.length}/1000</div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setApplyActionId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={applyActionMutation.isPending || applyNote.length > 1000}
                onClick={() => {
                  if (!applyActionId) return;
                  applyActionMutation.mutate({
                    id: applyActionId,
                    note: applyNote.trim() || undefined,
                    penaltyStatus:
                      (selectedApplyAction?.penaltyAmount ?? 0) > 0
                        ? applyPenaltyStatus
                        : undefined,
                  });
                }}
              >
                Apply Action
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteActionId)} onOpenChange={(open) => !open && setDeleteActionId(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete Disciplinary Action</DialogTitle>
            <DialogDescription>
              This removes the draft/rejected action permanently. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border-0 p-3 text-sm shadow-[var(--surface-frame-shadow)]">
              <div className="text-xs text-muted-foreground">Action</div>
              <div className="font-medium">{selectedDeleteAction?.summary ?? "-"}</div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteActionId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!deleteActionId || deleteActionMutation.isPending}
                onClick={() => {
                  if (!deleteActionId) return;
                  deleteActionMutation.mutate(deleteActionId);
                }}
              >
                Delete Action
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteIncidentId)} onOpenChange={(open) => !open && setDeleteIncidentId(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete Incident</DialogTitle>
            <DialogDescription>
              Incidents with linked disciplinary actions cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border-0 p-3 text-sm shadow-[var(--surface-frame-shadow)]">
              <div className="text-xs text-muted-foreground">Incident</div>
              <div className="font-medium">{selectedDeleteIncident?.title ?? "-"}</div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteIncidentId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  !deleteIncidentId ||
                  deleteIncidentMutation.isPending ||
                  (selectedDeleteIncident?._count?.actions ?? 0) > 0
                }
                onClick={() => {
                  if (!deleteIncidentId) return;
                  deleteIncidentMutation.mutate(deleteIncidentId);
                }}
              >
                Delete Incident
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </HrShell>
  );
}

