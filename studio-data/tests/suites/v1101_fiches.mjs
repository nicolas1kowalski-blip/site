import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV11.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); try { window.lucide={createIcons:()=>{}}; v11Prefs.tourDone=true; v11TourEnd(true);
  const S=()=>document.getElementById('govContent');
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL'],config:{},columnsMeta:{},theme:'Finance',lastRows:50};
  switchPhase('gov'); v11LoadSample(); document.querySelectorAll('.v11-toast').forEach(x=>v11ToastClose(x));
  const g=state.governance; const bo=g.businessObjects[0]; bo.sources=[{table:'CLIENTS',role:'maitre'}]; bo.elements[0].mappings=[{table:'CLIENTS',col:'ID'}]; persistAppState();
  // ---- objet : lecture ----
  v11GoBo(bo.id); const F=()=>document.getElementById('v11-bo-'+bo.id);
  ok('objet en mode lecture : gabarit unifié (kind, titre, meta, actions, sections)', F() && F().querySelector('.kind').textContent==='Objet métier' && F().querySelector('h2').textContent==='Client' && F().querySelectorAll('.v11-sec').length>=8 && F().querySelector('.acts'));
  ok('aucun champ de saisie dans la fiche lecture', !F().querySelector('input,select,textarea'));
  ok('actions : Modifier, Lineage, Audit, Actions groupées, Dupliquer, ⛶, 🖨', ['Modifier','Lineage','Audit','Actions groupées','Dupliquer','⛶','🖨'].every(x=>F().querySelector('.acts').textContent.includes(x)));
  ok('sections : sources (maître CLIENTS), applications (produit par ERP), termes, attributs (4 lignes), complétude', F().textContent.includes('CLIENTS') && F().textContent.includes('ERP Finance') && F().textContent.includes('Client actif') && F().querySelectorAll('tbody tr').length===4 && F().textContent.includes('Complétude'));
  ok('valeurs vides affichées « — »', F().querySelector('tbody').textContent.includes('—'));
  // édition en place
  const ie=F().querySelector('.v11-ie[data-field="definition"]'); ie.click();
  const inp=ie.querySelector('.v11-ie-in'); ok('clic sur la définition → zone de saisie en place', inp && inp.tagName==='TEXTAREA' && inp.value.startsWith('Personne'));
  inp.value='Définition modifiée en place'; inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));
  ok('Ctrl+Entrée enregistre et re-rend la fiche', g.businessObjects[0].definition==='Définition modifiée en place' && F().textContent.includes('Définition modifiée en place'));
  const ie2=F().querySelector('.v11-ie[data-field="globalOwner"]'); ie2.click(); const in2=ie2.querySelector('input'); in2.value='Autre'; in2.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  ok('Échap annule sans enregistrer', g.businessObjects[0].globalOwner==='Alice Martin');
  const ie3=F().querySelector('.v11-ie[data-field="domain"]'); ie3.click(); const sel=ie3.querySelector('select'); ok('domaine : liste déroulante en place', sel && Array.from(sel.options).some(o=>o.value==='Commerce')); sel.value='Commerce'; sel.dispatchEvent(new Event('change'));
  ok('domaine enregistré', g.businessObjects[0].domain==='Commerce'); updateBusinessObject(bo.id,'domain','Finance'); renderGovernance();
  // ligne d'attribut → édition de l'attribut
  F().querySelector('tbody tr').click();
  ok('clic sur un attribut : formulaire complet ouvert sur cet attribut, barre de modification', document.querySelector('.v11-editbar') && govState.boSel && govState.boSel.elId===bo.elements[0].id && document.getElementById('boDetail'));
  ok('barre : Terminer + ⛶ Attributs', document.querySelector('.v11-editbar').textContent.includes('Terminer') && document.querySelector('.v11-editbar').textContent.includes('Attributs'));
  ok('menu replié automatiquement en modification', document.body.classList.contains('v7-collapsed'));
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'e',bubbles:true}));
  ok('touche E : retour à la fiche lecture, menu déplié', !!F() && !document.body.classList.contains('v7-collapsed'));
  // dupliquer / imprimer
  v11Duplicate('bo',bo.id); ok('dupliquer : copie avec nouveaux identifiants, ouverte en modification', g.businessObjects.length===4 && g.businessObjects[3].name==='Client (copie)' && g.businessObjects[3].elements[0].id!==bo.elements[0].id && document.querySelector('.v11-editbar'));
  window.print=()=>{ window._printed=true; }; v11Print('bo',bo.id); await new Promise(r=>setTimeout(r,100));
  ok('imprimer : zone d\'impression remplie avec la fiche, print() appelé', document.getElementById('v11PrintArea').querySelector('.v11-fiche') && window._printed);
  // ---- terme / application / source ----
  openGovTab('glossary'); const tc=document.getElementById('gl-card-'+g.glossary[0].id);
  ok('terme en lecture : gabarit unifié, attribut désigné cliquable', tc.querySelector('.v11-fiche .kind').textContent==='Terme du glossaire' && tc.textContent.includes('Chiffre d\'affaires') && tc.innerHTML.includes('v11GoBo('));
  tc.querySelector('.v11-btn.pri').click(); ok('Modifier un terme → formulaire V7 + barre', document.getElementById('gl-card-'+g.glossary[0].id).querySelector('textarea') && document.querySelector('.v11-editbar'));
  v11ToggleEdit('term',g.glossary[0].id);
  openGovTab('assets'); const ac=document.getElementById('v11-as-'+g.assets[0].id);
  ok('application en lecture : sources, objets, criticité', ac && ac.querySelector('.kind').textContent==='Application' && ac.textContent.includes('Client') && ac.textContent.includes('Critique'));
  v11GoAsset(g.assets[2].id); const pc=document.getElementById('v11-as-'+g.assets[2].id); ok('processus en lecture : applications du processus', pc && pc.querySelector('.kind').textContent==='Processus' && pc.textContent.includes('ERP Finance'));
  govState.dictMode='table'; govState.dictTable='CLIENTS'; openGovTab('dictionary'); const dc=S().querySelector('.v11-fiche');
  ok('source en lecture : colonnes, attributs alimentés, domaine', dc && dc.querySelector('.kind').textContent.includes('Source') && dc.querySelectorAll('tbody tr').length===3 && dc.textContent.includes('Numéro client') && dc.textContent.includes('Finance'));
  dc.querySelector('tbody tr').click(); ok('clic sur une colonne → formulaire du dictionnaire + barre', S().querySelector('td input') && S().querySelector('.v11-editbar'));
  v11State.edit['table:CLIENTS']=false; renderGovernance();
  // ---- droits : lecteur → pas de Modifier, champs réservés non modifiables ----
  g.people.push({id:'u3',name:'Léa Petit',roles:[{domain:'Finance',role:'reader'},{domain:'Commerce',role:'contrib'}]}); govSetUser('u3'); v11GoBo(bo.id);
  ok('lectrice Finance : fiche lecture sans bouton Modifier, valeurs non éditables', F() && !F().querySelector('.v11-btn.pri') && F().textContent.includes('lecture seule') && F().querySelectorAll('.v11-ie:not(.ro)').length===0);
  v11GoBo(g.businessObjects[2].id); const F3=()=>document.getElementById('v11-bo-'+g.businessObjects[2].id);
  ok('contributrice Commerce : Modifier présent, définition éditable, propriétaire et domaine réservés', F3().querySelector('.v11-btn.pri') && !F3().querySelector('.v11-ie[data-field="definition"]').classList.contains('ro') && F3().querySelector('.v11-ie[data-field="globalOwner"]').classList.contains('ro') && F3().querySelector('.v11-ie[data-field="domain"]').classList.contains('ro'));
  govSetUser(g.people[0].id);
  // préférence : ouvrir directement en modification
  v11Prefs.readDefault=false; v11State.edit={}; v11GoBo(bo.id); ok('préférence « directement en modification » respectée', !!document.querySelector('.v11-editbar') && !F()); v11Prefs.readDefault=true; v11State.edit={};
  } catch(e) { R.push(["ERREUR "+e.message+" @ "+String(e.stack).split("\n")[1], false]); }
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
