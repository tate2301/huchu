"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Banner, Button, Empty, Field, Finding, Input, Kit, KitScreen, SelectCell, TableFoot, TableShell, TextArea, VaneMark } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatSchoolMoney } from "@/lib/schools/format";
import type { ReminderDraft } from "@/lib/schools/vane-reminders";
import type { VaneActionView } from "@/lib/vane/actions/engine";

/** Figures keep their width; the name column takes the rest. */
const NUM = { width: "9rem" } as const;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const sentence = (text: string) => (text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text);

/**
 * Fee reminders Vane drafted (the PageVaneSchool board). Every family who
 * owes is listed, ticked unless Vane left them out and said why. The person
 * ticks and unticks, changes the words once for every family, and sends;
 * or discards the drafts. Sending is approving Vane's action: it runs as them.
 */
export function VaneRemindersContent({ draft }: { draft: ReminderDraft }) {
  const router = useRouter();
  const { toast } = useToast();
  const { params, unreachable, noGuardian } = draft;
  const [action, setAction] = React.useState<VaneActionView>(draft.action);
  const [subject, setSubject] = React.useState(params.subject);
  const [body, setBody] = React.useState(params.body);
  const [skip, setSkip] = React.useState<ReadonlySet<string>>(() => new Set(params.skip));
  const [busy, setBusy] = React.useState<"send" | "discard" | null>(null);
  const ids = { subject: React.useId(), body: React.useId() };

  const open = action.status === "proposed" || action.status === "failed";
  const ticked = params.families.filter((family) => !skip.has(family.studentId));
  const money = (n: number) => formatSchoolMoney(n, params.currency);
  const owedAll = params.families.reduce((sum, family) => sum + family.owed, 0);
  const owedTicked = ticked.reduce((sum, family) => sum + family.owed, 0);
  const left = params.families.filter((family) => skip.has(family.studentId));
  const why = left.find((family) => family.why)?.why;
  const noPortal = new Set(unreachable);
  const noOne = new Set(noGuardian);
  // Who owes most first, then by name.
  const families = React.useMemo(() => [...params.families].sort((a, b) => b.owed - a.owed || a.family.localeCompare(b.family)), [params.families]);

  const toggle = (studentId: string) =>
    setSkip((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  const decide = async (approve: boolean) => {
    setBusy(approve ? "send" : "discard");
    try {
      const decided = await fetchJson<{ action: VaneActionView }>(`/api/vane/actions/${action.id}`, {
        method: "POST",
        body: JSON.stringify(approve ? { approve: true, changes: { subject, body, skip: [...skip] } } : { approve: false }),
      });
      setAction(decided.action);
      toast({ title: approve ? (decided.action.result ?? "Sent.") : "The drafts are discarded", variant: decided.action.status === "failed" ? "destructive" : "success" });
      router.refresh();
    } catch (error) {
      toast({ title: approve ? "The reminders did not go" : "They were not discarded", description: getApiErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageChrome
        title="Remind families"
        backHref="/schools/finance/arrears"
        backLabel="Arrears"
        primary={
          open
            ? {
                label: `Send ${plural(ticked.length, "reminder", "reminders")}`,
                icon: "send",
                shortcut: "S",
                onClick: () => void decide(true),
                disabled: busy ? "Sending" : ticked.length === 0 ? "Tick at least one family" : !subject.trim() || !body.trim() ? "Write the reminder first" : undefined,
              }
            : null
        }
      >
        {action.status === "proposed" ? (
          <Button icon="x" disabled={busy !== null} onClick={() => void decide(false)}>
            Discard the drafts
          </Button>
        ) : null}
      </PageChrome>
      <Kit className="kit-main">
        <KitScreen slug="schools-vane-reminders">
          <div className="mn" style={{ flex: 1, minHeight: 0 }}>
            <div className="kbody">
              {action.status === "done" || action.status === "denied" || action.status === "failed" ? (
                <Banner tone={action.status === "failed" ? "danger" : undefined} icon={action.status === "done" ? "done" : "warn"}>
                  {action.status === "denied"
                    ? `Discarded${action.decidedBy ? ` by ${action.decidedBy}` : ""}. Nothing went.`
                    : `${action.result ?? ""}${action.status === "done" && action.decidedBy ? ` Sent by ${action.decidedBy}.` : ""}`}
                </Banner>
              ) : null}
              <Finding
                fact={`${plural(params.families.length, "family has", "families have")} not paid ${params.term} fees, ${money(owedAll)} between them. Vane drafted a reminder for each.`}
                rest={left.length ? `${plural(left.length, "is", "are")} unticked${why ? `: ${why}` : ""}.` : undefined}
              />
              <section aria-label="The reminder" style={{ display: "flex", flexDirection: "column", gap: "var(--space-12)", padding: "0 var(--space-24) var(--space-16)" }}>
                <span className="sec-title">
                  <VaneMark size={16} />
                  The reminder Vane drafted
                </span>
                <Field label="Subject" htmlFor={ids.subject}>
                  <Input id={ids.subject} value={subject} disabled={!open || busy !== null} onChange={(event) => setSubject(event.target.value)} />
                </Field>
                <Field
                  label="Words"
                  htmlFor={ids.body}
                  help={`[family], [pupil] and [amount] become each family's own. Change the words here; it changes all ${params.families.length}.`}
                >
                  <TextArea id={ids.body} rows={4} value={body} disabled={!open || busy !== null} onChange={(event) => setBody(event.target.value)} />
                </Field>
              </section>
              <TableShell
                label="Families"
                foot={<TableFoot range={`${ticked.length} of ${params.families.length} ticked`} sums={[{ label: "Owed", value: money(owedTicked) }]} />}
              >
                <table className="table">
                  <thead>
                    <tr>
                      <SelectCell
                        head
                        checked={skip.size === 0}
                        indeterminate={skip.size > 0 && skip.size < params.families.length}
                        onChange={() => {
                          if (open && busy === null) setSkip(skip.size === 0 ? new Set(params.families.map((family) => family.studentId)) : new Set());
                        }}
                        label="Tick every family"
                      />
                      <th>Family</th>
                      <th>Pupil</th>
                      <th className="num" style={NUM}>Owed</th>
                      <th style={{ width: "13rem" }}>Goes by</th>
                      <th style={{ width: "13rem" }}>Left out because</th>
                    </tr>
                  </thead>
                  <tbody>
                    {families.map((family) => {
                      const on = !skip.has(family.studentId);
                      return (
                        <tr key={family.studentId} aria-selected={on || undefined}>
                          <SelectCell
                            checked={on}
                            onChange={() => {
                              if (open && busy === null) toggle(family.studentId);
                            }}
                            label={`Remind ${family.family}`}
                          />
                          <td className="fill">
                            <span className="cell-lead truncate" title={family.family}>
                              {family.family}
                            </span>
                          </td>
                          <td className="fill muted">
                            <span className="truncate" title={family.pupil}>
                              {family.pupil}
                            </span>
                          </td>
                          <td className="num">{money(family.owed)}</td>
                          <td className="muted">{noOne.has(family.studentId) ? "No guardian on record" : noPortal.has(family.studentId) ? "Nobody on the portal yet" : "Portal"}</td>
                          <td className="muted">{on ? "" : family.why ? sentence(family.why) : "Unticked"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableShell>
            </div>
          </div>
        </KitScreen>
      </Kit>
    </>
  );
}

/** A role that cannot write to families: who can. */
export function VaneRemindersRefused() {
  return (
    <>
      <PageChrome title="Remind families" backHref="/schools/finance/arrears" backLabel="Arrears" />
      <Kit className="kit-main">
        <KitScreen slug="schools-vane-reminders">
          <div className="mn" style={{ flex: 1, minHeight: 0 }}>
            <Empty icon="lock" title="Reminders are the bursary’s">
              Your role cannot write to families. The bursar or the head can.
            </Empty>
          </div>
        </KitScreen>
      </Kit>
    </>
  );
}
