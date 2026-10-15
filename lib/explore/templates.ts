import { checkSql } from "@/lib/reports/sql/guard";

import type { ProductKey } from "./products";

/**
 * Questions to start from (the ExploreTemplates board): each one SQL over the
 * report sources, with what it answers. Opening one puts its SQL in the
 * studio as a new question; nothing is saved until the person saves it.
 *
 * One is offered only to someone who reads every table it reads, the way a
 * built-in report is: a fitter is never shown a template over pay.
 */

export type ExploreTemplate = {
  /** Its address: `/explore/q/{slug}`. */
  slug: string;
  title: string;
  /** What it answers, in a line. */
  answers: string;
  product: ProductKey;
  /** What one row is, for the total under the rows ("44 visits"). */
  noun?: string;
  /** Who made it: Corelith ships these; Vane's come from what it watched. */
  madeBy: "Corelith" | "Vane";
  sql: string;
};

const t = (template: Omit<ExploreTemplate, "madeBy">): ExploreTemplate => ({ ...template, madeBy: "Corelith" });

export const EXPLORE_TEMPLATES: readonly ExploreTemplate[] = [
  t({
    slug: "quotes-waiting",
    title: "Quotes waiting more than 7 days",
    answers: "Which quotes have had no answer for a week",
    product: "crm",
    sql: `select number, customer, record, status, issued, total,
  current_date - issued as days_waiting
from crm_quotes
where lower(status) in ('draft', 'sent')
  and issued <= current_date - 7
order by days_waiting desc;`,
  }),
  t({
    slug: "open-quotes",
    title: "Open quotes since {lastMonth}",
    answers: "Site visits since the 1st of last month whose quote isn't won yet, biggest first",
    product: "crm",
    noun: "visits",
    sql: `select visited as visited_on, customer, rep as fitter,
  measured as area_m2, drafted as total, coalesce(outcome, 'no quote') as state,
  current_date - visited as days_since
from crm_visit_forms
where visited >= date_trunc('month', current_date - extract(day from current_date)::int)
  and (outcome is null or lower(outcome) <> 'won')
order by total desc nulls last;`,
  }),
  t({
    slug: "quotes-open",
    title: "Quotes not yet accepted",
    answers: "What is quoted and not yet accepted, biggest first",
    product: "crm",
    sql: `select number, customer, record, status, issued, total
from crm_quotes
where lower(status) not in ('accepted', 'declined', 'rejected', 'expired', 'cancelled')
order by total desc nulls last;`,
  }),
  t({
    slug: "quoted-by-month",
    title: "Quoted by month",
    answers: "How much was quoted each month, and how many quotes",
    product: "crm",
    sql: `select date_trunc('month', issued) as month, count(*) as quotes, sum(total) as quoted
from crm_quotes
group by date_trunc('month', issued)
order by month desc;`,
  }),
  t({
    slug: "visits-by-rep",
    title: "Site visits by rep",
    answers: "Who is visiting sites, and how many visits they finished",
    product: "crm",
    sql: `select rep, count(*) as visits, count(completed) as completed
from crm_site_visits
group by rep
order by visits desc;`,
  }),
  t({
    slug: "deals-by-stage",
    title: "Open deals by stage",
    answers: "Where the open deals are, and what they are worth",
    product: "crm",
    sql: `select stage, count(*) as deals, sum(value) as value
from crm_deals
where lower(status) = 'open'
group by stage
order by value desc nulls last;`,
  }),
  t({
    slug: "crm-invoices-owed",
    title: "Invoices still owed, oldest first",
    answers: "Which invoices are past due, and by how long",
    product: "crm",
    sql: `select number, customer, due, total, balance, current_date - due as days_late
from crm_invoices
where balance > 0
order by days_late desc nulls last;`,
  }),
  t({
    slug: "owed-by-customer",
    title: "Owed to you, by customer",
    answers: "Who owes the most, and how late the oldest invoice is",
    product: "books",
    sql: `select customer, count(*) as invoices, sum(balance) as owed, max(days_late) as oldest_days
from books_owed_by_age
group by customer
order by owed desc;`,
  }),
  t({
    slug: "money-by-source",
    title: "Money in and out, by source",
    answers: "Where this month's money came from and went",
    product: "books",
    sql: `select direction, source, sum(count) as entries, sum(amount) as amount
from books_money_month
group by direction, source
order by amount desc;`,
  }),
  t({
    slug: "cash-ups-short",
    title: "Shifts that didn't balance, by till",
    answers: "Which tills and cashiers end shifts short or over",
    product: "tender",
    sql: `select till, cashier, count(*) as shifts, sum(variance) as variance
from retail_shifts
where variance <> 0
group by till, cashier
order by variance;`,
  }),
  t({
    slug: "sales-by-till",
    title: "Sales by till",
    answers: "How much each till took, and how many sales",
    product: "tender",
    sql: `select till, count(*) as sales, sum(total) as total
from retail_sales
group by till
order by total desc;`,
  }),
  t({
    slug: "stock-to-reorder",
    title: "Stock at or below its reorder point",
    answers: "What to order before it runs out",
    product: "tender",
    sql: `select product, site, on_hand, reorder_at, value
from retail_stock_on_hand
where on_hand <= reorder_at
order by on_hand;`,
  }),
  t({
    slug: "people-by-department",
    title: "People by department",
    answers: "How many people work in each department",
    product: "people",
    sql: `select department, count(*) as people
from people_register
group by department
order by people desc;`,
  }),
  t({
    slug: "leave-by-person",
    title: "Leave taken, by person and type",
    answers: "Who has taken how many days, of which leave",
    product: "people",
    sql: `select employee, type, sum(days) as days
from people_leave
group by employee, type
order by days desc;`,
  }),
  t({
    slug: "pay-by-department",
    title: "Pay by department",
    answers: "What each department costs in gross and net pay",
    product: "people",
    sql: `select department, sum(gross) as gross, sum(net) as net, sum(employer_cost) as employer_cost
from payroll_pay
group by department
order by gross desc;`,
  }),
  t({
    slug: "fees-owed-by-class",
    title: "Fees owed, by class",
    answers: "Which classes owe the most in fees",
    product: "schools",
    sql: `select class, count(*) as invoices, sum(balance) as owed
from school_fee_balances
where balance > 0
group by class
order by owed desc;`,
  }),
  t({
    slug: "downtime-by-cause",
    title: "Downtime by cause",
    answers: "What stops the plant, and for how long",
    product: "operations",
    sql: `select cause, count(*) as stops, sum(hours) as hours
from downtime
group by cause
order by hours desc;`,
  }),
];

/** The tables a template reads, by SQL name. */
export function templateReads(template: Pick<ExploreTemplate, "sql">, tables: ReadonlySet<string>): string[] {
  const checked = checkSql(template.sql, tables);
  return checked.ok ? checked.tables : [];
}

/** The templates this person can open: every table each reads is one of theirs. */
export function templatesFor(readable: ReadonlySet<string>): Array<ExploreTemplate & { reads: string[] }> {
  return EXPLORE_TEMPLATES.flatMap((template) => {
    const checked = checkSql(template.sql, readable);
    return checked.ok ? [{ ...template, reads: checked.tables }] : [];
  });
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A template's title on a given day: "{lastMonth}" reads as last month's name ("Open quotes since September"). */
export function templateTitle(template: Pick<ExploreTemplate, "title">, now = new Date()): string {
  return template.title.replace("{lastMonth}", MONTHS[(now.getMonth() + 11) % 12]!);
}

export function templateBySlug(slug: string): ExploreTemplate | null {
  return EXPLORE_TEMPLATES.find((template) => template.slug === slug) ?? null;
}
