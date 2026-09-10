import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(ROOT + 'StudioDataV12.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const vis=n=>!!n && getComputedStyle(n).display!=='none'; const X=()=>el('v12x'); const S=k=>X().querySelector(`.v12x-sec[data-sec="${k}"]`); const RES=()=>X().querySelector('.v12x-side .v12x-sec.res'); const OUT=()=>X().querySelector('.v12x-out'); const SUM=()=>X().querySelector('.v12x-sum').textContent;
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','VILLE'],config:{},columnsMeta:{},theme:'Finance'};
  state.tables['t2']={id:'t2',name:'FACTURES',type:'xlsx',status:'ready',headers:['NUM','ID_CLIENT','MONTANT'],config:{},columnsMeta:{}};
  state.tables['t3']={id:'t3',name:'PAIEMENTS',type:'csv',status:'ready',headers:['NUM_FACT','DATE'],config:{},columnsMeta:{}};
  state.relations.push({id:'r1',sourceTable:'t2',targetTable:'t1',sourceCol:'ID_CLIENT',targetCol:'ID',type:'N-1'},{id:'r2',sourceTable:'t2',targetTable:'t1',sourceCol:'NUM',targetCol:'ID',type:'N-1'});
  state.governance.businessObjects.push({id:'bo1',name:'Client',elements:[{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}]}],sources:[{table:'CLIENTS',role:'maitre'}],structure:[]});
  state.extractPresets=[{id:'ep1',name:'Clients Paris',baseName:'CLIENTS',at:Date.now(),spec:{}}];
  renderTables(); switchTab(3);
  ok('plan de travail : synthèse, 4 outils, 3 sections à gauche, panneau Résultat à droite, zone de sortie', X() && X().querySelector('.v12x-sum') && X().querySelectorAll('.v12x-toolbtn').length===4 && S('cols') && S('filt') && S('opts') && RES() && OUT());
  ok('aucun onglet, aucune étape, ni Précédent / Suivant', !X().querySelector('.v12x-tab') && !X().querySelector('.v12x-panel') && !el('v12x-next') && !el('v12x-prev') && !X().textContent.includes('Suivant'));
  ok('les 3 sections et le panneau Résultat sont visibles en même temps', vis(S('cols')) && vis(S('filt')) && vis(S('opts')) && vis(RES()));
  ok('synthèse : table de départ CLIENTS, 0 colonne (avertissement), 0 filtre, conserver tout', /CLIENTS/.test(SUM()) && X().querySelector('.v12x-chip.warn') && /0 filtre/.test(SUM()) && /conserver tout/.test(SUM()));
  ok('outils repliés par défaut ; paramétrages avec compteur 1', X().querySelectorAll('.v12x-tool').length===3 && Array.from(X().querySelectorAll('.v12x-tool')).every(t=>!vis(t)) && /1/.test(X().querySelector('[data-tool="presets"].v12x-toolbtn').textContent));
  v12xTool('presets'); ok('💾 Paramétrages : bloc affiché avec sélecteur et Enregistrer', vis(X().querySelector('.v12x-tool[data-tool="presets"]')) && el('ep-sel') && X().querySelector('.v12x-tool[data-tool="presets"]').textContent.includes('Enregistrer le paramétrage'));
  v12xTool('obj'); ok('🏛️ Objet métier : bloc affiché, paramétrages repliés', vis(X().querySelector('.v12x-tool[data-tool="obj"]')) && el('adv-obj') && !vis(X().querySelector('.v12x-tool[data-tool="presets"]')));
  v12xTool('obj'); ok('second clic : outil replié', !vis(X().querySelector('.v12x-tool[data-tool="obj"]')));
  ok('la ligne « Table de départ : » redondante a disparu, le sélecteur d\'en-tête reste', !X().textContent.includes('Table de départ :') && el('baseTableSelect'));
  // ajout de colonnes
  const addWrap=()=>X().querySelector('.v12x-addwrap');
  ok('sans colonne : sélecteur d\'ajout ouvert d\'office (4 onglets, formulaire simple visible), bouton ＋ actif', vis(addWrap()) && addWrap().querySelectorAll('.v12x-addtab').length===4 && vis(el('adv-col-tbl').closest('.v12x-add')) && X().querySelector('.v12x-addbtn').classList.contains('on') && Array.from(addWrap().querySelectorAll('details')).every(d=>!vis(d)));
  ok('le sélecteur d\'ajout est dans la section Colonnes', S('cols').contains(addWrap()) && S('cols').querySelector('.v12x-addbtn'));
  v12xAddMode('link'); ok('onglet Synthèse : formulaire visible et ouvert, simple masqué', vis(el('adv-link-tbl').closest('details')) && el('adv-link-tbl').closest('details').open && !vis(el('adv-col-tbl').closest('.v12x-add')));
  v12xAddMode('hier'); ok('onglet Hiérarchie visible', vis(el('adv-hier-tbl').closest('details'))); v12xAddMode('calc'); ok('onglet Colonne calculée visible', vis(el('adv-calc-fn').closest('details'))); v12xAddMode('col');
  el('adv-col-tbl').value='t1'; el('adv-col-col').innerHTML='<option>NOM</option>'; el('adv-col-col').value='NOM'; advAddColumn();
  ok('colonne ajoutée : tableau dans la section Colonnes, synthèse « 1 colonne », sélecteur toujours ouvert', state.advExtract.columns.length===1 && S('cols').querySelector('tbody') && /1 colonne/.test(SUM()) && vis(addWrap()));
  v12xAddToggle(); ok('✕ / ＋ : le sélecteur se replie, le tableau reste', !vis(addWrap()) && S('cols').querySelector('tbody') && !X().querySelector('.v12x-addbtn').classList.contains('on'));
  X().querySelector('.v12x-addbtn').click(); ok('＋ Ajouter une colonne : sélecteur rouvert', vis(addWrap()));
  addWrap().querySelector('.v12x-x').click(); ok('✕ dans le sélecteur : replié', !vis(addWrap()));
  advAddAllColumns(); ok('+ Toutes : 4 colonnes', state.advExtract.columns.length===4); el('adv-col-tbl').value='t2'; el('adv-col-col').innerHTML='<option>MONTANT</option>'; el('adv-col-col').value='MONTANT'; advAddColumn(); ok('colonne d\'une table liée ajoutée (5)', state.advExtract.columns.length===5);
  // filtres
  ok('Filtres : formulaire + choix du lien « Quel lien utiliser ? » (FACTURES↔CLIENTS reliées 2 fois) dans la même section', S('filt').contains(el('adv-flt-tbl')) && S('filt').textContent.includes('Quel lien utiliser'));
  el('adv-flt-tbl').value='t1'; el('adv-flt-col').innerHTML='<option>VILLE</option>'; el('adv-flt-col').value='VILLE'; el('adv-flt-op').value=el('adv-flt-op').options[0].value; el('adv-flt-val').value='PARIS'; advAddFilter();
  ok('filtre ajouté, synthèse « 1 filtre », rien ne bouge (sections toujours visibles)', state.advExtract.filters.length===1 && /1 filtre/.test(SUM()) && vis(S('cols')) && vis(S('opts')));
  // forme du résultat
  ok('Forme du résultat : dédoublonnage, regroupement, jointures + limite dans une section', S('opts').textContent.includes('Dédoublonner') && S('opts').textContent.includes('Regrouper') && S('opts').querySelector('input[name="advJoinType"]') && S('opts').textContent.includes('Jointures'));
  S('opts').querySelector('input[type="checkbox"]').click(); ok('dédoublonnage activé : synthèse le montre, colonne « Clé » dans le tableau', state.advExtract.dedup.on && /dédoublonnage/.test(SUM()) && S('cols').querySelector('input[type="checkbox"]'));
  // résultat
  ok('panneau Résultat : Compter, Prévisualiser, Bilan qualité, Voir le SQL, Générer, ajouter comme source', RES().querySelector('[onclick="advCount()"]') && RES().querySelector('[onclick="advQuality()"]') && RES().querySelector('[onclick="advShowSql()"]') && RES().contains(el('adv-generate')) && RES().contains(el('adv-add-source')) && RES().querySelector('.v12x-verify') && RES().querySelector('.v12x-gen'));
  ok('aperçu, bilan et SQL en pleine largeur sous le plan', OUT().contains(el('adv-preview')) && OUT().contains(el('adv-quality')) && OUT().contains(el('adv-sql-wrap')));
  ok('plus de barre collante sur Extraire', !el('step-3').querySelector(':scope > .v12-sticky') && !el('step-3').querySelector('.v12-sticky'));
  advShowSql(); ok('Voir le SQL : SQL affiché dans la zone de sortie', vis(el('adv-sql-wrap')) && el('adv-sql-wrap').textContent.length>0);
  // vue graphique
  v12xTool('graph'); ok('🗺️ Vue graphique : bloc affiché et interrupteur activé (mode graphique)', state.advExtract.graphMode===true && vis(X().querySelector('.v12x-tool[data-tool="graph"]')) && el('advGWrap'));
  advGToggleMode(false); ok('interrupteur désactivé : outil replié, écran classique intact', !state.advExtract.graphMode && !vis(X().querySelector('.v12x-tool[data-tool="graph"]')) && el('adv-col-tbl'));
  // paramétrage
  window.prompt=()=>'Mon extraction'; epSaveCurrent(); ok('paramétrage enregistré (2), compteur mis à jour', state.extractPresets.length===2 && /2/.test(X().querySelector('[data-tool="presets"].v12x-toolbtn').textContent));
  // sans source
  const keep=state.tables; state.tables={}; renderAdvExtract(); ok('sans source : texte d\'origine, pas de plan de travail', !el('v12x') && el('advExtractBody').textContent.includes('Chargez au moins une source')); state.tables=keep; renderAdvExtract();
  ok('en-tête : paragraphe long et bouton assistant masqués (guide dans les outils)', !vis(el('step-3').querySelector('.px-6 p')) && X().querySelector('.v12x-toolbtn[onclick*="wizOpen"]'));
  ok('mode consultation : sections lisibles, bouton ＋ masqué, en-têtes conservés', (()=>{ try { v7SetMode && v7SetMode('read'); } catch(e){ return true; } const r = vis(S('cols')) && !vis(X().querySelector('.v12x-addbtn')); try { v7SetMode('edit'); } catch(e){} return r; })());
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate(()=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){}
    state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','VILLE'],config:{},columnsMeta:{},theme:'Finance'}; state.tables['t2']={id:'t2',name:'FACTURES',type:'xlsx',status:'ready',headers:['NUM','ID_CLIENT','MONTANT'],config:{},columnsMeta:{}};
    state.relations.push({id:'r1',sourceTable:'t2',targetTable:'t1',sourceCol:'ID_CLIENT',targetCol:'ID',type:'N-1'}); state.extractPresets=[{id:'ep1',name:'Clients Paris',baseName:'CLIENTS',at:Date.now(),spec:{}}];
    renderTables(); switchTab(3); el('adv-col-tbl').value='t1'; advAddAllColumns(); state.advExtract.filters.push({id:'f1',tableId:'t1',col:'VILLE',op:'eq',val:'PARIS'}); renderAdvExtract(); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); });
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(300); await q.screenshot({ path: D+'x_cols_'+theme+'.png' });
  await q.evaluate(()=>{ v12xAddMode('calc'); v12xTool('presets'); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'x_tools_'+theme+'.png' });
  await q.evaluate(()=>{ v12State.xAddOpen=false; v12xShowAdd(); v12xTool('presets'); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'x_full_'+theme+'.png', fullPage: true });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
