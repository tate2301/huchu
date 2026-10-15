"use client";

import * as React from "react";

import { ButtonLink, Icon, type IconName } from "@/components/core";
import { KitPage } from "@/components/management/ui";
import { productInfo, type ProductKey } from "@/lib/explore/products";
import type { ExploreSettingsView } from "@/lib/explore/settings";

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

/**
 * Management → Explore (the MgmtExplore board): who can use Explore, what
 * each product shows, the guards every question runs inside, and the
 * questions run. It reads what exists today; choosing roles and limits, and
 * the questions-run log, wait for Explore's own settings and log tables
 * (`lib/explore/reader.ts`, waiting for approval). Pure: the page feeds it.
 */
export function ExploreSettingsPageView({ data }: { data: ExploreSettingsView }) {
  const using = data.roles.filter((role) => role.canUse);
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
          <span className="q">Every question reads only what its role reads in the app.</span>
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
                    <td>{role.canUse ? <span className="ok-dot">Can use Explore</span> : <span className="muted">Ask Vane and reports only</span>}</td>
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
          <Guard icon="lock" title="Read only, always" detail="Questions run read-only: select and with only. A change, a delete or a second statement is refused before it runs.">
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
                <tr>
                  <td colSpan={5} className="wrap muted" style={{ padding: "var(--space-24)" }}>
                    {data.runLog
                      ? "No question has run today."
                      : "Questions run in each person’s own browser for now, so none is logged. The log starts with Explore’s own database login, which is waiting for approval."}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </KitPage>
  );
}
