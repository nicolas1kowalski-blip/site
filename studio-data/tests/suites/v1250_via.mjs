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
const seed = `state.tables['t0']={id:'t0',name:'CONTRAT',type:'csv',status:'ready',headers:['NUM','ID_PP','ID_PM','MONTANT'],config:{},columnsMeta:{}};
  state.tables['t1']={id:'t1',name:'PERSONNE_PHYSIQUE',type:'csv',status:'ready',headers:['ID','NOM','ID_ADR'],config:{},columnsMeta:{}};
  state.tables['t2']={id:'t2',name:'PERSONNE_MORALE',type:'csv',status:'ready',headers:['ID','RAISON','ID_ADR'],config:{},columnsMeta:{}};
  state.tables['t3']={id:'t3',name:'ADRESSE',type:'csv',status:'ready',headers:['ID','VILLE','CP'],config:{},columnsMeta:{}};
  state.relations.push({id:'r1',sourceTable:'t0',targetTable:'t1',sourceCol:'ID_PP',targetCol:'ID',type:'N-1'},{id:'r2',sourceTable:'t0',targetTable:'t2',sourceCol:'ID_PM',targetCol:'ID',type:'N-1'},{id:'r3',sourceTable:'t1',targetTable:'t3',sourceCol:'ID_ADR',targetCol:'ID',type:'N-1'},{id:'r4',sourceTable:'t2',targetTable:'t3',sourceCol:'ID_ADR',targetCol:'ID',type:'N-1'});
  renderTables(); switchTab(3); advSetBase('t0');`;
const out = await p.evaluate(async (seed)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const vis=n=>!!n && getComputedStyle(n).display!=='none'; const X=()=>el('v12x');
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  eval(seed);
  ok('ADRESSE atteignable par 2 chemins depuis CONTRAT', advViaOptions('t3').length===2);
  el('adv-col-tbl').value='t3'; advColColChanged();
  const via=el('adv-col-via'), wrap=el('adv-col-via-wrap');
  ok('sélecteur via affiché, option « l\'un ou l\'autre » en tête et présélectionnée', !wrap.classList.contains('hidden') && via.options[0].value==='any' && /l'un ou l'autre/.test(via.options[0].textContent) && via.value==='any' && via.options.length===4);
  el('adv-col-col').value='VILLE'; advAddColumn();
  const c1=state.advExtract.columns[0];
  ok('colonne ajoutée sans choisir de via : via = any, libellé « via l\'un ou l\'autre lien »', c1 && c1.via==='any' && /l'un ou l'autre lien/.test(X().querySelector('.v12x-sec[data-sec="cols"]').textContent));
  let r=buildAdvSql(state.advExtract);
  const joins=(r.sql.match(/LEFT JOIN "[^"]*" x\d+ ON/g)||[]).length;
  ok('SQL : les deux routes sont jointes (PP, PM et deux fois ADRESSE = 4 jointures)', !r.err && joins===4);
  ok('SQL : VILLE = COALESCE des deux alias ADRESSE', /COALESCE\(x\d+\."VILLE", x\d+\."VILLE"\) AS "VILLE"/.test(r.sql));
  // transformation conservée
  c1.transform='upper'; r=buildAdvSql(state.advExtract); ok('transformation MAJUSCULES appliquée sur le COALESCE', /UPPER\(TRIM\(CAST\(COALESCE\(x\d+\."VILLE", x\d+\."VILLE"\) AS VARCHAR\)\)\) AS "VILLE"/.test(r.sql)); c1.transform='none';
  // via explicite toujours possible
  el('adv-col-tbl').value='t3'; advColColChanged(); el('adv-col-via').value=el('adv-col-via').options[2].value; el('adv-col-col').value='CP'; advAddColumn();
  const c2=state.advExtract.columns[1]; r=buildAdvSql(state.advExtract);
  ok('chemin explicite choisi : colonne CP sur un seul alias, sans COALESCE', c2.via && c2.via!=='any' && /x\d+\."CP" AS "CP"/.test(r.sql) && !/COALESCE\(x\d+\."CP"/.test(r.sql));
  // filtre
  el('adv-flt-tbl').value='t3'; advFltTblChanged();
  ok('filtre : via « l\'un ou l\'autre » présélectionné', el('adv-flt-via').value==='any' && !el('adv-flt-via-wrap').classList.contains('hidden'));
  el('adv-flt-col').innerHTML='<option>VILLE</option>'; el('adv-flt-col').value='VILLE'; el('adv-flt-op').value='='; el('adv-flt-val').value='PARIS'; advAddFilter();
  r=buildAdvSql(state.advExtract);
  ok('filtre VILLE = PARIS : condition sur le COALESCE des deux routes', state.advExtract.filters[0].via==='any' && /WHERE UPPER\(TRIM\(CAST\(COALESCE\(x\d+\."VILLE", x\d+\."VILLE"\) AS VARCHAR\)\)\) = 'PARIS'/.test(r.sql));
  ok('pastille du filtre : « via l\'un ou l\'autre lien »', /l'un ou l'autre lien/.test(X().querySelector('.v12x-sec[data-sec="filt"]').textContent));
  state.advExtract.filters[0].op='empty'; r=buildAdvSql(state.advExtract); ok('filtre « est vide » : IS NULL sur le COALESCE', /\(COALESCE\(x\d+\."VILLE", x\d+\."VILLE"\) IS NULL OR/.test(r.sql)); state.advExtract.filters=[];
  // synthèse / hiérarchie : pas d'option « any »
  el('adv-link-tbl').value='t3'; advLinkTblChanged(); ok('synthèse d\'une table liée : option « l\'un ou l\'autre » proposée (V12.11.2)', Array.from(el('adv-link-via').options).some(o=>o.value==='any'));
  // table à un seul chemin : rien ne change
  state.tables['t4']={id:'t4',name:'AGENCE',type:'csv',status:'ready',headers:['ID','LIBELLE'],config:{},columnsMeta:{}}; state.relations.push({id:'r5',sourceTable:'t0',targetTable:'t4',sourceCol:'NUM',targetCol:'ID',type:'N-1'}); renderAdvExtract(); el('adv-col-tbl').value='t4'; advColColChanged(); ok('table à un seul chemin : sélecteur via masqué', el('adv-col-via-wrap').classList.contains('hidden') && advViaVal('adv-col-via')==='');
  // paramétrage
  window.prompt=()=>'Adresses'; epSaveCurrent(); const ep=state.extractPresets.find(x=>x.name==='Adresses'); state.advExtract.columns=[]; renderAdvExtract(); epLoad(ep.id);
  ok('paramétrage rechargé : via « any » conservé et SQL identique', state.advExtract.columns[0].via==='any' && /COALESCE\(x\d+\."VILLE", x\d+\."VILLE"\) AS "VILLE"/.test(buildAdvSql(state.advExtract).sql));
  // vue graphique
  let threw=false; try { advGToggleMode(true); advGToggleMode(false); } catch(e){ threw=true; } ok('vue graphique avec une colonne « any » : pas d\'exception', !threw);
  ok('lexique', !!V11_LEXIQUE['l\'un ou l\'autre lien']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, seed);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate((seed)=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} eval(seed);
    el('adv-col-tbl').value='t0'; advAddAllColumns(); el('adv-col-tbl').value='t3'; advColColChanged(); el('adv-col-col').value='VILLE'; advAddColumn(); el('adv-col-tbl').value='t3'; advColColChanged(); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); advShowSql(); }, seed);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(300); await q.screenshot({ path: D+'v_any_'+theme+'.png', fullPage: true });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
