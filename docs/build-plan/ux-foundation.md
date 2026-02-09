# UX Foundation Contract

## Purpose
This document defines non-negotiable UX rules for Huchu so users with low digital confidence can complete tasks quickly and safely.

## Core Principles
1. Clarity first: every screen must state what it is for and what the user should do next.
2. Action-first language: labels should use task verbs and real-world terms.
3. Low cognitive load: reduce decisions on each screen and group related fields.
4. Safe operations: prevent silent failure and make recovery obvious when errors happen.
5. Predictable behavior: forms, tables, filters, and feedback must work the same across modules.

## Interaction Rules
1. Every page must include:
- Page title
- Short purpose statement
- Next step guidance
2. Every form must include:
- Visible labels for all inputs
- Required-field hint near submit actions
- Inline validation near the field
- Error summary at top on failed submit
- Submit state (`disabled` + clear progress signal)
3. Every successful create/update must:
- Redirect to a canonical list/history view
- Include `createdId`, `createdAt`, and `source` query params
- Show a saved banner and highlight the related row
4. Every list/table must include:
- Loading state
- Empty state with call to action
- Error state with retry action
- Primary filters above the table
5. Every destructive action must:
- Use explicit confirmation
- Explain impact in plain English

## Content and Copy Rules
1. Keep sentences short and direct.
2. Avoid abstract system wording.
3. Prefer labels like:
- `Record Receipt`
- `Submit Report`
- `Save Changes`
4. Validation messages must say what is wrong and how to fix it.

## Layout and Spacing Rules
1. Use consistent page rhythm:
- Page intro
- Content cards/sections
- Primary action area
2. Keep form sections compact and scannable.
3. Use one dominant primary action per view.
4. Mobile-first:
- 44px+ touch targets
- Sticky action bar where forms are long
- No critical actions hidden behind hover-only interactions

## State Contract
1. Loading:
- Show context-aware skeleton or loading state component
2. Empty:
- Explain what is missing
- Offer the next action
3. Error:
- Explain the issue in plain language
- Offer retry or recovery action
4. Success:
- Confirm what was saved
- Point users to the saved record or next step

## Accessibility Baseline
1. All interactive elements must be keyboard reachable.
2. Focus indicators must be visible and consistent.
3. Inputs with errors must use `aria-invalid` and link to help text via `aria-describedby`.
4. Color cannot be the only indicator of state.

## Definition of Done (UX)
1. User can complete the main task without external help.
2. User can find submitted data in one step.
3. User can recover from validation or API errors without losing input.
4. Page includes complete loading, empty, error, and success states.
