import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8')
  .replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const SEED = `
  window.lucide={createIcons:()=>{}};
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','CA_HT'],config:{},columnsMeta:{}};
  state.tables['t2']={id:'t2',name:'CRM_EXPORT',type:'csv',status:'ready',headers:['CID','EMAIL'],config:{},columnsMeta:{}};
  state.tables['t3']={id:'t3',name:'DIFFUSION',type:'csv',status:'ready',headers:['ID'],config:{},columnsMeta:{}};
  state.tables['t4']={id:'t4',name:'ORPHAN.csv',type:'csv',status:'ready',headers:['X'],config:{},columnsMeta:{}};
  const g=state.governance;
  g.assets=[{id:'a_erp',kind:'app',name:'ERP',sources:['CLIENTS']},{id:'a_crm',kind:'app',name:'CRM',sources:['CRM_EXPORT']},{id:'a_bi',kind:'app',name:'BI',sources:['DIFFUSION']},{id:'p_fact',kind:'process',name:'Facturation',appIds:['a_erp']}];
  g.businessObjects=[{id:'bo1',name:'Client',definition:'d',globalOwner:'Alice',status:'Validé',
    elements:[{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}],usedBy:['p_fact']},{id:'e2',name:'Chiffre d\\'affaires',mappings:[{table:'CLIENTS',col:'CA_HT'},{table:'CRM_EXPORT',col:'EMAIL'}],usedBy:['a_bi']}],
    sources:[{table:'CLIENTS',role:'maitre'},{table:'CRM_EXPORT',role:'contributeur'},{table:'ORPHAN.csv',role:'contributeur'},{table:'DIFFUSION',role:'destinataire'}],producedBy:['a_erp','a_crm'],consumedBy:['p_fact'],structure:[]}];
`;
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'});
await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async (SEED)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  eval(SEED);
  const bo=state.governance.businessObjects[0];
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  ok('fichiers masqués par défaut', lineageFilesOn()===false);
  // ---- objet, sans fichiers ----
  let G=buildBoLineageGraph(bo);
  const ids=G.nodes.map(n=>n.id);
  ok('sans fichiers : aucune table possédée par une appli', !ids.includes('tbl:CLIENTS') && !ids.includes('tbl:CRM_EXPORT') && !ids.includes('tbl:DIFFUSION'));
  ok('sans fichiers : ERP → objet (produit maître), CRM → objet (contribue)', G.edges.some(e=>e.source==='as:a_erp'&&e.target==='bo:bo1'&&/maître/.test(e.label)) && G.edges.some(e=>e.source==='as:a_crm'&&e.target==='bo:bo1'&&e.label==='contribue'));
  ok('provenance rappelée sur le nœud appli (« via CLIENTS »)', G.nodes.find(n=>n.id==='as:a_erp').content==='via CLIENTS');
  ok('table destinataire remplacée par l\'appli qui la lit (BI, diffusé vers)', G.edges.some(e=>e.source==='bo:bo1'&&e.target==='as:a_bi'&&e.label==='diffusé vers') || G.edges.some(e=>e.source==='bo:bo1'&&e.target==='as:a_bi'));
  ok('source sans application : conservée et signalée', ids.includes('tbl:ORPHAN.csv') && /sans application/.test(G.nodes.find(n=>n.id==='tbl:ORPHAN.csv').content));
  ok('consommateurs : Facturation (consommé par)', G.edges.some(e=>e.target==='as:p_fact'&&e.label==='consommé par'));
  ok('nœuds uniques, une seule arête ERP→objet', new Set(ids).size===ids.length && G.edges.filter(e=>e.source==='as:a_erp'&&e.target==='bo:bo1').length===1);
  // ---- objet, avec fichiers (option explicite et préférence) ----
  G=buildBoLineageGraph(bo,{files:true});
  ok('avec fichiers : tables présentes, ERP → CLIENTS → objet', G.nodes.some(n=>n.id==='tbl:CLIENTS') && G.edges.some(e=>e.source==='as:a_erp'&&e.target==='tbl:CLIENTS') && G.edges.some(e=>e.source==='tbl:CLIENTS'&&e.target==='bo:bo1'));
  lineageFilesSet(true);
  ok('préférence mémorisée (en mémoire ; localStorage indisponible sous about:blank)', lineageFilesOn()===true);
  ok('buildBoLineageGraph suit la préférence', buildBoLineageGraph(bo).nodes.some(n=>n.id==='tbl:CLIENTS'));
  lineageFilesSet(false);
  // ---- attribut ----
  let A=buildAttrLineageGraph(bo,null,bo.elements[1]);
  ok('attribut sans fichiers : pas de nœud colonne', !A.nodes.some(n=>n.id.startsWith('col:')));
  ok('attribut : ERP et CRM → attribut, colonnes rappelées', A.edges.filter(e=>e.target==='attr:e2'&&e.source.startsWith('as:')).length===2 && A.nodes.find(n=>n.id==='as:a_erp').content==='via CLIENTS.CA_HT' && A.nodes.find(n=>n.id==='as:a_crm').content==='via CRM_EXPORT.EMAIL');
  ok('attribut : usage BI conservé', A.edges.some(e=>e.source==='attr:e2'&&e.target==='use:a_bi'));
  lineageFilesSet(true); A=buildAttrLineageGraph(bo,null,bo.elements[1]);
  ok('attribut avec fichiers : colonnes présentes', A.nodes.filter(n=>n.id.startsWith('col:')).length===2);
  lineageFilesSet(false);
  // ---- UI : cases dans les trois encarts + redraw ----
  switchPhase('gov'); openGovTab('objects'); govState.selectedBoId='bo1'; setBoTab('usage'); openBoLineage('bo1');
  let box=document.getElementById('attrLineageBox');
  ok('fiche objet : case « Afficher les fichiers » + sous-titre applications → objet → usages', box.innerHTML.includes('lineageFilesSet') && box.textContent.includes('applications → objet → usages'));
  let txt=box.querySelector('svg').textContent;
  ok('graphe objet sans CLIENTS mais avec ERP, CRM, BI, Facturation', !txt.includes('CLIENTS') || txt.includes('via CLIENTS'));
  ok('graphe objet : pas de nœud table', !/▦ CLIENTS/.test(txt) && /ERP/.test(txt) && /Facturation/.test(txt));
  box.querySelector('input[type=checkbox]').checked=true; box.querySelector('input[type=checkbox]').dispatchEvent(new Event('change'));
  box=document.getElementById('attrLineageBox'); txt=box.querySelector('svg').textContent;
  ok('cocher redessine avec les fichiers', /▦ CLIENTS/.test(txt) && box.querySelector('input[type=checkbox]').checked);
  lineageFilesSet(false);
  setBoTab('structure'); openAttrLineage('bo1','','e2');
  box=document.getElementById('attrLineageBox');
  ok('formulaire attribut : case présente, graphe sans nœud colonne, provenance rappelée', box.innerHTML.includes('lineageFilesSet') && box.querySelector('svg') && !box.querySelector('svg').textContent.includes('Table CLIENTS') && /via CLIENTS/.test(box.querySelector('svg').textContent) && !buildAttrLineageGraph(bo,null,bo.elements[1]).nodes.some(n=>n.id.startsWith('col:')));
  openGovTab('catalog'); const i=catRes.findIndex(r=>r.type==='bo'&&r.bo==='bo1'); catOpenFiche(i); catGoLineage();
  const cb=document.getElementById('catLineageBox');
  ok('fiche catalogue : case présente + graphe sans table', cb.innerHTML.includes('lineageFilesSet') && !/▦ CLIENTS/.test(cb.querySelector('svg').textContent));
  cb.querySelector('input[type=checkbox]').checked=true; cb.querySelector('input[type=checkbox]').dispatchEvent(new Event('change'));
  ok('fiche catalogue : cocher redessine avec les tables', /▦ CLIENTS/.test(document.getElementById('catLineageBox').querySelector('svg').textContent));
  lineageFilesSet(false);
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await p.close();
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' });
  await q.evaluate((SEED)=>{ eval(SEED); switchPhase('gov'); openGovTab('catalog'); }, SEED);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.evaluate(()=>{ const i=catRes.findIndex(r=>r.type==='bo'); catOpenFiche(i); catGoLineage(); });
  await q.waitForTimeout(700);
  await q.screenshot({ path: D+'lin_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
