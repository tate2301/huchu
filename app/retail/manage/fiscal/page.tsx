"use client";

import "./fiscal.css";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { settingsQueryKey } from "@/components/settings-frame/model";
import { SettingsFrame } from "@/components/settings-frame/settings-frame";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/workspace/button";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import type { SettingsResponse, SettingsSaved } from "@/lib/retail/settings-pages";

/**
 * Setup › Fiscal device (W-06, board FiscalSettings): the shop's ZIMRA device
 * and its numbers, how the fiscal day closes and what the tills do while
 * ZIMRA cannot be reached, on the SettingsFrame; the newest five fiscal days
 * in the aside. The owner connects the device with ZIMRA's activation key,
 * tests it with a receipt that is signed and never sent, and closes the open
 * day by hand. The manager and the bookkeeper read it.
 */
export default function FiscalSettingsPage() {
  const { data: session } = useSession();
  const canChange = canRetailRoleDo(session?.user?.role ?? "", "retail.fiscal", "update");
  return (
    <SettingsFrame
      page="fiscal"
      actions={(values, form) => (canChange ? <FiscalActions values={values} form={form} /> : null)}
      slots={(values) => ({ days: <FiscalDays days={values.days} /> })}
    />
  );
}

type OpenDay = { id: string; no: number; openedAt: string; status: string };

function FiscalActions({
  values,
  form,
}: {
  values: Record<string, unknown>;
  form: { formId: string; changes: Record<string, unknown>; saving: boolean };
}) {
  const openDay = (values.openDay as OpenDay | null) ?? null;
  if (values.registered !== true) {
    // Not connected yet: "Connect" saves the device's numbers, then registers it with the key typed.
    const key = typeof values.activationKey === "string" ? values.activationKey.trim() : "";
    return (
      <Button type="submit" form={form.formId} busy={form.saving} disabled={!key}>
        Connect
      </Button>
    );
  }
  return (
    <>
      <TestReceipt />
      {openDay ? <CloseDay day={openDay} /> : null}
    </>
  );
}

/** "Test a receipt": the device signs a zero-value receipt here and ZIMRA is asked how the device stands. */
function TestReceipt() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const result = await fetchJson<{ ok: boolean; message: string; ms: number }>("/api/v2/retail/fiscal/test", {
        method: "POST",
      });
      toast({
        title: result.message,
        description: `${(result.ms / 1000).toFixed(1)} s`,
        variant: result.ok ? "success" : "destructive",
      });
    } catch (error) {
      toast({ title: getApiErrorMessage(error, "The test did not run. Try again."), variant: "destructive" });
    } finally {
      setBusy(false);
      // The connection line reads the answer (or the silence) the test met.
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey("fiscal") });
    }
  };
  return (
    <Button busy={busy} onClick={() => void run()}>
      Test a receipt
    </Button>
  );
}

/** "Close day {n}", asked first: the Z-report goes to ZIMRA, and the next sale opens the next day. */
function CloseDay({ day }: { day: OpenDay }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [asking, setAsking] = React.useState(false);
  const close = async () => {
    try {
      const saved = await fetchJson<SettingsSaved>(`/api/v2/retail/fiscal/days/${encodeURIComponent(day.id)}/close`, {
        method: "POST",
      });
      queryClient.setQueryData<SettingsResponse>(settingsQueryKey("fiscal"), (current) => ({
        canEdit: current?.canEdit ?? false,
        values: saved.values,
        lastChanged: saved.lastChanged,
      }));
      toast({ title: `Day ${day.no} is closed and ZIMRA has its report.`, variant: "success" });
    } catch (error) {
      // The day may now be closing: show it as it stands.
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey("fiscal") });
      throw new Error(getApiErrorMessage(error, `Day ${day.no} did not close. Try again.`));
    }
  };
  return (
    <>
      <Button onClick={() => setAsking(true)}>{`Close day ${day.no}`}</Button>
      <ConfirmDialog
        ask={{
          title: `Close day ${day.no}?`,
          body: `The Z-report goes to ZIMRA, and the next sale opens day ${day.no + 1}.`,
          keep: "Keep it open",
          go: "Close the day",
          fill: "action",
        }}
        open={asking}
        onOpenChange={setAsking}
        onConfirm={close}
      />
    </>
  );
}

/** The aside's "Fiscal days": the newest five, the day's number, what it is, what it took. */
function FiscalDays({ days }: { days: unknown }) {
  const list = Array.isArray(days) ? (days as Array<{ no: number; label: string; total: string }>) : [];
  if (list.length === 0) return <p className="cx-fiscal-days__empty">No fiscal days yet.</p>;
  return (
    <ul className="cx-fiscal-days">
      {list.map((day) => (
        <li key={day.no}>
          <span className="font-mono">{day.no}</span>
          <span className="cx-fiscal-days__label">{day.label}</span>
          <span className="cx-fiscal-days__total font-mono">
            {day.total.split(" · ").map((part, index) => (
              <React.Fragment key={part}>
                {index > 0 ? " · " : null}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
