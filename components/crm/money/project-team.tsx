"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ColumnList,
  ColumnName,
  ColumnRowAction,
  ColumnText,
  FormField,
  SectionAction,
  SectionHeading,
} from "@/components/management/ui";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus, Trash2 } from "@/lib/icons";

export type ProjectMember = {
  id: string;
  role: string | null;
  addedAt: string;
  user: { id: string; name: string | null; email: string };
};

type TeamResponse = { data: { id: string; name: string | null; email: string }[] };

/** The add row's measure: two fields, not the whole pane. */
const FORM_WIDTH = 560;

/**
 * Who is on the project.
 *
 * The owner leads the list and is not removable here: changing who answers
 * for the budget belongs to the Owner property, where the history records it.
 * Everybody else can be added with a word about what they do, and taken off
 * again.
 *
 * "Add someone" is the list's verb, so it sits on the list's heading (rule 2)
 * and opens the add row under it; the row is not left standing open with a
 * disabled Add in it for somebody who came to read the team.
 */
export function ProjectTeam({
  projectId,
  owner,
  members,
  canEdit,
  maxWidth = 760,
}: {
  projectId: string;
  owner: { id: string; name: string | null } | null;
  members: ProjectMember[];
  canEdit: boolean;
  /** The measure the list and its heading share with the page's other sections. */
  maxWidth?: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");

  const { data: team } = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<TeamResponse>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
    enabled: canEdit,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["crm", "project", projectId] });

  const add = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/crm/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId, role: role.trim() || null }),
      }),
    onSuccess: () => {
      setUserId("");
      setRole("");
      setAdding(false);
      refresh();
    },
    onError: (error) =>
      toast({ title: "Could not add them", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (memberUserId: string) =>
      fetchJson(`/api/v2/crm/projects/${projectId}/members?userId=${memberUserId}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
    onError: (error) =>
      toast({
        title: "Could not take them off",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const onTeam = new Set([owner?.id, ...members.map((member) => member.user.id)]);
  const candidates = (team?.data ?? []).filter((person) => !onTeam.has(person.id));

  const personLink = (id: string, name: string) => (
    <Link
      href={`/crm/reps/${id}`}
      className="text-[var(--text-strong)] underline decoration-transparent underline-offset-2 hover:decoration-[var(--border-strong)]"
    >
      {name}
    </Link>
  );

  const rows = [
    ...(owner
      ? [
          {
            id: `owner-${owner.id}`,
            cells: {
              person: <ColumnName name={personLink(owner.id, owner.name ?? "Unnamed")} />,
              role: <ColumnText>Owner</ColumnText>,
              remove: null,
            },
          },
        ]
      : []),
    ...members.map((member) => ({
      id: member.id,
      cells: {
        person: <ColumnName name={personLink(member.user.id, member.user.name ?? member.user.email)} />,
        role: <ColumnText>{member.role ?? "—"}</ColumnText>,
        remove: canEdit ? (
          <ColumnRowAction>
            <IconButton
              aria-label={`Take ${member.user.name ?? "them"} off the project`}
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(member.user.id)}
            >
              <Trash2 />
            </IconButton>
          </ColumnRowAction>
        ) : null,
      },
    })),
  ];

  return (
    <section aria-labelledby="project-team">
      <SectionHeading
        count={rows.length}
        maxWidth={maxWidth}
        className="mt-0"
        action={
          canEdit && !adding && candidates.length > 0 ? (
            <SectionAction icon={Plus} onClick={() => setAdding(true)}>
              Add someone
            </SectionAction>
          ) : undefined
        }
      >
        <span id="project-team">Team</span>
      </SectionHeading>

      {adding ? (
        <form
          className="mb-4 grid gap-x-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          style={{ maxWidth: FORM_WIDTH }}
          onSubmit={(event) => {
            event.preventDefault();
            if (userId) add.mutate();
          }}
        >
          <FormField label="Person" htmlFor="member-person">
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="member-person">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name ?? person.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Role" htmlFor="member-role">
            <Input id="member-role" value={role} onChange={(event) => setRole(event.target.value)} />
          </FormField>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={!userId || add.isPending}>
              {add.isPending ? "Adding…" : "Add"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <ColumnList
        label="Team"
        maxWidth={maxWidth}
        empty="Nobody is on it yet."
        columns={[
          { id: "person", label: "Person" },
          { id: "role", label: "Role" },
          ...(canEdit && members.length > 0 ? [{ id: "remove", label: "" }] : []),
        ]}
        rows={rows}
      />
    </section>
  );
}
