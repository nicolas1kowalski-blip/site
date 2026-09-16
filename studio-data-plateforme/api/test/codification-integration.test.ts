/**
 * Test d’intégration de la codification : une liste d’équipements reçue, une nomenclature en arbre, et le
 * code type d’équipement retrouvé ligne à ligne — par le code déjà fourni, par la table de correspondance, par
 * les règles de mots-clés, puis par la ressemblance du libellé, en restant dans la bonne famille.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { creerApplication } from '../src/application';
import { lireConfiguration } from '../src/configuration/configuration';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-codification-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};

type Reponse = { statusCode: number; body: string; headers: Record<string, unknown>; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;

async function deposerSource(id: string, nom: string, csv: string, enTetes: string[]) {
    await appel({
        method: 'PUT',
        url: '/api/fichiers/src_' + id,
        payload: Buffer.from(csv),
        headers: { 'content-type': 'application/octet-stream' }
    });
    await appel({
        method: 'POST',
        url: '/api/sql',
        payload: {
            sql: `CREATE TABLE "t_${id}" AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_${id}', header=true, all_varchar=true, delim=';')`
        }
    });
    await appel({ method: 'PUT', url: '/api/tables/' + id, payload: { name: nom, type: 'csv', headers: enTetes } });
}

before(async () => {
    const configuration = lireConfiguration({
        SD_DONNEES: dossierTemporaire,
        SD_JOURNAL: 'silent',
        SD_ADMIN_MOT_DE_PASSE: 'MotDePasseAdmin1',
        SD_WEB: path.join(dossierTemporaire, 'absent'),
        SD_WEB_CLASSIQUE: path.join(dossierTemporaire, 'absent')
    });
    app = await creerApplication(configuration);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const connexion = await appel({
        method: 'POST',
        url: '/api/auth/connexion',
        payload: { identifiant: 'admin', motDePasse: 'MotDePasseAdmin1' }
    });
    cookies = { sd_session: connexion.cookies.find(cookie => cookie.name === 'sd_session')!.value };

    // La liste reçue : des libellés écrits à la main, une famille, et un code parfois déjà renseigné.
    await deposerSource(
        'equi',
        'equipements.csv',
        [
            'REPERE;LIBELLE;FAMILLE;CODE_FOURNI;DESIGNATION',
            'EQ001;Pompe centrifuge alimentaire;POMPES;;PC ALIM',
            'EQ002;POMPE  CENTRIFUGE (X2);POMPES;;PC X2',
            'EQ003;Vanne papillon DN100;VANNES;;VP DN100',
            'EQ004;Vanne DN80;VANNES;;VP DN80',
            'EQ005;Échangeur à plaques;ECHANGEURS;ECH-P;EP 12',
            'EQ006;Bidule non identifiable;POMPES;;ZZZ',
            'EQ007;Pompe à vide;POMPES;;PV 3',
            'EQ008;Groupe motopompe centrif;POMPES;;PC 7',
            'EQ009;Electrovanne papillon DN50;VANNES;;VP DN50',
            ''
        ].join('\n'),
        ['REPERE', 'LIBELLE', 'FAMILLE', 'CODE_FOURNI', 'DESIGNATION']
    );
    // La nomenclature : famille › système › sous-système › type, et le code du type tout en bas.
    await deposerSource(
        'nomen',
        'nomenclature.csv',
        [
            'FAMILLE;SYSTEME;SOUS_SYSTEME;LIBELLE_TYPE;CODE_TYPE;ABREGE',
            'POMPES;Transfert;Centrifuge;Pompe centrifuge;PMP-C;PC',
            'POMPES;Vide;Anneau liquide;Pompe a vide;PMP-V;PV',
            'VANNES;Sectionnement;Quart de tour;Vanne papillon;VAN-P;VP',
            'VANNES;Reglage;Lineaire;Vanne de reglage;VAN-R;VR',
            'ECHANGEURS;Thermique;Plaques;Echangeur a plaques;ECH-P;EP',
            ''
        ].join('\n'),
        ['FAMILLE', 'SYSTEME', 'SOUS_SYSTEME', 'LIBELLE_TYPE', 'CODE_TYPE', 'ABREGE']
    );
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

/** La codification du cas, telle que l'écran l'enregistre. */
const codification = (partielle: object = {}) => ({
    nom: 'Codes équipements',
    source: 'equipements.csv',
    colonneLibelle: 'LIBELLE',
    colonneCodeExistant: 'CODE_FOURNI',
    nomenclature: 'nomenclature.csv',
    colonneCode: 'CODE_TYPE',
    colonneLibelleRef: 'LIBELLE_TYPE',
    niveaux: ['FAMILLE', 'SYSTEME', 'SOUS_SYSTEME', 'LIBELLE_TYPE'],
    restreindreSource: 'FAMILLE',
    restreindreNomenclature: 'FAMILLE',
    regles: [],
    comparaisons: [],
    synonymes: [],
    correspondances: [],
    seuilAuto: 0.99,
    seuilRevoir: 0.45,
    methode: 'mots',
    decisions: {},
    ...partielle
});

