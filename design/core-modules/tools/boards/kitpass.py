"""Brings every canvas artboard onto the kit's own components (html/*.html, html/kit.css).

    python3 design/core-modules/tools/boards/kitpass.py

Edits boards/canvas/*.dc.html in place, then writes boards/view/*.html from them (views.py).
Each rule is one class of defect the owner flagged on the canvas:

- tables: the `.ws` wrapper took the workspace switcher's styles (padding, centring) and
  became `.wt`; in a sized table only the unsized column truncates (an explainer's wraps), and an
  icon or a code leads its cell's text on the same line; a total row is the
  table's `<tfoot>`; a state in a cell is the kit's `.status` dot and word, not a pill;
- table footers: `.ws-foot` and its centred pager become the kit's `.table-foot` with a
  `.foot-row`, the range ("1 to 9 of 142"), the sums as `.foot-sum`, and Previous / Next;
- tabs: views of one list are the kit's `.seg` in a `.tools` row; underline `.tabs` stay only
  for an inspector's sections (the builder) and the kit sheet's demonstration of them;
- charts: a column chart is the kit's `.cols` with `.col` bars and a `.cols-x` axis;
- figures: money, counts and times are Inter with tabular figures, as in the kit; mono is
  kept only for code (SQL, table and column names, parameters).

Idempotent: running it again changes nothing.
"""
import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CANVAS = os.path.join(ROOT, "boards", "canvas")

BACK = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M14.657 17.657L9 12l5.657-5.657"/></svg>'
CHEV = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9.343 6.343L15 12l-5.657 5.657"/></svg>'
PAGES = (
    '<div class="end"><div class="btn-group" role="group" aria-label="Pages">'
    f'<button class="btn"{{prev}}>{BACK}Previous</button><button class="btn"{{next}}>Next{CHEV}</button></div></div>'
)

# Explainer boards, whose tables hold sentences.
PROSE = ("Ri", "Vn")

# Boards whose underline tabs are an inspector's sections, as the kit draws them.
KEEP_TABS = {"ReportBuild", "ReportBuildVane", "KitSheet"}

STATUS = {"pill-ok": "status status-success", "pill-warn": "status status-warning", "pill-bad": "status status-danger", "pill-info": "status status-info", "pill-n": "status", "pill-plain": "status"}

# Text that is code: identifiers, parameters, SQL.
CODE = re.compile(r"^(:?[a-z_][a-z0-9_]*)([ ,·.=:]+[a-z0-9_:'\-]+)*$|select |from |where |::|:[a-z_]+")


def is_code(text):
    plain = re.sub(r"<[^>]+>", "", text).strip()
    if re.fullmatch(r"[a-z_]+(, [a-z_]+)*", plain) or re.fullmatch(r"[a-z]+\.[a-z0-9_.\-]+", plain):  # table names, template keys
        return True
    return bool(plain) and ("_" in plain or plain.startswith(":") or bool(re.search(r"\bselect\b|\bfrom\b|::", plain))) and bool(CODE.search(plain))


def fill_cells(body, count, free):
    """Marks the cells of columns `free` as filling; rows that span columns are left alone."""
    def row(r):
        cells = re.split(r"(?=<td\b)", r.group(0))
        if len(cells) - 1 != count:
            return r.group(0)
        for i in free:
            c = cells[i + 1]
            cells[i + 1] = c.replace('<td class="', '<td class="fill ', 1) if c.startswith('<td class="') else c.replace("<td", '<td class="fill"', 1)
        return "".join(cells)

    return re.sub(r"<tbody>.*?</tbody>", lambda b: re.sub(r"<tr\b.*?</tr>", row, b.group(0), flags=re.S), body, flags=re.S)


def sized(count, free, body):
    share = f"{100 / len(free):g}%"
    cols = "".join(f'<col style="width:{share}">' if i in free else "<col>" for i in range(count))
    return f'<table class="table"><colgroup>{cols}</colgroup>{fill_cells(body, count, free)}</table>'


def fill(m):
    cols = re.findall(r"<col\b([^>]*)>", m.group(1))
    free = [i for i, c in enumerate(cols) if "width" not in c]
    return sized(len(cols), free, m.group(2)) if free else f'<table class="table">{m.group(2)}</table>'


