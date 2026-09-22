"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import {
  ListColumn,
  ListRow,
  RegisterLayout,
  type ListColumnState,
} from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { ChevronLeftIcon, ChevronRight, Users } from "@/lib/icons";
import { getAllowedUserRoleOptionsForWorkspace } from "@/lib/platform/vertical-roles";
import {
  createManagedUser,
  fetchManagedUsers,
  type ManagedUserRole,
} from "@/lib/user-management-api";

import {
  CreateField,
  CreateSheet,
  DETAIL_CONTROL_CLASS,
  DetailSelect,
  NoRecord,
} from "@/app/management/master-data/operations/_components/register-fields";

import { initialsOf } from "./initials";
import { UserRecord } from "./user-record";
import styles from "./users.module.css";

type RoleFilter = "ALL" | ManagedUserRole;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

/**
 * The Users register — `Main.dc.html`: the list column beside the record.
 *
 * The selected user is the URL, not local state, so
 * `/preferences/organization/users/[id]` keeps working exactly as it did and
 * the row that is open is the row the address bar names.
 *
 * It renders the shell itself so `RegisterLayout` reaches the surface's grid
 * row as a direct child; wrapped in anything else the shell treats the screen
 * as an unconverted page and draws a title line and a second inset around it.
 *
 * Presentation only. The query key keeps all eight of its elements in their
 * original positions, including the role and status filters — the board draws
 * no filter controls, so those two stay pinned at "ALL" rather than being
 * dropped from the key, which would silently break every `invalidateQueries`
 * that names it.
 */
