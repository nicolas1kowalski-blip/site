import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8')
  .replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const SEED = fs.readFileSync(D+'v870_struct.mjs','utf8').split('const SEED = `')[1].split('`;')[0]
  .replace("govState.structView='table'; ","govState.structView='fiche'; ").replace("g.assets=[{id:'a1',kind:'app',name:'GMAO',sources:['emplacement.csv']}];","g.assets=[{id:'a1',kind:'app',name:'GMAO',sources:['emplacement.csv']},{id:'p1',kind:'process',name:'Maintenance'}]; g.glossary=[{id:'gl1',term:'Bâtiment',definition:'x'}];");
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'});
await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async (SEED)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  window.prompt=()=>'';
  eval(SEED);
  const bo=()=>state.governance.businessObjects[0];
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  const S=()=>document.getElementById('step-9');
  // ---- carte d'identité + complétude ----
  ok('définition en textarea + propriétaire + statut avec ids', document.getElementById('bo-def-bo1').tagName==='TEXTAREA' && document.getElementById('bo-own-bo1') && document.getElementById('bo-status-bo1'));
  const c=boCompleteness(bo());
  ok('score de complétude calculé (0..100) et affiché', c.score>0 && c.score<100 && S().textContent.includes('Fiche complète à') && S().textContent.includes(c.score+' %'));
  ok('manques listés en boutons : non alimenté, sans définition, sans usage', S().innerHTML.includes("boGoFilter('nomap')") && S().innerHTML.includes("boGoFilter('nodef')") && S().innerHTML.includes("boGoFilter('nouse')"));
  ok('critères satisfaits non listés (définition, propriétaire, source maître, validé)', !c.todos.some(t=>/^Écrire la définition|propriétaire|source maître|valider/.test(t.lbl)));
  // ---- espace maître-détail ----
  ok('onglet renommé « Attributs & composition »', S().textContent.includes('Attributs & composition'));
  const list=document.getElementById('boList'); const detEl=()=>document.getElementById('boDetail'); const det=new Proxy({}, {get:(_,k)=>{ const d=detEl(); const v=d[k]; return typeof v==='function'? v.bind(d): v; }});
  ok('liste + détail rendus', list && det);
  const items=()=>Array.from(document.querySelectorAll('#boList .bo-item'));
  ok('7 lignes (5 propres + 2 de facette), facette en sous-niveau', items().length===7 && items().filter(i=>i.classList.contains('sub')).length===2);
  ok('groupe facette cliquable + entrée « Objets référencés »', document.querySelector('#boList .bo-lhead.fac') && list.textContent.includes('Objets référencés'));
  ok('premier attribut sélectionné par défaut, formulaire = son nom', items()[0].classList.contains('on') && document.getElementById('boF-name').value==='Année de fin de construction');
  ok('provenance et voyants sur la ligne', items()[0].querySelector('.prov').textContent==='emplacement.csv.ANNEE_FIN_CONSTRUCTION' && items()[0].querySelectorAll('.bo-dot').length===3);
  ok('attribut non alimenté signalé dans la liste', items().some(i=>i.textContent.includes('non alimenté')));
  // formulaire : sections
  const T=det.textContent;
  ok('formulaire : Identité / Sens métier / Provenance / Usages', /Identité/.test(T) && /Sens métier/.test(T) && /Provenance/.test(T) && /Usages/.test(T));
  ok('formulaire : définition, exemples + échantillonner, sensibilité, terme', det.querySelector('textarea') && /Échantillonner/.test(T) && det.innerHTML.includes("'sensitivity'") && det.querySelector('.term-tags input.term-add')!==null && det.innerHTML.includes('Bâtiment'));
  ok('formulaire : usages en cases à cocher (GMAO cochée, Maintenance non)', det.querySelectorAll('.bo-use').length===2 && det.querySelector('.bo-use.on').textContent.includes('GMAO'));
  ok('formulaire : boutons ordre, lineage, suppression', det.querySelectorAll('.bo-handle button').length===4 && /Lineage/.test(T) && det.innerHTML.includes('removeBoElement'));
  // écriture via le formulaire
  boAttrWriteR('bo1','','e1','definition','Année de livraison du bâtiment',true);
  ok('définition écrite sur l\'attribut + voyant « défini » allumé', bo().elements[0].definition==='Année de livraison du bâtiment' && items()[0].querySelectorAll('.bo-dot')[1].classList.contains('ok'));
  boAttrWriteR('bo1','','e1','sensitivity','Interne',false); boAttrWriteR('bo1','','e1','term','gl1',false);
  ok('sensibilité + terme écrits', bo().elements[0].sensitivity==='Interne' && bo().elements[0].term==='gl1');
  boAttrWriteR('bo1','','e1','name','Année de livraison',true);
  ok('renommage répercuté dans la liste et l\'en-tête', items()[0].textContent.includes('Année de livraison') && document.querySelector('#boDetail h3').textContent==='Année de livraison');
  // sélection d'un autre attribut + clavier
  boSelect('attr','','e4');
  ok('sélection « Classe IGH » : formulaire avec sélecteur de colonne ouvert (non alimenté)', document.getElementById('boF-name').value==='Classe IGH' && document.getElementById('bo-tbl-e4') && det.textContent.includes('non alimenté'));
  document.getElementById('bo-col-e4').value='CLASSE_IGH'; addBoMapping('bo1','e4');
  ok('ajout de colonne depuis le formulaire, sélection conservée', bo().elements[3].mappings.length===1 && document.getElementById('boF-name').value==='Classe IGH' && items()[3].querySelector('.bo-dot').classList.contains('ok'));
  document.getElementById('boList').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  ok('↓ passe à l\'attribut suivant', document.getElementById('boF-name').value==='Commentaire');
  document.getElementById('boList').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
  ok('↑ revient', document.getElementById('boF-name').value==='Classe IGH');
  // usages via cases
  boElToggleUsedBy('bo1','e4','p1',true);
  ok('usage coché → écrit + voyant', bo().elements[3].usedBy.includes('p1') && document.querySelectorAll('#boDetail .bo-use.on').length===1);
  // filtres
  boSetFilter('nodef');
  ok('filtre « Sans définition » : l\'attribut défini disparaît', !items().some(i=>i.textContent.includes('Année de livraison')) && items().length===6);
  boSetQ('base');
  ok('recherche + filtre combinés', items().length===1 && items()[0].textContent.includes('Base de vie'));
  boSetQ(''); boSetFilter('all');
  ok('retour à tous', items().length===7);
  // bouton de complétude → filtre
  boGoFilter('nouse');
  ok('« sans usage » depuis la complétude : filtre appliqué, onglet structure', govState.boFilter==='nouse' && govState.boTab==='structure' && document.querySelector('#step-9 .bo-filt button.on').textContent.includes('Sans usage'));
  boSetFilter('all');
  // facette
  boSelect('facet','st1','');
  ok('fiche facette : nom, cardinalité, table, filtre, applicabilité, attributs', document.querySelector('#boDetail h3').textContent==='Adresse principale' && det.innerHTML.includes("'cardinality'") && det.textContent.includes('Filtre fonctionnel') && det.textContent.includes("S'applique uniquement si") && det.textContent.includes('Code postal'));
  updateBoFacet('bo1','st1','cardinality','1–N');
  ok('cardinalité modifiée', bo().structure[0].cardinality==='1–N');
  boSelect('attr','st1','f1');
  ok('attribut de facette : sélecteur de colonne de la table de la facette', det.querySelector('select[aria-label="Colonne technique"]') && det.querySelector('select[aria-label="Colonne technique"]').value==='ADR_ADRESSE_PRI');
  boAttrWriteR('bo1','st1','f1','col','VILLE',true);
  ok('changement de colonne d\'un attribut de facette', bo().structure[0].elements[0].col==='VILLE');
  // références
  state.governance.businessObjects.push({id:'bo2',name:'Site',elements:[],sources:[],structure:[]});
  boSelect('refs','','');
  ok('fiche références : sélecteur d\'objet cible', document.getElementById('bo-ref-tgt-bo1') && det.textContent.includes('Objets référencés'));
  addBoReference('bo1');
  ok('référence ajoutée', (bo().references||[]).length===1);
  // nouvelle facette
  boSelect('newfacet');
  ok('formulaire « nouvelle facette »', document.getElementById('bo-comp-name-bo1') && det.textContent.includes('Nouveau composant'));
  document.getElementById('bo-comp-name-bo1').value='Contact'; document.getElementById('bo-comp-tbl-bo1').value='acces.csv';
  boAddFacetAndSelect('bo1');
  ok('facette créée et sélectionnée', getBoFacets(bo()).length===2 && govState.boSel.kind==='facet' && document.querySelector('#boDetail h3').textContent==='Contact');
  // + Attribut
  boAddAttrAndSelect('bo1');
  ok('+ Attribut : créé, sélectionné, formulaire ouvert sur le nom', bo().elements.length===6 && document.getElementById('boF-name').value==='Nouvel attribut');
  removeBoElement('bo1', bo().elements[5].id);
  // vue tableau conservée
  boSetStructView('table');
  ok('vue Tableau : ancien tableau + facettes + références', document.querySelectorAll('#step-9 table.bo-attr-tbl').length>=2 && S().textContent.includes('Objets référencés') && S().innerHTML.includes('reorderDragStart'));
  boSetStructView('fiche');
  ok('retour vue Fiche', document.getElementById('boList')!==null);
  // lineage inline depuis le formulaire
  boSelect('attr','','e1'); openAttrLineage('bo1','','e1');
  ok('lineage de l\'attribut affiché sous l\'espace', document.querySelector('#attrLineageBox svg')!==null);
  // statut via en-tête
  wfSetBoStatus('bo1','Proposé');
  ok('statut modifié depuis la carte d\'identité, score recalculé', bo().status==='Proposé' && boCompleteness(bo()).todos.some(t=>/valider/.test(t.lbl)));
  // consultation : liste, filtres restent actifs
  govSetReadOnly(true);
  ok('consultation : filtre et liste conservés (data-ro=keep)', document.querySelector('#step-9 .bo-filt button').getAttribute('data-ro')==='keep' && document.getElementById('boQ').getAttribute('data-ro')==='keep');
  govSetReadOnly(false);
  // autres onglets intacts
  ['sources','hierarchies','mastery','usage','audit'].forEach(t=>{ setBoTab(t); ok('onglet « '+t+' » toujours rendu', S().innerHTML.length>2000 && govState.boTab===t); });
  setBoTab('structure');
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await p.close();
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1920, height: 1000 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' });
  await q.evaluate((SEED)=>{ eval(SEED); }, SEED);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(300);
  await q.evaluate(()=>{ const t=document.querySelector('#step-9 .border-2.border-emerald-200'); if(t) t.scrollIntoView({block:'start'}); });
  await q.waitForTimeout(200);
  await q.screenshot({ path: D+'fiche_'+theme+'.png' });
  await q.evaluate(()=>{ boSelect('facet','st1',''); const t=document.getElementById('boList'); if(t) t.scrollIntoView({block:'start'}); });
  await q.waitForTimeout(200);
  await q.screenshot({ path: D+'fiche_facet_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
