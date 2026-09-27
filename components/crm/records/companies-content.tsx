"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Badge, Button } from "@corelithzw/react";
import { Building2, Calendar, Coins, Funnel, Globe, Mail, MapPin, Phone, Tag, Users } from "@/lib/icons";
import { useToast } from "@/components/ui/use-toast";
import { StatusChip } from "@/components/ui/status-chip";
import { ClientDate } from "@/components/ui/client-date";
import { EntityLink } from "@/components/records/entity-link";
import type { CrmCompanyRecord } from "@/lib/crm/crm-v2";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ACCOUNT_STATUS_COLOR, stageColor } from "@/lib/crm/tones";
import { ACCOUNT_STATUS_OPTIONS, COMPANY_TYPE_OPTIONS, optionLabel } from "@/lib/crm/record-labels";
import { COMPANY_REGISTER } from "@/lib/crm/registers/defs/company";
import type { CanonicalUiStatus } from "@/lib/ui/status-map";

import { CompanyFormSheet } from "./company-form-sheet";
import { RecordListPager, type RecordListRow } from "@/components/records/record-list";
import { RecordCell, RecordTable, RecordTableName, recordCellTone } from "@/components/records/record-table";
import { DirectoryCell } from "@/components/records/people-directory";
import { RecordMark } from "@/components/records/record-mark";
import { RecordBoard } from "./record-board";
import { GroupedRecordList, bucketByLetter, type RecordListSection } from "@/components/records/record-list-groups";
import { RegisterShell } from "@/components/crm/registers/register-shell";
import { REGISTER_PAGE_SIZE, useRegister } from "@/components/crm/registers/use-register";
import {
  emptyState,
  registerColumns,
  tableSort,
  type ColumnRenderer,
} from "@/components/crm/registers/table-helpers";

type Company = CrmCompanyRecord;

const ACCOUNT_STATUS_PRESENTATION: Record<string, CanonicalUiStatus> = {
  ACTIVE: "passing",
  ON_HOLD: "pending",
  INACTIVE: "inactive",
  BLACKLISTED: "failing",
};

function Standing({ status }: { status: string }) {
  return (
    <StatusChip
      status={ACCOUNT_STATUS_PRESENTATION[status] ?? "pending"}
      label={optionLabel(ACCOUNT_STATUS_OPTIONS, status)}
    />
  );
}

