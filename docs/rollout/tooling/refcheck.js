const ts=require("typescript");const fs=require("fs");
const src=fs.readFileSync("lib/api.ts","utf8");const sf=ts.createSourceFile("api.ts",src,ts.ScriptTarget.Latest,true);
const declared=new Set();sf.statements.forEach(st=>{const n=st.name&&st.name.text;if(n)declared.add(n);});
const imported=new Set();sf.statements.forEach(st=>{if(ts.isImportDeclaration(st)&&st.importClause){const nb=st.importClause.namedBindings;if(nb&&ts.isNamedImports(nb))nb.elements.forEach(e=>imported.add(e.name.text));if(st.importClause.name)imported.add(st.importClause.name.text);}});
for(const [label,list] of Object.entries(JSON.parse(process.argv[2]))){
  const names=new Set(list);const refs=new Set();
  function visit(node){if(ts.isIdentifier(node))refs.add(node.text);ts.forEachChild(node,visit);}
  sf.statements.forEach(st=>{const n=st.name&&st.name.text;if(n&&names.has(n))visit(st);});
  const missingDecl=[...names].filter(n=>!declared.has(n));
  const unsliced=[...refs].filter(r=>declared.has(r)&&!names.has(r));
  const imps=[...refs].filter(r=>imported.has(r));
  console.log(`${label}: not-declared=[${missingDecl}] unsliced=[${unsliced}] imports-used=[${imps}]`);
}
