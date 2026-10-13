import re, glob, collections, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ck
Z = 'zip-core/corelith-core-modules/html/'
ROOT = sys.argv[1]
cnt = collections.Counter()
for f in glob.glob(Z + '*.html'):
    s = open(f).read()
    for st in re.findall(r'<style>(.*?)</style>', s, re.S):
        for line in set(l.strip() for l in st.split('\n') if l.strip()):
            cnt[line] += 1
SHARED = {r for r, c in cnt.items() if c >= 14}

BOARDS = {
    # zip file: (board, title)
    'vane.html': ('VaneForYou', 'Vane · For you · /vane'),
    'books-money.html': ('BooksMoney', 'Books · Money · /books'),
    'books-vane.html': ('BooksVane', 'Books · Money, with Vane open'),
    'books-invoices.html': ('BooksInvoices', 'Books · Invoices · /books/invoices'),
    'books-bank.html': ('BooksBank', 'Books · Bank · /books/bank'),
    'reports.html': ('ReportsAll', 'Reports · All reports · /reports'),
    'report.html': ('ReportMonday', 'Reports · Monday board · /reports/monday-board'),
    'report-build.html': ('ReportBuild', 'Reports · Monday board, in the builder · /reports/monday-board/edit'),
    'report-build-vane.html': ('ReportBuildVane', 'Reports · Vane’s suggestion, in the builder'),
    'reports-insights.html': ('ReportsInsights', 'Reports · Insights · /reports/insights'),
    'management-job-grades.html': ('MgmtJobGrades', 'Management · Job grades'),
    'management-billing.html': ('MgmtBilling', 'Management · Billing'),
    'management-integrations.html': ('MgmtIntegrations', 'Management · Integrations'),
    'management-marketplace.html': ('MgmtMarketplace', 'Management · Marketplace'),
    'management-vane.html': ('MgmtVane', 'Management · Vane'),
    'studio-form.html': ('BuildForm', 'Build · Form · Floor site visit'),
    'studio-document.html': ('BuildDocument', 'Build · Document · Quotation'),
    'studio-report.html': ('BuildReport', 'Build · Report · Fees this term (Schools)'),
}

# Resizable builder panels: tracks become auto, the panels carry their own width and drag edge.
RESIZE = {
 'report-build.html': '''
.rb2{grid-template-columns:56px auto minmax(0,1fr) auto;grid-template-rows:56px minmax(0,1fr) auto}
.rb-out{width:240px;resize:horizontal;overflow:auto;min-width:200px;max-width:400px}
.rb-ins{width:320px;resize:horizontal;overflow:auto;min-width:280px;max-width:520px;direction:rtl}.rb-ins>*{direction:ltr}
.rb-shelf{grid-template-columns:auto auto minmax(0,1fr);height:272px;resize:vertical;overflow:auto;min-height:160px;max-height:560px}
.rb-shelf>.sh-q{width:200px;resize:horizontal;overflow:auto;min-width:160px;max-width:320px}
.rb-shelf>.sh-s{width:360px;resize:horizontal;overflow:auto;min-width:260px;max-width:560px}
''',
 'studio-form.html': '''
.st{grid-template-columns:auto minmax(0,1fr) auto}
.st-out{width:240px;resize:horizontal;overflow:auto;min-width:200px;max-width:400px}
.st-ins{width:320px;resize:horizontal;overflow:auto;min-width:280px;max-width:520px;direction:rtl}.st-ins>*{direction:ltr}
''',
}
RESIZE['report-build-vane.html'] = RESIZE['report-build.html'].replace('height:272px', 'height:340px')
RESIZE['studio-document.html'] = RESIZE['studio-form.html']
RESIZE['studio-report.html'] = RESIZE['studio-form.html']

def convert(fname):
    s = open(Z + fname).read()
    css = []
    for st in re.findall(r'<style>(.*?)</style>', s, re.S):
        for line in st.split('\n'):
            line = line.strip()
            if line and line not in SHARED and not line.startswith('@font-face'):
                css.append(line)
    css.append(RESIZE.get(fname, ''))
    body = s[s.index('<body>') + 6:s.rindex('</body>')]
    body = re.sub(r'<script.*?</script>', '', body, flags=re.S)
    m = re.search(r'<nav class="rail-m".*?</nav>', body, re.S)
    if m:
        on = re.search(r'class="rm is-on"[^>]*aria-label="([^"]+)"', m.group(0))
        body = body.replace(m.group(0), ck.rail(on.group(1) if on else None))
    # Management opens from the gear; the panel foot keeps Help only
    body = re.sub(r'<a class="pn" href="#Management">.*?</a>', '', body, flags=re.S)
    for k, v in ck.MARK.items():
        body = body.replace('src="%s"' % k, 'src="%s"' % v)
    board, title = BOARDS[fname]
    ck.write(ROOT, board, title, body.strip(), css='\n'.join(css))
    return board

if __name__ == '__main__':
    for f in BOARDS:
        print(convert(f))
