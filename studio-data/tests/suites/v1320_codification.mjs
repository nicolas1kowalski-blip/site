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
  ['EQ001','Pompe centrifuge alimentaire','POMPES','','PC ALIM'],
  ['EQ002','POMPE  CENTRIFUGE (X2)','POMPES','','PC X2'],
  ['EQ003','Vanne papillon DN100','VANNES','','VP DN100'],
  ['EQ004','Vanne DN80','VANNES','','VP DN80'],
  ['EQ005','Échangeur à plaques','ECHANGEURS','ECH-P','EP 12'],
  ['EQ006','Bidule non identifiable','POMPES','','ZZZ'],
  ['EQ007','Pompe à vide','POMPES','','PV 3'],
  ['EQ008','Groupe motopompe centrif','POMPES','','PC 7'],
  ['EQ009','Electrovanne papillon DN50','VANNES','','VP DN50']
];
const NOMENCLATURE = [
  ['POMPES','Transfert','Centrifuge','Pompe centrifuge','PMP-C','PC'],
  ['POMPES','Vide','Anneau liquide','Pompe a vide','PMP-V','PV'],
  ['VANNES','Sectionnement','Quart de tour','Vanne papillon','VAN-P','VP'],
  ['VANNES','Reglage','Lineaire','Vanne de reglage','VAN-R','VR'],
  ['ECHANGEURS','Thermique','Plaques','Echangeur a plaques','ECH-P','EP']
];

