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
  RegisterLayout,
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchTrainingRecords, fetchUsers, type TrainingRecordSummary } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  FileText,
  MedusaBookOpenIcon,
  RefreshCcw,
  SlidersHorizontal,
} from "@/lib/icons";

import {
  ActivitySection,
  CONTROL_CLASS,
  DetailField,
  DetailGrid,
  InlineText,
  InlineTextarea,
  PersonMark,
  RegisterFilter,
  RegisterFilters,
  daysUntil,
  toDateInput,
} from "./record-fields";

/**
 * Training, as `Training.dc.html` draws it.
 *
 * The list is people — each row marked with the holder's initials rather than a
 * code — and the record is the course they hold. No header badge: a current
 * certificate is the norm, and rule 5 keeps chips for exceptions. A certificate
 * inside its last thirty days gets the amber dot on its row instead.
 *
 * Presentation only — query keys, endpoints and toasts are unchanged.
 */

type TrainingForm = {
  userId: string;
  trainingType: string;
  trainingDate: string;
  expiryDate: string;
  certificateUrl: string;
  trainedBy: string;
  notes: string;
};

const emptyForm: TrainingForm = {
  userId: "",
  trainingType: "",
  trainingDate: "",
  expiryDate: "",
  certificateUrl: "",
  trainedBy: "",
  notes: "",
};

/**
 * `certificateUrl` as something safe to put in an `href`, or nothing.
 *
 * The column holds whatever was typed; the PATCH schema checks it with
 * `z.string().url()`, which the `URL` constructor happily satisfies for
 * `javascript:` too. Only `http` and `https` reach a link.
 */
const httpUrlOrNull = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

const expiringSoon = (row: TrainingRecordSummary) => {
  const days = daysUntil(row.expiryDate);
  return days !== null && days <= 30;
};

/**
 * The header badge, or nothing.
 *
 * A certificate that is current — or one with no expiry at all — is the
 * healthy default, and rule 5 keeps the header clear for exceptions. Only a
 * lapsed or nearly-lapsed certificate earns a chip.
 */
function certificateException(record: TrainingRecordSummary) {
  const days = daysUntil(record.expiryDate);
  if (days === null) return null;
  if (days < 0) {
    return (
      <StatusBadge context="header" tone="danger">
        Expired
      </StatusBadge>
    );
  }
  if (days <= 30) {
    return (
      <StatusBadge context="header" tone="warn">
        Expiring
      </StatusBadge>
    );
  }
  return null;
}

