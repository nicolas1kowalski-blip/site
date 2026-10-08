import fs from 'fs';
// Une synthèse de table liée ne doit JAMAIS changer le nombre de lignes du fichier produit.
//
// L'écran l'écrit noir sur blanc : « 1 ligne par ligne de la table de départ — jamais de
// multiplication de lignes ». La promesse tenait quand les deux tables étaient reliées
// directement, pas quand une TABLE DE LIAISON se trouvait au milieu : cette table-là était
// jointe au résultat, et comme elle porte plusieurs lignes pour une même ligne de départ,
// elle multipliait les lignes du fichier. Avec « intersection », elle les supprimait.
//
// Le SQL est construit par l'écran, puis exécuté sur un vrai DuckDB : ce qui est vérifié
// ici, c'est le fichier qui sort, pas l'intention du code.
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs
    .readFileSync(process.env.SD_FILE || ROOT + 'StudioDataV13.html', 'utf8')
    .replace(/<script src="https:[^"]*"[^>]*><\/script>/g, '')
    .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');

// CONTRATS C1…C5 ; la liaison ne couvre que C1 (deux fois) et C2 ; une ligne de liaison
// pointe un contrat qui n'existe pas, pour vérifier qu'elle n'invente aucune ligne.
const CONTRATS = [['C1', 'Dupont'], ['C2', 'Martin'], ['C3', 'Durand'], ['C4', 'Petit'], ['C5', 'Roux']];
const LIAISON = [['C1', 'S1'], ['C1', 'S2'], ['C2', 'S3'], ['C9', 'S4']];
const SINISTRES = [['S1', '100', 'OUVERT'], ['S2', '200', 'CLOS'], ['S3', '300', 'OUVERT'], ['S4', '400', 'CLOS']];

const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr = []; p.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html, { waitUntil: 'domcontentloaded' });
await p.addStyleTag({ path: D + 'tw/tw_built.css' });
await p.evaluate(() => { v11Prefs.tourDone = true; });
await p.waitForTimeout(1500);

