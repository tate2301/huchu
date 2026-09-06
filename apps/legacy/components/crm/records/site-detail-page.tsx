"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchCrmFieldDefinitions, type CrmFieldDefinitionRecord } from "@/lib/crm/crm-v2";
import {
  Building2,
  Buildings,
  CalendarCheck,
  Clock,
  Crosshair,
  Funnel,
  Globe,
  Lock,
  MapPin,
  User,
} from "@corelithzw/ui/lib/icons";
import { resolveNextStep } from "@/lib/crm/tones";
import type { LeadFilterOwner } from "@/components/crm/leads/leads-filters";
import { VisitScheduleSheet } from "@/components/crm/visits/visit-schedule-sheet";
import type { CanonicalUiStatus } from "@corelithzw/ui/lib/ui/status-map";

import { formatMoney } from "@/components/crm/documents/document-types";

import { customFieldAttributes } from "@corelithzw/module-records/components/custom-field-attributes";
import { CustomFieldDisplay } from "./custom-field-display";
import { RecordMark } from "@corelithzw/module-records/components/record-mark";
import {
  automationTab,
  historyTab,
  paperworkTab,
  tasksTab,
} from "./record-tabs";
import { RecordAttributes } from "@corelithzw/module-records/components/record-attributes";
import { NextStepCard } from "./next-step-card";
import { RelationAttribute } from "./relation-attribute";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { useAttributeEditor } from "@corelithzw/module-records/components/use-attribute-editor";
import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { RailSection, RecordPageShell, RecordRelated, RelatedList } from "@corelithzw/module-records/components/record-page-shell";
import { ConversationComposer } from "@/components/crm/collaboration/conversation-composer";
import { SiteFormSheet } from "./site-form-sheet";
import { useJobsTab } from "@/components/crm/work-orders/jobs-tab";

import { Stack } from "@corelithzw/react";

const VISIT_STATUS: Record<string, { label: string; status: CanonicalUiStatus }> = {
  SCHEDULED: { label: "Scheduled", status: "pending" },
  COMPLETED: { label: "Completed", status: "passing" },
  CANCELLED: { label: "Cancelled", status: "inactive" },
  NO_SHOW: { label: "No show", status: "failing" },
};

type SiteDetail = {
  id: string;
  avatarUrl: string | null;
  emoji: string | null;
  siteNo: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  accessInstructions: string | null;
  siteConditions: string | null;
  customFields: Record<string, unknown> | null;
  client: { id: string; name: string } | null;
  primaryContact: { id: string; fullName: string; phone: string | null } | null;
  deals: Array<{
    id: string;
    title: string;
    value: number | null;
    currency: string;
    stage: { id: string; name: string };
  }>;
  appointments: Array<{
    id: string;
    appointmentNo: string;
    title: string;
    scheduledStart: string;
    status: string;
    visitItems: Array<{ id: string }>;
  }>;
};

