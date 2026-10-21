# Corelith UI icons: every icon, by category. 18px grid, 1.5px stroke.
import math
from dsl import *

I = {}  # name -> dict(cat, tags, groups)


def add(name, cat, tags, groups):
    assert name not in I, name
    I[name] = {"cat": cat, "tags": tags, "groups": groups}


# ------------------------------------------------------------------ parts
def cal_parts(sec=True):
    return [E("b", rect(2.25, 3.25, 13.5, 12.5, 2.5)), E("c", line(2.25, 7.25, 15.75, 7.25), sec=sec),
            E("l", line(5.75, 1.75, 5.75, 4.25)), E("l", line(12.25, 1.75, 12.25, 4.25))]


def note_parts():
    return [E("b", rect(1.75, 4.75, 14.5, 8.5, 2)), E("h", circ(9, 9, 1.75)),
            E("c", line(4.75, 9, 4.75, 9), sec=True), E("c", line(13.25, 9, 13.25, 9), sec=True)]


def coin_parts(cx=9, cy=9, r=7.25, sec=True):
    s = r / 7.25
    return [E("b", circ(cx, cy, r)),
            E("c", f"M{f(cx+2*s)} {f(cy-2.1*s)}C{f(cx+1.6*s)} {f(cy-2.9*s)} {f(cx-2.4*s)} {f(cy-3.1*s)} {f(cx-2.4*s)} {f(cy-1.1*s)}C{f(cx-2.4*s)} {f(cy+0.9*s)} {f(cx+2.4*s)} {f(cy-0.4*s)} {f(cx+2.4*s)} {f(cy+1.3*s)}C{f(cx+2.4*s)} {f(cy+3.2*s)} {f(cx-1.6*s)} {f(cy+3.1*s)} {f(cx-2.1*s)} {f(cy+2.2*s)}", sec=sec),
            E("c", line(cx, cy - 4.1 * s, cx, cy + 4.1 * s), sec=sec)]


def doc_lines(n=3, sec=True):
    ys = [9.25, 12.25] if n == 2 else [9.25, 12.25] if n == 2.5 else [8.75, 11.25, 13.75]
    out = []
    for i, y in enumerate(ys):
        out.append(E("c", line(6.25, y, 11.75 if i < len(ys) - 1 else 9.25, y), sec=sec))
    return out


def user_parts(cx=9, top=2.25, sec=False):
    return [E("b", circ(cx, top + 3, 3)), E("b", f"M{f(cx-5.75)} {f(16.25)}A5.75 5.25 0 0 1 {f(cx+5.75)} 16.25Z", sec=sec)]


def book_parts():
    return [E("b", "M3.25 14.25V3.75A2 2 0 0 1 5.25 1.75H14.75V12.25H5.25A2 2 0 0 0 3.25 14.25ZM3.25 14.25A2 2 0 0 0 5.25 16.25H14.75V12.25")]


def gear(cx=9, cy=9, ro=7.25, ri=5.6, n=8):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        for da, r in ((-0.22, ri), (-0.12, ro), (0.12, ro), (0.22, ri)):
            pts.append((cx + r * math.cos(a + da), cy + r * math.sin(a + da)))
    return poly(*pts, close=True)


def register_parts():
    # A till: display on top, body, drawer.
    return [E("b", rect(4.25, 1.75, 9.5, 5, 1.5)), E("b", "M3.25 9.25A1.5 1.5 0 0 1 4.75 7.75H13.25A1.5 1.5 0 0 1 14.75 9.25L15.75 14.25H2.25Z"),
            E("b", rect(2.25, 14.25, 13.5, 2, 0.75)), E("c", line(7, 4.25, 11, 4.25), sec=True),
            E("c", line(6, 10.75, 6, 10.75), sec=True), E("c", line(9, 10.75, 9, 10.75), sec=True), E("c", line(12, 10.75, 12, 10.75), sec=True)]


# ------------------------------------------------------------------ navigation and modules
add("home", "Navigation", "house start overview", one(E("b", "M2.75 7.4L8.35 2.55A1 1 0 0 1 9.65 2.55L15.25 7.4V14.25A2 2 0 0 1 13.25 16.25H4.75A2 2 0 0 1 2.75 14.25Z"), E("c", "M7 16.25V12.5A2 2 0 0 1 11 12.5V16.25", sec=True)))
add("pipeline", "Navigation", "funnel crm deals stages", one(E("b", "M2.75 2.75H15.25A0.75 0.75 0 0 1 15.8 4L10.75 9.6V15.1A0.6 0.6 0 0 1 9.85 15.65L7.75 14.45A1 1 0 0 1 7.25 13.6V9.6L2.2 4A0.75 0.75 0 0 1 2.75 2.75Z")))
add("calendar", "Time", "date day schedule", one(*cal_parts()))
add("site-visit", "Navigation", "calendar visit appointment pin", with_badge(cal_parts(), "user"))
add("store", "Places", "shop showroom retail", one(E("b", "M3.25 8.25V14.75A1.5 1.5 0 0 0 4.75 16.25H13.25A1.5 1.5 0 0 0 14.75 14.75V8.25"), E("b", "M2.4 6.6L3.6 2.75H14.4L15.6 6.6A1.6 1.6 0 0 1 14 8.25H4A1.6 1.6 0 0 1 2.4 6.6Z"), E("c", "M7.25 16.25V12.75A1 1 0 0 1 8.25 11.75H9.75A1 1 0 0 1 10.75 12.75V16.25", sec=True)))
add("wallet", "Money", "purse books money accounts", one(E("b", rect(1.75, 3.75, 14.5, 11.5, 2.25)), E("c", "M16.25 7.25H12.75A2.25 2.25 0 0 0 12.75 11.75H16.25", sec=True), E("d", dot(12.9, 9.5, 0.85))))
add("chart-bar", "Charts", "report graph bars", one(E("b", rect(2.25, 9.25, 3, 6.5, 1)), E("b", rect(7.5, 2.25, 3, 13.5, 1)), E("b", rect(12.75, 6.25, 3, 9.5, 1), sec=True)))
add("document", "Documents", "page file paper", one(*page(), *doc_lines(3)))
add("users", "People", "people team group staff", [{"els": [E("b", circ(6.75, 5.25, 2.75)), E("b", "M1.75 14.75A5 5 0 0 1 11.75 14.75Z")]}, {"els": [E("b", circ(12.5, 5.75, 2.25), sec=True), E("l", "M13.25 10.4A4.25 4.25 0 0 1 16.25 14.4", sec=True)]}])
add("user", "People", "person profile account", one(*user_parts()))
add("settings", "Navigation", "gear cog preferences management", one(E("b", gear()), E("h", circ(9, 9, 2.25))))
add("help", "Status", "question support", one(E("b", circ(9, 9, 7.25)), E("c", "M7.1 7.1A1.95 1.95 0 0 1 10.9 7.6C10.9 8.9 9 9.15 9 10.6"), E("c", line(9, 12.9, 9, 12.9))))
add("search", "Actions", "find look magnifier", one(E("b", circ(8, 8, 5.5)), E("l", line(12, 12, 15.75, 15.75))))
add("sidebar", "Navigation", "panel layout toggle", one(E("b", rect(1.75, 2.75, 14.5, 12.5, 2.5)), E("c", line(6.75, 2.75, 6.75, 15.25), sec=True)))
add("menu", "Navigation", "hamburger lines", one(E("l", line(2.75, 4.75, 15.25, 4.75)), E("l", line(2.75, 9, 15.25, 9)), E("l", line(2.75, 13.25, 15.25, 13.25))))
add("apps", "Navigation", "grid marketplace modules", one(E("b", rect(2.25, 2.25, 5.5, 5.5, 1.5)), E("b", rect(10.25, 2.25, 5.5, 5.5, 1.5), sec=True), E("b", rect(2.25, 10.25, 5.5, 5.5, 1.5), sec=True), E("b", rect(10.25, 10.25, 5.5, 5.5, 1.5))))

