import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { AuditOperationWizard } from "./wizards/audit-operation-wizard";

const SUPPORTED_OPERATIONS = ["audit.add-note", "audit.verify-chain", "audit.export"] as const;

function isAuditOperation(
  operationId: string | undefined,
): operationId is "audit.add-note" | "audit.verify-chain" | "audit.export" {
  return operationId !== undefined && SUPPORTED_OPERATIONS.includes(operationId as (typeof SUPPORTED_OPERATIONS)[number]);
}

export function AuditModule(props: ModuleProps) {
  if (isAuditOperation(props.operationId)) {
    return (
      <AuditOperationWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        operationId={props.operationId}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  return (
    <OperationNotAvailable
      moduleLabel="Audit"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
