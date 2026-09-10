import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const src=fs.readFileSync(D+'v920_gloss.mjs','utf8'); const SEED=src.split('const SEED = `')[1].split('`;')[0].replace(/\\\\'/g,"\\'").replace("definition:'d',globalOwner:'Alice'","definition:'Un client facturé',globalOwner:'Alice',domain:'Finance'").replace("{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}]}","{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}],definition:'Clé'}");
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } }); const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async (SEED)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  window.prompt=()=>'trop vague';
  eval(SEED); switchPhase('gov'); openGovTab('glossary');
  const g=state.governance; const bo=()=>g.businessObjects[0]; const S=()=>document.getElementById('step-9');
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  // ---- sans personnes : comportement inchangé ----
  ok('sans personnes : fonctionnalité inactive, sélecteur masqué, rôle admin', !govFeatureOn() && document.getElementById('v7UserSwitch').style.display==='none' && govRoleIn('Finance')==='admin');
  boAttrWrite('bo1','','e1','definition','Clé unique du client');
  ok('sans personnes : écriture directe', bo().elements[0].definition==='Clé unique du client' && govProposals().length===0);
  // ---- personnes & rôles ----
  openGovTab('people');
  ok('écran Personnes & rôles + domaine Finance détecté, sans vocabulaire « démonstrateur »', S().textContent.includes('Domaines métier') && S().textContent.includes('Finance') && !/démonstrat/i.test(S().textContent) && !/démonstrat/i.test(document.getElementById('v7UserSwitch').innerHTML));
  govDemoPeople();
  const ids=Object.fromEntries(govPeople().map(p=>[p.name.split(' ')[0],p.id]));
  ok('exemple de rôles : 4 personnes sur tous domaines, Bob actif, données intactes', govPeople().length===4 && curUser().name==='Bob Durand' && govPeople().every(p=>p.roles.every(r=>r.domain==='')) && bo().domain==='Finance' && g.glossary.every(t=>!t.domain));
  ok('sélecteur « Vous êtes » affiché dans l\'en-tête', document.getElementById('v7UserSwitch').style.display!=='none' && document.querySelector('#v7UserSwitch select').value===ids.Bob);
  ok('rôles : Bob contributeur, Alice propriétaire, Chloé lectrice, Admin partout', govRoleIn('Finance')==='contrib');
  // ---- Bob (contributeur) propose ----
  openGovTab('objects'); govState.selectedBoId='bo1'; govState.structView='fiche'; govState.boSel={kind:'attr',stId:'',elId:'e1'}; setBoTab('structure');
  ok('fiche objet : indication « vos modifications seront des propositions »', S().textContent.includes('vos modifications seront des propositions'));
  boAttrWriteR('bo1','','e1','definition','Identifiant unique attribué à la création du client',true);
  ok('contributeur : la valeur en vigueur est conservée, une proposition est créée', bo().elements[0].definition==='Clé unique du client' && govProposals().length===1 && govProposals()[0].status==='pending' && govProposals()[0].by===ids.Bob && govProposals()[0].domain==='Finance');
  ok('pastille « ⏳ Bob Durand propose » sous le champ, sans boutons de décision', document.querySelector('#boDetail .prop-badge') && document.querySelector('#boDetail .prop-badge').textContent.includes('Bob Durand propose') && !document.querySelector('#boDetail .prop-badge .ok'));
  boAttrWriteR('bo1','','e1','sensitivity','Interne',false);
  updateBusinessObject('bo1','definition','Client ayant au moins une facture');
  termTagAdd('attr',{boId:'bo1',elId:'e1'},'Numéro client');
  ok('propositions : sensibilité, définition d\'objet, terme (nouveau, non créé)', govProposals().length===4 && !g.glossary.some(t=>t.term==='Numéro client') && govProposals().some(p=>p.kind==='termlink'&&p.after==='Numéro client'));
  ok('tag proposé affiché en pointillé', S().querySelector('.term-tag.prop') && S().querySelector('.term-tag.prop').textContent.includes('Numéro client'));
  const before=bo().elements.length; boAddAttrAndSelect('bo1');
  ok('structure : ajout d\'attribut par Bob = proposition, objet intact', bo().elements.length===before && govProposals().some(p=>p.kind==='action'&&p.field==='boAddAttrAndSelect')); propWithdraw(govProposals().find(p=>p.kind==='action').id);
  ok('compteur « À valider » : 0 pour Bob (pas propriétaire), vue « Proposées par moi » = 4', propCountPendingFor()===0);
  openGovTab('review'); govState.reviewView='byme'; renderGovernance();
  ok('Bob : « Proposées par moi » liste ses 4 propositions avec « Retirer »', S().querySelectorAll('.prop-row').length===4 && S().textContent.includes('Retirer'));
  const pid=govProposals().find(p=>p.field==='sensitivity').id; propWithdraw(pid);
  ok('retrait d\'une proposition par son auteur', govProposals().length===3);
  // ---- Chloé (lectrice) ----
  govSetUser(ids.Chloé);
  ok('lectrice : mode consultation automatique', govIsReadOnly()===true);
  boAttrWrite('bo1','','e1','definition','tentative');
  ok('lectrice : aucune écriture ni proposition', bo().elements[0].definition==='Clé unique du client' && govProposals().length===3);
  // ---- Alice (propriétaire) valide ----
  govSetUser(ids.Alice);
  ok('propriétaire : sortie du mode consultation, 3 à valider, badge dans le menu et l\'en-tête', !govIsReadOnly() && propCountPendingFor()===3 && document.querySelector('.v7-side .v7-nb') && document.querySelector('.v7-side .v7-nb').textContent==='3' && document.querySelector('#v7UserSwitch .usw-todo').textContent.includes('3'));
  openGovTab('review'); govState.reviewView='todo'; renderGovernance();
  ok('À valider : groupé par domaine Finance puis fiche Client, avant → après, boutons', S().textContent.includes('Domaine Finance') && S().textContent.includes('🏛️ Client') && S().querySelectorAll('.prop-row').length===3 && S().querySelector('.prop-diff .a').textContent.includes('Identifiant unique') && S().textContent.includes('Tout valider pour cette fiche'));
  const pDef=govProposals().find(p=>p.kind==='attr'&&p.field==='definition');
  propAccept(pDef.id);
  ok('valider applique la valeur et trace dans l\'historique de l\'objet', bo().elements[0].definition==='Identifiant unique attribué à la création du client' && pDef.status==='accepted' && pDef.decidedBy===ids.Alice && (bo().history||[]).some(h=>h.to==='Validé' && /Bob Durand/.test(h.comment)));
  const pBo=govProposals().find(p=>p.kind==='bo');
  propReject(pBo.id);
  ok('refuser conserve l\'ancienne valeur, le motif et la trace', bo().definition==='Un client facturé' && pBo.status==='rejected' && pBo.comment==='trop vague' && (bo().history||[]).some(h=>h.to==='Refusé'));
  const pT=govProposals().find(p=>p.kind==='termlink'); propAccept(pT.id);
  ok('valider un terme proposé : terme créé dans le glossaire et posé sur l\'attribut', g.glossary.some(t=>t.term==='Numéro client') && termsOfAttr('bo1','e1').some(t=>t.term==='Numéro client'));
  ok('plus rien à valider ; décisions passées listées', propCountPendingFor()===0 && S().textContent.includes('Décisions passées (3)'));
  // ---- propriétaire : écriture directe + pastille avec décision en contexte ----
  govSetUser(ids.Bob); boAttrWriteR('bo1','','e1','examples','C001 ; C002',true);
  govSetUser(ids.Alice); openGovTab('objects'); govState.selectedBoId='bo1'; govState.boSel={kind:'attr',stId:'',elId:'e1'}; setBoTab('structure');
  ok('propriétaire voit la pastille AVEC « ✓ Valider » dans le formulaire', document.querySelector('#boDetail .prop-badge .ok')!==null);
  document.querySelector('#boDetail .prop-badge .ok').click();
  ok('validation en contexte appliquée', bo().elements[0].examples==='C001 ; C002' && propCountPendingFor()===0);
  boAttrWriteR('bo1','','e1','definition','Écrit directement par Alice',true);
  ok('propriétaire : écriture directe', bo().elements[0].definition==='Écrit directement par Alice' && govProposals().filter(p=>p.status==='pending').length===0);
  // ---- Tout valider pour la fiche + Voir en contexte ----
  govSetUser(ids.Bob); boAttrWriteR('bo1','','e2','definition','CA hors taxes',true); boAttrWriteR('bo1','','e2','examples','1000 ; 2000',false);
  govSetUser(ids.Alice); openGovTab('review'); govState.reviewView='todo'; renderGovernance();
  const grpKey=propGroupKey(govProposals().find(p=>p.status==='pending'));
  propAcceptAll(JSON.stringify(grpKey));
  ok('« Tout valider pour cette fiche »', bo().elements[1].definition==='CA hors taxes' && bo().elements[1].examples==='1000 ; 2000' && propCountPendingFor()===0);
  govSetUser(ids.Bob); updateGlossaryTerm('gl1','definition','Chiffre d\'affaires HT annuel'); govSetUser(ids.Alice);
  const pG=govProposals().find(p=>p.kind==='term'&&p.status==='pending'); propOpenTarget(pG.id);
  ok('« Voir » ouvre la fiche cible (terme mis en évidence dans le glossaire)', govState.tab==='glossary' && document.getElementById('gl-card-gl1').className.includes('ring-2') && S().querySelector('.prop-badge'));
  propAccept(pG.id);
  ok('définition de terme validée', g.glossary[0].definition==='Chiffre d\'affaires HT annuel');
  // ---- propriétaire nommé sur l'objet (vos données décident) ----
  govSetUser(ids.Admin); govPeople().push({id:'pe_dan',name:'Dan Roux',email:'',roles:[{domain:'RH',role:'owner'}]});
  _govBypass=true; updateBusinessObject('bo1','globalOwner','Dan Roux'); _govBypass=false; govLinkOwner(bo());
  govSetUser('pe_dan');
  ok('Dan, propriétaire nommé de Client (rôle seulement sur RH) : reconnu propriétaire de l\'objet', bo().ownerId==='pe_dan' && govIsOwnerOfBo(bo()) && govCanEditBo(bo()) && govRoleIn('Finance')==='reader');
  boAttrWriteR('bo1','','e1','definition','Écrit par Dan, propriétaire nommé',true);
  ok('Dan écrit directement sur son objet', bo().elements[0].definition==='Écrit par Dan, propriétaire nommé');
  openGovTab('objects'); govState.selectedBoId='bo1'; setBoTab('structure');
  ok('fiche : « personne reconnue : elle valide cet objet » + « vous êtes propriétaire de cet objet »', S().textContent.includes('personne reconnue') && S().textContent.includes('vous êtes propriétaire de cet objet'));
  govSetUser(ids.Bob); boAttrWriteR('bo1','','e1','examples','X1 ; X2',false);
  govSetUser('pe_dan');
  ok('Dan voit la proposition de Bob dans « À valider » (1) et peut la valider', propCountPendingFor()===1 && propCanDecide(govProposals().find(p=>p.status==='pending')));
  propAccept(govProposals().find(p=>p.status==='pending').id);
  ok('validation par le propriétaire nommé', bo().elements[0].examples==='X1 ; X2');
  // ---- dictionnaire par table : propositions ----
  state.tables['t1'].theme='Finance';
  govSetUser(ids.Bob); updateDictColField('CLIENTS','NOM','definition','Raison sociale');
  ok('dictionnaire (table) : le contributeur propose, rien n\'est écrit', !(((g.dictionary.CLIENTS||{}).columns||{}).NOM||{}).definition && govProposals().some(p=>p.kind==='dictcol' && p.status==='pending' && p.target.col==='NOM'));
  openGovTab('dictionary'); govState.dictMode='table'; govState.dictTable='CLIENTS'; renderGovernance();
  ok('dictionnaire : pastille de proposition sous la définition de NOM', S().querySelector('.prop-badge') && S().querySelector('.prop-badge').textContent.includes('Raison sociale'));
  govSetUser(ids.Alice); openGovTab('review'); govState.reviewView='todo'; renderGovernance();
  ok('À valider : groupe « ▦ CLIENTS »', S().textContent.includes('▦ CLIENTS'));
  const pd=govProposals().find(p=>p.kind==='dictcol'&&p.status==='pending'); propOpenTarget(pd.id);
  ok('« Voir » ouvre le dictionnaire sur la table', govState.tab==='dictionary' && govState.dictTable==='CLIENTS');
  propAccept(pd.id);
  ok('validation : définition de colonne écrite', g.dictionary.CLIENTS.columns.NOM.definition==='Raison sociale');
  // ---- admin partout ----
  govSetUser(ids.Admin);
  ok('administrateur : propriétaire sur tout domaine', govRoleIn('Finance')==='admin' && govCanEdit('Autre'));
  // ---- domaine sur objet et terme ----
  openGovTab('glossary'); const glossHasDom=S().innerHTML.includes("'domain'");
  openGovTab('objects'); govState.selectedBoId=state.governance.businessObjects[0].id; renderGovernance();
  ok('sélecteurs de domaine sur l\'objet et le terme', glossHasDom && S().innerHTML.includes("bo-domain-") );
  openGovTab('objects'); ok('objet : sélecteur de domaine = Finance', document.getElementById('bo-domain-bo1') && document.getElementById('bo-domain-bo1').value==='Finance');
  openGovTab('catalog'); ok('catalogue : domaine de l\'objet = Finance', catRes.find(r=>r.type==='bo').dom==='Finance');
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,3).forEach(e=>console.log('  ',e));
// captures : Bob propose (formulaire), Alice valide (À valider)
await p.evaluate(()=>{ const ids=Object.fromEntries(govPeople().map(p=>[p.name.split(' ')[0],p.id])); govSetUser(ids.Bob); boAttrWriteR('bo1','','e1','definition','Numéro attribué au client lors de sa création dans l\'ERP',true); termTagAdd('attr',{boId:'bo1',elId:'e1'},'Référence client'); openGovTab('objects'); govState.selectedBoId='bo1'; govState.boSel={kind:'attr',stId:'',elId:'e1'}; setBoTab('structure'); document.getElementById('boDetail').scrollIntoView(); });
await p.evaluate(()=>{ document.getElementById('toastContainer').innerHTML=''; hideError(); }); await p.waitForTimeout(400); await p.screenshot({ path: D+'roles_bob.png' });
await p.evaluate(()=>{ const ids=Object.fromEntries(govPeople().map(p=>[p.name.split(' ')[0],p.id])); govSetUser(ids.Alice); openGovTab('review'); govState.reviewView='todo'; renderGovernance(); const t=document.querySelector('#step-9 .gov-bar'); if(t) t.scrollIntoView(); });
await p.evaluate(()=>{ document.getElementById('toastContainer').innerHTML=''; hideError(); }); await p.waitForTimeout(400); await p.screenshot({ path: D+'roles_alice.png' });
await p.evaluate(()=>{ openGovTab('people'); const t=document.querySelector('#step-9 .gov-bar'); if(t) t.scrollIntoView(); });
await p.evaluate(()=>{ document.getElementById('toastContainer').innerHTML=''; }); await p.waitForTimeout(300); await p.screenshot({ path: D+'roles_people.png' });
await b.close(); process.exit(fail||perr.length?1:0);