# ------------------------------------------------------------------ books levels
add("coins", "Money", "money cash coins balance", [{"els": [E("b", circ(6.75, 6.75, 5))], "gaps": [circ(11.25, 11.25, 6.5)]}, {"els": coin_parts(11.25, 11.25, 5)}])
add("money-in", "Money", "sales income received inflow", one(E("b", circ(9, 9, 7.25)), E("c", line(12, 6, 6.5, 11.5)), E("c", poly((6.25, 7.5), (6.25, 11.75), (10.5, 11.75)))))
add("money-out", "Money", "spending expense outflow paid", one(E("b", circ(9, 9, 7.25)), E("c", line(6, 12, 11.5, 6.5)), E("c", poly((7.5, 6.25), (11.75, 6.25), (11.75, 10.5)))))
add("bank", "Money", "bank building account", one(E("b", "M2.25 6.6L8.6 2.15A0.7 0.7 0 0 1 9.4 2.15L15.75 6.6V7.25H2.25Z"), E("l", line(4.25, 9.75, 4.25, 13), sec=True), E("l", line(7.5, 9.75, 7.5, 13), sec=True), E("l", line(10.5, 9.75, 10.5, 13), sec=True), E("l", line(13.75, 9.75, 13.75, 13), sec=True), E("l", line(1.75, 15.75, 16.25, 15.75))))
add("government", "Money", "tax authority zimra state", one(E("b", "M5.25 7.25A3.75 3.75 0 0 1 12.75 7.25Z"), E("l", line(9, 1.75, 9, 3.5)), E("l", line(2.25, 7.25, 15.75, 7.25)), E("l", line(4.25, 9.75, 4.25, 13), sec=True), E("l", line(7.5, 9.75, 7.5, 13), sec=True), E("l", line(10.5, 9.75, 10.5, 13), sec=True), E("l", line(13.75, 9.75, 13.75, 13), sec=True), E("l", line(1.75, 15.75, 16.25, 15.75))))
add("calendar-check", "Time", "close month done period", with_badge(cal_parts(), "check"))
add("book", "Ledger", "ledger accounts books", one(*book_parts(), E("c", "M3.25 14.25A2 2 0 0 1 5.25 12.25H14.75", sec=True), E("c", line(7.25, 5.75, 11.25, 5.75), sec=True)))

# ------------------------------------------------------------------ documents
add("invoice", "Documents", "bill sales document", one(*page(), E("c", line(6.25, 5.25, 8.25, 5.25), sec=True), E("c", line(6.25, 9.25, 11.75, 9.25)), E("c", line(6.25, 12.25, 8.75, 12.25)), E("c", line(10.75, 12.25, 11.75, 12.25))))
add("quote", "Documents", "estimate proposal", one(*page(), E("k", circ(7.25, 9.75, 1.15)), E("c", "M8.4 9.75C8.4 11.25 7.6 12.25 6.4 12.75"), E("k", circ(10.75, 9.75, 1.15)), E("c", "M11.9 9.75C11.9 11.25 11.1 12.25 9.9 12.75")))
add("credit-note", "Documents", "refund credit minus", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "minus"))
add("bill", "Documents", "supplier bill receipt payable", one(receipt(), E("c", line(7, 5.75, 11, 5.75), sec=True), E("c", line(7, 8.75, 11, 8.75)), E("c", line(7, 11.75, 9, 11.75))))
add("receipt", "Documents", "receipt slip spending", one(receipt(), E("c", line(7, 5.75, 11, 5.75)), E("c", line(7, 8.75, 11, 8.75), sec=True)))
add("receipt-check", "Documents", "account for acquit receipt done", with_badge([receipt(), E("c", line(7, 5.75, 11, 5.75)), E("c", line(7, 8.75, 9.5, 8.75), sec=True)], "check", 13.5, 13.5))
add("clipboard", "Documents", "purchase order checklist", one(E("b", "M6.25 3.25H4.75A1.5 1.5 0 0 0 3.25 4.75V14.75A1.5 1.5 0 0 0 4.75 16.25H13.25A1.5 1.5 0 0 0 14.75 14.75V4.75A1.5 1.5 0 0 0 13.25 3.25H11.75"), E("b", rect(6.25, 1.75, 5.5, 3, 1)), E("c", line(6.25, 9.25, 11.75, 9.25), sec=True), E("c", line(6.25, 12.25, 9.75, 12.25), sec=True)))
add("purchase-order", "Documents", "po order buy", with_badge([E("b", "M6.25 3.25H4.75A1.5 1.5 0 0 0 3.25 4.75V14.75A1.5 1.5 0 0 0 4.75 16.25H13.25A1.5 1.5 0 0 0 14.75 14.75V4.75A1.5 1.5 0 0 0 13.25 3.25H11.75"), E("b", rect(6.25, 1.75, 5.5, 3, 1)), E("c", line(6.25, 9.25, 11.75, 9.25), sec=True)], "plus"))
add("doc-plus", "Documents", "new file create add", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "plus"))
add("doc-check", "Documents", "issued approved done file", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "check"))
add("doc-slash", "Documents", "void cancel file", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "slash", 13.25, 13.25))
add("doc-pencil", "Documents", "revise edit file", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "pencil"))
add("doc-search", "Documents", "audit trail find file", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "search"))
add("doc-clock", "Documents", "pending due file", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "clock"))
add("doc-out", "Documents", "export send file", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "out"))
add("doc-percent", "Tax", "vat return tax file", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "percent"))
add("doc-chart", "Ledger", "financial statements report file", one(*page(), E("c", line(6.75, 13.25, 6.75, 11.25), sec=True), E("c", line(9, 13.25, 9, 9.25)), E("c", line(11.25, 13.25, 11.25, 10.75), sec=True)))
add("payslip", "People", "pay slip salary statutory", with_badge(page() + [E("c", line(6.25, 9.25, 9.75, 9.25), sec=True)], "coin"))
add("statement", "Documents", "account statement customer", one(*page(), E("c", line(6.25, 8.75, 8.25, 8.75), sec=True), E("c", line(6.25, 11.25, 11.75, 11.25)), E("c", line(6.25, 13.75, 11.75, 13.75))))
add("template", "Documents", "layout template page", one(E("b", rect(2.75, 1.75, 12.5, 14.5, 2)), E("c", line(2.75, 6.25, 15.25, 6.25), sec=True), E("c", line(7.25, 6.25, 7.25, 16.25), sec=True)))
add("sheet", "Documents", "spreadsheet xlsx csv table file", one(*page(), E("c", line(6.25, 9.25, 11.75, 9.25), sec=True), E("c", line(6.25, 12.25, 11.75, 12.25), sec=True), E("c", line(9, 9.25, 9, 14.25), sec=True)))
add("folder", "Documents", "folder directory files", one(E("b", "M1.75 5.25A2 2 0 0 1 3.75 3.25H6.6A1.5 1.5 0 0 1 7.7 3.7L9 5H14.25A2 2 0 0 1 16.25 7V13.25A2 2 0 0 1 14.25 15.25H3.75A2 2 0 0 1 1.75 13.25Z"), E("c", line(1.75, 7.25, 16.25, 7.25), sec=True)))
add("archive", "Documents", "archive box store", one(E("b", rect(1.75, 2.75, 14.5, 3.75, 1.25)), E("b", "M2.75 6.5V13.75A1.5 1.5 0 0 0 4.25 15.25H13.75A1.5 1.5 0 0 0 15.25 13.75V6.5"), E("c", line(7.25, 9.25, 10.75, 9.25), sec=True)))
add("certificate", "Documents", "permit licence certificate itf263", with_badge([E("b", rect(1.75, 2.75, 14.5, 10.5, 2)), E("c", line(4.75, 6.25, 13.25, 6.25), sec=True), E("c", line(4.75, 9.25, 8.75, 9.25), sec=True)], "star", 12.75, 13.25))
add("journal", "Ledger", "journal entry notebook", one(E("b", rect(3.25, 1.75, 11.5, 14.5, 2)), E("c", line(6.25, 1.75, 6.25, 16.25), sec=True), E("c", line(8.75, 6.25, 11.75, 6.25)), E("c", line(8.75, 9.25, 11.75, 9.25))))
add("journal-plus", "Ledger", "new journal entry", with_badge([E("b", rect(3.25, 1.75, 11.5, 14.5, 2)), E("c", line(6.25, 1.75, 6.25, 16.25), sec=True), E("c", line(8.75, 6.25, 11.75, 6.25))], "plus"))
add("book-open", "Ledger", "general ledger read", one(E("b", "M9 4.25C7.5 3 5 2.6 1.75 2.75V13.75C5 13.6 7.5 14 9 15.25C10.5 14 13 13.6 16.25 13.75V2.75C13 2.6 10.5 3 9 4.25Z"), E("c", line(9, 4.25, 9, 15.25), sec=True)))

