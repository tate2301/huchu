"""Phase 3.1a: the campus module's API routes and pages into the package; the legacy host composed from them."""
import os, re, subprocess, sys
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/campus"
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
def walk(base):
    for dp,dn,fn in os.walk(base):
        dn[:]=[d for d in dn if d not in ("node_modules",".next",".turbo")]
        for f in fn:
            if f.endswith((".ts",".tsx")): yield os.path.join(dp,f)
def move_tree(src, dst):
    for dp,dn,fn in os.walk(src):
        rel=os.path.relpath(dp, src); target=os.path.join(dst, rel) if rel!="." else dst
        os.makedirs(target, exist_ok=True)
        for f in fn: sh(f'git mv "{os.path.join(dp,f)}" "{os.path.join(target,f)}"')
    sh(f'rm -rf "{src}"')
steps=sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps
PAGE_DIRS=["app/schools","app/portal/parent","app/portal/student","app/portal/teacher","app/c"]
API_DIRS=["app/api/v2/schools","app/api/v2/portal","app/api/public/schools"]

if want("session"):
    # a page in a package cannot import the host's auth options; the kernel resolves them
    n=0
    for d in PAGE_DIRS+API_DIRS:
        for p in walk(f"{APP}/{d}"):
            s=open(p).read()
            if "authOptions" not in s: continue
            new=s.replace("getServerSession(authOptions)","getCurrentAuthSession()")
            new=re.sub(r'import \{ authOptions \} from "@/lib/auth";?\n', '', new)
            if "getServerSession" not in new.replace('import { getServerSession }',''):
                new=re.sub(r'import \{ getServerSession \} from "next-auth";?\n', 'import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";\n', new)
            else:
                new=new.replace('import { getServerSession } from "next-auth";', 'import { getServerSession } from "next-auth";\nimport { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";')
            assert "authOptions" not in new, p
            if new!=s: open(p,"w").write(new); n+=1
    print(f"session seam: {n} files")

if want("move"):
    for d in API_DIRS: move_tree(f"{APP}/{d}", f"{PKG}/api/{d[len('app/api/'):]}")
    for d in PAGE_DIRS: move_tree(f"{APP}/{d}", f"{PKG}/pages/{d[len('app/'):]}")
    # the two tests that read the host, back with what they read
    sh(f'git mv "{APP}/lib/host/schools-route-guard-coverage.test.ts" "{PKG}/api/route-guard-coverage.test.ts"')
    p=f"{PKG}/api/route-guard-coverage.test.ts"; s=open(p).read()
    s=s.replace('join(process.cwd(), "app/api/v2/schools")','join(__dirname, "v2/schools")')
    assert '__dirname, "v2/schools"' in s, "route-guard scandir anchor"
    open(p,"w").write(s)
    # the fee fiscalisation test reads the host's accounting replay route: it stays in the host
    sh(f'git mv "{PKG}/api/v2/schools/fees/fee-fiscalisation.test.ts" "{APP}/lib/host/schools-fee-fiscalisation.test.ts"')
    print("moved")

if want("rewrite"):
    # inside the package: the package's own name becomes a relative path; the moved test's relative imports become package paths
    m=0
    for p in walk(PKG):
        s=open(p).read(); d=os.path.dirname(p)
        def repl(mm):
            t=mm.group(2)
            if not t.startswith("@corelithzw/module-campus/"): return mm.group(0)
            r=os.path.relpath(os.path.join(PKG, t[len("@corelithzw/module-campus/"):]), d)
            return f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}'
        new=re.compile(r'(["\'])(@corelithzw/module-campus/[^"\']+)\1').sub(repl, s)
        if new!=s: open(p,"w").write(new); m+=1
    p=f"{APP}/lib/host/schools-fee-fiscalisation.test.ts"; s=open(p).read()
    def rel_to_pkg(mm):
        spec=mm.group(2)
        target=os.path.normpath(os.path.join(f"{PKG}/api/v2/schools/fees", spec))
        rel=os.path.relpath(target, PKG)
        return f'{mm.group(1)}@corelithzw/module-campus/{rel}{mm.group(1)}'
    new=re.sub(r'(["\'])(\.{1,2}/[^"\']+)\1', rel_to_pkg, s)
    open(p,"w").write(new)
    found=re.findall(r'from "(@corelithzw/module-campus/[^"]+)"', new)
    print(f"rewritten package={m}; host test imports: {found[:6]}")

if want("compose"):
    sh("node scripts/compose-host.mjs apps/legacy campus")

if want("check"):
    left=[]
    for p in walk(PKG):
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, PKG))
    print("package files importing '@/':", left or "none")
    print("thin route files:", sum(1 for p in walk(f"{APP}/app/api/v2/schools") if p.endswith("route.ts")), "thin pages:", sum(1 for p in walk(f"{APP}/app/schools") if p.endswith("page.tsx")))
