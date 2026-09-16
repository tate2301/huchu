import sys, zipfile, re, json, pathlib
from xml.etree import ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

# Resolved from this file, not from one machine's absolute path, so the script
# runs in any clone.
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DEFAULT_SRC = ROOT / 'docs' / 'client' / 'FloorCode_Zimbabwe_Site_Visit_Question_Bank (1).docx'

# The .docx is gitignored, so a fresh clone will not have it. Take a path when
# it lives somewhere else, and say so plainly when it is missing rather than
# failing with a traceback.
SRC = pathlib.Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_SRC
if not SRC.is_file():
    print(
        f"Question bank not found: {SRC}\n\n"
        f"The source .docx is gitignored (see .gitignore), so it is not in a fresh\n"
        f"clone. Put the client's file at {DEFAULT_SRC}, or pass its path:\n"
        f"  python3 {pathlib.Path(__file__).relative_to(ROOT)} /path/to/question-bank.docx",
        file=sys.stderr,
    )
    raise SystemExit(1)

def paras(path):
    doc=ET.fromstring(zipfile.ZipFile(path).read('word/document.xml'))
    out=[]
    for el in doc.find(W+'body'):
        if el.tag!=W+'p': continue
        pPr=el.find(W+'pPr'); style=''
        if pPr is not None:
            ps=pPr.find(W+'pStyle')
            if ps is not None: style=ps.get(W+'val')
        buf=[]
        for n in el.iter():
            if n.tag==W+'t': buf.append(n.text or '')
            elif n.tag==W+'br': buf.append('\n')
        t=re.sub(r'\s+',' ',''.join(buf)).strip()
        if t: out.append((style or 'Normal', t))
    return out

def slug(s):
    s=re.sub(r'^\d+\.\s*','',s).lower()
    s=re.sub(r'[^a-z0-9]+','_',s).strip('_')
    return s

def key(sectionslug, text, used):
    t=re.sub(r'\?.*$','',text).lower()
    t=re.sub(r'^(what|where|is|are|does|do|will|can|has|have|how|who|which)\s+','',t)
    t=re.sub(r'[^a-z0-9]+','_',t).strip('_')
    k='_'.join(t.split('_')[:6]) or 'question'
    base=k; n=2
    while k in used: k=f"{base}_{n}"; n+=1
    used.add(k); return k

OPTION_SPLIT=re.compile(r'\s*/\s*')

def infer(text):
    """Returns (type, options, confidence). The label itself is never altered."""
    body=text
    # Trailing explicit option list after the question mark.
    m=re.search(r'\?\s*(.+)$', body)
    if m:
        tail=m.group(1).strip()
        if '/' in tail:
            opts=[o.strip() for o in OPTION_SPLIT.split(tail) if o.strip()]
            if len(opts)>=2:
                if [o.lower() for o in opts]==['yes','no']:
                    return 'BOOLEAN', None, 'high'
                # "15 / 20 / 25 / 30 / 40 mm" states the unit once, on the last
                # option. Lift it off so the choices are the numbers.
                mu=re.match(r'^(\S+)\s+(mm|cm|m|kg)$', opts[-1], re.I)
                if mu and all(re.fullmatch(r'[\d.]+', o) for o in opts[:-1]):
                    opts=opts[:-1]+[mu.group(1)]
                    return 'SINGLE_SELECT', opts, 'high'
                return 'SINGLE_SELECT', opts, 'high'
    q=body.rstrip('?').strip()
    # "A or B?" either/or — e.g. "Supply only or supply & installation?".
    # A comma before the "or" means it is a list inside one yes/no question
    # ("Are there cracks, holes, damaged areas or uneven sections?"), not a
    # choice between two things, so those fall through to BOOLEAN below.
    if ',' not in q:
        m2=re.match(r'^(?:Is it |Does the client require |)(.+?)\s+or\s+(.+)$', q, re.I)
        if m2 and not re.match(r'^(what|where|how|who|which|when)\b', q, re.I):
            a,b=m2.group(1).strip(),m2.group(2).strip()
            # Both sides must be short noun phrases. A side that opens with a
            # verb is a second clause ("...or does it require preparation?"),
            # which is still one yes/no question.
            verb=re.compile(r'^(is|are|does|do|will|can|has|have|should)\b', re.I)
            if (len(a.split())<=4 and len(b.split())<=4
                    and not verb.match(a) and not verb.match(b)):
                return 'SINGLE_SELECT',[a[0].upper()+a[1:], b[0].upper()+b[1:]],'medium'
    if '___' in body:
        return ('DIMENSION', None, 'high') if body.count('___')>1 else ('NUMBER', None, 'medium')
    if re.match(r'^(Is|Are|Does|Do|Will|Can|Has|Have|Should)\b', q, re.I):
        return 'BOOLEAN', None, 'medium'
    if re.match(r'^(What is the|What are the)\s+(total\s+)?(floor\s+)?(wall\s+)?area\b', q, re.I):
        return 'NUMBER', None, 'high'
    if re.match(r'^When\b', q, re.I):
        return 'DATE', None, 'medium'
    if re.match(r'^(What|Where|Which|How|Who)\b', q, re.I):
        return 'SHORT_TEXT', None, 'medium'
    return 'SHORT_TEXT', None, 'low'

