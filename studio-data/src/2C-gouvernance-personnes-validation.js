        // ======================= V10 : PERSONNES, RÔLES & VALIDATION DES PROPOSITIONS =======================
        // Mono-poste : on choisit « qui on est » dans l'en-tête (profil actif, déclaratif) ; les
        // rôles et les décisions s'appliquent aux données réellement saisies. Une personne a un ou plusieurs couples (domaine métier, rôle).
        //   • Propriétaire : modifie directement et VALIDE les propositions de son domaine.
        //   • Contributeur : ses modifications deviennent des PROPOSITIONS (rien n'est écrasé) — sens ET structure ;
        //                    seuls le PROPRIÉTAIRE et le DOMAINE MÉTIER d'un élément lui sont réservés (V10.2).
        //   • Lecteur      : consultation seule.
        // Tant qu'aucune personne n'est déclarée, l'application se comporte comme avant.
        const GOV_ROLES = { owner: ['👑', 'Propriétaire'], contrib: ['✍️', 'Contributeur'], reader: ['👁', 'Lecteur'] };
        const PROP_FIELD_LABELS = { definition: 'Définition', examples: 'Exemples', sensitivity: 'Sensibilité', owner: 'Propriétaire', multi: 'Nombre de valeurs', name: 'Nom', globalOwner: 'Propriétaire global', domain: 'Domaine métier', col: 'Colonne', description: 'Description', steward: 'Référent', sourceSystem: 'Système source', status: 'Statut', term: 'Terme', contributors: 'Contributeurs' };
        let _govBypass = false;
        function govPeople() { const g = state.governance; if (!Array.isArray(g.people)) g.people = []; return g.people; }
        function govProposals() { const g = state.governance; if (!Array.isArray(g.proposals)) g.proposals = []; return g.proposals; }
        function govFeatureOn() { return govPeople().length > 0; }
        function govDomains() {
            const g = state.governance; const s2 = new Set([...(g.domainList || []), ...themeList()]);
            (g.assets || []).forEach(a => { if ((a.domain || '').trim()) s2.add(a.domain.trim()); });
            (g.businessObjects || []).forEach(bo => { if ((bo.domain || '').trim()) s2.add(bo.domain.trim()); });
            (g.glossary || []).forEach(t2 => { if ((t2.domain || '').trim()) s2.add(t2.domain.trim()); });
            govPeople().forEach(p => (p.roles || []).forEach(r => { if (r.domain) s2.add(r.domain); }));
            return Array.from(s2).filter(Boolean).sort((a, b) => a.localeCompare(b));
        }
        function govAddDomain(name) { name = String(name || '').trim(); if (!name) return; const g = state.governance; g.domainList = g.domainList || []; if (!g.domainList.includes(name)) g.domainList.push(name); persistAppState(); renderGovernance(); }
        // V10.1.1 — usages d'un domaine (pour l'afficher et le supprimer proprement partout).
        function govDomainUsage(name) {
            const g = state.governance; const eq = v => String(v || '').trim() === name;
            return { tables: Object.values(state.tables).filter(t => eq(t.theme)).length, objects: (g.businessObjects || []).filter(b => eq(b.domain)).length,
                terms: (g.glossary || []).filter(t2 => eq(t2.domain)).length, assets: (g.assets || []).filter(a => eq(a.domain)).length,
                roles: govPeople().reduce((n, p) => n + (p.roles || []).filter(r => eq(r.domain)).length, 0) };
        }
        function govDomainUsageText(u2) { const parts = []; if (u2.tables) parts.push(u2.tables + ' source(s)'); if (u2.objects) parts.push(u2.objects + ' objet(s)'); if (u2.terms) parts.push(u2.terms + ' terme(s)'); if (u2.assets) parts.push(u2.assets + ' appli/processus'); if (u2.roles) parts.push(u2.roles + ' rôle(s)'); return parts.join(', '); }
        function govRemoveDomain(name) {
            name = String(name || '').trim(); if (!name) return;
            const u2 = govDomainUsage(name); const used = govDomainUsageText(u2);
            if (!confirm('Supprimer le domaine « ' + name + ' » ?' + (used ? '\nIl est utilisé par : ' + used + '. Ces éléments n\'auront plus de domaine (les rôles associés seront retirés).' : ''))) return;
            const g = state.governance; const eq = v => String(v || '').trim() === name;
            g.domainList = (g.domainList || []).filter(d => d !== name);
            Object.values(state.tables).forEach(t => { if (eq(t.theme)) t.theme = ''; });
            (g.businessObjects || []).forEach(b => { if (eq(b.domain)) b.domain = ''; });
            (g.glossary || []).forEach(t2 => { if (eq(t2.domain)) t2.domain = ''; });
            (g.assets || []).forEach(a => { if (eq(a.domain)) a.domain = ''; });
            govPeople().forEach(p => { p.roles = (p.roles || []).filter(r => !eq(r.domain)); });
            persistAppState(); renderNav(); renderGovernance(); showSuccess('Domaine « ' + name + ' » supprimé' + (used ? ' (' + used + ' mis à jour)' : '') + '.');
        }
        function curUser() { if (!govFeatureOn()) return null; const id = govState.userId || (() => { try { return localStorage.getItem('sd_user'); } catch (e) { return null; } })(); return govPeople().find(p => p.id === id) || null; }
        function govSetUser(id) {
            govState.userId = id || ''; try { localStorage.setItem('sd_user', id || ''); } catch (e) {}
            const u = curUser();
            // Un lecteur partout (aucun domaine en propriétaire ni contributeur) bascule en consultation.
            const onlyReader = u && !(u.roles || []).some(r => r.role === 'owner' || r.role === 'contrib' || r.role === 'admin');
            if (govIsReadOnly() !== !!onlyReader) govSetReadOnly(!!onlyReader);
            renderNav(); renderGovernance();
            if (u) showSuccess(`Vous êtes maintenant ${u.name}${govRoleSummary(u) ? ' — ' + govRoleSummary(u) : ''}.`);
        }
        function govRoleSummary(u) { return (u.roles || []).map(r => (GOV_ROLES[r.role] ? GOV_ROLES[r.role][1] : r.role) + (r.domain ? ' · ' + r.domain : ' · tous domaines')).join(', '); }
        // Rôle de la personne active sur un domaine : admin (rôle sur « tous domaines »), owner, contrib, reader.
        function govRoleIn(domain) {
            const u = curUser(); if (!u) return 'admin';
            const rs = u.roles || []; const dom = String(domain || '').trim();
            const pick = rs.filter(r => !r.domain || r.domain === dom);
            if (pick.some(r => r.role === 'admin')) return 'admin';
            if (pick.some(r => r.role === 'owner')) return 'owner';
            if (pick.some(r => r.role === 'contrib')) return 'contrib';
            if (pick.some(r => r.role === 'reader')) return 'reader';
            // Sans domaine déclaré sur l'élément : tout propriétaire / contributeur agit selon son meilleur rôle.
            if (!dom) { if (rs.some(r => r.role === 'owner')) return 'owner'; if (rs.some(r => r.role === 'contrib')) return 'contrib'; }
            return 'reader';
        }
        function govCanEdit(domain) { const r = govRoleIn(domain); return r === 'admin' || r === 'owner'; }
        function govCanPropose(domain) { return govRoleIn(domain) === 'contrib'; }
        // V10.1 — Le PROPRIÉTAIRE nommé sur un objet (champ « Propriétaire global », relié à une
        // personne) valide cet objet, quel que soit son rôle sur le domaine : ce sont vos données
        // qui décident, pas seulement la grille des rôles.
        function govIsOwnerOfBo(bo) { const u = curUser(); if (!u || !bo) return false; if (bo.ownerId && bo.ownerId === u.id) return true; return !!(bo.globalOwner && catNorm(bo.globalOwner) === catNorm(u.name)); }
        function govCanEditBo(bo) { return govCanEdit(boDomainOf(bo)) || govIsOwnerOfBo(bo); }
        function govCanProposeBo(bo) { return !govCanEditBo(bo) && (govCanPropose(boDomainOf(bo)) || (curUser() && (curUser().roles || []).some(r => r.role === 'contrib'))); }
        function govLinkOwner(bo) { if (!bo) return; const p = govPeople().find(x => catNorm(x.name) === catNorm(bo.globalOwner || '')); bo.ownerId = p ? p.id : ''; }
        function propTargetBo(p) { const t = p.target || {}; const id = t.boId || (t.ctx || {}).boId; return id ? (state.governance.businessObjects || []).find(b => b.id === id) : null; }
        function propCanDecide(p) { const bo = propTargetBo(p); return bo ? govCanEditBo(bo) : govCanEdit(p.domain); }
        // Garde des opérations de STRUCTURE (réservées aux propriétaires) : renvoie true si autorisé.
        function govGuard(domain, what, bo) {
            if (_govBypass || (bo ? govCanEditBo(bo) : govCanEdit(domain))) return true;
            showError((what || 'Cette opération') + ' est réservé(e) au propriétaire' + (domain ? ' du domaine « ' + domain + ' »' : '') + '. Un contributeur peut proposer tout le reste (définitions, attributs, colonnes, facettes, sources, applications…).');
            return false;
        }
        function boDomainOf(bo) { return bo ? String(bo.domain || '').trim() : ''; }
        function govPersonName(id) { const p = govPeople().find(x => x.id === id); return p ? p.name : (id || '?'); }
        // ---- Propositions ----
        function govPropose(p) {
            const u = curUser(); const list = govProposals();
            // une proposition en attente sur la même cible + champ est remplacée
            const same = list.find(x => x.status === 'pending' && x.kind === p.kind && x.field === p.field && JSON.stringify(x.target) === JSON.stringify(p.target) && (p.kind !== 'termlink' || x.after === p.after));
            if (same) { same.after = p.after; same.at = new Date().toISOString(); }
            else list.push(Object.assign({ id: 'pr_' + generateId(), at: new Date().toISOString(), by: u ? u.id : '', status: 'pending', comment: '' }, p));
            persistAppState();
            showSuccess(`Proposition enregistrée : ${p.label}. En attente de validation par un propriétaire du domaine${p.domain ? ' « ' + p.domain + ' »' : ''}.`);
            renderNav(); renderGovernance(); catRefreshFiche();
        }
        function propPending(kind, target, field) { return govProposals().filter(x => x.status === 'pending' && x.kind === kind && (!field || x.field === field) && JSON.stringify(x.target) === JSON.stringify(target)); }
        function propCountPendingFor(u) { u = u || curUser(); return govProposals().filter(x => x.status === 'pending' && (!u || propCanDecide(x))).length; }
        function propFmt(v) { if (v === '' || v == null) return '<i class="text-slate-400">vide</i>'; return escapeHTML(String(v)); }
        function propApply(p) {
            _govBypass = true;
            try {
                if (p.kind === 'attr') boAttrWrite(p.target.boId, p.target.stId || '', p.target.elId, p.field, p.after);
                else if (p.kind === 'bo') updateBusinessObject(p.target.boId, p.field, p.after);
                else if (p.kind === 'term') updateGlossaryTerm(p.target.termId, p.field, p.after);
                else if (p.kind === 'asset') updateGovAsset(p.target.assetId, p.field, p.raw !== undefined ? p.raw : p.after);
                else if (p.kind === 'action') propApplyAction(p);
                else if (p.kind === 'termlink') { if (p.field === 'add') termTagAdd(p.target.tk, p.target.ctx, p.after); else termTagRemove(p.target.tk, p.target.ctx, p.after); }
                else if (p.kind === 'dictcol') updateDictColField(p.target.tn, p.target.col, p.field, p.raw !== undefined ? p.raw : p.after);
                else if (p.kind === 'dict') updateDictField(p.target.tn, p.field, p.after);
                else if (p.kind === 'table') updateTableTheme(p.target.tableId, p.after);
            } finally { _govBypass = false; }
        }
        function propTraceOn(p, verdict) {
            const g = state.governance; let ent = null;
            if (p.kind === 'dictcol' || p.kind === 'dict') ent = ensureDictEntry(p.target.tn);
            else if (p.kind === 'table') { const t = state.tables[p.target.tableId]; ent = t ? ensureDictEntry(t.name) : null; }
            if (p.kind === 'attr' || p.kind === 'bo' || (p.kind === 'action' && p.target.boId) || (p.kind === 'termlink' && (p.target.tk === 'attr' || p.target.tk === 'bo'))) ent = (g.businessObjects || []).find(b => b.id === (p.target.boId || (p.target.ctx || {}).boId));
            else if (p.kind === 'term') ent = (g.glossary || []).find(t2 => t2.id === p.target.termId);
            else if (p.kind === 'asset' || p.kind === 'termlink' || (p.kind === 'action' && p.target.assetId)) ent = assetById(p.target.assetId || (p.target.ctx || {}).assetId);
            if (!ent) return;
            ent.history = ent.history || [];
            ent.history.push({ at: new Date().toISOString(), from: 'Proposé', to: verdict === 'accepted' ? 'Validé' : 'Refusé', by: govPersonName(p.decidedBy), comment: `${p.label} — proposé par ${govPersonName(p.by)}${p.comment ? ' · ' + p.comment : ''}` });
            if (ent.history.length > 100) ent.history = ent.history.slice(-100);
        }
        function propDecide(id, verdict, comment) {
            const p = govProposals().find(x => x.id === id); if (!p || p.status !== 'pending') return;
            if (!propCanDecide(p)) return showError('Seul le propriétaire de la fiche ou du domaine' + (p.domain ? ' « ' + p.domain + ' »' : '') + ' peut décider.');
            p.status = verdict; p.decidedAt = new Date().toISOString(); p.decidedBy = (curUser() || {}).id || ''; p.comment = comment || '';
            if (verdict === 'accepted') propApply(p);
            propTraceOn(p, verdict);
            persistAppState(); renderNav(); renderGovernance(); catRefreshFiche();
            showSuccess(verdict === 'accepted' ? 'Proposition validée et appliquée.' : 'Proposition refusée.');
        }
        function propAccept(id) { propDecide(id, 'accepted', ''); }
        function propReject(id) { const c = prompt('Motif du refus (optionnel) :') || ''; propDecide(id, 'rejected', c); }
        function propWithdraw(id) { const p = govProposals().find(x => x.id === id); if (!p) return; const u = curUser(); if (u && p.by !== u.id && !propCanDecide(p)) return showError('Seul l\'auteur peut retirer sa proposition.'); state.governance.proposals = govProposals().filter(x => x.id !== id); persistAppState(); renderNav(); renderGovernance(); catRefreshFiche(); }
        function propAcceptAll(keyJson) { const key = JSON.parse(keyJson); govProposals().filter(x => x.status === 'pending' && propGroupKey(x) === key).forEach(x => { if (propCanDecide(x)) { x.status = 'accepted'; x.decidedAt = new Date().toISOString(); x.decidedBy = (curUser() || {}).id || ''; propApply(x); propTraceOn(x, 'accepted'); } }); persistAppState(); renderNav(); renderGovernance(); showSuccess('Propositions de la fiche validées.'); }
        function propGroupKey(p) { const t = p.target || {}; if (p.kind === 'action' && t.assetId) return 'asset:' + t.assetId; if (p.kind === 'table') return 'tbl:' + ((state.tables[t.tableId] || {}).name || t.tableId); if (p.kind === 'dictcol' || p.kind === 'dict') return 'tbl:' + t.tn; return p.kind === 'term' ? 'term:' + t.termId : (p.kind === 'asset' || (p.kind === 'termlink' && t.tk === 'asset') ? 'asset:' + (t.assetId || (t.ctx || {}).assetId) : 'bo:' + (t.boId || (t.ctx || {}).boId)); }
        function propGroupLabel(key) { const [k, id] = key.split(':'); const g = state.governance; if (k === 'tbl') return '▦ ' + id; if (k === 'bo') { const bo = (g.businessObjects || []).find(b => b.id === id); return bo ? '🏛️ ' + bo.name : id; } if (k === 'term') { const t2 = (g.glossary || []).find(x => x.id === id); return t2 ? '📖 ' + t2.term : id; } const a = assetById(id); return a ? (a.kind === 'process' ? '⚙️ ' : '🖥 ') + a.name : id; }
        function propOpenTarget(id) {
            const p = govProposals().find(x => x.id === id); if (!p) return;
            const key = propGroupKey(p); const [k, tid] = key.split(':');
            if (k === 'tbl') { govState.dictMode = 'table'; govState.dictTable = tid; openGovTab('dictionary'); return; }
            if (k === 'bo') { govState.selectedBoId = tid; govState.boTab = 'structure'; govState.structView = 'fiche'; const elId = p.target.elId || (p.target.ctx || {}).elId; if (elId) govState.boSel = { kind: 'attr', stId: p.target.stId || '', elId }; openGovTab('objects'); }
            else if (k === 'term') { termTagOpen(tid); }
            else openGovTab('assets');
        }
        // Pastille « proposition en attente » à côté d'un champ (avec décision si on est propriétaire).
        function propBadgeHtml(kind, target, field) {
            const ps = propPending(kind, target, field); if (!ps.length) return '';
            return ps.map(p => `<div class="prop-badge" title="Proposé le ${new Date(p.at).toLocaleString('fr-FR')}"><span class="who">⏳ ${escapeHTML(govPersonName(p.by))} propose :</span> <span class="val">${propFmt(p.after)}</span>${propCanDecide(p) ? `<span class="acts"><button data-ro="keep" onclick="propAccept('${p.id}')" class="ok" title="Valider et appliquer">✓ Valider</button><button data-ro="keep" onclick="propReject('${p.id}')" class="ko" title="Refuser">✕</button></span>` : ((curUser() || {}).id === p.by ? `<span class="acts"><button data-ro="keep" onclick="propWithdraw('${p.id}')" class="ko" title="Retirer ma proposition">retirer</button></span>` : '')}</div>`).join('');
        }
        // ---- Interception des écritures : un contributeur PROPOSE au lieu d'écrire ----
        const _w_boAttrWrite = boAttrWrite;
        boAttrWrite = function (boId, stId, elId, f, v) {
            const bo = (state.governance.businessObjects || []).find(x => x.id === boId);
            const dom = boDomainOf(bo);
            if (!_govBypass && bo && govFeatureOn() && !govCanEditBo(bo)) {
                if (!govCanProposeBo(bo)) return showError('Lecture seule sur le domaine' + (dom ? ' « ' + dom + ' »' : '') + '.');
                const r = (boAllAttrRows(bo) || []).find(x => x.el.id === elId); const before = r ? (r.el[f] || '') : '';
                if (String(before) === String(v)) return;
                return govPropose({ kind: 'attr', domain: dom, target: { boId, stId: stId || '', elId }, field: f, label: (PROP_FIELD_LABELS[f] || f) + ' de « ' + (r ? r.el.name : elId) + ' » (' + bo.name + ')', before, after: v });
            }
            return _w_boAttrWrite(boId, stId, elId, f, v);
        };
        const _w_updateBusinessObject = updateBusinessObject;
        updateBusinessObject = function (id, f, v) {
            const bo = (state.governance.businessObjects || []).find(x => x.id === id); const dom = boDomainOf(bo);
            if (!_govBypass && bo && govFeatureOn() && !govCanEditBo(bo)) {
                if (!govCanProposeBo(bo)) return showError('Lecture seule sur le domaine' + (dom ? ' « ' + dom + ' »' : '') + '.');
                if (f === 'globalOwner' || f === 'ownerId' || f === 'domain') return govGuard(dom, f === 'domain' ? 'Le domaine métier' : 'Le propriétaire', bo);
                const before = Array.isArray(bo[f]) ? bo[f].join(', ') : (bo[f] || ''); const after = Array.isArray(v) ? v.join(', ') : v;
                if (String(before) === String(after)) return;
                return govPropose({ kind: 'bo', domain: dom, target: { boId: id }, field: f, label: (PROP_FIELD_LABELS[f] || f) + ' de l\'objet « ' + bo.name + ' »', before, after });
            }
            const r2 = _w_updateBusinessObject(id, f, v);
            if (f === 'globalOwner' && bo) { govLinkOwner(bo); persistAppState(); }
            return r2;
        };
        const _w_updateGlossaryTerm = updateGlossaryTerm;
        updateGlossaryTerm = function (id, f, v) {
            const t2 = (state.governance.glossary || []).find(x => x.id === id); const dom = t2 ? String(t2.domain || '').trim() : '';
            if (!_govBypass && t2 && govFeatureOn() && !govCanEdit(dom)) {
                if (!govCanPropose(dom)) return showError('Lecture seule sur ce domaine.');
                if (f === 'domain') return govGuard(dom, 'Le domaine métier d\'un terme');
                if (String(t2[f] || '') === String(v)) return;
                return govPropose({ kind: 'term', domain: dom, target: { termId: id }, field: f, label: (PROP_FIELD_LABELS[f] || f) + ' du terme « ' + t2.term + ' »', before: t2[f] || '', after: v });
            }
            return _w_updateGlossaryTerm(id, f, v);
        };
        // V10.2 — le domaine d'une SOURCE (thème de la table) est réservé au propriétaire, comme tout domaine.
        const _w_updateTableTheme = updateTableTheme;
        updateTableTheme = function (tId, v) {
            const t = state.tables[tId]; const dom = t ? String(t.theme || '').trim() : '';
            if (!_govBypass && t && govFeatureOn() && !govCanEdit(dom)) {
                if (dom === String(v || '').trim()) return;
                return govGuard(dom, 'Le domaine métier d\'une source');
            }
            return _w_updateTableTheme(tId, v);
        };
        const _w_updateGovAsset = updateGovAsset;
        updateGovAsset = function (id, f, v) {
            const a = assetById(id); const dom = a ? String(a.domain || '').trim() : '';
            if (!_govBypass && a && govFeatureOn() && !govCanEdit(dom)) {
                if (!govCanPropose(dom)) return showError('Lecture seule sur ce domaine.');
                if (f === 'owner' || f === 'domain') return govGuard(dom, f === 'domain' ? 'Le domaine métier' : 'Le responsable');
                const before = Array.isArray(a[f]) ? a[f].join(', ') : (a[f] || ''); const after = Array.isArray(v) ? v.join(', ') : v;
                if (String(before) === String(after)) return;
                return govPropose({ kind: 'asset', domain: dom, target: { assetId: id }, field: f, label: (PROP_FIELD_LABELS[f] || f) + ' de « ' + a.name + ' »', before, after, raw: v });
            }
            return _w_updateGovAsset(id, f, v);
        };
        function termCtxDomain(tk, ctx) { if (tk === 'asset') { const a = assetById(ctx.assetId); return a ? String(a.domain || '').trim() : ''; } const bo = (state.governance.businessObjects || []).find(x => x.id === ctx.boId); return boDomainOf(bo); }
        function termCtxCanEdit(tk, ctx) { if (tk === 'asset') return govCanEdit(termCtxDomain(tk, ctx)); const bo = (state.governance.businessObjects || []).find(x => x.id === ctx.boId); return bo ? govCanEditBo(bo) : govCanEdit(''); }
        function termCtxCanPropose(tk, ctx) { if (tk === 'asset') return govCanPropose(termCtxDomain(tk, ctx)); const bo = (state.governance.businessObjects || []).find(x => x.id === ctx.boId); return bo ? govCanProposeBo(bo) : govCanPropose(''); }
        const _w_termTagAdd = termTagAdd;
        termTagAdd = function (kind, ctx, name) {
            name = String(name || '').trim(); if (!name) return;
            const dom = termCtxDomain(kind, ctx);
            if (!_govBypass && govFeatureOn() && !termCtxCanEdit(kind, ctx)) {
                if (!termCtxCanPropose(kind, ctx)) return showError('Lecture seule sur ce domaine.');
                const t2 = termByName(name);
                return govPropose({ kind: 'termlink', domain: dom, target: { tk: kind, ctx }, field: 'add', label: 'Poser le terme « ' + (t2 ? t2.term : name) + ' »' + (t2 ? '' : ' (nouveau)') + ' sur ' + govTermCtxLabel(kind, ctx), before: '', after: name });
            }
            return _w_termTagAdd(kind, ctx, name);
        };
        const _w_termTagRemove = termTagRemove;
        termTagRemove = function (kind, ctx, termId) {
            const dom = termCtxDomain(kind, ctx);
            if (!_govBypass && govFeatureOn() && !termCtxCanEdit(kind, ctx)) {
                if (!termCtxCanPropose(kind, ctx)) return showError('Lecture seule sur ce domaine.');
                return govPropose({ kind: 'termlink', domain: dom, target: { tk: kind, ctx }, field: 'remove', label: 'Retirer le terme « ' + termNameOf(termId) + ' » de ' + govTermCtxLabel(kind, ctx), before: termNameOf(termId), after: termId });
            }
            return _w_termTagRemove(kind, ctx, termId);
        };
        function govTermCtxLabel(kind, ctx) { const g = state.governance; if (kind === 'asset') { const a = assetById(ctx.assetId); return a ? a.name : '?'; } const bo = (g.businessObjects || []).find(x => x.id === ctx.boId); if (!bo) return '?'; if (kind === 'bo') return 'l\'objet « ' + bo.name + ' »'; const r = (boAllAttrRows(bo) || []).find(x => x.el.id === ctx.elId); return '« ' + (r ? r.el.name : '?') + ' » (' + bo.name + ')'; }
        // ---- V10.2 : STRUCTURE d'un objet proposée par un contributeur ----
        // Principe « exécuter, comparer, annuler, proposer » : l'opération s'exécute réellement sur une copie
        // de travail (elle peut lire l'écran), on calcule ce qui a changé sur l'objet, on remet l'objet
        // dans son état d'avant et on enregistre la différence comme proposition. À la validation, la
        // différence est réappliquée sur l'objet. Rien n'est jamais écrasé sans l'accord du propriétaire.
        const BO_KEY_LABELS = { sources: 'sources', tables: 'tables', columns: 'colonnes', appIds: 'applications', elements: 'attributs', structure: 'facettes', sources: 'sources', references: 'références', hierarchies: 'hiérarchies', contextRules: 'règles de contexte', bizRules: 'règles métier', producedBy: 'produit par', consumedBy: 'consommé par', name: 'nom', status: 'statut', definition: 'définition', contributors: 'contributeurs', usedBy: 'utilisé par', history: 'historique' };
        function govValNames(v) { if (!Array.isArray(v)) return null; return v.map(x => (x && typeof x === 'object') ? (x.name || x.table || x.term || x.label || x.id || '') : (typeof assetById === 'function' && assetById(x) ? assetById(x).name : String(x))).filter(Boolean); }
        function govDescribeVal(v) { if (v == null || v === '') return 'vide'; if (Array.isArray(v)) return v.length + ' élément(s)'; if (typeof v === 'object') return 'renseigné'; return String(v); }
        function govDescribeChange(before, after) {
            if (after && after.__delta) {
                if (after.replace) return govDescribeChange(before, after.replace);
                const nm = x => (x && typeof x === 'object') ? (x.name || x.table || x.term || x.label || x.id || '') : (typeof assetById === 'function' && assetById(x) ? assetById(x).name : String(x));
                const parts = []; if (after.add.length) parts.push('+ ' + after.add.map(nm).join(', ')); if (after.rem.length) parts.push('− ' + after.rem.map(k => { const o = (before || []).find(x => x && x[after.key] === k); return o ? nm(o) : String(k); }).join(', '));
                if (after.mod && after.mod.length) parts.push('modifié : ' + after.mod.map(nm).join(', ')); if (after.order) parts.push('réordonné');
                return parts.join(' · ') || 'inchangé';
            }
            if (Array.isArray(before) || Array.isArray(after)) return govDescribeChange(before, govDelta(before, after));
            return govDescribeVal(after);
        }
        function govBoPatch(before, after) {
            const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]); const patch = {};
            keys.forEach(k => { if (k === 'history') return; const a = JSON.stringify(before[k] === undefined ? null : before[k]), b = JSON.stringify(after[k] === undefined ? null : after[k]); if (a !== b) patch[k] = after[k] === undefined ? null : after[k]; });
            return patch;
        }
        // Différence « par élément » sur une liste (attributs, sources, facettes…) : à la validation on
        // ajoute / retire / remplace seulement les éléments concernés, sans écraser ce qui a bougé entre-temps.
        function govDeltaKey(arr) { const objs = (arr || []).filter(x => x && typeof x === 'object'); if (!objs.length) return null; if (objs.every(x => x.id)) return 'id'; if (objs.every(x => x.table)) return 'table'; if (objs.every(x => x.name)) return 'name'; return null; }
        function govDelta(before, after) {
            before = Array.isArray(before) ? before : []; after = Array.isArray(after) ? after : [];
            const prim = [...before, ...after].every(x => !x || typeof x !== 'object');
            if (prim) return { __delta: true, key: null, add: after.filter(x => !before.includes(x)), rem: before.filter(x => !after.includes(x)), mod: [], order: null };
            const key = govDeltaKey([...before, ...after]); if (!key) return { __delta: true, key: null, replace: after };
            const bk = new Map(before.map(x => [x[key], x])), ak = new Map(after.map(x => [x[key], x]));
            const add = after.filter(x => !bk.has(x[key])), rem = before.filter(x => !ak.has(x[key])).map(x => x[key]);
            const mod = after.filter(x => bk.has(x[key]) && JSON.stringify(bk.get(x[key])) !== JSON.stringify(x));
            const ob = before.filter(x => ak.has(x[key])).map(x => x[key]), oa = after.filter(x => bk.has(x[key])).map(x => x[key]);
            return { __delta: true, key, add, rem, mod, order: JSON.stringify(ob) !== JSON.stringify(oa) ? after.map(x => x[key]) : null };
        }
        function govApplyDelta(cur, d) {
            if (!d || !d.__delta) return d; if (d.replace) return JSON.parse(JSON.stringify(d.replace));
            let arr = Array.isArray(cur) ? cur.slice() : [];
            if (!d.key) { arr = arr.filter(x => !d.rem.includes(x)); d.add.forEach(x => { if (!arr.includes(x)) arr.push(x); }); return arr; }
            arr = arr.filter(x => !d.rem.includes(x[d.key]));
            d.mod.forEach(m => { const i = arr.findIndex(x => x[d.key] === m[d.key]); if (i >= 0) arr[i] = JSON.parse(JSON.stringify(m)); });
            d.add.forEach(m => { if (!arr.some(x => x[d.key] === m[d.key])) arr.push(JSON.parse(JSON.stringify(m))); });
            if (d.order) { const pos = new Map(d.order.map((k, i) => [k, i])); arr.sort((a, b) => (pos.has(a[d.key]) ? pos.get(a[d.key]) : 1e9) - (pos.has(b[d.key]) ? pos.get(b[d.key]) : 1e9)); }
            return arr;
        }
        function govPatchToDeltas(snap, patch) { Object.keys(patch).forEach(k => { if (Array.isArray(patch[k]) || Array.isArray(snap[k])) patch[k] = govDelta(snap[k], patch[k]); }); return patch; }
        function govApplyPatch(obj, patch) { Object.keys(patch || {}).forEach(k => { const v = patch[k]; if (v === null) delete obj[k]; else if (v && v.__delta) obj[k] = govApplyDelta(obj[k], v); else obj[k] = JSON.parse(JSON.stringify(v)); }); }
        function govWrapBoAction(nm, what, boIdIndex, onlyIf) {
            const orig = window[nm]; if (typeof orig !== 'function') return;
            window[nm] = function () {
                const args = Array.prototype.slice.call(arguments); const boId = args[boIdIndex || 0];
                const list = state.governance.businessObjects || []; const bo = list.find(x => x.id === boId);
                if (_govBypass || !govFeatureOn() || !bo || govCanEditBo(bo) || (onlyIf && !onlyIf(args))) return orig.apply(this, arguments);
                const dom = boDomainOf(bo);
                if (!govCanProposeBo(bo)) { showError('Lecture seule sur le domaine' + (dom ? ' « ' + dom + ' »' : '') + '.'); return; }
                const snap = JSON.parse(JSON.stringify(bo)); const idx = list.indexOf(bo);
                _govBypass = true; let r; try { r = orig.apply(this, arguments); } finally { _govBypass = false; }
                const now = (state.governance.businessObjects || []).find(x => x.id === boId);
                let patch = null, del = false;
                if (!now) del = true;
                else { patch = govBoPatch(snap, now); ['domain', 'globalOwner', 'ownerId'].forEach(k => delete patch[k]); govPatchToDeltas(snap, patch); }
                // remise à l'état d'avant
                if (del) state.governance.businessObjects.splice(Math.min(idx, state.governance.businessObjects.length), 0, snap);
                else state.governance.businessObjects[state.governance.businessObjects.indexOf(now)] = snap;
                persistAppState();
                if (!del && !Object.keys(patch).length) { renderGovernance(); return r; }
                const before = del ? 'objet présent' : Object.keys(patch).map(k => (BO_KEY_LABELS[k] || k) + ' : ' + govDescribeVal(snap[k])).join(' ; ');
                const after = del ? 'objet supprimé' : Object.keys(patch).map(k => (BO_KEY_LABELS[k] || k) + ' : ' + govDescribeChange(snap[k], patch[k])).join(' ; ');
                govPropose({ kind: 'action', domain: dom, target: { boId, fn: nm, sig: del ? 'del' : JSON.stringify(patch) }, field: nm, label: what + ' — objet « ' + snap.name + ' »', before, after, patch, del });
                return r;
            };
        }
        function propApplyAction(p) {
            if (p.target.assetId) { const a2 = assetById(p.target.assetId); if (!a2) return; if (Array.isArray(p.args) && _govAssetOrig[p.target.fn]) { _govAssetOrig[p.target.fn].apply(null, p.args); return; } govApplyPatch(a2, p.patch); persistAppState(); return; }
            const list = state.governance.businessObjects || []; const bo = list.find(x => x.id === p.target.boId); if (!bo) return;
            if (p.del) { removeBusinessObject(bo.id); return; }
            govApplyPatch(bo, p.patch);
            persistAppState();
        }
        [['addBoElement', 'Ajouter un attribut'], ['boAddAttrAndSelect', 'Ajouter un attribut'], ['removeBoElement', 'Supprimer un attribut'], ['updateBoElement', 'Modifier un attribut'], ['boMoveEl', 'Réordonner les attributs'],
         ['addBoMapping', 'Rattacher une colonne'], ['removeBoMapping', 'Détacher une colonne'],
         ['addBoStructure', 'Créer une facette'], ['boAddFacetAndSelect', 'Créer une facette'], ['removeBoStructure', 'Supprimer une facette'], ['updateBoFacet', 'Modifier une facette'], ['addFacetElement', 'Ajouter un attribut de facette'], ['removeFacetElement', 'Supprimer un attribut de facette'], ['updateFacetElement', 'Modifier un attribut de facette'], ['addFacetScope', 'Ajouter un périmètre de facette'], ['removeFacetScope', 'Retirer un périmètre de facette'], ['addFacetApplies', 'Ajouter une application de facette'], ['removeFacetApplies', 'Retirer une application de facette'],
         ['addBoReference', 'Ajouter une référence'], ['removeBoReference', 'Retirer une référence'],
         ['addBoHierarchy', 'Ajouter une hiérarchie'], ['removeBoHierarchy', 'Supprimer une hiérarchie'], ['updateBoHier', 'Modifier une hiérarchie'], ['addBoHierLevel', 'Ajouter un niveau de hiérarchie'], ['removeBoHierLevel', 'Retirer un niveau de hiérarchie'], ['toggleBoHierLevelParent', 'Modifier un niveau de hiérarchie'],
         ['updateBoContext', 'Changer l\'attribut de contexte'], ['addBoContextRule', 'Ajouter une règle de contexte'], ['updateBoContextRule', 'Modifier une règle de contexte'], ['removeBoContextRule', 'Supprimer une règle de contexte'],
         ['addBoSource', 'Ajouter une source'], ['removeBoSource', 'Retirer une source'], ['updateBoSourceRole', 'Changer le rôle d\'une source'], ['boSrcAddFilter', 'Ajouter un filtre de source'], ['boSrcDelFilter', 'Retirer un filtre de source'],
         ['updateBoApp', 'Changer l\'application'], ['wfSetBoStatus', 'Changer le statut'], ['removeBusinessObject', 'Supprimer l\'objet']].forEach(([nm, what]) => govWrapBoAction(nm, what, 0));
        govWrapBoAction('toggleAssetLink', 'Modifier les applications de l\'objet', 1, args => args[0] === 'bo');
        // Même mécanisme pour la structure d'une APPLICATION / d'un PROCESSUS (sources, colonnes, applications liées).
        const _govAssetOrig = {};
        function govWrapAssetAction(nm, what, idIndex) {
            const orig = window[nm]; if (typeof orig !== 'function') return; _govAssetOrig[nm] = orig;
            window[nm] = function () {
                const args = Array.prototype.slice.call(arguments); const id = args[idIndex || 0];
                const list = state.governance.assets || []; const a2 = list.find(x => x.id === id); const dom = a2 ? String(a2.domain || '').trim() : '';
                if (_govBypass || !govFeatureOn() || !a2 || govCanEdit(dom)) return orig.apply(this, arguments);
                if (!govCanPropose(dom)) { showError('Lecture seule sur le domaine' + (dom ? ' « ' + dom + ' »' : '') + '.'); return; }
                // ces opérations touchent aussi le dictionnaire, les autres applications et les objets : on
                // photographie tout ce qui peut bouger, on exécute, on compare l'application, on restaure tout.
                const g = state.governance; const snapAll = JSON.stringify({ assets: g.assets || [], dictionary: g.dictionary || {}, businessObjects: g.businessObjects || [] });
                const snap = JSON.parse(JSON.stringify(a2));
                _govBypass = true; let r; try { r = orig.apply(this, arguments); } finally { _govBypass = false; }
                const now = (g.assets || []).find(x => x.id === id); const patch = now ? govBoPatch(snap, now) : {}; ['domain', 'owner'].forEach(k => delete patch[k]); govPatchToDeltas(snap, patch);
                const back = JSON.parse(snapAll); g.assets = back.assets; g.dictionary = back.dictionary; g.businessObjects = back.businessObjects; persistAppState();
                if (!Object.keys(patch).length) { renderGovernance(); return r; }
                const before = Object.keys(patch).map(k => (BO_KEY_LABELS[k] || k) + ' : ' + govDescribeVal(snap[k])).join(' ; ');
                const after = Object.keys(patch).map(k => (BO_KEY_LABELS[k] || k) + ' : ' + govDescribeChange(snap[k], patch[k])).join(' ; ');
                // à la validation : on rejoue l'opération (mêmes effets de bord), sauf si elle lit l'écran (patch)
                govPropose({ kind: 'action', domain: dom, target: { assetId: id, fn: nm, sig: JSON.stringify(patch) }, field: nm, label: what + ' — « ' + snap.name + ' »', before, after, patch, args: nm === 'addAssetCol' ? null : args });
                return r;
            };
        }
        [['toggleAppSource', 'Modifier les sources de l\'application'], ['toggleAssetTable', 'Modifier les tables'], ['addAssetCol', 'Ajouter une colonne'], ['removeAssetCol', 'Retirer une colonne'], ['assetAppLink', 'Modifier les applications du processus']].forEach(([nm, what]) => govWrapAssetAction(nm, what, 0));
        // Propositions de structure en attente sur un objet (affichées dans sa fiche).
        function propActionsHtml(boId, assetId) {
            const ps = govProposals().filter(x => x.status === 'pending' && x.kind === 'action' && (assetId ? x.target.assetId === assetId : x.target.boId === boId)); if (!ps.length) return '';
            return '<div class="mt-3 border border-amber-200 bg-amber-50/60 rounded-xl p-3"><div class="text-[10px] uppercase font-bold text-amber-800 mb-1.5">⏳ Propositions de structure en attente (' + ps.length + ')</div>' + ps.map(p => '<div class="prop-badge" title="Proposé le ' + new Date(p.at).toLocaleString('fr-FR') + '"><span class="who">' + escapeHTML(govPersonName(p.by)) + ' — ' + escapeHTML(p.label.replace(/ — (objet )?«.*$/, '')) + ' :</span> <span class="val">' + escapeHTML(p.after) + '</span>' + (propCanDecide(p) ? '<span class="acts"><button data-ro="keep" onclick="propAccept(\'' + p.id + '\')" class="ok" title="Valider et appliquer">✓ Valider</button><button data-ro="keep" onclick="propReject(\'' + p.id + '\')" class="ko" title="Refuser">✕</button></span>' : ((curUser() || {}).id === p.by ? '<span class="acts"><button data-ro="keep" onclick="propWithdraw(\'' + p.id + '\')" class="ko">retirer</button></span>' : '')) + '</div>').join('') + '</div>';
        }
        // Dictionnaire par table technique : le domaine d'une source est son « thème ».
        function tableDomainOf(tn) { const t = tableByName(tn); return t ? String(t.theme || '').trim() : ''; }
        const _w_updateDictColField = updateDictColField;
        updateDictColField = function (tn, col, f, v) {
            const dom = tableDomainOf(tn);
            if (!_govBypass && govFeatureOn() && !govCanEdit(dom) && ['definition', 'examples', 'sensitivity', 'term', 'technicalType'].includes(f)) {
                if (!govCanPropose(dom)) return showError('Lecture seule sur le domaine' + (dom ? ' « ' + dom + ' »' : '') + '.');
                const cur = ((ensureDictEntry(tn).columns || {})[col] || {})[f] || '';
                if (String(cur) === String(v)) return;
                return govPropose({ kind: 'dictcol', domain: dom, target: { tn, col }, field: f, label: (PROP_FIELD_LABELS[f] || f) + ' de la colonne ' + tn + '.' + col, before: f === 'term' ? termNameOf(cur) : cur, after: f === 'term' ? termNameOf(v) : v, raw: v });
            }
            return _w_updateDictColField(tn, col, f, v);
        };
        const _w_updateDictField = updateDictField;
        updateDictField = function (tn, f, v) {
            const dom = tableDomainOf(tn);
            if (!_govBypass && govFeatureOn() && !govCanEdit(dom) && ['description', 'owner', 'steward', 'sensitivity', 'sourceSystem', 'status'].includes(f)) {
                if (!govCanPropose(dom)) return showError('Lecture seule sur le domaine' + (dom ? ' « ' + dom + ' »' : '') + '.');
                if (f === 'owner') return govGuard(dom, 'Le propriétaire d\'une source');
                const cur = ensureDictEntry(tn)[f] || ''; if (String(cur) === String(v)) return;
                return govPropose({ kind: 'dict', domain: dom, target: { tn }, field: f, label: (PROP_FIELD_LABELS[f] || f) + ' de la source ' + tn, before: cur, after: v });
            }
            return _w_updateDictField(tn, f, v);
        };
        // ---- Sélecteur « Vous êtes » (en-tête) ----
        function renderUserSwitch() {
            const box = el('v7UserSwitch'); if (!box) return;
            if (!govFeatureOn()) { box.innerHTML = ''; box.style.display = 'none'; return; }
            box.style.display = '';
            const u = curUser(); const n = u ? propCountPendingFor(u) : 0;
            box.innerHTML = `<span class="usw-lbl">Vous êtes</span><select data-ro="keep" onchange="govSetUser(this.value)" aria-label="Profil actif" title="Profil actif sur ce poste (choix déclaratif)"><option value="">— choisir —</option>${govPeople().map(p => `<option value="${p.id}" ${u && u.id === p.id ? 'selected' : ''}>${escapeHTML(p.name)}</option>`).join('')}</select>${u ? `<span class="usw-role" title="${escapeHTML(govRoleSummary(u))}">${(u.roles || []).slice(0, 2).map(r => (GOV_ROLES[r.role] || ['', r.role])[0]).join('')}</span>` : ''}${n ? `<button data-ro="keep" onclick="openGovTab('review')" class="usw-todo" title="Propositions à valider dans vos domaines">${n} à valider</button>` : ''}`;
        }
        // ---- Écran Personnes & rôles ----
        function govAddPerson() { govPeople().push({ id: 'pe_' + generateId(), name: 'Nouvelle personne', email: '', roles: [] }); persistAppState(); renderGovernance(); }
        function govSetPerson(id, f, v) { const p = govPeople().find(x => x.id === id); if (p) { p[f] = v; persistAppState(); if (f === 'name') { renderNav(); renderGovernance(); } } }
        function govRemovePerson(id) { state.governance.people = govPeople().filter(x => x.id !== id); if (govState.userId === id) govSetUser(''); persistAppState(); renderNav(); renderGovernance(); }
        function govAddRole(id) { const p = govPeople().find(x => x.id === id); if (!p) return; const dom = (el('pe-dom-' + id) || {}).value || '', role = (el('pe-role-' + id) || {}).value || 'contrib'; p.roles = p.roles || []; if (!p.roles.some(r => r.domain === dom && r.role === role)) p.roles.push({ domain: dom, role }); persistAppState(); renderNav(); renderGovernance(); }
        function govRemoveRole(id, i) { const p = govPeople().find(x => x.id === id); if (!p) return; (p.roles || []).splice(i, 1); persistAppState(); renderNav(); renderGovernance(); }
        function govDemoPeople() {
            // Exemple de jeu de rôles : quatre personnes, rôles sur TOUS les domaines. Vos objets,
            // termes et sources ne sont pas modifiés.
            const mk = (name, email, roles) => { if (!govPeople().some(p => p.name === name)) govPeople().push({ id: 'pe_' + generateId(), name, email, roles }); };
            mk('Alice Martin', 'alice@exemple.fr', [{ domain: '', role: 'owner' }]);
            mk('Bob Durand', 'bob@exemple.fr', [{ domain: '', role: 'contrib' }]);
            mk('Chloé Petit', 'chloe@exemple.fr', [{ domain: '', role: 'reader' }]);
            mk('Admin gouvernance', 'admin@exemple.fr', [{ domain: '', role: 'admin' }]);
            persistAppState(); govSetUser(govPeople().find(p => p.name === 'Bob Durand').id);
            showSuccess('Exemple créé : Alice (propriétaire), Bob (contributeur), Chloé (lectrice), Admin — sur tous vos domaines, sans toucher à vos données. Vous êtes Bob : modifiez une définition, puis passez en Alice pour la valider. Renommez ou remplacez ces personnes par les vôtres.');
        }
        function renderGovPeople() {
            const doms = govDomains(); const u = curUser();
            let html = `<div class="flex items-center justify-between gap-3 flex-wrap mb-4"><p class="text-sm text-slate-600 max-w-3xl">Chaque personne a un ou plusieurs couples <b>domaine métier → rôle</b>. Le <b>propriétaire</b> modifie et valide ; le <b>contributeur</b> propose ; le <b>lecteur</b> consulte. Le profil actif se choisit dans l'en-tête (« Vous êtes »). Le <b>propriétaire nommé sur un objet</b> (champ « Propriétaire global ») valide aussi cet objet, quel que soit son rôle sur le domaine. Le contributeur peut proposer <b>tout</b> (définitions, attributs, colonnes, facettes, sources, applications, règles, termes…) ; seuls le <b>propriétaire</b> et le <b>domaine métier</b> d'un élément lui sont fermés (🔒). Toutes les décisions s'appliquent à vos données et sont tracées.</p>
                <div class="flex gap-2"><button onclick="govDemoPeople()" class="text-xs bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg font-bold hover:bg-slate-50" title="Crée quatre personnes d'exemple (propriétaire, contributeur, lectrice, administrateur) sur tous les domaines, sans modifier vos données">Exemple de rôles</button><button onclick="govAddPerson()" class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg">+ Personne</button></div></div>`;
            html += `<div class="flex items-center gap-2 flex-wrap mb-4 bg-white border border-slate-200 rounded-xl p-3"><span class="text-[10px] uppercase font-bold text-slate-500">Domaines métier</span>${doms.length ? doms.map(d => { const ut = govDomainUsageText(govDomainUsage(d)); return `<span class="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-2.5 py-1 font-bold inline-flex items-center gap-1.5" title="${escapeHTML(ut || 'non utilisé')}">${escapeHTML(d)}${ut ? `<span class="font-normal opacity-70">· ${escapeHTML(ut)}</span>` : ''}<button onclick="govRemoveDomain('${escapeHTML(d)}')" class="opacity-60 hover:opacity-100 hover:text-red-600" title="Supprimer ce domaine partout">✕</button></span>`; }).join('') : '<span class="text-xs text-slate-400 italic">aucun — ajoutez-en un, ou renseignez le domaine des sources, objets, applications</span>'}<input type="text" id="govNewDom" placeholder="＋ nouveau domaine…" class="border border-dashed border-emerald-300 rounded-full px-3 py-1 text-xs w-44" onkeydown="if(event.key==='Enter'){govAddDomain(this.value); this.value='';}"><button onclick="govAddDomain(el('govNewDom').value); el('govNewDom').value=''" class="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-full font-bold">Ajouter</button></div>`;
            if (!govPeople().length) return html + emptyStateHtml('👥', 'Aucune personne', 'Créez les personnes de votre organisation et affectez-leur un rôle par domaine ; le propriétaire nommé sur un objet valide cet objet. Un exemple de rôles peut aussi être créé pour essayer le circuit.', '+ Personne', 'govAddPerson()');
            html += govPeople().map(p => `<div class="border ${u && u.id === p.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'} rounded-xl p-4 mb-3 bg-white">
                <div class="flex items-center gap-2 flex-wrap mb-2">
                    <span class="cat-oav" style="background:${catOwnColor(p.name)}">${escapeHTML(p.name.split(/\s+/).map(x => x[0] || '').join('').toUpperCase().slice(0, 2))}</span>
                    <input type="text" value="${escapeHTML(p.name)}" onchange="govSetPerson('${p.id}','name',this.value)" class="font-bold text-sm border border-slate-300 px-2.5 py-1.5 rounded-lg w-56 bg-white" aria-label="Nom">
                    <input type="text" value="${escapeHTML(p.email || '')}" onchange="govSetPerson('${p.id}','email',this.value)" placeholder="e-mail" class="text-xs border border-slate-200 px-2.5 py-1.5 rounded-lg w-56 bg-white" aria-label="E-mail">
                    ${u && u.id === p.id ? '<span class="text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800 rounded-full px-2 py-0.5">profil actif</span>' : `<button data-ro="keep" onclick="govSetUser('${p.id}')" class="text-[11px] font-bold text-indigo-700 hover:underline">Devenir cette personne</button>`}
                    <button onclick="govRemovePerson('${p.id}')" class="ml-auto text-red-500 hover:text-red-700 px-2 py-1 rounded-lg border border-red-200 bg-white text-xs font-bold" title="Supprimer">🗑</button></div>
                <div class="flex items-center gap-1.5 flex-wrap"><span class="text-[10px] uppercase font-bold text-slate-500 w-36">Domaines → rôles</span>
                    ${(p.roles || []).map((r, i) => `<span class="text-xs rounded-full px-2.5 py-1 font-bold inline-flex items-center gap-1.5 ${r.role === 'owner' ? 'bg-amber-50 border border-amber-300 text-amber-900' : (r.role === 'contrib' ? 'bg-sky-50 border border-sky-300 text-sky-900' : (r.role === 'admin' ? 'bg-slate-800 text-white' : 'bg-slate-100 border border-slate-300 text-slate-700'))}">${(GOV_ROLES[r.role] || ['🛠', 'Administrateur'])[0]} ${escapeHTML(r.domain || 'tous domaines')} · ${(GOV_ROLES[r.role] || ['', 'Administrateur'])[1]}<button onclick="govRemoveRole('${p.id}',${i})" class="opacity-60 hover:opacity-100" title="Retirer">✕</button></span>`).join('') || '<span class="text-xs text-slate-400 italic">aucun rôle</span>'}
                    <select id="pe-dom-${p.id}" class="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"><option value="">tous domaines</option>${doms.map(d => `<option>${escapeHTML(d)}</option>`).join('')}</select>
                    <select id="pe-role-${p.id}" class="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">${Object.entries(GOV_ROLES).map(([k, v]) => `<option value="${k}">${v[0]} ${v[1]}</option>`).join('')}<option value="admin">🛠 Administrateur</option></select>
                    <button onclick="govAddRole('${p.id}')" class="text-xs bg-white border border-slate-300 px-2.5 py-1 rounded-lg font-bold hover:bg-slate-50">+ Rôle</button></div>
            </div>`).join('');
            return html;
        }
        // ---- Écran « À valider » ----
        function renderGovReview() {
            const u = curUser(); const all = govProposals();
            if (govState.reviewMine === undefined) govState.reviewMine = true;
            if (!govFeatureOn()) return emptyStateHtml('✅', 'Aucun circuit de validation', 'Déclarez des personnes et leurs rôles par domaine : les contributeurs proposeront, les propriétaires valideront ici.', 'Personnes & rôles', "openGovTab('people')");
            const mine = p => !u || govRoleIn(p.domain) === 'owner' || govRoleIn(p.domain) === 'admin';
            const byMe = p => u && p.by === u.id;
            let pend = all.filter(p => p.status === 'pending');
            const view = govState.reviewView || 'todo';
            let list = view === 'byme' ? pend.filter(byMe) : (govState.reviewMine ? pend.filter(mine) : pend);
            const done = all.filter(p => p.status !== 'pending').sort((a, b) => (b.decidedAt || '').localeCompare(a.decidedAt || ''));
            const groups = new Map();
            list.forEach(p => { const k = propGroupKey(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
            const byDom = new Map();
            groups.forEach((ps, k) => { const d = ps[0].domain || 'Sans domaine'; if (!byDom.has(d)) byDom.set(d, []); byDom.get(d).push([k, ps]); });
            let html = `<div class="flex items-center gap-2 flex-wrap mb-4">
                <div class="bo-filt" role="group"><button data-ro="keep" class="${view === 'todo' ? 'on' : ''}" onclick="govState.reviewView='todo'; renderGovernance()">✅ À valider${pend.filter(mine).length ? ' (' + pend.filter(mine).length + ')' : ''}</button><button data-ro="keep" class="${view === 'byme' ? 'on' : ''}" onclick="govState.reviewView='byme'; renderGovernance()">✍️ Proposées par moi${pend.filter(byMe).length ? ' (' + pend.filter(byMe).length + ')' : ''}</button></div>
                ${view === 'todo' ? `<label data-ro="keep" class="text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1 cursor-pointer"><input type="checkbox" ${govState.reviewMine ? 'checked' : ''} onchange="govState.reviewMine=this.checked; renderGovernance()"> mes domaines seulement</label>` : ''}
                <span class="flex-grow"></span><span class="text-[11px] text-slate-500">${u ? 'Vous êtes <b>' + escapeHTML(u.name) + '</b> — ' + escapeHTML(govRoleSummary(u)) : 'Aucun profil actif : choisissez « Vous êtes » dans l\'en-tête'}</span></div>`;
            if (!list.length) html += emptyStateHtml('🎉', view === 'byme' ? 'Aucune proposition en attente de votre part' : 'Rien à valider', view === 'byme' ? 'Modifiez une définition, un exemple, une sensibilité ou posez un terme sur un objet de votre domaine : votre proposition apparaîtra ici.' : 'Aucune proposition en attente dans vos domaines. Les contributeurs verront leurs modifications arriver ici.', '', '');
            byDom.forEach((grps, d) => {
                html += `<div class="mb-4"><div class="text-[10px] uppercase font-bold tracking-wider text-emerald-700 mb-2">Domaine ${escapeHTML(d)}</div>`;
                grps.forEach(([k, ps]) => {
                    const can = govCanEdit(ps[0].domain);
                    html += `<div class="border border-slate-200 rounded-xl bg-white mb-3 overflow-hidden">
                        <div class="flex items-center gap-2 flex-wrap px-4 py-2.5 bg-slate-50 border-b border-slate-100"><button data-ro="keep" onclick="propOpenTarget('${ps[0].id}')" class="font-black text-sm text-slate-800 hover:underline" title="Ouvrir la fiche">${escapeHTML(propGroupLabel(k))}</button><span class="text-[11px] text-slate-500">${ps.length} proposition(s)</span><span class="flex-grow"></span>${can && ps.length > 1 ? `<button data-ro="keep" onclick="propAcceptAll(${JSON.stringify(k).replace(/"/g, '&quot;')})" class="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg font-bold">✓ Tout valider pour cette fiche</button>` : ''}</div>
                        ${ps.map(p => `<div class="prop-row"><div class="min-w-0 flex-1"><div class="text-[12.5px] font-semibold text-slate-800">${escapeHTML(p.label)}</div><div class="prop-diff"><span class="b" title="Valeur en vigueur">${propFmt(p.before)}</span><span class="arrow">→</span><span class="a" title="Valeur proposée">${propFmt(p.after)}</span></div><div class="text-[10.5px] text-slate-500 mt-0.5">par ${escapeHTML(govPersonName(p.by))} · ${new Date(p.at).toLocaleString('fr-FR')}</div></div>
                            <div class="flex items-center gap-1.5 shrink-0">${can ? `<button data-ro="keep" onclick="propAccept('${p.id}')" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold">✓ Valider</button><button data-ro="keep" onclick="propReject('${p.id}')" class="text-xs bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded-lg font-bold hover:bg-red-50">✕ Refuser</button>` : (byMe(p) ? `<button data-ro="keep" onclick="propWithdraw('${p.id}')" class="text-xs bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg font-bold">Retirer</button>` : '<span class="text-[11px] text-slate-400 italic">en attente du propriétaire</span>')}<button data-ro="keep" onclick="propOpenTarget('${p.id}')" class="text-xs text-indigo-700 font-bold px-2 py-1.5 hover:underline" title="Voir en contexte">Voir ›</button></div></div>`).join('')}
                    </div>`;
                });
                html += '</div>';
            });
            if (done.length) html += `<details class="border border-slate-200 rounded-xl bg-white mt-2"><summary class="cursor-pointer select-none px-4 py-2.5 text-xs font-bold text-slate-600">🗂 Décisions passées (${done.length})</summary><div class="px-4 pb-3">${done.slice(0, 50).map(p => `<div class="flex items-center gap-2 py-1.5 border-b border-slate-50 text-[12px]"><span class="${p.status === 'accepted' ? 'text-emerald-700' : 'text-red-600'} font-bold w-16">${p.status === 'accepted' ? '✓ validée' : '✕ refusée'}</span><span class="flex-1 min-w-0 truncate">${escapeHTML(p.label)} <span class="text-slate-400">— ${propFmt(p.before)} → ${propFmt(p.after)}</span></span><span class="text-[10.5px] text-slate-500 whitespace-nowrap">par ${escapeHTML(govPersonName(p.decidedBy))} · ${new Date(p.decidedAt).toLocaleDateString('fr-FR')}${p.comment ? ' · ' + escapeHTML(p.comment) : ''}</span></div>`).join('')}</div></details>`;
            return html;
        }
        // Sélecteur de domaine réutilisable (objet, terme)
        function govLockedHint() { return '<div class="hint">🔒 réservé au propriétaire</div>'; }
        function govDomainSelectHtml(cur, onch, id, locked) { const doms = govDomains(); return `<select ${id ? 'id="' + id + '"' : ''} ${locked ? 'disabled' : ''} onchange="${onch}" class="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white ${locked ? 'opacity-60 cursor-not-allowed' : ''}" title="${locked ? 'Réservé au propriétaire du domaine' : 'Domaine métier — détermine qui valide'}"><option value="">— domaine —</option>${doms.map(d => `<option ${d === cur ? 'selected' : ''}>${escapeHTML(d)}</option>`).join('')}${cur && !doms.includes(cur) ? `<option selected>${escapeHTML(cur)}</option>` : ''}</select>`; }
