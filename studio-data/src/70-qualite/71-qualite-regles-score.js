        // ======================= E1/E2 (V2) : RÈGLES DE QUALITÉ DÉCLARATIVES & SCORE =======================
        // ---- V6.9 : compilateur d'EXPRESSION typée pour la règle « Cohérence (expression) » ----
        // Les sources sont chargées en TEXTE : comparer « [DATE_FIN] >= [DATE_DEBUT] » brut donnait une
        // comparaison LEXICOGRAPHIQUE (01/01/2024 « < » 31/12/2023 → faux positif) et comparer une colonne
        // à un nombre plantait (VARCHAR vs INTEGER). On compile donc chaque comparaison en essayant, dans
        // l'ordre : DATE (formats FR/ISO), puis NOMBRE (virgule/espaces), puis TEXTE.
        function qrTxtSql(x) {
            return `NULLIF(TRIM(CAST(${x} AS VARCHAR)), '')`;
        }
        function qrDateSql(x) {
            const t = `TRIM(CAST(${x} AS VARCHAR))`;
            return `COALESCE(TRY_CAST(TRY_STRPTIME(${t}, '%d/%m/%Y') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%Y-%m-%d') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%d-%m-%Y') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%d.%m.%Y') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%Y/%m/%d') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%d/%m/%Y %H:%M:%S') AS DATE), TRY_CAST(TRY_STRPTIME(${t}, '%Y-%m-%d %H:%M:%S') AS DATE))`;
        }
        function qrNumSql(x) {
            const t = `TRIM(CAST(${x} AS VARCHAR))`;
            return `TRY_CAST(REPLACE(REPLACE(REPLACE(${t}, ' ', ''), chr(160), ''), ',', '.') AS DOUBLE)`;
        }
        function qrSmartCmp(l, op, r2) {
            const dL = qrDateSql(l),
                dR = qrDateSql(r2),
                nL = qrNumSql(l),
                nR = qrNumSql(r2),
                tL = qrTxtSql(l),
                tR = qrTxtSql(r2);
            return (
                `(CASE WHEN ${dL} IS NOT NULL AND ${dR} IS NOT NULL THEN (${dL} ${op} ${dR})` +
                ` WHEN ${nL} IS NOT NULL AND ${nR} IS NOT NULL THEN (${nL} ${op} ${nR})` +
                ` ELSE (${tL} ${op} ${tR}) END)`
            );
        }
        // Découpe une expression en atomes séparés par AND/OR au niveau 0 (hors parenthèses et chaînes).
        function qrSplitLogical(s) {
            const out = [];
            let depth = 0,
                quote = null,
                cur = '',
                i = 0;
            while (i < s.length) {
                const ch = s[i];
                if (quote) {
                    cur += ch;
                    if (ch === quote) quote = null;
                    i++;
                    continue;
                }
                if (ch === "'" || ch === '"') {
                    quote = ch;
                    cur += ch;
                    i++;
                    continue;
                }
                if (ch === '(') depth++;
                if (ch === ')') depth--;
                if (depth === 0) {
                    const m = s.slice(i).match(/^\s+(AND|OR)\s+/i);
                    if (m) {
                        out.push({ atom: cur });
                        out.push({ op: m[1].toUpperCase() });
                        cur = '';
                        i += m[0].length;
                        continue;
                    }
                }
                cur += ch;
                i++;
            }
            out.push({ atom: cur });
            return out;
        }
        // Repère l'opérateur de comparaison de plus haut niveau d'un atome ; null s'il n'y en a pas.
        function qrFindCmp(s) {
            let depth = 0,
                quote = null;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (quote) {
                    if (ch === quote) quote = null;
                    continue;
                }
                if (ch === "'" || ch === '"') {
                    quote = ch;
                    continue;
                }
                if (ch === '(') {
                    depth++;
                    continue;
                }
                if (ch === ')') {
                    depth--;
                    continue;
                }
                if (depth !== 0) continue;
                const two = s.substr(i, 2);
                if (two === '>=' || two === '<=' || two === '<>' || two === '!=')
                    return { i, op: two === '!=' ? '<>' : two, len: 2 };
                if (ch === '>' || ch === '<' || ch === '=') return { i, op: ch, len: 1 };
            }
            return null;
        }
        function qrExprSql(formula) {
            const src = String(formula || '').trim();
            if (!src) return null;
            const compileAtom = a => {
                const s = a.trim();
                if (!s) return null;
                // parenthèses englobantes : on compile l'intérieur
                if (s[0] === '(' && s[s.length - 1] === ')') {
                    let count = 0,
                        wraps = true;
                    for (let i = 0; i < s.length; i++) {
                        if (s[i] === '(') count++;
                        else if (s[i] === ')') {
                            count--;
                            if (count === 0 && i < s.length - 1) {
                                wraps = false;
                                break;
                            }
                        }
                    }
                    if (wraps) {
                        const inner = qrExprSql(s.slice(1, -1));
                        return inner ? `(${inner})` : null;
                    }
                }
                const c = qrFindCmp(s);
                if (!c) return tdFormulaSql(s); // pas une comparaison (IS NULL, LIKE…) → tel quel
                const left = tdFormulaSql(s.slice(0, c.i).trim()),
                    right = tdFormulaSql(s.slice(c.i + c.len).trim());
                if (!left || !right) return tdFormulaSql(s);
                return qrSmartCmp(left, c.op, right);
            };
            const parts = qrSplitLogical(src);
            let sql = '';
            parts.forEach(p => {
                if (p.op) {
                    sql += ' ' + p.op + ' ';
                    return;
                }
                const a = compileAtom(p.atom);
                sql += a == null ? 'TRUE' : a;
            });
            return sql.trim() || null;
        }
        // Condition d'échec SQL (par ligne). Les types agrégés (unicité) sont traités à part.
        function qrFailCond(r) {
            // « expr » et « sql » portent leur propre expression : elles n'exigent pas de colonne cible.
            const c = r.col ? sqlIdent(r.col) : null;
            if (!c && r.type !== 'expr' && r.type !== 'sql') return null;
            const raw = c ? `CAST(${c} AS VARCHAR)` : null;
            const P = r.p || {};
            switch (r.type) {
                case 'notnull':
                    return `(${c} IS NULL OR TRIM(${raw}) = '')`;
                case 'format':
                    return String(P.regex || '').trim()
                        ? `(${c} IS NOT NULL AND TRIM(${raw}) <> '' AND NOT regexp_matches(${raw}, ${sqlLiteral(P.regex)}))`
                        : null;
                case 'range': {
                    const num = `TRY_CAST(REPLACE(${raw}, ',', '.') AS DOUBLE)`;
                    const conds = [];
                    if (String(P.min ?? '').trim() !== '')
                        conds.push(`${num} < ${parseFloat(String(P.min).replace(',', '.'))}`);
                    if (String(P.max ?? '').trim() !== '')
                        conds.push(`${num} > ${parseFloat(String(P.max).replace(',', '.'))}`);
                    return conds.length
                        ? `(${c} IS NOT NULL AND TRIM(${raw}) <> '' AND (${num} IS NULL OR ${conds.join(' OR ')}))`
                        : null;
                }
                case 'inlist': {
                    const vals = String(P.list || '')
                        .split(';')
                        .map(x => x.trim())
                        .filter(Boolean);
                    if (!vals.length) return null;
                    return `(${c} IS NOT NULL AND TRIM(${raw}) <> '' AND UPPER(TRIM(${raw})) NOT IN (${vals.map(v => sqlLiteral(v.toUpperCase())).join(', ')}))`;
                }
                case 'fk': {
                    const table = tableByName(P.refTable);
                    if (!table || !P.refCol) return null;
                    const nv = x => `NULLIF(UPPER(TRIM(CAST(${x} AS VARCHAR))), '')`;
                    return `(${nv(c)} IS NOT NULL AND ${nv(c)} NOT IN (SELECT ${nv(sqlIdent(P.refCol))} FROM ${sqlIdent(duckTableName(table.id))} WHERE ${nv(sqlIdent(P.refCol))} IS NOT NULL))`;
                }
                case 'cond': {
                    const c2 = P.thenCol && P.thenCol !== r.col ? sqlIdent(P.thenCol) : null;
                    if (!c2) return null;
                    const raw2 = `CAST(${c2} AS VARCHAR)`;
                    const part = (cc, rr, op, val) => {
                        if (op === 'filled') return `(${cc} IS NOT NULL AND TRIM(${rr}) <> '')`;
                        if (op === 'empty') return `(${cc} IS NULL OR TRIM(${rr}) = '')`;
                        const vals = String(val || '')
                            .split(';')
                            .map(x => x.trim())
                            .filter(Boolean);
                        if (!vals.length) return null;
                        return `(${cc} IS NOT NULL AND UPPER(TRIM(${rr})) IN (${vals.map(v2 => sqlLiteral(v2.toUpperCase())).join(', ')}))`;
                    };
                    const ifC = part(c, raw, P.ifOp || 'filled', P.ifVal);
                    const thenC = part(c2, raw2, P.thenOp || 'empty', P.thenVal);
                    return ifC && thenC ? `(${ifC} AND NOT ${thenC})` : null;
                }
                case 'expr': {
                    const e2 = qrExprSql(P.formula);
                    return e2 ? `(NOT COALESCE((${e2}), TRUE))` : null;
                }
                // V6.20 : l'utilisateur écrit lui-même la condition que doit respecter une ligne valide.
                // On liste les lignes qui ne la respectent pas. Une condition NULL est traitée comme
                // respectée (comme pour « expr »), pour ne pas transformer une donnée absente en échec.
                case 'sql': {
                    const e3 = qrSqlCond(P.sql);
                    return e3 ? `(NOT COALESCE((${e3}), TRUE))` : null;
                }
                // V6.27 : contrôle d'appartenance à une liste de valeurs déclarée en gouvernance.
                case 'vlist': {
                    const L = vlById(P.listId);
                    return L ? vlOutsideCond(L, c) : null;
                }
                case 'fresh': {
                    const number = parseInt(P.days) || 365;
                    const d = `COALESCE(TRY_CAST(${tdNormExpr('date', raw)} AS DATE), CAST(TRY_CAST(${raw} AS TIMESTAMP) AS DATE))`;
                    return `(${c} IS NOT NULL AND TRIM(${raw}) <> '' AND (${d} IS NULL OR ${d} < CURRENT_DATE - INTERVAL ${number} DAY))`;
                }
                default:
                    return null;
            }
        }
        // Condition SQL libre : on n'accepte QU'UNE expression booléenne. Tout ce qui pourrait
        // enchaîner une autre instruction (« ; ») ou modifier les données est refusé — l'écran de
        // qualité lit, il n'écrit jamais.
        const QR_SQL_FORBIDDEN = /\b(insert|update|delete|drop|alter|create|attach|copy|pragma|call|export|install|load)\b/i;
        function qrSqlCheck(txt) {
            const text = String(txt || '').trim();
            if (!text) return { ok: false, err: 'Condition vide.' };
            if (text.includes(';'))
                return { ok: false, err: "Le caractère « ; » n'est pas autorisé : écrivez une seule condition." };
            if (QR_SQL_FORBIDDEN.test(text))
                return { ok: false, err: 'Seule une condition de lecture est autorisée (pas de INSERT/UPDATE/DELETE/DROP…).' };
            let count = 0;
            for (const ch of text) {
                if (ch === '(') count++;
                else if (ch === ')') count--;
                if (count < 0) return { ok: false, err: 'Parenthèses déséquilibrées.' };
            }
            if (count !== 0) return { ok: false, err: 'Parenthèses déséquilibrées.' };
            return { ok: true, sql: text };
        }
        function qrSqlCond(txt) {
            const c = qrSqlCheck(txt);
            return c.ok ? c.sql : null;
        }
        // Règle d'agrégat : on regroupe par une ou plusieurs colonnes, on calcule un agrégat
        // (éventuellement sur un sous-ensemble de lignes) et on compare au seuil attendu. L'unité
        // contrôlée est le GROUPE : « total » = nombre de groupes, « échecs » = groupes non conformes.
        const QR_G_AGGS = {
            count: 'nombre de lignes',
            countd: 'nombre de valeurs distinctes',
            sum: 'somme',
            min: 'minimum',
            max: 'maximum',
            avg: 'moyenne'
        };
        const QR_G_OPS = { '=': '=', '<=': '≤', '>=': '≥', '<': '<', '>': '>', '!=': '≠' };
        function qrGroupSql(r, T) {
            const P = r.p || {};
            const keys = String(P.gKeys || '')
                .split(';')
                .map(x => x.trim())
                .filter(Boolean);
            if (!keys.length) return null;
            const fn = P.gAgg || 'count';
            const col = P.gCol ? sqlIdent(P.gCol) : null;
            if (fn !== 'count' && !col) return null;
            const numE = col ? `TRY_CAST(REPLACE(TRIM(CAST(${col} AS VARCHAR)), ',', '.') AS DOUBLE)` : null;
            const where = P.gWhere ? qrSqlCond(P.gWhere) : null;
            if (P.gWhere && !where) return null;
            const only = x => (where ? `CASE WHEN (${where}) THEN ${x} END` : x);
            let agg;
            if (fn === 'count') agg = where ? `SUM(CASE WHEN (${where}) THEN 1 ELSE 0 END)` : 'COUNT(*)';
            else if (fn === 'countd') agg = `COUNT(DISTINCT ${only(col)})`;
            else if (fn === 'sum') agg = `COALESCE(SUM(${only(numE)}), 0)`;
            else if (fn === 'avg') agg = `AVG(${only(numE)})`;
            else if (fn === 'min') agg = `MIN(${only(numE)})`;
            else agg = `MAX(${only(numE)})`;
            const op = QR_G_OPS[P.gOp] ? P.gOp : '<=';
            const val = parseFloat(String(P.gVal == null ? '' : P.gVal).replace(',', '.'));
            if (isNaN(val)) return null;
            const gk = keys.map(k => sqlIdent(k)).join(', ');
            return {
                keys,
                gk,
                sql: `SELECT ${gk}, ${agg} AS __v FROM ${T} GROUP BY ${gk}`,
                bad: `(__v IS NULL OR NOT (__v ${op} ${val}))`
            };
        }
        function qrUniqueKey(r) {
            const cols = String((r.p || {}).cols || r.col || '')
                .split(';')
                .map(x => x.trim())
                .filter(Boolean);
            return cols;
        }
        // ---- v3.8 : règles sur OBJET MÉTIER — résolues vers les colonnes réelles via les correspondances ----
        function qrBoById(id) {
            return (state.governance.businessObjects || []).find(x => x.id === id);
        }
        function qrBoAttrNames(boId) {
            const bo = qrBoById(boId);
            return bo ? boAllAttrRows(bo).map(x => x.el.name) : [];
        }
        function qrBoAttrMaps(bo, attrName) {
            const row = boAllAttrRows(bo).find(x => x.el.name === attrName);
            return ((row && row.el.mappings) || []).filter(m => {
                const table = tableByName(m.table);
                return table && table.status === 'ready';
            });
        }
        // Une règle « objet » devient une ou plusieurs unités { table, col, thenCol?, cols? } :
        // chaque correspondance de l'attribut est contrôlée sur SA table, puis les résultats sont agrégés.
        function qrBoResolutions(r) {
            const bo = qrBoById(r.bo);
            if (!bo) return [];
            const P = r.p || {};
            if (r.type === 'unique') {
                const attrs = String(P.cols || r.col || '')
                    .split(';')
                    .map(x => x.trim())
                    .filter(Boolean);
                if (!attrs.length) return [];
                const byT = {};
                attrs.forEach(a2 =>
                    qrBoAttrMaps(bo, a2).forEach(m => {
                        (byT[m.table] = byT[m.table] || {})[a2] = m.col;
                    })
                );
                const tn = Object.keys(byT).find(t2 => attrs.every(a2 => byT[t2][a2]));
                return tn ? [{ table: tn, cols: attrs.map(a2 => byT[tn][a2]) }] : [];
            }
            if (r.type === 'expr' || r.type === 'sql' || r.type === 'group') {
                const src = (bo.sources || []).find(s2 => s2.role === 'maitre') || (bo.sources || [])[0];
                const t = src && tableByName(src.table);
                return t && t.status === 'ready' ? [{ table: src.table }] : [];
            }
            if (!r.col) return [];
            const maps = qrBoAttrMaps(bo, r.col);
            if (r.type === 'cond') {
                const out = [];
                maps.forEach(m => {
                    const m2 = qrBoAttrMaps(bo, P.thenCol || '').find(x => x.table === m.table);
                    if (m2 && m2.col !== m.col) out.push({ table: m.table, col: m.col, thenCol: m2.col });
                });
                return out;
            }
            return maps.map(m => ({ table: m.table, col: m.col }));
        }
        function qrVirtual(r, res) {
            const parsed = JSON.parse(JSON.stringify(r));
            parsed.bo = null;
            parsed.table = res.table;
            if (res.col) parsed.col = res.col;
            parsed.p = parsed.p || {};
            if (res.thenCol) parsed.p.thenCol = res.thenCol;
            if (res.cols) parsed.p.cols = res.cols.join(';');
            return parsed;
        }
        /* ---- Ce que chaque contrôle mesure, en clair ----
           Une règle qui échoue sans dire COMMENT elle a mesuré n'est pas exploitable :
           on ne sait ni si le seuil est bon, ni par où commencer la correction. Chaque
           type porte donc une explication, et chaque échec restitue les grandeurs qui
           ont servi au verdict. */
        const QR_HELP = {
            notnull: {
                quoi: 'La colonne ne doit jamais être vide.',
                comment: 'Est comptée en échec toute ligne dont la valeur est NULL ou ne contient que des espaces.'
            },
            unique: {
                quoi: "La clé ne doit désigner qu'une seule ligne.",
                comment:
                    "Les valeurs sont comparées en majuscules et sans espaces de bord ; on compte les lignes appartenant à un groupe de plus d'une occurrence."
            },
            format: {
                quoi: 'La valeur doit respecter une forme.',
                comment:
                    "La valeur non vide est confrontée à l'expression régulière ; une valeur vide n'est pas jugée (c'est le rôle de « Non vide »)."
            },
            range: {
                quoi: 'La valeur numérique doit rester dans une plage.',
                comment:
                    "Le texte est converti en nombre (virgule ou point, espaces insécables retirés) puis comparé aux bornes. Ce qui n'est pas convertible est signalé à part."
            },
            inlist: {
                quoi: 'La valeur doit figurer dans une liste écrite ici.',
                comment: 'Comparaison en majuscules et sans espaces de bord.'
            },
            vlist: {
                quoi: 'La valeur doit appartenir à une liste de valeurs déclarée.',
                comment: "La liste vient du référentiel : on la modifie une fois, toutes les règles qui s'y rattachent suivent."
            },
            fk: {
                quoi: 'La valeur doit exister dans une table de référence.',
                comment: 'Jointure sur la colonne de référence ; les valeurs vides ne sont pas jugées.'
            },
            cond: {
                quoi: "Si une condition est vraie, une autre doit l'être aussi.",
                comment:
                    "Seules les lignes qui vérifient le « si » sont jugées ; les autres sont hors périmètre et n'entrent pas dans le total."
            },
            expr: {
                quoi: 'Une cohérence entre colonnes doit être vraie.',
                comment:
                    "Chaque comparaison est compilée en essayant successivement la DATE, puis le NOMBRE, puis le TEXTE — pour éviter qu'un 01/01/2024 soit jugé « inférieur » à 31/12/2023 par comparaison alphabétique."
            },
            fresh: {
                quoi: 'La date ne doit pas être trop ancienne.',
                comment: "Écart entre la date de la ligne et aujourd'hui, comparé au seuil."
            },
            sql: {
                quoi: "Une condition SQL libre définit l'échec.",
                comment: "La condition est évaluée ligne à ligne. Les ordres d'écriture sont refusés."
            },
            group: {
                quoi: 'Un agrégat par groupe doit respecter un seuil.',
                comment:
                    "L'unité comptée est le GROUPE, pas la ligne : le résultat dit combien de groupes sont non conformes, et l'inspection montre les lignes de ces groupes."
            },
            ts_gap: {
                quoi: 'Aucun point attendu ne doit manquer.',
                comment:
                    "Pour chaque couple de points consécutifs on mesure l'écart réel et on le compare au pas de la série (déclaré, ou déduit de l'intervalle dominant). Seules les séries CADENCÉES sont jugées : une série événementielle n'a pas de trou, elle a un rythme libre."
            },
            ts_dup: {
                quoi: "Un instant ne doit porter qu'une seule valeur.",
                comment:
                    "On regroupe par (série, horodatage) et on retient les groupes de plus d'une occurrence. L'inspection montre les valeurs concurrentes."
            },
            ts_flat: {
                quoi: 'La mesure ne doit pas rester figée.',
                comment:
                    "On repère les suites de points strictement identiques (technique dite des « îlots ») et on retient celles atteignant la longueur minimale. C'est la signature d'un capteur bloqué, qu'aucune analyse de distribution ne voit."
            },
            ts_jump: {
                quoi: 'La variation entre deux points doit rester plausible.',
                comment:
                    "On compare chaque point au précédent de la MÊME série. Une valeur peut être normale dans l'absolu et impossible comme variation — c'est ce que ce contrôle attrape."
            },
            ts_mono: {
                quoi: 'La mesure doit évoluer dans un seul sens.',
                comment:
                    "Destiné aux compteurs, index et cumuls : tout recul est signalé, avec la valeur précédente et l'ampleur du recul."
            },
            ts_fresh: {
                quoi: "Chaque série doit continuer d'alimenter.",
                comment:
                    "Écart entre le dernier point de la série et la référence choisie (le point le plus récent du fichier, ou maintenant). L'unité comptée est la SÉRIE."
            },
            ts_season: {
                quoi: 'Un point doit ressembler aux autres points du même créneau.',
                comment:
                    "On compare à la médiane du MÊME créneau (heure du jour, jour de semaine ou mois) pour la MÊME série, avec un écart robuste. Un creux nocturne normal cesse ainsi d'être signalé. Quand la série est trop stable pour que l'écart médian soit exploitable, on bascule sur l'écart moyen puis sur la dispersion de la série entière — l'inspection indique laquelle a servi."
            },
            ts_cover: {
                quoi: 'Chaque série doit être suffisamment complète.',
                comment:
                    "Points distincts rapportés aux points attendus entre le premier et le dernier, au pas de la série. L'unité comptée est la SÉRIE."
            }
        };
        function qrExplain(r) {
            const h = QR_HELP[r.type];
            if (!h) return null;
            const P = r.p || {};
            const bits = [];
            if (r.type === 'ts_flat') bits.push(`au moins ${Math.max(2, Number(P.minLen) || 3)} points identiques`);
            if (r.type === 'ts_jump') {
                if (P.jumpAbs) bits.push(`écart absolu > ${P.jumpAbs}`);
                if (P.jumpPct) bits.push(`variation > ${P.jumpPct} %`);
            }
            if (r.type === 'ts_mono') bits.push(`sens ${P.sens === 'decroissant' ? 'décroissant' : 'croissant'}`);
            if (r.type === 'ts_fresh')
                bits.push(
                    `retard > ${Number(P.maxAgeH) || 24} h depuis ${P.ref === 'now' ? 'maintenant' : 'le point le plus récent du fichier'}`
                );
            if (r.type === 'ts_cover') bits.push(`couverture < ${Number(P.minPct) || 95} %`);
            if (r.type === 'ts_season')
                bits.push(
                    `créneau « ${P.bucket === 'dow' ? 'même jour de semaine' : P.bucket === 'month' ? 'même mois' : 'même heure du jour'} », sensibilité k = ${Number(P.k) || 4}`
                );
            if (P.serieLike)
                bits.push(
                    `limité aux séries dont l'identifiant correspond à « ${P.serieLike} » (le % remplace n'importe quelle suite de caractères)`
                );
            else if (QR_SERIES.includes(r.type)) bits.push('porte sur toutes les séries du fichier');
            return { quoi: h.quoi, comment: h.comment, seuils: bits.join(' · ') };
        }
        function qrExplainHtml(r, compact) {
            const e = qrExplain(r);
            if (!e) return '';
            if (compact)
                return `<span class="text-[10px] text-slate-400" title="${escapeHTML(e.comment)}">${escapeHTML(e.quoi)}</span>`;
            return `<div class="text-[11px] leading-relaxed"><div class="font-bold">${escapeHTML(e.quoi)}</div>
                <div class="text-slate-500 mt-0.5">${escapeHTML(e.comment)}</div>
                ${e.seuils ? `<div class="text-slate-500 mt-0.5"><b>Réglages :</b> ${escapeHTML(e.seuils)}</div>` : ''}
                ${QR_TS_UNIT[r.type] ? `<div class="text-slate-400 mt-0.5">Unité comptée : <b>${QR_TS_UNIT[r.type]}</b>.</div>` : ''}</div>`;
        }

        /* ---- Inspection des contrôles de série : on restitue la MESURE, pas la ligne brute ----
           Pour un trou, la ligne fautive n'existe pas : il n'y a rien à afficher d'une table.
           Ce qu'il faut montrer, c'est le raisonnement — le point d'avant, le point d'après,
           l'écart observé, le pas attendu et le nombre de points manquants. */
        // Un horodatage brut (« 2026-01-03 11:00:00 ») et une durée en secondes (« 133200 »)
        // sont exacts mais illisibles : on les met en forme DANS le SQL, pour que le
        // panneau d'inspection et l'export CSV soient lisibles sans traitement côté page.
        function tsDateSql(x) {
            return `strftime(${x}, '%d/%m/%Y à %Hh%M')`;
        }
        function tsHumanSql(x) {
            return `CASE
           WHEN ${x} IS NULL THEN NULL
           WHEN ${x} < 60 THEN CAST(ROUND(${x}) AS BIGINT) || ' s'
           WHEN ${x} < 3600 THEN CAST(ROUND(${x}/60.0) AS BIGINT) || ' min'
           WHEN ${x} < 86400 THEN CAST(FLOOR(${x}/3600) AS BIGINT) || ' h'
        || CASE WHEN CAST(ROUND((${x}%3600)/60.0) AS BIGINT) > 0 THEN ' ' || CAST(ROUND((${x}%3600)/60.0) AS BIGINT) || ' min' ELSE '' END
           ELSE CAST(FLOOR(${x}/86400) AS BIGINT) || ' j'
        || CASE WHEN CAST(FLOOR((${x}%86400)/3600) AS BIGINT) > 0 THEN ' ' || CAST(FLOOR((${x}%86400)/3600) AS BIGINT) || ' h' ELSE '' END
         END`;
        }
        function tsInspectSql(r, c, T) {
            const P = r.p || {};
            const tol = Number(c.tol != null ? c.tol : 0.5);
            const flt = tsFilterSql(P);
            const D = tsDateSql,
                H = tsHumanSql;
            switch (r.type) {
                case 'ts_gap':
                    return `${tsCte(c, T)}
        SELECT s.sid AS "Série", ${D('s.pts')} AS "Dernier point avant le trou", ${D('s.ts')} AS "Point suivant",
          ${H('s.d')} AS "Durée du trou", ${H('o.pas')} AS "Pas attendu de la série",
          (s.d / o.pas - 1)::BIGINT AS "Points manquants",
          ROUND(s.d::DOUBLE / o.pas, 1) || ' fois le pas' AS "Ampleur",
          'écart supérieur au pas x ${1 + tol}' AS "Règle appliquée"
        FROM st s JOIN ok o ON o.sid = s.sid
        WHERE s.d IS NOT NULL AND s.d > o.pas * ${1 + tol}${flt.replace('sid', 's.sid')}
        ORDER BY s.d DESC`;
                case 'ts_dup':
                    return `${tsCte(c, T)}
        SELECT sid AS "Série", ${D('ts')} AS "Horodatage", COUNT(*) AS "Nombre d'occurrences",
          COUNT(DISTINCT v) AS "Valeurs distinctes",
          string_agg(DISTINCT CAST(v AS VARCHAR), ' | ') AS "Valeurs concurrentes"
        FROM b WHERE 1=1${flt} GROUP BY sid, ts HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC`;
                case 'ts_flat': {
                    const maximum = Math.max(2, Number(P.minLen) || 3);
                    return `${tsCte(c, T)}
        SELECT sid AS "Série", v AS "Valeur figée", COUNT(*) AS "Points consécutifs",
          ${D('MIN(ts)')} AS "Depuis", ${D('MAX(ts)')} AS "Jusqu'à",
          ${H("date_diff('second', MIN(ts), MAX(ts))")} AS "Durée du blocage",
          'au moins ${maximum} points identiques d''affilée' AS "Règle appliquée"
        FROM pl WHERE 1=1${flt} GROUP BY sid, v, grp HAVING COUNT(*) >= ${maximum} ORDER BY COUNT(*) DESC`;
                }
                case 'ts_jump': {
                    const conds = [];
                    if (P.jumpAbs) conds.push(`abs(v - pv) > ${Number(P.jumpAbs)}`);
                    if (P.jumpPct) conds.push(`(pv <> 0 AND abs(v - pv) / abs(pv) * 100 > ${Number(P.jumpPct)})`);
                    if (!conds.length) return null;
                    const lbl = [];
                    if (P.jumpAbs) lbl.push(`écart absolu supérieur à ${Number(P.jumpAbs)}`);
                    if (P.jumpPct) lbl.push(`variation supérieure à ${Number(P.jumpPct)} %`);
                    return `${tsCte(c, T)}
        SELECT sid AS "Série", ${D('pts')} AS "Point précédent", ${D('ts')} AS "Horodatage",
          pv AS "Valeur précédente", v AS "Valeur", ROUND(v - pv, 4) AS "Écart",
          ROUND(abs(v - pv), 4) AS "Écart absolu",
          CASE WHEN pv <> 0 THEN ROUND(abs(v - pv) / abs(pv) * 100, 1) END AS "Variation (%)",
          ${H('d')} AS "Temps écoulé",
          '${lbl.join(' ou ').replace(/'/g, "''")}' AS "Règle appliquée"
        FROM st WHERE pv IS NOT NULL AND v IS NOT NULL${flt} AND (${conds.join(' OR ')})
        ORDER BY abs(v - pv) DESC`;
                }
                case 'ts_mono': {
                    const dec = P.sens === 'decroissant';
                    return `${tsCte(c, T)}
        SELECT sid AS "Série", ${D('pts')} AS "Point précédent", ${D('ts')} AS "Horodatage",
          pv AS "Valeur précédente", v AS "Valeur",
          ROUND(${dec ? 'v - pv' : 'pv - v'}, 4) AS "${dec ? 'Hausse' : 'Recul'} constaté",
          ${H('d')} AS "Temps écoulé",
          'sens attendu : ${dec ? 'décroissant' : 'croissant'}' AS "Règle appliquée"
        FROM st WHERE pv IS NOT NULL AND v IS NOT NULL${flt} AND v ${dec ? '>' : '<'} pv
        ORDER BY abs(v - pv) DESC`;
                }
                case 'ts_fresh': {
                    const h = Number(P.maxAgeH) || 24;
                    const ref = P.ref === 'now' ? 'now()::TIMESTAMP' : '(SELECT MAX(ts) FROM b)';
                    return `${tsCte(c, T)}
        SELECT sid AS "Série", ${D('MAX(ts)')} AS "Dernier point reçu",
          ${D(ref)} AS "Comparé à", ${H(`date_diff('second', MAX(ts), ${ref})`)} AS "Retard",
          ${H(h * 3600)} AS "Retard maximal admis", COUNT(*) AS "Points de la série"
        FROM b WHERE 1=1${flt} GROUP BY sid HAVING date_diff('hour', MAX(ts), ${ref}) > ${h}
        ORDER BY date_diff('second', MAX(ts), ${ref}) DESC`;
                }
                case 'ts_cover': {
                    const min = Number(P.minPct) || 95;
                    return `${tsCte(c, T)},
          agg AS (SELECT sid, COUNT(DISTINCT ts) AS n_ts, COUNT(*) AS n, MIN(ts) AS t0, MAX(ts) AS t1 FROM b WHERE 1=1${flt} GROUP BY sid)
        SELECT a.sid AS "Série", ${D('a.t0')} AS "Début", ${D('a.t1')} AS "Fin", ${H('o.pas')} AS "Pas de la série",
          a.n_ts AS "Horodatages distincts",
          (FLOOR(date_diff('second', a.t0, a.t1) / o.pas) + 1)::BIGINT AS "Points attendus",
          (FLOOR(date_diff('second', a.t0, a.t1) / o.pas) + 1 - a.n_ts)::BIGINT AS "Points manquants",
          ROUND(100.0 * a.n_ts / NULLIF(FLOOR(date_diff('second', a.t0, a.t1) / o.pas) + 1, 0), 1) AS "Couverture (%)",
          ${min} AS "Seuil (%)"
        FROM agg a JOIN ok o ON o.sid = a.sid
        WHERE 100.0 * a.n_ts / NULLIF(FLOOR(date_diff('second', a.t0, a.t1) / o.pas) + 1, 0) < ${min}
        ORDER BY 8`;
                }
                case 'ts_season': {
                    const k = Number(P.k) || 4;
                    const bk =
                        P.bucket === 'dow'
                            ? 'extract(dow FROM ts)'
                            : P.bucket === 'month'
                              ? 'extract(month FROM ts)'
                              : 'extract(hour FROM ts)';
                    const lbl = P.bucket === 'dow' ? 'jour de semaine' : P.bucket === 'month' ? 'mois' : 'heure du jour';
                    return `${tsCte(c, T)},
          s AS (SELECT sid, ${bk} AS bk, ts, v FROM b WHERE v IS NOT NULL${flt}),
          m1 AS (SELECT sid, bk, median(v) AS med FROM s GROUP BY sid, bk),
          m2 AS (SELECT s.sid, s.bk, median(abs(s.v - m1.med)) AS mad, avg(abs(s.v - m1.med)) AS aad, COUNT(*) AS n
         FROM s JOIN m1 ON m1.sid = s.sid AND m1.bk = s.bk GROUP BY s.sid, s.bk),
          ms AS (SELECT sid, median(v) AS smed FROM s GROUP BY sid),
          m3 AS (SELECT s.sid, median(abs(s.v - ms.smed)) AS smad FROM s JOIN ms ON ms.sid = s.sid GROUP BY s.sid),
          j AS (SELECT s.sid, s.bk, s.ts, s.v, m1.med, m2.mad, m2.aad, m2.n, m3.smad,
              CASE WHEN m2.mad > 0 THEN ${k} * 1.4826 * m2.mad
           WHEN m2.aad > 0 THEN ${k} * 1.2533 * m2.aad
           WHEN m3.smad > 0 THEN ${k} * 1.4826 * m3.smad END AS seuil,
              CASE WHEN m2.mad > 0 THEN 'écart médian du créneau'
           WHEN m2.aad > 0 THEN 'écart moyen du créneau (série trop stable pour l''écart médian)'
           WHEN m3.smad > 0 THEN 'dispersion de la série entière' END AS methode
            FROM s JOIN m1 ON m1.sid = s.sid AND m1.bk = s.bk JOIN m2 ON m2.sid = s.sid AND m2.bk = s.bk JOIN m3 ON m3.sid = s.sid)
        SELECT sid AS "Série", ${D('ts')} AS "Horodatage", bk AS "Créneau (${lbl})", v AS "Valeur",
          ROUND(med, 4) AS "Médiane du créneau", ROUND(abs(v - med), 4) AS "Écart à la médiane",
          ROUND(seuil, 4) AS "Seuil déclenchant", methode AS "Dispersion utilisée",
          n AS "Points du créneau", ${k} AS "Sensibilité k"
        FROM j WHERE n >= 4 AND seuil IS NOT NULL AND abs(v - med) > seuil
        ORDER BY abs(v - med) / NULLIF(seuil, 0) DESC`;
                }
            }
            return null;
        }

        function qrInspectSql(r) {
            if (r.bo) {
                const rs = qrBoResolutions(r);
                return rs.length ? qrInspectSql(qrVirtual(r, rs[0])) : null;
            }
            const table = tableByName(r.table);
            if (!table) return null;
            const T = sqlIdent(duckTableName(table.id));
            if (r.type === 'unique') {
                const cols = qrUniqueKey(r);
                if (!cols.length) return null;
                const k = `COALESCE(UPPER(TRIM(concat_ws(chr(1), ${cols.map(c2 => `CAST(${sqlIdent(c2)} AS VARCHAR)`).join(', ')}))), '')`;
                return `SELECT * FROM ${T} WHERE ${k} IN (SELECT ${k} FROM ${T} GROUP BY 1 HAVING COUNT(*) > 1) ORDER BY ${k}`;
            }
            if (r.type === 'group') {
                const g = qrGroupSql(r, T);
                if (!g) return null;
                // On restitue les LIGNES des groupes fautifs : c'est ce qu'on corrige concrètement.
                return `SELECT * FROM ${T} WHERE (${g.gk}) IN (SELECT ${g.gk} FROM (${g.sql}) WHERE ${g.bad}) ORDER BY ${g.gk}`;
            }
            if (QR_SERIES.includes(r.type)) {
                const cfg = tsForTable(r.table);
                return tsCfgOk(cfg) ? tsInspectSql(r, cfg, T) : null;
            }
            const fc = qrFailCond(r);
            return fc ? `SELECT * FROM ${T} WHERE ${fc}` : null;
        }
        // V6.20 : exécuter UNE règle, à la demande, sans lancer toute la suite.
        async function qrRunOne(id, btn) {
            const rules = qrRules().find(x => x.id === id);
            if (!rules) return;
            if (btn) btn.disabled = true;
            try {
                const res = await qrEvalRule(rules);
                persistAppState();
                renderQualityRules();
                if (!res.ran) return showError(`« ${rules.name} » n'a pas pu être évaluée : cible ou paramètres incomplets.`);
                const unit = QR_TS_UNIT[rules.type] || (QR_GROUPED.includes(rules.type) ? 'groupe' : 'ligne');
                showSuccess(
                    res.fails === 0
                        ? `✅ « ${rules.name} » : conforme (${res.total.toLocaleString('fr-FR')} ${unit}${res.total > 1 ? 's' : ''} contrôlé${res.total > 1 ? 's' : ''}).`
                        : `⚠️ « ${rules.name} » : ${res.fails.toLocaleString('fr-FR')} ${unit}${res.fails > 1 ? 's' : ''} en échec sur ${res.total.toLocaleString('fr-FR')} (${(100 * res.rate).toFixed(1)} % conforme).`
                );
            } catch (e) {
                showError('Exécution impossible : ' + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }
        // Exécution d'une suite (toutes les tables, une table, ou un domaine) — UNE passe par table
        // pour toutes les règles « par ligne », requêtes dédiées pour l'unicité.
        async function qrRun(btn) {
            const scope = el('qrScope') ? el('qrScope').value : '';
            const inScope = tn => {
                const table = tableByName(tn);
                if (!table || table.status !== 'ready') return false;
                if (!scope) return true;
                if (scope.startsWith('t:')) return tn === scope.slice(2);
                if (scope.startsWith('d:')) return (table.theme || '').trim() === scope.slice(2);
                return true;
            };
            const rules = qrRules().filter(r => {
                if (!r.enabled) return false;
                if (r.bo) {
                    const rs = qrBoResolutions(r);
                    return rs.length > 0 && rs.some(x => inScope(x.table));
                }
                return !!r.table && inScope(r.table);
            });
            if (!rules.length) return showError('Aucune règle active dans ce périmètre — créez des règles ci-dessous.');
            if (btn) btn.disabled = true;
            bgTaskStart('Exécution des règles de qualité');
            try {
                const { conn } = await getDB();
                // v3.8 : chaque règle devient une ou plusieurs UNITÉS (table, colonnes réelles) —
                // les règles « objet métier » sont résolues via les correspondances, puis agrégées.
                const units = [];
                rules.forEach(r => {
                    if (r.bo)
                        qrBoResolutions(r)
                            .filter(x => inScope(x.table))
                            .forEach(res => units.push({ r, vr: qrVirtual(r, res) }));
                    else units.push({ r, vr: r });
                });
                const acc = new Map();
                const bump = (r, tot, f) => {
                    const a2 = acc.get(r.id) || { total: 0, fails: 0 };
                    a2.total += tot;
                    a2.fails += f;
                    acc.set(r.id, a2);
                };
                const byTable = {};
                units.forEach(u => (byTable[u.vr.table] = byTable[u.vr.table] || []).push(u));
                for (const tn of Object.keys(byTable)) {
                    const table = tableByName(tn);
                    const T = sqlIdent(duckTableName(table.id));
                    const rowUnits = byTable[tn]
                        .map(u => ({
                            u,
                            fc: QR_GROUPED.includes(u.vr.type) || QR_SERIES.includes(u.vr.type) ? null : qrFailCond(u.vr)
                        }))
                        .filter(x => x.fc);
                    if (rowUnits.length) {
                        const sel = rowUnits
                            .map((x, i) => `SUM(CASE WHEN ${x.fc} THEN 1 ELSE 0 END)::BIGINT AS f${i}`)
                            .join(', ');
                        const res = arrowResultToObjects(
                            await conn.query(`SELECT COUNT(*)::BIGINT AS total, ${sel} FROM ${T}`)
                        )[0];
                        rowUnits.forEach((x, i) => bump(x.u.r, Number(res.total), Number(res['f' + i] || 0)));
                    }
                    for (const u of byTable[tn].filter(u2 => u2.vr.type === 'group')) {
                        const g = qrGroupSql(u.vr, T);
                        if (!g) continue;
                        const res = arrowResultToObjects(
                            await conn.query(
                                `SELECT COUNT(*)::BIGINT AS total, SUM(CASE WHEN ${g.bad} THEN 1 ELSE 0 END)::BIGINT AS fails FROM (${g.sql})`
                            )
                        )[0];
                        bump(u.r, Number(res.total), Number(res.fails || 0));
                    }
                    for (const u of byTable[tn].filter(u2 => u2.vr.type === 'unique')) {
                        const cols = qrUniqueKey(u.vr);
                        if (!cols.length) continue;
                        const k = `COALESCE(UPPER(TRIM(concat_ws(chr(1), ${cols.map(c2 => `CAST(${sqlIdent(c2)} AS VARCHAR)`).join(', ')}))), '')`;
                        const res = arrowResultToObjects(
                            await conn.query(
                                `SELECT (SELECT COUNT(*) FROM ${T})::BIGINT AS total, COALESCE(SUM(c), 0)::BIGINT AS fails FROM (SELECT COUNT(*)::BIGINT AS c FROM ${T} GROUP BY ${k} HAVING COUNT(*) > 1)`
                            )
                        )[0];
                        bump(u.r, Number(res.total), Number(res.fails || 0));
                    }
                }
                rules.forEach(r => {
                    const a2 = acc.get(r.id);
                    r.last = a2
                        ? { at: Date.now(), total: a2.total, fails: a2.fails, rate: a2.total ? 1 - a2.fails / a2.total : 1 }
                        : null;
                });
                persistAppState();
                qrTakeSnapshot(rules);
                renderQualityRules();
                const totF = rules.reduce((a2, r) => a2 + ((r.last || {}).fails || 0), 0);
                bgTaskEnd(
                    `📏 ${rules.length} règle(s) exécutée(s) — ${totF.toLocaleString('fr-FR')} ligne(s) en échec au total.`
                );
            } catch (e) {
                bgTaskEnd();
                showError('Exécution des règles impossible : ' + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }
        async function qrAutoRun(tableName) {
            if (
                !qrRules().some(
                    r => r.enabled && (r.table === tableName || (r.bo && qrBoResolutions(r).some(x => x.table === tableName)))
                )
            )
                return;
            const qrScopeElement = el('qrScope');
            const prev = qrScopeElement ? qrScopeElement.value : null;
            if (qrScopeElement) qrScopeElement.value = 't:' + tableName;
            try {
                await qrRun(null);
            } finally {
                if (qrScopeElement && prev !== null) qrScopeElement.value = prev;
            }
        }
        // ---- E2 : score pondéré + instantanés + tendance ----
        function qrScore(rs) {
            let count = 0,
                sv = 0;
            rs.forEach(r => {
                if (!r.last) return;
                const w = QR_W[r.crit] || 2;
                count += w;
                sv += w * r.last.rate;
            });
            return count ? Math.round((100 * sv) / count) : null;
        }
        function qrTakeSnapshot(rules) {
            const byTable = {},
                byDomain = {};
            const ran = rules.filter(r => r.last);
            ran.forEach(r => {
                if (r.table) (byTable[r.table] = byTable[r.table] || []).push(r);
                const table = tableByName(r.table);
                const d = r.bo ? '(objets métier)' : (table && (table.theme || '').trim()) || '(sans domaine)';
                (byDomain[d] = byDomain[d] || []).push(r);
            });
            const snap = {
                at: new Date().toISOString(),
                global: qrScore(ran),
                tables: Object.fromEntries(
                    Object.entries(byTable).map(([k, v]) => [
                        k,
                        {
                            score: qrScore(v),
                            rules: v.map(r => ({
                                id: r.id,
                                name: r.name,
                                crit: r.crit,
                                rate: +r.last.rate.toFixed(4),
                                fails: r.last.fails
                            }))
                        }
                    ])
                ),
                domains: Object.fromEntries(Object.entries(byDomain).map(([k, v]) => [k, qrScore(v)]))
            };
            qrSnapshots.push(snap);
            if (qrSnapshots.length > 300) qrSnapshots = qrSnapshots.slice(-300);
            if (!state.noPersist) idbPut('meta', 'qrSnapshots', qrSnapshots).catch(() => {});
        }
        function qrScoreColor(v) {
            return v == null ? 'text-slate-300' : v >= 90 ? 'text-emerald-600' : v >= 70 ? 'text-amber-600' : 'text-red-600';
        }
        function qrExportCsv() {
            const rows = [
                ['REGLE', 'TABLE', 'TYPE', 'CRITICITE', 'TAUX_CONFORMITE_PCT', 'LIGNES_EN_ECHEC', 'TOTAL', 'EXECUTEE_LE']
                    .map(escapeCSV)
                    .join(';')
            ];
            qrRules().forEach(r =>
                rows.push(
                    [
                        r.name,
                        r.bo ? 'Objet ' + ((qrBoById(r.bo) || {}).name || '?') : r.table,
                        QR_TYPES[r.type] || r.type,
                        r.crit,
                        r.last ? (100 * r.last.rate).toFixed(2) : '',
                        r.last ? r.last.fails : '',
                        r.last ? r.last.total : '',
                        r.last ? new Date(r.last.at).toISOString() : ''
                    ]
                        .map(escapeCSV)
                        .join(';')
                )
            );
            downloadTextFile(`Regles_qualite_${Date.now()}.csv`, rows.join('\n'));
        }
        function qrExportJson() {
            const blob = new Blob(
                [
                    JSON.stringify(
                        { exportedAt: new Date().toISOString(), rules: qrRules(), snapshots: qrSnapshots.slice(-30) },
                        null,
                        2
                    )
                ],
                { type: 'application/json' }
            );
            const anchorElement = document.createElement('a');
            anchorElement.href = URL.createObjectURL(blob);
            anchorElement.download = `Scorecard_${Date.now()}.json`;
            document.body.appendChild(anchorElement);
            anchorElement.click();
            anchorElement.remove();
        }
        function qrParamsHtml(r) {
            const table = tableByName(r.table);
            const hs = r.bo ? qrBoAttrNames(r.bo) : table ? table.headers : [];
            const colSel = (f, cur, ph) =>
                `<select onchange="qrSet('${r.id}','${f}',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white max-w-[130px]"><option value="">${ph || '— colonne —'}</option>${hs.map(h => `<option value="${escapeHTML(h)}" ${cur === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>`;
            const P = r.p || {};
            const inp = (f, cur, ph, w) =>
                `<input type="text" value="${escapeHTML(cur == null ? '' : String(cur))}" onchange="qrSet('${r.id}','p.${f}',this.value)" placeholder="${ph}" class="border border-slate-200 rounded px-1.5 py-0.5 text-[11px] ${w || 'w-28'}">`;
            switch (r.type) {
                case 'notnull':
                    return colSel('col', r.col);
                case 'unique':
                    return inp('cols', P.cols || r.col, 'colonnes clé (séparées par ;)', 'w-56');
                case 'format':
                    return colSel('col', r.col) + ' ' + inp('regex', P.regex, 'regex, ex : ^[A-Z]{2}\\d{4}$', 'w-52');
                case 'range':
                    return (
                        colSel('col', r.col) +
                        ' min ' +
                        inp('min', P.min, '0', 'w-16') +
                        ' max ' +
                        inp('max', P.max, '100', 'w-16')
                    );
                case 'inlist':
                    return colSel('col', r.col) + ' ' + inp('list', P.list, 'valeurs autorisées séparées par ;', 'w-56');
                case 'fk': {
                    const others = Object.values(state.tables).filter(t2 => t2.status === 'ready' && t2.name !== r.table);
                    const table = tableByName(P.refTable);
                    return (
                        colSel('col', r.col) +
                        ` → <select onchange="qrSet('${r.id}','p.refTable',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white max-w-[120px]"><option value="">— table réf —</option>${others.map(t2 => `<option value="${escapeHTML(t2.name)}" ${P.refTable === t2.name ? 'selected' : ''}>${escapeHTML(t2.name)}</option>`).join('')}</select> <select onchange="qrSet('${r.id}','p.refCol',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white max-w-[110px]"><option value="">— col —</option>${(table ? table.headers : []).map(h => `<option value="${escapeHTML(h)}" ${P.refCol === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>`
                    );
                }
                case 'cond': {
                    const opSel = (f, cur, dft) =>
                        `<select onchange="qrSet('${r.id}','p.${f}',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white">${[
                            ['filled', 'est rempli'],
                            ['empty', 'est vide'],
                            ['val', 'vaut (valeur ou liste)']
                        ]
                            .map(([k, l]) => `<option value="${k}" ${(cur || dft) === k ? 'selected' : ''}>${l}</option>`)
                            .join('')}</select>`;
                    const thenSel = `<select onchange="qrSet('${r.id}','p.thenCol',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white max-w-[130px]"><option value="">— colonne —</option>${hs
                        .filter(h => h !== r.col)
                        .map(
                            h =>
                                `<option value="${escapeHTML(h)}" ${P.thenCol === h ? 'selected' : ''}>${escapeHTML(h)}</option>`
                        )
                        .join('')}</select>`;
                    return `<span class="font-bold text-slate-500">Si</span> ${colSel('col', r.col)} ${opSel('ifOp', P.ifOp, 'filled')}${(P.ifOp || 'filled') === 'val' ? ' ' + inp('ifVal', P.ifVal, 'valeur, ou liste séparée par ;', 'w-44') : ''}
                        <span class="font-bold text-slate-500">alors</span> ${thenSel} ${opSel('thenOp', P.thenOp, 'empty')}${(P.thenOp || 'empty') === 'val' ? ' ' + inp('thenVal', P.thenVal, 'valeur, ou liste séparée par ;', 'w-44') : ''}`;
                }
                case 'expr':
                    return (
                        inp('formula', P.formula, 'ex : [DATE_FIN] >= [DATE_DEBUT]', 'w-64') +
                        `<div class="text-[9px] text-slate-400 mt-0.5">La règle liste les lignes qui <b>ne respectent PAS</b> l'expression. Comparaison typée automatique : <b>dates</b> (jj/mm/aaaa, aaaa-mm-jj…), sinon <b>nombres</b> (virgule/espaces), sinon texte. ET/OU et parenthèses acceptés.</div>`
                    );
                case 'fresh':
                    return colSel('col', r.col) + ' âge max ' + inp('days', P.days, '365', 'w-14') + ' jours';
                case 'vlist': {
                    const L = vlById(P.listId);
                    return (
                        colSel('col', r.col) +
                        ` <select onchange="qrSet('${r.id}','p.listId',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white"><option value="">— liste —</option>${vlList()
                            .map(
                                x =>
                                    `<option value="${x.id}" ${P.listId === x.id ? 'selected' : ''}>${escapeHTML(x.name)}</option>`
                            )
                            .join('')}</select>` +
                        `<div class="text-[9px] text-slate-400 mt-0.5">${vlList().length ? "La règle liste les valeurs qui n'appartiennent pas au référentiel choisi." : 'Aucune liste définie — créez-en une dans <b>Gouvernance ▸ Listes de valeurs</b>.'}${L ? ' Référentiel : ' + escapeHTML(vlLabel(L)) + '.' : ''}</div>`
                    );
                }
                case 'sql': {
                    const chk = P.sql ? qrSqlCheck(P.sql) : null;
                    return (
                        inp('sql', P.sql, 'ex : "DATE_FIN" IS NULL OR "DATE_FIN" >= "DATE_DEBUT"', 'w-full') +
                        `<div class="text-[9px] ${chk && !chk.ok ? 'text-red-600 font-bold' : 'text-slate-400'} mt-0.5">${chk && !chk.ok ? '⚠ ' + escapeHTML(chk.err) : 'Condition SQL que doit respecter une ligne <b>valide</b> — la règle liste celles qui ne la respectent pas. Noms de colonnes entre guillemets doubles. Lecture seule, une seule condition (pas de « ; »).'}</div>`
                    );
                }
                case 'group': {
                    const sel = (f, cur, opts, dft) =>
                        `<select onchange="qrSet('${r.id}','p.${f}',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white">${Object.entries(
                            opts
                        )
                            .map(
                                ([k, l]) =>
                                    `<option value="${k}" ${(cur || dft) === k ? 'selected' : ''}>${escapeHTML(l)}</option>`
                            )
                            .join('')}</select>`;
                    const needCol = (P.gAgg || 'count') !== 'count';
                    return `<span class="font-bold text-slate-500">Pour chaque</span> ${inp('gKeys', P.gKeys, 'colonnes de regroupement (séparées par ;)', 'w-48')}
                        <span class="font-bold text-slate-500">le</span> ${sel('gAgg', P.gAgg, QR_G_AGGS, 'count')} ${needCol ? 'de ' + colSel('p.gCol', P.gCol) : ''}
                        ${sel('gOp', P.gOp, QR_G_OPS, '<=')} ${inp('gVal', P.gVal, '1', 'w-16')}
                        <div class="mt-1"><span class="text-[10px] text-slate-400">en ne comptant que les lignes où (facultatif)</span> ${inp('gWhere', P.gWhere, 'ex : "STATUT" = \'ACTIF\'', 'w-56')}</div>
                        <div class="text-[9px] text-slate-400 mt-0.5">L'unité contrôlée est le <b>groupe</b> : le résultat compte les groupes non conformes, et l'inspection affiche les lignes de ces groupes.</div>`;
                }
                default:
                    if (QR_SERIES.includes(r.type)) {
                        const cfg = tsForTable(r.table);
                        if (!cfg)
                            return `<span class="text-[11px] text-amber-700">Déclarez d'abord cette source comme série temporelle (Données & Modèle → Séries temporelles).</span>`;
                        const sel2 = (f, cur, opts, dft) =>
                            `<select onchange="qrSet('${r.id}','p.${f}',this.value)" class="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white">${Object.entries(
                                opts
                            )
                                .map(
                                    ([k, l]) =>
                                        `<option value="${k}" ${(cur || dft) === k ? 'selected' : ''}>${escapeHTML(l)}</option>`
                                )
                                .join('')}</select>`;
                        const filt = `<div class="mt-1.5 p-2 rounded-lg bg-slate-50 border border-slate-200">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="text-[11px] font-bold">Limiter à certaines séries</span>
                              ${inp('serieLike', P.serieLike, 'vide = toutes les séries', 'w-44')}
                              <span class="text-[10px] text-slate-400">facultatif</span>
                            </div>
                            <div class="text-[10px] text-slate-500 mt-1 leading-relaxed">
                              Par défaut le contrôle porte sur <b>toutes</b> les séries du fichier. Ce champ permet de n'en viser qu'une partie,
                              utile quand un même fichier mélange des natures différentes — un compteur cumulatif et une mesure instantanée, par exemple :
                              la monotonie ne vaut que pour le premier.<br>
                              Le caractère <b>%</b> remplace n'importe quelle suite de caractères :
                              <b>CPT%</b> = les séries dont l'identifiant commence par CPT ·
                              <b>%PARIS%</b> = celles qui contiennent PARIS ·
                              <b>CPT-LYON-02</b> = cette seule série.
                            </div>
                                  </div>`;
                        const base = `<span class="text-[10px] text-slate-400">maille : ${escapeHTML((cfg.keyCols || []).join(' + '))} × ${escapeHTML(cfg.tsCol)}</span>`;
                        let text = '';
                        if (r.type === 'ts_flat')
                            text = `au moins ${inp('minLen', P.minLen, '3', 'w-14')} points identiques d'affilée`;
                        else if (r.type === 'ts_jump')
                            text = `écart absolu &gt; ${inp('jumpAbs', P.jumpAbs, 'ex : 100', 'w-20')} ou variation &gt; ${inp('jumpPct', P.jumpPct, 'ex : 300', 'w-16')} %`;
                        else if (r.type === 'ts_mono')
                            text = `sens attendu ${sel2('sens', P.sens, { croissant: 'croissant (compteur)', decroissant: 'décroissant' }, 'croissant')}`;
                        else if (r.type === 'ts_fresh')
                            text = `retard maximal ${inp('maxAgeH', P.maxAgeH, '24', 'w-14')} h, mesuré depuis ${sel2('ref', P.ref, { max: 'le point le plus récent du fichier', now: 'maintenant' }, 'max')}`;
                        else if (r.type === 'ts_cover') text = `couverture minimale ${inp('minPct', P.minPct, '95', 'w-14')} %`;
                        else if (r.type === 'ts_season')
                            text = `créneau de comparaison ${sel2('bucket', P.bucket, { hour: 'même heure du jour', dow: 'même jour de semaine', month: 'même mois' }, 'hour')} · sensibilité k = ${inp('k', P.k, '4', 'w-12')}`;
                        else if (r.type === 'ts_gap')
                            text = `<span class="text-[10px] text-slate-400">tolérance ${Math.round((cfg.tol != null ? cfg.tol : 0.5) * 100)} % du pas · seules les séries cadencées sont jugées</span>`;
                        return `${text} ${filt}<div class="mt-0.5">${base} · <span class="text-[9px] text-slate-400">unité comptée : <b>${QR_TS_UNIT[r.type]}</b></span></div>`;
                    }
                    return '';
            }
        }
        // Toute règle affiche ce qu'elle mesure, sous ses réglages : une règle qu'on ne
        // comprend pas est une règle qu'on ne corrige pas.
        Studio.extend(
            'qrParamsHtml',
            _qrParamsHtmlRaw =>
                function (r) {
                    const base = _qrParamsHtmlRaw(r);
                    const e = qrExplain(r);
                    if (!e) return base;
                    return `${base}<details class="mt-1"><summary class="text-[10px] text-slate-400 cursor-pointer select-none">Comment ce contrôle mesure l'erreur</summary>
                <div class="mt-1 p-2 rounded-lg bg-slate-50 border border-slate-200">${qrExplainHtml(r)}</div></details>`;
                }
        );
        function renderQualityRules() {
            const qrContentElement = el('qrContent');
            if (!qrContentElement) return;
            const rules = qrRules();
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            const doms = themeList();
            const ran = rules.filter(r => r.last);
            const globalScore = qrScore(ran);
            // dettes : impact = poids x lignes en échec
            const debts = ran
                .filter(r => r.last.fails > 0)
                .sort((x, y) => (QR_W[y.crit] || 2) * y.last.fails - (QR_W[x.crit] || 2) * x.last.fails)
                .slice(0, 10);
            const byTable = {};
            ran.forEach(r => {
                if (r.table) (byTable[r.table] = byTable[r.table] || []).push(r);
            });
            qualInspectRegistry = qualInspectRegistry || [];
            let html = `<div class="flex items-center gap-3 flex-wrap mb-4">
                <button onclick="qrRun(this)" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-5 rounded-lg text-sm">▶ Exécuter</button>
                <button onclick="wizOpen('quality')" class="text-sm bg-white border border-amber-300 text-amber-700 px-3 py-2 rounded-lg font-bold hover:bg-amber-50" title="Parcours guidé : l'assistant mesure une source et propose des contrôles">🧭 Mode assistant</button>
                <select id="qrScope" class="border border-slate-300 rounded-lg p-2 text-sm bg-white">
                    <option value="">Toutes les tables</option>
                    ${tables.map(t => `<option value="t:${escapeHTML(t.name)}">Table : ${escapeHTML(t.name)}</option>`).join('')}
                    ${doms.map(d => `<option value="d:${escapeHTML(d)}">Domaine : ${escapeHTML(d)}</option>`).join('')}
                </select>
                ${globalScore != null ? `<span class="text-3xl font-black ${qrScoreColor(globalScore)}">${globalScore}<span class="text-sm text-slate-400">/100</span></span><span class="text-[10px] uppercase font-bold text-slate-400">score global<br>pondéré criticité</span>` : '<span class="text-xs text-slate-400 italic">exécutez une suite pour obtenir le score</span>'}
                <span class="flex-grow"></span>
                <button onclick="qrExportCsv()" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold text-slate-600">⬇ Résultats CSV</button>
                <button onclick="qrExportJson()" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold text-slate-600">⬇ Scorecard JSON</button>
            </div>`;
            // Scorecard par domaine / table
            if (Object.keys(byTable).length) {
                html += `<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">${Object.entries(byTable)
                    .map(([tn, rs]) => {
                        const sc = qrScore(rs);
                        const table = tableByName(tn);
                        return `<div class="border border-slate-200 rounded-xl p-3 bg-slate-50/50"><div class="text-2xl font-black ${qrScoreColor(sc)}">${sc == null ? '—' : sc}</div>
                            <div class="text-[11px] font-bold text-slate-700 truncate">${escapeHTML(tn)}</div>
                            <div class="text-[9px] text-slate-400">${table && (table.theme || '').trim() ? '🗂 ' + escapeHTML(table.theme) + ' · ' : ''}${rs.length} règle(s) · ${rs.reduce((a2, r) => a2 + r.last.fails, 0).toLocaleString('fr-FR')} échec(s)</div>
                            </div>`;
                    })
                    .join('')}</div>`;
            }
            // Dettes qualité
            if (debts.length) {
                html += `<details class="mb-4 border border-red-100 rounded-lg px-3 py-2 bg-red-50/40" open><summary class="text-xs font-bold text-red-700 cursor-pointer">🧨 Dettes qualité — règles les plus en échec (impact = criticité × lignes)</summary>
                <div class="mt-2 space-y-1">${debts
                    .map(r => {
                        const sql2 = qrInspectSql(r);
                        const idx = sql2 ? registerQualInspect('Règle : ' + r.name, sql2, qrExplainHtml(r)) : null;
                        return `<div class="flex items-center gap-2 text-xs bg-white border border-slate-200 rounded px-2 py-1.5"><span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${CRIT_COLORS[r.crit] || CRIT_COLORS['Faible']}">${r.crit}</span><strong>${escapeHTML(r.name)}</strong><span class="text-slate-400">${escapeHTML(r.table)}</span><span class="ml-auto font-bold text-red-600">${r.last.fails.toLocaleString('fr-FR')} ligne(s)</span><span class="text-slate-400">${(100 * r.last.rate).toFixed(1)} %</span>${idx != null ? qualInspectButtons(idx) : ''}</div>`;
                    })
                    .join('')}</div></details>`;
            }
            // Tendance + comparaison (E2)
            if (qrSnapshots.length) {
                const opts = qrSnapshots
                    .map(
                        (s2, i) =>
                            `<option value="${i}">${new Date(s2.at).toLocaleString('fr-FR')} — ${s2.global == null ? '—' : s2.global}/100</option>`
                    )
                    .join('');
                html += `<details class="mb-4 border border-slate-200 rounded-lg px-3 py-2" open><summary class="text-xs font-bold text-slate-600 cursor-pointer">📈 Tendance (${qrSnapshots.length} instantané(s)) & comparaison</summary>
                    <div class="h-[180px] relative mt-2"><canvas id="qrTrend"></canvas></div>
                    <div class="flex items-center gap-2 mt-2 text-xs flex-wrap">Comparer <select id="qrCmpA" class="border border-slate-200 rounded p-1 text-[11px] bg-white">${opts}</select> à <select id="qrCmpB" class="border border-slate-200 rounded p-1 text-[11px] bg-white">${opts}</select> <button onclick="qrCompare()" class="bg-white border border-slate-300 px-2 py-1 rounded font-bold text-slate-600">Δ Comparer</button></div>
                    <div id="qrCmpOut" class="mt-2"></div>
                        </details>`;
            }
            // CRUD des règles
            html += `<div class="flex items-center justify-between mb-1.5"><h3 class="text-sm font-bold text-slate-700">Règles (${rules.length})</h3><button onclick="qrAdd()" class="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold">+ Règle</button></div>
            <div class="border border-slate-200 rounded-lg overflow-x-auto"><table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2 w-8" title="Active">✓</th>
                <th class="p-2 w-44">Nom</th>
                <th class="p-2 w-36">Table</th>
                <th class="p-2 w-40">Type</th>
                <th class="p-2">Paramètres</th>
                <th class="p-2 w-24">Criticité</th>
                <th class="p-2 w-44">Dernier résultat</th>
                <th class="p-2 w-16"></th>
                </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">${rules
                    .map(r => {
                        const sql2 = r.last && r.last.fails > 0 ? qrInspectSql(r) : null;
                        const idx = sql2 ? registerQualInspect('Règle : ' + r.name, sql2, qrExplainHtml(r)) : null;
                        return `<tr class="${r.enabled ? '' : 'opacity-40'} hover:bg-slate-50 align-top">
                    <td class="p-2"><input type="checkbox" ${r.enabled ? 'checked' : ''} onchange="qrSet('${r.id}','enabled',this.checked)" class="w-4 h-4 rounded text-purple-600"></td>
                    <td class="p-2"><input type="text" value="${escapeHTML(r.name)}" onchange="qrSet('${r.id}','name',this.value)" class="font-bold border border-slate-200 p-1 rounded w-full"></td>
                    <td class="p-2"><select onchange="qrSet('${r.id}','table',this.value)" class="border border-slate-200 rounded px-1 py-1 bg-white w-full"><option value="">— cible —</option><optgroup label="Tables">${tables.map(t => `<option value="${escapeHTML(t.name)}" ${!r.bo && r.table === t.name ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}</optgroup>${(state.governance.businessObjects || []).length ? `<optgroup label="Objets métier">${(state.governance.businessObjects || []).map(b2 => `<option value="bo:${b2.id}" ${r.bo === b2.id ? 'selected' : ''}>🏛 ${escapeHTML(b2.name)}</option>`).join('')}</optgroup>` : ''}</select>${r.bo ? `<div class="text-[10px] text-emerald-700 mt-0.5" title="La règle est contrôlée sur chaque source où l\'attribut est mappé, puis agrégée">↳ contrôlée sur ${qrBoResolutions(r).length || '…'} correspondance(s)</div>` : ''}</td>
                    <td class="p-2"><select onchange="qrSet('${r.id}','type',this.value)" class="border border-slate-200 rounded px-1 py-1 bg-white w-full">${Object.entries(
                        QR_TYPES
                    )
                        .map(([k, l]) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${l}</option>`)
                        .join('')}</select></td>
                    <td class="p-2">${r.table || r.bo ? qrParamsHtml(r) : '<span class="text-slate-300 italic">choisissez une cible</span>'}</td>
                    <td class="p-2"><select onchange="qrSet('${r.id}','crit',this.value)" class="border border-slate-200 rounded px-1 py-1 bg-white">${CRITICALITY_OPTS.map(o => `<option ${o === r.crit ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
                    <td class="p-2">${r.last ? `<span class="font-black ${qrScoreColor(Math.round(100 * r.last.rate))}">${(100 * r.last.rate).toFixed(1)} %</span> <span class="text-slate-400">· ${r.last.fails.toLocaleString('fr-FR')} ${QR_TS_UNIT[r.type] || (QR_GROUPED.includes(r.type) ? 'groupe' : 'ligne')}(s) en échec</span>${idx != null ? '<br>' + qualInspectButtons(idx) : ''}` : '<span class="text-slate-300 italic">jamais exécutée</span>'}</td>
                    <td class="p-2 whitespace-nowrap"><button onclick="qrRunOne('${r.id}', this)" class="text-purple-600 hover:text-purple-800 font-bold" title="Exécuter uniquement cette règle">▶</button> <button onclick="qrDup('${r.id}')" class="text-slate-300 hover:text-indigo-600" title="Dupliquer">⧉</button> <button onclick="qrDel('${r.id}')" class="text-slate-300 hover:text-red-500 font-bold" title="Supprimer">✕</button></td>
                </tr>`;
                    })
                    .join('')}</tbody></table></div>
            <p class="text-[10px] text-slate-400 mt-1.5">Les règles sont persistées avec la gouvernance (bundles compris) et <strong>rejouées automatiquement</strong> quand la source correspondante est rafraîchie. Tout le calcul est fait en SQL DuckDB, en une passe par table.</p>`;
            qrContentElement.innerHTML = html;
            // tendance (Chart.js si dispo)
            try {
                if (qrChartInst) {
                    qrChartInst.destroy();
                    qrChartInst = null;
                }
                const qrTrendElement = el('qrTrend');
                if (qrTrendElement && typeof Chart !== 'undefined' && qrSnapshots.length) {
                    qrChartInst = new Chart(qrTrendElement.getContext('2d'), {
                        type: 'line',
                        data: {
                            labels: qrSnapshots.map(
                                s2 =>
                                    new Date(s2.at).toLocaleDateString('fr-FR') +
                                    ' ' +
                                    new Date(s2.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                            ),
                            datasets: [
                                {
                                    label: 'Score global',
                                    data: qrSnapshots.map(s2 => s2.global),
                                    borderColor: '#7c3aed',
                                    backgroundColor: '#7c3aed22',
                                    tension: 0.25,
                                    fill: true
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: { y: { min: 0, max: 100 } },
                            plugins: { legend: { display: false } }
                        }
                    });
                }
            } catch (e) {
                console.warn('Tendance indisponible :', e);
            }
        }
        function qrCompare() {
            const A = qrSnapshots[parseInt(el('qrCmpA').value)],
                B = qrSnapshots[parseInt(el('qrCmpB').value)];
            const out = el('qrCmpOut');
            if (!A || !B || !out) return;
            const tns = [...new Set([...Object.keys(A.tables || {}), ...Object.keys(B.tables || {})])];
            out.innerHTML = `<table class="w-full text-left text-[11px] border border-slate-200 rounded"><thead class="bg-slate-50 text-[9px] uppercase font-bold text-slate-500"><tr><th class="p-1.5">Table</th>
                <th class="p-1.5 text-right">${new Date(A.at).toLocaleDateString('fr-FR')}</th>
                <th class="p-1.5 text-right">${new Date(B.at).toLocaleDateString('fr-FR')}</th>
                <th class="p-1.5 text-right">Δ</th></tr></thead>
                <tbody>${tns
                    .map(tn => {
                        const a2 = (A.tables[tn] || {}).score,
                            b2 = (B.tables[tn] || {}).score;
                        const d = a2 != null && b2 != null ? b2 - a2 : null;
                        return `<tr class="border-t border-slate-100"><td class="p-1.5 font-bold">${escapeHTML(tn)}</td><td class="p-1.5 text-right">${a2 == null ? '—' : a2}</td>
                            <td class="p-1.5 text-right">${b2 == null ? '—' : b2}</td>
                            <td class="p-1.5 text-right font-black ${d == null ? '' : d >= 0 ? 'text-emerald-600' : 'text-red-600'}">${d == null ? '—' : (d > 0 ? '+' : '') + d}</td>
                            </tr>`;
                    })
                    .join('')}</tbody></table>`;
        }