# ------------------------------------------------------------------ money
add("banknote", "Money", "cash note money", one(*note_parts()))
add("payment-in", "Money", "payment received receipt cash in", with_badge(note_parts(), "in", 14, 13.75))
add("payment-out", "Money", "payment made pay out cash out", with_badge(note_parts(), "out", 14, 13.75))
add("coin", "Money", "dollar currency usd coin", one(*coin_parts()))
add("hand-coin", "Money", "requisition request ask for money advance", one(E("b", circ(11, 5, 3.25), sec=True), E("l", "M1.75 10.75H4.25C5 10.75 5.6 10.5 6.2 10.1L7.25 9.4C7.8 9 8.5 8.9 9.1 9.1L11.6 9.9C12.3 10.1 12.5 11 12 11.5C11.7 11.8 11.25 11.9 10.85 11.8L8.25 11.25"), E("l", "M1.75 15.25H9.1C9.9 15.25 10.6 15 11.2 14.55L15.5 11.4C16.15 10.9 16.2 10 15.6 9.45C15.15 9.05 14.5 9 14 9.35L12.1 10.6")))
add("cash-box", "Money", "petty cash float tin claims", one(E("b", rect(1.75, 6.25, 14.5, 9.5, 2)), E("b", "M3.25 6.25L4.4 3.4A1 1 0 0 1 5.35 2.75H12.65A1 1 0 0 1 13.6 3.4L14.75 6.25", sec=True), E("c", line(6.75, 9.75, 11.25, 9.75))))
add("safe", "Money", "vault safe money accounts", one(E("b", rect(1.75, 2.25, 14.5, 12.5, 2)), E("h", circ(9, 8.5, 2.5)), E("l", line(4.75, 14.75, 4.75, 16.25), sec=True), E("l", line(13.25, 14.75, 13.25, 16.25), sec=True)))
add("card", "Money", "bank card billing payment", one(E("b", rect(1.75, 3.75, 14.5, 10.5, 2)), E("c", line(1.75, 7.25, 16.25, 7.25)), E("c", line(4.75, 11, 7.25, 11), sec=True)))
add("mobile-money", "Money", "ecocash phone wallet mobile", with_badge([E("b", rect(3.25, 1.75, 8.5, 14.5, 2)), E("c", line(6.25, 13.25, 8.75, 13.25), sec=True)], "coin", 13, 11.25))
add("register", "Money", "till cash register takings pos", one(*register_parts()))
add("fiscal-device", "Tax", "fdms fiscal printer terminal pos", one(E("b", "M6.25 4.25V2.25A0.5 0.5 0 0 1 6.75 1.75H11.25A0.5 0.5 0 0 1 11.75 2.25V4.25", sec=True), E("b", rect(3.75, 4.25, 10.5, 12, 2)), E("c", rect(6.25, 6.75, 5.5, 3, 0.5), sec=True), E("c", line(6.5, 12.75, 6.5, 12.75)), E("c", line(9, 12.75, 9, 12.75)), E("c", line(11.5, 12.75, 11.5, 12.75))))
add("qr", "Tax", "qr code fiscal register scan", one(E("b", rect(2.25, 2.25, 5.5, 5.5, 1.25)), E("b", rect(10.25, 2.25, 5.5, 5.5, 1.25)), E("b", rect(2.25, 10.25, 5.5, 5.5, 1.25)), E("d", rect(10.25, 10.25, 2.25, 2.25, 0.5)), E("d", rect(13.5, 13.5, 2.25, 2.25, 0.5)), E("d", rect(13.5, 10.25, 2.25, 2.25, 0.5), sec=True), E("d", rect(10.25, 13.5, 2.25, 2.25, 0.5), sec=True)))
add("percent", "Tax", "tax vat rate", one(E("l", line(14, 4, 4, 14)), E("b", circ(5, 5, 2), sec=True), E("b", circ(13, 13, 2), sec=True)))
add("tag-percent", "Tax", "tax codes rules discount label", one(E("b", "M2.25 3.75V8.4A1.5 1.5 0 0 0 2.7 9.45L8.8 15.55A1.5 1.5 0 0 0 10.9 15.55L15.55 10.9A1.5 1.5 0 0 0 15.55 8.8L9.45 2.7A1.5 1.5 0 0 0 8.4 2.25H3.75A1.5 1.5 0 0 0 2.25 3.75Z"), E("c", line(11, 7.5, 7.5, 11), sec=True), E("c", line(5.75, 5.75, 5.75, 5.75))))
add("calculator", "Money", "calculate sum figures", one(E("b", rect(3.25, 1.75, 11.5, 14.5, 2)), E("c", rect(6, 4.5, 6, 2.5, 0.5), sec=True), E("c", line(6.25, 10.25, 6.25, 10.25)), E("c", line(9, 10.25, 9, 10.25)), E("c", line(11.75, 10.25, 11.75, 10.25)), E("c", line(6.25, 13.25, 6.25, 13.25)), E("c", line(9, 13.25, 9, 13.25)), E("c", line(11.75, 13.25, 11.75, 13.25))))
add("scale", "Ledger", "balance trial balance weigh posting", one(E("l", line(9, 2.25, 9, 15.75)), E("l", line(5.25, 15.75, 12.75, 15.75)), E("l", line(3.5, 4.75, 14.5, 4.75)), E("b", "M1.75 10.25L3.5 5.25L5.25 10.25A1.75 1.75 0 0 1 1.75 10.25Z", sec=True), E("b", "M12.75 10.25L14.5 5.25L16.25 10.25A1.75 1.75 0 0 1 12.75 10.25Z", sec=True)))
add("exchange", "Money", "rates revaluation currency swap fx", one(E("l", "M15.25 6.25H3.25"), E("l", poly((12.25, 3.25), (15.25, 6.25), (12.25, 9.25))), E("l", "M2.75 11.75H14.75", sec=True), E("l", poly((5.75, 8.75), (2.75, 11.75), (5.75, 14.75)), sec=True)))
add("transfer", "Money", "move between accounts arrows", one(E("l", line(5.75, 15.25, 5.75, 2.75)), E("l", poly((2.75, 5.75), (5.75, 2.75), (8.75, 5.75))), E("l", line(12.25, 2.75, 12.25, 15.25), sec=True), E("l", poly((9.25, 12.25), (12.25, 15.25), (15.25, 12.25)), sec=True)))
add("bank-check", "Money", "mark banked deposited", with_badge([E("b", "M2.25 6.6L8.6 2.15A0.7 0.7 0 0 1 9.4 2.15L15.75 6.6V7.25H2.25Z"), E("l", line(4.25, 9.75, 4.25, 13), sec=True), E("l", line(7.5, 9.75, 7.5, 13), sec=True), E("l", line(1.75, 15.75, 9, 15.75))], "check", 13.25, 13.25))
add("money-percent", "Tax", "money and tax settings", with_badge(coin_parts(8.25, 8.25, 6.5), "percent"))
add("withholding", "Tax", "withheld deduction coin minus", with_badge(coin_parts(8.25, 8.25, 6.5), "minus"))
add("calendar-coin", "Tax", "provisional tax qpd instalment", with_badge(cal_parts(), "coin"))
add("calendar-clock", "Time", "due dates what's due", with_badge(cal_parts(), "clock"))
add("calendar-lock", "Time", "locks periods closed month freeze", with_badge(cal_parts(), "lock"))

