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
  ok('le meilleur voisin hors branche est gardé lui aussi, pour pouvoir le dire', /__score_hors/.test(v13SqlDeCodification(C())) && /__code_autre_branche/.test(v13SqlDeCodification(C())));
  ok('deux types au même score ne sont pas tranchés d\'office', /__scores_voisins\[2\] = candidats\.__scores_voisins\[1\]/.test(v13SqlDeCodification(C())));
  ok('le bilan compte à part les lignes trouvées dans une autre branche', (()=>{ const b=v13BilanDeCodification([{statut:'office',lignes:5},{statut:'branche',lignes:2},{statut:'absent',lignes:1}]);
    return b.branche===2 && b.total===8 && /2 trouvée\(s\) dans une autre branche/.test(b.phrase); })());
  ok('et l\'écran dit quoi faire de ces lignes-là en priorité', /AUTRE branche que leur famille/.test(v13ProchaineAction({total:8,office:5,branche:2,revoir:0,absent:1})));

  // ---- la famille d'abord : la rareté d'un mot se mesure aussi DANS la famille
  ok('le rapprochement compte les mots par famille, en plus de les compter partout', (()=>{ const sql=v13SqlDeCodification(C());
    return /frequencesDeLaFamille AS/.test(sql) && /seuilDeLaFamille AS/.test(sql) && /tetesDeLaFamille AS/.test(sql)
      && /frequencesPartout AS/.test(sql) && /tetesPartout AS/.test(sql); })());
  ok('les deux étapes s\'ajoutent, l\'une n\'enlève rien à l\'autre', /UNION ALL/.test(v13SqlDeCodification(C())));
  ok('sans famille déclarée, il n\'y a qu\'une étape', (()=>{ const sansFamille=v13SqlDeCodification(Object.assign({}, C(), {restreindreSource:'', restreindreNomenclature:''}));
    return !/tetesDeLaFamille/.test(sansFamille) && /tetesPartout AS/.test(sansFamille); })());

  // ---- une proposition faible n'est pas une absence
  ok('le seuil ne décide plus de ce que l\'on garde, seulement du statut', (()=>{ const sql=v13SqlDeCodification(C());
    return !/HAVING GREATEST/.test(sql) && /THEN 'faible'/.test(sql); })());
  ok('le bilan compte à part les propositions faibles', (()=>{ const b=v13BilanDeCodification([
    {statut:'office',lignes:5},{statut:'faible',lignes:3},{statut:'absent',lignes:1}]);
    return b.faible===3 && b.total===9 && /3 à proposition faible/.test(b.phrase); })());
  ok('et l\'écran dit quoi en faire', /propositions faibles/.test(v13ProchaineAction({total:9,office:5,revoir:0,branche:0,faible:3,absent:1})));
  ok('la revue prend aussi ces cas', /IN \('revoir', 'branche', 'faible'\)/.test(v13SqlDesCasARevoir(C(), 50, 'v13_codee')));

  // ---- la vue complète : l’écran plafonne, l’export non
  ok('l\'écran pose cinquante questions au plus', /LIMIT 50/.test(v13SqlDesCasARevoir(C(), 50, 'v13_codee'))
    && /LIMIT 50/.test(v13SqlDesCasARevoir(C(), undefined, 'v13_codee')));
  ok('l\'export, lui, ne connaît aucun plafond', !/LIMIT/.test(v13SqlDesCasARevoir(C(), 0, 'v13_codee').split('GROUP BY 1 ORDER BY __combien DESC, __rn')[1].split(')')[0]));
  ok('le plafond se lit à part, et zéro veut dire toutes', v13PlafondDesCas(50)===' LIMIT 50' && v13PlafondDesCas(0)===''
    && v13PlafondDesCas(-1)==='' && v13PlafondDesCas(undefined)===' LIMIT 50');
  ok('le résultat codé, lui, part en entier — aucun plafond dans son export',
    /SELECT \* EXCLUDE \(__rn\) FROM \$\{sqlIdent\(V13_TABLE_CODEE\)\}/.test(String(v13UtiliserLeResultat))
    && !/LIMIT/.test(String(v13UtiliserLeResultat)));
  ok('et un bouton sort tous les cas à revoir, sans plafond', (()=>{ const code=String(v13ExporterLesCasARevoir);
    return /v13SqlDuNombreDeCasARevoir/.test(code) && /v13PreparerLaRevue/.test(code)
      && /DROP TABLE IF EXISTS \$\{table\}/.test(code) && /v12State\.noSpill\+\+/.test(code); })());
  ok('il essaie d\'abord d\'un coup, et ne se replie sur les paquets qu\'en manquant de place', (()=>{
    const code=String(v13PreparerLaRevue);
    return /v13SqlDesCasARevoir\(codification, 0, V13_TABLE_CODEE\)/.test(code)
      && /if \(!v13ManqueDeMemoire\(erreur\)\) throw erreur/.test(code)
      && /v13SqlDesCasARevoir\(codification, V13_CAS_PAR_PAQUET, V13_TABLE_CODEE, depuis\)/.test(code)
      && /INSERT INTO \$\{table\}/.test(code) && /depuis \+= V13_CAS_PAR_PAQUET/.test(code); })());
  ok('et l\'on sait reconnaître un manque de place d\'une vraie erreur', v13ManqueDeMemoire(new Error('Out of Memory Error: x'))
    && v13ManqueDeMemoire(new Error('HTML FileReaders do not support writing')) && !v13ManqueDeMemoire(new Error('Binder Error: y')));
  ok('le découpage saute bien les libellés déjà sortis', (()=>{
    const premier=v13SqlDesCasARevoir(C(), 5000, 'v13_codee', 0);
    const suivant=v13SqlDesCasARevoir(C(), 5000, 'v13_codee', 5000);
    return / LIMIT 5000$/m.test(premier.split('\n').find(l=>/LIMIT/.test(l))||'')===false
      ? /LIMIT 5000/.test(premier) && /LIMIT 5000 OFFSET 5000/.test(suivant) : true; })());
  ok('et demander tout ce qui reste à partir d\'un rang garde bien le saut',
    / LIMIT ALL OFFSET 120$/m.test(v13PlafondDesCas(0, 120)) && v13PlafondDesCas(0, 0)==='');

  // ---- pourquoi aucune proposition de ma famille ?
  ok('le contrôle compare les familles des deux côtés', (()=>{ const sql=v13SqlDuControleDeBranche(C());
    return /famillesDeLaListe AS/.test(sql) && /famillesDeLArbre AS/.test(sql) && /ORDER BY connue, lignes DESC/.test(sql); })());
  ok('sans colonne de branche déclarée, il n\'y a rien à contrôler', v13SqlDuControleDeBranche(Object.assign({}, C(), {restreindreSource:''}))==='');
  ok('quand aucune famille ne se retrouve, on le dit franchement', (()=>{ const bilan=v13BilanDuControleDeBranche([
    {famille:'CHAUDIERE', lignes:27, connue:false}, {famille:'CTA', lignes:37, connue:false}]);
    return !bilan.accord && /AUCUNE famille de la liste/.test(bilan.phrase) && /vérifiez laquelle vous avez choisie/.test(bilan.phrase); })());
  ok('quand seules certaines manquent, on les nomme et on compte les lignes', (()=>{ const bilan=v13BilanDuControleDeBranche([
    {famille:'J01', lignes:100, connue:true}, {famille:'ZZZ', lignes:27, connue:false}]);
    return !bilan.accord && bilan.lignesInconnues===27 && /27 ligne\(s\) portent une famille/.test(bilan.phrase)
      && /« ZZZ »/.test(bilan.phrase) && bilan.familles.includes('J01'); })());
  ok('et quand tout concorde, il le dit aussi', (()=>{ const bilan=v13BilanDuControleDeBranche([{famille:'J01', lignes:100, connue:true}]);
    return bilan.accord && /existent toutes dans la nomenclature/.test(bilan.phrase); })());
  // ---- quand les familles ne concordent pas : dire QUELLE colonne il fallait choisir ----
  // Le contrôle dit « ça ne concorde pas » ; il ne disait pas quoi faire. L'essai passe chaque colonne du
  // fichier en revue et compte celles de ses valeurs que l'autre fichier reconnaît.
  ok('sans colonne de branche declaree, il n\'y a aucune colonne a essayer',
    v13SqlDesColonnesDeBranche(Object.assign({}, C(), {restreindreSource:''}), 'liste')==='');
  ok('l\'essai passe en revue toutes les colonnes du fichier', (()=>{
    const sql=v13SqlDesColonnesDeBranche(Object.assign({}, C(), {restreindreSource:'DESIGNATION'}), 'liste');
    return ['REPERE','LIBELLE','FAMILLE','CODE_FOURNI','DESIGNATION'].every(c=>sql.includes("'"+c+"'"))
      && /WITH referentes AS/.test(sql) && /ORDER BY reconnues DESC/.test(sql); })());
  ok('l\'essai se fait aussi dans l\'autre sens, sur la nomenclature', (()=>{
    const sql=v13SqlDesColonnesDeBranche(C(), 'nomenclature');
    return sql.includes("'LIBELLE_TYPE'") && sql.includes("'FAMILLE'"); })());
  ok('le conseil nomme la colonne qui reconnait les valeurs, et celle qui ne les reconnait pas', (()=>{
    const phrase=v13ConseilDeColonne([{colonne:'FAMILLE', reconnues:9, remplies:9},
      {colonne:'DESIGNATION', reconnues:0, remplies:9}], 'DESIGNATION', '« equipements.csv »');
    return /« FAMILLE »/.test(phrase) && /100 %/.test(phrase) && /0 %/.test(phrase)
      && /« DESIGNATION »/.test(phrase) && /equipements\.csv/.test(phrase); })());
  ok('quand la colonne declaree est deja la meilleure, on ne conseille rien',
    v13ConseilDeColonne([{colonne:'FAMILLE', reconnues:9, remplies:9}], 'FAMILLE', '« e.csv »')==='');
  ok('et quand aucune colonne ne reconnait grand-chose, on se tait plutot que d\'egarer',
    v13ConseilDeColonne([{colonne:'REPERE', reconnues:2, remplies:9}], 'DESIGNATION', '« e.csv »')==='');
  // ---- voir, retirer et vider ce que l'on a décidé ----
  // Les décisions s'accumulaient sans écran pour les relire : impossible de savoir ce qui était retenu,
  // ni de revenir sur un choix. Trois libellés appris, un écarté, une décision sur une ligne précise.
  const avecDesChoix = () => Object.assign({}, C(), {
    correspondances: [
      { libelle:'Chaudiere 2', code:'22390503.A', auteur:'Nicolas', le:'2026-09-18' },
      { libelle:'Disconnecteur CES', code:'37010909.B', auteur:'Nicolas', le:'2026-09-18' }
    ],
    refus: [v13MotRetenuDuTexte('Bidule non identifiable', C())],
    decisions: { 4:'22390503.A', 7:'VAN-P' } });
  ok('on voit ce qui a ete appris, ce qui a ete ecarte, et combien tient a une ligne', (()=>{
    const vues = v13DecisionsPrises(avecDesChoix());
    return vues.apprises.length===2 && vues.ecartees.length===1 && vues.surUneLigne===2 && vues.combien===3
      && vues.apprises[0].code==='22390503.A' && vues.apprises[0].auteur==='Nicolas'; })());
  ok('et une phrase les compte, ou dit qu\'il n\'y a rien', (()=>{
    const pleine = v13PhraseDesDecisions(v13DecisionsPrises(avecDesChoix()));
    const vide = v13PhraseDesDecisions(v13DecisionsPrises(Object.assign({}, C(), {correspondances:[], refus:[], decisions:{}})));
    return /2 libellés appris/.test(pleine) && /1 libellé écarté/.test(pleine) && /rien décidé/.test(vide); })());
  ok('retirer un choix retire le libellé appris ET la décision de ligne qui en découlait', (()=>{
    const apres = v13SansCetteDecision(avecDesChoix(), 'Chaudiere 2');
    return apres.correspondances.length===1 && apres.correspondances[0].code==='37010909.B'
      && !apres.decisions['4'] && apres.decisions['7']==='VAN-P'; })());
  ok('remettre en question un libellé écarté le sort bien de la liste des écartés', (()=>{
    const apres = v13SansCetteDecision(avecDesChoix(), 'Bidule non identifiable');
    return apres.refus.length===0 && apres.correspondances.length===2; })());
  ok('tout vider ne laisse aucun choix appris, écarté ni attaché à une ligne', (()=>{
    const apres = v13DecisionsVidees();
    return apres.correspondances.length===0 && apres.refus.length===0 && !Object.keys(apres.decisions).length; })());
  ok('les décisions s\'exportent en CSV, les apprises comme les écartées', (()=>{
    const csv = v13CsvDesDecisions(avecDesChoix()).split('\r\n');
    return csv[0]==='libelle;decision;code;par;le' && csv.length===4
      && /^Chaudiere 2;appris;22390503\.A;Nicolas;2026-09-18$/.test(csv[1])
      && /;ecarte;;;$/.test(csv[3]); })());
  ok('un libellé qui contient un point-virgule ne casse pas le CSV', (()=>{
    const csv = v13CsvDesDecisions(Object.assign({}, C(), {correspondances:[{libelle:'Vanne ; papillon', code:'VAN-P'}], refus:[]}));
    return /"Vanne ; papillon";appris;VAN-P/.test(csv); })());
  // Et l'écran, réellement : le bloc ⑤ existe, il montre les choix, et le ✕ en retire un pour de bon.
  const avant = { correspondances: C().correspondances, refus: C().refus, decisions: C().decisions };
  Object.assign(C(), { correspondances:[{libelle:'Chaudiere 2', code:'22390503.A', auteur:'Nicolas', le:'2026-09-18'}],
    refus:['BIDULE'], decisions:{} });
  renderCodification(); await wait(120);
  ok('l\'écran montre un bloc « Ce que vous avez décidé », avec une ligne par choix',
    el('v13-codif-decisions') && el('v13-codif-decisions').querySelectorAll('tr.v13-codif-decision').length===2
    && el('v13-codif-decisions').querySelectorAll('tr.v13-codif-ecartee').length===1);
  ok('les boutons « Exporter » et « Tout vider » sont actifs quand il y a des choix',
    !el('v13-codif-decisions-exporter').disabled && !el('v13-codif-decisions-vider').disabled);
  el('v13-codif-decisions').querySelector('tr.v13-codif-decision button').click(); await wait(120);
  ok('le ✕ retire vraiment le choix, et l\'écran se remet à jour', C().correspondances.length===0
    && el('v13-codif-decisions').querySelectorAll('tr.v13-codif-decision').length===1);
  Object.assign(C(), { correspondances:[], refus:[], decisions:{} });
  renderCodification(); await wait(120);
  ok('sans aucun choix, l\'écran le dit et n\'offre rien à vider',
    /rien décidé/.test(el('v13-codif-decisions-phrase').textContent) && el('v13-codif-decisions-vider').disabled);
  Object.assign(C(), avant);
  ok('la revue rend la famille de la ligne, pour pouvoir expliquer', /AS famille, CAST/.test(v13SqlDesCasARevoir(C(), 50, 'v13_codee')));
  ok('et le cas sans proposition de sa famille dit laquelle des deux raisons s\'applique', (()=>{
    v13Codification.branche = { accord:false, familles:['J01'], phrase:'x' };
    const absente = v13PourquoiAucuneDansLaFamille({ famille:'CHAUDIERE' }, 0);
    const presente = v13PourquoiAucuneDansLaFamille({ famille:'J01' }, 0);
    const servie = v13PourquoiAucuneDansLaFamille({ famille:'J01' }, 3);
    v13Codification.branche = null;
    return /n’existe pas dans la nomenclature/.test(absente) && /aucun de ses types ne partage de mot/.test(presente) && servie===''; })());

  // ---- la famille d’abord, puis l’élargissement
  ok('on montre huit propositions par défaut, et le nombre se règle', v13CombienDePropositions({})===8
    && v13CombienDePropositions({propositions:12})===12 && v13CombienDePropositions({propositions:0})===1
    && v13CombienDePropositions({propositions:99})===V13_PROPOSITIONS_MAXIMUM);
  ok('le quota de la famille et celui de l’élargissement sont séparés', (()=>{ const sql=v13SqlDesCasARevoir(C(), 50, 'v13_codee');
    return /GROUP BY rang, memeBranche/.test(sql) && /CASE WHEN memeBranche\s+THEN 8 ELSE 3 END/.test(sql); })());
  ok('les meilleures sont retenues au passage, sans trier tout ce qui a été noté', (()=>{
    const sql=v13SqlDesCasARevoir(C(), 0, 'v13_codee');
    return /max_by\(\{'code': code, 'libelleRef': libelleRef, 'chemin': chemin, 'score': score\},\s+score, 8\)/.test(sql)
      && !/PARTITION BY rang, memeBranche/.test(sql); })());
  ok('le réglage est offert à l\'écran, à côté des seuils', !!el('v13-codif-propositions'));
  ok('et le récapitulatif le dit', /8 dans la famille de la ligne, puis 3 prises ailleurs/.test(
    (v13RecapDeLaCodification(C()).find(l=>l.intitule==='Propositions montrées')||{}).valeur||''));

  // ---- dire ce qui cloche quand la famille et l’arbre se contredisent
  ok('la phrase du désaccord nomme l’origine du code, la famille de la ligne et celles du code', (()=>{
    const dite = v13PhraseDuDesaccord({ __code:'PMP-C', __origine:'existant', __branche_trouvee:'POMPES, UTILITES', FAMILLE:'VANNES' }, C());
    return /code déjà fourni/.test(dite) && /VANNES/.test(dite) && /POMPES, UTILITES/.test(dite) && /PMP-C/.test(dite); })());
  ok('et quand rien n’a été trouvé sous la famille, elle le dit autrement', (()=>{
    const dite = v13PhraseDuDesaccord({ __code:null, __code_autre_branche:'PMP-C', __origine:'aucune', __branche_trouvee:'POMPES', FAMILLE:'VANNES' }, C());
    return /Rien ne correspond sous/.test(dite) && /VANNES/.test(dite) && /POMPES/.test(dite); })());
  ok('une ligne sans désaccord ne produit aucune phrase', v13PhraseDuDesaccord({ __code:null, __code_autre_branche:null }, C())==='');

  // ---- le pluriel ne doit plus séparer deux mots identiques
  ok('un mot au pluriel est ramené au singulier, à partir de quatre lettres', v13AuSingulier('POMPES')==='POMPE' && v13AuSingulier('VANNES')==='VANNE'
    && v13AuSingulier('CHEVAUX')==='CHEVAU' && v13AuSingulier('VIS')==='VIS' && v13AuSingulier('BAC')==='BAC');
  ok('le libellé est rangé au singulier avant tout le reste', v13MotRetenuDuTexte('Pompes centrifuges ALIM.', C())==='POMPE CENTRIFUGE ALIM');
  ok('et le SQL fait le même passage au singulier des deux côtés', (()=>{ const sql=v13SqlDeCodification(C());
    return (sql.match(/ends_with\(mot, 'S'\)/g)||[]).length >= 2; })());

  // ---- une question par libellé, pas une par ligne
  ok('la revue regroupe par libellé et sert les plus fréquents d\'abord', (()=>{ const sql=v13SqlDesCasARevoir(C(), 50, 'v13_codee');
    return /clesARevoir AS \(/.test(sql) && /GROUP BY 1 ORDER BY __combien DESC/.test(sql) && /__combien AS combien/.test(sql); })());
  ok('un libellé écarté à la main n\'est plus reproposé', (()=>{ const refuse=Object.assign({}, C(), { refus: v13RefusApresDecision(C(), 'Bidule non identifiable') });
    return refuse.refus.includes('BIDULE NON IDENTIFIABLE') && /NOT IN \('BIDULE NON IDENTIFIABLE'\)/.test(v13SqlDesCasARevoir(refuse, 50, 'v13_codee')); })());
  ok('et l\'on peut revenir dessus : le libellé redevient une question', (()=>{ const refuse=Object.assign({}, C(), { refus: ['BIDULE NON IDENTIFIABLE', 'AUTRE CHOSE'] });
    const rendu=v13RefusSansLeLibelle(refuse, 'bidule non identifiable'); return rendu.length===1 && rendu[0]==='AUTRE CHOSE'; })());
  ok('une décision est rangée sous le libellé, donc elle vaut pour toutes ses écritures', (()=>{
    const apres=v13CorrespondanceApresDecision(C(), 'POMPE  CENTRIFUGE (X2)', 'PMP-C');
    return apres.length===1 && v13MotRetenuDuTexte(apres[0].libelle, C())==='POMPE CENTRIFUGE X2'; })());

  // ---- les choix faits, relus sans rien déplier, et gardés d’une session à l’autre
  ok('le récapitulatif dit en français ce que l\'on code et contre quoi', (()=>{ const r=v13RecapDeLaCodification(C());
    const ligne = intitule => (r.find(x=>x.intitule===intitule)||{}).valeur || '';
    return /equipements\.csv · colonne LIBELLE/.test(ligne('À coder')) && /nomenclature\.csv · code CODE_TYPE/.test(ligne('Contre'))
      && /FAMILLE › SYSTEME/.test(ligne('Chemin de l’arbre')) && /FAMILLE doit correspondre à FAMILLE/.test(ligne('Branche')); })());
  ok('le récapitulatif est affiché en haut de l\'écran, pas caché dans les réglages', (()=>{ const bloc=el('v13-codif-recap');
    return bloc && /Ce que fait cette codification/.test(bloc.textContent) && /equipements\.csv/.test(bloc.textContent); })());
  ok('le décompte rassure quand il est juste, et alerte quand il ne l\'est pas',
    /9 ligne\(s\) en entrée, autant en sortie/.test(v13PhraseDuDecompte(9, 9)) && /⚠/.test(v13PhraseDuDecompte(9, 27)));
  ok('les paramétrages de codification sont sauvegardés avec le reste', (()=>{ const garde=collectPersistedConfig();
    return Array.isArray(garde.codifications) && garde.codifications.some(x=>x.id===C().id && x.colonneLibelle==='LIBELLE'); })());
  ok('et ils sont relus au retour', (()=>{ const garde=collectPersistedConfig(); const avant=state.codifications;
    state.codifications=[]; applyPersistedConfig(garde); const revenu=state.codifications.some(x=>x.id===avant[0].id && x.nomenclature==='nomenclature.csv');
    state.codifications=avant; return revenu; })());

  // ---- la mémoire du navigateur, quand elle ne suffit pas
  ok('une erreur de mémoire est traduite en français, avec quoi faire', /la mémoire du navigateur n’a pas suffi/.test(v13PhraseDeLErreur(new Error('Invalid Error: HTML FileReaders do not support writing'))) && /Chercher dans la bonne branche/.test(v13PhraseDeLErreur(new Error('Out of Memory Error'))));
  ok('une erreur ordinaire est rendue telle quelle, sans bavardage', v13PhraseDeLErreur(new Error('Colonne inconnue'))==='Colonne inconnue');
  ok('la codification s\'exécute sans jamais déborder sur disque', /v12State\.noSpill\+\+/.test(String(v13CoderLaListe)) && /v12State\.noSpill--/.test(String(v13CoderLaListe)));
  ok('les découpages en mots ne sont calculés qu\'une fois, quoi qu\'il en coûte à les relire', (v13SqlDesRapprochables(C()).match(/AS MATERIALIZED/g)||[]).length===2);

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
  const basSeuil = Object.assign({}, C(), { synonymes: [], regles: [], niveaux: ['FAMILLE','LIBELLE_TYPE'] });
  window.__sqlFaible = v13SqlDeCodification(basSeuil);
  window.__sqlFaibleRevue = v13SqlDesCasARevoir(basSeuil, 50, 'v13_codee');
  const parFamille = Object.assign({}, C(), { synonymes: [], regles: [], niveaux: ['FAMILLE','LIBELLE_TYPE'] });
  window.__sqlFamilleDabord = { code: v13SqlDeCodification(parFamille), revue: v13SqlDesCasARevoir(parFamille, 50, 'v13_codee') };
  const decidee = Object.assign({}, C(), { synonymes: [], regles: [] });
  window.__sqlDecisionGroupee = v13SqlDeCodification(Object.assign({}, decidee, {
    correspondances: v13CorrespondanceApresDecision(decidee, 'Pompe alim', 'PMP-C') }));
  // Le même export, d'un coup et par paquets de 3 libellés : le résultat doit être identique.
  const tout = Object.assign({}, C(), { synonymes: [], regles: [], niveaux: ['FAMILLE','LIBELLE_TYPE'], seuilRevoir: 0.2 });
  window.__revueEntiere = { code: v13SqlDeCodification(tout), dUnCoup: v13SqlDesCasARevoir(tout, 0, 'v13_codee'),
    combien: v13SqlDuNombreDeCasARevoir(tout, 'v13_codee'),
    paquets: [0,3,6,9].map(depuis => v13SqlDesCasARevoir(tout, 3, 'v13_codee', depuis)) };
  window.__essaiColonnes = {
    liste: v13SqlDesColonnesDeBranche(Object.assign({}, C(), { restreindreSource: 'DESIGNATION' }), 'liste'),
    nomenclature: v13SqlDesColonnesDeBranche(Object.assign({}, C(), { restreindreNomenclature: 'ABREGE' }), 'nomenclature')
  };
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
const sqlFaible = await p.evaluate(()=>window.__sqlFaible);
const sqlFaibleRevue = await p.evaluate(()=>window.__sqlFaibleRevue);
const sqlFamilleDabord = await p.evaluate(()=>window.__sqlFamilleDabord);
const sqlAvecDecision = await p.evaluate(()=>window.__sqlAvecDecision);
const essaiColonnes = await p.evaluate(()=>window.__essaiColonnes);
const revueEntiere = await p.evaluate(()=>window.__revueEntiere);
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

// ---- l'export de TOUS les cas à revoir, par paquets ----
// Tout demander d'un coup faisait tenir en mémoire la table codée entière ET le rapprochement refait
// par-dessus : sur une vraie liste, le navigateur s'arrêtait. Par paquets, le résultat doit être le même.
const parPaquets = await (await DuckDBInstance.create(':memory:')).connect();
const paquet = async sql => (await (await parPaquets.run(sql)).getRowObjects());
await paquet(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ${valeurs(EQUIPEMENTS)}) v(REPERE,LIBELLE,FAMILLE,CODE_FOURNI,DESIGNATION)`);
await paquet(`CREATE TABLE "t_nm" AS SELECT * FROM (VALUES ${valeurs(NOMENCLATURE)}) v(FAMILLE,SYSTEME,SOUS_SYSTEME,LIBELLE_TYPE,CODE_TYPE,ABREGE)`);
await paquet(`CREATE TABLE "v13_codee" AS\n${revueEntiere.code}`);
const casComptes = Number((await paquet(revueEntiere.combien))[0].cas);
const dUnCoup = await paquet(revueEntiere.dUnCoup);
let assemblees = [];
for (const sql of revueEntiere.paquets) assemblees = assemblees.concat(await paquet(sql));
const enTexte = lignes => lignes.map(l => [l.rang, l.code, l.score].join('|')).sort().join(' ; ');
ok('SQL réel : on sait compter les libellés à trancher avant de les préparer',
  casComptes > 0 && casComptes === new Set(dUnCoup.map(l => String(l.rang))).size);
ok('SQL réel : l\'export par paquets rend exactement ce que l\'export d\'un coup rendait',
  assemblees.length === dUnCoup.length && enTexte(assemblees) === enTexte(dUnCoup));
ok('SQL réel : et aucun libellé n\'est servi deux fois d\'un paquet à l\'autre',
  new Set(assemblees.map(l => String(l.rang))).size === casComptes);

// ---- l'essai des colonnes de branche, sur un vrai DuckDB ----
// L'utilisateur avait déclaré DESIGNATION comme colonne de famille : aucune de ses valeurs n'existe dans
// l'arbre, donc aucune ligne ne pouvait recevoir de proposition de sa famille. L'essai doit désigner FAMILLE.
const essaiListe = await requete(essaiColonnes.liste);
const parColonne = Object.fromEntries(essaiListe.map(l => [String(l.colonne), l]));
ok('SQL réel : l\'essai compte, colonne par colonne, ce que l\'autre fichier reconnaît',
  Number(parColonne.FAMILLE.reconnues) === 9 && Number(parColonne.FAMILLE.remplies) === 9
  && Number(parColonne.DESIGNATION.reconnues) === 0);
ok('SQL réel : la colonne qui reconnaît tout arrive en tête', String(essaiListe[0].colonne) === 'FAMILLE');
const essaiNomenclature = await requete(essaiColonnes.nomenclature);
ok('SQL réel : l\'essai fonctionne aussi dans l\'autre sens, sur la nomenclature',
  String(essaiNomenclature[0].colonne) === 'FAMILLE' && Number(essaiNomenclature[0].reconnues) === 5);

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
// Le même code figure sous DEUX familles de l'arbre : la question n'est pas « est-ce CETTE famille »
// mais « ce code existe-t-il sous la famille de la ligne ».
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
ok('SQL réel : un code qui existe sous la famille de la ligne n’est PAS signalé, même s’il existe ailleurs aussi',
  fournis.E1.__statut === 'office' && fournis.E2.__statut === 'office');
ok('SQL réel : et chacune reçoit le chemin de SA famille, pas celui d’une autre',
  /^UTILITES/.test(String(fournis.E1.__chemin)) && /^POMPES/.test(String(fournis.E2.__chemin)));
ok('SQL réel : un code absent de la famille de la ligne est signalé, pas codé d’office en silence', fournis.E3.__statut === 'branche');
ok('SQL réel : et l’on nomme TOUTES les familles où ce code existe, pas une au hasard',
  String(fournis.E3.__branche_trouvee) === 'POMPES, UTILITES');
ok('SQL réel : le code est conservé, on ne détruit pas l’information', String(fournis.E3.__code) === 'PMP-C');
ok('SQL réel : et l’origine dit que le code venait de la liste', String(fournis.E3.__origine) === 'existant');

// ---- un mot répandu partout, mais rare dans la famille ----
// « CHAUDIERE » est porté par 400 types de l'arbre : jugé trop courant, il était écarté, et la ligne
// n'examinait JAMAIS les chaudières de sa propre famille — on lui proposait une vanne. Or dans sa famille,
// ce mot n'est porté que par trois types : c'est précisément lui qui distingue.
const rareDansLaFamille = await (await DuckDBInstance.create(':memory:')).connect();
const cherche = async sql => (await (await rareDansLaFamille.run(sql)).getRowObjects());
await cherche(`CREATE TABLE "t_nm" AS
  SELECT 'A' || (i % 20) AS FAMILLE, 'S' AS SYSTEME, 'SS' AS SOUS_SYSTEME,
    'Chaudiere variante ' || i AS LIBELLE_TYPE, 'X-' || i AS CODE_TYPE, 'CV' AS ABREGE FROM range(400) t(i)
  UNION ALL SELECT 'J01','S','SS','Chaudiere+br.gaz EC','22390503.A','CBG'
  UNION ALL SELECT 'J01','S','SS','Chaudiere+br.fod EC','22390504.A','CBF'
  UNION ALL SELECT 'J01','S','SS','Chaudiere EC biomasse granules','22390505.A','CBB'
  UNION ALL SELECT 'J01','S','SS','Vanne 2 voies motorisee','22390406.A','V2V'`);
await cherche(`CREATE TABLE "t_eq" AS SELECT 1 AS __rn, 'E1' AS REPERE, 'Chaudiere 2' AS LIBELLE,
  'J01' AS FAMILLE, '' AS CODE_FOURNI, '' AS DESIGNATION`);
await cherche(`CREATE OR REPLACE TABLE "v13_codee" AS\n${sqlFamilleDabord.code}`);
const proposeesFamille = await cherche(sqlFamilleDabord.revue);
const deLaFamille = proposeesFamille.filter(l => l.memeBranche === true).map(l => String(l.code));
ok('SQL réel : les trois chaudières de la famille sont proposées, plus seulement une vanne',
  deLaFamille.includes('22390503.A') && deLaFamille.includes('22390504.A') && deLaFamille.includes('22390505.A'));
ok('SQL réel : et elles passent avant les propositions prises ailleurs',
  proposeesFamille.slice(0, deLaFamille.length).every(l => l.memeBranche === true));

// ---- et cette proposition de la famille doit SE VOIR dans le fichier résultat ----
// Le résultat n'imprimait que le code trouvé hors famille : on lisait « K04 » en face d'une ligne J01 et
// l'on comprenait que la machine avait choisi K04, alors qu'elle avait une proposition dans la famille.
const resultatFamille = await cherche('SELECT * FROM "v13_codee" WHERE REPERE = \'E1\'');
const ligneE1 = resultatFamille[0];
ok('SQL réel : le résultat imprime la proposition faite dans la famille de la ligne',
  ['22390503.A','22390504.A','22390505.A'].includes(String(ligneE1.__code_propose)));
ok('SQL réel : avec son libellé et sa confiance, pour qu\'elle soit lisible sans rouvrir la nomenclature',
  /Chaudiere/.test(String(ligneE1.__libelle_propose)) && Number(ligneE1.__score_propose) > 0);
ok('SQL réel : le code trouvé hors famille reste imprimé à côté, il ne la remplace plus',
  ligneE1.__code_autre_branche === null || String(ligneE1.__code_autre_branche) !== String(ligneE1.__code_propose));

// Le cas exact du terrain : un même code rangé sous DEUX familles, la ligne étant dans la première.
const deuxFamilles = await (await DuckDBInstance.create(':memory:')).connect();
const deux = async sql => (await (await deuxFamilles.run(sql)).getRowObjects());
await deux(`CREATE TABLE "t_nm" AS
  SELECT 'B' || (i % 20) AS FAMILLE, 'S' AS SYSTEME, 'SS' AS SOUS_SYSTEME,
    'Disconnecteur modele ' || i AS LIBELLE_TYPE, 'Y-' || i AS CODE_TYPE, 'DM' AS ABREGE FROM range(400) t(i)
  UNION ALL SELECT 'J01','S','SS','Disconnecteur BA zpr-ctr.','37010909.B','DBA'
  UNION ALL SELECT 'J01','S','SS','Disconnecteur HA ext-ctr.','37010909.D','DHA'
  UNION ALL SELECT 'K04','S','SS','Disconnecteur HA ext-ctr.','37010909.D','DHA'`);
await deux(`CREATE TABLE "t_eq" AS SELECT 1 AS __rn, 'E1' AS REPERE,
  'Disconnecteur CES Le Vigneret' AS LIBELLE, 'J01' AS FAMILLE, '' AS CODE_FOURNI, '' AS DESIGNATION`);
await deux(`CREATE OR REPLACE TABLE "v13_codee" AS\n${sqlFamilleDabord.code}`);
const ligneDeux = (await deux('SELECT * FROM "v13_codee"'))[0];
ok('SQL réel : un code rangé sous deux familles est proposé DANS celle de la ligne, pas dans l\'autre',
  ['37010909.B','37010909.D'].includes(String(ligneDeux.__code_propose)) && Number(ligneDeux.__score_propose) > 0);
ok('SQL réel : et le libellé rendu est bien celui d\'un disconnecteur',
  /Disconnecteur/.test(String(ligneDeux.__libelle_propose)));
ok('SQL réel : le chemin dans l\'arbre mène à la proposition, il n\'est plus vide',
  /Disconnecteur/.test(String(ligneDeux.__chemin)) && String(ligneDeux.__chemin).startsWith('J01'));
ok('SQL réel : le code trouvé hors famille est rendu lisible, lui aussi',
  /Disconnecteur/.test(String(ligneDeux.__libelle_autre_branche))
  && /Disconnecteur/.test(String(ligneDeux.__chemin_autre_branche)));
ok('SQL réel : et son chemin part bien de la famille où ce code-là a été trouvé',
  String(ligneDeux.__chemin_autre_branche).startsWith(String(ligneDeux.__branche_trouvee)));

// Et sur le volume, avec une famille déclarée : la nouvelle étape ne doit rien coûter de plus.
const volumeFamille = await (await DuckDBInstance.create(':memory:')).connect();
const mesure = async sql => (await (await volumeFamille.run(sql)).getRowObjects());
await mesure(`CREATE TABLE "t_nm" AS SELECT 'F' || (i % 30) AS FAMILLE, 'S' AS SYSTEME, 'SS' AS SOUS_SYSTEME,
  'Pompe centrifuge modele ' || i AS LIBELLE_TYPE, 'PMP-' || i AS CODE_TYPE, 'PC' AS ABREGE FROM range(3000) t(i)`);
await mesure(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, 'EQ' || i AS REPERE,
  'Pompe centrifuge modele ' || (i % 3000) AS LIBELLE, 'F' || (i % 30) AS FAMILLE, '' AS CODE_FOURNI,
  '' AS DESIGNATION FROM range(20000) t(i)`);
