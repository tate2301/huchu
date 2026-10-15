"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Button, ButtonLink, Finding, Icon, Switch } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { KitPage } from "@/components/management/ui";
import { fetchActivityPage } from "@/lib/activity/api";
import type { ReportSettingSummary } from "@/lib/reports/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => {
  const at = new Date(iso);
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
};

type Offered = "any" | "on" | "off";
const OFFERED_LABEL: Record<Offered, string> = { any: "Offered and not", on: "Offered", off: "Not offered" };

export type ReportsSettingsPatch = { enabled?: boolean; layout?: null; view?: null };

/** "12 of 14 reports are offered here. Site visit answers and Projects are off. Deals and Invoices have pages arranged for Floorcode." */
export function settingsFinding(rows: ReportSettingSummary[], workspace: string): { fact: string; rest: string | null } {
  const on = rows.filter((row) => row.enabled).length;
  const fact = rows.length === 0 ? "This workspace has no reports to offer." : `${on} of ${rows.length} reports are offered here.`;
  const names = (list: ReportSettingSummary[]) =>
    list.length <= 2 ? list.map((row) => row.title).join(" and ") : `${list.slice(0, 2).map((row) => row.title).join(", ")} and ${list.length - 2} more`;
  const off = rows.filter((row) => !row.enabled);
  const arranged = rows.filter((row) => row.arranged);
  const parts: string[] = [];
  if (off.length) parts.push(`${names(off)} ${off.length === 1 ? "is" : "are"} off.`);
  if (arranged.length) parts.push(`${names(arranged)} ${arranged.length === 1 ? "has a page" : "have pages"} arranged for ${workspace}.`);
  return { fact, rest: parts.length ? parts.join(" ") : null };
}