const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  state.tables['eq']={id:'eq',name:'equipements.csv',type:'csv',status:'ready',headers:['REPERE','LIBELLE','FAMILLE','CODE_FOURNI','DESIGNATION'],config:{},columnsMeta:{}};
  state.tables['nm']={id:'nm',name:'nomenclature.csv',type:'csv',status:'ready',headers:['FAMILLE','SYSTEME','SOUS_SYSTEME','LIBELLE_TYPE','CODE_TYPE','ABREGE'],config:{},columnsMeta:{}};
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
  ok('la recherche est enfermée dans la branche de la famille', /__branche_liste = types\.__branche_type/.test(v13ConditionDeBranche(C())) && v13ConditionDeBranche({}) === 'TRUE');
  ok('la branche est préparée une fois par ligne, des deux côtés', /FAMILLE.*AS __branche_liste/s.test(v13ListePreparee(C(),'reconnues r')) && /FAMILLE.*AS __branche_type/s.test(v13TypesPrepares(C(),'"t_nm"')));

  // ---- ce que l'on compare, des deux côtés
  ok('sans rien de déclaré, on compare le libellé de la liste au libellé de la nomenclature', (()=>{ const r=v13ComparaisonsRetenues(C()); return r.length===1 && r[0].colonneSource==='LIBELLE' && r[0].colonneNomenclature==='LIBELLE_TYPE'; })());
  v13AjouterUneComparaison(C().id); await wait(100);
  const comparaison = C().comparaisons[0];
  v13EcrireDansLaComparaison(C().id, comparaison.id, 'colonneSource', 'DESIGNATION');
  v13EcrireDansLaComparaison(C().id, comparaison.id, 'colonneNomenclature', 'ABREGE');
  v13EcrireDansLaComparaison(C().id, comparaison.id, 'poids', '3'); await wait(100);
  ok('une comparaison se relit à voix haute, avec son poids', v13PhraseDeLaComparaison(C().comparaisons[0])==='DESIGNATION contre ABREGE, poids 3' && /DESIGNATION contre ABREGE, poids 3/.test(el('step-17').querySelector('.v13-codif-phrase-comparaison').textContent));
  ok('une comparaison à moitié saisie est ignorée, et l’on retombe sur le libellé', v13ComparaisonsRetenues({ colonneLibelle:'LIBELLE', colonneLibelleRef:'LIBELLE_TYPE', comparaisons:[{id:'x',colonneSource:'DESIGNATION',colonneNomenclature:''}] })[0].id==='defaut');
  ok('le score devient une moyenne pondérée des comparaisons déclarées', /^\(3 \* \(/.test(v13ScoreDeRessemblance(C())) && /\) \/ 3$/.test(v13ScoreDeRessemblance(C())));
  window.__sqlAutreAttribut = v13SqlDeCodification(Object.assign({}, C(), { synonymes: [], regles: [] }));
  C().comparaisons = [];

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

  // ---- la préparation : canoniser et découper une fois par ligne, jamais par couple
  ok('les deux côtés sont préparés avant d’être comparés : un texte canonisé, puis ses mots', /string_split\(pretes\.__texte_liste_0, ' '\) AS __mots_liste_0/.test(v13ListePreparee(C(),'reconnues r')) && /string_split\(pretes\.__texte_type_0, ' '\) AS __mots_type_0/.test(v13TypesPrepares(C(),'"t_nm"')));
  ok('le score ne recanonise ni ne redécoupe rien : il lit les colonnes préparées', !/strip_accents|string_split/.test(v13ScoreDeRessemblance(C())) && /__mots_liste_0/.test(v13ScoreDeRessemblance(C())));
  ok('les deux meilleurs voisins sont retenus par regroupement, sans trier tous les couples', /max_by\(__code_voisin, CASE WHEN __meme_branche.*, 2\)/.test(v13SqlDeCodification(C())) && !/PARTITION BY __rn ORDER BY __score_voisin/.test(v13SqlDeCodification(C())));
  ok('le meilleur voisin hors branche est gard\u00e9 lui aussi, pour pouvoir le dire', /__score_hors/.test(v13SqlDeCodification(C())) && /__code_autre_branche/.test(v13SqlDeCodification(C())));
  ok('deux types au m\u00eame score ne sont pas tranch\u00e9s d\'office', /__scores_voisins\[2\] = candidats\.__scores_voisins\[1\]/.test(v13SqlDeCodification(C())));
  ok('le bilan compte \u00e0 part les lignes trouv\u00e9es dans une autre branche', (()=>{ const b=v13BilanDeCodification([{statut:'office',lignes:5},{statut:'branche',lignes:2},{statut:'absent',lignes:1}]);
    return b.branche===2 && b.total===8 && /2 trouv\u00e9e\(s\) dans une autre branche/.test(b.phrase); })());
  ok('et l\'\u00e9cran dit quoi faire de ces lignes-l\u00e0 en priorit\u00e9', /AUTRE branche que leur famille/.test(v13ProchaineAction({total:8,office:5,branche:2,revoir:0,absent:1})));

  // ---- la famille d\u2019abord, puis l\u2019\u00e9largissement
  ok('on montre huit propositions par d\u00e9faut, et le nombre se r\u00e8gle', v13CombienDePropositions({})===8
    && v13CombienDePropositions({propositions:12})===12 && v13CombienDePropositions({propositions:0})===1
    && v13CombienDePropositions({propositions:99})===V13_PROPOSITIONS_MAXIMUM);
  ok('le quota de la famille et celui de l\u2019\u00e9largissement sont s\u00e9par\u00e9s', (()=>{ const sql=v13SqlDesCasARevoir(C(), 50, 'v13_codee');
    return /PARTITION BY rang, memeBranche ORDER BY score DESC/.test(sql) && /CASE WHEN memeBranche THEN 8 ELSE 3 END/.test(sql); })());
  ok('le r\u00e9glage est offert \u00e0 l\'\u00e9cran, \u00e0 c\u00f4t\u00e9 des seuils', !!el('v13-codif-propositions'));
  ok('et le r\u00e9capitulatif le dit', /8 dans la famille de la ligne, puis 3 prises ailleurs/.test(
    (v13RecapDeLaCodification(C()).find(l=>l.intitule==='Propositions montr\u00e9es')||{}).valeur||''));

  // ---- dire ce qui cloche quand la famille et l\u2019arbre se contredisent
  ok('la phrase du d\u00e9saccord nomme l\u2019origine du code, la famille de la ligne et celles du code', (()=>{
    const dite = v13PhraseDuDesaccord({ __code:'PMP-C', __origine:'existant', __branche_trouvee:'POMPES, UTILITES', FAMILLE:'VANNES' }, C());
    return /code d\u00e9j\u00e0 fourni/.test(dite) && /VANNES/.test(dite) && /POMPES, UTILITES/.test(dite) && /PMP-C/.test(dite); })());
  ok('et quand rien n\u2019a \u00e9t\u00e9 trouv\u00e9 sous la famille, elle le dit autrement', (()=>{
    const dite = v13PhraseDuDesaccord({ __code:null, __code_autre_branche:'PMP-C', __origine:'aucune', __branche_trouvee:'POMPES', FAMILLE:'VANNES' }, C());
    return /Rien ne correspond sous/.test(dite) && /VANNES/.test(dite) && /POMPES/.test(dite); })());
  ok('une ligne sans d\u00e9saccord ne produit aucune phrase', v13PhraseDuDesaccord({ __code:null, __code_autre_branche:null }, C())==='');

  // ---- le pluriel ne doit plus s\u00e9parer deux mots identiques
  ok('un mot au pluriel est ramen\u00e9 au singulier, \u00e0 partir de quatre lettres', v13AuSingulier('POMPES')==='POMPE' && v13AuSingulier('VANNES')==='VANNE'
    && v13AuSingulier('CHEVAUX')==='CHEVAU' && v13AuSingulier('VIS')==='VIS' && v13AuSingulier('BAC')==='BAC');
  ok('le libell\u00e9 est rang\u00e9 au singulier avant tout le reste', v13MotRetenuDuTexte('Pompes centrifuges ALIM.', C())==='POMPE CENTRIFUGE ALIM');
  ok('et le SQL fait le m\u00eame passage au singulier des deux c\u00f4t\u00e9s', (()=>{ const sql=v13SqlDeCodification(C());
    return (sql.match(/ends_with\(mot, 'S'\)/g)||[]).length >= 2; })());

  // ---- une question par libellé, pas une par ligne
  ok('la revue regroupe par libell\u00e9 et sert les plus fr\u00e9quents d\'abord', (()=>{ const sql=v13SqlDesCasARevoir(C(), 50, 'v13_codee');
    return /clesARevoir AS \(/.test(sql) && /GROUP BY 1 ORDER BY __combien DESC/.test(sql) && /__combien AS combien/.test(sql); })());
  ok('un libell\u00e9 \u00e9cart\u00e9 \u00e0 la main n\'est plus repropos\u00e9', (()=>{ const refuse=Object.assign({}, C(), { refus: v13RefusApresDecision(C(), 'Bidule non identifiable') });
    return refuse.refus.includes('BIDULE NON IDENTIFIABLE') && /NOT IN \('BIDULE NON IDENTIFIABLE'\)/.test(v13SqlDesCasARevoir(refuse, 50, 'v13_codee')); })());
  ok('et l\'on peut revenir dessus : le libell\u00e9 redevient une question', (()=>{ const refuse=Object.assign({}, C(), { refus: ['BIDULE NON IDENTIFIABLE', 'AUTRE CHOSE'] });
    const rendu=v13RefusSansLeLibelle(refuse, 'bidule non identifiable'); return rendu.length===1 && rendu[0]==='AUTRE CHOSE'; })());
  ok('une d\u00e9cision est rang\u00e9e sous le libell\u00e9, donc elle vaut pour toutes ses \u00e9critures', (()=>{
    const apres=v13CorrespondanceApresDecision(C(), 'POMPE  CENTRIFUGE (X2)', 'PMP-C');
    return apres.length===1 && v13MotRetenuDuTexte(apres[0].libelle, C())==='POMPE CENTRIFUGE X2'; })());

  // ---- les choix faits, relus sans rien déplier, et gardés d’une session à l’autre
  ok('le r\u00e9capitulatif dit en fran\u00e7ais ce que l\'on code et contre quoi', (()=>{ const r=v13RecapDeLaCodification(C());
    const ligne = intitule => (r.find(x=>x.intitule===intitule)||{}).valeur || '';
    return /equipements\.csv \u00b7 colonne LIBELLE/.test(ligne('\u00c0 coder')) && /nomenclature\.csv \u00b7 code CODE_TYPE/.test(ligne('Contre'))
      && /FAMILLE \u203a SYSTEME/.test(ligne('Chemin de l\u2019arbre')) && /FAMILLE doit correspondre \u00e0 FAMILLE/.test(ligne('Branche')); })());
  ok('le r\u00e9capitulatif est affich\u00e9 en haut de l\'\u00e9cran, pas cach\u00e9 dans les r\u00e9glages', (()=>{ const bloc=el('v13-codif-recap');
    return bloc && /Ce que fait cette codification/.test(bloc.textContent) && /equipements\.csv/.test(bloc.textContent); })());
  ok('le d\u00e9compte rassure quand il est juste, et alerte quand il ne l\'est pas',
    /9 ligne\(s\) en entr\u00e9e, autant en sortie/.test(v13PhraseDuDecompte(9, 9)) && /\u26a0/.test(v13PhraseDuDecompte(9, 27)));
  ok('les param\u00e9trages de codification sont sauvegard\u00e9s avec le reste', (()=>{ const garde=collectPersistedConfig();
    return Array.isArray(garde.codifications) && garde.codifications.some(x=>x.id===C().id && x.colonneLibelle==='LIBELLE'); })());
  ok('et ils sont relus au retour', (()=>{ const garde=collectPersistedConfig(); const avant=state.codifications;
    state.codifications=[]; applyPersistedConfig(garde); const revenu=state.codifications.some(x=>x.id===avant[0].id && x.nomenclature==='nomenclature.csv');
    state.codifications=avant; return revenu; })());

  // ---- la mémoire du navigateur, quand elle ne suffit pas
  ok('une erreur de mémoire est traduite en français, avec quoi faire', /la mémoire du navigateur n’a pas suffi/.test(v13PhraseDeLErreur(new Error('Invalid Error: HTML FileReaders do not support writing'))) && /Chercher dans la bonne branche/.test(v13PhraseDeLErreur(new Error('Out of Memory Error'))));
  ok('une erreur ordinaire est rendue telle quelle, sans bavardage', v13PhraseDeLErreur(new Error('Colonne inconnue'))==='Colonne inconnue');
  ok('la codification s\'ex\u00e9cute sans jamais d\u00e9border sur disque', /v12State\.noSpill\+\+/.test(String(v13CoderLaListe)) && /v12State\.noSpill--/.test(String(v13CoderLaListe)));
  ok('les d\u00e9coupages en mots ne sont calcul\u00e9s qu\'une fois, quoi qu\'il en co\u00fbte \u00e0 les relire', (v13SqlDesRapprochables(C()).match(/AS MATERIALIZED/g)||[]).length===2);

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
  window.__sqlRevueAilleurs = v13SqlDesCasARevoir(Object.assign({}, C(), { synonymes: [], regles: [] }), 50);
  window.__sqlCodeFourni = v13SqlDeCodification(Object.assign({}, C(), { synonymes: [], regles: [], colonneCodeExistant: 'CODE_FOURNI', niveaux: ['FAMILLE','LIBELLE_TYPE'] }));
  const largement = Object.assign({}, C(), { synonymes: [], regles: [], seuilRevoir: 0.2, niveaux: ['FAMILLE','LIBELLE_TYPE'] });
  window.__sqlLargeRevue = { code: v13SqlDeCodification(largement), revue: v13SqlDesCasARevoir(largement, 50, 'v13_codee') };
  const decidee = Object.assign({}, C(), { synonymes: [], regles: [] });
  window.__sqlDecisionGroupee = v13SqlDeCodification(Object.assign({}, decidee, {
    correspondances: v13CorrespondanceApresDecision(decidee, 'Pompe alim', 'PMP-C') }));
  window.__sqlAvecDecision = v13SqlDeCodification(Object.assign({}, avecTout, { decisions: { 4: 'VAN-P' } }));
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
});
const sqlSansSynonymes = await p.evaluate(()=>window.__sqlSansSynonymes);
const sqlAutreAttribut = await p.evaluate(()=>window.__sqlAutreAttribut);
const sqlAvecRegle = await p.evaluate(()=>window.__sqlAvecRegle);
const sqlAvecSynonymes = await p.evaluate(()=>window.__sqlAvecSynonymes);
const sqlRevue = await p.evaluate(()=>window.__sqlRevue);
const v13SqlRevueAilleurs = await p.evaluate(()=>window.__sqlRevueAilleurs);
const sqlDecisionGroupee = await p.evaluate(()=>window.__sqlDecisionGroupee);
const sqlCodeFourni = await p.evaluate(()=>window.__sqlCodeFourni);
const sqlLargeRevue = await p.evaluate(()=>window.__sqlLargeRevue);
const sqlAvecDecision = await p.evaluate(()=>window.__sqlAvecDecision);
await b.close();

