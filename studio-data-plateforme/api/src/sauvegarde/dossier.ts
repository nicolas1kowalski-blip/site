/**
 * Dossier de gouvernance : un document HTML autonome (lisible hors ligne, imprimable) qui rassemble ce que
 * l'espace décrit — sources, objets métier et attributs, glossaire, applications et processus, périmètres,
 * listes de valeurs, personnes, règles de qualité, sensibilité. Fonction pure : reçoit les données, rend le HTML.
 */

export type DonneesDossier = {
    espace: string;
    genereLe: string;
    sources: { nom: string; type: string; colonnes: number; domaine: string; description: string; proprietaire: string }[];
    objets: {
        nom: string;
        definition: string;
        domaine: string;
        proprietaire: string;
        statut: string;
        attributs: { nom: string; definition: string; colonnes: string }[];
    }[];
    termes: { terme: string; definition: string; domaine: string }[];
    actifs: { nom: string; genre: string; responsable: string; domaine: string; criticite: string; description: string }[];
    perimetres: { nom: string; description: string; tables: string }[];
    listes: { nom: string; description: string; definition: string }[];
    personnes: { nom: string; email: string; roles: string }[];
    regles: { nom: string; source: string; colonne: string; type: string; criticite: string; taux: string }[];
    sensibilite: { niveau: string; colonnes: number }[];
};

const echapper = (valeur: unknown) =>
    String(valeur ?? '').replace(
        /[&<>"']/g,
        caractere => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caractere] || caractere
    );

function tableau(entetes: string[], lignes: string[][]): string {
    if (!lignes.length) return '<p class="vide">Aucun élément.</p>';
    return (
        `<table><thead><tr>${entetes.map(entete => `<th>${echapper(entete)}</th>`).join('')}</tr></thead><tbody>` +
        lignes.map(ligne => `<tr>${ligne.map(cellule => `<td>${echapper(cellule)}</td>`).join('')}</tr>`).join('') +
        '</tbody></table>'
    );
}

function section(titre: string, corps: string): string {
    return `<h2>${echapper(titre)}</h2>${corps}`;
}

const STYLE =
    'body{font-family:system-ui,sans-serif;max-width:960px;margin:0 auto;padding:30px;color:#0f172a}h1{font-size:26px}h2{font-size:17px;color:#312e81;border-bottom:2px solid #e0e7ff;padding-bottom:4px;margin:28px 0 10px}h3{font-size:14px;margin:16px 0 4px}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}th{text-align:left;background:#f1f5f9}th,td{padding:5px 6px;border:1px solid #e2e8f0;vertical-align:top}.discret{color:#64748b;font-weight:400;font-size:12px}.vide{color:#94a3b8;font-size:12px}@media print{body{padding:0}}';

/** Section 2 : un titre, une définition et le tableau des attributs par objet métier. */
function sectionObjetsMetier(objets: DonneesDossier['objets']): string {
    const corps = objets
        .map(
            objet =>
                `<h3>${echapper(objet.nom)} <span class="discret">${echapper(objet.domaine)} · ${echapper(objet.proprietaire || 'sans propriétaire')} · ${echapper(objet.statut || 'brouillon')}</span></h3>` +
                `<p>${echapper(objet.definition || 'Définition à écrire.')}</p>` +
                tableau(
                    ['Attribut', 'Définition', 'Colonnes techniques'],
                    objet.attributs.map(attribut => [attribut.nom, attribut.definition, attribut.colonnes])
                )
        )
        .join('');
    return section('2. Objets métier', corps || '<p class="vide">Aucun objet métier.</p>');
}

/** Sections 1, 3, 4 et 5 : sources, glossaire, applications, périmètres. */
function sectionsReferentiel(donnees: DonneesDossier): string[] {
    return [
        section(
            '1. Sources et tables',
            tableau(
                ['Nom', 'Type', 'Colonnes', 'Domaine', 'Propriétaire', 'Description'],
                donnees.sources.map(source => [
                    source.nom,
                    source.type,
                    String(source.colonnes),
                    source.domaine,
                    source.proprietaire,
                    source.description
                ])
            )
        ),
        sectionObjetsMetier(donnees.objets),
        section(
            '3. Glossaire',
            tableau(
                ['Terme', 'Définition', 'Domaine'],
                donnees.termes.map(terme => [terme.terme, terme.definition, terme.domaine])
            )
        ),
        section(
            '4. Applications, processus et restitutions',
            tableau(
                ['Nom', 'Genre', 'Responsable', 'Domaine', 'Criticité', 'Description'],
                donnees.actifs.map(actif => [actif.nom, actif.genre, actif.responsable, actif.domaine, actif.criticite, actif.description])
            )
        ),
        section(
            '5. Périmètres',
            tableau(
                ['Nom', 'Description', 'Tables'],
                donnees.perimetres.map(perimetre => [perimetre.nom, perimetre.description, perimetre.tables])
            )
        )
    ];
}

/** Sections 6 à 9 : listes de valeurs, personnes, règles de qualité, sensibilité. */
function sectionsControle(donnees: DonneesDossier): string[] {
    return [
        section(
            '6. Listes de valeurs',
            tableau(
                ['Nom', 'Description', 'Définition'],
                donnees.listes.map(liste => [liste.nom, liste.description, liste.definition])
            )
        ),
        section(
            '7. Personnes et rôles',
            tableau(
                ['Nom', 'Email', 'Rôles'],
                donnees.personnes.map(personne => [personne.nom, personne.email, personne.roles])
            )
        ),
        section(
            '8. Règles de qualité',
            tableau(
                ['Règle', 'Source', 'Colonne', 'Type', 'Criticité', 'Dernier taux'],
                donnees.regles.map(regle => [regle.nom, regle.source, regle.colonne, regle.type, regle.criticite, regle.taux])
            )
        ),
        section(
            '9. Sensibilité des colonnes',
            tableau(
                ['Niveau', 'Colonnes'],
                donnees.sensibilite.map(niveau => [niveau.niveau, String(niveau.colonnes)])
            )
        )
    ];
}

/** Le dossier complet, en HTML autonome. */
export function genererDossier(donnees: DonneesDossier): string {
    return (
        `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Dossier de gouvernance — ${echapper(donnees.espace)}</title>` +
        `<style>${STYLE}</style></head><body>` +
        `<h1>Dossier de gouvernance des données — ${echapper(donnees.espace)}</h1>` +
        `<p class="discret">Généré par Studio Data le ${echapper(donnees.genereLe)}.</p>` +
        [...sectionsReferentiel(donnees), ...sectionsControle(donnees)].join('') +
        '</body></html>'
    );
}
