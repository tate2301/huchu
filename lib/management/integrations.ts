import type { PrismaClient } from "@prisma/client";

/**
 * Management → Integrations (design/core-modules/html/management-integrations.html):
 * the services the workspace is connected to and the ones it can connect, as
 * the app actually has them. Each one says what it does for the workspace and
 * where it is set up. Nothing is listed that the app cannot connect.
 */

export type IntegrationState = "connected" | "due" | "failing" | "available";

export type Integration = {
  key: "whatsapp" | "ecocash" | "fiscal" | "bank" | "facebook";
  name: string;
  detail: string;
  state: IntegrationState;
  /** Where it is set up or managed. */
  href: string;
  /** The verb on its button when it is not simply Manage. */
  action?: "Upload" | "Connect" | "Fix";
  mark: { kind: "image"; src: string } | { kind: "icon"; icon: "fiscal" | "bank" | "at" | "whatsapp" | "pipeline" };
};

export type IntegrationsView = {
  connected: Integration[];
  available: Integration[];
  /** The one thing that needs the reader, for the finding's second sentence. */
  attention: string | null;
};

/** A bank statement older than this is due. CBZ statements are uploaded weekly. */
const STATEMENT_DUE_DAYS = 7;

export type IntegrationInputs = {
  features: readonly string[];
  whatsappConfigured: boolean;
  now?: Date;
};

export async function readIntegrations(
  db: Pick<PrismaClient, "fiscalisationProviderConfig" | "retailPaymentSettings" | "crmFacebookConnection" | "bankAccount" | "bankStatementLine">,
  companyId: string,
  { features, whatsappConfigured, now = new Date() }: IntegrationInputs,
): Promise<IntegrationsView> {
  const has = (prefix: string) => features.some((feature) => feature.startsWith(prefix));
  const [fiscal, payments, facebook, accounts, lastLine] = await Promise.all([
    db.fiscalisationProviderConfig.findFirst({
      where: { companyId, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { serialNumber: true, registeredAt: true, lastOkAt: true, lastFailedAt: true },
    }),
    db.retailPaymentSettings.findUnique({
      where: { companyId },
      select: { takeEcocash: true, ecocashMerchantCode: true, ecocashPhone: true, ecocashDisplayName: true },
    }),
    db.crmFacebookConnection.findFirst({
      where: { companyId, isActive: true },
      select: { pageName: true, verifiedAt: true, lastError: true, lastErrorAt: true, lastEventAt: true },
    }),
    db.bankAccount.findMany({
      where: { companyId, isActive: true, kind: "BANK" },
      select: { name: true, bankName: true },
      orderBy: { name: "asc" },
    }),
    db.bankStatementLine.findFirst({
      where: { reconciliation: { companyId } },
      orderBy: { txnDate: "desc" },
      select: { txnDate: true },
    }),
  ]);

  const all: Integration[] = [];

  all.push({
    key: "whatsapp",
    name: "WhatsApp Business",
    detail: whatsappConfigured
      ? "Quotes, invoices and reminders go out on WhatsApp"
      : "Send quotes, invoices and reminders on WhatsApp",
    state: whatsappConfigured ? "connected" : "available",
    href: "/crm/settings",
    mark: { kind: "icon", icon: "whatsapp" },
  });

  if (has("retail.") || payments) {
    const ecocash = Boolean(payments?.takeEcocash);
    all.push({
      key: "ecocash",
      name: "EcoCash",
      detail: ecocash
        ? [payments?.ecocashDisplayName, payments?.ecocashMerchantCode ? `merchant ${payments.ecocashMerchantCode}` : payments?.ecocashPhone]
            .filter(Boolean)
            .join(", ") || "Customers pay at the till by EcoCash"
        : "Take EcoCash at the till",
      state: ecocash ? "connected" : "available",
      href: "/retail/manage/payments",
      mark: { kind: "image", src: "/brand/ecocash-wordmark.png" },
    });
  }

  if (has("accounting.") || has("retail.") || fiscal) {
    const failing = Boolean(fiscal?.lastFailedAt && (!fiscal.lastOkAt || fiscal.lastFailedAt > fiscal.lastOkAt));
    all.push({
      key: "fiscal",
      name: "ZIMRA fiscal device",
      detail: fiscal?.registeredAt
        ? failing
          ? "The last receipt did not reach ZIMRA. Check the device"
          : `Invoices are fiscalised through device ${fiscal.serialNumber ?? ""}`.trim()
        : "Fiscalise invoices and till receipts with ZIMRA",
      state: fiscal?.registeredAt ? (failing ? "failing" : "connected") : "available",
      href: has("retail.") ? "/retail/manage/fiscal" : "/accounting/fiscalisation",
      action: fiscal?.registeredAt ? (failing ? "Fix" : undefined) : "Connect",
      mark: { kind: "icon", icon: "fiscal" },
    });
  }

  if (accounts.length > 0) {
    const banks = [...new Set(accounts.map((account) => account.bankName || account.name))];
    const ageDays = lastLine ? Math.floor((now.getTime() - lastLine.txnDate.getTime()) / 86_400_000) : null;
    const due = ageDays === null || ageDays > STATEMENT_DUE_DAYS;
    all.push({
      key: "bank",
      name: `${banks.join(" and ")} statements`,
      detail:
        ageDays === null
          ? "Upload a statement and Books matches each line"
          : `Uploaded by hand. The last line is from ${lastLine!.txnDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}`,
      state: due ? "due" : "connected",
      href: "/accounting/banking",
      action: due ? "Upload" : undefined,
      mark: { kind: "icon", icon: "bank" },
    });
  }

  if (has("crm.") || facebook) {
    all.push({
      key: "facebook",
      name: "Facebook lead ads",
      detail: facebook
        ? facebook.lastError && (!facebook.lastEventAt || (facebook.lastErrorAt && facebook.lastErrorAt > facebook.lastEventAt))
          ? `The last lead from ${facebook.pageName ?? "the page"} did not arrive`
          : `Leads from ${facebook.pageName ?? "your page"} arrive in the pipeline`
        : "Leads from your Facebook ads arrive in the pipeline",
      state: facebook ? (facebook.lastError && facebook.lastErrorAt && (!facebook.lastEventAt || facebook.lastErrorAt > facebook.lastEventAt) ? "failing" : "connected") : "available",
      href: "/crm/settings",
      action: facebook ? undefined : "Connect",
      mark: { kind: "icon", icon: "pipeline" },
    });
  }

  const connected = all.filter((item) => item.state !== "available");
  const available = all.filter((item) => item.state === "available");
  const first = connected.find((item) => item.state === "failing") ?? connected.find((item) => item.state === "due");
  const attention = first
    ? first.state === "due"
      ? `The ${first.name} are due, so new bank lines wait in Books.`
      : `${first.name} needs looking at.`
    : null;
  return { connected, available, attention };
}
