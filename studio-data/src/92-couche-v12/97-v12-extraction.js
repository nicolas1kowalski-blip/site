        // ======================= V12.2 : L'ÉCRAN « EXTRAIRE » EN PLAN DE TRAVAIL =======================
        // Pas d'étapes ni de « Suivant » : tout est visible d'un coup d'œil, comme une recette qui se lit
        // de haut en bas — ce qui SORT (colonnes), quelles LIGNES (filtres), la FORME du résultat
        // (doublons, agrégats, jointures) — avec, à droite, un panneau Résultat toujours à portée
        // (compter, prévisualiser, bilan, SQL, générer). Les outils secondaires (paramétrages, objet
        // métier, vue graphique, guide) sont rangés derrière des boutons. Le moteur et les formulaires
        // (80-extraction-avancee.js) ne changent pas : on réorganise le même DOM après chaque rendu.
        function v12xTool(name) { v12State.xTool = v12State.xTool === name ? '' : name; v12xShowTools(); }
        function v12xShowTools() { const root = el('v12x'); if (!root) return; root.querySelectorAll('.v12x-tool').forEach(t => { t.style.display = t.dataset.tool === v12State.xTool ? '' : 'none'; }); root.querySelectorAll('.v12x-toolbtn').forEach(b => b.classList.toggle('on', b.dataset.tool === v12State.xTool)); }
        function v12xAddMode(mode) { v12State.xAdd = mode; v12State.xAddOpen = true; v12xShowAdd(); }
        function v12xAddToggle() { v12State.xAddOpen = !v12State.xAddOpen; v12xShowAdd(); }
        function v12xShowAdd() {
            const root = el('v12x'); if (!root) return; const m = v12State.xAdd || 'col'; const open = !!v12State.xAddOpen;
            const wrap = root.querySelector('.v12x-addwrap'); if (wrap) wrap.style.display = open ? '' : 'none';
            const btn = root.querySelector('.v12x-addbtn'); if (btn) btn.classList.toggle('on', open);
            root.querySelectorAll('.v12x-add').forEach(a => { const on = a.dataset.add === m; a.style.display = on ? '' : 'none'; if (a.tagName === 'DETAILS') a.open = on; });
            root.querySelectorAll('.v12x-addtab').forEach(b => b.classList.toggle('on', b.dataset.add === m));
        }
        function v12xSummary() {
            const s = state.advExtract; const base = state.tables[s.baseId]; const bos = state.governance.businessObjects || [];
            const obj = s.objectId ? (bos.find(b => b.id === s.objectId) || {}).name : '';
            const chips = [];
            chips.push(`<span class="v12x-chip"><b>${escapeHTML(base ? base.name : '—')}</b> table de départ</span>`);
            if (obj) chips.push(`<span class="v12x-chip">🏛️ objet <b>${escapeHTML(obj)}</b></span>`);
            chips.push(`<span class="v12x-chip ${s.columns.length ? '' : 'warn'}"><b>${s.columns.length}</b> colonne(s)</span>`);
            chips.push(`<span class="v12x-chip"><b>${s.filters.length}</b> filtre(s)</span>`);
            if (s.dedup.on) chips.push(`<span class="v12x-chip">🎯 dédoublonnage (${(s.dedup.keys || []).length} clé)</span>`);
            if (s.group.on) chips.push(`<span class="v12x-chip">🧮 regroupement · ${(s.group.aggs || []).length} agrégat(s)</span>`);
            chips.push(`<span class="v12x-chip">${s.joinType === 'inner' ? 'intersection' : 'conserver tout'}${s.limit500 ? ' · 500 lignes' : ''}</span>`);
            if (s.customSql) chips.push(`<span class="v12x-chip warn">📝 SQL personnalisé</span>`);
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
                <div class="v12x-grid">
                    <div class="v12x-main">
                        <section class="v12x-sec" data-sec="cols"><div class="v12x-h"><span class="ic">▤</span><div><b>Colonnes en sortie</b><span class="sub">ce que contiendra le fichier</span></div><span class="sp"></span><button class="v11-btn pri sm v12x-addbtn" onclick="v12xAddToggle()">＋ Ajouter une colonne</button></div><div class="v12x-body"></div></section>
                        <section class="v12x-sec" data-sec="filt"><div class="v12x-h"><span class="ic">⛉</span><div><b>Filtres</b><span class="sub">quelles lignes garder — sans filtre, tout est extrait</span></div></div><div class="v12x-body"></div></section>
                        <section class="v12x-sec" data-sec="opts"><div class="v12x-h"><span class="ic">◇</span><div><b>Forme du résultat</b><span class="sub">doublons, regroupement et agrégats, jointures, volume</span></div></div><div class="v12x-body"></div></section>
                    </div>
                    <aside class="v12x-side"><section class="v12x-sec res"><div class="v12x-h"><span class="ic">▶</span><div><b>Résultat</b><span class="sub">vérifier, puis générer</span></div></div><div class="v12x-body"></div></section></aside>
                </div>
                <div class="v12x-out"></div>`;
            const B = k => root.querySelector(`.v12x-sec[data-sec="${k}"] .v12x-body`);
            if (presets) root.querySelector('.v12x-tool[data-tool="presets"]').appendChild(presets);
            if (obj) root.querySelector('.v12x-tool[data-tool="obj"]').appendChild(obj);
            if (graph) root.querySelector('.v12x-tool[data-tool="graph"]').appendChild(graph);
            // Colonnes : tableau, puis « Ajouter » (masqué tant qu'on ne le demande pas, ouvert s'il n'y a aucune colonne)
            B('cols').appendChild(cols);
            const addRow = Array.from(cols.children).find(n => n.querySelector && n.querySelector('#adv-col-tbl')); const dets = Array.from(cols.querySelectorAll(':scope > details'));
            if (addRow) {
                const wrap = document.createElement('div'); wrap.className = 'v12x-addwrap';
                const tabs = [['col', 'Colonne d\'une table'], ['link', 'Σ Synthèse d\'une table liée'], ['hier', '🌳 Hiérarchie aplatie'], ['calc', 'ƒx Colonne calculée']];
                wrap.innerHTML = `<div class="v12x-addtabs" data-ro="keep">${tabs.map(([k, l]) => `<button class="v12x-addtab" data-add="${k}" onclick="v12xAddMode('${k}')">${l}</button>`).join('')}<span class="sp"></span><button class="v12x-x" onclick="v12State.xAddOpen=false; v12xShowAdd()" title="Fermer">✕</button></div>`;
                cols.insertBefore(wrap, addRow); addRow.classList.add('v12x-add'); addRow.dataset.add = 'col'; wrap.appendChild(addRow);
                dets.forEach(d => { const t = d.querySelector('summary').textContent; d.classList.add('v12x-add'); d.dataset.add = /Synthèse/.test(t) ? 'link' : (/Hiérarchie/.test(t) ? 'hier' : 'calc'); wrap.appendChild(d); });
            }
            // Filtres (+ choix du lien quand deux tables sont reliées plusieurs fois)
            if (filt) B('filt').appendChild(filt); if (amb) B('filt').appendChild(amb);
            // Forme du résultat : dédoublonnage, regroupement, jointures, limite
            if (opts) B('opts').appendChild(opts);
            const joins = Array.from(acts.children).find(n => /Jointures/.test(n.textContent) && n.querySelector('input[name="advJoinType"]'));
            if (joins) B('opts').appendChild(joins);
            // Résultat (panneau latéral) : boutons de vérification + génération ; aperçu, bilan et SQL en pleine largeur dessous
            const resB = root.querySelector('.v12x-sec.res .v12x-body');
            const btnRow = Array.from(acts.children).find(n => n.querySelector && n.querySelector('[onclick="advCount()"]'));
            const genRow = Array.from(acts.children).find(n => n.querySelector && n.querySelector('#adv-generate'));
            if (btnRow) { btnRow.classList.add('v12x-verify'); resB.appendChild(btnRow); }
            if (genRow) { genRow.classList.add('v12x-gen'); resB.appendChild(genRow); }
            const out = root.querySelector('.v12x-out'); ['adv-preview', 'adv-quality', 'adv-sql-wrap'].forEach(id => { const n = el(id); if (n && acts.contains(n)) out.appendChild(n); });
            acts.remove();
            body.appendChild(root);
            if (s.graphMode && !v12State.xTool) v12State.xTool = 'graph';
            if (v12State.xAddOpen === undefined) v12State.xAddOpen = !s.columns.length;
            if (!s.columns.length) v12State.xAddOpen = true;
            v12xShowTools(); v12xShowAdd();
            const sb = el('step-3') && el('step-3').querySelector(':scope > .v12-sticky'); if (sb) sb.remove();
        }
        // aperçu, bilan, SQL : on amène l'utilisateur dessous
        ['advPreview', 'advQuality', 'advShowSql'].forEach(nm => Studio.extend(nm, (o) => function () { const r = o.apply(this, arguments); setTimeout(() => { const n = el('v12x') && el('v12x').querySelector('.v12x-out'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150); return r; }, { motif: 'amener l\'utilisateur sous le résultat' }));
        // la vue graphique se replie / déplie avec son interrupteur
        const _v12x_toggleMode = typeof advGToggleMode === 'function' ? advGToggleMode : null;
        if (_v12x_toggleMode) advGToggleMode = function (on) { v12State.xTool = on ? 'graph' : ''; return _v12x_toggleMode.apply(this, arguments); };
        Studio.extend('v12xTool', (_v12x_tool) => function (name) { _v12x_tool(name); if (name === 'graph' && v12State.xTool === 'graph' && !state.advExtract.graphMode) { const cb = document.querySelector('#v12x [data-tool="graph"] input[type="checkbox"]'); if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); } } });
        // après chaque rendu de l'extraction
        Studio.extend('renderAdvExtract', (_v12x_render) => function () { const r = _v12x_render.apply(this, arguments); try { v12ExtractLayout(); const sec = el('step-3'); if (sec) { const p = sec.querySelector('.px-6 p'); if (p) p.style.display = 'none'; const wz = sec.querySelector('.px-6 button[onclick="wizOpen(\'extract\')"]'); if (wz) wz.style.display = 'none'; } } catch (e) { console.error(e); } return r; });
        Object.assign(V11_LEXIQUE, { 'synthèse d\'une table liée': 'Une colonne qui résume, pour chaque ligne de départ, les lignes d\'une table liée : compter, compter les valeurs uniques, transposer en texte ou en colonnes. Jamais de multiplication de lignes.', 'hiérarchie aplatie': 'Colonnes niveau 1…N reconstituées à partir d\'un lien parent → enfant (dans la même table ou via une table de liaison datée).', 'dédoublonnage': 'Ne garder qu\'une ligne par valeur de clé (première ou dernière).', 'regroupement': 'Une ligne par combinaison des colonnes en sortie, avec des agrégats (somme, nombre, moyenne…), éventuellement sous critères (NB.SI.ENS).' });
