#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { render } from "ink";

import { PlatformApp, type PlatformAppProps } from "./app";
import { createPlatformServices } from "./services";
import { AdminsModule } from "./modules/admins";
import { AuditModule } from "./modules/audit";
import { FeaturesModule } from "./modules/features";
import { OrganizationsModule } from "./modules/organizations";
import { SubscriptionsModule } from "./modules/subscriptions";
import type { ModuleRenderProps } from "./components/types";

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith('-')) {
    return null;
  }
  return value;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function isDirectRun() {
  const invokedPath = process.argv[1];
  if (!invokedPath) {
    return false;
  }
  return path.resolve(invokedPath) === path.resolve(fileURLToPath(import.meta.url));
}

export function runPlatformInkShell(overrides: Partial<PlatformAppProps> = {}) {
  const initialReadOnly = overrides.initialReadOnly ?? hasFlag("--read-only");
  const actor = overrides.actor ?? readArg("--actor") ?? process.env.PLATFORM_ACTOR ?? "";
  if (!actor && !initialReadOnly) {
    throw new Error("Missing required --actor <email> (unless --read-only is set).");
  }

  const resolvedActor = actor || "read-only@local";
  const initialCompanyId =
    overrides.initialCompanyId ?? readArg("--company-id") ?? readArg("--company");
  const contextLabel = overrides.contextLabel ?? readArg("--context") ?? "platform";
  const services = createPlatformServices();

  const moduleMounts = {
    orgs: (props: ModuleRenderProps) => (
      <OrganizationsModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
      />
    ),
    subscriptions: (props: ModuleRenderProps) => (
      <SubscriptionsModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
      />
    ),
    features: (props: ModuleRenderProps) => (
      <FeaturesModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
      />
    ),
    admins: (props: ModuleRenderProps) => (
      <AdminsModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
      />
    ),
    audit: (props: ModuleRenderProps) => (
      <AuditModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
      />
    ),
  };

  const app = render(
    <PlatformApp
      actor={resolvedActor}
      initialCompanyId={initialCompanyId}
      initialReadOnly={initialReadOnly}
      contextLabel={contextLabel}
      modules={overrides.modules}
      moduleMounts={overrides.moduleMounts ?? moduleMounts}
      initialModuleId={overrides.initialModuleId}
      onQuit={() => {
        void services.disconnect();
        overrides.onQuit?.();
      }}
    />,
  );

  void app.waitUntilExit().finally(async () => {
    await services.disconnect();
  });

  return app;
}

if (isDirectRun()) {
  try {
    runPlatformInkShell();
  } catch (error) {
    console.error(
      "Error starting platform Ink shell:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}
