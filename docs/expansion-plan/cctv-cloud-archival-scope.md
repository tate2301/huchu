# CCTV Cloud Archival — Scoping Memo

**Status: pre-decision.** This is not a roadmap and it has no story IDs. It exists to answer one
question — *should Huchu sell offsite CCTV archival in Zimbabwe, and if so, in what shape* — with
enough technical and financial detail that the answer can be a decision rather than an opinion.
Nothing here is committed work. If the answer is yes, this memo becomes the source for a roadmap
under `docs/rollout/` and this file stays as the reasoning behind it.

Numbers marked **(est.)** are estimates that have not been verified against a supplier quote or a
customer. They are load-bearing, and the pilot in §10 exists mostly to replace them.

---

## 1. This reverses a standing decision, and that has a cost

CCTV was deleted from this platform in August 2026 under ST-2.1 / ST-3.1 of
`docs/rollout/scope-trim-roadmap.md`. `CONTRIBUTING.md` §"Scope: Dropped, Parked, And Frozen
Modules" currently reads: *"**Dropped** — code and schema removed, SKU retired. CCTV (including
`cctv-server/`) … Do not reintroduce them."*

That instruction is binding on reviewers today. Reopening CCTV is therefore a founder-level
reversal, not a feature request, and it needs to be recorded as one:

- A changelog row appended to `docs/rollout/scope-trim-roadmap.md` stating that the drop is being
  partially reversed, what is different this time, and why. The roadmap's own rule is that its
  structure never changes and history is never rewritten — so the ST-2.1 row stays `done` and
  truthful, and the reversal is a new entry below it.
- An edit to the `CONTRIBUTING.md` dropped-modules paragraph, in the same change, so the two
  documents do not contradict each other.

**What is being reintroduced is not what was deleted.** The old module was a VMS: NVR and camera
registries, live HLS/WebRTC viewing through an on-prem MediaMTX gateway, playback scrubbing,
event and access-log screens — roughly 12,000 lines across `app/cctv`, `app/api/cctv`,
`components/cctv`, three `lib/cctv-*.ts` files and a `cctv-server/` directory. It competed
head-on with the free apps that ship with the hardware (Hik-Connect, Dahua DMSS), which is
probably why nobody missed it.

Cloud archival is a different product with a different buyer and a different value proposition. It
should get a new feature-key namespace (`cctv.archive.*`, `ADDON_CCTV_ARCHIVE`) and should **not**
restore `ADDON_CCTV_SUITE` or any removed key. The old code is still worth reading — `git show
a08925d` has the camera/NVR domain model and the gateway server — but as prior art, not as a
branch to revert.

One correction that should happen regardless of the decision: `README.md` still lists `cctv-server/`
in the repository map and names CCTV as a core workspace family. Both have been false since August.

---

## 2. What the product actually is

> When they steal the recorder, the footage is already out of the building.

That is the entire pitch, and it is why this is sellable in Zimbabwe when remote viewing is not.

Every NVR sold locally already does continuous local recording, and Hik-Connect already does remote
viewing for free. Neither survives the failure mode that actually costs the customer money: the
recorder is inside the premises being robbed, and the first thing a competent thief — or a
colluding employee — does is take it or wipe it. Insurance and police both want footage that
existed before the incident and demonstrably was not edited after it.

So the product is: **an offsite, tamper-evident copy of the footage that matters, created within
minutes, on infrastructure the customer's staff cannot reach.**

Three consequences fall straight out of that framing:

1. It does not replace the NVR. The NVR keeps doing continuous local recording. We are the second
   copy. This makes the sale additive rather than a rip-and-replace, and it means we work with
   whatever hardware is already on the wall.
2. Chain of custody is a feature, not plumbing. Hash-on-ingest, an append-only access log, and an
   export bundle a lawyer or assessor can rely on are what separates this from a Dropbox folder.
3. Latency to offsite is the headline metric. "Within five minutes of the event" is a promise that
   can be measured and sold. Total retention depth is secondary.

---

## 3. The binding constraint is the customer's uplink, and it dictates the design

This is the number that decides the architecture. A 1080p camera recording continuously:

| Mode | GB per camera per month |
|---|---:|
| Mainstream H.264 24/7 @ 2.0 Mbps | 648 |
| Mainstream H.265 24/7 @ 1.0 Mbps | 324 |
| Substream 24/7 @ 0.25 Mbps | 81 |
| Substream, business hours only (12h) @ 0.25 Mbps | 40.5 |
| Event clips, 40/day × 30s @ 2 Mbps | 9 |

