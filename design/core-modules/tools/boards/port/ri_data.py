# Reports & Insights: one catalogue of the templates Corelith ships, by area.
# state: 'app' = in the app today, 'move' = in the app on another page, 'build' = to build
EV, MG = 'Everyone', 'Managers'
R, B, S = 'Report', 'Built', 'Statement'

AREAS = {
 'sales':   ('Sales and delivery', 'funnel'),
 'hands':   ("Money in people's hands", 'wallet'),
 'selling': ('Selling', 'receipt'), 'stock': ('Stock', 'stack'), 'buying': ('Buying', 'tray'),
 'customers': ('Customers', 'users'), 'money': ('Money', 'money'), 'floor': ('The floor', 'cashRegister'),
 'fees':    ('Fees', 'money'), 'day': ('The school day', 'sun'), 'pupils': ('Pupils', 'users'),
 'prod':    ('Production', 'factory'), 'gold': ('Gold', 'medal'), 'stores': ('Stores and maintenance', 'wrench'), 'safety': ('Safety and audit', 'shield'),
 'pay':     ('Pay', 'receipt'), 'people': ('People', 'user'), 'books': ('Books', 'wallet'),
}

T = [
 # Sales and delivery (CRM, GENERAL)
 ('sales', 'Leads', R, 'crm-leads', 'Leads that came in, by stage and source, with what they might be worth', 'Last 90 days', 'Stage', EV, 'app'),
 ('sales', 'Deals', R, 'crm-deals', 'Deals closing this year, by stage, with their value and outcome', 'This year', 'Stage', EV, 'app'),
 ('sales', 'Site visits', R, 'crm-site-visits', 'Visits booked and done, by rep and status', 'Last 30 days', 'Status', EV, 'app'),
 ('sales', 'Site visit forms', R, 'crm-visit-forms', 'Each visit: questions answered, area measured, quote drafted', 'Last 90 days', 'Deal', EV, 'app'),
 ('sales', 'Site visit answers', R, 'crm-visit-answers', 'Every answer given on a visit, question by question', 'Last 90 days', 'Form', EV, 'app'),
 ('sales', 'Quotes', R, 'crm-quotes', 'Quotes sent, by status, with their totals', 'Last 90 days', 'Status', EV, 'app'),
 ('sales', 'Projects', R, 'crm-projects', 'Projects not finished: budget, requisitioned and spent', 'Not finished', 'Status', EV, 'app'),
 ('sales', 'Jobs', R, 'crm-jobs', 'Jobs scheduled and done, and who did them', 'Last 60 days', 'Status', EV, 'app'),
 ('sales', 'Invoices', R, 'crm-invoices', 'Invoices, what was paid and what is still owed', 'Last 90 days', 'Status', EV, 'app'),
 ('sales', 'Pipeline by owner', B, 'crm-pipeline', 'Open deals and their value, owner by owner', 'This year', '', EV, 'app'),
 ('sales', 'Measured to won', B, 'crm-measured-to-won', 'Square metres measured each month, and how much was won', 'Last 180 days', '', EV, 'app'),
 ('sales', 'Money owed', B, 'crm-money-owed', 'What each customer owes, oldest first', 'Any time', '', MG, 'app'),
 ('hands', 'Requisitions', R, 'crm-requisitions', 'Money asked for, approved and accounted for', 'Last 60 days', 'Category', EV, 'app'),
 ('hands', 'Spend and receipts', R, 'crm-spend', 'Money spent and received, by person and project', 'Last 30 days', 'Direction', EV, 'app'),
 # Retail (Tender)
 ('selling', 'Items sold', R, 'retail-items-sold', 'What sold, with revenue, cost and margin', 'Last 30 days', 'Product', EV, 'app'),
 ('selling', 'Takings and margin', B, 'retail-takings', 'Takings by day, the best items and how people paid', 'Last 30 days', '', EV, 'app'),
 ('stock', 'Stock on hand', R, 'retail-stock-on-hand', 'What is on the shelves and what it cost, shop by shop', 'Now', 'Shop', EV, 'app'),
 ('stock', 'Count differences', R, 'retail-stock-movements', 'What the counts found short or over, count by count', 'Last 30 days', 'Reference', MG, 'app'),
 ('stock', 'Stock movements', R, 'retail-stock-movements', 'Every move in and out, product by product', 'Last 30 days', 'Product', MG, 'app'),
 ('stock', 'Stock to reorder', B, 'retail-reorder', 'Products at or under their reorder level', 'Now', '', EV, 'app'),
 ('buying', 'Orders and deliveries', R, 'retail-orders', 'Orders sent, what arrived and what is still to come', 'Last 30 days', 'Supplier', MG, 'build'),
 ('buying', 'Bills to pay', R, 'retail-bills', 'Supplier bills, due dates and what is paid', 'Any time', 'Supplier', MG, 'build'),
 ('customers', 'Customers and spend', R, 'retail-customers', 'Members, how often they come and what they spend', 'Last 90 days', 'Customer', MG, 'build'),
 ('customers', 'Accounts owed', R, 'retail-accounts', 'What customers on account owe, by age', 'Any time', 'Customer', MG, 'build'),
 ('money', 'Takings by payment', R, 'retail-payments', 'Cash, EcoCash, card, ZiG and on account, day by day and till by till', 'This month', 'Day, Till', MG, 'app'),
 ('floor', 'Till shifts', R, 'retail-shifts', 'Every shift: float, takings, counted and short or over', 'Last 30 days', 'Shift', MG, 'app'),
 ('floor', 'Till variances', B, 'retail-till-variances', 'Short or over by cashier, and the shifts that did not balance', 'Any time', '', MG, 'app'),
 # Schools
 ('fees', 'Fees owed', R, 'school-fee-balances', 'Invoices still owing, by pupil and class, with days overdue', 'This year', 'Status', EV, 'app'),
 ('fees', 'Fee receipts', R, 'school-fee-receipts', 'Fees received, by method, and what is not yet allocated', 'Last 30 days', 'Method', EV, 'app'),
 ('fees', 'Fees owed, by class', B, 'school-fees-owed', 'What each class owes and who has owed longest', 'Any time', '', MG, 'app'),
 ('fees', 'Fees collected', B, 'school-fees-collected', 'Fees in, week by week, and how families paid', 'This month', '', MG, 'app'),
 ('day', 'Registers', R, 'school-attendance', 'Every mark in every register', 'Last 7 days', 'Mark', EV, 'app'),
 ('day', 'Attendance by class', B, 'school-attendance', 'Present, absent and late, class by class', 'Last 30 days', '', EV, 'app'),
 ('pupils', 'The roll', R, 'school-roll', 'Pupils on the roll, by class, boarding and house', 'Now', 'Class', EV, 'app'),
 # Mine
 ('prod', 'Shift reports', R, 'shift', 'Every shift: crew, tonnes, trips and metres advanced', 'Last 7 days', 'Work type', EV, 'app'),
 ('prod', 'Plant reports', R, 'plant', 'Tonnes fed and processed, run hours, diesel and gold recovered', 'Last 30 days', 'Status', EV, 'app'),
 ('prod', 'Downtime', R, 'downtime', 'Hours lost, by cause and site', 'Last 30 days', 'Cause', MG, 'app'),
 ('prod', 'Attendance', R, 'attendance', 'Present, absent and late on each shift, with overtime', 'Last 7 days', 'Status', EV, 'app'),
 ('prod', 'Production, week by week', B, 'mine-production-week', 'Gold recovered each week, site by site', 'Last 90 days', '', EV, 'app'),
 ('prod', 'Where the hours go', B, 'mine-downtime', 'Hours lost by cause, and the worst days', 'Last 30 days', '', EV, 'app'),
 ('gold', 'Gold chain', R, 'gold-chain', 'Every bar from the pour to the sale: where it is and what was paid', 'Last 90 days', 'Where it is', EV, 'app'),
 ('gold', 'Gold receipts', R, 'gold-receipts', 'Gold sold: assay, price per gram and how it was paid', 'Last 90 days', 'Method', EV, 'app'),
 ('gold', 'Gold, poured to paid', B, 'mine-gold-to-cash', 'How much gold sits at each stage, and how it was paid', 'Last 90 days', '', MG, 'app'),
 ('stores', 'Stock movements', R, 'stores-movements', 'What the stores took in and issued, item by item', 'Last 30 days', 'Category', EV, 'app'),
 ('stores', 'Fuel ledger', R, 'fuel-ledger', 'Fuel in and out, by site, with what is on hand', 'Last 30 days', 'Movement', EV, 'app'),
 ('stores', 'Maintenance work orders', R, 'maintenance-work-orders', 'Equipment down, hours lost, parts and labour', 'Last 60 days', 'Status', EV, 'app'),
 ('stores', 'Equipment service', R, 'maintenance-equipment', 'When each machine was last serviced and is next due', 'Now', 'Category', EV, 'app'),
 ('stores', 'What the stores issue', B, 'stores-issues', 'Items issued most, and who they went to', 'Last 30 days', '', EV, 'app'),
 ('safety', 'Incidents', R, 'compliance-incidents', 'Incidents by type, severity and site', 'Last 90 days', 'Type', MG, 'app'),
 ('safety', 'Activity', R, 'audit-trails', 'Who changed what, and when', 'Last 7 days', 'Who', EV, 'app'),
 # Pay and People (every workspace)
 ('pay', 'Pay by employee', R, 'payroll-pay', 'Gross, deductions, net and employer cost, run by run', 'Last 90 days', 'Period', MG, 'app'),
 ('pay', 'Pay by department', B, 'pay-by-department', 'Employer cost, department by department', 'Last 90 days', '', MG, 'app'),
 ('pay', 'P2 PAYE return', S, '/payroll/statutory/returns', 'Monthly PAYE and AIDS levy for ZIMRA, per currency', 'Last month', '', MG, 'move'),
 ('pay', 'NSSA schedule', S, '/payroll/statutory/returns', 'Monthly NSSA contributions, employee by employee', 'Last month', '', MG, 'move'),
 ('people', 'Employees', R, 'people-register', 'Everyone working here, by department and job', 'Now', 'Department', EV, 'app'),
 ('people', 'Leave', R, 'people-leave', 'Leave taken and booked, by type', 'Last 90 days', 'Leave', EV, 'app'),
 ('people', 'Leave taken', B, 'people-leave', 'Days off by type, and who took the most', 'This year', '', EV, 'app'),
 # Books (every workspace)
 ('books', 'Profit and loss', S, '/accounting/financial-statements', 'Income and expenses for the period, and what is left', 'This month', '', MG, 'move'),
 ('books', 'Balance sheet', S, '/accounting/financial-statements', 'What the business owns and owes on a date', 'Today', '', MG, 'move'),
 ('books', 'Cash flow', S, '/accounting/financial-statements', 'Cash in and out: operating, investing and financing', 'This month', '', MG, 'move'),
 ('books', 'Trial balance', S, '/accounting/trial-balance', 'Every account, debits and credits, which must agree', 'Today', '', MG, 'move'),
 ('books', 'Owed to us, by age', S, '/accounting/receivables', 'What customers owe, 0 to 30 days and older', 'Today', '', MG, 'move'),
 ('books', 'We owe, by age', S, '/accounting/payables', 'What we owe suppliers, by age', 'Today', '', MG, 'move'),
 ('books', 'VAT summary', S, '/accounting/tax', 'Output and input VAT for the period', 'Last month', '', MG, 'move'),
 ('books', 'General ledger', S, '/api/accounting/reports/general-ledger', 'Every posting to an account, with the running balance', 'This month', '', MG, 'build'),
]

