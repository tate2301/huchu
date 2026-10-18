"""Books, final form: the page boards for Money, Sales and Bills & spending (spec/books-final.md §3.3).

    cd design/core-modules && python3 tools/boards/books_pages_a.py boards/canvas

Every figure is worked out here from the documents below, so the boards agree with each other:
Money's overdue is the Overdue tab's sum, Money's money out is All spending's total, and so on.
The world: Floorcode, Harare, Saturday 18 October 2026. Base currency USD; ZiG at 27.00 (RBZ interbank).
"""
import sys, os, re, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import *
from books_nav import *
from decimal import Decimal, ROUND_HALF_UP

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'boards', 'canvas')
IC['trash'] = '<path fill="currentColor" d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1l-.9 12.6A2.5 2.5 0 0 1 15.6 22H8.4a2.5 2.5 0 0 1-2.5-2.4L5 7H4a1 1 0 0 1 0-2h4V4a1 1 0 0 1 1-1m1 6a1 1 0 0 0-1 1v7a1 1 0 1 0 2 0v-7a1 1 0 0 0-1-1m4 0a1 1 0 0 0-1 1v7a1 1 0 1 0 2 0v-7a1 1 0 0 0-1-1"/>'
IC['undo'] = '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'


# ---------- money ----------
def M(x):
    return Decimal(str(x)).quantize(Decimal('0.01'), ROUND_HALF_UP)

def fmt(x):
    return '{:,.2f}'.format(M(x))

def usd(x):
    x = M(x)
    return ('−' if x < 0 else '') + 'US$' + fmt(abs(x))

def zig(x):
    x = M(x)
    return ('−' if x < 0 else '') + 'ZiG ' + fmt(abs(x))

RATE = M('27.00')
VAT = Decimal('0.155')

def vat_on(net):
    return M(M(net) * VAT)

def vat_in(gross):
    """The VAT inside a VAT-inclusive amount at 15.5%."""
    return M(M(gross) * VAT / (1 + VAT))

def to_usd(z):
    return M(M(z) / RATE)

def lines_total(lines):
    """lines: (item, qty, unit, price) -> (net, vat, total)"""
    net = sum((M(M(q) * M(p)) for _, q, _, p in lines), Decimal('0'))
    v = vat_on(net)
    return M(net), v, M(net + v)


# ---------- the documents ----------
# Sales invoices. base = value in US$; cur = (code, amount) when the invoice is not in US$.
INV = [
    # no, customer, state, when, total(base), balance, fiscal, cur
    ('Draft', 'Mandara Medical Centre', 'Draft', 'Deposit, started 17 Oct', M(1000), None, '—', None),
    ('Draft', 'Greendale Spar', 'Draft', 'Started 15 Oct', M(740), None, '—', None),
    ('INV-0144', 'Westgate Interiors', 'Paid', 'Paid 16 Oct, transfer', to_usd(13500), None, 'Failed', ('ZiG', M(13500))),
    ('INV-0143', 'Avondale Fresh Mart', 'Void', 'Voided 12 Oct, CN-0009', M(640), None, 'Valid', None),
    ('INV-0142', 'Pomona Offices', 'Part paid', 'Due 20 Oct', M('1994.22'), M('1494.22'), 'Valid', None),
    ('INV-0141', 'Mrs T. Gumbo', 'Paid', 'Paid 5 Oct, cash', M(430), None, 'Valid', None),
    ('INV-0140', 'Borrowdale Brooke Clinic', 'Issued', 'Due 31 Oct', M(1750), M(1750), 'Valid', None),
    ('INV-0139', 'Greystone Park Primary', 'Paid', 'Paid 2 Oct, transfer', M(2980), None, 'Valid', None),
    ('INV-0138', 'Avondale Fresh Mart', 'Paid', 'Paid 30 Sep, EcoCash', M(1865), None, 'Valid', None),
    ('INV-0137', 'Msasa Motors', 'Overdue', '2 days overdue', M(380), M(380), 'Valid', None),
    ('INV-0136', 'Dr N. Sibanda', 'Paid', 'Paid 29 Sep, card', M(1130), None, 'Valid', None),
    ('INV-0135', 'Highlands Guest Lodge', 'Overdue', '5 days overdue', M(860), M(860), 'Valid', None),
    ('INV-0133', 'Msasa Motors', 'Void', 'Replaced by INV-0137', M(420), None, 'Valid', None),
    ('INV-0131', 'Chisipite Dental', 'Overdue', '12 days overdue', M(1240), M(1240), 'Valid', None),
]
OWED = sum((r[5] for r in INV if r[5] is not None), Decimal('0'))
OVERDUE_ROWS = [r for r in INV if r[2] == 'Overdue']
OVERDUE = sum((r[5] for r in OVERDUE_ROWS), Decimal('0'))
OWED_N = sum(1 for r in INV if r[5] is not None)
DRAFTS = sum((r[4] for r in INV if r[2] == 'Draft'), Decimal('0'))
INV_ALL = 146          # 144 numbered + 2 drafts
INV_TABS = (('All', INV_ALL), ('Owed', OWED_N), ('Overdue', len(OVERDUE_ROWS)), ('Paid', INV_ALL - OWED_N - 2 - 2), ('Drafts', 2), ('Void', 2))

# INV-0142, Pomona Offices: the record page
INV142_LINES = (('Carpet tiles, Interface Heuga, grey', 64, 'm²', '18.50'), ('Underlay and adhesive', 64, 'm²', '3.60'),
                ('Fitting', 64, 'm²', '4.20'), ('Aluminium edge trim', 14, 'm', '3.10'))
I142_NET, I142_VAT, I142_TOT = lines_total(INV142_LINES)
assert I142_TOT == M('1994.22'), I142_TOT

# QT-0403 -> the new ZiG invoice for Msasa Motors
NEW_LINES = (('Vinyl plank, Polyflor Camaro oak', 82, 'm²', '540.00'), ('Underlay, 2 mm acoustic', 82, 'm²', '67.50'),
             ('Fitting', 82, 'm²', '162.00'), ('Skirting, white, 100 mm', 64, 'm', '135.00'))
NEW_NET, NEW_VAT, NEW_TOT = lines_total(NEW_LINES)

# Payments received
RCT = [
    # no, date, customer, on, into, state, bank, base, cur
    ('RCT-0094', '16 Oct', 'Westgate Interiors', 'INV-0144', 'CBZ, ZiG', 'On an invoice', 'Matched', to_usd(13500), ('ZiG', M(13500))),
    ('RCT-0093', '15 Oct', 'Mrs R. Chuma', 'On account', 'EcoCash', 'On account', 'Matched', M(250), None),
    ('RCT-0092', '12 Oct', 'Mandara Medical Centre', 'Deposit, QT-0397', 'CBZ, USD', 'On account', 'Matched', M(1000), None),
    ('RCT-0091', '8 Oct', 'Pomona Offices', 'INV-0142', 'CBZ, USD', 'On an invoice', 'Matched', M(500), None),
    ('RCT-0090', '5 Oct', 'Mrs T. Gumbo', 'Duplicate, voided', 'Showroom cash box', 'Void', '—', M(430), None),
    ('RCT-0089', '5 Oct', 'Mrs T. Gumbo', 'INV-0141', 'Showroom cash box', 'On an invoice', 'Counted', M(430), None),
    ('RCT-0088', '2 Oct', 'Greystone Park Primary', 'INV-0139', 'CBZ, USD', 'On an invoice', 'Matched', M(2980), None),
    ('RCT-0087', '30 Sep', 'Avondale Fresh Mart', 'INV-0138', 'EcoCash', 'On an invoice', 'Matched', M(1865), None),
    ('RCT-0086', '29 Sep', 'Dr N. Sibanda', 'INV-0136', 'CBZ, USD', 'On an invoice', 'Matched', M(1130), None),
]
OCT_RCT = [r for r in RCT if r[1].endswith('Oct') and r[5] != 'Void']
IN_INVOICES = sum((r[7] for r in OCT_RCT if r[5] == 'On an invoice'), Decimal('0'))
ON_ACCOUNT = sum((r[7] for r in OCT_RCT if r[5] == 'On account'), Decimal('0'))
TILLS = M('14862.40')
MONEY_IN = TILLS + IN_INVOICES + ON_ACCOUNT

# Quotes
QT = [
    # no, customer, what, state, date, valid, base, cur
    ('QT-0399', 'Pomona Offices', 'Carpet tiles, 212 m², offices', 'Sent', 'Sent 13 Oct', '12 Nov', M(8930), None, 'Read 13 Oct'),
    ('QT-0401', 'Highlands Guest Lodge', 'Phase 2, 6 rooms, vinyl', 'Sent', 'Sent 14 Oct', '13 Nov', M(3260), None, 'Read 15 Oct'),
    ('QT-0402', 'Ridgeview Apartments', 'Laminate, 8 flats', 'Sent', 'Sent 6 Oct', '24 Oct', M(12480), None, 'Read 7 Oct'),
    ('QT-0400', 'Avondale Fresh Mart', 'Storeroom, safety vinyl', 'Sent', 'Sent 13 Oct', '12 Nov', M(1640), None, 'Not read'),
    ('QT-0398', 'Dr N. Sibanda', 'Consulting room, vinyl', 'Sent', 'Sent 9 Oct', '8 Nov', M(980), None, 'Read 9 Oct'),
    ('QT-0395', 'Mrs P. Moyo', 'Lounge, laminate', 'Sent', 'Sent 5 Oct', '4 Nov', M(1125), None, 'Read 6 Oct'),
    ('QT-0394', 'Greendale Spar', 'Shop floor, tiles', 'Sent', 'Sent 2 Oct', '1 Nov', to_usd(44820), ('ZiG', M(44820)), 'Read 2 Oct'),
]
SENT = sum((q[6] for q in QT), Decimal('0'))

# Credit notes
CN = [
    ('CN-0009', '12 Oct', 'Avondale Fresh Mart', 'INV-0143', 'Cancellation, wrong customer', 'Valid', 'Issued', M(640)),
    ('CN-0008', '2 Oct', 'Msasa Motors', 'INV-0133', 'Cancellation, revised as INV-0137', 'Valid', 'Issued', M(420)),
    ('CN-0007', '2 Oct', 'Dr N. Sibanda', 'INV-0136', 'Return, skirting', 'Valid', 'Refunded', M(85)),
    ('Draft', '17 Oct', 'Greystone Park Primary', 'INV-0139', 'Price correction', '—', 'Draft', M(180)),
    ('CN-0006', '24 Sep', 'Chisipite Dental', 'INV-0128', 'Price correction', 'Valid', 'Issued', M(120)),
    ('CN-0005', '9 Sep', 'Kopje Lodge', 'INV-0118', 'Discount', 'Valid', 'Issued', M(60)),
]
CN_OCT = sum((c[7] for c in CN if c[1].endswith('Oct') and c[6] != 'Draft'), Decimal('0'))

# Bills. BILL-0220 is the record page; its lines give its total.
B220_LINES = (('Oak strip flooring, 14 mm', 40, 'm²', '34.20'), ('Oak skirting', 30, 'm', '5.60'), ('Underlay', 40, 'm²', '1.85'))
B220_NET, B220_VAT, B220_TOT = lines_total(B220_LINES)
B_NEW_LINES = (('Ceramic skirting', 60, 'm', '4.40'), ('Trim, 3 m lengths', 24, 'pcs', '4.30'))
BN_NET, BN_VAT, BN_TOT = lines_total(B_NEW_LINES)
BILLS = [
    # no, supplier, what, fti, fdms, matches, due, state, total
    ('BILL-0224', 'ZETDC', 'Electricity, September', '7700412', 'Valid', '—', 'Due 22 Oct', 'To pay', M('212.60')),
    ('BILL-0223', 'Rapid Freight Harare', 'Deliveries, October', '001877', 'Not checked', '—', 'Due 24 Oct', 'To pay', M(185)),
    ('BILL-0222', 'Carpet Mills Africa', 'Carpet tiles, 180 m²', 'CMA-11520', 'Not checked', 'PO-0032 · GRN-0046', 'Due 30 Oct', 'To pay', M(3180)),
    ('BILL-0221', 'Tile Trader Zimbabwe', 'Porcelain, 120 m²', '00184432', 'Valid', 'PO-0031 · GRN-0044', 'Due 23 Oct', 'To pay', M(2640)),
    ('BILL-0220', 'Mutare Timber Works', 'Oak strip, 40 m²', 'MTW-2291', 'Not checked', 'PO-0030 · GRN-0043', '2 days overdue', 'Overdue', B220_TOT),
]
TO_PAY = sum((b[8] for b in BILLS), Decimal('0'))
BILL_OVERDUE = sum((b[8] for b in BILLS if b[7] == 'Overdue'), Decimal('0'))
DUE_WEEK = [b for b in BILLS if b[0] in ('BILL-0224', 'BILL-0223', 'BILL-0221', 'BILL-0220')]
DUE_WEEK_SUM = sum((b[8] for b in DUE_WEEK), Decimal('0'))

# Withholding on Mutare Timber Works (no valid ITF263)
WHT = M(B220_TOT * Decimal('0.30'))
NET_PAY = B220_TOT - WHT
IMTT_NEW = M(NET_PAY * Decimal('0.02'))
MTW_PAID_YTD = M(2080)
MTW_WHT_YTD = M(624)

# Payments made
def imtt(base, cur=None):
    return M(cur[1] * Decimal('0.015')) if cur else M(base * Decimal('0.02'))

PAY = [
    # no, date, to, for, from, withheld, state, base, cur
    ('PAY-0062', '18 Oct', 'Mutare Timber Works', 'BILL-0220', 'CBZ, USD', WHT, 'To approve', NET_PAY, None),
    ('PAY-0061', '14 Oct', 'ZIMRA', 'VAT, September', 'CBZ, USD', None, 'Paid', M('1184.60'), None),
    ('PAY-0060', '10 Oct', 'NSSA', 'NSSA, September', 'CBZ, ZiG', None, 'Paid', to_usd(M('7654.50')), ('ZiG', M('7654.50'))),
    ('PAY-0059', '10 Oct', 'ZIMRA', 'PAYE, September', 'CBZ, USD', None, 'Paid', M('648.40'), None),
    ('PAY-0058', '9 Oct', 'Tile Trader Zimbabwe', 'BILL-0216', 'CBZ, USD', None, 'Paid', M(2210), None),
    ('PAY-0057', '5 Oct', 'Halsted Builders', 'BILL-0219', 'CBZ, USD', None, 'Paid', M('312.40'), None),
    ('PAY-0056', '1 Oct', 'Kingsway Property', 'BILL-0218', 'CBZ, USD', None, 'Paid', M(1450), None),
    ('PAY-0055', '1 Oct', 'Kingsway Property', 'Paid twice, voided', 'CBZ, USD', None, 'Void', M(1450), None),
]
PAID_OCT = [p for p in PAY if p[6] == 'Paid']
PAID_OUT = sum((p[7] for p in PAID_OCT), Decimal('0'))
IMTT_OCT_USD = sum((imtt(p[7]) for p in PAID_OCT if not p[8]), Decimal('0'))
IMTT_OCT_ZIG = sum((imtt(p[7], p[8]) for p in PAID_OCT if p[8]), Decimal('0'))
BANK_FEES = M(18) + IMTT_OCT_USD + to_usd(IMTT_OCT_ZIG)

# Requisitions (CRM and retail, one list)
REQ88_SLIPS = (('Puma, Msasa', 'Fuel, 20 litres', 'Van fuel', '6300', M('32.50'), True),
               ('Bhola Hardware', 'Tile adhesive, 4 bags', 'Materials used', '5000', M('96.00'), True),
               ('Halsted Builders', 'Screed, 1 bag', 'Materials used', '5000', M('36.00'), False))
REQ88_GIVEN = M(180)
REQ88_SPENT = sum((s[4] for s in REQ88_SLIPS), Decimal('0'))
REQ88_BACK = REQ88_GIVEN - REQ88_SPENT
REQ = [
    # no, by, source, for, asked, state, amount, note
    ('REQ-0093', 'James Nyabadza', 'CRM', 'Floor sander repair', '18 Oct', 'To approve', M(120), 'Yours: Rudo Mapfumo approves'),
    ('REQ-0092', 'Tendai Sibanda', 'Retail', 'Till rolls and toner', '18 Oct', 'To approve', M(38), 'Within your limit'),
    ('REQ-0091', 'Tinashe Moyo', 'CRM', 'Transport, clinic job', '17 Oct', 'To approve', M(60), 'Within your limit'),
    ('REQ-0087', 'Farai Ncube', 'CRM', 'Courier, samples to Mutare', '15 Oct', 'Approved', M(45), ''),
    ('REQ-0089', 'Simba Gondo', 'CRM', 'Floor sander hire, Highlands Guest Lodge', '13 Oct', 'Disbursed', M(95), ''),
    ('REQ-0090', 'Chipo Mhlanga', 'Retail', 'Cleaning supplies, showroom', '11 Oct', 'Accounted for', M(42), ''),
    ('REQ-0088', 'Farai Ncube', 'CRM', 'Fuel and materials, Pomona Offices', '6 Oct', 'Accounted for', REQ88_GIVEN, ''),
]
REQ_FOR_ME = [r for r in REQ if r[5] == 'To approve' and r[1] != 'James Nyabadza']
REQ_FOR_ME_SUM = sum((r[6] for r in REQ_FOR_ME), Decimal('0'))
REQ_OUT = REQ88_SPENT + M(95) + M(42)          # disbursed this month, less change returned

