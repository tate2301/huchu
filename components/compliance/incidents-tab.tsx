"use client";

import {
  useDeferredValue,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import {
  FormField,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionAction,
  SectionHeading,
  StatusBadge,
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
import { fetchIncidents, fetchSites, type IncidentRecord } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  AlertTriangle,
  Check,
  ListBullets,
  ListChecks,
  Paperclip,
  Plus,
  SlidersHorizontal,
  X,
} from "@/lib/icons";

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
} from "./record-fields";

/**
 * Incidents, as `Incidents.dc.html` draws it.
 *
 * One of the two records in this group that keeps a header badge: an incident
 * that is still open or still under review is an exception by definition, which
 * is exactly what rule 5 keeps a chip for.
 *
 * Presentation only — query keys, endpoints and toasts are unchanged.
 */

type IncidentForm = {
  siteId: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  description: string;
  actionsTaken: string;
  reportedBy: string;
};

const emptyForm: IncidentForm = {
  siteId: "",
  incidentDate: "",
  incidentType: "",
  severity: "MEDIUM",
  description: "",
  actionsTaken: "",
  reportedBy: "",
};

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const SEVERITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  INVESTIGATING: "In review",
  CLOSED: "Closed",
};

const STATUS_TONE: Record<string, StatusTone> = {
  OPEN: "warn",
  INVESTIGATING: "warn",
  CLOSED: "neutral",
};

const statusLabel = (value: string) => STATUS_LABEL[value] ?? value;
const statusTone = (value: string): StatusTone => STATUS_TONE[value] ?? "neutral";

/**
 * The filter rows' options. The values are the ones
 * `app/api/compliance/incidents/route.ts` reads out of the query string; only
 * the words are the reader's.
 */
const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Any status" },
  ...["OPEN", "INVESTIGATING", "CLOSED"].map((value) => ({
    value,
    label: statusLabel(value),
  })),
];

const SEVERITY_FILTER_OPTIONS = [
  { value: "all", label: "Any severity" },
  ...SEVERITIES.map((value) => ({ value, label: SEVERITY_LABEL[value]! })),
];

/**
 * Corrective actions.
 *
 * `Incidents.dc.html` draws them as a numbered list with an Action column and
 * a Status column, and puts `Add action` on the heading. `Incident` carries
 * one nullable text column, `actionsTaken` (`prisma/schema.prisma:6533`), and
 * the PATCH schema takes that one string — so the list is a reading of that
 * string rather than a table the endpoint does not have:
 *
 *   - one line, one action, in the order the register keeps them;
 *   - a line marked with `✓ ` is done, anything else is open.
 *
 * Free text written before this screen existed survives the round trip: it
 * parses as open actions and is written back unchanged unless somebody marks
 * one done. Nothing outside the incident endpoints reads the column except the
 * list's own `contains` search.
 */
type CorrectiveAction = { text: string; done: boolean };

const DONE_MARK = "✓ ";

const parseActions = (value?: string | null): CorrectiveAction[] => {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith(DONE_MARK)
        ? { text: line.slice(DONE_MARK.length).trim(), done: true }
        : { text: line, done: false },
    );
};

const serializeActions = (actions: CorrectiveAction[]) =>
  actions.map((action) => (action.done ? `${DONE_MARK}${action.text}` : action.text)).join("\n");

const COLUMN_LABEL: CSSProperties = {
  font: "500 11px/1.5 var(--font-sans)",
  color: "#5E6573",
};

/**
 * The width the Status header label and every row's status share.
 * `Incidents.dc.html` draws the column at `min-width: 80px`.
 */
const STATUS_WIDTH = 80;

/**
 * The board's corrective-actions list.
 *
 * Hand-rolled at the call site rather than through `RecordList` because the
 * shared component is read-only — its rows take a value, not a control — and
 * an action list whose status cannot be changed is a list that cannot be
 * worked. The geometry is `RecordList`'s, value for value (column header
 * `0 0 7px` over a `#E5E8EE` rule, rows `min-height 38`, `gap 12`, a
 * `#EEF0F4` rule between them, mono code, name `400 13/1.5 #262A33`), and the
 * status reuses the shared `StatusDot` so the dot cannot drift.
 */
