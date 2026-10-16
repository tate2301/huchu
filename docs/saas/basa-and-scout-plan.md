# Basa, and Scout: a plan

15 Oct 2026. A plan only; nothing here is built yet.

Two decisions for the founder: what the product sold today as "Flare" (and
called "CRM" inside the app) becomes, and the first paid add-on it carries.

## 1. Stop calling it a CRM

A CRM is Salesforce: a database of accounts that a sales team feeds. The
people we sell to are not sales teams. They are builders, carpenters, estate
agents, electricians, interior fitters, consultants and freelancers. Their
day is an enquiry on WhatsApp, a site visit, a quote, the job itself, an
invoice, and chasing the money. Nobody in that list says "I need a CRM". They
say "I need more work, and I need to stop losing track of it".

So the product is not a record-keeper. It is where a service business's
**work** lives, from the first enquiry to the last payment.

### The name: **Basa**

- In Shona, *basa* is work — a job, a piece of work, employment.
  "Ndine basa" is "I have work". It is the word every customer already uses
  for the thing they want more of.
- In isiNdebele and isiZulu, *ukubasa* is to kindle a fire. It carries
  Flare's spark across, so the move from Flare reads as a growing-up, not a
  rename. (Check both meanings with native speakers before launch.)
- Four letters, two syllables, said the same way in English, Shona and
  Ndebele. Easy to type on a phone, easy to say on a call.
- Ownable: we are not "a CRM for Zimbabwe"; we are Basa.

**Line:** *Win the work. Do the work. Get paid.*

**Short line, for the app's sign-in and social:** *Where your work lives.*

Alternatives considered:

| Name | Why it is good | Why it lost |
| --- | --- | --- |
| Fundi | Southern African word for a skilled hand; artisans hear respect in it | Fits trades, reads oddly for an estate agent or a consultant |
| Gwara (Shona: the way, the path) | Calm, a guide | Says nothing about work or money |
| Flare (keep) | Already built, already on the signup | A spark, not a living; nothing local in it |

### What changes with the name

- **Words in the product.** The word "CRM" leaves every screen, menu, email,
  price page and document. The record words become the customer's own:

  | Now | Becomes |
  | --- | --- |
  | CRM | Basa |
  | Lead | Enquiry |
  | Deal | Job (before it is won: a Quote out) |
  | Pipeline | Jobs, by stage |
  | Account / Company | Client |
  | Activity | What happened |

  Everything else (Quotes, Site visits, Work orders, Invoices, Receipts,
  Collections) already speaks the customer's language.
- **Routes.** `/crm/*` becomes `/work/*` (or `/basa/*`), with the old paths
  redirecting. Code identifiers (`lib/crm`, `Crm*` models) stay: renaming them
  costs a migration and buys the customer nothing.
- **Product registry.** `WorkspaceProduct.FLARE` → `BASA`, name "Basa", home
  `/work`, on its own domain (basa.co.zw and basa.africa to check).
- **Vertical.** The vertical "Sales and CRM" becomes "Basa — service work".
- **Marketing.** Its own site and price page, not a section of Corelith's.
  Built for a phone first: most of this market will find us on one.

## 2. Scout: work we find for you

Our customers' biggest problem is not tracking work; it is finding it. In
Zimbabwe a great deal of work moves through tenders, through people who know
which developer is about to break ground, and through price lists nobody
publishes. "Tenderpreneurs" spend days in gazettes, ministry noticeboards and
WhatsApp groups to find what is open, what is needed to bid, and what the
inputs cost this month.

**Scout** is a paid add-on to Basa. Corelith's own desk gathers that
material, checks it and keeps it current; a Basa workspace that buys Scout
gets it, matched to its trade and province, and can act on it in one tap.

### What Scout carries

| Kind | Example | What the customer does with it |
| --- | --- | --- |
| Tender | "Supply and install 40 classroom doors, Masvingo, closes 12 Nov" with its bid document | Saves it as a Job; gets the bid checklist and closing date as tasks |
| Reference document | PRAZ supplier registration steps; the papers a bid needs (tax clearance ITF263, NSSA, PRAZ certificate, company documents) | Reads it; Vane turns it into a checklist |
| Lead | A development with approved plans, a school building a block, a council project starting | Saves it as an Enquiry and calls |
| Contact list | Procurement offices of ministries, councils, parastatals and NGOs; developers; estate agencies | Adds the ones they want as Clients |
| Price list | Cement, steel, timber, roofing, paint, labour day-rates by town, in USD and ZiG | Pulls lines straight into a Quote |
| Data sheet | Bill of quantities templates; material quantities per m² for common jobs | Starts a Quote from it |

### How it works

**For Corelith's desk (the admin portal).** A Scout area in the portal, on the
same Library pattern as the other published content:

