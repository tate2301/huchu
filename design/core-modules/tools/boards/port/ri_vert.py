import sys
sys.path.insert(0, 'gen2/port')
from ri_shared import *
P = sys.argv[1]
def m(v): return '${:,.2f}'.format(v)

# ================= Retail (Tender) =================
theme('tender')
overview(P, 'PageRetailReports.dc.html', 'Retail · Reports · Overview', 'retail', 'retailReports',
  'Takings are $18,240.50 this month, 4% up on the same days in September.', 'Losses came to 1.4% of takings, most of it in the spirits count.',
  [('Sales', 'receipt', '$18,240.50', '+4%', 'up', 'on September', [14.2, 15.1, 16.0, 15.6, 16.9, 17.5, 18.24], 3),
   ('Profit', 'coins', '$4,925.00', '27.0%', 'warn', 'margin, aim 30%', [4.1, 4.3, 4.2, 4.6, 4.5, 4.8, 4.93], 3),
   ('Products', 'tag', '38', '+6', 'down', 'unsold, 60 days', [24, 27, 29, 30, 32, 32, 38], 3),
   ('Stock health', 'stack', '12 days', '−2', 'warn', 'days of cover', [15, 14, 14, 13, 14, 14, 12], 3),
   ('Losses', 'warning', '$255.40', '+$74.20', 'down', 'on September', [160, 190, 140, 210, 170, 181, 255], 4),
   ('Customers', 'users', '41%', '+3 pts', 'up', 'from members', [35, 36, 38, 37, 38, 38, 41], 4),
   ('Money', 'money', '$3,180.00', '2', 'warn', 'to decide', [2.1, 2.6, 1.8, 3.4, 2.9, 2.4, 3.18], 4)],
  [('Takings by payment', 'Money', 'Corelith', 'Managers', 'Tendai, today', '22'),
   ('Till shifts', 'The floor', 'Corelith', 'Managers', 'Tendai, yesterday', '15'),
   ('Items sold', 'Selling', 'Corelith', 'Everyone', 'Chipo, 9 Oct', '11'),
   ('Spirits, by size', 'Selling', 'Tendai', 'Managers', 'Tendai, 8 Oct', '9'),
   ('Stock on hand', 'Stock', 'Corelith', 'Everyone', 'Nyasha, 7 Oct', '8'),
   ('Count differences', 'Stock', 'Corelith', 'Managers', 'Tendai, 6 Oct', '6')],
  [('The floor', 'cashRegister', 'Watch', 'Till 1 was short 3 times since August'), ('Stock', 'stack', 'Watch', '9 products running low'), ('Books', 'wallet', 'Healthy', 'Every day posted; September closed'), ('People', 'user', 'Healthy', '4 on the floor today')], cols=4, h=960)

# Template run page, the one that 404s today
DAYS = [('Sun 11 Oct', [('Till 1', 412.00, 238.50, 96.00, 40.00, 71), ('Till 2', 301.00, 180.00, 54.00, 0.00, 49)]),
        ('Sat 10 Oct', [('Till 1', 1180.00, 612.00, 240.00, 120.00, 168), ('Till 2', 846.00, 455.50, 188.00, 60.00, 131)]),
        ('Fri 9 Oct', [('Till 1', 1020.00, 540.00, 210.00, 80.00, 152), ('Till 2', 760.00, 402.00, 150.00, 40.00, 117)])]
rows = []
for day, ts in DAYS:
    tot = sum(sum(t[1:5]) for t in ts)
    rows.append(('__group__', day, '', m(tot)))
    for t in ts:
        rows.append([(day.split(' ', 1)[1], 'muted'), (t[0], 'lead'), m(t[1]), m(t[2]), m(t[3]), m(t[4]) if t[4] else ('—', 'faint'), ('—', 'faint'), (m(sum(t[1:5])), 'strong'), str(t[5])])