// ---- le SQL produit par l'écran, exécuté sur un vrai DuckDB ----
const { DuckDBInstance } = await import('@duckdb/node-api');
const instance = await DuckDBInstance.create(':memory:'); const conn = await instance.connect();
const requete = async sql => (await (await conn.run(sql)).getRowObjects());
const valeurs = lignes => lignes.map(ligne => '(' + ligne.map(v => `'${String(v).replace(/'/g,"''")}'`).join(', ') + ')').join(', ');
await requete(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ${valeurs(EQUIPEMENTS)}) v(REPERE,LIBELLE,FAMILLE,CODE_FOURNI,DESIGNATION)`);
await requete(`CREATE TABLE "t_nm" AS SELECT * FROM (VALUES ${valeurs(NOMENCLATURE)}) v(FAMILLE,SYSTEME,SOUS_SYSTEME,LIBELLE_TYPE,CODE_TYPE,ABREGE)`);
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
// La revue relit la table codée plutôt que de recoder la liste : il faut donc la déposer d'abord.
await requete(`CREATE OR REPLACE TABLE "v13_codee" AS\n${sqlSansSynonymes}`);
const revue = await requete(sqlRevue);
ok('SQL réel : la revue propose au plus trois candidats par ligne, le plus probable en tête', revue.length>0 && revue.every(l=>Number(l.score)>0) && revue.filter(l=>Number(l.rang)===4).length<=3);
ok('SQL réel : les propositions restent dans la famille de la ligne', revue.filter(l=>Number(l.rang)===4).every(l=>String(l.chemin).startsWith('VANNES')));

const autreAttribut = await parRepere(sqlAutreAttribut);
ok('SQL réel : le rapprochement porte sur la désignation contre l’abrégé, et non plus sur les libellés', autreAttribut.EQ004.__code==='VAN-P' && autreAttribut.EQ004.__origine==='ressemblance');
ok('SQL réel : ce qui ne ressemble à aucun abrégé reste sans proposition', autreAttribut.EQ006.__statut==='absent');

// ---- le volume : ce qui décidait de tout, c'est que la requête se termine ----
// Sur le terrain, la liste fait des milliers de lignes et la nomenclature des centaines. Sans blocage par
// les mots rares, on comparerait chaque ligne à chaque type : la requête ne rendait jamais la main.
const grosse = await (await DuckDBInstance.create(':memory:')).connect();
const requeteGrosse = async sql => (await (await grosse.run(sql)).getRowObjects());
await requeteGrosse(`CREATE TABLE "t_nm" AS SELECT 'POMPES' AS FAMILLE, 'Transfert' AS SYSTEME,
    'Centrifuge' AS SOUS_SYSTEME, 'Pompe centrifuge modele ' || i AS LIBELLE_TYPE,
    'PMP-' || i AS CODE_TYPE, 'PC' || i AS ABREGE FROM range(800) t(i)`);
await requeteGrosse(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, 'EQ' || i AS REPERE,
    'Pompe centrifuge modele ' || (i % 800) AS LIBELLE, 'POMPES' AS FAMILLE, '' AS CODE_FOURNI,
    'PC' || (i % 800) AS DESIGNATION FROM range(4000) t(i)`);
