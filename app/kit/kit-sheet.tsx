"use client";

import * as React from "react";

import {
  Banner,
  Button,
  ButtonGroup,
  Check,
  Count,
  Drawer,
  DrawerRow,
  DrawerSection,
  Empty,
  Field,
  FigureStrip,
  Finding,
  FormSection,
  GroupHead,
  Icon,
  Input,
  InputWithIcon,
  Kit,
  Kpi,
  Meter,
  Pill,
  Segmented,
  Select,
  SelectCell,
  Setting,
  Status,
  Switch,
  TableFoot,
  TableShell,
  Tabs,
  TextArea,
  VaneMark,
  useSelection,
} from "@/components/core";
import { ICONS, type IconName } from "@/components/core/icons";

const COLOURS: Array<[string, string]> = [
  ["Ink", "ink"],
  ["Ink 2", "ink-2"],
  ["Muted", "muted"],
  ["Faint", "faint"],
  ["Line", "line"],
  ["Rule", "rule"],
  ["Fill", "fill"],
  ["Ground", "ground"],
  ["Accent", "accent"],
  ["Accent tint", "accent-tint"],
  ["Success", "success"],
  ["Warning", "warning"],
  ["Danger", "danger"],
  ["Info", "info"],
];

const TYPE: Array<[number, number, string]> = [
  [28, 600, "Money in this month"],
  [20, 600, "Bank lines to match"],
  [16, 400, "Four lines from CBZ since Friday are not matched."],
  [14, 400, "Body and table text"],
  [13, 500, "Labels, chips and pills"],
  [12, 400, "Notes under a field"],
];

const INVOICES = [
  { id: "INV-0131", customer: "Chisipite Dental", state: "Overdue", when: "12 days overdue", total: 1240, balance: 1240 },
  { id: "INV-0135", customer: "Highlands Guest Lodge", state: "Overdue", when: "5 days overdue", total: 860, balance: 860 },
  { id: "INV-0137", customer: "Msasa Motors", state: "Overdue", when: "2 days overdue", total: 380, balance: 380 },
  { id: "INV-0140", customer: "Pomona Offices", state: "Due soon", when: "Due 14 Oct", total: 2104.22, balance: 2104.22 },
  { id: "INV-0142", customer: "Borrowdale Brooke Clinic", state: "Paid", when: "Paid 2 Oct, EcoCash", total: 500, balance: 0 },
] as const;