/** The chosen report's Activity, from the log, as the board lists it. */
function Activity({ settingId }: { settingId: string | null }) {
  const { data } = useQuery({
    queryKey: ["activity", "record", "ReportSetting", settingId],
    queryFn: () => fetchActivityPage({ entityType: "ReportSetting", entityId: settingId! }),
    enabled: Boolean(settingId),
    retry: false,
  });
  const entries = (data?.entries ?? []).slice(0, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 6 }}>
      <span className="sec-title">Activity</span>
      {entries.length ? (
        <dl className="attrs">
          {entries.map((entry) => (
            <React.Fragment key={entry.id}>
              <dt>{[entry.actor?.name, entry.summary.charAt(0).toLowerCase() + entry.summary.slice(1)].filter(Boolean).join(" ")}</dt>
              <dd>{shortDate(entry.createdAt)}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : (
        <span className="muted">Nothing changed here yet.</span>
      )}
    </div>
  );
}

/** The chosen report: whether it is offered, what it reads, its page and its starting view. */
function ReportAside({
  row,
  saving,
  onChange,
  onArrange,
  onClose,
  wide,
}: {
  row: ReportSettingSummary;
  saving: boolean;
  onChange: (patch: ReportsSettingsPatch) => void;
  onArrange: () => void;
  onClose: () => void;
  wide: boolean;
}) {
  return (
    <aside className="kaside" aria-label={row.title} style={{ width: wide ? 400 : "100%" }}>
      {wide ? null : (
        <span>
          <Button variant="quiet" icon="back" onClick={onClose}>
            Reports
          </Button>
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="truncate" style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>
          {row.title}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <ButtonLink size="sm" icon="reports" href={`/reports/${row.key}`}>
            Open the report
          </ButtonLink>
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <b id={`offered-${row.key}`} style={{ fontWeight: 500, color: "var(--color-ink)" }}>
            Offered
          </b>
          <span className="muted" style={{ fontSize: 13 }}>
            {row.enabled
              ? `Off: nobody here sees ${row.title} in Reports.${row.page ? ` Its page in ${row.page} stays.` : ""}`
              : `On: ${row.title} is listed in Reports again.`}
          </span>
        </span>
        <Switch ink checked={row.enabled} disabled={saving} labelledBy={`offered-${row.key}`} onCheckedChange={(enabled) => onChange({ enabled })} />
      </div>
      <dl className="attrs">
        <dt>Area</dt>
        <dd>{row.area}</dd>
        <dt>Reads</dt>
        <dd>{row.key}</dd>
        <dt>Who can open it</dt>
        <dd>{row.page ? `Anyone who can open ${row.page}` : "Anyone who can open its page"}</dd>
      </dl>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
        <span className="sec-title">Page</span>
        <span>{row.arranged ? `Arranged for this workspace${row.changedAt ? `, ${shortDate(row.changedAt)}` : ""}` : "The report's own"}</span>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" icon="grid" onClick={onArrange}>
            Arrange the page
          </Button>
          <Button size="sm" disabled={saving || !row.arranged} onClick={() => onChange({ layout: null })}>
            Go back to its own
          </Button>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
        <span className="sec-title">Starting view for everyone</span>
        <span>{row.viewSaved ? "Saved for this workspace, from the report" : "The report's own. Set it up on the report, then make it the starting view."}</span>
        <span>
          <Button size="sm" disabled={saving || !row.viewSaved} onClick={() => onChange({ view: null })}>
            Clear the starting view
          </Button>
        </span>
      </div>
      <Activity settingId={row.settingId} />
    </aside>
  );
}

/**
 * Management → Reports (PageReportsSettings): which reports this workspace
 * offers and how each opens. The list with its finding and filters, and the
 * chosen report beside it. Pure: the page feeds it.
 */
export function ReportsSettingsPageView({
  rows,
  workspace,
  saving,
  onChange,
  onArrange,
}: {
  rows: ReportSettingSummary[];
  workspace: string;
  saving: boolean;
  onChange: (key: string, patch: ReportsSettingsPatch) => void;
  onArrange: (key: string) => void;
}) {
  const [searching, setSearching] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [area, setArea] = React.useState<string | null>(null);
  const [offered, setOffered] = React.useState<Offered>("any");
  const [selected, setSelected] = React.useState<string | null>(null);
  const wide = useWide();

  const areas = [...new Set(rows.map((row) => row.area))];
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (row) =>
      (!area || row.area === area) &&
      (offered === "any" || row.enabled === (offered === "on")) &&
      (!needle || `${row.title} ${row.area}`.toLowerCase().includes(needle)),
  );
  // On a wide screen one report is always open beside the list; on a phone the list comes first.
  const chosen = shown.find((row) => row.key === selected) ?? (wide ? shown[0] : undefined) ?? null;
  const off = rows.filter((row) => !row.enabled).length;
  const finding = settingsFinding(rows, workspace);

  const list = (
    <div className="kbody">
      <Finding fact={finding.fact} rest={finding.rest} />
      <div className="ws-tools" style={{ flexWrap: "wrap" }}>
        {searching || q ? (
          <label className="input-wrap ws-find">
            <Icon name="search" />
            <input
              type="search"
              autoFocus
              aria-label="Report or area"
              placeholder="Report or area"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onBlur={() => setSearching(false)}
            />
          </label>
        ) : (
          <Button icon="search" onClick={() => setSearching(true)}>
            Report or area
          </Button>
        )}
        <MenuButton
          className="chipsel"
          icon="filter"
          label="Area"
          items={[
            { key: "any", label: "Every area", checked: !area, onSelect: () => setArea(null) },
            { separator: true },
            ...areas.map((name) => ({ key: name, label: name, checked: area === name, onSelect: () => setArea(name) })),
          ]}
        >
          {area ?? "Every area"}
        </MenuButton>
        <MenuButton
          className="chipsel"
          icon="eye"
          label="Offered"
          items={(Object.keys(OFFERED_LABEL) as Offered[]).map((key) => ({
            key,
            label: OFFERED_LABEL[key],
            checked: offered === key,
            onSelect: () => setOffered(key),
          }))}
        >
          {OFFERED_LABEL[offered]}
        </MenuButton>
        <div className="end">
          <span className="ws-n">
            {rows.length} reports · {off} off
          </span>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="muted" style={{ padding: "var(--space-24)" }}>
          {rows.length ? "No report matches. Clear the search or the filters to see the rest." : "No reports for this workspace."}
        </p>
      ) : (
        <div className="wt" style={{ flex: "none" }}>
          <table className="table" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "50%" }} />
              <col style={{ width: "50%" }} />
              {wide ? <col style={{ width: 130 }} /> : null}
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Report</th>
                <th>Area</th>
                {wide ? <th>Page</th> : null}
                <th>Offered</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr
                  key={row.key}
                  aria-selected={chosen?.key === row.key || undefined}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(row.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSelected(row.key);
                  }}
                >
                  <td className="fill">
                    <span className="cell-lead">{row.title}</span>
                  </td>
                  <td className="fill muted">{row.area}</td>
                  {wide ? <td className="muted">{row.arranged ? "Arranged here" : "Its own"}</td> : null}
                  <td>
                    <span className={row.enabled ? "status status-success" : "status"}>{row.enabled ? "On" : "Off"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const aside = chosen ? (
    <ReportAside
      row={chosen}
      saving={saving}
      wide={wide}
      onChange={(patch) => onChange(chosen.key, patch)}
      onArrange={() => onArrange(chosen.key)}
      onClose={() => setSelected(null)}
    />
  ) : null;

  return (
    <KitPage title="Reports" mark={<Icon name="reports" />} flush>
      <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
        {wide ? (
          <>
            {list}
            {aside}
          </>
        ) : (
          (aside ?? list)
        )}
      </div>
    </KitPage>
  );
}

/** Below 900px the list and the chosen report take turns, as Management's other registers do. */
function useWide() {
  const [wide, setWide] = React.useState(true);
  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return wide;
}
