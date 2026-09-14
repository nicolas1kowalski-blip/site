/**
 * Décrire une information sans partir de zéro — repris de la V13 de l'application classique.
 *
 * Deux idées, et rien de plus :
 *   • **proposer avant de demander** : à partir du nom d'une colonne, on devine un nom lisible (« dt_naiss »
 *     devient « Date naissance ») et une définition plausible (« Date de naissance de la personne. ») ;
 *     si la même information est déjà définie ailleurs, c'est cette définition-là qu'on propose, pas une devinette ;
 *   • **dire où on en est** : une fiche d'information répond à quatre questions (c'est quoi, d'où ça vient,
 *     qui s'en sert, des exemples). La jauge dit le pourcentage atteint et quelle question reste à remplir.
 *
 * Rien n'est écrit sans validation : ces fonctions ne font que proposer.
 *
 * Fonctions pures : aucun accès au réseau ni au DOM.
 */
import type { AttributObjetMetier, ObjetMetier } from '../../coeur/modeles';

/** Abréviations courantes des noms de colonnes, développées pour retrouver un mot lisible. */
export const ABREVIATIONS: Record<string, string> = {
    id: 'identifiant',
    ident: 'identifiant',
    num: 'numéro',
    no: 'numéro',
    nb: 'nombre',
    mt: 'montant',
    mnt: 'montant',
    lib: 'libellé',
    libelle: 'libellé',
    adr: 'adresse',
    tel: 'téléphone',
    cp: 'code postal',
    dt: 'date',
    dte: 'date',
    deb: 'début',
    fin: 'fin',
    naiss: 'naissance',
    cli: 'client',
    clt: 'client',
    ctr: 'contrat',
    prd: 'produit',
    qte: 'quantité',
    qty: 'quantité',
    px: 'prix',
    pu: 'prix unitaire',
    ttc: 'TTC',
    ht: 'HT',
    tva: 'TVA',
    dev: 'devise',
    stat: 'statut',
    typ: 'type',
    cat: 'catégorie',
    desc: 'description',
    ref: 'référence',
    maj: 'mise à jour',
    modif: 'modification',
    crea: 'création',
    creat: 'création',
    usr: 'utilisateur',
    util: 'utilisateur',
    soc: 'société',
    ste: 'société',
    rs: 'raison sociale',
    mail: 'e-mail',
    email: 'e-mail'
};

/** Définitions proposées selon ce que le nom évoque ; « {objet} » est remplacé par le nom de l'objet. */
export const DEFINITIONS_DEVINEES: { motif: RegExp; texte: string }[] = [
    { motif: /identifiant|^id$|_id$|^id_|numero|numéro|^num/, texte: 'Identifiant unique qui permet de retrouver {objet} sans ambiguïté.' },
    { motif: /naissance/, texte: 'Date de naissance de la personne.' },
    { motif: /e-mail|mail/, texte: 'Adresse électronique de contact.' },
    { motif: /t[ée]l[ée]phone/, texte: 'Numéro de téléphone de contact.' },
    { motif: /code postal/, texte: "Code postal de l'adresse." },
    { motif: /adresse/, texte: 'Adresse postale.' },
    { motif: /ville/, texte: "Commune de l'adresse." },
    { motif: /pays/, texte: "Pays de l'adresse ou de résidence." },
    { motif: /raison sociale/, texte: "Nom légal de l'entreprise." },
    { motif: /pr[ée]nom/, texte: 'Prénom de la personne.' },
    { motif: /^nom/, texte: "Nom de la personne ou de l'entité." },
    { motif: /siret/, texte: "Numéro SIRET de l'établissement (14 chiffres)." },
    { motif: /siren/, texte: "Numéro SIREN de l'entreprise (9 chiffres)." },
    { motif: /iban/, texte: 'Identifiant bancaire international du compte.' },
    { motif: /montant.*ttc/, texte: 'Montant toutes taxes comprises.' },
    { motif: /montant.*ht/, texte: 'Montant hors taxes.' },
    { motif: /montant|prix|prime|total/, texte: "Montant en devise, tel qu'il figure dans le système source." },
    { motif: /date.*(début|debut|effet)/, texte: 'Date à partir de laquelle {objet} prend effet.' },
    { motif: /date.*(fin|échéance|echeance|terme)/, texte: 'Date à laquelle {objet} prend fin.' },
    { motif: /date.*(création|creation)/, texte: "Date de création de l'enregistrement dans le système." },
    { motif: /date.*(mise à jour|modification)/, texte: "Date de la dernière modification de l'enregistrement." },
    { motif: /date/, texte: 'Date associée à {objet}.' },
    { motif: /statut|état|etat/, texte: 'État actuel de {objet} (par exemple actif, résilié, en attente).' },
    { motif: /type|catégorie|categorie|nature/, texte: 'Catégorie qui classe {objet}.' },
    { motif: /quantité/, texte: "Nombre d'unités." },
    { motif: /devise/, texte: 'Monnaie dans laquelle les montants sont exprimés.' },
    { motif: /tva/, texte: 'Taux ou montant de TVA appliqué.' },
    { motif: /libellé|description|commentaire/, texte: 'Texte libre qui décrit {objet}.' },
    { motif: /code/, texte: 'Code court qui identifie une valeur de référence (voir les listes de valeurs).' }
];