def tables(s, board):
    s = re.sub(r'class="ws"', 'class="wt"', s)
    s = re.sub(r'class="ws ', 'class="wt ', s)
    # An explainer's table keeps its sized columns and wraps its sentences. Any other sized table
    # lets each column take its content; the columns that were left unsized share the rest and
    # truncate what does not fit.
    if board.startswith(PROSE):
        s = s.replace('<table class="table" style="table-layout:fixed">', '<table class="table is-prose">')
    else:
        s = re.sub(r'<table class="table" style="table-layout:fixed">(<colgroup>.*?</colgroup>)(.*?)</table>', fill, s, flags=re.S)
    # An icon leads its cell's text, on the same line.
    s = re.sub(r'(<svg class="ic"[^>]*>(?:(?!</svg>).)*</svg>)<span class="cell-lead" style="margin-left:8px">', r'<span class="cell-lead">\1', s)

    # A total row closes the body and becomes the foot.
    def foot(m):
        body = m.group(1)
        rows = re.findall(r'<tr class="tot">.*?</tr>', body, re.S)
        if not rows:
            return m.group(0)
        rest = re.sub(r'<tr class="tot">.*?</tr>', "", body, flags=re.S)
        rows = [r.replace('<tr class="tot">', "<tr>") for r in rows]
        return f"<tbody>{rest}</tbody><tfoot>{''.join(rows)}</tfoot>"

    s = re.sub(r"<tbody>(.*?)</tbody>", foot, s, flags=re.S)

    # A code before a name sits on the name's line.
    s = re.sub(r'(<span class="ref">[^<]*</span>) <span class="cell-lead">', r'<span class="cell-lead">\1', s)

    # A sorted column: the kit's sort button, its icon on the same line as the name.
    def sort(m):
        down = "9.343L12 15" in m.group(4)
        return f'<th{m.group(1) or ""}{m.group(2) or ""} aria-sort="{"descending" if down else "ascending"}"><button type="button" class="sort">{m.group(3)}{m.group(4)}</button></th>'

    s = re.sub(r'<th( class="[^"]*")?( style="[^"]*")?>([^<]+?) ?(<svg class="ic"[^>]*>(?:(?!</svg>).)*</svg>)</th>', sort, s)

    # States in cells: the kit's dot and word.
    def cell(m):
        td = m.group(0)
        return re.sub(r'class="pill (pill-[a-z]+)"', lambda p: f'class="{STATUS.get(p.group(1), "status")}"', td)

    s = re.sub(r"<td[^>]*>.*?</td>", cell, s, flags=re.S)
    return s


def range_words(text):
    # "1–6 of 44 · Rows 50" → "1 to 6 of 44"; "11 of 24 · Rows 50" → "11 of 24"
    text = re.sub(r"\s*·\s*Rows \d+", "", text)
    return re.sub(r"(\d+)–(\d+)", r"\1 to \2", text)


def closing(s, start):
    """The index just past the </div> that closes the <div …> starting at `start`."""
    depth, i = 0, start
    for m in re.finditer(r"<div\b|</div>", s[start:]):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0:
            return start + m.end()
    raise ValueError("unbalanced div")


def footer(inner):
    pager = re.search(r'<div class="pager">(.*?)</div>', inner, re.S)
    inner = re.sub(r'<div class="pager">.*?</div>', "", inner, flags=re.S)
    # The range: the first span or b.
    inner = re.sub(r"^\s*<(span|b)>([^<]*)</\1>", lambda r: f'<span class="num">{range_words(r.group(2))}</span>', inner, count=1)
    # Sums: "Value <b …>$164,320.00</b>".
    inner = re.sub(r'<span([^>]*)>([^<]*?)<b style="[^"]*">([^<]*)</b></span>', lambda r: f'<span class="foot-sum">{r.group(2).strip()} <b>{r.group(3)}</b></span>', inner)
    pages = ""
    if pager:
        buttons = re.findall(r"<button[^>]*>(.*?)</button>", pager.group(1), re.S)
        numbered = [b for b in buttons if re.fullmatch(r"\d+", re.sub(r"<[^>]+>", "", b).strip())]
        on_first = 'class="is-on">1<' in pager.group(1)
        pages = PAGES.replace("{prev}", " disabled" if on_first else "").replace("{next}", "" if len(numbered) > 1 else " disabled")
    return f'<div class="table-foot" style="margin-top:auto"><div class="foot-row">{inner.strip()}{pages}</div></div>'