const prepare = await p.evaluate(() => {
    window.lucide = { createIcons: () => {} };
    try { v11TourEnd(true); wizClose(); } catch (e) {}
    restoreCompleted = true;
    state.tables['c'] = { id: 'c', name: 'CONTRATS', type: 'csv', status: 'ready', headers: ['NUM', 'NOM'], config: {}, columnsMeta: {} };
    state.tables['l'] = { id: 'l', name: 'LIAISON', type: 'csv', status: 'ready', headers: ['NUM_CONTRAT', 'ID_SIN'], config: {}, columnsMeta: {} };
    state.tables['s'] = { id: 's', name: 'SINISTRES', type: 'csv', status: 'ready', headers: ['ID', 'MONTANT', 'ETAT'], config: {}, columnsMeta: {} };
    state.relations = [
        { id: 'r1', sourceTable: 'l', targetTable: 'c', sourceCol: 'NUM_CONTRAT', targetCol: 'NUM', type: 'N-1' },
        { id: 'r2', sourceTable: 'l', targetTable: 's', sourceCol: 'ID_SIN', targetCol: 'ID', type: 'N-1' }
    ];
    renderTables(); switchTab(3);

    const neuf = () => {
        const spec = state.advExtract;
        spec.baseId = 'c'; spec.columns = []; spec.filters = [];
        spec.dedup = { on: false, keys: [], keep: 'first' }; spec.group = { on: false, aggs: [], dims: [] };
        spec.limit500 = false; spec.customSql = ''; spec.joinType = 'left';
        spec.columns.push({ id: 'c1', tableId: 'c', col: 'NUM', alias: 'NUM', transform: 'none' });
        return spec;
    };
    const synthese = (mode, col, options) =>
        Object.assign({ id: 'c2', kind: 'link', tableId: 's', mode, col: col || '', n: 3, via: '', alias: 'R', transform: 'none' }, options || {});
    const sqlDe = spec => { const q = buildAdvSql(spec); return q.err ? 'ERREUR ' + q.err : q.sql; };

    const sorties = {};
    let spec = neuf(); spec.columns.push(synthese('count')); sorties.compte = sqlDe(spec);
    spec = neuf(); spec.columns.push(synthese('count')); spec.joinType = 'inner'; sorties.compteIntersection = sqlDe(spec);
    spec = neuf(); spec.columns.push(synthese('countd', 'ETAT')); sorties.compteDistinct = sqlDe(spec);
    spec = neuf(); spec.columns.push(synthese('values', 'MONTANT')); sorties.valeurs = sqlDe(spec);
    spec = neuf(); spec.columns.push(synthese('cols', 'MONTANT', { n: 2 })); sorties.colonnes = sqlDe(spec);
    // Le chemin donné explicitement doit donner le même résultat que le chemin par défaut.
    spec = neuf(); spec.columns.push(synthese('count', '', { via: 'r1>r2' })); sorties.compteParChemin = sqlDe(spec);
    // Non-régression : une table reliée DIRECTEMENT à la table de départ.
    spec = neuf(); spec.columns.push(Object.assign(synthese('count'), { tableId: 'l', alias: 'R' })); sorties.compteDirect = sqlDe(spec);
    // Témoin : une vraie colonne jointe, elle, multiplie — c'est une jointure, pas une synthèse.
    spec = neuf(); spec.columns.push({ id: 'c2', tableId: 's', col: 'MONTANT', alias: 'R', transform: 'none' }); sorties.colonneJointe = sqlDe(spec);

    // ---- Un critère sur la synthèse : il change ce qui est compté, pas les lignes ----
    // « Compter les sinistres OUVERTS » n'est pas « ne garder que les contrats qui en ont un ».
    spec = neuf();
    spec.columns.push(synthese('count', '', { conds: [{ tableId: 's', col: 'ETAT', op: '=', val: 'OUVERT' }] }));
    sorties.compteAvecCritere = sqlDe(spec);
    // Le critère peut aussi porter sur la table de liaison elle-même.
    spec = neuf();
    spec.columns.push(synthese('count', '', { conds: [{ tableId: 'l', col: 'ID_SIN', op: '=', val: 'S1' }] }));
    sorties.compteCritereSurLaLiaison = sqlDe(spec);
    // Deux critères se cumulent.
    spec = neuf();
    spec.columns.push(
        synthese('count', '', {
            conds: [
                { tableId: 's', col: 'ETAT', op: '=', val: 'OUVERT' },
                { tableId: 's', col: 'MONTANT', op: '=', val: '300' }
            ]
        })
    );
    sorties.compteDeuxCriteres = sqlDe(spec);
    // Et sur les autres modes de synthèse.
    spec = neuf();
    spec.columns.push(synthese('values', 'MONTANT', { conds: [{ tableId: 's', col: 'ETAT', op: '=', val: 'CLOS' }] }));
    sorties.valeursAvecCritere = sqlDe(spec);
    // Le même critère posé en FILTRE ordinaire, lui, retire des lignes : c'est le témoin.
    spec = neuf();
    spec.columns.push(synthese('count'));
    spec.filters.push({ id: 'f1', tableId: 's', col: 'ETAT', op: '=', val: 'OUVERT' });
    sorties.memeChoseEnFiltre = sqlDe(spec);

    // ---- La portée d'un filtre posé sur une table liée ----
    // « Ne ramener que les sinistres ouverts » n'est pas « ne garder que les contrats qui en
    // ont un ». Le même filtre fait l'un ou l'autre selon sa portée.
    spec = neuf();
    spec.columns.push({ id: 'c2', tableId: 's', col: 'MONTANT', alias: 'MONTANT', transform: 'none' });
    spec.filters.push({ id: 'f1', tableId: 's', col: 'ETAT', op: '=', val: 'OUVERT', portee: 'lien' });
    sorties.filtreSurLeLien = sqlDe(spec);
    spec = neuf();
    spec.columns.push({ id: 'c2', tableId: 's', col: 'MONTANT', alias: 'MONTANT', transform: 'none' });
    spec.filters.push({ id: 'f1', tableId: 's', col: 'ETAT', op: '=', val: 'OUVERT', portee: 'ligne' });
    sorties.filtreSurLaLigne = sqlDe(spec);
    // Un filtre enregistré avant que ce choix existe garde l'ancien comportement.
    spec = neuf();
    spec.columns.push({ id: 'c2', tableId: 's', col: 'MONTANT', alias: 'MONTANT', transform: 'none' });
    spec.filters.push({ id: 'f1', tableId: 's', col: 'ETAT', op: '=', val: 'OUVERT' });
    sorties.filtreSansPortee = sqlDe(spec);
    // Sur la table de départ, la portée ne change rien : il n'y a pas de lien.
    spec = neuf();
    spec.filters.push({ id: 'f1', tableId: 'c', col: 'NOM', op: '=', val: 'Dupont', portee: 'lien' });
    sorties.filtreSurLaBaseMemePortee = sqlDe(spec);

    // ---- Le diagnostic de la perte de lignes (fonctions pures, pas besoin du moteur) ----
    // Perdre des lignes est plus discret que les multiplier : rien ne le dit, le fichier sort
    // simplement incomplet. L'écran doit nommer la cause, sans quoi on la cherche des heures.
    const diag = {};
    spec = neuf(); spec.filters.push({ id: 'f1', tableId: 's', col: 'ETAT', op: '=', val: 'OUVERT', portee: 'ligne' });
    diag.filtreSurTableLiee = v13VerdictDeLaPerte(spec, 20000, 1500);
    spec = neuf(); spec.filters.push({ id: 'f1', tableId: 's', col: 'ETAT', op: '=', val: 'OUVERT', portee: 'lien' });
    diag.filtreSurLeLienNestPasEnCause = v13VerdictDeLaPerte(spec, 20000, 19000);
    spec = neuf(); spec.joinType = 'inner';
    diag.intersection = v13VerdictDeLaPerte(spec, 20000, 3000);
    spec = neuf(); spec.filters.push({ id: 'f1', tableId: 'c', col: 'NOM', op: '=', val: 'Dupont' });
    diag.filtreSurLaBase = v13VerdictDeLaPerte(spec, 20000, 1);
    spec = neuf();
    diag.riennePerd = v13VerdictDeLaPerte(spec, 20000, 20000);
    diag.pasDeFauxPositifSiMultiplication = v13VerdictDeLaPerte(spec, 20000, 22000);
    sorties.diag = diag;
    return sorties;
});
await b.close();

