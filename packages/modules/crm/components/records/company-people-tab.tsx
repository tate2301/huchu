"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Plus, X } from "@corelithzw/ui/lib/icons";

import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { RecordPicker, type PickedRecord } from "./record-picker";

export type CompanyPerson = {
  id: string;
  fullName: string;
  jobTitle?: string | null;
  phone?: string | null;
};

/**
 * Who works at a company, and how to say so.
 *
 * A person belongs to a company through their own record, so attaching one is
 * a write to the person rather than to a join table — which is why this reads
 * "move this person here" rather than "create a membership". Detaching leaves
 * the person alone with no company, because somebody leaving an employer is
 * not somebody being deleted.
 */
export function CompanyPeopleTab({
  companyId,
  people,
}: {
  companyId: string;
  people: CompanyPerson[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [picked, setPicked] = useState<PickedRecord | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["crm", "company", companyId] });
    queryClient.invalidateQueries({ queryKey: ["crm", "people"] });
  };

  const attach = useMutation({
    mutationFn: (personId: string) =>
      fetchJson(`/api/v2/crm/people/${personId}`, {
        method: "PATCH",
        body: JSON.stringify({ clientId: companyId }),
      }),
    onSuccess: () => {
      setPicked(null);
      refresh();
      toast({ title: "Added to this company" });
    },
    onError: (error) =>
      toast({
        title: "Could not add that person",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const detach = useMutation({
    mutationFn: (personId: string) =>
      fetchJson(`/api/v2/crm/people/${personId}`, {
        method: "PATCH",
        body: JSON.stringify({ clientId: null }),
      }),
    onSuccess: () => {
      refresh();
      toast({ title: "Removed from this company" });
    },
    onError: (error) =>
      toast({
        title: "Could not remove that person",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <RecordPicker
            value={picked}
            onChange={setPicked}
            types={["PERSON"]}
            placeholder="Search people to add"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-2"
          disabled={!picked || attach.isPending}
          onClick={() => picked && attach.mutate(picked.id)}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {people.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          Nobody is recorded at this company yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {people.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 hover:bg-[var(--surface-subtle)]"
            >
              <EntityLink
                href={`/crm/people/${person.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium"
              >
                {person.fullName}
              </EntityLink>
              {person.jobTitle ? (
                <span className="hidden flex-none text-sm text-[var(--text-muted)] sm:inline">
                  {person.jobTitle}
                </span>
              ) : null}
              {person.phone ? (
                <span className="hidden flex-none font-mono text-sm text-[var(--text-muted)] sm:inline">
                  {person.phone}
                </span>
              ) : null}
              <IconButton
                size="sm"
                aria-label={`Remove ${person.fullName} from this company`}
                disabled={detach.isPending}
                onClick={() => detach.mutate(person.id)}
              >
                <X />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
