"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import {
  FormField,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RegisterLayout,
  SectionHeading,
  StatusDot,
  type ListColumnState,
  type StatusTone,
} from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchInspections, fetchSites, fetchUsers, type InspectionRecord } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CalendarCheck, Check, ListBullets, ShieldCheck, SlidersHorizontal } from "@/lib/icons";

import {
  ActivitySection,
  CONTROL_CLASS,
  DetailField,
  DetailGrid,
  InlineText,
  InlineTextarea,
  RegisterFilter,
  RegisterFilters,
  StaticValue,
  toDateInput,
} from "./record-fields";

/**
 * Inspections, as `Inspections.dc.html` draws it.
 *
 * The board's status is a **list column**, not a header badge: every row shows
 * where its inspection stands, and the record above it says so in its dates
 * rather than repeating itself in a chip (rule 5).
 *
 * Presentation only — the query keys, endpoints and toasts are the ones this
 * screen already used.
 */

type InspectionForm = {
  siteId: string;
  inspectionDate: string;
  inspectorName: string;
  inspectorOrg: string;
  findings: string;
  actions: string;
  actionsDue: string;
  documentUrl: string;
};

const emptyForm: InspectionForm = {
  siteId: "",
  inspectionDate: "",
  inspectorName: "",
  inspectorOrg: "",
  findings: "",
  actions: "",
  actionsDue: "",
  documentUrl: "",
};

const TODAY_ISO = new Date().toISOString().slice(0, 10);

/** `DetailField`'s label metrics, for the one row that has no control. */
const DETAIL_LABEL = {
  font: "400 12px/1.45 var(--font-sans)",
  color: "#5E6573",
} as const;

const inspectionStatus = (row: InspectionRecord) => {
  const overdue =
    Boolean(row.actionsDue) && !row.completedAt && toDateInput(row.actionsDue) < TODAY_ISO;
  return overdue ? "OVERDUE" : row.completedAt ? "COMPLETED" : "OPEN";
};

const STATUS_LABEL: Record<string, string> = {
  OVERDUE: "Overdue",
  COMPLETED: "Closed",
  OPEN: "Open",
};

const STATUS_TONE: Record<string, StatusTone> = {
  OVERDUE: "danger",
  COMPLETED: "success",
  OPEN: "neutral",
};

