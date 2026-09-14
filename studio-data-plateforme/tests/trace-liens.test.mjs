/**
 * Tests du tracé des liens d'un graphe (web/src/app/composants/trace-liens.ts) : points d'attache répartis,
 * couloirs distincts, chemins à angles droits. Ce sont des fonctions pures, exécutées directement par Node
 * après retrait des types.
 *
 *   node --test --experimental-strip-types tests/trace-liens.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const racine = path.dirname(fileURLToPath(import.meta.url));
const { abscisseDuCouloir, cheminAAnglesDroits, ordonneeDAttache, pointsDAttache, surDesColonnesDistinctes } = await import(
    path.join(racine, '..', 'web', 'src', 'app', 'composants', 'trace-liens.ts')
);

const place = (abscisse, ordonnee, largeur = 120, hauteur = 60) => ({ x: abscisse, y: ordonnee, largeur, hauteur });
/** Un point du tracé, nommé pour la lisibilité des cas. */
const point = (abscisse, ordonnee) => ({ x: abscisse, y: ordonnee });

test('un seul lien : le point d’attache reste au milieu du côté', () => {
    assert.equal(ordonneeDAttache(place(0, 100), 0, 1), 100);
});

test('plusieurs liens : les points d’attache sont répartis sur la hauteur, jamais sur le bord', () => {
    const case_ = place(0, 100, 120, 60); // de 70 à 130, marge de 8 : de 78 à 122
    assert.equal(ordonneeDAttache(case_, 0, 3), 78);
    assert.equal(ordonneeDAttache(case_, 1, 3), 100);
    assert.equal(ordonneeDAttache(case_, 2, 3), 122);
});

test('une case très basse ne produit pas d’attaches hors de la case', () => {
    const minuscule = place(0, 50, 120, 10);
    for (const rang of [0, 1, 2]) {
        const ordonnee = ordonneeDAttache(minuscule, rang, 3);
        assert.ok(ordonnee >= 45 && ordonnee <= 55, `attache ${ordonnee} hors de la case`);
    }
});

test('les attaches suivent l’ordre vertical des destinations : les traits ne se croisent pas avant la case', () => {
    const places = { a: place(0, 100), haut: place(400, 20), bas: place(400, 300) };
    // Le lien vers le bas est déclaré en premier : il doit pourtant partir du point le plus bas.
    const liens = [
        { source: 'a', target: 'bas' },
        { source: 'a', target: 'haut' }
    ];
    const attaches = pointsDAttache(liens, places);
    assert.ok(attaches[0].yDepart > attaches[1].yDepart, 'le lien vers le bas part sous celui vers le haut');
});

test('deux liens vers la même case y arrivent sur deux points distincts', () => {
    const places = { a: place(0, 50), b: place(0, 250), cible: place(400, 150) };
    const attaches = pointsDAttache(
        [
            { source: 'a', target: 'cible' },
            { source: 'b', target: 'cible' }
        ],
        places
    );
    assert.notEqual(attaches[0].yArrivee, attaches[1].yArrivee);
});

test('un lien dont une extrémité est absente est ignoré, sans faire échouer les autres', () => {
    const places = { a: place(0, 50), b: place(400, 50) };
    const attaches = pointsDAttache(
        [
            { source: 'a', target: 'inconnue' },
            { source: 'a', target: 'b' }
        ],
        places
    );
    assert.equal(attaches.length, 2);
    assert.equal(attaches[1].yDepart, 50, 'le lien valide garde son attache');
});

test('couloirs : un lien seul passe au milieu, plusieurs se répartissent sans se superposer', () => {
    assert.equal(abscisseDuCouloir(100, 300, 0, 1), 200);
    const couloirs = [0, 1, 2].map(rang => abscisseDuCouloir(100, 300, rang, 3));
    assert.deepEqual(couloirs, [150, 200, 250]);
    assert.equal(new Set(couloirs).size, 3, 'trois verticales distinctes');
});

test('chemin à angles droits : sortie horizontale, couloir vertical, entrée horizontale, coins arrondis', () => {
    const trace = cheminAAnglesDroits(point(100, 50), point(300, 200), 200);
    assert.match(trace.chemin, /^M 100 50 L /, 'on sort de la case à l’horizontale');
    assert.match(trace.chemin, /L 300 200$/, 'on entre dans la case d’arrivée à l’horizontale');
    assert.match(trace.chemin, /Q 200 50/, 'premier coin arrondi sur le couloir');
    assert.match(trace.chemin, /Q 200 200/, 'second coin arrondi à la sortie du couloir');
    assert.equal(trace.milieuX, 200);
    assert.equal(trace.milieuY, 125);
});

test('chemin presque horizontal : pas d’arrondi qui mangerait le trait', () => {
    const trace = cheminAAnglesDroits(point(100, 50), point(300, 52), 200);
    assert.equal(trace.chemin, 'M 100 50 L 200 50 L 200 52 L 300 52');
    assert.doesNotMatch(trace.chemin, /Q /);
});

test('colonnes distinctes : deux cases côte à côte ne le sont pas, deux cases éloignées le sont', () => {
    assert.equal(surDesColonnesDistinctes(place(0, 0), place(130, 0)), false);
    assert.equal(surDesColonnesDistinctes(place(0, 0), place(400, 0)), true);
});
