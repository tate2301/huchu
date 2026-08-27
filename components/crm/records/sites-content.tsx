"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@corelithzw/react";
import { EntityLink } from "@/components/records/entity-link";
import { fetchCrmSites } from "@/lib/crm/crm-v2";
import { useDebounced } from "@/hooks/use-debounced";
import { Building2, Calendar, Coins, MapPin, UserRound } from "@/lib/icons";

import { SiteFormSheet } from "./site-form-sheet";
import { RecordList, RecordListPager, type RecordListRow } from "./record-list";
import { RecordTable, RecordTableName, type RecordTableColumn } from "@/components/records/record-table";
import { LayoutSwitch, type RecordLayout } from "./layout-switch";
import { RecordMark } from "@/components/records/record-mark";
import { RecordListShell } from "./record-list-shell";

const PAGE_SIZE = 50;

export function SitesContent({ openCreate = false }: { openCreate?: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(openCreate);
  const [layout, setLayout] = useState<RecordLayout>("TABLE");
  const debouncedSearch = useDebounced(search, 300);

  const sitesQuery = useQuery({
    queryKey: ["crm", "sites", debouncedSearch, page],
    queryFn: () => fetchCrmSites({ filters: { q: debouncedSearch }, page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const sites = useMemo(() => sitesQuery.data?.data ?? [], [sitesQuery.data]);
  const total = sitesQuery.data?.pagination?.total ?? sites.length;

  const rows = useMemo<RecordListRow[]>(
    () =>
      sites.map((site) => ({
        id: site.id,
        leading: (
          <RecordMark
            kind="site"
            name={site.name}
            emoji={site.emoji}
            avatarUrl={site.avatarUrl}
            size="md"
          />
        ),
        href: `/crm/sites/${site.id}`,
        title: site.name,
        subtitle:
          [
            site.siteNo,
            site.client?.name,
            [site.addressLine, site.city, site.country].filter(Boolean).join(", "),
          ]
            .filter(Boolean)
            .join(" · "),
        facts: [
          { label: "Contact", value: site.primaryContact?.fullName ?? "—" },
          { label: "Deals", value: site._count?.deals ?? 0, mono: true },
          { label: "Visits", value: site._count?.appointments ?? 0, mono: true },
        ],
      })),
    [sites],
  );

  /**
   * The same sites, arranged as columns.
   *
   * A site's row crams its number, its company and its full address onto one
   * subtitle line, which at any width is a run-on and on a phone is truncated
   * before the town. Which company owns it and where it is are two different
   * questions, and here they are two columns.
   */
  const columns = useMemo<RecordTableColumn<(typeof sites)[number]>[]>(
    () => [
      {
        id: "name",
        label: "Site",
        icon: MapPin,
        cell: (site) => (
          <RecordTableName
            leading={
              <RecordMark
                kind="site"
                name={site.name}
                emoji={site.emoji}
                avatarUrl={site.avatarUrl}
                size="sm"
              />
            }
            title={site.name}
            subtitle={site.siteNo}
          />
        ),
      },
      {
        id: "company",
        label: "Company",
        icon: Building2,
        width: "13rem",
        // `block truncate` on the cell, not the link: a long name wrapped to
        // two lines and made its row twice as tall as its neighbours.
        cell: (site) => (
          <span className="block truncate">
            {site.client ? (
              <EntityLink href={`/crm/companies/${site.client.id}`}>{site.client.name}</EntityLink>
            ) : (
              <span className="text-[var(--text-subtle)]">—</span>
            )}
          </span>
        ),
      },
      {
        id: "where",
        label: "Where",
        icon: MapPin,
        width: "14rem",
        cell: (site) => (
          <span className="block truncate">
            {[site.addressLine, site.city, site.country].filter(Boolean).join(", ") || (
              <span className="text-[var(--text-subtle)]">—</span>
            )}
          </span>
        ),
      },
      {
        id: "contact",
        label: "Contact",
        icon: UserRound,
        width: "12rem",
        cell: (site) =>
          site.primaryContact ? (
            <EntityLink href={`/crm/people/${site.primaryContact.id}`}>
              {site.primaryContact.fullName}
            </EntityLink>
          ) : (
            <span className="text-[var(--text-subtle)]">—</span>
          ),
      },
      {
        id: "deals",
        label: "Deals",
        icon: Coins,
        width: "6rem",
        align: "end",
        cell: (site) => <span className="font-mono tabular-nums">{site._count?.deals ?? 0}</span>,
      },
      {
        id: "visits",
        label: "Visits",
        icon: Calendar,
        width: "6rem",
        align: "end",
        cell: (site) => (
          <span className="font-mono tabular-nums">{site._count?.appointments ?? 0}</span>
        ),
      },
    ],
    [],
  );

  // The rows arrangement, which is also what the table falls back to on a
  // phone — so it is written once and used twice rather than diverging.
  const register = (
    <RecordList
      rows={rows}
      isLoading={sitesQuery.isLoading}
      emptyTitle={debouncedSearch ? "No sites match that search" : "No sites yet"}
      emptyBody={
        debouncedSearch
          ? undefined
          : "A site is an address you keep going back to — add one and visits and deals can point at it."
      }
      emptyAction={
        debouncedSearch ? undefined : (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            Add the first site
          </Button>
        )
      }
    />
  );

  return (
    <RecordListShell
      title="Sites"
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      searchPlaceholder="Search sites by name, number or address"
      createLabel="New site"
      onCreate={() => setCreateOpen(true)}
      error={sitesQuery.error}
      count={`${sites.length} of ${total}`}
      layout={<LayoutSwitch value={layout} onChange={setLayout} options={["TABLE", "LIST"]} />}
    >
      {layout === "TABLE" ? (
        <RecordTable
          rows={sites}
          columns={columns}
          rowHref={(site) => `/crm/sites/${site.id}`}
          isLoading={sitesQuery.isLoading}
          emptyTitle={debouncedSearch ? "No sites match that search" : "No sites yet"}
          emptyBody={
            debouncedSearch
              ? undefined
              : "A site is an address you keep going back to — add one and visits and deals can point at it."
          }
          emptyAction={
            debouncedSearch ? undefined : (
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                Add the first site
              </Button>
            )
          }
          mobile={register}
        />
      ) : (
        register
      )}

      <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <SiteFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </RecordListShell>
  );
}
