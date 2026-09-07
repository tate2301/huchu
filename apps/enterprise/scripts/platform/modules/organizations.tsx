import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { OrgProvisionWizard } from "./wizards/org-provision-wizard";
import { OrgStatusWizard } from "./wizards/org-status-wizard";
import { OrgSubdomainReserveWizard } from "./wizards/org-subdomain-reserve-wizard";

const SUPPORTED_OPERATIONS = [
  "org.provision.bundle",
  "org.subdomain.reserve",
  "org.activate",
  "org.suspend",
  "org.disable",
] as const;

export function OrganizationsModule(props: ModuleProps) {
  if (props.operationId === "org.provision.bundle") {
    return (
      <OrgProvisionWizard
        actor={props.actor}
        services={props.services}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "org.subdomain.reserve") {
    return (
      <OrgSubdomainReserveWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "org.activate") {
    return (
      <OrgStatusWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        target="ACTIVE"
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "org.suspend") {
    return (
      <OrgStatusWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        target="SUSPENDED"
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "org.disable") {
    return (
      <OrgStatusWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        target="DISABLED"
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  return (
    <OperationNotAvailable
      moduleLabel="Organizations"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