body = T('        <div style="display: flex; align-items: center; gap: 8px; padding: 14px 28px 0; color: [[muted]]; font-size: 12.5px;">[[c]]<span>Built in · 1 to 11 October 2026, every till · opened 22 times this month</span></div>\n', c=chip('From Corelith', 'sel')) + \
  params([('calendar', 'This month', 'on'), ('cashRegister', 'Every till', 'menu'), ('money', 'Paid with: any', 'menu'), ('user', 'Every cashier', 'menu'), ('', '', 'sep'), ('rows', 'One row for each: Day and Till', 'on'), ('columns', 'Columns', 'plain')], 'As of 11:52') + \
  tiles([('Taken', '$18,240.50', '1,688 payments'), ('Cash', '$9,880.00', '54%'), ('EcoCash', '$5,412.50', '30%'), ('Card', '$2,148.00', '12%'), ('ZiG', '$800.00', '4%, at the day’s rate')]) + \
  grid2(bars('Taken, by how people paid', [('Cash', '$9,880.00', 1, 'hi'), ('EcoCash', '$5,412.50', 5412.5 / 9880), ('Card', '$2,148.00', 2148 / 9880), ('ZiG', '$800.00', 800 / 9880), ('On account', '$0.00', 0)]),
        trend('Taken, by day', [1050, 2410, 2780, 980, 690, 610, 700, 795.5, 3202, 3701.5, 1321.5], ['1 Oct', '4 Oct', '7 Oct', '9 Oct', '11 Oct'], 'every till')) + \
  table([('Day', '70px', 'l'), ('Till', 'minmax(0, 1fr)', 'l'), ('Cash', '100px', 'r'), ('EcoCash', '100px', 'r'), ('Card', '90px', 'r'), ('ZiG', '80px', 'r'), ('On account', '96px', 'r'), ('Taken', '110px', 'r'), ('Payments', '84px', 'r')], rows, rowh=36) + \
  pager('22 rows · 11 days, 2 tills', T('<span>Taken <b style="font: 600 13px [[mono]]; color: [[ink]];">$18,240.50</b></span>'))
save(P, 'PageRetailTemplate.dc.html', doc('Retail · Reports · Takings by payment', frame('retail', 'retailReports', 'Money', topbar('Takings by payment', 'money'), body, h=1000), {'actions': [{'label': 'Make it yours', 'kind': 'secondary', 'glyph': 'copy'}, {'label': 'Send it', 'kind': 'secondary', 'glyph': 'clock'}, {'label': 'Export', 'kind': 'primary', 'glyph': 'download', 'kbd': 'E'}]}, 1440, 1000))

# Insight: Losses
STOCK = [0, 0, 0, 0, 118.40, 0, 0, 0, 28.50, 0, 0]
DRAW = [0, 0, 0, 0, 12.00, 0, 0, 8.00, 0, 12.50, 0]
REFV = [4.00, 6.50, 0, 12.00, 3.50, 9.00, 5.00, 0, 14.00, 18.00, 4.00]
body = periods('This month', [], '1 to 11 October, against 1 to 11 September') + \
  finding('You lost $255.40 this month, 1.4% of takings.', 'The spirits count found $118.40 short on 5 October. Till 1 was short on three days.') + \
  tiles([('Lost this month', '$255.40', 'was $181.20', 'down'), ('Of takings', '1.4%', 'was 1.0%', 'down'), ('Drawer differences', '−$32.50', '3 shifts, all on Till 1', 'warn'), ('Refunds and voids', '$76.00', '7 refunds, 3 voids', '')]) + \
  columns_chart('Where is money leaking?', [STOCK, DRAW, REFV], [str(i) for i in range(1, 12)], [('Stock counts', C['bar']), ('Drawer', '#c2850f'), ('Refunds and voids', C['hi2'])], 'by day, October', height=160) + \
  tabs(['By cashier', 'By count', 'By till'], 'By cashier') + \
  table([('Cashier', 'minmax(0, 1fr)', 'l'), ('Shifts', '70px', 'r'), ('Short or over', '120px', 'r'), ('Refunds', '80px', 'r'), ('Voids', '70px', 'r'), ('Refunds and voids', '140px', 'r')],
        [[('Chipo', 'link'), '6', ('−$20.50', 'bad'), '4', '1', '$34.00'], [('Nyasha', 'link'), '5', ('−$12.00', 'bad'), '2', '2', '$28.00'], [('Blessing', 'link'), '4', ('$0.00', 'muted'), '1', '0', '$14.00']],
        totals=['Total', '15', '−$32.50', '7', '3', '$76.00'])