const enregistrer = (partielle: object = {}) => appel({ method: 'PUT', url: '/api/codification/cd1', payload: codification(partielle) });
const executer = async () => json(await appel({ method: 'POST', url: '/api/codification/cd1/executer' }));
/** Le résultat rangé par repère : de quoi vérifier ligne par ligne sans dépendre de l'ordre. */
const parRepere = (resultat: { colonnes: string[]; lignes: unknown[][] }) => {
    const indice = (nom: string) => resultat.colonnes.indexOf(nom);
    return Object.fromEntries(
        resultat.lignes.map(ligne => [
            String(ligne[indice('REPERE')]),
            {
                code: ligne[indice('__code')] === null ? '' : String(ligne[indice('__code')]),
                origine: String(ligne[indice('__origine')]),
                statut: String(ligne[indice('__statut')]),
                chemin: ligne[indice('__chemin')] === null ? '' : String(ligne[indice('__chemin')]),
                score: Number(ligne[indice('__score')]) || 0
            }
        ])
    );
};

test('vocabulaire : l’écran reçoit les types de règle, les méthodes, les origines et les statuts', async () => {
    const vocabulaire = json(await appel({ method: 'GET', url: '/api/codification/vocabulaire' }));
    assert.ok(vocabulaire.typesDeRegle.motscles && vocabulaire.typesDeRegle.expression);
    assert.ok(vocabulaire.methodes.jw && vocabulaire.methodes.lev);
    assert.ok(vocabulaire.statuts.office && vocabulaire.statuts.revoir && vocabulaire.statuts.absent);
});

test('codification : le code déjà fourni est gardé tel quel, sans jamais être remis en cause', async () => {
    assert.equal((await enregistrer()).statusCode, 200);
    const lignes = parRepere(await executer());
    assert.equal(lignes.EQ005.code, 'ECH-P');
    assert.equal(lignes.EQ005.origine, 'existant');
    assert.equal(lignes.EQ005.statut, 'office');
});

test('codification : la ressemblance retrouve le code malgré la casse, les accents, la ponctuation et les mots en trop', async () => {
    const lignes = parRepere(await executer());
    assert.equal(lignes.EQ001.code, 'PMP-C', '« Pompe centrifuge alimentaire » contient les deux mots du type');
    assert.equal(lignes.EQ001.origine, 'ressemblance');
    assert.equal(lignes.EQ002.code, 'PMP-C', '« POMPE  CENTRIFUGE (X2) » vaut « Pompe centrifuge »');
    assert.equal(lignes.EQ003.code, 'VAN-P', '« Vanne papillon DN100 » est bien une vanne papillon');
    assert.equal(lignes.EQ007.code, 'PMP-V', '« Pompe à vide » retrouve « Pompe a vide » malgré l’accent');
});

test('codification : le chemin complet de l’arbre accompagne chaque code trouvé', async () => {
    const lignes = parRepere(await executer());
    assert.equal(lignes.EQ001.chemin, 'POMPES › Transfert › Centrifuge › Pompe centrifuge');
    assert.equal(lignes.EQ005.chemin, 'ECHANGEURS › Thermique › Plaques › Echangeur a plaques');
});

test('codification : un libellé approchant est mis à revoir, un libellé inconnu reste sans proposition', async () => {
    const lignes = parRepere(await executer());
    assert.equal(lignes.EQ004.statut, 'revoir', '« Vanne DN80 » ne dit pas laquelle : un mot sur deux');
    assert.equal(lignes.EQ004.code, '');
    assert.equal(lignes.EQ006.statut, 'absent');
    assert.equal(lignes.EQ006.origine, 'aucune');
});

test('codification : le bilan dit combien de lignes sont codées, à revoir et sans proposition', async () => {
    const { bilan } = await executer();
    assert.equal(bilan.total, 9);
    assert.equal(bilan.office + bilan.revoir + bilan.absent, 9);
    assert.ok(bilan.office >= 4, 'la majorité est codée sans intervention');
    assert.match(bilan.phrase, /codées d’office sur 9/);
});

