        // ---- Référentiel Applications & Processus (actifs du lineage) ----
        const ASSET_KINDS = { app: ['🖥', 'Application / système'], process: ['⚙️', 'Processus métier'] };
        function assetById(id) {
            return (state.governance.assets || []).find(a => a.id === id);
        }
        function assetLabel(a) {
            return (ASSET_KINDS[a.kind] ? ASSET_KINDS[a.kind][0] : '') + ' ' + a.name;
        }
        function assetUsage(a) {
            const dict = state.governance.dictionary || {};
            const text = String(a.name || '')
                .trim()
                .toLowerCase();
            const srcs =
                a.kind === 'app'
                    ? Array.from(
                          new Set([
                              ...(a.sources || []),
                              ...Object.keys(dict).filter(
                                  n =>
                                      String(dict[n].sourceSystem || '')
                                          .trim()
                                          .toLowerCase() === text
                              )
                          ])
                      ).filter(n => tableByName(n))
                    : [];
            const bos = (state.governance.businessObjects || []).filter(
                bo => (bo.producedBy || []).includes(a.id) || (bo.consumedBy || []).includes(a.id)
            );
            const procs =
                a.kind === 'app'
                    ? (state.governance.assets || []).filter(x => x.kind === 'process' && (x.appIds || []).includes(a.id))
                    : [];
            return { srcs, bos, procs };
        }
        // V6 Lot 4 : la chaîne AVAL d'une application, reconstruite depuis le paramétrage amont
        // (ses sources → les objets métier qu'elles alimentent → les consommateurs de ces objets).
        // Rien à ressaisir : tout est déduit des rattachements déjà déclarés.
        function appDownstream(app) {
            if (!app || app.kind !== 'app') return { srcs: [], bos: [], consumers: [] };
            const srcs = assetUsage(app).srcs;
            const bos = (state.governance.businessObjects || []).filter(bo =>
                (bo.sources || []).some(s => srcs.includes(s.table) && s.role !== 'destinataire')
            );
            const consumers = new Set();
            bos.forEach(bo => {
                (bo.sources || [])
                    .filter(s => s.role === 'destinataire' && tableByName(s.table))
                    .forEach(s => consumers.add('📄 ' + s.table));
                (bo.consumedBy || []).forEach(id => {
                    const asset = assetById(id);
                    if (asset) consumers.add((asset.kind === 'process' ? '⚙️ ' : '🖥 ') + asset.name);
                });
                if (bo.appId) {
                    const asset = assetById(bo.appId);
                    if (asset && asset.id !== app.id) consumers.add('🖥 ' + asset.name);
                }
            });
            return { srcs, bos, consumers: [...consumers] };
        }
        // Domaine effectif : celui saisi, sinon (processus) hérité des applications liées.
        function assetDomainEff(a) {
            if (a.domain && String(a.domain).trim()) return String(a.domain).trim();
            if (a.kind === 'process') {
                const doms = Array.from(
                    new Set(
                        (a.appIds || [])
                            .map(assetById)
                            .filter(Boolean)
                            .map(x => String(x.domain || '').trim())
                            .filter(Boolean)
                    )
                );
                return doms.join(' · ');
            }
            return '';
        }
        function assetAppLink(procId, appId, on) {
            const asset = assetById(procId);
            if (!asset || !appId) return;
            asset.appIds = asset.appIds || [];
            if (on) {
                if (!asset.appIds.includes(appId)) asset.appIds.push(appId);
            } else asset.appIds = asset.appIds.filter(x => x !== appId);
            persistAppState();
            renderGovernance();
        }
        function toggleAssetTable(id, name, checked) {
            const asset = assetById(id);
            if (!asset) return;
            asset.tables = asset.tables || [];
            if (checked) {
                if (!asset.tables.includes(name)) asset.tables.push(name);
            } else asset.tables = asset.tables.filter(t => t !== name);
            persistAppState();
            lfAutoSyncAsset(id);
            renderGovernance();
        }
        function populateAssetCols(id, tableName) {
            const table = tableByName(tableName);
            const element = el('as-col-' + id);
            if (element)
                element.innerHTML = (table ? table.headers : []).map(h => `<option>${escapeHTML(h)}</option>`).join('');
        }
        function addAssetCol(id) {
            const asset = assetById(id);
            if (!asset) return;
            const tbl = el('as-tbl-' + id).value,
                col = el('as-col-' + id).value;
            if (!tbl || !col) return;
            asset.columns = asset.columns || [];
            if (!asset.columns.some(l => l.table === tbl && l.col === col)) asset.columns.push({ table: tbl, col });
            persistAppState();
            lfAutoSyncAsset(id);
            renderGovernance();
        }
        function removeAssetCol(id, idx) {
            const asset = assetById(id);
            if (asset && asset.columns) {
                asset.columns.splice(idx, 1);
                persistAppState();
                lfAutoSyncAsset(id);
                renderGovernance();
            }
        }
        function renderGovAssets() {
            if (migrateAppSources() | boSyncAppsFromSources()) persistAppState();
            const assets = state.governance.assets || [];
            const names = readyTableNames();
            const srcNames = sourceTableNames();
            const apps = assets.filter(a => a.kind === 'app');
            const doms =
                typeof govDomains === 'function'
                    ? govDomains()
                    : Array.from(
                          new Set([...themeList(), ...assets.map(a => String(a.domain || '').trim()).filter(Boolean)])
                      ).sort();
            let html = `<div class="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4 text-sm text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="text-[10px] uppercase font-bold text-slate-400 mr-1">Modèle</span>
                <span class="font-bold text-slate-700">🖥 Application</span><span class="text-slate-300">contient →</span>
                <span class="font-bold text-emerald-700">📄 Sources</span><span class="text-slate-300">alimentent →</span>
                <span class="font-bold text-emerald-700">🏛️ Objet métier</span><span class="text-slate-300">alimente →</span>
                <span class="font-bold text-slate-700">📥 Consommateurs</span>
                <span class="text-[11px] text-slate-400 basis-full">C'est l'application qui est maître, jamais le fichier ; on ne remplit un objet métier que via une application.</span>
            </div>
            <div class="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 mb-6">
                <h3 class="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-2"><i data-lucide="siren" class="w-4 h-4"></i> Analyse d'impact — "si cette donnée a un problème, qui est touché ?"</h3>
                <div class="flex flex-wrap gap-3 items-end" data-ro="keep">
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Table</label><select id="impactTable" onchange="populateImpactCols()" class="border border-slate-300 p-2 rounded text-sm bg-white"><option value="">Choisir...</option>${names.map(n => `<option>${escapeHTML(n)}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold text-slate-500 block mb-1">Colonne (optionnel)</label><select id="impactCol" class="border border-slate-300 p-2 rounded text-sm bg-white"><option value="">Toute la table</option></select></div>
                    <button onclick="runImpactAnalysis()" class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg">Analyser l'impact</button>
                </div>
                <div id="impactResult" class="mt-4"></div>
            </div>
            <p class="text-sm text-slate-500 mb-4">Le socle du modèle : une <strong>application</strong> <strong>possède ses sources</strong> (les fichiers qu'elle produit) — c'est l'<strong>application</strong> qui est maître, jamais le fichier. Rattachez ci-dessous chaque source à son application ; ces sources alimentent ensuite les <strong>objets métier</strong>, puis les <strong>consommateurs</strong>. Un <strong>processus</strong> s'appuie sur une ou plusieurs applications et déclare les tables/colonnes critiques qu'il utilise (analyse d'impact ci-dessus).</p>
            <datalist id="assetDomList">${doms.map(d => `<option value="${escapeHTML(d)}">`).join('')}</datalist>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5">`;
            for (const kind of ['app', 'process']) {
                const [ic, lbl] = ASSET_KINDS[kind];
                const list = assets.filter(a => a.kind === kind);
                html += `<div>
                    <div class="flex items-center justify-between mb-2"><h3 class="text-sm font-bold text-slate-700">${ic} ${lbl}s (${list.length})</h3><button onclick="addGovAsset('${kind}')" class="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">+ ${lbl}</button></div>
                    ${list.length ? '' : `<p class="text-xs text-slate-400 italic py-4 text-center border border-dashed border-slate-200 rounded-lg">Aucun(e) ${lbl.toLowerCase()} déclaré(e).</p>`}
                    ${list
                        .map(a => {
                            const u = assetUsage(a);
                            const nUse = u.srcs.length + u.bos.length + u.procs.length;
                            const domEff = assetDomainEff(a);
                            const _dom = String(a.domain || '').trim();
                            const _lock =
                                typeof govLockAttr === 'function' ? govLockAttr(govCanEdit(_dom), govCanPropose(_dom)) : '';
                            return `<div${_lock} class="border border-slate-200 rounded-xl p-3 mb-2 bg-slate-50/50">${_lock ? govLockBand(a.name, _dom) : ''}
                        <div class="flex items-center gap-2 mb-1.5">
                            <span>${ic}</span>
                            <input type="text" value="${escapeHTML(a.name)}" onchange="updateGovAsset('${a.id}','name',this.value)" class="font-bold text-sm border border-slate-300 p-1.5 rounded flex-grow bg-white">
                            <select onchange="updateGovAsset('${a.id}','criticality',this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${CRITICALITY_OPTS.map(o => `<option ${o === (a.criticality || 'Moyenne') ? 'selected' : ''}>${o}</option>`).join('')}</select>
                            <button onclick="removeGovAsset('${a.id}')" class="text-red-500 hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                        <div class="flex gap-2 mb-1.5 flex-wrap">
                            <input type="text" value="${escapeHTML(a.owner || '')}" placeholder="${kind === 'app' ? 'Responsable applicatif' : 'Responsable du processus'}" onchange="updateGovAsset('${a.id}','owner',this.value)" ${typeof govFeatureOn === 'function' && govFeatureOn() && !govCanEdit(String(a.domain || '').trim()) ? 'disabled title="🔒 Réservé au propriétaire"' : ''} class="border border-slate-200 p-1.5 rounded text-xs bg-white w-44">
                            <input type="text" value="${escapeHTML(a.domain || '')}" list="assetDomList" placeholder="${kind === 'process' && domEff && !(a.domain || '').trim() ? 'Domaine hérité : ' + domEff : 'Domaine métier'}" onchange="updateGovAsset('${a.id}','domain',this.value)" ${typeof govFeatureOn === 'function' && govFeatureOn() && !govCanEdit(String(a.domain || '').trim()) ? 'disabled' : ''} title="${typeof govFeatureOn === 'function' && govFeatureOn() && !govCanEdit(String(a.domain || '').trim()) ? '🔒 Réservé au propriétaire. ' : ''}Domaine métier${kind === 'process' ? ' — laissé vide, il est hérité des applications liées' : ''}" class="border border-slate-200 p-1.5 rounded text-xs bg-white w-40 ${kind === 'process' && domEff && !(a.domain || '').trim() ? 'placeholder-emerald-600' : ''}">
                            <input type="text" value="${escapeHTML(a.description || '')}" placeholder="Description…" onchange="updateGovAsset('${a.id}','description',this.value)" class="border border-slate-200 p-1.5 rounded text-xs bg-white flex-grow min-w-[140px]">${typeof propBadgeHtml === 'function' ? propBadgeHtml('asset', { assetId: a.id }, 'description') : ''}
                        </div>${typeof propActionsHtml === 'function' ? propActionsHtml('', a.id) : ''}
                        <div class="flex flex-wrap items-center gap-1.5 mb-2"><span class="text-[10px] uppercase font-bold text-indigo-600">📖 Termes du glossaire</span>${termTagsHtml('asset', { assetId: a.id })}</div>
                        ${
                            kind === 'app'
                                ? `
                        <div class="text-[10px] uppercase font-bold text-slate-400 mb-1">📄 Sources produites <span class="text-slate-300 normal-case font-normal">— fichiers dont cette application est maître</span></div>
                        <div class="flex flex-wrap gap-1.5 mb-2">${
                            srcNames.length
                                ? srcNames
                                      .map(n => {
                                          const owner = appOwnerOfSource(n);
                                          const mine = owner && owner.id === a.id;
                                          const other = owner && owner.id !== a.id;
                                          return `<label class="text-xs border rounded px-2 py-1 ${other ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${mine ? 'bg-emerald-100 border-emerald-300 text-emerald-800 font-bold' : 'bg-white border-slate-200 text-slate-500'}" title="${other ? 'Déjà rattachée à ' + escapeHTML(owner.name) : mine ? 'Rattachée à cette application' : 'Rattacher à cette application'}"><input type="checkbox" class="hidden" ${mine ? 'checked' : ''} ${other ? 'disabled' : ''} onchange="toggleAppSource('${a.id}','${escapeHTML(n.replace(/'/g, "\\'"))}',this.checked)">${mine ? '📄 ' : ''}${escapeHTML(n)}${other ? ' · 🖥 ' + escapeHTML(owner.name) : ''}</label>`;
                                      })
                                      .join('')
                                : '<span class="text-xs text-slate-400 italic">Aucune source chargée (onglet Sources)</span>'
                        }</div>
                        ${(() => {
                            const objs = appBusinessObjects(a);
                            return objs.length
                                ? `<div class="text-[10px] uppercase font-bold text-emerald-600 mb-1">🏛️ Objets métier alimentés <span class="text-slate-300 normal-case font-normal">— déduits des sources ci-dessus (l'application y est rattachée automatiquement)</span></div>
                        <div class="flex flex-wrap gap-1.5 mb-2">${objs
                            .map(bo => {
                                const isProd = (bo.producedBy || []).includes(a.id),
                                    isCons = (bo.consumedBy || []).includes(a.id);
                                return `<button data-ro="keep" onclick="openBoFiche('${bo.id}')" class="text-xs bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-full px-2.5 py-1 font-bold hover:bg-emerald-100" title="Ouvrir la fiche de l'objet métier">🏛️ ${escapeHTML(bo.name)}${isProd ? ' · produite par' : ''}${isCons ? ' · consommée par' : ''}</button>`;
                            })
                            .join('')}</div>`
                                : '';
                        })()}
                        ${(() => {
                            const d = appDownstream(a);
                            return d.srcs.length && (d.bos.length || d.consumers.length)
                                ? `<div class="text-[11px] text-slate-600 mb-2 bg-white border border-slate-200 rounded p-1.5"><span class="text-[10px] uppercase font-bold text-slate-400">🔗 Chaîne aval</span> <span class="text-emerald-700 font-bold">📄 ${d.srcs.map(escapeHTML).join(', ')}</span>${d.bos.length ? ' → <span class="font-bold">🏛️ ' + d.bos.map(bo => escapeHTML(bo.name)).join(', ') + '</span>' : ''}${d.consumers.length ? ' → <span class="text-slate-600">' + d.consumers.map(escapeHTML).join(', ') + '</span>' : ''}<span class="text-[9px] text-slate-300 block mt-0.5">déduit du paramétrage amont — rien à ressaisir</span></div>`
                                : '';
                        })()}`
                                : ''
                        }
                        ${
                            kind === 'process'
                                ? `
                        <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
                            <span class="text-[10px] uppercase font-bold text-slate-400">🖥 Applications</span>
                            ${
                                (a.appIds || [])
                                    .map(id => {
                                        const x = assetById(id);
                                        return x
                                            ? `<span class="text-xs bg-slate-100 border border-slate-300 text-slate-700 rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-bold">🖥 ${escapeHTML(x.name)}<button onclick="assetAppLink('${a.id}','${x.id}',false)" class="opacity-50 hover:opacity-100 hover:text-red-600">✕</button></span>`
                                            : '';
                                    })
                                    .join('') || '<span class="text-xs text-slate-300 italic">aucune application liée</span>'
                            }
                            ${
                                apps.filter(x => !(a.appIds || []).includes(x.id)).length
                                    ? `<select id="asapp-${a.id}" class="border border-slate-200 p-1 rounded text-xs bg-white">${apps
                                          .filter(x => !(a.appIds || []).includes(x.id))
                                          .map(x => `<option value="${x.id}">${escapeHTML(x.name)}</option>`)
                                          .join(
                                              ''
                                          )}</select><button onclick="assetAppLink('${a.id}', el('asapp-${a.id}').value, true)" class="text-xs bg-white border border-slate-300 px-2 py-1 rounded font-bold text-slate-600 hover:bg-slate-50">Relier</button>`
                                    : apps.length
                                      ? ''
                                      : '<span class="text-[10px] text-slate-300">(déclarez d\'abord des applications)</span>'
                            }
                        </div>
                        ${boAttachHtml('as', a)}
                        <div class="text-[10px] uppercase font-bold text-slate-400 mb-1">Tables utilisées</div>
                        <div class="flex flex-wrap gap-1.5 mb-2">${names.map(n => `<label class="text-xs border rounded px-2 py-1 cursor-pointer ${(a.tables || []).includes(n) ? 'bg-amber-100 border-amber-300 text-amber-800 font-bold' : 'bg-white border-slate-200 text-slate-500'}"><input type="checkbox" class="hidden" ${(a.tables || []).includes(n) ? 'checked' : ''} onchange="toggleAssetTable('${a.id}','${escapeHTML(n.replace(/'/g, "\\'"))}',this.checked)">${escapeHTML(n)}</label>`).join('') || '<span class="text-xs text-slate-400 italic">Aucune table chargée</span>'}</div>
                        <div class="text-[10px] uppercase font-bold text-slate-400 mb-1">Colonnes critiques utilisées</div>
                        <div class="flex flex-wrap items-center gap-2 mb-1.5">
                            ${(a.columns || []).map((l, i) => `<span class="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5 flex items-center gap-1">${escapeHTML(l.table)}.${escapeHTML(l.col)} <button onclick="removeAssetCol('${a.id}',${i})" class="text-amber-400 hover:text-red-500">✕</button></span>`).join('')}
                            <select id="as-tbl-${a.id}" onchange="populateAssetCols('${a.id}',this.value)" class="border border-slate-200 p-1 rounded text-xs bg-white">${names.map(n => `<option>${escapeHTML(n)}</option>`).join('')}</select>
                            <select id="as-col-${a.id}" class="border border-slate-200 p-1 rounded text-xs bg-white">${names[0] ? (tableByName(names[0]) || { headers: [] }).headers.map(h => `<option>${escapeHTML(h)}</option>`).join('') : ''}</select>
                            <button onclick="addAssetCol('${a.id}')" class="text-xs bg-white border border-slate-300 px-2 py-1 rounded font-medium hover:bg-slate-50">Lier colonne</button>
                        </div>`
                                : ''
                        }
                        <div class="text-[11px] text-slate-500">${nUse ? [u.srcs.length ? u.srcs.length + ' source(s)' : '', u.bos.length ? u.bos.length + ' objet(s) métier' : '', u.procs.length ? u.procs.length + ' processus outillé(s)' : ''].filter(Boolean).join(' · ') : '<span class="italic text-slate-300">pas encore relié — dictionnaire (Système source), fiche objet, applications ou tables ci-dessus</span>'}</div>
                    </div>`;
                        })
                        .join('')}
                </div>`;
            }
            return html + '</div>';
        }
        function addGovAsset(kind) {
            (state.governance.assets = state.governance.assets || []).push({
                id: 'as_' + generateId(),
                kind,
                name: kind === 'app' ? 'Nouvelle application' : 'Nouveau processus',
                owner: '',
                criticality: 'Moyenne',
                description: '',
                domain: '',
                appIds: [],
                sources: [],
                tables: [],
                columns: [],
                boIds: []
            });
            persistAppState();
            renderGovernance();
        }
        function updateGovAsset(id, f, v) {
            const asset = assetById(id);
            if (!asset) return;
            // Renommer une application propage le renommage à ses sources possédées (Système source du dictionnaire).
            if (f === 'name' && asset.kind === 'app') {
                const old = String(asset.name || '')
                    .trim()
                    .toLowerCase();
                const dict = state.governance.dictionary || {};
                (asset.sources || []).forEach(tn => {
                    const d = dict[tn];
                    if (
                        d &&
                        String(d.sourceSystem || '')
                            .trim()
                            .toLowerCase() === old
                    )
                        d.sourceSystem = v;
                });
            }
            asset[f] = v;
            persistAppState();
        }
        // ---- V6 Lot 1 : une SOURCE (fichier chargé) appartient à UNE application (son producteur/maître). ----
        // Le rattachement explicite est la source de vérité ; on synchronise le « Système source » du
        // dictionnaire (utilisé par toute la dérivation lineage) pour rester rétro-compatible.
        function sourceTableNames() {
            return Object.values(state.tables)
                .filter(t => t.status === 'ready' && t.type !== 'designed')
                .map(t => t.name);
        }
        function appOwnerOfSource(tableName) {
            const byList = (state.governance.assets || []).find(a => a.kind === 'app' && (a.sources || []).includes(tableName));
            if (byList) return byList;
            const sys = String(((state.governance.dictionary || {})[tableName] || {}).sourceSystem || '')
                .trim()
                .toLowerCase();
            return sys
                ? (state.governance.assets || []).find(
                      a =>
                          a.kind === 'app' &&
                          String(a.name || '')
                              .trim()
                              .toLowerCase() === sys
                  ) || null
                : null;
        }
        function toggleAppSource(appId, tableName, on) {
            const asset = assetById(appId);
            if (!asset) return;
            const dict = (state.governance.dictionary = state.governance.dictionary || {});
            dict[tableName] = dict[tableName] || { columns: {} };
            if (on) {
                // une source a un seul propriétaire : on la retire des autres applications
                (state.governance.assets || []).forEach(x => {
                    if (x.kind === 'app' && x.id !== appId && x.sources) x.sources = x.sources.filter(n => n !== tableName);
                });
                asset.sources = asset.sources || [];
                if (!asset.sources.includes(tableName)) asset.sources.push(tableName);
                dict[tableName].sourceSystem = asset.name;
            } else {
                asset.sources = (asset.sources || []).filter(n => n !== tableName);
                if (
                    String(dict[tableName].sourceSystem || '')
                        .trim()
                        .toLowerCase() ===
                    String(asset.name || '')
                        .trim()
                        .toLowerCase()
                )
                    dict[tableName].sourceSystem = '';
            }
            boSyncAppsFromSources(); // l'appli devient « Produite par » des objets qui utilisent cette source
            persistAppState();
            lfSyncFromData({ silent: true });
            renderGovernance();
        }
        // ---- V6.10 : réconciliation BIDIRECTIONNELLE objet métier ↔ applications ----
        // C'est l'application qui est maître du fichier technique. Donc dès qu'une SOURCE entre dans un
        // objet métier, l'application qui la produit devient « Produite par » (rôle maître/contributeur)
        // ou « Consommée par » (rôle destinataire) — et inversement, rattacher/détacher une source à une
        // application met à jour tous les objets qui l'utilisent. Les rattachements SAISIS À LA MAIN sont
        // conservés : on ne retire que ce qu'on avait soi-même déduit et qui n'est plus justifié.
        function boSyncAppsFromSources() {
            let changed = false;
            (state.governance.businessObjects || []).forEach(bo => {
                const wantProd = [],
                    wantCons = [];
                (bo.sources || []).forEach(s => {
                    if (!s || !s.table) return;
                    const own = appOwnerOfSource(s.table);
                    if (!own) return;
                    const bucket = s.role === 'destinataire' ? wantCons : wantProd;
                    if (!bucket.includes(own.id)) bucket.push(own.id);
                });
                bo.producedBy = bo.producedBy || [];
                bo.consumedBy = bo.consumedBy || [];
                const prevP = bo.producedByAuto || [],
                    prevC = bo.consumedByAuto || [];
                // 1. ajouts déduits
                wantProd.forEach(id => {
                    if (!bo.producedBy.includes(id)) {
                        bo.producedBy.push(id);
                        changed = true;
                    }
                });
                wantCons.forEach(id => {
                    if (!bo.consumedBy.includes(id)) {
                        bo.consumedBy.push(id);
                        changed = true;
                    }
                });
                // 2. retraits des SEULS liens déduits devenus injustifiés (les manuels restent)
                const keepP = bo.producedBy.filter(id => wantProd.includes(id) || !prevP.includes(id));
                if (keepP.length !== bo.producedBy.length) {
                    bo.producedBy = keepP;
                    changed = true;
                }
                const keepC = bo.consumedBy.filter(id => wantCons.includes(id) || !prevC.includes(id));
                if (keepC.length !== bo.consumedBy.length) {
                    bo.consumedBy = keepC;
                    changed = true;
                }
                // 3. mémorise ce qui est déduit (pour pouvoir le retirer plus tard)
                if (JSON.stringify(wantProd) !== JSON.stringify(prevP)) {
                    bo.producedByAuto = wantProd;
                    changed = true;
                }
                if (JSON.stringify(wantCons) !== JSON.stringify(prevC)) {
                    bo.consumedByAuto = wantCons;
                    changed = true;
                }
            });
            return changed;
        }
        // Objets métier alimentés par les sources d'une application (sens application → objets).
        function appBusinessObjects(app) {
            if (!app || app.kind !== 'app') return [];
            const srcs = new Set(assetUsage(app).srcs);
            return (state.governance.businessObjects || []).filter(bo => (bo.sources || []).some(s => s && srcs.has(s.table)));
        }
        // Migration : reconstruit a.sources à partir du « Système source » (nom) déclaré au dictionnaire.
        function migrateAppSources() {
            const dict = state.governance.dictionary || {};
            let changed = false;
            (state.governance.assets || [])
                .filter(a => a.kind === 'app')
                .forEach(a => {
                    if (!Array.isArray(a.sources)) {
                        a.sources = [];
                        changed = true;
                    }
                    Object.keys(dict).forEach(tn => {
                        if (!tableByName(tn)) return;
                        if (
                            String(dict[tn].sourceSystem || '')
                                .trim()
                                .toLowerCase() ===
                                String(a.name || '')
                                    .trim()
                                    .toLowerCase() &&
                            !a.sources.includes(tn)
                        ) {
                            a.sources.push(tn);
                            changed = true;
                        }
                    });
                });
            return changed;
        }
        function removeGovAsset(id) {
            state.governance.assets = (state.governance.assets || []).filter(a => a.id !== id);
            (state.governance.businessObjects || []).forEach(bo => {
                bo.producedBy = (bo.producedBy || []).filter(x => x !== id);
                bo.consumedBy = (bo.consumedBy || []).filter(x => x !== id);
            });
            (state.governance.useCases || []).forEach(uc => {
                uc.assetIds = (uc.assetIds || []).filter(x => x !== id);
            });
            (state.governance.assets || []).forEach(a => {
                if (a.appIds) a.appIds = a.appIds.filter(x => x !== id);
            });
            persistAppState();
            renderGovernance();
        }
        // Rattachement générique d'actifs (objets métier : produite par / consommée par ; cas d'usage).
        function assetAttachHtml(entKind, entId, field, ids, title) {
            const assets = state.governance.assets || [];
            const chips = (ids || [])
                .map(id => {
                    const asset = assetById(id);
                    if (!asset) return '';
                    return `<span class="text-xs bg-slate-100 border border-slate-300 text-slate-700 rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-bold">${escapeHTML(assetLabel(asset))}<button onclick="toggleAssetLink('${entKind}','${entId}','${field}','${asset.id}',false)" class="opacity-50 hover:opacity-100 hover:text-red-600">✕</button></span>`;
                })
                .join('');
            const remain = assets.filter(a => !(ids || []).includes(a.id));
            const selId = `asatt-${entKind}-${entId}-${field}`;
            return `<div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span class="text-[10px] uppercase font-bold text-slate-400 w-28">${title}</span>
                ${chips || '<span class="text-xs text-slate-300 italic">—</span>'}
                ${remain.length ? `<select id="${selId}" class="border border-slate-200 p-1 rounded text-xs bg-white">${remain.map(a => `<option value="${a.id}">${escapeHTML(assetLabel(a))}</option>`).join('')}</select><button onclick="toggleAssetLink('${entKind}','${entId}','${field}', el('${selId}').value, true)" class="text-xs bg-white border border-slate-300 px-2 py-1 rounded font-bold text-slate-600 hover:bg-slate-50">Relier</button>` : assets.length ? '' : `<span class="text-[10px] text-slate-300">(déclarez-les dans Gouvernance ▸ Applis & processus)</span>`}
            </div>`;
        }
        function toggleAssetLink(entKind, entId, field, assetId, on) {
            const ent =
                entKind === 'bo'
                    ? (state.governance.businessObjects || []).find(x => x.id === entId)
                    : (state.governance.useCases || []).find(x => x.id === entId);
            if (!ent || !assetId) return;
            ent[field] = ent[field] || [];
            if (on) {
                if (!ent[field].includes(assetId)) ent[field].push(assetId);
            } else ent[field] = ent[field].filter(x => x !== assetId);
            persistAppState();
            renderGovernance();
        }
        // Rattachement d'objets métier aux périmètres / termes de glossaire / cas d'usage.
        function boAttachHtml(kind, ent) {
            const bos = state.governance.businessObjects || [];
            const ids = ent.boIds || [];
            const chips = ids
                .map(id => {
                    const bo = bos.find(b => b.id === id);
                    if (!bo) return '';
                    return `<span class="text-xs bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-bold"><button data-ro="keep" onclick="openBoFiche('${bo.id}')" class="hover:underline" title="Ouvrir la fiche de l'objet">🏛️ ${escapeHTML(bo.name)}</button><button onclick="toggleEntityBo('${kind}','${ent.id}','${bo.id}',false)" class="opacity-50 hover:opacity-100 hover:text-red-600">✕</button></span>`;
                })
                .join('');
            const remain = bos.filter(b => !ids.includes(b.id));
            return `<div class="flex flex-wrap items-center gap-1.5 mb-2">
                <span class="text-[10px] uppercase font-bold text-emerald-600">🏛️ Objets métier</span>
                ${chips || '<span class="text-xs text-slate-400 italic">aucun objet rattaché</span>'}
                ${remain.length ? `<select id="boatt-${kind}-${ent.id}" class="border border-slate-200 p-1 rounded text-xs bg-white">${remain.map(b => `<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')}</select><button onclick="toggleEntityBo('${kind}','${ent.id}', el('boatt-${kind}-${ent.id}').value, true)" class="text-xs bg-white border border-emerald-300 text-emerald-700 px-2 py-1 rounded font-bold hover:bg-emerald-50">Rattacher</button>` : bos.length ? '' : '<span class="text-[10px] text-slate-300">(créez des objets dans l\'onglet Objets métier)</span>'}
            </div>`;
        }
        function toggleEntityBo(kind, id, boId, on) {
            const coll =
                kind === 'per'
                    ? state.governance.perimeters
                    : kind === 'gl'
                      ? state.governance.glossary
                      : kind === 'as'
                        ? state.governance.assets
                        : state.governance.useCases;
            const ent = (coll || []).find(x => x.id === id);
            if (!ent || !boId) return;
            ent.boIds = ent.boIds || [];
            if (on) {
                if (!ent.boIds.includes(boId)) ent.boIds.push(boId);
            } else ent.boIds = ent.boIds.filter(x => x !== boId);
            persistAppState();
            renderGovernance();
        }
        function openBoFiche(boId) {
            govState.tab = 'objects';
            govState.selectedBoId = boId;
            renderGovernance();
        }
        function addPerimeter() {
            state.governance.perimeters.push({
                id: 'per_' + generateId(),
                name: 'Nouveau périmètre',
                description: '',
                tables: []
            });
            persistAppState();
            renderGovernance();
        }
        function updatePerimeter(id, f, v) {
            const perimeter = state.governance.perimeters.find(x => x.id === id);
            if (perimeter) {
                perimeter[f] = v;
                persistAppState();
            }
        }
        function removePerimeter(id) {
            state.governance.perimeters = state.governance.perimeters.filter(x => x.id !== id);
            persistAppState();
            renderGovernance();
        }
        function togglePerimeterTable(id, name, checked) {
            const perimeter = state.governance.perimeters.find(x => x.id === id);
            if (!perimeter) return;
            perimeter.tables = perimeter.tables || [];
            if (checked) {
                if (!perimeter.tables.includes(name)) perimeter.tables.push(name);
            } else perimeter.tables = perimeter.tables.filter(t => t !== name);
            persistAppState();
            renderGovernance();
        }