save(P, 'PageRetailLosses.dc.html', doc('Retail · Insights · Losses', frame('retail', 'retailReports', 'Losses', topbar('Losses', 'warning'), body,
  insight_aside([('Count the spirits again', 'The 5 October count was $118.40 short, most of it 750 ml bottles.', 'Count the stock'), ('Look at Till 1’s shifts', 'Short on 5, 8 and 10 October, each time on the morning shift.', 'Look at the shifts'), ('Ask for a manager on voids', 'Voids now need no approval on either till.', 'Tighten the till rules')])), {'actions': [{'label': 'Open Till shifts', 'kind': 'secondary', 'glyph': 'table'}]}, 1440, 900))

# Insight: Sales, heat grid
import math
HOURS = list(range(8, 21))
DAYN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
def heat(di, h):
    base = [0.35, 0.25, 0.32, 0.38, 0.62, 0.72, 0.45][di]
    peak = math.exp(-((h - 18) ** 2) / 8.0) if di in (4, 5) else math.exp(-((h - 17) ** 2) / 10.0) * 0.8
    mid = math.exp(-((h - 13) ** 2) / 6.0) * 0.35
    return min(1.0, base * 0.4 + peak * (0.9 if di in (4, 5) else 0.6) + mid)
cells = ''
cells += T('<span></span>') + ''.join(T('<span style="text-align: center; font: 11.5px [[mono]]; color: [[muted]];">[[h]]</span>', h='%02d' % h) for h in HOURS)
for di, dn in enumerate(DAYN):
    cells += T('<span style="font-size: 12.5px; color: [[muted]];">[[d]]</span>', d=dn)
    for h in HOURS:
        v = heat(di, h)
        cells += '<span title="%s %02d:00" style="height: 26px; border-radius: 4px; background: rgba(184,74,12,%.2f);"></span>' % (dn, h, 0.06 + v * 0.84)
grid = T('<section style="padding: 18px 28px 20px; display: flex; flex-direction: column; gap: 10px;"><div style="display: flex; align-items: baseline; gap: 10px;"><h3 style="margin: 0; font-size: 14px; font-weight: 600;">When do we sell?</h3><span style="font-size: 12.5px; color: [[muted]];">takings by day and hour, darker is more</span></div><div style="display: grid; grid-template-columns: 40px repeat(13, minmax(0, 1fr)); gap: 4px; align-items: center;">[[c]]</div></section>', c=cells)
body = periods('This month', [], '1 to 11 October, against 1 to 11 September') + \
  finding('Friday and Saturday evenings bring in 31% of takings.', 'Tuesday mornings are the quietest: 4 sales an hour before 11:00.') + \
  tiles([('Takings', '$18,240.50', '4% up', 'up'), ('Sales', '1,612', '2% up', 'up'), ('Average basket', '$11.32', '2% up', 'up'), ('Items a basket', '2.4', 'the same', '')]) + grid + \
  tabs(['By category', 'By till', 'By cashier'], 'By category') + \
  table([('Category', 'minmax(0, 1fr)', 'l'), ('Sales', '80px', 'r'), ('Takings', '120px', 'r'), ('Share', '80px', 'r'), ('Against September', '150px', 'r')],
        [[('Beer', 'link'), '742', '$7,480.00', '41%', ('+6%', 'ok')], [('Spirits', 'link'), '318', '$5,290.00', '29%', ('+3%', 'ok')], [('Wine', 'link'), '164', '$2,190.00', '12%', ('−2%', 'bad')], [('Soft drinks', 'link'), '231', '$1,826.50', '10%', ('+5%', 'ok')], [('Snacks', 'link'), '157', '$1,454.00', '8%', ('+1%', 'ok')]],
        totals=['Total', '1,612', '$18,240.50', '100%', '+4%'], rowh=36)
save(P, 'PageRetailSales.dc.html', doc('Retail · Insights · Sales', frame('retail', 'retailReports', 'Sales', topbar('Sales', 'receipt'), body,
  insight_aside([('Tuesday mornings are quiet', 'A promotion from 08:00 to 11:00 brings people in when the tills are free.', 'Plan a promotion'), ('Wine is down 2%', 'Three wines ran out last week and were not reordered.', 'See the sales')]), h=1000), {'actions': [{'label': 'Open Items sold', 'kind': 'secondary', 'glyph': 'table'}]}, 1440, 1000))

