        // ======================= V11 : SAISIE PLUS SIMPLE =======================
        // Assistant de création d'objet en trois étapes, actions groupées sur les attributs,
        // glisser-déposer d'une colonne de source sur un attribut.
        // ---- Assistant : nom et domaine → source et attributs → propriétaire ----
        const v11Wiz = { step: 0, d: {} };
        function v11WizardOpen() { v11Wiz.step = 0; v11Wiz.d = { name: '', domain: '', definition: '', table: '', cols: null, free: '', owner: '', status: 'Brouillon' }; v11WizardRender(); }
        function v11WizardRender() {
            const d = v11Wiz.d; const names = readyTableNames(); const people = typeof govPeople === 'function' ? govPeople() : [];
            const steps = ['Nom et domaine', 'Source et attributs', 'Propriétaire'];
            let body = '';
            if (v11Wiz.step === 0) body = `<div class="v11-fld"><label>Nom de l'objet</label><input type="text" id="wz-name" value="${escapeHTML(d.name)}" placeholder="ex : Client, Facture, Site…" onkeydown="if(event.key==='Enter') v11WizardNext()"><div class="hint">Un nom au singulier, tel que le métier le dit.</div></div>
                <div class="v11-fld"><label>Domaine métier</label><select id="wz-dom"><option value="">— aucun —</option>${govDomains().map(x => `<option ${x === d.domain ? 'selected' : ''}>${escapeHTML(x)}</option>`).join('')}</select><input type="text" id="wz-dom-new" class="mt-1" placeholder="ou un nouveau domaine…" value=""><div class="hint">Le domaine détermine qui valide.</div></div>
                <div class="v11-fld"><label>Définition (facultatif)</label><textarea id="wz-def" rows="2" placeholder="Ce qu'est cet objet pour le métier, en une phrase.">${escapeHTML(d.definition)}</textarea></div>`;
            else if (v11Wiz.step === 1) {
                const t = d.table ? tableByName(d.table) : null; const cols = t ? t.headers : [];
                if (d.cols === null && t) d.cols = cols.slice();
                body = `<div class="v11-fld"><label>Source de départ</label><select id="wz-tbl" onchange="v11Wiz.d.table=this.value; v11Wiz.d.cols=null; v11WizardRender()"><option value="">— sans source (attributs à la main) —</option>${names.map(n => `<option ${n === d.table ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('')}</select><div class="hint">La source ne sert qu'à initialiser : les attributs restent renommables, d'autres sources peuvent être rattachées ensuite.</div></div>`
                    + (t ? `<div class="v11-fld"><label>Colonnes à transformer en attributs <span class="font-normal normal-case">(${(d.cols || []).length} / ${cols.length})</span> <a class="text-indigo-600 cursor-pointer normal-case font-normal" onclick="v11Wiz.d.cols=${JSON.stringify(cols).replace(/"/g, '&quot;')}; v11WizardRender()">tout</a> · <a class="text-indigo-600 cursor-pointer normal-case font-normal" onclick="v11Wiz.d.cols=[]; v11WizardRender()">aucun</a></label><div class="v11-checks">${cols.map(h => `<label><input type="checkbox" ${(d.cols || []).includes(h) ? 'checked' : ''} onchange="v11WizCol('${escapeHTML(h).replace(/'/g, '&#39;')}', this.checked)">${escapeHTML(h)}</label>`).join('')}</div></div>`
                        : `<div class="v11-fld"><label>Attributs, un par ligne</label><textarea id="wz-free" rows="6" placeholder="Numéro client&#10;Raison sociale&#10;E-mail">${escapeHTML(d.free)}</textarea></div>`);
            } else body = `<div class="v11-fld"><label>Propriétaire</label><input type="text" id="wz-own" list="wz-people" value="${escapeHTML(d.owner)}" placeholder="Direction ou personne" onkeydown="if(event.key==='Enter') v11WizardNext()"><datalist id="wz-people">${people.map(p => `<option value="${escapeHTML(p.name)}">`).join('')}</datalist><div class="hint">${people.length ? 'Une personne déclarée valide elle-même les propositions sur cet objet.' : 'Texte libre. Déclarez des acteurs (Piloter › Personnes) pour activer le circuit de validation.'}</div></div>
                <div class="v11-fld"><label>Statut</label><select id="wz-status">${STATUS_OPTS.map(o => `<option ${o === d.status ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
                <div class="v11-fld"><label>Récapitulatif</label><div class="v11-val"><b>${escapeHTML(d.name)}</b>${d.domain ? ' · ' + escapeHTML(d.domain) : ''} — ${d.table ? (d.cols || []).length + ' attribut(s) depuis ' + escapeHTML(d.table) : d.free.split('\n').filter(x => x.trim()).length + ' attribut(s) saisi(s)'}</div></div>`;
            v11ModalOpen(`<div class="flex items-center gap-3"><h3>Nouvel objet métier</h3><span class="text-xs text-slate-500">${v11Wiz.step + 1} / 3 · ${steps[v11Wiz.step]}</span><span class="flex-grow"></span><button class="v11-btn" onclick="v11ModalClose()">✕</button></div>
                <div class="v11-steps">${steps.map((s, i) => `<span class="${i <= v11Wiz.step ? 'on' : ''}"></span>`).join('')}</div>${body}
                <div class="flex items-center gap-2 mt-4"><button class="v11-btn" ${v11Wiz.step === 0 ? 'disabled' : ''} onclick="v11WizardPrev()">‹ Précédent</button><span class="flex-grow"></span>${v11Wiz.step < 2 ? '<button class="v11-btn pri" onclick="v11WizardNext()">Suivant ›</button>' : '<button class="v11-btn pri" onclick="v11WizardFinish()">✓ Créer l\'objet</button>'}</div>`);
        }
        function v11WizCol(h, on) { const c = v11Wiz.d.cols || (v11Wiz.d.cols = []); if (on) { if (!c.includes(h)) c.push(h); } else v11Wiz.d.cols = c.filter(x => x !== h); const lab = el('v11Modal').querySelector('.v11-fld label span'); if (lab) lab.textContent = '(' + v11Wiz.d.cols.length + ' / ' + (tableByName(v11Wiz.d.table) || { headers: [] }).headers.length + ')'; }
        function v11WizardCollect() {
            const d = v11Wiz.d;
            if (v11Wiz.step === 0) { d.name = (el('wz-name') || {}).value || ''; d.domain = ((el('wz-dom-new') || {}).value || '').trim() || (el('wz-dom') || {}).value || ''; d.definition = (el('wz-def') || {}).value || ''; }
            else if (v11Wiz.step === 1) { if (el('wz-free')) d.free = el('wz-free').value; }
            else { d.owner = (el('wz-own') || {}).value || ''; d.status = (el('wz-status') || {}).value || 'Brouillon'; }
        }
        function v11WizardNext() { v11WizardCollect(); if (v11Wiz.step === 0 && !v11Wiz.d.name.trim()) { v11Toast('Donnez un nom à l\'objet.', 'err'); return; } v11Wiz.step = Math.min(2, v11Wiz.step + 1); v11WizardRender(); }
        function v11WizardPrev() { v11WizardCollect(); v11Wiz.step = Math.max(0, v11Wiz.step - 1); v11WizardRender(); }
        function v11WizardFinish() {
            v11WizardCollect(); const d = v11Wiz.d; if (!d.name.trim()) { v11Wiz.step = 0; return v11WizardRender(); }
            if (d.domain && typeof govAddDomain === 'function' && !govDomains().includes(d.domain)) { const g = state.governance; g.domainList = g.domainList || []; g.domainList.push(d.domain); }
            const els = d.table ? (d.cols || []).map(h => ({ id: 'be_' + generateId(), name: h, owner: '', mappings: [{ table: d.table, col: h }] })) : d.free.split('\n').map(x => x.trim()).filter(Boolean).map(n => ({ id: 'be_' + generateId(), name: n, owner: '', mappings: [] }));
            const bo = { id: 'bo_' + generateId(), name: d.name.trim(), definition: d.definition.trim(), domain: d.domain, globalOwner: d.owner.trim(), status: d.status, contributors: [], sources: d.table ? [{ table: d.table, role: 'maitre' }] : [], elements: els, structure: [], contextRules: { elementId: '', rules: [] } };
            if (typeof govLinkOwner === 'function') govLinkOwner(bo);
            (state.governance.businessObjects = state.governance.businessObjects || []).push(bo);
            if (d.table && typeof boSyncAppsFromSources === 'function') { try { boSyncAppsFromSources(); } catch (e) {} }
            persistAppState(); v11ModalClose(); v11State.edit['bo:' + bo.id] = false; govState.selectedBoId = bo.id; govState.boSel = null; openGovTab('objects');
            v11Toast('Objet « ' + bo.name + ' » créé avec ' + els.length + ' attribut(s).', 'ok');
            return bo;
        }
        // ---- Actions groupées sur les attributs ----
        function v11BulkOpen(boId) {
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId); if (!bo) return;
            const rows = boAllAttrRows(bo) || []; if (!rows.length) return v11Toast('Aucun attribut sur cet objet.', 'info');
            const assets = state.governance.assets || []; const terms = state.governance.glossary || [];
            v11ModalOpen(`<div class="flex items-center gap-3"><h3>Actions groupées</h3><span class="text-xs text-slate-500">${escapeHTML(bo.name)} · ${rows.length} attribut(s)</span><span class="flex-grow"></span><button class="v11-btn" onclick="v11ModalClose()">✕</button></div>
                <div class="v11-fld mt-3"><label>Attributs concernés <a class="text-indigo-600 cursor-pointer normal-case font-normal" onclick="document.querySelectorAll('#v11Modal .v11-checks input').forEach(i=>i.checked=true)">tout</a> · <a class="text-indigo-600 cursor-pointer normal-case font-normal" onclick="document.querySelectorAll('#v11Modal .v11-checks input').forEach(i=>i.checked=false)">aucun</a> · <a class="text-indigo-600 cursor-pointer normal-case font-normal" onclick="document.querySelectorAll('#v11Modal .v11-checks input').forEach(i=>i.checked=!i.dataset.def)">sans définition</a></label>
                <div class="v11-checks">${rows.map(r => `<label><input type="checkbox" value="${r.el.id}" data-st="${r.stId || ''}" ${r.el.definition ? 'data-def="1"' : ''}>${escapeHTML(r.el.name)}${r.facet ? ' ◆ ' + escapeHTML(r.facet) : ''}</label>`).join('')}</div></div>
                <div class="grid grid-cols-2 gap-3"><div class="v11-fld"><label>Action</label><select id="bk-act" onchange="v11BulkField()"><option value="sensitivity">Sensibilité</option><option value="term">Poser un terme du glossaire</option><option value="owner">Propriétaire de l'attribut</option><option value="usedBy">Usage par une application / un processus</option><option value="definition">Définition (remplace)</option></select></div>
                <div class="v11-fld" id="bk-val-wrap"><label>Valeur</label><span id="bk-val"></span></div></div>
                <div class="flex items-center gap-2 mt-2"><span class="text-xs text-slate-500" id="bk-hint"></span><span class="flex-grow"></span><button class="v11-btn pri" onclick="v11BulkApply('${bo.id}')">Appliquer</button></div>`);
            window._v11BulkData = { sens: SENSITIVITY_OPTS, terms: terms.map(t => t.term), assets: assets.map(a => ({ id: a.id, name: a.name })) };
            v11BulkField();
        }
        function v11BulkField() {
            const act = (el('bk-act') || {}).value; const w = el('bk-val'); if (!w) return; const D = window._v11BulkData || {};
            if (act === 'sensitivity') w.innerHTML = `<select id="bk-v">${(D.sens || []).map(o => `<option>${o}</option>`).join('')}</select>`;
            else if (act === 'term') w.innerHTML = `<input type="text" id="bk-v" list="bk-terms" placeholder="terme existant ou nouveau"><datalist id="bk-terms">${(D.terms || []).map(t => `<option value="${escapeHTML(t)}">`).join('')}</datalist>`;
            else if (act === 'usedBy') w.innerHTML = `<select id="bk-v">${(D.assets || []).map(a => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('') || '<option value="">— aucune application déclarée —</option>'}</select>`;
            else if (act === 'definition') w.innerHTML = `<textarea id="bk-v" rows="2" placeholder="Définition commune"></textarea>`;
            else w.innerHTML = `<input type="text" id="bk-v" placeholder="Nom ou direction">`;
            el('bk-hint').textContent = typeof govFeatureOn === 'function' && govFeatureOn() && !govCanEditBo((state.governance.businessObjects || []).find(b => b.id === govState.selectedBoId)) ? 'Vos modifications seront des propositions, une par attribut.' : '';
        }
        function v11BulkApply(boId) {
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId); if (!bo) return;
            const act = el('bk-act').value; const v = (el('bk-v') || {}).value || '';
            const sel = Array.from(document.querySelectorAll('#v11Modal .v11-checks input:checked')).map(i => ({ elId: i.value, stId: i.dataset.st || '' }));
            if (!sel.length) return v11Toast('Cochez au moins un attribut.', 'err');
            if (!v && act !== 'definition') return v11Toast('Indiquez une valeur.', 'err');
            let n = 0;
            sel.forEach(s => {
                if (act === 'term') { termTagAdd('attr', { boId, elId: s.elId }, v); n++; }
                else if (act === 'usedBy') { const r = (boAllAttrRows(bo) || []).find(x => x.el.id === s.elId); const cur = (r && r.el.usedBy) || []; if (!cur.includes(v)) { boAttrWrite(boId, s.stId, s.elId, 'usedBy', [...cur, v]); n++; } }
                else { boAttrWrite(boId, s.stId, s.elId, act, v); n++; }
            });
            v11ModalClose(); renderGovernance(); v11Toast(n + ' attribut(s) mis à jour.', 'ok');
        }
        // ---- Glisser-déposer : colonne de source → attribut ----
        function v11AddMapping(boId, elId, table, col) {
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId); const elm = bo && (bo.elements || []).find(e => e.id === elId); if (!elm) return;
            elm.mappings = elm.mappings || []; if (elm.mappings.some(m => m.table === table && m.col === col)) return;
            elm.mappings.push({ table, col }); persistAppState(); renderGovernance();
        }
        if (typeof govWrapBoAction === 'function') govWrapBoAction('v11AddMapping', 'Rattacher une colonne', 0);
        function v11ColsPanelHtml(bo) {
            const tabs = (bo.sources || []).map(s => s.table).filter(n => tableByName(n)); if (!tabs.length) return '';
            const used = new Set(); (bo.elements || []).forEach(e => (e.mappings || []).forEach(m => used.add(m.table + '.' + m.col)));
            const chips = tabs.flatMap(tn => (tableByName(tn).headers || []).filter(h => !used.has(tn + '.' + h)).map(h => `<span class="v11-drag" draggable="true" data-tbl="${escapeHTML(tn)}" data-col="${escapeHTML(h)}" title="Glisser sur un attribut pour le rattacher">▫ ${escapeHTML(h)}<span class="text-[9px] opacity-60">${escapeHTML(tn)}</span></span>`));
            if (!chips.length) return '';
            return `<div class="v11-cols" data-ro="keep"><div class="t">Colonnes de source non rattachées — glissez-les sur un attribut</div>${chips.join('')}</div>`;
        }
        function v11DragInit() {
            if (currentTab !== 9 || govState.tab !== 'objects' || !govState.selectedBoId || !v11Editing('bo:' + govState.selectedBoId) || govState.boTab !== 'structure') return;
            const bo = (state.governance.businessObjects || []).find(b => b.id === govState.selectedBoId); if (!bo) return;
            if (typeof govFeatureOn === 'function' && govFeatureOn() && !govCanEditBo(bo) && !govCanProposeBo(bo)) return;
            const det = el('boDetail'); if (!det || det.querySelector('.v11-cols')) return;
            const html = v11ColsPanelHtml(bo); if (!html) return;
            det.insertAdjacentHTML('afterbegin', html);
            det.querySelectorAll('.v11-drag').forEach(ch => ch.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', JSON.stringify({ tbl: ch.dataset.tbl, col: ch.dataset.col })); e.dataTransfer.effectAllowed = 'link'; }));
            document.querySelectorAll('#govContent .bo-item[data-sel]').forEach(row => {
                let s; try { s = JSON.parse(row.getAttribute('data-sel')); } catch (e) { return; } if (!s || s.kind !== 'attr' || s.stId) return; // attributs propres seulement (les facettes ont une colonne unique)
                const m = [null, '', s.elId];
                row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('v11-drop'); });
                row.addEventListener('dragleave', () => row.classList.remove('v11-drop'));
                row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('v11-drop'); let d; try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (er) { return; } if (d && d.tbl && d.col) { v11AddMapping(bo.id, m[2], d.tbl, d.col); v11Toast(d.col + ' rattachée.', 'ok'); } });
            });
        }
