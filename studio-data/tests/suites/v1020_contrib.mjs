import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
p.on('dialog', d=>d.accept());
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async ()=>{
  window.lucide={createIcons:()=>{}}; const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','CA_HT'],config:{},columnsMeta:{},theme:'Finance'};
  state.tables['t2']={id:'t2',name:'CRM',type:'csv',status:'ready',headers:['CID','EMAIL'],config:{},columnsMeta:{}};
  const g=state.governance; g.businessObjects=[{id:'bo1',name:'Client',definition:'d',domain:'Finance',elements:[{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}]},{id:'e2',name:'Nom',mappings:[]}],sources:[{table:'CLIENTS',role:'maitre'}],structure:[]}];
  g.assets=[{id:'a1',kind:'app',name:'ERP',domain:'Finance',sources:['CLIENTS']},{id:'a2',kind:'app',name:'BI',domain:'Finance',sources:[]},{id:'p1',kind:'process',name:'Facturation',domain:'Finance',appIds:[]}];
  const bo=()=>g.businessObjects[0]; const S=()=>document.getElementById('step-9'); const pend=()=>g.proposals.filter(x=>x.status==='pending');
  govDemoPeople(); const ids={}; g.people.forEach(x=>ids[x.name.split(' ')[0]]=x.id);
  switchPhase('gov'); openGovTab('objects'); govState.selectedBoId='bo1'; govState.structView='fiche'; setBoTab('structure');
  ok('Bob contributeur, mention « tout sauf propriétaire et domaine »', curUser().name.startsWith('Bob') && S().textContent.includes('tout sauf propriétaire et domaine'));
  // --- structure : ajout d'attribut ---
  boAddAttrAndSelect('bo1');
  ok('ajout d\'attribut : objet intact (2 attributs), proposition d\'action créée', bo().elements.length===2 && pend().length===1 && pend()[0].kind==='action' && pend()[0].field==='boAddAttrAndSelect');
  ok('résumé lisible : attributs + Nouvel attribut', /attributs : \+ Nouvel attribut/.test(pend()[0].after) && /attributs : 2 élément/.test(pend()[0].before));
  ok('fiche : bloc « Propositions de structure en attente » avec retirer', S().textContent.includes('Propositions de structure en attente (1)') && S().textContent.includes('retirer'));
  // --- renommer un attribut, rattacher une colonne (lecture d'écran) ---
  boAttrWrite('bo1','','e2','name','Nom du client');
  ok('renommer un attribut = proposition de champ (Nom)', bo().elements[1].name==='Nom' && pend().some(x=>x.kind==='attr'&&x.field==='name'&&x.after==='Nom du client'));
  document.body.insertAdjacentHTML('beforeend','<select id="bo-tbl-e2"><option>CRM</option></select><select id="bo-col-e2"><option>EMAIL</option></select>');
  addBoMapping('bo1','e2');
  ok('rattacher une colonne (lit l\'écran) = proposition, mapping absent', !bo().elements[1].mappings.length && pend().some(x=>x.kind==='action'&&x.field==='addBoMapping'&&/attributs : modifié : Nom/.test(x.after)));
  // --- supprimer un attribut, sources, applications, statut, suppression de l'objet ---
  removeBoElement('bo1','e1');
  ok('supprimer un attribut = proposition « − Identifiant »', bo().elements.length===2 && pend().some(x=>x.field==='removeBoElement'&&/− Identifiant/.test(x.after)));
  updateBoSourceRole('bo1','CLIENTS','contributeur');
  ok('rôle de source = proposition, rôle inchangé', bo().sources[0].role==='maitre' && pend().some(x=>x.field==='updateBoSourceRole'));
  toggleAssetLink('bo','bo1','consumedBy','a2',true);
  ok('applications de l\'objet = proposition « + BI »', !(bo().consumedBy||[]).includes('a2') && pend().some(x=>x.field==='toggleAssetLink'&&/consommé par : \+ BI/.test(x.after)));
  removeBusinessObject('bo1');
  ok('supprimer l\'objet = proposition, objet toujours là', g.businessObjects.length===1 && pend().some(x=>x.field==='removeBusinessObject'&&x.del));
  // --- réservé : propriétaire / domaine ---
  updateBusinessObject('bo1','globalOwner','Alice Martin'); updateBusinessObject('bo1','domain','RH');
  ok('propriétaire et domaine refusés au contributeur (message, pas de proposition)', !bo().globalOwner && bo().domain==='Finance' && !pend().some(x=>x.field==='globalOwner'||x.field==='domain') && document.getElementById('globalErrorText').textContent.includes('réservé'));
  updateBusinessObject('bo1','name','Client facturé');
  ok('renommer l\'objet = proposition', bo().name==='Client' && pend().some(x=>x.kind==='bo'&&x.field==='name'));
  // --- applications : structure et champs ---
  toggleAppSource('a2','CRM',true);
  ok('sources d\'une application = proposition, appli et dictionnaire intacts', !(g.assets[1].sources||[]).includes('CRM') && !((g.dictionary||{}).CRM||{}).sourceSystem && pend().some(x=>x.field==='toggleAppSource'&&/sources : \+ CRM/.test(x.after)));
  updateGovAsset('a1','criticality','critique'); updateGovAsset('a1','owner','Quelqu\'un'); updateGovAsset('a1','domain','RH');
  ok('appli : criticité proposée, responsable et domaine refusés', !g.assets[0].criticality && !g.assets[0].owner && g.assets[0].domain==='Finance' && pend().some(x=>x.kind==='asset'&&x.field==='criticality'));
  assetAppLink('p1','a1',true);
  ok('applications d\'un processus = proposition', !(g.assets[2].appIds||[]).length && pend().some(x=>x.field==='assetAppLink'));
  openGovTab('assets');
  ok('fiche application : bloc propositions de structure', S().textContent.includes('Propositions de structure en attente'));
  const nP=pend().length;
  // --- Alice valide tout ---
  govSetUser(ids.Alice); openGovTab('review');
  ok('Alice : toutes les propositions à valider, groupées par fiche', propCountPendingFor()===nP && S().textContent.includes('🏛️ Client') && S().textContent.includes('🖥 BI'));
  const acc=f=>{ const x=pend().find(y=>y.field===f); propAccept(x.id); };
  acc('boAddAttrAndSelect'); ok('validation ajout attribut : 3 attributs', bo().elements.length===3 && bo().elements[2].name==='Nouvel attribut');
  acc('addBoMapping'); ok('validation rattachement : CRM.EMAIL sur Nom (patch appliqué)', bo().elements.find(e=>e.id==='e2').mappings.some(m=>m.table==='CRM'&&m.col==='EMAIL'));
  acc('updateBoSourceRole'); ok('validation rôle source : contributeur', bo().sources[0].role==='contributeur');
  acc('toggleAssetLink'); ok('validation applications : BI consomme', (bo().consumedBy||[]).includes('a2'));
  acc('toggleAppSource'); ok('validation sources appli : rejouée avec effets (dictionnaire système source = BI)', g.assets[1].sources.includes('CRM') && g.dictionary.CRM.sourceSystem==='BI');
  acc('assetAppLink'); ok('validation processus : ERP lié', g.assets[2].appIds.includes('a1'));
  acc('criticality'); ok('validation criticité', g.assets[0].criticality==='critique');
  ok('historique de l\'objet tracé', (bo().history||[]).filter(h=>h.to==='Validé').length>=4);
  const del=pend().find(x=>x.field==='removeBusinessObject'); propReject(del.id);
  ok('refus de la suppression : objet conservé', g.businessObjects.length===1 && del.status==='rejected');
  // propriétaire agit directement
  boAddAttrAndSelect('bo1'); ok('Alice : ajout direct (4 attributs), aucune nouvelle proposition d\'action', bo().elements.length===4 && !pend().some(x=>x.kind==='action'&&x.field==='boAddAttrAndSelect'));
  // sans acteurs : inchangé
  g.people=[]; g.proposals=[]; boAddAttrAndSelect('bo1'); ok('sans acteur : écriture directe', bo().elements.length===5);
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' });
  await q.evaluate(()=>{ window.lucide={createIcons:()=>{}}; state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM'],config:{},columnsMeta:{},theme:'Finance'};
    const g=state.governance; g.businessObjects=[{id:'bo1',name:'Client',definition:'Un client facturé',domain:'Finance',elements:[{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}]}],sources:[{table:'CLIENTS',role:'maitre'}],structure:[]}]; govDemoPeople(); switchPhase('gov'); openGovTab('objects'); govState.selectedBoId='bo1'; govState.structView='fiche'; setBoTab('structure'); boAddAttrAndSelect('bo1'); removeBoElement('bo1','e1'); });
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(500); await q.screenshot({ path: D+'contrib_'+theme+'.png' });
  await q.evaluate(()=>{ govSetUser(state.governance.people.find(x=>/Alice/.test(x.name)).id); openGovTab('review'); }); await q.waitForTimeout(300); await q.screenshot({ path: D+'contrib_review_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