# ================= Schools =================
theme('corelith')
overview(P, 'PageSchoolReports.dc.html', 'Schools · Reports · Overview', 'schools', 'schoolReports',
  '83% of third-term fees are in: $290,186.00 of $348,400.00.', 'Form 3 is behind at 74%. Attendance was 94% last week.',
  [('Fees', 'money', '83%', '+4 pts', 'up', 'on last term', [41, 52, 60, 67, 73, 79, 83]),
   ('Attendance', 'checklist', '94%', '−1 pt', 'warn', 'on the week before', [96, 95, 95, 96, 94, 95, 94]),
   ('Enrolment', 'users', '812', '+6', 'up', 'this term', [801, 803, 804, 806, 806, 809, 812]),
   ('Boarding', 'bed', '91%', '22', '', 'beds free', [88, 90, 89, 91, 92, 90, 91])],
  [('Fees owed', 'Fees', 'Corelith', 'Everyone', 'Mrs Dube, today', '34'),
   ('Fees owed, by class', 'Fees', 'Corelith', 'Managers', 'Mr Gora, yesterday', '21'),
   ('Registers', 'The school day', 'Corelith', 'Everyone', 'Mrs Dube, 9 Oct', '14'),
   ('Fee receipts', 'Fees', 'Corelith', 'Everyone', 'Mrs Dube, 8 Oct', '12'),
   ('Form 3 arrears', 'Fees', 'Mrs Dube', 'Managers', 'Mr Gora, 6 Oct', '9'),
   ('The roll', 'Pupils', 'Corelith', 'Everyone', 'Mr Gora, 2 Oct', '8')],
  [('Fees', 'money', 'Watch', 'Form 3 is at 74% collected'), ('Books', 'wallet', 'Healthy', 'September closed on 4 Oct'), ('Pay', 'receipt', 'Healthy', 'September paid on time'), ('People', 'user', 'Watch', '3 teachers’ contracts end this term')], cols=4)

FORMS = [('Form 1', 152, 64600, 56210), ('Form 2', 148, 63200, 54350), ('Form 3', 160, 68400, 50620), ('Form 4', 156, 66600, 56280), ('Lower 6', 102, 43500, 37150), ('Upper 6', 94, 42100, 35576)]
frows = [[(f, 'link'), str(n), m(b), m(p), (m(b - p), 'strong'), ('%d%%' % round(p * 100 / b), 'warn' if p / b < 0.8 else 'num')] for f, n, b, p in FORMS]
body = periods('This term', [('users', 'Every class', 'menu'), ('bed', 'Boarders and day', 'menu')], 'Third term, 7 Sep to 4 Dec', opts=('This term', 'Last term', 'This year')) + \
  finding('$290,186.00 of $348,400.00 is in: 83% of the term’s fees.', 'Form 3 is behind at 74%, and 41 families have paid nothing this term.') + \
  tiles([('Collection rate', '83%', 'was 79%', 'up'), ('Still owing', '$58,214.00', '97 families', ''), ('Paid nothing this term', '41 families', '$21,980.00 between them', 'warn'), ('From earlier terms', '$9,870.00', '90 days and over', 'warn')]) + \
  columns_chart('Is each term collected?', [[331200, 339750, 290186], [9800, 6250, 58214]], ['First term', 'Second term', 'Third term, so far'], [('Collected', C['bar']), ('Still owing', '#c2850f')], 'invoiced, split into collected and still owing', height=150) + \
  tabs(['By class', 'Arrears, by age', 'By fee'], 'By class') + \
  table([('Class', 'minmax(0, 1fr)', 'l'), ('Pupils', '70px', 'r'), ('Billed', '120px', 'r'), ('Paid', '120px', 'r'), ('Owed', '120px', 'r'), ('Collected', '90px', 'r')], frows, totals=['Total', '812', '$348,400.00', '$290,186.00', '$58,214.00', '83%'], rowh=36)
save(P, 'PageSchoolFees.dc.html', doc('Schools · Insights · Fees', frame('schools', 'schoolReports', 'Fees', topbar('Fees', 'money'), body,
  insight_aside([('41 families have paid nothing', 'A reminder goes to each family’s portal and phone. You choose who, and send it.', 'Remind the 41'), ('Form 3 is at 74%', '$17,780.00 owed by 58 families, 22 of them boarders.', 'See Form 3’s arrears'), ('For the board meeting', 'Collections and arrears as one PDF.', 'Export as PDF')]), h=980), {'actions': [{'label': 'Open Fees owed', 'kind': 'secondary', 'glyph': 'table'}]}, 1440, 980))

