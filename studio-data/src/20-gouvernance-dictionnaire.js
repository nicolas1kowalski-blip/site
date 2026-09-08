        // ==========================================
        //  GOUVERNANCE : DICTIONNAIRE / PÉRIMÈTRES / GLOSSAIRE / CAS D'USAGE / LINEAGE
        // ==========================================
        const SENSITIVITY_OPTS = ['Public', 'Interne', 'Personnel (RGPD)', 'Sensible'];
        const STATUS_OPTS = ['Brouillon', 'Proposé', 'Validé', 'Obsolète'];
        // E7 : transition de statut horodatée + attribuée + historisée (dictionnaire & objets métier).
        function wfTransition(entry, newStatus, comment) {
            const from = entry.status || 'Brouillon';
            if (from === newStatus) return;
            entry.status = newStatus;
            entry.statusAt = new Date().toISOString();
            entry.statusBy = (state.governance.reviewer || '').trim() || '(non renseigné)';
            entry.history = entry.history || [];
            entry.history.push({ at: entry.statusAt, from, to: newStatus, by: entry.statusBy, comment: comment || '' });
            if (entry.history.length > 100) entry.history = entry.history.slice(-100);
        }
        function wfBadge(entry) {
            const st = entry.status || 'Brouillon';
            const cls = st === 'Validé' ? 'bg-emerald-100 text-emerald-700' : (st === 'Proposé' ? 'bg-amber-100 text-amber-700' : (st === 'Obsolète' ? 'bg-slate-200 text-slate-500 line-through' : 'bg-slate-100 text-slate-500'));
            return `<span class="text-[10px] px-2 py-0.5 rounded font-bold ${cls}" title="${entry.statusAt ? escapeHTML('Depuis le ' + new Date(entry.statusAt).toLocaleString('fr-FR') + ' par ' + (entry.statusBy || '?')) : ''}">${st}</span>`;
        }
        function wfHistoryHtml(entry) {
            if (!(entry.history || []).length) return '';
            return `<details class="mt-1"><summary class="text-[10px] text-slate-400 cursor-pointer">🕓 Historique des statuts (${entry.history.length})</summary>
                <div class="mt-1 space-y-0.5">${entry.history.slice().reverse().map(h => `<div class="text-[10px] text-slate-500">${new Date(h.at).toLocaleString('fr-FR')} — <strong>${escapeHTML(h.from)}</strong> → <strong>${escapeHTML(h.to)}</strong> par ${escapeHTML(h.by)}${h.comment ? ' · « ' + escapeHTML(h.comment) + ' »' : ''}</div>`).join('')}</div></details>`;
        }
        function wfSetDictStatus(tn, v) { const d = ensureDictEntry(tn); const c = v === 'Validé' ? (prompt('Commentaire de validation (optionnel) :') || '') : ''; wfTransition(d, v, c); persistAppState(); renderGovernance(); }
        function wfSetBoStatus(boId, v) { const bo = state.governance.businessObjects.find(x => x.id === boId); if (!bo) return; const c = v === 'Validé' ? (prompt('Commentaire de validation (optionnel) :') || '') : ''; wfTransition(bo, v, c); persistAppState(); renderGovernance(); }
        function wfStats() {
            const dicts = Object.entries(state.governance.dictionary || {}).filter(([n]) => tableByName(n));
            const bos = state.governance.businessObjects || [];
            const all = dicts.map(([n, d]) => ({ kind: 'dict', name: n, e: d })).concat(bos.map(b => ({ kind: 'bo', name: b.name, e: b })));
            return { all, toReview: all.filter(x => (x.e.status || 'Brouillon') === 'Proposé'), validated: all.filter(x => x.e.status === 'Validé'), obsolete: all.filter(x => x.e.status === 'Obsolète') };
        }
        const CRITICALITY_OPTS = ['Faible', 'Moyenne', 'Haute', 'Critique'];
        const CRIT_COLORS = { 'Faible': 'bg-slate-100 text-slate-600', 'Moyenne': 'bg-blue-100 text-blue-700', 'Haute': 'bg-amber-100 text-amber-800', 'Critique': 'bg-red-100 text-red-700' };

        function readyTableNames() { return Object.values(state.tables).filter(t => t.status === 'ready').map(t => t.name); }
        function tableByName(n) { return Object.values(state.tables).find(t => t.name === n); }

        // Dictionnaire orienté OBJET MÉTIER : l'objet est la fiche de référence ; les définitions
        // d'attributs s'écrivent dans le dictionnaire de la colonne mappée (aucune double saisie).
        function renderGovDictionaryBo(bos) {
            if (!bos.length) return '<p class="text-sm text-slate-400 italic py-8 text-center">Aucun objet métier — créez-en dans l\'onglet Objets métier, ou basculez « Par table technique ».</p>';
            if (!govState.dictBoId || !bos.some(b => b.id === govState.dictBoId)) govState.dictBoId = bos[0].id;
            const bo = bos.find(b => b.id === govState.dictBoId);
            const master = boMasterTable(bo);
            const md = master ? ensureDictEntry(master.name) : null;
            const rows = [];
            (boCoreElements(bo) || []).forEach(e2 => rows.push({ el: e2, facet: '', stId: '' }));
            getBoFacets(bo).forEach(st => (st.elements || []).forEach(fe => rows.push({ el: fe, mappings: fe.col ? [{ table: st.table, col: fe.col }] : [], facet: st.name, stId: st.id })));
            boAttrLiftFromColumn(bo);   // reprise unique de ce qui avait été saisi sur les colonnes
            const selOpts = (opts, cur) => opts.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
            const glossOpts = cur => '<option value="">— Aucun terme —</option>' + state.governance.glossary.map(g => `<option value="${g.id}" ${g.id === cur ? 'selected' : ''}>${escapeHTML(g.term)}</option>`).join('');
            /* Deux niveaux de multiplicité, qu'il fallait cesser de confondre :
                 — le GROUPE (la facette) se répète : « un client, plusieurs adresses ». La cardinalité
                   appartient au groupe entier, pas à chacun de ses attributs pris isolément ;
                 — l'ATTRIBUT lui-même peut porter plusieurs valeurs, ce que la technique exprime par
                   des colonnes numérotées, et qu'on replie ici en « 1 à n valeurs ». */
            const fold = govState.dictFold !== false;
            const facets = getBoFacets(bo);
            const sections = [{ st: null, rows: rows.filter(r => !r.stId) }]
                .concat(facets.map(st => ({ st, rows: rows.filter(r => r.stId === st.id) })));
            const secHeadHtml = (sec) => {
                if (!sec.st) {
                    if (!facets.length) return '';
                    return `<tr class="bg-slate-50 border-t-2 border-slate-200"><td colspan="7" class="p-2">
                        <span class="text-[11px] font-black text-slate-600">Attributs propres à ${escapeHTML(bo.name)}</span>
                        <span class="text-[10px] text-slate-400 ml-2">une occurrence unique par ${escapeHTML(bo.name)}</span></td></tr>`;
                }
                const st = sec.st, card = st.cardinality || '1–N', multi = /[–-]\s*N$/.test(card);
                const phrase = multi
                    ? `C'est ce <b>groupe</b> qui se répète : un(e) ${escapeHTML(bo.name)} peut avoir plusieurs « ${escapeHTML(st.name)} ». Ses ${sec.rows.length} attributs vont ensemble — une occurrence, c'est le bloc entier, pas un attribut isolé.`
                    : `Une seule occurrence de ce groupe par ${escapeHTML(bo.name)} : ses ${sec.rows.length} attributs sont renseignés une fois.`;
                return `<tr class="${multi ? 'bg-amber-50/70 border-amber-200' : 'bg-emerald-50/60 border-emerald-200'} border-t-2"><td colspan="7" class="p-2">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[11px] font-black text-emerald-800">◆ ${escapeHTML(st.name)}</span>
                        <span class="text-[10px] text-slate-500">groupe de ${sec.rows.length} attribut(s)</span>
                        ${boFacetCardBadgeHtml(st)}
                        <select onchange="updateBoFacet('${bo.id}','${st.id}','cardinality',this.value); renderGovernance()" class="border border-slate-300 rounded text-[10px] p-0.5 bg-white" title="Combien d'occurrences de ce groupe par ${escapeHTML(bo.name)} — la cardinalité est une propriété du groupe">${CARD_OPTS.map(o => `<option ${o === card ? 'selected' : ''}>${o}</option>`).join('')}</select>
                    </div>
                    <div class="text-[10px] text-slate-500 mt-0.5">${phrase}</div></td></tr>`;
            };
            const grpHtml = (g) => {
                const stId = g.stId || '', r0 = g.members[0], ids = boFoldIds(g), one = !g.fold;
                const m = one ? (r0.mappings || r0.el.mappings || [])[0] : null;
                const cols = boFoldCols(bo, g);
                const wr = one
                    ? (f) => `boAttrWrite('${bo.id}','${stId}','${r0.el.id}','${f}',this.value); renderGovernance()`
                    : (f) => `boFoldWrite('${bo.id}','${stId}','${ids}','${f}',this.value)`;
                const val = f => one ? (r0.el[f] || '') : boFoldField(g, f);
                const auto = one ? r0.el.examplesAuto : g.members.every(x => x.el.examplesAuto);
                const nameOn = one
                    ? `boAttrWrite('${bo.id}','${stId}','${r0.el.id}','name',this.value); renderGovernance()`
                    : `boFoldRename('${bo.id}','${stId}','${ids}',this.value)`;
                const prov = one
                    ? (m ? escapeHTML(m.table + '.' + m.col) : '<span class="italic text-amber-500">non rattaché à une colonne</span>')
                    : escapeHTML(cols.join(' · ')) || '<span class="italic text-amber-500">colonnes non rattachées</span>';
                const sampleBtn = one
                    ? (m ? `<button onclick="boAttrSampleOne('${bo.id}','${r0.el.id}')" class="text-[11px] px-1.5 py-1 rounded border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 shrink-0" title="Prendre de vrais exemples dans ${escapeHTML(m.table + '.' + m.col)}">⟳</button>` : '')
                    : (cols.length ? `<button onclick="boFoldSample('${bo.id}','${ids}')" class="text-[11px] px-1.5 py-1 rounded border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 shrink-0" title="Prendre de vrais exemples dans les ${cols.length} colonnes repliées">⟳</button>` : '');
                const vlCell = one
                    ? (m ? vlSelectHtml(m.table, m.col, (((state.governance.dictionary[m.table] || {}).columns || {})[m.col] || {}).valueListId) : '<span class="text-[10px] text-slate-300 italic">rattachez une colonne</span>')
                    : `<span class="text-[10px] text-slate-400 italic" title="Attribut replié sur ${g.members.length} colonnes — la liste de valeurs se règle en Vue technique">voir en Vue technique</span>`;
                return `<tr class="hover:bg-slate-50 align-top">
                    <td class="p-2">
                        <input type="text" value="${escapeHTML(one ? r0.el.name : g.base)}" onchange="${nameOn}"
                               class="font-bold text-xs border ${g.fold ? 'border-amber-300' : 'border-slate-300'} p-1.5 rounded w-full bg-white"
                               title="${g.fold ? 'Nom métier de cet attribut multivalué — le renommer renumérote automatiquement les ' + g.members.length + ' colonnes repliées' : 'Nom métier de cet attribut — modifiable ici'}">
                        ${g.fold ? `<div class="text-[9px] text-amber-700 font-bold mt-0.5">↻ ${g.members.length} colonnes repliées en un attribut</div>` : ''}
                        <div class="text-[9px] font-mono text-slate-300 mt-0.5" title="Colonne(s) source qui alimente(nt) cet attribut">${prov}</div>
                    </td>
                    <td class="p-2 whitespace-nowrap">${boValueCountBadgeHtml(bo, g)}
                        <div class="mt-1">${boMultiSelectHtml(boAttrMulti(bo, g).decl, one
                            ? `boAttrWrite('${bo.id}','${stId}','${r0.el.id}','multi',this.value); renderGovernance()`
                            : `boFoldWrite('${bo.id}','${stId}','${ids}','multi',this.value)`,
                            one ? 'Déclarez ici combien de valeurs cet attribut peut prendre pour un(e) ' + bo.name
                                : 'Déclaration appliquée aux ' + g.members.length + ' colonnes repliées de cet attribut')}</div></td>
                    <td class="p-2"><textarea rows="2" placeholder="Ce que désigne cet attribut, en langage métier…" onchange="${wr('definition')}"
                        class="w-full min-w-[220px] border border-slate-200 p-1.5 rounded text-xs">${escapeHTML(val('definition'))}</textarea></td>
                    <td class="p-2"><div class="flex items-center gap-1">
                        <input type="text" value="${escapeHTML(val('examples'))}" placeholder="ex : PARIS ; LYON" onchange="${wr('examples')}"
                            class="w-32 border border-slate-200 p-1.5 rounded text-xs ${auto ? 'bg-indigo-50/60' : ''}"
                            title="${auto ? 'Valeurs prises dans la source rattachée' : 'Saisie manuelle'}">
                        ${sampleBtn}
                    </div></td>
                    <td class="p-2"><select onchange="${wr('sensitivity')}" class="border border-slate-200 p-1.5 rounded text-xs bg-white"><option value="">—</option>${selOpts(SENSITIVITY_OPTS, val('sensitivity'))}</select></td>
                    <td class="p-2">${one ? attrTermsCellHtml(bo, stId, r0.el.id) : `<select onchange="${wr('term')}" class="border border-slate-200 p-1.5 rounded text-xs bg-white max-w-[130px]" title="Terme appliqué aux ${g.members.length} colonnes repliées">${glossOpts(val('term'))}</select>${(() => { const oth = Array.from(new Set(g.members.flatMap(mm => termsOfAttr(bo.id, mm.el.id).filter(t2 => t2.id !== val('term')).map(t2 => t2.term)))); return oth.length ? `<div class="flex flex-wrap gap-1 mt-1">${oth.map(x => `<span class="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full px-1.5 py-0.5 font-bold">📖 ${escapeHTML(x)}</span>`).join('')}</div>` : ''; })()}`}</td>
                    <td class="p-2">${vlCell}</td>
                </tr>`;
            };
            let rowsHtml = '', nShown = 0, nFolded = 0;
            sections.forEach(sec => {
                if (!sec.rows.length) return;
                rowsHtml += secHeadHtml(sec);
                const groups = fold ? boFoldRows(sec.rows)
                    : sec.rows.map(r => ({ fold: false, base: r.el.name, members: [r], idx: [], stId: r.stId || '', facet: r.facet }));
                groups.forEach(g => { nShown++; if (g.fold) nFolded += g.members.length; rowsHtml += grpHtml(g); });
            });
            return `<div class="flex items-center gap-3 mb-4 flex-wrap">
                    <select data-ro="keep" onchange="govState.dictBoId=this.value; renderGovernance()" class="border border-emerald-300 p-2.5 rounded-lg bg-emerald-50/50 font-bold text-sm">${bos.map(b => `<option value="${b.id}" ${b.id === bo.id ? 'selected' : ''}>🏛️ ${escapeHTML(b.name)}</option>`).join('')}</select>
                    <button data-ro="keep" onclick="openBoFiche('${bo.id}')" class="text-xs bg-white border border-emerald-300 text-emerald-700 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-50">Ouvrir la fiche complète →</button>
                    <button onclick="giOpen('boattr')" class="text-xs bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-50" title="Charger définitions, exemples, sensibilité, termes et nombre de valeurs par fichier CSV ou Excel">⬆ Remplir par fichier</button>
                    <button onclick="boAttrSampleAll('${bo.id}')" class="text-xs bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-50" title="Prendre de vrais exemples dans les sources rattachées, pour tous les attributs — les exemples saisis à la main ne sont pas touchés">⟳ Échantillonner les exemples</button>
                    <button data-ro="keep" onclick="boToggleFold()" class="text-xs px-3 py-1.5 rounded-lg font-bold border ${fold ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-300 text-slate-600'}" title="${fold ? 'Vue métier : les colonnes numérotées (TEL_1, TEL_2…) sont repliées en un seul attribut « 1 à n valeurs ». Cliquer pour voir chaque colonne.' : 'Vue technique : chaque colonne numérotée est un attribut distinct. Cliquer pour revenir à la lecture métier.'}">${fold ? '◉ Vue métier' : '○ Vue technique'}</button>
                    ${master ? `<span class="text-[11px] text-slate-400">Table maître : <strong>${escapeHTML(master.name)}</strong></span>` : '<span class="text-[11px] text-amber-600 font-bold">⚠️ pas de table maître chargée</span>'}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div class="md:col-span-3"><label class="text-xs font-bold text-slate-500 block mb-1">Définition de l'objet métier</label><textarea onchange="updateBusinessObject('${bo.id}','definition',this.value)" placeholder="Ce que représente cet objet pour le métier..." class="w-full border border-slate-300 p-2 rounded text-sm bg-white h-16">${escapeHTML(bo.definition || '')}</textarea></div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Propriétaire global</label><input type="text" value="${escapeHTML(bo.globalOwner || '')}" placeholder="Direction / personne" onchange="updateBusinessObject('${bo.id}','globalOwner',this.value)" class="w-full border border-slate-300 p-2 rounded text-sm bg-white"></div>
                    ${md ? `<div><label class="text-xs font-bold text-slate-500 block mb-1">Référent (Data Steward)</label><input type="text" value="${escapeHTML(md.steward || '')}" placeholder="Personne référente" onchange="updateDictField('${escapeHTML(master.name)}','steward',this.value)" class="w-full border border-slate-300 p-2 rounded text-sm bg-white"></div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Statut de la fiche</label><select onchange="updateDictField('${escapeHTML(master.name)}','status',this.value); renderGovernance()" class="w-full border border-slate-300 p-2 rounded text-sm bg-white">${selOpts(STATUS_OPTS, md.status)}</select></div>` : ''}
                </div>
                <h3 class="text-sm font-bold text-slate-700 mb-2">Attributs métier (${nShown}) <span class="text-slate-400 font-medium text-xs">— le sens est porté par l'<b>objet métier</b> : définition, exemples, sensibilité et terme s'enregistrent sur l'attribut, pas sur la colonne source. Un attribut sans colonne rattachée se documente quand même.</span></h3>
                ${nFolded ? `<p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">↻ <b>${nFolded} colonnes numérotées</b> ont été repliées en attributs multivalués : côté technique la donnée est étalée (TEL_1, TEL_2…), côté métier c'est <b>un seul attribut qui peut avoir plusieurs valeurs</b>. Ce que vous saisissez sur un attribut replié s'applique à toutes ses colonnes.</p>` : ''}
                <div class="border border-slate-200 rounded-lg overflow-x-auto"><table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2">Attribut métier <span class="normal-case font-medium text-slate-300">(et sa provenance)</span></th><th class="p-2" title="Combien de valeurs cet attribut peut prendre dans une occurrence — déclarable ici. La répétition du GROUPE, elle, est indiquée sur la ligne du composant.">Nombre de valeurs</th><th class="p-2">Définition</th><th class="p-2">Exemples</th><th class="p-2">Sensibilité</th><th class="p-2">Terme du glossaire</th><th class="p-2">🎚️ Liste de valeurs</th></tr></thead>
                    <tbody class="divide-y divide-slate-100">${rowsHtml || '<tr><td colspan="7" class="p-4 text-xs text-slate-400 italic text-center">Aucun attribut — définissez la structure de l\'objet dans sa fiche.</td></tr>'}</tbody></table></div>`;
        }
        function ensureDictEntry(tableName) {
            const d = state.governance.dictionary;
            if (!d[tableName]) d[tableName] = { description: '', owner: '', steward: '', sourceSystem: '', updateFrequency: '', sensitivity: 'Interne', status: 'Brouillon', columns: {} };
            if (!d[tableName].columns || typeof d[tableName].columns !== 'object') d[tableName].columns = {};
            const t = tableByName(tableName);
            if (t) t.headers.forEach(h => { if (!d[tableName].columns[h]) d[tableName].columns[h] = { definition: '', technicalType: '', sensitivity: '', term: '' }; });
            return d[tableName];
        }

        // Les sous-onglets Gouvernance sont rendus dans la barre de navigation commune (renderNav),
        // comme ceux des autres phases — switchGovTab reste le point d'entrée des liens internes.
        function switchGovTab(tab) { govState.tab = tab; renderGovernance(); renderNav(); }

        function renderGovernance() {
            govApplyReadOnly();
            // V9.4 — Plus de rangée de familles dans le panneau : le menu latéral est LA navigation.
            // Le panneau n'affiche qu'un fil d'Ariane (famille › écran) et ses actions.
            const crumb = el('govCrumb'), acts = el('govActions');
            const govTabs = (NAV_PHASES.find(p => p.id === 'gov') || { tabs: [] }).tabs;
            const curT = govTabs.find(t => t.g === (govState.tab === 'flow' ? 'lineage' : govState.tab)) || govTabs.find(t => t.g === govState.tab) || null;
            if (crumb) crumb.innerHTML = curT ? `${govIsReadOnly() ? '👁 Consultation' : escapeHTML(curT.fam || 'Gouvernance')} › <b>${escapeHTML(curT.label)}</b>` : '';
            if (acts) acts.innerHTML = `<button onclick="giOpen()" aria-label="Import en masse de la gouvernance" class="text-[11.5px] font-bold px-3 py-1.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" title="Importer en masse définitions, propriétaires, termes… depuis un fichier">⬆ Import en masse</button>`;
            const famBar = el('govFamTabs'); if (famBar) famBar.innerHTML = '';
            const c = el('govContent');
            if (govState.tab === 'dictionary') c.innerHTML = renderGovDictionary();
            else if (govState.tab === 'objects') {
                c.innerHTML = renderGovObjects();
                const selBo = state.governance.businessObjects.find(b => b.id === govState.selectedBoId);
                if (selBo && selBo.contextRules && selBo.contextRules.elementId) fillCtxRuleValues(selBo.id);
                if (selBo) getBoHierarchies(selBo).forEach(h2 => { if (h2.typeCol) fillBoHierLevelValues(selBo.id, h2.id); });
                if (selBo) fillBoVolumetry(selBo.id, 'bo-vol-' + selBo.id);
            }
            else if (govState.tab === 'model') { c.innerHTML = '<div class="flex justify-end gap-2 mb-2">' + graphToolbarHtml('model') + '<button data-ro="keep" onclick="exportGraphImage(\'model\')" class="text-[11px] bg-white border border-slate-300 px-2.5 py-1 rounded font-bold text-slate-600 hover:bg-slate-100">📷 Exporter l\'image</button></div><div id="modelGraphWrap" class="border border-slate-200 rounded-xl bg-slate-50/50 h-[550px]" style="background-image: radial-gradient(#e2e8f0 1px, transparent 1px); background-size: 20px 20px;"></div><p class="text-xs text-slate-400 mt-3">Diagramme du modèle métier : 🏛️ objets (vert), ◆ compositions (ce qui fait partie de l\'objet), → références entre objets, cardinalités sur les liens. Construit via l\'assistant "Concevoir depuis le modèle de données".</p>'; renderObjectModelDiagram(); requestAnimationFrame(() => reflowGraph('model')); }
            else if (govState.tab === 'perimeters') c.innerHTML = renderGovPerimeters();
            else if (govState.tab === 'glossary') c.innerHTML = renderGovGlossary();
            else if (govState.tab === 'vlists') c.innerHTML = renderValueLists();
            else if (govState.tab === 'usecases') { govState.tab = 'assets'; c.innerHTML = renderGovAssets(); }
            else if (govState.tab === 'assets') c.innerHTML = renderGovAssets();
            else if (govState.tab === 'privacy') c.innerHTML = renderGovPrivacy();
            else if (govState.tab === 'catalog') c.innerHTML = renderGovCatalog();
            else if (govState.tab === 'history') c.innerHTML = renderGovHistory();
            else if (govState.tab === 'people') c.innerHTML = renderGovPeople();
            else if (govState.tab === 'review') c.innerHTML = renderGovReview();
            else if (govState.tab === 'srcwatch') c.innerHTML = renderSrcWatch();
            else if (govState.tab === 'flow') c.innerHTML = renderLineageFlow();
            else if (govState.tab === 'share') { govState.tab = 'catalog'; c.innerHTML = renderGovCatalog(); openBackupCenter(); }
            else if (govState.tab === 'lineage') { const _am = govState.lineageView === 'attr'; const _bos = state.governance.businessObjects || [];
                c.innerHTML = '<div id="lineageFsWrap"><div class="flex items-center gap-2 mb-2 flex-wrap">'
                + '<button onclick="openGovTab(\'flow\')" title="Revenir à la structure table-centrée et à la santé" class="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50">◀ 🔗 Structure &amp; santé</button>'
                + '<div class="inline-flex rounded-lg border border-slate-300 overflow-hidden text-[11px] font-bold">'
                + '<button onclick="govState.lineageView=\'global\'; renderGovernance()" class="px-3 py-1.5 ' + (_am ? 'bg-white text-slate-500 hover:bg-slate-50' : 'bg-indigo-600 text-white') + '">🌐 Vue globale</button>'
                + '<button onclick="govState.lineageView=\'attr\'; renderGovernance()" class="px-3 py-1.5 ' + (_am ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50') + '">🔬 Par attribut</button></div>'
                + (_am ? '<select onchange="govState.lineageAttrBo=this.value; renderLineageGraph()" class="border border-emerald-300 rounded-lg px-2 py-1.5 text-xs font-bold bg-emerald-50/50">' + _bos.map(b2 => '<option value="' + b2.id + '"' + (govState.lineageAttrBo === b2.id ? ' selected' : '') + '>🏛️ ' + escapeHTML(b2.name) + '</option>').join('') + '</select>'
                    + '<input type="text" value="' + escapeHTML(govState.lineageAttrQ || '') + '" oninput="govState.lineageAttrQ=this.value; attrFlowApplyFocus()" placeholder="🔍 filtrer les attributs…" class="text-[11px] border border-slate-300 rounded px-2 py-1.5 w-44 bg-white">' : '')
                + '</div>'
                + '<div class="flex justify-end items-center gap-2.5 mb-2 flex-wrap bg-white/90 rounded-lg px-2 py-1' + (_am ? ' hidden' : '') + '">' + ['srcs,📄 Sources,lineageSrcs', 'bos,🏛 Objets,lineageBos', 'apps,🖥 Applications,lineageApps', 'procs,⚙️ Processus,lineageProcs'].map(x => { const [k2, lbl2, gk] = x.split(','); return '<label class="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer"><input type="checkbox" ' + (govState[gk] !== false ? 'checked' : '') + ' onchange="govState.' + gk + '=this.checked; renderLineageGraph()"> ' + lbl2 + '</label>'; }).join('') + '<label class="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer" title="Par défaut, un fichier source est intégré à l\'application qui le produit. Décochez pour afficher chaque fichier séparément."><input type="checkbox" ' + (govState.lineageFoldSrc !== false ? 'checked' : '') + ' onchange="govState.lineageFoldSrc=this.checked; renderLineageGraph()"> 📦 Sources dans l\'appli</label>' + '<label class="flex items-center gap-1 text-[11px] text-emerald-700 font-bold cursor-pointer" title="Affiche les attributs des objets métier avec leur colonne source"><input type="checkbox" ' + (govState.lineageBoDetail ? 'checked' : '') + ' onchange="govState.lineageBoDetail=this.checked; renderLineageGraph()"> 🔬 Attributs des objets</label><input list="linGotoList" placeholder="🔍 aller à…" onchange="lineageGoto(this.value); this.value=\'\'" class="text-[11px] border border-slate-300 rounded px-2 py-1 w-36 bg-white"><datalist id="linGotoList"></datalist>' + graphToolbarHtml('lineage') + '<button onclick="lineageFullscreen()" class="text-[11px] bg-white border border-slate-300 px-2.5 py-1 rounded font-bold text-slate-600 hover:bg-slate-100" title="Plein écran">⛶ Plein écran</button><button onclick="exportGraphImage(\'lineage\')" class="text-[11px] bg-white border border-slate-300 px-2.5 py-1 rounded font-bold text-slate-600 hover:bg-slate-100">📷</button></div><div id="lineageHint" class="hidden text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-1.5 mb-2"></div><div id="lineageGraphWrap" class="border border-slate-200 rounded-xl bg-slate-50/50 h-[550px]" style="background-image: radial-gradient(#e2e8f0 1px, transparent 1px); background-size: 20px 20px;"></div><p class="text-xs text-slate-400 mt-3">Bleu : fichiers sources · Cyan : API · Violet : extractions (dérivées) · Vert : objets métier. Flèches violettes : alimentation (lineage) · Traits gris pointillés : relations du modèle de données · Flèches ambre : table utilisée par un processus · <strong>👑 Vert épais : source maître → objet</strong> · Vert pointillé : contributeur · <strong>Sarcelle : objet → destinataire (diffusion)</strong> · <strong>🖥 Gris foncé : application (produit)</strong> · <strong>⚙️ Orange : processus (consomme)</strong> · 💡 <strong>Cliquez un nœud</strong> pour mettre en évidence toute sa chaîne de bout en bout (re-cliquez pour effacer).</p></div>'; renderLineageGraph(); requestAnimationFrame(() => reflowGraph('lineage')); }
            lucide.createIcons();
            govProjectValues();
        }

        // ---- Dictionnaire (définition fonctionnelle + technique, source de la donnée) ----
        function renderGovDictionary() {
            const names = readyTableNames();
            if (!names.length) return '<p class="text-sm text-slate-400 italic py-8 text-center">Chargez d\'abord des tables (onglet Sources) pour documenter la donnée.</p>';
            // Mode PAR OBJET MÉTIER (référence) ou par table technique (détail).
            const bos = state.governance.businessObjects || [];
            if (govState.dictMode === undefined) govState.dictMode = bos.length ? 'bo' : 'table';
            const modeBar = `<div class="flex items-center gap-1.5 mb-4" data-ro="keep">
                <button onclick="govState.dictMode='bo'; renderGovernance()" class="text-xs font-bold px-3 py-1.5 rounded-lg border ${govState.dictMode === 'bo' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}">🏛️ Par objet métier</button>
                <button onclick="govState.dictMode='table'; renderGovernance()" class="text-xs font-bold px-3 py-1.5 rounded-lg border ${govState.dictMode !== 'bo' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}">📄 Par table technique</button>
            </div>`;
            const wf = wfStats();
            const wfBar = wf.all.length ? `<div class="flex items-center gap-2 mb-4 flex-wrap text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span class="font-bold text-slate-600">✅ Validation :</span>
                <span class="font-black ${wf.validated.length === wf.all.length ? 'text-emerald-600' : 'text-slate-700'}">${Math.round(100 * wf.validated.length / wf.all.length)} %</span>
                <span class="text-slate-400">(${wf.validated.length}/${wf.all.length} validé(s))</span>
                ${wf.toReview.length ? `<button onclick="govState.dictWfFilter = !govState.dictWfFilter; renderGovernance()" class="bg-amber-100 border border-amber-300 text-amber-800 rounded-full px-2.5 py-0.5 font-bold hover:bg-amber-200">📋 ${wf.toReview.length} à valider ${govState.dictWfFilter ? '(filtre actif ✕)' : ''}</button>` : '<span class="text-emerald-600">rien en attente</span>'}
                ${wf.obsolete.length ? `<span class="text-slate-400">🗑 ${wf.obsolete.length} obsolète(s)</span>` : ''}
                <span class="ml-auto text-slate-400">Relecteur :</span><input type="text" value="${escapeHTML(state.governance.reviewer || '')}" onchange="state.governance.reviewer = this.value; persistAppState()" placeholder="votre nom" class="border border-slate-200 rounded px-1.5 py-0.5 text-[11px] w-32 bg-white">
            </div>` : '';
            if (govState.dictWfFilter && wf.toReview.length) {
                return modeBar + wfBar + `<div class="space-y-2">${wf.toReview.map(x => `<div class="flex items-center gap-2 border border-amber-200 bg-amber-50/40 rounded-lg p-3 text-sm">
                    <span>${x.kind === 'bo' ? '🏛️' : '📄'}</span><strong>${escapeHTML(x.name)}</strong>${wfBadge(x.e)}
                    <span class="ml-auto"></span>
                    <button onclick="${x.kind === 'bo' ? `wfSetBoStatus('${x.e.id}','Validé')` : `wfSetDictStatus('${escapeHTML(x.name)}','Validé')`}" class="text-xs bg-emerald-600 text-white px-3 py-1 rounded font-bold">✔ Valider</button>
                    <button onclick="${x.kind === 'bo' ? `wfSetBoStatus('${x.e.id}','Brouillon')` : `wfSetDictStatus('${escapeHTML(x.name)}','Brouillon')`}" class="text-xs bg-white border border-slate-300 px-3 py-1 rounded font-bold text-slate-600">↩ Renvoyer en brouillon</button>
                </div>`).join('')}</div>`;
            }
            if (govState.dictMode === 'bo') return modeBar + wfBar + renderGovDictionaryBo(bos);
            if (!govState.dictTable || !names.includes(govState.dictTable)) govState.dictTable = names[0];
            const tn = govState.dictTable; const d = ensureDictEntry(tn);
            const inp = (field, val, ph) => `<input type="text" value="${escapeHTML(val || '')}" placeholder="${ph}" onchange="updateDictField('${escapeHTML(tn)}','${field}',this.value)" class="w-full border border-slate-300 p-2 rounded text-sm bg-white">`;
            const selOpts = (opts, cur) => opts.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
            const glossOpts = cur => '<option value="">— Aucun terme —</option>' + state.governance.glossary.map(g => `<option value="${g.id}" ${g.id === cur ? 'selected' : ''}>${escapeHTML(g.term)}</option>`).join('');
            let colRows = '';
            const t = tableByName(tn);
            (t ? t.headers : Object.keys(d.columns)).forEach(h => {
                const c = d.columns[h] || {};
                colRows += `<tr class="hover:bg-slate-50">
                    <td class="p-2 font-semibold text-slate-700 text-xs whitespace-nowrap">${escapeHTML(h)}</td>
                    <td class="p-2"><input type="text" value="${escapeHTML(c.definition || '')}" placeholder="${(() => { const r = dictColResolved(tn, h, 'definition'); return r.from ? escapeHTML(r.value).replace(/"/g, '&quot;') : 'D\u00e9finition m\u00e9tier...'; })()}" onchange="updateDictColField('${escapeHTML(tn)}','${escapeHTML(h.replace(/'/g, "\\'"))}','definition',this.value)" class="w-full border border-slate-200 p-1.5 rounded text-xs">${(() => { const r = dictColResolved(tn, h, 'definition'); return (!c.definition && r.from) ? `<div class="text-[9px] text-emerald-600 mt-0.5">d\u00e9fini sur l'objet <b>${escapeHTML(r.from)}</b> - ${escapeHTML(r.attr)}</div>` : ''; })()}</td>
                    <td class="p-2"><input type="text" value="${escapeHTML(c.technicalType || '')}" placeholder="ex: VARCHAR(10)" onchange="updateDictColField('${escapeHTML(tn)}','${escapeHTML(h.replace(/'/g, "\\'"))}','technicalType',this.value)" class="w-28 border border-slate-200 p-1.5 rounded text-xs font-mono"></td>
                    <td class="p-2"><input type="text" value="${escapeHTML(c.examples || '')}" placeholder="ex: PAR01 ; LYO02..." onchange="updateDictColField('${escapeHTML(tn)}','${escapeHTML(h.replace(/'/g, "\\'"))}','examples',this.value)" class="w-44 border border-slate-200 p-1.5 rounded text-xs ${c.examplesAuto ? 'bg-indigo-50/50' : ''}" title="${c.examplesAuto ? 'Échantillonné automatiquement depuis la source' : 'Saisie manuelle'}"></td>
                    <td class="p-2"><select onchange="updateDictColField('${escapeHTML(tn)}','${escapeHTML(h.replace(/'/g, "\\'"))}','sensitivity',this.value)" class="border border-slate-200 p-1.5 rounded text-xs bg-white"><option value="">—</option>${selOpts(SENSITIVITY_OPTS, c.sensitivity)}</select>${(() => { const r = dictColResolved(tn, h, 'sensitivity'); return (!c.sensitivity && r.from) ? `<div class="text-[9px] text-emerald-600 mt-0.5" title="Défini sur l'objet métier — c'est là qu'il faut le modifier">hérite : ${escapeHTML(r.value)}</div>` : ''; })()}</td>
                    <td class="p-2"><select onchange="updateDictColField('${escapeHTML(tn)}','${escapeHTML(h.replace(/'/g, "\\'"))}','term',this.value)" class="border border-slate-200 p-1.5 rounded text-xs bg-white max-w-[140px]">${glossOpts(c.term)}</select>${colTermsPillsHtml(tn, h, c.term)}</td>
                    <td class="p-2">${vlSelectHtml(tn, h, c.valueListId)}</td>
                </tr>`;
            });
            return modeBar + wfBar + `
                <div class="flex items-center gap-4 mb-5">
                    <select data-ro="keep" onchange="govState.dictTable=this.value; renderGovernance()" class="border border-slate-300 p-2.5 rounded-lg bg-slate-50 font-bold text-sm">${names.map(n => `<option ${n === tn ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('')}</select>
                    <span class="text-xs px-2 py-1 rounded font-bold ${d.status === 'Validé' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${d.status}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div class="md:col-span-3"><label class="text-xs font-bold text-slate-500 block mb-1">Description fonctionnelle de l'objet</label><textarea onchange="updateDictField('${escapeHTML(tn)}','description',this.value)" placeholder="À quoi sert cette donnée, dans quel processus métier..." class="w-full border border-slate-300 p-2 rounded text-sm bg-white h-16">${escapeHTML(d.description || '')}</textarea></div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Propriétaire métier (Owner)</label>${inp('owner', d.owner, 'Direction / personne')}</div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Référent (Data Steward)</label>${inp('steward', d.steward, 'Personne référente')}</div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Système source <span class="text-[9px] text-slate-400">(= application du lineage)</span></label><input type="text" list="dictAppsList" value="${escapeHTML(d.sourceSystem || '')}" placeholder="ex: SAP, GMAO, export Excel..." onchange="updateDictField('${escapeHTML(tn)}','sourceSystem',this.value)" class="w-full border border-slate-300 p-2 rounded text-sm bg-white"><datalist id="dictAppsList">${(state.governance.assets || []).filter(a => a.kind === 'app').map(a => `<option value="${escapeHTML(a.name)}">`).join('')}</datalist></div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Fréquence de mise à jour</label>${inp('updateFrequency', d.updateFrequency, 'ex: quotidienne, mensuelle')}</div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Sensibilité globale</label><select onchange="updateDictField('${escapeHTML(tn)}','sensitivity',this.value)" class="w-full border border-slate-300 p-2 rounded text-sm bg-white">${selOpts(SENSITIVITY_OPTS, d.sensitivity)}</select></div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Statut de la fiche ${wfBadge(d)}</label><select onchange="wfSetDictStatus('${escapeHTML(tn)}',this.value)" class="w-full border border-slate-300 p-2 rounded text-sm bg-white">${selOpts(STATUS_OPTS, d.status)}</select>${wfHistoryHtml(d)}</div>
                </div>
                <div class="flex justify-between items-center mt-6 mb-2">
                    <h3 class="text-sm font-bold text-slate-700">Attributs (définition fonctionnelle & technique)</h3>
                    <button onclick="sampleTableExamples('${escapeHTML(tn)}')" id="btnSampleExamples" class="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 hover:bg-indigo-100"><i data-lucide="scan-search" class="w-3.5 h-3.5"></i> Échantillonner les exemples depuis la source</button>
                </div>
                <div class="border border-slate-200 rounded-lg overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2">Colonne</th><th class="p-2">Définition fonctionnelle</th><th class="p-2">Type technique</th><th class="p-2">Exemples de valeurs</th><th class="p-2">Sensibilité</th><th class="p-2">Terme glossaire</th><th class="p-2">🎚️ Liste de valeurs</th></tr></thead>
                        <tbody class="divide-y divide-slate-100">${colRows}</tbody>
                    </table>
                </div>`;
        }
        function updateDictField(tn, f, v) { ensureDictEntry(tn)[f] = v; persistAppState(); }
