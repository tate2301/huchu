"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge, MobileList, MobileListEmpty } from "@corelithzw/react";

import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { FilterBar, FilterSelect } from "../common/filter-select";
import { PageBand } from "../common/page-band";
import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import {
  CreateButton,
  RecordActions,
} from "../common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "../common/states";
import { PortalInviteDialog } from "../portal/portal-invite-dialog";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { fetchJson } from "@corelithzw/platform/api-client";
import { fetchSchoolsClasses } from "../../admin-v2";
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
        id: "guardianNo",
        header: "Guardian No",
        cell: ({ row }) => (
          <Link
            href={`/schools/guardians/${row.original.id}`}
            className="font-mono text-sm text-[var(--text-link)] hover:underline"
          >
            {row.original.guardianNo}
          </Link>
        ),
      },
      {
        id: "name",
        // Surname first, matching the `lastName, firstName` sort the API
        // applies — otherwise an alphabetical list reads as an unsorted one.
        header: "Name",
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2">
            <PersonAvatar
              firstName={row.original.firstName}
              lastName={row.original.lastName}
            />
            <span className="truncate font-medium">
              {row.original.lastName}, {row.original.firstName}
            </span>
          </span>
        ),
      },
      {
        id: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">{row.original.phone}</span>
        ),
      },
      {
        id: "email",
        header: "Email",
        cell: ({ row }) =>
          row.original.email ? (
            <span className="truncate">{row.original.email}</span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          ),
      },
      {
        id: "portal",
        header: "Portal",
        cell: ({ row }) =>
          row.original.userId ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <span className="text-[var(--text-muted)]">Not invited</span>
          ),
      },
      {
        id: "students",
        header: "Linked Students",
        cell: ({ row }) => <NumericCell>{row.original._count?.studentLinks ?? 0}</NumericCell>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.students"
            verbs={[
              {
                label: "Edit",
                action: "edit",
                onSelect: () => openEdit(row.original),
              },
              {
                label: "Delete",
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
                  title: `Delete ${row.original.firstName} ${row.original.lastName}?`,
                  description:
                    "Their contact details and any portal invitation go with them. Nothing about their children changes.",
                  confirmLabel: "Delete the guardian",
                },
                onSelect: () => remove.mutate(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [remove, openEdit],
  );

  const tally = tallyQuery.data;
  const caption = tally
    ? `${tally.total.toLocaleString()} on file · ${tally.withoutAccount.toLocaleString()} not invited`
    : undefined;

  return (
    <div className="space-y-4">
      <PageHeading
        title="Guardians"
        description={caption}
        primaryAction={
          <CreateButton
            resource="schools.students"
            label="Add a guardian"
            onSelect={openCreate}
          />
        }
        secondaryActions={
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
      />

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
          in a console. */}
      {remove.isError ? <SaveError what="That guardian" error={remove.error} /> : null}

      <FilterBar>
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
      </FilterBar>

      <DataTable
        data={guardians}
        columns={columns}
        searchPlaceholder="Search guardians"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        mobileListRenderer={({ rows }) => (
          <MobileList>
            {rows.length === 0 ? (
              <MobileListEmpty>
                {guardiansQuery.isPending ? "Loading guardians…" : "No guardians found."}
              </MobileListEmpty>
            ) : (
              rows.map(({ row }) => (
                <MobileList.Row
                  key={row.id}
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
              ))
            )}
          </MobileList>
        )}
        emptyState={
          guardiansQuery.isPending ? (
            <TableRowsSkeleton
              columns={[
                { width: 120 },
                { avatar: true },
                { width: 140 },
                { width: 230 },
                { width: 110 },
                { width: 120 },
              ]}
            />
          ) : filtersInForce.length > 0 ? (
            <NothingMatched what="guardians" filters={filtersInForce} onClear={clearFilters} />
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
    </div>
  );
}