def footers(s):
    out, i = [], 0
    for m in re.finditer(r'<div class="ws-foot"[^>]*>', s):
        if m.start() < i:
            continue
        end = closing(s, m.start())
        out.append(s[i:m.start()])
        out.append(footer(s[m.end():end - len("</div>")]))
        i = end
    out.append(s[i:])
    return "".join(out)


def tabs(s, board):
    if board in KEEP_TABS:
        return s

    def seg(m):
        buttons = re.findall(r'<button class="tab" role="tab" aria-selected="(true|false)"([^>]*)>(.*?)</button>', m.group(1), re.S)
        if not buttons:
            return m.group(0)
        items = "".join(f'<button role="tab" aria-selected="{sel}"{rest}>{label}</button>' for sel, rest, label in buttons)
        return f'<div class="tools"><div class="seg" role="tablist" aria-label="View">{items}</div></div>'

    return re.sub(r'<div class="tabs" role="tablist"[^>]*>(.*?)</div>', seg, s, flags=re.S)


MONO_INLINE = re.compile(r"font:\s*([^;\"']*?)var\(--font-mono\)")


def figures(s):
    # Inline styles: mono stays for code, numbers take Inter's tabular figures.
    def element(m):
        tag = m.group(0)
        end = s.find("<", m.end())
        text = s[m.end():end] if end > 0 else ""
        if is_code(text):
            return tag
        tag = MONO_INLINE.sub(lambda f: f"font:{f.group(1)}var(--font-sans);font-variant-numeric:tabular-nums", tag)
        tag = re.sub(r"font-family:\s*var\(--font-mono\)", "font-variant-numeric:tabular-nums", tag)
        return tag

    s = re.sub(r"<[a-z]+[^>]*style=\"[^\"]*var\(--font-mono\)[^\"]*\"[^>]*>", element, s)

    def mono_class(m):
        tag, text = m.group(1), m.group(2)
        if is_code(text):
            return m.group(0)
        # A figure keeps tabular figures; words just lose the mono face.
        figure = bool(re.match(r"[\s]*[-+−$0-9]", text))
        tag = re.sub(r'class="mono( |")', lambda c: ('class="num' if figure else 'class="') + c.group(1), tag)
        tag = tag.replace(' class=""', "").replace('class=" ', 'class="')
        return tag + text

    s = re.sub(r'(<[a-z]+[^>]*class="mono[^"]*"[^>]*>)([^<]*)', mono_class, s)
    return s


def wrap_cols(s, nth, cols):
    """Lets columns `cols` of the nth table wrap, for a table in a card narrower than its words."""
    tables = list(re.finditer(r"<table\b.*?</table>", s, re.S))
    m = tables[nth]

    def row(r):
        cells = re.split(r"(?=<td\b)", r.group(0))
        for i in cols:
            if i + 1 < len(cells) and " wrap" not in cells[i + 1][:40] and 'class="wrap' not in cells[i + 1][:40]:
                c = cells[i + 1]
                cells[i + 1] = re.sub(r'^<td class="', '<td class="wrap ', c) if c.startswith('<td class="') else c.replace("<td", '<td class="wrap"', 1)
        return "".join(cells)

    body = re.sub(r"<tbody>.*?</tbody>", lambda b: re.sub(r"<tr\b.*?</tr>", row, b.group(0), flags=re.S), m.group(0), flags=re.S)
    return s[: m.start()] + body + s[m.end():]


def fill_col(s, nth, idx):
    """Column `idx` of the nth unsized table takes the width left over and truncates what does not fit."""
    tables = list(re.finditer(r'<table class="table">(?!<colgroup>)(.*?)</table>', s, re.S))
    if len(tables) <= nth:
        return s
    m = tables[nth]
    count = len(re.findall(r"<th\b", re.search(r"<thead>.*?</thead>", m.group(1), re.S).group(0)))
    return s[: m.start()] + sized(count, [idx], m.group(1)) + s[m.end():]


def scroll_table(s, nth):
    """A table far wider than its region keeps its columns and scrolls sideways, as the kit's .table-wrap."""
    found = list(re.finditer(r'<div class="wt"( style="[^"]*")?><table class="table"><colgroup>.*?</colgroup>(.*?)</table>', s, re.S))
    if len(found) <= nth:
        return s
    m = found[nth]
    body = m.group(2).replace(' class="fill"', "").replace('class="fill ', 'class="')
    return s[: m.start()] + f'<div class="wt table-wrap"{m.group(1) or ""}><table class="table">{body}</table>' + s[m.end():]


