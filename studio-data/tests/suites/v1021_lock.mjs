import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const SEED=`window.lucide={createIcons:()=>{}};
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM'],config:{},columnsMeta:{},theme:'Finance'};
  state.tables['t2']={id:'t2',name:'PAIE',type:'csv',status:'ready',headers:['MAT'],config:{},columnsMeta:{},theme:'RH'};
  const g=state.governance; g.businessObjects=[{id:'bo1',name:'Client',definition:'Un client facturé',domain:'Finance',elements:[{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}]}],sources:[{table:'CLIENTS',role:'maitre'}],structure:[]},{id:'bo2',name:'Salarié',domain:'RH',elements:[{id:'s1',name:'Matricule',mappings:[]}],sources:[],structure:[]}];
  g.glossary=[{id:'gl1',term:'CA',definition:'',domain:'Finance'},{id:'gl2',term:'Matricule',definition:'',domain:'RH'}]; g.assets=[{id:'a1',kind:'app',name:'ERP',domain:'Finance'},{id:'a2',kind:'app',name:'SIRH',domain:'RH'}];
  g.people=[{id:'u1',name:'Léa Petit',roles:[{domain:'Finance',role:'reader'},{domain:'RH',role:'contrib'}]},{id:'u2',name:'Alice Martin',roles:[{domain:'',role:'owner'}]}]; govSetUser('u1');`;
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async (SEED)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); eval(SEED);
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  const S=()=>document.getElementById('step-9'); const zone=()=>S().querySelector('[data-gov-lock="1"]');
  const allOff=z=>Array.from(z.querySelectorAll('input,select,textarea,button')).filter(n=>!n.closest('[data-ro="keep"]')).every(n=>n.disabled);
  ok('Léa : lectrice Finance, contributrice RH, pas en mode consultation global', govRoleIn('Finance')==='reader' && govRoleIn('RH')==='contrib' && !govIsReadOnly());
  // objet Finance : zone grisée
  switchPhase('gov'); openGovTab('objects'); govState.selectedBoId='bo1'; govState.structView='fiche'; setBoTab('structure');
  let z=zone();
  ok('objet Finance : zone verrouillée avec bandeau « Lecture seule » et nom du domaine', z && z.querySelector('.gov-lock-band') && /Lecture seule/.test(z.textContent) && /Finance/.test(z.querySelector('.gov-lock-band').textContent));
  ok('objet Finance : tous les champs et boutons de la fiche désactivés', allOff(z) && z.querySelector('#bo-def-bo1').disabled && Array.from(z.querySelectorAll('button')).some(b2=>/Attribut/.test(b2.textContent)&&b2.disabled));
  ok('objet Finance : liste des objets et onglets restent utilisables', !document.querySelector('#boListCol button').disabled);
  // objet RH : formulaire actif, champs réservés grisés
  govState.selectedBoId='bo2'; renderGovernance(); z=zone();
  ok('objet RH (contributrice) : pas de zone verrouillée, définition modifiable', !z && !document.getElementById('bo-def-bo2').disabled);
  ok('objet RH : propriétaire et domaine grisés (réservés)', document.getElementById('bo-own-bo2').disabled && document.getElementById('bo-domain-bo2').disabled && S().textContent.includes('réservé au propriétaire'));
  // glossaire
  openGovTab('glossary');
  const c1=document.getElementById('gl-card-gl1'), c2=document.getElementById('gl-card-gl2');
  ok('terme Finance verrouillé, terme RH actif', c1.getAttribute('data-gov-lock')==='1' && allOff(c1) && !c2.hasAttribute('data-gov-lock') && !c2.querySelector('input').disabled);
  // applications
  openGovTab('assets');
  const cards=Array.from(S().querySelectorAll('[data-gov-lock="1"]'));
  ok('application ERP (Finance) verrouillée, SIRH (RH) active', cards.length===1 && /ERP/.test(cards[0].textContent) && allOff(cards[0]) && !Array.from(S().querySelectorAll('input')).find(i=>i.value==='SIRH').disabled);
  // dictionnaire par table
  govState.dictMode='table'; govState.dictTable='CLIENTS'; openGovTab('dictionary'); z=zone();
  ok('dictionnaire CLIENTS (Finance) : table grisée, sélecteur de table utilisable', z && allOff(z) && !Array.from(S().querySelectorAll('select')).find(s=>s.closest('[data-ro="keep"]')||s.getAttribute('data-ro')==='keep').disabled);
  govState.dictTable='PAIE'; renderGovernance();
  ok('dictionnaire PAIE (RH) : modifiable', !zone() && Array.from(S().querySelectorAll('td input')).some(i=>!i.disabled));
  govState.dictMode='bo'; govState.dictBoId='bo1'; renderGovernance();
  ok('dictionnaire par objet, Client (Finance) : grisé', !!zone());
  // Alice : rien de grisé
  govSetUser('u2'); openGovTab('objects'); govState.selectedBoId='bo1'; renderGovernance();
  ok('Alice propriétaire : aucune zone grisée, domaine actif', !zone() && !document.getElementById('bo-domain-bo1').disabled);
  // sans acteurs : rien
  state.governance.people=[]; renderGovernance(); openGovTab('glossary');
  ok('sans acteur : aucune zone grisée', !zone());
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' });
  await q.evaluate((SEED)=>{ eval(SEED); switchPhase('gov'); openGovTab('objects'); govState.selectedBoId='bo1'; govState.structView='fiche'; setBoTab('structure'); document.querySelectorAll('#globalError').forEach(e=>e.remove()); }, SEED);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(400); const z=await q.$('[data-gov-lock="1"]'); if(z) await z.scrollIntoViewIfNeeded(); await q.screenshot({ path: D+'lock_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