const depart = Date.now();
const bilanGros = await requeteGrosse(`SELECT __statut AS statut, COUNT(*)::BIGINT AS lignes FROM (\n${sqlSansSynonymes}\n) codee GROUP BY __statut`);
const secondes = (Date.now() - depart) / 1000;
const compte = statut => Number((bilanGros.find(l => String(l.statut) === statut) || {}).lignes || 0);
console.log(`   codification de 4 000 lignes contre 800 types : ${secondes.toFixed(1)} s`);
ok('SQL réel : 4 000 lignes contre 800 types se codent en moins de 30 secondes', secondes < 30);
ok('SQL réel : le blocage par les mots rares ne perd pas les lignes — toutes sont rendues', compte('office') + compte('revoir') + compte('absent') === 4000);
ok('SQL réel : sur ce volume, presque tout est codé d’office', compte('office') >= 3900);

// ---- un code fourni qui désigne une autre branche que la famille de la ligne ----
// La vérification de branche ne portait que sur la ressemblance. Un code déjà présent dans la liste, une
// règle ou un libellé appris passaient sans contrôle : la ligne ressortait codée d'office avec un chemin
// qui commençait par une autre famille que la sienne, sans un mot.
const contredit = await (await DuckDBInstance.create(':memory:')).connect();
const verifie = async sql => (await (await contredit.run(sql)).getRowObjects());
// Le m\u00eame code figure sous DEUX familles de l'arbre : la question n'est pas \u00ab est-ce CETTE famille \u00bb
// mais \u00ab ce code existe-t-il sous la famille de la ligne \u00bb.
await verifie(`CREATE TABLE "t_nm" AS SELECT * FROM (VALUES
  ('POMPES','Transfert','C','Pompe centrifuge','PMP-C','PC'),
  ('UTILITES','Eau glacee','C','Pompe centrifuge','PMP-C','PC'),
  ('VANNES','Sectionnement','Q','Vanne papillon','VAN-P','VP')
) v(FAMILLE,SYSTEME,SOUS_SYSTEME,LIBELLE_TYPE,CODE_TYPE,ABREGE)`);
await verifie(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES
  ('E1','Materiel divers','UTILITES','PMP-C',''),
  ('E2','Materiel divers','POMPES','PMP-C',''),
  ('E3','Materiel divers','VANNES','PMP-C','')
) v(REPERE,LIBELLE,FAMILLE,CODE_FOURNI,DESIGNATION)`);
const fournis = Object.fromEntries((await verifie(`SELECT REPERE, FAMILLE, __code, __origine, __statut, __branche_trouvee, __chemin FROM (\n${sqlCodeFourni}\n) f`)).map(l => [String(l.REPERE), l]));
ok('SQL r\u00e9el : un code qui existe sous la famille de la ligne n\u2019est PAS signal\u00e9, m\u00eame s\u2019il existe ailleurs aussi',
  fournis.E1.__statut === 'office' && fournis.E2.__statut === 'office');
ok('SQL r\u00e9el : et chacune re\u00e7oit le chemin de SA famille, pas celui d\u2019une autre',
  /^UTILITES/.test(String(fournis.E1.__chemin)) && /^POMPES/.test(String(fournis.E2.__chemin)));
ok('SQL r\u00e9el : un code absent de la famille de la ligne est signal\u00e9, pas cod\u00e9 d\u2019office en silence', fournis.E3.__statut === 'branche');
ok('SQL r\u00e9el : et l\u2019on nomme TOUTES les familles o\u00f9 ce code existe, pas une au hasard',
  String(fournis.E3.__branche_trouvee) === 'POMPES, UTILITES');
ok('SQL r\u00e9el : le code est conserv\u00e9, on ne d\u00e9truit pas l\u2019information', String(fournis.E3.__code) === 'PMP-C');
ok('SQL r\u00e9el : et l\u2019origine dit que le code venait de la liste', String(fournis.E3.__origine) === 'existant');

// ---- la famille de la ligne servie la première, et largement ----
// Trois propositions en tout : dès qu'un type d'une autre famille se gliçait dans le lot, il prenait la
// place d'un candidat légitime. La famille de la ligne a désormais son propre quota, servi en premier.
const large = await (await DuckDBInstance.create(':memory:')).connect();
const propose = async sql => (await (await large.run(sql)).getRowObjects());
await propose(`CREATE TABLE "t_nm" AS
  SELECT 'POMPES' AS FAMILLE, 'S' AS SYSTEME, 'SS' AS SOUS_SYSTEME, 'Pompe ' || mot AS LIBELLE_TYPE,
    'PMP-' || mot AS CODE_TYPE, 'PC' AS ABREGE
  FROM (VALUES ('centrifuge'),('volumetrique'),('peristaltique'),('doseuse'),('immergee'),('vide')) v(mot)
  UNION ALL SELECT 'UTILITES','S','SS','Pompe ' || mot || ' utilite','UTI-' || mot,'PU'
  FROM (VALUES ('centrifuge'),('doseuse')) v(mot)
  UNION ALL SELECT 'VANNES','S','SS','Pompe de vanne papillon','VAN-P','VP'`);
await propose(`CREATE TABLE "t_eq" AS SELECT 1 AS __rn, 'E1' AS REPERE, 'Pompe' AS LIBELLE, 'POMPES' AS FAMILLE,
  '' AS CODE_FOURNI, '' AS DESIGNATION`);
await propose(`CREATE OR REPLACE TABLE "v13_codee" AS\n${sqlLargeRevue.code}`);
const offertes = await propose(sqlLargeRevue.revue);
ok('SQL r\u00e9el : on propose bien plus que trois types quand la famille en offre plus',
  offertes.filter(l => l.memeBranche).length === 6);
ok('SQL r\u00e9el : la famille de la ligne passe enti\u00e8rement avant l\u2019\u00e9largissement',
  offertes.slice(0, 6).every(l => l.memeBranche === true) && offertes.slice(6).every(l => l.memeBranche === false));
ok('SQL r\u00e9el : l\u2019\u00e9largissement reste born\u00e9, il ne noie pas la famille', offertes.filter(l => !l.memeBranche).length === 3);

// ---- le même libellé n fois : une seule question, une seule décision ----
// Dans une liste reçue, le même libellé revient des centaines de fois. La revue posait la question
// ligne à ligne : cinquante places gaspillées en doublons d'une poignée de libellés.
const repetee = await (await DuckDBInstance.create(':memory:')).connect();
const consulte = async sql => (await (await repetee.run(sql)).getRowObjects());
await consulte(`CREATE TABLE "t_nm" AS SELECT * FROM (VALUES
  ('POMPES','Transfert','Centrifuge','Pompe centrifuge','PMP-C','PC')
) v(FAMILLE,SYSTEME,SOUS_SYSTEME,LIBELLE_TYPE,CODE_TYPE,ABREGE)`);
await consulte(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES
  ('EQ1','Pompe alim','POMPES','',''), ('EQ2','Pompe alim','POMPES','',''), ('EQ3','Pompe alim','POMPES','',''),
  ('EQ4','POMPE  ALIM.','POMPES','',''), ('EQ5','Vanne trois voies','POMPES','','')
) v(REPERE,LIBELLE,FAMILLE,CODE_FOURNI,DESIGNATION)`);
await consulte(`CREATE OR REPLACE TABLE "v13_codee" AS\n${sqlSansSynonymes}`);
const questions = await consulte(`SELECT DISTINCT rang, libelle, combien FROM (\n${sqlRevue}\n) v`);
ok('SQL r\u00e9el : quatre lignes du m\u00eame libell\u00e9 ne font qu\u2019UNE question', questions.length === 1 && Number(questions[0].combien) === 4);
ok('SQL r\u00e9el : et la question annonce combien de lignes elle couvre', Number(questions[0].combien) === 4);
const apresDecision = await consulte(`SELECT REPERE, __code, __origine FROM (\n${sqlDecisionGroupee}\n) f ORDER BY REPERE`);
const codees = apresDecision.filter(l => String(l.__code || '') === 'PMP-C');
ok('SQL r\u00e9el : une seule d\u00e9cision code les quatre lignes, quelle que soit leur \u00e9criture', codees.length === 4);
ok('SQL r\u00e9el : la ligne qui ne porte pas ce libell\u00e9 n\u2019est pas touch\u00e9e',
  String((apresDecision.find(l => String(l.REPERE) === 'EQ5') || {}).__code || '') === '');

