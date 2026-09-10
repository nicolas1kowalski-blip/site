import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
p.on('dialog', d=>d.accept());
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async ()=>{
  window.lucide={createIcons:()=>{}}; const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID'],config:{},columnsMeta:{},theme:'Finance'};
  const g=state.governance; g.businessObjects=[{id:'bo1',name:'Client',elements:[],sources:[],structure:[]}]; g.glossary=[{id:'gl1',term:'CA',definition:''}]; g.assets=[{id:'a1',kind:'app',name:'ERP'}]; g.domainList=['RH'];
  const setSel=(sel,v)=>{ sel.value=v; sel.dispatchEvent(new Event('change')); };
  const S=()=>document.getElementById('step-9');
  switchPhase('gov'); openGovTab('objects'); govState.selectedBoId='bo1'; renderGovernance();
  setSel(document.getElementById('bo-domain-bo1'),'Finance'); ok('sans acteur : domaine écrit directement', g.businessObjects[0].domain==='Finance');
  // dictionnaire : sélecteur de domaine sur la table
  govState.dictMode='table'; govState.dictTable='CLIENTS'; openGovTab('dictionary');
  const dd=document.getElementById('dict-domain'); ok('dictionnaire : sélecteur de domaine de la source (Finance sélectionné)', dd && dd.value==='Finance');
  setSel(dd,'RH'); ok('dictionnaire : thème de la table modifié', state.tables.t1.theme==='RH');
  setSel(document.getElementById('dict-domain'),'Finance');
  // contributeur : proposition au lieu de rebond
  govDemoPeople(); const ids={}; g.people.forEach(x=>ids[x.name.split(' ')[0]]=x.id);
  ok('exemple : profil actif Bob (contributeur)', curUser().name.startsWith('Bob'));
  openGovTab('objects'); govState.selectedBoId='bo1'; renderGovernance();
  let sel=document.getElementById('bo-domain-bo1');
  ok('Bob : sélecteur de domaine verrouillé (🔒) et propriétaire verrouillé', sel.disabled && S().textContent.includes('réservé au propriétaire') && document.getElementById('bo-own-bo1').disabled);
  updateBusinessObject('bo1','domain','RH');
  ok('Bob : changement de domaine refusé, aucune proposition', g.businessObjects[0].domain==='Finance' && !g.proposals.some(x=>x.field==='domain'));
  openGovTab('glossary'); const ts=Array.from(S().querySelectorAll('select')).find(s=>/propriétaire|Domaine/.test(s.title||''));
  ok('Bob : domaine du terme verrouillé', ts && ts.disabled);
  openGovTab('assets'); const ai=Array.from(S().querySelectorAll('input[list=assetDomList]'))[0];
  ok('Bob : domaine et responsable de l\'application verrouillés', ai.disabled && Array.from(S().querySelectorAll('input')).some(i=>i.disabled && /Responsable/.test(i.placeholder)));
  ok('liste des domaines des applis inclut RH (domainList)', document.getElementById('assetDomList') && document.getElementById('assetDomList').innerHTML.includes('RH'));
  govState.dictMode='table'; govState.dictTable='CLIENTS'; openGovTab('dictionary');
  ok('Bob : domaine de la source verrouillé', document.getElementById('dict-domain').disabled);
  updateTableTheme('t1','RH'); ok('Bob : thème inchangé, aucune proposition', state.tables.t1.theme==='Finance' && !g.proposals.length);
  // Alice (propriétaire) change tout directement
  govSetUser(ids.Alice);
  updateBusinessObject('bo1','domain','RH'); updateGlossaryTerm('gl1','domain','RH'); updateGovAsset('a1','domain','RH'); updateTableTheme('t1','RH');
  ok('Alice : objet, terme, appli et source passent en RH directement', g.businessObjects[0].domain==='RH' && g.glossary[0].domain==='RH' && g.assets[0].domain==='RH' && state.tables.t1.theme==='RH' && !g.proposals.length);
  ok('Alice : sélecteur de domaine actif', (openGovTab('objects'), govState.selectedBoId='bo1', renderGovernance(), !document.getElementById('bo-domain-bo1').disabled));
  // suppression d'un domaine
  openGovTab('people');
  ok('chips domaines avec usages et ✕', S().innerHTML.includes("govRemoveDomain('RH')") && /1 source\(s\), 1 objet\(s\), 1 terme\(s\), 1 appli/.test(S().textContent));
  govAddRole && (()=>{ g.people[0].roles.push({domain:'RH',role:'owner'}); })();
  govRemoveDomain('RH');
  ok('domaine supprimé partout (confirm accepté)', !govDomains().includes('RH') && !g.businessObjects[0].domain && !g.glossary[0].domain && !g.assets[0].domain && !state.tables.t1.theme && !g.people[0].roles.some(r=>r.domain==='RH'));
  ok('Finance (non utilisé) reste supprimable', S().innerHTML.includes("govRemoveDomain('Finance')") || !govDomains().includes('Finance'));
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 900 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' });
  await q.evaluate(()=>{ window.lucide={createIcons:()=>{}}; state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID'],config:{},columnsMeta:{},theme:'Finance'};
    const g=state.governance; g.businessObjects=[{id:'bo1',name:'Client',definition:'Un client facturé',elements:[],sources:[],structure:[],domain:'Finance'}]; g.domainList=['RH']; govDemoPeople(); switchPhase('gov'); openGovTab('objects'); govState.selectedBoId='bo1'; renderGovernance();
    const s=document.getElementById('bo-domain-bo1'); s.value='RH'; s.dispatchEvent(new Event('change')); });
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(500); await q.screenshot({ path: D+'dom_obj_'+theme+'.png' });
  await q.evaluate(()=>{ openGovTab('people'); }); await q.waitForTimeout(300); await q.screenshot({ path: D+'dom_people_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
