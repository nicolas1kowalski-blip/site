import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(ROOT + 'StudioDataV11.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); }); p.on('console', m=>{ if(m.type()==='error' && !/lucide|favicon|net::|IDBFactory|Restauration/.test(m.text())) perr.push('console: '+m.text()); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' }); await p.waitForTimeout(200);
const SEED=()=>{ window.lucide={createIcons:()=>{}}; v11Prefs.tourDone=true; v11TourEnd(true);
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','CA_HT'],config:{},columnsMeta:{},theme:'Finance',lastRows:1200};
  state.tables['t2']={id:'t2',name:'CRM_EXPORT',type:'csv',status:'ready',headers:['CID','EMAIL'],config:{},columnsMeta:{}};
  switchPhase('gov'); v11LoadSample(); const g=state.governance; const bo=g.businessObjects[0]; bo.sources=[{table:'CLIENTS',role:'maitre'},{table:'CRM_EXPORT',role:'contributeur'}]; bo.elements[0].mappings=[{table:'CLIENTS',col:'ID'}]; bo.elements[2].mappings=[{table:'CLIENTS',col:'EMAIL'},{table:'CRM_EXPORT',col:'EMAIL'}]; g.assets[0].sources=['CLIENTS']; g.dictionary.CLIENTS={description:'Référentiel client',owner:'Alice Martin',columns:{ID:{definition:'Identifiant'},EMAIL:{sensitivity:'Personnel (RGPD)'}}};
  g.people.push({id:'u3',name:'Bob Durand2',roles:[{domain:'Finance',role:'contrib'}]}); persistAppState(); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); };
await p.evaluate(SEED);
const shots=[['catalog',()=>openGovTab('catalog')],['catfiche',()=>{ const i=catRes.findIndex(r=>r.type==='bo'); catOpenFiche(i); }],['catlineage',()=>{ closeUxDrawer(); const i=catRes.findIndex(r=>r.type==='bo'); catOpenFiche(i); catGoLineage(); }],['flow',()=>{ closeUxDrawer(); openGovTab('flow'); }],['model',()=>openGovTab('model')],['dictbo',()=>{ govState.dictMode='bo'; openGovTab('dictionary'); }],['assets_edit',()=>{ openGovTab('assets'); v11ToggleEdit('asset',state.governance.assets[0].id); }],['review',()=>{ v11ToggleEdit('asset',state.governance.assets[0].id); govSetUser('u3'); boAttrWrite(state.governance.businessObjects[0].id,'',state.governance.businessObjects[0].elements[1].id,'definition','Nom légal (proposé)'); govSetUser(state.governance.people[0].id); openGovTab('review'); }],['people',()=>openGovTab('people')],['bo_contrib',()=>{ govSetUser('u3'); v11GoBo(state.governance.businessObjects[0].id); }],['bo_reader_lock',()=>{ state.governance.people.push({id:'u4',name:'Léa',roles:[{domain:'Finance',role:'reader'},{domain:'Commerce',role:'contrib'}]}); govSetUser('u4'); v11GoBo(state.governance.businessObjects[0].id); }],['bo_lineage',()=>{ govSetUser(state.governance.people[0].id); v11GoBo(state.governance.businessObjects[0].id); document.querySelector('.v11-fiche .acts button[title^="Applications"]').click(); }],['present',()=>{ v11Present(true); v11GoBo(state.governance.businessObjects[0].id); }],['wizard',()=>{ v11Present(false); v11WizardOpen(); }],['bulk',()=>{ v11ModalClose(); v11BulkOpen(state.governance.businessObjects[0].id); }]];
for (const [n,fn] of shots) { try { await p.evaluate(fn); } catch(e) { console.log('ERR '+n+': '+String(e).slice(0,200)); } await p.waitForTimeout(400); await p.evaluate(()=>document.querySelectorAll('.v11-toast').forEach(t=>t.remove())); await p.screenshot({ path: D+'t2_'+n+'.png' }); }
await p.evaluate(()=>{ v11ModalClose(); });
await p.setViewportSize({ width: 1000, height: 900 }); await p.evaluate(()=>{ v11GoBo(state.governance.businessObjects[0].id); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'t2_narrow.png' });
await p.evaluate(()=>{ openGovTab('home'); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'t2_narrow_home.png' });
console.log('errors', perr.length); perr.slice(0,10).forEach(e=>console.log('  ',e.slice(0,300)));
await b.close();