# Claims, floats and vouchers
CLM = [
    ('CLM-0014', 'Simba Gondo', 'Parking and tolls, Mutare trip', '17 Oct', 'Submitted', M(23), 'Own pocket'),
    ('CLM-0013', 'Tinashe Moyo', 'Fuel, own car, 3 site visits', '14 Oct', 'Approved', M(36), 'Own pocket'),
    ('CLM-0012', 'Farai Ncube', 'Grout, Bhola Hardware', '8 Oct', 'Paid', M('14.50'), 'Own pocket'),
    ('CLM-0011', 'Chipo Mhlanga', 'Display stands, glue and tape', '26 Sep', 'Paid', M('18.00'), 'Own pocket'),
    ('CLM-0010', 'Simba Gondo', 'Lunch, fitting team at Kopje Lodge', '19 Sep', 'Paid', M('27.50'), 'Own pocket'),
]
FLOATS = (('Showroom petty cash', 'Chipo Mhlanga', M(200), M('126.40'), 5), ('Site float', 'Farai Ncube', M(100), M('64.00'), 2))
VOUCHERS_OUT = sum((f[2] - f[3] for f in FLOATS), Decimal('0'))
CLAIMS_OUT = M('14.50') + VOUCHERS_OUT
PAYOUTS = (('11 Oct', 'Till 1 payout: Saturday cleaner', 'Chipo Mhlanga', M(24)), ('6 Oct', 'Till 2 payout: fuel for the van', 'Tendai Sibanda', M(40)))
PAYOUTS_OUT = sum((p[3] for p in PAYOUTS), Decimal('0'))

# Money out this month, by kind (Money's "Where it went" and All spending's total)
OUT_BILLS = sum((p[7] for p in PAID_OCT if p[3].startswith('BILL')), Decimal('0'))
OUT_PAYROLL = sum((p[7] for p in PAID_OCT if p[2] in ('NSSA',) or p[3].startswith('PAYE')), Decimal('0'))
OUT_TAX = sum((p[7] for p in PAID_OCT if p[3].startswith('VAT')), Decimal('0'))
OUT_OTHER = OUT_TAX + BANK_FEES
MONEY_OUT = OUT_BILLS + OUT_PAYROLL + REQ_OUT + CLAIMS_OUT + PAYOUTS_OUT + OUT_OTHER

# Bank and cash, today 06:00
ACCOUNTS = (('CBZ current', 'Bank', 'USD', M('18412.75'), '30 Sep'), ('CBZ current', 'Bank', 'ZWG', M('61280.40'), '30 Sep'),
            ('EcoCash merchant', 'Mobile money', 'USD', M('1086.50'), '15 Oct'), ('Showroom cash box', 'Cash', 'USD', M('642.80'), 'Counted 17 Oct'),
            ('Showroom petty cash', 'Float', 'USD', FLOATS[0][3], 'Counted 30 Sep'), ('Site float, Farai Ncube', 'Float', 'USD', FLOATS[1][3], 'Counted 30 Sep'))
CASH_USD = sum((a[3] for a in ACCOUNTS if a[2] == 'USD'), Decimal('0'))
CASH_ZIG = sum((a[3] for a in ACCOUNTS if a[2] == 'ZWG'), Decimal('0'))
CASH_BASE = CASH_USD + to_usd(CASH_ZIG)

# VAT for October so far: output on tills and invoices, less credit notes; input on bills that are Valid on FDMS
OUT_VAT = vat_in(TILLS) + sum((vat_in(x) for x in (M(380), M(1750), M(430), M('1994.22'), M(640), to_usd(13500))), Decimal('0')) - sum((vat_in(c[7]) for c in CN if c[1].endswith('Oct') and c[6] != 'Draft'), Decimal('0'))
IN_VAT = sum((vat_in(x) for x in (M(1450), M('312.40'), M(2640), M('212.60'))), Decimal('0')) + sum((vat_in(s[4]) for s in REQ88_SLIPS if s[5]), Decimal('0'))
VAT_OCT = OUT_VAT - IN_VAT

# Suppliers
SUP = [
    # name, itf263, vat no, open bills, owed, overdue, paid ytd, withheld ytd
    ('Carpet Mills Africa', ('Valid', 'to 30 Jun 2027'), '220061904', 1, M(3180), None, M(22860), None),
    ('Tile Trader Zimbabwe', ('Valid', 'to 31 Dec 2026'), '220056712', 1, M(2640), None, M(18420), None),
    ('Mutare Timber Works', ('Expired', '30 Jun 2026'), '220145873', 1, B220_TOT, B220_TOT, MTW_PAID_YTD, MTW_WHT_YTD),
    ('ZETDC', ('Not needed', 'public body'), '220000118', 1, M('212.60'), None, M('2134.80'), None),
    ('Rapid Freight Harare', ('None', 'never sent'), '—', 1, M(185), None, M(640), None),
    ('Halsted Builders', ('Valid', 'to 31 Dec 2026'), '220093355', 0, None, None, M('4212.40'), None),
    ('Kingsway Property', ('Valid', 'to 31 Mar 2027'), '220040027', 0, None, None, M(14500), None),
    ('Bhola Hardware', ('Valid', 'to 31 Dec 2026'), '220077610', 0, None, None, M('386.50'), None),
    ('ZIMRA', ('Not needed', 'tax'), '—', 0, None, None, M('11874.30'), None),
    ('NSSA', ('Not needed', 'statutory'), '—', 0, None, None, M('2835.00'), None),
]
SUP_OWED = sum((s[4] for s in SUP if s[4]), Decimal('0'))
assert SUP_OWED == TO_PAY
SUP_WHT = sum((s[7] for s in SUP if s[7]), Decimal('0'))

# Customers
CUS = [
    # name, contact, vat, open, owed, overdue, on account, last paid
    ('Borrowdale Brooke Clinic', 'Dr S. Marufu', '220101442', 1, M(1750), None, None, '11 Sep'),
    ('Pomona Offices', 'Mr K. Dube', '220087431', 1, M('1494.22'), None, None, '8 Oct'),
    ('Chisipite Dental', 'Mrs L. Banda', '220098120', 1, M(1240), M(1240), None, '28 Aug'),
    ('Highlands Guest Lodge', 'Mr P. Hove', '220113305', 1, M(860), M(860), None, '14 Sep'),
    ('Msasa Motors', 'Mr T. Mutasa', '220114593', 1, M(380), M(380), None, '21 Sep'),
    ('Mandara Medical Centre', 'Sr F. Gumbo', '220120876', 0, None, None, M(1000), '12 Oct'),
    ('Mrs R. Chuma', '+263 77 218 4410', '—', 0, None, None, M(250), '15 Oct'),
    ('Westgate Interiors', 'Ms N. Chari', '220131957', 0, None, None, None, '16 Oct'),
    ('Greystone Park Primary', 'The bursar', '—', 0, None, None, None, '2 Oct'),
    ('Avondale Fresh Mart', 'Mr D. Patel', '220072284', 0, None, None, None, '30 Sep'),
    ('Dr N. Sibanda', '+263 71 330 9182', '—', 0, None, None, None, '29 Sep'),
    ('Mrs T. Gumbo', '+263 77 905 1123', '—', 0, None, None, None, '5 Oct'),
]
assert sum((c[4] for c in CUS if c[4]), Decimal('0')) == OWED
assert sum((c[5] for c in CUS if c[5]), Decimal('0')) == OVERDUE
assert sum((c[6] for c in CUS if c[6]), Decimal('0')) == ON_ACCOUNT


# ---------- small parts ----------
def ref(x):
    return '<span class="ref">%s</span>' % x

def draft_no():
    return '<span class="muted">Draft</span>'

TONES = {'Draft': '', 'Issued': 'info', 'Part paid': 'info', 'Paid': 'success', 'Overdue': 'warning', 'Void': 'void', 'Sent': 'info',
         'Accepted': 'success', 'Expired': '', 'On an invoice': 'success', 'On account': 'info', 'Matched': 'success', 'To match': 'warning',
         'Counted': 'success', 'Valid': 'success', 'Not checked': 'warning', 'Not valid': 'danger', 'Failed': 'danger', 'Refunded': 'success',
         'To pay': 'info', 'To approve': 'warning', 'Approved': 'info', 'Disbursed': 'info', 'Accounted for': 'success', 'Submitted': 'warning',
         'Rejected': 'void', 'Cancelled': 'void', 'Received': 'success', 'Part received': 'info', 'Closed': 'success', 'Recorded': 'info',
         'Expired ITF263': 'warning', 'None': 'warning', 'Not needed': ''}

def st(word, label=None):
    t = TONES.get(word, '')
    label = label or word
    if t == 'void':
        return '<span class="status" style="color:var(--color-muted)">%s</span>' % label
    if t == 'warning':
        return '<span class="status status-warning" style="color:var(--color-ink);font-weight:500">%s</span>' % label
    return status(label, t)

PILLS = {'Draft': 'pill-n', 'Issued': 'pill-info', 'Part paid': 'pill-info', 'Paid': 'pill-ok', 'Overdue': 'pill-warn', 'Void': 'pill-plain',
         'Valid': 'pill-ok', 'Not checked': 'pill-warn', 'Failed': 'pill-bad', 'Accounted for': 'pill-ok', 'To approve': 'pill-warn',
         'Expired': 'pill-warn', 'Recorded': 'pill-info'}

def pill(word, label=None):
    return '<span class="pill %s">%s</span>' % (PILLS.get(word, 'pill-n'), label or word)

def amount(base, cur=None):
    if cur:
        return '%s <span class="muted" style="font-size:12px">%s</span>' % (zig(cur[1]), usd(base))
    return usd(base)

def btn_sm(label, icon=None, cls='btn btn-sm'):
    return btn(label, icon, cls)

def menu(items, style=''):
    """items: (icon, label, hint, danger, disabled) or 'sep' or ('label', text)"""
    out = ''
    for it in items:
        if it == 'sep':
            out += '<div class="menu-sep" style="height:1px;margin:4px 0;background:var(--color-line)"></div>'
            continue
        if it[0] == 'label':
            out += '<div class="menu-label" style="padding:6px 8px 4px;font-size:12px;color:var(--color-muted)">%s</div>' % it[1]
            continue
        icon, label, hint, danger, disabled = it
        col = 'color:var(--color-danger)' if danger and not disabled else ('color:var(--color-faint)' if disabled else '')
        out += ('<button class="menu-item" role="menuitem"%s style="height:auto;min-height:32px;padding:6px 8px;align-items:flex-start;%s">%s'
                '<span style="display:flex;flex-direction:column;gap:2px;text-align:left;min-width:0"><span>%s</span>%s</span></button>') % (
            ' aria-disabled="true"' if disabled else '', col, ic(icon), label,
            '<span style="font-size:12px;color:var(--color-muted);white-space:normal;line-height:1.4">%s</span>' % hint if hint else '')
    return '<div class="menu" role="menu" style="%s">%s</div>' % (style, out)

def qr(seed, size=132):
    rnd = random.Random(seed)
    n = 25
    cells = [[rnd.random() < 0.48 for _ in range(n)] for _ in range(n)]
    def finder(x, y):
        for i in range(7):
            for j in range(7):
                edge = i in (0, 6) or j in (0, 6)
                core = 2 <= i <= 4 and 2 <= j <= 4
                cells[y + i][x + j] = edge or core
        for i in range(-1, 8):
            for j in range(-1, 8):
                if 0 <= y + i < n and 0 <= x + j < n and (i in (-1, 7) or j in (-1, 7)):
                    cells[y + i][x + j] = False
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7)
    rects = ''.join('<rect x="%d" y="%d" width="1" height="1"/>' % (x, y) for y in range(n) for x in range(n) if cells[y][x])
    return ('<svg width="%d" height="%d" viewBox="-1 -1 %d %d" role="img" aria-label="FDMS QR code" style="flex:none;background:#fff;border-radius:6px;box-shadow:var(--shadow-ring)">'
            '<g fill="#16150f">%s</g></svg>') % (size, size, n + 2, n + 2, rects)


# ---------- the page frame ----------
CSS = '''
.bk{display:flex;flex-direction:column;flex:1;min-height:0}
.tb-m h1{white-space:nowrap}
.bk .finding{flex:none}
.bk-tabs{padding:0 24px;flex:none;margin-top:12px}
.bk-tabs .tab .n{font-weight:400;color:var(--color-muted);font-variant-numeric:tabular-nums}
.bk-tabs .tab[aria-selected="true"] .n{color:var(--color-ink-2)}
.bk .ws-tools{flex:none}
.bk .ws-n{white-space:nowrap}
.bk .table-shell{min-height:0}
.bk .table td .sub2{font-size:12px;color:var(--color-muted);margin-left:6px}
.bk-rec{display:grid;grid-template-columns:minmax(0,1fr) 360px;flex:1;min-height:0}
.bk-rec>.rail{background:var(--color-surface)}
.bk-main{min-width:0;padding-bottom:40px}
.bk-head{padding:28px 24px 4px;display:flex;flex-direction:column;gap:10px}
.bk-k{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;color:var(--color-muted)}
.bk-k b{font-weight:500;color:var(--color-ink)}
.bk-title{font:600 28px/1.2 var(--font-sans);letter-spacing:var(--tracking-display);color:var(--color-ink);font-variant-numeric:tabular-nums}
.bk-title small{font-weight:400;font-size:18px;color:var(--color-muted);letter-spacing:0}
.bk-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 24px 0}
.bk-acts .sepv{width:1px;height:20px;background:var(--color-line);margin:0 4px}
.bk-sums{margin-left:auto;width:340px;display:flex;flex-direction:column;gap:6px;padding:12px 24px 4px;font-size:14px}
.bk-sums div{display:flex;justify-content:space-between;gap:16px;color:var(--color-ink-2);font-variant-numeric:tabular-nums}
.bk-sums .t{padding-top:8px;margin-top:2px;box-shadow:inset 0 1px 0 var(--color-rule);font-weight:600;color:var(--color-ink);font-size:16px}
.bk-sums .m{color:var(--color-muted);font-size:13px}
.bk-note{display:flex;align-items:flex-start;gap:8px;padding:8px 24px 0;font-size:13px;line-height:1.5;color:var(--color-ink-2)}
.bk-note .ic{width:16px;height:16px;flex:none;margin-top:2px;color:var(--color-muted)}
.bk-tl{list-style:none;margin:0;padding:4px 24px}
.bk-tl li{display:grid;grid-template-columns:16px minmax(0,1fr) 110px;gap:12px;padding:8px 0;font-size:13px;line-height:1.5;color:var(--color-ink-2);box-shadow:inset 0 -1px 0 var(--color-line)}
.bk-tl li:last-child{box-shadow:none}
.bk-tl .d{width:8px;height:8px;border-radius:999px;background:var(--color-faint);margin-top:6px}
.bk-tl .d.ok{background:var(--color-success)}.bk-tl .d.in{background:var(--color-accent)}.bk-tl .d.wa{background:var(--color-warning)}
.bk-tl b{font-weight:500;color:var(--color-ink)}
.bk-tl time{color:var(--color-muted);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.bk-sel{position:relative}
.bk-fm{display:grid;grid-template-columns:minmax(0,1fr) 360px;flex:1;min-height:0}
.bk-fl{padding:32px 24px 56px;display:flex;flex-direction:column;gap:40px;min-width:0}
.bk-fl .form-sec{grid-template-columns:180px minmax(0,1fr);column-gap:32px}
.bk-le td{padding:4px 6px!important;height:44px}
.bk-le td:first-child{padding-left:0!important}.bk-le th:first-child{padding-left:0!important}
.bk-le td:last-child{padding-right:0!important}.bk-le th:last-child{padding-right:0!important}
.bk-le th{background:transparent;padding:0 6px}
.bk-le .input,.bk-le .select{height:32px;font-size:14px}
.bk-le .select{padding-right:26px;background-position:calc(100% - 14px) 50%,calc(100% - 9px) 50%}
.bk-wide{display:flex;flex-direction:column;gap:12px}
.bk-wide>header{display:flex;align-items:baseline;gap:12px}.bk-wide>header h2{font-size:16px;font-weight:600;color:var(--color-ink)}.bk-wide>header p{font-size:13px;color:var(--color-muted)}
.bk-le .input.num{text-align:right}
.bk-hint{font-size:13px;line-height:1.5;color:var(--color-muted)}
.bk-hint b{font-weight:500;color:var(--color-ink-2)}
.bk-box{border-radius:10px;box-shadow:var(--shadow-ring);padding:14px 16px;display:flex;gap:12px;align-items:flex-start;font-size:13px;line-height:1.5;color:var(--color-ink-2)}
.bk-box.warn{background:var(--color-warning-tint);box-shadow:none}
.bk-box.ok{background:var(--color-success-tint);box-shadow:none}
.bk-box>.ic{width:18px;height:18px;flex:none;margin-top:1px;color:var(--color-ink-2)}
.bk-box b{font-weight:600;color:var(--color-ink)}
.bk-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:16px 24px 0;border-radius:10px;box-shadow:var(--shadow-ring);overflow:hidden}
.bk-steps>div{padding:12px 14px;display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--color-muted);min-width:0}
.bk-steps>div+div{box-shadow:inset 1px 0 0 var(--color-line)}
.bk-steps b{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--color-ink);font-size:14px}
.bk-steps b .ic{width:16px;height:16px;color:var(--color-success)}
.bk-figs{display:grid;gap:0;margin:16px 24px 0;border-radius:10px;box-shadow:var(--shadow-ring);overflow:hidden}
.bk-figs>div{padding:12px 16px;display:flex;flex-direction:column;gap:2px;min-width:0}
.bk-figs>div+div{box-shadow:inset 1px 0 0 var(--color-line)}
.bk-figs .l{font-size:13px;color:var(--color-muted);white-space:nowrap}
.bk-figs .v{font:600 20px/1.3 var(--font-sans);font-variant-numeric:tabular-nums;color:var(--color-ink);white-space:nowrap}
.bk-figs .s{font-size:12px;color:var(--color-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-rtabs{padding:0 24px;margin-top:20px}
.bk .rail section .btn{justify-content:flex-start}
.bk-undo{display:flex;flex-direction:column;gap:12px}
.bk-undo>div{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:start;font-size:13px;line-height:1.5;color:var(--color-ink-2)}
.bk-undo .btn{width:96px;justify-content:flex-start}
.mny-in .share{grid-template-columns:24px minmax(0,1fr) 56px 112px}
.bk-ph{width:390px;height:844px;display:flex;flex-direction:column;background:var(--color-surface);position:relative;overflow:hidden}
.bk-ph-h{display:flex;align-items:center;gap:4px;height:56px;padding:0 8px;box-shadow:inset 0 -1px 0 var(--color-line);flex:none}
.bk-ph-h b{font-size:17px;font-weight:600;color:var(--color-ink);flex:1;min-width:0}
.bk-ph-b{flex:1;min-height:0;overflow:hidden;padding:20px 16px;display:flex;flex-direction:column;gap:20px}
.bk-ph-f{flex:none;padding:12px 16px 28px;display:flex;flex-direction:column;gap:8px;box-shadow:0 -1px 0 var(--color-line);background:var(--color-surface)}
.bk-ph-f .btn{height:48px;width:100%;font-size:16px}
.bk-ph-row{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:44px;font-size:15px;box-shadow:inset 0 -1px 0 var(--color-line)}
.bk-ph-row span:first-child{color:var(--color-muted)}
.bk-ph-row span:last-child{color:var(--color-ink);text-align:right}
.bk-ph-need{display:grid;grid-template-columns:20px minmax(0,1fr) 16px;gap:12px;align-items:center;min-height:56px;padding:8px 0;box-shadow:inset 0 -1px 0 var(--color-line);font-size:14px;line-height:1.4}
.bk-ph-need b{display:block;font-weight:500;color:var(--color-ink);font-size:15px}
.bk-ph-need .ic{color:var(--color-muted)}
.bk-ph-need span span{color:var(--color-muted)}
'''

