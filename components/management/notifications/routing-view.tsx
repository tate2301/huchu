import * as React from "react";
import Link from "next/link";

import { Finding, Icon, Select } from "@/components/core";
import { KitPage } from "@/components/management/ui";
import { peopleLabel, routingFinding, type Reach, type Routing, type RoutingRow } from "@/lib/inbox/routing";
import { QUIET_HOURS, quietLabel } from "@/lib/vane/settings";

import styles from "./routing.module.css";

export type RoutingData = {
  routing: Routing;
  workspaceName: string;
  quiet: { from: string; to: string };
  canChangeQuiet: boolean;
};

const GROUPS: Array<{ key: RoutingRow["group"]; label: string }> = [
  { key: "needs", label: "Needs you" },
  { key: "updates", label: "Updates" },
];

/** "4 people", named on hover; "Nobody" when the kind reached no one. */
function ReachCell({ reach, channel }: { reach: Reach; channel: string }) {
  if (reach.count === 0) return <span className={styles.none}>Nobody</span>;
  return (
    <span title={reach.names.join(", ")} aria-label={`${peopleLabel(reach.count)} ${channel}: ${reach.names.join(", ")}`}>
      {peopleLabel(reach.count)}
    </span>
  );
}

const notSent = (
  <span className={styles.none} aria-label="Not sent">
    —
  </span>
);

/**
 * Management → Notifications (MgmtNotifications): each kind of notification,
 * who it reached in the last 30 days in the app and by email, and Vane's quiet
 * hours. Pure: the page feeds it.
 */
export function RoutingPageView({
  data,
  saving,
  onQuiet,
}: {
  data: RoutingData;
  saving: boolean;
  onQuiet: (from: string, to: string) => void;
}) {
  const { routing } = data;
  const quiet = quietLabel(data.quiet.from, data.quiet.to);
  const options = QUIET_HOURS.some((hours) => quietLabel(hours.from, hours.to) === quiet)
    ? QUIET_HOURS
    : [{ from: data.quiet.from, to: data.quiet.to }, ...QUIET_HOURS];

  return (
    <KitPage title="Notifications" mark={<Icon name="bell" />} width={1120}>
      <div className={styles.finding}>
        <Finding
          fact={routingFinding(routing, data.workspaceName)}
          rest={
            <>
              Who hears is set by the kind; each person turns kinds and email off in their own{" "}
              <Link href="/preferences/notifications">Notifications</Link>.
            </>
          }
        />
      </div>
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
              const rows = routing.rows.filter((row) => row.group === group.key);
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
                      <td>
                        <ReachCell reach={row.inApp} channel="in the app" />
                      </td>
                      <td>
                        <ReachCell reach={row.email} channel="by email" />
                      </td>
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
      <p className={styles.foot}>
        The last {routing.days} days. Email counts whoever has the kind and email on today. WhatsApp and phone are not sent yet.
      </p>
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
