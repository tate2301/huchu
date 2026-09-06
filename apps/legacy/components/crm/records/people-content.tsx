"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge, Button } from "@corelithzw/react";
import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { Building2, Coins, Funnel, Mail, UserRound, Users } from "@corelithzw/ui/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { CONTACT_TYPE_COLOR, stageColor } from "@/lib/crm/tones";
import { fetchCrmPeople } from "@/lib/crm/crm-v2";
import { useDebounced } from "@corelithzw/ui/hooks/use-debounced";

import { PersonFormSheet } from "./person-form-sheet";
import { RecordListPager, type RecordListRow } from "./record-list";
import {
  RecordCell,
  RecordTable,
  recordCellTone,
  type RecordTableColumn,
} from "@corelithzw/module-records/components/record-table";
import { ViewToolbarChip } from "@corelithzw/module-records/components/view-toolbar";
import { LayoutSwitch, type RecordLayout } from "./layout-switch";
import { RecordMark } from "@corelithzw/module-records/components/record-mark";
import {
  DirectoryCell,
  DirectoryName,
} from "@corelithzw/module-records/components/people-directory";
import { RecordBoard } from "./record-board";
import { ColumnPicker } from "@corelithzw/ui/components/column-picker";
import { useVisibleColumns, type ColumnOption } from "@corelithzw/ui/lib/ui/visible-columns";
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
  // The two questions a directory is actually narrowed by: what kind of contact
  // somebody is, and whose they are. The canvas puts them on the search row as
  // chips rather than in a panel, because "narrow it down" answered in two
  // places a band apart is the thing the toolbar pass set out to fix.
  const [contactType, setContactType] = useState<string>("ALL");
  const [ownerFilter, setOwnerFilter] = useState<string>("ALL");

  const peopleQuery = useQuery({
    queryKey: ["crm", "people", debouncedSearch, contactType, ownerFilter, page],
    queryFn: () =>
      fetchCrmPeople({
        filters: {
          q: debouncedSearch,
          contactTypes: contactType === "ALL" ? undefined : [contactType],
          assignedToIds:
            ownerFilter === "ALL" || ownerFilter === "UNASSIGNED" ? undefined : [ownerFilter],
          unassigned: ownerFilter === "UNASSIGNED",
        },
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
          // The artboard's mono second line is `code · context` — the reference
          // first, because that is the half that is unique, then the word that
          // tells two Tendai Moyos apart. The reference alone where there is no
          // job title, never a blank line under the name.
          <DirectoryName
            name={person.fullName}
            photoUrl={person.avatarUrl}
            subtitle={
              [person.personNo, fields.isVisible("role") ? person.jobTitle : null]
                .filter(Boolean)
                .join(" · ")
            }
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
                    // somebody works for. It takes the relation ink from the
                    // same resolver the table's own cells use, so the company
                    // here and a company in any other list are the one blue.
                    <EntityLink
                      href={`/crm/companies/${person.client.id}`}
                      className={recordCellTone("relation")}
                    >
                      {person.client.name}
                    </EntityLink>
                  ) : (
                    <span className="text-[var(--text-faint)]">No company</span>
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
              // One column, two kinds. The canvas decides a cell's ink on the
              // value rather than on the column it landed in, so an address
              // here is the brand blue and a real `mailto:`, and a number
              // falls back to mono — which is what makes a column of contacts
              // scannable for "who can I actually write to".
              cell: (person: (typeof people)[number]) => (
                <DirectoryCell
                  kind={person.email ? "email" : "phone"}
                  value={person.email ?? person.phone}
                  missing="no contact on file"
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
                <RecordCell kind="number" value={person._count?.dealContacts ?? 0} />
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
                <DirectoryCell value={person.assignedTo?.name} missing="Unassigned" />
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

  const ownerLabel =
    ownerFilter === "ALL"
      ? "Anyone"
      : ownerFilter === "UNASSIGNED"
        ? "Nobody"
        : (owners.find((owner) => owner.id === ownerFilter)?.name ?? "Someone");

  // The chips say what they are filtered *to*, not merely what they filter.
  // "Type" alone has to be opened to be read; "Type Customer" is read at a
  // glance, which is the difference between a row of controls you interrogate
  // and one you scan.
  const filters = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ViewToolbarChip
            label="Type"
            value={contactType === "ALL" ? "All" : (CONTACT_TYPE_LABELS[contactType] ?? contactType)}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => {
              setContactType("ALL");
              setPage(1);
            }}
          >
            All types
          </DropdownMenuItem>
          {Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => (
            <DropdownMenuItem
              key={value}
              onClick={() => {
                setContactType(value);
                setPage(1);
              }}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ViewToolbarChip label="Owner" value={ownerLabel} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem
            onClick={() => {
              setOwnerFilter("ALL");
              setPage(1);
            }}
          >
            Anyone
          </DropdownMenuItem>
          {/* Worth its own entry rather than being folded into "Anyone": a
              contact nobody owns is the one this list is most often opened to
              find. */}
          <DropdownMenuItem
            onClick={() => {
              setOwnerFilter("UNASSIGNED");
              setPage(1);
            }}
          >
            Unassigned
          </DropdownMenuItem>
          {owners.map((owner) => (
            <DropdownMenuItem
              key={owner.id}
              onClick={() => {
                setOwnerFilter(owner.id);
                setPage(1);
              }}
            >
              {owner.name ?? "Unnamed"}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const filterCount = (contactType === "ALL" ? 0 : 1) + (ownerFilter === "ALL" ? 0 : 1);

  // An empty list has three different causes and they want three different
  // sentences. "No people yet" over a list a filter has emptied is a lie that
  // sends somebody off to add a person they already have — and offering "Add
  // the first person" there makes it an invitation to create a duplicate.
  const empty =
    debouncedSearch
      ? { title: "No people match that search", body: undefined }
      : filterCount > 0
        ? { title: "No people match these filters", body: undefined }
        : {
            title: "No people yet",
            body: "Add someone, or convert a lead and its contact comes with it.",
          };

  // The rows arrangement, which is also what the table falls back to on a
  // phone — so it is written once and used twice rather than diverging.
  const directory = (
    <GroupedRecordList
      selection={selection}
      sections={debouncedSearch ? [{ id: "results", label: "Results", rows }] : sections}
      showJumpStrip={!debouncedSearch && rows.length >= 30}
      isLoading={peopleQuery.isLoading}
      emptyTitle={empty.title}
      emptyBody={empty.body}
      emptyAction={
        empty.body ? (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            Add the first person
          </Button>
        ) : undefined
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
      filters={filters}
      filterCount={filterCount}
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
          onMove={(id, type) => moveContactType.mutate({ id, contactType: type })}
          className="min-h-[24rem]"
        />
      ) : layout === "TABLE" ? (
        <RecordTable
          rows={people}
          columns={columns}
          rowHref={(person) => `/crm/people/${person.id}`}
          isLoading={peopleQuery.isLoading}
          selection={selection}
          emptyTitle={empty.title}
          emptyBody={empty.body}
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
