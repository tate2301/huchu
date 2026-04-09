"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

const TENDER_TYPES = ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"] as const;

type TenderPolicyPayload = {
  data: {
    requiredReferenceTenders: string[];
    minReferenceLength: number;
    referencePattern: string;
  };
};

export default function RetailPosPolicyPage() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<TenderPolicyPayload["data"] | null>(null);
  const query = useQuery({
    queryKey: ["retail-tender-policy"],
    queryFn: () => fetchJson<TenderPolicyPayload>("/api/v2/retail/setup/tender-policy"),
  });

  const effectivePolicy = useMemo<TenderPolicyPayload["data"]>(() => {
    if (draft) return draft;
    return (
      query.data?.data ?? {
        requiredReferenceTenders: ["CARD", "MOBILE_MONEY"],
        minReferenceLength: 4,
        referencePattern: "^[A-Za-z0-9][A-Za-z0-9\\-/_ ]*$",
      }
    );
  }, [draft, query.data?.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/setup/tender-policy", {
        method: "PUT",
        body: JSON.stringify({
          requiredReferenceTenders: effectivePolicy.requiredReferenceTenders,
          minReferenceLength: Number(effectivePolicy.minReferenceLength || 4),
          referencePattern: effectivePolicy.referencePattern,
        }),
      }),
    onSuccess: () => {
      toast({ title: "POS policy saved", variant: "success" });
      setDraft(null);
    },
    onError: (error) =>
      toast({
        title: "Unable to save POS policy",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <RetailShell
      title="POS Policy"
    >
      <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <Label>Tenders requiring reference</Label>
            <div className="space-y-2">
              {TENDER_TYPES.map((tender) => {
                const checked = effectivePolicy.requiredReferenceTenders.includes(tender);
                return (
                  <label key={tender} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        setDraft((current) => {
                          const resolved = current ?? effectivePolicy;
                          return {
                            ...resolved,
                            requiredReferenceTenders: next
                              ? [...new Set([...resolved.requiredReferenceTenders, tender])]
                              : resolved.requiredReferenceTenders.filter((value) => value !== tender),
                          };
                        });
                      }}
                    />
                    <span>{tender.replaceAll("_", " ")}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Minimum reference length</Label>
              <Input
                value={String(effectivePolicy.minReferenceLength)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...(current ?? effectivePolicy),
                    minReferenceLength: Number(event.target.value || "0"),
                  }))
                }
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Reference regex</Label>
              <Input
                value={effectivePolicy.referencePattern}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...(current ?? effectivePolicy),
                    referencePattern: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={effectivePolicy.requiredReferenceTenders.length === 0 || saveMutation.isPending}
          >
            Save POS policy
          </Button>
        </div>
      </div>
    </RetailShell>
  );
}
