// For each top-level declaration of a file: name, exported?, kind, and the other top-level names it references.
import ts from "/home/user/huchu/apps/legacy/node_modules/typescript/lib/typescript.js";
import { readFileSync } from "node:fs";
const [file] = process.argv.slice(2);
const text = readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const decls = [];
for (const stmt of sf.statements) {
  const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) ?? [] : [];
  const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  let name = null, kind = "value";
  if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) name = stmt.name?.text ?? null;
  else if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) { name = stmt.name.text; kind = "type"; }
  else if (ts.isVariableStatement(stmt)) { const d = stmt.declarationList.declarations[0]; name = ts.isIdentifier(d.name) ? d.name.text : null; }
  if (!name) continue;
  decls.push({ name, exported, kind, stmt });
}
const names = new Set(decls.map((d) => d.name));
const out = [];
for (const d of decls) {
  const refs = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node) && names.has(node.text) && node.text !== d.name) refs.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(d.stmt);
  out.push({ name: d.name, exported: d.exported, kind: d.kind, refs: [...refs] });
}
console.log(JSON.stringify(out));
