"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchCrmLists, type CrmListRecord } from "@/lib/crm/collections-client";
import { groupHref, type GroupEntity } from "@/lib/crm/groups";
import { ChevronDown, Plus, Tag } from "@/lib/icons";

import { NewGroupDialog } from "./group-dialog";

/**
 * Which groups a record is in, from the record itself: "Groups · 2" in its
 * toolbar, opening a list of this record type's groups to tick in or out.
 *
 * Groups somebody else keeps, which this reader may look at but not change,
 * are listed under "Also in" when they hold the record — and left out when
 * they do not, because a checkbox you may not tick is not an option.
 */
export function RecordGroupsControl({ entity, recordId }: { entity: GroupEntity; recordId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const groups = useQuery({
    queryKey: ["crm", "lists", entity, "holding", recordId],
    queryFn: () => fetchCrmLists(entity, recordId),
    select: (response) => response.data,
    staleTime: 60_000,
  });

  const toggle = useMutation({
    mutationFn: ({ group, into }: { group: CrmListRecord; into: boolean }) =>
      fetchJson(`/api/v2/crm/lists/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify(into ? { addRecordIds: [recordId] } : { removeRecordIds: [recordId] }),
      }),
    // Ticked at once: the answer is almost always yes, and a box that waits
    // for the network before it moves reads as a box that did not take.
    onMutate: ({ group, into }) => {
      const key = ["crm", "lists", entity, "holding", recordId];
      const before = queryClient.getQueryData<{ data: CrmListRecord[] }>(key);
      queryClient.setQueryData<{ data: CrmListRecord[] }>(key, (current) =>
        current
          ? { data: current.data.map((entry) => (entry.id === group.id ? { ...entry, contains: into } : entry)) }
          : current,
      );
      return { before };
    },
    onError: (error, _variables, context) => {
      if (context?.before) queryClient.setQueryData(["crm", "lists", entity, "holding", recordId], context.before);
      toast({ title: "Could not change its groups", description: getApiErrorMessage(error), variant: "destructive" });
    },
    // The sidebar's counts and the list's Group filter read the same groups.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["crm", "lists"] }),
  });

  const all = groups.data ?? [];
  const editable = all.filter((group) => group.canEdit !== false);
  const elsewhere = all.filter((group) => group.canEdit === false && group.contains);
  const count = all.filter((group) => group.contains).length;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={count > 0 ? `Groups: in ${count}. Change them` : "Groups: in none. Add it to one"}
            className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-sm text-[var(--text-body)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <Tag className="size-4 text-[var(--text-muted)]" aria-hidden="true" />
            Groups
            {count > 0 ? (
              <span className="font-mono tabular-nums text-[var(--text-muted)]">{count}</span>
            ) : null}
            <ChevronDown aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            {editable.length > 7 ? <CommandInput placeholder="Find a group" /> : null}
            <CommandList>
              <CommandEmpty>{groups.isLoading ? "Loading…" : "No groups yet"}</CommandEmpty>
              {editable.length > 0 ? (
                <CommandGroup heading="In these groups">
                  {editable.map((group) => (
                    <CommandItem
                      key={group.id}
                      value={`${group.name} ${group.id}`}
                      onSelect={() => toggle.mutate({ group, into: !group.contains })}
                    >
                      <Checkbox
                        checked={Boolean(group.contains)}
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none"
                      />
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      <span className="font-mono text-sm tabular-nums text-[var(--text-subtle)]">
                        {group._count?.members ?? 0}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {elsewhere.length > 0 ? (
                <CommandGroup heading="Also in">
                  {elsewhere.map((group) => (
                    <CommandItem
                      key={group.id}
                      value={`also ${group.name} ${group.id}`}
                      onSelect={() => router.push(groupHref(entity, group.id))}
                    >
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="new group"
                  onSelect={() => {
                    setOpen(false);
                    setCreating(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New group…
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {creating ? (
        <NewGroupDialog open={creating} onOpenChange={setCreating} entity={entity} recordIds={[recordId]} />
      ) : null}
    </>
  );
}
