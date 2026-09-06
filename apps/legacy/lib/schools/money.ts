/**
 * School money — now a doorway onto `lib/money.ts`.
 *
 * The implementation moved when payroll needed it. Nothing in it was ever
 * school-specific: `Decimal(14,2)`, half-up rounding, and an exchange rate that
 * throws rather than defaulting to 1 are as true of a payslip as of a fee
 * invoice, and two copies of that would eventually disagree about a cent.
 *
 * This file stays because roughly two dozen school routes import from it and
 * churning them all buys nothing. New code outside `lib/schools/` should import
 * `@/lib/money` directly.
 */
export * from "@corelithzw/platform/money";
