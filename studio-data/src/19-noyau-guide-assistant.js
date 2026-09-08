        /* ==================== GUIDE PAS À PAS SUR L'ÉCRAN RÉEL ====================
           Première version de l'assistant : un formulaire dans une fenêtre, qui refaisait les
           écrans en plus simple. Verdict de l'utilisateur : inutile — et il avait raison, car en
           sortant de la fenêtre on n'avait toujours pas appris où sont les commandes.
           Le guide fait l'inverse : il se déroule SUR les écrans eux-mêmes. À chaque étape, il
           surligne l'endroit précis où cliquer, dit quoi faire, et rend TOUT LE RESTE de
           l'application non cliquable (quatre panneaux sombres autour de la zone active). Il
           observe l'état réel — table choisie, colonne ajoutée, règle créée, exécution faite —
           et n'avance que quand l'action est réellement accomplie. À la fin, l'utilisateur a
           produit un vrai résultat avec les vraies commandes, qu'il saura retrouver seul. */
        let guideState = null;
        const GUIDE_Z = 80;
        function guideRail(phase, idx) {
            const g = document.querySelector(`.v7-grp[data-phase="${phase}"]`);
            if (g) g.classList.add('open');
            const its = g ? g.querySelectorAll('.v7-it') : [];
            return its[idx] || null;
        }
        const GUIDE_FLOWS = {
            extract: {
                done: 'Guide terminé : votre extraction est lancée. Vous venez d’utiliser les vraies commandes de l’écran « Extraire » — elles seront au même endroit la prochaine fois.',
                steps: [
                    { skipIf: () => wizReadyTables().length > 0,
                      target: () => guideRail('data', 1),
                      text: 'Tout part d’une source. Cliquez sur <b>📥 Sources</b> pour ouvrir l’écran de chargement.',
                      until: () => currentTab === 1 },
                    { skipIf: () => wizReadyTables().length > 0,
                      target: () => el('step-1'),
                      text: 'Déposez un fichier <b>CSV ou Excel</b> dans la zone de chargement (ou cliquez-la pour choisir un fichier). Tout reste sur votre poste : aucune donnée ne quitte votre machine.',
                      until: () => wizReadyTables().length > 0 },
                    { target: () => guideRail('etl', 0),
                      text: 'Ouvrez maintenant l’écran <b>⚗️ Extraire</b> : cliquez ici.',
                      until: () => currentTab === 3 },
                    { target: () => el('baseTableSelect'),
                      text: 'Choisissez ici la <b>table de départ</b> : celle dont les lignes formeront votre fichier de sortie.',
                      next: true },
                    { target: () => { const n = el('adv-col-tbl'); return n ? n.closest('div') : null; },
                      text: 'Ajoutez les <b>colonnes</b> à sortir : choisissez une colonne puis cliquez <b>+ Ajouter</b> — ou <b>Tout ajouter</b> pour prendre toute la table. J’attends qu’au moins une colonne soit ajoutée.',
                      until: () => (state.advExtract.columns || []).length > 0 },
                    { target: () => { const n = el('adv-flt-tbl'); return n ? n.closest('div') : null; },
                      text: 'Facultatif : posez un <b>filtre</b> pour ne garder qu’une partie des lignes (ex. VILLE = PARIS). Sans filtre, tout est extrait. Cliquez « Étape suivante » quand c’est bon.',
                      next: true },
                    { target: () => el('step-3') && el('step-3').querySelector('[onclick="advPreview()"]'),
                      text: 'Avant de lancer : cliquez <b>👁️ Prévisualiser</b> pour voir les 20 premières lignes réelles du résultat. « Compter » donne le nombre de lignes exact.',
                      until: () => { const b = el('adv-preview'); return !!(b && b.children.length); } },
                    { target: () => el('adv-generate'),
                      text: 'Tout est prêt : cliquez <b>Générer</b> pour produire le fichier complet. Vous pourrez aussi enregistrer cette configuration comme <b>paramétrage</b> pour la rejouer plus tard.',
                      next: true, nextLabel: 'Terminer le guide' },
                ] },
            quality: {
                done: 'Guide terminé : votre premier contrôle tourne. Créez-en d’autres de la même façon — chaque type de règle est expliqué par l’aide « ? » de la colonne Type.',
                steps: [
                    { skipIf: () => wizReadyTables().length > 0,
                      target: () => guideRail('data', 1),
                      text: 'Un contrôle s’exécute sur une source. Cliquez sur <b>📥 Sources</b> pour en charger une.',
                      until: () => currentTab === 1 },
                    { skipIf: () => wizReadyTables().length > 0,
                      target: () => el('step-1'),
                      text: 'Déposez un fichier <b>CSV ou Excel</b> dans la zone de chargement. Tout reste sur votre poste.',
                      until: () => wizReadyTables().length > 0 },
                    { target: () => guideRail('quality', 1),
                      text: 'Ouvrez l’écran <b>📏 Règles &amp; score</b> : cliquez ici.',
                      until: () => currentTab === 12 },
                    { pre: (d) => { d.n0 = qrRules().length; },
                      target: () => el('step-12') && el('step-12').querySelector('[onclick="qrAdd()"]'),
                      text: 'Créez votre première règle : cliquez <b>+ Règle</b>. Une ligne vide apparaîtra dans le tableau.',
                      until: (d) => { if (qrRules().length > d.n0) { d.newId = qrRules()[qrRules().length - 1].id; return true; } return false; } },
                    { target: (d) => { const n = el('qrContent') && el('qrContent').querySelector(`[onchange*="${d.newId}"]`); return n ? n.closest('tr') : null; },
                      text: 'Voici votre règle. Sur cette ligne : donnez-lui un <b>nom</b>, choisissez la <b>table</b> (ou un objet métier), la <b>colonne</b> à contrôler, puis le <b>type</b> de contrôle — « Non vide » est le plus simple pour commencer. Le « ? » explique chaque type. J’attends que la table soit choisie.',
                      until: (d) => { const r = qrRules().find(x => x.id === d.newId); return !!(r && (r.table || r.bo)); } },
                    { target: (d) => { const n = el('qrContent') && el('qrContent').querySelector(`[onchange*="${d.newId}"]`); return n ? n.closest('tr') : null; },
                      text: 'Réglez la <b>criticité</b> : c’est le poids de cette règle dans le score global (une règle Critique pèse 5 fois plus qu’une Faible). Cliquez « Étape suivante » quand la ligne vous convient.',
                      next: true },
                    { target: () => el('step-12') && el('step-12').querySelector('[onclick="qrRun(this)"]'),
                      text: 'Cliquez <b>▶ Exécuter</b> : la règle est évaluée sur vos données réelles, ligne par ligne.',
                      until: (d) => { const r = qrRules().find(x => x.id === d.newId); return !!(r && r.last); } },
                    { target: () => el('qrContent'),
                      text: 'Résultat : le <b>score</b> pondéré par la criticité, et pour chaque règle son taux de conformité. Un échec n’est pas forcément une erreur de donnée — c’est un écart entre la règle et la réalité ; « 🔍 inspecter » montre les lignes fautives une à une.',
                      next: true, nextLabel: 'Terminer le guide' },
                ] },
        };
        function guideStart(kind) {
            const ov = el('wizOverlay'); if (ov) ov.classList.add('hidden');
            guideStop();
            guideState = { kind, idx: -1, data: {} };
            guideNext();
            guideState.timer = setInterval(guideTick, 300);
        }
        function guideStop(msg) {
            if (guideState && guideState.timer) clearInterval(guideState.timer);
            guideState = null;
            ['gdB0', 'gdB1', 'gdB2', 'gdB3', 'gdRing', 'gdTip'].forEach(id => { const n = el(id); if (n) n.remove(); });
            if (msg) showSuccess(msg);
        }
        function guideFlowSteps() { return GUIDE_FLOWS[guideState.kind].steps; }
        function guideNext() {
            if (!guideState) return;
            const steps = guideFlowSteps();
            let i = guideState.idx + 1;
            while (i < steps.length && steps[i].skipIf && steps[i].skipIf()) i++;
            if (i >= steps.length) { const m = GUIDE_FLOWS[guideState.kind].done; return guideStop(m); }
            guideState.idx = i;
            try { if (steps[i].pre) steps[i].pre(guideState.data); } catch (e) { }
            guidePlace(true);
        }
        function guideTick() {
            if (!guideState) return;
            const st = guideFlowSteps()[guideState.idx];
            if (st.until) {
                let done = false;
                try { done = !!st.until(guideState.data); } catch (e) { }
                if (done) return guideNext();
            }
            guidePlace(false);
        }
        function guideEls() {
            const mk = (id, cls) => {
                let n = el(id);
                if (!n) { n = document.createElement('div'); n.id = id; n.className = cls; document.body.appendChild(n); }
                return n;
            };
            return {
                b: [mk('gdB0', 'gd-blk'), mk('gdB1', 'gd-blk'), mk('gdB2', 'gd-blk'), mk('gdB3', 'gd-blk')],
                ring: mk('gdRing', 'gd-ring'), tip: mk('gdTip', 'gd-tip'),
            };
        }
        function guidePlace(fresh) {
            if (!guideState) return;
            const steps = guideFlowSteps(), st = steps[guideState.idx];
            let t = null; try { t = st.target ? st.target(guideState.data) : null; } catch (e) { }
            const { b, ring, tip } = guideEls();
            const W = window.innerWidth, H = window.innerHeight, PAD = 6;
            let r = null;
            if (t && t.getBoundingClientRect) {
                r = t.getBoundingClientRect();
                // cible hors de vue : on l'y amène (une seule fois par étape, pas à chaque tic)
                if (fresh && (r.top < 0 || r.bottom > H)) { try { t.scrollIntoView({ block: 'center' }); } catch (e) { } r = t.getBoundingClientRect(); }
            }
            const set = (n, x, y, w, h) => { n.style.left = x + 'px'; n.style.top = y + 'px'; n.style.width = Math.max(0, w) + 'px'; n.style.height = Math.max(0, h) + 'px'; n.style.display = 'block'; };
            if (r && r.width > 0) {
                const x0 = Math.max(0, r.left - PAD), y0 = Math.max(0, r.top - PAD),
                      x1 = Math.min(W, r.right + PAD), y1 = Math.min(H, r.bottom + PAD);
                set(b[0], 0, 0, W, y0);                    // dessus
                set(b[1], 0, y1, W, H - y1);               // dessous
                set(b[2], 0, y0, x0, y1 - y0);             // gauche
                set(b[3], x1, y0, W - x1, y1 - y0);        // droite
                set(ring, x0, y0, x1 - x0, y1 - y0);
                // bulle : sous la cible si la place y est, sinon au-dessus
                tip.style.display = 'block';
                const tw = Math.min(380, W - 24);
                tip.style.width = tw + 'px';
                tip.style.left = Math.max(12, Math.min(W - tw - 12, x0)) + 'px';
                if (fresh || !tip.dataset.step || tip.dataset.step !== String(guideState.idx)) guideTipFill(tip, st, steps);
                const th = tip.offsetHeight;
                tip.style.top = (y1 + 10 + th <= H ? y1 + 10 : Math.max(12, y0 - th - 10)) + 'px';
            } else {
                // cible introuvable : voile complet + bulle centrée, avec de quoi avancer quand même
                set(b[0], 0, 0, W, H); [b[1], b[2], b[3], ring].forEach(n => n.style.display = 'none');
                tip.style.display = 'block';
                const tw = Math.min(380, W - 24);
                tip.style.width = tw + 'px';
                if (fresh || tip.dataset.step !== String(guideState.idx)) guideTipFill(tip, st, steps);
                tip.style.left = (W - tw) / 2 + 'px';
                tip.style.top = Math.max(12, (H - tip.offsetHeight) / 2) + 'px';
            }
        }
        function guideTipFill(tip, st, steps) {
            tip.dataset.step = String(guideState.idx);
            const visible = steps.filter(s2 => !(s2.skipIf && s2.skipIf()));
            const pos = visible.indexOf(st) + 1 || guideState.idx + 1;
            tip.innerHTML = `
                <div class="gd-tip-head">Étape ${pos} / ${visible.length}</div>
                <div class="gd-tip-body">${st.text}</div>
                <div class="gd-tip-foot">
                    ${st.next ? `<button onclick="guideNext()" class="gd-btn-main">${st.nextLabel || 'Étape suivante →'}</button>`
                              : `<span class="gd-wait">⏳ j’attends votre action…</span><button onclick="guideNext()" class="gd-btn-skip" title="Avancer sans faire cette étape">Passer</button>`}
                    <button onclick="guideStop()" class="gd-btn-quit">Quitter le guide</button>
                </div>`;
        }

        // ---- Point d'entrée : le petit menu de l'assistant lance les guides ----
        function wizReadyTables() { return Object.values(state.tables).filter(t => t.status === 'ready'); }
        function wizOpen(kind) {
            state.wizSeen = true; try { persistAppState(); } catch (e) { }
            if (kind === 'extract' || kind === 'quality') return guideStart(kind);
            const ov = el('wizOverlay'); if (!ov) return;
            ov.classList.remove('hidden');
            el('wizTitle').textContent = '🧭 Par où commencer ?';
            el('wizSub').textContent = 'Deux guides pas à pas, sur les écrans réels : le guide surligne où cliquer, le reste devient non cliquable, et il avance quand l’action est faite.';
            el('wizSteps').innerHTML = '';
            el('wizBody').innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button onclick="wizOpen('extract')" class="text-left border border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50 rounded-xl p-4">
                        <div class="text-sm font-black text-indigo-800 mb-1">⚗️ Extraire des données</div>
                        <p class="text-[11.5px] text-slate-600">De la source au fichier de sortie : table de départ, colonnes, filtre, aperçu réel, génération — chaque étape montrée à l’endroit exact où elle se fait.</p>
                    </button>
                    <button onclick="wizOpen('quality')" class="text-left border border-amber-200 bg-amber-50/40 hover:bg-amber-50 rounded-xl p-4">
                        <div class="text-sm font-black text-amber-800 mb-1">✅ Contrôler la qualité</div>
                        <p class="text-[11.5px] text-slate-600">Créer une première règle, la régler, l’exécuter sur les données réelles et lire le score — directement dans l’écran « Règles &amp; score ».</p>
                    </button>
                </div>
                <p class="text-[11px] text-slate-400 mt-3">Le guide n’a pas d’écran à lui : il vous fait utiliser les vraies commandes, que vous saurez retrouver seul ensuite. Quittable à tout moment, rien n’est perdu.</p>`;
            el('wizFoot').innerHTML = `<button onclick="wizClose()" class="ml-auto text-sm bg-white border border-slate-300 px-3 py-2 rounded-lg font-bold">Fermer</button>`;
            try { v7WatchIcons(); } catch (e) { }
        }
        function wizClose() { const ov = el('wizOverlay'); if (ov) ov.classList.add('hidden'); }
        // Amorce : sur un outil vide, l'assistant se propose de lui-même — une seule fois.
        function wizMaybeAutoOpen() {
            if (state.wizSeen) return false;
            if (wizReadyTables().length || (state.governance.qualityRules || []).length) return false;
            wizOpen('menu'); return true;
        }

