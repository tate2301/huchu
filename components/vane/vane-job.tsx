"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";

import { Button, Kit, TextArea, useShortcut, VaneMark } from "@/components/core";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";

import { PlanFacts, PlanSteps } from "./plan-parts";
import { moduleForPath, useVaneActions, useVaneJob } from "./use-vane";

/** Whether Give Vane a job is open, shared by Ctrl J, the Plans page's button and the dialog. */
let isOpen = false;
const listeners = new Set<() => void>();
function setOpen(value: boolean) {
  isOpen = value;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Opens Give Vane a job over whatever page is showing. */
export function openVaneJob() {
  setOpen(true);
}

/** Jobs a person might give Vane from this module, to start from. */
const EXAMPLES: Record<string, string[]> = {
  books: [
    "Which invoices are more than 30 days overdue, and who owes the most?",
    "What did we spend each month this year, by expense type?",
  ],
  crm: [
    "Which quotes have waited more than a week without an answer?",
    "Which deals were won this month with no invoice yet?",
  ],
  retail: ["Which tills were short at cash-up this month, and on which shifts?", "What is running low and sold well last month?"],
  reports: ["Which reports did nobody open this month?", "What changed most in sales this month against last?"],
  people: ["Who is on leave next week?", "Which employees have no national ID number on file?"],
  schools: ["Which families owe more than one term's fees?", "Which classes had the lowest attendance this term?"],
  gold: ["How did this month's production compare with last month's, by shift?"],
};
const ANYWHERE = ["Look over what is overdue and tell me what to chase first.", "What needs my attention before Friday?"];

/**
 * Give Vane a job (PageVaneJob): from anywhere with Ctrl J. The box, jobs to
 * start from for the module on screen, and Give it to Vane (Ctrl ↵), which
 * queues the job (`POST /api/vane/jobs`): it shows in Working on at once, and
 * the dialog follows it. When Vane lays out a plan, the plan waits here, with
 * what it will read and may write, for the person to change its steps and
 * press Start (Ctrl ↵); nothing in it runs before. `?job=<id>` on a page's
 * address opens it on that job. Mounted once, in the shell.
 */
export function VaneJobHost() {
  const open = React.useSyncExternalStore(subscribe, () => isOpen, () => false);
  const pathname = usePathname();
  const { toast } = useToast();
  const { giveJob, startPlan } = useVaneActions();
  const [text, setText] = React.useState("");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Array<{ id: string; label: string }> | null>(null);
  const box = React.useRef<HTMLTextAreaElement>(null);
  const job = useVaneJob(open ? jobId : null);

  useShortcut("Ctrl J", () => {
    setJobId(null);
    setEditing(null);
    setOpen(true);
  });
  // A link to it (`?job`, or `?job=<id>` for a job already given) opens it over the page it names.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("job")) return;
    setJobId(params.get("job") || null);
    setEditing(null);
    setOpen(true);
  }, [pathname]);

  const here = moduleForPath(pathname);
  const examples = (here && EXAMPLES[here]) || ANYWHERE;
  const ready = text.trim().length >= 3;
  const plan = job.data?.plan ?? null;
  const waiting = plan?.status === "waiting";

  const give = () => {
    if (!ready || giveJob.isPending) return;
    giveJob.mutate(text.trim(), {
      onSuccess: (given) => {
        toast({ title: "Vane has the job", description: "It is in Working on." });
        setText("");
        setJobId((given as { id: string }).id);
      },
      onError: (error) =>
        toast({
          title: "Vane did not get the job",
          description: getApiErrorMessage(error, "Check the connection and try again."),
          variant: "destructive",
        }),
    });
  };

  const start = () => {
    if (!plan || !waiting || startPlan.isPending) return;
    const steps = editing?.map((step) => ({ id: step.id, label: step.label.trim() }));
    if (steps?.some((step) => !step.label)) {
      toast({ title: "Each step needs a few words", variant: "destructive" });
      return;
    }
    startPlan.mutate(
      { planId: plan.id, steps },
      {
        onSuccess: () => {
          toast({ title: "The plan has started", description: "Vane takes its first step on the next tick." });
          setEditing(null);
          setJobId(null);
          setOpen(false);
        },
        onError: (error) =>
          toast({ title: "The plan did not start", description: getApiErrorMessage(error, "Try again."), variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setEditing(null);
          setJobId(null);
        }
      }}
    >
      <Dialog.Portal>
        <Kit contents>
          <Dialog.Overlay className="over is-fixed" />
          <div className="vn-dialog-place">
            <Dialog.Content
              className="dialog dialog-lg vn-job"
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                box.current?.focus();
              }}
            >
              <div className="dialog-head">
                <Dialog.Title asChild>
                  <h2>Give Vane a job</h2>
                </Dialog.Title>
                <span className="end">
                  <Dialog.Close asChild>
                    <Button variant="quiet" iconOnly icon="x" label="Close" />
                  </Dialog.Close>
                </span>
              </div>
              {jobId ? (
                <div className="dialog-scroll">
                  <div className="vn-job-asked">
                    <span className="vn-job-label">What should Vane do?</span>
                    <span className="vn-job-said">{job.data?.request ?? " "}</span>
                  </div>
                  {job.isError ? (
                    <p className="vn-quiet">That job could not be read. It may be in another workspace.</p>
                  ) : !job.data ? (
                    <p className="vn-quiet">Reading the job…</p>
                  ) : plan ? (
                    <div className="vn-job-plan">
                      <div className="vn-job-plan-h">
                        <VaneMark size={16} />
                        <span>
                          {waiting
                            ? plan.person.you
                              ? "Here is the plan. Nothing starts until you press Start."
                              : `Here is the plan. Nothing starts until ${plan.person.name ?? "the person who asked"} presses Start.`
                            : plan.status === "open"
                              ? "The plan has started. Vane’s steps run one at a time; yours wait for you."
                              : "This plan is finished."}
                        </span>
                      </div>
                      <div className="vn-job-plan-steps">
                        <PlanSteps
                          plan={plan}
                          editing={editing ? { steps: editing, onChange: setEditing } : undefined}
                        />
                      </div>
                      <PlanFacts plan={plan} />
                    </div>
                  ) : job.data.status === "failed" ? (
                    <p className="vn-quiet">Vane could not work it out: {job.data.error ?? "it stopped before it finished."}</p>
                  ) : job.data.status === "done" ? (
                    <p className="vn-quiet">{job.data.result ?? "Vane finished it."} Anything it raised is in For you.</p>
                  ) : (
                    <p className="vn-quiet">
                      Vane is working it out. If it needs more than one look, the plan shows here, and nothing starts until you press Start.
                    </p>
                  )}
                </div>
              ) : (
                <form
                  className="dialog-scroll"
                  id="vn-job-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    give();
                  }}
                >
                  <label className="vn-job-label" htmlFor="vn-job-box">
                    What should Vane do?
                  </label>
                  <TextArea
                    id="vn-job-box"
                    ref={box}
                    className="vn-job-box"
                    rows={4}
                    maxLength={2000}
                    value={text}
                    placeholder="Say it the way you would to a colleague"
                    onChange={(event) => setText(event.target.value)}
                  />
                  <div className="vn-sec">
                    <span className="sec-title">To start from</span>
                    <div className="vn-examples">
                      {examples.map((example) => (
                        <button key={example} type="button" className="btn btn-quiet vn-example" onClick={() => setText(example)}>
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="vn-note">Vane reads and drafts. It never sends, pays or changes anything: a person presses that button.</p>
                </form>
              )}
              <div className="dialog-foot">
                <Dialog.Close asChild>
                  <Button>{jobId && !waiting ? "Close" : "Cancel"}</Button>
                </Dialog.Close>
                {!jobId ? (
                  <Button variant="primary" shortcut="Ctrl ↵" type="submit" form="vn-job-form" busy={giveJob.isPending} disabled={!ready}>
                    Give it to Vane
                  </Button>
                ) : plan && waiting && plan.person.you ? (
                  <>
                    <Button
                      icon="edit"
                      aria-pressed={Boolean(editing)}
                      onClick={() => setEditing(editing ? null : plan.steps.map((step) => ({ id: step.id, label: step.label })))}
                    >
                      {editing ? "Keep Vane’s steps" : "Change the steps"}
                    </Button>
                    <Button variant="primary" shortcut="Ctrl ↵" busy={startPlan.isPending} onClick={start}>
                      Start
                    </Button>
                  </>
                ) : null}
              </div>
            </Dialog.Content>
          </div>
        </Kit>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