// ---- le SQL produit par l'écran, exécuté sur un vrai DuckDB ----
const { DuckDBInstance } = await import('@duckdb/node-api');
const instance = await DuckDBInstance.create(':memory:');
const conn = await instance.connect();
const requete = async sql => (await (await conn.run(sql)).getRowObjects());
const valeurs = lignes => lignes.map(l => '(' + l.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ') + ')').join(', ');
await requete(`CREATE TABLE "t_c" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ${valeurs(CONTRATS)}) v(NUM,NOM)`);
await requete(`CREATE TABLE "t_l" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ${valeurs(LIAISON)}) v(NUM_CONTRAT,ID_SIN)`);
await requete(`CREATE TABLE "t_s" AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ${valeurs(SINISTRES)}) v(ID,MONTANT,ETAT)`);

const out = [];
const ok = (n, c) => out.push([n, !!c]);
const parContrat = async sql => Object.fromEntries((await requete(sql)).map(l => [String(l.NUM), l]));
const combien = async sql => (await requete(sql)).length;

const compte = await parContrat(prepare.compte);
ok('une synthèse à travers une table de liaison ne change pas le nombre de lignes : 5 contrats, 5 lignes',
    (await combien(prepare.compte)) === 5);
ok('le contrat relié DEUX fois n’apparaît qu’une fois, et compte bien 2', Number(compte.C1.R) === 2);
ok('le contrat relié une fois compte 1', Number(compte.C2.R) === 1);
ok('un contrat sans aucun lien sort quand même, avec 0 — il n’est pas filtré',
    Number(compte.C3.R) === 0 && Number(compte.C4.R) === 0 && Number(compte.C5.R) === 0);
