"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import {
  FormField,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionAction,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
} from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchPermits, fetchSites, type PermitRecord } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { FileCheck, ListBullets, Paperclip, RefreshCcw, SlidersHorizontal } from "@/lib/icons";

import {
  ActivitySection,
  CONTROL_CLASS,
  DetailField,
  DetailGrid,
  InlineText,
  RegisterFilter,
  RegisterFilters,
  StaticValue,
  daysUntil,
  toDateInput,
} from "./record-fields";

/**
 * Permits, as `Permits.dc.html` draws it.
 *
 * A register: the list beside the record, not a table with a detail drawer
 * bolted to its right edge. One permit is looked at to answer one question —
 * when does it run out, and who owns it — so the record carries its own fields
 * rather than a read-only restatement of the row that was clicked.
 *
 * Presentation only. Every query key, endpoint, filter and toast below is the
 * one this screen already used.
 */

type PermitForm = {
  permitType: string;
  permitNumber: string;
  siteId: string;
  issueDate: string;
  expiryDate: string;
  responsiblePerson: string;
  documentUrl: string;
};

const emptyForm: PermitForm = {
  permitType: "",
  permitNumber: "",
  siteId: "",
  issueDate: "",
  expiryDate: "",
  responsiblePerson: "",
  documentUrl: "",
};

/**
 * Rule 5: a permit that is simply valid gets no chip. The amber one carries the
 * number of days, which is the fact the header is there to give; red says the
 * date is behind us.
 */
