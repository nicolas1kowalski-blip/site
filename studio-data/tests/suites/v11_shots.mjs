import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(ROOT + 'StudioDataV11.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
for (const theme of ['light','dark']) {
  const p = await b.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: theme==='dark'?'dark':'light' });
  await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
  await p.waitForTimeout(300);
  await p.evaluate(()=>{ window.lucide={createIcons:()=>{}}; v11Prefs.tourDone=true; state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','EMAIL','CA_HT'],config:{},columnsMeta:{},theme:'Finance',lastRows:1200}; switchPhase('gov'); v11LoadSample(); const bo=state.governance.businessObjects[0]; bo.sources=[{table:'CLIENTS',role:'maitre'}]; bo.elements[0].mappings=[{table:'CLIENTS',col:'ID'}]; document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); openGovTab('home'); });
  if (theme==='dark') await p.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await p.waitForTimeout(300); await p.screenshot({ path: D+'v11_home_'+theme+'.png' });
  await p.evaluate(()=>{ v11GoBo(state.governance.businessObjects[0].id); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'v11_bo_'+theme+'.png', fullPage: false });
  await p.evaluate(()=>{ v11ToggleEdit('bo', state.governance.businessObjects[0].id); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'v11_edit_'+theme+'.png' });
  await p.evaluate(()=>{ v11ToggleEdit('bo', state.governance.businessObjects[0].id); openGovTab('glossary'); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'v11_gloss_'+theme+'.png' });
  await p.evaluate(()=>{ govState.dictMode='table'; govState.dictTable='CLIENTS'; openGovTab('dictionary'); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'v11_dict_'+theme+'.png' });
  await p.evaluate(()=>{ v11PaletteOpen(); document.getElementById('v11PalIn').value='fact'; document.getElementById('v11PalIn').dispatchEvent(new Event('input')); }); await p.waitForTimeout(200); await p.screenshot({ path: D+'v11_pal_'+theme+'.png' });
  await p.evaluate(()=>{ v11PaletteClose(); v11HelpOpen(); }); await p.waitForTimeout(200); await p.screenshot({ path: D+'v11_help_'+theme+'.png' });
  await p.evaluate(()=>{ v11HelpClose(); v11GoBo(state.governance.businessObjects[0].id); v11Fs('#v11-bo-'+state.governance.businessObjects[0].id,'Client'); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'v11_fs_'+theme+'.png' });
  await p.evaluate(()=>{ v11FsClose(); v11TourStart(); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'v11_tour_'+theme+'.png' });
  await p.close();
}
await b.close();
