"use client";

/**
 * Requisitions: asking for money, and answering.
 *
 * Three queues because three different people open this page. A rep wants
 * theirs. An approver wants what is waiting on them. Whoever holds the cash
 * wants what is approved and unpaid, and what is out and unaccounted for. A
 * single list sorted by date serves none of them.
 *
 * The actions on a row are the moves that requisition can actually make,
 * taken from its status — no greyed-out buttons that exist to be refused by
 * the server. What the server refuses anyway (approving your own request) is
 * refused there too; this just does not offer it.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Stack } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

import {
  CATEGORIES,
  CATEGORY_LABELS,
  REQUISITION_STATUS_LABELS,
  UNPROJECTED,
  formatMoney,
  type Category,
  type RequisitionStatus,
} from "./money";

type Requisition = {
  id: string;
  requisitionNo: string;
  status: RequisitionStatus;
  category: Category;
  purpose: string;
  amount: string;
  approvedAmount: string | null;
  acquittedAmount: string | null;
  currency: string;
  neededBy: string | null;
  createdAt: string;
  project: { id: string; name: string } | null;
  requestedBy: { id: string; name: string | null } | null;
  approvedBy: { id: string; name: string | null } | null;
};

type ListResponse = {
  data: Requisition[];
  counts: Partial<Record<RequisitionStatus, number>>;
  permissions: { mayApprove: boolean; mayDisburse: boolean };
};

type ProjectOption = { id: string; name: string };

const QUEUES = [
  { value: "MINE", label: "Mine" },
  { value: "AWAITING_DECISION", label: "To approve" },
  { value: "APPROVED", label: "To pay" },
  { value: "OUTSTANDING", label: "Out there" },
] as const;

export function RequisitionsContent() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<string>("MINE");
  const [raising, setRaising] = useState(false);

  const queryKey = ["crm", "requisitions", queue];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchJson<ListResponse>(`/api/v2/crm/requisitions?queue=${queue}`),
  });

  const act = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      fetchJson(`/api/v2/crm/requisitions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "requisitions"] });
    },
    onError: (error) =>
      toast({ title: "That did not go through", description: getApiErrorMessage(error) }),
  });

  const permissions = data?.permissions ?? { mayApprove: false, mayDisburse: false };
  const visibleQueues = permissions.mayApprove || permissions.mayDisburse ? QUEUES : [QUEUES[0]];

  return (
    <Stack gap="md" className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {visibleQueues.length > 1 ? (
          <SegmentedControl
            ariaLabel="Which requisitions"
            value={queue}
            onValueChange={setQueue}
            options={visibleQueues.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        ) : (
          <span />
        )}
        <Button type="button" size="sm" onClick={() => setRaising(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Ask for money
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {data && data.data.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {queue === "MINE"
            ? "You have not asked for anything yet."
            : "Nothing here at the moment."}
        </p>
      ) : null}

      <ul className="divide-y divide-[var(--border-subtle)]">
        {(data?.data ?? []).map((requisition) => (
          <RequisitionRow
            key={requisition.id}
            requisition={requisition}
            isMine={requisition.requestedBy?.id === session?.user?.id}
            permissions={permissions}
            pending={act.isPending}
            onAct={(body) => act.mutate({ id: requisition.id, body })}
          />
        ))}
      </ul>

      <RaiseSheet
        open={raising}
        onOpenChange={setRaising}
        onRaised={() => {
          setRaising(false);
          queryClient.invalidateQueries({ queryKey: ["crm", "requisitions"] });
        }}
      />
    </Stack>
  );
}

function RequisitionRow({
  requisition,
  isMine,
  permissions,
  pending,
  onAct,
}: {
  requisition: Requisition;
  isMine: boolean;
  permissions: { mayApprove: boolean; mayDisburse: boolean };
  pending: boolean;
  onAct: (body: Record<string, unknown>) => void;
}) {
  const [acquitting, setAcquitting] = useState(false);
  const [spent, setSpent] = useState("");

  const payable = requisition.approvedAmount ?? requisition.amount;
  // Worth showing, not hiding: an approver who cut 400 to 250 made a decision,
  // and the requester should see both numbers rather than wondering.
  const wasCut =
    requisition.approvedAmount !== null && requisition.approvedAmount !== requisition.amount;

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-strong)]">
            {requisition.purpose}
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            {requisition.requisitionNo} · {CATEGORY_LABELS[requisition.category]}
            {requisition.project ? ` · ${requisition.project.name}` : ""}
            {isMine ? "" : ` · ${requisition.requestedBy?.name ?? "somebody"}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold text-[var(--text-strong)]">
            {formatMoney(payable, requisition.currency)}
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            {REQUISITION_STATUS_LABELS[requisition.status]}
            {wasCut ? ` · asked ${formatMoney(requisition.amount, requisition.currency)}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {isMine && requisition.status === "DRAFT" ? (
          <Button type="button" size="sm" disabled={pending} onClick={() => onAct({ action: "submit" })}>
            Send for approval
          </Button>
        ) : null}

        {/* Approving your own request is refused by the server; not offering
            it here saves somebody finding that out the hard way. */}
        {!isMine && permissions.mayApprove && requisition.status === "SUBMITTED" ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => onAct({ action: "decide", approve: true })}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onAct({ action: "decide", approve: false })}
            >
              Decline
            </Button>
          </>
        ) : null}

        {permissions.mayDisburse && requisition.status === "APPROVED" ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => onAct({ action: "disburse" })}
          >
            Mark as paid
          </Button>
        ) : null}

        {isMine && requisition.status === "DISBURSED" ? (
          acquitting ? (
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                onAct({ action: "acquit", acquittedAmount: Number(spent) });
                setAcquitting(false);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`spent-${requisition.id}`}>What it came to</Label>
                <Input
                  id={`spent-${requisition.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={spent}
                  onChange={(event) => setSpent(event.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={spent === "" || pending}>
                Account for it
              </Button>
            </form>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setAcquitting(true)}>
              Account for it
            </Button>
          )
        ) : null}

        {isMine && (requisition.status === "DRAFT" || requisition.status === "SUBMITTED") ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => onAct({ action: "cancel" })}
          >
            Withdraw
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function RaiseSheet({
  open,
  onOpenChange,
  onRaised,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRaised: () => void;
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState<Category>("FUEL");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState("");

  const projectsQuery = useQuery({
    queryKey: ["crm", "projects", "picker"],
    queryFn: () =>
      fetchJson<{ data: ProjectOption[] }>("/api/v2/crm/projects?status=ACTIVE&limit=100"),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const raise = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/requisitions", {
        method: "POST",
        body: JSON.stringify({
          category,
          amount: Number(amount),
          purpose,
          notes: notes || null,
          projectId: projectId || null,
          currency: "USD",
          submit: true,
        }),
      }),
    onSuccess: () => {
      setAmount("");
      setPurpose("");
      setNotes("");
      setProjectId("");
      onRaised();
    },
    onError: (error) =>
      toast({ title: "Could not send that", description: getApiErrorMessage(error) }),
  });

  const expectsProject = !UNPROJECTED.includes(category);
  const ready = Number(amount) > 0 && purpose.trim().length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ask for money</SheetTitle>
        </SheetHeader>

        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) raise.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="req-category">What for</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
              <SelectTrigger id="req-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {CATEGORY_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="req-amount">How much</Label>
            <Input
              id="req-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="req-purpose">In one line</Label>
            <Input
              id="req-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Diesel for the Kadoma run"
            />
          </div>

          {/* No project field on fuel or airtime. Asking would either block
              the request or invent an attribution that makes every project's
              cost figure wrong. */}
          {expectsProject ? (
            <div className="space-y-1.5">
              <Label htmlFor="req-project">Which project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="req-project">
                  <SelectValue placeholder="Not for a project" />
                </SelectTrigger>
                <SelectContent>
                  {(projectsQuery.data?.data ?? []).map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="req-notes">Anything else</Label>
            <Textarea
              id="req-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={!ready || raise.isPending}>
            {raise.isPending ? "Sending…" : "Send for approval"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
