import fs from 'fs';
// Fiche de qualité d'un objet métier : une synthèse courte à partir de ce que
// l'audit sait déjà faire. Deux moitiés : les calculs purs (note, points faibles,
// export) vérifiés dans la page, et le SQL des taux exécuté sur un vrai DuckDB.
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
  state.tables['s0']={id:'s0',name:'EQUIPEMENTS',type:'csv',status:'ready',
    headers:['REPERE','LIBELLE','FAMILLE','SITE'],config:{},columnsMeta:{}};
  state.governance.businessObjects.push({ id:'boq', name:'Équipement', definition:'', globalOwner:'',
    contributors:[], producedBy:[], sources:[{table:'EQUIPEMENTS',role:'maitre'}], structure:[],
    elements:[
      {id:'q1',name:'Repère',definition:'Le repère unique',mappings:[{table:'EQUIPEMENTS',col:'REPERE'}],usedBy:[]},
      {id:'q2',name:'Libellé',definition:'',mappings:[{table:'EQUIPEMENTS',col:'LIBELLE'}],usedBy:[]},
      {id:'q3',name:'Famille',definition:'',mappings:[],usedBy:[]}] });

  // ---- La note et les points faibles, sans toucher aux données ----
  const mesures = {
    completude: { taux: 80, remplies: 8, lignes: 10, details:[
      {nom:'Libellé',table:'EQUIPEMENTS',col:'LIBELLE',taux:60},{nom:'Repère',table:'EQUIPEMENTS',col:'REPERE',taux:100}] },
    conformite: { taux: 95, controles: 100, defauts: 5, enDefaut: 1, details:[] },
    techniques: { taux: 10, lignes: 10, enTrop: 1, groupes: 1, table:'EQUIPEMENTS' },
    fonctionnels: { taux: null, raison: 'Aucune clé fonctionnelle déclarée pour « EQUIPEMENTS ».' },
    description: { total: 3, decrites: 1, branchees: 2, tauxDecrites: 33.3, tauxBranchees: 66.7,
      sansDefinition:['Libellé','Famille'], sansColonne:['Famille'] },
    gouvernance: { faits: 4, total: 8, taux: 50 }
  };
  const indicateurs = fqIndicateurs(mesures);
  ok('sept indicateurs, dans l’ordre où on les lit',
    indicateurs.map(i=>i.cle).join('|')==='completude|regles|dbTech|dbFonc|definitions|branchees|gouvernance');

  ok('les doublons comptent à l’envers : 10 % de doublons valent 90 de note',
    fqNote([{taux:10,inverse:true},{taux:90}])===90);
  ok('un indicateur non mesurable ne compte pas dans la note, au lieu de la tirer à zéro',
    fqNote([{taux:80},{taux:null},{taux:undefined}])===80
    && fqNote([{taux:null}])===null);
  // 80, 95, 90 (100-10), —, 33.3, 66.7, 50 → moyenne sur six = 69
  ok('la note d’ensemble est la moyenne des six indicateurs mesurables', fqNote(indicateurs)===69);

  const aFaire = fqAFaireDabord(indicateurs);
  ok('les points faibles sont rangés du plus faible au moins faible, et disent où agir',
    aFaire.length===4 && aFaire.map(x=>Math.round(x.note)).join('|')==='33|50|67|80'
    && /Informations définies/.test(aFaire[0].nom) && /Informations/.test(aFaire[0].ou));
  ok('un indicateur au vert n’apparaît pas dans les choses à faire',
    !aFaire.some(x=>/Conformité/.test(x.nom)) && !aFaire.some(x=>/techniques/.test(x.nom)));
  ok('la clé fonctionnelle absente est dite, pas comptée',
    /Aucune clé fonctionnelle/.test(indicateurs.find(i=>i.cle==='dbFonc').phrase)
    && !aFaire.some(x=>/fonctionnels/.test(x.nom)));

  // ---- Ce qui est décrit et ce qui est branché, lu sur la fiche ----
  const bo = state.governance.businessObjects.find(x=>x.id==='boq');
  const decrit = fqDescription(bo);
  ok('les informations définies et alimentées sont comptées sur la fiche même',
    decrit.total===3 && decrit.decrites===1 && decrit.branchees===2
    && decrit.sansColonne.join('|')==='Famille' && decrit.sansDefinition.join('|')==='Libellé|Famille');

  // ---- Le rendu ----
  const fiche = { objet:'Équipement', date:'', indicateurs, note: fqNote(indicateurs),
    aFaire, mesures };
  const boite = document.createElement('div'); boite.innerHTML = fqRendre(fiche); document.body.appendChild(boite);
  ok('la fiche montre la note, les sept indicateurs et les choses à faire',
    /69\/100/.test(boite.textContent) && boite.querySelectorAll('.h-1\\.5').length===7
    && /À corriger en premier/.test(boite.textContent));
  // Un taux bas doit se VOIR : la couleur est écrite dans le style, pas dans une
  // classe qui peut disparaître de la feuille construite (le rouge avait disparu).
  const barres = [...boite.querySelectorAll('.h-1\\.5 > div')].map(d=>d.getAttribute('style'));
  ok('chaque barre porte sa largeur ET sa couleur en clair, y compris la rouge',
    barres.length===7 && barres.every(st=>/width:/.test(st) && /background:#/.test(st))
    && barres.some(st=>/#ef4444/.test(st)) && barres.some(st=>/#10b981/.test(st))
    && /width:0%/.test(barres[3]));

  ok('les informations les moins remplies sont nommées, avec leur colonne',
    /Les informations les moins remplies/.test(boite.textContent)
    && /Libellé/.test(boite.textContent) && /EQUIPEMENTS.LIBELLE/.test(boite.textContent));

  // ---- La check-list de gouvernance est partagée avec l'audit ----
  ok('la check-list de gouvernance est une seule liste, utilisée des deux côtés',
    boControlesDeGouvernance(bo).length===8
    && boControlesDeGouvernance(bo).every(c=>Array.isArray(c) && typeof c[0]==='string'));

  // ---- L'export ----
  let nomFichier='', contenu='';
  const vraiTelechargement = downloadTextFile;
  window.downloadTextFile = (n,t)=>{ nomFichier=n; contenu=t; };
  fqDerniereFiche = fiche; fqExporterCsv();
  window.downloadTextFile = vraiTelechargement;
  ok('la fiche s’exporte en CSV : une ligne par indicateur, plus la note',
    /^qualite_Équipement\.csv$/.test(nomFichier)
    && contenu.split('\n')[0]==='"Indicateur";"Taux (%)";"Détail";"Où agir"'
    && contenu.split('\n').length===10 && /"Note globale";"69"/.test(contenu));

  // ---- Le bouton est bien sur l'onglet Audit ----
  govState.selectedBoId='boq'; v11State.edit['bo:boq']=true; switchTab(20); openGovTab('objects');
  await new Promise(r=>setTimeout(r,200)); setBoTab('audit'); await new Promise(r=>setTimeout(r,250));
  const bouton = document.querySelector('[onclick^="fqCalculer("]');
  ok('le bouton « Fiche de qualité » est sur l’onglet Audit, au-dessus de l’audit détaillé',
    !!bouton && !!el('bo-fiche-qualite-boq'));

  // Le SQL des taux est vérifié dehors, sur un vrai moteur.
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
});