An eight-camera shop mirroring full mainstream footage to the cloud pushes **5.2 TB/month** and
needs ~16 Mbps of *sustained upstream*, forever. That is not a pricing problem to be solved with a
cheaper bucket; it is not available to this customer at any price they would pay.

**Therefore: never mirror the mainstream stream.** The product uploads a deliberately chosen subset.
Every ONVIF/Hikvision/Dahua camera already publishes a low-bitrate substream — it exists for
multi-camera wall displays — and it is the right primary source. Full-resolution mainstream footage
is uploaded only for short windows around events, and otherwise stays on the NVR until someone
asks for it.

That gives three tiers, and — this is the important part — **the tier is chosen by the site's
uplink class, not by the customer's budget:**

| Tier | What uploads | Ingest /cam/mo | Retention | 8-cam site /mo | Sustained uplink |
|---|---|---:|---:|---:|---:|
| **Evidence** | Event clips at full resolution only | 9 GB | 90 days | 72 GB | 0.22 Mbps |
| **Business** | Substream during trading hours + event clips | 49.5 GB | 30 days | 396 GB | 1.22 Mbps |
| **Continuous** | Substream 24/7 + event clips | 90 GB | 30 days | 720 GB | 2.22 Mbps |

And the qualification rule that follows, which is a **sales rule as much as a technical one**:

| Site link | Cost of the site's own data (est.) | Verdict |
|---|---:|---|
| Business fibre, uncapped (est. ~US$120/mo) | flat | All three tiers fine |
| LTE/mobile data at est. US$3/GB | US$216–2,160/mo | **Disqualified** |
| LTE/mobile data at est. US$5/GB | US$360–3,600/mo | **Disqualified** |

A metered mobile link cannot carry this product — not even the Evidence tier, where the customer's
own data bill would be double our subscription. **Fibre or fixed-wireless is a hard qualification
criterion.** Selling an LTE site is selling a refund and a bad review.

For LTE sites there is a real fourth tier worth considering later — thumbnails and event *metadata*
only (a few hundred MB/month), with full clips pulled on demand when someone asks. It is a
different product with a different promise and should not be built until the fibre product works.

---

## 4. Architecture: keep video out of the Next.js app entirely

The single most important structural decision. Huchu is a Next.js application deployed on
serverless-shaped infrastructure, with the only blob path being `lib/uploads/upload-file.ts` —
`@vercel/blob`, whole-`File`-in-memory `put()`, a 10 MB ceiling, and an image/PDF MIME allow-list
in `lib/uploads/policies.ts`. Routing video through that is not a stretch of the existing design;
it is a category error that would be expensive in compute and egress and would put the ERP's
availability on the critical path of a security product.

**Split the planes:**

```
  SITE                          DATA PLANE                     CONTROL PLANE
  ─────                         ──────────                     ─────────────
  NVR / cameras                                                Huchu (Next.js)
    │ RTSP (LAN only)                                            · device registry
    ▼                                                            · camera + policy config
  Archive Bridge  ──── presigned PUT ────▶  Object store         · retention rules
  (on-prem agent) ◀─── presigned URL ────  (R2 / local DC)       · billing + entitlements
    │                                          │                 · hash-chained audit log
    │                                          │                 · operator UI
    └──── control API (mTLS, JSON) ────────────┼────────────────▶ · issues presigned URLs
                                               │
  Viewer browser ◀─── presigned GET ───────────┘   (video never transits Huchu compute)
```

Huchu issues short-lived presigned URLs and stores metadata. Bytes go agent → bucket and bucket →
browser, directly. The module inside this repo stays small: registries, policy, gating, billing,
audit, UI. That is what makes this compatible with the scope trim rather than a repudiation of it —
the heavy, operationally distinctive part lives in its own service with its own deployment.

### 4.1 The Archive Bridge (on-prem agent)

A small always-on device per site — a mini-PC or Pi-class box (est. US$90–150) — running a single
Go or Node binary. Responsibilities:

- Pull RTSP substreams from cameras on the LAN; segment to fragmented MP4 (5-minute segments, not
  30-second ones — segment length directly drives object-store Class A operation costs, and 5
  minutes cuts write ops roughly tenfold against 30 seconds).
- Subscribe to NVR/camera motion and analytics events (ONVIF event service, or the vendor HTTP
  event stream) and pull mainstream clips with pre/post-roll around each.
