/**
 * Un exemple prêt à l'emploi : deux petites tables et une codification déjà réglée.
 *
 * Un module qu'on ne peut essayer que sur ses propres données est un module qu'on referme. Ici, un clic
 * installe une liste d'équipements telle qu'on la reçoit — des libellés écrits à la main, des abréviations
 * maison, un code déjà fourni sur une ligne — et la nomenclature en face. On lance, on voit ce qui est codé,
 * ce qui passe à la revue, ce qui manque ; et l'on comprend à quoi servent les réglages avant d'en avoir
 * besoin. Le jeu est volontairement petit : on doit pouvoir le lire en entier.
 */

/** Une table de l'exemple : son nom, ses colonnes, ses lignes. */
export type TableDExemple = { nom: string; colonnes: string[]; lignes: string[][] };

export const LISTE_DEXEMPLE: TableDExemple = {
    nom: 'equipements-exemple.csv',
    colonnes: ['REPERE', 'LIBELLE', 'FAMILLE', 'CODE_FOURNI'],
    lignes: [
        ['EQ001', 'Pompe centrifuge alimentaire', 'POMPES', ''],
        ['EQ002', 'POMPE  CENTRIFUGE (X2)', 'POMPES', ''],
        ['EQ003', 'Vanne papillon DN100', 'VANNES', ''],
        ['EQ004', 'Vanne DN80', 'VANNES', ''],
        ['EQ005', 'Échangeur à plaques', 'ECHANGEURS', 'ECH-P'],
        ['EQ006', 'Bidule non identifiable', 'POMPES', ''],
        ['EQ007', 'Pompe à vide', 'POMPES', ''],
        ['EQ008', 'Groupe motopompe centrif', 'POMPES', ''],
        ['EQ009', 'Electrovanne papillon DN50', 'VANNES', '']
    ]
};

export const NOMENCLATURE_DEXEMPLE: TableDExemple = {
    nom: 'nomenclature-exemple.csv',
    colonnes: ['FAMILLE', 'SYSTEME', 'SOUS_SYSTEME', 'LIBELLE_TYPE', 'CODE_TYPE'],
    lignes: [
        ['POMPES', 'Transfert', 'Centrifuge', 'Pompe centrifuge', 'PMP-C'],
        ['POMPES', 'Transfert', 'Volumetrique', 'Pompe volumetrique', 'PMP-V'],
        ['POMPES', 'Vide', 'Anneau liquide', 'Pompe a vide', 'PMP-A'],
        ['VANNES', 'Sectionnement', 'Quart de tour', 'Vanne papillon', 'VAN-P'],
        ['VANNES', 'Sectionnement', 'Quart de tour', 'Vanne a boisseau', 'VAN-B'],
        ['VANNES', 'Reglage', 'Lineaire', 'Vanne de reglage', 'VAN-R'],
        ['ECHANGEURS', 'Thermique', 'Plaques', 'Echangeur a plaques', 'ECH-P'],
        ['ECHANGEURS', 'Thermique', 'Tubulaire', 'Echangeur tubulaire', 'ECH-T']
    ]
};

/**
 * Ce que l'exemple montre, dans l'ordre où on le découvre. Chaque ligne du jeu illustre un mécanisme : c'est
 * la documentation, mais sur des données que l'on peut manipuler.
 */
export const CE_QUE_LEXEMPLE_MONTRE = [
    '« EQ005 » porte déjà son code : il est gardé tel quel, sans jamais être remis en cause.',
    '« Pompe centrifuge alimentaire » et « POMPE  CENTRIFUGE (X2) » sont codées malgré la casse, les accents, la ponctuation et les mots en trop.',
    '« Vanne DN80 » ne dit pas laquelle : elle passe à la revue, avec ses deux candidates. Tranchez-la, et le libellé sera retenu pour les prochaines fois.',
    '« Groupe motopompe centrif » n’est reconnue qu’une fois « motopompe » et « centrif » déclarés comme variantes.',
    '« Bidule non identifiable » ne ressemble à rien : c’est le cas qu’une règle de mots-clés doit attraper.'
];

/** Les variantes que l'exemple propose de déclarer : c'est l'étape suivante, une fois le premier résultat vu. */
export const SYNONYMES_DEXEMPLE = [
    { id: 'sy_exemple_1', motRetenu: 'POMPE', variantes: ['motopompe', 'groupe motopompe'], proche: false },
    { id: 'sy_exemple_2', motRetenu: 'CENTRIFUGE', variantes: ['centrif'], proche: true },
    { id: 'sy_exemple_3', motRetenu: 'VANNE', variantes: ['electrovanne'], proche: false }
];
