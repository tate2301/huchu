/**
 * What Vane may read, worked out from the Prisma schema.
 *
 * Vane reads the workspace as one of two database roles, never as the app:
 *
 * - `vane_reader`: SELECT on the workspace's records, without people's pay and
 *   personal details.
 * - `vane_reader_private`: the same, plus pay and personal details. Used only
 *   when Management → Vane → "People's pay and personal details" is on.
 *
 * Both are cut down three ways:
 *
 * 1. Rows: every readable table carries a restrictive row policy, so a reader
 *    sees only the workspace its connection is bound to in `VaneReaderScope`.
 *    A table without `companyId` is readable only through a required link to a
 *    readable parent, and its rows follow the parent's.
 * 2. Columns: grants are per column, so a column added later stays unreadable
 *    until it is granted on purpose.
 * 3. Never: credentials (passwords, tokens, keys, secrets) and the tables that
 *    hold them are granted to neither role.
 *
 * `scripts/vane-reader-sql.ts` turns this into the SQL in the migration. When a
 * later migration adds tables Vane should read, run it again and ship the
 * grants it prints in that migration.
 */

export type SchemaField = {
  name: string;
  /** The column's name in the database (`@map`), or the field name. */
  column: string;
  type: string;
  list: boolean;
  optional: boolean;
  /** For a relation field: the local and referenced fields. */
  relation?: { fields: string[]; references: string[] };
};

export type SchemaModel = {
  name: string;
  /** The table's name in the database (`@@map`), or the model name. */
  table: string;
  fields: SchemaField[];
};

const SCALARS = new Set(["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes"]);

/** Reads models out of a Prisma schema: enough of it to decide grants and policies. */
export function parseSchema(text: string): SchemaModel[] {
  const enums = new Set([...text.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]!));
  const models: SchemaModel[] = [];
  for (const block of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const name = block[1]!;
    const body = block[2]!;
    const mapped = body.match(/^\s*@@map\("([^"]+)"\)/m);
    const fields: SchemaField[] = [];
    for (const raw of body.split("\n")) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      if (!line || line.startsWith("@@")) continue;
      const m = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
      if (!m) continue;
      const [, fieldName, type, list, optional, rest] = m;
      const columnMap = rest!.match(/@map\("([^"]+)"\)/);
      const relation = rest!.match(/@relation\(([^)]*)\)/);
      const relFields = relation?.[1]!.match(/fields:\s*\[([^\]]*)\]/);
      const relRefs = relation?.[1]!.match(/references:\s*\[([^\]]*)\]/);
      const isScalar = SCALARS.has(type!) || enums.has(type!);
      fields.push({
        name: fieldName!,
        column: columnMap?.[1] ?? fieldName!,
        type: type!,
        list: Boolean(list),
        optional: Boolean(optional),
        relation:
          !isScalar && relFields && relRefs
            ? { fields: splitList(relFields[1]!), references: splitList(relRefs[1]!) }
            : undefined,
      });
    }
    models.push({ name, table: mapped?.[1] ?? name, fields: fields.filter((f) => isScalarField(f, enums) || f.relation) });
  }
  return models;
}