1. **Bring it in.** Upload a spreadsheet, a PDF or a link. For a spreadsheet,
   match its columns to the kind (a tender's title, buyer, province, closing
   date; a price list's item, unit, price, currency, town). For a PDF, the
   desk writes the summary; Vane drafts one from the text for the desk to
   correct.
2. **Tag it.** Trade (building, carpentry, electrical, plumbing, real estate,
   cleaning, consulting…), province and town, size, closing date, and the
   source with its date.
3. **Publish.** Now, or at a set time. Each item has an expiry: a tender at its
   closing date, a price list after thirty days unless refreshed. Expired items
   leave the feed by themselves.
4. **First look.** An item can be marked for Scout only, for its first days,
   before it goes to the free teaser (below). This is what "exclusive" means
   to a customer: they saw it first.
5. **Know it is used.** Per item: how many workspaces saw it, saved it and won
   work from it. That last figure is the one we sell on.

**For a Basa workspace.**

1. **Set up once.** Their trades, provinces and the size of job they take.
2. **The Scout feed.** What is new and matches, closing soonest first. One tap
   saves a tender as a Job, a lead as an Enquiry, a contact as a Client,
   with "From Scout" kept on the record so the customer (and we) can see
   where work came from.
3. **In a quote.** "Add from a price list" offers Scout's current lists for
   their town next to their own.
4. **Without Scout.** The feed shows that something matched ("4 tenders for
   carpentry in Harare this week") with titles hidden, and a button to start
   Scout. That teaser is the sale.

### With Vane

Vane already reads a workspace, raises cards on For you, proposes plans and
drafts work for a person to approve. Scout gives it something new to read.

- **Matching.** When the desk publishes, Vane checks each Scout workspace's
  trades, area, past jobs and win rate, and raises a card only where it fits:
  "A door supply tender in Masvingo closes in 12 days. You have done three
  door jobs this year. Save it as a Job?" The action is the save.
- **A bid plan.** On a saved tender, Vane proposes a plan: the papers the bid
  needs, the ones the workspace has on file and the ones it is missing, the
  site visit, pricing, and submission two days before the close. Each step is
  owned by Vane or by a person, as plans are today.
- **A first quote.** Vane drafts a Quote from the tender's bill of quantities
  priced from Scout's current list for that town. A person checks and sends
  it; Vane never sends.
- **Reading the document.** "What does this tender ask for?" answered from the
  tender's own document, with the page it came from.
- **Reminders.** Closing dates and missing papers on For you, and on WhatsApp
  where the workspace has it on.

Vane reads Scout through its own reader role, limited to published items the
workspace is entitled to, the same way it reads the workspace today.

### Price

Scout breaks the rule that add-ons carry no charge, on purpose: it is
content Corelith pays people to gather and keep current. Suggested:

- **US$29 a month** for a workspace, whatever its member count, on top of its
  verticals. Optionally US$290 a year.
- **14 days free** with the full feed, then back to the teaser.
- Later, if it earns it: a **Scout Pro** with every province and early first
  look, priced after we see how many saves turn into won jobs.

The price engine gains one line for a paid add-on; `lib/platform/verticals.ts`
stays the rule for verticals.

### Data and the law

Contact lists are personal information under the Cyber and Data Protection
Act [Chapter 12:07], with POTRAZ as the authority. Scout carries business
contacts in their business role (a procurement office, an agency's front
desk), each with where it came from and when, and an opt-out that removes it
from every workspace. No private numbers bought from list sellers. Tender
documents are public notices; the summary and the tags are ours. Every item
names its source.

### The model, in outline

- `ScoutItem`: kind, title, summary, trades, provinces, town, closes at,
  publishes at, expires at, first-look until, source and source date,
  payload by kind, files.
- `ScoutPriceList` and its lines (item, unit, price, currency, town, as of).
- `ScoutContact` (organisation, role, phone, email, source, opted out).
- `ScoutSave`: which workspace saved which item, as which record.
- `ScoutProfile`: a workspace's trades, provinces, job size.
- A bundle `ADDON_SCOUT` with features `scout.feed`, `scout.price-lists`,
  `scout.contacts`, and the paid line in the price engine.

### Build order

Each step ships on its own and works end to end.

1. **Tenders and reference documents.** Desk upload and publish; the
   workspace's feed, profile, Save as a Job; the teaser; the paid add-on and
   its trial.
2. **Price lists in quotes.** Desk upload with column matching; "Add from a
   price list" in the quote builder.
3. **Vane.** Matching cards, bid plans, first quote from a bill of quantities,
   reading the document.
4. **Leads and contact lists.** With source, opt-out and the data-protection
   rules above.
5. **Reach.** WhatsApp and email alerts; the desk's "won from Scout" figures.

### What we watch

- Saves per Scout workspace per week, and how many become won jobs.
- Teaser to paid: share of Basa workspaces that start Scout in a month.
- Scout workspaces still paying after three months.
- Desk cost per published item, against revenue per item.

### Open questions for the founder

1. Basa, or one of the alternatives? And `/work` or `/basa` for the routes?
2. Does Basa keep running inside Corelith's domain for existing workspaces, or
   move them all to the new one?
3. Scout's price, and whether it is sold to Corelith (non-Basa) workspaces too.
4. Who staffs the desk, and how many items a week we promise.
5. Which provinces and trades the first month covers.