# ------------------------------------------------------------------ ledger and close
add("list-check", "Ledger", "checklist tasks close", one(E("l", poly((2.25, 4.5), (3.5, 5.75), (5.75, 3.25))), E("l", poly((2.25, 12), (3.5, 13.25), (5.75, 10.75))), E("l", line(8.75, 4.5, 15.75, 4.5), sec=True), E("l", line(8.75, 12, 15.75, 12), sec=True)))
add("inbox", "Ledger", "tray queue", one(E("b", "M1.75 10.25L3.9 3.6A1.25 1.25 0 0 1 5.1 2.75H12.9A1.25 1.25 0 0 1 14.1 3.6L16.25 10.25V13.75A1.5 1.5 0 0 1 14.75 15.25H3.25A1.5 1.5 0 0 1 1.75 13.75Z"), E("c", "M1.75 10.25H5.75L6.75 12.25H11.25L12.25 10.25H16.25", sec=True)))
add("needs-posting", "Ledger", "failed events queue inbox alert", with_badge([E("b", "M1.75 10.25L3.9 3.6A1.25 1.25 0 0 1 5.1 2.75H12.9A1.25 1.25 0 0 1 14.1 3.6L16.25 10.25V13.75A1.5 1.5 0 0 1 14.75 15.25H3.25A1.5 1.5 0 0 1 1.75 13.75Z"), E("c", "M1.75 10.25H5.75L6.75 12.25H11.25L12.25 10.25H16.25", sec=True)], "alert", 14.25, 13.5))
add("flag", "Ledger", "year end finish milestone", one(E("l", line(3.25, 16.25, 3.25, 2.25)), E("b", "M3.25 2.75H13.9A0.6 0.6 0 0 1 14.4 3.65L12.25 6.75L14.4 9.85A0.6 0.6 0 0 1 13.9 10.75H3.25Z", sec=True)))
add("tree", "Ledger", "chart of accounts hierarchy", one(E("b", rect(1.75, 1.75, 5, 4, 1.25)), E("l", "M4.25 5.75V12.75A1.5 1.5 0 0 0 5.75 14.25H9.75", sec=True), E("l", line(4.25, 9.25, 9.75, 9.25), sec=True), E("b", rect(9.75, 7.25, 6.5, 4, 1.25)), E("b", rect(9.75, 12.25, 6.5, 4, 1.25))))
add("target", "Ledger", "cost centre goal aim", one(E("b", circ(9, 9, 7.25)), E("c", circ(9, 9, 4), sec=True), E("h", circ(9, 9, 1.25))))
add("route", "Ledger", "posting rules flow mapping", one(E("b", circ(4.25, 4.25, 2.5)), E("b", circ(13.75, 13.75, 2.5)), E("l", "M6.75 4.25H11.75A2.75 2.75 0 0 1 11.75 9.75H6.25A2.75 2.75 0 0 0 6.25 15.25H11.25", sec=True)))
add("hash", "Ledger", "numbering number series", one(E("l", line(7, 2.25, 5.5, 15.75)), E("l", line(12.5, 2.25, 11, 15.75)), E("l", line(2.75, 6.25, 15.75, 6.25), sec=True), E("l", line(2.25, 11.75, 15.25, 11.75), sec=True)))
add("stamp", "Ledger", "approvals approve stamp", one(E("b", "M7.25 8.75V6.75A2.5 2.5 0 0 1 6.5 4.5A2.5 2.5 0 1 1 11.5 4.5A2.5 2.5 0 0 1 10.75 6.75V8.75"), E("b", rect(2.25, 8.75, 13.5, 4, 1.5)), E("l", line(3.75, 15.75, 14.25, 15.75), sec=True)))
add("copy-check", "Ledger", "reconcile reconciliation matched", [{"els": [E("b", rect(1.75, 1.75, 10, 10, 2), sec=True)], "gaps": [rect(4.75, 4.75, 13, 13, 3)]}, {"els": [E("b", rect(6.25, 6.25, 10, 10, 2)), E("c", poly((8.75, 11.25), (10.5, 13), (13.75, 9.5)))]}])
add("match", "Ledger", "to match link pair bank lines", one(E("b", rect(1.75, 2.75, 6, 4.5, 1.25)), E("b", rect(10.25, 10.75, 6, 4.5, 1.25)), E("l", "M7.75 5H10.25A2.5 2.5 0 0 1 12.75 7.5V10.75", sec=True), E("l", poly((11, 9), (12.75, 10.75), (14.5, 9)), sec=True)))
add("history", "Time", "activity log audit time", one(E("l", "M2.75 9A6.25 6.25 0 1 0 4.6 4.6L2.75 6.5"), E("l", poly((2.75, 2.75), (2.75, 6.5), (6.5, 6.5))), E("l", poly((9, 5.75), (9, 9), (11.25, 10.5)), sec=True)))
add("clock", "Time", "time pending hours", one(E("b", circ(9, 9, 7.25)), E("c", poly((9, 5.25), (9, 9), (11.5, 10.75)))))
add("lock", "Status", "locked freeze secure closed", one(E("b", rect(3.25, 7.75, 11.5, 8.5, 2)), E("l", "M5.75 7.75V5.25A3.25 3.25 0 0 1 12.25 5.25V7.75"), E("c", line(9, 11.25, 9, 12.75), sec=True)))
add("unlock", "Status", "open reopen unlocked", one(E("b", rect(3.25, 7.75, 11.5, 8.5, 2)), E("l", "M5.75 7.75V5.25A3.25 3.25 0 0 1 12.05 4.15"), E("c", line(9, 11.25, 9, 12.75), sec=True)))
add("key", "Status", "access password key", one(E("b", circ(6, 12, 4.25)), E("h", circ(5.5, 12.5, 1.1)), E("l", line(9, 9, 15.75, 2.25)), E("l", line(13.25, 4.75, 15.25, 6.75), sec=True), E("l", line(11.25, 6.75, 12.75, 8.25), sec=True)))
add("seal-check", "Status", "finalise verified approved badge", one(E("b", "M9 1.75L11 3.25L13.5 3.1L14.25 5.5L16.25 7L15.4 9.4L16.25 11.75L14.25 13.25L13.5 15.6L11 15.5L9 17L7 15.5L4.5 15.6L3.75 13.25L1.75 11.75L2.6 9.4L1.75 7L3.75 5.5L4.5 3.1L7 3.25Z"), E("c", poly((6.25, 9.25), (8.25, 11.25), (11.75, 7.25)))))

