        // ---- Objets métier : propriétaire global, contributeurs, sous-éléments avec propriétaires
        //      et mappings vers les colonnes physiques de plusieurs sources ----
        // Détecte les attributs présents dans plusieurs sources (même nom de colonne) et résout leur
        // propriétaire : sous-élément d'objet métier > objet métier > table unique propriétaire.
        function computeMultiSourceAttributes() {
            const names = readyTableNames();
            const byCol = {};
            names.forEach(n => { const t = tableByName(n); (t ? t.headers : []).forEach(h => { (byCol[h] = byCol[h] || []).push(n); }); });
            return Object.entries(byCol).filter(([, tabs]) => tabs.length >= 2).map(([col, tabs]) => {
                const tableOwners = Array.from(new Set(tabs.map(tn => (state.governance.dictionary[tn] || {}).owner).filter(Boolean)));
                let elementOwner = null, objectOwner = null, objName = null, elmName = null;
                state.governance.businessObjects.forEach(bo => (bo.elements || []).forEach(elm => {
                    if ((elm.mappings || []).some(m => m.col === col && tabs.includes(m.table))) {
                        objName = bo.name; elmName = elm.name;
                        if (elm.owner) elementOwner = elm.owner;
                        if (bo.globalOwner) objectOwner = bo.globalOwner;
                    }
                }));
                const owner = elementOwner || objectOwner || (tableOwners.length === 1 ? tableOwners[0] : null);
                const ownerSource = elementOwner ? 'sous-élément' : (objectOwner ? 'objet métier' : (owner ? 'table' : null));
                return { col, tables: tabs, owner, ownerSource, conflictOwners: !elementOwner && !objectOwner && tableOwners.length > 1, objName, elmName };
            }).sort((a, b) => (a.owner ? 1 : 0) - (b.owner ? 1 : 0));
        }

        // ---- Objets métier : vue liste (gauche) / fiche détaillée (droite) ----
        function renderGovObjects() {
            if (govState.designer) return renderBoDesigner();
            const names = readyTableNames();
            const bos = state.governance.businessObjects;
            const multi = computeMultiSourceAttributes();

            // Barre de création depuis une source (l'initialisation : l'objet vit ensuite sa propre vie)
            let html = `<div class="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
                <div><label class="text-xs font-bold text-slate-500 block mb-1">Initialiser un objet métier depuis une source</label>
                <select id="boFromSourceSelect" class="border border-slate-300 p-2 rounded text-sm bg-white">${names.map(n => `<option>${escapeHTML(n)}</option>`).join('') || '<option value="">Aucune table chargée</option>'}</select></div>
                <button onclick="openBoWizard(el('boFromSourceSelect').value)" class="bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2" ${names.length ? '' : 'disabled'}><span>🏛️</span> Initialiser</button>
                <button onclick="openBoDesigner()" class="bg-white border border-emerald-300 text-emerald-700 text-sm font-bold px-4 py-2 rounded-lg">🧬 Concevoir depuis le modèle de données</button>
                <button onclick="addBusinessObject()" class="bg-white border border-emerald-300 text-emerald-700 text-sm font-bold px-4 py-2 rounded-lg">+ Objet vierge</button>
                <p class="text-xs text-slate-500 w-full md:w-auto md:flex-1">La source ne sert qu'à <strong>initialiser</strong> l'objet : les attributs sont ensuite renommables et d'autres sources peuvent être rattachées (👑 maître, ✍️ contributeur, 📥 destinataire).</p>
            </div>`;

            // Détection multi-sources : repliée par défaut pour ne pas encombrer
            if (multi.length) {
                const nbSansProprio = multi.filter(m => !m.owner).length;
                html += `<div class="mb-4">
                    <button onclick="govState.showMulti=!govState.showMulti; renderGovernance()" class="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-full text-left flex items-center gap-2">
                        <span>${govState.showMulti ? '▾' : '▸'}</span> Attributs présents dans plusieurs sources : ${multi.length} détecté(s)${nbSansProprio ? ` — dont <span class="text-red-600">${nbSansProprio} sans propriétaire</span>` : ''}
                    </button>`;
                if (govState.showMulti) {
                    const rows = multi.map(m => {
                        let status;
                        if (!m.owner) status = '<span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">⚠️ Sans propriétaire</span>';
                        else if (m.conflictOwners) status = `<span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">⚠️ Propriétaires divergents</span>`;
                        else status = `<span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">✅ ${escapeHTML(m.owner)} <span class="normal-case font-medium">(via ${m.ownerSource})</span></span>`;
                        const action = m.objName
                            ? `<span class="text-xs text-slate-500">🏛️ ${escapeHTML(m.objName)}${m.elmName ? ' › ' + escapeHTML(m.elmName) : ''}</span>`
                            : `<button onclick="createObjectFromAttribute('${escapeHTML(m.col.replace(/'/g, "\\'"))}')" class="text-xs bg-white border border-emerald-300 text-emerald-700 px-2 py-1 rounded font-medium hover:bg-emerald-50">Créer un objet métier</button>`;
                        return `<tr class="hover:bg-slate-50"><td class="p-2.5 font-bold text-sm text-slate-800">${escapeHTML(m.col)}</td><td class="p-2.5 text-xs text-slate-500">${m.tables.map(escapeHTML).join(' · ')}</td><td class="p-2.5">${status}</td><td class="p-2.5">${action}</td></tr>`;
                    }).join('');
                    html += `<div class="border border-t-0 border-amber-200 rounded-b-lg overflow-x-auto bg-white"><table class="w-full text-left"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2.5">Attribut</th><th class="p-2.5">Présent dans</th><th class="p-2.5">Propriétaire</th><th class="p-2.5">Objet métier</th></tr></thead><tbody class="divide-y divide-slate-100">${rows}</tbody></table></div>`;
                }
                html += '</div>';
            }

            if (!bos.length) return html + '<p class="text-sm text-slate-400 italic py-10 text-center">Aucun objet métier. Initialisez-en un depuis une source ci-dessus.</p>';
            if (!govState.selectedBoId || !bos.some(b => b.id === govState.selectedBoId)) govState.selectedBoId = bos[0].id;
            const selected = bos.find(b => b.id === govState.selectedBoId);

            // Liste des objets à gauche, fiche détaillée à droite
            const listHtml = bos.map(bo => {
                const sources = bo.sources || [];
                const masters = sources.filter(s => s.role === 'maitre');
                const hasCtxRules = ((bo.contextRules || {}).rules || []).length > 0;
                let badge = '';
                if (!bo.globalOwner) badge = '<span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600">sans propriétaire</span>';
                else if (sources.length && !masters.length && !hasCtxRules) badge = '<span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">sans maître</span>';
                else if (hasCtxRules) badge = '<span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">maîtrise contextuelle</span>';
                else badge = '<span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">ok</span>';
                const active = bo.id === govState.selectedBoId;
                return `<button data-ro="keep" onclick="govState.selectedBoId='${bo.id}'; renderGovernance()" class="2xl:w-full min-w-[210px] text-left p-3 rounded-lg border 2xl:mb-2 transition-colors ${active ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-white border-slate-200 hover:border-emerald-200'}">
                    <div class="flex items-center gap-1.5 mb-1"><span>🏛️</span><span class="font-bold text-sm text-slate-800 truncate">${escapeHTML(bo.name)}</span></div>
                    <div class="flex items-center gap-1.5 flex-wrap">${badge}<span class="text-[10px] text-slate-400">${sources.length} source(s) · ${(bo.elements || []).length} attribut(s)</span></div>
                </button>`;
            }).join('');

            // V8.7 : la liste des objets prend une largeur fixe et la fiche tout le reste — le
            // tableau des attributs a besoin de place, la liste n'en a pas besoin.
            // Sous 1536 px, la liste passe AU-DESSUS de la fiche (cartes en ligne) : la fiche
            // garde toute la largeur pour le tableau des attributs.
            html += `<div class="flex flex-col 2xl:flex-row gap-4">
                <div id="boListCol" class="flex flex-wrap gap-2 2xl:block 2xl:w-[230px] flex-shrink-0">${listHtml}</div>
                <div class="flex-1 min-w-0">${typeof govLockHtml === 'function' ? govLockHtml(govCanEditBo(selected), govCanProposeBo(selected), 'l\'objet « ' + selected.name + ' »', boDomainOf(selected), renderBoDetail(selected, names)) : renderBoDetail(selected, names)}</div>
            </div>`;
            return html;
        }

        // Tables « maîtresses » de l'objet (cœur) : les sources maîtres, sinon toutes les sources.
        function boCoreTableNames(bo) {
            const s = (bo.sources || []);
            const masters = s.filter(x => x.role === 'maitre').map(x => x.table);
            return new Set(masters.length ? masters : s.map(x => x.table));
        }
        // ---- Facettes fonctionnelles : un composant = une table technique FILTRÉE, avec un nom métier ----
        // Le modèle fonctionnel diffère souvent du technique : une seule table `adresse` (avec une colonne
        // TYPE) porte en réalité, côté métier, « Adresse principale » (1–1), « Adresses de livraison » (1–N),
        // « Adresses d'intervention » (1–N). Une facette = { table, nom métier, cardinalité, filtre, attributs }.
        // Migration : les anciens composants (table seule) deviennent une facette sans filtre, et leurs
        // attributs à plat sont déplacés dans la facette (une seule fois).
        function getBoFacets(bo) {
            bo.structure = Array.isArray(bo.structure) ? bo.structure : [];
            const coreNames = boCoreTableNames(bo);
            bo.structure.forEach(s => {
                if (!s.id) s.id = 'st_' + generateId();
                if (!s.name) s.name = s.table;
                if (!Array.isArray(s.scope)) s.scope = [];
                if (!Array.isArray(s.applies)) s.applies = []; // conditions d'applicabilité sur l'objet PRINCIPAL (ex : TYPE = ENTREPOT)
                if (!s.cardinality) s.cardinality = '1–N';
                if (!s.kind) s.kind = 'composition';
                if (!Array.isArray(s.elements)) {
                    // migration depuis les attributs à plat mappés sur cette table
                    const moved = [];
                    bo.elements = (bo.elements || []).filter(elm => {
                        const tbls = (elm.mappings || []).map(m => m.table);
                        if (tbls.some(t => coreNames.has(t))) return true; // reste au cœur
                        const m = (elm.mappings || []).find(mm => mm.table === s.table);
                        if (m) { moved.push({ id: elm.id || ('fe_' + generateId()), name: elm.name, owner: elm.owner || '', col: m.col }); return false; }
                        return true;
                    });
                    s.elements = moved;
                }
            });
            return bo.structure;
        }
        // Attributs du cœur = attributs à plat restants (non déplacés dans une facette).
        function boCoreElements(bo) { getBoFacets(bo); return bo.elements || []; }
        // Une ligne d'attribut (réutilisée par le cœur et par chaque bloc composant).
        // Usage par attribut : quelles applications / quels processus utilisent CET attribut,
        // et source spécifique si elle diffère de celle de l'objet (application « produite par »).
        function boElToggleUsedBy(boId, elId, assetId, on) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo || !assetId) return;
            const elm = (bo.elements || []).find(e => e.id === elId); if (!elm) return;
            elm.usedBy = elm.usedBy || [];
            if (on) { if (!elm.usedBy.includes(assetId)) elm.usedBy.push(assetId); } else elm.usedBy = elm.usedBy.filter(x => x !== assetId);
            persistAppState(); renderGovernance();
        }
        function boElSetField(boId, elId, f, v) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const elm = (bo.elements || []).find(e => e.id === elId); if (!elm) return;
            elm[f] = v; persistAppState(); renderGovernance();
        }
        // Badge compact dans la structure : état usage/source, clic -> onglet 🔌 Applis & usages.
        function boUsageBadgeHtml(bo, elm) {
            if (!(state.governance.assets || []).length) return '<span class="text-[10px] text-slate-200">—</span>';
            const n = (elm.usedBy || []).length;
            const diff = elm.sourceApp && elm.sourceApp !== ((bo.producedBy || [])[0] || '');
            return `<button data-ro="keep" onclick="setBoTab('usage')" class="text-[10px] font-bold rounded-full px-1.5 py-0.5 border ${n ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}" title="${n ? n + ' utilisateur(s) déclaré(s)' : 'Aucun usage déclaré'} — cliquer pour ouvrir Applis & usages">${n ? '🔌 ' + n : '😴'}</button>${diff ? `<button data-ro="keep" onclick="setBoTab('usage')" class="text-[10px] font-black text-amber-600 ml-0.5" title="Source différente de celle de l'objet — cliquer pour ouvrir Applis & usages">≠</button>` : ''}`;
        }
        // Tous les attributs (cœur + facettes) sous forme de lignes homogènes.
        function boAllAttrRows(bo) {
            const rows = [];
            (bo.elements || []).forEach(e2 => rows.push({ el: e2, facet: '', stId: null }));
            getBoFacets(bo).forEach(st => (st.elements || []).forEach(fe => rows.push({ el: fe, facet: st.name, stId: st.id })));
            return rows;
        }
        // 🔌 MATRICE attributs x applications/processus : usage par cases à cocher, source par ligne.
        // V3 UX : deux lectures — « Matrice » (peu d'applis) et « Par application » (une appli
        // sélectionnée, une seule colonne de coches sur TOUS les attributs — pratique quand il y a
        // beaucoup d'applications). Les usages déjà déclarés apparaissent en chips sur chaque attribut.
        function renderBoUsageByApp(bo, rows, assets) {
            if (!govState.usageApp || !assets.some(a => a.id === govState.usageApp)) govState.usageApp = assets[0].id;
            const cur = assetById(govState.usageApp);
            const tgl = r => (r.stId ? `boFacetElToggleUsedBy('${bo.id}','${r.stId}','${r.el.id}'` : `boElToggleUsedBy('${bo.id}','${r.el.id}'`) + `,'${cur.id}',this.checked)`;
            const nOn = rows.filter(r => (r.el.usedBy || []).includes(cur.id)).length;
            return `<div class="flex items-center gap-2 mb-3 flex-wrap text-xs">
                <span class="font-bold text-slate-600">Application / processus :</span>
                <select onchange="govState.usageApp=this.value; renderGovernance()" class="border border-slate-300 rounded-lg px-2 py-1.5 font-bold bg-white">${assets.map(a => `<option value="${a.id}" ${a.id === govState.usageApp ? 'selected' : ''}>${ASSET_KINDS[a.kind][0]} ${escapeHTML(a.name)}</option>`).join('')}</select>
                <span class="bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 font-bold">${nOn}/${rows.length} attribut(s) cochés</span>
                <button onclick="boUsageMatrixAll('${bo.id}','${cur.id}',true)" class="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded px-2.5 py-1 font-bold">✔ Tout cocher</button>
                <button onclick="boUsageMatrixAll('${bo.id}','${cur.id}',false)" class="bg-white border border-slate-300 text-slate-500 rounded px-2.5 py-1 font-bold">✕ Tout décocher</button>
            </div>
            <div class="border border-slate-200 rounded-lg overflow-y-auto max-h-[520px]"><table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 sticky top-0 z-10"><tr>
                    <th class="p-2 w-10 text-center">${ASSET_KINDS[cur.kind][0]}</th><th class="p-2">Attribut</th><th class="p-2">Autres usages déclarés</th></tr></thead>
                <tbody class="divide-y divide-slate-100">${rows.map(r => { const e2 = r.el; const used = e2.usedBy || [];
                    const others = used.filter(id => id !== cur.id).map(assetById).filter(Boolean);
                    return `<tr class="hover:bg-slate-50 ${used.length ? '' : 'bg-amber-50/30'}">
                        <td class="p-2 text-center"><input type="checkbox" ${used.includes(cur.id) ? 'checked' : ''} onchange="${tgl(r)}" aria-label="${escapeHTML(e2.name)} utilisé par ${escapeHTML(cur.name)}" class="w-4 h-4 rounded"></td>
                        <td class="p-2 font-bold text-slate-700">${escapeHTML(e2.name)}${r.facet ? ` <span class="text-[9px] text-emerald-600 font-bold">◆ ${escapeHTML(r.facet)}</span>` : ''}${used.length ? '' : ' <span title="Aucun usage déclaré">😴</span>'}</td>
                        <td class="p-2">${others.length ? others.map(a => `<span class="inline-block bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 mr-1 mb-0.5 text-[10px] font-bold">${ASSET_KINDS[a.kind][0]} ${escapeHTML(a.name)}</span>`).join('') : '<span class="text-slate-300">—</span>'}</td>
                    </tr>`; }).join('')}</tbody></table></div>
            <p class="text-[10px] text-slate-400 mt-2">Choisissez une application puis cochez d'un geste les attributs qu'elle utilise — bien plus rapide que la matrice quand les applications sont nombreuses.</p>`;
        }
        function renderBoUsageMatrix(bo) {
            const assets = state.governance.assets || [];
            if (!assets.length) return '<p class="text-sm text-slate-400 italic py-6 text-center">Déclarez d\'abord des applications et des processus dans <strong>Gouvernance ▸ Applis & processus</strong>.</p>';
            const rows = boAllAttrRows(bo);
            if (!rows.length) return '<p class="text-sm text-slate-400 italic py-6 text-center">Aucun attribut — définissez la structure de l\'objet d\'abord.</p>';
            if (govState.usageView === undefined) govState.usageView = assets.length > 6 ? 'byapp' : 'matrix';
            const viewBar = `<div class="inline-flex rounded-lg border border-slate-300 overflow-hidden text-[11px] font-bold mb-3" role="group" aria-label="Mode d'affichage des usages">
                <button onclick="govState.usageView='byapp'; renderGovernance()" class="px-3 py-1.5 ${govState.usageView === 'byapp' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}">🖥 Par application</button>
                <button onclick="govState.usageView='matrix'; renderGovernance()" class="px-3 py-1.5 ${govState.usageView === 'matrix' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}">▦ Matrice complète</button>
            </div>
            <button data-ro="keep" onclick="openBoLineage('${bo.id}')" class="ml-2 mb-3 inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100" title="Graphe amont → objet → aval, comme pour un attribut">🕸 Lineage de l'objet</button>`;
            if (govState.usageView === 'byapp') return viewBar + renderBoUsageByApp(bo, rows, assets) + `<div id="attrLineageBox" class="hidden mt-3 border-2 border-indigo-200 rounded-xl bg-white p-3"></div>`;
            const apps = assets.filter(a => a.kind === 'app');
            const globalSrc = (bo.producedBy || [])[0] || '';
            const globalA = assetById(globalSrc);
            const noUse = rows.filter(r => !(r.el.usedBy || []).length).length;
            const nDiff = rows.filter(r => r.el.sourceApp && r.el.sourceApp !== globalSrc).length;
            const tglAll = (aid, on) => `boUsageMatrixAll('${bo.id}','${aid}',${on})`;
            return viewBar + `<div class="flex items-center gap-2 mb-3 flex-wrap text-xs">
                <span class="font-bold text-slate-600">Source de l'objet :</span>
                ${globalA ? `<span class="bg-slate-100 border border-slate-300 rounded-full px-2.5 py-1 font-bold">${escapeHTML(assetLabel(globalA))}</span>` : '<span class="text-slate-400 italic">aucune (fiche ▸ Sources ▸ Produite par)</span>'}
                ${noUse ? `<span class="bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2.5 py-1 font-bold">😴 ${noUse} attribut(s) sans usage</span>` : '<span class="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-2.5 py-1 font-bold">✔ tous les attributs ont un usage</span>'}
                ${nDiff ? `<span class="bg-amber-50 border border-amber-300 text-amber-800 rounded-full px-2.5 py-1 font-bold">≠ ${nDiff} source(s) spécifique(s)</span>` : ''}
            </div>
            <div class="border border-slate-200 rounded-lg overflow-x-auto max-h-[520px] overflow-y-auto"><table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 sticky top-0 z-10"><tr>
                    <th class="p-2 min-w-[150px] bg-slate-50">Attribut</th>
                    <th class="p-2 min-w-[150px] bg-slate-50" title="Application d'où vient CET attribut, si différente de la source de l'objet">Source (application)</th>
                    ${assets.map(a => `<th class="p-1.5 text-center bg-slate-50 min-w-[70px]"><div class="font-black">${ASSET_KINDS[a.kind][0]}</div><div class="normal-case leading-tight">${escapeHTML(a.name)}</div><div class="mt-0.5"><button onclick="${tglAll(a.id, true)}" class="text-emerald-500 hover:text-emerald-700" title="Tout cocher">✔</button> <button onclick="${tglAll(a.id, false)}" class="text-slate-300 hover:text-red-500" title="Tout décocher">✕</button></div></th>`).join('')}
                    <th class="p-2 bg-slate-50" title="Lineage de cet attribut">🕸</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-100">${rows.map(r => {
                    const e2 = r.el; const used = e2.usedBy || [];
                    const diff = e2.sourceApp && e2.sourceApp !== globalSrc;
                    const setF = r.stId ? `boFacetElSetField('${bo.id}','${r.stId}','${e2.id}'` : `boElSetField('${bo.id}','${e2.id}'`;
                    const tgl = aid => (r.stId ? `boFacetElToggleUsedBy('${bo.id}','${r.stId}','${e2.id}'` : `boElToggleUsedBy('${bo.id}','${e2.id}'`) + `,'${aid}',this.checked)`;
                    
                    return `<tr class="hover:bg-slate-50 ${used.length ? '' : 'bg-amber-50/30'}">
                        <td class="p-2 font-bold text-slate-700 whitespace-nowrap">${escapeHTML(e2.name)}${r.facet ? `<br><span class="text-[9px] text-emerald-600 font-bold">◆ ${escapeHTML(r.facet)}</span>` : ''}${used.length ? '' : ' <span title="Aucun usage déclaré">😴</span>'}</td>
                        <td class="p-2"><select onchange="${setF},'sourceApp',this.value)" class="w-full border p-1 rounded text-[11px] ${diff ? 'border-amber-400 bg-amber-50 font-bold' : 'border-slate-200 bg-white'}"><option value="">${globalA ? '= objet (' + escapeHTML(globalA.name) + ')' : '(celle de l\'objet)'}</option>${apps.map(a => `<option value="${a.id}" ${e2.sourceApp === a.id ? 'selected' : ''}>${escapeHTML(a.name)}</option>`).join('')}</select>${diff ? '<span class="text-[9px] font-black text-amber-600">≠ objet</span>' : ''}</td>
                        ${assets.map(a => `<td class="p-1.5 text-center"><input type="checkbox" ${used.includes(a.id) ? 'checked' : ''} onchange="${tgl(a.id)}" class="w-4 h-4 rounded ${a.kind === 'app' ? 'text-slate-600' : 'text-orange-500'}" title="${escapeHTML(e2.name)} utilisé par ${escapeHTML(a.name)}"></td>`).join('')}
                        <td class="p-1.5 text-center"><button onclick="openAttrLineage('${bo.id}','${r.stId || ''}','${e2.id}')" class="text-indigo-500 hover:text-indigo-700 font-bold" title="Lineage de cet attribut">🕸</button></td>
                    </tr>`; }).join('')}</tbody></table></div>
            <p class="text-[10px] text-slate-400 mt-2">Cochez les applications 🖥 et processus ⚙️ qui <strong>utilisent</strong> chaque attribut · colonne « Source » = application d'origine de l'attribut si différente de celle de l'objet · 🕸 = lineage de bout en bout de l'attribut.</p>
            <div id="attrLineageBox" class="hidden mt-3 border-2 border-indigo-200 rounded-xl bg-white p-3"></div>`;
        }
        function boUsageMatrixAll(boId, assetId, on) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            boAllAttrRows(bo).forEach(r => { r.el.usedBy = r.el.usedBy || []; if (on) { if (!r.el.usedBy.includes(assetId)) r.el.usedBy.push(assetId); } else r.el.usedBy = r.el.usedBy.filter(x => x !== assetId); });
            persistAppState(); renderGovernance();
        }
        // 🕸 LINEAGE PAR ATTRIBUT : application source -> colonne(s) technique(s) -> attribut -> utilisateurs.
        let attrLineageGraph = null;
        function openAttrLineage(boId, stId, elId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const st = stId ? getBoFacets(bo).find(x => x.id === stId) : null;
            const e2 = st ? (st.elements || []).find(x => x.id === elId) : (bo.elements || []).find(x => x.id === elId);
            if (!e2) return;
            const box = el('attrLineageBox'); if (!box) return;
            box.classList.remove('hidden');
            _lineageRedraw = () => openAttrLineage(boId, stId, elId);
            box.innerHTML = `<div class="flex items-center justify-between gap-2 flex-wrap mb-2"><span class="text-xs font-bold text-indigo-800">🕸 Lineage de l'attribut « ${escapeHTML(e2.name)} »${st ? ' <span class="text-emerald-600">◆ ' + escapeHTML(st.name) + '</span>' : ''}</span><span class="flex items-center gap-3">${lineageFilesToggleHtml()}<button onclick="el('attrLineageBox').classList.add('hidden')" class="text-slate-400 hover:text-red-500 font-bold text-xs">✕ fermer</button></span></div><div id="attrLineageWrap" class="h-[300px] border border-slate-100 rounded-lg bg-slate-50/50"></div>`;
            const { nodes, edges } = buildAttrLineageGraph(bo, st, e2);
            if (attrLineageGraph) { try { attrLineageGraph.destroy(); } catch (e3) {} attrLineageGraph = null; }
            attrLineageGraph = createSvgGraph(el('attrLineageWrap'));
            attrLineageGraph.data({ nodes, edges });
            attrLineageGraph.render();
            attrLineageGraph.fitView(20);
            box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        // Données du graphe de lineage d'un attribut d'objet métier (source appli → colonnes → attribut → usages).
        function buildAttrLineageGraph(bo, st, e2) {
            const nodes = [], edges = [];
            const attrId = 'attr:' + e2.id;
            nodes.push({ id: attrId, type: 'studio-rich-node', title: '🔹 ' + e2.name, content: '🏛️ ' + bo.name + (st ? ' ◆ ' + st.name : ''), fill: '#dcfce7', stroke: '#16a34a' });
            const srcA = assetById(e2.sourceApp) || assetById((bo.producedBy || [])[0]);
            if (srcA) { nodes.push({ id: 'as:' + srcA.id, type: 'studio-rich-node', title: '🖥 ' + srcA.name, content: e2.sourceApp && e2.sourceApp !== ((bo.producedBy || [])[0] || '') ? '≠ source de l\'objet' : 'source de l\'objet', fill: '#e2e8f0', stroke: '#334155' }); }
            const maps = st ? (e2.col ? [{ table: st.table, col: e2.col }] : []) : (e2.mappings || []);
            if (!lineageFilesOn()) {
                // V9.1 — sans fichiers : application(s) → attribut → usages ; la colonne est rappelée sur l'application.
                const owners = new Map();
                maps.forEach(m => { const own = appOwnerOfSource(m.table) || srcA; if (own) { if (!owners.has(own.id)) owners.set(own.id, { a: own, via: [] }); owners.get(own.id).via.push(m.table + '.' + m.col); } });
                if (!owners.size && srcA) owners.set(srcA.id, { a: srcA, via: [] });
                owners.forEach(({ a, via }) => {
                    const id = 'as:' + a.id;
                    if (!nodes.some(n => n.id === id)) nodes.push({ id, type: 'studio-rich-node', title: '🖥 ' + a.name, content: via.length ? 'via ' + via.join(', ') : 'source de l\'objet', fill: '#e2e8f0', stroke: '#334155' });
                    else { const n = nodes.find(x => x.id === id); if (via.length) n.content = 'via ' + via.join(', '); }
                    edges.push({ id: 'ep' + a.id, source: id, target: attrId, label: 'produit', style: { stroke: '#334155', lineWidth: 2, endArrow: { path: '', fill: '#334155' } } });
                });
                if (!owners.size) { nodes.push({ id: 'nosrc', type: 'studio-rich-node', title: '❔ aucune application source', content: maps.length ? maps.map(m => m.table + '.' + m.col).join(', ') : 'attribut non alimenté', fill: '#fef9c3', stroke: '#ca8a04' }); edges.push({ id: 'ens', source: 'nosrc', target: attrId, label: '', style: { stroke: '#eab308', lineDash: [3, 3] } }); }
            } else
            maps.forEach((m, i) => {
                nodes.push({ id: 'col:' + i, type: 'studio-rich-node', title: m.table, content: m.col, fill: '#dbeafe', stroke: '#2563eb' });
                if (srcA) edges.push({ id: 'e1' + i, source: 'as:' + srcA.id, target: 'col:' + i, label: 'produit', style: { stroke: '#334155', lineWidth: 2, endArrow: { path: '', fill: '#334155' } } });
                edges.push({ id: 'e2' + i, source: 'col:' + i, target: attrId, label: 'alimente', style: { stroke: '#2563eb', endArrow: { path: '', fill: '#2563eb' } } });
            });
            if (lineageFilesOn() && !maps.length && srcA) edges.push({ id: 'e0', source: 'as:' + srcA.id, target: attrId, label: 'produit', style: { stroke: '#334155', lineWidth: 2, endArrow: { path: '', fill: '#334155' } } });
            (e2.usedBy || []).forEach(id => { const a = assetById(id); if (!a) return;
                nodes.push({ id: 'use:' + id, type: 'studio-rich-node', title: assetLabel(a), content: a.criticality || '', fill: a.kind === 'app' ? '#e2e8f0' : '#ffedd5', stroke: a.kind === 'app' ? '#334155' : '#ea580c' });
                edges.push({ id: 'eu' + id, source: attrId, target: 'use:' + id, label: 'utilisé par', style: { stroke: '#ea580c', endArrow: { path: '', fill: '#ea580c' } } }); });
            if (!(e2.usedBy || []).length) { nodes.push({ id: 'nouse', type: 'studio-rich-node', title: '😴 aucun usage déclaré', content: 'candidat au nettoyage ?', fill: '#fef9c3', stroke: '#ca8a04' }); edges.push({ id: 'enu', source: attrId, target: 'nouse', label: '', style: { stroke: '#eab308', lineDash: [3, 3] } }); }
            return { nodes, edges };
        }
        // Graphe de lineage pour une COLONNE du catalogue : réutilise le graphe d'attribut si la
        // colonne est mappée à un attribut d'objet métier, sinon graphe générique (système source →
        // colonne → objets métier & processus qui l'exploitent).
        function buildColumnLineageGraph(tbl, col) {
            const g = state.governance;
            buildColumnLineageGraph._viaAttr = false;
            for (const bo of (g.businessObjects || [])) {
                for (const e2 of (bo.elements || [])) { if ((e2.mappings || []).some(m => m.table === tbl && m.col === col)) { buildColumnLineageGraph._viaAttr = true; return buildAttrLineageGraph(bo, null, e2); } }
                for (const st of getBoFacets(bo)) { for (const fe of (st.elements || [])) { if (st.table === tbl && fe.col === col) { buildColumnLineageGraph._viaAttr = true; return buildAttrLineageGraph(bo, st, fe); } } }
            }
            const nodes = [], edges = []; const cid = 'col:main';
            nodes.push({ id: cid, type: 'studio-rich-node', title: '🔹 ' + col, content: 'Table ' + tbl, fill: '#dcfce7', stroke: '#16a34a' });
            const sys = String((g.dictionary[tbl] || {}).sourceSystem || '').trim().toLowerCase();
            const srcA = sys ? (g.assets || []).find(a => a.kind === 'app' && String(a.name).trim().toLowerCase() === sys) : null;
            if (srcA) { nodes.push({ id: 'as:' + srcA.id, type: 'studio-rich-node', title: '🖥 ' + srcA.name, content: 'système source', fill: '#e2e8f0', stroke: '#334155' }); edges.push({ id: 'ep', source: 'as:' + srcA.id, target: cid, label: 'produit', style: { stroke: '#334155', lineWidth: 2, endArrow: { path: '', fill: '#334155' } } }); }
            (g.businessObjects || []).filter(bo => (bo.sources || []).some(s2 => s2.table === tbl)).forEach(bo => { nodes.push({ id: 'bo:' + bo.id, type: 'studio-rich-node', title: '🏛️ ' + bo.name, content: 'objet métier', fill: '#dcfce7', stroke: '#16a34a' }); edges.push({ id: 'eb' + bo.id, source: cid, target: 'bo:' + bo.id, label: 'alimente', style: { stroke: '#2563eb', endArrow: { path: '', fill: '#2563eb' } } }); });
            (g.assets || []).filter(a => a.kind === 'process' && ((a.tables || []).includes(tbl) || (a.columns || []).some(c => c.table === tbl && c.col === col))).forEach(a => { nodes.push({ id: 'use:' + a.id, type: 'studio-rich-node', title: '⚙️ ' + a.name, content: a.criticality || '', fill: '#ffedd5', stroke: '#ea580c' }); edges.push({ id: 'eu' + a.id, source: cid, target: 'use:' + a.id, label: 'utilisé par', style: { stroke: '#ea580c', endArrow: { path: '', fill: '#ea580c' } } }); });
            if (nodes.length === 1) { nodes.push({ id: 'nouse', type: 'studio-rich-node', title: '😴 aucun usage déclaré', content: '', fill: '#fef9c3', stroke: '#ca8a04' }); edges.push({ id: 'enu', source: cid, target: 'nouse', label: '', style: { stroke: '#eab308', lineDash: [3, 3] } }); }
            return { nodes, edges };
        }
        // V9.1 — Lineage « métier » : par défaut les FICHIERS (tables) n'apparaissent plus dans
        // le graphe d'un objet ou d'un attribut. On lit : application(s) qui produisent → objet
        // (ou attribut) → applications / processus qui l'utilisent. La provenance technique reste
        // indiquée en sous-titre du nœud application (« via CLIENTS »), et une case
        // « Afficher les fichiers » rétablit le détail table par table. Préférence mémorisée.
        function lineageFilesOn() {
            if (govState.lineageFiles === undefined) { try { govState.lineageFiles = localStorage.getItem('sd_lineage_files') === '1'; } catch (e) { govState.lineageFiles = false; } }
            return !!govState.lineageFiles;
        }
        let _lineageRedraw = null;
        function lineageFilesSet(on) {
            govState.lineageFiles = !!on;
            try { localStorage.setItem('sd_lineage_files', on ? '1' : '0'); } catch (e) {}
            if (typeof _lineageRedraw === 'function') _lineageRedraw();
        }
        function lineageFilesToggleHtml() {
            return `<label data-ro="keep" class="text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap" title="Par défaut, le graphe va de l'application à l'objet sans passer par les fichiers. Cochez pour afficher chaque table / colonne."><input type="checkbox" ${lineageFilesOn() ? 'checked' : ''} onchange="lineageFilesSet(this.checked)"> 📄 Afficher les fichiers</label>`;
        }
        // V8.6 — Graphe de lineage d'un OBJET MÉTIER entier, présenté comme celui d'un attribut :
        // applications productrices → sources techniques (maître / contributeur) → objet →
        // consommateurs (applications, processus, tables destinataires, usages des attributs).
        // Tout est déduit des rattachements déjà saisis : rien à ressaisir.
        function buildBoLineageGraph(bo, opts) {
            const files = opts && opts.files !== undefined ? !!opts.files : lineageFilesOn();
            const g = state.governance; const nodes = [], edges = []; const seen = new Set();
            const add = n => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
            const boId = 'bo:' + bo.id;
            const nAttr = (boAllAttrRows(bo) || []).length;
            add({ id: boId, type: 'studio-rich-node', title: '🏛️ ' + bo.name, content: nAttr + ' attribut(s)' + (bo.globalOwner ? ' · ' + bo.globalOwner : ''), fill: '#dcfce7', stroke: '#16a34a' });
            const appNode = a => ({ id: 'as:' + a.id, type: 'studio-rich-node', title: (a.kind === 'process' ? '⚙️ ' : '🖥 ') + a.name, content: a.kind === 'process' ? 'processus' : (a.criticality || 'application'), fill: a.kind === 'process' ? '#ffedd5' : '#e2e8f0', stroke: a.kind === 'process' ? '#ea580c' : '#334155' });
            const ROLE = { maitre: 'alimente (maître)', contributeur: 'contribue', destinataire: 'diffusé vers' };
            const producers = new Set(bo.producedBy || []);
            // 1. Sources amont (maître / contributeur) et l'application qui les produit
            const via = {}; // appId -> tables (mode sans fichiers : rappel de la provenance sur le nœud appli)
            (bo.sources || []).filter(s2 => s2 && s2.table && s2.role !== 'destinataire').forEach((s2, i) => {
                const own = appOwnerOfSource(s2.table);
                if (!files && own) {
                    // Sans fichiers : l'application produit directement l'objet ; la table est citée sur le nœud.
                    add(appNode(own)); producers.delete(own.id); (via[own.id] = via[own.id] || []).push(s2.table);
                    if (!edges.some(e => e.source === 'as:' + own.id && e.target === boId))
                        edges.push({ id: 'epb' + own.id, source: 'as:' + own.id, target: boId, label: s2.role === 'maitre' ? 'produit (maître)' : 'contribue', style: { stroke: '#334155', lineWidth: s2.role === 'maitre' ? 2 : 1, endArrow: { path: '', fill: '#334155' } } });
                    return;
                }
                const tid = 'tbl:' + s2.table;
                add({ id: tid, type: 'studio-rich-node', title: '▦ ' + s2.table, content: (s2.role === 'maitre' ? 'source maître' : 'source contributrice') + (!files ? ' · sans application' : ''), fill: '#dbeafe', stroke: '#2563eb' });
                edges.push({ id: 'es' + i, source: tid, target: boId, label: ROLE[s2.role] || 'alimente', style: { stroke: '#2563eb', lineWidth: s2.role === 'maitre' ? 2 : 1, endArrow: { path: '', fill: '#2563eb' } } });
                if (own) { add(appNode(own)); producers.delete(own.id); edges.push({ id: 'ep' + i, source: 'as:' + own.id, target: tid, label: 'produit', style: { stroke: '#334155', lineWidth: 2, endArrow: { path: '', fill: '#334155' } } }); }
            });
            Object.keys(via).forEach(id => { const n = nodes.find(x => x.id === 'as:' + id); if (n) n.content = 'via ' + via[id].join(', '); });
            // 2. Applications productrices sans source technique identifiée : lien direct
            producers.forEach(id => { const a = assetById(id); if (!a) return; add(appNode(a)); edges.push({ id: 'epd' + id, source: 'as:' + id, target: boId, label: 'produit', style: { stroke: '#334155', lineWidth: 2, endArrow: { path: '', fill: '#334155' } } }); });
            // 3. Aval : consommateurs déclarés sur l'objet, tables destinataires, rattachements « boIds »
            const cons = new Map(); // assetId -> label d'arête
            (bo.consumedBy || []).forEach(id => cons.set(id, 'consommé par'));
            (g.assets || []).forEach(a => { if ((a.boIds || []).includes(bo.id) && !cons.has(a.id) && !seen.has('as:' + a.id)) cons.set(a.id, 'rattaché à'); });
            const useCnt = {};
            (boAllAttrRows(bo) || []).forEach(r => (r.el.usedBy || []).forEach(id => useCnt[id] = (useCnt[id] || 0) + 1));
            Object.keys(useCnt).forEach(id => { if (!cons.has(id)) cons.set(id, 'utilise ' + useCnt[id] + ' attribut(s)'); });
            cons.forEach((lbl, id) => { const a = assetById(id); if (!a) return; add(appNode(a));
                edges.push({ id: 'eu' + id, source: boId, target: 'as:' + id, label: lbl, style: { stroke: '#ea580c', endArrow: { path: '', fill: '#ea580c' } } }); });
            (bo.sources || []).filter(s2 => s2 && s2.table && s2.role === 'destinataire').forEach((s2, i) => {
                if (!files) {
                    // Sans fichiers : la table destinataire est remplacée par l'application qui la lit.
                    const own = appOwnerOfSource(s2.table);
                    if (own) { if (!cons.has(own.id) && !edges.some(e => e.source === boId && e.target === 'as:' + own.id)) { add(appNode(own)); edges.push({ id: 'ed' + i, source: boId, target: 'as:' + own.id, label: 'diffusé vers', style: { stroke: '#2563eb', endArrow: { path: '', fill: '#2563eb' } } }); } const n = nodes.find(x => x.id === 'as:' + own.id); if (n && !/via /.test(n.content || '')) n.content = 'via ' + s2.table; return; }
                }
                const tid = 'tbl:' + s2.table;
                add({ id: tid, type: 'studio-rich-node', title: '▦ ' + s2.table, content: 'table destinataire', fill: '#dbeafe', stroke: '#2563eb' });
                edges.push({ id: 'ed' + i, source: boId, target: tid, label: ROLE.destinataire, style: { stroke: '#2563eb', endArrow: { path: '', fill: '#2563eb' } } });
            });
            if (!edges.some(e => e.source === boId)) { add({ id: 'nouse', type: 'studio-rich-node', title: '😴 aucun usage déclaré', content: 'consommateurs à renseigner', fill: '#fef9c3', stroke: '#ca8a04' }); edges.push({ id: 'enu', source: boId, target: 'nouse', label: '', style: { stroke: '#eab308', lineDash: [3, 3] } }); }
            if (!edges.some(e => e.target === boId)) { add({ id: 'nosrc', type: 'studio-rich-node', title: '❔ aucune source déclarée', content: 'fiche ▸ Sources', fill: '#fef9c3', stroke: '#ca8a04' }); edges.push({ id: 'ens', source: 'nosrc', target: boId, label: '', style: { stroke: '#eab308', lineDash: [3, 3] } }); }
            return { nodes, edges };
        }
        // Lineage de l'objet entier, dans le même encart que celui d'un attribut (onglet Objets).
        function openBoLineage(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const box = el('attrLineageBox'); if (!box) return;
            box.classList.remove('hidden');
            _lineageRedraw = () => openBoLineage(boId);
            box.innerHTML = `<div class="flex items-center justify-between gap-2 flex-wrap mb-2"><span class="text-xs font-bold text-indigo-800">🕸 Lineage de l'objet « ${escapeHTML(bo.name)} » <span class="font-normal text-slate-500">— ${lineageFilesOn() ? 'applications → fichiers → objet → usages' : 'applications → objet → usages'}</span></span><span class="flex items-center gap-3">${lineageFilesToggleHtml()}<button onclick="el('attrLineageBox').classList.add('hidden')" class="text-slate-400 hover:text-red-500 font-bold text-xs">✕ fermer</button></span></div><div id="attrLineageWrap" class="h-[340px] border border-slate-100 rounded-lg bg-slate-50/50"></div>`;
            if (attrLineageGraph) { try { attrLineageGraph.destroy(); } catch (e3) {} attrLineageGraph = null; }
            attrLineageGraph = createSvgGraph(el('attrLineageWrap'));
            attrLineageGraph.data(buildBoLineageGraph(bo));
            attrLineageGraph.render();
            attrLineageGraph.fitView(20);
            box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        function boFacetElToggleUsedBy(boId, stId, feId, assetId, on) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo || !assetId) return;
            const st = getBoFacets(bo).find(x => x.id === stId); if (!st) return;
            const fe = (st.elements || []).find(e => e.id === feId); if (!fe) return;
            fe.usedBy = fe.usedBy || [];
            if (on) { if (!fe.usedBy.includes(assetId)) fe.usedBy.push(assetId); } else fe.usedBy = fe.usedBy.filter(x => x !== assetId);
            persistAppState(); renderGovernance();
        }
        function boFacetElSetField(boId, stId, feId, f, v) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const st = getBoFacets(bo).find(x => x.id === stId); if (!st) return;
            const fe = (st.elements || []).find(e => e.id === feId); if (!fe) return;
            fe[f] = v; persistAppState(); renderGovernance();
        }
        /* ---- Le SENS appartient à l'objet métier, pas à la colonne source ----
           Jusqu'ici cette vue écrivait définition, exemples, sensibilité et terme sur la COLONNE
           mappée. Trois conséquences : on documentait un détail technique au lieu du concept, un
           attribut non mappé n'était pas documentable du tout, et le même concept alimenté par
           deux colonnes devait être saisi deux fois. On porte donc ces informations sur l'attribut
           de l'objet, et la colonne technique n'est plus qu'une provenance, affichée discrètement.
           La colonne conserve ses propres champs : ils l'emportent si quelqu'un les a remplis,
           sinon elle hérite de l'objet — rien de ce qui a été saisi n'est perdu. */
        /* ---- Échantillonner de vrais exemples depuis la source rattachée ----
           Un exemple inventé ne sert à rien : il doit venir de la donnée. Quand l'attribut est
           rattaché à une colonne, on va y chercher les valeurs les plus FRÉQUENTES — un exemple
           doit être typique, pas tiré au hasard — en écartant les vides. Le balayage est borné
           par un échantillon pour rester instantané même sur une grosse source. */
        /* ---- Un attribut est-il multivalué ? ----
           L'information existait déjà, mais seulement dans la fiche de l'objet : elle est portée
           par la CARDINALITÉ du composant. « 1–N » ou « N–N » veut dire que l'objet peut avoir
           plusieurs occurrences du composant, donc que ses attributs sont multivalués. Un attribut
           central, lui, vaut une fois par objet. Ne pas le voir dans le dictionnaire conduit à
           documenter « la ville » comme s'il n'y en avait qu'une, alors qu'il peut y en avoir dix. */
        function boAttrCardinality(bo, row) {
            if (!row.stId) return { multi: false, card: '1–1', via: null };
            const st = getBoFacets(bo).find(x => x.id === row.stId);
            const card = (st && st.cardinality) || '1–N';
            return { multi: /[–-]\s*N$/.test(card), card, via: st ? st.name : null };
        }
        function boCardBadgeHtml(bo, row) {
            const c = boAttrCardinality(bo, row);
            const t = c.via
                ? `Via le composant « ${c.via} » (${c.card}) — la cardinalité se règle sur le composant, elle vaut pour tous ses attributs.`
                : 'Attribut porté directement par l\'objet : une valeur par occurrence.';
            return c.multi
                ? `<span class="text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5 whitespace-nowrap" title="${escapeHTML(t)}">plusieurs valeurs</span>`
                : `<span class="text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-500 rounded-full px-2 py-0.5 whitespace-nowrap" title="${escapeHTML(t)}">1 valeur</span>`;
        }

        /* ---- Côté technique « TEL_1, TEL_2, TEL_3 » ; côté métier « Téléphone : 1 à 3 valeurs » ----
           Une base étale presque toujours une donnée multivaluée en colonnes numérotées. Cette mise
           à plat est un choix d'implémentation : le métier, lui, ne connaît qu'UN attribut
           « Téléphone » qui peut prendre 1, 2, 3… n valeurs. Les afficher comme trois attributs
           distincts fait documenter trois fois la même chose et masque la seule information qui
           compte ici — combien de valeurs sont possibles. On les replie donc en un attribut unique,
           et la bascule « Vue technique » redonne les colonnes une à une : rien n'est masqué de force. */
        function boRepeatSplit(name) {
            const s = String(name || '').trim();
            const m = s.match(/^(.*?)[ _\-.]*\(?(\d{1,2})\)?$/);
            if (!m) return null;
            const base = m[1].replace(/[ _\-.]+$/, '').trim();
            if (base.length < 2 || /\d$/.test(base)) return null;   // « V1_2 », « CA_2024 » : on ne devine pas
            const idx = parseInt(m[2], 10);
            if (!isFinite(idx) || idx < 1) return null;
            return { base, idx };
        }
        function boFoldRows(rows) {
            const out = [], byKey = new Map();
            (rows || []).forEach(r => {
                const sp = boRepeatSplit(r.el.name);
                const plain = { fold: false, base: r.el.name, members: [r], idx: [], stId: r.stId || '', facet: r.facet };
                if (!sp) { out.push(plain); return; }
                const key = (r.stId || '') + '|' + sp.base.toLowerCase();
                let g = byKey.get(key);
                if (!g) { g = { fold: true, base: sp.base, members: [], idx: [], stId: r.stId || '', facet: r.facet }; byKey.set(key, g); out.push(g); }
                g.members.push(r); g.idx.push(sp.idx);
            });
            // Une colonne numérotée toute seule n'est pas une répétition : on la rend telle quelle.
            return out.map(g => (g.fold && g.members.length < 2)
                ? { fold: false, base: g.members[0].el.name, members: g.members, idx: [], stId: g.stId, facet: g.facet } : g);
        }
        function boFoldMax(g) { return Math.max(g.members.length, ...(g.idx.length ? g.idx : [1])); }
        function boFoldIds(g) { return g.members.map(m => m.el.id).join(','); }
        function boFoldField(g, f) { for (const m of g.members) if (m.el[f]) return m.el[f]; return ''; }
        function boFoldCols(bo, g) {
            const out = [];
            g.members.forEach(m => { const mp = (m.mappings || m.el.mappings || [])[0]; if (mp) out.push(mp.table + '.' + mp.col); });
            return out;
        }
        // Écrire sur l'attribut replié = écrire sur TOUTES les colonnes qu'il recouvre : une seule
        // saisie, et aucune divergence possible entre TEL_1 et TEL_2.
        function boFoldWrite(boId, stId, ids, f, v) {
            String(ids).split(',').filter(Boolean).forEach(id => boAttrWrite(boId, stId, id, f, v));
            renderGovernance();
        }
        // Renommer l'attribut métier renomme chaque colonne repliée en conservant son numéro.
        function boFoldRename(boId, stId, ids, v) {
            const bo = (state.governance.businessObjects || []).find(x => x.id === boId); if (!bo) return;
            const nb = String(v || '').trim(); if (!nb) return renderGovernance();
            String(ids).split(',').filter(Boolean).forEach(id => {
                const f = boAttrMapOf(bo, id); if (!f) return;
                const nm = String(f.el.name || '').trim(), sp = boRepeatSplit(nm);
                boAttrWrite(boId, stId, id, 'name', nb + (sp ? nm.slice(sp.base.length) : ''));
            });
            renderGovernance();
        }
        /* ---- Déclarer un attribut multivalué, sans attendre que la technique le trahisse ----
           Le repliement des colonnes numérotées ne couvre qu'un cas : celui où la source a déjà
           étalé la donnée. Or le métier sait souvent AVANT la source qu'un client peut avoir
           plusieurs adresses de courriel — parfois même sans qu'aucune source ne soit rattachée.
           La multiplicité devient donc une propriété que l'on DÉCLARE sur l'attribut de l'objet :
             '1'  → une seule valeur, affirmé
             'n'  → plusieurs valeurs, sans limite connue
             '3'  → plusieurs valeurs, trois au maximum
             ''   → non déclaré : on retombe sur ce que la structure technique laisse déduire.
           Une déclaration l'emporte toujours sur la déduction : c'est le métier qui tranche. */
        const MULTI_OPTS = [['', '— déduit —'], ['1', '1 valeur'], ['n', 'plusieurs, sans limite'],
            ['2', 'jusqu’à 2'], ['3', 'jusqu’à 3'], ['4', 'jusqu’à 4'], ['5', 'jusqu’à 5'],
            ['6', 'jusqu’à 6'], ['8', 'jusqu’à 8'], ['10', 'jusqu’à 10'], ['12', 'jusqu’à 12'], ['20', 'jusqu’à 20']];
        function boMultiNorm(v) {
            const s = String(v == null ? '' : v).trim().toLowerCase();
            if (!s) return '';
            if (['n', '*', 'oui', 'plusieurs', 'multi', 'multivalue', 'multivalué', 'n valeurs'].includes(s)) return 'n';
            if (['1', 'non', 'unique', 'mono', '1 valeur'].includes(s)) return '1';
            const k = parseInt(s, 10);
            if (isFinite(k) && k >= 1 && k <= 999 && String(k) === s.replace(/\s/g, '')) return String(k);
            return null;   // valeur non interprétable : on préfère le dire que l'enregistrer
        }
        function boAttrMulti(bo, g) {
            const decl = boMultiNorm(g.fold ? boFoldField(g, 'multi') : ((g.members[0].el || {}).multi || '')) || '';
            const det = g.fold ? boFoldMax(g) : 0;
            let multi = false, max = 0, from = '';
            if (decl === 'n') { multi = true; from = 'déclaré'; }
            else if (decl === '1') { from = 'déclaré'; }
            else if (decl) { multi = true; max = parseInt(decl, 10); from = 'déclaré'; }
            else if (det >= 2) { multi = true; max = det; from = 'déduit'; }
            return { multi, max, from, decl, label: !multi ? '1 valeur' : (max ? '1 à ' + max + ' valeurs' : 'plusieurs valeurs') };
        }
        // Combien de valeurs pour CET attribut, à l'intérieur d'UNE occurrence de son groupe.
        function boValueCountBadgeHtml(bo, g) {
            const c = boAttrMulti(bo, g), cols = boFoldCols(bo, g);
            const why = c.from === 'déclaré' ? 'Déclaré sur l’objet métier.'
                : (g.fold ? `Déduit de la structure technique : ${g.members.length} colonnes numérotées${cols.length ? ' (' + cols.join(', ') + ')' : ''}.`
                          : 'Aucune déclaration et aucune répétition détectée : une seule valeur.');
            const t = (c.multi ? 'Multivalué — ' + c.label : 'Monovalué — une seule valeur par occurrence') + '. ' + why;
            return c.multi
                ? `<span class="text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5 whitespace-nowrap" title="${escapeHTML(t)}">${c.label}</span>${c.from === 'déduit' ? '<span class="text-[9px] text-slate-400 ml-1" title="Déduit des colonnes numérotées — déclarez-le pour l’affirmer">déduit</span>' : ''}`
                : `<span class="text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-500 rounded-full px-2 py-0.5 whitespace-nowrap" title="${escapeHTML(t)}">1 valeur</span>`;
        }
        function boMultiSelectHtml(cur, onch, title) {
            return `<select onchange="${onch}" class="border border-slate-200 rounded text-[10px] p-0.5 bg-white" title="${escapeHTML(title || 'Combien de valeurs cet attribut peut prendre pour une occurrence de son objet')}">`
                + MULTI_OPTS.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('') + '</select>';
        }
        // Déclaration depuis la fiche de l'objet (onglet Structure), cœur ou composant.
        function boSetMulti(boId, stId, elId, v) {
            const n = boMultiNorm(v);
            if (n === null) return showError('Valeur de multiplicité non reconnue : utilisez « 1 », « n » ou un nombre.');
            boAttrWrite(boId, stId || '', elId, 'multi', n);
            renderGovernance();
        }
        // Le GROUPE (la facette) se répète — ce n'est pas une propriété de chacun de ses attributs.
        function boFacetCardBadgeHtml(st) {
            const card = (st && st.cardinality) || '1–N';
            return /[–-]\s*N$/.test(card)
                ? `<span class="text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-900 rounded-full px-2 py-0.5 whitespace-nowrap" title="Cardinalité ${escapeHTML(card)} : plusieurs occurrences de ce groupe par objet.">groupe répétable</span>`
                : `<span class="text-[10px] font-bold bg-slate-100 border border-slate-300 text-slate-600 rounded-full px-2 py-0.5 whitespace-nowrap" title="Cardinalité ${escapeHTML(card)} : une seule occurrence de ce groupe par objet.">groupe unique</span>`;
        }
        function boToggleFold() { govState.dictFold = (govState.dictFold === false); renderGovernance(); }
        // Échantillonner un attribut replié : on balaie toutes ses colonnes et on dédoublonne, sinon
        // « Téléphone » n'illustrerait que TEL_1 alors qu'il en recouvre trois.
        async function boFoldSample(boId, ids) {
            const bo = (state.governance.businessObjects || []).find(x => x.id === boId); if (!bo) return;
            const list = String(ids).split(',').filter(Boolean);
            const cols = [], vals = [];
            try {
                const { conn } = await getDB();
                for (const id of list) {
                    const f = boAttrMapOf(bo, id); if (!f || !f.map) continue;
                    cols.push(f.map.table + '.' + f.map.col);
                    let v = []; try { v = await boSampleValues(conn, f.map.table, f.map.col, 3); } catch (e) { continue; }
                    v.forEach(x => { if (!vals.includes(x)) vals.push(x); });
                }
            } catch (e) { return showError('Échantillonnage impossible : ' + e.message); }
            if (!cols.length) return showError("Aucune des colonnes de cet attribut n'est rattachée à une source chargée.");
            if (!vals.length) return showError(`Les colonnes ${cols.join(', ')} ne contiennent aucune valeur renseignée.`);
            const val = vals.slice(0, 4).join(' ; ');
            list.forEach(id => { const f = boAttrMapOf(bo, id); if (f) { f.el.examples = val; f.el.examplesAuto = true; } });
            persistAppState(); renderGovernance();
            showSuccess(`${vals.length} exemple(s) pris dans ${cols.length} colonne(s) : ${cols.join(', ')}.`);
        }

        function boAttrMapOf(bo, elId) {
            for (const e2 of (boCoreElements(bo) || []))
                if (e2.id === elId) return { el: e2, stId: '', map: (e2.mappings || [])[0] || null };
            for (const st of getBoFacets(bo))
                for (const fe of (st.elements || []))
                    if (fe.id === elId) return { el: fe, stId: st.id, map: fe.col ? { table: st.table, col: fe.col } : null };
            return null;
        }
        async function boSampleValues(conn, tableName, col, n) {
            const t = tableByName(tableName);
            if (!t || t.status !== 'ready') throw new Error(`source « ${tableName} » non chargée`);
            const raw = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
            const sql = `SELECT v FROM (SELECT ${raw} AS v FROM ${sqlIdent(duckTableName(t.id))}
                WHERE ${sqlIdent(col)} IS NOT NULL AND ${raw} <> '' USING SAMPLE 20000 ROWS)
                GROUP BY v ORDER BY COUNT(*) DESC, v LIMIT ${Number(n) || 4}`;
            return arrowResultToObjects(await conn.query(sql)).map(r => String(r.v).slice(0, 40));
        }
        async function boAttrSampleOne(boId, elId) {
            const bo = (state.governance.businessObjects || []).find(x => x.id === boId); if (!bo) return;
            const found = boAttrMapOf(bo, elId); if (!found) return;
            if (!found.map) return showError("Cet attribut n'est rattaché à aucune colonne : rattachez-le d'abord dans la fiche de l'objet (Structure).");
            try {
                const { conn } = await getDB();
                const vals = await boSampleValues(conn, found.map.table, found.map.col, 4);
                if (!vals.length) return showError(`« ${found.el.name} » : la colonne ${found.map.table}.${found.map.col} ne contient aucune valeur renseignée.`);
                found.el.examples = vals.join(' ; ');
                found.el.examplesAuto = true;
                persistAppState(); renderGovernance();
                showSuccess(`« ${found.el.name} » : ${vals.length} exemple(s) pris dans ${found.map.table}.${found.map.col}.`);
            } catch (e) { showError('Échantillonnage impossible : ' + e.message); }
        }
        async function boAttrSampleAll(boId) {
            const bo = (state.governance.businessObjects || []).find(x => x.id === boId); if (!bo) return;
            const rows = boAllAttrRows(bo);
            let done = 0, kept = 0, none = 0, unmapped = 0;
            try {
                const { conn } = await getDB();
                for (const r of rows) {
                    const found = boAttrMapOf(bo, r.el.id);
                    if (!found || !found.map) { unmapped++; continue; }
                    // On ne remplace jamais un exemple saisi à la main : ce serait détruire du travail.
                    if (found.el.examples && !found.el.examplesAuto) { kept++; continue; }
                    let vals = [];
                    try { vals = await boSampleValues(conn, found.map.table, found.map.col, 4); } catch (e) { none++; continue; }
                    if (!vals.length) { none++; continue; }
                    found.el.examples = vals.join(' ; '); found.el.examplesAuto = true; done++;
                }
                persistAppState(); renderGovernance();
                const parts = [`${done} attribut(s) complété(s)`];
                if (kept) parts.push(`${kept} laissé(s) intact(s) car saisi(s) à la main`);
                if (unmapped) parts.push(`${unmapped} sans colonne rattachée`);
                if (none) parts.push(`${none} sans valeur exploitable`);
                showSuccess('Échantillonnage : ' + parts.join(', ') + '.');
            } catch (e) { showError('Échantillonnage impossible : ' + e.message); }
        }

        function boAttrWrite(boId, stId, elId, f, v) {
            if (stId) updateFacetElement(boId, stId, elId, f, v);
            else updateBoElement(boId, elId, f, v);
            // Un exemple retouché à la main cesse d'être « échantillonné » : il ne doit plus être
            // écrasé par un échantillonnage global.
            if (f === 'examples') {
                const bo = (state.governance.businessObjects || []).find(x => x.id === boId);
                const found = bo && boAttrMapOf(bo, elId);
                if (found) { found.el.examplesAuto = false; persistAppState(); }
            }
        }
        // Reprise unique de l'existant : ce qui avait été saisi sur la colonne remonte sur
        // l'attribut, pour que la bascule ne fasse pas disparaître le travail déjà fait.
        function boAttrLiftFromColumn(bo) {
            let moved = 0;
            const lift = (elm, mp) => {
                if (!mp) return;
                const dc = ((state.governance.dictionary[mp.table] || {}).columns || {})[mp.col];
                if (!dc) return;
                ['definition', 'examples', 'sensitivity', 'term'].forEach(f => {
                    if (!elm[f] && dc[f]) { elm[f] = dc[f]; moved++; }
                });
            };
            (boCoreElements(bo) || []).forEach(e2 => lift(e2, (e2.mappings || [])[0]));
            getBoFacets(bo).forEach(st => (st.elements || []).forEach(fe => lift(fe, fe.col ? { table: st.table, col: fe.col } : null)));
            if (moved) persistAppState();
            return moved;
        }
        // Ce que voit le reste de l'application pour une colonne : sa valeur propre, sinon celle
        // de l'attribut métier qu'elle alimente.
        function dictColResolved(tableName, col, field) {
            const own = (((state.governance.dictionary[tableName] || {}).columns || {})[col] || {})[field];
            if (own) return { value: own, from: null };
            for (const bo of (state.governance.businessObjects || [])) {
                for (const e2 of (boCoreElements(bo) || []))
                    if ((e2.mappings || []).some(m => m.table === tableName && m.col === col) && e2[field])
                        return { value: e2[field], from: bo.name, attr: e2.name };
                for (const st of getBoFacets(bo))
                    for (const fe of (st.elements || []))
                        if (st.table === tableName && fe.col === col && fe[field])
                            return { value: fe[field], from: bo.name, attr: fe.name };
            }
            return { value: '', from: null };
        }

        // Pastille « table.colonne » : la colonne en évidence, la table en retrait — lisible même longue.
        function boMapChipHtml(m, onRemove) {
            return `<span class="bo-map-chip" title="${escapeHTML(m.table + '.' + m.col)}"><span class="kv"><span class="co">${escapeHTML(m.col)}</span><span class="tb">${escapeHTML(m.table)}</span></span>${onRemove ? `<button onclick="${onRemove}" title="Retirer cette colonne">✕</button>` : ''}</span>`;
        }
        // Le sélecteur « table ▸ colonne » n'apparaît qu'à la demande (bouton « + colonne ») ; il est
        // pré-positionné sur la table maître de l'objet, ouvert d'office si l'attribut n'est alimenté par rien.
        function boMapPickToggle(elmId) {
            const p = el('bo-map-' + elmId); if (!p) return;
            p.classList.toggle('hidden');
            const btn = el('bo-map-btn-' + elmId); if (btn) btn.classList.toggle('on', !p.classList.contains('hidden'));
            if (!p.classList.contains('hidden')) { const s = el('bo-tbl-' + elmId); if (s) { populateBoMapCols(elmId, s.value); s.focus(); } }
        }
        function boElementRowHtml(bo, elm, names) {
            const maps = elm.mappings || [];
            const master = boMasterTable(bo); const defTbl = master && names.includes(master.name) ? master.name : names[0];
            const cols = defTbl ? (tableByName(defTbl) || { headers: [] }).headers : [];
            const multi = boMultiNorm(elm.multi) || '';
            const cnt = boAttrMulti(bo, { fold: false, members: [{ el: elm, stId: '' }], idx: [], stId: '' });
            return `<tr class="hover:bg-slate-50" ondragover="reorderDragOver(event,'boel')" ondragleave="reorderDragLeave(event)" ondrop="reorderDrop(event,'boel','${elm.id}',(f,t)=>boElReorder('${bo.id}',f,t))">
                <td class="text-center"><span class="bo-handle"><span draggable="true" ondragstart="reorderDragStart(event,'boel','${elm.id}')" ondragend="reorderDragEnd(event)" class="cursor-grab text-slate-400 hover:text-emerald-600 select-none px-0.5" title="Glisser pour ordonner par importance">⠿</span>${[['top','⤒','Tout en haut'],['up','▲','Monter'],['down','▼','Descendre'],['bottom','⤓','Tout en bas']].map(([w,ic,ti])=>`<button onclick="boMoveEl('${bo.id}','${elm.id}','${w}')" title="${ti}">${ic}</button>`).join('')}</span></td>
                <td><input type="text" value="${escapeHTML(elm.name)}" onchange="updateBoElement('${bo.id}','${elm.id}','name',this.value)" class="bo-name border border-slate-300 bg-white" title="Nom métier — renommable librement"></td>
                <td><div class="flex flex-wrap items-center gap-1.5">
                    ${maps.map((m, i) => boMapChipHtml(m, `removeBoMapping('${bo.id}','${elm.id}',${i})`)).join('')}
                    ${maps.length ? '' : '<span class="bo-map-none" title="Aucune colonne technique n\'alimente cet attribut">⚠ non alimenté</span>'}
                    <button id="bo-map-btn-${elm.id}" onclick="boMapPickToggle('${elm.id}')" class="bo-map-add ${maps.length ? '' : 'on'}" title="Ajouter une colonne technique qui alimente cet attribut">+ colonne</button>
                </div></td>
                <td><input type="text" value="${escapeHTML(elm.owner || '')}" onchange="updateBoElement('${bo.id}','${elm.id}','owner',this.value)" class="border border-slate-200 bg-white" placeholder="${escapeHTML(bo.globalOwner ? '= ' + bo.globalOwner : '— celui de l\'objet —')}" title="Propriétaire de cet attribut ; vide = celui de l'objet"></td>
                <td>${boMultiSelectHtml(multi, `boSetMulti('${bo.id}','','${elm.id}',this.value)`, 'Combien de valeurs cet attribut peut prendre pour un(e) ' + bo.name)}${!multi && cnt.multi ? `<span class="bo-multi-note" title="Déduit des colonnes numérotées — déclarez-le pour le figer">observé : ${escapeHTML(cnt.label)}</span>` : ''}</td>
                <td class="text-center">${boUsageBadgeHtml(bo, elm)}</td>
                <td class="text-right"><button onclick="removeBoElement('${bo.id}','${elm.id}')" class="text-red-400 hover:text-red-600 px-1 font-bold" title="Supprimer cet attribut">✕</button></td>
            </tr>
            <tr id="bo-map-${elm.id}" class="bo-map-row ${maps.length ? 'hidden' : ''}"><td colspan="7"><div class="bo-map-pick">
                <span class="lbl">Alimenter « ${escapeHTML(elm.name)} » par</span>
                <select id="bo-tbl-${elm.id}" onchange="populateBoMapCols('${elm.id}',this.value)" class="border border-slate-300 bg-white" aria-label="Table">${names.map(n => `<option ${n === defTbl ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('')}</select>
                <span class="text-slate-400 text-xs">▸</span>
                <select id="bo-col-${elm.id}" class="border border-slate-300 bg-white" aria-label="Colonne">${cols.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                <button onclick="addBoMapping('${bo.id}','${elm.id}')" class="bg-emerald-600 text-white">Ajouter</button>
                ${maps.length ? `<button onclick="boMapPickToggle('${elm.id}')" class="bg-white border border-slate-300 text-slate-600">Fermer</button>` : ''}
            </div></td></tr>`;
        }
        function boAttrTableHead(cols) {
            return `<colgroup>${cols.map(c => `<col style="width:${c[1]}">`).join('')}</colgroup><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr>${cols.map(c => `<th class="${c[3] || ''}" ${c[2] ? `title="${escapeHTML(c[2])}"` : ''}>${c[0]}</th>`).join('')}</tr></thead>`;
        }
        function boElementsTableHtml(bo, elems, names, emptyMsg) {
            if (!elems.length) return `<p class="text-xs text-slate-400 italic">${emptyMsg || 'Aucun attribut.'}</p>`;
            const head = boAttrTableHead([['', '78px', 'Glisser ou ⤒▲▼⤓ pour ordonner'], ['Nom métier', '27%'], ['Alimenté par', 'auto', 'Colonnes techniques qui alimentent cet attribut'], ['Propriétaire', '15%'], ['Nb valeurs', '14%', 'Combien de valeurs cet attribut peut prendre pour une occurrence de l\'objet'], ['🔌', '46px', 'Applications et processus qui l\'utilisent', 'text-center'], ['', '32px']]);
            return `<div class="border border-slate-200 rounded-lg overflow-x-auto"><table class="bo-attr-tbl text-left">${head}<tbody class="divide-y divide-slate-100">${elems.map(e => boElementRowHtml(bo, e, names)).join('')}</tbody></table></div>`;
        }
        const CARD_OPTS = ['1–1', '1–N', 'N–1', 'N–N'];
        function facetScopeLabel(sc) { return `${sc.col} ${SCOPE_OPS[sc.op] || sc.op}${sc.op === 'empty' || sc.op === 'notempty' ? '' : ' "' + sc.val + '"'}`; }
        // Une ligne d'attribut de facette : nom métier + propriétaire + colonne technique source.
        function facetElementRowHtml(bo, st, fe) {
            const t = tableByName(st.table);
            const cols = t ? t.headers : [];
            const multi = boMultiNorm(fe.multi) || '';
            const cnt = boAttrMulti(bo, { fold: false, members: [{ el: fe, stId: st.id }], idx: [], stId: st.id });
            return `<tr class="hover:bg-slate-50">
                <td><input type="text" value="${escapeHTML(fe.name)}" onchange="updateFacetElement('${bo.id}','${st.id}','${fe.id}','name',this.value)" class="bo-name border border-slate-300 bg-white" title="Nom métier — renommable"></td>
                <td><div class="flex items-center gap-1.5"><span class="bo-map-chip shrink-0" title="${escapeHTML(st.table)}"><span class="tb">${escapeHTML(st.table)}</span></span><select onchange="updateFacetElement('${bo.id}','${st.id}','${fe.id}','col',this.value)" class="border border-slate-300 bg-white font-mono" aria-label="Colonne technique">${cols.map(h => `<option ${h === fe.col ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select></div></td>
                <td><input type="text" value="${escapeHTML(fe.owner || '')}" onchange="updateFacetElement('${bo.id}','${st.id}','${fe.id}','owner',this.value)" class="border border-slate-200 bg-white" placeholder="${escapeHTML(bo.globalOwner ? '= ' + bo.globalOwner : '— celui de l\'objet —')}" title="Propriétaire de cet attribut ; vide = celui de l'objet"></td>
                <td>${boMultiSelectHtml(multi, `boSetMulti('${bo.id}','${st.id}','${fe.id}',this.value)`, 'Combien de valeurs cet attribut peut prendre DANS UNE occurrence de « ' + st.name + ' »')}${!multi && cnt.multi ? `<span class="bo-multi-note" title="Déduit des colonnes numérotées — déclarez-le pour le figer">observé : ${escapeHTML(cnt.label)}</span>` : ''}</td>
                <td class="text-center">${boUsageBadgeHtml(bo, fe)}</td>
                <td class="text-right"><button onclick="removeFacetElement('${bo.id}','${st.id}','${fe.id}')" class="text-red-400 hover:text-red-600 px-1 font-bold" title="Supprimer cet attribut">✕</button></td>
            </tr>`;
        }
        function renderBoFacetCard(bo, st, names, open) {
            const t = tableByName(st.table);
            const cols = t ? t.headers : [];
            const cardSel = CARD_OPTS.map(o => `<option ${o === st.cardinality ? 'selected' : ''}>${o}</option>`).join('');
            const scopeChips = (st.scope || []).length
                ? (st.scope || []).map((sc, ci) => `<span class="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5 flex items-center gap-1"><strong>${escapeHTML(sc.col)}</strong> ${SCOPE_OPS[sc.op] || sc.op}${sc.op === 'empty' || sc.op === 'notempty' ? '' : ` <strong>"${escapeHTML(sc.val)}"</strong>`} <button onclick="removeFacetScope('${bo.id}','${st.id}',${ci})" class="text-amber-400 hover:text-red-500">✕</button></span>`).join('')
                : '<span class="text-[11px] text-slate-400 italic">Toute la table (aucun filtre) — pensez à filtrer si cette table porte plusieurs objets fonctionnels.</span>';
            const attrs = Array.isArray(st.elements) ? st.elements : [];
            const attrTable = attrs.length
                ? `<div class="border border-slate-200 rounded-lg overflow-x-auto"><table class="bo-attr-tbl text-left">${boAttrTableHead([['Nom métier', '28%'], ['Colonne technique', 'auto', 'Colonne de ' + st.table + ' qui alimente cet attribut'], ['Propriétaire', '17%'], ['Nb valeurs', '16%', 'Combien de valeurs cet attribut peut prendre dans une occurrence du composant'], ['🔌', '46px', 'Applications et processus qui l\'utilisent', 'text-center'], ['', '32px']])}<tbody class="divide-y divide-slate-100">${attrs.map(fe => facetElementRowHtml(bo, st, fe)).join('')}</tbody></table></div>`
                : '<p class="text-xs text-slate-400 italic">Aucun attribut.</p>';
            const filterSummary = (st.scope || []).length ? (st.scope || []).map(facetScopeLabel).join(' · ') : 'toute la table';
            const appliesSummary = (st.applies || []).length ? ` · <span class="text-purple-600">si ${(st.applies || []).map(facetScopeLabel).map(escapeHTML).join(' et ')}</span>` : '';
            return `<details class="border border-emerald-200 rounded-lg bg-white mb-2 group" ${open ? 'open' : ''}>
                <summary class="bg-emerald-50/70 border-b border-emerald-100 px-3 py-2 cursor-pointer flex items-center gap-2 flex-wrap list-none">
                    <span class="text-emerald-400 group-open:rotate-90 transition-transform">▶</span>
                    <span class="font-black text-sm text-emerald-800">◆ ${escapeHTML(st.name)}</span>
                    ${(state.governance.assets || []).length && attrs.some(fe => !(fe.usedBy || []).length) ? `<span class="text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-1.5 py-0.5" title="Attributs sans application/processus utilisateur déclaré">😴 ${attrs.filter(fe => !(fe.usedBy || []).length).length} sans usage</span>` : ''}
                    <span class="text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">${escapeHTML(st.cardinality || '')}</span>
                    <span class="text-[11px] text-slate-500 font-mono">vue de ${escapeHTML(st.table)} · ${escapeHTML(filterSummary)}${appliesSummary}</span>
                    <span class="text-[10px] text-slate-400">${(st.elements || []).length} attr.</span>
                    <button onclick="event.preventDefault();removeBoStructure('${bo.id}','${st.id}')" class="text-red-400 hover:text-red-600 text-xs ml-auto" title="Détacher ce composant">🗑</button>
                </summary>
                <div class="px-3 py-2 border-b border-emerald-50 bg-emerald-50/30">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] uppercase font-bold text-slate-400">Nom</span>
                        <input type="text" value="${escapeHTML(st.name)}" onchange="updateBoFacet('${bo.id}','${st.id}','name',this.value)" class="font-bold text-sm text-emerald-800 border border-emerald-200 rounded px-2 py-0.5 bg-white w-48" title="Nom fonctionnel du composant">
                        <span class="text-[11px] text-slate-500">1 ${escapeHTML(bo.name)} contient
                            <select onchange="updateBoFacet('${bo.id}','${st.id}','cardinality',this.value)" class="bg-white border border-emerald-200 rounded text-[11px] font-bold px-1 py-0.5">${cardSel}</select> de</span>
                        <select onchange="updateBoFacet('${bo.id}','${st.id}','table',this.value)" class="border border-slate-200 rounded px-1 py-0.5 bg-white font-mono text-[11px]">${names.map(n => `<option ${n === st.table ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('')}</select>
                    </div>
                </div>
                <div class="p-2 space-y-2">
                    <div>
                        <div class="text-[9px] uppercase font-bold text-slate-400 mb-1">Filtre fonctionnel <span class="normal-case font-medium text-slate-300">— définit la facette (ex : TYPE = PRINCIPALE)</span></div>
                        <div class="flex flex-wrap items-center gap-1.5 mb-1.5">${scopeChips}</div>
                        <div class="flex flex-wrap items-end gap-1.5 bg-slate-50 border border-slate-100 rounded p-1.5">
                            <select id="fac-col-${st.id}" onchange="fillFacetScopeVals('${bo.id}','${st.id}')" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${cols.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                            <select id="fac-op-${st.id}" onchange="el('fac-val-${st.id}').classList.toggle('hidden', this.value==='empty'||this.value==='notempty')" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${Object.entries(SCOPE_OPS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
                            <input type="text" id="fac-val-${st.id}" list="fac-vals-${st.id}" onfocus="fillFacetScopeVals('${bo.id}','${st.id}')" class="border border-slate-300 p-1 rounded text-[11px] w-32" placeholder="choisir ou saisir..."><datalist id="fac-vals-${st.id}"></datalist>
                            <button onclick="addFacetScope('${bo.id}','${st.id}')" class="text-[11px] bg-indigo-600 text-white px-2 py-1 rounded font-bold">+ Filtre</button>
                        </div>
                    </div>
                    <div>
                        <div class="text-[9px] uppercase font-bold text-purple-500 mb-1">S'applique uniquement si (objet principal) <span class="normal-case font-medium text-purple-300">— ex : catégorie/type/nature de ${escapeHTML(boMasterTable(bo) ? boMasterTable(bo).name : 'la table maître')}</span></div>
                        <div class="flex flex-wrap items-center gap-1.5 mb-1.5">${(st.applies || []).length
                            ? (st.applies || []).map((sc, ci) => `<span class="text-[11px] bg-purple-50 border border-purple-200 text-purple-800 rounded-full px-2 py-0.5 flex items-center gap-1"><strong>${escapeHTML(sc.col)}</strong> ${SCOPE_OPS[sc.op] || sc.op}${sc.op === 'empty' || sc.op === 'notempty' ? '' : ` <strong>"${escapeHTML(sc.val)}"</strong>`} <button onclick="removeFacetApplies('${bo.id}','${st.id}',${ci})" class="text-purple-400 hover:text-red-500">✕</button></span>`).join('')
                            : '<span class="text-[11px] text-slate-400 italic">Tous les ' + escapeHTML(boMasterTable(bo) ? boMasterTable(bo).name : 'objets') + ' — la facette vaut pour toutes les catégories.</span>'}</div>
                        <div class="flex flex-wrap items-end gap-1.5 bg-purple-50/40 border border-purple-100 rounded p-1.5">
                            <select id="fac-app-col-${st.id}" onchange="fillFacetAppliesVals('${bo.id}','${st.id}')" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${(boMasterTable(bo) ? boMasterTable(bo).headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                            <select id="fac-app-op-${st.id}" onchange="el('fac-app-val-${st.id}').classList.toggle('hidden', this.value==='empty'||this.value==='notempty')" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${Object.entries(SCOPE_OPS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
                            <input type="text" id="fac-app-val-${st.id}" list="fac-app-vals-${st.id}" onfocus="fillFacetAppliesVals('${bo.id}','${st.id}')" class="border border-slate-300 p-1 rounded text-[11px] w-32" placeholder="ex : ENTREPOT"><datalist id="fac-app-vals-${st.id}"></datalist>
                            <button onclick="addFacetApplies('${bo.id}','${st.id}')" class="text-[11px] bg-purple-600 text-white px-2 py-1 rounded font-bold">+ Applicabilité</button>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between items-center mb-1"><span class="text-[9px] uppercase font-bold text-slate-400">Attributs de cette facette</span>
                            <button onclick="addFacetElement('${bo.id}','${st.id}')" class="text-[11px] bg-white border border-emerald-300 text-emerald-700 px-2 py-0.5 rounded font-medium hover:bg-emerald-50">+ Attribut</button></div>
                        ${attrTable}
                    </div>
                </div>
            </details>`;
        }
        // Bloc « Structure » : attributs du cœur + une carte par facette fonctionnelle + références.
        function renderBoStructure(bo, names) {
            bo.references = Array.isArray(bo.references) ? bo.references : [];
            const facets = getBoFacets(bo);
            const core = boCoreElements(bo);
            let html = `<div class="border border-indigo-100 rounded-xl p-3 bg-indigo-50/30">
                <div class="text-[10px] uppercase font-bold text-indigo-400 mb-1 flex items-center gap-1.5">🧩 Structure fonctionnelle de l'objet</div>
                <p class="text-[11.5px] text-slate-500 mb-2 leading-snug">Le modèle métier peut différer du modèle technique : une même table (ex : <em>adresse</em> avec une colonne <em>type</em>) peut porter plusieurs composants fonctionnels distincts (adresse principale, de livraison…). Créez une <strong>facette</strong> = table filtrée + nom métier + cardinalité.</p>`;
            // -- Cœur (repliable pour gagner de la place : replié par défaut au-delà de 6 attributs) --
            html += `<details class="border border-slate-200 rounded-lg bg-white mb-3 group" ${core.length <= 6 ? 'open' : ''}>
                <summary class="bg-slate-50/80 border-b border-slate-100 px-3 py-2 cursor-pointer flex items-center gap-2 flex-wrap list-none">
                    <span class="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
                    <span class="text-[11px] font-bold text-slate-600">🏛️ Attributs propres de l'objet <span class="text-slate-400 font-medium">(table maître)</span></span>
                    <span class="text-[10px] font-bold bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">${core.length}</span>
                    ${(state.governance.assets || []).length && core.some(e2 => !(e2.usedBy || []).length) ? `<span class="text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-1.5 py-0.5" title="Attributs sans application/processus utilisateur déclaré">😴 ${core.filter(e2 => !(e2.usedBy || []).length).length} sans usage</span>` : ''}
                    ${core.length ? `<span class="text-[10px] text-slate-400 truncate max-w-[50%]">${core.slice(0, 5).map(e2 => escapeHTML(e2.name)).join(' · ')}${core.length > 5 ? ' …' : ''}</span>` : ''}
                    <button onclick="event.preventDefault();addBoElement('${bo.id}')" class="text-xs bg-white border border-emerald-300 text-emerald-700 px-2.5 py-1 rounded font-medium hover:bg-emerald-50 ml-auto">+ Attribut</button>
                </summary>
                <div class="p-2">${boElementsTableHtml(bo, core, names, 'Aucun attribut propre.')}</div>
            </details>`;
            // -- Facettes (composants fonctionnels) : repliées si plusieurs, pour une lecture claire --
            if (facets.length) html += `<div class="text-[11px] font-bold text-slate-600 mb-1.5">◆ Composants / facettes (${facets.length}) <span class="text-slate-400 font-medium">— cliquez pour déplier</span></div>`;
            facets.forEach(st => { html += renderBoFacetCard(bo, st, names, facets.length === 1); });
            // -- Ajouter une facette --
            html += `<div class="flex items-end gap-2 flex-wrap bg-white border border-slate-100 rounded-lg p-2 mb-3">
                <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Nom métier du composant</label>
                <input type="text" id="bo-comp-name-${bo.id}" class="border border-slate-300 p-1.5 rounded text-xs w-40" placeholder="ex : Adresse principale"></div>
                <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Table technique</label>
                <select id="bo-comp-tbl-${bo.id}" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${names.map(n => `<option>${escapeHTML(n)}</option>`).join('')}</select></div>
                <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Cardinalité</label>
                <select id="bo-comp-card-${bo.id}" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${CARD_OPTS.map(o => `<option ${o === '1–N' ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
                <button onclick="addBoStructure('${bo.id}')" class="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded font-bold">+ Facette</button>
            </div>`;
            // -- Références vers d'autres objets métier --
            const otherBos = state.governance.businessObjects.filter(b => b.id !== bo.id);
            html += `<div>
                <div class="text-[11px] font-bold text-slate-600 mb-1.5">🔗 Objets référencés <span class="text-slate-400 font-medium">(objets séparés liés à celui-ci)</span></div>`;
            if (bo.references.length) {
                html += `<div class="flex flex-wrap gap-1.5 mb-2">${bo.references.map((rf, i) => {
                    const target = state.governance.businessObjects.find(b => b.id === rf.boId);
                    return `<span class="text-xs bg-teal-50 border border-teal-200 text-teal-800 rounded-full px-2.5 py-1 flex items-center gap-1.5">→ <strong>${escapeHTML(target ? target.name : '(objet supprimé)')}</strong> <span class="text-teal-500">${escapeHTML(rf.cardinality || '')}</span>${rf.viaLabel ? `<span class="text-teal-400 font-mono text-[10px]">${escapeHTML(rf.viaLabel)}</span>` : ''} <button onclick="removeBoReference('${bo.id}',${i})" class="text-teal-400 hover:text-red-500">✕</button></span>`;
                }).join('')}</div>`;
            }
            if (otherBos.length) {
                html += `<div class="flex items-end gap-2 flex-wrap bg-white border border-slate-100 rounded-lg p-2">
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Référencer un objet</label>
                    <select id="bo-ref-tgt-${bo.id}" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${otherBos.map(b => `<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')}</select></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Cardinalité</label>
                    <select id="bo-ref-card-${bo.id}" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${CARD_OPTS.map(o => `<option ${o === 'N–1' ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
                    <button onclick="addBoReference('${bo.id}')" class="text-xs bg-teal-600 text-white px-3 py-1.5 rounded font-bold">+ Référence</button>
                </div>`;
            } else html += '<p class="text-xs text-slate-400 italic">Aucun autre objet à référencer.</p>';
            html += `</div></div>`;
            return html;
        }
        function addBoStructure(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const tbl = el('bo-comp-tbl-' + boId).value, card = el('bo-comp-card-' + boId).value;
            const nm = (el('bo-comp-name-' + boId).value || '').trim() || tbl;
            if (!tbl) return;
            const t = tableByName(tbl);
            bo.structure = getBoFacets(bo);
            attachSourceToObject(bo, tbl, 'contributeur', false); // source pour le lineage, sans polluer le cœur
            bo.structure.push({
                id: 'st_' + generateId(), table: tbl, name: nm, kind: 'composition', cardinality: card || '1–N', scope: [],
                elements: (t ? t.headers : []).map(h => ({ id: 'fe_' + generateId(), name: h, owner: '', col: h })),
            });
            persistAppState(); renderGovernance();
            showSuccess(`Facette "${nm}" ajoutée (vue de ${tbl}, ${card}).`);
        }
        function updateBoFacet(boId, stId, f, v) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId); if (!st) return;
            st[f] = v;
            if (f === 'table') { // la table change : réinitialise les colonnes des attributs et vide le filtre
                const t = tableByName(v);
                st.elements = (t ? t.headers : []).map(h => ({ id: 'fe_' + generateId(), name: h, owner: '', col: h }));
                st.scope = [];
                attachSourceToObject(bo, v, 'contributeur', false);
            }
            persistAppState(); renderGovernance();
        }
        function removeBoStructure(boId, stId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const st = (bo.structure || []).find(x => x.id === stId);
            bo.structure = (bo.structure || []).filter(s => s.id !== stId);
            // Détache la source si plus aucune facette n'utilise cette table.
            if (st && !(bo.structure || []).some(s => s.table === st.table)) {
                bo.sources = (bo.sources || []).filter(s => !(s.table === st.table && s.role !== 'maitre'));
            }
            persistAppState(); renderGovernance();
        }
        function addFacetElement(boId, stId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId); if (!st) return;
            const t = tableByName(st.table);
            st.elements = st.elements || [];
            st.elements.push({ id: 'fe_' + generateId(), name: 'Nouvel attribut', owner: '', col: (t ? t.headers[0] : '') || '' });
            persistAppState(); renderGovernance();
        }
        function updateFacetElement(boId, stId, feId, f, v) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId);
            const fe = st && (st.elements || []).find(x => x.id === feId);
            if (fe) { fe[f] = v; persistAppState(); }
        }
        function removeFacetElement(boId, stId, feId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId); if (!st) return;
            st.elements = (st.elements || []).filter(x => x.id !== feId);
            persistAppState(); renderGovernance();
        }
        function addFacetScope(boId, stId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId); if (!st) return;
            const col = el('fac-col-' + stId).value, op = el('fac-op-' + stId).value;
            const val = (op === 'empty' || op === 'notempty') ? '' : el('fac-val-' + stId).value.trim();
            if (!col) return;
            if ((op !== 'empty' && op !== 'notempty') && !val) return showError('Indiquez la valeur du filtre (ex : PRINCIPALE).');
            st.scope = st.scope || [];
            if (st.scope.some(c => c.col === col && c.op === op && c.val === val)) return showError('Ce filtre est déjà présent.');
            st.scope.push({ col, op, val });
            persistAppState(); renderGovernance();
        }
        function removeFacetScope(boId, stId, idx) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId); if (!st) return;
            (st.scope || []).splice(idx, 1);
            persistAppState(); renderGovernance();
        }
        function addFacetApplies(boId, stId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId); if (!st) return;
            const col = el('fac-app-col-' + stId).value, op = el('fac-app-op-' + stId).value;
            const val = (op === 'empty' || op === 'notempty') ? '' : el('fac-app-val-' + stId).value.trim();
            if (!col) return;
            if ((op !== 'empty' && op !== 'notempty') && !val) return showError('Indiquez la valeur (ex : ENTREPOT).');
            st.applies = st.applies || [];
            if (st.applies.some(c => c.col === col && c.op === op && c.val === val)) return showError('Cette condition d\'applicabilité existe déjà.');
            st.applies.push({ col, op, val });
            persistAppState(); renderGovernance();
        }
        function removeFacetApplies(boId, stId, idx) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId); if (!st) return;
            (st.applies || []).splice(idx, 1);
            persistAppState(); renderGovernance();
        }
        async function fillFacetAppliesVals(boId, stId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId); if (!st) return;
            const t = boMasterTable(bo); const list = el('fac-app-vals-' + stId); const colSel = el('fac-app-col-' + stId);
            if (!t || !list || !colSel) return;
            const col = colSel.value; if (!col) return;
            list.innerHTML = '';
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
                const res = await conn.query(`SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(t.id))} WHERE ${sqlIdent(col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 20`);
                list.innerHTML = arrowResultToObjects(res).map(r => `<option value="${escapeHTML(r.v)}">`).join('');
            } catch (e) {}
        }
        async function fillFacetScopeVals(boId, stId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            const st = bo && (bo.structure || []).find(x => x.id === stId); if (!st) return;
            const t = tableByName(st.table); const list = el('fac-vals-' + stId); const colSel = el('fac-col-' + stId);
            if (!t || !list || !colSel) return;
            const col = colSel.value; if (!col) return;
            list.innerHTML = '';
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
                const res = await conn.query(`SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(t.id))} WHERE ${sqlIdent(col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 20`);
                list.innerHTML = arrowResultToObjects(res).map(r => `<option value="${escapeHTML(r.v)}">`).join('');
            } catch (e) {}
        }
        function addBoReference(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const tgt = el('bo-ref-tgt-' + boId).value, card = el('bo-ref-card-' + boId).value;
            if (!tgt) return;
            bo.references = Array.isArray(bo.references) ? bo.references : [];
            if (bo.references.some(r => r.boId === tgt)) return showError('Cet objet est déjà référencé.');
            bo.references.push({ boId: tgt, viaLabel: '', cardinality: card || 'N–1' });
            persistAppState(); renderGovernance();
        }
        function removeBoReference(boId, idx) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            bo.references = (bo.references || []); bo.references.splice(idx, 1);
            persistAppState(); renderGovernance();
        }

        // Fiche détaillée d'un objet métier : identité, sources & rôles, attributs, règles contextuelles.
        // ======================= V9.0 : FICHE OBJET MÉTIER REPENSÉE =======================
        // Voir, modifier et ENRICHIR un objet en un seul endroit : une carte d'identité avec un
        // score de complétude et ses actions, puis un espace maître-détail — la liste des attributs
        // (cœur + facettes) à gauche, un vrai formulaire pour l'attribut sélectionné à droite :
        // sens métier (définition, exemples, sensibilité, terme), provenance, usages, ordre, lineage.
        // La vue « Tableau » historique reste disponible d'un clic.
        const BO_FILTERS = [['all', 'Tous'], ['nomap', '⚠ Non alimentés'], ['nodef', '✎ Sans définition'], ['nouse', '😴 Sans usage']];
        function boAttrHasMap(r) { return r.stId ? !!r.el.col : (r.el.mappings || []).length > 0; }
        function boAttrProv(r) { return r.stId ? (r.el.col ? r.facet + '.' + r.el.col : '') : (r.el.mappings || []).map(m => m.table + '.' + m.col).join(' · '); }
        function boFilterOk(bo, r) {
            const f = govState.boFilter || 'all';
            if (f === 'nomap' && boAttrHasMap(r)) return false;
            if (f === 'nodef' && r.el.definition) return false;
            if (f === 'nouse' && ((r.el.usedBy || []).length || !(state.governance.assets || []).length)) return false;
            const q = catNorm(govState.boQ || '');
            if (q && !catNorm([r.el.name, boAttrProv(r), r.el.definition || ''].join(' ')).includes(q)) return false;
            return true;
        }
        // Complétude de la fiche : ce qui manque, avec l'action qui y mène.
        function boCompleteness(bo) {
            const rows = boAllAttrRows(bo) || [];
            const hasAssets = (state.governance.assets || []).length > 0;
            const noMap = rows.filter(r => !boAttrHasMap(r)).length, noDef = rows.filter(r => !r.el.definition).length, noUse = rows.filter(r => !(r.el.usedBy || []).length).length;
            const checks = [
                { w: 15, ok: !!(bo.definition || '').trim(), lbl: 'Écrire la définition', act: `boFocus('bo-def-${bo.id}')` },
                { w: 15, ok: !!(bo.globalOwner || '').trim(), lbl: 'Désigner un propriétaire', act: `boFocus('bo-own-${bo.id}')` },
                { w: 15, ok: (bo.sources || []).some(x => x.role === 'maitre'), lbl: 'Désigner une source maître', act: `setBoTab('sources')` },
                { w: 10, ok: rows.length > 0, lbl: 'Ajouter des attributs', act: `setBoTab('structure')` },
                { w: 15, ok: rows.length > 0 && noMap === 0, lbl: noMap + ' attribut(s) non alimenté(s)', act: `boGoFilter('nomap')` },
                { w: 15, ok: rows.length > 0 && noDef === 0, lbl: noDef + ' attribut(s) sans définition', act: `boGoFilter('nodef')` },
                ...(hasAssets ? [{ w: 10, ok: rows.length > 0 && noUse === 0, lbl: noUse + ' attribut(s) sans usage', act: `boGoFilter('nouse')` }] : []),
                { w: 5, ok: bo.status === 'Validé', lbl: 'Faire valider l\'objet', act: `boFocus('bo-status-${bo.id}')` },
            ];
            const tot = checks.reduce((a, c) => a + c.w, 0), got = checks.filter(c => c.ok).reduce((a, c) => a + c.w, 0);
            return { score: Math.round(100 * got / tot), todos: checks.filter(c => !c.ok), done: checks.filter(c => c.ok).length, all: checks.length };
        }
        function boFocus(id) { const e2 = el(id); if (!e2) return; e2.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { try { e2.focus(); } catch (er) {} }, 250); }
        function boGoFilter(f) { govState.boTab = 'structure'; govState.structView = 'fiche'; govState.boFilter = f; govState.boQ = ''; govState.boSel = null; renderGovernance(); }
        function boSetFilter(f) { govState.boFilter = f; renderGovernance(); }
        function boSetQ(v) { govState.boQ = v; renderGovernance(); const i = el('boQ'); if (i) { i.focus(); const n = i.value.length; i.setSelectionRange(n, n); } }
        function boSetStructView(v) { govState.structView = v; renderGovernance(); }
        function boSelect(kind, stId, elId) { govState.boSel = { kind, stId: stId || '', elId: elId || '' }; renderGovernance(); const d = el('boDetail'); if (d && window.innerWidth < 1100) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        // Navigation clavier dans la liste : ↑ ↓ changent la sélection, Entrée ouvre le formulaire.
        function boListKey(ev, boId) {
            if (!['ArrowUp', 'ArrowDown'].includes(ev.key)) return;
            ev.preventDefault();
            const items = Array.from(document.querySelectorAll('#boList [data-sel]'));
            const cur = items.findIndex(x => x.classList.contains('on'));
            const nx = ev.key === 'ArrowDown' ? Math.min(items.length - 1, cur + 1) : Math.max(0, cur - 1);
            if (items[nx]) { const k = JSON.parse(items[nx].getAttribute('data-sel')); boSelect(k.kind, k.stId, k.elId); requestAnimationFrame(() => { const l = el('boList'); if (l) l.focus(); }); }
        }
        function boCompletenessHtml(bo) {
            const c = boCompleteness(bo);
            const cls = c.score < 40 ? 'lo' : (c.score < 75 ? 'mid' : '');
            return `<div class="flex items-center gap-3 flex-wrap mt-3">
                <span class="text-[11px] font-black uppercase tracking-wide text-slate-500 whitespace-nowrap">Fiche complète à</span>
                <b class="text-base ${c.score < 40 ? 'text-red-600' : (c.score < 75 ? 'text-amber-700' : 'text-emerald-700')}">${c.score} %</b>
                <div class="bo-prog ${cls}" role="progressbar" aria-valuenow="${c.score}" aria-valuemin="0" aria-valuemax="100"><span style="width:${c.score}%"></span></div>
                <span class="text-[11px] text-slate-500 whitespace-nowrap">${c.done}/${c.all} critères</span></div>
                <div class="flex items-center gap-1.5 flex-wrap mt-2">${c.todos.length
                    ? c.todos.map(t => `<button data-ro="keep" onclick="${t.act}" class="bo-todo" title="Cliquer pour y aller">→ ${escapeHTML(t.lbl)}</button>`).join('')
                    : '<span class="bo-todo ok">✓ Rien ne manque — la fiche est complète</span>'}</div>`;
        }
        // ---- Espace « Attributs & composition » ----
        function renderBoWorkspace(bo, names) {
            if (govState.structView === undefined) govState.structView = 'fiche';
            const toolbar = `<div class="flex items-center gap-2 flex-wrap mb-3">
                <input data-ro="keep" id="boQ" type="text" value="${escapeHTML(govState.boQ || '')}" oninput="boSetQ(this.value)" placeholder="Filtrer les attributs…" aria-label="Filtrer les attributs" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-52 bg-white">
                <div class="bo-filt" role="group" aria-label="Filtre">${BO_FILTERS.map(([k, l]) => `<button data-ro="keep" class="${(govState.boFilter || 'all') === k ? 'on' : ''}" onclick="boSetFilter('${k}')">${l}</button>`).join('')}</div>
                <span class="flex-grow"></span>
                <button onclick="boAddAttrAndSelect('${bo.id}')" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold">+ Attribut</button>
                <button onclick="boSelect('newfacet')" class="text-xs bg-white border border-emerald-300 text-emerald-700 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-50">+ Facette</button>
                <div class="seg-ux" role="group" aria-label="Affichage"><button data-ro="keep" class="${govState.structView !== 'table' ? 'on' : ''}" onclick="boSetStructView('fiche')" title="Liste + formulaire">▤ Fiche</button><button data-ro="keep" class="${govState.structView === 'table' ? 'on' : ''}" onclick="boSetStructView('table')" title="Tableau complet (vue historique)">▦ Tableau</button></div>
            </div>`;
            if (govState.structView === 'table') return toolbar + renderBoStructure(bo, names);
            const rows = boAllAttrRows(bo) || [];
            const shown = rows.filter(r => boFilterOk(bo, r));
            const sel = govState.boSel || null;
            // sélection par défaut : premier attribut visible
            let cur = sel;
            const exists = k => !k ? false : (k.kind === 'attr' ? rows.some(r => r.el.id === k.elId) : (k.kind === 'facet' ? getBoFacets(bo).some(st => st.id === k.stId) : true));
            if (!exists(cur)) cur = shown.length ? { kind: 'attr', stId: shown[0].stId || '', elId: shown[0].el.id } : { kind: 'none' };
            const isOn = (kind, stId, elId) => cur.kind === kind && (cur.stId || '') === (stId || '') && (cur.elId || '') === (elId || '');
            const hasAssets = (state.governance.assets || []).length > 0;
            const item = r => { const on = isOn('attr', r.stId, r.el.id); const map = boAttrHasMap(r);
                const dots = `<span class="bo-dots" aria-hidden="true"><span class="bo-dot ${map ? 'ok' : 'ko'}" title="${map ? 'Alimenté' : 'Non alimenté'}"></span><span class="bo-dot ${r.el.definition ? 'ok' : ''}" title="${r.el.definition ? 'Défini' : 'Sans définition'}"></span>${hasAssets ? `<span class="bo-dot ${(r.el.usedBy || []).length ? 'ok' : ''}" title="${(r.el.usedBy || []).length ? 'Usages déclarés' : 'Sans usage'}"></span>` : ''}</span>`;
                return `<div class="bo-item ${r.stId ? 'sub' : ''} ${on ? 'on' : ''}" data-sel='${JSON.stringify({ kind: 'attr', stId: r.stId || '', elId: r.el.id })}' onclick="boSelect('attr','${r.stId || ''}','${r.el.id}')" role="option" aria-selected="${on}">
                    <span class="min-w-0 flex-1"><span class="nm block">${escapeHTML(r.el.name)}</span><span class="prov block ${map ? '' : 'warn'}">${map ? escapeHTML(boAttrProv(r)) : '⚠ non alimenté'}</span></span>${dots}</div>`; };
            const core = shown.filter(r => !r.stId);
            let list = `<div class="bo-lhead">🏛️ Attributs propres <span class="n">${core.length}${core.length !== rows.filter(r => !r.stId).length ? '/' + rows.filter(r => !r.stId).length : ''}</span></div>`;
            list += core.length ? core.map(item).join('') : `<div class="text-[11px] text-slate-400 italic px-3 py-2">${rows.some(r => !r.stId) ? 'Aucun attribut ne correspond au filtre.' : 'Aucun attribut propre — « + Attribut ».'}</div>`;
            getBoFacets(bo).forEach(st => {
                const fr = shown.filter(r => r.stId === st.id);
                list += `<div class="bo-lhead fac ${isOn('facet', st.id, '') ? 'on' : ''}" data-sel='${JSON.stringify({ kind: 'facet', stId: st.id, elId: '' })}' onclick="boSelect('facet','${st.id}','')" title="Ouvrir la définition du composant (table, filtre, cardinalité)">◆ ${escapeHTML(st.name)} <span class="normal-case font-medium text-[10px] opacity-80">${escapeHTML(st.cardinality || '')}</span><span class="n">${(st.elements || []).length}</span></div>`;
                list += fr.map(item).join('');
            });
            list += `<div class="bo-lhead ${isOn('refs', '', '') ? 'fac on' : ''}" data-sel='{"kind":"refs","stId":"","elId":""}' onclick="boSelect('refs','','')" style="cursor:pointer">🔗 Objets référencés <span class="n">${(bo.references || []).length}</span></div>`;
            let detail = '';
            if (cur.kind === 'attr') { const r = rows.find(x => x.el.id === cur.elId); detail = r ? boAttrFormHtml(bo, r, names) : ''; }
            else if (cur.kind === 'facet') { const st = getBoFacets(bo).find(x => x.id === cur.stId); detail = st ? boFacetFormHtml(bo, st, names) : ''; }
            else if (cur.kind === 'refs') detail = boRefsFormHtml(bo);
            else if (cur.kind === 'newfacet') detail = boNewFacetFormHtml(bo, names);
            else detail = `<div class="bo-empty">🧩 Aucun attribut pour l'instant.<br><span class="text-[12px]">Cliquez sur <b>+ Attribut</b> pour créer le premier, ou sur <b>+ Facette</b> pour rattacher un composant (adresse, contact…).</span></div>`;
            return toolbar + `<div class="bo-ws">
                <div id="boList" class="bo-list" tabindex="0" role="listbox" aria-label="Attributs de l'objet" onkeydown="boListKey(event,'${bo.id}')">${list}</div>
                <div id="boDetail" class="bo-detail">${detail}</div>
            </div>
            <div id="attrLineageBox" class="hidden mt-3 border-2 border-indigo-200 rounded-xl bg-white p-3"></div>`;
        }
        function boAddAttrAndSelect(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            bo.elements = bo.elements || [];
            const e2 = { id: 'be_' + generateId(), name: 'Nouvel attribut', owner: '', mappings: [] };
            bo.elements.push(e2); persistAppState();
            govState.boFilter = 'all'; govState.boQ = ''; govState.boSel = { kind: 'attr', stId: '', elId: e2.id };
            renderGovernance(); boFocus('boF-name');
        }
        function boAttrWriteR(boId, stId, elId, f, v, rerender) { boAttrWrite(boId, stId, elId, f, v); if (rerender) renderGovernance(); }
        // Formulaire d'un attribut : tout ce qui le décrit, en sections lisibles.
        function boAttrFormHtml(bo, r, names) {
            const e2 = r.el, stId = r.stId || '';
            const st = stId ? getBoFacets(bo).find(x => x.id === stId) : null;
            const W = (f, rer) => `boAttrWriteR('${bo.id}','${stId}','${e2.id}','${f}',this.value,${rer ? 'true' : 'false'})`;
            const assets = state.governance.assets || [];
            const apps = assets.filter(a => a.kind === 'app');
            const globalSrc = (bo.producedBy || [])[0] || '';
            const multi = boMultiNorm(e2.multi) || '';
            const cnt = boAttrMulti(bo, { fold: false, members: [{ el: e2, stId }], idx: [], stId });
            const hasMap = boAttrHasMap(r);
            const sensOpts = cur => '<option value="">—</option>' + SENSITIVITY_OPTS.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
            // provenance
            let prov = '';
            if (st) {
                const cols = (tableByName(st.table) || { headers: [] }).headers;
                prov = `<div class="flex items-center gap-2 flex-wrap"><span class="bo-map-chip" title="${escapeHTML(st.table)}"><span class="tb">${escapeHTML(st.table)}</span></span><span class="text-slate-400">▸</span>
                    <select onchange="${W('col', true)}" class="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono" aria-label="Colonne technique"><option value="">— aucune —</option>${cols.map(h => `<option ${h === e2.col ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>
                    <span class="text-[11px] text-slate-500">colonne de la facette « ${escapeHTML(st.name)} »</span></div>`;
            } else {
                const maps = e2.mappings || [];
                const master = boMasterTable(bo); const defTbl = master && names.includes(master.name) ? master.name : names[0];
                const cols = defTbl ? (tableByName(defTbl) || { headers: [] }).headers : [];
                prov = `<div class="flex items-center gap-1.5 flex-wrap mb-2">${maps.map((m, i) => boMapChipHtml(m, `removeBoMapping('${bo.id}','${e2.id}',${i})`)).join('')}${maps.length ? '' : '<span class="bo-map-none">⚠ non alimenté — choisissez la colonne technique ci-dessous</span>'}</div>
                    <div class="bo-map-pick"><span class="lbl">Ajouter une colonne</span>
                        <select id="bo-tbl-${e2.id}" onchange="populateBoMapCols('${e2.id}',this.value)" class="border border-slate-300 bg-white" aria-label="Table">${names.map(n => `<option ${n === defTbl ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('')}</select>
                        <span class="text-slate-400 text-xs">▸</span>
                        <select id="bo-col-${e2.id}" class="border border-slate-300 bg-white" aria-label="Colonne">${cols.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                        <button onclick="addBoMapping('${bo.id}','${e2.id}')" class="bg-emerald-600 text-white">Ajouter</button></div>
                    <div class="text-[10.5px] text-slate-500 mt-1.5">Plusieurs colonnes = le même concept présent dans plusieurs sources (consolidation).</div>`;
            }
            const tgl = aid => stId ? `boFacetElToggleUsedBy('${bo.id}','${stId}','${e2.id}','${aid}',this.checked)` : `boElToggleUsedBy('${bo.id}','${e2.id}','${aid}',this.checked)`;
            const used = e2.usedBy || [];
            const usage = assets.length ? `<div class="flex gap-1.5 flex-wrap">${assets.map(a => `<label class="bo-use ${used.includes(a.id) ? 'on' : ''}"><input type="checkbox" ${used.includes(a.id) ? 'checked' : ''} onchange="${tgl(a.id)}">${ASSET_KINDS[a.kind] ? ASSET_KINDS[a.kind][0] : ''} ${escapeHTML(a.name)}</label>`).join('')}</div>
                <div class="bo-grid mt-3"><div class="bo-fld"><label>Source spécifique de cet attribut</label><select onchange="${W('sourceApp', true)}"><option value="">${globalSrc && assetById(globalSrc) ? '= objet (' + escapeHTML(assetById(globalSrc).name) + ')' : '= source de l\'objet'}</option>${apps.map(a => `<option value="${a.id}" ${e2.sourceApp === a.id ? 'selected' : ''}>${escapeHTML(a.name)}</option>`).join('')}</select><div class="hint">À renseigner seulement si cet attribut vient d'une autre application que l'objet.</div></div></div>`
                : `<p class="text-[12px] text-slate-500 italic">Aucune application ni processus déclaré — <button data-ro="keep" onclick="openGovTab('assets')" class="text-indigo-600 font-bold underline">déclarez-les</button> pour tracer qui utilise cet attribut.</p>`;
            const order = stId ? '' : `<span class="bo-handle ml-auto">${[['top', '⤒', 'Tout en haut'], ['up', '▲', 'Monter'], ['down', '▼', 'Descendre'], ['bottom', '⤓', 'Tout en bas']].map(([w, ic, ti]) => `<button onclick="boMoveEl('${bo.id}','${e2.id}','${w}')" class="text-slate-500 hover:text-emerald-700 px-1.5 py-1 rounded border border-slate-200 bg-white text-xs" title="${ti}">${ic}</button>`).join(' ')}</span>`;
            const del = stId ? `removeFacetElement('${bo.id}','${stId}','${e2.id}')` : `removeBoElement('${bo.id}','${e2.id}')`;
            return `<div class="bo-dhead"><span class="text-lg" aria-hidden="true">${stId ? '◆' : '🔹'}</span><div class="min-w-0"><h3 class="truncate">${escapeHTML(e2.name)}</h3><div class="sub">${stId ? 'Attribut du composant « ' + escapeHTML(st.name) + ' »' : 'Attribut propre de « ' + escapeHTML(bo.name) + ' »'}${hasMap ? ' · alimenté par ' + escapeHTML(boAttrProv(r)) : ' · <b class="text-amber-700">non alimenté</b>'}</div></div>${order}
                <button onclick="openAttrLineage('${bo.id}','${stId}','${e2.id}')" class="text-xs bg-indigo-50 border border-indigo-300 text-indigo-800 px-2.5 py-1.5 rounded-lg font-bold hover:bg-indigo-100 whitespace-nowrap" title="Graphe source → colonne → attribut → usages">🕸 Lineage</button>
                <button onclick="${del}" class="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg border border-red-200 bg-white font-bold" title="Supprimer cet attribut">✕</button></div>
            <div class="bo-sect"><h4>Identité</h4><div class="bo-grid">
                <div class="bo-fld" style="grid-column:span 2"><label for="boF-name">Nom métier</label><input id="boF-name" type="text" value="${escapeHTML(e2.name)}" onchange="${W('name', true)}" placeholder="ex : Date de fin de construction"></div>
                <div class="bo-fld"><label>Propriétaire</label><input type="text" value="${escapeHTML(e2.owner || '')}" onchange="${W('owner', false)}" placeholder="${escapeHTML(bo.globalOwner ? '= ' + bo.globalOwner : '— celui de l\'objet —')}">${propBadgeHtml('attr', { boId: bo.id, stId, elId: e2.id }, 'owner')}</div>
                <div class="bo-fld"><label>Nombre de valeurs</label>${boMultiSelectHtml(multi, `boSetMulti('${bo.id}','${stId}','${e2.id}',this.value)`, 'Combien de valeurs cet attribut peut prendre pour un(e) ' + bo.name).replace('class="', 'style="width:100%;min-height:34px;font-size:12.5px;padding:7px 9px;border-radius:8px" class="')}${!multi && cnt.multi ? `<div class="hint">Observé : ${escapeHTML(cnt.label)} (colonnes numérotées) — déclarez-le pour le figer.</div>` : ''}${propBadgeHtml('attr', { boId: bo.id, stId, elId: e2.id }, 'multi')}</div>
            </div></div>
            <div class="bo-sect"><h4>Sens métier</h4><div class="bo-grid">
                <div class="bo-fld" style="grid-column:1/-1"><label>Définition</label><textarea onchange="${W('definition', true)}" placeholder="Ce que désigne cet attribut, en langage métier — ce que verra un consommateur de la donnée dans le catalogue.">${escapeHTML(e2.definition || '')}</textarea>${propBadgeHtml('attr', { boId: bo.id, stId, elId: e2.id }, 'definition')}</div>
                <div class="bo-fld" style="grid-column:span 2"><label>Exemples de valeurs</label><div class="flex gap-1.5"><input type="text" value="${escapeHTML(e2.examples || '')}" onchange="${W('examples', false)}" placeholder="ex : PARIS ; LYON" ${e2.examplesAuto ? 'title="Valeurs prises dans la source rattachée"' : ''}>${hasMap ? `<button onclick="boAttrSampleOne('${bo.id}','${e2.id}')" class="text-xs bg-white border border-indigo-300 text-indigo-700 px-2.5 rounded-lg font-bold hover:bg-indigo-50 whitespace-nowrap" title="Prendre les valeurs les plus fréquentes dans la source">🎲 Échantillonner</button>` : ''}</div>${e2.examplesAuto ? '<div class="hint">Échantillonnés automatiquement depuis la source.</div>' : ''}${propBadgeHtml('attr', { boId: bo.id, stId, elId: e2.id }, 'examples')}</div>
                <div class="bo-fld"><label>Sensibilité</label><select onchange="${W('sensitivity', false)}">${sensOpts(e2.sensitivity || '')}</select>${propBadgeHtml('attr', { boId: bo.id, stId, elId: e2.id }, 'sensitivity')}</div>
                <div class="bo-fld" style="grid-column:1/-1"><label>Termes du glossaire (noms métier, synonymes)</label>${termTagsHtml('attr', { boId: bo.id, elId: e2.id })}<div class="hint">Tapez un terme existant ou un nouveau puis Entrée : il devient un synonyme cherchable dans le catalogue.</div></div>
            </div></div>
            <div class="bo-sect"><h4>Provenance (alimenté par)</h4>${prov}</div>
            <div class="bo-sect"><h4>Usages — qui utilise cet attribut</h4>${usage}</div>`;
        }
        // Formulaire d'une facette (composant) : définition, filtre, applicabilité, attributs.
        function boFacetFormHtml(bo, st, names) {
            const t = tableByName(st.table); const cols = t ? t.headers : [];
            const cardSel = CARD_OPTS.map(o => `<option ${o === st.cardinality ? 'selected' : ''}>${o}</option>`).join('');
            const scopeChips = (st.scope || []).length ? (st.scope || []).map((sc, ci) => `<span class="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><strong>${escapeHTML(sc.col)}</strong> ${SCOPE_OPS[sc.op] || sc.op}${sc.op === 'empty' || sc.op === 'notempty' ? '' : ` <strong>"${escapeHTML(sc.val)}"</strong>`} <button onclick="removeFacetScope('${bo.id}','${st.id}',${ci})" class="text-amber-400 hover:text-red-500">✕</button></span>`).join('') : '<span class="text-[11px] text-slate-500 italic">Toute la table — filtrez si cette table porte plusieurs composants (ex : TYPE = PRINCIPALE).</span>';
            const appChips = (st.applies || []).length ? (st.applies || []).map((sc, ci) => `<span class="text-[11px] bg-purple-50 border border-purple-200 text-purple-800 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><strong>${escapeHTML(sc.col)}</strong> ${SCOPE_OPS[sc.op] || sc.op}${sc.op === 'empty' || sc.op === 'notempty' ? '' : ` <strong>"${escapeHTML(sc.val)}"</strong>`} <button onclick="removeFacetApplies('${bo.id}','${st.id}',${ci})" class="text-purple-400 hover:text-red-500">✕</button></span>`).join('') : '<span class="text-[11px] text-slate-500 italic">Vaut pour tous les ' + escapeHTML(boMasterTable(bo) ? boMasterTable(bo).name : 'objets') + '.</span>';
            const mh = boMasterTable(bo) ? boMasterTable(bo).headers : [];
            return `<div class="bo-dhead"><span class="text-lg" aria-hidden="true">◆</span><div class="min-w-0"><h3 class="truncate">${escapeHTML(st.name)}</h3><div class="sub">Composant de « ${escapeHTML(bo.name)} » · ${(st.elements || []).length} attribut(s) · vue de ${escapeHTML(st.table)}</div></div>
                <button onclick="addFacetElement('${bo.id}','${st.id}')" class="ml-auto text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold">+ Attribut</button>
                <button onclick="removeBoStructure('${bo.id}','${st.id}')" class="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg border border-red-200 bg-white font-bold" title="Détacher ce composant">🗑</button></div>
            <div class="bo-sect"><h4>Définition du composant</h4><div class="bo-grid">
                <div class="bo-fld"><label>Nom fonctionnel</label><input type="text" value="${escapeHTML(st.name)}" onchange="updateBoFacet('${bo.id}','${st.id}','name',this.value)"></div>
                <div class="bo-fld"><label>Cardinalité — 1 ${escapeHTML(bo.name)} contient…</label><select onchange="updateBoFacet('${bo.id}','${st.id}','cardinality',this.value)">${cardSel}</select></div>
                <div class="bo-fld"><label>Table technique</label><select onchange="updateBoFacet('${bo.id}','${st.id}','table',this.value)" class="font-mono">${names.map(n => `<option ${n === st.table ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('')}</select></div>
            </div></div>
            <div class="bo-sect"><h4>Filtre fonctionnel — ce qui définit la facette</h4>
                <div class="flex flex-wrap items-center gap-1.5 mb-2">${scopeChips}</div>
                <div class="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2">
                    <select id="fac-col-${st.id}" onchange="fillFacetScopeVals('${bo.id}','${st.id}')" class="border border-slate-300 p-1.5 rounded text-xs bg-white font-mono">${cols.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                    <select id="fac-op-${st.id}" onchange="el('fac-val-${st.id}').classList.toggle('hidden', this.value==='empty'||this.value==='notempty')" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${Object.entries(SCOPE_OPS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
                    <input type="text" id="fac-val-${st.id}" list="fac-vals-${st.id}" onfocus="fillFacetScopeVals('${bo.id}','${st.id}')" class="border border-slate-300 p-1.5 rounded text-xs w-36" placeholder="choisir ou saisir…"><datalist id="fac-vals-${st.id}"></datalist>
                    <button onclick="addFacetScope('${bo.id}','${st.id}')" class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold">+ Filtre</button></div></div>
            <div class="bo-sect"><h4>S'applique uniquement si (objet principal)</h4>
                <div class="flex flex-wrap items-center gap-1.5 mb-2">${appChips}</div>
                <div class="flex flex-wrap items-center gap-1.5 bg-purple-50/40 border border-purple-100 rounded-lg p-2">
                    <select id="fac-app-col-${st.id}" onchange="fillFacetAppliesVals('${bo.id}','${st.id}')" class="border border-slate-300 p-1.5 rounded text-xs bg-white font-mono">${mh.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                    <select id="fac-app-op-${st.id}" onchange="el('fac-app-val-${st.id}').classList.toggle('hidden', this.value==='empty'||this.value==='notempty')" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${Object.entries(SCOPE_OPS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
                    <input type="text" id="fac-app-val-${st.id}" list="fac-app-vals-${st.id}" onfocus="fillFacetAppliesVals('${bo.id}','${st.id}')" class="border border-slate-300 p-1.5 rounded text-xs w-36" placeholder="ex : ENTREPOT"><datalist id="fac-app-vals-${st.id}"></datalist>
                    <button onclick="addFacetApplies('${bo.id}','${st.id}')" class="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold">+ Applicabilité</button></div></div>
            <div class="bo-sect"><h4>Attributs du composant (${(st.elements || []).length})</h4>${(st.elements || []).length ? `<div class="flex flex-wrap gap-1.5">${(st.elements || []).map(fe => `<button onclick="boSelect('attr','${st.id}','${fe.id}')" class="text-xs bg-white border border-slate-300 rounded-full px-3 py-1 font-bold hover:bg-emerald-50">${escapeHTML(fe.name)}${fe.col ? '' : ' <span class="text-amber-600">⚠</span>'}</button>`).join('')}</div>` : '<p class="text-[12px] text-slate-500 italic">Aucun attribut — « + Attribut » ci-dessus.</p>'}</div>`;
        }
        function boNewFacetFormHtml(bo, names) {
            return `<div class="bo-dhead"><span class="text-lg" aria-hidden="true">◆</span><div><h3>Nouveau composant (facette)</h3><div class="sub">Une facette = une table technique filtrée + un nom métier + une cardinalité (ex : « Adresse principale » = ADRESSE où TYPE = PRINCIPALE, 1–1).</div></div></div>
            <div class="bo-sect"><div class="bo-grid">
                <div class="bo-fld"><label>Nom métier du composant</label><input type="text" id="bo-comp-name-${bo.id}" placeholder="ex : Adresse principale"></div>
                <div class="bo-fld"><label>Table technique</label><select id="bo-comp-tbl-${bo.id}" class="font-mono">${names.map(n => `<option>${escapeHTML(n)}</option>`).join('')}</select></div>
                <div class="bo-fld"><label>Cardinalité — 1 ${escapeHTML(bo.name)} contient…</label><select id="bo-comp-card-${bo.id}">${CARD_OPTS.map(o => `<option ${o === '1–N' ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
            </div><div class="mt-3 flex gap-2"><button onclick="boAddFacetAndSelect('${bo.id}')" class="text-xs bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold">+ Créer la facette</button><button onclick="boSelect('none')" class="text-xs bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg font-bold">Annuler</button></div></div>`;
        }
        function boAddFacetAndSelect(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const before = getBoFacets(bo).map(x => x.id);
            addBoStructure(boId);
            const nw = getBoFacets(bo).find(x => !before.includes(x.id));
            if (nw) { govState.boSel = { kind: 'facet', stId: nw.id, elId: '' }; renderGovernance(); }
        }
        function boRefsFormHtml(bo) {
            bo.references = Array.isArray(bo.references) ? bo.references : [];
            const otherBos = state.governance.businessObjects.filter(b => b.id !== bo.id);
            return `<div class="bo-dhead"><span class="text-lg" aria-hidden="true">🔗</span><div><h3>Objets référencés</h3><div class="sub">Objets métier séparés liés à « ${escapeHTML(bo.name)} » (ex : un Emplacement référence un Site).</div></div></div>
            <div class="bo-sect">${bo.references.length ? `<div class="flex flex-wrap gap-1.5 mb-3">${bo.references.map((rf, i) => { const target = state.governance.businessObjects.find(b => b.id === rf.boId);
                return `<span class="text-xs bg-teal-50 border border-teal-200 text-teal-800 rounded-full px-2.5 py-1 inline-flex items-center gap-1.5">→ <strong>${escapeHTML(target ? target.name : '(objet supprimé)')}</strong> <span class="text-teal-500">${escapeHTML(rf.cardinality || '')}</span>${rf.viaLabel ? `<span class="text-teal-400 font-mono text-[10px]">${escapeHTML(rf.viaLabel)}</span>` : ''} <button onclick="removeBoReference('${bo.id}',${i})" class="text-teal-400 hover:text-red-500">✕</button></span>`; }).join('')}</div>` : '<p class="text-[12px] text-slate-500 italic mb-3">Aucune référence.</p>'}
                ${otherBos.length ? `<div class="bo-grid"><div class="bo-fld"><label>Référencer un objet</label><select id="bo-ref-tgt-${bo.id}">${otherBos.map(b => `<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')}</select></div>
                <div class="bo-fld"><label>Cardinalité</label><select id="bo-ref-card-${bo.id}">${CARD_OPTS.map(o => `<option ${o === 'N–1' ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
                <div class="bo-fld"><label>&nbsp;</label><button onclick="addBoReference('${bo.id}')" class="text-xs bg-teal-600 text-white px-3 py-2 rounded-lg font-bold w-full">+ Référence</button></div></div>` : '<p class="text-[12px] text-slate-500 italic">Créez un second objet métier pour pouvoir le référencer.</p>'}</div>`;
        }
        function renderBoDetail(bo, names) {
            // -- 1. Carte d'identité + complétude (V9.0) --
            let html = `<div class="border-2 border-emerald-200 rounded-xl bg-white overflow-hidden">
                <div class="bg-emerald-50/70 border-b border-emerald-100 p-4">
                    <div class="flex items-center gap-2 flex-wrap mb-3">
                        <span class="text-xl" aria-hidden="true">🏛️</span>
                        <input type="text" value="${escapeHTML(bo.name)}" onchange="updateBusinessObject('${bo.id}','name',this.value); renderGovernance()" class="font-black text-lg border border-slate-300 px-2.5 py-1.5 rounded-lg w-72 bg-white" aria-label="Nom de l'objet métier">
                        ${wfBadge(bo)}<select id="bo-status-${bo.id}" onchange="wfSetBoStatus('${bo.id}',this.value)" class="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-bold" aria-label="Statut">${STATUS_OPTS.map(o => `<option ${o === (bo.status || 'Brouillon') ? 'selected' : ''}>${o}</option>`).join('')}</select>
                        <button data-ro="keep" onclick="openBoAudit('${bo.id}')" class="ml-auto text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm" title="Auditer l'objet dans sa globalité : gouvernance, hiérarchies, qualité">🔎 Audit global</button>
                        <button onclick="removeBusinessObject('${bo.id}')" class="text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg border border-red-200 bg-white text-xs font-bold" title="Supprimer l'objet">🗑</button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div class="bo-fld"><label for="bo-own-${bo.id}">Propriétaire global</label><input id="bo-own-${bo.id}" type="text" list="govPeopleDL" ${govFeatureOn() && !govCanEditBo(bo) ? 'disabled title="Réservé au propriétaire" class="opacity-60 cursor-not-allowed"' : ''} value="${escapeHTML(bo.globalOwner || '')}" onchange="updateBusinessObject('${bo.id}','globalOwner',this.value); renderGovernance()" placeholder="ex : Direction immobilière ou une personne"><datalist id="govPeopleDL">${(typeof govPeople === 'function' ? govPeople() : []).map(p => `<option value="${escapeHTML(p.name)}"></option>`).join('')}</datalist>${typeof govFeatureOn === 'function' && govFeatureOn() && bo.globalOwner ? `<div class="hint">${(typeof govLinkOwner === 'function' && (govLinkOwner(bo), bo.ownerId)) ? '👑 personne reconnue : elle valide cet objet' : 'texte libre — saisissez le nom d\'une personne déclarée pour qu\'elle valide cet objet'}</div>` : (govFeatureOn() && !govCanEditBo(bo) ? govLockedHint() : '')}</div>
                        <div class="bo-fld"><label>Domaine métier <span class="font-normal text-slate-400">— qui valide</span></label>${govDomainSelectHtml(bo.domain || '', `updateBusinessObject('${bo.id}','domain',this.value); renderGovernance()`, 'bo-domain-' + bo.id, govFeatureOn() && !govCanEditBo(bo))}${govFeatureOn() && !govCanEditBo(bo) ? govLockedHint() : ''}</div>
                        <div class="bo-fld"><label for="bo-def-${bo.id}">Définition</label><textarea id="bo-def-${bo.id}" rows="2" onchange="updateBusinessObject('${bo.id}','definition',this.value); renderGovernance()" placeholder="Ce qu'est cet objet pour le métier, en une ou deux phrases." style="min-height:38px">${escapeHTML(bo.definition || '')}</textarea>${propBadgeHtml('bo', { boId: bo.id }, 'definition')}</div>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap mt-2 text-[11px] text-slate-500"><span class="font-bold">Contributeurs :</span><input type="text" value="${escapeHTML((bo.contributors || []).join(', '))}" onchange="updateBusinessObject('${bo.id}','contributors',this.value.split(',').map(x=>x.trim()).filter(Boolean))" placeholder="ex : DSI, BU Sud (virgules)" class="border border-slate-200 rounded-lg px-2 py-1 text-[11px] bg-white w-72">${govFeatureOn() ? `<span class="ml-auto text-[11px] ${govCanEditBo(bo) ? 'text-emerald-700' : (govCanProposeBo(bo) ? 'text-sky-700' : 'text-slate-500')} font-bold">${govCanEditBo(bo) ? (govIsOwnerOfBo(bo) ? '👑 vous êtes propriétaire de cet objet : vous validez' : '👑 vous validez ce domaine') : (govCanProposeBo(bo) ? '✍️ vos modifications seront des propositions (tout sauf propriétaire et domaine)' : '👁 lecture seule')}</span>` : ''}</div>
                    <div class="flex items-center gap-2 flex-wrap mt-3"><span class="text-[10px] uppercase font-bold text-indigo-600 whitespace-nowrap">📖 Termes de l'objet</span>${termTagsHtml('bo', { boId: bo.id })}</div>
                    ${typeof propActionsHtml === 'function' ? propActionsHtml(bo.id) : ''}
                    ${boCompletenessHtml(bo)}
                    <div id="bo-vol-${bo.id}" class="mt-3"></div>
                </div>`;

            // -- Sous-onglets : on n'affiche qu'une section à la fois pour une lecture claire --
            const tabs = [
                ['structure', '🧩 Attributs & composition', (bo.structure || []).length + (bo.elements || []).length],
                ['sources', '🔗 Sources', (bo.sources || []).length],
                ['hierarchies', '🌳 Hiérarchies', getBoHierarchies(bo).length],
                ['mastery', '⚖️ Maîtrise', ((bo.contextRules || {}).rules || []).length],
                ['usage', '🔌 Applis & usages', (state.governance.assets || []).length ? boAllAttrRows(bo).filter(r => !(r.el.usedBy || []).length).length || null : null],
                ['audit', '🔎 Audit', null],
            ];
            const cur = govState.boTab && tabs.some(t => t[0] === govState.boTab) ? govState.boTab : 'structure';
            html += `<div class="border-b border-slate-200 px-4 flex gap-1 flex-wrap bg-slate-50/60">`;
            tabs.forEach(([id, lbl, n]) => {
                const active = id === cur;
                html += `<button data-ro="keep" onclick="setBoTab('${id}')" class="px-3 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors ${active ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-600'}">${lbl}${n != null && n > 0 ? ` <span class="ml-0.5 text-[10px] ${active ? 'bo-tabn-on' : 'bg-slate-100 text-slate-500'} rounded-full px-1.5 py-0.5">${n}</span>` : ''}</button>`;
            });
            html += `</div><div class="p-4">`;

            if (cur === 'structure') html += renderBoWorkspace(bo, names);
            else if (cur === 'sources') html += renderBoSourcesBlock(bo, names);
            else if (cur === 'hierarchies') html += renderBoHierarchy(bo);
            else if (cur === 'mastery') html += renderBoContextRules(bo, names);
            else if (cur === 'usage') html += renderBoUsageMatrix(bo);
            else if (cur === 'audit') { const _qr = boQualityRules(bo);
                html += `<div class="text-center mb-3"><button onclick="auditBusinessObject('${bo.id}')" class="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-bold shadow-sm">🔎 Lancer l'audit global de l'objet</button><p class="text-[11px] text-slate-400 mt-1.5">Gouvernance (score), règles métier, <b>règles de qualité 📏</b>, hiérarchies et facettes 1–1.</p></div>`;
                html += `<div class="mb-3 border border-slate-200 rounded-lg p-2.5 bg-slate-50/60">
                    <div class="flex items-center gap-2 mb-1"><span class="text-[10px] uppercase font-bold text-slate-400">📏 Règles de qualité rattachées (${_qr.length})</span>
                    <button onclick="switchTab(12)" class="ml-auto text-[11px] text-indigo-600 font-bold hover:underline">Gérer dans « Règles &amp; score » →</button></div>
                    ${_qr.length ? '<div class="space-y-1">' + _qr.map(r => `<div class="text-xs flex items-center gap-2"><span class="font-bold text-slate-700">${escapeHTML(r.name)}</span><span class="text-[10px] text-slate-400">${QR_TYPES[r.type] || r.type}${r.bo === bo.id ? ' · sur l\'objet' : (r.table ? ' · ' + escapeHTML(r.table) : '')}${r.enabled === false ? ' · désactivée' : ''}</span>${r.last ? `<span class="ml-auto font-bold ${r.last.fails === 0 ? 'text-emerald-600' : 'text-amber-600'}">${Math.round(100 * r.last.rate)} %</span>` : '<span class="ml-auto text-[10px] text-slate-300">non exécutée</span>'}</div>`).join('') + '</div>' : '<p class="text-[11px] text-slate-400 italic">Aucune règle de qualité rattachée. Créez-en dans <b>📏 Règles &amp; score</b> en choisissant <b>cet objet métier</b> (ou une de ses tables) comme cible — elle apparaîtra ici et sera évaluée par l\'audit.</p>'}
                </div><div id="bo-global-audit-${bo.id}"></div>`; }

            html += '</div></div>';
            return html;
        }
        function setBoTab(tab) { govState.boTab = tab; renderGovernance(); }
        function openBoAudit(boId) { govState.boTab = 'audit'; renderGovernance(); requestAnimationFrame(() => auditBusinessObject(boId)); }

        // Sources & circulation : rôles + alertes MDM. Si des règles contextuelles existent, l'absence
        // de maître global n'est plus une anomalie (le maître dépend du contexte).
        function renderBoSourcesBlock(bo, names) {
            if (boSyncAppsFromSources()) persistAppState(); // les applis propriétaires des sources se rattachent seules
            const sources = bo.sources || [];
            const masters = sources.filter(s => s.role === 'maitre');
            const hasCtxRules = ((bo.contextRules || {}).rules || []).length > 0;
            let alert = '';
            if (sources.length && masters.length === 0 && !hasCtxRules) alert = '<span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">⚠️ Aucune source maître désignée</span>';
            else if (masters.length > 1 && !hasCtxRules) alert = `<span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">⚠️ ${masters.length} sources maîtres en conflit — utilisez les règles contextuelles ci-dessous ?</span>`;
            else if (hasCtxRules) alert = `<span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">⚖️ Maîtrise contextuelle active (${(bo.contextRules.rules || []).length} règle(s))</span>`;
            const chips = sources.map(s => {
                const roleColor = s.role === 'maitre' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : (s.role === 'contributeur' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-100 border-slate-300 text-slate-600');
                const ow = appOwnerOfSource(s.table);
                return `<span class="text-xs border rounded-full px-2.5 py-1 flex items-center gap-1.5 ${roleColor}"><strong>${escapeHTML(s.table)}</strong>
                    ${ow ? `<span class="text-[9px] opacity-70" title="Source produite par cette application (elle en est maître)">via 🖥 ${escapeHTML(ow.name)}</span>` : `<span class="text-[9px] text-amber-600" title="Cette source n'est rattachée à aucune application. Rattachez-la dans Applications & processus.">⚠ sans application</span>`}
                    <select onchange="updateBoSourceRole('${bo.id}','${escapeHTML(s.table.replace(/'/g, "\\'"))}',this.value)" class="bg-transparent text-xs font-bold border-0 cursor-pointer">${Object.keys(BO_ROLES).map(r => `<option value="${r}" ${r === s.role ? 'selected' : ''}>${BO_ROLES[r]}</option>`).join('')}</select>
                    <button onclick="removeBoSource('${bo.id}','${escapeHTML(s.table.replace(/'/g, "\\'"))}')" class="opacity-50 hover:opacity-100 hover:text-red-600">✕</button></span>`;
            }).join('');
            const _apps = (state.governance.assets || []).filter(a => a.kind === 'app');
            const reprSel = `<div class="flex items-center gap-1.5 mt-2 flex-wrap"><span class="text-[10px] uppercase font-bold text-slate-400">🏛️ Référentiel — représenté par l'application</span>
                <select onchange="updateBoApp('${bo.id}',this.value)" class="border border-slate-200 p-1 rounded text-xs bg-white"><option value="">— aucune (référentiel logique) —</option>${_apps.map(a => `<option value="${a.id}" ${bo.appId === a.id ? 'selected' : ''}>${escapeHTML(a.name)}</option>`).join('')}</select>
                <span class="text-[10px] text-slate-300">l'application qui matérialise/porte cet objet métier (ex. un MDM, un référentiel client)</span></div>`;
            const flow = masters.length && sources.some(s => s.role === 'destinataire')
                ? `<div class="text-xs text-slate-500 mt-2">Circulation : <strong class="text-emerald-700">${masters.map(m => escapeHTML(m.table)).join(', ')}</strong> → <strong>🏛️ ${escapeHTML(bo.name)}</strong> → <strong class="text-slate-600">${sources.filter(s => s.role === 'destinataire').map(s => escapeHTML(s.table)).join(', ')}</strong></div>` : '';
            return `<div class="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                <div class="flex items-center gap-2 mb-2 flex-wrap"><span class="text-[10px] uppercase font-bold text-slate-400">Sources & circulation de la donnée</span>${alert}</div>
                <div class="flex flex-wrap items-center gap-1.5">
                    ${chips || '<span class="text-xs text-slate-400 italic">Aucune source rattachée :</span>'}
                    <select id="bo-src-tbl-${bo.id}" class="border border-slate-200 p-1 rounded text-xs bg-white">${names.map(n => `<option>${escapeHTML(n)}</option>`).join('')}</select>
                    <select id="bo-src-role-${bo.id}" class="border border-slate-200 p-1 rounded text-xs bg-white">${Object.keys(BO_ROLES).map(r => `<option value="${r}">${BO_ROLES[r]}</option>`).join('')}</select>
                    <button onclick="addBoSource('${bo.id}')" class="text-xs bg-white border border-slate-300 px-2 py-1 rounded font-medium hover:bg-slate-50">Ajouter</button>
                </div>
                <div class="mt-2 space-y-1.5">
                    ${sources.map((s, si) => { const tb2 = tableByName(s.table); const hs = tb2 ? tb2.headers : [];
                        return `<div class="text-[11px]">
                        <span class="font-bold text-slate-500">${escapeHTML(s.table)}</span>
                        <button onclick="boSrcAddFilter('${bo.id}',${si})" class="text-[10px] bg-white border border-slate-300 rounded px-1.5 py-0.5 font-bold text-slate-500 hover:bg-slate-50 ml-1">+ filtre</button>
                        ${(s.filters || []).length ? '' : '<span class="text-slate-300 italic ml-1">objet = toutes les lignes de cette source</span>'}
                        ${(s.filters || []).map((f, fi) => { const dlId = `bofval-${bo.id}-${si}-${fi}`; return `<div class="flex items-center gap-1 mt-1 pl-4 flex-wrap">
                            ${fi === 0 ? '<span class="text-[10px] font-bold text-slate-400 w-8 text-center">Où</span>' : `<select onchange="boSrcSetFilter('${bo.id}',${si},${fi},'conn',this.value)" class="w-10 border rounded text-[10px] font-bold px-0.5 py-0.5 bg-white ${f.conn === 'OR' ? 'text-amber-700 border-amber-300' : 'text-indigo-700 border-indigo-300'}"><option value="AND" ${f.conn !== 'OR' ? 'selected' : ''}>ET</option><option value="OR" ${f.conn === 'OR' ? 'selected' : ''}>OU</option></select>`}
                            <select onchange="boSrcSetFilter('${bo.id}',${si},${fi},'col',this.value)" class="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white max-w-[140px]"><option value="">— col —</option>${hs.map(h => `<option value="${escapeHTML(h)}" ${f.col === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select>
                            <select onchange="boSrcSetFilter('${bo.id}',${si},${fi},'op',this.value)" class="border border-slate-300 rounded px-0.5 py-0.5 text-[11px] bg-white">${QUAL_FILTER_OPS.map(o => `<option value="${o.v}" ${o.v === f.op ? 'selected' : ''}>${o.t}</option>`).join('')}</select>
                            <input type="text" list="${dlId}" value="${escapeHTML(f.val || '')}" onfocus="tdFillDatalist('${dlId}','${escapeHTML(s.table.replace(/'/g, "\\'"))}','${escapeHTML(String(f.col || '').replace(/'/g, "\\'"))}')" oninput="boSrcSetFilter('${bo.id}',${si},${fi},'val',this.value)" class="w-28 border border-slate-300 rounded px-1 py-0.5 text-[11px] ${['empty', 'nempty'].includes(f.op) ? 'invisible' : ''}" placeholder="valeur">
                            <datalist id="${dlId}"></datalist>
                            <button onclick="boSrcDelFilter('${bo.id}',${si},${fi})" class="text-slate-300 hover:text-red-500 font-bold">✕</button>
                        </div>`; }).join('')}
                    </div>`; }).join('')}
                    ${sources.some(s => (s.filters || []).length) ? '<p class="text-[10px] text-slate-400">▼ L\'objet est un SOUS-ENSEMBLE filtré : la volumétrie, l\'audit de l\'objet et les contrôles de facettes appliquent ces conditions.</p>' : ''}
                </div>${flow}${reprSel}
                ${assetAttachHtml('bo', bo.id, 'producedBy', bo.producedBy, '🖥 Produite par')}
                ${assetAttachHtml('bo', bo.id, 'consumedBy', bo.consumedBy, '⚙️ Consommée par')}
                <div class="text-[10px] text-slate-400 mt-1">🔗 Rattachement <b>automatique</b> : les applications <b>propriétaires des sources</b> ci-dessus sont ajoutées seules (maître/contributeur → « Produite par », destinataire → « Consommée par »)${(bo.producedByAuto || []).length || (bo.consumedByAuto || []).length ? ' — actuellement ' + [...(bo.producedByAuto || []), ...(bo.consumedByAuto || [])].map(id => escapeHTML(((assetById(id) || {}).name) || '?')).join(', ') : ''}. Vos rattachements manuels sont conservés.</div>
                ${(() => { const att = [];
                    (state.governance.perimeters || []).forEach(p2 => { if ((p2.boIds || []).includes(bo.id)) att.push('🗂 ' + p2.name); });
                    (state.governance.glossary || []).forEach(g2 => { if ((g2.boIds || []).includes(bo.id)) att.push('📖 ' + g2.term); });
                    (state.governance.assets || []).forEach(u2 => { if ((u2.boIds || []).includes(bo.id)) att.push((u2.kind === 'process' ? '⚙️ ' : '🖥 ') + u2.name); });
                    return att.length ? `<div class="text-[11px] text-slate-500 mt-2"><span class="text-[10px] uppercase font-bold text-slate-400">Rattaché à :</span> ${att.map(escapeHTML).join(' · ')}</div>` : ''; })()}
            </div>`;
        }

        // ---- Hiérarchies déclarées sur l'objet métier ----
        // Un objet peut porter PLUSIEURS hiérarchies. Chaque niveau déclare ses PARENTS ADMIS
        // (matrice, pas un ordre strict : un LOCAL peut être rattaché à un NIVEAU, une AIRE ou un
        // BATIMENT). Une profondeur max optionnelle est contrôlée par l'audit.
        // Filtres déclarés sur UNE source d'un objet métier -> clause WHERE composée (ET/OU).
        function boSourceWhere(bo, tableName) {
            const src = (bo.sources || []).find(s2 => s2.table === tableName); if (!src) return '';
            const valid = (src.filters || []).filter(c => c.col && c.op && (['empty', 'nempty'].includes(c.op) || String(c.val || '').length));
            let sql = '';
            valid.forEach(c => { const f = qualCondSql(c); if (!f) return; sql = sql ? `(${sql}) ${c.conn === 'OR' ? 'OR' : 'AND'} ${f}` : f; });
            return sql;
        }
        function boSrcAddFilter(boId, si) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo || !bo.sources[si]) return; (bo.sources[si].filters = bo.sources[si].filters || []).push({ col: '', op: 'eq', val: '', conn: 'AND' }); persistAppState(); renderGovernance(); }
        function boSrcSetFilter(boId, si, fi, f, v) { const bo = state.governance.businessObjects.find(x => x.id === boId); const flt = bo && bo.sources[si] && (bo.sources[si].filters || [])[fi]; if (!flt) return; flt[f] = v; persistAppState(); if (f === 'op' || f === 'col') renderGovernance(); }
        function boSrcDelFilter(boId, si, fi) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo || !bo.sources[si]) return; bo.sources[si].filters.splice(fi, 1); persistAppState(); renderGovernance(); }
        function boMasterTable(bo) {
            const src = (bo.sources || []).find(s2 => s2.role === 'maitre') || (bo.sources || [])[0];
            return src ? tableByName(src.table) : null;
        }
        // Tables du périmètre d'un objet métier : maître + sources + composants/facettes (chargées).
        function boPerimeterTableNames(bo) {
            const s = new Set(); const t = boMasterTable(bo); if (t) s.add(t.name);
            (bo.sources || []).forEach(x => s.add(x.table));
            (bo.structure || []).forEach(x => s.add(x.table));
            return Array.from(s).filter(n => tableByName(n));
        }
        // Volumétrie GLOBALE de l'objet : compte les lignes de chaque table du périmètre + total.
        // Utilisée sur la fiche (visible en permanence) ET dans l'audit global.
        async function fillBoVolumetry(boId, containerId, opts) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const cont = el(containerId); if (!cont) return;
            const t = boMasterTable(bo);
            const names = boPerimeterTableNames(bo);
            if (!names.length) { cont.innerHTML = '<span class="text-[11px] text-slate-400 italic">Aucune source chargée — volumétrie indisponible.</span>'; return; }
            cont.innerHTML = '<span class="text-[11px] text-slate-400">📦 Comptage des lignes du périmètre…</span>';
            try {
                const { conn } = await getDB();
                const counts = [];
                for (const n of names) {
                    const tb = tableByName(n); if (!tb) continue;
                    const w = boSourceWhere(bo, n);
                    try { const res = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(tb.id))}${w ? ' WHERE ' + w : ''}`); counts.push({ name: n, n: Number(arrowResultToObjects(res)[0].n), master: t && n === t.name, filtered: !!w }); }
                    catch (e) { counts.push({ name: n, n: null, master: t && n === t.name }); }
                }
                const total = counts.reduce((a, c) => a + (c.n || 0), 0);
                cont.innerHTML = `<div class="flex flex-wrap gap-1.5 items-center">
                    <span class="text-[10px] uppercase font-bold text-slate-400 mr-0.5">📦 Volumétrie</span>
                    ${counts.map(c => `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-[11px] ${c.master ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-white border-slate-200 text-slate-600'}"><strong>${escapeHTML(c.name)}</strong>${c.master ? ' <span class="text-[8px] uppercase font-bold text-indigo-400">maître</span>' : ''}${c.filtered ? ' <span title="Filtres de l\'objet appliqués">▼</span>' : ''} : ${c.n == null ? '—' : c.n.toLocaleString('fr-FR')}</span>`).join('')}
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 bg-slate-800 text-white font-bold text-[11px]">Σ ${total.toLocaleString('fr-FR')} lignes</span>
                </div>${opts && opts.note ? '<p class="text-[10px] text-slate-400 mt-1.5">Le total additionne les lignes de toutes les tables de l\'objet ; le profilage porte, lui, sur la table <strong>maître</strong>.</p>' : ''}`;
            } catch (e) { cont.innerHTML = `<span class="text-[11px] text-red-600">Comptage impossible : ${escapeHTML(e.message)}</span>`; }
        }
        function getBoHierarchies(bo) {
            if (!Array.isArray(bo.hierarchies)) {
                bo.hierarchies = [];
                if (bo.hierarchy && bo.hierarchy.enabled) {
                    const old = bo.hierarchy;
                    bo.hierarchies.push({ id: 'bh_' + generateId(), name: 'Hiérarchie 1', mode: old.mode || 'self', childCol: old.childCol || '', parentKeyCol: old.parentKeyCol || '', linkTable: old.linkTable || '', linkChildCol: old.linkChildCol || '', linkParentCol: old.linkParentCol || '', typeCol: old.typeCol || '', maxDepth: '', levels: [] });
                    // ancien modèle : liste ordonnée -> parents admis = niveau précédent
                    (old.levels || []).forEach((lv, i) => bo.hierarchies[0].levels.push({ name: lv, parents: i > 0 ? [old.levels[i - 1]] : [] }));
                }
                delete bo.hierarchy;
            }
            bo.hierarchies.forEach(h => {
                h.levels = (h.levels || []).map(lv => typeof lv === 'string' ? { name: lv, parents: [] } : lv);
            });
            return bo.hierarchies;
        }
        // Pré-remplissage d'une hiérarchie depuis la détection MCD sur une table.
        function buildDetectedHierarchy(t) {
            if (!t) return null;
            const info = tableHierarchyInfo();
            const hi = info[t.id];
            if (!hi || (!hi.self && !hi.viaLinks.length)) return null;
            const h = { id: 'bh_' + generateId(), name: 'Hiérarchie 1', mode: 'self', childCol: '', parentKeyCol: '', linkTable: '', linkChildCol: '', linkParentCol: '', typeCol: '', maxDepth: '', levels: [] };
            if (hi.self) {
                const g = guessParentPointer(hi.self);
                h.childCol = g.childPtr; h.parentKeyCol = g.parentKey;
            } else {
                h.mode = 'link';
                const linkT = state.tables[hi.viaLinks[0].linkId];
                if (linkT) {
                    h.linkTable = linkT.name;
                    const rels = state.relations.filter(r => r.sourceCol && r.targetCol && ((r.sourceTable === linkT.id && r.targetTable === t.id) || (r.targetTable === linkT.id && r.sourceTable === t.id)));
                    if (rels.length >= 2) {
                        const linkCols = rels.map(r => r.sourceTable === linkT.id ? r.sourceCol : r.targetCol);
                        const keyCols = rels.map(r => r.sourceTable === t.id ? r.sourceCol : r.targetCol);
                        const gp = guessParentPointer({ sourceCol: linkCols[0], targetCol: linkCols[1] });
                        h.linkChildCol = gp.parentKey === linkCols[0] ? linkCols[1] : linkCols[0];
                        h.linkParentCol = gp.parentKey === linkCols[0] ? linkCols[0] : linkCols[1];
                        h.parentKeyCol = keyCols[0];
                    }
                }
            }
            const typeGuess = t.headers.find(c => /TYPE|NATURE|NIVEAU|CATEGORIE/i.test(c));
            if (typeGuess) h.typeCol = typeGuess;
            return h;
        }
        function findBoHier(boId, hierId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId);
            return { bo, h: bo ? getBoHierarchies(bo).find(x => x.id === hierId) : null };
        }

        function renderBoHierarchy(bo) {
            const hiers = getBoHierarchies(bo);
            const t = boMasterTable(bo);
            const detected = t ? isHierTable(tableHierarchyInfo(), t.id) : false;
            let html = `<div class="border border-emerald-200 rounded-lg p-3 bg-emerald-50/30">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                    <span class="text-[10px] uppercase font-bold text-emerald-800">🌳 Hiérarchies (${hiers.length})</span>
                    ${detected && !hiers.length ? '<span class="text-xs text-slate-500">Une hiérarchie est détectée dans le modèle de données — déclarez-la pour la gouverner.</span>' : ''}
                    <button onclick="addBoHierarchy('${bo.id}')" class="ml-auto text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold" ${t ? '' : 'disabled title="Rattachez d\'abord une source maître"'}>+ Hiérarchie ${detected && !hiers.length ? '(pré-remplie depuis le modèle de données)' : ''}</button>
                </div>`;
            hiers.forEach(h => { html += renderBoHierCard(bo, h, t); });
            return html + '</div>';
        }
        function renderBoHierCard(bo, h, t) {
            const headers = t ? t.headers : [];
            const colSel = (field, val, ph) => `<select onchange="updateBoHier('${bo.id}','${h.id}','${field}',this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="">${ph}</option>${headers.map(c => `<option ${val === c ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}</select>`;
            const lt = h.linkTable ? tableByName(h.linkTable) : null;
            const linkColSel = (field, val, ph) => `<select onchange="updateBoHier('${bo.id}','${h.id}','${field}',this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="">${ph}</option>${(lt ? lt.headers : []).map(c => `<option ${val === c ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}</select>`;
            const levels = h.levels || [];
            const levelRows = levels.map((lv, i) => {
                const others = levels.filter((x, j) => j !== i);
                return `<div class="flex items-center gap-2 flex-wrap bg-white border border-emerald-100 rounded p-1.5 mb-1">
                    <span class="text-xs font-black text-emerald-800 w-28 truncate">${escapeHTML(lv.name)}</span>
                    <span class="text-[9px] uppercase font-bold text-slate-400">parents admis :</span>
                    ${others.map(o => `<label class="text-[10px] border rounded px-1.5 py-0.5 cursor-pointer ${(lv.parents || []).includes(o.name) ? 'bg-emerald-100 border-emerald-300 text-emerald-800 font-bold' : 'bg-white border-slate-200 text-slate-400'}"><input type="checkbox" class="hidden" ${(lv.parents || []).includes(o.name) ? 'checked' : ''} onchange="toggleBoHierLevelParent('${bo.id}','${h.id}',${i},'${escapeHTML(o.name.replace(/'/g, "\\'"))}',this.checked)">${escapeHTML(o.name)}</label>`).join('')}
                    ${!(lv.parents || []).length ? '<span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">racine</span>' : ''}
                    <button onclick="removeBoHierLevel('${bo.id}','${h.id}',${i})" class="ml-auto text-emerald-200 hover:text-red-500">✕</button>
                </div>`;
            }).join('');
            return `<div class="border-2 border-emerald-300 rounded-lg p-3 bg-emerald-50/40 mb-2">
                <div class="flex items-center gap-2 flex-wrap mb-2">
                    <input type="text" value="${escapeHTML(h.name)}" onchange="updateBoHier('${bo.id}','${h.id}','name',this.value)" class="font-bold text-xs border border-emerald-300 p-1.5 rounded w-40 bg-white">
                    <label class="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="bohm-${h.id}" ${h.mode !== 'link' ? 'checked' : ''} onchange="updateBoHier('${bo.id}','${h.id}','mode','self')" class="text-emerald-600"> parent dans la même table</label>
                    <label class="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="bohm-${h.id}" ${h.mode === 'link' ? 'checked' : ''} onchange="updateBoHier('${bo.id}','${h.id}','mode','link')" class="text-emerald-600"> via table de liaison</label>
                    <label class="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 ml-2">Profondeur max <input type="number" min="1" max="50" value="${escapeHTML(String(h.maxDepth || ''))}" onchange="updateBoHier('${bo.id}','${h.id}','maxDepth',this.value)" placeholder="—" class="border border-slate-300 p-1 rounded text-xs w-14 bg-white"></label>
                    <button onclick="removeBoHierarchy('${bo.id}','${h.id}')" class="ml-auto text-xs text-red-400 hover:text-red-600">🗑</button>
                </div>
                ${h.mode === 'link' ? `
                <div class="flex flex-wrap items-end gap-2 mb-2 text-xs">
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Table de liaison</label><select onchange="updateBoHier('${bo.id}','${h.id}','linkTable',this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="">choisir...</option>${readyTableNames().map(n => `<option ${h.linkTable === n ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('')}</select></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Col. enfant (liaison)</label>${linkColSel('linkChildCol', h.linkChildCol, 'enfant...')}</div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Col. parent (liaison)</label>${linkColSel('linkParentCol', h.linkParentCol, 'parent...')}</div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Clé de la table maître</label>${colSel('parentKeyCol', h.parentKeyCol, 'clé...')}</div>
                </div>` : `
                <div class="flex flex-wrap items-end gap-2 mb-2 text-xs">
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Colonne pointant vers le parent</label>${colSel('childCol', h.childCol, 'ex: DK_CODE_PARENT')}</div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Colonne clé (référencée)</label>${colSel('parentKeyCol', h.parentKeyCol, 'ex: DK_CODE')}</div>
                </div>`}
                <div class="border-t border-emerald-100 pt-2 mt-1">
                    <div class="flex flex-wrap items-end gap-2 mb-1.5">
                        <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Colonne de type (niveaux)</label>${colSel('typeCol', h.typeCol, '— aucune —')}</div>
                        ${h.typeCol ? `<div><label class="text-[9px] uppercase font-bold text-slate-400 block">Ajouter un niveau</label>
                        <input type="text" id="bo-hier-lvl-${h.id}" list="bo-hier-lvls-${h.id}" class="border border-slate-300 p-1.5 rounded text-xs w-32" placeholder="ex: SITE"><datalist id="bo-hier-lvls-${h.id}"></datalist></div>
                        <button onclick="addBoHierLevel('${bo.id}','${h.id}')" class="text-xs bg-white border border-emerald-300 text-emerald-700 px-2 py-1 rounded font-bold">+ Niveau</button>` : ''}
                    </div>
                    ${levelRows || (h.typeCol ? '<p class="text-[10px] text-slate-400 mb-1.5">Déclarez les niveaux, puis cochez pour chacun ses parents admis (plusieurs possibles : un LOCAL peut dépendre d\'un NIVEAU, d\'une AIRE ou d\'un BATIMENT). Aucun parent coché = niveau racine.</p>' : '')}
                    <button onclick="auditBoHierarchy('${bo.id}','${h.id}')" class="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold">🔎 Auditer l'arbre sur les données</button>
                    <div id="bo-hier-audit-${h.id}" class="mt-2"></div>
                </div>
            </div>`;
        }
        function addBoHierarchy(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const t = boMasterTable(bo); if (!t) return;
            const hiers = getBoHierarchies(bo);
            const detected = !hiers.length ? buildDetectedHierarchy(t) : null;
            hiers.push(detected || { id: 'bh_' + generateId(), name: 'Hiérarchie ' + (hiers.length + 1), mode: 'self', childCol: '', parentKeyCol: '', linkTable: '', linkChildCol: '', linkParentCol: '', typeCol: '', maxDepth: '', levels: [] });
            persistAppState(); renderGovernance();
        }
        function removeBoHierarchy(boId, hierId) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return; bo.hierarchies = getBoHierarchies(bo).filter(x => x.id !== hierId); persistAppState(); renderGovernance(); }
        function updateBoHier(boId, hierId, f, v) { const { h } = findBoHier(boId, hierId); if (!h) return; h[f] = v; persistAppState(); renderGovernance(); }
        function addBoHierLevel(boId, hierId) {
            const { h } = findBoHier(boId, hierId); if (!h) return;
            const inp = el('bo-hier-lvl-' + hierId); const v = inp ? inp.value.trim() : '';
            if (!v) return showError('Saisissez la valeur du niveau (ex : SITE).');
            if (h.levels.some(l => l.name.toUpperCase() === v.toUpperCase())) return showError('Ce niveau existe déjà.');
            h.levels.push({ name: v, parents: h.levels.length ? [h.levels[h.levels.length - 1].name] : [] });
            persistAppState(); renderGovernance();
        }
        function removeBoHierLevel(boId, hierId, i) { const { h } = findBoHier(boId, hierId); if (!h) return; const removed = h.levels.splice(i, 1)[0]; h.levels.forEach(l => l.parents = (l.parents || []).filter(p => p !== removed.name)); persistAppState(); renderGovernance(); }
        function toggleBoHierLevelParent(boId, hierId, i, parentName, checked) {
            const { h } = findBoHier(boId, hierId); if (!h || !h.levels[i]) return;
            const lv = h.levels[i]; lv.parents = lv.parents || [];
            if (checked) { if (!lv.parents.includes(parentName)) lv.parents.push(parentName); }
            else lv.parents = lv.parents.filter(p => p !== parentName);
            persistAppState(); renderGovernance();
        }
        async function fillBoHierLevelValues(boId, hierId) {
            const { bo, h } = findBoHier(boId, hierId); if (!bo || !h || !h.typeCol) return;
            const t = boMasterTable(bo); const list = el('bo-hier-lvls-' + hierId);
            if (!t || t.status !== 'ready' || !list) return;
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(h.typeCol)} AS VARCHAR))`;
                const res = await conn.query(`SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(t.id))} WHERE ${sqlIdent(h.typeCol)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 20`);
                list.innerHTML = arrowResultToObjects(res).map(r => `<option value="${escapeHTML(r.v)}">`).join('');
            } catch (e) {}
        }

        // Audit d'une hiérarchie : racines, orphelins, auto-boucles, violations de PARENTS ADMIS
        // (matrice), types hors niveaux, et profondeur (si maxDepth déclarée, mode interne).
        async function auditBoHierarchy(boId, hierId) {
            const { bo, h } = findBoHier(boId, hierId); if (!bo || !h) return;
            const t = boMasterTable(bo);
            const out = el('bo-hier-audit-' + hierId); if (!out || !t) return;
            out.innerHTML = '<p class="text-xs text-emerald-700">Audit de l\'arbre...</p>';
            const norm = (a, c) => `NULLIF(UPPER(TRIM(CAST(${a}.${sqlIdent(c)} AS VARCHAR))), '')`;
            try {
                const { conn } = await getDB();
                const T = sqlIdent(duckTableName(t.id));
                let childExpr, parentJoinSql;
                if (h.mode === 'link') {
                    const lt = tableByName(h.linkTable);
                    if (!lt || !h.linkChildCol || !h.linkParentCol || !h.parentKeyCol) throw new Error('Configuration de la table de liaison incomplète.');
                    const L = sqlIdent(duckTableName(lt.id));
                    parentJoinSql = `FROM ${T} c
                        LEFT JOIN ${L} l ON ${norm('l', h.linkChildCol)} = ${norm('c', h.parentKeyCol)}
                        LEFT JOIN ${T} p ON ${norm('p', h.parentKeyCol)} = ${norm('l', h.linkParentCol)}`;
                    childExpr = `${norm('l', h.linkParentCol)}`;
                } else {
                    if (!h.childCol || !h.parentKeyCol) throw new Error('Indiquez la colonne parent et la colonne clé.');
                    parentJoinSql = `FROM ${T} c LEFT JOIN ${T} p ON ${norm('p', h.parentKeyCol)} = ${norm('c', h.childCol)}`;
                    childExpr = `${norm('c', h.childCol)}`;
                }
                const levels = (h.levels || []);
                const typeU = a => `UPPER(TRIM(CAST(${a}.${sqlIdent(h.typeCol)} AS VARCHAR)))`;
                // Violation de parents admis : le type du parent n'est pas dans la liste du type enfant
                // (liste vide = le niveau doit être racine).
                let violExpr = 'FALSE';
                if (h.typeCol && levels.length) {
                    const cases = levels.map(lv => {
                        const allowed = (lv.parents || []).map(p => sqlLiteral(p.toUpperCase()));
                        return allowed.length
                            ? `(${typeU('c')} = ${sqlLiteral(lv.name.toUpperCase())} AND ${norm('p', h.parentKeyCol)} IS NOT NULL AND (${typeU('p')} IS NULL OR ${typeU('p')} NOT IN (${allowed.join(', ')})))`
                            : `(${typeU('c')} = ${sqlLiteral(lv.name.toUpperCase())} AND ${norm('p', h.parentKeyCol)} IS NOT NULL)`;
                    });
                    violExpr = cases.join(' OR ');
                }
                const knownLevels = levels.map(lv => sqlLiteral(lv.name.toUpperCase()));
                const unknownExpr = h.typeCol && levels.length ? `(${typeU('c')} IS NOT NULL AND ${typeU('c')} NOT IN (${knownLevels.join(', ')}))` : 'FALSE';
                const res = await conn.query(`
                    SELECT COUNT(*)::BIGINT AS total,
                        SUM(CASE WHEN ${childExpr} IS NULL THEN 1 ELSE 0 END)::BIGINT AS roots,
                        SUM(CASE WHEN ${childExpr} IS NOT NULL AND ${norm('p', h.parentKeyCol)} IS NULL THEN 1 ELSE 0 END)::BIGINT AS orphans,
                        SUM(CASE WHEN ${childExpr} = ${norm('c', h.parentKeyCol)} THEN 1 ELSE 0 END)::BIGINT AS selfloops,
                        SUM(CASE WHEN ${violExpr} THEN 1 ELSE 0 END)::BIGINT AS lvlviol,
                        SUM(CASE WHEN ${unknownExpr} THEN 1 ELSE 0 END)::BIGINT AS unknowntypes
                    ${parentJoinSql}
                `);
                const r = arrowResultToObjects(res)[0];
                // Profondeur : parcours récursif borné depuis les racines (mode interne uniquement).
                let depthHtml = '';
                const maxD = parseInt(h.maxDepth);
                if (maxD > 0 && h.mode !== 'link') {
                    const cap = maxD + 3;
                    const dres = await conn.query(`
                        WITH RECURSIVE walk AS (
                            SELECT ${norm('c', h.parentKeyCol)} AS k, 1 AS d FROM ${T} c WHERE ${norm('c', h.childCol)} IS NULL
                            UNION ALL
                            SELECT ${norm('c', h.parentKeyCol)}, w.d + 1 FROM ${T} c JOIN walk w ON ${norm('c', h.childCol)} = w.k WHERE w.d <= ${cap}
                        )
                        SELECT COALESCE(MAX(d), 0)::BIGINT AS maxd, SUM(CASE WHEN d > ${maxD} THEN 1 ELSE 0 END)::BIGINT AS beyond FROM walk
                    `);
                    const dr = arrowResultToObjects(dres)[0];
                    const beyond = Number(dr.beyond);
                    depthHtml = `<div class="p-2 border rounded-lg ${beyond > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}"><div class="text-sm font-black ${beyond > 0 ? 'text-red-600' : 'text-slate-700'}">${Number(dr.maxd)}${Number(dr.maxd) > cap - 1 ? '+' : ''} / ${maxD}</div><div class="text-[9px] uppercase font-bold text-slate-400">profondeur max (${beyond.toLocaleString('fr-FR')} au-delà)</div></div>`;
                }
                const tile = (lbl, v, bad) => `<div class="p-2 border rounded-lg ${Number(v) > 0 && bad ? 'bg-red-50 border-red-200' : 'bg-white'}"><div class="text-sm font-black ${Number(v) > 0 && bad ? 'text-red-600' : 'text-slate-700'}">${Number(v).toLocaleString('fr-FR')}</div><div class="text-[9px] uppercase font-bold text-slate-400">${lbl}</div></div>`;
                // Consultation / export des lignes en défaut : une requête par anomalie détectée.
                const rowSel = pred => `SELECT DISTINCT c.* EXCLUDE (__rn) FROM ${parentJoinSql.replace(/^FROM /, '')} WHERE ${pred}`;
                const hierInspect = [];
                if (Number(r.orphans) > 0) hierInspect.push({ lbl: 'orphelins', sql: rowSel(`${childExpr} IS NOT NULL AND ${norm('p', h.parentKeyCol)} IS NULL`) });
                if (Number(r.selfloops) > 0) hierInspect.push({ lbl: 'auto-boucles', sql: rowSel(`${childExpr} = ${norm('c', h.parentKeyCol)}`) });
                if (Number(r.lvlviol) > 0) hierInspect.push({ lbl: 'parents non admis', sql: rowSel(violExpr) });
                if (Number(r.unknowntypes) > 0) hierInspect.push({ lbl: 'types hors niveaux', sql: rowSel(unknownExpr) });
                if (depthHtml.includes('bg-red-50') && maxD > 0 && h.mode !== 'link') { // des lignes dépassent la profondeur max
                    const cap = maxD + 3;
                    hierInspect.push({ lbl: 'au-delà de la profondeur max', sql: `WITH RECURSIVE walk AS (
                            SELECT ${norm('c', h.parentKeyCol)} AS k, 1 AS d FROM ${T} c WHERE ${norm('c', h.childCol)} IS NULL
                            UNION ALL
                            SELECT ${norm('c', h.parentKeyCol)}, w.d + 1 FROM ${T} c JOIN walk w ON ${norm('c', h.childCol)} = w.k WHERE w.d <= ${cap}
                        ) SELECT c.* EXCLUDE (__rn) FROM ${T} c JOIN (SELECT k, MIN(d) AS d FROM walk WHERE k IS NOT NULL GROUP BY 1) w ON ${norm('c', h.parentKeyCol)} = w.k WHERE w.d > ${maxD}` });
                }
                const hierName = h.name || 'hiérarchie';
                const inspectRow = hierInspect.length
                    ? `<div class="flex items-center gap-2 flex-wrap mt-1.5 text-[10px]">${hierInspect.map(x => `<span class="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"><strong class="text-amber-800">${escapeHTML(x.lbl)}</strong>${qualInspectButtons(registerQualInspect(`Hiérarchie ${hierName} — ${x.lbl}`, x.sql))}</span>`).join('')}</div>`
                    : '';
                out.innerHTML = `<div class="grid grid-cols-3 md:grid-cols-7 gap-2">
                    ${tile('lignes', r.total, false)}
                    ${tile('racines', r.roots, false)}
                    ${tile('orphelins (parent inexistant)', r.orphans, true)}
                    ${tile('auto-boucles', r.selfloops, true)}
                    ${tile('parents non admis', r.lvlviol, true)}
                    ${tile('types hors niveaux', r.unknowntypes, true)}
                    ${depthHtml}
                </div>
                ${inspectRow}
                ${levels.length ? `<p class="text-[10px] text-slate-400 mt-1.5">Parents admis : ${levels.map(lv => `${escapeHTML(lv.name)} ← {${(lv.parents || []).map(escapeHTML).join(', ') || 'racine'}}`).join(' · ')}</p>` : ''}`;
                return r;
            } catch (e) { out.innerHTML = `<p class="text-xs text-red-600">Audit impossible : ${escapeHTML(e.message)}</p>`; return null; }
        }

        // ---- Audit GLOBAL d'un objet métier : gouvernance + hiérarchies + règles métier ----
        async function auditBusinessObject(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const out = el('bo-global-audit-' + boId); if (!out) return;
            out.innerHTML = '<p class="text-xs text-indigo-700">Audit global en cours...</p>';
            const t = boMasterTable(bo);
            const g = state.governance;
            // 1. Check-list de gouvernance
            const hasCtxRules = ((bo.contextRules || {}).rules || []).length > 0;
            const masters = (bo.sources || []).filter(s2 => s2.role === 'maitre');
            const dictEntry = t ? (g.dictionary[t.name] || {}) : {};
            const checks = [
                ['Propriétaire global nommé', !!bo.globalOwner],
                ['Définition renseignée', !!(bo.definition || '').trim()],
                ['Source maître désignée (ou maîtrise contextuelle)', masters.length === 1 || hasCtxRules],
                ['Pas de conflit de maîtres', masters.length <= 1 || hasCtxRules],
                ['Au moins un attribut décrit', (bo.elements || []).length > 0],
                ['Fiche dictionnaire de la source maître validée', dictEntry.status === 'Validé'],
                ['Rattaché à un périmètre métier', g.perimeters.some(p => (p.boIds || []).includes(bo.id) || (t && (p.tables || []).includes(t.name)))],
                ['Utilisé par au moins une application ou un processus', ((g.assets || []).some(a2 => (a2.boIds || []).includes(bo.id) || (t && ((a2.tables || []).includes(t.name) || (a2.columns || []).some(c => c.table === t.name)))) || (bo.consumedBy || []).length > 0 || (bo.elements || []).some(e2 => (e2.usedBy || []).length > 0))],
            ];
            const passed = checks.filter(c => c[1]).length;
            const score = Math.round((passed / checks.length) * 100);
            // Périmètre de l'objet (maître + composants/facettes + sources) — sert à la volumétrie et aux règles.
            const objTables = new Set();
            if (t) objTables.add(t.name);
            (bo.sources || []).forEach(s2 => objTables.add(s2.table));
            (bo.structure || []).forEach(s2 => objTables.add(s2.table));
            const perimTables = Array.from(objTables).filter(n => tableByName(n));
            let html = `<div class="border-2 border-indigo-200 rounded-xl p-4 bg-white mt-2">
                <div class="flex items-center gap-3 mb-3">
                    <div class="text-2xl font-black ${score >= 80 ? 'text-emerald-600' : (score >= 50 ? 'text-amber-600' : 'text-red-600')}">${score}%</div>
                    <div class="text-xs font-bold text-slate-600">Score de gouvernance de "${escapeHTML(bo.name)}" (${passed}/${checks.length})</div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-1 mb-3">${checks.map(([lbl, ok]) => `<div class="text-xs ${ok ? 'text-emerald-700' : 'text-red-600'}">${ok ? '✅' : '❌'} ${lbl}</div>`).join('')}</div>`;
            // Volumétrie GLOBALE du périmètre : un objet métier couvre plusieurs tables, chacune avec son
            // propre volume — on montre le compte par table + le total, au lieu du seul fichier maître.
            if (perimTables.length) {
                html += `<div class="text-[10px] uppercase font-bold text-slate-400 mb-1 mt-2">📦 Volumétrie du périmètre (${perimTables.length} table${perimTables.length > 1 ? 's' : ''})</div>
                    <div id="bo-volume-${boId}" class="border border-slate-200 rounded-lg p-2 bg-slate-50/50 text-xs text-slate-400">Comptage des lignes…</div>`;
            }
            // 2. Hiérarchies : conteneurs propres à l'audit (indépendants de l'onglet Hiérarchies)
            const hiers = getBoHierarchies(bo);
            if (hiers.length) {
                html += `<div class="text-[10px] uppercase font-bold text-slate-400 mb-1 mt-2">🌳 Hiérarchies (${hiers.length})</div>` + hiers.map(h => `<div class="mb-2"><div class="text-[11px] font-bold text-slate-600 mb-1">${escapeHTML(h.name || 'Hiérarchie')}${h.maxDepth ? ` <span class="text-slate-400 font-medium">(profondeur max ${h.maxDepth})</span>` : ''}</div><div id="bo-hier-audit-${h.id}"></div></div>`).join('');
            }
            // 3. Règles métier touchant TOUT le périmètre de l'objet (maître + composants + sources)
            const rules = (g.rules || []).filter(r => objTables.has(r.parentTable) || objTables.has(r.childTable));
            if (rules.length) {
                html += `<div class="text-[10px] uppercase font-bold text-slate-400 mb-1 mt-2">⚖️ Règles métier du périmètre (${rules.length}) <span class="normal-case font-medium text-slate-300">— ${Array.from(objTables).map(escapeHTML).join(', ')}</span></div><div id="bo-rules-results-${boId}" class="space-y-1"><p class="text-xs text-slate-400">Exécution...</p></div>`;
            }
            // 3bis. Règles de QUALITÉ (📏 Règles & score) rattachées à l'objet ou à ses tables.
            const qRules = boQualityRules(bo).filter(r => r.enabled !== false);
            if (qRules.length) {
                html += `<div class="text-[10px] uppercase font-bold text-slate-400 mb-1 mt-2">📏 Règles de qualité (${qRules.length})</div><div id="bo-qr-results-${boId}" class="space-y-1"><p class="text-xs text-slate-400">Exécution...</p></div>`;
            }
            // 4. Cardinalité des facettes 1–1 (ex : exactement UNE adresse principale)
            const facets11 = getBoFacets(bo).filter(st => st.cardinality === '1–1');
            if (facets11.length) {
                html += `<div class="text-[10px] uppercase font-bold text-slate-400 mb-1 mt-2">🎭 Facettes 1–1 (${facets11.length})</div><div id="bo-facets-results-${boId}" class="space-y-1"><p class="text-xs text-slate-400">Vérification...</p></div>`;
            }
            html += '</div>';
            out.innerHTML = html;
            // Exécutions asynchrones — SOUS runNoSpill : mémoire relevée + débordement disque coupé, si
            // bien que les agrégations d'audit sur de grosses sources (volumétrie, règles, facettes) ne
            // tentent plus d'écrire un fichier temporaire (impossible en file://) et aboutissent toujours.
            const { conn: __auditConn } = await getDB();
            await runNoSpill(__auditConn, async () => {
            // Volumétrie du périmètre (fonction partagée avec la fiche objet).
            if (perimTables.length) await fillBoVolumetry(boId, 'bo-volume-' + boId, { note: true });
            for (const h of hiers) { try { await auditBoHierarchy(boId, h.id); } catch (e) {} }
            if (rules.length) {
                const rout = el('bo-rules-results-' + boId);
                const parts = [];
                for (const rule of rules) {
                    try {
                        const res = await auditBusinessRule(rule);
                        let insp = '';
                        if (res.viol > 0) { const vs = bizRuleViolRowsSql(rule); if (vs) insp = qualInspectButtons(registerQualInspect(`Règle : ${bizRuleLabel(rule)}`, vs)); }
                        parts.push(`<div class="text-xs ${res.viol > 0 ? 'text-red-600' : 'text-emerald-700'}">${res.viol > 0 ? '❌' : '✅'} ${escapeHTML(bizRuleLabel(rule))} — ${res.viol.toLocaleString('fr-FR')} violation(s) sur ${res.total.toLocaleString('fr-FR')} ${escapeHTML(rule.parentTable)}${res.examples.length ? ` <span class="text-slate-400">(ex : ${res.examples.map(escapeHTML).join(', ')})</span>` : ''}${insp}</div>`);
                    } catch (e) { parts.push(`<div class="text-xs text-red-600">⚠️ Règle inexécutable : ${escapeHTML(e.message)}</div>`); }
                }
                if (rout) rout.innerHTML = parts.join('');
            }
            // Règles de qualité (📏) : chacune est exécutée sur ses tables/colonnes réelles (résolues
            // via les correspondances pour une règle « objet ») et son taux de conformité est stocké.
            if (qRules.length) {
                const qout = el('bo-qr-results-' + boId); const qparts = [];
                for (const r of qRules) {
                    try {
                        const ev = await qrEvalRule(r, __auditConn);
                        if (!ev.ran) { qparts.push(`<div class="text-xs text-slate-400">➖ ${escapeHTML(r.name)} — non applicable (colonne/table non résolue)</div>`); continue; }
                        const rate = Math.round(100 * ev.rate); const bad = ev.fails > 0;
                        let insp = ''; if (bad) { const vs = qrInspectSql(r); if (vs) insp = qualInspectButtons(registerQualInspect(`Règle qualité : ${r.name}`, vs, qrExplainHtml(r))); }
                        qparts.push(`<div class="text-xs ${bad ? 'text-red-600' : 'text-emerald-700'}">${bad ? '❌' : '✅'} ${escapeHTML(r.name)} <span class="text-slate-400">(${QR_TYPES[r.type] || r.type}${r.bo === bo.id ? ' · sur l\'objet' : (r.table ? ' · ' + escapeHTML(r.table) : '')})</span> — ${bad ? `${ev.fails.toLocaleString('fr-FR')} échec(s) sur ${ev.total.toLocaleString('fr-FR')} (${rate} %)` : `conforme (${ev.total.toLocaleString('fr-FR')} lignes)`}${insp}</div>`);
                    } catch (e) { qparts.push(`<div class="text-xs text-red-600">⚠️ ${escapeHTML(r.name)} : ${escapeHTML(e.message)}</div>`); }
                }
                if (qout) qout.innerHTML = qparts.join('') || '<p class="text-xs text-slate-400">Aucune règle applicable.</p>';
                persistAppState();
            }
            // Facettes 1–1 : contrôle réel + consultation/export des lignes maîtres en défaut
            const fout = el('bo-facets-results-' + boId);
            if (fout) {
                const fparts = [];
                for (const st of getBoFacets(bo).filter(x => x.cardinality === '1–1')) {
                    try {
                        const fr = await auditFacetCardinality(bo, st);
                        const bad = fr.missing + fr.multi;
                        let insp = '';
                        if (bad > 0) { const vs = facetViolRowsSql(bo, st); if (vs) insp = qualInspectButtons(registerQualInspect(`Facette 1–1 : ${st.name}`, vs)); }
                        const appLbl = (st.applies || []).length ? ` <span class="text-purple-600">[si ${(st.applies || []).map(facetScopeLabel).map(escapeHTML).join(' et ')}]</span>` : '';
                        fparts.push(`<div class="text-xs ${bad > 0 ? 'text-red-600' : 'text-emerald-700'}">${bad > 0 ? '❌' : '✅'} ${escapeHTML(st.name)}${appLbl} — ${bad > 0 ? `${fr.missing.toLocaleString('fr-FR')} sans, ${fr.multi.toLocaleString('fr-FR')} avec plusieurs (sur ${fr.total.toLocaleString('fr-FR')} concernés)${fr.examples.length ? ` <span class="text-slate-400">(ex : ${fr.examples.map(x => escapeHTML(String(x))).join(', ')})</span>` : ''}` : `exactement 1 pour chacun des ${fr.total.toLocaleString('fr-FR')} concernés`}${insp}</div>`);
                    } catch (e) { fparts.push(`<div class="text-xs text-amber-700">⚠️ ${escapeHTML(st.name)} : non vérifiable — ${escapeHTML(e.message)}</div>`); }
                }
                fout.innerHTML = fparts.join('');
            }
            });
        }

        // ---- Règles métier de cardinalité conditionnelle (définies dans le modèle de données) ----
        // Ex : "1 emplacement doit avoir EXACTEMENT 1 accès de type GENERAL". Chaque règle relie un
        // parent à ses enfants via une relation du modèle de données, avec condition optionnelle sur les enfants et
        // une attente de cardinalité — exécutée dans l'audit qualité et l'audit global d'objet.
        function bizRuleLabel(r) {
            const expectTxt = r.expect === '<=' ? 'au plus' : (r.expect === '>=' ? 'au moins' : 'exactement');
            return r.label || `1 ${r.parentTable} doit avoir ${expectTxt} ${r.n} ${r.childTable}${r.cond ? ` [${r.cond.col} ${SCOPE_OPS[r.cond.op] || r.cond.op} "${r.cond.val}"]` : ''}`;
        }
        async function auditBusinessRule(rule) {
            const { conn } = await getDB();
            const pT = tableByName(rule.parentTable), cT = tableByName(rule.childTable);
            if (!pT || !cT) throw new Error(`Tables de la règle non chargées (${rule.parentTable} / ${rule.childTable}).`);
            const norm = (a, c) => `NULLIF(UPPER(TRIM(CAST(${a}.${sqlIdent(c)} AS VARCHAR))), '')`;
            const condSql = rule.cond && rule.cond.col ? ' AND ' + scopeCondSql(rule.cond).replaceAll(sqlIdent(rule.cond.col), 'x.' + sqlIdent(rule.cond.col)) : '';
            const opSql = rule.expect === '<=' ? '<=' : (rule.expect === '>=' ? '>=' : '=');
            const res = await conn.query(`
                WITH par AS (SELECT DISTINCT ${norm('p', rule.parentCol)} AS k, MIN(TRIM(CAST(p.${sqlIdent(rule.parentCol)} AS VARCHAR))) AS disp FROM ${sqlIdent(duckTableName(pT.id))} p WHERE ${norm('p', rule.parentCol)} IS NOT NULL GROUP BY 1),
                cnt AS (SELECT ${norm('x', rule.childCol)} AS k, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(cT.id))} x WHERE ${norm('x', rule.childCol)} IS NOT NULL ${condSql} GROUP BY 1)
                SELECT (SELECT COUNT(*) FROM par)::BIGINT AS total,
                       SUM(CASE WHEN NOT (COALESCE(cnt.c, 0) ${opSql} ${parseInt(rule.n) || 1}) THEN 1 ELSE 0 END)::BIGINT AS viol,
                       list(CASE WHEN NOT (COALESCE(cnt.c, 0) ${opSql} ${parseInt(rule.n) || 1}) THEN par.disp END) FILTER (WHERE NOT (COALESCE(cnt.c, 0) ${opSql} ${parseInt(rule.n) || 1})) AS exs
                FROM par LEFT JOIN cnt ON par.k = cnt.k
            `);
            const r = arrowResultToObjects(res)[0];
            const exs = (Array.isArray(r.exs) ? r.exs : (r.exs && r.exs.toArray ? r.exs.toArray() : [])).filter(Boolean).slice(0, 5);
            return { total: Number(r.total), viol: Number(r.viol || 0), examples: exs };
        }
        function renderBizRules() {
            const cont = el('bizRulesList'); if (!cont) return;
            const rules = state.governance.rules || [];
            const validRels = state.relations.filter(r => r.sourceCol && r.targetCol && state.tables[r.sourceTable] && state.tables[r.targetTable]);
            el('bizRuleRel').innerHTML = validRels.map(r => `<option value="${r.id}">${escapeHTML(state.tables[r.sourceTable].name)}.${escapeHTML(r.sourceCol)} ↔ ${escapeHTML(state.tables[r.targetTable].name)}.${escapeHTML(r.targetCol)}</option>`).join('');
            bizRuleRelChanged();
            if (!rules.length) { cont.innerHTML = '<p class="text-xs text-slate-400 italic">Aucune règle définie.</p>'; return; }
            cont.innerHTML = rules.map(r => {
                const eo = (v, l) => `<option value="${v}" ${r.expect === v ? 'selected' : ''}>${l}</option>`;
                return `<div class="bg-white border border-slate-200 rounded-lg p-2 mb-1.5">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-bold text-slate-700">⚖️ ${escapeHTML(bizRuleLabel(r))}</span>
                    <button onclick="testBizRule('${r.id}', this)" class="ml-auto text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-100">▶ Tester</button>
                    <button onclick="removeBizRule('${r.id}')" class="text-red-400 hover:text-red-600 text-xs" title="Supprimer">🗑</button>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap mt-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded p-1.5">
                    <span class="font-semibold text-slate-600">1 ${escapeHTML(r.parentTable)} doit avoir</span>
                    <select onchange="updateBizRule('${r.id}','expect',this.value)" class="border border-slate-300 rounded px-1 py-0.5 bg-white text-[11px]">${eo('=', 'exactement')}${eo('<=', 'au plus')}${eo('>=', 'au moins')}</select>
                    <input type="number" min="0" value="${r.n}" onchange="updateBizRule('${r.id}','n',this.value)" class="border border-slate-300 rounded px-1 py-0.5 w-14 text-[11px]">
                    <span class="font-semibold text-slate-600">${escapeHTML(r.childTable)}</span>
                    ${r.cond && r.cond.col ? `<span>quand <b>${escapeHTML(r.cond.col)}</b> =</span><input value="${escapeHTML(r.cond.val || '')}" onchange="updateBizRule('${r.id}','condVal',this.value)" class="border border-slate-300 rounded px-1 py-0.5 w-28 text-[11px]">` : ''}
                    <span class="ml-1 text-slate-400">libellé</span><input value="${escapeHTML(r.label || '')}" placeholder="(auto)" onchange="updateBizRule('${r.id}','label',this.value)" class="border border-slate-300 rounded px-1 py-0.5 w-40 text-[11px]">
                </div>
                <div id="bizrule-res-${r.id}" class="mt-1"></div>
            </div>`; }).join('');
        }
        function updateBizRule(id, field, value) {
            const r = (state.governance.rules || []).find(x => x.id === id); if (!r) return;
            if (field === 'expect') r.expect = value;
            else if (field === 'n') r.n = Math.max(0, parseInt(value) || 0);
            else if (field === 'label') r.label = (value || '').trim();
            else if (field === 'condVal') { if (r.cond) r.cond.val = (value || '').trim(); }
            persistAppState(); renderBizRules();
        }
        function bizRuleRelChanged() {
            const rel = state.relations.find(r => r.id === el('bizRuleRel').value);
            const dir = el('bizRuleDir');
            if (!rel) { if (dir) dir.innerHTML = ''; return; }
            const sN = state.tables[rel.sourceTable].name, tN = state.tables[rel.targetTable].name;
            dir.innerHTML = `<option value="s">parent = ${escapeHTML(sN)}, enfants = ${escapeHTML(tN)}</option><option value="t">parent = ${escapeHTML(tN)}, enfants = ${escapeHTML(sN)}</option>`;
            bizRuleDirChanged();
        }
        function bizRuleDirChanged() {
            const rel = state.relations.find(r => r.id === el('bizRuleRel').value); if (!rel) return;
            const childT = el('bizRuleDir').value === 's' ? state.tables[rel.targetTable] : state.tables[rel.sourceTable];
            el('bizRuleCondCol').innerHTML = '<option value="">— sans condition —</option>' + childT.headers.map(h => `<option>${escapeHTML(h)}</option>`).join('');
            el('bizRuleCondVal').value = ''; el('bizRuleCondVals').innerHTML = '';
        }
        async function bizRuleCondColChanged() {
            const rel = state.relations.find(r => r.id === el('bizRuleRel').value); if (!rel) return;
            const childT = el('bizRuleDir').value === 's' ? state.tables[rel.targetTable] : state.tables[rel.sourceTable];
            const col = el('bizRuleCondCol').value; const list = el('bizRuleCondVals');
            if (!col || !list) return;
            list.innerHTML = '';
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(col)} AS VARCHAR))`;
                const res = await conn.query(`SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(childT.id))} WHERE ${sqlIdent(col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 20`);
                list.innerHTML = arrowResultToObjects(res).map(r => `<option value="${escapeHTML(r.v)}">`).join('');
            } catch (e) {}
        }
        function addBizRule() {
            const rel = state.relations.find(r => r.id === el('bizRuleRel').value);
            if (!rel) return showError('Sélectionnez une relation.');
            const isS = el('bizRuleDir').value === 's';
            const parentT = isS ? state.tables[rel.sourceTable] : state.tables[rel.targetTable];
            const childT = isS ? state.tables[rel.targetTable] : state.tables[rel.sourceTable];
            const condCol = el('bizRuleCondCol').value, condVal = el('bizRuleCondVal').value.trim();
            if (condCol && !condVal) return showError('Indiquez la valeur de la condition (ex : GENERAL).');
            state.governance.rules = state.governance.rules || [];
            state.governance.rules.push({
                id: 'rul_' + generateId(),
                parentTable: parentT.name, parentCol: isS ? rel.sourceCol : rel.targetCol,
                childTable: childT.name, childCol: isS ? rel.targetCol : rel.sourceCol,
                cond: condCol ? { col: condCol, op: '=', val: condVal } : null,
                expect: el('bizRuleExpect').value, n: parseInt(el('bizRuleN').value) || 1, label: '',
            });
            persistAppState(); renderBizRules();
            showSuccess('Règle métier ajoutée — elle sera contrôlée dans l\'audit qualité et l\'audit global des objets.');
        }
        function removeBizRule(id) { state.governance.rules = (state.governance.rules || []).filter(r => r.id !== id); persistAppState(); renderBizRules(); }
        async function testBizRule(id, btn) {
            const rule = (state.governance.rules || []).find(r => r.id === id); if (!rule) return;
            const out = el('bizrule-res-' + id); if (btn) btn.disabled = true;
            out.innerHTML = '<p class="text-xs text-indigo-600 mt-1">Exécution...</p>';
            try {
                const res = await auditBusinessRule(rule);
                out.innerHTML = `<p class="text-xs mt-1 ${res.viol > 0 ? 'text-red-600 font-bold' : 'text-emerald-700'}">${res.viol > 0 ? '❌' : '✅'} ${res.viol.toLocaleString('fr-FR')} violation(s) sur ${res.total.toLocaleString('fr-FR')} parent(s)${res.examples.length ? ` — ex : ${res.examples.map(escapeHTML).join(', ')}` : ''}</p>`;
            } catch (e) { out.innerHTML = `<p class="text-xs text-red-600 mt-1">Inexécutable : ${escapeHTML(e.message)}</p>`; }
            finally { if (btn) btn.disabled = false; }
        }

        // Règles de maîtrise contextuelle : quand la source maître (et donc le propriétaire) dépend
        // du contexte — ex : objet "Contrat" maîtrisé par le système Assurance pour les contrats de
        // type ASSURANCE, par la GMAO pour les contrats de type MAINTENANCE, etc.
        function renderBoContextRules(bo, names) {
            const cr = bo.contextRules || { elementId: '', rules: [] };
            const elems = bo.elements || [];
            const ctxElem = elems.find(e2 => e2.id === cr.elementId);
            const sourceTables = (bo.sources || []).map(s => s.table);
            const tableOpts = (sel) => (sourceTables.length ? sourceTables : names).map(n => `<option ${n === sel ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('');
            let html = `<div class="border border-blue-200 rounded-lg p-3 bg-blue-50/40">
                <div class="text-[10px] uppercase font-bold text-blue-800 mb-1">⚖️ Règles de maîtrise contextuelle</div>
                <p class="text-[10px] text-slate-500 mb-2">Si la source maître dépend du contexte (ex : selon le <em>type de contrat</em>, la donnée est maîtrisée par un système différent avec un propriétaire différent), choisissez l'attribut de contexte puis définissez les règles. À défaut de règle applicable, la source 👑 maître générale et le propriétaire global s'appliquent.</p>
                <div class="flex items-center gap-2 mb-2">
                    <label class="text-xs font-bold text-slate-500">Attribut de contexte :</label>
                    <select onchange="updateBoContext('${bo.id}',this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white">
                        <option value="">— aucun (maîtrise unique) —</option>
                        ${elems.map(e2 => `<option value="${e2.id}" ${e2.id === cr.elementId ? 'selected' : ''}>${escapeHTML(e2.name)}</option>`).join('')}
                    </select>
                </div>`;
            if (cr.elementId && ctxElem) {
                html += (cr.rules || []).map(r => `<div class="flex flex-wrap items-center gap-2 mb-1.5 bg-white border border-blue-100 rounded-lg p-2">
                        <span class="text-xs text-slate-500">Si <strong>${escapeHTML(ctxElem.name)}</strong> =</span>
                        <input type="text" value="${escapeHTML(r.value || '')}" list="ctx-vals-${bo.id}" onchange="updateBoContextRule('${bo.id}','${r.id}','value',this.value)" placeholder="choisir ou saisir..." class="border border-slate-300 p-1.5 rounded text-xs w-36 font-bold">
                        <span class="text-xs text-slate-400">→ maître :</span>
                        <select onchange="updateBoContextRule('${bo.id}','${r.id}','masterTable',this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${tableOpts(r.masterTable)}</select>
                        <span class="text-xs text-slate-400">· propriétaire :</span>
                        <input type="text" value="${escapeHTML(r.owner || '')}" onchange="updateBoContextRule('${bo.id}','${r.id}','owner',this.value)" placeholder="propriétaire pour ce contexte" class="border border-slate-300 p-1.5 rounded text-xs w-44">
                        <button onclick="removeBoContextRule('${bo.id}','${r.id}')" class="text-red-400 hover:text-red-600 ml-auto">✕</button>
                    </div>`).join('');
                html += `<datalist id="ctx-vals-${bo.id}"></datalist>
                <div class="flex items-center gap-2 mt-2">
                    <button onclick="addBoContextRule('${bo.id}')" class="text-xs bg-white border border-blue-300 text-blue-700 px-2.5 py-1 rounded font-medium hover:bg-blue-50">+ Règle</button>
                    <button onclick="analyzeContextCoverage('${bo.id}')" class="text-xs bg-blue-600 text-white px-2.5 py-1 rounded font-bold hover:bg-blue-700">🔎 Vérifier la couverture sur les données réelles</button>
                </div>
                <div id="bo-ctx-coverage-${bo.id}" class="mt-2"></div>`;
            }
            return html + '</div>';
        }
        // Propose les valeurs réelles de l'attribut de contexte pour les règles de maîtrise.
        async function fillCtxRuleValues(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const list = el('ctx-vals-' + boId); if (!list) return;
            const ctxElem = (bo.elements || []).find(e2 => e2.id === (bo.contextRules || {}).elementId);
            const map = ctxElem && (ctxElem.mappings || [])[0]; if (!map) return;
            const t = tableByName(map.table); if (!t || t.status !== 'ready') return;
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(map.col)} AS VARCHAR))`;
                const res = await conn.query(`SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(t.id))} WHERE ${sqlIdent(map.col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 20`);
                list.innerHTML = arrowResultToObjects(res).map(r => `<option value="${escapeHTML(r.v)}">`).join('');
            } catch (e) {}
        }

        function updateBoContext(boId, elementId) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return; bo.contextRules = bo.contextRules || { elementId: '', rules: [] }; bo.contextRules.elementId = elementId; persistAppState(); renderGovernance(); }
        function addBoContextRule(boId) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return; bo.contextRules = bo.contextRules || { elementId: '', rules: [] }; bo.contextRules.rules.push({ id: 'cr_' + generateId(), value: '', masterTable: ((bo.sources || [])[0] || {}).table || '', owner: '' }); persistAppState(); renderGovernance(); }
        function updateBoContextRule(boId, ruleId, f, v) { const bo = state.governance.businessObjects.find(x => x.id === boId); const r = bo && ((bo.contextRules || {}).rules || []).find(x => x.id === ruleId); if (r) { r[f] = v; persistAppState(); } }
        function removeBoContextRule(boId, ruleId) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (bo && bo.contextRules) { bo.contextRules.rules = bo.contextRules.rules.filter(x => x.id !== ruleId); persistAppState(); renderGovernance(); } }

        // Vérifie la couverture des règles contre les VRAIES valeurs du contexte (via DuckDB) :
        // liste les valeurs distinctes de l'attribut de contexte et signale celles sans règle.
        async function analyzeContextCoverage(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const out = el('bo-ctx-coverage-' + boId); if (!out) return;
            const cr = bo.contextRules || {};
            const ctxElem = (bo.elements || []).find(e2 => e2.id === cr.elementId);
            const map = ctxElem && (ctxElem.mappings || [])[0];
            if (!map) { out.innerHTML = '<p class="text-xs text-red-600">L\'attribut de contexte doit être mappé sur au moins une colonne physique (Alimenté par).</p>'; return; }
            const t = tableByName(map.table);
            if (!t || t.status !== 'ready') { out.innerHTML = `<p class="text-xs text-red-600">Table "${escapeHTML(map.table)}" non chargée.</p>`; return; }
            out.innerHTML = '<p class="text-xs text-blue-700">Lecture des valeurs distinctes...</p>';
            try {
                const { conn } = await getDB();
                const raw = `TRIM(CAST(${sqlIdent(map.col)} AS VARCHAR))`;
                const res = await conn.query(`SELECT ${raw} AS v, COUNT(*)::BIGINT AS c FROM ${sqlIdent(duckTableName(t.id))} WHERE ${sqlIdent(map.col)} IS NOT NULL AND ${raw} <> '' GROUP BY 1 ORDER BY c DESC LIMIT 50`);
                const vals = arrowResultToObjects(res);
                const ruleVals = new Set((cr.rules || []).map(r => String(r.value || '').trim().toUpperCase()).filter(Boolean));
                const covered = vals.filter(v => ruleVals.has(String(v.v).toUpperCase()));
                const uncovered = vals.filter(v => !ruleVals.has(String(v.v).toUpperCase()));
                out.innerHTML = `<div class="text-xs mb-1.5">${covered.length}/${vals.length} valeur(s) de contexte couvertes par une règle${vals.length === 50 ? ' (50 premières)' : ''} :</div>
                    <div class="flex flex-wrap gap-1.5">
                        ${covered.map(v => `<span class="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-2 py-0.5">✅ ${escapeHTML(v.v)} <span class="text-slate-400">(${Number(v.c).toLocaleString('fr-FR')})</span></span>`).join('')}
                        ${uncovered.map(v => `<span class="text-[11px] bg-red-50 border border-red-200 text-red-700 rounded-full px-2 py-0.5">⚠️ ${escapeHTML(v.v)} <span class="text-slate-400">(${Number(v.c).toLocaleString('fr-FR')})</span></span>`).join('')}
                    </div>
                    ${uncovered.length ? `<p class="text-[10px] text-red-600 mt-1.5">Les valeurs ⚠️ n'ont pas de règle : la source maître générale et le propriétaire global s'appliquent par défaut — vérifiez que c'est voulu.</p>` : '<p class="text-[10px] text-emerald-700 mt-1.5">Toutes les valeurs observées sont couvertes.</p>'}`;
            } catch (e) { out.innerHTML = `<p class="text-xs text-red-600">Analyse impossible : ${escapeHTML(e.message)}</p>`; }
        }

        function addBusinessObject() { const bo = { id: 'bo_' + generateId(), name: 'Nouvel objet métier', definition: '', globalOwner: '', contributors: [], sources: [], elements: [], contextRules: { elementId: '', rules: [] } }; state.governance.businessObjects.push(bo); govState.selectedBoId = bo.id; persistAppState(); renderGovernance(); }
        function updateBusinessObject(id, f, v) { const bo = state.governance.businessObjects.find(x => x.id === id); if (bo) { bo[f] = v; persistAppState(); } }
        function removeBusinessObject(id) { state.governance.businessObjects = state.governance.businessObjects.filter(x => x.id !== id); persistAppState(); renderGovernance(); }
        function addBoElement(boId) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return; bo.elements = bo.elements || []; bo.elements.push({ id: 'be_' + generateId(), name: 'Nouvel attribut', owner: '', mappings: [] }); persistAppState(); renderGovernance(); }
        function updateBoElement(boId, elmId, f, v) { const bo = state.governance.businessObjects.find(x => x.id === boId); const elm = bo && (bo.elements || []).find(e => e.id === elmId); if (elm) { elm[f] = v; persistAppState(); } }
        function removeBoElement(boId, elmId) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (bo) { bo.elements = (bo.elements || []).filter(e => e.id !== elmId); persistAppState(); renderGovernance(); } }
        function populateBoMapCols(elmId, tableName) { const t = tableByName(tableName); const s = el('bo-col-' + elmId); if (s) s.innerHTML = (t ? t.headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join(''); }
        function addBoMapping(boId, elmId) { const bo = state.governance.businessObjects.find(x => x.id === boId); const elm = bo && (bo.elements || []).find(e => e.id === elmId); if (!elm) return; const tbl = el('bo-tbl-' + elmId).value, col = el('bo-col-' + elmId).value; if (!tbl || !col) return; elm.mappings = elm.mappings || []; if (!elm.mappings.some(m => m.table === tbl && m.col === col)) elm.mappings.push({ table: tbl, col }); persistAppState(); renderGovernance(); }
        function removeBoMapping(boId, elmId, idx) { const bo = state.governance.businessObjects.find(x => x.id === boId); const elm = bo && (bo.elements || []).find(e => e.id === elmId); if (elm && elm.mappings) { elm.mappings.splice(idx, 1); persistAppState(); renderGovernance(); } }
        // Pré-crée un objet métier depuis un attribut multi-sources détecté : le sous-élément est mappé
        // d'office sur toutes les tables où l'attribut apparaît — il ne reste qu'à nommer le propriétaire.
        function createObjectFromAttribute(col) {
            const tabs = readyTableNames().filter(n => { const t = tableByName(n); return t && t.headers.includes(col); });
            const bo = {
                id: 'bo_' + generateId(), name: 'Objet — ' + col, definition: '', globalOwner: '', contributors: [], sources: [],
                elements: [{ id: 'be_' + generateId(), name: col, owner: '', mappings: tabs.map(tn => ({ table: tn, col })) }],
                contextRules: { elementId: '', rules: [] },
            };
            state.governance.businessObjects.push(bo);
            govState.selectedBoId = bo.id;
            persistAppState(); renderGovernance();
            showSuccess(`Objet métier créé pour "${col}" (${tabs.length} sources mappées). Nommez maintenant son propriétaire global.`);
        }

        // ---- Assistant "Concevoir un objet métier depuis le modèle de données" ----
        // Choisir une table racine ; l'appli mesure les cardinalités réelles de chaque relation du
        // sous-graphe et suggère : ◆ composition (fait partie de l'objet) quand la table liée est
        // "côté N" et n'appartient qu'à la racine, → référence (objet séparé) quand elle est partagée
        // ou côté 1 (référentiel). L'utilisateur arbitre, puis l'objet est généré structuré.
        function openBoDesigner() { govState.designer = { rootId: '', analysis: null }; renderGovernance(); }
        function closeBoDesigner() { govState.designer = null; renderGovernance(); }

        function renderBoDesigner() {
            const d = govState.designer;
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            let html = `<div class="bg-white border-2 border-emerald-200 rounded-xl p-5">
                <div class="flex items-center gap-3 mb-2">
                    <button onclick="closeBoDesigner()" class="text-xs border border-slate-300 px-2.5 py-1.5 rounded-lg font-bold text-slate-600 hover:bg-slate-50">← Retour</button>
                    <h3 class="font-black text-slate-800">🧬 Concevoir un objet métier depuis le modèle de données</h3>
                </div>
                <p class="text-xs text-slate-500 mb-4">Choisissez la table racine : les cardinalités réelles du sous-graphe sont mesurées sur vos données, puis l'application suggère ce qui <strong>fait partie</strong> de l'objet (◆ composition) et ce qui n'est que <strong>référencé</strong> (→ objet séparé) — à vous d'arbitrer.</p>
                <div class="flex items-end gap-2 mb-4">
                    <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Table racine de l'objet</label>
                    <select id="designer-root" class="border border-slate-300 p-2 rounded text-sm bg-white">${tables.map(t2 => `<option value="${t2.id}" ${d.rootId === t2.id ? 'selected' : ''}>${escapeHTML(t2.name)}</option>`).join('')}</select></div>
                    <button onclick="analyzeBoDesign()" id="btnDesignAnalyze" class="bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-lg">📐 Analyser le sous-graphe</button>
                </div>`;
            if (d.analysis) {
                const root = state.tables[d.rootId];
                const selfRel = selfRelationFor(d.rootId);
                if (selfRel) html += `<p class="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-3">🌳 <strong>${escapeHTML(root.name)}</strong> est hiérarchique (auto-relation ${escapeHTML(selfRel.sourceCol)} ↔ ${escapeHTML(selfRel.targetCol)}) : ses lignes forment un arbre (ex : site → bâtiment → niveau). Pensez aux <strong>profils de clé par type</strong> dans l'audit Doublons, et au composant de clé "colonne du parent".</p>`;
                if (!d.analysis.length) {
                    html += `<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">Aucune relation du modèle de données ne touche "${escapeHTML(root.name)}" (étape 2). L'objet sera créé avec cette seule table.</p>`;
                } else {
                    html += `<div class="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Tables liées à "${escapeHTML(root.name)}" — que fait-on de chacune ?</div>`;
                    html += d.analysis.map((a, i) => `<div class="border border-slate-200 rounded-lg p-3 mb-2 bg-slate-50/50">
                        <div class="flex items-center gap-2 flex-wrap mb-1.5">
                            <span class="font-bold text-sm text-slate-800">${escapeHTML(a.tblName)}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700">${escapeHTML(root.name)} ${a.cardText} ${escapeHTML(a.tblName)}</span>
                            <span class="text-[10px] text-slate-400">${a.detail}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded ${a.suggestion === 'composition' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'}">suggestion : ${a.suggestion === 'composition' ? '◆ composition' : '→ référence'}</span>
                        </div>
                        <div class="flex gap-4 text-xs">
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="design-${i}" value="composition" ${a.choice === 'composition' ? 'checked' : ''} onchange="govState.designer.analysis[${i}].choice='composition'" class="text-emerald-600"> ◆ Fait partie de l'objet <span class="text-slate-400">(ses attributs sont intégrés)</span></label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="design-${i}" value="reference" ${a.choice === 'reference' ? 'checked' : ''} onchange="govState.designer.analysis[${i}].choice='reference'" class="text-teal-600"> → Objet séparé référencé</label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="design-${i}" value="ignore" ${a.choice === 'ignore' ? 'checked' : ''} onchange="govState.designer.analysis[${i}].choice='ignore'" class="text-slate-400"> ✕ Ignorer</label>
                        </div>
                    </div>`).join('');
                }
                html += `<div class="flex items-end gap-2 mt-4 pt-3 border-t border-slate-100">
                    <div><label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Nom de l'objet métier</label>
                    <input type="text" id="designer-name" value="${escapeHTML(d.suggestedName || '')}" class="border border-slate-300 p-2 rounded text-sm w-64"></div>
                    <button onclick="generateObjectFromDesign()" class="bg-emerald-600 text-white text-sm font-bold px-5 py-2 rounded-lg">🏛️ Générer l'objet métier</button>
                </div>`;
            }
            return html + '</div>';
        }

        async function analyzeBoDesign() {
            const d = govState.designer; if (!d) return;
            d.rootId = el('designer-root').value;
            const root = state.tables[d.rootId]; if (!root) return;
            const btn = el('btnDesignAnalyze'); btn.disabled = true; btn.textContent = 'Mesure des cardinalités...';
            const rels = state.relations.filter(r => r.sourceCol && r.targetCol && (r.sourceTable === d.rootId || r.targetTable === d.rootId) && r.sourceTable !== r.targetTable);
            const analysis = [];
            try {
                for (const r of rels) {
                    const otherId = r.sourceTable === d.rootId ? r.targetTable : r.sourceTable;
                    const other = state.tables[otherId]; if (!other || other.status !== 'ready') continue;
                    if (!r.measured) { try { r.measured = await measureRelation(r); } catch (e) { /* moteur indisponible : suggestion sans mesure */ } }
                    const m = r.measured;
                    const rootIsSource = r.sourceTable === d.rootId;
                    const rootMax = m ? (rootIsSource ? m.smax : m.tmax) : 1;
                    const otherMax = m ? (rootIsSource ? m.tmax : m.smax) : 1;
                    const degree = state.relations.filter(x => x.id !== r.id && x.sourceCol && x.targetCol && (x.sourceTable === otherId || x.targetTable === otherId)).length;
                    // Côté N exclusif à la racine -> fait probablement partie de l'objet ; partagé ou côté 1 -> référentiel.
                    const suggestion = (otherMax > 1 && degree === 0) ? 'composition' : ((rootMax > 1 || degree > 0) ? 'reference' : 'composition');
                    const cardText = `${rootMax <= 1 ? '1' : 'N'}–${otherMax <= 1 ? '1' : 'N'}`;
                    const detail = m ? `max ${otherMax} ligne(s) par clé · ${degree ? degree + ' autre(s) table(s) y sont liées' : 'liée uniquement à la racine'}` : 'cardinalité non mesurable (moteur indisponible)';
                    analysis.push({ relId: r.id, tblId: otherId, tblName: other.name, cardText, detail, suggestion, choice: suggestion });
                }
                persistAppState();
                d.analysis = analysis;
                d.suggestedName = cleanFileName(root.name).replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
                renderGovernance();
            } catch (e) { showError('Analyse impossible : ' + e.message); btn.disabled = false; btn.textContent = '📐 Analyser le sous-graphe'; }
        }

        function generateObjectFromDesign() {
            const d = govState.designer; if (!d || !d.rootId) return;
            const root = state.tables[d.rootId]; if (!root) return;
            const name = el('designer-name').value.trim();
            if (!name) return showError("Donnez un nom à l'objet métier.");
            if (state.governance.businessObjects.some(b => b.name.toLowerCase() === name.toLowerCase())) return showError(`Un objet "${name}" existe déjà.`);
            const bo = {
                id: 'bo_' + generateId(), name, definition: '', globalOwner: '', contributors: [],
                sources: [{ table: root.name, role: 'maitre' }],
                elements: root.headers.map(h => ({ id: 'be_' + generateId(), name: h, owner: '', mappings: [{ table: root.name, col: h }] })),
                contextRules: { elementId: '', rules: [] }, structure: [], references: [],
            };
            state.governance.businessObjects.push(bo);
            // Hiérarchie détectée dans le modèle de données : elle descend dans l'objet métier
            try { const dh = buildDetectedHierarchy(root); if (dh) bo.hierarchies = [dh]; } catch (e) {}
            (d.analysis || []).forEach(a => {
                const rel = state.relations.find(x => x.id === a.relId);
                if (a.choice === 'ignore') return;
                if (rel) rel.kind = a.choice === 'composition' ? 'composition' : 'reference';
                if (a.choice === 'composition') {
                    attachSourceToObject(bo, a.tblName, 'contributeur', true);
                    bo.structure.push({ table: a.tblName, kind: 'composition', cardinality: a.cardText });
                } else {
                    const refName = cleanFileName(a.tblName).replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
                    let ref = state.governance.businessObjects.find(b => b.name.toLowerCase() === refName.toLowerCase() || (b.sources || []).some(s2 => s2.table === a.tblName));
                    if (!ref) {
                        const refTable = state.tables[a.tblId];
                        ref = { id: 'bo_' + generateId(), name: refName, definition: '', globalOwner: '', contributors: [], sources: [{ table: a.tblName, role: 'maitre' }], elements: (refTable ? refTable.headers : []).map(h => ({ id: 'be_' + generateId(), name: h, owner: '', mappings: [{ table: a.tblName, col: h }] })), contextRules: { elementId: '', rules: [] }, structure: [], references: [] };
                        state.governance.businessObjects.push(ref);
                    }
                    bo.references.push({ boId: ref.id, viaLabel: rel ? `${rel.sourceCol} = ${rel.targetCol}` : '', cardinality: a.cardText });
                }
            });
            govState.designer = null; govState.selectedBoId = bo.id;
            persistAppState(); renderGovernance(); renderRelationsList();
            showSuccess(`Objet "${name}" généré depuis le modèle de données (${bo.structure.length} composition(s), ${bo.references.length} référence(s)).`);
        }

        // ---- Diagramme du modèle objet (UML-like, moteur SVG) ----
        let modelGraph = null;
        function renderObjectModelDiagram() {
            const wrap = el('modelGraphWrap'); if (!wrap) return;
            try { _renderObjectModelImpl(wrap); }
            catch (e) { console.error('Model render error', e); wrap.innerHTML = graphUnavailableHtml('Le modèle objet n\'a pas pu être affiché : ' + escapeHTML(e.message)); return; }
            observeGraphResize('model');
        }
        function _renderObjectModelImpl(wrap) {
            const nodes = [], edges = [];
            const bos = state.governance.businessObjects;
            bos.forEach(bo => {
                const hiers = getBoHierarchies(bo);
                const isHier = hiers.length > 0;
                // Carte UML de l'objet : propriétaire + attributs du cœur.
                const coreEls = boCoreElements(bo);
                const boRows = [bo.globalOwner ? '👤 ' + bo.globalOwner : '⚠️ sans propriétaire'];
                coreEls.slice(0, 6).forEach(e2 => boRows.push('· ' + e2.name));
                if (coreEls.length > 6) boRows.push(`… ${coreEls.length - 6} autre(s) attribut(s)`);
                nodes.push({ id: 'bo:' + bo.id, type: 'studio-uml-node', title: (isHier ? '🌳 ' : '') + '🏛️ ' + bo.name, rows: boRows, headFill: '#dcfce7', titleFill: '#14532d', stroke: isHier ? '#059669' : '#16a34a' });
                hiers.forEach((h2, hi) => {
                    edges.push({ id: 'hier:' + bo.id + ':' + hi, source: 'bo:' + bo.id, target: 'bo:' + bo.id, type: 'loop', loopCfg: { position: 'top', dist: 40 + hi * 22 }, label: '🌳 ' + (h2.name || 'hiérarchie') + (h2.mode === 'link' ? ' (via ' + (h2.linkTable || 'liaison') + ')' : '') + (h2.maxDepth ? ' ≤' + h2.maxDepth + ' niv.' : ''), style: { stroke: '#059669', lineWidth: 1.5 } });
                    const lvls = h2.levels || [];
                    const lvlId = name => 'lvl:' + bo.id + ':' + hi + ':' + name;
                    lvls.forEach(lv => {
                        nodes.push({ id: lvlId(lv.name), type: 'studio-rich-node', title: lv.name, content: (lv.parents || []).length ? '' : 'racine', fill: '#f0fdf4', stroke: '#6ee7b7' });
                        if (!(lv.parents || []).length) edges.push({ id: 'er' + lvlId(lv.name), source: 'bo:' + bo.id, target: lvlId(lv.name), label: h2.name || 'niveaux', style: { stroke: '#6ee7b7', lineDash: [3, 3], endArrow: { path: '', fill: '#6ee7b7' } } });
                        (lv.parents || []).forEach(pn => {
                            if (lvls.some(x => x.name === pn)) edges.push({ id: 'ep' + lvlId(lv.name) + ':' + pn, source: lvlId(pn), target: lvlId(lv.name), label: 'contient', style: { stroke: '#6ee7b7', lineDash: [3, 3], endArrow: { path: '', fill: '#6ee7b7' } } });
                        });
                    });
                });
                getBoFacets(bo).forEach((c2, j) => {
                    const cid = 'cmp:' + bo.id + ':' + j;
                    const filterTxt = (c2.scope || []).length ? (c2.scope || []).map(facetScopeLabel).join(' · ') : 'toute la table';
                    const title = c2.name && c2.name !== c2.table ? c2.name : c2.table;
                    const fRows = ['📄 vue de ' + c2.table, '⚗ ' + filterTxt];
                    (c2.elements || []).slice(0, 4).forEach(fe => fRows.push('· ' + fe.name));
                    if ((c2.elements || []).length > 4) fRows.push(`… ${(c2.elements || []).length - 4} autre(s)`);
                    nodes.push({ id: cid, type: 'studio-uml-node', title: '◆ ' + title, rows: fRows, headFill: '#f0fdf4', titleFill: '#166534', stroke: '#86efac' });
                    const appliesTxt = (c2.applies || []).length ? ' [si ' + (c2.applies || []).map(facetScopeLabel).join(' et ') + ']' : '';
                    // UML : composition = losange plein côté « tout » (l'objet). Pas de flèche côté partie.
                    edges.push({ id: 'e' + cid, source: 'bo:' + bo.id, target: cid, label: `${c2.cardinality || ''}${appliesTxt}`, style: { stroke: '#16a34a', lineWidth: 1.6, startArrow: { path: '', fill: '#16a34a' }, endArrow: false } });
                });
                (bo.references || []).forEach((rf, j) => {
                    if (!bos.some(b => b.id === rf.boId)) return;
                    edges.push({ id: 'ref:' + bo.id + ':' + j, source: 'bo:' + bo.id, target: 'bo:' + rf.boId, label: `→ ${rf.cardinality || ''}${rf.viaLabel ? ' (' + rf.viaLabel + ')' : ''}`, style: { stroke: '#0d9488', lineDash: [6, 3], endArrow: { path: '', fill: '#0d9488' } } });
                });
            });
            if (modelGraph) { modelGraph.destroy(); modelGraph = null; }
            if (!nodes.length) { wrap.innerHTML = '<p class="text-sm text-slate-400 italic text-center pt-24">Aucun objet métier — utilisez l\'assistant 🧬 "Concevoir depuis le modèle de données" dans l\'onglet Objets métier.</p>'; return; }
            modelGraph = createSvgGraph(wrap, { type: 'dagre', rankdir: 'LR', nodesep: 28, ranksep: 100 }, {
                width: wrap.clientWidth || 900, height: wrap.clientHeight || 550,
                defaultEdge: { type: 'cubic-horizontal', style: { stroke: '#94a3b8', lineWidth: 1.4 }, labelCfg: { autoRotate: true, style: { fill: '#475569', fontSize: 10, background: { fill: '#fff', stroke: '#e2e8f0', padding: [2, 4, 2, 4], radius: 3 } } } },
            });
            pinNodeOnDrag(modelGraph);
            modelGraph.data({ nodes, edges });
            modelGraph.render();
            modelGraph.fitView(20);
        }

        // ---- Assistant "objet métier depuis une source" (rôles maître / contributeur / destinataire) ----
        const BO_ROLES = { maitre: '👑 Maître', contributeur: '✍️ Contributeur', destinataire: '📥 Destinataire' };
        let boWizardTable = null;

        // Cherche les objets métier probablement liés à cette source : nom proche, ou source/mapping déjà présent.
        function suggestObjectsForTable(tableName) {
            const norm = s => String(s).toLowerCase().replace(/\.(csv|xlsx|xls|txt)$/, '').replace(/[^a-z0-9]/g, '');
            const tn = norm(tableName);
            return state.governance.businessObjects.filter(bo => {
                const bn = norm(bo.name);
                if (bn && tn && (bn.includes(tn) || tn.includes(bn))) return true;
                if ((bo.sources || []).some(s => s.table === tableName)) return true;
                return (bo.elements || []).some(e2 => (e2.mappings || []).some(m => m.table === tableName));
            });
        }

        function openBoWizard(tableName) {
            const t = tableByName(tableName); if (!t || t.status !== 'ready') return showError('Table introuvable ou non chargée.');
            boWizardTable = tableName;
            el('boWizTableName').textContent = tableName;
            const suggestions = suggestObjectsForTable(tableName);
            const sug = el('boWizSuggestion');
            if (suggestions.length) {
                sug.innerHTML = `⚠️ ${suggestions.length} objet(s) métier semblent déjà correspondre à cette source : <strong>${suggestions.map(b => escapeHTML(b.name)).join(', ')}</strong>. Rattachez la source à l'existant plutôt que de créer un doublon.`;
                sug.classList.remove('hidden');
            } else { sug.classList.add('hidden'); }
            const existing = el('boWizExisting');
            existing.innerHTML = '<option value="__new__">➕ Créer un nouvel objet métier</option>' + state.governance.businessObjects.map(bo => `<option value="${bo.id}" ${suggestions[0] && suggestions[0].id === bo.id ? 'selected' : ''}>🏛️ ${escapeHTML(bo.name)}</option>`).join('');
            el('boWizNameWrap').classList.toggle('hidden', existing.value !== '__new__');
            el('boWizName').value = tableName.replace(/\.(csv|xlsx|xls|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
            el('boWizardModal').classList.remove('hidden');
        }

        // Rattache une source (avec son rôle) à un objet, et génère/mappe les sous-éléments si demandé.
        function attachSourceToObject(bo, tableName, role, genElements) {
            bo.sources = bo.sources || [];
            const ex = bo.sources.find(s => s.table === tableName);
            if (ex) ex.role = role; else bo.sources.push({ table: tableName, role });
            if (genElements) {
                const t = tableByName(tableName); if (!t) return;
                bo.elements = bo.elements || [];
                t.headers.forEach(h => {
                    let elm = bo.elements.find(e2 => e2.name.toLowerCase() === h.toLowerCase() || (e2.mappings || []).some(m => m.col === h));
                    if (!elm) { elm = { id: 'be_' + generateId(), name: h, owner: '', mappings: [] }; bo.elements.push(elm); }
                    if (!(elm.mappings || []).some(m => m.table === tableName && m.col === h)) elm.mappings.push({ table: tableName, col: h });
                });
            }
        }

        function confirmBoWizard() {
            if (!boWizardTable) return;
            const existingId = el('boWizExisting').value;
            const role = document.querySelector('input[name="boWizRole"]:checked').value;
            const genElements = el('boWizGenElements').checked;
            let bo;
            if (existingId === '__new__') {
                const name = el('boWizName').value.trim();
                if (!name) return showError("Donnez un nom à l'objet métier.");
                if (state.governance.businessObjects.some(b => b.name.toLowerCase() === name.toLowerCase())) return showError(`Un objet métier "${name}" existe déjà : sélectionnez-le dans la liste pour y rattacher la source.`);
                bo = { id: 'bo_' + generateId(), name, definition: '', globalOwner: '', contributors: [], sources: [], elements: [] };
                state.governance.businessObjects.push(bo);
            } else {
                bo = state.governance.businessObjects.find(b => b.id === existingId);
                if (!bo) return showError('Objet métier introuvable.');
            }
            attachSourceToObject(bo, boWizardTable, role, genElements);
            // Hiérarchie détectée dans le modèle de données sur la source : proposée d'office sur le nouvel objet
            if (existingId === '__new__') {
                try { const dh = buildDetectedHierarchy(tableByName(boWizardTable)); if (dh) bo.hierarchies = [dh]; } catch (e) {}
            }
            el('boWizardModal').classList.add('hidden');
            persistAppState();
            govState.selectedBoId = bo.id;
            if (!el('step-9').classList.contains('hidden')) { govState.tab = 'objects'; renderGovernance(); }
            showSuccess(`Source "${boWizardTable}" rattachée à l'objet "${bo.name}" en tant que ${BO_ROLES[role]}.`);
        }

        function addBoSource(boId) {
            const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return;
            const tbl = el('bo-src-tbl-' + boId).value, role = el('bo-src-role-' + boId).value;
            if (!tbl) return;
            attachSourceToObject(bo, tbl, role, false);
            boSyncAppsFromSources(); // l'application propriétaire du fichier se rattache automatiquement
            persistAppState(); lfSyncFromData({ silent: true }); renderGovernance();
        }
        function updateBoSourceRole(boId, tableName, role) { const bo = state.governance.businessObjects.find(x => x.id === boId); const s = bo && (bo.sources || []).find(x => x.table === tableName); if (s) { s.role = role; boSyncAppsFromSources(); persistAppState(); lfSyncFromData({ silent: true }); renderGovernance(); } }
        // V6 Lot 2 : l'application « référentiel » qui matérialise/porte l'objet métier.
        function updateBoApp(boId, appId) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return; bo.appId = appId || ''; persistAppState(); lfSyncFromData({ silent: true }); renderGovernance(); }
        function removeBoSource(boId, tableName) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (bo) { bo.sources = (bo.sources || []).filter(s => s.table !== tableName); boSyncAppsFromSources(); persistAppState(); lfSyncFromData({ silent: true }); renderGovernance(); } }

