# @corelithzw/module-workflow

The submit → approve → reject workflow and its audit trail (`ApprovalAction`),
written to by payroll runs, disbursements, adjustments, compensation, gold
allocations, settlements and disciplinary actions.

```
approvals.ts   transitions, approver checks, createApprovalAction, the onApprovalAction hook
periods.ts     period keys for payroll cycles
manifest.ts    id "workflow"; requires nothing
```

Import by path: `import { createApprovalAction } from "@corelithzw/module-workflow/approvals"`.

A leaf module. Recording an action fires the listeners a host registered from
its `modules.ts` (`onApprovalAction`), inside the caller's transaction; the
notifications module registers the one that tells the approvers.
