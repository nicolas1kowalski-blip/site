import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
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
const seed = `['CLIENTS','CONTRATS','SEGMENTS','SINISTRES'].forEach((n,i)=>{ state.tables['t'+i]={id:'t'+i,name:n,type:'csv',status:'ready',headers:['ID','CODE','PRIME','MONTANT'],config:{},columnsMeta:{}}; });
  state.governance.assets=[{id:'app1',name:'Gestion des tiers',kind:'app',sources:['CLIENTS']},{id:'app2',name:'Gestion des contrats',kind:'app',sources:['CONTRATS']},{id:'app3',name:'Scoring',kind:'app'},{id:'app4',name:'Référentiel produits',kind:'app',sources:['SEGMENTS']},{id:'pr1',name:'Reporting Solvabilité',kind:'process'},{id:'pr2',name:'Batch quittancement',kind:'process',tables:['CONTRATS']}];
  state.governance.businessObjects.push(
    {id:'bo1',name:'Personne',definition:'',globalOwner:'',contributors:[],producedBy:['app1'],sources:[{table:'CLIENTS',role:'maitre'}],structure:[],elements:[{id:'e1',name:'Adresse',mappings:[{table:'CLIENTS',col:'CODE'}],usedBy:[]}]},
    {id:'bo2',name:'Contrat',definition:'',globalOwner:'Paul',contributors:[],producedBy:['app2'],sources:[{table:'CONTRATS',role:'maitre'}],structure:[],references:[{boId:'bo4',cardinality:'N–1'}],elements:[{id:'e2',name:'Adresse de risque',mappings:[],usedBy:['pr1'],origins:[{boId:'bo1',elId:'e1',kind:'copy',rule:''}]},{id:'e3',name:'Score',mappings:[],usedBy:[],sourceApp:'app3'},{id:'e5',name:'Segment',mappings:[{table:'SEGMENTS',col:'CODE'}],usedBy:[]},{id:'e6',name:'Prime',mappings:[{table:'CONTRATS',col:'PRIME'}],usedBy:[]}]},
    {id:'bo3',name:'Sinistre',definition:'',globalOwner:'',contributors:[],producedBy:[],sources:[{table:'SINISTRES',role:'maitre'}],structure:[],elements:[{id:'e4',name:'Lieu du sinistre',mappings:[],usedBy:[],origins:[{boId:'bo2',elId:'e2',kind:'derived',rule:'au jour du sinistre'}]}]},
    {id:'bo4',name:'Produit',definition:'',globalOwner:'',contributors:[],producedBy:[],sources:[],structure:[],elements:[]});
  renderTables();`;