// ---- Les taux, calculés par un vrai DuckDB sur des données volontairement sales ----
const { DuckDBInstance } = await import('@duckdb/node-api');
const conn = await (await DuckDBInstance.create(':memory:')).connect();
const requete = async sql => (await (await conn.run(sql)).getRowObjects());
await requete(`CREATE TABLE "t_s0" ("REPERE" VARCHAR, "LIBELLE" VARCHAR, "FAMILLE" VARCHAR, "SITE" VARCHAR)`);
// 6 lignes : une case vide, une case à espaces, et deux lignes rigoureusement identiques.
await requete(`INSERT INTO "t_s0" VALUES
  ('E1','Pompe','P','A'), ('E2','','P','A'), ('E3','   ','V','B'),
  ('E4','Vanne','V','B'), ('E1','Pompe bis','P','A'), ('E4','Vanne','V','B')`);
const ok=(n,c)=>out.push([n,!!c]);

const completude = await requete(`SELECT COUNT(*)::BIGINT AS lignes,
  COUNT(*) FILTER (WHERE "LIBELLE" IS NOT NULL AND TRIM(CAST("LIBELLE" AS VARCHAR)) <> '')::BIGINT AS c0
  FROM "t_s0"`);
ok('SQL réel : une case vide ET une case qui ne contient que des espaces comptent comme non remplies',
  Number(completude[0].lignes)===6 && Number(completude[0].c0)===4);

const techniques = await requete(`WITH g AS (
    SELECT COUNT(*)::BIGINT AS n FROM "t_s0" GROUP BY "REPERE", "LIBELLE", "FAMILLE", "SITE")
  SELECT COALESCE(SUM(n),0)::BIGINT AS lignes,
         COALESCE(SUM(CASE WHEN n > 1 THEN n - 1 ELSE 0 END),0)::BIGINT AS enTrop,
         COUNT(*) FILTER (WHERE n > 1)::BIGINT AS groupes FROM g`);
ok('SQL réel : les doublons techniques comptent les lignes rigoureusement identiques (E4 deux fois)',
  Number(techniques[0].lignes)===6 && Number(techniques[0].enTrop)===1 && Number(techniques[0].groupes)===1);

const fonctionnels = await requete(`WITH s AS (SELECT concat_ws(chr(31), COALESCE(TRIM(CAST("REPERE" AS VARCHAR)),'')) AS ke FROM "t_s0"),
  g AS (SELECT ke, COUNT(*)::BIGINT AS n FROM s WHERE ke IS NOT NULL AND ke <> '' GROUP BY 1)
  SELECT COALESCE(SUM(n),0)::BIGINT AS lignes,
         COALESCE(SUM(CASE WHEN n > 1 THEN n - 1 ELSE 0 END),0)::BIGINT AS enTrop,
         COUNT(*) FILTER (WHERE n > 1)::BIGINT AS groupes FROM g`);
ok('SQL réel : sur la clé REPERE, E1 et E4 font deux doublons fonctionnels — dont un que le technique ne voit pas',
  Number(fonctionnels[0].lignes)===6 && Number(fonctionnels[0].enTrop)===2 && Number(fonctionnels[0].groupes)===2);

await b.close();
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
process.exit(fail||perr.length?1:0);
