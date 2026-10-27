import fs from 'fs';
// Comparer : une CLÉ n'est pas une LIGNE.
//
// Deux fichiers de 80 000 lignes comparés sur une clé annonçaient « 962 410 clés évaluées ». Le
// chiffre était impossible, et la tuile disait pourtant « union des deux fichiers ». La comparaison
// appariait en fait des LIGNES : une clé présente 5 fois d'un côté et 3 fois de l'autre produisait
// 5 × 3 = 15 lignes pour cette seule clé, et les quatre tuiles comptaient ces appariements.
//
// Deux parties :
//   1. sur le fichier construit, les fonctions de mesure et l'écran (aucun moteur nécessaire) ;
//   2. sur la version hors ligne, qui porte le moteur : deux fichiers aux clés volontairement
//      répétées, comparés pour de vrai, et les chiffres vérifiés un par un.
//
// Le numéro 1391 appartient à la plage V13 (1300-1399) : la suite s'exécute donc sur V13 et V14.
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE || ROOT + 'StudioDataV13.html', 'utf8')
    .replace(/<script src="https:[^"]*"[^>]*><\/script>/g, '')
    .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');
const navigateur = await chromium.launch({ executablePath: CHROMIUM });
const perr = [];
const pageSansMoteur = await navigateur.newPage({ viewport: { width: 1500, height: 950 } });
pageSansMoteur.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
await pageSansMoteur.setContent(html, { waitUntil: 'domcontentloaded' });
await pageSansMoteur.addStyleTag({ path: D + 'tw/tw_built.css' });
await pageSansMoteur.evaluate(() => { v11Prefs.tourDone = true; });
await pageSansMoteur.waitForTimeout(1500);

