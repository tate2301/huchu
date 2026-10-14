"use client";

import * as React from "react";

import { Button, ButtonLink, Check, Drawer, DrawerSection, Icon, Meter, VaneMark, type IconName } from "@/components/core";
import { KitPage } from "@/components/management/ui";
import { QUIET_HOURS, quietLabel, type VaneSettingsPatch, type VaneSettingsView, type VaneWatchable } from "@/lib/vane/settings";

export type VaneSettingsData = {
  settings: VaneSettingsView;
  workspaceName: string;
  watchables: VaneWatchable[];
  roles: Array<{ role: string; label: string }>;
  canChange: boolean;
};

const n = (value: number) => value.toLocaleString("en-GB");

const resetLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

function Mark({ watchable }: { watchable: VaneWatchable }) {
  if (watchable.mark.kind === "image") {
    // A product's own mark, a fixed 32px SVG.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="pm" src={watchable.mark.src} alt="" width={32} height={32} />;
  }
  return (
    <span className="mi">
      <Icon name={watchable.mark.icon} size={20} />
    </span>
  );
}

function Row({
  icon,
  mark,
  title,
  detail,
  control,
}: {
  icon?: IconName;
  mark?: React.ReactNode;
  title: string;
  detail: string;
  control: React.ReactNode;
}) {
  return (
    <div className="setting ar">
      {mark ?? (
        <span className="mi">
          <Icon name={icon ?? "general"} size={20} />
        </span>
      )}
      <span className="t">
        <b>{title}</b>
        <span>{detail}</span>
      </span>
      {control}
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="switch"
      role="switch"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

/**
 * Management → Vane (design/core-modules/html/management-vane.html): what it
 * watches, what it does, when it works, and this month against the allowance.
 * The one place the interface names Claude. Pure: the page feeds it, and the
 * fixture route feeds it the drawn data.
 */
export function VaneSettingsPageView({
  data,
  saving = false,
  onChange,
}: {
  data: VaneSettingsData;
  saving?: boolean;
  onChange: (patch: VaneSettingsPatch) => void;
}) {
  const { settings, watchables, roles, workspaceName, canChange } = data;
  const [routingOpen, setRoutingOpen] = React.useState(false);
  const [routing, setRouting] = React.useState(settings.routing);
  const locked = !canChange || saving;
  const used = settings.month.jobs;
  const share = settings.monthlyAllowance > 0 ? Math.min(100, (used / settings.monthlyAllowance) * 100) : 0;
  const quiet = quietLabel(settings.quietFrom, settings.quietTo);
  const quietOptions = QUIET_HOURS.some((hours) => quietLabel(hours.from, hours.to) === quiet)
    ? QUIET_HOURS
    : [{ from: settings.quietFrom, to: settings.quietTo }, ...QUIET_HOURS];

  return (
    <KitPage
      screen="management-vane"
      title="Vane"
      mark={<VaneMark />}
      actions={
        <ButtonLink href="/vane/done" icon="activity">
          What it did
        </ButtonLink>
      }
    >
      <div className="finding" style={{ padding: 0 }}>
        <p className="lede-figure">
          {used > 0
            ? `Vane finished ${n(used)} ${used === 1 ? "job" : "jobs"} for ${workspaceName} this month.`
            : `Vane has not finished a job for ${workspaceName} this month.`}{" "}
          <span className="q">
            It raised {n(settings.month.issues)} {settings.month.issues === 1 ? "issue" : "issues"}, and{" "}
            {n(settings.month.suggestionsTaken)} of its suggestions{" "}
            {settings.month.suggestionsTaken === 1 ? "was" : "were"} taken.
          </span>
        </p>
      </div>

      <div className="form-sec">
        <header>
          <h2>What it watches</h2>
          <p>Read only, through the same SQL as Reports.</p>
        </header>
        <div className="body" style={{ gap: 0 }}>
          {watchables.map((watchable) => (
            <Row
              key={watchable.key}
              mark={<Mark watchable={watchable} />}
              title={watchable.name}
              detail={watchable.detail}
              control={
                <Toggle
                  label={`Vane watches ${watchable.name}`}
                  checked={settings.watches[watchable.key] ?? true}
                  disabled={locked}
                  onChange={(checked) => onChange({ watches: { [watchable.key]: checked } })}
                />
              }
            />
          ))}
          <Row
            icon="person"
            title="People's pay and personal details"
            detail={settings.readsPeoplePrivate ? "Vane reads them" : "Kept from Vane"}
            control={
              <Toggle
                label="Vane watches pay and personal details"
                checked={settings.readsPeoplePrivate}
                disabled={locked}
                onChange={(checked) => onChange({ readsPeoplePrivate: checked })}
              />
            }
          />
        </div>
      </div>

      <div className="form-sec">
        <header>
          <h2>What it does</h2>
          <p>Drafts and plans wait for a person.</p>
        </header>
        <div className="body" style={{ gap: 0 }}>
          <Row
            icon="warn"
            title="Raise issues"
            detail="Short cash-ups, late payers, quotes left waiting, figures that do not add up"
            control={<Toggle label="Raise issues" checked={settings.raiseIssues} disabled={locked} onChange={(checked) => onChange({ raiseIssues: checked })} />}
          />
          <Row
            icon="list"
            title="Break work into plans"
            detail="VAT returns, month end, a big job from quote to invoice"
            control={<Toggle label="Break work into plans" checked={settings.plans} disabled={locked} onChange={(checked) => onChange({ plans: checked })} />}
          />
          <Row
            icon="pen"
            title="Draft and match"
            detail="Invoices, reminders, bank matches, report questions and insights"
            control={<Toggle label="Draft and match" checked={settings.drafts} disabled={locked} onChange={(checked) => onChange({ drafts: checked })} />}
          />
          <Row
            icon="send"
            title="Send, pay, save or change"
            detail="Never on its own. Someone presses the button each time"
            control={<span className="status">Always asks</span>}
          />
        </div>
      </div>

      <div className="form-sec">
        <header>
          <h2>When it works</h2>
          <p>All day. Quiet hours hold issues back, not work.</p>
        </header>
        <div className="body" style={{ gap: 0 }}>
          <Row
            icon="clock"
            title={settings.paused ? "Paused" : "Working"}
            detail={settings.paused ? "It starts no new job until someone resumes it" : "Checks for new records every few minutes"}
            control={
              settings.paused ? (
                <Button disabled={locked} icon="run" onClick={() => onChange({ paused: false })}>
                  Resume
                </Button>
              ) : settings.working ? (
                <span className="live">Now</span>
              ) : (
                <span className="status">Waiting</span>
              )
            }
          />
          <Row
            icon="moon"
            title="Quiet hours"
            detail="Issues found at night wait for the morning"
            control={
              <select
                className="select"
                aria-label="Quiet hours"
                disabled={locked}
                value={`${settings.quietFrom}-${settings.quietTo}`}
                onChange={(event) => {
                  const [quietFrom, quietTo] = event.target.value.split("-");
                  onChange({ quietFrom, quietTo });
                }}
              >
                {quietOptions.map((hours) => (
                  <option key={`${hours.from}-${hours.to}`} value={`${hours.from}-${hours.to}`}>
                    {quietLabel(hours.from, hours.to)}
                  </option>
                ))}
              </select>
            }
          />
          <Row
            icon="bell"
            title="Who hears about what"
            detail="Each module's issues go to the roles you choose; with none chosen, to managers"
            control={
              <Button icon="edit" disabled={locked} onClick={() => setRoutingOpen(true)}>
                Change
              </Button>
            }
          />
        </div>
      </div>

      <div className="form-sec">
        <header>
          <h2>This month</h2>
          <p>Starts again on {resetLabel(settings.month.resetsOn)}.</p>
        </header>
        <div className="body">
          <div className="use">
            <span>
              <b className="num">{n(used)}</b> of {n(settings.monthlyAllowance)} jobs
            </span>
            <span className="muted">{Math.round(share)}%</span>
          </div>
          <Meter value={share} warning={share >= 100} label={`${n(used)} of ${n(settings.monthlyAllowance)} jobs used`} />
          {share >= 100 ? (
            <p style={{ fontSize: "var(--text-13)", color: "var(--color-warning)" }}>
              The allowance is used. Vane finishes the job it is on and starts no other until{" "}
              {resetLabel(settings.month.resetsOn)}.
            </p>
          ) : null}
          <p className="muted" style={{ fontSize: "var(--text-13)" }}>
            Vane runs on Claude, made by Anthropic. Anthropic does not train its models on your data.
          </p>
        </div>
      </div>

      <Drawer
        open={routingOpen}
        onOpenChange={(open) => {
          setRoutingOpen(open);
          if (open) setRouting(settings.routing);
        }}
        title="Who hears about what"
        footer={
          <>
            <Button onClick={() => setRoutingOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              shortcut="Ctrl ↵"
              busy={saving}
              onClick={() => {
                onChange({ routing });
                setRoutingOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {[...watchables, { key: "people-private", name: "Pay and personal details" } as const].map((module) => (
          <DrawerSection key={module.key} title={`${module.name} issues`}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-12) var(--space-24)" }}>
              {roles.map(({ role, label }) => (
                <Check
                  key={role}
                  label={label}
                  checked={(routing[module.key] ?? []).includes(role)}
                  onCheckedChange={(checked) =>
                    setRouting((current) => {
                      const now = new Set(current[module.key] ?? []);
                      if (checked) now.add(role);
                      else now.delete(role);
                      return { ...current, [module.key]: [...now] };
                    })
                  }
                />
              ))}
            </div>
          </DrawerSection>
        ))}
      </Drawer>
    </KitPage>
  );
}
