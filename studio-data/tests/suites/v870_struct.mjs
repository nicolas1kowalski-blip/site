import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8')
  .replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const SEED = `
  window.lucide={createIcons:()=>{}};
  const H=['ID_EMPLACEMENT','ANNEE_FIN_CONSTRUCTION','ANNEE_RENOVATION_BATI','BASE_DE_VIE','CLASSE_IGH','COMMENTAIRE','TEL_1','TEL_2','TEL_3'];
  state.tables['t1']={id:'t1',name:'emplacement.csv',type:'csv',status:'ready',headers:H,config:{},columnsMeta:{}};
  state.tables['t2']={id:'t2',name:'acces.csv',type:'csv',status:'ready',headers:['ID','COMMENTAIRE'],config:{},columnsMeta:{}};
  state.tables['t3']={id:'t3',name:'ADRESSE.csv',type:'csv',status:'ready',headers:['ID','TYPE','ADR_ADRESSE_PRI','CP','VILLE'],config:{},columnsMeta:{}};
  const g=state.governance;
  g.assets=[{id:'a1',kind:'app',name:'GMAO',sources:['emplacement.csv']}];
  g.businessObjects=[{id:'bo1',name:'Emplacement',definition:'Site physique',globalOwner:'Direction immobilière',status:'Validé',
    sources:[{table:'emplacement.csv',role:'maitre'},{table:'ADRESSE.csv',role:'contributeur'}],
    elements:[
      {id:'e1',name:'Année de fin de construction',mappings:[{table:'emplacement.csv',col:'ANNEE_FIN_CONSTRUCTION'}],usedBy:['a1']},
      {id:'e2',name:'Année de rénovation du bâti',mappings:[{table:'emplacement.csv',col:'ANNEE_RENOVATION_BATI'}]},
      {id:'e3',name:'Base de vie',mappings:[{table:'emplacement.csv',col:'BASE_DE_VIE'}],multi:'1'},
      {id:'e4',name:'Classe IGH',mappings:[]},
      {id:'e5',name:'Commentaire',mappings:[{table:'emplacement.csv',col:'COMMENTAIRE'},{table:'acces.csv',col:'COMMENTAIRE'}]},
    ],
    structure:[{id:'st1',name:'Adresse principale',table:'ADRESSE.csv',cardinality:'1–1',scope:[{col:'TYPE',op:'eq',val:'PRINCIPALE'}],elements:[{id:'f1',name:'Adresse',col:'ADR_ADRESSE_PRI'},{id:'f2',name:'Code postal',col:'CP',multi:'1'}]}]}];
  switchPhase('gov'); openGovTab('objects'); govState.selectedBoId='bo1'; govState.structView='table'; setBoTab('structure');
`;
// ---- tests ----
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'});
await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async (SEED)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  eval(SEED);
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  const tbls=document.querySelectorAll('#step-9 table.bo-attr-tbl');
  ok('deux tableaux à largeurs fixes (cœur + facette)', tbls.length===2 && Array.from(tbls).every(t=>getComputedStyle(t).tableLayout==='fixed'));
  const core=tbls[0];
  const nameInputs=core.querySelectorAll('tbody tr:not(.bo-map-row) td:nth-child(2) input');
  ok('5 attributs du cœur', nameInputs.length===5);
  const w=nameInputs[0].getBoundingClientRect().width;
  ok('colonne « Nom métier » ≥ 200 px (plus de nom rogné)', w>=200);
  ok('liste des objets : au-dessus de la fiche sous 1536 px (cartes en ligne)', getComputedStyle(document.getElementById('boListCol')).display==='flex' && document.getElementById('boListCol').nextElementSibling.classList.contains('flex-1'));
  // le nom entier est visible : scrollWidth == clientWidth
  ok('nom long (≤ 26 caractères) entièrement visible', Array.from(nameInputs).filter(i=>i.value.length<=26).every(i=>i.scrollWidth<=i.clientWidth+1));
  const rows=core.querySelectorAll('tbody tr:not(.bo-map-row)');
  const rowH=rows[0].getBoundingClientRect().height;
  ok('ligne alimentée par une colonne longue : < 100 px (pastille + « + colonne » sur 2 lignes)', rowH<100);
  ok('ligne « Base de vie » (colonne courte) : une seule ligne (< 60 px)', rows[2].getBoundingClientRect().height<60);
  ok('sous-ligne de sélection sur toute la largeur (colspan 7)', document.getElementById('bo-map-e4').querySelector('td').getAttribute('colspan')==='7');
  ok('pas de défilement horizontal du tableau à 1400 px', core.getBoundingClientRect().width<=core.parentElement.clientWidth+1);
  ok('sélecteur table▸colonne masqué par défaut si alimenté', document.getElementById('bo-map-e1').classList.contains('hidden'));
  ok('sélecteur ouvert d\'office + alerte si non alimenté', !document.getElementById('bo-map-e4').classList.contains('hidden') && rows[3].textContent.includes('non alimenté'));
  ok('sélecteur pré-positionné sur la table maître', document.getElementById('bo-tbl-e4').value==='emplacement.csv' && document.getElementById('bo-col-e4').options.length===9);
  ok('pastille : colonne en évidence, table en retrait', rows[0].querySelector('.bo-map-chip .co').textContent==='ANNEE_FIN_CONSTRUCTION' && rows[0].querySelector('.bo-map-chip .tb').textContent==='emplacement.csv');
  ok('deux pastilles pour l\'attribut multi-sources', rows[4].querySelectorAll('.bo-map-chip').length===2);
  // + colonne : bascule et ajout
  boMapPickToggle('e1');
  ok('« + colonne » ouvre le sélecteur et marque le bouton', !document.getElementById('bo-map-e1').classList.contains('hidden') && document.getElementById('bo-map-btn-e1').classList.contains('on'));
  document.getElementById('bo-tbl-e1').value='acces.csv'; populateBoMapCols('e1','acces.csv'); document.getElementById('bo-col-e1').value='COMMENTAIRE';
  addBoMapping('bo1','e1');
  ok('ajout d\'une colonne via le sélecteur', state.governance.businessObjects[0].elements[0].mappings.length===2);
  removeBoMapping('bo1','e1',1);
  ok('retrait via ✕ de la pastille', state.governance.businessObjects[0].elements[0].mappings.length===1);
  // ordre
  const core2=()=>document.querySelectorAll('#step-9 table.bo-attr-tbl')[0];
  ok('boutons ⤒▲▼⤓ présents sur une seule ligne', core2().querySelector('tbody tr:not(.bo-map-row) .bo-handle').querySelectorAll('button').length===4 && core2().querySelector('tbody tr:not(.bo-map-row) .bo-handle').getBoundingClientRect().height<30);
  boMoveEl('bo1','e2','top');
  ok('⤒ fonctionne', state.governance.businessObjects[0].elements[0].id==='e2');
  boMoveEl('bo1','e2','bottom');
  ok('⤓ fonctionne', state.governance.businessObjects[0].elements[4].id==='e2');
  boMoveEl('bo1','e2','up'); boMoveEl('bo1','e2','up'); boMoveEl('bo1','e2','up');
  ok('▲ fonctionne', state.governance.businessObjects[0].elements[1].id==='e2');
  // propriétaire : placeholder explicite
  const own=core2().querySelector('tbody tr:not(.bo-map-row) td:nth-child(4) input');
  ok('propriétaire : placeholder « = Direction immobilière »', own.placeholder==='= Direction immobilière');
  // nb de valeurs : un seul select + mention observé
  const mcell=core2().querySelector('tbody tr:not(.bo-map-row) td:nth-child(5)');
  ok('Nb de valeurs : un seul sélecteur, sans mention parasite quand monovalué', mcell.querySelectorAll('select').length===1 && !/observé/.test(mcell.textContent));
  const declared=Array.from(core2().querySelectorAll('tbody tr:not(.bo-map-row)')).find(r=>r.querySelector('input').value==='Base de vie').querySelector('td:nth-child(5)');
  ok('déclaré « 1 valeur » : pas de mention observé', declared.querySelector('select').value==='1' && !/observé/.test(declared.textContent));
  boSetMulti('bo1','','e3','n');
  ok('déclaration multiplicité conservée', state.governance.businessObjects[0].elements.find(e=>e.id==='e3').multi==='n');
  // usage + suppression
  ok('badge usage 🔌 présent', core2().querySelector('tbody tr:not(.bo-map-row) td:nth-child(6) button')!==null);
  // facette
  const fac=document.querySelectorAll('#step-9 table.bo-attr-tbl')[1];
  ok('facette : nom + pastille table + select colonne', fac.querySelectorAll('tbody tr').length===2 && fac.querySelector('tbody tr .bo-map-chip .tb').textContent==='ADRESSE.csv' && fac.querySelector('tbody tr select').value==='ADR_ADRESSE_PRI');
  const fname=fac.querySelector('tbody tr td:nth-child(1) input');
  ok('facette : nom métier ≥ 200 px', fname.getBoundingClientRect().width>=200);
  updateFacetElement('bo1','st1','f1','col','VILLE');
  ok('facette : changement de colonne pris en compte', state.governance.businessObjects[0].structure[0].elements[0].col==='VILLE');
  // pas de texte 10 px gris clair dans l'intro
  const intro=document.querySelector('#step-9 .border-indigo-100 p');
  ok('intro lisible (≥ 11 px)', intro && parseFloat(getComputedStyle(intro).fontSize)>=11);
  // renommage
  updateBoElement('bo1','e1','name','Année fin de construction');
  ok('renommage conservé', state.governance.businessObjects[0].elements.find(e=>e.id==='e1').name==='Année fin de construction');
  removeBoElement('bo1','e4');
  ok('suppression ✕ conservée', !state.governance.businessObjects[0].elements.some(e=>e.id==='e4'));
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await p.close();
// ---- captures ----
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1400, height: 900 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'});
  await q.addStyleTag({ path: D+'tw/tw_built.css' });
  await q.evaluate((SEED)=>{ eval(SEED); }, SEED);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(300);
  await q.evaluate(()=>{ const t=document.querySelector('#step-9 .border-indigo-100'); if(t) t.scrollIntoView({block:'start'}); });
  await q.waitForTimeout(200);
  await q.screenshot({ path: D+'struct_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