def page(on, title, icon, actions, body, vane=5):
    return shell('Books', books_panel_for(on), topbar(title, icon, actions, vane=vane) + body)

def crumb(parent, here):
    return '<span style="color:var(--color-muted);font-weight:500">%s</span><span style="color:var(--color-faint);font-weight:400">/</span>%s' % (parent, here)

def tabs(items, on, label):
    out = ''
    for name, n in items:
        sel = name == on
        out += '<button class="tab" role="tab" aria-selected="%s">%s%s</button>' % ('true' if sel else 'false', name, ' <span class="n">%s</span>' % n if n not in (None, '') else '')
    return '<div class="tabs bk-tabs" role="tablist" aria-label="%s">%s</div>' % (label, out)

def plain(html):
    return re.sub(r'<[^>]+>', '', html).strip()

def grid(head, rows, num=(), sel=None, total=None, label='rows', fill=None, widths=None, fixed=False):
    """A list table. sel: set of selected row indexes (or empty set for a select column with none ticked)."""
    th = ''
    if sel is not None:
        th += '<th class="sel"><label class="check"><input type="checkbox" aria-label="Select every row on this page"%s></label></th>' % (' checked' if sel and len(sel) == len(rows) else '')
    th += ''.join('<th%s>%s</th>' % (' class="num"' if i in num else '', h) for i, h in enumerate(head))
    body = ''
    for ri, r in enumerate(rows):
        on = sel is not None and ri in sel
        tr = '<tr%s>' % (' aria-selected="true"' if on else '')
        if sel is not None:
            tr += '<td class="sel"><label class="check"><input type="checkbox" aria-label="Select %s"%s></label></td>' % (plain(r[0]) or 'row', ' checked' if on else '')
        for i, c in enumerate(r):
            cls = []
            if i in num:
                cls.append('num')
            if fill is not None and i == fill:
                cls.append('fill')
            tr += '<td%s>%s</td>' % (' class="%s"' % ' '.join(cls) if cls else '', c)
        body += tr + '</tr>'
    tf = ''
    if total:
        lead = '<td></td>' if sel is not None else ''
        tf = '<tfoot><tr class="tot">%s%s</tr></tfoot>' % (lead, ''.join('<td%s>%s</td>' % (' class="num"' if i in num else '', c) for i, c in enumerate(total)))
    cg = ''
    if widths:
        cg = '<colgroup>%s%s</colgroup>' % ('<col style="width:44px">' if sel is not None else '', ''.join('<col%s>' % (' style="width:%s"' % w if w else '') for w in widths))
    if fixed:
        label += '" style="table-layout:fixed'
    return '<table class="table" aria-label="%s">%s<thead><tr>%s</tr></thead><tbody>%s</tbody>%s</table>' % (label, cg, th, body, tf)

def pager_btns():
    return '<div class="btn-group" role="group" aria-label="Pages"><button class="btn" disabled>%sPrevious</button><button class="btn">Next%s</button></div>' % (ic('back'), ic('chev'))

def foot(count, sums, sel=None, pages=True):
    s = ''.join('<span class="foot-sum">%s <b>%s</b></span>' % x for x in sums)
    main = '<div class="foot-row foot-main"><span class="num">%s</span>%s<div class="end">%s</div></div>' % (count, s, pager_btns() if pages else '')
    if not sel:
        return '<div class="table-foot">%s</div>' % main
    n, ssum, acts, extra = sel
    ss = ''.join('<span class="foot-sum">%s <b>%s</b></span>' % x for x in ssum)
    row = ('<div class="foot-row foot-sel bk-sel" role="region" aria-label="Selection"><span><b>%d</b> selected</span>%s'
           '<div class="btn-group" role="group" aria-label="Do with the selection">%s</div><div class="end">%s<span class="kbd">Esc</span><button class="btn btn-quiet">%sClear</button></div></div>') % (n, ss, acts, extra, ic('x'))
    return '<div class="table-foot" data-selected="true">%s%s</div>' % (row, main)

def list_body(find, tab_html, tools, table_html, foot_html, label, above='', overlay=''):
    return ('<div class="bk">%s%s%s%s<div class="table-shell" style="position:relative"><div class="table-scroll" tabindex="0" aria-label="%s">%s</div>%s%s</div></div>') % (
        find, tab_html, tools, above, label, table_html, foot_html, overlay)

def tools(find, chips, count, right=None):
    return ws_tools(find, chips, count, right)

def board(name, title, body, w=1440, h=900):
    write(ROOT, name, 'Books · ' + title, body, w, h, CSS)
    return name

CSS += '''
.mny{display:grid;grid-template-columns:minmax(0,1fr) 344px;flex:1;min-height:0}.mny-main{padding-bottom:var(--space-48);min-width:0}.mny-side{box-shadow:inset 1px 0 0 var(--color-line)}
.share{grid-template-columns:24px minmax(0,1fr) 48px 112px;gap:var(--space-12)}
.nt{display:grid;place-items:center;width:24px;height:24px;flex:none;color:var(--color-muted)}.nt .ic{width:20px;height:20px}
.need{display:flex;align-items:center;gap:var(--space-12);min-height:64px}.need .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.need .lead{color:var(--color-ink);font-weight:500}.need .d{font-size:var(--text-13);color:var(--color-ink-2)}.need .a{flex:none}
.bk-strip{padding:16px 24px 0}
.bk-strip .kt-n{color:var(--color-muted);white-space:normal;line-height:1.4}
'''


# ---------- Money ----------
def share_rows(items):
    top = max(v for _, _, _, v in items)
    out = ''
    for icon, name, sub, v in items:
        pct = int((v / sum(x[3] for x in items) * 100).quantize(Decimal('1'), ROUND_HALF_UP))
        out += ('<div class="share"><span class="nt">%s</span><span style="display:flex;align-items:center;gap:var(--space-12);min-width:0">'
                '<span style="width:320px;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="color:var(--color-ink)">%s</span> <span class="muted" style="font-size:var(--text-13)">%s</span></span>'
                '<span class="grow"><span class="bar" style="display:block;width:%.1f%%"></span></span></span><span class="num pct">%d%%</span><span class="num">%s</span></div>') % (
            ic(icon), name, sub, float(v / top * 100), pct, usd(v))
    return '<div style="padding:0 var(--space-24)">%s</div>' % out

def need(icon, lead, d, act):
    return '<div class="row need"><span class="nt">%s</span><div class="t"><span class="lead">%s</span><span class="d">%s</span></div><div class="a">%s</div></div>' % (ic(icon), lead, d, act)

def tax_strip():
    tiles = (('VAT, October so far', usd(VAT_OCT), 'Return by 10 Nov, pay by 15 Nov'),
             ('PAYE, October', 'After 25 Oct', 'From the pay run. Pay by 10 Nov'),
             ('30% withholding', usd(WHT), 'If Mutare Timber Works is paid. By 10 Nov'),
             ('Provisional tax, 4th', usd(3150), '35% of the year, 20 Dec · to confirm'))
    t = ''.join('<div class="kt"><span class="kt-l">%s</span><span class="kt-v">%s</span><span class="kt-n">%s</span></div>' % x for x in tiles)
    return '<div class="bk-strip" aria-label="Tax due"><div class="kstrip" style="grid-template-columns:repeat(4,minmax(0,1fr))">%s</div></div>' % t

def money():
    acts = ('<div class="btn-group" role="group" aria-label="Record">%s%s<button class="btn">%sRecord spending%s</button></div>' % (
        btn('Payment received', 'payments'), btn('Pay a bill', 'bank'), ic('expenses'), ic('down'))) + primary('New invoice', 'plus', 'N')
    find = finding('<span class="num">%s</span> has come in this month and <span class="num">%s</span> has gone out.' % (usd(MONEY_IN), usd(MONEY_OUT)),
                   '<span class="num">%s</span> is owed to you, <span class="num">%s</span> of it overdue. You owe suppliers <span class="num">%s</span>, and VAT of <span class="num">%s</span> is due by 15 Nov.' % (
                       usd(OWED), usd(OVERDUE), usd(TO_PAY), usd(VAT_OCT)))
    approvals = REQ_FOR_ME_SUM + M(23) + NET_PAY
    needs = ''.join((
        need('hand', '4 things to approve', '2 requisitions, 1 claim and a payment to Mutare Timber Works: %s in all.' % usd(approvals), btn('Review', 'eye')),
        need('fiscal', 'INV-0144 is not signed by FDMS', 'Westgate Interiors, %s. The device was offline on Friday at 16:02.' % zig(13500), btn('Retry', 'undo')),
        need('warn', 'A goods receipt did not post', 'GRN-0045 from Tile Trader Zimbabwe, %s: no stock account for skirting and trims.' % usd(BN_NET), btn('Fix it', 'posting')),
        need('bank', '4 bank lines to match', 'CBZ, USD, since Wednesday. Vane has matched 3 of them.', btn('Match', 'check')),
        need('store', '2 suppliers have no valid ITF263', 'Mutare Timber Works (expired 30 Jun) and Rapid Freight Harare. Paying them over US$1,000 a year withholds 30%.', btn('Ask for it', 'send')),
        need('invoice', '3 invoices are overdue', '%s in all. Chisipite Dental is 12 days late.' % usd(OVERDUE), btn('Remind', 'whatsapp')),
        need('calendar', 'Next tax date: 5 Nov', 'The PAYE return and the 30% withholding return for October.', btn("What's due", 'chev')),
    ))
    came = share_rows((('showroom', 'Showroom tills', '641 sales', TILLS), ('invoice', 'Payments on invoices', '%d payments' % sum(1 for r in OCT_RCT if r[5] == 'On an invoice'), IN_INVOICES),
                       ('payments', 'Deposits, on account', '2 payments', ON_ACCOUNT)))
    went = share_rows((('docs', 'Bills', '3 suppliers paid', OUT_BILLS), ('vat', 'VAT and bank charges', 'September VAT, IMTT', OUT_OTHER),
                       ('person', 'Payroll', 'PAYE and NSSA for September', OUT_PAYROLL), ('hand', 'Requisitions', '3 paid out, less change', REQ_OUT),
                       ('takings', 'Claims and petty cash', '1 claim, 7 vouchers', CLAIMS_OUT), ('expenses', 'Till payouts', '2 payouts', PAYOUTS_OUT)))
    rows = []
    for name, kind, cur, bal, rec in ACCOUNTS:
        rows.append(('<span class="cell-lead">%s</span>' % name, '<span class="muted">%s</span>' % kind, fmt(bal) if cur == 'USD' else '', fmt(bal) if cur == 'ZWG' else '', '<span class="muted">%s</span>' % rec))
    bank = '<div style="margin:0 24px;border-radius:10px;box-shadow:var(--shadow-ring);overflow:hidden">%s</div>' % grid(
        ('Account', 'Kind', 'US$', 'ZiG', 'Reconciled'), rows, num=(2, 3), total=('In all', '', fmt(CASH_USD), fmt(CASH_ZIG), ''), label='Bank and cash')
    bank_note = '<p class="bk-note">%s<span><b style="font-weight:600;color:var(--color-ink)">%s</b> in all, with ZiG at <span class="mono">27.00</span> to US$1 (RBZ interbank, today 06:00).</span></p>' % (ic('bank'), usd(CASH_BASE))
    main = ('<div class="mny-main">%s%s<section aria-labelledby="m1">%s<div class="list">%s</div></section>'
            '<section aria-labelledby="m2">%s%s</section><section aria-labelledby="m3">%s%s</section>'
            '<section aria-labelledby="m4">%s%s%s</section></div>') % (
        find, tax_strip(), group_head('Needs you', 7, 'm1'), needs,
        group_head('Where it came from', '1 to 18 October · %s' % usd(MONEY_IN), 'm2'), came,
        group_head('Where it went', '1 to 18 October · %s' % usd(MONEY_OUT), 'm3'), went,
        group_head('Bank and cash', '6 accounts', 'm4'), bank, bank_note)
    side = ('<aside class="rail mny-side" aria-label="Position">'
            '<section><div class="sec-title">Owed to you</div><div class="figure">%s</div><dl class="attrs"><dt>Not yet due</dt><dd class="num">%s</dd><dt>1 to 30 days late</dt><dd class="num">%s</dd><dt>Over 30 days</dt><dd class="num">US$0.00</dd><dt>On account</dt><dd class="num">%s</dd></dl></section>'
            '<section><div class="sec-title">You owe</div><div class="figure">%s</div><dl class="attrs"><dt>Suppliers</dt><dd class="num">%s, 5 bills</dd><dt>Due by Sunday</dt><dd class="num">%s</dd><dt>Staff claims</dt><dd class="num">US$36.00</dd><dt>VAT, October</dt><dd class="num">%s</dd></dl></section>'
            '<section><div class="sec-title">With staff</div><dl class="attrs"><dt>Simba Gondo</dt><dd class="num">US$95.00, since 14 Oct</dd><dt>To pay out</dt><dd class="num">US$45.00, Farai Ncube</dd></dl><span class="bk-hint">Paid out on requisitions and not yet accounted for with slips.</span></section>'
            '<section><div class="sec-title">Rate today</div><dl class="attrs"><dt>ZiG to US$1</dt><dd class="num">27.00</dd><dt>From</dt><dd>RBZ interbank, 06:00</dd></dl></section>'
            '</aside>') % (usd(OWED), usd(OWED - OVERDUE), usd(OVERDUE), usd(ON_ACCOUNT), usd(TO_PAY + M(36) + VAT_OCT), usd(TO_PAY), usd(DUE_WEEK_SUM), usd(VAT_OCT))
    body = page('Money', 'Money', 'money', acts, '<div class="mny">%s%s</div>' % (main, side))
    return board('BkMoney', 'Money', body, h=1880)


# ---------- Sales: invoices ----------
def inv_rows(rows, money_col=True):
    out = []
    for no, cus, state, when, base, bal, fis, cur in rows:
        out.append((draft_no() if no == 'Draft' else ref(no), '<span class="cell-lead">%s</span>' % cus, st(state), '<span class="muted">%s</span>' % when,
                    st(fis) if fis != '—' else '<span class="muted">—</span>',
                    zig(cur[1]) if cur else usd(base),
                    '<span style="color:var(--color-ink);font-weight:500">%s</span>' % usd(bal) if bal else '<span class="muted">—</span>'))
    return out

INV_SHOWN = [r for r in INV if r[0] not in ('INV-0136', 'INV-0138')]
INV_HEAD = ('Invoice', 'Customer', 'State', 'When', 'FDMS', 'Total', 'Balance')
INV_W = ('120px', None, '120px', '220px', '110px', '150px', '130px')

def invoices():
    acts = btn('Statements', 'print') + primary('New invoice', 'plus', 'N')
    find = finding('<span class="num">%s</span> is owed to you on %d invoices.' % (usd(OWED), OWED_N), '%d are overdue, <span class="num">%s</span> in all.' % (len(OVERDUE_ROWS), usd(OVERDUE)))
    t = tools('Search invoices', (('Customer', 'Any', False), ('Currency', 'Any', False)), '12 of %d' % INV_ALL)
    table = grid(INV_HEAD, inv_rows(INV_SHOWN), num=(5, 6), sel=set(), label='Invoices', widths=INV_W)
    f = foot('1 to 12 of %d' % INV_ALL, (('Owed', usd(OWED)), ('Overdue', usd(OVERDUE)), ('Drafts', usd(DRAFTS))))
    body = page('Invoices', 'Invoices', 'invoice', acts, list_body(find, tabs(INV_TABS, 'All', 'Invoice views'), t, table, f, 'Invoices'))
    return board('BkInvoices', 'Invoices', body)