- Hash each segment on creation, before it leaves the box.
- **Buffer to local disk and resume.** ZESA load-shedding and link outages are normal, not
  exceptional. The agent must survive a hard power cut mid-segment, resume uploads on return, and
  never lose the ordering of what it has queued. Size local buffer for at least 24 hours of the
  site's tier.
- Bandwidth shaping: a configurable ceiling, and the ability to defer bulk backfill to off-peak
  hours while event clips always go immediately.
- Heartbeat with health: cameras reachable, disk free, queue depth, last successful upload, uptime.
- Fetch-on-demand: when an operator requests a time range that was never uploaded, the agent pulls
  it from the NVR and uploads it.

**Enrolment should copy `lib/accounting/fdms-device.ts`.** That module already does keypair
generation, a hand-built PKCS#10 CSR, certificate issuance and mTLS transport
(`fdms-connector.ts`) for ZIMRA fiscal devices. The same shape — agent generates a keypair, CSR,
gets a per-site certificate, all subsequent control-plane calls are mTLS — gives per-site identity
that a copied config file cannot impersonate. This is the strongest piece of reuse available and
it removes the most security-sensitive thing from the "invent it" list.

### 4.2 Where the bytes live

Egress, not storage, is what kills video services. Customers scrub, and every scrub is egress.

| Provider | Storage | Egress | Note |
|---|---:|---:|---|
| **Cloudflare R2** | $15/TB/mo | **$0** | Zero egress is decisive for a playback product |
| Backblaze B2 | $6/TB/mo | free to 3× stored | Cheapest, egress policy has a ceiling |
| Wasabi | $6.99/TB/mo | "free" ≤ stored volume | Policy-capped, not contractually unlimited |
| AWS S3 Standard | $23/TB/mo | ~$90/TB | Disqualified on egress alone |
| Local Zim datacentre | est. $40/TB/mo | on-net | Most expensive per TB, cheapest for the customer |

**Recommendation: R2 as the default tier, with a local Zimbabwean datacentre evaluated seriously as
a hot tier.** The local option looks expensive per terabyte and is probably still correct, because
it changes the customer's cost rather than ours: an archive peered at ZINX means upload traffic
stays on-net and does not consume the customer's expensive international bandwidth, and playback is
local-latency instead of 200 ms+. Several local ISPs price on-net traffic very differently from
international. If that holds, it is worth more than the per-TB delta — but it is **(est.)** and
needs a real quote and a real peering conversation before anyone builds on it.

A defensible end state is hot tier local (first 7–30 days, where all the scrubbing happens), cold
tier R2 (the retention tail). Do not build tiering in v1.

### 4.3 What must be built that has no precedent here

The infrastructure audit is unambiguous about four gaps:

1. **Metered billing does not exist in any form.** `PricingLineItem.type` in
   `lib/platform/entitlements.ts` is `"tier" | "site-overage" | "addon" | "addon-site" | "feature"`,
   and both per-unit dimensions are counts of static entities read at bill time, not accumulated
   consumption. There is no usage record, no meter, no quota, no rating pass, no proration.
   *Mitigation: don't need it.* See §6 — price per camera per month, flat, and make retention a
   tier property. A camera count is exactly the kind of static entity the existing model already
   bills. **Metered GB billing would be the single most expensive thing on this list and the
   product does not require it.**
2. **Real object storage.** No S3/R2 client, no presigning, no multipart or resumable upload, no
   lifecycle or retention management, no server-side encryption. All genuinely new, but it is a
   well-trodden path and it lives in the new service, not in the Next.js app.
3. **Device registry, enrolment and heartbeat.** No generic device model, no `lastSeenAt`, no
   enrolment token flow. The FDMS pattern is the template; the registry itself is new.
4. **A scheduler.** Workers exist as a pattern — `scripts/fiscal-worker.ts` plus the
   `FOR UPDATE SKIP LOCKED` lease in `lib/accounting/fiscal-drain.ts` is a good, tested shape to
   copy for retention-expiry and health-sweep jobs — but nothing in this repo schedules or
   supervises a long-running process. Something outside it must.

### 4.4 What is reusable as-is

- `lib/audit/platform.ts` — SHA-256 hash-chained `PlatformAuditEvent`, committed in the same
  transaction as the action. This *is* the chain-of-custody log; the old module's separate
  `CameraAccessLog` should not come back. Note the documented caveat: concurrent events fork the
  chain rather than totally ordering it, so it is tamper-evident, not sequence-proving. For
  evidence handling that distinction may matter and should be stated plainly to customers.