// ---- la branche contredite, et les ex æquo : deux cas où la machine ne doit PAS trancher ----
// Une ligne dont la famille ne correspond à aucune branche du type trouvé n'est pas « non trouvée » :
// elle est trouvée AILLEURS, et c'est une contradiction entre la liste et l'arbre. Deux types à égalité
// parfaite ne se tranchent pas non plus — « moteur asynchrone » et « moteur synchrone » se ressemblent
// assez pour obtenir le même score, et choisir au hasard serait pire que demander.
const ailleurs = await (await DuckDBInstance.create(':memory:')).connect();
const interroge = async sql => (await (await ailleurs.run(sql)).getRowObjects());
await interroge(`CREATE TABLE "t_nm" AS SELECT * FROM (VALUES
  ('POMPES','Transfert','Centrifuge','Pompe centrifuge','PMP-C','PC'),
  ('VANNES','Sectionnement','Quart de tour','Vanne papillon','VAN-P','VP'),
  ('MOTEURS','Entrainement','Asynchrone','Moteur asynchrone','MOT-A','MA'),
  ('MOTEURS','Entrainement','Synchrone','Moteur synchrone','MOT-S','MS')
) v(FAMILLE,SYSTEME,SOUS_SYSTEME,LIBELLE_TYPE,CODE_TYPE,ABREGE)`);
await interroge(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES
  ('EQA','Pompe centrifuge','VANNES','',''),
  ('EQB','Pompe centrifuge','POMPES','',''),
  ('EQC','Moteur asynchrone','MOTEURS','','')
) v(REPERE,LIBELLE,FAMILLE,CODE_FOURNI,DESIGNATION)`);
const tranches = Object.fromEntries((await interroge(`SELECT REPERE, __code, __statut, __code_autre_branche, __branche_trouvee FROM (\n${sqlSansSynonymes}\n) f`)).map(l => [String(l.REPERE), l]));
ok('SQL r\u00e9el : une ligne dont la famille contredit l\u2019arbre n\u2019est plus \u00ab non trouv\u00e9e \u00bb, elle est signal\u00e9e',
  tranches.EQA.__statut === 'branche' && tranches.EQA.__code === null);
ok('SQL r\u00e9el : et l\u2019on dit quel type a \u00e9t\u00e9 trouv\u00e9, et sous quelle branche',
  String(tranches.EQA.__code_autre_branche) === 'PMP-C' && String(tranches.EQA.__branche_trouvee) === 'POMPES');
ok('SQL r\u00e9el : la m\u00eame ligne dans la bonne famille reste cod\u00e9e d\u2019office',
  tranches.EQB.__statut === 'office' && String(tranches.EQB.__code) === 'PMP-C');
ok('SQL r\u00e9el : deux types au m\u00eame score partent \u00e0 la revue au lieu d\u2019\u00eatre tir\u00e9s au sort',
  tranches.EQC.__statut === 'revoir' && tranches.EQC.__code === null);
await interroge(`CREATE OR REPLACE TABLE "v13_codee" AS\n${sqlSansSynonymes}`);
const propositions = await interroge(v13SqlRevueAilleurs);
ok('SQL r\u00e9el : la revue propose aussi ce qui a \u00e9t\u00e9 trouv\u00e9 hors branche, en le disant',
  propositions.some(l => Number(l.rang) === 1 && String(l.code) === 'PMP-C' && l.memeBranche === false));
ok('SQL r\u00e9el : les ex \u00e6quo arrivent \u00e0 la revue avec leurs deux propositions',
  propositions.filter(l => Number(l.rang) === 3).length >= 2);

// ---- le même code à plusieurs endroits de l'arbre : une ligne reçue, une ligne rendue ----
// Un même type d'équipement figure presque toujours sous plusieurs systèmes de l'arborescence. En
// joignant la nomenclature entière sur le code pour retrouver le chemin, chaque ligne codée ressortait
// autant de fois qu'il y avait de lignes portant ce code : 450 000 en entrée en rendaient 1 437 576.
const arbreRepete = await (await DuckDBInstance.create(':memory:')).connect();
const demande = async sql => (await (await arbreRepete.run(sql)).getRowObjects());
await demande(`CREATE TABLE "t_nm" AS SELECT * FROM (VALUES
  ('POMPES','Transfert','Centrifuge','Pompe centrifuge','PMP-C','PC'),
  ('POMPES','Alimentation','Centrifuge','Pompe centrifuge','PMP-C','PC'),
  ('POMPES','Secours','Centrifuge','Pompe centrifuge','PMP-C','PC'),
  ('VANNES','Sectionnement','Quart de tour','Vanne papillon','VAN-P','VP')
) v(FAMILLE,SYSTEME,SOUS_SYSTEME,LIBELLE_TYPE,CODE_TYPE,ABREGE)`);
await demande(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ${valeurs(EQUIPEMENTS)}) v(REPERE,LIBELLE,FAMILLE,CODE_FOURNI,DESIGNATION)`);
const rendues = Number((await demande(`SELECT COUNT(*)::BIGINT AS lignes FROM (\n${sqlSansSynonymes}\n) f`))[0].lignes);
ok('SQL r\u00e9el : un code pr\u00e9sent \u00e0 trois endroits de l\u2019arbre ne triple pas les lignes', rendues === EQUIPEMENTS.length);
const reperes = await demande(`SELECT REPERE, COUNT(*)::BIGINT AS lignes FROM (\n${sqlSansSynonymes}\n) f GROUP BY REPERE HAVING COUNT(*) > 1`);
ok('SQL r\u00e9el : aucun rep\u00e8re ne ressort deux fois', reperes.length === 0);
const chemin = await demande(`SELECT __chemin FROM (\n${sqlSansSynonymes}\n) f WHERE REPERE = 'EQ001'`);
ok('SQL r\u00e9el : le chemin de l\u2019arbre reste renseign\u00e9, une seule fois', /POMPES/.test(String(chemin[0].__chemin)));

