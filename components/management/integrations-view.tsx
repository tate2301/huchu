"use client";

import * as React from "react";

import { ButtonLink, Icon, Status } from "@/components/core";
import { KitPage, OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import type { Integration, IntegrationsView } from "@/lib/management/integrations";

function Mark({ item }: { item: Integration }) {
  if (item.mark.kind === "image") {
    return (
      <span className="mk">
        {/* A service's own wordmark, a fixed raster. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.mark.src} alt={item.name} style={{ width: "80%", height: "auto" }} />
      </span>
    );
  }
  return (
    <span className="mi">
      <Icon name={item.mark.icon} size={20} />
    </span>
  );
}

function Row({ item }: { item: Integration }) {
  const action = item.action ?? (item.state === "available" ? "Connect" : undefined);
  return (
    <div className="setting ar">
      <Mark item={item} />
      <span className="t">
        <b>{item.name}</b>
        <span>{item.detail}</span>
      </span>
      {item.state === "connected" ? <Status tone="success">Connected</Status> : null}
      {item.state === "due" ? (
        <span className="status status-warning" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
          Upload due
        </span>
      ) : null}
      {item.state === "failing" ? <Status tone="danger">Not working</Status> : null}
      {action ? (
        <ButtonLink href={item.href} icon={action === "Upload" ? "upload" : action === "Fix" ? "edit" : "link"}>
          {action}
        </ButtonLink>
      ) : (
        <ButtonLink href={item.href} variant="quiet" iconOnly icon="more" label={`Manage ${item.name}`} />
      )}
    </div>
  );
}

/**
 * Management → Integrations (design/core-modules/html/management-integrations.html):
 * what is connected and what can be. Pure: the page and the fixture feed it.
 */
export function IntegrationsPageView({ data }: { data: IntegrationsView }) {
  const count = data.connected.length;
  return (
    <KitPage screen="management-integrations" title="Integrations" mark={<Icon name="link" />}>
      <div className="finding" style={{ padding: 0 }}>
        <p className="lede-figure">
          {count === 0 ? "Nothing is connected yet." : `${count} ${count === 1 ? "service is" : "services are"} connected.`}{" "}
          {data.attention ? <span className="q">{data.attention}</span> : null}
        </p>
      </div>
      {count > 0 ? (
        <div className="form-sec">
          <header>
            <h2>Connected</h2>
            <p>Used by your products, core modules and Vane.</p>
          </header>
          <div className="body" style={{ gap: 0 }}>
            {data.connected.map((item) => (
              <Row key={item.key} item={item} />
            ))}
          </div>
        </div>
      ) : null}
      {data.available.length > 0 ? (
        <div className="form-sec">
          <header>
            <h2>Available</h2>
            <p>Connect in a minute; disconnect any time.</p>
          </header>
          <div className="body" style={{ gap: 0 }}>
            {data.available.map((item) => (
              <Row key={item.key} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </KitPage>
  );
}

/** The page inside Management. */
export function IntegrationsPage({ data }: { data: IntegrationsView }) {
  return (
    <ManagementShell>
      <OwnsChrome>
        <IntegrationsPageView data={data} />
      </OwnsChrome>
    </ManagementShell>
  );
}
