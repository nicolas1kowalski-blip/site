        // ======================= V11 : NOYAU ERGONOMIQUE =======================
        // Cette couche ne réécrit pas les écrans V7 : elle s'y greffe (enveloppes de fonctions,
        // retouches après rendu) pour rendre l'application plus simple à lire et à utiliser.
        //   • préférences mémorisées, densité, présentation, notifications unifiées
        //   • enregistrement visible + annulation (Ctrl+Z), raccourcis clavier, aide « ? »
        //   • menu en trois familles, accueil, historique de navigation, fil d'Ariane cliquable
        //   • plein écran des fiches / tableaux / graphes, tri des tableaux, vocabulaire, infobulles
        const v11State = { edit: {}, fs: null, hist: { stack: [], i: -1, nav: false }, undo: [], lastGov: null, toasts: [], toastOn: null, prevCollapsed: null, tour: null };
        const V11_PREF_DEFAULT = { density: 'comfy', autoCollapse: true, readDefault: true, present: false, tourDone: false, screens: {} };
        let v11Prefs = Object.assign({}, V11_PREF_DEFAULT);
        function v11LoadPrefs() { try { const j = localStorage.getItem('sd_v11_prefs'); if (j) v11Prefs = Object.assign({}, V11_PREF_DEFAULT, JSON.parse(j)); } catch (e) {} }
        function v11SavePrefs() { try { localStorage.setItem('sd_v11_prefs', JSON.stringify(v11Prefs)); } catch (e) {} }
        function v11SetPref(k, v) { v11Prefs[k] = v; v11SavePrefs(); v11ApplyPrefs(); if (typeof renderGovernance === 'function' && currentTab === 9) renderGovernance(); }
        function v11ApplyPrefs() {
            document.body.classList.toggle('v11-compact', v11Prefs.density === 'compact');
            document.body.classList.toggle('v11-present', !!v11Prefs.present);
            let ex = el('v11PresentExit');
            if (v11Prefs.present) { if (!ex) { ex = document.createElement('button'); ex.id = 'v11PresentExit'; ex.className = 'v11-btn pri v11-present-exit'; ex.setAttribute('data-ro', 'keep'); ex.textContent = '⏏ Quitter la présentation'; ex.onclick = () => v11Present(false); document.body.appendChild(ex); } }
            else if (ex) ex.remove();
        }
        function v11Present(on) { v11Prefs.present = !!on; v11SavePrefs(); v11ApplyPrefs(); if (typeof govSetReadOnly === 'function') govSetReadOnly(!!on); if (on) document.body.classList.add('v7-collapsed'); v11Toast(on ? 'Mode présentation : polices agrandies, menu masqué, lecture seule. Échap ou ⏏ pour quitter.' : 'Fin de la présentation.', 'info'); }
        // Mémoire par écran : vue, filtres, replis — restaurée au chargement.
        const V11_SCREEN_KEYS = ['structView', 'boFilter', 'boTab', 'dictMode', 'glossView', 'usageView', 'reviewView', 'lineageView'];
        function v11RememberScreen() { const s = v11Prefs.screens || (v11Prefs.screens = {}); let ch = false; V11_SCREEN_KEYS.forEach(k => { if (govState[k] !== undefined && s[k] !== govState[k]) { s[k] = govState[k]; ch = true; } }); if (typeof catState === 'object' && catState && s.catLayer !== catState.layer) { s.catLayer = catState.layer; ch = true; } if (ch) v11SavePrefs(); }
        function v11RestoreScreen() { const s = v11Prefs.screens || {}; V11_SCREEN_KEYS.forEach(k => { if (s[k] !== undefined) govState[k] = s[k]; }); if (typeof catState === 'object' && catState && s.catLayer) catState.layer = s.catLayer; }
        // ---- Notifications : une file, une à la fois, message court ----
        function v11ToastHost() { let h = el('v11Toasts'); if (!h) { h = document.createElement('div'); h.id = 'v11Toasts'; h.className = 'v11-toasts'; document.body.appendChild(h); } return h; }
        function v11Short(msg) { const m = String(msg || '').trim(); const i = m.search(/[.!?]\s|[.!?]$/); const first = i > 0 ? m.slice(0, i + 1) : m; return first.length > 140 ? first.slice(0, 137) + '…' : first; }
        function v11Toast(msg, kind, opts) {
            kind = kind || 'ok'; opts = opts || {};
            v11State.toasts.push({ msg: String(msg || ''), kind, opts });
            if (v11State.toasts.length > 5) v11State.toasts.splice(0, v11State.toasts.length - 5);
            v11ToastNext();
        }
        function v11ToastNext() {
            if (v11State.toastOn || !v11State.toasts.length) return;
            const t = v11State.toasts.shift(); const host = v11ToastHost();
            const short = v11Short(t.msg); const hasMore = short !== t.msg;
            const d = document.createElement('div'); d.className = 'v11-toast ' + t.kind; d.setAttribute('role', 'status');
            d.innerHTML = `<span>${t.kind === 'ok' ? '✓' : (t.kind === 'err' ? '⚠' : 'ℹ')}</span><span class="m"></span>${hasMore ? '<span class="more">détail ›</span>' : ''}${t.opts.action ? `<button class="act" data-ro="keep">${escapeHTML(t.opts.actionLabel || 'Annuler')}</button>` : ''}<span class="x" title="Fermer">×</span>`;
            d.querySelector('.m').textContent = short;
            let expanded = false;
            d.onclick = e => { if (e.target.classList.contains('x')) return v11ToastClose(d); if (e.target.classList.contains('act')) { try { t.opts.action(); } catch (er) {} return v11ToastClose(d); } if (hasMore && !expanded) { expanded = true; d.querySelector('.m').textContent = t.msg; d.querySelector('.more').remove(); clearTimeout(d._tm); d._tm = setTimeout(() => v11ToastClose(d), 9000); } };
            host.appendChild(d); v11State.toastOn = d;
            d._tm = setTimeout(() => v11ToastClose(d), t.kind === 'err' ? 7000 : (t.opts.action ? 6000 : 3500));
        }
        function v11ToastClose(d) { if (!d || !d.parentNode) return; clearTimeout(d._tm); d.remove(); if (v11State.toastOn === d) v11State.toastOn = null; v11ToastNext(); }
        const _v11_showSuccess = showSuccess, _v11_showError = showError;
        showSuccess = function (msg) { v11Toast(msg, 'ok'); };
        showError = function (msg) { const t2 = el('globalErrorText'); if (t2) t2.textContent = msg; v11Toast(msg, 'err'); };
        // ---- Enregistrement visible + annulation de la dernière modification ----
        function v11GovJson() { try { return JSON.stringify({ g: state.governance, th: Object.fromEntries(Object.values(state.tables).map(t => [t.id, t.theme || ''])) }); } catch (e) { return null; } }
        const _v11_persistAppState = persistAppState;
        persistAppState = function () {
            const cur = v11GovJson();
            if (cur && v11State.lastGov && cur !== v11State.lastGov && !v11State.undoing) { v11State.undo.push(v11State.lastGov); if (v11State.undo.length > 30) v11State.undo.shift(); }
            if (cur) v11State.lastGov = cur;
            v11SaveIndicator('busy');
            const r = _v11_persistAppState.apply(this, arguments);
            setTimeout(() => v11SaveIndicator('ok'), 600);
            return r;
        };
        function v11Undo() {
            const j = v11State.undo.pop(); if (!j) return v11Toast('Rien à annuler.', 'info');
            let snap; try { snap = JSON.parse(j); } catch (e) { return; }
            v11State.undoing = true;
            try { state.governance = snap.g; Object.values(state.tables).forEach(t => { if (snap.th && snap.th[t.id] !== undefined) t.theme = snap.th[t.id]; }); v11State.lastGov = v11GovJson(); persistAppState(); }
            finally { v11State.undoing = false; }
            if (currentTab === 9) { renderGovernance(); renderNav(); }
            v11Toast('Dernière modification annulée.', 'info');
        }
        function v11SaveIndicator(st) {
            let s = el('v11Save'); if (!s) return;
            s.classList.toggle('busy', st === 'busy');
            const when = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            s.title = st === 'busy' ? 'Enregistrement en cours' : 'Enregistré à ' + when + ' sur votre poste'; s.innerHTML = `<span class="dot"></span>${st === 'busy' ? '…' : when}${v11State.undo.length ? '<button data-ro="keep" onclick="v11Undo()" title="Annuler la dernière modification (Ctrl+Z)">⟲ Annuler</button>' : ''}`;
        }
        // ---- Barre du haut : enregistré, précédent / suivant, recherche, aide ----
        function v11MountTopbar() {
            const host = document.querySelector('.v7-top .ml-auto'); if (!host || el('v11Save')) return;
            const wrap = document.createElement('div'); wrap.className = 'flex items-center gap-2'; wrap.setAttribute('data-ro', 'keep');
            wrap.innerHTML = `<span id="v11Save" class="v11-save" title="Enregistré sur votre poste"><span class="dot"></span>✓</span>
                <span class="v11-hist" id="v11Hist"><button onclick="v11Back()" title="Précédent (Alt+←)">◀</button><button onclick="v11Fwd()" title="Suivant (Alt+→)">▶</button></span>
                <button class="v11-topbtn" onclick="v11PaletteOpen()" title="Rechercher partout (Ctrl+K)"><span>🔍</span><kbd>Ctrl K</kbd></button>
                <button class="v11-topbtn" onclick="v11HelpOpen()" title="Aide, raccourcis, préférences (?)">?</button>`;
            host.insertBefore(wrap, host.firstChild);
            v11HistButtons();
        }
        // ---- Menu : trois familles + accueil ----
        const V11_FAMS = { home: 'Explorer', catalog: 'Explorer', model: 'Explorer', flow: 'Explorer', lineage: 'Explorer', objects: 'Décrire', dictionary: 'Décrire', glossary: 'Décrire', assets: 'Décrire', vlists: 'Décrire', perimeters: 'Décrire', privacy: 'Décrire', people: 'Piloter', review: 'Piloter', history: 'Piloter', srcwatch: 'Piloter' };
        const V11_ORDER = ['home', 'catalog', 'model', 'flow', 'lineage', 'objects', 'dictionary', 'glossary', 'assets', 'vlists', 'perimeters', 'privacy', 'review', 'people', 'history', 'srcwatch'];
        (function () {
            const gov = NAV_PHASES.find(p => p.id === 'gov'); if (!gov) return;
            if (!gov.tabs.some(t => t.g === 'home')) gov.tabs.unshift({ g: 'home', icon: '🏠', label: 'Accueil', fam: 'Explorer' });
            gov.tabs.forEach(t => { if (V11_FAMS[t.g]) t.fam = V11_FAMS[t.g]; });
            gov.tabs.sort((a, b) => (V11_ORDER.indexOf(a.g) + 1 || 99) - (V11_ORDER.indexOf(b.g) + 1 || 99));
            if (Array.isArray(GOV_RO_TABS) && !GOV_RO_TABS.includes('home')) GOV_RO_TABS.push('home');
            if (govState.tab === 'catalog') govState.tab = 'home';
        })();
        const _v11_renderNav = renderNav;
        renderNav = function () {
            _v11_renderNav.apply(this, arguments);
            const items = document.querySelector('.v7-grp[data-phase="gov"] .v7-items'); if (!items) return;
            let last = null;
            Array.from(items.querySelectorAll('button.v7-it')).forEach(b => {
                const m = (b.getAttribute('onclick') || '').match(/openGovTab\('([^']+)'\)/); const fam = m ? V11_FAMS[m[1]] : null;
                if (fam && fam !== last) { const h = document.createElement('div'); h.className = 'v11-fam'; h.textContent = fam; items.insertBefore(h, b); last = fam; }
            });
        };
        // ---- Historique de navigation (Précédent / Suivant) ----
        function v11NavKey() { return JSON.stringify({ tab: govState.tab, bo: govState.selectedBoId, sel: govState.boSel, boTab: govState.boTab, dm: govState.dictMode, dt: govState.dictTable, db: govState.dictBoId, gf: govState.glossFocus, gv: govState.glossView }); }
        function v11HistPush() {
            if (v11State.hist.nav) return; const k = v11NavKey(); const h = v11State.hist;
            if (h.stack[h.i] === k) return;
            h.stack = h.stack.slice(0, h.i + 1); h.stack.push(k); if (h.stack.length > 60) h.stack.shift(); h.i = h.stack.length - 1; v11HistButtons();
        }
        function v11HistGo(d) {
            const h = v11State.hist; const j = h.i + d; if (j < 0 || j >= h.stack.length) return;
            h.i = j; let s; try { s = JSON.parse(h.stack[j]); } catch (e) { return; }
            h.nav = true;
            try { govState.selectedBoId = s.bo; govState.boSel = s.sel; govState.boTab = s.boTab; govState.dictMode = s.dm; govState.dictTable = s.dt; govState.dictBoId = s.db; govState.glossFocus = s.gf; govState.glossView = s.gv; openGovTab(s.tab || 'home'); }
            finally { h.nav = false; }
            v11HistButtons();
        }
        function v11Back() { v11HistGo(-1); }
        function v11Fwd() { v11HistGo(1); }
        function v11HistButtons() { const w = el('v11Hist'); if (!w) return; const [b, f] = w.querySelectorAll('button'); b.disabled = v11State.hist.i <= 0; f.disabled = v11State.hist.i >= v11State.hist.stack.length - 1; }
        // ---- Fil d'Ariane cliquable ----
        function v11Crumb() {
            const c = el('govCrumb'); if (!c) return;
            const gov = NAV_PHASES.find(p => p.id === 'gov'); const t = gov.tabs.find(x => x.g === govState.tab) || {};
            const fam = t.fam || 'Gouvernance'; const first = (gov.tabs.find(x => x.fam === fam) || {}).g || 'home';
            const parts = [`<a onclick="openGovTab('home')">${govIsReadOnly() ? '👁 Consultation' : 'Gouvernance'}</a>`, `<a onclick="openGovTab('${first}')">${escapeHTML(fam)}</a>`];
            let leaf = escapeHTML(t.label || '');
            if (govState.tab === 'objects' && govState.selectedBoId) {
                const bo = (state.governance.businessObjects || []).find(b => b.id === govState.selectedBoId);
                if (bo) {
                    parts.push(`<a onclick="openGovTab('objects')">${leaf}</a>`);
                    const sel = govState.boSel; const r = sel && sel.kind === 'attr' ? (boAllAttrRows(bo) || []).find(x => x.el.id === sel.elId) : null;
                    if (r && govState.boTab === 'structure') { parts.push(`<a onclick="govState.boSel=null; renderGovernance()">${escapeHTML(bo.name)}</a>`); leaf = escapeHTML(r.el.name); }
                    else leaf = escapeHTML(bo.name);
                }
            } else if (govState.tab === 'dictionary' && govState.dictMode === 'table' && govState.dictTable) { parts.push(`<a onclick="openGovTab('dictionary')">${leaf}</a>`); leaf = escapeHTML(govState.dictTable); }
            else if (govState.tab === 'dictionary' && govState.dictMode === 'bo' && govState.dictBoId) { const bo = (state.governance.businessObjects || []).find(b => b.id === govState.dictBoId); if (bo) { parts.push(`<a onclick="openGovTab('dictionary')">${leaf}</a>`); leaf = escapeHTML(bo.name); } }
            c.innerHTML = parts.join('<span class="sep">›</span>') + '<span class="sep">›</span><span class="cur">' + leaf + '</span>';
        }
        // ---- Plein écran ----
        function v11Fs(target, title) {
            const node = typeof target === 'string' ? document.querySelector(target) : target; if (!node) return;
            v11FsClose();
            const ph = document.createComment('v11-fs-placeholder'); node.parentNode.insertBefore(ph, node);
            const ov = document.createElement('div'); ov.className = 'v11-fs'; ov.id = 'v11Fs'; ov.setAttribute('data-ro', 'keep');
            ov.innerHTML = `<div class="top"><h3></h3><span class="hint">Échap pour revenir</span><span class="flex-grow"></span><button class="v11-btn" onclick="v11FsClose()">✕ Fermer</button></div><div class="body"></div>`;
            ov.querySelector('h3').textContent = title || (el('v7Title') ? el('v7Title').textContent : 'Plein écran');
            ov.querySelector('.body').appendChild(node); document.body.appendChild(ov);
            v11State.fs = { ph, node, sel: typeof target === 'string' ? target : (node.id ? '#' + node.id : null), title: ov.querySelector('h3').textContent };
            v11State.prevCollapsed = document.body.classList.contains('v7-collapsed'); document.body.classList.add('v7-collapsed');
            v11FsRedraw(node);
        }
        function v11FsRedraw(node) { setTimeout(() => { try { window.dispatchEvent(new Event('resize')); if (node.querySelector('#lfCanvas') && typeof lfDrawGraph === 'function') lfDrawGraph(); if (node.querySelector('#modelGraphWrap') && typeof reflowGraph === 'function') reflowGraph('model'); if (node.querySelector('#catLineageWrap') && typeof _lineageRedraw === 'function') _lineageRedraw(); if (node.querySelector('#attrLineageBox svg') && typeof _lineageRedraw === 'function') _lineageRedraw(); } catch (e) {} }, 60); }
        function v11FsClose() {
            const f = v11State.fs; if (!f) return; v11State.fs = null;
            const ov = el('v11Fs'); if (f.ph && f.ph.parentNode && f.node) f.ph.parentNode.replaceChild(f.node, f.ph); if (ov) ov.remove();
            if (v11State.prevCollapsed === false) document.body.classList.remove('v7-collapsed');
            v11FsRedraw(f.node);
        }
        function v11FsReattach() {
            const f = v11State.fs; if (!f || !f.sel) return; const ov = el('v11Fs'); if (!ov) return;
            const cur = document.querySelector(f.sel); if (!cur || ov.contains(cur)) return;
            const ph = document.createComment('v11-fs-placeholder'); cur.parentNode.insertBefore(ph, cur); ov.querySelector('.body').innerHTML = ''; ov.querySelector('.body').appendChild(cur);
            f.ph = ph; f.node = cur; v11FsRedraw(cur);
        }
        function v11FsBtn(sel, title, cls) { return `<button data-ro="keep" class="v11-fsbtn ${cls || ''}" onclick="v11Fs('${sel}', '${escapeHTML(String(title || '')).replace(/'/g, '&#39;')}')" title="Plein écran (Échap pour revenir)">⛶</button>`; }
        function v11FsButtons() {
            [['#catLineageBox', 'Lineage'], ['#attrLineageBox', 'Lineage'], ['#modelGraphWrap', 'Modèle métier'], ['#lfWrap', 'Carte des flux'], ['#lineageFsWrap', 'Graphe de bout en bout'], ['#boDetail', 'Attributs']].forEach(([sel, title]) => {
                const n = document.querySelector(sel); if (!n || n.querySelector(':scope > .v11-fsbtn.float') || (v11State.fs && v11State.fs.node === n)) return;
                if (getComputedStyle(n).position === 'static') n.classList.add('v11-fs-anchor');
                n.insertAdjacentHTML('afterbegin', v11FsBtn(sel, title, 'float'));
            });
        }
        // Les encarts de lineage se dessinent hors renderGovernance : on y ajoute le bouton ⛶ après coup.
        ['openBoLineage', 'openAttrLineage', 'catGoLineage', 'catShowAttrLineage'].forEach(nm => { const o = window[nm]; if (typeof o !== 'function') return; window[nm] = function () { const r = o.apply(this, arguments); try { v11FsButtons(); v11SortableTables(); } catch (e) {} return r; }; });
        // ---- Tableaux : tri d'un clic ----
        function v11SortableTables(root) {
            (root || document).querySelectorAll('#govContent table, .v11-fiche table, #v11Fs table').forEach(tb => {
                const tbody = tb.tBodies[0]; if (!tbody || tbody.rows.length < 2 || tb.dataset.v11sort) return;
                if (tb.querySelector('[rowspan], table')) return;
                tb.dataset.v11sort = '1';
                Array.from(tb.tHead ? tb.tHead.rows[0].cells : []).forEach((th, ci) => {
                    if (!th.textContent.trim()) return;
                    th.classList.add('v11-sort'); th.title = (th.title ? th.title + ' — ' : '') + 'Trier'; th.insertAdjacentHTML('beforeend', '<span class="ar">⇅</span>');
                    th.addEventListener('click', e => { if (e.target.closest('input,select,button,a')) return; v11SortTable(tb, ci, th); });
                });
            });
        }
        function v11SortTable(tb, ci, th) {
            const tbody = tb.tBodies[0]; const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
            Array.from(tb.tHead.rows[0].cells).forEach(c => { c.dataset.dir = ''; const a = c.querySelector('.ar'); if (a) a.textContent = '⇅'; });
            th.dataset.dir = dir; th.querySelector('.ar').textContent = dir === 'asc' ? '▲' : '▼';
            const val = tr => { const c = tr.cells[ci]; if (!c) return ''; const inp = c.querySelector('input,select,textarea'); const t = inp ? (inp.tagName === 'SELECT' ? (inp.options[inp.selectedIndex] || {}).textContent : inp.value) : c.textContent; return String(t || '').trim(); };
            const num = s => { const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? null : n; };
            const rows = Array.from(tbody.rows);
            rows.sort((a, b) => { const va = val(a), vb = val(b); const na = num(va), nb = num(vb); let r = (na !== null && nb !== null) ? na - nb : va.localeCompare(vb, 'fr', { numeric: true, sensitivity: 'base' }); return dir === 'asc' ? r : -r; });
            rows.forEach(r => tbody.appendChild(r));
        }
        // ---- Vocabulaire unifié + valeurs vides + infobulles ----
        const V11_WORDS = { 'Propriétaire global': 'Propriétaire', 'Propriétaire métier (Owner)': 'Propriétaire', 'Thème': 'Domaine métier', 'Système source': 'Application source', 'Responsable applicatif': 'Propriétaire', 'Responsable du processus': 'Propriétaire', 'Référent (Data Steward)': 'Référent' };
        const V11_LEXIQUE = { 'facette': 'Sous-ensemble d\'attributs d\'un objet qui varie selon un contexte (ex. Client particulier / Client entreprise).', 'source maître': 'Table technique qui fait référence pour un objet : c\'est elle qui a raison en cas d\'écart.', 'lineage': 'Chemin de la donnée : quelle application la produit, dans quel objet elle vit, qui la consomme.', 'sensibilité': 'Niveau de protection d\'une donnée : public, interne, personnel (RGPD) ou sensible.', 'attribut': 'Information élémentaire d\'un objet métier (ex. le numéro de client), alimentée par une ou plusieurs colonnes.', 'contributeur': 'Personne qui propose des modifications ; le propriétaire du domaine les valide.', 'domaine métier': 'Périmètre de responsabilité (Finance, RH…) qui détermine qui valide.', 'terme': 'Mot du glossaire, posé comme une étiquette sur des attributs, objets, applications ou processus.', 'proposition': 'Modification en attente de validation par un propriétaire ; rien n\'est écrasé avant.' };
        function v11Wording(root) {
            root = root || el('govContent'); if (!root) return;
            const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const todo = [];
            while (w.nextNode()) { const n = w.currentNode; const t = n.nodeValue.trim(); if (V11_WORDS[t]) todo.push([n, n.nodeValue.replace(t, V11_WORDS[t])]); }
            todo.forEach(([n, v]) => { n.nodeValue = v; });
            root.querySelectorAll('input[placeholder]').forEach(i => { const p = i.getAttribute('placeholder'); if (V11_WORDS[p]) i.setAttribute('placeholder', V11_WORDS[p]); });
            root.querySelectorAll('h3, label, th, .bo-dhead h3, .v11-sec > .t, .text-\\[10px\\]').forEach(h => {
                if (h.title || h.querySelector('input,select')) return; const t = h.textContent.toLowerCase();
                for (const k of Object.keys(V11_LEXIQUE)) { if (t.includes(k)) { h.title = k.charAt(0).toUpperCase() + k.slice(1) + ' : ' + V11_LEXIQUE[k]; break; } }
            });
        }
        // ---- Menu replié quand une fiche est ouverte ----
        function v11AutoCollapse() {
            if (!v11Prefs.autoCollapse || v11Prefs.present) return;
            const fiche = currentTab === 9 && ((govState.tab === 'objects' && govState.selectedBoId && v11Editing('bo:' + govState.selectedBoId)) || (govState.tab === 'dictionary' && govState.dictMode === 'table') || !!v11State.fs);
            if (fiche && !document.body.classList.contains('v7-collapsed')) { v11State.prevCollapsed = false; document.body.classList.add('v7-collapsed'); }
            else if (!fiche && v11State.prevCollapsed === false && !v11State.fs) { v11State.prevCollapsed = null; document.body.classList.remove('v7-collapsed'); }
        }
        function v11Editing(key) { return !!v11State.edit[key]; }
        function v11SetEditing(key, on) { v11State.edit[key] = !!on; if (on && v11Prefs.autoCollapse) { v11State.prevCollapsed = document.body.classList.contains('v7-collapsed') ? null : false; } renderGovernance(); }
        // Le bloc « Initialiser un objet métier depuis une source » est replié derrière une ligne :
        // l'assistant (＋ Objet) est la voie normale, les autres façons restent à un clic.
        function v11CompactInit() {
            if (govState.tab !== 'objects') return; const c = el('govContent'); if (!c) return;
            const lab = Array.from(c.querySelectorAll('*')).find(n => n.childElementCount === 0 && /^Initialiser un objet métier depuis une source/.test(n.textContent.trim()));
            const block = lab ? lab.closest('.rounded-xl, .rounded-lg, .border') : null; if (!block || block.dataset.v11init) return;
            block.dataset.v11init = '1'; if (!v11State.initOpen) block.style.display = 'none';
            block.insertAdjacentHTML('beforebegin', `<div class="flex items-center gap-2 flex-wrap mb-3" data-ro="keep"><button class="v11-btn pri" onclick="v11WizardOpen()">＋ Nouvel objet métier</button><button class="v11-btn sm" onclick="v11State.initOpen=!v11State.initOpen; renderGovernance()">${v11State.initOpen ? '▾ Masquer' : '▸ Autres façons de créer un objet'}</button><span class="text-[11px] text-slate-500">depuis une source, depuis le modèle de données, objet vierge</span></div>`);
        }
        // ---- Après chaque rendu de la gouvernance ----
        const _v11_renderGovernance = renderGovernance;
        renderGovernance = function () {
            const home = govState.tab === 'home';
            _v11_renderGovernance.apply(this, arguments);
            const c = el('govContent');
            if (home && c && typeof v11HomeHtml === 'function') { c.innerHTML = v11HomeHtml(); }
            const acts = el('govActions'); if (acts && !acts.querySelector('.v11-acts')) acts.insertAdjacentHTML('afterbegin', `<span class="v11-acts inline-flex items-center gap-1.5 mr-2" data-ro="keep"><button class="v11-btn sm" onclick="v11WizardOpen()" title="Créer un objet métier en trois étapes">＋ Objet</button><button class="v11-btn sm" onclick="v11PaletteOpen()" title="Rechercher (Ctrl+K)">🔍</button></span>`);
            try { if (typeof v11ApplyReadMode === 'function') v11ApplyReadMode(); } catch (e) { console.error(e); }
            try { v11CompactInit(); v11Crumb(); v11FsButtons(); v11SortableTables(); v11Wording(); v11HistPush(); v11RememberScreen(); v11AutoCollapse(); v11FsReattach(); if (typeof v11DragInit === 'function') v11DragInit(); } catch (e) { console.error(e); }
        };
        // ---- Raccourcis clavier + aide ----
        const V11_SHORTCUTS = [['Ctrl K', 'Rechercher partout'], ['?', 'Aide, raccourcis, préférences'], ['Échap', 'Fermer (plein écran, palette, tiroir, aide)'], ['Alt ←  /  Alt →', 'Écran précédent / suivant'], ['Ctrl Z', 'Annuler la dernière modification'], ['F', 'Plein écran de la fiche courante'], ['E', 'Modifier / terminer la fiche courante'], ['G puis O / C / D / T / A / V', 'Aller aux Objets / Catalogue / Dictionnaire / Termes / Applications / À valider'], ['N', 'Nouvel objet (assistant)'], ['P', 'Mode présentation']];
        let _v11G = 0;
        document.addEventListener('keydown', e => {
            const tgt = e.target; const typing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable);
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); v11PaletteOpen(); return; }
            if (e.key === 'Escape') { if (el('v11Pal')) return v11PaletteClose(); if (el('v11Help')) return v11HelpClose(); if (el('v11Modal')) return v11ModalClose(); if (v11State.tour) return v11TourEnd(); if (v11State.fs) return v11FsClose(); if (v11Prefs.present) return v11Present(false); return; }
            if (typing) return;
            if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); return v11Back(); }
            if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); return v11Fwd(); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return v11Undo(); }
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === '?') { e.preventDefault(); return el('v11Help') ? v11HelpClose() : v11HelpOpen(); }
            const k = e.key.toLowerCase();
            if (_v11G && Date.now() - _v11G < 1500) { _v11G = 0; const map = { o: 'objects', c: 'catalog', d: 'dictionary', t: 'glossary', a: 'assets', v: 'review', h: 'home', l: 'flow' }; if (map[k]) { e.preventDefault(); openGovTab(map[k]); } return; }
            if (k === 'g') { _v11G = Date.now(); return; }
            if (currentTab !== 9) return;
            if (k === 'f') { const n = document.querySelector('.v11-fiche') || document.querySelector('#boDetail'); if (n) { e.preventDefault(); v11Fs(n.id ? '#' + n.id : n, n.dataset.title || ''); } }
            else if (k === 'e' && govState.tab === 'objects' && govState.selectedBoId && typeof v11ToggleEdit === 'function') { e.preventDefault(); v11ToggleEdit('bo', govState.selectedBoId); }
            else if (k === 'n' && typeof v11WizardOpen === 'function') { e.preventDefault(); v11WizardOpen(); }
            else if (k === 'p') { e.preventDefault(); v11Present(!v11Prefs.present); }
        }, true);
        function v11HelpOpen() {
            v11HelpClose();
            const d = document.createElement('div'); d.className = 'v11-help'; d.id = 'v11Help'; d.setAttribute('data-ro', 'keep');
            d.innerHTML = `<div class="box">
                <div class="flex items-start gap-3"><div><h3>Aide</h3><div class="text-xs text-slate-500">Studio Data ${escapeHTML(APP_VERSION)} · tout se passe sur votre poste, rien n'est envoyé.</div></div><span class="flex-grow"></span><button class="v11-btn" onclick="v11TourStart()">▶ Revoir la visite guidée</button><button class="v11-btn" onclick="v11HelpClose()">✕</button></div>
                <h4>Raccourcis clavier</h4><div class="sc">${V11_SHORTCUTS.map(([k, l]) => `<div><span>${escapeHTML(l)}</span><span class="v11-kbd">${escapeHTML(k)}</span></div>`).join('')}</div>
                <h4>Préférences</h4>
                <label class="pref"><input type="checkbox" ${v11Prefs.density === 'compact' ? 'checked' : ''} onchange="v11SetPref('density', this.checked ? 'compact' : 'comfy')"> Affichage compact des tableaux et formulaires</label>
                <label class="pref"><input type="checkbox" ${v11Prefs.autoCollapse ? 'checked' : ''} onchange="v11SetPref('autoCollapse', this.checked)"> Replier le menu quand une fiche est en modification ou en plein écran</label>
                <label class="pref"><input type="checkbox" ${v11Prefs.readDefault ? 'checked' : ''} onchange="v11SetPref('readDefault', this.checked)"> Ouvrir les fiches en mode lecture (sinon directement en modification)</label>
                <label class="pref"><input type="checkbox" ${v11Prefs.present ? 'checked' : ''} onchange="v11Present(this.checked)"> Mode présentation (grandes polices, menu masqué, lecture seule)</label>
                <h4>Lexique</h4><div class="lex">${Object.entries(V11_LEXIQUE).map(([k, v]) => `<div><b>${escapeHTML(k.charAt(0).toUpperCase() + k.slice(1))}</b> — ${escapeHTML(v)}</div>`).join('')}</div>
            </div>`;
            d.addEventListener('click', e => { if (e.target === d) v11HelpClose(); });
            document.body.appendChild(d);
        }
        function v11HelpClose() { const d = el('v11Help'); if (d) d.remove(); }
        function v11ModalOpen(html) { v11ModalClose(); const d = document.createElement('div'); d.className = 'v11-modal'; d.id = 'v11Modal'; d.setAttribute('data-ro', 'keep'); d.innerHTML = '<div class="box">' + html + '</div>'; d.addEventListener('click', e => { if (e.target === d) v11ModalClose(); }); document.body.appendChild(d); const f = d.querySelector('input[type=text],select,textarea'); if (f) setTimeout(() => { try { f.focus(); } catch (e) {} }, 30); return d; }
        function v11ModalClose() { const d = el('v11Modal'); if (d) d.remove(); }
        // ---- Démarrage ----
        (function () {
            v11LoadPrefs(); v11RestoreScreen(); v11ApplyPrefs();
            v11State.lastGov = v11GovJson();
            const boot = () => { v11MountTopbar(); if (el('v7Nav')) renderNav(); setTimeout(() => { v11State.lastGov = v11GovJson(); if (!v11Prefs.tourDone && typeof v11TourStart === 'function') v11TourStart(true); }, 1200); };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
        })();
