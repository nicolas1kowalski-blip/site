/**
 * Schéma PostgreSQL (Drizzle ORM).
 *
 * PostgreSQL porte tout ce qui est « référentiel » : utilisateurs, espaces de travail, sessions, documents de
 * configuration et de gouvernance, métadonnées des sources, journal d'audit. Les données analytiques
 * (contenu des sources) restent dans DuckDB, un fichier par espace.
 *
 * Les migrations SQL (dossier api/migrations) sont la source de vérité de la structure ; ce fichier doit
 * leur correspondre — c'est lui qui donne les types TypeScript aux requêtes.
 */
import { bigint, boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Comptes des personnes qui utilisent l'application. */
export const utilisateurs = pgTable('utilisateurs', {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Identifiant de connexion (unique, insensible à la casse par convention : stocké en minuscules). */
    identifiant: text('identifiant').notNull().unique(),
    nomAffiche: text('nom_affiche').notNull(),
    email: text('email'),
    /** Empreinte scrypt du mot de passe, format « scrypt$sel$empreinte » (voir authentification/mots-de-passe.ts). */
    motDePasseHache: text('mot_de_passe_hache').notNull(),
    /** administrateur : gère utilisateurs et espaces ; utilisateur : accès selon ses appartenances. */
    roleGlobal: text('role_global').notNull().default('utilisateur'),
    actif: boolean('actif').notNull().default(true),
    creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow()
});

/** Espace de travail : un jeu de sources, une gouvernance, une base DuckDB. Une équipe = un espace. */
export const espaces = pgTable('espaces', {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Code court utilisé dans les URL et les chemins de fichiers (minuscules, chiffres, tirets). */
    code: text('code').notNull().unique(),
    nom: text('nom').notNull(),
    creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow()
});

/** Appartenance d'un utilisateur à un espace, avec son rôle : lecteur, editeur ou administrateur. */
export const membres = pgTable(
    'membres',
    {
        espaceId: uuid('espace_id')
            .notNull()
            .references(() => espaces.id, { onDelete: 'cascade' }),
        utilisateurId: uuid('utilisateur_id')
            .notNull()
            .references(() => utilisateurs.id, { onDelete: 'cascade' }),
        role: text('role').notNull().default('lecteur')
    },
    table => [primaryKey({ columns: [table.espaceId, table.utilisateurId] })]
);

/** Sessions de connexion : l'identifiant (aléatoire) est dans le cookie du navigateur. */
export const sessions = pgTable(
    'sessions',
    {
        id: text('id').primaryKey(),
        utilisateurId: uuid('utilisateur_id')
            .notNull()
            .references(() => utilisateurs.id, { onDelete: 'cascade' }),
        /** Espace sur lequel l'utilisateur travaille actuellement (choisi dans l'interface). */
        espaceCourantId: uuid('espace_courant_id').references(() => espaces.id, { onDelete: 'set null' }),
        creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
        expireLe: timestamp('expire_le', { withTimezone: true }).notNull()
    },
    table => [index('sessions_utilisateur_index').on(table.utilisateurId)]
);

/**
 * Documents JSON d'un espace : l'état de l'application (appState : modèle, gouvernance, tables conçues…),
 * l'historique qualité, les sauvegardes de secours. Une clé = un document, remplacé en bloc.
 */
export const documents = pgTable(
    'documents',
    {
        espaceId: uuid('espace_id')
            .notNull()
            .references(() => espaces.id, { onDelete: 'cascade' }),
        cle: text('cle').notNull(),
        valeur: jsonb('valeur').notNull(),
        modifieLe: timestamp('modifie_le', { withTimezone: true }).notNull().defaultNow(),
        modifieParId: uuid('modifie_par_id').references(() => utilisateurs.id, { onDelete: 'set null' })
    },
    table => [primaryKey({ columns: [table.espaceId, table.cle] })]
);

/** Métadonnées d'une source (table DuckDB t_<id>) : nom, type, configuration de lecture, stockage, en-têtes… */
export const sources = pgTable(
    'sources',
    {
        /** Identifiant généré par le front (tb_xxxxxxxxx), aussi nom de la table DuckDB t_<id>. */
        id: text('id').notNull(),
        espaceId: uuid('espace_id')
            .notNull()
            .references(() => espaces.id, { onDelete: 'cascade' }),
        nom: text('nom').notNull(),
        type: text('type').notNull().default('csv'),
        stockage: text('stockage').notNull().default('table'),
        tailleOctets: bigint('taille_octets', { mode: 'number' }).notNull().default(0),
        enTetes: jsonb('en_tetes').notNull().default([]),
        /** Tout le reste du document envoyé par le front (config, fichier, xlsxSheet…), conservé tel quel. */
        metadonnees: jsonb('metadonnees').notNull().default({}),
        modifieLe: timestamp('modifie_le', { withTimezone: true }).notNull().defaultNow()
    },
    table => [primaryKey({ columns: [table.espaceId, table.id] })]
);

/** Journal d'audit : qui a fait quoi, sur quel espace, quand. */
export const journal = pgTable(
    'journal',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        espaceId: uuid('espace_id').references(() => espaces.id, { onDelete: 'set null' }),
        utilisateurId: uuid('utilisateur_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
        /** Action courte et stable (connexion, source.depot, document.ecriture, glossaire.modification…). */
        action: text('action').notNull(),
        /** Ce sur quoi porte l'action (nom de source, clé de document, identifiant…). */
        cible: text('cible'),
        details: jsonb('details'),
        horodatage: timestamp('horodatage', { withTimezone: true }).notNull().defaultNow()
    },
    table => [index('journal_espace_horodatage_index').on(table.espaceId, table.horodatage)]
);

/** Migrations SQL déjà appliquées (voir base-de-donnees/migrations.ts). */
export const migrationsAppliquees = pgTable('migrations_appliquees', {
    nom: text('nom').primaryKey(),
    appliqueeLe: timestamp('appliquee_le', { withTimezone: true }).notNull().defaultNow()
});

export type Utilisateur = typeof utilisateurs.$inferSelect;
export type Espace = typeof espaces.$inferSelect;
export type Membre = typeof membres.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type EntreeJournal = typeof journal.$inferSelect;

export type RoleGlobal = 'administrateur' | 'utilisateur';
export type RoleEspace = 'lecteur' | 'editeur' | 'administrateur';

/** Règle de qualité : une vérification sur une colonne (ou une source), avec sa criticité et son dernier résultat. */
export const reglesQualite = pgTable(
    'regles_qualite',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        espaceId: uuid('espace_id')
            .notNull()
            .references(() => espaces.id, { onDelete: 'cascade' }),
        nom: text('nom').notNull(),
        sourceId: text('source_id').notNull(),
        colonne: text('colonne').notNull().default(''),
        /** nonVide, unique, format, dansListe, plage, longueur, dateValide, reference (voir qualite/regles.ts). */
        type: text('type').notNull(),
        parametres: jsonb('parametres').notNull().default({}),
        /** bloquante (poids 3), majeure (2), mineure (1) : pondération du score. */
        criticite: text('criticite').notNull().default('majeure'),
        active: boolean('active').notNull().default(true),
        dernierResultat: jsonb('dernier_resultat'),
        modifieLe: timestamp('modifie_le', { withTimezone: true }).notNull().defaultNow()
    },
    table => [index('regles_qualite_espace_index').on(table.espaceId, table.sourceId)]
);

/** Audit de qualité enregistré : profilage, recherche de doublons ou exécution des règles sur une source. */
export const auditsQualite = pgTable(
    'audits_qualite',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        espaceId: uuid('espace_id')
            .notNull()
            .references(() => espaces.id, { onDelete: 'cascade' }),
        sourceId: text('source_id').notNull(),
        sourceNom: text('source_nom').notNull(),
        /** profilage | doublons | regles */
        genre: text('genre').notNull(),
        lanceLe: timestamp('lance_le', { withTimezone: true }).notNull().defaultNow(),
        lanceParId: uuid('lance_par_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
        lignes: bigint('lignes', { mode: 'number' }).notNull().default(0),
        /** Indicateurs de synthèse (complétude moyenne, doublons, score…) affichés dans l'historique. */
        resume: jsonb('resume').notNull().default({}),
        /** Résultat complet (par colonne, par règle) pour relecture. */
        detail: jsonb('detail').notNull().default({})
    },
    table => [index('audits_qualite_espace_index').on(table.espaceId, table.sourceId, table.lanceLe)]
);

export type RegleQualite = typeof reglesQualite.$inferSelect;
export type AuditQualite = typeof auditsQualite.$inferSelect;