def invoices_bulk():
    acts = btn('Statements', 'print') + primary('New invoice', 'plus', 'N')
    find = finding('<span class="num">%s</span> is owed to you on %d invoices.' % (usd(OWED), OWED_N), '%d are overdue, <span class="num">%s</span> in all.' % (len(OVERDUE_ROWS), usd(OVERDUE)))
    t = tools('Search invoices', (('Customer', 'Any', False), ('Currency', 'Any', False)), '12 of %d' % INV_ALL)
    picked = {i for i, r in enumerate(INV_SHOWN) if r[2] in ('Draft', 'Overdue')}
    table = grid(INV_HEAD, inv_rows(INV_SHOWN), num=(5, 6), sel=picked, label='Invoices', widths=INV_W)
    total_sel = sum((INV_SHOWN[i][4] for i in picked), Decimal('0'))
    more = menu((('label', 'Rights are checked row by row'),
                 ('export', 'Export 5 rows', 'CSV or XLSX', False, False),
                 'sep',
                 ('undo', 'Void 3 invoices…', 'Each through a full credit note, signed by FDMS. One reason for all. Drafts are skipped.', True, False),
                 ('trash', 'Delete 2 drafts', 'Drafts have no number, so nothing is lost', True, False),
                 ('trash', 'Delete permanently…', 'All 3 issued rows would be skipped: signed by FDMS. Void them instead.', True, True)),
                'position:absolute;right:228px;bottom:100px;width:340px;z-index:30')
    acts_sel = btn('Send reminders', 'whatsapp') + btn('Print statements', 'print') + btn('Issue 2 drafts', 'send') + '<button class="btn" aria-expanded="true" style="background:var(--color-pressed)">%sMore%s</button>' % (ic('more'), ic('down'))
    f = foot('1 to 12 of %d' % INV_ALL, (('Owed', usd(OWED)), ('Overdue', usd(OVERDUE)), ('Drafts', usd(DRAFTS))),
             sel=(len(picked), (('Total', usd(total_sel)), ('Owing', usd(OVERDUE))), acts_sel, ''))
    body = page('Invoices', 'Invoices', 'invoice', acts, list_body(find, tabs(INV_TABS, 'All', 'Invoice views'), t, table, f, 'Invoices', overlay=more))
    return board('BkInvoicesBulk', 'Invoices, with a selection', body, h=960)


# ---------- Sales: quotes, payments received, credit notes, customers ----------
def quotes():
    acts = primary('New quote', 'plus', 'N')
    exp = [q for q in QT if q[0] == 'QT-0402'][0]
    find = finding('%d quotes worth <span class="num">%s</span> are with customers.' % (len(QT), usd(SENT)),
                   "Ridgeview Apartments' <span class=\"num\">%s</span> runs out on Saturday 24 Oct. 3 accepted quotes have no invoice yet." % usd(exp[6]))
    t = tools('Search quotes', (('Customer', 'Any', False), ('Rep', 'Any', False)), '%d quotes' % len(QT))
    rows = [(ref(no), '<span class="cell-lead">%s</span>' % cus, '<span class="cell-lead">%s</span>' % what, '<span class="muted">%s</span>' % sent,
             ('<span style="color:var(--color-ink);font-weight:500">%s</span>' % valid) if no == 'QT-0402' else valid, '<span class="muted">%s</span>' % read,
             zig(cur[1]) if cur else usd(base), btn('Mark accepted', None, 'btn btn-sm'))
            for no, cus, what, state, sent, valid, base, cur, read in QT]
    table = grid(('Quote', 'Customer', 'For', 'Sent', 'Valid until', 'On WhatsApp', 'Amount', ''), rows, num=(6,), sel=set(), label='Quotes',
                 widths=('96px', '190px', None, '104px', '96px', '110px', '130px', '140px'), fill=2)
    f = foot('1 to %d of %d' % (len(QT), len(QT)), (('With customers', usd(SENT)), ('In ZiG', zig(44820))))
    tab = tabs((('Draft', 1), ('Sent', len(QT)), ('Accepted', 3), ('Expired', 1), ('Void', 1)), 'Sent', 'Quote views')
    body = page('Quotes', 'Quotes', 'docs', acts, list_body(find, tab, t, table, f, 'Quotes'))
    return board('BkQuotes', 'Quotes', body)


def payments_in():
    acts = btn('Match bank lines', 'match') + primary('Record a payment', 'plus', 'N')
    n_oct = len(OCT_RCT)
    find = finding('<span class="num">%s</span> has come in on %d payments this month.' % (usd(IN_INVOICES + ON_ACCOUNT), n_oct),
                   "<span class=\"num\">%s</span> is on account and on no invoice yet: Mandara Medical Centre's deposit and Mrs R. Chuma's." % usd(ON_ACCOUNT))
    t = tools('Search payments', (('Customer', 'Any', False), ('Into', 'Any account', False)), '412 payments')
    rows = []
    for no, date, cus, on, into, state, bank, base, cur in RCT:
        on_html = ref(on) if on.startswith('INV') else '<span class="muted">%s</span>' % on
        rows.append((ref(no), '<span class="muted">%s</span>' % date, '<span class="cell-lead">%s</span>' % cus, on_html, into, st(state),
                     st(bank) if bank != '—' else '<span class="muted">—</span>',
                     ('<span class="muted" style="text-decoration:line-through">%s</span>' % usd(base)) if state == 'Void' else amount(base, cur)))
    table = grid(('Payment', 'Date', 'Customer', 'Paid', 'Into', 'State', 'Bank line', 'Amount'), rows, num=(7,), sel=set(), label='Payments received',
                 widths=('104px', '72px', '190px', None, '140px', '120px', '100px', '170px'), fill=3)
    f = foot('1 to %d of 412' % len(RCT), (('October', usd(IN_INVOICES + ON_ACCOUNT)), ('On account', usd(ON_ACCOUNT))))
    tab = tabs((('All', 412), ('On an invoice', 398), ('On account', 2), ('Void', 12)), 'All', 'Payment views')
    body = page('Payments received', 'Payments received', 'payments', acts, list_body(find, tab, t, table, f, 'Payments received'))
    return board('BkPaymentsIn', 'Payments received', body)


def credit_notes():
    acts = btn('Write off a debt', 'block') + primary('New credit note', 'plus', 'N')
    n = sum(1 for c in CN if c[1].endswith('Oct') and c[6] != 'Draft')
    find = finding('<span class="num">%s</span> was credited this month on %d credit notes.' % (usd(CN_OCT), n),
                   "All are signed by FDMS, so each is corrected only by a new invoice. Greystone Park Primary's credit is still a draft.")
    t = tools('Search credit notes', (('Customer', 'Any', False), ('Reason', 'Any', False)), '%d credit notes' % len(CN))
    rows = []
    for no, date, cus, inv, why, fis, state, amt in CN:
        rows.append((draft_no() if no == 'Draft' else ref(no), '<span class="muted">%s</span>' % date, '<span class="cell-lead">%s</span>' % cus, ref(inv),
                     '<span class="cell-lead">%s</span>' % why, st(fis) if fis != '—' else '<span class="muted">—</span>', st(state), usd(amt)))
    table = grid(('Credit note', 'Date', 'Customer', 'Invoice', 'Reason', 'FDMS', 'State', 'Amount'), rows, num=(7,), sel=set(), label='Credit notes',
                 widths=('120px', '80px', '200px', '104px', None, '100px', '110px', '130px'), fill=4)
    f = foot('1 to %d of 9' % len(CN), (('October', usd(CN_OCT)), ('Draft', usd(180))))
    tab = tabs((('Credit notes', 9), ('Write-offs', 3)), 'Credit notes', 'Credit note views')
    body = page('Credit notes', 'Credit notes', 'docs', acts, list_body(find, tab, t, table, f, 'Credit notes'))
    return board('BkCreditNotes', 'Credit notes', body)


def customers():
    acts = btn('Send statements', 'send') + primary('New customer', 'plus', 'N')
    owing = [c for c in CUS if c[4]]
    late = [c for c in CUS if c[5]]
    find = finding('%d customers owe you <span class="num">%s</span>.' % (len(owing), usd(OWED)),
                   '%d are late, <span class="num">%s</span> in all. 2 have <span class="num">%s</span> on account.' % (len(late), usd(OVERDUE), usd(ON_ACCOUNT)))
    t = tools('Search customers', (('Rep', 'Any', False), ('Currency', 'Any', False)), '%d of 58' % len(CUS))
    def cell(v, strong=False):
        if not v:
            return '<span class="muted">—</span>'
        return '<span style="color:var(--color-ink);font-weight:500">%s</span>' % usd(v) if strong else usd(v)
    rows = [('<span class="cell-lead">%s</span>' % n, '<span class="muted">%s</span>' % c, '<span class="muted">%s</span>' % v, str(o) if o else '<span class="muted">—</span>',
             cell(ow), cell(od, True), cell(oa), '<span class="muted">%s</span>' % lp) for n, c, v, o, ow, od, oa, lp in CUS]
    table = grid(('Customer', 'Accounts contact', 'VAT number', 'Open', 'Owes', 'Overdue', 'On account', 'Last paid'), rows, num=(3, 4, 5, 6), sel=set(),
                 label='Customers', widths=(None, '180px', '120px', '72px', '130px', '130px', '130px', '104px'))
    f = foot('1 to %d of 58' % len(CUS), (('Owed', usd(OWED)), ('Overdue', usd(OVERDUE)), ('On account', usd(ON_ACCOUNT))))
    tab = tabs((('All', 58), ('Owing', len(owing)), ('By age', None), ('On account', 2)), 'All', 'Customer views')
    body = page('Customers', 'Customers', 'users', acts, list_body(find, tab, t, table, f, 'Customers'))
    return board('BkCustomers', 'Customers', body)


# ---------- Bills & spending: lists ----------
def spending_rows():
    """Every money-out document this month, from every module (the core's money-out view)."""
    p = {x[0]: x for x in PAY}
    rows = [
        ('14 Oct', 'VAT, September', 'Books', 'Other', 'CBZ, USD', 'PAY-0061', p['PAY-0061'][7], None),
        ('14 Oct', 'Floor sander hire, Highlands Guest Lodge', 'CRM', 'Requisitions', 'Showroom cash box', 'REQ-0089', M(95), None),
        ('12 Oct', 'Cleaning supplies, showroom', 'Retail', 'Requisitions', 'Showroom cash box', 'REQ-0090', M(42), None),
        ('11 Oct', 'Till 1 payout: Saturday cleaner', 'Retail', 'Till payouts', 'Till 1', 'PO-T1-0311', M(24), None),
        ('10 Oct', 'PAYE and AIDS levy, September', 'Payroll', 'Payroll', 'CBZ, USD', 'PAY-0059', p['PAY-0059'][7], None),
        ('10 Oct', 'NSSA, September', 'Payroll', 'Payroll', 'CBZ, ZiG', 'PAY-0060', p['PAY-0060'][7], p['PAY-0060'][8]),
        ('9 Oct', 'Tile Trader Zimbabwe, BILL-0216', 'Books', 'Bills', 'CBZ, USD', 'PAY-0058', p['PAY-0058'][7], None),
        ('9 Oct', 'Fuel and materials, Pomona Offices', 'CRM', 'Requisitions', 'Showroom cash box', 'REQ-0088', REQ88_SPENT, None),
        ('8 Oct', 'Grout, Bhola Hardware', 'CRM', 'Claims & petty cash', 'Showroom cash box', 'CLM-0012', M('14.50'), None),
        ('6 Oct', 'Till 2 payout: fuel for the van', 'Retail', 'Till payouts', 'Till 2', 'PO-T2-0298', M(40), None),
        ('5 Oct', 'Halsted Builders, BILL-0219', 'Books', 'Bills', 'CBZ, USD', 'PAY-0057', p['PAY-0057'][7], None),
        ('1 Oct', 'Kingsway Property, rent October', 'Books', 'Bills', 'CBZ, USD', 'PAY-0056', p['PAY-0056'][7], None),
        ('Oct', 'Showroom petty cash, 5 vouchers', 'Books', 'Claims & petty cash', 'Showroom petty cash', 'PCV-0031 to 0035', FLOATS[0][2] - FLOATS[0][3], None),
        ('Oct', 'Site float, 2 vouchers', 'CRM', 'Claims & petty cash', 'Site float', 'PCV-0036, 0037', FLOATS[1][2] - FLOATS[1][3], None),
        ('Oct', 'Bank charges and IMTT, 7 lines', 'Books', 'Other', 'CBZ', 'Bank entries', BANK_FEES, None),
    ]
    return rows

SP_HEAD = ('Date', 'What', 'From', 'Kind', 'Paid from', 'Document', 'Amount')

def spending():
    rows = spending_rows()
    total = sum((r[6] for r in rows), Decimal('0'))
    assert total == MONEY_OUT, (total, MONEY_OUT)
    rec = ('<div style="position:relative"><button class="btn btn-primary" aria-expanded="true">%sRecord spending%s%s</button>%s</div>') % (
        ic('plus'), kbd('N', True), ic('down'),
        menu((('docs', 'Bill', 'A supplier’s invoice', False, False), ('takings', 'Claim', 'Money someone spent from their own pocket', False, False),
              ('expenses', 'Petty cash voucher', 'Spent from a float', False, False), ('hand', 'Requisition', 'Ask for money before spending it', False, False)),
             'position:absolute;right:0;top:40px;width:300px;z-index:30'))
    find = finding('<span class="num">%s</span> has gone out this month, from 5 modules.' % usd(MONEY_OUT),
                   'Bills are the most, <span class="num">%s</span>. <span class="num">%s</span> given out on requisitions is with staff until slips come back.' % (usd(OUT_BILLS), usd(M(95))))
    t = tools('Search spending', (('From', 'Any module', False), ('Paid from', 'Any', False)), '%d this month' % len(rows))
    body_rows = [('<span class="muted">%s</span>' % d, '<span class="cell-lead">%s</span>' % w, '<span class="muted">%s</span>' % src, k, acc,
                  ref(doc) if not doc.startswith('Bank') else '<span class="muted">%s</span>' % doc, amount(v, cur)) for d, w, src, k, acc, doc, v, cur in rows]
    table = grid(SP_HEAD, body_rows, num=(6,), label='All spending', widths=('72px', None, '72px', '150px', '150px', '150px', '170px'), fill=1)
    by = {}
    for r in rows:
        by[r[3]] = by.get(r[3], 0) + 1
    tab = tabs((('All', len(rows)), ('Bills', by['Bills']), ('Requisitions', by['Requisitions']), ('Claims & petty cash', by['Claims & petty cash']),
                ('Till payouts', by['Till payouts']), ('Payroll', by['Payroll']), ('Other', by['Other'])), 'All', 'Spending views')
    f = foot('%d in October' % len(rows), (('Gone out', usd(MONEY_OUT)), ('Bills', usd(OUT_BILLS)), ('Payroll', usd(OUT_PAYROLL))), pages=False)
    body = page('All spending', 'All spending', 'expenses', rec, list_body(find, tab, t, table, f, 'All spending'))
    return board('BkSpending', 'All spending', body, h=1040)


def bills():
    acts = btn('From a goods receipt', 'list') + primary('New bill', 'plus', 'N')
    late = [b for b in BILLS if b[7] == 'Overdue']
    unchecked = [b for b in BILLS if b[4] == 'Not checked']
    find = finding('You owe <span class="num">%s</span> on %d bills; <span class="num">%s</span> of it is due by Sunday.' % (usd(TO_PAY), len(BILLS), usd(DUE_WEEK_SUM)),
                   "Mutare Timber Works' bill is 2 days late. %d supplier invoices are not checked on FDMS yet, so their VAT is not claimed." % len(unchecked))
    t = tools('Search bills', (('Supplier', 'Any', False), ('FDMS', 'Any', False)), '%d to pay' % len(BILLS))
    rows = [(ref(no), '<span style="color:var(--color-ink)">%s</span> <span class="muted" style="font-size:13px">· %s</span>' % (sup, what), '<span class="mono" style="font-size:13px">%s</span>' % fti, st(fd),
             '<span class="muted">%s</span>' % m if m == '—' else m.replace('PO', '<span class="ref">PO').replace(' · ', '</span> · <span class="ref">') + '</span>',
             st('Overdue', due) if state == 'Overdue' else '<span class="muted">%s</span>' % due,
             '<span style="color:var(--color-ink);font-weight:500">%s</span>' % usd(tot)) for no, sup, what, fti, fd, m, due, state, tot in BILLS]
    table = grid(('Bill', 'Supplier', 'Their invoice', 'FDMS', 'Matches', 'Due', 'Balance'), rows, num=(6,), sel={4}, label='Bills')
    sel = (1, (('Owing', usd(B220_TOT)),), btn('Pay', 'payments') + btn('Approve', 'check') + btn('Export', 'export') + '<button class="btn">%sMore%s</button>' % (ic('more'), ic('down')), '')
    f = foot('1 to %d of %d' % (len(BILLS), len(BILLS)), (('To pay', usd(TO_PAY)), ('Overdue', usd(BILL_OVERDUE)), ('Due by Sunday', usd(DUE_WEEK_SUM))), sel=sel)
    tab = tabs((('To pay', len(BILLS)), ('Overdue', len(late)), ('Paid', 214), ('Drafts', 1), ('Debit notes', 4), ('Void', 2)), 'To pay', 'Bill views')
    body = page('Bills', 'Bills', 'docs', acts, list_body(find, tab, t, table, f, 'Bills'))
    return board('BkBills', 'Bills', body)


