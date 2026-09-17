import fs from 'fs';
// V13.8 : les tables conçues — l'enrichissement par couches.
// Chaque enrichissement ouvrait sa propre requête imbriquée, même quand il ne dépendait de personne.
// Au-delà d'une trentaine, le moteur du navigateur s'arrêtait net sur la profondeur d'imbrication :
// « Maximum call stack size exceeded » ou « memory access out of bounds ». Ici on vérifie deux choses :
// que le SQL produit range les enrichissements indépendants dans une seule couche, et que ce SQL
// s'exécute vraiment — sur un DuckDB réel, puisque la page de test n'en a pas.
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV13.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);

const COLONNES = ['REPERE','LIBELLE','TYPE','MONTANT','CLE'];
const out = await p.evaluate(async COLONNES => {
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}};
  try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  try {
  state.tables['s0']={id:'s0',name:'BASE',type:'csv',status:'ready',headers:COLONNES,config:{},columnsMeta:{}};
  for (let n=1;n<=12;n++) state.tables['s'+n]={id:'s'+n,name:'EQUT'+n,type:'csv',status:'ready',headers:COLONNES,config:{},columnsMeta:{}};
  // Un plan de table : « combien » enrichissements, chaînés les uns aux autres ou non.
  const plan = (combien, chaine) => ({
    name:'T', targetId:null,
    sources:[{ src:'BASE', map:Object.fromEntries(COLONNES.map(c=>[c,c])), filters:[] }],
    attrs:COLONNES.slice(), formats:{}, key:[], calcs:[], fks:[],
    joins: Array.from({length: combien}, (_, i) => ({ src:'EQUT'+((i%12)+1), srcKey:'CLE',
      attr: chaine && i ? 'RAMENE'+(i-1) : 'CLE', col:'LIBELLE', as:'RAMENE'+i }))
  });
  // Un niveau d'imbrication = une sous-requête « ) u ».
  const niveaux = sql => (sql.match(/\)\su\n/g) || []).length;

  ok('vingt enrichissements indépendants ne font qu’une seule couche', niveaux(tdBuildSql(plan(20,false)))===1);
  ok('cent enrichissements indépendants ne font toujours qu’une seule couche', niveaux(tdBuildSql(plan(100,false)))===1);
  ok('un enrichissement chaîné ajoute un niveau, et un seul', niveaux(tdBuildSql(plan(5,true)))===5);
  ok('les colonnes d’une même couche sont toutes ramenées', (tdBuildSql(plan(20,false)).match(/AS "RAMENE\d+"/g)||[]).length===20);
  ok('au-delà de trente niveaux de chaînage, on le dit en français', (()=>{ try { tdBuildSql(plan(31,true)); return false; }
    catch(e){ return /niveaux de cha/.test(e.message) && /une premi/.test(e.message); } })());
  ok('un plantage de pile du moteur est traduit, pas recopié', /emboîte trop de niveaux/.test(tdPhraseDeLErreur(new Error('Maximum call stack size exceeded')))
    && /emboîte trop de niveaux/.test(tdPhraseDeLErreur(new Error('memory access out of bounds'))));
  ok('une erreur ordinaire reste telle quelle', tdPhraseDeLErreur(new Error('La source "X" n’est pas chargée.'))==='La source "X" n’est pas chargée.');
  window.__sqlLarge = tdBuildSql(plan(40,false));
  window.__sqlChaine = tdBuildSql(plan(6,true));
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, COLONNES);
const sqlLarge = await p.evaluate(()=>window.__sqlLarge);
const sqlChaine = await p.evaluate(()=>window.__sqlChaine);
await b.close();

// ---- le SQL produit, exécuté sur un vrai DuckDB ----
const { DuckDBInstance } = await import('@duckdb/node-api');
const conn = await (await DuckDBInstance.create(':memory:')).connect();
const requete = async sql => (await (await conn.run(sql)).getRowObjects());
await requete(`CREATE TABLE "t_s0" AS SELECT 'R'||i AS REPERE, 'Lib '||i AS LIBELLE, 'T'||(i%5) AS TYPE, CAST(i AS VARCHAR) AS MONTANT, 'K'||(i%50) AS CLE FROM range(200) t(i)`);
for (let n=1;n<=12;n++) await requete(`CREATE TABLE "t_s${n}" AS SELECT 'R'||i AS REPERE, 'Lib${n} '||i AS LIBELLE, 'T'||(i%5) AS TYPE, CAST(i AS VARCHAR) AS MONTANT, 'K'||(i%50) AS CLE FROM range(200) t(i)`);
const ok=(n,c)=>out.push([n,!!c]);
const large = await requete(`SELECT * FROM (\n${sqlLarge}\n) f LIMIT 3`);
ok('SQL réel : quarante enrichissements en une couche s’exécutent et ramènent leurs colonnes',
  large.length===3 && Object.keys(large[0]).filter(k=>/^RAMENE/.test(k)).length===40 && large[0].RAMENE39 !== null);
const chaine = await requete(`SELECT * FROM (\n${sqlChaine}\n) f LIMIT 3`);
ok('SQL réel : le chaînage continue de marcher — chaque niveau s’accroche au précédent',
  chaine.length===3 && Object.keys(chaine[0]).filter(k=>/^RAMENE/.test(k)).length===6);
const compte = await requete(`SELECT COUNT(*)::BIGINT AS n FROM (\n${sqlLarge}\n) f`);
ok('SQL réel : les enrichissements ne démultiplient pas les lignes', Number(compte[0].n)===200);

let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
process.exit(fail||perr.length?1:0);