ps=paras(SRC)
sections=[]; cur=None; mode='product'
for style,t in ps:
    if style.startswith('Heading'):
        name=t
        if name.upper().startswith('STANDARD SITE EVIDENCE'): mode='evidence'
        elif name.upper().startswith('SITE VISIT CLOSE'): mode='closeout'
        else: mode='product'
        cur={'name':name,'slug':slug(name),'kind':mode,'questions':[],'notes':[],'used':set()}
        sections.append(cur); continue
    if cur is None: continue
    if t.startswith('☐'):
        label=t.lstrip('☐').strip()
        if mode=='evidence':
            cur['questions'].append({'key':key(cur['slug'],label,cur['used']),'label':label,
                                     'type':'PHOTO_EVIDENCE','options':None,'confidence':'high'})
        else:
            ty,opts,conf=infer(label)
            q={'key':key(cur['slug'],label,cur['used']),'label':label,
               'type':ty,'options':opts,'confidence':conf}
            # A yes/no guess on a question that lists alternatives is the one
            # the inference gets wrong most often; mark it for a human pass.
            if conf!='high' and ty=='BOOLEAN' and ' or ' in label.lower():
                q['needsReview']=True
            cur['questions'].append(q)
    elif mode=='closeout' and ':' in t:
        label=t.split(':')[0].strip()
        rest=t.split(':',1)[1]
        ty='BOOLEAN' if '☐ Yes' in rest else 'LONG_TEXT'
        cur['questions'].append({'key':key(cur['slug'],label,cur['used']),'label':label,
                                 'type':ty,'options':None,'confidence':'high'})
    elif t.startswith(('Capture:','Critical:')):
        cur['notes'].append(t)

for s in sections: s.pop('used')


# ---------------------------------------------------------------------------
# Emit the TypeScript template.
# ---------------------------------------------------------------------------

def ts(v, ind=0):
    sp=' '*ind
    if v is None: return 'null'
    if isinstance(v,bool): return 'true' if v else 'false'
    if isinstance(v,str): return json.dumps(v, ensure_ascii=False)
    if isinstance(v,list):
        if all(isinstance(x,str) for x in v):
            return '[' + ', '.join(json.dumps(x, ensure_ascii=False) for x in v) + ']'
        return '[\n'+''.join(f'{sp}  {ts(x,ind+2)},\n' for x in v)+sp+']'
    if isinstance(v,dict):
        return '{\n'+''.join(f'{sp}  {k}: {ts(x,ind+2)},\n' for k,x in v.items())+sp+'}'

def emit(sections):
    out=[]
    for s in sections:
        qs=[]
        for q in s['questions']:
            row={'key':q['key'],'label':q['label'],'type':q['type']}
            if q['options']: row['options']=q['options']
            if q.get('needsReview'): row['needsReview']=True
            qs.append(row)
        sec={'key':s['slug'],'name':s['name'],'kind':s['kind'],'questions':qs}
        if s['notes']: sec['photoGuidance']=s['notes']
        out.append(sec)
    return out

HEADER = '''/**
 * FloorCode Zimbabwe's site-visit question bank.
 *
 * Generated from `docs/client/FloorCode_Zimbabwe_Site_Visit_Question_Bank (1).docx`
 * by `scripts/crm/question-bank-sync.py`. Every `label` is the client's
 * question verbatim — the generator maps, it does not paraphrase. Re-run the
 * script if the client sends a revised bank; do not hand-edit the labels.
 *
 * What IS inferred is each question's `type`, since the .docx is a paper
 * checklist and states a type only where it lists options ("Indoor / Outdoor /
 * Entrance recess") or ends "Yes / No". Questions where the inference is a
 * judgement call carry `needsReview` so somebody can correct them in settings.
 * Correcting one is a data edit against the tenant's own question set, not a
 * change to this file.
 *
 * This is a TEMPLATE, not live configuration. It seeds a tenant's question
 * sets once, the way DEFAULT_STAGE_TEMPLATE seeds a pipeline; from then on the
 * tenant's rows are the source of truth and this file no longer speaks for
 * them.
 */

export type SiteVisitQuestionType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "BOOLEAN"
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "DATE"
  | "DIMENSION"
  | "PHOTO_EVIDENCE";

/**
 * PRODUCT  one section per thing FloorCode sells; attached to a `Product`.
 * EVIDENCE the photo checklist every visit carries regardless of product.
 * CLOSEOUT the rep's sign-off gate at the end of the visit.
 */
export type SiteVisitSectionKind = "product" | "evidence" | "closeout";

export type SiteVisitQuestionTemplate = {
  key: string;
  label: string;
  type: SiteVisitQuestionType;
  options?: string[];
  /** The type is a guess worth a human's eye. Never blocks capture. */
  needsReview?: boolean;
};

export type SiteVisitSectionTemplate = {
  key: string;
  name: string;
  kind: SiteVisitSectionKind;
  questions: SiteVisitQuestionTemplate[];
  /** The "Capture:" / "Critical:" lines the bank states for this section. */
  photoGuidance?: string[];
};

'''

sections_out = emit(sections)
body = HEADER + 'export const FLOORCODE_QUESTION_BANK: SiteVisitSectionTemplate[] = ' + ts(sections_out, 0) + ';\n'
dest = ROOT/'lib/crm/site-visits/floorcode-question-bank.ts'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(body)
print(f"wrote {dest} — {len(sections_out)} sections, {sum(len(s['questions']) for s in sections_out)} questions")