OWED = [('Form 1', 9640), ('Form 2', 10450), ('Form 3', 20130), ('Form 4', 12890), ('Lower 6', 7310), ('Upper 6', 7664)]
mx = max(v for _, v in OWED)
body = T('        <div style="display: flex; align-items: center; gap: 10px; padding: 16px 28px; border-bottom: 1px solid [[line]];">[[c]]<span style="color: [[ink2]];">What each class owes and who has owed longest. Reads Fees owed.</span><span style="margin-left: auto;">[[d]]</span></div>\n', c=chip('From Corelith', 'sel'), d=chipbtn('calendar', 'Any time', 'on')) + \
  tiles([('Owed', '$68,084.00', 'this term and earlier'), ('Families', '112', '131 pupils'), ('From earlier terms', '$9,870.00', '15 families', 'warn'), ('Longest overdue', '214 days', 'since 12 March', 'warn')]) + \
  grid2(bars('Owed, by class', [(f, m(v), v / mx, 'hi' if f == 'Form 3' else '') for f, v in OWED], 'sum of Owed', w_label='80px'),
        T('<section style="padding: 18px 28px; display: flex; flex-direction: column; gap: 10px;"><h3 style="margin: 0; font-size: 14px; font-weight: 600;">Reading it</h3><p style="margin: 0; color: [[ink2]];">Form 3 owes the most, $20,130.00, nearly a third of everything owed.</p><p style="margin: 0; color: [[ink2]];">15 families still owe from first or second term.</p></section>')) + \
  T('        <div style="padding: 18px 28px 10px; font-size: 14px; font-weight: 600; border-top: 1px solid [[line]];">Owed longest</div>\n') + \
  table([('Pupil', 'minmax(0, 1fr)', 'l'), ('Class', '90px', 'l'), ('Owed', '110px', 'r'), ('Days overdue', '110px', 'r'), ('Last paid', '110px', 'l')],
        [[('Rumbidzai Moyo', 'link'), ('Form 3B', 'muted'), '$1,420.00', ('214', 'bad'), ('12 Mar', 'muted')], [('Tafadzwa Ncube', 'link'), ('Form 4A', 'muted'), '$1,180.00', ('186', 'bad'), ('9 Apr', 'muted')], [('Kudakwashe Banda', 'link'), ('Form 3A', 'muted'), '$960.00', ('152', 'bad'), ('13 May', 'muted')], [('Nyasha Zhou', 'link'), ('Lower 6', 'muted'), '$870.00', ('131', 'warn'), ('3 Jun', 'muted')], [('Panashe Sibanda', 'link'), ('Form 2C', 'muted'), '$640.00', ('97', 'warn'), ('6 Jul', 'muted')]], rowh=36)
save(P, 'PageSchoolBuilt.dc.html', doc('Schools · Reports · Fees owed, by class', frame('schools', 'schoolReports', 'Fees', topbar('Fees owed, by class', 'barChart'), body), {'actions': [{'label': 'Export', 'kind': 'secondary', 'glyph': 'download'}, {'label': 'Make it yours', 'kind': 'primary', 'glyph': 'copy', 'kbd': 'M'}]}, 1440, 900))

