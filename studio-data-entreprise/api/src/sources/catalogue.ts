// Ce que l'entrepôt sait déjà de lui-même.
//
// Avant de demander quoi que ce soit à quelqu'un, on lit le catalogue : les schémas, les
// tables, les colonnes et leurs types, et les liens DÉCLARÉS entre tables. Tout cela est
// gratuit et exact — c'est l'entrepôt qui le dit.
//
// Ce que le catalogue ne donne pas, ce sont les liens que personne n'a déclarés. Dans un
// entrepôt, c'est le cas le plus fréquent : les clés étrangères y sont facultatives et
// souvent absentes. Ces liens-là se devineront à partir des données, puis se valideront à
// la main — c'est l'étape suivante.
//
// Les requêtes ci-dessous n'emploient que `information_schema`, commun à PostgreSQL et à
// Redshift : elles se vérifient donc sur un vrai moteur sans entrepôt sous la main.
import type { SourceInterrogeable } from './connexion-redshift.js';

export interface Schema {
    nom: string;
}
export interface TableDuCatalogue {
    schema: string;
    nom: string;
    genre: 'table' | 'vue';
}
export interface ColonneDuCatalogue {
    table: string;
    nom: string;
    type: string;
    obligatoire: boolean;
    rang: number;
}
export interface LienDeclare {
    tableQuiPointe: string;
    colonneQuiPointe: string;
    tablePointee: string;
    colonnePointee: string;
    nomDeLaContrainte: string;
}

/** Les schémas visibles, hors schémas techniques du moteur. */
export async function listerLesSchemas(source: SourceInterrogeable): Promise<Schema[]> {
    const lignes = await source.interroger<{ nom: string }>(
        `SELECT schema_name AS nom
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_internal', 'catalog_history')
           AND schema_name NOT LIKE 'pg\\_%'
         ORDER BY 1`
    );
    return lignes.map(ligne => ({ nom: ligne.nom }));
}

/** Les tables et les vues d'un schéma. */
export async function listerLesTables(source: SourceInterrogeable, schema: string): Promise<TableDuCatalogue[]> {
    const lignes = await source.interroger<{ nom: string; genre: string }>(
        `SELECT table_name AS nom, table_type AS genre
         FROM information_schema.tables
         WHERE table_schema = $1
         ORDER BY 1`,
        [schema]
    );
    return lignes.map(ligne => ({
        schema,
        nom: ligne.nom,
        genre: ligne.genre === 'VIEW' ? 'vue' : 'table'
    }));
}

/** Les colonnes d'un schéma, rangées par table puis dans l'ordre de la table. */
export async function listerLesColonnes(source: SourceInterrogeable, schema: string): Promise<ColonneDuCatalogue[]> {
    const lignes = await source.interroger<{
        table: string;
        nom: string;
        type: string;
        acceptevide: string;
        rang: number;
    }>(
        `SELECT table_name AS table, column_name AS nom, data_type AS type,
                is_nullable AS acceptevide, ordinal_position AS rang
         FROM information_schema.columns
         WHERE table_schema = $1
         ORDER BY table_name, ordinal_position`,
        [schema]
    );
    return lignes.map(ligne => ({
        table: ligne.table,
        nom: ligne.nom,
        type: ligne.type,
        obligatoire: ligne.acceptevide === 'NO',
        rang: Number(ligne.rang)
    }));
}

/**
 * Les liens que le catalogue DÉCLARE. Dans un entrepôt, cette liste est souvent vide ou
 * très incomplète : ce n'est pas une anomalie, c'est la règle. Le nombre renvoyé ici dit
 * donc surtout combien de liens il restera à retrouver autrement.
 */
export async function listerLesLiensDeclares(source: SourceInterrogeable, schema: string): Promise<LienDeclare[]> {
    const lignes = await source.interroger<{
        contrainte: string;
        tablequipointe: string;
        colonnequipointe: string;
        tablepointee: string;
        colonnepointee: string;
    }>(
        `SELECT contraintes.constraint_name  AS contrainte,
                contraintes.table_name       AS tablequipointe,
                colonnes.column_name         AS colonnequipointe,
                visees.table_name            AS tablepointee,
                visees.column_name           AS colonnepointee
         FROM information_schema.table_constraints AS contraintes
         JOIN information_schema.key_column_usage AS colonnes
           ON colonnes.constraint_name = contraintes.constraint_name
          AND colonnes.table_schema = contraintes.table_schema
         JOIN information_schema.constraint_column_usage AS visees
           ON visees.constraint_name = contraintes.constraint_name
          AND visees.table_schema = contraintes.table_schema
         WHERE contraintes.constraint_type = 'FOREIGN KEY'
           AND contraintes.table_schema = $1
         ORDER BY 2, 3`,
        [schema]
    );
    return lignes.map(ligne => ({
        tableQuiPointe: ligne.tablequipointe,
        colonneQuiPointe: ligne.colonnequipointe,
        tablePointee: ligne.tablepointee,
        colonnePointee: ligne.colonnepointee,
        nomDeLaContrainte: ligne.contrainte
    }));
}

export interface ApercuDuSchema {
    schema: string;
    tables: TableDuCatalogue[];
    colonnes: ColonneDuCatalogue[];
    liensDeclares: LienDeclare[];
}

/** Tout ce que le catalogue dit d'un schéma, en une fois. */
export async function lireLeSchema(source: SourceInterrogeable, schema: string): Promise<ApercuDuSchema> {
    return {
        schema,
        tables: await listerLesTables(source, schema),
        colonnes: await listerLesColonnes(source, schema),
        liensDeclares: await listerLesLiensDeclares(source, schema)
    };
}

/** Le nombre de colonnes de chaque table, pour un affichage de synthèse. */
export function compterLesColonnesParTable(apercu: ApercuDuSchema): Map<string, number> {
    const compte = new Map<string, number>();
    for (const colonne of apercu.colonnes) {
        compte.set(colonne.table, (compte.get(colonne.table) ?? 0) + 1);
    }
    return compte;
}
