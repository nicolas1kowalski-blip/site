import fs from 'fs';
// V13.5 : la codification — rattacher à chaque ligne d'une liste reçue le code d'un référentiel.
// Deux temps : l'écran et ses fonctions dans le navigateur, puis le SQL qu'il produit, exécuté sur un vrai
// DuckDB. C'est la seule façon de prouver que les libellés sont vraiment retrouvés, et pas seulement que le
// SQL « a la bonne tête ».
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

// La liste reçue et la nomenclature, telles qu'elles arrivent sur le terrain.
const EQUIPEMENTS = [
  ['EQ001','Pompe centrifuge alimentaire','POMPES',''],
  ['EQ002','POMPE  CENTRIFUGE (X2)','POMPES',''],
  ['EQ003','Vanne papillon DN100','VANNES',''],
  ['EQ004','Vanne DN80','VANNES',''],
  ['EQ005','Échangeur à plaques','ECHANGEURS','ECH-P'],
  ['EQ006','Bidule non identifiable','POMPES',''],
  ['EQ007','Pompe à vide','POMPES',''],
  ['EQ008','Groupe motopompe centrif','POMPES',''],
  ['EQ009','Electrovanne papillon DN50','VANNES','']
];
const NOMENCLATURE = [
  ['POMPES','Transfert','Centrifuge','Pompe centrifuge','PMP-C'],
  ['POMPES','Vide','Anneau liquide','Pompe a vide','PMP-V'],
  ['VANNES','Sectionnement','Quart de tour','Vanne papillon','VAN-P'],
  ['VANNES','Reglage','Lineaire','Vanne de reglage','VAN-R'],
  ['ECHANGEURS','Thermique','Plaques','Echangeur a plaques','ECH-P']
];

