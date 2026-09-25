"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { EntityLink } from "@/components/records/entity-link";
import { RecordMark } from "@/components/records/record-mark";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Trash2 } from "@/lib/icons";

export type ProjectMember = {
  id: string;
  role: string | null;
  addedAt: string;
  user: { id: string; name: string | null; email: string };
};

type TeamResponse = { data: { id: string; name: string | null; email: string }[] };

/**
 * Who is on the project.
 *
 * The owner leads the list and is not removable here: they answer for the
 * budget, and changing who that is belongs to the Owner property, where the
 * history records it. Everybody else can be added with a word about what they
 * do, and taken off again.
 */
export function ProjectTeam({
  projectId,
  owner,
  members,
  canEdit,
}: {
  projectId: string;
  owner: { id: string; name: string | null } | null;
  members: ProjectMember[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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

  return (
    <div className="space-y-4">
      <ul className="border-t border-[var(--table-divider)]">
        {owner ? (
          <li className="flex items-center gap-3 border-b border-[var(--table-divider)] py-2.5">
            <RecordMark kind="rep" name={owner.name} size="sm" />
            <span className="min-w-0 flex-1">
              <EntityLink href={`/crm/reps/${owner.id}`}>{owner.name ?? "Unnamed"}</EntityLink>
              <span className="block text-sm text-[var(--text-muted)]">Owner — answers for the budget</span>
            </span>
          </li>
        ) : null}
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-3 border-b border-[var(--table-divider)] py-2.5"
          >
            <RecordMark kind="rep" name={member.user.name ?? member.user.email} size="sm" />
            <span className="min-w-0 flex-1">
              <EntityLink href={`/crm/reps/${member.user.id}`}>
                {member.user.name ?? member.user.email}
              </EntityLink>
              <span className="block truncate text-sm text-[var(--text-muted)]">
                {member.role ?? "On the team"}
              </span>
            </span>
            {canEdit ? (
              <IconButton
                aria-label={`Take ${member.user.name ?? "them"} off the project`}
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate(member.user.id)}
              >
                <Trash2 />
              </IconButton>
            ) : null}
          </li>
        ))}
      </ul>

      {!owner && members.length === 0 ? (
        <EmptyState
          title="Nobody is on it yet"
          body="Give the project an owner, and add the people doing the work."
        />
      ) : null}

      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (userId) add.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Add someone</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name ?? person.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-role">What they do</Label>
            <Input
              id="member-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Crew lead, estimator…"
            />
          </div>
          <Button type="submit" variant="outline" disabled={!userId || add.isPending}>
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
