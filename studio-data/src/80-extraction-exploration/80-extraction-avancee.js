        // ======================= Extraction avancée (SQL & gouvernance) =======================
        // Un moteur d'extraction déclaratif 100% DuckDB : on décrit colonnes (avec transformations et
        // alias métier), filtres, dédoublonnage par clé fonctionnelle et agrégats ; on génère une seule
        // requête SQL, on l'affiche, on compte/prévisualise avant de lancer, et on peut la piloter
        // directement depuis un objet métier (colonnes = attributs métier, filtres = filtres des facettes).
        const ADV_TRANSFORMS = {
            none: '— brut —',
            trim: 'Espaces (trim)',
            upper: 'MAJUSCULES',
            lower: 'minuscules',
            noaccent: 'Sans accents'
        };
        const ADV_AGGS = {
            count: 'Nombre de lignes (NB / NB.SI.ENS)',
            countd: 'Nombre distinct',
            sum: 'Somme (SOMME.SI.ENS)',
            avg: 'Moyenne (MOYENNE.SI.ENS)',
            min: 'Minimum',
            max: 'Maximum'
        };
        // Fonctions calculées « façon Excel » disponibles dans les colonnes.
        const ADV_CALC_FNS = {
            concat: 'CONCATENER (2 colonnes ou plus + séparateur)',
            left: 'GAUCHE (n premiers caractères)',
            right: 'DROITE (n derniers)',
            mid: 'STXT (extraire du milieu)',
            len: 'NBCAR (longueur)',
            si: 'SI (condition → valeur A sinon B)'
        };

        function advReachableTables() {
            const extractSpec = state.advExtract;
            if (!extractSpec.baseId) return [];
            const ids = getReachableTables(extractSpec.baseId);
            return ids.map(id => state.tables[id]).filter(t => t && t.status === 'ready');
        }
        // V6.6 : attributs extraits par niveau de hiérarchie (1 ou plusieurs). Une valeur vide (identifiant
        // par défaut) est résolue vers la colonne identifiant.
        function advHierAttrs(conf) {
            const raw = conf.labelCols && conf.labelCols.length ? conf.labelCols : [conf.labelCol || ''];
            return raw.map(c => c || conf.idCol).filter(Boolean);
        }
        /** La transformation demandée, appliquée à n'importe quelle expression. */
        function advTransformee(expression, transformation) {
            switch (transformation) {
                case 'trim':
                    return `TRIM(CAST(${expression} AS VARCHAR))`;
                case 'upper':
                    return `UPPER(TRIM(CAST(${expression} AS VARCHAR)))`;
                case 'lower':
                    return `LOWER(TRIM(CAST(${expression} AS VARCHAR)))`;
                case 'noaccent':
                    return `strip_accents(TRIM(CAST(${expression} AS VARCHAR)))`;
                default:
                    return expression;
            }
        }
        function advColExpr(map, c) {
            if (c.kind === 'calc') return advCalcExpr(map, c.calc);
            const q = `${advAlias(map, c)}.${sqlIdent(c.col)}`;
            switch (c.transform) {
                case 'trim':
                    return `TRIM(CAST(${q} AS VARCHAR))`;
                case 'upper':
                    return `UPPER(TRIM(CAST(${q} AS VARCHAR)))`;
                case 'lower':
                    return `LOWER(TRIM(CAST(${q} AS VARCHAR)))`;
                case 'noaccent':
                    return `strip_accents(TRIM(CAST(${q} AS VARCHAR)))`;
                default:
                    return q;
            }
        }
        // Traduit une colonne calculée « façon Excel » en SQL DuckDB.
        function advCalcExpr(map, calc) {
            const ref = r => `COALESCE(CAST(${advAlias(map, r)}.${sqlIdent(r.col)} AS VARCHAR), '')`;
            const a = calc.a ? ref(calc.a) : "''";
            switch (calc.fn) {
                case 'concat': {
                    // V6.4 : concaténation de 2 colonnes OU PLUS avec le séparateur choisi (concat_ws
                    // ignore les valeurs vides → pas de séparateur orphelin). Rétro-compat : ancien a+b.
                    if (calc.parts && calc.parts.length) {
                        const refRaw = r => `NULLIF(TRIM(CAST(${advAlias(map, r)}.${sqlIdent(r.col)} AS VARCHAR)), '')`;
                        return `concat_ws(${sqlLiteral(calc.sep != null ? calc.sep : ' ')}, ${calc.parts.map(refRaw).join(', ')})`;
                    }
                    return `${a} || ${sqlLiteral(calc.sep || ' ')} || ${calc.b ? ref(calc.b) : "''"}`;
                }
                case 'left':
                    return `LEFT(${a}, ${parseInt(calc.n) || 1})`;
                case 'right':
                    return `RIGHT(${a}, ${parseInt(calc.n) || 1})`;
                case 'mid':
                    return `SUBSTRING(${a}, ${parseInt(calc.start) || 1}, ${parseInt(calc.n) || 1})`;
                case 'len':
                    return `LENGTH(${a})`;
                case 'si': {
                    const cond = advCondSql(advAlias(map, calc.a), {
                        col: calc.a.col,
                        op: calc.op || '=',
                        val: calc.val || ''
                    });
                    return `CASE WHEN ${cond} THEN ${sqlLiteral(calc.then || '')} ELSE ${sqlLiteral(calc.else || '')} END`;
                }
                default:
                    return "''";
            }
        }
        // Besoins de jointure d'une colonne, avec le LIEN emprunté (via) — cf. advPlanJoins.
        // ---- Une colonne d'une table liée qui a PLUSIEURS valeurs -----------------------
        //
        // Une affaire, 20 094 lignes. On ajoute une colonne de la table ÉTABLISSEMENT, reliée par
        // deux tables intermédiaires : le fichier passe à 1 031 862 lignes. Rien n'est faux —
        // c'est ce que fait une jointure quand il y a plusieurs correspondances — mais ce n'est
        // pas ce qu'on demandait : on voulait ses 20 094 affaires, avec l'établissement en face.
        //
        // Chaque colonne venant d'une table liée porte donc son réglage. Par défaut, elle rend
        // UNE SEULE ligne par ligne de départ. L'éclatement reste possible, mais il se demande.
        const ADV_PLUSIEURS_VALEURS = {
            regroupees: 'une seule ligne, valeurs regroupées',
            premiere: 'une seule ligne, la première valeur',
            lignes: 'une ligne par valeur (le fichier grossit)'
        };
        /** Le réglage effectif : sur la table de départ, la question ne se pose pas. */
        function advPlusieursValeurs(colonne, baseId) {
            if (!colonne || colonne.kind || colonne.tableId === baseId) return 'lignes';
            // « L'un ou l'autre chemin » réunit la valeur de PLUSIEURS liens en une seule colonne :
            // cela se fait en joignant les deux routes, pas en allant chercher par un chemin unique.
            if (colonne.via === 'any') return 'lignes';
            return ADV_PLUSIEURS_VALEURS[colonne.plusieurs] ? colonne.plusieurs : 'regroupees';
        }
        /** Cette colonne est-elle ramenée par une sous-requête plutôt que par une jointure ? */
        function advColonneSansJointure(colonne, baseId) {
            return advPlusieursValeurs(colonne, baseId) !== 'lignes';
        }
        function advChangerPlusieursValeurs(identifiant, reglage) {
            const colonne = state.advExtract.columns.find(c => c.id === identifiant);
            if (!colonne) return;
            colonne.plusieurs = reglage;
            renderAdvExtract();
        }
        function advColNeeds(c, baseId) {
            if (c.kind === 'link' || c.kind === 'hier') return [];
            // Ramenée par une sous-requête : elle ne demande aucune jointure, et c'est bien là
            // tout l'intérêt — une jointure multiplierait les lignes du fichier.
            //
            // Sans table de départ, on rend le besoin quand même : l'appelant cherche alors les
            // TABLES en jeu, pour savoir par quel lien les atteindre. La question du chemin se
            // pose de la même façon, que la valeur vienne d'une jointure ou d'une sous-requête.
            if (!c.kind && baseId && advColonneSansJointure(c, baseId)) return [];
            if (c.kind !== 'calc') return [{ tableId: c.tableId, via: c.via || '' }];
            const out = [];
            (c.calc.parts || []).forEach(p => {
                if (p && p.tableId) out.push({ tableId: p.tableId, via: p.via || '' });
            });
            if (c.calc.a) out.push({ tableId: c.calc.a.tableId, via: c.calc.a.via || '' });
            if (c.calc.b) out.push({ tableId: c.calc.b.tableId, via: c.calc.b.via || '' });
            return out;
        }
        const ADV_OPS = {
            '=': '=',
            '!=': '≠',
            'contains': 'contient',
            'in': 'dans la liste (;)',
            '>=': '≥ (nombre)',
            '<=': '≤ (nombre)',
            'dfrom': 'à partir du (date)',
            'dto': "jusqu'au (date)",
            'empty': 'est vide',
            'notempty': "n'est pas vide"
        };
        function advCondSql(alias, c) {
            const raw = `CAST(${alias}.${sqlIdent(c.col)} AS VARCHAR)`;
            const norm = `UPPER(TRIM(${raw}))`;
            if (c.op === 'empty') return `(${alias}.${sqlIdent(c.col)} IS NULL OR TRIM(${raw}) = '')`;
            if (c.op === 'notempty') return `(${alias}.${sqlIdent(c.col)} IS NOT NULL AND TRIM(${raw}) <> '')`;
            if (c.op === 'contains')
                return `LOWER(COALESCE(${raw}, '')) LIKE '%' || ${sqlLiteral(String(c.val).toLowerCase())} || '%'`;
            if (c.op === '!=') return `COALESCE(${norm}, '') <> ${sqlLiteral(String(c.val).toUpperCase())}`;
            if (c.op === 'in') {
                const vals = String(c.val || '')
                    .split(';')
                    .map(x => x.trim())
                    .filter(Boolean);
                return vals.length ? `${norm} IN (${vals.map(v => sqlLiteral(v.toUpperCase())).join(', ')})` : 'TRUE';
            }
            if (c.op === '>=' || c.op === '<=') {
                const num = `TRY_CAST(REPLACE(${raw}, ',', '.') AS DOUBLE)`;
                return `${num} ${c.op} ${parseFloat(String(c.val).replace(',', '.')) || 0}`;
            }
            if (c.op === 'dfrom' || c.op === 'dto') {
                const d = `COALESCE(TRY_CAST(${raw} AS DATE), CAST(TRY_CAST(${raw} AS TIMESTAMP) AS DATE))`;
                return `${d} ${c.op === 'dfrom' ? '>=' : '<='} DATE ${sqlLiteral(c.val)}`;
            }
            return `${norm} = ${sqlLiteral(String(c.val).toUpperCase())}`;
        }
        // ---- V6.13 : DEUX TABLES, PLUSIEURS LIENS — on demande lequel utiliser ----
        // Deux tables peuvent être reliées plusieurs fois (ex. CONTRAT.souscripteur et
        // CONTRAT.beneficiaire pointant tous deux sur CLIENT). Sans choix explicite, l'extraction
        // prenait silencieusement le premier lien trouvé. On matérialise donc le choix, par PAIRE.
        function advRelValid(r) {
            return (
                r &&
                r.sourceCol &&
                r.targetCol &&
                state.tables[r.sourceTable] &&
                state.tables[r.targetTable] &&
                state.tables[r.sourceTable].status === 'ready' &&
                state.tables[r.targetTable].status === 'ready'
            );
        }
        function advRelPairKey(r) {
            return [r.sourceTable, r.targetTable].slice().sort().join('|');
        }
        function advRelsByPair() {
            const out = {};
            (state.relations || []).filter(advRelValid).forEach(r => {
                const k = advRelPairKey(r);
                (out[k] = out[k] || []).push(r);
            });
            return out;
        }
        function advRelLabel(r) {
            const table = state.tables[r.sourceTable],
                b = state.tables[r.targetTable];
            return (
                `${table ? table.name : '?'}.${r.sourceCol} = ${b ? b.name : '?'}.${r.targetCol}` +
                (r.cardinality ? ` (${r.cardinality})` : '')
            );
        }
        function advChosenRel(pairKey) {
            const list = advRelsByPair()[pairKey] || [];
            if (!list.length) return null;
            const id = ((state.advExtract || {}).joinChoice || {})[pairKey];
            return list.find(r => r.id === id) || list[0];
        }
        function advSetJoinChoice(pairKey, relId) {
            const extractSpec = state.advExtract;
            extractSpec.joinChoice = extractSpec.joinChoice || {};
            extractSpec.joinChoice[pairKey] = relId;
            renderAdvExtract();
        }
        // Paires réellement utilisées par le plan de jointures ET reliées par plusieurs liens.
        function advJoinChoices(spec) {
            if (!spec || !spec.baseId || !state.tables[spec.baseId]) return [];
            const needs = [{ tableId: spec.baseId, via: '' }];
            (spec.columns || []).forEach(c => advColNeeds(c).forEach(x => needs.push(x)));
            (spec.filters || []).forEach(f => needs.push({ tableId: f.tableId, via: f.via || '' }));
            if (spec.group && spec.group.on)
                (spec.group.aggs || []).forEach(a => {
                    if (a.tableId) needs.push({ tableId: a.tableId, via: a.via || '' });
                    (a.conds || []).forEach(cc => needs.push({ tableId: cc.tableId, via: cc.via || '' }));
                });
            (spec.columns || [])
                .filter(c => c.kind === 'link' || c.kind === 'hier')
                .forEach(c => {
                    const anchor = advLinkAnchor(spec.baseId, c.tableId, c.via);
                    if (anchor) needs.push({ tableId: anchor.parentId, via: anchor.parentVia || '' });
                });
            let joins = [];
            try {
                joins = advPlanJoins(spec.baseId, needs).joins || [];
            } catch (e) {
                return [];
            }
            const byPair = advRelsByPair();
            const out = [];
            const seen = new Set();
            joins.forEach(j => {
                if (!j.rel) return;
                const k = advRelPairKey(j.rel);
                if (seen.has(k)) return;
                seen.add(k);
                const list = byPair[k] || [];
                if (list.length < 2) return;
                const [ia, ib] = k.split('|');
                out.push({
                    key: k,
                    a: (state.tables[ia] || {}).name || '?',
                    b: (state.tables[ib] || {}).name || '?',
                    rels: list,
                    chosen: advChosenRel(k)
                });
            });
            return out;
        }
        // Ancrage d'une table « résumée » : la relation qui la relie au chemin de jointures.
        // V6.16 : si un chemin explicite est fourni, l'ancrage suit CE chemin — la table parente est
        // alors la dernière étape avant l'arrivée, avec sa propre route (parentVia) pour l'alias SQL.
        function advLinkAnchor(baseId, tableId, via) {
            if (tableId === baseId) return null;
            if (via) {
                const ids = String(via).split('>').filter(Boolean);
                const path = ids.map(id => (state.relations || []).find(r => r.id === id)).filter(advRelValid);
                if (path.length === ids.length && path.length) {
                    let cur = baseId;
                    const prefix = [];
                    for (let i = 0; i < path.length; i++) {
                        const relation = path[i];
                        const nxt =
                            relation.sourceTable === cur
                                ? relation.targetTable
                                : relation.targetTable === cur
                                  ? relation.sourceTable
                                  : null;
                        if (nxt == null) break;
                        if (i === path.length - 1) {
                            if (nxt !== tableId) break;
                            return {
                                parentId: cur,
                                parentVia: prefix.join('>'),
                                childCol: relation.sourceTable === tableId ? relation.sourceCol : relation.targetCol,
                                parentCol: relation.sourceTable === tableId ? relation.targetCol : relation.sourceCol
                            };
                        }
                        prefix.push(relation.id);
                        cur = nxt;
                    }
                }
                // chemin invalide → on retombe sur le chemin par défaut plutôt que de tout casser
            }
            const rels = Object.keys(advRelsByPair())
                .map(k => advChosenRel(k))
                .filter(Boolean);
            const adj = {};
            rels.forEach(r => {
                (adj[r.sourceTable] = adj[r.sourceTable] || []).push({ rel: r, other: r.targetTable });
                (adj[r.targetTable] = adj[r.targetTable] || []).push({ rel: r, other: r.sourceTable });
            });
            const prev = {};
            const seen = new Set([baseId]);
            const queue = [baseId];
            while (queue.length && !prev[tableId]) {
                const cur = queue.shift();
                for (const e of adj[cur] || []) {
                    if (!seen.has(e.other)) {
                        seen.add(e.other);
                        prev[e.other] = { from: cur, rel: e.rel };
                        queue.push(e.other);
                    }
                }
            }
            if (!prev[tableId]) return null;
            const st = prev[tableId];
            const rel = st.rel;
            return {
                parentId: st.from,
                parentVia: '',
                childCol: rel.sourceTable === tableId ? rel.sourceCol : rel.targetCol,
                parentCol: rel.sourceTable === tableId ? rel.targetCol : rel.sourceCol
            };
        }
        /**
         * Le chemin complet entre la table de départ et une table liée, saut par saut.
         *
         * `advLinkAnchor` ne rend que le DERNIER saut. Cela suffit quand les deux tables sont
         * reliées directement, pas quand il y a une table de liaison au milieu : il faut alors
         * savoir traverser, et c'est ce que rend cette fonction.
         *
         * Chaque étape dit d'où l'on part, où l'on arrive, et par quel lien.
         * Renvoie null si la table n'est pas reliée à la table de départ.
         */
        function advCheminDuLien(baseId, tableId, via) {
            if (tableId === baseId) return null;
            const etape = (relation, de, vers) => ({ relation, de, vers });
            // Un chemin explicite (« via ») : la suite des liens est donnée, on la suit.
            if (via) {
                const identifiants = String(via).split('>').filter(Boolean);
                const liens = identifiants.map(id => (state.relations || []).find(r => r.id === id)).filter(advRelValid);
                if (liens.length === identifiants.length && liens.length) {
                    const chemin = [];
                    let courant = baseId;
                    for (const relation of liens) {
                        const suivant =
                            relation.sourceTable === courant
                                ? relation.targetTable
                                : relation.targetTable === courant
                                  ? relation.sourceTable
                                  : null;
                        if (suivant == null) return null;
                        chemin.push(etape(relation, courant, suivant));
                        courant = suivant;
                    }
                    return courant === tableId ? chemin : null;
                }
                // Chemin invalide : on retombe sur le chemin par défaut plutôt que de tout casser.
            }
            // Le chemin par défaut : le plus court, avec un seul lien par paire de tables —
            // exactement celui que `advPlanJoins` emprunterait, pour que les deux concordent.
            const liens = Object.keys(advRelsByPair())
                .map(k => advChosenRel(k))
                .filter(Boolean);
            const voisins = {};
            liens.forEach(r => {
                (voisins[r.sourceTable] = voisins[r.sourceTable] || []).push({ relation: r, autre: r.targetTable });
                (voisins[r.targetTable] = voisins[r.targetTable] || []).push({ relation: r, autre: r.sourceTable });
            });
            const venantDe = {};
            const vus = new Set([baseId]);
            const file = [baseId];
            while (file.length && !venantDe[tableId]) {
                const courant = file.shift();
                for (const v of voisins[courant] || []) {
                    if (!vus.has(v.autre)) {
                        vus.add(v.autre);
                        venantDe[v.autre] = { de: courant, relation: v.relation };
                        file.push(v.autre);
                    }
                }
            }
            if (!venantDe[tableId]) return null;
            const chemin = [];
            let courant = tableId;
            while (courant !== baseId) {
                const pas = venantDe[courant];
                chemin.unshift(etape(pas.relation, pas.de, courant));
                courant = pas.de;
            }
            return chemin;
        }
        /** Les deux colonnes d'un lien, vues depuis la table d'arrivée de l'étape. */
        function advColonnesDUnPas(pas) {
            const versEstSource = pas.relation.sourceTable === pas.vers;
            return {
                colonneArrivee: versEstSource ? pas.relation.sourceCol : pas.relation.targetCol,
                colonneDepart: versEstSource ? pas.relation.targetCol : pas.relation.sourceCol
            };
        }
        /**
         * La partie « FROM … » d'une synthèse de table liée, et la condition qui la raccroche à la
         * ligne en cours.
         *
         * Quand la table résumée est reliée DIRECTEMENT à la table de départ, c'est immédiat.
         * Quand il y a une table de liaison au milieu, cette table est traversée À L'INTÉRIEUR de la
         * sous-requête — surtout pas jointe au résultat. C'est tout l'objet du correctif : une table
         * de liaison porte plusieurs lignes pour une même ligne de départ ; la joindre multipliait
         * les lignes du fichier produit, alors que l'écran promet « 1 ligne par ligne de la table de
         * départ — jamais de multiplication de lignes ».
         */
        function advSourceDeLaSynthese(map, chemin) {
            const dernier = chemin[chemin.length - 1];
            const sources = [sqlIdent(duckTableName(dernier.vers)) + ' s'];
            const aliasDe = {};
            aliasDe[dernier.vers] = 's';
            // On remonte le chemin à l'envers : chaque table intermédiaire est jointe dans la
            // sous-requête, jamais dehors.
            for (let i = chemin.length - 1; i >= 1; i--) {
                const pas = chemin[i];
                const aliasAmont = 'lk' + i;
                aliasDe[pas.de] = aliasAmont;
                const { colonneArrivee, colonneDepart } = advColonnesDUnPas(pas);
                sources.push(
                    `JOIN ${sqlIdent(duckTableName(pas.de))} ${aliasAmont} ON ` +
                        `${advNk(aliasAmont + '.' + sqlIdent(colonneDepart))} = ${advNk(aliasDe[pas.vers] + '.' + sqlIdent(colonneArrivee))}`
                );
            }
            // Le premier pas raccroche la sous-requête à la ligne en cours du résultat.
            const premier = chemin[0];
            const { colonneArrivee, colonneDepart } = advColonnesDUnPas(premier);
            const aliasDeLaBase = advAlias(map, { tableId: premier.de, via: '' });
            return {
                source: sources.join(' '),
                condition: `${advNk(aliasDe[premier.vers] + '.' + sqlIdent(colonneArrivee))} = ${advNk(aliasDeLaBase + '.' + sqlIdent(colonneDepart))}`,
                aliasDe
            };
        }
        /**
         * Les tables sur lesquelles un critère de synthèse peut porter : celles que la
         * sous-requête traverse. La table de départ n'en fait pas partie — un critère posé
         * sur elle filtrerait l'extraction entière, ce qui est justement ce qu'on veut éviter.
         */
        function advTablesDUneSynthese(baseId, tableId, via) {
            const chemin = advCheminDuLien(baseId, tableId, via);
            if (!chemin) return [];
            return [...new Set(chemin.map(pas => pas.vers))];
        }
        /**
         * Les critères d'une synthèse, traduits en SQL.
         *
         * Ils s'ajoutent À L'INTÉRIEUR de la sous-requête : ils restreignent ce qui est COMPTÉ,
         * jamais les lignes du fichier. Un contrat sans aucun sinistre ouvert sort donc avec 0,
         * au lieu de disparaître comme le ferait un filtre ordinaire posé sur « SINISTRES ».
         */
        function advCriteresDeLaSyntheseSql(colonne, aliasDe) {
            return (colonne.conds || [])
                .map(critere => advCondSql(aliasDe[critere.tableId] || 's', critere))
                .filter(Boolean)
                .map(sql => ' AND ' + sql)
                .join('');
        }
        /** Les critères d'une synthèse, en une phrase lisible : « si ÉTAT = OUVERT ». */
        function advCriteresDeLaSyntheseTexte(colonne) {
            const criteres = colonne.conds || [];
            if (!criteres.length) return '';
            return (
                ' si ' +
                criteres
                    .map(critere => {
                        const nomTable = (state.tables[critere.tableId] || {}).name || '?';
                        const valeur = critere.op === 'empty' || critere.op === 'notempty' ? '' : ` "${critere.val}"`;
                        return `${nomTable}.${critere.col} ${ADV_OPS[critere.op] || critere.op}${valeur}`;
                    })
                    .join(' et ')
            );
        }
        const advNk = x => `NULLIF(UPPER(TRIM(CAST(${x} AS VARCHAR))), '')`;
        // Planifie les jointures (LEFT) reliant chaque table nécessaire à la base via les relations du
        // MCD. Les liens INDIRECTS sont gérés : si une table n'est pas reliée directement, on cherche
        // le plus court chemin (BFS) à travers les tables intermédiaires (tables de lien, plusieurs
        // sauts possibles) et TOUTES les tables du chemin sont jointes automatiquement.
        // V6.14 : une table peut être jointe PLUSIEURS FOIS, une fois par lien. Un « besoin » est donc
        // { tableId, via } où « via » est l'identifiant du lien emprunté au dernier saut ('' = lien par
        // défaut). Chaque route obtient son propre alias SQL, ce qui permet de ramener les colonnes de la
        // même table par des liens différents dans la MÊME extraction (souscripteur ET bénéficiaire).
        function advRouteKey(tableId, via) {
            return tableId + '|' + (via || '');
        }
        function advAlias(map, x) {
            if (!x) return 'x0';
            return map[advRouteKey(x.tableId, x.via)] || map[advRouteKey(x.tableId, '')] || 'x0';
        }
        // V6.15 : un « via » est un CHEMIN complet (1..N liens), pas seulement un lien direct — le
        // chemin peut traverser des tables intermédiaires (tables de liaison). Clé = ids joints par '>'.
        function advPathKey(path) {
            return path.map(r => r.id).join('>');
        }
        function advPathLabel(path) {
            if (!path.length) return '';
            const names = []; // suite des tables traversées, pour se repérer d'un coup d'œil
            let cur = (state.advExtract || {}).baseId;
            path.forEach(r => {
                const nxt = r.sourceTable === cur ? r.targetTable : r.sourceTable;
                names.push((state.tables[nxt] || {}).name || '?');
                cur = nxt;
            });
            const detail = path.map(r => advRelLabel(r)).join('  ›  ');
            return (path.length > 1 ? '⇢ ' + names.join(' → ') + '  ·  ' : '') + detail;
        }
        // Tous les chemins simples entre la table de départ et une table cible (bornés pour rester lisibles).
        function advPaths(baseId, targetId, maxHops) {
            maxHops = maxHops || 3;
            const rels = (state.relations || []).filter(advRelValid);
            const adj = {};
            rels.forEach(r => {
                (adj[r.sourceTable] = adj[r.sourceTable] || []).push({ rel: r, other: r.targetTable });
                (adj[r.targetTable] = adj[r.targetTable] || []).push({ rel: r, other: r.sourceTable });
            });
            const out = [];
            const seen = new Set();
            const walk = (cur, visited, path) => {
                if (path.length >= maxHops || out.length >= 12) return;
                (adj[cur] || []).forEach(e => {
                    if (out.length >= 12) return;
                    const np = path.concat([e.rel]);
                    if (e.other === targetId) {
                        const k = advPathKey(np);
                        if (!seen.has(k)) {
                            seen.add(k);
                            out.push(np);
                        }
                        return;
                    }
                    if (visited.has(e.other)) return;
                    walk(e.other, new Set([...visited, e.other]), np);
                });
            };
            if (baseId && targetId && baseId !== targetId) walk(baseId, new Set([baseId]), []);
            return out;
        }
        // Chemins proposables pour une table : seulement s'il y en a PLUSIEURS (sinon aucune ambiguïté).
        function advViaOptions(tableId) {
            const base = (state.advExtract || {}).baseId;
            if (!tableId || tableId === base) return [];
            const paths = advPaths(base, tableId);
            if (paths.length < 2) return [];
            return paths.map(pth => ({ key: advPathKey(pth), label: advPathLabel(pth), path: pth }));
        }
        function advViaLabel(via) {
            const ids = String(via || '')
                .split('>')
                .filter(Boolean);
            const path = ids.map(id => (state.relations || []).find(x => x.id === id)).filter(Boolean);
            return path.length === ids.length ? advPathLabel(path) : '';
        }
        // V6.16 : le choix du chemin est le MÊME composant partout (colonnes, calculs/concaténation,
        // filtres, agrégats et leurs critères, synthèses, hiérarchies). Un seul trio de fonctions :
        // le gabarit HTML, la synchronisation à chaque changement de table, la lecture de la valeur.
        function advViaSelectHtml(id) {
            return (
                `<span id="${id}-wrap" class="hidden items-center gap-1"><span class="text-[10px] font-bold text-amber-700" title="Ces deux tables sont reliées par plusieurs chemins : choisissez celui à emprunter.">via</span>` +
                `<select id="${id}" class="border border-amber-300 p-1.5 rounded text-[11px] bg-white max-w-[280px]"></select></span>`
            );
        }
        function advViaSync(id, tableId) {
            const w = el(id + '-wrap'),
                sel = el(id);
            if (!w || !sel) return;
            const cur = sel.value;
            const opts = advViaOptions(tableId);
            w.classList.toggle('hidden', opts.length === 0);
            w.classList.toggle('inline-flex', opts.length > 0);
            sel.innerHTML =
                '<option value="">— chemin par défaut —</option>' +
                opts.map(o => `<option value="${escapeHTML(o.key)}">${escapeHTML(o.label)}</option>`).join('');
            if (opts.some(o => o.key === cur)) sel.value = cur; // on garde le choix si la table n'a pas changé
        }
        // Valeur du sélecteur, ou '' s'il est masqué (aucune ambiguïté) — jamais de « via » fantôme.
        function advViaVal(id) {
            const w = el(id + '-wrap'),
                sel = el(id);
            return w && sel && !w.classList.contains('hidden') ? sel.value || '' : '';
        }
        // Suffixe lisible « via … » pour les libellés (colonnes, filtres, agrégats).
        function advViaTxt(via) {
            const l = via ? advViaLabel(via) : '';
            return l ? ` via ${l}` : '';
        }
        function advPlanJoins(baseId, needs) {
            needs = (needs || []).map(x => (typeof x === 'string' ? { tableId: x, via: '' } : x)).filter(x => x && x.tableId);
            const map = {};
            map[advRouteKey(baseId, '')] = 'x0';
            const joined = new Set([baseId]);
            const joins = [];
            let n = 1;
            const allRels = (state.relations || []).filter(advRelValid);
            // Chemin PAR DÉFAUT : un seul lien par paire (celui choisi, sinon le premier déclaré).
            const rels = Object.keys(advRelsByPair())
                .map(k => advChosenRel(k))
                .filter(Boolean);
            const adj = {};
            rels.forEach(r => {
                (adj[r.sourceTable] = adj[r.sourceTable] || []).push({ rel: r, other: r.targetTable });
                (adj[r.targetTable] = adj[r.targetTable] || []).push({ rel: r, other: r.sourceTable });
            });
            // Pose une jointure et renvoie son alias ; « fromAlias » est le côté déjà joint.
            const addJoin = (rel, id, fromAlias) => {
                const a = 'x' + n++;
                const idCol = rel.sourceTable === id ? rel.sourceCol : rel.targetCol;
                const otherCol = rel.sourceTable === id ? rel.targetCol : rel.sourceCol;
                joins.push({
                    id,
                    alias: a,
                    rel,
                    on: `UPPER(TRIM(CAST(${a}.${sqlIdent(idCol)} AS VARCHAR))) = UPPER(TRIM(CAST(${fromAlias}.${sqlIdent(otherCol)} AS VARCHAR)))`
                });
                return a;
            };
            const unreachable = [];
            const defaultTargets = [...new Set(needs.filter(x => !x.via).map(x => x.tableId))].filter(x => x !== baseId);
            // 1. Routes PAR DÉFAUT (BFS, un lien par paire) — comportement historique.
            for (const target of defaultTargets) {
                if (joined.has(target)) continue;
                const prev = {};
                const queue = Array.from(joined);
                const seen = new Set(joined);
                while (queue.length && !prev[target]) {
                    const cur = queue.shift();
                    for (const e of adj[cur] || []) {
                        if (!seen.has(e.other)) {
                            seen.add(e.other);
                            prev[e.other] = { from: cur, rel: e.rel };
                            queue.push(e.other);
                        }
                    }
                }
                if (!prev[target]) {
                    unreachable.push(target);
                    continue;
                }
                const path = [];
                let cur = target;
                while (!joined.has(cur)) {
                    path.unshift({ id: cur, rel: prev[cur].rel, from: prev[cur].from });
                    cur = prev[cur].from;
                }
                path.forEach(stp => {
                    const a = addJoin(stp.rel, stp.id, map[advRouteKey(stp.from, '')]);
                    map[advRouteKey(stp.id, '')] = a;
                    joined.add(stp.id);
                });
            }
            // 2. Routes EXPLICITES : on PARCOURT le chemin depuis la table de départ, en posant un alias
            //    dédié à CHAQUE saut — y compris les tables intermédiaires (tables de liaison). La même
            //    table peut donc être jointe plusieurs fois, par des chemins directs ou indirects.
            needs
                .filter(x => x.via)
                .forEach(x => {
                    const key = advRouteKey(x.tableId, x.via);
                    if (map[key]) return;
                    const ids = String(x.via).split('>').filter(Boolean);
                    const path = ids.map(id => allRels.find(r => r.id === id)).filter(Boolean);
                    if (path.length !== ids.length) {
                        if (!map[advRouteKey(x.tableId, '')]) unreachable.push(x.tableId);
                        return;
                    }
                    let curTable = baseId,
                        curAlias = map[advRouteKey(baseId, '')];
                    const prefix = [];
                    let broken = false;
                    for (const rel of path) {
                        const nxt =
                            rel.sourceTable === curTable
                                ? rel.targetTable
                                : rel.targetTable === curTable
                                  ? rel.sourceTable
                                  : null;
                        if (nxt == null) {
                            broken = true;
                            break;
                        }
                        prefix.push(rel.id);
                        const rk = advRouteKey(nxt, prefix.join('>'));
                        if (!map[rk]) map[rk] = addJoin(rel, nxt, curAlias);
                        curTable = nxt;
                        curAlias = map[rk];
                    }
                    if (broken || curTable !== x.tableId) {
                        unreachable.push(x.tableId);
                        return;
                    }
                    map[key] = curAlias;
                });
            return { map, joins, unreachable };
        }
        // Développe une colonne de la spec en 1..N items { expr, alias } — les types « link »
        // (synthèse de table liée) et « hier » (hiérarchie aplatie) produisent du SQL corrélé/CTE.
        /**
         * Les filtres « sur le lien » qui portent sur une table traversée par cette synthèse.
         *
         * Un filtre posé sur la table de liaison — « ne compter que les liens dont le rôle est
         * SIGN » — doit restreindre ce qui est compté. Jusqu'ici il ne restreignait que les
         * jointures du résultat : comme une synthèse ne joint rien, le filtre ne faisait RIEN,
         * et le compte ignorait le rôle. « Sur le lien » veut dire la même chose partout où le
         * lien est emprunté.
         */
        function advFiltresDuCheminDeLaSynthese(spec, colonne) {
            const tablesDuChemin = new Set(
                colonne._chemin && colonne._chemin.length ? colonne._chemin.map(pas => pas.vers) : [colonne.tableId]
            );
            return (spec.filters || []).filter(
                f => advPorteeDuFiltre(f, spec.baseId) === 'lien' && tablesDuChemin.has(f.tableId)
            );
        }
        function advExpandCol(map, c, hierRef, spec) {
            if (c.kind === 'link') {
                // La table résumée est atteinte DANS la sous-requête, en traversant s'il le faut les
                // tables de liaison du chemin. Rien n'est joint au résultat : une ligne de départ
                // reste une ligne, quel que soit le nombre de lignes trouvées au bout du lien.
                const anchor = c._anchor;
                const chemin = c._chemin;
                let S, key, aliasDe;
                if (chemin && chemin.length > 1) {
                    const traversee = advSourceDeLaSynthese(map, chemin);
                    S = traversee.source;
                    key = traversee.condition;
                    aliasDe = traversee.aliasDe;
                } else {
                    S = sqlIdent(duckTableName(c.tableId)) + ' s';
                    key = `${advNk('s.' + sqlIdent(anchor.childCol))} = ${advNk(advAlias(map, { tableId: anchor.parentId, via: anchor.parentVia }) + '.' + sqlIdent(anchor.parentCol))}`;
                    aliasDe = {};
                    aliasDe[c.tableId] = 's';
                }
                // Les critères de la synthèse, puis les filtres « sur le lien » qui portent sur
                // une table de son chemin : les uns comme les autres restreignent ce qui est
                // résumé, jamais les lignes du fichier.
                key += advCriteresDeLaSyntheseSql(c, aliasDe);
                if (spec) key += advCriteresDeLaSyntheseSql({ conds: advFiltresDuCheminDeLaSynthese(spec, c) }, aliasDe);
                const colRaw = c.col ? `TRIM(CAST(s.${sqlIdent(c.col)} AS VARCHAR))` : null;
                const al = c.alias || c.col || 'synthese';
                if (c.mode === 'count') return [{ expr: `(SELECT COUNT(*) FROM ${S} WHERE ${key})`, alias: al }];
                if (c.mode === 'countd')
                    return [
                        {
                            expr: `(SELECT COUNT(DISTINCT ${advNk('s.' + sqlIdent(c.col))}) FROM ${S} WHERE ${key})`,
                            alias: al
                        }
                    ];
                if (c.mode === 'values')
                    return [
                        {
                            expr: `(SELECT STRING_AGG(DISTINCT NULLIF(${colRaw}, ''), ' | ') FROM ${S} WHERE ${key})`,
                            alias: al
                        }
                    ];
                const maximum = Math.max(1, Math.min(12, parseInt(c.n) || 3));
                return Array.from({ length: maximum }, (_, k) => ({
                    expr: `(SELECT ${colRaw} FROM ${S} WHERE ${key} ORDER BY s.${sqlIdent('__rn')} LIMIT 1 OFFSET ${k})`,
                    alias: al + '_' + (k + 1)
                }));
            }
            if (c.kind === 'hier') {
                const conf = c.conf || {};
                const maxD = Math.max(1, Math.min(20, parseInt(conf.maxDepth) || 5));
                const al = c.alias || (state.tables[c.tableId] || {}).name || 'hier';
                const attrs = advHierAttrs(conf);
                const chain = hierRef[c.id];
                const out = [];
                for (let k = 0; k < maxD; k++) {
                    if (attrs.length <= 1) out.push({ expr: `list_extract(${chain}, ${k + 1})`, alias: al + '_niv' + (k + 1) });
                    else
                        attrs.forEach((cn, i) =>
                            out.push({
                                expr: `list_extract(${chain}, ${k + 1})['a${i}']`,
                                alias: al + '_niv' + (k + 1) + '_' + cn
                            })
                        );
                }
                return out;
            }
            // Une colonne d'une table liée qui doit tenir sur UNE SEULE ligne : on la va chercher
            // par une sous-requête, exactement comme une synthèse, au lieu de joindre sa table.
            if (!c.kind && spec && advColonneSansJointure(c, spec.baseId) && c._chemin && c._chemin.length) {
                const traversee = advSourceDeLaSynthese(map, c._chemin);
                const condition =
                    traversee.condition +
                    advCriteresDeLaSyntheseSql({ conds: advFiltresDuCheminDeLaSynthese(spec, c) }, traversee.aliasDe);
                const valeur = advTransformee(`s.${sqlIdent(c.col)}`, c.transform);
                const texte = `NULLIF(TRIM(CAST(${valeur} AS VARCHAR)), '')`;
                const expr =
                    advPlusieursValeurs(c, spec.baseId) === 'premiere'
                        ? `(SELECT ${valeur} FROM ${traversee.source} WHERE ${condition} ORDER BY s.${sqlIdent('__rn')} LIMIT 1)`
                        : `(SELECT STRING_AGG(DISTINCT ${texte}, ' | ') FROM ${traversee.source} WHERE ${condition})`;
                return [{ expr, alias: c.alias || c.col }];
            }
            return [{ expr: advColExpr(map, c), alias: c.alias || c.col }];
        }
        function buildAdvSql(spec) {
            const base = state.tables[spec.baseId];
            if (!base) return { err: 'Choisissez une table de départ.' };
            const cols = spec.columns;
            const globalAggMode = spec.group.on && spec.group.aggs.length > 0; // agrégats possibles sans dimension (comme une cellule de synthèse Excel)
            if (!cols.length && !globalAggMode) return { err: 'Ajoutez au moins une colonne.' };
            // Besoins de jointure, chacun avec le LIEN emprunté ('' = lien par défaut de la paire).
            const needs = [{ tableId: spec.baseId, via: '' }];
            cols.forEach(c => advColNeeds(c, spec.baseId).forEach(x => needs.push(x)));
            // Un filtre « sur la ligne » décide quelles lignes sortent : sa table doit être jointe.
            // Un filtre « sur le lien » ne fait que restreindre ce que le lien RAMÈNE : s'il n'y a
            // aucune colonne à ramener de cette table, il n'a rien à restreindre, et imposer la
            // jointure pour lui ne ferait que multiplier les lignes sans rien changer d'autre.
            spec.filters.forEach(f => {
                if (advPorteeDuFiltre(f, spec.baseId) !== 'lien') needs.push({ tableId: f.tableId, via: f.via || '' });
            });
            if (spec.group.on)
                spec.group.aggs.forEach(a => {
                    if (a.tableId) needs.push({ tableId: a.tableId, via: a.via || '' });
                    (a.conds || []).forEach(cc => needs.push({ tableId: cc.tableId, via: cc.via || '' }));
                });
            // ancrages des colonnes « synthèse » / « hiérarchie » : on joint la table PARENTE du lien,
            // jamais la table résumée elle-même (pas de multiplication de lignes).
            // Le chemin d'une colonne ramenée par sous-requête : même besoin que pour une synthèse.
            for (const c of cols.filter(c2 => !c2.kind && advColonneSansJointure(c2, spec.baseId))) {
                c._chemin = advCheminDuLien(spec.baseId, c.tableId, c.via);
                if (!c._chemin)
                    return {
                        err: `« ${(state.tables[c.tableId] || {}).name || '?'} » n'est pas reliée à la table de départ dans le modèle de données (étape 2).`
                    };
            }
            for (const c of cols.filter(c2 => c2.kind === 'link' || c2.kind === 'hier')) {
                if (c.tableId === spec.baseId && c.kind === 'hier') {
                    c._anchor = null;
                    continue;
                }
                const anchor = advLinkAnchor(spec.baseId, c.tableId, c.via);
                if (!anchor)
                    return {
                        err: `« ${(state.tables[c.tableId] || {}).name || '?'} » n'est pas reliée à la table de départ dans le modèle de données (étape 2).`
                    };
                c._anchor = anchor;
                // Le chemin complet, pour que la synthèse sache traverser une table de liaison.
                c._chemin = c.kind === 'link' ? advCheminDuLien(spec.baseId, c.tableId, c.via) : null;
                // On ne joint la table d'ancrage QUE si elle n'est pas un simple relais : une table
                // de liaison traversée dans la sous-requête ne doit surtout pas être jointe ici,
                // sinon elle multiplie les lignes du résultat — le défaut que ce chemin corrige.
                if (!(c._chemin && c._chemin.length > 1)) {
                    needs.push({ tableId: anchor.parentId, via: anchor.parentVia || '' });
                }
            }
            const { map, joins, unreachable } = advPlanJoins(spec.baseId, needs);
            if (unreachable.length)
                return {
                    err:
                        'Tables non reliées dans le modèle de données : ' +
                        unreachable.map(id => (state.tables[id] || {}).name).join(', ') +
                        ". Ajoutez un lien à l'étape 2 (modèle de données)."
                };
            // CTE récursives des hiérarchies + leur jointure dédiée
            const ctes = [],
                hierJoins = [],
                hierRef = {};
            let count = 0;
            for (const c of cols.filter(c2 => c2.kind === 'hier')) {
                const conf = c.conf || {};
                if (!conf.idCol) return { err: 'Hiérarchie : choisissez la colonne identifiant.' };
                const T = sqlIdent(duckTableName(c.tableId));
                const H = 'h' + count++;
                const maxD = Math.max(1, Math.min(20, parseInt(conf.maxDepth) || 5));
                const id2 = sqlIdent(conf.idCol);
                // V6.4/6.6 : chaque niveau restitue 1 ou PLUSIEURS attributs de la table. Un seul → liste
                // de scalaires (rétro-compat) ; plusieurs → liste de structs {a0, a1, …}. La récursion
                // reste indexée sur l'identifiant.
                const hAttrs = advHierAttrs(conf);
                const lbl = a2 =>
                    hAttrs.length > 1
                        ? `{ ${hAttrs.map((c2, i) => `'a${i}': TRIM(CAST(${a2}.${sqlIdent(c2)} AS VARCHAR))`).join(', ')} }`
                        : `TRIM(CAST(${a2}.${sqlIdent(hAttrs[0] || conf.idCol)} AS VARCHAR))`;
                let baseWhere, stepJoin;
                if (conf.type === 'link' && conf.linkTable) {
                    if (!conf.linkChildCol || !conf.linkParentCol)
                        return { err: 'Hiérarchie via liaison : colonnes enfant/parent requises.' };
                    const L = sqlIdent(duckTableName(conf.linkTable));
                    const refD = conf.refDate ? `DATE ${sqlLiteral(conf.refDate)}` : 'CURRENT_DATE';
                    const dOf = cc =>
                        `COALESCE(TRY_CAST(CAST(l.${sqlIdent(cc)} AS VARCHAR) AS DATE), CAST(TRY_CAST(CAST(l.${sqlIdent(cc)} AS VARCHAR) AS TIMESTAMP) AS DATE))`;
                    const va = [];
                    if (conf.linkValidFromCol)
                        va.push(`(l.${sqlIdent(conf.linkValidFromCol)} IS NULL OR ${dOf(conf.linkValidFromCol)} <= ${refD})`);
                    if (conf.linkValidToCol)
                        va.push(`(l.${sqlIdent(conf.linkValidToCol)} IS NULL OR ${dOf(conf.linkValidToCol)} >= ${refD})`);
                    const vSql = va.length ? ' AND ' + va.join(' AND ') : '';
                    baseWhere = `NOT EXISTS (SELECT 1 FROM ${L} l WHERE ${advNk('l.' + sqlIdent(conf.linkChildCol))} = ${advNk('t.' + id2)}${vSql})`;
                    stepJoin = `JOIN ${L} l ON ${advNk('l.' + sqlIdent(conf.linkChildCol))} = ${advNk('c.' + id2)}${vSql} JOIN ${H} p ON ${advNk('l.' + sqlIdent(conf.linkParentCol))} = p.k`;
                } else {
                    if (!conf.parentCol) return { err: 'Hiérarchie : choisissez la colonne parent.' };
                    const par = sqlIdent(conf.parentCol);
                    baseWhere = `(t.${par} IS NULL OR TRIM(CAST(t.${par} AS VARCHAR)) = '')`;
                    stepJoin = `JOIN ${H} p ON ${advNk('c.' + par)} = p.k`;
                }
                ctes.push(
                    `${H}(k, chain) AS (\n  SELECT ${advNk('t.' + id2)}, [${lbl('t')}] FROM ${T} t WHERE ${baseWhere}\n  UNION ALL\n  SELECT ${advNk('c.' + id2)}, list_append(p.chain, ${lbl('c')}) FROM ${T} c ${stepJoin} WHERE len(p.chain) < ${maxD} AND NOT list_contains(p.chain, ${lbl('c')})\n)`
                );
                const anchor = c._anchor;
                if (!anchor) {
                    hierJoins.push(`LEFT JOIN ${H} ON ${H}.k = ${advNk('x0.' + id2)}`);
                    hierRef[c.id] = `${H}.chain`;
                } else if (anchor.childCol === conf.idCol) {
                    hierJoins.push(
                        `LEFT JOIN ${H} ON ${H}.k = ${advNk(advAlias(map, { tableId: anchor.parentId, via: anchor.parentVia }) + '.' + sqlIdent(anchor.parentCol))}`
                    );
                    hierRef[c.id] = `${H}.chain`;
                } else {
                    hierJoins.push(
                        `LEFT JOIN (SELECT ${advNk('t2.' + sqlIdent(anchor.childCol))} AS jk, hh.chain FROM ${T} t2 LEFT JOIN ${H} hh ON hh.k = ${advNk('t2.' + id2)}) ${H}x ON ${H}x.jk = ${advNk(advAlias(map, { tableId: anchor.parentId, via: anchor.parentVia }) + '.' + sqlIdent(anchor.parentCol))}`
                    );
                    hierRef[c.id] = `${H}x.chain`;
                }
            }
            const JT = spec.joinType === 'inner' ? 'JOIN' : 'LEFT JOIN';
            // Chaque filtre va d'un côté ou de l'autre selon sa portée : dans le ON de sa
            // jointure quand il porte sur le lien, dans le WHERE quand il porte sur la ligne.
            // C'est tout ce qui sépare « ne ramener que les sinistres ouverts » de « ne garder
            // que les contrats qui ont un sinistre ouvert ».
            const conditionsDeJointure = {};
            const filtresDeLigne = [];
            const filtresSansEffet = [];
            spec.filters.forEach(filtre => {
                if (advPorteeDuFiltre(filtre, spec.baseId) !== 'lien') {
                    filtresDeLigne.push(advCondSql(advAlias(map, filtre), filtre));
                    return;
                }
                const alias = advAlias(map, filtre);
                if (!joins.some(j => j.alias === alias)) {
                    // Pas de jointure à restreindre. Reste à savoir s'il sert à une synthèse :
                    // un filtre sur une table de liaison restreint ce que la synthèse compte.
                    const sertAUneSynthese = cols.some(
                        colonne => colonne.kind === 'link' && advFiltresDuCheminDeLaSynthese(spec, colonne).includes(filtre)
                    );
                    if (!sertAUneSynthese) filtresSansEffet.push(filtre.id);
                    return;
                }
                (conditionsDeJointure[alias] = conditionsDeJointure[alias] || []).push(advCondSql(alias, filtre));
            });
            spec._filtresSansEffet = filtresSansEffet;
            const fromSql =
                `${sqlIdent(duckTableName(spec.baseId))} x0` +
                (joins.length
                    ? '\n  ' +
                      joins
                          .map(j => {
                              const posees = conditionsDeJointure[j.alias] || [];
                              const condition = [j.on].concat(posees).join('\n    AND ');
                              return `${JT} ${sqlIdent(duckTableName(j.id))} ${j.alias} ON ${condition}`;
                          })
                          .join('\n  ')
                    : '') +
                (hierJoins.length ? '\n  ' + hierJoins.join('\n  ') : '');
            const withSql = ctes.length ? 'WITH RECURSIVE ' + ctes.join(',\n') + '\n' : '';
            const whereSql = filtresDeLigne.length ? '\nWHERE ' + filtresDeLigne.join('\n  AND ') : '';
            const outCols = [];
            let selectSql,
                tail = '';
            if (spec.group.on) {
                const dims = cols.flatMap(c => advExpandCol(map, c, hierRef, spec));
                const aggs = spec.group.aggs.map(a => {
                    const q = a.col && a.col !== '*' ? `${advAlias(map, a)}.${sqlIdent(a.col)}` : null;
                    let e;
                    if (a.fn === 'count') e = 'COUNT(*)';
                    else if (a.fn === 'countd') e = `COUNT(DISTINCT ${q})`;
                    else if (a.fn === 'sum') e = `SUM(TRY_CAST(${q} AS DOUBLE))`;
                    else if (a.fn === 'avg') e = `ROUND(AVG(TRY_CAST(${q} AS DOUBLE)), 2)`;
                    else if (a.fn === 'min') e = `MIN(${q})`;
                    else e = `MAX(${q})`;
                    // Critères façon NB.SI.ENS / SOMME.SI.ENS : FILTER (WHERE ...) sur l'agrégat
                    if ((a.conds || []).length)
                        e += ` FILTER (WHERE ${(a.conds || []).map(cc => advCondSql(advAlias(map, cc), cc)).join(' AND ')})`;
                    return { expr: e, alias: a.alias || a.fn + '_' + (a.col || 'lignes') };
                });
                const all = [...dims, ...aggs];
                all.forEach(x => outCols.push({ alias: x.alias }));
                // (les dimensions incluent synthèses et niveaux de hiérarchie développés)
                selectSql = all.map(x => `${x.expr} AS ${sqlIdent(x.alias)}`).join(',\n  ');
                tail = dims.length ? '\nGROUP BY ' + dims.map((_, i) => i + 1).join(', ') : '';
            } else {
                const items = cols.flatMap(c => advExpandCol(map, c, hierRef, spec));
                items.forEach(x => outCols.push({ alias: x.alias }));
                selectSql = items.map(x => `${x.expr} AS ${sqlIdent(x.alias)}`).join(',\n  ');
                if (spec.dedup.on && spec.dedup.keys.length) {
                    const keyExprs = spec.dedup.keys
                        .map(cid => {
                            const column = cols.find(x => x.id === cid);
                            return column ? (advExpandCol(map, column, hierRef, spec)[0] || {}).expr : null;
                        })
                        .filter(Boolean);
                    if (keyExprs.length) {
                        const dir = spec.dedup.keep === 'last' ? 'DESC' : 'ASC';
                        tail = `\nQUALIFY ROW_NUMBER() OVER (PARTITION BY ${keyExprs.join(', ')} ORDER BY x0.${sqlIdent('__rn')} ${dir}) = 1`;
                    }
                }
            }
            const limitSql = spec.limit500 ? '\nLIMIT 500' : '';
            return { sql: `${withSql}SELECT ${selectSql}\nFROM ${fromSql}${whereSql}${tail}${limitSql}`, outCols };
        }
        function advCurrentSql() {
            if (state.advExtract.customSql) {
                const advSqlElement = el('adv-sql');
                return { sql: (advSqlElement ? advSqlElement.value : '').trim(), outCols: null };
            }
            return buildAdvSql(state.advExtract);
        }
        async function advColumnsOf(sql) {
            const { conn } = await getDB();
            const res = await conn.query(`SELECT * FROM (${sql}) q LIMIT 0`);
            return res.schema.fields.map(f => f.name).filter(n => n !== '__rn');
        }

        // ---------- Actions : compter / prévisualiser / SQL / qualité ----------
        async function advCount() {
            const query = advCurrentSql();
            if (query.err) return showError(query.err);
            if (!query.sql) return showError('Requête SQL vide.');
            const badge = el('adv-count');
            badge.textContent = '…';
            try {
                const { conn } = await getDB();
                const res = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM (${query.sql}) q`);
                const number = Number(arrowResultToObjects(res)[0].n);
                badge.textContent = number.toLocaleString('fr-FR') + ' lignes';
            } catch (e) {
                badge.textContent = '—';
                showError('Comptage impossible : ' + e.message);
            }
        }
        async function advPreview() {
            const query = advCurrentSql();
            if (query.err) return showError(query.err);
            if (!query.sql) return showError('Requête SQL vide.');
            const box = el('adv-preview');
            box.innerHTML = '<p class="text-xs text-slate-400">Chargement de l\'aperçu…</p>';
            try {
                const { conn } = await getDB();
                const res = await conn.query(`SELECT * FROM (${query.sql}) q LIMIT 20`);
                const rows = arrowResultToObjects(res);
                if (!rows.length) {
                    box.innerHTML = '<p class="text-xs text-amber-600">Aucune ligne pour cette configuration.</p>';
                    return;
                }
                const cols = Object.keys(rows[0]);
                box.innerHTML = `<div class="overflow-x-auto border border-slate-200 rounded-lg"><table class="w-full text-left text-[11px]"><thead class="bg-slate-100 text-slate-600 font-bold"><tr>${cols.map(c => `<th class="p-1.5 whitespace-nowrap">${escapeHTML(c)}</th>`).join('')}</tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">${rows.map(rw => `<tr>${cols.map(c => `<td class="p-1.5 whitespace-nowrap">${escapeHTML(rw[c] == null ? '' : String(rw[c]))}</td>`).join('')}</tr>`).join('')}</tbody>
                    </table>
                        </div>
                        <p class="text-[10px] text-slate-400 mt-1">20 premières lignes.</p>`;
            } catch (e) {
                box.innerHTML = `<p class="text-xs text-red-600">Aperçu impossible : ${escapeHTML(e.message)}</p>`;
            }
        }
        function advShowSql() {
            const r = state.advExtract.customSql ? null : buildAdvSql(state.advExtract);
            const advSqlElement = el('adv-sql');
            if (!state.advExtract.customSql) {
                if (r && r.err) {
                    advSqlElement.value = '-- ' + r.err;
                } else if (r) advSqlElement.value = r.sql;
            }
            el('adv-sql-wrap').classList.remove('hidden');
        }
        async function advQuality() {
            const query = advCurrentSql();
            if (query.err) return showError(query.err);
            if (!query.sql) return showError('Requête SQL vide.');
            const box = el('adv-quality');
            box.innerHTML = '<p class="text-xs text-slate-400">Calcul du bilan qualité…</p>';
            try {
                const { conn } = await getDB();
                const cols = await advColumnsOf(query.sql);
                const counts = cols.map((c, i) => `COUNT(${sqlIdent(c)})::BIGINT AS c${i}`).join(', ');
                const res = await conn.query(
                    `SELECT COUNT(*)::BIGINT AS tot${cols.length ? ', ' + counts : ''} FROM (${query.sql}) q`
                );
                const row = arrowResultToObjects(res)[0];
                const tot = Number(row.tot);
                let dupInfo = '';
                if (!state.advExtract.group.on && state.advExtract.dedup.on) dupInfo = ' · dédoublonnage actif';
                const tiles = cols
                    .map((c, i) => {
                        const filled = Number(row['c' + i]);
                        const pct = tot ? Math.round((filled / tot) * 100) : 0;
                        const col = pct >= 95 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600';
                        return `<div class="p-2 border rounded-lg bg-white"><div class="text-[10px] font-bold text-slate-500 truncate" title="${escapeHTML(c)}">${escapeHTML(c)}</div>
                            <div class="text-sm font-black ${col}">${pct}%</div>
                            <div class="text-[9px] text-slate-400">${filled.toLocaleString('fr-FR')} / ${tot.toLocaleString('fr-FR')}</div>
                            </div>`;
                    })
                    .join('');
                box.innerHTML = `<div class="text-xs font-bold text-slate-600 mb-2">Bilan qualité du résultat — ${tot.toLocaleString('fr-FR')} ligne(s)${dupInfo}, ${cols.length} colonne(s) · taux de complétude par colonne :</div>
                    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">${tiles}</div>`;
            } catch (e) {
                box.innerHTML = `<p class="text-xs text-red-600">Bilan impossible : ${escapeHTML(e.message)}</p>`;
            }
        }

        function advCsvCell(v) {
            if (v === null || v === undefined) return '';
            const text = String(v);
            return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
        }
        async function advGenerate() {
            const query = advCurrentSql();
            if (query.err) return showError(query.err);
            if (!query.sql) return showError('Requête SQL vide.');
            const addSource = el('adv-add-source').checked;
            const btn = el('adv-generate');
            btn.disabled = true;
            btn.textContent = 'Génération…';
            const newId = 'tb_' + generateId();
            try {
                const { conn } = await getDB();
                await conn.query(
                    `CREATE OR REPLACE TABLE ${sqlIdent(duckTableName(newId))} AS SELECT ROW_NUMBER() OVER () AS __rn, * FROM (${query.sql}) q`
                );
                const headers = await advColumnsOf(`SELECT * FROM ${sqlIdent(duckTableName(newId))}`);
                const cntRes = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(newId))}`);
                const rowCount = Number(arrowResultToObjects(cntRes)[0].n);
                // CSV en flux paginé (aucun tableau complet en mémoire JS au-delà d'un lot)
                const parts = [headers.map(advCsvCell).join(',') + '\n'];
                await duckStreamRows(newId, 0, row => {
                    parts.push(headers.map(h => advCsvCell(row[h])).join(',') + '\n');
                });
                const blob = new Blob(['﻿', ...parts], { type: 'text/csv;charset=utf-8;' });
                const anchorElement = document.createElement('a');
                anchorElement.href = URL.createObjectURL(blob);
                anchorElement.download = `Extraction_avancee_${Date.now()}.csv`;
                document.body.appendChild(anchorElement);
                anchorElement.click();
                anchorElement.remove();
                if (addSource) {
                    const nm =
                        (el('adv-source-name').value || '').trim() ||
                        `Extraction_${new Date().toLocaleString('fr-FR').replace(/[\/:, ]+/g, '-')}`;
                    state.tables[newId] = {
                        id: newId,
                        name: nm,
                        file: null,
                        type: 'extraction',
                        size: rowCount,
                        config: {},
                        headers: headers.slice(),
                        columnsMeta: {},
                        status: 'ready',
                        sampleData: await duckSampleRows(newId, 5)
                    };
                    const srcNames = [];
                    const spec = state.advExtract;
                    new Set([spec.baseId, ...spec.columns.map(c => c.tableId), ...spec.filters.map(f => f.tableId)]).forEach(
                        id => {
                            if (state.tables[id]) srcNames.push(state.tables[id].name);
                        }
                    );
                    state.governance.lineage[nm] = { from: srcNames, date: new Date().toISOString() };
                    el('emptyStateSources').classList.add('hidden');
                    renderTables();
                    updateBaseTableSelect();
                    updateVizBaseTableSelect();
                    populateQualTables();
                    persistTableData(newId);
                    persistAppState();
                    showSuccess(`Nouvelle source "${nm}" ajoutée (${rowCount.toLocaleString('fr-FR')} lignes).`);
                } else {
                    try {
                        await duckDropTable(newId);
                    } catch (e) {}
                    showSuccess(`Extraction générée : ${rowCount.toLocaleString('fr-FR')} lignes.`);
                }
            } catch (e) {
                showError('Extraction avancée impossible : ' + e.message);
                try {
                    await duckDropTable(newId);
                } catch (e2) {}
            } finally {
                btn.disabled = false;
                btn.textContent = '⬇️ Générer le CSV';
            }
        }

        // ---------- Pilotage par un objet métier (lot gouvernance) ----------
        function advLoadFromObject() {
            const bo = state.governance.businessObjects.find(b => b.id === el('adv-obj').value);
            if (!bo) return showError('Sélectionnez un objet métier.');
            const master = boMasterTable(bo);
            if (!master) return showError(`L'objet "${bo.name}" n'a pas de table maître chargée.`);
            const spec = state.advExtract;
            spec.from = 'object';
            spec.objectId = bo.id;
            spec.baseId = master.id;
            spec.columns = [];
            spec.filters = [];
            spec.dedup = { on: false, keys: [], keep: 'first' };
            spec.group = { on: false, aggs: [] };
            boCoreElements(bo).forEach(elm => {
                const mapping = (elm.mappings || []).find(mm => tableByName(mm.table));
                if (mapping) {
                    const table = tableByName(mapping.table);
                    if (table)
                        spec.columns.push({
                            id: 'ac_' + generateId(),
                            tableId: table.id,
                            col: mapping.col,
                            alias: elm.name,
                            transform: 'none'
                        });
                }
            });
            getBoFacets(bo).forEach(st => {
                const table = tableByName(st.table);
                if (!table) return;
                (st.scope || []).forEach(sc =>
                    spec.filters.push({ id: 'af_' + generateId(), tableId: table.id, col: sc.col, op: sc.op, val: sc.val })
                );
                (st.elements || []).forEach(fe =>
                    spec.columns.push({
                        id: 'ac_' + generateId(),
                        tableId: table.id,
                        col: fe.col,
                        alias: `${st.name} — ${fe.name}`,
                        transform: 'none'
                    })
                );
            });
            renderAdvExtract();
            showSuccess(
                `Extraction pré-remplie depuis l'objet "${bo.name}" : ${spec.columns.length} colonne(s), ${spec.filters.length} filtre(s).`
            );
        }

        // ---------- Handlers de la spec ----------
        function advSetBase(v) {
            state.advExtract.baseId = v;
            state.advExtract.columns = state.advExtract.columns.filter(
                c => c.kind === 'calc' || c.tableId === v || getReachableTables(v).includes(c.tableId)
            );
            const baseTableSelectElement = el('baseTableSelect');
            if (baseTableSelectElement && baseTableSelectElement.value !== v) baseTableSelectElement.value = v;
            renderAdvExtract();
        }
        // ---- Modifier une colonne déjà ajoutée ---------------------------------------
        //
        // Jusqu'ici, une colonne ne se corrigeait qu'en la supprimant pour la refaire : on
        // perdait son rang dans l'ordre de sortie, son nom métier, et sa case « clé » de
        // dédoublonnage. Pour une synthèse avec trois critères, cela voulait dire tout ressaisir.
        //
        // On réemploie le formulaire de création plutôt que d'en écrire un second : « modifier »
        // le remplit avec les réglages de la colonne, et la validation REMPLACE la colonne au
        // lieu d'en ajouter une. Il n'y a donc qu'un seul écran à apprendre, et un seul à tenir.
        let advColonneModifiee = null;
        // Remplir le formulaire se fait dans le DOM déjà dessiné : le moindre redessin pendant
        // ce temps-là effacerait ce que l'on vient d'y poser. Ce drapeau le met en attente.
        let advRemplissageDuFormulaire = false;

        /** La colonne en cours de modification, s'il y en a une. */
        function advLaColonneModifiee() {
            return advColonneModifiee ? state.advExtract.columns.find(c => c.id === advColonneModifiee) || null : null;
        }
        /** Les genres de colonnes que le formulaire sait reprendre. */
        function advColonneModifiable(colonne) {
            return !!colonne && (!colonne.kind || colonne.kind === 'link');
        }
        /**
         * Poser la colonne construite par le formulaire : à la place de celle qu'on modifie, ou
         * à la fin. En modification, la colonne garde son IDENTIFIANT — donc sa case « clé » de
         * dédoublonnage — son RANG dans l'ordre de sortie, et son nom métier si l'on n'en a pas
         * saisi un autre.
         */
        function advPoserLaColonne(nouvelle) {
            const colonnes = state.advExtract.columns;
            const rang = advColonneModifiee ? colonnes.findIndex(c => c.id === advColonneModifiee) : -1;
            if (rang >= 0) {
                const ancienne = colonnes[rang];
                nouvelle.id = ancienne.id;
                if (!nouvelle._aliasSaisi) nouvelle.alias = ancienne.alias;
                delete nouvelle._aliasSaisi;
                colonnes[rang] = nouvelle;
                advColonneModifiee = null;
            } else {
                delete nouvelle._aliasSaisi;
                colonnes.push(nouvelle);
            }
            renderAdvExtract();
        }
        function advAnnulerLaModification() {
            advColonneModifiee = null;
            advCriteresDeSyntheseEnAttente = [];
            renderAdvExtract();
        }
        /** Remplir le formulaire avec les réglages d'une colonne, puis le montrer. */
        function advModifierLaColonne(identifiant) {
            const colonne = state.advExtract.columns.find(c => c.id === identifiant);
            if (!advColonneModifiable(colonne)) return;
            advColonneModifiee = identifiant;
            advCriteresDeSyntheseEnAttente = colonne.kind === 'link' ? (colonne.conds || []).map(c => ({ ...c })) : [];
            // UN SEUL redessin : il fait apparaître le bandeau et les critères repris. Tout ce qui
            // suit pose des valeurs dans ce formulaire-là, sans jamais le redessiner.
            renderAdvExtract();
            const onglet = colonne.kind === 'link' ? 'link' : 'col';
            if (typeof v12xAddMode === 'function') v12xAddMode(onglet);
            const poser = (identifiantDuChamp, valeur) => {
                const champ = el(identifiantDuChamp);
                if (champ && valeur != null && valeur !== '') champ.value = valeur;
            };
            advRemplissageDuFormulaire = true;
            try {
                if (colonne.kind === 'link') {
                    poser('adv-link-tbl', colonne.tableId);
                    advLinkTblChanged();
                    poser('adv-link-via', colonne.via);
                    poser('adv-link-mode', colonne.mode);
                    advLinkModeChanged();
                    poser('adv-link-col', colonne.col);
                    poser('adv-link-n', colonne.n);
                    poser('adv-link-alias', colonne.alias);
                } else {
                    poser('adv-col-tbl', colonne.tableId);
                    advColColChanged();
                    poser('adv-col-via', colonne.via);
                    poser('adv-col-col', colonne.col);
                }
            } finally {
                advRemplissageDuFormulaire = false;
            }
        }
        /** Le bandeau qui rappelle qu'on modifie une colonne au lieu d'en ajouter une. */
        function advBandeauDeModificationHtml() {
            const colonne = advLaColonneModifiee();
            if (!colonne) return '';
            return `<div class="basis-full flex items-center gap-2 mb-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                ✎ Modification de « ${escapeHTML(colonne.alias || colonne.col || '')} » — la colonne garde sa place et son nom en sortie.
                <button onclick="advAnnulerLaModification()" class="ml-auto text-amber-600 hover:text-red-600 font-bold">✕ annuler</button>
            </div>`;
        }
        function advAddColumn() {
            const element = el('adv-col-tbl').value,
                col = el('adv-col-col').value;
            if (!element || !col) return;
            const via =
                el('adv-col-via') && !el('adv-col-via-wrap').classList.contains('hidden') ? el('adv-col-via').value : '';
            // Même colonne ramenée par un AUTRE lien : on distingue l'alias de sortie pour éviter le doublon.
            const cols = state.advExtract.columns;
            let alias = col;
            if (cols.some(c => c.alias === alias)) {
                const lastId = String(via || '')
                    .split('>')
                    .filter(Boolean)
                    .pop();
                const relation = (state.relations || []).find(x => x.id === lastId);
                alias =
                    col +
                    '_' +
                    ((relation && (relation.sourceTable === element ? relation.targetCol : relation.sourceCol)) ||
                        cols.filter(c => c.col === col).length + 1);
            }
            const enModification = advLaColonneModifiee();
            while (cols.some(c => c.alias === alias && (!enModification || c.id !== enModification.id))) alias += '_2';
            advPoserLaColonne({
                id: 'ac_' + generateId(),
                tableId: element,
                col,
                via,
                alias,
                transform: enModification ? enModification.transform : 'none'
            });
        }
        function advUpdateColumn(id, f, v) {
            const column = state.advExtract.columns.find(x => x.id === id);
            if (column) {
                column[f] = v;
                if (f !== 'alias') renderAdvExtract();
            }
        }
        function advRemoveColumn(id) {
            const extractSpec = state.advExtract;
            extractSpec.columns = extractSpec.columns.filter(c => c.id !== id);
            extractSpec.dedup.keys = extractSpec.dedup.keys.filter(k => k !== id);
            renderAdvExtract();
        }
        // ---- L'ordre des colonnes en sortie ------------------------------------------
        //
        // L'ordre de cette liste EST l'ordre des colonnes du fichier produit. Jusqu'ici il
        // ne pouvait être changé qu'en supprimant une colonne pour la rajouter à la fin :
        // pour remonter la première, il fallait toutes les refaire. On peut désormais la
        // déplacer — en la glissant, ou avec les quatre flèches pour les longues listes,
        // où viser au vol n'est pas commode.
        //
        // Rien d'autre ne bouge : le dédoublonnage et les regroupements désignent les
        // colonnes par leur identifiant, jamais par leur rang.

        /** Monter (pas = -1) ou descendre (pas = +1) la colonne de rang `rang`. */
        function advDeplacerColonne(rang, pas) {
            const colonnes = state.advExtract.columns;
            const arrivee = rang + pas;
            if (arrivee < 0 || arrivee >= colonnes.length) return;
            arrMove(colonnes, rang, arrivee);
            renderAdvExtract();
        }

        /** Envoyer la colonne tout en haut ou tout en bas de la liste. */
        function advDeplacerColonneAuBord(rang, ou) {
            const colonnes = state.advExtract.columns;
            if (rang < 0 || rang >= colonnes.length) return;
            arrMove(colonnes, rang, ou === 'top' ? 0 : colonnes.length - 1);
            renderAdvExtract();
        }

        /** Fin d'un glisser-déposer : la colonne `depuis` prend la place `vers`. */
        function advDeposerColonne(depuis, vers) {
            arrMove(state.advExtract.columns, depuis, vers);
            renderAdvExtract();
        }

        /** Les quatre flèches d'une ligne : tout en haut, monter, descendre, tout en bas. */
        function advFlechesDOrdreHtml(rang, combien) {
            return [
                ['top', '⤒', 'Tout en haut', rang === 0],
                ['up', '▲', 'Monter', rang === 0],
                ['down', '▼', 'Descendre', rang === combien - 1],
                ['bottom', '⤓', 'Tout en bas', rang === combien - 1]
            ]
                .map(([action, icone, infobulle, inactive]) => {
                    const appel =
                        action === 'up'
                            ? `advDeplacerColonne(${rang},-1)`
                            : action === 'down'
                              ? `advDeplacerColonne(${rang},1)`
                              : `advDeplacerColonneAuBord(${rang},'${action}')`;
                    return `<button onclick="${appel}" ${inactive ? 'disabled' : ''} class="text-slate-300 hover:text-indigo-600 disabled:opacity-20 text-[10px] font-black px-0.5" title="${infobulle}">${icone}</button>`;
                })
                .join('');
        }
        function advAddAllColumns() {
            const element = el('adv-col-tbl').value;
            const tbl = state.tables[element];
            if (!tbl) return;
            tbl.headers.forEach(h => {
                if (!state.advExtract.columns.some(c => c.tableId === element && c.col === h))
                    state.advExtract.columns.push({
                        id: 'ac_' + generateId(),
                        tableId: element,
                        col: h,
                        alias: h,
                        transform: 'none'
                    });
            });
            renderAdvExtract();
        }
        // ---- La portée d'un filtre posé sur une table liée ---------------------------
        //
        // Un filtre sur une table liée peut vouloir dire deux choses très différentes, et
        // l'écran n'en proposait qu'une :
        //
        //   « sur le lien »  — ne ramener par ce lien que ce qui satisfait le filtre. Une ligne
        //                      de départ SANS lien, ou dont le lien ne satisfait pas le filtre,
        //                      sort quand même, avec les colonnes du lien vides.
        //   « sur la ligne » — ne garder que les lignes qui satisfont le filtre. Une ligne sans
        //                      lien ne peut pas le satisfaire : elle disparaît du fichier.
        //
        // La seconde était la seule possible, et elle se faisait en silence : on posait un filtre
        // sur « SINISTRES » et l'on perdait, sans rien demander, tous les contrats sans sinistre.
        //
        // En SQL, la différence tient à l'endroit où la condition est écrite : dans le ON de la
        // jointure (sur le lien) ou dans le WHERE (sur la ligne).
        const ADV_PORTEES_DE_FILTRE = {
            lien: 'sur le lien — garder la ligne même sans lien',
            ligne: 'sur la ligne — ne garder que les lignes qui satisfont'
        };
        /**
         * La portée effective d'un filtre.
         *
         * La règle de l'extraction est simple, et c'est elle qui décide ici : une extraction rend
         * TOUTES les lignes de la table de départ, sauf si l'on a filtré la table de départ
         * elle-même. Un filtre posé sur une table liée porte donc sur le LIEN par défaut — il
         * restreint ce que le lien ramène, il ne retire aucune ligne.
         *
         * « Sur la ligne » reste possible, mais il faut le demander : c'est le seul réglage qui
         * fait disparaître des lignes, et il ne doit jamais s'appliquer sans qu'on l'ait voulu.
         *
         * Sur la table de départ, la question ne se pose pas : il n'y a pas de lien.
         */
        function advPorteeDuFiltre(filtre, baseId) {
            if (!filtre || filtre.tableId === baseId) return 'ligne';
            // « L'un ou l'autre chemin » compare la valeur de PLUSIEURS liens à la fois : la
            // condition porte sur leur combinaison, elle ne peut donc pas être écrite dans le
            // lien d'une seule jointure. Elle reste sur la ligne, et l'écran le dit.
            if (filtre.via === 'any') return 'ligne';
            return filtre.portee === 'ligne' ? 'ligne' : 'lien';
        }
        function advChangerLaPorteeDuFiltre(identifiant, portee) {
            const filtre = state.advExtract.filters.find(f => f.id === identifiant);
            if (!filtre) return;
            filtre.portee = portee;
            renderAdvExtract();
        }
        function advAddFilter() {
            const element = el('adv-flt-tbl').value,
                col = el('adv-flt-col').value,
                op = el('adv-flt-op').value;
            const val = op === 'empty' || op === 'notempty' ? '' : el('adv-flt-val').value.trim();
            if (!element || !col) return;
            if (op !== 'empty' && op !== 'notempty' && !val) return showError('Indiquez une valeur de filtre.');
            state.advExtract.filters.push({
                id: 'af_' + generateId(),
                tableId: element,
                col,
                op,
                val,
                via: advViaVal('adv-flt-via'),
                // Écrit explicitement, pour qu'on lise la portée du filtre dans le paramétrage
                // enregistré sans avoir à connaître la règle par défaut.
                portee: element === state.advExtract.baseId ? 'ligne' : 'lien'
            });
            renderAdvExtract();
        }
        function advRemoveFilter(id) {
            state.advExtract.filters = state.advExtract.filters.filter(f => f.id !== id);
            renderAdvExtract();
        }
        async function advFillFilterVals() {
            const table = state.tables[el('adv-flt-tbl').value];
            const col = el('adv-flt-col').value;
            const list = el('adv-flt-vals');
            if (!table || !col || !list) return;
            list.innerHTML = '';
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
                const res = await conn.query(
                    `SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(table.id))} WHERE ${sqlIdent(col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 20`
                );
                list.innerHTML = arrowResultToObjects(res)
                    .map(r => `<option value="${escapeHTML(r.v)}">`)
                    .join('');
            } catch (e) {}
        }
        function advToggleDedup(v) {
            state.advExtract.dedup.on = v;
            renderAdvExtract();
        }
        function advToggleDedupKey(id, v) {
            const d = state.advExtract.dedup;
            if (v) {
                if (!d.keys.includes(id)) d.keys.push(id);
            } else d.keys = d.keys.filter(k => k !== id);
        }
        function advSetDedupKeep(v) {
            state.advExtract.dedup.keep = v;
        }
        function advToggleGroup(v) {
            state.advExtract.group.on = v;
            renderAdvExtract();
        }
        // Critères en attente pour le prochain agrégat (NB.SI.ENS : plusieurs critères possibles).
        let advPendingAggConds = [];
        function advAddAggCond() {
            const element = el('adv-aggc-tbl').value,
                col = el('adv-aggc-col').value,
                op = el('adv-aggc-op').value;
            const val = op === 'empty' || op === 'notempty' ? '' : el('adv-aggc-val').value.trim();
            if (!element || !col) return;
            if (op !== 'empty' && op !== 'notempty' && !val) return showError('Indiquez la valeur du critère.');
            advPendingAggConds.push({ tableId: element, col, op, val, via: advViaVal('adv-aggc-via') });
            renderAdvExtract();
        }
        function advRemovePendingCond(i) {
            advPendingAggConds.splice(i, 1);
            renderAdvExtract();
        }
        function advAddAgg() {
            const element = el('adv-agg-tbl').value,
                col = el('adv-agg-col').value,
                fn = el('adv-agg-fn').value;
            if (!element || (fn !== 'count' && !col)) return;
            const conds = advPendingAggConds.slice();
            advPendingAggConds = [];
            const suffix = conds.length ? '_si_' + conds.map(c => c.val || c.op).join('_') : '';
            state.advExtract.group.aggs.push({
                id: 'ag_' + generateId(),
                tableId: element,
                col: col || '*',
                fn,
                conds,
                via: advViaVal('adv-agg-via'),
                alias: ((fn === 'count' ? 'nombre' : fn + '_' + col) + suffix).slice(0, 40)
            });
            renderAdvExtract();
        }
        async function advFillAggCondVals() {
            const table = state.tables[el('adv-aggc-tbl').value];
            const col = el('adv-aggc-col').value;
            const list = el('adv-aggc-vals');
            if (!table || !col || !list) return;
            list.innerHTML = '';
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
                const res = await conn.query(
                    `SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(table.id))} WHERE ${sqlIdent(col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 20`
                );
                list.innerHTML = arrowResultToObjects(res)
                    .map(r => `<option value="${escapeHTML(r.v)}">`)
                    .join('');
            } catch (e) {}
        }
        function advAggCondTblChanged() {
            const id = el('adv-aggc-tbl').value;
            const table = state.tables[id];
            const advAggcColElement = el('adv-aggc-col');
            if (table && advAggcColElement) {
                advAggcColElement.innerHTML = table.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
                advFillAggCondVals();
            }
            advViaSync('adv-aggc-via', id);
        }
        // -- Colonnes calculées « façon Excel » --
        function advCalcFnChanged() {
            const fn = el('adv-calc-fn').value;
            const concat = fn === 'concat';
            if (el('adv-calc-b-wrap')) el('adv-calc-b-wrap').classList.add('hidden'); // remplacé par la liste de colonnes (concat N)
            if (el('adv-calc-parts-wrap')) el('adv-calc-parts-wrap').classList.toggle('hidden', !concat);
            el('adv-calc-sep-wrap').classList.toggle('hidden', !concat);
            el('adv-calc-n-wrap').classList.toggle('hidden', !(fn === 'left' || fn === 'right' || fn === 'mid'));
            el('adv-calc-start-wrap').classList.toggle('hidden', fn !== 'mid');
            el('adv-calc-si-wrap').classList.toggle('hidden', fn !== 'si');
        }
        function advCalcTblChanged(which) {
            const id = el('adv-calc-' + which + '-tbl').value;
            const table = state.tables[id];
            const element = el('adv-calc-' + which + '-col');
            if (table && element) element.innerHTML = table.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            advViaSync('adv-calc-' + which + '-via', id);
        }
        // Concaténation N colonnes : pile de colonnes empilées via la « Colonne source » ci-dessus.
        function advConcatAddPart() {
            const tableId = el('adv-calc-a-tbl').value,
                col = el('adv-calc-a-col').value;
            if (!tableId || !col) return showError('Choisissez une colonne source à ajouter.');
            // V6.16 : chaque morceau concaténé garde SON chemin — on peut concaténer la même colonne
            // ramenée par deux chemins différents (ex. nom du souscripteur + nom du bénéficiaire).
            const extractSpec = state.advExtract;
            extractSpec._ccParts = extractSpec._ccParts || [];
            extractSpec._ccParts.push({ tableId, col, via: advViaVal('adv-calc-a-via') });
            advRenderConcatParts();
        }
        function advConcatDelPart(i) {
            const extractSpec = state.advExtract;
            (extractSpec._ccParts || []).splice(i, 1);
            advRenderConcatParts();
        }
        function advRenderConcatParts() {
            const box = el('adv-calc-parts');
            if (!box) return;
            const parts = state.advExtract._ccParts || [];
            box.innerHTML = parts.length
                ? parts
                      .map(
                          (p, i) =>
                              `<span class="text-[10px] bg-white border border-amber-300 rounded-full px-2 py-0.5 inline-flex items-center gap-1" title="${escapeHTML(p.via ? 'chemin : ' + advViaLabel(p.via) : 'chemin par défaut')}">${i + 1}. ${escapeHTML((state.tables[p.tableId] || {}).name || '?')}.${escapeHTML(p.col)}${p.via ? `<em class="text-amber-600 not-italic font-bold">${escapeHTML(advViaTxt(p.via))}</em>` : ''} <button onclick="advConcatDelPart(${i})" class="text-amber-400 hover:text-red-600 font-bold">✕</button></span>`
                      )
                      .join(' ')
                : '<span class="text-[10px] text-slate-400 italic">Empilez au moins 2 colonnes (dans l\'ordre) via « ➕ ajouter cette colonne ».</span>';
        }
        function advAddCalcColumn() {
            const fn = el('adv-calc-fn').value;
            // Concaténation N colonnes : construite depuis la liste des colonnes empilées.
            if (fn === 'concat') {
                const parts = (state.advExtract._ccParts || []).slice();
                if (parts.length < 2)
                    return showError('Ajoutez au moins 2 colonnes à concaténer (bouton « ➕ ajouter cette colonne »).');
                const sep = el('adv-calc-sep').value;
                const calc = { fn: 'concat', parts, sep };
                const defAlias = parts.map(p => p.col).join('_');
                state.advExtract.columns.push({
                    id: 'ac_' + generateId(),
                    kind: 'calc',
                    calc,
                    alias: (el('adv-calc-alias').value || '').trim() || defAlias,
                    transform: 'none',
                    tableId: parts[0].tableId,
                    col: '(calculée)'
                });
                state.advExtract._ccParts = [];
                renderAdvExtract();
                return;
            }
            const a = {
                tableId: el('adv-calc-a-tbl').value,
                col: el('adv-calc-a-col').value,
                via: advViaVal('adv-calc-a-via')
            };
            if (!a.tableId || !a.col) return showError('Choisissez la colonne source.');
            const calc = { fn, a };
            let defAlias = '';
            if (fn === 'left' || fn === 'right') {
                calc.n = parseInt(el('adv-calc-n').value) || 1;
                defAlias = (fn === 'left' ? 'gauche_' : 'droite_') + a.col;
            } else if (fn === 'mid') {
                calc.start = parseInt(el('adv-calc-start').value) || 1;
                calc.n = parseInt(el('adv-calc-n').value) || 1;
                defAlias = 'stxt_' + a.col;
            } else if (fn === 'len') {
                defAlias = 'nbcar_' + a.col;
            } else if (fn === 'si') {
                calc.op = el('adv-calc-si-op').value;
                calc.val = el('adv-calc-si-val').value.trim();
                calc.then = el('adv-calc-si-then').value;
                calc.else = el('adv-calc-si-else').value;
                defAlias = 'si_' + a.col;
            }
            state.advExtract.columns.push({
                id: 'ac_' + generateId(),
                kind: 'calc',
                calc,
                alias: (el('adv-calc-alias').value || '').trim() || defAlias,
                transform: 'none',
                tableId: a.tableId,
                col: '(calculée)'
            });
            renderAdvExtract();
        }
        function advUpdateAgg(id, f, v) {
            const aggregate = state.advExtract.group.aggs.find(x => x.id === id);
            if (aggregate) {
                aggregate[f] = v;
                if (f !== 'alias') renderAdvExtract();
            }
        }
        function advRemoveAgg(id) {
            state.advExtract.group.aggs = state.advExtract.group.aggs.filter(a => a.id !== id);
            renderAdvExtract();
        }
        function advToggleCustomSql(v) {
            state.advExtract.customSql = v;
            if (v) advShowSql();
            renderAdvExtract();
        }

        /**
         * Le réglage « plusieurs valeurs » d'une colonne, sur sa propre ligne.
         *
         * Il n'apparaît que là où la question se pose : une colonne venant d'une table liée.
         * Sur la table de départ, il n'y a qu'une valeur par ligne, et rien à régler.
         */
        function advChoixPlusieursValeursHtml(colonne, baseId) {
            if (colonne.kind || colonne.tableId === baseId) return '';
            if (colonne.via === 'any')
                return `<span class="mt-1 block text-[10px] text-slate-400" title="« L'un ou l'autre chemin » réunit la valeur de plusieurs liens : cela demande de joindre les deux routes. Choisissez un chemin précis pour tenir sur une seule ligne.">une ligne par valeur (chemins multiples)</span>`;
            const reglage = advPlusieursValeurs(colonne, baseId);
            const eclate = reglage === 'lignes';
            return `<select onchange="advChangerPlusieursValeurs('${colonne.id}', this.value)" title="Quand cette table a PLUSIEURS correspondances pour une même ligne de départ : les regrouper sur une ligne, n'en garder qu'une, ou faire une ligne par valeur — ce dernier choix est le seul qui change le nombre de lignes du fichier." class="mt-1 block w-full border p-1 rounded text-[10px] ${eclate ? 'border-amber-400 bg-amber-50 text-amber-800 font-bold' : 'border-slate-200 bg-white text-slate-500'}">${Object.entries(
                ADV_PLUSIEURS_VALEURS
            )
                .map(([v, l]) => `<option value="${v}" ${v === reglage ? 'selected' : ''}>${escapeHTML(l)}</option>`)
                .join('')}</select>`;
        }
        /** Les critères d'une synthèse déjà créée, retirables un par un. */
        function advCriteresDUneColonneHtml(colonne) {
            const criteres = (colonne && colonne.conds) || [];
            if (!criteres.length) return '';
            return (
                '<div class="flex flex-wrap gap-1 mt-1">' +
                criteres
                    .map((critere, rang) => {
                        const nomTable = (state.tables[critere.tableId] || {}).name || '?';
                        const valeur = critere.op === 'empty' || critere.op === 'notempty' ? '' : ` "${critere.val}"`;
                        const texte = `${nomTable}.${critere.col} ${ADV_OPS[critere.op] || critere.op}${valeur}`;
                        return `<span class="text-[10px] font-sans bg-sky-100 border border-sky-200 text-sky-800 rounded-full px-2 py-0.5">⛉ ${escapeHTML(texte)} <button onclick="advRetirerUnCritereDeSynthese('${colonne.id}', ${rang})" title="Retirer ce critère" class="text-sky-500 hover:text-red-600 font-bold">✕</button></span>`;
                    })
                    .join('') +
                '</div>'
            );
        }
        function advColLabel(c) {
            if (c.kind === 'calc') {
                // V6.16 : chaque référence affiche son chemin quand il n'est pas celui par défaut.
                const cal = c.calc;
                const rf = r => (r ? (state.tables[r.tableId] || {}).name + '.' + r.col + advViaTxt(r.via) : '?');
                if (cal.fn === 'concat') {
                    if (cal.parts && cal.parts.length) return `ƒ CONCAT(${cal.parts.map(rf).join(` "${cal.sep || ' '}" `)})`;
                    return `ƒ CONCAT(${rf(cal.a)}, "${cal.sep || ' '}", ${rf(cal.b)})`;
                }
                if (cal.fn === 'left') return `ƒ GAUCHE(${rf(cal.a)}, ${cal.n})`;
                if (cal.fn === 'right') return `ƒ DROITE(${rf(cal.a)}, ${cal.n})`;
                if (cal.fn === 'mid') return `ƒ STXT(${rf(cal.a)}, ${cal.start}, ${cal.n})`;
                if (cal.fn === 'len') return `ƒ NBCAR(${rf(cal.a)})`;
                if (cal.fn === 'si')
                    return `ƒ SI(${rf(cal.a)} ${SCOPE_OPS[cal.op] || cal.op} "${cal.val}" → "${cal.then}" ; "${cal.else}")`;
                return 'ƒ calculée';
            }
            if (c.kind === 'link') {
                const table = state.tables[c.tableId];
                return `Σ ${ADV_LINK_MODES[c.mode] || c.mode} — ${table ? table.name : '?'}${c.col ? '.' + c.col : ''}${c.mode === 'indexed' ? ' (' + (c.n || 3) + ' col.)' : ''}${advViaTxt(c.via)}${advCriteresDeLaSyntheseTexte(c)}`;
            }
            if (c.kind === 'hier') {
                const table = state.tables[c.tableId];
                const cf = c.conf || {};
                const at = advHierAttrs(cf);
                const atTxt =
                    at.length > 1
                        ? ' · extrait : ' + at.join(', ')
                        : cf.labelCol || (cf.labelCols && cf.labelCols[0])
                          ? ' · extrait : ' + at[0]
                          : '';
                return `🌳 Hiérarchie ${table ? table.name : '?'} (${cf.idCol || '?'} ⤴ ${cf.type === 'link' ? 'liaison ' + ((state.tables[cf.linkTable] || {}).name || '?') : cf.parentCol || '?'}, ${cf.maxDepth || 5} niveaux${atTxt})${advViaTxt(c.via)}`;
            }
            const table = state.tables[c.tableId];
            return (table ? table.name : '?') + '.' + c.col + advViaTxt(c.via);
        }
        // ===== Paramétrages d'extraction enregistrables =====
        function epList() {
            return (state.extractPresets = state.extractPresets || []);
        }
        // Convertit récursivement les identifiants de TABLE (id ↔ nom) pour rendre un paramétrage
        // portable : les id DuckDB changent à chaque session, mais les noms de source, non.
        function epRemapTableRefs(node, fn) {
            if (Array.isArray(node)) {
                node.forEach(x => epRemapTableRefs(x, fn));
                return;
            }
            if (node && typeof node === 'object') {
                for (const k of Object.keys(node)) {
                    if ((k === 'tableId' || k === 'baseId' || k === 'linkTable') && typeof node[k] === 'string' && node[k]) {
                        const r = fn(node[k]);
                        if (r != null) node[k] = r;
                    } else epRemapTableRefs(node[k], fn);
                }
            }
        }
        function epSuggestName() {
            const extractSpec = state.advExtract;
            const bn = (state.tables[extractSpec.baseId] || {}).name || 'extraction';
            return 'Extraction ' + bn;
        }
        function epSaveCurrent() {
            const extractSpec = state.advExtract;
            if (!extractSpec || !extractSpec.baseId || !state.tables[extractSpec.baseId])
                return showError("Configurez d'abord une extraction (table de départ + colonnes).");
            if (!(extractSpec.columns || []).length && !(extractSpec.group && extractSpec.group.on))
                return showError("Ajoutez au moins une colonne (ou un regroupement) avant d'enregistrer le paramétrage.");
            const name = (prompt("Nom du paramétrage d'extraction :", epSuggestName()) || '').trim();
            if (!name) return;
            const cfg = JSON.parse(JSON.stringify(extractSpec));
            delete cfg.migrated;
            delete cfg._gpos; // positions du graphe : propres à la session
            epRemapTableRefs(cfg, id => (state.tables[id] ? state.tables[id].name : id)); // id → nom
            const baseName = (state.tables[extractSpec.baseId] || {}).name || '';
            const existing = epList().find(p => p.name.toLowerCase() === name.toLowerCase());
            if (existing) {
                if (!confirm(`Un paramétrage « ${name} » existe déjà. Le remplacer ?`)) return;
                existing.config = cfg;
                existing.at = Date.now();
                existing.baseName = baseName;
            } else {
                epList().push({ id: 'ep_' + generateId(), name, at: Date.now(), baseName, config: cfg });
            }
            persistAppState();
            renderAdvExtract();
            showSuccess(`💾 Paramétrage « ${name} » enregistré.`);
        }
        function epLoad(id) {
            const presets = epList().find(x => x.id === id);
            if (!presets) return;
            const cfg = JSON.parse(JSON.stringify(presets.config));
            // 1. Recense les tables référencées (stockées par nom) et repère celles qui manquent.
            const names = new Set();
            epRemapTableRefs(cfg, n => {
                names.add(n);
                return null;
            });
            if (cfg.baseId && !tableByName(cfg.baseId))
                return showError(
                    `Impossible de charger « ${presets.name} » : la table de départ « ${cfg.baseId} » n'est pas chargée.`
                );
            const missing = Array.from(names).filter(n => !tableByName(n));
            // 2. Nom → id de la session courante (les tables absentes deviennent __MISSING__).
            epRemapTableRefs(cfg, n => {
                const table = tableByName(n);
                return table ? table.id : '__MISSING__';
            });
            // 3. Retire les colonnes / filtres / agrégats qui pointent vers une table absente.
            const bad = x => x && x.tableId === '__MISSING__';
            if (Array.isArray(cfg.columns))
                cfg.columns = cfg.columns.filter(
                    c =>
                        !bad(c) &&
                        !(c.calc && (bad(c.calc.a) || bad(c.calc.b) || (c.calc.parts || []).some(bad))) &&
                        !(c.conf && bad({ tableId: c.conf.linkTable }))
                );
            if (Array.isArray(cfg.filters)) cfg.filters = cfg.filters.filter(f => !bad(f));
            if (cfg.group && Array.isArray(cfg.group.aggs))
                cfg.group.aggs = cfg.group.aggs.filter(a => !bad(a) && !(a.conds || []).some(bad));
            // 4. Défauts de forme + nettoyage des clés de dédoublonnage devenues orphelines.
            cfg.from = cfg.from || 'table';
            cfg.columns = cfg.columns || [];
            cfg.filters = cfg.filters || [];
            cfg.dedup = cfg.dedup || { on: false, keys: [], keep: 'first' };
            cfg.dedup.keys = (cfg.dedup.keys || []).filter(k => cfg.columns.some(c => c.id === k));
            cfg.group = cfg.group || { on: false, aggs: [] };
            cfg.joinType = cfg.joinType || 'left';
            state.advExtract = cfg;
            const baseTableSelectElement = el('baseTableSelect');
            if (baseTableSelectElement && cfg.baseId) baseTableSelectElement.value = cfg.baseId;
            const vizBaseTableElement = el('vizBaseTable');
            if (vizBaseTableElement && cfg.baseId) vizBaseTableElement.value = cfg.baseId;
            renderAdvExtract();
            let msg = `📂 Paramétrage « ${presets.name} » chargé.`;
            if (missing.length) {
                msg += ` ⚠️ Source(s) absente(s), éléments correspondants ignorés : ${missing.join(', ')}.`;
                showError(msg);
            } else showSuccess(msg);
        }
        function epRename(id) {
            const presets = epList().find(x => x.id === id);
            if (!presets) return;
            const name = (prompt('Nouveau nom du paramétrage :', presets.name) || '').trim();
            if (!name || name === presets.name) return;
            if (epList().some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase()))
                return showError('Un paramétrage « ' + name + ' » existe déjà.');
            presets.name = name;
            presets.at = Date.now();
            persistAppState();
            renderAdvExtract();
            showSuccess('Paramétrage renommé « ' + name + ' ».');
        }
        function epDelete(id) {
            const presets = epList().find(x => x.id === id);
            if (!presets) return;
            if (!confirm(`Supprimer le paramétrage « ${presets.name} » ?`)) return;
            state.extractPresets = epList().filter(x => x.id !== id);
            persistAppState();
            renderAdvExtract();
            showSuccess(`Paramétrage « ${presets.name} » supprimé.`);
        }
        function renderAdvExtract() {
            const body = el('advExtractBody');
            if (!body) return;
            const extractSpec = state.advExtract;
            const readyTables = Object.values(state.tables).filter(t => t.status === 'ready');
            if (!readyTables.length) {
                body.innerHTML =
                    '<p class="text-sm text-slate-400 italic">Chargez au moins une source (onglet 1) pour utiliser l\'extraction avancée.</p>';
                return;
            }
            if (!extractSpec.baseId || !state.tables[extractSpec.baseId]) extractSpec.baseId = readyTables[0].id;
            const reach = advReachableTables();
            const bos = state.governance.businessObjects || [];
            // -- Paramétrages d'extraction enregistrés --
            const eps = epList()
                .slice()
                .sort((a, b) => (b.at || 0) - (a.at || 0));
            let html = `<div class="mb-4 p-3 rounded-lg border border-indigo-200 bg-indigo-50/40">
                <div class="text-[11px] font-bold text-indigo-700 uppercase mb-2 flex items-center gap-1.5">💾 Paramétrages d'extraction <span class="normal-case font-medium text-indigo-400">— enregistrez la configuration ci-dessous et rejouez-la plus tard</span></div>
                <div class="flex items-end gap-2 flex-wrap">
                    ${
                        eps.length
                            ? `<select id="ep-sel" class="border border-slate-300 p-2 rounded text-sm bg-white max-w-[18rem]">${eps.map(p => `<option value="${p.id}">${escapeHTML(p.name)}${p.baseName ? ` — ${escapeHTML(p.baseName)}` : ''}</option>`).join('')}</select>
                    <button onclick="epLoad(el('ep-sel').value)" class="text-sm bg-indigo-600 text-white px-3 py-2 rounded-lg font-bold">📂 Charger</button>
                    <button onclick="epRename(el('ep-sel').value)" class="text-sm bg-white border border-slate-300 text-slate-600 px-2.5 py-2 rounded-lg hover:border-indigo-300 hover:text-indigo-700" title="Renommer le paramétrage sélectionné">✎</button>
                    <button onclick="epDelete(el('ep-sel').value)" class="text-sm bg-white border border-slate-300 text-slate-500 px-2.5 py-2 rounded-lg hover:text-red-600 hover:border-red-300" title="Supprimer le paramétrage sélectionné">🗑</button>
                    <span class="text-slate-300 mx-1">|</span>`
                            : ''
                    }
                    <button onclick="epSaveCurrent()" class="text-sm bg-white border border-indigo-300 text-indigo-700 px-3 py-2 rounded-lg font-bold hover:bg-indigo-50">💾 Enregistrer le paramétrage actuel</button>
                    ${eps.length ? '' : '<span class="text-[11px] text-slate-400">Aucun paramétrage enregistré pour l\'instant.</span>'}
                </div>
            </div>`;
            // -- Bloc gouvernance --
            html += `<div class="mb-5 p-3 rounded-lg border border-emerald-200 bg-emerald-50/40">
                <div class="text-[11px] font-bold text-emerald-700 uppercase mb-2 flex items-center gap-1.5">🏛️ Partir d'un objet métier <span class="normal-case font-medium text-emerald-500">— jointures, filtres de facettes et noms métier pré-remplis</span></div>
                ${
                    bos.length
                        ? `<div class="flex items-end gap-2 flex-wrap">
                    <select id="adv-obj" class="border border-slate-300 p-2 rounded text-sm bg-white">${bos.map(b => `<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')}</select>
                    <button onclick="advLoadFromObject()" class="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold">Charger cet objet</button>
                    <span class="text-[11px] text-slate-400">écrase la configuration ci-dessous</span>
                </div>`
                        : '<p class="text-xs text-slate-400 italic">Aucun objet métier défini (onglet Gouvernance). Vous pouvez construire l\'extraction manuellement ci-dessous.</p>'
                }
            </div>`;
            // -- Table de départ : choisie dans l'en-tête de l'écran (baseTableSelect) --
            html += `<div class="mb-4 flex items-center gap-2 flex-wrap text-[12px]">
                <span class="font-bold text-slate-500">Table de départ :</span>
                <span class="bg-indigo-100 text-indigo-800 font-bold px-2.5 py-1 rounded-full">${escapeHTML((state.tables[extractSpec.baseId] || {}).name || '—')}</span>
                ${extractSpec.objectId ? `<span class="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold">objet : ${escapeHTML((bos.find(b => b.id === extractSpec.objectId) || {}).name || '')}</span>` : ''}
            </div>`;
            // -- V6.17 : vue graphique (option) — l'écran déclaratif ci-dessous reste inchangé --
            html += advGraphHtml();
            // -- V6.13 : deux tables reliées PLUSIEURS fois → on demande quel lien utiliser --
            const _amb = advJoinChoices(extractSpec);
            if (_amb.length) {
                html += `<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <div class="text-[12px] font-bold text-amber-800 mb-1.5">🔗 Quel lien utiliser ?</div>
                    <div class="text-[11px] text-amber-700 mb-2">Ces tables sont reliées par <b>plusieurs liens</b> dans le modèle de données. Choisissez ici le lien <b>par défaut</b> — et pour ramener <b>la même table par plusieurs liens à la fois</b> (ex. le nom du souscripteur ET celui du bénéficiaire), précisez le lien <b>colonne par colonne</b> avec le sélecteur « via » de la ligne d'ajout.</div>
                    ${_amb
                        .map(
                            a => `<div class="flex items-center gap-2 flex-wrap mb-1.5">
                        <span class="text-[11px] font-bold text-slate-700 bg-white border border-amber-200 rounded px-2 py-1">${escapeHTML(a.a)} ↔ ${escapeHTML(a.b)}</span>
                        <select onchange="advSetJoinChoice('${escapeHTML(a.key)}', this.value)" class="border border-amber-300 p-1.5 rounded text-[11px] bg-white min-w-[280px]">
                            ${a.rels.map(r => `<option value="${r.id}" ${a.chosen && r.id === a.chosen.id ? 'selected' : ''}>${escapeHTML(advRelLabel(r))}</option>`).join('')}
                        </select>
                        <span class="text-[10px] text-amber-600">${a.rels.length} liens possibles</span>
                    </div>`
                        )
                        .join('')}
                </div>`;
            }
            // -- Colonnes --
            html += `<div class="mb-4">
                <div class="text-[11px] font-bold text-slate-600 uppercase mb-2">1. Colonnes en sortie ${extractSpec.group.on ? '<span class="text-indigo-500 normal-case">(dimensions du regroupement)</span>' : ''}</div>`;
            if (extractSpec.columns.length) {
                html += `<div class="border border-slate-200 rounded-lg overflow-x-auto mb-2"><table class="w-full text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2 w-16" title="Glissez une ligne, ou servez-vous des flèches : c'est l'ordre des colonnes du fichier produit.">Ordre</th>
                    <th class="p-2">Source</th>
                    <th class="p-2">Nom en sortie (alias métier)</th>
                    <th class="p-2">Transformation</th>${!extractSpec.group.on && extractSpec.dedup.on ? '<th class="p-2 text-center">Clé</th>' : ''}<th class="p-2 w-8"></th>
                    </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">`;
                html += extractSpec.columns
                    .map(
                        (
                            c,
                            rang
                        ) => `<tr class="hover:bg-slate-50" ondragover="reorderDragOver(event,'advcol')" ondragleave="reorderDragLeave(event)" ondrop="reorderDrop(event,'advcol',${rang},advDeposerColonne)">
                    <td class="p-2 text-center whitespace-nowrap"><span draggable="true" ondragstart="reorderDragStart(event,'advcol',${rang})" ondragend="reorderDragEnd(event)" class="inline-block cursor-grab text-slate-300 hover:text-indigo-600 select-none text-sm leading-none" title="Glisser pour changer l'ordre des colonnes en sortie">⠿</span><br><span class="inline-flex leading-none">${advFlechesDOrdreHtml(rang, extractSpec.columns.length)}</span></td>
                    <td class="p-2 font-mono text-[11px] text-slate-500">${escapeHTML(advColLabel(c))}${advCriteresDUneColonneHtml(c)}</td>
                    <td class="p-2"><input type="text" value="${escapeHTML(c.alias)}" onchange="advUpdateColumn('${c.id}','alias',this.value)" class="border border-slate-300 p-1 rounded text-xs w-full font-bold bg-white"></td>
                    <td class="p-2"><select onchange="advUpdateColumn('${c.id}','transform',this.value)" class="border border-slate-200 p-1 rounded text-[11px] bg-white">${Object.entries(
                        ADV_TRANSFORMS
                    )
                        .map(([v, l]) => `<option value="${v}" ${v === c.transform ? 'selected' : ''}>${l}</option>`)
                        .join('')}</select>${advChoixPlusieursValeursHtml(c, extractSpec.baseId)}</td>
                    ${!extractSpec.group.on && extractSpec.dedup.on ? `<td class="p-2 text-center"><input type="checkbox" ${extractSpec.dedup.keys.includes(c.id) ? 'checked' : ''} onchange="advToggleDedupKey('${c.id}',this.checked)"></td>` : ''}
                    <td class="p-2 text-right whitespace-nowrap">${advColonneModifiable(c) ? `<button onclick="advModifierLaColonne('${c.id}')" title="Modifier cette colonne : sa source, son chemin, et pour une synthèse son mode et ses critères" class="text-slate-400 hover:text-indigo-600 font-bold mr-1">✎</button>` : ''}<button onclick="advRemoveColumn('${c.id}')" class="text-red-400 hover:text-red-600">✕</button></td>
                </tr>`
                    )
                    .join('');
                html += `</tbody></table></div>`;
            } else html += '<p class="text-xs text-slate-400 italic mb-2">Aucune colonne. Ajoutez-en ci-dessous.</p>';
            html += `<div class="flex items-end gap-2 flex-wrap bg-slate-50 border border-slate-100 rounded-lg p-2">
                ${advLaColonneModifiee() && !advLaColonneModifiee().kind ? advBandeauDeModificationHtml() : ''}
                <select id="adv-col-tbl" onchange="advColColChanged()" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${[
                    state.tables[extractSpec.baseId],
                    ...reach.filter(t => t.id !== extractSpec.baseId)
                ]
                    .filter(Boolean)
                    .map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`)
                    .join('')}</select>
                <select id="adv-col-col" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${(state.tables[extractSpec.baseId] ? state.tables[extractSpec.baseId].headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                <span id="adv-col-via-wrap" class="hidden items-center gap-1"><span class="text-[10px] font-bold text-amber-700">via</span>
                <select id="adv-col-via" class="border border-amber-300 p-1.5 rounded text-xs bg-white"></select></span>
                <button onclick="advAddColumn()" class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-bold">${advLaColonneModifiee() && !advLaColonneModifiee().kind ? '✔ Modifier' : '+ Colonne'}</button>
                <button onclick="advAddAllColumns()" class="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded font-medium">+ Toutes</button>
                <button onclick="advBulkOpen()" class="text-xs bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded font-bold">➕ Plusieurs colonnes…</button>
            </div>
            <details class="mt-2 bg-sky-50/50 border border-sky-100 rounded-lg">
                <summary class="cursor-pointer px-2 py-1.5 text-[11px] font-bold text-sky-700">Σ Synthèse d'une table liée — compter les lignes, compter les valeurs uniques, transposer en texte ou en colonnes</summary>
                <div class="p-2 flex items-end gap-1.5 flex-wrap">
                    ${advLaColonneModifiee() && advLaColonneModifiee().kind === 'link' ? advBandeauDeModificationHtml() : ''}
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Table liée</label>
                    <select id="adv-link-tbl" onchange="advLinkTblChanged()" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${reach
                        .filter(t => t.id !== extractSpec.baseId)
                        .map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`)
                        .join('')}</select></div>
                    ${advViaSelectHtml('adv-link-via')}
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Mode</label>
                    <select id="adv-link-mode" onchange="advLinkModeChanged()" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${Object.entries(
                        ADV_LINK_MODES
                    )
                        .map(([v, l]) => `<option value="${v}">${l}</option>`)
                        .join('')}</select></div>
                    <div id="adv-link-col-wrap" class="hidden"><label class="text-[9px] uppercase font-bold text-slate-400 block">Colonne</label>
                    <select id="adv-link-col" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${(reach.find(t => t.id !== extractSpec.baseId) || { headers: [] }).headers.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select></div>
                    <div id="adv-link-n-wrap" class="hidden"><label class="text-[9px] uppercase font-bold text-slate-400 block">N colonnes</label>
                    <input type="number" id="adv-link-n" value="3" min="1" max="12" class="border border-slate-300 p-1.5 rounded text-[11px] w-14"></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Nom en sortie</label>
                    <input type="text" id="adv-link-alias" placeholder="auto" class="border border-slate-300 p-1.5 rounded text-[11px] w-28"></div>
                    <button onclick="advAddLinkColumn()" class="text-[11px] bg-sky-600 text-white px-3 py-1.5 rounded font-bold">${
                        advLaColonneModifiee() && advLaColonneModifiee().kind === 'link'
                            ? '✔ Modifier'
                            : '+ Synthèse' +
                              (advCriteresDeSyntheseEnAttente.length
                                  ? ' (avec ' + advCriteresDeSyntheseEnAttente.length + ' critère(s))'
                                  : '')
                    }</button>
                    <span class="text-[10px] text-slate-400">1 ligne par ligne de la table de départ — jamais de multiplication de lignes.</span>
                    ${advLigneDeCritereHtml()}
                </div>
            </details>
            <details class="mt-2 bg-purple-50/50 border border-purple-100 rounded-lg">
                <summary class="cursor-pointer px-2 py-1.5 text-[11px] font-bold text-purple-700">🌳 Hiérarchie aplatie — colonnes niveau 1…N (dans la même table ou via table de liaison, avec période de validité)</summary>
                <div class="p-2 flex items-end gap-1.5 flex-wrap">
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Table hiérarchique</label>
                    <select id="adv-hier-tbl" onchange="advHierTblChanged()" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${reach.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('')}</select></div>
                    ${advViaSelectHtml('adv-hier-via')}
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Type</label>
                    <select id="adv-hier-type" onchange="advHierTypeChanged()" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white"><option value="simple">Parent dans la même table</option><option value="link">Via table de liaison</option></select></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Identifiant</label>
                    <select id="adv-hier-id" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${(reach[0] || { headers: [] }).headers.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select></div>
                    <div class="basis-full"><label class="text-[9px] uppercase font-bold text-slate-400 block" title="Colonnes de la table hiérarchique à restituer par niveau (ex. code ET libellé). Par défaut : l'identifiant.">Attributs à extraire par niveau (1 ou plusieurs)</label>
                    <div class="flex items-center gap-1.5 flex-wrap mt-0.5"><select id="adv-hier-label" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white"><option value="">— l'identifiant —</option>${(reach[0] || { headers: [] }).headers.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select><button onclick="advHierAddAttr()" class="text-[11px] bg-white border border-purple-300 text-purple-700 px-2 py-1 rounded font-bold hover:bg-purple-50">➕ ajouter l'attribut</button><span id="adv-hier-attrs" class="flex items-center gap-1 flex-wrap"></span></div>
                        </div>
                    <div id="adv-hier-simple-wrap"><label class="text-[9px] uppercase font-bold text-slate-400 block">Parent</label>
                    <select id="adv-hier-parent" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${(reach[0] || { headers: [] }).headers.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select></div>
                    <div id="adv-hier-link-wrap" class="hidden flex items-end gap-1.5 flex-wrap">
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Table de liaison</label>
                        <select id="adv-hier-ltbl" onchange="advHierLinkTblChanged()" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${readyTables.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('')}</select></div>
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Enfant</label><select id="adv-hier-lchild" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white"></select></div>
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Parent</label><select id="adv-hier-lparent" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white"></select></div>
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Valide du</label><select id="adv-hier-lfrom" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white"><option value="">— non utilisé —</option></select></div>
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Valide au</label><select id="adv-hier-lto" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white"><option value="">— non utilisé —</option></select></div>
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Date de réf.</label><input type="date" id="adv-hier-refdate" class="border border-slate-300 p-1.5 rounded text-[11px]"></div>
                    </div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Profondeur</label>
                    <input type="number" id="adv-hier-depth" value="5" min="1" max="20" class="border border-slate-300 p-1.5 rounded text-[11px] w-14"></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Préfixe en sortie</label>
                    <input type="text" id="adv-hier-alias" placeholder="auto" class="border border-slate-300 p-1.5 rounded text-[11px] w-24"></div>
                    <button onclick="advAddHierColumn()" class="text-[11px] bg-purple-600 text-white px-3 py-1.5 rounded font-bold">+ Hiérarchie</button>
                </div>
            </details>
            <details class="mt-2 bg-amber-50/50 border border-amber-100 rounded-lg">
                <summary class="cursor-pointer px-2 py-1.5 text-[11px] font-bold text-amber-700">ƒx Colonne calculée — façon Excel (CONCATENER, GAUCHE, DROITE, STXT, NBCAR, SI)</summary>
                <div class="p-2 flex items-end gap-1.5 flex-wrap">
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Fonction</label>
                    <select id="adv-calc-fn" onchange="advCalcFnChanged()" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${Object.entries(
                        ADV_CALC_FNS
                    )
                        .map(([v, l]) => `<option value="${v}">${l}</option>`)
                        .join('')}</select></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Colonne source</label>
                    <div class="flex gap-1"><select id="adv-calc-a-tbl" onchange="advCalcTblChanged('a')" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${[
                        state.tables[extractSpec.baseId],
                        ...reach.filter(t => t.id !== extractSpec.baseId)
                    ]
                        .filter(Boolean)
                        .map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`)
                        .join('')}</select>
                    <select id="adv-calc-a-col" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${(state.tables[extractSpec.baseId] ? state.tables[extractSpec.baseId].headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>${advViaSelectHtml('adv-calc-a-via')}</div>
                        </div>
                    <div id="adv-calc-b-wrap" class="hidden"><label class="text-[9px] uppercase font-bold text-slate-400 block">2e colonne</label>
                    <div class="flex gap-1"><select id="adv-calc-b-tbl" onchange="advCalcTblChanged('b')" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${[
                        state.tables[extractSpec.baseId],
                        ...reach.filter(t => t.id !== extractSpec.baseId)
                    ]
                        .filter(Boolean)
                        .map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`)
                        .join('')}</select>
                    <select id="adv-calc-b-col" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${(state.tables[extractSpec.baseId] ? state.tables[extractSpec.baseId].headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>${advViaSelectHtml('adv-calc-b-via')}</div>
                        </div>
                    <div id="adv-calc-parts-wrap" class="hidden basis-full"><label class="text-[9px] uppercase font-bold text-slate-400 block">Colonnes à concaténer (choisissez « Colonne source » puis ➕, dans l'ordre — 2 ou plus)</label>
                    <div class="flex items-center gap-1.5 flex-wrap mt-0.5"><button onclick="advConcatAddPart()" class="text-[11px] bg-white border border-amber-300 text-amber-700 px-2 py-1 rounded font-bold hover:bg-amber-50">➕ ajouter cette colonne</button><span id="adv-calc-parts" class="flex items-center gap-1 flex-wrap"><span class="text-[10px] text-slate-400 italic">Empilez au moins 2 colonnes (dans l'ordre).</span></span></div>
                        </div>
                    <div id="adv-calc-sep-wrap" class="hidden"><label class="text-[9px] uppercase font-bold text-slate-400 block">Séparateur</label>
                    <input type="text" id="adv-calc-sep" value=" " class="border border-slate-300 p-1.5 rounded text-[11px] w-14"></div>
                    <div id="adv-calc-start-wrap" class="hidden"><label class="text-[9px] uppercase font-bold text-slate-400 block">Début</label>
                    <input type="number" id="adv-calc-start" value="1" min="1" class="border border-slate-300 p-1.5 rounded text-[11px] w-14"></div>
                    <div id="adv-calc-n-wrap" class="hidden"><label class="text-[9px] uppercase font-bold text-slate-400 block">N caractères</label>
                    <input type="number" id="adv-calc-n" value="3" min="1" class="border border-slate-300 p-1.5 rounded text-[11px] w-16"></div>
                    <div id="adv-calc-si-wrap" class="hidden flex items-end gap-1.5 flex-wrap">
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Opérateur</label>
                        <select id="adv-calc-si-op" class="border border-slate-300 p-1.5 rounded text-[11px] bg-white">${Object.entries(
                            SCOPE_OPS
                        )
                            .map(([v, l]) => `<option value="${v}">${l}</option>`)
                            .join('')}</select></div>
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Valeur test</label>
                        <input type="text" id="adv-calc-si-val" class="border border-slate-300 p-1.5 rounded text-[11px] w-24"></div>
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Alors</label>
                        <input type="text" id="adv-calc-si-then" value="OUI" class="border border-slate-300 p-1.5 rounded text-[11px] w-20"></div>
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Sinon</label>
                        <input type="text" id="adv-calc-si-else" value="NON" class="border border-slate-300 p-1.5 rounded text-[11px] w-20"></div>
                    </div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Nom en sortie</label>
                    <input type="text" id="adv-calc-alias" placeholder="auto" class="border border-slate-300 p-1.5 rounded text-[11px] w-28"></div>
                    <button onclick="advAddCalcColumn()" class="text-[11px] bg-amber-600 text-white px-3 py-1.5 rounded font-bold">+ Colonne calculée</button>
                </div>
            </details>
                                </div>`;
            // -- Filtres --
            html += `<div class="mb-4">
                <div class="text-[11px] font-bold text-slate-600 uppercase mb-2">2. Filtres</div>`;
            if (extractSpec.filters.length)
                html += `<div class="flex flex-wrap gap-1.5 mb-2">${extractSpec.filters
                    .map(f => {
                        const surUneTableLiee = f.tableId !== extractSpec.baseId;
                        const portee = advPorteeDuFiltre(f, extractSpec.baseId);
                        // Sur une table liée, la portée se lit et se change sur le filtre lui-même :
                        // c'est elle qui décide si des lignes disparaissent du fichier.
                        const choixDeLaPortee =
                            surUneTableLiee && f.via === 'any'
                                ? `<em class="not-italic text-[10px] text-amber-800 font-bold" title="« L'un ou l'autre chemin » compare plusieurs liens à la fois : la condition ne peut pas être écrite dans un seul lien. Choisissez un chemin précis pour pouvoir la poser sur le lien.">sur la ligne (chemins multiples)</em>`
                                : surUneTableLiee
                                  ? `<select onchange="advChangerLaPorteeDuFiltre('${f.id}', this.value)" title="Sur le lien : la ligne de départ reste, même sans lien. Sur la ligne : elle disparaît si elle ne satisfait pas le filtre — y compris quand le lien n'existe pas." class="text-[10px] bg-white border rounded px-1 py-0.5 ${portee === 'lien' ? 'border-blue-300 text-blue-700' : 'border-amber-400 text-amber-800 font-bold'}">${Object.entries(
                                        ADV_PORTEES_DE_FILTRE
                                    )
                                        .map(
                                            ([v, l]) =>
                                                `<option value="${v}" ${v === portee ? 'selected' : ''}>${escapeHTML(l)}</option>`
                                        )
                                        .join('')}</select>`
                                  : '';
                        // Un filtre sur le lien qui ne restreint rien : mieux vaut le dire que de
                        // laisser croire qu'il agit.
                        const sansEffet = (extractSpec._filtresSansEffet || []).includes(f.id)
                            ? `<em class="not-italic text-[10px] text-slate-400" title="Aucune colonne n'est ramenée de cette table : il n'y a rien à restreindre. Ajoutez une colonne ou une synthèse de cette table, ou passez le filtre « sur la ligne ».">sans effet</em>`
                            : '';
                        return `<span class="text-[11px] bg-blue-50 border border-blue-200 text-blue-800 rounded-full px-2.5 py-1 flex items-center gap-1">${sansEffet}<strong>${escapeHTML((state.tables[f.tableId] || {}).name || '')}.${escapeHTML(f.col)}</strong>${f.via ? `<em class="not-italic text-[10px] text-amber-700 font-bold">${escapeHTML(advViaTxt(f.via))}</em>` : ''} ${ADV_OPS[f.op] || SCOPE_OPS[f.op] || f.op}${f.op === 'empty' || f.op === 'notempty' ? '' : ` "${escapeHTML(f.val)}"`} ${choixDeLaPortee}<button onclick="advRemoveFilter('${f.id}')" class="text-blue-400 hover:text-red-500">✕</button></span>`;
                    })
                    .join('')}</div>`;
            html += `<div class="flex items-end gap-2 flex-wrap bg-slate-50 border border-slate-100 rounded-lg p-2">
                <select id="adv-flt-tbl" onchange="advFltTblChanged()" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${[
                    state.tables[extractSpec.baseId],
                    ...reach.filter(t => t.id !== extractSpec.baseId)
                ]
                    .filter(Boolean)
                    .map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`)
                    .join('')}</select>
                <select id="adv-flt-col" onchange="advFillFilterVals()" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${(state.tables[extractSpec.baseId] ? state.tables[extractSpec.baseId].headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                <select id="adv-flt-op" onchange="el('adv-flt-val').classList.toggle('hidden', this.value==='empty'||this.value==='notempty')" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${Object.entries(
                    ADV_OPS
                )
                    .map(([v, l]) => `<option value="${v}">${l}</option>`)
                    .join('')}</select>
                <input type="text" id="adv-flt-val" list="adv-flt-vals" onfocus="advFillFilterVals()" class="border border-slate-300 p-1.5 rounded text-xs w-36" placeholder="choisir ou saisir..."><datalist id="adv-flt-vals"></datalist>
                ${advViaSelectHtml('adv-flt-via')}
                <button onclick="advAddFilter()" class="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-bold">+ Filtre</button>
            </div>
                    </div>`;
            // -- Options : dédoublonnage & agrégats --
            html += `<div class="mb-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div class="p-3 border border-slate-200 rounded-lg">
                    <label class="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-700"><input type="checkbox" ${extractSpec.dedup.on ? 'checked' : ''} onchange="advToggleDedup(this.checked)" ${extractSpec.group.on ? 'disabled' : ''}> 🎯 Dédoublonner par clé fonctionnelle</label>
                    ${
                        extractSpec.dedup.on && !extractSpec.group.on
                            ? `<div class="mt-2 text-[11px] text-slate-500">Cochez les colonnes « Clé » ci-dessus (${extractSpec.dedup.keys.length} sélectionnée(s)). Conserver :
                        <select onchange="advSetDedupKeep(this.value)" class="border border-slate-200 rounded p-1 text-[11px] bg-white ml-1"><option value="first" ${extractSpec.dedup.keep === 'first' ? 'selected' : ''}>1re ligne</option><option value="last" ${extractSpec.dedup.keep === 'last' ? 'selected' : ''}>dernière ligne</option></select></div>`
                            : extractSpec.group.on
                              ? '<p class="text-[10px] text-slate-400 mt-1">Indisponible avec le regroupement.</p>'
                              : ''
                    }
                </div>
                <div class="p-3 border border-slate-200 rounded-lg">
                    <label class="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-700"><input type="checkbox" ${extractSpec.group.on ? 'checked' : ''} onchange="advToggleGroup(this.checked)"> 🧮 Regrouper & agréger (group by)</label>
                    ${
                        extractSpec.group.on
                            ? `<div class="mt-2">
                        <p class="text-[10px] text-slate-400 mb-1.5">Sans colonne en sortie = totaux globaux (une seule ligne). Ajoutez des <strong>critères</strong> à un agrégat pour reproduire NB.SI.ENS / SOMME.SI.ENS.</p>
                        ${extractSpec.group.aggs.length ? `<div class="space-y-1 mb-2">${extractSpec.group.aggs.map(a => `<div class="flex items-center gap-1.5 flex-wrap text-[11px] bg-slate-50 rounded p-1"><span class="font-bold">${ADV_AGGS[a.fn].split(' (')[0]}</span> <span class="font-mono text-slate-500">${a.fn === 'count' ? '' : escapeHTML((state.tables[a.tableId] || {}).name + '.' + a.col + advViaTxt(a.via))}</span>${(a.conds || []).length ? ` <span class="text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">SI ${(a.conds || []).map(cc => escapeHTML(((state.tables[cc.tableId] || {}).name || '') + '.' + cc.col + advViaTxt(cc.via) + ' ' + (SCOPE_OPS[cc.op] || cc.op) + (cc.op === 'empty' || cc.op === 'notempty' ? '' : ' "' + cc.val + '"'))).join(' ET ')}</span>` : ''} → <input type="text" value="${escapeHTML(a.alias)}" onchange="advUpdateAgg('${a.id}','alias',this.value)" class="border border-slate-200 rounded p-0.5 text-[11px] w-28"> <button onclick="advRemoveAgg('${a.id}')" class="text-red-400 hover:text-red-600 ml-auto">✕</button></div>`).join('')}</div>` : ''}
                        ${advPendingAggConds.length ? `<div class="flex flex-wrap gap-1 mb-1.5">${advPendingAggConds.map((cc, i) => `<span class="text-[10px] bg-amber-100 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5">critère : ${escapeHTML(((state.tables[cc.tableId] || {}).name || '') + '.' + cc.col + advViaTxt(cc.via) + ' ' + (SCOPE_OPS[cc.op] || cc.op) + (cc.op === 'empty' || cc.op === 'notempty' ? '' : ' "' + cc.val + '"'))} <button onclick="advRemovePendingCond(${i})" class="text-amber-500 hover:text-red-600">✕</button></span>`).join('')}</div>` : ''}
                        <div class="flex items-end gap-1.5 flex-wrap mb-1.5 bg-amber-50/40 border border-amber-100 rounded p-1.5">
                            <span class="text-[9px] uppercase font-bold text-amber-600 self-center">Critères (optionnel, NB.SI.ENS)</span>
                            <select id="adv-aggc-tbl" onchange="advAggCondTblChanged()" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${[
                                state.tables[extractSpec.baseId],
                                ...reach.filter(t => t.id !== extractSpec.baseId)
                            ]
                                .filter(Boolean)
                                .map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`)
                                .join('')}</select>
                            <select id="adv-aggc-col" onchange="advFillAggCondVals()" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${(state.tables[extractSpec.baseId] ? state.tables[extractSpec.baseId].headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                            <select id="adv-aggc-op" onchange="el('adv-aggc-val').classList.toggle('hidden', this.value==='empty'||this.value==='notempty')" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${Object.entries(
                                SCOPE_OPS
                            )
                                .map(([v, l]) => `<option value="${v}">${l}</option>`)
                                .join('')}</select>
                            <input type="text" id="adv-aggc-val" list="adv-aggc-vals" onfocus="advFillAggCondVals()" class="border border-slate-300 p-1 rounded text-[11px] w-28" placeholder="valeur..."><datalist id="adv-aggc-vals"></datalist>
                            ${advViaSelectHtml('adv-aggc-via')}
                            <button onclick="advAddAggCond()" class="text-[11px] bg-amber-600 text-white px-2 py-1 rounded font-bold">+ Critère</button>
                        </div>
                        <div class="flex items-end gap-1.5 flex-wrap">
                            <select id="adv-agg-fn" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${Object.entries(
                                ADV_AGGS
                            )
                                .map(([v, l]) => `<option value="${v}">${l}</option>`)
                                .join('')}</select>
                            <select id="adv-agg-tbl" onchange="advAggTblChanged()" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${[
                                state.tables[extractSpec.baseId],
                                ...reach.filter(t => t.id !== extractSpec.baseId)
                            ]
                                .filter(Boolean)
                                .map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`)
                                .join('')}</select>
                            <select id="adv-agg-col" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${(state.tables[extractSpec.baseId] ? state.tables[extractSpec.baseId].headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                            ${advViaSelectHtml('adv-agg-via')}
                            <button onclick="advAddAgg()" class="text-[11px] bg-indigo-600 text-white px-2 py-1 rounded font-bold">+ Agrégat${advPendingAggConds.length ? ' (avec ' + advPendingAggConds.length + ' critère(s))' : ''}</button>
                        </div>
                    </div>`
                            : ''
                    }
                </div>
            </div>`;
            // -- Actions & aperçu --
            html += `<div class="border-t border-slate-100 pt-3">
                <div class="flex items-center gap-2 flex-wrap mb-3">
                    <button onclick="advCount()" class="text-sm bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-50">🔢 Compter</button>
                    <span id="adv-count" class="text-sm font-black text-indigo-700">—</span>
                    <button onclick="advPreview()" class="text-sm bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50">👁️ Prévisualiser</button>
                    <button onclick="advQuality()" class="text-sm bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50">✅ Bilan qualité</button>
                    <button onclick="advShowSql()" class="text-sm bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50">📝 Voir le SQL</button>
                </div>
                <div id="adv-preview" class="mb-2"></div>
                <div id="adv-quality" class="mb-2"></div>
                <div id="adv-sql-wrap" class="${el('adv-sql-wrap') && !el('adv-sql-wrap').classList.contains('hidden') ? '' : 'hidden'} mb-2">
                    <label class="flex items-center gap-2 text-[11px] font-bold text-slate-500 mb-1"><input type="checkbox" ${extractSpec.customSql ? 'checked' : ''} onchange="advToggleCustomSql(this.checked)"> SQL personnalisé (éditer librement la requête)</label>
                    <textarea id="adv-sql" ${extractSpec.customSql ? '' : 'readonly'} class="w-full border border-slate-300 rounded-lg p-2 font-mono text-[11px] bg-slate-900 text-emerald-300 h-40"></textarea>
                </div>
                <div class="flex items-center gap-3 flex-wrap mb-2 text-[11.5px]">
                    <span class="font-bold text-slate-500">Jointures :</span>
                    <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="advJoinType" value="left" ${extractSpec.joinType !== 'inner' ? 'checked' : ''} onchange="advSetJoinType('left')"> Conserver tout (left join)</label>
                    <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="advJoinType" value="inner" ${extractSpec.joinType === 'inner' ? 'checked' : ''} onchange="advSetJoinType('inner')"> Intersection (inner join)</label>
                    <label class="flex items-center gap-1.5 cursor-pointer text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1"><input type="checkbox" ${extractSpec.limit500 ? 'checked' : ''} onchange="advSetLimit500(this.checked); renderAdvExtract()"> Mode « aperçu rapide » — limiter à 500 lignes</label>
                </div>
                <div class="flex items-center gap-3 flex-wrap bg-indigo-50/40 border border-indigo-100 rounded-lg p-3">
                    <button id="adv-generate" onclick="advGenerate()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg">⬇️ Générer le CSV</button>
                    <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" id="adv-add-source" class="w-4 h-4"> Ajouter aussi comme nouvelle source</label>
                    <input type="text" id="adv-source-name" placeholder="Nom de la source (optionnel)" class="border border-slate-300 p-1.5 rounded text-xs flex-grow min-w-[160px]">
                </div>
            </div>`;
            body.innerHTML = html;
            if (window.lucide) lucide.createIcons({ root: body });
            if (el('adv-calc-fn')) {
                advCalcFnChanged();
                advRenderConcatParts();
            }
            if (el('adv-hier-label')) advRenderHierAttrs();
            advInitViaSelects();
            if (extractSpec.graphMode) setTimeout(advDrawGraph, 0);
            if (!extractSpec.customSql && el('adv-sql-wrap') && !el('adv-sql-wrap').classList.contains('hidden')) advShowSql();
        }
        // Après chaque rendu, tous les sélecteurs de chemin se calent sur leur table courante.
        const ADV_VIA_SELECTS = [
            ['adv-col-via', 'adv-col-tbl'],
            ['adv-calc-a-via', 'adv-calc-a-tbl'],
            ['adv-calc-b-via', 'adv-calc-b-tbl'],
            ['adv-flt-via', 'adv-flt-tbl'],
            ['adv-agg-via', 'adv-agg-tbl'],
            ['adv-aggc-via', 'adv-aggc-tbl'],
            ['adv-link-via', 'adv-link-tbl'],
            ['adv-hier-via', 'adv-hier-tbl']
        ];
        function advInitViaSelects() {
            ADV_VIA_SELECTS.forEach(([v, t]) => {
                const element = el(t);
                if (element && el(v)) advViaSync(v, element.value);
            });
        }
        // ============ V6.17 : VUE GRAPHIQUE DE L'EXTRACTION (option, l'écran classique reste) ============
        // Le graphe matérialise ce que le planificateur de jointures fait déjà : à partir de la table de
        // départ, il déplie un ARBRE DE ROUTES. Chaque nœud = une table atteinte PAR UN CHEMIN PRÉCIS.
        // Une table reliée deux fois apparaît donc deux fois, une par lien : cocher une colonne sur le
        // bon nœud renseigne le « via » tout seul — plus besoin de le choisir dans une liste.
        const ADV_G_MAXHOPS = 3,
            ADV_G_MAXNODES = 24;
        // ============ V6.23 : PLEIN ÉCRAN DES GRAPHES (extraction & lineage) ============
        // Un seul mécanisme pour les deux canevas : on épingle le conteneur en plein écran, on
        // redessine (la largeur disponible change), et on rend la sortie évidente (bouton + Échap).
        let gfxFullId = null,
            gfxFullRedraw = null;
        function gfxInjectCss() {
            if (el('gfxStyles')) return;
            const styleElement = document.createElement('style');
            styleElement.id = 'gfxStyles';
            styleElement.textContent = `
            .gfx-full{position:fixed !important;inset:0 !important;z-index:60 !important;margin:0 !important;border-radius:0 !important;
                      width:100vw !important;max-width:100vw !important;height:100vh !important;overflow:auto !important;background:#fff !important;
                      padding:10px 12px 12px !important;box-shadow:none !important}
            /* En plein écran, la barre d'outils reste visible et collée en haut. */
            .gfx-full .gfx-bar{position:sticky;top:0;z-index:62;background:#fff;padding-bottom:6px;border-bottom:1px solid #e2e8f0;margin-bottom:8px}
            .gfx-full .gfx-hide-full{display:none !important}
            body.gfx-lock{overflow:hidden !important}
            .gfx-exit{position:fixed;top:12px;right:16px;z-index:61;background:#1e293b;color:#fff;border:none;border-radius:10px;
                      padding:7px 14px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(15,23,42,.25)}
            .gfx-exit:hover{background:#334155}`;
            document.head.appendChild(styleElement);
        }
        function gfxIsFull(id) {
            const element = el(id);
            return !!element && (element.classList.contains('gfx-full') || !!(element.closest && element.closest('.gfx-full')));
        }
        // Hauteur disponible pour un canevas en plein écran : tout ce qui reste sous la barre d'outils.
        function gfxAvailH(c) {
            const top = c.getBoundingClientRect().top;
            return Math.max(240, window.innerHeight - top - 12);
        }
        function gfxExitFull() {
            const element = gfxFullId ? el(gfxFullId) : null;
            if (element) element.classList.remove('gfx-full');
            document.body.classList.remove('gfx-lock');
            const btn = document.querySelector('.gfx-exit');
            if (btn) btn.remove();
            const rd = gfxFullRedraw;
            gfxFullId = null;
            gfxFullRedraw = null;
            if (typeof rd === 'function') setTimeout(rd, 0);
        }
        function gfxToggleFull(id, redrawName) {
            gfxInjectCss();
            const element = el(id);
            if (!element) return;
            if (gfxIsFull(id)) return gfxExitFull();
            if (gfxFullId) gfxExitFull();
            element.classList.add('gfx-full');
            document.body.classList.add('gfx-lock');
            gfxFullId = id;
            gfxFullRedraw = window[redrawName];
            if (!document.querySelector('.gfx-exit')) {
                const buttonElement = document.createElement('button');
                buttonElement.className = 'gfx-exit';
                buttonElement.textContent = '✕ Quitter le plein écran (Échap)';
                buttonElement.onclick = gfxExitFull;
                document.body.appendChild(buttonElement);
            }
            if (!window.__gfxEsc) {
                window.__gfxEsc = true;
                document.addEventListener('keydown', e2 => {
                    if (e2.key === 'Escape' && gfxFullId) gfxExitFull();
                });
            }
            if (typeof window[redrawName] === 'function') setTimeout(window[redrawName], 0);
        }
        function gfxFullBtn(id, redrawName, label) {
            return `<button onclick="gfxToggleFull('${id}', '${redrawName}')" title="Afficher le graphe en plein écran (Échap pour sortir)" class="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">⛶ ${label || 'Plein écran'}</button>`;
        }
        function advGInjectCss() {
            if (el('advGStyles')) return;
            const styleElement = document.createElement('style');
            styleElement.id = 'advGStyles';
            styleElement.textContent = `
            #advGCanvas{position:relative;background:linear-gradient(0deg,#fbfcfe,#fff);border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;min-height:320px}
            #advGCanvas .advg-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;text-align:center;padding:24px}
            .advg-edges{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
            .advg-node{position:absolute;width:236px;background:#fff;border:1.5px solid #d4dbe6;border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 6px 16px rgba(15,23,42,.06);z-index:2;overflow:hidden}
            .advg-node.advg-base{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15),0 6px 16px rgba(15,23,42,.08)}
            .advg-nh{display:flex;align-items:center;gap:7px;padding:7px 9px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;cursor:grab;touch-action:none;user-select:none}
            .advg-base .advg-nh{background:#eef2ff}
            .advg-nm{font-weight:800;font-size:12px;color:#1e293b;line-height:1.15;flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .advg-via{font-size:9.5px;color:#b45309;font-weight:700;padding:2px 9px 4px;background:#fffbeb;border-bottom:1px solid #fde68a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .advg-cnt{font-size:9.5px;font-weight:800;background:#4f46e5;color:#fff;border-radius:999px;padding:1px 6px}
            .advg-cols{max-height:190px;overflow-y:auto;padding:3px 0}
            .advg-row{display:flex;align-items:center;gap:5px;padding:2px 8px;font-size:11px;cursor:pointer}
            .advg-row:hover{background:#f8fafc}
            .advg-row.on{background:#eef2ff}
            .advg-row .advg-cn{flex-grow:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#334155}
            .advg-row.on .advg-cn{font-weight:700;color:#3730a3}
            .advg-mini{display:flex;gap:3px;padding:0 8px 4px 25px}
            .advg-mini input,.advg-mini select{font-size:10px;border:1px solid #c7d2fe;border-radius:4px;padding:1px 3px;background:#fff;min-width:0}
            .advg-flt{margin:0 8px 4px 25px;display:flex;gap:3px;align-items:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:2px 3px}
            .advg-flt select,.advg-flt input{font-size:10px;border:1px solid #bfdbfe;border-radius:4px;padding:1px 2px;background:#fff;min-width:0}
            .advg-btn{font-size:10px;border:1px solid #cbd5e1;background:#fff;border-radius:5px;padding:1px 5px;cursor:pointer;color:#475569;font-weight:700}
            .advg-btn:hover{border-color:#6366f1;color:#4338ca}
            .advg-foot{display:flex;gap:4px;padding:5px 8px;border-top:1px solid #f1f5f9;background:#fcfdff;flex-wrap:wrap}
            .advg-elbl{position:absolute;transform:translate(-50%,-50%);background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:1px 7px;font-size:9.5px;color:#64748b;white-space:nowrap;z-index:3;pointer-events:none;box-shadow:0 1px 2px rgba(15,23,42,.05);max-width:280px;overflow:hidden;text-overflow:ellipsis}
            .advg-elbl-hid{opacity:0;transition:opacity .12s}
            .advg-elbl-hid.advg-elbl-on{opacity:1;z-index:12;border-color:#6366f1;color:#3730a3;box-shadow:0 3px 10px rgba(15,23,42,.14);max-width:none}`;
            document.head.appendChild(styleElement);
        }
        // Arbre des routes : chaque entrée = { key, tableId, via, parentKey, rel, depth }.
        function advRoutes() {
            const extractSpec = state.advExtract,
                base = extractSpec.baseId;
            if (!base || !state.tables[base]) return [];
            const rels = (state.relations || []).filter(advRelValid);
            const adj = {};
            rels.forEach(r => {
                (adj[r.sourceTable] = adj[r.sourceTable] || []).push({ rel: r, other: r.targetTable });
                (adj[r.targetTable] = adj[r.targetTable] || []).push({ rel: r, other: r.sourceTable });
            });
            const root = { key: advRouteKey(base, ''), tableId: base, via: '', parentKey: null, rel: null, depth: 0 };
            const out = [root];
            const seen = new Set([root.key]);
            const queue = [{ node: root, path: [], visited: new Set([base]) }];
            while (queue.length && out.length < ADV_G_MAXNODES) {
                const { node, path, visited } = queue.shift();
                if (path.length >= ADV_G_MAXHOPS) continue;
                for (const e of adj[node.tableId] || []) {
                    if (out.length >= ADV_G_MAXNODES) break;
                    if (visited.has(e.other)) continue; // pas de retour en arrière : l'arbre reste lisible
                    const np = path.concat([e.rel]);
                    const via = advPathKey(np);
                    const k = advRouteKey(e.other, via);
                    if (seen.has(k)) continue;
                    seen.add(k);
                    const child = { key: k, tableId: e.other, via, parentKey: node.key, rel: e.rel, depth: node.depth + 1 };
                    out.push(child);
                    queue.push({ node: child, path: np, visited: new Set([...visited, e.other]) });
                }
            }
            // Une table atteinte par un SEUL chemin garde « via » vide : c'est le chemin par défaut du
            // planificateur, et le paramétrage reste ainsi identique à celui de l'écran classique.
            const nb = {};
            out.forEach(r => {
                nb[r.tableId] = (nb[r.tableId] || 0) + 1;
            });
            out.forEach(r => {
                if (r.parentKey && nb[r.tableId] === 1) r.via = '';
            });
            return out;
        }
        function advGRouteOf(key) {
            return advRoutes().find(r => r.key === key) || null;
        }
        function advGCol(rt, col) {
            return (state.advExtract.columns || []).find(
                c => !c.kind && c.tableId === rt.tableId && c.col === col && (c.via || '') === (rt.via || '')
            );
        }
        function advGFilters(rt, col) {
            return (state.advExtract.filters || []).filter(
                f => f.tableId === rt.tableId && f.col === col && (f.via || '') === (rt.via || '')
            );
        }
        // Alias unique et lisible : on suffixe par la table traversée quand le nom est déjà pris.
        function advGAlias(rt, col) {
            const extractSpec = state.advExtract;
            const taken = new Set((extractSpec.columns || []).map(c => c.alias));
            if (!taken.has(col)) return col;
            const tn = ((state.tables[rt.tableId] || {}).name || '').replace(/\.[a-z]+$/i, '').replace(/\W+/g, '_');
            let a = (tn ? tn + '_' : '') + col,
                i = 2;
            while (taken.has(a)) a = (tn ? tn + '_' : '') + col + '_' + i++;
            return a;
        }
        function advGToggleCol(key, col) {
            const need = advGRouteOf(key);
            if (!need) return;
            const extractSpec = state.advExtract;
            const ex = advGCol(need, col);
            if (ex) extractSpec.columns = extractSpec.columns.filter(c => c !== ex);
            else
                extractSpec.columns.push({
                    id: 'ac_' + generateId(),
                    tableId: need.tableId,
                    col,
                    via: need.via || '',
                    alias: advGAlias(need, col),
                    transform: 'none'
                });
            renderAdvExtract();
        }
        function advGAllCols(key, on) {
            const need = advGRouteOf(key);
            const t = need && state.tables[need.tableId];
            if (!t) return;
            const extractSpec = state.advExtract;
            if (on)
                t.headers.forEach(h => {
                    if (!advGCol(need, h))
                        extractSpec.columns.push({
                            id: 'ac_' + generateId(),
                            tableId: need.tableId,
                            col: h,
                            via: need.via || '',
                            alias: advGAlias(need, h),
                            transform: 'none'
                        });
                });
            else
                extractSpec.columns = extractSpec.columns.filter(
                    c => c.kind || !(c.tableId === need.tableId && (c.via || '') === (need.via || ''))
                );
            renderAdvExtract();
        }
        function advGSetField(key, col, field, val) {
            const rt = advGRouteOf(key);
            const c = rt && advGCol(rt, col);
            if (!c) return;
            c[field] = val;
            if (field === 'alias' && !val) c.alias = col;
            advGDrawSoft();
        }
        function advGAddFilter(key, col) {
            const need = advGRouteOf(key);
            if (!need) return;
            state.advExtract.filters.push({
                id: 'af_' + generateId(),
                tableId: need.tableId,
                col,
                op: '=',
                val: '',
                via: need.via || ''
            });
            renderAdvExtract();
        }
        function advGSetFilter(id, field, val) {
            const filter = (state.advExtract.filters || []).find(x => x.id === id);
            if (filter) {
                filter[field] = val;
                advGDrawSoft();
            }
        }
        function advGDelFilter(id) {
            state.advExtract.filters = (state.advExtract.filters || []).filter(f => f.id !== id);
            renderAdvExtract();
        }
        // Σ en un clic : compte les lignes liées, ancré sur CE chemin (aucune multiplication de lignes).
        function advGAddCount(key) {
            const need = advGRouteOf(key);
            if (!need || need.tableId === state.advExtract.baseId) return;
            const tn = (state.tables[need.tableId] || {}).name || 'liees';
            state.advExtract.columns.push({
                id: 'ac_' + generateId(),
                kind: 'link',
                tableId: need.tableId,
                mode: 'count',
                col: '',
                n: 3,
                via: need.via || '',
                alias: advGAlias(need, 'nb_' + tn),
                transform: 'none'
            });
            renderAdvExtract();
        }
        function advGSetBase(key) {
            const rt = advGRouteOf(key);
            if (!rt || rt.tableId === state.advExtract.baseId) return;
            if (
                !confirm(
                    'Repartir de « ' +
                        ((state.tables[rt.tableId] || {}).name || '') +
                        ' » comme table de départ ? Les colonnes déjà choisies seront conservées si elles restent atteignables.'
                )
            )
                return;
            state.advExtract.baseId = rt.tableId;
            state.advExtract.columns = (state.advExtract.columns || []).map(c => Object.assign({}, c, { via: '' }));
            state.advExtract.filters = (state.advExtract.filters || []).map(f => Object.assign({}, f, { via: '' }));
            const baseTableSelectElement = el('baseTableSelect');
            if (baseTableSelectElement) baseTableSelectElement.value = rt.tableId;
            renderAdvExtract();
        }
        function advGToggleMode(on) {
            state.advExtract.graphMode = !!on;
            renderAdvExtract();
        }
        // V6.22 : sur un modèle large, on ne cherche pas une colonne à l'œil. Le filtre réduit ce qui
        // est AFFICHÉ (jamais ce qui est sélectionné) : la configuration en cours n'est pas touchée.
        function advGFilter() {
            const extractSpec = state.advExtract;
            extractSpec.gFilter = extractSpec.gFilter || { q: '', onlySel: false, hideEmpty: false };
            return extractSpec.gFilter;
        }
        function advGSetView(f, v) {
            const g = advGFilter();
            g[f] = f === 'q' ? String(v || '') : !!v;
            advDrawGraph();
        }
        function advGClearFilter() {
            const g = advGFilter();
            g.q = '';
            g.onlySel = false;
            g.hideEmpty = false;
            renderAdvExtract();
        }
        const advGNorm = x =>
            String(x == null ? '' : x)
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        // Colonnes visibles d'une route, selon le filtre. Une colonne DÉJÀ CHOISIE reste toujours
        // visible : on ne doit jamais perdre de vue ce qu'on a déjà construit.
        function advGVisibleCols(rt) {
            const table = state.tables[rt.tableId] || { headers: [], name: '' };
            const g = advGFilter();
            const normalized = advGNorm(g.q).trim();
            const tableMatches = normalized && advGNorm(table.name).includes(normalized);
            return table.headers.filter(h => {
                const chosen = !!advGCol(rt, h);
                if (g.onlySel && !chosen) return false;
                if (!normalized) return true;
                return chosen || tableMatches || advGNorm(h).includes(normalized);
            });
        }
        function advGraphHtml() {
            const extractSpec = state.advExtract;
            return `<div class="mb-4 rounded-xl border ${extractSpec.graphMode ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-slate-50/60'} p-3">
                <label class="flex items-center gap-2 cursor-pointer text-[12px] font-bold text-slate-700">
                    <input type="checkbox" ${extractSpec.graphMode ? 'checked' : ''} onchange="advGToggleMode(this.checked)" class="w-4 h-4">
                    🗺️ Vue graphique — choisir les colonnes directement sur le schéma des liens
                    <span class="font-medium text-slate-400 normal-case">(option : l'écran classique ci-dessous reste disponible et reste synchronisé)</span>
                </label>
                ${
                    extractSpec.graphMode
                        ? `<p class="text-[11px] text-slate-500 mt-2 mb-2">Chaque case est une table <strong>atteinte par un chemin précis</strong>. Une table reliée plusieurs fois apparaît une fois par lien : cochez la colonne sur la bonne case, le chemin est renseigné tout seul. Les cases se déplacent à la souris.</p>
                <div id="advGWrap"><div class="gfx-bar flex items-center gap-2 flex-wrap mb-2 bg-white border border-slate-200 rounded-lg p-2">
                    <span class="text-[11px] font-bold text-slate-500">🔎 Filtrer</span>
                    <input type="text" id="adv-g-q" value="${escapeHTML(advGFilter().q)}" oninput="advGSetView('q', this.value)" placeholder="nom de colonne ou de table…" class="border border-slate-300 rounded px-2 py-1 text-xs w-56">
                    <label class="text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer" title="N'afficher que les colonnes déjà choisies"><input type="checkbox" ${advGFilter().onlySel ? 'checked' : ''} onchange="advGSetView('onlySel', this.checked)"> colonnes choisies seulement</label>
                    <label class="text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer" title="Masquer les tables qui n'ont plus aucune colonne visible (hors table de départ)"><input type="checkbox" ${advGFilter().hideEmpty ? 'checked' : ''} onchange="advGSetView('hideEmpty', this.checked)"> masquer les tables sans résultat</label>
                    ${advGFilter().q || advGFilter().onlySel || advGFilter().hideEmpty ? `<button onclick="advGClearFilter()" class="text-[11px] font-bold text-slate-500 border border-slate-300 rounded px-2 py-1 hover:bg-slate-50">✕ tout afficher</button>` : ''}
                    <label class="text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer" title="Sur un modèle chargé, les étiquettes des liens se chevauchent. Décochée, l'étiquette n'apparaît qu'au survol d'une case — et le chemin reste rappelé sur la case elle-même."><input type="checkbox" ${advGFilter().edgeLabels ? 'checked' : ''} onchange="advGSetView('edgeLabels', this.checked)"> étiquettes des liens</label>
                    ${gfxFullBtn('advGWrap', 'advDrawGraph')}
                    <span class="text-[10px] text-slate-400">le filtre ne change que l'affichage — les colonnes déjà choisies restent visibles et sélectionnées</span>
                </div>
                <div id="advGCanvas"></div>
                        </div>`
                        : ''
                }
            </div>`;
        }
        // Redessine le graphe SANS re-rendre tout l'écran (saisie d'alias / de valeur de filtre fluide).
        function advGDrawSoft() {
            if (el('advGCanvas')) advDrawGraph();
            if (el('adv-sql-wrap') && !el('adv-sql-wrap').classList.contains('hidden')) advShowSql();
        }
        function advDrawGraph() {
            const advGCanvasElement = el('advGCanvas');
            if (!advGCanvasElement) return;
            advGInjectCss();
            const extractSpec = state.advExtract;
            let routes = advRoutes();
            if (!routes.length) {
                advGCanvasElement.innerHTML =
                    '<div class="advg-empty">Choisissez une table de départ pour afficher le schéma.</div>';
                return;
            }
            // V6.22 : filtrage d'affichage. On conserve toujours la table de départ, et toute case
            // gardée conserve ses PARENTS pour que le chemin reste lisible de bout en bout.
            const gF = advGFilter();
            const filtering = !!(gF.q || gF.onlySel || gF.hideEmpty);
            const totalRoutes = routes.length;
            if (filtering && gF.hideEmpty) {
                const keep = new Set();
                routes.forEach(r => {
                    if (!r.parentKey || advGVisibleCols(r).length) keep.add(r.key);
                });
                const byKey = {};
                routes.forEach(r => (byKey[r.key] = r));
                [...keep].forEach(k => {
                    let cur = byKey[k];
                    while (cur && cur.parentKey) {
                        keep.add(cur.parentKey);
                        cur = byKey[cur.parentKey];
                    }
                });
                routes = routes.filter(r => keep.has(r.key));
            }
            const byDepth = {};
            routes.forEach(r => (byDepth[r.depth] = byDepth[r.depth] || []).push(r));
            const maxD = Math.max(...routes.map(r => r.depth));
            const NW = 236,
                colGap = 96,
                W = Math.max(560, advGCanvasElement.clientWidth || 900);
            // hauteur d'une case : en-tête + via + colonnes + pied
            const hOf = r => {
                const vis = advGVisibleCols(r);
                const nsel = vis.filter(h => advGCol(r, h)).length;
                const nflt = vis.reduce((a2, h) => a2 + advGFilters(r, h).length, 0);
                return 30 + (r.via ? 16 : 0) + Math.min(190, 6 + Math.max(1, vis.length) * 19 + nsel * 21 + nflt * 23) + 30;
            };
            const pos = {};
            let H = 320;
            Object.keys(byDepth).forEach(d => {
                const arr = byDepth[d];
                const x = 12 + Number(d) * (NW + colGap);
                let y = 34;
                arr.forEach(r => {
                    pos[r.key] = { x, y, h: hOf(r) };
                    y += hOf(r) + 20;
                });
                H = Math.max(H, y + 10);
            });
            routes.forEach(r => {
                const p = state.advExtract._gpos && state.advExtract._gpos[r.key];
                if (p && pos[r.key]) {
                    pos[r.key].x = p.x;
                    pos[r.key].y = p.y;
                }
            });
            H = Math.max(H, ...routes.map(r => pos[r.key].y + pos[r.key].h + 16));
            const CW = Math.max(W, 24 + (maxD + 1) * (NW + colGap));
            if (advGCanvasElement.closest && advGCanvasElement.closest('.gfx-full'))
                H = Math.max(H, gfxAvailH(advGCanvasElement));
            advGCanvasElement.style.height = H + 'px';
            let paths = '',
                labels = '';
            routes.forEach(r => {
                if (!r.parentKey || !pos[r.parentKey]) return;
                const a = pos[r.parentKey],
                    b = pos[r.key];
                const x1 = a.x + NW,
                    y1 = a.y + 16,
                    x2 = b.x,
                    y2 = b.y + 16,
                    mx = (x1 + x2) / 2;
                paths += `<path d="M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="#94a3b8" stroke-width="2" marker-end="url(#advGA)" opacity=".85"/>`;
                labels += `<div class="advg-elbl${gF.edgeLabels ? '' : ' advg-elbl-hid'}" data-for="${r.key}" style="left:${mx}px;top:${(y1 + y2) / 2}px">🔗 ${escapeHTML(advRelLabel(r.rel))}</div>`;
            });
            let hh = `<svg class="advg-edges" viewBox="0 0 ${CW} ${H}" preserveAspectRatio="none"><defs><marker id="advGA" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8"/></marker></defs>${paths}</svg>`;
            routes.forEach(r => {
                const table = state.tables[r.tableId] || { headers: [], name: '?' };
                const p = pos[r.key];
                const isBase = !r.parentKey;
                const sel = (extractSpec.columns || []).filter(
                    x => !x.kind && x.tableId === r.tableId && (x.via || '') === (r.via || '')
                );
                const vis = advGVisibleCols(r);
                const hidden = table.headers.length - vis.length;
                let rows = '';
                vis.forEach(h => {
                    const cc = advGCol(r, h);
                    const on = !!cc;
                    rows += `<div class="advg-row${on ? ' on' : ''}" onclick="advGToggleCol('${r.key}', ${JSON.stringify(h).replace(/"/g, '&quot;')})">
                        <input type="checkbox" ${on ? 'checked' : ''} onclick="event.stopPropagation();advGToggleCol('${r.key}', ${JSON.stringify(h).replace(/"/g, '&quot;')})">
                        <span class="advg-cn" title="${escapeHTML(h)}">${escapeHTML(h)}</span>
                        <button class="advg-btn" title="Filtrer sur cette colonne" onclick="event.stopPropagation();advGAddFilter('${r.key}', ${JSON.stringify(h).replace(/"/g, '&quot;')})">⛃</button></div>`;
                    if (on)
                        rows += `<div class="advg-mini">
                        <input type="text" value="${escapeHTML(cc.alias || '')}" title="Nom de la colonne en sortie" style="flex:1"
                               onchange="advGSetField('${r.key}', ${JSON.stringify(h).replace(/"/g, '&quot;')}, 'alias', this.value)">
                        <select title="Transformation" onchange="advGSetField('${r.key}', ${JSON.stringify(h).replace(/"/g, '&quot;')}, 'transform', this.value)">${Object.entries(
                            ADV_TRANSFORMS
                        )
                            .map(
                                ([v, l]) =>
                                    `<option value="${v}" ${v === (cc.transform || 'none') ? 'selected' : ''}>${escapeHTML(l)}</option>`
                            )
                            .join('')}</select></div>`;
                    advGFilters(r, h).forEach(f => {
                        rows += `<div class="advg-flt">
                            <select onchange="advGSetFilter('${f.id}','op',this.value)" style="flex:0 0 auto">${Object.entries(
                                ADV_OPS
                            )
                                .map(
                                    ([v, l]) => `<option value="${v}" ${v === f.op ? 'selected' : ''}>${escapeHTML(l)}</option>`
                                )
                                .join('')}</select>
                            ${f.op === 'empty' || f.op === 'notempty' ? '' : `<input type="text" value="${escapeHTML(f.val || '')}" placeholder="valeur" style="flex:1" onchange="advGSetFilter('${f.id}','val',this.value)">`}
                            <button class="advg-btn" title="Retirer ce filtre" onclick="advGDelFilter('${f.id}')">✕</button></div>`;
                    });
                });
                hh += `<div class="advg-node${isBase ? ' advg-base' : ''}" data-rk="${r.key}" style="left:${p.x}px;top:${p.y}px">
                    <div class="advg-nh"><span>${isBase ? '⭐' : '🔗'}</span><span class="advg-nm" title="${escapeHTML(table.name)}">${escapeHTML(table.name)}</span>${sel.length ? `<span class="advg-cnt">${sel.length}</span>` : ''}</div>
                    ${r.via ? `<div class="advg-via" title="${escapeHTML(advViaLabel(r.via))}">via ${escapeHTML(advViaLabel(r.via))}</div>` : ''}
                    <div class="advg-cols">${rows || '<div class="advg-row"><span class="advg-cn" style="color:#94a3b8">aucune colonne ne correspond au filtre</span></div>'}${hidden > 0 ? `<div class="advg-row" style="color:#94a3b8;font-style:italic">+ ${hidden} colonne(s) masquée(s) par le filtre</div>` : ''}</div>
                    <div class="advg-foot">
                        <button class="advg-btn" onclick="advGAllCols('${r.key}', true)">tout</button>
                        <button class="advg-btn" onclick="advGAllCols('${r.key}', false)">rien</button>
                        ${
                            isBase
                                ? '<span style="font-size:9.5px;color:#6366f1;font-weight:700;align-self:center">table de départ</span>'
                                : `<button class="advg-btn" title="Compter les lignes liées par ce chemin (1 valeur par ligne de départ)" onclick="advGAddCount('${r.key}')">Σ compter</button>
                                    <button class="advg-btn" title="Repartir de cette table" onclick="advGSetBase('${r.key}')">⭐ départ</button>`
                        }
                    </div></div>`;
            });
            if (filtering) {
                const nCols = routes.reduce((a2, r) => a2 + advGVisibleCols(r).length, 0);
                hh += `<div class="advg-elbl" style="left:50%;top:14px;background:#fffbeb;border-color:#fcd34d;color:#92400e;font-weight:700">🔎 ${routes.length}/${totalRoutes} table(s) · ${nCols} colonne(s) affichée(s)</div>`;
            }
            advGCanvasElement.innerHTML = hh + labels;
            // déplacement des cases à la souris / au doigt (par l'en-tête, pour ne pas gêner les cases à cocher)
            // V6.26 : l'étiquette d'un lien n'apparaît qu'au survol de la case d'arrivée, sauf si
            // l'utilisateur a demandé à toutes les voir. Le chemin reste de toute façon écrit sur la case.
            advGCanvasElement.querySelectorAll('.advg-node[data-rk]').forEach(nd => {
                const element = advGCanvasElement.querySelector(`.advg-elbl[data-for="${CSS.escape(nd.dataset.rk)}"]`);
                if (element && element.classList.contains('advg-elbl-hid')) {
                    nd.addEventListener('mouseenter', () => element.classList.add('advg-elbl-on'));
                    nd.addEventListener('mouseleave', () => element.classList.remove('advg-elbl-on'));
                }
            });
            advGCanvasElement.querySelectorAll('.advg-node').forEach(nd => {
                const head = nd.querySelector('.advg-nh');
                if (!head) return;
                head.addEventListener('pointerdown', ev => {
                    ev.preventDefault();
                    const rk = nd.dataset.rk;
                    const x0 = ev.clientX,
                        y0 = ev.clientY,
                        number = parseFloat(nd.style.left),
                        t0 = parseFloat(nd.style.top);
                    const mv = e2 => {
                        nd.style.left = number + e2.clientX - x0 + 'px';
                        nd.style.top = Math.max(0, t0 + e2.clientY - y0) + 'px';
                    };
                    const up = () => {
                        document.removeEventListener('pointermove', mv);
                        document.removeEventListener('pointerup', up);
                        const g = (state.advExtract._gpos = state.advExtract._gpos || {});
                        g[rk] = { x: parseFloat(nd.style.left), y: parseFloat(nd.style.top) };
                        advDrawGraph();
                    };
                    document.addEventListener('pointermove', mv);
                    document.addEventListener('pointerup', up);
                });
            });
        }
        function advColColChanged() {
            const id = el('adv-col-tbl').value;
            const table = state.tables[id];
            const advColColElement = el('adv-col-col');
            if (table && advColColElement)
                advColColElement.innerHTML = table.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            // V6.14 : si cette table est reliée plusieurs fois, on propose PAR COLONNE le lien à emprunter.
            advViaSync('adv-col-via', id);
        }
        // -- Synthèse d'une table liée (ex-modes Transposer / Compter de l'ancien écran) --
        const ADV_LINK_MODES = {
            count: 'Compter les lignes liées',
            countd: 'Compter les valeurs uniques',
            values: 'Transposer en texte (valeurs concaténées)',
            indexed: 'Transposer en colonnes (n premières)'
        };
        function advLinkTblChanged() {
            const id = el('adv-link-tbl').value;
            const table = state.tables[id];
            const advLinkColElement = el('adv-link-col');
            if (table && advLinkColElement)
                advLinkColElement.innerHTML = table.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            advViaSync('adv-link-via', id);
            // Changer de table liée change le chemin : un critère préparé pour l'ancien chemin
            // n'a plus de sens, et le garder en silence donnerait un comptage faux.
            const permises = new Set(advTablesDUneSynthese(state.advExtract.baseId, id, advViaVal('adv-link-via')));
            const avant = advCriteresDeSyntheseEnAttente.length;
            advCriteresDeSyntheseEnAttente = advCriteresDeSyntheseEnAttente.filter(c => permises.has(c.tableId));
            if (advRemplissageDuFormulaire) return;
            // On ne redessine QUE si des critères ont été retirés : redessiner à chaque changement
            // de table reconstruirait le formulaire et effacerait la table qu'on vient d'y choisir.
            if (advCriteresDeSyntheseEnAttente.length === avant) return;
            showError('Les critères préparés ne portaient pas sur ce chemin : ils ont été retirés.');
            renderAdvExtract();
            // Le formulaire est neuf : on y remet la table choisie, sans relancer de redessin.
            advRemplissageDuFormulaire = true;
            try {
                const choix = el('adv-link-tbl');
                if (choix) {
                    choix.value = id;
                    advLinkTblChanged();
                }
            } finally {
                advRemplissageDuFormulaire = false;
            }
        }
        function advLinkModeChanged() {
            const element = el('adv-link-mode').value;
            el('adv-link-col-wrap').classList.toggle('hidden', element === 'count');
            el('adv-link-n-wrap').classList.toggle('hidden', element !== 'indexed');
        }
        // ---- Les critères d'une synthèse de table liée -------------------------------
        //
        // « Compter les sinistres OUVERTS d'un contrat » n'est pas « ne garder que les contrats
        // qui ont un sinistre ouvert ». Un filtre ordinaire fait le second et retire des lignes ;
        // un critère de synthèse fait le premier et n'en retire aucune : un contrat sans sinistre
        // ouvert sort avec 0.
        //
        // Même façon de faire que les critères d'agrégat : on les prépare, puis on crée la
        // synthèse avec eux.
        let advCriteresDeSyntheseEnAttente = [];

        /** Les tables proposées pour un critère : celles que la synthèse traverse. */
        function advTablesPourUnCritere() {
            const choisie = el('adv-link-tbl');
            if (!choisie) return [];
            return advTablesDUneSynthese(state.advExtract.baseId, choisie.value, advViaVal('adv-link-via'))
                .map(identifiant => state.tables[identifiant])
                .filter(Boolean);
        }
        /** Les colonnes proposées suivent la table choisie pour le critère. */
        function advCritereTableChangee() {
            const table = state.tables[(el('adv-linkc-tbl') || {}).value];
            const colonnes = el('adv-linkc-col');
            if (table && colonnes)
                colonnes.innerHTML = (table.headers || []).map(h => `<option>${escapeHTML(h)}</option>`).join('');
        }
        function advAjouterUnCritereDeSynthese() {
            const identifiantTable = (el('adv-linkc-tbl') || {}).value;
            const colonne = (el('adv-linkc-col') || {}).value;
            const operateur = (el('adv-linkc-op') || {}).value;
            if (!identifiantTable || !colonne) return;
            const sansValeur = operateur === 'empty' || operateur === 'notempty';
            const valeur = sansValeur ? '' : (el('adv-linkc-val').value || '').trim();
            if (!sansValeur && !valeur) return showError('Indiquez la valeur du critère.');
            advCriteresDeSyntheseEnAttente.push({ tableId: identifiantTable, col: colonne, op: operateur, val: valeur });
            renderAdvExtract();
        }
        function advRetirerUnCritereEnAttente(rang) {
            advCriteresDeSyntheseEnAttente.splice(rang, 1);
            renderAdvExtract();
        }
        /** Retirer un critère d'une synthèse DÉJÀ créée, sans avoir à la refaire. */
        function advRetirerUnCritereDeSynthese(identifiantColonne, rang) {
            const colonne = state.advExtract.columns.find(c => c.id === identifiantColonne);
            if (!colonne || !colonne.conds) return;
            colonne.conds.splice(rang, 1);
            renderAdvExtract();
        }
        /** Les chips des critères en attente, sous la ligne de création. */
        function advCriteresEnAttenteHtml() {
            if (!advCriteresDeSyntheseEnAttente.length) return '';
            return (
                '<div class="basis-full flex flex-wrap gap-1 mb-1">' +
                advCriteresDeSyntheseEnAttente
                    .map((critere, rang) => {
                        const nomTable = (state.tables[critere.tableId] || {}).name || '?';
                        const valeur = critere.op === 'empty' || critere.op === 'notempty' ? '' : ` "${critere.val}"`;
                        const texte = `${nomTable}.${critere.col} ${ADV_OPS[critere.op] || critere.op}${valeur}`;
                        return `<span class="text-[10px] bg-sky-100 border border-sky-200 text-sky-800 rounded-full px-2 py-0.5">critère : ${escapeHTML(texte)} <button onclick="advRetirerUnCritereEnAttente(${rang})" class="text-sky-500 hover:text-red-600 font-bold">✕</button></span>`;
                    })
                    .join('') +
                '</div>'
            );
        }
        /** La ligne de saisie d'un critère, dans le bloc de la synthèse. */
        function advLigneDeCritereHtml() {
            const tables = advTablesPourUnCritere();
            if (!tables.length) return '';
            const premiere = tables[0];
            return `${advCriteresEnAttenteHtml()}
                <div class="basis-full flex items-end gap-1.5 flex-wrap border-t border-sky-100 pt-2 mt-1">
                    <span class="text-[10px] font-bold text-sky-700" title="Le critère restreint ce qui est compté, pas les lignes du fichier : une ligne sans correspondance sort avec 0 au lieu de disparaître.">⛉ Ne compter que…</span>
                    <select id="adv-linkc-tbl" onchange="advCritereTableChangee()" class="border border-sky-300 p-1.5 rounded text-[11px] bg-white">${tables
                        .map(table => `<option value="${table.id}">${escapeHTML(table.name)}</option>`)
                        .join('')}</select>
                    <select id="adv-linkc-col" class="border border-sky-300 p-1.5 rounded text-[11px] bg-white">${(
                        premiere.headers || []
                    )
                        .map(h => `<option>${escapeHTML(h)}</option>`)
                        .join('')}</select>
                    <select id="adv-linkc-op" class="border border-sky-300 p-1.5 rounded text-[11px] bg-white">${Object.entries(
                        ADV_OPS
                    )
                        .map(([v, l]) => `<option value="${v}">${escapeHTML(l)}</option>`)
                        .join('')}</select>
                    <input type="text" id="adv-linkc-val" placeholder="valeur" class="border border-sky-300 p-1.5 rounded text-[11px] w-28">
                    <button onclick="advAjouterUnCritereDeSynthese()" class="text-[11px] bg-white border border-sky-300 text-sky-700 px-2 py-1 rounded font-bold">+ Critère</button>
                    <span class="text-[10px] text-slate-400">le critère ne retire aucune ligne du fichier — il change seulement ce qui est compté.</span>
                </div>`;
        }
        function advAddLinkColumn() {
            const element = el('adv-link-tbl').value,
                mode = el('adv-link-mode').value;
            const col = mode === 'count' ? '' : el('adv-link-col').value;
            if (!element) return;
            if (mode !== 'count' && !col) return showError('Choisissez la colonne à résumer.');
            if (element === state.advExtract.baseId) return showError('Choisissez une table LIÉE (pas la table de départ).');
            const tn = (state.tables[element] || {}).name || '';
            // Les critères préparés partent avec la synthèse, et le nom en sortie les rappelle :
            // « nb_SINISTRES » et « nb_SINISTRES_si_OUVERT » ne doivent pas se confondre.
            const criteres = advCriteresDeSyntheseEnAttente.slice();
            advCriteresDeSyntheseEnAttente = [];
            const suffixe = criteres.length ? '_si_' + criteres.map(c => c.val || c.op).join('_') : '';
            const def = ((mode === 'count' ? 'nb_' + tn : mode === 'countd' ? 'nbu_' + col : col) + suffixe).slice(0, 60);
            const aliasSaisi = (el('adv-link-alias').value || '').trim();
            const enModification = advLaColonneModifiee();
            advPoserLaColonne({
                id: 'ac_' + generateId(),
                kind: 'link',
                tableId: element,
                mode,
                col,
                n: parseInt(el('adv-link-n').value) || 3,
                via: advViaVal('adv-link-via'),
                conds: criteres,
                alias: aliasSaisi || def,
                transform: enModification ? enModification.transform : 'none',
                _aliasSaisi: !!aliasSaisi
            });
        }
        // -- Hiérarchie aplatie (ex-mode « Aplatir Hiérarchie ») --
        function advHierTblChanged() {
            advViaSync('adv-hier-via', el('adv-hier-tbl').value);
            const table = state.tables[el('adv-hier-tbl').value];
            ['adv-hier-id', 'adv-hier-parent'].forEach(x => {
                const element = el(x);
                if (table && element) element.innerHTML = table.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            });
            const advHierLabelElement = el('adv-hier-label');
            if (table && advHierLabelElement)
                advHierLabelElement.innerHTML =
                    '<option value="">— l\'identifiant —</option>' +
                    table.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            state.advExtract._hierAttrs = [];
            advRenderHierAttrs();
        }
        // Attributs multiples à extraire par niveau de hiérarchie (pile ordonnée).
        function advHierAddAttr() {
            const element = el('adv-hier-label') ? el('adv-hier-label').value : '';
            const extractSpec = state.advExtract;
            extractSpec._hierAttrs = extractSpec._hierAttrs || [];
            if (!extractSpec._hierAttrs.includes(element)) extractSpec._hierAttrs.push(element);
            advRenderHierAttrs();
        }
        function advHierDelAttr(i) {
            const extractSpec = state.advExtract;
            (extractSpec._hierAttrs || []).splice(i, 1);
            advRenderHierAttrs();
        }
        function advRenderHierAttrs() {
            const box = el('adv-hier-attrs');
            if (!box) return;
            const parts = state.advExtract._hierAttrs || [];
            box.innerHTML = parts.length
                ? parts
                      .map(
                          (c, i) =>
                              `<span class="text-[10px] bg-white border border-purple-300 rounded-full px-2 py-0.5 inline-flex items-center gap-1">${escapeHTML(c || 'identifiant')} <button onclick="advHierDelAttr(${i})" class="text-purple-400 hover:text-red-600 font-bold">✕</button></span>`
                      )
                      .join(' ')
                : '<span class="text-[10px] text-slate-400 italic">Par défaut : l\'attribut sélectionné (1). Ajoutez-en pour en extraire plusieurs par niveau.</span>';
        }
        function advHierLinkTblChanged() {
            const table = state.tables[el('adv-hier-ltbl').value];
            ['adv-hier-lchild', 'adv-hier-lparent', 'adv-hier-lfrom', 'adv-hier-lto'].forEach((x, i) => {
                const element = el(x);
                if (table && element)
                    element.innerHTML =
                        (i >= 2 ? '<option value="">— non utilisé —</option>' : '') +
                        table.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            });
        }
        function advHierTypeChanged() {
            const link = el('adv-hier-type').value === 'link';
            el('adv-hier-simple-wrap').classList.toggle('hidden', link);
            el('adv-hier-link-wrap').classList.toggle('hidden', !link);
        }
        function advAddHierColumn() {
            const element = el('adv-hier-tbl').value;
            if (!element) return;
            const type = el('adv-hier-type').value;
            const _hAttrs =
                state.advExtract._hierAttrs && state.advExtract._hierAttrs.length
                    ? state.advExtract._hierAttrs.slice()
                    : [el('adv-hier-label') ? el('adv-hier-label').value : ''];
            const conf = {
                type,
                idCol: el('adv-hier-id').value,
                labelCols: _hAttrs,
                parentCol: type === 'link' ? '' : el('adv-hier-parent').value,
                linkTable: type === 'link' ? el('adv-hier-ltbl').value : '',
                linkChildCol: type === 'link' ? el('adv-hier-lchild').value : '',
                linkParentCol: type === 'link' ? el('adv-hier-lparent').value : '',
                linkValidFromCol: type === 'link' ? el('adv-hier-lfrom').value : '',
                linkValidToCol: type === 'link' ? el('adv-hier-lto').value : '',
                refDate: type === 'link' ? el('adv-hier-refdate').value : '',
                maxDepth: parseInt(el('adv-hier-depth').value) || 5
            };
            if (!conf.idCol) return showError('Choisissez la colonne identifiant de la hiérarchie.');
            if (type !== 'link' && !conf.parentCol) return showError('Choisissez la colonne parent.');
            if (type === 'link' && (!conf.linkTable || !conf.linkChildCol || !conf.linkParentCol))
                return showError('Complétez la table de liaison (enfant + parent).');
            state.advExtract.columns.push({
                id: 'ac_' + generateId(),
                kind: 'hier',
                tableId: element,
                conf,
                via: advViaVal('adv-hier-via'),
                alias: (el('adv-hier-alias').value || '').trim() || (state.tables[element] || {}).name || 'hier',
                transform: 'none'
            });
            state.advExtract._hierAttrs = [];
            renderAdvExtract();
        }
        // -- Ajout de colonnes en masse : un tir groupé qui remplit la liste déclarative --
        function advBulkOpen() {
            const extractSpec = state.advExtract;
            const reach = advReachableTables();
            const body = reach
                .map(
                    t => `<details class="border border-slate-200 rounded-lg mb-2" ${t.id === extractSpec.baseId ? 'open' : ''}><summary class="px-3 py-2 cursor-pointer text-[12px] font-bold bg-slate-50">${t.id === extractSpec.baseId ? '⭐ ' : ''}${escapeHTML(t.name)} <span class="font-normal text-slate-400">(${t.headers.length} colonnes)</span></summary>
                <div class="p-2 grid grid-cols-2 gap-0.5">${t.headers
                    .map(h => {
                        const already = extractSpec.columns.some(c => !c.kind && c.tableId === t.id && c.col === h);
                        return `<label class="adv-bulk-row flex items-center gap-1.5 text-[11.5px] px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer ${already ? 'opacity-40' : ''}" data-lbl="${escapeHTML((t.name + ' ' + h).toLowerCase())}"><input type="checkbox" class="adv-bulk-cb" data-t="${t.id}" data-c="${escapeHTML(h)}" ${already ? 'checked disabled' : ''}><span class="truncate">${escapeHTML(h)}</span></label>`;
                    })
                    .join('')}</div></details>`
                )
                .join('');
            el('uxDrawer').classList.add('wide');
            openUxDrawer({
                sem: '',
                title: "➕ Plusieurs colonnes d'un coup",
                sub: "Cochez dans n'importe quelle table du modèle — chaque colonne cochée devient une ligne de la liste (renommable, transformable).",
                body: `
                <input type="search" oninput="advBulkFilter(this.value)" placeholder="🔍 filtrer les colonnes…" class="w-full border border-slate-300 rounded-lg p-2 text-sm mb-3">
                <div id="advBulkList">${body}</div>`,
                foot: `
                <button onclick="advBulkApply()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 text-xs font-bold">Ajouter les colonnes cochées</button>
                <button onclick="closeBackupCenter()" class="flex-1 bg-white border border-slate-300 rounded-lg py-2 text-xs font-bold text-slate-600">Annuler (Échap)</button>`
            });
        }
        function advBulkFilter(q) {
            const text = String(q).toLowerCase();
            document.querySelectorAll('#advBulkList .adv-bulk-row').forEach(r => {
                r.style.display = !text || (r.dataset.lbl || '').includes(text) ? '' : 'none';
            });
            if (text) document.querySelectorAll('#advBulkList details').forEach(d => (d.open = true));
        }
        function advBulkApply() {
            let count = 0;
            document.querySelectorAll('#advBulkList .adv-bulk-cb:checked:not(:disabled)').forEach(cb => {
                const t = cb.dataset.t,
                    col = cb.dataset.c;
                if (!state.advExtract.columns.some(c => !c.kind && c.tableId === t && c.col === col)) {
                    state.advExtract.columns.push({ id: 'ac_' + generateId(), tableId: t, col, alias: col, transform: 'none' });
                    count++;
                }
            });
            closeBackupCenter();
            renderAdvExtract();
            if (count) showSuccess(`${count} colonne(s) ajoutée(s) à l'extraction.`);
        }
        // -- Migration de l'ancienne configuration (colonnes cochées, modes, hiérarchies, filtres) --
        function advSyncBase() {
            const extractSpec = state.advExtract;
            const baseTableSelectElement = el('baseTableSelect');
            if (baseTableSelectElement && baseTableSelectElement.value && state.tables[baseTableSelectElement.value])
                extractSpec.baseId = baseTableSelectElement.value;
            else if (extractSpec.baseId && baseTableSelectElement && state.tables[extractSpec.baseId])
                baseTableSelectElement.value = extractSpec.baseId;
        }
        function advMigrateClassic(force) {
            const extractSpec = state.advExtract;
            if (!force && (extractSpec.migrated || extractSpec.columns.length || extractSpec.filters.length)) return;
            const baseTableSelectElement = el('baseTableSelect');
            const baseId = extractSpec.baseId || (baseTableSelectElement && baseTableSelectElement.value) || '';
            if (!baseId || !state.tables[baseId]) {
                extractSpec.migrated = true;
                return;
            }
            extractSpec.baseId = baseId;
            let moved = 0;
            const reach = new Set(getReachableTables(baseId));
            new Set([...Object.keys(state.selectedCols || {}), ...Object.keys(state.pivotMode || {})]).forEach(tId => {
                if (!reach.has(tId) || !state.tables[tId] || state.tables[tId].status !== 'ready') return;
                const mode = (state.pivotMode || {})[tId] || 'none';
                if (tId === baseId || mode === 'none') {
                    (state.selectedCols[tId] || []).forEach(col => {
                        if (!extractSpec.columns.some(c => !c.kind && c.tableId === tId && c.col === col)) {
                            extractSpec.columns.push({
                                id: 'ac_' + generateId(),
                                tableId: tId,
                                col,
                                alias: col,
                                transform: 'none'
                            });
                            moved++;
                        }
                    });
                } else if (mode === 'count' || mode === 'count_values' || mode === 'values' || mode === 'indexed') {
                    const col = (state.selectedCols[tId] || [])[0] || (state.tables[tId].headers || [])[0] || '';
                    const m2 =
                        mode === 'count'
                            ? 'count'
                            : mode === 'count_values'
                              ? 'countd'
                              : mode === 'values'
                                ? 'values'
                                : 'indexed';
                    extractSpec.columns.push({
                        id: 'ac_' + generateId(),
                        kind: 'link',
                        tableId: tId,
                        mode: m2,
                        col: m2 === 'count' ? '' : col,
                        n: 3,
                        alias: (m2 === 'count' ? 'nb_' : '') + (state.tables[tId].name || ''),
                        transform: 'none'
                    });
                    moved++;
                } else if (mode === 'hierarchy' && (state.hierarchyConfig || {})[tId]) {
                    extractSpec.columns.push({
                        id: 'ac_' + generateId(),
                        kind: 'hier',
                        tableId: tId,
                        conf: { ...state.hierarchyConfig[tId] },
                        alias: state.tables[tId].name || 'hier',
                        transform: 'none'
                    });
                    moved++;
                }
            });
            Object.keys(state.filters || {}).forEach(tId => {
                if (!state.tables[tId]) return;
                Object.keys(state.filters[tId] || {}).forEach(col => {
                    const f = state.filters[tId][col];
                    if (!f) return;
                    if (f.type === 'list' && f.values)
                        extractSpec.filters.push({
                            id: 'af_' + generateId(),
                            tableId: tId,
                            col,
                            op: 'in',
                            val: Array.from(f.values).join(';')
                        });
                    else if (f.type === 'text' && f.contains)
                        extractSpec.filters.push({
                            id: 'af_' + generateId(),
                            tableId: tId,
                            col,
                            op: 'contains',
                            val: f.contains
                        });
                    else if (f.type === 'number') {
                        if (f.min != null)
                            extractSpec.filters.push({
                                id: 'af_' + generateId(),
                                tableId: tId,
                                col,
                                op: '>=',
                                val: String(f.min)
                            });
                        if (f.max != null)
                            extractSpec.filters.push({
                                id: 'af_' + generateId(),
                                tableId: tId,
                                col,
                                op: '<=',
                                val: String(f.max)
                            });
                    } else if (f.type === 'date') {
                        if (f.from)
                            extractSpec.filters.push({ id: 'af_' + generateId(), tableId: tId, col, op: 'dfrom', val: f.from });
                        if (f.to)
                            extractSpec.filters.push({ id: 'af_' + generateId(), tableId: tId, col, op: 'dto', val: f.to });
                    }
                    moved++;
                });
            });
            extractSpec.migrated = true;
            if (moved)
                showSuccess(
                    `⤴ Ancienne configuration d'extraction reprise : ${moved} élément(s) converti(s) dans le nouvel écran.`
                );
        }
        function advSetJoinType(v) {
            state.advExtract.joinType = v;
        }
        function advSetLimit500(v) {
            state.advExtract.limit500 = v;
        }
        function advFltTblChanged() {
            const id = el('adv-flt-tbl').value;
            const table = state.tables[id];
            const advFltColElement = el('adv-flt-col');
            if (table && advFltColElement) {
                advFltColElement.innerHTML = table.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
                advFillFilterVals();
            }
            advViaSync('adv-flt-via', id);
        }
        function advAggTblChanged() {
            const id = el('adv-agg-tbl').value;
            const table = state.tables[id];
            const advAggColElement = el('adv-agg-col');
            if (table && advAggColElement)
                advAggColElement.innerHTML = table.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            advViaSync('adv-agg-via', id);
        }