function splitList(list: string): string[] {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isScalarField(field: SchemaField, enums: Set<string>): boolean {
  return SCALARS.has(field.type) || enums.has(field.type);
}

/** Tables that hold credentials, sign-in state, invitations or webhooks. Neither role may read them. */
export const NEVER_TABLE =
  /^(Account|Session|SessionHandoff|SupportSession|VerificationToken)$|ApiKey|Webhook|Credential|Password|Otp|Token|Secret|Passkey|Authenticator|TwoFactor|Invite|PairingCode|TillPin|EmailCode/;

/**
 * A person's own conversation with Vane. A job answering one person must not
 * read what another typed to Vane, so neither role reads it; the chat reads it
 * through the app, for its own person only.
 */
export const CONVERSATION_TABLE = /^VaneMessage$/;

const CREDENTIAL_WORDS = new Set(["password", "secret", "secrets", "token", "hash", "salt", "otp", "pin"]);

/** A column that holds a credential, on any table: a password, secret, token, hash, PIN or key. Neither role may read it. */
export function isCredentialColumn(name: string): boolean {
  const words = name.split(/_|(?=[A-Z])/).map((w) => w.toLowerCase());
  return words.some((w) => CREDENTIAL_WORDS.has(w)) || /(apikey|privatekey|accesskey|signingkey|secretref)/i.test(name);
}

/** Pay: whole tables only `vane_reader_private` reads. */
export const PRIVATE_TABLE =
  /(Payroll|Payslip|Salary|Compensation|Disbursement|EmployeePayment|Paye|StatutoryRate|EmployeeLoan|SalaryAdvance|Gratuity|Pension|GoldShiftWorkerShare)/;

/** The tables about people (staff, pupils, guardians) whose personal details are private. */
export const PEOPLE_TABLE = /^(Employee|User|SchoolStudent|SchoolGuardian|SchoolTeacherProfile)$/;

/** Personal details on a people table: identity numbers, bank and mobile money, phones, addresses, birth, health, tax, pay rates. */
export const PRIVATE_COLUMN =
  /(phone|nationalid|idnumber|passport|birth|bank|mobilemoney|taxnumber|taxstatus|nssa|disability|villageoforigin|nextofkin|salary|hourlyrate|medical|allerg|address)/i;

/** Vane's own bookkeeping that the reader roles handle separately. */
const SCOPE_TABLE = "VaneReaderScope";

export type Readable = {
  model: string;
  table: string;
  /** Columns `vane_reader` may select. */
  columns: string[];
  /** Columns only `vane_reader_private` may select (on top of `columns`). */
  privateColumns: string[];
  /** The whole table is pay or personal: only `vane_reader_private` reads it. */
  privateTable: boolean;
  /** How its rows are tied to the workspace. */
  /**
   * How its rows are tied to the workspace: its own `companyId`, or links to
   * readable parents. A row is visible when any of its links reaches a visible
   * parent; a row whose links are all empty is not.
   */
  scope: { kind: "company"; column: string } | { kind: "parents"; links: ParentLink[] };
};

export type ParentLink = { column: string; parentTable: string; parentColumn: string };

export type ReaderAccess = {
  readable: Readable[];
  /** Tables neither role reads, and why. */
  unreadable: Array<{ table: string; reason: "credentials" | "conversation" | "no workspace link" | "scope" }>;
};

/** Decides, table by table, what each reader role may select and how its rows are scoped. */
export function readerAccess(models: SchemaModel[]): ReaderAccess {
  const byName = new Map(models.map((m) => [m.name, m]));
  const scoped = new Map<string, Readable["scope"]>();
  const unreadable: ReaderAccess["unreadable"] = [];

  for (const model of models) {
    if (model.name === SCOPE_TABLE) continue;
    if (NEVER_TABLE.test(model.name)) continue;
    const companyId = model.fields.find((f) => f.name === "companyId" && f.type === "String");
    if (model.name === "Company") scoped.set(model.name, { kind: "company", column: "id" });
    else if (companyId) scoped.set(model.name, { kind: "company", column: companyId.column });
  }

  // A table without companyId is scoped through its links. Depth 0 is a table
  // with its own companyId; a table one link away from depth 0 is depth 1, and
  // so on. A row is visible when any of its links to a shallower table reaches a
  // visible row; links only ever point up, so policies cannot loop.
  const depth = new Map<string, number>([...scoped.keys()].map((name) => [name, 0]));
  const linkable = (model: SchemaModel) =>
    model.fields.filter(
      (f) => f.relation && !f.list && f.relation.fields.length === 1 && byName.has(f.type) && !NEVER_TABLE.test(f.type),
    );
  for (let level = 1, changed = true; changed; level += 1) {
    changed = false;
    for (const model of models) {
      if (depth.has(model.name) || model.name === SCOPE_TABLE || NEVER_TABLE.test(model.name)) continue;
      if (linkable(model).some((f) => (depth.get(f.type) ?? Infinity) < level)) {
        depth.set(model.name, level);
        changed = true;
      }
    }
  }
  for (const model of models) {
    const own = depth.get(model.name);
    if (!own) continue;
    const links = linkable(model).flatMap((link): ParentLink[] => {
      if ((depth.get(link.type) ?? Infinity) >= own) return [];
      const parent = byName.get(link.type)!;
      const local = model.fields.find((f) => f.name === link.relation!.fields[0]);
      const remote = parent.fields.find((f) => f.name === link.relation!.references[0]);
      return local && remote ? [{ column: local.column, parentTable: parent.table, parentColumn: remote.column }] : [];
    });
    scoped.set(model.name, { kind: "parents", links });
  }

  const readable: Readable[] = [];
  for (const model of models) {
    if (model.name === SCOPE_TABLE) {
      unreadable.push({ table: model.table, reason: "scope" });
      continue;
    }
    if (NEVER_TABLE.test(model.name)) {
      unreadable.push({ table: model.table, reason: "credentials" });
      continue;
    }
    if (CONVERSATION_TABLE.test(model.name)) {
      unreadable.push({ table: model.table, reason: "conversation" });
      continue;
    }
    const scope = scoped.get(model.name);
    if (!scope) {
      unreadable.push({ table: model.table, reason: "no workspace link" });
      continue;
    }
    const scalars = model.fields.filter((f) => !f.relation && !isCredentialColumn(f.name));
    const people = PEOPLE_TABLE.test(model.name);
    const privateTable = PRIVATE_TABLE.test(model.name);
    const isPrivate = (f: SchemaField) => people && PRIVATE_COLUMN.test(f.name);
    readable.push({
      model: model.name,
      table: model.table,
      columns: privateTable ? [] : scalars.filter((f) => !isPrivate(f)).map((f) => f.column),
      privateColumns: privateTable ? scalars.map((f) => f.column) : scalars.filter(isPrivate).map((f) => f.column),
      privateTable,
      scope,
    });
  }
  return { readable, unreadable };
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** The workspace a reader connection is bound to; null when it is bound to none. */
const BOUND_COMPANY = `(SELECT s."companyId" FROM ${ident(SCOPE_TABLE)} s WHERE s."pid" = pg_backend_pid())`;

/** The SQL that creates both roles, scopes every readable table and grants the columns. Re-runnable. */
export function readerSql(access: ReaderAccess): string {
  const out: string[] = [];
  out.push(
    `-- Roles. NOLOGIN here: give each a password by hand on the server (see docs/vane.md); none is kept in git.`,
    `DO $$`,
    `BEGIN`,
    `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vane_reader') THEN CREATE ROLE vane_reader NOLOGIN; END IF;`,
    `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vane_reader_private') THEN CREATE ROLE vane_reader_private NOLOGIN; END IF;`,
    `END $$;`,
    `GRANT vane_reader TO vane_reader_private;`,
    `GRANT USAGE ON SCHEMA public TO vane_reader;`,
    ``,
    `-- The binding: the app writes (pid → workspace) inside the reading transaction. A reader sees only its own row and cannot write it.`,
    `ALTER TABLE ${ident(SCOPE_TABLE)} ENABLE ROW LEVEL SECURITY;`,
    `CREATE POLICY "app_all" ON ${ident(SCOPE_TABLE)} AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);`,
    `CREATE POLICY "vane_own_pid" ON ${ident(SCOPE_TABLE)} AS RESTRICTIVE FOR SELECT TO vane_reader USING ("pid" = pg_backend_pid());`,
    `GRANT SELECT ("pid", "companyId") ON ${ident(SCOPE_TABLE)} TO vane_reader;`,
    ``,
    `-- Every readable table: rows of the bound workspace only, for the readers; nothing changes for anyone else.`,
  );
  for (const t of access.readable) {
    const where =
      t.scope.kind === "company"
        ? `${ident(t.scope.column)} = ${BOUND_COMPANY}`
        : t.scope.links
            .map((l) => `EXISTS (SELECT 1 FROM ${ident(l.parentTable)} p WHERE p.${ident(l.parentColumn)} = ${ident(t.table)}.${ident(l.column)})`)
            .join(" OR ");
    out.push(
      `ALTER TABLE ${ident(t.table)} ENABLE ROW LEVEL SECURITY;`,
      `CREATE POLICY "app_all" ON ${ident(t.table)} AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);`,
      `CREATE POLICY "vane_workspace" ON ${ident(t.table)} AS RESTRICTIVE FOR SELECT TO vane_reader USING (${where});`,
    );
    if (t.columns.length) out.push(`GRANT SELECT (${t.columns.map(ident).join(", ")}) ON ${ident(t.table)} TO vane_reader;`);
    if (t.privateColumns.length) {
      out.push(`GRANT SELECT (${t.privateColumns.map(ident).join(", ")}) ON ${ident(t.table)} TO vane_reader_private;`);
    }
  }
  return out.join("\n") + "\n";
}

/**
 * A sales rep's reading (`vane_reader_rep`, the PageVanePhone board): a
 * fitter asks Vane about their own visits and quotes, so Vane reads as a role
 * granted only the CRM tables a visit and its quote need, whose rows narrow
 * to the rep bound to the connection. The rest of the workspace (Books, pay,
 * stock, other reps' deals) it is not granted at all.
 *
 * Each table is one of:
 * - `own`: the rep's own rows, by the column naming them;
 * - `through`: rows of one of the rep's own parents (a visit's answers);
 * - `linkedFrom`: rows one of the rep's own rows points at (a quote's quotation);
 * - `workspace`: the whole workspace's (the client's name, the form's questions).
 *
 * `vane_reader` is a member of this role (it switches to it with SET ROLE for a
 * rep), so these policies apply to its own readings too: with no rep bound,
 * they let every row of the workspace through.
 */
export type RepRule =
  | { own: string }
  | { through: Array<{ column: string; parent: string }> }
  | { linkedFrom: { model: string; column: string } }
  | "workspace";

export const REP_TABLES: Record<string, RepRule> = {
  CrmAppointment: { own: "assignedToId" },
  CrmDeal: { own: "assignedToId" },
  CrmLead: { own: "assignedToId" },
  CrmLeadDocument: { through: [{ column: "dealId", parent: "CrmDeal" }, { column: "leadId", parent: "CrmLead" }] },
  CrmSiteVisitSection: { through: [{ column: "appointmentId", parent: "CrmAppointment" }] },
  CrmSiteVisitAnswer: { through: [{ column: "sectionId", parent: "CrmSiteVisitSection" }] },
  CrmSiteVisitPhoto: { through: [{ column: "appointmentId", parent: "CrmAppointment" }] },
  CrmSiteVisitItem: { through: [{ column: "appointmentId", parent: "CrmAppointment" }] },
  SalesQuotation: { linkedFrom: { model: "CrmLeadDocument", column: "quotationId" } },
  SalesQuotationLine: { through: [{ column: "quotationId", parent: "SalesQuotation" }] },
  CrmClient: "workspace",
  CrmPerson: "workspace",
  CrmSite: "workspace",
  CrmPipelineStage: "workspace",
  CrmQuestionSet: "workspace",
  CrmQuestion: "workspace",
  Product: "workspace",
};

/** The rep bound to a reader connection; null when it reads for the whole workspace. */
const BOUND_USER = `(SELECT s."userId" FROM ${ident(SCOPE_TABLE)} s WHERE s."pid" = pg_backend_pid())`;

/** The SQL that makes `vane_reader_rep`: its grants, and a row policy on each of its tables. Re-runnable on a fresh database. */
export function repReaderSql(access: ReaderAccess): string {
  const byModel = new Map(access.readable.map((t) => [t.model, t]));
  const table = (model: string) => {
    const found = byModel.get(model);
    if (!found) throw new Error(`${model} is not readable by vane_reader, so a rep cannot read it either.`);
    return found;
  };
  const column = (model: string, name: string) => {
    if (!table(model).columns.includes(name)) throw new Error(`${model}.${name} is not a column vane_reader reads.`);
    return ident(name);
  };
  const out: string[] = [
    `-- A sales rep's reading: vane_reader switches to this role (SET LOCAL ROLE) when the person asking is a rep.`,
    `DO $$`,
    `BEGIN`,
    `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vane_reader_rep') THEN CREATE ROLE vane_reader_rep NOLOGIN; END IF;`,
    `END $$;`,
    `GRANT vane_reader_rep TO vane_reader;`,
    `GRANT USAGE ON SCHEMA public TO vane_reader_rep;`,
    `CREATE POLICY "vane_rep_own_pid" ON ${ident(SCOPE_TABLE)} AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("pid" = pg_backend_pid());`,
    `GRANT SELECT ("pid", "companyId", "userId") ON ${ident(SCOPE_TABLE)} TO vane_reader_rep;`,
  ];
  for (const [model, rule] of Object.entries(REP_TABLES)) {
    const t = table(model);
    const self = ident(t.table);
    const workspace =
      t.scope.kind === "company"
        ? `${ident(t.scope.column)} = ${BOUND_COMPANY}`
        : t.scope.links.map((l) => `EXISTS (SELECT 1 FROM ${ident(l.parentTable)} p WHERE p.${ident(l.parentColumn)} = ${self}.${ident(l.column)})`).join(" OR ");
    const narrowed =
      rule === "workspace"
        ? null
        : "own" in rule
          ? `${self}.${column(model, rule.own)} = ${BOUND_USER}`
          : "through" in rule
            ? rule.through
                .map((link) => `EXISTS (SELECT 1 FROM ${ident(table(link.parent).table)} p WHERE p."id" = ${self}.${column(model, link.column)})`)
                .join(" OR ")
            : `EXISTS (SELECT 1 FROM ${ident(table(rule.linkedFrom.model).table)} d WHERE d.${column(rule.linkedFrom.model, rule.linkedFrom.column)} = ${self}."id")`;
    const where = narrowed ? `(${workspace}) AND (${BOUND_USER} IS NULL OR ${narrowed})` : workspace;
    out.push(
      `CREATE POLICY "vane_rep" ON ${self} AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (${where});`,
      `GRANT SELECT (${t.columns.map(ident).join(", ")}) ON ${self} TO vane_reader_rep;`,
    );
  }
  return out.join("\n") + "\n";
}
