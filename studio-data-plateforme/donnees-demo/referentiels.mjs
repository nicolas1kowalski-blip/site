/**
 * Référentiels du jeu de démonstration : communes françaises (avec code INSEE, code postal, département, région
 * et coordonnées approchées, arrondies à deux décimales), vocabulaire commercial (segments, statuts, canaux),
 * familles de produits, et les listes de prénoms, noms et mots servant à composer des identités et des raisons
 * sociales entièrement fictives. Les entreprises, les personnes et les montants sont inventés ; seules les
 * communes sont réelles, pour que les cartes, les regroupements par région et les codes postaux aient du sens.
 */

// Une commune par ligne : nom | code INSEE | code postal | département | nom du département | région | latitude | longitude | population
const COMMUNES_BRUTES = [
    'Paris|75056|75001|75|Paris|Île-de-France|48.86|2.35|2133111',
    'Boulogne-Billancourt|92012|92100|92|Hauts-de-Seine|Île-de-France|48.84|2.24|121334',
    'Saint-Denis|93066|93200|93|Seine-Saint-Denis|Île-de-France|48.94|2.36|112091',
    'Argenteuil|95018|95100|95|Val-d’Oise|Île-de-France|48.95|2.25|110388',
    'Montreuil|93048|93100|93|Seine-Saint-Denis|Île-de-France|48.86|2.44|109914',
    'Nanterre|92050|92000|92|Hauts-de-Seine|Île-de-France|48.89|2.20|96807',
    'Créteil|94028|94000|94|Val-de-Marne|Île-de-France|48.79|2.46|92646',
    'Versailles|78646|78000|78|Yvelines|Île-de-France|48.80|2.13|85205',
    'Issy-les-Moulineaux|92040|92130|92|Hauts-de-Seine|Île-de-France|48.82|2.27|68451',
    'Cergy|95127|95000|95|Val-d’Oise|Île-de-France|49.04|2.06|66300',
    'Meaux|77284|77100|77|Seine-et-Marne|Île-de-France|48.96|2.88|55750',
    'Évry-Courcouronnes|91228|91000|91|Essonne|Île-de-France|48.63|2.44|67558',
    'Lille|59350|59000|59|Nord|Hauts-de-France|50.63|3.06|236234',
    'Amiens|80021|80000|80|Somme|Hauts-de-France|49.89|2.30|133448',
    'Roubaix|59512|59100|59|Nord|Hauts-de-France|50.69|3.17|98828',
    'Dunkerque|59183|59140|59|Nord|Hauts-de-France|51.03|2.38|86279',
    'Calais|62193|62100|62|Pas-de-Calais|Hauts-de-France|50.95|1.86|72929',
    'Beauvais|60057|60000|60|Oise|Hauts-de-France|49.43|2.08|56020',
    'Saint-Quentin|02691|02100|02|Aisne|Hauts-de-France|49.85|3.29|53000',
    'Strasbourg|67482|67000|67|Bas-Rhin|Grand Est|48.57|7.75|287228',
    'Reims|51454|51100|51|Marne|Grand Est|49.26|4.03|182460',
    'Metz|57463|57000|57|Moselle|Grand Est|49.12|6.18|116429',
    'Mulhouse|68224|68100|68|Haut-Rhin|Grand Est|47.75|7.34|108312',
    'Nancy|54395|54000|54|Meurthe-et-Moselle|Grand Est|48.69|6.18|104885',
    'Colmar|68066|68000|68|Haut-Rhin|Grand Est|48.08|7.36|68784',
    'Troyes|10387|10000|10|Aube|Grand Est|48.30|4.08|61996',
    'Charleville-Mézières|08105|08000|08|Ardennes|Grand Est|49.77|4.72|46000',
    'Le Havre|76351|76600|76|Seine-Maritime|Normandie|49.49|0.11|165830',
    'Rouen|76540|76000|76|Seine-Maritime|Normandie|49.44|1.10|112321',
    'Caen|14118|14000|14|Calvados|Normandie|49.18|-0.37|105512',
    'Cherbourg-en-Cotentin|50129|50100|50|Manche|Normandie|49.64|-1.62|78549',
    'Évreux|27229|27000|27|Eure|Normandie|49.02|1.15|46893',
    'Rennes|35238|35000|35|Ille-et-Vilaine|Bretagne|48.11|-1.68|222485',
    'Brest|29019|29200|29|Finistère|Bretagne|48.39|-4.49|139926',
    'Quimper|29232|29000|29|Finistère|Bretagne|48.00|-4.10|63283',
    'Lorient|56121|56100|56|Morbihan|Bretagne|47.75|-3.37|57149',
    'Vannes|56260|56000|56|Morbihan|Bretagne|47.66|-2.76|53719',
    'Saint-Malo|35288|35400|35|Ille-et-Vilaine|Bretagne|48.65|-2.03|46097',
    'Saint-Brieuc|22278|22000|22|Côtes-d’Armor|Bretagne|48.51|-2.77|44372',
    'Nantes|44109|44000|44|Loire-Atlantique|Pays de la Loire|47.22|-1.55|320732',
    'Angers|49007|49000|49|Maine-et-Loire|Pays de la Loire|47.47|-0.55|155850',
    'Le Mans|72181|72000|72|Sarthe|Pays de la Loire|48.01|0.20|145047',
    'Saint-Nazaire|44184|44600|44|Loire-Atlantique|Pays de la Loire|47.28|-2.21|72925',
    'La Roche-sur-Yon|85191|85000|85|Vendée|Pays de la Loire|46.67|-1.43|55199',
    'Cholet|49099|49300|49|Maine-et-Loire|Pays de la Loire|47.06|-0.88|54121',
    'Laval|53130|53000|53|Mayenne|Pays de la Loire|48.07|-0.77|49492',
    'Tours|37261|37000|37|Indre-et-Loire|Centre-Val de Loire|47.39|0.69|137658',
    'Orléans|45234|45000|45|Loiret|Centre-Val de Loire|47.90|1.90|116269',
    'Bourges|18033|18000|18|Cher|Centre-Val de Loire|47.08|2.40|64551',
    'Blois|41018|41000|41|Loir-et-Cher|Centre-Val de Loire|47.59|1.33|46086',
    'Châteauroux|36044|36000|36|Indre|Centre-Val de Loire|46.81|1.69|43442',
    'Chartres|28085|28000|28|Eure-et-Loir|Centre-Val de Loire|48.44|1.49|38534',
    'Dijon|21231|21000|21|Côte-d’Or|Bourgogne-Franche-Comté|47.32|5.04|158002',
    'Besançon|25056|25000|25|Doubs|Bourgogne-Franche-Comté|47.24|6.02|119198',
    'Belfort|90010|90000|90|Territoire de Belfort|Bourgogne-Franche-Comté|47.64|6.86|46443',
    'Chalon-sur-Saône|71076|71100|71|Saône-et-Loire|Bourgogne-Franche-Comté|46.78|4.85|45219',
    'Auxerre|89024|89000|89|Yonne|Bourgogne-Franche-Comté|47.80|3.57|34634',
    'Nevers|58194|58000|58|Nièvre|Bourgogne-Franche-Comté|46.99|3.16|32416',
    'Lyon|69123|69001|69|Rhône|Auvergne-Rhône-Alpes|45.76|4.84|522969',
    'Saint-Étienne|42218|42000|42|Loire|Auvergne-Rhône-Alpes|45.44|4.39|174000',
    'Grenoble|38185|38000|38|Isère|Auvergne-Rhône-Alpes|45.19|5.72|158454',
    'Villeurbanne|69266|69100|69|Rhône|Auvergne-Rhône-Alpes|45.77|4.88|152212',
    'Clermont-Ferrand|63113|63000|63|Puy-de-Dôme|Auvergne-Rhône-Alpes|45.78|3.08|147865',
    'Annecy|74010|74000|74|Haute-Savoie|Auvergne-Rhône-Alpes|45.90|6.13|130721',
    'Valence|26362|26000|26|Drôme|Auvergne-Rhône-Alpes|44.93|4.89|65028',
    'Chambéry|73065|73000|73|Savoie|Auvergne-Rhône-Alpes|45.56|5.92|59490',
    'Bourg-en-Bresse|01053|01000|01|Ain|Auvergne-Rhône-Alpes|46.20|5.23|41527',
    'Roanne|42187|42300|42|Loire|Auvergne-Rhône-Alpes|46.04|4.07|34366',
    'Bordeaux|33063|33000|33|Gironde|Nouvelle-Aquitaine|44.84|-0.58|259809',
    'Limoges|87085|87000|87|Haute-Vienne|Nouvelle-Aquitaine|45.83|1.26|130876',
    'Poitiers|86194|86000|86|Vienne|Nouvelle-Aquitaine|46.58|0.34|88291',
    'Pau|64445|64000|64|Pyrénées-Atlantiques|Nouvelle-Aquitaine|43.30|-0.37|77215',
    'La Rochelle|17300|17000|17|Charente-Maritime|Nouvelle-Aquitaine|46.16|-1.15|77205',
    'Mérignac|33281|33700|33|Gironde|Nouvelle-Aquitaine|44.84|-0.65|71322',
    'Niort|79191|79000|79|Deux-Sèvres|Nouvelle-Aquitaine|46.32|-0.46|58707',
    'Bayonne|64102|64100|64|Pyrénées-Atlantiques|Nouvelle-Aquitaine|43.49|-1.48|51894',
    'Angoulême|16015|16000|16|Charente|Nouvelle-Aquitaine|45.65|0.16|41740',
    'Agen|47001|47000|47|Lot-et-Garonne|Nouvelle-Aquitaine|44.20|0.62|32485',
    'Périgueux|24322|24000|24|Dordogne|Nouvelle-Aquitaine|45.18|0.72|29958',
    'Toulouse|31555|31000|31|Haute-Garonne|Occitanie|43.60|1.44|493465',
    'Montpellier|34172|34000|34|Hérault|Occitanie|43.61|3.88|295542',
    'Nîmes|30189|30000|30|Gard|Occitanie|43.84|4.36|148561',
    'Perpignan|66136|66000|66|Pyrénées-Orientales|Occitanie|42.70|2.90|119656',
    'Béziers|34032|34500|34|Hérault|Occitanie|43.34|3.22|78116',
    'Montauban|82121|82000|82|Tarn-et-Garonne|Occitanie|44.02|1.35|60810',
    'Narbonne|11262|11100|11|Aude|Occitanie|43.18|3.00|55516',
    'Albi|81004|81000|81|Tarn|Occitanie|43.93|2.15|49531',
    'Carcassonne|11069|11000|11|Aude|Occitanie|43.21|2.35|47068',
    'Sète|34301|34200|34|Hérault|Occitanie|43.40|3.70|43000',
    'Tarbes|65440|65000|65|Hautes-Pyrénées|Occitanie|43.23|0.07|40600',
    'Rodez|12202|12000|12|Aveyron|Occitanie|44.35|2.57|24000',
    'Marseille|13055|13001|13|Bouches-du-Rhône|Provence-Alpes-Côte d’Azur|43.30|5.37|873076',
    'Nice|06088|06000|06|Alpes-Maritimes|Provence-Alpes-Côte d’Azur|43.71|7.26|342669',
    'Toulon|83137|83000|83|Var|Provence-Alpes-Côte d’Azur|43.12|5.93|176198',
    'Aix-en-Provence|13001|13100|13|Bouches-du-Rhône|Provence-Alpes-Côte d’Azur|43.53|5.45|143097',
    'Avignon|84007|84000|84|Vaucluse|Provence-Alpes-Côte d’Azur|43.95|4.81|91729',
    'Cannes|06029|06400|06|Alpes-Maritimes|Provence-Alpes-Côte d’Azur|43.55|7.02|74152',
    'Antibes|06004|06600|06|Alpes-Maritimes|Provence-Alpes-Côte d’Azur|43.58|7.13|72999',
    'Fréjus|83061|83600|83|Var|Provence-Alpes-Côte d’Azur|43.43|6.74|54023',
    'Arles|13004|13200|13|Bouches-du-Rhône|Provence-Alpes-Côte d’Azur|43.68|4.63|52439',
    'Salon-de-Provence|13103|13300|13|Bouches-du-Rhône|Provence-Alpes-Côte d’Azur|43.64|5.10|45528',
    'Grasse|06069|06130|06|Alpes-Maritimes|Provence-Alpes-Côte d’Azur|43.66|6.92|50396',
    'Gap|05061|05000|05|Hautes-Alpes|Provence-Alpes-Côte d’Azur|44.56|6.08|40895',
    'Ajaccio|2A004|20000|2A|Corse-du-Sud|Corse|41.93|8.74|71361',
    'Bastia|2B033|20200|2B|Haute-Corse|Corse|42.70|9.45|48280'
];