def compact_tools(s):
    """A toolbar too wide for its pane: search and the end actions become icon buttons, each still named."""
    def search(m):
        return f'<button class="btn btn-quiet btn-icon" aria-label="{m.group(2)}">{m.group(1)}</button>'

    s = re.sub(r'<label class="input-wrap ws-find">(<svg.*?</svg>)<input type="search" aria-label="([^"]+)"[^>]*></label>', search, s, flags=re.S)

    def end(m):
        tail = m.group(0)
        tail = re.sub(r'<button class="btn( btn-quiet)?">(<svg(?:(?!</svg>).)*</svg>)([A-Z][a-z]+)</button>', lambda b: f'<button class="btn{b.group(1) or ""} btn-icon" aria-label="{b.group(3)}">{b.group(2)}</button>', tail, flags=re.S)
        return tail

    return re.sub(r'<div class="end"><span class="sepv"></span>.*?</div>', end, s, count=1, flags=re.S)


# One board's own defects, each a function of the board's markup.
BOARD = {
    "MgmtExplore": lambda s: wrap_cols(wrap_cols(s, 0, [2]), 1, [2, 3]),
    "PageVaneRetail": lambda s: scroll_table(s, 0),
    # The run's toolbar shares the width with Vane's column.
    "PayRun": lambda s: fill_col(compact_tools(s), 0, 0),
    # The Vane column takes what is left, so the list fits beside the panel.
    "PeopleEveryone": lambda s: fill_col(s, 0, 8),
    # Each state's panel fills its card instead of overflowing it.
    "PageVaneStates": lambda s: s.replace('<aside class="ask cm-vane" aria-label="Vane" style="width:400px;flex:none">', '<aside class="ask cm-vane" aria-label="Vane" style="flex:1;min-width:0">'),
    # "Everyone" fits its column.
    "RiTemplates": lambda s: s.replace('<col style="width:120px"><col style="width:84px"><col style="width:96px"></colgroup>', '<col style="width:120px"><col style="width:100px"><col style="width:96px"></colgroup>'),
    # The kind and the state fit on one line.
    "VnTemplates": lambda s: s.replace('<col style="width:200px"><col style="width:92px">', '<col style="width:200px"><col style="width:112px">').replace('<col style="width:150px"><col style="width:120px"></colgroup>', '<col style="width:150px"><col style="width:156px"></colgroup>'),
}


def charts(s):
    """A stacked column chart drawn with spans becomes the kit's: .cols of .col bars (<i>), labels in .cols-x."""
    col = re.compile(r'<div class="col"><div style="height:\d+px;display:flex;flex-direction:column-reverse;padding:0 6px">(.*?)</div><span>([^<]*)</span></div>', re.S)

    def chart(m):
        bars, labels = [], []
        for c in col.finditer(m.group(1)):
            parts = re.findall(r'<span style="display:block;height:([\d.]+)%;background:([^"]+)"></span>', c.group(1))
            stack = [(h, bg) for h, bg in reversed(parts) if float(h) > 0]
            bars.append('<div class="col">' + "".join(
                f'<i style="height:{h}%;background:{bg}{"" if k == 0 else ";border-radius:0"}"></i>' for k, (h, bg) in enumerate(stack)) + "</div>")
            labels.append(f"<span>{c.group(2)}</span>")
        return f'<div class="cols">{"".join(bars)}</div><div class="cols-x">{"".join(labels)}</div>'

    return re.sub(r'<div class="cols">((?:<div class="col"><div style="height:\d+px;.*?</span></div>)+)</div>', chart, s, flags=re.S)


def run():
    changed = []
    for path in sorted(glob.glob(os.path.join(CANVAS, "*.dc.html"))):
        board = os.path.basename(path)[: -len(".dc.html")]
        before = open(path).read()
        head, sep, body = before.partition("<x-dc>")
        if not sep:
            continue
        after_body = charts(figures(tabs(footers(tables(body, board)), board)))
        if board in BOARD:
            after_body = BOARD[board](after_body)
        after = head + sep + after_body
        if after != before:
            open(path, "w").write(after)
            changed.append(board)
    print(f"{len(changed)} boards changed")
    for board in changed:
        print(" ", board)


if __name__ == "__main__":
    run()
    sys.path.insert(0, HERE)
    import views

    views.run()
