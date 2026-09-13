/**
 * Exports HTML des tableaux de bord (repris de l'application classique) : un tableau de bord autonome (tuiles avec
 * leurs valeurs calculées, sans aucun appel réseau) et le rapport global (indicateurs et seuils, dernier score
 * qualité, liste des tableaux). Fonctions pures qui rendent une page HTML complète.
 */
import { Alerte, ResultatTuile, TableauDeBord } from '../../coeur/modeles';

const echapper = (texte: unknown) =>
    String(texte ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
const nombre = (valeur: unknown) =>
    valeur === null || valeur === undefined ? '—' : Number(valeur).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const CELLULE = 'border-top:1px solid #e2e8f0;padding:6px 8px;font-size:12px';

function page(titre: string, corps: string): string {
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title></head><body style="font-family:system-ui;background:#f8fafc;margin:0;padding:24px;color:#0f172a">${corps}</body></html>`;
}

/** Une tuile en HTML : indicateur en gros, ou tableau des valeurs (barres en pourcentage du maximum). */
function tuileEnHtml(titre: string, resultat: ResultatTuile | undefined): string {
    let contenu: string;
    if (!resultat) contenu = '<p style="color:#94a3b8;font-size:12px">(non calculée)</p>';
    else if (resultat.erreur) contenu = `<p style="color:#dc2626;font-size:12px">${echapper(resultat.erreur)}</p>`;
    else if (resultat.valeur !== null && !resultat.lignes.length) {
        const couleur = resultat.statut === 'crit' ? '#dc2626' : resultat.statut === 'warn' ? '#d97706' : '#0369a1';
        contenu = `<div style="font-size:42px;font-weight:900;color:${couleur};text-align:center;padding:24px">${nombre(resultat.valeur)}</div>`;
    } else {
        const maximum = Math.max(1, ...resultat.lignes.map(ligne => Math.abs(ligne.v)));
        contenu =
            '<table style="width:100%;border-collapse:collapse;font:11px system-ui">' +
            resultat.lignes
                .map(
                    ligne =>
                        `<tr><td style="${CELLULE}">${echapper(ligne.d)}</td><td style="${CELLULE};text-align:right;font-weight:700">${nombre(ligne.v)}</td>` +
                        `<td style="${CELLULE};width:40%"><div style="height:8px;border-radius:4px;background:#4f46e5;width:${Math.round((100 * Math.abs(ligne.v)) / maximum)}%"></div></td></tr>`
                )
                .join('') +
            '</table>';
    }
    return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff"><div style="font:700 13px system-ui;color:#334155;margin-bottom:8px">${echapper(titre)}</div>${contenu}</div>`;
}

/** Tableau de bord autonome : titre, filtres globaux, une carte par tuile. */
export function htmlTableauDeBord(tableau: TableauDeBord, resultats: ResultatTuile[]): string {
    const filtres = (tableau.filters || [])
        .filter(filtre => filtre.col)
        .map(filtre => `${filtre.col} ${filtre.op} ${filtre.val || ''}`)
        .join(' · ');
    const tuiles = tableau.tiles
        .map(tuile =>
            tuileEnHtml(
                tuile.title,
                resultats.find(resultat => resultat.id === tuile.id)
            )
        )
        .join('');
    return page(
        tableau.name,
        `<h1 style="font-size:20px">📋 ${echapper(tableau.name)}</h1>` +
            `<p style="font-size:11px;color:#64748b">Exporté le ${new Date().toLocaleString('fr-FR')}${filtres ? ' · Filtres : ' + echapper(filtres) : ''} — généré par Studio Data, page autonome sans appel réseau.</p>` +
            `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">${tuiles}</div>`
    );
}

export type SyntheseRapport = {
    sources: number;
    regles: number;
    objetsMetier: number;
    preparations: number;
    scoreQualite: number | null;
    dateScore: string | null;
};

/** Rapport global : indicateurs et seuils, qualité, tableaux de bord. */
export function htmlRapportGlobal(alertes: Alerte[], tableaux: TableauDeBord[], synthese: SyntheseRapport): string {
    const icone = (statut: string) => (statut === 'crit' ? '⛔' : statut === 'warn' ? '⚠️' : statut === 'err' ? '❔' : '✅');
    const sectionAlertes = alertes.length
        ? `<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0"><tr><th style="${CELLULE};text-align:left">État</th><th style="${CELLULE};text-align:left">Tableau de bord</th><th style="${CELLULE};text-align:left">Indicateur</th><th style="${CELLULE};text-align:right">Valeur</th><th style="${CELLULE};text-align:right">Seuils</th></tr>` +
          alertes
              .map(
                  alerte =>
                      `<tr><td style="${CELLULE}">${icone(alerte.statut)}</td><td style="${CELLULE}">${echapper(alerte.tableau)}</td><td style="${CELLULE};font-weight:700">${echapper(alerte.indicateur)}</td>` +
                      `<td style="${CELLULE};text-align:right;font-weight:700">${alerte.valeur === null ? echapper(alerte.erreur || '—') : nombre(alerte.valeur)}</td>` +
                      `<td style="${CELLULE};text-align:right;color:#94a3b8">${alerte.sens === 'min' ? '≤' : '≥'}${alerte.thWarn ? ' ⚠ ' + echapper(alerte.thWarn) : ''}${alerte.thCrit ? ' ⛔ ' + echapper(alerte.thCrit) : ''}</td></tr>`
              )
              .join('') +
          '</table>'
        : '<p style="color:#94a3b8;font-size:12px">Aucun indicateur avec seuil défini.</p>';
    const couleurScore = (synthese.scoreQualite ?? 0) >= 90 ? '#059669' : (synthese.scoreQualite ?? 0) >= 70 ? '#d97706' : '#dc2626';
    const sectionQualite =
        synthese.scoreQualite === null
            ? '<p style="color:#94a3b8;font-size:12px">Aucune exécution de règles — lancez-les dans Règles & score pour alimenter cette section.</p>'
            : `<p style="font-size:13px">Score global : <b style="font-size:20px;color:${couleurScore}">${synthese.scoreQualite} / 100</b> <span style="color:#94a3b8;font-size:11px">(dernier passage${synthese.dateScore ? ' du ' + new Date(synthese.dateScore).toLocaleString('fr-FR') : ''})</span></p>`;
    const sectionTableaux = tableaux.length
        ? `<ul style="font-size:12px;padding-left:18px">${tableaux.map(tableau => `<li style="margin-bottom:4px"><b>${echapper(tableau.name)}</b> — ${tableau.tiles.length} tuile(s)</li>`).join('')}</ul>`
        : '<p style="color:#94a3b8;font-size:12px">Aucun tableau de bord.</p>';
    return page(
        'Rapport Studio Data',
        `<h1 style="font-size:22px;margin:0">📄 Rapport de gouvernance & qualité</h1>` +
            `<p style="font-size:11px;color:#64748b">Généré le ${new Date().toLocaleString('fr-FR')} par Studio Data.</p>` +
            `<p style="font-size:12px;color:#334155">${synthese.sources} source(s) chargée(s) · ${synthese.regles} règle(s) qualité · ${synthese.objetsMetier} objet(s) métier · ${tableaux.length} tableau(x) de bord · ${synthese.preparations} préparation(s)</p>` +
            `<h2 style="font-size:15px;margin-top:22px">🔔 Indicateurs & seuils</h2>${sectionAlertes}` +
            `<h2 style="font-size:15px;margin-top:22px">📏 Qualité des données</h2>${sectionQualite}` +
            `<h2 style="font-size:15px;margin-top:22px">📋 Tableaux de bord</h2>${sectionTableaux}`
    );
}
