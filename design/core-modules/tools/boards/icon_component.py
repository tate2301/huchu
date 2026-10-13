import json, re, sys, os
sys.path.insert(0, 'gen2')
import ck
P = sys.argv[1] + '/Icon.dc.html'
s = open(P).read()
old = dict(re.findall(r"^\s+(\w+): '([^']*)',?$", s, re.M))
MAP = {'home': 'money', 'overview': 'overview', 'grid': 'columns', 'dashboard': 'overview', 'barChart': 'reports', 'chartLine': 'reports', 'fileCheck': 'corelith',
       'file': 'docs', 'help': 'help', 'question': 'help', 'users': 'users', 'user': 'person', 'userCheck': 'users', 'wallet': 'books', 'money': 'payments', 'coins': 'vat',
       'scale': 'posting', 'cog': 'gear', 'gear': 'general', 'package': 'store', 'tag': 'list', 'stack': 'tablegrid', 'tray': 'upload', 'wrench': 'general', 'factory': 'sites',
       'truck': 'sites', 'building': 'ws', 'sun': 'sun', 'book': 'training', 'flag': 'brand', 'medal': 'permits', 'bed': 'ws', 'idcard': 'profile', 'storefront': 'showroom',
       'funnel': 'pipeline', 'addressbook': 'users', 'briefcase': 'docs', 'clipboard': 'docs', 'checklist': 'list', 'calendar': 'visits', 'receipt': 'invoice',
       'cashRegister': 'takings', 'search': 'search', 'caretLeft': 'back', 'sidebar': 'panel', 'upload': 'upload', 'zap': 'bulb', 'lightning': 'bulb', 'phone': 'profile',
       'mapPin': 'sites', 'shield': 'inspections', 'clock': 'clock', 'download': 'export', 'plus': 'plus', 'chevronDown': 'down', 'chevronRight': 'chev', 'more': 'more',
       'pencil': 'edit', 'check': 'check', 'x': 'x', 'table': 'tablegrid', 'hash': 'figure', 'text': 'sentence', 'list': 'list', 'copy': 'docs', 'warning': 'issue',
       'bell': 'bell', 'eye': 'eye', 'play': 'run', 'send': 'publish', 'printer': 'print', 'link': 'link', 'bank': 'bank', 'pin': 'pin', 'pause': 'pause',
       'thumbDown': 'thumbdown', 'sliders': 'general', 'circle': 'step-todo', 'checkCircle': 'step-done', 'spinner': 'step-now', 'folder': 'docs', 'lock': 'lock',
       'camera': 'camera', 'car': 'sites', 'thermometer': 'moisture', 'ruler': 'measure', 'door': 'access', 'explore': 'explore', 'whatsapp': 'whatsapp', 'rows': 'list',
       'grid4': 'block', 'sort': 'sort', 'columns': 'columns', 'arrowRight': 'chev', 'arrowLeft': 'back', 'external': 'link'}
G = {}
for name in old:
    if name == 'vane' or name not in MAP or MAP[name] not in ck.IC:
        G[name] = {'d': old[name], 'fill': 'none', 'stroke': 'currentColor', 'rule': 'nonzero', 'w': None}
        continue
    paths = re.findall(r'<path([^>]*)/?>', ck.IC[MAP[name]])
    attrs = [dict(re.findall(r'([\w-]+)="([^"]*)"', p)) for p in paths]
    if all(a.get('fill') == 'currentColor' for a in attrs):
        rule = 'evenodd' if any(a.get('fill-rule') == 'evenodd' for a in attrs) else 'nonzero'
        if rule == 'evenodd' and len(attrs) > 1: attrs = attrs[:1]
        G[name] = {'d': ' '.join(a['d'] for a in attrs), 'fill': 'currentColor', 'stroke': 'none', 'rule': rule, 'w': None}
    elif attrs and attrs[0].get('stroke') == 'currentColor':
        G[name] = {'d': ' '.join(a['d'] for a in attrs if a.get('stroke') == 'currentColor'), 'fill': 'none', 'stroke': 'currentColor', 'rule': 'nonzero', 'w': attrs[0].get('stroke-width', '2')}
    else:
        G[name] = {'d': old[name], 'fill': 'none', 'stroke': 'currentColor', 'rule': 'nonzero', 'w': None}
svg = '<svg width="{{size}}" height="{{size}}" viewBox="0 0 24 24" fill="{{fill}}" stroke="{{stroke}}" stroke-width="{{weight}}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: block; flex: none"><path d="{{d}}" fill-rule="{{rule}}" clip-rule="{{rule}}"></path></svg>'
s = re.sub(r'<svg width="\{\{size\}\}".*?</svg>', svg, s, flags=re.S)
body = '    var P = ' + json.dumps(G, indent=1).replace('\n', '\n    ') + ';\n'
logic = body + '''    var glyph = this.props.glyph ?? 'fileCheck';
    var g = P[glyph] ?? P.fileCheck;
    return {
      d: g.d, fill: g.fill, stroke: g.stroke, rule: g.rule,
      size: this.props.size ?? 40,
      weight: g.w ?? (this.props.weight ?? 1.75)
    };
'''
s = re.sub(r'    var P = \{.*?\n    \};\n    var glyph.*?\n    \};\n', logic, s, flags=re.S)
open(P, 'w').write(s)
print(len(G), sum(1 for g in G.values() if g['fill'] == 'currentColor'), 'filled')
