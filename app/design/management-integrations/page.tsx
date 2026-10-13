"use client";

import { IntegrationsPageView } from "@/components/management/integrations-view";

import { FixtureManagement } from "../_fixtures/management";

/** Management → Integrations with the board's services (design/core-modules/html/management-integrations.html). */
export default function ManagementIntegrationsFixture() {
  return (
    <FixtureManagement active="integrations">
      <IntegrationsPageView
        data={{
          attention: "Last week's CBZ statement has not been uploaded, so 4 bank lines wait in Books.",
          connected: [
            { key: "whatsapp", name: "WhatsApp Business", detail: "Quotes, invoices and reminders go out from 077 220 4180", state: "connected", href: "#", mark: { kind: "icon", icon: "whatsapp" } },
            { key: "ecocash", name: "EcoCash", detail: "Customers pay invoices from a link", state: "connected", href: "#", mark: { kind: "image", src: "/brand/ecocash-wordmark.png" } },
            { key: "fiscal", name: "ZIMRA fiscal device", detail: "Invoices are fiscalised through the showroom's device", state: "connected", href: "#", mark: { kind: "icon", icon: "fiscal" } },
            { key: "bank", name: "CBZ statements", detail: "Uploaded weekly. CBZ does not offer a feed yet", state: "due", href: "#", action: "Upload", mark: { kind: "icon", icon: "bank" } },
          ],
          available: [
            { key: "facebook", name: "Facebook lead ads", detail: "Leads from your Facebook ads arrive in the pipeline", state: "available", href: "#", action: "Connect", mark: { kind: "icon", icon: "pipeline" } },
          ],
        }}
      />
    </FixtureManagement>
  );
}