def payments_out():
    acts = primary('Pay suppliers', 'plus', 'N')
    find = finding('<span class="num">%s</span> was paid to suppliers, ZIMRA and NSSA this month.' % usd(PAID_OUT),
                   'One payment waits for your approval: <span class="num">%s</span> to Mutare Timber Works, with <span class="num">%s</span> withheld.' % (usd(NET_PAY), usd(WHT)))
    t = tools('Search payments', (('Paid to', 'Anyone', False), ('From', 'Any account', False)), '%d payments' % len(PAY))
    rows = []
    for no, date, to, for_, frm, wht, state, base, cur in PAY:
        f_ = ref(for_) if for_.startswith('BILL') and ',' not in for_ else '<span class="cell-lead">%s</span>' % for_
        rows.append((ref(no), '<span class="muted">%s</span>' % date, '<span class="cell-lead">%s</span>' % to, f_, frm,
                     usd(wht) if wht else '<span class="muted">—</span>',
                     '<span class="muted">%s</span>' % (zig(imtt(base, cur)) if cur else usd(imtt(base))) if state == 'Paid' else ('<span class="muted">%s</span>' % usd(IMTT_NEW) if state == 'To approve' else '<span class="muted">—</span>'),
                     st(state),
                     ('<span class="muted" style="text-decoration:line-through">%s</span>' % usd(base)) if state == 'Void' else amount(base, cur)))
    table = grid(('Payment', 'Date', 'Paid to', 'For', 'From', 'Withheld', 'IMTT', 'State', 'Amount'), rows, num=(5, 6, 8), sel=set(), label='Payments made',
                 widths=('104px', '72px', '172px', None, '96px', '96px', '96px', '110px', '210px'), fill=3, fixed=True)
    f = foot('1 to %d of 318' % len(PAY), (('Paid in October', usd(PAID_OUT)), ('IMTT', usd(IMTT_OCT_USD + to_usd(IMTT_OCT_ZIG))), ('To approve', usd(NET_PAY))))
    tab = tabs((('All', 318), ('To approve', 1), ('Paid', 311), ('Void', 6)), 'All', 'Payment views')
    body = page('Payments made', 'Payments made', 'payments', acts, list_body(find, tab, t, table, f, 'Payments made'))
    return board('BkPaymentsOut', 'Payments made', body)


PO = [
    ('PO-0038', 'Mutare Timber Works', 'Ridgeview Apartments', 'REQ-0086', '17 Oct', '30 Oct', 0, M(2400)),
    ('PO-0037', 'Tile Trader Zimbabwe', 'Showroom stock', '—', '17 Oct', '21 Oct', 0, M(96)),
    ('PO-0036', 'Carpet Mills Africa', 'Mandara Medical Centre', '—', '16 Oct', '28 Oct', 0, M(1980)),
    ('PO-0034', 'Halsted Builders', 'Showroom stock', '—', '15 Oct', '20 Oct', 0, M(486)),
]
def orders():
    on_order = sum((p[7] for p in PO), Decimal('0'))
    acts = primary('New order', 'plus', 'N')
    find = finding('<span class="num">%s</span> is on order and not yet received.' % usd(on_order),
                   'Halsted Builders is due on Tuesday. PO-0035, <span class="num">%s</span> of vinyl for Borrowdale Brooke Clinic, waits for your approval.' % usd(2960))
    t = tools('Search orders', (('Supplier', 'Any', False), ('For', 'Any job', False)), '%d sent' % len(PO))
    rows = [(ref(no), '<span class="cell-lead">%s</span>' % sup, '<span class="cell-lead">%s</span>' % for_, ref(req) if req != '—' else '<span class="muted">—</span>',
             '<span class="muted">%s</span>' % sent, exp, '<span style="display:flex;align-items:center;gap:8px"><span class="meter" style="width:56px"><i style="width:%d%%"></i></span><span class="muted">%d%%</span></span>' % (rc, rc),
             usd(amt)) for no, sup, for_, req, sent, exp, rc, amt in PO]
    table = grid(('Order', 'Supplier', 'For', 'Requisition', 'Sent', 'Expected', 'Received', 'Amount'), rows, num=(7,), sel=set(), label='Purchase orders',
                 widths=('104px', '200px', None, '120px', '90px', '100px', '120px', '140px'), fill=2)
    f = foot('1 to %d of %d' % (len(PO), len(PO)), (('On order', usd(on_order)),))
    tab = tabs((('Draft', 1), ('To approve', 1), ('Sent', len(PO)), ('Part received', 1), ('Received', 3), ('Closed', 26), ('Cancelled', 2)), 'Sent', 'Order views')
    body = page('Purchase orders', 'Purchase orders', 'list', acts, list_body(find, tab, t, table, f, 'Purchase orders'))
    return board('BkOrders', 'Purchase orders', body)


def requisitions():
    acts = primary('New requisition', 'plus', 'N')
    mine = [r for r in REQ if r[5] == 'To approve']
    find = finding('%d requisitions wait for you, <span class="num">%s</span>.' % (len(REQ_FOR_ME), usd(REQ_FOR_ME_SUM)),
                   "Your own, US$120.00 for the sander repair, waits for Rudo Mapfumo. Simba Gondo's US$95.00 from 14 Oct is not accounted for yet.")
    t = tools('Search requisitions', (('From', 'CRM and retail', False), ('Asked by', 'Anyone', False)), '%d to approve' % len(mine))
    rows = []
    for no, by, src, for_, asked, state, amt, note in mine:
        own = by == 'James Nyabadza'
        act = '<span class="muted">Not yours to approve</span>' if own else '<span style="display:inline-flex;gap:6px">%s%s</span>' % (btn('Approve', 'check', 'btn btn-sm'), btn('Reject', 'x', 'btn btn-sm btn-quiet'))
        rows.append((ref(no), '<span class="cell-lead">%s</span>' % by, '<span class="pill pill-n">%s</span>' % src, '<span class="cell-lead">%s</span>' % for_,
                     '<span class="muted">%s</span>' % note, usd(amt), act))
    table = grid(('Requisition', 'Asked by', 'From', 'For', 'Approval', 'Amount', ''), rows, num=(5,), sel={0, 1, 2}, label='Requisitions',
                 widths=('120px', '150px', '84px', None, '236px', '104px', '210px'), fill=3, fixed=True)
    sel = (3, (('Total', usd(sum((r[6] for r in mine), Decimal('0')))),),
           btn('Approve 2', 'check') + btn('Reject', 'x') + btn('Export', 'export'),
           '<span class="muted" style="white-space:nowrap">REQ-0093 is yours and will be skipped</span>')
    f = foot('1 to %d of %d' % (len(mine), len(mine)), (('To approve', usd(sum((r[6] for r in mine), Decimal('0')))), ('With staff, not accounted for', usd(95))), sel=sel)
    tab = tabs((('To approve', len(mine)), ('To pay', 1), ('To account for', 1), ('Done', 64), ('All', 70)), 'To approve', 'Requisition views')
    body = page('Requisitions', 'Requisitions', 'hand', acts, list_body(find, tab, t, table, f, 'Requisitions'))
    return board('BkRequisitions', 'Requisitions', body)


def claims():
    acts = btn('New voucher', 'expenses') + primary('New claim', 'plus', 'N')
    find = finding('1 claim waits for you: Simba Gondo, <span class="num">US$23.00</span>.',
                   "Tinashe Moyo's <span class=\"num\">US$36.00</span> is approved and waits to be paid back. The showroom float has <span class=\"num\">%s</span> of <span class=\"num\">%s</span> left." % (usd(FLOATS[0][3]), usd(FLOATS[0][2])))
    t = tools('Search claims', (('Person', 'Anyone', False), ('State', 'Any', False)), '%d claims' % len(CLM))
    rows = [(ref(no), '<span class="cell-lead">%s</span>' % who, '<span class="cell-lead">%s</span>' % what, '<span class="muted">%s</span>' % d, '<span class="muted">%s</span>' % how,
             st(state, {'Submitted': 'To approve', 'Approved': 'To pay back'}.get(state, state)), usd(a),
             btn('Approve', 'check', 'btn btn-sm') if state == 'Submitted' else (btn('Pay back', 'payments', 'btn btn-sm') if state == 'Approved' else ''))
            for no, who, what, d, state, a, how in CLM]
    table = grid(('Claim', 'Person', 'For', 'Spent', 'Paid with', 'State', 'Amount', ''), rows, num=(6,), sel=set(), label='Claims',
                 widths=('104px', '160px', None, '80px', '110px', '130px', '110px', '130px'), fill=2)
    fl = ''.join('<div><span class="l">%s, %s</span><span class="v">%s <span style="font-weight:400;font-size:14px;color:var(--color-muted)">of %s</span></span><span class="s">%d vouchers since the last top-up</span></div>' % (
        n, h, usd(bal), usd(imp), nv) for n, h, imp, bal, nv in FLOATS)
    floats = '<div class="bk-figs" style="grid-template-columns:repeat(2,minmax(0,1fr));margin:16px 24px">%s</div>' % fl
    f = foot('1 to %d of 38' % len(CLM), (('To approve', usd(23)), ('To pay back', usd(36)), ('Paid in October', usd('14.50'))))
    tab = tabs((('Claims', 38), ('Floats', 2), ('Vouchers', 41)), 'Claims', 'Claim views')
    body = page('Claims & petty cash', 'Claims &amp; petty cash', 'takings', acts, list_body(find, tab, t, table, f, 'Claims', above=floats))
    return board('BkClaims', 'Claims and petty cash', body)


def suppliers():
    acts = primary('New supplier', 'plus', 'N')
    owed = [s_ for s_ in SUP if s_[4]]
    find = finding('You owe %d suppliers <span class="num">%s</span>.' % (len(owed), usd(SUP_OWED)),
                   '2 have no valid ITF263. Paying Mutare Timber Works withholds 30%%, <span class="num">%s</span> on the bill now due.' % usd(WHT))
    t = tools('Search suppliers', (('ITF263', 'Any', False),), '%d of 41' % len(SUP))
    def cell(v, strong=False):
        if not v:
            return '<span class="muted">—</span>'
        return '<span style="color:var(--color-ink);font-weight:500">%s</span>' % usd(v) if strong else usd(v)
    rows = []
    for name, (itf, until), vat, o, ow, od, ytd, wh in SUP:
        tone = {'Valid': 'Valid', 'Expired': 'Expired ITF263', 'None': 'None', 'Not needed': 'Not needed'}[itf]
        rows.append(('<span class="cell-lead">%s</span>' % name, st(tone, '%s <span class="muted" style="font-weight:400">%s</span>' % (itf, until)),
                     '<span class="muted">%s</span>' % vat, str(o) if o else '<span class="muted">—</span>', cell(ow), cell(od, True), usd(ytd), cell(wh)))
    table = grid(('Supplier', 'ITF263', 'VAT number', 'Bills', 'We owe', 'Overdue', 'Paid this year', 'Withheld'), rows, num=(3, 4, 5, 6, 7), sel=set(),
                 label='Suppliers', widths=(None, '230px', '110px', '64px', '120px', '120px', '130px', '110px'))
    f = foot('1 to %d of 41' % len(SUP), (('We owe', usd(SUP_OWED)), ('Overdue', usd(B220_TOT)), ('Withheld this year', usd(SUP_WHT))))
    tab = tabs((('All', 41), ('Owed', len(owed)), ('By age', None), ('Missing ITF263', 2), ('Write-offs', 1)), 'All', 'Supplier views')
    body = page('Suppliers', 'Suppliers', 'store', acts, list_body(find, tab, t, table, f, 'Suppliers'))
    return board('BkSuppliers', 'Suppliers', body)


# ---------- record pages ----------
def rec(on, parent, here, icon, top_right, main, rail):
    return page(on, crumb(parent, here), icon, top_right, '<div class="bk bk-rec"><div class="bk-main">%s</div><aside class="rail" aria-label="About %s">%s</aside></div>' % (main, here, rail))

def sec(title, n, inner, gid):
    return '<section aria-labelledby="%s">%s%s</section>' % (gid, group_head(title, n, gid), inner)

def boxed(inner):
    return '<div style="margin:0 24px;border-radius:10px;box-shadow:var(--shadow-ring);overflow:hidden">%s</div>' % inner

def boxed0(inner):
    return '<div style="border-radius:10px;box-shadow:var(--shadow-ring);overflow:hidden">%s</div>' % inner

def timeline(items):
    return '<ol class="bk-tl">%s</ol>' % ''.join('<li><span class="d %s"></span><span>%s</span><time>%s</time></li>' % (tone, text, when) for tone, text, when in items)

def sums(items):
    out = ''
    for k, v, cls in items:
        out += '<div class="%s"><span>%s</span><span>%s</span></div>' % (cls, k, v)
    return '<div class="bk-sums">%s</div>' % out

def line_rows(lines, money=usd, tax='VAT 15.5%'):
    return [('<span class="cell-lead">%s</span>' % item, '%s %s' % (q, u), money(p), '<span class="muted">%s</span>' % tax, money(M(q) * M(p))) for item, q, u, p in lines]

def posting(entries):
    rows = []
    for je, date, acct, dr, cr in entries:
        rows.append((ref(je) if je else '', '<span class="muted">%s</span>' % date if date else '', acct, fmt(dr) if dr else '', fmt(cr) if cr else ''))
    return boxed(grid(('Entry', 'Date', 'Account', 'Debit', 'Credit'), rows, num=(3, 4), label='Posting', widths=('120px', '80px', None, '120px', '120px')))

def undo_box(items):
    out = ''
    for icon, label, text, dis in items:
        b = '<button class="btn"%s>%s%s</button>' % (' disabled' if dis else '', ic(icon), label)
        out += '<div>%s<span>%s</span></div>' % (b, text)
    return '<div class="bk-undo">%s</div>' % out


def invoice():
    paid = M(500)
    bal = I142_TOT - paid
    top = btn('Print', 'print') + primary('Record a payment', 'payments', 'R')
    head = ('<div class="bk-head"><div class="bk-k">%s<b>Pomona Offices</b><span>Issued 6 Oct</span><span>Due 20 Oct, in 2 days</span><span>From %s</span></div>'
            '<div class="bk-title">%s <small>· %s</small></div><div class="bk-k" style="font-size:14px;color:var(--color-ink-2)">%s left to pay after %s on 8 Oct.</div></div>') % (
        pill('Part paid'), ref('QT-0386'), usd(I142_TOT), zig(I142_TOT * RATE), usd(bal), usd(paid))
    acts = '<div class="bk-acts">%s%s%s<span class="sepv"></span>%s%s%s</div>' % (
        btn('Send a reminder', 'whatsapp'), btn('Credit', 'docs'), btn('Write off', 'block'), btn('Revise', 'edit'), btn('Void', 'undo'), iconbtn('more', 'More actions', 'btn btn-icon'))
    lines = boxed(grid(('Item', 'Quantity', 'Price', 'Tax', 'Amount'), line_rows(INV142_LINES), num=(2, 4), label='Lines', widths=(None, '110px', '110px', '120px', '130px')))
    tot = sums((('Before VAT', usd(I142_NET), ''), ('VAT at 15.5%', usd(I142_VAT), ''), ('Total', usd(I142_TOT), 't'),
                ('Paid', '−' + usd(paid), ''), ('Credit notes', usd(0), ''), ('Left to pay', usd(bal), 't'),
                ('In ZiG at 27.00, for reference', zig(I142_TOT * RATE), 'm')))
    pays = boxed(grid(('Payment', 'Date', 'How', 'Bank line', 'Amount'), (
        (ref('RCT-0091'), '<span class="muted">8 Oct</span>', 'Transfer into CBZ, USD', st('Matched', 'Matched, CBZ line of 8 Oct'), usd(paid)),), num=(4,), label='Payments', widths=('120px', '80px', '220px', None, '130px')))
    credits = ('<div class="row" style="margin:0 24px;border-radius:10px;box-shadow:var(--shadow-ring);gap:16px"><span class="bk-hint" style="flex:1">No credit notes. A credit note lowers what Pomona Offices owes. It names this invoice and its reason, and FDMS signs it.</span>%s</div>' % btn('Credit', 'docs'))
    post = posting((('JE-0438', '6 Oct', '1100 Customers · Pomona Offices', I142_TOT, None), ('', '', '4000 Flooring jobs', None, I142_NET),
                    ('', '', '2200 Output VAT', None, I142_VAT),
                    ('JE-0446', '8 Oct', '1010 CBZ current, USD', paid, None), ('', '', '1100 Customers · Pomona Offices', None, paid)))
    hist = timeline((('', 'A reminder goes by WhatsApp on 20 Oct if it is still unpaid', '20 Oct'),
                     ('ok', '<b>Rudo Mapfumo</b> recorded %s from the CBZ statement line as %s' % (usd(paid), ref('RCT-0091')), '8 Oct 10:14'),
                     ('in', 'Sent by WhatsApp to Mr K. Dube. Read at 10:40', '6 Oct 10:15'),
                     ('ok', 'Signed by FDMS on fiscal day 214', '6 Oct 10:14'),
                     ('in', '<b>Rudo Mapfumo</b> issued it: number INV-0142, rate fixed at 27.00, posted as %s' % ref('JE-0438'), '6 Oct 10:14'),
                     ('', '<b>Chipo Mhlanga</b> made the draft from %s' % ref('QT-0386'), '5 Oct 16:40')))
    main = head + acts + sec('Lines', '4 lines', lines + tot, 'l1') + sec('Payments', '1', pays, 'l2') + sec('Credit notes', 'None', credits, 'l3') + sec('Posting', '2 entries', post, 'l4') + sec('History', None, timeline_wrap(hist), 'l5')
    fiscal = ('<section><div class="sec-title">%s Fiscal <span class="end">%s</span></div>'
              '<div style="display:flex;gap:16px;align-items:flex-start">%s<dl class="attrs" style="grid-template-columns:minmax(0,1fr);row-gap:2px"><dt>Verification code</dt><dd class="mono">K7QX-22M4</dd><dt style="margin-top:6px">Fiscal day</dt><dd>214</dd><dt style="margin-top:6px">Signed</dt><dd>6 Oct 10:14</dd></dl></div>'
              '<dl class="attrs"><dt>Device</dt><dd>Showroom, FDMS 21874</dd><dt>Currency</dt><dd>USD</dd><dt>Buyer VAT no.</dt><dd>220087431</dd><dt>Buyer TIN</dt><dd>2000371154</dd></dl>'
              '<span class="bk-hint">Anyone can check the code at fdms.zimra.co.zw.</span></section>') % (ic('fiscal'), pill('Valid'), qr('INV-0142', 112))
    details = ('<section><div class="sec-title">Details</div><dl class="attrs"><dt>Customer</dt><dd>%s</dd><dt>Currency</dt><dd>USD, your base</dd><dt>Rate</dt><dd>27.00, fixed 6 Oct</dd>'
               '<dt>Terms</dt><dd>14 days</dd><dt>Cost centre</dt><dd>Project · Pomona Offices</dd><dt>Deal</dt><dd>Pomona Offices, 2nd floor</dd><dt>Rep</dt><dd>Chipo Mhlanga</dd></dl></section>') % ref('Pomona Offices')
    undo = ('<section><div class="sec-title">If something is wrong</div>%s</section>') % undo_box((
        ('edit', 'Revise', 'Voids this with a full credit note and issues a new invoice with a new number. The %s payment moves to it.' % usd(paid), False),
        ('undo', 'Void', 'A full credit note, signed by FDMS. The %s stays on Pomona Offices’ account.' % usd(paid), False),
        ('trash', 'Delete', 'Not allowed: FDMS has signed it. Void it instead.', True)))
    body = rec('Invoices', 'Invoices', 'INV-0142', 'invoice', top, main, fiscal + details + undo)
    return board('BkInvoice', 'INV-0142', body, h=1600)