await mesure("SET memory_limit='512MB'");
await mesure("SET temp_directory=''");
const departFamille = Date.now();
let tenuFamille = true;
try { await mesure(`CREATE TABLE "v13_codee" AS\n${sqlFamilleDabord.code}`); } catch (e) { tenuFamille = false; }
console.log(`   20 000 lignes contre 3 000 types, famille déclarée, 512 Mo : ${tenuFamille ? ((Date.now() - departFamille) / 1000).toFixed(1) + ' s' : 'ÉCHEC'}`);
ok('SQL réel : chercher d\'abord dans la famille tient aussi sur le volume', tenuFamille);

// ---- un mot partagé, un score sous le seuil : c'est faible, pas absent ----
// « Disconnecteur CES Le Vigneret » contre « Disconnecteur BA zpr-ctr. » : un mot sur quatre, soit 25 %.
// Trop peu pour décider, bien assez pour être montré. La ligne ressortait « non trouvée », score 0 —
// l'information était détruite alors que le couple avait été retenu ET noté.
const faibles = await (await DuckDBInstance.create(':memory:')).connect();
const note = async sql => (await (await faibles.run(sql)).getRowObjects());
await note(`CREATE TABLE "t_nm" AS SELECT * FROM (VALUES
  ('J01','S','SS','Disconnecteur BA zpr-ctr.','37010909.B','DBA'),
  ('J01','S','SS','Disconnecteur CA non-ctr.','37010909.C','DCA'),
  ('J01','S','SS','Chaudiere+br.gaz EC','22390503.A','CBG')
) v(FAMILLE,SYSTEME,SOUS_SYSTEME,LIBELLE_TYPE,CODE_TYPE,ABREGE)`);
await note(`CREATE TABLE "t_eq" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES
  ('E1','Disconnecteur CES Le Vigneret','J01','',''),
  ('E2','Chaudiere N 1 CES Le Vigneret','J01','',''),
  ('E3','Tableau electrique batiment C','J01','','')
) v(REPERE,LIBELLE,FAMILLE,CODE_FOURNI,DESIGNATION)`);
const rendus = Object.fromEntries((await note(`SELECT REPERE, __statut, __score FROM (\n${sqlFaible}\n) f`)).map(l => [String(l.REPERE), l]));
ok('SQL réel : un mot partagé sous le seuil donne « faible », plus « absent »', rendus.E1.__statut === 'faible' && rendus.E2.__statut === 'faible');
ok('SQL réel : et le score rendu est le vrai score, plus zéro', Number(rendus.E1.__score) > 0.2 && Number(rendus.E1.__score) < 0.45);
ok('SQL réel : une ligne qui ne partage AUCUN mot reste bien « non trouvée »', rendus.E3.__statut === 'absent' && Number(rendus.E3.__score) === 0);
await note(`CREATE OR REPLACE TABLE "v13_codee" AS\n${sqlFaible}`);
const aTrancher = await note(`SELECT DISTINCT libelle FROM (\n${sqlFaibleRevue}\n) v`);
ok('SQL réel : ces lignes arrivent à la revue au lieu d\'être perdues', aTrancher.length === 2);

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
ok('SQL réel : on propose bien plus que trois types quand la famille en offre plus',
  offertes.filter(l => l.memeBranche).length === 6);
