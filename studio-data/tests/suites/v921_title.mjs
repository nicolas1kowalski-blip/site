import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage(); const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'});
const r = await p.evaluate(()=>[document.title, APP_VERSION, APP_CHANGELOG[0].v]);
const ok = r[0]==='Studio Data 10.2.3' && r[1]==='10.2.3' && r[2]==='10.2.3' && !html.includes('<title>Studio Data V5');
console.log((ok?'✅':'❌')+' titre de l\'onglet = « '+r[0]+' » · version '+r[1]+' · erreurs page: '+perr.length);
await b.close(); process.exit(ok&&!perr.length?0:1);
