import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { AdminCreateWizard } from "./wizards/admin-create-wizard";
import { AdminResetPasswordWizard } from "./wizards/admin-reset-password-wizard";
import { AdminStatusWizard } from "./wizards/admin-status-wizard";

const SUPPORTED_OPERATIONS = [
  "admin.create",
  "admin.activate",
  "admin.deactivate",
  "admin.reset-password",
] as const;

export function AdminsModule(props: ModuleProps) {
  if (props.operationId === "admin.create") {
    return (
      <AdminCreateWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "admin.activate") {
    return (
      <AdminStatusWizard
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

  if (props.operationId === "admin.deactivate") {
    return (
      <AdminStatusWizard
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

  if (props.operationId === "admin.reset-password") {
    return (
      <AdminResetPasswordWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  return (
    <OperationNotAvailable
      moduleLabel="Admins"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
