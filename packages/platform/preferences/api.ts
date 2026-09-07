import { fetchJson } from "../api-client";
import type { SubscriptionHealth } from "../subscription";

export type PreferencesProfile = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  image?: string | null;
  role: string;
  isActive: boolean;
  company: {
    id: string;
    name: string;
    slug: string;
    tenantStatus: string;
    workspaceProfile: string;
  };
};

export type BillingPreferences = {
  company: {
    id: string;
    name: string;
    slug: string;
    tenantStatus: string;
    workspaceProfile: string;
  };
  subscription: {
    id: string;
    status: string;
    startedAt: string;
    trialEndsAt?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    effectiveMonthlyAmount?: number | null;
    lastPriceComputedAt?: string | null;
  } | null;
  plan: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    monthlyPrice: number;
    annualPrice?: number | null;
    currency: string;
    maxSites?: number | null;
    maxUsers?: number | null;
  } | null;
  addons: Array<{
    id: string;
    isEnabled: boolean;
    name: string;
    code: string;
    monthlyPrice: number;
    additionalSiteMonthlyPrice: number;
  }>;
  usage: {
    activeSites: number;
    totalSites: number;
    activeUsers: number;
    totalUsers: number;
    maxSites?: number | null;
    maxUsers?: number | null;
  };
  health: SubscriptionHealth;
  payments: {
    onlinePaymentsSupported: false;
    methods: string[];
    guidance: string;
  };
};

export async function fetchPreferencesProfile() {
  return fetchJson<PreferencesProfile>("/api/preferences/profile");
}

export async function updatePreferencesProfile(input: {
  name?: string;
  phone?: string | null;
}) {
  return fetchJson<PreferencesProfile>("/api/preferences/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchBillingPreferences() {
  return fetchJson<BillingPreferences>("/api/preferences/billing");
}
