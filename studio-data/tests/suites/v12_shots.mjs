import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(ROOT + 'StudioDataV12.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
for (const theme of ['light','dark']) {
  const p = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
  await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1400);
  await p.evaluate(()=>{ window.lucide={createIcons:()=>{}}; try{v11TourEnd(true); wizClose();}catch(e){}
    state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','CA_HT','VILLE'],config:{},columnsMeta:{},theme:'Finance',lastRows:1200,file:{name:'clients.csv'},lastRefresh:Date.now()-9*864e5};
    state.tables['t2']={id:'t2',name:'FACTURES',type:'xlsx',status:'ready',headers:['NUM','ID_CLIENT','MONTANT','DATE'],config:{},columnsMeta:{},theme:'Finance',lastRows:5400};
    state.tables['t3']={id:'t3',name:'CRM_EXPORT',type:'csv',status:'ready',headers:['CID','EMAIL','ETAPE'],config:{},columnsMeta:{}};
    state.relations.push({id:'r1',sourceTable:'t2',targetTable:'t1',sourceCol:'ID_CLIENT',targetCol:'ID',type:'N-1'});
    switchPhase('gov'); v11LoadSample(); renderTables(); switchTab(11); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); });
  if (theme==='dark') await p.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await p.waitForTimeout(300); await p.screenshot({ path: D+'v12_home_'+theme+'.png' });
  await p.evaluate(()=>{ switchTab(1); v12SrcView('list'); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'v12_sources_'+theme+'.png' });
  await p.evaluate(()=>{ v12SrcView('cards'); switchTab(3); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'v12_extract_'+theme+'.png' });
  await p.evaluate(()=>{ switchTab(8); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'v12_quality_'+theme+'.png' });
  await p.close();
}
await b.close(); console.log('shots ok');
