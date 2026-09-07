"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import {
  RecordPicker,
  type PickedRecord,
} from "../records/record-picker";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

import type { LeadFilterOwner } from "../leads/leads-filters";

function defaultStart(): string {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const offset = start.getTimezoneOffset() * 60_000;
  return new Date(start.getTime() - offset).toISOString().slice(0, 16);
}

function addHours(local: string, hours: number): string {
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(date.getHours() + hours);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * What the visit is about. Every field is optional and any combination is
 * allowed — a visit can be booked against a lead, a deal, a company, a site,
 * or nothing at all when somebody just needs to go and look.
 *
 * This replaced a single required `leadId`, which the deal page satisfied by
 * passing its deal id. That is a valid uuid, so it sailed through validation
 * and died on a foreign key: every visit booked from a deal failed.
 */
export type VisitSubject = {
  leadId?: string | null;
  dealId?: string | null;
  clientId?: string | null;
  siteId?: string | null;
};

export function VisitScheduleSheet({
  open,
  onOpenChange,
  subject,
  defaultLocation,
  owners,
  currentUserId,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: VisitSubject;
  defaultLocation?: string | null;
  owners: LeadFilterOwner[];
  currentUserId?: string;
  onScheduled?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("Site visit");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [assignedToId, setAssignedToId] = useState(currentUserId ?? "");
  const [notes, setNotes] = useState("");
  // Only asked for when the sheet was not opened from a record. A van going
  // somewhere the office cannot tie to a deal is a cost with no reason.
  const [about, setAbout] = useState<PickedRecord | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const initialStart = defaultStart();
    setTitle("Site visit");
    setStart(initialStart);
    setEnd(addHours(initialStart, 2));
    setLocation(defaultLocation ?? "");
    setAssignedToId(currentUserId ?? "");
    setNotes("");
    setAbout(null);
    setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const book = useMutation({
    mutationFn: () =>
      fetchJson<{ data: { id: string } }>("/api/v2/crm/appointments", {
        method: "POST",
        body: JSON.stringify({
          leadId: subject.leadId ?? (about?.type === "LEAD" ? about.id : undefined),
          dealId: subject.dealId ?? (about?.type === "DEAL" ? about.id : undefined),
          clientId: subject.clientId ?? (about?.type === "COMPANY" ? about.id : undefined),
          siteId: subject.siteId ?? (about?.type === "SITE" ? about.id : undefined),
          title: title.trim() || "Site visit",
          scheduledStart: new Date(start).toISOString(),
          scheduledEnd: end ? new Date(end).toISOString() : undefined,
          location: location.trim() || undefined,
          assignedToId: assignedToId || undefined,
          outcomeNotes: notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      if (subject.leadId) {
        queryClient.invalidateQueries({ queryKey: ["crm-lead", subject.leadId] });
      }
      if (subject.dealId) {
        queryClient.invalidateQueries({ queryKey: ["crm-deal", subject.dealId] });
      }
      queryClient.invalidateQueries({ queryKey: ["crm", "appointments"] });
      toast({ title: "Site visit scheduled" });
      onScheduled?.();
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const hasSubject = Boolean(
    subject.leadId || subject.dealId || subject.clientId || subject.siteId,
  );

  const validate = (): string[] => {
    const found: string[] = [];
    if (!start) found.push("Pick when the visit starts.");
    if (end && new Date(end) <= new Date(start)) found.push("The visit has to end after it starts.");
    if (!assignedToId) found.push("Someone has to be going — assign the visit.");
    if (!hasSubject && !about) {
      found.push("Say what the visit is for — a deal, a lead, a company or a site.");
    }
    return found;
  };

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule a site visit"
      description="The visit is where the job gets specified — measurements taken here become the quotation."
      size="md"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        const found = validate();
        setErrors(found);
        if (found.length === 0) book.mutate();
      }}
      footer={<>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={book.isPending}>
          {book.isPending ? "Scheduling…" : "Schedule visit"}
        </Button>
      </>}
    >
      {hasSubject ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="visit-about">What is the visit for?</Label>
          <RecordPicker
            id="visit-about"
            value={about}
            onChange={setAbout}
            types={["DEAL", "LEAD", "COMPANY", "SITE"]}
            placeholder="Search deals, leads, companies…"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="visit-title">Title</Label>
        <Input
          id="visit-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="visit-start">Starts *</Label>
          <Input
            id="visit-start"
            type="datetime-local"
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              if (event.target.value) setEnd(addHours(event.target.value, 2));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visit-end">Ends</Label>
          <Input
            id="visit-end"
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="visit-location">Location</Label>
        <Input
          id="visit-location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Street address, or where to meet on site"
          maxLength={300}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="visit-assignee">Assigned to *</Label>
        <Select value={assignedToId} onValueChange={setAssignedToId}>
          <SelectTrigger id="visit-assignee">
            <SelectValue placeholder="Who's going?" />
          </SelectTrigger>
          <SelectContent>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name ?? "Unnamed"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="visit-notes">Notes</Label>
        <Textarea
          id="visit-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Access arrangements, who to ask for, what to bring."
        />
      </div>
    </RecordDialog>
  );
}
