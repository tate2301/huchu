import { fetchJson } from "@/lib/api-client";
import type { SubscriptionHealth } from "@/lib/platform/subscription";
import type { DisplayPreference } from "@/lib/preferences/display";

export type PreferencesProfile = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  image?: string | null;
  role: string;
  isActive: boolean;
  /** "Member since" on the profile board. */
  createdAt: string;
  /**
   * "Password — Changed <date>". Null means it has never been changed since the
   * account was made; the row then carries no subtitle rather than borrowing
   * `createdAt`, which is a different claim.
   */
  passwordChangedAt?: string | null;
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
    /**
     * False today. There is no invoice document anywhere in this system for the
     * workspace's own subscription — no number series, no tax lines, no PDF — so
     * the Download control the board draws beside each row has nothing to point
     * at and is not rendered. It flips when an issuer exists.
     */
    invoiceDocumentsSupported: boolean;
    /**
     * Also false today: the method is hardcoded offline and there is no company
     * payment-method record to edit, so the board's Update verb on the Payment
     * row stays hidden until a gateway is picked.
     */
    methodEditable: boolean;
    /**
     * Settled subscription charges, newest first, at most twelve. This is what
     * the board's "Invoices" section can honestly show: a period, a date and an
     * amount, which is what its rows say anyway.
     */
    history: Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      paidAt?: string | null;
      periodMonths: number;
      provider: string;
      reference: string;
    }>;
  };
};

/** The three Display controls on `Appearance.dc.html`, as the API returns them. */
export type AppearancePreferences = DisplayPreference & {
  id?: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchPreferencesProfile() {
  return fetchJson<PreferencesProfile>("/api/preferences/profile");
}

export async function updatePreferencesProfile(input: {
  name?: string;
  phone?: string | null;
  /** A url from `uploadProfilePhoto`, or null to drop the photo. */
  image?: string | null;
}) {
  return fetchJson<PreferencesProfile>("/api/preferences/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * "Change photo": put the file in blob storage, get a url back, then PATCH the
 * url with the rest of the form. Two steps on purpose — an abandoned form
 * leaves an orphaned blob rather than a changed avatar.
 *
 * jpeg / png / webp, 2MB, enforced server-side by the `user-avatar` upload
 * policy; the error this throws on a rejection is already the sentence to show.
 */
export async function uploadProfilePhoto(file: File) {
  const body = new FormData();
  body.append("file", file);
  return fetchJson<{ url: string }>("/api/preferences/profile/photo", {
    method: "POST",
    body,
  });
}

/**
 * The Change verb on the Password row. Not `/api/users/password-reset` — that
 * one is a SUPERADMIN resetting somebody else's password and never asks for the
 * one being replaced.
 */
export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  return fetchJson<{ id: string; passwordChangedAt: string | null }>(
    "/api/preferences/password",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function fetchBillingPreferences() {
  return fetchJson<BillingPreferences>("/api/preferences/billing");
}

export async function fetchAppearancePreferences() {
  return fetchJson<AppearancePreferences>("/api/preferences/appearance");
}

export async function updateAppearancePreferences(input: Partial<DisplayPreference>) {
  return fetchJson<AppearancePreferences>("/api/preferences/appearance", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