function CorrectiveActionList({
  actions,
  onToggle,
  onRemove,
}: {
  actions: CorrectiveAction[];
  onToggle: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          maxWidth: 470,
          padding: "0 0 7px",
          borderBottom: "1px solid #E5E8EE",
        }}
      >
        <span style={{ ...COLUMN_LABEL, flexGrow: 1, minWidth: 0 }}>Action</span>
        <span
          style={{
            ...COLUMN_LABEL,
            flexShrink: 0,
            minWidth: STATUS_WIDTH,
            textAlign: "right",
          }}
        >
          Status
        </span>
        {/* Holds the column over the rows' remove button. */}
        <span aria-hidden="true" style={{ flexShrink: 0, width: 20 }} />
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", maxWidth: 470 }}>
        {actions.map((action, index) => (
          <li
            key={`${index}-${action.text}`}
            className="group"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minHeight: 38,
              borderBottom: index === actions.length - 1 ? "none" : "1px solid #EEF0F4",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                font: "500 11px/1.5 var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: "#5E6573",
              }}
            >
              {index + 1}
            </span>
            <span
              style={{
                flexGrow: 1,
                minWidth: 0,
                font: "400 13px/1.5 var(--font-sans)",
                color: "#262A33",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {action.text}
            </span>
            <button
              type="button"
              onClick={() => onToggle(index)}
              aria-label={
                action.done
                  ? `Reopen “${action.text}”`
                  : `Mark “${action.text}” done`
              }
              className="rounded-[6px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(11,93,240,.22)]"
              style={{
                flexShrink: 0,
                minWidth: STATUS_WIDTH,
                display: "inline-flex",
                justifyContent: "flex-end",
                background: "transparent",
                border: 0,
                padding: 0,
                cursor: "pointer",
              }}
            >
              {action.done ? (
                <span style={{ font: "400 12px/1.45 var(--font-sans)", color: "#565C69" }}>
                  Done
                </span>
              ) : (
                <StatusDot tone="warn" label="Open" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`Remove “${action.text}”`}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(11,93,240,.22)]"
              style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
            >
              <X className="size-3.5" style={{ color: "#8A91A0" }} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * `incidentDate` as a `datetime-local` control reads it, and back.
 *
 * The column is a UTC instant; `datetime-local` has no zone and shows whatever
 * string it is given as local time, so the offset has to be applied in both
 * directions or every edit walks the record by the reader's offset. The PATCH
 * schema takes `z.string().datetime()`, which is exactly what `toISOString`
 * produces.
 */
const toLocalInput = (value?: string | null) => {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const fromLocalInput = (value: string) => {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

const parsePhotoUrls = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function IncidentsTab({
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Server-side filter; deferring keeps one request per pause, not keystroke.
  const deferredSearch = useDeferredValue(search);
  const [selectedId, setSelectedId] = useState<string | null>(createdId);
  const [creating, setCreating] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [actionDraft, setActionDraft] = useState("");
  const [form, setForm] = useState<IncidentForm>(emptyForm);

  const { data: sites, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "compliance",
      "incidents",
      siteFilter,
      statusFilter,
      severityFilter,
      deferredSearch,
    ],
    queryFn: () =>
      fetchIncidents({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        severity: severityFilter === "all" ? undefined : severityFilter,
        search: deferredSearch || undefined,
        limit: 500,
      }),
  });

  // An empty list under a filter is "no matches", not "there are none".
  const narrowed =
    siteFilter !== "all" || statusFilter !== "all" || severityFilter !== "all";

  const incidents = useMemo(() => data?.data ?? [], [data]);

  // The list is the screen; a record has to be open for the right column to be
  // anything. The first row stands in until somebody picks another. Derived
  // during render, so the selection never lags a frame behind the rows.
  const activeId =
    selectedId && incidents.some((row) => row.id === selectedId)
      ? selectedId
      : (incidents[0]?.id ?? null);

  const record = incidents.find((row) => row.id === activeId) ?? null;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createdId", id);
    params.set("source", "incident");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance/incidents?${params.toString()}`);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: IncidentForm) =>
      fetchJson<IncidentRecord>("/api/compliance/incidents", {
        method: "POST",
        body: JSON.stringify({
          siteId: payload.siteId,
          incidentDate: fromLocalInput(payload.incidentDate) ?? payload.incidentDate,
          incidentType: payload.incidentType,
          severity: payload.severity,
          description: payload.description,
          actionsTaken: payload.actionsTaken || undefined,
          reportedBy: payload.reportedBy,
          status: "OPEN",
        }),
      }),
    onSuccess: (incident) => {
      toast({
        title: "Incident created",
        description: "Incident record saved successfully.",
        variant: "success",
      });
      setCreating(false);
      setForm(emptyForm);
      setSelectedId(incident.id);
      queryClient.invalidateQueries({ queryKey: ["compliance", "incidents"] });
      pushSaved(incident.id, incident.createdAt);
    },
    onError: (saveError) => {
      toast({
        title: "Unable to save incident",
        description: getApiErrorMessage(saveError),
        variant: "destructive",
      });
    },
  });

  /** One field at a time, against the endpoint the dialog used. */
  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      fetchJson<IncidentRecord>(`/api/compliance/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance", "incidents"] });
    },
    onError: (patchError) => {
      toast({
        title: "Unable to save incident",
        description: getApiErrorMessage(patchError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compliance/incidents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Incident deleted",
        description: "Incident was removed.",
        variant: "success",
      });
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["compliance", "incidents"] });
    },
    onError: (deleteError) => {
      toast({
        title: "Unable to delete incident",
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
      // The site being looked at is the site the new incident is most likely at.
      siteId: siteFilter !== "all" ? siteFilter : (sites?.[0]?.id ?? ""),
      incidentDate: toLocalInput(new Date().toISOString()),
    });
    setCreating(true);
  };

  const photos = parsePhotoUrls(record?.photoUrls);
  const actions = parseActions(record?.actionsTaken);

  /** Every corrective-action edit is the same one-column PATCH. */
  const writeActions = (next: CorrectiveAction[]) =>
    patch({ actionsTaken: serializeActions(next) || null });

  const state: ListColumnState = isLoading
    ? "loading"
    : isError || sitesError
      ? "failed"
      : incidents.length > 0
        ? "ready"
        : deferredSearch.trim() || narrowed
          ? "no-matches"
          : "empty";

  return (
    <ManagementShell title="Incidents">
      <RegisterLayout
        hasSelection={Boolean(record)}
        list={
          <ListColumn
            title="Incidents"
            noun="incident"
            count={isLoading ? undefined : incidents.length}
            state={state}
            columns={{ row: "Incident", value: "Status" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Description, actions, reporter",
            }}
            /* Site, status and severity — the three the register has always
               filtered on, each going to the endpoint as its own parameter.
               Three selects do not fit one line in a 340px column, so the row
               wraps rather than shrinking them below reading width. */
            filters={
              <RegisterFilters>
                <RegisterFilter
                  label="Filter incidents by site"
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
                  label="Filter incidents by status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={STATUS_FILTER_OPTIONS}
                />
                <RegisterFilter
                  label="Filter incidents by severity"
                  value={severityFilter}
                  onChange={setSeverityFilter}
                  options={SEVERITY_FILTER_OPTIONS}
                />
              </RegisterFilters>
            }
            onNew={openCreate}
            onRetry={() => void refetch()}
            emptyLabel="No incidents"
          >
            {incidents.map((row) => (
              <ListRow
                key={row.id}
                code={row.site.code}
                name={row.incidentType}
                /* Rule 5: a status in a list column is the dot and the word.
                   The chip is the header's, for the one record that is open. */
                value={
                  <StatusDot
                    tone={statusTone(row.status)}
                    label={statusLabel(row.status)}
                  />
                }
                selected={row.id === activeId}
                onSelect={() => setSelectedId(row.id)}
              />
            ))}
          </ListColumn>
        }
      >
        {banner}
        {record ? (
          <>
            <RecordHeader
              title={record.incidentType}
              icon={AlertTriangle}
              onRename={(next) => patch({ incidentType: next })}
              renameLabel="Rename the incident"
              /* Rule 5: the chip marks the exception, not the norm. Open and
                 In review are what the register is read for; Closed is where
                 an incident comes to rest and most of the register sits, so
                 it gets no chip. The list column still shows Closed — there a
                 status is a column and every row fills it. */
              badge={
                record.status === "CLOSED" ? undefined : (
                  <StatusBadge context="header" tone={statusTone(record.status)}>
                    {statusLabel(record.status)}
                  </StatusBadge>
                )
              }
              action={
                record.status === "CLOSED" ? undefined : (
                  <HeaderAction icon={Check} onClick={() => patch({ status: "CLOSED" })}>
                    Close incident
                  </HeaderAction>
                )
              }
              overflow={
                <>
                  {record.status === "OPEN" ? (
                    <DropdownMenuItem onSelect={() => patch({ status: "INVESTIGATING" })}>
                      Send for review
                    </DropdownMenuItem>
                  ) : null}
                  {record.status === "CLOSED" ? (
                    <DropdownMenuItem onSelect={() => patch({ status: "OPEN" })}>
                      Reopen the incident
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() => {
                      void (async () => {
                        const confirmed = await dsConfirm({
                          title: `Delete ${record.incidentType}?`,
                          description:
                            "The incident, its description and its corrective actions leave the register.",
                          confirmLabel: "Delete the incident",
                          variant: "danger",
                        });
                        if (confirmed) deleteMutation.mutate(record.id);
                      })();
                    }}
                  >
                    Delete the incident
                  </DropdownMenuItem>
                </>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailField label="Severity">
                {(id) => (
                  <Select
                    value={record.severity}
                    onValueChange={(value) => patch({ severity: value })}
                  >
                    <SelectTrigger id={id} className={CONTROL_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {SEVERITY_LABEL[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </DetailField>
              {/* `siteId` is absent from the PATCH schema — a fact, not a field. */}
              <DetailField label="Site">
                <StaticValue>{record.site.name}</StaticValue>
              </DetailField>
              {/* The board draws the minute, and `Incident.incidentDate` is a
                  DateTime that carries one. A date-only control displayed it
                  and then wrote it back at midnight, so editing any other
                  field's neighbour silently lost the time. */}
              <DetailField label="Occurred">
                {(id) => (
                  <InlineText
                    id={id}
                    type="datetime-local"
                    /* The board sets Occurred in the mono face, as it does
                       every other figure. `InlineText` only infers that for
                       `type="date"`. */
                    mono
                    value={toLocalInput(record.incidentDate)}
                    onCommit={(next) => {
                      const iso = fromLocalInput(next);
                      if (iso) patch({ incidentDate: iso });
                    }}
                  />
                )}
              </DetailField>
              <DetailField label="Reported by">
                {(id) => (
                  <InlineText
                    id={id}
                    value={record.reportedBy}
                    onCommit={(next) => patch({ reportedBy: next.trim() })}
                  />
                )}
              </DetailField>
            </DetailGrid>

            <SectionHeading icon={ListBullets}>What happened</SectionHeading>
            <div style={{ maxWidth: 470 }}>
              <InlineTextarea
                rows={4}
                ariaLabel="What happened"
                value={record.description}
                onCommit={(next) => (next.trim() ? patch({ description: next }) : undefined)}
              />
            </div>

            {/* Rule 2: the list's verb sits on the list's own heading. */}
            <SectionHeading
              icon={ListChecks}
              count={actions.length}
              action={
                <SectionAction icon={Plus} onClick={() => setAddingAction(true)}>
                  Add action
                </SectionAction>
              }
            >
              Corrective actions
            </SectionHeading>
            {actions.length > 0 ? (
              <CorrectiveActionList
                actions={actions}
                onToggle={(index) =>
                  writeActions(
                    actions.map((action, at) =>
                      at === index ? { ...action, done: !action.done } : action,
                    ),
                  )
                }
                onRemove={(index) => writeActions(actions.filter((_, at) => at !== index))}
              />
            ) : (
              <p
                style={{
                  maxWidth: 470,
                  margin: 0,
                  font: "400 13px/1.5 var(--font-sans)",
                  color: "#5E6573",
                }}
              >
                No corrective actions
              </p>
            )}

            {photos.length > 0 ? (
              <>
                <SectionHeading icon={Paperclip} count={photos.length}>
                  Photographs
                </SectionHeading>
                <RecordList
                  columns={{ row: "Photograph" }}
                  rows={photos.map((url, index) => ({
                    id: url,
                    code: String(index + 1),
                    name: url.split("/").pop() || `Photograph ${index + 1}`,
                    href: url,
                  }))}
                />
              </>
            ) : null}

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
            <DialogTitle>New incident</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <FormField label="Incident">
              {(id) => (
                <Input
                  id={id}
                  required
                  className={CONTROL_CLASS}
                  value={form.incidentType}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, incidentType: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Severity">
              {(id) => (
                <Select
                  value={form.severity}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, severity: value }))}
                >
                  <SelectTrigger id={id} className={CONTROL_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {SEVERITY_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
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
            <FormField label="Occurred">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="datetime-local"
                  className={CONTROL_CLASS}
                  value={form.incidentDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, incidentDate: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Reported by">
              {(id) => (
                <Input
                  id={id}
                  required
                  className={CONTROL_CLASS}
                  value={form.reportedBy}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, reportedBy: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="What happened">
              {(id) => (
                <Textarea
                  id={id}
                  required
                  rows={3}
                  className={CONTROL_CLASS}
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Corrective actions">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  className={CONTROL_CLASS}
                  value={form.actionsTaken}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, actionsTaken: event.target.value }))
                  }
                />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Create incident"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* The corrective-actions list's own verb. One field, because an action
          is one line of the column it is written to. */}
      <Dialog
        open={addingAction}
        onOpenChange={(open) => {
          setAddingAction(open);
          if (!open) setActionDraft("");
        }}
      >
        <DialogContent size="sm" className="w-full">
          <DialogHeader>
            <DialogTitle>Add a corrective action</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const text = actionDraft.trim();
              if (!text) return;
              writeActions([...actions, { text, done: false }]);
              setActionDraft("");
              setAddingAction(false);
            }}
          >
            <FormField label="Action">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  className={CONTROL_CLASS}
                  value={actionDraft}
                  onChange={(event) => setActionDraft(event.target.value)}
                />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={patchMutation.isPending}>
                Add action
              </Button>
              <Button type="button" variant="outline" onClick={() => setAddingAction(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}
