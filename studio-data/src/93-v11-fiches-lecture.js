        // ======================= V11 : FICHES EN MODE LECTURE =======================
        // Objets, termes, applications et sources s'ouvrent d'abord comme une carte propre, sans
        // champ de saisie : même en-tête, mêmes sections, mêmes actions pour les quatre types.
        // « Modifier » ouvre le formulaire V7 complet ; un clic sur une valeur la modifie en place.
        function v11Editing(key) { if (typeof govIsReadOnly === 'function' && govIsReadOnly()) return false; const v = v11State.edit[key]; return v === undefined ? !v11Prefs.readDefault : !!v; }
        function v11ToggleEdit(kind, id) { const k = kind + ':' + id; v11SetEditing(k, !v11Editing(k)); }
        // 7. « Modifier dans l'objet » (fiche du catalogue) ouvre bien le formulaire.
        if (typeof catEditInObject === 'function') { const _v11_cat = catEditInObject; catEditInObject = function () { const e2 = _catFicheCtx; if (e2 && e2.bo) v11State.edit['bo:' + e2.bo] = true; return _v11_cat.apply(this, arguments); }; }
        function v11GoBo(id, elId, stId) { govState.selectedBoId = id; govState.boSel = elId ? { kind: 'attr', stId: stId || '', elId } : null; if (elId) { govState.boTab = 'structure'; govState.structView = 'fiche'; v11State.edit['bo:' + id] = true; } const bo = (state.governance.businessObjects || []).find(b => b.id === id); if (bo) v11Recent('bo', id, bo.name); openGovTab('objects'); }
        function v11GoAsset(id) { v11State.selAsset = id; const a = assetById(id); if (a) v11Recent('asset', id, a.name); openGovTab('assets'); setTimeout(() => { const n = el('v11-as-' + id) || document.querySelector(`input[onchange^="updateGovAsset('${id}','name'"]`); if (n) { (n.closest('.rounded-xl') || n).scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 50); }
        function v11GoTable(tn) { govState.dictMode = 'table'; govState.dictTable = tn; v11Recent('table', tn, tn); openGovTab('dictionary'); }
        const _v11_termTagOpen = termTagOpen; termTagOpen = function (id) { v11State.selTerm = id; const t = (state.governance.glossary || []).find(x => x.id === id); if (t) v11Recent('term', id, t.term); return _v11_termTagOpen.apply(this, arguments); };
        function v11EditAttr(boId, stId, elId) { v11State.edit['bo:' + boId] = true; govState.selectedBoId = boId; govState.boTab = 'structure'; govState.structView = 'fiche'; govState.boSel = { kind: 'attr', stId: stId || '', elId }; openGovTab('objects'); }
        // Droits : peut-on modifier (ou proposer) cette fiche ? ce champ réservé ?
        function v11Can(kind, ent) {
            if (typeof govIsReadOnly === 'function' && govIsReadOnly()) return { any: false, reserved: false };
            if (typeof govFeatureOn !== 'function' || !govFeatureOn()) return { any: true, reserved: true };
            if (kind === 'bo') return { any: govCanEditBo(ent) || govCanProposeBo(ent), reserved: govCanEditBo(ent) };
            const dom = kind === 'table' ? String((tableByName(ent.name) || {}).theme || '').trim() : String(ent.domain || '').trim();
            return { any: govCanEdit(dom) || govCanPropose(dom), reserved: govCanEdit(dom) };
        }
        // ---- Gabarit commun ----
        function v11Fiche(o) {
            const meta = (o.meta || []).filter(m => m && m.v !== undefined && m.v !== null && m.v !== '').map(m => `<span>${escapeHTML(m.k)} <b>${m.raw ? m.v : escapeHTML(String(m.v))}</b></span>`).join('');
            return `<div class="v11-fiche" id="${o.id}" data-title="${escapeHTML(o.title)}">
                <div class="hd"><span class="ico" aria-hidden="true">${o.icon}</span><div class="min-w-0"><div class="kind">${escapeHTML(o.kindLabel)}</div><h2>${escapeHTML(o.title)}</h2><div class="meta">${meta}</div></div><div class="acts" data-ro="keep">${(o.acts || []).join('')}</div></div>
                <div class="bd">${(o.sections || []).filter(Boolean).map(s => `<div class="v11-sec ${s.cls || ''}"><div class="t">${escapeHTML(s.t)}${s.n !== undefined ? `<span class="n">${s.n}</span>` : ''}</div>${s.html}</div>`).join('')}</div>
            </div>`;
        }
        function v11Acts(kind, id, ent, extra) {
            const can = v11Can(kind, ent); const key = kind + ':' + id; const ro = typeof govIsReadOnly === 'function' && govIsReadOnly();
            if (ro) return [...(extra || []).filter(x => !/v11BulkOpen/.test(x)), `<button class="v11-btn" onclick="v11Fs('#v11-${kind}-${id}', '${escapeHTML(String(ent.name || ent.term || '')).replace(/'/g, '&#39;')}')" title="Plein écran (F)">⛶</button>`, `<button class="v11-btn" onclick="v11Print('${kind}','${id}')" title="Imprimer ou enregistrer en PDF">🖨</button>`];
            return [can.any ? `<button class="v11-btn pri" onclick="v11ToggleEdit('${kind}','${id}')" title="Ouvrir le formulaire complet (E)">✎ Modifier</button>` : '<span class="text-[11px] text-slate-500">🔒 lecture seule</span>',
                ...(extra || []),
                `<button class="v11-btn" onclick="v11Duplicate('${kind}','${id}')" title="Créer une copie">⧉ Dupliquer</button>`,
                `<button class="v11-btn" onclick="v11Fs('#v11-${kind}-${id}', '${escapeHTML(String(ent.name || ent.term || '')).replace(/'/g, '&#39;')}')" title="Plein écran (F)">⛶</button>`,
                `<button class="v11-btn" onclick="v11Print('${kind}','${id}')" title="Imprimer ou enregistrer en PDF">🖨</button>`];
        }
        // ---- Valeur modifiable en place ----
        function v11IE(kind, id, field, value, opts) {
            opts = opts || {}; const ro = !!opts.ro || (typeof govIsReadOnly === 'function' && govIsReadOnly()); const empty = value === undefined || value === null || String(value).trim() === '';
            return `<div class="v11-val v11-ie ${ro ? 'ro' : ''} ${empty ? 'empty' : ''}" ${ro ? '' : `onclick="event.stopPropagation(); v11InlineEdit(this)"`} data-kind="${kind}" data-id="${escapeHTML(id)}" data-field="${field}" data-type="${opts.type || 'text'}" ${opts.options ? `data-options="${escapeHTML(JSON.stringify(opts.options))}"` : ''} title="${ro ? (opts.roTitle || 'Réservé au propriétaire') : 'Cliquer pour modifier · Entrée valide · Échap annule'}">${empty ? escapeHTML(opts.placeholder || '—') : escapeHTML(String(value))}</div>`;
        }
        function v11InlineEdit(node) {
            if (node.querySelector('.v11-ie-in')) return;
            const kind = node.dataset.kind, id = node.dataset.id, field = node.dataset.field, type = node.dataset.type;
            const cur = node.classList.contains('empty') ? '' : node.textContent;
            let inp;
            if (type === 'select') { inp = document.createElement('select'); const opts = JSON.parse(node.dataset.options || '[]'); inp.innerHTML = '<option value="">—</option>' + opts.map(o => `<option ${o === cur ? 'selected' : ''}>${escapeHTML(o)}</option>`).join(''); }
            else if (type === 'multi') { inp = document.createElement('textarea'); inp.rows = 3; inp.value = cur; }
            else { inp = document.createElement('input'); inp.type = 'text'; inp.value = cur; }
            inp.className = 'v11-ie-in'; inp.setAttribute('data-ro', 'keep');
            const done = save => { if (!inp.parentNode) return; const v = inp.value; inp.remove(); node.textContent = cur || '—'; if (save && v !== cur) v11InlineSave(kind, id, field, v); else if (!cur) node.classList.add('empty'); };
            inp.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } else if (e.key === 'Enter' && (type !== 'multi' || e.ctrlKey)) { e.preventDefault(); done(true); } });
            inp.addEventListener('blur', () => setTimeout(() => done(true), 80));
            if (type === 'select') inp.addEventListener('change', () => done(true));
            node.textContent = ''; node.classList.remove('empty'); node.appendChild(inp); inp.focus(); if (inp.select) try { inp.select(); } catch (e) {}
        }
        function v11InlineSave(kind, id, field, v) {
            if (kind === 'bo') updateBusinessObject(id, field, field === 'contributors' ? v.split(',').map(x => x.trim()).filter(Boolean) : v);
            else if (kind === 'term') updateGlossaryTerm(id, field, v);
            else if (kind === 'asset') updateGovAsset(id, field, v);
            else if (kind === 'table') { if (field === 'theme') { const t = tableByName(id); if (t) updateTableTheme(t.id, v); } else updateDictField(id, field, v); }
            else if (kind === 'attr') { const [boId, stId, elId] = id.split('|'); boAttrWrite(boId, stId || '', elId, field, v); }
            renderGovernance();
        }
        function v11EditBar(kind, id, name, hint) { return `<div class="v11-editbar" data-ro="keep"><span>✎ <b>Modification</b> ${escapeHTML(name)}${hint ? ' · ' + escapeHTML(hint) : ''}</span><span class="flex-grow"></span><button class="v11-btn sm" onclick="v11Fs('#boDetail','Attributs')" title="Plein écran des attributs">⛶ Attributs</button><button class="v11-btn pri sm" onclick="v11ToggleEdit('${kind}','${id}')" title="Revenir à la fiche en lecture (E)">✓ Terminer</button></div>`; }
        function v11Chip(label, onclick, k, title) { return `<span class="v11-chip" ${onclick ? `onclick="${onclick}"` : ''} title="${escapeHTML(title || '')}">${k ? `<span class="k">${escapeHTML(k)}</span>` : ''}${escapeHTML(label)}</span>`; }
        function v11Empty(t) { return `<div class="v11-val empty">${escapeHTML(t || '—')}</div>`; }
        function v11Dash(v) { return (v === undefined || v === null || String(v).trim() === '') ? '<span class="dim">—</span>' : escapeHTML(String(v)); }
        // ---- Objet métier ----
        function v11BoRead(bo) {
            const can = v11Can('bo', bo); const rows = boAllAttrRows(bo) || []; const comp = boCompleteness(bo);
            const assets = state.governance.assets || []; const asName = id => (assets.find(a => a.id === id) || {}).name || id;
            const prod = (bo.producedBy || []).map(id => v11Chip(asName(id), `v11GoAsset('${id}')`, 'produit par')).join('');
            const cons = (bo.consumedBy || []).map(id => v11Chip(asName(id), `v11GoAsset('${id}')`, 'consommé par')).join('');
            const srcs = (bo.sources || []).map(s => v11Chip(s.table, `v11GoTable('${escapeHTML(s.table).replace(/'/g, '&#39;')}')`, s.role === 'maitre' ? 'maître' : (s.role === 'destinataire' ? 'destinataire' : 'contributeur'))).join('');
            const terms = typeof termsOfBo === 'function' ? termsOfBo(bo.id) : [];
            const attrTbl = rows.length ? `<div class="overflow-x-auto"><table class="v11-tbl"><thead><tr><th>Attribut</th><th>Facette</th><th>Alimenté par</th><th>Définition</th><th>Sensibilité</th><th>Termes</th><th>Usage</th></tr></thead><tbody>${rows.map(r => {
                const maps = r.stId ? (r.el.col ? [r.el.col] : []) : (r.el.mappings || []).map(m => m.table + '.' + m.col);
                const tt = typeof termsOfAttr === 'function' ? termsOfAttr(bo.id, r.el.id).map(t => t.term) : [];
                const use = (r.el.usedBy || []).map(asName);
                const aid = bo.id + '|' + (r.stId || '') + '|' + r.el.id;
                return `<tr class="click" onclick="v11EditAttr('${bo.id}','${r.stId || ''}','${r.el.id}')" title="Ouvrir cet attribut (les cellules Définition et Sensibilité se modifient sur place)"><td><b>${escapeHTML(r.el.name)}</b></td><td class="dim">${r.facet ? escapeHTML(r.facet) : '—'}</td><td>${maps.length ? maps.map(escapeHTML).join('<br>') : '<span class="dim">non alimenté</span>'}</td><td>${v11IE('attr', aid, 'definition', r.el.definition, { type: 'multi', ro: !can.any, placeholder: '—' })}</td><td>${v11IE('attr', aid, 'sensitivity', r.el.sensitivity, { type: 'select', options: SENSITIVITY_OPTS, ro: !can.any, placeholder: '—' })}</td><td>${tt.length ? tt.map(escapeHTML).join(', ') : '<span class="dim">—</span>'}</td><td>${use.length ? use.map(escapeHTML).join(', ') : '<span class="dim">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : v11Empty('Aucun attribut. « Modifier » puis « + Attribut », ou glissez des colonnes de source.');
            const todos = comp.todos.map(t => `<span class="v11-chip" onclick="v11State.edit['bo:${bo.id}']=true; ${t.act.replace(/"/g, '&quot;')}">→ ${escapeHTML(t.lbl)}</span>`).join('');
            const props = typeof govProposals === 'function' ? govProposals().filter(p => p.status === 'pending' && ((p.target || {}).boId === bo.id || ((p.target || {}).ctx || {}).boId === bo.id)) : [];
            return v11Fiche({
                id: 'v11-bo-' + bo.id, icon: '🏛️', kindLabel: 'Objet métier', title: bo.name,
                meta: [{ k: 'Statut', v: bo.status || 'Brouillon' }, { k: 'Domaine', v: bo.domain || '' }, { k: 'Propriétaire', v: bo.globalOwner || '' }, { k: 'Complétude', v: comp.score + ' %' }, { k: '', v: rows.length + ' attribut(s) · ' + (bo.sources || []).length + ' source(s)' }],
                acts: v11Acts('bo', bo.id, bo, [`<button class="v11-btn ${v11State.lineage[bo.id] ? 'pri' : ''}" onclick="v11State.lineage['${bo.id}']=!v11State.lineage['${bo.id}']; renderGovernance()" title="Applications → objet → usages, dans la fiche">🕸 Lineage</button>`, `<button class="v11-btn" onclick="v11State.edit['bo:${bo.id}']=true; openBoAudit('${bo.id}')" title="Audit global de l'objet">🔎 Audit</button>`, can.any ? `<button class="v11-btn" onclick="v11BulkOpen('${bo.id}')" title="Modifier plusieurs attributs d'un coup">☑ Actions groupées</button>` : '']),
                sections: [
                    { t: 'Définition', cls: 'half', html: v11IE('bo', bo.id, 'definition', bo.definition, { type: 'multi', ro: !can.any, placeholder: 'Aucune définition — cliquez pour l\'écrire.' }) },
                    { t: 'Propriétaire', cls: 'third', html: v11IE('bo', bo.id, 'globalOwner', bo.globalOwner, { ro: !can.reserved, placeholder: 'Aucun propriétaire' }) + (bo.contributors && bo.contributors.length ? `<div class="text-[11px] text-slate-500 mt-1">Contributeurs : ${escapeHTML(bo.contributors.join(', '))}</div>` : '') },
                    { t: 'Domaine métier', cls: 'third', html: v11IE('bo', bo.id, 'domain', bo.domain, { type: 'select', options: govDomains(), ro: !can.reserved, placeholder: 'Aucun domaine' }) },
                    { t: 'Complétude', cls: 'half', html: `<div class="flex items-center gap-3"><div class="v11-bar flex-grow"><i style="width:${comp.score}%"></i></div><b class="text-sm">${comp.score} %</b></div><div class="v11-chips mt-2">${todos || '<span class="text-xs text-emerald-700 font-bold">✓ Fiche complète</span>'}</div>` },
                    { t: 'Sources', n: (bo.sources || []).length, cls: 'half', html: srcs ? `<div class="v11-chips">${srcs}</div>` : v11Empty('Aucune source rattachée') },
                    { t: 'Applications', n: (bo.producedBy || []).length + (bo.consumedBy || []).length, cls: 'half', html: (prod || cons) ? `<div class="v11-chips">${prod}${cons}</div>` : v11Empty('Aucune application déclarée') },
                    { t: 'Termes du glossaire', n: terms.length, cls: 'half', html: terms.length ? `<div class="v11-chips">${terms.map(t => v11Chip(t.term, `termTagOpen('${t.id}')`)).join('')}</div>` : v11Empty('Aucun terme') },
                    props.length ? { t: 'Propositions en attente', n: props.length, html: `<div class="v11-chips">${props.map(p => `<span class="v11-chip" onclick="openGovTab('review')" title="${escapeHTML(p.after || '')}">⏳ ${escapeHTML(p.label)}</span>`).join('')}</div>` } : null,
                    v11State.lineage[bo.id] ? { t: 'Lineage', html: '<div id="attrLineageBox"></div>' } : null,
                    { t: 'Attributs', n: rows.length, html: attrTbl },
                ]
            });
        }
        const _v11_renderBoDetail = renderBoDetail;
        renderBoDetail = function (bo, names) {
            if (!v11Editing('bo:' + bo.id)) return v11BoRead(bo);
            return v11EditBar('bo', bo.id, 'de l\'objet « ' + bo.name + ' »', typeof govFeatureOn === 'function' && govFeatureOn() && !govCanEditBo(bo) && govCanProposeBo(bo) ? 'vos modifications seront des propositions' : '') + _v11_renderBoDetail.apply(this, arguments);
        };
        // ---- Terme ----
        function v11TermRead(g) {
            const can = v11Can('term', g); const bos = state.governance.businessObjects || [];
            const attrs = (typeof termAttrLinks === 'function' ? termAttrLinks(g) : (g.attrLinks || [])).map(l => { const bo = bos.find(b => b.id === l.boId); const r = bo && (boAllAttrRows(bo) || []).find(x => x.el.id === l.elId); return bo && r ? v11Chip(r.el.name, `v11GoBo('${bo.id}','${r.el.id}','${r.stId || ''}')`, bo.name) : ''; }).join('');
            const objs = (g.boIds || []).map(id => { const bo = bos.find(b => b.id === id); return bo ? v11Chip(bo.name, `v11GoBo('${bo.id}')`, 'objet') : ''; }).join('');
            const as = (g.assetIds || []).map(id => { const a = assetById(id); return a ? v11Chip(a.name, `v11GoAsset('${a.id}')`, a.kind === 'process' ? 'processus' : 'application') : ''; }).join('');
            return v11Fiche({
                id: 'v11-term-' + g.id, icon: '📖', kindLabel: 'Terme du glossaire', title: g.term,
                meta: [{ k: 'Domaine', v: g.domain || '' }, { k: '', v: (attrs || objs || as) ? 'désigne ' + (((g.attrLinks || []).length) + ((g.boIds || []).length) + ((g.assetIds || []).length)) + ' élément(s)' : 'ne désigne rien pour l\'instant' }],
                acts: v11Acts('term', g.id, g),
                sections: [
                    { t: 'Définition', cls: 'half', html: v11IE('term', g.id, 'definition', g.definition, { type: 'multi', ro: !can.any, placeholder: 'Aucune définition — cliquez pour l\'écrire.' }) },
                    { t: 'Domaine métier', cls: 'half', html: v11IE('term', g.id, 'domain', g.domain, { type: 'select', options: govDomains(), ro: !can.reserved, placeholder: 'Aucun domaine' }) },
                    { t: 'Attributs désignés', cls: 'third', html: attrs ? `<div class="v11-chips">${attrs}</div>` : v11Empty('Aucun attribut') },
                    { t: 'Objets', cls: 'third', html: objs ? `<div class="v11-chips">${objs}</div>` : v11Empty('Aucun objet') },
                    { t: 'Applications et processus', cls: 'third', html: as ? `<div class="v11-chips">${as}</div>` : v11Empty('Aucune') },
                ]
            });
        }
        // ---- Application / processus ----
        function v11AssetRead(a) {
            const can = v11Can('asset', a); const kind = a.kind === 'process' ? 'Processus' : 'Application';
            const objs = (state.governance.businessObjects || []).filter(bo => (bo.producedBy || []).includes(a.id) || (bo.consumedBy || []).includes(a.id) || (typeof appBusinessObjects === 'function' && appBusinessObjects(a).includes(bo)));
            const srcs = (a.sources || []).map(n => v11Chip(n, `v11GoTable('${escapeHTML(n).replace(/'/g, '&#39;')}')`, 'source')).join('');
            const oc = objs.map(bo => v11Chip(bo.name, `v11GoBo('${bo.id}')`, (bo.producedBy || []).includes(a.id) ? 'produit' : ((bo.consumedBy || []).includes(a.id) ? 'consomme' : 'objet'))).join('');
            const apps = (a.appIds || []).map(id => { const x = assetById(id); return x ? v11Chip(x.name, `v11GoAsset('${x.id}')`, 'application') : ''; }).join('');
            const terms = (state.governance.glossary || []).filter(t => (t.assetIds || []).includes(a.id));
            return v11Fiche({
                id: 'v11-asset-' + a.id, icon: a.kind === 'process' ? '⚙️' : '🖥', kindLabel: kind, title: a.name,
                meta: [{ k: 'Domaine', v: a.domain || (typeof assetDomainEff === 'function' ? assetDomainEff(a) : '') }, { k: 'Propriétaire', v: a.owner || '' }, { k: 'Criticité', v: a.criticality || '' }],
                acts: v11Acts('asset', a.id, a),
                sections: [
                    { t: 'Description', cls: 'half', html: v11IE('asset', a.id, 'description', a.description, { type: 'multi', ro: !can.any, placeholder: 'Aucune description — cliquez pour l\'écrire.' }) },
                    { t: 'Propriétaire', cls: 'third', html: v11IE('asset', a.id, 'owner', a.owner, { ro: !can.reserved, placeholder: 'Aucun' }) },
                    { t: 'Criticité', cls: 'third', html: v11IE('asset', a.id, 'criticality', a.criticality, { type: 'select', options: CRITICALITY_OPTS, ro: !can.any, placeholder: 'Non évaluée' }) },
                    { t: 'Domaine métier', cls: 'third', html: v11IE('asset', a.id, 'domain', a.domain, { type: 'select', options: govDomains(), ro: !can.reserved, placeholder: 'Aucun domaine' }) },
                    a.kind === 'app' ? { t: 'Sources produites', n: (a.sources || []).length, cls: 'half', html: srcs ? `<div class="v11-chips">${srcs}</div>` : v11Empty('Aucune source') } : { t: 'Applications du processus', n: (a.appIds || []).length, cls: 'half', html: apps ? `<div class="v11-chips">${apps}</div>` : v11Empty('Aucune application') },
                    { t: 'Objets métier', n: objs.length, cls: 'half', html: oc ? `<div class="v11-chips">${oc}</div>` : v11Empty('Aucun objet') },
                    { t: 'Termes du glossaire', n: terms.length, cls: 'half', html: terms.length ? `<div class="v11-chips">${terms.map(t => v11Chip(t.term, `termTagOpen('${t.id}')`)).join('')}</div>` : v11Empty('Aucun terme') },
                    (a.tables || []).length || (a.columns || []).length ? { t: 'Tables et colonnes utilisées', cls: 'half', html: `<div class="v11-chips">${(a.tables || []).map(n => v11Chip(n, `v11GoTable('${escapeHTML(n).replace(/'/g, '&#39;')}')`, 'table')).join('')}${(a.columns || []).map(c => v11Chip(c.table + '.' + c.col, '', 'colonne')).join('')}</div>` } : null,
                ]
            });
        }
        // ---- Source (table du dictionnaire) ----
        function v11TableRead(tn) {
            const t = tableByName(tn); const d = ensureDictEntry(tn); const ent = { name: tn }; const can = v11Can('table', ent);
            const cols = t ? t.headers : Object.keys(d.columns || {});
            const bos = state.governance.businessObjects || [];
            const fed = cols.map(h => { const at = typeof attrsOfColumn === 'function' ? attrsOfColumn(tn, h) : []; return at.map(x => `<span class="v11-chip" onclick="v11GoBo('${x.bo.id}','${x.r.el.id}','${x.r.stId || ''}')">${escapeHTML(x.r.el.name)}<span class="k">${escapeHTML(x.bo.name)}</span></span>`).join(''); }).filter(Boolean).join('');
            const tbl = `<div class="overflow-x-auto"><table class="v11-tbl"><thead><tr><th>Colonne</th><th>Définition</th><th>Type</th><th>Exemples</th><th>Sensibilité</th><th>Terme(s)</th><th>Alimente</th></tr></thead><tbody>${cols.map(h => { const c = (d.columns || {})[h] || {}; const at = typeof attrsOfColumn === 'function' ? attrsOfColumn(tn, h) : []; const tt = (typeof attrsOfColumn === 'function' && typeof termsOfAttr === 'function') ? Array.from(new Set(at.flatMap(x => termsOfAttr(x.bo.id, x.r.el.id).map(z => z.term)))) : [];
                return `<tr class="click" onclick="v11State.edit['table:${escapeHTML(tn).replace(/'/g, '&#39;')}']=true; renderGovernance()" title="Ouvrir le formulaire"><td><b>${escapeHTML(h)}</b></td><td>${v11Dash(c.definition)}</td><td class="dim">${v11Dash(c.technicalType)}</td><td class="dim">${v11Dash(c.examples)}</td><td>${v11Dash(c.sensitivity)}</td><td>${tt.length ? tt.map(escapeHTML).join(', ') : '<span class="dim">—</span>'}</td><td>${at.length ? at.map(x => escapeHTML(x.bo.name + ' › ' + x.r.el.name)).join('<br>') : '<span class="dim">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
            const owner = typeof appOwnerOfSource === 'function' ? appOwnerOfSource(tn) : null;
            return v11Fiche({
                id: 'v11-table-' + escapeHTML(tn).replace(/[^a-zA-Z0-9_-]/g, '_'), icon: '▦', kindLabel: 'Source (table technique)', title: tn,
                meta: [{ k: 'Domaine', v: t ? (t.theme || '') : '' }, { k: 'Propriétaire', v: d.owner || '' }, { k: 'Référent', v: d.steward || '' }, { k: 'Statut', v: d.status || '' }, { k: '', v: cols.length + ' colonne(s)' + (t && t.lastRows != null ? ' · ' + t.lastRows.toLocaleString('fr-FR') + ' ligne(s)' : '') }],
                acts: [can.any ? `<button class="v11-btn pri" onclick="v11State.edit['table:${escapeHTML(tn).replace(/'/g, '&#39;')}']=true; renderGovernance()" title="Ouvrir le formulaire complet">✎ Modifier</button>` : '<span class="text-[11px] text-slate-500">🔒 lecture seule</span>', `<button class="v11-btn" onclick="v11Fs('#v11-table-${escapeHTML(tn).replace(/[^a-zA-Z0-9_-]/g, '_')}','${escapeHTML(tn).replace(/'/g, '&#39;')}')" title="Plein écran (F)">⛶</button>`, `<button class="v11-btn" onclick="v11Print('table','${escapeHTML(tn).replace(/'/g, '&#39;')}')" title="Imprimer ou enregistrer en PDF">🖨</button>`],
                sections: [
                    { t: 'Description', cls: 'half', html: v11IE('table', tn, 'description', d.description, { type: 'multi', ro: !can.any, placeholder: 'Aucune description — cliquez pour l\'écrire.' }) },
                    { t: 'Propriétaire', cls: 'third', html: v11IE('table', tn, 'owner', d.owner, { ro: !can.reserved, placeholder: 'Aucun' }) },
                    { t: 'Référent', cls: 'third', html: v11IE('table', tn, 'steward', d.steward, { ro: !can.any, placeholder: 'Aucun' }) },
                    { t: 'Domaine métier', cls: 'third', html: v11IE('table', tn, 'theme', t ? t.theme : '', { type: 'select', options: govDomains(), ro: !can.reserved, placeholder: 'Aucun domaine' }) },
                    { t: 'Application source', cls: 'half', html: owner ? `<div class="v11-chips">${v11Chip(owner.name, `v11GoAsset('${owner.id}')`, 'produit par')}</div>` : v11IE('table', tn, 'sourceSystem', d.sourceSystem, { ro: !can.any, placeholder: 'Non renseignée' }) },
                    { t: 'Attributs alimentés', cls: 'half', html: fed ? `<div class="v11-chips">${fed}</div>` : v11Empty('Aucun attribut d\'objet ne s\'appuie sur cette source') },
                    { t: 'Colonnes', n: cols.length, html: tbl },
                ]
            });
        }
        // ---- Application du mode lecture après rendu (termes, applications, dictionnaire) ----
        function v11ApplyReadMode() {
            if (currentTab !== 9) return;
            const c = el('govContent'); if (!c) return;
            if (govState.tab === 'objects' && govState.selectedBoId && v11State.lineage[govState.selectedBoId] && !v11Editing('bo:' + govState.selectedBoId) && el('attrLineageBox') && !el('attrLineageBox').querySelector('svg')) { try { openBoLineage(govState.selectedBoId); } catch (e) {} }
            if (govState.tab === 'dictionary' && govState.dictMode === 'bo' && govState.dictBoId) v11ReadifyDictBo(c);
            if (govState.tab === 'glossary' && (govState.glossView || 'terms') === 'terms') {
                const terms = state.governance.glossary || []; const cards = terms.map(g => el('gl-card-' + g.id)).filter(Boolean); if (!cards.length) return;
                if (govState.glossFocus && terms.some(t => t.id === govState.glossFocus)) v11State.selTerm = govState.glossFocus;
                if (!v11State.selTerm || !terms.some(t => t.id === v11State.selTerm)) v11State.selTerm = terms[0].id;
                cards[0].insertAdjacentHTML('beforebegin', v11ListBarHtml('termQ', 'gl-card-', terms.length, 'Filtrer les termes…'));
                terms.forEach(g => { const card = el('gl-card-' + g.id); if (!card) return; card.dataset.q = catNorm(g.term + ' ' + (g.definition || '') + ' ' + (g.domain || ''));
                    if (v11Editing('term:' + g.id)) { if (!card.querySelector('.v11-editbar')) card.insertAdjacentHTML('afterbegin', v11EditBar('term', g.id, 'du terme « ' + g.term + ' »')); return; }
                    card.removeAttribute('data-gov-lock');
                    if (g.id === v11State.selTerm) { card.className = 'mb-3'; card.innerHTML = v11TermRead(g); }
                    else { card.className = 'v11-rowcard'; card.setAttribute('onclick', `v11State.selTerm='${g.id}'; govState.glossFocus='${g.id}'; renderGovernance()`); const n = ((g.attrLinks || []).length) + ((g.boIds || []).length) + ((g.assetIds || []).length); card.innerHTML = `<span>📖</span><span class="nm">${escapeHTML(g.term)}</span><span class="sub">${escapeHTML([g.domain, n ? 'désigne ' + n + ' élément(s)' : 'ne désigne rien', (g.definition || '').slice(0, 60)].filter(Boolean).join(' · '))}</span><span class="ar">›</span>`; } });
                v11ListFilter('gl-card-', v11State.termQ);
            } else if (govState.tab === 'assets') {
                const assets = state.governance.assets || []; if (!assets.length) return;
                if (!v11State.selAsset || !assets.some(a => a.id === v11State.selAsset)) v11State.selAsset = assets[0].id;
                let first = null;
                assets.forEach(a => { const inp = c.querySelector(`input[onchange^="updateGovAsset('${a.id}','name'"]`); if (!inp) return; const card = inp.closest('.rounded-xl'); if (!card) return; if (!first) first = card;
                    card.id = 'v11-as-' + a.id; card.dataset.q = catNorm(a.name + ' ' + (a.description || '') + ' ' + (a.domain || ''));
                    if (v11Editing('asset:' + a.id)) { if (!card.querySelector('.v11-editbar')) card.insertAdjacentHTML('afterbegin', v11EditBar('asset', a.id, (a.kind === 'process' ? 'du processus « ' : 'de l\'application « ') + a.name + ' »')); return; }
                    card.removeAttribute('data-gov-lock');
                    if (a.id === v11State.selAsset) { card.className = 'mb-3'; card.innerHTML = v11AssetRead(a).replace('class="v11-fiche"', 'class="v11-fiche narrow"'); }
                    else { card.className = 'v11-rowcard'; card.setAttribute('onclick', `v11State.selAsset='${a.id}'; renderGovernance()`); const u = typeof assetUsage === 'function' ? assetUsage(a) : { srcs: [], bos: [], procs: [] }; card.innerHTML = `<span>${a.kind === 'process' ? '⚙️' : '🖥'}</span><span class="nm">${escapeHTML(a.name)}</span><span class="sub">${escapeHTML([a.domain, a.criticality, (u.srcs.length ? u.srcs.length + ' source(s)' : ''), (u.bos.length ? u.bos.length + ' objet(s)' : '')].filter(Boolean).join(' · '))}</span><span class="ar">›</span>`; } });
                const grid = first ? first.closest('.grid') : null; if (grid && !grid.previousElementSibling?.classList?.contains('v11-listbar')) grid.insertAdjacentHTML('beforebegin', v11ListBarHtml('assetQ', 'v11-as-', assets.length, 'Filtrer les applications et processus…'));
                v11ListFilter('v11-as-', v11State.assetQ);
                const imp = el('impactResult'); const impBlock = imp ? imp.parentElement : null;
                if (impBlock && !impBlock.dataset.v11c) { impBlock.dataset.v11c = '1'; impBlock.style.display = v11State.impactOpen ? '' : 'none'; impBlock.insertAdjacentHTML('beforebegin', `<div class="v11-collapse"><div class="hd2" data-ro="keep" onclick="v11State.impactOpen=!v11State.impactOpen; renderGovernance()"><span>🚨 Analyse d'impact</span><span class="ch">${v11State.impactOpen ? '▾ masquer' : '▸ « si cette donnée a un problème, qui est touché ? »'}</span></div></div>`); }
                const para = Array.from(c.children).find(n => n.tagName === 'P' && /Le socle du modèle/.test(n.textContent)); if (para) para.style.display = 'none';
            } else if (govState.tab === 'dictionary' && govState.dictMode === 'table' && govState.dictTable) {
                const sel = el('dict-domain'); const wrap = sel ? sel.closest('#govContent > div') : null; if (!wrap) return;
                const tn = govState.dictTable;
                if (v11Editing('table:' + tn)) { if (!wrap.querySelector('.v11-editbar')) wrap.insertAdjacentHTML('afterbegin', `<div class="v11-editbar" data-ro="keep"><span>✎ <b>Modification</b> de la source « ${escapeHTML(tn)} »</span><span class="flex-grow"></span><button class="v11-btn pri sm" onclick="v11State.edit['table:${escapeHTML(tn).replace(/'/g, '&#39;')}']=false; renderGovernance()">✓ Terminer</button></div>`); return; }
                wrap.removeAttribute('data-gov-lock'); wrap.innerHTML = v11TableRead(tn);
            }
        }
        function v11ListBarHtml(qKey, prefix, n, ph) { return `<div class="v11-listbar" data-ro="keep"><input type="text" value="${escapeHTML(v11State[qKey] || '')}" placeholder="${ph}" oninput="v11State['${qKey}']=this.value; v11ListFilter('${prefix}', this.value)" aria-label="Filtrer"><span class="n">${n} au total · cliquez une ligne pour ouvrir sa fiche</span></div>`; }
        function v11ListFilter(prefix, q) { q = catNorm(q || ''); document.querySelectorAll('[id^="' + prefix + '"]').forEach(card => { if (card.dataset.q === undefined) return; card.style.display = (!q || card.dataset.q.includes(q)) ? '' : 'none'; }); }
        // Lecture générique d'un formulaire V7 : chaque champ devient sa valeur (ou « — »), les boutons
        // d'écriture disparaissent ; une barre propose « Modifier ». Utilisé pour le dictionnaire par objet.
        function v11Readify(root, key, label, canEdit) {
            root.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea').forEach(n => {
                if (n.closest('[data-ro="keep"]')) return;
                let v = n.tagName === 'SELECT' ? ((n.options[n.selectedIndex] || {}).textContent || '').trim() : String(n.value || '').trim();
                if (/^[—(]/.test(v)) v = '';
                const sp = document.createElement('span'); sp.className = 'v11-val' + (v ? '' : ' empty'); sp.textContent = v || '—'; n.replaceWith(sp);
            });
            root.querySelectorAll('button, input[type=checkbox]').forEach(n => { if (!n.closest('[data-ro="keep"]')) n.remove(); });
            root.insertAdjacentHTML('afterbegin', `<div class="v11-editbar" data-ro="keep"><span>👁 <b>Lecture</b> ${escapeHTML(label)}</span><span class="flex-grow"></span>${canEdit ? `<button class="v11-btn pri sm" onclick="v11State.edit['${key}']=true; renderGovernance()">✎ Modifier</button>` : '<span class="text-[11px] text-slate-500">🔒 lecture seule</span>'}</div>`);
        }
        function v11ReadifyDictBo(c) {
            const bo = (state.governance.businessObjects || []).find(b => b.id === govState.dictBoId); if (!bo) return;
            const key = 'dictbo:' + bo.id; const sel = c.querySelector('select[onchange^="govState.dictBoId"]'); const wrap = sel ? sel.closest('#govContent > div') : null; if (!wrap) return;
            if (v11Editing(key)) { if (!wrap.querySelector('.v11-editbar')) wrap.insertAdjacentHTML('afterbegin', v11EditBar('dictbo', bo.id, 'du dictionnaire de « ' + bo.name + ' »')); return; }
            v11Readify(wrap, key, 'du dictionnaire de « ' + bo.name + ' »', v11Can('bo', bo).any);
        }
        // ---- Suppression : confirmation puis notification avec « Annuler » ----
        [['removeBusinessObject', id => ((state.governance.businessObjects || []).find(b => b.id === id) || {}).name, 'l\'objet', () => state.governance.businessObjects], ['removeGlossaryTerm', id => ((state.governance.glossary || []).find(t => t.id === id) || {}).term, 'le terme', () => state.governance.glossary], ['removeGovAsset', id => (assetById(id) || {}).name, 'l\'application ou le processus', () => state.governance.assets]].forEach(([nm, nameOf, what, coll]) => {
            const o = window[nm]; if (typeof o !== 'function') return;
            window[nm] = function (id) { const name = nameOf(id); if (name && !_govBypass && !confirm('Supprimer ' + what + ' « ' + name + ' » ?')) return; const before = (coll() || []).length; const r = o.apply(this, arguments); if (name && (coll() || []).length < before) v11Toast('« ' + name + ' » supprimé(e).', 'info', { action: () => v11Undo(), actionLabel: '⟲ Annuler' }); return r; };
        });
        // ---- Fiche complète depuis le catalogue ----
        if (typeof catOpenFiche === 'function') { const _v11_cof = catOpenFiche; catOpenFiche = function () { const r = _v11_cof.apply(this, arguments); const e2 = _catFicheCtx; const foot = el('uxDrawerFoot'); if (e2 && e2.bo && foot && !foot.querySelector('.v11-fullbtn')) foot.insertAdjacentHTML('afterbegin', `<button data-ro="keep" class="v11-fullbtn flex-1 bg-white border border-slate-300 rounded-lg py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" onclick="closeUxDrawer(); v11State.edit['bo:${e2.bo}']=false; v11GoBo('${e2.bo}')">📄 Fiche complète</button>`); return r; }; }
        // ---- Dupliquer ----
        function v11Duplicate(kind, id) {
            const g = state.governance; const clone = o => JSON.parse(JSON.stringify(o));
            if (kind === 'bo') {
                const bo = (g.businessObjects || []).find(b => b.id === id); if (!bo) return;
                if (typeof govFeatureOn === 'function' && govFeatureOn() && !govCanEdit(boDomainOf(bo)) && !govCanPropose(boDomainOf(bo))) return showError('Lecture seule sur ce domaine.');
                const n = clone(bo); n.id = 'bo_' + generateId(); n.name = bo.name + ' (copie)'; n.status = 'Brouillon'; delete n.history;
                (n.elements || []).forEach(e => { e.id = 'be_' + generateId(); }); (n.structure || []).forEach(st => { st.id = 'st_' + generateId(); (st.elements || []).forEach(e => { e.id = 'fe_' + generateId(); }); });
                g.businessObjects.push(n); persistAppState(); v11State.edit['bo:' + n.id] = true; govState.selectedBoId = n.id; govState.boSel = null; openGovTab('objects'); v11Toast('Objet dupliqué : « ' + n.name + ' ». Renommez-le.', 'ok');
            } else if (kind === 'term') {
                const t = (g.glossary || []).find(x => x.id === id); if (!t) return; const n = clone(t); n.id = 'gl_' + generateId(); n.term = t.term + ' (copie)'; n.attrLinks = []; n.boIds = []; n.assetIds = []; n.links = []; g.glossary.push(n); persistAppState(); v11State.edit['term:' + n.id] = true; termTagOpen(n.id); v11Toast('Terme dupliqué : « ' + n.term + ' ».', 'ok');
            } else if (kind === 'asset') {
                const a = assetById(id); if (!a) return; const n = clone(a); n.id = 'as_' + generateId(); n.name = a.name + ' (copie)'; n.sources = []; delete n.history; g.assets.push(n); persistAppState(); v11State.edit['asset:' + n.id] = true; v11GoAsset(n.id); v11Toast('Copie créée : « ' + n.name + ' » (sans ses sources : une source n\'a qu\'un producteur).', 'ok');
            }
        }
        // ---- Impression / PDF ----
        function v11Print(kind, id) {
            let html = '';
            if (kind === 'bo') { const bo = (state.governance.businessObjects || []).find(b => b.id === id); if (bo) html = v11BoRead(bo); }
            else if (kind === 'term') { const t = (state.governance.glossary || []).find(x => x.id === id); if (t) html = v11TermRead(t); }
            else if (kind === 'asset') { const a = assetById(id); if (a) html = v11AssetRead(a); }
            else if (kind === 'table') html = v11TableRead(id);
            if (!html) return;
            let area = el('v11PrintArea'); if (!area) { area = document.createElement('div'); area.id = 'v11PrintArea'; document.body.appendChild(area); }
            area.innerHTML = `<div style="font-family:system-ui,sans-serif;font-size:12px;color:#64748b;margin-bottom:10px">Studio Data · ${new Date().toLocaleString('fr-FR')}</div>` + html;
            area.querySelectorAll('[id]').forEach(n => n.removeAttribute('id')); area.querySelectorAll('.acts').forEach(n => n.remove());
            setTimeout(() => { try { window.print(); } catch (e) {} }, 50);
            return html;
        }
        // Un objet fraîchement créé s'ouvre en modification.
        ['addBusinessObject', 'createObjectFromAttribute', 'generateObjectFromDesign'].forEach(nm => { const o = window[nm]; if (typeof o !== 'function') return; window[nm] = function () { const before = new Set((state.governance.businessObjects || []).map(b => b.id)); const r = o.apply(this, arguments); let any = false; (state.governance.businessObjects || []).forEach(b => { if (!before.has(b.id)) { v11State.edit['bo:' + b.id] = true; any = true; } }); if (any && currentTab === 9) renderGovernance(); return r; }; });
        const _v11_addGlossaryTerm = addGlossaryTerm; addGlossaryTerm = function () { const before = new Set((state.governance.glossary || []).map(t => t.id)); const r = _v11_addGlossaryTerm.apply(this, arguments); let any = false; (state.governance.glossary || []).forEach(t => { if (!before.has(t.id)) { v11State.edit['term:' + t.id] = true; any = true; } }); if (any) renderGovernance(); return r; };
        const _v11_addGovAsset = addGovAsset; addGovAsset = function () { const before = new Set((state.governance.assets || []).map(a => a.id)); const r = _v11_addGovAsset.apply(this, arguments); let any = false; (state.governance.assets || []).forEach(a => { if (!before.has(a.id)) { v11State.edit['asset:' + a.id] = true; any = true; } }); if (any) renderGovernance(); return r; };