# ------------------------------------------------------------------ people and places
add("user-plus", "People", "add person invite", with_badge(user_parts(8, 2.25), "plus"))
add("user-check", "People", "approved person verify", with_badge(user_parts(8, 2.25), "check"))
add("user-circle", "People", "customer contact client", one(E("b", circ(9, 9, 7.25)), E("c", circ(9, 7.25, 2.25), sec=True), E("c", "M4.75 14.1A4.75 4.25 0 0 1 13.25 14.1", sec=True)))
add("user-shield", "People", "superuser admin change mode", with_badge(user_parts(8, 2.25), "lock"))
add("briefcase", "People", "outside accountant auditor firm work", one(E("b", rect(1.75, 5.25, 14.5, 10, 2)), E("l", "M6.25 5.25V3.75A1 1 0 0 1 7.25 2.75H10.75A1 1 0 0 1 11.75 3.75V5.25"), E("c", line(1.75, 9.75, 16.25, 9.75), sec=True)))
add("id-badge", "People", "employee staff card id", one(E("b", rect(1.75, 3.25, 14.5, 11.5, 2)), E("c", circ(6.25, 8, 1.75), sec=True), E("c", "M3.75 12A2.5 2 0 0 1 8.75 12", sec=True), E("c", line(10.75, 7.25, 13.25, 7.25)), E("c", line(10.75, 10.25, 12.25, 10.25))))
add("medal", "People", "job grade rank level", one(E("b", "M6.1 8.4L4.25 2.25H7.5L9 5.25L10.5 2.25H13.75L11.9 8.4", sec=True), E("b", circ(9, 11.75, 4.5)), E("c", line(9, 10.25, 9, 13.25))))
add("hard-hat", "People", "fitter worker site", one(E("b", "M3.25 12.25V10A5.75 5.75 0 0 1 14.75 10V12.25"), E("l", line(1.75, 12.25, 16.25, 12.25)), E("c", line(9, 4.5, 9, 8.25), sec=True)))
add("payrun", "People", "pay run payroll salaries", with_badge([E("b", circ(6.75, 5.25, 2.75)), E("b", "M1.75 14.75A5 5 0 0 1 11.75 14.75Z", sec=True), E("b", circ(12.5, 5.75, 2.25), sec=True)], "coin", 13.25, 12.75))
add("building", "Places", "department company office", one(E("b", "M2.75 16.25V3.75A2 2 0 0 1 4.75 1.75H10.25A2 2 0 0 1 12.25 3.75V16.25"), E("b", "M12.25 7.25H13.25A2 2 0 0 1 15.25 9.25V16.25", sec=True), E("l", line(1.75, 16.25, 16.25, 16.25)), E("c", line(5.75, 5.25, 5.75, 5.25)), E("c", line(9.25, 5.25, 9.25, 5.25)), E("c", line(5.75, 8.75, 5.75, 8.75)), E("c", line(9.25, 8.75, 9.25, 8.75)), E("c", line(5.75, 12.25, 5.75, 12.25)), E("c", line(9.25, 12.25, 9.25, 12.25))))
add("map-pin", "Places", "site location address", one(E("b", "M9 16.25C9 16.25 14.25 11.4 14.25 7A5.25 5.25 0 0 0 3.75 7C3.75 11.4 9 16.25 9 16.25Z"), E("h", circ(9, 7, 1.75))))
add("layers", "Places", "sections levels stack", one(E("b", "M9 2L16 5.75L9 9.5L2 5.75Z"), E("l", "M2 9.25L9 13L16 9.25", sec=True), E("l", "M2 12.5L9 16.25L16 12.5", sec=True)))
add("truck", "Places", "supplier delivery transport", one(E("b", rect(1.75, 3.75, 9.5, 8.5, 1.5)), E("b", "M11.25 6.25H13.4A1.5 1.5 0 0 1 14.65 6.9L16.25 9.25V12.25H11.25Z", sec=True), E("b", circ(5.25, 13.75, 1.75)), E("b", circ(12.75, 13.75, 1.75))))
add("handshake", "Places", "deal agreement won crm", one(E("b", rect(1.75, 4.75, 2.5, 7, 0.75), sec=True), E("b", rect(13.75, 4.75, 2.5, 7, 0.75), sec=True), E("b", "M4.25 6.25L7.4 4.95A2 2 0 0 1 8.15 4.8H10.25L13.75 6.25V10.6L10 14.1A1.5 1.5 0 0 1 7.95 14.1L4.25 10.6Z"), E("c", "M10.75 4.8L7.85 7.7A1.15 1.15 0 0 0 9.5 9.35L10.9 8.1"), E("c", line(10.9, 8.1, 12.5, 9.75), sec=True), E("c", line(8.6, 10.2, 10.6, 12.1), sec=True)))
add("map", "Places", "route cost tracker day trip", one(E("b", "M1.75 4.25L6.25 2.25L11.75 4.25L16.25 2.25V13.75L11.75 15.75L6.25 13.75L1.75 15.75Z"), E("c", line(6.25, 2.25, 6.25, 13.75), sec=True), E("c", line(11.75, 4.25, 11.75, 15.75), sec=True)))

# ------------------------------------------------------------------ retail and stock
add("box", "Retail", "package parcel product", one(E("b", "M9 1.75L15.75 5.25V12.75L9 16.25L2.25 12.75V5.25Z"), E("c", "M2.25 5.25L9 8.75L15.75 5.25", sec=True), E("c", line(9, 8.75, 9, 16.25), sec=True)))
add("box-in", "Retail", "goods in received grn", with_badge([E("b", "M9 1.75L15.75 5.25V12.75L9 16.25L2.25 12.75V5.25Z"), E("c", "M2.25 5.25L9 8.75L15.75 5.25", sec=True), E("c", line(9, 8.75, 9, 16.25), sec=True)], "down", 14, 13.25))
add("boxes", "Retail", "stock inventory", one(E("b", rect(1.75, 9.25, 6.75, 6.5, 1.25)), E("b", rect(9.5, 9.25, 6.75, 6.5, 1.25), sec=True), E("b", rect(5.6, 2.25, 6.75, 6, 1.25)), E("c", line(4, 9.25, 4, 11.25), sec=True), E("c", line(12.75, 9.25, 12.75, 11.25)), E("c", line(9, 2.25, 9, 4.25))))
add("cart", "Retail", "basket buy order", one(E("l", "M1.75 2.75H3.25L5 11.25A1.5 1.5 0 0 0 6.5 12.5H13.25A1.5 1.5 0 0 0 14.7 11.4L16 5.75H3.9"), E("d", dot(6.5, 15.4, 1.1)), E("d", dot(13, 15.4, 1.1))))
add("barcode", "Retail", "scan product sku", one(E("l", "M1.75 5.25V3.75A1 1 0 0 1 2.75 2.75H4.25"), E("l", "M13.75 2.75H15.25A1 1 0 0 1 16.25 3.75V5.25"), E("l", "M16.25 12.75V14.25A1 1 0 0 1 15.25 15.25H13.75"), E("l", "M4.25 15.25H2.75A1 1 0 0 1 1.75 14.25V12.75"), E("l", line(5.25, 6, 5.25, 12), sec=True), E("l", line(8, 6, 8, 12)), E("l", line(10.25, 6, 10.25, 12), sec=True), E("l", line(12.75, 6, 12.75, 12))))
add("tag", "Retail", "price label", one(E("b", "M2.25 3.75V8.4A1.5 1.5 0 0 0 2.7 9.45L8.8 15.55A1.5 1.5 0 0 0 10.9 15.55L15.55 10.9A1.5 1.5 0 0 0 15.55 8.8L9.45 2.7A1.5 1.5 0 0 0 8.4 2.25H3.75A1.5 1.5 0 0 0 2.25 3.75Z"), E("h", circ(6, 6, 1.25))))

