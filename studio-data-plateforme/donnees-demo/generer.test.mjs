/**
 * Tests du générateur du jeu de démonstration : le tirage est-il bien reproductible, les fichiers sont-ils
 * structurellement corrects (autant de valeurs que d'en-têtes, identifiants uniques, clés étrangères qui
 * retombent sur leurs pieds), et surtout — les défauts annoncés par le manifeste sont-ils réellement dans les
 * données ? C'est ce dernier point qui compte : une démonstration de qualité de données ne vaut que si les
 * anomalies promises sont là.
 *
 *   node --test donnees-demo/generer.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { genererLeJeuDeDemonstration } from './generer.mjs';

const dossierPremier = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-demo-un-'));
const dossierSecond = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-demo-deux-'));
const premier = genererLeJeuDeDemonstration(['--taille', 'petite', '--dossier', dossierPremier, '--silencieux']);

after(() => {
    fs.rmSync(dossierPremier, { recursive: true, force: true });
    fs.rmSync(dossierSecond, { recursive: true, force: true });
});

/** Découpe une ligne CSV en valeurs : point-virgule séparateur, guillemets doublés à l'intérieur d'une valeur. */
function decouperLigne(ligne) {
    const valeurs = [];
    let courante = '';
    let entreGuillemets = false;
    for (let position = 0; position < ligne.length; position++) {
        const caractere = ligne[position];
        if (entreGuillemets && caractere === '"' && ligne[position + 1] === '"') {
            courante += '"';
            position++;
        } else if (caractere === '"') {
            entreGuillemets = !entreGuillemets;
        } else if (caractere === ';' && !entreGuillemets) {
            valeurs.push(courante);
            courante = '';
        } else {
            courante += caractere;
        }
    }
    valeurs.push(courante);
    return valeurs;
}

/** Lecture d'un CSV produit : les valeurs entre guillemets sont rendues telles qu'elles ont été écrites. */
function lireCsv(nomFichier) {
    const texte = fs.readFileSync(path.join(dossierPremier, nomFichier), 'utf8').replace(/\n$/, '');
    const lignes = texte.split('\n').map(decouperLigne);
    const colonnes = lignes[0];
    return {
        colonnes,
        lignes: lignes.slice(1),
        valeur: (ligne, nomColonne) => ligne[colonnes.indexOf(nomColonne)]
    };
}

/** Clé de rapprochement « normalisée » : c'est ce que fait l'application quand elle cherche des doublons. */
function cleNormalisee(valeurs) {
    return valeurs
        .map(valeur =>
            valeur
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
        )
        .join('|');
}

test('génération reproductible : deux passages avec la même graine écrivent des fichiers identiques', () => {
    genererLeJeuDeDemonstration(['--taille', 'petite', '--dossier', dossierSecond, '--silencieux']);
    const fichiers = fs.readdirSync(dossierPremier).filter(nom => nom !== 'manifeste.json');
    assert.ok(fichiers.length >= 15, 'le jeu compte au moins quinze fichiers');
    for (const nom of fichiers) {
        const premierContenu = fs.readFileSync(path.join(dossierPremier, nom));
        const secondContenu = fs.readFileSync(path.join(dossierSecond, nom));
        assert.ok(premierContenu.equals(secondContenu), `le fichier ${nom} devrait être identique d'un passage à l'autre`);
    }
});

test('structure des fichiers : autant de valeurs que d’en-têtes, et un manifeste qui décrit ce qui a été écrit', () => {
    const attendus = ['communes.csv', 'clients.csv', 'contacts.csv', 'commandes.csv', 'factures.csv', 'releves_consommation.csv'];
    for (const nom of attendus) {
        const table = lireCsv(nom);
        assert.ok(table.lignes.length > 0, `${nom} ne devrait pas être vide`);
        for (const ligne of table.lignes) assert.equal(ligne.length, table.colonnes.length, `${nom} : ligne mal découpée`);
    }
    const manifeste = JSON.parse(fs.readFileSync(path.join(dossierPremier, 'manifeste.json'), 'utf8'));
    assert.equal(manifeste.taille, 'petite');
    assert.equal(manifeste.dateReference, '2026-09-10');
    assert.ok(manifeste.fichiers.some(fichier => fichier.fichier === 'catalogue-produits.xlsx'));
    assert.ok(manifeste.fichiers.some(fichier => fichier.fichier === 'livraison-mensuelle.zip'));
    assert.deepEqual(manifeste, premier.manifeste, 'le manifeste renvoyé et le manifeste écrit disent la même chose');
});

