        // ======================= V12.1 : L'ÉCRAN « EXTRAIRE » EN ESPACE DE TRAVAIL GUIDÉ =======================
        // Le moteur et les formulaires de l'extraction (80-extraction-avancee.js) ne changent pas : après
        // chaque rendu, on RÉORGANISE le même DOM (mêmes identifiants, mêmes gestionnaires) en quatre
        // étapes lisibles — Colonnes, Filtres, Options, Résultat — avec un bandeau de synthèse, les
        // outils secondaires (paramétrages enregistrés, objet métier, vue graphique) rangés derrière
        // des boutons, et les trois façons d'ajouter une colonne en onglets. Rien n'est perdu.
        const V12X_STEPS = [['1', 'Colonnes', 'Ce qui sort'], ['2', 'Filtres', 'Quelles lignes'], ['3', 'Options', 'Doublons, agrégats, jointures'], ['4', 'Résultat', 'Compter, prévisualiser, générer']];
        function v12xStep() { return v12State.xStep || '1'; }
        function v12xGo(step) { v12State.xStep = String(step); try { v11Prefs.xStep = v12State.xStep; v11SavePrefs(); } catch (e) {} v12xShowStep(); }
        function v12xShowStep() {
            const root = el('v12x'); if (!root) return; const cur = v12xStep();
            root.querySelectorAll('.v12x-panel').forEach(p => { p.style.display = p.dataset.step === cur ? '' : 'none'; });
            root.querySelectorAll('.v12x-tab').forEach(t => t.classList.toggle('on', t.dataset.step === cur));
            const sb = el('step-3') && el('step-3').querySelector(':scope > .v12-sticky'); if (sb) sb.style.display = cur === '4' ? 'none' : '';
            const pv = el('v12x-prev'), nx = el('v12x-next'); if (pv) pv.disabled = cur === '1'; if (nx) nx.style.display = cur === '4' ? 'none' : '';
        }
        function v12xTool(name) { v12State.xTool = v12State.xTool === name ? '' : name; v12xShowTools(); }
        function v12xShowTools() { const root = el('v12x'); if (!root) return; root.querySelectorAll('.v12x-tool').forEach(t => { t.style.display = t.dataset.tool === v12State.xTool ? '' : 'none'; }); root.querySelectorAll('.v12x-toolbtn').forEach(b => b.classList.toggle('on', b.dataset.tool === v12State.xTool)); }
        function v12xAddMode(mode) { v12State.xAdd = mode; v12xShowAdd(); }
        function v12xShowAdd() {
            const root = el('v12x'); if (!root) return; const m = v12State.xAdd || 'col';
            root.querySelectorAll('.v12x-add').forEach(a => { const on = a.dataset.add === m; a.style.display = on ? '' : 'none'; if (a.tagName === 'DETAILS') a.open = on; });
            root.querySelectorAll('.v12x-addtab').forEach(b => b.classList.toggle('on', b.dataset.add === m));
        }
        function v12xSummary() {
            const s = state.advExtract; const base = state.tables[s.baseId]; const bos = state.governance.businessObjects || [];
            const obj = s.objectId ? (bos.find(b => b.id === s.objectId) || {}).name : '';
            const chips = [];
            chips.push(`<span class="v12x-chip"><b>${escapeHTML(base ? base.name : '—')}</b> table de départ</span>`);
            if (obj) chips.push(`<span class="v12x-chip">🏛️ objet <b>${escapeHTML(obj)}</b></span>`);
            chips.push(`<span class="v12x-chip ${s.columns.length ? '' : 'warn'}" onclick="v12xGo(1)"><b>${s.columns.length}</b> colonne(s)</span>`);
            chips.push(`<span class="v12x-chip" onclick="v12xGo(2)"><b>${s.filters.length}</b> filtre(s)</span>`);
            if (s.dedup.on) chips.push(`<span class="v12x-chip" onclick="v12xGo(3)">🎯 dédoublonnage (${(s.dedup.keys || []).length} clé)</span>`);
            if (s.group.on) chips.push(`<span class="v12x-chip" onclick="v12xGo(3)">🧮 regroupement · ${(s.group.aggs || []).length} agrégat(s)</span>`);
            chips.push(`<span class="v12x-chip" onclick="v12xGo(3)">${s.joinType === 'inner' ? 'intersection' : 'conserver tout'}${s.limit500 ? ' · 500 lignes' : ''}</span>`);
            if (s.customSql) chips.push(`<span class="v12x-chip warn" onclick="v12xGo(4)">📝 SQL personnalisé</span>`);
            return chips.join('');
        }
        function v12ExtractLayout() {
            const body = el('advExtractBody'); if (!body || el('v12x') || !state.advExtract) return;
            const kids = Array.from(body.children); if (!kids.length || kids.length === 1 && kids[0].tagName === 'P') return;
            const has = (n, re) => re.test(n.textContent);
            const take = re => { const i = kids.findIndex(n => n && has(n, re)); if (i < 0) return null; const n = kids[i]; kids[i] = null; return n; };
            const presets = take(/Paramétrages d'extraction/), obj = take(/Partir d'un objet métier/), start = take(/^\s*Table de départ\s*:/), graph = take(/Vue graphique/), amb = take(/Quel lien utiliser/);
            const cols = take(/1\. Colonnes en sortie/), filt = take(/2\. Filtres/), opts = take(/Dédoublonner par cl/), acts = take(/Générer le CSV/);
            if (!cols || !acts) return; // structure inattendue : on laisse l'écran tel quel
            const s = state.advExtract; const eps = typeof epList === 'function' ? epList() : [];
            // outils : ligne « table de départ » non utile (le sélecteur est dans l'en-tête), bloc graphique visible seulement en mode graphique ou à la demande
            if (start) start.remove();
            const root = document.createElement('div'); root.id = 'v12x'; root.className = 'v12x';
            root.innerHTML = `<div class="v12x-top" data-ro="keep">
                    <div class="v12x-sum">${v12xSummary()}</div>
                    <div class="v12x-tools">
                        <button class="v12x-toolbtn" data-tool="presets" onclick="v12xTool('presets')" title="Enregistrer ou recharger un paramétrage">💾 Paramétrages${eps.length ? ' <span class="n">' + eps.length + '</span>' : ''}</button>
                        <button class="v12x-toolbtn" data-tool="obj" onclick="v12xTool('obj')" title="Partir d'un objet métier : jointures, filtres et noms pré-remplis">🏛️ Objet métier</button>
                        <button class="v12x-toolbtn ${s.graphMode ? 'on' : ''}" data-tool="graph" onclick="v12xTool('graph')" title="Choisir les colonnes sur le schéma des liens">🗺️ Vue graphique</button>
                        <button class="v12x-toolbtn" onclick="wizOpen('extract')" title="Guide pas à pas sur l'écran réel">🧭 Guide</button>
                    </div>
                </div>
                <div class="v12x-tool" data-tool="presets"></div><div class="v12x-tool" data-tool="obj"></div><div class="v12x-tool" data-tool="graph"></div>
                <div class="v12x-tabs" data-ro="keep">${V12X_STEPS.map(([n, l, sub]) => `<button class="v12x-tab" data-step="${n}" onclick="v12xGo('${n}')"><span class="n">${n}</span><span class="l">${l}<span class="sub">${sub}</span></span></button>`).join('')}</div>
                <div class="v12x-panel" data-step="1"></div><div class="v12x-panel" data-step="2"></div><div class="v12x-panel" data-step="3"></div><div class="v12x-panel" data-step="4"></div>
                <div class="v12x-nav" data-ro="keep"><button class="v11-btn" id="v12x-prev">‹ Précédent</button><span class="sp"></span><button class="v11-btn pri" id="v12x-next">Suivant ›</button></div>`;
            const P = n => root.querySelector(`.v12x-panel[data-step="${n}"]`);
            if (presets) root.querySelector('.v12x-tool[data-tool="presets"]').appendChild(presets);
            if (obj) root.querySelector('.v12x-tool[data-tool="obj"]').appendChild(obj);
            if (graph) root.querySelector('.v12x-tool[data-tool="graph"]').appendChild(graph);
            // ① Colonnes : tableau + « Ajouter » en onglets (simple, synthèse, hiérarchie, calculée)
            P('1').appendChild(cols);
            const addRow = Array.from(cols.children).find(n => n.querySelector && n.querySelector('#adv-col-tbl')); const dets = Array.from(cols.querySelectorAll(':scope > details'));
            if (addRow) {
                const wrap = document.createElement('div'); wrap.className = 'v12x-addwrap';
                const tabs = [['col', '＋ Colonne simple'], ['link', 'Σ Synthèse d\'une table liée'], ['hier', '🌳 Hiérarchie aplatie'], ['calc', 'ƒx Colonne calculée']];
                wrap.innerHTML = `<div class="v12x-addtabs" data-ro="keep"><span class="lbl">Ajouter</span>${tabs.map(([k, l]) => `<button class="v12x-addtab" data-add="${k}" onclick="v12xAddMode('${k}')">${l}</button>`).join('')}</div>`;
                cols.insertBefore(wrap, addRow); addRow.classList.add('v12x-add'); addRow.dataset.add = 'col'; wrap.appendChild(addRow);
                dets.forEach(d => { const t = d.querySelector('summary').textContent; d.classList.add('v12x-add'); d.dataset.add = /Synthèse/.test(t) ? 'link' : (/Hiérarchie/.test(t) ? 'hier' : 'calc'); wrap.appendChild(d); });
            }
            // ② Filtres (+ choix du lien quand deux tables sont reliées plusieurs fois)
            if (filt) P('2').appendChild(filt); if (amb) P('2').appendChild(amb);
            // ③ Options : dédoublonnage, regroupement, jointures, limite
            if (opts) P('3').appendChild(opts);
            const joins = Array.from(acts.children).find(n => /Jointures/.test(n.textContent) && n.querySelector('input[name="advJoinType"]'));
            if (joins) { const card = document.createElement('div'); card.className = 'v12x-card'; card.innerHTML = '<div class="t">🔗 Jointures et volume</div>'; card.appendChild(joins); P('3').appendChild(card); }
            // ④ Résultat
            P('4').appendChild(acts);
            body.appendChild(root);
            // étape courante : si rien n'est encore choisi, on commence par les colonnes
            if (!v12State.xStep) v12State.xStep = (v11Prefs.xStep && s.columns.length) ? String(v11Prefs.xStep) : '1';
            if (!s.columns.length && v12State.xStep !== '1' && !v12State.xTouched) v12State.xStep = '1';
            if (s.graphMode && !v12State.xTool) v12State.xTool = 'graph';
            v12xShowStep(); v12xShowTools(); v12xShowAdd();
            el('v12x-prev').onclick = () => { v12State.xTouched = true; v12xGo(Math.max(1, Number(v12xStep()) - 1)); };
            el('v12x-next').onclick = () => { v12State.xTouched = true; v12xGo(Math.min(4, Number(v12xStep()) + 1)); };
            el('v12x-prev').disabled = v12xStep() === '1'; el('v12x-next').style.display = v12xStep() === '4' ? 'none' : '';
        }
        // les actions de résultat affichent l'étape ④ ; la vue graphique se replie / déplie avec son interrupteur
        ['advPreview', 'advCount', 'advQuality', 'advShowSql'].forEach(nm => { const o = window[nm]; if (typeof o !== 'function') return; window[nm] = function () { v12State.xTouched = true; v12State.xStep = '4'; v12xShowStep(); return o.apply(this, arguments); }; });
        const _v12x_toggleMode = typeof advGToggleMode === 'function' ? advGToggleMode : null;
        if (_v12x_toggleMode) advGToggleMode = function (on) { v12State.xTool = on ? 'graph' : ''; return _v12x_toggleMode.apply(this, arguments); };
        const _v12x_tool = v12xTool; v12xTool = function (name) { _v12x_tool(name); if (name === 'graph' && v12State.xTool === 'graph' && !state.advExtract.graphMode) { const cb = document.querySelector('#v12x [data-tool="graph"] input[type="checkbox"]'); if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); } } };
        // après chaque rendu de l'extraction
        const _v12x_render = renderAdvExtract;
        renderAdvExtract = function () { const r = _v12x_render.apply(this, arguments); try { v12ExtractLayout(); const sec = el('step-3'); if (sec) { const p = sec.querySelector('.px-6 p'); if (p) p.style.display = 'none'; const wz = sec.querySelector('.px-6 button[onclick="wizOpen(\'extract\')"]'); if (wz) wz.style.display = 'none'; } } catch (e) { console.error(e); } return r; };
        Object.assign(V11_LEXIQUE, { 'synthèse d\'une table liée': 'Une colonne qui résume, pour chaque ligne de départ, les lignes d\'une table liée : compter, compter les valeurs uniques, transposer en texte ou en colonnes. Jamais de multiplication de lignes.', 'hiérarchie aplatie': 'Colonnes niveau 1…N reconstituées à partir d\'un lien parent → enfant (dans la même table ou via une table de liaison datée).', 'dédoublonnage': 'Ne garder qu\'une ligne par valeur de clé (première ou dernière).', 'regroupement': 'Une ligne par combinaison des colonnes en sortie, avec des agrégats (somme, nombre, moyenne…), éventuellement sous critères (NB.SI.ENS).' });