/** Les communes, prêtes à l'emploi : un objet par ligne du référentiel ci-dessus. */
export const COMMUNES = COMMUNES_BRUTES.map(ligne => {
    const parties = ligne.split('|');
    return {
        nom: parties[0],
        codeInsee: parties[1],
        codePostal: parties[2],
        departement: parties[3],
        nomDepartement: parties[4],
        region: parties[5],
        latitude: Number(parties[6]),
        longitude: Number(parties[7]),
        population: Number(parties[8])
    };
});

export const PRENOMS_FEMININS = [
    'Marie',
    'Nathalie',
    'Isabelle',
    'Sylvie',
    'Catherine',
    'Christine',
    'Sandrine',
    'Valérie',
    'Céline',
    'Julie',
    'Émilie',
    'Laure',
    'Camille',
    'Chloé',
    'Manon',
    'Léa',
    'Sarah',
    'Inès',
    'Amandine',
    'Aurélie',
    'Delphine',
    'Élodie',
    'Fanny',
    'Hélène',
    'Karine',
    'Lucie',
    'Marion',
    'Pauline',
    'Sophie',
    'Virginie'
];
export const PRENOMS_MASCULINS = [
    'Jean',
    'Pierre',
    'Michel',
    'Philippe',
    'Alain',
    'Nicolas',
    'Christophe',
    'Laurent',
    'Sébastien',
    'Julien',
    'David',
    'Thomas',
    'Olivier',
    'Vincent',
    'Antoine',
    'Maxime',
    'Guillaume',
    'Romain',
    'Alexandre',
    'Fabien',
    'Benoît',
    'Cédric',
    'Damien',
    'Émile',
    'Franck',
    'Grégory',
    'Hugo',
    'Jérôme',
    'Ludovic',
    'Mathieu'
];
export const NOMS_DE_FAMILLE = [
    'Martin',
    'Bernard',
    'Dubois',
    'Thomas',
    'Robert',
    'Richard',
    'Petit',
    'Durand',
    'Leroy',
    'Moreau',
    'Simon',
    'Laurent',
    'Lefebvre',
    'Michel',
    'Garcia',
    'David',
    'Bertrand',
    'Roux',
    'Vincent',
    'Fournier',
    'Morel',
    'Girard',
    'André',
    'Lefèvre',
    'Mercier',
    'Dupont',
    'Lambert',
    'Bonnet',
    'François',
    'Martinez',
    'Legrand',
    'Garnier',
    'Faure',
    'Rousseau',
    'Blanc',
    'Guérin',
    'Muller',
    'Henry',
    'Roussel',
    'Nicolas',
    'Perrin',
    'Morin',
    'Mathieu',
    'Clément',
    'Gauthier',
    'Dumont',
    'Lopez',
    'Fontaine',
    'Chevalier',
    'Robin'
];

