import { chromium } from 'playwright';
import fs from 'fs';
const items=JSON.parse(fs.readFileSync(process.argv[2]));
const base=process.argv[3];
const b=await chromium.launch();
let n=0;
for (const it of items){
  const p=await b.newPage({viewport:{width:it.width,height:it.height},deviceScaleFactor:1});
  await p.goto('file://'+base+'/'+it.html,{waitUntil:'networkidle'}).catch(()=>{});
  await p.waitForTimeout(400);
  await p.screenshot({path:base+'/'+it.png,fullPage:true});
  await p.close(); n++;
}
await b.close(); console.log('shots',n);