test('clients : lignes vides, lignes dupliquées, statuts hors liste et SIRET manquants sont bien dans le fichier', () => {
    const table = lireCsv('clients.csv');
    const defauts = premier.manifeste.defautsSemes;
    const lignesVides = table.lignes.filter(ligne => ligne.every(valeur => valeur === ''));
    assert.equal(lignesVides.length, defauts['clients.ligne_vide'], 'autant de lignes vides que le manifeste en annonce');
    const empreintes = table.lignes.map(ligne => ligne.join('|'));
    const doublons = empreintes.length - new Set(empreintes).size;
    assert.ok(doublons >= defauts['clients.ligne_dupliquee'], 'les lignes dupliquées sont bien présentes en double');
    const statuts = new Set(table.lignes.map(ligne => table.valeur(ligne, 'statut')).filter(Boolean));
    const horsListe = [...statuts].filter(statut => !['ACTIF', 'INACTIF', 'PROSPECT', 'RESILIE'].includes(statut));
    assert.ok(horsListe.length > 0, 'des statuts hors liste attendent la règle « liste de valeurs »');
    const professionnels = table.lignes.filter(ligne => table.valeur(ligne, 'type') === 'PRO');
    const sansSiret = professionnels.filter(ligne => !table.valeur(ligne, 'siret'));
    assert.equal(sansSiret.length, defauts['clients.siret_manquant_sur_professionnel'], 'des professionnels sans SIRET');
    const villes = table.lignes.map(ligne => table.valeur(ligne, 'ville')).filter(Boolean);
    assert.ok(
        villes.some(ville => ville === ville.toUpperCase() && /[A-Z]{3}/.test(ville)),
        'des villes en majuscules'
    );
});

test('contacts : les trois familles de doublons (strict, normalisé, flou) sont retrouvables dans le fichier', () => {
    const table = lireCsv('contacts.csv');
    const empreintesStrictes = table.lignes.map(ligne => ligne.join('|'));
    assert.ok(empreintesStrictes.length - new Set(empreintesStrictes).size >= 20, 'des lignes strictement identiques');
    const groupes = new Map();
    for (const ligne of table.lignes) {
        const cle = cleNormalisee([table.valeur(ligne, 'prenom'), table.valeur(ligne, 'nom'), table.valeur(ligne, 'ville')]);
        groupes.set(cle, (groupes.get(cle) || 0) + 1);
    }
    const clesEnDoublon = [...groupes.values()].filter(nombre => nombre > 1).length;
    assert.ok(clesEnDoublon >= 40, `la clé prénom + nom + ville doit ressortir en doublon (trouvé ${clesEnDoublon})`);
    const clients = new Set(lireCsv('clients.csv').lignes.map(ligne => ligne[0]));
    const orphelins = table.lignes.filter(ligne => table.valeur(ligne, 'id_client') && !clients.has(table.valeur(ligne, 'id_client')));
    assert.equal(orphelins.length, premier.manifeste.defautsSemes['contacts.client_inconnu'], 'des contacts sans client');
});