export const FORMES_JURIDIQUES = ['SAS', 'SARL', 'SA', 'EURL', 'SCOP', 'SASU'];
export const MOTS_ENSEIGNE = [
    'Atlantique',
    'Provence',
    'Horizon',
    'Boréal',
    'Cristal',
    'Comptoir',
    'Manufacture',
    'Ateliers',
    'Distribution',
    'Logistique',
    'Services',
    'Énergie',
    'Maritime',
    'Cévennes',
    'Vallée',
    'Grand Large',
    'Sillon',
    'Pyrénées',
    'Nord Ouest',
    'Aurore',
    'Prisme',
    'Vertigo',
    'Solstice',
    'Alizé',
    'Escale',
    'Tramontane',
    'Belvédère'
];
export const MOTS_METIER = [
    'Transports',
    'Négoce',
    'Industries',
    'Distribution',
    'Solutions',
    'Conseil',
    'Bâtiment',
    'Agroalimentaire',
    'Papeterie',
    'Électricité',
    'Mobilier',
    'Matériaux',
    'Équipements',
    'Maintenance',
    'Emballages'
];
export const RUES = [
    'rue de la République',
    'avenue Jean Jaurès',
    'boulevard Victor Hugo',
    'rue des Acacias',
    'place du Marché',
    'chemin des Vignes',
    'rue Pasteur',
    'avenue de la Gare',
    'impasse des Lilas',
    'route de Bordeaux',
    'rue du Commerce',
    'allée des Peupliers',
    'quai des Docks',
    'rue de l’Industrie',
    'avenue du Général Leclerc'
];