const usd = (value: number) =>
  `$${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Section({ title, aside, children }: { title: string; aside: string; children: React.ReactNode }) {
  return (
    <section className="xp-sec">
      <div>
        <h2>{title}</h2>
        <p className="aside">{aside}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>{children}</div>;
}

export function KitSheet() {
  const [view, setView] = React.useState<"match" | "matched" | "all">("match");
  const [tab, setTab] = React.useState<"element" | "data" | "settings">("element");
  const [watch, setWatch] = React.useState(true);
  const [pay, setPay] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const [clicks, setClicks] = React.useState(0);
  const ids = React.useMemo(() => INVOICES.map((invoice) => invoice.id), []);
  const selection = useSelection(ids);
  const owing = INVOICES.filter((invoice) => selection.isSelected(invoice.id)).reduce((sum, invoice) => sum + invoice.balance, 0);

  return (
    <Kit style={{ background: "var(--color-surface)", minHeight: "100%" }}>
      <div className="xp">
        <div className="xp-k">
          <Icon name="docs" /> Parts
        </div>
        <h1>The kit</h1>
        <p className="lede">
          Every core module is built from these parts: the reference colours, Inter, the filled icons, the table
          with its footer, the finding. Each part shows its states. Change a part here and in the kit, never on one
          page.
        </p>

        <Section title="Colour" aside="Ink on white. One accent. Status colours only carry state.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 16 }}>
            {COLOURS.map(([name, token]) => (
              <div key={token}>
                <span
                  style={{
                    display: "block",
                    height: 56,
                    borderRadius: "var(--radius-control)",
                    boxShadow: "var(--shadow-ring)",
                    background: `var(--color-${token})`,
                  }}
                />
                <b style={{ display: "block", marginTop: 8, fontWeight: 500 }}>{name}</b>
                <code className="mono muted" style={{ fontSize: 12 }}>
                  --color-{token}
                </code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type" aside="Inter in six sizes. Sentence case everywhere. Figures in tabular numerals.">
          {TYPE.map(([size, weight, text]) => (
            <p
              key={size}
              style={{ fontSize: size, fontWeight: weight, display: "flex", justifyContent: "space-between", gap: 16 }}
            >
              <span style={{ color: "var(--color-ink)" }}>{text}</span>
              <code className="mono muted" style={{ fontSize: 12 }}>
                {size}px · {weight}
              </code>
            </p>
          ))}
        </Section>

        <Section title="Buttons" aside="One primary per screen, and it shows its shortcut. The shortcut works: press N.">
          <Row>
            <Button variant="primary" icon="plus" shortcut="N" onClick={() => setClicks((n) => n + 1)}>
              New invoice
            </Button>
            <Button icon="export">Export</Button>
            <Button variant="quiet" icon="filter">
              Filter
            </Button>
            <Button variant="ink" icon="check">
              Accept
            </Button>
            <Button variant="danger" icon="x">
              Retire
            </Button>
            <Button variant="quiet" iconOnly icon="more" label="More" />
            <span className="muted">New pressed {clicks} times</span>
          </Row>
          <Row>
            <Button disabled icon="export">
              Disabled
            </Button>
            <Button busy>Saving</Button>
            <Button variant="primary" busy>
              Publishing
            </Button>
            <Button size="lg" icon="upload" shortcut="U">
              Upload a statement
            </Button>
            <Button size="sm">Small</Button>
          </Row>
          <Row>
            <ButtonGroup aria-label="This list">
              <Button icon="sort">Newest first</Button>
              <Button icon="columns">Columns</Button>
              <Button icon="export">Export</Button>
            </ButtonGroup>
            <ButtonGroup aria-label="Pages">
              <Button icon="back" disabled>
                Previous
              </Button>
              <Button iconEnd="chev">Next</Button>
            </ButtonGroup>
          </Row>
        </Section>

        <Section title="Fields" aside="A label over the control; a note or an error under it. Press / to search.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, maxWidth: 720 }}>
            <Field label="Customer" htmlFor="kit-customer" help="As it reads on the invoice.">
              <Input id="kit-customer" defaultValue="Chisipite Dental" />
            </Field>
            <Field label="VAT number" htmlFor="kit-vat" optional>
              <Input id="kit-vat" placeholder="10012345" />
            </Field>
            <Field label="Amount" htmlFor="kit-amount" error="Write the amount with both decimals: 1,240.00.">
              <Input id="kit-amount" defaultValue="1240" aria-invalid="true" />
            </Field>
            <Field label="Account" htmlFor="kit-account">
              <Select id="kit-account" defaultValue="cbz-usd">
                <option value="cbz-usd">CBZ, USD</option>
                <option value="cbz-zwg">CBZ, ZWG</option>
              </Select>
            </Field>
            <Field label="Paid on" htmlFor="kit-paid">
              <Input id="kit-paid" defaultValue="Fri 2 Oct" disabled />
            </Field>
            <Field label="Search" htmlFor="kit-search">
              <InputWithIcon id="kit-search" type="search" placeholder="Search" shortcut="/" />
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Note" htmlFor="kit-note">
                <TextArea id="kit-note" defaultValue="Paid by EcoCash, reference MP241002.1530." />
              </Field>
            </div>
          </div>
          <Row>
            <Switch checked={watch} onCheckedChange={setWatch} label="Watch Books" />
            <Switch checked={watch} onCheckedChange={setWatch} label="Ink, in Management" ink />
            <Switch checked={pay} onCheckedChange={setPay} label="People's pay and personal details" />
            <Switch checked={false} disabled label="Disabled" />
            <Check defaultChecked label="Send a copy to me" />
            <Check radio name="kit-radio" defaultChecked label="WhatsApp" />
            <Check radio name="kit-radio" label="Email" />
          </Row>
        </Section>

        <Section title="Status" aside="A dot in tables, a pill when it needs more weight, a count for what waits.">
          <Row>
            <Status tone="success">Paid</Status>
            <Status tone="warning">Due soon</Status>
            <Status tone="danger">Overdue</Status>
            <Status tone="info">Sent</Status>
            <Status tone="live">Working</Status>
            <Status>Draft</Status>
          </Row>
          <Row>
            <Pill tone="ok">Matched</Pill>
            <Pill tone="warn">Check</Pill>
            <Pill tone="bad">Failed</Pill>
            <Pill tone="info">New</Pill>
            <Pill tone="n">12</Pill>
            <Count>4</Count>
            <Count urgent>3</Count>
          </Row>
          <div style={{ display: "grid", gap: 8, maxWidth: 320 }}>
            <Meter value={62} label="Showroom sales, 62%" />
            <Meter value={88} warning label="Jobs this month, 88% of the allowance" />
          </div>
        </Section>

        <Section title="Tabs and segments" aside="Segments switch a view of one list; tabs split a panel. Arrow keys move.">
          <Segmented
            label="Lines"
            value={view}
            onChange={setView}
            items={[
              { value: "match", label: "To match", count: 4 },
              { value: "matched", label: "Matched" },
              { value: "all", label: "Everything" },
            ]}
          />
          <Tabs
            label="Block"
            value={tab}
            onChange={setTab}
            items={[
              { value: "element", label: "Element" },
              { value: "data", label: "Data", count: 14 },
              { value: "settings", label: "Settings" },
            ]}
          />
        </Section>

        <Section
          title="Finding and table"
          aside="A list opens on the one fact that matters. Select rows: the selection rises into the footer with its sum; Esc clears it."
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: 520,
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--shadow-ring)",
              overflow: "hidden",
            }}
          >
            <TableShell
              label="Invoices"
              foot={
                <TableFoot
                  range="1 to 5 of 5"
                  sums={[
                    { label: "Owed", value: "$5,724.22" },
                    { label: "Overdue", value: "$2,480.00" },
                  ]}
                  page={{}}
                  selection={{
                    count: selection.selected.size,
                    sum: { label: "Owing", value: usd(owing) },
                    onClear: selection.clear,
                    actions: (
                      <>
                        <Button icon="remind">Send reminders</Button>
                        <Button icon="print">Print statements</Button>
                      </>
                    ),
                  }}
                />
              }
            >
              <Finding
                fact={
                  <>
                    <span className="num">$5,724.22</span> is owed to you on 4 invoices.
                  </>
                }
                rest={
                  <>
                    3 are overdue, <span className="num">$2,480.00</span> in all.
                  </>
                }
              />
              <GroupHead title="Invoices" sum={5} />
              <table className="table">
                <thead>
                  <tr>
                    <SelectCell
                      head
                      label="Select every invoice on this page"
                      checked={selection.all}
                      indeterminate={selection.some}
                      onChange={selection.toggleAll}
                    />
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>State</th>
                    <th>When</th>
                    <th className="num">Total</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {INVOICES.map((invoice) => (
                    <tr key={invoice.id} aria-selected={selection.isSelected(invoice.id)}>
                      <SelectCell
                        label={`Select ${invoice.id}`}
                        checked={selection.isSelected(invoice.id)}
                        onChange={() => selection.toggle(invoice.id)}
                      />
                      <td>
                        <span className="code">{invoice.id}</span>
                      </td>
                      <td>
                        <span className="cell-lead">{invoice.customer}</span>
                      </td>
                      <td>
                        <Status
                          tone={invoice.state === "Paid" ? "success" : invoice.state === "Overdue" ? "danger" : "warning"}
                        >
                          {invoice.state}
                        </Status>
                      </td>
                      <td className="muted">{invoice.when}</td>
                      <td className="num">{usd(invoice.total)}</td>
                      <td className="num">{invoice.balance ? usd(invoice.balance) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </div>
        </Section>

        <Section title="Figure tiles" aside="Headline figures carry colour and type structure, as the retail data tables do.">
          <FigureStrip
            figures={[
              { label: "In this month", value: "$10,228.40", note: "12% more than September", tone: "success" },
              { label: "Owed to you", value: "$5,724.22", note: "4 invoices" },
              { label: "Overdue", value: "$2,480.00", note: "3 invoices", tone: "danger" },
              { label: "In the bank", value: "$8,412.75", note: "Today 06:00" },
            ]}
          />
          <div className="kgrid" style={{ padding: 0 }}>
            <Kpi
              span={4}
              icon="money"
              label="Money in"
              value="$10,228.40"
              note="1 to 6 October"
              bars={[
                { value: 6.2 },
                { value: 7.4 },
                { value: 8.1 },
                { value: 9.1 },
                { value: 10.2, tone: "accent" },
              ]}
            />
            <Kpi span={4} icon="invoice" label="Owed to you" value="$5,724.22" note="4 invoices, 3 overdue" />
            <Kpi span={4} icon="bank" label="In the bank" value="$8,412.75" foot="As of today 06:00" />
          </div>
        </Section>

        <Section title="Settings" aside="A section's title and one line on the left, its rows on the right.">
          <FormSection title="What it watches" description="Vane reads these and raises what needs you.">
            <Setting
              title="Books"
              description="Invoices, payments, the bank and VAT."
              control={<Switch checked={watch} onCheckedChange={setWatch} ink />}
            />
            <Setting
              title="People's pay and personal details"
              description="Off unless you turn it on."
              control={<Switch checked={pay} onCheckedChange={setPay} ink />}
            />
          </FormSection>
        </Section>

        <Section title="States" aside="Empty, a warning, an error. Every page has its own words for them.">
          <Banner tone="warning" actions={<Button size="sm">Upload</Button>}>
            CBZ&apos;s statement is due. The last one ends Friday 2 October.
          </Banner>
          <Banner tone="danger" icon="warn">
            Vane cannot reach the service. It last worked at 06:02.
          </Banner>
          <div style={{ borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-ring)" }}>
            <Empty
              icon="bank"
              title="No bank lines yet"
              action={
                <Button variant="primary" icon="upload" shortcut="U">
                  Upload a statement
                </Button>
              }
            >
              Upload CBZ&apos;s statement and Vane matches each line to a sale, an invoice or a bill.
            </Empty>
          </div>
        </Section>

        <Section title="Drawer" aside="A drawer from the right over a dimmed page. Esc or the scrim closes it.">
          <Row>
            <Button icon="edit" onClick={() => setDrawer(true)}>
              Open a drawer
            </Button>
          </Row>
          <Drawer
            open={drawer}
            onOpenChange={setDrawer}
            title="Junior fitter"
            footer={
              <>
                <Button onClick={() => setDrawer(false)}>Cancel</Button>
                <Button variant="primary" shortcut="Ctrl ↵" onClick={() => setDrawer(false)}>
                  Save
                </Button>
              </>
            }
          >
            <DrawerSection title="Details">
              <DrawerRow label="Code">
                <span className="code">JG-02</span>
              </DrawerRow>
              <DrawerRow label="Name">
                <Input defaultValue="Junior fitter" />
              </DrawerRow>
            </DrawerSection>
          </Drawer>
        </Section>

        <Section title="Vane" aside="The mark and the top bar button. The count is what waits for you.">
          <Row>
            <VaneMark size={16} />
            <VaneMark size={20} />
            <VaneMark size={24} />
            <button className="btn vn-b" aria-pressed="false" aria-label="Vane, 5 for you" type="button">
              <VaneMark />
              <span className="ask-l">Vane</span>
              <span className="vn-c">5</span>
              <span className="live-d" aria-hidden="true" />
            </button>
          </Row>
        </Section>

        <Section title="Icons" aside="Filled, on a 24 grid, drawn at 16 or 20.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 12 }}>
            {(Object.keys(ICONS) as IconName[]).map((name) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: 12,
                  borderRadius: "var(--radius-control)",
                  boxShadow: "var(--shadow-ring)",
                }}
              >
                <Icon name={name} size={20} />
                <code className="mono muted" style={{ fontSize: 12 }}>
                  {name}
                </code>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </Kit>
  );
}
