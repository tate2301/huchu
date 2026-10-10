"use client";

import "./posting.css";

import * as React from "react";
import { Dialog } from "radix-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { settingsQueryKey } from "@/components/settings-frame/model";
import { SettingsFrame } from "@/components/settings-frame/settings-frame";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/workspace/button";
import { Field } from "@/components/workspace/fields/field";
import { TextInput } from "@/components/workspace/fields/text-input";
import { lookupKey } from "@/components/sheet-form/lookup-field";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import type { SetupPreview } from "@/lib/retail/posting-settings";

/**
 * Setup › Posting to the books (W-65, board PostingSettings): where each
 * tender settles, the sales and stock accounts, and when the day posts, on
 * the SettingsFrame. "Post now" posts what is waiting; "Set up the accounts"
 * adds what the Zimbabwe retail pack has and the chart lacks. Owners and the
 * bookkeeper; nobody else opens it.
 */
export default function PostingSettingsPage() {
  const { data: session } = useSession();
  const canPost = canRetailRoleDo(session?.user?.role ?? "", "retail.posting", "update");
  return (
    <SettingsFrame
      page="posting"
      actions={canPost ? <PostNow /> : null}
      slots={(values) => ({
        setup: canPost ? <SetUpAccounts /> : null,
        checks: <ReadyChecks checks={values.checks} />,
      })}
    />
  );
}

type RunSlice = {
  runId: string;
  done: boolean;
  busy: boolean;
  posted: number;
  failed: number;
  waiting: number;
  run: { at: string; text: string; toast: string };
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The header's "Post now": every retail event still waiting, to the books
 * now. The server posts a few seconds at a time; the button calls again
 * until nothing is waiting, counting as it goes. Pressed while a run is
 * already going (the 23:00 job, or someone else's Post now), it follows that
 * run, waiting a moment whenever the other side's slice is posting.
 */
function PostNow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [progress, setProgress] = React.useState<{ posted: number; total: number } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const post = async () => {
    setBusy(true);
    let posted = 0;
    try {
      let slice: RunSlice | null = null;
      do {
        slice = await fetchJson<RunSlice>("/api/v2/retail/posting/run", {
          method: "POST",
          body: JSON.stringify(slice ? { runId: slice.runId } : {}),
        });
        posted = slice.posted;
        if (!slice.done) setProgress({ posted: slice.posted, total: slice.posted + slice.waiting });
        if (slice.busy) await pause(1_000);
      } while (!slice.done);
      // What could not post stays on Ready to post; the toast says so in warning.
      toast({ title: slice.run.toast, variant: slice.failed ? "warning" : "success" });
    } catch (error) {
      const fallback = posted ? `Posted ${posted} so far. The rest did not post. Try again.` : "Nothing was posted. Try again.";
      toast({ title: posted ? fallback : getApiErrorMessage(error, fallback), variant: "destructive" });
    } finally {
      setBusy(false);
      setProgress(null);
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey("posting") });
    }
  };

  return (
    <Button busy={busy} onClick={() => void post()}>
      {progress ? (
        <>
          Posting <span className="font-mono">{progress.posted}</span> of <span className="font-mono">{progress.total}</span>
        </>
      ) : (
        "Post now"
      )}
    </Button>
  );
}

/** "Ready to post": the three facts a run depends on, a warn dot on any that fails. */
function ReadyChecks({ checks }: { checks: unknown }) {
  const list = Array.isArray(checks) ? (checks as Array<{ ok: boolean; text: string }>) : [];
  return (
    <ul className="cx-posting-checks">
      {list.map((check) => (
        <li key={check.text} className={check.ok ? undefined : "is-warn"}>
          {check.text}
        </li>
      ))}
    </ul>
  );
}

type SetupAnswer = { groups: SetupPreview };

/**
 * "Set up the accounts": what the pack would add, grouped, with the ZiG and
 * rand rates to add with it, then "Add them". Nothing missing says so.
 */
