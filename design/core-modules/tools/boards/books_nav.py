# The Books panel in its final form (spec/books-final.md §3.2): drill-down levels, not bands.
# books_level(None, 'Money') draws Books' first level; books_level('Sales', 'Invoices') draws the Sales level.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import ic, pn, pg, panel, iconbtn

LEVELS = [
    ('Sales', 'invoice', [('Invoices', 'invoice', 3, '/books/invoices'), ('Quotes', 'docs', None, '/books/quotes'),
                          ('Payments received', 'payments', 2, '/books/payments'), ('Credit notes', 'file', None, '/books/credit-notes'),
                          ('Customers', 'users', None, '/books/customers')]),
    ('Bills & spending', 'expenses', [('All spending', 'expenses', None, '/books/expenses'), ('Bills', 'file', 4, '/books/bills'),
                                      ('Payments made', 'payments', None, '/books/payments-made'), ('Purchase orders', 'list', None, '/books/orders'),
                                      ('Requisitions', 'hand', 2, '/books/requisitions'), ('Claims & petty cash', 'takings', 1, '/books/claims'),
                                      ('Suppliers', 'store', None, '/books/suppliers')]),
    ('Bank & cash', 'bank', [('Accounts', 'bank', None, '/books/accounts'), ('To match', 'match', 4, '/books/bank'),
                             ('Reconciliations', 'check', None, '/books/reconciliations'), ('Takings', 'takings', 1, '/books/takings')]),
    ('Tax', 'vat', [("What's due", 'calendar', None, '/books/tax'), ('VAT returns', 'vat', None, '/books/vat'),
                    ('Withholding', 'hand', None, '/books/withholding'), ('Provisional tax', 'calendar', None, '/books/provisional-tax'),
                    ('Fiscal register', 'fiscal', 1, '/books/fiscal')]),
    ('Close the month', 'done', [('Checklist', 'list', None, '/books/periods'), ('Needs posting', 'warn', 1, '/books/needs-posting'),
                                 ('Rates & revaluation', 'money', None, '/books/rates'), ('Year end', 'calendar', None, '/books/year-end')]),
    ('Ledger', 'books', [('Journals', 'books', None, '/books/journals'), ('Trial balance', 'table', None, '/books/trial-balance'),
                         ('Financial statements', 'reports', None, '/books/financials'), ('General ledger', 'list', None, '/books/ledger'),
                         ('Chart of accounts', 'columns', None, '/books/chart'), ('Cost centres', 'target', None, '/books/cost-centres'),
                         ('Posting rules', 'posting', None, '/books/posting-rules'), ('Audit trail', 'activity', None, '/books/audit')]),
    ('Settings', 'gear', [('Tax codes & rules', 'vat', None, '/books/settings/tax'), ('Numbering', 'sort', None, '/books/settings/numbering'),
                          ('Locks & periods', 'block', None, '/books/settings/locks'), ('Opening balances', 'money', None, '/books/settings/opening-balances'),
                          ('Set up the books', 'step', None, '/books/settings/setup')]),
]
LEVEL = {name: (icon, rows) for name, icon, rows in LEVELS}


def level_row(label, icon, holds=False):
    return ('<a class="pn%s" href="#%s"%s>%s<span class="truncate">%s</span><span class="pn-m" aria-hidden="true">%s</span></a>'
            % (' is-on' if holds else '', label, ' aria-current="true"' if holds else '', ic(icon), label, ic('caret')))


def where(page):
    """The level a page sits in, or None for Money."""
    for name, _, rows in LEVELS:
        if any(r[0] == page for r in rows):
            return name
    return None


def books_level(level=None, on=None):
    """Books' panel. level=None is the first level; otherwise the named level with a back row."""
    views = pg('Saved views', [pn('Overdue', dot=True, meta='shared'), pn('Pomona Offices', dot=True, meta='you'), pn('Paid this month', dot=True, meta='shared')], add=True)
    if level is None:
        body = pn('Money', 'money', None, on == 'Money')
        body += ''.join(level_row(name, icon, holds=(where(on) == name)) for name, icon, _ in LEVELS)
        body += views + pg('Reports from Books', [pn('Money this month', 'reports'), pn('Owed to you, by age', 'reports')])
        return panel('Books', body)
    icon, rows = LEVEL[level]
    back = '<a class="pn" href="#Books" aria-label="Back to Books">%s<span class="truncate" style="color:var(--color-muted)">Books</span></a>' % ic('back')
    body = back + '<div class="pg-h" style="margin-top:4px;font-size:var(--text-14);color:var(--color-ink);font-weight:600">%s</div>' % level
    body += ''.join(pn(label, ic_, n, label == on) for label, ic_, n, _ in rows)
    body += views
    return panel('Books', body)


def books_panel_for(page):
    """The panel as it looks on a page: the page's level, open."""
    return books_level(where(page), page)
