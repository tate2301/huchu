"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActivityTrail,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionAction,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
} from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import {
  createDepartment,
  createSection,
  deleteDepartment,
  fetchCostCenters,
  fetchDepartments,
  fetchEmployees,
  fetchSitesList,
  updateDepartment,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  ArrowLeft,
  Buildings,
  ListBullets,
  Plus,
  SlidersHorizontal,
  Users,
} from "@/lib/icons";

import {
  CreateField,
  CreateSheet,
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
  DetailSelect,
  NoRecord,
  StatusSelect,
} from "@/app/management/master-data/operations/_components/register-fields";

/** Unchanged: `/preferences` owns this key and other surfaces invalidate it. */
const QUERY_KEY = ["preferences", "organization", "departments"] as const;

/**
 * The three option lists behind Head, Cost centre and Site.
 *
 * Deliberately outside `QUERY_KEY` rather than under it: `invalidate()` runs
 * after every write to a department, and a rename has no reason to refetch
 * every employee in the company.
 */
const OPTIONS_KEY = ["preferences", "organization", "department-options"] as const;

const FULL_LOG_HREF = "/reports/audit-trails";

/**
 * Radix `Select` has no empty item — `value=""` is how it says "nothing
 * chosen" internally — so the None option carries a sentinel. Every id it
 * stands in for is a UUID, so there is nothing for it to collide with.
 */
const NONE = "none";

/**
 * Departments — `Departments.dc.html`.
 *
 * The one component behind both `/preferences/organization/departments` and
 * `/management/master-data/hr/departments`; the management path redirects here,
 * so there is a single implementation rather than two that drift.
 *
 * Head, cost centre, site and the sections underneath a department are all
 * columns now (`20260922090000_department_placement_and_period_archive`), and
 * `GET /api/departments` carries them on every row — the register renders the
 * selected row as the record rather than fetching it again, so the list has to
 * be the thing that knows where a department sits.
 *
 * Two places where what the board draws and what exists disagree, both
 * resolved towards what is true:
 *
 *   - the board draws Cost centre as a free-text mono field holding `CC-4120`.
 *     It is a foreign key, and free text cannot write one, so it is the same
 *     picker chrome as Head and Site beside it.
 *   - the board's Sections column is **People**. Counting people in a section
 *     needs `Employee.sectionId`, which does not exist; the endpoint returns
 *     the shift-report count instead, and the column is named after the figure
 *     in it. `Sections.dc.html`'s own register made this same call.
 *
 * It renders the shell itself so `RegisterLayout` reaches the surface's grid
 * row as a direct child: wrapped in anything else the shell treats the screen
 * as an unconverted page and draws a title line and a second inset around it.
 */
