"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { FormField, FormPage, SectionHeading, StatusBadge } from "@/components/management/ui";
import { FactRowsSkeleton, LoadFailure } from "@/components/preferences/organization/form-parts";
import { SHOP_SETUP_KEY, ShopSettingsShell } from "@/components/retail/shop-settings";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { RetailPosPolicy } from "@/lib/retail/pos-policy";
import { tenderLabel } from "@/lib/retail/words";

type PolicyResponse = { data: RetailPosPolicy; defaults: RetailPosPolicy; saved: boolean };

const TENDERS = ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"] as const;
const POLICY_KEY = ["retail-pos-policy"] as const;

function Rule({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 border-b border-[#EEF0F4] text-[13px] text-[#16181D]">
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      {children}
    </label>
  );
}

/**
 * Till rules — what every till asks before it takes money back or out.
 *
 * Settings → Shop. It was "POS policy": three tiles, a bar chart and a donut
 * of its own checkboxes, a second chart of which tenders need a reference, and
 * the form in a side column under "Edit the policy — Applies to every till in
 * the shop." Every rule is named for what it makes the till do, so the four
 * sentences that explained the checkboxes are gone with them.
 */
export default function RetailTillRulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RetailPosPolicy | null>(null);

  const query = useQuery({
    queryKey: POLICY_KEY,
    queryFn: () => fetchJson<PolicyResponse>("/api/v2/retail/setup/pos-policy"),
  });
  const policy = draft ?? query.data?.data ?? query.data?.defaults ?? null;

  const save = useMutation({
    mutationFn: (next: RetailPosPolicy) =>
      fetchJson("/api/v2/retail/setup/pos-policy", {
        method: "PUT",
        body: JSON.stringify({ ...next, minReferenceLength: Number(next.minReferenceLength || 4) }),
      }),
    onSuccess: async () => {
      toast({ title: "Till rules saved", variant: "success" });
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: POLICY_KEY });
      await queryClient.invalidateQueries({ queryKey: SHOP_SETUP_KEY });
    },
    onError: (error) =>
      toast({
        title: "The till rules were not saved",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const change = (patch: Partial<RetailPosPolicy>) =>
    setDraft((current) => ({ ...(current ?? policy ?? ({} as RetailPosPolicy)), ...patch }));

  return (
    <ShopSettingsShell>
      <FormPage
        title="Till rules"
        badge={
          query.data && !query.data.saved ? (
            <StatusBadge tone="warn">Not saved yet</StatusBadge>
          ) : null
        }
        onSubmit={(event) => {
          event.preventDefault();
          if (policy) save.mutate(policy);
        }}
        submitLabel="Save till rules"
        busy={save.isPending || !policy}
        onCancel={draft ? () => setDraft(null) : undefined}
        cancelLabel="Undo changes"
      >
        {query.isLoading ? (
          <FactRowsSkeleton rows={5} />
        ) : !policy ? (
          <LoadFailure
            message={`The till rules would not load. ${getApiErrorMessage(query.error)}`}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <SectionHeading variant="form">Tenders that need a reference</SectionHeading>
            {TENDERS.map((tender) => (
              <Rule
                key={tender}
                checked={policy.requiredReferenceTenders.includes(tender)}
                onChange={(on) =>
                  change({
                    requiredReferenceTenders: on
                      ? [...policy.requiredReferenceTenders, tender]
                      : policy.requiredReferenceTenders.filter((entry) => entry !== tender),
                  })
                }
              >
                {tenderLabel(tender)}
              </Rule>
            ))}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <FormField label="Shortest reference">
                {(id) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    className="font-mono"
                    value={String(policy.minReferenceLength ?? "")}
                    onChange={(event) =>
                      change({ minReferenceLength: Number(event.target.value.replace(/\D/g, "")) || 0 })
                    }
                  />
                )}
              </FormField>
              <FormField label="Reference pattern">
                {(id) => (
                  <Input
                    id={id}
                    className="font-mono"
                    value={policy.referencePattern}
                    onChange={(event) => change({ referencePattern: event.target.value })}
                  />
                )}
              </FormField>
            </div>

            <SectionHeading variant="form">Refunds and voids</SectionHeading>
            <Rule
              checked={policy.refundRequiresReason}
              onChange={(on) => change({ refundRequiresReason: on })}
            >
              A refund needs a reason
            </Rule>
            <Rule
              checked={policy.requireSupervisorForRefunds}
              onChange={(on) => change({ requireSupervisorForRefunds: on })}
            >
              A refund needs a manager
            </Rule>
            <Rule
              checked={policy.voidRequiresReason}
              onChange={(on) => change({ voidRequiresReason: on })}
            >
              A void needs a reason
            </Rule>

            <SectionHeading variant="form">Paying</SectionHeading>
            <Rule
              checked={policy.splitTenderEnabled}
              onChange={(on) => change({ splitTenderEnabled: on })}
            >
              One sale can be paid with more than one tender
            </Rule>
          </>
        )}
      </FormPage>
    </ShopSettingsShell>
  );
}
