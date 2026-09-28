import fs from 'fs';
// Statistiques simples sur UNE table : « combien de lignes par année ? » était impossible.
// L'écran comptait les valeurs brutes d'une colonne, sur un échantillon de 5000 lignes,
// et n'affichait que les 15 premières. On vérifie ici les deux moitiés du remède :
// l'écran (une seule table, un regroupement par période) et le SQL produit, exécuté
// sur un vrai DuckDB avec des dates écrites comme on les trouve dans la vraie vie.
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
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}};
  try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  try {
  state.tables['s0']={id:'s0',name:'INTERVENTIONS',type:'csv',status:'ready',headers:['REPERE','DATE_ENTREE','MONTANT'],config:{},columnsMeta:{}};
  state.tables['s1']={id:'s1',name:'AUTRE',type:'csv',status:'ready',headers:['SANS_RAPPORT'],config:{},columnsMeta:{}};
  switchTab(4); updateVizBaseTableSelect(); el('vizBaseTable').value='s0'; handleVizBaseTableChange();

  // Comme avant : sans table choisie en haut, la configuration reste utilisable.
  el('vizBaseTable').value=''; handleVizBaseTableChange();
  ok('sans table choisie, la configuration reste accessible avec toutes les colonnes',
    !el('vizElementsContainer').classList.contains('hidden')
    && [...el('vizDim').options].length===4);
  el('vizBaseTable').value='s0'; handleVizBaseTableChange();

  const groupes = [...el('vizDim').querySelectorAll('optgroup')].map(g=>g.label);
  ok('toutes les tables chargées restent proposées, celle de l’écran en tête',
    groupes.join('|')==='INTERVENTIONS|AUTRE'
    && [...el('vizDim').options].map(o=>o.value).join(' ')==='s0|REPERE s0|DATE_ENTREE s0|MONTANT s1|SANS_RAPPORT'
    && [...el('vizMeasure').options].length===4);

  // Un nom de colonne peut contenir une barre verticale : on coupe à la première.
  ok('une colonne est bien reconnue, même si son nom contient une barre',
    statColonneChoisie('s0|A|B').tId==='s0' && statColonneChoisie('s0|A|B').colonne==='A|B');

  el('vizDim').value='s1|SANS_RAPPORT'; statAxeChange();
  ok('prendre l’axe dans une autre table remet la source de données d’accord',
    el('vizBaseTable').value==='s1');
  // …mais reconstruire la liste ne doit PAS déplacer la table choisie ailleurs
  // (c'est ainsi qu'on arrive ici depuis un jeu temporaire).
  el('vizBaseTable').value='s1'; handleVizBaseTableChange();
  ok('reconstruire la liste ne change pas la table choisie', el('vizBaseTable').value==='s1');
  el('vizBaseTable').value='s0'; handleVizBaseTableChange();

  const periodes = [...el('vizPeriode').options].map(o=>o.value);
  ok('on peut regrouper par année, trimestre ou mois', periodes.join('|')==='|annee|trimestre|mois');

  el('vizDim').value='s0|DATE_ENTREE'; statProposerLaPeriode();
  const aideDate = el('vizDimAide').textContent;
  el('vizDim').value='s0|REPERE'; statProposerLaPeriode();
  ok('une colonne date est signalée, une colonne ordinaire ne l’est pas',
    /année/.test(aideDate) && el('vizDimAide').textContent==='');

  el('vizAgg').value='count'; toggleVizMeasure();
  const sansColonne = el('vizMeasure').disabled;
  el('vizAgg').value='sum'; toggleVizMeasure();
  ok('« Nombre de lignes » ne demande pas de colonne, « Somme » en demande une',
    sansColonne && !el('vizMeasure').disabled);

  ok('le titre du calcul se lit en français',
    statTitreDuCalcul('count','','DATE_ENTREE','annee')==='Nombre de lignes par année de DATE_ENTREE'
    && statTitreDuCalcul('sum','MONTANT','SITE','')==='Somme de MONTANT par SITE');

  el('vizAgg').value='sum'; toggleVizMeasure();
  el('vizDim').value='s0|DATE_ENTREE'; statProposerLaPeriode(); el('vizMeasure').value='s1|SANS_RAPPORT';
  await generateChart(null);
  ok('mesurer une colonne d’une AUTRE table est refusé, au lieu d’être calculé faux',
    /même table que l’axe/.test(el('globalErrorText').textContent||''));
  el('vizMeasure').value='s0|MONTANT';

  // Sans la bibliothèque de graphiques (page de test, ou pas d'internet), les
  // chiffres doivent quand même s'afficher.
  statDernierResultat = { titre:'Nombre de lignes par année de DATE_ENTREE', tableau:'INTERVENTIONS',
    lignes:[{axe:'2023',valeur:2,lignes:2},{axe:'2024',valeur:2,lignes:2}], total:4 };
  statAfficherLeResultat();
  ok('sans bibliothèque de graphiques, le tableau des chiffres s’affiche quand même',
    typeof Chart === 'undefined'
    && el('myChart').parentNode.classList.contains('hidden')
    && /2023/.test(el('statTableau').textContent) && /2024/.test(el('statTableau').textContent)
    && /4 ligne\(s\) analysée\(s\)/.test(el('statResume').textContent));

  // Le SQL est vérifié dehors, sur un vrai moteur.
  window.__sql = {
    annee: statSqlDeLAxe('DATE_ENTREE','annee'),
    trimestre: statSqlDeLAxe('DATE_ENTREE','trimestre'),
    mois: statSqlDeLAxe('DATE_ENTREE','mois'),
    brut: statSqlDeLAxe('REPERE',''),
    lignes: statSqlDeLaMesure('count',''),
    somme: statSqlDeLaMesure('sum','MONTANT'),
    distinct: statSqlDeLaMesure('distinct','REPERE')
  };

  // Sans moteur de données dans la page de test, le calcul doit échouer en français.
  await generateChart(null);
  ok('sans moteur de données, l’écran le dit au lieu de rester muet',
    // Depuis la V11, un message d'erreur passe par une bulle d'alerte.
    /Calcul impossible/.test(el('globalErrorText').textContent||'')
    && !!document.querySelector('.v11-toast.err'));
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
});
const SQL = await p.evaluate(()=>window.__sql);
await b.close();

