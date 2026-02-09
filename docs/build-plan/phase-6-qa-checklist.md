# Phase 6 QA and Pilot Checklist

## Objective
Finalize UX polish, validate consistency, and prepare for controlled rollout.

## Visual Consistency Sweep
1. Confirm shared heading hierarchy on all core pages.
2. Confirm tab navigation icon sizing and spacing consistency.
3. Confirm success, warning, and error colors are using semantic tokens only.
4. Confirm row highlight style is consistent for saved records.

## State Completeness Audit
1. Each critical page shows loading, empty, error, and success states.
2. Form submit errors preserve entered values.
3. Success states show clear post-submit confirmation and next step.
4. Table/list pages provide clear empty-state call to action.

## Accessibility Verification
1. Keyboard tab order reaches all interactive controls.
2. Focus ring is visible on all key controls.
3. Inputs with helper text include `aria-describedby`.
4. Validation errors are announced in an alert region.

## Guided Mode Verification
1. Guided mode toggle persists after refresh.
2. Context help blocks appear only when guided mode is enabled.
3. Help links resolve to relevant quick tips in `/help`.

## Critical Journey Pilot Tasks
1. Submit shift report and verify saved row highlight.
2. Submit attendance batch and verify filtered records display.
3. Submit plant report and verify report appears in selected date range.
4. Submit stores receipt and issue, then verify movement log entries.
5. Submit gold pour, dispatch, and receipt, then verify each history table.

## Pilot Success Metrics
1. Task completion rate >= 90% without operator assistance.
2. Median completion time decreases compared with baseline.
3. Error-recovery rate >= 95% (users can complete after first error).
4. Zero critical data-loss incidents during form submission.

## Release Sign-Off
1. Product sign-off on UX consistency and clarity.
2. Ops sign-off on critical workflow correctness.
3. Engineering sign-off on lint status and known technical debt log.