# ================= Gold mine =================
overview(P, 'PageMineReports.dc.html', 'Gold mine · Reports · Overview', 'mine', 'mineReports',
  'The mills recovered 1,284.6 g of gold in the last 30 days, 6% more.', 'They lost 47.5 hours, a third of it to breakdowns. 3 bars are poured and not yet sold.',
  [('Production', 'factory', '1,284.6 g', '+6%', 'up', 'on 30 days before', [281, 290, 302, 296, 288, 310, 318]),
   ('Downtime', 'clock', '47.5 h', '+9.5 h', 'down', 'on 30 days before', [8.0, 9.5, 7.0, 11.0, 12.5, 9.0, 15.0]),
   ('Gold', 'medal', '3 bars', '412.8 g', 'warn', 'not sold', [1, 0, 2, 1, 1, 2, 3]),
   ('Stores', 'stack', '$18,420.00', '6', 'warn', 'under minimum', [19.8, 19.2, 18.9, 19.6, 18.7, 18.1, 18.42])],
  [('Shift reports', 'Production', 'Corelith', 'Everyone', 'Mr Chari, today', '52'),
   ('Plant reports', 'Production', 'Corelith', 'Everyone', 'Mr Chari, today', '38'),
   ('Production, week by week', 'Production', 'Corelith', 'Everyone', 'Mrs Nyoni, 9 Oct', '24'),
   ('Downtime', 'Production', 'Corelith', 'Managers', 'Mrs Nyoni, 8 Oct', '17'),
   ('Gold chain', 'Gold', 'Corelith', 'Everyone', 'Mrs Nyoni, 7 Oct', '12'),
   ('Fuel ledger', 'Stores and maintenance', 'Corelith', 'Everyone', 'Storeman, 6 Oct', '10')],
  [('Gold', 'medal', 'Watch', '2 bars poured over 14 days ago, not sold'), ('Stores', 'stack', 'Watch', 'Diesel is under its minimum'), ('Safety', 'shield', 'Healthy', 'No incident open'), ('Pay', 'receipt', 'Healthy', 'September paid on time')], cols=4)

GOLD = [38.2, 41.5, 44.0, 39.8, 46.1, 42.3, 45.9, 40.2, 43.7, 47.4, 41.1, 44.8, 46.3, 39.4, 42.0]
body = periods('30 days', [('mapPin', 'Every site', 'menu')], '12 Sep to 11 Oct, against the 30 days before', opts=('This week', '30 days', 'This quarter')) + \
  finding('The mills recovered 1,284.6 g of gold, 6% more than the 30 days before.', 'Mill 1 did most of it and lost most hours: 25.5 of 47.5.') + \
  tiles([('Gold recovered', '1,284.6 g', 'was 1,211.9 g', 'up'), ('Tonnes processed', '6,840 t', '4% more', 'up'), ('Run hours a day', '20.4 h', 'typical, per mill', ''), ('Diesel used', '18,250 L', '2.7 L a tonne', '')]) + \
  grid2(trend('Gold recovered, every other day', GOLD, ['12 Sep', '20 Sep', '28 Sep', '6 Oct', '11 Oct'], 'grams'),
        bars('Where is the gold coming from?', [('Mill 1', '662.4 g', 1, 'hi'), ('Mill 2', '541.8 g', 541.8 / 662.4), ('Plant', '80.4 g', 80.4 / 662.4)], 'gold recovered, by site', w_label='70px')) + \
  tabs(['By site', 'By shift', 'By day'], 'By site') + \
  table([('Site', 'minmax(0, 1fr)', 'l'), ('Tonnes processed', '130px', 'r'), ('Run hours', '100px', 'r'), ('Hours down', '100px', 'r'), ('Gold recovered', '130px', 'r'), ('Grams a tonne', '120px', 'r')],
        [[('Mill 1', 'link'), '3,420', '588', ('25.5', 'warn'), '662.4 g', '0.19'], [('Mill 2', 'link'), '2,980', '602', '18.0', '541.8 g', '0.18'], [('Plant', 'link'), '440', '214', '4.0', '80.4 g', '0.18']],
        totals=['Total', '6,840', '1,404', '47.5', '1,284.6 g', '0.19'], rowh=36)
save(P, 'PageMineProduction.dc.html', doc('Gold mine · Insights · Production', frame('mine', 'mineReports', 'Production', topbar('Production', 'factory'), body,
  insight_aside([('Mill 1 lost 25.5 hours', 'Breakdowns 11 hours of it: the same pump, three times.', 'Open Downtime'), ('3 plant reports wait for approval', 'Submitted 8 to 10 October by the plant shift.', 'See the plant reports'), ('2 bars are not sold', 'Poured 22 and 26 September, 271.4 g between them.', 'Open the gold chain')]), h=960), {'actions': [{'label': 'Open Plant reports', 'kind': 'secondary', 'glyph': 'table'}]}, 1440, 960))