// ---- le cas qui ne passait pas : des mots qui se ressemblent tous ----
// Une nomenclature où aucun mot n'est vraiment rare, et où les mots se confondent sur leurs premières
// lettres. C'est la forme des vrais référentiels d'équipements, et c'est celle qui faisait tomber la
// codification : le rapprochement ramenait plus de mille types par ligne, soit 22 millions de couples.
// On reproduit ici la contrainte du navigateur : mémoire plafonnée, aucune écriture sur le disque.
const VOCABULAIRE_QUI_SE_RESSEMBLE = `
CREATE TABLE "t_nm" AS
  WITH mots AS (SELECT i, 'MOT' || i AS mot FROM range(300) t(i))
  SELECT 'POMPES' AS FAMILLE, 'Transfert' AS SYSTEME, 'Centrifuge' AS SOUS_SYSTEME,
    'Pompe centrifuge ' || a.mot || ' ' || b.mot || ' ' || c.mot AS LIBELLE_TYPE,
    'PMP-' || n AS CODE_TYPE, 'PC' || n AS ABREGE
  FROM range(3000) t(n)
  JOIN mots a ON a.i = (n * 7) % 300 JOIN mots b ON b.i = (n * 13) % 300 JOIN mots c ON c.i = (n * 29) % 300;
CREATE TABLE "t_eq" AS
  WITH mots AS (SELECT i, 'MOT' || i AS mot FROM range(300) t(i))
  SELECT row_number() OVER () AS __rn, 'EQ' || m AS REPERE,
    'Pompe centrifuge ' || a.mot || ' ' || b.mot || ' ' || c.mot AS LIBELLE,
    'POMPES' AS FAMILLE, '' AS CODE_FOURNI, 'PC' || (m % 3000) AS DESIGNATION
  FROM range(20000) t(m)
  JOIN mots a ON a.i = (m * 7) % 300 JOIN mots b ON b.i = (m * 13) % 300 JOIN mots c ON c.i = (m * 29) % 300;`;

