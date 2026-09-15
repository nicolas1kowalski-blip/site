/**
 * Tests du mode démonstration : l'installation en un clic doit produire un espace réellement utilisable —
 * douze sources chargées dans DuckDB, le modèle de données déclaré, le dictionnaire rempli, les listes de
 * valeurs, l'objet métier, la série temporelle et les tableaux de bord en place, les règles de qualité posées
 * et déjà exécutées. Le jeu utilisé ici est la taille « petite », produite dans un dossier temporaire par le
 * générateur de donnees-demo : le test vérifie donc aussi que les deux morceaux s'emboîtent.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { creerApplication } from '../src/application';
import { lireConfiguration } from '../src/configuration/configuration';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-demonstration-'));
const dossierDuJeu = path.join(dossierTemporaire, 'jeu');
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;

before(async () => {
    const generateur = path.resolve(__dirname, '..', '..', '..', 'donnees-demo', 'generer.mjs');
    execFileSync(process.execPath, [generateur, '--taille', 'petite', '--dossier', dossierDuJeu, '--silencieux']);
    const configuration = lireConfiguration({
        SD_DONNEES: dossierTemporaire,
        SD_JOURNAL: 'silent',
        SD_ADMIN_MOT_DE_PASSE: 'MotDePasseAdmin1',
        SD_DEMONSTRATION: dossierDuJeu,
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
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('état avant installation : le jeu est encore sur le disque, la base est vide, aucun espace', async () => {
    const etat = json(await appel({ method: 'GET', url: '/api/demonstration/etat' }));
    assert.equal(etat.pretAInstaller, true, 'les fichiers du dossier suffisent pour installer');
    assert.equal(etat.fichiersManquants.length, 0);
    assert.equal(etat.fichiersSurDisque.length, 12);
    assert.equal(etat.jeuEnBase.fichiers, 0, 'rien en base tant qu’on n’a pas installé');
    assert.equal(etat.espace, null);
    assert.equal(etat.dossier, dossierDuJeu);
});

test('le jeu se range dans la base : douze fichiers compressés, plus légers que les originaux', async () => {
    const chargement = json(await appel({ method: 'POST', url: '/api/demonstration/jeu' }));
    assert.equal(chargement.fichiers, 12);
    assert.ok(chargement.octetsCompresses < chargement.octets / 2, 'la compression divise le volume par plus de deux');
    const etat = json(await appel({ method: 'GET', url: '/api/demonstration/etat' }));
    assert.equal(etat.jeuEnBase.fichiers, 12);
    assert.equal(etat.jeuEnBase.octets, chargement.octets);
    assert.ok(etat.jeuEnBase.chargeLe, 'la date de chargement est connue');
});

test('installation : un espace prêt à l’emploi — sources, modèle, gouvernance, règles exécutées', async () => {
    const reponse = await appel({ method: 'POST', url: '/api/demonstration/installer', payload: {} });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const rapport = json(reponse);
    assert.deepEqual([rapport.espace.code, rapport.espace.nom], ['demo', 'Démonstration']);
    assert.equal(rapport.sources.length, 12);
    assert.deepEqual([rapport.liens, rapport.regles, rapport.tableaux], [12, 12, 2]);
    assert.ok(typeof rapport.score === 'number' && rapport.score >= 0 && rapport.score <= 100, 'un score de qualité a été calculé');
    const clients = rapport.sources.find((source: { nom: string }) => source.nom === 'clients.csv');
    assert.ok(clients.lignes > 300, 'les clients sont chargés, doublons et lignes vides compris');
    assert.equal(clients.colonnes, 22);
    // On se place dans l'espace de démonstration pour interroger son contenu.
    assert.equal((await appel({ method: 'PUT', url: '/api/auth/espace-courant', payload: { code: 'demo' } })).statusCode, 200);
    const sources = json(await appel({ method: 'GET', url: '/api/tables' }));
    assert.equal(sources.length, 12);
    assert.equal(sources.find((source: { name: string }) => source.name === 'contacts.csv').theme, 'Commercial');
    const relations = json(await appel({ method: 'GET', url: '/api/modele/relations' }));
    assert.equal(relations.length, 12);
    assert.ok(
        relations.every((relation: { sourceId: string | null }) => relation.sourceId),
        'chaque lien retombe sur une table chargée'
    );
});

test('gouvernance installée : dictionnaire, listes de valeurs, objet métier, série et tableaux de bord', async () => {
    const etat = json(await appel({ method: 'GET', url: '/api/etat/appState' })).valeur;
    assert.equal(Object.keys(etat.governance.dictionary).length, 12);
    assert.match(etat.governance.dictionary['clients.csv'].description, /profilage/);
    assert.equal(etat.governance.dictionary['contacts.csv'].keyProfiles[0].parts.length, 3);
    assert.equal(etat.governance.valueLists.length, 4);
    assert.equal(etat.governance.series[0].tsCol, 'horodatage');
    assert.equal(etat.dashboards.length, 2);
    assert.equal(etat.governance.privacy.levels['contacts.csv'].email, 'personnel');
    assert.ok(etat.governance.domainList.includes('Ventes'));
    assert.equal(etat.governance.glossary.length, 8);
});

/**
 * La gouvernance doit être écrite au format des écrans — c'est ce qui manquait avant : les objets étaient
 * enregistrés au format interne de l'application classique, et les fiches s'affichaient vides.
 */