DT = [('Breakdown', 17.0, [('8 Oct', 'Mill 1', 'BRK', 6.0, 'Feed pump seal'), ('29 Sep', 'Mill 1', 'BRK', 5.0, 'Feed pump seal'), ('19 Sep', 'Mill 2', 'BRK', 6.0, 'Ball mill liner bolt')]),
      ('Power cut', 12.5, [('5 Oct', 'Mill 2', 'PWR', 4.5, 'ZESA, whole site'), ('5 Oct', 'Mill 1', 'PWR', 4.5, 'ZESA, whole site'), ('22 Sep', 'Plant', 'PWR', 3.5, 'Generator changeover')]),
      ('No ore', 8.0, [('1 Oct', 'Mill 1', 'ORE', 5.0, 'Haul truck down'), ('14 Sep', 'Mill 2', 'ORE', 3.0, 'Blasting delayed')])]
rows = []
for cause, hrs, items in DT:
    rows.append(('__group__', cause, str(len(items)), '%.1f hours' % hrs))
    for dte, site, code, h, note in items:
        rows.append([(dte, 'muted'), (site, 'lead'), (code, 'code'), '%.1f' % h, (note, 'muted')])
body = params([('calendar', '12 Sep to 11 Oct', 'on'), ('mapPin', 'Every site', 'menu'), ('', '', 'sep'), ('search', 'Search', 'plain'), ('sliders', 'Filters', 'plain'), ('rows', 'Group by: Cause', 'on'), ('columns', 'Columns', 'plain')], 'As of 06:00') + \
  tiles([('Stops', '11', 'across 3 sites'), ('Hours lost', '47.5', '1.6 a day'), ('Worst cause', 'Breakdown', '17 hours', 'warn')]) + \
  grid2(bars('Hours lost, by cause', [('Breakdown', '17.0', 1, 'hi'), ('Power cut', '12.5', 12.5 / 17), ('No ore', '8.0', 8 / 17), ('Planned maintenance', '6.0', 6 / 17), ('Water', '4.0', 4 / 17)], w_label='150px'),
        trend('Hours lost, over time', [3.0, 0, 6.0, 3.5, 0, 6.0, 0, 5.0, 9.0, 6.0, 0, 9.0], ['12 Sep', '24 Sep', '6 Oct', '11 Oct'], 'by week')) + \
  table([('Date', '80px', 'l'), ('Site', '100px', 'l'), ('Code', '70px', 'l'), ('Hours', '80px', 'r'), ('Notes', 'minmax(0, 1fr)', 'l')], rows, rowh=36) + \
  pager('1 to 11 · grouped by cause, 5 groups', T('<span>Hours <b style="font: 600 13px [[mono]]; color: [[ink]];">47.5</b></span>'))
save(P, 'PageMineDowntime.dc.html', doc('Gold mine · Reports · Downtime', frame('mine', 'mineReports', 'Production', topbar('Downtime', 'clock'), body, h=1000), {'actions': [{'label': 'Save as a template', 'kind': 'secondary', 'glyph': 'fileCheck'}, {'label': 'Export', 'kind': 'primary', 'glyph': 'download', 'kbd': 'E'}]}, 1440, 1000))

# ================= Payroll services =================
overview(P, 'PagePayReports.dc.html', 'Payroll · Reports · Overview', 'payroll', 'payReports',
  'October’s run costs $48,920.00 for 64 people.', '$1,210.00 more than September: 3 drivers joined Transport. September’s P2 was filed on 9 October.',
  [('Pay cost', 'coins', '$48,920.00', '+$1,210.00', 'down', 'on September', [46.6, 46.9, 47.1, 47.2, 47.5, 47.71, 48.92]),
   ('Statutory', 'fileCheck', '$6,412.30', 'Filed', 'up', 'September', [6.1, 6.2, 6.2, 6.3, 6.3, 6.35, 6.41])],
  [('Pay by employee', 'Pay', 'Corelith', 'Managers', 'Mr Chando, today', '19'),
   ('Pay by department', 'Pay', 'Corelith', 'Managers', 'Mr Chando, today', '14'),
   ('P2 PAYE return', 'Pay', 'Corelith', 'Managers', 'Ms Tembo, 9 Oct', '6'),
   ('NSSA schedule', 'Pay', 'Corelith', 'Managers', 'Ms Tembo, 9 Oct', '4'),
   ('Employees', 'People', 'Corelith', 'Everyone', 'Ms Tembo, 5 Oct', '4'),
   ('Drivers’ overtime', 'Pay', 'Ms Tembo', 'Managers', 'Ms Tembo, 2 Oct', '3')],
  [('Pay', 'receipt', 'Watch', 'October run in draft, 3 joiners'), ('People', 'user', 'Watch', '2 people have no NSSA number'), ('Books', 'wallet', 'Healthy', 'September closed')], cols=2)

