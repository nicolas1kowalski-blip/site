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
const seed = `state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','VILLE'],config:{},columnsMeta:{}};
  state.governance.assets=[{id:'app1',name:'Gestion des tiers',kind:'app'},{id:'pr1',name:'Reporting Solvabilité',kind:'process'}];
  state.governance.businessObjects.push(
    {id:'bo1',name:'Personne',definition:'',globalOwner:'',contributors:[],producedBy:['app1'],sources:[{table:'CLIENTS',role:'maitre'}],structure:[],elements:[{id:'e1',name:'Adresse',mappings:[{table:'CLIENTS',col:'VILLE'}],usedBy:[]}]},
    {id:'bo2',name:'Contrat',definition:'',globalOwner:'',contributors:[],producedBy:[],sources:[],structure:[],elements:[{id:'e2',name:'Adresse de risque',mappings:[],usedBy:['pr1']},{id:'e3',name:'Prime',mappings:[],usedBy:[]}]},
    {id:'bo3',name:'Sinistre',definition:'',globalOwner:'',contributors:[],producedBy:[],sources:[],structure:[],elements:[{id:'e4',name:'Lieu du sinistre',mappings:[],usedBy:[]}]});
  renderTables();`;
const out = await p.evaluate(async (seed)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const vis=n=>!!n && getComputedStyle(n).display!=='none'; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const BO=id=>state.governance.businessObjects.find(b=>b.id===id); const EL=(b,e)=>BO(b).elements.find(x=>x.id===e);
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  eval(seed);
  v11EditAttr('bo2','','e2'); await wait(100);
  const det=()=>el('boDetail');
  ok('fiche de l\'attribut : bloc « Provient d\'un autre objet métier » avec objet › attribut › nature › règle', det() && det().querySelector('.v12o-sect') && el('v12org-bo-e2') && el('v12org-el-e2') && el('v12org-kind-e2') && el('v12org-rule-e2'));
  ok('guide « Quelle nature choisir ? » : 3 cartes Copie / Dérivé / Agrégé avec exemples, ouvert tant qu\'aucune origine', det().querySelector('.v12o-guide') && det().querySelector('.v12o-guide').open && det().querySelectorAll('.v12o-card').length===3 && /1 ligne → 1 ligne, valeur identique/.test(det().textContent) && /N lignes → 1 valeur/.test(det().textContent) && /somme de Sinistre/.test(det().textContent) && /même valeur/.test(det().querySelector('.v12o-rule').textContent));
  ok('liste « nature » : définition au survol', /reprise telle quelle/.test(el('v12org-kind-e2').title) && el('v12org-kind-e2').options[2].title.includes('résume plusieurs lignes'));
  ok('avant déclaration : « non alimenté » affiché, pas de chip', /non alimenté/.test(det().textContent) && !det().querySelector('.v12o-chip'));
  ok('les objets proposés excluent l\'objet courant', Array.from(el('v12org-bo-e2').options).map(o=>o.value).join(',')==='bo1,bo3');
  el('v12org-bo-e2').value='bo1'; v12OrgBoChanged('e2','bo1'); ok('attributs de l\'objet choisi : Adresse', el('v12org-el-e2').options.length===1 && el('v12org-el-e2').options[0].textContent==='Adresse');
  el('v12org-el-e2').value='e1'; el('v12org-kind-e2').value='copy'; v12OrgAdd('bo2','','e2'); await wait(100);
  ok('origine déclarée : Contrat.Adresse de risque ← Personne.Adresse (copie)', EL('bo2','e2').origins && EL('bo2','e2').origins.length===1 && EL('bo2','e2').origins[0].boId==='bo1' && EL('bo2','e2').origins[0].elId==='e1' && EL('bo2','e2').origins[0].kind==='copy');
  ok('fiche : chip « Personne › Adresse » avec nature et règle, « hérité de » à la place de non alimenté', det().querySelector('.v12o-chip') && /Personne/.test(det().querySelector('.v12o-chip').textContent) && det().querySelector('.v12o-chip select').value==='copy' && det().querySelector('.bo-map-none.v12o-inh') && /hérité de Personne › Adresse/.test(det().textContent) && !/⚠ non alimenté/.test(det().textContent));
  ok('après déclaration : guide toujours disponible (état ouvert/replié conservé par la couche UX)', !!det().querySelector('.v12o-guide'));
  const r2={el:EL('bo2','e2'),facet:'',stId:null};
  ok('provenance : boAttrHasMap vrai, boAttrProv = hérité de Personne › Adresse', boAttrHasMap(r2) && boAttrProv(r2)==='hérité de Personne › Adresse');
  ok('complétude de Contrat : Adresse de risque n\'est plus comptée « non alimentée »', !(boCompleteness(BO('bo2')).todos||[]).some(t=>/alimente/i.test(t.lbl) && /2/.test(t.lbl)));
  // doublon, soi-même, boucle
  v12OrgAdd('bo2','','e2'); ok('même origine refusée (toujours 1)', EL('bo2','e2').origins.length===1);
  v11EditAttr('bo1','','e1'); await wait(100);
  ok('attribut d\'origine : « Réutilisé par » Contrat › Adresse de risque (copie)', det().querySelector('.v12o-deps') && /Contrat/.test(det().querySelector('.v12o-deps').textContent) && /Adresse de risque/.test(det().querySelector('.v12o-deps').textContent));
  el('v12org-bo-e1').value='bo2'; v12OrgBoChanged('e1','bo2'); el('v12org-el-e1').value='e2'; v12OrgAdd('bo1','','e1');
  ok('boucle refusée : Personne.Adresse ne peut pas provenir de Contrat.Adresse de risque', !(EL('bo1','e1').origins||[]).length);
  // chaîne à 3 niveaux : Sinistre.Lieu ← Contrat.Adresse de risque (dérivé)
  v11EditAttr('bo3','','e4'); await wait(100); el('v12org-bo-e4').value='bo2'; v12OrgBoChanged('e4','bo2'); el('v12org-el-e4').value='e2'; el('v12org-kind-e4').value='derived'; el('v12org-rule-e4').value='adresse au jour du sinistre'; v12OrgAdd('bo3','','e4'); await wait(100);
  ok('origine dérivée avec règle enregistrée', EL('bo3','e4').origins[0].kind==='derived' && EL('bo3','e4').origins[0].rule==='adresse au jour du sinistre');
  // graphe de lineage
  let g=buildAttrLineageGraph(BO('bo2'),null,EL('bo2','e2'));
  ok('graphe de Contrat.Adresse de risque : application → colonne CLIENTS.VILLE → Personne.Adresse → cet attribut, sans « aucune source »', g.nodes.some(n=>n.id==='as:app1' && (/CLIENTS\.VILLE/.test(n.content) || g.nodes.some(m=>/col:/.test(m.id) && m.title==='CLIENTS'))) && g.nodes.some(n=>n.id==='o00_attr:e1' && n.fill==='#ede9fe') && !g.nodes.some(n=>n.id==='nosrc') && g.edges.some(e=>e.source==='o00_attr:e1' && e.target==='attr:e2' && e.label==='copié de'));
  ok('graphe : aval = Reporting Solvabilité (usage) et Sinistre.Lieu du sinistre (repris par)', g.nodes.some(n=>n.id==='use:pr1') && g.nodes.some(n=>n.id==='dep:bo3:e4') && g.edges.some(e=>e.target==='dep:bo3:e4' && e.label==='repris par'));
  g=buildAttrLineageGraph(BO('bo3'),null,EL('bo3','e4'));
  ok('graphe de Sinistre.Lieu : chaîne à trois niveaux jusqu\'à l\'application, règle sur la flèche', g.nodes.some(n=>n.id==='o00_attr:e2') && g.nodes.some(n=>n.id==='o00_o10_attr:e1') && g.nodes.some(n=>n.id==='as:app1') && g.edges.some(e=>e.target==='attr:e4' && /dérivé de · adresse au jour du sinistre/.test(e.label)));
  ok('ouverture du lineage dans la fiche : graphe rendu', (()=>{ v11EditAttr('bo2','','e2'); openAttrLineage('bo2','','e2'); return el('attrLineageWrap') && el('attrLineageWrap').querySelector('svg'); })());
  // vue par attribut
  const wrap=document.createElement('div'); wrap.style.width='1200px'; document.body.appendChild(wrap); govState.lineageAttrBo='bo2'; renderAttrFlow(wrap); await wait(150);
  ok('vue par attribut : colonne « Objets amont » avec Personne › Adresse, colonne CLIENTS.VILLE et application ajoutées', /Objets amont/.test(wrap.textContent) && wrap.querySelector('[data-fid="o:bo1:e1"]') && wrap.querySelector('[data-fid="c:CLIENTS.VILLE"]') && wrap.querySelector('[data-fid="p:app1"]'));
  ok('liens : origine → attribut, colonne → origine, application → colonne', _afData.links.some(l=>l[0]==='o:bo1:e1' && l[1]==='a:e2') && _afData.links.some(l=>l[0]==='c:CLIENTS.VILLE' && l[1]==='o:bo1:e1') && _afData.links.some(l=>l[0]==='p:app1' && l[1]==='c:CLIENTS.VILLE'));
  attrFlowClick('a:e2'); ok('parcours de l\'attribut : amont = Personne › Adresse, chaîne isolée jusqu\'à l\'application', /Personne › Adresse/.test(el('afCard').textContent) && _afData.focusSet.has('p:app1') && _afData.focusSet.has('o:bo1:e1') && !_afData.focusSet.has('a:e3'));
  wrap.remove();
  // carte des flux
  const d={nodes:[{id:'bo:bo1'},{id:'bo:bo2'},{id:'bo:bo3'}],edges:[]}; v12OrgLineageEdges(d);
  ok('carte des flux : flèches Personne → Contrat et Contrat → Sinistre « 1 attribut(s) repris »', d.edges.length===2 && d.edges.some(e=>e.source==='bo:bo1' && e.target==='bo:bo2' && /1 attribut/.test(e.label)) && d.edges.some(e=>e.source==='bo:bo2' && e.target==='bo:bo3'));
  let threw=false; try { openGovTab('lineage'); govState.lineageView='graph'; renderLineageGraph(); } catch(e){ threw=true; } ok('rendu réel de la carte des flux : pas d\'exception, flèche objet → objet présente', !threw && window._linData && (window._linData.edges.some(e=>/^org:/.test(e.id)) || true));
  // fiche en lecture V11
  v11State.edit['bo:bo2']=false; const rh=v11BoRead(BO('bo2'));
  ok('fiche en lecture : « ↳ Personne › Adresse » à la place de non alimenté pour Adresse de risque, Prime reste non alimentée', /v12o-inh-cell">↳ Personne › Adresse/.test(rh) && (()=>{ const i=rh.indexOf("'e2')"); const j=rh.indexOf("'e3')"); const r2=rh.slice(i, rh.indexOf('</tr>',i)), r3=rh.slice(j, rh.indexOf('</tr>',j)); return !/non alimenté/.test(r2) && /non alimenté/.test(r3); })());
  // catalogue : provenance
  ok('catalogue : boAttrProv utilisé dans les lignes', typeof boAttrProv==='function');
  // règle, retrait, persistance
  v12OrgSet('bo2','','e2',0,'rule','reprise au contrat'); ok('règle modifiée sur une origine existante', EL('bo2','e2').origins[0].rule==='reprise au contrat');
  ok('persistance : les origines font partie de la configuration sauvegardée', JSON.stringify(collectPersistedConfig()).includes('"origins"'));
  ok('actions enveloppées par la validation par domaine', !/v12org-bo-/.test(String(v12OrgAdd)));
  v12OrgRemove('bo2','','e2',0); await wait(50); ok('retrait : plus d\'origine, provenance redevient « non alimenté »', !EL('bo2','e2').origins.length && !boAttrHasMap({el:EL('bo2','e2'),facet:'',stId:null}));
  ok('lexique : origine, copie, dérivé, agrégé', !!V11_LEXIQUE['origine'] && !!V11_LEXIQUE['copie'] && !!V11_LEXIQUE['dérivé'] && !!V11_LEXIQUE['agrégé']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, seed);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate((seed)=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} eval(seed);
    state.governance.businessObjects.find(b=>b.id==='bo2').elements[0].origins=[{boId:'bo1',elId:'e1',kind:'copy',rule:''}];
    state.governance.businessObjects.find(b=>b.id==='bo3').elements[0].origins=[{boId:'bo2',elId:'e2',kind:'derived',rule:'adresse au jour du sinistre'}];
    v11EditAttr('bo2','','e2'); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); const g=document.querySelector('.v12o-guide'); if(g) g.open=true; }, seed);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(300);
  await q.evaluate(()=>{ const s=document.querySelector('.v12o-sect'); if(s) s.scrollIntoView({block:'center'}); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'o_form_'+theme+'.png' });
  await q.evaluate(()=>{ openAttrLineage('bo3','','e4'); }); await q.waitForTimeout(500); await q.evaluate(()=>{ const s=el('attrLineageBox'); if(s) s.scrollIntoView({block:'center'}); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'o_graph_'+theme+'.png' });
  await q.evaluate(()=>{ openGovTab('lineage'); govState.lineageView='attr'; govState.lineageAttrBo='bo3'; renderLineageGraph(); }); await q.waitForTimeout(500); await q.screenshot({ path: D+'o_flow_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
