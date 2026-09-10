import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const src=fs.readFileSync(D+'v920_gloss.mjs','utf8'); const SEED=src.split('const SEED = `')[1].split('`;')[0].replace(/\\\\'/g,"\\'");
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } }); const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate((SEED)=>{ eval(SEED); switchPhase('gov'); openGovTab('glossary'); openGovTab('catalog'); catOpenFiche(catRes.findIndex(r=>r.type==='bo')); }, SEED);
const R=[]; const ok=(n,c)=>R.push([n,!!c]);
ok('version 9.3.3', await p.evaluate(()=>APP_VERSION==='10.2.3'));
// Frappe RÉELLE au clavier (Playwright) dans la fiche catalogue, terme inconnu -> bouton « Créer »
const inp = p.locator('#uxDrawer input.term-add').first();
await inp.click(); await inp.type('Compte client');
const btn = p.locator('#uxDrawer .term-go').first();
ok('en tapant un terme inconnu, un bouton « ＋ Créer « Compte client » » vert apparaît', await btn.isVisible() && (await btn.textContent()).includes('Créer « Compte client »') && await btn.evaluate(e=>e.classList.contains('new')));
await btn.click();
ok('clic sur Créer : terme créé dans le glossaire et relié à l\'objet, tag visible', await p.evaluate(()=>state.governance.glossary.some(t=>t.term==='Compte client' && (t.boIds||[]).includes('bo1')) && document.getElementById('uxDrawer').textContent.includes('📖 Compte client')));
// terme existant -> bouton « Relier »
const inp2 = p.locator('#uxDrawer input.term-add').nth(1);
await inp2.click(); await inp2.type('comm');
const btn2 = p.locator('#uxDrawer .term-go').nth(1);
ok('terme existant (préfixe « comm ») : bouton « Relier » — hmm non, seul le nom complet relie ; préfixe = Créer', (await btn2.textContent()).includes('Créer « comm »'));
await inp2.fill('Commune'); await inp2.dispatchEvent('input');
ok('nom complet d\'un terme existant : bouton « ↵ Relier « Commune » » bleu', (await btn2.textContent()).includes('Relier « Commune »') && !(await btn2.evaluate(e=>e.classList.contains('new'))));
await btn2.click();
ok('clic sur Relier : terme existant relié à l\'attribut Identifiant, aucun doublon créé', await p.evaluate(()=>termsOfAttr('bo1','e1').some(t=>t.id==='gl2') && state.governance.glossary.filter(t=>t.term==='Commune').length===1));
// Entrée réelle
const inp3 = p.locator('#uxDrawer input.term-add').nth(1);
await inp3.click(); await inp3.type('Référence client'); await inp3.press('Enter');
ok('Entrée réelle crée aussi le terme', await p.evaluate(()=>state.governance.glossary.some(t=>t.term==='Référence client') && termsOfAttr('bo1','e1').some(t=>t.term==='Référence client')));
// quitter le champ ne perd rien : le texte reste et le bouton reste
const inp4 = p.locator('#uxDrawer input.term-add').nth(2);
await inp4.click(); await inp4.type('Brouillon'); await p.locator('#uxDrawerTitle').click();
ok('quitter le champ : texte et bouton conservés, rien créé', (await inp4.inputValue())==='Brouillon' && await p.locator('#uxDrawer .term-go').nth(2).isVisible() && await p.evaluate(()=>!state.governance.glossary.some(t=>t.term==='Brouillon')));
// dictionnaire
await p.evaluate(()=>{ closeUxDrawer(); openGovTab('dictionary'); govState.dictMode='bo'; renderGovernance(); });
const inp5 = p.locator('#step-9 input.term-add').first(); await inp5.click(); await inp5.type('Numéro client');
await p.locator('#step-9 .term-go').first().click();
ok('dictionnaire : création par bouton', await p.evaluate(()=>state.governance.glossary.some(t=>t.term==='Numéro client')));
let fail=0; for(const [n,c] of R){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${R.length-fail}/${R.length} OK · erreurs page: ${perr.length}`); perr.slice(0,3).forEach(e=>console.log('  ',e));
await p.evaluate(()=>{ openGovTab('catalog'); catOpenFiche(catRes.findIndex(r=>r.type==='bo')); });
const i6=p.locator('#uxDrawer input.term-add').first(); await i6.click(); await i6.type('Compte débiteur'); await p.waitForTimeout(200);
await p.screenshot({ path: D+'create_term.png' });
await b.close(); process.exit(fail||perr.length?1:0);