// ---- et le cas où chaque type a un mot bien à lui : le plafond ne doit rien perdre ----
const VOCABULAIRE_QUI_DISTINGUE = `
CREATE TABLE "t_nm" AS
  WITH rares AS (SELECT i, upper(substr(md5('r' || i), 1, 8)) AS mot FROM range(300) t(i)),
       courants AS (SELECT i, upper(substr(md5('c' || i), 1, 8)) AS mot FROM range(10) t(i))
  SELECT 'POMPES' AS FAMILLE, 'Transfert' AS SYSTEME, 'Centrifuge' AS SOUS_SYSTEME,
    'Pompe centrifuge ' || c.mot || ' ' || r.mot AS LIBELLE_TYPE,
    'PMP-' || n AS CODE_TYPE, 'PC' || n AS ABREGE
  FROM range(3000) t(n)
  JOIN rares r ON r.i = n % 300 JOIN courants c ON c.i = n // 300;
CREATE TABLE "t_eq" AS
  WITH rares AS (SELECT i, upper(substr(md5('r' || i), 1, 8)) AS mot FROM range(300) t(i)),
       courants AS (SELECT i, upper(substr(md5('c' || i), 1, 8)) AS mot FROM range(10) t(i))
  SELECT row_number() OVER () AS __rn, 'EQ' || m AS REPERE,
    'Pompe centrifuge ' || c.mot || ' ' || r.mot || ' installee' AS LIBELLE,
    'POMPES' AS FAMILLE, '' AS CODE_FOURNI, 'PC' || (m % 3000) AS DESIGNATION
  FROM range(20000) t(m)
  JOIN rares r ON r.i = (m % 3000) % 300 JOIN courants c ON c.i = (m % 3000) // 300;`;

