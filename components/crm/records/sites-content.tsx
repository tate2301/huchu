"use client";

import { useMemo, useState } from "react";

import { Button } from "@corelithzw/react";
import { EntityLink } from "@/components/records/entity-link";
import { ClientDate } from "@/components/ui/client-date";
import type { CrmSiteRecord } from "@/lib/crm/crm-v2";
import { SITE_REGISTER } from "@/lib/crm/registers/defs/site";
import { Building2, Calendar, Coins, Crosshair, MapPin, Tag, UserRound } from "@/lib/icons";

import { SiteFormSheet } from "./site-form-sheet";
import { RecordList, RecordListPager, type RecordListRow } from "@/components/records/record-list";
import { GroupedRecordList } from "@/components/records/record-list-groups";
import { RecordCell, RecordTable, RecordTableName, recordCellTone } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import { RegisterShell } from "@/components/crm/registers/register-shell";
import { REGISTER_PAGE_SIZE, useRegister } from "@/components/crm/registers/use-register";
import {
  emptyState,
  groupSections,
  registerColumns,
  tableSort,
  type ColumnRenderer,
} from "@/components/crm/registers/table-helpers";

type Site = CrmSiteRecord;

/** Sites: the addresses work happens at, on the list engine. See `PeopleContent`. */
export function SitesContent({ openCreate = false }: { openCreate?: boolean }) {
  const register = useRegister<Site>(SITE_REGISTER);
  const { state, rows: sites } = register;
  const layout = state.layout ?? "TABLE";
  const [createOpen, setCreateOpen] = useState(openCreate);

  const renderers = useMemo<Record<string, ColumnRenderer<Site>>>(
    () => ({
      name: {
        icon: MapPin,
        cell: (site) => (
          <RecordTableName
            leading={<RecordMark kind="site" name={site.name} emoji={site.emoji} avatarUrl={site.avatarUrl} size="sm" />}
            title={site.name}
            subtitle={site.siteNo}
          />
        ),
      },
      ref: { width: "8rem", cell: (site) => <RecordCell kind="code" value={site.siteNo} /> },
      company: {
        icon: Building2,
        width: "13rem",
        // `block truncate` on the cell, not the link: a long name wrapped to
        // two lines and made its row twice as tall as its neighbours.
        cell: (site) => (
          <span className="block truncate">
            {site.client ? (
              <EntityLink href={`/crm/companies/${site.client.id}`} className={recordCellTone("relation")}>
                {site.client.name}
              </EntityLink>
            ) : (
              <RecordCell value={null} />
            )}
          </span>
        ),
      },
      address: {
        icon: MapPin,
        width: "14rem",
        cell: (site) => <RecordCell value={[site.addressLine, site.city, site.country].filter(Boolean).join(", ")} />,
      },
      city: { width: "8rem", cell: (site) => <RecordCell value={site.city} /> },
      country: { width: "8rem", cell: (site) => <RecordCell value={site.country} /> },
      contact: {
        icon: UserRound,
        width: "12rem",
        cell: (site) =>
          site.primaryContact ? (
            <span className="block truncate">
              <EntityLink href={`/crm/people/${site.primaryContact.id}`} className={recordCellTone("relation")}>
                {site.primaryContact.fullName}
              </EntityLink>
            </span>
          ) : (
            <RecordCell value={null} />
          ),
      },
      deals: {
        icon: Coins,
        width: "5.5rem",
        align: "end",
        cell: (site) => <RecordCell kind="number" value={site._count?.deals ?? 0} />,
      },
      visits: {
        icon: Calendar,
        width: "5.5rem",
        align: "end",
        cell: (site) => <RecordCell kind="number" value={site._count?.appointments ?? 0} />,
      },
      coordinates: {
        icon: Crosshair,
        width: "12rem",
        cell: (site) => (
          <RecordCell
            kind="code"
            value={
              site.latitude !== null && site.longitude !== null
                ? `${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`
                : null
            }
          />
        ),
      },
      tags: { icon: Tag, width: "10rem", cell: (site) => <RecordCell value={site.tags?.join(", ")} /> },
      created: {
        width: "8.5rem",
        cell: (site) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={site.createdAt} mode="date" />
          </span>
        ),
      },
      updated: {
        width: "10rem",
        cell: (site) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={site.updatedAt} />
          </span>
        ),
      },
    }),
    [],
  );

  const columns = registerColumns(register, renderers);

  const rows = useMemo<RecordListRow[]>(
    () =>
      sites.map((site) => ({
        id: site.id,
        leading: <RecordMark kind="site" name={site.name} emoji={site.emoji} avatarUrl={site.avatarUrl} size="md" />,
        href: `/crm/sites/${site.id}`,
        title: site.name,
        subtitle: [site.siteNo, site.client?.name, [site.addressLine, site.city, site.country].filter(Boolean).join(", ")]
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

  const empty = emptyState(register, {
    none: "No sites yet",
    noneBody: "A site is an address you keep going back to — add one and visits and deals can point at it.",
  });
  const emptyAction =
    empty.kind === "none" ? (
      <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
        Add the first site
      </Button>
    ) : empty.kind === "filtered" ? (
      <Button variant="secondary" size="sm" onClick={register.clearFilters}>
        Clear the filters
      </Button>
    ) : undefined;

  // Grouped, the list is sections under the same headings as the table.
  const list = register.groups ? (
    <GroupedRecordList
      sections={groupSections(register.groups, rows)}
      isLoading={register.query.isLoading}
      emptyTitle={empty.title}
      emptyBody={empty.body}
      emptyAction={emptyAction}
    />
  ) : (
    <RecordList
      rows={rows}
      isLoading={register.query.isLoading}
      emptyTitle={empty.title}
      emptyBody={empty.body}
      emptyAction={emptyAction}
    />
  );

  return (
    <RegisterShell register={register} title="Sites" createLabel="New site" onCreate={() => setCreateOpen(true)}>
      {layout === "TABLE" ? (
        <RecordTable
          rows={sites}
          columns={columns}
          rowHref={(site) => `/crm/sites/${site.id}`}
          isLoading={register.query.isLoading}
          selection={{ selectedIds: register.selection.ids, onChange: register.selection.set }}
          sort={tableSort(register)}
          groups={register.groups}
          emptyTitle={empty.title}
          emptyBody={empty.body}
          emptyAction={emptyAction}
          mobile={list}
        />
      ) : (
        list
      )}

      <RecordListPager
        page={register.page}
        pageSize={REGISTER_PAGE_SIZE}
        total={register.total}
        onPageChange={register.setPage}
      />

      <SiteFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </RegisterShell>
  );
}
