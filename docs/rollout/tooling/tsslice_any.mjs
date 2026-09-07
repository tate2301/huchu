// Print the exact source ranges of named top-level exports, via the TypeScript parser.
import ts from "/home/user/huchu/apps/legacy/node_modules/typescript/lib/typescript.js";
import { readFileSync } from "node:fs";
const [file, namesArg] = process.argv.slice(2);
const wanted = new Set(namesArg.split(","));
const text = readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const out = [];
for (const stmt of sf.statements) {
  const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) ?? [] : [];
  const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  let name = null;
  if (ts.isFunctionDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) name = stmt.name?.text ?? null;
  else if (ts.isVariableStatement(stmt)) { const d = stmt.declarationList.declarations[0]; name = ts.isIdentifier(d.name) ? d.name.text : null; }
  if (!name || !wanted.has(name)) continue;
  // start at the statement's leading comments (JSDoc and line comments), not at the trivia before the previous statement's end
  let start = stmt.getFullStart();
  const leading = ts.getLeadingCommentRanges(text, start) ?? [];
  start = leading.length ? leading[0].pos : stmt.getStart(sf, true);
  const kind = ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt) ? "type" : "value"; out.push({ name, start, end: stmt.end, kind, exported }); continue;
  out.push({ name, start, end: stmt.end, kind });
}
console.log(JSON.stringify(out));