# ------------------------------------------------------------------ charts
add("chart-line", "Charts", "trend up growth graph", one(E("l", "M1.75 13.25L6.25 8.25L9.75 11.25L16.25 4.25"), E("l", poly((12.25, 4.25), (16.25, 4.25), (16.25, 8.25)), sec=True)))
add("chart-pie", "Charts", "share split all spending", [{"els": [E("b", "M9 2.75A6.75 6.75 0 1 0 15.75 9.5H9Z")], "gaps": []}, {"els": [E("b", "M11 1.75A5.25 5.25 0 0 1 16.25 7H11Z", sec=True)]}])
add("chart-aging", "Charts", "owed by age buckets", one(E("b", rect(1.75, 2.25, 14.5, 3, 1)), E("b", rect(1.75, 7.5, 10.25, 3, 1), sec=True), E("b", rect(1.75, 12.75, 5.75, 3, 1), sec=True)))
add("table", "Charts", "table grid rows columns worksheet", one(E("b", rect(1.75, 2.75, 14.5, 12.5, 2)), E("c", line(1.75, 6.75, 16.25, 6.75)), E("c", line(1.75, 11, 16.25, 11), sec=True), E("c", line(6.75, 6.75, 6.75, 15.25), sec=True)))
add("rows", "Charts", "density list rows", one(E("b", rect(1.75, 2.25, 14.5, 4, 1.25)), E("b", rect(1.75, 7, 14.5, 4, 1.25), sec=True), E("b", rect(1.75, 11.75, 14.5, 4, 1.25))))

