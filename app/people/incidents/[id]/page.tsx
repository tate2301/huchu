"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Amt, BkApproval, BkBlock, BkEmpty, BkFacts, BkPage, BkRecord, BkRecordHead, BkLoading, BkSectionHead, St, type BkStep } from "@/components/books/ui";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { Button, ButtonGroup, Drawer, DrawerSection, Field, Input, Person, Select, TextArea } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { shortDay } from "@/lib/books/format";
import {
  ACTION_DONE,
  ACTION_LABEL,
  ACTION_STATUS_LABEL,
  ACTION_TONE,
  CATEGORY_LABELS,
  PENALTY_CHOICES,
  PENALTY_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  type DisciplinaryActionRecord,
  type HrIncidentRecord,
} from "@/lib/people/incidents";

const day = (value: string) => shortDay(value.slice(0, 10));

/** Who did what to a disciplinary action, in order: logged, sent, approved, applied. */
function stepsOf(action: DisciplinaryActionRecord): BkStep[] {
  const refused = action.status === "REJECTED";
  return [
    { role: "Logged", name: action.createdBy.name, note: day(action.createdAt), state: "done" },
    action.submittedAt
      ? { role: "Sent", name: action.submittedBy?.name ?? "Someone", note: day(action.submittedAt), state: "done" }
      : { role: "Sends", name: "Not sent yet", state: "now" },
    action.approvedAt
      ? { role: "Approved", name: action.approvedBy?.name ?? "Someone", note: day(action.approvedAt), state: "done" }
      : { role: "Approves", name: refused ? "Rejected" : "Waiting", state: refused ? "refused" : action.submittedAt ? "now" : "todo" },
    action.appliedAt
      ? { role: "Applied", name: action.appliedBy?.name ?? "Someone", note: day(action.appliedAt), state: "done" }
      : { role: "Applies", name: "Not applied", state: action.status === "APPROVED" ? "now" : "todo" },
  ];
}

