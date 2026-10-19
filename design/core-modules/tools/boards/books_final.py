"""Books, its final form: the explainer boards for the Books page of the canvas.

    cd design/core-modules && python3 tools/boards/books_final.py boards/canvas

BooksResearch: how Zimbabwean businesses handle money, from the research brief (as of 18 Oct 2026).
BooksMoodboard: the patterns Books borrows, drawn as kit sketches (no screenshots, no logos).
From spec/books-final.md:
BooksCore (§1), BooksTree (§3.2, §3.4), BooksWho (§2), BooksStates1-3 (§4), BooksFlows1-8 (§5).
"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import *
from explain import sec, cards
ROOT = sys.argv[1]


# ---------- shared pieces ----------
def head(kicker, title, lede):
    return '<div class="xp-k">%s<span>%s</span></div><h1>%s</h1><p class="lede">%s</p>' % (ic('books'), kicker, title, lede)

def flag(text='To confirm'):
    return '<span class="pill pill-warn">%s</span>' % text

def note(text, pill=True):
    """A To confirm line under a section's figures."""
    return '<p style="display:flex;gap:12px;align-items:baseline;margin-top:16px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">%s<span>%s</span></p>' % (flag() if pill else '', text)

def boxed(inner):
    return '<div class="card" style="padding:0;overflow:hidden">%s</div>' % inner

def ptable(head, body, widths):
    """A prose table with fixed column widths."""
    t = table(head, body, cls='table is-prose')
    return t.replace('<thead>', '<colgroup>%s</colgroup><thead>' % ''.join('<col style="width:%s">' % w for w in widths), 1)

def rows(items, first=240):
    return '<div class="xp-rows">%s</div>' % ''.join(
        '<div class="xp-row" style="grid-template-columns:%dpx minmax(0,1fr);gap:16px;padding:10px 0;line-height:1.5"><b>%s</b><span>%s</span></div>' % (first, a, b) for a, b in items)

def sub(text):
    return '<h3 style="font-size:14px;font-weight:600;margin:32px 0 12px;color:var(--color-ink)">%s</h3>' % text

def kstrip(tiles):
    return '<div class="kstrip" style="grid-template-columns:repeat(%d,minmax(0,1fr))">%s</div>' % (len(tiles), ''.join(
        '<div class="kt"><span class="kt-l">%s</span><span class="kt-v">%s</span><span style="font-size:12px;color:var(--color-muted);line-height:1.4">%s</span></div>' % t for t in tiles))

def flow(steps):
    """Boxes joined by arrows, for a short sequence."""
    n = len(steps)
    cols = ' 20px '.join(['minmax(0,1fr)'] * n)
    out = '<span class="muted" style="text-align:center">→</span>'.join(
        '<div class="xp-card" style="padding:12px 14px"><b style="margin:0 0 4px;font-size:14px">%s</b><p>%s</p></div>' % s for s in steps)
    return '<div style="display:grid;grid-template-columns:%s;align-items:stretch;gap:6px">%s</div>' % (cols, out.replace('<span class="muted" style="text-align:center">', '<span class="muted" style="text-align:center;align-self:center">'))


# ---------- BooksResearch ----------
def month_strip():
    hot = {5: 'var(--color-ink)', 10: 'var(--color-ink)', 15: 'var(--color-ink)'}
    cells = ''.join(
        '<div style="height:36px;display:grid;place-items:center;border-radius:6px;font-size:12px;font-variant-numeric:tabular-nums;%s">%d</div>' % (
            'background:var(--color-ink);color:var(--color-surface);font-weight:600' if d in hot else 'background:var(--color-ground);color:var(--color-muted)', d)
        for d in range(1, 32))
    strip = '<div style="display:grid;grid-template-columns:repeat(31,minmax(0,1fr));gap:2px">%s</div>' % cells
    due = '<div class="xp-cards" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:16px">%s</div>' % ''.join(
        '<div class="xp-card"><span class="mono" style="font-size:20px;font-weight:600;color:var(--color-ink)">%s</span><b>%s</b><p>%s</p></div>' % c for c in (
            ('5th', 'Monthly returns', 'PAYE return (the long return, in TaRMS) and the 30% withholding return for last month.'),
            ('10th', 'Pay PAYE and withholding, file VAT', 'Pay last month’s PAYE, AIDS levy and withholding. File the VAT 7 return for the period that just ended.'),
            ('15th', 'Pay the VAT', 'Pay the VAT on that return. Payment moved from the 25th in early 2025, the return to the 10th in August 2025 (SI 81 of 2025).')))
    return strip + due + note('ZIMRA’s own web pages still show the 25th for VAT. The dated public notices (PN 34/2026, PN 49/2026) give the 10th and the 15th, and they win.')

def year_strip():
    months = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')
    def row(label, vals, dot=False):
        cells = ''
        for v in vals:
            if not v:
                cells += '<span></span>'
            elif dot:
                cells += '<span style="display:grid;place-items:center"><i style="width:8px;height:8px;border-radius:999px;background:var(--color-ink-2)"></i></span>'
            else:
                cells += '<span style="display:grid;place-items:center;height:26px;border-radius:6px;background:var(--color-accent-tint);color:var(--color-accent);font-size:12px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap">%s</span>' % v
        return '<div style="display:grid;grid-template-columns:150px repeat(12,minmax(0,1fr));gap:4px;align-items:center;min-height:36px;box-shadow:inset 0 -1px 0 var(--color-line)"><span style="font-size:13px;color:var(--color-ink-2)">%s</span>%s</div>' % (label, cells)
    hdr = '<div style="display:grid;grid-template-columns:150px repeat(12,minmax(0,1fr));gap:4px;height:32px;align-items:center;font-size:12px;font-weight:500;color:var(--color-muted)"><span></span>%s</div>' % ''.join('<span style="text-align:center">%s</span>' % m for m in months)
    qpd = ['', '', '20 · 10%', '', '', '20 · 25%', '', '', '20 · 30%', '', '', '15 · 35%']
    ann = ['', '', '', '30', '', '', '', '', '', '', '', '']
    end = [''] * 11 + ['31']
    a = [1 if i % 2 == 0 else 0 for i in range(12)]
    b = [1 if i % 2 == 1 else 0 for i in range(12)]
    body = hdr + row('Provisional tax (QPD)', qpd) + row('Income tax return', ann) + row('Tax year ends', end) + row('VAT period ends, A', a, True) + row('VAT period ends, B', b, True) + row('VAT period ends, C', [1] * 12, True)
    return (body + '<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">A QPD is 10%, 25%, 30% and 35% of the year’s estimated tax. Category A and B file every two months, C every month, D on a period the Commissioner sets. A VAT return is due on the 10th of the month after its period ends.</p>'
            + note('QPD payment dates disagree. PN 17/2026 and PN 36/2026 give payment on 25 Mar and 25 Jun, while the PN 36 table shows 20 Jun; the older calendar gives 25 Mar, Jun and Sep and 20 Dec. Which months A and B end in is inferred from the notices.'))

def vat():
    tiles = kstrip((('Standard rate', '15.5%', 'from 1 Jan 2026; 15% before'), ('Must register at', 'US$25,000', 'taxable supplies in 12 months'),
                    ('Category C above', 'US$240,000', 'files every month'), ('Claim input tax within', '12 months', 'of the invoice date')))
    change = boxed(table(('Supply', 'Until 31 Dec 2025', 'From 1 Jan 2026'), (
        ('Agricultural goods', 'Zero-rated', '<b>Exempt</b>'), ('Medicines', 'Zero-rated', '<b>Exempt</b>'), ('Rural electrification', '—', '<b>Exempt</b>'),
        ('Tourism services', 'Zero-rated', '<b>No longer zero-rated</b>'), ('Sale of a going concern', 'Zero-rated', '<b>Standard-rated</b>'),
        ('Exports and related services', 'Zero-rated', 'Zero-rated'), ('School fees, medical, residential rent, financial services', 'Exempt', 'Exempt'))))
    inp = cards((
        ('fiscal', 'Only from valid fiscal invoices', 'Input tax counts only on a fiscal tax invoice that shows Valid on the FDMS portal, with the buyer’s details right. From the January 2026 periods TaRMS fills it in from FDMS.'),
        ('list', 'Manual schedules, now narrow', 'Only imports, imported capital goods, imported services and VAT withheld still go on a hand-made schedule.'),
        ('invoice', 'What the invoice must show', 'The words Fiscal Tax Invoice, both parties’ names, VAT numbers and TINs, serial number, date, currency, VAT and total, the FDMS QR code. One per supply, within 30 days; none under US$10.')), 3)
    exempt = '<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">Exempt means no VAT charged and no input tax back. Zero-rated means VAT at 0%, and the input tax is claimed. A school charges no VAT on fees and claims none on what it buys.</p>'
    return (tiles + sub('What changed on 1 January 2026') + change + exempt + sub('Input tax') + inp
            + note('TaRMS now has a VAT return line “Supply of goods or services at 10% (Exports)”. What it covers is not clear yet.')
            + note('Penalties: up to US$30 a day for a late return, and 100% of unpaid VAT plus interest.', pill=False))

def fdms():
    day = flow((('Open the fiscal day', 'The device or the server starts the day with FDMS.'), ('Sign each receipt', 'Each one timed after the last, carrying its own number and signature.'),
                ('Close the day', 'Counters and a signature go to FDMS. The Z report is the day’s close.'), ('Check it', 'Anyone can enter the code at fdms.zimra.co.zw and see Valid.')))
    c = cards((
        ('takings', 'Devices', 'Fiscal cash registers, fiscal printers, electronic signature devices for B2B invoices, or a central server that talks to FDMS by API. A fault is reported to ZIMRA within 8 hours.'),
        ('edit', 'Corrections', 'An issued invoice is never edited. A fiscalised credit or debit note corrects it: it names the original receipt, uses its currency, carries the reason (return, price, cancellation, discount, bad debt).'),
        ('warn', 'Penalties', 'US$25 for each point of sale for each day, up to 181 days. After that it is a criminal offence. FDMS compliance is a condition of the tax clearance certificate (ITF263).')), 3)
    return ('<p style="margin-bottom:16px;line-height:1.6;color:var(--color-ink-2)">Every VAT-registered business must fiscalise every sale and send it to ZIMRA’s Fiscalisation Data Management System. Fiscal memory is read-only, and no other system may record sales without approval.</p>'
            + day + '<div style="margin-top:16px">%s</div>' % c
            + note('Receipts are hash-chained and a day has a maximum length: from vendor API documents, as ZIMRA’s own API text could not be read. The credit note rules above are also from vendor documents.')
            + note('No official void process was found. Books treats a fiscalised document as corrected only by a credit note.'))

def currencies():
    docu = ('<div class="card" style="padding:20px 24px"><div style="display:flex;align-items:center;gap:12px"><span class="ref">INV-0142</span><span class="pill pill-info">Issued</span><span class="muted" style="margin-left:auto;font-size:13px">14 Oct 2026</span></div>'
            '<p style="margin-top:16px;font:600 24px/1.2 var(--font-sans);font-variant-numeric:tabular-nums;color:var(--color-ink)">US$1,240.00 <span style="font-weight:400;font-size:16px;color:var(--color-muted)">· ZiG 33,480</span></p>'
            '<div style="margin-top:16px">%s</div>'
            '<p style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:var(--color-ink-2)">%s Fixed when the invoice was issued. Paying it later at another rate makes a gain or loss line, never a new total.</p></div>') % (
        rows((('Currency of the invoice', 'USD'), ('Rate', '<span class="mono">27.00</span> ZiG to US$1'), ('Rate from', 'RBZ interbank, 14 Oct 2026')), 180), ic('lock'))
    pts = '<ul class="dots">%s</ul>' % ''.join('<li>%s</li>' % x for x in (
        'The ZiG (code ZWG) came in on 5 April 2024 (SI 60 of 2024). The US dollar is still legal tender, so most firms trade in both.',
        'The RBZ says the interbank market alone sets the official rate. Since SI 34 of 2025 (15 April 2025) firms may price at market rates; ICAZ accepts a credible market closing rate that can be checked.',
        'Every fiscal invoice states its currency. A credit note uses the original’s currency.',
        'Taxes are paid in the currency of trade, except income tax: with more than half of income in foreign currency, the firm splits it 50/50 and accounts in USD and ZWG.',
        'VAT on imported services is paid in USD from 1 January 2026. NSSA is paid in ZiG at the interbank rate.',
        'Many USD-led firms report in USD. Firms reporting in ZWG still apply hyperinflation accounting (IAS 29), on EY’s April 2026 view.'))
    return ('<div style="display:grid;grid-template-columns:420px minmax(0,1fr);gap:32px;align-items:start">%s%s</div>' % (docu, pts)
            + note('Finance Act 2024 s4A lets the foreign-currency part of tax be paid in ZWG at the rate on the day; commentators read the wording differently. No rule was found that forces prices in both currencies, and no current PAAB view on the ZWG.'))

def withholding():
    t = boxed(ptable(('Charge', 'Rate', 'When it applies', 'Return and payment'), (
        ('<b>Withholding on contracts</b>', '30%', 'Paying a supplier with no valid tax clearance (ITF263), once payments to them reach US$1,000 in a year. Not employment.', 'Return by the 5th, pay by the 10th'),
        ('<b>VAT withholding</b>', '⅓ of the VAT', 'Appointed agents, mostly large firms, on standard-rated supplies. They give a certificate; the supplier claims it on its own return.', 'With the VAT return'),
        ('<b>Value chain withholding</b>', '5%', 'Manufacturers and wholesalers, on purchases by buyers who are not compliant.', '—'),
        ('<b>Presumptive rental tax</b>', '10%', 'Rent paid to presumptive landlords. New in 2026.', '—'),
        ('<b>IMTT</b>', '2% USD · 1.5% ZiG', 'Every electronic transfer, taken by the bank. One transfer over US$500,000 pays a flat US$10,150.', 'Taken at source'),
        ('<b>AFTT</b>', 'US$0.05', 'Each cash withdrawal over US$100.', 'Taken at source')), ('22%', '16%', '42%', '20%')))
    return (t + '<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">IMTT lands on every EcoCash, ZIPIT and RTGS leg, so Books records it as its own bank charge. Before paying a supplier, check the ITF263: without it, 30% is withheld.</p>'
            + note('The US$1,000 threshold dates from 2022 and was not reconfirmed for 2026. The 2–3% cash-withdrawal levy that was proposed was dropped.'))

def payroll():
    t = boxed(ptable(('Charge', 'Who pays', 'Rate', 'On'), (
        ('<b>PAYE</b>', 'Employee, through the employer', 'USD tables: nil up to US$100 a month, 40% above US$36,000 a year', 'Taxable pay; a mixed salary uses the USD table and splits the tax'),
        ('<b>AIDS levy</b>', 'Employee', '3%', 'The PAYE'),
        ('<b>NSSA</b>', 'Employee and employer', '4.5% + 4.5%', 'Earnings up to US$700 a month; paid in ZiG at the interbank rate'),
        ('<b>ZIMDEF</b>', 'Employer', '1%', 'The wage bill'),
        ('<b>Standards Development Fund</b>', 'Employer', '0.5%', 'The gross wage bill')), ('24%', '20%', '28%', '28%')))
    return (t + '<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">The PAYE return is due by the 5th and the payment by the 10th. Corporate income tax is 25% plus the 3% AIDS levy, 25.75% in effect.</p>'
            + note('These are the 2025 PAYE tables; the 2026 tables were not confirmed. ZIMDEF’s rate comes from a secondary source.'))

def records():
    return cards((
        ('clock', 'Six years', 'Keep records for at least 6 years (Income Tax Act s37B, VAT Act s57). Not keeping them is an offence.'),
        ('docs', 'English, and retrievable', 'Books in English. Electronic records are fine if ZIMRA officers can reach them and get them back in their original form.'),
        ('lock', 'Issued is final', 'Fiscal memory is read-only and one fiscal invoice exists per supply, so an issued document is corrected, never edited or deleted.'),
        ('list', 'Serial numbers', 'The law asks for an individual serial number on each invoice; FDMS counters make the run auditable.')), 4) + (
        note('No explicit “no gaps” rule was found; Books numbers without gaps anyway. Public companies must be audited and private ones are exempt; check against the Companies and Other Business Entities Act (2020).'))

def smes():
    chips = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">%s</div>' % ''.join(
        '<span class="chipsel" style="padding:0 12px">%s</span>' % c for c in ('EcoCash', 'InnBucks', 'OneMoney', 'ZIPIT', 'RTGS in ZiG', 'RTGS in USD (Nostro FCA)', 'Card swipe', 'USD cash'))
    c = cards((
        ('payments', 'Mobile money first', 'About 87% of electronic payments by volume in Q1 2026 went through mobile money. Each wallet is an account to reconcile, in each currency.'),
        ('takings', 'Cash, counted daily', 'US dollar cash is still common. A daily cash-up against the fiscal day’s Z report, and the takings banked.'),
        ('expenses', 'Petty cash and requisitions', 'An imprest float with petty cash vouchers. Spending starts as a requisition: approved by someone else, paid out, then acquitted with the slips.'),
        ('store', 'Buying', 'Requisition, purchase order, goods received, the supplier’s fiscal invoice, then payment. Check their ITF263 and that the invoice shows Valid.'),
        ('invoice', 'Selling', 'Quotation, fiscal invoice, then the payment allocated. Contract jobs, flooring among them, take deposits, which raise time-of-supply questions.'),
        ('person', 'Month end with the accountant', 'A bookkeeper or an outside accountant closes the month: bank and wallet reconciliations, VAT working schedule, journals in Pastel or Sage, or in a spreadsheet.')), 3)
    return (chips + c + note('Accountants here are mostly trained on Sage Pastel, with QuickBooks and spreadsheets common in small firms. This is practice we have seen, not from the sourced brief.')
            + '<p style="margin-top:8px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">Pay ZIMRA by deposit or transfer against the TIN; a payment is not allocated until its return is filed. The tax year is the calendar year.</p>')

def rules_grid():
    rs = (('Issued is final', 'A fiscalised invoice, a posted payment, a closed month: never edited or deleted. A correction is a new document (credit note, debit note, reversing journal) linked to the original. Only drafts can be deleted. Everything keeps its history for 6 years.'),
          ('Each document keeps its own currency', 'USD or ZiG, the rate, and where the rate came from, fixed at issue. Nothing converts in place; reports convert and show the gain or loss.'),
          ('The calendar leads', 'Money opens on what is due and how much: VAT by the 15th, PAYE by the 10th, the next QPD. The dates sit in one table, because ZIMRA has moved them twice since 2025.'),
          ('Fiscalise at issue', 'A sale is done when FDMS has signed it. Device and fiscal-day errors show where the owner looks, not in a log.'),
          ('Only valid invoices claim VAT', 'Input tax counts once the supplier’s fiscal invoice shows Valid. The supplier record carries its ITF263 and warns of the 30% before anyone pays.'),
          ('Money by channel', 'Every cash box, wallet and bank account, in each currency, is its own account with its own reconciliation. IMTT is a separate charge, never netted away.'),
          ('Plain on top, double entry underneath', 'The owner reads money in, money out, owed to you and you owe. The accountant gets journals, the trial balance, the GL and period close, with the same figures, laid out the way Pastel taught them.'),
          ('Two people where money leaves', 'Requisitions, supplier payments, credit notes and pay runs need a second person. Nobody approves their own, and nobody both approves and pays.'))
    return '<div class="xp-cards" style="grid-template-columns:1fr 1fr">%s</div>' % ''.join(
        '<div class="xp-card" style="display:grid;grid-template-columns:32px minmax(0,1fr);gap:8px;padding:20px 24px"><span class="mono muted">%02d</span><div><b style="margin:0 0 6px">%s</b><p style="font-size:14px">%s</p></div></div>' % (i + 1, a, b) for i, (a, b) in enumerate(rs))

def sources():
    return ('<p style="margin-top:40px;padding-top:24px;box-shadow:inset 0 1px 0 var(--color-line);font-size:12px;line-height:1.7;color:var(--color-muted);max-width:1100px">'
            '<b style="font-weight:600;color:var(--color-ink-2)">Sources, as of 18 October 2026.</b> ZIMRA public notices 34/2026 (VAT rate and input tax), 49/2026 and 44/2026 (due dates), 53/2025 (SI 81 of 2025), 17/2026 and 36/2026 (QPDs, the 50/50 rule), '
            '7/2026 (VAT rate change), 50/2026 (2026 law in TaRMS), 63/2025 (TaRMS and FDMS), 30/2025 (buyer details), 92/2023 (FDMS compliance), 16/2025 (fiscal invoices only), 24/2026 (non-residents). '
            'ZIMRA guidance on VAT registration, the mechanics of VAT, the fiscal tax invoice, fiscalisation and its penalties, record keeping and PAYE. SI 60 of 2024, SI 34 of 2025, SI 99 of 2024; Finance Act No. 7 of 2025 and Finance Act 2024. '
            'EY post-budget tax spotlight (Nov 2025) and hyperinflationary economies (Apr 2026); KPMG on the 2024 and 2026 budgets; Muvingi &amp; Mugadza on VAT for 2026; RBZ payments data for Q1 2026. '
            'Vendor documents (Odoo, Paynow) for FDMS credit notes and fiscal days. The full list of 50 links is in the research brief. '
            '%s marks what is uncertain, recently changed, or for a tax adviser to confirm.</p>') % flag()