// ---------- 1. Les fonctions de mesure et l'écran ----------
const resultats = await pageSansMoteur.evaluate(async () => {
    const R = []; const ok = (n, c) => R.push([n, !!c]);
    window.lucide = { createIcons: () => {} };
    try { v11TourEnd(true); wizClose(); } catch (e) {}
    restoreCompleted = true;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    try {
    ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')',
        APP_CHANGELOG[0].v === APP_VERSION && document.title === 'Studio Data ' + APP_VERSION);

    // ---- l'expression de la clé, celle qui sert partout
    const couple = [{ id: 'k1', colA: 'DkCodeContrat', colB: 'dk_code_contrat' }];
    const cleSimple = comparisonCleCompositeSql(couple, 'A', true, true);
    ok('une clé simple est mise à plat : espaces ôtés, casse ignorée, clé vide traitée comme absente',
        /TRIM\(/.test(cleSimple) && /LOWER\(/.test(cleSimple) && /NULLIF\(/.test(cleSimple) && !/chr\(31\)/.test(cleSimple));
    const cleDouble = comparisonCleCompositeSql(
        [{ colA: 'SOCIETE', colB: 'societe' }, { colA: 'CONTRAT', colB: 'contrat' }], 'B', true, true);
    ok('une clé composite colle ses parties avec un séparateur introuvable dans une donnée',
        /chr\(31\)/.test(cleDouble) && /"societe"/.test(cleDouble) && /"contrat"/.test(cleDouble));
    ok('et si une seule partie est vide, la clé entière est nulle : la ligne est écartée',
        /^CASE WHEN .* IS NULL OR .* IS NULL THEN NULL ELSE /.test(cleDouble));

    // ---- la requête de mesure : des clés, pas des lignes
    const mesureSql = comparisonMesureDesClesSql('"t_a"', cleSimple);
    ok('la mesure regroupe par clé avant de compter : clés distinctes, clés répétées, occurrences maximum',
        /GROUP BY 1/.test(mesureSql) && /cles_distinctes/.test(mesureSql) && /cles_repetees/.test(mesureSql) && /occurrences_maximum/.test(mesureSql));
    ok('elle compte aussi les lignes écartées faute de clé, pour que rien ne disparaisse sans être dit',
        /lignes_du_fichier/.test(mesureSql) && /lignes_avec_une_cle/.test(mesureSql));

    // ---- le côté regroupé : une ligne par clé, et de quoi retrouver la valeur d'origine
    const coteRegroupe = comparisonCoteRegroupeSql('"t_a"', cleSimple, ['DkCodeContrat']);
    ok('en mode « écarts de clé », chaque fichier est regroupé par clé AVANT la jointure',
        /GROUP BY 1/.test(coteRegroupe) && /COUNT\(\*\) AS __occurrences/.test(coteRegroupe));
    ok('le regroupement garde une valeur telle qu\'écrite dans le fichier pour chaque partie de la clé',
        /MIN\(CAST\("DkCodeContrat" AS VARCHAR\)\) AS __cle0/.test(coteRegroupe));

    // ---- le verdict en français
    const unique = { lignesDuFichier: 1000, lignesAvecUneCle: 1000, clesDistinctes: 1000, clesRepetees: 0, occurrencesMaximum: 1 };
    const repetee = { lignesDuFichier: 80000, lignesAvecUneCle: 79997, clesDistinctes: 65849, clesRepetees: 9212, occurrencesMaximum: 12 };
    ok('une clé dont aucune valeur ne revient deux fois est dite unique', comparisonCleEstUnique(unique) && !comparisonCleEstUnique(repetee));
    const phrase = comparisonPhraseDUnFichier('CID_taches.csv', repetee);
    ok('la phrase d\'un fichier dit ses lignes, ses clés distinctes et combien se répètent',
        /CID_taches\.csv/.test(phrase) && /80 000 ligne\(s\)/.test(phrase) && /65 849 clé\(s\) distincte\(s\)/.test(phrase) && /9 212 présente\(s\) plusieurs fois \(jusqu'à 12 fois\)/.test(phrase));
    ok('et les lignes écartées faute de clé y figurent, au lieu de disparaître',
        /3 écartée\(s\), clé vide/.test(phrase));
    ok('un fichier sans clé répétée ne traîne pas de mention inutile',
        !/plusieurs fois/.test(comparisonPhraseDUnFichier('PROPRE.csv', unique)));
    const verdictSain = comparisonVerdictDesClesHtml(unique, unique);
    ok('verdict : clé unique des deux côtés, dit en vert et sans alarmer',
        /text-emerald-700/.test(verdictSain) && /une seule ligne de chaque fichier/.test(verdictSain));
    const verdictGonfle = comparisonVerdictDesClesHtml(
        { ...unique, clesRepetees: 3, occurrencesMaximum: 5 }, { ...unique, clesRepetees: 2, occurrencesMaximum: 3 });
    ok('verdict : clé répétée des deux côtés, avec le nombre de fois de chaque côté',
        /text-amber-700/.test(verdictGonfle) && /jusqu'à 5 fois dans A/.test(verdictGonfle) && /jusqu'à 3 fois dans B/.test(verdictGonfle));
    ok('et surtout le chiffre qui explique tout : 5 × 3 = 15 lignes possibles pour une seule clé',
        /jusqu'à 15 ligne\(s\) de rapport/.test(verdictGonfle) && /Ajoutez une colonne à la clé/.test(verdictGonfle));
    ok('il est dit aussi que les écarts de clé, eux, ne craignent rien',
        /chaque clé n'est comptée qu'une fois/.test(verdictGonfle));
    const bilan = comparisonBilanDesClesHtml('A.csv', 'B.csv', repetee, unique);
    ok('le bilan réunit les deux fichiers et le verdict', /A\.csv/.test(bilan) && /B\.csv/.test(bilan) && /text-amber-700/.test(bilan));

    // ---- l'écran : le bouton, la zone, et l'oubli d'une mesure périmée
    switchTab(7); await wait(150);
    ok('Comparer : bouton « 🔎 Vérifier la clé » à côté de la clé d\'identification',
        !!document.querySelector('[onclick="comparisonVerifierLesCles()"]'));
    ok('Comparer : une zone attend le résultat de la mesure, sous la clé', !!el('compKeyCheck'));
    el('compKeyCheck').innerHTML = '<p>mesure d\'avant</p>';
    renderCompKeys();
    ok('changer la clé efface la mesure : on ne lit jamais un chiffre périmé', el('compKeyCheck').innerHTML === '');
    el('compKeyCheck').innerHTML = '<p>mesure d\'avant</p>';
    comparisonOublierLaVerification();
    ok('changer « ignorer la casse » ou « ignorer les espaces » l\'efface aussi', el('compKeyCheck').innerHTML === '');
    state.tables['t1'] = { id: 't1', name: 'A.csv', type: 'csv', status: 'ready', headers: ['CODE'], config: {}, columnsMeta: {} };
    populateCompareTables(); el('compTableA').value = ''; el('compTableB').value = '';
    await comparisonVerifierLesCles();
    ok('sans fichiers ni clé, le bouton explique ce qu\'il manque au lieu de se taire',
        /Choisissez les deux fichiers/.test(el('compKeyCheck').textContent));
    } catch (e) { R.push(['ERREUR ' + e.message + ' @ ' + String(e.stack).split('\n')[1], false]); }
    return R;
});
await pageSansMoteur.close();

// ---------- 2. Le moteur : deux fichiers aux clés répétées, comparés pour de vrai ----------
const FICHIER_HORS_LIGNE = ROOT + 'StudioDataV13-hors-ligne.html';
if (!fs.existsSync(FICHIER_HORS_LIGNE)) {
    console.log('⏭  StudioDataV13-hors-ligne.html absent — la partie « moteur » est sautée (node tools/hors-ligne.mjs)');
} else {
    const pageMoteur = await navigateur.newPage({ viewport: { width: 1500, height: 950 } });
    pageMoteur.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
    await pageMoteur.goto('file://' + FICHIER_HORS_LIGNE, { waitUntil: 'domcontentloaded' });
    await pageMoteur.waitForTimeout(3000);
    const resultatsMoteur = await pageMoteur.evaluate(async () => {
        const R = []; const ok = (n, c) => R.push([n, !!c]);
        window.lucide = window.lucide || { createIcons: () => {} };
        try { v11Prefs.tourDone = true; v11TourEnd(true); wizClose(); } catch (e) {}
        const wait = ms => new Promise(r => setTimeout(r, ms));
        try {
        // Le cas de l'utilisateur en miniature : des tâches (plusieurs par contrat) face à des
        // relations de contrat (plusieurs par contrat elles aussi).
        const CONTRATS = 100;
        const occurrencesDansA = numero => (numero % 4) + 1;
        const occurrencesDansB = numero => (numero % 3) + 1;
        const SEULS_DANS_A = 10, SEULS_DANS_B = 7, LIGNES_SANS_CLE = 3;

        const lignesA = ['DkCodeContrat;TACHE\n'];
        for (let numero = 1; numero <= CONTRATS; numero++)
            for (let rang = 1; rang <= occurrencesDansA(numero); rang++) lignesA.push('C' + numero + ';tache ' + rang + '\n');
        for (let rang = 0; rang < SEULS_DANS_A; rang++) lignesA.push('A90' + rang + ';tache seule\n');
        for (let rang = 0; rang < LIGNES_SANS_CLE; rang++) lignesA.push(';tache sans contrat\n');
        // Côté B, le code est écrit en minuscules : la comparaison ignore la casse par défaut.
        const lignesB = ['dk_code_contrat;ROLE\n'];
        for (let numero = 1; numero <= CONTRATS; numero++)
            for (let rang = 1; rang <= occurrencesDansB(numero); rang++) lignesB.push('c' + numero + ';role ' + rang + '\n');
        for (let rang = 0; rang < SEULS_DANS_B; rang++) lignesB.push('B90' + rang + ';role seul\n');

        const charger = async (id, nom, lignes) => {
            state.tables[id] = { id, name: nom, type: 'csv', status: 'loading',
                file: new File([lignes.join('')], nom, { type: 'text/csv' }), headers: [], config: {}, columnsMeta: {} };
            state.tables[id].headers = await ingestFileTable(id);
            state.tables[id].status = 'ready';
        };
        await charger('ta', 'TACHES.csv', lignesA);
        await charger('tb', 'RELATIONS.csv', lignesB);

        // Ce que les fichiers contiennent, calculé à part : le test ne reprend pas les chiffres du code.
        let lignesAvecCleA = 0, clesRepeteesA = 0, lignesAvecCleB = 0, clesRepeteesB = 0, appariements = 0;
        for (let numero = 1; numero <= CONTRATS; numero++) {
            lignesAvecCleA += occurrencesDansA(numero); lignesAvecCleB += occurrencesDansB(numero);
            if (occurrencesDansA(numero) > 1) clesRepeteesA++;
            if (occurrencesDansB(numero) > 1) clesRepeteesB++;
            appariements += occurrencesDansA(numero) * occurrencesDansB(numero);
        }
        lignesAvecCleA += SEULS_DANS_A; lignesAvecCleB += SEULS_DANS_B;
        const clesDistinctesA = CONTRATS + SEULS_DANS_A, clesDistinctesB = CONTRATS + SEULS_DANS_B;
        const clesDeLUnion = CONTRATS + SEULS_DANS_A + SEULS_DANS_B;
        const lignesDeLAncienneJointure = appariements + SEULS_DANS_A + SEULS_DANS_B;

        const { conn } = await getDB();
        const compter = async sql => Number(arrowResultToObjects(await conn.query(sql))[0].n);
        const couple = [{ id: 'k1', colA: 'DkCodeContrat', colB: 'dk_code_contrat' }];
        const cleA = comparisonCleCompositeSql(couple, 'A', true, true);
        const cleB = comparisonCleCompositeSql(couple, 'B', true, true);

        // ---- le défaut, reproduit : apparier les LIGNES fabrique plus de lignes que les deux fichiers réunis
        const ancienneJointure = await compter(
            `SELECT COUNT(*)::BIGINT AS n FROM (SELECT *, ${cleA} AS __nk FROM ${sqlIdent(duckTableName('ta'))} WHERE ${cleA} IS NOT NULL) a` +
            ` FULL OUTER JOIN (SELECT *, ${cleB} AS __nk FROM ${sqlIdent(duckTableName('tb'))} WHERE ${cleB} IS NOT NULL) b ON a.__nk = b.__nk`);
        ok('le cas est bien reproduit : apparier les lignes donne ' + ancienneJointure + ' lignes pour ' +
            (lignesAvecCleA + lignesAvecCleB) + ' lignes de fichiers', ancienneJointure === lignesDeLAncienneJointure);
        ok('et bien plus que le nombre de clés réellement en jeu (' + clesDeLUnion + ')', ancienneJointure > clesDeLUnion * 3);

        // ---- la mesure des clés, fichier par fichier
        const { mesureA, mesureB } = await comparisonMesurerLesDeuxCotes(conn, 'ta', 'tb', couple, true, true);
        ok('fichier A : toutes ses lignes sont comptées, y compris celles qui n\'ont pas de clé',
            mesureA.lignesDuFichier === lignesAvecCleA + LIGNES_SANS_CLE && mesureA.lignesAvecUneCle === lignesAvecCleA);
        ok('fichier A : ses clés distinctes sont comptées une fois chacune',
            mesureA.clesDistinctes === clesDistinctesA && mesureA.clesRepetees === clesRepeteesA && mesureA.occurrencesMaximum === 4);
        ok('fichier B : même mesure, et aucune ligne sans clé à écarter',
            mesureB.lignesDuFichier === lignesAvecCleB && mesureB.clesDistinctes === clesDistinctesB &&
            mesureB.clesRepetees === clesRepeteesB && mesureB.occurrencesMaximum === 3);
        ok('la clé n\'est unique d\'aucun côté : c\'est dit', !comparisonCleEstUnique(mesureA) && !comparisonCleEstUnique(mesureB));

        // ---- la comparaison des écarts de clé, lancée comme l'utilisateur la lance
        switchTab(7); populateCompareTables(); await wait(100);
        el('compTableA').value = 'ta'; el('compTableB').value = 'tb';
        compState.keys = [{ id: 'k1', colA: 'DkCodeContrat', colB: 'dk_code_contrat' }];
        compState.mappings = [];
        renderCompKeys();
        await runComparison(); await wait(300);
        const resume = el('compSummary').textContent;
        const chiffreDeLaTuile = etiquette => {
            const tuiles = Array.from(el('compSummary').querySelectorAll('.rounded-xl'));
            const trouvee = tuiles.find(t => new RegExp(etiquette, 'i').test(t.textContent));
            return trouvee ? Number(trouvee.querySelector('.text-2xl').textContent.replace(/[^\d]/g, '')) : -1;
        };
        ok('« Clés évaluées » est l\'union des clés distinctes (' + clesDeLUnion + '), plus jamais le nombre d\'appariements',
            chiffreDeLaTuile('Clés évaluées') === clesDeLUnion);
        ok('« Présentes des deux côtés » compte les clés communes, une fois chacune',
            chiffreDeLaTuile('Présentes des deux côtés') === CONTRATS);
        ok('« En plus dans A » et « En plus dans B » comptent des clés eux aussi',
            chiffreDeLaTuile('En plus dans A') === SEULS_DANS_A && chiffreDeLaTuile('En plus dans B') === SEULS_DANS_B);
        ok('les quatre tuiles se recollent : communes + en plus dans A + en plus dans B = clés évaluées',
            chiffreDeLaTuile('Présentes des deux côtés') + chiffreDeLaTuile('En plus dans A') + chiffreDeLaTuile('En plus dans B') === chiffreDeLaTuile('Clés évaluées'));
        ok('le résumé dit en clair ce que contient chaque fichier, lignes ET clés distinctes',
            /TACHES\.csv/.test(resume) && /RELATIONS\.csv/.test(resume) && /clé\(s\) distincte\(s\)/.test(resume));
        ok('et prévient que la clé n\'est pas unique, sans que cela fausse les écarts de clé',
            /La clé n'est pas unique/.test(resume) && /comptent des clés, pas des lignes/.test(resume));

        // ---- le rapport : une ligne par clé, et le nombre d'occurrences de chaque côté
        const rapport = await (await fetch(el('compDownloadLink').href)).text();
        const lignesDuRapport = rapport.replace(/^﻿/, '').trim().split('\n');
        ok('le rapport contient une ligne par clé, pas une par appariement',
            lignesDuRapport.length - 1 === clesDeLUnion);
        ok('ses colonnes disent la clé, le statut, et le nombre d\'occurrences de chaque côté',
            lignesDuRapport[0] === '"CLE_IDENTIFICATION";"STATUT_LIGNE";"OCCURRENCES_FICHIER_A";"OCCURRENCES_FICHIER_B"');
        const ligneDeC11 = lignesDuRapport.find(l => /^"C11";/.test(l));
        ok('une clé présente 4 fois dans A et 3 fois dans B tient sur UNE ligne, qui dit « 4 » et « 3 »',
            ligneDeC11 === '"C11";"Clé présente des deux côtés";"4";"3"');
        const ligneSeuleDansA = lignesDuRapport.find(l => /^"A900";/.test(l));
        ok('une clé absente de B est dite manquante côté B, avec zéro occurrence de ce côté',
            ligneSeuleDansA === '"A900";"Manquant Fichier B";"1";"0"');
        const ligneSeuleDansB = lignesDuRapport.find(l => /^"B900";/.test(l));
        ok('et réciproquement pour une clé absente de A', ligneSeuleDansB === '"B900";"Manquant Fichier A";"0";"1"');
        ok('la valeur affichée est celle du fichier, telle quelle, même quand la casse est ignorée',
            /^"C11";/.test(ligneDeC11) && !/^"c11";/.test(ligneDeC11));

        // ---- comparaison de VALEURS : l'appariement reste, mais il est annoncé
        compState.mappings = [{ id: 'm1', colA: 'TACHE', colB: 'ROLE' }];
        await runComparison(); await wait(300);
        const resumeValeurs = el('compSummary').textContent;
        ok('en comparant des valeurs, la tuile de tête compte les lignes du rapport, pas celles du fichier A',
            chiffreDeLaTuile('Lignes du rapport') === lignesDeLAncienneJointure);
        ok('la somme des trois autres tuiles retombe juste sur ce total',
            chiffreDeLaTuile('100% Identiques') + chiffreDeLaTuile('Avec Différences') + chiffreDeLaTuile('Lignes Absentes') === chiffreDeLaTuile('Lignes du rapport'));
        ok('et la multiplication n\'est plus silencieuse : le résumé dit pourquoi le rapport est si gros',
            /La clé n'est pas unique/.test(resumeValeurs) && /ligne\(s\) de rapport/.test(resumeValeurs) && /Ajoutez une colonne à la clé/.test(resumeValeurs));

        // ---- la vérification AVANT de lancer
        el('compKeyCheck').innerHTML = '';
        await comparisonVerifierLesCles(); await wait(200);
        ok('le bouton « Vérifier la clé » donne les mêmes chiffres sans lancer la comparaison',
            /TACHES\.csv/.test(el('compKeyCheck').textContent) && /clé\(s\) distincte\(s\)/.test(el('compKeyCheck').textContent) &&
            /La clé n'est pas unique/.test(el('compKeyCheck').textContent));
        } catch (e) { R.push(['ERREUR ' + e.message + ' @ ' + String(e.stack).split('\n')[1], false]); }
        return R;
    });
    await pageMoteur.close();
    resultats.push(...resultatsMoteur);
}

await navigateur.close();
let fail = 0;
for (const [n, c] of resultats) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${resultats.length - fail}/${resultats.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
