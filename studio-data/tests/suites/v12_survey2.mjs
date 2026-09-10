import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV12.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); }); p.on('console', m=>{ if(m.type()==='error' && !/lucide|favicon|net::|IDBFactory|Restauration|DuckDB/.test(m.text())) perr.push('console: '+m.text()); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' }); await p.evaluate(()=>{ if(window.v11Prefs){ v11Prefs.tourDone=true; } }); await p.waitForTimeout(1500); await p.evaluate(()=>{ try{v11TourEnd(true); wizClose();}catch(e){} });
await p.evaluate(()=>{ window.lucide={createIcons:()=>{}}; if(window.v11Prefs){ v11Prefs.tourDone=true; try{v11TourEnd(true);}catch(e){} }
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','CA_HT','VILLE'],config:{},columnsMeta:{},theme:'Finance',lastRows:1200,file:{name:'clients.csv'},lastRefresh:Date.now()-9*864e5};
  state.tables['t2']={id:'t2',name:'FACTURES',type:'xlsx',status:'ready',headers:['NUM','ID_CLIENT','MONTANT','DATE'],config:{},columnsMeta:{},theme:'Finance',lastRows:5400};
  state.tables['t3']={id:'t3',name:'CRM_EXPORT',type:'csv',status:'ready',headers:['CID','EMAIL','ETAPE'],config:{},columnsMeta:{}};
  state.relations.push({id:'r1',sourceTable:'t2',targetTable:'t1',sourceCol:'ID_CLIENT',targetCol:'ID',type:'N-1'});
  try { renderTables(); } catch(e) { console.log('renderTables', e.message); }
  const g=state.governance; if (typeof v11LoadSample==='function') { switchPhase('gov'); v11LoadSample(); }
  document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); });
const steps=[[11,'cockpit'],[1,'sources'],[10,'tables'],[2,'modele'],[16,'series'],[3,'extraire'],[13,'preparation'],[14,'dashboards'],[7,'comparer'],[6,'explorer'],[4,'stats'],[5,'explo360'],[8,'qualite'],[12,'regles'],[15,'rapprochement']];
for (const [n,name] of steps) { try { await p.evaluate(n=>switchTab(n), n); } catch(e) { console.log('ERR', name, String(e).slice(0,150)); } await p.waitForTimeout(500); await p.evaluate(()=>document.querySelectorAll('.v11-toast').forEach(t=>t.remove())); await p.screenshot({ path: D+'s13_'+name+'.png' }); }
for (const [fn,name] of [['wizOpen("menu")','wizmenu'],['wizClose(); openBackupCenter()','backup'],['toggleDbModal()','dbmodal'],['toggleDbModal(); openMergeModal()','merge']]) { try { await p.evaluate(fn=>eval(fn), fn); } catch(e) { console.log('ERR', name, String(e).slice(0,150)); } await p.waitForTimeout(400); await p.screenshot({ path: D+'s13_'+name+'.png' }); }
console.log('errors', perr.length); perr.slice(0,8).forEach(e=>console.log('  ',e.slice(0,200)));
await b.close();
