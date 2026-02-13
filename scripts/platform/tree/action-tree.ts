import type { PlatformModuleId } from "../components/types";

export interface ActionOperation {
  id: string;
  label: string;
  description: string;
  moduleId: PlatformModuleId;
}

export interface ActionTask {
  id: string;
  label: string;
  description: string;
  operations: ActionOperation[];
}

export interface ActionDomain {
  id: string;
  label: string;
  description: string;
  tasks: ActionTask[];
}

export const ACTION_TREE: ActionDomain[] = [
  {
    id: "provisioning",
    label: "Provisioning",
    description: "Create and bootstrap client organizations.",
    tasks: [
      {
        id: "org-setup",
        label: "Organization Setup",
        description: "Provision new organizations and reserve subdomains.",
        operations: [
          {
            id: "org.provision.bundle",
            label: "Provision Organization Bundle",
            description: "Create org, admin, tier, feature defaults, and subdomain.",
            moduleId: "orgs",
          },
          {
            id: "org.subdomain.reserve",
            label: "Reserve Subdomain",
            description: "Reserve a subdomain for an existing organization.",
            moduleId: "orgs",
          },
        ],
      },
      {
        id: "org-lifecycle",
        label: "Organization Lifecycle",
        description: "Control tenant status operations.",
        operations: [
          {
            id: "org.activate",
            label: "Activate Organization",
            description: "Set tenant status to ACTIVE.",
            moduleId: "orgs",
          },
          {
            id: "org.suspend",
            label: "Suspend Organization",
            description: "Set tenant status to SUSPENDED.",
            moduleId: "orgs",
          },
          {
            id: "org.disable",
            label: "Disable Organization",
            description: "Set tenant status to DISABLED.",
            moduleId: "orgs",
          },
        ],
      },
    ],
  },
  {
    id: "client-ops",
    label: "Client Operations",
    description: "Day-to-day client administration.",
    tasks: [
      {
        id: "feature-flags",
        label: "Feature Flags",
        description: "Control company feature states.",
        operations: [
          {
            id: "feature.enable",
            label: "Enable Feature",
            description: "Enable a feature for a company.",
            moduleId: "features",
          },
          {
            id: "feature.disable",
            label: "Disable Feature",
            description: "Disable a feature for a company.",
            moduleId: "features",
          },
        ],
      },
      {
        id: "admin-lifecycle",
        label: "Admin Lifecycle",
        description: "Create and manage admin accounts.",
        operations: [
          {
            id: "admin.create",
            label: "Create Admin",
            description: "Create a new admin for a company.",
            moduleId: "admins",
          },
          {
            id: "admin.activate",
            label: "Activate Admin",
            description: "Set admin account to active.",
            moduleId: "admins",
          },
          {
            id: "admin.deactivate",
            label: "Deactivate Admin",
            description: "Set admin account to inactive.",
            moduleId: "admins",
          },
          {
            id: "admin.reset-password",
            label: "Reset Admin Password",
            description: "Reset password for an admin account.",
            moduleId: "admins",
          },
        ],
      },
    ],
  },
  {
    id: "billing-contracts",
    label: "Billing & Contracts",
    description: "Subscription and enforcement workflows.",
    tasks: [
      {
        id: "subscriptions",
        label: "Subscriptions",
        description: "Change subscription status safely.",
        operations: [
          {
            id: "subscription.set-status",
            label: "Set Subscription Status",
            description: "Set one company subscription status.",
            moduleId: "subscriptions",
          },
          {
            id: "subscription.assign-tier",
            label: "Assign Subscription Tier",
            description: "Assign BASIC, STANDARD, or ENTERPRISE to a company.",
            moduleId: "subscriptions",
          },
          {
            id: "subscription.apply-template",
            label: "Apply Client Template",
            description: "Apply preset tier + bundle + feature profile (includes all-features option).",
            moduleId: "subscriptions",
          },
          {
            id: "subscription.manage-addons",
            label: "Manage Add-ons",
            description: "Enable or disable add-on bundles for a company.",
            moduleId: "subscriptions",
          },
          {
            id: "subscription.recompute-pricing",
            label: "Recompute Pricing",
            description: "Recompute and persist current monthly charge breakdown.",
            moduleId: "subscriptions",
          },
        ],
      },
      {
        id: "commercial-catalog",
        label: "Commercial Catalog",
        description: "Sync feature catalog, bundles, and tiers.",
        operations: [
          {
            id: "subscription.bundle.upsert",
            label: "Create or Edit Bundle",
            description: "Create custom bundles or update bundle name, price, and active state.",
            moduleId: "subscriptions",
          },
          {
            id: "subscription.bundle.set-features",
            label: "Configure Bundle Features",
            description: "Pick which features are included in each bundle.",
            moduleId: "subscriptions",
          },
          {
            id: "subscription.sync-catalog",
            label: "Sync Catalog",
            description: "Sync feature keys, bundles, and tier defaults from code catalog.",
            moduleId: "subscriptions",
          },
        ],
      },
      {
        id: "contracts",
        label: "Contracts",
        description: "Evaluate and enforce contract state.",
        operations: [
          {
            id: "contract.enforce",
            label: "Enforce Contract",
            description: "Apply recommended contract enforcement.",
            moduleId: "contracts",
          },
          {
            id: "contract.override",
            label: "Apply Contract Override",
            description: "Set override reason and force temporary allowance.",
            moduleId: "contracts",
          },
        ],
      },
    ],
  },
  {
    id: "support",
    label: "Support Access",
    description: "Support request and session workflows.",
    tasks: [
      {
        id: "support-requests",
        label: "Support Requests",
        description: "Request/approve/deny support access.",
        operations: [
          {
            id: "support.request",
            label: "Create Support Request",
            description: "Create a support access request.",
            moduleId: "support",
          },
          {
            id: "support.approve",
            label: "Approve or Deny Request",
            description: "Review and approve/deny pending requests.",
            moduleId: "support",
          },
        ],
      },
      {
        id: "support-sessions",
        label: "Support Sessions",
        description: "Start or end support sessions.",
        operations: [
          {
            id: "support.start-session",
            label: "Start Session",
            description: "Start an approved support session.",
            moduleId: "support",
          },
          {
            id: "support.end-session",
            label: "End Session",
            description: "End an active support session.",
            moduleId: "support",
          },
        ],
      },
    ],
  },
  {
    id: "reliability",
    label: "Reliability & Remediation",
    description: "Health monitoring and runbook automation.",
    tasks: [
      {
        id: "health",
        label: "Health",
        description: "Metrics and remediation actions.",
        operations: [
          {
            id: "health.record-metric",
            label: "Record Metric",
            description: "Add a health metric sample.",
            moduleId: "health",
          },
          {
            id: "health.remediate",
            label: "Run Remediation",
            description: "Trigger remediation for an incident.",
            moduleId: "health",
          },
        ],
      },
      {
        id: "runbooks",
        label: "Runbooks",
        description: "Runbook authoring and execution.",
        operations: [
          {
            id: "runbook.create",
            label: "Create Runbook",
            description: "Define a new runbook.",
            moduleId: "runbooks",
          },
          {
            id: "runbook.execute",
            label: "Execute Runbook",
            description: "Run a selected runbook.",
            moduleId: "runbooks",
          },
        ],
      },
    ],
  },
  {
    id: "audit",
    label: "Audit & Compliance",
    description: "Audit integrity and operational notes.",
    tasks: [
      {
        id: "audit",
        label: "Audit Actions",
        description: "List, verify, export, and annotate records.",
        operations: [
          {
            id: "audit.add-note",
            label: "Add Audit Note",
            description: "Write a note into audit ledger.",
            moduleId: "audit",
          },
          {
            id: "audit.verify-chain",
            label: "Verify Audit Chain",
            description: "Validate chain integrity.",
            moduleId: "audit",
          },
          {
            id: "audit.export",
            label: "Export Audit Data",
            description: "Export events for review.",
            moduleId: "audit",
          },
        ],
      },
    ],
  },
];

export function findOperationById(operationId: string) {
  for (const domain of ACTION_TREE) {
    for (const task of domain.tasks) {
      for (const operation of task.operations) {
        if (operation.id === operationId) {
          return { domain, task, operation };
        }
      }
    }
  }
  return null;
}