def research():
    body = '<div class="xp">%s%s%s%s%s%s%s%s%s%s%s</div>' % (
        head('Books', 'How Zimbabwean businesses handle money',
             'What the law asks and what firms actually do, as of 18 October 2026. Books is built on this: every module posts its money through Books, so these rules hold whether the sale came from the CRM, the till, a school or the gold room. %s marks what a tax adviser should confirm.' % flag()),
        sec('The tax calendar', 'Three dates every month, and the year’s fixed points. ZIMRA has moved these dates twice since early 2025, so Books keeps them in one table.', month_strip() + sub('The year') + year_strip()),
        sec('VAT', 'VAT Act [Chapter 23:12]. Rate, threshold and categories decide how often a firm files and what it can claim back.', vat()),
        sec('Fiscalisation', 'FDMS: every sale signed by ZIMRA as it happens. It is why an issued invoice can only be corrected, never changed.', fdms()),
        sec('Two currencies', 'USD and ZiG side by side. The document’s own currency and rate are the record; everything else is a view.', currencies()),
        sec('Withholding and levies', 'Money the business takes off a payment, or the bank takes off a transfer, on ZIMRA’s behalf.', withholding()),
        sec('Payroll charges', 'What every pay run works out, files and pays. Payroll posts one entry to Books per run.', payroll()),
        sec('Records', 'What ZIMRA can ask to see, and for how long.', records()),
        sec('How small firms actually work', 'Practice, not law: the channels, the controls and who does the books at month end.', smes()),
        sec('What this means for Books', 'Eight rules the Books core and its screens follow. Breaking one is a defect.', rules_grid()),
        sources())
    return write(ROOT, 'BooksResearch', 'Books · How Zimbabwean businesses handle money', body, h=6100)


# ---------- BooksMoodboard: kit sketches ----------
def bar(w, tone='var(--color-fill)', h=8):
    return '<i style="display:block;width:%s;height:%dpx;border-radius:4px;background:%s"></i>' % (w, h, tone)

def box(inner, style=''):
    return '<div style="padding:8px 10px;border-radius:8px;background:var(--color-surface);box-shadow:var(--shadow-ring);font-size:12px;color:var(--color-ink-2);%s">%s</div>' % (style, inner)

def amt(v, big=False):
    return '<span style="font-variant-numeric:tabular-nums;font-weight:600;color:var(--color-ink);font-size:%dpx;white-space:nowrap">%s</span>' % (18 if big else 12, v)

def sm(label, primary=False):
    return '<span style="display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:500;white-space:nowrap;%s">%s</span>' % (
        'background:var(--color-ink);color:var(--color-surface)' if primary else 'background:var(--color-surface);box-shadow:var(--shadow-ring);color:var(--color-ink)', label)

def sketch(inner):
    return '<div style="height:188px;box-sizing:border-box;padding:16px;border-radius:10px;background:var(--color-ground);overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:8px">%s</div>' % inner

def sk_bank():
    tiles = '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">%s</div>' % ''.join(
        box('<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">%s<span class="chip-n" style="height:18px;font-size:11px">%s</span></div><div style="margin-top:6px">%s</div>' % (bar('48%'), n, amt(v))) for v, n in (('US$8,410.20', 4), ('US$1,962.00', 9), ('ZiG 24,310', 2)))
    line = ('<div style="display:grid;grid-template-columns:minmax(0,1fr) 16px minmax(0,1fr);gap:6px;align-items:center">%s<span class="muted" style="text-align:center">↔</span>%s</div>') % (
        box('<div style="display:flex;justify-content:space-between;gap:6px"><span>14 Oct · EcoCash</span>%s</div>%s' % (amt('1,240.00'), bar('70%', h=6))),
        box('<div style="display:flex;justify-content:space-between;align-items:center;gap:6px"><span class="ref">INV-0131</span>%s</div><div style="display:flex;gap:6px;margin-top:6px">%s%s</div>' % (amt('1,240.00'), sm('Match', True), sm('Create'))))
    return sketch(tiles + line)

def sk_inout():
    def side(label, v, w):
        return box('<span>%s</span><div style="margin:4px 0 8px">%s</div>%s' % (label, amt(v, True), bar(w, 'var(--color-ink-2)', 6)), 'padding:10px 12px')
    two = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">%s%s</div>' % (side('Money in', 'US$10,228.40', '80%'), side('Money out', 'US$6,914.15', '54%'))
    snap = ('<div style="display:grid;grid-template-columns:40px 16px 56px 16px minmax(0,1fr);gap:6px;align-items:center">'
            '<span style="display:grid;place-items:center;width:40px;height:40px;border-radius:8px;background:var(--color-surface);box-shadow:var(--shadow-ring)">%s</span><span class="muted">→</span>'
            '<div style="height:52px;padding:6px;border-radius:4px;background:var(--color-surface);box-shadow:var(--shadow-ring);display:flex;flex-direction:column;gap:4px">%s%s%s</div><span class="muted">→</span>%s</div>') % (
        ic('camera'), bar('90%', h=4), bar('60%', h=4), bar('75%', h=4),
        box('<div style="display:flex;justify-content:space-between;gap:6px"><span>Draft expense</span>%s</div><div style="margin-top:4px;color:var(--color-muted)">Supplier, amount, VAT read off the slip</div>' % amt('42.50')))
    return sketch(two + snap)

def sk_tax():
    pts = (('10 Nov', 'PAYE', 'US$1,184.30', False), ('15 Nov', 'VAT', 'US$2,310.00', True), ('15 Dec', 'QPD 4', 'US$3,900.00', False))
    line = '<div style="position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding-top:22px">'
    line += '<i style="position:absolute;left:8px;right:8px;top:6px;height:2px;background:var(--color-rule)"></i>'
    for d, what, v, now in pts:
        line += ('<div style="position:relative"><i style="position:absolute;left:10px;top:-21px;width:12px;height:12px;border-radius:999px;%s"></i>%s</div>') % (
            'background:var(--color-ink);box-shadow:0 0 0 3px var(--color-ground)' if now else 'background:var(--color-surface);box-shadow:inset 0 0 0 2px var(--color-ink-2),0 0 0 3px var(--color-ground)',
            box('<div class="mono" style="font-size:11px;color:var(--color-muted)">%s</div><div style="font-weight:600;color:var(--color-ink);margin:2px 0">%s</div>%s<div style="margin-top:4px;font-size:11px;color:var(--color-muted)">%s</div>' % (
                d, what, amt(v), 'so far, from 48 invoices' if now else 'worked out')))
    line += '</div>'
    return sketch(line)

def sk_approve():
    chain = '<div style="display:grid;grid-template-columns:auto 16px auto 16px auto;gap:6px;align-items:center;justify-content:start">%s<span class="muted">→</span>%s<span class="muted">→</span>%s</div>' % (
        '<span class="pill pill-n">Draft</span>', '<span class="pill pill-warn">Waiting for Rudo</span>', '<span class="pill pill-ok">Approved</span>')
    req = box('<div style="display:flex;justify-content:space-between;align-items:center;gap:6px"><span><span class="ref">REQ-0088</span> · Adhesive, Pomona job</span>%s</div><div style="display:flex;gap:6px;margin-top:8px">%s%s</div>' % (
        amt('US$310.00'), sm('Approve', True), sm('Send back')))
    lock = '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-ink-2)"><span style="display:inline-grid;place-items:center;width:22px;height:22px;border-radius:6px;background:var(--color-surface);box-shadow:var(--shadow-ring)">%s</span>Locked to 30 Sep 2026 · VAT filed</div>' % ic('lock', 'ic" style="width:12px;height:12px')
    return sketch(chain + req + lock)

def sk_pastel():
    months = ''.join('<span style="display:grid;place-items:center;height:22px;border-radius:4px;font-size:10px;%s">%s</span>' % (
        'background:var(--color-ink-2);color:var(--color-surface)' if i < 9 else ('background:var(--color-surface);box-shadow:inset 0 0 0 1.5px var(--color-ink);color:var(--color-ink);font-weight:600' if i == 9 else 'background:var(--color-surface);color:var(--color-faint)'), m)
        for i, m in enumerate('JFMAMJJASOND'))
    per = '<div style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:3px">%s</div>' % months
    def tr(a, d, c, tot=False):
        st = 'font-weight:600;color:var(--color-ink);box-shadow:inset 0 1px 0 var(--color-rule)' if tot else ''
        return '<div style="display:grid;grid-template-columns:minmax(0,1fr) 70px 70px;gap:8px;padding:3px 0;font-size:11px;font-variant-numeric:tabular-nums;%s"><span class="mono">%s</span><span style="text-align:right">%s</span><span style="text-align:right">%s</span></div>' % (st, a, d, c)
    tb = box(tr('<span style="font-family:var(--font-sans);font-weight:500">Account</span>', 'Debit', 'Credit') + tr('1010 Bank CBZ', '8,410.20', '') + tr('2100 VAT output', '', '1,904.11') + tr('4000 Sales', '', '6,506.09') + tr('Total', '8,410.20', '8,410.20', True), 'padding:6px 10px')
    return sketch(per + tb)

def sk_timeline():
    ev = (('Created', 'Rudo', '09:12', False), ('Fiscalised', 'FDMS', '09:14', False), ('Sent', 'WhatsApp', '09:15', False), ('Part-paid', 'US$600.00, EcoCash', '16 Oct', True))
    tl = ''.join('<div style="display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:8px;align-items:center;font-size:12px;min-height:22px"><i style="width:8px;height:8px;border-radius:999px;justify-self:center;background:%s"></i><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="font-weight:500;color:var(--color-ink)">%s</span> <span class="muted">· %s</span></span><span class="mono muted" style="font-size:11px">%s</span></div>' % (
        'var(--color-ink)' if last else 'var(--color-rule)', a, b, t) for a, b, t, last in ev)
    words = '<div style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--color-ink-2)">%s<span>before it is fiscalised</span><span class="muted">·</span>%s<span>after</span></div>' % (sm('Void'), sm('Credit note'))
    return sketch(box(tl, 'padding:8px 12px') + words)

def sk_bulk():
    rowsx = ''.join('<div style="display:grid;grid-template-columns:18px 70px minmax(0,1fr) 60px;gap:8px;align-items:center;height:22px;font-size:12px"><span class="cb%s" style="width:14px;height:14px"></span><span class="ref">%s</span>%s<span style="text-align:right">%s</span></div>' % (
        ' on' if on else '', r, bar('70%', h=6), amt(v)) for r, v, on in (('INV-0127', '880.00', True), ('INV-0129', '1,240.00', True), ('INV-0130', '412.60', False), ('INV-0133', '2,050.00', True)))
    barx = ('<div style="display:flex;align-items:center;gap:10px;height:34px;padding:0 10px;border-radius:8px;background:var(--color-ink);color:var(--color-surface);font-size:12px">'
            '<span style="font-weight:600">3 selected</span><span style="opacity:.4">|</span><span>Send reminders %s</span><span>Export %s</span><span style="margin-left:auto">Clear %s</span></div>') % (
        kbd('R', True), kbd('E', True), kbd('Esc', True))
    return sketch(box(rowsx, 'padding:6px 10px') + barx)

def sk_empty():
    ghost = ''.join('<div style="display:grid;grid-template-columns:60px minmax(0,1fr) 50px;gap:8px;opacity:.5">%s%s%s</div>' % (bar('100%', h=6), bar(w, h=6), bar('100%', h=6)) for w in ('60%', '45%'))
    mid = ('<div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center">'
           '<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--color-surface);box-shadow:var(--shadow-ring)">%s</span>'
           '<span style="font-size:13px;font-weight:600;color:var(--color-ink)">No bank accounts yet</span><span style="font-size:12px;color:var(--color-ink-2)">Add the account your takings go into.</span>%s</div>') % (
        ic('bank', 'ic" style="width:14px;height:14px'), sm('Add an account', True))
    return sketch(mid + '<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">%s</div>' % ghost)

REFS = (
    ('Xero', 'Bank reconciliation and the accounts home', sk_bank,
     'Each statement line sits beside the best guess for it, with one press to match or create. Home is the bank accounts, each with its balance and how many lines wait.',
     'Match and create cards for every line of a CBZ, EcoCash or InnBucks statement; one account per currency; the count of lines waiting on each tile; Vane’s guess as the proposed match.',
     'A match that quietly absorbs a difference. A difference becomes its own line: IMTT, a bank charge, a rate gain.'),
    ('QuickBooks and Wave', 'Money in, money out, and the slip photo', sk_inout,
     'The home says Money in and Money out in plain words. A phone photo of a slip becomes a draft expense with the figures read off it.',
     'Plain headings across Books: Money in, Money out, Owed to you, You owe. Snap a slip at acquittal or at the till and get a draft, never a posted entry.',
     'Claiming VAT from a photo: input tax waits for the supplier’s fiscal invoice to show Valid. No upgrade banners.'),
    ('FreeAgent', 'The tax timeline', sk_tax,
     'A line of what is due next, each with its date and the amount worked out so far.',
     'The calendar on Money: PAYE by the 10th, VAT by the 15th, the next QPD, each with its figure so far and the documents behind it. Dates come from one table, so a ZIMRA change is one edit.',
     'One currency and the UK’s quarterly VAT wording. A figure that cannot be opened to show what made it.'),
    ('Zoho Books', 'Approvals and locking', sk_approve,
     'A document waits for a named approver before it can be sent or paid. A lock date stops changes before it.',
     'A second person on requisitions, supplier payments, credit notes and pay runs, with limits by role. Lock to a date when VAT is filed or a month is closed.',
     'Approvals off by default. A lock an admin lifts without a trace: reopening is an act with a reason, kept in the record.'),
    ('Sage Pastel', 'Periods, the trial balance and the GL', sk_pastel,
     'Twelve periods closed in turn; the trial balance and the general ledger in the layout Zimbabwean accountants were trained on.',
     'Period close with its checks; account codes, debit and credit columns, the trial balance and GL that an accountant reads without a guide, and an export in the shape they import.',
     'Showing debits and credits to the owner. A first-day wizard that asks for a chart of accounts: Books starts with one ready for Zimbabwe.'),
    ('Stripe', 'Every document’s timeline, and exact verbs', sk_timeline,
     'Each payment lists every event with its time and who did it. Void and refund are different words for different moments.',
     'A timeline on every invoice, payment and pay run: created, approved, fiscalised, sent, paid, corrected. Verbs that say what happened.',
     'Void on anything fiscalised. Once FDMS has signed it, the only way back is a credit note, and the button says so.'),
    ('Linear', 'The bulk bar and its keys', sk_bulk,
     'Select rows with a key or a click and a bar rises with the actions, each with its key. Esc clears.',
     'The bar on invoices, bills, bank lines and expenses: Send reminders, Approve, Match, Export, each with a key.',
     'Bulk delete or bulk void of issued documents. Anything that needs a reason, such as a credit note, is done one at a time.'),
    ('Notion and Pitch', 'Empty pages that start the work', sk_empty,
     'An empty page says what goes there, offers one way to start and hints at what it will look like.',
     'One next step per empty Books page: add the account takings go into, bring in last year’s balances from the accountant, record the first expense. Faint rows in the page’s own shape.',
     'Illustrations, jokes, and setup checklists that stay on the page after setup.'))

def ref_card(name, pattern, fn, what, copy, avoid):
    return ('<div class="xp-card" style="padding:16px 16px 20px;display:flex;flex-direction:column;gap:12px">%s'
            '<div><span class="muted" style="font-size:13px">%s</span><b style="margin:2px 0 6px;font-size:15px">%s</b><p style="font-size:14px">%s</p></div>'
            '<div class="xp-rows">'
            '<div class="xp-row" style="grid-template-columns:64px minmax(0,1fr);gap:12px;align-items:start;padding:10px 0;line-height:1.5;box-shadow:inset 0 1px 0 var(--color-line),inset 0 -1px 0 var(--color-line)"><b>Copy</b><span>%s</span></div>'
            '<div class="xp-row" style="grid-template-columns:64px minmax(0,1fr);gap:12px;align-items:start;padding:10px 0;line-height:1.5;box-shadow:none"><b>Avoid</b><span>%s</span></div>'
            '</div></div>') % (fn(), name, pattern, what, copy, avoid)

def own_look():
    def kvl(k, v):
        return '<div style="display:grid;grid-template-columns:180px minmax(0,1fr);align-items:center;gap:24px;min-height:64px;padding:12px 0;box-shadow:inset 0 -1px 0 var(--color-line)"><b style="font-weight:600">%s</b><div>%s</div></div>' % (k, v)
    pills = '<div style="display:flex;flex-wrap:wrap;gap:12px">%s</div>' % ''.join('<span class="pill %s">%s</span>' % p for p in (
        ('pill-n', 'Draft'), ('pill-info', 'Issued'), ('pill-info', 'Part-paid'), ('pill-ok', 'Paid'), ('pill-plain', 'Voided'), ('pill-warn', 'Overdue')))
    dots = '<div style="display:flex;flex-wrap:wrap;gap:24px;font-size:14px">%s</div>' % ''.join((
        status('Draft'), status('Issued', 'info'), status('Part-paid', 'info'), status('Paid', 'success'),
        '<span class="status" style="color:var(--color-muted)">Voided</span>', '<span class="status status-warning" style="color:var(--color-ink);font-weight:500">Overdue</span>'))
    nums = ('<div class="card" style="padding:0;overflow:hidden;max-width:520px"><table class="table"><thead><tr><th>Invoice</th><th class="num">Total</th><th class="num">Balance</th></tr></thead><tbody>'
            '<tr><td><span class="ref">INV-0142</span></td><td class="num">1,240.00</td><td class="num">640.00</td></tr>'
            '<tr><td><span class="ref">INV-0141</span></td><td class="num">430.00</td><td class="num">0.00</td></tr>'
            '<tr><td><span class="ref">INV-0139</span></td><td class="num">12,980.00</td><td class="num">12,980.00</td></tr></tbody>'
            '<tfoot><tr class="tot"><td>3 invoices</td><td class="num">14,650.00</td><td class="num">13,620.00</td></tr></tfoot></table></div>')
    two = ('<div><p style="font:600 28px/1.2 var(--font-sans);font-variant-numeric:tabular-nums;letter-spacing:var(--tracking-display);color:var(--color-ink)">US$1,240.00 <span style="font-weight:400;font-size:18px;color:var(--color-muted)">· ZiG 33,480</span></p>'
           '<p style="margin-top:6px;font-size:13px;color:var(--color-ink-2)">The document’s own currency first, in ink; the other in muted, at the document’s own rate (<span class="mono">27.00</span>, RBZ interbank, 14 Oct). ZWG, the code, appears in exports and on fiscal invoices.</p></div>')
    refs = '<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:14px">%s</div>' % ''.join('<span class="ref">%s</span>' % r for r in ('INV-0142', 'CN-0007', 'BILL-0219', 'REQ-0088', 'JNL-1203'))
    cls = rows((('<span class="mono">.pill</span>, <span class="mono">.status</span>', 'State: pills in a record’s head, dots in a table. Red is for errors only; overdue takes the warning colour.'),
                ('<span class="mono">.ref</span>', 'Document numbers, underlined, always opening the document'),
                ('<span class="mono">.num</span>, <span class="mono">.kt-v</span>, <span class="mono">.kpi-v</span>', 'Figures: tabular numerals, right-aligned in tables, two decimals'),
                ('<span class="mono">.kstrip</span>, <span class="mono">.kpi</span>', 'The few figures on Money: cash by channel, owed to you, you owe, VAT due'),
                ('<span class="mono">.table tr.tot</span>', 'Totals at the foot of every list of money'),
                ('<span class="mono">.chip-n</span>', 'A count that needs someone: lines to match, invoices overdue')), 280)
    return kvl('Status, in a record', pills) + kvl('Status, in a table', dots) + kvl('Figures', nums) + kvl('Two currencies', two) + kvl('Numbers', refs) + '<div style="margin-top:24px">%s</div>' % cls

def moodboard():
    grid = '<div class="xp-cards" style="grid-template-columns:1fr 1fr;gap:24px">%s</div>' % ''.join(ref_card(*r) for r in REFS)
    body = '<div class="xp">%s%s%s</div>' % (
        head('Books', 'Patterns Books borrows',
             'What Books takes from accounting and product tools people already know, and what it leaves behind. Each pattern is drawn with the kit’s own parts, not copied from a screenshot.'),
        sec('Eight references', 'For each: the pattern, what we copy, and what we avoid. Avoid usually means a Zimbabwean rule gets in the way, or the owner would need an accounting word.', grid),
        sec('Books’ own look', 'No new components: Books uses the kit. These are the parts it leans on hardest, drawn with the kit’s classes.', own_look()))
    return write(ROOT, 'BooksMoodboard', 'Books · Patterns Books borrows', body, h=3480)


# ======================================================================
# The plan, drawn: explainer boards for spec/books-final.md
#   BooksCore, BooksTree, BooksWho, BooksStates1-3, BooksFlows1-8
# ======================================================================
from books_nav import books_level, LEVELS