test('ventes : les commandes suivent la saison, et les écarts avec les factures et les lignes sont bien là', () => {
    const commandes = lireCsv('commandes.csv');
    const parMois = new Map();
    for (const ligne of commandes.lignes) {
        const date = commandes.valeur(ligne, 'date_commande');
        const mois = date.includes('/') ? date.slice(3, 5) : date.slice(5, 7);
        parMois.set(mois, (parMois.get(mois) || 0) + 1);
    }
    assert.ok(parMois.get('08') < parMois.get('11'), 'août doit être plus creux que novembre');
    const datesFrancaises = commandes.lignes.filter(ligne => commandes.valeur(ligne, 'date_commande').includes('/'));
    assert.equal(datesFrancaises.length, premier.manifeste.defautsSemes['commandes.date_a_la_francaise'], 'des dates à la française');
    const references = commandes.lignes.map(ligne => commandes.valeur(ligne, 'reference'));
    assert.ok(references.length - new Set(references).size > 0, 'des références de commande en double');
    const lignesCommande = lireCsv('lignes_commande.csv');
    const fausses = lignesCommande.lignes.filter(ligne => {
        const quantite = Number(lignesCommande.valeur(ligne, 'quantite'));
        const prix = Number(lignesCommande.valeur(ligne, 'prix_unitaire'));
        const remise = Number(lignesCommande.valeur(ligne, 'remise_pct'));
        const attendu = Math.round(quantite * prix * (1 - remise / 100) * 100) / 100;
        return Math.abs(attendu - Number(lignesCommande.valeur(ligne, 'montant_ligne'))) > 0.01;
    });
    assert.equal(fausses.length, premier.manifeste.defautsSemes['lignes_commande.total_incoherent'], 'des totaux de ligne faux');
});

test('relevés : la série horaire est complète à quelques trous près, avec des plateaux et des sauts', () => {
    const table = lireCsv('releves_consommation.csv');
    const defauts = premier.manifeste.defautsSemes;
    const parSite = new Map();
    for (const ligne of table.lignes) {
        const site = table.valeur(ligne, 'id_site');
        if (!parSite.has(site)) parSite.set(site, []);
        parSite.get(site).push(table.valeur(ligne, 'horodatage'));
    }
    assert.equal(parSite.size, 2, 'deux sites suivis en taille « petite »');
    for (const horodatages of parSite.values()) assert.ok(horodatages.length > 24 * 50, 'une cinquantaine de journées au moins par site');
    const empreintes = table.lignes.map(ligne => table.valeur(ligne, 'id_site') + ' ' + table.valeur(ligne, 'horodatage'));
    assert.equal(empreintes.length - new Set(empreintes).size, defauts['releves.horodatage_en_double'], 'des horodatages en double');
    const heures = table.lignes.map(ligne => table.valeur(ligne, 'horodatage').slice(11, 13));
    assert.ok(new Set(heures).size === 24, 'les vingt-quatre heures de la journée sont représentées');
    assert.ok(defauts['releves.valeur_figee'] >= 8, 'au moins un plateau de huit heures par site');
    assert.ok(defauts['releves.journee_manquante'] >= 1, 'au moins une journée entière manquante');
});

test('arrivages : la mise à jour a une colonne en moins et des clients nouveaux, la livraison est une archive', () => {
    const clients = lireCsv('clients.csv');
    const miseAJour = lireCsv('clients-mise-a-jour.csv');
    assert.equal(miseAJour.colonnes.length, clients.colonnes.length - 1);
    assert.ok(!miseAJour.colonnes.includes('consentement_rgpd'), 'la colonne du consentement a disparu de la mise à jour');
    const identifiantsConnus = new Set(clients.lignes.map(ligne => ligne[0]));
    const nouveaux = miseAJour.lignes.filter(ligne => !identifiantsConnus.has(ligne[0]));
    assert.equal(nouveaux.length, premier.manifeste.defautsSemes['mise_a_jour.client_nouveau'], 'des clients qui n’existaient pas');
    const archive = fs.readFileSync(path.join(dossierPremier, 'livraison-mensuelle.zip'));
    assert.equal(archive.subarray(0, 2).toString(), 'PK', 'la livraison est bien une archive ZIP');
    const classeur = fs.readFileSync(path.join(dossierPremier, 'catalogue-produits.xlsx'));
    assert.equal(classeur.subarray(0, 2).toString(), 'PK', 'le catalogue est bien un classeur .xlsx');
});