- The feature-gating chain — `lib/platform/feature-catalog.ts` → `gating/route-registry.ts` →
  `navigation.ts` → `workspace-products.ts` → `client-templates.ts` → `permission-catalog.ts`, per
  the CONTRIBUTING checklist. Note `FeatureDomain` has no `"security"` member; it needs one.
- The job-lease pattern in `fiscal-drain.ts` + `fiscal-worker.ts`.
- `lib/offline/` (outbox, `attachment-store.ts`, `connectivity.ts`) for an operator console that
  stays usable on a bad link. Browser-scale, not video-scale — but the right model for the UI.
- Tenancy, auth, roles, notifications, and the `lib/payments` gateway seam.

---

## 5. Unit economics

Storage is not the business. At R2 pricing, per camera per month:

| Tier | Steady-state stored | Storage COGS |
|---|---:|---:|
| Evidence (90-day) | 27 GB | **$0.40** |
| Business (30-day) | 49.5 GB | **$0.74** |
| Continuous (30-day) | 90 GB | **$1.35** |

Even tripled for operations, redundancy and a local-datacentre premium, marginal COGS lands around
$1–3 per camera per month. Gross margin at any sane price is 75–90%:

Eight-camera site, Business tier, COGS $7.92/site/mo (storage + est. ops):

| Price/cam | MRR | Gross margin | After est. support ($6) + platform ($2) |
|---:|---:|---:|---:|
| $4 | $32 | 75.2% | $16.08 |
| $5 | $40 | 80.2% | $24.08 |
| **$6** | **$48** | **83.5%** | **$32.08** |
| $8 | $64 | 87.6% | $48.08 |
| $10 | $80 | 90.1% | $64.08 |

**So the margin is not the question. Two other things are.**

### 5.1 CAC payback is the real risk

Every site needs a box and a visit before it earns anything:

| Upfront | Installer commission | Monthly contribution | Payback |
|---|---:|---:|---:|
| $90 box + $40 install = $130 | 20% | $22.48 | **5.8 months** |
| $150 box + $80 install = $230 | 20% | $22.48 | **10.2 months** |
| $150 box + $80 install = $230 | 30% | $17.68 | **13.0 months** |

Ten to thirteen months of payback, in a market with real payment-collection friction and where a
business closing is not unusual, is how a company with good gross margins runs out of cash.

**The fix is structural, and it is the most important financial recommendation in this memo: sell
the Archive Bridge as hardware, upfront, at or slightly above cost.** Charge, say, $180 for the
box and installation. CAC becomes revenue, payback becomes immediate, and the recurring line is
pure contribution from month one. This also filters for intent — a customer who pays for the box
is a customer who has decided — and it matches how this market already buys security equipment.
Every objection to this is an objection to charging for a thing that has a real cost.

### 5.2 The revenue ceiling is modest for the operational weight

| Sites | Cameras | MRR | ARR | Monthly gross contribution |
|---:|---:|---:|---:|---:|
| 25 | 200 | $1,200 | $14,400 | $852 |
| 100 | 800 | $4,800 | $57,600 | $3,408 |
| 400 | 3,200 | $19,200 | $230,400 | $13,632 |

Four hundred installed sites — a genuinely large field operation, with trucks, technicians,
hardware inventory and a support queue that gets called every time ZESA takes a suburb down — is
$230k ARR.

For comparison, 400 tenants on the Grow SKU at $99 is $475k ARR with no hardware, no site visits
and no physical logistics. **Per unit of operational effort, this is a lower-quality revenue line
than the core ERP.**

That is not a reason to refuse it. It is a different line with a different buyer, a much shorter
sales cycle, no data migration, and a fear-driven purchase that closes in one visit rather than a
quarter. It is defensible precisely *because* it is operationally annoying — that is the moat
against a pure-software competitor. But it should be entered with the revenue ceiling understood,
and it should not be resourced out of the ERP roadmap's budget.

### 5.3 The comparison that actually closes the sale

A security guard in Zimbabwe costs roughly **US$150–250/month (est.)**. An eight-camera site at $6
is $48. The pitch is not "cloud storage for your cameras" — nobody wants storage. It is *"a fifth
of one guard, and this one cannot be bribed, cannot sleep, and its statement is admissible."*
Price against the guard, not against Dropbox.

---

## 6. Packaging

