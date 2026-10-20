import { chromium } from 'playwright';
const b = await chromium.launch();
for (const a of process.argv.slice(2)) { const [f,w,h]=a.split(':'); const p = await b.newPage({viewport:{width:+w,height:+h}});
await p.goto('file://'+process.cwd()+'/'+f+'.html'); await p.waitForTimeout(1200); await p.screenshot({path:f+'.png', fullPage:true}); await p.close(); }
await b.close();
