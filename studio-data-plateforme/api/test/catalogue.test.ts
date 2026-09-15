/** Tests du catalogue : index (sources, colonnes, objets, termes, actifs, listes, tableaux de bord, règles), recherche, facettes, couches ; fonctions pures. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { creerApplication } from '../src/application';
import {
    EntreeCatalogue,
    exemplesDeRecherche,
    indexer,
    normaliser,
    pertinence,
    rechercher,
    sensibiliteDe,
    statistiquesDuCatalogue,
    trier
} from '../src/catalogue/catalogue';
import { lireConfiguration } from '../src/configuration/configuration';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-catalogue-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;

async function chargerCsv(id: string, nom: string, csv: string) {
    await appel({
        method: 'PUT',
        url: `/api/fichiers/src_${id}`,
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
    await appel({ method: 'PUT', url: `/api/tables/${id}`, payload: { name: nom, type: 'csv', headers: csv.split('\n')[0].split(';') } });
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
    await chargerCsv('tb_c', 'clients.csv', 'id;email;ville\n1;ana@ex.fr;Paris\n2;bob@ex.fr;Lyon\n');
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/dictionnaire/clients.csv',
        payload: {
            description: 'Référentiel des clients',
            owner: 'Alice',
            domain: 'Ventes',
            columns: { ville: { description: 'Ville de résidence' } }
        }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/objets-metier/bo_client',
        payload: {
            name: 'Client',
            definition: 'Personne cliente',
            domain: 'Ventes',
            globalOwner: 'Alice',
            status: 'Validé',
            elements: [
                {
                    id: 'be_email',
                    name: 'Courriel',
                    definition: 'Adresse électronique',
                    sensitivity: 'Personnel (RGPD)',
                    mappings: [{ table: 'clients.csv', col: 'email' }]
                }
            ]
        }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/glossaire/gl_client',
        payload: { term: 'Client', definition: 'Acheteur', domain: 'Ventes' }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/actifs/as_crm',
        payload: { name: 'CRM', kind: 'app', domain: 'Ventes', owner: 'Équipe Ventes' }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/listes-de-valeurs/vl_villes',
        payload: { name: 'Villes', kind: 'inline', values: [{ code: 'PARIS', label: 'Paris', status: '' }] }
    });
    await appel({
        method: 'PUT',
        url: '/api/exploitation/tableaux-de-bord/db_1',
        payload: { name: 'Suivi clients', tiles: [{ id: 'tl_1', title: 'Nombre', table: 'clients.csv', kind: 'kpi', agg: 'count' }] }
    });
    await appel({
        method: 'POST',
        url: '/api/qualite/regles',
        payload: { nom: 'Email non vide', sourceId: 'tb_c', colonne: 'email', type: 'nonVide', criticite: 'majeure', active: true }
    });
    await appel({ method: 'POST', url: '/api/qualite/regles/executer', payload: { sourceId: 'tb_c' } });
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('fonctions pures : normalisation, sensibilité, pertinence, recherche et facettes', () => {
    assert.equal(normaliser('  Réf. Clients  '), 'ref. clients');
    assert.equal(sensibiliteDe('Personnel (RGPD)'), 'perso');
    assert.equal(sensibiliteDe('Sensible'), 'conf');
    assert.equal(sensibiliteDe(''), null);
    const entree = (type: EntreeCatalogue['type'], titre: string, domaine = '—'): EntreeCatalogue =>
        indexer({
            type,
            id: titre,
            titre,
            sousTitre: '',
            description: 'desc ' + titre,
            domaine,
            proprietaire: '',
            qualite: null,
            sensibilite: null,
            validation: null,
            etiquettes: [],
            motsCles: [],
            lien: '/',
            fraicheur: null
        });
    const index = [
        entree('bo', 'Client', 'Ventes'),
        entree('table', 'clients.csv', 'Ventes'),
        entree('term', 'Clientèle'),
        entree('column', 'ville')
    ];
    assert.equal(pertinence(index[0], 'client'), 100);
    assert.equal(pertinence(index[2], 'client'), 60);
    assert.equal(pertinence(index[3], 'client'), 0);
    const metier = rechercher(index, { q: 'client' });
    assert.deepEqual(
        metier.resultats.map(resultat => resultat.titre),
        ['Client', 'Clientèle'],
        'couche métier : la table est masquée'
    );
    assert.equal(metier.techniquesMasquees, 1);
    const tout = rechercher(index, { q: 'client', couche: 'tout' });
    assert.equal(tout.resultats.length, 3);
    assert.deepEqual(
        rechercher(index, { type: ['table'] }).resultats.map(resultat => resultat.titre),
        ['clients.csv'],
        'demander un type technique ouvre la couche « tout »'
    );
    assert.deepEqual(rechercher(index, { domaine: ['Ventes'] }).facettes.type, [
        { valeur: 'bo', nombre: 1 },
        { valeur: 'table', nombre: 1 }
    ]);
});

test('index de l’espace : tous les genres d’éléments, signaux et liens', async () => {
    const tout = json(await appel({ method: 'GET', url: '/api/catalogue?couche=tout' }));
    const types = tout.resultats.map((resultat: { type: string }) => resultat.type).sort();
    assert.deepEqual([...new Set(types)], ['asset', 'attr', 'bo', 'column', 'report', 'rule', 'table', 'term', 'valuelist']);
    const table = tout.resultats.find((resultat: { type: string }) => resultat.type === 'table');
    assert.equal(table.description, 'Référentiel des clients');
    assert.equal(table.proprietaire, 'Alice');
    assert.equal(table.qualite, 100, 'score des règles exécutées');
    assert.equal(table.sensibilite, 'perso', 'la colonne email est personnelle par son nom');
    const ville = tout.resultats.find((resultat: { id: string }) => resultat.id === 'tb_c.ville');
    assert.equal(ville.validation, 'ok');
    assert.equal(ville.lien, '/dictionnaire');
    const attribut = tout.resultats.find((resultat: { type: string }) => resultat.type === 'attr');
    assert.equal(attribut.sensibilite, 'perso');
    assert.deepEqual(attribut.motsCles, ['clients.csv.email']);
});

test('recherche : couche métier par défaut, recherche par mot, facettes', async () => {
    const metier = json(await appel({ method: 'GET', url: '/api/catalogue' }));
    assert.ok(metier.resultats.every((resultat: { type: string }) => !['table', 'column'].includes(resultat.type)));
    assert.equal(metier.techniquesMasquees, 4, 'une table et trois colonnes masquées');
    const recherche = json(await appel({ method: 'GET', url: '/api/catalogue?q=client&couche=tout' }));
    assert.deepEqual(
        recherche.resultats.slice(0, 2).map((resultat: { titre: string }) => resultat.titre),
        ['Client', 'Client'],
        'objet et terme « Client » en tête'
    );
    assert.ok(recherche.resultats.some((resultat: { titre: string }) => resultat.titre === 'clients.csv'));
    assert.ok(recherche.facettes.domaine.some((facette: { valeur: string }) => facette.valeur === 'Ventes'));
    const parProprietaire = json(await appel({ method: 'GET', url: '/api/catalogue?proprietaire=Alice&couche=tout' }));
    assert.ok(parProprietaire.resultats.length >= 2);
    assert.ok(parProprietaire.resultats.every((resultat: { proprietaire: string }) => resultat.proprietaire === 'Alice'));
});

test('fonctions pures : tri, statistiques du bandeau et exemples de recherche', () => {
    const fiche = (titre: string, qualite: number | null, fraicheur: number | null, domaine = 'Ventes'): EntreeCatalogue => ({
        type: 'table',
        id: titre,
        titre,
        sousTitre: '',
        description: '',
        domaine,
        proprietaire: '',
        qualite,
        sensibilite: null,
        validation: null,
        etiquettes: [],
        motsCles: [],
        lien: '/',
        fraicheur
    });
    const resultats = [fiche('Bravo', 40, 200), fiche('Alpha', null, 300), fiche('Charlie', 90, null)];
    assert.deepEqual(
        trier(resultats, 'qualite').map(entree => entree.titre),
        ['Charlie', 'Bravo', 'Alpha'],
        'une qualité jamais mesurée ne passe pas devant une qualité connue'
    );
    assert.deepEqual(
        trier(resultats, 'fraicheur').map(entree => entree.titre),
        ['Alpha', 'Bravo', 'Charlie']
    );
    assert.deepEqual(
        trier(resultats, 'alpha').map(entree => entree.titre),
        ['Alpha', 'Bravo', 'Charlie']
    );
    assert.deepEqual(
        trier(resultats, 'pertinence').map(entree => entree.titre),
        ['Bravo', 'Alpha', 'Charlie'],
        'la pertinence garde l’ordre déjà posé par la recherche'
    );

    const statistiques = statistiquesDuCatalogue(
        [fiche('a', null, null, 'Ventes'), fiche('b', null, null, 'Finance'), fiche('c', null, null, '—')],
        [{ documentee: true }, { documentee: false }, { documentee: true }, { documentee: true }],
        ['Validé', 'Validé', 'Brouillon', 'Proposé']
    );
    assert.deepEqual(statistiques, { actifs: 3, domaines: 2, sourcesDocumentees: 75, validesParUnResponsable: 50 });
    assert.deepEqual(statistiquesDuCatalogue([], [], []), {
        actifs: 0,
        domaines: 0,
        sourcesDocumentees: 0,
        validesParUnResponsable: 0
    });

    assert.deepEqual(exemplesDeRecherche('clients.csv', 'Client', 'Alice'), ['clients', 'données personnelles', 'Client', 'Alice']);
    assert.deepEqual(exemplesDeRecherche('', '', ''), ['données personnelles'], 'une piste vide est omise, pas inventée');
});

test('recherche : le tri, les chiffres du bandeau et les exemples arrivent avec les résultats', async () => {
    const parNom = json(await appel({ method: 'GET', url: '/api/catalogue?couche=tout&tri=alpha' }));
    const titres = parNom.resultats.map((resultat: { titre: string }) => resultat.titre);
    assert.deepEqual(
        titres,
        [...titres].sort((premier, second) => premier.localeCompare(second, 'fr')),
        'A → Z respecté'
    );
    const parQualite = json(await appel({ method: 'GET', url: '/api/catalogue?couche=tout&tri=qualite' }));
    assert.notEqual(parQualite.resultats[0].qualite, null, 'le tri par qualité met en tête ce qui est mesuré');
    const inventé = json(await appel({ method: 'GET', url: '/api/catalogue?couche=tout&tri=nimporte' }));
    assert.equal(inventé.resultats.length, parNom.resultats.length, 'un tri inconnu retombe sur la pertinence, sans erreur');
    assert.equal(parNom.statistiques.actifs, parNom.total);
    assert.ok(parNom.statistiques.domaines >= 1);
    assert.ok(parNom.statistiques.sourcesDocumentees >= 0 && parNom.statistiques.sourcesDocumentees <= 100);
    assert.ok(parNom.exemples.includes('données personnelles'));
    assert.ok(
        parNom.exemples.some((exemple: string) => exemple === 'clients'),
        'le nom d’une source sert d’exemple, sans extension'
    );
    const parFraicheur = json(await appel({ method: 'GET', url: '/api/catalogue?couche=tout&tri=fraicheur' }));
    assert.notEqual(parFraicheur.resultats[0].fraicheur, null, 'le plus récemment rafraîchi arrive en tête');
});