test('codification : une règle de mots-clés l’emporte sur la ressemblance, et ses exclusions sont respectées', async () => {
    await enregistrer({
        regles: [
            {
                id: 'r1',
                actif: true,
                code: 'PMP-V',
                colonne: '',
                type: 'motscles',
                contient: ['pompe', 'vide'],
                ou: false,
                sauf: [],
                motif: ''
            },
            {
                id: 'r2',
                actif: true,
                code: 'PMP-C',
                colonne: '',
                type: 'motscles',
                contient: ['pompe'],
                ou: false,
                sauf: ['vide'],
                motif: ''
            }
        ]
    });
    const lignes = parRepere(await executer());
    assert.equal(lignes.EQ007.code, 'PMP-V', '« Pompe à vide » tombe sur la première règle');
    assert.equal(lignes.EQ007.origine, 'regle:r1');
    assert.equal(lignes.EQ001.code, 'PMP-C');
    assert.equal(lignes.EQ001.origine, 'regle:r2', 'la règle passe avant la ressemblance');
});

test('codification : la restriction par famille empêche de coder un équipement dans une autre famille', async () => {
    // Sans restriction, « Bidule » attrape le voisin le plus ressemblant, quelle que soit sa famille.
    await enregistrer({ restreindreSource: 'FAMILLE', restreindreNomenclature: 'FAMILLE' });
    const avecFamille = parRepere(await executer());
    assert.notEqual(avecFamille.EQ003.code, 'PMP-C', 'une vanne ne peut pas devenir une pompe');
    const candidats = json(await appel({ method: 'POST', url: '/api/codification/cd1/revue', payload: { combien: 50 } }));
    const cas = candidats.find((candidat: { libelle: string }) => /Vanne DN80/i.test(candidat.libelle));
    assert.ok(cas, 'le cas douteux est proposé à la revue');
    assert.ok(
        cas.candidats.every((proposition: { chemin: string }) => proposition.chemin.startsWith('VANNES')),
        'les propositions restent dans la famille de la ligne'
    );
});

test('revue : chaque cas douteux arrive avec ses meilleures propositions, la plus probable en tête', async () => {
    const cas = json(await appel({ method: 'POST', url: '/api/codification/cd1/revue', payload: { combien: 50 } }));
    assert.ok(cas.length >= 1);
    const premier = cas[0];
    assert.ok(premier.candidats.length >= 1 && premier.candidats.length <= 3);
    assert.ok(premier.candidats[0].score >= premier.candidats[premier.candidats.length - 1].score);
    assert.ok(premier.candidats[0].code && premier.candidats[0].chemin);
});

test('décision : trancher un cas le code, et le libellé entre dans la table de correspondance pour toujours', async () => {
    const cas = json(await appel({ method: 'POST', url: '/api/codification/cd1/revue', payload: { combien: 50 } }));
    const aTrancher = cas.find((candidat: { libelle: string }) => /Vanne DN80/i.test(candidat.libelle));
    const apres = json(
        await appel({
            method: 'POST',
            url: '/api/codification/cd1/decider',
            payload: { rang: aTrancher.rang, code: 'VAN-P', libelle: aTrancher.libelle }
        })
    );
    assert.deepEqual(
        apres.correspondances.map((correspondance: { libelle: string; code: string }) => correspondance.code),
        ['VAN-P'],
        'la décision devient une correspondance'
    );
    const lignes = parRepere(await executer());
    assert.equal(lignes.EQ004.code, 'VAN-P');
    assert.equal(lignes.EQ004.statut, 'office');
    assert.equal(lignes.EQ004.origine, 'decision');
    const restants = json(await appel({ method: 'POST', url: '/api/codification/cd1/revue', payload: { combien: 50 } }));
    assert.ok(
        !restants.some((candidat: { libelle: string }) => /Vanne DN80/i.test(candidat.libelle)),
        'le cas tranché ne revient plus à la revue'
    );
});

test('codification : une configuration incomplète est refusée avec un message, pas une erreur serveur', async () => {
    await enregistrer({ colonneLibelle: '' });
    const refus = await appel({ method: 'POST', url: '/api/codification/cd1/executer' });
    assert.equal(refus.statusCode, 400);
    assert.match(json(refus).erreur, /la colonne du libellé/);
});

/**
 * Les synonymes : le jargon du site ne ressemble pas toujours à la nomenclature. « Groupe motopompe centrif »
 * est une pompe centrifuge, « Electrovanne papillon » une vanne papillon — à condition de l’avoir déclaré.
 */