export function InspectionsTab({
  createdId,
  banner,
}: {
  createdId: string | null;
  banner?: ReactNode;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState("all");
  const [overdueFilter, setOverdueFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Server-side filter; deferring keeps one request per pause, not keystroke.
  const deferredSearch = useDeferredValue(search);
  const [selectedId, setSelectedId] = useState<string | null>(createdId);
  const [creating, setCreating] = useState(false);
  const [recordingOutcome, setRecordingOutcome] = useState(false);
  const [outcomeDate, setOutcomeDate] = useState(TODAY_ISO);
  const [outcomeById, setOutcomeById] = useState("");
  const [form, setForm] = useState<InspectionForm>(emptyForm);

  const { data: sites, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users", "compliance", "inspections"],
    queryFn: () => fetchUsers({ limit: 500 }),
  });
  const users = useMemo(() => usersData?.data ?? [], [usersData]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["compliance", "inspections", siteFilter, overdueFilter, deferredSearch],
    queryFn: () =>
      fetchInspections({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        overdue: overdueFilter === "overdue" ? true : undefined,
        search: deferredSearch || undefined,
        limit: 500,
      }),
  });

  // An empty list under a filter is "no matches", not "there are none".
  const narrowed = siteFilter !== "all" || overdueFilter !== "all";

  const inspections = useMemo(() => data?.data ?? [], [data]);

  // The list is the screen; a record has to be open for the right column to be
  // anything. The first row stands in until somebody picks another. Derived
  // during render, so the selection never lags a frame behind the rows.
  const activeId =
    selectedId && inspections.some((row) => row.id === selectedId)
      ? selectedId
      : (inspections[0]?.id ?? null);

  const record = inspections.find((row) => row.id === activeId) ?? null;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createdId", id);
    params.set("source", "inspection");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance/inspections?${params.toString()}`);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: InspectionForm) =>
      fetchJson<InspectionRecord>("/api/compliance/inspections", {
        method: "POST",
        body: JSON.stringify({
          siteId: payload.siteId,
          inspectionDate: payload.inspectionDate,
          inspectorName: payload.inspectorName,
          inspectorOrg: payload.inspectorOrg,
          findings: payload.findings,
          actions: payload.actions || undefined,
          actionsDue: payload.actionsDue || undefined,
          documentUrl: payload.documentUrl || undefined,
        }),
      }),
    onSuccess: (inspection) => {
      toast({
        title: "Inspection created",
        description: "Inspection record saved successfully.",
        variant: "success",
      });
      setCreating(false);
      setForm(emptyForm);
      setSelectedId(inspection.id);
      queryClient.invalidateQueries({ queryKey: ["compliance", "inspections"] });
      pushSaved(inspection.id, inspection.createdAt);
    },
    onError: (saveError) => {
      toast({
        title: "Unable to save inspection",
        description: getApiErrorMessage(saveError),
        variant: "destructive",
      });
    },
  });

  /** One field at a time, against the endpoint the dialog used. */
  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      fetchJson<InspectionRecord>(`/api/compliance/inspections/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance", "inspections"] });
    },
    onError: (patchError) => {
      toast({
        title: "Unable to save inspection",
        description: getApiErrorMessage(patchError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compliance/inspections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Inspection deleted",
        description: "Inspection was removed.",
        variant: "success",
      });
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["compliance", "inspections"] });
    },
    onError: (deleteError) => {
      toast({
        title: "Unable to delete inspection",
        description: getApiErrorMessage(deleteError),
        variant: "destructive",
      });
    },
  });

  const patch = (body: Record<string, unknown>) => {
    if (!record) return;
    patchMutation.mutate({ id: record.id, body });
  };

  const openCreate = () => {
    setForm({
      ...emptyForm,
      // The site being looked at is the site the new inspection is most
      // likely for.
      siteId: siteFilter !== "all" ? siteFilter : (sites?.[0]?.id ?? ""),
      inspectionDate: TODAY_ISO,
    });
    setCreating(true);
  };

  const state: ListColumnState = isLoading
    ? "loading"
    : isError || sitesError
      ? "failed"
      : inspections.length > 0
        ? "ready"
        : deferredSearch.trim() || narrowed
          ? "no-matches"
          : "empty";

  return (
    <ManagementShell title="Inspections">
      <RegisterLayout
        hasSelection={Boolean(record)}
        list={
          <ListColumn
            title="Inspections"
            noun="inspection"
            count={isLoading ? undefined : inspections.length}
            state={state}
            columns={{ row: "Inspection", value: "Status" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Inspector, organisation, findings",
            }}
            /* Site and overdue, the two this register has always filtered on.
               Both are the endpoint's — `siteId` and `overdue=true` — so the
               count beside the title counts what the filter asked for. */
            filters={
              <RegisterFilters>
                <RegisterFilter
                  label="Filter inspections by site"
                  value={siteFilter}
                  onChange={setSiteFilter}
                  options={[
                    { value: "all", label: "Any site" },
                    ...(sites ?? []).map((site) => ({
                      value: site.id,
                      label: site.name,
                    })),
                  ]}
                />
                <RegisterFilter
                  label="Filter inspections by whether actions are overdue"
                  value={overdueFilter}
                  onChange={setOverdueFilter}
                  options={[
                    { value: "all", label: "Any inspection" },
                    { value: "overdue", label: "Overdue only" },
                  ]}
                />
              </RegisterFilters>
            }
            onNew={openCreate}
            onRetry={() => void refetch()}
            emptyLabel="No inspections"
          >
            {inspections.map((row) => {
              const status = inspectionStatus(row);
              return (
                <ListRow
                  key={row.id}
                  code={row.site.code}
                  name={row.inspectorName}
                  /* Rule 5: in a list column the status is a column, and the
                     value in it is the dot and the word — a chip on every row
                     would read as a column of buttons. */
                  value={
                    <StatusDot
                      tone={STATUS_TONE[status]!}
                      label={STATUS_LABEL[status]!}
                    />
                  }
                  selected={row.id === activeId}
                  onSelect={() => setSelectedId(row.id)}
                />
              );
            })}
          </ListColumn>
        }
      >
        {banner}
        {record ? (
          <>
            <RecordHeader
              title={record.inspectorName}
              icon={ShieldCheck}
              /* `min(1)` on the endpoint: an emptied name would be a 400 and a
                 toast, so nothing is committed and the title stays as it was. */
              onRename={(next) =>
                next.trim() ? patch({ inspectorName: next.trim() }) : undefined
              }
              renameLabel="Rename the inspector"
              /* Rule 5 and this group's brief: an inspection's status is a list
                 column, so the record header carries no chip. */
              action={
                record.completedAt ? undefined : (
                  <HeaderAction
                    icon={Check}
                    onClick={() => {
                      setOutcomeDate(TODAY_ISO);
                      setOutcomeById(record.completedById ?? "");
                      setRecordingOutcome(true);
                    }}
                  >
                    Record outcome
                  </HeaderAction>
                )
              }
              overflow={
                <>
                  {record.completedAt ? (
                    <DropdownMenuItem
                      onSelect={() => patch({ completedAt: null, completedById: null })}
                    >
                      Reopen the inspection
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() => {
                      void (async () => {
                        const confirmed = await dsConfirm({
                          title: "Delete this inspection?",
                          description:
                            "The inspection, its findings and its due actions leave the register.",
                          confirmLabel: "Delete the inspection",
                          variant: "danger",
                        });
                        if (confirmed) deleteMutation.mutate(record.id);
                      })();
                    }}
                  >
                    Delete the inspection
                  </DropdownMenuItem>
                </>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              {/* `siteId` is absent from the PATCH schema — a fact, not a
                  field. A plain span rather than a `<label for>`, because
                  there is no control here for one to point at. */}
              <span style={DETAIL_LABEL}>Site</span>
              <StaticValue>{record.site.name}</StaticValue>
              <DetailField label="Carried out">
                {(id) => (
                  <InlineText
                    id={id}
                    type="date"
                    value={toDateInput(record.inspectionDate)}
                    onCommit={(next) => (next ? patch({ inspectionDate: next }) : undefined)}
                  />
                )}
              </DetailField>
              <DetailField label="Organisation">
                {(id) => (
                  <InlineText
                    id={id}
                    value={record.inspectorOrg}
                    onCommit={(next) =>
                      next.trim() ? patch({ inspectorOrg: next.trim() }) : undefined
                    }
                  />
                )}
              </DetailField>
              <DetailField label="Actions due">
                {(id) => (
                  <InlineText
                    id={id}
                    type="date"
                    value={toDateInput(record.actionsDue)}
                    onCommit={(next) => patch({ actionsDue: next || null })}
                  />
                )}
              </DetailField>
              <DetailField label="Completed">
                {(id) => (
                  <InlineText
                    id={id}
                    type="date"
                    value={toDateInput(record.completedAt)}
                    onCommit={(next) => patch({ completedAt: next || null })}
                  />
                )}
              </DetailField>
              <DetailField label="Signed off by">
                {(id) => (
                  <Select
                    value={record.completedById ?? "none"}
                    onValueChange={(value) =>
                      patch({ completedById: value === "none" ? null : value })
                    }
                  >
                    <SelectTrigger id={id} className={CONTROL_CLASS}>
                      <SelectValue placeholder="Nobody yet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nobody yet</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </DetailField>
              <DetailField label="Document">
                {(id) => (
                  <InlineText
                    id={id}
                    type="url"
                    placeholder="https://"
                    value={record.documentUrl ?? ""}
                    onCommit={(next) => patch({ documentUrl: next.trim() || null })}
                  />
                )}
              </DetailField>
            </DetailGrid>

            {/* The board draws Findings as a numbered list with a status each.
                `Inspection.findings` is one text column — there is no finding
                row and no per-finding status to read — so the section draws the
                text the record actually holds rather than inventing rows. */}
            <SectionHeading icon={ListBullets}>Findings</SectionHeading>
            <div style={{ maxWidth: 470 }}>
              <InlineTextarea
                rows={4}
                ariaLabel="Findings"
                value={record.findings}
                onCommit={(next) => (next.trim() ? patch({ findings: next }) : undefined)}
              />
            </div>

            <SectionHeading icon={CalendarCheck}>Actions</SectionHeading>
            <div style={{ maxWidth: 470 }}>
              <InlineTextarea
                rows={3}
                ariaLabel="Actions"
                value={record.actions ?? ""}
                onCommit={(next) => patch({ actions: next.trim() || null })}
              />
            </div>

            {/* Rule 12's section, the same one the other three compliance
                registers draw. It would hold real `PlatformAuditEvent` rows
                the moment a route returns them for an inspection;
                `/api/users/[id]/audit` is the only one that reads that table
                back today, and adding another is a data-fetching change this
                refactor does not make — so the section says what it has. No
                "Chain verified" footer: `lib/audit/platform.ts` documents that
                concurrent writes fork the chain, so the claim cannot be made
                from row order. */}
            <ActivitySection />
          </>
        ) : null}
      </RegisterLayout>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) saveMutation.reset();
        }}
      >
        <DialogContent size="md" className="w-full">
          <DialogHeader>
            <DialogTitle>New inspection</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <FormField label="Site">
              {(id) => (
                <Select
                  value={form.siteId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, siteId: value }))}
                >
                  <SelectTrigger id={id} className={CONTROL_CLASS}>
                    <SelectValue placeholder="Select site" />
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
            </FormField>
            <FormField label="Carried out">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="date"
                  className={CONTROL_CLASS}
                  value={form.inspectionDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, inspectionDate: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Inspector">
              {(id) => (
                <Input
                  id={id}
                  required
                  className={CONTROL_CLASS}
                  value={form.inspectorName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, inspectorName: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Organisation">
              {(id) => (
                <Input
                  id={id}
                  required
                  className={CONTROL_CLASS}
                  value={form.inspectorOrg}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, inspectorOrg: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Findings">
              {(id) => (
                <Textarea
                  id={id}
                  required
                  rows={3}
                  className={CONTROL_CLASS}
                  value={form.findings}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, findings: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Actions">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  className={CONTROL_CLASS}
                  value={form.actions}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, actions: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Actions due">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  className={CONTROL_CLASS}
                  value={form.actionsDue}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, actionsDue: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Document">
              {(id) => (
                <Input
                  id={id}
                  type="url"
                  placeholder="https://"
                  className={CONTROL_CLASS}
                  value={form.documentUrl}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, documentUrl: event.target.value }))
                  }
                />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Create inspection"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* The header's one verb. "Record outcome" is the two fields that close an
          inspection — the date it was signed off and who signed it — written
          through the same PATCH. */}
      <Dialog open={recordingOutcome} onOpenChange={setRecordingOutcome}>
        <DialogContent size="sm" className="w-full">
          <DialogHeader>
            <DialogTitle>Record the outcome</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!outcomeDate) return;
              patch({
                completedAt: outcomeDate,
                completedById: outcomeById || null,
              });
              setRecordingOutcome(false);
            }}
          >
            <FormField label="Completed">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="date"
                  className={CONTROL_CLASS}
                  value={outcomeDate}
                  onChange={(event) => setOutcomeDate(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="Signed off by">
              {(id) => (
                <Select
                  value={outcomeById || "none"}
                  onValueChange={(value) => setOutcomeById(value === "none" ? "" : value)}
                >
                  <SelectTrigger id={id} className={CONTROL_CLASS}>
                    <SelectValue placeholder="Nobody yet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nobody yet</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={patchMutation.isPending}>
                Record outcome
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRecordingOutcome(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}
