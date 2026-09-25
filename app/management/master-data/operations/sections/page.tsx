"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActivityTrail,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
} from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  createSection,
  deleteSection,
  fetchDowntimeCodes,
  fetchSections,
  fetchSitesList,
  type SectionSummary,
  updateSection,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@/lib/api-client";
import {
  Archive,
  Layers,
  ListBullets,
  RefreshCcw,
  SlidersHorizontal,
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
} from "../_components/register-fields";

const SECTIONS_KEY = ["management", "master-data", "sections"] as const;

const FULL_LOG_HREF = "/reports/audit-trails";

/**
 * One muted line, on the record's 470px measure.
 *
 * A named column header over an empty list is the board with a hole in it: the
 * heading has already said "Downtime codes used here, 0", and a "Downtime
 * code" rule under it with nothing between the rules says the list is broken
 * rather than empty. Both the empty case and the still-loading one get this
 * line instead, which is the same answer `job-grades` reached for its roster.
 */
function SectionNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[13px] font-normal leading-[1.5] text-[#5E6573]"
      style={{ maxWidth: 470 }}
    >
      {children}
    </p>
  );
}

/**
 * Sections — `Sections.dc.html`.
 *
 * A register: the list on the left, the record on the right, and the record's
 * own fields editable where they are read. What this replaces was a table with
 * a 22rem detail aside, an Edit button in that aside, and a sheet that opened
 * on top of both to hold the same four fields — three surfaces for one record.
 *
 * No `title` is handed to `ManagementShell`. Its `title`/`actions` are the
 * fallback line for a screen that has not been rebuilt yet; a `RegisterLayout`
 * child draws its own chrome and the shell steps out of the way. A strip above
 * the list heading repeating "Sections" with a second New button is exactly
 * the doubling rules 2 and 4 exist to remove.
 *
 * Presentation only. Both query keys, all three mutations and the page's
 * feature gating are untouched.
 */
