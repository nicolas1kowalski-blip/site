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
const seed = `['CLIENTS','CONTRATS'].forEach((n,i)=>{ state.tables['t'+i]={id:'t'+i,name:n,type:'csv',status:'ready',headers:['ID','CODE','PRIME'],config:{},columnsMeta:{}}; });
  state.governance.assets=[{id:'app1',name:'Gestion des tiers',kind:'app',sources:['CLIENTS']},{id:'app2',name:'Gestion des contrats',kind:'app',sources:['CONTRATS']},{id:'pr1',name:'Moteur de reporting',kind:'process'},{id:'app3',name:'Portail régulateur',kind:'app'},
    {id:'rp1',name:'Rapport Solvabilité II',kind:'report',producedBy:['pr1'],deliveredTo:['app3'],recipients:'ACPR, Direction financière',frequency:'Trimestrielle',format:'Fichier réglementaire',boIds:['bo2'],criticality:'Critique'},
    {id:'c1',name:'CRM',kind:'app'},{id:'c2',name:'Marketing',kind:'app'},{id:'c3',name:'Facturation',kind:'app'},{id:'c4',name:'Archivage',kind:'app'},{id:'c5',name:'Data lake',kind:'app'}];
  state.governance.businessObjects.push(
    {id:'bo1',name:'Personne',definition:'',globalOwner:'',contributors:[],producedBy:['app1'],sources:[{table:'CLIENTS',role:'maitre'}],structure:[],elements:[{id:'e1',name:'Adresse',mappings:[{table:'CLIENTS',col:'CODE'}],usedBy:[]}]},
    {id:'bo2',name:'Contrat',definition:'',globalOwner:'Paul',contributors:[],producedBy:['app2'],consumedBy:['c1','c2','c3','c4','c5'],sources:[{table:'CONTRATS',role:'maitre'}],structure:[],elements:[{id:'e2',name:'Prime',mappings:[{table:'CONTRATS',col:'PRIME'}],usedBy:['rp1']},{id:'e3',name:'Adresse de risque',mappings:[],usedBy:[],origins:[{boId:'bo1',elId:'e1',kind:'copy',rule:''}]}]});
  renderTables();`;
