"use client";

import * as React from "react";

import { ButtonLink, Icon, Select, Status, type IconName } from "@/components/core";
import { KitPage } from "@/components/management/ui";
import { productInfo, type ProductKey } from "@/lib/explore/products";
import { runResult } from "@/lib/explore/runs";
import { monthLine, type ExploreSettingsView } from "@/lib/explore/settings";

function Guard({ icon, title, detail, children }: { icon: IconName; title: string; detail: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="srow">
      <Icon name={icon} />
      <div>
        <b>{title}</b>
        <span className="s">{detail}</span>
      </div>
      {children}
    </div>
  );
}

const CAN = "Can use Explore";
const CANNOT = "Ask Vane and reports only";

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Management → Explore (the MgmtExplore board): who can use Explore (owners
 * and managers choose, by role; owners always can), what each product shows,
 * the guards every question runs inside, and the questions run today. Pure:
 * the page feeds it and saves a change.
 */
export function ExploreSettingsPageView({
  data,
  saving = false,
  onRoles,
}: {
  data: ExploreSettingsView;
  saving?: boolean;
  onRoles?: (roles: string[]) => void;
}) {
  const using = data.roles.filter((role) => role.canUse);
  const setRole = (role: string, can: boolean) => {
    const next = data.roles.filter((row) => (row.role === role ? can : row.canUse)).map((row) => row.role);
    onRoles?.(next);
  };
  return (
    <KitPage
      title="Explore"
      mark={<Icon name="explore" />}
      width={1120}
      actions={
        <ButtonLink href="#questions-run" icon="activity">
          All questions run
        </ButtonLink>
      }
    >
      <div className="finding" style={{ padding: "0 0 16px" }}>
        <p className="lede-figure">
          {using.length} {using.length === 1 ? "role can" : "roles can"} use Explore, and none of them can change a record.{" "}
          <span className="q">{data.runLog ? monthLine(data.month) : "Every question reads only what its role reads in the app."}</span>
        </p>
      </div>

      <div className="lset">
        <div>
          <h2>Who can use Explore</h2>
          <p className="aside">By role. Everyone else asks Vane, or opens reports.</p>
        </div>
        <div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>People</th>
                  <th>Reads</th>
                  <th>Explore</th>
                </tr>
              </thead>
              <tbody>
                {data.roles.map((role) => (
                  <tr key={role.role}>
                    <td>
                      <span className="cell-lead">{role.label}</span>
                    </td>
                    <td>{role.people}</td>
                    <td className="wrap">{role.reads}</td>
                    <td>
                      {data.canChange && !role.fixed && onRoles ? (
                        <Select
                          aria-label={`${role.label}: Explore`}
                          value={role.canUse ? "yes" : "no"}
                          style={{ minWidth: 210 }}
                          disabled={saving}
                          onChange={(event) => setRole(role.role, event.target.value === "yes")}
                        >
                          <option value="yes">{CAN}</option>
                          <option value="no">{CANNOT}</option>
                        </Select>
                      ) : role.canUse ? (
                        <span className="ok-dot" title={role.fixed ? "Owners always can" : undefined}>
                          {CAN}
                        </span>
                      ) : (
                        <span className="muted">{CANNOT}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="lset">
        <div>
          <h2>What each product shows</h2>
          <p className="aside">A role reads in Explore what it reads in the app, never more.</p>
        </div>
        <div>
          {data.products.map((product) => (
            <div key={product.key} className="srow">
              <Icon name={productInfo(product.key as ProductKey).icon} />
              <div>
                <b>{product.name}</b>
                <span className="s">
                  <span className="mono">{product.tables.join(" · ")}</span>
                </span>
              </div>
              <div className="selbox" aria-label={`${product.name}: ${product.scope}`}>
                <span>{product.scope}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lset">
        <div>
          <h2>Guards</h2>
          <p className="aside">The same for every question, from a person, a report or Vane.</p>
        </div>
        <div>
          <Guard
            icon="lock"
            title="Read only, always"
            detail={
              data.runLog ? (
                <>
                  Questions run as <span className="mono">explore_reader</span>: select and with only. A change, a delete or a second statement is refused before it runs.
                </>
              ) : (
                "Questions run read-only: select and with only. A change, a delete or a second statement is refused before it runs."
              )
            }
          >
            <span className="ok-dot">On, cannot be turned off</span>
          </Guard>
          <Guard icon="sites" title="This workspace’s rows" detail={`Every table is filtered to ${data.workspaceName} before the question sees it`}>
            <span className="ok-dot">On, cannot be turned off</span>
          </Guard>
          <Guard icon="list" title="Rows back" detail="Larger answers are cut, and say so">
            <div className="selbox">
              <span className="mono">{data.rowLimit.toLocaleString("en-GB")}</span>
            </div>
          </Guard>
          <Guard icon="clock" title="Time per question" detail="Stopped and reported when it runs longer">
            <div className="selbox">
              <span className="mono">{data.timeLimitSeconds} s</span>
            </div>
          </Guard>
          <Guard icon="person" title="Personal details" detail="Phone numbers, ID and bank accounts show only where the role reads them in People">
            <span className="ok-dot">On, as People decides</span>
          </Guard>
        </div>
      </div>

      <div className="lset" id="questions-run">
        <div>
          <h2>Questions run today</h2>
          <p className="aside">Kept for a year, with the SQL and who ran it.</p>
        </div>
        <div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Question</th>
                  <th>Read</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.length ? (
                  data.runs.map((run) => {
                    const result = runResult(run);
                    return (
                      <tr key={run.id}>
                        <td className="num muted">{clock(run.at)}</td>
                        <td>
                          <span className="cell-lead">{run.who}</span>
                        </td>
                        <td className="wrap" title={run.reason ?? undefined}>
                          {run.line}
                        </td>
                        <td className="wrap mono muted">{run.readFrom.join(", ") || "—"}</td>
                        <td>{result.tone === "plain" ? result.text : <Status tone={result.tone}>{result.text}</Status>}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="wrap muted" style={{ padding: "var(--space-24)" }}>
                      {data.runLog
                        ? "No question has run today."
                        : "Questions run in each person’s own browser on this server, so none is logged. The log starts once Explore’s own database login is set up here."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </KitPage>
  );
}
