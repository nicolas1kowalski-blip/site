        // ======================= V11 : NOYAU ERGONOMIQUE =======================
        // Cette couche ne réécrit pas les écrans V7 : elle s'y greffe (enveloppes de fonctions,
        // retouches après rendu) pour rendre l'application plus simple à lire et à utiliser.
        //   • préférences mémorisées, densité, présentation, notifications unifiées
        //   • enregistrement visible + annulation (Ctrl+Z), raccourcis clavier, aide « ? »
        //   • menu en trois familles, accueil, historique de navigation, fil d'Ariane cliquable
        //   • plein écran des fiches / tableaux / graphes, tri des tableaux, vocabulaire, infobulles
        const v11State = {
            edit: {},
            lineage: {},
            selTerm: null,
            selAsset: null,
            termQ: '',
            assetQ: '',
            boQ2: '',
            impactOpen: false,
            fs: null,
            hist: { stack: [], i: -1, nav: false },
            undo: [],
            lastGov: null,
            toasts: [],
            toastOn: null,
            prevCollapsed: null,
            tour: null
        };
        const V11_PREF_DEFAULT = {
            density: 'comfy',
            autoCollapse: true,
            readDefault: true,
            present: false,
            tourDone: false,
            screens: {}
        };
        let v11Prefs = Object.assign({}, V11_PREF_DEFAULT);
        function v11LoadPrefs() {
            try {
                const j = localStorage.getItem('sd_v11_prefs');
                if (j) v11Prefs = Object.assign({}, V11_PREF_DEFAULT, JSON.parse(j));
            } catch (e) {}
        }
        function v11SavePrefs() {
            try {
                localStorage.setItem('sd_v11_prefs', JSON.stringify(v11Prefs));
            } catch (e) {}
        }
        function v11SetPref(k, v) {
            v11Prefs[k] = v;
            v11SavePrefs();
            v11ApplyPrefs();
            if (typeof renderGovernance === 'function' && currentTab === 9) renderGovernance();
        }
        function v11ApplyPrefs() {
            document.body.classList.toggle('v11-compact', v11Prefs.density === 'compact');
            document.body.classList.toggle('v11-present', !!v11Prefs.present);
            let v11PresentExitElement = el('v11PresentExit');
            if (v11Prefs.present) {
                if (!v11PresentExitElement) {
                    v11PresentExitElement = document.createElement('button');
                    v11PresentExitElement.id = 'v11PresentExit';
                    v11PresentExitElement.className = 'v11-btn pri v11-present-exit';
                    v11PresentExitElement.setAttribute('data-ro', 'keep');
                    v11PresentExitElement.textContent = '⏏ Quitter la présentation';
                    v11PresentExitElement.onclick = () => v11Present(false);
                    document.body.appendChild(v11PresentExitElement);
                }
            } else if (v11PresentExitElement) v11PresentExitElement.remove();
        }
        function v11Present(on) {
            v11Prefs.present = !!on;
            v11SavePrefs();
            v11ApplyPrefs();
            if (typeof govSetReadOnly === 'function') govSetReadOnly(!!on);
            if (on) document.body.classList.add('v7-collapsed');
            v11Toast(
                on
                    ? 'Mode présentation : polices agrandies, menu masqué, lecture seule. Échap ou ⏏ pour quitter.'
                    : 'Fin de la présentation.',
                'info'
            );
        }
        // Mémoire par écran : vue, filtres, replis — restaurée au chargement.
        const V11_SCREEN_KEYS = [
            'structView',
            'boFilter',
            'boTab',
            'dictMode',
            'glossView',
            'usageView',
            'reviewView',
            'lineageView'
        ];
        function v11RememberScreen() {
            const s = v11Prefs.screens || (v11Prefs.screens = {});
            let ch = false;
            V11_SCREEN_KEYS.forEach(k => {
                if (govState[k] !== undefined && s[k] !== govState[k]) {
                    s[k] = govState[k];
                    ch = true;
                }
            });
            if (typeof catState === 'object' && catState && s.catLayer !== catState.layer) {
                s.catLayer = catState.layer;
                ch = true;
            }
            if (ch) v11SavePrefs();
        }
        function v11RestoreScreen() {
            const s = v11Prefs.screens || {};
            V11_SCREEN_KEYS.forEach(k => {
                if (s[k] !== undefined) govState[k] = s[k];
            });
            if (typeof catState === 'object' && catState && s.catLayer) catState.layer = s.catLayer;
        }
        // ---- Notifications : une file, une à la fois, message court ----
        function v11ToastHost() {
            let h = el('v11Toasts');
            if (!h) {
                h = document.createElement('div');
                h.id = 'v11Toasts';
                h.className = 'v11-toasts';
                document.body.appendChild(h);
            }
            return h;
        }
        function v11Short(msg) {
            const text = String(msg || '').trim();
            const i = text.search(/[.!?]\s|[.!?]$/);
            const first = i > 0 ? text.slice(0, i + 1) : text;
            return first.length > 140 ? first.slice(0, 137) + '…' : first;
        }
        function v11Toast(msg, kind, opts) {
            kind = kind || 'ok';
            opts = opts || {};
            v11State.toasts.push({ msg: String(msg || ''), kind, opts });
            if (v11State.toasts.length > 5) v11State.toasts.splice(0, v11State.toasts.length - 5);
            v11ToastNext();
        }
        function v11ToastNext() {
            if (v11State.toastOn || !v11State.toasts.length) return;
            const t = v11State.toasts.shift();
            const host = v11ToastHost();
            const short = v11Short(t.msg);
            const hasMore = short !== t.msg;
            const divElement = document.createElement('div');
            divElement.className = 'v11-toast ' + t.kind;
            divElement.setAttribute('role', 'status');
            divElement.innerHTML = `<span>${t.kind === 'ok' ? '✓' : t.kind === 'err' ? '⚠' : 'ℹ'}</span><span class="m"></span>${hasMore ? '<span class="more">détail ›</span>' : ''}${t.opts.action ? `<button class="act" data-ro="keep">${escapeHTML(t.opts.actionLabel || 'Annuler')}</button>` : ''}<span class="x" title="Fermer">×</span>`;
            divElement.querySelector('.m').textContent = short;
            let expanded = false;
            divElement.onclick = e => {
                if (e.target.classList.contains('x')) return v11ToastClose(divElement);
                if (e.target.classList.contains('act')) {
                    try {
                        t.opts.action();
                    } catch (er) {}
                    return v11ToastClose(divElement);
                }
                if (hasMore && !expanded) {
                    expanded = true;
                    divElement.querySelector('.m').textContent = t.msg;
                    divElement.querySelector('.more').remove();
                    clearTimeout(divElement._tm);
                    divElement._tm = setTimeout(() => v11ToastClose(divElement), 9000);
                }
            };
            host.appendChild(divElement);
            v11State.toastOn = divElement;
            divElement._tm = setTimeout(() => v11ToastClose(divElement), t.kind === 'err' ? 7000 : t.opts.action ? 6000 : 3500);
        }
        function v11ToastClose(d) {
            if (!d || !d.parentNode) return;
            clearTimeout(d._tm);
            d.remove();
            if (v11State.toastOn === d) v11State.toastOn = null;
            v11ToastNext();
        }
        const _v11_showSuccess = showSuccess,
            _v11_showError = showError;
        showSuccess = function (msg) {
            v11Toast(msg, 'ok');
        };
        showError = function (msg) {
            const globalErrorTextElement = el('globalErrorText');
            if (globalErrorTextElement) globalErrorTextElement.textContent = msg;
            v11Toast(msg, 'err');
        };
        // ---- Enregistrement visible + annulation de la dernière modification ----
        function v11GovJson() {
            try {
                return JSON.stringify({
                    g: state.governance,
                    th: Object.fromEntries(Object.values(state.tables).map(t => [t.id, t.theme || '']))
                });
            } catch (e) {
                return null;
            }
        }
        Studio.extend(
            'persistAppState',
            base =>
                function () {
                    const cur = v11GovJson();
                    if (typeof restoreCompleted !== 'undefined' && !restoreCompleted) {
                        if (cur) v11State.lastGov = cur;
                        return base.apply(this, arguments);
                    }
                    if (cur && v11State.lastGov && cur !== v11State.lastGov && !v11State.undoing) {
                        v11State.undo.push(v11State.lastGov);
                        if (v11State.undo.length > 30) v11State.undo.shift();
                    }
                    if (cur) v11State.lastGov = cur;
                    v11SaveIndicator('busy');
                    const result = base.apply(this, arguments);
                    setTimeout(() => v11SaveIndicator('ok'), 600);
                    return result;
                }
        );
        function v11Undo() {
            const j = v11State.undo.pop();
            if (!j) return v11Toast('Rien à annuler.', 'info');
            let snap;
            try {
                snap = JSON.parse(j);
            } catch (e) {
                return;
            }
            v11State.undoing = true;
            try {
                const G = state.governance;
                Object.keys(G).forEach(k => {
                    delete G[k];
                });
                Object.assign(G, snap.g);
                Object.values(state.tables).forEach(t => {
                    if (snap.th && snap.th[t.id] !== undefined) t.theme = snap.th[t.id];
                });
                v11State.lastGov = v11GovJson();
                persistAppState();
            } finally {
                v11State.undoing = false;
            }
            if (currentTab === 9) {
                renderGovernance();
                renderNav();
            }
            v11Toast('Dernière modification annulée.', 'info');
        }
        function v11SaveIndicator(st) {
            const v11SaveElement = el('v11Save');
            if (!v11SaveElement) return;
            v11SaveElement.classList.toggle('busy', st === 'busy');
            const when = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            v11SaveElement.title = st === 'busy' ? 'Enregistrement en cours' : 'Enregistré à ' + when + ' sur votre poste';
            v11SaveElement.innerHTML = `<span class="dot"></span>${st === 'busy' ? '…' : when}${v11State.undo.length ? '<button data-ro="keep" onclick="v11Undo()" title="Annuler la dernière modification (Ctrl+Z)">⟲ Annuler</button>' : ''}`;
        }
        // ---- Barre du haut : enregistré, précédent / suivant, recherche, aide ----
        function v11MountTopbar() {
            const host = document.querySelector('.v7-top .ml-auto');
            if (!host || el('v11Save')) return;
            const wrap = document.createElement('div');
            wrap.className = 'flex items-center gap-2';
            wrap.setAttribute('data-ro', 'keep');
            wrap.innerHTML = `<span id="v11Save" class="v11-save" title="Enregistré sur votre poste"><span class="dot"></span>✓</span>
                <span class="v11-hist" id="v11Hist"><button onclick="v11Back()" title="Précédent (Alt+←)">◀</button><button onclick="v11Fwd()" title="Suivant (Alt+→)">▶</button></span>
                <button class="v11-topbtn" onclick="v11PaletteOpen()" title="Rechercher partout (Ctrl+K)"><span>🔍</span><kbd>Ctrl K</kbd></button>
                <button class="v11-topbtn" onclick="v11HelpOpen()" title="Aide, raccourcis, préférences (?)">?</button>`;
            host.insertBefore(wrap, host.firstChild);
            v11HistButtons();
        }
        // ---- Menu : trois familles + accueil ----
        const V11_FAMS = {
            home: 'Explorer',
            catalog: 'Explorer',
            model: 'Explorer',
            flow: 'Explorer',
            lineage: 'Explorer',
            objects: 'Décrire',
            dictionary: 'Décrire',
            glossary: 'Décrire',
            assets: 'Décrire',
            vlists: 'Décrire',
            perimeters: 'Décrire',
            privacy: 'Décrire',
            people: 'Piloter',
            review: 'Piloter',
            history: 'Piloter',
            srcwatch: 'Piloter'
        };
        const V11_ORDER = [
            'home',
            'catalog',
            'model',
            'flow',
            'lineage',
            'objects',
            'dictionary',
            'glossary',
            'assets',
            'vlists',
            'perimeters',
            'privacy',
            'review',
            'people',
            'history',
            'srcwatch'
        ];
        (function () {
            const gov = NAV_PHASES.find(p => p.id === 'gov');
            if (!gov) return;
            if (!gov.tabs.some(t => t.g === 'home'))
                gov.tabs.unshift({ g: 'home', icon: '🏠', label: 'Accueil', fam: 'Explorer' });
            gov.tabs.forEach(t => {
                if (V11_FAMS[t.g]) t.fam = V11_FAMS[t.g];
            });
            gov.tabs.sort((a, b) => (V11_ORDER.indexOf(a.g) + 1 || 99) - (V11_ORDER.indexOf(b.g) + 1 || 99));
            if (Array.isArray(GOV_RO_TABS) && !GOV_RO_TABS.includes('home')) GOV_RO_TABS.push('home');
            if (govState.tab === 'catalog') govState.tab = 'home';
        })();
        Studio.extend(
            'renderNav',
            base =>
                function () {
                    base.apply(this, arguments);
                    const items = document.querySelector('.v7-grp[data-phase="gov"] .v7-items');
                    if (!items) return;
                    let last = null;
                    Array.from(items.querySelectorAll('button.v7-it')).forEach(b => {
                        const m = (b.getAttribute('onclick') || '').match(/openGovTab\('([^']+)'\)/);
                        const fam = m ? V11_FAMS[m[1]] : null;
                        if (fam && fam !== last) {
                            const h = document.createElement('div');
                            h.className = 'v11-fam';
                            h.textContent = fam;
                            items.insertBefore(h, b);
                            last = fam;
                        }
                    });
                }
        );
        // ---- Historique de navigation (Précédent / Suivant) ----
        function v11NavKey() {
            return JSON.stringify({
                tab: govState.tab,
                bo: govState.selectedBoId,
                sel: govState.boSel,
                boTab: govState.boTab,
                dm: govState.dictMode,
                dt: govState.dictTable,
                db: govState.dictBoId,
                gf: govState.glossFocus,
                gv: govState.glossView
            });
        }
        function v11HistPush() {
            if (v11State.hist.nav) return;
            const k = v11NavKey();
            const h = v11State.hist;
            if (h.stack[h.i] === k) return;
            h.stack = h.stack.slice(0, h.i + 1);
            h.stack.push(k);
            if (h.stack.length > 60) h.stack.shift();
            h.i = h.stack.length - 1;
            v11HistButtons();
        }
        function v11HistGo(d) {
            const h = v11State.hist;
            const j = h.i + d;
            if (j < 0 || j >= h.stack.length) return;
            h.i = j;
            let s;
            try {
                s = JSON.parse(h.stack[j]);
            } catch (e) {
                return;
            }
            h.nav = true;
            try {
                govState.selectedBoId = s.bo;
                govState.boSel = s.sel;
                govState.boTab = s.boTab;
                govState.dictMode = s.dm;
                govState.dictTable = s.dt;
                govState.dictBoId = s.db;
                govState.glossFocus = s.gf;
                govState.glossView = s.gv;
                openGovTab(s.tab || 'home');
            } finally {
                h.nav = false;
            }
            v11HistButtons();
        }
        function v11Back() {
            v11HistGo(-1);
        }
        function v11Fwd() {
            v11HistGo(1);
        }
        function v11HistButtons() {
            const w = el('v11Hist');
            if (!w) return;
            const [b, f] = w.querySelectorAll('button');
            b.disabled = v11State.hist.i <= 0;
            f.disabled = v11State.hist.i >= v11State.hist.stack.length - 1;
        }
        // ---- Fil d'Ariane cliquable ----
        function v11Crumb() {
            const govCrumbElement = el('govCrumb');
            if (!govCrumbElement) return;
            const gov = NAV_PHASES.find(p => p.id === 'gov');
            const tab = gov.tabs.find(x => x.g === govState.tab) || {};
            const fam = tab.fam || 'Gouvernance';
            const first = (gov.tabs.find(x => x.fam === fam) || {}).g || 'home';
            const A = (act, txt) => `<a data-ro="keep" onclick="${act}">${txt}</a>`;
            const parts = [
                A("openGovTab('home')", govIsReadOnly() ? '👁 Consultation' : 'Gouvernance'),
                A(`openGovTab('${first}')`, escapeHTML(fam))
            ];
            let leaf = escapeHTML(tab.label || '');
            if (govState.tab === 'objects' && govState.selectedBoId) {
                const bo = (state.governance.businessObjects || []).find(b => b.id === govState.selectedBoId);
                if (bo) {
                    parts.push(A("openGovTab('objects')", leaf));
                    const sel = govState.boSel;
                    const attributeRow =
                        sel && sel.kind === 'attr' ? (boAllAttrRows(bo) || []).find(x => x.el.id === sel.elId) : null;
                    if (attributeRow && govState.boTab === 'structure') {
                        parts.push(A('govState.boSel=null; renderGovernance()', escapeHTML(bo.name)));
                        leaf = escapeHTML(attributeRow.el.name);
                    } else leaf = escapeHTML(bo.name);
                }
            } else if (govState.tab === 'glossary' && v11State.selTerm && (govState.glossView || 'terms') === 'terms') {
                const term = (state.governance.glossary || []).find(x => x.id === v11State.selTerm);
                if (term) {
                    parts.push(A("openGovTab('glossary')", leaf));
                    leaf = escapeHTML(term.term);
                }
            } else if (govState.tab === 'assets' && v11State.selAsset) {
                const asset = assetById(v11State.selAsset);
                if (asset) {
                    parts.push(A("openGovTab('assets')", leaf));
                    leaf = escapeHTML(asset.name);
                }
            } else if (govState.tab === 'dictionary' && govState.dictMode === 'table' && govState.dictTable) {
                parts.push(A("openGovTab('dictionary')", leaf));
                leaf = escapeHTML(govState.dictTable);
            } else if (govState.tab === 'dictionary' && govState.dictMode === 'bo' && govState.dictBoId) {
                const bo = (state.governance.businessObjects || []).find(b => b.id === govState.dictBoId);
                if (bo) {
                    parts.push(A("openGovTab('dictionary')", leaf));
                    leaf = escapeHTML(bo.name);
                }
            }
            govCrumbElement.innerHTML =
                parts.join('<span class="sep">›</span>') + '<span class="sep">›</span><span class="cur">' + leaf + '</span>';
        }
        // ---- Plein écran ----
        function v11Fs(target, title) {
            const node = typeof target === 'string' ? document.querySelector(target) : target;
            if (!node) return;
            v11FsClose();
            const ph = document.createComment('v11-fs-placeholder');
            node.parentNode.insertBefore(ph, node);
            const divElement = document.createElement('div');
            divElement.className = 'v11-fs';
            divElement.id = 'v11Fs';
            divElement.setAttribute('data-ro', 'keep');
            divElement.innerHTML = `<div class="top"><h3></h3><span class="hint">Échap pour revenir</span><span class="flex-grow"></span><button class="v11-btn" onclick="v11FsClose()">✕ Fermer</button></div>
                <div class="body"></div>`;
            divElement.querySelector('h3').textContent = title || (el('v7Title') ? el('v7Title').textContent : 'Plein écran');
            divElement.querySelector('.body').appendChild(node);
            document.body.appendChild(divElement);
            v11State.fs = {
                ph,
                node,
                sel: typeof target === 'string' ? target : node.id ? '#' + node.id : null,
                title: divElement.querySelector('h3').textContent
            };
            v11State.prevCollapsed = document.body.classList.contains('v7-collapsed');
            document.body.classList.add('v7-collapsed');
            v11FsRedraw(node);
        }
        function v11FsRedraw(node) {
            setTimeout(() => {
                try {
                    window.dispatchEvent(new Event('resize'));
                    if (node.querySelector('#lfCanvas') && typeof lfDrawGraph === 'function') lfDrawGraph();
                    if (node.querySelector('#modelGraphWrap') && typeof reflowGraph === 'function') reflowGraph('model');
                    if (node.querySelector('#catLineageWrap') && typeof _lineageRedraw === 'function') _lineageRedraw();
                    if (node.querySelector('#attrLineageBox svg') && typeof _lineageRedraw === 'function') _lineageRedraw();
                } catch (e) {}
            }, 60);
        }
        function v11FsClose() {
            const f = v11State.fs;
            if (!f) return;
            v11State.fs = null;
            const v11FsElement = el('v11Fs');
            if (f.ph && f.ph.parentNode && f.node) f.ph.parentNode.replaceChild(f.node, f.ph);
            if (v11FsElement) v11FsElement.remove();
            if (v11State.prevCollapsed === false) document.body.classList.remove('v7-collapsed');
            v11FsRedraw(f.node);
        }
        function v11FsReattach() {
            const f = v11State.fs;
            if (!f || !f.sel) return;
            const v11FsElement = el('v11Fs');
            if (!v11FsElement) return;
            const cur = document.querySelector(f.sel);
            if (!cur || v11FsElement.contains(cur)) return;
            const ph = document.createComment('v11-fs-placeholder');
            cur.parentNode.insertBefore(ph, cur);
            v11FsElement.querySelector('.body').innerHTML = '';
            v11FsElement.querySelector('.body').appendChild(cur);
            f.ph = ph;
            f.node = cur;
            v11FsRedraw(cur);
        }
        function v11FsBtn(sel, title, cls) {
            return `<button data-ro="keep" class="v11-fsbtn ${cls || ''}" onclick="v11Fs('${sel}', '${escapeHTML(String(title || '')).replace(/'/g, '&#39;')}')" title="Plein écran (Échap pour revenir)">⛶</button>`;
        }
        function v11FsButtons() {
            [
                ['#catLineageBox', 'Lineage'],
                ['#attrLineageBox', 'Lineage'],
                ['#modelGraphWrap', 'Modèle métier'],
                ['#lfWrap', 'Carte des flux'],
                ['#lineageFsWrap', 'Graphe de bout en bout'],
                ['#boDetail', 'Attributs']
            ].forEach(([sel, title]) => {
                const element = document.querySelector(sel);
                if (
                    !element ||
                    element.querySelector(':scope > .v11-fsbtn.float') ||
                    (v11State.fs && v11State.fs.node === element)
                )
                    return;
                if (getComputedStyle(element).position === 'static') element.classList.add('v11-fs-anchor');
                element.insertAdjacentHTML('afterbegin', v11FsBtn(sel, title, 'float'));
            });
        }
        // Les encarts de lineage se dessinent hors renderGovernance : on y ajoute le bouton ⛶ après coup.
        ['openBoLineage', 'openAttrLineage', 'catGoLineage', 'catShowAttrLineage'].forEach(nm =>
            Studio.extend(
                nm,
                o =>
                    function () {
                        const result = o.apply(this, arguments);
                        try {
                            v11FsButtons();
                            v11SortableTables();
                        } catch (e) {}
                        return result;
                    },
                { motif: 'bouton plein écran et tri après le dessin du lineage' }
            )
        );
        // ---- Tableaux : tri d'un clic ----
        function v11SortableTables(root) {
            (root || document).querySelectorAll('#govContent table, .v11-fiche table, #v11Fs table').forEach(tb => {
                const tbody = tb.tBodies[0];
                if (!tbody || tbody.rows.length < 2 || tb.dataset.v11sort) return;
                if (tb.querySelector('[rowspan], table')) return;
                tb.dataset.v11sort = '1';
                Array.from(tb.tHead ? tb.tHead.rows[0].cells : []).forEach((th, ci) => {
                    if (!th.textContent.trim()) return;
                    th.classList.add('v11-sort');
                    th.title = (th.title ? th.title + ' — ' : '') + 'Trier';
                    th.insertAdjacentHTML('beforeend', '<span class="ar">⇅</span>');
                    th.addEventListener('click', e => {
                        if (e.target.closest('input,select,button,a')) return;
                        v11SortTable(tb, ci, th);
                    });
                });
            });
        }
        function v11SortTable(tb, ci, th) {
            const tbody = tb.tBodies[0];
            const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
            Array.from(tb.tHead.rows[0].cells).forEach(c => {
                c.dataset.dir = '';
                const element = c.querySelector('.ar');
                if (element) element.textContent = '⇅';
            });
            th.dataset.dir = dir;
            th.querySelector('.ar').textContent = dir === 'asc' ? '▲' : '▼';
            const val = tr => {
                const element = tr.cells[ci];
                if (!element) return '';
                const inp = element.querySelector('input,select,textarea');
                const t = inp
                    ? inp.tagName === 'SELECT'
                        ? (inp.options[inp.selectedIndex] || {}).textContent
                        : inp.value
                    : element.textContent;
                return String(t || '').trim();
            };
            const num = s => {
                const number = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
                return isNaN(number) ? null : number;
            };
            const rows = Array.from(tbody.rows);
            rows.sort((a, b) => {
                const va = val(a),
                    vb = val(b);
                const na = num(va),
                    nb = num(vb);
                const r =
                    na !== null && nb !== null ? na - nb : va.localeCompare(vb, 'fr', { numeric: true, sensitivity: 'base' });
                return dir === 'asc' ? r : -r;
            });
            rows.forEach(r => tbody.appendChild(r));
        }
        // ---- Vocabulaire unifié + valeurs vides + infobulles ----
        const V11_WORDS = {
            'Propriétaire global': 'Propriétaire',
            'Propriétaire métier (Owner)': 'Propriétaire',
            'Thème': 'Domaine métier',
            'Système source': 'Application source',
            'Responsable applicatif': 'Propriétaire',
            'Responsable du processus': 'Propriétaire',
            'Référent (Data Steward)': 'Référent'
        };
        const V11_LEXIQUE = {
            'facette':
                "Sous-ensemble d'attributs d'un objet qui varie selon un contexte (ex. Client particulier / Client entreprise).",
            'source maître': "Table technique qui fait référence pour un objet : c'est elle qui a raison en cas d'écart.",
            'lineage': 'Chemin de la donnée : quelle application la produit, dans quel objet elle vit, qui la consomme.',
            'sensibilité': "Niveau de protection d'une donnée : public, interne, personnel (RGPD) ou sensible.",
            'attribut':
                "Information élémentaire d'un objet métier (ex. le numéro de client), alimentée par une ou plusieurs colonnes.",
            'contributeur': 'Personne qui propose des modifications ; le propriétaire du domaine les valide.',
            'domaine métier': 'Périmètre de responsabilité (Finance, RH…) qui détermine qui valide.',
            'terme': 'Mot du glossaire, posé comme une étiquette sur des attributs, objets, applications ou processus.',
            'proposition': "Modification en attente de validation par un propriétaire ; rien n'est écrasé avant."
        };
        function v11Wording(root) {
            root = root || el('govContent');
            if (!root) return;
            const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const todo = [];
            while (w.nextNode()) {
                const n = w.currentNode;
                const t = n.nodeValue.trim();
                if (V11_WORDS[t]) todo.push([n, n.nodeValue.replace(t, V11_WORDS[t])]);
            }
            todo.forEach(([n, v]) => {
                n.nodeValue = v;
            });
            root.querySelectorAll('input[placeholder]').forEach(i => {
                const p = i.getAttribute('placeholder');
                if (V11_WORDS[p]) i.setAttribute('placeholder', V11_WORDS[p]);
            });
            root.querySelectorAll('h3, label, th, .bo-dhead h3, .v11-sec > .t, .text-\\[10px\\]').forEach(h => {
                if (h.title || h.querySelector('input,select')) return;
                const t = h.textContent.toLowerCase();
                for (const k of Object.keys(V11_LEXIQUE)) {
                    if (t.includes(k)) {
                        h.title = k.charAt(0).toUpperCase() + k.slice(1) + ' : ' + V11_LEXIQUE[k];
                        break;
                    }
                }
            });
        }
        // ---- Menu replié quand une fiche est ouverte ----
        function v11AutoCollapse() {
            if (!v11Prefs.autoCollapse || v11Prefs.present) return;
            const fiche =
                currentTab === 9 &&
                ((govState.tab === 'objects' && govState.selectedBoId && v11Editing('bo:' + govState.selectedBoId)) ||
                    (govState.tab === 'dictionary' &&
                        govState.dictMode === 'table' &&
                        govState.dictTable &&
                        v11Editing('table:' + govState.dictTable)) ||
                    !!v11State.fs);
            if (fiche && !document.body.classList.contains('v7-collapsed')) {
                v11State.prevCollapsed = false;
                document.body.classList.add('v7-collapsed');
            } else if (!fiche && v11State.prevCollapsed === false && !v11State.fs) {
                v11State.prevCollapsed = null;
                document.body.classList.remove('v7-collapsed');
            }
        }
        function v11SetEditing(key, on) {
            v11State.edit[key] = !!on;
            if (on && v11Prefs.autoCollapse) {
                v11State.prevCollapsed = document.body.classList.contains('v7-collapsed') ? null : false;
            }
            renderGovernance();
        }
        // Le bloc « Initialiser un objet métier depuis une source » est replié derrière une ligne :
        // l'assistant (＋ Objet) est la voie normale, les autres façons restent à un clic.
        function v11CompactInit() {
            if (govState.tab !== 'objects') return;
            const govContentElement = el('govContent');
            if (!govContentElement) return;
            const lab = Array.from(govContentElement.querySelectorAll('*')).find(
                n => n.childElementCount === 0 && /^Initialiser un objet métier depuis une source/.test(n.textContent.trim())
            );
            const block = lab ? lab.closest('.rounded-xl, .rounded-lg, .border') : null;
            if (!block || block.dataset.v11init) return;
            block.dataset.v11init = '1';
            if (!v11State.initOpen) block.style.display = 'none';
            block.insertAdjacentHTML(
                'beforebegin',
                `<div class="flex items-center gap-2 flex-wrap mb-3"><button class="v11-btn pri" onclick="v11WizardOpen()">＋ Nouvel objet métier</button><button class="v11-btn sm" onclick="v11State.initOpen=!v11State.initOpen; renderGovernance()">${v11State.initOpen ? '▾ Masquer' : '▸ Autres façons de créer un objet'}</button><span class="text-[11px] text-slate-500">depuis une source, depuis le modèle de données, objet vierge</span></div>`
            );
        }
        // Mode « concentration » : pendant la modification d'un objet, seuls le formulaire et sa barre restent.
        function v11FocusMode() {
            if (govState.tab !== 'objects' || !govState.selectedBoId) return;
            const govContentElement = el('govContent');
            if (!govContentElement) return;
            const editing = v11Editing('bo:' + govState.selectedBoId);
            const list = el('boListCol');
            if (list) list.style.display = editing ? 'none' : '';
            Array.from(govContentElement.children).forEach(n => {
                if (
                    n.querySelector &&
                    (n.querySelector('[data-v11init]') ||
                        /Attributs présents dans plusieurs sources|Nouvel objet métier/.test(n.textContent.slice(0, 200))) &&
                    !n.contains(list)
                )
                    n.style.display = editing ? 'none' : '';
            });
            // liste des objets : filtre dès qu'ils sont nombreux
            if (
                list &&
                !editing &&
                (state.governance.businessObjects || []).length > 8 &&
                !list.previousElementSibling?.classList?.contains('v11-attrfilter')
            ) {
                list.insertAdjacentHTML(
                    'beforebegin',
                    `<div class="v11-attrfilter" data-ro="keep"><input type="text" value="${escapeHTML(v11State.boQ2 || '')}" placeholder="Filtrer les objets…" class="border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white w-56" oninput="v11State.boQ2=this.value; v11BoListFilter(this.value)"></div>`
                );
                v11BoListFilter(v11State.boQ2);
            }
        }
        function v11BoListFilter(q) {
            q = catNorm(q || '');
            const list = el('boListCol');
            if (!list) return;
            Array.from(list.children).forEach(card => {
                card.style.display = !q || catNorm(card.textContent).includes(q) ? '' : 'none';
            });
        }
        // Récemment consultés (mémorisés dans les préférences)
        function v11Recent(kind, id, name) {
            const r = (v11Prefs.recent = v11Prefs.recent || []).filter(x => !(x.kind === kind && x.id === id));
            r.unshift({ kind, id, name, at: Date.now() });
            v11Prefs.recent = r.slice(0, 8);
            v11SavePrefs();
        }
        function v11RecentGo(kind, id) {
            if (kind === 'bo') v11GoBo(id);
            else if (kind === 'term') termTagOpen(id);
            else if (kind === 'asset') v11GoAsset(id);
            else if (kind === 'table') v11GoTable(id);
        }
        function v11RecentList() {
            const governance = state.governance;
            return (v11Prefs.recent || []).filter(
                x =>
                    (x.kind === 'bo' && (governance.businessObjects || []).some(b => b.id === x.id)) ||
                    (x.kind === 'term' && (governance.glossary || []).some(t => t.id === x.id)) ||
                    (x.kind === 'asset' && (governance.assets || []).some(a => a.id === x.id)) ||
                    (x.kind === 'table' && !!tableByName(x.id))
            );
        }
        // ---- Après chaque rendu de la gouvernance ----
        Studio.extend(
            'renderGovernance',
            base =>
                function () {
                    const home = govState.tab === 'home';
                    base.apply(this, arguments);
                    const govContentElement = el('govContent');
                    if (home && govContentElement && typeof v11HomeHtml === 'function') {
                        govContentElement.innerHTML = v11HomeHtml();
                    }
                    const acts = el('govActions');
                    if (acts && !acts.querySelector('.v11-acts'))
                        acts.insertAdjacentHTML(
                            'afterbegin',
                            `<span class="v11-acts inline-flex items-center gap-1.5 mr-2" data-ro="keep"><button class="v11-btn sm" onclick="v11WizardOpen()" title="Créer un objet métier en trois étapes">＋ Objet</button><button class="v11-btn sm" onclick="v11PaletteOpen()" title="Rechercher (Ctrl+K)">🔍</button></span>`
                        );
                    try {
                        if (typeof v11ApplyReadMode === 'function') v11ApplyReadMode();
                    } catch (e) {
                        console.error(e);
                    }
                    try {
                        v11CompactInit();
                        v11FocusMode();
                        v11Crumb();
                        v11FsButtons();
                        v11SortableTables();
                        v11Wording();
                        v11HistPush();
                        v11RememberScreen();
                        v11AutoCollapse();
                        v11FsReattach();
                        if (typeof v11DragInit === 'function') v11DragInit();
                    } catch (e) {
                        console.error(e);
                    }
                }
        );
        // ---- Raccourcis clavier + aide ----
        const V11_SHORTCUTS = [
            ['Ctrl K', 'Rechercher partout'],
            ['?', 'Aide, raccourcis, préférences'],
            ['Échap', 'Fermer (plein écran, palette, tiroir, aide)'],
            ['Alt ←  /  Alt →', 'Écran précédent / suivant'],
            ['Ctrl Z', 'Annuler la dernière modification'],
            ['F', 'Plein écran de la fiche courante'],
            ['E', 'Modifier / terminer la fiche courante'],
            ['G puis O / C / D / T / A / V', 'Aller aux Objets / Catalogue / Dictionnaire / Termes / Applications / À valider'],
            [
                'G puis I / S / M / X / Q / R / B',
                "Aller à l'Accueil / Sources / Modèle / Extraire / Qualité / Règles / Tableaux de bord"
            ],
            ['N', 'Nouvel objet (assistant)'],
            ['Maj P', 'Mode présentation']
        ];
        let _v11G = 0;
        document.addEventListener(
            'keydown',
            e => {
                const tgt = e.target;
                const typing =
                    tgt &&
                    (tgt.tagName === 'INPUT' ||
                        tgt.tagName === 'TEXTAREA' ||
                        tgt.tagName === 'SELECT' ||
                        tgt.isContentEditable);
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    v11PaletteOpen();
                    return;
                }
                if (e.key === 'Escape') {
                    if (el('v11Pal')) return v11PaletteClose();
                    if (el('v11Help')) return v11HelpClose();
                    if (el('v11Modal')) return v11ModalClose();
                    if (v11State.tour) return v11TourEnd();
                    if (v11State.fs) return v11FsClose();
                    if (v11Prefs.present) return v11Present(false);
                    return;
                }
                if (typing) return;
                if (e.altKey && e.key === 'ArrowLeft') {
                    e.preventDefault();
                    return v11Back();
                }
                if (e.altKey && e.key === 'ArrowRight') {
                    e.preventDefault();
                    return v11Fwd();
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    return v11Undo();
                }
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.key === '?') {
                    e.preventDefault();
                    return el('v11Help') ? v11HelpClose() : v11HelpOpen();
                }
                const k = e.key.toLowerCase();
                if (_v11G && Date.now() - _v11G < 1500) {
                    _v11G = 0;
                    const map = {
                        o: 'objects',
                        c: 'catalog',
                        d: 'dictionary',
                        t: 'glossary',
                        a: 'assets',
                        v: 'review',
                        h: 'home',
                        l: 'flow',
                        s: 1,
                        x: 3,
                        q: 8,
                        m: 2,
                        b: 14,
                        r: 12,
                        i: 11
                    };
                    if (map[k] !== undefined) {
                        e.preventDefault();
                        if (typeof map[k] === 'number') switchTab(map[k]);
                        else openGovTab(map[k]);
                    }
                    return;
                }
                if (k === 'g') {
                    _v11G = Date.now();
                    return;
                }
                if (currentTab !== 9) return;
                if (k === 'f') {
                    const element = document.querySelector('.v11-fiche') || document.querySelector('#boDetail');
                    if (element) {
                        e.preventDefault();
                        v11Fs(element.id ? '#' + element.id : element, element.dataset.title || '');
                    }
                } else if (
                    k === 'e' &&
                    govState.tab === 'objects' &&
                    govState.selectedBoId &&
                    typeof v11ToggleEdit === 'function'
                ) {
                    e.preventDefault();
                    v11ToggleEdit('bo', govState.selectedBoId);
                } else if (k === 'n' && typeof v11WizardOpen === 'function') {
                    e.preventDefault();
                    v11WizardOpen();
                } else if (k === 'p' && e.shiftKey) {
                    e.preventDefault();
                    v11Present(!v11Prefs.present);
                }
            },
            true
        );
        function v11HelpOpen() {
            v11HelpClose();
            const divElement = document.createElement('div');
            divElement.className = 'v11-help';
            divElement.id = 'v11Help';
            divElement.setAttribute('data-ro', 'keep');
            divElement.innerHTML = `<div class="box">
                <div class="flex items-start gap-3"><div><h3>Aide</h3><div class="text-xs text-slate-500">Studio Data ${escapeHTML(APP_VERSION)} · tout se passe sur votre poste, rien n'est envoyé.</div>
                    </div>
                    <span class="flex-grow"></span><button class="v11-btn" onclick="v11TourStart()">▶ Revoir la visite guidée</button><button class="v11-btn" onclick="v11HelpClose()">✕</button></div>
                <h4>Raccourcis clavier</h4>
                    <div class="sc">${V11_SHORTCUTS.map(([k, l]) => `<div><span>${escapeHTML(l)}</span><span class="v11-kbd">${escapeHTML(k)}</span></div>`).join('')}</div>
                <h4>Préférences</h4>
                <label class="pref"><input type="checkbox" ${v11Prefs.density === 'compact' ? 'checked' : ''} onchange="v11SetPref('density', this.checked ? 'compact' : 'comfy')"> Affichage compact des tableaux et formulaires</label>
                <label class="pref"><input type="checkbox" ${v11Prefs.autoCollapse ? 'checked' : ''} onchange="v11SetPref('autoCollapse', this.checked)"> Replier le menu quand une fiche est en modification ou en plein écran</label>
                <label class="pref"><input type="checkbox" ${v11Prefs.readDefault ? 'checked' : ''} onchange="v11SetPref('readDefault', this.checked)"> Ouvrir les fiches en mode lecture (sinon directement en modification)</label>
                <label class="pref"><input type="checkbox" ${v11Prefs.present ? 'checked' : ''} onchange="v11Present(this.checked)"> Mode présentation (grandes polices, menu masqué, lecture seule)</label>
                <h4>Lexique</h4>
                    <div class="lex">${Object.entries(V11_LEXIQUE)
                        .map(
                            ([k, v]) =>
                                `<div><b>${escapeHTML(k.charAt(0).toUpperCase() + k.slice(1))}</b> — ${escapeHTML(v)}</div>`
                        )
                        .join('')}</div>
            </div>`;
            divElement.addEventListener('click', e => {
                if (e.target === divElement) v11HelpClose();
            });
            document.body.appendChild(divElement);
        }
        function v11HelpClose() {
            const v11HelpElement = el('v11Help');
            if (v11HelpElement) v11HelpElement.remove();
        }
        function v11ModalOpen(html) {
            v11ModalClose();
            const divElement = document.createElement('div');
            divElement.className = 'v11-modal';
            divElement.id = 'v11Modal';
            divElement.setAttribute('data-ro', 'keep');
            divElement.innerHTML = '<div class="box">' + html + '</div>';
            divElement.addEventListener('click', e => {
                if (e.target === divElement) v11ModalClose();
            });
            document.body.appendChild(divElement);
            const f = divElement.querySelector('input[type=text],select,textarea');
            if (f)
                setTimeout(() => {
                    try {
                        f.focus();
                    } catch (e) {}
                }, 30);
            return divElement;
        }
        function v11ModalClose() {
            const v11ModalElement = el('v11Modal');
            if (v11ModalElement) v11ModalElement.remove();
        }
        // Après la restauration de session, l'état restauré devient le point de départ de l'annulation.
        Studio.extend(
            'restoreSession',
            base =>
                async function () {
                    try {
                        return await base.apply(this, arguments);
                    } finally {
                        v11State.undo = [];
                        v11State.lastGov = v11GovJson();
                        v11SaveIndicator('ok');
                        if (currentTab === 9) renderGovernance();
                    }
                }
        );
        // ---- Démarrage ----
        (function () {
            v11LoadPrefs();
            v11RestoreScreen();
            v11ApplyPrefs();
            v11State.lastGov = v11GovJson();
            const boot = () => {
                v11MountTopbar();
                if (el('v7Nav')) renderNav();
                setTimeout(() => {
                    v11State.lastGov = v11GovJson();
                    if (!v11Prefs.tourDone && typeof v11TourStart === 'function') v11TourStart(true);
                }, 1200);
            };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
            else boot();
        })();
