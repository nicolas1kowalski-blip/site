import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const src=fs.readFileSync(D+'v920_gloss.mjs','utf8'); const SEED=src.split('const SEED = `')[1].split('`;')[0].replace(/\\\\'/g,"\\'").replace("elements:[{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}]}","elements:[{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}],usedBy:['p_fact'],definition:'Clé du client',sensitivity:'Interne',examples:'C001 ; C002'}");
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } }); const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async (SEED)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  eval(SEED); switchPhase('gov'); openGovTab('glossary'); openGovTab('catalog');
  const dr=()=>document.getElementById('uxDrawer'); const T=()=>dr().textContent;
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  ok('liste par défaut : pas d\'attributs métier (pas d\'encombrement)', !catRes.some(r=>r.type==='attr'));
  catSet('q','identifiant');
  ok('recherche : l\'attribut métier est trouvé', catRes.some(r=>r.type==='attr' && r.title==='Identifiant'));
  catSet('q',''); catToggleFacet('type','attr');
  ok('facette « Attribut métier » : 3 attributs listés', catRes.filter(r=>r.type==='attr').length===3 && document.getElementById('step-9').textContent.includes('Attribut métier'));
  catToggleFacet('type','attr');
  // objet → attribut
  catOpenFiche(catRes.findIndex(r=>r.type==='bo'));
  ok('fiche objet : attributs cliquables', dr().querySelectorAll('.cat-link').length===3 && !dr().querySelector('.cat-nav'));
  dr().querySelector('.cat-link').click();
  ok('clic sur un attribut : fiche attribut ouverte', _catFicheCtx.type==='attr' && _catFicheCtx.title==='Identifiant' && document.getElementById('uxDrawerTitle').textContent==='Identifiant');
  ok('fiche attribut : appartient à (lien objet), détail, termes, provenance, utilisé par', T().includes('Appartient à') && T().includes('🏛️ Client') && T().includes('Nombre de valeurs') && T().includes('Interne') && T().includes('C001') && T().includes("Alimenté par") && T().includes('CLIENTS.ID') && T().includes('Utilisé par') && T().includes('Facturation') && dr().querySelector('input.term-add'));
  ok('← Retour vers « Client » + fil d\'Ariane', dr().querySelector('.cat-back') && dr().querySelector('.cat-back').textContent.includes('Client') && dr().querySelector('.cat-nav .crumb b').textContent==='Identifiant');
  ok('pied : « Modifier dans l\'objet »', dr().innerHTML.includes('catEditInObject'));
  // attribut → colonne → retour
  catOpenByKey({type:'column',tbl:'CLIENTS',col:'ID'});
  ok('attribut → colonne (couche Tout basculée), lien retour vers l\'attribut alimenté', _catFicheCtx.type==='column' && T().includes("Alimente l'attribut métier") && dr().querySelector('.cat-back').textContent.includes('Identifiant'));
  catBack();
  ok('← Retour : fiche attribut', _catFicheCtx.type==='attr' && _catFicheCtx.title==='Identifiant');
  catBack();
  ok('← Retour : fiche objet, plus de barre de navigation', _catFicheCtx.type==='bo' && !dr().querySelector('.cat-nav'));
  catBack();
  ok('← Retour au bout : fermeture', !dr().classList.contains('on'));
  // lineage dans la fiche attribut
  catOpenByKey({type:'attr',bo:'bo1',elId:'e1'}); catGoLineage();
  ok('lineage inline de l\'attribut', document.querySelector('#catLineageWrap svg')!==null && !document.getElementById('catLineageBox').classList.contains('hidden'));
  // ajout de terme depuis la fiche attribut : reconstruite sans casser l'historique
  catOpenByKey({type:'bo',bo:'bo1'}); catOpenByKey({type:'attr',bo:'bo1',elId:'e2'});
  termTagAdd('attr',{boId:'bo1',elId:'e2'},'Revenu');
  ok('ajout de terme : fiche attribut reconstruite, historique intact (retour vers Client)', _catFicheCtx.type==='attr' && T().includes('📖 Revenu') && dr().querySelector('.cat-back').textContent.includes('Client') && _catHist[_catHist.length-1].elId==='e2' && _catHist[_catHist.length-2].type==='bo');
  // terme → attribut précis
  closeUxDrawer(); catOpenByKey({type:'term',id:'gl1'});
  ok('fiche terme : cible = l\'attribut précis', dr().innerHTML.includes('&quot;type&quot;:&quot;attr&quot;'));
  // modifier dans l'objet
  catOpenByKey({type:'attr',bo:'bo1',elId:'e2'}); catEditInObject();
  ok('« Modifier dans l\'objet » : onglet Objets, attribut sélectionné', govState.tab==='objects' && govState.boSel && govState.boSel.elId==='e2' && document.getElementById('boF-name') && document.getElementById('boF-name').value==="Chiffre d'affaires");
  // utiliser cette donnée depuis un attribut
  openGovTab('catalog'); catOpenByKey({type:'attr',bo:'bo1',elId:'e1'}); catUseData();
  ok('« Utiliser cette donnée » depuis un attribut : table de provenance', currentTab===3);
  // consultation
  switchPhase('gov'); openGovTab('catalog'); govSetReadOnly(true); catOpenByKey({type:'bo',bo:'bo1'});
  ok('consultation : liens attribut et retour conservés (data-ro=keep)', dr().querySelector('.cat-link').getAttribute('data-ro')==='keep');
  govSetReadOnly(false); closeUxDrawer();
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,3).forEach(e=>console.log('  ',e));
await p.evaluate(()=>{ switchPhase('gov'); openGovTab('catalog'); catOpenByKey({type:'bo',bo:'bo1'}); catOpenByKey({type:'attr',bo:'bo1',elId:'e1'}); });
await p.waitForTimeout(400); await p.screenshot({ path: D+'attr_fiche.png' });
await b.close(); process.exit(fail||perr.length?1:0);
