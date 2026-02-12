import React from "react";

import type { ModuleProps } from "./module-props";
import { OperationNotAvailable } from "./wizards/operation-not-available";
import { SubscriptionAddonsWizard } from "./wizards/subscription-addons-wizard";
import { SubscriptionCatalogSyncWizard } from "./wizards/subscription-catalog-sync-wizard";
import { SubscriptionPricingWizard } from "./wizards/subscription-pricing-wizard";
import { SubscriptionStatusWizard } from "./wizards/subscription-status-wizard";
import { SubscriptionTierWizard } from "./wizards/subscription-tier-wizard";

const SUPPORTED_OPERATIONS = [
  "subscription.set-status",
  "subscription.assign-tier",
  "subscription.manage-addons",
  "subscription.recompute-pricing",
  "subscription.sync-catalog",
] as const;

export function SubscriptionsModule(props: ModuleProps) {
  if (props.operationId === "subscription.set-status") {
    return (
      <SubscriptionStatusWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "subscription.assign-tier") {
    return (
      <SubscriptionTierWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "subscription.manage-addons") {
    return (
      <SubscriptionAddonsWizard
        actor={props.actor}
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "subscription.recompute-pricing") {
    return (
      <SubscriptionPricingWizard
        services={props.services}
        focusCompanyId={props.focusCompanyId}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  if (props.operationId === "subscription.sync-catalog") {
    return (
      <SubscriptionCatalogSyncWizard
        actor={props.actor}
        services={props.services}
        readOnly={props.readOnly}
        setInputLocked={props.setInputLocked}
        onBackToTree={props.onBackToTree}
      />
    );
  }

  return (
    <OperationNotAvailable
      moduleLabel="Subscriptions"
      operationId={props.operationId}
      supportedOperations={[...SUPPORTED_OPERATIONS]}
      onBackToTree={props.onBackToTree}
    />
  );
}
