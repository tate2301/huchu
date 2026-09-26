"use client";

/**
 * One lead reminder — a follow-up raised from a lead before follow-ups became
 * tasks — on a page of its own.
 *
 * It has four facts and one move: when, who, about what, what was written,
 * and done. The record it is about is its first property, since "who was I
 * meant to call?" is why it gets opened.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Skeleton } from "@corelithzw/react";
import { SectionHeading } from "@/components/management/ui";
import { formatDate } from "@/components/crm/money/money";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordPageShell, RecordRelated } from "@/components/records/record-page-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Calendar, CalendarCheck, Funnel, Tag, User } from "@/lib/icons";

type FollowUp = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  completedAt: string | null;
  assignedTo: { id: string; name: string | null };
  createdBy: { id: string; name: string | null } | null;
  lead: { id: string; leadNo: string; title: string | null } | null;
  deal: { id: string; dealNo: string; title: string } | null;
  client: { id: string; name: string } | null;
  appointment: { id: string; appointmentNo: string; title: string; scheduledStart: string } | null;
};

const STATUS_LABELS: Record<FollowUp["status"], string> = {
  PENDING: "Open",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",
};

export function FollowUpRecordContent({ followUpId }: { followUpId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Read once: "late" is a judgement made when the page was opened.
  const [now] = useState(() => Date.now());
  const queryKey = ["crm-followups-legacy", "record", followUpId];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchJson<{ followUp: FollowUp; mayEdit: boolean }>(`/api/v2/crm/follow-ups/${followUpId}`),
  });

  const move = useMutation({
    mutationFn: (status: FollowUp["status"]) =>
      fetchJson(`/api/v2/crm/follow-ups/${followUpId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, status) => {
      toast({ title: status === "COMPLETED" ? "Follow-up done" : status === "CANCELLED" ? "Follow-up cancelled" : "Follow-up reopened" });
      queryClient.invalidateQueries({ queryKey: ["crm-followups-legacy"] });
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title="Follow-up not found">
        {query.error ? getApiErrorMessage(query.error) : "It may have been removed."}
      </Alert>
    );
  }

  const { followUp, mayEdit } = query.data;
  const open = followUp.status === "PENDING";
  const late = open && new Date(followUp.dueAt).getTime() < now;
  const about = followUp.deal
    ? { href: `/crm/deals/${followUp.deal.id}`, label: followUp.deal.title, kind: "Deal" }
    : followUp.lead
      ? { href: `/crm/leads/${followUp.lead.id}`, label: followUp.lead.title ?? followUp.lead.leadNo, kind: "Lead" }
      : followUp.client
        ? { href: `/crm/companies/${followUp.client.id}`, label: followUp.client.name, kind: "Company" }
        : null;

  const attributes: RecordAttribute[] = [
    ...(about
      ? [{ id: "about", label: about.kind, icon: Funnel, display: <EntityLink href={about.href}>{about.label}</EntityLink> }]
      : []),
    { id: "status", label: "Status", icon: Tag, value: STATUS_LABELS[followUp.status] },
    {
      id: "due",
      label: "Due",
      icon: Calendar,
      tone: late ? "alert" : "code",
      value: formatDate(followUp.dueAt),
    },
    { id: "owner", label: "Assigned to", icon: User, value: followUp.assignedTo.name ?? "Unnamed" },
    ...(followUp.appointment
      ? [
          {
            id: "visit",
            label: "After the visit",
            icon: CalendarCheck,
            display: (
              <EntityLink href={`/crm/appointments/${followUp.appointment.id}`}>
                {followUp.appointment.title}
              </EntityLink>
            ),
          },
        ]
      : []),
    ...(followUp.completedAt
      ? [{ id: "done", label: "Done", icon: CalendarCheck, tone: "code" as const, value: formatDate(followUp.completedAt) }]
      : []),
    { id: "raised-by", label: "Raised by", icon: User, value: followUp.createdBy?.name ?? null, placeholder: "Not recorded" },
  ];

  return (
    <RecordPageShell
      icon={CalendarCheck}
      backHref="/crm/follow-ups"
      backLabel="Follow-ups"
      title={followUp.title}
      subtitle="Lead reminder"
      status={
        followUp.status === "CANCELLED"
          ? { status: "inactive", label: "Cancelled" }
          : late
            ? { status: "failing", label: "Overdue" }
            : null
      }
      bandValue={`Due ${formatDate(followUp.dueAt)}`}
      primaryAction={
        mayEdit && followUp.status !== "CANCELLED" ? (
          <Button
            variant={open ? "primary" : "secondary"}
            disabled={move.isPending}
            onClick={() => move.mutate(open ? "COMPLETED" : "PENDING")}
          >
            {open ? "Done" : "Reopen"}
          </Button>
        ) : null
      }
      actions={
        mayEdit && open
          ? [{ label: "Cancel it", destructive: true, onSelect: () => move.mutate("CANCELLED") }]
          : undefined
      }
      related={<RecordRelated items={about ? [{ href: about.href, label: about.label }] : []} />}
      attributes={<RecordAttributes attributes={attributes} />}
      activeTab="notes"
      onTabChange={() => undefined}
      tabs={[
        {
          value: "notes",
          label: "Notes",
          icon: CalendarCheck,
          content: (
            <section aria-labelledby="follow-up-notes" style={{ maxWidth: 760 }}>
              <SectionHeading maxWidth={760} className="mt-0">
                <span id="follow-up-notes">Notes</span>
              </SectionHeading>
              <p className="whitespace-pre-line text-sm text-[var(--text-strong)]">
                {followUp.notes ?? <span className="text-[var(--text-muted)]">Nothing written down.</span>}
              </p>
            </section>
          ),
        },
      ]}
    />
  );
}