const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  state.tables['eq']={id:'eq',name:'equipements.csv',type:'csv',status:'ready',headers:['REPERE','LIBELLE','FAMILLE','CODE_FOURNI'],config:{},columnsMeta:{}};
  state.tables['nm']={id:'nm',name:'nomenclature.csv',type:'csv',status:'ready',headers:['FAMILLE','SYSTEME','SOUS_SYSTEME','LIBELLE_TYPE','CODE_TYPE'],config:{},columnsMeta:{}};
  renderTables();

  // ---- l'écran existe, sous Exploitation
  switchTab(17); await wait(200);
  ok('Exploitation : un onglet « Codification » est ajouté par la couche V13', NAV_PHASES.find(x=>x.id==='etl').tabs.some(t=>t.n===17 && /Codification/.test(t.label)));
  ok('l\'écran 17 est créé par la couche et visible', el('step-17') && !el('step-17').classList.contains('hidden'));
  switchTab(3); await wait(100);
  ok('en changeant d\'onglet, l\'écran 17 se cache comme les seize autres', el('step-17').classList.contains('hidden'));
  switchTab(17); await wait(150);
  el('v13-codif-nouvelle').click(); await wait(200);
  const C=()=>v13Codifications()[0];
  ok('« + Nouvelle codification » crée une codification avec les seuils des libellés d\'équipements', C() && C().methode==='mots' && C().seuilAuto===0.99 && C().seuilRevoir===0.45);

  // ---- les réglages
  v13EcrireDansLaCodification('source','equipements.csv'); v13EcrireDansLaCodification('colonneLibelle','LIBELLE');
  v13EcrireDansLaCodification('colonneCodeExistant','CODE_FOURNI'); v13EcrireDansLaCodification('nomenclature','nomenclature.csv');
  v13EcrireDansLaCodification('colonneCode','CODE_TYPE'); v13EcrireDansLaCodification('colonneLibelleRef','LIBELLE_TYPE');
  await wait(150);
  ok('les colonnes proposées suivent la source et la nomenclature choisies', Array.from(el('v13-codif-libelle').options).some(o=>o.value==='LIBELLE') && Array.from(el('v13-codif-code').options).some(o=>o.value==='CODE_TYPE'));
  ['FAMILLE','SYSTEME','SOUS_SYSTEME','LIBELLE_TYPE'].forEach(niveau=>{ el('v13-codif-niveau').value=niveau; v13AjouterUnNiveau(C().id); });
  await wait(150);
  ok('les niveaux de l\'arbre sont déclarés dans l\'ordre, du plus haut au plus fin', C().niveaux.join('>')==='FAMILLE>SYSTEME>SOUS_SYSTEME>LIBELLE_TYPE' && el('step-17').querySelectorAll('#v13-codif-niveaux .v13-paire').length===4);
  v13EcrireDansLaCodification('restreindreSource','FAMILLE'); v13EcrireDansLaCodification('restreindreNomenclature','FAMILLE'); await wait(100);
  ok('la recherche est enfermée dans la branche de la famille', /FAMILLE/.test(v13ConditionDeBranche(C())) && v13ConditionDeBranche({}) === 'TRUE');

  // ---- les synonymes et les règles, relus en français
  v13AjouterUnSynonyme(C().id); await wait(100);
  const syn = C().synonymes[0];
  v13EcrireDansLeSynonyme(C().id, syn.id, 'motRetenu', 'POMPE');
  v13EcrireDansLeSynonyme(C().id, syn.id, 'variantes', 'motopompe ; groupe motopompe'); await wait(100);
  ok('un synonyme se relit à voix haute, dans le bon sens', v13PhraseDuSynonyme(C().synonymes[0])==='motopompe, groupe motopompe valent POMPE' && /motopompe, groupe motopompe valent POMPE/.test(el('step-17').querySelector('.v13-codif-phrase-synonyme').textContent));
  v13AjouterUneRegle(C().id); await wait(100);
  const regle = C().regles[0];
  v13EcrireDansLaRegle(C().id, regle.id, 'contient', 'bidule');
  v13EcrireDansLaRegle(C().id, regle.id, 'code', 'PMP-C'); await wait(100);
  ok('une règle se relit en français — « si LIBELLE contient bidule → PMP-C »', /si LIBELLE contient bidule → PMP-C/.test(el('step-17').querySelector('.v13-codif-phrase-regle').textContent));
  ok('une règle incomplète le dit, plutôt que de faire semblant', /il manque les mots/.test(v13PhraseDeLaRegle({type:'motscles',contient:[],code:'X'},'LIBELLE')) && /il manque l’expression/.test(v13PhraseDeLaRegle({type:'expression',motif:'  ',code:'X'},'LIBELLE')));
  ok('les mots se saisissent séparés par des virgules ou des points-virgules', JSON.stringify(v13MotsSaisis(' pompe ; centrifuge, , vide '))===JSON.stringify(['pompe','centrifuge','vide']));

  // ---- la canonisation, côté texte
  ok('un libellé appris est rangé sous les mots retenus, formes en plusieurs mots comprises', v13MotRetenuDuTexte('Groupe motopompe alimentaire', C())==='POMPE ALIMENTAIRE' && v13MotRetenuDuTexte('Vanne papillon', C())==='VANNE PAPILLON');
  ok('le bilan se dit en chiffres et en une phrase', /5 ligne\(s\) codées d’office sur 9 \(56 %\)/.test(v13BilanDeCodification([{statut:'office',lignes:5},{statut:'revoir',lignes:3},{statut:'absent',lignes:1}]).phrase) && /Aucune ligne à coder/.test(v13BilanDeCodification([]).phrase));
  ok('l\'écran dit toujours quoi faire ensuite', /Passez les 3 cas à revoir/.test(v13ProchaineAction({total:9,revoir:3,absent:1})) && /Tout est codé/.test(v13ProchaineAction({total:9,revoir:0,absent:0})));
  ok('une codification incomplète est refusée en français, pas en erreur SQL', (()=>{ try { v13SqlDeCodification(Object.assign({}, C(), {colonneLibelle:''})); return false; } catch(e) { return /la colonne du libellé/.test(e.message); } })());

  // ---- le SQL produit, rendu à node pour être exécuté sur un vrai moteur
  window.__sqlSansSynonymes = v13SqlDeCodification(Object.assign({}, C(), { synonymes: [], regles: [] }));
  window.__sqlAvecRegle = v13SqlDeCodification(Object.assign({}, C(), { synonymes: [] }));
  const avecTout = Object.assign({}, C(), {
    synonymes: [
      { id:'s1', motRetenu:'POMPE', variantes:['motopompe','groupe motopompe'], proche:false },
      { id:'s2', motRetenu:'CENTRIFUGE', variantes:['centrif'], proche:true },
      { id:'s3', motRetenu:'VANNE', variantes:['electrovanne'], proche:false }
    ],
    regles: []
  });
  window.__sqlAvecSynonymes = v13SqlDeCodification(avecTout);
  window.__sqlRevue = v13SqlDesCasARevoir(Object.assign({}, C(), { synonymes: [], regles: [] }), 50);
  window.__sqlAvecDecision = v13SqlDeCodification(Object.assign({}, avecTout, { decisions: { 4: 'VAN-P' } }));
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
});
const sqlSansSynonymes = await p.evaluate(()=>window.__sqlSansSynonymes);
const sqlAvecRegle = await p.evaluate(()=>window.__sqlAvecRegle);
const sqlAvecSynonymes = await p.evaluate(()=>window.__sqlAvecSynonymes);
const sqlRevue = await p.evaluate(()=>window.__sqlRevue);
const sqlAvecDecision = await p.evaluate(()=>window.__sqlAvecDecision);
await b.close();