/** Le nom d'une colonne rendu lisible : « dt_naiss » → « Date naissance », « idClient » → « Identifiant client ». */
export function humaniser(colonne: string): string {
    const mots = String(colonne || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_\-.]+/g, ' ')
        .trim()
        .toLowerCase()
        .split(' ')
        .map(mot => ABREVIATIONS[mot] || mot);
    const texte = mots.join(' ').trim();
    return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** Le nom d'objet qu'évoque un nom de fichier : « tb_clients.csv » → « Client ». */
export function nomDObjet(nomTable: string): string {
    const sansExtension = String(nomTable || '')
        .replace(/\.(csv|xlsx?|txt|parquet|json|ndjson)$/i, '')
        .replace(/^(tb|tbl|t|ref|dim|fact|src)_/i, '');
    const lisible = humaniser(sansExtension).replace(/(\w+)s$/, '$1');
    return lisible.charAt(0).toUpperCase() + lisible.slice(1);
}

/** Une définition plausible d'après le nom, ou une chaîne vide quand rien ne s'en dégage. */
export function definitionDevinee(nom: string, nomObjet = ''): string {
    const texte = String(nom || '').toLowerCase();
    const trouvee = DEFINITIONS_DEVINEES.find(candidate => candidate.motif.test(texte));
    if (!trouvee) return '';
    return trouvee.texte.replace('{objet}', nomObjet ? `un(e) ${nomObjet.toLowerCase()}` : "l'objet");
}

/** Deux noms d'information désignent la même chose quand ils ne diffèrent que par la casse ou la ponctuation. */
export function memeNom(premier: string, second: string): boolean {
    const reduire = (texte: string) =>
        String(texte || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    return reduire(premier) === reduire(second);
}

/** Une définition déjà écrite ailleurs pour la même information : mieux qu'une devinette. */
export function definitionDejaEcrite(
    objets: ObjetMetier[],
    nom: string,
    objetExclu = ''
): { objet: ObjetMetier; attribut: AttributObjetMetier } | null {
    for (const objet of objets) {
        if (objet.id === objetExclu) continue;
        const attribut = objet.elements.find(candidat => memeNom(candidat.name, nom) && (candidat.definition || '').trim());
        if (attribut) return { objet, attribut };
    }
    return null;
}

/** Une des quatre questions auxquelles une fiche d'information doit répondre. */
export type ControleInformation = { question: string; conseil: string; section: 1 | 2 | 3; repondu: boolean };

/** Où en est une fiche : le pourcentage atteint, les quatre questions, et la prochaine à remplir. */
export type CompletudeInformation = { score: number; controles: ControleInformation[]; prochaine: ControleInformation | null };

/**
 * L'état d'une fiche d'information. Les quatre questions ont le même poids : ce n'est pas une note de
 * qualité, c'est une liste de choses à dire — et celle qui manque est nommée pour savoir où aller.
 */
export function completudeInformation(attribut: AttributObjetMetier): CompletudeInformation {
    const controles: ControleInformation[] = [
        {
            question: "C'est quoi ?",
            conseil: 'écrire la définition en langage courant',
            section: 1,
            repondu: Boolean((attribut.definition || '').trim())
        },
        {
            question: "D'où ça vient ?",
            conseil: 'indiquer la colonne du fichier qui porte la valeur',
            section: 2,
            repondu: (attribut.mappings || []).length > 0
        },
        {
            question: "Qui s'en sert ?",
            conseil: 'cocher au moins une application, un processus ou une restitution',
            section: 3,
            repondu: (attribut.usedBy || []).length > 0
        },
        {
            question: 'Des exemples ?',
            conseil: 'aller chercher des valeurs réelles dans le fichier',
            section: 1,
            repondu: Boolean((attribut.examples || '').trim())
        }
    ];
    const repondues = controles.filter(controle => controle.repondu).length;
    return {
        score: Math.round((100 * repondues) / controles.length),
        controles,
        prochaine: controles.find(controle => !controle.repondu) || null
    };
}

/** Le feu tricolore d'un objet : rouge sans responsable, vert bien documenté, orange entre les deux. */
export type FeuObjet = { couleur: 'rouge' | 'orange' | 'vert'; titre: string };

/** Un objet sans responsable est rouge quoi qu'il arrive : personne ne répond de sa définition. */
export function feuDeLObjet(objet: ObjetMetier, score: number): FeuObjet {
    if (!(objet.globalOwner || '').trim()) return { couleur: 'rouge', titre: 'Sans responsable' };
    if (score >= 80) return { couleur: 'vert', titre: `Documenté (${score} %)` };
    return { couleur: 'orange', titre: `Incomplet (${score} %)` };
}
