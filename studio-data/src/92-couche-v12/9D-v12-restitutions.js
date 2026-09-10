        // ======================= V12 : RESTITUTIONS (rapports, tableaux de bord, fichiers livrés) ET LINEAGE REPLIABLE =======================
        // 1) Un troisième type d'actif à côté des applications et des processus : la RESTITUTION — un rapport,
        //    un tableau de bord, un fichier réglementaire ou une extraction livrée. Elle est générée par une
        //    application ou un processus, consomme des objets et des attributs, et est diffusée à des
        //    destinataires (applications, processus, ou des destinataires externes en texte libre).
        //    Elle apparaît dans les usages des attributs, dans les rattachements d'objets, dans les lineages
        //    (objet, attribut, carte des flux) avec sa chaîne complète : objet → restitution → destinataires,
        //    et l'application qui la génère.
        // 2) Lineage repliable : quand un côté du graphe compte trop d'éléments, ils sont regroupés en un
        //    seul nœud (« 5 applications consommatrices ») que l'on ouvre d'un clic ; boutons Tout réduire /
        //    Tout développer et seuil réglable. Moteur inchangé.
        ASSET_KINDS.report = ['📊', 'Restitution'];
        const V12_REP_FREQ = ['', 'Quotidienne', 'Hebdomadaire', 'Mensuelle', 'Trimestrielle', 'Annuelle', 'À la demande', 'Temps réel'];
        const V12_REP_FORMATS = ['', 'Rapport (PDF / Word)', 'Fichier Excel / CSV', 'Tableau de bord', 'Fichier réglementaire', 'Extraction livrée', 'Flux / API', 'Autre'];
        function v12Reports() { return (state.governance.assets || []).filter(a => a.kind === 'report'); }
        function v12RepAdd() { (state.governance.assets = state.governance.assets || []).push({ id: 'as_' + generateId(), kind: 'report', name: 'Nouvelle restitution', owner: '', criticality: 'Moyenne', description: '', domain: '', appIds: [], sources: [], tables: [], columns: [], boIds: [], producedBy: [], deliveredTo: [], recipients: '', frequency: '', format: '' }); persistAppState(); renderGovernance(); }
        function v12RepLink(repId, field, assetId, on) { const a = assetById(repId); if (!a || !assetId) return; a[field] = Array.isArray(a[field]) ? a[field] : []; if (on) { if (!a[field].includes(assetId)) a[field].push(assetId); } else a[field] = a[field].filter(x => x !== assetId); persistAppState(); renderGovernance(); }
        function v12RepAttrUses(rep) { const out = []; (state.governance.businessObjects || []).forEach(bo => (boAllAttrRows(bo) || []).forEach(r => { if ((r.el.usedBy || []).includes(rep.id)) out.push({ bo, r }); })); return out; }
        function v12RepCardHtml(a) {
            const gens = (state.governance.assets || []).filter(x => x.kind !== 'report');
            const _dom = String(a.domain || '').trim(); const _lock = typeof govLockAttr === 'function' ? govLockAttr(govCanEdit(_dom), govCanPropose(_dom)) : '';
            const chips = (field, lbl, cls) => `${(a[field] || []).map(id => { const x = assetById(id); return x ? `<span class="text-xs ${cls} rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-bold">${assetLabel(x)}<button onclick="v12RepLink('${a.id}','${field}','${x.id}',false)" class="opacity-50 hover:opacity-100 hover:text-red-600">✕</button></span>` : ''; }).join('') || `<span class="text-xs text-slate-300 italic">${lbl}</span>`}`;
            const sel = (field, lbl) => { const rem = gens.filter(x => !(a[field] || []).includes(x.id)); return rem.length ? `<select id="v12rep-${field}-${a.id}" class="border border-slate-200 p-1 rounded text-xs bg-white">${rem.map(x => `<option value="${x.id}">${escapeHTML(assetLabel(x))}</option>`).join('')}</select><button onclick="v12RepLink('${a.id}','${field}', el('v12rep-${field}-${a.id}').value, true)" class="text-xs bg-white border border-slate-300 px-2 py-1 rounded font-bold text-slate-600 hover:bg-slate-50">${lbl}</button>` : ''; };
            const uses = v12RepAttrUses(a);
            return `<div${_lock} class="border border-amber-200 rounded-xl p-3 mb-2 bg-amber-50/30 v12rep-card">${_lock ? govLockBand(a.name, _dom) : ''}
                <div class="flex items-center gap-2 mb-1.5"><span>📊</span>
                    <input type="text" value="${escapeHTML(a.name)}" onchange="updateGovAsset('${a.id}','name',this.value)" class="font-bold text-sm border border-slate-300 p-1.5 rounded flex-grow bg-white">
                    <select onchange="updateGovAsset('${a.id}','criticality',this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${CRITICALITY_OPTS.map(o => `<option ${o === (a.criticality || 'Moyenne') ? 'selected' : ''}>${o}</option>`).join('')}</select>
                    <button onclick="removeGovAsset('${a.id}')" class="text-red-500 hover:text-red-700 p-1" title="Supprimer">✕</button></div>
                <div class="flex gap-2 mb-1.5 flex-wrap">
                    <input type="text" value="${escapeHTML(a.owner || '')}" placeholder="Responsable de la restitution" onchange="updateGovAsset('${a.id}','owner',this.value)" class="border border-slate-200 p-1.5 rounded text-xs bg-white w-44">
                    <input type="text" value="${escapeHTML(a.domain || '')}" list="assetDomList" placeholder="Domaine métier" onchange="updateGovAsset('${a.id}','domain',this.value)" class="border border-slate-200 p-1.5 rounded text-xs bg-white w-40">
                    <select onchange="updateGovAsset('${a.id}','frequency',this.value)" class="border border-slate-200 p-1.5 rounded text-xs bg-white" title="Fréquence de production">${V12_REP_FREQ.map(o => `<option value="${o}" ${o === (a.frequency || '') ? 'selected' : ''}>${o || 'Fréquence…'}</option>`).join('')}</select>
                    <select onchange="updateGovAsset('${a.id}','format',this.value)" class="border border-slate-200 p-1.5 rounded text-xs bg-white" title="Forme de la restitution">${V12_REP_FORMATS.map(o => `<option value="${o}" ${o === (a.format || '') ? 'selected' : ''}>${o || 'Forme…'}</option>`).join('')}</select>
                    <input type="text" value="${escapeHTML(a.description || '')}" placeholder="Description : à quoi sert cette restitution…" onchange="updateGovAsset('${a.id}','description',this.value)" class="border border-slate-200 p-1.5 rounded text-xs bg-white flex-grow min-w-[160px]">
                </div>
                <div class="flex flex-wrap items-center gap-1.5 mb-1.5"><span class="text-[10px] uppercase font-bold text-slate-400">🖥 Générée par</span>${chips('producedBy', 'aucune application ni processus', 'bg-slate-100 border border-slate-300 text-slate-700')}${sel('producedBy', 'Relier')}</div>
                ${boAttachHtml('as', a)}
                <div class="flex flex-wrap items-center gap-1.5 mb-1.5"><span class="text-[10px] uppercase font-bold text-amber-700">📤 Diffusée à</span>${chips('deliveredTo', 'aucun destinataire interne', 'bg-amber-50 border border-amber-300 text-amber-800')}${sel('deliveredTo', 'Ajouter')}<input type="text" value="${escapeHTML(a.recipients || '')}" placeholder="Destinataires externes : ACPR, direction financière…" onchange="updateGovAsset('${a.id}','recipients',this.value)" class="border border-slate-200 p-1 rounded text-xs bg-white flex-grow min-w-[180px]"></div>
                <div class="flex flex-wrap items-center gap-1.5 mb-1.5"><span class="text-[10px] uppercase font-bold text-indigo-600">📖 Termes du glossaire</span>${termTagsHtml('asset', { assetId: a.id })}</div>
                <div class="text-[11px] text-slate-500">${uses.length ? `utilise <b>${uses.length} attribut(s)</b> : ${uses.slice(0, 6).map(u => escapeHTML(u.bo.name + ' › ' + u.r.el.name)).join(', ')}${uses.length > 6 ? '…' : ''}` : '<span class="italic text-slate-300">aucun attribut coché — dans la fiche d\'un attribut, section « Usages », cochez cette restitution</span>'}</div>
            </div>`;
        }
        Studio.extend('renderGovAssets', (_v12repAssets) => function () {
            let h = _v12repAssets.apply(this, arguments);
            try {
                const list = v12Reports();
                const blk = `<div class="mt-5 v12rep-sect"><div class="flex items-center justify-between mb-2"><h3 class="text-sm font-bold text-slate-700">📊 Restitutions (${list.length}) <span class="text-[11px] font-normal text-slate-500">— rapports, tableaux de bord, fichiers réglementaires, extractions livrées : ce qui sort des données</span></h3><button onclick="v12RepAdd()" class="bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">+ Restitution</button></div>
                    <p class="text-[11.5px] text-slate-500 mb-2">Une restitution est <b>générée par</b> une application ou un processus, <b>utilise</b> des objets et des attributs (cochez-la dans les usages des attributs), et est <b>diffusée</b> à des destinataires. Le lineage montre alors la chaîne complète : source → objet → restitution → destinataire.</p>
                    ${list.length ? list.map(v12RepCardHtml).join('') : '<p class="text-xs text-slate-400 italic py-4 text-center border border-dashed border-amber-200 rounded-lg">Aucune restitution déclarée.</p>'}</div>`;
                h += blk;
            } catch (e) { console.warn('v12 restitutions', e); }
            return h;
        });
        // ---- graphes : style des restitutions et chaîne complète (générée par → restitution → diffusée à) ----
        function v12RepStyle(n) { n.fill = '#fef3c7'; n.stroke = '#d97706'; return n; }
        function v12RepExtend(gr) {
            const has = id => gr.nodes.some(n => n.id === id); const edge = (s, t) => gr.edges.some(e => e.source === s && e.target === t);
            const node = a => ({ id: 'as:' + a.id, type: 'studio-rich-node', title: assetLabel(a), content: a.kind === 'process' ? 'processus' : (a.criticality || 'application'), fill: a.kind === 'process' ? '#ffedd5' : '#e2e8f0', stroke: a.kind === 'process' ? '#ea580c' : '#334155' });
            gr.nodes.forEach(n => {
                const m = /^(?:as|use):(.+)$/.exec(n.id); if (!m) return; const a = assetById(m[1]); if (!a || a.kind !== 'report') return;
                v12RepStyle(n); n.title = '📊 ' + a.name; n.content = ['restitution', a.frequency ? a.frequency.toLowerCase() : '', a.format || ''].filter(Boolean).join(' · ');
                (a.producedBy || []).forEach(id => { const g2 = assetById(id); if (!g2) return; const gid = 'as:' + g2.id; if (!has(gid)) gr.nodes.push(node(g2)); if (!edge(gid, n.id)) gr.edges.push({ id: 'v12rg' + g2.id + '>' + a.id, source: gid, target: n.id, label: 'génère', style: { stroke: '#d97706', lineWidth: 1.5, endArrow: { path: '', fill: '#d97706' } } }); });
                (a.deliveredTo || []).forEach(id => { const d2 = assetById(id); if (!d2) return; const did = 'as:' + d2.id; if (!has(did)) gr.nodes.push(d2.kind === 'report' ? v12RepStyle(node(d2)) : node(d2)); if (!edge(n.id, did)) gr.edges.push({ id: 'v12rd' + a.id + '>' + d2.id, source: n.id, target: did, label: 'diffusée à', style: { stroke: '#d97706', lineWidth: 1.5, endArrow: { path: '', fill: '#d97706' } } }); });
                if ((a.recipients || '').trim()) { const rid = 'rcp:' + a.id; if (!has(rid)) gr.nodes.push({ id: rid, type: 'studio-rich-node', title: '📤 ' + a.recipients.trim(), content: 'destinataires externes', fill: '#fff7ed', stroke: '#d97706' }); if (!edge(n.id, rid)) gr.edges.push({ id: 'v12rr' + a.id, source: n.id, target: rid, label: 'diffusée à', style: { stroke: '#d97706', lineDash: [4, 3], endArrow: { path: '', fill: '#d97706' } } }); }
            });
            return gr;
        }
        Studio.extend('buildBoLineageGraph', (_v12repBo) => function () { const gr = _v12repBo.apply(this, arguments); try { v12RepExtend(gr); } catch (e) {} return gr; });
        Studio.extend('buildAttrLineageGraph', (_v12repAttr) => function () { const gr = _v12repAttr.apply(this, arguments); try { v12RepExtend(gr); } catch (e) {} return gr; });
        // carte des flux : les restitutions y entrent avec leur chaîne
        function v12RepMapEdges(d) {
            if (!d || !Array.isArray(d.nodes)) return; const ids = () => new Set(d.nodes.map(n => n.id)); const has = (s, t) => d.edges.some(e => e.source === s && e.target === t);
            v12Reports().forEach(a => {
                const rid = 'as:' + a.id; const links = [];
                (state.governance.businessObjects || []).forEach(bo => { const n = (boAllAttrRows(bo) || []).filter(r => (r.el.usedBy || []).includes(a.id)).length; if (n || (a.boIds || []).includes(bo.id)) links.push(['bo:' + bo.id, rid, n ? 'utilise ' + n + ' attribut(s)' : 'utilise']); });
                (a.producedBy || []).forEach(id => links.push(['as:' + id, rid, 'génère'])); (a.deliveredTo || []).forEach(id => links.push([rid, 'as:' + id, 'diffusée à']));
                const present = ids(); const ok = links.filter(([s, t]) => (s === rid ? present.has(t) : present.has(s))); if (!ok.length) return;
                if (!present.has(rid)) d.nodes.push({ id: rid, type: 'studio-rich-node', title: '📊 ' + a.name, content: ['restitution', a.frequency ? a.frequency.toLowerCase() : ''].filter(Boolean).join(' · '), fill: '#fef3c7', stroke: '#d97706' });
                ok.forEach(([s, t, l]) => { if (!has(s, t)) d.edges.push({ id: 'v12rm:' + s + '>' + t, source: s, target: t, label: l, style: { stroke: '#d97706', lineWidth: 1.5, endArrow: { path: '', fill: '#d97706' } } }); });
            });
        }
        Studio.extend('v12OrgLineageEdges', (_v12repOrg) => function (d) { _v12repOrg.apply(this, arguments); try { v12RepMapEdges(d); } catch (e) {} });
        // ---- lineage repliable ----
        v12State.linOpen = v12State.linOpen || new Set(); v12State.linFoldMin = v12State.linFoldMin || 4; v12State.linGroups = {};
        const V12_LIN_KINDS = { application: ['🖥', 'application', 'applications'], process: ['⚙️', 'processus', 'processus'], report: ['📊', 'restitution', 'restitutions'], objet: ['🏛️', 'objet', 'objets'], fichier: ['▦', 'fichier', 'fichiers'], attribut: ['🔹', 'attribut', 'attributs'], colonne: ['▤', 'colonne', 'colonnes'], autre: ['•', 'élément', 'éléments'] };
        function v12LinKind(n) {
            const id = String(n.id); const m = /^(?:as|use):(.+)$/.exec(id.replace(/^o\d+_/, ''));
            if (m) { const a = assetById(m[1]); return a ? (a.kind === 'process' ? 'process' : (a.kind === 'report' ? 'report' : 'application')) : 'application'; }
            if (/^(?:o\d+_)*(?:bo|dep):/.test(id)) return /attr:|dep:/.test(id) ? 'attribut' : 'objet';
            if (/attr:/.test(id)) return 'attribut'; if (/^(?:o\d+_)*tbl:/.test(id)) return 'fichier'; if (/col:/.test(id)) return 'colonne'; if (/^rcp:/.test(id)) return 'autre';
            return 'autre';
        }
        function v12LinFold(gr, centerId) {
            v12State.linGroups = {}; const min = Math.max(2, v12State.linFoldMin | 0);
            const groups = {};
            gr.nodes.forEach(n => { if (n.id === centerId || n.id === 'nosrc' || n.id === 'nouse') return; const isIn = gr.edges.some(e => e.source === n.id && e.target === centerId), isOut = gr.edges.some(e => e.source === centerId && e.target === n.id); if (!isIn && !isOut) return; const key = (isIn ? 'amont' : 'aval') + ':' + v12LinKind(n); (groups[key] = groups[key] || []).push(n); });
            let nodes = gr.nodes.slice(), edges = gr.edges.slice();
            Object.entries(groups).forEach(([key, members]) => {
                if (members.length < min || v12State.linOpen.has(key)) return;
                const [dir, kind] = key.split(':'); const K = V12_LIN_KINDS[kind] || V12_LIN_KINDS.autre; const gid = 'grp:' + key; const ids = new Set(members.map(m => m.id));
                v12State.linGroups[key] = members.map(m => m.id);
                const names = members.map(m => String(m.title).replace(/^[^\wÀ-ÿ]+\s*/, ''));
                nodes = nodes.filter(n => !ids.has(n.id));
                nodes.push({ id: gid, type: 'studio-rich-node', title: '⊞ ' + members.length + ' ' + (members.length > 1 ? K[2] : K[1]) + (dir === 'amont' ? ' en amont' : ' en aval'), content: names.slice(0, 3).join(', ') + (names.length > 3 ? ' … (+' + (names.length - 3) + ')' : '') + ' — cliquer pour ouvrir', fill: '#f1f5f9', stroke: '#64748b' });
                const merged = new Map();
                edges = edges.filter(e => { const s = ids.has(e.source) ? gid : e.source, t = ids.has(e.target) ? gid : e.target; if (s === e.source && t === e.target) return true; if (s === t) return false; const k = s + '>' + t; const m = merged.get(k); if (m) { m.n++; if (m.label !== e.label) m.mixed = true; return false; } merged.set(k, { e: Object.assign({}, e, { id: 'g' + e.id, source: s, target: t }), n: 1, label: e.label, mixed: false }); return false; });
                merged.forEach(m => { m.e.label = m.n > 1 ? (m.mixed ? m.n + ' liens' : (m.label ? m.label + ' ×' + m.n : m.n + ' liens')) : m.label; edges.push(m.e); });
            });
            return { nodes, edges };
        }
        function v12LinToggle(key) { if (v12State.linOpen.has(key)) v12State.linOpen.delete(key); else v12State.linOpen.add(key); v12LinRedraw(); }
        function v12LinAll(open) { if (open) { v12State.linOpenAll = true; } else { v12State.linOpenAll = false; v12State.linOpen = new Set(); } v12LinRedraw(); }
        function v12LinSetMin(v) { v12State.linFoldMin = Math.max(2, parseInt(v) || 4); v12State.linOpenAll = false; v12State.linOpen = new Set(); v12LinRedraw(); }
        function v12LinRedraw() { if (typeof _lineageRedraw === 'function') _lineageRedraw(); }
        function v12LinBarHtml(gr, centerId) {
            const nGroups = Object.keys(v12State.linGroups).length;
            return `<span class="v12lf-bar" data-ro="keep" title="Regrouper les éléments trop nombreux d'un même type pour garder le graphe lisible ; cliquer un groupe l'ouvre">
                <button onclick="v12LinAll(false)" ${nGroups || v12State.linOpenAll || v12State.linOpen.size ? '' : 'disabled'}>⊟ Réduire</button><button onclick="v12LinAll(true)">⊞ Tout développer</button>
                <label>à partir de <select onchange="v12LinSetMin(this.value)">${[2, 3, 4, 6, 8, 12].map(n => `<option ${n === v12State.linFoldMin ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${nGroups ? `<span class="n">${nGroups} groupe(s)</span>` : ''}</span>`;
        }
        function v12LinRender(wrap, gr, centerId) {
            const folded = v12State.linOpenAll ? (v12State.linGroups = {}, gr) : v12LinFold(gr, centerId);
            const box = el('attrLineageBox'); const head = box && box.firstElementChild; const old = box && box.querySelector('.v12lf-bar'); if (old) old.remove();
            if (head) { const host = head.lastElementChild || head; host.insertAdjacentHTML('afterbegin', v12LinBarHtml(gr, centerId)); }
            const nIn = folded.edges.filter(e => e.target === centerId).length, nOut = folded.edges.filter(e => e.source === centerId).length;
            wrap.style.height = Math.min(760, Math.max(300, 52 * Math.max(nIn, nOut, 3) + 40)) + 'px'; wrap.classList.remove('h-[300px]');
            if (attrLineageGraph) { try { attrLineageGraph.destroy(); } catch (e) {} }
            attrLineageGraph = createSvgGraph(wrap); attrLineageGraph.data(folded); attrLineageGraph.render(); attrLineageGraph.fitView(20);
            try { attrLineageGraph.on('node:click', ev => { const id = ev && ev.item && ev.item.getID ? ev.item.getID() : (ev && ev.id); if (id && String(id).startsWith('grp:')) v12LinToggle(String(id).slice(4)); }); } catch (e) {}
            return folded;
        }
        Studio.extend('openBoLineage', (_v12repOpenBo) => function (boId) {
            const r = _v12repOpenBo.apply(this, arguments);
            try { const bo = (state.governance.businessObjects || []).find(x => x.id === boId); const wrap = el('attrLineageWrap'); if (bo && wrap) v12LinRender(wrap, buildBoLineageGraph(bo), 'bo:' + bo.id); } catch (e) { console.warn('v12 lineage repliable', e); }
            return r;
        });
        Studio.extend('openAttrLineage', (_v12repOpenAttr) => function (boId, stId, elId) {
            const r = _v12repOpenAttr.apply(this, arguments);
            try {
                const bo = (state.governance.businessObjects || []).find(x => x.id === boId); const wrap = el('attrLineageWrap'); if (!bo || !wrap) return r;
                const st = stId ? getBoFacets(bo).find(x => x.id === stId) : null; const e2 = st ? (st.elements || []).find(x => x.id === elId) : (bo.elements || []).find(x => x.id === elId); if (!e2) return r;
                v12LinRender(wrap, buildAttrLineageGraph(bo, st, e2), 'attr:' + e2.id);
            } catch (e) { console.warn('v12 lineage repliable', e); }
            return r;
        });
        // ---- fiche en lecture (V11), synthèse, recherche, lexique ----
        Studio.extend('v11AssetRead', (_v12repRead) => function (a) { let h = _v12repRead.apply(this, arguments); if (a && a.kind === 'report') { h = h.replace('🖥', '📊').replace('>Application<', '>Restitution<'); const gens = (a.producedBy || []).map(id => assetById(id)).filter(Boolean).map(x => escapeHTML(assetLabel(x))).join(', '); const dst = (a.deliveredTo || []).map(id => assetById(id)).filter(Boolean).map(x => escapeHTML(assetLabel(x))).join(', '); h += `<div class="v12rep-read"><b>📊 Restitution</b> · générée par : ${gens || '<i>non renseigné</i>'} · diffusée à : ${[dst, escapeHTML(a.recipients || '')].filter(Boolean).join(', ') || '<i>non renseigné</i>'}${a.frequency ? ' · ' + escapeHTML(a.frequency.toLowerCase()) : ''}${a.format ? ' · ' + escapeHTML(a.format) : ''} · utilise ${v12RepAttrUses(a).length} attribut(s)</div>`; } return h; });
        Studio.extend('v12BoLinSynth', (_v12repSynth) => function (bo, gr) { const rows = _v12repSynth.apply(this, arguments); rows.forEach(r => { const m = /^(?:as|use):(.+)$/.exec(r.id); const a = m && assetById(m[1]); if (a && a.kind === 'report') r.kind = 'restitution'; if (/^rcp:/.test(r.id)) r.kind = 'destinataires'; }); return rows; });
        // catalogue : sous-titre « Restitution » au lieu de « Application »
        Studio.extend('catBuildIndex', (_v12repIdx) => function () { const ix = _v12repIdx.apply(this, arguments); try { (ix || []).forEach(e => { if (e.type !== 'asset') return; const a = assetById(e.id); if (a && a.kind === 'report') { e.sub = 'Restitution' + (a.frequency ? ' · ' + a.frequency.toLowerCase() : '') + (a.format ? ' · ' + a.format : ''); e.tags = (e.tags || []).map(t => t === 'application' ? 'restitution' : t); } }); } catch (e) {} return ix; });
        // export en masse : type « restitution » ; import : une ligne « restitution » redevient une restitution
        Studio.extend('giTemplateRows', (_v12repTpl) => function (target) { const out = _v12repTpl.apply(this, arguments); try { if (target === 'assets' && Array.isArray(out)) { const g = state.governance; const rows = [out[0]]; (g.assets || []).forEach(a => rows.push([a.name, a.kind === 'process' ? 'processus' : (a.kind === 'report' ? 'restitution' : 'application'), a.criticality || '', a.description || '', a.owner || '', a.domain || '', (a.appIds || []).map(id => (assetById(id) || {}).name).filter(Boolean).join(' ; ')])); if (rows.length === 1) return out; return rows; } } catch (e) {} return out; });
        Studio.extend('giApply', (_v12repApply) => function () { const r = _v12repApply.apply(this, arguments); try { if (giState && giState.target === 'assets') (giState.rows || []).forEach(row => { const k = typeof giVal === 'function' ? giVal(row, 'kind') : ''; const nm = typeof giVal === 'function' ? giVal(row, 'name') : ''; if (/restit|rapport|tableau de bord/i.test(k) && nm) { const a = (state.governance.assets || []).find(x => giNorm(x.name) === giNorm(nm)); if (a && a.kind !== 'report') { a.kind = 'report'; a.producedBy = a.producedBy || []; a.deliveredTo = a.deliveredTo || []; } } }); persistAppState(); } catch (e) {} return r; });
        // dossier de gouvernance : section « Restitutions » et origines des attributs
        function v12RepDossierHtml() {
            const reps = v12Reports(); let h = '';
            if (reps.length) h += `<h2 style="font-size:18px;margin:28px 0 8px">📊 Restitutions (${reps.length})</h2><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:6px">Restitution</th><th style="text-align:left;padding:6px">Générée par</th><th style="text-align:left;padding:6px">Diffusée à</th><th style="text-align:left;padding:6px">Fréquence / forme</th><th style="text-align:left;padding:6px">Informations utilisées</th></tr></thead><tbody>${reps.map(a => `<tr><td style="padding:6px;border-top:1px solid #e2e8f0"><b>${escapeHTML(a.name)}</b>${a.description ? '<br><span style="color:#64748b">' + escapeHTML(a.description) + '</span>' : ''}</td><td style="padding:6px;border-top:1px solid #e2e8f0">${(a.producedBy || []).map(id => escapeHTML((assetById(id) || {}).name || '')).filter(Boolean).join(', ') || '—'}</td><td style="padding:6px;border-top:1px solid #e2e8f0">${[...(a.deliveredTo || []).map(id => escapeHTML((assetById(id) || {}).name || '')).filter(Boolean), escapeHTML(a.recipients || '')].filter(Boolean).join(', ') || '—'}</td><td style="padding:6px;border-top:1px solid #e2e8f0">${escapeHTML([a.frequency, a.format].filter(Boolean).join(' · ') || '—')}</td><td style="padding:6px;border-top:1px solid #e2e8f0">${v12RepAttrUses(a).map(u => escapeHTML(u.bo.name + ' › ' + u.r.el.name)).join(', ') || '—'}</td></tr>`).join('')}</tbody></table>`;
            const orgs = []; (state.governance.businessObjects || []).forEach(bo => (boAllAttrRows(bo) || []).forEach(r => (typeof v12OrgList === 'function' ? v12OrgList(r.el) : []).forEach(o => orgs.push({ bo, r, o }))));
            if (orgs.length) h += `<h2 style="font-size:18px;margin:28px 0 8px">🔗 Informations provenant d'un autre objet (${orgs.length})</h2><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:6px">Information</th><th style="text-align:left;padding:6px">Provient de</th><th style="text-align:left;padding:6px">Nature</th><th style="text-align:left;padding:6px">Règle</th></tr></thead><tbody>${orgs.map(x => `<tr><td style="padding:6px;border-top:1px solid #e2e8f0"><b>${escapeHTML(x.bo.name)}</b> › ${escapeHTML(x.r.el.name)}</td><td style="padding:6px;border-top:1px solid #e2e8f0">${escapeHTML(v12OrgLabel(x.o))}</td><td style="padding:6px;border-top:1px solid #e2e8f0">${escapeHTML(v12OrgKindLbl(x.o.kind))}</td><td style="padding:6px;border-top:1px solid #e2e8f0">${escapeHTML(x.o.rule || '')}</td></tr>`).join('')}</tbody></table>`;
            return h;
        }
        function v12WithBlobHook(fn, transform) { const B = window.Blob; window.Blob = function (parts, opts) { try { parts = (parts || []).map(x => typeof x === 'string' ? transform(x) : x); } catch (e) {} return new B(parts, opts); }; try { return fn(); } finally { window.Blob = B; } }
        Studio.extend('exportGovernanceReport', (_v12repDossier) => function () { const args = arguments; return v12WithBlobHook(() => _v12repDossier.apply(this, args), html => html.includes('</body>') ? html.replace('</body>', v12RepDossierHtml() + '</body>') : html); });
        // liste V11 des actifs : icône 📊 sur les lignes des restitutions
        Studio.extend('v11ApplyReadMode', (_v12repRM) => function () { const r = _v12repRM.apply(this, arguments); try { if (currentTab === 9 && govState.tab === 'assets') v12Reports().forEach(a => { const c = el('v11-as-' + a.id); const ic = c && c.classList.contains('v11-rowcard') && c.querySelector(':scope > span'); if (ic && !ic.dataset.v12rep) { ic.dataset.v12rep = '1'; ic.textContent = '📊'; } }); } catch (e) {} return r; });
        Object.assign(V11_LEXIQUE, { 'restitution': 'Ce qui sort des données : rapport, tableau de bord, fichier réglementaire, extraction livrée. Générée par une application ou un processus, elle utilise des objets et des attributs et est diffusée à des destinataires ; le lineage suit la chaîne jusqu\'à eux.', 'groupe (lineage)': 'Nœud qui regroupe plusieurs éléments de même type et de même sens (ex. « 5 applications en aval ») pour garder le graphe lisible ; un clic l\'ouvre.' });
