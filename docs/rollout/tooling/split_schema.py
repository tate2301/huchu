"""Split prisma/schema.prisma into one file per module (zero-diff refactor).

Blocks (model/enum) keep the comment lines directly above them. Comment groups
that stand alone (section banners and design notes) attach to the next block, so
nothing written in the schema is lost. Order within each file follows the
original file.
"""
import re, sys, os, collections

SRC = sys.argv[1]
OUT = sys.argv[2]
lines = open(SRC).read().split("\n")

# ---- 1. parse into blocks ---------------------------------------------------
blocks = []  # (kind, name, [lines incl. attached comments])
i = 0
pending_comments = []  # comment/blank lines not yet attached
header = []            # generator + datasource blocks
while i < len(lines):
    line = lines[i]
    m = re.match(r"^(model|enum|type|datasource|generator|view)\s+(\w+)\s*\{", line)
    if m:
        kind, name = m.group(1), m.group(2)
        body = []
        while True:
            body.append(lines[i])
            if lines[i].startswith("}"):
                break
            i += 1
        i += 1
        # attached comments = trailing comment run in pending (no blank line between)
        attached = []
        while pending_comments and pending_comments[-1].startswith("//"):
            attached.insert(0, pending_comments.pop())
        # anything else pending (orphan groups) also attaches to this block
        orphan = [l for l in pending_comments if l.strip() != ""]
        pending_comments = []
        chunk = (orphan + [""] if orphan else []) + attached + body
        if kind in ("datasource", "generator"):
            header.append((kind, name, chunk))
        else:
            blocks.append((kind, name, chunk))
        continue
    pending_comments.append(line)
    i += 1
trailing = [l for l in pending_comments if l.strip() != ""]

# ---- 2. assign blocks to files ------------------------------------------------
PREFIX_RULES = [
    ("School", "campus"),
    ("Retail", "sell"),
    ("Gold", "gold"), ("Buyer", "gold"), ("Settlement", "gold"), ("EditingLock", "gold"),
    ("ShiftReport", "gold"), ("PlantReport", "gold"), ("Downtime", "gold"), ("ReportStatus", "gold"),
    ("Payroll", "people"), ("Disbursement", "people"), ("Compensation", "people"), ("Paye", "people"),
    ("Statutory", "people"), ("TaxCredit", "people"), ("Nec", "people"), ("FixedSalary", "people"),
    ("EmployeePayment", "people"), ("Adjustment", "people"), ("Approval", "people"), ("Leave", "people"),
    ("PublicHoliday", "people"), ("HrIncident", "people"), ("Disciplinary", "people"), ("Training", "people"),
    ("Employee", "people"), ("Employment", "people"), ("Department", "people"), ("JobGrade", "people"),
    ("Attendance", "people"), ("ShiftGroup", "people"), ("WorkType", "people"), ("PaymentStatus", "people"),
    ("WorkflowStatus", "people"), ("PayoutMethod", "people"), ("PenaltyStatus", "people"), ("PeriodPurpose", "people"),
    ("Inventory", "stock"), ("StockLocation", "stock"), ("StockMovement", "stock"), ("MovementType", "stock"),
    ("Product", "stock"), ("PriceList", "stock"), ("UnitOfMeasure", "stock"),
    ("Equipment", "maintenance"), ("WorkOrder", "maintenance"),
    ("Permit", "compliance"), ("Inspection", "compliance"), ("Incident", "compliance"),
    ("DocumentTemplate", "documents"), ("DocumentRenderJob", "documents"), ("DocumentArtifact", "documents"),
    ("DocumentType", "documents"), ("ExportTargetType", "documents"), ("TemplateScope", "documents"),
    ("RenderMode", "documents"), ("RenderStatus", "documents"),
    ("Notification", "notifications"), ("UserNotification", "notifications"), ("WebPush", "notifications"),
    ("CrmTask", "records"), ("CrmComment", "records"), ("CrmRecordFile", "records"), ("CrmMention", "records"),
    ("CrmFollower", "records"), ("CrmRecurrence", "records"),
    ("Crm", "crm"),
    ("Accounting", "books"), ("ChartOfAccount", "books"), ("Journal", "books"), ("Posting", "books"),
    ("Tax", "books"), ("Currency", "books"), ("Customer", "books"), ("Vendor", "books"), ("Sales", "books"),
    ("Credit", "books"), ("Purchase", "books"), ("Debit", "books"), ("PaymentLedger", "books"), ("Bank", "books"),
    ("Tender", "books"), ("Vat", "books"), ("OpeningBalance", "books"), ("PeriodClose", "books"), ("CostCenter", "books"),
    ("Fiscal", "books"), ("AccountType", "books"), ("AccountNodeType", "books"), ("AllocationType", "books"),
    ("InvoiceStatus", "books"), ("QuotationStatus", "books"), ("BillStatus", "books"), ("NoteStatus", "books"),
    ("WriteOffStatus", "books"), ("ReconciliationStatus", "books"),
    ("Company", "platform"), ("IdSequence", "platform"), ("GlobalIdSequence", "platform"), ("Subscription", "platform"),
    ("Platform", "platform"), ("Feature", "platform"), ("UserFeatureFlag", "platform"), ("UserPermissionOverride", "platform"),
    ("PaymentWebhookEvent", "platform"), ("Marketing", "platform"), ("Provisioning", "platform"), ("Subdomain", "platform"),
    ("Support", "platform"), ("Runbook", "platform"), ("TenantSlo", "platform"), ("Health", "platform"), ("Contract", "platform"),
    ("Site", "platform"), ("Section", "platform"), ("User", "platform"), ("TenantStatus", "platform"), ("WorkspaceProfile", "platform"),
]
OVERRIDES = {
    # People: the mine's shift/worker enums live with payroll, not gold
    "EmployeeModule": "people", "EmployeePosition": "people",
    # Accounting enums whose names do not start with an accounting prefix
    "AccountingIntegrationStatus": "books", "AccountingSourceType": "books", "PaymentLedgerAccountType": "books",
    "PaymentLedgerEntryStatus": "books",
    # Gold-specific enums with generic names
    "GoldShiftSplitMode": "gold",
    # NextAuth tables, by exact name so the accounting prefixes cannot catch them
    "Account": "auth", "Session": "auth", "VerificationToken": "auth",
    # ChartOfAccount uses AccountType; AccountingSettings etc. by prefix
}

