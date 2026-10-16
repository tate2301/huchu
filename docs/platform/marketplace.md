# The marketplace: what a workspace can add

Management → Marketplace (`app/management/marketplace`, `lib/management/marketplace.ts`) is where a workspace finds what it can add: report templates, document layouts, forms, add-ons and, next, integrations. Adding something never changes Corelith for anyone else. A template is copied into the workspace and is theirs from then on; an add-on switches parts of Corelith on for them; an integration is installed with the operations they grant it.

## What it lists today

Everything listed is made by Corelith. It is built on each request from three sources:

| Kind | Where it comes from | Add takes them to |
| --- | --- | --- |
| Report templates | `CUSTOM_TEMPLATES` in `lib/reports/custom/templates.ts`, those this person can read (`templatesFor`) | `/reports/built/<key>`, where "Make it yours" copies it into the workspace |
| Document layouts | `DocumentTemplate` rows with `scope: "SYSTEM"` | `/build/templates` |
| Add-ons | `FEATURE_BUNDLES` whose code starts with `ADDON_` and that have a price, which the workspace does not have yet | the plan, on Billing |

Forms are a kind with nothing listed yet. Site-visit forms start from `BUILDER_TEMPLATES` (`lib/crm/site-visits/builder-templates.ts`) and block documents from `STARTER_TEMPLATES` (`lib/crm/starter-templates.ts`), both offered in Build, not the marketplace.

## Publishing a Corelith template today

Corelith's own templates are kept in code, reviewed like any change, and shipped with the app.

**A report template.** Add a `CustomTemplate` to `CUSTOM_TEMPLATES`:
- `key` (its address, `/reports/built/<key>`), `title`, `description`;
- `audience`: who it is offered to, as a built-in report;
- `profiles`: the kinds of workspace it leads the catalogue for, such as `"flooring"` or `"schools"`;
- `document`: a `CustomDocument` (`lib/reports/custom/document.ts`), the same blocks the report builder saves.

It is offered only to someone who can read every source it reads. It appears in the marketplace and on the reports pages with no other change.

**A document layout.** Add an entry to `DEFAULT_TEMPLATE_CATALOG` (`lib/documents/default-template-catalog.ts`): its `key`, `documentType` (`SALES_QUOTATION`, `SALES_INVOICE`, …), `sourceKey`, and its `schema`, checked by `templateSchema` (`lib/documents/template-schema.ts`). Build → Templates offers it straight from the catalogue (`lib/build/templates.ts`). The marketplace lists it once `scripts/seed-document-templates.ts` has written it as a `SYSTEM` `DocumentTemplate`, so run the seed where it should appear.

**A site-visit form or a block document.** Add it to `BUILDER_TEMPLATES` or `STARTER_TEMPLATES`. A workspace starts from it in Build, and the copy keeps where it came from (`CrmQuestionSet.sourceTemplateKey`).

**An add-on.** Add a `FeatureBundle` with a code starting `ADDON_` and a monthly price to `FEATURE_BUNDLES` (`lib/platform/feature-catalog.ts`), listing the features it switches on. Run `syncEntitlementCatalog`. It is listed for workspaces that do not have it. Corelith's operators switch it on (operator portal → the workspace → Billing); a workspace cannot yet buy one itself.

## Publishing from outside Corelith

*Not built yet. This is the design for the next layer.*

A partner publishes a **listing**: an integration, a template, or a set of them, with one package format and one review.

**The package.** A `corelith.json` manifest, versioned:

```json
{
  "key": "tile-calc",
  "name": "Tile Calc",
  "maker": "Tile Calc Ltd",
  "version": "1.2.0",
  "summary": "Works out tiles, adhesive and grout from a floor plan, and quotes them.",
  "kinds": ["integration", "reports", "forms"],
  "requires": ["crm.core"],
  "integration": { "uses": ["crm.quote.create", "crm.lead.create"], "runs": "on-approval", "events": "https://tilecalc.example/corelith" },
  "templates": [
    { "kind": "report", "key": "tile-wastage", "title": "Tile wastage by job", "document": { "...": "a CustomDocument" } },
    { "kind": "document-layout", "key": "tile-quote", "documentType": "SALES_QUOTATION", "layout": { "...": "a templateSchema" } },
    { "kind": "site-visit-form", "key": "tile-survey", "form": { "...": "a builder template" } }
  ],
  "price": { "monthly": 12, "currency": "USD" }
}
```

Every template is checked with the schema the product already uses for its own (`customDocumentSchema`, `templateSchema`, the builder's form schema), so a partner's report is exactly as safe as one made in the builder. A report's queries are checked against the sources the installing workspace can read, as the builder checks them (`checkBlocks`).

**Publishing.**
1. The partner submits a version.
2. It is checked automatically: the manifest, every template's schema, and the operations its integration names, which must exist.
3. A Corelith operator reviews it: what it asks for (operations by risk, the features it needs), and what its templates read.
4. Approved, it is listed. A new version goes through the same steps, and installs keep their version until the workspace updates.

**Installing.** An admin adds it from the marketplace:
- **Templates:** copied into the workspace as its own records (`CustomReport`, `DocumentTemplate` with `scope: "COMPANY"`, `CrmQuestionSet`), each keeping the listing and version it came from. Changes the workspace makes stay theirs, and an update never overwrites them; it offers the new version as a copy.
- **Integration:** installed as [integrations.md](integrations.md) describes. The admin grants the operations it asks for, and a token is issued.
- **Price:** taken through the workspace's billing (`lib/payments`), as add-ons will be.

**Build order**, each step working before the next:

1. Corelith's own templates as listings (one table of listings and versions, seeded from the code catalogues above), and installs recorded with where each copy came from.
2. Import and export of one template as JSON, checked by its schema: the format a package carries.
3. Partners' listings: submit, automatic checks, operator review, publish.
4. Installing partners' integrations (after [integrations.md](integrations.md)'s partner layer).
5. Paid listings and self-serve add-ons through billing.

## Rules that never bend

- Installing never changes Corelith for any other workspace.
- A template is the workspace's copy. Nothing a partner publishes later reaches into it.
- A listing asks for operations and features by name, and a workspace sees what it asks for before it says yes.
- Every template passes the same checks as one a person builds.
