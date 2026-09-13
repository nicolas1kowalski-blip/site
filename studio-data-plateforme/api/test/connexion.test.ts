/** Tests du choix du chiffrement TLS de la connexion PostgreSQL (fonction pure, sans base). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { optionsTls } from '../src/base-de-donnees/connexion';

test('sans sslmode ni certificat : pas de TLS, URL inchangée', () => {
    const resultat = optionsTls('postgres://studio:mdp@localhost:5432/studio_data');
    assert.equal(resultat.tls, false);
    assert.equal(resultat.url, 'postgres://studio:mdp@localhost:5432/studio_data');
});

test('sslmode=require sans certificat : chiffré sans vérification, paramètre retiré de l’URL', () => {
    const resultat = optionsTls('postgres://studio:mdp@base.eu-west-3.rds.amazonaws.com:5432/studio_data?sslmode=require');
    assert.deepEqual(resultat.tls, { rejectUnauthorized: false });
    assert.equal(resultat.url, 'postgres://studio:mdp@base.eu-west-3.rds.amazonaws.com:5432/studio_data');
});

test('certificat d’autorité fourni : vérification stricte, même sans sslmode', () => {
    const resultat = optionsTls(
        'postgres://studio:mdp@base:5432/studio_data',
        '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----'
    );
    assert.deepEqual(resultat.tls, { rejectUnauthorized: true, ca: '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----' });
});

test('sslmode=disable : pas de TLS ; ssl=true : équivalent de require', () => {
    assert.equal(optionsTls('postgres://a:b@c/d?sslmode=disable').tls, false);
    assert.deepEqual(optionsTls('postgres://a:b@c/d?ssl=true').tls, { rejectUnauthorized: false });
});
