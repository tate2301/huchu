"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BkChip,
  BkQuietTools,
  BkState,
  BkTabs,
  BkTools,
  downloadCsv,
} from "@/components/books/bk-list";
import {
  Button,
  Drawer,
  DrawerSection,
  Field,
  Input,
  Kit,
  KitScreen,
  Person,
  SelectCell,
  TableFoot,
  TableShell,
  useSelection,
} from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  createShiftGroup,
  fetchEmployees,
  fetchShiftGroups,
  fetchSites,
  permanentlyDeleteShiftGroup,
  updateShiftGroup,
  type ShiftGroupRecord,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

type CrewTab = "active" | "all";

export default function RostersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<CrewTab>("active");
  const [siteFilter, setSiteFilter] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  // Drawer
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<ShiftGroupRecord | null>(null);
  const [formName, setFormName] = React.useState("");
  const [formCode, setFormCode] = React.useState("");
  const [formSiteId, setFormSiteId] = React.useState("");
  const [formLeaderId, setFormLeaderId] = React.useState("");

  const { data: sitesData } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });
  const sites = React.useMemo(() => sitesData ?? [], [sitesData]);

  const { data: groupsData } = useQuery({
    queryKey: ["shift-groups", search, siteFilter],
    queryFn: () =>
      fetchShiftGroups({
        search: search.trim() || undefined,
        siteId: siteFilter === "all" ? undefined : siteFilter,
        limit: 300,
      }),
  });
  const groups = React.useMemo(() => groupsData?.data ?? [], [groupsData]);

  const { data: employeesData } = useQuery({
    queryKey: ["employees", "crew-picker"],
    queryFn: () => fetchEmployees({ active: true, limit: 300 }),
  });
  const employees = React.useMemo(() => employeesData?.data ?? [], [employeesData]);

  // Counts
  const activeCount = React.useMemo(() => groups.filter((g) => g.isActive).length, [groups]);

  // Filtered
  const filteredGroups = React.useMemo(() => {
    let list = [...groups];
    if (tab === "active") {
      list = list.filter((g) => g.isActive);
    }
    return list;
  }, [groups, tab]);

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filteredGroups.length);
  const pagedGroups = React.useMemo(
    () => filteredGroups.slice((page - 1) * pageSize, page * pageSize),
    [filteredGroups, page, pageSize]
  );

  const ids = React.useMemo(() => pagedGroups.map((g) => g.id), [pagedGroups]);
  const selection = useSelection(ids);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async () =>
      createShiftGroup({
        name: formName,
        code: formCode,
        siteId: formSiteId || undefined,
        leaderEmployeeId: formLeaderId || undefined,
        memberIds: formLeaderId ? [formLeaderId] : [],
      }),
    onSuccess: () => {
      toast({ title: "Crew roster created", variant: "success" });
      setDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] });
    },
    onError: (err) => {
      toast({ title: "Unable to create crew", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingGroup) return;
      return updateShiftGroup(editingGroup.id, {
        name: formName,
        code: formCode,
        siteId: formSiteId || undefined,
        leaderEmployeeId: formLeaderId || undefined,
        memberIds: formLeaderId ? [formLeaderId] : [],
      });
    },
    onSuccess: () => {
      toast({ title: "Crew roster updated", variant: "success" });
      setDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] });
    },
    onError: (err) => {
      toast({ title: "Unable to update crew", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateShiftGroup(id, { isActive }),
    onSuccess: () => {
      toast({ title: "Crew status updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => permanentlyDeleteShiftGroup(id),
    onSuccess: () => {
      toast({ title: "Crew deleted", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["shift-groups"] });
    },
  });

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setFormName("");
    setFormCode("");
    setFormSiteId(siteFilter !== "all" ? siteFilter : sites[0]?.id || "");
    setFormLeaderId("");
    setDrawerOpen(true);
  };

  const handleOpenEdit = (group: ShiftGroupRecord) => {
    setEditingGroup(group);
    setFormName(group.name);
    setFormCode(group.code);
    setFormSiteId(group.siteId || "");
    setFormLeaderId(group.members.find((m) => m.role === "LEADER")?.employeeId || "");
    setDrawerOpen(true);
  };

  const handleExportCsv = () => {
    const csv = [
      ["Crew Name", "Code", "Site", "Leader", "Members Count", "Status"],
      ...filteredGroups.map((g) => [
        g.name,
        g.code,
        g.site?.name || "",
        g.members.find((m) => m.role === "LEADER")?.employee?.name || "",
        String(g.members.length),
        g.isActive ? "Active" : "Inactive",
      ]),
    ];
    downloadCsv(`crew-rosters-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const siteFilterLabel =
    siteFilter === "all"
      ? "All sites"
      : sites.find((s) => s.id === siteFilter)?.name || "Site";

  return (
    <PeopleShell
      activeTab="rosters"
      title="Crew Rosters & Shifts"
      actions={
        <Button variant="primary" icon="plus" shortcut="N" onClick={handleOpenCreate}>
          New crew roster
        </Button>
      }
    >
      <Kit contents>
        <KitScreen slug="bk-a">
          <div className="bk">
            {/* TABS */}
            <BkTabs
              label="Roster views"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
                selection.clear();
              }}
              items={[
                { value: "active", label: "Active crews", count: activeCount },
                { value: "all", label: "All rosters", count: groups.length },
              ]}
            />

            {/* TOOLBAR */}
            <BkTools
              find="Search crews by name, code, site..."
              query={search}
              onFind={(q) => {
                setSearch(q);
                setPage(1);
              }}
              count={`${filteredGroups.length} of ${groups.length}`}
              chips={
                <BkChip
                  label="Site"
                  value={siteFilterLabel}
                  set={siteFilter !== "all"}
                  items={[
                    { key: "all", label: "All sites", checked: siteFilter === "all", onSelect: () => setSiteFilter("all") },
                    { separator: true },
                    ...sites.map((s) => ({
                      key: s.id,
                      label: s.name,
                      checked: siteFilter === s.id,
                      onSelect: () => setSiteFilter(s.id),
                    })),
                  ]}
                />
              }
              end={<BkQuietTools onExport={handleExportCsv} />}
            />

            {/* TABLE SHELL */}
            <TableShell
              label="Crew rosters"
              foot={
                <TableFoot
                  range={filteredGroups.length === 0 ? "None" : `${from} to ${to} of ${filteredGroups.length}`}
                  page={{
                    onPrevious: page > 1 ? () => setPage((p) => p - 1) : undefined,
                    onNext: to < filteredGroups.length ? () => setPage((p) => p + 1) : undefined,
                  }}
                  selection={{
                    count: selection.selected.size,
                    onClear: selection.clear,
                    actions: (
                      <Button icon="export" onClick={handleExportCsv}>
                        Export selected
                      </Button>
                    ),
                  }}
                />
              }
            >
              {filteredGroups.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>No crew rosters match</b>
                  <p className="muted">Create your first crew roster with New crew roster.</p>
                </div>
              ) : (
                <table className="table" aria-label="Crew rosters">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 60 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={selection.all}
                        indeterminate={selection.some}
                        onChange={selection.toggleAll}
                        label="Select all rosters"
                      />
                      <th>Crew name</th>
                      <th>Code</th>
                      <th>Site</th>
                      <th>Shift leader</th>
                      <th className="num">Members</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedGroups.map((group) => {
                      const isSelected = selection.isSelected(group.id);
                      const leader = group.members.find((m) => m.role === "LEADER")?.employee;
                      const moreEntries: MenuEntry[] = [
                        {
                          key: "edit",
                          label: "Edit crew details",
                          icon: "pencil",
                          onSelect: () => handleOpenEdit(group),
                        },
                        { separator: true },
                        {
                          key: "toggle",
                          label: group.isActive ? "Mark inactive" : "Mark active",
                          onSelect: () => toggleActiveMutation.mutate({ id: group.id, isActive: !group.isActive }),
                        },
                        {
                          key: "delete",
                          label: "Delete crew",
                          icon: "bin",
                          danger: true,
                          onSelect: () => deleteMutation.mutate(group.id),
                        },
                      ];

                      return (
                        <tr key={group.id} className={isSelected ? "is-selected" : undefined}>
                          <SelectCell
                            checked={isSelected}
                            onChange={() => selection.toggle(group.id)}
                            label={`Select ${group.name}`}
                          />
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                              {group.name}
                            </div>
                            {group.notes ? (
                              <div className="sub" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                                {group.notes}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <span className="mono" style={{ fontSize: 13, color: "var(--color-ink-2)" }}>
                              {group.code}
                            </span>
                          </td>
                          <td>{group.site?.name ?? <span className="muted">—</span>}</td>
                          <td>
                            {leader ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Person name={leader.name} />
                                <span style={{ fontWeight: 500 }}>{leader.name}</span>
                              </div>
                            ) : (
                              <span className="muted">No leader assigned</span>
                            )}
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
                            {group.members.length}
                          </td>
                          <td>
                            <BkState tone={group.isActive ? "success" : "plain"}>
                              {group.isActive ? "Active" : "Inactive"}
                            </BkState>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <MenuButton label="More" items={moreEntries}>
                              •••
                            </MenuButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TableShell>

            {/* GUIDED CREW DRAWER */}
            <Drawer
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
              title={editingGroup ? `Edit ${editingGroup.name}` : "New crew roster"}
              sub="Organize staff into operational shifts, rosters, and sites."
              width={480}
              footer={
                <>
                  <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    icon="check"
                    shortcut="Ctrl ↵"
                    busy={createMutation.isPending || updateMutation.isPending}
                    onClick={() => (editingGroup ? updateMutation.mutate() : createMutation.mutate())}
                  >
                    {editingGroup ? "Save changes" : "Create crew"}
                  </Button>
                </>
              }
            >
              <DrawerSection title="Crew Identity">
                <Field label="Crew name" htmlFor="crew-name">
                  <Input
                    id="crew-name"
                    placeholder="e.g. Alpha Shift Processing"
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (!editingGroup && !formCode) {
                        const words = e.target.value.trim().split(/\s+/);
                        const codeSuggestion = words.map((w) => w[0]?.toUpperCase()).join("") || "CREW";
                        setFormCode(codeSuggestion);
                      }
                    }}
                    autoFocus
                  />
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Code / Identifier" htmlFor="crew-code">
                    <Input
                      id="crew-code"
                      placeholder="e.g. ALPHA-1"
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                    />
                  </Field>
                  <Field label="Site" htmlFor="crew-site" optional>
                    <select
                      id="crew-site"
                      className="select"
                      value={formSiteId}
                      onChange={(e) => setFormSiteId(e.target.value)}
                      style={{ width: "100%", height: 36 }}
                    >
                      <option value="">No site</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Shift leader" htmlFor="crew-leader" optional>
                  <select
                    id="crew-leader"
                    className="select"
                    value={formLeaderId}
                    onChange={(e) => setFormLeaderId(e.target.value)}
                    style={{ width: "100%", height: 36 }}
                  >
                    <option value="">Select shift leader</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.employeeId})
                      </option>
                    ))}
                  </select>
                </Field>
              </DrawerSection>
            </Drawer>
          </div>
        </KitScreen>
      </Kit>
    </PeopleShell>
  );
}