# ------------------------------------------------------------------ actions
add("plus", "Actions", "add new create", one(E("l", line(9, 3.25, 9, 14.75)), E("l", line(3.25, 9, 14.75, 9))))
add("minus", "Actions", "remove subtract", one(E("l", line(3.25, 9, 14.75, 9))))
add("check", "Actions", "done save accept tick", one(E("l", poly((3, 9.5), (6.75, 13.25), (15, 4.75)))))
add("x", "Actions", "close cancel dismiss", one(E("l", line(4.25, 4.25, 13.75, 13.75)), E("l", line(13.75, 4.25, 4.25, 13.75))))
add("check-circle", "Actions", "approve success done", one(E("b", circ(9, 9, 7.25)), E("c", poly((5.75, 9.25), (7.9, 11.4), (12.25, 6.75)))))
add("x-circle", "Actions", "reject error remove", one(E("b", circ(9, 9, 7.25)), E("c", line(6.5, 6.5, 11.5, 11.5)), E("c", line(11.5, 6.5, 6.5, 11.5))))
add("plus-circle", "Actions", "add create new", one(E("b", circ(9, 9, 7.25)), E("c", line(9, 5.75, 9, 12.25)), E("c", line(5.75, 9, 12.25, 9))))
add("send", "Actions", "send issue share paper plane", one(E("b", "M2.4 2.65L15.75 8.55A0.5 0.5 0 0 1 15.75 9.45L2.4 15.35A0.5 0.5 0 0 1 1.75 14.75L3.75 9L1.75 3.25A0.5 0.5 0 0 1 2.4 2.65Z"), E("c", line(3.75, 9, 8.75, 9), sec=True)))
add("upload", "Actions", "upload statement import", one(E("l", line(9, 11.25, 9, 2.25)), E("l", poly((5.25, 5.75), (9, 2.25), (12.75, 5.75))), E("l", "M2.25 11.25V13.75A2 2 0 0 0 4.25 15.75H13.75A2 2 0 0 0 15.75 13.75V11.25", sec=True)))
add("download", "Actions", "download export save file", one(E("l", line(9, 2.25, 9, 11.25)), E("l", poly((5.25, 7.75), (9, 11.25), (12.75, 7.75))), E("l", "M2.25 11.25V13.75A2 2 0 0 0 4.25 15.75H13.75A2 2 0 0 0 15.75 13.75V11.25", sec=True)))
add("export", "Actions", "export out accountant tray", one(E("l", "M6.25 6.25H4.25A2 2 0 0 0 2.25 8.25V13.75A2 2 0 0 0 4.25 15.75H13.75A2 2 0 0 0 15.75 13.75V8.25A2 2 0 0 0 13.75 6.25H11.75", sec=True), E("l", line(9, 10.75, 9, 1.75)), E("l", poly((6.25, 4.5), (9, 1.75), (11.75, 4.5)))))
add("printer", "Actions", "print statements paper", one(E("b", "M4.75 6.25V2.75A1 1 0 0 1 5.75 1.75H12.25A1 1 0 0 1 13.25 2.75V6.25", sec=True), E("b", "M4.75 13.25H3.25A1.5 1.5 0 0 1 1.75 11.75V7.75A1.5 1.5 0 0 1 3.25 6.25H14.75A1.5 1.5 0 0 1 16.25 7.75V11.75A1.5 1.5 0 0 1 14.75 13.25H13.25"), E("c", rect(4.75, 10.25, 8.5, 6, 1)), E("c", line(13, 8.75, 13, 8.75), sec=True)))
add("pencil", "Actions", "edit write change", one(E("b", "M2.75 15.25L3.4 11.9L11.85 3.45A1.75 1.75 0 0 1 14.35 3.45L14.55 3.65A1.75 1.75 0 0 1 14.55 6.15L6.1 14.6Z"), E("c", line(10.5, 4.8, 13.2, 7.5), sec=True)))
add("trash", "Actions", "delete remove bin", one(E("b", "M3.75 4.75L4.6 14.4A2 2 0 0 0 6.6 16.25H11.4A2 2 0 0 0 13.4 14.4L14.25 4.75"), E("l", line(2.25, 4.75, 15.75, 4.75)), E("l", "M6.75 4.75V2.75A1 1 0 0 1 7.75 1.75H10.25A1 1 0 0 1 11.25 2.75V4.75"), E("c", line(7.5, 8.25, 7.5, 12.75), sec=True), E("c", line(10.5, 8.25, 10.5, 12.75), sec=True)))
add("copy", "Actions", "duplicate copy clone", [{"els": [E("b", rect(1.75, 1.75, 10, 10, 2), sec=True)], "gaps": [rect(4.75, 4.75, 13, 13, 3)]}, {"els": [E("b", rect(6.25, 6.25, 10, 10, 2))]}])
add("retry", "Actions", "retry again undo anticlockwise void", one(E("l", "M3.1 10.75A6.25 6.25 0 1 0 4.6 4.6L2.75 6.5"), E("l", poly((2.75, 2.75), (2.75, 6.5), (6.5, 6.5)))))
add("refresh", "Actions", "sync reload update", one(E("l", "M15.25 7.5A6.5 6.5 0 0 0 3.4 5.25"), E("l", poly((15.25, 2.75), (15.25, 7.5), (10.5, 7.5))), E("l", "M2.75 10.5A6.5 6.5 0 0 0 14.6 12.75", sec=True), E("l", poly((2.75, 15.25), (2.75, 10.5), (7.5, 10.5)), sec=True)))
add("filter", "Actions", "filters narrow", one(E("l", line(2.25, 4.25, 15.75, 4.25)), E("l", line(4.75, 9, 13.25, 9), sec=True), E("l", line(7.25, 13.75, 10.75, 13.75))))
add("sort", "Actions", "sort order descending", one(E("l", line(2.25, 4.25, 9.75, 4.25)), E("l", line(2.25, 9, 7.75, 9), sec=True), E("l", line(2.25, 13.75, 5.75, 13.75), sec=True), E("l", line(13.25, 3.25, 13.25, 14.75)), E("l", poly((10.75, 12.25), (13.25, 14.75), (15.75, 12.25)))))
add("sliders", "Actions", "settings general adjust rules", one(E("l", line(2.25, 5.25, 15.75, 5.25), sec=True), E("l", line(2.25, 12.75, 15.75, 12.75), sec=True), E("b", circ(11.75, 5.25, 2.25)), E("b", circ(6.25, 12.75, 2.25))))
add("dots", "Actions", "more menu options horizontal", one(E("d", dot(3.75, 9, 1.25)), E("d", dot(9, 9, 1.25)), E("d", dot(14.25, 9, 1.25))))
add("dots-v", "Actions", "more menu options vertical", one(E("d", dot(9, 3.75, 1.25)), E("d", dot(9, 9, 1.25)), E("d", dot(9, 14.25, 1.25))))
add("external", "Actions", "open in new arrow up right", one(E("l", "M14.25 10.25V13.75A2 2 0 0 1 12.25 15.75H4.25A2 2 0 0 1 2.25 13.75V5.75A2 2 0 0 1 4.25 3.75H7.75", sec=True), E("l", line(8.75, 9.25, 15.75, 2.25)), E("l", poly((10.75, 2.25), (15.75, 2.25), (15.75, 7.25)))))
add("link", "Actions", "integrations connect chain map", one(E("l", "M7.6 10.4A3 3 0 0 0 11.85 10.4L14.6 7.65A3 3 0 0 0 10.35 3.4L9.4 4.35"), E("l", "M10.4 7.6A3 3 0 0 0 6.15 7.6L3.4 10.35A3 3 0 0 0 7.65 14.6L8.6 13.65", sec=True)))
add("plug", "Actions", "integrations connect apps", one(E("b", "M4.75 6.25H13.25V8.75A4.25 4.25 0 0 1 4.75 8.75Z"), E("l", line(6.75, 6.25, 6.75, 1.75)), E("l", line(11.25, 6.25, 11.25, 1.75)), E("l", line(9, 13, 9, 16.25), sec=True)))
add("paperclip", "Actions", "attach file", one(E("l", "M14.9 8.6L9.15 14.35A3.75 3.75 0 0 1 3.85 9.05L9.95 2.95A2.5 2.5 0 0 1 13.5 6.5L7.6 12.4A1.25 1.25 0 0 1 5.85 10.65L11.15 5.35")))
add("camera", "Actions", "photo record spending capture receipt", one(E("b", "M1.75 6.25A1.5 1.5 0 0 1 3.25 4.75H5.25L6.5 2.75H11.5L12.75 4.75H14.75A1.5 1.5 0 0 1 16.25 6.25V13.75A1.5 1.5 0 0 1 14.75 15.25H3.25A1.5 1.5 0 0 1 1.75 13.75Z"), E("h", circ(9, 10, 2.75))))
add("eye", "Actions", "view show preview", one(E("b", "M1.75 9C3.5 5.4 6 3.75 9 3.75S14.5 5.4 16.25 9C14.5 12.6 12 14.25 9 14.25S3.5 12.6 1.75 9Z"), E("h", circ(9, 9, 2.25))))
add("eye-off", "Actions", "hide private", [{"els": [E("b", "M1.75 9C3.5 5.4 6 3.75 9 3.75S14.5 5.4 16.25 9C14.5 12.6 12 14.25 9 14.25S3.5 12.6 1.75 9Z", sec=True), E("h", circ(9, 9, 2.25), sec=True)], "gaps": [thick(2.75, 2.75, 15.25, 15.25)]}, {"els": [E("l", line(2.75, 2.75, 15.25, 15.25))]}])
add("bookmark", "Actions", "saved view keep", one(E("b", "M4.25 3.75A2 2 0 0 1 6.25 1.75H11.75A2 2 0 0 1 13.75 3.75V15.6A0.5 0.5 0 0 1 12.95 16L9 13.25L5.05 16A0.5 0.5 0 0 1 4.25 15.6Z")))
add("share", "Actions", "share send people", one(E("b", circ(13.25, 3.75, 2)), E("b", circ(4.75, 9, 2)), E("b", circ(13.25, 14.25, 2)), E("l", line(6.5, 8, 11.5, 4.75), sec=True), E("l", line(6.5, 10, 11.5, 13.25), sec=True)))
add("play", "Actions", "start run go", one(E("b", "M5.25 3.1A0.75 0.75 0 0 1 6.4 2.45L14.6 8.35A0.8 0.8 0 0 1 14.6 9.65L6.4 15.55A0.75 0.75 0 0 1 5.25 14.9Z")))
add("pause", "Actions", "hold stop pause", one(E("b", rect(4.25, 2.75, 3, 12.5, 1)), E("b", rect(10.75, 2.75, 3, 12.5, 1))))
add("pin", "Actions", "pin keep top", one(E("b", "M6.75 2.25H11.25L10.75 6.75L13.25 9.75H4.75L7.25 6.75Z"), E("l", line(9, 9.75, 9, 15.75))))
add("star", "Actions", "favourite star", one(E("b", "M9 2L11.05 6.2L15.65 6.85L12.35 10.1L13.1 14.65L9 12.5L4.9 14.65L5.65 10.1L2.35 6.85L6.95 6.2Z")))
add("thumb-up", "Actions", "approve like yes", one(E("b", "M5.25 7.75L8.4 2.6A1.5 1.5 0 0 1 11.1 3.55L10.5 6.75H14.25A1.75 1.75 0 0 1 15.95 8.9L14.65 14.4A2.25 2.25 0 0 1 12.45 16.25H5.25Z"), E("b", rect(1.75, 7.75, 3.5, 8.5, 1), sec=True)))
add("thumb-down", "Actions", "reject dislike no", one(E("b", "M5.25 10.25L8.4 15.4A1.5 1.5 0 0 0 11.1 14.45L10.5 11.25H14.25A1.75 1.75 0 0 0 15.95 9.1L14.65 3.6A2.25 2.25 0 0 0 12.45 1.75H5.25Z"), E("b", rect(1.75, 1.75, 3.5, 8.5, 1), sec=True)))
add("tool", "Actions", "fix wrench map repair", one(E("b", "M11.75 1.95A4.25 4.25 0 0 0 9.4 7.5L2.4 14.5A1.4 1.4 0 0 0 4.4 16.5L11.4 9.5A4.25 4.25 0 0 0 16.95 7.15L14.1 8.25L12.2 7.75L11.7 5.85L12.85 3Z")))
add("bulb", "Actions", "idea hint vane insight", one(E("b", "M6.25 12.75C6.25 11 3.75 9.75 3.75 6.75A5.25 5.25 0 0 1 14.25 6.75C14.25 9.75 11.75 11 11.75 12.75Z"), E("l", line(6.75, 15.75, 11.25, 15.75), sec=True)))
add("code", "Actions", "developer api code", one(E("l", poly((5.75, 4.75), (1.75, 9), (5.75, 13.25))), E("l", poly((12.25, 4.75), (16.25, 9), (12.25, 13.25))), E("l", line(10.25, 3.25, 7.75, 14.75), sec=True)))
add("command", "Actions", "keyboard shortcut cmd", one(E("l", "M6.75 6.75V4.5A2.25 2.25 0 1 0 4.5 6.75H13.5A2.25 2.25 0 1 0 11.25 4.5V13.5A2.25 2.25 0 1 0 13.5 11.25H4.5A2.25 2.25 0 1 0 6.75 13.5Z")))

