"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge, Button } from "@corelithzw/react";
import { EntityLink } from "@/components/records/entity-link";
import { Building2, Coins, Funnel, Mail, UserRound, Users } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CONTACT_TYPE_COLOR, stageColor } from "@/lib/crm/tones";
import { fetchCrmPeople } from "@/lib/crm/crm-v2";
import { useDebounced } from "@/hooks/use-debounced";

import { PersonFormSheet } from "./person-form-sheet";
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

const CONTACT_TYPE_LABELS: Record<string, string> = {
  CUSTOMER: "Customer",
  DECISION_MAKER: "Decision-maker",
  SITE_CONTACT: "Site contact",
  FINANCE_CONTACT: "Finance contact",
  SUPPLIER_CONTACT: "Supplier",
  REFERRAL_PARTNER: "Referral partner",
  OTHER: "Other",
};

/** What a person's row or card can show, for the picker. */
const PERSON_FIELDS: ColumnOption[] = [
  { id: "name", label: "Name", required: true },
  { id: "role", label: "Job title and company" },
  { id: "contact", label: "Email or phone" },
  { id: "type", label: "Contact type" },
  { id: "deals", label: "Deal count" },
  { id: "owner", label: "Owner" },
];

export function PeopleContent({ openCreate = false }: { openCreate?: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(openCreate);
  const debouncedSearch = useDebounced(search, 300);

  const peopleQuery = useQuery({
    queryKey: ["crm", "people", debouncedSearch, page],
    queryFn: () =>
      fetchCrmPeople({
        filters: { q: debouncedSearch },
        // By name, because the page below groups by first letter. On the
        // default `updatedAt` order the headings came out A, S, C, N, F — an
        // alphabet applied to a list that was not in alphabetical order, which
        // is worse than no headings at all. Sort first, then group.
        sort: { field: "fullName", direction: "asc" },
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previous) => previous,
  });

  const people = useMemo(() => peopleQuery.data?.data ?? [], [peopleQuery.data]);
  const total = peopleQuery.data?.pagination?.total ?? people.length;

  const [layout, setLayout] = useState<RecordLayout>("TABLE");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string | null }> }>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
  });

  const assign = useMutation({
    mutationFn: ({
      ids,
      assignedToId,
    }: {
      ids: string[];
      assignedToId: string | null;
      clear: () => void;
    }) =>
      fetchJson<{ updated: number; skipped: number }>("/api/v2/crm/people/bulk", {
        method: "POST",
        body: JSON.stringify({ action: "assign", ids, assignedToId }),
      }),
    onSuccess: (result, variables) => {
      variables.clear();
      queryClient.invalidateQueries({ queryKey: ["crm", "people"] });
      toast({
        title: `${result.updated} ${result.updated === 1 ? "person" : "people"} reassigned`,
        // Saying what was left alone, rather than letting the count quietly
        // disagree with what was selected.
        description:
          result.skipped > 0
            ? `${result.skipped} skipped — they belong to someone else.`
            : undefined,
      });
    },
    onError: (error) =>
      toast({
        title: "Could not reassign",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const fields = useVisibleColumns("crm.people.fields", PERSON_FIELDS);

  const rows = useMemo<RecordListRow[]>(
    () =>
      people.map((person) => ({
        id: person.id,
        href: `/crm/people/${person.id}`,
        leading: (
          <RecordMark
            kind="person"
            name={person.fullName}
            emoji={person.emoji}
            avatarUrl={person.avatarUrl}
            size="md"
          />
        ),
        title: person.fullName,
        subtitle:
          [
            fields.isVisible("role") ? person.jobTitle : null,
            fields.isVisible("role") ? person.client?.name : null,
            fields.isVisible("contact") ? person.email ?? person.phone : null,
          ]
            .filter(Boolean)
            .join(" · ") || person.personNo,
        status: fields.isVisible("type") ? (
          <Badge tone="neutral" size="sm">
            {CONTACT_TYPE_LABELS[person.contactType] ?? person.contactType}
          </Badge>
        ) : null,
        facts: [
          ...(fields.isVisible("deals")
            ? [{ label: "Deals", value: person._count?.dealContacts ?? 0, mono: true }]
            : []),
          ...(fields.isVisible("owner")
            ? [{ label: "Owner", value: person.assignedTo?.name ?? "Unassigned" }]
            : []),
        ],
      })),
    [fields, people],
  );

  // A directory is scanned by name, so it gets the grouped-by-section recipe:
  // one heading per letter, and a jump strip once the page is long enough for
  // scrolling to it to be work. A search result is ranked by relevance, not
  // alphabet, so it stays a flat list.
  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);

  // A directory is arranged by what kind of contact somebody is, which is the
  // one attribute on a person worth seeing them sorted into.
  const boardColumns = useMemo(
    () =>
      Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => ({
        id: value,
        name: label,
        color: CONTACT_TYPE_COLOR[value] ?? stageColor(null),
      })),
    [],
  );

  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const boardCards = useMemo(
    () =>
      people.map((person) => ({
        id: person.id,
        columnId: person.contactType,
        href: `/crm/people/${person.id}`,
        // The phone board reuses the list view's row for the same person, so
        // the two arrangements of these records say the same things.
        row: (() => {
          const row = rowsById.get(person.id);
          if (!row) return undefined;
          return {
            leading: row.leading,
            title: row.title,
            subtitle: row.subtitle,
            status: row.status,
            facts: row.facts,
          };
        })(),
        content: (
          <div className="flex items-start gap-2">
            <RecordMark
              kind="person"
              name={person.fullName}
              emoji={person.emoji}
              avatarUrl={person.avatarUrl}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{person.fullName}</p>
              {fields.isVisible("role") ? (
                <p className="truncate text-sm text-[var(--text-muted)]">
                  {[person.jobTitle, person.client?.name].filter(Boolean).join(" · ") ||
                    person.personNo}
                </p>
              ) : null}
              {fields.isVisible("contact") && (person.email || person.phone) ? (
                <p className="mt-1 truncate text-sm text-[var(--text-subtle)]">
                  {person.email ?? person.phone}
                </p>
              ) : null}
              {fields.isVisible("owner") ? (
                <p className="mt-1 truncate text-sm text-[var(--text-subtle)]">
                  {person.assignedTo?.name ?? "Unassigned"}
                </p>
              ) : null}
            </div>
          </div>
        ),
      })),
    [fields, people, rowsById],
  );

  const moveContactType = useMutation({
    mutationFn: ({ id, contactType }: { id: string; contactType: string }) =>
      fetchJson(`/api/v2/crm/people/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ contactType }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "people"] }),
    onError: (error) =>
      toast({
        title: "Could not change the contact type",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  /**
   * The same people, arranged as columns.
   *
   * The picker's fields drive both arrangements, so hiding "Owner" hides it in
   * the table and in the rows — otherwise the control means one thing on one
   * view and nothing on the other. The name column is never hidden; a table of
   * anonymous rows is not a table.
   */
  const columns = useMemo<RecordTableColumn<(typeof people)[number]>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        icon: UserRound,
        cell: (person) => (
          <RecordTableName
            leading={
              <RecordMark
                kind="person"
                name={person.fullName}
                emoji={person.emoji}
                avatarUrl={person.avatarUrl}
                size="sm"
              />
            }
            title={person.fullName}
            subtitle={fields.isVisible("role") ? person.jobTitle : null}
          />
        ),
      },
      ...(fields.isVisible("role")
        ? [
            {
              id: "company",
              label: "Company",
              icon: Building2,
              width: "13rem",
              cell: (person: (typeof people)[number]) => (
                // `block truncate` on the cell rather than the link: a long
                // company name wrapped to two lines and made its row twice as
                // tall as its neighbours.
                <span className="block truncate">
                  {person.client ? (
                    // A related record, so it peeks rather than navigates: the
                    // point of a directory is to stay in it while you check who
                    // somebody works for.
                    <EntityLink href={`/crm/companies/${person.client.id}`}>
                      {person.client.name}
                    </EntityLink>
                  ) : (
                    <span className="text-[var(--text-subtle)]">—</span>
                  )}
                </span>
              ),
            },
          ]
        : []),
      ...(fields.isVisible("contact")
        ? [
            {
              id: "contact",
              label: "Contact",
              icon: Mail,
              width: "14rem",
              cell: (person: (typeof people)[number]) => (
                <span className="block truncate text-[var(--text-body)]">
                  {person.email ?? person.phone ?? "—"}
                </span>
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
              width: "10rem",
              cell: (person: (typeof people)[number]) => (
                <Badge tone="neutral" size="sm">
                  {CONTACT_TYPE_LABELS[person.contactType] ?? person.contactType}
                </Badge>
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
              cell: (person: (typeof people)[number]) => (
                <span className="font-mono tabular-nums">
                  {person._count?.dealContacts ?? 0}
                </span>
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
              cell: (person: (typeof people)[number]) => (
                <span className="block truncate">
                  {person.assignedTo?.name ?? (
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

  const sections = useMemo<RecordListSection[]>(
    () =>
      bucketByLetter(rows, (row) => String(row.title ?? "")).map((bucket) => ({
        id: bucket.id,
        label: bucket.label,
        rows: bucket.items,
      })),
    [rows],
  );

  // One selection, whichever way the records are arranged. Written once here
  // rather than inline in each branch, because two copies of a bulk action are
  // two chances for the table's version to keep working after the list's has
  // been changed.
  const selection = {
    selectedIds,
    onChange: setSelectedIds,
    actions: ({ ids, clear }: { ids: string[]; clear: () => void }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            Assign owner
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          {owners.map((owner) => (
            <DropdownMenuItem
              key={owner.id}
              onClick={() => assign.mutate({ ids, assignedToId: owner.id, clear })}
            >
              {owner.name ?? "Unnamed"}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => assign.mutate({ ids, assignedToId: null, clear })}>
            Leave unassigned
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  };

  // The rows arrangement, which is also what the table falls back to on a
  // phone — so it is written once and used twice rather than diverging.
  const directory = (
    <GroupedRecordList
      selection={selection}
      sections={debouncedSearch ? [{ id: "results", label: "Results", rows }] : sections}
      showJumpStrip={!debouncedSearch && rows.length >= 30}
      isLoading={peopleQuery.isLoading}
      emptyTitle={debouncedSearch ? "No people match that search" : "No people yet"}
      emptyBody={
        debouncedSearch
          ? undefined
          : "Add someone, or convert a lead and its contact comes with it."
      }
      emptyAction={
        debouncedSearch ? undefined : (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            Add the first person
          </Button>
        )
      }
    />
  );

  return (
    <RecordListShell
      title="People"
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      searchPlaceholder="Search people by name, email or phone"
      createLabel="New person"
      onCreate={() => setCreateOpen(true)}
      error={peopleQuery.error}
      count={`${people.length} of ${total}`}
      display={
        <ColumnPicker
          columns={PERSON_FIELDS}
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
          isLoading={peopleQuery.isLoading}
          noun={{ one: "person", many: "people" }}
          emptyLabel="No one of this kind"
          onMove={(id, contactType) => moveContactType.mutate({ id, contactType })}
          className="min-h-[24rem]"
        />
      ) : layout === "TABLE" ? (
        <RecordTable
          rows={people}
          columns={columns}
          rowHref={(person) => `/crm/people/${person.id}`}
          isLoading={peopleQuery.isLoading}
          selection={selection}
          emptyTitle={debouncedSearch ? "No people match that search" : "No people yet"}
          emptyBody={
            debouncedSearch
              ? undefined
              : "Add someone, or convert a lead and its contact comes with it."
          }
          mobile={directory}
        />
      ) : (
        directory
      )}

      {layout === "BOARD" ? null : (
        <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      )}

      <PersonFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </RecordListShell>
  );
}
