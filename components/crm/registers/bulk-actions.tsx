"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { GroupEntity } from "@/lib/crm/groups";
import type { FilterOption } from "@/lib/crm/registers/types";
import { Archive, ChevronDown, Plus, RotateCcw, Tag, UserPlus } from "@/lib/icons";
import { LostReasonDialog } from "@/components/crm/leads/lost-reason-dialog";

import { NewGroupDialog } from "./group-dialog";
import { useGroups, useTeamMembers } from "./register-data";
import type { RegisterHandle } from "./use-register";

/** What a bulk request did, and what it left alone. */
export type BulkResult = {
  updated: number;
  unchanged: number;
  skipped: number;
  notFound: number;
  skippedReason?: string;
};

type BulkBody = {
  action: "assign" | "status" | "archive" | "restore";
  ids: string[];
  value?: string | null;
  /** `status`: why, for an answer that asks — a lead marked lost. */
  reason?: string;
};

function plural(count: number, noun: { one: string; many: string }) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? noun.one : noun.many}`;
}

/**
 * The sentence after a bulk action: what changed, and what did not, and why
 * (SHAPE-10). A count that quietly disagrees with the selection reads as a
 * bug; "3 skipped — they belong to someone else" reads as a rule.
 */
export function bulkMessage(result: BulkResult, noun: { one: string; many: string }, verb: string) {
  const rest = [
    result.unchanged > 0 ? `${plural(result.unchanged, noun)} already ${result.unchanged === 1 ? "was" : "were"}.` : null,
    result.skipped > 0
      ? `${result.skipped.toLocaleString("en-US")} skipped${result.skippedReason ? ` — ${result.skippedReason}` : ""}.`
      : null,
    result.notFound > 0 ? `${result.notFound.toLocaleString("en-US")} no longer exist.` : null,
  ].filter(Boolean);
  return { title: `${plural(result.updated, noun)} ${verb}`, description: rest.join(" ") || undefined };
}

function useBulk(register: RegisterHandle) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ body }: { body: BulkBody; verb: string }) =>
      fetchJson<BulkResult>(`${register.def.endpoint}/bulk`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (result, { verb }) => {
      register.selection.clear();
      queryClient.invalidateQueries({ queryKey: [...register.def.queryKey] });
      toast(bulkMessage(result, register.def.noun, verb));
    },
    onError: (error) =>
      toast({ title: "Nothing was changed", description: getApiErrorMessage(error), variant: "destructive" }),
  });
}

function AssignAction({ register }: { register: RegisterHandle }) {
  const team = useTeamMembers();
  const bulk = useBulk(register);
  const assign = (value: string | null) =>
    bulk.mutate({ body: { action: "assign", ids: register.selection.ids, value }, verb: "reassigned" });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={bulk.isPending}>
          <UserPlus className="size-4" aria-hidden="true" />
          Assign
          <ChevronDown className="size-3 text-[var(--text-subtle)]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel>Give them to</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => assign("me")}>Me</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => assign(null)}>Nobody</DropdownMenuItem>
        <DropdownMenuSeparator />
        {(team.data ?? []).map((member) => (
          <DropdownMenuItem key={member.id} onSelect={() => assign(member.id)}>
            {member.name ?? "Unnamed"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Set every selected record's status — a lead's stage. An answer the list
 * says needs a reason (Lost) asks for it first, once for the whole batch.
 */
function StatusAction({ register }: { register: RegisterHandle }) {
  const bulk = useBulk(register);
  const { def } = register;
  const options = def.statusOptions ?? [];
  const label = def.statusLabel ?? "Status";
  const [asking, setAsking] = useState<FilterOption | null>(null);

  const run = (option: FilterOption, reason?: string) =>
    bulk.mutate(
      {
        body: { action: "status", ids: register.selection.ids, value: option.value, ...(reason ? { reason } : {}) },
        verb: `set to ${option.label.toLowerCase()}`,
      },
      { onSettled: () => setAsking(null) },
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={bulk.isPending}>
            {label}
            <ChevronDown className="size-3 text-[var(--text-subtle)]" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Set {label.toLowerCase()} to</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => (def.statusNeedsReason?.includes(option.value) ? setAsking(option) : run(option))}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <LostReasonDialog
        open={Boolean(asking)}
        count={register.selection.ids.length}
        noun={def.noun}
        isPending={bulk.isPending}
        onCancel={() => setAsking(null)}
        onConfirm={(reason) => {
          if (asking) run(asking, reason);
        }}
      />
    </>
  );
}

function GroupAction({ register, entity }: { register: RegisterHandle; entity: GroupEntity }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const groups = useGroups(entity, open);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const add = useMutation({
    mutationFn: ({ groupId }: { groupId: string; name: string }) =>
      fetchJson<{ added: number; alreadyIn: number; notFound: number }>(`/api/v2/crm/lists/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({ addRecordIds: register.selection.ids }),
      }),
    onSuccess: (result, { name }) => {
      setOpen(false);
      register.selection.clear();
      queryClient.invalidateQueries({ queryKey: ["crm", "lists"] });
      queryClient.invalidateQueries({ queryKey: [...register.def.queryKey] });
      const rest = [
        result.alreadyIn > 0 ? `${result.alreadyIn} ${result.alreadyIn === 1 ? "was" : "were"} already in it.` : null,
        result.notFound > 0 ? `${result.notFound} could not be added.` : null,
      ].filter(Boolean);
      toast({
        title: `${plural(result.added, register.def.noun)} added to “${name}”`,
        description: rest.join(" ") || undefined,
      });
    },
    onError: (error) =>
      toast({ title: "Could not add to the group", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const editable = (groups.data ?? []).filter((group) => group.canEdit !== false);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5">
            <Tag className="size-4" aria-hidden="true" />
            Add to group
            <ChevronDown className="size-3 text-[var(--text-subtle)]" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            {editable.length > 7 ? <CommandInput placeholder="Find a group" /> : null}
            <CommandList>
              <CommandEmpty>{groups.isLoading ? "Loading…" : "No groups yet"}</CommandEmpty>
              {editable.length > 0 ? (
                <CommandGroup heading="Add to">
                  {editable.map((group) => (
                    <CommandItem
                      key={group.id}
                      value={`${group.name} ${group.id}`}
                      disabled={add.isPending}
                      onSelect={() => add.mutate({ groupId: group.id, name: group.name })}
                    >
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      <span className="font-mono text-sm tabular-nums text-[var(--text-subtle)]">
                        {group._count?.members ?? 0}
                      </span>
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
      <NewGroupDialog
        open={creating}
        onOpenChange={setCreating}
        entity={entity}
        recordIds={register.selection.ids}
        onCreated={() => register.selection.clear()}
      />
    </>
  );
}

function ArchiveAction({ register }: { register: RegisterHandle }) {
  const bulk = useBulk(register);
  const restoring = register.state.filters.archived === true;
  const count = register.selection.ids.length;
  const noun = count === 1 ? register.def.noun.one : register.def.noun.many;

  const run = async () => {
    const confirmed = await dsConfirm(
      restoring
        ? {
            title: `Restore ${count} ${noun}?`,
            description: "They go back into the list and its searches.",
            confirmLabel: "Restore",
          }
        : {
            title: `Archive ${count} ${noun}?`,
            description:
              "They leave the list and its searches, and stay in the Archived view with everything attached to them. You can restore them at any time.",
            confirmLabel: "Archive",
            variant: "warning",
          },
    );
    if (!confirmed) return;
    bulk.mutate({
      body: { action: restoring ? "restore" : "archive", ids: register.selection.ids },
      verb: restoring ? "restored" : "archived",
    });
  };

  const Icon = restoring ? RotateCcw : Archive;
  return (
    <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={run} disabled={bulk.isPending}>
      <Icon className="size-4" aria-hidden="true" />
      {restoring ? "Restore" : "Archive"}
    </Button>
  );
}

/** The actions a selection offers on this list, in the order the list declares them. */
export function BulkActions({ register }: { register: RegisterHandle }) {
  const { bulk, entity } = register.def;
  const restoring = register.state.filters.archived === true;
  return (
    <>
      {bulk.includes("assign") && !restoring ? <AssignAction register={register} /> : null}
      {bulk.includes("status") && !restoring ? <StatusAction register={register} /> : null}
      {bulk.includes("group") && entity && !restoring ? (
        <GroupAction register={register} entity={entity as GroupEntity} />
      ) : null}
      {bulk.includes(restoring ? "restore" : "archive") ? <ArchiveAction register={register} /> : null}
    </>
  );
}