BCSS = '''
.bf-sec{padding:40px 0;box-shadow:inset 0 1px 0 var(--color-line);margin-top:40px}
.xp-sec+.bf-sec,.bf-sec+.bf-sec,.bf-sec+.xp-sec{margin-top:0}
.bf-sh{display:grid;grid-template-columns:320px minmax(0,1fr);gap:48px;margin-bottom:24px;align-items:start}
.bf-sh h2{font-size:18px;font-weight:600;margin:0}
.bf-sh .aside{color:var(--color-ink-2);line-height:1.6;max-width:840px;margin:0}
.bf-sh .mono{font-size:13px;color:var(--color-muted)}
.bf-st{height:28px;padding:0 10px;justify-content:center;box-sizing:border-box}
.bf-st.pill-plain{padding:0 10px;background:var(--color-surface);box-shadow:var(--shadow-ring)}
.bf-st.is-gone{padding:0 10px;background:var(--color-surface);box-shadow:none;outline:1.5px dashed var(--color-rule);outline-offset:-1.5px;color:var(--color-muted);font-weight:400}
.bf-st.is-gone::before{display:none}
.bf-m{position:relative;margin:8px 0 24px}
.bf-m>svg{position:absolute;left:0;top:0;overflow:visible}
.bf-n{position:absolute;transform:translate(-50%,-50%);display:flex}
.bf-n .bf-st{width:100%}
.bf-l{position:absolute;font-size:12px;line-height:16px;color:var(--color-ink);font-weight:500}
.bf-l i{display:block;font-style:normal;font-weight:400;color:var(--color-muted)}
.bf-l.up{transform:translateY(calc(-100% - 5px));text-align:center}
.bf-l.dn{transform:translateY(5px);text-align:center}
.bf-l.rt{transform:translateY(-50%);text-align:left}
.bf-l.lt{transform:translateY(-50%);text-align:right}
.bf-g{position:absolute;border-radius:12px;outline:1px dashed var(--color-rule);outline-offset:0}
.bf-g>span{position:absolute;left:12px;top:-9px;padding:0 6px;background:var(--color-surface);font-size:12px;color:var(--color-muted)}
.bf-fx .table{font-size:13px}
.bf-fx .table th{font-size:12px}
.bf-fx .table.is-prose td{line-height:18px;padding-top:8px;padding-bottom:8px}
.bf-steps{display:grid;gap:20px}
.bf-step{position:relative;padding:16px 16px 18px;border-radius:10px;box-shadow:var(--shadow-ring);display:flex;flex-direction:column;gap:10px;min-width:0}
.bf-step+.bf-step::before{content:"";position:absolute;left:-17px;top:27px;width:12px;height:2px;background:var(--color-rule)}
.bf-step+.bf-step::after{content:"";position:absolute;left:-9px;top:24px;border:4px solid transparent;border-left:5px solid var(--color-rule)}
.bf-steps.is-wrap .bf-step::before,.bf-steps.is-wrap .bf-step::after{display:none}
.bf-step-h{display:flex;align-items:center;gap:10px}
.bf-step-h b{font-weight:600;color:var(--color-ink);font-size:14px;line-height:1.35}
.bf-num{display:grid;place-items:center;flex:none;width:22px;height:22px;border-radius:999px;background:var(--color-ink);color:var(--color-surface);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
.bf-f{display:grid;grid-template-columns:52px minmax(0,1fr);gap:8px;font-size:13px;line-height:1.5;color:var(--color-ink-2)}
.bf-f>span:first-child{color:var(--color-muted);font-size:12px;line-height:19px}
.bf-f .bf-st{height:22px;padding:0 8px}
.bf-where{font-size:12px;color:var(--color-ink-2)}
.bf-dr{display:block;font-family:var(--font-mono);font-size:12px;line-height:1.6;color:var(--color-ink)}
.bf-dr .muted{font-family:var(--font-sans)}
.bf-dr.is-amt{display:flex;justify-content:space-between;gap:8px}
.bf-dr.is-amt b{font-weight:500;white-space:nowrap}
.bf-mark{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:6px;font-size:12px;font-weight:600;white-space:nowrap}
.bf-mark.y{background:var(--color-success-tint);color:var(--color-success)}
.bf-mark.l{background:var(--color-accent-tint);color:var(--color-accent)}
.bf-mark.g{background:var(--color-warning-tint);color:var(--color-ink)}
.bf-mark.o{background:var(--color-fill);color:var(--color-ink-2)}
.bf-mark.t{background:var(--color-fill);color:var(--color-ink-2);font-weight:500;white-space:normal;height:auto;min-height:22px;padding:2px 6px;line-height:18px;box-sizing:border-box}
.bf-mark.n{color:var(--color-faint);font-weight:400}
.bf-box{padding:16px 18px;border-radius:10px;box-shadow:var(--shadow-ring);background:var(--color-surface)}
.bf-box h3{font-size:14px;font-weight:600;margin:0 0 6px;color:var(--color-ink)}
.bf-box p{font-size:13px;line-height:1.6;color:var(--color-ink-2);margin:0}
.bf-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:6px;background:var(--color-fill);font-size:12px;color:var(--color-ink-2);white-space:nowrap}
.bf-code{font-family:var(--font-mono);font-size:12px;color:var(--color-ink-2)}
.bf-k{font-size:12px;color:var(--color-muted)}
.bf-start{width:12px;height:12px;margin:auto;border-radius:999px;background:var(--color-ink-2)}
'''

TONE = {'n': 'pill-n', 'i': 'pill-info', 'o': 'pill-ok', 'w': 'pill-warn', 'b': 'pill-bad', 'p': 'pill-plain', 'g': 'pill-plain is-gone'}

def st(label, tone='n'):
    """A state pill: Draft, Issued, Part paid, Paid, Void…; no label is the start dot."""
    if not label:
        return '<span class="bf-start" aria-label="Start"></span>'
    return '<span class="pill bf-st %s">%s</span>' % (TONE[tone], label)

def bsec(title, aside, body, meta=''):
    """A full-width section: heading and aside on one row, the body across the board."""
    return '<section class="bf-sec"><div class="bf-sh"><div><h2>%s</h2>%s</div><p class="aside">%s</p></div>%s</section>' % (
        title, '<span class="mono">%s</span>' % meta if meta else '', aside, body)

def bhead(kicker, title, lede):
    return head(kicker, title, lede)

def dr(*lines):
    """Ledger lines, one per line: 'Dr Receivable 1,994.22'. A trailing amount sits on the right."""
    out = ''
    for l in lines:
        m_ = re.match(r'^(.*?)\s+([0-9][0-9,]*\.[0-9]{2})$', l)
        if m_:
            out += '<span class="bf-dr is-amt"><span>%s</span><b>%s</b></span>' % (m_.group(1), m_.group(2))
        else:
            out += '<span class="bf-dr">%s</span>' % l
    return out

def mark(v):
    """A permission mark for the matrix."""
    m = {'Y': ('y', 'Yes'), 'L': ('l', 'Limit'), 'G': ('g', 'If granted'), 'O': ('o', 'Own'), '–': ('n', '—')}
    if v in m:
        c, t = m[v]
        return '<span class="bf-mark %s">%s</span>' % (c, t)
    return '<span class="bf-mark t">%s</span>' % v


