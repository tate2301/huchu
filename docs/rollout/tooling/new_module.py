"""Create packages/modules/<name> from the module template and wire the host. Usage: new_module.py <name> [requires,...]"""
import os, sys, json, collections, re
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"
name=sys.argv[1]; requires=[r for r in (sys.argv[2].split(",") if len(sys.argv)>2 else []) if r]
PKG=f"{ROOT}/packages/modules/{name}"; os.makedirs(PKG, exist_ok=True)
app_pkg=json.load(open(f"{APP}/package.json")); deps=app_pkg["dependencies"]; dev=app_pkg["devDependencies"]
pkg=collections.OrderedDict([
  ("name", f"@corelithzw/module-{name}"), ("version","0.0.0"), ("private", True),
  ("description", f"The {name} module."),
  ("main","./index.ts"), ("types","./index.ts"),
  ("scripts", collections.OrderedDict([("lint","eslint"),("typecheck","tsc --noEmit -p tsconfig.json"),("test","vitest run")])),
  ("dependencies", collections.OrderedDict(sorted({"@corelithzw/db":"workspace:*","@corelithzw/platform":"workspace:*","@corelithzw/ui":"workspace:*", **{f"@corelithzw/module-{r}":"workspace:*" for r in requires}}.items()))),
  ("peerDependencies", collections.OrderedDict([("next",deps["next"]),("react",deps["react"]),("react-dom",deps["react-dom"])])),
  ("devDependencies", collections.OrderedDict(sorted({"@corelithzw/config":"workspace:*","@types/node":dev["@types/node"],"@types/react":dev["@types/react"],"@types/react-dom":dev["@types/react-dom"],"dotenv":deps["dotenv"],"eslint":dev["eslint"],"eslint-config-next":dev["eslint-config-next"],"next":deps["next"],"react":deps["react"],"react-dom":deps["react-dom"],"typescript":dev["typescript"],"vitest":dev["vitest"]}.items()))),
])
json.dump(pkg, open(f"{PKG}/package.json","w"), indent=2); open(f"{PKG}/package.json","a").write("\n")
open(f"{PKG}/tsconfig.json","w").write('{\n  "extends": "@corelithzw/config/tsconfig/nextjs.json",\n  "compilerOptions": {\n    "types": ["vitest/globals"]\n  },\n  "include": ["**/*.ts", "**/*.tsx"],\n  "exclude": ["node_modules"]\n}\n')
open(f"{PKG}/vitest.config.ts","w").write('import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {\n    environment: "node",\n    globals: true,\n    setupFiles: ["./vitest.setup.ts"],\n    include: ["**/*.test.ts", "**/*.test.tsx"],\n    exclude: ["node_modules"],\n  },\n});\n')
open(f"{PKG}/vitest.setup.ts","w").write('// The repository-root .env, as the hosts read it (a .env beside this package\n// wins), then the test database before Prisma creates its pool.\nimport path from "node:path";\nimport { config as loadEnv } from "dotenv";\n\nloadEnv({ path: [path.join(__dirname, ".env"), path.join(__dirname, "../../../.env")], quiet: true });\n\nif (process.env.DATABASE_URL_TEST) {\n  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;\n}\n')
open(f"{PKG}/eslint.config.mjs","w").write('import { defineConfig, globalIgnores } from "eslint/config";\nimport nextVitals from "eslint-config-next/core-web-vitals";\nimport nextTs from "eslint-config-next/typescript";\n\n// The same rules as the hosts, so a module reads the same wherever it lives.\nexport default defineConfig([...nextVitals, ...nextTs, globalIgnores(["node_modules/**"])]);\n')
open(f"{PKG}/module-boundary.test.ts","w").write('''import { describe, expect, it } from "vitest";
import { moduleBoundaryViolations } from "@corelithzw/platform/testing/module-boundary";
import { manifest } from "./manifest";

describe("module boundary", () => {
  it("imports only the kernel and the modules it declares", () => {
    expect(moduleBoundaryViolations({ dir: __dirname, manifest })).toEqual([]);
  });
});
''')
if not os.path.exists(f"{PKG}/manifest.ts"):
    open(f"{PKG}/manifest.ts","w").write(f'''import type {{ ModuleManifest }} from "@corelithzw/platform/manifest";

export const manifest: ModuleManifest = {{
  id: "{name}",
  requires: {json.dumps(requires)},
}};
''')
if not os.path.exists(f"{PKG}/index.ts"):
    open(f"{PKG}/index.ts","w").write(f'// Deep imports are the norm (`@corelithzw/module-{name}/<file>`); this entry\n// carries the manifest a host composes with.\nexport {{ manifest }} from "./manifest";\n')
# host wiring: dependency + transpilePackages
p=f"{APP}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict)
d["dependencies"][f"@corelithzw/module-{name}"]="workspace:*"; d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
json.dump(d, open(p,"w"), indent=2); open(p,"a").write("\n")
p=f"{APP}/next.config.ts"; s=open(p).read()
m=re.search(r'transpilePackages:\s*\[([^\]]*)\]', s); items=[x.strip().strip('"') for x in m.group(1).split(",") if x.strip()]
if f"@corelithzw/module-{name}" not in items: items.append(f"@corelithzw/module-{name}")
s=s[:m.start()]+"transpilePackages: ["+", ".join(f'"{i}"' for i in items)+"]"+s[m.end():]; open(p,"w").write(s)
# link the new package and the host's dependency on it now, so a failure later in an extraction never leaves the workspace unlinked
import subprocess
subprocess.run("pnpm install --frozen-lockfile=false > /dev/null 2>&1", shell=True, check=True, cwd=ROOT)
print(f"created packages/modules/{name}; host wired; workspace installed")