export default function IncidentRecordPage() {
  const id = useParams<{ id: string }>()?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingNotes, setEditingNotes] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [logOpen, setLogOpen] = React.useState(false);
  const [form, setForm] = React.useState({ actionType: "WARNING" as DisciplinaryActionRecord["actionType"], summary: "", penalty: "", currency: "USD", notes: "" });
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [rejectNote, setRejectNote] = React.useState("");

  const incidentQuery = useQuery({
    queryKey: ["hr-incident", id],
    queryFn: () => fetchJson<HrIncidentRecord>(`/api/hr/incidents/${id}`),
    enabled: Boolean(id),
  });
  const actionsQuery = useQuery({
    queryKey: ["disciplinary-actions", id],
    queryFn: async () => (await fetchJson<{ data: DisciplinaryActionRecord[] }>(`/api/hr/disciplinary-actions?incidentId=${id}&limit=50`)).data ?? [],
    enabled: Boolean(id),
  });
  const incident = incidentQuery.data;
  const actions = actionsQuery.data ?? [];

  const failed = (error: unknown) => toast({ title: getApiErrorMessage(error), variant: "destructive" });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["hr-incident", id] });
    void queryClient.invalidateQueries({ queryKey: ["disciplinary-actions", id] });
    void queryClient.invalidateQueries({ queryKey: ["hr-incidents"] });
  };

  const update = useMutation({
    mutationFn: (patch: Partial<HrIncidentRecord>) => fetchJson(`/api/hr/incidents/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      toast({ title: "Saved" });
      setEditingNotes(false);
      refresh();
    },
    onError: failed,
  });

  const transition = useMutation({
    mutationFn: ({ actionId, action, body }: { actionId: string; action: "submit" | "approve" | "apply" | "reject"; body?: Record<string, unknown> }) =>
      fetchJson(`/api/hr/disciplinary-actions/${actionId}/${action}`, { method: "POST", body: JSON.stringify(body ?? {}) }),
    onSuccess: (_, variables) => {
      toast({ title: ACTION_DONE[variables.action] });
      setRejecting(null);
      setRejectNote("");
      refresh();
    },
    onError: failed,
  });

  const log = useMutation({
    mutationFn: () =>
      fetchJson("/api/hr/disciplinary-actions", {
        method: "POST",
        body: JSON.stringify({
          incidentId: id,
          employeeId: incident?.employee.id,
          actionType: form.actionType,
          summary: form.summary.trim(),
          penaltyAmount: Number(form.penalty) || 0,
          penaltyCurrency: form.currency,
          notes: form.notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Action logged" });
      setLogOpen(false);
      setForm({ actionType: "WARNING", summary: "", penalty: "", currency: "USD", notes: "" });
      refresh();
    },
    onError: failed,
  });

  if (incidentQuery.isLoading) return <BooksLoading />;
  if (incidentQuery.error || !incident) {
    return <BooksError what="The incident" error={incidentQuery.error} onRetry={() => void incidentQuery.refetch()} />;
  }

  const set = (status: HrIncidentRecord["status"]) => update.mutate({ status });
  const menu: MenuEntry[] = [
    ...(incident.status !== "OPEN" ? [{ key: "open", label: "Reopen", icon: "history" as const, onSelect: () => set("OPEN") }] : []),
    ...(incident.status === "UNDER_REVIEW" ? [{ key: "close", label: "Close incident", icon: "done" as const, onSelect: () => set("CLOSED") }] : []),
  ];
  const primary =
    incident.status === "OPEN"
      ? { label: "Start review", icon: "check" as const, onClick: () => set("UNDER_REVIEW") }
      : incident.status === "UNDER_REVIEW"
      ? { label: "Close incident", icon: "done" as const, onClick: () => set("CLOSED") }
      : undefined;

  const side = (
    <>
      <BkBlock icon="person" title="Employee">
        <Person name={incident.employee.name} sub={incident.employee.employeeId}>
          <Link href={`/people/${incident.employee.id}`}>{incident.employee.name}</Link>
        </Person>
      </BkBlock>
      <BkBlock icon="sites" title="Where">
        <p>{incident.site?.name ?? "No site"}</p>
      </BkBlock>
    </>
  );

  return (
    <>
      <PageChrome title={incident.title} backHref="/people/incidents" backLabel="Incidents" primary={primary}>
        {menu.length ? <MenuButton items={menu} label="More" /> : null}
      </PageChrome>

      <BkPage screen="incident-record" scroll={false}>
        <BkRecord side={side}>
          <BkRecordHead
            title={incident.title}
            meta={[
              <St key="s" tone={STATUS_TONE[incident.status]}>
                {STATUS_LABEL[incident.status]}
              </St>,
              <St key="v" tone={SEVERITY_TONE[incident.severity]}>
                {SEVERITY_LABEL[incident.severity]}
              </St>,
              CATEGORY_LABELS[incident.category],
              day(incident.incidentDate),
            ]}
          />

          <BkFacts
            items={[
              { label: "Reported by", value: incident.reportedBy?.name ?? "System" },
              { label: "Logged", value: day(incident.createdAt), mono: true },
              { label: "Closed", value: incident.resolvedAt ? day(incident.resolvedAt) : "Not yet", mono: true },
              { label: "Actions", value: actions.length, mono: true },
            ]}
          />

          <BkBlock icon="docs" title="What happened">
            <p>{incident.description}</p>
          </BkBlock>

          <BkBlock icon="pen" title="Investigation notes">
            {editingNotes ? (
              <>
                <TextArea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                <ButtonGroup>
                  <Button variant="quiet" onClick={() => setEditingNotes(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" busy={update.isPending} onClick={() => update.mutate({ investigationNotes: notes })}>
                    Save notes
                  </Button>
                </ButtonGroup>
              </>
            ) : (
              <>
                <p className={incident.investigationNotes ? undefined : "muted"}>{incident.investigationNotes || "None yet."}</p>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setNotes(incident.investigationNotes ?? "");
                    setEditingNotes(true);
                  }}
                >
                  Edit notes
                </Button>
              </>
            )}
          </BkBlock>

          <BkSectionHead title="Disciplinary actions" sum={actions.length}>
            <Button icon="add" onClick={() => setLogOpen(true)}>
              Log an action
            </Button>
          </BkSectionHead>

          {actionsQuery.isLoading ? (
            <BkLoading rows={3} />
          ) : actions.length === 0 ? (
            <BkEmpty>No actions logged.</BkEmpty>
          ) : (
            actions.map((action) => (
              <BkBlock
                key={action.id}
                icon="incidents"
                title={ACTION_LABEL[action.actionType]}
                meta={
                  <>
                    <St tone={ACTION_TONE[action.status]}>{ACTION_STATUS_LABEL[action.status]}</St>
                    {action.penaltyAmount > 0 ? (
                      <>
                        {" "}
                        <Amt value={action.penaltyAmount} currency={action.penaltyCurrency} /> <span className="muted">{PENALTY_LABEL[action.penaltyStatus]}</span>
                      </>
                    ) : null}
                  </>
                }
              >
                <p>{action.summary}</p>
                {action.notes ? <p className="muted">{action.notes}</p> : null}
                <BkApproval steps={stepsOf(action)} />

                {rejecting === action.id ? (
                  <Field label="Why is it rejected?">
                    <Input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} autoFocus />
                    <ButtonGroup>
                      <Button variant="quiet" onClick={() => setRejecting(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        busy={transition.isPending}
                        disabled={!rejectNote.trim()}
                        onClick={() => transition.mutate({ actionId: action.id, action: "reject", body: { note: rejectNote.trim() } })}
                      >
                        Reject
                      </Button>
                    </ButtonGroup>
                  </Field>
                ) : (
                  <ButtonGroup>
                    {action.status === "DRAFT" || action.status === "REJECTED" ? (
                      <Button busy={transition.isPending} onClick={() => transition.mutate({ actionId: action.id, action: "submit" })}>
                        Send for approval
                      </Button>
                    ) : null}
                    {action.status === "SUBMITTED" ? (
                      <>
                        <Button variant="quiet" onClick={() => setRejecting(action.id)}>
                          Reject
                        </Button>
                        <Button variant="primary" busy={transition.isPending} onClick={() => transition.mutate({ actionId: action.id, action: "approve" })}>
                          Approve
                        </Button>
                      </>
                    ) : null}
                    {action.status === "APPROVED" && action.penaltyAmount > 0 ? (
                      <MenuButton
                        variant="primary"
                        label="How the penalty is settled"
                        items={PENALTY_CHOICES.map((choice) => ({
                          key: choice.value,
                          label: choice.label,
                          onSelect: () => transition.mutate({ actionId: action.id, action: "apply", body: { penaltyStatus: choice.value } }),
                        }))}
                      >
                        Apply
                      </MenuButton>
                    ) : null}
                    {action.status === "APPROVED" && action.penaltyAmount <= 0 ? (
                      <Button variant="primary" busy={transition.isPending} onClick={() => transition.mutate({ actionId: action.id, action: "apply" })}>
                        Apply
                      </Button>
                    ) : null}
                  </ButtonGroup>
                )}
              </BkBlock>
            ))
          )}
        </BkRecord>
      </BkPage>

      <Drawer
        open={logOpen}
        onOpenChange={setLogOpen}
        title="Log an action"
        sub={incident.title}
        footer={
          <>
            <Button variant="quiet" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" busy={log.isPending} disabled={!form.summary.trim()} onClick={() => log.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <DrawerSection title="Action">
          <Field label="Kind">
            <Select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value as DisciplinaryActionRecord["actionType"] })}>
              {(Object.keys(ACTION_LABEL) as Array<DisciplinaryActionRecord["actionType"]>).map((value) => (
                <option key={value} value={value}>
                  {ACTION_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Summary">
            <Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </Field>
          <Field label="Penalty" optional>
            <Input type="number" min="0" step="0.01" value={form.penalty} onChange={(e) => setForm({ ...form, penalty: e.target.value })} />
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </Field>
          <Field label="Notes" optional>
            <TextArea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </DrawerSection>
      </Drawer>
    </>
  );
}
