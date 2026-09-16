import fs from 'fs';
// V13.4 : clé composite d'un lien (écran Modèle) et contrôle des tables liées (écran Extraire).
// Le cas de référence : une liste d'éléments rangés par groupe, et un arbre qui classe les éléments.
// Joint sur le seul élément, l'arbre multiplie les lignes ; joint sur (groupe, élément), il ne les multiplie plus.
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
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  // ---- les trois tables du cas : la liste ne porte pas le groupe, c'est la table des affectations qui le donne
  state.tables['te']={id:'te',name:'ELEMENTS',type:'csv',status:'ready',headers:['CODE','ID_AFFECTATION','TYPE_ELEMENT'],config:{},columnsMeta:{}};
  state.tables['taf']={id:'taf',name:'AFFECTATIONS',type:'csv',status:'ready',headers:['ID_AFFECTATION','GROUPE'],config:{},columnsMeta:{}};
  state.tables['ta']={id:'ta',name:'ARBRE',type:'csv',status:'ready',headers:['ELEMENT','GROUPE','NIVEAU'],config:{},columnsMeta:{}};
  state.relations.push({id:'rAffect',sourceTable:'te',targetTable:'taf',sourceCol:'ID_AFFECTATION',targetCol:'ID_AFFECTATION',cardinality:'N-1'});
  state.relations.push({id:'rArbre',sourceTable:'ta',targetTable:'te',sourceCol:'ELEMENT',targetCol:'CODE',cardinality:'N-1'});
  renderTables();
  const lien=()=>state.relations.find(r=>r.id==='rArbre');

  // ---- la clé du lien, sur l'écran Modèle de données
  switchTab(2); renderRelationsList(); await wait(150);
  const ligneCle=()=>el('relationsList').querySelector('.v13-cle-lien[data-rel="rArbre"]');
  ok('Modèle : chaque lien porte une ligne « Clé du lien », avec ses quatre listes', ligneCle() && /Clé du lien/.test(ligneCle().textContent) && ligneCle().querySelectorAll('select').length===4);
  ok('le côté contraint ne propose que les deux bouts du lien', Array.from(el('v13-cle-table-contrainte-rArbre').options).map(o=>o.value).filter(Boolean).sort().join()==='ta,te');
  ok('le côté comparé propose toutes les tables, y compris celle qui n\'est pas au bout du lien', Array.from(el('v13-cle-table-comparee-rArbre').options).some(o=>o.value==='taf'));
  el('v13-cle-table-contrainte-rArbre').value='ta'; el('v13-cle-table-comparee-rArbre').value='taf'; renderRelationsList(); await wait(100);
  ok('les colonnes proposées suivent la table choisie de chaque côté', Array.from(el('v13-cle-colonne-contrainte-rArbre').options).some(o=>o.value==='GROUPE') && Array.from(el('v13-cle-colonne-comparee-rArbre').options).map(o=>o.value).filter(Boolean).sort().join()==='GROUPE,ID_AFFECTATION');
  el('v13-cle-colonne-contrainte-rArbre').value='GROUPE'; el('v13-cle-colonne-comparee-rArbre').value='GROUPE';
  v13AjouterALaCle('rArbre'); await wait(150);
  ok('« + Ajouter à la clé » enregistre la condition, avec ses deux tables', JSON.stringify(lien().extraCols)===JSON.stringify([{deTable:'ta',deColonne:'GROUPE',versTable:'taf',versColonne:'GROUPE'}]));
  ok('la condition posée est affichée en clair, avec de quoi la retirer', /\+ ARBRE\.GROUPE = AFFECTATIONS\.GROUPE/.test(ligneCle().textContent) && ligneCle().querySelector('.v13-paire button'));
  v13AjouterALaCle('rArbre');
  ok('la même condition n\'est pas ajoutée deux fois', lien().extraCols.length===1);

  // ---- la jointure produite : la table comparée est ramenée d'office, et jointe avant
  const plan = advPlanJoins('te', [{tableId:'te',via:''},{tableId:'ta',via:''}]);
  ok('la table des affectations est jointe d\'office, bien que rien ne l\'ait demandée', plan.joins.length===2 && plan.joins.some(j=>j.id==='taf'));
  ok('elle est posée AVANT l\'arbre : sa valeur doit exister quand on la compare', plan.joins[0].id==='taf' && plan.joins[1].id==='ta');
  const versLArbre = plan.joins.find(j=>j.id==='ta');
  ok('la jointure vers l\'arbre porte deux conditions réunies par AND', versLArbre.on.split(' AND ').length===2);
  ok('la deuxième condition compare le GROUPE de l\'arbre à celui des affectations, pas à la table de départ', /"GROUPE"/.test(versLArbre.on.split(' AND ')[1]) && new RegExp(plan.joins[0].alias+'\\."GROUPE"').test(versLArbre.on.split(' AND ')[1]));
  ok('le SQL de comptage pose les jointures en LEFT, pour mesurer ce qui s\'ajoute et non ce qu\'une intersection retirerait', /^SELECT COUNT\(\*\)/.test(v13SqlDeComptage('te', plan.joins, 1)) && /LEFT JOIN "t_taf"/.test(v13SqlDeComptage('te', plan.joins, 1)) && !/LEFT JOIN/.test(v13SqlDeComptage('te', plan.joins, 0)));
  // clé redevenue simple : une seule condition, et plus de détour par les affectations
  lien().extraCols=[];
  const simple = advPlanJoins('te', [{tableId:'te',via:''},{tableId:'ta',via:''}]);
  ok('clé simple : la jointure est celle d\'avant, une seule condition et une seule table jointe', simple.joins.length===1 && simple.joins[0].on.split(' AND ').length===1);
  // une colonne disparue de la table n'est plus prise dans la clé : le lien reste utilisable
  lien().extraCols=[{deTable:'ta',deColonne:'COLONNE_PARTIE',versTable:'taf',versColonne:'GROUPE'}];
  ok('une colonne qui n\'existe plus est ignorée, sans casser la jointure', v13ConditionsDeLaCle(lien()).length===0);
  // une condition qui ne touche aucun bout du lien ne contraint rien : elle est écartée
  lien().extraCols=[{deTable:'taf',deColonne:'GROUPE',versTable:'taf',versColonne:'ID_AFFECTATION'}];
  ok('une condition qui ne touche aucun bout du lien est écartée de la jointure', v13ConditionsPourLaTable(lien(),'ta').length===0);
  lien().extraCols=[{deTable:'ta',deColonne:'GROUPE',versTable:'taf',versColonne:'GROUPE'}];

  // ---- le verdict et le bilan, sur des comptes mesurés
  const gonfle = v13VerdictDeJointure({nomTable:'ARBRE',lignesAvant:3,lignesApres:5});
  ok('verdict : 3 → 5 est une multiplication de facteur 1,67, et la cause probable est nommée', gonfle.multiplie && gonfle.facteur===1.67 && /« ARBRE » multiplie les lignes : 3 → 5/.test(gonfle.phrase) && /colonne à la clé de ce lien/.test(gonfle.phrase));
  const sain = v13VerdictDeJointure({nomTable:'ARBRE',lignesAvant:3,lignesApres:3});
  ok('verdict : un compte inchangé ne multiplie pas, et le dit sans alarmer', !sain.multiplie && sain.facteur===1 && /n’ajoute aucune ligne/.test(sain.phrase));
  ok('un écart sous le seuil reste du bruit ; une table vide ne divise pas par zéro', !v13VerdictDeJointure({nomTable:'X',lignesAvant:1000,lignesApres:1005}).multiplie && v13VerdictDeJointure({nomTable:'X',lignesAvant:0,lignesApres:0}).facteur===1);
  ok('bilan : sans table liée, rien ne peut multiplier', !v13BilanDesJointures([]).multiplie && /Aucune table liée/.test(v13BilanDesJointures([]).phrase));
  const bilanSain = v13BilanDesJointures([{nomTable:'ARBRE',lignesAvant:3,lignesApres:3}]);
  ok('bilan : des jointures saines annoncent que le résultat compte ce qu\'il annonce', !bilanSain.multiplie && /Aucune table liée ne multiplie/.test(bilanSain.phrase));
  const bilanFautif = v13BilanDesJointures([{nomTable:'ARBRE',lignesAvant:3,lignesApres:5},{nomTable:'GROUPES',lignesAvant:5,lignesApres:5}]);
  ok('bilan : les tables fautives sont comptées et le trajet des lignes rappelé de bout en bout', bilanFautif.multiplie && bilanFautif.jointures.length===2 && /1 table\(s\) liée\(s\) multiplient les lignes : 3 au départ, 5 en sortie/.test(bilanFautif.phrase) && /Modèle de données/.test(bilanFautif.phrase));

  // ---- l'écran Extraire : le bouton et l'encadré du verdict
  lien().extraCols=[]; switchTab(3); el('adv-base') && (el('adv-base').value='te'); advSetBase && advSetBase('te'); renderAdvExtract(); await wait(200);
  ok('Extraire : bouton « 🧮 Contrôler les tables liées » à côté du bilan qualité', !!document.querySelector('[onclick="v13ControlerJointures()"]'));
  ok('Extraire : un encadré attend le verdict, au-dessus du bilan qualité', !!el('v13-jointures'));
  v13AfficherLeBilan(bilanFautif); await wait(50);
  ok('le verdict affiché porte l\'alerte, le détail par table et le conseil', el('v13-jointures').querySelector('.v13-jointures.multiplie') && el('v13-jointures').querySelectorAll('.v13-jd.fautive').length===1 && /Modèle de données/.test(el('v13-jointures').textContent));
  v13AfficherLeBilan(bilanSain); await wait(50);
  ok('un verdict rassurant n\'est pas peint en alerte', el('v13-jointures').querySelector('.v13-jointures') && !el('v13-jointures').querySelector('.v13-jointures.multiplie'));
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