ok('SQL réel : la famille de la ligne passe entièrement avant l’élargissement',
  offertes.slice(0, 6).every(l => l.memeBranche === true) && offertes.slice(6).every(l => l.memeBranche === false));
ok('SQL réel : l’élargissement reste borné, il ne noie pas la famille', offertes.filter(l => !l.memeBranche).length === 3);

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
ok('SQL réel : quatre lignes du même libellé ne font qu’UNE question', questions.length === 1 && Number(questions[0].combien) === 4);
ok('SQL réel : et la question annonce combien de lignes elle couvre', Number(questions[0].combien) === 4);
const apresDecision = await consulte(`SELECT REPERE, __code, __origine FROM (\n${sqlDecisionGroupee}\n) f ORDER BY REPERE`);
const codees = apresDecision.filter(l => String(l.__code || '') === 'PMP-C');
ok('SQL réel : une seule décision code les quatre lignes, quelle que soit leur écriture', codees.length === 4);
ok('SQL réel : la ligne qui ne porte pas ce libellé n’est pas touchée',
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
ok('SQL réel : une ligne dont la famille contredit l’arbre n’est plus « non trouvée », elle est signalée',
  tranches.EQA.__statut === 'branche' && tranches.EQA.__code === null);
ok('SQL réel : et l’on dit quel type a été trouvé, et sous quelle branche',
  String(tranches.EQA.__code_autre_branche) === 'PMP-C' && String(tranches.EQA.__branche_trouvee) === 'POMPES');
ok('SQL réel : la même ligne dans la bonne famille reste codée d’office',
  tranches.EQB.__statut === 'office' && String(tranches.EQB.__code) === 'PMP-C');
ok('SQL réel : deux types au même score partent à la revue au lieu d’être tirés au sort',
  tranches.EQC.__statut === 'revoir' && tranches.EQC.__code === null);
await interroge(`CREATE OR REPLACE TABLE "v13_codee" AS\n${sqlSansSynonymes}`);
const propositions = await interroge(v13SqlRevueAilleurs);
ok('SQL réel : la revue propose aussi ce qui a été trouvé hors branche, en le disant',
  propositions.some(l => Number(l.rang) === 1 && String(l.code) === 'PMP-C' && l.memeBranche === false));
ok('SQL réel : les ex æquo arrivent à la revue avec leurs deux propositions',
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
ok('SQL réel : un code présent à trois endroits de l’arbre ne triple pas les lignes', rendues === EQUIPEMENTS.length);
const reperes = await demande(`SELECT REPERE, COUNT(*)::BIGINT AS lignes FROM (\n${sqlSansSynonymes}\n) f GROUP BY REPERE HAVING COUNT(*) > 1`);
ok('SQL réel : aucun repère ne ressort deux fois', reperes.length === 0);
const chemin = await demande(`SELECT __chemin FROM (\n${sqlSansSynonymes}\n) f WHERE REPERE = 'EQ001'`);
ok('SQL réel : le chemin de l’arbre reste renseigné, une seule fois', /POMPES/.test(String(chemin[0].__chemin)));

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
console.log(`   20 000 lignes contre 3 000 types, vocabulaire indistinct, 512 Mo : ${serre.tenu ? serre.secondes.toFixed(1) + ' s' : 'ÉCHEC — ' + serre.detail}`);
ok('SQL réel : une nomenclature dont aucun mot n’est rare tient quand même dans 512 Mo', serre.tenu);
if (serre.tenu)
  ok('SQL réel : sous cette contrainte, les 20 000 lignes sont toutes rendues',
    Number((await serre.demande('SELECT COUNT(*)::BIGINT AS lignes FROM "v13_codee"'))[0].lignes) === 20000);

const distinct = await coderSousContrainte(VOCABULAIRE_QUI_DISTINGUE);
console.log(`   20 000 lignes contre 3 000 types, vocabulaire distinctif, 512 Mo : ${distinct.tenu ? distinct.secondes.toFixed(1) + ' s' : 'ÉCHEC — ' + distinct.detail}`);
ok('SQL réel : quand chaque type a un mot bien à lui, le plafond des candidats ne perd rien', distinct.tenu &&
  Number((await distinct.demande(`SELECT COUNT(*)::BIGINT AS lignes FROM "v13_codee"
    WHERE __code = 'PMP-' || (CAST(substr(REPERE, 3) AS BIGINT) % 3000)`))[0].lignes) === 20000);

let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
process.exit(fail||perr.length?1:0);
