"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge, Button } from "@corelithzw/react";
import { Building2, Coins, Funnel, MapPin, Users } from "@/lib/icons";
import { useToast } from "@/components/ui/use-toast";
import { StatusChip } from "@/components/ui/status-chip";
import { fetchCrmCompanies } from "@/lib/crm/crm-v2";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ACCOUNT_STATUS_COLOR, stageColor } from "@/lib/crm/tones";
import type { CanonicalUiStatus } from "@/lib/ui/status-map";
import { useDebounced } from "@/hooks/use-debounced";

import { CompanyFormSheet } from "./company-form-sheet";
import { RecordListPager, type RecordListRow } from "./record-list";
import { RecordTable, RecordTableName, type RecordTableColumn } from "./record-table";
import { LayoutSwitch, type RecordLayout } from "./layout-switch";
import { RecordMark } from "@/components/records/record-mark";
import { RecordBoard } from "./record-board";
import { ColumnPicker } from "@/components/ui/column-picker";
import { useVisibleColumns, type ColumnOption } from "@/lib/ui/visible-columns";
import {
  GroupedRecordList,
  bucketByLetter,
  type RecordListSection,
} from "./record-list-groups";
import { RecordListShell } from "./record-list-shell";

const PAGE_SIZE = 50;

const COMPANY_TYPE_LABELS: Record<string, string> = {
  CUSTOMER: "Customer",
  PROSPECT: "Prospect",
  SUPPLIER: "Supplier",
  PARTNER: "Partner",
  OTHER: "Other",
};

const ACCOUNT_STATUS_PRESENTATION: Record<string, CanonicalUiStatus> = {
  ACTIVE: "passing",
  ON_HOLD: "pending",
  INACTIVE: "inactive",
  BLACKLISTED: "failing",
};

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  INACTIVE: "Inactive",
  BLACKLISTED: "Blacklisted",
};

/** What a company's row or card can show, for the picker. */
const COMPANY_FIELDS: ColumnOption[] = [
  { id: "name", label: "Name", required: true },
  { id: "location", label: "Reference and location" },
  { id: "status", label: "Account status" },
  { id: "type", label: "Company type" },
  { id: "people", label: "People count" },
  { id: "deals", label: "Deal count" },
  { id: "owner", label: "Owner" },
];

