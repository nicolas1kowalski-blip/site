// Exécute le SQL généré par l'app sur un vrai DuckDB (npm i --no-save @duckdb/node-api).
import { DuckDBInstance } from '@duckdb/node-api';
const inst = await DuckDBInstance.create(':memory:'); const conn = await inst.connect();
const q = async s => (await (await conn.run(s)).getRows());
let pass=0, fail=0; const ok=(n,c)=>{ c?pass++:fail++; console.log(`${c?'✅':'❌'} ${n}`); };

// Table conçue : dédoublonnage clé identique / divergence conservée (normalisation format 'code')
await q(`CREATE TABLE "t_sA" AS SELECT *, row_number() OVER () __rn FROM (VALUES ('c1','Lib1'),('c2','Lib2')) v(CD,LB)`);
await q(`CREATE TABLE "t_sB" AS SELECT *, row_number() OVER () __rn FROM (VALUES ('C1','Lib1'),('C2','LibX')) v(CODE,LIB)`);
const inner = `SELECT * FROM (SELECT * FROM (
    SELECT 'SA' AS "SOURCE_ORIGINE", COALESCE(NULLIF(UPPER(TRIM(CAST("CD" AS VARCHAR))),''),CAST("CD" AS VARCHAR)) AS "Code", CAST("LB" AS VARCHAR) AS "Libellé" FROM "t_sA"
    UNION ALL SELECT 'SB', COALESCE(NULLIF(UPPER(TRIM(CAST("CODE" AS VARCHAR))),''),CAST("CODE" AS VARCHAR)), CAST("LIB" AS VARCHAR) FROM "t_sB"
  ) w QUALIFY row_number() OVER (PARTITION BY COALESCE(UPPER(TRIM(CAST("Code" AS VARCHAR))),''), md5(concat_ws(chr(1),COALESCE(CAST("Code" AS VARCHAR),chr(0)),COALESCE(CAST("Libellé" AS VARCHAR),chr(0)))) ORDER BY "SOURCE_ORIGINE")=1) f`;
const rows = await q(`SELECT "Code","Libellé" FROM (${inner}) ORDER BY "Code","Libellé"`);
ok('Table conçue: clé identique dédoublonnée', rows.filter(r=>r[0]==='C1').length===1);
ok('Table conçue: divergence conservée', rows.filter(r=>r[0]==='C2').length===2);

// Format date : non conforme comptée
await q(`CREATE TABLE "t_fmt" AS SELECT * FROM (VALUES ('01/02/2019'),('pas date'),('2019-03-01')) v(D)`);
const dn = `CAST(COALESCE(TRY_CAST(TRY_STRPTIME(TRIM(CAST("D" AS VARCHAR)),'%d/%m/%Y') AS DATE), TRY_CAST(TRY_STRPTIME(TRIM(CAST("D" AS VARCHAR)),'%Y-%m-%d') AS DATE)) AS VARCHAR)`;
const nc = await q(`SELECT SUM(CASE WHEN "D" IS NOT NULL AND TRIM(CAST("D" AS VARCHAR))<>'' AND ${dn} IS NULL THEN 1 ELSE 0 END)::BIGINT FROM "t_fmt"`);
ok('Format date: 1 non conforme', Number(nc[0][0])===1);

// Doublons hors clés techniques
await q(`CREATE TABLE "t_dup" AS SELECT * FROM (VALUES ('K1','Nom','V'),('K2','Nom','V'),('K3','Autre','W')) v(ID,NOM,VILLE)`);
const dk = `md5(concat_ws(chr(1),COALESCE(CAST("NOM" AS VARCHAR),chr(0)),COALESCE(CAST("VILLE" AS VARCHAR),chr(0))))`;
const d = await q(`SELECT (COUNT(*)-COUNT(DISTINCT ${dk}))::BIGINT FROM "t_dup"`);
ok('Doublons hors clé technique: 1', Number(d[0][0])===1);

// Clé composite d'un lien (V13.4) : une liste d'éléments rangés par groupe, un arbre qui les classe.
// E1 appartient à deux groupes ; joint sur le seul élément, l'arbre multiplie les lignes.
await q(`CREATE TABLE "t_elem" AS SELECT * FROM (VALUES ('E1','G1'),('E2','G1'),('E1','G2')) v(CODE,GROUPE)`);
await q(`CREATE TABLE "t_arbre" AS SELECT * FROM (VALUES ('E1','G1','atelier'),('E2','G1','atelier'),('E1','G2','entrepot')) v(ELEMENT,GROUPE,NIVEAU)`);
const nk = (g,d) => `UPPER(TRIM(CAST(${g} AS VARCHAR))) = UPPER(TRIM(CAST(${d} AS VARCHAR)))`;
const surLElement = nk('x1."ELEMENT"','x0."CODE"');
const avecLeGroupe = surLElement + ' AND ' + nk('x1."GROUPE"','x0."GROUPE"');
const compter = async on => Number((await q(`SELECT COUNT(*)::BIGINT FROM "t_elem" x0 LEFT JOIN "t_arbre" x1 ON ${on}`))[0][0]);
const sansLeGroupe = await compter(surLElement), avec = await compter(avecLeGroupe);
ok('Clé composite: sur le seul élément, 3 lignes deviennent 5 (E1 revient par groupe)', sansLeGroupe===5);
ok('Clé composite: avec le groupe dans la clé, une ligne par élément et par groupe', avec===3);
ok('Clé composite: le contrôle voit la multiplication (facteur 1,67) et la disparition', Math.round(100*sansLeGroupe/3)/100===1.67 && avec/3===1);
const niveaux = await q(`SELECT x0."CODE", x0."GROUPE", x1."NIVEAU" FROM "t_elem" x0 LEFT JOIN "t_arbre" x1 ON ${avecLeGroupe} ORDER BY 1,2`);
ok('Clé composite: chaque élément reçoit le niveau de son propre groupe', niveaux.map(r=>r.join('|')).join(' ; ')==='E1|G1|atelier ; E1|G2|entrepot ; E2|G1|atelier');

console.log(`\nSQL RÉEL : ${pass} réussis / ${fail} échoués`);
process.exit(fail?1:0);