test('gouvernance installée : les objets métier ont leurs informations, leurs colonnes et leurs origines', async () => {
    const objets = json(await appel({ method: 'GET', url: '/api/gouvernance/objets-metier' }));
    assert.equal(objets.length, 7);
    const client = objets.find((objet: { name: string }) => objet.name === 'Client');
    assert.ok(client.definition, 'la définition de l’objet est écrite');
    assert.equal(client.globalOwner, 'Direction commerciale');
    assert.equal(client.elements.length, 7);
    const courriel = client.elements.find((information: { name: string }) => information.name === 'Adresse électronique');
    assert.deepEqual(courriel.mappings, [{ table: 'clients.csv', col: 'email' }]);
    assert.equal(courriel.sensitivity, 'personnel');
    // V12.6 : une information qui provient d'une information d'un autre objet.
    const commune = client.elements.find((information: { name: string }) => information.name === 'Commune');
    assert.equal(commune.origins[0].boId, 'bo_commune');
    assert.equal(commune.origins[0].kind, 'copie');
    // Des trous sont laissés exprès : sans eux, la complétude et « À valider » n'auraient rien à montrer.
    assert.ok(
        client.elements.some((information: { definition?: string }) => !information.definition),
        'une information sans définition subsiste'
    );
});

test('gouvernance installée : applications, processus et restitutions, avec ce qu’ils produisent et lisent', async () => {
    const actifs = json(await appel({ method: 'GET', url: '/api/gouvernance/actifs' }));
    assert.equal(actifs.length, 12);
    const genres = actifs.reduce((compte: Record<string, number>, actif: { kind: string }) => {
        compte[actif.kind] = (compte[actif.kind] || 0) + 1;
        return compte;
    }, {});
    assert.deepEqual(genres, { app: 6, process: 3, report: 3 });
    const crm = actifs.find((actif: { name: string }) => actif.name === 'CRM Vega');
    assert.ok(crm.sources.includes('clients.csv'), 'le CRM produit les clients');
    assert.ok(crm.tables.includes('communes.csv'), 'le CRM lit le référentiel géographique');
    assert.equal(crm.criticality, 'Critique');
    const tva = actifs.find((actif: { name: string }) => actif.name === 'Déclaration de TVA');
    assert.equal(tva.kind, 'report');
    assert.equal(tva.recipients, 'Administration fiscale');
});

test('gouvernance installée : périmètres, personnes avec rôles, et propositions en attente', async () => {
    const perimetres = json(await appel({ method: 'GET', url: '/api/gouvernance/perimetres' }));
    assert.equal(perimetres.length, 3);
    assert.ok(perimetres.some((perimetre: { name: string }) => /RGPD/.test(perimetre.name)));
    const personnes = json(await appel({ method: 'GET', url: '/api/gouvernance/personnes' }));
    assert.equal(personnes.length, 6);
    const commerciale = personnes.find((personne: { name: string }) => personne.name === 'Direction commerciale');
    assert.deepEqual(
        commerciale.roles.map((role: { domain: string; role: string }) => `${role.domain}:${role.role}`),
        ['Commercial:owner', 'Ventes:owner']
    );
    const propositions = json(await appel({ method: 'GET', url: '/api/gouvernance/propositions' }));
    const enAttente = propositions.filter((proposition: { status: string }) => proposition.status === 'pending');
    assert.equal(enAttente.length, 4);
    // Deux d'entre elles visent la même fiche : l'écran « à valider » peut ainsi montrer « tout valider ».
    assert.equal(enAttente.filter((proposition: { target: { boId?: string } }) => proposition.target.boId === 'bo_client').length, 2);
});