def timeline_wrap(t):
    return '<div style="margin:0 24px;border-radius:10px;box-shadow:var(--shadow-ring)">%s</div>' % t.replace('class="bk-tl"', 'class="bk-tl" style="padding:4px 16px"')


# ---------- forms ----------
def fsec(title, text, body):
    return '<section class="form-sec"><header><h2>%s</h2><p>%s</p></header><div class="body">%s</div></section>' % (title, text, body)

def field(label, control, hint='', opt=False):
    return '<div class="field"><label>%s%s</label>%s%s</div>' % (label, ' <span class="opt">optional</span>' if opt else '', control, '<span class="bk-hint">%s</span>' % hint if hint else '')

def sel_(value, label=None):
    return '<select class="select" aria-label="%s"><option>%s</option></select>' % (label or plain(value), value)

def inp(value, label, num=False, ro=False, ph=''):
    return '<input class="input%s" aria-label="%s" value="%s"%s%s>' % (' num' if num else '', label, value, ' readonly' if ro else '', ' placeholder="%s"' % ph if ph else '')

def chk(label, on=False, hint=''):
    return '<label class="check" style="align-items:flex-start"><input type="checkbox"%s><span style="display:flex;flex-direction:column;gap:2px"><span style="color:var(--color-ink)">%s</span>%s</span></label>' % (
        ' checked' if on else '', label, '<span class="bk-hint">%s</span>' % hint if hint else '')

def seg(opts, on):
    return '<div class="seg" role="tablist" style="align-self:flex-start">%s</div>' % ''.join('<button role="tab" aria-selected="%s">%s</button>' % ('true' if o == on else 'false', o) for o in opts)

def form_page(on, parent, here, icon, top_right, sections, rail):
    return page(on, crumb(parent, here), icon, top_right, '<div class="bk bk-fm"><div class="bk-fl">%s</div><aside class="rail" aria-label="Summary">%s</aside></div>' % (''.join(sections), rail))

def wsec(title, text, body):
    return '<section class="bk-wide"><header><h2>%s</h2><p>%s</p></header>%s</section>' % (title, text, body)

def line_editor(lines, cur_label, acct=None):
    rows = ''
    for item, q, u, p in lines:
        amt = M(q) * M(p)
        rows += ('<tr><td>%s</td><td>%s</td><td>%s</td>%s<td>%s</td><td class="num" style="color:var(--color-ink)">%s</td><td>%s</td></tr>') % (
            inp(item, 'Item'), inp('%s %s' % (q, u), 'Quantity', True), inp(fmt(p), 'Price', True),
            '<td>%s</td>' % sel_(acct[item], 'Account') if acct else '', sel_('VAT 15.5%', 'Tax code'), fmt(amt), iconbtn('x', 'Remove the line'))
    head = '<tr><th>Item</th><th class="num" style="width:84px">Quantity</th><th class="num" style="width:100px">Price, %s</th>%s<th style="width:118px">Tax code</th><th class="num" style="width:104px">Amount</th><th style="width:36px"></th></tr>' % (
        cur_label, '<th style="width:136px">Account</th>' if acct else '')
    return '<table class="table bk-le" aria-label="Lines"><thead>%s</thead><tbody>%s</tbody></table>%s' % (head, rows, '<div>%s</div>' % btn('Add a line', 'plus', 'btn btn-quiet'))

def invoice_new():
    top = btn('Cancel', None, 'btn btn-quiet') + btn('Save draft', 'docs') + primary('Issue', 'send', 'I')
    cus = fsec('Customer', 'Who the invoice is to. FDMS needs their VAT number and TIN when they are registered.',
               field('Customer', sel_('Msasa Motors')) +
               '<div class="bk-box ok">%s<span><b>VAT number 220114593, TIN 2000390871.</b> Both are on file, so FDMS will accept the invoice. Made from %s, accepted on 17 Oct.</span></div>' % (ic('check'), ref('QT-0403')))
    money = fsec('Currency', 'The invoice keeps its own currency and rate. Reports show it in US$.',
                 field('Currency', seg(('USD', 'ZiG'), 'ZiG')) +
                 '<div class="field-row">%s%s</div>' % (field('Rate, ZiG to US$1', '<label class="input-wrap">%s<input aria-label="Rate" value="27.00" readonly></label>' % ic('lock')),
                                                         field('Rate from', inp('RBZ interbank, today 06:00', 'Rate from', ro=True))) +
                 '<span class="bk-hint">The rate is fixed when you press Issue. A payment at another rate later makes a gain or loss line, never a new total.</span>')
    lines = wsec('Lines', 'Each line has a tax code. Flooring and fitting are standard-rated.', line_editor(NEW_LINES, 'ZiG'))
    terms = fsec('Terms', 'When it is due and where the money is counted.',
                 '<div class="field-row">%s%s</div>' % (field('Invoice date', inp('18 Oct 2026, today', 'Invoice date', ro=True)), field('Due', sel_('In 14 days, 1 Nov', 'Due')))
                 + '<div class="field-row">%s%s</div>' % (field('Cost centre', sel_('Msasa Motors showroom', 'Cost centre'), 'The CRM project’s own'), field('Rep', sel_('Chipo Mhlanga', 'Rep'), opt=True))
                 + chk('This is a deposit', False, 'A full fiscal tax invoice for the deposit. The final invoice names it and charges the rest.')
                 + chk('Paid now', False, 'Issues the invoice and records the payment in one go. Choose the account it went into.')
                 + field('Note to the customer', '<textarea class="input" aria-label="Note to the customer">Showroom floor, 82 m², as quoted on QT-0403. Fitting from 26 Oct.</textarea>', opt=True))
    rail = ('<section><div class="sec-title">Total</div><div class="figure">%s</div><span class="muted" style="font-size:13px">%s at 27.00</span>'
            '<dl class="attrs" style="margin-top:4px"><dt>Before VAT</dt><dd class="num">%s</dd><dt>VAT at 15.5%%</dt><dd class="num">%s</dd><dt>Due</dt><dd class="num">1 Nov</dd></dl></section>'
            '<section><div class="sec-title">When you press Issue</div><ol class="steps" style="gap:10px">%s</ol></section>'
            '<section><div class="sec-title">Posts, in US$</div><dl class="attrs" style="grid-template-columns:150px minmax(0,1fr)"><dt>1100 Customers</dt><dd class="num">Dr %s</dd><dt>4000 Flooring jobs</dt><dd class="num">Cr %s</dd><dt>2200 Output VAT</dt><dd class="num">Cr %s</dd></dl></section>') % (
        zig(NEW_TOT), usd(to_usd(NEW_TOT)), zig(NEW_NET), zig(NEW_VAT),
        ''.join('<li class="step"><span class="n">%d</span><b>%s</b><span>%s</span></li>' % (i + 1, a, b) for i, (a, b) in enumerate((
            ('It gets the next number', 'INV-0145'), ('The rate is fixed', '27.00, RBZ interbank'), ('FDMS signs it', 'in ZWG, with the QR code'), ('It posts', 'and Msasa Motors owes it'), ('You can send it', 'by WhatsApp or email')))),
        usd(to_usd(NEW_TOT)), usd(to_usd(NEW_NET)), usd(to_usd(NEW_TOT) - to_usd(NEW_NET)))
    body = form_page('Invoices', 'Invoices', 'New invoice', 'invoice', top, (cus, money, lines, terms), rail)
    return board('BkInvoiceNew', 'New invoice', body, h=1330)


def payment_new():
    amt = M(1000)
    inv = M(860)
    left = amt - inv
    top = btn('Cancel', None, 'btn btn-quiet') + primary('Record the payment', 'check', 'Ctrl ↵')
    who = fsec('From', 'A payment always names its customer, even when it pays no invoice yet.',
               field('Customer', sel_('Highlands Guest Lodge')) +
               '<div class="bk-box">%s<span><b>They owe %s on 1 invoice</b>, all of it 5 days late. QT-0401 for phase 2 is with them too.</span></div>' % (ic('users'), usd(inv)))
    money = fsec('Money', 'Where it went in, and how much. The bank line it matches is found for you.',
                 '<div class="field-row">%s%s</div>' % (field('Into', sel_('CBZ current, USD', 'Into')), field('Date', inp('18 Oct 2026', 'Date')))
                 + '<div class="field-row">%s%s</div>' % (field('Currency', seg(('USD', 'ZiG'), 'USD')), field('Amount', '<label class="input-wrap"><span class="muted">US$</span><input aria-label="Amount" value="1,000.00" style="text-align:right"></label>'))
                 + field('Their reference', inp('HGL EFT 1810', 'Their reference'), opt=True)
                 + '<div class="bk-box">%s<span><b>No CBZ line for it yet:</b> the statement runs to Fri 16 Oct. When Monday’s statement comes in, Books matches this payment to its line.</span></div>' % ic('match')
                 + chk('VAT was withheld by the customer', False, 'For customers who are VAT withholding agents. They pay a third of the VAT to ZIMRA and give you a certificate.'))
    rows = ''.join((
        '<tr aria-selected="true"><td class="sel"><label class="check"><input type="checkbox" checked aria-label="Pay INV-0135"></label></td><td>%s</td><td class="muted">5 days overdue</td><td class="num">%s</td><td class="num" style="width:150px">%s</td></tr>' % (
            ref('INV-0135'), usd(inv), inp(fmt(inv), 'Amount for INV-0135', True)),
    ))
    alloc = wsec('Put it on invoices', 'Oldest first. What is left stays on their account for the next invoice.',
                 '<table class="table bk-le"><thead><tr><th class="sel" style="width:36px"></th><th>Invoice</th><th>Due</th><th class="num">Owing</th><th class="num">This payment</th></tr></thead><tbody>%s</tbody>'
                 '<tfoot><tr class="tot"><td></td><td>On their account</td><td></td><td></td><td class="num">%s</td></tr></tfoot></table>' % (rows, usd(left)))
    rail = ('<section><div class="sec-title">This payment</div><div class="figure">%s</div><dl class="attrs"><dt>On INV-0135</dt><dd class="num">%s</dd><dt>On account</dt><dd class="num">%s</dd><dt>Number</dt><dd class="num">RCT-0095</dd></dl></section>'
            '<section><div class="sec-title">After you record it</div><dl class="attrs"><dt>INV-0135</dt><dd>%s</dd><dt>Highlands owes</dt><dd class="num">US$0.00</dd><dt>Overdue, all</dt><dd class="num">%s</dd><dt>Bank line</dt><dd>Matched when it arrives</dd></dl></section>'
            '<section><div class="sec-title">Posts</div><dl class="attrs" style="grid-template-columns:150px minmax(0,1fr)"><dt>1010 CBZ current, USD</dt><dd class="num">Dr %s</dd><dt>1100 Customers</dt><dd class="num">Cr %s</dd></dl>'
            '<span class="bk-hint">The %s on account is still theirs: Books shows it on their statement and offers it on their next invoice.</span></section>') % (
        usd(amt), usd(inv), usd(left), st('Paid'), usd(OVERDUE - inv), usd(amt), usd(amt), usd(left))
    body = form_page('Payments received', 'Payments received', 'Record a payment', 'payments', top, (who, money, alloc), rail)
    return board('BkPaymentNew', 'Record a payment received', body, h=900)


def customer():
    top = btn('Send statement', 'whatsapp') + btn('Print', 'print') + primary('New invoice', 'plus', 'N')
    head = ('<div class="bk-head"><div class="bk-k"><span class="pill pill-n">Customer since Mar 2025</span><span>Mr K. Dube, accounts</span><span>+263 77 412 0981</span><span>accounts@pomonaoffices.co.zw</span></div>'
            '<div class="bk-title">Pomona Offices</div></div>')
    figs = '<div class="bk-figs" style="grid-template-columns:repeat(4,minmax(0,1fr))">%s</div>' % ''.join(
        '<div><span class="l">%s</span><span class="v">%s</span><span class="s">%s</span></div>' % x for x in (
            ('Owes', usd('1494.22'), 'INV-0142, due 20 Oct'), ('Overdue', usd(0), 'Usually pays in 12 days'), ('On account', usd(0), 'No credit held'), ('Paid this year', usd(4160), '3 payments')))
    t = tabs((('Activity', None), ('Invoices', 3), ('Payments', 3), ('Statement', None), ('Details', None)), 'Statement', 'Customer views').replace('bk-tabs', 'bk-tabs bk-rtabs')
    stmt = [
        ('1 Aug', 'Opening balance', '', None, None, M(0)),
        ('14 Aug', 'Invoice', ref('INV-0119') + ' <span class="muted">Reception, vinyl</span>', M(3420), None, M(3420)),
        ('28 Aug', 'Payment', ref('RCT-0079') + ' <span class="muted">Transfer</span>', None, M(3420), M(0)),
        ('9 Sep', 'Invoice', ref('INV-0124') + ' <span class="muted">Boardroom skirting</span>', M(240), None, M(240)),
        ('21 Sep', 'Payment', ref('RCT-0083') + ' <span class="muted">EcoCash</span>', None, M(240), M(0)),
        ('6 Oct', 'Invoice', ref('INV-0142') + ' <span class="muted">2nd floor, carpet tiles</span>', I142_TOT, None, I142_TOT),
        ('8 Oct', 'Payment', ref('RCT-0091') + ' <span class="muted">Transfer</span>', None, M(500), I142_TOT - M(500)),
    ]
    rows = [('<span class="muted">%s</span>' % d, k, '<span class="cell-lead">%s</span>' % w, fmt(a) if a else '', fmt(b) if b else '', fmt(c)) for d, k, w, a, b, c in stmt]
    table = boxed(grid(('Date', 'What', 'Document', 'Invoiced', 'Paid', 'Balance'), rows, num=(3, 4, 5), label='Statement',
                       total=('18 Oct', 'Closing balance', '', fmt(M(3420) + M(240) + I142_TOT), fmt(M(3420) + M(240) + M(500)), fmt(I142_TOT - M(500))),
                       widths=('76px', '90px', None, '100px', '100px', '100px')))
    tools_ = ('<div style="display:flex;align-items:center;gap:8px;padding:16px 24px 12px"><span class="chipsel is-set">From <b>1 Aug 2026</b>%s</span><span class="chipsel">To <b>18 Oct 2026</b>%s</span>'
              '<span class="chipsel">Currency <b>USD</b>%s</span><span style="margin-left:auto;display:flex;gap:8px">%s%s</span></div>') % (ic('down'), ic('down'), ic('down'), btn('Download PDF', 'export'), btn('Send by WhatsApp', 'whatsapp'))
    age = '<div class="bk-figs" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-top:16px">%s</div>' % ''.join(
        '<div><span class="l">%s</span><span class="v" style="font-size:16px">%s</span></div>' % x for x in (
            ('Not yet due', usd('1494.22')), ('1 to 30 days', usd(0)), ('31 to 60', usd(0)), ('61 to 90', usd(0)), ('Over 90', usd(0))))
    note = '<p class="bk-note">%s<span>One statement for everything: invoices, payments, credit notes and write-offs. The CRM and reports print the same one.</span></p>' % ic('docs')
    main = head + figs + t + tools_ + table + age + note
    rail = ('<section><div class="sec-title">Details</div><dl class="attrs"><dt>VAT number</dt><dd>220087431</dd><dt>TIN</dt><dd>2000371154</dd><dt>Address</dt><dd>Pomona Office Park, Block C, Borrowdale Road, Harare</dd>'
            '<dt>Currency</dt><dd>USD</dd><dt>Terms</dt><dd>14 days</dd><dt>Rep</dt><dd>Chipo Mhlanga</dd><dt>VAT agent</dt><dd>No, pays VAT in full</dd></dl></section>'
            '<section><div class="sec-title">Latest</div>%s</section>'
            '<section><div class="sec-title">Open quotes</div><dl class="attrs"><dt>%s</dt><dd class="num">%s, sent 13 Oct</dd></dl></section>') % (
        timeline((('in', 'QT-0399 sent, 212 m² of offices', '13 Oct'), ('ok', 'Paid %s on INV-0142' % usd(500), '8 Oct'), ('in', 'INV-0142 issued and sent', '6 Oct'))).replace('class="bk-tl"', 'class="bk-tl" style="padding:0"').replace('grid-template-columns:16px minmax(0,1fr) 110px', ''),
        ref('QT-0399'), usd(8930))
    body = rec('Customers', 'Customers', 'Pomona Offices', 'users', top, main, rail)
    return board('BkCustomer', 'Pomona Offices', body, h=920)


