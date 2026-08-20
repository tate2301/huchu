# Campus Vertical — Rollout Alignment Note

This is a framing note, not a roadmap. It carries **no story table and no story IDs** — by the
rules of `docs/expansion-plan/schools-roadmap.md`, that document is the sole story ledger for the
Campus (schools) vertical, and this note only records how Campus and the rollout program in
`docs/rollout/master-rollout-plan.md` touch.

## Ownership

Campus is founder-managed. The rollout program's priorities (fiscalisation, pricing, self-serve,
scope trim) were adopted from the external plan; Campus is the founder's addition as the third
vertical alongside Gold and Retail, managed personally against that plan's recommendations. Its
cadence, scope and stories are decided in the schools roadmap, not here.

## Where Campus stands relative to the rollout

Campus is the platform's most mature vertical. The production-readiness blockers from the
2026-08-04 audit (`docs/expansion-plan/schools-production-readiness.md`) — academic-year
creation, provisioning, fees reaching the general ledger — are closed, and the schools roadmap
shows the overwhelming majority of its stories `done`. **The rollout takes no dependency on
unshipped schools work, and no rollout story may add one.**

## What the rollout needs from Campus

Nothing on the critical path. Two passive obligations:

1. **The school portals inherit the gate-policy flip.** Before SS-1.1 flips
   `FEATURE_GATE_POLICY=deny`, the gate audit must cover the portal hosts and
   `app/api/v2/portal/*` routes exactly as it covers tenant routes — a portal route missing from
   `lib/platform/gating/route-registry.ts` fails closed for parents and students on flip day.
2. **The schools fee path is the rollout's canary.** `lib/schools/fiscalisation.ts` and the fee
   receipts route are the only live fiscalisation consumers today; the FDMS roadmap's standing
   instructions commit to keeping them green through every iteration.

## What Campus needs from the rollout

1. **Native fiscalisation for fee receipts.** School fee receipts currently fiscalise through the
   generic connector. After FD-3 lands, they migrate to the native FDGA protocol. That migration
   is a **schools-roadmap story**, added there under its new-scope rule and cross-referenced to
   `docs/rollout/fdms-roadmap.md` — it is deliberately not a story here.
2. **Pricing-band reconciliation.** Schools sell per-term, per-campus
   (`SCHOOL_PRICING_BANDS` in `lib/marketing/pricing.ts`). PR-4.2 reconciles the bands with the
   new tier structure; the recommendation is that the bands survive as a vertical pricing model,
   documented as such, rather than being forced into the monthly tiers.
3. **Self-serve boundaries.** The public trial (SS-3) covers Fiscal and Start only. School
   tenants remain operator-provisioned (`scripts/provision-school.ts` and the platform
   provisioning service SS-2 generalises from it); nothing in this program changes that.

## Standing clause

If a conflict arises between a rollout story and a schools-roadmap rule, the schools roadmap wins
inside its own domain and the master plan's governance section arbitrates the boundary.

## Changelog

| Date | Commit | Description |
|---|---|---|
| 2026-08-18 | — | Note created; ownership, touchpoints and the no-dependency clause recorded. |