def assign(name):
    if name in OVERRIDES:
        return OVERRIDES[name]
    for prefix, target in PREFIX_RULES:
        if name.startswith(prefix):
            return target
    return None

files = collections.OrderedDict()
unassigned = []
for kind, name, chunk in blocks:
    target = assign(name)
    if target is None:
        unassigned.append(f"{kind} {name}")
        continue
    files.setdefault(target, []).append((kind, name, chunk))

if unassigned:
    print("UNASSIGNED:", unassigned)
    sys.exit(1)

# ---- 3. write files -----------------------------------------------------------
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith(".prisma"):
        os.remove(os.path.join(OUT, f))

DESCRIPTIONS = {
    "platform": "Tenancy, entitlements, control plane, audit. The kernel: every module relates to Company, Site, Section and User.",
    "auth": "NextAuth tables.",
    "people": "People module: staff directory, attendance, leave, compensation, payroll, disbursements, statutory tables, HR incidents. The directory (Employee, Department, JobGrade) is read by Campus, Maintenance and Gold.",
    "books": "Books module: chart of accounts, journals, posting rules, tax, sales and purchase ledgers, banking, VAT, fiscalisation. Modules contribute source types and default accounts.",
    "stock": "Stock module: stock locations, inventory items and movements, products and price lists.",
    "records": "Records module: collaboration on any record — tasks, comments, files, mentions, followers — keyed by (subjectType, subjectId). Still carries the Crm prefix; renamed when convenient.",
    "documents": "Documents module: templates, versions, render jobs and artifacts.",
    "notifications": "Notifications module: in-app notifications, recipients, preferences, web push.",
    "maintenance": "Maintenance add-on: equipment and work orders.",
    "compliance": "Compliance add-on: permits, inspections, incidents.",
    "sell": "Sell product: registers, shifts, tills, held carts, sales, purchase orders, goods receipts, promotions.",
    "crm": "CRM product: clients, leads, deals, pipelines, activities, automations, intake, commissions, custom fields, work orders.",
    "campus": "Campus product: academic structure, students and guardians, enrolment, boarding, results, fees, attendance, timetable, admissions, library, transport, imports.",
    "gold": "Gold (enterprise-only, composed into the enterprise host only): pours, purchases, dispatches, buyer receipts, shift allocations, ledger imports, period close, settlements, shift and plant reports, downtime.",
}

ORDER = ["platform", "auth", "people", "books", "stock", "records", "documents", "notifications", "maintenance", "compliance", "sell", "crm", "campus", "gold"]
missing = [f for f in files if f not in ORDER]
assert not missing, missing

# schema.prisma carries datasource + generator only
with open(os.path.join(OUT, "schema.prisma"), "w") as fh:
    fh.write("// One Prisma schema, one file per module. Prisma's multi-file schema reads every\n")
    fh.write("// .prisma file in this folder as a single datamodel: relations across files are\n")
    fh.write("// ordinary relations, there is one generated client and one migration history.\n")
    fh.write("// A module's tables live in its file; a module writes another module's tables only\n")
    fh.write("// through that module's public entrypoint (docs/rollout/product-split-plan.md).\n\n")
    for kind, name, chunk in header:
        fh.write("\n".join(chunk) + "\n\n")

for target in ORDER:
    if target not in files:
        continue
    entries = files[target]
    with open(os.path.join(OUT, f"{target}.prisma"), "w") as fh:
        fh.write(f"// {DESCRIPTIONS[target]}\n\n")
        for kind, name, chunk in entries:
            fh.write("\n".join(chunk).rstrip("\n") + "\n\n")

for target in ORDER:
    if target in files:
        kinds = collections.Counter(k for k, _, _ in files[target])
        print(f"{target:14s} models={kinds.get('model',0):3d} enums={kinds.get('enum',0):3d}")
if trailing:
    print("TRAILING (dropped):", trailing)