function permitBadge(row: PermitRecord) {
  const days = daysUntil(row.expiryDate);
  if (row.status === "EXPIRED" || (days !== null && days < 0)) {
    return (
      <StatusBadge context="header" tone="danger">
        Expired
      </StatusBadge>
    );
  }
  if (days !== null && days <= 30) {
    return (
      <StatusBadge context="header" tone="warn">
        {days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`}
      </StatusBadge>
    );
  }
  return null;
}

/**
 * The Documents row, read off the link the permit holds.
 *
 * `Permits.dc.html` draws a file type in the mono column and a name beside it.
 * A permit carries one `documentUrl` and nothing else about the file — no
 * size, no upload date — so the row says what the URL says and the board's
 * Size column is left out rather than filled with a guess (rule 6: a column
 * that is named has to hold something).
 */
function documentRow(url: string) {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // A relative or malformed link still has a last segment worth reading.
  }
  const file = decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "") || "Document";
  const dot = file.lastIndexOf(".");
  return {
    name: dot > 0 ? file.slice(0, dot) : file,
    code: dot > 0 ? file.slice(dot + 1, dot + 5).toUpperCase() : undefined,
  };
}

/**
 * `DetailField`'s label, for the one row that has no control under it.
 *
 * Same metrics as the board's `<label>` — `400 12/1.45 #5E6573` — so the Site
 * row reads identically to the five around it while staying a `<span>`.
 */
const DETAIL_LABEL = {
  font: "400 12px/1.45 var(--font-sans)",
  color: "#5E6573",
} as const;

/**
 * The status filter's options. The values are the ones the endpoint reads
 * (`app/api/compliance/permits/route.ts`); only the words are the reader's.
 */
const STATUS_OPTIONS = [
  { value: "all", label: "Any status" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRING_SOON", label: "Expiring soon" },
  { value: "EXPIRED", label: "Expired" },
];

const needsAttention = (row: PermitRecord) => {
  const days = daysUntil(row.expiryDate);
  return row.status !== "ACTIVE" || (days !== null && days <= 30);
};

export function PermitsTab({ createdId, banner }: { createdId: string | null; banner?: ReactNode }) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Server-side filter; deferring keeps one request per pause, not keystroke.
  const deferredSearch = useDeferredValue(search);
  const [selectedId, setSelectedId] = useState<string | null>(createdId);
  const [creating, setCreating] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewalDate, setRenewalDate] = useState("");
  const [linking, setLinking] = useState(false);
  const [documentDraft, setDocumentDraft] = useState("");
  const [form, setForm] = useState<PermitForm>(emptyForm);

  const { data: sites, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["compliance", "permits", siteFilter, statusFilter, deferredSearch],
    queryFn: () =>
      fetchPermits({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: deferredSearch || undefined,
        limit: 500,
      }),
  });

  // What the reader has narrowed the register by. An empty list under a filter
  // is "no matches", not "there are no permits" — and certainly not an empty
  // state offering to create one.
  const narrowed = siteFilter !== "all" || statusFilter !== "all";

  const permits = useMemo(() => data?.data ?? [], [data]);

  // The list is the screen; a record has to be open for the right column to be
  // anything. The first row stands in until somebody picks another. Derived
  // during render, so the selection never lags a frame behind the rows.
  const activeId =
    selectedId && permits.some((row) => row.id === selectedId)
      ? selectedId
      : (permits[0]?.id ?? null);

  const record = permits.find((row) => row.id === activeId) ?? null;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createdId", id);
    params.set("source", "permit");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance/permits?${params.toString()}`);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: PermitForm) =>
      fetchJson<PermitRecord>("/api/compliance/permits", {
        method: "POST",
        body: JSON.stringify({
          permitType: payload.permitType,
          permitNumber: payload.permitNumber,
          siteId: payload.siteId,
          issueDate: payload.issueDate,
          expiryDate: payload.expiryDate,
          responsiblePerson: payload.responsiblePerson,
          documentUrl: payload.documentUrl || undefined,
          status: "ACTIVE",
        }),
      }),
    onSuccess: (permit) => {
      toast({
        title: "Permit created",
        description: "Permit record saved successfully.",
        variant: "success",
      });
      setCreating(false);
      setForm(emptyForm);
      setSelectedId(permit.id);
      queryClient.invalidateQueries({ queryKey: ["compliance", "permits"] });
      pushSaved(permit.id, permit.createdAt);
    },
    onError: (saveError) => {
      toast({
        title: "Unable to save permit",
        description: getApiErrorMessage(saveError),
        variant: "destructive",
      });
    },
  });

  /**
   * One field at a time, against the same endpoint the dialog used. The PATCH
   * schema at `app/api/compliance/permits/[id]/route.ts` takes every key
   * optionally, so a record edits in place with no Save button — which is what
   * the board draws.
   */
  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      fetchJson<PermitRecord>(`/api/compliance/permits/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance", "permits"] });
    },
    onError: (patchError) => {
      toast({
        title: "Unable to save permit",
        description: getApiErrorMessage(patchError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compliance/permits/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Permit deleted",
        description: "Permit was removed.",
        variant: "success",
      });
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["compliance", "permits"] });
    },
    onError: (deleteError) => {
      toast({
        title: "Unable to delete permit",
        description: getApiErrorMessage(deleteError),
        variant: "destructive",
      });
    },
  });

  const patch = (body: Record<string, unknown>) => {
    if (!record) return;
    patchMutation.mutate({ id: record.id, body });
  };

  const openCreate = () => {
    setForm({
      ...emptyForm,
      // The site being looked at is the site the new permit is most likely for.
      siteId: siteFilter !== "all" ? siteFilter : (sites?.[0]?.id ?? ""),
      issueDate: new Date().toISOString().slice(0, 10),
    });
    setCreating(true);
  };

  const state: ListColumnState = isLoading
    ? "loading"
    : isError || sitesError
      ? "failed"
      : permits.length > 0
        ? "ready"
        : deferredSearch.trim() || narrowed
          ? "no-matches"
          : "empty";

  return (
    <ManagementShell title="Permits">
      <RegisterLayout
        hasSelection={Boolean(record)}
        list={
          <ListColumn
            title="Permits"
            noun="permit"
            count={isLoading ? undefined : permits.length}
            state={state}
            /* Rule 6: the list names what its rows hold. The mono column is the
               site the permit belongs to, not the permit's own reference —
               that lives on the record. There is no second column: the board
               gives a permit row a name and, when it is running out, the amber
               dot, and a header over an empty column would name nothing. */
            columns={{ row: "Permit" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Type, number, responsible person",
            }}
            /* Site and status, the two the register has always filtered on and
               the two a tenant with several sites cannot read it without. Both
               go to the endpoint as `siteId` and `status`; neither narrows the
               rows in the browser. */
            filters={
              <RegisterFilters>
                <RegisterFilter
                  label="Filter permits by site"
                  value={siteFilter}
                  onChange={setSiteFilter}
                  options={[
                    { value: "all", label: "Any site" },
                    ...(sites ?? []).map((site) => ({
                      value: site.id,
                      label: site.name,
                    })),
                  ]}
                />
                <RegisterFilter
                  label="Filter permits by status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={STATUS_OPTIONS}
                />
              </RegisterFilters>
            }
            onNew={openCreate}
            onRetry={() => void refetch()}
            emptyLabel="No permits"
          >
            {permits.map((row) => (
              <ListRow
                key={row.id}
                code={row.site.code}
                name={row.permitType}
                attention={needsAttention(row)}
                attentionLabel="Expiring or expired"
                selected={row.id === activeId}
                onSelect={() => setSelectedId(row.id)}
              />
            ))}
          </ListColumn>
        }
      >
        {banner}
        {record ? (
          <>
            <RecordHeader
              title={record.permitType}
              icon={FileCheck}
              /* The endpoint takes `min(1)` for this, so an emptied title is a
                 400 and a toast rather than a rename. Nothing committed means
                 the name stays what it was, which is what Escape does too. */
              onRename={(next) => (next.trim() ? patch({ permitType: next.trim() }) : undefined)}
              renameLabel="Rename the permit"
              badge={permitBadge(record)}
              action={
                <HeaderAction
                  icon={RefreshCcw}
                  onClick={() => {
                    setRenewalDate(toDateInput(record.expiryDate));
                    setRenewing(true);
                  }}
                >
                  Renew
                </HeaderAction>
              }
              overflow={
                <DropdownMenuItem
                  onSelect={() => {
                    void (async () => {
                      const confirmed = await dsConfirm({
                        title: `Delete ${record.permitType}?`,
                        description:
                          "The permit and its expiry tracking disappear from the compliance register.",
                        confirmLabel: "Delete the permit",
                        variant: "danger",
                      });
                      if (confirmed) deleteMutation.mutate(record.id);
                    })();
                  }}
                >
                  Delete the permit
                </DropdownMenuItem>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailField label="Reference">
                {(id) => (
                  <InlineText
                    id={id}
                    mono
                    value={record.permitNumber}
                    onCommit={(next) =>
                      next.trim() ? patch({ permitNumber: next.trim() }) : undefined
                    }
                  />
                )}
              </DetailField>
              {/* `siteId` is absent from the PATCH schema, so the site is the
                  one thing on this record that is a fact rather than a field.
                  Its name is a plain span in the label column, not a
                  `<label for>`: there is no control for one to point at, and a
                  label referencing nothing is a label a reader cannot click
                  and a screen reader cannot associate. */}
              <span style={DETAIL_LABEL}>Site</span>
              <StaticValue>{record.site.name}</StaticValue>
              <DetailField label="Issued">
                {(id) => (
                  <InlineText
                    id={id}
                    type="date"
                    value={toDateInput(record.issueDate)}
                    onCommit={(next) => (next ? patch({ issueDate: next }) : undefined)}
                  />
                )}
              </DetailField>
              <DetailField label="Expires">
                {(id) => (
                  <InlineText
                    id={id}
                    type="date"
                    value={toDateInput(record.expiryDate)}
                    onCommit={(next) => (next ? patch({ expiryDate: next }) : undefined)}
                  />
                )}
              </DetailField>
              <DetailField label="Owner">
                {(id) => (
                  <InlineText
                    id={id}
                    value={record.responsiblePerson}
                    onCommit={(next) =>
                      next.trim() ? patch({ responsiblePerson: next.trim() }) : undefined
                    }
                  />
                )}
              </DetailField>
            </DetailGrid>

            {/* The board's Documents list, with its verb on the heading (rule
                2) and its count beside the name (rule 7). The board says
                "Upload document"; a permit holds a `documentUrl` and there is
                no upload endpoint, so the verb is the one the record can
                honour — it links a file that is already somewhere — rather
                than a button that would fail. */}
            <SectionHeading
              icon={ListBullets}
              count={record.documentUrl ? 1 : 0}
              action={
                <SectionAction
                  icon={Paperclip}
                  onClick={() => {
                    setDocumentDraft(record.documentUrl ?? "");
                    setLinking(true);
                  }}
                >
                  {record.documentUrl ? "Replace document" : "Link document"}
                </SectionAction>
              }
            >
              Documents
            </SectionHeading>
            {record.documentUrl ? (
              <RecordList
                columns={{ row: "Document" }}
                rows={[
                  {
                    id: record.id,
                    ...documentRow(record.documentUrl),
                    href: record.documentUrl,
                  },
                ]}
              />
            ) : (
              <p
                style={{
                  maxWidth: 470,
                  margin: 0,
                  font: "400 13px/1.5 var(--font-sans)",
                  color: "#5E6573",
                }}
              >
                No documents
              </p>
            )}

            {/* Rule 12's section, built on the shared layer's `SectionHeading`
                and reading the same empty state the other three compliance
                registers draw. A permit has no audit route — `/api/users/[id]/audit`
                is the only one that reads `PlatformAuditEvent` back for a
                record, and adding another is a data-fetching change this
                refactor does not make — so the section is honest about holding
                nothing rather than drawing an `ActivityTrail` with no rows in
                it. No "Chain verified" footer either: `lib/audit/platform.ts`
                documents that concurrent writes fork the chain, so a shield
                drawn from arrival order would assert the one thing it cannot
                know. */}
            <ActivitySection />
          </>
        ) : null}
      </RegisterLayout>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) saveMutation.reset();
        }}
      >
        <DialogContent size="md" className="w-full">
          <DialogHeader>
            <DialogTitle>New permit</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <FormField label="Permit type">
              {(id) => (
                <Input
                  id={id}
                  required
                  className={CONTROL_CLASS}
                  value={form.permitType}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, permitType: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Reference">
              {(id) => (
                <Input
                  id={id}
                  required
                  className={CONTROL_CLASS}
                  value={form.permitNumber}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, permitNumber: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Site">
              {(id) => (
                <Select
                  value={form.siteId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, siteId: value }))}
                >
                  <SelectTrigger id={id} className={CONTROL_CLASS}>
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites?.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Issued">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="date"
                  className={CONTROL_CLASS}
                  value={form.issueDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, issueDate: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Expires">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="date"
                  className={CONTROL_CLASS}
                  value={form.expiryDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, expiryDate: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Owner">
              {(id) => (
                <Input
                  id={id}
                  required
                  className={CONTROL_CLASS}
                  value={form.responsiblePerson}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, responsiblePerson: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Document">
              {(id) => (
                <Input
                  id={id}
                  type="url"
                  placeholder="https://"
                  className={CONTROL_CLASS}
                  value={form.documentUrl}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, documentUrl: event.target.value }))
                  }
                />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Create permit"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* "Renew" is the header's one verb on the board. A permit has no renewal
          endpoint of its own — renewing it *is* moving the expiry date — so the
          verb asks for the new date and writes it through the same PATCH. */}
      <Dialog open={renewing} onOpenChange={setRenewing}>
        <DialogContent size="sm" className="w-full">
          <DialogHeader>
            <DialogTitle>Renew {record?.permitType}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!renewalDate) return;
              patch({ expiryDate: renewalDate });
              setRenewing(false);
            }}
          >
            <FormField label="New expiry date">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="date"
                  className={CONTROL_CLASS}
                  value={renewalDate}
                  onChange={(event) => setRenewalDate(event.target.value)}
                />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={patchMutation.isPending}>
                Renew
              </Button>
              <Button type="button" variant="outline" onClick={() => setRenewing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* The Documents heading's verb. One field, because one link is all the
          permit holds; clearing it removes the document from the list. */}
      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent size="sm" className="w-full">
          <DialogHeader>
            <DialogTitle>Link a document</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              patch({ documentUrl: documentDraft.trim() || null });
              setLinking(false);
            }}
          >
            <FormField label="Document link">
              {(id) => (
                <Input
                  id={id}
                  type="url"
                  placeholder="https://"
                  className={CONTROL_CLASS}
                  value={documentDraft}
                  onChange={(event) => setDocumentDraft(event.target.value)}
                />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={patchMutation.isPending}>
                Save
              </Button>
              <Button type="button" variant="outline" onClick={() => setLinking(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}
