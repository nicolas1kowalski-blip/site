import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// V9.1.1 — variantes de casse : l'ancien compteur (différence de deux approx_count_distinct) contre
// le nouveau (COUNT DISTINCT exact), sur un vrai DuckDB, et cohérence avec la requête de détail.
import { DuckDBInstance } from '/tmp/claude-0/-home-user-site/6a8ef729-be7c-5bb6-a832-2d8ac9119cd5/scratchpad/duck/node_modules/@duckdb/node-api/lib/index.js';
const inst = await DuckDBInstance.create(':memory:'); const conn = await inst.connect();
const q = async s => (await (await conn.run(s)).getRows());
let pass=0, fail=0; const ok=(n,c)=>{ c?pass++:fail++; console.log(`${c?'✅':'❌'} ${n}`); };
const src = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8');
ok('version 10.2.3', /V11_VERSION\s*:\s*'10\.2\.3'/.test(src) && src.includes("v: '10.2.3'"));
ok('le compteur ne dérive plus de deux estimations', !src.includes("caseDupGroups: Math.max(0, Number(colRow[`c${i}_distinct`]) - Number(colRow[`c${i}_ucnt`]") && src.includes("COUNT(DISTINCT CASE WHEN ${nb} THEN UPPER(${t2}) END))::BIGINT AS x${i}"));

// Colonne à forte cardinalité SANS variante de casse (identifiants), + colonne AVEC 2 vraies variantes.
await q(`CREATE TABLE t AS SELECT 'ID-' || md5(CAST(i AS VARCHAR)) AS ident,
   CASE WHEN i % 1000 = 0 THEN 'Paris' WHEN i % 1000 = 1 THEN 'PARIS' WHEN i % 1000 = 2 THEN 'lyon' WHEN i % 1000 = 3 THEN 'Lyon' ELSE 'Ville' || (i % 50) END AS ville
   FROM range(200000) r(i)`);
const T = `TRIM(CAST(ident AS VARCHAR))`, NB = `(${T} IS NOT NULL AND ${T} <> '')`;
const approx = await q(`SELECT (approx_count_distinct(CASE WHEN ${NB} THEN ${T} END) - approx_count_distinct(CASE WHEN ${NB} THEN UPPER(${T}) END))::BIGINT FROM t`);
console.log('   écart des deux estimations (ancien compteur) sur 200 000 identifiants :', Number(approx[0][0]));
const exact = await q(`SELECT (COUNT(DISTINCT CASE WHEN ${NB} THEN ${T} END) - COUNT(DISTINCT CASE WHEN ${NB} THEN UPPER(${T}) END))::BIGINT FROM t`);
ok('nouveau compteur exact = 0 sur la colonne sans variante', Number(exact[0][0])===0);
// requête de détail de l'application (même forme que dans qualInspect)
const detail = await q(`SELECT COUNT(*) FROM t WHERE ${NB} AND UPPER(${T}) IN (SELECT UPPER(${T}) FROM t WHERE ${NB} GROUP BY 1 HAVING COUNT(DISTINCT ${T}) > 1)`);
ok('détail : aucune ligne — cohérent avec 0', Number(detail[0][0])===0);
const T2 = `TRIM(CAST(ville AS VARCHAR))`, NB2 = `(${T2} IS NOT NULL AND ${T2} <> '')`;
const exact2 = await q(`SELECT (COUNT(DISTINCT CASE WHEN ${NB2} THEN ${T2} END) - COUNT(DISTINCT CASE WHEN ${NB2} THEN UPPER(${T2}) END))::BIGINT FROM t`);
ok('colonne avec Paris/PARIS et lyon/Lyon : 2 variantes exactes', Number(exact2[0][0])===2);
const detail2 = await q(`SELECT COUNT(*) FROM t WHERE ${NB2} AND UPPER(${T2}) IN (SELECT UPPER(${T2}) FROM t WHERE ${NB2} GROUP BY 1 HAVING COUNT(DISTINCT ${T2}) > 1)`);
ok('détail : 800 lignes concernées (4 valeurs × 200)', Number(detail2[0][0])===800);
// candidats : la passe exacte ne s'exécute que si l'estimation suggère un écart -> un vrai écart est toujours candidat
const approx2 = await q(`SELECT approx_count_distinct(CASE WHEN ${NB2} THEN ${T2} END)::BIGINT, approx_count_distinct(CASE WHEN ${NB2} THEN UPPER(${T2}) END)::BIGINT FROM t`);
console.log('   estimations sur la colonne ville (distinct / distinct majuscule) :', Number(approx2[0][0]), '/', Number(approx2[0][1]), '— non fiables pour présélectionner : la passe exacte porte sur toutes les colonnes');
ok('la passe exacte porte sur toutes les colonnes (pas de présélection par estimation)', src.includes('const cands = targetHeaders.map((h, i) => i);'));
console.log(`\n${pass}/${pass+fail} OK`); process.exit(fail?1:0);
