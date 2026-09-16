"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, MobileList } from "@corelithzw/react";

import { RecordCell } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import { RecordList, type RecordListRow } from "@/components/records/record-list";
import { LayoutSwitch, type RecordLayout } from "@/components/records/layout-switch";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { PageChrome } from "@/components/layout/page-chrome";
import {
  activeFilterCount,
  FilterSelect,
} from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import {
  CreateButton,
  RecordActions,
  type RecordVerb,
} from "@/components/schools/common/record-actions";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import {
  ListRowsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { PortalInviteDialog } from "@/components/schools/portal/portal-invite-dialog";
import { DataTable } from "@/components/ui/data-table";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchJson } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
import { isSchoolAdmin } from "@/lib/schools/permissions";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import {
  EMPTY_GUARDIAN,
  GuardianFormDialog,
  type GuardianFormValues,
} from "./guardian-form-dialog";
import { RELATIONSHIP_OPTIONS } from "./relationships";

/**
 * The guardians list.
 *
 * Two things were wrong with it and they are the same thing twice: every row
 * was a dead end. A hundred parents were rendered with one verb between them —
 * "invite" — so there was no way to add the mother of a pupil admitted this
 * morning, no way to correct a phone number typed wrong at admission, and no
 * way to take a guardian off the books at all. The row verbs and the create
 * button below are that gap closed.
 *
 * The filters answer the questions the office actually arrives with. Year group
 * is the first of them: fee letters, results evenings and disciplinary calls are
 * all organised a form at a time, and "the parents of Form 2" was not a list
 * this screen could produce. It filters through the child, so a guardian with
 * children in two forms appears under both — which is correct, and is why it is
 * a filter on the link rather than on the guardian.
 *
 * ## Two arrangements, because the screen is asked two questions
 *
 * "Ring Tendai's mother" is find-and-open, and a header row and six columns
 * spend a lot of screen saying what one line of text would. "Who is still not
 * on the portal", "who has no email address" are read down a column, and a
 * stack of two-line rows cannot answer either because the facts never line up.
 * Both are real questions this office asks, so the same rows get a second
 * arrangement rather than a second page, off the one layout switch every
 * record list in the product uses.
 *
 * The two say the same things about the same parent — same mark, same hue,
 * same supporting line — because the mark is hashed from the name in natural
 * order in both, not from the surname-first string the rows are sorted by.
 */

type GuardianStudentLink = {
  id: string;
  relationship: string;
  isPrimary: boolean;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    status: string;
    currentClass: { id: string; code: string; name: string } | null;
  };
};

type GuardianRow = {
  id: string;
  guardianNo: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
  nationalId: string | null;
  userId: string | null;
  studentLinks: GuardianStudentLink[];
  _count: { studentLinks: number };
};

type GuardianPage = {
  data: GuardianRow[];
  pagination: { total: number };
};

type AccountFilter = "" | "with-account" | "without-account";

const ACCOUNT_OPTIONS = [
  { value: "with-account", label: "On the portal" },
  { value: "without-account", label: "Not invited" },
];

function guardiansUrl(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  return `/api/v2/schools/guardians?${search.toString()}`;
}