# ---------- Bills & spending: records and forms ----------
def bill():
    top = btn('Print', 'print') + primary('Approve the payment', 'check', 'A')
    head = ('<div class="bk-head"><div class="bk-k">%s<b>Mutare Timber Works</b><span>Their invoice %s, 9 Oct</span><span>Recorded 13 Oct</span><span>Due 16 Oct, 2 days ago</span></div>'
            '<div class="bk-title">%s</div><div class="bk-k" style="font-size:14px;color:var(--color-ink-2)">Nothing paid yet. %s is drafted and waits for your approval.</div></div>') % (
        pill('Overdue'), '<span class="mono">MTW-2291</span>', usd(B220_TOT), ref('PAY-0062'))
    acts = '<div class="bk-acts">%s%s<span class="sepv"></span>%s%s%s</div>' % (
        btn('Check on FDMS', 'fiscal'), btn('Debit note', 'docs'), btn('Revise', 'edit'), btn('Void', 'undo'), iconbtn('more', 'More actions', 'btn btn-icon'))
    fdms = ('<div style="margin:16px 24px 0" class="bk-box warn">%s<span><b>Not checked on FDMS yet.</b> The %s of VAT on it is held back from your VAT return until the invoice shows Valid on fdms.zimra.co.zw. Enter its verification code or scan its QR code.</span>%s</div>') % (
        ic('fiscal'), usd(B220_VAT), btn('Check now', None, 'btn btn-sm'))
    lines = boxed(grid(('Item', 'Quantity', 'Price', 'Tax', 'Account', 'Amount'), [r[:4] + ('<span class="muted">1200 Stock</span>',) + r[4:] for r in line_rows(B220_LINES)], num=(2, 5), label='Lines',
                       widths=(None, '96px', '96px', '100px', '110px', '120px')))
    tot = sums((('Before VAT', usd(B220_NET), ''), ('VAT at 15.5%', usd(B220_VAT), ''), ('Total', usd(B220_TOT), 't'), ('Paid', usd(0), ''), ('Left to pay', usd(B220_TOT), 't')))
    match = boxed(grid(('Item', 'Ordered, PO-0030', 'Received, GRN-0043', 'On this bill', ''), (
        ('<span class="cell-lead">Oak strip flooring, 14 mm</span>', '40 m²', '40 m², 12 Oct', '40 m²', st('Valid', 'Matches')),
        ('<span class="cell-lead">Oak skirting</span>', '30 m', '30 m, 12 Oct', '30 m', st('Valid', 'Matches')),
        ('<span class="cell-lead">Underlay</span>', '40 m²', '40 m², 12 Oct', '40 m²', st('Valid', 'Matches'))), label='Matches', widths=(None, '150px', '160px', '120px', '110px')))
    wht = ('<div style="margin:0 24px" class="bk-box warn">%s<span><b>30%% will be withheld when you pay.</b> Mutare Timber Works’ ITF263 expired on 30 Jun 2026 and they have been paid %s this year, over US$1,000. '
           'Paying this bill sends them %s and keeps %s for ZIMRA, with a certificate for them. <span class="pill pill-warn" style="height:18px;font-size:12px">To confirm</span> the US$1,000 line for 2026.</span></div>') % (
        ic('warn'), usd(MTW_PAID_YTD), usd(NET_PAY), usd(WHT))
    pays = boxed(grid(('Payment', 'Date', 'From', 'Withheld', 'State', 'Amount'), (
        (ref('PAY-0062'), '<span class="muted">18 Oct</span>', 'CBZ, USD', usd(WHT), st('To approve'), usd(NET_PAY)),), num=(3, 5), label='Payments', widths=('120px', '80px', None, '110px', '130px', '120px')))
    post = posting((('JE-0467', '12 Oct', '1200 Stock · goods receipt GRN-0043', B220_NET, None), ('', '', '2010 Goods received, not billed', None, B220_NET),
                    ('JE-0472', '13 Oct', '2010 Goods received, not billed', B220_NET, None), ('', '', '2215 Input VAT, waiting for FDMS', B220_VAT, None),
                    ('', '', '2000 You owe suppliers · Mutare Timber Works', None, B220_TOT)))
    hist = timeline((('wa', '<b>Rudo Mapfumo</b> drafted %s for %s and sent it to you to approve' % (ref('PAY-0062'), usd(NET_PAY)), '18 Oct 09:12'),
                     ('wa', 'Overdue: due on 16 Oct', '17 Oct'),
                     ('in', '<b>Rudo Mapfumo</b> recorded it from the draft, with their invoice MTW-2291', '13 Oct 11:40'),
                     ('ok', '<b>Chipo Mhlanga</b> posted goods receipt %s: 40 m² of oak counted in' % ref('GRN-0043'), '12 Oct 14:05'),
                     ('', 'Draft bill made from GRN-0043', '12 Oct 14:05')))
    main = (head + acts + fdms + sec('Lines', '3 lines', lines + tot, 'b1') + sec('Order and goods received', 'All match', match, 'b2') + sec('Withholding', None, wht, 'b3')
            + sec('Payments', '1 to approve', pays, 'b4') + sec('Posting', '2 entries', post, 'b5') + sec('History', None, timeline_wrap(hist), 'b6'))
    rail = ('<section><div class="sec-title">Their fiscal invoice</div><dl class="attrs"><dt>Number</dt><dd class="mono">MTW-2291</dd><dt>Dated</dt><dd>9 Oct 2026</dd><dt>FDMS</dt><dd>%s</dd><dt>Their VAT no.</dt><dd>220145873</dd><dt>Their TIN</dt><dd>2000418236</dd></dl>'
            '<span class="bk-hint">Required: Mutare Timber Works is VAT-registered.</span></section>'
            '<section><div class="sec-title">Details</div><dl class="attrs"><dt>Supplier</dt><dd>%s</dd><dt>Currency</dt><dd>USD</dd><dt>Terms</dt><dd>On delivery, 7 days</dd><dt>For</dt><dd>Ridgeview Apartments</dd><dt>Cost centre</dt><dd>Project · Ridgeview Apartments</dd><dt>Order</dt><dd>%s</dd><dt>Attachment</dt><dd>MTW-2291.jpg</dd></dl></section>'
            '<section><div class="sec-title">If something is wrong</div>%s</section>') % (
        st('Not checked'), ref('Mutare Timber Works'), ref('PO-0030'),
        undo_box((('edit', 'Revise', 'Voids this bill and records a new one with a new number. Use it for a wrong amount or supplier.', False),
                  ('undo', 'Void', 'Posts the mirror. What we owe Mutare Timber Works drops by %s.' % usd(B220_TOT), False),
                  ('trash', 'Delete', 'Owner only, with a reason. October is open and nothing is paid, so it is allowed; the audit trail keeps a copy.', False))))
    body = rec('Bills', 'Bills', 'BILL-0220', 'docs', top, main, rail)
    return board('BkBill', 'BILL-0220', body, h=1830)


def bill_new():
    top = btn('Cancel', None, 'btn btn-quiet') + btn('Save draft', 'docs') + primary('Record the bill', 'check', 'Ctrl ↵')
    who = fsec('Supplier', 'Who sent it, and their own fiscal invoice. Input VAT is claimed only once it shows Valid.',
               field('Supplier', sel_('Tile Trader Zimbabwe')) +
               '<div class="field-row">%s%s</div>' % (field('Their invoice number', inp('00184977', 'Their invoice number')), field('Their invoice date', inp('17 Oct 2026', 'Their invoice date')))
               + field('FDMS check', '<div style="display:flex;gap:8px"><label class="input-wrap" style="flex:1">%s<input aria-label="Verification code" value="91B4-0C7E-55A2-D013"></label>%s</div>' % (ic('fiscal'), btn('Check', None)))
               + '<div class="bk-box ok">%s<span><b>Valid on FDMS</b>, checked just now: Tile Trader Zimbabwe, 17 Oct, %s, VAT %s. The VAT counts on your October return.</span></div>' % (ic('check'), usd(BN_TOT), usd(BN_VAT)))
    src = fsec('From', 'Made from the goods receipt, so the lines are already counted in.',
               '<div class="bk-box">%s<span><b>%s, counted in on 16 Oct</b> by Tendai Sibanda: half of %s. Its own posting waits in Needs posting until skirting and trims has a stock account.</span></div>' % (ic('list'), ref('GRN-0045'), ref('PO-0033')))
    acct = {B_NEW_LINES[0][0]: '1200 Stock', B_NEW_LINES[1][0]: '1200 Stock'}
    lines = wsec('Lines', 'From GRN-0045. Change a price if their invoice differs; the difference shows on the match.', line_editor(B_NEW_LINES, 'US$', acct))
    terms = fsec('Terms', 'When you have to pay, and where it is counted.',
                 '<div class="field-row">%s%s</div>' % (field('Currency', seg(('USD', 'ZiG'), 'USD')), field('Due', sel_('In 30 days, 16 Nov', 'Due')))
                 + '<div class="field-row">%s%s</div>' % (field('Cost centre', sel_('Showroom stock', 'Cost centre')), field('Their invoice, a photo', '<button class="btn" style="justify-content:flex-start">%s00184977.jpg</button>' % ic('photo'))))
    rail = ('<section><div class="sec-title">Total</div><div class="figure">%s</div><dl class="attrs"><dt>Before VAT</dt><dd class="num">%s</dd><dt>VAT at 15.5%%</dt><dd class="num">%s</dd><dt>Due</dt><dd class="num">16 Nov</dd></dl></section>'
            '<section><div class="sec-title">Checks</div><dl class="attrs" style="grid-template-columns:120px minmax(0,1fr)"><dt>ITF263</dt><dd>%s</dd><dt>FDMS</dt><dd>%s</dd><dt>Match</dt><dd>%s</dd><dt>Approval</dt><dd>Not needed, under US$500.00</dd></dl></section>'
            '<section><div class="sec-title">Posts</div><dl class="attrs" style="grid-template-columns:150px minmax(0,1fr)"><dt>2010 Goods received, not billed</dt><dd class="num">Dr %s</dd><dt>2210 Input VAT</dt><dd class="num">Dr %s</dd><dt>2000 You owe suppliers</dt><dd class="num">Cr %s</dd></dl>'
            '<span class="bk-hint">It gets the next number, BILL-0225, when you record it.</span></section>') % (
        usd(BN_TOT), usd(BN_NET), usd(BN_VAT), st('Valid', 'Valid to 31 Dec 2026'), st('Valid'), st('Valid', 'GRN-0045 matches'), usd(BN_NET), usd(BN_VAT), usd(BN_TOT))
    body = form_page('Bills', 'Bills', 'New bill', 'docs', top, (who, src, lines, terms), rail)
    return board('BkBillNew', 'New bill', body, h=980)


def payment_out_new():
    top = btn('Cancel', None, 'btn btn-quiet') + btn('Save draft', 'docs') + primary('Send for approval', 'send', 'Ctrl ↵')
    who = fsec('Pay', 'Choose the supplier, then the bills. One payment can clear several bills.',
               field('Supplier', sel_('Mutare Timber Works')) +
               '<table class="table bk-le"><thead><tr><th class="sel" style="width:36px"></th><th>Bill</th><th>Their invoice</th><th>Due</th><th class="num">Owing</th></tr></thead><tbody>'
               '<tr aria-selected="true"><td class="sel"><label class="check"><input type="checkbox" checked aria-label="Pay BILL-0220"></label></td><td>%s</td><td class="mono" style="font-size:13px">MTW-2291</td><td>%s</td><td class="num">%s</td></tr></tbody></table>' % (
                   ref('BILL-0220'), st('Overdue', '2 days overdue'), usd(B220_TOT)))
    itf = fsec('ITF263', 'Books checks the supplier’s tax clearance before every payment.',
               '<div class="bk-box warn">%s<span><b>No valid ITF263.</b> Mutare Timber Works’ clearance expired on 30 Jun 2026. You have paid them %s this year, over US$1,000, so 30%% of this payment is withheld for ZIMRA. '
               '<span class="pill pill-warn" style="height:18px;font-size:12px">To confirm</span> the US$1,000 line for 2026.</span></div>' % (ic('warn'), usd(MTW_PAID_YTD))
               + '<div style="display:flex;gap:8px">%s%s</div>' % (btn('They sent a new one', 'upload'), btn('Ask them by WhatsApp', 'whatsapp')))
    frm = fsec('From', 'The account the money leaves. The bank takes IMTT on top.',
               '<div class="field-row">%s%s</div>' % (field('Pay from', sel_('CBZ current, USD', 'Pay from')), field('Date', inp('18 Oct 2026', 'Date')))
               + field('Reference on their statement', inp('FLOORCODE BILL-0220', 'Reference')))
    rows = (('Bill BILL-0220', usd(B220_TOT), ''), ('Withheld, 30%', '−' + usd(WHT), 'to ZIMRA by 10 Nov'), ('Paid to Mutare Timber Works', usd(NET_PAY), ''), ('IMTT, 2% (CBZ takes it)', usd(IMTT_NEW), 'a bank charge'))
    brk = wsec('What moves', 'The bill is cleared in full: part paid to them, part held for ZIMRA.',
               boxed0(grid(('', 'Amount', ''), [('<span class="cell-lead">%s</span>' % a, b, '<span class="muted">%s</span>' % c) for a, b, c in rows], num=(1,), label='What moves',
                          total=('Leaves CBZ, USD', usd(NET_PAY + IMTT_NEW), ''), widths=(None, '140px', '200px'))))
    rail = ('<section><div class="sec-title">Approval</div><div class="figure">%s</div><span class="muted" style="font-size:13px">to Mutare Timber Works, after %s withheld</span>'
            '<dl class="attrs"><dt>Approves</dt><dd>James Nyabadza, owner</dd><dt>Why</dt><dd>Over US$500.00</dd><dt>Then pays</dt><dd>Rudo Mapfumo</dd></dl>'
            '<span class="bk-hint">Nobody approves their own payment, and the person who approves does not also pay.</span></section>'
            '<section><div class="sec-title">When it is paid</div><ol class="steps" style="gap:10px">%s</ol></section>'
            '<section><div class="sec-title">Posts</div><dl class="attrs" style="grid-template-columns:150px minmax(0,1fr)"><dt>2000 You owe suppliers</dt><dd class="num">Dr %s</dd><dt>1010 CBZ current, USD</dt><dd class="num">Cr %s</dd><dt>2180 Withholding owed</dt><dd class="num">Cr %s</dd><dt>6420 Bank charges and IMTT</dt><dd class="num">Dr %s</dd><dt>1010 CBZ current, USD</dt><dd class="num">Cr %s</dd></dl></section>') % (
        usd(NET_PAY), usd(WHT),
        ''.join('<li class="step"><span class="n">%d</span><b>%s</b><span>%s</span></li>' % (i + 1, a, b) for i, (a, b) in enumerate((
            ('It gets a number', 'PAY-0062'), ('The money leaves CBZ', usd(NET_PAY + IMTT_NEW) + ' with IMTT'), ('A certificate is drafted', 'for Mutare Timber Works'), ('The withholding return', 'lists it, due 5 Nov')))),
        usd(B220_TOT), usd(NET_PAY), usd(WHT), usd(IMTT_NEW), usd(IMTT_NEW))
    body = form_page('Payments made', 'Payments made', 'New payment', 'payments', top, (who, itf, frm, brk), rail)
    return board('BkPaymentOutNew', 'Pay a supplier', body, h=980)


