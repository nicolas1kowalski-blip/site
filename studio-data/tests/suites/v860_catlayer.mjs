import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8')
  .replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'});
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  window.lucide={createIcons:()=>{}};
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  // ---- Jeu de données ----
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','CA_HT','TEL'],config:{},columnsMeta:{},lastRows:120};
  state.tables['t2']={id:'t2',name:'CRM_EXPORT',type:'csv',status:'ready',headers:['CID','EMAIL'],config:{},columnsMeta:{}};
  state.tables['t3']={id:'t3',name:'DIFFUSION',type:'csv',status:'ready',headers:['ID'],config:{},columnsMeta:{}};
  const g=state.governance;
  g.dictionary.CLIENTS={description:'Référentiel client',owner:'Alice',columns:{CA_HT:{definition:'Chiffre affaires HT'}}};
  g.assets=[{id:'a_erp',kind:'app',name:'ERP',sources:['CLIENTS'],criticality:'critique'},{id:'a_crm',kind:'app',name:'CRM',sources:['CRM_EXPORT']},{id:'p_fact',kind:'process',name:'Facturation',appIds:['a_erp']},{id:'a_bi',kind:'app',name:'BI'}];
  g.businessObjects=[{id:'bo1',name:'Client',definition:'Un client facturé',status:'Validé',globalOwner:'Alice',
    elements:[{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}],usedBy:['p_fact','a_bi']},{id:'e2',name:'Chiffre d\'affaires',mappings:[{table:'CLIENTS',col:'CA_HT'}],usedBy:['a_bi']}],
    sources:[{table:'CLIENTS',role:'maitre'},{table:'CRM_EXPORT',role:'contributeur'},{table:'DIFFUSION',role:'destinataire'}],producedBy:['a_erp','a_crm'],consumedBy:['p_fact'],structure:[]},
    {id:'bo2',name:'Orphelin',elements:[],sources:[],structure:[]}];
  g.glossary=[{id:'gl1',term:'Chiffre d\'affaires',definition:'CA',links:[{table:'CLIENTS',col:'CA_HT'}]}];
  // ---- Couche métier par défaut ----
  govState.lineageFiles=true;
  ok('couche par défaut = métier', catState.layer==='metier');
  switchPhase('gov'); openGovTab('catalog');
  const types=()=>new Set(catRes.map(r=>r.type));
  let T=types();
  ok('métier : objets, applis, termes présents', T.has('bo')&&T.has('asset')&&T.has('term'));
  ok('métier : aucune table / colonne / vue', !T.has('table')&&!T.has('column')&&!T.has('view'));
  ok('bascule Métier/Tout rendue, Métier active', document.getElementById('catLayerMetier').classList.contains('on') && document.getElementById('catLayerTout'));
  const hint=document.getElementById('catTechHint');
  ok('indice « n donnée(s) technique(s) masquée(s) » affiché', hint && /\d+ donnée\(s\) technique\(s\) masquée/.test(hint.textContent));
  const nTech=hint?parseInt(hint.textContent.match(/\d+/)[0]):0;
  ok('compte masqué = 3 tables + 7 colonnes', nTech===10);
  ok('hero indique « vue métier »', document.body.innerHTML.includes('vue métier'));
  // recherche technique en couche métier -> état vide honnête
  catSet('q','EMAIL');
  ok('recherche colonne en métier : 0 résultat visible', catRes.length===0);
  ok('état vide propose d\'afficher le technique', /donnée\(s\) technique\(s\) correspondent/.test(document.getElementById('step-9').textContent) && document.getElementById('step-9').innerHTML.includes("catSet('layer','tout')"));
  // synonyme : chercher le terme trouve le terme (métier) et la colonne reste masquée
  catSet('q','chiffre'); T=types();
  ok('recherche « chiffre » en métier : terme + objet, sans colonne', T.has('term') && !T.has('column'));
  // Bascule Tout
  catSet('layer','tout'); T=types();
  ok('couche Tout : colonnes visibles', T.has('column') && catRes.some(r=>r.type==='column'&&r.col==='CA_HT'));
  ok('couche Tout : plus d\'indice masqué', !document.getElementById('catTechHint'));
  ok('hero indique « dans tout le catalogue »', document.body.innerHTML.includes('dans tout le catalogue'));
  catSet('layer','metier'); catSet('q','');
  // facette type technique -> inclusion explicite
  catToggleFacet('type','table'); T=types();
  ok('facette « Table » cochée en métier : tables affichées', T.has('table') && catRes.every(r=>r.type==='table'));
  catToggleFacet('type','table');
  ok('facette retirée : retour vue métier', !types().has('table'));
  // ---- catOpenByKey : lien vers une colonne masquée bascule la couche ----
  catOpenByKey({type:'column',tbl:'CLIENTS',col:'CA_HT'});
  ok('lien vers colonne masquée : couche basculée sur Tout', catState.layer==='tout');
  ok('fiche colonne ouverte', _catFicheCtx && _catFicheCtx.type==='column' && _catFicheCtx.col==='CA_HT' && !document.getElementById('uxDrawer').classList.contains('hidden'));
  closeUxDrawer(); catState.layer='metier'; renderGovernance();
  // fiche terme : cible colonne cliquable même en métier
  const ti=catRes.findIndex(r=>r.type==='term'); catOpenFiche(ti);
  ok('fiche terme : cible colonne cliquable via catOpenByKey', document.getElementById('uxDrawer').innerHTML.includes('catOpenByKey') && document.getElementById('uxDrawer').textContent.includes('CLIENTS.CA_HT'));
  closeUxDrawer(); catState.layer='metier'; renderGovernance();
  // ---- Fiche objet : chaîne + lineage inline ----
  const bi=catRes.findIndex(r=>r.type==='bo'&&r.bo==='bo1'); catOpenFiche(bi);
  const dr=document.getElementById('uxDrawer');
  ok('fiche objet : section « Chaîne de l\'objet »', dr.textContent.includes('Chaîne de l\'objet') && dr.textContent.includes('produit l\'objet') && dr.textContent.includes('source maître') && dr.textContent.includes('consomme l\'objet'));
  ok('fiche objet : compteurs amont/aval', dr.textContent.includes('source(s) amont'));
  catGoLineage();
  const box=document.getElementById('catLineageBox');
  ok('lineage objet affiché DANS la fiche (pas de changement d\'onglet)', box && !box.classList.contains('hidden') && govState.tab==='catalog' && !dr.classList.contains('hidden'));
  ok('drawer élargi comme pour un attribut', dr.classList.contains('wide'));
  const svg=document.querySelector('#catLineageWrap svg');
  ok('graphe SVG rendu', !!svg);
  const txt=svg?svg.textContent:'';
  ok('graphe : objet + sources + applis + consommateurs', txt.includes('Client') && txt.includes('CLIENTS') && txt.includes('CRM_EXPORT') && txt.includes('ERP') && txt.includes('CRM') && txt.includes('Facturation') && txt.includes('BI') && txt.includes('DIFFUSION'));
  ok('graphe : libellés de rôle', txt.includes('maître') && txt.includes('contribue') && txt.includes('diffusé vers'));
  ok('graphe : usage par attributs compté', /utilise 2 attribut/.test(txt));
  ok('bouton « ↗ Par attribut » présent', box.innerHTML.includes('catGoLineageTab'));
  // structure du graphe
  const G=buildBoLineageGraph(g.businessObjects[0]);
  ok('graphe : ERP produit CLIENTS (pas de doublon direct)', G.edges.some(e=>e.source==='as:a_erp'&&e.target==='tbl:CLIENTS') && !G.edges.some(e=>e.source==='as:a_erp'&&e.target==='bo:bo1'));
  ok('graphe : nœuds uniques', new Set(G.nodes.map(n=>n.id)).size===G.nodes.length);
  ok('graphe : BI consommateur via attributs (1 seule arête)', G.edges.filter(e=>e.target==='as:a_bi').length===1 && G.edges.find(e=>e.target==='as:a_bi').label==='utilise 2 attribut(s)');
  ok('graphe : Facturation = consommé par (déclaré prime sur usage attribut)', G.edges.find(e=>e.target==='as:p_fact').label==='consommé par');
  const G2=buildBoLineageGraph(g.businessObjects[1]);
  ok('objet orphelin : placeholders source / usage', G2.nodes.some(n=>n.id==='nosrc') && G2.nodes.some(n=>n.id==='nouse'));
  catGoLineageTab();
  ok('↗ Par attribut : onglet Lineage vue attribut sur l\'objet', govState.tab==='lineage' && govState.lineageView==='attr' && govState.lineageAttrBo==='bo1');
  // ---- Onglet Objets : bouton lineage de l'objet ----
  openGovTab('objects'); govState.selectedBoId='bo1'; setBoTab('usage');
  const btn=Array.from(document.querySelectorAll('#step-9 button')).find(b2=>/Lineage de l'objet/.test(b2.textContent));
  ok('Objets ▸ Applis & usages : bouton « Lineage de l\'objet »', !!btn);
  if(btn) btn.click();
  const ab=document.getElementById('attrLineageBox');
  ok('encart lineage objet ouvert avec graphe', ab && !ab.classList.contains('hidden') && ab.querySelector('svg') && ab.textContent.includes('Lineage de l\'objet « Client »'));
  govState.usageView='byapp'; renderGovernance();
  ok('vue « Par application » : encart lineage disponible', !!document.getElementById('attrLineageBox'));
  openBoLineage('bo1');
  ok('vue « Par application » : lineage objet rendu', document.querySelector('#attrLineageBox svg')!==null);
  // ---- Mode consultation : bascule et lien restent actifs ----
  govSetReadOnly(true); openGovTab('catalog');
  ok('consultation : bascule Métier/Tout cliquable (data-ro=keep)', document.getElementById('catLayerTout').getAttribute('data-ro')==='keep');
  govSetReadOnly(false);
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