Flat per-camera-per-month, billed on camera count. **Do not build metered GB billing** — it is the
most expensive gap in §4.3, and pricing on gigabytes would also be actively hostile to the
customer, who cannot predict how much their own cameras will move.

Indicative, to be fitted into `lib/platform/feature-catalog.ts` alongside the founder-locked tier
ladder:

| SKU | Price | Contents |
|---|---:|---|
| `ADDON_CCTV_ARCHIVE` — Evidence | $4/camera/mo | Event clips, 90-day retention |
| `ADDON_CCTV_ARCHIVE` — Business | $6/camera/mo | Trading-hours substream + events, 30-day |
| `ADDON_CCTV_ARCHIVE` — Continuous | $9/camera/mo | 24/7 substream + events, 30-day |
| Archive Bridge | $180 one-off | Hardware + installation |
| Extended retention | +$2/camera/mo per extra 30 days | |

Annual prepay at the platform's existing 20% discount (`ANNUAL_DISCOUNT_RATE`) should be the
default ask, not an option. It solves collection friction, churn and working capital in one move,
and cash upfront is worth more than the discount costs in this market.

Minimum four cameras per site — below that the site visit does not pay for itself.

---

## 7. Distribution: sell through installers, not to end users

Zimbabwe has a large population of small security-installation businesses fitting Hikvision and
Dahua kit. They own the customer relationship, they are already on site, and they already do the
cabling. Building a direct field sales force to compete with them would consume the entire gross
margin in §5.

Sell archival as a line the installer resells at their own markup, with a recurring commission.
The platform already has a precedent and a rate: `docs/rollout/partner-channel-roadmap.md` adopts
**20% recurring revenue share for the life of the account** for the accountant channel. Use the
same number and, where possible, the same mechanics — there is no reason for two partner
programmes with two commission models.

What installers need in order to sell it: a bridge that works with hardware they already fit, an
enrolment flow short enough to finish during an install, a margin they can see, and a support line
that does not make their customer call them first. The last one is the one that gets skipped.

The honest caveat: this is the same class of claim the partner roadmap already flags about
accountants — *"inference, not evidence — it is tested with the first ten partner conversations
before the year is bet on it."* The same discipline applies here, and §10 is built around it.

### Collection

`lib/payments/` already has Paynow, Pesepay and ContiPay adapters behind a clean seam. One known
limitation matters a great deal here — from `lib/payments/service.ts`:

> *"Neither Paynow, Pesepay nor ContiPay has a recurring-subscription object to point at, so the
> most recent settled transaction is the best external handle there is."*

**There is no card-on-file auto-renewal on these rails.** Every renewal is a fresh customer action.
For a $48/month line that the customer does not think about until something is stolen, that is a
serious churn mechanism — and it is another argument for annual prepay being the default ask
rather than a discount option.

---

## 8. Regulatory and legal

Storing other people's surveillance footage is a materially different legal position from storing
their invoices, and it should be priced and staffed accordingly.

- **Data Protection Act [Chapter 11:12] (2021), regulated by POTRAZ.** Operating this makes Huchu
  a data processor for personal data of a particularly sensitive kind — biometric-adjacent imagery
  of identifiable people, most of whom are not the customer. Registration as a data controller and
  appointment of a Data Protection Officer need legal advice before the first paid site, not after.
- **Cross-border transfer.** Storing Zimbabwean footage in an R2 region outside Zimbabwe engages
  the Act's transfer provisions. This is a second, independent argument for a local hot tier, and
  it may turn out to be the decisive one.
- **Interception of Communications Act.** Understand in advance what a lawful production request
  looks like, who inside Huchu can action one, and what the customer is told when it happens.
  Write the answer down before the first request arrives.
- **Customer-side obligations.** Signage, employee notification, and the customer's own lawful
  basis for recording are theirs, not ours — but the contract must say so explicitly, and the
  onboarding flow should make them assert it.
- **Retention and deletion must be provable.** A retention promise is a deletion promise. If the
  product says 30 days, footage must actually be unrecoverable on day 31, and that must be
  demonstrable.

Compliance here is genuinely a differentiator against informal competitors, not just a cost — but
only if it is done properly, and the cost is real: **budget for external legal review as a line
item, not as founder time.**

---

## 9. The case against, stated fairly

Whoever decides this should have the strongest objections in front of them, not buried:

1. **The timing is bad.** `docs/rollout/master-rollout-plan.md` records that the 90-day outcome is
   already unreachable on its original dates, blocked on ZIMRA procurement that nobody started.
   The scope trim that deleted CCTV was a response to exactly this: too many fronts. Opening a new
   vertical — with hardware, field operations and a regulator — while the wedge product is late is
   the specific failure the trim was designed to prevent.
