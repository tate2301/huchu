# Site visits: schema proposal

Work order item 3. Originally written for review, before any migration or UI.

> [!NOTE]
> **Superseded — this was built and shipped on 22 Sep 2026 (PR #173).**
> For what actually exists, read
> [site-visit-questions.md](./site-visit-questions.md). This document is kept
> for the reasoning: what was already in the repo, what was weighed, and why
> answers ended up as rows rather than JSON. Where the two disagree, the other
> one is right.

James: *a site visit for each of these products and services, each allowing
pictures taken on site and shared with the office.*

---

## 0. This is not greenfield

Worth stating up front, because it changes the shape of the work:

| Already in the repo | Where |
| --- | --- |
| Site visits, as scheduled appointments with a report | `CrmAppointment` — `checklist`, `photos`, `siteConditions`, `reportNotes`, `reportCompletedAt` |
| Measurements that convert to quotation lines | `CrmSiteVisitItem` → `visitItemsToQuotationLines` |
| A public visit brief for the customer or a subcontractor | `CrmAppointment.briefToken` |
| Report validation | `lib/crm/site-visits.ts` |
| **A full offline framework** | `lib/offline/` — outbox with `clientRequestId`, `dependsOn`, attachment blob store, retry/backoff, conflict resolver, service worker, module registry |
| Object storage | Vercel Blob via `lib/uploads/upload-file.ts`, policy-per-context |
| The "configurable thing with a shipped default" pattern | `DEFAULT_STAGE_TEMPLATE` + `ensureDefaultPipeline(tx, companyId)` |
| Per-tenant custom field definitions | `CrmFieldDefinition` — `key`/`label`/`type`/`options`/`position`/`archivedAt` |

So item 4 is mostly **registering a module in machinery that exists**, not
building a sync engine. The genuinely new work is the question bank, the answer
storage, per-answer photos, and client-side compression.

### The actual gap

`lib/crm/site-visits.ts` holds this:

```ts
export const DEFAULT_SITE_VISIT_CHECKLIST: SiteVisitChecklistDefault[] = [
  { key: "client_present", label: "Client or representative present" },
  { key: "access_confirmed", label: "Site access confirmed", ... },
  ...
];
```

Eight generic items, **hardcoded**, identical for every tenant, with no
relationship to what is being quoted. That is the thing to make configurable.
Nothing in the CRM currently knows that an epoxy visit asks different questions
from a branded-mat visit.

---

## 1. Question bank structure

Generated, not transcribed: `scripts/crm/question-bank-sync.py` reads the
client's .docx and emits `lib/crm/site-visits/floorcode-question-bank.ts`.
Every `label` is verbatim. **152 questions across 13 sections:**

| Kind | Sections | Questions |
| --- | --- | --- |
| `product` | 11 (branded mats → wall cladding) | 136 |
| `evidence` | STANDARD SITE EVIDENCE | 8 |
| `closeout` | SITE VISIT CLOSE-OUT | 8 |

Inferred types: 74 `BOOLEAN`, 43 `SHORT_TEXT`, 15 `SINGLE_SELECT`, 7 `NUMBER`,
2 `DATE`, 2 `LONG_TEXT`, 1 `DIMENSION`, 8 `PHOTO_EVIDENCE`.

The .docx is a paper checklist. It states a type only where it lists options
(`Indoor / Outdoor / Entrance recess`, `15 / 20 / 25 / 30 / 40 mm`) or ends
`Yes / No`. Everything else is inferred from the grammar of the question, and
**25 questions carry `needsReview: true`** — mostly yes/no guesses on questions
that list alternatives, e.g. *"Is it floor, wall or both?"*, which probably
wants three choices rather than a checkbox. Those are a settings edit against
the tenant's own rows, not a code change.

The `Capture:` / `Critical:` lines are kept per-section as `photoGuidance` and
shown to the rep — *"photograph cracks, damaged areas, joints, contamination"*
is an instruction, not decoration.

---

## 2. Proposed models

### Definition side — the configurable bank

```prisma
enum CrmQuestionSetKind {
  PRODUCT   // asked when this product or service is being assessed
  EVIDENCE  // the photo checklist every visit carries
  CLOSEOUT  // the rep's sign-off gate
}

enum CrmQuestionType {
  SHORT_TEXT
  LONG_TEXT
  NUMBER
  BOOLEAN
  SINGLE_SELECT
  MULTI_SELECT
  DATE
  DIMENSION      // "___ m × ___ m" — stored as { widthM, heightM }
  PHOTO_EVIDENCE // the answer is the photograph
}

/// A named set of questions a rep works through on site. Per tenant, and for
/// PRODUCT sets, per thing being quoted.
model CrmQuestionSet {
  id        String             @id @default(uuid())
  companyId String
  /// Stable key. Immutable once set, so answers can reference it after a rename.
  key       String
  name      String
  kind      CrmQuestionSetKind @default(PRODUCT)
  /// What this set is asked about. Null for EVIDENCE/CLOSEOUT, and for a
  /// PRODUCT set whose catalogue entry does not exist yet.
  productId String?
  position  Int                @default(0)
  isActive  Boolean            @default(true)
  /// Which template seeded this, for provenance. Null once hand-built.
  sourceTemplateKey String?
  archivedAt DateTime?
  createdById String?
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  company   Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  product   Product?      @relation(fields: [productId], references: [id], onDelete: SetNull)
  createdBy User?         @relation("CrmQuestionSetCreatedBy", fields: [createdById], references: [id])
  questions CrmQuestion[]
  sections  CrmSiteVisitSection[]

  @@unique([companyId, key])
  @@index([companyId, kind, isActive])
  @@index([companyId, productId])
}

/// One question. Mirrors CrmFieldDefinition's conventions deliberately.
model CrmQuestion {
  id            String          @id @default(uuid())
  companyId     String
  questionSetId String
  /// Immutable once set — answers snapshot it.
  key           String
  label         String
  helpText      String?
  type          CrmQuestionType
  /// Choices for SINGLE_SELECT / MULTI_SELECT: [{ value, label }].
  options       Json?
  /// "mm", "m²", "m" — shown beside a NUMBER input.
  unit          String?
  isRequired    Boolean         @default(false)
  /// The bank says to photograph this one.
  requiresPhoto Boolean         @default(false)
  /// The seeded type was a judgement call. Advisory only; never blocks capture.
  needsReview   Boolean         @default(false)
  position      Int             @default(0)
  archivedAt    DateTime?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  company     Company              @relation(fields: [companyId], references: [id], onDelete: Cascade)
  questionSet CrmQuestionSet       @relation(fields: [questionSetId], references: [id], onDelete: Cascade)
  answers     CrmSiteVisitAnswer[]

  @@unique([questionSetId, key])
  @@index([companyId, questionSetId, position])
}
```

### Capture side — what the rep fills in

```prisma
/// One product (or the evidence/close-out block) within a visit.
model CrmSiteVisitSection {
  id            String             @id @default(uuid())
  companyId     String
  appointmentId String
  productId     String?
  /// The set this was built from. SetNull so archiving a set never deletes
  /// captured work.
  questionSetId String?
  /// Snapshots, so an old report reads correctly after a rename.
  name          String
  kind          CrmQuestionSetKind @default(PRODUCT)
  position      Int                @default(0)
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  company     Company              @relation(fields: [companyId], references: [id], onDelete: Cascade)
  appointment CrmAppointment       @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  product     Product?             @relation(fields: [productId], references: [id], onDelete: SetNull)
  questionSet CrmQuestionSet?      @relation(fields: [questionSetId], references: [id], onDelete: SetNull)
  answers     CrmSiteVisitAnswer[]
  photos      CrmSiteVisitPhoto[]

  @@index([companyId, appointmentId, position])
}

model CrmSiteVisitAnswer {
  id        String @id @default(uuid())
  companyId String
  sectionId String
  /// SetNull — the definition may be archived; the answer stays readable via
  /// the snapshot columns below.
  questionId String?

  /// Snapshotted at capture, per the convention site-visits.ts already sets
  /// for the checklist: a report must read the same in a year.
  questionKey   String
  questionLabel String
  questionType  CrmQuestionType

  position Int @default(0)

  /// Exactly one of these carries the answer, chosen by questionType.
  /// Discrete columns rather than one JSON value so the interesting queries
  /// ("which sites showed damp?") are indexed rather than a scan.
  valueText    String?
  valueNumber  Float?
  valueBool    Boolean?
  valueOptions String[] @default([])
  valueDate    DateTime?
  /// DIMENSION { widthM, heightM }, and any future compound type.
  valueJson    Json?

  /// The rep's free note against this question, whatever its type.
  notes        String?
  /// True when the rep explicitly marked it not applicable, which is not the
  /// same as leaving it blank.
  notApplicable Boolean  @default(false)

  answeredAt   DateTime @default(now())
  answeredById String?

  company  Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  section  CrmSiteVisitSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  question CrmQuestion?        @relation(fields: [questionId], references: [id], onDelete: SetNull)
  answeredBy User?             @relation("CrmSiteVisitAnswerBy", fields: [answeredById], references: [id])
  photos   CrmSiteVisitPhoto[]

  /// One answer per question per section — also the offline idempotency key.
  @@unique([sectionId, questionKey])
  @@index([companyId, questionKey, valueBool])
  @@index([companyId, questionKey, valueNumber])
  @@index([companyId, sectionId, position])
}

model CrmSiteVisitPhoto {
  id            String  @id @default(uuid())
  companyId     String
  /// Always set. A photo is evidence of a visit before it is anything else.
  appointmentId String
  sectionId     String?
  answerId      String?
  /// For STANDARD SITE EVIDENCE shots: which checklist item this satisfies.
  evidenceKey   String?

  /// The object-storage key. This is the record; `url` is a cached convenience
  /// for rendering and is re-derivable from the key.
  blobPathname String
  url          String
  contentType  String
  size         Int
  width        Int?
  height       Int?
  caption      String?
  /// From the device, not the server clock — a visit may sync days later.
  capturedAt   DateTime?
  latitude     Float?
  longitude    Float?

  /// Generated on the device before upload. Makes a replayed sync a no-op.
  clientPhotoId String
  uploadedById  String?
  createdAt     DateTime @default(now())

  company     Company              @relation(fields: [companyId], references: [id], onDelete: Cascade)
  appointment CrmAppointment       @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  section     CrmSiteVisitSection? @relation(fields: [sectionId], references: [id], onDelete: SetNull)
  answer      CrmSiteVisitAnswer?  @relation(fields: [answerId], references: [id], onDelete: SetNull)
  uploadedBy  User?                @relation("CrmSiteVisitPhotoBy", fields: [uploadedById], references: [id])

  @@unique([companyId, clientPhotoId])
  @@index([companyId, appointmentId, createdAt])
  @@index([companyId, answerId])
}
```

### One change to an existing model

```prisma
model CrmAppointment {
  // ...
  /// Generated on the device when a rep starts a visit offline. The create
  /// handler upserts on this, so replaying a queued operation returns the
  /// existing visit instead of booking a second one.
  clientVisitId String?

  sections CrmSiteVisitSection[]
  photos_  CrmSiteVisitPhoto[]

  @@unique([companyId, clientVisitId])
}
```

---

## 3. The three questions the work order asks

### How a visit links to a product or service

**One appointment, one section per product** — not one visit per product.

Read literally, *"a site visit for each of these products and services"* means a
separate visit per product. That is wrong operationally: a rep at a warehouse
quoting epoxy for the floor and branded mats for the entrance would have to book
two appointments at the same address on the same morning, and the office would
see two jobs where there is one. Site visits are already linked to a lead, a
client, a deal and a site; splitting them by product breaks all four.

So `CrmSiteVisitSection` sits between the visit and the questions: one row per
product being assessed, each pulling its own question set. *"A site visit for
each product"* becomes *"a section per product within the visit"* — same
questions, same photos, no duplicate appointments. A rep who genuinely needs
separate visits still books separate appointments; nothing prevents it.

`productId` points at `Product`, the repo's single item master, whose
`ProductKind` is already `GOODS | SERVICE | LABOUR | MATERIAL | BUNDLE` — so
"products and services" is one relation, not two. Nullable, because FloorCode's
catalogue may not yet hold all eleven; the section keeps its snapshot `name`
regardless and can be linked later.

### How answers are stored — one row per answer vs JSON

**One row per answer.** Four reasons:

1. **Photos need somewhere to attach.** The work order asks for photos against
   an answer. A JSON blob gives no foreign-key target — you would be storing a
   path like `sections[2].answers[7]`, which breaks the first time anyone
   reorders the form.
2. **The questions are the point of the bank.** *"Which sites showed damp?"*,
   *"how many epoxy jobs needed shot blasting?"*, *"how many customers asked for
   food-grade?"* Against JSON those are full scans of every visit ever done;
   against rows they are an indexed lookup on `questionKey`. A flooring business
   that quotes off site data will want exactly these, and will want them from
   the office, not from a rep's memory.
3. **Partial sync.** The outbox syncs operations, not documents. Per-answer rows
   let a visit sync incrementally over a bad connection and let one rejected
   answer retry without replaying the whole visit.
4. **Validation against columns**, not blob parsing — required questions, type
   checks and option membership are all enforceable in one place.

**The honest cost:** a fully completed epoxy visit writes ~50 rows, and a
pathological visit touching every section would write ~152. Realistically a
visit covers one or two products, so 15–45 rows. That is nothing; reps do a
handful of visits a day, not thousands.

**The counter-argument, and why it does not win.** `CrmAppointment.checklist` is
already `Json`, and `site-visits.ts` justifies it:

> The default on-site checklist. Stored per-visit (not by reference) so
> historical reports stay readable if this list later changes.

That reasoning is correct and I am keeping it — but it argues for
**denormalising the question text**, not for JSON storage. Hence
`questionKey` / `questionLabel` / `questionType` snapshotted onto every answer
row. Archive a question in settings and last year's report still renders exactly
as it did. We get the property the codebase already decided it wanted *and*
queryability, which the JSON column cannot give.

### How photos attach

**Both, through one model.** `CrmSiteVisitPhoto` always carries
`appointmentId`, and optionally `sectionId` and `answerId`:

- **Visit-level.** STANDARD SITE EVIDENCE is explicitly not about any one
  question — *"site/area overview photographs"*, *"access and material delivery
  route"*. Those rows carry `evidenceKey` and no `answerId`.
- **Answer-level.** The bank repeatedly demands it: *"photograph cracks, damaged
  areas, joints, contamination and moisture-related conditions"*, *"photograph
  the existing surface and equipment"*. Those carry `answerId`.

Two models would mean two upload paths, two sync handlers and two galleries for
one concept, and the office would have to look in two places for the photos of
one visit.

**Keys, not blobs**, as the work order asks: `blobPathname` is the Vercel Blob
key and is the record of truth; `url` is cached for rendering. A new
`crm-site-visit-photo` upload policy alongside the existing ones.

**Client-side compression before upload** — new helper, roughly 1600px longest
edge, JPEG quality 0.8, target under 500KB. A raw phone photo is 4–8MB; on a
Zimbabwean mobile connection that is the difference between a visit syncing and
a rep giving up. Compression happens before the blob enters the offline
attachment store, so the queue holds compressed bytes and the device is not
storing 8MB per photo while it waits for signal.

---

## 4. Offline, and not duplicating the visit

The framework exists. What is needed:

- **`clientVisitId`** (above) so a replayed create upserts instead of
  duplicating. This is the one part of the "queue drains without duplicating"
  requirement that needs schema, which is why it is in this proposal.
- **`@@unique([sectionId, questionKey])`** so a replayed answer write is an
  upsert, not a second answer.
- **`@@unique([companyId, clientPhotoId])`** so a retried photo upload does not
  attach the same picture twice.
- **Register `crm-site-visit`** in `OFFLINE_MODULES` next to `retail-pos`:
  routes to warm, queries to preload (the tenant's question sets and the rep's
  scheduled visits), an entity adapter, and mutation adapters for
  create-visit / save-answers / attach-photo. `dependsOn` already sequences the
  photo operations behind the visit create.

## 5. Seeding FloorCode

Exactly the `ensureDefaultPipeline` pattern:

```ts
ensureSiteVisitQuestionSets(tx, companyId, templateKey)
```

materialises a template into rows on first use. Templates are data in
`lib/crm/site-visits/templates/`, in a registry keyed by id:

- `floorcode-flooring-v1` → the 152-question bank, already generated.
- `generic-v1` → the existing eight-item `DEFAULT_SITE_VISIT_CHECKLIST`, so
  every other tenant's behaviour is unchanged.

Once seeded, **the tenant's rows are the source of truth** and the template no
longer speaks for them. Editing a question, fixing one of the 25 `needsReview`
types, adding a product section — all data edits in CRM settings.

Product matching at seed time is by name against the tenant's `Product`
catalogue; unmatched sections seed with `productId` null and can be linked in
settings.

---

## 6. Not included here, deliberately

- **No migration.** Awaiting approval of the above.
- **No UI.** The work order stops me before it.
- **`CrmAppointment.checklist` / `photos` are not dropped.** They stay, and
  existing visits keep rendering off them. Backfill is its own ticket, after the
  new path is proven.
- **The office-side view is still blocked** on what *"shared with office"* means
  — CRM record, emailed PDF, or a WhatsApp push. Everything above is identical
  under all three readings.
