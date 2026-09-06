import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * People and payroll: employees, leave, attendance, payroll runs, disbursements, adjustments, compensation, disciplinary actions.
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */
export const manifest: ModuleManifest = {
  id: "people",
  notifications: {
    viewPaths: {
      PAYROLL_RUN: "/payroll/runs?runId={id}",
      DISBURSEMENT_BATCH: "/payroll/disbursements?batchId={id}",
      ADJUSTMENT_ENTRY: "/payroll/runs?adjustmentId={id}",
      COMPENSATION_PROFILE: "/payroll/compensation?profileId={id}",
      COMPENSATION_RULE: "/payroll/compensation?ruleId={id}",
      DISCIPLINARY_ACTION: "/people/incidents?disciplinaryId={id}",
      HR_INCIDENT: "/people/incidents?incidentId={id}",
    },
    approvalActions: {
      HR_PAYROLL_SUBMITTED: [
        {
          key: "approve_payroll_run",
          label: "Approve",
          kind: "api",
          href: "/api/payroll/runs/{id}/approve",
          method: "POST",
          variant: "default",
        },
        {
          key: "reject_payroll_run",
          label: "Reject",
          kind: "api",
          href: "/api/payroll/runs/{id}/reject",
          method: "POST",
          variant: "destructive",
          confirmMessage: "Reject this payroll run?",
        },
      ],
      HR_DISBURSEMENT_SUBMITTED: [
        {
          key: "approve_disbursement_batch",
          label: "Approve",
          kind: "api",
          href: "/api/disbursements/batches/{id}/approve",
          method: "POST",
          variant: "default",
        },
      ],
      HR_ADJUSTMENT_SUBMITTED: [
        {
          key: "approve_adjustment",
          label: "Approve",
          kind: "api",
          href: "/api/adjustments/{id}/approve",
          method: "POST",
          variant: "default",
        },
        {
          key: "reject_adjustment",
          label: "Reject",
          kind: "api",
          href: "/api/adjustments/{id}/reject",
          method: "POST",
          variant: "destructive",
          confirmMessage: "Reject this adjustment?",
        },
      ],
      HR_COMP_PROFILE_SUBMITTED: [
        {
          key: "approve_comp_profile",
          label: "Approve",
          kind: "api",
          href: "/api/compensation/profiles/{id}/approve",
          method: "POST",
          variant: "default",
        },
        {
          key: "reject_comp_profile",
          label: "Reject",
          kind: "api",
          href: "/api/compensation/profiles/{id}/reject",
          method: "POST",
          variant: "destructive",
          confirmMessage: "Reject this compensation profile?",
        },
      ],
      HR_COMP_RULE_SUBMITTED: [
        {
          key: "approve_comp_rule",
          label: "Approve",
          kind: "api",
          href: "/api/compensation/rules/{id}/approve",
          method: "POST",
          variant: "default",
        },
        {
          key: "reject_comp_rule",
          label: "Reject",
          kind: "api",
          href: "/api/compensation/rules/{id}/reject",
          method: "POST",
          variant: "destructive",
          confirmMessage: "Reject this compensation rule?",
        },
      ],
      HR_DISCIPLINARY_SUBMITTED: [
        {
          key: "approve_disciplinary_action",
          label: "Approve",
          kind: "api",
          href: "/api/hr/disciplinary-actions/{id}/approve",
          method: "POST",
          variant: "default",
        },
        {
          key: "reject_disciplinary_action",
          label: "Reject",
          kind: "api",
          href: "/api/hr/disciplinary-actions/{id}/reject",
          method: "POST",
          variant: "destructive",
          confirmMessage: "Reject this disciplinary action?",
        },
      ],
    },
  },
};