def tpl(area):
    return [t for t in T if t[0] == area]

VERTICALS = [
 # id, label, workspace, rail, theme, profile, home, area order, insight topics
 ('crm', 'Sales and CRM', 'Floorcode', 'crm', 'corelith', 'GENERAL · crm-sales', '/crm', ['sales', 'hands', 'pay', 'people', 'books'],
   [('Sales', 'funnel', '/reports/insights/sales', 'Merges /crm/reports and /crm/insights'), ('Site visits', 'calendar', '/reports/insights/site-visits', 'Was /crm/build/visits/[id]/insights'), ('Team', 'users', '/reports/insights/team', 'Was the rep scorecard on /crm/insights')]),
 ('retail', 'Retail', 'Avondale Bottle Store', 'retail', 'tender', 'RETAIL', '/retail', ['selling', 'stock', 'buying', 'customers', 'money', 'floor', 'pay', 'people', 'books'],
   [('Sales', 'receipt', '/retail/insights/sales', ''), ('Profit', 'coins', '/retail/insights/profit', ''), ('Products', 'tag', '/retail/insights/products', ''), ('Stock health', 'stack', '/retail/insights/stock', ''), ('Losses', 'warning', '/retail/insights/losses', ''), ('Customers', 'users', '/retail/insights/customers', ''), ('Money', 'money', '/retail/insights/money', 'Owner only')]),
 ('schools', 'Schools', 'Mazowe High', 'schools', 'corelith', 'SCHOOLS', '/schools', ['fees', 'day', 'pupils', 'pay', 'people', 'books'],
   [('Fees', 'money', '/reports/insights/fees', 'Was Collections and Arrears on /schools/reports'), ('Attendance', 'checklist', '/reports/insights/attendance', 'From the teacher portal class figures'), ('Enrolment', 'users', '/reports/insights/enrolment', 'Was the Enrolment tab'), ('Boarding', 'bed', '/reports/insights/boarding', 'Was Hostel occupancy')]),
 ('mine', 'Gold mine', 'Shamva Gold', 'mine', 'corelith', 'GOLD_MINE', '/gold', ['prod', 'gold', 'stores', 'safety', 'pay', 'people', 'books'],
   [('Production', 'factory', '/reports/insights/production', 'Was /dashboard, filed under Settings'), ('Downtime', 'clock', '/reports/insights/downtime', 'From the Downtime report page'), ('Gold', 'medal', '/reports/insights/gold', 'From the /gold overview'), ('Stores', 'stack', '/reports/insights/stores', 'From the stores overview')]),
 ('payroll', 'Payroll services', 'Chando Logistics', 'payroll', 'corelith', 'PAYROLL', '/payroll/runs', ['pay', 'people', 'books'],
   [('Pay cost', 'coins', '/reports/insights/pay-cost', 'From run totals'), ('Statutory', 'fileCheck', '/reports/insights/statutory', 'From the returns page')]),
 ('workshop', 'Service workshop', 'Msasa Plant Hire', 'workshop', 'corelith', 'GENERAL · service-workshop', '/maintenance', ['stores', 'safety', 'pay', 'people', 'books'],
   [('Equipment', 'wrench', '/reports/insights/equipment', 'From the Maintenance command centre'), ('Stores', 'stack', '/reports/insights/stores', 'From the stores overview')]),
]

def count(areas):
    return sum(len(tpl(a)) for a in areas)