export function CompaniesContent({ openCreate = false }: { openCreate?: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(openCreate);
  const [layout, setLayout] = useState<RecordLayout>("TABLE");
  const debouncedSearch = useDebounced(search, 300);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const companiesQuery = useQuery({
    queryKey: ["crm", "companies", debouncedSearch, page],
    queryFn: () =>
      fetchCrmCompanies({
        filters: { q: debouncedSearch },
        // By name: the list below groups by first letter, and grouping a list
        // ordered by `updatedAt` produces headings in no order at all.
        sort: { field: "name", direction: "asc" },
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previous) => previous,
  });

  const companies = useMemo(() => companiesQuery.data?.data ?? [], [companiesQuery.data]);
  const total = companiesQuery.data?.pagination?.total ?? companies.length;

  // Account standing is the one attribute on a company worth arranging by:
  // "who is on hold" is a question somebody actually asks.
  const boardColumns = useMemo(
    () =>
      Object.entries(ACCOUNT_STATUS_LABELS).map(([value, label]) => ({
        id: value,
        name: label,
        color: ACCOUNT_STATUS_COLOR[value] ?? stageColor(null),
      })),
    [],
  );

  const fields = useVisibleColumns("crm.companies.fields", COMPANY_FIELDS);

  const boardCards = useMemo(
    () =>
      companies.map((company) => ({
        id: company.id,
        columnId: company.accountStatus,
        href: `/crm/companies/${company.id}`,
        // What the phone board shows instead of the card face: the same two
        // lines the list view uses, so switching between them is a change of
        // arrangement rather than of vocabulary.
        row: {
          leading: (
            <RecordMark
              kind="company"
              name={company.name}
              emoji={company.emoji}
              avatarUrl={company.avatarUrl}
              size="md"
            />
          ),
          title: company.name,
          subtitle: [
            company.clientNo,
            [company.city, company.country].filter(Boolean).join(", "),
          ]
            .filter(Boolean)
            .join(" · "),
          facts: fields.isVisible("people")
            ? [{ value: `${company._count?.people ?? 0} people` }]
            : undefined,
        },
        content: (
          <div className="flex items-start gap-2">
            <RecordMark
              kind="company"
              name={company.name}
              emoji={company.emoji}
              avatarUrl={company.avatarUrl}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{company.name}</p>
              {fields.isVisible("location") ? (
                <p className="truncate text-sm text-[var(--text-muted)]">
                  {[company.city, company.country].filter(Boolean).join(", ") ||
                    company.clientNo}
                </p>
              ) : null}
              {fields.isVisible("people") || fields.isVisible("deals") ? (
                <p className="mt-1 text-sm text-[var(--text-subtle)]">
                  {[
                    fields.isVisible("people")
                      ? `${company._count?.people ?? 0} people`
                      : null,
                    fields.isVisible("deals") ? `${company._count?.deals ?? 0} deals` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              {fields.isVisible("owner") ? (
                <p className="mt-1 truncate text-sm text-[var(--text-subtle)]">
                  {company.assignedTo?.name ?? "Unassigned"}
                </p>
              ) : null}
            </div>
          </div>
        ),
      })),
    [companies, fields],
  );

  const moveAccountStatus = useMutation({
    mutationFn: ({ id, accountStatus }: { id: string; accountStatus: string }) =>
      fetchJson(`/api/v2/crm/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ accountStatus }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "companies"] }),
    onError: (error) =>
      toast({
        title: "Could not change the account status",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const rows = useMemo<RecordListRow[]>(
    () =>
      companies.map((company) => ({
        id: company.id,
        href: `/crm/companies/${company.id}`,
        leading: (
          <RecordMark
            kind="company"
            name={company.name}
            emoji={company.emoji}
            avatarUrl={company.avatarUrl}
            size="md"
          />
        ),
        title: company.name,
        subtitle: fields.isVisible("location")
          ? [company.clientNo, [company.city, company.country].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(" · ")
          : null,
        status: (
          <>
            {fields.isVisible("status") ? (
              <StatusChip
                status={ACCOUNT_STATUS_PRESENTATION[company.accountStatus] ?? "pending"}
                label={ACCOUNT_STATUS_LABELS[company.accountStatus] ?? company.accountStatus}
              />
            ) : null}
            {/* Two chips beside a company name wrap onto a line of their own
                at phone width, which turns a two-line row into a three-line
                one and costs the list a third of its rows per screen. Account
                standing is the one worth the space — "on hold" changes what
                you do next; "Customer" is what nearly every row says. */}
            {fields.isVisible("type") ? (
              <span className="hidden sm:contents">
                <Badge tone="neutral" size="sm">
                  {COMPANY_TYPE_LABELS[company.companyType] ?? company.companyType}
                </Badge>
              </span>
            ) : null}
          </>
        ),
        facts: [
          ...(fields.isVisible("people")
            ? [{ label: "People", value: company._count?.people ?? 0, mono: true }]
            : []),
          ...(fields.isVisible("deals")
            ? [{ label: "Deals", value: company._count?.deals ?? 0, mono: true }]
            : []),
          ...(fields.isVisible("owner")
            ? [{ label: "Owner", value: company.assignedTo?.name ?? "Unassigned" }]
            : []),
        ],
      })),
    [companies, fields],
  );

  /**
   * The same companies, arranged as columns.
   *
   * Standing and type are the two questions a directory of accounts gets asked
   * — "who is on hold", "which of these are suppliers" — and in the row layout
   * they are two chips crowded against the name, with the second one dropped
   * entirely on a phone. As columns they line up, which is the whole reason
   * this arrangement exists.
   */
  const columns = useMemo<RecordTableColumn<(typeof companies)[number]>[]>(
    () => [
      {
        id: "name",
        label: "Company",
        icon: Building2,
        cell: (company) => (
          <RecordTableName
            leading={
              <RecordMark
                kind="company"
                name={company.name}
                emoji={company.emoji}
                avatarUrl={company.avatarUrl}
                size="sm"
              />
            }
            title={company.name}
            subtitle={company.clientNo}
          />
        ),
      },
      ...(fields.isVisible("status")
        ? [
            {
              id: "status",
              label: "Standing",
              icon: Funnel,
              width: "9rem",
              cell: (company: (typeof companies)[number]) => (
                <StatusChip
                  status={ACCOUNT_STATUS_PRESENTATION[company.accountStatus] ?? "pending"}
                  label={ACCOUNT_STATUS_LABELS[company.accountStatus] ?? company.accountStatus}
                />
              ),
            },
          ]
        : []),
      ...(fields.isVisible("type")
        ? [
            {
              id: "type",
              label: "Type",
              icon: Funnel,
              width: "8rem",
              cell: (company: (typeof companies)[number]) => (
                <Badge tone="neutral" size="sm">
                  {COMPANY_TYPE_LABELS[company.companyType] ?? company.companyType}
                </Badge>
              ),
            },
          ]
        : []),
      ...(fields.isVisible("location")
        ? [
            {
              id: "location",
              label: "Location",
              icon: MapPin,
              width: "11rem",
              cell: (company: (typeof companies)[number]) => (
                <span className="block truncate">
                  {[company.city, company.country].filter(Boolean).join(", ") || (
                    <span className="text-[var(--text-subtle)]">—</span>
                  )}
                </span>
              ),
            },
          ]
        : []),
      ...(fields.isVisible("people")
        ? [
            {
              id: "people",
              label: "People",
              icon: Users,
              width: "6rem",
              align: "end" as const,
              cell: (company: (typeof companies)[number]) => (
                <span className="font-mono tabular-nums">{company._count?.people ?? 0}</span>
              ),
            },
          ]
        : []),
      ...(fields.isVisible("deals")
        ? [
            {
              id: "deals",
              label: "Deals",
              icon: Coins,
              width: "6rem",
              align: "end" as const,
              cell: (company: (typeof companies)[number]) => (
                <span className="font-mono tabular-nums">{company._count?.deals ?? 0}</span>
              ),
            },
          ]
        : []),
      ...(fields.isVisible("owner")
        ? [
            {
              id: "owner",
              label: "Owner",
              icon: Users,
              width: "11rem",
              cell: (company: (typeof companies)[number]) => (
                <span className="block truncate">
                  {company.assignedTo?.name ?? (
                    <span className="text-[var(--text-subtle)]">Unassigned</span>
                  )}
                </span>
              ),
            },
          ]
        : []),
    ],
    [fields],
  );

  // Same reasoning as People: a directory is scanned by name, so it gets a
  // heading per letter and a jump strip once it is long enough to be work to
  // scroll. Search results stay flat — they are ranked, not alphabetical.
  const sections = useMemo<RecordListSection[]>(
    () =>
      bucketByLetter(rows, (row) => String(row.title ?? "")).map((bucket) => ({
        id: bucket.id,
        label: bucket.label,
        rows: bucket.items,
      })),
    [rows],
  );

  // The rows arrangement, which is also what the table falls back to on a
  // phone — so it is written once and used twice rather than diverging.
  const directory = (
    <GroupedRecordList
      sections={debouncedSearch ? [{ id: "results", label: "Results", rows }] : sections}
      showJumpStrip={!debouncedSearch && rows.length >= 30}
      isLoading={companiesQuery.isLoading}
      emptyTitle={debouncedSearch ? "No companies match that search" : "No companies yet"}
      emptyBody={
        debouncedSearch ? undefined : "Add one, or convert a lead and its company comes with it."
      }
      emptyAction={
        debouncedSearch ? undefined : (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            Add the first company
          </Button>
        )
      }
    />
  );

  return (
    <RecordListShell
      title="Companies"
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      searchPlaceholder="Search companies by name, number or city"
      createLabel="New company"
      onCreate={() => setCreateOpen(true)}
      error={companiesQuery.error}
      count={`${companies.length} of ${total}`}
      display={
        <ColumnPicker
          columns={COMPANY_FIELDS}
          state={fields}
          label={layout === "BOARD" ? "Fields" : "Columns"}
        />
      }
      layout={
        <LayoutSwitch value={layout} onChange={setLayout} options={["TABLE", "LIST", "BOARD"]} />
      }
    >
      {layout === "BOARD" ? (
        <RecordBoard
          columns={boardColumns}
          cards={boardCards}
          isLoading={companiesQuery.isLoading}
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
          isLoading={companiesQuery.isLoading}
          emptyTitle={debouncedSearch ? "No companies match that search" : "No companies yet"}
          emptyBody={
            debouncedSearch
              ? undefined
              : "Add one, or convert a lead and its company comes with it."
          }
          mobile={directory}
        />
      ) : (
        directory
      )}

      {layout === "BOARD" ? null : (
        <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      )}

      <CompanyFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </RecordListShell>
  );
}
