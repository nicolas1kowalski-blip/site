        // ======================= V12.11.1 : EXTRAIRE — TROIS CORRECTIFS =======================
        // 1. Vue graphique : refermée par son bouton, elle réapparaissait à la manipulation suivante
        //    (l'interrupteur interne restait activé et chaque rendu la rouvrait). Fermer par le bouton
        //    désactive maintenant l'interrupteur, comme la case à cocher.
        // 2. Synthèse d'une table liée : le « via » propose « le lien renseigné, quel qu'il soit »,
        //    comme l'ajout de colonne (V12.5). Compter, compter les valeurs uniques, transposer en
        //    texte ou en colonnes se font alors sur les lignes de TOUTES les routes réunies.
        // 3. Transposer en colonnes : n sous-requêtes LIMIT/OFFSET remplacées par une seule liste
        //    ordonnée (list / list_extract) — même résultat, une seule lecture de la table liée, et
        //    12 colonnes ne coûtent pas plus que 3. Les erreurs qui contiennent une page HTML (réponse
        //    réseau inattendue) sont affichées en clair au lieu du code HTML brut.
        // ---- 1. vue graphique ----
        if (typeof v12xTool === 'function') {
            Studio.extend(
                'v12xTool',
                base =>
                    function (name) {
                        const wasGraph = v12State.xTool === 'graph';
                        base.apply(this, arguments);
                        if (
                            name === 'graph' &&
                            wasGraph &&
                            v12State.xTool !== 'graph' &&
                            state.advExtract &&
                            state.advExtract.graphMode &&
                            typeof advGToggleMode === 'function'
                        )
                            advGToggleMode(false);
                    }
            );
        }
        // ---- 2. « l'un ou l'autre lien » pour les synthèses ----
        if (Array.isArray(V12_VIA_ANY_SELECTS) && !V12_VIA_ANY_SELECTS.includes('adv-link-via'))
            V12_VIA_ANY_SELECTS.push('adv-link-via');
        function v12LinkAnchors(baseId, c) {
            if (!c || c.kind !== 'link' || c.via !== V12_VIA_ANY) return null;
            const seen = new Set();
            const out = [];
            advViaOptions(c.tableId).forEach(o => {
                const anchor = advLinkAnchor(baseId, c.tableId, o.key);
                if (!anchor) return;
                const k = advRouteKey(anchor.parentId, anchor.parentVia || '') + '¦' + anchor.childCol + '¦' + anchor.parentCol;
                if (seen.has(k)) return;
                seen.add(k);
                out.push(anchor);
            });
            return out.length > 1 ? out : null;
        }
        Studio.extend(
            'buildAdvSql',
            base =>
                function (spec) {
                    v12State.linkExtra = [];
                    try {
                        ((spec && spec.columns) || []).forEach(c => {
                            c._anchors = v12LinkAnchors(spec.baseId, c);
                            if (c._anchors)
                                c._anchors.forEach(a =>
                                    v12State.linkExtra.push({ tableId: a.parentId, via: a.parentVia || '' })
                                );
                        });
                        return base.apply(this, arguments);
                    } finally {
                        v12State.linkExtra = [];
                    }
                }
        );
        Studio.extend(
            'advPlanJoins',
            base =>
                function (baseId, needs) {
                    const extra = Array.isArray(v12State.linkExtra) ? v12State.linkExtra : [];
                    return base.call(this, baseId, [...(Array.isArray(needs) ? needs : []), ...extra]);
                }
        );
        // ---- 2 + 3. développement SQL d'une synthèse ----
        function v12LinkSrcSql(map, c, anchors, valueExpr) {
            const S = sqlIdent(duckTableName(c.tableId));
            return anchors
                .map(a => {
                    const key = `${advNk('s.' + sqlIdent(a.childCol))} = ${advNk(advAlias(map, { tableId: a.parentId, via: a.parentVia }) + '.' + sqlIdent(a.parentCol))}`;
                    return `SELECT ${valueExpr} AS v, s.${sqlIdent('__rn')} AS rn FROM ${S} s WHERE ${key}`;
                })
                .join('\n      UNION ALL ');
        }
        Studio.extend(
            'advExpandCol',
            base =>
                function (map, c, hierRef) {
                    if (c && c.kind === 'link') {
                        const anchors = c._anchors && c._anchors.length > 1 ? c._anchors : c._anchor ? [c._anchor] : [];
                        const many = anchors.length > 1;
                        if (anchors.length && (many || c.mode === 'indexed')) {
                            const al = c.alias || c.col || 'synthese';
                            const colRaw = c.col ? `TRIM(CAST(s.${sqlIdent(c.col)} AS VARCHAR))` : `'1'`;
                            if (c.mode === 'count')
                                return [
                                    { expr: `(SELECT COUNT(*) FROM (${v12LinkSrcSql(map, c, anchors, '1')}) u)`, alias: al }
                                ];
                            if (c.mode === 'countd')
                                return [
                                    {
                                        expr: `(SELECT COUNT(DISTINCT u.v) FROM (${v12LinkSrcSql(map, c, anchors, advNk('s.' + sqlIdent(c.col)))}) u)`,
                                        alias: al
                                    }
                                ];
                            if (c.mode === 'values')
                                return [
                                    {
                                        expr: `(SELECT STRING_AGG(DISTINCT NULLIF(u.v, ''), ' | ') FROM (${v12LinkSrcSql(map, c, anchors, colRaw)}) u)`,
                                        alias: al
                                    }
                                ];
                            const maximum = Math.max(1, Math.min(12, parseInt(c.n) || 3));
                            const lst = `(SELECT list(u.v ORDER BY u.rn) FROM (${v12LinkSrcSql(map, c, anchors, colRaw)}) u)`;
                            return Array.from({ length: maximum }, (_, k) => ({
                                expr: `list_extract(${lst}, ${k + 1})`,
                                alias: al + '_' + (k + 1)
                            }));
                        }
                    }
                    return base.apply(this, arguments);
                }
        );
        // ---- 3. erreurs contenant une page HTML ----
        function v12CleanErr(msg) {
            const s = String(msg == null ? '' : msg);
            if (!/<\s*(!doctype|html|head|body|title)\b/i.test(s)) return s;
            const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(s) || [])[1] || '';
            const text = s
                .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            return (
                "Le moteur a reçu une page HTML au lieu d'un résultat (réseau, proxy ou ressource indisponible). " +
                (title ? '« ' + title + ' »' : '') +
                (text ? ' — ' + text.slice(0, 160) + (text.length > 160 ? '…' : '') : '')
            );
        }
        Studio.extend(
            'showError',
            base =>
                function (msg) {
                    return base.call(this, v12CleanErr(msg));
                }
        );
        ['advPreview', 'advQuality'].forEach(nm =>
            Studio.extend(
                nm,
                o =>
                    async function () {
                        const result = await o.apply(this, arguments);
                        try {
                            const box = el(nm === 'advPreview' ? 'adv-preview' : 'adv-quality');
                            const element = box && box.querySelector('p.text-red-600');
                            if (element && /<\s*(!doctype|html|body)\b/i.test(element.textContent))
                                element.textContent =
                                    (nm === 'advPreview' ? 'Aperçu impossible : ' : 'Bilan impossible : ') +
                                    v12CleanErr(element.textContent);
                        } catch (e) {}
                        return result;
                    },
                { motif: 'erreurs contenant une page HTML rendues lisibles' }
            )
        );
        Object.assign(V11_LEXIQUE, {
            'transposer en colonnes':
                "Pour chaque ligne de départ, les n premières valeurs de la table liée (dans l'ordre du fichier) deviennent n colonnes nom_1 … nom_n. Avec « l'un ou l'autre lien », les lignes de toutes les routes sont réunies."
        });
        // ---- 4. « HTML FileReaders do not support writing » : sans débordement disque ----
        // Quand une requête d'Extraire dépasse la mémoire (transposition, synthèses sur une grosse table
        // liée), DuckDB tente d'écrire un fichier temporaire, ce que le navigateur interdit : « Invalid
        // Error: HTML FileReaders do not support writing ». Les analyses du noyau ont déjà un repli
        // (queryResilient / runNoSpill) ; les actions d'Extraire appelaient le moteur en direct. Ici, pendant
        // compter, prévisualiser, bilan, générer et jeu temporaire, chaque requête qui échoue ainsi est
        // relancée en mémoire pure avec une limite relevée ; si cela ne suffit toujours pas, le message
        // explique quoi faire (500 lignes, moins de colonnes transposées, filtrer).
        function v12IsSpill(e) {
            return typeof isSpillWriteError === 'function'
                ? isSpillWriteError(e)
                : /do not support writing|temp_directory|temporary/i.test(String((e && e.message) || e));
        }
        function v12IsOom(e) {
            return /out of memory|memory limit|cannot allocate|Failed to allocate/i.test(String((e && e.message) || e));
        }
        async function v12QueryNoSpill(conn, sql) {
            try {
                return await conn.query(sql);
            } catch (e) {
                if (!v12IsSpill(e) && !v12IsOom(e)) throw e;
                let memSet = false;
                for (const lim of ['4GB', '3GB', '2GB', '1GB']) {
                    try {
                        await conn.query("SET memory_limit='" + lim + "'");
                        memSet = true;
                        break;
                    } catch (e2) {}
                }
                try {
                    await conn.query("SET temp_directory=''");
                } catch (e2) {}
                try {
                    return await conn.query(sql);
                } catch (e3) {
                    const err = new Error(
                        "Résultat trop volumineux pour la mémoire du navigateur (le stockage temporaire n'est pas inscriptible ici). Cochez « 500 lignes » pour vérifier, ajoutez un filtre, réduisez le nombre de colonnes transposées ou générez en plusieurs fois. Détail : " +
                            ((e3 && e3.message) || e3)
                    );
                    err.cause = e3;
                    throw err;
                } finally {
                    if (window.__duckTempDir) {
                        try {
                            await conn.query("SET temp_directory='" + window.__duckTempDir + "'");
                        } catch (e4) {}
                    }
                    if (memSet) {
                        try {
                            if (window.__duckMemLimit) await conn.query("SET memory_limit='" + window.__duckMemLimit + "'");
                            else await conn.query('RESET memory_limit');
                        } catch (e4) {}
                    }
                }
            }
        }
        function v12ConnNoSpill(conn) {
            if (!conn || conn.__v12ns) return conn;
            const p = new Proxy(conn, {
                get(t, k) {
                    if (k === '__v12ns') return true;
                    if (k === 'query') return sql => v12QueryNoSpill(t, sql);
                    const v = t[k];
                    return typeof v === 'function' ? v.bind(t) : v;
                }
            });
            return p;
        }
        v12State.noSpill = 0;
        Studio.extend(
            'getDB',
            base =>
                async function () {
                    const result = await base.apply(this, arguments);
                    if (v12State.noSpill > 0 && result && result.conn)
                        return Object.assign({}, result, { conn: v12ConnNoSpill(result.conn) });
                    return result;
                }
        );
        ['advCount', 'advPreview', 'advQuality', 'advGenerate', 'advColumnsOf', 'v12TmpFromSql', 'v12TmpFromTable'].forEach(
            nm =>
                Studio.extend(
                    nm,
                    o =>
                        async function () {
                            v12State.noSpill++;
                            try {
                                return await o.apply(this, arguments);
                            } finally {
                                v12State.noSpill--;
                            }
                        },
                    { motif: 'requêtes relancées en mémoire pure en cas de débordement disque' }
                )
        );
