import json, os, shutil, re
OLD = 'canvas/project'; NEW = 'canvas2/project'; OUT = 'canvas3/project'
if os.path.exists('canvas3'): shutil.rmtree('canvas3')
shutil.copytree(OLD, OUT)
d = json.load(open(OLD + '/canvas.json'))
oldb = d['boards']
DELETE = set(k for k, b in oldb.items() if b.get('page') in ('handover', 'earlier'))
DELETE |= {f + '.dc.html' for f in (
    'PageBooksMoney', 'PageBooksVane', 'PageBooksInvoices', 'PageJobGrades', 'PageBilling', 'PageIntegrations', 'PageMarketplace', 'PageMgmtVane', 'PagePayStat',
    'PageStudioForm', 'PageStudioDocument', 'PageStudioReport', 'PageHrEmployees', 'PageHrPerson', 'PageHrLeave', 'PagePayRun', 'PagePayApprove', 'PagePayslip',
    'PageReports', 'PageReportsAll', 'PageReportBuild', 'PageInsights', 'PageVane')}
for f in DELETE:
    p = os.path.join(OUT, f)
    if os.path.exists(p): os.remove(p)
for f in os.listdir(NEW):
    shutil.copy(os.path.join(NEW, f), os.path.join(OUT, f))

boards = {k: v for k, v in oldb.items() if k not in DELETE}
notes = {k: v for k, v in d['notes'].items() if v.get('page') not in ('handover', 'earlier')}

def place(page, row_y, names, x0=0, gap=80, title=None, nid=None):
    x = x0
    for n in names:
        fn = n + '.dc.html'
        src = open(os.path.join(OUT, fn)).read()
        m = re.search(r'"\$preview":\{"width":(\d+),"height":(\d+)\}', src)
        w, h = int(m.group(1)), int(m.group(2))
        t = re.search(r'<title>(.*?)</title>', src).group(1)
        boards[fn] = {'x': x, 'y': row_y, 'w': w, 'h': h, 'title': t, 'page': page}
        x += w + gap
    if title:
        notes[nid] = {'x': x0, 'y': row_y - 140, 'text': title, 'kind': 'title1', 'maxW': max(1440, x - x0 - gap), 'page': page}
    return x

def shift(page, dy, dx=0):
    for k, b in boards.items():
        if b.get('page') == page and not k.split('.')[0] in NEWNAMES:
            b['y'] += dy; b['x'] += dx
    for k, n in notes.items():
        if n.get('page') == page and not k.startswith('k2'):
            n['y'] += dy; n['x'] += dx

NEWNAMES = {f.split('.')[0] for f in os.listdir(NEW)}

# Vane: explainers on top, For you first in the screens row, the rest shift down
shift('vane', 3400)
place('vane', 0, ['Main', 'VaneTouch', 'VaneComponents', 'VaneRules'], title='How Vane works, where people meet it, its parts and its rules', nid='k2vane0')
place('vane', 0, ['VaneForYou'], x0=6080)
# Explore: its own destination
place('explore', 0, ['ExploreHow'], title='Explore: the studio for power users, with guarded access to the workspace’s data', nid='k2ex0')
place('explore', 0, ['ExploreStudio', 'ExploreTemplates', 'ExploreSchedule', 'ExploreGuard'], x0=1520)
place('explore', 1100, ['ExploreSuggest', 'ExploreAsk', 'MgmtExplore'], x0=1520, title='Explore from other screens, and who may use it', nid='k2ex1')
# Reports & Insights: one destination
shift('reports', 1240)
place('reports', 0, ['ReportsAll', 'ReportsInsights', 'ReportMonday', 'ReportBuild', 'ReportBuildVane'], x0=3200, title='Reports and Insights, one destination: all reports, insights, a board, and the board in the builder', nid='k2r0')
# People and payroll
shift('hr', 2600)
for k, b in boards.items():
    if b.get('page') in ('hr', 'payroll'):
        if b['page'] == 'payroll': b['y'] += 3900
        b['page'] = 'people'
for k, n in notes.items():
    if n.get('page') in ('hr', 'payroll'):
        if n['page'] == 'payroll': n['y'] += 3900
        n['page'] = 'people'
