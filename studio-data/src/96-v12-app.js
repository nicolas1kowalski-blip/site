        // ======================= V12 : L'ERGONOMIE SUR TOUTE L'APPLICATION =======================
        // La couche V11 a rendu la gouvernance lisible ; la V12 applique les mêmes principes aux
        // quatre phases : accueil global, recherche et historique partout, en-têtes et boutons
        // unifiés, textes repliés, barres d'action collantes, vue liste des sources avec actions
        // rapides, plein écran, « et ensuite ? », bandeau moteur, aide et visite étendues.
        // Rien n'est réécrit : on se greffe sur switchTab et sur les fonctions de rendu existantes.
        const v12State = { engineDown: false, engineMsg: '', bandOff: false, srcView: 'cards' };
        const V12_STEPS = { 11: 'Accueil', 1: 'Sources', 10: 'Tables conçues', 2: 'Modèle de données', 16: 'Séries temporelles', 3: 'Extraire', 13: 'Préparation', 14: 'Tableaux de bord', 7: 'Comparer', 6: 'Explorer', 4: 'Statistiques', 5: 'Explorateur 360°', 8: 'Qualité & Audit', 12: 'Règles & score', 15: 'Rapprochement' };
        const V12_NEEDS_DATA = [2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16];
        const V12_NEXT = { 1: [[2, 'Relier les tables'], [8, 'Auditer la qualité'], ['g:dictionary', 'Documenter (dictionnaire)']], 2: [[3, 'Extraire'], ['g:objects', 'Décrire un objet métier'], [10, 'Concevoir une table']], 10: [[2, 'Modèle de données'], [3, 'Extraire']], 16: [[12, 'Règles & score']], 3: [[13, 'Préparer les données'], [14, 'Tableaux de bord'], [7, 'Comparer']], 13: [[3, 'Extraire'], [8, 'Auditer']], 14: [[4, 'Statistiques'], [3, 'Extraire']], 7: [[15, 'Rapprocher'], [8, 'Auditer']], 6: [[8, 'Auditer'], [3, 'Extraire']], 4: [[14, 'Tableaux de bord']], 5: [[2, 'Modèle de données']], 8: [[12, 'Règles & score'], ['g:history', 'Historique'], ['g:dictionary', 'Dictionnaire']], 12: [[8, 'Auditer'], [14, 'Tableaux de bord']], 15: [[10, 'Concevoir une table'], [2, 'Modèle de données']] };
        function v12Ready() { return Object.values(state.tables).filter(t => t.status === 'ready'); }
        function v12Go(t) { if (typeof t === 'string' && t.startsWith('g:')) openGovTab(t.slice(2)); else switchTab(Number(t)); }
        // ---- Navigation : l'accueil global remplace le cockpit, le « home » de la gouvernance devient « Vue d'ensemble » ----
        (function () {
            const data = NAV_PHASES.find(p => p.id === 'data'); const t = data && data.tabs.find(x => x.n === 11); if (t) { t.label = 'Accueil'; t.icon = '🏠'; }
            const gov = NAV_PHASES.find(p => p.id === 'gov'); const h = gov && gov.tabs.find(x => x.g === 'home'); if (h) { h.label = 'Vue d\'ensemble'; h.icon = '🧭'; }
        })();
        // ---- Accueil global ----
        function v12NextSteps() {
            const g = state.governance; const tables = v12Ready(); const out = [];
            if (!tables.length) out.push({ t: 'Chargez une première source', why: 'CSV, Excel, ZIP ou connecteur', go: 'switchTab(1)' });
            if (tables.length >= 2 && !(state.relations || []).length) out.push({ t: 'Reliez vos tables entre elles', why: 'Modèle de données › Déduire les liens', go: 'switchTab(2)' });
            if (tables.length && !(g.qualityHistory || []).length) out.push({ t: 'Lancez un premier audit qualité', why: 'complétude, doublons, anomalies', go: 'switchTab(8)' });
            if (!(g.businessObjects || []).length) out.push({ t: 'Décrivez un premier objet métier', why: 'assistant en trois étapes', go: 'v11WizardOpen()' });
            const noDom = tables.filter(t => !(t.theme || '').trim()); if (noDom.length) out.push({ t: 'Donnez un domaine aux sources qui n\'en ont pas', why: noDom.length + ' source(s)', go: 'switchTab(1)' });
            if ((g.businessObjects || []).some(b => !b.globalOwner)) out.push({ t: 'Désignez les propriétaires manquants', why: (g.businessObjects || []).filter(b => !b.globalOwner).length + ' objet(s)', go: "openGovTab('objects')" });
            if (tables.length && typeof qrRules === 'function' && !qrRules().length) out.push({ t: 'Formalisez une règle de qualité', why: 'score 0–100 suivi dans le temps', go: 'switchTab(12)' });
            if (!(g.people || []).length && (g.businessObjects || []).length) out.push({ t: 'Déclarez les acteurs et leurs rôles', why: 'qui propose, qui valide', go: "openGovTab('people')" });
            if (tables.length && typeof dbList === 'function' && !dbList().length) out.push({ t: 'Composez un tableau de bord', why: 'indicateurs, graphes, alertes', go: 'switchTab(14)' });
            return out.slice(0, 5);
        }
        function v12HomeHtml() {
            const g = state.governance; const tables = v12Ready(); const u = typeof curUser === 'function' ? curUser() : null;
            const rows = tables.reduce((n, t) => n + (t.lastRows || 0), 0); const cols = tables.reduce((n, t) => n + (t.headers || []).length, 0);
            const linked = new Set(); (state.relations || []).forEach(r => { linked.add(r.sourceTable); linked.add(r.targetTable); });
            const unlinked = tables.filter(t => !linked.has(t.id)); const noDom = tables.filter(t => !(t.theme || '').trim()); const noOwner = (g.businessObjects || []).filter(b => !b.globalOwner);
            const oldSrc = tables.filter(t => t.file && t.lastRefresh && Date.now() - t.lastRefresh > 7 * 864e5);
            const lastQ = (g.qualityHistory || [])[0]; const steps = v12NextSteps(); const rec = typeof v11RecentList === 'function' ? v11RecentList() : [];
            const sn = (typeof qrSnapshots !== 'undefined' && qrSnapshots.length) ? qrSnapshots[qrSnapshots.length - 1] : null;
            const pend = typeof propCountPendingFor === 'function' && typeof govFeatureOn === 'function' && govFeatureOn() ? propCountPendingFor() : 0;
            const alerts = [];
            if (unlinked.length) alerts.push({ t: unlinked.length + ' table(s) non reliée(s) au modèle : ' + unlinked.slice(0, 3).map(t => t.name).join(', '), go: 'switchTab(2)' });
            if (noDom.length) alerts.push({ t: noDom.length + ' source(s) sans domaine : ' + noDom.slice(0, 3).map(t => t.name).join(', '), go: 'switchTab(1)' });
            if (noOwner.length) alerts.push({ t: noOwner.length + ' objet(s) sans propriétaire : ' + noOwner.slice(0, 3).map(b => b.name).join(', '), go: "openGovTab('objects')" });
            if (oldSrc.length) alerts.push({ t: oldSrc.length + ' source(s) non rafraîchie(s) depuis plus de 7 jours', go: 'switchTab(1)' });
            if (pend) alerts.push({ t: pend + ' proposition(s) attendent votre validation', go: "openGovTab('review')" });
            const empty = !tables.length && !(g.businessObjects || []).length;
            return `<div class="v12-home">
                <div class="v11-hello">${u ? 'Bonjour ' + escapeHTML(u.name.split(' ')[0]) : 'Bienvenue dans Studio Data'}</div>
                <div class="v11-hello-sub">${empty ? 'Tout se passe sur votre poste, rien ne quitte votre machine. Commencez par charger une source, ou regardez un exemple.' : `${tables.length} source(s), ${rows.toLocaleString('fr-FR')} ligne(s), ${cols} colonne(s) · ${(state.relations || []).length} lien(s) · ${(g.businessObjects || []).length} objet(s) métier · ${(g.qualityHistory || []).length} audit(s).`}</div>
                <div class="flex flex-wrap gap-2 mb-5" data-ro="keep"><button class="v11-btn pri" onclick="el('fileUploader') && el('fileUploader').click()">⤓ Charger un fichier</button><button class="v11-btn" onclick="switchTab(3)">⚗️ Extraire</button><button class="v11-btn" onclick="switchTab(8)">✅ Auditer</button><button class="v11-btn" onclick="v11WizardOpen()">＋ Objet métier</button><button class="v11-btn" onclick="v11PaletteOpen()">🔍 Rechercher <span class="v11-kbd">Ctrl K</span></button>${empty ? '<button class="v11-btn" onclick="v11LoadSample(); switchTab(11)">🧪 Exemple de gouvernance</button>' : ''}<button class="v11-btn" onclick="v11TourStart()">▶ Visite guidée</button><button class="v11-btn" onclick="v11HelpOpen()">? Aide</button></div>
                <div class="v11-home">
                    <div class="v11-card"><div class="t">🧭 Vos prochaines étapes <span class="n">${steps.length}</span></div>${steps.length ? `<div class="v12-steps">${steps.map((s, i) => `<div class="v12-step" onclick="${s.go}"><span class="n">${i + 1}</span><span>${escapeHTML(s.t)}</span><span class="why">${escapeHTML(s.why)}</span></div>`).join('')}</div>` : '<div class="v11-val empty">Rien d\'urgent : votre patrimoine est chargé, relié, audité et décrit.</div>'}</div>
                    <div class="v11-card"><div class="t">🚨 Points d'attention <span class="n">${alerts.length}</span></div>${alerts.length ? alerts.map(a => `<div class="v11-row" onclick="${a.go}"><span>⚠️ ${escapeHTML(a.t)}</span></div>`).join('') : '<div class="v11-val empty">Aucun point d\'attention.</div>'}
                        <div class="mt-3 text-[12px] text-slate-500">${lastQ ? `Dernier audit : <b>${escapeHTML(lastQ.table || '')}</b> · ${new Date(lastQ.ts).toLocaleDateString('fr-FR')} · complétude ${lastQ.avgCompleteness || 0} % · ${(lastQ.duplicates || 0).toLocaleString('fr-FR')} doublon(s)` : 'Aucun audit qualité pour l\'instant.'}${sn && sn.global != null ? ` · score règles <b>${sn.global}</b>/100` : ''}</div></div>
                    ${rec.length ? `<div class="v11-card full"><div class="t">🕘 Reprendre où vous en étiez</div><div class="v11-chips">${rec.map(x => `<span class="v11-chip" onclick="v11RecentGo('${x.kind}','${escapeHTML(String(x.id)).replace(/'/g, '&#39;')}')"><span class="k">${x.kind === 'bo' ? 'objet' : (x.kind === 'term' ? 'terme' : (x.kind === 'asset' ? 'appli' : 'source'))}</span>${escapeHTML(x.name)}</span>`).join('')}</div></div>` : ''}
                    <div class="v11-card full"><div class="t">🗺 Les quatre phases</div><div class="v12-phase">
                        <div class="p" onclick="switchTab(1)"><div class="t">① Données & Modèle</div><div class="v"><b>${tables.length}</b> source(s) · <b>${(state.relations || []).length}</b> lien(s) · <b>${Object.values(state.tables).filter(t => t.type === 'designed').length}</b> table(s) conçue(s)</div></div>
                        <div class="p" onclick="switchTab(3)"><div class="t">② Exploitation</div><div class="v"><b>${(state.extractPresets || []).length}</b> paramétrage(s) d'extraction · <b>${typeof rcList === 'function' ? rcList().length : 0}</b> préparation(s) · <b>${typeof dbList === 'function' ? dbList().length : 0}</b> tableau(x) de bord</div></div>
                        <div class="p" onclick="switchTab(8)"><div class="t">③ Qualité & Audit</div><div class="v"><b>${(g.qualityHistory || []).length}</b> audit(s) · <b>${typeof qrRules === 'function' ? qrRules().length : 0}</b> règle(s)${sn && sn.global != null ? ' · score <b>' + sn.global + '</b>' : ''}</div></div>
                        <div class="p" onclick="openGovTab('home')"><div class="t">④ Gouvernance</div><div class="v"><b>${(g.businessObjects || []).length}</b> objet(s) · <b>${(g.glossary || []).length}</b> terme(s) · <b>${(g.assets || []).length}</b> appli(s) · <b>${(g.people || []).length}</b> acteur(s)</div></div>
                    </div></div>
                    ${tables.length ? `<div class="v11-card full"><div class="t">▦ Sources <span class="n">${tables.length}</span></div><div class="overflow-x-auto"><table class="v11-tbl"><thead><tr><th>Source</th><th>Domaine</th><th>Lignes</th><th>Colonnes</th><th>Format</th><th></th></tr></thead><tbody>${tables.slice(0, 12).map(t => `<tr><td><b>${escapeHTML(t.name)}</b></td><td>${escapeHTML(t.theme || '—')}</td><td>${t.lastRows != null ? Number(t.lastRows).toLocaleString('fr-FR') : '—'}</td><td>${(t.headers || []).length}</td><td class="dim">${escapeHTML(t.type === 'designed' ? 'conçue' : (t.type || ''))}</td><td class="qa">${v12QuickActions(t, true)}</td></tr>`).join('')}</tbody></table></div>${tables.length > 12 ? `<div class="v11-row" onclick="switchTab(1)"><span>… et ${tables.length - 12} autre(s)</span></div>` : ''}</div>` : ''}
                </div></div>`;
        }
        const _v12_renderCockpit = renderCockpit;
        renderCockpit = function () { const c = el('cockpitContent'); if (!c) return; c.innerHTML = v12HomeHtml(); try { v11SortableTables(c); } catch (e) {} };
        // ---- Actions rapides sur une source ----
        function v12QuickActions(t, small) {
            if (t.status !== 'ready') return '';
            const id = t.id; const nm = escapeHTML(t.name).replace(/'/g, '&#39;'); const cls = small ? 'v11-btn sm' : '';
            return `<button class="${cls}" onclick="v12GoExplore('${id}')" title="Voir les lignes">🔎 Explorer</button><button class="${cls}" onclick="v12GoAudit('${id}')" title="Auditer la qualité">✅ Auditer</button><button class="${cls}" onclick="v12GoExtract('${id}')" title="Extraire à partir de cette table">⚗️ Extraire</button><button class="${cls}" onclick="v11GoTable('${nm}')" title="Documenter les colonnes">📚 Dictionnaire</button>${typeof openBoWizard === 'function' ? `<button class="${cls}" onclick="openBoWizard('${nm}')" title="Constituer un objet métier depuis cette source">🏛️ Objet</button>` : ''}`;
        }
        function v12GoExplore(id) { switchTab(6); const s = el('browserTableSelect'); if (s) { s.value = id; if (s.value === id) handleBrowserTableChange(); } }
        function v12GoAudit(id) { switchTab(8); const s = el('qualTable'); if (s) { s.value = id; if (s.value === id) handleQualTableChange(); } }
        function v12GoExtract(id) { switchTab(3); try { advSetBase(id); const s = el('baseTableSelect'); if (s) s.value = id; renderAdvExtract(); } catch (e) {} }
        // ---- Sources : vue liste / cartes + actions rapides sur les cartes ----
        function v12SourcesAfter() {
            const grid = el('tablesGrid'); if (!grid) return;
            const es = el('emptyStateSources'); if (es && Object.keys(state.tables).length) es.classList.add('hidden');
            let bar = el('v12SrcBar');
            if (!bar) { bar = document.createElement('div'); bar.id = 'v12SrcBar'; bar.className = 'v12-srcbar'; bar.setAttribute('data-ro', 'keep'); grid.parentNode.insertBefore(bar, grid); }
            bar.innerHTML = `<span class="v12-seg"><button class="${v12State.srcView === 'cards' ? 'on' : ''}" onclick="v12SrcView('cards')">▦ Cartes</button><button class="${v12State.srcView === 'list' ? 'on' : ''}" onclick="v12SrcView('list')">☰ Liste</button></span><span class="text-[11px] text-slate-500">Sur chaque source : Explorer, Auditer, Extraire, Dictionnaire, Objet métier.</span>`;
            let list = el('v12SrcList'); if (!list) { list = document.createElement('div'); list.id = 'v12SrcList'; grid.parentNode.insertBefore(list, grid.nextSibling); }
            const all = Object.values(state.tables);
            if (v12State.srcView === 'list' && all.length) {
                grid.style.display = 'none'; list.style.display = '';
                list.innerHTML = `<div class="overflow-x-auto bg-white border border-slate-200 rounded-xl"><table class="v11-tbl v12-srctbl"><thead><tr><th>Source</th><th>Format</th><th>Domaine</th><th>Lignes</th><th>Colonnes</th><th>Dernier audit</th><th>État</th><th>Actions</th></tr></thead><tbody>${all.map(t => { const lq = typeof lastAuditFor === 'function' ? lastAuditFor(t.name) : null; return `<tr><td><b>${escapeHTML(t.name)}</b></td><td class="dim">${escapeHTML(t.type === 'designed' ? 'conçue' : (t.type || ''))}</td><td>${escapeHTML(t.theme || '—')}</td><td>${t.lastRows != null ? Number(t.lastRows).toLocaleString('fr-FR') : '—'}</td><td>${(t.headers || []).length}</td><td class="dim">${lq && lq.avgCompleteness != null ? 'complétude ' + lq.avgCompleteness + ' %' : '—'}</td><td>${t.status === 'ready' ? '<span class="text-emerald-700 font-bold">prête</span>' : (t.status === 'error' ? '<span class="text-red-600 font-bold">erreur</span>' : escapeHTML(t.status || ''))}</td><td class="qa">${v12QuickActions(t, true)}<button class="v11-btn sm" onclick="v12SrcView('cards'); setTimeout(()=>{ const c=Array.from(document.querySelectorAll('#tablesGrid > div')).find(x=>x.textContent.includes(${JSON.stringify(t.name)})); if(c) c.scrollIntoView({behavior:'smooth',block:'center'}); },50)" title="Réglages de la source (carte)">⚙</button></td></tr>`; }).join('')}</tbody></table></div>`;
                try { v11SortableTables(list); } catch (e) {}
            } else {
                grid.style.display = ''; list.style.display = 'none'; list.innerHTML = '';
                Array.from(grid.children).forEach(card => { if (card.querySelector('.v12-qa')) return; const t = all.find(x => x.status === 'ready' && card.textContent.includes(x.name)); if (!t) return; card.insertAdjacentHTML('beforeend', `<div class="v12-qa" data-ro="keep">${v12QuickActions(t, false)}</div>`); });
            }
        }
        function v12SrcView(v) { v12State.srcView = v; try { v11Prefs.srcView = v; v11SavePrefs(); } catch (e) {} v12SourcesAfter(); }
        // ---- En-têtes de page unifiés : titre, une phrase, le reste replié ----
        function v12PageHeaders() {
            for (const n of Object.keys(V12_STEPS)) {
                const sec = el('step-' + n); if (!sec || sec.dataset.v12ph) continue;
                const h2 = sec.querySelector('h2'); if (!h2) continue;
                sec.dataset.v12ph = '1';
                const box = h2.parentElement; const p = h2.nextElementSibling && h2.nextElementSibling.tagName === 'P' ? h2.nextElementSibling : (box.querySelector('p') && box.querySelector('p').previousElementSibling === h2 ? box.querySelector('p') : null);
                if (p) {
                    const txt = p.textContent.trim(); const cut = txt.search(/[.!?]\s|[.!?]$/); let first = cut > 0 ? txt.slice(0, cut + 1) : txt;
                    if (first.length > 150) { const m = first.slice(0, 170).search(/\s[:;—]\s|\s\(/); if (m > 40) first = first.slice(0, m) + '.'; else { const sp = first.lastIndexOf(' ', 130); first = first.slice(0, sp > 40 ? sp : 130) + '…'; } }
                    if (txt.length > first.length + 20) { const long = document.createElement('div'); long.className = 'v12-long'; long.innerHTML = p.innerHTML; p.textContent = first; p.insertAdjacentHTML('beforeend', ' <span class="v12-more" onclick="this.parentElement.nextElementSibling.classList.toggle(\'open\'); this.textContent = this.parentElement.nextElementSibling.classList.contains(\'open\') ? \'▾ moins\' : \'ℹ️ En savoir plus\'">ℹ️ En savoir plus</span>'); p.insertAdjacentElement('afterend', long); }
                    p.classList.add('v12-sub');
                }
                h2.classList.add('v12-h2');
            }
        }
        // ---- Bandeau « moteur indisponible » ----
        const _v12_getDB = getDB;
        getDB = async function () { try { const r = await _v12_getDB.apply(this, arguments); v12State.engineDown = false; return r; } catch (e) { v12State.engineDown = true; v12State.engineMsg = e.message || String(e); v12EngineBand(); throw e; } };
        function v12EngineBand() {
            const main = document.querySelector('main'); if (!main || v12State.bandOff) return;
            let b = el('v12Engine'); if (!v12State.engineDown) { if (b) b.remove(); return; }
            if (!b) { b = document.createElement('div'); b.id = 'v12Engine'; b.className = 'v12-band'; b.setAttribute('data-ro', 'keep'); main.insertBefore(b, main.firstChild); }
            b.innerHTML = `<span>⚙️</span><span><b>Le moteur de données n'est pas chargé.</b> Les fonctions qui lisent les fichiers (explorer, extraire, auditer, statistiques) sont indisponibles ; la gouvernance, le modèle et vos descriptions restent utilisables. Cause probable : pas d'accès internet au premier chargement de la page.</span><button class="v11-btn sm" onclick="location.reload()">↻ Réessayer</button><span class="x" title="Masquer" onclick="v12State.bandOff=true; el('v12Engine').remove()">×</span>`;
        }
        // ---- Écrans qui travaillent sur des données : bandeau si aucune source ----
        function v12EmptyBand(n) {
            const sec = el('step-' + n); if (!sec) return; let b = sec.querySelector('.v12-band.info');
            if (!V12_NEEDS_DATA.includes(Number(n)) || v12Ready().length) { if (b) b.remove(); return; }
            if (!b) { b = document.createElement('div'); b.className = 'v12-band info'; b.setAttribute('data-ro', 'keep'); sec.insertBefore(b, sec.firstChild); }
            b.innerHTML = `<span>📥</span><span><b>Aucune source chargée.</b> Cet écran travaille sur vos données : commencez par charger un fichier CSV, Excel ou ZIP. Tout reste sur votre poste.</span><button class="v11-btn pri sm" onclick="switchTab(1); setTimeout(()=>{ const f=el('fileUploader'); if(f) f.click(); },100)">⤓ Charger un fichier</button><button class="v11-btn sm" onclick="switchTab(1)">Voir les sources</button>`;
        }
        // ---- « Et ensuite ? » ----
        function v12NextFooter(n) {
            const sec = el('step-' + n); const nx = V12_NEXT[n]; if (!sec || !nx) return;
            let f = sec.querySelector('.v12-next'); if (!f) { f = document.createElement('div'); f.className = 'v12-next'; f.setAttribute('data-ro', 'keep'); sec.appendChild(f); }
            f.innerHTML = `<b>Et ensuite ?</b>${nx.map(([t, l]) => `<button class="v11-btn sm" onclick="v12Go(${typeof t === 'number' ? t : JSON.stringify(t)})">${escapeHTML(l)} ›</button>`).join('')}`;
        }
        // ---- Barres d'action collantes (Extraire, Qualité) ----
        function v12StickyBars() {
            const mk = (sec, label, sels) => { if (!sec) return; let bar = sec.querySelector(':scope > .v12-sticky'); const btns = sels.map(s => sec.querySelector(s)).filter(Boolean); if (!btns.length) { if (bar) bar.remove(); return; } if (!bar) { bar = document.createElement('div'); bar.className = 'v12-sticky'; bar.setAttribute('data-ro', 'keep'); const nx = sec.querySelector('.v12-next'); if (nx) sec.insertBefore(bar, nx); else sec.appendChild(bar); } bar.innerHTML = `<span class="lbl">${label}</span><span class="sp"></span>` + btns.map(b => `<button class="v11-btn ${/adv-generate|btnRunQual/.test(b.id) ? 'pri' : ''}" ${b.disabled ? 'disabled' : ''}>${escapeHTML(b.textContent.trim().replace(/\s+/g, ' '))}</button>`).join(''); Array.from(bar.querySelectorAll('button')).forEach((c, i) => c.onclick = () => { btns[i].scrollIntoView({ behavior: 'smooth', block: 'center' }); btns[i].click(); }); };
            mk(el('step-3'), 'Extraction', ['[onclick="advCount()"]', '[onclick="advPreview()"]', '#adv-generate']);
            mk(el('step-8'), 'Audit', ['#btnRunQual']);
        }
        // ---- Plein écran sur les grands panneaux ----
        const V12_FS = [['#browserTableContainer', 'Données'], ['#qualResultArea', 'Rapport d\'audit'], ['#adv-preview', 'Aperçu de l\'extraction'], ['#covResult', 'Analyse de couverture'], ['#expGraphContainer', 'Explorateur 360°'], ['#dbContent', 'Tableaux de bord'], ['#lkContent', 'Rapprochement'], ['#rcContent', 'Préparation'], ['#qrContent', 'Règles & score'], ['#tablesDesignContent', 'Tables conçues'], ['#tsContent', 'Séries temporelles']];
        function v12FsButtons() {
            V12_FS.forEach(([sel, title]) => { const n = document.querySelector(sel); if (!n || n.classList.contains('hidden') || !n.children.length || /^Aucun/.test(n.textContent.trim()) || n.querySelector(':scope > .v11-fsbtn.float') || (v11State.fs && v11State.fs.node === n)) return; if (getComputedStyle(n).position === 'static') n.classList.add('v11-fs-anchor'); n.insertAdjacentHTML('afterbegin', v11FsBtn(sel, title, 'float')); });
        }
        // ---- Fil d'Ariane hors gouvernance (barre de contexte) + historique ----
        function v12Crumb() {
            const c = el('ctxCrumb'); if (!c || currentTab === 9) return;
            const ph = phaseOfTab(currentTab); const t = ph.tabs.find(x => x.n === currentTab) || {};
            c.innerHTML = `<a data-ro="keep" onclick="switchTab(11)">Accueil</a><span class="sep">›</span><a data-ro="keep" onclick="switchPhase('${ph.id}')">${escapeHTML(ph.badge + ' ' + ph.label)}</a><span class="sep">›</span><span class="cur">${escapeHTML(t.label || '')}</span>`;
        }
        const _v12_renderContextBar = renderContextBar; renderContextBar = function () { const r = _v12_renderContextBar.apply(this, arguments); try { v12Crumb(); } catch (e) {} return r; };
        const _v12_navKey = v11NavKey; v11NavKey = function () { return currentTab === 9 ? _v12_navKey() : JSON.stringify({ t: currentTab }); };
        const _v12_histGo = v11HistGo; v11HistGo = function (d) { const h = v11State.hist; const j = h.i + d; if (j < 0 || j >= h.stack.length) return; let s; try { s = JSON.parse(h.stack[j]); } catch (e) { return; } if (s && s.t && s.t !== 9) { h.i = j; h.nav = true; try { switchTab(s.t); } finally { h.nav = false; } v11HistButtons(); return; } return _v12_histGo.apply(this, arguments); };
        // ---- Après chaque changement d'écran ----
        function v12After() {
            try { v12PageHeaders(); v12EngineBand(); } catch (e) { console.error(e); }
            const n = currentTab; if (n === 9) return;
            try { v12EmptyBand(n); v12NextFooter(n); v12StickyBars(); v12FsButtons(); v12Crumb(); if (n === 1) v12SourcesAfter(); v11HistPush(); v11HistButtons(); v11SortableTables(el('step-' + n)); v11Wording(el('step-' + n)); } catch (e) { console.error(e); }
        }
        const _v12_switchTab = switchTab; switchTab = function (num) { const r = _v12_switchTab.apply(this, arguments); v12After(); return r; };
        ['renderTables', 'renderAdvExtract', 'renderQualityRules', 'renderDashboards', 'renderRecipes', 'renderLinkage', 'renderTablesDesign', 'renderTimeSeries', 'renderBrowserTableHTML', 'renderProfilingReport', 'renderCompKeys', 'renderExpConfigCols'].forEach(nm => { const o = window[nm]; if (typeof o !== 'function') return; window[nm] = function () { const r = o.apply(this, arguments); try { if (currentTab !== 9) { v12FsButtons(); v12StickyBars(); if (nm === 'renderTables') { v12SourcesAfter(); v12EmptyBand(currentTab); if (currentTab === 11) renderCockpit(); } v11SortableTables(el('step-' + currentTab)); } } catch (e) {} return r; }; });
        // ---- Recherche : tous les écrans et les actions de l'application ----
        const _v12_index = v11Index;
        v11Index = function () {
            const out = _v12_index.apply(this, arguments).filter(it => it.grp !== 'Écrans');
            NAV_PHASES.forEach(p => p.tabs.filter(t => !t.hidden).forEach(t => out.push({ grp: 'Écrans', ic: t.icon, label: t.label + (p.id === 'gov' ? '' : ''), sub: p.label, key: t.label + ' ' + p.label, go: () => (p.id === 'gov' ? openGovTab(t.g) : switchTab(t.n)) })));
            [['⤓', 'Charger un fichier (CSV, Excel, ZIP)', 'charger importer fichier source csv excel', () => { switchTab(1); setTimeout(() => { const f = el('fileUploader'); if (f) f.click(); }, 100); }],
             ['🧩', 'Fusionner des fichiers en une source', 'fusionner combiner fichiers', () => { switchTab(1); openMergeModal(); }],
             ['🔌', 'Connecter une base ou une API', 'connecter base api json', () => { switchTab(1); toggleDbModal(); }],
             ['🔗', 'Déduire les liens du modèle', 'déduire liens relations modèle', () => { switchTab(2); if (typeof openRelInfer === 'function') openRelInfer(); }],
             ['✅', 'Lancer un audit qualité', 'audit qualité lancer', () => switchTab(8)],
             ['📏', 'Créer une règle de qualité', 'règle qualité score', () => switchTab(12)],
             ['💾', 'Sauvegarde et partage', 'sauvegarder exporter bundle importer', () => openBackupCenter()],
             ['📄', 'Dossier de gouvernance (HTML)', 'dossier rapport gouvernance export', () => exportGovernanceReport()],
             ['🛡', 'Détecter les données personnelles (RGPD)', 'rgpd données personnelles pii', () => { switchTab(11); setTimeout(() => scanPII(), 200); }],
             ['🧭', 'Guide pas à pas : extraire', 'guide assistant extraire', () => wizOpen('extract')], ['🧭', 'Guide pas à pas : contrôler la qualité', 'guide assistant qualité', () => wizOpen('quality')]].forEach(([ic, label, key, go]) => out.push({ grp: 'Actions', ic, label, key: label + ' ' + key, go }));
            return out;
        };
        // ---- Aide, lexique, visite guidée étendus ----
        Object.assign(V11_WORDS, { 'Fichiers chargés': 'Sources', 'Audit Qualité & Conformité': 'Audit qualité', 'Comparateur de Fichiers': 'Comparer deux sources', 'Explorer les données': 'Explorer une source' });
        Object.assign(V11_LEXIQUE, { 'source': 'Fichier ou table chargé dans Studio Data (CSV, Excel, ZIP, connecteur). Une source appartient à une application.', 'table conçue': 'Table construite à partir d\'une ou plusieurs sources : consolidation, renommage, colonnes calculées, clé et dédoublonnage.', 'extraction': 'Fichier de sortie composé à partir du modèle : colonnes de plusieurs tables, filtres, agrégats, dédoublonnage.', 'règle de qualité': 'Contrôle formalisé (non vide, unicité, format, référence…) exécuté sur les données et pondéré dans un score 0–100.', 'rapprochement': 'Mise en correspondance des entités de deux sources qui décrivent les mêmes choses, avec des correspondances approchées.', 'série temporelle': 'Source où une ligne est une observation datée (une valeur, pour un identifiant, à un instant) et non une entité.', 'préparation': 'Suite d\'étapes de nettoyage décrite une fois et rejouée automatiquement à chaque mise à jour de la source.', 'tableau de bord': 'Ensemble de tuiles (indicateurs, graphes, tableaux) avec filtres globaux, exportable en HTML autonome.' });
        V11_TOUR.splice(0, V11_TOUR.length,
            { sel: '.v7-side', t: 'Quatre phases, un parcours', x: 'Données & Modèle (charger, relier), Exploitation (extraire, préparer, tableaux de bord, comparer, explorer), Qualité & Audit (auditer, règles, rapprochement), Gouvernance (décrire, valider). Le menu se replie ; les raccourcis G puis une lettre y mènent.' },
            { sel: '#cockpitContent', t: 'L\'accueil vous dit quoi faire', x: 'Vos prochaines étapes sont déduites de l\'état réel : charger, relier, auditer, décrire. Les points d\'attention et les fiches récentes sont là aussi.' },
            { sel: '.v11-topbtn', t: 'Rechercher partout', x: 'Ctrl+K : écrans, actions (charger, fusionner, auditer, sauvegarder…), sources, colonnes, objets, termes, applications. Entrée ouvre.' },
            { sel: '#v11Hist', t: 'Revenir en arrière', x: 'Précédent / Suivant sur tous les écrans (Alt+← / Alt+→). Le fil d\'Ariane de la barre de contexte est cliquable.' },
            { sel: '#v11Save', t: 'Enregistré, annulable', x: 'Tout est enregistré sur votre poste. « Annuler » (Ctrl+Z) revient sur la dernière modification. « ? » ouvre l\'aide, les raccourcis et les préférences. Bonne visite !' });
        // L'accueil dit déjà par où commencer : la fenêtre « Par où commencer ? » ne s'ouvre plus d'elle-même (le menu Assistant reste).
        if (typeof wizMaybeAutoOpen === 'function') wizMaybeAutoOpen = function () { return false; };
        // ---- Démarrage : accueil global en premier écran, préférences ----
        (function () {
            try { if (v11Prefs.srcView) v12State.srcView = v11Prefs.srcView; } catch (e) {}
            const boot = () => { try { if (currentTab === 1 && !v12Ready().length) switchTab(11); else v12After(); } catch (e) { console.error(e); } };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
        })();
