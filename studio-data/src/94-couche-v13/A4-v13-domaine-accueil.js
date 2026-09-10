        // ======================= V13 : MON DOMAINE, ACCUEIL SIMPLE, TÂCHES, MOTS DU MÉTIER, CORRECTION PROPOSÉE =======================
        function v13Dom() {
            return (v13State.domain || '').trim();
        }
        function v13SetDom(d) {
            v13State.domain = d || '';
            v13Save();
            v13DomBtn();
            renderGovernance();
        }
        function v13DomBtn() {
            let w = el('v13Dom');
            const doms = typeof govDomains === 'function' ? govDomains() : [];
            if (!w) {
                const host = el('v11Hist') && el('v11Hist').parentNode;
                if (!host) return;
                w = document.createElement('span');
                w.id = 'v13Dom';
                w.className = 'v13-dom';
                w.setAttribute('data-ro', 'keep');
                host.insertBefore(w, el('v11Hist').nextSibling);
            }
            const cur = v13Dom();
            w.className = 'v13-dom' + (cur ? ' on' : '');
            w.style.display = currentTab === 9 ? '' : 'none';
            w.innerHTML = `<span title="Ne montrer que ce qui concerne mon domaine">Mon domaine</span><select onchange="v13SetDom(this.value)"><option value="">Tous</option>${doms.map(d => `<option value="${escapeHTML(d)}" ${d === cur ? 'selected' : ''}>${escapeHTML(d)}</option>`).join('')}</select>`;
        }
        function v13InDom(d) {
            const cur = v13Dom();
            return !cur || !String(d || '').trim() || String(d).trim() === cur;
        }
        function v13ApplyDom() {
            const govContentElement = el('govContent');
            const cur = v13Dom();
            if (!govContentElement) return;
            let hidden = 0;
            (state.governance.businessObjects || []).forEach(bo => {
                if (v13InDom(bo.domain)) return;
                govContentElement
                    .querySelectorAll(
                        `button[onclick^="govState.selectedBoId='${bo.id}'"], .v11-row[onclick="v11GoBo('${bo.id}')"]`
                    )
                    .forEach(x => {
                        x.style.display = 'none';
                        hidden++;
                    });
            });
            (state.governance.assets || []).forEach(a => {
                if (v13InDom(a.domain)) return;
                const x = el('v11-as-' + a.id);
                if (x) {
                    x.style.display = 'none';
                    hidden++;
                }
            });
            (state.governance.glossary || []).forEach(t => {
                if (v13InDom(t.domain)) return;
                const x = el('gl-card-' + t.id);
                if (x) {
                    x.style.display = 'none';
                    hidden++;
                }
            });
            if (cur && hidden && !govContentElement.querySelector('.v13-domband')) {
                const band = document.createElement('div');
                band.className = 'v13-domband';
                band.setAttribute('data-ro', 'keep');
                band.innerHTML = `Vue <b>Mon domaine : ${escapeHTML(cur)}</b> — ${hidden} élément(s) d'autres domaines masqué(s).<a onclick="v13SetDom('')">Tout afficher</a>`;
                const help = govContentElement.querySelector('.v13-help');
                if (help) help.insertAdjacentElement('afterend', band);
                else govContentElement.insertAdjacentElement('afterbegin', band);
            }
        }
        Studio.extend(
            'renderGovernance',
            base =>
                function () {
                    const result = base.apply(this, arguments);
                    try {
                        v13DomBtn();
                        v13ApplyDom();
                    } catch (e) {}
                    return result;
                }
        );
        Studio.extend(
            'switchTab',
            base =>
                function () {
                    const result = base.apply(this, arguments);
                    try {
                        v13DomBtn();
                    } catch (e) {}
                    return result;
                }
        );
        // ---- tâches ----
        function v13Tasks() {
            const governance = state.governance;
            const bos = (governance.businessObjects || []).filter(bo => v13InDom(bo.domain));
            const out = [];
            const noOwner = bos.filter(bo => !(bo.globalOwner || '').trim());
            if (noOwner.length)
                out.push({ n: noOwner.length, l: 'objet(s) sans responsable', go: `v11GoBo('${noOwner[0].id}')` });
            const noDef = [];
            bos.forEach(bo =>
                (boAllAttrRows(bo) || []).forEach(r => {
                    if (!(r.el.definition || '').trim()) noDef.push({ bo, r });
                })
            );
            if (noDef.length)
                out.push({
                    n: noDef.length,
                    l: 'information(s) sans définition',
                    go: `v11EditAttr('${noDef[0].bo.id}','${noDef[0].r.stId || ''}','${noDef[0].r.el.id}')`
                });
            const noSrc = [];
            bos.forEach(bo =>
                (boAllAttrRows(bo) || []).forEach(r => {
                    if (!(typeof boAttrHasMap === 'function' ? boAttrHasMap(r) : (r.el.mappings || []).length))
                        noSrc.push({ bo, r });
                })
            );
            if (noSrc.length)
                out.push({
                    n: noSrc.length,
                    l: "information(s) dont on ne sait pas d'où elles viennent",
                    go: `v11EditAttr('${noSrc[0].bo.id}','${noSrc[0].r.stId || ''}','${noSrc[0].r.el.id}')`
                });
            const noUse = [];
            bos.forEach(bo =>
                (boAllAttrRows(bo) || []).forEach(r => {
                    if (!(r.el.usedBy || []).length) noUse.push({ bo, r });
                })
            );
            if (noUse.length)
                out.push({
                    n: noUse.length,
                    l: 'information(s) dont personne ne dit se servir',
                    go: `v11EditAttr('${noUse[0].bo.id}','${noUse[0].r.stId || ''}','${noUse[0].r.el.id}')`
                });
            const pend =
                typeof govFeatureOn === 'function' && govFeatureOn() && typeof propCountPendingFor === 'function'
                    ? propCountPendingFor()
                    : 0;
            if (pend) out.push({ n: pend, l: 'proposition(s) à valider', go: `openGovTab('review')` });
            return out;
        }
        // ---- accueil ----
        Studio.extend(
            'v11HomeHtml',
            base =>
                function () {
                    let h = base.apply(this, arguments);
                    try {
                        const governance = state.governance;
                        const bos = governance.businessObjects || [];
                        const empty = !bos.length && !(governance.glossary || []).length;
                        const tables = Object.values(state.tables).filter(t => t.status === 'ready');
                        if (empty) {
                            const first = `<div class="v13-first" data-ro="keep">
                        <button onclick="v13ProposeOpen()"><span class="ic">✨</span><b>Décrire un objet</b><span>${tables.length ? "à partir d'un fichier chargé ou d'un modèle — l'application propose, vous validez" : "à partir d'un modèle (Client, Contrat…) ou d'un fichier que vous chargerez"}</span></button>
                        <button onclick="v11PaletteOpen()"><span class="ic">🔍</span><b>Chercher</b><span>un mot, une donnée, une application — partout dans l\'application</span></button>
                        <button onclick="openGovTab('flow')"><span class="ic">🕸️</span><b>Voir qui utilise quoi</b><span>le parcours de la donnée, de l\'application au rapport</span></button></div>`;
                            const i = h.indexOf('<div class="flex flex-wrap gap-2 mb-5"');
                            h = i >= 0 ? h.slice(0, i) + first + h.slice(i) : first + h;
                            return h;
                        }
                        const tasks = v13Tasks();
                        const words = (governance.glossary || []).filter(t => v13InDom(t.domain)).slice(0, 8);
                        const wordsHtml = `<div class="v11-card half v13-words"><div class="t">📖 Les mots du métier <span class="n">${(governance.glossary || []).length}</span></div>${
                            words.length
                                ? words
                                      .map(t => {
                                          const n = (t.attrLinks || []).length + (t.boIds || []).length;
                                          return `<div class="w"><b onclick="termTagOpen('${t.id}')">${escapeHTML(t.term)}</b><span>${escapeHTML(t.definition || 'pas encore de définition')}</span>${n ? `<a onclick="termTagOpen('${t.id}')">voir les données concernées (${n})</a>` : ''}</div>`;
                                      })
                                      .join('') +
                                  `<div class="mt-2"><button class="v11-btn sm" onclick="openGovTab('glossary')">Tout le glossaire ›</button></div>`
                                : '<div class="v11-val">Aucun mot défini. <button class="v11-btn sm" onclick="openGovTab(\'glossary\')">Ajouter le premier mot</button></div>'
                        }</div>`;
                        const tasksHtml = `<div class="v11-card half v13-tasks"><div class="t">✅ Mes tâches${v13Dom() ? ' <span class="n">' + escapeHTML(v13Dom()) + '</span>' : ''}</div>${tasks.length ? tasks.map(t => `<div class="v11-row" onclick="${t.go}"><span>${escapeHTML(t.l)}</span><span class="n">${t.n}</span></div>`).join('') : '<div class="v11-val" style="color:#16a34a;font-weight:700">✓ Rien à faire : tout est décrit.</div>'}</div>`;
                        const q = v13QuestionHtml();
                        const i = h.indexOf('<div class="v11-home">');
                        if (i >= 0)
                            h =
                                h.slice(0, i) +
                                q +
                                '<div class="v11-home">' +
                                tasksHtml +
                                wordsHtml +
                                h.slice(i + '<div class="v11-home">'.length);
                        else h = q + h;
                    } catch (e) {
                        console.warn('v13 accueil', e);
                    }
                    return h;
                }
        );
        // ---- proposer une correction depuis une fiche en lecture ----
        function v13FixOpen(kind, id) {
            const ent =
                kind === 'bo'
                    ? (state.governance.businessObjects || []).find(b => b.id === id)
                    : kind === 'term'
                      ? (state.governance.glossary || []).find(t => t.id === id)
                      : assetById(id);
            if (!ent) return;
            const name = ent.name || ent.term || '';
            const field = kind === 'asset' ? 'description' : 'definition';
            const cur = ent[field] || '';
            v11ModalOpen(`<div class="v13-prop"><div class="flex items-start justify-between gap-3"><div><h3>💬 Proposer une correction</h3><p class="text-xs" style="color:var(--v7-muted);margin:4px 0 0">Sur « ${escapeHTML(name)} ». Écrivez ce qui ne va pas ou la bonne formulation : rien n'est modifié tant que le responsable n'a pas validé.</p>
                </div>
                <button class="v11-btn sm" onclick="v11ModalClose()">✕</button></div>
                <div class="mt-3"><div class="text-[10.5px] font-black uppercase" style="color:var(--v7-muted)">${field === 'definition' ? 'Définition' : 'Description'} actuelle</div>
                    <div class="text-[12.5px]" style="color:var(--v7-txt-2)">${cur ? escapeHTML(cur) : '<i>vide</i>'}</div>
                    </div>
                <div class="mt-3"><div class="text-[10.5px] font-black uppercase" style="color:var(--v7-muted)">Votre proposition</div>
                        <textarea id="v13FixTxt" placeholder="ex. La définition est trop vague : un client est une personne ou une société ayant au moins un contrat en cours."></textarea></div>
                <div class="foot"><button class="v11-btn" onclick="v11ModalClose()">Annuler</button><button class="v11-btn pri" onclick="v13FixSend('${kind}','${id}')">Envoyer au responsable</button></div>
                    </div>`);
        }
        function v13FixSend(kind, id) {
            const txt = ((el('v13FixTxt') || {}).value || '').trim();
            if (!txt) return showError('Écrivez votre proposition.');
            const ent =
                kind === 'bo'
                    ? (state.governance.businessObjects || []).find(b => b.id === id)
                    : kind === 'term'
                      ? (state.governance.glossary || []).find(t => t.id === id)
                      : assetById(id);
            if (!ent) return;
            const name = ent.name || ent.term || '';
            const field = kind === 'asset' ? 'description' : 'definition';
            const dom = String(ent.domain || '').trim();
            const target = kind === 'bo' ? { boId: id } : kind === 'term' ? { termId: id } : { assetId: id };
            v11ModalClose();
            if (typeof govPropose === 'function')
                govPropose({
                    kind,
                    domain: dom,
                    target,
                    field,
                    label: 'Correction proposée sur « ' + name + ' »',
                    before: ent[field] || '',
                    after: txt,
                    comment: 'Proposée depuis la fiche en lecture'
                });
            else {
                ent[field] = txt;
                persistAppState();
                renderGovernance();
                v11Toast('Correction appliquée.', 'ok');
            }
        }
        Studio.extend(
            'v11Acts',
            base =>
                function (kind, id, ent, extra) {
                    const out = base.apply(this, arguments);
                    try {
                        if (['bo', 'term', 'asset'].includes(kind))
                            out.push(
                                `<button class="v11-btn" onclick="v13FixOpen('${kind}','${id}')" title="Signaler une erreur ou proposer une meilleure formulation ; le responsable valide">💬 Proposer une correction</button>`
                            );
                    } catch (e) {}
                    return out;
                }
        );
        // ---- objets : bouton « proposer depuis un fichier » ----
        Studio.extend(
            'renderGovernance',
            base =>
                function () {
                    const result = base.apply(this, arguments);
                    try {
                        if (govState.tab === 'objects') {
                            const govContentElement = el('govContent');
                            const element =
                                govContentElement &&
                                Array.from(govContentElement.querySelectorAll('button')).find(
                                    x => /Nouvel objet|\+ Objet/.test(x.textContent) && !x.dataset.v13
                                );
                            if (element) {
                                element.dataset.v13 = '1';
                                element.insertAdjacentHTML(
                                    'afterend',
                                    ' <button data-ro="keep" class="v11-btn pri sm" onclick="v13ProposeOpen()" title="L\'application propose l\'objet et ses informations depuis un fichier ou un modèle">✨ Décrire depuis un fichier / modèle</button>'
                                );
                            }
                        }
                    } catch (e) {}
                    return result;
                }
        );
        setTimeout(() => {
            try {
                v13DomBtn();
            } catch (e) {}
        }, 0);
        Object.assign(V11_LEXIQUE, {
            'mon domaine': 'Filtre qui ne montre que les objets, informations, applications et mots de votre domaine métier.',
            'proposer une correction':
                'Depuis une fiche en lecture : écrire ce qui ne va pas ; le responsable du domaine valide avant que quoi que ce soit change.'
        });
