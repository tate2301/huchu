"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import {
  BkFilter,
  BkFinding,
  BkPage,
  BkPager,
  BkScroll,
  BkSelectionBar,
  BkTabs,
  BkTools,
  None,
  St,
  Worksheet,
  type WsColumn,
} from "@/components/books/ui";
import { BkQuietTools, downloadCsv } from "@/components/books/bk-list";
import {
  Button,
  Drawer,
  DrawerSection,
  Field,
  Input,
  Person,
  useSelection,
} from "@/components/core";
import { PeopleShell } from "@/components/people/people-shell";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchEmployees,
  fetchShiftGroups,
  fetchSites,
  type ShiftGroupRecord,
  type Site,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { canManageRosters } from "@/lib/people/rosters";
import { employeePositionLabel } from "@/lib/platform/vertical-defaults";

type ViewTab = "active" | "all";

export default function RostersPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)
    ?.enabledFeatures;
  const canManage = canManageRosters(enabledFeatures);

  const [tab, setTab] = React.useState<ViewTab>("active");
  const [search, setSearch] = React.useState("");
  const [siteFilter, setSiteFilter] = React.useState<string>("ALL");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  // Drawer
  const [createDrawerOpen, setCreateDrawerOpen] = React.useState(false);
  const [crewName, setCrewName] = React.useState("");
  const [crewCode, setCrewCode] = React.useState("");
  const [crewSiteId, setCrewSiteId] = React.useState("");
  const [crewLeaderId, setCrewLeaderId] = React.useState("");
  const [crewDescription, setCrewDescription] = React.useState("");

  // Queries
  const crewsQuery = useQuery({
    queryKey: ["roster-crews", tab],
    queryFn: () =>
      fetchShiftGroups({
        active: tab === "active" ? true : undefined,
        limit: 100,
      }),
  });

  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => fetchSites(),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "crew-leaders"],
    queryFn: () => fetchEmployees({ active: true, limit: 300 }),
  });

  const crews: ShiftGroupRecord[] = React.useMemo(() => crewsQuery.data?.data ?? [], [crewsQuery.data]);
  const sites = React.useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const employees = React.useMemo(
    () => employeesQuery.data?.data ?? [],
    [employeesQuery.data]
  );

  const filtered = React.useMemo(() => {
    return crews.filter((c: ShiftGroupRecord) => {
      if (siteFilter !== "ALL" && c.siteId !== siteFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const name = c.name.toLowerCase();
      const code = (c.code || "").toLowerCase();
      const site = (c.site?.name || "").toLowerCase();
      const leader = (c.leader?.name || "").toLowerCase();
      return name.includes(q) || code.includes(q) || site.includes(q) || leader.includes(q);
    });
  }, [crews, siteFilter, search]);

  const totalRows = filtered.length;
  const pageRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const rowIds = React.useMemo(() => pageRows.map((r: ShiftGroupRecord) => r.id), [pageRows]);
  const selection = useSelection(rowIds);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (values: {
      name: string;
      code?: string;
      siteId?: string | null;
      leaderEmployeeId: string;
    }) =>
      fetchJson("/api/people/rosters", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast({ title: "Crew roster created" });
      setCreateDrawerOpen(false);
      setCrewName("");
      setCrewCode("");
      setCrewLeaderId("");
      void queryClient.invalidateQueries({ queryKey: ["roster-crews"] });
    },
    onError: (err) => {
      toast({ title: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const selectedRows = React.useMemo(
    () => pageRows.filter((r: ShiftGroupRecord) => selection.isSelected(r.id)),
    [pageRows, selection]
  );

  const handleExport = () => {
    const target = selectedRows.length > 0 ? selectedRows : filtered;
    downloadCsv(
      "crews-and-rosters.csv",
      ["Crew Name", "Code", "Site", "Shift Leader", "Staff Count", "Status"],
      target.map((c: ShiftGroupRecord) => [
        c.name,
        c.code || "",
        c.site?.name || "",
        c.leader?.name || "",
        String(c._count?.members ?? 0),
        c.isActive ? "Active" : "Archived",
      ])
    );
  };

  const handleCopyCodes = () => {
    const codes = selectedRows.map((c: ShiftGroupRecord) => `${c.name}: ${c.code || "—"}`).join("\n");
    void navigator.clipboard.writeText(codes);
    toast({ title: `Copied ${selectedRows.length} crew roster code${selectedRows.length > 1 ? "s" : ""} to clipboard` });
  };

  const currentSiteName = React.useMemo(
    () => sites.find((s: Site) => s.id === siteFilter)?.name || "Any",
    [sites, siteFilter]
  );

  const activeCount = crews.filter((c: ShiftGroupRecord) => c.isActive).length;

  const columns: Array<WsColumn<ShiftGroupRecord>> = [
    {
      key: "name",
      head: "Crew / Roster",
      cell: (c) => (
        <span className="who" style={{ display: "block", fontWeight: 500 }}>
          {c.name}
        </span>
      ),
    },
    {
      key: "code",
      head: "Shift code",
      className: "muted mono",
      cell: (c) => c.code || <None />,
    },
    {
      key: "site",
      head: "Site / Facility",
      className: "muted",
      cell: (c) => c.site?.name || <None />,
    },
    {
      key: "leader",
      head: "Shift leader",
      cell: (c) =>
        c.leader ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Person name={c.leader.name} size={24} />
            <span className="who" style={{ fontWeight: 500 }}>
              {c.leader.name}
            </span>
          </span>
        ) : (
          <None />
        ),
    },
    {
      key: "members",
      head: "Members",
      right: true,
      className: "mono",
      cell: (c) => (
        <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
          {c._count?.members ?? 0}
        </span>
      ),
    },
    {
      key: "status",
      head: "Status",
      cell: (c) => (
        <St tone={c.isActive ? "done" : "void"}>
          {c.isActive ? "Active crew" : "Archived"}
        </St>
      ),
    },
  ];

  return (
    <PeopleShell
      activeTab="shift-groups"
      primary={
        canManage
          ? {
              label: "New crew",
              icon: "plus",
              shortcut: "N",
              onClick: () => setCreateDrawerOpen(true),
            }
          : undefined
      }
    >
      <BkPage screen="rosters" scroll={false}>
        <BkFinding
          fact={`${activeCount} active shift crews operating across ${sites.length} operational sites.`}
          rest="Roster codes link daily attendance scans directly to scheduled shift rotation plans."
        />

        <BkTabs
          label="Roster views"
          value={tab}
          onChange={(v) => {
            setTab(v as ViewTab);
            setPage(1);
          }}
          items={[
            { value: "active", label: "Active crews", count: activeCount, icon: "check" },
            { value: "all", label: "All rosters", count: crews.length, icon: "list" },
          ]}
        />

        <BkTools
          find="Search crews by name, code, site, or leader..."
          query={search}
          onFind={(q) => {
            setSearch(q);
            setPage(1);
          }}
          count={totalRows}
          filters={
            <BkFilter
              label="Site"
              value={siteFilter === "ALL" ? "Any" : currentSiteName}
              items={[
                {
                  key: "ALL",
                  label: "Any site",
                  checked: siteFilter === "ALL",
                  onSelect: () => {
                    setSiteFilter("ALL");
                    setPage(1);
                  },
                },
                { separator: true },
                ...sites.map((s: Site) => ({
                  key: s.id,
                  label: s.name,
                  checked: siteFilter === s.id,
                  onSelect: () => {
                    setSiteFilter(s.id);
                    setPage(1);
                  },
                })),
              ]}
            />
          }
          end={<BkQuietTools onExport={handleExport} />}
        />

        <BkScroll>
          <Worksheet
            label="crews and rosters"
            rows={pageRows}
            rowKey={(c) => c.id}
            columns={columns}
            selection={{
              selected: selection.selected,
              toggle: selection.toggle,
              toggleAll: selection.toggleAll,
              all: selection.all,
              some: selection.some,
              labelOf: (c) => c.name,
            }}
            empty={
              crewsQuery.isLoading ? (
                "Loading crews..."
              ) : (
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontWeight: 500, color: "var(--color-ink)", marginBottom: 4 }}>
                    No crews match the criteria.
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: 13 }}>
                    Create a new shift crew using the action above to organize team rotations.
                  </p>
                </div>
              )
            }
          />
        </BkScroll>

        <BkPager
          page={page}
          size={pageSize}
          total={totalRows}
          onPage={setPage}
        />

        <BkSelectionBar
          count={selection.selected.size}
          onClear={selection.clear}
        >
          <Button icon="export" onClick={handleExport}>
            Export ({selection.selected.size})
          </Button>
          <Button icon="docs" onClick={handleCopyCodes}>
            Copy Codes
          </Button>
        </BkSelectionBar>
      </BkPage>

      {/* Guided Drawer for creating new crew */}
      <Drawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        title="Create Shift Crew Roster"
        sub="Establish operational shift team, location, and assigned supervisor."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <DrawerSection title="Crew Identity">
            <Field label="Crew Name">
              <Input
                value={crewName}
                onChange={(e) => {
                  setCrewName(e.target.value);
                  if (!crewCode && e.target.value.length >= 3) {
                    setCrewCode(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 6)
                    );
                  }
                }}
                placeholder="e.g. Plant Alpha Shift"
              />
            </Field>

            <Field label="Shift Code" help="Short identifier for attendance & kiosk punch">
              <Input
                value={crewCode}
                onChange={(e) => setCrewCode(e.target.value.toUpperCase())}
                placeholder="e.g. ALPHA"
              />
            </Field>
          </DrawerSection>

          <DrawerSection title="Site & Leadership">
            <Field label="Operational Site">
              <select
                className="select"
                value={crewSiteId}
                onChange={(e) => setCrewSiteId(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                <option value="">Select location site...</option>
                {sites.map((s: Site) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Shift Leader / Supervisor">
              <select
                className="select"
                value={crewLeaderId}
                onChange={(e) => setCrewLeaderId(e.target.value)}
                style={{ width: "100%", height: 36 }}
              >
                <option value="">Select crew supervisor...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({employeePositionLabel(e.position) || "Staff"})
                  </option>
                ))}
              </select>
            </Field>
          </DrawerSection>

          <DrawerSection title="Notes & Rotation">
            <Field label="Description / Rotation Schedule">
              <textarea
                className="textarea"
                rows={3}
                value={crewDescription}
                onChange={(e) => setCrewDescription(e.target.value)}
                placeholder="e.g. 4 on / 4 off 12-hour continuous mill rotation"
                style={{ width: "100%" }}
              />
            </Field>
          </DrawerSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <Button variant="quiet" onClick={() => setCreateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={createMutation.isPending}
              disabled={!crewName.trim() || !crewLeaderId}
              onClick={() => {
                createMutation.mutate({
                  name: crewName.trim(),
                  code: crewCode.trim() || undefined,
                  siteId: crewSiteId || undefined,
                  leaderEmployeeId: crewLeaderId,
                });
              }}
            >
              Save crew
            </Button>
          </div>
        </div>
      </Drawer>
    </PeopleShell>
  );
}