export function GuardiansContent() {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();
  /**
   * Deleting a guardian is the administrator's alone, and the endpoint says so
   * on top of the `archive` grant every registrar holds. A verb the API will
   * refuse for a reason the grant cannot express is not disabled here, it is
   * absent: the row would otherwise offer the registrar a button whose only
   * outcome is a 403.
   */
  const canDelete = isSchoolAdmin(access.role);

  /**
   * Search runs at the endpoint, beside the filters, rather than over the rows
   * already fetched. A box that matched only the hundred parents in hand would
   * answer "Moyo" with whichever Moyos happened to be on the first page — and
   * the search is the shortest route to one record, so it is the one control
   * that must reach the whole register.
   */
  const [search, setSearch] = useState("");
  /**
   * The register is fetched, not filtered in the browser, so the search box is
   * a request. Typed straight through it is a request per keystroke; held for a
   * moment it is one request per word, which is what the CRM people list does
   * for the same reason. The raw value still drives the input and the
   * "nothing matched" copy, so the box itself stays immediate.
   */
  const debouncedSearch = useDebounced(search, 300);
  const [classId, setClassId] = useState("");
  const [relationship, setRelationship] = useState("");
  const [account, setAccount] = useState<AccountFilter>("");
  const [layout, setLayout] = useState<RecordLayout>("TABLE");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<GuardianFormValues>(EMPTY_GUARDIAN);

  const classesQuery = useQuery({
    queryKey: ["schools", "guardians", "year-groups"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const guardiansQuery = useQuery({
    queryKey: ["schools", "guardians", "list", debouncedSearch, classId, relationship, account],
    queryFn: () =>
      fetchJson<GuardianPage>(
        guardiansUrl({
          limit: 100,
          search: debouncedSearch.trim() || undefined,
          classId: classId || undefined,
          relationship: relationship || undefined,
          hasPortalAccount:
            account === "" ? undefined : account === "with-account" ? "true" : "false",
        }),
      ),
  });

  /**
   * The band's two numbers, counted over the whole school rather than the page
   * in view. `limit=1` because only the total is wanted — a school with 1,100
   * parents should not fetch 1,100 rows to draw two chips.
   */
  const tallyQuery = useQuery({
    queryKey: ["schools", "guardians", "tally"],
    queryFn: async () => {
      const [everyone, onPortal] = await Promise.all([
        fetchJson<GuardianPage>(guardiansUrl({ limit: 1 })),
        fetchJson<GuardianPage>(guardiansUrl({ limit: 1, hasPortalAccount: "true" })),
      ]);
      return {
        total: everyone.pagination.total,
        withAccount: onPortal.pagination.total,
        withoutAccount: everyone.pagination.total - onPortal.pagination.total,
      };
    },
  });

  const remove = useMutation({
    mutationFn: (guardian: GuardianRow) =>
      fetchJson(`/api/v2/schools/guardians/${guardian.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "guardians"] });
    },
  });

  const guardians = useMemo(() => guardiansQuery.data?.data ?? [], [guardiansQuery.data]);
  const total = guardiansQuery.data?.pagination.total ?? guardians.length;

  const inviteCandidates = useMemo(
    () =>
      guardians.map((guardian) => ({
        subjectId: guardian.id,
        name: `${guardian.firstName} ${guardian.lastName}`,
        reference: guardian.guardianNo,
        email: guardian.email,
        hasAccount: Boolean(guardian.userId),
      })),
    [guardians],
  );

  const invitable = inviteCandidates.filter(
    (candidate) => !candidate.hasAccount && candidate.email,
  ).length;

  const yearGroupOptions = useMemo(
    () =>
      (classesQuery.data?.data ?? []).map((schoolClass) => ({
        value: schoolClass.id,
        label: schoolClass.name,
      })),
    [classesQuery.data],
  );

  const filtersInForce = [
    classId ? yearGroupOptions.find((option) => option.value === classId)?.label : null,
    relationship
      ? RELATIONSHIP_OPTIONS.find((option) => option.value === relationship)?.label
      : null,
    account === "with-account"
      ? "On the portal"
      : account === "without-account"
        ? "Not invited"
        : null,
  ].filter((value): value is string => Boolean(value));

  const clearFilters = () => {
    setSearch("");
    setClassId("");
    setRelationship("");
    setAccount("");
  };

  const openCreate = () => {
    setFormInitial(EMPTY_GUARDIAN);
    setFormOpen(true);
  };

  const openEdit = useCallback((guardian: GuardianRow) => {
    setFormInitial({
      id: guardian.id,
      guardianNo: guardian.guardianNo,
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      phone: guardian.phone,
      email: guardian.email ?? "",
      address: guardian.address ?? "",
      nationalId: guardian.nationalId ?? "",
    });
    setFormOpen(true);
  }, []);

  /**
   * The row's verbs, written once for both arrangements. Two copies would be
   * two chances for the table's version to keep working after the list's had
   * been changed.
   */
  const rowVerbs = useCallback(
    (guardian: GuardianRow): RecordVerb[] => {
      const verbs: RecordVerb[] = [
        {
          label: "Edit",
          action: "edit",
          onSelect: () => openEdit(guardian),
        },
      ];
      if (canDelete) {
        verbs.push({
          label: "Delete for good",
          action: "archive",
          tone: "danger",
          loading: remove.isPending && remove.variables?.id === guardian.id,
          // The API refuses while children are attached, so saying so here
          // turns a 409 nobody expected into a decision taken before the
          // click.
          unavailable:
            (guardian._count?.studentLinks ?? 0) > 0
              ? "Detach their children first — a guardian with a child on the roll cannot be removed."
              : undefined,
          confirm: {
            title: `Delete ${guardian.firstName} ${guardian.lastName} for good?`,
            description:
              "The record is destroyed — contact details, portal invitation and all. It cannot be brought back, and nothing about their children changes.",
            confirmLabel: "Delete for good",
          },
          onSelect: () => remove.mutate(guardian),
        });
      }
      return verbs;
    },
    [canDelete, openEdit, remove],
  );

  const columns = useMemo<ColumnDef<GuardianRow>[]>(
    () => [
      {
        id: "name",
        // Surname first, matching the `lastName, firstName` sort the API
        // applies — otherwise an alphabetical list reads as an unsorted one.
        header: "Name",
        // The guardian number belongs on this cell's second line, not in a
        // column of its own. It is what tells two Moyo, Ts apart, and a list
        // whose whole job is telling parents apart had the name alone in one
        // column and the number that distinguishes them in another.
        cell: ({ row }) => (
          <PersonCell
            kind="guardian"
            firstName={row.original.firstName}
            lastName={row.original.lastName}
            displayName={`${row.original.lastName}, ${row.original.firstName}`}
            href={recordType("GUARDIAN").href(row.original.id)}
            reference={row.original.guardianNo}
          />
        ),
      },
      {
        id: "phone",
        header: "Phone",
        cell: ({ row }) => <RecordCell kind="phone" value={row.original.phone} />,
      },
      {
        id: "email",
        header: "Email",
        // Named rather than dashed: a parent with no email is a parent the
        // portal cannot reach, which is a fact somebody acts on.
        cell: ({ row }) =>
          row.original.email ? (
            <RecordCell kind="email" value={row.original.email} />
          ) : (
            <span className="text-sm text-[var(--text-muted)]">No email on file</span>
          ),
      },
      {
        id: "portal",
        header: "Portal",
        cell: ({ row }) =>
          row.original.userId ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">Not invited</span>
          ),
      },
      {
        id: "students",
        header: "Children",
        cell: ({ row }) => (
          <RecordCell kind="number" value={row.original._count?.studentLinks ?? 0} />
        ),
      },
      {
        id: "actions",
        // An affordance, not a field — but the head still needs the cell, or
        // every column below it shifts by one.
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => (
          <RecordActions
            layout="menu"
            label={`Row actions for ${row.original.firstName} ${row.original.lastName}`}
            resource="schools.students"
            verbs={rowVerbs(row.original)}
          />
        ),
      },
    ],
    [rowVerbs],
  );

  const listRows = useMemo<RecordListRow[]>(
    () =>
      guardians.map((guardian) => ({
        id: guardian.id,
        href: recordType("GUARDIAN").href(guardian.id),
        // Natural order for the mark, surname first for the name: the hue is
        // hashed from who they are, so a parent keeps one colour whichever
        // arrangement, and whichever screen, you meet them on.
        leading: (
          <RecordMark
            kind="guardian"
            name={`${guardian.firstName} ${guardian.lastName}`}
            size="md"
          />
        ),
        title: `${guardian.lastName}, ${guardian.firstName}`,
        // The reference leads, as it does in the table's name cell, and the
        // number the office rings follows it — which is what the row is
        // usually opened for.
        subtitle: [guardian.guardianNo, guardian.phone].filter(Boolean).join(" · "),
        status: guardian.userId ? <Badge tone="success">Active</Badge> : null,
        // Nothing is marked `primary`: stripped of its label on a phone,
        // "3" at the end of a parent's name is a figure about them that does
        // not say which, and neither of these is the figure the row is about.
        facts: [
          {
            label: "Email",
            value: guardian.email ?? "No email on file",
            kind: guardian.email ? ("email" as const) : undefined,
          },
          {
            label: "Children",
            value: guardian._count?.studentLinks ?? 0,
            mono: true,
          },
        ],
        actions: (
          <RecordActions
            layout="menu"
            label={`Row actions for ${guardian.firstName} ${guardian.lastName}`}
            resource="schools.students"
            verbs={rowVerbs(guardian)}
          />
        ),
      })),
    [guardians, rowVerbs],
  );

  const tally = tallyQuery.data;
  const narrowed = filtersInForce.length > 0 || search.trim().length > 0;

  return (
    <SchoolsPage
      band={
        <PageBand
          chips={[
            {
              label: "On the portal",
              // An em dash until the count is in. A nought that turns into 843
              // reads as a school with nobody on the portal, and it reads that
              // way for exactly as long as somebody might glance at it.
              value: tally ? tally.withAccount.toLocaleString() : "—",
              tone: "success",
            },
            {
              label: "Not invited",
              value: tally ? tally.withoutAccount.toLocaleString() : "—",
              tone: "warn",
            },
          ]}
          actions={
            <RecordActions
              resource="schools.students"
              verbs={[
                {
                  label:
                    invitable === 0
                      ? "Invite to the portal"
                      : `Invite ${invitable} to the portal`,
                  action: "invite",
                  unavailable:
                    invitable === 0
                      ? "Everyone in view either has an account or has no email address."
                      : undefined,
                  onSelect: () => setInviteOpen(true),
                },
              ]}
            />
          }
        />
      }
    >
      <PageChrome title="Guardians">
        <CreateButton
          resource="schools.students"
          label="Add a guardian"
          onSelect={openCreate}
        />
      </PageChrome>

      {guardiansQuery.isError ? (
        <LoadError
          what="the guardian list"
          error={guardiansQuery.error}
          onRetry={() => void guardiansQuery.refetch()}
        />
      ) : null}

      {/* Deleting is refused while a child is still attached, and the row verb
          says so before the click — but a guardian who was detached in another
          tab still gets a 409, and that answer belongs on the page rather than
          in a console. The same alert carries the administrator-only refusal. */}
      {remove.isError ? <SaveError what="That guardian" error={remove.error} /> : null}

      {/* One row, read left to right: which arrangement, then how it is
          narrowed, then how many of it there are. The filters and the search
          used to ride in the table's own control row, which meant this list
          collapsed neither of them on a phone and never said how many filters
          were in force — so a parent who could not be found was a list that
          looked empty for no visible reason. */}
      <TableControls
        layout={
          <LayoutSwitch value={layout} onChange={setLayout} options={["TABLE", "LIST"]} />
        }
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search name, guardian number or phone"
          />
        }
        filterCount={activeFilterCount(classId, relationship, account)}
        filters={
          <>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={classId}
              options={yearGroupOptions}
              onChange={setClassId}
            />
            <FilterSelect
              label="Relationship"
              allLabel="Any relationship"
              value={relationship}
              options={[...RELATIONSHIP_OPTIONS]}
              onChange={setRelationship}
            />
            <FilterSelect
              label="Portal account"
              allLabel="Everyone"
              value={account}
              options={ACCOUNT_OPTIONS}
              onChange={(value) => setAccount(value as AccountFilter)}
            />
          </>
        }
        count={guardiansQuery.isPending ? null : `${guardians.length} of ${total}`}
      />

      {guardiansQuery.isPending ? (
        // The placeholder is the shape the rows are about to take, so the page
        // does not jump when they land.
        layout === "LIST" ? (
          <ListRowsSkeleton />
        ) : (
          <TableRowsSkeleton
            headers={["Name", "Phone", "Email", "Portal", "Children", ""]}
            columns={[
              { avatar: true, twoLine: true },
              { width: 140 },
              { width: 230 },
              { width: 110, badge: true },
              { width: 90, align: "right" },
              { width: 44 },
            ]}
          />
        )
      ) : guardians.length === 0 ? (
        narrowed ? (
          <NothingMatched
            what="guardians"
            filters={filtersInForce}
            search={search}
            onClear={clearFilters}
          />
        ) : (
          <NothingYet
            title="No guardians on file"
            body="A guardian is who the school rings, who owes the fees, and who may be told a result. Nothing reaches a family until one is here."
            action={
              <CreateButton
                resource="schools.students"
                label="Add a guardian"
                onSelect={openCreate}
              />
            }
          />
        )
      ) : layout === "LIST" ? (
        <RecordList rows={listRows} />
      ) : (
        <DataTable
          data={guardians}
          columns={columns}
          // The narrowing is answered once, in the row above. Left on, the
          // table draws a second search box under the first.
          features={{ globalFilter: false, pagination: true }}
          pagination={{ enabled: true }}
          mobileListRenderer={({ rows }) => (
            <MobileList>
              {rows.map(({ row }) => (
                <MobileList.Row
                  key={row.id}
                  // The same mark the table draws, so a parent is the same
                  // colour and the same two letters at either width.
                  leading={
                    <RecordMark
                      kind="guardian"
                      name={`${row.firstName} ${row.lastName}`}
                      size="sm"
                    />
                  }
                  title={`${row.lastName}, ${row.firstName}`}
                  // "Portal" was a `<Badge>` in `trailing`, where the design
                  // system's `1fr 14px` row grid sizes that column for a
                  // chevron and `.mobile-list` clips the overflow — so the
                  // badge was cut mid-word on every guardian who had claimed
                  // an account. It reads as text on the subtitle line instead.
                  subtitle={[
                    row.guardianNo,
                    row.phone,
                    `${row._count?.studentLinks ?? 0} children`,
                    row.userId ? "Portal" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onClick={() => {
                    window.location.href = `/schools/guardians/${row.id}`;
                  }}
                />
              ))}
            </MobileList>
          )}
        />
      )}

      <GuardianFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={formInitial}
        onSaved={() => void tallyQuery.refetch()}
      />

      <PortalInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        subject="GUARDIAN"
        candidates={inviteCandidates}
        onIssued={() => {
          void queryClient.invalidateQueries({ queryKey: ["schools", "guardians"] });
        }}
      />
    </SchoolsPage>
  );
}
