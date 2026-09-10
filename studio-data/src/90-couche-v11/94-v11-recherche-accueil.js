        // ======================= V11 : RECHERCHE GLOBALE, ACCUEIL, EXEMPLE, VISITE GUIDÉE =======================
        // ---- Recherche globale (Ctrl+K) ----
        function v11Index() {
            const governance = state.governance;
            const out = [];
            const gov = NAV_PHASES.find(p => p.id === 'gov');
            v11RecentList().forEach(x =>
                out.push({
                    grp: 'Récents',
                    ic: x.kind === 'bo' ? '🏛️' : x.kind === 'term' ? '📖' : x.kind === 'asset' ? '🖥' : '▦',
                    label: x.name,
                    sub: 'récemment consulté',
                    key: x.name,
                    recent: true,
                    go: () => v11RecentGo(x.kind, x.id)
                })
            );
            gov.tabs
                .filter(t => !t.hidden)
                .forEach(t =>
                    out.push({ grp: 'Écrans', ic: t.icon, label: t.label, sub: t.fam, key: t.label, go: () => openGovTab(t.g) })
                );
            out.push({
                grp: 'Actions',
                ic: '＋',
                label: 'Nouvel objet métier (assistant en 3 étapes)',
                key: 'nouvel objet créer assistant',
                go: () => v11WizardOpen()
            });
            out.push({
                grp: 'Actions',
                ic: '⛶',
                label: 'Plein écran de la fiche courante',
                key: 'plein écran',
                go: () => {
                    const element = document.querySelector('.v11-fiche') || el('boDetail');
                    if (element) v11Fs(element.id ? '#' + element.id : element);
                }
            });
            out.push({
                grp: 'Actions',
                ic: '🎞',
                label: v11Prefs.present ? 'Quitter le mode présentation' : 'Mode présentation',
                key: 'présentation',
                go: () => v11Present(!v11Prefs.present)
            });
            out.push({
                grp: 'Actions',
                ic: '?',
                label: 'Aide, raccourcis et préférences',
                key: 'aide raccourcis préférences',
                go: () => v11HelpOpen()
            });
            out.push({ grp: 'Actions', ic: '▶', label: 'Visite guidée', key: 'visite guidée tour', go: () => v11TourStart() });
            (governance.businessObjects || []).forEach(bo => {
                out.push({
                    grp: 'Objets métier',
                    ic: '🏛️',
                    label: bo.name,
                    sub: [bo.domain, bo.globalOwner].filter(Boolean).join(' · '),
                    key: bo.name + ' ' + (bo.definition || ''),
                    go: () => v11GoBo(bo.id)
                });
                (boAllAttrRows(bo) || []).forEach(r =>
                    out.push({
                        grp: 'Attributs',
                        ic: '🔹',
                        label: r.el.name,
                        sub: bo.name + (r.facet ? ' ◆ ' + r.facet : ''),
                        key: r.el.name + ' ' + (r.el.definition || ''),
                        go: () => v11GoBo(bo.id, r.el.id, r.stId)
                    })
                );
            });
            (governance.glossary || []).forEach(t =>
                out.push({
                    grp: 'Termes',
                    ic: '📖',
                    label: t.term,
                    sub: t.domain || '',
                    key: t.term + ' ' + (t.definition || ''),
                    go: () => termTagOpen(t.id)
                })
            );
            (governance.assets || []).forEach(a =>
                out.push({
                    grp: a.kind === 'process' ? 'Processus' : 'Applications',
                    ic: a.kind === 'process' ? '⚙️' : '🖥',
                    label: a.name,
                    sub: a.domain || '',
                    key: a.name + ' ' + (a.description || ''),
                    go: () => v11GoAsset(a.id)
                })
            );
            Object.values(state.tables)
                .filter(t => t.status === 'ready')
                .forEach(t => {
                    out.push({
                        grp: 'Sources',
                        ic: '▦',
                        label: t.name,
                        sub: (t.theme || '') + (t.headers ? ' · ' + t.headers.length + ' col.' : ''),
                        key: t.name,
                        go: () => v11GoTable(t.name)
                    });
                    (t.headers || []).forEach(h =>
                        out.push({
                            grp: 'Colonnes',
                            ic: '▫',
                            label: h,
                            sub: t.name,
                            key: h + ' ' + t.name,
                            go: () => catOpenByKey({ type: 'column', tbl: t.name, col: h })
                        })
                    );
                });
            (governance.people || []).forEach(p =>
                out.push({
                    grp: 'Personnes',
                    ic: '👤',
                    label: p.name,
                    sub: typeof govRoleSummary === 'function' ? govRoleSummary(p) : '',
                    key: p.name,
                    go: () => openGovTab('people')
                })
            );
            return out;
        }
        function v11Score(it, q) {
            const normalized = catNorm(it.label),
                k = catNorm(it.key || it.label);
            const words = q.split(/\s+/).filter(Boolean);
            if (!words.length) return it.recent ? 2 : it.grp === 'Écrans' || it.grp === 'Actions' ? 1 : 0;
            let count = 0;
            for (const w of words) {
                if (normalized === w) count += 40;
                else if (normalized.startsWith(w)) count += 25;
                else if (normalized.includes(w)) count += 14;
                else if (k.includes(w)) count += 5;
                else return 0;
            }
            return count;
        }
        function v11PaletteOpen() {
            v11PaletteClose();
            v11HelpClose();
            const divElement = document.createElement('div');
            divElement.className = 'v11-pal-scrim';
            divElement.id = 'v11Pal';
            divElement.setAttribute('data-ro', 'keep');
            divElement.innerHTML = `<div class="v11-pal" role="dialog" aria-label="Recherche"><input type="text" id="v11PalIn" placeholder="Rechercher un objet, un attribut, un terme, une application, une source, un écran…" autocomplete="off"><div class="res" id="v11PalRes"></div>
                <div class="ft"><span><span class="v11-kbd">↑↓</span> naviguer</span><span><span class="v11-kbd">Entrée</span> ouvrir</span><span><span class="v11-kbd">Échap</span> fermer</span></div>
                </div>`;
            divElement.addEventListener('click', e => {
                if (e.target === divElement) v11PaletteClose();
            });
            document.body.appendChild(divElement);
            const inp = el('v11PalIn');
            divElement._idx = v11Index();
            divElement._sel = 0;
            inp.addEventListener('input', () => {
                divElement._sel = 0;
                v11PaletteRender();
            });
            inp.addEventListener('keydown', e => {
                const n = divElement._items ? divElement._items.length : 0;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    divElement._sel = Math.min(n - 1, divElement._sel + 1);
                    v11PaletteRender();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    divElement._sel = Math.max(0, divElement._sel - 1);
                    v11PaletteRender();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    v11PaletteGo(divElement._sel);
                }
            });
            v11PaletteRender();
            setTimeout(() => inp.focus(), 20);
        }
        function v11PaletteRender() {
            const v11PalElement = el('v11Pal');
            if (!v11PalElement) return;
            const normalized = catNorm(el('v11PalIn').value.trim());
            const scored = v11PalElement._idx
                .map(it => ({ it, s: v11Score(it, normalized) }))
                .filter(x => x.s > 0)
                .sort((a, b) => b.s - a.s)
                .slice(0, 40);
            const best = {};
            scored.forEach(x => {
                if (best[x.it.grp] === undefined) best[x.it.grp] = x.s;
            });
            const items = scored
                .sort((a, b) => best[b.it.grp] - best[a.it.grp] || (a.it.grp === b.it.grp ? b.s - a.s : 0))
                .map(x => x.it);
            v11PalElement._items = items;
            if (v11PalElement._sel >= items.length) v11PalElement._sel = Math.max(0, items.length - 1);
            let html = '',
                grp = '';
            items.forEach((it, i) => {
                if (it.grp !== grp) {
                    grp = it.grp;
                    html += `<div class="grp">${escapeHTML(grp)}</div>`;
                }
                html += `<div class="it ${i === v11PalElement._sel ? 'on' : ''}" onmousedown="v11PaletteGo(${i})"><span class="ic">${it.ic}</span><span>${escapeHTML(it.label)}</span>${it.sub ? `<span class="sub">${escapeHTML(it.sub)}</span>` : ''}</div>`;
            });
            el('v11PalRes').innerHTML =
                html ||
                '<div class="it" style="color:var(--v7-muted)">Aucun résultat. Essayez un autre mot, ou une partie du nom.</div>';
            const element = el('v11PalRes').querySelector('.it.on');
            if (element) element.scrollIntoView({ block: 'nearest' });
        }
        function v11PaletteGo(i) {
            const v11PalElement = el('v11Pal');
            if (!v11PalElement || !v11PalElement._items || !v11PalElement._items[i]) return;
            const it = v11PalElement._items[i];
            v11PaletteClose();
            if (currentTab !== 9 && it.grp !== 'Actions') switchTab(9);
            try {
                it.go();
            } catch (e) {
                console.error(e);
            }
        }
        function v11PaletteClose() {
            const v11PalElement = el('v11Pal');
            if (v11PalElement) v11PalElement.remove();
        }
        // ---- Accueil de la gouvernance ----
        function v11HomeHtml() {
            const governance = state.governance;
            const bos = governance.businessObjects || [];
            const u = typeof curUser === 'function' ? curUser() : null;
            const nAttr = bos.reduce((n, b) => n + (boAllAttrRows(b) || []).length, 0);
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            const empty =
                !bos.length && !(governance.glossary || []).length && !(governance.assets || []).length && !tables.length;
            const pend = typeof propCountPendingFor === 'function' && govFeatureOn() ? propCountPendingFor() : 0;
            const mine = bo =>
                !u ||
                !bo.domain ||
                (typeof govRoleIn === 'function' && govRoleIn(bo.domain) !== 'reader') ||
                (typeof govIsOwnerOfBo === 'function' && govIsOwnerOfBo(bo));
            const todo = bos
                .filter(mine)
                .map(bo => ({ bo, c: boCompleteness(bo) }))
                .filter(x => x.c.score < 100)
                .sort((a, b) => a.c.score - b.c.score)
                .slice(0, 6);
            const changes = [];
            bos.forEach(bo =>
                (bo.history || []).forEach(h =>
                    changes.push({
                        at: h.at,
                        what: `${bo.name} : ${h.from || ''} → ${h.to || ''}${h.by ? ' (' + h.by + ')' : ''}`,
                        go: `v11GoBo('${bo.id}')`
                    })
                )
            );
            (governance.proposals || [])
                .filter(p => p.status !== 'pending')
                .forEach(p =>
                    changes.push({
                        at: p.decidedAt || p.at,
                        what: `${p.label} — ${p.status === 'accepted' ? 'validée' : 'refusée'}`,
                        go: `openGovTab('review')`
                    })
                );
            (governance.qualityHistory || [])
                .slice(0, 5)
                .forEach(h => changes.push({ at: h.at || h.date, what: `Audit de ${h.table}`, go: `openGovTab('history')` }));
            changes.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
            const fmt = at => {
                const date = new Date(at);
                return isNaN(date) ? '' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
            };
            const hello = u ? `Bonjour ${escapeHTML(u.name.split(' ')[0])}` : 'Bienvenue';
            let html = `<div class="v11-hello">${hello}</div><div class="v11-hello-sub">${empty ? "Rien n'est encore décrit. Commencez par un objet métier, ou chargez un exemple pour voir l'application remplie." : `${bos.length} objet(s), ${nAttr} attribut(s), ${(governance.glossary || []).length} terme(s), ${(governance.assets || []).length} application(s) et processus, ${tables.length} source(s).`}</div>`;
            html += `<div class="flex flex-wrap gap-2 mb-5" data-ro="keep"><button class="v11-btn pri" onclick="v11WizardOpen()">＋ Nouvel objet métier</button><button class="v11-btn" onclick="v11PaletteOpen()">🔍 Rechercher <span class="v11-kbd">Ctrl K</span></button>${empty ? '<button class="v11-btn" onclick="v11LoadSample()">🧪 Charger un exemple</button>' : ''}<button class="v11-btn" onclick="v11TourStart()">▶ Visite guidée</button><button class="v11-btn" onclick="v11HelpOpen()">? Aide</button></div>`;
            html += '<div class="v11-home">';
            if (typeof govFeatureOn === 'function' && govFeatureOn())
                html += `<div class="v11-card third"><div class="t">✅ À valider <span class="n">${pend}</span></div>${
                    pend
                        ? `<div class="v11-val">${pend} proposition(s) attendent votre décision.</div>
                    <button class="v11-btn pri mt-2" onclick="openGovTab('review')">Ouvrir « À valider »</button>`
                        : '<div class="v11-val empty">Rien à valider pour vous.</div>'
                }</div>`;
            html += `<div class="v11-card ${govFeatureOn && govFeatureOn() ? 'third' : 'half'}"><div class="t">🧭 Fiches à compléter <span class="n">${todo.length}</span></div>${todo.length ? todo.map(x => `<div class="v11-row" onclick="v11GoBo('${x.bo.id}')"><span>🏛️ ${escapeHTML(x.bo.name)}</span><span class="v11-bar" style="width:90px;margin-left:auto"><i style="width:${x.c.score}%"></i></span><span class="sub">${x.c.score} % · ${escapeHTML(x.c.todos[0] ? x.c.todos[0].lbl : '')}</span></div>`).join('') : '<div class="v11-val empty">Toutes vos fiches sont complètes.</div>'}</div>`;
            html += `<div class="v11-card ${govFeatureOn && govFeatureOn() ? 'third' : 'half'}"><div class="t">🕓 Derniers changements</div>${
                changes.length
                    ? changes
                          .slice(0, 8)
                          .map(
                              c =>
                                  `<div class="v11-row" onclick="${c.go}"><span>${escapeHTML(c.what)}</span><span class="sub">${fmt(c.at)}</span></div>`
                          )
                          .join('')
                    : '<div class="v11-val empty">Aucun changement tracé pour l\'instant.</div>'
            }</div>`;
            const rec = v11RecentList();
            if (rec.length)
                html += `<div class="v11-card full"><div class="t">🕘 Reprendre où vous en étiez</div><div class="v11-chips">${rec.map(x => `<span class="v11-chip" onclick="v11RecentGo('${x.kind}','${escapeHTML(String(x.id)).replace(/'/g, '&#39;')}')"><span class="k">${x.kind === 'bo' ? 'objet' : x.kind === 'term' ? 'terme' : x.kind === 'asset' ? 'appli' : 'source'}</span>${escapeHTML(x.name)}</span>`).join('')}</div>
                    </div>`;
            html += `<div class="v11-card"><div class="t">🏛️ Objets métier <span class="n">${bos.length}</span></div>${
                bos.length
                    ? bos
                          .slice(0, 12)
                          .map(
                              bo =>
                                  `<div class="v11-row" onclick="v11GoBo('${bo.id}')"><span>${escapeHTML(bo.name)}</span><span class="sub">${escapeHTML([bo.domain, bo.globalOwner, (boAllAttrRows(bo) || []).length + ' attr.'].filter(Boolean).join(' · '))}</span></div>`
                          )
                          .join('') +
                      (bos.length > 12
                          ? `<div class="v11-row" onclick="openGovTab('objects')"><span>… et ${bos.length - 12} autre(s)</span></div>`
                          : '')
                    : '<div class="v11-val empty">Aucun objet. Utilisez « Nouvel objet métier ».</div>'
            }</div>`;
            html += `<div class="v11-card"><div class="t">📊 Chiffres clés</div><div class="v11-kpi"><div class="k" onclick="openGovTab('objects')"><div class="v">${bos.length}</div>
                <div class="l">objets</div>
                </div>
                <div class="k"><div class="v">${nAttr}</div>
                <div class="l">attributs</div></div><div class="k" onclick="openGovTab('glossary')"><div class="v">${(governance.glossary || []).length}</div>
                <div class="l">termes</div>
                    </div>
                    <div class="k" onclick="openGovTab('assets')"><div class="v">${(governance.assets || []).length}</div>
                <div class="l">applis · processus</div>
                    </div>
                        <div class="k" onclick="openGovTab('dictionary')"><div class="v">${tables.length}</div>
                <div class="l">sources</div>
                    </div>
                        <div class="k" onclick="openGovTab('people')"><div class="v">${(governance.people || []).length}</div>
                <div class="l">acteurs</div>
                    </div>
                        </div>
                <div class="text-[11px] text-slate-500 mt-3">Raccourcis : <span class="v11-kbd">G</span> puis <span class="v11-kbd">O</span> objets, <span class="v11-kbd">C</span> catalogue, <span class="v11-kbd">D</span> dictionnaire, <span class="v11-kbd">T</span> termes, <span class="v11-kbd">A</span> applications, <span class="v11-kbd">V</span> à valider.</div>
                </div>`;
            html += '</div>';
            return html;
        }
        // ---- Jeu d'exemple (gouvernance seule : objets, termes, applications, acteurs) ----
        function v11LoadSample() {
            const governance = state.governance;
            const id = p => p + '_' + generateId();
            const erp = {
                id: id('as'),
                kind: 'app',
                name: 'ERP Finance',
                domain: 'Finance',
                owner: 'Alice Martin',
                criticality: 'Critique',
                description: 'Progiciel de gestion : clients, factures, règlements.',
                sources: []
            };
            const crm = {
                id: id('as'),
                kind: 'app',
                name: 'CRM',
                domain: 'Commerce',
                owner: 'Bob Durand',
                criticality: 'Haute',
                description: 'Relation client : contacts, opportunités.',
                sources: []
            };
            const fact = {
                id: id('as'),
                kind: 'process',
                name: 'Facturation mensuelle',
                domain: 'Finance',
                owner: 'Alice Martin',
                appIds: [erp.id],
                description: 'Émission des factures en fin de mois.'
            };
            (governance.assets = governance.assets || []).push(erp, crm, fact);
            const mk = (name, def, extra) =>
                Object.assign({ id: id('be'), name, definition: def, owner: '', mappings: [] }, extra || {});
            const client = {
                id: id('bo'),
                name: 'Client',
                domain: 'Finance',
                globalOwner: 'Alice Martin',
                status: 'Validé',
                definition: 'Personne ou société ayant au moins une facture émise.',
                contributors: ['Commerce'],
                sources: [],
                structure: [],
                producedBy: [erp.id],
                consumedBy: [fact.id, crm.id],
                elements: [
                    mk('Numéro client', 'Identifiant unique attribué à la création.', {
                        sensitivity: 'Interne',
                        usedBy: [fact.id]
                    }),
                    mk('Raison sociale', 'Nom légal du client.', { sensitivity: 'Interne' }),
                    mk('E-mail de contact', 'Adresse du contact principal.', {
                        sensitivity: 'Personnel (RGPD)',
                        usedBy: [crm.id]
                    }),
                    mk("Chiffre d'affaires", 'Total HT facturé sur 12 mois glissants.', { examples: '12 500 ; 98 000' })
                ]
            };
            const facture = {
                id: id('bo'),
                name: 'Facture',
                domain: 'Finance',
                globalOwner: 'Alice Martin',
                status: 'Brouillon',
                definition: 'Document comptable émis à un client.',
                contributors: [],
                sources: [],
                structure: [],
                producedBy: [erp.id],
                consumedBy: [],
                elements: [
                    mk('Numéro de facture', ''),
                    mk('Montant TTC', 'Montant toutes taxes comprises.'),
                    mk("Date d'émission", '')
                ]
            };
            const opp = {
                id: id('bo'),
                name: 'Opportunité',
                domain: 'Commerce',
                globalOwner: 'Bob Durand',
                status: 'Brouillon',
                definition: '',
                contributors: [],
                sources: [],
                structure: [],
                producedBy: [crm.id],
                consumedBy: [],
                elements: [mk('Montant estimé', ''), mk('Étape', 'Position dans le cycle de vente.')]
            };
            (governance.businessObjects = governance.businessObjects || []).push(client, facture, opp);
            (governance.glossary = governance.glossary || []).push(
                {
                    id: id('gl'),
                    term: "Chiffre d'affaires",
                    domain: 'Finance',
                    definition: 'Somme des ventes HT sur une période.',
                    attrLinks: [{ boId: client.id, elId: client.elements[3].id }],
                    boIds: [],
                    assetIds: []
                },
                {
                    id: id('gl'),
                    term: 'Client actif',
                    domain: 'Commerce',
                    definition: 'Client ayant commandé dans les 12 derniers mois.',
                    attrLinks: [],
                    boIds: [client.id],
                    assetIds: [crm.id]
                }
            );
            governance.domainList = Array.from(new Set([...(governance.domainList || []), 'Finance', 'Commerce']));
            if (!(governance.people || []).length) {
                governance.people = [
                    {
                        id: id('pe'),
                        name: 'Alice Martin',
                        email: 'alice@exemple.fr',
                        roles: [
                            { domain: 'Finance', role: 'owner' },
                            { domain: 'Commerce', role: 'contrib' }
                        ]
                    },
                    {
                        id: id('pe'),
                        name: 'Bob Durand',
                        email: 'bob@exemple.fr',
                        roles: [
                            { domain: 'Commerce', role: 'owner' },
                            { domain: 'Finance', role: 'contrib' }
                        ]
                    }
                ];
                if (typeof govSetUser === 'function') {
                    govState.userId = governance.people[0].id;
                    try {
                        localStorage.setItem('sd_user', governance.people[0].id);
                    } catch (e) {}
                }
            }
            persistAppState();
            renderNav();
            openGovTab('home');
            v11Toast(
                'Exemple chargé : 3 objets, 2 termes, 2 applications, 1 processus, 2 acteurs (vous êtes Alice). Supprimez-le quand vous voulez.',
                'ok'
            );
        }
        // ---- Visite guidée ----
        const V11_TOUR = [
            {
                sel: '.v7-side',
                t: 'Le menu',
                x: 'Trois familles : Explorer (accueil, catalogue, modèle, lineage), Décrire (objets, dictionnaire, glossaire, applications) et Piloter (acteurs, validations, historique). Le menu se replie de lui-même quand vous modifiez une fiche.'
            },
            {
                sel: '#v11Save',
                t: 'Enregistré, toujours',
                x: 'Chaque modification est enregistrée sur votre poste. « Annuler » revient en arrière ; Ctrl+Z aussi.'
            },
            {
                sel: '.v11-topbtn',
                t: 'Rechercher partout',
                x: 'Ctrl+K ouvre la recherche : objets, attributs, termes, applications, sources, colonnes, écrans. Entrée ouvre la fiche.'
            },
            {
                sel: '#govContent',
                t: 'Des fiches qui se lisent',
                x: "Objets, termes, applications et sources s'ouvrent en lecture : une carte propre. « Modifier » ouvre le formulaire ; cliquer une valeur la modifie en place. ⛶ met la fiche en plein écran."
            },
            {
                sel: '#govCrumb',
                t: "Toujours savoir où l'on est",
                x: "Le fil d'Ariane est cliquable, et les flèches ◀ ▶ (Alt+← / Alt+→) reviennent sur les écrans précédents. « ? » affiche l'aide et les raccourcis. Bonne visite !"
            }
        ];
        function v11TourStart(auto) {
            if (auto && currentTab !== 9) {
                try {
                    switchTab(9);
                } catch (e) {}
            }
            v11TourEnd();
            v11State.tour = { i: 0 };
            v11TourStep();
        }
        function v11TourStep() {
            const t = v11State.tour;
            if (!t) return;
            const st = V11_TOUR[t.i];
            if (!st) return v11TourEnd(true);
            let v11TourElement = el('v11Tour');
            if (!v11TourElement) {
                v11TourElement = document.createElement('div');
                v11TourElement.className = 'v11-tour';
                v11TourElement.id = 'v11Tour';
                v11TourElement.setAttribute('data-ro', 'keep');
                v11TourElement.innerHTML = '<div class="spot"></div><div class="card"></div>';
                document.body.appendChild(v11TourElement);
            }
            const node = document.querySelector(st.sel);
            const r = node
                ? node.getBoundingClientRect()
                : { left: window.innerWidth / 2 - 150, top: 100, width: 300, height: 60 };
            const spot = v11TourElement.querySelector('.spot');
            Object.assign(spot.style, {
                left: r.left - 6 + 'px',
                top: r.top - 6 + 'px',
                width: r.width + 12 + 'px',
                height: Math.min(r.height, window.innerHeight - r.top - 20) + 12 + 'px'
            });
            const card = v11TourElement.querySelector('.card');
            card.innerHTML = `<b class="t">${escapeHTML(st.t)}</b>${escapeHTML(st.x)}<div class="ft"><span class="st">${t.i + 1} / ${V11_TOUR.length}</span><button class="v11-btn sm" onclick="v11TourEnd(true)">Passer</button><button class="v11-btn pri sm" onclick="v11TourNext()">${t.i + 1 === V11_TOUR.length ? 'Terminer' : 'Suivant ›'}</button></div>`;
            let left = r.left + r.width + 16,
                top = r.top;
            if (left + 330 > window.innerWidth) {
                left = Math.max(12, r.left + r.width / 2 - 160);
                top = r.top + Math.min(r.height, 120) + 14;
            }
            if (top + 220 > window.innerHeight) top = Math.max(12, window.innerHeight - 230);
            Object.assign(card.style, { left: left + 'px', top: top + 'px' });
        }
        function v11TourNext() {
            if (!v11State.tour) return;
            v11State.tour.i++;
            v11TourStep();
        }
        function v11TourEnd(done) {
            v11State.tour = null;
            const v11TourElement = el('v11Tour');
            if (v11TourElement) v11TourElement.remove();
            if (done) {
                v11Prefs.tourDone = true;
                v11SavePrefs();
            }
        }