place('people', 0, ['PeopleEveryone', 'PeoplePerson', 'PeopleTimeOff', 'MgmtJobGrades'], title='People: everyone, a person, time off, job grades', nid='k2p0')
place('people', 1100, ['PayRun', 'PayApprove', 'MgmtPay', 'PaySlipPhone'], title='Payroll: the run with Vane beside it, approving and paying, the settings, a payslip', nid='k2p1')
# Notifications
place('notify', 0, ['NotifyHow'], title='Notifications and activity', nid='k2n0')
place('notify', 0, ['NotifyBell', 'NotifyActivity', 'MgmtNotifications'], x0=1520)
# Books: the four reference screens first
shift('books', 1500)
place('books', 0, ['BooksMoney', 'BooksVane', 'BooksInvoices', 'BooksBank'], title='Books: money, with Vane open, invoices and the bank', nid='k2b0')
# Builders
shift('builders', 1500)
place('builders', 0, ['BuildForm', 'BuildDocument', 'BuildReport'], title='One builder for forms, documents and reports. Every panel resizes.', nid='k2bu0')
# Management
shift('management', 1500)
place('management', 0, ['MgmtVane', 'MgmtBilling', 'MgmtIntegrations', 'MgmtMarketplace'], title='Management: Vane, billing, integrations and the marketplace', nid='k2m0')

d['pages'] = [{'id': 'vane', 'name': 'Vane'}, {'id': 'explore', 'name': 'Explore'}, {'id': 'reports', 'name': 'Reports & Insights'},
              {'id': 'people', 'name': 'People and payroll'}, {'id': 'notify', 'name': 'Notifications'}, {'id': 'books', 'name': 'Books'},
              {'id': 'builders', 'name': 'Build'}, {'id': 'management', 'name': 'Management'}, {'id': 'branding', 'name': 'Branding'}, {'id': 'parts', 'name': 'Themes and parts'}]
d['launch'] = {'view': 'canvas', 'page': 'explore'}
d['boards'] = boards
d['notes'] = notes
d['order'] = [k for k in d['order'] if k in boards] + [k for k in boards if k not in d['order']]
json.dump(d, open(OUT + '/canvas.json', 'w'), ensure_ascii=False, indent=1)
files = {('project/' + f): ('project/' + f) for f in os.listdir(OUT) if f.endswith('.dc.html') and f in boards}
for f in DELETE:
    if f not in boards: files['project/' + f] = None
json.dump(files, open('canvas3/files.json', 'w'), indent=0)
print(len(boards), 'boards;', len([v for v in files.values() if v is None]), 'deleted;', len(notes), 'notes')
print(sorted({b['page'] for b in boards.values()}))

# stickies for this correction
def sticky(nid, page, x, y, text, w=420):
    notes[nid] = {'x': x, 'y': y, 'w': w, 'text': text, 'size': 's', 'page': page}
notes['nBooks']['text'] = ('Built on what /accounting has today: receivables, payables, journals, periods and the close checklist, posting rules, VAT returns, fiscalisation and the reports.\n\n'
                           'Bank follows the reference design: statement upload and Vane’s proposed matches. Banking reconciliation is parked in the app today, so Bank is new work.')
sticky('k2exs', 'explore', 7600, 0, 'Explore has its own place on the rail, between Reports and Documents, for power users.\n\n'
       'Every panel resizes: drag the tables list’s edge, the line between Steps and SQL, and the editor’s foot to give the rows more room.\n\n'
       'Guarded: questions run as explore_reader (select and with only), see only the tables the person’s role reads in the app and only this workspace’s rows, return at most 5,000 rows and stop at 10 s. A change is refused before it runs. Management → Explore sets who may use it.')
sticky('k2rs', 'reports', 10800, 0, 'Reports and Insights are one destination: Overview, Insights, All reports, Yours, Shared with you, From Corelith, then Folders and Build. Explore moved out to its own place on the rail.\n\n'
       'The builder’s outline, inspector and question shelf resize from their edges; widths are kept per person.')
sticky('k2bus', 'builders', 4560, 0, 'The form, document and report builders share one frame. The outline and the inspector resize from their edges (drag the grip at the panel’s foot), and the canvas takes what is left; each person’s widths are kept.')
sticky('k2ps', 'people', 6240, 0, 'People holds payroll, as in the reference: Everyone, Time off, Payroll, Loans and advances, Documents, Starting and leaving.\n\nManagement stays off the panel’s foot; the gear on the rail opens it.')
json.dump(d, open(OUT + '/canvas.json', 'w'), ensure_ascii=False, indent=1)