DEPT = [('Transport', 27, 19030, 20560, 1180), ('Warehouse', 18, 11760, 12700, 30), ('Office', 11, 8940, 9650, 0), ('Management', 8, 5580, 6010, 0)]
body = periods('This month', [('building', 'Every department', 'menu')], 'October draft, against September', opts=('This month', '3 months', 'This year')) + \
  finding('October costs $48,920.00, $1,210.00 more than September.', '3 drivers joined Transport. Nothing else moved by more than $30.00.') + \
  tiles([('Employer cost', '$48,920.00', '2.5% more', 'down'), ('Gross', '$45,310.00', '64 people', ''), ('Net paid', '$34,860.40', 'on 25 October', ''), ('PAYE and AIDS levy', '$6,598.10', 'due 10 November', '')]) + \
  grid2(trend('Employer cost, by month', [46.9, 47.1, 47.2, 47.5, 47.71, 48.92], ['May', 'Jul', 'Sep', 'Oct'], '$ thousands'),
        bars('Where does it go?', [(n, m(e), e / 20560, 'hi' if n == 'Transport' else '') for n, p, g, e, c in DEPT], 'employer cost, by department', w_label='100px')) + \
  tabs(['By department', 'By job grade', 'By pay item'], 'By department') + \
  table([('Department', 'minmax(0, 1fr)', 'l'), ('People', '70px', 'r'), ('Gross', '120px', 'r'), ('Employer cost', '130px', 'r'), ('Against September', '150px', 'r')],
        [[(n, 'link'), str(p), m(g), m(e), ('+' + m(c), 'warn') if c > 100 else (('+' + m(c)) if c else ('$0.00', 'muted'))] for n, p, g, e, c in DEPT], totals=['Total', '64', '$45,310.00', '$48,920.00', '+$1,210.00'], rowh=36)
save(P, 'PagePayCost.dc.html', doc('Payroll · Insights · Pay cost', frame('payroll', 'payReports', 'Pay cost', topbar('Pay cost', 'coins'), body,
  insight_aside([('3 drivers joined Transport', 'Their first pay is in the October run, which is still a draft.', 'Open the run'), ('2 people have no NSSA number', 'The NSSA schedule cannot list them until they do.', 'See who')])), {'actions': [{'label': 'Open Pay by employee', 'kind': 'secondary', 'glyph': 'table'}]}, 1440, 900))

# ================= Service workshop =================
overview(P, 'PageShopReports.dc.html', 'Workshop · Reports · Overview', 'workshop', 'shopReports',
  '18 of 22 machines are working today.', '2 are down waiting on parts and 2 are due a service this week. Work orders cost $6,240.00 this month.',
  [('Equipment', 'wrench', '18 of 22', '2 down', 'down', 'today', [21, 20, 22, 21, 20, 19, 18]),
   ('Stores', 'stack', '$11,380.00', '1', 'warn', 'under minimum', [12.4, 12.1, 11.8, 12.0, 11.6, 11.5, 11.38])],
  [('Maintenance work orders', 'Stores and maintenance', 'Corelith', 'Everyone', 'Mr Mutasa, today', '27'),
   ('Equipment service', 'Stores and maintenance', 'Corelith', 'Everyone', 'Mr Mutasa, today', '18'),
   ('Stock movements', 'Stores and maintenance', 'Corelith', 'Everyone', 'Storeman, 9 Oct', '11'),
   ('What the stores issue', 'Stores and maintenance', 'Corelith', 'Everyone', 'Storeman, 8 Oct', '7'),
   ('Fuel ledger', 'Stores and maintenance', 'Corelith', 'Everyone', 'Storeman, 6 Oct', '6'),
   ('Hire fleet hours', 'Stores and maintenance', 'Mr Mutasa', 'Everyone', 'Mr Mutasa, 1 Oct', '5')],
  [('Maintenance', 'wrench', 'Watch', '2 machines down, 2 services due this week'), ('Stores', 'stack', 'Watch', 'Hydraulic oil under its minimum'), ('Books', 'wallet', 'Healthy', 'September closed'), ('People', 'user', 'Healthy', '14 working today')], cols=2)
print('verticals done')
