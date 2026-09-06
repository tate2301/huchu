// Deep imports are the norm (`@corelithzw/module-workflow/approvals`); this entry
// carries the manifest a host composes with and the hook it fills.
export { manifest } from "./manifest";
export { onApprovalAction, type ApprovalActionEvent, type ApprovalActionListener } from "./approvals";