// ---- le SQL produit, exécuté sur un vrai DuckDB ----
const { DuckDBInstance } = await import('@duckdb/node-api');
const conn = await (await DuckDBInstance.create(':memory:')).connect();
const requete = async sql => (await (await conn.run(sql)).getRowObjects());
// Des dates comme on les trouve vraiment : deux formats français, l'ISO, un horodatage,
// une case vide et un « n/a ». Et des montants avec virgule, espace insécable et texte.
await requete(`CREATE TABLE "t_s0" ("REPERE" VARCHAR, "DATE_ENTREE" VARCHAR, "MONTANT" VARCHAR)`);
await requete(`INSERT INTO "t_s0" VALUES
  ('R1','12/03/2023','1 234,50'), ('R2','2023-07-01','10'), ('R3','15.11.2024',''),
  ('R4','2024-02-09 08:30:00','5,5'), ('R5','','abc'), ('R1','n/a','100')`);
const grouper = async (axe, mesure, tri) =>
  requete(`SELECT ${axe} AS axe, ${mesure} AS valeur FROM "t_s0" GROUP BY 1 ORDER BY ${tri}`);
const ok=(n,c)=>out.push([n,!!c]);

const annees = await grouper(SQL.annee, SQL.lignes, 'axe ASC');
ok('SQL réel : le nombre de lignes par année, quel que soit le format de la date — et rangé dans l’ordre du temps',
  annees.map(r=>r.axe+':'+r.valeur).join(' ')==='(vide):2 2023:2 2024:2');

const trimestres = await grouper(SQL.trimestre, SQL.lignes, 'axe ASC');
ok('SQL réel : le même compte par trimestre',
  trimestres.map(r=>r.axe).join(' ')==='(vide) 2023-T1 2023-T3 2024-T1 2024-T4');

const mois = await grouper(SQL.mois, SQL.lignes, 'axe ASC');
ok('SQL réel : le même compte par mois',
  mois.map(r=>r.axe).join(' ')==='(vide) 2023-03 2023-07 2024-02 2024-11');

const sommes = await requete(`SELECT ${SQL.somme} AS v FROM "t_s0"`);
ok('SQL réel : la somme accepte la virgule décimale et les espaces, et ignore le texte',
  Math.abs(Number(sommes[0].v) - 1350) < 0.001);

const differentes = await requete(`SELECT ${SQL.distinct} AS v FROM "t_s0"`);
ok('SQL réel : « valeurs différentes » compte les repères distincts', Number(differentes[0].v)===5);

const bruts = await grouper(SQL.brut, SQL.lignes, 'valeur DESC, axe ASC');
ok('SQL réel : sans regroupement, la valeur la plus fréquente vient en tête',
  bruts[0].axe==='R1' && Number(bruts[0].valeur)===2 && bruts.length===5);

let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
process.exit(fail||perr.length?1:0);
