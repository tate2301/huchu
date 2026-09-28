"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Switch } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { CrmListRecord } from "@/lib/crm/collections-client";
import { GROUP_ENTITY_LABELS, type GroupEntity } from "@/lib/crm/groups";

/**
 * A new group: a name, who can see it, and — when it was opened from a
 * selection — the records it starts with. The record type is fixed by where
 * it was opened from, except from the sidebar, which asks.
 */
export function NewGroupDialog({
  open,
  onOpenChange,
  entity,
  recordIds,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed when opened from a list; asked for when absent. */
  entity?: GroupEntity;
  /** Records the group starts with — the rows that were ticked. */
  recordIds?: string[];
  onCreated?: (group: CrmListRecord) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const [kind, setKind] = useState<GroupEntity>(entity ?? "PERSON");
  const chosen = entity ?? kind;

  const create = useMutation({
    mutationFn: () =>
      fetchJson<CrmListRecord>("/api/v2/crm/lists", {
        method: "POST",
        body: JSON.stringify({ entity: chosen, name: name.trim(), isShared: shared, recordIds }),
      }),
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ["crm", "lists"] });
      toast({
        title: `“${group.name}” created`,
        description: recordIds?.length
          ? `${recordIds.length} ${recordIds.length === 1 ? "record" : "records"} added.`
          : undefined,
      });
      setName("");
      onOpenChange(false);
      onCreated?.(group);
    },
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New group"
      description="A group is records somebody put together by hand, like a campaign or a shortlist."
      size="sm"
      errors={create.error ? [getApiErrorMessage(create.error)] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) create.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create group"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="group-name">Name</Label>
        <Input
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Harare roofing campaign"
          maxLength={80}
          autoFocus
        />
      </div>

      {entity ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="group-kind">Holds</Label>
          <select
            id="group-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as GroupEntity)}
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
          >
            {Object.entries(GROUP_ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm">
          Shared with the team
          <span className="block text-sm text-[var(--text-muted)]">Off: only you see it.</span>
        </span>
        <Switch checked={shared} onChange={() => setShared((value) => !value)} aria-label="Shared with the team" />
      </label>
    </RecordDialog>
  );
}
