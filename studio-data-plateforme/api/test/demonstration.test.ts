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
    assert.equal(etat.governance.businessObjects[0].name, 'Client');
    assert.equal(etat.governance.businessObjects[0].structure.length, 3);
    assert.equal(etat.governance.series[0].tsCol, 'horodatage');
    assert.equal(etat.dashboards.length, 2);
    assert.equal(etat.governance.privacy.levels['contacts.csv'].email, 'personnel');
    assert.ok(etat.governance.domainList.includes('Ventes'));
    assert.equal(etat.governance.glossary.length, 4);
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