2. **It is a different kind of company.** The ERP is zero-marginal-cost software. This carries
   COGS, inventory, technicians and a 24/7 availability expectation. The operational muscles barely
   overlap. "It reuses our auth and billing" is true and is not the hard part.
3. **The platform reuse is thinner than it looks.** Four of the load-bearing pieces — object
   storage, device registry, scheduling, and the ingest service itself — have no precedent in this
   codebase. Genuine reuse is audit, gating and tenancy: valuable, but not the majority of the work.
4. **Hardware vendors may close the gap for free.** Hikvision and Dahua both ship cloud offerings
   to installers, and their incentive is to make storage a reason to buy more cameras rather than a
   profit centre. If they price aggressively in this market, the differentiation narrows to local
   support, local invoicing and DPA compliance — real, but thinner than the pitch in §2.
5. **The revenue ceiling is modest** (§5.2) for the operational weight.

**The counter-argument, also fairly stated:** this sells to a buyer the ERP cannot reach, on a
shorter cycle, with no data migration, against a budget line (guarding) that already exists and is
larger. It is defensible because it is operationally hard. And unlike the old CCTV module, it is
not competing with a free app that ships in the box.

**The synthesis:** the idea is sound and the timing is not. Which is an argument for §10 rather
than for no.

---

## 10. Recommendation

**Do not write code yet. Run a paid pilot first, and gate everything else on it.**

Almost every number in this memo marked **(est.)** — local bandwidth pricing, datacentre rates,
willingness to pay, installer commission appetite, support load per site — is a guess that a
handful of real conversations would replace with fact. The cost of being wrong about them after
building is far higher than the cost of two weeks of asking.

**Stage 0 — validate (≈2 weeks, no engineering).**
Ten conversations, and they are the deliverable:

- Five CCTV installers: would they resell this, at what markup, what do they already tell customers
  about offsite backup, and what does Hik-Connect already give them for free?
- Five candidate end sites (fuel station, pharmacy, hardware store, bottle store, small chain):
  what does their uplink actually look like, have they lost a recorder, what do they pay for
  guarding, and would they pay $180 upfront?
- In parallel, three supplier quotes: a local datacentre with ZINX peering, a business fibre
  package with real upstream figures, and preliminary legal advice on DPA registration.

**Stage 0 exit criteria — all four, or stop:**
1. At least three of five installers will resell at 20%.
2. At least three of five sites have fibre or fixed-wireless with adequate upstream.
3. At least three sites will pay $180 upfront plus $6/camera/month.
4. Local datacentre pricing and DPA obligations are known numbers, not estimates.

**Stage 1 — pilot (≈6 weeks, one engineer).**
Five paid sites. Deliberately crude: the Archive Bridge (agent, buffering, presigned upload,
heartbeat), direct-to-R2 storage, and a minimal timeline-and-export UI. Hardcode the tier.
**Bill it manually — no SKU, no catalog entry, no schema in this repo yet.** Nothing touches
`feature-catalog.ts` or `prisma/schema.prisma` until the product is known to work.

**Stage 1 exit criteria:** five sites running 60 days; ≥99% of intended segments offsite within
5 minutes; at least one real incident where the archive produced usable evidence; measured support
hours per site per month; and all five renewing.

**Stage 2 — productise.** Only now: the ST-reversal changelog row, the `CONTRIBUTING.md` edit, the
`ADDON_CCTV_ARCHIVE` SKU through the full CONTRIBUTING gating checklist, the device registry in
schema, retention jobs, and a proper roadmap document under `docs/rollout/`.

The decision in front of the founder today is therefore not "should we build CCTV archival." It is
**"is this worth two weeks and ten conversations, given that the FDMS wedge is already late."**
That is a much cheaper question, and it is the only one that needs answering now.

---

## Open questions for the founder

1. Does reopening CCTV clear the scope-trim bar, given FDMS is behind? If yes, what gets deprioritised?
2. Is this staffed separately, or out of the ERP roadmap's capacity? (This memo assumes separately.)
3. Own-brand, or white-labelled to installers who put their own name on it?
4. Is a local datacentre commitment acceptable, given it is the answer to both latency and the DPA
   transfer question — and is a fixed cost before the first customer?
5. Hardware upfront at $180 (§5.1) — agreed, or is there a reason to subsidise it?
