        // ======================= V14 : PANNEAU « ARCHITECTURE » =======================
        // Rend visible, dans l'application, ce que le noyau d'architecture (10-noyau/00-studio.js) enregistre :
        //   • les modules (fichiers sources) par domaine et par couche, avec leurs fonctions déclarées ;
        //   • la chaîne d'extensions de chaque fonction (quelle couche l'enrichit, dans quel ordre, pourquoi) ;
        //   • l'auto-contrôle Studio.selfCheck() et l'export de l'index de l'API (JSON).
        // Accès : aide « ? » → bouton « Architecture », ou palette Ctrl K → « Architecture du code ».
        const v14State = { tab: 'modules', query: '' };
        function v14DomainOf(file) {
            return String(file || '').split('/')[0] || '(build)';
        }
        function v14LayerBadge(layer) {
            return `<span class="v14-layer ${escapeHTML(layer)}">${escapeHTML(layer)}</span>`;
        }
        function v14MatchesQuery(text) {
            const q = v14State.query.trim().toLowerCase();
            return !q || String(text).toLowerCase().includes(q);
        }
        function v14ModulesHtml() {
            const modules = Studio.modules().filter(m => v14MatchesQuery(m.file + ' ' + m.functions.join(' ')));
            const byDomain = new Map();
            modules.forEach(m => {
                const d = v14DomainOf(m.file);
                if (!byDomain.has(d)) byDomain.set(d, []);
                byDomain.get(d).push(m);
            });
            if (!byDomain.size) return '<p class="text-xs text-slate-500 italic">Aucun module ne correspond.</p>';
            return Array.from(byDomain.entries())
                .map(
                    ([
                        domain,
                        list
                    ]) => `<h4>${escapeHTML(domain)} <span class="font-normal text-slate-500">— ${list.length} fichier(s), ${list.reduce((n, m) => n + m.functions.length, 0)} fonction(s)</span></h4>
                <table class="v14-tbl"><thead><tr><th>Fichier</th>
                        <th>Couche</th>
                        <th>Fonctions</th>
                        </tr>
                        </thead>
                        <tbody>${list
                            .map(m => {
                                const extended = m.functions.filter(fn => Studio.extensionsOf(fn).some(x => x.applied)).length;
                                const shown = m.functions
                                    .slice(0, 12)
                                    .map(fn => '<code>' + escapeHTML(fn) + '</code>')
                                    .join(' ');
                                return `<tr><td><code>${escapeHTML(m.file.split('/').pop())}</code></td><td>${v14LayerBadge(m.layer)}</td><td>${m.functions.length}${extended ? ` <span class="text-slate-500">(dont ${extended} étendue(s))</span>` : ''}<div class="text-slate-500 mt-0.5">${shown}${m.functions.length > 12 ? ' …' : ''}</div>
                                    </td>
                                    </tr>`;
                            })
                            .join('')}</tbody></table>`
                )
                .join('');
        }
        function v14ExtensionsHtml() {
            const byName = new Map();
            Studio.extensions().forEach(x => {
                if (!byName.has(x.name)) byName.set(x.name, []);
                byName.get(x.name).push(x);
            });
            const names = Array.from(byName.keys())
                .filter(n =>
                    v14MatchesQuery(
                        n +
                            ' ' +
                            byName
                                .get(n)
                                .map(x => x.module + ' ' + x.motif)
                                .join(' ')
                    )
                )
                .sort((a, b) => a.localeCompare(b));
            if (!names.length) return '<p class="text-xs text-slate-500 italic">Aucune extension ne correspond.</p>';
            const declaredIn = new Map();
            Studio.modules().forEach(m =>
                m.functions.forEach(fn => {
                    if (!declaredIn.has(fn)) declaredIn.set(fn, m.file);
                })
            );
            return `<table class="v14-tbl"><thead><tr><th>Fonction</th><th>Déclarée dans</th><th>Chaîne d'extensions (dans l'ordre d'application)</th></tr></thead>
                <tbody>${names
                    .map(name => {
                        const chain = byName.get(name);
                        const steps = chain
                            .map(
                                x =>
                                    `<span class="step" title="${escapeHTML(x.motif || '')}">${v14LayerBadge(x.layer)} ${escapeHTML(x.module.split('/').pop())}${x.applied ? '' : ' <span class="v14-ko">non appliquée</span>'}</span>`
                            )
                            .join('<span class="arr">→</span>');
                        return `<tr><td><code>${escapeHTML(name)}</code></td><td class="text-slate-500">${escapeHTML((declaredIn.get(name) || '?').split('/').pop())}</td>
                            <td><div class="v14-chain"><span class="step">base</span><span class="arr">→</span>${steps}</div>${
                                chain.some(x => x.motif)
                                    ? `<div class="text-slate-500 mt-0.5">${chain
                                          .filter(x => x.motif)
                                          .map(x => escapeHTML(x.layer + ' : ' + x.motif))
                                          .join(' · ')}</div>`
                                    : ''
                            }</td></tr>`;
                    })
                    .join('')}</tbody></table>`;
        }
        function v14CheckHtml() {
            const check = Studio.selfCheck();
            const rows = [];
            check.duplicates.forEach(d => rows.push(['Fonction déclarée plusieurs fois', d.name, d.files.join(', ')]));
            check.notApplied.forEach(d => rows.push(['Extension sans base (non appliquée)', d.name, d.module]));
            check.unknownBase.forEach(d =>
                rows.push(["Extension d'une fonction non déclarée au premier niveau", d.name, d.module])
            );
            return `<div class="mb-2">${check.ok ? '<span class="v14-ok">✓ Auto-contrôle sans anomalie</span>' : '<span class="v14-ko">✗ ' + rows.length + ' point(s) à examiner</span>'}</div>
                <div class="v14-kpis"><div class="v14-kpi"><b>${check.modules}</b><span>modules</span></div><div class="v14-kpi"><b>${check.functions}</b><span>fonctions</span></div>
                    <div class="v14-kpi"><b>${check.applied}</b><span>extensions appliquées</span></div>
                    <div class="v14-kpi"><b>${check.extensions - check.applied}</b><span>non appliquées</span></div>
                    </div>
                ${
                    rows.length
                        ? `<table class="v14-tbl"><thead><tr><th>Anomalie</th><th>Fonction</th><th>Où</th></tr></thead><tbody>${rows
                              .map(
                                  r => `<tr><td>${escapeHTML(r[0])}</td>
                    <td><code>${escapeHTML(r[1])}</code></td>
                    <td class="text-slate-500">${escapeHTML(r[2])}</td>
                    </tr>`
                              )
                              .join('')}</tbody>
                    </table>`
                        : '<p class="text-xs text-slate-500">Chaque extension a trouvé sa fonction de base ; aucune fonction n\'est déclarée deux fois.</p>'
                }
                <div class="v14-helprow">Règles : une couche n'assigne jamais une fonction globale directement, elle passe par <code>Studio.extend</code> ; ESLint (<code>studio-data/eslint.config.js</code>) interdit <code>no-func-assign</code> et vérifie les références inter-fichiers ; <code>node studio-data/tests/run.mjs --target v14</code> rejoue les suites.</div>`;
        }
        function v14ArchBodyHtml() {
            const tab = v14State.tab;
            return tab === 'extensions' ? v14ExtensionsHtml() : tab === 'check' ? v14CheckHtml() : v14ModulesHtml();
        }
        function v14ArchRefresh() {
            const body = el('v14ArchBody');
            if (body) body.innerHTML = v14ArchBodyHtml();
            document
                .querySelectorAll('#v14Arch .v14-tabs button')
                .forEach(b => b.classList.toggle('on', b.dataset.tab === v14State.tab));
        }
        function v14ArchTab(tab) {
            v14State.tab = tab;
            v14ArchRefresh();
        }
        function v14ArchSearch(value) {
            v14State.query = value || '';
            v14ArchRefresh();
        }
        function v14ArchOpen() {
            if (typeof v11HelpClose === 'function') v11HelpClose();
            const check = Studio.selfCheck();
            v11ModalOpen(`<div class="v14-arch" id="v14Arch">
                <div class="flex items-start gap-3"><div><h3 class="text-base font-black">Architecture du code</h3>
                <div class="text-xs text-slate-500">Studio Data ${escapeHTML(APP_VERSION)} · ${check.modules} modules · ${check.functions} fonctions · ${check.applied} extensions ${check.ok ? '<span class="v14-ok">✓ auto-contrôle OK</span>' : '<span class="v14-ko">✗ à examiner</span>'}</div>
                    </div>
                    <span class="flex-grow"></span><button class="v11-btn" onclick="v11ModalClose()">✕</button></div>
                <div class="v14-tabs"><button data-tab="modules" class="on" onclick="v14ArchTab('modules')">Modules</button><button data-tab="extensions" onclick="v14ArchTab('extensions')">Extensions</button><button data-tab="check" onclick="v14ArchTab('check')">Auto-contrôle</button></div>
                <input type="search" class="v14-search" placeholder="filtrer : nom de fichier, de fonction, de couche…" oninput="v14ArchSearch(this.value)">
                <div id="v14ArchBody" style="max-height:60vh;overflow:auto">${v14ArchBodyHtml()}</div>
                <div class="v14-acts"><button class="v11-btn" onclick="v14ApiExport()">⬇ Exporter l'index de l'API (JSON)</button><button class="v11-btn" onclick="v14SelfCheckToast()">▶ Relancer l'auto-contrôle</button></div>
            </div>`);
        }
        function v14ApiExport() {
            const payload = {
                app: 'Studio Data',
                version: APP_VERSION,
                generated: new Date().toISOString(),
                modules: Studio.apiMap(),
                extensions: Studio.extensions().map(x => ({
                    name: x.name,
                    module: x.module,
                    layer: x.layer,
                    motif: x.motif,
                    applied: x.applied
                }))
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const anchorElement = document.createElement('a');
            anchorElement.href = URL.createObjectURL(blob);
            anchorElement.download = 'StudioData_API_' + APP_VERSION + '.json';
            document.body.appendChild(anchorElement);
            anchorElement.click();
            anchorElement.remove();
        }
        function v14SelfCheckToast() {
            const check = Studio.selfCheck();
            v11Toast(
                check.ok
                    ? 'Auto-contrôle sans anomalie : ' +
                          check.modules +
                          ' modules, ' +
                          check.functions +
                          ' fonctions, ' +
                          check.applied +
                          ' extensions.'
                    : 'Auto-contrôle : ' +
                          (check.duplicates.length + check.notApplied.length + check.unknownBase.length) +
                          ' point(s) à examiner (onglet Auto-contrôle).',
                check.ok ? 'ok' : 'warn'
            );
            v14State.tab = 'check';
            v14ArchRefresh();
        }
        // ---- points d'entrée : aide « ? », palette, lexique ----
        Studio.extend(
            'v11HelpOpen',
            base =>
                function () {
                    const result = base.apply(this, arguments);
                    try {
                        const box = el('v11Help') && el('v11Help').querySelector('.box');
                        if (box && !box.querySelector('.v14-helpbtn'))
                            box.insertAdjacentHTML(
                                'beforeend',
                                `<div class="v14-helprow"><button class="v11-btn v14-helpbtn" onclick="v14ArchOpen()">🧩 Architecture du code</button> <span>modules, extensions, auto-contrôle — pour qui maintient l'application.</span></div>`
                            );
                    } catch (e) {}
                    return result;
                },
            { motif: "bouton « Architecture du code » dans l'aide" }
        );
        Studio.extend(
            'v11Index',
            base =>
                function () {
                    const items = base.apply(this, arguments);
                    try {
                        if (Array.isArray(items))
                            items.push({
                                grp: 'Actions',
                                ic: '🧩',
                                label: 'Architecture du code (modules, extensions, auto-contrôle)',
                                sub: 'V14 — maintenance',
                                key: 'architecture code modules extensions selfcheck api studio',
                                go: () => v14ArchOpen()
                            });
                    } catch (e) {}
                    return items;
                },
            { motif: 'action « Architecture du code » dans la palette' }
        );
        Object.assign(V11_LEXIQUE, {
            'extension (Studio.extend)':
                'Mécanisme par lequel une couche (V11, V12, V13…) enrichit une fonction existante sans la réécrire : la fonction de base reste appelée, la couche ajoute son comportement avant ou après. Le panneau Architecture montre la chaîne complète.'
        });
