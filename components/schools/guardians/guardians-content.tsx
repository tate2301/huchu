"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, MobileList } from "@corelithzw/react";

import { RecordCell } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import { PageChrome } from "@/components/layout/page-chrome";
import { FilterSelect } from "@/components/schools/common/filter-select";
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
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { PortalInviteDialog } from "@/components/schools/portal/portal-invite-dialog";
import { DataTable } from "@/components/ui/data-table";
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
   * What was typed into the table's own search box.
   *
   * Echoed out of `DataTable` rather than driving it — the box and the
   * matching are one control in there — because an empty list has to say which
   * of the two emptied it. "No guardians on file" over a list somebody has
   * typed "Moyo" into sends them off to add a parent the school already has.
   */
  const [searched, setSearched] = useState("");
  const [classId, setClassId] = useState("");
  const [relationship, setRelationship] = useState("");
  const [account, setAccount] = useState<AccountFilter>("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<GuardianFormValues>(EMPTY_GUARDIAN);

  const classesQuery = useQuery({
    queryKey: ["schools", "guardians", "year-groups"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const guardiansQuery = useQuery({
    queryKey: ["schools", "guardians", "list", classId, relationship, account],
    queryFn: () =>
      fetchJson<GuardianPage>(
        guardiansUrl({
          limit: 100,
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
            name={`${row.original.lastName}, ${row.original.firstName}`}
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
        cell: ({ row }) => {
          const verbs: RecordVerb[] = [
            {
              label: "Edit",
              action: "edit",
              onSelect: () => openEdit(row.original),
            },
          ];
          if (canDelete) {
            verbs.push({
              label: "Delete for good",
              action: "archive",
              tone: "danger",
              loading: remove.isPending && remove.variables?.id === row.original.id,
              // The API refuses while children are attached, so saying so
              // here turns a 409 nobody expected into a decision taken
              // before the click.
              unavailable:
                (row.original._count?.studentLinks ?? 0) > 0
                  ? "Detach their children first — a guardian with a child on the roll cannot be removed."
                  : undefined,
              confirm: {
                title: `Delete ${row.original.firstName} ${row.original.lastName} for good?`,
                description:
                  "The record is destroyed — contact details, portal invitation and all. It cannot be brought back, and nothing about their children changes.",
                confirmLabel: "Delete for good",
              },
              onSelect: () => remove.mutate(row.original),
            });
          }
          return (
            <RecordActions
              layout="menu"
              label={`Row actions for ${row.original.firstName} ${row.original.lastName}`}
              resource="schools.students"
              verbs={verbs}
            />
          );
        },
      },
    ],
    [remove, openEdit, canDelete],
  );

  const tally = tallyQuery.data;

  return (
    <SchoolsPage
      band={
        <PageBand
          chips={[
            {
              label: "On the portal",
              value: (tally?.withAccount ?? 0).toLocaleString(),
              tone: "success",
            },
            {
              label: "Not invited",
              value: (tally?.withoutAccount ?? 0).toLocaleString(),
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

      {/* The filters ride in the table's own control row, beside the search
          box that searches the same rows. They used to sit on a band of their
          own above it, which answered "narrow it down" in two places — and the
          search box stays where it is because in this list the box and the
          filtering are one control: `DataTable` matches the rows in the
          browser as they are typed into. */}
      <DataTable
        data={guardians}
        columns={columns}
        searchPlaceholder="Search guardians"
        searchSubmitLabel="Search"
        onQueryStateChange={(next) => {
          if (next.search !== undefined) setSearched(next.search);
        }}
        pagination={{ enabled: true }}
        toolbar={
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
        emptyState={
          guardiansQuery.isPending ? (
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
          ) : filtersInForce.length > 0 || searched.trim() ? (
            <NothingMatched
              what="guardians"
              filters={filtersInForce}
              search={searched}
              // Only where there is something this screen can undo. The search
              // box belongs to the table, so a "Clear the search" button here
              // would be a button that left the box full.
              onClear={filtersInForce.length > 0 ? clearFilters : undefined}
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
        }
      />

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
