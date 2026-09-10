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
            const _v12gTool = v12xTool;
            v12xTool = function (name) {
                const wasGraph = v12State.xTool === 'graph';
                _v12gTool.apply(this, arguments);
                if (name === 'graph' && wasGraph && v12State.xTool !== 'graph' && state.advExtract && state.advExtract.graphMode && typeof advGToggleMode === 'function') advGToggleMode(false);
            };
        }
        // ---- 2. « l'un ou l'autre lien » pour les synthèses ----
        if (Array.isArray(V12_VIA_ANY_SELECTS) && !V12_VIA_ANY_SELECTS.includes('adv-link-via')) V12_VIA_ANY_SELECTS.push('adv-link-via');
        function v12LinkAnchors(baseId, c) {
            if (!c || c.kind !== 'link' || c.via !== V12_VIA_ANY) return null;
            const seen = new Set(); const out = [];
            advViaOptions(c.tableId).forEach(o => { const a = advLinkAnchor(baseId, c.tableId, o.key); if (!a) return; const k = advRouteKey(a.parentId, a.parentVia || '') + '¦' + a.childCol + '¦' + a.parentCol; if (seen.has(k)) return; seen.add(k); out.push(a); });
            return out.length > 1 ? out : null;
        }
        const _v12gBuild = buildAdvSql;
        buildAdvSql = function (spec) {
            v12State.linkExtra = [];
            try {
                (spec && spec.columns || []).forEach(c => { c._anchors = v12LinkAnchors(spec.baseId, c); if (c._anchors) c._anchors.forEach(a => v12State.linkExtra.push({ tableId: a.parentId, via: a.parentVia || '' })); });
                return _v12gBuild.apply(this, arguments);
            } finally { v12State.linkExtra = []; }
        };
        const _v12gPlan = advPlanJoins;
        advPlanJoins = function (baseId, needs) {
            const extra = Array.isArray(v12State.linkExtra) ? v12State.linkExtra : [];
            return _v12gPlan.call(this, baseId, [...(Array.isArray(needs) ? needs : []), ...extra]);
        };
        // ---- 2 + 3. développement SQL d'une synthèse ----
        function v12LinkSrcSql(map, c, anchors, valueExpr) {
            const S = sqlIdent(duckTableName(c.tableId));
            return anchors.map(a => {
                const key = `${advNk('s.' + sqlIdent(a.childCol))} = ${advNk(advAlias(map, { tableId: a.parentId, via: a.parentVia }) + '.' + sqlIdent(a.parentCol))}`;
                return `SELECT ${valueExpr} AS v, s.${sqlIdent('__rn')} AS rn FROM ${S} s WHERE ${key}`;
            }).join('\n      UNION ALL ');
        }
        const _v12gExpand = advExpandCol;
        advExpandCol = function (map, c, hierRef) {
            if (c && c.kind === 'link') {
                const anchors = (c._anchors && c._anchors.length > 1) ? c._anchors : (c._anchor ? [c._anchor] : []);
                const many = anchors.length > 1;
                if (anchors.length && (many || c.mode === 'indexed')) {
                    const al = c.alias || c.col || 'synthese';
                    const colRaw = c.col ? `TRIM(CAST(s.${sqlIdent(c.col)} AS VARCHAR))` : `'1'`;
                    if (c.mode === 'count') return [{ expr: `(SELECT COUNT(*) FROM (${v12LinkSrcSql(map, c, anchors, '1')}) u)`, alias: al }];
                    if (c.mode === 'countd') return [{ expr: `(SELECT COUNT(DISTINCT u.v) FROM (${v12LinkSrcSql(map, c, anchors, advNk('s.' + sqlIdent(c.col)))}) u)`, alias: al }];
                    if (c.mode === 'values') return [{ expr: `(SELECT STRING_AGG(DISTINCT NULLIF(u.v, ''), ' | ') FROM (${v12LinkSrcSql(map, c, anchors, colRaw)}) u)`, alias: al }];
                    const n = Math.max(1, Math.min(12, parseInt(c.n) || 3));
                    const lst = `(SELECT list(u.v ORDER BY u.rn) FROM (${v12LinkSrcSql(map, c, anchors, colRaw)}) u)`;
                    return Array.from({ length: n }, (_, k) => ({ expr: `list_extract(${lst}, ${k + 1})`, alias: al + '_' + (k + 1) }));
                }
            }
            return _v12gExpand.apply(this, arguments);
        };
        // ---- 3. erreurs contenant une page HTML ----
        function v12CleanErr(msg) {
            const s = String(msg == null ? '' : msg);
            if (!/<\s*(!doctype|html|head|body|title)\b/i.test(s)) return s;
            const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(s) || [])[1] || '';
            const text = s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            return 'Le moteur a reçu une page HTML au lieu d\'un résultat (réseau, proxy ou ressource indisponible). ' + (title ? '« ' + title + ' »' : '') + (text ? ' — ' + text.slice(0, 160) + (text.length > 160 ? '…' : '') : '');
        }
        if (typeof showError === 'function') { const _v12gErr = showError; showError = function (msg) { return _v12gErr.call(this, v12CleanErr(msg)); }; }
        ['advPreview', 'advQuality'].forEach(nm => { const o = window[nm]; if (typeof o !== 'function') return; window[nm] = async function () { const r = await o.apply(this, arguments); try { const box = el(nm === 'advPreview' ? 'adv-preview' : 'adv-quality'); const p = box && box.querySelector('p.text-red-600'); if (p && /<\s*(!doctype|html|body)\b/i.test(p.textContent)) p.textContent = (nm === 'advPreview' ? 'Aperçu impossible : ' : 'Bilan impossible : ') + v12CleanErr(p.textContent); } catch (e) {} return r; }; });
        Object.assign(V11_LEXIQUE, { 'transposer en colonnes': 'Pour chaque ligne de départ, les n premières valeurs de la table liée (dans l\'ordre du fichier) deviennent n colonnes nom_1 … nom_n. Avec « l\'un ou l\'autre lien », les lignes de toutes les routes sont réunies.' });
