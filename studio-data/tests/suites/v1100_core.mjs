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
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' }); await p.waitForTimeout(1400);
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}};
  const S=()=>document.getElementById('govContent');
  ok('V11.1.0 : version, journal en tête, titre d\'onglet', APP_VERSION==='11.1.0' && APP_CHANGELOG[0].v==='11.1.0' && APP_CHANGELOG[1].v==='11.0.1' && document.title==='Studio Data 11.1.0');
  ok('visite guidée au premier lancement (5 étapes), fermable', document.getElementById('v11Tour') && document.getElementById('v11Tour').textContent.includes('1 / 5'));
  v11TourNext(); ok('étape 2 de la visite', document.getElementById('v11Tour').textContent.includes('2 / 5')); v11TourEnd(true);
  ok('visite marquée faite', v11Prefs.tourDone===true && !document.getElementById('v11Tour'));
  ok('barre du haut : enregistré, précédent/suivant, recherche, aide', document.getElementById('v11Save') && document.getElementById('v11Hist') && document.querySelector('.v11-topbtn kbd') && Array.from(document.querySelectorAll('.v11-topbtn')).some(b2=>b2.textContent.trim()==='?'));
  // menu
  switchPhase('gov');
  ok('entrée de la gouvernance = Accueil', govState.tab==='home');
  ok('menu en trois familles dans l\'ordre', Array.from(document.querySelectorAll('.v11-fam')).map(x=>x.textContent).join('|')==='Explorer|Décrire|Piloter');
  ok('accueil vide : exemple chargeable + assistant', S().textContent.includes('Charger un exemple') && S().innerHTML.includes('v11WizardOpen'));
  // toasts
  document.querySelectorAll('.v11-toast').forEach(x=>v11ToastClose(x)); v11State.toasts=[]; v11State.toastOn=null;
  showSuccess('Première phrase courte. Deuxième phrase avec beaucoup de détails qui ne doit pas s\'afficher tout de suite.');
  const t=document.querySelector('.v11-toast');
  ok('notification unifiée en haut à droite, phrase courte, détail au clic', t && t.classList.contains('ok') && t.querySelector('.m').textContent==='Première phrase courte.' && t.querySelector('.more'));
  t.click(); ok('détail déplié', t.querySelector('.m').textContent.includes('Deuxième phrase'));
  showError('Erreur test.'); ok('une seule notification à la fois (file)', document.querySelectorAll('.v11-toast').length===1 && v11State.toasts.length===1 && document.getElementById('globalError') && getComputedStyle(document.getElementById('globalError')).display==='none');
  v11ToastClose(t); ok('la suivante prend la place', document.querySelector('.v11-toast') && document.querySelector('.v11-toast').classList.contains('err'));
  document.querySelectorAll('.v11-toast').forEach(x=>v11ToastClose(x));
  // exemple + accueil
  v11LoadSample();
  ok('exemple : 3 objets, 2 termes, 3 applis/processus, 2 acteurs, Alice active', state.governance.businessObjects.length===3 && state.governance.glossary.length===2 && state.governance.assets.length===3 && govPeople().length===2 && curUser().name==='Alice Martin');
  ok('accueil rempli : bonjour, fiches à compléter, objets, chiffres clés', S().textContent.includes('Bonjour Alice') && S().textContent.includes('Fiches à compléter') && S().querySelectorAll('.v11-card').length===5 && S().textContent.includes('Chiffres clés'));
  ok('accueil : rien à valider (Alice propriétaire, aucune proposition)', S().textContent.includes('Rien à valider'));
  // annulation
  const bo=state.governance.businessObjects[0]; restoreCompleted=true; v11State.undo=[]; v11State.lastGov=v11GovJson();
  updateBusinessObject(bo.id,'definition','Définition changée');
  ok('modification → pile d\'annulation + bouton Annuler dans l\'indicateur', v11State.undo.length===1 && document.querySelector('#v11Save button'));
  v11Undo(); ok('Ctrl+Z / Annuler restaure la valeur', state.governance.businessObjects[0].definition==='Personne ou société ayant au moins une facture émise.' && v11State.undo.length===0);
  // historique de navigation + fil d'Ariane
  v11State.hist={stack:[],i:-1,nav:false}; openGovTab('home'); openGovTab('glossary'); v11GoBo(bo.id);
  ok('fil d\'Ariane cliquable : Gouvernance › Décrire › Objets métier › Client', document.getElementById('govCrumb').textContent.replace(/\s/g,'')==='Gouvernance›Décrire›Objetsmétier›Client' && document.querySelectorAll('#govCrumb a').length===3);
  v11Back(); ok('◀ revient au glossaire', govState.tab==='glossary'); v11Back(); ok('◀ revient à l\'accueil', govState.tab==='home'); v11Fwd(); v11Fwd(); ok('▶ ▶ revient sur l\'objet', govState.tab==='objects' && govState.selectedBoId===bo.id);
  const hb=document.querySelectorAll('#v11Hist button'); ok('boutons ◀ ▶ activés/désactivés selon la position', !hb[0].disabled && hb[1].disabled);
  // plein écran
  v11Fs('#v11-bo-'+bo.id,'Client');
  ok('plein écran : la fiche est déplacée dans la surcouche, menu replié', document.querySelector('#v11Fs .v11-fiche') && !document.querySelector('#govContent .v11-fiche') && document.body.classList.contains('v7-collapsed'));
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  ok('Échap referme et remet la fiche à sa place', !document.getElementById('v11Fs') && document.querySelector('#govContent .v11-fiche'));
  ok('boutons ⛶ flottants sur les graphes (fiche en modification)', (v11ToggleEdit('bo',bo.id), govState.boTab='usage', renderGovernance(), openBoLineage(bo.id), !!document.querySelector('#attrLineageBox .v11-fsbtn.float')));
  v11ToggleEdit('bo',bo.id);
  // raccourcis clavier
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})); ok('Ctrl+K ouvre la recherche', !!document.getElementById('v11Pal')); v11PaletteClose();
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'?',bubbles:true})); ok('? ouvre l\'aide avec raccourcis, préférences, lexique', document.getElementById('v11Help') && document.getElementById('v11Help').textContent.includes('Raccourcis clavier') && document.getElementById('v11Help').textContent.includes('Lexique')); v11HelpClose();
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'g',bubbles:true})); document.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true})); ok('G puis T va au glossaire', govState.tab==='glossary');
  // densité, présentation, préférences
  v11SetPref('density','compact'); ok('densité compacte appliquée et mémorisée', document.body.classList.contains('v11-compact') && v11Prefs.density==='compact'); v11SetPref('density','comfy');
  v11Present(true); ok('présentation : menu masqué, lecture seule, bouton quitter', document.body.classList.contains('v11-present') && govIsReadOnly() && document.getElementById('v11PresentExit'));
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); ok('Échap quitte la présentation', !document.body.classList.contains('v11-present') && !govIsReadOnly());
  govState.structView='table'; renderGovernance(); ok('préférence d\'écran mémorisée (vue tableau)', v11Prefs.screens.structView==='table'); govState.structView='fiche'; renderGovernance();
  // tableaux triables + vocabulaire
  v11GoBo(bo.id); const th=document.querySelector('#v11-bo-'+bo.id+' th.v11-sort'); th.click();
  const first=()=>document.querySelector('#v11-bo-'+bo.id+' tbody tr td').textContent;
  ok('tri d\'un clic sur l\'en-tête (croissant puis décroissant)', first()==='Chiffre d\'affaires' && (th.click(), first()==='Raison sociale'));
  v11ToggleEdit('bo',bo.id);
  ok('vocabulaire unifié dans le formulaire : « Propriétaire » (plus « Propriétaire global »)', !S().textContent.includes('Propriétaire global') && S().textContent.includes('Propriétaire'));
  ok('bloc « Initialiser depuis une source » replié derrière « Autres façons »', S().textContent.includes('Autres façons de créer un objet') && S().querySelector('[data-v11init]').style.display==='none');
  ok('infobulle lexique sur un titre technique', Array.from(S().querySelectorAll('[title]')).some(n=>/Facette :|Source maître :|Attribut :/.test(n.title)));
  v11ToggleEdit('bo',bo.id);
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