// ---- le SQL produit par l'écran, exécuté sur un vrai DuckDB ----
const { DuckDBInstance } = await import('@duckdb/node-api');
const instance = await DuckDBInstance.create(':memory:'); const conn = await instance.connect();
const requete = async sql => (await (await conn.run(sql)).getRowObjects());
const valeurs = lignes => lignes.map(ligne => '(' + ligne.map(v => `'${String(v).replace(/'/g,"''")}'`).join(', ') + ')').join(', ');
await requete(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ${valeurs(EQUIPEMENTS)}) v(REPERE,LIBELLE,FAMILLE,CODE_FOURNI)`);
await requete(`CREATE TABLE "t_nm" AS SELECT * FROM (VALUES ${valeurs(NOMENCLATURE)}) v(FAMILLE,SYSTEME,SOUS_SYSTEME,LIBELLE_TYPE,CODE_TYPE)`);
const ok=(n,c)=>out.push([n,!!c]);
const parRepere = async sql => Object.fromEntries((await requete(sql)).map(l => [String(l.REPERE), l]));

const sans = await parRepere(sqlSansSynonymes);
ok('SQL réel : le code déjà fourni est gardé tel quel, sans jamais être remis en cause', sans.EQ005.__code==='ECH-P' && sans.EQ005.__origine==='existant');
ok('SQL réel : les libellés sont retrouvés malgré la casse, les accents, la ponctuation et les mots en trop', sans.EQ001.__code==='PMP-C' && sans.EQ002.__code==='PMP-C' && sans.EQ003.__code==='VAN-P' && sans.EQ007.__code==='PMP-V');
ok('SQL réel : le chemin complet de l’arbre accompagne chaque code trouvé', sans.EQ001.__chemin==='POMPES › Transfert › Centrifuge › Pompe centrifuge');
ok('SQL réel : un libellé partiel est mis à revoir, un libellé inconnu reste sans proposition', sans.EQ004.__statut==='revoir' && sans.EQ004.__code===null && sans.EQ006.__statut==='absent');
const avecRegle = await parRepere(sqlAvecRegle);
ok('SQL réel : la règle de mots-clés attrape ce qu’aucune ressemblance ne trouve', avecRegle.EQ006.__code==='PMP-C' && avecRegle.EQ006.__statut==='office' && /^regle:/.test(String(avecRegle.EQ006.__origine)));
ok('SQL réel : sans synonymes, le jargon du site n’est pas reconnu', sans.EQ008.__statut!=='office' && sans.EQ009.__code!=='VAN-P');
const avec = await parRepere(sqlAvecSynonymes);
ok('SQL réel : les variantes déclarées rattrapent le jargon — « groupe motopompe centrif » = pompe centrifuge', avec.EQ008.__code==='PMP-C' && avec.EQ008.__statut==='office');
ok('SQL réel : « electrovanne papillon » retrouve la vanne papillon', avec.EQ009.__code==='VAN-P');
ok('SQL réel : ce qui marchait sans synonymes marche toujours avec', avec.EQ001.__code==='PMP-C' && avec.EQ005.__code==='ECH-P');
const tranchee = await parRepere(sqlAvecDecision);
ok('SQL réel : une décision de revue l’emporte sur tout le reste', tranchee.EQ004.__code==='VAN-P' && tranchee.EQ004.__origine==='decision' && tranchee.EQ004.__statut==='office');
const revue = await requete(sqlRevue);
ok('SQL réel : la revue propose au plus trois candidats par ligne, le plus probable en tête', revue.length>0 && revue.every(l=>Number(l.score)>0) && revue.filter(l=>Number(l.rang)===4).length<=3);
ok('SQL réel : les propositions restent dans la famille de la ligne', revue.filter(l=>Number(l.rang)===4).every(l=>String(l.chemin).startsWith('VANNES')));

let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
process.exit(fail||perr.length?1:0);