/** Code 20 000 lignes contre 3 000 types dans un moteur bridé comme l'est le navigateur. */
async function coderSousContrainte(fixture) {
  const serree = await (await DuckDBInstance.create(':memory:')).connect();
  const demande = async sql => (await (await serree.run(sql)).getRowObjects());
  for (const ordre of fixture.split(';').map(s => s.trim()).filter(Boolean)) await demande(ordre);
  await demande("SET memory_limit='512MB'");
  await demande("SET temp_directory=''");
  const depart = Date.now();
  try { await demande(`CREATE TABLE "v13_codee" AS\n${sqlSansSynonymes}`); }
  catch (e) { return { tenu: false, secondes: (Date.now() - depart) / 1000, detail: String(e.message || e) }; }
  return { tenu: true, secondes: (Date.now() - depart) / 1000, demande };
}

const serre = await coderSousContrainte(VOCABULAIRE_QUI_SE_RESSEMBLE);
console.log(`   20 000 lignes contre 3 000 types, vocabulaire indistinct, 512 Mo : ${serre.tenu ? serre.secondes.toFixed(1) + ' s' : '\u00c9CHEC \u2014 ' + serre.detail}`);
ok('SQL r\u00e9el : une nomenclature dont aucun mot n\u2019est rare tient quand m\u00eame dans 512 Mo', serre.tenu);
if (serre.tenu)
  ok('SQL r\u00e9el : sous cette contrainte, les 20 000 lignes sont toutes rendues',
    Number((await serre.demande('SELECT COUNT(*)::BIGINT AS lignes FROM "v13_codee"'))[0].lignes) === 20000);

const distinct = await coderSousContrainte(VOCABULAIRE_QUI_DISTINGUE);
console.log(`   20 000 lignes contre 3 000 types, vocabulaire distinctif, 512 Mo : ${distinct.tenu ? distinct.secondes.toFixed(1) + ' s' : '\u00c9CHEC \u2014 ' + distinct.detail}`);
ok('SQL r\u00e9el : quand chaque type a un mot bien \u00e0 lui, le plafond des candidats ne perd rien', distinct.tenu &&
  Number((await distinct.demande(`SELECT COUNT(*)::BIGINT AS lignes FROM "v13_codee"
    WHERE __code = 'PMP-' || (CAST(substr(REPERE, 3) AS BIGINT) % 3000)`))[0].lignes) === 20000);

let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
process.exit(fail||perr.length?1:0);
