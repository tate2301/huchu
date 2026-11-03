"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
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

import { EntityLink } from "@/components/records/entity-link";
import { RecordPicker, type PickedRecord } from "./record-picker";

const ROLES = [
  { value: "PRIMARY", label: "Primary contact" },
  { value: "DECISION_MAKER", label: "Decision maker" },
  { value: "FINANCE", label: "Finance" },
  { value: "SITE", label: "Site contact" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "INFLUENCER", label: "Influencer" },
  { value: "REFERRER", label: "Referrer" },
] as const;

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLES.map((role) => [role.value, role.label]),
);

export type DealContact = {
  id: string;
  role: string;
  person: { id: string; fullName: string; jobTitle?: string | null; phone?: string | null };
};

/**
 * The people on a deal — and the way to change who they are.
 *
 * This list was read-only, which meant the only chance to say who was
 * involved was the moment the deal was created. Deals gain a decision maker
 * in week three and lose a site contact when somebody leaves; that is the
 * normal shape of the work, not an exception worth a trip to an admin screen.
 */
export function DealContactsTab({
  dealId,
  contacts,
}: {
  dealId: string;
  contacts: DealContact[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [picked, setPicked] = useState<PickedRecord | null>(null);
  const [role, setRole] = useState<string>("PRIMARY");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["crm", "deal", dealId] });

  const add = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/crm/deals/${dealId}/contacts`, {
        method: "POST",
        body: JSON.stringify({ personId: picked?.id, role }),
      }),
    onSuccess: () => {
      setPicked(null);
      setRole("PRIMARY");
      refresh();
      toast({ title: "Added to this deal" });
    },
    onError: (error) =>
      toast({
        title: "Could not add that person",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const remove = useMutation({
    mutationFn: (contactId: string) =>
      fetchJson(`/api/v2/crm/deals/${dealId}/contacts?contactId=${contactId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      refresh();
      toast({ title: "Removed from this deal" });
    },
    onError: (error) =>
      toast({
        title: "Could not remove that person",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 max-w-md flex-1">
          <RecordPicker
            value={picked}
            onChange={setPicked}
            types={["PERSON"]}
            placeholder="Search people to add"
          />
        </div>

        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-2"
          disabled={!picked || add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      <div className="bk-bleed">
        <table className="table" aria-label="People on this deal">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Phone</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>
                  <EntityLink
                    href={`/crm/people/${contact.person.id}`}
                    className="ref font-medium hover:underline"
                  >
                    {contact.person.fullName}
                  </EntityLink>
                </td>
                <td className="muted">{ROLE_LABEL[contact.role] ?? contact.role}</td>
                <td className="muted font-mono">{contact.person.phone ?? "—"}</td>
                <td className="num">
                  <IconButton
                    size="sm"
                    aria-label={`Remove ${contact.person.fullName} from this deal`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(contact.id)}
                  >
                    <Trash2 />
                  </IconButton>
                </td>
              </tr>
            ))}
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted py-4 text-center">
                  Nobody is attached to this deal yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
