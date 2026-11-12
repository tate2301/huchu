"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import {
  BkEmpty,
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
import { BooksLoading } from "@/components/books/books-state";
import {
  Button,
  Drawer,
  DrawerSection,
  Field,
  Input,
  Person,
  Select,
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
      ["Crew", "Code", "Site", "Leader", "Members", "Status"],
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
    toast({ title: selectedRows.length === 1 ? "Code copied" : `${selectedRows.length} codes copied` });
  };

  const currentSiteName = React.useMemo(
    () => sites.find((s: Site) => s.id === siteFilter)?.name || "Any",
    [sites, siteFilter]
  );

  const activeCount = crews.filter((c: ShiftGroupRecord) => c.isActive).length;

  const columns: Array<WsColumn<ShiftGroupRecord>> = [
    { key: "name", head: "Crew", cell: (c) => c.name },
    { key: "code", head: "Code", className: "muted mono", cell: (c) => c.code || <None /> },
    { key: "site", head: "Site", className: "muted", cell: (c) => c.site?.name || <None /> },
    { key: "leader", head: "Leader", cell: (c) => (c.leader ? <Person name={c.leader.name} /> : <None />) },
    { key: "members", head: "Members", right: true, className: "mono", cell: (c) => c._count?.members ?? 0 },
    { key: "status", head: "Status", cell: (c) => <St tone={c.isActive ? "done" : "void"}>{c.isActive ? "Active" : "Archived"}</St> },
  ];

  return (
    <PeopleShell
      activeTab="shift-groups"
      title="Rosters"
      primary={canManage ? { label: "New crew", icon: "plus", shortcut: "N", onClick: () => setCreateDrawerOpen(true) } : undefined}
    >
      <BkPage screen="rosters" scroll={false}>
        <BkFinding fact={`${activeCount} active ${activeCount === 1 ? "crew" : "crews"}${sites.length ? ` across ${sites.length} ${sites.length === 1 ? "site" : "sites"}` : ""}.`} />

        <BkTabs
          label="Roster views"
          value={tab}
          onChange={(v) => {
            setTab(v as ViewTab);
            setPage(1);
          }}
          items={[
            { value: "active", label: "Active", count: activeCount, icon: "check" },
            { value: "all", label: "All", count: crews.length, icon: "list" },
          ]}
        />

        <BkTools
          find="Search crews"
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
            label="crews"
            rows={pageRows}
            rowKey={(c) => c.id}
            columns={columns}
            openHref={(c) => `/people/rosters/${c.id}`}
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
                <BooksLoading />
              ) : (
                <BkEmpty action={canManage ? <Button onClick={() => setCreateDrawerOpen(true)}>New crew</Button> : undefined}>No crews here.</BkEmpty>
              )
            }
          />
        </BkScroll>

        <BkPager page={page} size={pageSize} total={totalRows} onPage={setPage} />

        <BkSelectionBar count={selection.selected.size} onClear={selection.clear}>
          <Button icon="export" onClick={handleExport}>
            Export
          </Button>
          <Button icon="docs" onClick={handleCopyCodes}>
            Copy codes
          </Button>
        </BkSelectionBar>
      </BkPage>

      <Drawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        title="New crew"
        footer={
          <>
            <Button variant="quiet" onClick={() => setCreateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={createMutation.isPending}
              disabled={!crewName.trim() || !crewLeaderId}
              onClick={() =>
                createMutation.mutate({
                  name: crewName.trim(),
                  code: crewCode.trim() || undefined,
                  siteId: crewSiteId || undefined,
                  leaderEmployeeId: crewLeaderId,
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <DrawerSection title="Crew">
          <Field label="Name">
            <Input
              value={crewName}
              onChange={(e) => {
                setCrewName(e.target.value);
                if (!crewCode && e.target.value.length >= 3) {
                  setCrewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
                }
              }}
            />
          </Field>
          <Field label="Code" help="Used to punch attendance at a kiosk">
            <Input value={crewCode} onChange={(e) => setCrewCode(e.target.value.toUpperCase())} />
          </Field>
        </DrawerSection>

        <DrawerSection title="Site and leader">
          <Field label="Site" optional>
            <Select value={crewSiteId} onChange={(e) => setCrewSiteId(e.target.value)}>
              <option value="">None</option>
              {sites.map((s: Site) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Leader">
            <Select value={crewLeaderId} onChange={(e) => setCrewLeaderId(e.target.value)}>
              <option value="">Choose</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({employeePositionLabel(e.position) || "Staff"})
                </option>
              ))}
            </Select>
          </Field>
        </DrawerSection>
      </Drawer>

    </PeopleShell>
  );
}
