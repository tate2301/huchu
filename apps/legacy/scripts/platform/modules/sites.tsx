import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { SiteCreateWizard } from "./wizards/site-create-wizard";
import { SiteEditWizard } from "./wizards/site-edit-wizard";
import { SiteListWizard } from "./wizards/site-list-wizard";
import { SiteStatusWizard } from "./wizards/site-status-wizard";

const SUPPORTED_OPERATIONS = [
  "site.list-search",
  "site.create",
  "site.edit",
  "site.activate",
  "site.deactivate",
] as const;

export function SitesModule(props: ModuleProps) {
  if (props.operationId === "site.list-search") {
    return (
      <SiteListWizard
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "site.create") {
    return (
      <SiteCreateWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "site.edit") {
    return (
      <SiteEditWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "site.activate") {
    return (
      <SiteStatusWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        activate={true}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "site.deactivate") {
    return (
      <SiteStatusWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        activate={false}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  return (
    <OperationNotAvailable
      moduleLabel="Sites"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