const out = await p.evaluate(async (seed)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms)); const BO=id=>state.governance.businessObjects.find(b=>b.id===id);
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  eval(seed);
  govState.lineageFiles=false;
  const g=buildBoLineageGraph(BO('bo2')); const N=id=>g.nodes.find(n=>n.id===id); const E=(s,t)=>g.edges.find(e=>e.source===s && e.target===t);
  ok('producteur de l\'objet toujours là : Gestion des contrats → Contrat', N('as:app2') && E('as:app2','bo:bo2'));
  ok('application source d\'un attribut : Scoring « produit 1 attribut(s) »', N('as:app3') && E('as:app3','bo:bo2') && /produit 1 attribut/.test(E('as:app3','bo:bo2').label));
  ok('table hors fiche Sources : Référentiel produits « alimente 1 attribut(s) via SEGMENTS »', N('as:app4') && E('as:app4','bo:bo2') && /alimente 1 attribut\(s\) via SEGMENTS/.test(E('as:app4','bo:bo2').label) && /SEGMENTS/.test(N('as:app4').content));
  ok('objet amont : Personne « 1 attribut(s) repris (copie) »', N('bo:bo1') && E('bo:bo1','bo:bo2') && /1 attribut\(s\) repris \(copie\)/.test(E('bo:bo1','bo:bo2').label));
  ok('objet aval : Sinistre « reprend 1 attribut(s) »', N('bo:bo3') && E('bo:bo2','bo:bo3') && /reprend 1 attribut/.test(E('bo:bo2','bo:bo3').label));
  ok('objet référencé : Produit « référence N–1 »', N('bo:bo4') && E('bo:bo2','bo:bo4') && /référence N–1/.test(E('bo:bo2','bo:bo4').label));
  ok('processus lecteur de la table : Batch quittancement « lit CONTRATS »', N('as:pr2') && E('bo:bo2','as:pr2') && /lit CONTRATS/.test(E('bo:bo2','as:pr2').label));
  ok('consommateur d\'attribut conservé : Reporting « utilise 1 attribut(s) »', N('as:pr1') && E('bo:bo2','as:pr1'));
  ok('Gestion des contrats n\'est pas compté comme lecteur de sa propre table', !/lit CONTRATS/.test((E('bo:bo2','as:app2')||{}).label||''));
  ok('pas de doublon de nœud, pas de « aucune source / aucun usage »', new Set(g.nodes.map(n=>n.id)).size===g.nodes.length && !N('nosrc') && !N('nouse'));
  // mode fichiers
  const gf=buildBoLineageGraph(BO('bo2'),{files:true});
  ok('avec fichiers : SEGMENTS en table produite par Référentiel produits, alimente Contrat', gf.nodes.some(n=>n.id==='tbl:SEGMENTS') && gf.edges.some(e=>e.source==='as:app4' && e.target==='tbl:SEGMENTS') && gf.edges.some(e=>e.source==='tbl:SEGMENTS' && e.target==='bo:bo2'));
  // synthèse
  const rows=v12BoLinSynth(BO('bo2'), g);
  ok('synthèse : une ligne par élément relié, amont avant aval, rôles renseignés', rows.length===g.nodes.length-1 && rows[0].dir==='amont' && rows.every(r=>r.how) && rows.some(r=>r.title.includes('Scoring') && r.kind==='application' && r.dir==='amont') && rows.some(r=>r.title.includes('Sinistre') && r.dir==='aval' && r.kind==='objet'));
  // ouverture réelle
  govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); await wait(100); openBoLineage('bo2'); await wait(200);
  const box=el('attrLineageBox');
  ok('panneau Synthèse au-dessus du graphe : compteurs amont / aval', box && box.querySelector('.v12bl-synth') && /application\(s\) source/.test(box.textContent) && /objet\(s\) amont/.test(box.textContent) && /objet\(s\) aval/.test(box.textContent) && /processus/.test(box.textContent));
  ok('liste « Tout ce qui est relié » : ' + rows.length + ' lignes, Scoring et Produit présents', box.querySelectorAll('.v12bl-tbl tbody tr').length===rows.length && /Scoring/.test(box.textContent) && /Produit/.test(box.textContent));
  ok('graphe rendu avec une hauteur adaptée (> 300 px)', el('attrLineageWrap').querySelector('svg') && parseInt(el('attrLineageWrap').style.height)>=300);
  openBoLineage('bo2'); await wait(100); ok('réouverture : un seul panneau Synthèse', box.querySelectorAll('.v12bl-synth').length===1);
  // objet vide
  const g4=buildBoLineageGraph(BO('bo4')); ok('objet sans rattachement propre : « référencé par Contrat » ; une référence n\'est ni une source ni un usage, les rappels « aucune source / aucun usage » restent', g4.nodes.some(n=>n.id==='bo:bo2') && g4.edges.some(e=>e.source==='bo:bo2' && e.target==='bo:bo4' && /référencé par/.test(e.label)) && g4.nodes.some(n=>n.id==='nosrc') && g4.nodes.some(n=>n.id==='nouse'));
  // carte des flux
  const d={nodes:[{id:'bo:bo2'},{id:'as:app3'},{id:'as:pr1'},{id:'bo:bo4'},{id:'as:app4'}],edges:[]}; v12OrgLineageEdges(d);
  ok('carte des flux : Scoring → Contrat (1 attribut), Contrat → Reporting, Référentiel produits via SEGMENTS, Contrat → Produit référence', d.edges.some(e=>e.source==='as:app3' && e.target==='bo:bo2') && d.edges.some(e=>e.source==='bo:bo2' && e.target==='as:pr1') && d.edges.some(e=>e.source==='as:app4' && /via SEGMENTS/.test(e.label)) && d.edges.some(e=>e.source==='bo:bo2' && e.target==='bo:bo4'));
  let threw=false; try { openGovTab('lineage'); govState.lineageView='graph'; renderLineageGraph(); } catch(e){ threw=true; } ok('rendu réel de la carte des flux : pas d\'exception', !threw);
  ok('lexique : lineage de l\'objet', !!V11_LEXIQUE['lineage de l\'objet']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, seed);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate((seed)=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} eval(seed); govState.lineageFiles=false; govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); openBoLineage('bo2'); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); }, seed);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(500); await q.evaluate(()=>{ const s=el('attrLineageBox'); if(s) s.scrollIntoView({block:'start'}); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'bl_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