/** Companies: the accounts, on the list engine. See `PeopleContent`. */
export function CompaniesContent({ openCreate = false }: { openCreate?: boolean }) {
  const register = useRegister<Company>(COMPANY_REGISTER);
  const { state, rows: companies } = register;
  const layout = state.layout ?? "TABLE";
  const [createOpen, setCreateOpen] = useState(openCreate);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const moveAccountStatus = useMutation({
    mutationFn: ({ id, accountStatus }: { id: string; accountStatus: string }) =>
      fetchJson(`/api/v2/crm/companies/${id}`, { method: "PATCH", body: JSON.stringify({ accountStatus }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "companies"] }),
    onError: (error) =>
      toast({ title: "Could not change the account status", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const renderers = useMemo<Record<string, ColumnRenderer<Company>>>(
    () => ({
      name: {
        icon: Building2,
        cell: (company) => (
          <RecordTableName
            leading={<RecordMark kind="company" name={company.name} emoji={company.emoji} avatarUrl={company.avatarUrl} size="sm" />}
            title={company.name}
            subtitle={company.clientNo}
          />
        ),
      },
      ref: { width: "8rem", cell: (company) => <RecordCell kind="code" value={company.clientNo} /> },
      tradingName: { width: "11rem", cell: (company) => <RecordCell value={company.tradingName} /> },
      status: { icon: Funnel, width: "9rem", cell: (company) => <Standing status={company.accountStatus} /> },
      type: {
        icon: Funnel,
        width: "8rem",
        cell: (company) => (
          <Badge tone="neutral" size="sm">
            {optionLabel(COMPANY_TYPE_OPTIONS, company.companyType)}
          </Badge>
        ),
      },
      location: {
        icon: MapPin,
        width: "11rem",
        cell: (company) => <RecordCell value={[company.city, company.country].filter(Boolean).join(", ")} />,
      },
      people: {
        icon: Users,
        width: "5.5rem",
        align: "end",
        cell: (company) => <RecordCell kind="number" value={company._count?.people ?? 0} />,
      },
      deals: {
        icon: Coins,
        width: "5.5rem",
        align: "end",
        cell: (company) => <RecordCell kind="number" value={company._count?.deals ?? 0} />,
      },
      owner: {
        icon: Users,
        width: "10rem",
        cell: (company) => <DirectoryCell value={company.assignedTo?.name} missing="Unassigned" />,
      },
      email: { icon: Mail, width: "13rem", cell: (company) => <DirectoryCell kind="email" value={company.email} missing="no email" /> },
      phone: { icon: Phone, width: "10rem", cell: (company) => <DirectoryCell kind="phone" value={company.phone} missing="no phone" /> },
      website: { icon: Globe, width: "12rem", cell: (company) => <RecordCell value={company.website} /> },
      industry: { width: "10rem", cell: (company) => <RecordCell value={company.industry} /> },
      parent: {
        icon: Building2,
        width: "12rem",
        cell: (company) =>
          company.parent ? (
            <span className="block truncate">
              <EntityLink href={`/crm/companies/${company.parent.id}`} className={recordCellTone("relation")}>
                {company.parent.name}
              </EntityLink>
            </span>
          ) : (
            <RecordCell value={null} />
          ),
      },
      taxNumber: { width: "9rem", cell: (company) => <RecordCell kind="code" value={company.taxNumber} /> },
      tags: { icon: Tag, width: "10rem", cell: (company) => <RecordCell value={company.tags?.join(", ")} /> },
      contacted: {
        icon: Calendar,
        width: "8.5rem",
        cell: (company) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={company.lastContactedAt} mode="date" fallback="never" />
          </span>
        ),
      },
      created: {
        width: "8.5rem",
        cell: (company) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={company.createdAt} mode="date" />
          </span>
        ),
      },
      updated: {
        width: "10rem",
        cell: (company) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={company.updatedAt} />
          </span>
        ),
      },
    }),
    [],
  );

  const columns = registerColumns(register, renderers);

  const rows = useMemo<RecordListRow[]>(
    () =>
      companies.map((company) => ({
        id: company.id,
        href: `/crm/companies/${company.id}`,
        leading: (
          <RecordMark kind="company" name={company.name} emoji={company.emoji} avatarUrl={company.avatarUrl} size="md" />
        ),
        title: company.name,
        subtitle: [company.clientNo, [company.city, company.country].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" · "),
        // Standing, not type: "on hold" changes what you do next; "Customer"
        // is what nearly every row says, and two chips wrap at phone width.
        status: <Standing status={company.accountStatus} />,
        facts: [
          { label: "People", value: company._count?.people ?? 0, mono: true },
          { label: "Deals", value: company._count?.deals ?? 0, mono: true },
          { label: "Owner", value: company.assignedTo?.name ?? "Unassigned" },
        ],
      })),
    [companies],
  );

  const byName = (state.sort?.key ?? "name") === "name" && (state.sort?.dir ?? "asc") === "asc";
  const sections = useMemo<RecordListSection[]>(
    () =>
      byName && !state.q
        ? bucketByLetter(rows, (row) => String(row.title ?? "")).map((bucket) => ({
            id: bucket.id,
            label: bucket.label,
            rows: bucket.items,
          }))
        : [{ id: "results", label: state.q ? "Results" : "Companies", rows }],
    [byName, rows, state.q],
  );

  // Account standing is the one attribute worth arranging companies by: "who
  // is on hold" is a question somebody actually asks.
  const boardColumns = useMemo(
    () =>
      ACCOUNT_STATUS_OPTIONS.map(({ value, label }) => ({
        id: value,
        name: label,
        color: ACCOUNT_STATUS_COLOR[value] ?? stageColor(null),
      })),
    [],
  );
  const boardCards = useMemo(
    () =>
      companies.map((company) => ({
        id: company.id,
        columnId: company.accountStatus,
        href: `/crm/companies/${company.id}`,
        row: rows.find((row) => row.id === company.id),
        content: (
          <div className="flex items-start gap-2">
            <RecordMark kind="company" name={company.name} emoji={company.emoji} avatarUrl={company.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{company.name}</p>
              <p className="truncate text-sm text-[var(--text-muted)]">
                {[company.city, company.country].filter(Boolean).join(", ") || company.clientNo}
              </p>
              <p className="mt-1 text-sm text-[var(--text-subtle)]">
                {company._count?.people ?? 0} people · {company._count?.deals ?? 0} deals
              </p>
            </div>
          </div>
        ),
      })),
    [companies, rows],
  );

  const empty = emptyState(register, {
    none: "No companies yet",
    noneBody: "Add one, or convert a lead and its company comes with it.",
  });
  const emptyAction =
    empty.kind === "none" ? (
      <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
        Add the first company
      </Button>
    ) : empty.kind === "filtered" ? (
      <Button variant="secondary" size="sm" onClick={register.clearFilters}>
        Clear the filters
      </Button>
    ) : undefined;

  const directory = (
    <GroupedRecordList
      sections={sections}
      showJumpStrip={byName && !state.q && rows.length >= 30}
      isLoading={register.query.isLoading}
      emptyTitle={empty.title}
      emptyBody={empty.body}
      emptyAction={emptyAction}
    />
  );

  return (
    <RegisterShell
      register={register}
      title="Companies"
      createLabel="New company"
      onCreate={() => setCreateOpen(true)}
    >
      {layout === "BOARD" ? (
        <RecordBoard
          columns={boardColumns}
          cards={boardCards}
          isLoading={register.query.isLoading}
          noun={{ one: "company", many: "companies" }}
          emptyLabel="None in this state"
          onMove={(id, accountStatus) => moveAccountStatus.mutate({ id, accountStatus })}
          className="min-h-[24rem]"
        />
      ) : layout === "TABLE" ? (
        <RecordTable
          rows={companies}
          columns={columns}
          rowHref={(company) => `/crm/companies/${company.id}`}
          isLoading={register.query.isLoading}
          selection={{ selectedIds: register.selection.ids, onChange: register.selection.set }}
          sort={tableSort(register)}
          emptyTitle={empty.title}
          emptyBody={empty.body}
          emptyAction={emptyAction}
          mobile={directory}
        />
      ) : (
        directory
      )}

      {layout === "BOARD" ? null : (
        <RecordListPager
          page={register.page}
          pageSize={REGISTER_PAGE_SIZE}
          total={register.total}
          onPageChange={register.setPage}
        />
      )}

      <CompanyFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </RegisterShell>
  );
}
