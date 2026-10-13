"""Books extras, Branding, Build, the intake form and the People extras, in the handover kit."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'port'))
from ri_kit import *
from ri_kit import studio_bar, studio_outline, form_paper
from ri_shared import chipbtn
P = sys.argv[1]
BR, BR2, BR3 = '#cf3d1d', '#1f2937', '#f59e0b'

def books_panel(on):
    m = ck.books_panel(on)
    return m.replace('<div class="pg"><div class="pg-h">', '<div class="pg"><div class="pg-h"><!--ledger-->', 0)

def books_frame(on, top, body, aside_=''):
    pnl = ck.books_panel(on) .replace(
        '<div class="pg"><div class="pg-h">' + ck.ic('down') + '<span>Saved views</span>',
        '<div class="pg"><div class="pg-h">%s<span>Ledger</span></div>%s%s%s</div><div class="pg"><div class="pg-h">%s<span>Saved views</span>' % (
            ck.ic('down'), ck.pn('Journals', 'posting', 2, on == 'Journals'), ck.pn('Periods', 'visits', None, on == 'Periods'), ck.pn('Chart of accounts', 'list'), ck.ic('down')), 1)
    return '<div class="sh" style="position:relative">%s%s<main class="mn" style="overflow:hidden">%s<div style="flex:1 1 auto;display:flex;min-height:0"><div class="kbody">%s</div>%s</div></main></div>' % (rail_html('crm', 'books'), pnl, top, body, aside_)

def top(title, glyph, right=''):
    return '<header class="tb-m"><h1>%s%s</h1><div class="tb-r">%s%s%s%s</div></header>' % (icon(glyph, 16), title, ck.find_all(), ck.iconbtn('bell', 'Notifications'), ck.vane_btn(5), right)

def seg(opts, on, counts=None):
    return '<div class="seg" role="tablist">%s</div>' % ''.join('<button role="tab" aria-selected="%s">%s%s</button>' % ('true' if o == on else 'false', o, ' <span class="n">%s</span>' % counts[i] if counts and counts[i] else '') for i, o in enumerate(opts))

def tools(*parts, right=''):
    return '<div class="ws-tools">%s<div class="end">%s</div></div>' % (''.join(parts), right)

def find(label):
    return '<label class="input-wrap ws-find">%s<input type="search" aria-label="%s" placeholder="%s"></label>' % (ck.ic('search'), label, label)

def write(name, title, html, w=1440, h=900):
    save(P, name + '.dc.html', doc(title, html, {}, w, h))

def sideh(code, pill, x=True):
    return '<div style="display:flex;align-items:center;gap:8px;height:56px;padding:0 12px 0 24px;box-shadow:inset 0 -1px 0 var(--color-line);flex:none"><span class="mono" style="font-weight:600;color:var(--color-ink)">%s</span>%s<span style="flex:1"></span>%s</div>' % (code, pill, ck.iconbtn('x', 'Close') if x else '')

# ---------------- Books · Journals ----------------
def journals():
    JR = [('JE-0421', '9 Oct', 'Tender sales, 9 Oct', 'Retail sale', '$1,412.50', 'Posted'), ('JE-0420', '8 Oct', 'INV-0142, Pomona Offices', 'Sales invoice', '$1,994.22', 'Posted'),
          ('JE-0418', '5 Oct', 'Bill, Halsted Builders', 'Purchase bill', '$312.40', 'Posted'), ('JE-0417', '2 Oct', 'Receipt, Greystone Park Primary', 'Sales receipt', '$2,980.00', 'Posted'),
          ('JE-0419', '30 Sep', 'Month-end payroll accrual', 'Manual', '$980.00', 'Draft'), ('JE-0416', '30 Sep', 'Van fuel, September', 'Manual', '$160.00', 'Draft'),
          ('JE-0415', '29 Sep', 'INV-0136, Dr N. Sibanda', 'Sales invoice', '$1,130.00', 'Posted'), ('JE-0409', '22 Sep', 'Adhesive, to the wrong expense', 'Manual', '$240.00', 'Reversed'),
          ('JE-0414', '28 Sep', 'Reversal of JE-0409', 'Manual', '$240.00', 'Posted')]
    tone = {'Posted': 'ok', 'Draft': 'warn', 'Reversed': 'neutral'}
    rows = [{'cells': [(r, 'code'), (d, 'muted'), (m, 'lead'), (s, 'muted'), a, (st, 'chip', tone[st])], 'sel': r == 'JE-0419'} for r, d, m, s, a, st in JR]
    tbl = table([('Ref', '100px', 'l'), ('Date', '80px', 'l'), ('Memo', 'auto', 'l'), ('Source', '130px', 'l'), ('Amount', '120px', 'r'), ('Status', '110px', 'l')], rows,
                totals=['9 of 421', '', '', 'In draft', '$1,140.00', ''])
    body = tools(find('Search journals'), seg(['All', 'Draft', 'Posted', 'Reversed', 'Voided'], 'All', ['421', '2', '', '', '']), right=btn('Export', 'download')) + \
        finding('2 journals are still in draft.', 'Both are dated September, so September cannot close until they post.') + tbl + pager('1–9 of 421 · Rows 50', '')
    lines = table([('Code', '64px', 'l'), ('Account', 'auto', 'l'), ('Debit', '90px', 'r'), ('Credit', '90px', 'r')],
                  [[('6110', 'code'), 'Wages and salaries', '980.00', ''], [('2310', 'code'), 'Wages owed', '', '980.00']], totals=['', 'Totals', '980.00', '980.00'])
    side = ('<aside class="kaside" style="width:400px;padding:0;gap:0">%s<div style="padding:20px 24px;display:flex;flex-direction:column;gap:4px"><b style="font-size:16px;color:var(--color-ink)">Month-end payroll accrual</b>'
            '<span class="muted">30 Sep 2026 · FY2026 · September · Manual</span></div>%s<p class="muted" style="padding:16px 24px">September is open, so this can post without a reason.</p><span style="flex:1"></span>'
            '<div class="drawer-f">%s%s</div></aside>') % (sideh('JE-0419', chip('Draft', 'warn')), lines, btn('Edit', 'pencil'), primary('Post this journal', 'check', 'Ctrl ↵'))
    write('PageBooksJournals', 'Books · Journals · /books/journals', books_frame('Journals', top('Journals', 'fileCheck', primary('New journal', 'plus', 'N')), body, side))

def vat():
    rows = [{'cells': [('September 2026', 'lead'), ('General', 'muted'), '$3,307.70', '$2,080.50', ('$1,227.20', 'strong'), ('Reviewed', 'chip', 'info')], 'sel': True},
            [('August 2026', 'lead'), ('General', 'muted'), '$2,964.10', '$1,802.35', ('$1,161.75', 'strong'), ('Filed', 'chip', 'ok')],
            [('July 2026', 'lead'), ('General', 'muted'), '$3,118.40', '$2,265.90', ('$852.50', 'strong'), ('Filed', 'chip', 'ok')],
            [('June 2026', 'lead'), ('General', 'muted'), '$2,740.25', '$1,930.80', ('$809.45', 'strong'), ('Filed', 'chip', 'ok')]]
    t1 = table([('Period', 'auto', 'l'), ('Category', '120px', 'l'), ('Output VAT', '130px', 'r'), ('Input VAT', '130px', 'r'), ('Net', '130px', 'r'), ('Status', '120px', 'l')], rows)
    t2 = table([('Box', 'auto', 'l'), ('Rate', '80px', 'r'), ('Value', '140px', 'r'), ('VAT', '140px', 'r')],
               [['Output VAT on standard-rated sales', '15.5%', '$21,340.00', '$3,307.70'], ['Output VAT on zero-rated sales', '0%', '$1,200.00', '$0.00'], ['Input VAT on purchases', '15.5%', '$13,422.58', '$2,080.50']],
               totals=['Net VAT due to ZIMRA, by 25 October', '', '', '$1,227.20'])
    body = finding("September’s return is reviewed, not finalised.", '<span class="num">$1,227.20</span> is due to ZIMRA by 25 October.') + t1 + band('September 2026, VAT-7', '') + \
        '<p class="muted" style="padding:0 24px 12px">General · reviewed by James, 9 Oct</p>' + t2 + \
        '<div style="display:flex;align-items:center;gap:8px;padding:16px 24px"><span class="muted" style="flex:1">Finalising locks the figures. Mark it filed once ZIMRA has it.</span>%s%s%s</div>' % (btn('Refresh', 'spinner'), btn('VAT-7 CSV', 'download'), primary('Finalise', 'lock', 'Ctrl ↵'))
    write('PageBooksVat', 'Books · VAT returns · /books/vat', books_frame('VAT', top('VAT returns', 'coins', btn('Prepare a return', 'plus')), body))

def close():
    checks = [('All journals posted', '2 still in draft, $1,140.00', 'todo', 'warn', 'Journals'), ('VAT return prepared', 'Reviewed, 9 Oct', 'done', '', ''),
              ('Receipts fiscalised', '1 queued, INV-0141', 'todo', 'warn', 'Retry'), ('Trial balance agrees', '$72,525.95 each side', 'done', '', ''),
              ('Every posting reached the ledger', '3 Tender sales failed to post', 'todo', 'bad', 'Replay')]
    ck_rows = ''.join('<div class="row" style="display:grid;grid-template-columns:24px minmax(0,1fr) minmax(0,1fr) 110px;gap:12px;align-items:center;min-height:48px"><span style="color:%s">%s</span><span class="lead">%s</span><span style="color:%s">%s</span><span style="text-align:right">%s</span></div>' % (
        'var(--color-success)' if st == 'done' else ('var(--color-danger)' if t == 'bad' else 'var(--color-warning)'), ck.ic('step-' + st), l, 'var(--color-danger)' if t == 'bad' else ('var(--color-warning)' if t else 'var(--color-muted)'), n, btn(a) if a else '') for l, n, st, t, a in checks)
    per = table([('Period', 'auto', 'l'), ('Opens', '130px', 'l'), ('Closes', '130px', 'l'), ('Status', '120px', 'l')],
                [[('FY2026 · October', 'lead'), ('1 Oct 2026', 'muted'), ('31 Oct 2026', 'muted'), ('Open', 'chip', 'ok')], [('FY2026 · September', 'lead'), ('1 Sep 2026', 'muted'), ('30 Sep 2026', 'muted'), ('Open', 'chip', 'ok')],
                 [('FY2026 · August', 'lead'), ('1 Aug 2026', 'muted'), ('31 Aug 2026', 'muted'), ('Closed', 'chip')], [('FY2026 · July', 'lead'), ('1 Jul 2026', 'muted'), ('31 Jul 2026', 'muted'), ('Closed', 'chip')]])
    body = finding("September can’t close yet.", '3 of the 5 checks are still open. October is open and taking postings.') + band('Before September can close', '2 of 5') + '<div class="list">%s</div>' % ck_rows + \
        '<div style="display:flex;align-items:center;gap:8px;padding:16px 24px"><span class="muted" style="flex:1">Closing sweeps income and expenses into retained earnings. Reopening needs a reason.</span><button class="btn btn-primary" disabled>%sClose September%s</button></div>' % (icon('lock', 16), ck.kbd('Ctrl ↵', True)) + \
        band('Periods', '') + per
    side = '<aside class="kaside" style="width:320px"><b style="color:var(--color-ink)">Closing controls</b>%s%s%s<span>%s</span></aside>' % (
        field_('Retained earnings account', '<span class="mono muted">3200</span> Retained earnings', True), field_('Freeze postings before', '<span class="mono">1 Sep 2026</span>'), field_('Before the freeze', 'Managers may post, with a reason', True), btn('Save controls'))
    write('PageBooksClose', 'Books · Periods and the close · /books/periods', books_frame('Periods', top('Periods', 'calendar', btn('Open a period', 'plus')), body, side))

def field_(l, v, menu=False):
    return '<label class="field" style="display:flex;flex-direction:column;gap:6px"><span style="font-weight:500;color:var(--color-ink)">%s</span><span class="selbox"><span>%s</span>%s</span></label>' % (l, v, icon('chevronDown', 12) if menu else '')

# ---------------- Branding (in Management) ----------------
def preview(kind):
    sign = kind == 'assets'; foot = kind == 'finance'
    return ('<aside class="kaside" style="width:440px;background:var(--color-ground)"><span style="display:flex;justify-content:space-between;font-size:13px;color:var(--color-muted)"><span>Preview, a quotation</span><span>Updates as you type</span></span>'
            '<div class="card" style="padding:26px;display:flex;flex-direction:column;gap:16px;font-size:11px;color:%(b2)s">'
            '<div style="display:flex;justify-content:space-between"><span style="display:flex;align-items:center;gap:8px"><span style="width:26px;height:26px;border-radius:6px;background:%(b)s;color:#fff;display:grid;place-items:center;font-weight:700">F</span><span style="display:flex;flex-direction:column"><b style="font-size:14px">Floorcode</b><span class="muted">12 Coventry Road, Workington, Harare</span></span></span><span style="text-align:right"><b style="font-size:15px;color:%(b)s">Quotation</b><br><span class="mono">QUO-0319</span></span></div>'
            '<div style="height:3px;background:%(b)s"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><span><span class="muted">For</span><br>Mrs Chari, 14 Fife Avenue</span><span><span class="muted">Date</span><br>11 Oct 2026, valid 14 days</span></div>'
            '<div><div style="display:grid;grid-template-columns:1fr 60px 70px;padding:5px 0;box-shadow:inset 0 -1px 0 %(b2)s;font-weight:600"><span>Item</span><span style="text-align:right">Qty</span><span style="text-align:right">Amount</span></div>'
            '<div style="display:grid;grid-template-columns:1fr 60px 70px;padding:5px 0;box-shadow:inset 0 -1px 0 var(--color-line)"><span>Laminate planks, oak</span><span style="text-align:right">14 packs</span><span class="mono" style="text-align:right">532.00</span></div>'
            '<div style="display:grid;grid-template-columns:1fr 60px 70px;padding:5px 0;box-shadow:inset 0 -1px 0 var(--color-line)"><span>Fitting</span><span style="text-align:right">27.92 m²</span><span class="mono" style="text-align:right">167.52</span></div>'
            '<div style="display:flex;justify-content:flex-end;gap:18px;padding-top:8px;font-weight:600"><span>Total</span><span class="mono" style="color:%(b)s">$1,041.26</span></div></div>'
            '%(sign)s%(foot)s<div class="muted" style="padding-top:6px;box-shadow:inset 0 1px 0 var(--color-line)">VAT 220093114 · TIN 2000441093 · floorcode.co.zw</div></div></aside>') % {
        'b': BR, 'b2': BR2,
        'sign': '<div style="display:flex;justify-content:space-between;align-items:flex-end"><span style="font-family:\'Brush Script MT\',cursive;font-size:20px">J. Nyabadza</span><span style="width:54px;height:54px;border-radius:99px;border:2px solid %s;color:%s;display:grid;place-items:center;font:700 8px/1.1 var(--font-sans);text-align:center;transform:rotate(-12deg)">FLOORCODE<br>PAID</span></div>' % (BR, BR) if sign else '',
        'foot': '<div class="muted" style="display:flex;flex-direction:column;gap:3px"><span><b style="color:%s">Pay to</b> CBZ Kwame Nkrumah, 6101 · Floorcode (Pvt) Ltd · 01124558830017</span><span>EcoCash merchant 160442 · Payment within 14 days</span><span>Thank you for choosing Floorcode.</span></div>' % BR2 if foot else ''}

def brow(l, v, hint='', swatch=None, upload=None, upfg=None, upbg=None, select=False, status=None, mono=False):
    left = '<span style="display:flex;flex-direction:column;gap:2px"><b style="font-weight:500;color:var(--color-ink)">%s</b>%s</span>' % (l, '<span class="muted" style="font-size:12px">%s</span>' % hint if hint else '')
    r = ''
    if swatch: r += '<span style="width:34px;height:34px;flex:none;border-radius:8px;background:%s;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)"></span>' % swatch
    if upload: r += '<span style="width:120px;height:40px;flex:none;border-radius:8px;box-shadow:inset 0 0 0 1px var(--color-rule);display:grid;place-items:center;font-weight:700;color:%s;background:%s">%s</span>' % (upfg or BR, upbg or '#fff', upload)
    r += '<span class="selbox" style="flex:1;min-width:0%s"><span class="truncate">%s</span>%s</span>' % (';font-family:var(--font-mono)' if mono else '', v, icon('chevronDown', 12) if select else '')
    if status: r += '<span class="ok-dot">%s</span>' % status
    return '<div class="srow" style="grid-template-columns:200px minmax(0,1fr);min-height:56px">%s<span style="display:flex;align-items:center;gap:8px;min-width:0">%s</span></div>' % (left, r)

def brand(name, tab, fact, rest, sections, kind):
    tabs_ = '<div class="ws-tools">%s</div>' % seg(['Identity and theme', 'Assets and contact', 'Finance and defaults'], tab)
    secs = ''.join('<div class="lset" style="grid-template-columns:220px minmax(0,1fr);gap:32px;padding:24px 0"><div><h2>%s</h2><p class="aside">%s</p></div><div>%s</div></div>' % (h, p, ''.join(brow(*r[:2], **(r[2] if len(r) > 2 else {})) for r in rows)) for h, p, rows in sections)
    body = tabs_ + finding(fact, rest) + '<div style="padding:0 24px 32px;max-width:860px">%s</div>' % secs
    main = '<header class="tb-m"><h1>%sBranding</h1><div class="tb-r">%s</div></header><div style="flex:1;display:flex;min-height:0"><div class="kbody">%s</div>%s</div>' % (icon('flag', 16), primary('Save', 'check', 'Ctrl S'), body, preview(kind))
    write(name, 'Management · Branding · ' + tab, '<div class="mg">%s<main class="mn" style="overflow:hidden">%s</main></div>' % (ck.mg_side('Branding'), main))

def branding():
    brand('PageBrandIdentity', 'Identity and theme', 'Floorcode looks like Floorcode everywhere it sends.', 'Quotes, invoices, payslips, emails and the customer portal take these colours and names.', [
        ('Name and colours', 'Shown on documents, emails and the portal.', [('Display name', 'Floorcode'), ('Primary', BR, {'hint': 'Headings and totals', 'swatch': BR, 'mono': True}),
         ('Secondary', BR2, {'hint': 'Body text on documents', 'swatch': BR2, 'mono': True}), ('Accent', BR3, {'hint': 'Highlights and charts', 'swatch': BR3, 'mono': True}),
         ('Font', 'Inter', {'select': True}), ('Custom domain', 'work.floorcode.co.zw', {'hint': 'Where people sign in', 'status': 'Verified'})]),
        ('Legal details', 'Printed in the footer of every document.', [('Legal name', 'Floorcode (Private) Limited'), ('Trading name', 'Floorcode'),
         ('Registration number', '1842/2019', {'mono': True}), ('Tax number', '2000441093', {'mono': True}), ('VAT number', '220093114', {'mono': True})])], 'identity')
    brand('PageBrandAssets', 'Assets and contact', 'The logo, signature and stamp are on file.', 'They are added to quotes and invoices, and the signature to payslips.', [
        ('Images', 'PNG or SVG. A wide logo prints best.', [('Logo', 'floorcode-logo.svg, 240 × 64', {'upload': 'Floorcode'}), ('Secondary logo', 'floorcode-mark.svg, 64 × 64', {'hint': 'For small spaces', 'upload': 'F', 'upfg': '#fff', 'upbg': BR}),
         ('Signature', 'james-signature.png', {'hint': 'James Nyabadza', 'upload': 'J. N.', 'upfg': BR2}), ('Stamp', 'paid-stamp.png', {'upload': 'PAID'})]),
        ('Contact', 'How customers and staff reach Floorcode.', [('Email', 'accounts@floorcode.co.zw'), ('Phone', '077 220 4180', {'mono': True}), ('Website', 'floorcode.co.zw'),
         ('Physical address', '12 Coventry Road, Workington, Harare'), ('Postal address', 'P.O. Box CY 2210, Causeway')])], 'assets')
    brand('PageBrandFinance', 'Finance and defaults', 'Customers are told to pay CBZ or EcoCash.', 'Every quote and invoice prints the same bank details, terms and footer.', [
        ('Bank details', 'Printed under the totals.', [('Bank', 'CBZ Bank'), ('Branch and code', 'Kwame Nkrumah, 6101'), ('Account name', 'Floorcode (Pvt) Ltd'),
         ('Account number', '01124558830017', {'mono': True}), ('SWIFT', 'COBZZWHA', {'mono': True}), ('Other ways to pay', 'CBZ ZWG account · EcoCash merchant 160442', {'select': True})]),
        ('Document defaults', 'Used unless a template says otherwise.', [('Payment terms', '14 days', {'select': True}), ('Footer line', 'Thank you for choosing Floorcode.')]),
        ('Formats', 'How dates, times and money are written.', [('Date', '11 Oct 2026', {'select': True}), ('Time', '24-hour, 14:05', {'select': True}), ('Numbers', '1,234.56', {'select': True, 'mono': True}),
         ('Money', '$1,234.56', {'select': True, 'mono': True}), ('Language', 'English, Zimbabwe', {'select': True})])], 'finance')
    cards = [('Quotation', 'Quotation', 'Document template, used by CRM', [('Laminate planks, oak', '532.00'), ('Underlay', '48.00'), ('Fitting, 27.92 m²', '167.52')], 'Total', '$1,041.26', 'Pay to CBZ 01124558830017 · valid 14 days'),
             ('Tax invoice', 'Tax invoice, fiscalised', 'Document template, used by Books', [('INV-0142, Pomona Offices', ''), ('Vinyl, 3 rooms', '1,725.00'), ('VAT 15.5%', '267.38')], 'Total', '$1,994.22', 'Fiscal day 214 · receipt 8812 · VAT 220093114'),
             ('Payslip', 'Payslip', 'Document template, used by Payroll', [('Basic pay', '780.00'), ('NSSA', '−31.50'), ('PAYE and AIDS levy', '−156.69')], 'Net pay', '$591.81', 'Signed J. Nyabadza · paid to CBZ on 23 Oct'),
             ('Email', 'Invoice email', 'Email template, used by Books', [('Subject', 'INV-0142'), ('Amount due', '1,494.22'), ('Attached', 'PDF')], 'Pay with Paynow', 'Pay now', 'From accounts@floorcode.co.zw · Thank you for choosing Floorcode.')]
    figs = ''.join(('<figure style="margin:0;display:flex;flex-direction:column;gap:10px"><div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px;min-height:380px;font-size:11.5px">'
                    '<span style="display:flex;align-items:center;gap:8px"><span style="width:22px;height:22px;border-radius:5px;background:%s;color:#fff;display:grid;place-items:center;font-weight:700">F</span><b style="font-size:13px;color:%s">Floorcode</b><span style="flex:1"></span><b style="color:%s">%s</b></span><span style="height:3px;background:%s"></span>%s'
                    '<span style="display:flex;justify-content:space-between;font-weight:600;color:%s"><span>%s</span><span class="mono" style="color:%s">%s</span></span><span style="flex:1"></span><span class="muted" style="padding-top:6px;box-shadow:inset 0 1px 0 var(--color-line)">%s</span></div>'
                    '<figcaption><b style="display:block;font-weight:600;color:var(--color-ink)">%s</b><span class="muted">%s</span></figcaption></figure>') % (
        BR, BR2, BR, d, BR, ''.join('<span style="display:flex;justify-content:space-between;padding:4px 0;box-shadow:inset 0 -1px 0 var(--color-line);color:%s"><span>%s</span><span class="mono">%s</span></span>' % (BR2, a, b) for a, b in lines), BR2, tl, BR, t, foot, n, frm)
        for d, n, frm, lines, tl, t, foot in cards)
    body = '<div class="xp" style="padding:48px 56px"><div class="xp-k">%s<span>Branding</span></div><h1>One brand, set once, on everything Floorcode sends.</h1><p class="lede">Each of these is a template in Build. Branding fills the letterhead, colours, bank details and footer; the template decides the rest.</p><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:32px">%s</div></div>' % (icon('flag', 16), figs)
    write('PageBrandWhere', 'Branding · Where it shows', body)

# ---------------- Build ----------------
def build_frame(on, top_, body):
    return frame('crm', 'build', on, top_, body, railCur='build')

def build_home():
    ITEMS = [('Floor site visit', 'Form', 'Site visits', 'v7', ('Published', 'ok'), True, '9 Oct'), ('Showroom enquiry', 'Form', 'Enquiries', 'v2', ('Draft', 'warn'), False, 'Today'),
             ('Quotation', 'Document', 'Quotes', 'v4', ('Published', 'ok'), True, '2 Oct'), ('Tax invoice', 'Document', 'Invoices, fiscalised', 'v3', ('Published', 'ok'), True, '28 Sep'),
             ('Receipt', 'Document', 'Receipts', 'v2', ('Published', 'ok'), True, '28 Sep'), ('Payslip', 'Document', 'Pay runs', 'v1', ('Published', 'ok'), True, '1 Oct'),
             ('Job sheet with a floor plan', 'Document', 'Site visits', 'v1', ('Draft', 'warn'), False, '6 Oct'), ('Invoice email', 'Email', 'Invoices', 'v2', ('Published', 'ok'), True, '28 Sep'),
             ('Quote, by WhatsApp', 'Email', 'Quotes', 'v3', ('Published', 'ok'), True, '2 Oct'), ('Old quotation, 2025', 'Document', 'Nothing', 'v6', ('Retired', 'neutral'), False, '3 Jan')]
    rows = [{'cells': [(n, 'lead'), (k, 'muted'), u, ('Default', 'chip', 'info') if d else ('—', 'faint'), (v, 'code'), (s[0], 'chip', s[1]), (w, 'muted')], 'sel': n == 'Quotation'} for n, k, u, v, s, d, w in ITEMS]
    body = tools(find('Search Build'), chipbtn('grid4', 'Any kind'), chipbtn('link', 'Used by anything'), seg(['All', 'Published', 'Drafts', 'Retired'], 'All', ['17', '13', '2', '2'])) + \
        finding('17 forms, documents and emails are in use.', 'Every one opens in the same builder, and each started from a template.') + \
        table([('Name', 'auto', 'l'), ('Kind', '110px', 'l'), ('Used by', '170px', 'l'), ('Default', '100px', 'l'), ('Version', '80px', 'l'), ('Status', '120px', 'l'), ('Changed', '90px', 'l')], rows) + pager('1–10 of 17 · Rows 50')
    write('PageBuildHome', 'Build · Everything · /build', build_frame('Everything', topbar('Build', 'clipboard').replace('[[ACTIONS]]', btn('From a template', 'copy') + primary('New', 'plus', 'N')), body))

def build_templates():
    def g(h, note, rows):
        return [('__group__', '%s <span class="muted" style="font-weight:400">%s</span>' % (h, note), str(len(rows)))] + [[('%s<span class="cell-lead" style="margin-left:8px">%s</span>' % (icon(gl, 16, 'var(--color-muted)'), n), 'html'), s, (u, 'muted'), (b, 'chip', {'Built in': 'neutral', 'Default': 'info'}[b]), (btn('Use this template', 'copy'), 'html')] for n, s, u, gl, b in rows]
    rows = g('Forms', 'Intake and site forms', [('Showroom enquiry', 'Who, the job and how they found you; makes a customer and a deal', 'CRM', 'clipboard', 'Built in'), ('Floor site visit', 'Rooms, subfloor and finishes; drafts the quote', 'CRM', 'clipboard', 'Default'), ('Carpet measure', 'Drafts a carpet quote by the roll width', 'CRM', 'ruler', 'Built in')]) + \
        g('Documents', 'Printed and sent as PDF, with your branding', [('Quotation', 'Lines, totals, measured on site and a signature', 'CRM', 'file', 'Default'), ('Tax invoice', 'Fiscal receipt number, VAT and bank details', 'Books', 'file', 'Default'), ('Receipt', 'What was paid and how', 'Books', 'file', 'Built in'), ('Payslip', 'Earnings, deductions and leave left', 'Payroll', 'file', 'Default'), ('Statement', 'A customer’s invoices and payments over a period', 'Books', 'list', 'Built in')]) + \
        g('Emails and messages', 'Sent by email or WhatsApp', [('Invoice email', 'Amount due, the PDF and a Paynow link', 'Books', 'send', 'Default'), ('Quote, by WhatsApp', 'A short message with the quotation attached', 'CRM', 'whatsapp', 'Built in'), ('Payslip ready', 'Tells each person their payslip is ready', 'Payroll', 'send', 'Built in')])
    body = tools(find('Search templates'), chipbtn('grid4', 'Any kind'), seg(['From Corelith', 'Made here', 'Retired'], 'From Corelith', ['24', '6', '2'])) + \
        finding('Templates moved here from Management.', 'A template is a starting point. Using one makes your own copy, which opens in the same builder as everything else.') + \
        table([('Template', '260px', 'l'), ('What it does', 'auto', 'l'), ('For', '100px', 'l'), ('', '110px', 'l'), ('', '190px', 'l')], rows) + pager('11 of 24 · Rows 50')
    write('PageBuildTemplates', 'Build · Templates · /build/templates', build_frame('From Corelith', topbar('Templates', 'copy').replace('[[ACTIONS]]', primary('New', 'plus', 'N')), body))

def inspector(tabs_, title, items):
    t = ''.join('<button class="tab" role="tab" aria-selected="%s">%s%s</button>' % ('true' if x.get('on') else 'false', x['label'], ' <span class="mono muted">%s</span>' % x['count'] if x.get('count') else '') for x in tabs_)
    body = '<h2 class="text-heading">%s</h2>' % title
    for i in items:
        k = i['kind']
        if k == 'field':
            body += field_(i['head'], i['value'], i.get('select'))
        elif k == 'switch':
            body += '<div style="display:flex;align-items:center;gap:12px"><span style="flex:1;display:flex;flex-direction:column;gap:2px"><b style="font-weight:500;color:var(--color-ink)">%s</b><span class="muted" style="font-size:13px">%s</span></span><span class="%s"></span></div>' % (i['t'], i['s'], 'swon' if i.get('on') else 'swoff')
        else:
            rows = ''.join('<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;min-height:36px;box-shadow:inset 0 -1px 0 var(--color-line);font-size:13px"><span class="%s" style="color:var(--color-ink)">%s</span><span class="muted">%s</span></div>' % ('check' if k == 'checks' else '', ('<input type="checkbox" checked aria-label="%s">' % r['l'] if k == 'checks' else '') + r['l'], r.get('r', '')) for r in i['rows'])
            body += '<div style="display:flex;flex-direction:column;gap:8px"><b style="font-weight:500;color:var(--color-ink)">%s</b><div>%s</div>%s</div>' % (i.get('head', ''), rows, '<button class="btn btn-quiet" style="align-self:flex-start">%s%s</button>' % (icon('plus', 16), i['add']) if i.get('add') else '')
    return '<aside class="st-ins" aria-label="Inspector"><div class="tabs st-tabs" role="tablist">%s</div><div class="st-panel">%s</div></aside>' % (t, body)

def studio(name, title, bar, outline, canvas, tabs_, ititle, items):
    attrs = ' '.join('%s="%s"' % kv_ for kv_ in bar.items())
    html = '<div class="st">%s%s<main class="st-can">%s</main>%s</div>' % (studio_bar(attrs), studio_outline('groups="{{outline}}" addLabel="Add"', {'outline': outline}), canvas, inspector(tabs_, ititle, items))
    write(name, title, html)

def hl(x):
    return '<span style="padding:0 3px;border-radius:4px;background:var(--color-accent-tint)">%s</span>' % x

def templates():
    slip = ('<div style="flex:1;display:flex;justify-content:center;padding:32px 32px 0"><div class="card" style="width:600px;min-height:780px;padding:40px 46px;display:flex;flex-direction:column;gap:20px;font-size:12.5px;color:%(b2)s">'
            '<div style="display:flex;justify-content:space-between"><span style="display:flex;align-items:center;gap:10px"><span style="width:30px;height:30px;border-radius:7px;background:%(b)s;color:#fff;display:grid;place-items:center;font-weight:700">F</span><span style="display:flex;flex-direction:column"><b style="font-size:15px">Floorcode</b><span class="muted">From Branding · 12 Coventry Road, Harare</span></span></span><span style="text-align:right"><b style="font-size:18px;color:%(b)s">Payslip</b><br>%(oct)s</span></div>'
            '<div style="height:3px;background:%(b)s"></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">%(who)s</div>'
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px"><div><b style="display:block;padding-bottom:6px;box-shadow:inset 0 -1px 0 %(b2)s">Earnings</b><span style="display:flex;justify-content:space-between;padding:6px 0"><span>Basic pay</span><span class="mono">780.00</span></span><span style="display:flex;justify-content:space-between;padding:6px 0;font-weight:600"><span>Gross</span><span class="mono">780.00</span></span></div>'
            '<div class="sel" style="padding:4px 10px"><span class="sel-tag">%(tic)sDeductions</span><b style="display:block;padding:2px 0 6px;box-shadow:inset 0 -1px 0 %(b2)s">Deductions</b>%(ded)s<span style="display:flex;justify-content:space-between;padding:6px 0;font-weight:600"><span>Total</span><span class="mono">188.19</span></span></div></div>'
            '<div style="display:flex;justify-content:space-between;padding:12px 14px;background:var(--color-ground);font-size:15px;font-weight:600"><span>Net pay, to CBZ ····0017</span><span class="mono" style="color:%(b)s">$591.81</span></div>'
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px"><span><span class="muted">Annual leave left</span><br>11 of 22 days</span><span><span class="muted">Employer paid</span><br>NSSA $31.50 · ZIMDEF $7.80</span></div><span style="flex:1"></span>'
            '<div class="muted" style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:10px;box-shadow:inset 0 1px 0 var(--color-line)"><span>Floorcode (Private) Limited · TIN 2000441093</span><span style="font-family:\'Brush Script MT\',cursive;font-size:20px;color:%(b2)s">J. Nyabadza</span></div></div></div>') % {
        'b': BR, 'b2': BR2, 'oct': hl('October 2026'), 'tic': icon('table', 12),
        'who': ''.join('<span style="display:flex;flex-direction:column;gap:2px"><span class="muted">%s</span><span>%s</span></span>' % (k, hl(v)) for k, v in (('Employee', 'Tinashe Moyo'), ('ID', 'EMP-0005'), ('Position', 'Fitter, Fitting'), ('NSSA number', 'On file'), ('BP number', 'On file'), ('Paid', '23 October 2026'))),
        'ded': ''.join('<span style="display:flex;justify-content:space-between;padding:6px 0;box-shadow:inset 0 -1px 0 var(--color-line)"><span>%s</span><span class="mono">%s</span></span>' % r for r in (('NSSA, 4.5%', '31.50'), ('PAYE', '152.13'), ('AIDS levy', '4.56')))}
    studio('PageTemplatePayslip', 'Build · Payslip template, in the same builder',
           {'name': 'Payslip', 'sub': 'Document template, the default for pay runs', 'markGlyph': 'receipt', 'markBg': '#ea580c', 'saved': 'Showing Tinashe Moyo, October'},
           [{'head': 'Page', 'items': [{'label': 'Letterhead', 'glyph': 'building'}, {'label': 'Employee and period', 'glyph': 'user'}, {'label': 'Earnings', 'glyph': 'table'}, {'label': 'Deductions', 'glyph': 'table', 'on': True}, {'label': 'Net pay', 'glyph': 'hash'}, {'label': 'Leave left', 'glyph': 'sun'}, {'label': 'Employer paid', 'glyph': 'shield', 'sub': True}, {'label': 'Footer and signature', 'glyph': 'pencil'}]}],
           slip, [{'label': 'Element', 'on': True}, {'label': 'Data', 'count': '18'}, {'label': 'Settings'}], 'Deductions',
           [{'kind': 'field', 'head': 'Rows from', 'value': 'The run line’s deductions', 'select': True},
            {'kind': 'checks', 'head': 'Show', 'rows': [{'l': 'Statutory deductions', 'r': 'PAYE, AIDS levy, NSSA'}, {'l': 'Other deductions', 'r': 'from compensation rules'}, {'l': 'Disciplinary penalties', 'r': 'when applied'}], 'add': 'Add a row'},
            {'kind': 'switch', 't': 'Hide rows that are zero', 's': 'Keeps short payslips short', 'on': True},
            {'kind': 'rows', 'head': 'From Branding', 'rows': [{'l': 'Letterhead and colours', 'r': 'Identity and theme'}, {'l': 'Signature', 'r': 'Assets and contact'}]}])
    email = ('<div style="flex:1;display:flex;justify-content:center;padding:32px"><div style="width:600px;display:flex;flex-direction:column;gap:12px">'
             '<div class="card" style="display:flex;flex-direction:column;gap:6px"><span style="display:flex;gap:10px"><span class="muted" style="width:64px">From</span><span>Floorcode &lt;accounts@floorcode.co.zw&gt;</span></span><span style="display:flex;gap:10px"><span class="muted" style="width:64px">To</span>%(to)s</span>'
             '<span class="sel" style="display:flex;gap:10px;padding:6px 8px;margin:24px -8px 0"><span class="sel-tag">%(tic)sSubject</span><span class="muted" style="width:56px">Subject</span><b style="font-weight:600;color:var(--color-ink)">Invoice %(num)s from Floorcode</b></span></div>'
             '<div class="card" style="padding:28px 32px;display:flex;flex-direction:column;gap:16px;font-size:14px;color:%(b2)s"><span style="display:flex;align-items:center;gap:8px"><span style="width:26px;height:26px;border-radius:6px;background:%(b)s;color:#fff;display:grid;place-items:center;font-weight:700">F</span><b style="font-size:15px">Floorcode</b></span>'
             '<span>Hello %(cust)s,</span><span>Your invoice for the vinyl in three rooms is attached. %(amt)s is still to pay, by %(due)s.</span><span><a href="#" style="display:inline-flex;align-items:center;height:40px;padding:0 18px;border-radius:8px;background:%(b)s;color:#fff;font-weight:600;text-decoration:none">Pay with EcoCash or card</a></span>'
             '<span style="display:inline-flex;align-self:flex-start;align-items:center;gap:8px;height:36px;padding:0 12px;border-radius:8px;box-shadow:var(--shadow-ring);font-size:13px">%(fic)sINV-0142.pdf, the Tax invoice template</span><span>Or pay CBZ Kwame Nkrumah, account 01124558830017.</span>'
             '<span class="muted" style="padding-top:12px;box-shadow:inset 0 1px 0 var(--color-line);font-size:12.5px">Thank you for choosing Floorcode. · 077 220 4180 · floorcode.co.zw</span></div></div></div>') % {
        'b': BR, 'b2': BR2, 'to': hl('accounts@pomonaoffices.co.zw'), 'tic': icon('text', 12), 'num': hl('<span class="mono">INV-0142</span>'), 'cust': hl('Pomona Offices'), 'amt': hl('<span class="mono">$1,494.22</span>'), 'due': hl('20 October'), 'fic': icon('file', 14)}
    studio('PageTemplateEmail', 'Build · Invoice email template, in the same builder',
           {'name': 'Invoice email', 'sub': 'Email template, the default for invoices', 'markGlyph': 'send', 'markBg': '#1d4ed8', 'saved': 'Showing INV-0142'},
           [{'head': 'Message', 'items': [{'label': 'Subject', 'glyph': 'text', 'on': True}, {'label': 'Greeting', 'glyph': 'user'}, {'label': 'Amount and due date', 'glyph': 'hash'}, {'label': 'Pay button', 'glyph': 'money'}, {'label': 'The invoice PDF', 'glyph': 'file'}, {'label': 'Bank details', 'glyph': 'bank'}, {'label': 'Footer', 'glyph': 'pencil'}]}],
           email, [{'label': 'Element', 'on': True}, {'label': 'Data', 'count': '9'}, {'label': 'Settings'}], 'Subject',
           [{'kind': 'field', 'head': 'Subject', 'value': 'Invoice {number} from {display name}'}, {'kind': 'field', 'head': 'Sends by', 'value': 'Email, accounts@floorcode.co.zw', 'select': True},
            {'kind': 'switch', 't': 'Also by WhatsApp', 's': 'A short message with the PDF, from 077 220 4180', 'on': False}, {'kind': 'switch', 't': 'Add a Paynow link', 's': 'EcoCash, OneMoney, InnBucks or Zipit', 'on': True},
            {'kind': 'rows', 'head': 'Sent when', 'rows': [{'l': 'Someone presses Send', 'r': 'on an issued invoice'}]}])
    sections = [{'h': 'Who', 'qs': [{'q': 'Name', 'meta': 'Required', 'kind': 'one', 'value': 'Rumbidzai Chari'}, {'q': 'WhatsApp number', 'meta': 'Required', 'kind': 'one', 'value': '077 341 2290', 'tag': 'Phone number', 'tagGlyph': 'phone'}, {'q': 'Email', 'meta': 'If they would rather', 'kind': 'one', 'value': '', 'child': True}]},
                {'h': 'The job', 'qs': [{'q': 'Rooms', 'kind': 'checks', 'opts': [{'l': 'Lounge', 'on': True}, {'l': 'Bedrooms', 'on': True}, {'l': 'Kitchen'}, {'l': 'Passage'}, {'l': 'Office'}]}, {'q': 'Rough area', 'meta': 'A guess is fine', 'kind': 'one', 'value': '40', 'unit': 'm²', 'fig': '40 m²', 'num': True}, {'q': 'Floor wanted', 'kind': 'choice', 'opts': [{'l': 'Laminate', 'on': True}, {'l': 'Vinyl'}, {'l': 'Carpet'}, {'l': 'Tiles'}, {'l': 'Not sure'}]}]}]
    canvas = form_paper('title="Showroom enquiry"', {'sections': sections, 'foot': {'text': 'Each answer adds a customer and a deal in', 'strong': 'New enquiries', 'rest': ', and offers a site visit', 'button': 'See the pipeline', 'glyph': 'funnel'}})
    studio('PageIntakeForm', 'Build · Form · Showroom enquiry (intake)',
           {'name': 'Showroom enquiry', 'sub': 'Form, used for new enquiries', 'markGlyph': 'addressbook', 'markBg': '#2563eb', 'saved': 'On the showroom tablet, the website and WhatsApp'},
           [{'head': 'Who', 'items': [{'label': 'Name', 'glyph': 'user'}, {'label': 'WhatsApp number', 'glyph': 'phone', 'on': True}, {'label': 'Email', 'glyph': 'send', 'sub': True}]},
            {'head': 'The job', 'items': [{'label': 'Rooms', 'glyph': 'door'}, {'label': 'Rough area', 'glyph': 'ruler'}, {'label': 'Floor wanted', 'glyph': 'grid4'}, {'label': 'When', 'glyph': 'calendar'}]},
            {'head': 'How they found us', 'items': [{'label': 'Heard about us', 'glyph': 'question'}, {'label': 'Who referred them', 'glyph': 'users', 'sub': True}]}],
           canvas.replace('flex:1;display:flex;flex-direction:column;background:var(--color-ground);overflow:auto', 'flex:1;display:flex;flex-direction:column'),
           [{'label': 'Question', 'on': True}, {'label': 'Data', 'count': '7'}, {'label': 'Settings'}], 'WhatsApp number',
           [{'kind': 'field', 'head': 'Question', 'value': 'WhatsApp number'}, {'kind': 'field', 'head': 'Answered as', 'value': 'Phone number, Zimbabwe', 'select': True},
            {'kind': 'switch', 't': 'Required', 's': 'An enquiry cannot be sent without it', 'on': True}, {'kind': 'switch', 't': 'Check for an existing customer', 's': 'Adds to their record instead of a new one', 'on': True},
            {'kind': 'rows', 'head': 'Fills in', 'rows': [{'l': 'Customer', 'r': 'phone and WhatsApp'}, {'l': 'Deal', 'r': 'contact for quotes'}, {'l': 'Site visit', 'r': 'who to call on the day'}]}])

# ---------------- People extras ----------------
def incidents():
    INC = [('INC-0012', 'Van left unlocked at the Msasa Motors site', 'Simba Gondo', 'Safety policy', ('Medium', 'warn'), ('Under review', 'info'), '8 Oct'),
           ('INC-0011', 'Till 1 short $12.00 at Monday’s cash-up', 'Tendai Sibanda', 'Other', ('Low', 'neutral'), ('Open', 'warn'), '5 Oct'),
           ('INC-0009', 'Late on site three times in September', 'Blessing Zhou', 'Attendance', ('Low', 'neutral'), ('Closed', 'neutral'), '30 Sep'),
           ('INC-0007', 'Adhesive left out overnight, 2 tins spoiled', 'Kuda Chigumba', 'Performance', ('Low', 'neutral'), ('Closed', 'neutral'), '12 Sep')]
    rows = [{'cells': [(c, 'code'), (w, 'lead'), who, (cat, 'muted'), (s[0], 'chip', s[1]), (st[0], 'chip', st[1]), (d, 'muted')], 'sel': c == 'INC-0012'} for c, w, who, cat, s, st, d in INC]
    body = tools(find('Search incidents'), seg(['Incidents', 'Disciplinary actions'], 'Incidents', ['4', '3'])) + finding('2 incidents are open, both this month.', 'Simba’s written warning waits for a manager to approve it.') + \
        table([('Incident', '100px', 'l'), ('What happened', 'auto', 'l'), ('Employee', '140px', 'l'), ('Category', '120px', 'l'), ('Severity', '100px', 'l'), ('Status', '130px', 'l'), ('Date', '80px', 'l')], rows) + pager('1–4 of 4 · Rows 50')
    flow = ''.join('<div class="vd">%s<span>%s</span></div>' % (ck.ic('step-' + st), t) for t, st in (('Drafted', 'done'), ('Submitted, 9 Oct', 'done'), ('Approved by a manager', 'todo'), ('Applied to the record', 'todo')))
    side = ('<aside class="kaside" style="width:380px;padding:0;gap:0">%s<div style="padding:20px 24px;display:flex;flex-direction:column;gap:4px"><b style="font-size:16px;color:var(--color-ink)">Written warning, Simba Gondo</b><span class="muted">From INC-0012 · submitted by Chipo Mhlanga, 9 Oct</span></div>'
            '<div style="padding:0 24px">%s</div><div style="padding:16px 24px;display:flex;flex-direction:column;gap:4px">%s%s</div><span style="flex:1"></span><div class="drawer-f">%s%s</div></aside>') % (
        sideh('DA-0004', chip('Submitted', 'info')), kv([('Type', 'Warning'), ('Category', 'Safety policy'), ('Penalty', 'None'), ('Note', 'Second time the van was left open on site.')]), label('The steps'), flow, btn('Reject', 'x'), primary('Approve', 'check', 'Ctrl ↵'))
    main = '<header class="tb-m"><h1>%sIncidents</h1><div class="tb-r">%s</div></header><div style="flex:1;display:flex;min-height:0"><div class="kbody">%s</div>%s</div>' % (icon('warning', 16), primary('Record an incident', 'plus', 'N'), body, side)
    write('PageHrIncidents', 'Management · Compliance · Incidents and disciplinary actions', '<div class="mg">%s<main class="mn" style="overflow:hidden">%s</main></div>' % (ck.mg_side('Incidents'), main))

def people_page(name, title, top_, body, side=''):
    write(name, title, '<div class="sh" style="position:relative">%s%s<main class="mn" style="overflow:hidden">%s<div style="flex:1;display:flex;min-height:0"><div class="kbody">%s</div>%s</div></main></div>' % (rail_html('crm', 'people'), ck.people_panel('Payroll'), top_, body, side))

def disburse():
    bats = [{'cells': [('BAT-0031', 'code'), ('%s<span class="cell-lead" style="margin-left:8px">Bank, CBZ</span>' % icon('bank', 16, 'var(--color-muted)'), 'html'), '5', '$4,366.46', ('Approved', 'chip', 'info'), (btn('Record payouts'), 'html')], 'sel': True},
            [('BAT-0032', 'code'), ('%s<span class="cell-lead" style="margin-left:8px">Mobile money, EcoCash</span>' % icon('phone', 16, 'var(--color-muted)'), 'html'), '4', '$1,735.22', ('Submitted', 'chip', 'warn'), (btn('Approve'), 'html')],
            [('BAT-0030', 'code'), ('%s<span class="cell-lead" style="margin-left:8px">Cash, September casuals</span>' % icon('money', 16, 'var(--color-muted)'), 'html'), '2', '$384.00', ('Paid', 'chip', 'ok'), (btn('Details'), 'html')]]
    t1 = table([('Batch', '110px', 'l'), ('How it goes out', 'auto', 'l'), ('People', '80px', 'r'), ('Amount', '130px', 'r'), ('Status', '120px', 'l'), ('', '170px', 'l')], bats, totals=['', 'October run', '9', '$6,101.68', '', ''])
    pays = [('James Nyabadza', '$1,705.20', '23 Oct, 09:12', 'CBZ 88213'), ('Kuda Chigumba', '$729.91', '23 Oct, 09:12', 'CBZ 88214'), ('Rudo Mapfumo', '$718.03', '—', '—'), ('Chipo Mhlanga', '$621.51', '—', '—'), ('Tinashe Moyo', '$541.81', '—', '—')]
    t2 = table([('Employee', 'auto', 'l'), ('Amount', '130px', 'r'), ('Paid', '70px', 'l'), ('Paid at', '150px', 'l'), ('Receipt', '130px', 'l')],
               [[(n, 'lead'), a, ('<label class="check"><input type="checkbox"%s aria-label="Paid %s"></label>' % (' checked' if at != '—' else '', n), 'html'), (at, 'muted'), (rc, 'code' if rc != '—' else 'faint')] for n, a, at, rc in pays])
    body = finding('The October run is approved and posted.', 'Three batches pay it out: bank, mobile money and cash. Each is approved, then marked paid with its receipts.') + band('Batches for the October run', '3') + t1 + \
        band('BAT-0031 · Bank, CBZ · record the payouts', '2 of 5') + t2
    people_page('PagePayDisburse', 'People · Payroll · Disbursements · /people/payroll/disbursements', topbar('Disbursements', 'money').replace('[[ACTIONS]]', primary('Mark paid', 'check', 'Ctrl ↵')), body)

def returns():
    rec = table([('Liability', 'auto', 'l'), ('Account', '90px', 'l'), ('Return', '130px', 'r'), ('Ledger', '130px', 'r'), ('Difference', '120px', 'r')],
                [[(l, 'lead'), (a, 'code'), r, g, (d, 'ok')] for l, a, r, g, d in (('PAYE', '2110', '$1,701.71', '$1,701.71', '0.00'), ('AIDS levy', '2130', '$51.05', '$51.05', '0.00'), ('NSSA, both shares', '2120', '$509.40', '$509.40', '0.00'), ('ZIMDEF', '2140', '$79.70', '$79.70', '0.00'))])
    p2 = table([('Employee', 'auto', 'l'), ('BP number', '130px', 'l'), ('Gross', '110px', 'r'), ('Taxable', '110px', 'r'), ('PAYE', '110px', 'r'), ('AIDS levy', '100px', 'r')],
               [[(n, 'lead'), (bp, 'code'), g, t, p, a] for n, bp, g, t, p, a in (('James Nyabadza', '2000184412', '$2,400.00', '$2,368.50', '$643.98', '$19.32'), ('Rudo Mapfumo', '2000193377', '$950.00', '$918.50', '$194.63', '$5.84'),
                ('Chipo Mhlanga', '2000201186', '$820.00', '$788.50', '$162.13', '$4.86'), ('Kuda Chigumba', '2000214470', '$780.00', '$748.50', '$152.13', '$4.56'), ('Tinashe Moyo', '2000226013', '$780.00', '$748.50', '$152.13', '$4.56'))],
               totals=['9 employees, 5 shown', '', '$7,970.00', '$7,723.30', '$1,701.71', '$51.05'])
    body = tools(seg(['USD', 'ZWG'], 'USD'), chipbtn('calendar', 'September 2026')) + finding('September’s P2 and NSSA schedule agree with the ledger.', 'October’s are ready once the run is posted. Simba needs an NSSA number first.') + \
        band('Reconciliation, September 2026', '') + rec + '<div style="display:flex;align-items:center;gap:8px;padding:24px 24px 8px"><h2 class="text-heading" style="flex:1">P2, monthly PAYE, USD</h2>%s</div>' % btn('P2 CSV', 'download') + p2
    people_page('PagePayReturns', 'People · Payroll · Statutory returns · /people/payroll/returns', topbar('Statutory returns', 'fileCheck').replace('[[ACTIONS]]', btn('NSSA schedule', 'download')), body)

if __name__ == '__main__':
    for f in (journals, vat, close, branding, build_home, build_templates, templates, incidents, disburse, returns):
        f()
    print('rest ok')