ok('une ligne de liaison qui pointe un contrat inexistant n’invente aucune ligne', !compte.C9);

ok('« intersection » ne supprime plus les lignes sans lien quand il n’y a qu’une synthèse',
    (await combien(prepare.compteIntersection)) === 5);

const distinct = await parContrat(prepare.compteDistinct);
ok('compter les valeurs différentes au bout du lien : C1 a deux états différents',
    Number(distinct.C1.R) === 2 && Number(distinct.C2.R) === 1 && Number(distinct.C3.R) === 0);

const liste = await parContrat(prepare.valeurs);
ok('lister les valeurs au bout du lien : les deux montants de C1, séparés',
    String(liste.C1.R).split(' | ').sort().join(',') === '100,200');
ok('un contrat sans lien n’a aucune valeur listée', liste.C3.R === null || liste.C3.R === '');

const colonnes = await parContrat(prepare.colonnes);
ok('transposer en colonnes : C1 remplit les deux colonnes, C2 une seule',
    [colonnes.C1.R_1, colonnes.C1.R_2].sort().join(',') === '100,200' &&
        colonnes.C2.R_1 === '300' && colonnes.C2.R_2 === null);

const parChemin = await parContrat(prepare.compteParChemin);
ok('le chemin indiqué explicitement donne exactement le même résultat que le chemin par défaut',
    (await combien(prepare.compteParChemin)) === 5 && Number(parChemin.C1.R) === 2 && Number(parChemin.C3.R) === 0);

const direct = await parContrat(prepare.compteDirect);
ok('non-régression : une table reliée directement compte toujours juste',
    (await combien(prepare.compteDirect)) === 5 && Number(direct.C1.R) === 2 && Number(direct.C5.R) === 0);

ok('témoin : une vraie colonne jointe multiplie bien les lignes — c’est une jointure, pas une synthèse',
    (await combien(prepare.colonneJointe)) === 6);

ok('aucune table de liaison n’est jointe au résultat d’une synthèse',
    !/LEFT JOIN "t_l"/.test(prepare.compte) && /FROM "t_s" s JOIN "t_l"/.test(prepare.compte));

// ---- Un critère de synthèse : il restreint ce qui est compté, jamais les lignes ----
const avecCritere = await parContrat(prepare.compteAvecCritere);
ok('un critère sur la synthèse ne retire aucune ligne : les 5 contrats sortent toujours',
    (await combien(prepare.compteAvecCritere)) === 5);
ok('le compte ne retient que ce qui satisfait le critère : C1 a 1 sinistre ouvert sur 2',
    Number(avecCritere.C1.R) === 1 && Number(avecCritere.C2.R) === 1);
ok('un contrat dont AUCUN sinistre ne satisfait le critère sort avec 0, il ne disparaît pas',
    Number(avecCritere.C3.R) === 0 && Number(avecCritere.C5.R) === 0);

const surLaLiaison = await parContrat(prepare.compteCritereSurLaLiaison);
ok('le critère peut porter sur la table de liaison elle-même',
    (await combien(prepare.compteCritereSurLaLiaison)) === 5 &&
        Number(surLaLiaison.C1.R) === 1 && Number(surLaLiaison.C2.R) === 0);

const deuxCriteres = await parContrat(prepare.compteDeuxCriteres);
ok('deux critères se cumulent : seul C2 a un sinistre ouvert à 300',
    Number(deuxCriteres.C2.R) === 1 && Number(deuxCriteres.C1.R) === 0);

const valeursCritere = await parContrat(prepare.valeursAvecCritere);
ok('un critère s’applique aussi aux autres modes : seuls les sinistres clos de C1 sont listés',
    String(valeursCritere.C1.R) === '200' && (valeursCritere.C2.R === null || valeursCritere.C2.R === ''));

