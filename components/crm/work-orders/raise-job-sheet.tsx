"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import {
  RecordPicker,
  recordRefFor,
  type PickedRecord,
} from "@/components/crm/records/record-picker";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { jobHref } from "./job-types";

type TeamResponse = { data: { id: string; name: string | null; email: string }[] };

type DealsResponse = { data: { id: string; dealNo: string | null; title: string }[] };

/**
 * "No quote behind this one."
 *
 * A value rather than an empty string because Radix refuses `value=""` on an
 * item, and a placeholder nobody can select is not an option.
 */
const NO_CHECKLIST = "none";

/** The same trick for "this job bills against nothing yet". */
const NO_DEAL = "none";

/** Book it for tomorrow morning, which is when a job realistically starts. */
function defaultStart(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  const offset = tomorrow.getTimezoneOffset() * 60_000;
  return new Date(tomorrow.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Raise the job that delivers a won deal.
 *
 * The checklist comes from the quote rather than being retyped, which is where
 * transcription errors come from — a crew installing four panels because
 * somebody typed 4 instead of 14 is a whole second visit.
 *
 * Opened from a deal it already knows what the job is for. Opened from the
 * jobs register it does not, and asks: a deal is the honest answer, because a
 * job with nothing to bill against cannot be invoiced later, but a site or a
 * company is accepted too — a callout that turns up in the day's work with no
 * paperwork behind it is a real thing that happens, and refusing to record it
 * is how it ends up on a WhatsApp thread instead.
 */
export function RaiseJobSheet({
  open,
  onOpenChange,
  dealId,
  clientId,
  siteId,
  defaultTitle,
  quotationDocuments = [],
  currentUserId,
  onRaised,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Left off where the job is being raised from the register rather than a deal. */
  dealId?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  defaultTitle?: string;
  /** Accepted quotes whose lines can seed the checklist. */
  quotationDocuments?: { id: string; label: string }[];
  currentUserId?: string;
  /**
   * Where the raiser wants the user put afterwards. A record page opens its
   * own Jobs section; without one there is nowhere on this page that shows the
   * job, so the sheet falls back to the job's own record.
   */
  onRaised?: (jobId: string) => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState(defaultTitle ?? "");
  const [subject, setSubject] = useState<PickedRecord | null>(null);
  const [documentId, setDocumentId] = useState("");
  const [billTo, setBillTo] = useState("");
  const [scheduledStart, setScheduledStart] = useState(defaultStart);
  const [assignedToId, setAssignedToId] = useState(currentUserId ?? "");
  const [addressLine, setAddressLine] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  /** The record is fixed when a page handed one over, and asked for otherwise. */
  const given = Boolean(dealId || clientId || siteId);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(defaultTitle ?? "");
      setSubject(null);
      setDocumentId("");
      setBillTo("");
      setScheduledStart(defaultStart());
      setAssignedToId(currentUserId ?? "");
      setAddressLine("");
      setAccessNotes("");
      setErrors([]);
    }
  }

  const { data: team } = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<TeamResponse>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  /**
   * The deals this customer has, for a job that is being raised against them
   * rather than against one of those deals.
   *
   * Without this a job raised from a company or a site could never be
   * invoiced: the invoice route bills against a deal, the record page's Deal
   * row was read-only, and there was no way to name one at any point. Asked
   * for the customer's own deals rather than searched across the tenant,
   * because the answer is nearly always one of two or three.
   */
  const scope = clientId ? `clientIds=${clientId}` : siteId ? `siteIds=${siteId}` : null;
  const { data: deals } = useQuery({
    queryKey: ["crm", "deals", "for-job", scope],
    queryFn: () => fetchJson<DealsResponse>(`/api/v2/crm/deals?${scope}&limit=50`),
    enabled: open && Boolean(scope) && !dealId,
    staleTime: 60_000,
  });
  const billable = deals?.data ?? [];

  const create = useMutation({
    mutationFn: () => {
      const picked = recordRefFor(subject);
      return fetchJson<{ id: string }>("/api/v2/crm/work-orders", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          dealId: dealId ?? picked.dealId ?? (billTo || null),
          clientId: clientId ?? picked.clientId ?? null,
          siteId: siteId ?? picked.siteId ?? null,
          documentId: documentId && documentId !== NO_CHECKLIST ? documentId : null,
          scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
          assignedToId: assignedToId || null,
          addressLine: addressLine.trim() || null,
          accessNotes: accessNotes.trim() || null,
        }),
      });
    },
    onSuccess: (job) => {
      toast({ title: "Job raised", description: "It's on the crew's list." });
      queryClient.invalidateQueries({ queryKey: ["crm", "jobs"] });
      if (dealId) queryClient.invalidateQueries({ queryKey: ["crm", "deal", dealId] });
      onOpenChange(false);
      // A dialog that closes onto a page looking exactly as it did before is
      // the shape of "nothing happened". A record page says where to go — its
      // Jobs section, which the new job is now in. Nothing else has such a
      // place, so those land on the job's own record instead.
      if (onRaised) onRaised(job.id);
      else if (job?.id) router.push(jobHref(job.id));
    },
    onError: (err) => setErrors([getApiErrorMessage(err)]),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Raise a job"
      description="The checklist comes straight off the quote, so nothing is retyped."
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) {
          setErrors(["Give the job a title the crew will recognise"]);
          return;
        }
        setErrors([]);
        create.mutate();
      }}
      footer={<>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Raising…" : "Raise job"}
        </Button>
      </>}
    >
      <div className="space-y-1.5">
        <Label htmlFor="job-title">Title *</Label>
        <Input
          id="job-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Install 14 panels — Msasa depot"
        />
      </div>

      {given ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="job-subject">What is it for</Label>
          <RecordPicker
            id="job-subject"
            value={subject}
            onChange={setSubject}
            types={["DEAL", "COMPANY", "SITE"]}
            placeholder="Search deals, companies and sites"
          />
          <p className="text-sm text-[var(--text-muted)]">
            A deal is what lets this be invoiced when it is done.
          </p>
        </div>
      )}

      {/* Raised from a company or a site, so nothing has said what it bills
          against. A job with no deal behind it cannot be invoiced when it is
          done — it can be attached later on the job's own record, but the
          moment somebody is already looking at this customer is the cheapest
          moment to ask. Left blank on purpose is a real answer: a callout with
          no paperwork behind it is a real thing that happens. */}
      {given && !dealId && billable.length > 0 ? (
        <div className="space-y-1.5">
          <Label>Bill it against</Label>
          <Select value={billTo || NO_DEAL} onValueChange={(next) => setBillTo(next === NO_DEAL ? "" : next)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DEAL}>Nothing yet</SelectItem>
              {billable.map((deal) => (
                <SelectItem key={deal.id} value={deal.id}>
                  {deal.dealNo ? `${deal.dealNo} — ${deal.title}` : deal.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-[var(--text-muted)]">
            This is what the invoice is raised against once the job is signed off.
          </p>
        </div>
      ) : null}

      {quotationDocuments.length ? (
        <div className="space-y-1.5">
          <Label>Checklist from</Label>
          {/* Nothing is chosen by default, and "No checklist" is a real item
              rather than an unreachable placeholder. Defaulting to the first
              quote meant a job could be seeded from a superseded one's
              quantities without anybody having picked it — and the crew
              installs what the checklist says. */}
          <Select value={documentId || NO_CHECKLIST} onValueChange={setDocumentId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CHECKLIST}>No checklist — I&apos;ll add the lines</SelectItem>
              {quotationDocuments.map((document) => (
                <SelectItem key={document.id} value={document.id}>
                  {document.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          No quote to lift a checklist from, so the job starts empty and the crew works to
          the brief.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="job-start">Starts</Label>
          <Input
            id="job-start"
            type="datetime-local"
            value={scheduledStart}
            onChange={(event) => setScheduledStart(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Crew lead</Label>
          <Select value={assignedToId} onValueChange={setAssignedToId}>
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {(team?.data ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name ?? user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="job-address">Address</Label>
        <Input
          id="job-address"
          value={addressLine}
          onChange={(event) => setAddressLine(event.target.value)}
          placeholder="Leave blank to use the site's"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="job-access">Getting in</Label>
        <Textarea
          id="job-access"
          rows={2}
          value={accessNotes}
          onChange={(event) => setAccessNotes(event.target.value)}
          placeholder="Ask for the security office, gate code 4471…"
        />
      </div>
    </RecordDialog>
  );
}
