import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(ROOT + 'StudioDataV11.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); }); p.on('dialog', d=>d.accept());
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); try { window.lucide={createIcons:()=>{}}; v11Prefs.tourDone=true; v11TourEnd(true); restoreCompleted=true;
  const S=()=>document.getElementById('govContent'); const g=state.governance;
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM'],config:{},columnsMeta:{},theme:'Finance'};
  switchPhase('gov'); v11LoadSample(); const bo=g.businessObjects[0]; persistAppState();
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  // maître / détail glossaire
  openGovTab('glossary');
  ok('glossaire : barre de filtre, 1 fiche ouverte, 1 ligne compacte', S().querySelector('.v11-listbar') && S().querySelectorAll('.v11-fiche').length===1 && S().querySelectorAll('.v11-rowcard').length===1);
  S().querySelector('.v11-rowcard').click();
  ok('clic sur la ligne : elle devient la fiche ouverte, l\'autre se replie', S().querySelector('.v11-fiche h2').textContent==='Client actif' && S().querySelector('.v11-rowcard .nm').textContent==='Chiffre d\'affaires');
  ok('fil d\'Ariane jusqu\'au terme', document.getElementById('govCrumb').textContent.includes('Client actif'));
  const fi=S().querySelector('.v11-listbar input'); fi.value='chiffre'; fi.dispatchEvent(new Event('input'));
  ok('filtre : la ligne « Client actif » masquée, « Chiffre » visible', getComputedStyle(el('gl-card-'+g.glossary[1].id)).display==='none' && getComputedStyle(el('gl-card-'+g.glossary[0].id)).display!=='none');
  v11State.termQ='';
  termTagOpen(g.glossary[0].id); ok('termTagOpen sélectionne le terme et l\'enregistre dans les récents', S().querySelector('.v11-fiche h2').textContent==='Chiffre d\'affaires' && v11RecentList()[0].kind==='term');
  // applications
  openGovTab('assets');
  ok('applications : une fiche ouverte (étroite), lignes compactes, filtre, analyse d\'impact repliée', S().querySelectorAll('.v11-fiche.narrow').length===1 && S().querySelectorAll('.v11-rowcard').length===2 && S().querySelector('.v11-listbar') && S().querySelector('.v11-collapse') && getComputedStyle(el('impactResult').parentElement).display==='none');
  S().querySelectorAll('.v11-rowcard')[1].click(); ok('clic sur le processus : sa fiche s\'ouvre', S().querySelector('.v11-fiche h2').textContent==='Facturation mensuelle' && document.getElementById('govCrumb').textContent.includes('Facturation'));
  S().querySelector('.v11-collapse .hd2').click(); ok('analyse d\'impact dépliée', getComputedStyle(el('impactResult').parentElement).display!=='none'); v11State.impactOpen=false;
  // inline attributs
  v11GoBo(bo.id); const F=()=>document.getElementById('v11-bo-'+bo.id);
  const cell=F().querySelector('.v11-ie[data-kind="attr"][data-field="definition"]'); cell.click();
  ok('cellule définition éditable sur place, sans ouvrir le formulaire', cell.querySelector('textarea') && !document.querySelector('.v11-editbar'));
  cell.querySelector('textarea').value='Définition en place'; cell.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));
  ok('définition d\'attribut enregistrée', bo.elements[0].definition==='Définition en place');
  const sc=F().querySelector('.v11-ie[data-kind="attr"][data-field="sensitivity"]'); sc.click(); const ss=sc.querySelector('select'); ss.value='Sensible'; ss.dispatchEvent(new Event('change'));
  ok('sensibilité d\'attribut enregistrée', bo.elements[0].sensitivity==='Sensible');
  // mode concentration
  ok('lecture : liste des objets visible', getComputedStyle(el('boListCol')).display!=='none');
  v11ToggleEdit('bo',bo.id);
  ok('modification : liste des objets et bandeaux masqués, barre présente', getComputedStyle(el('boListCol')).display==='none' && document.querySelector('.v11-editbar') && Array.from(S().querySelectorAll('button')).filter(b2=>/Autres façons/.test(b2.textContent)).every(b2=>b2.offsetParent===null));
  v11ToggleEdit('bo',bo.id); ok('retour lecture : liste de nouveau visible', getComputedStyle(el('boListCol')).display!=='none');
  for (let i=0;i<8;i++) g.businessObjects.push({id:'x'+i,name:'Objet '+i,elements:[],sources:[],structure:[]}); renderGovernance();
  const bf=S().querySelector('.v11-attrfilter input'); ok('plus de 8 objets : filtre de la liste', !!bf); bf.value='Objet 3'; bf.dispatchEvent(new Event('input'));
  ok('filtre de la liste : une seule carte visible', Array.from(el('boListCol').children).filter(c=>getComputedStyle(c).display!=='none').length===1); v11State.boQ2=''; g.businessObjects=g.businessObjects.filter(b2=>!/^x/.test(b2.id));
  // récents : accueil + palette
  openGovTab('home'); ok('accueil : « Reprendre où vous en étiez » avec l\'objet et le terme', S().textContent.includes('Reprendre où vous en étiez') && S().textContent.includes('Client') && S().textContent.includes('Chiffre d\'affaires'));
  v11PaletteOpen(); ok('palette vide : récents en tête', document.querySelector('#v11PalRes .grp').textContent==='Récents'); v11PaletteClose();
  // suppression : confirmation + annuler
  document.querySelectorAll('.v11-toast').forEach(x=>v11ToastClose(x)); v11State.toasts=[]; v11State.toastOn=null; const n0=g.businessObjects.length; removeBusinessObject(g.businessObjects[1].id);
  ok('suppression confirmée (dialogue accepté), notification avec Annuler', g.businessObjects.length===n0-1 && document.querySelector('.v11-toast .act') && /Annuler/.test(document.querySelector('.v11-toast .act').textContent));
  document.querySelector('.v11-toast .act').click(); ok('⟲ Annuler restaure l\'objet', g.businessObjects.length===n0);
  // catalogue : fiche complète
  openGovTab('catalog'); const i=catRes.findIndex(r=>r.type==='bo'&&r.bo===bo.id); catOpenFiche(i);
  ok('tiroir du catalogue : bouton « Fiche complète »', !!document.querySelector('#uxDrawerFoot .v11-fullbtn'));
  document.querySelector('#uxDrawerFoot .v11-fullbtn').click(); ok('ouvre la fiche en lecture', govState.tab==='objects' && !!F() && !document.querySelector('.v11-editbar'));
  // recherche → attribut : formulaire de l'attribut
  v11GoBo(bo.id, bo.elements[1].id, ''); ok('attribut depuis la recherche : formulaire ouvert sur l\'attribut', document.querySelector('.v11-editbar') && govState.boSel.elId===bo.elements[1].id);
  } catch(e) { R.push(["ERREUR "+e.message+" @ "+String(e.stack).split("\n")[1], false]); }
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