class M:
    """A small state diagram: pills at fixed points, arrows between them, the action on each arrow."""
    def __init__(self, w, h):
        self.W, self.H = w, h
        self.nodes, self.svg, self.html, self.groups = {}, [], [], []

    def n(self, key, x, y, label, tone='n', w=120):
        self.nodes[key] = (x, y, w)
        self.html.append('<div class="bf-n" style="left:%dpx;top:%dpx;width:%dpx">%s</div>' % (x, y, w, st(label, tone)))
        return self

    def r(self, k, d=0):
        x, y, w = self.nodes[k]; return (x + w / 2 + 2, y + d)
    def l(self, k, d=0):
        x, y, w = self.nodes[k]; return (x - w / 2 - 2, y + d)
    def t(self, k, d=0):
        x, y, w = self.nodes[k]; return (x + d, y - 16)
    def b(self, k, d=0):
        x, y, w = self.nodes[k]; return (x + d, y + 16)

    def line(self, pts, dash=False, head=True):
        d = 'M%.1f %.1f ' % pts[0] + ' '.join('L%.1f %.1f' % p for p in pts[1:])
        self.svg.append('<path d="%s" style="fill:none;stroke:var(--color-ink-2);stroke-width:1.25%s"%s/>' % (
            d, ';stroke-dasharray:4 3' if dash else '', ' marker-end="url(#bfah)"' if head else ''))
        return self

    def lab(self, x, y, w, act, who='', pos='up'):
        if pos in ('up', 'dn'):
            left = x - w / 2
        elif pos == 'rt':
            left = x
        else:
            left = x - w
        self.html.append('<div class="bf-l %s" style="left:%dpx;top:%dpx;width:%dpx">%s%s</div>' % (
            pos, left, y, w, act, '<i>%s</i>' % who if who else ''))
        return self

    def h(self, a, b, act, who='', dash=False, dy=0, w=None):
        """Straight across, a to b, label above the line."""
        ax, ay, aw = self.nodes[a]; bx, by, bw = self.nodes[b]
        p1, p2 = (self.r(a, dy), self.l(b, dy)) if bx > ax else (self.l(a, dy), self.r(b, dy))
        p2 = (p2[0] - 3, p2[1]) if bx > ax else (p2[0] + 3, p2[1])
        self.line([p1, p2], dash)
        span = abs(p2[0] - p1[0])
        self.lab((p1[0] + p2[0]) / 2, p1[1], w or span - 12, act, '', 'up')
        if who:
            self.lab((p1[0] + p2[0]) / 2, p1[1], w or span - 12, '<i>%s</i>' % who, '', 'dn')
        return self

    def v(self, a, b, act, who='', dash=False, dx=0, w=200, side='rt'):
        """Straight down (or up), a to b, label beside the line."""
        ax, ay, aw = self.nodes[a]; bx, by, bw = self.nodes[b]
        p1, p2 = (self.b(a, dx), self.t(b, dx)) if by > ay else (self.t(a, dx), self.b(b, dx))
        p2 = (p2[0], p2[1] - 3) if by > ay else (p2[0], p2[1] + 3)
        self.line([p1, p2], dash)
        my = (p1[1] + p2[1]) / 2
        self.lab(p1[0] + (10 if side == 'rt' else -10), my, w, act, who, side)
        return self

    def vh(self, a, b, act, who='', dash=False, dx=0, w=None, pos='up'):
        """Down from a, then across into b's side. Label on the across part."""
        ax, ay, aw = self.nodes[a]; bx, by, bw = self.nodes[b]
        start = self.b(a, dx) if by > ay else self.t(a, dx)
        end = self.l(b) if bx > ax else self.r(b)
        end = (end[0] - 3, end[1]) if bx > ax else (end[0] + 3, end[1])
        self.line([start, (start[0], by), end], dash)
        span = abs(end[0] - start[0])
        self.lab((start[0] + end[0]) / 2, by, w or span - 16, act, '', 'up')
        if who:
            self.lab((start[0] + end[0]) / 2, by, w or span - 16, '<i>%s</i>' % who, '', 'dn')
        return self

    def hv(self, a, b, act, who='', dash=False, dy=0, w=None):
        """Across from a, then down (or up) into b. Label above the across part."""
        ax, ay, aw = self.nodes[a]; bx, by, bw = self.nodes[b]
        start = self.r(a, dy) if bx > ax else self.l(a, dy)
        end = self.t(b) if by > ay else self.b(b)
        end = (end[0], end[1] - 3) if by > ay else (end[0], end[1] + 3)
        self.line([start, (bx, start[1]), end], dash)
        span = abs(bx - start[0])
        self.lab((start[0] + bx) / 2, start[1], w or span - 16, act, '', 'up')
        if who:
            self.lab((start[0] + bx) / 2, start[1], w or span - 16, '<i>%s</i>' % who, '', 'dn')
        return self

    def p(self, pts, act, who='', lx=None, ly=None, w=200, pos='up', dash=False):
        """Any path; the label sits at (lx, ly)."""
        self.line(pts, dash)
        if lx is None:
            (x1, y1), (x2, y2) = pts[1], pts[2] if len(pts) > 2 else pts[1]
            lx, ly = (pts[0][0] + pts[-1][0]) / 2, pts[1][1]
        if pos in ('up', 'dn'):
            self.lab(lx, ly, w, act, '', pos)
            if who:
                self.lab(lx, ly, w, '<i>%s</i>' % who, '', 'dn' if pos == 'up' else 'up')
        else:
            self.lab(lx, ly, w, act, who, pos)
        return self

    def drop(self, x, y1, b, act, who='', w=200, side='rt', dash=False, ly=None):
        """Straight down from a point (a group's edge) into node b, which sits at the same x."""
        bx, by, bw = self.nodes[b]
        self.line([(x, y1), (x, by - 19)], dash)
        self.lab(x + (10 if side == 'rt' else -10), ly or (y1 + by - 16) / 2, w, act, who, side)
        return self

    def loop(self, k, act, who='', pos='up', w=200):
        """An action that leaves the state where it is: a note above or below the pill."""
        x, y, bw = self.nodes[k]
        self.lab(x, y - 20 if pos == 'up' else y + 20, w, '&#8635; ' + act, who, pos)
        return self

    def group(self, x1, y1, x2, y2, label):
        self.groups.append('<div class="bf-g" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx"><span>%s</span></div>' % (x1, y1, x2 - x1, y2 - y1, label))
        return self

    def html_(self):
        defs = ('<defs><marker id="bfah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                '<path d="M0 0L10 5L0 10z" style="fill:var(--color-ink-2)"/></marker></defs>')
        return '<div class="bf-m" style="width:%dpx;height:%dpx">%s<svg width="%d" height="%d" aria-hidden="true">%s%s</svg>%s</div>' % (
            self.W, self.H, ''.join(self.groups), self.W, self.H, defs, ''.join(self.svg), ''.join(self.html))
    __str__ = html_


def fx(rows, head=('Action', 'Ledger', 'Sub-ledger', 'Bank', 'Fiscal', 'Stock', 'Undone by'),
       widths=('15%', '24%', '12%', '11%', '12%', '10%', '16%')):
    """The side effects of each action, and how each is undone."""
    return '<div class="bf-fx">%s</div>' % boxed(ptable(head, rows, widths))

def step(n, title, where='', state='', posts='', undo='', who=''):
    f = ''
    for k, v in (('Screen', where), ('Who', who), ('State' if 'bf-st' in state else 'What', state), ('Posts', posts), ('Undo', undo)):
        if k == 'Posts' and v and not ('bf-dr' in v or 'osts' in v[:40]):
            k = 'Then'
        if v:
            f += '<div class="bf-f"><span>%s</span><span>%s</span></div>' % (k, v)
    return '<div class="bf-step"><div class="bf-step-h"><span class="bf-num">%s</span><b>%s</b></div>%s</div>' % (n, title, f)

def steps(items, cols=None, wrap=False):
    cols = cols or len(items)
    return '<div class="bf-steps%s" style="grid-template-columns:repeat(%d,minmax(0,1fr))">%s</div>' % (' is-wrap' if wrap else '', cols, ''.join(items))

def arrow_state(a, ta, b, tb):
    return '<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">%s<span class="muted">→</span>%s</span>' % (st(a, ta), st(b, tb))

def scr(*parts):
    return '<span class="bf-where">%s</span>' % ' › '.join(parts)

def bwrite(name, title, body, h):
    return write(ROOT, name, title, '<div class="xp">%s</div>' % body, h=h, css=BCSS)


# ---------- BooksCore ----------
def core_diagram():
    W, H = 1312, 640
    mods = (('pipeline', 'CRM', 'Invoices, receipts, requisitions, the cost tracker, commission'),
            ('takings', 'Retail', 'Sales, refunds, shifts, day close banked, buying'),
            ('store', 'Stock', 'Receipts, issues, adjustments, transfers, counts'),
            ('edit', 'Maintenance', 'Work order completion: parts and labour'),
            ('person', 'People and payroll', 'Pay runs, disbursements, statutory payments'),
            ('docs', 'Schools', 'Fee invoices, receipts and refunds'),
            ('money', 'Gold', 'Purchases, buyer receipts, settlements, billing'))
    outs = (('books', 'Ledger', 'JournalEntry and JournalLine, posted only here'),
            ('users', 'Sub-ledgers', 'PaymentLedgerEntry: who owes us, whom we owe'),
            ('bank', 'Bank, cash and wallets', 'BankTransaction on every money account'),
            ('vat', 'Tax', 'VAT codes and rules, withholding, IMTT'),
            ('fiscal', 'Fiscal', 'The FDMS device, fiscal days, fiscal receipts'),
            ('activity', 'Audit', 'Every void, revise and delete, hash-chained'))
    my = [20 + i * 88 for i in range(len(mods))]
    oy = [52 + i * 96 for i in range(len(outs))]
    html, svg = [], []
    for (i, (icon, name, what)), y in zip(enumerate(mods), my):
        html.append('<div class="bf-box" style="position:absolute;left:0;top:%dpx;width:260px;height:78px;box-sizing:border-box;padding:11px 14px">'
                    '<div style="display:flex;align-items:center;gap:8px">%s<b style="font-size:14px;font-weight:600;color:var(--color-ink)">%s</b></div>'
                    '<p style="margin-top:2px;font-size:12px;line-height:1.4">%s</p></div>' % (y, ic(icon), name, what))
        ty = 150 + i * 56
        svg.append('<path d="M262 %d C340 %d 340 %d 412 %d" style="fill:none;stroke:var(--color-ink-2);stroke-width:1.25" marker-end="url(#bfah2)"/>' % (y + 39, y + 39, ty, ty))
    for (i, (icon, name, what)), y in zip(enumerate(outs), oy):
        html.append('<div class="bf-box" style="position:absolute;left:1052px;top:%dpx;width:260px;height:72px;box-sizing:border-box;padding:12px 14px">'
                    '<div style="display:flex;align-items:center;gap:8px">%s<b style="font-size:14px;font-weight:600;color:var(--color-ink)">%s</b></div>'
                    '<p style="margin-top:2px;font-size:12px;line-height:1.4">%s</p></div>' % (y, ic(icon), name, what))
        fy = 180 + i * 56
        svg.append('<path d="M902 %d C970 %d 970 %d 1046 %d" style="fill:none;stroke:var(--color-ink-2);stroke-width:1.25" marker-end="url(#bfah2)"/>' % (fy, fy, y + 36, y + 36))
    fns = (('postMoney', 'Posts one money event: ledger, sub-ledger and bank transaction in one go'),
           ('voidMoney', 'Posts the mirror under void:&lt;id&gt; in an open period'),
           ('recordEvent', 'A status change that moves no money. Refuses an amount'),
           ('rateFor', 'The rate and its source, to freeze on a document'),
           ('nextNumber', 'The next gapless number, inside the issuing transaction'),
           ('fiscalise', 'Sends an invoice, credit note or debit note to the device'),
           ('canDo', 'The one permission check: role, limit, own, granted'))
    core = ('<div style="position:absolute;left:416px;top:60px;width:484px;height:520px;box-sizing:border-box;padding:24px 28px;border-radius:14px;background:var(--color-ground);box-shadow:var(--shadow-ring)">'
            '<div style="display:flex;align-items:center;gap:10px">%s<b style="font-size:16px;font-weight:600;color:var(--color-ink)">Books core</b><span class="pill pill-ok" style="margin-left:auto">Always on, free</span></div>'
            '<p class="mono" style="margin-top:6px;font-size:13px;color:var(--color-ink-2)">lib/books/core</p>'
            '<p style="margin-top:8px;font-size:13px;line-height:1.55;color:var(--color-ink-2)">The one entry point. Modules import only this; no module writes a journal, a bank transaction or a sub-ledger line itself.</p>'
            '<div style="margin-top:14px;display:flex;flex-direction:column">%s</div>'
            '<p style="margin-top:14px;font-size:12px;line-height:1.5;color:var(--color-muted)">Underneath: <span class="mono">createJournalEntryFromSource</span>, safe to call twice on the same company, source type and source id.</p></div>') % (
        ic('books'), ''.join('<div style="display:grid;grid-template-columns:116px minmax(0,1fr);gap:12px;padding:7px 0;box-shadow:inset 0 -1px 0 var(--color-line);font-size:13px;line-height:1.45"><span class="mono" style="color:var(--color-ink);font-weight:500">%s</span><span style="color:var(--color-ink-2)">%s</span></div>' % f for f in fns))
    defs = ('<defs><marker id="bfah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            '<path d="M0 0L10 5L0 10z" style="fill:var(--color-ink-2)"/></marker></defs>')
    labels = ('<span class="bf-k" style="position:absolute;left:0;top:-4px;transform:translateY(-100%%)">Every module that moves money</span>'
              '<span class="bf-k" style="position:absolute;left:1052px;top:24px">What the core keeps correct</span>')
    return '<div style="position:relative;width:%dpx;height:%dpx;margin-top:24px">%s<svg width="%d" height="%d" style="position:absolute;left:0;top:0;overflow:visible" aria-hidden="true">%s%s</svg>%s%s</div>' % (
        W, H, labels, W, H, defs, ''.join(svg), core, ''.join(html))

def core_split():
    core = ptable(('Part', 'What it holds'), (
        ('<b>Ledger</b>', 'Journal entries and lines, posted only through the core'),
        ('<b>Chart of accounts</b>', 'Seeded on first use; an accountant can change it later'),
        ('<b>Posting engine</b>', 'Rules, conditions, tender and role mappings, the event log'),
        ('<b>Documents and states</b>', 'Quote to journal: every money document and its lifecycle'),
        ('<b>Numbering</b>', 'One gapless counter per document type, given at issue'),
        ('<b>Undo</b>', 'Void, revise and delete, with the audit trail'),
        ('<b>Periods</b>', 'Months, close and reopen with a voucher, the freeze date'),
        ('<b>Tax and currency</b>', 'VAT codes, withholding, IMTT; daily rates, the frozen rate'),
        ('<b>Fiscalisation</b>', 'The FDMS device, fiscal days, fiscal receipts'),
        ('<b>Parties and money accounts</b>', 'Customers, suppliers; bank, wallet and cash accounts'),
        ('<b>Sub-ledger and audit</b>', 'Who owes whom; every destructive act with who and why')), ('38%', '62%'))
    gated = rows((('Every page under <span class="mono">/books/*</span>', 'Except <span class="mono">/books/takings</span>, which keeps its retail gate: it is the floor’s End of day'),
                  ('<span class="mono">/api/books/*</span>', 'Lists, nav counts, the money summary, bank matching, CSV exports'),
                  ('Finer gates', 'The existing <span class="mono">accounting.*</span> sub-keys stay, each now depending on <span class="mono">books.screens</span>')), 200)
    never = rows((('Every core call', 'From any module, on any plan'),
                  ('Module money APIs', 'CRM, retail, payroll, school fees, gold and maintenance routes'),
                  ('Undo on a module’s own documents', 'Void, revise and delete move to <span class="mono">/api/books/core/*</span> and check the role, not the plan'),
                  ('Setup in Management', 'Money and tax, money accounts, approvals, the fiscal device, the accountant export')), 200)
    left = ('<div class="bf-box" style="padding:20px 0 0"><div style="padding:0 20px 14px;display:flex;align-items:center;gap:10px"><b style="font-size:15px;font-weight:600">Core</b>'
            '<span class="pill pill-ok">Always on, free</span><span class="mono" style="margin-left:auto;font-size:12px;color:var(--color-muted)">accounting.core</span></div>%s</div>') % core
    right = ('<div class="bf-box" style="padding:20px 24px"><div style="display:flex;align-items:center;gap:10px"><b style="font-size:15px;font-weight:600">Screens</b>'
             '<span class="pill pill-info">Paid add-on</span><span class="mono" style="margin-left:auto;font-size:12px;color:var(--color-muted)">books.screens (new)</span></div>'
             '<p style="margin-top:8px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">The Books GUI. <span class="mono">accounting.core</span> becomes the engine’s key: on in every workspace, never billed, not switchable.</p>'
             '%s%s%s%s</div>') % (sub('Gated by the screens'), gated, sub('Never gated'), never)
    return '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start">%s%s</div>' % (left, right)

def core_without():
    c = cards((
        ('list', 'Module screens show their own money', 'Requisitions, the cost tracker, retail takings, the pay run and school fees keep working, reading from the core.'),
        ('books', 'The ledger stays correct', 'Every sale, payment, payout and pay run posts from the first day.'),
        ('back', 'Undo works from the module', 'A CRM invoice is reversed from the CRM’s invoice screen, by the owner, through the same core call Books uses.'),
        ('export', 'The accountant export', 'Management › Company › Accountant export (new, free): trial balance, ledger, aging per currency, VAT 7 schedule, audit trail. CSV and XLSX.'),
        ('gear', 'Setup lives in Management', 'Business and tax details, money accounts, rate source, numbering, approval limits, the fiscal device.'),
        ('check', 'Buying the screens loses nothing', 'Add Books later and every document, posting and balance is already there, back to the first day.')), 3)
    def state(who, foot):
        return ('<div class="bf-box" style="padding:0;overflow:hidden"><div style="display:flex;align-items:center;gap:8px;height:44px;padding:0 16px;box-shadow:inset 0 -1px 0 var(--color-line);font-size:13px;color:var(--color-muted)">%s<b style="color:var(--color-ink);font-weight:600">Books</b><span style="margin-left:auto">%s</span></div>'
                '<div style="padding:24px 24px 22px"><p class="lede-figure" style="font-size:20px;line-height:1.4;margin:0"><span class="num">1,204 entries</span> in your books since 1 Mar 2026. <span class="q">Money in this month: US$12,480.00 and ZiG 41,300.00.</span></p>'
                '<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">The screens add invoices and bills in one place, bank matching, VAT returns, the month’s close, and the ledger for your accountant.</p>'
                '<div style="display:flex;align-items:center;gap:12px;margin-top:18px">%s</div></div></div>') % (ic('books'), who, foot)
    owner = state('Seen by James, the owner', primary('Add Books', 'plus', 'A') + '<span class="muted" style="font-size:13px">Price to be set</span><a class="ref" href="#export" style="margin-left:auto;font-size:13px">Accountant export</a>')
    other = state('Seen by Rudo, the accountant', '<span style="font-size:13px;color:var(--color-ink-2)">Ask your owner to add Books.</span><a class="ref" href="#export" style="margin-left:auto;font-size:13px">Accountant export</a>')
    sketch_ = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px">%s%s</div>' % (owner, other)
    rail_ = ('<p style="margin-top:16px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">The rail: without the screens, Books shows for the owner only, with an Add tag. Links into Books from other modules (an invoice’s Open in Books) are hidden, and the module’s own record opens instead. '
             'The payroll-only seam goes: a pay run posts to the ledger in every workspace.</p>')
    return c + sketch_ + rail_

def core_ignored():
    m = M(1312, 230)
    m.n('ev', 80, 40, 'Money event', 'p', 130)
    m.n('pe', 400, 40, 'Pending', 'i', 120)
    m.n('po', 760, 40, 'Posted', 'o', 120)
    m.n('fa', 400, 180, 'Failed', 'b', 120)
    m.n('np', 760, 180, 'Needs posting', 'w', 140)
    m.n('ig', 1150, 40, 'Ignored', 'p', 120)
    m.h('ev', 'pe', 'postMoney', 'any module')
    m.h('pe', 'po', 'The drain posts it', 'every 15 minutes, now for every source', dash=True)
    m.v('pe', 'fa', 'No rule or no account', 'kept, with the reason', w=220)
    m.h('fa', 'np', 'Shown at once', 'and blocks the month’s close')
    m.v('np', 'po', 'Retry, or map the account', 'owner or accountant', w=220)
    m.lab(1150, 92, 260, 'Only through recordEvent', 'a status change with no amount; a test fails on any money event written Ignored', 'dn')
    rules_ = ('<ol style="margin:8px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:8px;color:var(--color-ink-2);line-height:1.55;font-size:14px">%s</ol>' % ''.join('<li>%s</li>' % x for x in (
        'Capturing an event defaults to Pending, not Ignored.',
        'Ignored is allowed only through <span class="mono">recordEvent</span>, which refuses any amount.',
        'A missing rule or account makes the event Failed, with the reason. It is never dropped.',
        'One drain runs every 15 minutes for every source type, backing off from 5 minutes, doubling, up to 24 hours.',
        'Pending over an hour and every Failed event show in Close the month › Needs posting, and block the close.',
        'A one-off backfill re-queues every past Ignored event that carries an amount.')))
    q = table(('Source', 'What', 'Why, in plain words', 'Waiting', ''), (
        ('<span class="ref">REQ-0088</span>', 'Disbursed to Blessing Zhou', 'No account is mapped for cash advances (1150).', '2 h', btn('Map the account', 'link', 'btn btn-quiet') + btn('Retry', 'run')),
        ('<span class="ref">Till 1</span>', 'Day close banked, 17 Oct', 'Waiting for the drain. It last ran at 11:45.', '1 h 10 min', btn('Retry', 'run')),
        ('<span class="ref">CE-0042</span>', 'Cost tracker, own pocket', 'Re-queued from Ignored. Its date, 28 Aug, is in a closed month.', '3 days', btn('Post in October', 'posting', 'btn btn-quiet') + btn('Retry', 'run'))),
        numcols=(3,))
    queue = ('<div class="bf-box" style="padding:0;overflow:hidden;margin-top:24px"><div style="display:flex;align-items:center;gap:12px;height:48px;padding:0 24px;box-shadow:inset 0 -1px 0 var(--color-line)">'
             '<b style="font-weight:600">Needs posting</b><span class="muted" style="font-size:13px">Close the month › Needs posting</span>'
             '<div class="seg" role="tablist" aria-label="Events" style="margin-left:auto"><button role="tab" aria-selected="true">Failed <span class="pn-n">1</span></button><button role="tab">Waiting <span class="pn-n">2</span></button></div></div>%s</div>') % q
    return str(m) + '<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:0">%s%s</div>' % (rules_, queue)

def books_core():
    body = (bhead('Books', 'Books is the engine',
                  'Every money movement in every module goes through one core. The core is free and always on; the Books screens are what a workspace pays for. A workspace without the screens still has correct books, from its first day.')
            + bsec('One entry point', 'CRM, retail, stock, maintenance, payroll, schools and gold call <span class="mono">lib/books/core</span>. The core writes the ledger, the sub-ledgers and the bank, works out tax, and signs with the fiscal device.', core_diagram())
            + bsec('Core and screens', 'The core is everything that makes money correct. The screens are the Books GUI at <span class="mono">/books/*</span>.', core_split())
            + bsec('Without the screens', 'What a workspace that hasn’t bought the screens still gets, and what it sees at a Books address: real figures, never a blank wall.', core_without())
            + bsec('Nothing is captured as ignored', 'Today CRM payouts, top-ups, change and cost-tracker spends are written as Ignored and never reach the ledger. From P1, every money event either posts or waits where someone sees it.', core_ignored()))
    return bwrite('BooksCore', 'Books · Books is the engine', body, 3520)


# ---------- BooksTree ----------
TREE_WHO = {None: 'Owner, manager, accountant see every row. Bursar: Money, Sales, Bank & cash. Shop manager: Bank & cash.',
            'Sales': 'Owner, manager, accountant, bursar',
            'Bills & spending': 'Owner, manager, accountant',
            'Bank & cash': 'Owner, manager, accountant, bursar, shop manager',
            'Tax': 'Owner, manager, accountant',
            'Close the month': 'Owner, manager, accountant',
            'Ledger': 'Owner, manager, accountant (the accountant’s tools)',
            'Settings': 'Owner, manager, accountant. Routes here follow <span class="mono">/books/settings</span>'}
TREE_TOP, TREE_PITCH = 100, 38
TREE_MGMT = (('Business & tax details', 'Company › Money and tax'), ('Money accounts', 'Company › Money accounts'),
             ('Approvals & limits', 'Company › Approvals'), ('Fiscal device', 'Shop › Fiscal device'))
TREE_BADGE = {'Invoices': 'overdue', 'Payments received': 'on account', 'Bills': 'due this week', 'Requisitions': 'to approve',
              'Claims & petty cash': 'to approve', 'To match': 'lines to match', 'Fiscal register': 'failed', 'Needs posting': 'failed', 'Takings': 'retail only'}

def tree_col(level):
    pnl = '<div style="width:240px;flex:none;border-radius:10px;overflow:hidden;box-shadow:var(--shadow-ring)">%s</div>' % books_level(level)
    def rt(text, sub_=''):
        return ('<div style="height:%dpx;display:flex;flex-direction:column;justify-content:center;min-width:0">'
                '<span class="bf-code" style="font-size:11.5px;color:var(--color-ink);white-space:nowrap">%s</span>%s</div>') % (
            TREE_PITCH, text, '<span style="font-size:11px;line-height:13px;color:var(--color-muted);white-space:nowrap">%s</span>' % sub_ if sub_ else '')
    if level is None:
        r = rt('/books', 'opens here')
        r += ''.join(rt('<span style="font-family:var(--font-sans)">opens its level ›</span>') for _ in LEVELS)
        top = TREE_TOP
    else:
        r = rt('<span style="font-family:var(--font-sans);color:var(--color-muted)">back to Books</span>')
        r += '<div style="height:34px"></div>'
        cut = '/books/settings' if level == 'Settings' else '/books'
        r += ''.join(rt(route.replace(cut, '', 1) or '/', TREE_BADGE.get(label, '')) for label, _, _, route in dict((n, rows) for n, _, rows in LEVELS)[level])
        top = TREE_TOP
    routes = '<div style="padding-top:%dpx;min-width:0;flex:1">%s</div>' % (top, r)
    extra = ''
    if level == 'Settings':
        extra = ('<div style="margin-top:12px;padding:12px 14px;border-radius:10px;background:var(--color-ground)"><span class="bf-k">Four more rows open in Management</span>%s</div>' % ''.join(
            '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:12px"><span style="color:var(--color-ink)">%s</span><span class="muted">%s</span></div>' % r_ for r_ in TREE_MGMT))
    title = level or 'Books, first level'
    return ('<div style="min-width:0"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px"><b style="font-size:15px;font-weight:600">%s</b></div>'
            '<p style="font-size:12px;line-height:1.5;color:var(--color-ink-2);min-height:36px;margin:0 0 12px">%s</p>'
            '<div style="display:flex;gap:12px;align-items:flex-start">%s%s</div>%s</div>') % (title, TREE_WHO[level], pnl, routes, extra)

def tree_levels():
    cols = [None] + [n for n, _, _ in LEVELS]
    return '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 32px">%s</div>' % ''.join(tree_col(c) for c in cols)

def tree_roles():
    lv = ('Money', 'Sales', 'Bills & spending', 'Bank & cash', 'Tax', 'Close the month', 'Ledger', 'Settings')
    data = (('Owner', 'YYYYYYYY'), ('Manager', 'YYYYYYYY'), ('Accountant', 'YYYYYYYY'), ('Bursar', 'YY–Y––––'),
            ('Shop manager', '–––Y––––'), ('Clerk or rep', '––––––––'))
    body = [['<b>%s</b>' % r] + [mark(c) for c in cs] for r, cs in data]
    t = boxed(table(('Who',) + lv, body))
    return t + '<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">A shop manager’s Bank & cash shows Accounts, To match and Takings. A bursar sees fee documents in Sales. The server refuses on its own: hiding a row is never the check.</p>'

def tree_migration():
    t = ptable(('Old address', 'New home', 'Also moves'), (
        ('<span class="mono">/accounting</span>', '<span class="mono">/books</span>', 'The seed pack moves to Settings › Set up the books'),
        ('<span class="mono">/accounting/sales</span>', '<span class="mono">/books/invoices</span>', 'Views to customers, payments, credit notes, write-offs, by age, statements; new-invoice and new-receipt to the Books forms'),
        ('<span class="mono">/accounting/purchases</span>', '<span class="mono">/books/bills</span>', 'Vendors to suppliers, payments to payments made, debit notes to a Bills tab; new-bill and new-payment to forms'),
        ('<span class="mono">/accounting/receivables</span>', '<span class="mono">/books/customers?view=by-age</span>', 'The hub’s tiles are Money’s'),
        ('<span class="mono">/accounting/payables</span>', '<span class="mono">/books/suppliers?view=by-age</span>', '—'),
        ('<span class="mono">/accounting/chart-of-accounts</span>', '<span class="mono">/books/chart</span>', 'New account (a dead link today) opens the drawer'),
        ('<span class="mono">/accounting/posting-rules</span>', '<span class="mono">/books/posting-rules</span>', '—'),
        ('<span class="mono">/accounting/banking</span>', '<span class="mono">/books/accounts</span>', 'Manual transactions become Record a transaction; reconciliations to <span class="mono">/books/reconciliations</span>'),
        ('<span class="mono">/accounting/cost-centers</span>', '<span class="mono">/books/cost-centres</span>', '—'),
        ('<span class="mono">/accounting/currency</span>', '<span class="mono">/books/rates</span>', '—'),
        ('<span class="mono">/accounting/fiscalisation</span>', '<span class="mono">/books/fiscal</span>', 'Setup stays in Management › Fiscal device'),
        ('<span class="mono">/accounting/tax/setup</span>', '<span class="mono">/books/settings/tax</span>', '—'),
        ('<span class="mono">/accounting/financial-reports</span>, <span class="mono">/financial-statements</span>', '<span class="mono">/books/financials</span>', 'Reports stay in Reports from Books'),
        ('<span class="mono">/accounting/trial-balance</span>', '<span class="mono">/books/trial-balance</span>', '—'),
        ('<span class="mono">/accounting/journals</span>, <span class="mono">/periods</span>, <span class="mono">/tax</span>', 'unchanged', 'Already redirect')), ('34%', '28%', '38%'))
    dropped = boxed(ptable(('Dropped page', 'Why'), (
        ('<b>Accounting overview</b>', 'Money does its job'),
        ('<b>Receivables and Payables hubs</b>', 'Their figures are Money’s and the aging views’'),
        ('<b>Financial reports hub</b>', 'A page of three links; statements now have one page'),
        ('<b>Fiscalisation config form</b>', 'A copy of Management’s Fiscal device')), ('42%', '58%')))
    side = ('%s<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">Nothing that holds data is dropped. Every redirect keeps the query: <span class="mono">?view=</span> maps to the matching tab, <span class="mono">?action=new-*</span> to the new form or drawer. Each lands in the phase that builds its page.</p>'
            '%s%s') % (dropped, sub('APIs removed outright'), '<ul class="dots" style="font-size:13px">%s</ul>' % ''.join('<li>%s</li>' % x for x in (
                'Status changes in the invoice and bill PATCH routes; they keep draft edits only',
                'Status changes in the period PATCH route',
                'The call to a currency-definitions route that does not exist')))
    return '<div style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:32px;align-items:start">%s<div>%s</div></div>' % (boxed(t), side)

def books_tree():
    body = (bhead('Books', 'The navigation tree',
                  'Books drills down level by level. Money is the page Books opens on; each group is a row on the first level that opens its own level, and the chevron goes back up. The names are the owner’s words; the accountant’s tools sit inside Ledger and Settings, one click away but never in the owner’s path.')
            + bsec('Every level', 'The real panels, with the address each row opens (routes after <span class="mono">/books</span>) and the count its badge shows. Saved views and Reports from Books stay as bands at the foot.', tree_levels())
            + bsec('Who sees which level', 'From the permission matrix. Yes means the level shows in the panel.', tree_roles())
            + bsec('Moving from /accounting', 'Redirects use the existing moved helper and keep the query. Nothing in Books links to /accounting once P1 ships.', tree_migration()))
    return bwrite('BooksTree', 'Books · The navigation tree', body, 4340)


# ---------- BooksWho ----------
def who_roles():
    return boxed(ptable(('Who', 'Role in the app', 'At Floorcode', 'What they are in Books'), (
        ('<b>Owner</b>', '<span class="mono">SUPERADMIN</span>; a workspace may have more than one', 'James Nyabadza', 'Everything, including permanent delete and revising posted documents'),
        ('<b>Superuser</b>', 'Not a role: a Corelith operator in Sign in as, Change mode, as an owner', 'Session SA-214', 'The owner’s powers, for support. Every destructive act records the operator and the session. Look mode stays read-only'),
        ('<b>Manager</b>', '<span class="mono">MANAGER</span>', 'Farai Ncube', 'Runs the money day to day: approves, pays, closes the month. Can’t delete posted documents or reopen a month'),
        ('<b>Accountant</b>', '<span class="mono">FINANCE_OFFICER</span>', 'Rudo Mapfumo', 'Does the books: creates, issues, posts journals, reconciles, prepares VAT. Approves within a limit, never their own. Void and revise only if granted'),
        ('<b>Bursar</b>', '<span class="mono">BURSAR</span>', '— (schools)', 'School fees: fee invoices, receipts, refunds. Sees Sales and Bank & cash'),
        ('<b>Shop manager</b>', '<span class="mono">SHOP_MANAGER</span>', 'Chipo Mhlanga', 'Retail: day close, banking, retail requisitions within the limit'),
        ('<b>Clerk or rep</b>', 'Clerk, sales rep, sales exec, cashier, stock clerk', 'Blessing Zhou, Tendai Sibanda', 'Drafts, receipts at the counter or in the CRM, requisitions and claims for themselves. No approvals, no voids')),
        ('14%', '26%', '18%', '42%')))

def who_matrix():
    R = (('See Books screens', 'Y', 'Y', 'Y', 'Sales, Bank & cash', 'Bank & cash, Takings', '–'),
         ('Create a draft (any document)', 'Y', 'Y', 'Y', 'fees', 'retail', 'O'),
         ('Edit a draft', 'Y', 'Y', 'Y', 'fees', 'retail', 'O'),
         ('Delete a draft', 'Y', 'Y', 'Y', 'fees', 'retail', 'O'),
         ('Issue or post (invoice, bill, credit note, receipt)', 'Y', 'Y', 'Y', 'fees', 'retail', 'receipts, CRM invoices'),
         ('Post a manual journal', 'Y', 'Y', 'L', '–', '–', '–'),
         ('Approve (requisition, PO, bill, claim, payment, write-off)', 'Y', 'L', 'L', '–', 'L', '–'),
         ('Pay (supplier payment, disburse, reimburse)', 'Y', 'L', 'L', '–', 'L', '–'),
         ('Issue a credit note or debit note', 'Y', 'Y', 'Y', 'fees', '–', '–'),
         ('Write off a debt', 'Y', 'L', 'L', '–', '–', '–'),
         ('Void or reverse a posted document', 'Y', 'G', 'G', '–', '–', '–'),
         ('Revise a posted document (void and re-issue)', 'Y', 'G', 'G', '–', '–', '–'),
         ('Permanent delete of anything posted', 'Y', '–', '–', '–', '–', '–'),
         ('Bulk actions', 'row by row', 'row by row', 'row by row', 'row by row', 'row by row', 'row by row'),
         ('Close a month', 'Y', 'Y', 'Y', '–', '–', '–'),
         ('Reopen a month', 'Y', '–', '–', '–', '–', '–'),
         ('Post into a closed month (manager override)', 'Y', 'with a reason', '–', '–', '–', '–'),
         ('Finalise and file a VAT return', 'Y', 'Y', 'prepare, review', '–', '–', '–'),
         ('Change chart, rules, tax codes, rates', 'Y', '–', 'Y', '–', '–', '–'))
    body = [['<b>%s</b>' % r[0]] + [mark(c) for c in r[1:]] for r in R]
    t = ptable(('Action', 'Owner, superuser', 'Manager', 'Accountant', 'Bursar', 'Shop manager', 'Clerk or rep'), body,
               ('31%', '11%', '11%', '12%', '12%', '12%', '11%'))
    legend = '<div style="display:flex;flex-wrap:wrap;gap:20px;margin-top:14px;font-size:13px;color:var(--color-ink-2)">%s</div>' % ''.join(
        '<span style="display:inline-flex;align-items:center;gap:8px">%s%s</span>' % (mark(k), v) for k, v in (
            ('Y', 'may'), ('L', 'within their approval limit; a second person over it'), ('O', 'only their own records'), ('G', 'only if the owner granted void and revise'), ('–', 'may not')))
    changes = ('<div class="xp-cards" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:24px">%s</div>' % ''.join(
        '<div class="bf-box"><h3>%s</h3><p>%s</p></div>' % c for c in (
            ('Reopen becomes owner only', 'Today the reopen route also lets a manager reopen a month.'),
            ('Every write goes through canDo', 'Invoices, bills, receipts, periods, the close, the freeze and journals check only the session today.'),
            ('A rep’s CRM invoice is a real one', 'It keeps working, but the core issues it: numbered, fiscalised and posted, not a bare Issued row.'))))
    return boxed(t) + legend + changes

def who_grant():
    tick = ('<div class="bf-box" style="padding:0;overflow:hidden"><div style="display:flex;align-items:center;gap:10px;height:48px;padding:0 20px;box-shadow:inset 0 -1px 0 var(--color-line);font-size:13px;color:var(--color-muted)">'
            'Management › Users › <b style="color:var(--color-ink);font-weight:600">Rudo Mapfumo</b><span class="pill pill-n" style="margin-left:auto">Accountant</span></div>'
            '<div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">'
            '<label style="display:flex;gap:12px;align-items:flex-start"><span class="cb on" style="width:16px;height:16px;flex:none;margin-top:2px"></span><span><b style="font-weight:500;color:var(--color-ink)">May void and revise posted documents</b>'
            '<span style="display:block;font-size:13px;line-height:1.5;color:var(--color-ink-2);margin-top:2px">Granted by James Nyabadza on 2 Oct. Stored as the capability <span class="mono">books.void</span>.</span></span></label>'
            '<p style="font-size:13px;line-height:1.6;color:var(--color-muted);margin:0">Never covers: permanent delete of posted records, reopening a month, changing a filed VAT return.</p></div></div>')
    pts = '<ul class="dots" style="font-size:14px">%s</ul>' % ''.join('<li>%s</li>' % x for x in (
        'By default only the owner voids and revises.',
        'The owner can tick it on a manager’s or an accountant’s page, never anyone else’s.',
        'It uses the CRM’s existing per-person override, so there is no new role.',
        'Every void and revise it allows still writes the audit event with who and why.'))
    return '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px;align-items:start">%s%s</div>' % (tick, pts)

def who_checker():
    t = boxed(ptable(('Rule', 'Where it applies', 'How'), (
        ('<b>Nobody approves their own request</b>', 'Requisitions, POs, claims, bills, payments, write-offs, journals over the limit', 'The existing two-step check; a bulk approve skips one’s own rows, with why'),
        ('<b>Nobody pays their own request</b>', 'Disbursements, reimbursements', 'New check in canDo'),
        ('<b>The approver should not also pay</b>', 'Disbursements, supplier payments', 'Enforced with two or more people who may pay. A one-person shop may do both; the audit says “approved and paid by the same person”'),
        ('<b>Over the limit, the owner approves</b>', 'Requisitions, POs, claims, write-offs; bills and supplier payments', 'The limit and approver are snapshotted when the request is sent, as retail does now'),
        ('<b>Approvals are recorded once</b>', 'Every Books approval', 'One approval action row per decision')), ('30%', '34%', '36%')))
    lim = kstrip((('Requisitions, POs, claims', 'Set in Approvals', 'requisitionOwnerOver, as retail has today'),
                  ('Bills and supplier payments', 'US$500', 'paymentOwnerOver (new), placeholder'),
                  ('Manual journal, second person', 'US$1,000', 'journalSecondOver (new), placeholder'),
                  ('Petty cash voucher, holder alone', 'US$20', 'voucherHolderUnder (new), placeholder')))
    return t + '<div style="margin-top:24px">%s</div><p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">The limits live in Management › Company › Approvals, today’s retail page widened to all money. The CRM’s requisitions read the same limits from P2.</p>' % lim

def who_delete():
    rules_ = cards((
        ('edit', 'Edit after posting is Revise', 'Never an edit in place. The old document is voided and a new one issued with a new number, linked back. Both stay visible: “Replaced by INV-0137”. Notes, attachments and the due date change freely, logged.'),
        ('x', 'Permanent delete, owner only', 'With a reason of 3 to 300 characters. In one transaction it removes the document, its lines, every journal it posted, its sub-ledger lines and events. Payments stay, as the party’s money on account. The number is never reused.'),
        ('activity', 'Always in the audit trail', 'A books.&lt;document&gt;.deleted or .revised event keeps the whole record, who, why, and for a superuser the operator and the session (SA-214).')), 3)
    refused = boxed(ptable(('Delete is refused when', 'Why', 'What the app offers'), (
        ('The document was fiscalised', 'ZIMRA holds fiscal memory read-only; one fiscal tax invoice per supply', 'Void with a credit note'),
        ('Its date is in a closed month, or before the freeze date', 'That month’s figures have been reported', 'Void, dated in the first open day'),
        ('It is counted in a finalised or filed VAT return', 'The return has been, or is about to be, declared', 'Void; it reaches the next return'),
        ('A payment on it is matched in a closed reconciliation', 'The bank side has been signed off', 'Reopen the reconciliation (owner), or void'),
        ('It is a pay run or a school fee document', 'Their modules own deletion', 'Reverse it in Payroll or Schools')), ('34%', '36%', '30%')))
    dlg = ('<div class="bf-box" style="padding:0;overflow:hidden;box-shadow:var(--shadow-ring),var(--shadow-raised)"><div style="padding:20px 22px 0"><b style="font-size:15px;font-weight:600;color:var(--color-ink)">INV-0131 can’t be deleted</b>'
           '<p style="margin-top:8px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">It was fiscalised on 2 Oct and FDMS shows it Valid. ZIMRA allows a fiscalised invoice to be corrected only by a fiscal credit note. Chisipite Dental’s input tax already shows it.</p>'
           '<p style="margin-top:10px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">Void with a credit note issues CN-0010 for US$1,240.00, fiscalised, with your reason.</p></div>'
           '<div style="display:flex;justify-content:flex-end;gap:8px;padding:16px 22px;margin-top:16px;box-shadow:inset 0 1px 0 var(--color-line)">%s%s</div></div>') % (
        btn('Cancel', None, 'btn btn-quiet'), btn('Void with a credit note', 'file', 'btn btn-primary', 'Ctrl ↵'))
    fisc = ('<div style="display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:32px;align-items:start;margin-top:24px"><div>%s<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">'
            'Why fiscalised documents are refused: if we deleted the invoice, our books would show less output VAT than FDMS holds, and since 2026 the buyer’s input tax fills in from FDMS, so ZIMRA would see a sale we no longer declare. '
            'This changes today’s delete, which removes a fiscalised invoice once its fiscal day has closed. The one exception: documents signed on a device registered against ZIMRA’s test environment, purged by the owner with the test data.</p></div>%s</div>') % (refused, dlg)
    return rules_ + fisc

def books_who():
    body = (bhead('Books', 'Who does what',
                  'Roles, what each may do, the second person where money leaves, and the two powers kept for the owner: permanent delete and changing what has been posted. The server checks every one through canDo; hiding a button is never the check.')
            + bsec('The roles', 'The app’s own roles; no new role is added. Names are Floorcode’s.', who_roles())
            + bsec('The permission matrix', 'Bulk actions follow the same rights, row by row: a row this person may not act on is skipped with the reason.', who_matrix())
            + bsec('Granting void and revise', 'An accountant handed the books still has to fix mistakes, so the owner can grant it per person.', who_grant())
            + bsec('Maker-checker and limits', 'Two people where money leaves. Limits are per company; the new ones are placeholders until the owner sets them.', who_checker())
            + bsec('Permanent delete and edit after posting', 'Both are owner or superuser only, always with a reason, always in the audit trail.', who_delete()))
    return bwrite('BooksWho', 'Books · Who does what', body, 3760)


# ---------- BooksStates1: the universal lifecycle and the selling documents ----------
NONE = '<span class="muted">—</span>'

def msec(title, model, aside, diagram, table_=''):
    return bsec(title, aside, str(diagram) + table_, meta=model)

def posted_machine(issue_label, issue_who, posted='Issued', new_label='Issued, new'):
    """Draft, posted, part paid, paid; with void, revise and delete under the posted ones."""
    m = M(1312, 380)
    m.n('d', 80, 60, 'Draft', 'n').n('i', 400, 60, posted, 'i').n('pp', 740, 60, 'Part paid', 'i').n('pd', 1080, 60, 'Paid', 'o')
    m.n('g', 80, 220, 'Gone', 'g').n('v', 420, 220, 'Void', 'p').n('rv', 760, 220, 'Void, replaced', 'p', 150).n('new', 1080, 220, new_label, 'i', 130)
    m.n('g2', 590, 330, 'Gone, kept in the audit trail', 'g', 220)
    m.group(320, 24, 1160, 96, 'Posted: %s, Part paid, Paid' % posted)
    m.h('d', 'i', issue_label, issue_who)
    m.h('i', 'pp', 'Payment allocated', 'worked out from the balance', dash=True)
    m.h('pp', 'pd', 'Balance reaches 0.00', 'worked out', dash=True)
    m.v('d', 'g', 'Delete (free)', 'who may edit the draft', w=150)
    m.drop(420, 96, 'v', 'Void', 'owner or granted', w=140)
    m.drop(760, 96, 'rv', 'Revise', 'owner or granted, with a reason', w=150)
    m.h('rv', 'new', 'New number', 'supersedes the old one')
    m.drop(590, 96, 'g2', 'Delete', 'owner, within the limits', w=150, ly=140)
    return m

def universal():
    m = M(1312, 380)
    m.n('d', 80, 60, 'Draft', 'n').n('i', 400, 60, 'Issued or posted', 'i', 150).n('pp', 740, 60, 'Part paid', 'i').n('pd', 1080, 60, 'Paid', 'o')
    m.n('g', 80, 220, 'Gone', 'g').n('v', 420, 220, 'Void', 'p').n('rv', 760, 220, 'Void, replaced', 'p', 150).n('new', 1080, 220, 'New document', 'i', 130)
    m.n('g2', 590, 330, 'Gone, kept in the audit trail', 'g', 220)
    m.group(310, 24, 1160, 96, 'Posted')
    m.h('d', 'i', 'Issue or post', 'number given here')
    m.h('i', 'pp', 'Part paid', 'worked out', dash=True)
    m.h('pp', 'pd', 'Paid', 'worked out', dash=True)
    m.v('d', 'g', 'Delete (free)', 'no number, no gap', w=150)
    m.drop(420, 96, 'v', 'Void', 'posts the mirror entry', w=140)
    m.drop(760, 96, 'rv', 'Revise', 'void and new document', w=150)
    m.h('rv', 'new', 'Linked', 'supersedesId')
    m.drop(590, 96, 'g2', 'Delete', 'owner only, §2.5', w=150, ly=140)
    rs = (('Posted things are never edited in place', 'Nothing that reached the ledger, sub-ledger, bank or fiscal device changes. Notes, attachments and the due date change freely, logged.'),
          ('Edit on a posted document is Revise', 'The old one is voided, a new one issued with a new number pointing back. The old one shows “Replaced by INV-0137”.'),
          ('A void posts the mirror', 'Every direction inverted, under void:&lt;id&gt;, dated today or the first open day. The sub-ledger line becomes Void in the same transaction.'),
          ('An issued invoice is voided by a full credit note', 'Fiscalised when the invoice was. Every reduction of output VAT sits in one place for the return.'),
          ('Deleting a draft is free', 'For anyone who may edit it. Drafts carry no number, so nothing leaves a gap.'),
          ('Deleting anything posted is owner only', 'Within the limits on BooksWho: never fiscalised, closed-month, filed-VAT or reconciled documents.'),
          ('Part paid and Paid are worked out', 'From the balance, never set by hand. No route sets Paid.'),
          ('Numbers are given at issue', 'From one gapless series per type, never at draft and never random.'),
          ('Every action writes who and when', 'Void, revise, delete, reopen and override also write an audit event.'))
    grid = '<div class="xp-cards" style="grid-template-columns:repeat(3,minmax(0,1fr))">%s</div>' % ''.join(
        '<div class="xp-card" style="display:grid;grid-template-columns:28px minmax(0,1fr);gap:6px;padding:16px 18px"><span class="mono muted">%d</span><div><b style="margin:0 0 4px">%s</b><p>%s</p></div></div>' % (i + 1, a, b) for i, (a, b) in enumerate(rs))
    legend = ('<p style="margin-top:16px;font-size:13px;color:var(--color-ink-2)">In the tables on these boards: <b>Ledger</b> is the journal posted; <b>Sub-ledger</b> the line in who owes whom; <b>Bank</b> the bank transaction; '
              '<b>Fiscal</b> FDMS; <b>Stock</b> the stock movement. A dashed arrow is worked out by the app, not pressed by a person.</p>')
    return str(m) + grid + legend

def quote_m():
    m = M(1312, 270)
    m.n('d', 80, 70, 'Draft', 'n').n('s', 420, 70, 'Sent', 'i').n('a', 760, 70, 'Accepted', 'o').n('inv', 1110, 70, 'Invoice drafted', 'o', 150)
    m.n('g', 80, 210, 'Gone', 'g').n('e', 420, 210, 'Expired', 'w').n('v', 760, 210, 'Void', 'p')
    m.h('d', 's', 'Send', 'number, PDF, WhatsApp or email')
    m.h('s', 'a', 'Accepted by link, or Mark accepted', 'discount over the limit: manager')
    m.h('a', 'inv', 'Make invoice', 'a draft with the quote’s lines')
    m.loop('s', 'Revise', 'old one Void, new number')
    m.v('d', 'g', 'Delete', 'anyone with Sales', w=150)
    m.v('s', 'e', 'Valid-until passes', 'a daily job (new)', dash=True, w=150)
    m.loop('e', 'Re-send as a revision', '', 'dn')
    m.v('a', 'v', 'Void', 'creator or manager; also from Draft or Sent', w=220)
    t = fx((('Send', NONE, NONE, NONE, NONE, NONE, 'Void'),
            ('Mark accepted', NONE, NONE, NONE, NONE, NONE, 'Void, if not yet invoiced'),
            ('Make invoice', 'nothing until the invoice is issued', NONE, NONE, NONE, NONE, 'Delete the draft invoice'),
            ('Expire', NONE, NONE, NONE, NONE, NONE, 'Re-send as a revision')))
    return msec('Quotation', 'SalesQuotation', 'A quote never posts. The CRM’s quote screen and Books’ Quotes show the same rows.', m, t)

def invoice_m():
    m = posted_machine('Issue', 'Sales rights · ' + kbd('I'))
    t = fx((('Issue', dr('Dr Receivable', 'Cr Sales', 'Cr 2200 VAT output'), 'Receivable line', NONE, 'Fiscal tax invoice, QR', 'Out, for stock lines', 'Void'),
            ('Payment allocated', 'none on the invoice; the receipt posts', 'Linked', NONE, NONE, NONE, 'Void the receipt'),
            ('Credit note, write-off', 'their own entries', 'balance lower', NONE, 'fiscal credit note', NONE, 'Void them'),
            ('Void', 'a full credit note, posted', 'Void', 'payments left on account', 'credit note fiscalised if the invoice was', 'back in, for stock lines', 'Re-issue a new invoice'),
            ('Revise', 'as Void, then a new invoice', 'moves to the new one', 'payments re-allocated, same customer', 'credit note, new invoice', 'as Void', 'Void the new one'),
            ('Delete (posted)', 'journals removed', 'removed', 'payments stay on account', 'refused if fiscalised', NONE, '—')))
    note_ = '<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">Unpaid commission is voided with the invoice; the CRM deal updates on issue. Three writers bypass this today (CRM <span class="mono">createInvoiceForLead</span>, gold’s commodity billing, the any-status PATCH); all go through the core’s Issue from P1 and P2.</p>'
    return msec('Sales invoice', 'SalesInvoice', 'Issued is final. Part paid and Paid follow the balance. Every undo goes through a credit note, so the VAT return finds it.', m, t + note_)

def credit_m():
    m = M(1312, 250)
    m.n('d', 80, 60, 'Draft', 'n').n('i', 440, 60, 'Issued', 'i').n('f', 820, 60, 'Issued, fiscalised', 'i', 160).n('fix', 1180, 60, 'New invoice', 'i', 130)
    m.n('g', 80, 200, 'Gone', 'g').n('v', 440, 200, 'Void', 'p')
    m.h('d', 'i', 'Issue', 'Sales rights; owner over the limit')
    m.h('i', 'f', 'Signed by FDMS', 'when the invoice was fiscalised', dash=True)
    m.h('f', 'fix', 'Undo', 'a new invoice or a fiscal debit note')
    m.v('d', 'g', 'Delete', 'Sales rights', w=150)
    m.v('i', 'v', 'Void', 'owner or granted; refused once fiscalised', w=240)
    t = fx((('Issue', dr('Dr Sales', 'Dr 2200 VAT output', 'Cr Receivable'), 'Credit line; excess becomes customer credit', NONE, 'Credit note naming the original, same currency, with a reason', 'back in, for returns', 'Void, if not fiscalised'),
            ('Void', 'mirror under void:&lt;id&gt;', 'Void', NONE, 'refused if fiscalised', NONE, '—')))
    return msec('Credit note', 'CreditNote', 'Made from an invoice. The reason is one of return, price correction, cancellation, discount or bad debt.', m, t)

def receipt_m():
    m = M(1312, 260)
    m.n('s', 40, 70, '', 'i', 22).n('r', 330, 70, 'Recorded, on account', 'i', 170).n('a', 760, 70, 'Recorded, allocated', 'o', 170)
    m.n('rf', 330, 210, 'Refund linked', 'i', 140).n('v', 760, 210, 'Void', 'p')
    m.h('s', 'r', 'Record', 'Sales, cashier, rep')
    m.h('r', 'a', 'Allocate to an invoice', 'Sales rights; Unallocate undoes it')
    m.v('r', 'rf', 'Refund the on-account part', 'manager or accountant, within the limit', w=240)
    m.v('a', 'v', 'Void', 'owner or granted; not while its invoice sits in an open fiscal day', w=280)
    t = fx((('Record', dr('Dr the chosen money account', 'Cr Receivable'), 'Line for the customer (now required)', 'Bank transaction', NONE, NONE, 'Void'),
            ('Allocate', NONE, 'linked to the invoice', NONE, NONE, NONE, 'Unallocate'),
            ('Refund', dr('Dr Receivable', 'Cr money account'), 'refund line', 'Bank transaction', NONE, NONE, 'Void the refund'),
            ('Void', 'mirror under void:&lt;id&gt;', 'Void', 'removed; statement line reopened', NONE, NONE, '—')))
    note_ = '<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">Currency and rate are frozen on the receipt. A void also removes the CRM’s copy, recalculates the invoice and voids unpaid commission.</p>'
    return msec('Receipt (payment received)', 'SalesReceipt', 'Money in. It debits the account the money went into, not always the main bank.', m, t + note_)

def writeoff_m():
    m = M(1312, 110)
    m.n('s', 40, 50, '', 'i', 22).n('p', 420, 50, 'Posted', 'i').n('v', 820, 50, 'Void', 'p')
    m.h('s', 'p', 'Write off', 'limit; the owner over accountOwnerOver')
    m.h('p', 'v', 'Void', 'owner or granted')
    t = fx((('Write off', dr('Dr Bad debts', 'Cr Receivable'), 'balance lower', NONE, 'fiscal credit note, reason bad debt ' + flag(), NONE, 'Void'),
            ('Void', 'mirror under void:&lt;id&gt;', 'Void', NONE, NONE, NONE, '—')))
    return msec('Write-off', 'SalesWriteOff, PurchaseWriteOff', 'A void is finally written as Void; the hard-delete route goes. The VAT treatment of a bad-debt credit note is for an adviser to confirm.', m, t)

def books_states1():
    body = (bhead('Books', 'States: the lifecycle and selling',
                  'Every money document follows one lifecycle. This board draws it, then each selling document: what moves it, who may, what each move posts, and how it is undone.')
            + bsec('The universal lifecycle', 'Draft to paid, and the three ways back: void, revise and delete.', universal())
            + quote_m() + invoice_m() + credit_m() + receipt_m() + writeoff_m())
    return bwrite('BooksStates1', 'Books · States: lifecycle and selling', body, 4560)


# ---------- BooksStates2: buying and spending ----------
def po_m():
    m = M(1312, 320)
    Y = 110
    m.n('d', 70, Y, 'Draft', 'n').n('ta', 360, Y, 'To approve', 'w').n('s', 650, Y, 'Sent', 'i').n('pr', 940, Y, 'Part received', 'i', 130).n('r', 1230, Y, 'Received', 'o')
    m.n('g', 70, 260, 'Gone', 'g').n('c', 360, 260, 'Cancelled', 'p').n('cl', 1230, 260, 'Closed', 'p')
    m.p([(70, Y - 16), (70, 40), (650, 40), (650, Y - 19)], 'Send, under the limit', 'maker', lx=360, ly=40, w=220)
    m.h('d', 'ta', 'Send for approval', 'maker; over the limit')
    m.h('ta', 's', 'Approve', 'limit, not the maker')
    m.h('s', 'pr', 'Goods received, part', 'buying rights')
    m.h('pr', 'r', 'Goods received, all', 'buying rights')
    m.v('d', 'g', 'Delete', 'buying rights', w=150)
    m.v('ta', 'c', 'Cancel', 'maker or manager; also from Draft or Sent', w=240)
    m.v('r', 'cl', 'Close', 'buying rights', w=150, side='lt')
    m.loop('cl', 'Reopen', 'manager', 'dn', w=120)
    g = M(1312, 110)
    g.n('c', 80, 50, 'Counted', 'n').n('p', 460, 50, 'Posted', 'i').n('r', 860, 50, 'Reversed', 'p')
    g.h('c', 'p', 'Post', 'buying rights; a draft bill is made')
    g.h('p', 'r', 'Reverse', 'the draft bill goes; refused once it is recorded')
    t = fx((('Approve', NONE, NONE, NONE, NONE, NONE, 'Cancel'),
            ('Goods receipt, post', dr('Dr Stock or expense', 'Cr 2010 Goods received, not billed'), NONE, NONE, NONE, 'In', 'Reverse the goods receipt'),
            ('Goods receipt, reverse', 'mirror', NONE, NONE, NONE, 'Out', '—'),
            ('Close, cancel', NONE, NONE, NONE, NONE, NONE, 'Reopen (manager)')))
    return msec('Purchase order and goods receipt', 'RetailPurchaseOrder, RetailGoodsReceipt',
                'A PO is a commitment and never posts. One table for retail and everyone else. Withdraw takes a PO waiting for approval back to Draft.',
                m, '<p class="bf-k" style="margin:8px 0 0">Goods receipt</p>' + str(g) + t)

def bill_m():
    m = posted_machine('Record', 'buying rights; owner first over the limit', posted='Recorded', new_label='Recorded, new')
    t = fx((('Record', dr('Dr Expense, or 2010', 'Dr 2210 VAT input, only if the FTI is Valid', 'Cr Payable'), 'Payable line', NONE, 'FTI number and FDMS check stored', NONE, 'Void'),
            ('Payment', 'the payment posts', 'linked', NONE, NONE, NONE, 'Void the payment'),
            ('Debit note', 'its own entry', 'balance lower', NONE, NONE, NONE, 'Void the debit note'),
            ('Void', 'mirror under void:&lt;id&gt;', 'Void (fixed: stays Posted today)', 'payments left as supplier credit', NONE, NONE, 'Record a new bill'),
            ('Revise', 'as Void, then a new bill', 'moves', 'payments re-allocated', NONE, NONE, 'Void the new one'),
            ('Delete (posted)', 'journals removed', 'removed', 'payments stay as supplier credit', NONE, NONE, '—')))
    return msec('Bill (supplier invoice)', 'PurchaseBill', 'Made by hand or from a goods receipt. The supplier’s FTI number and date are required when the supplier is VAT-registered; input VAT waits for Valid.', m, t)

def debit_m():
    m = M(1312, 210)
    m.n('d', 80, 60, 'Draft', 'n').n('i', 460, 60, 'Issued', 'i').n('v', 860, 60, 'Void', 'p').n('g', 80, 170, 'Gone', 'g')
    m.h('d', 'i', 'Issue', 'buying rights')
    m.h('i', 'v', 'Void', 'owner or granted')
    m.v('d', 'g', 'Delete', 'buying rights', w=150)
    t = fx((('Issue', dr('Dr Payable', 'Cr Expense', 'Cr 2210 VAT input'), 'bill balance lower', NONE, 'names the supplier’s credit note number', 'out, for returns', 'Void'),
            ('Void', 'mirror under void:&lt;id&gt;', 'Void (fix 3)', NONE, NONE, NONE, '—')))
    return msec('Debit note', 'DebitNote', 'It names the supplier’s credit note, since TaRMS matches debit notes received against them.', m, t)

def payment_m():
    m = M(1312, 340)
    Y = 110
    m.n('d', 70, Y, 'Draft', 'n').n('ta', 360, Y, 'To approve', 'w').n('a', 650, Y, 'Approved', 'o').n('p', 940, Y, 'Paid', 'o').n('v', 1230, Y, 'Void', 'p')
    m.n('g', 70, 290, 'Gone', 'g')
    m.p([(70, Y - 16), (70, 40), (650, 40), (650, Y - 19)], 'Send, under the limit', 'maker', lx=360, ly=40, w=220)
    m.h('d', 'ta', 'Send for approval', 'maker; over the limit')
    m.h('ta', 'a', 'Approve', 'limit, not the maker')
    m.h('a', 'p', 'Pay', 'limit; not the approver')
    m.h('p', 'v', 'Void', 'owner or granted')
    m.p([(360, Y + 16), (360, 200), (90, 200), (90, Y + 19)], 'Reject, back to Draft', 'limit, not the maker', lx=225, ly=200, w=220)
    m.v('d', 'g', 'Delete', 'buying rights', w=120, side='lt')
    t = fx((('Create', NONE, NONE, NONE, NONE, NONE, 'Delete'),
            ('Pay', dr('Dr Payable, gross', 'Cr money account, net', 'Cr 2180 Withholding payable, 30%', 'Dr IMTT expense, Cr money account'), 'payable line', 'Bank transaction', NONE, NONE, 'Void'),
            ('Void', 'mirror under void:&lt;id&gt;', 'Void', 'removed; statement line reopened', NONE, NONE, '—')))
    note_ = ('<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">On create, the ITF263 check: none on file and payments to this supplier this year at or over US$1,000 %s proposes a 30%% withholding line. Paying drafts the withholding certificate; a void voids it. '
             'Retail’s supplier payments become this document with status Paid, posted with a payables line (fix 1).</p>') % flag()
    return msec('Supplier payment (payment made)', 'PurchasePayment', 'New: approval before money leaves, and a void. Today supplier payments are written straight as paid and can’t be voided.', m, t + note_)

def req_m():
    m = M(1312, 360)
    Y = 110
    m.n('d', 70, Y, 'Draft', 'n').n('ta', 340, Y, 'To approve', 'w').n('a', 610, Y, 'Approved', 'o').n('ds', 880, Y, 'Disbursed', 'i').n('q', 1170, Y, 'Accounted for', 'o', 140)
    m.n('g', 70, 310, 'Gone', 'g').n('rj', 340, 310, 'Rejected', 'p').n('c', 590, 310, 'Cancelled', 'p')
    m.h('d', 'ta', 'Send for approval', 'requester; limit snapshotted')
    m.h('ta', 'a', 'Approve', 'limit, not the requester')
    m.h('a', 'ds', 'Disburse', 'not the requester or approver')
    m.h('ds', 'q', 'Account for', 'requester or a disburser')
    m.p([(860, Y + 16), (860, 200), (630, 200), (630, Y + 19)], 'Reverse disbursement', 'owner or granted', lx=745, ly=200, w=210)
    m.p([(1150, Y + 16), (1150, 200), (900, 200), (900, Y + 19)], 'Reopen', 'owner or granted', lx=1025, ly=200, w=210)
    m.v('d', 'g', 'Delete', 'requester', w=120)
    m.v('ta', 'rj', 'Reject', 'with a reason', w=120)
    m.p([(590, Y + 16), (590, 310 - 19)], 'Cancel', 'requester or approver; also from Draft, To approve', lx=578, ly=262, w=210, pos='lt')
    t = fx((('Approve', NONE, NONE, NONE, NONE, NONE, 'Cancel'),
            ('Disburse', dr('Dr 1150 Cash advances', 'Cr the chosen money account'), NONE, 'Bank transaction', NONE, NONE, 'Reverse disbursement'),
            ('Account for', dr('Dr each receipt’s category, 5500–5590', 'Dr 2210 VAT input, valid FTI only', 'Cr 1150 for the spend'), NONE, NONE, NONE, NONE, 'Reopen: mirror'),
            ('Change returned', dr('Dr money account', 'Cr 1150'), NONE, 'Bank transaction', NONE, NONE, 'with the acquittal'),
            ('Top-up', dr('Dr 1150', 'Cr money account'), NONE, 'Bank transaction', NONE, NONE, 'with the acquittal')))
    note_ = ('<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">New: posting through the cash advances account. The money shows as “with staff, not yet accounted for” until receipts come in, as an imprest works. '
             'Today the seeded rule debits the expense at disbursement. Waiving receipts needs approve rights. Retail order requisitions keep their supplier-advance accounts.</p>')
    return msec('Requisition', 'CrmRequisition, CRM and retail as one', 'Asking for money before it is spent. One page in Books for both, with a Source column.', m, t + note_)

def claim_m():
    m = M(1312, 230)
    m.n('d', 80, 60, 'Draft', 'n').n('ta', 400, 60, 'To approve', 'w').n('a', 760, 60, 'Approved', 'o').n('p', 1120, 60, 'Paid', 'o')
    m.n('rj', 400, 190, 'Rejected', 'p').n('v', 760, 190, 'Void', 'p')
    m.h('d', 'ta', 'Send for approval', 'the spender, or a cost-tracker day sent')
    m.h('ta', 'a', 'Approve', 'limit, not the spender')
    m.h('a', 'p', 'Reimburse', 'limit, not the spender')
    m.v('ta', 'rj', 'Reject', 'before approval', w=150)
    m.v('a', 'v', 'Void', 'owner or granted', w=150)
    f = M(1312, 110)
    f.n('d', 80, 50, 'Draft', 'n').n('p', 460, 50, 'Posted', 'i').n('v', 860, 50, 'Void', 'p')
    f.h('d', 'p', 'Approve', 'the holder’s manager; under US$20 the holder')
    f.h('p', 'v', 'Void', 'owner or granted')
    t = fx((('Claim, approve', dr('Dr each line’s category', 'Dr 2210 VAT input, valid FTI only', 'Cr 2190 Staff claims payable'), NONE, NONE, NONE, NONE, 'Void (after), Reject (before)'),
            ('Claim, reimburse', dr('Dr 2190', 'Cr money account'), NONE, 'Bank transaction', NONE, NONE, 'Void the reimbursement'),
            ('Voucher, post', dr('Dr expense', 'Cr the float'), NONE, NONE, NONE, NONE, 'Void'),
            ('Float, top up', dr('Dr the float', 'Cr bank'), NONE, 'Bank transaction', NONE, NONE, 'Void the transfer')))
    note_ = ('<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">A float is a cash money account with an imprest, say US$200. Top up transfers what was spent since the last top-up, so the float returns to its imprest. '
             'Retail’s till payouts and petty cash already post; they are listed under All spending and keep their retail screens.</p>')
    return msec('Expense claim, float and voucher', 'ExpenseClaim, PettyCashVoucher (new)',
                'A claim is what someone spent from their own pocket; cost-tracker spends with no requisition become its lines. Withdraw takes a claim back before approval.',
                m, '<p class="bf-k" style="margin:8px 0 0">Petty cash voucher, spent from a float</p>' + str(f) + t + note_)

def books_states2():
    body = (bhead('Books', 'States: buying and spending',
                  'Every document that sends money out: what moves it, who may, what posts, and how it is undone. Two people where money leaves: nobody approves or pays their own request.')
            + po_m() + bill_m() + debit_m() + payment_m() + req_m() + claim_m())
    return bwrite('BooksStates2', 'Books · States: buying and spending', body, 5190)


# ---------- BooksStates3: bank, journals, periods, VAT, fiscal day, consumers ----------
def bank_m():
    a = M(1312, 170)
    a.n('s', 40, 50, '', 'i', 22).n('r', 380, 50, 'Recorded', 'i').n('rc', 820, 50, 'Reconciled', 'o').n('g', 380, 140, 'Gone', 'g')
    a.h('s', 'r', 'Created by its source', 'receipt, payment, transfer, charge, takings, disbursement')
    a.h('r', 'rc', 'Included in a closed reconciliation', 'locks its source until reopened')
    a.lab(400, 95, 200, 'Its source is voided', '', 'rt')
    a.line([(380, 66), (380, 121)])
    b = M(1312, 230)
    b.n('s', 40, 60, '', 'i', 22).n('t', 380, 60, 'To match', 'w').n('m', 820, 60, 'Matched', 'o').n('x', 380, 190, 'Excluded', 'p')
    b.h('s', 't', 'Upload a statement', 'CSV per account; no feeds yet')
    b.h('t', 'm', 'Accept a match, or Create a document', 'bank rights; a created document posts')
    b.p([(820, 76), (820, 140), (400, 140), (400, 79)], 'Unmatch', 'refused in a closed reconciliation', lx=610, ly=140, w=260)
    b.p([(360, 76), (360, 171)], 'Exclude, with a reason', 'bank rights', lx=348, ly=120, w=160, pos='lt')
    c = M(1312, 230)
    c.n('s', 40, 60, '', 'i', 22).n('o', 380, 60, 'Open', 'i').n('cl', 820, 60, 'Closed', 'o').n('v', 380, 190, 'Void', 'p')
    c.h('s', 'o', 'Start', 'account, statement end date and balance')
    c.h('o', 'cl', 'Close', 'difference 0.00; manager or accountant')
    c.p([(820, 76), (820, 140), (400, 140), (400, 79)], 'Reopen', 'owner', lx=610, ly=140, w=200)
    c.p([(360, 76), (360, 171)], 'Void', 'owner; started in error', lx=348, ly=120, w=160, pos='lt')
    t = fx((('Source posts', 'the source’s own entry', 'the source’s', 'Recorded', NONE, NONE, 'Void the source'),
            ('Match', NONE, NONE, 'linked to the line', NONE, NONE, 'Unmatch'),
            ('Exclude', NONE, NONE, NONE, NONE, NONE, 'Include again'),
            ('Close a reconciliation', NONE, NONE, 'lines and transactions locked', NONE, NONE, 'Reopen (owner)'),
            ('Bank entry: charge, interest, transfer', 'BANK_TRANSACTION posting', NONE, 'Recorded', NONE, NONE, 'Void, like any document')))
    k = lambda x: '<p class="bf-k" style="margin:8px 0 0">%s</p>' % x
    return msec('Bank transaction, statement line, reconciliation', 'BankTransaction, BankStatementLine, BankReconciliation',
                'One model: statement lines, bank transactions, and reconciliations that close. The old manual bank form becomes a Bank entry, a document voided like any other.',
                k('Bank transaction') + str(a) + k('Statement line') + str(b) + k('Reconciliation, one per account per statement') + str(c), t)

def journal_m():
    m = M(1312, 290)
    Y = 110
    m.n('d', 80, Y, 'Draft', 'n').n('ta', 420, Y, 'To approve', 'w').n('p', 760, Y, 'Posted', 'i').n('r', 1100, Y, 'Posted, reversed', 'p', 150).n('g', 80, 250, 'Gone', 'g')
    m.p([(80, Y - 16), (80, 40), (760, 40), (760, Y - 19)], 'Post, under the journal limit', 'accountant, manager, owner', lx=420, ly=40, w=260)
    m.h('d', 'ta', 'Send for approval', 'maker; over the limit')
    m.h('ta', 'p', 'Approve and post', 'another person with journal rights')
    m.h('p', 'r', 'Reverse', 'accountant, manager, owner')
    m.v('d', 'g', 'Delete', 'its maker', w=150)
    m.loop('ta', 'Withdraw, back to Draft', 'maker', 'dn')
    t = fx((('Post', 'the journal, numbered', NONE, NONE, NONE, NONE, 'Reverse'),
            ('Reverse', 'mirror with reversalOfEntryId; original stamped reversedAt', NONE, NONE, NONE, NONE, 'Post a new journal')))
    return msec('Manual journal', 'JournalEntry, MANUAL', 'System journals, posted by documents, can’t be reversed here: they are undone from their document. The Reversed tab reads reversedAt (fix 10).', m, t)

def period_m():
    m = M(1312, 230)
    m.n('s', 40, 60, '', 'i', 22).n('o', 380, 60, 'Open', 'i').n('c', 780, 60, 'Closed', 'o').n('y', 1160, 60, 'Year closed', 'o', 140)
    m.h('s', 'o', 'First posting in the month', 'automatic', dash=True)
    m.h('o', 'c', 'Close', 'checklist passes or each failure acknowledged; owner, manager, accountant')
    m.h('c', 'y', 'Year-end close', 'last month; owner or accountant')
    m.p([(780, 76), (780, 150), (400, 150), (400, 79)], 'Reopen, with a reason', 'owner only (today a manager can too)', lx=590, ly=150, w=300)
    m.lab(380, 205, 520, 'Freeze before a date', 'owner; a hard lock, also checked while the month is open', 'rt')
    t = fx((('Close', 'the close voucher', NONE, NONE, NONE, NONE, 'Reopen (owner)'),
            ('Reopen', 'voucher; audit event', NONE, NONE, NONE, NONE, 'Close again'),
            ('Year-end close', 'closing entry to retained earnings', NONE, NONE, NONE, NONE, '—'),
            ('Post into a closed month', 'allowed by lock policy: manager, with a reason', NONE, NONE, NONE, NONE, 'Void, dated in an open month')))
    return msec('Period', 'AccountingPeriod', 'A month. Once closed, posting into it is refused or allowed by the lock policy.', m, t)

def vat_m():
    m = M(1312, 300)
    Y = 70
    m.n('d', 70, Y, 'Draft', 'n').n('r', 340, Y, 'Reviewed', 'i').n('f', 610, Y, 'Finalised', 'i').n('fl', 880, Y, 'Filed', 'o').n('pd', 1170, Y, 'Filed, paid', 'o', 130)
    m.n('v', 340, 250, 'Void', 'p').n('am', 880, 250, 'Amended, new return', 'i', 180)
    m.group(0, 34, 680, 106, 'Draft, Reviewed, Finalised')
    m.h('d', 'r', 'Review', 'another person, where two exist')
    m.h('r', 'f', 'Finalise', 'manager or owner')
    m.h('f', 'fl', 'File', 'TaRMS reference and date')
    m.h('fl', 'pd', 'Pay', 'pay rights')
    m.drop(340, 106, 'v', 'Void', 'owner; unlocks its documents', w=200)
    m.v('fl', 'am', 'Amend ' + flag(), 'owner; how TaRMS takes it is not confirmed', w=260)
    t = fx((('Create, Refresh', 'reads every 2200 and 2210 source', NONE, NONE, NONE, NONE, 'Void (owner)'),
            ('Finalise', 'figures locked; its documents can’t be deleted', NONE, NONE, NONE, NONE, 'Void (owner)'),
            ('Pay', dr('Dr 2200 VAT payable', 'Cr money account'), 'ZIMRA as supplier', 'Bank transaction', NONE, NONE, 'Void the payment'),
            ('Amend', 'a new return for the same period, linked', NONE, NONE, NONE, NONE, '—')))
    return msec('VAT return', 'VatReturn', 'Refresh gathers the lines again while it is a draft. A tie-out against 2200 and 2210 blocks Finalise until explained.', m, t)

def fiscal_m():
    m = M(1312, 230)
    m.n('s', 40, 70, '', 'i', 22).n('o', 360, 70, 'Opened', 'i').n('c', 720, 70, 'Closing', 'w').n('cl', 1100, 70, 'Closed', 'o').n('e', 720, 200, 'Closing, with the error', 'b', 190)
    m.h('s', 'o', 'Open', 'owner, manager, shop manager, accountant')
    m.h('o', 'c', 'Close', 'same')
    m.h('c', 'cl', 'Device accepts', 'Z report', dash=True)
    m.loop('o', 'Sign documents', 'each receipt signed and chained')
    m.v('c', 'e', 'Device fails', 'shows on the register and on Money', dash=True, w=200, dx=-20, side='lt')
    m.p([(740, 184), (740, 86)], 'Retry', '', lx=752, ly=135, w=80, pos='rt')
    r = M(1312, 170)
    r.n('p', 120, 50, 'Pending', 'i').n('ok', 520, 50, 'Success', 'o').n('f', 120, 140, 'Failed', 'b')
    r.h('p', 'ok', 'Signed and accepted', '', dash=True)
    r.v('p', 'f', 'Device or FDMS refuses', '', dash=True, w=200)
    r.p([(180, 140), (520, 140), (520, 69)], 'Retry', 'the fiscal drain; a failed one blocks the close', lx=350, ly=140, w=300)
    t = fx((('Close the day', NONE, NONE, NONE, 'counters and signature to FDMS; Z report', NONE, 'Retry'),
            ('Sign a document', 'the document’s own entry', NONE, NONE, 'fiscal receipt, chained', NONE, 'A credit or debit note, never Void')))
    k = lambda x: '<p class="bf-k" style="margin:8px 0 0">%s</p>' % x
    return msec('Fiscal day and fiscal receipt', 'FiscalDay, FiscalReceipt', 'Fiscalised documents are never voided: they are only ever credited. Device setup lives in Management › Fiscal device.',
                k('Fiscal day') + str(m) + k('Fiscal receipt') + str(r), t)

def consumers_m():
    pay = boxed(ptable(('Payroll event', 'Core call', 'Ledger'), (
        ('Run approved', 'postMoney, PAYROLL_RUN', dr('Dr 5200, 5210 Wages and employer costs', 'Cr 2100 Net pay, 2110 PAYE, 2130 AIDS levy', 'Cr 2120 NSSA, 2140 ZIMDEF, 2160 SDF', 'Cr 2150 NEC, 2170 Other')),
        ('Disbursement batch paid', 'postMoney, PAYROLL_DISBURSEMENT', dr('Dr 2100 Net pay', 'Cr money account; Bank; IMTT line')),
        ('Statutory paid: PAYE, NSSA, ZIMDEF, SDF', 'a supplier payment to ZIMRA, NSSA or ZIMDEF', dr('Dr 2110, 2120, 2140, 2160', 'Cr money account')),
        ('Run reversed, in Payroll', 'voidMoney, PAYROLL_RUN', 'the mirror')), ('28%', '30%', '42%')))
    ret = boxed(ptable(('Retail event', 'Core call'), (
        ('Sale, refund, void', 'postMoney: RETAIL_SALE, REFUND, VOID, at base amounts per tender (existing)'),
        ('Shift open, variance, close, recovery', 'postMoney: SHIFT_* (existing)'),
        ('Day close banked', 'postMoney: RETAIL_DAY_BANKED and a bank transaction, which To match pairs with the statement'),
        ('Petty cash, payouts, laybys, vouchers', 'Existing postings; laybys and on-account sales gain sub-ledger lines (P4)')), ('28%', '72%')))
    return ('<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:32px;align-items:start"><div><p class="bf-k" style="margin:0 0 8px">People and payroll</p>%s'
            '<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">Books never edits or deletes a pay run. The gate that keeps a payroll-only workspace off the ledger goes.</p></div>'
            '<div><p class="bf-k" style="margin:0 0 8px">Retail takings and day close</p>%s<p style="margin-top:12px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">Retail’s own End of day is where takings are corrected; Books shows them.</p></div></div>') % (pay, ret)

def books_states3():
    body = (bhead('Books', 'States: bank, journals, periods, tax and the consumers',
                  'The machines that keep the books whole: the bank side, manual journals, the month, the VAT return and the fiscal day. Then the two modules that own their screens and post through the core.')
            + bank_m() + journal_m() + period_m() + vat_m() + fiscal_m()
            + bsec('Payroll and retail, as consumers', 'They own their screens and their undo. Their money posts through the core.', consumers_m()))
    return bwrite('BooksStates3', 'Books · States: bank, journals, periods, tax', body, 4950)


# ---------- BooksFlows: the workflows, one board per group ----------
def para(text):
    return '<p style="margin-top:14px;font-size:13px;line-height:1.6;color:var(--color-ink-2)">%s</p>' % text

def stepsrows(items, per=4):
    """Numbered steps in rows; the arrows join steps within a row."""
    out = ''
    for i in range(0, len(items), per):
        out += '<div style="margin-top:%dpx">%s</div>' % (0 if i == 0 else 20, steps(items[i:i + per], cols=per))
    return out

def mini(title, aside, body):
    return '<div style="margin-top:32px"><div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px"><b style="font-size:15px;font-weight:600">%s</b><span style="font-size:13px;color:var(--color-ink-2)">%s</span></div>%s</div>' % (title, aside, body)

NOP = '<span class="muted">Nothing posts</span>'

def books_flows1():
    q = stepsrows([
        step(1, 'Send the quote', scr('Sales', 'Quotes', 'New quote'), arrow_state('Draft', 'n', 'Sent', 'i'), NOP + '. QT-0212 gets its number, a PDF and a WhatsApp to Pomona Offices.', 'Revise or void the quote', 'anyone with Sales'),
        step(2, 'Accepted, make the invoice', 'The customer’s link, or Mark accepted on the quote', arrow_state('Sent', 'i', 'Accepted', 'o'), NOP + '. Make invoice opens a draft with the quote’s lines.', 'Delete the draft invoice', 'Sales rights'),
        step(3, 'Issue INV-0142', scr('Sales', 'Invoices', 'the draft') + ' · ' + kbd('I'), arrow_state('Draft', 'n', 'Issued', 'i'),
             dr('Dr Receivable 1,994.22', 'Cr Sales 1,726.60', 'Cr 2200 VAT output 267.62') + '<span class="muted">Number, rate frozen, fiscalised: QR and code. Device down: fiscal Pending, Retry on the Fiscal register.</span>',
             'Void with a credit note, or Revise', 'Sales rights'),
        step(4, 'Money arrives', scr('Payments received', 'New') + ', or ' + scr('To match', 'Create receipt'), arrow_state('Issued', 'i', 'Part paid', 'i'),
             dr('Dr CBZ current, USD 500.00', 'Cr Receivable 500.00') + '<span class="muted">A bank transaction; US$1,494.22 left.</span>', 'Void the receipt; its bank line reopens', 'Sales rights, cashier, rep'),
        step(5, 'Chase what is overdue', scr('Invoices', 'Overdue') + ', select, Send reminders; or print statements', 'Overdue is worked out from the due date', NOP, '—', 'Sales rights')], per=5)
    note1 = para('Before issuing, check the customer’s VAT number and TIN: mandatory on a fiscal invoice since 31 May 2025 when the buyer is registered. A wrong quote is revised or voided, since nothing posted. A wrong invoice: see BooksFlows7.')
    cash = stepsrows([
        step(1, 'New invoice, Paid now', scr('Invoices', 'New') + ', tick Paid now, choose EcoCash', 'Highlands Guest Lodge, US$240.00', '', '', 'Sales rights'),
        step(2, 'Issue', 'One action, two documents', arrow_state('Draft', 'n', 'Paid', 'o'), dr('Dr Receivable, Cr Sales and VAT', 'Dr EcoCash, Cr Receivable'), 'Void either one', '')], per=2)
    dep = stepsrows([
        step(1, 'Deposit invoice', scr('Invoices', 'New') + ', tick Deposit', 'Msasa Motors, US$1,500.00 of a US$3,000.00 job', 'A full fiscal tax invoice for the deposit ' + flag(), 'Void with a credit note', 'Sales rights'),
        step(2, 'Final invoice', 'For the balance, naming the deposit invoice', 'US$1,500.00, the balance', 'Posts the balance only', 'Void with a credit note', 'Sales rights')], per=2)
    dep += para('A deposit that arrives before any invoice is a payment on account, allocated later.')
    cn = stepsrows([
        step(1, 'Credit', 'INV-0136 › Credit: skirting returned, US$85.00, reason Return', arrow_state('Draft', 'n', 'Issued', 'i'), dr('Dr Sales, Dr 2200 VAT output', 'Cr Receivable') + '<span class="muted">Fiscalised, naming the original.</span>', 'Void if not fiscalised; else a new invoice', 'Sales rights'),
        step(2, 'The balance drops', 'CN-0007 on INV-0136, Dr N. Sibanda', 'Already paid, so US$85.00 is refunded', 'Excess becomes customer credit, or a refund', '', '')], per=2)
    wo = stepsrows([
        step(1, 'Write off', scr('Customers', 'By age') + ', or the invoice', 'INV-0098, US$75.00, 190 days', dr('Dr Bad debts', 'Cr Receivable'), 'Void the write-off', 'limit; owner over the limit'),
        step(2, 'Balance clears', 'With a reason, kept', arrow_state('Issued', 'i', 'Paid', 'o'), 'Fiscalised invoice: a credit note, reason bad debt ' + flag(), '', '')], per=2)
    grid = '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 40px">%s%s%s%s</div>' % (
        mini('Cash sale, not through a till', 'Issue and receipt in one action.', cash), mini('Deposit on a job', 'The CRM’s deposit tick.', dep),
        mini('Credit note', 'From the invoice.', cn), mini('Write-off', 'Over accountOwnerOver, the owner approves.', wo))
    body = (bhead('Books', 'Flows: selling', 'From a quote to money in the bank, and the four other ways a sale is made or reduced. Each step names its screen, who does it, the state it moves, what posts, and its undo.')
            + bsec('Quote, invoice, receipt, statement', 'Pomona Offices’ fit-out. Figures are US$ and agree with the Books boards.', q + note1)
            + bsec('The other sales', 'Each is two or three presses.', grid))
    return bwrite('BooksFlows1', 'Books · Flows: selling', body, 1760)

def books_flows2():
    s_ = stepsrows([
        step(1, 'Requisition', scr('Bills & spending', 'Requisitions', 'New'), arrow_state('Draft', 'n', 'To approve', 'w'), NOP + '. REQ-0094: adhesive and trims from Halsted Builders, US$1,155.00.', 'Cancel', 'Blessing Zhou, rep'),
        step(2, 'Approval', 'WhatsApp and the app ask, as retail does', arrow_state('To approve', 'w', 'Approved', 'o'), NOP, 'Cancel', 'Farai Ncube, within his limit; never the requester'),
        step(3, 'Purchase order', 'From the approved requisition, or New', arrow_state('Draft', 'n', 'Sent', 'i'), NOP + '. PO-0221 sent to Halsted.', 'Cancel', 'buying rights'),
        step(4, 'Goods received', scr('Purchase orders', 'PO-0221', 'Receive') + '; count against the PO', arrow_state('Counted', 'n', 'Posted', 'i'), dr('Dr Stock 1,000.00', 'Cr 2010 Goods received, not billed') + '<span class="muted">Stock in. A draft bill, BILL-0224.</span>', 'Reverse the goods receipt', 'buying rights'),
        step(5, 'Bill', 'Open BILL-0224, enter the FTI number and date, check on FDMS', arrow_state('Draft', 'n', 'Recorded', 'i'), dr('Dr 2010 1,000.00', 'Dr 2210 VAT input, once Valid 155.00', 'Cr Payable 1,155.00') + '<span class="muted">Not checked is allowed, flagged.</span>', 'Void or Revise', 'buying rights; owner first over US$500'),
        step(6, 'Payment', scr('Payments made', 'New') + ', choose BILL-0224', arrow_state('Approved', 'o', 'Paid', 'o'),
             dr('Dr Payable 1,155.00', 'Cr CBZ current, USD 808.50', 'Cr 2180 Withholding 346.50', 'Dr IMTT 16.17', 'Cr CBZ current, USD 16.17') + '<span class="muted">No ITF263 on file and US$1,000 this year ' + flag() + ': 30% withheld. Certificate drafted.</span>',
             'Void; the bank line reopens', 'approved by Farai, paid by James'),
        step(7, 'Withholding return', scr('Tax', 'Withholding'), 'Return by the 5th, payment by the 10th', dr('Dr 2180', 'Cr money account, to ZIMRA'), 'Void the payment', 'accountant')], per=4)
    agent = cards((
        ('hand', 'Our customer withholds VAT', 'Their payment is short by a third of the VAT. Record the receipt with VAT withheld by the customer and the certificate number: Dr 1170 VAT withheld receivable, which the VAT return claims.'),
        ('vat', 'We withhold VAT', 'If we are an agent (a setting in Money and tax), our supplier payments withhold a third of the VAT the same way, to 2185 VAT withheld payable.'),
        ('back', 'Undo, at each point', 'Requisition or PO before money moves: cancel. A goods receipt: reverse. A bill: void or revise. A payment: void, and the bank line reopens.')), 3)
    body = (bhead('Books', 'Flows: buying', 'Asking, approving, ordering, receiving, recording the supplier’s invoice and paying, with withholding and IMTT where they apply. Two people where money leaves.')
            + bsec('Requisition to payment', 'Halsted Builders, flooring adhesive and trims. A second person approves; a third pays where the shop has one.', s_)
            + bsec('VAT withholding agents and undo', 'Two rarer cases, and how each step is taken back.', agent))
    return bwrite('BooksFlows2', 'Books · Flows: buying', body, 1400)

def books_flows3():
    req = stepsrows([
        step(1, 'Disburse', 'REQ-0088 › Disburse, choose the money account', arrow_state('Approved', 'o', 'Disbursed', 'i'), dr('Dr 1150 Cash advances 310.00', 'Cr EcoCash 310.00'), 'Reverse disbursement (owner or granted)', 'not the requester or approver'),
        step(2, 'Account for', 'Blessing attaches receipts from the cost tracker or a photo; each line has a category', arrow_state('Disbursed', 'i', 'Accounted for', 'o'), dr('Dr Materials (5500–5590) 284.50', 'Cr 1150 284.50') + '<span class="muted">VAT input only on a valid FTI.</span>', 'Reopen: the mirror', 'Blessing, or a disburser'),
        step(3, 'Change returned', 'The unspent US$25.50 comes back', 'With the acquittal', dr('Dr EcoCash 25.50', 'Cr 1150 25.50'), 'with the acquittal', 'requester'),
        step(4, 'Or a top-up', 'Spent more than given', 'With the acquittal', dr('Dr 1150', 'Cr money account'), 'with the acquittal', 'a disburser')], per=4)
    req += para('The CRM’s requisition list and actions filter to CRM rows, so they no longer act on retail’s. Books’ Requisitions shows both, with a Source column. 1150 ends at 0.00 once accounted for.')
    ct = cards((
        ('hand', 'Spent, from a requisition', 'A line of that requisition’s acquittal. Posts with the acquittal.'),
        ('person', 'Spent, own pocket', 'Becomes a claim line when the day is sent. Approve, then reimburse.'),
        ('takings', 'Spent, from a float', 'A petty cash voucher against the person’s float.'),
        ('money', 'Money received on site', 'Must name the invoice or customer. A receipt into the rep’s cash float: the cash is with the rep until banked.'),
        ('x', 'Deleting an entry', 'Before the day is sent, it removes the draft. After, refused; void the document it fed.')), 5)
    cm = M(1312, 210)
    cm.n('p', 80, 60, 'Pending', 'n').n('a', 460, 60, 'Approved', 'o').n('pd', 860, 60, 'Paid', 'o').n('v', 460, 180, 'Void', 'p')
    cm.h('p', 'a', 'Approve', 'commissions.manage, not the earner')
    cm.h('a', 'pd', 'Pay', 'pay rights, not the earner; or the next pay run')
    cm.v('a', 'v', 'Void', 'commissions.manage; also from Pending', w=260)
    cm.loop('pd', 'Void refused', 'pay it back as a deduction or a receipt', 'dn', w=260)
    ctab = fx((('Approve', dr('Dr Commission expense', 'Cr 2195 Commission payable'), NONE, NONE, NONE, NONE, 'Void'),
               ('Pay', dr('Dr 2195', 'Cr money account'), NONE, 'Bank transaction', NONE, NONE, 'refused once paid'),
               ('Void', 'mirror of the approval, if posted', NONE, NONE, NONE, NONE, '—')))
    proj = ('<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start">%s%s</div>') % (
        '<div class="bf-box"><h3>Cost from the ledger</h3><p>A CRM project’s cost is the journal lines carrying its cost centre. Every CRM posting (invoice, receipt, requisition, claim, commission) passes the project’s cost centre when the document names the project, or a deal on it. Today the cost is summed from requisitions and cost entries.</p></div>',
        boxed(table(('Pomona Offices fit-out', 'Spent', 'Committed'), (
            ('Requisitions accounted for', '284.50', '—'), ('Claims', '18.00', '—'), ('Approved, not disbursed', '—', '1,155.00')), total=('Cost so far', '302.50', '1,155.00'), numcols=(1, 2))))
    body = (bhead('Books', 'Flows: CRM money', 'Requisitions, the cost tracker, commission and project cost, all posting through the core from P2. The CRM’s screens stay; Books lists the same rows.')
            + bsec('Requisitions', 'REQ-0088, adhesive for the Pomona job, US$310.00, Blessing Zhou.', req)
            + bsec('The cost tracker', 'Each kind of entry goes where it belongs. The gap the CRM finance page shows today closes.', ct)
            + bsec('Commission', 'The any-to-any status change and Reopen go. Approve and pay post.', str(cm) + ctab, meta='CrmCommissionEntry')
            + bsec('Project cost', 'Committed requisitions show apart from what is spent.', proj))
    return bwrite('BooksFlows3', 'Books · Flows: CRM money', body, 2010)

def books_flows4():
    pc = stepsrows([
        step(1, 'Set up the float', 'Management › Money accounts › New float', 'Showroom float, held by Chipo, US$200.00', NOP, 'Deactivate the float', 'owner'),
        step(2, 'Spend with a voucher', 'The voucher, with a photo of the slip', arrow_state('Draft', 'n', 'Posted', 'i'), dr('Dr Cleaning 14.00', 'Cr Showroom float 14.00') + '<span class="muted">Under US$20, posts at once; over, the manager approves.</span>', 'Void the voucher', 'Chipo, the holder'),
        step(3, 'Top up', 'The app proposes what was spent since the last top-up', 'US$162.40 back to US$200.00', dr('Dr Showroom float 162.40', 'Cr CBZ current, USD 162.40'), 'Void the transfer', 'approved, then posted'),
        step(4, 'Count at month end', 'Close the month › Checklist › Floats counted', 'A difference needs a reason', dr('Dr or Cr variance', 'Cr or Dr the float') + '<span class="muted">Manager approves.</span>', 'Void the variance', 'manager')], per=4)
    pc += para('Claims, own pocket: send, approve, reimburse (BooksStates2). Undo: void the voucher or the claim; a reimbursement is voided like a payment.')
    ret = boxed(ptable(('Retail does', 'Books shows', 'Gap closed'), (
        ('Sales, refunds, shifts (post today)', 'Money, All spending (payouts), Takings', 'none'),
        ('Day close banked, with a bank transaction', 'Bank & cash › To match pairs it with the statement', 'none'),
        ('Supplier payments', 'Payments made, with a payables line', 'today they post with no sub-ledger line (fix 1)'),
        ('Goods receipts', 'A draft bill per receipt, under Bills', 'today no bill (fix 1)'),
        ('Requisition payouts', 'Requisitions, Source: Retail', 'today only a bank transaction in Books'),
        ('On-account sales, laybys, vouchers', 'Customer balances in the sub-ledger', 'today their own balances only (P4)')), ('32%', '36%', '32%')))
    stock = cards((
        ('store', 'Stock valuation', 'Movements already post. Adjustments captured Pending today post through the drain. Over adjustmentPinOver, or a count difference over countOwnerOver, needs approval first.'),
        ('edit', 'Work order completed', 'Posts parts and labour: Dr maintenance expense by the asset’s cost centre, Cr stock and accrued labour or the supplier bill. Status changes use recordEvent. Reopening voids the completion posting.'),
        ('money', 'Gold', 'Purchases and buyer receipts post now. Dispatches, allocations and corrections post through the drain. Settlements post as a payroll disbursement. Billing goes through the core’s Issue.'),
        ('docs', 'Schools', 'Fee documents keep posting and gain sub-ledger lines, so a guardian’s balance and Books’ aging agree. Fees are VAT exempt.')), 4)
    pay = stepsrows([
        step(1, 'Payroll approves the run', 'People and payroll', 'Run Posted, in Payroll', dr('Dr 5200, 5210', 'Cr 2100 Net pay, 2110 PAYE, 2120 NSSA, …'), 'Reversed in Payroll: the mirror', 'payroll approver'),
        step(2, 'Books shows it', 'Money › Where it went; Tax › What’s due', 'PAYE and withholding by the 5th and 10th; NSSA, ZIMDEF, SDF', NOP, '—', ''),
        step(3, 'Pay the people', 'Payroll’s disbursement batch', 'Batch paid', dr('Dr 2100', 'Cr CBZ current, USD') + '<span class="muted">Each bank or wallet leg carries IMTT, as a bank charge.</span>', 'Reversed in Payroll', ''),
        step(4, 'Pay ZIMRA, NSSA, ZIMDEF', scr('Payments made', 'New') + '; suppliers seeded at setup', arrow_state('Approved', 'o', 'Paid', 'o'), dr('Dr 2110, 2120, 2140, 2160', 'Cr money account'), 'Void the payment', 'limit')], per=4)
    pay += para('Books has no edit on pay runs. %s The PAYE table in the statutory pack is 2025’s.' % flag())
    body = (bhead('Books', 'Flows: petty cash, retail, stock and payroll', 'The modules that own their screens and post through the core, and the float that pays for the small things.')
            + bsec('Petty cash and expenses', 'Chipo’s showroom float, US$200.00 imprest.', pc)
            + bsec('Retail into Books', 'What the till already does, and where Books shows it.', ret)
            + bsec('Stock, maintenance, gold and schools', 'Posting through the drain and the core’s Issue.', stock)
            + bsec('Payroll into Books', 'A consumer: payroll posts, Books shows, tax lands on the calendar.', pay))
    return bwrite('BooksFlows4', 'Books · Flows: petty cash, retail, stock and payroll', body, 1940)

def books_flows5():
    bank = stepsrows([
        step(1, 'Statements in', scr('Bank & cash', 'Accounts', 'CBZ current, USD', 'Upload a statement') + ' · ' + kbd('U'), 'CSV per account; CBZ weekly; no feeds yet', 'Lines land in To match', 'Delete the upload before any line is matched', 'bank rights'),
        step(2, 'Match', scr('Bank & cash', 'To match'), arrow_state('To match', 'w', 'Matched', 'o'), 'Accept one, many, or Accept Vane’s 3; or Choose. Create a receipt, payment, bank charge or transfer from the line, which posts. Or Exclude with a reason.', 'Unmatch; Include again', 'bank rights'),
        step(3, 'IMTT and charges', 'Lines the matcher recognises are proposed as a Bank entry', 'Bank entry, charge', dr('Dr IMTT expense 16.17', 'Cr CBZ current, USD 16.17'), 'Void the bank entry', 'bank rights'),
        step(4, 'Reconcile', scr('Reconciliations', 'Start') + ': statement end date and balance', arrow_state('Open', 'i', 'Closed', 'o'), 'Book balance, matched, unmatched, difference. Close at 0.00; locks its lines.', 'Reopen (owner)', 'manager or accountant'),
        step(5, 'Book equals bank equals ledger', 'Every receipt and payment that names an account makes its bank transaction (fix 6)', 'Opening plus transactions', NOP, '—', '')], per=5)
    imtt = kstrip((('IMTT on USD', '2%', 'what the bank charged is recorded'), ('IMTT on ZWG', '1.5%', 'from 1 Jan 2026'), ('Flat, over US$500,000', 'US$10,150', 'per transaction'), ('Our side', 'None', 'except the proposed line on a payment')))
    fxd = stepsrows([
        step(1, 'Morning: today’s rate', scr('Close the month', 'Rates & revaluation'), '27.00 ZiG to US$1, RBZ interbank, 07:05', 'With no rate today, the latest earlier one applies and Money says so', 'Enter a manual rate', 'automatic, or the accountant'),
        step(2, 'A ZiG invoice', 'INV-0144, Westgate Interiors, ZiG 13,500.00', arrow_state('Draft', 'n', 'Issued', 'i'), dr('Dr Receivable 500.00', 'Cr Sales and VAT 500.00') + '<span class="muted">Posted in USD at 27.00; the invoice shows both.</span>', 'Void with a credit note', 'Sales rights'),
        step(3, 'Paid in US dollars', 'A USD receipt allocated to the ZiG invoice', 'Receipt keeps USD and its rate, 27.40', dr('Dr CBZ current, USD 492.70', 'Dr Exchange loss 7.30', 'Cr Receivable 500.00') + '<span class="muted">Realised gain or loss.</span>', 'Void the receipt', 'Sales rights'),
        step(4, 'Reports', 'Trial balance, statements, aging', 'Base currency, USD', 'Aging and statements also show each currency on its own', '—', ''),
        step(5, 'Month end revaluation', scr('Rates & revaluation', 'Revaluation'), 'Open ZiG receivables, payables and accounts at the month-end rate', dr('Dr or Cr Unrealised gain or loss') + '<span class="muted">Reversed on the 1st of next month.</span>', 'Void the revaluation', 'accountant'),
        step(6, 'Tax in its currency', 'Tax › What’s due', 'Paid in the currency of trade, except income tax (PN 34/2026)', 'The VAT return shows output and input by currency', '—', ''),
        step(7, 'Base currency', 'Management › Money and tax', 'USD by default; ZWG-functional workspaces choose at setup', 'Changing it after the first posting is refused ' + flag(), '—', 'owner')], per=4)
    body = (bhead('Books', 'Flows: bank, cash and two currencies', 'How statements come in and are matched, what IMTT does, how a reconciliation closes, and a day with US dollars and ZiG side by side.')
            + bsec('Bank and cash', 'CBZ current, USD, one statement a week. Vane proposes matches; a person accepts them.', bank + '<div style="margin-top:24px">%s</div>' % imtt)
            + bsec('A multi-currency day', 'The document keeps its own currency and rate; the books are in base currency. ZWG is the code in exports and on fiscal invoices.', fxd))
    return bwrite('BooksFlows5', 'Books · Flows: bank, cash and two currencies', body, 1650)

def books_flows6():
    vat = stepsrows([
        step(1, 'See what is due', scr('Tax', 'What’s due'), 'Category A, odd months: September’s return', 'Return by 10 Oct, payment by 15 Oct (SI 81 of 2025) ' + flag(), '—', 'everyone with Tax'),
        step(2, 'Gather the return', scr('VAT returns', 'New') + ' for the period', arrow_state('', 'i', 'Draft', 'n'), 'Lines gathered from every source below; Refresh gathers again', 'Void (owner)', 'Rudo, accountant'),
        step(3, 'Tie out', 'The tie-out line: return against 2200 and 2210', 'Difference 0.00', 'A difference blocks Finalise until explained', '—', ''),
        step(4, 'Review and finalise', 'A second person where there is one', arrow_state('Reviewed', 'i', 'Finalised', 'i'), 'Figures locked; its documents can’t be deleted', 'Void (owner)', 'Farai reviews; James finalises'),
        step(5, 'File and pay', 'File with the TaRMS reference; then Pay', arrow_state('Filed', 'o', 'Filed, paid', 'o'), dr('Dr 2200 VAT payable', 'Cr CBZ current, USD'), 'Amend: a new return, linked ' + flag(), 'manager or owner; pay rights')], per=5)
    gathered = boxed(ptable(('The return gathers', 'From'), (
        ('Output VAT, less credit notes', 'Issued sales invoices and credit notes'),
        ('Output VAT from the tills', 'Retail, and any other source posting to 2200'),
        ('Input VAT, less debit notes', 'Recorded bills whose FTI is Valid on FDMS'),
        ('Input VAT on small spending', 'Claims, requisition receipts and petty cash with a valid FTI'),
        ('VAT withheld', 'By our customers (a credit), and by us as an agent'),
        ('Exempt', 'School fees')), ('40%', '60%')))
    rate = para('Rate change: documents keep the rate at their time of supply, 15% before 2026 and 15.5% from 1 Jan 2026, from the tax code’s dates.')
    checks = (('Nothing in Needs posting', 'no Failed, no Pending over an hour', 'ok'), ('No fiscal receipt failed', 'no fiscal day stuck in Closing', 'bad'),
              ('Every money account reconciled', 'to a statement dated on or after the month end', 'ok'), ('Floats counted', 'Showroom float', 'ok'),
              ('Requisitions not accounted for', 'disbursed over 30 days ago: listed', 'warn'), ('Bills with an FTI not checked', 'on FDMS: listed', 'warn'),
              ('Old drafts', 'invoices and bills older than the month: listed', 'ok'), ('Rates and revaluation', 'month-end rate present, revaluation posted', 'ok'),
              ('Payroll posted', 'for the month', 'ok'), ('VAT return tied out', 'if a period ends this month', 'ok'), ('Trial balance balances', '', 'ok'))
    tone = {'ok': ('o', 'Done'), 'bad': ('b', '1 failed'), 'warn': ('w', 'Listed')}
    cl = '<div class="bf-box" style="padding:4px 20px">%s</div>' % ''.join(
        '<div style="display:grid;grid-template-columns:28px minmax(0,1fr) 110px;gap:12px;align-items:center;min-height:44px;box-shadow:inset 0 -1px 0 var(--color-line);font-size:14px"><span class="mono muted">%d</span><span><b style="font-weight:500;color:var(--color-ink)">%s</b> <span class="muted">%s</span></span><span style="justify-self:end">%s</span></div>' % (
            i + 1, a, b, st(tone[t][1], tone[t][0])) for i, (a, b, t) in enumerate(checks))
    closeside = ('<div style="display:flex;flex-direction:column;gap:16px">%s%s%s</div>') % (
        '<div class="bf-box"><h3>Close</h3><p>Each item green, or acknowledged with a reason by the owner. Close posts the voucher. The owner reopens with a reason.</p><div style="margin-top:14px;display:flex;gap:8px">%s</div></div>' % btn('Close September', 'done', 'btn btn-primary', 'Ctrl ↵'),
        '<div class="bf-box"><h3>Year end</h3><p>The December close, plus the closing entry to retained earnings, the year’s export for the accountant, and the ITF12C reminder, due 30 Apr the next year.</p></div>',
        '<div class="bf-box"><h3>Provisional tax (QPDs) %s</h3><p>Tax › Provisional tax holds the estimate and four instalments: 10%%, 25%%, 30%%, 35%%. Reminders go two weeks and two days before each date. The dates are a setting, since the notices disagree.</p></div>' % flag())
    month = '<div style="display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:32px;align-items:start">%s%s</div>' % (cl, closeside)
    body = (bhead('Books', 'Flows: VAT, month end and year end', 'The VAT return from what is due to paid, then the month’s close checklist, the year end and provisional tax.')
            + bsec('VAT', 'September 2026, Category A. Rudo prepares, Farai reviews, James finalises.', vat + '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px;margin-top:24px;align-items:start">%s<div>%s</div></div>' % (gathered, rate + para('Undo: refresh a draft; void a draft, reviewed or finalised return (owner); a filed return is amended ' + flag() + '.')))
            + bsec('Close the month', 'Close the month › Checklist, extended. Shown here for September, with one fiscal receipt still failing.', month))
    return bwrite('BooksFlows6', 'Books · Flows: VAT, month end and year end', body, 1710)

def doc_(ref, state, tone, amount='', sub_=''):
    """One document as a line: number, state, amount, a short note."""
    return ('<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;font-size:13px;line-height:1.4;min-height:26px">'
            '<span class="ref" style="margin:0">%s</span>%s%s%s</div>') % (
        ref, st(state, tone) if state else '', '<span class="mono" style="color:var(--color-ink);font-size:12px">%s</span>' % amount if amount else '',
        '<span class="muted" style="flex-basis:100%%;font-size:12px">%s</span>' % sub_ if sub_ else '')

def fix_row(n, mistake, before, action, who, after, note_=''):
    return ('<div style="display:grid;grid-template-columns:28px 220px minmax(0,1fr) 250px minmax(0,1.25fr);gap:20px;align-items:start;padding:18px 0;box-shadow:inset 0 -1px 0 var(--color-line)">'
            '<span class="mono muted" style="line-height:26px">%d</span><div><b style="font-weight:600;color:var(--color-ink);font-size:14px;line-height:1.4">%s</b>%s</div>'
            '<div style="display:flex;flex-direction:column;gap:6px">%s</div>'
            '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">%s</div><span style="font-size:12px;line-height:1.5;color:var(--color-muted)">%s</span></div>'
            '<div style="display:flex;flex-direction:column;gap:6px">%s</div></div>') % (
        n, mistake, '<p style="margin-top:6px;font-size:12px;line-height:1.5;color:var(--color-ink-2)">%s</p>' % note_ if note_ else '', before, action, who, after)

def books_flows7():
    hd = ('<div style="display:grid;grid-template-columns:28px 220px minmax(0,1fr) 250px minmax(0,1.25fr);gap:20px;height:36px;align-items:center;font-size:12px;font-weight:500;color:var(--color-muted);box-shadow:inset 0 -1px 0 var(--color-line)">'
          '<span></span><span>Mistake</span><span>Before</span><span>What the person does</span><span>After</span></div>')
    R = [
        ('Wrong amount on an issued invoice', [doc_('INV-0133', 'Issued', 'i', 'US$420.00', 'Msasa Motors; the skirting was priced twice')],
         btn('Revise', 'edit'), 'Owner or granted, with a reason',
         [doc_('INV-0133', 'Void', 'p', '', 'Replaced by INV-0137'), doc_('CN-0008', 'Issued', 'i', 'US$420.00', 'Cancellation, fiscalised'), doc_('INV-0137', 'Issued', 'i', 'US$380.00', 'Payments move to it')],
         'If only part was overcharged, Credit the difference instead.'),
        ('Wrong customer on an issued invoice', [doc_('INV-0143', 'Issued', 'i', 'US$640.00', 'Avondale Fresh Mart, meant for another customer')],
         btn('Revise', 'edit') + '<span class="muted" style="font-size:12px">choose the customer</span>', 'Owner or granted',
         [doc_('INV-0143', 'Void', 'p', '', 'Voided 12 Oct'), doc_('CN-0009', 'Issued', 'i', 'US$640.00', 'Cancellation, wrong customer'), doc_('New invoice', 'Issued', 'i', 'US$640.00', 'For the right customer')],
         'Payments stay with the customer who paid, on account. The app asks whether to move them.'),
        ('Duplicate receipt', [doc_('REC-0304', 'Recorded', 'o', 'US$600.00'), doc_('REC-0305', 'Recorded', 'o', 'US$600.00', 'Chisipite Dental: the same money twice')],
         btn('Void', 'x') + '<span class="muted" style="font-size:12px">reason “duplicate”</span>', 'Owner or granted',
         [doc_('REC-0305', 'Void', 'p', '', 'Mirror posted; bank transaction removed; statement line reopened; invoice balance back')]),
        ('Payment to the wrong supplier', [doc_('PAY-0098', 'Paid', 'o', 'US$420.00', 'Halsted Builders, meant for Kopje Timber')],
         btn('Void', 'x') + btn('New payment', 'plus', 'btn btn-quiet'), 'Owner or granted to void; limit to pay',
         [doc_('PAY-0098', 'Void', 'p', '', 'Mirror; bill balance back; bank line reopened'), doc_('PAY-0099', 'Paid', 'o', 'US$420.00', 'Kopje Timber')],
         'If the money really went to the wrong supplier, keep it and record a supplier credit to recover.'),
        ('Wrong account on a manual journal', [doc_('JE-0419', 'Posted', 'i', '150.00', 'Dr Rent instead of Dr Repairs')],
         btn('Reverse', 'back') + btn('New journal', 'plus', 'btn btn-quiet'), 'Accountant, manager, owner',
         [doc_('JE-0419', 'Posted, reversed', 'p'), doc_('JE-0420', 'Posted', 'i', '150.00', 'The mirror, reversalOfEntryId'), doc_('JE-0421', 'Posted', 'i', '150.00', 'Dr Repairs')]),
        ('Wrong account on a document’s posting', [doc_('BILL-0219', 'Paid', 'o', 'US$312.40', 'posted to Materials, should be Repairs')],
         btn('Fix the rule', 'posting', 'btn btn-quiet') + btn('Revise', 'edit'), 'Accountant fixes the rule; owner or granted revises',
         [doc_('BILL-0219', 'Void', 'p', '', 'Replaced by BILL-0225'), doc_('BILL-0225', 'Recorded', 'i', 'US$312.40', 'Posted to Repairs')],
         'Or, for an accountant, a correcting journal with a note.'),
        ('Posted in the wrong month, month open', [doc_('INV-0141', 'Paid', 'o', 'US$430.00', 'dated 5 Sep, meant 5 Oct')],
         btn('Revise', 'edit') + '<span class="muted" style="font-size:12px">the right date</span>', 'Owner or granted',
         [doc_('INV-0141', 'Void', 'p', '', 'Voided in September'), doc_('New invoice', 'Paid', 'o', 'US$430.00', 'In October')]),
        ('Posted in the wrong month, month closed', [doc_('INV-0128', 'Issued', 'i', '', 'In August; August is closed')],
         btn('Reopen August', 'calendar', 'btn btn-quiet') + btn('Revise', 'edit'), 'Owner only reopens',
         [doc_('August', 'Open', 'i', '', 'Voucher and audit for the reopen; revise; close again')],
         'Or post a correcting entry in the current month with a note.'),
        ('A whole batch wrong', [doc_('14 receipts', 'Recorded', 'o', '', 'Duplicate import of 13 Oct')],
         btn('Void 14', 'x'), 'Select the batch; one reason for all; owner or granted',
         [doc_('11', 'Void', 'p', '', 'Each voided on its own'), doc_('2', 'Skipped', 'w', '', 'REC-0306 matched in a closed reconciliation; REC-0310 in an open fiscal day'), doc_('1', 'Unchanged', 'n', '', 'REC-0299 already void')]),
        ('Test data to purge', [doc_('9 invoices', 'Issued', 'i', '', 'Made while setting up')],
         btn('Delete permanently', 'x') + '<span class="muted" style="font-size:12px">type “delete” and 9</span>', 'Owner only',
         [doc_('7', 'Gone', 'g', '', 'Each deleted under the delete rules; snapshot kept in the audit trail'), doc_('2', 'Skipped', 'w', '', 'Fiscalised on a live device')],
         'Fiscalised rows are refused unless the device is in test mode.'),
        ('Wrong rate on a document', [doc_('INV-0144', 'Paid', 'o', 'ZiG 13,500.00', 'at 25.00, the rate was 27.00')],
         btn('Revise', 'edit') + '<span class="muted" style="font-size:12px">the right rate</span>', 'Owner or granted',
         [doc_('INV-0144', 'Void', 'p'), doc_('New invoice', 'Issued', 'i', 'ZiG 13,500.00', 'Posted at 27.00')]),
        ('Bill recorded twice', [doc_('BILL-0221', 'Recorded', 'i', 'US$96.00'), doc_('BILL-0222', 'Recorded', 'i', 'US$96.00', 'the same FTI number')],
         btn('Void', 'x'), 'Owner or granted',
         [doc_('BILL-0222', 'Void', 'p', '', 'Mirror; payable down')])]
    rows_ = ''.join(fix_row(i + 1, m_, ''.join(b), a, w, ''.join(af), *nt) for i, (m_, b, a, w, af, *nt) in enumerate(R))
    body = (bhead('Books', 'Fixing mistakes',
                  'Every kind of mistake, and the one way Books fixes it. Nothing posted is edited in place: it is voided, revised or reversed, and both versions stay, linked. Who may do it is under each action.')
            + bsec('One row per mistake', 'Before, the action and who may take it, and what the books hold after. Figures and numbers match the Books page boards.', hd + rows_))
    return bwrite('BooksFlows7', 'Books · Fixing mistakes', body, 2340)

def books_flows8():
    L = (('Invoices', 'Issue drafts, Send, Send reminders, Print statements, Export', 'Void', 'Sales rights', 'Delete (posted): owner'),
         ('Quotes', 'Send, Export', 'Void', 'Sales rights', ''),
         ('Payments received', 'Allocate to oldest invoices, Export', 'Void', '', ''),
         ('Credit notes', 'Issue drafts, Export', 'Void', '', ''),
         ('Customers', 'Print statements, Send statements, Reassign the rep, Export', '', '', 'Archive: manager'),
         ('Bills', 'Record drafts, Export; Approve, Pay (one payment per supplier): limit', 'Void', 'buying rights', ''),
         ('Payments made', 'Export; Approve, Pay: limit', 'Void', '', ''),
         ('Purchase orders', 'Send, Cancel, Export; Approve: limit', '', '', ''),
         ('Requisitions', 'Export; Approve, Reject, Disburse: limit, never one’s own', '', '', ''),
         ('Claims and vouchers', 'Export; Approve, Reimburse: limit, never one’s own', '', '', ''),
         ('To match (bank)', 'Accept, Exclude', '', '', ''),
         ('Journals', 'Post drafts, Reverse, Export: accountant, manager, owner', '', '', ''),
         ('Needs posting', 'Retry: owner, accountant', '', '', ''),
         ('Any list', '', '', '', 'Delete permanently (test data): owner'))
    body_ = [['<b>%s</b>' % a, b, '<span class="bf-mark g">Owner or granted</span>' if c else NONE, d or NONE, e or NONE] for a, b, c, d, e in L]
    t = boxed(ptable(('List', 'Bulk actions, with the rights for each', 'Void', 'Delete drafts', 'Owner and manager only'), body_, ('16%', '44%', '13%', '11%', '16%')))
    roles = boxed(table(('Bulk action', 'Owner', 'Manager', 'Accountant', 'Shop manager', 'Clerk or rep'), [
        ['<b>%s</b>' % a] + [mark(c) for c in cs] for a, cs in (
            ('Issue, send, delete drafts', 'YYY–O'), ('Approve, pay, disburse, reimburse', 'YLLL–'), ('Void', 'YGG––'),
            ('Reverse journals, post drafts', 'YYY––'), ('Retry in Needs posting', 'Y–Y––'), ('Delete permanently', 'Y––––'))]))
    sel = ('<div class="bf-box" style="padding:0;overflow:hidden">%s'
           '<div style="display:flex;align-items:center;gap:12px;height:48px;padding:0 16px;background:var(--color-ink);color:var(--color-surface);font-size:13px">'
           '<b style="font-weight:600;color:var(--color-surface)">14 selected</b><span style="opacity:.4">|</span><span>Allocate to oldest %s</span><span>Export %s</span><span>Void %s</span><span style="margin-left:auto">Clear %s</span></div></div>') % (
        table(('', 'Receipt', 'Customer', 'Amount'), [
            ['<span class="cb on" style="width:14px;height:14px"></span>', '<span class="ref">REC-0312</span>', 'Avondale Fresh Mart', '1,865.00'],
            ['<span class="cb on" style="width:14px;height:14px"></span>', '<span class="ref">REC-0311</span>', 'Greystone Park Primary', '2,980.00'],
            ['<span class="cb on" style="width:14px;height:14px"></span>', '<span class="ref">REC-0310</span>', 'Mrs T. Gumbo', '430.00']], numcols=(3,)),
        kbd('A', True), kbd('E', True), kbd('V', True), kbd('Esc', True))
    res = ('<div class="bf-box" style="padding:0;overflow:hidden;box-shadow:var(--shadow-ring),var(--shadow-raised)"><div style="padding:18px 20px 12px"><b style="font-size:15px;font-weight:600">Void 14 receipts</b>'
           '<p style="margin-top:8px;font-size:14px;color:var(--color-ink)"><b>11 voided</b> · 2 skipped · 1 unchanged · 0 not found</p>'
           '<p style="margin-top:6px;font-size:13px;line-height:1.55;color:var(--color-ink-2)">Each receipt was voided on its own with your reason, “Duplicate import of 13 Oct”. The 11 mirrors are posted today and their bank lines reopened.</p></div>%s'
           '<div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;box-shadow:inset 0 1px 0 var(--color-line)">%s%s</div></div>') % (
        table(('Receipt', 'Result', 'Why'), [
            ['<span class="ref">REC-0306</span>', st('Skipped', 'w'), '<span style="white-space:normal">Matched in September’s closed reconciliation</span>'],
            ['<span class="ref">REC-0310</span>', st('Skipped', 'w'), '<span style="white-space:normal">Its invoice sits in an open fiscal day</span>'],
            ['<span class="ref">REC-0299</span>', st('Unchanged', 'n'), 'Already void']]),
        btn('Retry the 2 skipped', 'run', 'btn btn-quiet'), btn('Done', None, 'btn btn-primary', '↵'))
    pattern = ('<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start">%s%s</div>') % (sel, res)
    rules_ = cards((
        ('check', 'Only what this person may do', 'The selection bar shows the actions this person may take on this list. A row they may not act on is skipped, with why.'),
        ('list', 'Row by row', 'The server does each row on its own, in its own transaction, with the same core call as a single row. Up to 500 rows.'),
        ('edit', 'One reason for all', 'A void or delete asks one reason for every row. The audit trail holds one event per row.'),
        ('activity', 'The result stays', 'Done, unchanged, skipped with why, not found. It stays on screen, with each skipped row and a link to retry.')), 4)
    api = para('New endpoints: <span class="mono">POST /api/books/core/&lt;document&gt;/bulk/&lt;action&gt;</span>, one per action, built like the CRM’s record bulk and retail’s requisition bulk routes.')
    body = (bhead('Books', 'Mass actions', 'Select rows on any Books list and act on them together, within the same rights as one row. The answer is always done, unchanged, skipped with why, or not found.')
            + bsec('One pattern', 'The duplicate import of 13 Oct: 14 receipts voided at once by Rudo, granted void and revise.', pattern + '<div style="margin-top:24px">%s</div>' % rules_ + api)
            + bsec('Which lists, which actions', 'Void is for the owner, or a manager or accountant the owner granted.', t)
            + bsec('Per role', 'The same rights as the permission matrix, applied row by row.', roles))
    return bwrite('BooksFlows8', 'Books · Mass actions', body, 2170)


if __name__ == '__main__':
    for f in (research, moodboard, books_core, books_tree, books_who, books_states1, books_states2, books_states3,
              books_flows1, books_flows2, books_flows3, books_flows4, books_flows5, books_flows6, books_flows7, books_flows8):
        print(f())
