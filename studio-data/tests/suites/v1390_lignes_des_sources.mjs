import fs from 'fs';
// Combien de lignes une source a-t-elle vraiment chargées ?
//
// Sans ce nombre, une ligne qui manque ne se voit jamais : on cherche un enregistrement, on ne le
// trouve pas, et rien ne dit s'il n'a pas été chargé ou si l'on cherche mal. La carte de la source
// affichait « — » tant que le cockpit n'était pas passé, c'est-à-dire la plupart du temps.
//
// Ce contrôle a besoin du MOTEUR dans la page : il s'exécute donc sur la version hors ligne, qui
// le porte. Sans elle, il se tait plutôt que d'échouer.
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const FICHIER = ROOT + 'StudioDataV13-hors-ligne.html';
if (!fs.existsSync(FICHIER)) {
    console.log('⏭  StudioDataV13-hors-ligne.html absent — lancez node tools/hors-ligne.mjs');
    console.log('\n0/0 OK · erreurs page: 0');
    process.exit(0);
}
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr = []; p.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
await p.goto('file://' + FICHIER, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);

const out = await p.evaluate(async () => {
    const R = []; const ok = (n, c) => R.push([n, !!c]);
    window.lucide = window.lucide || { createIcons: () => {} };
    try { v11Prefs.tourDone = true; v11TourEnd(true); wizClose(); } catch (e) {}

    const charger = async (nom, contenu) => {
        const id = 'src' + Math.random().toString(36).slice(2, 8);
        state.tables[id] = { id, name: nom, type: 'csv', status: 'loading',
            file: new File([contenu], nom + '.csv', { type: 'text/csv' }),
            headers: [], config: {}, columnsMeta: {} };
        let message = '';
        const ancien = window.showError;
        window.showError = m => { message = String(m).replace(/<[^>]+>/g, ''); };
        try { await ingestFileTable(id); } catch (e) { message = 'ÉCHEC ' + e.message; }
        window.showError = ancien;
        return { table: state.tables[id], message };
    };
    const lignes = [];
    for (let i = 1; i <= 500; i++) lignes.push('R' + i + ';Libelle ' + i);
    const entete = 'REPERE;LIBELLE\n';

    // 1. Le cas ordinaire : les deux nombres sont là, et ils concordent.
    const propre = await charger('PROPRE', entete + lignes.join('\n') + '\n');
    ok('le nombre de lignes chargées est connu dès le chargement, sans attendre le cockpit',
        propre.table.lastRows === 500);
    ok('le nombre de lignes du fichier est mesuré lui aussi', propre.table.lignesDuFichier === 500);
    ok('rien n’est signalé quand les deux concordent', !propre.message);
    ok('et la carte le dit : « = fichier »', /= fichier/.test(sourceLignesManquantesHtml(propre.table)));

    // 2. Le dernier saut de ligne, présent ou non, ne doit pas compter pour une ligne.
    const sansFin = await charger('SANSFIN', entete + lignes.join('\n'));
    ok('un fichier sans saut de ligne final compte le même nombre de lignes',
        sansFin.table.lastRows === 500 && sansFin.table.lignesDuFichier === 500);

    // 3. L'entête n'est pas une donnée.
    const uneSeule = await charger('UNESEULE', entete + 'R1;Un\n');
    ok('l’entête n’est pas comptée comme une ligne de données',
        uneSeule.table.lastRows === 1 && uneSeule.table.lignesDuFichier === 1);

    // 4. Un champ contenant un retour à la ligne : l'écart est réel, et il est EXPLIQUÉ.
    const avecRetour = lignes.slice();
    avecRetour[99] = 'R100;"Libelle sur\ndeux lignes"';
    const retour = await charger('RETOUR', entete + avecRetour.join('\n') + '\n');
    ok('un champ contenant un retour à la ligne fait un écart, et il est annoncé',
        retour.table.lignesDuFichier === 501 && retour.table.lastRows === 500 && !!retour.message);
    ok('le message donne les DEUX nombres et l’écart, pas une alerte vague',
        /500/.test(retour.message) && /501/.test(retour.message) && /1 de moins/.test(retour.message));
    ok('et il dit que le retour à la ligne dans un champ explique l’écart, avant de soupçonner une perte',
        /retour à la ligne/.test(retour.message));
    ok('la carte porte l’écart en rouge, avec le nombre du fichier',
        /de moins que le fichier/.test(sourceLignesManquantesHtml(retour.table)));

    // 5. Un fichier vide de données.
    const vide = await charger('VIDE', entete);
    ok('un fichier sans aucune ligne de données le dit au lieu d’afficher « — »',
        vide.table.lastRows === 0 && vide.table.lignesDuFichier === 0);

    // 6. La mesure ne doit jamais empêcher un chargement.
    ok('les deux nombres sont rangés sur la source, lisibles par tout l’écran',
        'lastRows' in propre.table && 'lignesDuFichier' in propre.table);
    return R;
});

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