export function SiteDetailPage({ siteId }: { siteId: string }) {
  const { data: session } = useSession();
  const [tab, setTab] = useState("visits");
  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const siteQuery = useQuery({
    queryKey: ["crm", "site", siteId],
    queryFn: () => fetchJson<SiteDetail>(`/api/v2/crm/sites/${siteId}`),
  });
  const { toast } = useToast();
  const edit = useAttributeEditor({
    path: `/api/v2/crm/sites/${siteId}`,
    invalidate: [["crm", "site", siteId], ["crm", "sites"]],
  });
  const fieldsQuery = useQuery({
    queryKey: ["crm", "field-definitions", "SITE"],
    queryFn: () => fetchCrmFieldDefinitions("SITE"),
  });
  // Who a visit can be given to. Shared cache key with the rest of the module,
  // so opening the sheet costs nothing the page has not already paid.
  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: LeadFilterOwner[] }>("/api/v2/crm/team"),
  });

  const owners = teamQuery.data?.data ?? [];
  const definitions: CrmFieldDefinitionRecord[] = fieldsQuery.data?.data ?? [];
  const site = siteQuery.data;

  // The work booked at this address. One sheet raises it — from the actions
  // menu or from the section itself — and afterwards the section it landed in
  // opens, so the page is visibly different for having done it.
  const jobs = useJobsTab({
    ref: { kind: "site", id: siteId },
    currentUserId: session?.user?.id,
    links: { clientId: site?.client?.id },
    // No seeded title: a deal's title is the work, a site's name is only where
    // it happens, and "Msasa depot" tells a crew nothing about what to do.
    onRaised: () => setTab("jobs"),
  });

  if (siteQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (siteQuery.error || !site) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Site not found</AlertTitle>
        <AlertDescription>
          {siteQuery.error ? getApiErrorMessage(siteQuery.error) : "It may have been deleted."}
        </AlertDescription>
      </Alert>
    );
  }

  const subtitle = (
    <>
      {site.client ? (
        <EntityLink href={`/crm/companies/${site.client.id}`} muted>
          {site.client.name}
        </EntityLink>
      ) : null}
      {site.client && site.city ? " · " : null}
      {site.city}
    </>
  );
  const mapsHref =
    site.latitude !== null && site.longitude !== null
      ? `https://www.google.com/maps?q=${site.latitude},${site.longitude}`
      : null;

  /**
   * A site's next step is always somebody going there — what changes is why.
   *
   * A place nobody has been to has no measurements to quote from; a place
   * somebody has been to has measurements as old as that visit. Both are
   * reasons to send a van, and neither is a reason to shout at a site that has
   * one booked already.
   */
  const nextStep = resolveNextStep({
    kind: "site",
    daysSinceContact: null,
    visitBooked: site.appointments.some((visit) => visit.status === "SCHEDULED"),
    visitDone: site.appointments.some((visit) => visit.status === "COMPLETED"),
  });

  /**
   * What the rail has left to say once the properties are at the top.
   *
   * It used to open with Address, Access and Primary contact — all three of
   * which are property rows a few centimetres above it. On a phone that is
   * the whole Overview tab spent repeating the screen you scrolled down from.
   * What is genuinely not a property is kept: the map link, which comes out of
   * the coordinates rather than being them, the site's own conditions, and the
   * administrator's fields.
   */
  const railSections = [
    nextStep ? (
      <RailSection key="next" title="Up next">
        <NextStepCard step={nextStep} onAct={() => setScheduleOpen(true)} />
      </RailSection>
    ) : null,
    mapsHref ? (
      <RailSection key="directions" title="Getting there">
        <a href={mapsHref} target="_blank" rel="noreferrer" className="text-sm hover:underline">
          Open in maps
        </a>
      </RailSection>
    ) : null,
    site.siteConditions ? (
      <RailSection key="conditions" title="Conditions">
        <p className="whitespace-pre-wrap text-sm">{site.siteConditions}</p>
      </RailSection>
    ) : null,
    definitions.length > 0 ? (
      <CustomFieldDisplay key="custom" definitions={definitions} values={site.customFields} />
    ) : null,
  ].filter(Boolean);

  const rail = railSections.length > 0 ? <>{railSections}</> : undefined;

  return (
    <>
      <RecordPageShell
      icon={MapPin}
      backHref="/crm/sites"
      primaryAction={
        // A site is a place somebody has to go to. Every other verb on this
        // record — edit the address, repoint the company — is maintenance;
        // arranging the visit is the work, which is why Visits is also the
        // tab this page opens on.
        <Button size="sm" className="gap-1.5" onClick={() => setScheduleOpen(true)}>
          <CalendarCheck className="h-3.5 w-3.5" />
          Schedule a visit
        </Button>
      }
      actions={[
        { label: "Edit", onSelect: () => setEditOpen(true) },
        { label: "Raise a job", onSelect: jobs.raise },
      ]}
      backLabel="All sites"
      leading={
        <RecordMark
          kind="site"
          name={site.name}
          emoji={site.emoji}
          avatarUrl={site.avatarUrl}
          size="md"
        />
      }
      title={site.name}
      onTitleCommit={(next) => edit.save.mutate({ name: next })}
      reference={site.siteNo}
      subtitle={subtitle}
      activeTab={tab}
      related={
        <RecordRelated
          items={
            // A site can exist before anyone has attached it to a company.
            site.client
              ? [
                  {
                    href: `/crm/companies/${site.client.id}`,
                    label: site.client.name,
                    dot: "bg-[var(--brand)]",
                  },
                ]
              : []
          }
        />
      }
      attributes={
        <RecordAttributes
          attributes={[
            {
              id: "company",
              label: "Company",
              icon: Building2,
              // The same blue a company wears in the table beside this one.
              // Left off when there is nothing linked, so the picker's own
              // placeholder stays the quiet grey a placeholder should be.
              tone: site.client ? "link" : undefined,
              display: (
                <RelationAttribute
                  value={site.client?.name ?? null}
                  href={site.client ? `/crm/companies/${site.client.id}` : null}
                  types={["COMPANY"]}
                  placeholder="No company"
                  searchPlaceholder="Search companies"
                  onPick={(record) => edit.save.mutate({ clientId: record.id })}
                  onClear={() => edit.save.mutate({ clientId: null })}
                />
              ),
            },
            {
              id: "contact",
              label: "Primary contact",
              icon: User,
              tone: site.primaryContact ? "link" : undefined,
              display: (
                <RelationAttribute
                  value={site.primaryContact?.fullName ?? null}
                  href={site.primaryContact ? `/crm/people/${site.primaryContact.id}` : null}
                  types={["PERSON"]}
                  placeholder="Nobody named"
                  searchPlaceholder="Search people"
                  onPick={(record) => edit.save.mutate({ primaryContactId: record.id })}
                  onClear={() => edit.save.mutate({ primaryContactId: null })}
                />
              ),
            },
            {
              id: "address",
              label: "Address",
              icon: MapPin,
              placeholder: "Not recorded",
              ...edit.text("addressLine", site.addressLine),
            },
            // City and country were one read-only row reading "Chiredzi,
            // Zimbabwe". They are two columns, so they are two rows: joined,
            // there was no way to say which half you were correcting.
            {
              id: "city",
              label: "City",
              icon: Buildings,
              placeholder: "Not recorded",
              ...edit.text("city", site.city),
            },
            {
              id: "country",
              label: "Country",
              icon: Globe,
              placeholder: "Not recorded",
              ...edit.text("country", site.country),
            },
            {
              id: "coordinates",
              label: "Coordinates",
              icon: Crosshair,
              placeholder: "Not pinned",
              mono: true,
              // One row, because a pin is one fact and nobody holds a latitude
              // in their head without the longitude next to it. Typed as the
              // pair it is copied as — out of Maps, off a handset — and split
              // here rather than made into two boxes.
              value:
                site.latitude !== null && site.longitude !== null
                  ? `${site.latitude}, ${site.longitude}`
                  : null,
              formatted:
                site.latitude !== null && site.longitude !== null
                  ? `${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`
                  : null,
              onCommit: (next) => {
                const trimmed = next.trim();
                if (trimmed === "") {
                  edit.save.mutate({ latitude: null, longitude: null });
                  return;
                }
                const [lat, lng] = trimmed.split(/[,\s]+/).map(Number);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                  toast({
                    title: "That is not a pin",
                    description: "Two numbers, latitude first — for example -20.19, 30.93.",
                    variant: "destructive",
                  });
                  return;
                }
                edit.save.mutate({ latitude: lat, longitude: lng });
              },
            },
            {
              id: "access",
              label: "Access",
              icon: Lock,
              placeholder: "No instructions",
              ...edit.text("accessInstructions", site.accessInstructions),
            },
            ...customFieldAttributes({
              definitions,
              values: site.customFields,
              onCommit: (key, value) =>
                edit.save.mutate({ customFields: { [key]: value } }),
            }),
          ]}
        />
      }
      onTabChange={setTab}
      tabs={[
        {
          // A site's own story is its visits — it has no activity feed of its
          // own, so this is the record's overview.
          value: "visits",
          label: "Visits",
          icon: CalendarCheck,
          count: site.appointments.length,
          attention: site.appointments.some(
            (visit) =>
              visit.status === "SCHEDULED" && new Date(visit.scheduledStart) < new Date(),
          ),
          content:
            site.appointments.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                Nobody has visited this site yet.
              </p>
            ) : (
              <Stack as="ul" gap="xs">
                {site.appointments.map((visit) => {
                  const status = VISIT_STATUS[visit.status];
                  return (
                    <li key={visit.id} className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm">{visit.appointmentNo}</span>
                        {status ? (
                          <StatusChip status={status.status} label={status.label} />
                        ) : null}
                      </div>
                      <p className="text-sm">{visit.title}</p>
                      <p className="text-sm text-[var(--text-muted)]">
                        <ClientDate value={visit.scheduledStart} />
                      </p>
                      {visit.visitItems.length > 0 ? (
                        <p className="text-sm text-[var(--text-muted)]">
                          {visit.visitItems.length} measurement
                          {visit.visitItems.length === 1 ? "" : "s"} recorded
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </Stack>
            ),
        },
        {
          value: "conversation",
          label: "Conversation",
          icon: Clock,
          content: <ConversationComposer target={{ kind: "site", id: siteId }} />,
        },
        {
          value: "deals",
          label: "Deals",
          icon: Funnel,
          count: site.deals.length,
          content: (
            <RelatedList
              items={site.deals}
              emptyMessage="No deals are attached to this site yet."
              renderItem={(deal) => ({
                href: `/crm/deals/${deal.id}`,
                title: deal.title,
                subtitle: deal.stage.name,
                meta: deal.value !== null ? formatMoney(deal.value, deal.currency) : undefined,
              })}
            />
          ),
        },
        tasksTab({ ref: { kind: "site", id: siteId }, currentUserId: session?.user?.id }),
        paperworkTab({ ref: { kind: "site", id: siteId } }),
        // A job follows the paperwork: it is what the quote turns into.
        jobs.tab,
        automationTab({ ref: { kind: "site", id: siteId } }),
        // No activity list: a site has no activity foreign key, so its history
        // is the edits made to it and the places it gets referred to.
        historyTab({ ref: { kind: "site", id: siteId }, entity: "SITE" }),
      ]}
      rail={rail}
      />

      <SiteFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        // The detail record holds related objects and numeric coordinates; the
        // form holds ids and strings. Map rather than loosen the form's type.
        record={{
          id: site.id,
          emoji: site.emoji ?? "",
          avatarUrl: site.avatarUrl ?? "",
          name: site.name,
          clientId: site.client?.id ?? "",
          addressLine: site.addressLine ?? "",
          city: site.city ?? "",
          country: site.country ?? "",
          latitude: site.latitude === null ? "" : String(site.latitude),
          longitude: site.longitude === null ? "" : String(site.longitude),
          primaryContactId: site.primaryContact?.id ?? "",
          accessInstructions: site.accessInstructions ?? "",
          siteConditions: site.siteConditions ?? "",
        }}
        onSaved={() => siteQuery.refetch()}
      />

      <VisitScheduleSheet
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        subject={{ siteId, clientId: site.client?.id ?? null }}
        defaultLocation={
          [site.addressLine, site.city].filter(Boolean).join(", ") || null
        }
        owners={owners}
        currentUserId={session?.user?.id}
        onScheduled={() => siteQuery.refetch()}
      />

      {jobs.sheet}
    </>
  );
}