/** Vocabulaire commercial : ces listes deviennent des listes de valeurs dans la gouvernance. */
export const SEGMENTS = ['Grands comptes', 'PME', 'TPE', 'Collectivité', 'Particulier'];
export const STATUTS_CLIENT = ['ACTIF', 'INACTIF', 'PROSPECT', 'RESILIE'];
export const STATUTS_HORS_LISTE = ['ACTIVE', 'actif', 'EN COURS', 'A CONFIRMER'];
export const TYPES_CLIENT = ['PRO', 'PART'];
export const CANAUX_VENTE = ['Web', 'Téléphone', 'Agence', 'Partenaire', 'Appel d’offres'];
export const STATUTS_COMMANDE = ['enregistrée', 'validée', 'expédiée', 'livrée', 'annulée'];
export const TYPES_SITE = ['Siège', 'Agence', 'Entrepôt', 'Usine', 'Point de vente'];
export const SERVICES_CONTACT = ['Direction', 'Achats', 'Comptabilité', 'Technique', 'Logistique', 'Qualité', 'Commercial'];
export const FONCTIONS_CONTACT = [
    'Directeur général',
    'Responsable achats',
    'Comptable',
    'Chef de projet',
    'Responsable logistique',
    'Technicien de maintenance',
    'Assistant de direction',
    'Responsable qualité',
    'Acheteur',
    'Gestionnaire de flux'
];
export const SOURCES_ACQUISITION = ['Salon', 'Site web', 'Recommandation', 'Prospection', 'Partenaire', 'Reprise historique'];
export const MODES_REGLEMENT = ['Virement', 'Prélèvement', 'Carte', 'Chèque'];
export const STATUTS_REGLEMENT = ['payée', 'en attente', 'en retard', 'litige'];
export const CATEGORIES_TICKET = ['Livraison', 'Facturation', 'Produit défectueux', 'Demande d’information', 'Réclamation', 'Retour'];
export const PRIORITES_TICKET = ['basse', 'normale', 'haute', 'critique'];
export const CANAUX_TICKET = ['Téléphone', 'Courriel', 'Formulaire web', 'Agence'];

