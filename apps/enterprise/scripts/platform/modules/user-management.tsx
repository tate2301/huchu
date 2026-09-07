import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { UserCreateWizard } from "./wizards/user-create-wizard";
import { UserListWizard } from "./wizards/user-list-wizard";
import { UserResetPasswordWizard } from "./wizards/user-reset-password-wizard";
import { UserRoleWizard } from "./wizards/user-role-wizard";
import { UserStatusWizard } from "./wizards/user-status-wizard";

const SUPPORTED_OPERATIONS = [
  "user.list-search",
  "user.create",
  "user.activate",
  "user.deactivate",
  "user.reset-password",
  "user.change-role",
] as const;

export function UserManagementModule(props: ModuleProps) {
  if (props.operationId === "user.list-search") {
    return (
      <UserListWizard
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "user.create") {
    return (
      <UserCreateWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "user.activate") {
    return (
      <UserStatusWizard
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

  if (props.operationId === "user.deactivate") {
    return (
      <UserStatusWizard
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

  if (props.operationId === "user.reset-password") {
    return (
      <UserResetPasswordWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "user.change-role") {
    return (
      <UserRoleWizard
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
      moduleLabel="User Management"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
