"use client";

import * as React from "react";
import { Radio, RadioGroup, Switch } from "@corelithzw/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { FormField, SectionHeading } from "@/components/management/ui";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useHasFeature } from "@/hooks/use-entitlement";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  BUSINESS_TYPE_LABELS,
  RETAIL_BUSINESS_TYPES,
  type ShopFeatures,
  type ShopProfile,
  type ShopProfileInput,
} from "@/lib/retail/shop-profile-rules";

export const SHOP_PROFILE_KEY = ["retail-shop-profile"] as const;

type ShopProfileResponse = {
  data: ShopProfile;
  features: ShopFeatures;
  defaults: ShopProfile;
  canChange: boolean;
};

/** The shop's profile, for any screen that changes with the shop type. */
export function useShopProfile(enabled = true) {
  return useQuery({
    queryKey: SHOP_PROFILE_KEY,
    queryFn: () => fetchJson<ShopProfileResponse>("/api/v2/retail/shop-profile"),
    enabled,
  });
}

function toInput(profile: ShopProfile): ShopProfileInput {
  return {
    businessType: profile.businessType,
    ageCheck: profile.ageCheck,
    licenceHours: profile.licenceHours,
    emptiesAndDeposits: profile.emptiesAndDeposits,
    casesAndSingles: profile.casesAndSingles,
    weekdayOpensAt: profile.weekdayOpensAt,
    weekdayClosesAt: profile.weekdayClosesAt,
    sundayOpensAt: profile.sundayOpensAt,
    sundayClosesAt: profile.sundayClosesAt,
    licenceNumber: profile.licenceNumber,
    licenceExpiresOn: profile.licenceExpiresOn,
  };
}

/**
 * The Shop section of Settings › General, for a retail workspace.
 *
 * It owns its draft and its save; the page decides where the footer goes.
 * `form` is null outside retail, which the page reads as "draw nothing and
 * stay read-only", exactly as General was before.
 */
export function useShopProfileForm() {
  const retail = useHasFeature("retail.core");
  const query = useShopProfile(retail);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<ShopProfileInput | null>(null);

  const saved = query.data ? toInput(query.data.data) : null;
  const value = draft ?? saved;

  const save = useMutation({
    mutationFn: (input: ShopProfileInput) =>
      fetchJson<ShopProfileResponse>("/api/v2/retail/shop-profile", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      toast({ title: "Shop saved", variant: "success" });
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: SHOP_PROFILE_KEY });
    },
    onError: (error) =>
      toast({
        title: "The shop was not saved",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  if (!retail) return null;

  return {
    query,
    value,
    dirty: draft !== null,
    canChange: query.data?.canChange ?? false,
    busy: save.isPending,
    change: (patch: Partial<ShopProfileInput>) =>
      setDraft((current) => ({ ...(current ?? (saved as ShopProfileInput)), ...patch })),
    reset: () => setDraft(null),
    submit: () => {
      if (value) save.mutate(value);
    },
  };
}

export type ShopProfileForm = NonNullable<ReturnType<typeof useShopProfileForm>>;

function SwitchRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-4 border-b border-[var(--border)] text-[length:var(--text-sm)] text-[var(--text-strong)]">
      <span>{label}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        aria-label={label}
      />
    </label>
  );
}

function HourField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <FormField label={label}>
      {(id) => (
        <Input
          id={id}
          type="time"
          step={60}
          className="font-mono"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FormField>
  );
}

/**
 * The fields. What kind of shop it is, and — for a liquor store — each feature
 * the till honours, the licence and its hours.
 *
 * A manager reads the same section with every control disabled: the business
 * type decides whether the till checks ID, which is the licence holder's call.
 */
export function ShopProfileFields({ form }: { form: ShopProfileForm }) {
  const value = form.value;
  if (!value) return null;
  const locked = !form.canChange;
  const liquor = value.businessType === "LIQUOR";

  return (
    <>
      <SectionHeading variant="form">Shop</SectionHeading>
      <FormField label="Business type">
        {(id) => (
          <RadioGroup
            id={id}
            name="businessType"
            value={value.businessType}
            disabled={locked}
            onChange={(next) => form.change({ businessType: next as ShopProfileInput["businessType"] })}
          >
            {RETAIL_BUSINESS_TYPES.map((type) => (
              <Radio key={type} value={type} label={BUSINESS_TYPE_LABELS[type]} />
            ))}
          </RadioGroup>
        )}
      </FormField>

      {liquor ? (
        <>
          <SectionHeading variant="form">Liquor store</SectionHeading>
          <SwitchRow
            label="Check ID before selling alcohol"
            checked={value.ageCheck}
            disabled={locked}
            onChange={(ageCheck) => form.change({ ageCheck })}
          />
          <SwitchRow
            label="Stop selling alcohol outside licence hours"
            checked={value.licenceHours}
            disabled={locked}
            onChange={(licenceHours) => form.change({ licenceHours })}
          />
          <SwitchRow
            label="Charge deposits on returnable bottles"
            checked={value.emptiesAndDeposits}
            disabled={locked}
            onChange={(emptiesAndDeposits) => form.change({ emptiesAndDeposits })}
          />
          <SwitchRow
            label="Sell cases and singles"
            checked={value.casesAndSingles}
            disabled={locked}
            onChange={(casesAndSingles) => form.change({ casesAndSingles })}
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <FormField label="Liquor licence number">
              {(id) => (
                <Input
                  id={id}
                  className="font-mono"
                  value={value.licenceNumber ?? ""}
                  disabled={locked}
                  onChange={(event) => form.change({ licenceNumber: event.target.value || null })}
                />
              )}
            </FormField>
            <FormField label="Licence expires">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={value.licenceExpiresOn ?? ""}
                  disabled={locked}
                  onChange={(event) => form.change({ licenceExpiresOn: event.target.value || null })}
                />
              )}
            </FormField>
          </div>

          {value.licenceHours ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <HourField
                label="Opens, Monday to Saturday"
                value={value.weekdayOpensAt}
                disabled={locked}
                onChange={(weekdayOpensAt) => form.change({ weekdayOpensAt })}
              />
              <HourField
                label="Closes, Monday to Saturday"
                value={value.weekdayClosesAt}
                disabled={locked}
                onChange={(weekdayClosesAt) => form.change({ weekdayClosesAt })}
              />
              <HourField
                label="Opens, Sunday"
                value={value.sundayOpensAt}
                disabled={locked}
                onChange={(sundayOpensAt) => form.change({ sundayOpensAt })}
              />
              <HourField
                label="Closes, Sunday"
                value={value.sundayClosesAt}
                disabled={locked}
                onChange={(sundayClosesAt) => form.change({ sundayClosesAt })}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
