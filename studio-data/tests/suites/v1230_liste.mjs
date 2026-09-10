import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV12.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const vis=n=>!!n && getComputedStyle(n).display!=='none'; const X=()=>el('v12x'); const S=k=>X().querySelector(`.v12x-sec[data-sec="${k}"]`); const M=()=>el('v11Modal');
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','VILLE'],config:{},columnsMeta:{},theme:'Finance'};
  state.tables['t2']={id:'t2',name:'FACTURES',type:'xlsx',status:'ready',headers:['NUM','ID_CLIENT','MONTANT','ANNEE'],config:{},columnsMeta:{}};
  state.relations.push({id:'r1',sourceTable:'t2',targetTable:'t1',sourceCol:'ID_CLIENT',targetCol:'ID',type:'N-1'});
  renderTables(); switchTab(3);
  ok('en-tête Filtres : bouton « Filtrer sur un fichier » ; astuce quand aucun filtre', S('filt').querySelector('.v12l-btn') && S('filt').querySelector('.v12l-tip'));
  // analyse de texte
  const a1=v12ListParseText('ID;VILLE\n"1";Paris\n2;"Ly;on"\n'); ok('texte « ; » avec guillemets : 3 lignes × 2 colonnes, « Ly;on » conservé', a1.length===3 && a1[0].join('|')==='ID|VILLE' && a1[2][1]==='Ly;on');
  const a2=v12ListParseText('a\tb\n1\t2'); ok('tabulation détectée', a2[1].join('|')==='1|2');
  const a3=v12ListParseText('﻿1001\n1002\n1003'); ok('une valeur par ligne, BOM ignoré', a3.length===3 && a3[0][0]==='1001');
  const sh=v12ListShape([['ID','VILLE'],['1','Paris'],['2','']],true); ok('mise en forme avec en-têtes : colonnes ID/VILLE, 2 lignes', sh.cols.join('|')==='ID|VILLE' && sh.rows.length===2 && sh.rows[1][1]==='');
  const sh2=v12ListShape([['1'],['2']],false); ok('sans en-tête : « colonne 1 », 2 lignes', sh2.cols[0]==='colonne 1' && sh2.rows.length===2);
  // fenêtre
  S('filt').querySelector('.v12l-btn').click(); ok('fenêtre ouverte : zone de dépôt, texte à coller, case en-têtes', M() && el('v12lDrop') && el('v12lPaste') && el('v12lHeader'));
  el('v12lPaste').value='ID;VILLE;Commentaire\n1;Paris;VIP\n2;Lyon;\n3;Nice;relance'; v12ListPasteChanged();
  const d=()=>v12State.listDraft;
  ok('liste collée : 3 lignes, 3 colonnes ; ID et VILLE rattachés d\'office à CLIENTS, Commentaire ignoré', d().rows.length===3 && d().cols.length===3 && d().keys.length===2 && d().keys.every(k=>k.tableId==='t1') && !d().keys.some(k=>k.lc==='Commentaire'));
  ok('tableau de correspondance affiché avec sélecteurs et aperçu', el('v12lBody').querySelectorAll('.v12l-sel').length===3 && /Paris/.test(el('v12lBody').textContent) && /2 colonne\(s\) clé/.test(el('v12lBody').textContent));
  v12ListSetKey('VILLE',''); ok('VILLE passée en « ignorer » : 1 clé', d().keys.length===1 && d().keys[0].col==='ID');
  ok('options : correspondance (3), garder / exclure, ordre + colonnes jointes', M().querySelectorAll('input[name="v12lMatch"]').length===3 && M().querySelectorAll('input[name="v12lMode"]').length===2);
  v12ListConfirm();
  const F=()=>state.advExtract.filters.find(f=>f.op==='list');
  ok('filtre liste créé : op list, table CLIENTS.ID, 3 lignes ; fenêtre fermée', F() && F().tableId==='t1' && F().col==='ID' && F().list.rows.length===3 && !M());
  ok('pastille détaillée : nom, 3 ligne(s), CLIENTS.ID ← ID, Modifier / Vérifier / ✕ ; astuce disparue ; pastille de synthèse', S('filt').querySelector('.v12l-chip') && /Liste collée/.test(S('filt').querySelector('.v12l-chip').textContent) && /3 ligne/.test(S('filt').querySelector('.v12l-chip').textContent) && /CLIENTS\.ID ← ID/.test(S('filt').querySelector('.v12l-chip').textContent) && S('filt').querySelector('.v12l-chip .v12l-acts').children.length===3 && !S('filt').querySelector('.v12l-tip') && X().querySelector('.v12l-sumchip'));
  // SQL
  el('adv-col-tbl').value='t1'; advAddAllColumns();
  let r=buildAdvSql(state.advExtract);
  ok('SQL : EXISTS sur la table temporaire de la liste, correspondance insensible à la casse', !r.err && /EXISTS \(SELECT 1 FROM "liste_liste_collee_\w+" l WHERE UPPER\(TRIM\(CAST\(x0\."ID" AS VARCHAR\)\)\) = UPPER\(TRIM\(CAST\(l\."ID" AS VARCHAR\)\)\)\)/.test(r.sql) && !/NOT EXISTS/.test(r.sql));
  F().list.match='exact'; r=buildAdvSql(state.advExtract); ok('correspondance exacte : TRIM seul', /TRIM\(CAST\(x0\."ID" AS VARCHAR\)\) = TRIM\(CAST\(l\."ID"/.test(r.sql));
  F().list.match='norm'; r=buildAdvSql(state.advExtract); ok('correspondance normalisée : strip_accents + zéros de tête', /strip_accents/.test(r.sql) && /\^0\+/.test(r.sql));
  F().list.match='ci'; F().list.mode='out'; r=buildAdvSql(state.advExtract); ok('exclure : NOT EXISTS', /NOT EXISTS/.test(r.sql)); F().list.mode='in';
  // ordre + colonnes jointes
  F().list.attach=true; r=buildAdvSql(state.advExtract);
  ok('ordre du fichier + colonnes jointes : LEFT JOIN, ORDER BY l.__ln, VILLE renommée liste_VILLE (déjà en sortie), Commentaire ajouté', !r.err && /LEFT JOIN \(SELECT \* FROM "liste_/.test(r.sql) && /ORDER BY l\.__ln/.test(r.sql) && /l\."Commentaire" AS "Commentaire"/.test(r.sql) && /l\."VILLE" AS "liste_VILLE"/.test(r.sql) && r.outCols.some(o=>o.alias==='Commentaire'));
  const idCol=state.advExtract.columns.find(c=>c.col==='ID'); advRemoveColumn(idCol.id); r=buildAdvSql(state.advExtract);
  ok('clé retirée des colonnes : message clair', r.err && /CLIENTS\.ID/.test(r.err) && /colonnes en sortie/.test(r.err));
  F().list.attach=false;
  // plusieurs colonnes sur deux tables
  F().list.cols=['ID','ANNEE']; F().list.rows=[['1','2024'],['2','2023']]; F().list.keys=[{lc:'ID',tableId:'t1',col:'ID',via:''},{lc:'ANNEE',tableId:'t2',col:'ANNEE',via:''}];
  r=buildAdvSql(state.advExtract);
  ok('deux colonnes clés sur CLIENTS et FACTURES : FACTURES jointe, condition sur x0.ID ET x1.ANNEE', !r.err && /LEFT JOIN "[^"]*" x1 ON/.test(r.sql) && /CAST\(x0\."ID"/.test(r.sql) && /CAST\(x1\."ANNEE" AS VARCHAR\)\)\) = UPPER\(TRIM\(CAST\(l\."ANNEE"/.test(r.sql) && / AND /.test(r.sql.split('EXISTS')[1]));
  // ordre + colonnes jointes en multi-clés : la clé FACTURES.ANNEE doit être en sortie
  F().list.attach=true; r=buildAdvSql(state.advExtract); ok('multi-clés + ordre : erreur tant que FACTURES.ANNEE et CLIENTS.ID manquent en sortie', r.err && /FACTURES\.ANNEE/.test(r.err));
  state.advExtract.columns.push({id:'ac_x1',tableId:'t1',col:'ID',via:'',alias:'ID',transform:'none'},{id:'ac_x2',tableId:'t2',col:'ANNEE',via:'',alias:'ANNEE',transform:'none'}); r=buildAdvSql(state.advExtract);
  ok('clés ajoutées : jointure sur les deux colonnes de sortie', !r.err && /UPPER\(TRIM\(CAST\(q\."ID" AS VARCHAR\)\)\) = UPPER\(TRIM\(CAST\(l\."ID"/.test(r.sql) && /q\."ANNEE"/.test(r.sql));
  F().list.attach=false;
  // ajout par la fenêtre avec « ordre » coché : clés ajoutées automatiquement en colonnes
  state.advExtract.columns=[]; state.advExtract.filters=[];
  v12ListOpen(); el('v12lPaste').value='NUM\nF-1\nF-2'; v12ListPasteChanged(); ok('NUM reconnu sur la table reliée FACTURES', d().keys.length===1 && d().keys[0].tableId==='t2'); v12ListSetOpt('attach',true); v12ListConfirm();
  ok('confirmation avec « ordre » : FACTURES.NUM ajoutée en colonne de sortie', state.advExtract.columns.some(c=>c.tableId==='t2' && c.col==='NUM') && F() && F().list.attach);
  // modifier
  v12ListOpen(F().id); ok('Modifier : fenêtre pré-remplie avec la liste existante (2 lignes)', M() && d() && d().rows.length===2 && /Mettre à jour/.test(el('v12lBody').textContent)); v11ModalClose();
  // paramétrage : enregistrer / recharger (les tables sont stockées par nom puis remappées)
  window.prompt=()=>'Avec liste'; epSaveCurrent(); const ep=state.extractPresets.find(x=>x.name==='Avec liste');
  ok('paramétrage enregistré avec la liste (tables par nom)', ep && ep.config.filters[0].op==='list' && ep.config.filters[0].list.keys[0].tableId==='FACTURES');
  state.advExtract.filters=[]; renderAdvExtract(); epLoad(ep.id);
  ok('paramétrage rechargé : filtre liste restauré, table remappée, pastille affichée', F() && F().list.keys[0].tableId==='t2' && F().list.rows.length===2 && S('filt').querySelector('.v12l-chip'));
  // moteur indisponible : les actions ne plantent pas
  let threw=false; try { await advCount(); } catch(e){ threw=true; } ok('Compter sans moteur : message d\'erreur, pas d\'exception', !threw);
  // vue graphique avec un filtre liste
  threw=false; try { advGToggleMode(true); advGToggleMode(false); } catch(e){ threw=true; } ok('vue graphique avec un filtre liste : pas d\'exception', !threw && el('adv-col-tbl'));
  // retirer
  S('filt').querySelector('.v12l-chip .v12l-acts button[onclick^="advRemoveFilter"]').click(); ok('✕ : filtre retiré, astuce de retour', !F() && S('filt').querySelector('.v12l-tip'));
  ok('lexique : liste d\'entrée', !!V11_LEXIQUE['liste d\'entrée']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate(()=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){}
    state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','VILLE'],config:{},columnsMeta:{},theme:'Finance'}; state.tables['t2']={id:'t2',name:'FACTURES',type:'xlsx',status:'ready',headers:['NUM','ID_CLIENT','MONTANT','ANNEE'],config:{},columnsMeta:{}};
    state.relations.push({id:'r1',sourceTable:'t2',targetTable:'t1',sourceCol:'ID_CLIENT',targetCol:'ID',type:'N-1'});
    renderTables(); switchTab(3); el('adv-col-tbl').value='t1'; advAddAllColumns(); v12State.xAddOpen=false; v12xShowAdd(); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); });
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.evaluate(()=>{ v12ListOpen(); el('v12lPaste').value='ID;ANNEE;Commentaire\n1042;2024;VIP\n1057;2024;\n1103;2023;relance\n1200;2024;'; v12ListPasteChanged(); v12ListSetKey('ANNEE','t2|ANNEE'); });
  await q.waitForTimeout(300); await q.screenshot({ path: D+'l_modal_'+theme+'.png' });
  await q.evaluate(()=>{ v12ListSetOpt('attach',true); v12ListConfirm(); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); advShowSql(); });
  await q.waitForTimeout(300); await q.screenshot({ path: D+'l_plan_'+theme+'.png', fullPage: true });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
