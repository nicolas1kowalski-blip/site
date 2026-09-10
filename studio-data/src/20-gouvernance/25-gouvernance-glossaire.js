        // ---- Glossaire métier ----
        // ======================= V9.3 : TERMES EN TAGS, AJOUT DIRECT =======================
        // Un seul composant pour tout le monde : les termes d'un attribut, d'un objet, d'une
        // application ou d'un processus s'affichent en TAGS (tous au même niveau, ✕ pour retirer),
        // suivis d'un champ « + terme » : on tape un terme existant (suggestions) ou un nouveau —
        // il est créé dans le glossaire et relié dans la foulée. Plus de liste déroulante.
        let _termTagUid = 0;
        function termsOfBo(boId) {
            return (state.governance.glossary || []).filter(t2 => (t2.boIds || []).includes(boId));
        }
        function termsFor(kind, ctx) {
            if (kind === 'attr') return termsOfAttr(ctx.boId, ctx.elId);
            if (kind === 'bo') return termsOfBo(ctx.boId);
            if (kind === 'asset') return termsOfAsset(ctx.assetId);
            return [];
        }
        function termTagsHtml(kind, ctx, opts) {
            opts = opts || {};
            const uid = 'tt' + ++_termTagUid;
            const terms = termsFor(kind, ctx);
            const gl = state.governance.glossary || [];
            const remain = gl.filter(t2 => !terms.some(x => x.id === t2.id));
            const ctxJson = JSON.stringify(ctx).replace(/"/g, '&quot;');
            const tags = terms
                .map(
                    t2 =>
                        `<span class="term-tag" title="${escapeHTML(t2.definition || t2.term)}"><span class="lb" data-ro="keep" onclick="termTagOpen('${t2.id}')" title="Voir dans le glossaire">📖 ${escapeHTML(t2.term)}</span><button class="x" onclick="termTagRemove('${kind}',${ctxJson},'${t2.id}')" title="Retirer ce terme">✕</button></span>`
                )
                .join('');
            const inh = (opts.inherited || [])
                .map(
                    t2 =>
                        `<span class="term-tag inh" title="Hérité de l'attribut d'objet métier que cette colonne alimente"><span class="lb" data-ro="keep" onclick="termTagOpen('${t2.id}')">📖 ${escapeHTML(t2.term)}</span></span>`
                )
                .join('');
            // V9.3.3 : Entrée OU bouton. Dès qu'on tape, un bouton « ＋ Créer « … » » (terme inconnu)
            // ou « Relier » (terme existant) apparaît : plus besoin de deviner qu'il faut valider.
            const add = opts.readOnly
                ? ''
                : `<span class="term-addwrap"><input id="${uid}i" class="term-add" list="${uid}" placeholder="＋ Ajouter un terme…" aria-label="Ajouter un terme" title="Tapez un terme existant (suggestions) ou un NOUVEAU terme, puis Entrée ou le bouton : il est créé dans le glossaire et relié ici" oninput="termTagHint(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();event.stopPropagation();termTagAdd('${kind}',${ctxJson},this.value);}" onkeyup="if(event.key==='Enter'){event.preventDefault();}"><button type="button" id="${uid}b" class="term-go" hidden onclick="termTagAdd('${kind}',${ctxJson},el('${uid}i').value)">＋ Créer</button></span><datalist id="${uid}">${remain.map(t2 => `<option value="${escapeHTML(t2.term)}"></option>`).join('')}</datalist>`;
            const pend =
                typeof govFeatureOn === 'function' && govFeatureOn() && kind !== 'col'
                    ? propPending('termlink', { tk: kind, ctx })
                    : [];
            const pendHtml = pend
                .map(
                    p =>
                        `<span class="term-tag prop" title="Proposé par ${escapeHTML(govPersonName(p.by))}">${p.field === 'add' ? '⏳ + ' : '⏳ − '}${escapeHTML(p.field === 'add' ? p.after : p.before)}${govCanEdit(p.domain) ? `<button class="x" style="color:#047857" onclick="propAccept('${p.id}')" title="Valider">✓</button><button class="x" onclick="propReject('${p.id}')" title="Refuser">✕</button>` : ''}</span>`
                )
                .join('');
            return `<div class="term-tags">${tags}${inh}${pendHtml}${!tags && !inh && opts.readOnly ? '<span class="term-none">aucun terme</span>' : ''}${add}</div>`;
        }
        function termTagHint(inp) {
            const element = el(inp.id.replace(/i$/, 'b'));
            if (!element) return;
            const text = String(inp.value || '').trim();
            if (!text) {
                element.hidden = true;
                return;
            }
            const ex = termByName(text);
            element.hidden = false;
            element.textContent = ex ? '↵ Relier « ' + ex.term + ' »' : '＋ Créer « ' + text + ' »';
            element.classList.toggle('new', !ex);
        }
        function termTagOpen(id) {
            govState.glossView = 'terms';
            govState.glossFocus = id;
            openGovTab('glossary');
            setTimeout(() => {
                const element = el('gl-card-' + id);
                if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 80);
        }
        function termByName(name) {
            const normalized = catNorm(String(name || '').trim());
            return normalized ? (state.governance.glossary || []).find(t2 => catNorm(t2.term) === normalized) : null;
        }
        function termTagAdd(kind, ctx, name) {
            name = String(name || '').trim();
            if (!name) return;
            let t2 = termByName(name);
            if (!t2) {
                t2 = {
                    id: 'gl_' + generateId(),
                    term: name,
                    definition: '',
                    links: [],
                    attrLinks: [],
                    assetIds: [],
                    boIds: []
                };
                state.governance.glossary.push(t2);
                showSuccess(`Terme « ${name} » créé dans le glossaire — pensez à lui donner une définition.`);
            }
            if (kind === 'attr') glossaryLinkAttr(t2.id, ctx.boId, ctx.elId);
            else if (kind === 'bo') {
                t2.boIds = t2.boIds || [];
                if (!t2.boIds.includes(ctx.boId)) t2.boIds.push(ctx.boId);
            } else if (kind === 'asset') {
                if (!termAssetIds(t2).includes(ctx.assetId)) termAssetIds(t2).push(ctx.assetId);
            }
            persistAppState();
            renderGovernance();
            catRefreshFiche();
        }
        // Depuis le catalogue : la fiche ouverte est reconstruite après un ajout / retrait de terme.
        function catRefreshFiche() {
            const ficheContext = _catFicheCtx;
            const uxDrawerElement = el('uxDrawer');
            if (!ficheContext || !uxDrawerElement || !uxDrawerElement.classList.contains('on') || govState.tab !== 'catalog')
                return;
            const key = catKeyOf(ficheContext);
            const box = el('catLineageBox');
            const lineageOpen = box && !box.classList.contains('hidden');
            if (_catHist.length && catSameKey(_catHist[_catHist.length - 1], key)) _catHist.pop();
            catOpenByKey(key);
            if (lineageOpen && typeof _lineageRedraw === 'function') _lineageRedraw();
        }
        function termTagRemove(kind, ctx, termId) {
            const term = (state.governance.glossary || []).find(x => x.id === termId);
            if (!term) return;
            if (kind === 'attr') {
                attrTermUnlink(termId, ctx.boId, ctx.elId);
                catRefreshFiche();
                return;
            }
            if (kind === 'bo') term.boIds = (term.boIds || []).filter(x => x !== ctx.boId);
            else if (kind === 'asset') term.assetIds = termAssetIds(term).filter(x => x !== ctx.assetId);
            persistAppState();
            renderGovernance();
            catRefreshFiche();
        }
        // ---- Glossaire : vues par objet & attribut / par application & processus ----
        function glossViewBar() {
            const view = govState.glossView || 'terms';
            const B = (k, l) =>
                `<button data-ro="keep" onclick="govState.glossView='${k}'; renderGovernance()" class="text-xs font-bold px-3 py-1.5 rounded-lg border ${view === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}">${l}</button>`;
            return `<div class="flex items-center gap-2 mb-4 flex-wrap"><span class="text-[10px] uppercase font-bold text-slate-400 mr-1">Vue</span>${B('terms', '📖 Par terme')}${B('bo', '🏛️ Par objet & attribut')}${B('asset', '🖥 Par application & processus')}</div>`;
        }
        function renderGlossaryByBo() {
            const bos = state.governance.businessObjects || [];
            if (!bos.length)
                return emptyStateHtml(
                    '🏛️',
                    'Aucun objet métier',
                    'Créez un objet métier pour poser des termes sur ses attributs.',
                    'Objets métier',
                    "openGovTab('objects')"
                );
            return bos
                .map(bo => {
                    const rows = boAllAttrRows(bo) || [];
                    return `<div class="border border-slate-200 rounded-xl mb-3 bg-white overflow-hidden">
                    <div class="flex items-center gap-3 flex-wrap px-4 py-3 bg-emerald-50/70 border-b border-emerald-100">
                        <button data-ro="keep" onclick="openBoFiche('${bo.id}')" class="font-black text-sm text-emerald-900 hover:underline">🏛️ ${escapeHTML(bo.name)}</button>
                        <span class="text-[10px] uppercase font-bold text-slate-500">termes de l'objet</span>${termTagsHtml('bo', { boId: bo.id })}
                    </div>
                    ${
                        rows.length
                            ? `<table class="w-full text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2 w-64">Attribut</th>
                        <th class="p-2">Termes</th>
                                </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">${rows
                                    .map(
                                        r => `<tr class="hover:bg-slate-50"><td class="p-2 font-bold text-slate-700">${r.facet ? '<span class="text-emerald-600">◆</span> ' : '🔹 '}${escapeHTML(r.el.name)}${r.facet ? `<div class="text-[10px] font-medium text-emerald-700">${escapeHTML(r.facet)}</div>` : ''}</td>
                        <td class="p-2">${termTagsHtml('attr', { boId: bo.id, elId: r.el.id })}</td>
                        </tr>`
                                    )
                                    .join('')}</tbody>
                        </table>`
                            : '<p class="text-xs text-slate-400 italic p-3">Aucun attribut.</p>'
                    }
                </div>`;
                })
                .join('');
        }
        function renderGlossaryByAsset() {
            const assets = state.governance.assets || [];
            if (!assets.length)
                return emptyStateHtml(
                    '🖥',
                    'Aucune application ni processus',
                    'Déclarez-les dans « Applis & processus » pour leur poser des termes.',
                    'Applis & processus',
                    "openGovTab('assets')"
                );
            return `<div class="border border-slate-200 rounded-xl bg-white overflow-hidden"><table class="w-full text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2 w-72">Application / processus</th>
                <th class="p-2">Termes</th>
                </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">${assets
                    .map(
                        a => `<tr class="hover:bg-slate-50"><td class="p-2 font-bold text-slate-700">${ASSET_KINDS[a.kind] ? ASSET_KINDS[a.kind][0] : ''} ${escapeHTML(a.name)}<div class="text-[10px] font-medium text-slate-400">${a.kind === 'process' ? 'processus' : 'application'}${a.domain ? ' · ' + escapeHTML(a.domain) : ''}</div>
                </td>
                            <td class="p-2">${termTagsHtml('asset', { assetId: a.id })}</td>
                </tr>`
                    )
                    .join('')}</tbody>
                </table></div>`;
        }
        // ======================= V9.2 : LE GLOSSAIRE PARLE MÉTIER =======================
        // Un terme est un nom métier. Il se pose sur ce qui a un sens pour le métier : un ATTRIBUT
        // d'objet, un OBJET métier, une APPLICATION ou un PROCESSUS — jamais sur une colonne de
        // fichier, qui n'est qu'une provenance technique. Les anciens liens « colonne » sont
        // convertis automatiquement vers l'attribut que la colonne alimente ; ceux qui n'alimentent
        // aucun attribut restent visibles comme héritage, à reporter ou à retirer.
        function termAttrLinks(t2) {
            return Array.isArray(t2.attrLinks) ? t2.attrLinks : (t2.attrLinks = []);
        }
        function termAssetIds(t2) {
            return Array.isArray(t2.assetIds) ? t2.assetIds : (t2.assetIds = []);
        }
        function termAttrRow(l) {
            const bo = (state.governance.businessObjects || []).find(b => b.id === l.boId);
            if (!bo) return null;
            const attributeRow = (boAllAttrRows(bo) || []).find(x => x.el.id === l.elId);
            return attributeRow ? { bo, r: attributeRow } : null;
        }
        // Colonne -> attribut(s) d'objet qu'elle alimente.
        function attrsOfColumn(tn, cn) {
            const out = [];
            (state.governance.businessObjects || []).forEach(bo =>
                (boAllAttrRows(bo) || []).forEach(r => {
                    const hit = r.stId
                        ? r.facet && r.el.col === cn && (getBoFacets(bo).find(x => x.id === r.stId) || {}).table === tn
                        : (r.el.mappings || []).some(m => m.table === tn && m.col === cn);
                    if (hit) out.push({ boId: bo.id, elId: r.el.id, bo, r });
                })
            );
            return out;
        }
        // Migration : chaque lien colonne qui alimente un attribut devient un lien d'attribut.
        function glossaryMigrateLinks() {
            let changed = false;
            (state.governance.glossary || []).forEach(t2 => {
                const keep = [];
                (t2.links || []).forEach(l => {
                    const hits = attrsOfColumn(l.table, l.col);
                    if (!hits.length) {
                        keep.push(l);
                        return;
                    }
                    hits.forEach(h => {
                        if (!termAttrLinks(t2).some(x => x.boId === h.boId && x.elId === h.elId)) {
                            termAttrLinks(t2).push({ boId: h.boId, elId: h.elId });
                            changed = true;
                        }
                        if (!h.r.el.term) {
                            h.r.el.term = t2.id;
                            changed = true;
                        }
                    });
                    changed = true;
                });
                if ((t2.links || []).length !== keep.length) t2.links = keep;
            });
            return changed;
        }
        function renderGovGlossary() {
            if (glossaryMigrateLinks()) persistAppState();
            const bos = state.governance.businessObjects || [];
            const assets = state.governance.assets || [];
            const view = govState.glossView || 'terms';
            if (view === 'bo') return glossViewBar() + renderGlossaryByBo();
            if (view === 'asset') return glossViewBar() + renderGlossaryByAsset();
            let html =
                glossViewBar() +
                `<div class="flex justify-between items-center mb-4 gap-3 flex-wrap"><p class="text-sm text-slate-600">Termes métier officiels. Un terme se pose sur un <b>attribut d'objet</b>, un <b>objet métier</b>, une <b>application</b> ou un <b>processus</b> — jamais sur un fichier : la colonne technique n'est qu'une provenance, elle hérite du terme de l'attribut qu'elle alimente.</p>
                    <button onclick="addGlossaryTerm()" class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap"><i data-lucide="plus" class="w-4 h-4"></i> Nouveau terme</button></div>`;
            if (!state.governance.glossary.length)
                html += emptyStateHtml(
                    '📖',
                    'Aucun terme défini',
                    "Créez le vocabulaire métier officiel, puis reliez chaque terme aux attributs et objets qu'il désigne : il devient un synonyme cherchable dans le catalogue.",
                    'Nouveau terme',
                    'addGlossaryTerm()'
                );
            state.governance.glossary.forEach(g => {
                const tg = termTargets(g);
                // attributs
                const aChips = termAttrLinks(g)
                    .map((l, i) => {
                        const h = termAttrRow(l);
                        if (!h) return '';
                        return `<span class="gl-attr-chip text-xs rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-bold"><button data-ro="keep" onclick="openBoFiche('${h.bo.id}'); govState.boTab='structure'; govState.structView='fiche'; govState.boSel={kind:'attr',stId:'${h.r.stId || ''}',elId:'${h.r.el.id}'}; renderGovernance()" class="hover:underline" title="Ouvrir l'attribut">🔹 ${escapeHTML(h.r.el.name)} <span class="font-normal opacity-80">· ${escapeHTML(h.bo.name)}${h.r.facet ? ' ◆ ' + escapeHTML(h.r.facet) : ''}</span></button><button onclick="removeGlossaryAttr('${g.id}',${i})" class="text-sky-400 hover:text-red-500" title="Retirer">✕</button></span>`;
                    })
                    .join('');
                const firstBo = bos[0];
                const attrOpts = bo =>
                    (boAllAttrRows(bo) || [])
                        .filter(r => !termAttrLinks(g).some(x => x.boId === bo.id && x.elId === r.el.id))
                        .map(
                            r =>
                                `<option value="${r.el.id}">${escapeHTML(r.el.name)}${r.facet ? ' ◆ ' + escapeHTML(r.facet) : ''}</option>`
                        )
                        .join('');
                // applications / processus
                const asChips = termAssetIds(g)
                    .map((id, i) => {
                        const asset = assetById(id);
                        if (!asset) return '';
                        return `<span class="text-xs bg-slate-100 border border-slate-300 text-slate-800 rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-bold">${ASSET_KINDS[asset.kind] ? ASSET_KINDS[asset.kind][0] : ''} ${escapeHTML(asset.name)}<button onclick="removeGlossaryAsset('${g.id}',${i})" class="text-slate-400 hover:text-red-500" title="Retirer">✕</button></span>`;
                    })
                    .join('');
                const asRemain = assets.filter(a => !termAssetIds(g).includes(a.id));
                // héritage : liens colonne sans attribut
                const legacy = (g.links || [])
                    .map(
                        (l, i) =>
                            `<span class="text-xs bg-amber-50 border border-amber-300 text-amber-900 rounded-full px-2.5 py-1 inline-flex items-center gap-1.5" title="Ancien lien vers une colonne de fichier. Rattachez cette colonne à un attribut d'objet métier : le terme suivra automatiquement."><span class="font-mono">${escapeHTML(l.table)}.${escapeHTML(l.col)}</span><span class="text-[10px] uppercase font-bold">héritage</span><button onclick="removeGlossaryLink('${g.id}',${i})" class="text-amber-400 hover:text-red-500" title="Retirer">✕</button></span>`
                    )
                    .join('');
                html += `<div id="gl-card-${g.id}"${typeof govLockAttr === 'function' ? govLockAttr(govCanEdit(String(g.domain || '').trim()), govCanPropose(String(g.domain || '').trim())) : ''} class="border ${govState.glossFocus === g.id ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200'} rounded-xl p-4 mb-3 bg-white">${typeof govLockAttr === 'function' && govLockAttr(govCanEdit(String(g.domain || '').trim()), govCanPropose(String(g.domain || '').trim())) ? govLockBand('le terme « ' + g.term + ' »', String(g.domain || '').trim()) : ''}
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                        <span class="text-lg" aria-hidden="true">📖</span>
                        <input type="text" value="${escapeHTML(g.term)}" onchange="updateGlossaryTerm('${g.id}','term',this.value); renderGovernance()" class="font-bold text-sm border border-slate-300 px-2.5 py-1.5 rounded-lg w-72 bg-white" aria-label="Terme">
                        <span class="text-[11px] text-slate-500">${tg.length ? 'désigne ' + tg.length + ' élément(s)' : '<span class="text-amber-700 font-bold">ne désigne rien pour l\'instant</span>'}</span>
                        <button onclick="removeGlossaryTerm('${g.id}')" class="text-red-500 hover:text-red-700 px-2 py-1 rounded-lg border border-red-200 bg-white text-xs font-bold ml-auto" title="Supprimer le terme">🗑</button>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap mb-2"><span class="text-[10px] uppercase font-bold text-slate-500">Domaine</span>${govDomainSelectHtml(g.domain || '', `updateGlossaryTerm('${g.id}','domain',this.value); renderGovernance()`, '', govFeatureOn() && !govCanEdit(String(g.domain || '').trim()))}${govFeatureOn() && !govCanEdit(String(g.domain || '').trim()) ? '<span class="text-[10px] text-slate-500">🔒 réservé au propriétaire</span>' : ''}</div>
                    <textarea onchange="updateGlossaryTerm('${g.id}','definition',this.value)" placeholder="Définition officielle du terme, en langage métier…" class="w-full border border-slate-200 p-2 rounded-lg text-xs mb-1 bg-white h-14">${escapeHTML(g.definition || '')}</textarea>${propBadgeHtml('term', { termId: g.id }, 'definition')}<div class="mb-2"></div>
                    <div class="flex flex-wrap items-center gap-1.5 mb-2">
                        <span class="text-[10px] uppercase font-bold text-sky-700 w-40">🔹 Attributs d'objet</span>
                        ${aChips || '<span class="text-xs text-slate-400 italic">aucun attribut</span>'}
                        ${bos.length ? `<select id="gl-bo-${g.id}" onchange="glossaryFillAttrs('${g.id}',this.value)" class="border border-slate-300 p-1 rounded text-xs bg-white" aria-label="Objet">${bos.map(b => `<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')}</select><span class="text-slate-400 text-xs">▸</span><select id="gl-attr-${g.id}" class="border border-slate-300 p-1 rounded text-xs bg-white" aria-label="Attribut">${firstBo ? attrOpts(firstBo) : ''}</select><button onclick="addGlossaryAttr('${g.id}')" class="text-xs bg-sky-600 text-white px-2.5 py-1 rounded font-bold">+ Attribut</button>` : '<span class="text-xs text-slate-400 italic">— créez d\'abord un objet métier</span>'}
                    </div>
                    ${boAttachHtml('gl', g)}
                    <div class="flex flex-wrap items-center gap-1.5 mb-1">
                        <span class="text-[10px] uppercase font-bold text-slate-600 w-44">🖥 Applis · ⚙️ Processus</span>
                        ${asChips || '<span class="text-xs text-slate-400 italic">aucune</span>'}
                        ${asRemain.length ? `<select id="gl-as-${g.id}" class="border border-slate-300 p-1 rounded text-xs bg-white" aria-label="Application ou processus">${asRemain.map(a => `<option value="${a.id}">${ASSET_KINDS[a.kind] ? ASSET_KINDS[a.kind][0] : ''} ${escapeHTML(a.name)}</option>`).join('')}</select><button onclick="addGlossaryAsset('${g.id}')" class="text-xs bg-white border border-slate-300 px-2.5 py-1 rounded font-bold hover:bg-slate-50">+ Lier</button>` : assets.length ? '' : '<span class="text-xs text-slate-400 italic">— aucune application déclarée</span>'}
                    </div>
                    ${legacy ? `<div class="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-amber-100"><span class="text-[10px] uppercase font-bold text-amber-700 w-40">📄 Anciens liens fichier</span>${legacy}<span class="text-[11px] text-amber-800">Ces colonnes n'alimentent encore aucun attribut d'objet : rattachez-les dans la fiche de l'objet, le terme suivra.</span></div>` : ''}
                </div>`;
            });
            return html;
        }
        function addGlossaryTerm() {
            state.governance.glossary.push({
                id: 'gl_' + generateId(),
                term: 'Nouveau terme',
                definition: '',
                links: [],
                attrLinks: [],
                assetIds: []
            });
            persistAppState();
            renderGovernance();
        }
        function updateGlossaryTerm(id, f, v) {
            const term = state.governance.glossary.find(x => x.id === id);
            if (term) {
                term[f] = v;
                persistAppState();
            }
        }
        function removeGlossaryTerm(id) {
            state.governance.glossary = state.governance.glossary.filter(x => x.id !== id);
            // l'attribut ne doit pas garder l'identifiant d'un terme disparu
            (state.governance.businessObjects || []).forEach(bo =>
                (boAllAttrRows(bo) || []).forEach(r => {
                    if (r.el.term === id) r.el.term = '';
                })
            );
            persistAppState();
            renderGovernance();
        }
        function glossaryFillAttrs(id, boId) {
            const term = state.governance.glossary.find(x => x.id === id);
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId);
            const sel2 = el('gl-attr-' + id);
            if (!term || !bo || !sel2) return;
            sel2.innerHTML = (boAllAttrRows(bo) || [])
                .filter(r => !termAttrLinks(term).some(x => x.boId === bo.id && x.elId === r.el.id))
                .map(
                    r =>
                        `<option value="${r.el.id}">${escapeHTML(r.el.name)}${r.facet ? ' ◆ ' + escapeHTML(r.facet) : ''}</option>`
                )
                .join('');
        }
        // Lier un terme à un attribut : le lien est porté des deux côtés (glossaire + « Terme » de l'attribut).
        function glossaryLinkAttr(termId, boId, elId) {
            const term = state.governance.glossary.find(x => x.id === termId);
            if (!term) return false;
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId);
            if (!bo) return false;
            const attributeRow = (boAllAttrRows(bo) || []).find(x => x.el.id === elId);
            if (!attributeRow) return false;
            if (!termAttrLinks(term).some(x => x.boId === boId && x.elId === elId)) termAttrLinks(term).push({ boId, elId });
            if (!attributeRow.el.term) attributeRow.el.term = termId;
            persistAppState();
            return true;
        }
        // Depuis le formulaire d'attribut : changer de terme retire le lien de l'ancien, pose le nouveau.
        function boAttrSetTerm(boId, stId, elId, termId) {
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId);
            if (!bo) return;
            const attributeRow = (boAllAttrRows(bo) || []).find(x => x.el.id === elId);
            if (!attributeRow) return;
            const prev = attributeRow.el.term || '';
            if (prev && prev !== termId) {
                const term = state.governance.glossary.find(x => x.id === prev);
                if (term) term.attrLinks = termAttrLinks(term).filter(x => !(x.boId === boId && x.elId === elId));
            }
            attributeRow.el.term = termId || '';
            if (termId) glossaryLinkAttr(termId, boId, elId);
            persistAppState();
            renderGovernance();
        }
        function addGlossaryAttr(id) {
            const boId = (el('gl-bo-' + id) || {}).value,
                elId = (el('gl-attr-' + id) || {}).value;
            if (!boId || !elId) return;
            if (glossaryLinkAttr(id, boId, elId)) renderGovernance();
        }
        function removeGlossaryAttr(id, idx) {
            const term = state.governance.glossary.find(x => x.id === id);
            if (!term) return;
            const l = termAttrLinks(term)[idx];
            if (!l) return;
            termAttrLinks(term).splice(idx, 1);
            const h = termAttrRow(l);
            if (h && h.r.el.term === id) h.r.el.term = '';
            persistAppState();
            renderGovernance();
        }
        function addGlossaryAsset(id) {
            const term = state.governance.glossary.find(x => x.id === id);
            const aid = (el('gl-as-' + id) || {}).value;
            if (!term || !aid) return;
            if (!termAssetIds(term).includes(aid)) termAssetIds(term).push(aid);
            persistAppState();
            renderGovernance();
        }
        function removeGlossaryAsset(id, idx) {
            const term = state.governance.glossary.find(x => x.id === id);
            if (!term) return;
            termAssetIds(term).splice(idx, 1);
            persistAppState();
            renderGovernance();
        }
        // V9.2.2 — Cellule « Terme(s) » du dictionnaire : le terme principal (champ « Terme » de
        // l'attribut) ET tous les autres termes posés depuis le glossaire, avec ajout / retrait sur
        // place. Un attribut peut porter plusieurs noms métier ; le dictionnaire les montre tous.
        function attrTermsCellHtml(bo, stId, elId) {
            const bo2 = typeof bo === 'string' ? (state.governance.businessObjects || []).find(b => b.id === bo) : bo;
            if (!bo2) return '';
            return termTagsHtml('attr', { boId: bo2.id, elId });
        }
        function attrTermUnlink(termId, boId, elId) {
            const term = state.governance.glossary.find(x => x.id === termId);
            if (!term) return;
            term.attrLinks = termAttrLinks(term).filter(x => !(x.boId === boId && x.elId === elId));
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId);
            const attributeRow = bo && (boAllAttrRows(bo) || []).find(x => x.el.id === elId);
            if (attributeRow && attributeRow.el.term === termId) attributeRow.el.term = '';
            persistAppState();
            renderGovernance();
        }
        // Termes d'une COLONNE technique : le sien (dictionnaire) + ceux hérités de l'attribut alimenté.
        function colTermsPillsHtml(tn, cn, ownTerm) {
            const inh = termsOfColumn(tn, cn).filter(t2 => t2.id !== ownTerm);
            return inh.length ? `<div class="mt-1">${termTagsHtml('col', {}, { readOnly: true, inherited: inh })}</div>` : '';
        }
        function termsOfAsset(aid) {
            return (state.governance.glossary || []).filter(t2 => termAssetIds(t2).includes(aid));
        }
        function termsOfAttr(boId, elId) {
            return (state.governance.glossary || []).filter(
                t2 =>
                    termAttrLinks(t2).some(x => x.boId === boId && x.elId === elId) ||
                    (() => {
                        const h = termAttrRow({ boId, elId });
                        return h && h.r.el.term === t2.id;
                    })()
            );
        }
        function populateGlossLinkCols(id, tableName) {
            const table = tableByName(tableName);
            const element = el('gl-col-' + id);
            if (element)
                element.innerHTML = (table ? table.headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join('');
        }
        function addGlossaryLink(id) {
            const term = state.governance.glossary.find(x => x.id === id);
            if (!term) return;
            const tbl = el('gl-tbl-' + id).value,
                col = el('gl-col-' + id).value;
            if (!tbl || !col) return;
            term.links = term.links || [];
            if (!term.links.some(l => l.table === tbl && l.col === col)) term.links.push({ table: tbl, col });
            persistAppState();
            renderGovernance();
        }
        function removeGlossaryLink(id, idx) {
            const term = state.governance.glossary.find(x => x.id === id);
            if (term && term.links) {
                term.links.splice(idx, 1);
                persistAppState();
                renderGovernance();
            }
        }
