"""Split the host's composition: manifests.ts (data, importable on the client and the edge) from modules.ts (server wiring)."""
import re
APP="/home/user/huchu/apps/legacy"
def edit(path, pairs):
    s=open(path).read()
    for old,new,count in pairs:
        n=s.count(old); assert n==count,(path,old[:70],n,count)
    for old,new,count in pairs: s=s.replace(old,new)
    open(path,"w").write(s)
s=open(f"{APP}/modules.ts").read()
# manifest imports and registration move to manifests.ts
manifest_imports=re.findall(r'^import \{ manifest as \w+(?:, \w+)* \} from "[^"]+";\n', s, re.M)
reg=re.search(r'^registerModules\(\[[^\]]*\]\);\n', s, re.M).group(0)
unmet=s[s.index("const unmet = unmetModuleRequirements();"):s.index("}\n", s.index("const unmet = unmetModuleRequirements();"))+2]
manifest_only=[]
for imp in manifest_imports:
    names=re.search(r'import \{ ([^}]*) \} from "([^"]+)"', imp)
    parts=[p.strip() for p in names.group(1).split(",")]
    mparts=[p for p in parts if p.startswith("manifest as")]
    rest=[p for p in parts if not p.startswith("manifest as")]
    manifest_only.append(f'import {{ {", ".join(mparts)} }} from "{names.group(2)}";\n')
    new_imp=f'import {{ {", ".join(rest)} }} from "{names.group(2)}";\n' if rest else ""
    s=s.replace(imp, new_imp)
s=s.replace(reg, "").replace(unmet, "")
s=s.replace('import { registerModules, unmetModuleRequirements } from "@corelithzw/platform/manifest";\n', 'import "./manifests";\n')
s=s.replace('''/**
 * What this host composes, and how it authenticates.
 *
 * The kernel keeps registries it never populates itself: NextAuth's options
 * and the manifests of the modules a host composes, from which it reads the
 * permission catalog's capability sets and the gated routes. This file is the
 * one place that fills them for this host. Imported once at boot from
 * `instrumentation.ts`, and by any test that reads a registry.
 *''', '''/**
 * How this host is wired: the code its modules hook into each other with, and
 * how it authenticates. What it composes is `manifests.ts`, imported first.
 *
 * Server only. Imported once at boot from `instrumentation.ts`, and by any
 * test that reads a registry the code below fills.
 *''')
assert "How this host is wired" in s, "modules.ts header did not match"
s=re.sub(r'\n{3,}', "\n\n", s)
open(f"{APP}/modules.ts","w").write(s)
open(f"{APP}/manifests.ts","w").write('''/**
 * What this host composes.
 *
 * The manifests of every module this host runs, handed to the kernel's
 * registry. Data only — nothing here reaches a database — so the file is
 * imported wherever the registries are read: at boot on the server
 * (`modules.ts`), by the providers in the browser (`app-providers.tsx`), and
 * by the proxy on the edge. `lib/host/manifests.test.ts` keeps it that way.
 */
import { registerModules, unmetModuleRequirements } from "@corelithzw/platform/manifest";
'''+"".join(manifest_only)+"\n"+reg+"\n"+unmet)
edit(f"{APP}/components/providers/app-providers.tsx", [('"use client";\n', '"use client";\n\nimport "@/manifests";\n', 1)])
edit(f"{APP}/proxy.ts", [('import { withAuth } from "next-auth/middleware";\n', '// The route registry reads the manifests, and the edge runtime has no boot hook.\nimport "@/manifests";\nimport { withAuth } from "next-auth/middleware";\n', 1)])
open(f"{APP}/lib/host/manifests.test.ts","w").write('''import { describe, expect, it, vi } from "vitest";

/**
 * The manifests are data: the browser and the edge runtime import them, so
 * none of them may pull a database client into its graph. This fails the
 * moment a manifest imports something that imports Prisma.
 */
vi.mock("@corelithzw/db/client", () => {
  throw new Error("a manifest reached the database client");
});

describe("host manifests", () => {
  it("import without touching the database client", async () => {
    const { registeredModules } = await import("@corelithzw/platform/manifest");
    await import("@/manifests");
    expect(registeredModules().map((manifest) => manifest.id)).toContain("crm");
  });
});
''')
print("manifests.ts split; providers and proxy import it; test added")