ok('témoin : le MÊME critère posé en filtre ordinaire, lui, retire bien des lignes',
    (await combien(prepare.memeChoseEnFiltre)) < 5);

// ---- Un filtre « sur le lien » restreint ce qu'on ramène, pas les lignes du fichier ----
// La colonne MONTANT vient d'une jointure : C1 ayant deux liens, il occupe deux lignes.
// Ce n'est pas le filtre qui le dédouble — c'est la jointure, et elle le faisait déjà.
// Ce que le filtre ne doit PAS faire, c'est en retirer.
const lignesSurLeLien = await requete(prepare.filtreSurLeLien);
const lignesSansFiltre = await requete(prepare.colonneJointe);
ok('un filtre « sur le lien » ne retire aucune ligne : exactement autant qu’avant de le poser',
    lignesSurLeLien.length === lignesSansFiltre.length);
ok('les cinq contrats sont tous présents, filtre posé',
    new Set(lignesSurLeLien.map(l => String(l.NUM))).size === 5);
ok('il restreint ce qui est RAMENÉ : seuls les montants des sinistres ouverts remontent',
    [...new Set(lignesSurLeLien.map(l => l.MONTANT).filter(v => v !== null).map(String))].sort().join(',') === '100,300');
ok('une ligne sans lien, ou dont le lien ne satisfait pas le filtre, sort avec la colonne vide',
    lignesSurLeLien.filter(l => ['C3', 'C4', 'C5'].includes(String(l.NUM))).every(l => l.MONTANT === null) &&
        lignesSurLeLien.some(l => String(l.NUM) === 'C1' && l.MONTANT === null));
ok('le même filtre « sur la ligne » retire bien les lignes — l’ancien comportement reste accessible',
    (await combien(prepare.filtreSurLaLigne)) === 2);
ok('un filtre enregistré avant ce choix garde l’ancien comportement, pour qu’un paramétrage rejoué rende le même fichier',
    prepare.filtreSansPortee === prepare.filtreSurLaLigne);
ok('sur la table de départ, la portée ne change rien : la condition reste dans le WHERE',
    /WHERE/.test(prepare.filtreSurLaBaseMemePortee) && (await combien(prepare.filtreSurLaBaseMemePortee)) === 1);
ok('un filtre « sur le lien » s’écrit dans la jointure, pas dans le WHERE',
    /ON .*\n?\s*AND/.test(prepare.filtreSurLeLien) && !/WHERE/.test(prepare.filtreSurLeLien));

// ---- Quand des lignes manquent quand même, l'écran doit le dire et nommer la cause ----
const diag = prepare.diag;
ok('une perte de lignes est annoncée avec les deux nombres, pas seulement signalée',
    !!diag.filtreSurTableLiee && /1\s500/.test(diag.filtreSurTableLiee.phrase) && /20\s000/.test(diag.filtreSurTableLiee.phrase) &&
        diag.filtreSurTableLiee.manquantes === 18500);
ok('un filtre sur une table liée est nommé comme la cause, avec la sortie à prendre',
    /SINISTRES/.test(diag.filtreSurTableLiee.causes.join(' ')) &&
        /sur le lien/.test(diag.filtreSurTableLiee.causes.join(' ')));
ok('« intersection » est nommée comme cause quand elle est choisie',
    !!diag.intersection && /intersection/.test(diag.intersection.causes.join(' ')));
ok('un filtre sur la table de départ est dit normal, pas présenté comme une anomalie',
    !!diag.filtreSurLaBase && /c’est leur rôle/.test(diag.filtreSurLaBase.causes.join(' ')));
ok('rien n’est signalé quand aucune ligne ne manque', diag.riennePerd === null);
ok('une multiplication n’est pas prise pour une perte', diag.pasDeFauxPositifSiMultiplication === null);
ok('un filtre « sur le lien » n’est pas accusé d’une perte : il n’en cause aucune',
    !/SINISTRES/.test(diag.filtreSurLeLienNestPasEnCause.causes.join(' ')));

let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
