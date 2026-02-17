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
import { UserManagementModule } from "./modules/user-management";
import { SitesModule } from "./modules/sites";
import { SupportModule } from "./modules/support";
import { RunbooksModule } from "./modules/runbooks";
import { HealthModule } from "./modules/health";
import { ContractsModule } from "./modules/contracts";
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

function readPositionalActor() {
  const knownSections = new Set([
    "help",
    "provision",
    "subdomain",
    "action",
    "support",
    "site",
    "runbook",
    "health",
    "remediation",
    "contract",
    "audit",
    "tui",
  ]);
  const raw = process.argv.slice(2);
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (token.startsWith("--")) {
      const next = raw[index + 1];
      if (next && !next.startsWith("-")) {
        index += 1;
      }
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    if (knownSections.has(token)) {
      continue;
    }
    if (token.includes("@")) {
      return token;
    }
  }
  return null;
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
  const actor = overrides.actor ?? readArg("--actor") ?? readPositionalActor() ?? process.env.PLATFORM_ACTOR ?? "";
  if (!actor && !initialReadOnly) {
    throw new Error("Missing required --actor <email> (unless --read-only is set).");
  }

  const resolvedActor = actor || "read-only@local";
  const initialCompanyId =
    overrides.initialCompanyId ?? readArg("--company-id") ?? readArg("--company");
  const contextLabel = overrides.contextLabel ?? readArg("--context") ?? "platform";
  const services = createPlatformServices();
  const resolveCompanies = async (query: string, limit = 20) => {
    const value = query.trim();
    if (!value) {
      const rows = await services.org.list({ limit });
      return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
    }

    const rows = await services.org.resolve(value, limit);
    return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
  };

  const moduleMounts = {
    orgs: (props: ModuleRenderProps) => (
      <OrganizationsModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    subscriptions: (props: ModuleRenderProps) => (
      <SubscriptionsModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    features: (props: ModuleRenderProps) => (
      <FeaturesModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    admins: (props: ModuleRenderProps) => (
      <AdminsModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    "user-management": (props: ModuleRenderProps) => (
      <UserManagementModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    sites: (props: ModuleRenderProps) => (
      <SitesModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    audit: (props: ModuleRenderProps) => (
      <AuditModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    support: (props: ModuleRenderProps) => (
      <SupportModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    runbooks: (props: ModuleRenderProps) => (
      <RunbooksModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    health: (props: ModuleRenderProps) => (
      <HealthModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    ),
    contracts: (props: ModuleRenderProps) => (
      <ContractsModule
        actor={resolvedActor}
        services={services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
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
      resolveCompanies={resolveCompanies}
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
      "Error starting platform runtime:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}