test('synonymes : un libellé écrit dans le jargon du site retrouve son type une fois les variantes déclarées', async () => {
    await enregistrer();
    const sansSynonymes = parRepere(await executer());
    assert.equal(sansSynonymes.EQ008.statut, 'revoir', 'sans rien de déclaré, « motopompe centrif » ne convainc pas');
    assert.notEqual(sansSynonymes.EQ009.code, 'VAN-P', '« Electrovanne » n’est pas « Vanne » pour la machine');

    await enregistrer({
        synonymes: [
            { id: 's1', motRetenu: 'POMPE', variantes: ['MOTOPOMPE', 'GROUPE MOTOPOMPE'], proche: false },
            { id: 's2', motRetenu: 'CENTRIFUGE', variantes: ['CENTRIF'], proche: true },
            { id: 's3', motRetenu: 'VANNE', variantes: ['ELECTROVANNE'], proche: false }
        ]
    });
    const avecSynonymes = parRepere(await executer());
    assert.equal(avecSynonymes.EQ008.code, 'PMP-C', '« Groupe motopompe centrif » vaut « Pompe centrifuge »');
    assert.equal(avecSynonymes.EQ008.statut, 'office');
    assert.equal(avecSynonymes.EQ009.code, 'VAN-P', '« Electrovanne papillon DN50 » vaut « Vanne papillon »');
    assert.equal(avecSynonymes.EQ001.code, 'PMP-C', 'ce qui marchait avant marche toujours');
});

test('synonymes : « même mal orthographiée » rattrape la variante écrite de travers', async () => {
    await enregistrer({
        synonymes: [{ id: 's2', motRetenu: 'CENTRIFUGE', variantes: ['CENTRIF'], proche: true }]
    });
    // « CENTRIFF » n’est pas « CENTRIF », mais en est assez proche pour être reconnu comme lui.
    const cas = json(await appel({ method: 'POST', url: '/api/codification/cd1/revue', payload: { combien: 50 } }));
    assert.ok(Array.isArray(cas), 'la requête aux lambdas imbriquées passe bien sur le moteur');
    const strict = await enregistrer({ synonymes: [{ id: 's2', motRetenu: 'CENTRIFUGE', variantes: ['CENTRIF'], proche: false }] });
    assert.equal(strict.statusCode, 200);
    assert.equal((await executer()).bilan.total, 9, 'les neuf lignes sont toujours codées, quel que soit le réglage');
});

/**
 * Ce que l’on compare n’est pas toujours le libellé. La liste porte parfois une désignation technique
 * « VP DN80 » que la nomenclature reprend en abrégé « VP » — c’est ce couple-là qu’il faut rapprocher.
 */
test('comparaisons : on peut rapprocher un tout autre attribut, des deux côtés', async () => {
    await enregistrer({
        comparaisons: [{ id: 'c1', colonneSource: 'DESIGNATION', colonneNomenclature: 'ABREGE', poids: 1, methode: 'mots' }],
        seuilAuto: 0.99,
        seuilRevoir: 0.45
    });
    const lignes = parRepere(await executer());
    assert.equal(lignes.EQ004.code, 'VAN-P', '« VP DN80 » contient l’abrégé « VP » : c’est une vanne papillon');
    assert.equal(lignes.EQ004.origine, 'ressemblance');
    assert.equal(lignes.EQ006.statut, 'absent', '« ZZZ » ne ressemble à aucun abrégé');
});

test('comparaisons : deux colonnes se combinent, et le poids fait pencher la balance', async () => {
    await enregistrer({
        comparaisons: [
            { id: 'c1', colonneSource: 'LIBELLE', colonneNomenclature: 'LIBELLE_TYPE', poids: 3, methode: 'mots' },
            { id: 'c2', colonneSource: 'DESIGNATION', colonneNomenclature: 'ABREGE', poids: 1, methode: 'mots' }
        ],
        seuilAuto: 0.99,
        seuilRevoir: 0.45
    });
    const lignes = parRepere(await executer());
    assert.equal(lignes.EQ001.code, 'PMP-C', 'le libellé et la désignation vont dans le même sens : la ligne est codée');
    assert.equal(lignes.EQ003.code, 'VAN-P');
    // Vanne DN80 ne donne qu’un mot sur deux au libelle, mais sa designation VP DN80 confirme le type.
    assert.equal(lignes.EQ004.statut, 'revoir', 'les deux colonnes ne suffisent pas encore à trancher seules');
    assert.ok(lignes.EQ004.score > 0.5, 'la désignation a tout de même remonté le score');
});

test('comparaisons : chacune peut avoir sa propre mesure, sans perturber les autres', async () => {
    await enregistrer({
        comparaisons: [
            { id: 'c1', colonneSource: 'LIBELLE', colonneNomenclature: 'LIBELLE_TYPE', poids: 1, methode: 'mots' },
            { id: 'c2', colonneSource: 'DESIGNATION', colonneNomenclature: 'ABREGE', poids: 1, methode: 'jw' }
        ]
    });
    const bilan = (await executer()).bilan;
    assert.equal(bilan.total, 9, 'les neuf lignes sont traitées, quelles que soient les mesures mêlées');
});
