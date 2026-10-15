"use client";

import * as React from "react";

import { BuilderBar, BuilderGrid } from "@/components/builder/grid";
import { Button, ButtonLink, Empty } from "@/components/core";
import { getApiErrorMessage } from "@/lib/api-client";

/** A builder while it opens: the grid's panels, empty, in the shape they will fill. */
export function BuilderLoading({ scope = "form" }: { scope?: string }) {
  return (
    <BuilderGrid
      scope={scope}
      wideBar
      bar={<BuilderBar mode="build" onMode={() => undefined} saved={{ state: "saved", at: null }} publish={{ onPublish: () => undefined, disabled: true }} />}
      outline={
        <div className="pm-body" aria-busy="true" style={{ paddingTop: 16 }}>
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="skeleton" style={{ height: 28, marginBottom: 6 }} />
          ))}
        </div>
      }
      canvas={
        <div className="rb-sheet" aria-busy="true" aria-label="Loading">
          <div className="fpaper">
            <div className="skeleton" style={{ height: 32, width: 280 }} />
            <div className="skeleton" style={{ height: 120 }} />
            <div className="skeleton" style={{ height: 120 }} />
          </div>
        </div>
      }
      canvasLabel="Loading"
      inspector={
        <div className="rb-pan" aria-busy="true">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      }
    />
  );
}

/** A builder with nothing to build on: it did not open, is not here, or is not this workspace's. */
export function BuilderMessage({ backHref, children }: { backHref: string; children: React.ReactNode }) {
  return (
    <BuilderGrid
      scope="form"
      mode="preview"
      bar={
        <ButtonLink href={backHref} variant="quiet" icon="back">
          Build
        </ButtonLink>
      }
      canvas={<div className="rb-board">{children}</div>}
      canvasLabel="Build"
    />
  );
}

export function BuilderError({ what, onRetry, error, backHref }: { what: string; onRetry: () => void; error: unknown; backHref: string }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <BuilderMessage backHref={backHref}>
      <Empty
        icon="warn"
        title={offline ? "You are offline" : `${what} did not open`}
        action={
          <Button icon="history" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {offline ? "Build needs the connection. It opens again when you are back online." : getApiErrorMessage(error, "Check the connection and try again.")}
      </Empty>
    </BuilderMessage>
  );
}

/** What the workspace is not provisioned for: said plainly, with who can turn it on. */
export function BuilderRefused({ what, backHref = "/build" }: { what: string; backHref?: string }) {
  return (
    <BuilderMessage backHref={backHref}>
      <Empty icon="lock" title={`This workspace does not run ${what}`} action={<ButtonLink href={backHref} icon="back">Back to Build</ButtonLink>}>
        It is not one of the modules this workspace is provisioned for. The owner turns modules on in Management, under Billing.
      </Empty>
    </BuilderMessage>
  );
}
