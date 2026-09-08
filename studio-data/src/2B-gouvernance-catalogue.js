        // ======================= E10 (V2) : CATALOGUE DE DONNÉES RECHERCHABLE =======================
        // Refonte « consommateur de données » (maquette catalogue.html) : recherche d'abord,
        // facettes vivantes, cartes de confiance, fiche en panneau latéral. 100 % local,
        // métadonnées uniquement — les signaux (qualité, sensibilité, validation, types de
        // colonnes) sont branchés sur les VRAIES données de l'application.
        let catState = { q: '', f: { type: [], dom: [], sens: [], qb: [], val: [], own: [] }, sort: 'pertinence', view: 'list', layer: 'metier' };
        let catRes = [];
        // V8.6 — Deux couches de lecture. Par défaut le catalogue parle MÉTIER : objets, applications,
        // processus, termes, règles, rapports. Ce qui vient des sources (tables, colonnes, vues
        // dérivées, préparations, rapprochements) reste indexé — donc trouvable — mais n'apparaît
        // qu'à la demande : bascule « Tout », clic sur un type technique dans la facette, ou
        // indication « n donnée(s) technique(s) masquée(s) » sous le compteur de résultats.
        const CAT_TECH_TYPES = ['table', 'view', 'column', 'recipe', 'linkage'];
        function catLayerOk(e2) {
            if (catState.layer === 'tout') return true;
            if ((catState.f.type || []).some(v => CAT_TECH_TYPES.includes(v))) return true;
            return !CAT_TECH_TYPES.includes(e2.type);
        }
        // Ouvre la fiche d'un actif par sa clé (type + table/colonne/objet/terme), en basculant sur la
        // couche « Tout » si l'actif est technique et masqué — un lien vers une colonne ne peut pas
        // tomber dans le vide.
        function catOpenByKey(k) {
            const find = () => catRes.findIndex(r => r.type === k.type && (k.type === 'column' ? (r.tbl === k.tbl && r.col === k.col) : (k.type === 'bo' ? r.bo === k.bo : (k.type === 'attr' ? (r.bo === k.bo && r.elId === k.elId) : (k.type === 'term' ? (r.termId || r.id) === k.id : (k.tbl ? r.tbl === k.tbl : r.id === k.id))))));
            let i = find();
            // Un attribut métier n'est listé que sur recherche : on le cherche dans l'index complet.
            if (i < 0 && k.type === 'attr') { const ix = catBuildIndex(); const e2 = ix.find(r => r.type === 'attr' && r.bo === k.bo && r.elId === k.elId); if (e2) { catRes.push(e2); i = catRes.length - 1; } }
            if (i < 0 && CAT_TECH_TYPES.includes(k.type) && catState.layer !== 'tout') { catState.layer = 'tout'; renderGovernance(); i = find(); }
            if (i < 0) { CAT_FACETS.forEach(f => catState.f[f.key] = []); catState.q = ''; renderGovernance(); i = find(); }
            if (i >= 0) catOpenFiche(i);
        }
        function catKeyAttr(k) { return JSON.stringify(k).replace(/"/g, '&quot;'); }
        const CAT_TYPES = { table: ['t-table', '▦', 'Table'], view: ['t-view', '◧', 'Vue dérivée'], column: ['t-attr', '◈', 'Colonne'], attr: ['t-obj', '🔹', 'Attribut métier'], bo: ['t-obj', '🏛', 'Objet métier'], report: ['t-report', '📊', 'Rapport'], term: ['t-ref', '📖', 'Terme'], perimeter: ['t-ref', '🧩', 'Périmètre'], usecase: ['t-report', '🎯', 'Cas d\'usage'], asset: ['t-ref', '🖥', 'Appli / processus'], rule: ['t-ref', '📏', 'Règle qualité'], recipe: ['t-view', '🧹', 'Préparation'], linkage: ['t-ref', '🤝', 'Rapprochement'] };
        const CAT_SENS = { perso: ['s-perso', '🛡 Personnelle'], conf: ['s-conf', '🔒 Confidentiel'], non: ['s-non', 'Non sensible'] };
        const CAT_VAL = { ok: ['v-ok', '✓ Validé'], todo: ['v-todo', '◷ À valider'], draft: ['v-draft', '◌ Brouillon'] };
        function catNorm(s2) { return String(s2 == null ? '' : s2).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
        function catOwnColor(nm) { const P2 = ['#2563eb', '#059669', '#8b5cf6', '#f59e0b', '#0ea5e9', '#dc2626', '#0f172a']; let h = 0; for (const ch of String(nm)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return P2[h % P2.length]; }
        function catSensOf(level) { return level === 'personnel' ? 'perso' : (level === 'confidentiel' ? 'conf' : (level ? 'non' : null)); }
        function catValOf(st2) { return st2 === 'Validé' ? 'ok' : (st2 === 'Proposé' ? 'todo' : (st2 ? 'draft' : null)); }
        function catQOf(tableName) {
            // Score réel : dernier instantané des règles (E2), sinon complétude du dernier audit.
            const sn = (typeof qrSnapshots !== 'undefined' && qrSnapshots.length) ? qrSnapshots[qrSnapshots.length - 1] : null;
            if (sn && sn.tables && sn.tables[tableName] && sn.tables[tableName].score != null) return Math.round(sn.tables[tableName].score);
            const lq = lastAuditFor(tableName);
            return lq && lq.avgCompleteness != null ? Math.round(lq.avgCompleteness) : null;
        }
        /* ---- Un terme du glossaire est un SYNONYME métier d'une donnée ----
           Le modèle relie déjà un terme de trois façons : liens directs vers des colonnes
           (glossaire), rattachement à des objets métier, et référence posée SUR un attribut ou
           une colonne (champ « Terme »). Mais le catalogue n'en restituait aucune : la fiche du
           terme ne listait rien, la colonne affichait l'identifiant brut du terme, et chercher
           le terme ne trouvait pas la donnée — l'inverse d'un synonyme. Ces fonctions résolvent
           tout ce qu'un terme désigne, dans les deux sens. */
        function termById(id) { return (state.governance.glossary || []).find(t => t.id === id) || null; }
        function termNameOf(id) { const t = termById(id); return t ? t.term : ''; }
        function termTargets(t2) {
            const out = [];
            (t2.boIds || []).forEach(id => { const bo = (state.governance.businessObjects || []).find(b => b.id === id); if (bo) out.push({ kind: 'bo', boId: bo.id, label: bo.name, via: 'objet métier rattaché' }); });
            // V9.2 : attributs — liens du glossaire ET champ « Terme » de l'attribut, dédoublonnés
            const seenAttr = new Set();
            (t2.attrLinks || []).forEach(l => { const h = termAttrRow(l); if (h && !seenAttr.has(l.elId)) { seenAttr.add(l.elId); out.push({ kind: 'attr', boId: h.bo.id, elId: l.elId, stId: h.r.stId || '', label: h.bo.name + ' · ' + h.r.el.name, via: 'attribut désigné par ce terme' }); } });
            (state.governance.businessObjects || []).forEach(bo => (boAllAttrRows(bo) || []).forEach(r => {
                if (r.el.term === t2.id && !seenAttr.has(r.el.id)) { seenAttr.add(r.el.id); out.push({ kind: 'attr', boId: bo.id, elId: r.el.id, stId: r.stId || '', label: bo.name + ' · ' + r.el.name, via: 'attribut portant ce terme' }); }
            }));
            (t2.assetIds || []).forEach(id => { const a = assetById(id); if (a) out.push({ kind: 'asset', assetId: a.id, label: (ASSET_KINDS[a.kind] ? ASSET_KINDS[a.kind][0] + ' ' : '') + a.name, via: a.kind === 'process' ? 'processus rattaché' : 'application rattachée' }); });
            (t2.links || []).forEach(l => out.push({ kind: 'col', table: l.table, col: l.col, label: l.table + '.' + l.col, via: 'ancien lien fichier (héritage)' }));
            Object.entries(state.governance.dictionary || {}).forEach(([tn, d]) => Object.entries(d.columns || {}).forEach(([cn, cm]) => {
                if (cm.term === t2.id && !out.some(x => x.kind === 'col' && x.table === tn && x.col === cn))
                    out.push({ kind: 'col', table: tn, col: cn, label: tn + '.' + cn, via: 'colonne portant ce terme' });
            }));
            return out;
        }
        // Tous les termes qui désignent UNE colonne donnée (pour la recherche-synonyme et la fiche).
        function termsOfColumn(tn, cn) {
            const cm = (((state.governance.dictionary || {})[tn] || {}).columns || {})[cn] || {};
            const out = [];
            // V9.2 : une colonne hérite des termes des attributs qu'elle alimente (le terme est métier,
            // la colonne n'est qu'une provenance) ; les anciens liens fichier restent honorés.
            const attrs = attrsOfColumn(tn, cn);
            (state.governance.glossary || []).forEach(t2 => {
                if ((t2.links || []).some(l => l.table === tn && l.col === cn) || cm.term === t2.id
                    || attrs.some(a => a.r.el.term === t2.id || (t2.attrLinks || []).some(x => x.boId === a.boId && x.elId === a.elId))) out.push(t2);
            });
            return out;
        }
        function catBuildIndex() {
            const g = state.governance; const ix = [];
            const push = e2 => { e2.blob = catNorm([e2.title, e2.sub, e2.desc, e2.dom, e2.own, (e2.tags || []).join(' '), (e2.kw || []).join(' ')].join(' ')); ix.push(e2); };
            Object.values(state.tables).filter(t => t.status === 'ready').forEach(t => {
                const d = g.dictionary[t.name] || {};
                let worst = null; (t.headers || []).forEach(h => { const lv = pvLevelOf(t.name, h); if (lv === 'personnel') worst = 'personnel'; else if (lv === 'confidentiel' && worst !== 'personnel') worst = 'confidentiel'; else if (!worst) worst = lv; });
                push({ type: t.type === 'extraction' ? 'view' : 'table', id: t.id, title: t.name, sub: (t.headers || []).length + ' colonnes',
                    desc: d.description || '', dom: String(t.theme || '').trim() || '—', own: d.owner || '', q: catQOf(t.name),
                    sens: catSensOf(worst), val: catValOf(d.status), fresh: t.lastRefresh || null, rows: t.lastRows != null ? t.lastRows : null,
                    tags: [t.type === 'extraction' ? 'dérivée' : (t.type || 'table'), String(t.theme || '').trim()].filter(Boolean), tbl: t.name });
                const lq = lastAuditFor(t.name);
                (t.headers || []).forEach(h => {
                    const cm = ((d.columns || {})[h]) || {};
                    const def = cm.definition || (colDefFor(t.name, h) || {}).def || '';
                    const comp = lq && lq.columnsSummary && lq.columnsSummary[h] ? Math.round(lq.columnsSummary[h].comp) : null;
                    // Les termes qui désignent cette colonne : affichés en clair (plus d'identifiant
                    // brut) et versés dans le texte de recherche — chercher le terme trouve la colonne.
                    const syns = termsOfColumn(t.name, h).map(x => x.term);
                    push({ type: 'column', id: t.id + '\u0001' + h, title: h, sub: 'dans ' + t.name, desc: def, dom: String(t.theme || '').trim() || '—',
                        own: d.owner || '', q: comp, sens: catSensOf(pvLevelOf(t.name, h)), val: cm.term || def ? 'ok' : null,
                        fresh: t.lastRefresh || null, tags: [...syns.map(x => '📖 ' + x), cm.technicalType].filter(Boolean), tbl: t.name, col: h, syns });
                });
            });
            (g.businessObjects || []).forEach(bo => { const syns = (g.glossary || []).filter(t2 => (t2.boIds || []).includes(bo.id)).map(x => x.term);
                // V9.3.1 : les termes des ATTRIBUTS ne sont plus affichés comme ceux de l'objet — ils
                // restent cherchables (mots-clés) et sont listés à part dans la fiche, attribut par attribut.
                const attrTerms = Array.from(new Set((boAllAttrRows(bo) || []).flatMap(r => termsOfAttr(bo.id, r.el.id).map(x => x.term))));
                push({ type: 'bo', id: bo.id, title: bo.name, sub: (boAllAttrRows(bo) || []).length + ' attribut(s)',
                desc: bo.definition || '', dom: String(bo.domain || '').trim() || '—', own: bo.globalOwner || '', q: null, sens: null, val: catValOf(bo.status), fresh: null,
                tags: ['objet métier', ...syns.map(x => '📖 ' + x)], kw: attrTerms, bo: bo.id, syns });
                // V9.5 : chaque attribut métier est une fiche du catalogue (navigable depuis l'objet,
                // trouvable par recherche). Il n'encombre pas la liste par défaut : il n'apparaît
                // que sur recherche ou si le type « Attribut métier » est coché.
                (boAllAttrRows(bo) || []).forEach(r => { const ts = termsOfAttr(bo.id, r.el.id).map(x => x.term); const prov = boAttrProv(r);
                    push({ type: 'attr', id: bo.id + '\u0001' + r.el.id, title: r.el.name, sub: 'attribut de ' + bo.name + (r.facet ? ' ◆ ' + r.facet : ''), desc: r.el.definition || '', dom: '—', own: r.el.owner || bo.globalOwner || '', q: null,
                        sens: r.el.sensitivity ? (/personnel/i.test(r.el.sensitivity) ? 'perso' : (/sensible|confid/i.test(r.el.sensitivity) ? 'conf' : 'non')) : null, val: r.el.definition ? 'ok' : null, fresh: null,
                        tags: ['attribut métier', ...ts.map(x => '📖 ' + x)], kw: [prov, bo.name], bo: bo.id, elId: r.el.id, stId: r.stId || '', syns: ts }); }); });
            (g.glossary || []).forEach(t2 => { const tg = termTargets(t2);
                push({ type: 'term', id: t2.id, title: t2.term, sub: tg.length ? 'désigne ' + tg.length + ' donnée(s)' : 'aucune donnée désignée', desc: t2.definition || '', dom: '—', own: '', q: null, sens: null, val: t2.definition ? 'ok' : null, fresh: null,
                    tags: ['glossaire', ...tg.slice(0, 6).map(x => x.label)], termId: t2.id }); });
            (g.perimeters || []).forEach(p2 => push({ type: 'perimeter', id: p2.id, title: p2.name, sub: (p2.tables || []).length + ' table(s)', desc: p2.description || '', dom: '—', own: '', q: null, sens: null, val: null, fresh: null, tags: [] }));
            (g.assets || []).forEach(a => { const syns = termsOfAsset(a.id).map(x => x.term);
                push({ type: 'asset', id: a.id, title: a.name, sub: a.kind === 'process' ? 'Processus' + ((a.appIds || []).length ? ' · ' + (a.appIds || []).length + ' appli(s)' : '') : 'Application', desc: a.description || '', dom: assetDomainEff(a) || '—', own: a.owner || '', q: null, sens: null, val: null, fresh: null, tags: [a.kind === 'process' ? 'processus' : 'application', ...syns.map(x => '📖 ' + x)], syns }); });
            (g.qualityRules || []).forEach(r => push({ type: 'rule', id: r.id, title: r.name, sub: (r.bo ? '🏛 ' + ((qrBoById(r.bo) || {}).name || '?') : (r.table || '')) + (r.col ? ' · ' + r.col : ''), desc: (QR_TYPES[r.type] || r.type) + ' — criticité ' + (r.crit || '—'), dom: '—', own: '', q: r.last ? Math.round(100 * r.last.rate) : null, sens: null, val: null, fresh: r.last ? r.last.at : null, tags: ['règle'], tbl: r.table }));
            (state.recipes || []).forEach(r => push({ type: 'recipe', id: r.id, title: r.name, sub: (r.src || '?') + ' → ' + (r.out || '?'), desc: (r.steps || []).length + ' étape(s) de nettoyage, rejouées automatiquement à chaque mise à jour de la source.', dom: '—', own: '', q: null, sens: null, val: null, fresh: r.lastAt || null, tags: ['préparation'] }));
            (state.dashboards || []).forEach(d2 => push({ type: 'report', id: d2.id, title: d2.name, sub: (d2.tiles || []).length + ' tuile(s)', desc: 'Tableau de bord composable : ' + (d2.tiles || []).map(t2 => t2.title).filter(Boolean).slice(0, 4).join(', '), dom: '—', own: '', q: null, sens: null, val: null, fresh: null, tags: ['dashboard'] }));
            (state.linkages || []).forEach(L => push({ type: 'linkage', id: L.id, title: L.name, sub: (L.a || '?') + ' ↔ ' + (L.b || '?'), desc: 'Rapprochement inter-sources (golden record).', dom: '—', own: '', q: null, sens: null, val: null, fresh: null, tags: ['fuzzy'] }));
            return ix;
        }
        const CAT_FACETS = [
            { key: 'type', title: 'Type d\'actif', of: e2 => e2.type, opts: () => Object.keys(CAT_TYPES), lab: v => CAT_TYPES[v] ? CAT_TYPES[v][2] : v },
            { key: 'dom', title: 'Domaine métier', of: e2 => e2.dom, opts: ix => Array.from(new Set(ix.map(e2 => e2.dom))).sort(), lab: v => v },
            { key: 'sens', title: 'Sensibilité', of: e2 => e2.sens, opts: () => ['perso', 'conf', 'non'], lab: v => CAT_SENS[v][1] },
            { key: 'qb', title: 'Qualité', of: e2 => e2.q == null ? null : (e2.q >= 90 ? 'hi' : (e2.q >= 70 ? 'mid' : 'lo')), opts: () => ['hi', 'mid', 'lo'], lab: v => ({ hi: 'Bonne (≥ 90)', mid: 'Moyenne (70–90)', lo: 'À surveiller (< 70)' })[v] },
            { key: 'val', title: 'Validation', of: e2 => e2.val, opts: () => ['ok', 'todo', 'draft'], lab: v => CAT_VAL[v][1] },
            { key: 'own', title: 'Propriétaire', of: e2 => e2.own || null, opts: ix => Array.from(new Set(ix.map(e2 => e2.own).filter(Boolean))).sort(), lab: v => v },
        ];
        function catMatch(e2, skipKey, ignoreLayer) {
            if (!ignoreLayer && skipKey !== 'type' && !catLayerOk(e2)) return false;
            if (e2.type === 'attr' && skipKey !== 'type' && !catState.q && !(catState.f.type || []).includes('attr')) return false;
            if (catState.q) { const toks = catNorm(catState.q).split(/\s+/).filter(Boolean); if (!toks.every(tk => e2.blob.includes(tk))) return false; }
            for (const f of CAT_FACETS) { if (f.key === skipKey) continue; const sel2 = catState.f[f.key]; if (!sel2.length) continue; if (!sel2.includes(f.of(e2))) return false; }
            return true;
        }
        function catToggleFacet(key, v) { const a = catState.f[key]; const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); renderGovernance(); }
        function catClearFacets() { CAT_FACETS.forEach(f => catState.f[f.key] = []); catState.q = ''; renderGovernance(); }
        function catSet(f, v) {
            catState[f] = v; renderGovernance();
            if (f === 'q') { const inp = el('catQ'); if (inp) { inp.focus(); const n2 = inp.value.length; inp.setSelectionRange(n2, n2); } }
        }
        function catSort(list) {
            const l2 = list.slice();
            if (catState.sort === 'qualite') l2.sort((a, b) => (b.q == null ? -1 : b.q) - (a.q == null ? -1 : a.q));
            else if (catState.sort === 'alpha') l2.sort((a, b) => a.title.localeCompare(b.title));
            else if (catState.sort === 'fraicheur') l2.sort((a, b) => (b.fresh || 0) - (a.fresh || 0));
            else if (catState.q) { const toks = catNorm(catState.q).split(/\s+/).filter(Boolean);
                const sc = e2 => { const t2 = catNorm(e2.title); return toks.reduce((a2, tk) => a2 + (t2 === tk ? 30 : (t2.startsWith(tk) ? 20 : (t2.includes(tk) ? 10 : 1))), 0); };
                l2.sort((a2, b2) => sc(b2) - sc(a2) || a2.title.localeCompare(b2.title));
            } else l2.sort((a, b) => a.title.localeCompare(b.title));
            return l2;
        }
        function catCardHtml(e2, i) {
            const [tc, ti, tl] = CAT_TYPES[e2.type] || CAT_TYPES.table;
            return `<div class="cat-card" onclick="catOpenFiche(${i})" tabindex="0" role="button" aria-label="Fiche de ${escapeHTML(e2.title)}" onkeydown="if(event.key==='Enter')catOpenFiche(${i})">
                <div class="flex items-start gap-3">
                    <span class="cat-tico ${tc}" aria-hidden="true">${ti}</span>
                    <div class="min-w-0 flex-1">
                        <div class="text-[10px] font-black uppercase tracking-wide text-slate-400">${tl}${e2.dom !== '—' ? ' · ' + escapeHTML(e2.dom) : ''}</div>
                        <div class="font-bold text-[14px] text-slate-800 truncate">${escapeHTML(e2.title)}</div>
                        ${e2.sub ? `<div class="text-[11px] text-slate-400">${escapeHTML(e2.sub)}</div>` : ''}
                    </div>
                </div>
                ${e2.desc ? `<div class="text-[12px] text-slate-500 mt-2 leading-snug" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHTML(e2.desc)}</div>` : `<div class="text-[11px] text-slate-300 italic mt-2">Pas encore documenté — complétez le dictionnaire ou importez en masse.</div>`}
                <div class="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    ${e2.q != null ? `<span class="qual ${e2.q >= 90 ? 'q-ok' : (e2.q >= 70 ? 'q-warn' : 'q-bad')}">◆ ${e2.q}/100</span>` : ''}
                    ${e2.sens ? `<span class="cat-sens ${CAT_SENS[e2.sens][0]}">${CAT_SENS[e2.sens][1]}</span>` : ''}
                    ${e2.val ? `<span class="cat-val ${CAT_VAL[e2.val][0]}">${CAT_VAL[e2.val][1]}</span>` : ''}
                    ${e2.own ? `<span class="inline-flex items-center gap-1.5 text-[11px] text-slate-500"><span class="cat-oav" style="background:${catOwnColor(e2.own)}">${escapeHTML(e2.own.split(/\s+/).map(x => x[0] || '').join('').toUpperCase().slice(0, 2))}</span>${escapeHTML(e2.own)}</span>` : ''}
                    ${e2.fresh ? `<span class="text-[10.5px] text-slate-400">↻ ${new Date(e2.fresh).toLocaleDateString('fr-FR')}</span>` : ''}
                    ${(e2.tags || []).slice(0, 3).map(t2 => `<span class="cat-tag">#${escapeHTML(t2)}</span>`).join('')}
                </div>
            </div>`;
        }
        function renderGovCatalog() {
            // Le catalogue est un écran de CONSULTATION de bout en bout : recherche, facettes,
            // tri, bascule liste/grille. Rien n'y écrit, tout y reste donc actif.
            const ix = catBuildIndex();
            const g = state.governance;
            const tablesN = Object.values(state.tables).filter(t => t.status === 'ready');
            const docd = tablesN.filter(t => (g.dictionary[t.name] || {}).description).length;
            const wf = (typeof wfStats === 'function') ? wfStats() : { all: [], validated: [] };
            const list = catSort(ix.filter(e2 => catMatch(e2)));
            catRes = list;
            const techHidden = ix.filter(e2 => !catLayerOk(e2) && catMatch(e2, null, true)).length;
            const techAll = ix.filter(e2 => CAT_TECH_TYPES.includes(e2.type)).length;
            const layerBar = `<div class="seg-ux" role="group" aria-label="Couche du catalogue" title="Métier : objets, applications, processus, termes… · Tout : ajoute les tables, colonnes et vues issues des sources">
                <button data-ro="keep" id="catLayerMetier" class="${catState.layer !== 'tout' ? 'on' : ''}" onclick="catSet('layer','metier')">🏛 Métier</button>
                <button data-ro="keep" id="catLayerTout" class="${catState.layer === 'tout' ? 'on' : ''}" onclick="catSet('layer','tout')">▦ Tout</button></div>`;
            const techHint = catState.layer !== 'tout' && techHidden
                ? `<button data-ro="keep" id="catTechHint" onclick="catSet('layer','tout')" class="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-0.5 hover:bg-indigo-100" title="Afficher aussi les tables, colonnes et vues issues des sources">+ ${techHidden} donnée(s) technique(s) masquée(s)</button>` : '';
            const chip = [];
            CAT_FACETS.forEach(f => catState.f[f.key].forEach(v => chip.push(`<button data-ro="keep" onclick="catToggleFacet('${f.key}',${JSON.stringify(String(v)).replace(/"/g, '&quot;')})" class="achip-ux" aria-label="Retirer le filtre ${escapeHTML(f.lab(v))}">${escapeHTML(f.lab(v))} ✕</button>`)));
            const facetsHtml = CAT_FACETS.map(f => {
                const opts = f.opts(ix).filter(v => v != null && v !== '');
                const rows = opts.map(v => {
                    const on = catState.f[f.key].includes(v);
                    const c2 = ix.filter(e2 => catMatch(e2, f.key) && f.of(e2) === v).length;
                    if (!c2 && !on) return '';
                    return `<button data-ro="keep" onclick="catToggleFacet('${f.key}',${JSON.stringify(String(v)).replace(/"/g, '&quot;')})" class="cat-fitem ${on ? 'on' : ''}" role="checkbox" aria-checked="${on}">
                        <span class="w-3.5 h-3.5 rounded border ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'} text-[9px] flex items-center justify-center">${on ? '✓' : ''}</span>
                        <span class="truncate">${escapeHTML(f.lab(v))}</span><span class="cnt">${c2}</span></button>`;
                }).join('');
                return rows ? `<div class="border-b border-slate-100 pb-3 mb-3"><div class="text-[10px] uppercase font-black tracking-wide text-slate-400 mb-1.5">${f.title}</div>${rows}</div>` : '';
            }).join('');
            const exs = [tablesN[0] ? tablesN[0].name.replace(/\..*$/, '') : 'client', 'données personnelles', (g.businessObjects[0] || {}).name, Object.values(g.dictionary).map(d => d.owner).find(Boolean)].filter(Boolean).slice(0, 4);
            let html = `
            <div class="cat-hero">
                <h2 class="text-lg font-black flex items-center gap-2 m-0">🔎 Catalogue de données</h2>
                <p class="text-[12px] text-slate-300 mt-0.5 mb-3">Trouvez la donnée dont vous avez besoin, vérifiez si vous pouvez lui faire confiance, comprenez comment l'utiliser.</p>
                <div class="cat-bigsearch"><span class="text-lg text-slate-400" aria-hidden="true">🔍</span>
                    <input data-ro="keep" id="catQ" value="${escapeHTML(catState.q)}" oninput="catSet('q', this.value)" placeholder="Rechercher une table, une donnée, un domaine, un propriétaire…" aria-label="Rechercher dans le catalogue">
                    <span class="text-[11px] text-slate-400 border-l border-slate-200 pl-3 whitespace-nowrap hidden sm:inline">${catState.layer === 'tout' ? 'dans tout le catalogue' : 'vue métier'}</span></div>
                <div class="flex items-center gap-2 mt-2.5 flex-wrap"><span class="text-[11px] text-slate-400">Essayez :</span>
                    ${exs.map(x => `<button data-ro="keep" onclick="catSet('q', ${JSON.stringify(String(x)).replace(/"/g, '&quot;')})" class="cat-ex">${escapeHTML(x)}</button>`).join('')}</div>
                <div class="flex gap-7 mt-3.5 flex-wrap">
                    <span class="cat-hs"><b>${ix.length.toLocaleString('fr-FR')}</b>actifs catalogués</span>
                    <span class="cat-hs"><b>${themeList().length}</b>domaines métier</span>
                    <span class="cat-hs"><b>${tablesN.length ? Math.round(100 * docd / tablesN.length) : 0} %</b>sources documentées</span>
                    <span class="cat-hs"><b>${wf.all.length ? Math.round(100 * wf.validated.length / wf.all.length) : 0} %</b>validés par un responsable</span>
                </div>
            </div>
            <div class="flex gap-4 items-start">
                <div class="w-[220px] shrink-0 bg-white border border-slate-200 rounded-xl p-3 sticky top-4 max-h-[70vh] overflow-auto">
                    <div class="flex items-center justify-between mb-2"><span class="text-[11px] font-black uppercase tracking-wide text-slate-400">Affiner</span>
                    ${chip.length || catState.q ? `<button data-ro="keep" onclick="catClearFacets()" class="text-[11px] font-bold text-blue-600">Tout effacer</button>` : ''}</div>
                    ${facetsHtml || '<p class="text-[11px] text-slate-300 italic">Chargez des sources pour peupler le catalogue.</p>'}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-2.5 flex-wrap">
                        <span class="text-[13px] font-bold"><b class="text-emerald-600">${list.length}</b> résultat(s)</span>
                        ${techHint}
                        ${chip.join('')}
                        <span class="flex-grow"></span>
                        ${layerBar}
                        <label class="text-[11px] text-slate-400">Trier</label>
                        <select data-ro="keep" onchange="catSet('sort', this.value)" class="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white" aria-label="Tri des résultats">
                            ${[['pertinence', 'Pertinence'], ['qualite', 'Qualité'], ['fraicheur', 'Fraîcheur'], ['alpha', 'A → Z']].map(([v, l]) => `<option value="${v}" ${catState.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
                        <div class="seg-ux" role="group" aria-label="Affichage"><button data-ro="keep" class="${catState.view === 'list' ? 'on' : ''}" onclick="catSet('view','list')" aria-label="Vue liste">▤</button><button data-ro="keep" class="${catState.view === 'grid' ? 'on' : ''}" onclick="catSet('view','grid')" aria-label="Vue grille">▦</button></div>
                    </div>
                    ${list.length ? `<div class="grid gap-3 ${catState.view === 'grid' ? 'md:grid-cols-2' : 'grid-cols-1'}">${list.slice(0, 60).map((e2, i) => catCardHtml(e2, i)).join('')}</div>
                        ${list.length > 60 ? `<p class="text-[11px] text-slate-400 italic mt-2">… ${list.length - 60} autre(s) — précisez la recherche.</p>` : ''}`
                        : (techHidden && catState.layer !== 'tout'
                            ? emptyStateHtml('🏛', 'Rien côté métier — mais ' + techHidden + ' donnée(s) technique(s) correspondent', 'La vue métier ne montre que les objets, applications, processus, termes et règles. Les tables et colonnes issues des sources sont masquées par défaut.', 'Afficher les données techniques', "catSet('layer','tout')")
                            : emptyStateHtml('🔍', 'Aucun actif ne correspond', 'Essayez d\'élargir vos filtres ou une autre recherche — ou chargez des sources et documentez-les pour peupler le catalogue.', chip.length || catState.q ? 'Tout effacer' : '', 'catClearFacets()'))}
                </div>
            </div>`;
            return html;
        }
        // ---- Fiche détaillée en drawer : « À quoi ça sert », identité, structure (VRAIS types),
        // traçabilité amont/aval réelle, actifs liés, actions. ----
        const _catTypeCache = {};
        function catRealTypeLabel(duckType, colName, dictType) {
            if (dictType) return dictType;
            const n = colName.toUpperCase();
            if (/MAIL/.test(n)) return 'e-mail';
            if (/^TEL|PHONE|TELEPHONE/.test(n)) return 'téléphone';
            const t2 = String(duckType || '').toUpperCase();
            if (/INT|DOUBLE|DECIMAL|FLOAT|HUGE/.test(t2)) return 'nombre';
            if (/DATE|TIME/.test(t2)) return 'date';
            return 'texte';
        }
        function catTypeChip(lbl) {
            const m = { 'nombre': ['#0ea5e9', '123'], 'date': ['#8b5cf6', 'CAL'], 'e-mail': ['#ec4899', '@'], 'téléphone': ['#f59e0b', 'TEL'], 'clé': ['#0f172a', 'KEY'] };
            const [bg, tag] = m[lbl] || ['#64748b', 'ABC'];
            return `<span class="typ" style="background:${bg};width:26px" aria-hidden="true">${tag}</span>`;
        }
        async function catFillRealTypes(tId, tName) {
            const box = el('catSchemaBox'); if (!box) return;
            try {
                let types = _catTypeCache[tId];
                if (!types) {
                    const { conn } = await getDB();
                    const res = arrowResultToObjects(await conn.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ${sqlLiteral(duckTableName(tId))}`));
                    types = {}; res.forEach(r => types[r.column_name] = r.data_type);
                    _catTypeCache[tId] = types;
                }
                const d = state.governance.dictionary[tName] || {}; const dc2 = d.columns || {};
                const t = state.tables[tId];
                box.innerHTML = (t.headers || []).map(h => { const lbl = catRealTypeLabel(types[h], h, (dc2[h] || {}).technicalType);
                    return `<div class="flex items-center gap-2.5 py-1.5 border-b border-slate-50 text-[12px]">${catTypeChip(lbl)}<span class="font-semibold flex-1 truncate">${escapeHTML(h)}</span><span class="text-[11px] text-slate-400">${escapeHTML(lbl)}</span>${(dc2[h] || {}).definition ? '<span class="text-emerald-500 text-[10px]" title="Documentée">📖</span>' : ''}</div>`; }).join('');
            } catch (e) { box.innerHTML = '<p class="text-[11px] text-slate-300 italic">Types indisponibles (moteur non démarré).</p>'; }
        }
        function catLineageCounts(e2) {
            const g = state.governance; let up = 0, down = 0;
            if (e2.tbl && (e2.type === 'table' || e2.type === 'view')) {
                up = ((g.lineage[e2.tbl] || {}).from || []).length;
                Object.keys(g.lineage).forEach(k => { if (k !== e2.tbl && ((g.lineage[k] || {}).from || []).includes(e2.tbl)) down++; });
                (g.businessObjects || []).forEach(bo => { if ((bo.sources || []).some(s2 => s2.table === e2.tbl)) down++; });
                (g.assets || []).forEach(a2 => { if (a2.kind === 'process' && ((a2.tables || []).includes(e2.tbl) || (a2.columns || []).some(c2 => c2.table === e2.tbl))) down++; });
            } else if (e2.type === 'column' && typeof modelImpact === 'function') down = modelImpact(e2.tbl, e2.col).length;
            else if (e2.type === 'bo') { const bo = g.businessObjects.find(x => x.id === e2.bo); if (bo) { up = (bo.sources || []).length; down = new Set(boAllAttrRows(bo).flatMap(r => r.el.usedBy || [])).size; } }
            else if (e2.type === 'attr') { const bo = g.businessObjects.find(x => x.id === e2.bo); const r = bo && boAllAttrRows(bo).find(x => x.el.id === e2.elId); if (r) { up = r.stId ? (r.el.col ? 1 : 0) : (r.el.mappings || []).length; down = (r.el.usedBy || []).length; } }
            return [up, down];
        }
        // V9.5 — Historique de navigation de la fiche : chaque fiche ouverte depuis une autre
        // s'empile, « ← Retour » revient à la précédente, le fil d'Ariane montre d'où l'on vient.
        let _catHist = [];
        function catKeyOf(e2) {
            if (!e2) return null;
            return e2.type === 'bo' ? { type: 'bo', bo: e2.bo } : (e2.type === 'attr' ? { type: 'attr', bo: e2.bo, elId: e2.elId } : (e2.type === 'column' ? { type: 'column', tbl: e2.tbl, col: e2.col } : (e2.type === 'term' ? { type: 'term', id: e2.termId || e2.id } : { type: e2.type, id: e2.id, tbl: e2.tbl })));
        }
        function catSameKey(a, b2) { return JSON.stringify(a) === JSON.stringify(b2); }
        function catBack() {
            _catHist.pop(); // fiche courante
            const prev = _catHist.pop(); // celle d'avant (sera ré-empilée à l'ouverture)
            if (prev) catOpenByKey(prev); else closeUxDrawer();
        }
        function catOpenFiche(i) {
            const e2 = catRes[i]; if (!e2) return;
            const [tc, ti, tl] = CAT_TYPES[e2.type] || CAT_TYPES.table;
            const drawerOpen = el('uxDrawer') && el('uxDrawer').classList.contains('on');
            const key = catKeyOf(e2);
            if (!drawerOpen) _catHist = [];
            if (!_catHist.length || !catSameKey(_catHist[_catHist.length - 1], key)) _catHist.push(key);
            if (_catHist.length > 30) _catHist.shift();
            const prevKey = _catHist.length > 1 ? _catHist[_catHist.length - 2] : null;
            const prevLabel = (() => { if (!prevKey) return ''; const ix = catBuildIndex(); const pe = ix.find(r => catSameKey(catKeyOf(r), prevKey)); return pe ? pe.title : ''; })();
            const navBar = prevKey ? `<div class="cat-nav"><button data-ro="keep" onclick="catBack()" class="cat-back" title="Revenir à la fiche précédente">← ${escapeHTML(prevLabel || 'Retour')}</button><span class="crumb">${_catHist.slice(-3).map((k2, j, arr) => { const ix2 = catBuildIndex(); const pe = ix2.find(r => catSameKey(catKeyOf(r), k2)); const lb = pe ? pe.title : '…'; return j === arr.length - 1 ? `<b>${escapeHTML(lb)}</b>` : `<button data-ro="keep" onclick="catOpenByKey(${catKeyAttr(k2)})">${escapeHTML(lb)}</button> ›`; }).join(' ')}</span></div>` : '';
            const [up, down] = catLineageCounts(e2);
            const rel = catRes.filter(x => x !== e2 && x.dom === e2.dom && e2.dom !== '—' && (x.type === 'table' || x.type === 'view' || x.type === 'bo')).slice(0, 3);
            const relIdx = x => catRes.indexOf(x);
            const t = e2.tbl ? tableByName(e2.tbl) : null;
            const body = navBar + `
                <div id="catLineageBox" class="hidden mb-3 border-2 border-indigo-200 rounded-xl bg-white p-3"></div>
                <div class="dsect"><div class="flex items-center gap-1.5 flex-wrap">
                    ${e2.q != null ? `<span class="qual ${e2.q >= 90 ? 'q-ok' : (e2.q >= 70 ? 'q-warn' : 'q-bad')}">◆ Qualité ${e2.q}/100</span>` : ''}
                    ${e2.sens ? `<span class="cat-sens ${CAT_SENS[e2.sens][0]}">${CAT_SENS[e2.sens][1]}</span>` : ''}
                    ${e2.val ? `<span class="cat-val ${CAT_VAL[e2.val][0]}">${CAT_VAL[e2.val][1]}</span>` : ''}
                </div></div>
                <div class="dsect"><h4>À quoi ça sert</h4>
                    <div class="text-[12.5px] bg-slate-50 border border-slate-200 rounded-lg p-3">${e2.desc ? escapeHTML(e2.desc) : '<span class="text-slate-400 italic">Pas encore documenté — ajoutez une description dans le dictionnaire (ou via ⬆ Import en masse) pour aider les consommateurs de cette donnée.</span>'}</div></div>
                <div class="dsect"><h4>Fiche d'identité</h4><div class="kv-ux">
                    ${e2.rows != null ? `<div class="cell"><div class="k">Lignes</div><div class="v">${Number(e2.rows).toLocaleString('fr-FR')}</div></div>` : ''}
                    <div class="cell"><div class="k">Fraîcheur</div><div class="v" style="font-size:12.5px">↻ ${e2.fresh ? new Date(e2.fresh).toLocaleDateString('fr-FR') : '—'}</div></div>
                    <div class="cell"><div class="k">Propriétaire</div><div class="v" style="font-size:12.5px">${e2.own ? `<span class="cat-oav" style="background:${catOwnColor(e2.own)}">${escapeHTML(e2.own.split(/\s+/).map(x => x[0] || '').join('').toUpperCase().slice(0, 2))}</span> ${escapeHTML(e2.own)}` : '<span class="text-amber-600">⚠ à désigner</span>'}</div></div>
                    <div class="cell"><div class="k">Domaine</div><div class="v" style="font-size:12.5px">${escapeHTML(e2.dom)}</div></div>
                </div></div>
                ${t ? (e2.type === 'column'
                    ? `<div class="dsect"><h4>Détail de l'attribut</h4><div class="kv-ux">
                        <div class="cell"><div class="k">Type réel</div><div class="v" id="catColType" style="font-size:12.5px">…</div></div>
                        ${(() => { const cm = (((state.governance.dictionary[e2.tbl] || {}).columns) || {})[e2.col] || {};
                            return (cm.technicalType ? `<div class="cell"><div class="k">Type déclaré</div><div class="v" style="font-size:12.5px">${escapeHTML(cm.technicalType)}</div></div>` : '')
                                + (e2.q != null ? `<div class="cell"><div class="k">Complétude</div><div class="v" style="font-size:12.5px">${e2.q} %</div></div>` : '')
                                + (cm.term && termNameOf(cm.term) ? `<div class="cell"><div class="k">Terme de glossaire</div><div class="v" style="font-size:12.5px">📖 ${escapeHTML(termNameOf(cm.term))}</div></div>` : '')
                                + `<div class="cell"><div class="k">Colonne dans</div><div class="v" style="font-size:12.5px">${escapeHTML(e2.tbl)}</div></div>`; })()}
                        </div></div>`
                    : `<div class="dsect"><h4>Structure (${(t.headers || []).length} colonnes — types réels)</h4><div id="catSchemaBox"><p class="text-[11px] text-slate-300 italic">Lecture des types…</p></div></div>`) : ''}
                <div class="dsect"><h4>Traçabilité (lineage)</h4><div class="flex items-center gap-2 text-center text-[12px]">
                    <div class="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2"><div class="text-base font-black">${up}</div><div class="text-[10px] text-slate-400">source(s) amont</div></div>
                    <span class="text-slate-300" aria-hidden="true">→</span>
                    <div class="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg py-2"><div class="text-[12px] font-black text-emerald-700 truncate px-1">${escapeHTML(e2.title)}</div><div class="text-[10px] text-slate-400">cet actif</div></div>
                    <span class="text-slate-300" aria-hidden="true">→</span>
                    <div class="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2"><div class="text-base font-black">${down}</div><div class="text-[10px] text-slate-400">usage(s) aval</div></div>
                </div></div>
                ${e2.type === 'term' ? (() => { const t2 = termById(e2.termId || e2.id); if (!t2) return '';
                    const tg = termTargets(t2);
                    if (!tg.length) return `<div class="dsect"><h4>Ce terme désigne</h4><p class="text-[11.5px] text-slate-400 italic">Aucune donnée pour l'instant. Reliez-le : dans le <b>Glossaire</b> (colonnes), ou en choisissant ce terme dans la colonne « Terme » du <b>Dictionnaire</b>.</p></div>`;
                    return `<div class="dsect"><h4>Ce terme désigne (${tg.length})</h4>${tg.map(x => {
                        const key = x.kind === 'attr' ? { type: 'attr', bo: x.boId, elId: x.elId } : (x.kind === 'bo' ? { type: 'bo', bo: x.boId } : (x.kind === 'asset' ? { type: 'asset', id: x.assetId } : { type: 'column', tbl: x.table, col: x.col }));
                        const ic = x.kind === 'col' ? '▦' : (x.kind === 'attr' ? '🔹' : (x.kind === 'asset' ? '' : '🏛️'));
                        const inner = `<span class="min-w-0"><span class="block text-[12px] font-semibold truncate">${ic} ${escapeHTML(x.label)}</span><span class="block text-[10px] text-slate-400">${escapeHTML(x.via)}</span></span>`;
                        return `<button data-ro="keep" onclick="catOpenByKey(${catKeyAttr(key)})" class="w-full flex items-center gap-2.5 border border-slate-100 rounded-lg px-2.5 py-2 mb-1.5 text-left hover:bg-slate-50">${inner}<span class="ml-auto text-slate-300">›</span></button>`;
                    }).join('')}</div>`; })() : ''}
                ${e2.type === 'bo' ? (() => { const bo = (state.governance.businessObjects || []).find(x => x.id === e2.bo); if (!bo) return '';
                    // V9.3.2 : les termes se posent DEPUIS le catalogue — sur l'objet et sur chacun de ses attributs.
                    const rows = boAllAttrRows(bo) || [];
                    return `<div class="dsect"><h4>Termes de l'objet</h4>${termTagsHtml('bo', { boId: bo.id })}</div>
                        <div class="dsect"><h4>Attributs et leurs termes (${rows.length})</h4>${rows.length ? rows.map(r => `<div class="flex items-start gap-2 py-1.5 border-b border-slate-50"><button data-ro="keep" onclick="catOpenByKey(${catKeyAttr({ type: 'attr', bo: bo.id, elId: r.el.id })})" class="cat-link text-[12px] font-semibold whitespace-nowrap min-w-[140px] text-left pt-1" title="${escapeHTML((r.facet ? 'Composant ' + r.facet : 'Attribut propre') + ' — ouvrir la fiche de l\'attribut')}">${r.facet ? '◆' : '🔹'} ${escapeHTML(r.el.name)} <span class="chev">›</span></button>${termTagsHtml('attr', { boId: bo.id, elId: r.el.id })}</div>`).join('') : '<p class="text-[11.5px] text-slate-400 italic">Aucun attribut.</p>'}</div>`; })() : ''}
                ${e2.type === 'attr' ? (() => { const bo = (state.governance.businessObjects || []).find(x => x.id === e2.bo); if (!bo) return '';
                    const r = (boAllAttrRows(bo) || []).find(x => x.el.id === e2.elId); if (!r) return '';
                    const st = r.stId ? getBoFacets(bo).find(x => x.id === r.stId) : null;
                    const maps = st ? (r.el.col ? [{ table: st.table, col: r.el.col }] : []) : (r.el.mappings || []);
                    const cnt = boAttrMulti(bo, { fold: false, members: [{ el: r.el, stId: r.stId || '' }], idx: [], stId: r.stId || '' });
                    const link = (ic, lbl, sub, key) => `<button data-ro="keep" onclick="catOpenByKey(${catKeyAttr(key)})" class="w-full flex items-center gap-2.5 border border-slate-100 rounded-lg px-2.5 py-2 mb-1.5 text-left hover:bg-slate-50"><span class="min-w-0"><span class="block text-[12px] font-semibold truncate">${ic} ${escapeHTML(lbl)}</span><span class="block text-[10px] text-slate-400">${escapeHTML(sub)}</span></span><span class="ml-auto text-slate-300">›</span></button>`;
                    return `<div class="dsect"><h4>Appartient à</h4>${link('🏛️', bo.name, 'objet métier' + (st ? ' · composant « ' + st.name + ' »' : ''), { type: 'bo', bo: bo.id })}</div>
                        <div class="dsect"><h4>Détail de l'attribut</h4><div class="kv-ux">
                            <div class="cell"><div class="k">Nombre de valeurs</div><div class="v" style="font-size:12.5px">${escapeHTML(cnt.multi ? cnt.label : '1 valeur')}${cnt.from === 'déclaré' ? '' : ' <span class="text-slate-400">(observé)</span>'}</div></div>
                            <div class="cell"><div class="k">Sensibilité</div><div class="v" style="font-size:12.5px">${escapeHTML(r.el.sensitivity || '—')}</div></div>
                            ${r.el.examples ? `<div class="cell" style="grid-column:1/-1"><div class="k">Exemples</div><div class="v" style="font-size:12.5px">${escapeHTML(r.el.examples)}</div></div>` : ''}
                        </div></div>
                        <div class="dsect"><h4>Termes du glossaire</h4>${termTagsHtml('attr', { boId: bo.id, elId: r.el.id })}</div>
                        <div class="dsect"><h4>Alimenté par (provenance technique)</h4>${maps.length ? maps.map(m => link('▦', m.table + '.' + m.col, 'colonne technique', { type: 'column', tbl: m.table, col: m.col })).join('') : '<p class="text-[11.5px] text-amber-700 font-bold">⚠ non alimenté — aucune colonne technique rattachée</p>'}</div>
                        <div class="dsect"><h4>Utilisé par</h4>${(r.el.usedBy || []).length ? (r.el.usedBy || []).map(id => { const a = assetById(id); return a ? link(a.kind === 'process' ? '⚙️' : '🖥', a.name, a.kind === 'process' ? 'processus' : 'application', { type: 'asset', id: a.id }) : ''; }).join('') : '<p class="text-[11.5px] text-slate-400 italic">Aucun usage déclaré.</p>'}</div>`; })() : ''}
                ${e2.type === 'column' ? (() => { const hits = attrsOfColumn(e2.tbl, e2.col); return hits.length ? `<div class="dsect"><h4>Alimente l'attribut métier</h4>${hits.map(h => `<button data-ro="keep" onclick="catOpenByKey(${catKeyAttr({ type: 'attr', bo: h.boId, elId: h.r.el.id })})" class="w-full flex items-center gap-2.5 border border-slate-100 rounded-lg px-2.5 py-2 mb-1.5 text-left hover:bg-slate-50"><span class="min-w-0"><span class="block text-[12px] font-semibold truncate">🔹 ${escapeHTML(h.r.el.name)}</span><span class="block text-[10px] text-slate-400">attribut de ${escapeHTML(h.bo.name)}</span></span><span class="ml-auto text-slate-300">›</span></button>`).join('')}</div>` : ''; })() : ''}
                ${e2.type === 'asset' ? `<div class="dsect"><h4>Termes du glossaire (synonymes métier)</h4>${termTagsHtml('asset', { assetId: e2.id })}</div>` : ''}
                ${e2.type === 'column' ? (() => { const hits = attrsOfColumn(e2.tbl, e2.col);
                    return hits.length
                        ? `<div class="dsect"><h4>Termes de l'attribut que cette colonne alimente</h4>${hits.map(h => `<div class="flex items-start gap-2 py-1.5"><span class="text-[12px] font-semibold text-slate-700 whitespace-nowrap min-w-[140px] pt-1">🔹 ${escapeHTML(h.r.el.name)} <span class="font-normal text-slate-400">· ${escapeHTML(h.bo.name)}</span></span>${termTagsHtml('attr', { boId: h.boId, elId: h.r.el.id })}</div>`).join('')}<p class="text-[10.5px] text-slate-500 mt-1">Le terme est métier : il se pose sur l'attribut, la colonne en hérite.</p></div>`
                        : `<div class="dsect"><h4>Termes du glossaire</h4><p class="text-[11.5px] text-slate-400 italic">Cette colonne n'alimente aucun attribut d'objet métier. Rattachez-la à un attribut (fiche de l'objet ▸ Attributs & composition) pour lui donner un nom métier.</p>${(e2.syns || []).length ? termTagsHtml('col', {}, { readOnly: true, inherited: termsOfColumn(e2.tbl, e2.col) }) : ''}</div>`; })() : ''}
                ${e2.type === 'bo' ? (() => { const bo = (state.governance.businessObjects || []).find(x => x.id === e2.bo); if (!bo) return '';
                    const prod = (bo.producedBy || []).map(assetById).filter(Boolean), cons = (bo.consumedBy || []).map(assetById).filter(Boolean);
                    const srcs = (bo.sources || []).filter(s2 => s2 && s2.table);
                    const ROLE2 = { maitre: 'maître', contributeur: 'contributeur', destinataire: 'destinataire' };
                    const row = (ic, lbl, sub, key) => `<button data-ro="keep" onclick="catOpenByKey(${catKeyAttr(key)})" class="w-full flex items-center gap-2.5 border border-slate-100 rounded-lg px-2.5 py-2 mb-1.5 text-left hover:bg-slate-50"><span class="min-w-0"><span class="block text-[12px] font-semibold truncate">${ic} ${escapeHTML(lbl)}</span><span class="block text-[10px] text-slate-400">${escapeHTML(sub)}</span></span><span class="ml-auto text-slate-300">›</span></button>`;
                    if (!prod.length && !cons.length && !srcs.length) return `<div class="dsect"><h4>Chaîne de l'objet</h4><p class="text-[11.5px] text-slate-400 italic">Aucune source ni application rattachée. Complétez la fiche de l'objet (onglet <b>Sources</b>) pour voir sa chaîne amont → aval.</p></div>`;
                    return `<div class="dsect"><h4>Chaîne de l'objet</h4>
                        ${prod.map(a => row(a.kind === 'process' ? '⚙️' : '🖥', a.name, 'produit l\'objet', { type: 'asset', id: a.id })).join('')}
                        ${srcs.map(s2 => row('▦', s2.table, 'source ' + (ROLE2[s2.role] || s2.role || '') + ' (donnée technique)', { type: tableByName(s2.table) && tableByName(s2.table).type === 'extraction' ? 'view' : 'table', tbl: s2.table })).join('')}
                        ${cons.map(a => row(a.kind === 'process' ? '⚙️' : '🖥', a.name, 'consomme l\'objet', { type: 'asset', id: a.id })).join('')}
                    </div>`; })() : ''}
                ${rel.length ? `<div class="dsect"><h4>Actifs liés (${escapeHTML(e2.dom)})</h4>${rel.map(x => { const [xc, xi, xl] = CAT_TYPES[x.type];
                    return `<button data-ro="keep" onclick="catOpenFiche(${relIdx(x)})" class="w-full flex items-center gap-2.5 border border-slate-100 rounded-lg px-2.5 py-2 mb-1.5 text-left hover:bg-slate-50"><span class="cat-tico ${xc}" style="width:26px;height:26px;font-size:12px">${xi}</span><span class="min-w-0"><span class="block text-[12px] font-semibold truncate">${escapeHTML(x.title)}</span><span class="block text-[10px] text-slate-400">${xl}</span></span><span class="ml-auto text-slate-300">›</span></button>`; }).join('')}</div>` : ''}`;
            _catFicheCtx = e2;
            openUxDrawer({ sem: '', title: e2.title, sub: tl + (e2.dom !== '—' ? ' · Domaine ' + e2.dom : '') + (e2.own ? ' · propriétaire ' + e2.own : ''), body, foot: `
                <button data-ro="keep" onclick="catGoLineage()" class="flex-1 bg-white border border-slate-300 rounded-lg py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">🕸️ Voir le lineage</button>
                ${e2.type === 'attr' || e2.type === 'bo' ? `<button data-ro="keep" onclick="catEditInObject()" class="flex-1 bg-white border border-indigo-300 rounded-lg py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50">✎ Modifier dans l'objet</button>` : ''}
                <button data-ro="keep" onclick="catUseData()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-xs font-bold">➜ Utiliser cette donnée</button>` });
            el('uxDrawerTyp').className = 'cat-tico ' + tc; el('uxDrawerTyp').textContent = ti;
            if (t && e2.type === 'column') catFillColType(t.id, t.name, e2.col);
            else if (t) catFillRealTypes(t.id, t.name);
        }
        // Type réel physique d'UNE colonne (sans priorité au type déclaré : les deux sont affichés côte à côte).
        async function catFillColType(tId, tName, col) {
            const span = el('catColType'); if (!span) return;
            try {
                let types = _catTypeCache[tId];
                if (!types) {
                    const { conn } = await getDB();
                    const res = arrowResultToObjects(await conn.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ${sqlLiteral(duckTableName(tId))}`));
                    types = {}; res.forEach(r => types[r.column_name] = r.data_type); _catTypeCache[tId] = types;
                }
                const lbl = catRealTypeLabel(types[col], col, null);
                span.innerHTML = catTypeChip(lbl) + ' ' + escapeHTML(lbl);
            } catch (e) { span.textContent = '—'; }
        }
        let _catFicheCtx = null;
        let catAttrLineageGraph = null;
        function catGoLineage() {
            const e2 = _catFicheCtx; if (!e2) return;
            // Attribut/colonne : le lineage nœuds-liens s'affiche DANS la fiche, sans la quitter.
            if (e2.type === 'column' && e2.tbl && e2.col) { catShowAttrLineage(e2); return; }
            // V8.6 — Objet métier : même présentation que pour un attribut, dans la fiche.
            if (e2.type === 'bo' && (state.governance.businessObjects || []).some(x => x.id === e2.bo)) { catShowAttrLineage(e2); return; }
            if (e2.type === 'attr') { catShowAttrLineage(e2); return; }
            closeUxDrawer();
            openGovTab('lineage');
        }
        // Ouvrir l'attribut (ou l'objet) de la fiche courante dans la fiche d'édition de l'objet.
        function catEditInObject() {
            const e2 = _catFicheCtx; if (!e2 || !e2.bo) return;
            closeUxDrawer(); govState.selectedBoId = e2.bo; govState.boTab = 'structure'; govState.structView = 'fiche';
            if (e2.type === 'attr') govState.boSel = { kind: 'attr', stId: e2.stId || '', elId: e2.elId };
            openGovTab('objects');
        }
        // Ouvre l'onglet Lineage (vue par attribut) sur l'objet de la fiche courante.
        function catGoLineageTab() {
            const e2 = _catFicheCtx; if (!e2) return;
            closeUxDrawer();
            if (e2.type === 'bo') { govState.lineageView = 'attr'; govState.lineageAttrBo = e2.bo; }
            openGovTab('lineage');
        }
        function catShowAttrLineage(e2) {
            const box = el('catLineageBox'); if (!box) return;
            _lineageRedraw = () => catShowAttrLineage(e2);
            const isBo = e2.type === 'bo';
            const data = isBo ? buildBoLineageGraph((state.governance.businessObjects || []).find(x => x.id === e2.bo))
                : (e2.type === 'attr' ? (() => { const bo = (state.governance.businessObjects || []).find(x => x.id === e2.bo); const r = bo && boAllAttrRows(bo).find(x => x.el.id === e2.elId); const st = r && r.stId ? getBoFacets(bo).find(x => x.id === r.stId) : null; return r ? buildAttrLineageGraph(bo, st, r.el) : { nodes: [], edges: [] }; })() : buildColumnLineageGraph(e2.tbl, e2.col));
            el('uxDrawer').classList.add('wide'); // plus de place horizontale pour le graphe
            box.classList.remove('hidden');
            box.innerHTML = `<div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-indigo-800">🕸 Lineage de « ${escapeHTML(e2.title)} »${isBo ? ' <span class="font-normal text-slate-500">— ' + (lineageFilesOn() ? 'applications → fichiers → objet → usages' : 'applications → objet → usages') + '</span>' : ''}</span>
                <span class="flex items-center gap-2.5">
                    ${isBo || (e2.type === 'column' && buildColumnLineageGraph._viaAttr) ? lineageFilesToggleHtml() : ''}
                    ${isBo ? `<button data-ro="keep" onclick="catGoLineageTab()" class="text-[11px] bg-white border border-slate-300 px-2 py-0.5 rounded font-bold text-slate-600 hover:bg-slate-100" title="Ouvrir la vue par attribut de l'onglet Lineage">↗ Par attribut</button>` : ''}
                    <button data-ro="keep" onclick="catLineageFullscreen()" class="text-[11px] bg-white border border-slate-300 px-2 py-0.5 rounded font-bold text-slate-600 hover:bg-slate-100" title="Afficher en plein écran">⛶ Agrandir</button>
                    <button data-ro="keep" onclick="catCloseLineage()" class="text-slate-400 hover:text-red-500 font-bold text-xs">✕ fermer</button></span></div>
                <div id="catLineageWrap" class="h-[460px] border border-slate-100 rounded-lg bg-slate-50/50"></div>`;
            try {
                if (catAttrLineageGraph) { try { catAttrLineageGraph.destroy(); } catch (e3) {} catAttrLineageGraph = null; }
                catAttrLineageGraph = createSvgGraph(el('catLineageWrap'));
                catAttrLineageGraph.data(data); catAttrLineageGraph.render(); catAttrLineageGraph.fitView(20);
                catFitLineage(60); catFitLineage(340); // re-cadrage après la transition d'élargissement du drawer
            } catch (e3) { el('catLineageWrap').innerHTML = '<p class="text-[11px] text-slate-400 italic p-4">Lineage indisponible : ' + escapeHTML(e3.message || '') + '</p>'; }
            box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        function catFitLineage(delay) { setTimeout(() => { const w = el('catLineageWrap'); if (!w || !catAttrLineageGraph) return; try { catAttrLineageGraph.changeSize(w.clientWidth, w.clientHeight); catAttrLineageGraph.fitView(20); } catch (e) {} }, delay || 0); }
        function catCloseLineage() { const box = el('catLineageBox'); if (box) box.classList.add('hidden'); el('uxDrawer').classList.remove('wide'); }
        function catLineageFullscreen() {
            const w = el('catLineageWrap'); if (!w) return;
            if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
            else { w.requestFullscreen().then(() => catFitLineage(200)).catch(er => showError('Plein écran refusé : ' + (er && er.message || ''))); }
        }
        document.addEventListener('fullscreenchange', () => { if (el('catLineageWrap') && catAttrLineageGraph) catFitLineage(160); });
        function catUseData() {
            const e2 = _catFicheCtx; closeUxDrawer(); if (!e2) return;
            let tblName = e2.tbl;
            if (e2.type === 'attr' && !tblName) { const bo = (state.governance.businessObjects || []).find(x => x.id === e2.bo); const r = bo && boAllAttrRows(bo).find(x => x.el.id === e2.elId); const st = r && r.stId ? getBoFacets(bo).find(x => x.id === r.stId) : null; tblName = st ? st.table : (r && (r.el.mappings || [])[0] ? r.el.mappings[0].table : null); }
            if (e2.type === 'bo' && !tblName) { const bo = (state.governance.businessObjects || []).find(x => x.id === e2.bo); const m = bo && boMasterTable(bo); tblName = m ? m.name : null; }
            const t = tblName ? tableByName(tblName) : null;
            switchTab(3);
            if (t) { const sel2 = el('baseTableSelect'); if (sel2) { sel2.value = t.id; try { handleBaseTableChange(); } catch (er) {} } }
        }

