/**
 * Tests d'intégration du modèle de données et de l'extraction : deux sources CSV (clients, commandes), détection
 * du lien par le contenu, ajout, extraction jointe avec filtre et regroupement, comptage, export CSV, modèles.
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

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-extraction-'));
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
    await deposerSource('tb_clients', 'clients.csv', 'id_client;nom;ville\n1;Ana;Paris\n2;Bob;Lyon\n3;Zoé;Lille\n4;Idris;Paris\n', [
        'id_client',
        'nom',
        'ville'
    ]);
    await deposerSource('tb_commandes', 'commandes.csv', 'id_commande;id_client;montant\n100;1;25.5\n101;1;12\n102;2;99.9\n103;4;5\n', [
        'id_commande',
        'id_client',
        'montant'
    ]);
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('détection par le contenu : commandes.id_client → clients.id_client proposé (couverture 100 %), pas de lien inverse', async () => {
    const propositions = json(await appel({ method: 'POST', url: '/api/modele/relations/detecter' }));
    assert.equal(propositions.length, 1);
    assert.equal(propositions[0].sourceTable, 'commandes.csv');
    assert.equal(propositions[0].targetTable, 'clients.csv');
    assert.equal(propositions[0].sourceCol, 'id_client');
    assert.equal(propositions[0].couverture, 1);
    assert.equal(propositions[0].cardinality, 'N-1');
});

test('ajout d’un lien : enregistré dans appState.relations (format de l’application classique), doublon ignoré, colonne inconnue refusée', async () => {
    const lien = {
        sourceTable: 'commandes.csv',
        sourceCol: 'id_client',
        targetTable: 'clients.csv',
        targetCol: 'id_client',
        cardinality: 'N-1'
    };
    const ajout = json(await appel({ method: 'POST', url: '/api/modele/relations', payload: lien }));
    assert.equal(ajout.ajoute, true);
    assert.equal(ajout.relations.length, 1);
    assert.equal(ajout.relations[0].sourceId, 'tb_commandes');
    assert.equal(ajout.relations[0].targetId, 'tb_clients');
    assert.equal(json(await appel({ method: 'POST', url: '/api/modele/relations', payload: lien })).ajoute, false);
    assert.equal(
        (await appel({ method: 'POST', url: '/api/modele/relations', payload: { ...lien, sourceCol: 'inconnue' } })).statusCode,
        400
    );
    const etat = json(await appel({ method: 'GET', url: '/api/etat/appState' })).valeur;
    assert.deepEqual(etat.relations[0], { ...lien, kind: '', measured: null });
    assert.deepEqual(json(await appel({ method: 'POST', url: '/api/modele/relations/detecter' })), []);
});

const specificationJointe = {
    baseId: 'tb_clients',
    jointures: [{ deTableId: 'tb_clients', deColonne: 'id_client', versTableId: 'tb_commandes', versColonne: 'id_client' }],
    colonnes: [
        { tableId: 'tb_clients', nomColonne: 'nom' },
        { tableId: 'tb_clients', nomColonne: 'ville', transformation: 'upper' },
        { tableId: 'tb_commandes', nomColonne: 'montant', alias: 'Montant' }
    ],
    filtres: [{ tableId: 'tb_clients', nomColonne: 'ville', op: 'in', valeur: 'paris;lyon' }],
    tri: [
        { alias: 'nom', sens: 'asc' },
        { alias: 'Montant', sens: 'desc' }
    ]
};

test('extraction jointe : aperçu, SQL renvoyé, filtre « dans la liste » et tri appliqués, jointure gauche conservant les clients sans commande', async () => {
    const apercu = json(await appel({ method: 'POST', url: '/api/extraction/apercu', payload: { specification: specificationJointe } }));
    assert.deepEqual(
        apercu.colonnes.map((colonne: { nom: string }) => colonne.nom),
        ['nom', 'ville', 'Montant']
    );
    assert.deepEqual(apercu.lignes, [
        ['Ana', 'PARIS', '25.5'],
        ['Ana', 'PARIS', '12'],
        ['Bob', 'LYON', '99.9'],
        ['Idris', 'PARIS', '5']
    ]);
    assert.match(apercu.sql, /LEFT JOIN "t_tb_commandes"/);
    const total = json(await appel({ method: 'POST', url: '/api/extraction/compter', payload: specificationJointe }));
    assert.equal(total.total, 4);
    const sansFiltre = json(
        await appel({ method: 'POST', url: '/api/extraction/compter', payload: { ...specificationJointe, filtres: [] } })
    );
    assert.equal(sansFiltre.total, 5);
    const interne = json(
        await appel({
            method: 'POST',
            url: '/api/extraction/compter',
            payload: { ...specificationJointe, filtres: [], typeJointure: 'inner' }
        })
    );
    assert.equal(interne.total, 4);
});

test('extraction regroupée : total par ville avec nombre de clients distincts', async () => {
    const specification = {
        baseId: 'tb_clients',
        jointures: specificationJointe.jointures,
        regrouper: true,
        colonnes: [
            { tableId: 'tb_clients', nomColonne: 'ville' },
            { tableId: 'tb_clients', nomColonne: 'id_client', agregat: 'countd', alias: 'clients' },
            { tableId: 'tb_commandes', nomColonne: 'montant', agregat: 'sum', alias: 'total' }
        ],
        tri: [{ alias: 'ville', sens: 'asc' }]
    };
    const apercu = json(await appel({ method: 'POST', url: '/api/extraction/apercu', payload: { specification } }));
    assert.deepEqual(apercu.lignes, [
        ['Lille', '1', null],
        ['Lyon', '1', 99.9],
        ['Paris', '2', 42.5]
    ]);
});

test('spécification incohérente : 400 avec message ; validation Zod sur les champs', async () => {
    const reponse = await appel({
        method: 'POST',
        url: '/api/extraction/apercu',
        payload: { specification: { ...specificationJointe, jointures: [] } }
    });
    assert.equal(reponse.statusCode, 400);
    assert.match(json(reponse).erreur, /table absente/);
    assert.equal(
        (await appel({ method: 'POST', url: '/api/extraction/apercu', payload: { specification: { baseId: 'tb_clients', colonnes: [] } } }))
            .statusCode,
        400
    );
});

test('export CSV en flux : BOM, en-têtes, point-virgule, guillemets, nom de fichier', async () => {
    const reponse = await appel({
        method: 'POST',
        url: '/api/extraction/export.csv',
        payload: { specification: specificationJointe, nomFichier: 'clients paris/lyon' }
    });
    assert.equal(reponse.statusCode, 201);
    assert.match(String(reponse.headers['content-disposition']), /filename="clients_paris_lyon.csv"/);
    const lignes = reponse.body.split('\r\n');
    assert.equal(lignes[0], '﻿"nom";"ville";"Montant"');
    assert.equal(lignes[1], '"Ana";"PARIS";"25.5"');
    assert.equal(lignes.length, 6);
});

test('bilan qualité d’une extraction : nombre de lignes et complétude de chaque colonne du résultat', async () => {
    const bilan = json(
        await appel({
            method: 'POST',
            url: '/api/extraction/bilan',
            payload: { ...specificationJointe, filtres: [], tri: [] }
        })
    );
    assert.equal(bilan.total, 5, 'jointure gauche : 4 commandes + le client sans commande');
    assert.deepEqual(
        bilan.colonnes.map((colonne: { nom: string; renseignees: number }) => [colonne.nom, colonne.renseignees]),
        [
            ['nom', 5],
            ['ville', 5],
            ['Montant', 4]
        ]
    );
    assert.equal(bilan.colonnes[2].part, 0.8);
});

test('modèles d’extraction : enregistrement, liste, suppression ; le vocabulaire est publié', async () => {
    const modele = json(
        await appel({
            method: 'PUT',
            url: '/api/extraction/modeles/ex_test',
            payload: { nom: 'Clients Paris et Lyon', description: 'Test', specification: specificationJointe }
        })
    );
    assert.equal(modele.auteur, 'Administrateur');
    const liste = json(await appel({ method: 'GET', url: '/api/extraction/modeles' }));
    assert.equal(liste.length, 1);
    assert.equal(liste[0].specification.baseId, 'tb_clients');
    assert.equal((await appel({ method: 'DELETE', url: '/api/extraction/modeles/ex_test' })).statusCode, 200);
    assert.equal((await appel({ method: 'DELETE', url: '/api/extraction/modeles/ex_test' })).statusCode, 404);
    const vocabulaire = json(await appel({ method: 'GET', url: '/api/extraction/vocabulaire' }));
    assert.equal(vocabulaire.operateurs.contains, 'contient');
});

test('suppression d’un lien par son identifiant', async () => {
    const relations = json(await appel({ method: 'GET', url: '/api/modele/relations' }));
    const restantes = json(await appel({ method: 'DELETE', url: '/api/modele/relations/' + encodeURIComponent(relations[0].id) }));
    assert.deepEqual(restantes, []);
});

test('extraction avancée par l’API : synthèse, colonne calculée, filtre sur liste, puis résultat enregistré comme source', async () => {
    const specification = {
        baseId: 'tb_clients',
        colonnes: [
            { tableId: 'tb_clients', nomColonne: 'nom' },
            {
                tableId: 'tb_clients',
                genre: 'synthese',
                alias: 'nb_commandes',
                synthese: {
                    tableId: 'tb_commandes',
                    deTableId: 'tb_clients',
                    deColonne: 'id_client',
                    versColonne: 'id_client',
                    mode: 'count'
                }
            },
            { tableId: 'tb_clients', genre: 'calcul', alias: 'etiquette', formule: "[nom] || ' (' || [ville] || ')'" }
        ],
        filtres: [{ tableId: 'tb_clients', nomColonne: 'ville', op: 'list', liste: ['PARIS', 'lille'], exclure: false }],
        tri: [{ alias: 'nom', sens: 'asc' }]
    };
    const apercu = json(await appel({ method: 'POST', url: '/api/extraction/apercu', payload: { specification } }));
    assert.deepEqual(
        apercu.lignes,
        [
            ['Ana', '2', 'Ana (Paris)'],
            ['Idris', '1', 'Idris (Paris)'],
            ['Zoé', '0', 'Zoé (Lille)']
        ],
        'les comptages BIGINT arrivent en texte'
    );
    const materialisation = json(
        await appel({ method: 'POST', url: '/api/extraction/materialiser', payload: { specification, nom: 'Clients Paris Lille' } })
    );
    assert.equal(materialisation.lignes, 3);
    assert.deepEqual(materialisation.colonnes, ['nom', 'nb_commandes', 'etiquette']);
    const source = json(await appel({ method: 'GET', url: `/api/tables/${materialisation.sourceId}` }));
    assert.equal(source.type, 'extraction');
    assert.equal(source.origine, 'extraction');
    assert.equal(
        (await appel({ method: 'POST', url: '/api/extraction/materialiser', payload: { specification, nom: 'clients.csv' } })).statusCode,
        400,
        'pas d’écrasement d’une source déposée'
    );
});

test('deux liens vers la même table : le SQL s’exécute et ramène deux colonnes distinctes', async () => {
    // Des mouvements qui désignent deux fois la table des clients : l’émetteur et le destinataire.
    await deposerSource('tb_mouvements', 'mouvements.csv', 'id;de;vers\nm1;1;2\nm2;4;3\n', ['id', 'de', 'vers']);
    const reponse = await appel({
        method: 'POST',
        url: '/api/extraction/apercu',
        payload: {
            specification: {
                baseId: 'tb_mouvements',
                jointures: [
                    { cle: 'emetteur', deTableId: 'tb_mouvements', deColonne: 'de', versTableId: 'tb_clients', versColonne: 'id_client' },
                    {
                        cle: 'destinataire',
                        deTableId: 'tb_mouvements',
                        deColonne: 'vers',
                        versTableId: 'tb_clients',
                        versColonne: 'id_client'
                    }
                ],
                colonnes: [
                    { tableId: 'tb_mouvements', nomColonne: 'id' },
                    { tableId: 'tb_clients', route: 'emetteur', nomColonne: 'nom', alias: 'Émetteur' },
                    { tableId: 'tb_clients', route: 'destinataire', nomColonne: 'nom', alias: 'Destinataire' }
                ]
            },
            limite: 10
        }
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const resultat = json(reponse);
    assert.deepEqual(
        resultat.colonnes.map((colonne: { nom: string }) => colonne.nom),
        ['id', 'Émetteur', 'Destinataire']
    );
    assert.deepEqual(resultat.lignes, [
        ['m1', 'Ana', 'Bob'],
        ['m2', 'Idris', 'Zoé']
    ]);
});

test('dédoublonnage par clé fonctionnelle : une ligne par client, première ou dernière commande', async () => {
    const parClient = async (garder: string) => {
        const reponse = await appel({
            method: 'POST',
            url: '/api/extraction/apercu',
            payload: {
                specification: {
                    baseId: 'tb_commandes',
                    jointures: [
                        {
                            deTableId: 'tb_commandes',
                            deColonne: 'id_client',
                            versTableId: 'tb_clients',
                            versColonne: 'id_client'
                        }
                    ],
                    colonnes: [
                        { tableId: 'tb_clients', nomColonne: 'nom', alias: 'Client' },
                        { tableId: 'tb_commandes', nomColonne: 'id_commande', alias: 'Commande' }
                    ],
                    dedoublonnage: { actif: true, cles: ['Client'], garder }
                },
                limite: 50
            }
        });
        assert.equal(reponse.statusCode, 201, reponse.body);
        return json(reponse).lignes;
    };
    // Ana a deux commandes (100 puis 101) : on n’en garde qu’une, au choix la première ou la dernière.
    const premieres = await parClient('premiere');
    assert.equal(premieres.length, 3, 'un client par ligne');
    assert.deepEqual(
        premieres.find((ligne: string[]) => ligne[0] === 'Ana'),
        ['Ana', '100']
    );
    const dernieres = await parClient('derniere');
    assert.deepEqual(
        dernieres.find((ligne: string[]) => ligne[0] === 'Ana'),
        ['Ana', '101']
    );
});

test('regroupement avec mesures à critères : NB.SI.ENS et SOMME.SI.ENS façon tableur', async () => {
    const reponse = await appel({
        method: 'POST',
        url: '/api/extraction/apercu',
        payload: {
            specification: {
                baseId: 'tb_clients',
                jointures: [{ deTableId: 'tb_clients', deColonne: 'id_client', versTableId: 'tb_commandes', versColonne: 'id_client' }],
                colonnes: [{ tableId: 'tb_clients', nomColonne: 'ville', alias: 'Ville' }],
                regrouper: true,
                mesures: [
                    { fn: 'count', nomColonne: 'id_commande', tableId: 'tb_commandes', alias: 'Commandes' },
                    { fn: 'sum', tableId: 'tb_commandes', nomColonne: 'montant', alias: 'Total' },
                    {
                        fn: 'sum',
                        tableId: 'tb_commandes',
                        nomColonne: 'montant',
                        alias: 'Total gros',
                        criteres: [{ tableId: 'tb_commandes', nomColonne: 'montant', op: '>=', valeur: '20' }]
                    }
                ],
                tri: [{ alias: 'Ville', sens: 'asc' }]
            },
            limite: 50
        }
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const lignes = json(reponse).lignes;
    const paris = lignes.find((ligne: unknown[]) => ligne[0] === 'Paris');
    assert.equal(Number(paris[1]), 3, 'Ana (2 commandes) et Idris (1)');
    assert.equal(Number(paris[2]), 42.5, '25.5 + 12 + 5');
    assert.equal(Number(paris[3]), 25.5, 'seule la commande d’au moins 20 est retenue');
});

test('valeurs suggérées d’une colonne : les plus fréquentes d’abord, filtrées par le début saisi', async () => {
    const toutes = json(
        await appel({ method: 'POST', url: '/api/extraction/valeurs', payload: { tableId: 'tb_clients', nomColonne: 'ville' } })
    );
    assert.deepEqual(toutes[0], { valeur: 'Paris', lignes: 2 }, 'la valeur la plus fréquente en tête');
    assert.equal(toutes.length, 3);
    const commencantParL = json(
        await appel({
            method: 'POST',
            url: '/api/extraction/valeurs',
            payload: { tableId: 'tb_clients', nomColonne: 'ville', debut: 'l' }
        })
    );
    assert.deepEqual(commencantParL.map((entree: { valeur: string }) => entree.valeur).sort(), ['Lille', 'Lyon']);
    const colonneInconnue = await appel({
        method: 'POST',
        url: '/api/extraction/valeurs',
        payload: { tableId: 'tb_clients', nomColonne: 'inexistante' }
    });
    assert.equal(colonneInconnue.statusCode, 400);
});

test('SQL personnalisé : exécuté tel quel, refusé s’il n’est pas en lecture', async () => {
    const specification = {
        baseId: 'tb_clients',
        colonnes: [{ tableId: 'tb_clients', nomColonne: 'nom' }],
        sqlPersonnalise: `SELECT upper(nom) AS cri FROM "t_tb_clients" ORDER BY nom LIMIT 2`
    };
    const apercu = json(await appel({ method: 'POST', url: '/api/extraction/apercu', payload: { specification, limite: 10 } }));
    assert.deepEqual(apercu.lignes, [['ANA'], ['BOB']]);
    assert.equal(apercu.colonnes[0].nom, 'cri');
    const total = json(await appel({ method: 'POST', url: '/api/extraction/compter', payload: specification }));
    assert.equal(total.total, 2, 'le comptage porte sur la requête personnalisée');
    const ecriture = await appel({
        method: 'POST',
        url: '/api/extraction/apercu',
        payload: { specification: { ...specification, sqlPersonnalise: 'DROP TABLE "t_tb_clients"' }, limite: 10 }
    });
    assert.equal(ecriture.statusCode, 400);
    assert.match(json(ecriture).erreur, /lecture/);
});

test('hiérarchie par table de liaison datée : l’organigramme est aplati à la date de référence', async () => {
    // Des services, et une table de rattachement qui change dans le temps : Études passe sous Technique en 2026.
    await deposerSource('tb_services', 'services.csv', 'code;libelle\nDG;Direction\nTEC;Technique\nETU;Études\n', ['code', 'libelle']);
    await deposerSource(
        'tb_rattachements',
        'rattachements.csv',
        'enfant;parent;debut;fin\nTEC;DG;2020-01-01;\nETU;DG;2020-01-01;2025-12-31\nETU;TEC;2026-01-01;\n',
        ['enfant', 'parent', 'debut', 'fin']
    );
    const aplatir = async (dateReference: string) => {
        const reponse = await appel({
            method: 'POST',
            url: '/api/extraction/apercu',
            payload: {
                specification: {
                    baseId: 'tb_services',
                    colonnes: [
                        { tableId: 'tb_services', nomColonne: 'libelle', alias: 'Service' },
                        {
                            tableId: 'tb_services',
                            genre: 'hierarchie',
                            alias: 'org',
                            hierarchie: {
                                idColonne: 'code',
                                attributs: ['libelle'],
                                profondeur: 3,
                                type: 'liaison',
                                liaisonTableId: 'tb_rattachements',
                                liaisonEnfant: 'enfant',
                                liaisonParent: 'parent',
                                valideDu: 'debut',
                                valideAu: 'fin',
                                dateReference
                            }
                        }
                    ],
                    tri: [{ alias: 'Service', sens: 'asc' }]
                },
                limite: 50
            }
        });
        assert.equal(reponse.statusCode, 201, reponse.body);
        return json(reponse).lignes;
    };
    const en2024 = await aplatir('2024-06-30');
    assert.deepEqual(
        en2024.find((ligne: string[]) => ligne[0] === 'Études'),
        ['Études', 'Direction', 'Études', null]
    );
    const en2026 = await aplatir('2026-06-30');
    assert.deepEqual(
        en2026.find((ligne: string[]) => ligne[0] === 'Études'),
        ['Études', 'Direction', 'Technique', 'Études'],
        'après le changement, Études est au troisième niveau'
    );
});