export function TrainingTab({
  createdId,
  banner,
}: {
  createdId: string | null;
  banner?: ReactNode;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [expiringFilter, setExpiringFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Server-side filter; deferring keeps one request per pause, not keystroke.
  const deferredSearch = useDeferredValue(search);
  const [selectedId, setSelectedId] = useState<string | null>(createdId);
  const [creating, setCreating] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewalCompleted, setRenewalCompleted] = useState("");
  const [renewalExpires, setRenewalExpires] = useState("");
  const [uploading, setUploading] = useState(false);
  const [certificateDraft, setCertificateDraft] = useState("");
  const [form, setForm] = useState<TrainingForm>(emptyForm);

  const { data: usersData, error: usersError } = useQuery({
    queryKey: ["users", "compliance", "training"],
    queryFn: () => fetchUsers({ limit: 500 }),
  });
  const users = useMemo(() => usersData?.data ?? [], [usersData]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["compliance", "training", expiringFilter, deferredSearch],
    queryFn: () =>
      fetchTrainingRecords({
        // The endpoint's own window: `expiringDays=30` is what makes this the
        // list of certificates about to lapse, not a filter applied to rows
        // that already arrived.
        expiringDays: expiringFilter === "expiring" ? 30 : undefined,
        search: deferredSearch || undefined,
        limit: 500,
      }),
  });

  const records = useMemo(() => data?.data ?? [], [data]);

  // The list is the screen; a record has to be open for the right column to be
  // anything. The first row stands in until somebody picks another. Derived
  // during render, so the selection never lags a frame behind the rows.
  const activeId =
    selectedId && records.some((row) => row.id === selectedId)
      ? selectedId
      : (records[0]?.id ?? null);

  const record = records.find((row) => row.id === activeId) ?? null;
  const certificateHref = httpUrlOrNull(record?.certificateUrl);

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createdId", id);
    params.set("source", "training");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance/training?${params.toString()}`);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: TrainingForm) =>
      fetchJson<TrainingRecordSummary>("/api/compliance/training-records", {
        method: "POST",
        body: JSON.stringify({
          userId: payload.userId,
          trainingType: payload.trainingType,
          trainingDate: payload.trainingDate,
          expiryDate: payload.expiryDate || undefined,
          certificateUrl: payload.certificateUrl || undefined,
          trainedBy: payload.trainedBy || undefined,
          notes: payload.notes || undefined,
        }),
      }),
    onSuccess: (saved) => {
      toast({
        title: "Training created",
        description: "Training record saved successfully.",
        variant: "success",
      });
      setCreating(false);
      setForm(emptyForm);
      setSelectedId(saved.id);
      queryClient.invalidateQueries({ queryKey: ["compliance", "training"] });
      pushSaved(saved.id, saved.createdAt);
    },
    onError: (saveError) => {
      toast({
        title: "Unable to save training",
        description: getApiErrorMessage(saveError),
        variant: "destructive",
      });
    },
  });

  /** One field at a time, against the endpoint the dialog used. */
  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      fetchJson<TrainingRecordSummary>(`/api/compliance/training-records/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance", "training"] });
    },
    onError: (patchError) => {
      toast({
        title: "Unable to save training",
        description: getApiErrorMessage(patchError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compliance/training-records/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Training deleted",
        description: "Training record was removed.",
        variant: "success",
      });
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["compliance", "training"] });
    },
    onError: (deleteError) => {
      toast({
        title: "Unable to delete training",
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
      userId: users[0]?.id ?? "",
      trainingDate: new Date().toISOString().slice(0, 10),
    });
    setCreating(true);
  };

  const state: ListColumnState = isLoading
    ? "loading"
    : isError || usersError
      ? "failed"
      : records.length > 0
        ? "ready"
        : deferredSearch.trim() || expiringFilter !== "all"
          ? "no-matches"
          : "empty";

  return (
    <ManagementShell title="Training">
      <RegisterLayout
        hasSelection={Boolean(record)}
        list={
          <ListColumn
            title="Training"
            noun="training record"
            count={isLoading ? undefined : records.length}
            state={state}
            /* The board draws no column line here, but its list holds one
               record per person. A real register holds several per person, so
               the expiry is what tells two of somebody's rows apart — and rule
               6 says a value column is named. */
            columns={{ row: "Holder", value: "Expires" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Person or course",
            }}
            /* The one filter this register has always had, and the reason most
               people open it: whose certificate lapses inside thirty days. */
            filters={
              <RegisterFilters>
                <RegisterFilter
                  label="Filter training records by expiry"
                  value={expiringFilter}
                  onChange={setExpiringFilter}
                  options={[
                    { value: "all", label: "Any record" },
                    { value: "expiring", label: "Expiring in 30 days" },
                  ]}
                />
              </RegisterFilters>
            }
            onNew={openCreate}
            onRetry={() => void refetch()}
            emptyLabel="No training records"
          >
            {records.map((row) => (
              <ListRow
                key={row.id}
                mark={
                  <PersonMark name={row.user.name} selected={row.id === activeId} />
                }
                name={row.user.name}
                value={toDateInput(row.expiryDate) || "—"}
                attention={expiringSoon(row)}
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
              title={record.trainingType}
              icon={MedusaBookOpenIcon}
              onRename={(next) => patch({ trainingType: next })}
              renameLabel="Rename the course"
              /* Rule 5: a current certificate is the norm and gets no chip.
                 A lapsed one is red and one inside its last thirty days is
                 amber, which is the whole reason the register is read. */
              badge={certificateException(record) ?? undefined}
              action={
                <HeaderAction
                  icon={RefreshCcw}
                  onClick={() => {
                    setRenewalCompleted(new Date().toISOString().slice(0, 10));
                    setRenewalExpires(toDateInput(record.expiryDate));
                    setRenewing(true);
                  }}
                >
                  Record renewal
                </HeaderAction>
              }
              overflow={
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      setCertificateDraft(record.certificateUrl ?? "");
                      setUploading(true);
                    }}
                  >
                    Upload certificate
                  </DropdownMenuItem>
                  {/* Rule 9: hidden, not disabled, when there is nothing to
                      open — and a real `<a href>` rather than a `window.open`,
                      so it opens in a new tab, copies, and reads as a link.
                      Only `http(s)`: `certificateUrl` is whatever somebody
                      typed and `z.string().url()` lets a `javascript:` scheme
                      through. */}
                  {certificateHref ? (
                    <DropdownMenuItem asChild>
                      <a href={certificateHref} target="_blank" rel="noopener noreferrer">
                        Open the certificate
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() => {
                      void (async () => {
                        const confirmed = await dsConfirm({
                          title: `Delete ${record.trainingType}?`,
                          description: `${record.user.name}'s certificate leaves the training register.`,
                          confirmLabel: "Delete the record",
                          variant: "danger",
                        });
                        if (confirmed) deleteMutation.mutate(record.id);
                      })();
                    }}
                  >
                    Delete the record
                  </DropdownMenuItem>
                </>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailField label="Holder">
                {(id) => (
                  <Select
                    value={record.userId}
                    onValueChange={(value) => patch({ userId: value })}
                  >
                    <SelectTrigger id={id} className={CONTROL_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </DetailField>
              <DetailField label="Provider">
                {(id) => (
                  <InlineText
                    id={id}
                    value={record.trainedBy ?? ""}
                    onCommit={(next) => patch({ trainedBy: next.trim() || null })}
                  />
                )}
              </DetailField>
              <DetailField label="Completed">
                {(id) => (
                  <InlineText
                    id={id}
                    type="date"
                    value={toDateInput(record.trainingDate)}
                    onCommit={(next) => (next ? patch({ trainingDate: next }) : undefined)}
                  />
                )}
              </DetailField>
              <DetailField label="Expires">
                {(id) => (
                  <InlineText
                    id={id}
                    type="date"
                    value={toDateInput(record.expiryDate)}
                    onCommit={(next) => patch({ expiryDate: next || null })}
                  />
                )}
              </DetailField>
              <DetailField label="Certificate">
                {(id) => (
                  <InlineText
                    id={id}
                    type="url"
                    placeholder="https://"
                    value={record.certificateUrl ?? ""}
                    onCommit={(next) => patch({ certificateUrl: next.trim() || null })}
                  />
                )}
              </DetailField>
            </DetailGrid>

            <SectionHeading icon={FileText}>Notes</SectionHeading>
            <div style={{ maxWidth: 470 }}>
              <InlineTextarea
                rows={3}
                ariaLabel="Notes"
                value={record.notes ?? ""}
                onCommit={(next) => patch({ notes: next.trim() || null })}
              />
            </div>

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
            <DialogTitle>New training record</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <FormField label="Course">
              {(id) => (
                <Input
                  id={id}
                  required
                  className={CONTROL_CLASS}
                  value={form.trainingType}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, trainingType: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Holder">
              {(id) => (
                <Select
                  value={form.userId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, userId: value }))}
                >
                  <SelectTrigger id={id} className={CONTROL_CLASS}>
                    <SelectValue placeholder="Select a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Provider">
              {(id) => (
                <Input
                  id={id}
                  className={CONTROL_CLASS}
                  value={form.trainedBy}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, trainedBy: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Completed">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="date"
                  className={CONTROL_CLASS}
                  value={form.trainingDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, trainingDate: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Expires">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  className={CONTROL_CLASS}
                  value={form.expiryDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, expiryDate: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Certificate">
              {(id) => (
                <Input
                  id={id}
                  type="url"
                  placeholder="https://"
                  className={CONTROL_CLASS}
                  value={form.certificateUrl}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, certificateUrl: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Notes">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  className={CONTROL_CLASS}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Create record"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* The header's one verb. A renewal is the two dates that make the
          certificate current again, written through the same PATCH. */}
      <Dialog open={renewing} onOpenChange={setRenewing}>
        <DialogContent size="sm" className="w-full">
          <DialogHeader>
            <DialogTitle>Record a renewal</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!renewalCompleted) return;
              patch({
                trainingDate: renewalCompleted,
                expiryDate: renewalExpires || null,
              });
              setRenewing(false);
            }}
          >
            <FormField label="Completed">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="date"
                  className={CONTROL_CLASS}
                  value={renewalCompleted}
                  onChange={(event) => setRenewalCompleted(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="Expires">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  className={CONTROL_CLASS}
                  value={renewalExpires}
                  onChange={(event) => setRenewalExpires(event.target.value)}
                />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={patchMutation.isPending}>
                Record renewal
              </Button>
              <Button type="button" variant="outline" onClick={() => setRenewing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* The rare verb, out of the header and into the overflow.
          `TrainingRecord` holds the certificate as a URL — the PATCH schema
          validates it with `z.string().url()` (`app/api/compliance/
          training-records/[id]/route.ts:11`) and there is no upload endpoint
          to post a file to. So the certificate is attached by its link, which
          is the only thing the register can actually store. */}
      <Dialog
        open={uploading}
        onOpenChange={(open) => {
          setUploading(open);
          if (!open) setCertificateDraft("");
        }}
      >
        <DialogContent size="sm" className="w-full">
          <DialogHeader>
            <DialogTitle>Upload certificate</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              patch({ certificateUrl: certificateDraft.trim() || null });
              setUploading(false);
              setCertificateDraft("");
            }}
          >
            <FormField label="Certificate link">
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  type="url"
                  placeholder="https://"
                  className={CONTROL_CLASS}
                  value={certificateDraft}
                  onChange={(event) => setCertificateDraft(event.target.value)}
                />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={patchMutation.isPending}>
                Attach certificate
              </Button>
              <Button type="button" variant="outline" onClick={() => setUploading(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}