export function UsersRegister({ selectedId }: { selectedId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)
    ?.enabledFeatures;
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)
    ?.workspaceProfile;
  const canMutate = sessionRole === "SUPERADMIN";

  const roleOptions = React.useMemo(
    () =>
      getAllowedUserRoleOptionsForWorkspace({
        workspaceProfile,
        enabledFeatures,
      }).filter((role) => role.value !== "CLERK") as Array<{
        value: ManagedUserRole;
        label: string;
      }>,
    [enabledFeatures, workspaceProfile],
  );
  const managedRoles = React.useMemo(
    () => roleOptions.map((role) => role.value),
    [roleOptions],
  );

  const roleFilter: RoleFilter = "ALL";
  const statusFilter: StatusFilter = "ALL";
  const pageSize = 25;

  const [search, setSearch] = React.useState("");
  const [submittedSearch, setSubmittedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState({
    name: "",
    email: "",
    password: "",
    role: defaultRole(managedRoles),
  });

  // The old toolbar had a Submit button beside the field. The board's search is
  // a field that opens over the title and nothing else, so the submitted value
  // trails the typed one instead — same key, same request shape.
  React.useEffect(() => {
    const timer = setTimeout(() => setSubmittedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [submittedSearch]);

  React.useEffect(() => {
    if (!managedRoles.includes(createDraft.role)) {
      setCreateDraft((current) => ({ ...current, role: defaultRole(managedRoles) }));
    }
  }, [createDraft.role, managedRoles]);

  const usersQuery = useQuery({
    queryKey: [
      "preferences",
      "organization",
      "users",
      page,
      pageSize,
      submittedSearch,
      roleFilter,
      statusFilter,
    ],
    queryFn: () =>
      fetchManagedUsers({
        role: roleFilter === "ALL" ? undefined : roleFilter,
        active: statusFilter === "ALL" ? undefined : statusFilter === "ACTIVE",
        search: submittedSearch || undefined,
        page,
        limit: pageSize,
      }),
    enabled: managedRoles.length > 0,
  });

  const users = usersQuery.data?.data ?? [];
  const pagination = usersQuery.data?.pagination;
  const pageCount = pagination?.pages ?? 1;
  const currentPage = pagination?.page ?? page;
  const total = pagination?.total ?? users.length;

  const createMutation = useMutation({
    mutationFn: createManagedUser,
    onSuccess: () => {
      // Rule 1: the description said the title again in more words.
      toast({ title: "User created", variant: "success" });
      closeCreate();
      queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "users"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to create user",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  function closeCreate() {
    setCreateOpen(false);
    setCreateDraft({
      name: "",
      email: "",
      password: "",
      role: defaultRole(managedRoles),
    });
  }

  // The query waits on the session for its allowed roles, and a query that is
  // disabled is not "loading" — without this the column would flash its empty
  // panel on every first paint.
  const state: ListColumnState = sessionStatus === "loading" || usersQuery.isLoading
    ? "loading"
    : usersQuery.isError
      ? "failed"
      : users.length > 0
        ? "ready"
        : submittedSearch
          ? "no-matches"
          : "empty";

  return (
    <PreferencesShell railCounts={{ users: total }}>
      <RegisterLayout
        hasSelection={Boolean(selectedId)}
        list={
          <>
            <ListColumn
              title="Users"
              noun="user"
              count={total}
              state={state}
              /* The rail's own Users glyph, so the empty panel and the row
                 that leads to it are the same thing. */
              emptyIcon={Users}
              /* No placeholder: the field already carries a magnifier and an
                 sr-only "Search users" label, and a placeholder saying the
                 label again is rule 1 in a smaller box. States.dc.html draws
                 it the same way. */
              search={{ value: search, onChange: setSearch }}
              /* Rule 9: a manager browsing the directory gets no verb rather
                 than one that refuses. */
              onNew={canMutate ? () => setCreateOpen(true) : undefined}
              onRetry={() => void usersQuery.refetch()}
            >
              {users.map((user) => (
                <ListRow
                  key={user.id}
                  name={user.name || user.email}
                  mark={initialsOf(user.name || user.email)}
                  href={`/preferences/organization/users/${user.id}`}
                  selected={user.id === selectedId}
                  /* The board's amber dot, labelled "Never signed in".
                     `lastSignInAt` is the newest `auth.login.success` event
                     for this address, computed for the whole page in one
                     `groupBy` — `null` is an account that has never signed in.
                     Strictly `=== null`, because the mutation endpoints return
                     the row they wrote without reading the ledger, and
                     `undefined` there means unknown, not never. */
                  attention={user.lastSignInAt === null}
                  attentionLabel="Never signed in"
                  /* A suspended account reads muted rather than carrying a
                     chip — the board's own treatment, and the same one an
                     archived department gets. */
                  className={user.isActive ? undefined : styles.mutedRow}
                />
              ))}
            </ListColumn>

            {/* Not on the board — the board draws one screenful of a register
                that is paged server-side, 25 rows at a time, and dropping the
                pager would put every user past the 25th out of reach. Kept as
                quiet as the rest of the column. */}
            {pageCount > 1 ? (
              <nav
                aria-label="Pages"
                className="flex h-11 shrink-0 items-center gap-2 border-t border-[#EEF0F4] pr-3 pl-5"
              >
                <span className={styles.pagerCount}>
                  {currentPage} of {pageCount}
                </span>
                <span className="flex-1" />
                {/* Rule 9: a chevron with nowhere to go is not drawn greyed,
                    it is not drawn. The pair is a fixed 62px wide so the one
                    that remains does not slide as the pages turn. */}
                <span className="flex w-[62px] shrink-0 justify-end gap-1.5">
                  {currentPage > 1 ? (
                    <button
                      type="button"
                      aria-label="Previous page"
                      className="grid size-7 place-items-center rounded-lg text-[#565C69] hover:bg-[#F1F3F6]"
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                    >
                      <ChevronLeftIcon className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                  {currentPage < pageCount ? (
                    <button
                      type="button"
                      aria-label="Next page"
                      className="grid size-7 place-items-center rounded-lg text-[#565C69] hover:bg-[#F1F3F6]"
                      onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                    >
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </nav>
            ) : null}
          </>
        }
      >
        {selectedId ? (
          <UserRecord userId={selectedId} />
        ) : (
          <NoRecord
            label={
              state === "loading"
                ? "Loading users"
                : submittedSearch
                  ? "No user matches that search."
                  : "No user to show yet."
            }
          />
        )}

        <CreateSheet
          open={createOpen}
          onOpenChange={(open) => (open ? setCreateOpen(true) : closeCreate())}
          title="New user"
          submitLabel="Create user"
          busy={createMutation.isPending}
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate({
              name: createDraft.name.trim(),
              email: createDraft.email.trim(),
              password: createDraft.password,
              role: createDraft.role,
            });
          }}
        >
          <CreateField label="Name">
            {(id) => (
              <Input
                id={id}
                required
                value={createDraft.name}
                className={DETAIL_CONTROL_CLASS}
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            )}
          </CreateField>
          <CreateField label="Email">
            {(id) => (
              <Input
                id={id}
                type="email"
                required
                value={createDraft.email}
                className={DETAIL_CONTROL_CLASS}
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, email: event.target.value }))
                }
              />
            )}
          </CreateField>
          <CreateField label="Temporary password">
            {(id) => (
              <Input
                id={id}
                type="password"
                required
                minLength={8}
                value={createDraft.password}
                className={DETAIL_CONTROL_CLASS}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />
            )}
          </CreateField>
          <CreateField label="Role">
            {(id) => (
              <DetailSelect
                id={id}
                value={createDraft.role}
                onValueChange={(value) =>
                  setCreateDraft((current) => ({
                    ...current,
                    role: value as ManagedUserRole,
                  }))
                }
              >
                {roleOptions.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </DetailSelect>
            )}
          </CreateField>
        </CreateSheet>
      </RegisterLayout>
    </PreferencesShell>
  );
}

function defaultRole(roles: ManagedUserRole[]): ManagedUserRole {
  if (roles.includes("OPERATOR")) return "OPERATOR";
  if (roles.includes("MANAGER")) return "MANAGER";
  return roles[0] ?? "MANAGER";
}
