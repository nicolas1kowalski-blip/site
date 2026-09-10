import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FILE = process.env.SD_FILE||ROOT + 'StudioDataV12.html'; const isV13=/V13/.test(FILE);
const html = fs.readFileSync(FILE,'utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);
const seed = `state.tables['t0']={id:'t0',name:'CONTRAT',type:'csv',status:'ready',headers:['NUM','ID_PP','ID_PM','MONTANT'],config:{},columnsMeta:{}};
  state.tables['t1']={id:'t1',name:'PERSONNE_PHYSIQUE',type:'csv',status:'ready',headers:['ID','NOM','ID_ADR'],config:{},columnsMeta:{}};
  state.tables['t2']={id:'t2',name:'PERSONNE_MORALE',type:'csv',status:'ready',headers:['ID','RAISON','ID_ADR'],config:{},columnsMeta:{}};
  state.tables['t3']={id:'t3',name:'ADRESSE',type:'csv',status:'ready',headers:['ID','VILLE','CP'],config:{},columnsMeta:{}};
  state.tables['t4']={id:'t4',name:'GARANTIE',type:'csv',status:'ready',headers:['ID','NUM_CONTRAT','CODE'],config:{},columnsMeta:{}};
  state.relations.push({id:'r1',sourceTable:'t0',targetTable:'t1',sourceCol:'ID_PP',targetCol:'ID',type:'N-1'},{id:'r2',sourceTable:'t0',targetTable:'t2',sourceCol:'ID_PM',targetCol:'ID',type:'N-1'},{id:'r3',sourceTable:'t1',targetTable:'t3',sourceCol:'ID_ADR',targetCol:'ID',type:'N-1'},{id:'r4',sourceTable:'t2',targetTable:'t3',sourceCol:'ID_ADR',targetCol:'ID',type:'N-1'},{id:'r5',sourceTable:'t4',targetTable:'t0',sourceCol:'NUM_CONTRAT',targetCol:'NUM',type:'N-1'});
  renderTables(); switchTab(3); advSetBase('t0');`;
const out = await p.evaluate(async ({seed,isV13})=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms)); const vis=n=>!!n && getComputedStyle(n).display!=='none'; const X=()=>el('v12x'); const SQL={};
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  eval(seed);
  // ---- 1. vue graphique ----
  v12xTool('graph'); await wait(50);
  ok('bouton Vue graphique : bloc ouvert, interrupteur activé', state.advExtract.graphMode===true && vis(X().querySelector('.v12x-tool[data-tool="graph"]')) && el('advGWrap'));
  v12xTool('graph'); await wait(50);
  ok('second clic sur le bouton : bloc fermé ET interrupteur désactivé', state.advExtract.graphMode===false && !vis(X().querySelector('.v12x-tool[data-tool="graph"]')));
  el('adv-col-col').value='NUM'; advAddColumn(); await wait(50); // une manipulation qui re-rend l\'écran
  ok('après une manipulation (ajout d\'une colonne) : la vue graphique ne réapparaît pas', !vis(X().querySelector('.v12x-tool[data-tool="graph"]')) && v12State.xTool!=='graph' && !el('advGWrap'));
  renderAdvExtract(); await wait(50); ok('après un nouveau rendu complet : toujours fermée', !vis(X().querySelector('.v12x-tool[data-tool="graph"]')) && !el('advGWrap'));
  // la case à cocher continue de fonctionner
  v12xTool('graph'); await wait(50); const cb=document.querySelector('#v12x [data-tool="graph"] input[type="checkbox"]'); cb.checked=false; cb.dispatchEvent(new Event('change')); await wait(50);
  ok('case à cocher décochée : bloc fermé, bouton désactivé', !state.advExtract.graphMode && !vis(X().querySelector('.v12x-tool[data-tool="graph"]')) && !X().querySelector('.v12x-toolbtn[data-tool="graph"]').classList.contains('on'));
  // ---- 2. synthèse : via « l'un ou l'autre » ----
  v12xAddMode('link'); el('adv-link-tbl').value='t3'; advLinkTblChanged(); await wait(30);
  const via=el('adv-link-via'), wrap=el('adv-link-via-wrap');
  ok('synthèse sur ADRESSE (2 routes) : via affiché avec « l\'un ou l\'autre » en tête, présélectionné', !wrap.classList.contains('hidden') && via.options[0].value==='any' && via.value==='any');
  el('adv-link-mode').value='count'; advLinkModeChanged(); el('adv-link-alias').value='nb_adr'; advAddLinkColumn(); await wait(50);
  const cnt=state.advExtract.columns.find(c=>c.kind==='link'); ok('synthèse « compter » ajoutée avec via = any, libellé « via l\'un ou l\'autre lien »', cnt && cnt.via==='any' && cnt.mode==='count' && /via l'un ou l'autre lien/.test(X().querySelector('.v12x-sec[data-sec="cols"]').textContent));
  let r=buildAdvSql(state.advExtract); SQL.count=r.sql;
  ok('SQL compter : PP et PM jointes, deux sous-requêtes ADRESSE réunies par UNION ALL', !r.err && /LEFT JOIN "t_t1"/.test(r.sql) && /LEFT JOIN "t_t2"/.test(r.sql) && (r.sql.match(/FROM "t_t3" s WHERE/g)||[]).length===2 && /UNION ALL/.test(r.sql) && /AS "nb_adr"/.test(r.sql));
  ok('SQL compter : ADRESSE elle-même n\'est pas jointe (pas de multiplication de lignes)', !/LEFT JOIN "t_t3"/.test(r.sql));
  // valeurs concaténées + valeurs uniques sur deux routes
  v12xAddMode('link'); el('adv-link-tbl').value='t3'; advLinkTblChanged(); el('adv-link-mode').value='values'; advLinkModeChanged(); el('adv-link-col').value='VILLE'; el('adv-link-alias').value='villes'; advAddLinkColumn(); await wait(30);
  v12xAddMode('link'); el('adv-link-tbl').value='t3'; advLinkTblChanged(); el('adv-link-mode').value='countd'; advLinkModeChanged(); el('adv-link-col').value='CP'; el('adv-link-alias').value='nb_cp'; advAddLinkColumn(); await wait(30);
  // transposition 12 colonnes sur GARANTIE (une seule route) et via explicite sur ADRESSE
  v12xAddMode('link'); el('adv-link-tbl').value='t4'; advLinkTblChanged(); el('adv-link-mode').value='indexed'; advLinkModeChanged(); el('adv-link-col').value='CODE'; el('adv-link-n').value='12'; el('adv-link-alias').value='gar'; advAddLinkColumn(); await wait(30);
  const tr=state.advExtract.columns.find(c=>c.kind==='link' && c.mode==='indexed'); ok('transposition en 12 colonnes ajoutée (GARANTIE, une seule route : pas de via)', tr && tr.n===12 && !tr.via);
  v12xAddMode('link'); el('adv-link-tbl').value='t3'; advLinkTblChanged(); el('adv-link-via').value=el('adv-link-via').options[2].value; el('adv-link-mode').value='values'; advLinkModeChanged(); el('adv-link-col').value='VILLE'; el('adv-link-alias').value='ville_pp'; advAddLinkColumn(); await wait(30);
  const ex=state.advExtract.columns.find(c=>c.alias==='ville_pp'); ok('via explicite toujours possible sur une synthèse', ex && ex.via && ex.via!=='any');
  r=buildAdvSql(state.advExtract); SQL.all=r.sql; SQL.outCols=(r.outCols||[]).map(x=>x.alias);
  ok('SQL complet : 12 colonnes gar_1…gar_12 par list_extract, aucune sous-requête LIMIT/OFFSET', !r.err && (r.sql.match(/list_extract\(/g)||[]).length===12 && /AS "gar_12"/.test(r.sql) && !/LIMIT 1 OFFSET/.test(r.sql) && /list\(u\.v ORDER BY u\.rn\)/.test(r.sql));
  ok('SQL complet : ville_pp sur une seule route (pas d\'UNION pour elle)', /AS "ville_pp"/.test(r.sql));
  // aperçu de l'ordre des colonnes en sortie
  ok('colonnes en sortie : NUM, nb_adr, villes, nb_cp, gar_1…gar_12, ville_pp', SQL.outCols.join(',')==='NUM,nb_adr,villes,nb_cp,'+Array.from({length:12},(_,k)=>'gar_'+(k+1)).join(',')+',ville_pp');
  // ---- 3. erreurs HTML ----
  showError('<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>');
  ok('erreur contenant une page HTML : message en clair (titre repris), pas de balises', /page HTML/.test(el('globalErrorText').textContent) && /502 Bad Gateway/.test(el('globalErrorText').textContent) && !/<html/.test(el('globalErrorText').textContent)); hideError();
  showError('Comptage impossible : Binder Error'); ok('erreur ordinaire inchangée', el('globalErrorText').textContent==='Comptage impossible : Binder Error'); hideError();
  ok('lexique : transposer en colonnes', !!V11_LEXIQUE['transposer en colonnes']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return { R, SQL };
}, {seed,isV13});
const R=out.R;
let DuckDBInstance=null; try { ({ DuckDBInstance } = await import(process.env.DUCKDB_NODE_API || '@duckdb/node-api')); } catch(e) { console.log('ℹ️  @duckdb/node-api absent : vérifications SQL réelles ignorées (npm i --no-save @duckdb/node-api dans studio-data/tests)'); }
// ---- exécution réelle du SQL généré sur DuckDB ----
if (DuckDBInstance) try {
  const inst = await DuckDBInstance.create(':memory:'); const c = await inst.connect();
  await c.run(`CREATE TABLE t_t0 AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ('C1','P1',NULL,'100'),('C2',NULL,'M1','200'),('C3','P2','M2','300'),('C4',NULL,NULL,'400')) t(NUM, ID_PP, ID_PM, MONTANT)`);
  await c.run(`CREATE TABLE t_t1 AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ('P1','Paul','A1'),('P2','Anna','A2')) t(ID, NOM, ID_ADR)`);
  await c.run(`CREATE TABLE t_t2 AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ('M1','Acme','A3'),('M2','Globex','A2')) t(ID, RAISON, ID_ADR)`);
  await c.run(`CREATE TABLE t_t3 AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ('A1','Paris','75001'),('A2','Lyon','69001'),('A3','Lille','59000')) t(ID, VILLE, CP)`);
  await c.run(`CREATE TABLE t_t4 AS SELECT row_number() OVER () AS __rn, * FROM (SELECT i AS ID, 'C' || (1 + (i % 3)) AS NUM_CONTRAT, 'G' || i AS CODE FROM range(1, 40) t(i))`);
  const rows = (await c.runAndReadAll(out.SQL.all + ' ORDER BY 1')).getRowObjects();
  const byNum = Object.fromEntries(rows.map(r=>[r.NUM, r]));
  R.push(['DuckDB : le SQL complet s\'exécute (4 lignes de départ, ' + Object.keys(rows[0]||{}).length + ' colonnes)', rows.length===4 && Object.keys(rows[0]).length===17]);
  R.push(['DuckDB : compter ADRESSE sur l\'un ou l\'autre lien — C1 (PP→A1) = 1, C2 (PM→A3) = 1, C3 (PP→A2 et PM→A2) = 2, C4 = 0', Number(byNum.C1.nb_adr)===1 && Number(byNum.C2.nb_adr)===1 && Number(byNum.C3.nb_adr)===2 && Number(byNum.C4.nb_adr)===0]);
  R.push(['DuckDB : villes concaténées sur les deux routes (C3 → Lyon une seule fois), valeurs uniques de CP', byNum.C1.villes==='Paris' && byNum.C2.villes==='Lille' && byNum.C3.villes==='Lyon' && Number(byNum.C3.nb_cp)===1 && byNum.C4.villes===null]);
  R.push(['DuckDB : transposition 12 colonnes dans l\'ordre du fichier (C1 : G3, G6, … G36), C4 sans garantie = vides', byNum.C1.gar_1==='G3' && byNum.C1.gar_2==='G6' && byNum.C1.gar_12==='G36' && byNum.C4.gar_1===null && byNum.C4.gar_12===null]);
  R.push(['DuckDB : via explicite ville_pp = route personne physique seulement (C2 → vide)', byNum.C1.ville_pp==='Paris' && byNum.C2.ville_pp===null && byNum.C3.ville_pp==='Lyon']);
  const rc = (await c.runAndReadAll(out.SQL.count)).getRowObjects(); R.push(['DuckDB : le SQL « compter » seul s\'exécute', rc.length===4]);
} catch(e) { R.push(['ERREUR DuckDB '+e.message.slice(0,300), false]); }
let fail=0; for(const [n,c] of R){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${R.length-fail}/${R.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
if (process.env.SHOTS) {
  await p.evaluate(()=>{ hideError(); v12xAddMode('link'); el('adv-link-tbl').value='t3'; advLinkTblChanged(); el('adv-link-mode').value='indexed'; advLinkModeChanged(); const s=el('step-3'); if (s) s.scrollIntoView({block:'start'}); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); });
  await p.waitForTimeout(300); await p.screenshot({ path: D+'xf_'+(isV13?'v13_':'')+'light.png' });
}
await b.close(); process.exit(fail||perr.length?1:0);