# ------------------------------------------------------------------ arrows
add("chevron-down", "Arrows", "expand down", one(E("l", poly((4.5, 6.75), (9, 11.25), (13.5, 6.75)))))
add("chevron-up", "Arrows", "collapse up", one(E("l", poly((4.5, 11.25), (9, 6.75), (13.5, 11.25)))))
add("chevron-left", "Arrows", "back previous", one(E("l", poly((11.25, 4.5), (6.75, 9), (11.25, 13.5)))))
add("chevron-right", "Arrows", "next forward open", one(E("l", poly((6.75, 4.5), (11.25, 9), (6.75, 13.5)))))
add("chevron-expand", "Arrows", "select up down", one(E("l", poly((5.75, 6.5), (9, 3.25), (12.25, 6.5))), E("l", poly((5.75, 11.5), (9, 14.75), (12.25, 11.5)))))
add("arrow-left", "Arrows", "back", one(E("l", line(15.25, 9, 2.75, 9)), E("l", poly((7.25, 4.5), (2.75, 9), (7.25, 13.5)))))
add("arrow-right", "Arrows", "next go", one(E("l", line(2.75, 9, 15.25, 9)), E("l", poly((10.75, 4.5), (15.25, 9), (10.75, 13.5)))))
add("arrow-up", "Arrows", "up increase", one(E("l", line(9, 15.25, 9, 2.75)), E("l", poly((4.5, 7.25), (9, 2.75), (13.5, 7.25)))))
add("arrow-down", "Arrows", "down decrease", one(E("l", line(9, 2.75, 9, 15.25)), E("l", poly((4.5, 10.75), (9, 15.25), (13.5, 10.75)))))
add("arrow-up-right", "Arrows", "out open trend", one(E("l", line(4, 14, 14, 4)), E("l", poly((6.25, 4), (14, 4), (14, 11.75)))))

# ------------------------------------------------------------------ status and comms
add("info", "Status", "information note", one(E("b", circ(9, 9, 7.25)), E("c", line(9, 8.5, 9, 12.5)), E("c", line(9, 5.6, 9, 5.6))))
add("alert", "Status", "warning caution triangle", one(E("b", "M7.7 2.75A1.5 1.5 0 0 1 10.3 2.75L16.05 13A1.5 1.5 0 0 1 14.75 15.25H3.25A1.5 1.5 0 0 1 1.95 13Z"), E("c", line(9, 6.75, 9, 9.75)), E("c", line(9, 12.4, 9, 12.4))))
add("alert-circle", "Status", "error failed attention", one(E("b", circ(9, 9, 7.25)), E("c", line(9, 5.25, 9, 9.5)), E("c", line(9, 12.4, 9, 12.4))))
add("forbid", "Status", "refused not allowed blocked", one(E("b", circ(9, 9, 7.25)), E("c", line(4, 14, 14, 4))))
add("shield", "Status", "secure protect", one(E("b", "M9 1.75L15.25 4.25V8.5C15.25 12.25 12.6 14.9 9 16.25C5.4 14.9 2.75 12.25 2.75 8.5V4.25Z")))
add("shield-check", "Status", "inspections verified safe", one(E("b", "M9 1.75L15.25 4.25V8.5C15.25 12.25 12.6 14.9 9 16.25C5.4 14.9 2.75 12.25 2.75 8.5V4.25Z"), E("c", poly((6.25, 8.75), (8.25, 10.75), (11.75, 7)))))
add("bell", "Status", "notifications alerts reminder", one(E("b", "M4.25 7.25A4.75 4.75 0 0 1 13.75 7.25V10.4L15.1 12.6A0.75 0.75 0 0 1 14.45 13.75H3.55A0.75 0.75 0 0 1 2.9 12.6L4.25 10.4Z"), E("l", "M7.25 16A2 2 0 0 0 10.75 16", sec=True)))
add("chat", "Status", "message comment reply", one(E("b", "M9 2.25C13 2.25 16.25 4.95 16.25 8.25S13 14.25 9 14.25C8.2 14.25 7.45 14.15 6.75 13.95L3 15.75L3.75 12.4C2.5 11.3 1.75 9.85 1.75 8.25C1.75 4.95 5 2.25 9 2.25Z")))
add("mail", "Status", "email envelope", one(E("b", rect(1.75, 3.25, 14.5, 11.5, 2)), E("c", "M2.25 4.5L8.4 9.15A1 1 0 0 0 9.6 9.15L15.75 4.5", sec=True)))
add("phone", "Status", "call telephone", one(E("b", "M4.1 1.75H6.1L7.6 5.6L5.6 7.1A9.5 9.5 0 0 0 10.9 12.4L12.4 10.4L16.25 11.9V13.9A2.35 2.35 0 0 1 13.9 16.25C7.4 15.9 2.1 10.6 1.75 4.1A2.35 2.35 0 0 1 4.1 1.75Z")))
add("wifi-off", "Status", "offline no connection", one(E("l", "M1.75 6.6A11 11 0 0 1 5.4 4.35", sec=True), E("l", "M8.6 3.5A11 11 0 0 1 16.25 6.6", sec=True), E("l", "M4.4 9.6A7 7 0 0 1 7.9 7.85", sec=True), E("l", "M11.4 8.3A7 7 0 0 1 13.6 9.6", sec=True), E("d", dot(9, 13.75, 1.2)), E("l", line(2.75, 2.25, 15.25, 15.75))))
add("cloud-off", "Status", "offline sync paused", one(E("l", "M5.4 5.4A4.25 4.25 0 0 0 4.75 13.75H12.75"), E("l", "M7.75 3.9A5.25 5.25 0 0 1 14 7.6A3.25 3.25 0 0 1 15.9 12.9", sec=True), E("l", line(2.25, 2.25, 15.75, 15.75))))
add("sun", "Status", "appearance light theme", one(E("b", circ(9, 9, 3.25)), *[E("l", line(9 + 5.5 * math.cos(a), 9 + 5.5 * math.sin(a), 9 + 7 * math.cos(a), 9 + 7 * math.sin(a)), sec=True) for a in [i * math.pi / 4 for i in range(8)]]))
add("moon", "Status", "dark theme night", one(E("b", "M15.25 11.2A6.75 6.75 0 0 1 6.8 2.75A6.75 6.75 0 1 0 15.25 11.2Z")))
add("palette", "Status", "branding colours theme", one(E("b", "M9 1.75A7.25 7.25 0 0 0 9 16.25C10.1 16.25 10.6 15.4 10.1 14.45C9.6 13.5 10.2 12.25 11.4 12.25H13.25A3 3 0 0 0 16.25 9.25C16.25 5.1 13 1.75 9 1.75Z"), E("c", line(5.5, 8.25, 5.5, 8.25)), E("c", line(8, 5, 8, 5)), E("c", line(12, 5.75, 12, 5.75))))
add("graduation", "Status", "training learn course", one(E("b", "M9 2.75L16.25 6.5L9 10.25L1.75 6.5Z"), E("l", "M4.5 8V11.75C6.75 14.1 11.25 14.1 13.5 11.75V8", sec=True), E("l", line(16.25, 6.5, 16.25, 11.25))))
add("vane", "Status", "assistant suggestion mark arrow", one(E("b", rect(1.75, 1.75, 14.5, 14.5, 4)), E("c", line(5, 9, 11.75, 9)), E("c", poly((9.25, 5.75), (12.75, 9), (9.25, 12.25)))))

add("checks", "Actions", "double tick all done read", one(E("l", poly((1.75, 9.75), (5, 13), (11.5, 5.5))), E("l", poly((9.25, 12.25), (10, 13), (16.25, 5.5)), sec=True)))
add("image", "Actions", "picture photo upload", one(E("b", rect(1.75, 2.75, 14.5, 12.5, 2)), E("c", "M1.75 12.75L5.6 8.9A1.25 1.25 0 0 1 7.4 8.9L11.25 12.75", sec=True), E("c", line(12.25, 6.5, 12.25, 6.5))))

add("percent-circle", "Tax", "tax level vat rates", one(E("b", circ(9, 9, 7.25)), E("c", line(11.5, 6.5, 6.5, 11.5)), E("c", line(6.6, 6.6, 6.6, 6.6)), E("c", line(11.4, 11.4, 11.4, 11.4))))