const out = await p.evaluate(async (seed)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms)); const BO=id=>state.governance.businessObjects.find(b=>b.id===id); const EL=(b,e)=>BO(b).elements.find(x=>x.id===e);
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  eval(seed); govState.lineageFiles=false;
  ok('type d\'actif « Restitution » déclaré (📊), libellé via assetLabel', ASSET_KINDS.report && ASSET_KINDS.report[1]==='Restitution' && assetLabel(assetById('rp1'))==='📊 Rapport Solvabilité II');
  // écran Applications & processus
  openGovTab('assets'); await wait(150);
  const gc=el('govContent');
  ok('section « Restitutions (1) » avec bouton + Restitution ; le rapport apparaît en ligne (liste V11) avec l\'icône 📊', /Restitutions \(1\)/.test(gc.textContent) && gc.querySelector('.v12rep-sect') && el('v11-as-rp1') && (/📊/.test(el('v11-as-rp1').querySelector('span').textContent) || el('v11-as-rp1').querySelector('span svg')) && /Rapport Solvabilité II/.test(el('v11-as-rp1').textContent));
  v11State.selAsset='rp1'; renderGovernance(); await wait(100);
  ok('fiche en lecture de la restitution : Restitution, générée par, diffusée à', /Restitution/.test(el('v11-as-rp1').textContent) && /Moteur de reporting/.test(el('v11-as-rp1').textContent) && /ACPR/.test(el('v11-as-rp1').textContent));
  v11State.edit['asset:rp1']=true; renderGovernance(); await wait(100);
  const card=el('govContent').querySelector('.v12rep-card');
  ok('mode modification : carte de la restitution avec ses champs', card && /Rapport Solvabilité II/.test(card.textContent));
  ok('carte : générée par Moteur de reporting, diffusée à Portail régulateur + destinataires externes, fréquence, forme, objet Contrat, 1 attribut utilisé', /Moteur de reporting/.test(card.textContent) && /Portail régulateur/.test(card.textContent) && card.querySelector('input[value="ACPR, Direction financière"]') && Array.from(card.querySelectorAll('select')).some(s=>s.value==='Trimestrielle') && Array.from(card.querySelectorAll('select')).some(s=>s.value==='Fichier réglementaire') && /Contrat/.test(card.textContent) && /utilise 1 attribut/.test(card.textContent) && /Contrat › Prime/.test(card.textContent));
  v11State.edit['asset:rp1']=false; const n0=state.governance.assets.length; v12RepAdd(); await wait(100);
  ok('+ Restitution : nouvel actif de type report avec les champs prêts', state.governance.assets.length===n0+1 && state.governance.assets[n0].kind==='report' && Array.isArray(state.governance.assets[n0].deliveredTo) && /Restitutions \(2\)/.test(el('govContent').textContent));
  const nid=state.governance.assets[n0].id; v12RepLink(nid,'producedBy','app2',true); v12RepLink(nid,'deliveredTo','c1',true); ok('relier générée par / diffusée à', assetById(nid).producedBy.includes('app2') && assetById(nid).deliveredTo.includes('c1'));
  v12RepLink(nid,'deliveredTo','c1',false); window.confirm=()=>true; removeGovAsset(nid); await wait(50); ok('retrait d\'un destinataire puis suppression de la restitution', !assetById(nid));
  // usages d'un attribut : la restitution est cochable
  v11EditAttr('bo2','','e2'); await wait(100);
  ok('fiche de l\'attribut Prime : la restitution apparaît dans les usages, cochée', Array.from(el('boDetail').querySelectorAll('.bo-use')).some(l=>/Rapport Solvabilité II/.test(l.textContent) && l.querySelector('input').checked && /'rp1'/.test(l.querySelector('input').getAttribute('onchange'))));
  // graphe d'attribut : chaîne complète
  let g=buildAttrLineageGraph(BO('bo2'),null,EL('bo2','e2'));
  ok('graphe de Prime : restitution en aval (style ambre), générée par Moteur de reporting, diffusée à Portail régulateur et aux destinataires externes', g.nodes.some(n=>n.id==='use:rp1' && n.fill==='#fef3c7' && /📊/.test(n.title) && /trimestrielle/.test(n.content)) && g.edges.some(e=>e.source==='as:pr1' && e.target==='use:rp1' && e.label==='génère') && g.edges.some(e=>e.source==='use:rp1' && e.target==='as:app3' && e.label==='diffusée à') && g.nodes.some(n=>n.id==='rcp:rp1' && /ACPR/.test(n.title)));
  // graphe d'objet : restitution + 5 consommateurs
  g=buildBoLineageGraph(BO('bo2'));
  ok('graphe de Contrat : restitution reliée (rattachée + 1 attribut), chaîne génère / diffusée à', g.nodes.some(n=>n.id==='as:rp1' && n.fill==='#fef3c7') && g.edges.some(e=>e.source==='bo:bo2' && e.target==='as:rp1') && g.edges.some(e=>e.source==='as:pr1' && e.target==='as:rp1') && g.edges.some(e=>e.source==='as:rp1' && e.target==='as:app3'));
  const rows=v12BoLinSynth(BO('bo2'), g); ok('synthèse : type « restitution » et « destinataires »', rows.some(r=>r.kind==='restitution') && rows.some(r=>r.kind==='destinataires'));
  // repli
  v12State.linOpen=new Set(); v12State.linOpenAll=false; v12State.linFoldMin=4;
  const f=v12LinFold(g,'bo:bo2');
  const grp=f.nodes.find(n=>n.id==='grp:aval:application');
  ok('repli : les 5 applications consommatrices deviennent un groupe « 5 applications en aval », les membres disparaissent', grp && /5 applications en aval/.test(grp.title) && /CRM/.test(grp.content) && !f.nodes.some(n=>n.id==='as:c1') && f.nodes.length===g.nodes.length-4);
  ok('repli : liens fusionnés vers le groupe avec leur nombre, autres nœuds intacts', f.edges.some(e=>e.source==='bo:bo2' && e.target==='grp:aval:application' && /×5|5 liens/.test(e.label)) && f.nodes.some(n=>n.id==='as:rp1') && f.nodes.some(n=>n.id==='as:app2'));
  ok('en dessous du seuil, pas de groupe (restitution seule, objet amont seul)', !f.nodes.some(n=>/^grp:(aval:report|amont:objet)/.test(n.id)));
  v12State.linOpen.add('aval:application'); const f2=v12LinFold(g,'bo:bo2'); ok('groupe ouvert : les 5 applications réapparaissent', !f2.nodes.some(n=>n.id==='grp:aval:application') && f2.nodes.some(n=>n.id==='as:c1') && f2.nodes.length===g.nodes.length);
  v12State.linOpen=new Set(); v12State.linFoldMin=2; const f3=v12LinFold(g,'bo:bo2');
  ok('seuil 2 : plusieurs groupes (applications aval, et la restitution reste seule dans son type)', Object.keys(v12State.linGroups).length>=1 && f3.nodes.some(n=>n.id==='grp:aval:application'));
  v12State.linFoldMin=4;
  // rendu réel avec barre
  govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); await wait(100); openBoLineage('bo2'); await wait(200);
  const box=el('attrLineageBox');
  ok('lineage de l\'objet : barre Réduire / Tout développer / seuil, 1 groupe signalé, graphe rendu', box.querySelector('.v12lf-bar') && /Tout développer/.test(box.textContent) && box.querySelector('.v12lf-bar select') && /1 groupe/.test(box.querySelector('.v12lf-bar').textContent) && el('attrLineageWrap').querySelector('svg'));
  ok('une seule barre après réouverture', (()=>{ openBoLineage('bo2'); return box.querySelectorAll('.v12lf-bar').length===1; })());
  v12LinToggle('aval:application'); await wait(150); ok('ouvrir le groupe (clic) : redessiné sans groupe, bouton Réduire actif', !box.querySelector('.v12lf-bar .n') && !box.querySelector('.v12lf-bar button').disabled);
  v12LinAll(false); await wait(150); ok('Réduire : le groupe revient', /1 groupe/.test(box.querySelector('.v12lf-bar').textContent));
  v12LinAll(true); await wait(150); ok('Tout développer : plus de groupe', !box.querySelector('.v12lf-bar .n')); v12LinAll(false); await wait(100);
  // lineage d'attribut aussi repliable
  v11EditAttr('bo2','','e2'); await wait(100); openAttrLineage('bo2','','e2'); await wait(200);
  ok('lineage d\'attribut : barre présente et graphe rendu', el('attrLineageBox').querySelector('.v12lf-bar') && el('attrLineageWrap').querySelector('svg'));
  // carte des flux
  const d={nodes:[{id:'bo:bo2'},{id:'as:pr1'},{id:'as:app3'}],edges:[]}; v12OrgLineageEdges(d);
  ok('carte des flux : la restitution ajoutée avec Contrat → rapport (1 attribut), Moteur → rapport, rapport → Portail', d.nodes.some(n=>n.id==='as:rp1') && d.edges.some(e=>e.source==='bo:bo2' && e.target==='as:rp1' && /1 attribut/.test(e.label)) && d.edges.some(e=>e.source==='as:pr1' && e.target==='as:rp1') && d.edges.some(e=>e.source==='as:rp1' && e.target==='as:app3'));
  let threw=false; try { openGovTab('lineage'); govState.lineageView='graph'; renderLineageGraph(); } catch(e){ threw=true; } ok('rendu réel de la carte des flux : pas d\'exception', !threw);
  // fiche en lecture
  const rh=v11AssetRead(assetById('rp1')); ok('fiche en lecture : Restitution, générée par, diffusée à, 1 attribut', /Restitution/.test(rh) && /générée par : ⚙️ Moteur de reporting/.test(rh) && /Portail régulateur/.test(rh) && /ACPR/.test(rh) && /utilise 1 attribut/.test(rh));
  ok('persistance : la restitution fait partie de la configuration sauvegardée', JSON.stringify(collectPersistedConfig()).includes('Rapport Solvabilité II'));
  ok('lexique : restitution, groupe', !!V11_LEXIQUE['restitution'] && !!V11_LEXIQUE['groupe (lineage)']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, seed);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate((seed)=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} eval(seed); govState.lineageFiles=false; openGovTab('assets'); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); }, seed);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(300); await q.evaluate(()=>{ const s=document.querySelector('.v12rep-sect'); if(s) s.scrollIntoView({block:'start'}); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'rp_assets_'+theme+'.png' });
  await q.evaluate(()=>{ govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); openBoLineage('bo2'); }); await q.waitForTimeout(500); await q.evaluate(()=>{ const s=el('attrLineageBox'); if(s) s.scrollIntoView({block:'start'}); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'rp_fold_'+theme+'.png' });
  await q.evaluate(()=>{ v12LinAll(true); }); await q.waitForTimeout(500); await q.evaluate(()=>{ const s=el('attrLineageWrap'); if(s) s.scrollIntoView({block:'center'}); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'rp_open_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
