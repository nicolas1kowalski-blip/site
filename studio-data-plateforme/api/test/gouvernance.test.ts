/**
 * Tests de la gouvernance typée : objets métier, actifs, périmètres, personnes et domaines, listes de valeurs
 * (contrôle sur DuckDB), sensibilité (classification et détection RGPD), propositions (dépôt, acceptation,
 * refus, retrait) ; plus les fonctions pures (application d'une proposition, SQL des listes).
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
import { EtatApplication } from '../src/gouvernance/gouvernance.service';
import { analyserSaisie, sqlCodesAutorises } from '../src/gouvernance/listes-valeurs';
import { appliquerProposition } from '../src/gouvernance/propositions';
import { motifDesIndices, niveauPropose } from '../src/gouvernance/sensibilite';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-gouvernance-'));
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
    await chargerCsv(
        'tb_cli',
        'clients.csv',
        'id;email;pays;statut\n1;ana@ex.fr;FR;actif\n2;bob@ex.fr;DE;actif\n3;zoe@ex.fr;XX;inactif\n4;idris@ex.fr;fr;actif\n'
    );
    await chargerCsv('tb_pays', 'pays.csv', 'code;libelle;etat\nFR;France;A\nDE;Allemagne;A\nIT;Italie;I\n');
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('fonctions pures : saisie de codes, SQL des listes, niveau proposé, motif RGPD, application d’une proposition', () => {
    assert.deepEqual(analyserSaisie('FR ; France ; A\nDE;Allemagne\n\nIT'), [
        { code: 'FR', label: 'France', status: 'A' },
        { code: 'DE', label: 'Allemagne', status: '' },
        { code: 'IT', label: '', status: '' }
    ]);
    const enClair = {
        id: 'vl_1',
        name: 'Pays',
        description: '',
        kind: 'inline' as const,
        values: analyserSaisie('fr;France;A\nIT;Italie;I'),
        srcTable: '',
        colCode: '',
        colLabel: '',
        colStatus: '',
        colList: '',
        listValue: '',
        activeStatus: 'A'
    };
    assert.equal(
        sqlCodesAutorises(enClair, () => null),
        `SELECT * FROM (VALUES ('FR')) AS t(c)`,
        'statut actif filtré, codes en majuscules'
    );
    assert.equal(
        sqlCodesAutorises({ ...enClair, kind: 'table', srcTable: 'absente' }, () => null),
        null
    );
    assert.equal(niveauPropose(undefined, 'email_client'), 'personnel');
    assert.equal(niveauPropose('Sensible', 'montant'), 'confidentiel');
    assert.equal(niveauPropose(undefined, 'montant'), 'interne');
    assert.equal(motifDesIndices(10, 5, 0, 0), 'emails détectés');
    assert.equal(motifDesIndices(10, 1, 0, 0), '');
    const etat = {
        governance: { businessObjects: [{ id: 'bo_1', name: 'Client', elements: [{ id: 'be_1', name: 'Email' }] }], dictionary: {} }
    } as unknown as EtatApplication;
    appliquerProposition(etat, {
        kind: 'attr',
        field: 'definition',
        target: { boId: 'bo_1', elId: 'be_1' },
        label: '',
        before: '',
        after: 'Adresse de contact',
        domain: ''
    });
    appliquerProposition(etat, {
        kind: 'dictcol',
        field: 'description',
        target: { tn: 'clients.csv', col: 'email' },
        label: '',
        before: '',
        after: 'Courriel',
        domain: ''
    });
    assert.equal((etat.governance.businessObjects[0]['elements'] as { definition: string }[])[0].definition, 'Adresse de contact');
    assert.equal(etat.governance.dictionary['clients.csv'].columns!['email']['description'], 'Courriel');
    assert.throws(
        () =>
            appliquerProposition(etat, {
                kind: 'bo',
                field: 'name',
                target: { boId: 'bo_absent' },
                label: '',
                before: '',
                after: 'X',
                domain: ''
            }),
        /introuvable/
    );
});

test('objets métier, actifs, périmètres : création, modification, homonymes refusés, suppression', async () => {
    const objet = {
        name: 'Client',
        definition: 'Personne ayant un contrat',
        domain: 'Ventes',
        globalOwner: 'Alice',
        elements: [{ id: 'be_email', name: 'Email', mappings: [{ table: 'clients.csv', col: 'email' }] }],
        sources: [{ table: 'clients.csv', role: 'maitre' }]
    };
    let reponse = await appel({ method: 'PUT', url: '/api/gouvernance/objets-metier/bo_client', payload: objet });
    assert.equal(reponse.statusCode, 200, reponse.body);
    assert.equal(json(reponse).contributors.length, 0, 'valeurs par défaut posées');
    reponse = await appel({ method: 'PUT', url: '/api/gouvernance/objets-metier/bo_autre', payload: { ...objet, name: 'client' } });
    assert.equal(reponse.statusCode, 400);
    assert.match(json(reponse).erreur, /existe déjà/);
    const actif = { name: 'CRM', kind: 'app', owner: 'Équipe Ventes', domain: 'Ventes', sources: ['clients.csv'], boIds: ['bo_client'] };
    assert.equal((await appel({ method: 'PUT', url: '/api/gouvernance/actifs/as_crm', payload: actif })).statusCode, 200);
    assert.equal(
        (
            await appel({
                method: 'PUT',
                url: '/api/gouvernance/actifs/as_fact',
                payload: { name: 'Facturation', kind: 'process', appIds: ['as_crm'] }
            })
        ).statusCode,
        200
    );
    // Renommer l'application propage le système source du dictionnaire.
    await appel({ method: 'PUT', url: '/api/gouvernance/dictionnaire/clients.csv', payload: { sourceSystem: 'CRM' } });
    await appel({ method: 'PUT', url: '/api/gouvernance/actifs/as_crm', payload: { ...actif, name: 'CRM Ventes' } });
    const dictionnaire = json(await appel({ method: 'GET', url: '/api/gouvernance/dictionnaire' }));
    assert.equal(dictionnaire['clients.csv'].sourceSystem, 'CRM Ventes');
    assert.equal(
        (
            await appel({
                method: 'PUT',
                url: '/api/gouvernance/perimetres/pe_ventes',
                payload: { name: 'Ventes', tables: ['clients.csv'], boIds: ['bo_client'] }
            })
        ).statusCode,
        200
    );
    const actifs = json(await appel({ method: 'GET', url: '/api/gouvernance/actifs' }));
    assert.deepEqual(
        actifs.map((candidat: { name: string }) => candidat.name),
        ['CRM Ventes', 'Facturation']
    );
    assert.equal((await appel({ method: 'DELETE', url: '/api/gouvernance/actifs/as_fact' })).statusCode, 200);
    assert.equal((await appel({ method: 'DELETE', url: '/api/gouvernance/actifs/as_fact' })).statusCode, 404);
    assert.equal(json(await appel({ method: 'GET', url: '/api/gouvernance/perimetres' })).length, 1);
});

test('personnes, rôles et domaines', async () => {
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/personnes/pe_alice',
        payload: { name: 'Alice Martin', email: 'alice@ex.fr', roles: [{ domain: 'Ventes', role: 'owner' }] }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/personnes/pe_bob',
        payload: { name: 'Bob Durand', roles: [{ domain: 'Finance', role: 'contrib' }] }
    });
    const invalide = await appel({
        method: 'PUT',
        url: '/api/gouvernance/personnes/pe_x',
        payload: { name: 'X', roles: [{ domain: '', role: 'chef' }] }
    });
    assert.equal(invalide.statusCode, 400);
    let domaines = json(await appel({ method: 'POST', url: '/api/gouvernance/domaines', payload: { name: 'Achats' } }));
    assert.deepEqual(domaines, ['Achats', 'Finance', 'Ventes'], 'déclarés + cités par les rôles, objets et actifs');
    domaines = json(await appel({ method: 'DELETE', url: '/api/gouvernance/domaines/Achats' }));
    assert.deepEqual(domaines, ['Finance', 'Ventes']);
    assert.equal(json(await appel({ method: 'GET', url: '/api/gouvernance/personnes' })).length, 2);
});

test('listes de valeurs : en clair et par source, contrôle d’une colonne, rattachement, suppression', async () => {
    const enClair = { name: 'Pays autorisés', kind: 'inline', values: analyserSaisie('FR;France\nDE;Allemagne') };
    assert.equal((await appel({ method: 'PUT', url: '/api/gouvernance/listes-de-valeurs/vl_pays', payload: enClair })).statusCode, 200);
    let controle = json(
        await appel({
            method: 'POST',
            url: '/api/gouvernance/listes-de-valeurs/vl_pays/controler',
            payload: { table: 'clients.csv', col: 'pays' }
        })
    );
    assert.equal(controle.total, 4);
    assert.equal(controle.horsListe, 1, '« fr » est accepté (majuscules), « XX » est hors liste');
    assert.deepEqual(controle.exemples, [{ valeur: 'XX', nombre: 1 }]);
    const parSource = {
        name: 'Pays (référentiel)',
        kind: 'table',
        srcTable: 'pays.csv',
        colCode: 'code',
        colLabel: 'libelle',
        colStatus: 'etat',
        activeStatus: 'A'
    };
    await appel({ method: 'PUT', url: '/api/gouvernance/listes-de-valeurs/vl_ref', payload: parSource });
    const apercu = json(await appel({ method: 'POST', url: '/api/gouvernance/listes-de-valeurs/vl_ref/apercu' }));
    assert.deepEqual(apercu, { codes: ['DE', 'FR'], total: 2 }, 'IT inactif exclu');
    controle = json(
        await appel({
            method: 'POST',
            url: '/api/gouvernance/listes-de-valeurs/vl_ref/controler',
            payload: { table: 'clients.csv', col: 'pays' }
        })
    );
    assert.equal(controle.horsListe, 1);
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/listes-de-valeurs/vl_ref/rattacher',
        payload: { table: 'clients.csv', col: 'pays' }
    });
    let listes = json(await appel({ method: 'GET', url: '/api/gouvernance/listes-de-valeurs' }));
    assert.deepEqual(listes.find((liste: { id: string }) => liste.id === 'vl_ref').utilisations, [{ table: 'clients.csv', col: 'pays' }]);
    const vide = await appel({
        method: 'POST',
        url: '/api/gouvernance/listes-de-valeurs/vl_pays/controler',
        payload: { table: 'clients.csv', col: 'absente' }
    });
    assert.equal(vide.statusCode, 400);
    await appel({ method: 'DELETE', url: '/api/gouvernance/listes-de-valeurs/vl_ref' });
    listes = json(await appel({ method: 'GET', url: '/api/gouvernance/listes-de-valeurs' }));
    assert.equal(listes.length, 1);
    const dictionnaire = json(await appel({ method: 'GET', url: '/api/gouvernance/dictionnaire' }));
    assert.equal(dictionnaire['clients.csv'].columns.pays.valueListId, undefined, 'rattachement retiré avec la liste');
});

test('sensibilité : classification, actions, détection RGPD', async () => {
    let classification = json(await appel({ method: 'GET', url: '/api/gouvernance/sensibilite' }));
    const email = classification.colonnes.find(
        (colonne: { table: string; col: string }) => colonne.table === 'clients.csv' && colonne.col === 'email'
    );
    assert.equal(email.niveauPropose, 'personnel');
    assert.equal(email.niveau, '');
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/sensibilite/niveau',
        payload: { table: 'clients.csv', col: 'statut', niveau: 'confidentiel' }
    });
    await appel({ method: 'PUT', url: '/api/gouvernance/sensibilite/actions', payload: { actions: { confidentiel: 'drop' } } });
    const detectees = json(await appel({ method: 'POST', url: '/api/gouvernance/sensibilite/detecter' }));
    assert.deepEqual(detectees, [{ table: 'clients.csv', col: 'email', motif: 'nom de colonne' }]);
    classification = json(await appel({ method: 'GET', url: '/api/gouvernance/sensibilite' }));
    assert.equal(classification.actions.confidentiel, 'drop');
    assert.equal(classification.actions.personnel, 'pseudo', 'valeur par défaut conservée');
    assert.equal(classification.colonnes.find((colonne: { col: string }) => colonne.col === 'statut').niveau, 'confidentiel');
    assert.equal(classification.colonnes.find((colonne: { col: string }) => colonne.col === 'email').sensibilite, 'Personnel (RGPD)');
});

test('propositions : dépôt, remplacement, acceptation appliquée, refus, retrait', async () => {
    const proposition = {
        kind: 'attr',
        field: 'definition',
        target: { boId: 'bo_client', elId: 'be_email' },
        label: 'Email : définition',
        before: '',
        after: 'Adresse de contact',
        domain: 'Ventes'
    };
    let reponse = await appel({ method: 'POST', url: '/api/gouvernance/propositions', payload: proposition });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const deposee = json(reponse);
    assert.equal(deposee.status, 'pending');
    assert.equal(deposee.byName, 'Administrateur');
    reponse = await appel({
        method: 'POST',
        url: '/api/gouvernance/propositions',
        payload: { ...proposition, after: 'Adresse de contact principale' }
    });
    assert.equal(json(reponse).id, deposee.id, 'même cible et même champ : la proposition en attente est remplacée');
    const inexistante = await appel({
        method: 'POST',
        url: '/api/gouvernance/propositions',
        payload: { ...proposition, target: { boId: 'bo_absent', elId: 'x' } }
    });
    assert.equal(inexistante.statusCode, 400);
    const acceptee = json(await appel({ method: 'POST', url: `/api/gouvernance/propositions/${deposee.id}/accepter`, payload: {} }));
    assert.equal(acceptee.status, 'accepted');
    const [objet] = json(await appel({ method: 'GET', url: '/api/gouvernance/objets-metier' }));
    assert.equal(objet.elements[0].definition, 'Adresse de contact principale');
    assert.equal(objet.history.length, 1);
    assert.match(objet.history[0].comment, /proposé par Administrateur/);
    const deuxieme = json(
        await appel({
            method: 'POST',
            url: '/api/gouvernance/propositions',
            payload: {
                kind: 'bo',
                field: 'globalOwner',
                target: { boId: 'bo_client' },
                label: 'Client : propriétaire',
                before: 'Alice',
                after: 'Bob'
            }
        })
    );
    const refusee = json(
        await appel({
            method: 'POST',
            url: `/api/gouvernance/propositions/${deuxieme.id}/refuser`,
            payload: { comment: 'Alice reste propriétaire' }
        })
    );
    assert.equal(refusee.status, 'rejected');
    assert.equal(
        (await appel({ method: 'POST', url: `/api/gouvernance/propositions/${deuxieme.id}/refuser`, payload: {} })).statusCode,
        400,
        'déjà décidée'
    );
    const troisieme = json(
        await appel({
            method: 'POST',
            url: '/api/gouvernance/propositions',
            payload: {
                kind: 'dict',
                field: 'description',
                target: { tn: 'clients.csv' },
                label: 'clients : description',
                after: 'Référentiel clients'
            }
        })
    );
    assert.equal((await appel({ method: 'DELETE', url: `/api/gouvernance/propositions/${troisieme.id}` })).statusCode, 200);
    const liste = json(await appel({ method: 'GET', url: '/api/gouvernance/propositions' }));
    assert.deepEqual(
        liste.map((candidat: { status: string }) => candidat.status).sort(),
        ['accepted', 'rejected'],
        'la proposition retirée a disparu'
    );
});