/** La carte des flux est dérivée à l'installation : sans elle, « Parcours de la donnée » resterait vide. */
test('gouvernance installée : la carte des flux est déjà dessinée', async () => {
    const carte = json(await appel({ method: 'GET', url: '/api/lineage/flux' }));
    assert.ok(carte.noeuds.length >= 30, `au moins trente nœuds, ${carte.noeuds.length} obtenus`);
    assert.ok(carte.liens.length >= 50, `au moins cinquante liens, ${carte.liens.length} obtenus`);
    const parcours = json(await appel({ method: 'GET', url: '/api/lineage/objet?boId=bo_facture&profond=1' }));
    assert.ok(parcours.graphe.noeuds.length >= 6, 'le parcours de la facture remonte jusqu’aux applications');
});

test('qualité : les règles ont un résultat, et le dédoublonnage des contacts trouve les trois familles', async () => {
    const regles = json(await appel({ method: 'GET', url: '/api/qualite/regles' }));
    assert.equal(regles.length, 12);
    const executees = regles.filter((regle: { dernierResultat: unknown }) => regle.dernierResultat);
    assert.ok(executees.length >= 10, 'les règles ont été exécutées à l’installation');
    const siret = regles.find((regle: { nom: string }) => regle.nom === 'SIRET attendu pour les professionnels');
    assert.ok(siret.dernierResultat.echecs > 0, 'des professionnels sans SIRET sont détectés');
    const audits = json(await appel({ method: 'GET', url: '/api/qualite/audits' }));
    assert.ok(audits.length >= 3, 'le premier audit est dans l’historique');
    const doublons = json(
        await appel({ method: 'POST', url: '/api/qualite/doublons-approches', payload: { sourceId: 'tb_contacts', seuil: 0.9 } })
    );
    assert.equal(doublons.length, 1, 'le profil de clé prénom + nom + ville est déjà enregistré');
    assert.ok(doublons[0].exactes.groupes > 0, 'des doublons stricts');
    assert.ok(doublons[0].proches.groupes > 0, 'des clés écrites différemment');
});

test('réinstallation : refusée sans « remplacer », acceptée avec — puis l’espace peut être vidé', async () => {
    const refus = await appel({ method: 'POST', url: '/api/demonstration/installer', payload: {} });
    assert.equal(refus.statusCode, 400);
    assert.match(json(refus).erreur, /remplacer/);
    const etat = json(await appel({ method: 'GET', url: '/api/demonstration/etat' }));
    assert.equal(etat.espace.sources, 12);
    assert.ok(etat.espace.installeLe, 'la date d’installation est mémorisée');
    const reinstallation = await appel({ method: 'POST', url: '/api/demonstration/installer', payload: { remplacer: true } });
    assert.equal(reinstallation.statusCode, 201, reinstallation.body);
    assert.equal(json(reinstallation).sources.length, 12);
    assert.equal(json(await appel({ method: 'GET', url: '/api/tables' })).length, 12, 'pas de doublon de source après réinstallation');
    const vidage = json(await appel({ method: 'DELETE', url: '/api/demonstration/contenu' }));
    assert.equal(vidage.sourcesSupprimees, 12);
    assert.equal(json(await appel({ method: 'GET', url: '/api/tables' })).length, 0);
    assert.equal(json(await appel({ method: 'GET', url: '/api/qualite/regles' })).length, 0);
});

test('le jeu vit dans la base : l’installation marche encore une fois les fichiers du disque effacés', async () => {
    fs.rmSync(dossierDuJeu, { recursive: true, force: true });
    const etat = json(await appel({ method: 'GET', url: '/api/demonstration/etat' }));
    assert.equal(etat.fichiersSurDisque.length, 0, 'plus rien sur le disque');
    assert.equal(etat.jeuEnBase.fichiers, 12);
    assert.equal(etat.pretAInstaller, true, 'la base suffit');
    const installation = await appel({ method: 'POST', url: '/api/demonstration/installer', payload: { remplacer: true } });
    assert.equal(installation.statusCode, 201, installation.body);
    assert.equal(json(installation).sources.length, 12);
    assert.equal(json(await appel({ method: 'GET', url: '/api/tables' })).length, 12);
    // Sans jeu en base ni fichiers, l'installation dit clairement ce qui manque.
    assert.equal(json(await appel({ method: 'DELETE', url: '/api/demonstration/jeu' })).fichiersRetires, 12);
    const sansJeu = json(await appel({ method: 'GET', url: '/api/demonstration/etat' }));
    assert.equal(sansJeu.pretAInstaller, false);
    assert.equal(sansJeu.fichiersManquants.length, 12);
    const refus = await appel({ method: 'POST', url: '/api/demonstration/installer', payload: { remplacer: true } });
    assert.equal(refus.statusCode, 400);
    assert.match(json(refus).erreur, /npm run demo/);
});