def requisition():
    top = btn('Print', 'print') + btn('Reopen', 'undo')
    head = ('<div class="bk-head"><div class="bk-k">%s<span class="pill pill-n">CRM</span><b>Farai Ncube</b><span>Fitter</span><span>For %s</span></div>'
            '<div class="bk-title">Fuel and materials, Pomona Offices <small>· %s</small></div></div>') % (pill('Accounted for'), ref('Pomona Offices, 2nd floor'), usd(REQ88_GIVEN))
    steps = '<div class="bk-steps">%s</div>' % ''.join('<div><b>%s%s</b><span>%s</span><span>%s</span></div>' % (ic('check'), a, b, c) for a, b, c in (
        ('Asked', '6 Oct 08:10', 'Farai Ncube, %s' % usd(REQ88_GIVEN)), ('Approved', '6 Oct 09:02', 'Rudo Mapfumo, within her limit'),
        ('Disbursed', '7 Oct 07:45', 'Chipo Mhlanga, showroom cash box'), ('Accounted for', '9 Oct 16:30', '3 slips, change back')))
    figs = '<div class="bk-figs" style="grid-template-columns:repeat(4,minmax(0,1fr))">%s</div>' % ''.join(
        '<div><span class="l">%s</span><span class="v">%s</span><span class="s">%s</span></div>' % x for x in (
            ('Given', usd(REQ88_GIVEN), 'cash, 7 Oct'), ('Spent', usd(REQ88_SPENT), '3 slips'), ('Change returned', usd(REQ88_BACK), 'into the cash box, 9 Oct'), ('With Farai now', usd(0), 'nothing to account for')))
    slips = []
    vat_total = Decimal('0')
    for where, what, cat, acct, amt, fti in REQ88_SLIPS:
        v = vat_in(amt) if fti else None
        if v:
            vat_total += v
        slips.append(('<span class="cell-lead">%s %s</span>' % (ic('photo'), where), '<span class="cell-lead">%s</span>' % what, '<span class="muted">%s</span>' % cat,
                      st('Valid') if fti else '<span class="muted">None</span>', usd(v) if v else '<span class="muted">—</span>', usd(amt)))
    table = boxed(grid(('Slip', 'What', 'Expense', 'FDMS', 'VAT', 'Amount'), slips, num=(4, 5), label='Slips', total=('3 slips', '', '', '', usd(vat_total), usd(REQ88_SPENT)),
                       widths=('160px', None, '150px', '96px', '80px', '104px')))
    change = ('<div style="margin:12px 24px 0" class="bk-box">%s<span><b>Change returned: %s</b> counted into the showroom cash box by Chipo Mhlanga on 9 Oct. '
              'Had Farai spent more than he was given, the difference would be paid to him as a top-up and shown here instead.</span></div>') % (ic('takings'), usd(REQ88_BACK))
    fuel = [s_ for s_ in REQ88_SLIPS if s_[3] == '6300']
    mats = [s_ for s_ in REQ88_SLIPS if s_[3] == '5000']
    fuel_net = sum((s_[4] - (vat_in(s_[4]) if s_[5] else 0) for s_ in fuel), Decimal('0'))
    mats_net = sum((s_[4] - (vat_in(s_[4]) if s_[5] else 0) for s_ in mats), Decimal('0'))
    assert fuel_net + mats_net + vat_total == REQ88_SPENT
    post = posting((('JE-0441', '7 Oct', '1150 Cash advances to staff · Farai Ncube', REQ88_GIVEN, None), ('', '', '1030 Showroom cash box', None, REQ88_GIVEN),
                    ('JE-0451', '9 Oct', '6300 Van fuel', fuel_net, None), ('', '', '5000 Materials used · Pomona Offices', mats_net, None), ('', '', '2210 Input VAT', vat_total, None),
                    ('', '', '1030 Showroom cash box, change', REQ88_BACK, None), ('', '', '1150 Cash advances to staff · Farai Ncube', None, REQ88_GIVEN)))
    hist = timeline((('ok', '<b>Rudo Mapfumo</b> closed it: slips match, change counted', '9 Oct 16:30'),
                     ('in', '<b>Farai Ncube</b> added 3 slips from the cost tracker', '9 Oct 15:52'),
                     ('in', '<b>Chipo Mhlanga</b> paid out %s cash from the showroom cash box' % usd(REQ88_GIVEN), '7 Oct 07:45'),
                     ('ok', '<b>Rudo Mapfumo</b> approved it. Her limit was US$500.00 at the time', '6 Oct 09:02'),
                     ('', '<b>Farai Ncube</b> asked for %s from the CRM job' % usd(REQ88_GIVEN), '6 Oct 08:10')))
    main = head + steps + figs + sec('Slips', '3', table + change, 'r1') + sec('Posting', '2 entries', post, 'r2') + sec('History', None, timeline_wrap(hist), 'r3')
    rail = ('<section><div class="sec-title">Request</div><dl class="attrs"><dt>Asked by</dt><dd>Farai Ncube</dd><dt>From</dt><dd>CRM, the Pomona Offices job</dd><dt>Why</dt><dd>Fuel for the van and adhesive and screed for the 2nd floor</dd>'
            '<dt>Needed</dt><dd>7 Oct</dd><dt>Cost centre</dt><dd>Project · Pomona Offices</dd></dl></section>'
            '<section><div class="sec-title">Who did what</div><dl class="attrs"><dt>Approved</dt><dd>Rudo Mapfumo</dd><dt>Paid out</dt><dd>Chipo Mhlanga</dd><dt>Closed</dt><dd>Rudo Mapfumo</dd></dl>'
            '<span class="bk-hint">Nobody approved or paid out their own request, and the person who approved it did not pay it out.</span></section>'
            '<section><div class="sec-title">If something is wrong</div>%s</section>') % undo_box((
        ('undo', 'Reopen', 'Posts the mirror of the accounting for. It goes back to Disbursed, and the %s is with Farai again until slips are fixed.' % usd(REQ88_GIVEN), False),
        ('undo', 'Reverse', 'Paying out can only be reversed while nothing is accounted for. Reopen first.', True)))
    body = rec('Requisitions', 'Requisitions', 'REQ-0088', 'hand', top, main, rail)
    return board('BkRequisition', 'REQ-0088', body, h=1400)


def supplier():
    top = btn('Statement', 'docs') + primary('Pay', 'payments', 'P')
    head = ('<div class="bk-head"><div class="bk-k"><span class="pill pill-warn">ITF263 expired</span><span>Timber and oak flooring, Mutare</span><span>Mr G. Sithole</span><span>+263 20 206 4471</span></div>'
            '<div class="bk-title">Mutare Timber Works</div></div>')
    figs = '<div class="bk-figs" style="grid-template-columns:repeat(4,minmax(0,1fr))">%s</div>' % ''.join(
        '<div><span class="l">%s</span><span class="v">%s</span><span class="s">%s</span></div>' % x for x in (
            ('We owe', usd(B220_TOT), 'BILL-0220, 2 days late'), ('Paid this year', usd(MTW_PAID_YTD), 'before withholding'),
            ('Withheld this year', usd(MTW_WHT_YTD), '1 certificate'), ('On order', usd(2400), 'PO-0038')))
    t = tabs((('Activity', None), ('Bills', 4), ('Payments', 2), ('Statement', None), ('Tax', None)), 'Tax', 'Supplier views').replace('bk-tabs', 'bk-tabs bk-rtabs')
    itf = ('<div style="margin:16px 24px 0" class="bk-box warn">%s<span><b>No valid ITF263 since 30 Jun 2026.</b> Every payment to them now withholds 30%% for ZIMRA, because they have been paid more than US$1,000 this year. '
           'Their next payment, %s, withholds %s. <span class="pill pill-warn" style="height:18px;font-size:12px">To confirm</span> the US$1,000 line for 2026.</span></div>') % (ic('warn'), ref('PAY-0062'), usd(WHT))
    cert = boxed(grid(('', ''), (
        ('Number', '<span class="mono">ITF263 0041-77213</span>'), ('Valid', '1 Jul 2025 to 30 Jun 2026'), ('State', st('Expired ITF263', 'Expired, 110 days ago')),
        ('Last checked', '18 Oct 08:00 on the ZIMRA portal, by Books'), ('Copy', '<span class="cell-lead">%s ITF263-2025.pdf</span>' % ic('docs'))), label='ITF263', widths=('180px', None)).replace('<thead><tr><th></th><th></th></tr></thead>', ''))
    acts = '<div class="bk-acts" style="padding:12px 24px 0">%s%s</div>' % (btn('Upload the new ITF263', 'upload'), btn('Ask them by WhatsApp', 'whatsapp'))
    wrows = (
        (ref('PAY-0041'), '<span class="muted">14 Aug</span>', ref('BILL-0198'), usd(MTW_PAID_YTD), usd(MTW_WHT_YTD), ref('WHT-0006'), st('Paid', 'Paid 10 Sep')),
        (ref('PAY-0062'), '<span class="muted">18 Oct</span>', ref('BILL-0220'), usd(B220_TOT), usd(WHT), '<span class="muted">Drafted</span>', st('To approve')),
    )
    wtab = boxed(grid(('Payment', 'Date', 'Bill', 'Gross', 'Withheld, 30%', 'Certificate', 'To ZIMRA'), wrows, num=(3, 4), label='Withholding',
                      total=('2026', '', '', usd(MTW_PAID_YTD + B220_TOT), usd(MTW_WHT_YTD + WHT), '', ''), widths=('110px', '80px', '110px', '120px', '130px', '120px', None)))
    vat = boxed(grid(('', ''), (('VAT number', '220145873, registered'), ('TIN', '2000418236'), ('Their invoices', 'Fiscal tax invoices, so we check each one on FDMS'),
                              ('VAT withholding', 'Not an agent: we pay their VAT in full')), label='VAT', widths=('180px', None)).replace('<thead><tr><th></th><th></th></tr></thead>', ''))
    main = head + figs + t + itf + sec('Tax clearance, ITF263', None, cert + acts, 's1') + sec('Withholding this year', '%s held' % usd(MTW_WHT_YTD), wtab, 's2') + sec('VAT', None, vat, 's3')
    rail = ('<section><div class="sec-title">Details</div><dl class="attrs"><dt>Address</dt><dd>14 Herbert Chitepo St, Mutare</dd><dt>Currency</dt><dd>USD</dd><dt>Terms</dt><dd>On delivery, 7 days</dd>'
            '<dt>Pay to</dt><dd>CBZ Mutare, 0112 4478 2210</dd><dt>Supplies</dt><dd>Oak strip, skirting, underlay</dd></dl></section>'
            '<section><div class="sec-title">Latest</div>%s</section>') % timeline((
        ('wa', 'PAY-0062 sent for approval', '18 Oct'), ('wa', 'BILL-0220 overdue', '17 Oct'), ('in', 'PO-0038 sent, oak for Ridgeview', '17 Oct'), ('ok', 'GRN-0043 counted in', '12 Oct'))).replace('class="bk-tl"', 'class="bk-tl" style="padding:0"')
    body = rec('Suppliers', 'Suppliers', 'Mutare Timber Works', 'store', top, main, rail)
    return board('BkSupplier', 'Mutare Timber Works', body, h=1220)


# ---------- phone boards (390 wide) ----------
def ph_head(left, title, right=''):
    return '<header class="bk-ph-h">%s<b>%s</b>%s</header>' % (left, title, right)

def ph_rows(items):
    return '<div>%s</div>' % ''.join('<div class="bk-ph-row"><span>%s</span><span>%s</span></div>' % x for x in items)

def ph_need(icon, lead, d):
    return '<div class="bk-ph-need">%s<span><b>%s</b><span>%s</span></span>%s</div>' % (ic(icon), lead, d, ic('chev'))

def phone(name, title, inner):
    write(ROOT, name, 'Books · ' + title, '<div class="bk-ph">%s</div>' % inner, 390, 844, CSS)
    return name

def money_phone():
    head = ph_head(iconbtn('panel', 'Books menu'), 'Money', iconbtn('bell', 'Notifications'))
    lede = ('<p style="font:600 22px/1.3 var(--font-sans);letter-spacing:var(--tracking-display);color:var(--color-ink)">%s has come in this month. '
            '<span style="display:block;font-weight:400;color:var(--color-muted)">%s is owed to you, %s of it overdue.</span></p>') % (usd(MONEY_IN), usd(OWED), usd(OVERDUE))
    rows = ph_rows((('Gone out', usd(MONEY_OUT)), ('Bank and cash', usd(CASH_BASE)), ('You owe suppliers', usd(TO_PAY)), ('VAT due by 15 Nov', usd(VAT_OCT))))
    needs = ('<div><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:17px;color:var(--color-ink)">Needs you</b><span class="muted">7</span></div>%s</div>') % ''.join((
        ph_need('hand', '4 things to approve', '%s in all' % usd(REQ_FOR_ME_SUM + M(23) + NET_PAY)),
        ph_need('fiscal', 'INV-0144 is not signed by FDMS', 'The device was offline on Friday'),
        ph_need('invoice', '3 invoices are overdue', '%s, Chisipite Dental 12 days' % usd(OVERDUE)),
        ph_need('bank', '4 bank lines to match', 'CBZ, USD, since Wednesday')))
    foot = '<div class="bk-ph-f">%s%s</div>' % (primary('New invoice', 'plus', 'N'), btn('Record a payment', 'payments', 'btn btn-lg'))
    return phone('BkMoneyPhone', 'Money, phone', head + '<div class="bk-ph-b">%s%s%s</div>' % (lede, rows, needs) + foot)

INV131_LINES = (('Vinyl, 2 surgeries', 36, 'm²', '22.40'), ('Fitting', 36, 'm²', '5.60'), ('Coved skirting', 7, 'm', '9.37'))

def invoice_phone():
    net, v, tot = lines_total(INV131_LINES)
    assert tot == M(1240)
    head = ph_head(iconbtn('back', 'Back to invoices'), 'INV-0131', iconbtn('more', 'More actions'))
    top = ('<div style="display:flex;flex-direction:column;gap:6px">%s<div class="num" style="font-size:34px;font-weight:600;color:var(--color-ink);letter-spacing:var(--tracking-display);text-align:left">%s</div>'
           '<span style="font-size:15px;color:var(--color-ink-2)">Chisipite Dental · Mrs L. Banda</span></div>') % ('<span style="align-self:flex-start">%s</span>' % pill('Overdue', 'Overdue, 12 days'), usd(tot))
    rows = ph_rows((('Issued', '22 Sep'), ('Due', '6 Oct'), ('Paid', usd(0)), ('FDMS', st('Valid')), ('Last reminder', '9 Oct, read')))
    lines = '<div><b style="font-size:15px;color:var(--color-ink)">3 lines</b>%s</div>' % ''.join(
        '<div class="bk-ph-row" style="font-size:14px"><span>%s, %s %s</span><span>%s</span></div>' % (i, q, u, usd(M(q) * M(p))) for i, q, u, p in INV131_LINES) + \
        '<div class="bk-ph-row" style="font-size:14px;box-shadow:none"><span>VAT at 15.5%%</span><span>%s</span></div>' % usd(v)
    note = vflag('Vane drafted the reminder. You send it.')
    foot = '<div class="bk-ph-f">%s%s</div>' % (btn('Send a reminder', 'whatsapp', 'btn btn-primary', 'S'), btn('Record a payment', 'payments', 'btn btn-lg'))
    return phone('BkInvoicePhone', 'INV-0131, phone', head + '<div class="bk-ph-b" style="gap:16px">%s%s%s%s</div>' % (top, rows, lines, note) + foot)

def requisition_phone():
    r = [x for x in REQ if x[0] == 'REQ-0091'][0]
    head = ph_head(iconbtn('back', 'Back to requisitions'), 'REQ-0091', '<span class="pill pill-n" style="margin-right:8px">CRM</span>')
    top = ('<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:15px;color:var(--color-ink-2)">Tinashe Moyo asks for</span>'
           '<div class="num" style="font-size:34px;font-weight:600;color:var(--color-ink);letter-spacing:var(--tracking-display);text-align:left">%s</div>'
           '<span style="font-size:15px;line-height:1.45;color:var(--color-ink)">Transport for 3 trips to Borrowdale Brooke Clinic, for the vinyl in 3 rooms.</span></div>') % usd(r[6])
    rows = ph_rows((('Job', 'Borrowdale Brooke Clinic'), ('Needed', 'Mon 19 Oct'), ('Paid from', 'Showroom cash box'), ('Asked', '17 Oct 17:20'),
                    ('Tinashe holds', '%s not accounted for' % usd(0)), ('His last 3', 'All accounted for')))
    who = '<div class="bk-box" style="font-size:14px">%s<span>You or Rudo Mapfumo can approve this. Chipo Mhlanga pays it out, so nobody both approves and pays.</span></div>' % ic('person')
    foot = '<div class="bk-ph-f">%s%s</div>' % (btn('Approve', 'check', 'btn btn-primary', 'A'), btn('Reject', 'x', 'btn btn-lg'))
    return phone('BkRequisitionPhone', 'Approve REQ-0091, phone', head + '<div class="bk-ph-b">%s%s%s</div>' % (top, rows, who) + foot)

def claim_phone():
    head = ph_head(iconbtn('x', 'Close'), 'New claim', '<span class="muted" style="font-size:13px;padding-right:8px">Draft</span>')
    slip = ('<div style="position:relative;height:200px;border-radius:12px;background:var(--color-fill);overflow:hidden;display:grid;place-items:center">'
            '<div class="receipt" style="transform:rotate(-2deg);width:230px;padding:14px 14px;line-height:1.5">'
            '<div class="c t" style="font-size:13px">Puma Service Station, Msasa</div><div class="c">Fiscal tax invoice 0091-4471</div><hr>'
            '<div class="l"><span>18 Oct 2026</span><span>07:52</span></div><div class="l"><span>Diesel, 20.00 l × 1.62</span><span>32.40</span></div>'
            '<div class="l"><span>VAT 15.5%%, included</span><span>4.35</span></div><hr><div class="l t"><span>Total US$</span><span>32.40</span></div></div>'
            '<button class="btn btn-sm" style="position:absolute;right:10px;top:10px">%sRetake</button></div>') % ic('camera')
    flag = vflag('Vane read the slip. Check it, then send it.')
    rows = ph_rows((('Where', 'Puma Service Station, Msasa'), ('Date', 'Sat 18 Oct'), ('Amount', usd('32.40')), ('VAT', '%s, fiscal invoice' % usd('4.35')),
                    ('What', 'Fuel'), ('For', 'Ridgeview Apartments, site visit')))
    paid = '<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:14px;font-weight:500;color:var(--color-ink)">Paid with</span>%s</div>' % \
        '<div class="seg" role="tablist" style="display:flex"><button role="tab" aria-selected="true" style="flex:1;justify-content:center;height:36px">My own money</button><button role="tab" aria-selected="false" style="flex:1;justify-content:center;height:36px">Site float</button></div>'
    foot = '<div class="bk-ph-f">%s</div>' % btn('Send the claim', 'send', 'btn btn-primary', 'Ctrl ↵')
    return phone('BkClaimPhone', 'Snap a slip, phone', head + '<div class="bk-ph-b" style="gap:16px">%s%s%s%s</div>' % (slip, flag, rows, paid) + foot)


# ---------- views and main ----------
def make_view(name):
    import views
    s = open(os.path.join(ROOT, name + '.dc.html')).read()
    s = s.replace('<script src="./support.js"></script>', "<style>x-dc{display:block}helmet{display:contents}</style>")
    for blob, local in views.UPLOADS.items():
        s = s.replace(blob, local)
    s = re.sub(r'<script type="text/x-dc" data-dc-script.*?</script>\n?', "", s, flags=re.S)
    vdir = os.path.join(os.path.dirname(os.path.abspath(ROOT)), 'view')
    open(os.path.join(vdir, name + '.html'), 'w').write(s)

BOARDS = [money, invoices, invoices_bulk, quotes, payments_in, credit_notes, customers, spending, bills, payments_out, orders, requisitions, claims, suppliers, invoice, invoice_new, payment_new, customer, bill, bill_new, payment_out_new, requisition, supplier, money_phone, invoice_phone, requisition_phone, claim_phone]

if __name__ == '__main__':
    only = sys.argv[2:]
    for f in BOARDS:
        if only and f.__name__ not in only:
            continue
        n = f()
        make_view(n)
        print(n)
