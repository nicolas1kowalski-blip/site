        // ======================= V12 : ORIGINE D'UN ATTRIBUT DANS UN AUTRE OBJET MÉTIER =======================
        // Un attribut peut provenir d'un attribut d'un AUTRE objet (copie, dérivation, agrégation). Jusqu'ici la
        // provenance ne connaissait que la colonne technique et l'application source : le lineage s'arrêtait là.
        // Ici : déclaration dans la fiche de l'attribut (e2.origins = [{ boId, elId, kind, rule }]), provenance
        // héritée quand il n'y a pas de colonne, chaîne complète dans le graphe d'attribut, la vue par attribut
        // et la carte des flux, « réutilisé par » sur l'attribut d'origine, refus des boucles. Moteur inchangé.
        const V12_ORG_KINDS = {
            copy: [
                'Copie',
                'copié de',
                "La même valeur, reprise telle quelle. Une ligne d'origine donne une ligne ici, sans transformation.",
                'Contrat › Adresse de risque = Personne › Adresse'
            ],
            derived: [
                'Dérivé',
                'dérivé de',
                "Une valeur calculée ou transformée à partir de l'origine : toujours une ligne pour une ligne, mais la valeur change (formule, format, découpage, règle).",
                'Âge dérivé de Personne › Date de naissance · Date de fin = Date de début + Durée'
            ],
            agg: [
                'Agrégé',
                'agrégé de',
                "Une valeur qui résume plusieurs lignes de l'origine : somme, nombre, moyenne, minimum, maximum, dernière valeur.",
                'Contrat › Montant des sinistres = somme de Sinistre › Montant · Nombre de contrats du client = nombre de Contrat'
            ]
        };
        function v12OrgGuideHtml(open) {
            return `<details class="v12o-guide" ${open ? 'open' : ''}><summary>Quelle nature choisir ? Copie, dérivé ou agrégé</summary>
                <div class="v12o-cards">${Object.entries(V12_ORG_KINDS)
                    .map(
                        ([k, l]) =>
                            `<div class="v12o-card k-${k}"><b>${l[0]}</b><span class="v12o-arrow">${k === 'copy' ? '1 ligne → 1 ligne, valeur identique' : k === 'derived' ? '1 ligne → 1 ligne, valeur transformée' : 'N lignes → 1 valeur'}</span><p>${l[2]}</p>
                                <em>Ex. ${escapeHTML(l[3])}</em></div>`
                    )
                    .join('')}</div>
                <div class="v12o-rule">En un mot : <b>même valeur</b> → Copie · <b>une ligne transformée</b> → Dérivé · <b>plusieurs lignes résumées</b> → Agrégé. Dans le doute, écrivez la règle en clair dans le champ prévu.</div>
                        </details>`;
        }
        function v12OrgFindAttr(boId, elId) {
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId);
            if (!bo) return null;
            const attributeRow = (boAllAttrRows(bo) || []).find(x => x.el.id === elId);
            return attributeRow ? { bo, r: attributeRow } : null;
        }
        function v12OrgList(e2) {
            return (e2 && Array.isArray(e2.origins) ? e2.origins : []).filter(o => o && v12OrgFindAttr(o.boId, o.elId));
        }
        function v12OrgLabel(o) {
            const origin = v12OrgFindAttr(o.boId, o.elId);
            return origin ? origin.bo.name + ' › ' + origin.r.el.name : '?';
        }
        function v12OrgKindLbl(k) {
            return (V12_ORG_KINDS[k] || V12_ORG_KINDS.copy)[0];
        }
        // Boucle : l'attribut cible (boId/elId) remonte-t-il, de proche en proche, jusqu'à (fromBoId/fromElId) ?
        function v12OrgReaches(boId, elId, fromBoId, fromElId, seen) {
            seen = seen || new Set();
            const k = boId + '|' + elId;
            if (seen.has(k)) return false;
            seen.add(k);
            if (boId === fromBoId && elId === fromElId) return true;
            const origin = v12OrgFindAttr(boId, elId);
            if (!origin) return false;
            return v12OrgList(origin.r.el).some(o => v12OrgReaches(o.boId, o.elId, fromBoId, fromElId, seen));
        }
        function v12OrgDependents(boId, elId) {
            const out = [];
            (state.governance.businessObjects || []).forEach(bo =>
                (boAllAttrRows(bo) || []).forEach(r =>
                    v12OrgList(r.el).forEach(o => {
                        if (o.boId === boId && o.elId === elId) out.push({ bo, r, o });
                    })
                )
            );
            return out;
        }
        function v12OrgEl(boId, stId, elId) {
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId);
            if (!bo) return null;
            const attributeRow = (boAllAttrRows(bo) || []).find(x => x.el.id === elId && (x.stId || '') === (stId || ''));
            return attributeRow ? attributeRow.el : null;
        }
        // ---- actions ----
        function v12OrgAdd(boId, stId, elId) {
            const originAttribute = v12OrgEl(boId, stId, elId);
            if (!originAttribute) return;
            const tBo = (el('v12org-bo-' + elId) || {}).value,
                tEl = (el('v12org-el-' + elId) || {}).value,
                kind = (el('v12org-kind-' + elId) || {}).value || 'copy',
                rule = ((el('v12org-rule-' + elId) || {}).value || '').trim();
            if (!tBo || !tEl) return showError("Choisissez l'objet et l'attribut d'origine.");
            if (tBo === boId && tEl === elId) return showError('Un attribut ne peut pas provenir de lui-même.');
            if (v12OrgReaches(tBo, tEl, boId, elId))
                return showError(
                    'Boucle refusée : « ' +
                        v12OrgLabel({ boId: tBo, elId: tEl }) +
                        ' » provient déjà, directement ou non, de cet attribut.'
                );
            originAttribute.origins = Array.isArray(originAttribute.origins) ? originAttribute.origins : [];
            if (originAttribute.origins.some(o => o.boId === tBo && o.elId === tEl))
                return showError('Cette origine est déjà déclarée.');
            originAttribute.origins.push({ boId: tBo, elId: tEl, kind, rule });
            persistAppState();
            renderGovernance();
            showSuccess(
                'Origine déclarée : « ' +
                    v12OrgLabel({ boId: tBo, elId: tEl }) +
                    ' » (' +
                    v12OrgKindLbl(kind).toLowerCase() +
                    "). Le lineage remonte maintenant jusqu'à cet objet."
            );
        }
        function v12OrgRemove(boId, stId, elId, i) {
            const originAttribute = v12OrgEl(boId, stId, elId);
            if (!originAttribute || !Array.isArray(originAttribute.origins)) return;
            originAttribute.origins.splice(i, 1);
            persistAppState();
            renderGovernance();
        }
        function v12OrgSet(boId, stId, elId, i, f, v) {
            const originAttribute = v12OrgEl(boId, stId, elId);
            const o = originAttribute && Array.isArray(originAttribute.origins) && originAttribute.origins[i];
            if (!o) return;
            o[f] = f === 'rule' ? String(v || '').trim() : v;
            persistAppState();
            if (f !== 'rule') renderGovernance();
        }
        function v12OrgBoChanged(elId, tBo) {
            const element = el('v12org-el-' + elId);
            if (!element) return;
            const bo = (state.governance.businessObjects || []).find(b => b.id === tBo);
            element.innerHTML = bo
                ? (boAllAttrRows(bo) || [])
                      .map(
                          r =>
                              `<option value="${r.el.id}">${escapeHTML(r.el.name)}${r.facet ? ' (◆ ' + escapeHTML(r.facet) + ')' : ''}</option>`
                      )
                      .join('')
                : '';
        }
        function v12OrgGo(boId, stId, elId) {
            if (typeof v11EditAttr === 'function') v11EditAttr(boId, stId || '', elId);
            else {
                govState.selectedBoId = boId;
                govState.boTab = 'structure';
                govState.structView = 'fiche';
                govState.boSel = { kind: 'attr', stId: stId || '', elId };
                renderGovernance();
            }
        }
        if (typeof govWrapBoAction === 'function') {
            govWrapBoAction('v12OrgAdd', "Déclarer l'origine d'un attribut", 0);
            govWrapBoAction('v12OrgRemove', "Retirer l'origine d'un attribut", 0);
            govWrapBoAction('v12OrgSet', "Modifier l'origine d'un attribut", 0);
        }
        // ---- provenance : un attribut hérité compte comme alimenté ----
        Studio.extend(
            'boAttrHasMap',
            base =>
                function (r) {
                    return base(r) || v12OrgList(r.el).length > 0;
                }
        );
        Studio.extend(
            'boAttrProv',
            base =>
                function (r) {
                    const p = base(r);
                    const orgs = v12OrgList(r.el);
                    if (!orgs.length) return p;
                    const h = orgs.map(o => v12OrgLabel(o)).join(' · ');
                    return p ? p + ' · hérité de ' + h : 'hérité de ' + h;
                }
        );
        // ---- formulaire de l'attribut ----
        function v12OrgFormHtml(bo, r) {
            const attribute = r.el,
                stId = r.stId || '';
            const orgs = v12OrgList(attribute);
            const others = (state.governance.businessObjects || []).filter(b => b.id !== bo.id);
            const A = `'${bo.id}','${stId}','${attribute.id}'`;
            const chips = orgs
                .map((o, i) => {
                    const origin = v12OrgFindAttr(o.boId, o.elId);
                    return `<div class="v12o-chip"><button class="v12o-go" data-ro="keep" onclick="v12OrgGo('${o.boId}','${origin.r.stId || ''}','${o.elId}')" title="Ouvrir l'attribut d'origine">🏛️ <b>${escapeHTML(origin.bo.name)}</b> › ${escapeHTML(origin.r.el.name)}</button>
                <select onchange="v12OrgSet(${A},${i},'kind',this.value)" title="${escapeHTML((V12_ORG_KINDS[o.kind] || V12_ORG_KINDS.copy)[2])}">${Object.entries(
                    V12_ORG_KINDS
                )
                    .map(
                        ([k, l]) =>
                            `<option value="${k}" ${o.kind === k ? 'selected' : ''} title="${escapeHTML(l[2])}">${l[0]}</option>`
                    )
                    .join('')}</select>
                <input type="text" value="${escapeHTML(o.rule || '')}" onchange="v12OrgSet(${A},${i},'rule',this.value)" placeholder="${o.kind === 'copy' ? 'règle (facultatif)' : 'règle : ex. date de début + durée'}" title="Comment la valeur est obtenue">
                <button class="v12o-x" onclick="v12OrgRemove(${A},${i})" title="Retirer cette origine">✕</button></div>`;
                })
                .join('');
            const first = others[0];
            const attrOpts = first
                ? (boAllAttrRows(first) || [])
                      .map(
                          x =>
                              `<option value="${x.el.id}">${escapeHTML(x.el.name)}${x.facet ? ' (◆ ' + escapeHTML(x.facet) + ')' : ''}</option>`
                      )
                      .join('')
                : '';
            const add = others.length
                ? `<div class="v12o-add" data-ro="keep"><span class="lbl">Ajouter une origine</span>
                <select id="v12org-bo-${attribute.id}" onchange="v12OrgBoChanged('${attribute.id}', this.value)" aria-label="Objet d'origine">${others.map(b => `<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')}</select><span class="text-slate-400 text-xs">›</span>
                <select id="v12org-el-${attribute.id}" aria-label="Attribut d'origine">${attrOpts}</select>
                <select id="v12org-kind-${attribute.id}" aria-label="Nature" title="${escapeHTML(V12_ORG_KINDS.copy[2])}" onchange="this.title = ({copy:${JSON.stringify(V12_ORG_KINDS.copy[2])},derived:${JSON.stringify(V12_ORG_KINDS.derived[2])},agg:${JSON.stringify(V12_ORG_KINDS.agg[2])}})[this.value]">${Object.entries(
                    V12_ORG_KINDS
                )
                    .map(([k, l]) => `<option value="${k}" title="${escapeHTML(l[2])}">${l[0]}</option>`)
                    .join('')}</select>
                <input type="text" id="v12org-rule-${attribute.id}" placeholder="règle (facultatif)">
                <button onclick="v12OrgAdd(${A})" class="bg-violet-600 text-white">+ Origine</button></div>`
                : '<p class="text-[12px] text-slate-500 italic">Créez un second objet métier pour pouvoir déclarer une origine.</p>';
            const deps = v12OrgDependents(bo.id, attribute.id);
            const depHtml = deps.length
                ? `<div class="v12o-deps"><h5>Réutilisé par</h5><div class="flex flex-wrap gap-1.5">${deps.map(d => `<button class="v12o-dep" data-ro="keep" onclick="v12OrgGo('${d.bo.id}','${d.r.stId || ''}','${d.r.el.id}')" title="${escapeHTML(V12_ORG_KINDS[d.o.kind] ? V12_ORG_KINDS[d.o.kind][2] : '')}">🏛️ <b>${escapeHTML(d.bo.name)}</b> › ${escapeHTML(d.r.el.name)} <span>${escapeHTML(v12OrgKindLbl(d.o.kind).toLowerCase())}</span></button>`).join('')}</div>
                    <div class="hint">Si cette donnée change, ces attributs changent avec elle.</div>
                    </div>`
                : '';
            return `<div class="bo-sect v12o-sect"><h4>Provient d'un autre objet métier</h4>
                <p class="v12o-hint">Quand cet attribut reprend ou dérive d'un attribut d'un autre objet, déclarez-le ici : le lineage remonte toute la chaîne et la colonne technique devient facultative.</p>
                ${orgs.length ? `<div class="v12o-list">${chips}</div>` : ''}${add}${v12OrgGuideHtml(!orgs.length)}${depHtml}</div>`;
        }
        Studio.extend(
            'boAttrFormHtml',
            base =>
                function (bo, r, names) {
                    let h = base.apply(this, arguments);
                    try {
                        const blk = v12OrgFormHtml(bo, r);
                        const mark = '<div class="bo-sect"><h4>Usages';
                        h = h.includes(mark) ? h.replace(mark, blk + mark) : h + blk;
                        const orgs = v12OrgList(r.el);
                        if (orgs.length) {
                            const lbl = orgs.map(o => escapeHTML(v12OrgLabel(o))).join(', ');
                            h = h.replace(
                                '<span class="bo-map-none">⚠ non alimenté — choisissez la colonne technique ci-dessous</span>',
                                `<span class="bo-map-none v12o-inh">↳ hérité de ${lbl} — colonne technique facultative</span>`
                            );
                        }
                    } catch (e) {
                        console.warn('v12 origines', e);
                    }
                    return h;
                }
        );
        // ---- graphe de lineage de l'attribut : on remonte les origines, on descend les dépendants ----
        Studio.extend(
            'buildAttrLineageGraph',
            base =>
                function (bo, st, e2, _depth) {
                    const graph = base(bo, st, e2);
                    const d = _depth || 0;
                    const orgs = v12OrgList(e2);
                    const attrId = 'attr:' + e2.id;
                    const purple = { stroke: '#7c3aed', lineWidth: 2, endArrow: { path: '', fill: '#7c3aed' } };
                    if (orgs.length && d < 6) {
                        graph.nodes = graph.nodes.filter(n => n.id !== 'nosrc');
                        graph.edges = graph.edges.filter(e => e.source !== 'nosrc' && e.target !== 'nosrc');
                        orgs.forEach((o, k) => {
                            const origin = v12OrgFindAttr(o.boId, o.elId);
                            if (!origin) return;
                            const ost = origin.r.stId ? getBoFacets(origin.bo).find(x => x.id === origin.r.stId) : null;
                            const sub = buildAttrLineageGraph(origin.bo, ost, origin.r.el, d + 1);
                            const pre = 'o' + d + k + '_';
                            const ren = id => (String(id).startsWith('as:') ? id : pre + id);
                            const skip = id => id === 'nouse' || String(id).startsWith('use:') || String(id).startsWith('dep:');
                            sub.nodes.forEach(n => {
                                if (skip(n.id)) return;
                                const id = ren(n.id);
                                if (graph.nodes.some(x => x.id === id)) return;
                                const nn = Object.assign({}, n, { id });
                                if (n.id === 'attr:' + origin.r.el.id) {
                                    nn.fill = '#ede9fe';
                                    nn.stroke = '#7c3aed';
                                }
                                graph.nodes.push(nn);
                            });
                            sub.edges.forEach(e => {
                                if (skip(e.source) || skip(e.target)) return;
                                const id = pre + e.id;
                                if (graph.edges.some(x => x.id === id)) return;
                                graph.edges.push(Object.assign({}, e, { id, source: ren(e.source), target: ren(e.target) }));
                            });
                            graph.edges.push({
                                id: pre + 'org',
                                source: ren('attr:' + origin.r.el.id),
                                target: attrId,
                                label: (V12_ORG_KINDS[o.kind] || V12_ORG_KINDS.copy)[1] + (o.rule ? ' · ' + o.rule : ''),
                                style: purple
                            });
                        });
                    }
                    if (!d)
                        v12OrgDependents(bo.id, e2.id).forEach((dp, k) => {
                            const id = 'dep:' + dp.bo.id + ':' + dp.r.el.id;
                            if (graph.nodes.some(x => x.id === id)) return;
                            graph.nodes.push({
                                id,
                                type: 'studio-rich-node',
                                title: '🔹 ' + dp.r.el.name,
                                content: '🏛️ ' + dp.bo.name + ' · ' + v12OrgKindLbl(dp.o.kind).toLowerCase(),
                                fill: '#ede9fe',
                                stroke: '#7c3aed'
                            });
                            graph.edges.push({
                                id: 'edep' + k,
                                source: attrId,
                                target: id,
                                label: 'repris par',
                                style: purple
                            });
                        });
                    return graph;
                }
        );
        // ---- vue par attribut (colonnes) : une colonne « Objets amont » entre les colonnes techniques et les attributs ----
        Studio.extend(
            'renderAttrFlow',
            base =>
                function (wrap) {
                    base.apply(this, arguments);
                    try {
                        if (!_afData) return;
                        const board = el('afBoard');
                        if (!board) return;
                        const bo = (state.governance.businessObjects || []).find(b => b.id === govState.lineageAttrBo);
                        if (!bo) return;
                        const cols = board.querySelectorAll(':scope > div.flex-1');
                        if (cols.length < 4) return;
                        const pill = (fid, main, sub, cls) => {
                            const divElement = document.createElement('div');
                            divElement.setAttribute('data-fid', fid);
                            divElement.setAttribute('onclick', `attrFlowClick('${fid}')`);
                            divElement.className =
                                'af-pill cursor-pointer border rounded-lg px-2.5 py-1.5 mb-1.5 text-[11px] leading-tight ' +
                                cls;
                            divElement.innerHTML = `<div class="font-bold truncate">${main}</div>${sub ? `<div class="text-[9px] opacity-70 truncate">${sub}</div>` : ''}`;
                            return divElement;
                        };
                        const has = fid => !!board.querySelector(`[data-fid="${CSS.escape(fid)}"]`);
                        const seen = new Map();
                        const addOrigin = (o, targetFid, depth) => {
                            const origin = v12OrgFindAttr(o.boId, o.elId);
                            if (!origin) return;
                            const fid = 'o:' + o.boId + ':' + o.elId;
                            _afData.links.push([fid, targetFid]);
                            if (seen.has(fid) || depth > 6) return;
                            seen.set(fid, { f: origin, o });
                            const ft = origin.r.stId
                                ? (getBoFacets(origin.bo).find(x => x.id === origin.r.stId) || {}).table
                                : null;
                            const maps = origin.r.stId
                                ? origin.r.el.col
                                    ? [{ table: ft, col: origin.r.el.col }]
                                    : []
                                : origin.r.el.mappings || [];
                            const app = assetById(origin.r.el.sourceApp) || assetById((origin.bo.producedBy || [])[0]) || null;
                            if (app && !has('p:' + app.id))
                                cols[0].appendChild(
                                    pill(
                                        'p:' + app.id,
                                        '🖥 ' + escapeHTML(app.name),
                                        'source de ' + escapeHTML(origin.bo.name),
                                        'bg-slate-100 border-slate-300 text-slate-700'
                                    )
                                );
                            maps.forEach(m => {
                                const key = m.table + '.' + m.col;
                                if (!has('c:' + key))
                                    cols[1].appendChild(
                                        pill(
                                            'c:' + key,
                                            escapeHTML(m.col),
                                            escapeHTML(m.table),
                                            'bg-blue-50 border-blue-200 text-blue-800'
                                        )
                                    );
                                _afData.links.push(['c:' + key, fid]);
                                if (app) _afData.links.push(['p:' + app.id, 'c:' + key]);
                            });
                            if (!maps.length && app) _afData.links.push(['p:' + app.id, fid]);
                            v12OrgList(origin.r.el).forEach(o2 => addOrigin(o2, fid, depth + 1)); // l'origine hérite elle-même : on remonte encore
                        };
                        (boAllAttrRows(bo) || []).forEach(r =>
                            v12OrgList(r.el).forEach(o => {
                                const origin = v12OrgFindAttr(o.boId, o.elId);
                                if (!origin) return;
                                const aid = 'a:' + r.el.id;
                                if (_afData.attrs[aid])
                                    (_afData.attrs[aid].origins = _afData.attrs[aid].origins || []).push({
                                        name: origin.r.el.name,
                                        bo: origin.bo.name,
                                        kind: o.kind
                                    });
                                addOrigin(o, aid, 0);
                            })
                        );
                        if (!seen.size) return;
                        const col = document.createElement('div');
                        col.className = 'flex-1 min-w-[160px] relative z-10';
                        col.innerHTML =
                            '<div class="text-[10px] uppercase font-bold text-slate-400 mb-1.5 text-center">🏛️ Objets amont</div>';
                        seen.forEach(({ f, o }, fid) =>
                            col.appendChild(
                                pill(
                                    fid,
                                    '🏛️ ' + escapeHTML(f.bo.name) + ' › ' + escapeHTML(f.r.el.name),
                                    v12OrgKindLbl(o.kind) + (o.rule ? ' · ' + escapeHTML(o.rule) : ''),
                                    'bg-violet-50 border-violet-300 text-violet-900'
                                )
                            )
                        );
                        board.insertBefore(col, cols[2]);
                        requestAnimationFrame(attrFlowDraw);
                    } catch (e) {
                        console.warn('v12 origines flux', e);
                    }
                }
        );
        Studio.extend(
            'attrFlowCard',
            base =>
                function (fid) {
                    base.apply(this, arguments);
                    try {
                        const box = el('afCard');
                        const a = _afData && _afData.attrs ? _afData.attrs[fid] : null;
                        if (!box || !a || !(a.origins || []).length) return;
                        const zone = box.querySelector('.flex-1');
                        if (!zone) return;
                        const empty = zone.querySelector('.italic');
                        if (empty) empty.remove();
                        a.origins.forEach(o => {
                            const divElement = document.createElement('div');
                            divElement.className =
                                'text-[11px] bg-violet-50 border-violet-300 text-violet-900 border rounded px-2 py-1 mb-1 truncate font-semibold';
                            divElement.innerHTML =
                                '🏛️ ' +
                                escapeHTML(o.bo) +
                                ' › ' +
                                escapeHTML(o.name) +
                                ' <span class="opacity-60">(' +
                                escapeHTML(v12OrgKindLbl(o.kind).toLowerCase()) +
                                ')</span>';
                            zone.appendChild(divElement);
                        });
                    } catch (e) {}
                }
        );
        // ---- carte des flux : une flèche entre objets quand au moins un attribut hérite ----
        function v12OrgLineageEdges(d) {
            if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) return;
            const ids = new Set(d.nodes.map(n => n.id));
            const pairs = new Map();
            (state.governance.businessObjects || []).forEach(bo =>
                (boAllAttrRows(bo) || []).forEach(r =>
                    v12OrgList(r.el).forEach(o => {
                        if (o.boId === bo.id) return;
                        const k = o.boId + '>' + bo.id;
                        pairs.set(k, (pairs.get(k) || 0) + 1);
                    })
                )
            );
            pairs.forEach((n, k) => {
                const [from, to] = k.split('>');
                if (!ids.has('bo:' + from) || !ids.has('bo:' + to)) return;
                d.edges.push({
                    id: 'org:' + k,
                    source: 'bo:' + from,
                    target: 'bo:' + to,
                    label: n + ' attribut(s) repris',
                    style: { stroke: '#7c3aed', lineWidth: 2, lineDash: [6, 3], endArrow: { path: '', fill: '#7c3aed' } }
                });
            });
        }
        Studio.extend(
            '_renderLineageImpl',
            base =>
                function () {
                    v12State.linOn = true;
                    try {
                        return base.apply(this, arguments);
                    } finally {
                        v12State.linOn = false;
                    }
                }
        );
        Studio.extend(
            'createSvgGraph',
            base =>
                function () {
                    const result = base.apply(this, arguments);
                    if (v12State.linOn && result && typeof result.data === 'function') {
                        const _d = result.data;
                        result.data = function (d) {
                            try {
                                v12OrgLineageEdges(d);
                            } catch (e) {}
                            return _d.call(this, d);
                        };
                    }
                    return result;
                }
        );
        // ---- fiche en lecture (V11) : la provenance héritée remplace « non alimenté » ----
        Studio.extend(
            'v11BoRead',
            base =>
                function (bo) {
                    let h = base.apply(this, arguments);
                    try {
                        (boAllAttrRows(bo) || []).forEach(r => {
                            const orgs = v12OrgList(r.el);
                            if (!orgs.length) return;
                            const key = `'${r.el.id}')`;
                            const i = h.indexOf(key);
                            if (i < 0) return;
                            const end = h.indexOf('</tr>', i);
                            if (end < 0) return;
                            const row = h.slice(i, end);
                            const inh = orgs
                                .map(o => `<span class="v12o-inh-cell">↳ ${escapeHTML(v12OrgLabel(o))}</span>`)
                                .join('<br>');
                            const nr = row.includes('<span class="dim">non alimenté</span>')
                                ? row.replace('<span class="dim">non alimenté</span>', inh)
                                : row.replace(
                                      /(<td>)([^<]*(?:<br>[^<]*)*)(<\/td><td>)/,
                                      (m, a, b, c) => a + b + '<br>' + inh + c
                                  );
                            h = h.slice(0, i) + nr + h.slice(end);
                        });
                    } catch (e) {}
                    return h;
                }
        );
        // catalogue : section « Provient d'un autre objet » dans la fiche d'une information
        Studio.extend(
            'catOpenFiche',
            base =>
                function (i) {
                    const result = base.apply(this, arguments);
                    try {
                        const e2 = (typeof catRes !== 'undefined' ? catRes : [])[i];
                        const body = el('uxDrawerBody');
                        if (!e2 || e2.type !== 'attr' || !body) return result;
                        const bo = (state.governance.businessObjects || []).find(b => b.id === e2.bo);
                        const row = bo && (boAllAttrRows(bo) || []).find(x => x.el.id === e2.elId);
                        if (!row) return result;
                        const orgs = v12OrgList(row.el);
                        const deps = v12OrgDependents(bo.id, row.el.id);
                        if (!orgs.length && !deps.length) return result;
                        const sect = document.createElement('div');
                        sect.className = 'dsect';
                        sect.innerHTML = `<h4>Provient d'un autre objet</h4>${
                            orgs.length
                                ? orgs
                                      .map(o => {
                                          const origin = v12OrgFindAttr(o.boId, o.elId);
                                          return `<button data-ro="keep" onclick="v12OrgGo('${o.boId}','${origin.r.stId || ''}','${o.elId}')" class="w-full flex items-center gap-2.5 border border-slate-100 rounded-lg px-2.5 py-2 mb-1.5 text-left text-[12px]"><span>🏛️</span><span class="font-bold">${escapeHTML(origin.bo.name)} › ${escapeHTML(origin.r.el.name)}</span><span class="text-[11px] text-slate-500">${escapeHTML(v12OrgKindLbl(o.kind).toLowerCase())}${o.rule ? ' · ' + escapeHTML(o.rule) : ''}</span></button>`;
                                      })
                                      .join('')
                                : '<p class="text-[11.5px] text-slate-400 italic">Aucune origine déclarée.</p>'
                        }${deps.length ? `<h4 style="margin-top:8px">Réutilisé par</h4>${deps.map(d => `<button data-ro="keep" onclick="v12OrgGo('${d.bo.id}','${d.r.stId || ''}','${d.r.el.id}')" class="w-full flex items-center gap-2.5 border border-slate-100 rounded-lg px-2.5 py-2 mb-1.5 text-left text-[12px]"><span>🏛️</span><span class="font-bold">${escapeHTML(d.bo.name)} › ${escapeHTML(d.r.el.name)}</span><span class="text-[11px] text-slate-500">${escapeHTML(v12OrgKindLbl(d.o.kind).toLowerCase())}</span></button>`).join('')}` : ''}`;
                        const anchor = Array.from(body.querySelectorAll('.dsect')).find(d =>
                            /Alimenté par/.test(d.textContent)
                        );
                        if (anchor) anchor.insertAdjacentElement('afterend', sect);
                        else body.appendChild(sect);
                    } catch (e) {}
                    return result;
                }
        );
        Object.assign(V11_LEXIQUE, {
            'origine':
                "Attribut d'un autre objet métier dont cet attribut est la copie, la dérivation ou l'agrégation : le lineage remonte alors jusqu'à lui.",
            'copie':
                'Origine « copie » : la même valeur reprise telle quelle, une ligne pour une ligne (ex. adresse de risque du contrat = adresse de la personne).',
            'dérivé':
                "Origine « dérivé » : une valeur calculée ou transformée à partir de l'origine, toujours une ligne pour une ligne (ex. âge dérivé de la date de naissance).",
            'agrégé':
                "Origine « agrégé » : une valeur qui résume plusieurs lignes de l'origine — somme, nombre, moyenne, dernier (ex. montant total des sinistres du contrat)."
        });
