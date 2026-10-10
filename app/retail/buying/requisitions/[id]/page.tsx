"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import {
  FactList,
  FormField,
  HeaderAction,
  RecordHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/management/ui";
import { RetailShell } from "@/components/retail/retail-shell";
import { retailMoney } from "@/components/retail/money";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Coins, ReceiptLong } from "@/lib/icons";
import { requisitionCategoryLabel } from "@/lib/retail/requisition-words";
import { formatRetailDate, requisitionStatusLabel } from "@/lib/retail/words";

import { requisitionAmount, type RetailRequisition } from "../_components/requisition";

type Permissions = {
  isRequester: boolean;
  maySubmit: boolean;
  mayCancel: boolean;
  mayDecide: boolean;
  mayPay: boolean;
};

type Act =
  | { action: "submit" }
  | { action: "cancel"; reason?: string | null }
  | { action: "decide"; approve: boolean; approvedAmount?: number | null; decisionNote?: string | null }
  | { action: "pay" };

const WIDTH = 560;

/**
 * One requisition: what was asked for, and the one thing to do next — send
 * it, decide it, or pay it, whichever this person may. Cancelling is behind
 * the "…", because it is the rare verb.
 */
export default function RetailRequisitionPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deciding, setDeciding] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ["retail-requisitions", id],
    enabled: Boolean(id),
    queryFn: () =>
      fetchJson<{ data: RetailRequisition; permissions: Permissions }>(`/api/v2/retail/requisitions/${id}`),
  });
  const requisition = query.data?.data;
  const can = query.data?.permissions;

  const act = useMutation({
    mutationFn: (body: Act) =>
      fetchJson(`/api/v2/retail/requisitions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_result, body) => {
      const done: Record<Act["action"], string> = {
        submit: "Sent for approval",
        cancel: "Requisition cancelled",
        decide: "decide" in body && body.action === "decide" && body.approve ? "Approved" : "Declined",
        pay: "Marked as paid",
      };
      toast({ title: done[body.action], variant: "success" });
      setDeciding(false);
      void queryClient.invalidateQueries({ queryKey: ["retail-requisitions"] });
    },
    onError: (error) => {
      if (deciding) setErrors([getApiErrorMessage(error)]);
      else toast({ title: "That did not work", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const openDecision = () => {
    if (!requisition) return;
    setApprovedAmount(String(Number(requisition.amount)));
    setNote("");
    setErrors([]);
    setDeciding(true);
  };

  const decide = (approve: boolean) => {
    const amount = Number(approvedAmount);
    if (approve && !(amount > 0)) {
      setErrors(["Approve an amount above zero."]);
      return;
    }
    act.mutate({
      action: "decide",
      approve,
      approvedAmount: approve && requisition && amount !== Number(requisition.amount) ? amount : null,
      decisionNote: note.trim() || null,
    });
  };

  const confirmPay = () => {
    if (!requisition) return;
    void dsConfirm({
      title: `Pay ${retailMoney(requisitionAmount(requisition))} to ${requisition.requestedBy?.name ?? "the requester"}?`,
      description: "Pay it first; this records that the money has gone, and by whom.",
      confirmLabel: "Mark as paid",
    }).then((confirmed) => {
      if (confirmed) act.mutate({ action: "pay" });
    });
  };

  const confirmCancel = () => {
    if (!requisition) return;
    void dsConfirm({
      title: `Cancel ${requisition.requisitionNo}?`,
      description: "Nobody can approve or pay it after this.",
      confirmLabel: "Cancel the requisition",
      variant: "danger",
    }).then((confirmed) => {
      if (confirmed) act.mutate({ action: "cancel" });
    });
  };

  const action = !can ? null : can.mayDecide ? (
    <HeaderAction icon={ReceiptLong} onClick={openDecision}>
      Decide
    </HeaderAction>
  ) : can.mayPay ? (
    <HeaderAction icon={Coins} onClick={confirmPay}>
      Mark as paid
    </HeaderAction>
  ) : can.maySubmit ? (
    <HeaderAction icon={ReceiptLong} onClick={() => act.mutate({ action: "submit" })}>
      Send for approval
    </HeaderAction>
  ) : null;

  const tone = requisition?.status === "SUBMITTED" ? "warn" : requisition?.status === "REJECTED" ? "danger" : "neutral";
  const cut = requisition?.approvedAmount && Number(requisition.approvedAmount) !== Number(requisition.amount);

  return (
    <RetailShell title="Requisitions">
      {query.isPending ? (
        <div aria-busy="true" className="space-y-3" style={{ maxWidth: WIDTH }}>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : query.isError ? (
        <Alert tone="danger" title="The requisition would not load">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : !requisition ? null : (
        <div className="space-y-6" style={{ maxWidth: WIDTH }}>
          <RecordHeader
            icon={ReceiptLong}
            title={requisition.requisitionNo}
            badge={
              <StatusBadge tone={tone} context="header">
                {requisitionStatusLabel(requisition.status)}
              </StatusBadge>
            }
            action={action}
            overflow={
              can?.mayCancel ? (
                <DropdownMenuItem onSelect={confirmCancel} className="text-[var(--tone-danger-strong)]">
                  Cancel requisition
                </DropdownMenuItem>
              ) : undefined
            }
          />

          <div>
            <SectionHeading maxWidth={WIDTH} className="mt-0">
              Request
            </SectionHeading>
            <FactList
              maxWidth={WIDTH}
              items={[
                { label: "For", value: requisition.purpose },
                { label: "Kind", value: requisitionCategoryLabel(requisition.category) },
                { label: "Asked for", value: retailMoney(Number(requisition.amount)), mono: true },
                ...(cut ? [{ label: "Approved", value: retailMoney(Number(requisition.approvedAmount)), mono: true }] : []),
                { label: "Shop", value: requisition.site?.name ?? "—" },
                { label: "Asked by", value: `${requisition.requestedBy?.name ?? "—"} · ${formatRetailDate(requisition.createdAt)}` },
                ...(requisition.neededBy
                  ? [{ label: "Needed by", value: formatRetailDate(requisition.neededBy), mono: true }]
                  : []),
                ...(requisition.notes ? [{ label: "Notes", value: requisition.notes }] : []),
              ]}
            />

            {requisition.approvedBy || requisition.disbursedBy ? (
              <>
                <SectionHeading maxWidth={WIDTH}>Decision</SectionHeading>
                <FactList
                  maxWidth={WIDTH}
                  items={[
                    ...(requisition.approvedBy
                      ? [
                          {
                            label: requisition.status === "REJECTED" ? "Declined by" : "Approved by",
                            value: `${requisition.approvedBy.name ?? "—"} · ${formatRetailDate(requisition.approvedAt)}`,
                          },
                        ]
                      : []),
                    ...(requisition.decisionNote ? [{ label: "Why", value: requisition.decisionNote }] : []),
                    ...(requisition.disbursedBy
                      ? [
                          {
                            label: "Paid by",
                            value: `${requisition.disbursedBy.name ?? "—"} · ${formatRetailDate(requisition.disbursedAt)}`,
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            ) : null}
          </div>
        </div>
      )}

      <RecordDialog
        open={deciding}
        onOpenChange={setDeciding}
        title={requisition ? `Decide ${requisition.requisitionNo}` : "Decide"}
        description="Approve it, for the amount asked or less, or decline it"
        size="sm"
        errors={errors}
        onSubmit={(event) => {
          event.preventDefault();
          decide(true);
        }}
        footer={
          <>
            <Button type="button" variant="outline" disabled={act.isPending} onClick={() => decide(false)}>
              Decline
            </Button>
            <Button type="submit" disabled={act.isPending}>
              Approve
            </Button>
          </>
        }
      >
        <FormField label="Amount to approve">
          {(fieldId) => (
            <Input
              id={fieldId}
              inputMode="decimal"
              className="font-mono"
              value={approvedAmount}
              onChange={(event) => setApprovedAmount(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Note to the asker">
          {(fieldId) => <Textarea id={fieldId} rows={2} value={note} onChange={(event) => setNote(event.target.value)} />}
        </FormField>
      </RecordDialog>
    </RetailShell>
  );
}