export default function SectionsManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSiteId, setDraftSiteId] = useState("");

  const {
    data: sectionsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: SECTIONS_KEY,
    queryFn: () => fetchSections({ limit: 500 }),
  });
  const loadErrorMessage = resolveDisplayErrorMessage([error]);

  const { data: sitesData } = useQuery({
    queryKey: ["management", "master-data", "sites-options"],
    queryFn: () => fetchSitesList({ active: true }),
  });
  const sites = useMemo(() => sitesData ?? [], [sitesData]);

  const all = useMemo(() => sectionsData?.data ?? [], [sectionsData]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        (row.site
          ? `${row.site.code} ${row.site.name}`.toLowerCase().includes(needle)
          : false),
    );
  }, [all, search]);

  // The record column follows the list rather than waiting to be told: a
  // register that opens with an empty right-hand half asks you to click
  // something before it will show you anything.
  const selected: SectionSummary | null =
    all.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  /**
   * The codes filed against this section's site — the board's "Downtime codes
   * used here". Read-only, and keyed under this page's own namespace so it
   * cannot collide with the downtime-codes register's list.
   */
  const { data: downtimeData, isLoading: isDowntimeLoading } = useQuery({
    queryKey: [...SECTIONS_KEY, "downtime-codes", selected?.siteId ?? null],
    queryFn: () => fetchDowntimeCodes({ siteId: selected?.siteId, active: true }),
    enabled: Boolean(selected?.siteId),
  });
  const downtimeCodes = useMemo(() => downtimeData ?? [], [downtimeData]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [...SECTIONS_KEY] });

  const createMutation = useMutation({
    mutationFn: createSection,
    onSuccess: (created) => {
      toast({ title: "Section created", variant: "success" });
      setCreating(false);
      setDraftName("");
      setSelectedId(created.id);
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to create section",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: Parameters<typeof updateSection>[1] }) =>
      updateSection(payload.id, payload.input),
    onSuccess: () => {
      toast({ title: "Section updated", variant: "success" });
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to update section",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSection,
    onSuccess: () => {
      toast({ title: "Section archived", variant: "success" });
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to archive section",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const patch = (id: string, input: Parameters<typeof updateSection>[1]) =>
    updateMutation.mutate({ id, input });

  const listState: ListColumnState = isLoading
    ? "loading"
    : loadErrorMessage
      ? "failed"
      : rows.length
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  return (
    <ManagementShell railCounts={{ "sections": all.length }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Sections"
            noun="section"
            count={all.length}
            state={listState}
            columns={{ row: "Section", value: "Shift reports" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Section or site",
            }}
            onNew={() => {
              setDraftName("");
              setDraftSiteId(sites[0]?.id ?? "");
              setCreating(true);
            }}
            onRetry={() => void refetch()}
          >
            {rows.map((row) => (
              <ListRow
                key={row.id}
                name={row.name}
                value={row._count?.shiftReports ?? 0}
                selected={row.id === selected?.id}
                onSelect={() => setSelectedId(row.id)}
              />
            ))}
          </ListColumn>
        }
      >
        {selected ? (
          <>
            <RecordHeader
              title={selected.name}
              icon={Layers}
              onRename={(name) => patch(selected.id, { name })}
              renameLabel="Rename the section"
              badge={
                <StatusBadge
                  context="header"
                  tone={selected.isActive ? "success" : "neutral"}
                >
                  Archived
                </StatusBadge>
              }
              action={
                selected.isActive ? (
                  <HeaderAction
                    icon={Archive}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      void dsConfirm({
                        title: `Archive ${selected.name}?`,
                        description:
                          "Shift reports already filed against it keep it. It stops being offered on new ones until it is set active again.",
                        confirmLabel: "Archive the section",
                        variant: "warning",
                      }).then((confirmed) => {
                        if (confirmed) deleteMutation.mutate(selected.id);
                      });
                    }}
                  >
                    Archive
                  </HeaderAction>
                ) : (
                  // Rule 9: the invalid verb is not disabled, it is not drawn.
                  <HeaderAction
                    icon={RefreshCcw}
                    disabled={updateMutation.isPending}
                    onClick={() => patch(selected.id, { isActive: true })}
                  >
                    Set active
                  </HeaderAction>
                )
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailRow label="Site">
                {(id) => (
                  <DetailSelect
                    id={id}
                    value={selected.siteId}
                    placeholder="No site"
                    onValueChange={(siteId) => patch(selected.id, { siteId })}
                  >
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.code} · {site.name}
                      </SelectItem>
                    ))}
                  </DetailSelect>
                )}
              </DetailRow>
              {/*
                No "Shift reports" row. The figure is already the list
                column's value for every row including this one, and rule 7
                puts a count on the heading that owns it rather than in a
                field beside four things you can change.
              */}
              <DetailRow label="Status">
                {(id) => (
                  <StatusSelect
                    id={id}
                    active={selected.isActive}
                    onChange={(isActive) => patch(selected.id, { isActive })}
                  />
                )}
              </DetailRow>
            </DetailGrid>

            <SectionHeading icon={ListBullets} count={downtimeCodes.length}>
              Downtime codes used here
            </SectionHeading>
            {isDowntimeLoading ? (
              <SectionNote>Loading the codes</SectionNote>
            ) : downtimeCodes.length > 0 ? (
              <RecordList
                columns={{ row: "Downtime code" }}
                rows={downtimeCodes.map((code) => ({
                  id: code.id,
                  code: code.code,
                  name: code.description,
                }))}
              />
            ) : (
              <SectionNote>
                No downtime codes are filed against this site yet.
              </SectionNote>
            )}

            <ActivityTrail events={[]} fullLogHref={FULL_LOG_HREF} />
          </>
        ) : (
          <NoRecord
            label={
              isLoading
                ? "Loading sections"
                : search.trim()
                  ? "No section matches that search."
                  : "No section to show yet."
            }
          />
        )}

        <CreateSheet
          open={creating}
          onOpenChange={setCreating}
          title="New section"
          submitLabel="Create section"
          busy={createMutation.isPending}
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftName.trim() || !draftSiteId) {
              toast({
                title: "Incomplete form",
                description: "Section name and site are required.",
                variant: "destructive",
              });
              return;
            }
            createMutation.mutate({
              name: draftName.trim(),
              siteId: draftSiteId,
              isActive: true,
            });
          }}
        >
          <CreateField label="Name">
            {(id) => (
              <Input
                id={id}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="North Pit"
                className={DETAIL_CONTROL_CLASS}
              />
            )}
          </CreateField>
          <CreateField label="Site">
            {(id) => (
              <DetailSelect
                id={id}
                value={draftSiteId}
                onValueChange={setDraftSiteId}
                placeholder="Pick a site"
              >
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.code} · {site.name}
                  </SelectItem>
                ))}
              </DetailSelect>
            )}
          </CreateField>
        </CreateSheet>
      </RegisterLayout>
    </ManagementShell>
  );
}
