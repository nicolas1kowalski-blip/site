        // ==========================================================================================
        //  LINEAGE AUGMENTÉ & RÉCONCILIATION (V5) — carte du flux A→B→C… + contrôles de fraîcheur et
        //  de distorsion. Le lineage dit OÙ regarder ; la réconciliation dit SI c'est cohérent.
        //  Modèle table-centré (v5.3.0) : state.governance.flow = { nodes:[], edges:[], threshold:1.0 }
        //    node = { id, name(=table), origine?(système amont), domain, tableName?, icon? }
        //           → le rôle (maître/référentiel/consommateur) et la consolidation sont DÉDUITS de la topologie.
        //    edge = { id, source, target, srcKey/tgtKey, attrPairs[], transformation, slaHours, lastRun? }
        //           → le type (alimente/consolide) est DÉDUIT : cible à ≥ 2 entrants = consolidation.
        // ==========================================================================================
        const LF_ROLE = {
            master: { lbl: 'Maître', ic: '🗄', col: 0, badge: 'lf-r-master' },
            source: { lbl: 'Source', ic: '📄', col: 0, badge: 'lf-r-src' },
            reference: { lbl: 'Référentiel', ic: '🏛', col: 1, badge: 'lf-r-ref' },
            consumer: { lbl: 'Consommateur', ic: '📊', col: 2, badge: 'lf-r-cons' },
            app: { lbl: 'Application', ic: '🖥', col: 0, badge: 'lf-r-app' },
            object: { lbl: 'Objet métier', ic: '🏛️', col: 1, badge: 'lf-r-obj' }
        };
        const LF_EDGE_TYPES = {
            feeds: 'Alimente',
            consolidates: 'Consolide',
            transforms: 'Transforme',
            reads: 'Lecture',
            writes: 'Écrit',
            composes: 'Compose',
            diffuses: 'Diffuse',
            represents: 'Représente',
            produces: 'Produit',
            consumes: 'Consommé par'
        };
        // Nature d'une alimentation table→table (v5.13) : comment la cible reçoit la donnée.
        const LF_NATURE = { recopie: 'Recopie', complement: 'Complément', correction: 'Correction' };
        function lfEdgeNature(e) {
            return e && LF_NATURE[e.nature] ? e.nature : 'recopie';
        }
        let lfView = 'systems';
        let lfEditNodeId = null,
            lfEditEdgeId = null;
        function lfEdgeKeys(e) {
            return {
                sK: e.srcKey || e.key || '',
                tK: e.tgtKey || e.key || '',
                sA: e.srcAttr || e.attr || '',
                tA: e.tgtAttr || e.attr || ''
            };
        }
        const LF_XFORM_AGG = { sum: 'Somme', avg: 'Moyenne', min: 'Min', max: 'Max', count: 'Nombre' };
        const LF_XFORM_SCALAR = {
            round: 'Arrondi',
            factor: '× facteur',
            abs: 'Valeur absolue',
            upper: 'MAJUSCULES',
            lower: 'minuscules',
            trim: 'Espaces nettoyés'
        };
        const LF_QUICK_XF = [
            ['none', 'Comparaison directe', { kind: 'none' }],
            ['sum', 'Somme par clé', { kind: 'agg', fn: 'sum' }],
            ['avg', 'Moyenne par clé', { kind: 'agg', fn: 'avg' }],
            ['count', 'Nombre par clé', { kind: 'agg', fn: 'count' }],
            ['round2', 'Arrondi (2 déc.)', { kind: 'scalar', op: 'round', param: '2' }],
            ['upper', 'MAJUSCULES', { kind: 'scalar', op: 'upper', param: '' }],
            ['lower', 'minuscules', { kind: 'scalar', op: 'lower', param: '' }],
            ['trim', 'Espaces nettoyés', { kind: 'scalar', op: 'trim', param: '' }]
        ];
        function lfModel() {
            const governance = state.governance;
            governance.flow = governance.flow || {};
            if (!Array.isArray(governance.flow.nodes)) governance.flow.nodes = [];
            if (!Array.isArray(governance.flow.edges)) governance.flow.edges = [];
            if (typeof governance.flow.threshold !== 'number') governance.flow.threshold = 1.0;
            if (typeof governance.flow.showObjects !== 'boolean') governance.flow.showObjects = true; // objets métier affichés par défaut
            if (typeof governance.flow.hideSources !== 'boolean') governance.flow.hideSources = true; // V6.7 : sources repliées DANS leur application
            if (governance.flow.grain !== 'table') governance.flow.grain = 'bo'; // V6.11 : lecture MÉTIER par défaut (objets métier, pas tables)
            return governance.flow;
        }
        // Brique commune de repli : applique une correspondance nœud → nœud absorbant, reporte les liens
        // et fusionne les doublons. Un lien devenu interne (source = cible) disparaît.
        function lfFoldGraph(nodes, edges, fold) {
            const ids = Object.keys(fold);
            if (!ids.length) return { nodes, edges, foldCount: {} };
            const foldCount = {};
            ids.forEach(id => {
                foldCount[fold[id]] = (foldCount[fold[id]] || 0) + 1;
            });
            const map = id => fold[id] || id;
            const byId = {};
            nodes.forEach(n => (byId[n.id] = n));
            const kindOf = id => {
                const n = byId[id];
                return n ? lfNodeKind(n) : 'table';
            };
            const seen = new Set();
            const out = [];
            edges.forEach(e => {
                const s = map(e.source),
                    t = map(e.target);
                if (s === t) return; // lien devenu interne au nœud absorbant
                let rel = lfEdgeRel(e);
                // Le sens métier prime : ce qui arrivait sur une table absorbée par un objet devient
                // « produit », ce qui en partait vers une application devient « consommé par ».
                const ks = kindOf(s),
                    kt = kindOf(t);
                if (kt === 'object' && (rel === 'writes' || rel === 'feeds') && ks === 'app') rel = 'produces';
                else if (ks === 'object' && (rel === 'reads' || rel === 'feeds') && kt === 'app') rel = 'consumes';
                else if (kt === 'object' && rel === 'composes') rel = 'composes';
                const k = s + '¦' + t + '¦' + rel;
                if (seen.has(k)) return;
                seen.add(k);
                out.push(
                    s === e.source && t === e.target && rel === lfEdgeRel(e)
                        ? e
                        : Object.assign({}, e, { source: s, target: t, rel, _folded: true })
                );
            });
            return { nodes: nodes.filter(n => !fold[n.id]), edges: out, foldCount };
        }
        // V6.11 : LECTURE MÉTIER — le lineage se lit en OBJETS MÉTIER, pas en tables. Chaque table qui
        // compose un objet métier est absorbée par cet objet ; ses alimentations deviennent des liens
        // entre objets. Les tables qui ne composent aucun objet retombent dans leur application (V6.7).
        function lfCollapseToObjects(nodes, edges) {
            if (lfModel().grain !== 'bo') return { nodes, edges, foldCount: {}, unqualified: [] };
            const byId = {};
            nodes.forEach(n => (byId[n.id] = n));
            const fold = {};
            // 1. table qui COMPOSE un objet métier → absorbée par cet objet
            edges.forEach(e => {
                if (lfEdgeRel(e) !== 'composes') return;
                const sourceNode = byId[e.source],
                    targetNode = byId[e.target];
                if (
                    sourceNode &&
                    targetNode &&
                    lfNodeKind(sourceNode) === 'table' &&
                    lfNodeKind(targetNode) === 'object' &&
                    !fold[sourceNode.id]
                )
                    fold[sourceNode.id] = targetNode.id;
            });
            // 2. table DIFFUSÉE par un objet (destinataire) → absorbée par ce même objet
            edges.forEach(e => {
                if (lfEdgeRel(e) !== 'diffuses') return;
                const sourceNode = byId[e.source],
                    targetNode = byId[e.target];
                if (
                    sourceNode &&
                    targetNode &&
                    lfNodeKind(sourceNode) === 'object' &&
                    lfNodeKind(targetNode) === 'table' &&
                    !fold[targetNode.id]
                )
                    fold[targetNode.id] = sourceNode.id;
            });
            // 3. table restante → son APPLICATION propriétaire (c'est elle le maître du fichier)
            nodes.forEach(n => {
                if (lfNodeKind(n) !== 'table' || fold[n.id]) return;
                const prod = lfProducerOf(n.id);
                if (prod && byId[prod.id] && prod.id !== n.id) fold[n.id] = prod.id;
            });
            // 4. tables ni rattachées à un objet ni possédées par une application : elles n'ont pas de
            //    sens métier — on les SORT de la lecture métier et on les liste dans le bandeau.
            const unqualified = nodes.filter(n => lfNodeKind(n) === 'table' && !fold[n.id]);
            const drop = new Set(unqualified.map(n => n.id));
            const graph = lfFoldGraph(nodes, edges, fold);
            return {
                nodes: graph.nodes.filter(n => !drop.has(n.id)),
                edges: graph.edges.filter(e => !drop.has(e.source) && !drop.has(e.target)),
                foldCount: graph.foldCount,
                unqualified
            };
        }
        // V6.22 : FOCUS SUR UN OBJET MÉTIER. Sur une carte chargée, on veut voir « qui alimente ce
        // référentiel et qui le consomme » sans le reste. On garde l'objet, ses voisins directs, et
        // — au rayon 2 — les voisins de ces voisins, pour remonter jusqu'aux sources amont.
        function lfFocusBo(nodes, edges) {
            const flowModel = lfModel();
            const boId = flowModel.focusBo || '';
            if (!boId) return { nodes, edges, focused: null };
            const bo = (state.governance.businessObjects || []).find(b => b.id === boId);
            if (!bo) return { nodes, edges, focused: null };
            const target = nodes.find(n => lfNodeKind(n) === 'object' && (n.boId === boId || n.name === bo.name));
            if (!target) return { nodes: [], edges: [], focused: bo, missing: true };
            const radius = Math.max(1, Math.min(3, parseInt(flowModel.focusRadius) || 2));
            const adj = {};
            edges.forEach(e => {
                (adj[e.source] = adj[e.source] || []).push(e.target);
                (adj[e.target] = adj[e.target] || []).push(e.source);
            });
            const keep = new Set([target.id]);
            let front = [target.id];
            for (let count = 0; count < radius; count++) {
                const next = [];
                front.forEach(id =>
                    (adj[id] || []).forEach(o => {
                        if (!keep.has(o)) {
                            keep.add(o);
                            next.push(o);
                        }
                    })
                );
                front = next;
                if (!front.length) break;
            }
            return {
                nodes: nodes.filter(n => keep.has(n.id)),
                edges: edges.filter(e => keep.has(e.source) && keep.has(e.target)),
                focused: bo,
                center: target.id
            };
        }
        function lfSetFocusBo(id) {
            const flowModel = lfModel();
            flowModel.focusBo = id || '';
            persistAppState();
            renderGovernance();
        }
        function lfSetFocusRadius(v) {
            const flowModel = lfModel();
            flowModel.focusRadius = Math.max(1, Math.min(3, parseInt(v) || 2));
            persistAppState();
            renderGovernance();
        }
        function lfSetGrain(g2) {
            const flowModel = lfModel();
            flowModel.grain = g2 === 'table' ? 'table' : 'bo';
            if (flowModel.grain === 'bo' && !flowModel.showObjects) {
                flowModel.showObjects = true;
                lfSyncFromData({ silent: true });
            }
            persistAppState();
            renderGovernance();
            showSuccess(
                flowModel.grain === 'bo'
                    ? '🏛️ Lecture métier : le flux est lu en objets métier.'
                    : '📄 Lecture technique : les tables sont détaillées.'
            );
        }
        // V6.7 : par défaut, un fichier source n'apparaît pas comme case à part — il est INTÉGRÉ à
        // l'application qui le produit (c'est elle le maître). Les liens du fichier sont reportés sur
        // l'application ; le lien « écrit » app → fichier disparaît (il devient interne).
        function lfCollapseSources(nodes, edges) {
            if (lfModel().hideSources === false) return { nodes, edges, foldCount: {}, folded: 0 };
            const byId = {};
            nodes.forEach(n => (byId[n.id] = n));
            const fold = {};
            nodes.forEach(n => {
                if (lfNodeKind(n) !== 'table') return;
                const prod = lfProducerOf(n.id);
                if (prod && prod.id !== n.id && byId[prod.id]) fold[n.id] = prod.id;
            });
            const graph = lfFoldGraph(nodes, edges, fold);
            return { nodes: graph.nodes, edges: graph.edges, foldCount: graph.foldCount, folded: Object.keys(fold).length };
        }
        function lfToggleSources(on) {
            lfModel().hideSources = !on;
            persistAppState();
            renderGovernance();
            showSuccess(on ? '📄 Sources affichées comme cases distinctes.' : '📦 Sources intégrées à leur application.');
        }
        function lfNode(id) {
            return lfModel().nodes.find(n => n.id === id);
        }
        function lfEdge(id) {
            return lfModel().edges.find(e => e.id === id);
        }
        // Modèle table-centré (v5.3.0) : le rôle et le type de lien ne sont plus saisis à la main,
        // ils sont DÉDUITS de la topologie. Un nœud sans alimentation entrante est « maître » ;
        // deux alimentations entrantes ou plus = « référentiel » (consolidation) ; sinon « consommateur ».
        // Lot 3 : nature d'un lien (feeds = alimente table→table ; reads = lecture table→appli ;
        // writes = écriture appli→table) et nature d'un nœud (table ou application).
        function lfNodeKind(n) {
            return (n && n.kind) || 'table';
        }
        // Nature d'un lien : explicite (rel stocké, ex. issu de la synchro) sinon DÉDUITE des types de
        // nœuds — une application en source = « écrit », en cible = « lit », sinon table→table = « alimente ».
        function lfEdgeRel(e) {
            if (e.rel) return e.rel;
            const flowNode = lfNode(e.source),
                t = lfNode(e.target);
            const sa = flowNode && lfNodeKind(flowNode) === 'app',
                ta = t && lfNodeKind(t) === 'app';
            if (sa && !ta) return 'writes';
            if (ta && !sa) return 'reads';
            return 'feeds';
        }
        // Tables qu'une application LIT ET ÉCRIT à la fois (« écriture en retour » / write-back).
        function lfWritebackTables(appId) {
            const flowModel = lfModel();
            const reads = new Set(
                flowModel.edges.filter(e => e.target === appId && lfEdgeRel(e) === 'reads').map(e => e.source)
            );
            const out = [];
            flowModel.edges.forEach(e => {
                if (e.source === appId && lfEdgeRel(e) === 'writes' && reads.has(e.target)) out.push(e.target);
            });
            return out;
        }
        // Attributs effectivement consommés par un lien de lecture (sous-ensemble) ; [] = toutes les colonnes.
        function lfConsumedAttrs(e) {
            return lfEdgePairs(e)
                .map(p => p.src || p.tgt)
                .filter(Boolean);
        }
        // Le rôle & la consolidation ne se déduisent que des ALIMENTATIONS (feeds) : les lectures
        // et écritures d'applications ne comptent pas comme des sources d'une table.
        function lfIncomingCount(id) {
            return lfModel().edges.filter(e => e.target === id && e.source !== id && lfEdgeRel(e) === 'feeds').length;
        }
        // Application PRODUCTRICE d'une table (lien « écrit » app→table) : c'est elle le vrai maître de
        // la donnée ; le fichier n'en est qu'un extrait. Un fichier avec producteur → rôle « Source ».
        function lfProducerOf(tableId) {
            return (
                lfModel()
                    .edges.filter(e => e.target === tableId && lfEdgeRel(e) === 'writes')
                    .map(e => lfNode(e.source))
                    .find(n => n && lfNodeKind(n) === 'app') || null
            );
        }
        function lfAppProduces(appId) {
            return lfModel().edges.some(e => e.source === appId && lfEdgeRel(e) === 'writes');
        }
        function lfDeduceRole(id) {
            const inc = lfIncomingCount(id);
            if (inc >= 2) return 'reference';
            if (inc === 1) return 'consumer';
            return lfProducerOf(id) ? 'source' : 'master';
        }
        function lfNodeRole(n) {
            if (!n) return 'consumer';
            const k = lfNodeKind(n);
            if (k === 'app') return 'app';
            if (k === 'object') return 'object';
            return n.id ? lfDeduceRole(n.id) : 'consumer';
        }
        function lfConsolidates(id) {
            const flowNode = lfNode(id);
            if (flowNode && lfNodeKind(flowNode) !== 'table') return false;
            return lfIncomingCount(id) >= 2;
        }
        function lfDeduceEdgeType(e) {
            const r = lfEdgeRel(e);
            if (LF_EDGE_TYPES[r] && r !== 'feeds' && r !== 'consolidates') return r;
            return lfConsolidates(e.target) ? 'consolidates' : 'feeds';
        }
        // Libellé affiché : pour une alimentation simple, on montre sa NATURE (Recopie/Complément/
        // Correction) ; une consolidation (≥2 entrants) reste « Consolide » ; lecture/écriture/objet inchangés.
        function lfEdgeTypeLabel(e) {
            const t = lfDeduceEdgeType(e);
            if (t === 'feeds' && lfEdgeRel(e) === 'feeds') return LF_NATURE[lfEdgeNature(e)];
            return LF_EDGE_TYPES[t];
        }
        // Une application CONTIENT (produit/possède) les tables qu'elle écrit. Un RAPPORT est une
        // application terminale (elle consomme, ne repousse rien plus loin).
        function lfOwnedTables(appId) {
            return lfModel()
                .edges.filter(e => e.source === appId && lfEdgeRel(e) === 'writes')
                .map(e => lfNode(e.target))
                .filter(n => n && lfNodeKind(n) === 'table');
        }
        function lfIsReport(n) {
            return !!(n && lfNodeKind(n) === 'app' && n.terminal);
        }
        function lfIcon(n) {
            if (n.icon) return n.icon;
            if (lfIsReport(n)) return '📑';
            return (LF_ROLE[lfNodeRole(n)] || LF_ROLE.consumer).ic;
        }
        function lfAge(days) {
            if (days == null) return '—';
            return days < 1
                ? Math.round(days * 24) + ' h'
                : days < 60
                  ? Math.round(days) + ' j'
                  : Math.round(days / 30) + ' mois';
        }
        // Fraîcheur d'un nœud à partir de sa source liée (réutilise swFreshness/dictionnaire).
        function lfFresh(n) {
            // Application : fraîcheur HÉRITÉE = la pire des tables qu'elle lit (« lit » = reads).
            if (n && lfNodeKind(n) === 'app') {
                const ins = lfModel().edges.filter(e => e.target === n.id && lfEdgeRel(e) === 'reads');
                let worst = { status: 'none' };
                ins.forEach(e => {
                    const f = lfFresh(lfNode(e.source));
                    if (LF_RANK[f.status] > LF_RANK[worst.status]) worst = f;
                });
                return worst.status === 'none'
                    ? { status: 'none' }
                    : {
                          status: worst.status,
                          ageDays: worst.ageDays,
                          maxDays: worst.maxDays,
                          freq: worst.freq,
                          inherited: true,
                          label: '⟳ ' + lfAge(worst.ageDays) + ' (hérité)'
                      };
            }
            const t = n && n.tableName ? tableByName(n.tableName) : null;
            if (!t) return { status: 'none' };
            const freshness = swFreshness(t);
            let status = 'none';
            if (freshness.status === 'ok')
                status = freshness.maxDays && freshness.ageDays > 0.8 * freshness.maxDays ? 'warn' : 'ok';
            else if (freshness.status === 'late') status = 'bad';
            else if (freshness.status === 'nofreq' || freshness.status === 'unknown' || freshness.status === 'na')
                status = 'none';
            return {
                status,
                ageDays: freshness.ageDays,
                maxDays: freshness.maxDays,
                freq: freshness.freq,
                label: '⟳ ' + lfAge(freshness.ageDays)
            };
        }
        // Fraîcheur d'une ALIMENTATION : retard de la copie aval, jugé D'ABORD contre le SLA
        // déclaré sur le lien (en heures) puis, à défaut, contre la fréquence attendue au
        // dictionnaire. C'est ce qui rend « exécutable » la règle de fraîcheur d'un lien : dès
        // qu'un SLA est saisi, le verdict se calcule même sans fréquence au dictionnaire.
        function lfEdgeFresh(e) {
            const t = e && lfNode(e.target);
            const tbl = t && t.tableName ? tableByName(t.tableName) : null;
            const slaH =
                e && e.slaHours != null && e.slaHours !== '' && isFinite(+e.slaHours) && +e.slaHours > 0 ? +e.slaHours : null;
            // Si un SLA est déclaré ET que l'aval a un chargement daté → on juge contre le SLA du lien.
            if (slaH != null && tbl && tbl.lastRefresh) {
                const ageDays = (Date.now() - tbl.lastRefresh) / 864e5;
                const slaDays = slaH / 24;
                const status = ageDays > slaDays ? 'bad' : ageDays > 0.8 * slaDays ? 'warn' : 'ok';
                return { status, ageDays, maxDays: slaDays, source: 'link', slaHours: slaH };
            }
            // Sinon : fraîcheur classique (fréquence du dictionnaire), inchangée.
            const f = t ? lfFresh(t) : { status: 'none' };
            return {
                status: f.status,
                ageDays: f.ageDays,
                maxDays: f.maxDays,
                freq: f.freq,
                inherited: f.inherited,
                source: 'dict'
            };
        }
        function lfDistStatus(edge) {
            if (!edge.lastRun || edge.lastRun.rate == null) return 'none';
            const flowModel = lfModel().threshold;
            if (edge.lastRun.rate > flowModel) return 'bad';
            if (edge.lastRun.rate > 0.8 * flowModel) return 'warn';
            return 'ok';
        }
        const LF_RANK = { none: 0, ok: 1, warn: 2, bad: 3 };
        function lfWorst(a, b) {
            return LF_RANK[a] >= LF_RANK[b] ? a : b;
        }
        function lfEdgeHealth(edge) {
            const fresh = lfEdgeFresh(edge).status;
            const dist = lfDistStatus(edge);
            const w = lfWorst(fresh === 'none' ? 'none' : fresh, dist === 'none' ? 'none' : dist);
            return w === 'none' ? 'ok' : w; // sans mesure → présumé sain (neutre visuel)
        }
        const LF_COLOR = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626', none: '#94a3b8', usage: '#7c3aed' };
        // En sombre, les memes intentions mais en teintes qui portent sur fond nuit ; le violet
        // sombre des usages disparaissait dans le fond (photos utilisateur).
        const LF_COLOR_DARK = { ok: '#34d399', warn: '#fbbf24', bad: '#f87171', none: '#8494ab', usage: '#a78bfa' };
        function lfC(k) {
            return (
                (document.documentElement.getAttribute('data-theme') === 'dark' ? LF_COLOR_DARK : LF_COLOR)[k] || LF_COLOR[k]
            );
        }

        function lfInjectCss() {
            if (el('lfStyles')) return;
            const styleElement = document.createElement('style');
            styleElement.id = 'lfStyles';
            styleElement.textContent = `
            #lfCanvas{position:relative;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,.06);overflow:hidden;min-height:360px}
            #lfCanvas .lf-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;text-align:center;padding:24px}
            .lf-edges{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
            .lf-node{position:absolute;width:208px;background:#fff;border:1.5px solid #d4dbe6;border-radius:12px;padding:10px 12px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 4px 12px rgba(15,23,42,.05);cursor:grab;transition:box-shadow .12s,border-color .12s;z-index:2;touch-action:none;user-select:none}
            .lf-node:hover{border-color:#059669;box-shadow:0 6px 18px rgba(5,150,105,.15)}
            .lf-node .lf-nh{display:flex;align-items:center;gap:9px}
            .lf-node .lf-ic{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;flex-shrink:0}
            .lf-i-master .lf-ic{background:#d97706}.lf-i-reference .lf-ic{background:#2563eb}.lf-i-consumer .lf-ic{background:#334155}.lf-i-app .lf-ic{background:#7c3aed}.lf-i-source .lf-ic{background:#0891b2}.lf-i-object .lf-ic{background:#059669}
            .lf-node.lf-kind-app{border-style:dashed;border-color:#c4b5fd;background:#faf5ff}.lf-node.lf-kind-app:hover{border-color:#7c3aed}
            .lf-node.lf-kind-obj{border-color:#6ee7b7;background:#f0fdf4}.lf-node.lf-kind-obj:hover{border-color:#059669}
            .lf-node .lf-nm{font-weight:800;font-size:13px;line-height:1.15;color:#0f172a}
            .lf-node .lf-sc{font-size:10px;color:#94a3b8}
            .lf-role{display:inline-block;font-size:8.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;padding:2px 7px;border-radius:20px;margin-top:6px}
            .lf-r-master{background:#fef3c7;color:#92400e}.lf-r-ref{background:#dbeafe;color:#1e40af}.lf-r-cons{background:#f1f5f9;color:#475569}.lf-r-app{background:#ede9fe;color:#5b21b6}.lf-r-src{background:#cffafe;color:#155e75}.lf-r-obj{background:#d1fae5;color:#065f46}
            .lf-health{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}
            .lf-hchip{font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;display:inline-flex;align-items:center;gap:4px}
            .lf-h-ok{background:#dcfce7;color:#166534}.lf-h-warn{background:#fef3c7;color:#92400e}.lf-h-bad{background:#fee2e2;color:#991b1b}.lf-h-none{background:#f1f5f9;color:#64748b}
            .lf-colhdr{position:absolute;top:10px;font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#94a3b8;z-index:1}
            .lf-echip{position:absolute;transform:translate(-50%,-50%);background:#fff;border:1.5px solid #d4dbe6;border-radius:20px;padding:3px 9px;font-size:10px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.06);white-space:nowrap;display:flex;align-items:center;gap:5px;z-index:3}
            html[data-theme="dark"] .lf-echip{background:#171f2b;border-color:#2d3b52;color:#cfd8e5;box-shadow:0 1px 3px rgba(0,0,0,.4)}
            html[data-theme="dark"] .lf-colhdr{color:#8fa0b8}
            .lf-echip:hover{border-color:#059669}
            .lf-echip.lf-e-ok{border-color:#a7f3d0;color:#166534;background:#f0fdf4}
            .lf-echip.lf-e-warn{border-color:#fde68a;color:#92400e;background:#fffbeb}
            .lf-echip.lf-e-bad{border-color:#fecaca;color:#991b1b;background:#fef2f2}
            .lf-echip.lf-e-usage{border-color:#ddd6fe;color:#5b21b6;background:#faf5ff}
            .lf-echip .lf-dot{width:6px;height:6px;border-radius:50%}
            .lf-mism{display:flex;align-items:center;gap:9px;font-size:11.5px;padding:6px 0;border-bottom:1px solid #eef2f7}
            .lf-mism .lf-k{font-weight:700;min-width:96px}.lf-mism .lf-mv{color:#64748b}.lf-mism .lf-dv{color:#dc2626;font-weight:700;margin-left:auto}
            .lf-bar{height:9px;border-radius:5px;background:#eef2f7;overflow:hidden;margin-top:8px}.lf-bar i{display:block;height:100%;border-radius:5px}
            .lf-transf{background:#0f172a;color:#e2e8f0;border-radius:8px;padding:9px 11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5}
            .lf-kv{display:grid;grid-template-columns:1fr 1fr;gap:10px}
            .lf-cell{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:8px 10px}
            .lf-cell .lf-ck{font-size:10px;color:#64748b;font-weight:600}.lf-cell .lf-cv{font-size:15px;font-weight:800;margin-top:2px}
            .lf-attrs{margin-top:7px;display:flex;flex-direction:column;gap:2px}.lf-attr{font-size:10px;color:#475569;background:#f8fafc;border:1px solid #eef2f7;border-radius:5px;padding:1px 6px;font-family:ui-monospace,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
            document.head.appendChild(styleElement);
        }

        function renderLineageFlow() {
            lfInjectCss();
            const flowModel = lfModel();
            const nodes = flowModel.nodes,
                edges = flowModel.edges;
            const tables = Object.values(state.tables).filter(t => t.status === 'ready');
            // -- synthèse (seules les ALIMENTATIONS table→table sont des « flux » mesurables) --
            const feedEdges = edges.filter(e => lfEdgeRel(e) === 'feeds');
            const measurableEdges = feedEdges.filter(e => lfNode(e.target) && lfNode(e.target).tableName);
            const slaOk = measurableEdges.filter(e => lfFresh(lfNode(e.target)).status === 'ok').length;
            const distOver = feedEdges.filter(e => lfDistStatus(e) === 'bad').length;
            let worst = null;
            feedEdges.forEach(e => {
                const f = lfFresh(lfNode(e.target));
                if (f.status !== 'none' && f.ageDays != null && (!worst || f.ageDays > worst.age))
                    worst = { name: (lfNode(e.target) || {}).name, age: f.ageDays };
            });
            const lastRunAt = edges.reduce((mx, e) => (e.lastRun && e.lastRun.at && e.lastRun.at > mx ? e.lastRun.at : mx), 0);
            const tile = (cls, lbl, val) =>
                `<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm"><div class="text-[11px] text-slate-500 font-semibold">${lbl}</div><div class="text-xl font-black mt-0.5 ${cls}">${val}</div>
                    </div>`;

            // V6.26 : #lfWrap enveloppe la barre d'outils ET le canevas — en plein écran, les réglages
            // (vue métier/technique, focus objet, seuil) restent donc accessibles au-dessus du graphe.
            let html = `<div id="lfWrap"><div class="gfx-bar flex items-center gap-3 mb-1 flex-wrap">
                <h3 class="text-base font-black text-slate-800">🕸️ Lineage &amp; santé du flux</h3>
                <span class="text-xs text-slate-500">La carte du flux (maître → référentiel → consommateurs), enrichie de la fraîcheur et de la distorsion mesurées. Elle lit <b>les mêmes données</b> que « Bout en bout » (resynchronisée à l'ouverture) ; ici, centrée sur les <b>tables &amp; applications mesurables</b>.</span>
                <div class="ml-auto flex items-center gap-2">
                    <div class="inline-flex rounded-lg border border-slate-300 overflow-hidden text-[11px] font-bold">
                        <button data-ro="keep" onclick="lfSetView('systems')" class="px-3 py-1.5 ${lfView === 'attrs' ? 'bg-white text-slate-500 hover:bg-slate-50' : 'bg-slate-800 text-white'}">Vue systèmes</button>
                        <button data-ro="keep" onclick="lfSetView('attrs')" class="px-3 py-1.5 ${lfView === 'attrs' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}">Vue attributs</button>
                        <button data-ro="keep" onclick="openGovTab('lineage')" title="Graphe de bout en bout : sources ↔ tables ↔ objets métier ↔ applications" class="px-3 py-1.5 bg-white text-slate-500 hover:bg-slate-50 border-l border-slate-300">🕸️ Bout en bout</button>
                    </div>
                    <div class="inline-flex rounded-lg border border-slate-300 overflow-hidden text-[11px] font-bold" title="Le flux se lit en OBJETS MÉTIER : les tables techniques sont absorbées par l'objet qu'elles composent. La vue technique les détaille.">
                        <button data-ro="keep" onclick="lfSetGrain('bo')" class="px-3 py-1.5 ${flowModel.grain === 'table' ? 'bg-white text-slate-500 hover:bg-slate-50' : 'bg-emerald-600 text-white'}">🏛️ Vue métier</button>
                        <button data-ro="keep" onclick="lfSetGrain('table')" class="px-3 py-1.5 ${flowModel.grain === 'table' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}">📄 Vue technique</button>
                    </div>
                    ${
                        flowModel.grain === 'table'
                            ? `<label class="text-[11px] font-semibold text-slate-600 flex items-center gap-1 cursor-pointer" title="Afficher les objets métier (vues) et leurs sources sur la carte"><input type="checkbox" ${flowModel.showObjects ? 'checked' : ''} onchange="lfToggleObjects(this.checked)"> 🏛️ Objets métier</label>
                    <label class="text-[11px] font-semibold text-slate-600 flex items-center gap-1 cursor-pointer" title="Par défaut, les fichiers sources sont INTÉGRÉS à l'application qui les produit (c'est elle le maître). Cochez pour afficher chaque fichier comme une case distincte."><input type="checkbox" ${flowModel.hideSources === false ? 'checked' : ''} onchange="lfToggleSources(this.checked)"> 📄 Détailler les sources</label>`
                            : ''
                    }
                    ${(() => {
                        const bos = state.governance.businessObjects || [];
                        if (!bos.length) return '';
                        const cur = flowModel.focusBo || '';
                        return `<label class="text-[11px] font-semibold ${cur ? 'text-emerald-700' : 'text-slate-600'} flex items-center gap-1" title="N'afficher que ce référentiel et son voisinage : qui l'alimente, qui le consomme.">🏛️ Objet métier
                            <select data-ro="keep" onchange="lfSetFocusBo(this.value)" class="border ${cur ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-white'} rounded p-1 text-[11px] ml-1 max-w-[14rem]">
                                <option value="">— tous les objets —</option>
                                ${bos.map(b2 => `<option value="${b2.id}" ${cur === b2.id ? 'selected' : ''}>${escapeHTML(b2.name)}</option>`).join('')}
                            </select></label>
                            ${
                                cur
                                    ? `<label class="text-[11px] text-slate-500 font-semibold" title="1 = uniquement les voisins directs de l'objet. 2 = on remonte d'un cran de plus (les sources des applications qui l'alimentent).">Voisinage
                                <select onchange="lfSetFocusRadius(this.value)" class="border border-slate-300 rounded p-1 text-[11px] ml-1 bg-white">
                                    ${[1, 2, 3].map(v => `<option value="${v}" ${(flowModel.focusRadius || 2) === v ? 'selected' : ''}>${v} cran${v > 1 ? 's' : ''}</option>`).join('')}
                                </select></label>
                            <button onclick="lfSetFocusBo('')" class="text-[11px] font-bold px-2 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50">✕ tout afficher</button>`
                                    : ''
                            }`;
                    })()}
                    <button onclick="lfResetLayout()" title="Réorganiser automatiquement (efface les déplacements manuels)" class="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-slate-50">⇄ Réorganiser</button>
                    ${gfxFullBtn('lfWrap', 'lfDrawGraph')}
                    <label class="text-[11px] text-slate-500 font-semibold">Seuil de distorsion (%)
                    <input type="number" data-ro="keep" step="0.1" min="0" value="${flowModel.threshold}" onchange="lfSetThreshold(this.value)" class="w-16 border border-slate-300 rounded p-1 text-xs ml-1"></label>
                </div>
            </div>`;
            html += `<div class="gfx-hide-full grid grid-cols-2 md:grid-cols-4 gap-3 my-3">
                ${tile(slaOk === measurableEdges.length ? 'text-emerald-600' : 'text-amber-600', '🎯 SLA de fraîcheur respectés', measurableEdges.length ? `${slaOk} <span class="text-sm text-slate-400 font-bold">/ ${measurableEdges.length} flux</span>` : '—')}
                ${tile(distOver ? 'text-red-600' : 'text-emerald-600', '⚠️ Distorsions au-dessus du seuil', distOver + ' <span class="text-sm text-slate-400 font-bold">flux</span>')}
                ${tile('text-amber-600', '⏱ Flux le plus en retard', worst ? `<span class="text-sm">${escapeHTML(worst.name || '')} · ${lfAge(worst.age)}</span>` : '<span class="text-sm text-slate-400">—</span>')}
                ${tile('text-slate-700', '🔎 Dernier contrôle', lastRunAt ? `<span class="text-sm">${new Date(lastRunAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>` : '<span class="text-sm text-slate-400">jamais</span>')}
            </div>`;
            // -- légende --
            html += `<div class="gfx-hide-full flex flex-wrap gap-4 text-[11px] text-slate-500 mb-2 px-0.5">
                <span class="inline-flex items-center gap-1.5"><span style="width:20px;height:3px;border-radius:2px;background:${LF_COLOR.ok};display:inline-block"></span> <b class="text-slate-700">Sain</b> — frais &amp; cohérent</span>
                <span class="inline-flex items-center gap-1.5"><span style="width:20px;height:3px;border-radius:2px;background:${LF_COLOR.warn};display:inline-block"></span> <b class="text-slate-700">À surveiller</b></span>
                <span class="inline-flex items-center gap-1.5"><span style="width:20px;height:3px;border-radius:2px;background:${LF_COLOR.bad};display:inline-block"></span> <b class="text-slate-700">Alerte</b> — retard ou distorsion forte</span>
                <span class="inline-flex items-center gap-1.5"><span style="width:20px;height:3px;border-radius:2px;background:${LF_COLOR.usage};display:inline-block;background-image:linear-gradient(90deg,${LF_COLOR.usage} 60%,transparent 0);background-size:8px 3px"></span> <b class="text-slate-700">Usage</b> — 🖥 application lit / écrit, produit / consomme un objet métier</span>
                <span class="ml-auto">💡 <b>Glissez</b> les nœuds pour les repositionner · <b>cliquez</b> un nœud ou une étiquette de lien pour le détail.</span>
            </div>`;
            // -- lecture métier : rappel + tables encore non rattachées à un objet --
            if (flowModel.grain !== 'table') {
                const _b1 = lfCollapseToObjects(flowModel.nodes, flowModel.edges);
                const _unq = _b1.unqualified || [];
                const _nbObj = _b1.nodes.filter(n => lfNodeKind(n) === 'object').length;
                html += `<div class="text-[11px] rounded-lg px-3 py-2 mb-2 ${_unq.length ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}">
                    🏛️ <b>Lecture métier</b> : le flux ne montre que des <b>objets métier</b> et des <b>applications</b>. Chaque table technique est absorbée par l'objet qu'elle compose (badge « 📦 N tables »), sinon par l'application qui la produit.
                    ${_nbObj === 0 ? "<br>⚠ <b>Aucun objet métier</b> sur la carte : créez-en un (onglet <b>Objets métier</b>) et déclarez ses <b>sources</b> — sans objet métier, il n'y a rien à lire au niveau métier." : ''}
                    ${
                        _unq.length
                            ? `<br>⚠ <b>${_unq.length} table(s) écartée(s)</b> de la lecture métier car rattachée(s) à <b>aucun objet métier</b> et <b>aucune application</b> : ${_unq
                                  .slice(0, 8)
                                  .map(n => escapeHTML(n.name))
                                  .join(
                                      ', '
                                  )}${_unq.length > 8 ? '…' : ''}<br>→ déclarez-les comme <b>source d'un objet métier</b> (Objets métier ▸ Sources) ou comme <b>source produite</b> par une application (Applications &amp; processus) pour qu'elles entrent dans le flux.`
                            : ''
                    }
                </div>`;
            }
            // -- panneau « Cohérence du modèle » (R3) : maîtrise unifiée + contradictions --
            const _chk = lfModelChecks();
            if (_chk.length) {
                const _err = _chk.filter(c => c.sev === 'error'),
                    _wrn = _chk.filter(c => c.sev === 'warn');
                const hasErr = _err.length > 0;
                html += `<div class="rounded-xl p-3 mb-2 text-xs border ${hasErr ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}">
                    <div class="font-bold ${hasErr ? 'text-red-700' : 'text-amber-700'} mb-1">🧩 Cohérence du modèle — ${_err.length} contradiction(s)${_wrn.length ? `, ${_wrn.length} point(s) à surveiller` : ''}</div>
                    <ul class="space-y-0.5">${_err.map(c => `<li class="text-red-700">⛔ ${c.msg}</li>`).join('')}${_wrn.map(c => `<li class="text-amber-700">⚠ ${c.msg}</li>`).join('')}</ul>
                </div>`;
            }
            // -- graphe --
            html += `<div id="lfCanvas"></div></div>`; // ferme #lfWrap (ouvert avec la barre d'outils)
            // -- constructeur du flux --
            html += lfBuilderHtml(nodes, edges, tables);
            html += lfJournalHtml();
            setTimeout(lfDrawGraph, 0);
            if (!window.__lfResize) {
                window.__lfResize = true;
                window.addEventListener('resize', () => {
                    if (el('lfCanvas')) lfDrawGraph();
                });
            }
            return html;
        }

        function lfBuilderHtml(nodes, edges, tables) {
            let h = `<details class="mt-4 bg-slate-50 border border-slate-200 rounded-xl" ${nodes.length && !lfEditNodeId && !lfEditEdgeId ? '' : 'open'}>
                <summary class="cursor-pointer px-3 py-2 text-xs font-bold text-slate-600">⚙️ Construire le flux — systèmes &amp; liens ${nodes.length ? `(${nodes.length} nœud(s), ${edges.length} lien(s))` : ''}</summary>
                <div class="p-3 space-y-4">`;
            h += `<div class="flex flex-wrap items-center gap-2">
                <button onclick="lfSyncFromData()" class="text-[11px] bg-indigo-600 text-white font-bold px-3 py-1.5 rounded hover:bg-indigo-700">🔄 Synchroniser depuis les données</button>
                <button onclick="lfRederiveAll()" title="Reconstruit une carte 100 % dérivée de vos données : retire les nœuds/liens ajoutés à la main qui ne sont plus adossés à une donnée, tout en réattachant vos points de mesure (clés, attributs, contrôles) et positions." class="text-[11px] bg-white border border-indigo-300 text-indigo-700 font-bold px-3 py-1.5 rounded hover:bg-indigo-50">♻️ Tout redériver (carte propre)</button>
                <button onclick="lfSeedFromObjects()" class="text-[11px] bg-white border border-emerald-300 text-emerald-700 font-bold px-3 py-1.5 rounded hover:bg-emerald-50">✨ Générer depuis les objets métier</button>
                ${nodes.length ? '<button onclick="lfClearAll()" class="text-[11px] bg-white border border-slate-300 text-slate-500 font-bold px-3 py-1.5 rounded hover:text-red-600">🗑 Tout effacer</button>' : ''}
                <span class="text-[10px] text-slate-400">La carte est une <b>projection de vos données</b> : « Synchroniser » la met à jour (ajout/retrait), « Tout redériver » la reconstruit à neuf. Vos points de mesure sont préservés.</span></div>`;
            // liste des nœuds
            if (nodes.length) {
                h += `<div class="border border-slate-200 rounded-lg overflow-x-auto bg-white"><table class="w-full text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2">Nœud (table)</th>
                    <th class="p-2">Rôle (déduit)</th>
                    <th class="p-2">Origine</th>
                    <th class="p-2">Domaine</th>
                    <th class="p-2">Source liée</th>
                    <th class="p-2 w-8"></th>
                    </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">`;
                h += nodes
                    .map(
                        n => `<tr><td class="p-2 font-bold text-slate-700">${lfIcon(n)} ${escapeHTML(n.name)}${n.derived ? ' <span class="text-[8.5px] font-bold text-indigo-500 align-middle" title="Nœud dérivé automatiquement des données (Synchroniser)">🔄 auto</span>' : ''}</td>
                    <td class="p-2">${(LF_ROLE[lfNodeRole(n)] || {}).lbl}${lfConsolidates(n.id) ? ' <span class="text-[9px] font-bold text-blue-600" title="Deux alimentations entrantes ou plus">⑃ consolide</span>' : ''}</td>
                    <td class="p-2 text-slate-500">${escapeHTML(n.origine || '—')}</td>
                    <td class="p-2 text-slate-500">${escapeHTML(n.domain || '—')}</td>
                    <td class="p-2 ${n.tableName && tableByName(n.tableName) ? 'text-emerald-700 font-semibold' : 'text-slate-400'}">${n.tableName ? escapeHTML(n.tableName) + (tableByName(n.tableName) ? '' : ' (absente)') : '—'}</td>
                    <td class="p-2 text-right whitespace-nowrap"><button onclick="lfEditNodeStart('${n.id}')" class="text-indigo-500 hover:text-indigo-700 mr-2" title="Modifier">✎</button><button onclick="lfDelNode('${n.id}')" class="text-red-400 hover:text-red-600" title="Supprimer">✕</button></td>
                        </tr>`
                    )
                    .join('');
                h += `</tbody></table></div>`;
            }
            // ajout / édition de nœud
            const _en = lfEditNodeId ? lfNode(lfEditNodeId) : null;
            const _appNames = [
                ...new Set(
                    nodes
                        .filter(n => lfNodeKind(n) === 'app')
                        .map(n => n.name)
                        .filter(Boolean)
                )
            ];
            const _origOpts = [...new Set([..._appNames, ...nodes.map(n => n.origine).filter(Boolean)])]
                .map(o => `<option value="${escapeHTML(o)}">`)
                .join('');
            const _tblOptN =
                `<option value="">— aucune —</option>` +
                tables
                    .map(
                        t =>
                            `<option value="${escapeHTML(t.name)}" ${_en && _en.tableName === t.name ? 'selected' : ''}>${escapeHTML(t.name)}</option>`
                    )
                    .join('');
            const _enApp = _en && lfNodeKind(_en) === 'app';
            h += `<div class="flex items-end gap-2 flex-wrap bg-white border ${_en ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-100'} rounded-lg p-2">
                ${_en ? '<div class="w-full text-[11px] font-bold text-indigo-700">✎ Modification du nœud</div>' : ''}
                <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Nature</label><select id="lf-n-kind" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="table" ${_enApp ? '' : 'selected'}>📄 Table</option><option value="app" ${_enApp ? 'selected' : ''}>🖥 Application</option></select></div>
                <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Nom (table / application)</label><input id="lf-n-name" value="${_en ? escapeHTML(_en.name) : ''}" placeholder="ex : CLIENTS_CRM ou BI Ventes" class="border border-slate-300 p-1.5 rounded text-xs w-40"></div>
                <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Application propriétaire (origine)</label><input id="lf-n-orig" list="lf-n-orig-dl" value="${_en ? escapeHTML(_en.origine || '') : ''}" placeholder="ex : KADOR, SAP…" title="Pour une TABLE : l'application qui la produit / la contient (elle en est le maître)." class="border border-slate-300 p-1.5 rounded text-xs w-40"><datalist id="lf-n-orig-dl">${_origOpts}</datalist></div>
                <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Domaine</label><input id="lf-n-dom" value="${_en ? escapeHTML(_en.domain || '') : ''}" placeholder="ex : Client" class="border border-slate-300 p-1.5 rounded text-xs w-28"></div>
                <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Source liée (optionnel)</label><select id="lf-n-tbl" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${_tblOptN}</select></div>
                <label class="flex items-center gap-1 text-[10px] font-bold text-slate-500 pb-1.5" title="Application terminale : elle consomme la donnée pour la restituer (rapport, tableau de bord) et ne l'alimente pas plus loin."><input type="checkbox" id="lf-n-terminal" ${_en && _en.terminal ? 'checked' : ''}> 📑 Rapport (terminal)</label>
                <button onclick="lfSaveNodeForm()" class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-bold">${_en ? '✓ Enregistrer' : '+ Nœud'}</button>
                ${_en ? `<button onclick="lfEditCancel()" class="text-xs bg-white border border-slate-300 text-slate-500 px-3 py-1.5 rounded font-bold">Annuler</button>` : ''}</div>`;
            // liste des liens
            if (edges.length) {
                h += `<div class="border border-slate-200 rounded-lg overflow-x-auto bg-white"><table class="w-full text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2">Lien</th>
                    <th class="p-2">Type (déduit)</th>
                    <th class="p-2">Clé (source → cible)</th>
                    <th class="p-2">Attribut (source → cible)</th>
                    <th class="p-2">Dernier contrôle</th>
                    <th class="p-2 w-14"></th>
                    </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">`;
                h += edges
                    .map(e => {
                        const flowNode = lfNode(e.source),
                            t = lfNode(e.target);
                        const lr = e.lastRun;
                        const K = lfEdgeKeys(e);
                        const pair = (x, y) =>
                            x || y ? escapeHTML(x || '?') + (x !== y ? ' → ' + escapeHTML(y || '?') : '') : '—';
                        return `<tr><td class="p-2 font-semibold text-slate-700">${escapeHTML((flowNode || {}).name || '?')} → ${escapeHTML((t || {}).name || '?')}</td>
                    <td class="p-2 text-slate-500">${lfEdgeTypeLabel(e)}${lfConsolidates(e.target) ? ' <span class="text-[9px] font-bold text-blue-600" title="Cible alimentée par ≥ 2 sources">⑃</span>' : ''}</td>
                    <td class="p-2 text-slate-500 mono">${pair(K.sK, K.tK)}</td>
                    <td class="p-2 text-slate-500 mono">${pair(K.sA, K.tA)}</td>
                    <td class="p-2 ${lr && lr.rate > lfModel().threshold ? 'text-red-600 font-bold' : 'text-slate-500'}">${lr ? (lr.rate != null ? lr.rate.toFixed(2) + ' %' : '—') : 'jamais'}</td>
                    <td class="p-2 text-right whitespace-nowrap"><button onclick="lfEditEdgeStart('${e.id}')" class="text-indigo-500 hover:text-indigo-700 mr-2" title="Modifier">✎</button><button onclick="lfDelEdge('${e.id}')" class="text-red-400 hover:text-red-600" title="Supprimer">✕</button></td>
                        </tr>`;
                    })
                    .join('');
                h += `</tbody></table></div>`;
            }
            // ajout / édition de lien
            if (nodes.length >= 2) {
                const _ee = lfEditEdgeId ? lfEdge(lfEditEdgeId) : null;
                const _K = _ee ? lfEdgeKeys(_ee) : { sK: '', tK: '', sA: '', tA: '' };
                const _pairs0 = _ee ? lfEdgePairs(_ee) : [];
                const _p0 = _pairs0[0] || { src: '', tgt: '', xform: { kind: 'none' } };
                const _defSrc = _ee ? _ee.source : nodes[0].id,
                    _defTgt = _ee ? _ee.target : nodes[0].id;
                const _nOptSel = sel =>
                    nodes
                        .map(n => `<option value="${n.id}" ${n.id === sel ? 'selected' : ''}>${escapeHTML(n.name)}</option>`)
                        .join('');
                const _colsOf = id => {
                    const flowNode = lfNode(id);
                    return flowNode && flowNode.tableName && tableByName(flowNode.tableName)
                        ? tableByName(flowNode.tableName).headers
                        : [];
                };
                const _dlOf = arr => arr.map(h2 => `<option value="${escapeHTML(h2)}">`).join('');
                const _dlS = _dlOf(_colsOf(_defSrc)),
                    _dlT = _dlOf(_colsOf(_defTgt));
                const _xf = _p0.xform || { kind: 'none' };
                const _fnOpts = Object.entries(LF_XFORM_AGG)
                    .map(([v, l]) => `<option value="${v}" ${_xf.fn === v ? 'selected' : ''}>${l}</option>`)
                    .join('');
                const _opOpts = Object.entries(LF_XFORM_SCALAR)
                    .map(([v, l]) => `<option value="${v}" ${_xf.op === v ? 'selected' : ''}>${l}</option>`)
                    .join('');
                const _xkOpts = [
                    ['none', 'Aucune'],
                    ['scalar', 'Normalisation'],
                    ['agg', 'Agrégation']
                ]
                    .map(([v, l]) => `<option value="${v}" ${_xf.kind === v ? 'selected' : ''}>${l}</option>`)
                    .join('');
                h += `<div class="flex items-end gap-2 flex-wrap bg-white border ${_ee ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-100'} rounded-lg p-2">
                    ${_ee ? '<div class="w-full text-[11px] font-bold text-indigo-700">✎ Modification du lien</div>' : ''}
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Source</label><select id="lf-e-src" onchange="lfEdgeColsChanged()" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${_nOptSel(_defSrc)}</select></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Cible</label><select id="lf-e-tgt" onchange="lfEdgeColsChanged()" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${_nOptSel(_defTgt)}</select></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Nature</label><select id="lf-e-nat" class="border border-slate-300 p-1.5 rounded text-xs bg-white" title="Recopie : copie à l'identique · Complément : ajoute des colonnes · Correction : modifie des valeurs poussées par une autre source (surveiller la maîtrise). « Consolidation » est déduite quand la cible a ≥ 2 sources.">${Object.entries(
                        LF_NATURE
                    )
                        .map(
                            ([v, l]) => `<option value="${v}" ${lfEdgeNature(_ee || {}) === v ? 'selected' : ''}>${l}</option>`
                        )
                        .join('')}</select></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Périmètre (optionnel)</label><input id="lf-e-scope" value="${_ee ? escapeHTML(_ee.scope || '') : ''}" placeholder="ex : type = ASSURANCE" title="Sous-ensemble alimenté par ce flux (filtre / condition)." class="border border-slate-300 p-1.5 rounded text-xs w-40"></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Clé (source)</label><input id="lf-e-sk" list="lf-e-sk-dl" value="${escapeHTML(_K.sK)}" placeholder="clé côté source" class="border border-slate-300 p-1.5 rounded text-xs w-32"><datalist id="lf-e-sk-dl">${_dlS}</datalist></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Clé (cible)</label><input id="lf-e-tk" list="lf-e-tk-dl" value="${escapeHTML(_K.tK)}" placeholder="clé côté cible" class="border border-slate-300 p-1.5 rounded text-xs w-32"><datalist id="lf-e-tk-dl">${_dlT}</datalist></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Attribut (source)</label><input id="lf-e-sa" list="lf-e-sa-dl" value="${escapeHTML(_p0.src)}" placeholder="attribut côté source" class="border border-slate-300 p-1.5 rounded text-xs w-32"><datalist id="lf-e-sa-dl">${_dlS}</datalist></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Attribut (cible)</label><input id="lf-e-ta" list="lf-e-ta-dl" value="${escapeHTML(_p0.tgt)}" placeholder="attribut côté cible" class="border border-slate-300 p-1.5 rounded text-xs w-32"><datalist id="lf-e-ta-dl">${_dlT}</datalist></div>
                    ${_pairs0.length > 1 ? `<div class="w-full text-[10px] text-indigo-600">ℹ️ ${_pairs0.length} attributs contrôlés sur ce lien — gérez-les tous (ajout/retrait) dans la fiche du lien (clic sur son étiquette dans le graphe).</div>` : ''}
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">SLA (h)</label><input id="lf-e-sla" type="number" value="${_ee ? _ee.slaHours || 24 : 24}" class="border border-slate-300 p-1.5 rounded text-xs w-16"></div>
                    <div><label class="text-[9px] uppercase font-bold text-slate-400 block">Transformation rejouable</label><select id="lf-e-xk" onchange="lfXkChanged()" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${_xkOpts}</select></div>
                    <div id="lf-e-xagg-w" class="${_xf.kind === 'agg' ? '' : 'hidden'}"><label class="text-[9px] uppercase font-bold text-slate-400 block">Fonction</label><select id="lf-e-xfn" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${_fnOpts}</select></div>
                    <div id="lf-e-xsc-w" class="${_xf.kind === 'scalar' ? '' : 'hidden'} flex items-end gap-1"><div><label class="text-[9px] uppercase font-bold text-slate-400 block">Opération</label><select id="lf-e-xop" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${_opOpts}</select></div>
                        <input id="lf-e-xparam" value="${escapeHTML(_xf.param || '')}" placeholder="param" class="border border-slate-300 p-1.5 rounded text-xs w-16"></div>
                    <div class="flex-1 min-w-[180px]"><label class="text-[9px] uppercase font-bold text-slate-400 block">Transformation déclarée (optionnel)</label><input id="lf-e-transf" value="${_ee ? escapeHTML(_ee.transformation || '') : ''}" placeholder="ex : SOMME(montant) converti €, agrégé /mois" class="border border-slate-300 p-1.5 rounded text-xs w-full"></div>
                    <button onclick="lfSaveEdgeForm()" class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-bold">${_ee ? '✓ Enregistrer' : '+ Lien'}</button>
                    ${_ee ? `<button onclick="lfEditCancel()" class="text-xs bg-white border border-slate-300 text-slate-500 px-3 py-1.5 rounded font-bold">Annuler</button>` : ''}</div>`;
            }
            h += `</div></details>`;
            return h;
        }

        function lfDrawGraph() {
            const lfCanvasElement = el('lfCanvas');
            if (!lfCanvasElement) return;
            const flowModel = lfModel();
            if (!flowModel.nodes.length) {
                lfCanvasElement.style.height = '360px';
                lfCanvasElement.innerHTML =
                    '<div class="lf-empty">Aucun flux déclaré.<br>Ajoutez des systèmes et des liens ci-dessous, ou cliquez « ✨ Générer depuis les objets métier ».</div>';
                return;
            }
            // Repli en deux temps : d'abord les tables dans l'OBJET MÉTIER qu'elles composent (lecture
            // métier), puis les sources restantes dans leur application propriétaire.
            const _bo = lfCollapseToObjects(flowModel.nodes, flowModel.edges);
            const _cl = lfCollapseSources(_bo.nodes, _bo.edges);
            const _fo = lfFocusBo(_cl.nodes, _cl.edges);
            if (_fo.missing) {
                lfCanvasElement.style.height = '360px';
                lfCanvasElement.innerHTML = `<div class="lf-empty">L'objet métier « ${escapeHTML(_fo.focused.name)} » n'apparaît pas sur cette carte.<br>Vérifiez qu'il a des sources rattachées, ou choisissez « tous les objets ».</div>`;
                return;
            }
            const nodes = _fo.nodes,
                edges = _fo.edges;
            const foldCount = Object.assign({}, _bo.foldCount, _cl.foldCount);
            if (!nodes.length) {
                lfCanvasElement.style.height = '360px';
                lfCanvasElement.innerHTML =
                    '<div class="lf-empty">Toutes les cases sont repliées dans leur objet métier ou leur application.<br>Basculez en « 📄 Vue technique » pour détailler les tables.</div>';
                return;
            }
            const idset = new Set(nodes.map(n => n.id));
            const indeg = {},
                adj = {};
            nodes.forEach(n => {
                indeg[n.id] = 0;
                adj[n.id] = [];
            });
            edges.forEach(e => {
                if (idset.has(e.source) && idset.has(e.target) && e.source !== e.target) {
                    adj[e.source].push(e.target);
                    indeg[e.target]++;
                }
            });
            const depth = {};
            nodes.forEach(n => (depth[n.id] = 0));
            let starts = nodes.filter(n => !indeg[n.id]).map(n => n.id);
            if (!starts.length) starts = nodes.map(n => n.id);
            const queue = [...starts];
            let guard = 0;
            const cap = nodes.length * nodes.length + 20;
            while (queue.length && guard++ < cap) {
                const current = queue.shift();
                adj[current].forEach(v => {
                    if (depth[v] < depth[current] + 1) {
                        depth[v] = depth[current] + 1;
                        queue.push(v);
                    }
                });
            }
            const colOf = {};
            nodes.forEach(n => (colOf[n.id] = Math.max(depth[n.id], (LF_ROLE[lfNodeRole(n)] || {}).col || 0)));
            const maxCol = Math.max(0, ...nodes.map(n => colOf[n.id]));
            const cols = {};
            nodes.forEach(n => {
                (cols[colOf[n.id]] = cols[colOf[n.id]] || []).push(n);
            });
            const attrView = lfView === 'attrs';
            const _full = !!(lfCanvasElement.closest && lfCanvasElement.closest('.gfx-full'));
            const W = Math.max(560, lfCanvasElement.clientWidth || 900),
                NW = 208,
                NH = attrView ? 152 : 96,
                rowGap = NH + 22,
                topPad = 40;
            const maxRows = Math.max(...Object.values(cols).map(a => a.length));
            let H = Math.max(360, topPad + maxRows * rowGap + 16);
            const pos = {};
            const hOf = n => Math.max(NH, (lfDrawGraph._h || {})[n.id] || NH) + 22;
            const colHs = {};
            Object.keys(cols).forEach(d => (colHs[d] = cols[d].reduce((h2, n) => h2 + hOf(n), 0)));
            H = Math.max(360, topPad + Math.max(...Object.values(colHs)) + 16);
            Object.keys(cols).forEach(d => {
                const arr = cols[d];
                const x = maxCol ? (d / maxCol) * (W - NW - 20) + 10 : 10;
                let y = Math.max(topPad, (H - colHs[d]) / 2);
                arr.forEach(n => {
                    pos[n.id] = { x, y };
                    y += hOf(n);
                });
            });
            // Positions manuelles (glisser-déposer) : prioritaires sur la disposition automatique.
            nodes.forEach(n => {
                if (typeof n.x === 'number' && typeof n.y === 'number') pos[n.id] = { x: n.x, y: n.y };
            });
            H = Math.max(
                H,
                ...nodes.map(n => (pos[n.id] ? pos[n.id].y + Math.max(NH, (lfDrawGraph._h || {})[n.id] || NH) + 20 : 0))
            );
            if (_full) H = Math.max(H, gfxAvailH(lfCanvasElement));
            lfCanvasElement.style.height = H + 'px';
            // arêtes SVG.
            /* Deux maux mesurés sur les photos : 20 pastilles « consommé par » empilées au même
               point (les arêtes d'un même éventail partagent le même milieu), et des pastilles qui
               se recouvrent quand plusieurs arêtes joignent les mêmes colonnes. Réponse :
                 — un éventail (≥ 3 arêtes de même libellé vers le même nœud) ne porte qu'UNE
                   pastille « libellé × n » ;
                 — les pastilles restantes glissent le long de la courbe (t = 0,35 à 0,65) au lieu
                   de toutes s'accrocher au milieu. */
            const fanCnt = {},
                fanDone = new Set();
            edges.forEach(e => {
                const rel0 = lfEdgeRel(e);
                if (rel0 !== 'feeds') {
                    const l0 = lfEdgeTypeLabel(e);
                    fanCnt['t:' + e.target + '¦' + l0] = (fanCnt['t:' + e.target + '¦' + l0] || 0) + 1;
                    fanCnt['s:' + e.source + '¦' + l0] = (fanCnt['s:' + e.source + '¦' + l0] || 0) + 1;
                }
            });
            const slotCnt = {};
            let paths = '';
            const chips = [];
            edges.forEach(e => {
                const a = pos[e.source],
                    b = pos[e.target];
                if (!a || !b) return;
                const x1 = a.x + NW,
                    y1 = a.y + NH / 2,
                    x2 = b.x,
                    y2 = b.y + NH / 2,
                    mx = (x1 + x2) / 2;
                const rel = lfEdgeRel(e);
                const isUsage = rel !== 'feeds';
                const health = lfEdgeHealth(e);
                const col = isUsage ? lfC('usage') : lfC(health);
                const dash = isUsage || health !== 'ok' ? ' stroke-dasharray="7 5"' : '';
                const mk = isUsage ? 'usage' : health;
                paths += `<path d="M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${health === 'bad' ? 3 : 2.3}"${dash} marker-end="url(#lfA_${mk})" opacity=".9"/>`;
                const fr = isUsage ? lfFresh(lfNode(e.target)) : lfEdgeFresh(e);
                const lr = e.lastRun;
                const _pairs = lfEdgePairs(e);
                const _ea =
                    _pairs.length > 1 ? _pairs.length + ' attributs' : (_pairs[0] || {}).tgt || (_pairs[0] || {}).src || '';
                const lbl =
                    (attrView && _ea ? '◧ ' + _ea + ' · ' : '') +
                    ([
                        fr.status !== 'none' ? '⟳ ' + lfAge(fr.ageDays) : '',
                        lr && lr.rate != null ? 'Δ ' + lr.rate.toFixed(1).replace('.', ',') + ' %' : ''
                    ]
                        .filter(Boolean)
                        .join(' · ') || lfEdgeTypeLabel(e));
                let chipTxt = isUsage ? lfEdgeTypeLabel(e) + (fr.status !== 'none' ? ' · ⟳ ' + lfAge(fr.ageDays) : '') : lbl;
                if (isUsage) {
                    const l0 = lfEdgeTypeLabel(e),
                        kt = 't:' + e.target + '¦' + l0,
                        ks = 's:' + e.source + '¦' + l0;
                    const fk = fanCnt[ks] >= fanCnt[kt] ? ks : kt;
                    if (fanCnt[fk] >= 3) {
                        if (fanDone.has(fk)) chipTxt = null;
                        else {
                            fanDone.add(fk);
                            chipTxt = l0 + ' × ' + fanCnt[fk];
                        }
                    }
                }
                if (chipTxt !== null) {
                    // glissement le long de la courbe pour ne pas s'empiler au milieu
                    const slotK = Math.round(mx / 24);
                    const sIdx = (slotCnt[slotK] = (slotCnt[slotK] || 0) + 1) - 1;
                    const t = 0.5 + ((sIdx % 5) - 2) * 0.08;
                    const u = 1 - t;
                    const bx = u * u * u * x1 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x2;
                    const by = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
                    chips.push(
                        `<div class="lf-echip lf-e-${isUsage ? 'usage' : health}" data-edge="${e.id}" style="left:${bx}px;top:${by}px"><span class="lf-dot" style="background:${col}"></span>${escapeHTML(chipTxt)}${!isUsage && e.scope ? ' <span style="opacity:.6">⛊ ' + escapeHTML(e.scope) + '</span>' : ''}</div>`
                    );
                }
            });
            const marker = h =>
                `<marker id="lfA_${h}" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${lfC(h)}"/></marker>`;
            let hh = `<svg class="lf-edges" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs>${['ok', 'warn', 'bad', 'none', 'usage'].map(marker).join('')}</defs>${paths}</svg>`;
            // en-têtes de colonnes
            [...Array(maxCol + 1)].forEach((_, d) => {
                const arr = cols[d] || [];
                if (!arr.length) return;
                const x = maxCol ? (d / maxCol) * (W - NW - 20) + 10 : 10;
                const lbl = d === 0 ? '① Amont' : d === maxCol ? '③ Aval' : '② Intermédiaire';
                hh += `<div class="lf-colhdr" style="left:${x}px">${lbl}</div>`;
            });
            // nœuds
            nodes.forEach(n => {
                const p = pos[n.id];
                const fr = lfFresh(n);
                const role = lfNodeRole(n);
                const consolidates = lfConsolidates(n.id);
                const roleCls = (LF_ROLE[role] || LF_ROLE.consumer).badge;
                const incoming = edges.filter(e => e.target === n.id && e.lastRun);
                let distChip = '';
                if (incoming.length) {
                    const worstE = incoming.reduce((mx, e) => ((e.lastRun.rate || 0) > (mx.lastRun.rate || 0) ? e : mx));
                    const ds = lfDistStatus(worstE);
                    distChip = `<span class="lf-hchip lf-h-${ds}">Δ ${(worstE.lastRun.rate || 0).toFixed(1).replace('.', ',')} %</span>`;
                }
                const isApp = lfNodeKind(n) === 'app';
                const isObj = lfNodeKind(n) === 'object';
                const freshChip =
                    fr.status !== 'none'
                        ? `<span class="lf-hchip lf-h-${fr.status}">${fr.label}</span>`
                        : n.tableName || isApp || isObj
                          ? ''
                          : '<span class="lf-hchip lf-h-none">non mesuré</span>';
                const attrsBlock = attrView
                    ? `<div class="lf-attrs">${
                          lfNodeAttrs(n)
                              .slice(0, 5)
                              .map(a => `<div class="lf-attr">${escapeHTML(a)}</div>`)
                              .join('') || '<div class="lf-attr" style="color:#94a3b8">— aucun attribut relié —</div>'
                      }</div>`
                    : '';
                hh += `<div class="lf-node lf-i-${role}${isApp ? ' lf-kind-app' : ''}${isObj ? ' lf-kind-obj' : ''}" data-node="${n.id}" style="left:${p.x}px;top:${p.y}px">
                    <div class="lf-nh"><span class="lf-ic">${lfIcon(n)}</span><div><div class="lf-nm">${escapeHTML(n.name)}</div><div class="lf-sc">${escapeHTML(n.origine || n.domain || (LF_ROLE[role] || {}).lbl || '')}</div>
                        </div>
                        </div>
                    <span class="lf-role ${roleCls}">${lfIsReport(n) ? 'Rapport' : (LF_ROLE[role] || {}).lbl}</span>${consolidates ? '<span class="lf-role lf-r-ref" title="Alimenté par ≥ 2 sources">⑃ consolide</span>' : ''}${
                        isApp && lfOwnedTables(n.id).length
                            ? `<span class="lf-role lf-r-src" title="${
                                  foldCount[n.id]
                                      ? lfOwnedTables(n.id)
                                            .map(t2 => t2.name)
                                            .join(', ') +
                                        ' — sources intégrées à cette application (décochez « Détailler les sources » pour les afficher)'
                                      : 'Tables contenues / produites par cette application'
                              }">📦 ${foldCount[n.id] ? 'contient ' + foldCount[n.id] + ' source' + (foldCount[n.id] > 1 ? 's' : '') : 'contient ' + lfOwnedTables(n.id).length}</span>`
                            : ''
                    }${isObj && foldCount[n.id] ? `<span class="lf-role lf-r-src" title="Tables techniques qui composent cet objet métier — basculez en « Vue technique » pour les détailler">📦 ${foldCount[n.id]} table${foldCount[n.id] > 1 ? 's' : ''}</span>` : ''}${isApp && lfAppProduces(n.id) ? '<span class="lf-role lf-r-master" title="Produit (écrit) ses fichiers : c\'est elle le maître de la donnée">🗄 maître</span>' : ''}${lfIsReport(n) ? '<span class="lf-role lf-r-cons" title="Application terminale : elle restitue la donnée (rapport, tableau de bord)">📑 terminal</span>' : ''}${isObj && n.reprAppName ? `<span class="lf-role lf-r-app" title="Objet métier matérialisé/porté par cette application (référentiel)">🖥 ${escapeHTML(n.reprAppName)}</span>` : ''}${isApp && lfWritebackTables(n.id).length ? '<span class="lf-role lf-r-app" title="Lit ET écrit la même table (écriture en retour) — ses modifications resynchronisent le référentiel et ses consommateurs">↺ écriture en retour</span>' : ''}
                    ${attrsBlock}
                    <div class="lf-health">${freshChip}${distChip}</div></div>`;
            });
            hh += chips.join('');
            lfCanvasElement.innerHTML = hh;
            /* Les cartes ont une hauteur RÉELLE variable (badges qui passent à la ligne, liste
               d'attributs) alors que l'interligne était fixe : elles se recouvraient (photos).
               Après le rendu, on mesure chaque carte ; si l'une déborde de son interligne, on
               rejoue une fois la disposition avec les hauteurs mesurées. */
            if (!lfDrawGraph._pass2) {
                requestAnimationFrame(() => {
                    let need = false;
                    const hmap = {};
                    lfCanvasElement.querySelectorAll('.lf-node').forEach(nd => {
                        const id = nd.dataset.node,
                            hR = nd.offsetHeight;
                        hmap[id] = hR;
                        if (hR + 12 > rowGap) need = true;
                    });
                    if (need) {
                        lfDrawGraph._h = hmap;
                        lfDrawGraph._pass2 = true;
                        try {
                            lfDrawGraph();
                        } finally {
                            lfDrawGraph._pass2 = false;
                        }
                    }
                });
            }
            // Glisser-déposer des nœuds (souris + tactile) : la position est mémorisée sur le nœud.
            lfCanvasElement.querySelectorAll('.lf-node').forEach(nd => {
                let count = 0,
                    sy = 0,
                    ox = 0,
                    oy = 0,
                    moved = false,
                    dragging = false;
                const pt = ev => (ev.touches && ev.touches[0] ? ev.touches[0] : ev);
                const onMove = ev => {
                    if (!dragging) return;
                    const event = pt(ev);
                    const dx = event.clientX - count,
                        dy = event.clientY - sy;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
                    nd.style.left = Math.max(0, Math.min((lfCanvasElement.clientWidth || 900) - 40, ox + dx)) + 'px';
                    nd.style.top = Math.max(0, oy + dy) + 'px';
                    if (ev.cancelable) ev.preventDefault();
                };
                const onUp = () => {
                    if (!dragging) return;
                    dragging = false;
                    nd.style.zIndex = '';
                    nd.style.cursor = '';
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.removeEventListener('touchmove', onMove);
                    document.removeEventListener('touchend', onUp);
                    if (moved) {
                        const flowNode = lfNode(nd.dataset.node);
                        if (flowNode) {
                            flowNode.x = Math.round(parseFloat(nd.style.left));
                            flowNode.y = Math.round(parseFloat(nd.style.top));
                            persistAppState();
                        }
                        lfDrawGraph();
                    }
                };
                const onDown = ev => {
                    if (ev.button !== undefined && ev.button !== 0) return;
                    dragging = true;
                    moved = false;
                    const event = pt(ev);
                    count = event.clientX;
                    sy = event.clientY;
                    ox = parseFloat(nd.style.left) || 0;
                    oy = parseFloat(nd.style.top) || 0;
                    nd.style.zIndex = 50;
                    nd.style.cursor = 'grabbing';
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                    document.addEventListener('touchmove', onMove, { passive: false });
                    document.addEventListener('touchend', onUp);
                    if (ev.cancelable) ev.preventDefault();
                };
                nd.addEventListener('mousedown', onDown);
                nd.addEventListener('touchstart', onDown, { passive: false });
                nd.addEventListener('click', ev => {
                    if (moved) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        moved = false;
                        return;
                    }
                    lfOpenNode(nd.dataset.node);
                });
            });
            lfCanvasElement
                .querySelectorAll('.lf-echip')
                .forEach(ch => ch.addEventListener('click', () => lfOpenEdge(ch.dataset.edge)));
        }
        // Rétablit la disposition automatique (efface les positions manuelles des nœuds).
        function lfResetLayout() {
            const flowModel = lfModel();
            flowModel.nodes.forEach(n => {
                delete n.x;
                delete n.y;
            });
            persistAppState();
            renderGovernance();
            showSuccess('⇄ Carte réorganisée automatiquement.');
        }
        // Affiche/masque les objets métier sur la carte (dérive ou purge leurs nœuds/liens).
        function lfToggleObjects(on) {
            lfModel().showObjects = !!on;
            lfSyncFromData({ silent: true });
            renderGovernance();
            showSuccess(on ? '🏛️ Objets métier affichés sur la carte.' : 'Objets métier masqués.');
        }

        // ---- Builder actions ----
        function lfSaveNodeForm() {
            const name = (el('lf-n-name').value || '').trim();
            if (!name) return showError('Donnez un nom au système.');
            const flowModel = lfModel();
            const editing = lfEditNodeId ? lfNode(lfEditNodeId) : null;
            if (flowModel.nodes.some(n => n.name.toLowerCase() === name.toLowerCase() && (!editing || n.id !== editing.id)))
                return showError('Un nœud « ' + name + ' » existe déjà.');
            const kind = el('lf-n-kind') && el('lf-n-kind').value === 'app' ? 'app' : 'table';
            const terminal = kind === 'app' && el('lf-n-terminal') && el('lf-n-terminal').checked;
            const vals = {
                name,
                origine: (el('lf-n-orig').value || '').trim(),
                domain: (el('lf-n-dom').value || '').trim(),
                tableName: el('lf-n-tbl').value || ''
            };
            if (editing) {
                Object.assign(editing, vals);
                if (kind === 'app') {
                    editing.kind = 'app';
                    if (terminal) editing.terminal = true;
                    else delete editing.terminal;
                } else {
                    delete editing.kind;
                    delete editing.terminal;
                }
                lfEditNodeId = null;
            } else
                flowModel.nodes.push({
                    id: 'ln_' + generateId(),
                    ...vals,
                    ...(kind === 'app' ? { kind: 'app', ...(terminal ? { terminal: true } : {}) } : {})
                });
            persistAppState();
            renderGovernance();
        }
        function lfEditNodeStart(id) {
            lfEditNodeId = id;
            lfEditEdgeId = null;
            renderGovernance();
        }
        function lfEditCancel() {
            lfEditNodeId = null;
            lfEditEdgeId = null;
            renderGovernance();
        }
        function lfDelNode(id) {
            const flowModel = lfModel();
            const flowNode = lfNode(id);
            if (!flowNode) return;
            flowModel.nodes = flowModel.nodes.filter(x => x.id !== id);
            flowModel.edges = flowModel.edges.filter(e => e.source !== id && e.target !== id);
            persistAppState();
            renderGovernance();
        }
        function lfSaveEdgeForm() {
            const src = el('lf-e-src').value,
                tgt = el('lf-e-tgt').value;
            if (!src || !tgt || src === tgt) return showError('Choisissez une source et une cible distinctes.');
            const flowModel = lfModel();
            const editing = lfEditEdgeId ? lfEdge(lfEditEdgeId) : null;
            if (flowModel.edges.some(e => e.source === src && e.target === tgt && (!editing || e.id !== editing.id)))
                return showError('Ce lien existe déjà.');
            const element = el('lf-e-xk') ? el('lf-e-xk').value : 'none';
            const _xform =
                element === 'agg'
                    ? { kind: 'agg', fn: el('lf-e-xfn').value }
                    : element === 'scalar'
                      ? { kind: 'scalar', op: el('lf-e-xop').value, param: (el('lf-e-xparam').value || '').trim() }
                      : { kind: 'none' };
            const sA = (el('lf-e-sa').value || '').trim(),
                tA = (el('lf-e-ta').value || '').trim();
            let pairs;
            if (editing) {
                const ex = lfEdgePairs(editing);
                const first = {
                    id: ex[0] && !String(ex[0].id).startsWith('ap_legacy') ? ex[0].id : 'ap_' + generateId(),
                    src: sA,
                    tgt: tA,
                    xform: _xform
                };
                pairs = ex.length
                    ? [first, ...ex.slice(1).map(pp => ({ id: pp.id, src: pp.src, tgt: pp.tgt, xform: pp.xform }))]
                    : [first];
            } else pairs = [{ id: 'ap_' + generateId(), src: sA, tgt: tA, xform: _xform }];
            pairs = pairs.filter(pp => pp.src || pp.tgt);
            const vals = {
                source: src,
                target: tgt,
                type: 'feeds',
                nature: el('lf-e-nat') && LF_NATURE[el('lf-e-nat').value] ? el('lf-e-nat').value : 'recopie',
                scope: (el('lf-e-scope') ? el('lf-e-scope').value : '' || '').trim(),
                srcKey: (el('lf-e-sk').value || '').trim(),
                tgtKey: (el('lf-e-tk').value || '').trim(),
                slaHours: parseFloat(el('lf-e-sla').value) || 24,
                transformation: (el('lf-e-transf').value || '').trim(),
                attrPairs: pairs
            };
            if (editing) {
                delete editing.key;
                delete editing.attr;
                delete editing.srcAttr;
                delete editing.tgtAttr;
                delete editing.xform;
                Object.assign(editing, vals);
                editing.lastRun = null;
                lfEditEdgeId = null;
            } else flowModel.edges.push({ id: 'le_' + generateId(), ...vals, lastRun: null });
            persistAppState();
            renderGovernance();
        }
        function lfEditEdgeStart(id) {
            lfEditEdgeId = id;
            lfEditNodeId = null;
            renderGovernance();
        }
        function lfDelEdge(id) {
            const flowModel = lfModel();
            flowModel.edges = flowModel.edges.filter(e => e.id !== id);
            persistAppState();
            renderGovernance();
        }
        function lfSetThreshold(v) {
            const number = parseFloat(v);
            if (!isNaN(number) && number >= 0) {
                lfModel().threshold = number;
                persistAppState();
                renderGovernance();
            }
        }
        function lfClearAll() {
            if (!confirm('Effacer tout le flux (nœuds et liens) ?')) return;
            const flowModel = lfModel();
            flowModel.nodes = [];
            flowModel.edges = [];
            persistAppState();
            renderGovernance();
        }
        // R2 : la carte est une PROJECTION des données. « Tout redériver » la reconstruit intégralement
        // depuis les sources de vérité (tables conçues, origine/propriétaire, applications, objets métier),
        // en RÉATTACHANT par identité vos points de mesure (clés, attributs, transformations, contrôles,
        // nature, périmètre) et les positions manuelles. Ce qui a été ajouté à la main et n'est plus
        // adossé à une donnée disparaît → carte propre.
        function lfRederiveAll() {
            if (
                !confirm(
                    'Redériver toute la carte depuis vos données ?\n\nLes nœuds/liens ajoutés à la main qui ne correspondent plus à une donnée seront retirés. Vos points de mesure (clés, attributs, contrôles) et vos positions sont réattachés automatiquement.'
                )
            )
                return;
            const flowModel = lfModel();
            const idOf = n => (n ? n.tableName || n.name || '' : '');
            // 1. Mémorise les annotations de mesure par identité (source→cible + nature du lien).
            const ann = {};
            flowModel.edges.forEach(e => {
                const flowNode = lfNode(e.source),
                    t = lfNode(e.target);
                if (!flowNode || !t) return;
                ann[idOf(flowNode) + '¦' + idOf(t) + '¦' + lfEdgeRel(e)] = {
                    srcKey: e.srcKey,
                    tgtKey: e.tgtKey,
                    attrPairs: e.attrPairs,
                    slaHours: e.slaHours,
                    transformation: e.transformation,
                    nature: e.nature,
                    scope: e.scope,
                    lastRun: e.lastRun
                };
            });
            const pos = {};
            flowModel.nodes.forEach(n => {
                if (n.x != null || n.y != null) pos[idOf(n)] = { x: n.x, y: n.y };
            });
            // 2. Reset complet puis redérivation depuis les données.
            flowModel.nodes = [];
            flowModel.edges = [];
            lfSyncFromData({ silent: true });
            // 3. Réattache annotations + positions par identité.
            let reAnn = 0;
            flowModel.edges.forEach(e => {
                const flowNode = lfNode(e.source),
                    t = lfNode(e.target);
                if (!flowNode || !t) return;
                const a = ann[idOf(flowNode) + '¦' + idOf(t) + '¦' + lfEdgeRel(e)];
                if (!a) return;
                reAnn++;
                if (a.srcKey) e.srcKey = a.srcKey;
                if (a.tgtKey) e.tgtKey = a.tgtKey;
                if (a.attrPairs && a.attrPairs.length) e.attrPairs = a.attrPairs;
                if (a.slaHours) e.slaHours = a.slaHours;
                if (a.transformation) e.transformation = a.transformation;
                if (a.nature) e.nature = a.nature;
                if (a.scope) e.scope = a.scope;
                if (a.lastRun) e.lastRun = a.lastRun;
            });
            flowModel.nodes.forEach(n => {
                const pp = pos[idOf(n)];
                if (pp) {
                    n.x = pp.x;
                    n.y = pp.y;
                }
            });
            persistAppState();
            renderGovernance();
            showSuccess(
                `♻️ Carte redérivée depuis vos données (${flowModel.nodes.length} nœud(s), ${flowModel.edges.length} lien(s))${reAnn ? ` — ${reAnn} point(s) de mesure réattaché(s)` : ''}.`
            );
        }
        // Amorçage depuis les objets métier : maître → objet (référentiel) → destinataires (consommateurs).
        function lfSeedFromObjects() {
            const governance = state.governance;
            const bos = governance.businessObjects || [];
            if (!bos.length) return showError('Aucun objet métier défini (onglet Objets métier) pour amorcer le flux.');
            const flowModel = lfModel();
            let added = 0;
            const ensure = (name, role, tableName) => {
                let node = flowModel.nodes.find(x => x.name.toLowerCase() === String(name).toLowerCase());
                if (!node) {
                    node = { id: 'ln_' + generateId(), name: String(name), role, domain: '', tableName: tableName || '' };
                    flowModel.nodes.push(node);
                    added++;
                }
                return node;
            };
            bos.forEach(bo => {
                const ref = ensure(bo.name, 'reference', (boMasterTable ? (boMasterTable(bo) || {}).name : '') || '');
                (bo.sources || []).forEach(s => {
                    const tn = s.table || '';
                    if (s.role === 'maitre') {
                        const src = ensure(tn || bo.name + ' (maître)', 'master', tn);
                        if (!flowModel.edges.some(e => e.source === src.id && e.target === ref.id))
                            flowModel.edges.push({
                                id: 'le_' + generateId(),
                                source: src.id,
                                target: ref.id,
                                type: 'consolidates',
                                key: '',
                                attr: '',
                                slaHours: 24,
                                transformation: '',
                                lastRun: null
                            });
                    } else if (s.role === 'destinataire') {
                        const cons = ensure(tn || bo.name + ' aval', 'consumer', tn);
                        if (!flowModel.edges.some(e => e.source === ref.id && e.target === cons.id))
                            flowModel.edges.push({
                                id: 'le_' + generateId(),
                                source: ref.id,
                                target: cons.id,
                                type: 'reads',
                                key: '',
                                attr: '',
                                slaHours: 24,
                                transformation: '',
                                lastRun: null
                            });
                    }
                });
            });
            persistAppState();
            renderGovernance();
            showSuccess(
                added
                    ? `✨ Flux amorcé : ${added} nœud(s) créé(s) depuis les objets métier. Reliez chaque nœud à une source chargée et renseignez clé + attribut pour activer les contrôles.`
                    : 'Le flux est déjà à jour par rapport aux objets métier.'
            );
        }

        // ---- Lot 2 : Synchroniser depuis les données (dérivation table-centrée) ----
        // Reconstruit les alimentations à partir des TABLES CONÇUES : chaque table conçue est
        // « alimentée » par ses sources contributrices (design.sources) et par ses sources
        // d'enrichissement (design.joins). Fusion ADDITIVE par identité (nom de table pour les
        // nœuds, couple source→cible pour les liens) : rien n'est écrasé ni supprimé, les réglages
        // manuels (clés, attributs contrôlés, SLA, transformations, derniers contrôles) sont préservés.
        function lfSyncFromData(opts) {
            opts = opts || {};
            const only = opts.onlyAssetId || null;
            const silent = !!opts.silent;
            const say = msg => {
                if (!silent) showSuccess(msg);
            };
            const flowModel = lfModel();
            const governance = state.governance;
            const dict = governance.dictionary || {};
            // V6.12.1 : en lecture MÉTIER, les objets métier sont indispensables (sans eux, aucun lien
            // « compose » n'est dérivé et les tables ne peuvent pas être repliées). On les force.
            if (flowModel.grain === 'bo' && !flowModel.showObjects) flowModel.showObjects = true;
            let addedN = 0,
                addedE = 0,
                filledO = 0,
                removedE = 0,
                removedN = 0;
            // Usages DÉRIVÉS souhaités après cette synchro (clé rel:appId:tableId) : sert à retirer
            // les liens « lit »/« écrit » devenus obsolètes (table qui n'est plus déclarée).
            const desired = new Set();
            // Réutilise un nœud existant portant cette table (manuel ou dérivé), sinon en crée un dérivé.
            const nodeForTable = tblName => {
                let node =
                    flowModel.nodes.find(x => x.tableName === tblName) ||
                    flowModel.nodes.find(x => !x.tableName && x.name && x.name.toLowerCase() === String(tblName).toLowerCase());
                if (!node) {
                    node = {
                        id: 'ln_' + generateId(),
                        name: tblName,
                        origine: '',
                        domain: '',
                        tableName: tblName,
                        derived: true
                    };
                    flowModel.nodes.push(node);
                    addedN++;
                }
                if (!node.tableName) node.tableName = tblName;
                if (!node.origine) {
                    const ss = (dict[tblName] || {}).sourceSystem;
                    if (ss) {
                        node.origine = ss;
                        filledO++;
                    }
                } // origine complétée, jamais remplacée
                return node;
            };
            const ensureEdge = (srcName, tgtName, rel) => {
                if (!tableByName(srcName)) return;
                const sN = nodeForTable(srcName),
                    tN = nodeForTable(tgtName);
                if (sN.id === tN.id) return;
                if (flowModel.edges.some(e => e.source === sN.id && e.target === tN.id)) return; // lien déjà présent → préservé tel quel
                flowModel.edges.push({
                    id: 'le_' + generateId(),
                    source: sN.id,
                    target: tN.id,
                    type: 'feeds',
                    rel: rel || 'feeds',
                    srcKey: '',
                    tgtKey: '',
                    attrPairs: [],
                    slaHours: 24,
                    transformation: '',
                    lastRun: null,
                    derived: true
                });
                addedE++;
            };
            // Réutilise/crée un nœud APPLICATION (kind:'app'), apparié par identifiant d'actif.
            let addedApp = 0;
            const nodeForApp = asset => {
                let node =
                    flowModel.nodes.find(x => x.assetId === asset.id) ||
                    flowModel.nodes.find(
                        x => lfNodeKind(x) === 'app' && x.name && x.name.toLowerCase() === String(asset.name).toLowerCase()
                    );
                if (!node) {
                    node = {
                        id: 'ln_' + generateId(),
                        name: asset.name,
                        kind: 'app',
                        assetId: asset.id,
                        domain: asset.domain || '',
                        derived: true
                    };
                    flowModel.nodes.push(node);
                    addedN++;
                    addedApp++;
                }
                node.kind = 'app';
                if (!node.assetId) node.assetId = asset.id;
                return node;
            };
            const ensureUsageEdge = (tblName, appNode, rel) => {
                if (!tableByName(tblName)) return;
                const tN = nodeForTable(tblName);
                const [src, tgt] = rel === 'writes' ? [appNode, tN] : [tN, appNode]; // lit : table→appli ; écrit : appli→table
                if (src.id === tgt.id) return;
                desired.add(rel + ':' + appNode.id + ':' + tN.id); // usage souhaité (même si le lien existe déjà)
                if (flowModel.edges.some(e => e.source === src.id && e.target === tgt.id)) return;
                flowModel.edges.push({
                    id: 'le_' + generateId(),
                    source: src.id,
                    target: tgt.id,
                    type: 'feeds',
                    rel,
                    srcKey: '',
                    tgtKey: '',
                    attrPairs: [],
                    slaHours: 24,
                    transformation: '',
                    lastRun: null,
                    derived: true
                });
                addedE++;
            };
            let designedCount = 0;
            // Les alimentations table→table ne sont recalculées que lors d'une synchro GLOBALE.
            if (!only)
                Object.values(state.tables).forEach(t => {
                    if (t.type !== 'designed' || !t.design || t.status !== 'ready') return;
                    designedCount++;
                    const feeders = new Set();
                    (t.design.sources || []).forEach(s => {
                        if (s && s.src) feeders.add(s.src);
                    });
                    (t.design.joins || []).forEach(j => {
                        if (j && j.src) feeders.add(j.src);
                        if (j && j.viaSrc) feeders.add(j.viaSrc);
                    });
                    feeders.forEach(srcName => ensureEdge(srcName, t.name, 'feeds'));
                });
            // Couche application (lot 3) : « lit » = tables/colonnes utilisées par un actif ; « écrit »
            // = actif dont le NOM est le système source d'une table (producteur déclaré au dictionnaire).
            const allAssets = governance.assets || [];
            const assets = only ? allAssets.filter(a => a.id === only) : allAssets;
            assets.forEach(a => {
                const reads = new Set([...(a.tables || []), ...(a.columns || []).map(c => c && c.table).filter(Boolean)]);
                const writesTables = Array.from(
                    new Set([
                        ...(a.sources || []),
                        ...Object.keys(dict).filter(
                            tn =>
                                String((dict[tn] || {}).sourceSystem || '').toLowerCase() === String(a.name || '').toLowerCase()
                        )
                    ])
                ).filter(tn => tableByName(tn));
                if (!reads.size && !writesTables.length) return; // rien de déclaré → aucun usage souhaité (les liens dérivés seront purgés)
                const appN = nodeForApp(a);
                reads.forEach(tn => ensureUsageEdge(tn, appN, 'reads'));
                writesTables.forEach(tn => ensureUsageEdge(tn, appN, 'writes'));
            });
            // Producteur = MAÎTRE (v5.10) : l'ORIGINE (système amont) d'un fichier est l'application qui
            // le produit. On la matérialise en nœud application « écrit → fichier » ; le fichier devient
            // une « Source » (extrait) et n'est plus étiqueté maître. Reliée à l'actif homonyme s'il existe.
            const nodeForOrigin = origin => {
                const asset = (governance.assets || []).find(
                    a => String(a.name || '').toLowerCase() === String(origin).toLowerCase()
                );
                let n =
                    (asset && flowModel.nodes.find(x => x.assetId === asset.id)) ||
                    flowModel.nodes.find(
                        x => lfNodeKind(x) === 'app' && x.name && x.name.toLowerCase() === String(origin).toLowerCase()
                    );
                if (!n) {
                    n = {
                        id: 'ln_' + generateId(),
                        name: String(origin),
                        kind: 'app',
                        assetId: asset ? asset.id : undefined,
                        producer: true,
                        derived: true
                    };
                    flowModel.nodes.push(n);
                    addedN++;
                    addedApp++;
                } else {
                    n.kind = 'app';
                    n.producer = true;
                    if (asset && !n.assetId) n.assetId = asset.id;
                }
                return n;
            };
            if (!only)
                flowModel.nodes
                    .filter(n => lfNodeKind(n) !== 'app' && n.origine && n.tableName)
                    .slice()
                    .forEach(fileNode => {
                        const producer = nodeForOrigin(fileNode.origine);
                        if (producer.id === fileNode.id) return;
                        desired.add('writes:' + producer.id + ':' + fileNode.id);
                        if (!flowModel.edges.some(e => e.source === producer.id && e.target === fileNode.id)) {
                            flowModel.edges.push({
                                id: 'le_' + generateId(),
                                source: producer.id,
                                target: fileNode.id,
                                type: 'feeds',
                                rel: 'writes',
                                srcKey: '',
                                tgtKey: '',
                                attrPairs: [],
                                slaHours: 24,
                                transformation: '',
                                lastRun: null,
                                derived: true,
                                produced: true
                            });
                            addedE++;
                        }
                    });
            // -- OBJETS MÉTIER (v5.11) : affichés si m.showObjects. Un objet = une vue ; ses sources
            //    « maître »/« contributeur » le COMPOSENT (table→objet), ses « destinataires » le
            //    DIFFUSENT (objet→table). Ces liens n'affectent pas les rôles de tables (rel ≠ feeds). --
            const desiredBo = new Set();
            if (!only && flowModel.showObjects)
                (governance.businessObjects || []).forEach(bo => {
                    let boN =
                        flowModel.nodes.find(x => x.boId === bo.id) ||
                        flowModel.nodes.find(
                            x =>
                                lfNodeKind(x) === 'object' &&
                                x.name &&
                                x.name.toLowerCase() === String(bo.name || '').toLowerCase()
                        );
                    if (!boN) {
                        boN = {
                            id: 'ln_' + generateId(),
                            name: bo.name || 'Objet',
                            kind: 'object',
                            boId: bo.id,
                            domain: bo.domain || '',
                            derived: true
                        };
                        flowModel.nodes.push(boN);
                        addedN++;
                    } else {
                        boN.kind = 'object';
                        if (!boN.boId) boN.boId = bo.id;
                    }
                    const _reprApp = bo.appId ? assetById(bo.appId) : null;
                    boN.reprAppName = _reprApp ? _reprApp.name : '';
                    (bo.sources || []).forEach(s => {
                        if (!s || !s.table || !tableByName(s.table)) return;
                        const tN2 = nodeForTable(s.table);
                        if (s.role === 'destinataire') {
                            desiredBo.add('diffuses:' + boN.id + ':' + tN2.id);
                            if (!flowModel.edges.some(e => e.source === boN.id && e.target === tN2.id)) {
                                flowModel.edges.push({
                                    id: 'le_' + generateId(),
                                    source: boN.id,
                                    target: tN2.id,
                                    type: 'feeds',
                                    rel: 'diffuses',
                                    attrPairs: [],
                                    slaHours: 24,
                                    transformation: '',
                                    lastRun: null,
                                    derived: true
                                });
                                addedE++;
                            }
                        } else {
                            desiredBo.add('composes:' + tN2.id + ':' + boN.id);
                            if (!flowModel.edges.some(e => e.source === tN2.id && e.target === boN.id)) {
                                flowModel.edges.push({
                                    id: 'le_' + generateId(),
                                    source: tN2.id,
                                    target: boN.id,
                                    type: 'feeds',
                                    rel: 'composes',
                                    attrPairs: [],
                                    slaHours: 24,
                                    transformation: '',
                                    lastRun: null,
                                    derived: true
                                });
                                addedE++;
                            }
                        }
                    });
                    // V6.5 : l'application « référentiel » qui matérialise l'objet → vrai lien app → objet.
                    if (_reprApp) {
                        const appN = nodeForApp(_reprApp);
                        if (appN && appN.id !== boN.id) {
                            desiredBo.add('represents:' + appN.id + ':' + boN.id);
                            if (
                                !flowModel.edges.some(
                                    e => e.source === appN.id && e.target === boN.id && lfEdgeRel(e) === 'represents'
                                )
                            ) {
                                flowModel.edges.push({
                                    id: 'le_' + generateId(),
                                    source: appN.id,
                                    target: boN.id,
                                    type: 'feeds',
                                    rel: 'represents',
                                    attrPairs: [],
                                    slaHours: 24,
                                    transformation: '',
                                    lastRun: null,
                                    derived: true
                                });
                                addedE++;
                            }
                        }
                    }
                    // V6.8 : les applications déclarées sur l'objet (« Produite par » / « Consommée par »)
                    // deviennent de vrais nœuds et liens de la carte — même si elles ne lisent aucune table.
                    const _boEdge = (asset, rel) => {
                        if (!asset) return;
                        const appN = nodeForApp(asset);
                        if (!appN || appN.id === boN.id) return;
                        const [s2, t2] = rel === 'produces' ? [appN, boN] : [boN, appN];
                        desiredBo.add(rel + ':' + s2.id + ':' + t2.id);
                        if (flowModel.edges.some(e => e.source === s2.id && e.target === t2.id && lfEdgeRel(e) === rel)) return;
                        flowModel.edges.push({
                            id: 'le_' + generateId(),
                            source: s2.id,
                            target: t2.id,
                            type: 'feeds',
                            rel,
                            attrPairs: [],
                            slaHours: 24,
                            transformation: '',
                            lastRun: null,
                            derived: true
                        });
                        addedE++;
                    };
                    (bo.producedBy || []).forEach(id => _boEdge(assetById(id), 'produces'));
                    (bo.consumedBy || []).forEach(id => _boEdge(assetById(id), 'consumes'));
                });
            // -- Purge des liens d'usage DÉRIVÉS obsolètes (déclaration retirée). Les liens MANUELS
            //    (derived non vrai) et les usages d'applis non concernées sont laissés intacts. --
            const inScope = appNode =>
                appNode &&
                lfNodeKind(appNode) === 'app' &&
                (appNode.assetId || appNode.producer) &&
                (!only || appNode.assetId === only);
            flowModel.edges = flowModel.edges.filter(e => {
                if (!e.derived) return true;
                const rel = lfEdgeRel(e);
                if (
                    rel === 'composes' ||
                    rel === 'diffuses' ||
                    rel === 'represents' ||
                    rel === 'produces' ||
                    rel === 'consumes'
                ) {
                    // liens d'objet métier
                    if (only) return true; // synchro ciblée d'une appli : on ne touche pas les objets
                    if (flowModel.showObjects && desiredBo.has(rel + ':' + e.source + ':' + e.target)) return true;
                    removedE++;
                    return false; // objets masqués OU lien obsolète → retiré
                }
                if (rel !== 'reads' && rel !== 'writes') return true;
                const appNode = rel === 'writes' ? lfNode(e.source) : lfNode(e.target);
                const tblNode = rel === 'writes' ? lfNode(e.target) : lfNode(e.source);
                if (!inScope(appNode) || !tblNode) return true;
                if (desired.has(rel + ':' + appNode.id + ':' + tblNode.id)) return true;
                removedE++;
                return false;
            });
            // -- Purge des nœuds APPLICATION / OBJET dérivés devenus orphelins (plus aucun lien). --
            flowModel.nodes = flowModel.nodes.filter(n => {
                const k = lfNodeKind(n);
                if (!n.derived || (k !== 'app' && k !== 'object')) return true;
                if (only) {
                    // synchro ciblée : ne considère que l'appli de cet actif
                    if (k !== 'app' || n.assetId !== only) return true;
                    if (flowModel.edges.some(e => e.source === n.id || e.target === n.id)) return true;
                    removedN++;
                    return false;
                }
                if (k === 'object' && !flowModel.showObjects) {
                    removedN++;
                    return false;
                } // objets masqués → retirés
                if (flowModel.edges.some(e => e.source === n.id || e.target === n.id)) return true;
                removedN++;
                return false;
            });
            if (!only && !designedCount && !allAssets.length) {
                if (!silent)
                    showError(
                        'Rien à dériver : concevez au moins une table (onglet « Tables conçues ») et/ou déclarez des applications & processus (onglet « Applis & processus »), ou construisez le flux à la main.'
                    );
                return;
            }
            persistAppState();
            if (!silent) renderGovernance();
            const conflicts = lfMasteryConflicts();
            if (!addedN && !addedE && !filledO && !removedE && !removedN) {
                say(
                    'La carte est déjà à jour par rapport aux données (aucun changement).' +
                        (conflicts.length ? ` ⚠️ ${conflicts.length} conflit(s) de maîtrise détecté(s).` : '')
                );
                return;
            }
            const parts = [];
            if (addedN) parts.push(`${addedN} nœud(s) ajouté(s)${addedApp ? ` (dont ${addedApp} application(s))` : ''}`);
            if (addedE) parts.push(`${addedE} lien(s) ajouté(s)`);
            if (removedE) parts.push(`${removedE} lien(s) obsolète(s) retiré(s)`);
            if (removedN) parts.push(`${removedN} application(s) orpheline(s) retirée(s)`);
            if (filledO) parts.push(`${filledO} origine(s) renseignée(s)`);
            say(
                `🔄 Synchronisé depuis les données : ${parts.join(', ')}.${conflicts.length ? ` ⚠️ ${conflicts.length} conflit(s) de maîtrise détecté(s) — voir le bandeau.` : ''} Vos réglages manuels et liens ajoutés à la main sont préservés.`
            );
        }
        // Resynchronise la carte pour UNE application dès qu'on (dé)coche ses tables/colonnes —
        // uniquement si elle figure déjà sur le lineage. Renvoie true si une resynchro a eu lieu.
        function lfAutoSyncAsset(assetId) {
            if (!lfModel().nodes.some(n => n.assetId === assetId)) return false;
            lfSyncFromData({ onlyAssetId: assetId, silent: true });
            return true;
        }

        // Conflit de maîtrise (lot 3) : ≥ 2 sources « maître » sur un objet métier SANS règle de
        // maîtrise contextuelle (conditions disjointes) => deux maîtres qui se chevauchent => alerte.
        function lfMasteryConflicts() {
            const bos = state.governance.businessObjects || [];
            const out = [];
            bos.forEach(bo => {
                const masters = (bo.sources || []).filter(s => s.role === 'maitre');
                const hasCtx = ((bo.contextRules || {}).rules || []).length > 0;
                if (masters.length >= 2 && !hasCtx)
                    out.push({ bo: bo.name, tables: masters.map(s => s.table), count: masters.length });
            });
            return out;
        }
        // Cohérence du modèle (R3) : la MAÎTRISE est calculée d'UNE seule façon (l'application
        // propriétaire d'une table) et on signale les contradictions entre déclarations.
        function lfModelChecks() {
            const flowModel = lfModel();
            const governance = state.governance;
            const out = [];
            const push = (sev, cat, msg) => out.push({ sev, cat, msg });
            // 1. Une table avec ≥ 2 applications propriétaires (deux « maîtres » d'appartenance).
            flowModel.nodes
                .filter(n => lfNodeKind(n) === 'table')
                .forEach(t => {
                    const owners = [
                        ...new Set(
                            flowModel.edges.filter(e => e.target === t.id && lfEdgeRel(e) === 'writes').map(e => e.source)
                        )
                    ]
                        .map(id => lfNode(id))
                        .filter(a => a && lfNodeKind(a) === 'app');
                    if (owners.length >= 2)
                        push(
                            'error',
                            'proprio',
                            `<b>${escapeHTML(t.name)}</b> a ${owners.length} applications propriétaires (${owners.map(a => escapeHTML(a.name)).join(', ')}) — une table appartient à UNE application.`
                        );
                });
            // 2. Objet métier à ≥ 2 sources « maître » sans conditions disjointes.
            lfMasteryConflicts().forEach(c =>
                push(
                    'error',
                    'maitrise',
                    `Objet <b>${escapeHTML(c.bo)}</b> : ${c.count} sources « maître » sans conditions disjointes (${c.tables.map(escapeHTML).join(', ')}).`
                )
            );
            // 3. Correction sans périmètre vers une table qui a un propriétaire → risque de conflit.
            flowModel.edges
                .filter(e => lfEdgeRel(e) === 'feeds' && lfEdgeNature(e) === 'correction' && !String(e.scope || '').trim())
                .forEach(e => {
                    const flowNode = lfNode(e.target);
                    if (flowNode && lfProducerOf(flowNode.id))
                        push(
                            'warn',
                            'correction',
                            `Correction sans périmètre vers <b>${escapeHTML(flowNode.name)}</b> — précisez un périmètre pour éviter un conflit avec son propriétaire.`
                        );
                });
            // 4. Objet métier sans aucune source « maître » désignée.
            (governance.businessObjects || []).forEach(bo => {
                const masters = (bo.sources || []).filter(s => s.role === 'maitre');
                const hasCtx = ((bo.contextRules || {}).rules || []).length > 0;
                if ((bo.sources || []).length && !masters.length && !hasCtx)
                    push('warn', 'objet', `Objet <b>${escapeHTML(bo.name)}</b> : aucune source « maître » désignée.`);
            });
            // 5. Table qui alimente en aval mais sans application propriétaire (origine) renseignée.
            flowModel.nodes
                .filter(
                    n =>
                        lfNodeKind(n) === 'table' &&
                        n.tableName &&
                        !lfProducerOf(n.id) &&
                        flowModel.edges.some(e => e.source === n.id && lfEdgeRel(e) === 'feeds')
                )
                .forEach(t => {
                    push(
                        'warn',
                        'proprio',
                        `<b>${escapeHTML(t.name)}</b> alimente d'autres tables mais n'a pas d'application propriétaire — renseignez son « Système source » (dictionnaire) ou son origine.`
                    );
                });
            // 6. (V6) Source d'un objet métier qui n'est rattachée à aucune application — on ne remplit
            //    jamais un objet directement depuis un fichier : la donnée passe par une application.
            (governance.businessObjects || []).forEach(bo => {
                (bo.sources || [])
                    .filter(s => s && s.table && tableByName(s.table) && !appOwnerOfSource(s.table))
                    .forEach(s => {
                        push(
                            'warn',
                            'appli',
                            `Objet <b>${escapeHTML(bo.name)}</b> : la source <b>${escapeHTML(s.table)}</b> n'appartient à aucune application — rattachez-la à son application (c'est elle le maître, pas le fichier).`
                        );
                    });
            });
            return out;
        }

        // ---- Drawers ----
        function lfOpenNode(id) {
            const flowNode = lfNode(id);
            if (!flowNode) return;
            const flowModel = lfModel();
            const down = flowModel.edges.filter(e => e.source === id),
                up = flowModel.edges.filter(e => e.target === id);
            const isApp = lfNodeKind(flowNode) === 'app';
            const _produces = isApp && lfAppProduces(flowNode.id);
            const fr = lfFresh(flowNode);
            let roleTxt =
                {
                    master: "<b>Système maître</b> de l'objet : source de vérité. Les copies en aval ne devraient jamais diverger.",
                    source: "<b>Source</b> (extrait/fichier) : ce fichier n'est pas le maître — il APPARTIENT à l'application qui le produit (son origine). Le maître de la donnée est cette application.",
                    reference:
                        '<b>Référentiel</b> (déduit : ≥ 2 alimentations entrantes) : consolide la donnée de plusieurs sources, la transforme et la redistribue aux consommateurs.',
                    consumer:
                        '<b>Consommateur</b> : lit la donnée du référentiel. À surveiller : fraîcheur de sa copie et cohérence avec le maître.',
                    app: "<b>Application / processus</b> : consomme (lit) des tables. Sa fraîcheur est <b>héritée</b> de la pire des tables qu'elle lit ; pas de distorsion propre (la donnée EST celle des tables).",
                    object: '<b>Objet métier</b> (une vue) : regroupement de colonnes de tables. Ses sources maître/contributeur le <b>composent</b> ; ses destinataires le <b>diffusent</b>. Il ne porte pas de mesure propre — la santé se lit sur les tables qui le composent.'
                }[lfNodeRole(flowNode)] || '';
            if (_produces)
                roleTxt =
                    '<b>Application MAÎTRE de la donnée</b> : elle <b>produit</b> (écrit) ' +
                    lfModel().edges.filter(e => e.source === flowNode.id && lfEdgeRel(e) === 'writes').length +
                    " fichier(s)/table(s) — c'est la source de vérité. Les fichiers ne sont que ses extraits ; ils sont consommés en aval.";
            const body = `<div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Rôle dans le flux</h4>
                <div class="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">${roleTxt}</div></div>
                <div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Fraîcheur</h4>
                <div class="lf-kv"><div class="lf-cell"><div class="lf-ck">${isApp ? 'Fraîcheur' : 'Source liée'}</div><div class="lf-cv" style="font-size:13px">${isApp ? (fr.inherited ? '<span style="color:#5b21b6">héritée des tables lues</span>' : '<span style="color:#94a3b8">aucune table lue</span>') : flowNode.tableName ? escapeHTML(flowNode.tableName) + (tableByName(flowNode.tableName) ? '' : ' <span style="color:#dc2626">(absente)</span>') : '<span style="color:#94a3b8">aucune</span>'}</div>
                    </div>
                <div class="lf-cell"><div class="lf-ck">Âge / SLA</div>
                    <div class="lf-cv" style="font-size:13px;color:${fr.status === 'bad' ? '#dc2626' : fr.status === 'warn' ? '#d97706' : '#16a34a'}">${fr.status === 'none' ? '<span style="color:#94a3b8">non mesuré</span>' : lfAge(fr.ageDays) + (fr.maxDays ? ' / ≤ ' + lfAge(fr.maxDays) : '') + (fr.inherited ? ' (hérité)' : '')}</div>
                    </div>
                    </div>
                ${fr.freq ? `<div class="text-[11px] text-slate-400 mt-2">Fréquence attendue (dictionnaire) : ${escapeHTML(fr.freq)}</div>` : flowNode.tableName ? '<div class="text-[11px] text-slate-400 mt-2">Renseignez « Fréquence de mise à jour » dans le dictionnaire de la source pour activer le SLA de fraîcheur.</div>' : ''}</div>
                ${
                    isApp
                        ? (() => {
                              const owned = lfOwnedTables(id);
                              const reads = flowModel.edges
                                  .filter(e => e.target === id && lfEdgeRel(e) === 'reads')
                                  .map(e => lfNode(e.source))
                                  .filter(Boolean);
                              const lst = a =>
                                  a.length
                                      ? a.map(x => `<code style="font-size:11px">${escapeHTML(x.name)}</code>`).join(', ')
                                      : '<span style="color:#cbd5e1">aucune</span>';
                              return `<div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Contenu de l'application</h4>
                    <div class="text-xs text-slate-600 mb-1">📦 <b>Contient / produit</b> : ${lst(owned)}</div>
                    <div class="text-xs text-slate-600">👁 <b>Lit</b> : ${lst(reads)}</div>
                    ${lfIsReport(flowNode) ? '<div class="text-[11px] text-emerald-700 mt-1.5 bg-emerald-50 border border-emerald-100 rounded px-2 py-1">📑 Application <b>terminale</b> (rapport) : elle restitue la donnée et ne l\'alimente pas plus loin.</div>' : ''}</div>`;
                          })()
                        : ''
                }
                <div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Connexions</h4>
                <div class="text-xs text-slate-500 mb-1">↑ ${up.length} flux entrant(s) · ↓ ${down.length} flux sortant(s)</div>
                ${down.map(e => `<div class="lf-mism"><span class="lf-k">→ ${escapeHTML((lfNode(e.target) || {}).name || '?')}</span><span class="lf-mv">${lfEdgeTypeLabel(e)}</span></div>`).join('')}</div>
                <div class="mb-2"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Analyse d'impact</h4>
                <div class="text-xs text-slate-500">${isApp ? `Cette application <b>dépend de ${up.length}</b> table(s) lue(s) : un problème sur l'une d'elles la touche directement.` : `Si cet actif change, <b>${down.length}</b> consommateur(s) direct(s) sont affectés${down.some(e => lfEdgeRel(e) === 'reads') ? ` (dont ${down.filter(e => lfEdgeRel(e) === 'reads').length} application(s))` : ''}.`}</div>
                    </div>`;
            const _runDown = lfDownstreamFeeds(id).filter(lfRunnableEdge).length;
            const _chainBtn = _runDown
                ? `<button onclick="lfReconDownstream('${id}', this)" title="Relance la réconciliation de toutes les alimentations situées en aval de ce nœud" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-sm mb-2">↻ Contrôler toute la chaîne aval (${_runDown})</button>`
                : '';
            openUxDrawer({
                sem: '',
                title: lfIcon(flowNode) + ' ' + flowNode.name,
                sub:
                    (lfIsReport(flowNode) ? 'Rapport' : (LF_ROLE[lfNodeRole(flowNode)] || {}).lbl) +
                    (flowNode.origine ? ' · ' + flowNode.origine : flowNode.domain ? ' · ' + flowNode.domain : ''),
                body,
                foot:
                    _chainBtn +
                    '<button onclick="closeUxDrawer()" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm">Fermer</button>'
            });
        }
        function lfOpenEdge(id) {
            const e = lfEdge(id);
            if (!e) return;
            const flowNode = lfNode(e.source),
                t = lfNode(e.target);
            if (!flowNode || !t) return;
            // Liens d'usage (lecture / écriture d'une application) : pas de distorsion à mesurer —
            // la donnée EST celle de la table. On montre la nature, la fraîcheur héritée et l'impact.
            const rel = lfEdgeRel(e);
            if (rel !== 'feeds') {
                const isRead = rel === 'reads';
                const tbl = isRead ? flowNode : t;
                const app = isRead ? t : flowNode;
                const frT = lfFresh(tbl);
                // Consommation partielle : sous-ensemble d'attributs déclarés sur le lien de lecture.
                const consumed = lfConsumedAttrs(e);
                const consumeBlock = isRead
                    ? `<div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Périmètre consommé</h4>
                    <div class="text-xs">${consumed.length ? `<span class="lf-hchip lf-h-warn" style="font-size:11px;padding:3px 9px">consommation partielle</span> — ${consumed.length} attribut(s) : ${consumed.map(a => `<code>${escapeHTML(a)}</code>`).join(', ')}` : `<span class="lf-hchip lf-h-ok" style="font-size:11px;padding:3px 9px">toutes les colonnes</span> <span class="text-slate-400">— renseignez des attributs sur le lien (bouton ✎) pour déclarer un sous-ensemble</span>`}</div>
                        </div>`
                    : '';
                // Écriture en retour (write-back) : l'appli lit ET écrit cette même table.
                const isWb =
                    (isRead &&
                        lfModel().edges.some(x => x.source === app.id && x.target === tbl.id && lfEdgeRel(x) === 'writes')) ||
                    (!isRead &&
                        lfModel().edges.some(x => x.target === app.id && x.source === tbl.id && lfEdgeRel(x) === 'reads'));
                const wbBlock = isWb
                    ? `<div class="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">↺ <b>Écriture en retour (write-back).</b> <b>${escapeHTML(app.name)}</b> lit ET écrit <b>${escapeHTML(tbl.name)}</b> : ses modifications <b>resynchronisent</b> la table, et donc — en cascade — les copies aval qu'elle alimente et ses consommateurs. Contrôlez la cohérence sur les alimentations partant de <b>${escapeHTML(tbl.name)}</b>.</div>`
                    : '';
                const body = `<div class="mb-4"><div class="flex items-center gap-2 text-xs mb-1"><span class="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold">${escapeHTML(flowNode.name)}</span><span class="text-slate-400">─ ${lfEdgeTypeLabel(e)} →</span><span class="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold">${escapeHTML(t.name)}</span></div>
                    </div>
                    <div class="text-xs bg-violet-50 border border-violet-200 rounded-lg p-3 mb-4">${isRead ? `L'application <b>${escapeHTML(app.name)}</b> <b>lit</b> la table <b>${escapeHTML(tbl.name)}</b>. Aucune distorsion propre : la donnée consommée est exactement celle de la table. La fraîcheur de l'application est <b>héritée</b> de cette table.` : `L'application <b>${escapeHTML(app.name)}</b> <b>écrit</b> dans <b>${escapeHTML(tbl.name)}</b> (elle en est productrice / maître). À surveiller : les conflits de maîtrise si une autre application écrit le même attribut.`}</div>
                    ${wbBlock}${consumeBlock}
                    <div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Fraîcheur ${isRead ? 'de la table lue' : 'de la table écrite'}</h4>
                    <div class="lf-cell"><div class="lf-ck">${escapeHTML(tbl.name)}</div><div class="lf-cv" style="font-size:13px;color:${frT.status === 'bad' ? '#dc2626' : frT.status === 'warn' ? '#d97706' : frT.status === 'ok' ? '#16a34a' : '#94a3b8'}">${frT.status === 'none' ? 'non mesurée' : lfAge(frT.ageDays) + (frT.maxDays ? ' / ≤ ' + lfAge(frT.maxDays) : '')}</div>
                        </div>
                        </div>`;
                openUxDrawer({
                    sem: '',
                    title: flowNode.name + ' → ' + t.name,
                    sub: lfEdgeTypeLabel(e) + (isWb ? ' · ↺ retour' : ''),
                    body,
                    foot: '<button onclick="closeUxDrawer()" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm">Fermer</button>'
                });
                return;
            }
            const fr = lfEdgeFresh(e);
            const lr = e.lastRun;
            const flowModel = lfModel().threshold;
            const K = lfEdgeKeys(e);
            const slaBad = fr.status === 'bad';
            const slaWarn = fr.status === 'warn';
            const distBad = lfDistStatus(e) === 'bad';
            const sT = flowNode.tableName ? tableByName(flowNode.tableName) : null,
                tT = t.tableName ? tableByName(t.tableName) : null;
            const pairs = lfEdgePairs(e);
            const canRun = sT && tT && K.sK && K.tK && pairs.some(pp => pp.src && pp.tgt);
            const _slaBasis =
                fr.source === 'link'
                    ? `SLA du lien (≤ ${e.slaHours} h)`
                    : fr.freq
                      ? `fréquence « ${escapeHTML(fr.freq)} » (dictionnaire)`
                      : 'fréquence du dictionnaire';
            const slaBadge =
                fr.status === 'none'
                    ? `<span class="text-[11px] text-slate-400" title="Saisissez un SLA (h) sur ce lien ou une « Fréquence de mise à jour » au dictionnaire de l'aval">fraîcheur non mesurée</span>`
                    : slaBad
                      ? `<span class="lf-hchip lf-h-bad" style="font-size:11px;padding:4px 10px" title="Jugé sur ${_slaBasis}">✕ SLA dépassé — ${lfAge(fr.ageDays)} > ${lfAge(fr.maxDays)}</span>`
                      : slaWarn
                        ? `<span class="lf-hchip lf-h-warn" style="font-size:11px;padding:4px 10px" title="Jugé sur ${_slaBasis}">⚠ Proche du SLA — ${lfAge(fr.ageDays)} / ≤ ${lfAge(fr.maxDays)}</span>`
                        : `<span class="lf-hchip lf-h-ok" style="font-size:11px;padding:4px 10px" title="Jugé sur ${_slaBasis}">✓ SLA respecté</span>`;
            const distBadge = !lr
                ? '<span class="text-[11px] text-slate-400">non contrôlé</span>'
                : distBad
                  ? `<span class="lf-hchip lf-h-bad" style="font-size:11px;padding:4px 10px">⚠ Au-dessus du seuil (${flowModel} %)</span>`
                  : `<span class="lf-hchip lf-h-ok" style="font-size:11px;padding:4px 10px">✓ Sous le seuil (${flowModel} %)</span>`;
            // Statut d'un attribut d'après son taux vs seuil.
            const pst = rate => (rate > flowModel ? 'bad' : rate > 0.8 * flowModel ? 'warn' : 'ok');
            const lrPair = pp => lr && (lr.pairs || []).find(x => x.src === pp.src && x.tgt === pp.tgt);
            // Gestionnaire des attributs contrôlés.
            const scols = sT ? sT.headers : [],
                tcols = tT ? tT.headers : [];
            const managerRows = pairs.length
                ? pairs
                      .map(pp => {
                          const p2 = lrPair(pp);
                          const st = p2 ? pst(p2.rate) : 'none';
                          return `<div class="flex items-center gap-2 text-[11px] py-1 border-b border-slate-100">
                    <span class="mono font-semibold text-slate-700">${escapeHTML(pp.src)}${pp.src !== pp.tgt ? ' → ' + escapeHTML(pp.tgt) : ''}</span>
                    ${pp.xform && pp.xform.kind !== 'none' ? `<span class="text-slate-400">(${escapeHTML(lfXfLabel(pp.xform, pp.src))})</span>` : ''}
                    ${p2 ? `<span class="lf-hchip lf-h-${st}" style="margin-left:auto">${p2.rate.toFixed(2).replace('.', ',')} %</span>` : '<span class="text-slate-300" style="margin-left:auto">non contrôlé</span>'}
                    <button onclick="lfPairDel('${e.id}','${pp.id}')" class="text-red-400 hover:text-red-600" title="Retirer cet attribut">✕</button>
                </div>`;
                      })
                      .join('')
                : '<div class="text-[11px] text-slate-400 italic py-1">Aucun attribut contrôlé — ajoutez-en ci-dessous.</div>';
            const addRow =
                sT && tT
                    ? `<div class="flex items-end gap-1.5 flex-wrap mt-2">
                    <select id="lf-pair-src" class="border border-slate-300 rounded px-1 py-1 text-[11px] bg-white">${scols.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                    <span class="text-slate-400">→</span>
                    <select id="lf-pair-tgt" class="border border-slate-300 rounded px-1 py-1 text-[11px] bg-white">${tcols.map(h => `<option>${escapeHTML(h)}</option>`).join('')}</select>
                    <select id="lf-pair-xf" class="border border-slate-300 rounded px-1 py-1 text-[11px] bg-white" title="Transformation rejouée sur le maître avant comparaison">${LF_QUICK_XF.map(q => `<option value="${q[0]}">${q[1]}</option>`).join('')}</select>
                    <button onclick="lfPairAdd('${e.id}')" class="text-[11px] bg-indigo-600 text-white px-2 py-1 rounded font-bold">+ Attribut</button>
                    <button onclick="lfPairAddCommon('${e.id}')" class="text-[11px] bg-white border border-slate-300 px-2 py-1 rounded font-bold hover:bg-slate-50" title="Ajoute toutes les colonnes de même nom présentes des deux côtés">✚ Même nom</button>
                    ${lfBoPairsForEdge(e).length ? `<button onclick="lfApplyBoPairs('${e.id}')" class="text-[11px] bg-emerald-50 border border-emerald-300 text-emerald-700 px-2 py-1 rounded font-bold hover:bg-emerald-100" title="Reprend les attributs déjà mappés dans l'objet métier commun aux deux tables — évite de re-paramétrer">🏛️ Mapping objet métier (${lfBoPairsForEdge(e).length})</button>` : ''}
                </div>`
                    : '<div class="text-[11px] text-slate-500 mt-2 bg-blue-50 border border-blue-100 rounded p-2">Reliez la <b>source</b> et la <b>cible</b> à des sources chargées (dans « ⚙️ Construire le flux ») pour gérer et contrôler les attributs.</div>';
            // Résultats détaillés par attribut.
            const resultsHTML =
                lr && (lr.pairs || []).length
                    ? `<div class="mt-3"><div class="text-[10px] uppercase text-slate-400 font-bold mb-1">Résultat par attribut</div>
                ${lr.pairs
                    .map(pp => {
                        const st = pst(pp.rate);
                        return `<div class="mb-1.5">
                        <div class="flex items-center gap-2 text-[11px]"><span class="mono font-semibold text-slate-700">${escapeHTML(pp.src)}${pp.src !== pp.tgt ? ' → ' + escapeHTML(pp.tgt) : ''}</span><span class="lf-hchip lf-h-${st}" style="margin-left:auto">${pp.rate.toFixed(2).replace('.', ',')} % · ${pp.dist.toLocaleString('fr-FR')} écart(s)</span></div>
                        <div class="lf-bar"><i style="width:${Math.min(100, Math.max(2, pp.rate * 8))}%;background:${st === 'bad' ? '#dc2626' : st === 'warn' ? '#d97706' : '#16a34a'}"></i></div>
                        ${pp.samples && pp.samples.length ? `<details class="mt-1"><summary class="text-[10px] text-slate-400 cursor-pointer">${pp.samples.length} exemple(s) — clé / maître / aval</summary>${pp.samples.map(x => `<div class="lf-mism"><span class="lf-k mono">${escapeHTML(String(x[0]))}</span><span class="lf-mv">${escapeHTML(String(x[1]))}</span><span class="lf-dv">${escapeHTML(String(x[2]))}</span></div>`).join('')}</details>` : pp.dist === 0 ? '<div class="text-[10px] text-emerald-600">✔ aucun écart</div>' : ''}
                    </div>`;
                    })
                    .join('')}</div>`
                    : '';
            const _isConso = lfConsolidates(e.target);
            const _nat = lfEdgeNature(e);
            const _corrWarn =
                _nat === 'correction' &&
                lfProducerOf(e.target) &&
                lfProducerOf(e.target).id !== (lfProducerOf(e.source) || {}).id;
            const body = `<div class="mb-4"><div class="flex items-center gap-2 text-xs mb-1"><span class="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold">${escapeHTML(flowNode.name)}</span><span class="text-slate-400">─ ${lfEdgeTypeLabel(e)} →</span><span class="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold">${escapeHTML(t.name)}</span></div>
                <div class="text-[11px] text-slate-500 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Nature : <b>${_isConso ? 'Consolidation (déduite, ≥ 2 sources)' : LF_NATURE[_nat]}</b></span>
                    ${e.scope ? `<span>Périmètre : <b class="mono">${escapeHTML(e.scope)}</b></span>` : ''}
                    <span>Clé : <b class="mono">${escapeHTML(K.sK || '?')}</b>${K.sK !== K.tK ? ' → <b class="mono">' + escapeHTML(K.tK || '?') + '</b>' : ''}</span></div>
                ${_corrWarn ? `<div class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5">⚠ <b>Correction</b> : ce flux modifie des valeurs de <b>${escapeHTML(t.name)}</b> (produite par une autre application). Vérifiez la <b>maîtrise</b> — si le périmètre n'est pas disjoint d'un autre écrivain, c'est un <b>conflit</b>.</div>` : ''}</div>
                ${
                    e.transformation
                        ? `<div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Transformation déclarée</h4>
                    <div class="lf-transf"><span style="color:#7dd3fc">règle :</span> ${escapeHTML(e.transformation)}</div>
                    </div>`
                        : ''
                }
                <div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Fraîcheur</h4>
                <div class="lf-kv"><div class="lf-cell"><div class="lf-ck">Retard actuel (copie aval)</div>
                    <div class="lf-cv" style="color:${slaBad ? '#dc2626' : slaWarn ? '#d97706' : '#16a34a'}">${fr.status === 'none' ? '—' : lfAge(fr.ageDays)}</div>
                    </div>
                <div class="lf-cell"><div class="lf-ck">SLA de fraîcheur</div>
                        <div class="lf-cv" style="font-size:14px">≤ ${e.slaHours} h</div></div></div>
                <div class="text-[10.5px] text-slate-400 mt-1">Jugé sur ${fr.source === 'link' ? '<b>le SLA du lien</b>' : fr.freq ? 'la <b>fréquence du dictionnaire</b>' : 'le SLA du lien ou la fréquence du dictionnaire'} — l\'aval doit avoir un <b>chargement daté</b> pour être mesuré.</div>
                <div class="mt-2.5">${slaBadge}</div></div>
                <div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Attributs contrôlés (${pairs.length})</h4>
                <div class="bg-slate-50 border border-slate-100 rounded-lg p-2">${managerRows}${addRow}</div></div>
                <div class="mb-4"><h4 class="text-[10.5px] uppercase tracking-wide text-slate-400 font-bold mb-2">Réconciliation — santé globale</h4>
                <div class="lf-kv"><div class="lf-cell"><div class="lf-ck">Lignes avec ≥ 1 écart</div>
                    <div class="lf-cv" style="color:${distBad ? '#dc2626' : lr ? '#16a34a' : '#94a3b8'}">${lr ? lr.distAny.toLocaleString('fr-FR') + ' (' + lr.rate.toFixed(1).replace('.', ',') + ' %)' : '—'}</div>
                    </div>
                <div class="lf-cell"><div class="lf-ck">Lignes comparées</div>
                        <div class="lf-cv" style="font-size:14px">${lr ? lr.rows.toLocaleString('fr-FR') : '—'}</div>
                    </div>
                    </div>
                <div class="lf-bar"><i style="width:${lr && lr.rate != null ? Math.min(100, Math.max(3, lr.rate * 8)) : 0}%;background:${distBad ? '#dc2626' : '#16a34a'}"></i></div>
                <div class="mt-2.5">${distBadge}${lr && lr.missing ? ` <span class="text-[11px] text-slate-500">· ${lr.missing.toLocaleString('fr-FR')} clé(s) du maître absente(s) en aval</span>` : ''}</div>
                ${resultsHTML}
                ${!canRun ? `<div class="text-[11px] text-slate-500 mt-2 bg-blue-50 border border-blue-100 rounded p-2">Pour mesurer : sources reliées des deux côtés, une <b>clé</b> (source et cible) et au moins un <b>attribut contrôlé</b>.</div>` : ''}</div>`;
            const foot = `<button onclick="lfExportEcarts('${e.id}', this)" ${lr && lr.distAny ? '' : 'disabled'} class="flex-1 border border-slate-300 ${lr && lr.distAny ? 'hover:bg-slate-50' : 'opacity-40'} font-bold py-2 rounded-lg text-sm">⇩ Exporter les écarts</button>
                <button onclick="lfReconEdge('${e.id}', this)" ${canRun ? '' : 'disabled'} class="flex-1 ${canRun ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400'} font-bold py-2 rounded-lg text-sm">↻ Contrôler ${pairs.length || ''} attribut${pairs.length > 1 ? 's' : ''}</button>`;
            openUxDrawer({ sem: '', title: flowNode.name + ' → ' + t.name, sub: lfEdgeTypeLabel(e), body, foot });
        }

        // ---- Moteur de réconciliation DuckDB (distorsion + volumétrie + exemples) ----
        function lfKeyExpr(al, col) {
            return `NULLIF(UPPER(TRIM(CAST(${al}.${sqlIdent(col)} AS VARCHAR))), '')`;
        }
        // Liste normalisée des attributs contrôlés par un lien (compat : ancien srcAttr/tgtAttr unique).
        function lfEdgePairs(e) {
            if (Array.isArray(e.attrPairs) && e.attrPairs.length)
                return e.attrPairs.map(pp => ({
                    id: pp.id || 'ap_' + generateId(),
                    src: pp.src || '',
                    tgt: pp.tgt || '',
                    xform: pp.xform || { kind: 'none' }
                }));
            const K = lfEdgeKeys(e);
            if (K.sA || K.tA) return [{ id: 'ap_legacy', src: K.sA, tgt: K.tA, xform: e.xform || { kind: 'none' } }];
            return [];
        }
        function lfEnsurePairs(e) {
            e.attrPairs = lfEdgePairs(e).map(pp => ({
                id: String(pp.id).startsWith('ap_legacy') ? 'ap_' + generateId() : pp.id,
                src: pp.src,
                tgt: pp.tgt,
                xform: pp.xform
            }));
            delete e.srcAttr;
            delete e.tgtAttr;
            delete e.attr;
            delete e.xform;
            return e.attrPairs;
        }
        function lfXfLabel(x, attr) {
            if (!x || x.kind === 'none') return '';
            if (x.kind === 'agg') return (LF_XFORM_AGG[x.fn] || x.fn) + '(' + (attr || '') + ')';
            if (x.kind === 'scalar') return (LF_XFORM_SCALAR[x.op] || x.op) + (x.param ? ' ' + x.param : '');
            return '';
        }
        // Expressions de valeur (maître / aval) d'une paire, prêtes à être placées dans un GROUP BY par clé.
        function lfPairExprs(pair) {
            const aq = 'a.' + sqlIdent(pair.src),
                bq = 'b.' + sqlIdent(pair.tgt);
            const x = pair.xform || { kind: 'none' };
            if (x.kind === 'agg') {
                const fn = { sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX', count: 'COUNT' }[x.fn] || 'SUM';
                const mv = x.fn === 'count' ? 'ROUND(COUNT(*)::DOUBLE, 4)' : `ROUND(${fn}(TRY_CAST(${aq} AS DOUBLE)), 4)`;
                return { mv, dv: `ROUND(MIN(TRY_CAST(${bq} AS DOUBLE)), 4)` };
            }
            let numeric = false,
                digits = 4,
                mexpr;
            if (x.kind === 'scalar') {
                if (x.op === 'round') {
                    digits = parseInt(x.param) || 0;
                    numeric = true;
                    mexpr = `ROUND(TRY_CAST(${aq} AS DOUBLE), ${digits})`;
                } else if (x.op === 'factor') {
                    numeric = true;
                    mexpr = `ROUND(TRY_CAST(${aq} AS DOUBLE) * ${parseFloat(x.param) || 1}, 4)`;
                } else if (x.op === 'abs') {
                    numeric = true;
                    mexpr = `ROUND(ABS(TRY_CAST(${aq} AS DOUBLE)), 4)`;
                } else if (x.op === 'upper') {
                    mexpr = `UPPER(TRIM(CAST(${aq} AS VARCHAR)))`;
                } else if (x.op === 'lower') {
                    mexpr = `LOWER(TRIM(CAST(${aq} AS VARCHAR)))`;
                } else {
                    mexpr = `NULLIF(TRIM(CAST(${aq} AS VARCHAR)), '')`;
                }
            } else {
                mexpr = `NULLIF(TRIM(CAST(${aq} AS VARCHAR)), '')`;
            }
            const dexpr = numeric ? `ROUND(TRY_CAST(${bq} AS DOUBLE), ${digits})` : `NULLIF(TRIM(CAST(${bq} AS VARCHAR)), '')`;
            return { mv: `MIN(${mexpr})`, dv: `MIN(${dexpr})` };
        }
        // Gestion des attributs contrôlés (fiche du lien).
        function lfPairAdd(id) {
            const e = lfEdge(id);
            if (!e) return;
            const src = el('lf-pair-src') ? el('lf-pair-src').value : '',
                tgt = el('lf-pair-tgt') ? el('lf-pair-tgt').value : '';
            if (!src || !tgt) return showError('Choisissez une colonne source et une colonne cible.');
            const element = el('lf-pair-xf') ? el('lf-pair-xf').value : 'none';
            const xform = JSON.parse(JSON.stringify((LF_QUICK_XF.find(q => q[0] === element) || [0, 0, { kind: 'none' }])[2]));
            lfEnsurePairs(e);
            if (e.attrPairs.some(pp => pp.src === src && pp.tgt === tgt)) return showError('Cet attribut est déjà contrôlé.');
            e.attrPairs.push({ id: 'ap_' + generateId(), src, tgt, xform });
            e.lastRun = null;
            persistAppState();
            renderGovernance();
            setTimeout(() => lfOpenEdge(id), 20);
        }
        function lfPairDel(id, pid) {
            const e = lfEdge(id);
            if (!e) return;
            lfEnsurePairs(e);
            e.attrPairs = e.attrPairs.filter(pp => pp.id !== pid);
            e.lastRun = null;
            persistAppState();
            renderGovernance();
            setTimeout(() => lfOpenEdge(id), 20);
        }
        function lfPairAddCommon(id) {
            const e = lfEdge(id);
            if (!e) return;
            const flowNode = lfNode(e.source),
                t = lfNode(e.target);
            const K = lfEdgeKeys(e);
            const sT = flowNode && tableByName(flowNode.tableName),
                tT = t && tableByName(t.tableName);
            if (!sT || !tT) return showError('Reliez la source et la cible à des sources chargées.');
            lfEnsurePairs(e);
            const common = (sT.headers || []).filter(h => (tT.headers || []).includes(h) && h !== K.sK && h !== K.tK);
            let added = 0;
            common.forEach(h => {
                if (!e.attrPairs.some(pp => pp.src === h && pp.tgt === h)) {
                    e.attrPairs.push({ id: 'ap_' + generateId(), src: h, tgt: h, xform: { kind: 'none' } });
                    added++;
                }
            });
            e.lastRun = null;
            persistAppState();
            renderGovernance();
            setTimeout(() => lfOpenEdge(id), 20);
            if (!added) showError('Aucun nouvel attribut de même nom à ajouter.');
        }
        // V6 Lot 3 : réutilise le MAPPING de l'objet métier pour la réconciliation (image par valeur),
        // au lieu de re-paramétrer les mêmes attributs. Pour chaque attribut d'un objet métier mappé
        // À LA FOIS sur la table source et sur la table cible du lien, on déduit la paire (col src → col cible).
        function lfBoPairsForEdge(e) {
            const s = e && lfNode(e.source),
                t = e && lfNode(e.target);
            if (!s || !t || !s.tableName || !t.tableName) return [];
            const seen = new Set();
            const out = [];
            (state.governance.businessObjects || []).forEach(bo => {
                (boAllAttrRows(bo) || []).forEach(r => {
                    const maps = (r.el && r.el.mappings) || [];
                    const ms = maps.find(m => m.table === s.tableName && m.col),
                        mt = maps.find(m => m.table === t.tableName && m.col);
                    if (!ms || !mt) return;
                    const k = ms.col + '¦' + mt.col;
                    if (seen.has(k)) return;
                    seen.add(k);
                    out.push({ attr: r.el.name, src: ms.col, tgt: mt.col, bo: bo.name });
                });
            });
            return out;
        }
        function lfApplyBoPairs(id) {
            const e = lfEdge(id);
            if (!e) return;
            const pairs = lfBoPairsForEdge(e);
            if (!pairs.length) return showError("Aucun attribut d'objet métier n'est mappé des deux côtés de ce lien.");
            lfEnsurePairs(e);
            const K = lfEdgeKeys(e);
            let added = 0;
            pairs.forEach(pp => {
                if (pp.src === K.sK && pp.tgt === K.tK) return;
                if (e.attrPairs.some(x => x.src === pp.src && x.tgt === pp.tgt)) return;
                e.attrPairs.push({ id: 'ap_' + generateId(), src: pp.src, tgt: pp.tgt, xform: { kind: 'none' } });
                added++;
            });
            e.lastRun = null;
            persistAppState();
            renderGovernance();
            setTimeout(() => lfOpenEdge(id), 20);
            if (!added) showError("Le mapping de l'objet métier est déjà repris sur ce lien.");
            else showSuccess(`🏛️ ${added} attribut(s) repris du mapping de l'objet métier.`);
        }
        async function lfReconEdge(id, btn, opts) {
            opts = opts || {};
            const _f = msg => (opts.silent ? { ok: false, reason: msg } : showError(msg));
            const e = lfEdge(id);
            if (!e) return _f('Lien introuvable.');
            const flowNode = lfNode(e.source),
                t = lfNode(e.target);
            const sT = flowNode && flowNode.tableName ? tableByName(flowNode.tableName) : null,
                tT = t && t.tableName ? tableByName(t.tableName) : null;
            if (!sT || !tT) return _f('Reliez la source et la cible à des sources chargées.');
            const K = lfEdgeKeys(e);
            if (!K.sK || !K.tK) return _f('Renseignez la clé (source et cible).');
            if (!(sT.headers || []).includes(K.sK))
                return _f(`La colonne clé source « ${K.sK} » est absente de « ${flowNode.name} ».`);
            if (!(tT.headers || []).includes(K.tK)) return _f(`La colonne clé cible « ${K.tK} » est absente de « ${t.name} ».`);
            let pairs = lfEdgePairs(e).filter(pp => pp.src && pp.tgt);
            const skipped = pairs.filter(pp => !(sT.headers || []).includes(pp.src) || !(tT.headers || []).includes(pp.tgt));
            pairs = pairs.filter(pp => (sT.headers || []).includes(pp.src) && (tT.headers || []).includes(pp.tgt));
            if (!pairs.length)
                return _f('Ajoutez au moins un attribut contrôlé (colonnes présentes des deux côtés) dans la fiche du lien.');
            const old = btn ? btn.textContent : '';
            if (btn) {
                btn.disabled = true;
                btn.textContent = '…';
            }
            try {
                const { conn } = await getDB();
                const A = sqlIdent(duckTableName(sT.id)),
                    B = sqlIdent(duckTableName(tT.id));
                const kA = lfKeyExpr('a', K.sK),
                    kB = lfKeyExpr('b', K.tK);
                const mCols = pairs.map((pp, i) => `${lfPairExprs(pp).mv} AS mv${i}`).join(', ');
                const dCols = pairs.map((pp, i) => `${lfPairExprs(pp).dv} AS dv${i}`).join(', ');
                const base = `WITH m AS (SELECT ${kA} AS k, ${mCols} FROM ${A} a WHERE ${kA} IS NOT NULL GROUP BY 1), d AS (SELECT ${kB} AS k, ${dCols} FROM ${B} b WHERE ${kB} IS NOT NULL GROUP BY 1)`;
                const filters = pairs
                    .map((_, i) => `COUNT(*) FILTER (WHERE m.mv${i} IS DISTINCT FROM d.dv${i})::BIGINT AS d${i}`)
                    .join(', ');
                const anyE = pairs.map((_, i) => `m.mv${i} IS DISTINCT FROM d.dv${i}`).join(' OR ');
                const out = await runNoSpill(conn, async () => {
                    const agg = arrowResultToObjects(
                        await queryResilient(
                            conn,
                            `${base} SELECT COUNT(*)::BIGINT AS rows, ${filters}, COUNT(*) FILTER (WHERE ${anyE})::BIGINT AS dany FROM m JOIN d USING (k)`
                        )
                    )[0];
                    const miss = arrowResultToObjects(
                        await queryResilient(
                            conn,
                            `SELECT COUNT(*)::BIGINT AS n FROM (SELECT DISTINCT ${kA} AS k FROM ${A} a WHERE ${kA} IS NOT NULL) s WHERE k NOT IN (SELECT ${kB} FROM ${B} b WHERE ${kB} IS NOT NULL)`
                        )
                    )[0];
                    const samples = {};
                    for (let i = 0; i < pairs.length; i++) {
                        if (Number(agg['d' + i] || 0) > 0) {
                            const rows = arrowResultToObjects(
                                await queryResilient(
                                    conn,
                                    `${base} SELECT k, m.mv${i} AS av, d.dv${i} AS bv FROM m JOIN d USING (k) WHERE m.mv${i} IS DISTINCT FROM d.dv${i} ORDER BY k LIMIT 8`
                                )
                            );
                            samples[i] = rows.map(r => [
                                r.k == null ? '' : r.k,
                                r.av == null ? '(vide)' : r.av,
                                r.bv == null ? '(vide)' : r.bv
                            ]);
                        }
                    }
                    return { agg, miss, samples };
                });
                const rows = Number(out.agg.rows || 0),
                    dany = Number(out.agg.dany || 0);
                const pr = pairs.map((pp, i) => {
                    const number = Number(out.agg['d' + i] || 0);
                    return {
                        src: pp.src,
                        tgt: pp.tgt,
                        xform: pp.xform,
                        dist: number,
                        rate: rows ? (100 * number) / rows : 0,
                        samples: out.samples[i] || []
                    };
                });
                e.lastRun = {
                    at: Date.now(),
                    rows,
                    missing: Number(out.miss.n || 0),
                    distAny: dany,
                    rate: rows ? (100 * dany) / rows : 0,
                    worstRate: pr.reduce((mx, x) => Math.max(mx, x.rate), 0),
                    pairs: pr
                };
                lfLogPush(e, flowNode, t);
                persistAppState();
                if (opts.silent) return { ok: true, name: flowNode.name + ' → ' + t.name, rows, dany };
                renderGovernance();
                setTimeout(() => lfOpenEdge(id), 30);
                showSuccess(
                    `↻ Contrôle « ${flowNode.name} → ${t.name} » : ${dany.toLocaleString('fr-FR')} ligne(s) avec écart sur ${rows.toLocaleString('fr-FR')} (${pairs.length} attribut(s)).` +
                        (skipped.length ? ` ${skipped.length} attribut(s) ignoré(s) (colonne absente).` : '')
                );
            } catch (err) {
                if (opts.silent) return { ok: false, reason: err.message, name: flowNode.name + ' → ' + t.name };
                showError('Contrôle impossible : ' + err.message);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = old;
                }
            }
        }
        // Contrôle de TOUTE la chaîne aval d'un nœud : parcourt les alimentations (feeds) en aval et
        // relance leur réconciliation. Utile après une réécriture (write-back) qui resynchronise l'amont.
        function lfRunnableEdge(e) {
            if (lfEdgeRel(e) !== 'feeds') return false;
            const flowNode = lfNode(e.source),
                t = lfNode(e.target);
            const sT = flowNode && flowNode.tableName ? tableByName(flowNode.tableName) : null,
                tT = t && t.tableName ? tableByName(t.tableName) : null;
            if (!sT || !tT) return false;
            const K = lfEdgeKeys(e);
            if (!K.sK || !K.tK || !(sT.headers || []).includes(K.sK) || !(tT.headers || []).includes(K.tK)) return false;
            return lfEdgePairs(e).some(
                pp => pp.src && pp.tgt && (sT.headers || []).includes(pp.src) && (tT.headers || []).includes(pp.tgt)
            );
        }
        function lfDownstreamFeeds(nodeId) {
            const flowModel = lfModel();
            const seenNodes = new Set(),
                seenEdges = new Set(),
                queue = [nodeId],
                out = [];
            while (queue.length) {
                const current = queue.shift();
                if (seenNodes.has(current)) continue;
                seenNodes.add(current);
                flowModel.edges
                    .filter(e => e.source === current && lfEdgeRel(e) === 'feeds')
                    .forEach(e => {
                        if (!seenEdges.has(e.id)) {
                            seenEdges.add(e.id);
                            out.push(e);
                        }
                        if (!seenNodes.has(e.target)) queue.push(e.target);
                    });
            }
            return out;
        }
        async function lfReconDownstream(nodeId, btn) {
            const runnable = lfDownstreamFeeds(nodeId).filter(lfRunnableEdge);
            if (!runnable.length)
                return showError(
                    'Aucune alimentation contrôlable en aval de ce nœud (chaque lien doit avoir source + cible chargées, une clé et au moins un attribut).'
                );
            if (btn) {
                btn.disabled = true;
                btn.textContent = '… contrôle en cours';
            }
            let okN = 0,
                koN = 0,
                totalDany = 0;
            const fails = [];
            for (const e of runnable) {
                const r = await lfReconEdge(e.id, null, { silent: true });
                if (r && r.ok) {
                    okN++;
                    totalDany += r.dany;
                } else {
                    koN++;
                    fails.push((r && r.name) || e.id);
                }
            }
            renderGovernance();
            showSuccess(
                `↻ Chaîne aval contrôlée : ${okN} alimentation(s) vérifiée(s)${totalDany ? `, ${totalDany.toLocaleString('fr-FR')} ligne(s) en écart au total` : ''}.${koN ? ` ${koN} non contrôlée(s).` : ''}`
            );
        }
        async function lfExportEcarts(id, btn) {
            const e = lfEdge(id);
            if (!e) return;
            const flowNode = lfNode(e.source),
                t = lfNode(e.target);
            const sT = tableByName(flowNode.tableName),
                tT = tableByName(t.tableName);
            if (!sT || !tT) return;
            const K = lfEdgeKeys(e);
            const pairs = lfEdgePairs(e).filter(
                pp => pp.src && pp.tgt && (sT.headers || []).includes(pp.src) && (tT.headers || []).includes(pp.tgt)
            );
            if (!pairs.length) return;
            const old = btn ? btn.textContent : '';
            if (btn) {
                btn.disabled = true;
                btn.textContent = '…';
            }
            try {
                const { conn } = await getDB();
                const A = sqlIdent(duckTableName(sT.id)),
                    B = sqlIdent(duckTableName(tT.id));
                const kA = lfKeyExpr('a', K.sK),
                    kB = lfKeyExpr('b', K.tK);
                const cell = v => {
                    if (v == null) return '';
                    const x = String(v);
                    return /[",\n\r;]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
                };
                const parts = [`cle,attribut,maitre,aval\n`];
                await runNoSpill(conn, async () => {
                    for (const pair of pairs) {
                        const PE = lfPairExprs(pair);
                        const base = `WITH m AS (SELECT ${kA} AS k, ${PE.mv} AS mv FROM ${A} a WHERE ${kA} IS NOT NULL GROUP BY 1), d AS (SELECT ${kB} AS k, ${PE.dv} AS mv FROM ${B} b WHERE ${kB} IS NOT NULL GROUP BY 1)`;
                        const lbl = pair.src + (pair.src !== pair.tgt ? ' → ' + pair.tgt : '');
                        const res = await queryResilient(
                            conn,
                            `${base} SELECT k, m.mv AS av, d.mv AS bv FROM m JOIN d USING (k) WHERE m.mv IS DISTINCT FROM d.mv ORDER BY k`
                        );
                        arrowResultToObjects(res).forEach(r => parts.push([r.k, lbl, r.av, r.bv].map(cell).join(',') + '\n'));
                    }
                });
                const blob = new Blob(['﻿', ...parts], { type: 'text/csv;charset=utf-8;' });
                const anchorElement = document.createElement('a');
                anchorElement.href = URL.createObjectURL(blob);
                anchorElement.download = `Ecarts_${flowNode.name}_${t.name}_${Date.now()}.csv`.replace(
                    /[^a-zA-Z0-9_.-]+/g,
                    '_'
                );
                document.body.appendChild(anchorElement);
                anchorElement.click();
                anchorElement.remove();
                showSuccess(`Écarts exportés (${(parts.length - 1).toLocaleString('fr-FR')} ligne(s)).`);
            } catch (err) {
                showError('Export impossible : ' + err.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = old;
                }
            }
        }

        // ---- Finitions V5.1 : vue attributs, transformation rejouable, journal ----
        function lfSetView(v) {
            lfView = v === 'attrs' ? 'attrs' : 'systems';
            renderGovernance();
        }
        function lfNodeAttrs(n) {
            const set = new Set();
            lfModel().edges.forEach(e => {
                const K = lfEdgeKeys(e);
                const pairs = lfEdgePairs(e);
                if (e.source === n.id) {
                    if (K.sK) set.add('\U0001F511 ' + K.sK);
                    pairs.forEach(pp => {
                        if (pp.src) set.add(pp.src);
                    });
                }
                if (e.target === n.id) {
                    if (K.tK) set.add('\U0001F511 ' + K.tK);
                    pairs.forEach(pp => {
                        if (pp.tgt) set.add(pp.tgt);
                    });
                }
            });
            return Array.from(set);
        }
        function lfXkChanged() {
            const k = el('lf-e-xk') ? el('lf-e-xk').value : 'none';
            const lfEXaggWElement = el('lf-e-xagg-w'),
                lfEXscWElement = el('lf-e-xsc-w');
            if (lfEXaggWElement) lfEXaggWElement.classList.toggle('hidden', k !== 'agg');
            if (lfEXscWElement) lfEXscWElement.classList.toggle('hidden', k !== 'scalar');
        }
        // Journal des contrôles / alertes.
        function lfLog() {
            const governance = state.governance;
            if (!Array.isArray(governance.flowLog)) governance.flowLog = [];
            return governance.flowLog;
        }
        function lfLogPush(e, s, t) {
            const flowModel = lfModel().threshold,
                rate = e.lastRun.rate;
            const status = rate > flowModel ? 'bad' : rate > 0.8 * flowModel ? 'warn' : 'ok';
            lfLog().unshift({
                at: Date.now(),
                label: ((s || {}).name || '?') + ' → ' + ((t || {}).name || '?'),
                rows: e.lastRun.rows,
                dist: e.lastRun.dist,
                rate,
                missing: e.lastRun.missing || 0,
                status,
                transf: e.lastRun && e.lastRun.pairs ? e.lastRun.pairs.length + ' attribut(s)' : ''
            });
            if (lfLog().length > 200) state.governance.flowLog = lfLog().slice(0, 200);
        }
        function lfClearLog() {
            if (!confirm('Vider le journal des contrôles ?')) return;
            state.governance.flowLog = [];
            persistAppState();
            renderGovernance();
        }
        function lfJournalHtml() {
            const log = lfLog();
            const alerts = log.filter(l => l.status === 'bad').length;
            let body;
            if (!log.length)
                body =
                    '<p class="text-xs text-slate-400 italic">Aucun contrôle lancé pour l\'instant — lancez-en un depuis une étiquette de lien.</p>';
            else
                body =
                    `<div class="flex justify-end mb-2"><button onclick="lfClearLog()" class="text-[11px] text-slate-500 hover:text-red-600 font-bold">Vider le journal</button></div>
                <div class="border border-slate-200 rounded-lg overflow-x-auto bg-white"><table class="w-full text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2">Date</th>
                        <th class="p-2">Flux</th>
                        <th class="p-2">Résultat</th>
                        <th class="p-2">Transformation rejouée</th>
                        </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">` +
                    log
                        .slice(0, 80)
                        .map(
                            l => `<tr><td class="p-2 text-slate-500 whitespace-nowrap">${new Date(l.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td class="p-2 font-semibold text-slate-700">${escapeHTML(l.label)}</td>
                    <td class="p-2"><span class="lf-hchip lf-h-${l.status}">${l.status === 'bad' ? '⚠ ' : l.status === 'warn' ? '▲ ' : '✓ '}${l.rate != null ? l.rate.toFixed(2).replace('.', ',') : '—'} %</span> <span class="text-slate-400">${(l.dist || 0).toLocaleString('fr-FR')}/${(l.rows || 0).toLocaleString('fr-FR')}${l.missing ? ` · ${l.missing} manquant(s)` : ''}</span></td>
                    <td class="p-2 text-slate-500">${escapeHTML(l.transf || '—')}</td></tr>`
                        )
                        .join('') +
                    `</tbody></table></div>`;
            return `<details class="mt-4 bg-slate-50 border border-slate-200 rounded-xl"><summary class="cursor-pointer px-3 py-2 text-xs font-bold text-slate-600">🗒️ Journal des contrôles${log.length ? ` (${log.length}${alerts ? ` · ${alerts} alerte(s)` : ''})` : ''}</summary>
                <div class="p-3">${body}</div>
                </details>`;
        }

        // Propose, pour CHAQUE côté, les colonnes de sa propre source reliée (les noms peuvent différer).
        function lfEdgeColsChanged() {
            const flowNode = lfNode(el('lf-e-src') ? el('lf-e-src').value : ''),
                tn = lfNode(el('lf-e-tgt') ? el('lf-e-tgt').value : '');
            const sh =
                flowNode && flowNode.tableName && tableByName(flowNode.tableName)
                    ? tableByName(flowNode.tableName).headers
                    : [];
            const th = tn && tn.tableName && tableByName(tn.tableName) ? tableByName(tn.tableName).headers : [];
            const opt = arr => arr.map(x => `<option value="${escapeHTML(x)}">`).join('');
            const sOpts = opt(sh),
                tOpts = opt(th);
            [
                ['lf-e-sk-dl', sOpts],
                ['lf-e-sa-dl', sOpts],
                ['lf-e-tk-dl', tOpts],
                ['lf-e-ta-dl', tOpts]
            ].forEach(([id, o]) => {
                const element = el(id);
                if (element) element.innerHTML = o;
            });
        }
        function renderSrcWatch() {
            const tables = swReadyTables();
            if (!tables.length)
                return emptyStateHtml(
                    '🛰️',
                    'Aucune source à surveiller',
                    'Chargez au moins une source (onglet Sources) pour suivre sa fraîcheur, sa dérive, son contrat et ses changements.',
                    '',
                    ''
                );
            const tabBtn = (k, lbl) =>
                `<button data-ro="keep" onclick="swSet('tool','${k}')" class="px-3 py-1.5 text-xs font-bold rounded-lg border ${swState.tool === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}">${lbl}</button>`;
            let html = `<p class="text-sm text-slate-500 mb-3">Surveillez les sources reçues d'applications amont : fraîcheur, dérive, conformité au schéma attendu, changements entre chargements, cohérence entre sources.</p>
                <div class="flex gap-2 mb-4 flex-wrap">${tabBtn('monitor', '📡 Moniteur & fraîcheur')}${tabBtn('contract', '📜 Contrat de données')}${tabBtn('delta', '🔁 Changements (delta)')}${tabBtn('recon', '🔗 Réconciliation')}</div>`;

            if (swState.tool === 'monitor') {
                html += `<div class="space-y-2">${tables
                    .map(t => {
                        const e = swGet(t.name);
                        const drift = swDrift(e.snaps);
                        const nSnap = (e.snaps || []).length;
                        return `<div class="border border-slate-200 rounded-xl p-3 bg-white">
                        <div class="flex items-center gap-2 flex-wrap mb-1.5">
                            <span class="font-bold text-sm text-slate-800">${escapeHTML(t.name)}</span>
                            ${swFreshBadge(t)}
                            <span class="text-[11px] text-slate-400">${t.lastRows != null ? Number(t.lastRows).toLocaleString('fr-FR') + ' lignes' : ''} · ${(t.headers || []).length} colonnes</span>
                            <span class="ml-auto"></span>
                            <span class="text-[11px] text-slate-400">${nSnap} instantané(s)</span>
                            <button onclick="swSnapshot('${escapeHTML(t.name.replace(/'/g, "\\\\'"))}')" class="text-[11px] bg-white border border-indigo-300 text-indigo-700 font-bold px-2.5 py-1 rounded hover:bg-indigo-50">🛰️ Prendre un instantané</button>
                        </div>
                        ${
                            drift
                                ? `<div class="text-[11px] flex flex-wrap gap-2 items-center">
                            <span class="text-slate-500">Depuis le dernier instantané :</span>
                            <span class="${drift.rowsDelta === 0 ? 'text-slate-500' : drift.rowsDelta > 0 ? 'text-emerald-700' : 'text-red-700'} font-bold">${drift.rowsDelta >= 0 ? '+' : ''}${drift.rowsDelta.toLocaleString('fr-FR')} ligne(s)${drift.rowsPct != null ? ` (${drift.rowsPct >= 0 ? '+' : ''}${drift.rowsPct.toFixed(1)} %)` : ''}</span>
                            ${drift.schemaChanged ? `<span class="text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-bold">⚠ dérive de schéma</span>${drift.added.length ? `<span class="text-emerald-700">+ ${drift.added.map(escapeHTML).join(', ')}</span>` : ''}${drift.removed.length ? `<span class="text-red-700">− ${drift.removed.map(escapeHTML).join(', ')}</span>` : ''}${drift.retyped.length ? `<span class="text-purple-700">⟳ ${drift.retyped.map(escapeHTML).join(', ')}</span>` : ''}` : '<span class="text-emerald-600">schéma stable</span>'}
                        </div>`
                                : `<div class="text-[11px] text-slate-400 italic">Prenez deux instantanés (à deux chargements) pour mesurer la dérive.</div>`
                        }
                    </div>`;
                    })
                    .join('')}</div>`;
            } else if (swState.tool === 'contract') {
                html += `<div class="space-y-3">${tables
                    .map(t => {
                        const c = swGet(t.name).contract;
                        const res = swState.contractRes[t.name];
                        return `<div class="border border-slate-200 rounded-xl p-3 bg-white">
                        <div class="flex items-center gap-2 flex-wrap mb-1.5"><span class="font-bold text-sm text-slate-800">${escapeHTML(t.name)}</span>
                            ${c ? `<span class="text-[11px] text-slate-400">${c.cols.length} colonne(s) attendue(s) · ${c.cols.filter(x => x.required).length} obligatoire(s)</span>` : '<span class="text-[11px] text-slate-400 italic">aucun contrat défini</span>'}
                            <span class="ml-auto"></span>
                            <button onclick="swGenContract('${escapeHTML(t.name.replace(/'/g, "\\\\'"))}')" class="text-[11px] bg-white border border-slate-300 font-bold px-2.5 py-1 rounded hover:bg-slate-50">${c ? '↻ Régénérer' : '📜 Générer depuis la structure'}</button>
                            ${c ? `<button onclick="swCheckContract('${escapeHTML(t.name.replace(/'/g, "\\\\'"))}')" class="text-[11px] bg-indigo-600 text-white font-bold px-2.5 py-1 rounded hover:bg-indigo-700">✔ Vérifier la conformité</button>` : ''}
                        </div>
                        ${
                            c
                                ? `<details class="mb-1.5"><summary class="text-[11px] font-bold text-slate-500 cursor-pointer">Colonnes attendues (cocher « obligatoire »)</summary>
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-1 mt-1.5">${c.cols.map(col => `<label class="flex items-center gap-1.5 text-[11px] border border-slate-100 rounded px-1.5 py-1"><input type="checkbox" ${col.required ? 'checked' : ''} onchange="swToggleRequired('${escapeHTML(t.name.replace(/'/g, "\\\\'"))}','${escapeHTML(col.name.replace(/'/g, "\\\\'"))}',this.checked)"><span class="truncate" title="${escapeHTML(col.name)}">${escapeHTML(col.name)}</span><span class="text-slate-300 ml-auto">${col.type}</span></label>`).join('')}</div>
                                </details>`
                                : ''
                        }
                        ${
                            res
                                ? `<div class="text-[11px] rounded-lg border px-2.5 py-2 ${res.conform ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}">
                            <div class="font-bold">${res.conform ? '✔ Conforme au contrat' : '✗ Non conforme'}</div>
                            ${res.missing.length ? `<div>Colonnes manquantes : <strong>${res.missing.map(escapeHTML).join(', ')}</strong></div>` : ''}
                            ${res.retyped.length ? `<div>Types différents : ${res.retyped.map(escapeHTML).join(', ')}</div>` : ''}
                            ${res.emptyReq.length ? `<div>Obligatoires avec des vides : ${res.emptyReq.map(escapeHTML).join(', ')}</div>` : ''}
                            ${res.extra.length ? `<div class="text-slate-500">Colonnes en plus (non bloquant) : ${res.extra.map(escapeHTML).join(', ')}</div>` : ''}
                        </div>`
                                : ''
                        }
                    </div>`;
                    })
                    .join('')}</div>`;
            } else if (swState.tool === 'delta') {
                const src = swState.deltaSrc && tableByName(swState.deltaSrc) ? swState.deltaSrc : (tables[0] || {}).name;
                const table = tableByName(src);
                const snap = swDataSnaps[src];
                const res = swState.deltaRes;
                html += `<div class="border border-slate-200 rounded-xl p-4 bg-white">
                    <p class="text-[12px] text-slate-500 mb-3">Comparez l'état <strong>actuel</strong> d'une source à un <strong>instantané figé</strong> précédemment : lignes ajoutées, supprimées, modifiées (par clé). Figez avant le rechargement, comparez après.</p>
                    <div class="flex items-end gap-2 flex-wrap mb-3">
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 block">Source</label>
                        <select onchange="swSet('deltaSrc', this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white">${tables.map(x => `<option value="${escapeHTML(x.name)}" ${x.name === src ? 'selected' : ''}>${escapeHTML(x.name)}</option>`).join('')}</select></div>
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 block">Clé (identifiant de ligne)</label>
                        <select onchange="swSet('deltaKey', this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="">— colonne clé —</option>${(table ? table.headers : []).map(h => `<option value="${escapeHTML(h)}" ${swState.deltaKey === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select></div>
                        <button onclick="swFreezeData('${escapeHTML(src.replace(/'/g, "\\\\'"))}')" class="text-xs bg-white border border-slate-300 font-bold px-3 py-1.5 rounded hover:bg-slate-50">📸 Figer l'instantané${snap ? ' (remplacer)' : ''}</button>
                        <button onclick="swComputeDelta('${escapeHTML(src.replace(/'/g, "\\\\'"))}', swState.deltaKey || el('__none').value)" ${snap ? '' : 'disabled'} class="text-xs ${snap ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 text-slate-400'} font-bold px-3 py-1.5 rounded">🔁 Comparer à l'instantané</button>
                        <input type="hidden" id="__none" value="">
                    </div>
                    ${snap ? `<div class="text-[11px] text-slate-500 mb-2">📸 Instantané figé : ${snap.rows.toLocaleString('fr-FR')} lignes le ${new Date(snap.ts).toLocaleString('fr-FR')}.</div>` : `<div class="text-[11px] text-amber-600 mb-2">Aucun instantané figé pour cette source dans cette session.</div>`}
                    ${
                        res && res.tn === src
                            ? `<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div class="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center"><div class="text-xl font-black text-emerald-700">${res.added.toLocaleString('fr-FR')}</div>
                            <div class="text-[10px] text-slate-500">ligne(s) ajoutée(s)</div>
                            </div>
                        <div class="p-3 rounded-lg bg-red-50 border border-red-200 text-center"><div class="text-xl font-black text-red-700">${res.removed.toLocaleString('fr-FR')}</div>
                            <div class="text-[10px] text-slate-500">supprimée(s)</div>
                            </div>
                        <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center"><div class="text-xl font-black text-amber-700">${res.changed.toLocaleString('fr-FR')}</div>
                            <div class="text-[10px] text-slate-500">modifiée(s)</div>
                            </div>
                        <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 text-center"><div class="text-xl font-black text-slate-600">${res.same.toLocaleString('fr-FR')}</div>
                            <div class="text-[10px] text-slate-500">inchangée(s)</div>
                            </div>
                    </div>
                            <p class="text-[10px] text-slate-400 mt-1.5">Comparaison par clé « ${escapeHTML(res.key)} » sur ${res.commonCols} colonne(s) commune(s).</p>`
                            : ''
                    }
                </div>`;
            } else if (swState.tool === 'recon') {
                const opt = sel =>
                    tables
                        .map(
                            x =>
                                `<option value="${escapeHTML(x.name)}" ${x.name === sel ? 'selected' : ''}>${escapeHTML(x.name)}</option>`
                        )
                        .join('');
                const tA = tableByName(swState.recA),
                    tB = tableByName(swState.recB);
                const r = swState.recRes;
                html += `<div class="border border-slate-200 rounded-xl p-4 bg-white">
                    <p class="text-[12px] text-slate-500 mb-3">Vérifiez la cohérence entre deux sources par une clé commune : volumétrie et <strong>orphelins</strong> (clés présentes d'un côté et absentes de l'autre). Idéal pour un contrôle de chargement amont/aval.</p>
                    <div class="flex items-end gap-2 flex-wrap mb-3">
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 block">Source A</label><select onchange="swSet('recA', this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="">—</option>${opt(swState.recA)}</select></div>
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 block">Clé A</label><select onchange="swSet('recKeyA', this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="">—</option>${(tA ? tA.headers : []).map(h => `<option value="${escapeHTML(h)}" ${swState.recKeyA === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select></div>
                        <span class="text-slate-300 self-center pb-1">↔</span>
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 block">Source B</label><select onchange="swSet('recB', this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="">—</option>${opt(swState.recB)}</select></div>
                        <div><label class="text-[10px] uppercase font-bold text-slate-400 block">Clé B</label><select onchange="swSet('recKeyB', this.value)" class="border border-slate-300 p-1.5 rounded text-xs bg-white"><option value="">—</option>${(tB ? tB.headers : []).map(h => `<option value="${escapeHTML(h)}" ${swState.recKeyB === h ? 'selected' : ''}>${escapeHTML(h)}</option>`).join('')}</select></div>
                        <button onclick="swReconcile()" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded">🔗 Réconcilier</button>
                    </div>
                    ${
                        r
                            ? `<div class="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 text-center"><div class="text-lg font-black text-slate-700">${r.ta.toLocaleString('fr-FR')}</div>
                            <div class="text-[10px] text-slate-500 truncate" title="${escapeHTML(r.a)}">lignes ${escapeHTML(r.a)}</div>
                            </div>
                        <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 text-center"><div class="text-lg font-black text-slate-700">${r.tb.toLocaleString('fr-FR')}</div>
                            <div class="text-[10px] text-slate-500 truncate" title="${escapeHTML(r.b)}">lignes ${escapeHTML(r.b)}</div>
                            </div>
                        <div class="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center"><div class="text-lg font-black text-emerald-700">${r.common.toLocaleString('fr-FR')}</div>
                            <div class="text-[10px] text-slate-500">clés communes</div>
                            </div>
                        <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center"><div class="text-lg font-black text-amber-700">${r.onlyA.toLocaleString('fr-FR')}</div>
                            <div class="text-[10px] text-slate-500">seulement dans A</div>
                            </div>
                        <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center"><div class="text-lg font-black text-amber-700">${r.onlyB.toLocaleString('fr-FR')}</div>
                            <div class="text-[10px] text-slate-500">seulement dans B</div>
                            </div>
                    </div>${r.onlyA || r.onlyB ? `<p class="text-[11px] text-amber-700 mt-2 font-bold">⚠ ${(r.onlyA + r.onlyB).toLocaleString('fr-FR')} orphelin(s) : des clés ne se retrouvent pas des deux côtés.</p>` : '<p class="text-[11px] text-emerald-700 mt-2 font-bold">✔ Toutes les clés se recoupent des deux côtés.</p>'}`
                            : ''
                    }
                </div>`;
            }
            return html;
        }
        function renderGovHistory() {
            const h = state.governance.qualityHistory;
            if (!h.length)
                return '<p class="text-sm text-slate-400 italic py-8 text-center">Aucun audit enregistré. Lancez un audit dans l\'onglet Qualité : chaque exécution est historisée ici.</p>';

            // Comparaison d'évolution : les deux derniers audits de la table sélectionnée, colonne par colonne.
            const tablesInHist = Array.from(new Set(h.map(e => e.table)));
            if (!govState.histTable || !tablesInHist.includes(govState.histTable)) govState.histTable = tablesInHist[0];
            const audits = h.filter(e => e.table === govState.histTable && e.columnsSummary);
            let compareHtml = '';
            if (audits.length >= 2) {
                const [last, prev] = [audits[0], audits[1]];
                const allCols = Array.from(new Set([...Object.keys(last.columnsSummary), ...Object.keys(prev.columnsSummary)]));
                const deltaRows = allCols
                    .map(cn => {
                        const a = prev.columnsSummary[cn],
                            b = last.columnsSummary[cn];
                        if (!a || !b)
                            return `<tr><td class="p-2 text-xs font-bold">${escapeHTML(cn)}</td><td class="p-2 text-xs text-slate-400" colspan="3">${!a ? 'nouvelle colonne' : 'colonne disparue'}</td>
                                </tr>`;
                        const d = +(b.comp - a.comp).toFixed(1);
                        const arrow =
                            d > 0
                                ? `<span class="text-emerald-600 font-bold">▲ +${d}</span>`
                                : d < 0
                                  ? `<span class="text-red-600 font-bold">▼ ${d}</span>`
                                  : '<span class="text-slate-300">=</span>';
                        const dDist = b.distinct - a.distinct;
                        const patChanged =
                            a.pattern && b.pattern && a.pattern !== b.pattern
                                ? `<span class="text-purple-600 font-bold" title="${escapeHTML(a.pattern)} → ${escapeHTML(b.pattern)}">format modifié</span>`
                                : '';
                        return `<tr class="hover:bg-slate-50"><td class="p-2 text-xs font-bold">${escapeHTML(cn)}</td><td class="p-2 text-xs text-right">${a.comp}% → ${b.comp}% ${arrow}</td>
                            <td class="p-2 text-xs text-right">${dDist === 0 ? '=' : (dDist > 0 ? '+' : '') + dDist.toLocaleString('fr-FR')}</td>
                            <td class="p-2 text-xs">${patChanged}</td>
                            </tr>`;
                    })
                    .join('');
                compareHtml = `<div class="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 mb-4">
                    <div class="text-xs font-bold text-indigo-900 mb-2">📊 Évolution de "${escapeHTML(govState.histTable)}" — ${new Date(prev.ts).toLocaleString('fr-FR')} → ${new Date(last.ts).toLocaleString('fr-FR')}</div>
                    <div class="grid grid-cols-3 gap-3 mb-3 text-center">
                        <div class="bg-white border rounded-lg p-2"><div class="text-[9px] uppercase font-bold text-slate-400">Lignes</div>
                        <div class="text-sm font-black">${prev.rows.toLocaleString('fr-FR')} → ${last.rows.toLocaleString('fr-FR')}</div>
                            </div>
                        <div class="bg-white border rounded-lg p-2"><div class="text-[9px] uppercase font-bold text-slate-400">Complétude moy.</div>
                            <div class="text-sm font-black ${last.avgCompleteness >= prev.avgCompleteness ? 'text-emerald-600' : 'text-red-600'}">${prev.avgCompleteness}% → ${last.avgCompleteness}%</div>
                            </div>
                        <div class="bg-white border rounded-lg p-2"><div class="text-[9px] uppercase font-bold text-slate-400">Doublons</div>
                            <div class="text-sm font-black ${last.duplicates <= prev.duplicates ? 'text-emerald-600' : 'text-red-600'}">${prev.duplicates.toLocaleString('fr-FR')} → ${last.duplicates.toLocaleString('fr-FR')}</div>
                            </div>
                    </div>
                    <div class="border border-slate-200 rounded-lg overflow-x-auto bg-white max-h-64 overflow-y-auto custom-scrollbar"><table class="w-full text-left"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 sticky top-0"><tr><th class="p-2">Colonne</th>
                            <th class="p-2 text-right">Complétude</th>
                            <th class="p-2 text-right">Δ distinctes</th>
                                <th class="p-2">Format</th>
                                </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">${deltaRows}</tbody>
                        </table>
                                </div>
                </div>`;
            } else if (audits.length === 1) {
                compareHtml = `<p class="text-xs text-slate-400 mb-4">Un seul audit enregistré pour "${escapeHTML(govState.histTable)}" — relancez un audit plus tard pour voir l'évolution colonne par colonne.</p>`;
            }

            const rows = h
                .map(
                    e =>
                        `<tr class="hover:bg-slate-50"><td class="p-2.5 text-xs text-slate-500 whitespace-nowrap">${new Date(e.ts).toLocaleString('fr-FR')}</td>
                            <td class="p-2.5 text-sm font-bold text-slate-700">${escapeHTML(e.table)}</td>
                            <td class="p-2.5 text-xs">${escapeHTML(e.col)}</td>
                            <td class="p-2.5 text-xs text-right">${e.rows.toLocaleString('fr-FR')}</td>
                            <td class="p-2.5 text-xs text-right font-bold ${e.avgCompleteness >= 95 ? 'text-emerald-600' : e.avgCompleteness >= 75 ? 'text-amber-600' : 'text-red-600'}">${e.avgCompleteness}%</td>
                            <td class="p-2.5 text-xs text-right">${e.density}%</td>
                            <td class="p-2.5 text-xs text-right">${e.duplicates.toLocaleString('fr-FR')}</td>
                            </tr>`
                )
                .join('');
            return `<div class="flex justify-between items-center mb-3 flex-wrap gap-2">
                    <div class="flex items-center gap-2"><p class="text-sm text-slate-500">Comparer l'évolution de :</p>
                <select onchange="govState.histTable=this.value; renderGovernance()" class="border border-slate-300 p-1.5 rounded text-xs bg-white font-bold">${tablesInHist.map(t2 => `<option ${t2 === govState.histTable ? 'selected' : ''}>${escapeHTML(t2)}</option>`).join('')}</select></div>
                    <button onclick="state.governance.qualityHistory=[]; persistQualityHistory(); persistAppState(); renderGovernance()" class="text-xs text-red-500 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50">Vider l'historique</button>
                </div>
                ${compareHtml}
                <div class="border border-slate-200 rounded-lg overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-500"><tr><th class="p-2.5">Date</th>
                    <th class="p-2.5">Table</th>
                    <th class="p-2.5">Colonne</th>
                    <th class="p-2.5 text-right">Lignes</th>
                    <th class="p-2.5 text-right">Complétude moy.</th>
                    <th class="p-2.5 text-right">Densité</th>
                    <th class="p-2.5 text-right">Doublons</th>
                    </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">${rows}</tbody>
                    </table>
                        </div>`;
        }