/** Familles de produits : chacune donne son intervalle de prix et ses sous-familles. */
export const FAMILLES_PRODUITS = [
    { famille: 'Emballage', sousFamilles: ['Carton', 'Film', 'Palette'], prixMinimum: 2, prixMaximum: 45 },
    { famille: 'Papeterie', sousFamilles: ['Papier', 'Écriture', 'Classement'], prixMinimum: 1, prixMaximum: 30 },
    { famille: 'Mobilier', sousFamilles: ['Bureau', 'Rangement', 'Siège'], prixMinimum: 60, prixMaximum: 950 },
    { famille: 'Informatique', sousFamilles: ['Périphérique', 'Réseau', 'Consommable'], prixMinimum: 15, prixMaximum: 1800 },
    { famille: 'Entretien', sousFamilles: ['Nettoyage', 'Hygiène', 'Protection'], prixMinimum: 3, prixMaximum: 120 },
    { famille: 'Outillage', sousFamilles: ['Main', 'Électroportatif', 'Mesure'], prixMinimum: 8, prixMaximum: 600 }
];

/** Agences du réseau commercial : la ville renvoie au référentiel des communes. */
export const AGENCES = [
    { id: 'AG-IDF', libelle: 'Agence Île-de-France', commune: 'Paris' },
    { id: 'AG-NORD', libelle: 'Agence Nord', commune: 'Lille' },
    { id: 'AG-EST', libelle: 'Agence Est', commune: 'Strasbourg' },
    { id: 'AG-OUEST', libelle: 'Agence Ouest', commune: 'Nantes' },
    { id: 'AG-BRET', libelle: 'Agence Bretagne', commune: 'Rennes' },
    { id: 'AG-NORM', libelle: 'Agence Normandie', commune: 'Rouen' },
    { id: 'AG-CENTRE', libelle: 'Agence Centre', commune: 'Tours' },
    { id: 'AG-BFC', libelle: 'Agence Bourgogne-Franche-Comté', commune: 'Dijon' },
    { id: 'AG-ARA', libelle: 'Agence Auvergne-Rhône-Alpes', commune: 'Lyon' },
    { id: 'AG-NAQ', libelle: 'Agence Nouvelle-Aquitaine', commune: 'Bordeaux' },
    { id: 'AG-OCC', libelle: 'Agence Occitanie', commune: 'Toulouse' },
    { id: 'AG-PACA', libelle: 'Agence Provence', commune: 'Marseille' }
];

/** Retrouve une commune par son nom (les agences et les sites suivis s'y réfèrent). */
export function communeNommee(nom) {
    const commune = COMMUNES.find(candidate => candidate.nom === nom);
    if (!commune) throw new Error(`Commune inconnue dans le référentiel : ${nom}`);
    return commune;
}
