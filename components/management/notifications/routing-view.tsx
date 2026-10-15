import * as React from "react";
import Link from "next/link";

import { Check, Finding, Icon, Select } from "@/components/core";
import { KitPage } from "@/components/management/ui";
import type { RoutingGroup } from "@/lib/inbox/routing";
import { SENT_CHANNELS, type MatrixRow, type SentChannel } from "@/lib/inbox/settings";
import { QUIET_HOURS, quietLabel } from "@/lib/vane/settings";

import styles from "./routing.module.css";

export type RoutingData = {
  kinds: MatrixRow[];
  workspaceName: string;
  quiet: { from: string; to: string };
  canChangeQuiet: boolean;
};

export type KindChange = { kind: string; channel: SentChannel; enabled: boolean };

const GROUPS: Array<{ key: RoutingGroup; label: string }> = [
  { key: "needs", label: "Needs you" },
  { key: "updates", label: "Updates" },
];

const CHANNEL_LABEL: Record<SentChannel, string> = { IN_APP: "in the app", EMAIL: "by email" };

export const notSent = (
  <span className={styles.none} aria-label="Not sent yet">
    —
  </span>
);

/** "Floorcode hears about 9 kinds of thing, in up to 2 places." */
export function workspaceFinding(kinds: readonly MatrixRow[], workspace: string): string {
  const heard = kinds.filter((row) => SENT_CHANNELS.some((channel) => row.on[channel])).length;
  const places = Math.max(0, ...kinds.map((row) => SENT_CHANNELS.filter((channel) => row.on[channel]).length));
  if (heard === 0) return `${workspace} hears about nothing: every kind is off.`;
  return `${workspace} hears about ${heard === 1 ? "1 kind of thing" : `${heard} kinds of thing`}, in up to ${places} ${places === 1 ? "place" : "places"}.`;
}

/** The kind × channel matrix the workspace's and a person's pages share: a check per kind on each channel sent. */
export function KindMatrix({
  kinds,
  saving,
  onChange,
  disabledWhy,
}: {
  kinds: readonly MatrixRow[];
  saving: boolean;
  onChange: (change: KindChange) => void;
  /** On a person's page: why a box cannot be ticked (the workspace turned the kind off there). */
  disabledWhy?: (row: MatrixRow, channel: SentChannel) => string | null;
}) {
  return (
    <div className={`${styles.matrix} ${styles.scroll}`}>
      <table className="mx">
        <thead>
          <tr>
            <th style={{ width: "52%" }}>
              <span className="sr-only">Kind</span>
            </th>
            <th>In the app</th>
            <th>Email</th>
            <th>WhatsApp</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => {
            const rows = kinds.filter((row) => row.group === group.key);
            if (rows.length === 0) return null;
            return (
              <React.Fragment key={group.key}>
                <tr className="g">
                  <td colSpan={5}>{group.label}</td>
                </tr>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <b>{row.label}</b>
                      <span className="s">{row.note}</span>
                    </td>
                    {SENT_CHANNELS.map((channel) => {
                      const why = disabledWhy?.(row, channel) ?? null;
                      return (
                        <td key={channel} title={why ?? undefined}>
                          <Check
                            aria-label={`${row.label} ${CHANNEL_LABEL[channel]}`}
                            checked={row.on[channel] && !why}
                            disabled={saving || Boolean(why)}
                            onCheckedChange={(enabled) => onChange({ kind: row.key, channel, enabled })}
                          />
                        </td>
                      );
                    })}
                    <td>{notSent}</td>
                    <td>{notSent}</td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Management → Notifications (MgmtNotifications): each kind of notification
 * on each channel, on or off for the whole workspace, and Vane's quiet hours.
 * Pure: the page feeds it and saves each change.
 */
export function RoutingPageView({
  data,
  saving,
  onChange,
  onQuiet,
}: {
  data: RoutingData;
  saving: boolean;
  onChange: (change: KindChange) => void;
  onQuiet: (from: string, to: string) => void;
}) {
  const quiet = quietLabel(data.quiet.from, data.quiet.to);
  const options = QUIET_HOURS.some((hours) => quietLabel(hours.from, hours.to) === quiet)
    ? QUIET_HOURS
    : [{ from: data.quiet.from, to: data.quiet.to }, ...QUIET_HOURS];

  return (
    <KitPage title="Notifications" mark={<Icon name="bell" />} width={1120}>
      <div className={styles.finding}>
        <Finding
          fact={`${workspaceFinding(data.kinds, data.workspaceName)} Anything someone did themselves never notifies them.`}
          rest={
            <>
              A kind off here reaches nobody there; each person turns more off in their own{" "}
              <Link href="/preferences/notifications">Notifications</Link>.
            </>
          }
        />
      </div>
      <KindMatrix kinds={data.kinds} saving={saving} onChange={onChange} />
      <p className={styles.foot}>WhatsApp and the phone are not sent yet.</p>
      <div className={`lset ${styles.when}`}>
        <div>
          <h2>When</h2>
          <p className="aside">Quiet hours hold Vane’s issues until the morning.</p>
        </div>
        <div>
          <div className="srow">
            <Icon name="moon" />
            <label htmlFor="notify-quiet">
              <b>Quiet hours</b>
              <span className="s">Vane holds its issues back in this time; other notifications arrive as they happen</span>
            </label>
            <Select
              id="notify-quiet"
              className={styles.quiet}
              value={`${data.quiet.from}-${data.quiet.to}`}
              disabled={!data.canChangeQuiet || saving}
              onChange={(event) => {
                const [from, to] = event.target.value.split("-");
                onQuiet(from, to);
              }}
            >
              {options.map((hours) => (
                <option key={`${hours.from}-${hours.to}`} value={`${hours.from}-${hours.to}`}>
                  {quietLabel(hours.from, hours.to)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </KitPage>
  );
}