function SetUpAccounts() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button className="cx-posting-setup" onClick={() => setOpen(true)}>
        Set up the accounts
      </Button>
      {open ? <SetUpDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SetUpDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [preview, setPreview] = React.useState<SetupPreview | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [rates, setRates] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const send = React.useCallback(
    (mode: "DRY_RUN" | "APPLY", fxRates?: Record<string, string>) =>
      fetchJson<SetupAnswer>("/api/v2/retail/posting/setup", {
        method: "POST",
        body: JSON.stringify({ mode, ...(fxRates ? { fxRates } : {}) }),
      }),
    [],
  );

  React.useEffect(() => {
    let live = true;
    send("DRY_RUN")
      .then((answer) => live && setPreview(answer.groups))
      .catch((error) => live && setLoadError(getApiErrorMessage(error, "What it would add did not load.")));
    return () => {
      live = false;
    };
  }, [send]);

  const add = async () => {
    setBusy(true);
    setErrors({});
    setFailure(null);
    try {
      // Only the rates it asked for: one a shop already has is not typed over.
      await send(
        "APPLY",
        Object.fromEntries((preview?.rates ?? []).map((rate) => [rate.code, (rates[rate.code] ?? "").trim()])),
      );
      toast({ title: "The accounts are set up.", variant: "success" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsQueryKey("posting") }),
        queryClient.invalidateQueries({ queryKey: lookupKey("account") }),
      ]);
      onClose();
    } catch (error) {
      const fieldErrors = error instanceof ApiError ? (error.details as { fieldErrors?: Record<string, string> })?.fieldErrors : null;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else setFailure(getApiErrorMessage(error, "The accounts were not set up. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const groups: Array<[string, string[]]> = preview
    ? [
        ["Accounts", preview.accounts],
        ["VAT codes", preview.vatCodes],
        ["Tender accounts", preview.tenderAccounts],
      ]
    : [];

  return (
    <Dialog.Root open onOpenChange={(next) => !next && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="cx-scrim" />
        <div className="cx-confirm-layer">
          <Dialog.Content className="cx-confirm cx-posting-dialog" aria-describedby={undefined}>
            <Dialog.Title className="cx-confirm__title">Set up the accounts</Dialog.Title>
            {loadError ? (
              <p role="alert" className="cx-confirm__error">
                {loadError}
              </p>
            ) : !preview ? (
              <p className="cx-confirm__body" aria-busy="true">
                Looking at what you have…
              </p>
            ) : preview.nothing ? (
              <p className="cx-confirm__body">Everything is already set up.</p>
            ) : (
              <>
                <p className="cx-confirm__body">It adds these, and nothing you already have changes.</p>
                {groups
                  .filter(([, items]) => items.length > 0)
                  .map(([title, items]) => (
                    <section key={title} className="cx-posting-dialog__group">
                      <h3>{title}</h3>
                      <ul>
                        {items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
                {preview.rates.length > 0 ? (
                  <section className="cx-posting-dialog__group">
                    <h3>Rates</h3>
                    <div className="cx-posting-dialog__rates">
                      {preview.rates.map((rate) => (
                        <Field key={rate.code} label={`US$1 is, in ${rate.label}`} optional error={errors[rate.code]}>
                          {(control) => (
                            <TextInput
                              {...control}
                              mono
                              right
                              inputMode="decimal"
                              value={rates[rate.code] ?? ""}
                              onChange={(event) => setRates((now) => ({ ...now, [rate.code]: event.target.value }))}
                            />
                          )}
                        </Field>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            )}
            {failure ? (
              <p role="alert" className="cx-confirm__error">
                {failure}
              </p>
            ) : null}
            <div className="cx-confirm__actions">
              {preview && !preview.nothing ? (
                <>
                  <Button size="field" disabled={busy} onClick={onClose}>
                    Cancel
                  </Button>
                  <Button size="field" variant="primary" busy={busy} onClick={() => void add()}>
                    Add them
                  </Button>
                </>
              ) : (
                <Button size="field" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
