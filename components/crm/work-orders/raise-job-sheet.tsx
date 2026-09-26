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

type ProjectsResponse = { data: { id: string; projectNo: string; name: string }[] };

/**
 * "No quote behind this one."
 *
 * A value rather than an empty string because Radix refuses `value=""` on an
 * item, and a placeholder nobody can select is not an option.
 */
const NO_CHECKLIST = "none";

/** Book it for tomorrow morning, which is when a job realistically starts. */
function defaultStart(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  const offset = tomorrow.getTimezoneOffset() * 60_000;
  return new Date(tomorrow.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Raise a job, against the deal it delivers.
 *
 * Every job belongs to a deal: the deal is what it is invoiced against when
 * the work is signed off, and a job with nothing behind it could never be
 * billed. Opened from a deal or a project, the deal is known. Opened from a
 * company or a site, it is one of that customer's deals. Opened from the
 * register, it is asked for first.
 *
 * The project is never a second question. A deal has at most one project and
 * its jobs belong in it, so the server puts the job there, and the dialog says
 * where it is going once the deal is chosen.
 *
 * The checklist comes from the quote rather than being retyped, which is where
 * transcription errors come from — a crew installing four panels because
 * somebody typed 4 instead of 14 is a whole second visit.
 */
export function RaiseJobSheet({
  open,
  onOpenChange,
  dealId,
  clientId,
  siteId,
  project,
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
  /** The project the job goes into, when the opener already knows it. */
  project?: { id: string; label: string } | null;
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
   * The deals this customer has, for a job raised from their company or site.
   * Asked for the customer's own deals rather than searched across the
   * tenant, because the answer is nearly always one of two or three.
   */
  const scope = clientId ? `clientIds=${clientId}` : siteId ? `siteIds=${siteId}` : null;
  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ["crm", "deals", "for-job", scope],
    queryFn: () => fetchJson<DealsResponse>(`/api/v2/crm/deals?${scope}&limit=50`),
    enabled: open && Boolean(scope) && !dealId && !project,
    staleTime: 60_000,
  });
  const billable = deals?.data ?? [];
  const asksCustomerDeal = Boolean(scope) && !dealId && !project;
  const noCustomerDeal = asksCustomerDeal && !dealsLoading && billable.length === 0;

  // The deal the job delivers: given by the page, or chosen here. A project
  // given by the page names its own deal on the server.
  const chosenDealId = dealId ?? (project ? null : (recordRefFor(subject).dealId ?? (billTo || null)));

  /** Where a job for the chosen deal goes: the deal's project, if it has one. */
  const { data: dealProjects } = useQuery({
    queryKey: ["crm", "projects", "of-deal", chosenDealId],
    queryFn: () =>
      fetchJson<ProjectsResponse>(`/api/v2/crm/projects?dealId=${chosenDealId}&costs=false&limit=1`),
    enabled: open && Boolean(chosenDealId) && !project,
    staleTime: 60_000,
  });
  const destination = project
    ? project.label
    : dealProjects?.data[0]
      ? `${dealProjects.data[0].projectNo} — ${dealProjects.data[0].name}`
      : null;

  const create = useMutation({
    mutationFn: () => {
      return fetchJson<{ id: string; projectId: string | null }>("/api/v2/crm/work-orders", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          dealId: chosenDealId,
          clientId: clientId ?? null,
          siteId: siteId ?? null,
          projectId: project?.id ?? null,
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
      if (chosenDealId) queryClient.invalidateQueries({ queryKey: ["crm", "deal", chosenDealId] });
      if (job.projectId) queryClient.invalidateQueries({ queryKey: ["crm", "project", job.projectId] });
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
        const problems: string[] = [];
        if (!project && !chosenDealId) problems.push("Choose the deal this job delivers");
        if (!title.trim()) problems.push("Give the job a title the crew will recognise");
        setErrors(problems);
        if (problems.length === 0) create.mutate();
      }}
      footer={<>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || noCustomerDeal}>
          {create.isPending ? "Raising…" : "Raise job"}
        </Button>
      </>}
    >
      {/* The deal first: it is what the job is for. */}
      {dealId || project ? null : asksCustomerDeal ? (
        <div className="space-y-1.5">
          <Label htmlFor="job-deal">Deal</Label>
          {noCustomerDeal ? (
            <p id="job-deal" className="text-sm text-[var(--text-muted)]">
              This customer has no deal yet. A job delivers a deal, so add the deal first.
            </p>
          ) : (
            <Select value={billTo} onValueChange={setBillTo}>
              <SelectTrigger id="job-deal">
                <SelectValue placeholder={dealsLoading ? "Loading deals…" : "Choose a deal"} />
              </SelectTrigger>
              <SelectContent>
                {billable.map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>
                    {deal.dealNo ? `${deal.dealNo} — ${deal.title}` : deal.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="job-subject">Deal</Label>
          <RecordPicker
            id="job-subject"
            value={subject}
            onChange={setSubject}
            types={["DEAL"]}
            placeholder="Search deals"
          />
        </div>
      )}

      {destination ? (
        <div className="space-y-1.5">
          <Label>Project</Label>
          <p className="text-sm font-medium text-[var(--text-strong)]">{destination}</p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="job-title">Title *</Label>
        <Input
          id="job-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Install 14 panels — Msasa depot"
        />
      </div>

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
