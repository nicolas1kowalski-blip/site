/** Tests du cockpit : points d'attention, dernier audit, score, assemblage (fonctions pures). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assemblerCockpit, citer, dernierAudit, pointsAttention, scoreQualite } from '../src/cockpit/cockpit';

const maintenant = Date.parse('2026-09-13T12:00:00Z');
const sources = [
    { id: 'tb_a', name: 'clients.csv', type: 'csv', enregistreLe: '2026-09-12T00:00:00Z', lignes: 4, domaine: 'Ventes' },
    { id: 'tb_b', name: 'commandes.csv', type: 'csv', enregistreLe: '2026-08-01T00:00:00Z', lignes: 10, domaine: '' },
    { id: 'tb_c', name: 'Clients vue', type: 'designed', enregistreLe: '2026-08-01T00:00:00Z', lignes: null, domaine: '' }
];

test('citer : trois noms puis des points de suspension', () => {
    assert.equal(citer(['a', 'b']), 'a, b');
    assert.equal(citer(['a', 'b', 'c', 'd']), 'a, b, c…');
});

test('points d’attention : propriétaire manquant, table hors modèle, domaine absent, source ancienne', () => {
    const points = pointsAttention(
        sources,
        [{ sourceTable: 'tb_b', targetTable: 'tb_a' }],
        [{ name: 'Client' }, { name: 'Commande', globalOwner: 'Alice' }],
        maintenant
    );
    assert.deepEqual(
        points.map(point => [point.gravite, point.lien]),
        [
            ['alerte', '/objets-metier'],
            ['alerte', '/modele'],
            ['info', '/dictionnaire'],
            ['info', '/sources']
        ]
    );
    assert.match(points[0].message, /1 objet\(s\) métier sans propriétaire : Client/);
    assert.match(points[1].message, /Clients vue/);
    assert.match(points[2].message, /2 table\(s\) sans domaine/);
    assert.match(points[3].message, /1 source\(s\) non rafraîchie/, 'la table conçue ancienne ne compte pas comme source à rafraîchir');
});

test('points d’attention : rien à signaler quand tout est en ordre', () => {
    const points = pointsAttention([sources[0]], [], [], maintenant);
    assert.deepEqual(points, []);
});

test('dernier audit et score : le profilage le plus récent, le dernier passage de règles', () => {
    const audits = [
        { sourceNom: 'clients.csv', genre: 'regles', lanceLe: '2026-09-13T10:00:00Z', lignes: 4, resume: { score: 75 } },
        {
            sourceNom: 'clients.csv',
            genre: 'profilage',
            lanceLe: '2026-09-13T09:00:00Z',
            lignes: 4,
            resume: { completudeMoyenne: 0.917, doublonsExacts: 0 }
        }
    ];
    assert.deepEqual(dernierAudit(audits), { source: 'clients.csv', date: '2026-09-13T09:00:00Z', lignes: 4, completude: 92, doublons: 0 });
    assert.equal(scoreQualite(audits), 75);
    assert.equal(dernierAudit([]), null);
    assert.equal(scoreQualite([]), null);
});

test('assemblage : compteurs, volumétrie triée, lignes totales', () => {
    const cockpit = assemblerCockpit(sources, [], [], [], ['Ventes'], maintenant);
    assert.equal(cockpit.sources, 3);
    assert.equal(cockpit.lignes, 14);
    assert.deepEqual(
        cockpit.volumetrie.map(ligne => ligne.nom),
        ['commandes.csv', 'clients.csv'],
        'la table sans comptage est absente, la plus volumineuse en premier'
    );
    assert.equal(cockpit.domaines, 1);
});