export function DepartmentsRegister() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [addingSection, setAddingSection] = React.useState(false);
  const [sectionDraft, setSectionDraft] = React.useState({ name: "", siteId: "" });

  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({ entity: "DEPARTMENT", enabled: creating });

  const departmentsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchDepartments({ limit: 500 }),
  });

  const all = React.useMemo(
    () => departmentsQuery.data?.data ?? [],
    [departmentsQuery.data],
  );
  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (row) =>
        row.code.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle),
    );
  }, [all, search]);

  const wide = useWideViewport();
  React.useEffect(() => {
    if (!wide) return;
    if (selectedId && rows.some((row) => row.id === selectedId)) return;
    setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId, wide]);

  const selected = React.useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  // The three pickers only exist inside an open record, so they wait for one.
  // Nothing here is a filter on the register itself; the board draws none.
  const hasRecord = Boolean(selected);

  const headOptionsQuery = useQuery({
    queryKey: [...OPTIONS_KEY, "employees"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
    enabled: hasRecord,
  });
  const costCentreOptionsQuery = useQuery({
    queryKey: [...OPTIONS_KEY, "cost-centres"],
    queryFn: () => fetchCostCenters({ active: true, limit: 500 }),
    enabled: hasRecord,
  });
  const siteOptionsQuery = useQuery({
    queryKey: [...OPTIONS_KEY, "sites"],
    queryFn: () => fetchSitesList({ active: true }),
    enabled: hasRecord,
  });

  const headOptions = React.useMemo(
    () => headOptionsQuery.data?.data ?? [],
    [headOptionsQuery.data],
  );
  const costCentreOptions = React.useMemo(
    () => costCentreOptionsQuery.data?.data ?? [],
    [costCentreOptionsQuery.data],
  );
  const siteOptions = React.useMemo(
    () => siteOptionsQuery.data ?? [],
    [siteOptionsQuery.data],
  );

  /** Ordered by the endpoint — code first, so `SC-11`, `SC-12`, `SC-13`. */
  const sections = React.useMemo(() => selected?.sections ?? [], [selected]);

  /*
   * What the record holds but the options list does not offer.
   *
   * Each picker only lists live rows, and the stored value may be a head who
   * has since left, a cost centre that was closed, or a site that was
   * archived. That value is still what the record says, so it is added to its
   * own picker — otherwise the control would read "None" for a field nobody
   * cleared, and the first touch of any other field would look like it did it.
   */
  const missingHead = React.useMemo(() => {
    const head = selected?.head;
    if (!head) return null;
    return headOptions.some((row) => row.id === head.id) ? null : head;
  }, [headOptions, selected]);

  const missingCostCentre = React.useMemo(() => {
    const centre = selected?.costCenter;
    if (!centre) return null;
    return costCentreOptions.some((row) => row.id === centre.id) ? null : centre;
  }, [costCentreOptions, selected]);

  const missingSite = React.useMemo(() => {
    const site = selected?.site;
    if (!site) return null;
    return siteOptions.some((row) => row.id === site.id) ? null : site;
  }, [selected, siteOptions]);

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: (record) => {
      toast({ title: "Department created", variant: "success" });
      closeCreate();
      setSelectedId(record?.id ?? null);
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Unable to create department",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      input: Parameters<typeof updateDepartment>[1];
    }) => updateDepartment(payload.id, payload.input),
    onSuccess: () => {
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Unable to update department",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDepartment,
    onSuccess: () => {
      toast({ title: "Department deleted", variant: "success" });
      setSelectedId(null);
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Unable to delete department",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  /**
   * The Sections list's own verb.
   *
   * A `Section` belongs to a site and, since the placement migration, may also
   * belong to a department — so creating one from here is `POST /api/sections`
   * with this department's id on it. The department's own site is the default,
   * and the sheet asks for the site because a section without one cannot be
   * written; nothing invents a site that is not there.
   *
   * The department list is what holds `sections`, so a new section invalidates
   * that key rather than a sections key this surface does not read.
   */
  const createSectionMutation = useMutation({
    mutationFn: createSection,
    onSuccess: () => {
      toast({ title: "Section created", variant: "success" });
      closeAddSection();
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Unable to create section",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  function closeCreate() {
    setCreating(false);
    setDraftName("");
  }

  function closeAddSection() {
    setAddingSection(false);
    setSectionDraft({ name: "", siteId: "" });
  }

  function openAddSection() {
    setSectionDraft({ name: "", siteId: selected?.siteId ?? "" });
    setAddingSection(true);
  }

  function handleAddSection(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const name = sectionDraft.name.trim();
    if (!name) {
      toast({ title: "A name is required", variant: "destructive" });
      return;
    }
    if (!sectionDraft.siteId) {
      toast({ title: "A site is required", variant: "destructive" });
      return;
    }
    createSectionMutation.mutate({
      name,
      siteId: sectionDraft.siteId,
      departmentId: selected.id,
    });
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      toast({ title: "A name is required", variant: "destructive" });
      return;
    }
    if (!reservedId.trim()) {
      toast({
        title: "Department code unavailable",
        description: reserveError ?? "Code reservation is in progress.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({ code: reservedId.trim(), name, isActive: true });
  }

  const state: ListColumnState = departmentsQuery.isLoading
    ? "loading"
    : departmentsQuery.isError
      ? "failed"
      : rows.length > 0
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  return (
    <PreferencesShell railCounts={{ departments: all.length }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Departments"
            noun="department"
            count={all.length}
            state={state}
            columns={{ row: "Department", value: "People" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Code or name",
            }}
            onNew={() => setCreating(true)}
            onRetry={() => void departmentsQuery.refetch()}
          >
            {rows.map((row) => (
              <ListRow
                key={row.id}
                code={row.code}
                name={row.name}
                value={row._count?.employees ?? 0}
                selected={row.id === selectedId}
                onSelect={() => setSelectedId(row.id)}
                // An archived department reads muted in the list rather than
                // carrying a chip, the same way a retired job grade does —
                // and the mute is the ink, not opacity. Washing the row at
                // 55% puts its name at 3.9:1 on white, under the floor, on
                // the one row a reader most needs to read; meta ink is the
                // board's own muted value and clears 4.5:1 selected or not.
                className={
                  row.isActive === false ? "[&_*]:text-[#5E6573]" : undefined
                }
              />
            ))}
          </ListColumn>
        }
      >
        {selected ? (
          <>
            <BackToList label="Departments" onBack={() => setSelectedId(null)} />

            <RecordHeader
              title={selected.name}
              icon={Buildings}
              renameLabel="Rename the department"
              onRename={(next) =>
                updateMutation.mutate({
                  id: selected.id,
                  input: { name: next },
                })
              }
              badge={
                <StatusBadge
                  context="header"
                  tone={selected.isActive ? "success" : "neutral"}
                >
                  Archived
                </StatusBadge>
              }
              action={
                <HeaderAction icon={Users} onClick={() => router.push("/people")}>
                  Move people
                </HeaderAction>
              }
              overflow={
                <DropdownMenuItem
                  onSelect={() => {
                    void dsConfirm({
                      title: `Delete ${selected.name}?`,
                      description:
                        "A department with employees on it cannot be deleted — move them first.",
                      confirmLabel: "Delete the department",
                      variant: "danger",
                    }).then((confirmed) => {
                      if (confirmed) deleteMutation.mutate(selected.id);
                    });
                  }}
                >
                  Delete department
                </DropdownMenuItem>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailRow label="Code">
                {(id) => (
                  <Input
                    id={id}
                    value={selected.code}
                    readOnly
                    className={`${DETAIL_CONTROL_CLASS} font-mono`}
                  />
                )}
              </DetailRow>
              {/* Head is an `Employee`, not a `User`: a head of department is
                  a person on the payroll and plenty of them never sign in. The
                  stored head is offered even when the options list does not
                  carry them — somebody who has since left is still who the
                  record says runs the department, and a picker that silently
                  showed None would be reporting a change nobody made. */}
              <DetailRow label="Head">
                {(id) => (
                  <DetailSelect
                    id={id}
                    value={selected.headEmployeeId ?? NONE}
                    placeholder="None"
                    disabled={updateMutation.isPending}
                    onValueChange={(value) =>
                      updateMutation.mutate({
                        id: selected.id,
                        input: { headEmployeeId: value === NONE ? null : value },
                      })
                    }
                  >
                    <SelectItem value={NONE}>None</SelectItem>
                    {missingHead ? (
                      <SelectItem value={missingHead.id}>{missingHead.name}</SelectItem>
                    ) : null}
                    {headOptions.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </DetailSelect>
                )}
              </DetailRow>

              {/* Code and name together, because a chart of accounts read as
                  codes alone is a chart nobody can pick from. */}
              <DetailRow label="Cost centre">
                {(id) => (
                  <DetailSelect
                    id={id}
                    value={selected.costCenterId ?? NONE}
                    placeholder="None"
                    disabled={updateMutation.isPending}
                    onValueChange={(value) =>
                      updateMutation.mutate({
                        id: selected.id,
                        input: { costCenterId: value === NONE ? null : value },
                      })
                    }
                  >
                    <SelectItem value={NONE}>None</SelectItem>
                    {missingCostCentre ? (
                      <SelectItem value={missingCostCentre.id}>
                        {costCentreLabel(missingCostCentre)}
                      </SelectItem>
                    ) : null}
                    {costCentreOptions.map((centre) => (
                      <SelectItem key={centre.id} value={centre.id}>
                        {costCentreLabel(centre)}
                      </SelectItem>
                    ))}
                  </DetailSelect>
                )}
              </DetailRow>

              {/* Null reads as company-wide, which is how every department
                  written before the placement columns reads. */}
              <DetailRow label="Site">
                {(id) => (
                  <DetailSelect
                    id={id}
                    value={selected.siteId ?? NONE}
                    placeholder="None"
                    disabled={updateMutation.isPending}
                    onValueChange={(value) =>
                      updateMutation.mutate({
                        id: selected.id,
                        input: { siteId: value === NONE ? null : value },
                      })
                    }
                  >
                    <SelectItem value={NONE}>None</SelectItem>
                    {missingSite ? (
                      <SelectItem value={missingSite.id}>{missingSite.name}</SelectItem>
                    ) : null}
                    {siteOptions.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </DetailSelect>
                )}
              </DetailRow>

              <DetailRow label="Status">
                {(id) => (
                  <StatusSelect
                    id={id}
                    active={selected.isActive}
                    disabled={updateMutation.isPending}
                    onChange={(isActive) =>
                      updateMutation.mutate({
                        id: selected.id,
                        input: { isActive },
                      })
                    }
                  />
                )}
              </DetailRow>
            </DetailGrid>

            <SectionHeading
              icon={ListBullets}
              count={sections.length}
              /* Rule 9: with no site anywhere in the company there is nothing
                 to write a section against, so there is no verb rather than
                 one that opens a sheet it cannot submit. */
              action={
                siteOptions.length > 0 ? (
                  <SectionAction icon={Plus} onClick={openAddSection}>
                    Add a section
                  </SectionAction>
                ) : undefined
              }
            >
              Sections
            </SectionHeading>

            {sections.length === 0 ? (
              /* A named column header over nothing reads as a broken list
                 rather than an empty one — the answer `Sections.dc.html`'s own
                 register reached for its downtime codes. */
              <NoRecord label="No sections" />
            ) : (
              <RecordList
                columns={{ row: "Section", value: "Shift reports" }}
                valueWidth={76}
                rows={sections.map((section) => ({
                  id: section.id,
                  code: section.code ?? undefined,
                  name: section.name,
                  value: {
                    kind: "number" as const,
                    value: section._count?.shiftReports ?? 0,
                  },
                }))}
              />
            )}

            <ActivityTrail events={[]} fullLogHref={FULL_LOG_HREF} />
          </>
        ) : (
          <NoRecord
            label={
              departmentsQuery.isLoading
                ? "Loading departments"
                : search.trim()
                  ? "No department matches that search."
                  : "No department to show yet."
            }
          />
        )}

        <CreateSheet
          open={creating}
          onOpenChange={(open) => (open ? setCreating(true) : closeCreate())}
          title="New department"
          submitLabel="Create department"
          busy={createMutation.isPending || isReserving || !reservedId}
          onSubmit={handleCreate}
        >
          <CreateField label="Code">
            {(id) => (
              <Input
                id={id}
                readOnly
                value={reserveError ? "" : reservedId}
                placeholder={reserveError ?? (isReserving ? "Reserving" : "")}
                className={`${DETAIL_CONTROL_CLASS} font-mono`}
              />
            )}
          </CreateField>
          <CreateField label="Name">
            {(id) => (
              <Input
                id={id}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Processing"
                className={DETAIL_CONTROL_CLASS}
              />
            )}
          </CreateField>
        </CreateSheet>

        <CreateSheet
          open={addingSection}
          onOpenChange={(open) => (open ? openAddSection() : closeAddSection())}
          title="New section"
          submitLabel="Create section"
          busy={createSectionMutation.isPending}
          onSubmit={handleAddSection}
        >
          <CreateField label="Name">
            {(id) => (
              <Input
                id={id}
                value={sectionDraft.name}
                onChange={(event) =>
                  setSectionDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Crushing"
                className={DETAIL_CONTROL_CLASS}
              />
            )}
          </CreateField>
          {/* A section belongs to a site whether or not it belongs to a
              department, so the site is asked for rather than assumed. It
              starts on the department's own, which is the answer nearly every
              time. */}
          <CreateField label="Site">
            {(id) => (
              <DetailSelect
                id={id}
                value={sectionDraft.siteId}
                placeholder="Choose a site"
                onValueChange={(value) =>
                  setSectionDraft((current) => ({ ...current, siteId: value }))
                }
              >
                {siteOptions.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </DetailSelect>
            )}
          </CreateField>
        </CreateSheet>
      </RegisterLayout>
    </PreferencesShell>
  );
}

/** `CC-4120 — Processing`: the code the ledger posts to, and what it is. */
function costCentreLabel(centre: { code: string; name: string }) {
  return `${centre.code} — ${centre.name}`;
}

/** The way back to the list below 900px, where the register shows one column. */
function BackToList({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-3 hidden items-center gap-2 text-[13px] font-medium leading-[1.4] text-[#565C69] max-[899px]:inline-flex"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Below 900px the register shows one column at a time; see the job grades note. */
function useWideViewport() {
  const [wide, setWide] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return wide;
}
